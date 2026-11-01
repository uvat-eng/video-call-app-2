from push import send_push

MAX_MEMBERS = 200
MAX_CIPHER = 60000
HISTORY_PAGE = 300


def _members(cur, S, gid, online_seconds):
    cur.execute(
        f"""SELECT u.id, u.name, u.phone, u.status, u.last_seen, u.public_key, u.avatar, m.is_admin,
        (u.last_seen > NOW() - INTERVAL '{online_seconds} seconds') AS online
        FROM {S}.gchat_members m JOIN {S}.users u ON u.id=m.user_id
        WHERE m.gchat_id=%s AND m.active ORDER BY m.joined_at, u.id""",
        (gid,),
    )
    return [{
        "id": r["id"], "name": r["name"], "phone": r["phone"], "status": r["status"] or "",
        "lastSeen": r["last_seen"], "online": bool(r["online"]), "publicKey": r["public_key"],
        "avatar": r["avatar"], "admin": bool(r["is_admin"]),
    } for r in cur.fetchall()]


def _member(cur, S, gid, me):
    cur.execute(
        f"SELECT is_admin FROM {S}.gchat_members WHERE gchat_id=%s AND user_id=%s AND active",
        (gid, me),
    )
    return cur.fetchone()


def list_groups(cur, S, me, online_seconds):
    cur.execute(
        f"""SELECT g.id, g.title, g.created_at, m.read_upto,
        (SELECT MAX(x.created_at) FROM {S}.gchat_messages x WHERE x.gchat_id=g.id AND NOT x.silent) AS last_at,
        (SELECT COALESCE(MAX(x.id),0) FROM {S}.gchat_messages x WHERE x.gchat_id=g.id AND x.cipher IS NOT NULL) AS last_id,
        (SELECT COUNT(*) FROM {S}.gchat_messages x WHERE x.gchat_id=g.id AND x.id > m.read_upto
           AND x.sender_id<>%s AND NOT x.silent AND x.cipher IS NOT NULL) AS unread,
        (SELECT COALESCE(MIN(o.read_upto),0) FROM {S}.gchat_members o
           WHERE o.gchat_id=g.id AND o.active AND o.user_id<>%s) AS others_read,
        k.cipher AS k_cipher, k.iv AS k_iv, k.sender_key AS k_sender
        FROM {S}.gchats g JOIN {S}.gchat_members m ON m.gchat_id=g.id AND m.user_id=%s AND m.active
        LEFT JOIN {S}.gchat_keys k ON k.gchat_id=g.id AND k.user_id=%s""",
        (me, me, me, me),
    )
    rows = cur.fetchall()
    out = []
    for r in rows:
        members = _members(cur, S, r["id"], online_seconds)
        cur.execute(
            f"""SELECT m.user_id FROM {S}.gchat_members m JOIN {S}.users u ON u.id=m.user_id
            WHERE m.gchat_id=%s AND m.active AND u.public_key IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM {S}.gchat_keys k WHERE k.gchat_id=m.gchat_id AND k.user_id=m.user_id)""",
            (r["id"],),
        )
        need = [x["user_id"] for x in cur.fetchall()]
        out.append({
            "id": -r["id"],
            "group": {
                "id": r["id"], "title": r["title"], "members": members,
                "admin": any(x["id"] == me and x["admin"] for x in members),
                "lastId": int(r["last_id"] or 0),
                "key": {"cipher": r["k_cipher"], "iv": r["k_iv"], "senderKey": r["k_sender"]} if r["k_cipher"] else None,
                "needKey": need,
            },
            "lastAt": r["last_at"] or r["created_at"],
            "unread": int(r["unread"] or 0),
            "readUpto": int(r["others_read"] or 0),
        })
    return out


def mark_read(cur, S, me, gid):
    if not gid:
        return
    cur.execute(
        f"""UPDATE {S}.gchat_members SET read_upto=GREATEST(read_upto,
            (SELECT COALESCE(MAX(id),0) FROM {S}.gchat_messages WHERE gchat_id=%s))
        WHERE gchat_id=%s AND user_id=%s AND active""",
        (gid, gid, me),
    )


def unread_total(cur, S, uid):
    cur.execute(
        f"""SELECT COUNT(*) AS n FROM {S}.gchat_messages x JOIN {S}.gchat_members m
        ON m.gchat_id=x.gchat_id AND m.user_id=%s AND m.active
        WHERE x.id > m.read_upto AND x.sender_id<>%s AND NOT x.silent AND x.cipher IS NOT NULL""",
        (uid, uid),
    )
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


def _store_keys(cur, S, gid, me, sender_key, items):
    cur.execute(f"SELECT user_id FROM {S}.gchat_members WHERE gchat_id=%s AND active", (gid,))
    allowed = {r["user_id"] for r in cur.fetchall()}
    n = 0
    for it in (items or [])[:MAX_MEMBERS + 1]:
        try:
            uid = int(it.get("userId"))
        except (TypeError, ValueError, AttributeError):
            continue
        cipher = str(it.get("cipher") or "")
        iv = str(it.get("iv") or "")
        if uid not in allowed or not cipher or not iv or len(cipher) > 400 or len(iv) > 32:
            continue
        cur.execute(
            f"""INSERT INTO {S}.gchat_keys (gchat_id, user_id, cipher, iv, sender_key) VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT (gchat_id, user_id) DO NOTHING""",
            (gid, uid, cipher, iv, sender_key),
        )
        n += 1
    return n


