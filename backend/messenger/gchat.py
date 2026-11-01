from push import send_push

MAX_MEMBERS = 200
MAX_CIPHER = 60000


def _members(cur, S, gid, online_seconds):
    cur.execute(
        f"""SELECT u.id, u.name, u.phone, u.status, u.last_seen, u.public_key, m.is_admin,
        (u.last_seen > NOW() - INTERVAL '{online_seconds} seconds') AS online
        FROM {S}.gchat_members m JOIN {S}.users u ON u.id=m.user_id
        WHERE m.gchat_id=%s AND m.active ORDER BY m.joined_at, u.id""",
        (gid,),
    )
    return [{
        "id": r["id"], "name": r["name"], "phone": r["phone"], "status": r["status"] or "",
        "lastSeen": r["last_seen"], "online": bool(r["online"]), "publicKey": r["public_key"],
        "admin": bool(r["is_admin"]),
    } for r in cur.fetchall()]


def _member(cur, S, gid, me):
    cur.execute(
        f"SELECT is_admin FROM {S}.gchat_members WHERE gchat_id=%s AND user_id=%s AND active",
        (gid, me),
    )
    return cur.fetchone()


def list_groups(cur, S, me, online_seconds):
    cur.execute(
        f"""SELECT g.id, g.title, g.created_at,
        (SELECT MAX(x.created_at) FROM {S}.gchat_messages x WHERE x.gchat_id=g.id) AS last_at,
        (SELECT COUNT(*) FROM {S}.gchat_deliveries d JOIN {S}.gchat_messages x ON x.id=d.message_id
           WHERE x.gchat_id=g.id AND d.user_id=%s AND d.read_at IS NULL) AS unread,
        (SELECT COALESCE(MAX(x.id),0) FROM {S}.gchat_messages x WHERE x.gchat_id=g.id AND x.sender_id=%s
           AND NOT EXISTS (SELECT 1 FROM {S}.gchat_deliveries d WHERE d.message_id=x.id AND d.read_at IS NULL)) AS read_upto
        FROM {S}.gchats g JOIN {S}.gchat_members m ON m.gchat_id=g.id AND m.user_id=%s AND m.active""",
        (me, me, me),
    )
    out = []
    for r in cur.fetchall():
        members = _members(cur, S, r["id"], online_seconds)
        out.append({
            "id": -r["id"],
            "group": {"id": r["id"], "title": r["title"], "members": members,
                      "admin": any(x["id"] == me and x["admin"] for x in members)},
            "lastAt": r["last_at"] or r["created_at"],
            "unread": int(r["unread"] or 0),
            "readUpto": int(r["read_upto"] or 0),
        })
    return out


def inbox(cur, S, me):
    cur.execute(
        f"""SELECT x.id, x.gchat_id, x.sender_id, x.sender_key, x.created_at, d.cipher, d.iv
        FROM {S}.gchat_deliveries d JOIN {S}.gchat_messages x ON x.id=d.message_id
        WHERE d.user_id=%s AND d.delivered_at IS NULL AND d.cipher IS NOT NULL ORDER BY x.id LIMIT 200""",
        (me,),
    )
    return [{"id": r["id"], "chatId": -r["gchat_id"], "from": r["sender_id"], "senderKey": r["sender_key"],
             "cipher": r["cipher"], "iv": r["iv"], "at": r["created_at"]} for r in cur.fetchall()]


def ack(cur, S, me, ids, read_group):
    if ids:
        cur.execute(
            f"""UPDATE {S}.gchat_deliveries SET cipher=NULL, iv=NULL, delivered_at=NOW()
            WHERE user_id=%s AND message_id = ANY(%s)""",
            (me, ids),
        )
    if read_group:
        cur.execute(
            f"""UPDATE {S}.gchat_deliveries d SET read_at=NOW() FROM {S}.gchat_messages x
            WHERE x.id=d.message_id AND x.gchat_id=%s AND d.user_id=%s AND d.read_at IS NULL AND d.delivered_at IS NOT NULL""",
            (read_group, me),
        )


def unread_total(cur, S, uid):
    cur.execute(f"SELECT COUNT(*) AS n FROM {S}.gchat_deliveries WHERE user_id=%s AND read_at IS NULL", (uid,))
    return int(cur.fetchone()["n"])


def _ids(raw, me):
    out = []
    for x in (raw or [])[:MAX_MEMBERS]:
        try:
            v = int(x)
        except (TypeError, ValueError):
            continue
        if v != me and v not in out:
            out.append(v)
    return out