def handle(action, body, cur, S, me, resp, err, online_seconds, direct_unread):
    if action == "gchat_create":
        title = str(body.get("title") or "").strip()[:80]
        if len(title) < 1:
            return err(400, "Укажите название группы")
        ids = _ids(body.get("userIds"), me)
        if not ids:
            return err(400, "Добавьте хотя бы одного участника")
        sender_key = str(body.get("senderKey") or "")
        if not sender_key:
            return err(400, "Нет ключа шифрования группы")
        cur.execute(f"SELECT id FROM {S}.users WHERE id = ANY(%s)", (ids,))
        valid = [r["id"] for r in cur.fetchall()]
        cur.execute(f"INSERT INTO {S}.gchats (title, owner_id) VALUES (%s,%s) RETURNING id", (title, me))
        gid = cur.fetchone()["id"]
        cur.execute(f"INSERT INTO {S}.gchat_members (gchat_id, user_id, is_admin) VALUES (%s,%s,TRUE)", (gid, me))
        for uid in valid:
            cur.execute(f"INSERT INTO {S}.gchat_members (gchat_id, user_id) VALUES (%s,%s)", (gid, uid))
        _store_keys(cur, S, gid, me, sender_key, body.get("keys"))
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

    if action == "gchat_share_key":
        cur.execute(f"SELECT 1 FROM {S}.gchat_keys WHERE gchat_id=%s AND user_id=%s", (gid, me))
        if not cur.fetchone():
            return err(403, "У вас ещё нет ключа группы")
        sender_key = str(body.get("senderKey") or "")
        return resp(200, {"stored": _store_keys(cur, S, gid, me, sender_key, body.get("items"))})

    if action == "gchat_history":
        after = int(body.get("after") or 0)
        cur.execute(
            f"""SELECT id, sender_id, cipher, iv, created_at FROM {S}.gchat_messages
            WHERE gchat_id=%s AND id > %s AND cipher IS NOT NULL ORDER BY id LIMIT {HISTORY_PAGE}""",
            (gid, after),
        )
        rows = cur.fetchall()
        return resp(200, {
            "messages": [{"id": r["id"], "from": r["sender_id"], "cipher": r["cipher"], "iv": r["iv"],
                          "at": r["created_at"]} for r in rows],
            "more": len(rows) == HISTORY_PAGE,
        })

    if action == "gchat_send":
        cipher = str(body.get("cipher") or "")
        iv = str(body.get("iv") or "")
        if not cipher or not iv or len(cipher) > MAX_CIPHER or len(iv) > 32:
            return err(400, "Сообщение должно быть зашифровано")
        silent = bool(body.get("silent"))
        cur.execute(
            f"""INSERT INTO {S}.gchat_messages (gchat_id, sender_id, cipher, iv, silent)
            VALUES (%s,%s,%s,%s,%s) RETURNING id, created_at""",
            (gid, me, cipher, iv, silent),
        )
        msg = cur.fetchone()
        cur.execute(f"UPDATE {S}.gchat_members SET read_upto=%s WHERE gchat_id=%s AND user_id=%s", (msg["id"], gid, me))
        if not silent:
            cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
            my_name = cur.fetchone()["name"]
            cur.execute(f"SELECT title FROM {S}.gchats WHERE id=%s", (gid,))
            title = cur.fetchone()["title"]
            cur.execute(f"SELECT user_id FROM {S}.gchat_members WHERE gchat_id=%s AND active AND user_id<>%s", (gid, me))
            for r in cur.fetchall():
                uid = r["user_id"]
                badge = unread_total(cur, S, uid) + direct_unread(uid)
                send_push(cur, S, uid, {"type": "message", "chatId": -gid, "badge": badge, "title": title,
                                        "body": f"{my_name}: новое сообщение"}, ttl=86400, urgency="high")
        return resp(200, {"id": msg["id"], "at": msg["created_at"]})

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
                ON CONFLICT (gchat_id, user_id) DO UPDATE SET active=TRUE, joined_at=NOW(), read_upto=0""",
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
        cur.execute(f"DELETE FROM {S}.gchat_keys WHERE gchat_id=%s AND user_id=%s", (gid, uid))
        return resp(200, {"members": _members(cur, S, gid, online_seconds)})

    if action == "gchat_rename":
        title = str(body.get("title") or "").strip()[:80]
        if not title:
            return err(400, "Укажите название")
        cur.execute(f"UPDATE {S}.gchats SET title=%s WHERE id=%s", (title, gid))
        return resp(200, {"ok": True})

    if action == "gchat_leave":
        cur.execute(f"UPDATE {S}.gchat_members SET active=FALSE WHERE gchat_id=%s AND user_id=%s", (gid, me))
        cur.execute(f"DELETE FROM {S}.gchat_keys WHERE gchat_id=%s AND user_id=%s", (gid, me))
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