def handle(action, body, cur, S, me, resp, err, online_seconds, direct_unread):
    if action == "gchat_create":
        title = str(body.get("title") or "").strip()[:80]
        if len(title) < 1:
            return err(400, "Укажите название группы")
        ids = _ids(body.get("userIds"), me)
        if not ids:
            return err(400, "Добавьте хотя бы одного участника")
        cur.execute(f"SELECT id FROM {S}.users WHERE id = ANY(%s)", (ids,))
        valid = [r["id"] for r in cur.fetchall()]
        cur.execute(f"INSERT INTO {S}.gchats (title, owner_id) VALUES (%s,%s) RETURNING id", (title, me))
        gid = cur.fetchone()["id"]
        cur.execute(f"INSERT INTO {S}.gchat_members (gchat_id, user_id, is_admin) VALUES (%s,%s,TRUE)", (gid, me))
        for uid in valid:
            cur.execute(f"INSERT INTO {S}.gchat_members (gchat_id, user_id) VALUES (%s,%s)", (gid, uid))
        cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
        my_name = cur.fetchone()["name"]
        for uid in valid:
            send_push(cur, S, uid, {"type": "message", "chatId": -gid, "title": title,
                                    "body": f"{my_name} добавил(а) вас в группу"}, ttl=86400, urgency="normal")
        return resp(200, {"chatId": -gid})

    gid = int(body.get("gchatId") or 0)
    m = _member(cur, S, gid, me)
    if not m:
        return err(403, "Вы не участник этой группы")

    if action == "gchat_send":
        sender_key = str(body.get("senderKey") or "")
        items = body.get("items") or []
        if not sender_key or not isinstance(items, list):
            return err(400, "Сообщение должно быть зашифровано")
        cur.execute(f"SELECT user_id FROM {S}.gchat_members WHERE gchat_id=%s AND active AND user_id<>%s", (gid, me))
        allowed = {r["user_id"] for r in cur.fetchall()}
        rows = []
        for it in items[:MAX_MEMBERS]:
            try:
                uid = int(it.get("userId"))
            except (TypeError, ValueError, AttributeError):
                continue
            cipher = str(it.get("cipher") or "")
            iv = str(it.get("iv") or "")
            if uid in allowed and cipher and iv and len(cipher) <= MAX_CIPHER and len(iv) <= 32:
                rows.append((uid, cipher, iv))
        cur.execute(
            f"INSERT INTO {S}.gchat_messages (gchat_id, sender_id, sender_key) VALUES (%s,%s,%s) RETURNING id, created_at",
            (gid, me, sender_key),
        )
        msg = cur.fetchone()
        silent = bool(body.get("silent"))
        for uid, cipher, iv in rows:
            cur.execute(
                f"""INSERT INTO {S}.gchat_deliveries (message_id, user_id, cipher, iv, read_at)
                VALUES (%s,%s,%s,%s, CASE WHEN %s THEN NOW() ELSE NULL END)""",
                (msg["id"], uid, cipher, iv, silent),
            )
        if not silent:
            cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
            my_name = cur.fetchone()["name"]
            cur.execute(f"SELECT title FROM {S}.gchats WHERE id=%s", (gid,))
            title = cur.fetchone()["title"]
            for uid, _, _ in rows:
                badge = unread_total(cur, S, uid) + direct_unread(uid)
                send_push(cur, S, uid, {"type": "message", "chatId": -gid, "badge": badge, "title": title,
                                        "body": f"{my_name}: новое сообщение"}, ttl=86400, urgency="high")
        return resp(200, {"id": msg["id"], "at": msg["created_at"], "delivered": len(rows)})

    if action == "gchat_add":
        if not m["is_admin"]:
            return err(403, "Добавлять участников может только администратор")
        ids = _ids(body.get("userIds"), me)
        cur.execute(f"SELECT COUNT(*) AS n FROM {S}.gchat_members WHERE gchat_id=%s AND active", (gid,))
        if cur.fetchone()["n"] + len(ids) > MAX_MEMBERS:
            return err(400, f"В группе может быть не больше {MAX_MEMBERS} участников")
        cur.execute(f"SELECT title FROM {S}.gchats WHERE id=%s", (gid,))
        title = cur.fetchone()["title"]
        for uid in ids:
            cur.execute(
                f"""INSERT INTO {S}.gchat_members (gchat_id, user_id) VALUES (%s,%s)
                ON CONFLICT (gchat_id, user_id) DO UPDATE SET active=TRUE, joined_at=NOW()""",
                (gid, uid),
            )
            send_push(cur, S, uid, {"type": "message", "chatId": -gid, "title": title,
                                    "body": "Вас добавили в группу"}, ttl=86400, urgency="normal")
        return resp(200, {"members": _members(cur, S, gid, online_seconds)})

    if action == "gchat_remove":
        uid = int(body.get("userId") or 0)
        if not m["is_admin"] or uid == me:
            return err(403, "Удалять участников может только администратор")
        cur.execute(f"UPDATE {S}.gchat_members SET active=FALSE WHERE gchat_id=%s AND user_id=%s", (gid, uid))
        return resp(200, {"members": _members(cur, S, gid, online_seconds)})

    if action == "gchat_rename":
        title = str(body.get("title") or "").strip()[:80]
        if not title:
            return err(400, "Укажите название")
        cur.execute(f"UPDATE {S}.gchats SET title=%s WHERE id=%s", (title, gid))
        return resp(200, {"ok": True})

    if action == "gchat_leave":
        cur.execute(f"UPDATE {S}.gchat_members SET active=FALSE WHERE gchat_id=%s AND user_id=%s", (gid, me))
        cur.execute(
            f"UPDATE {S}.gchat_deliveries d SET cipher=NULL, iv=NULL, read_at=COALESCE(read_at, NOW()), delivered_at=COALESCE(delivered_at, NOW()) "
            f"FROM {S}.gchat_messages x WHERE x.id=d.message_id AND x.gchat_id=%s AND d.user_id=%s",
            (gid, me),
        )
        if m["is_admin"]:
            cur.execute(f"SELECT COUNT(*) AS n FROM {S}.gchat_members WHERE gchat_id=%s AND active AND is_admin", (gid,))
            if cur.fetchone()["n"] == 0:
                cur.execute(
                    f"""UPDATE {S}.gchat_members SET is_admin=TRUE WHERE gchat_id=%s AND user_id=(
                    SELECT user_id FROM {S}.gchat_members WHERE gchat_id=%s AND active ORDER BY joined_at LIMIT 1)""",
                    (gid, gid),
                )
        return resp(200, {"ok": True})

    return err(400, "Неизвестное действие")
