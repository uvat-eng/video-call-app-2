from push import send_push

MAX_MEMBERS = 20
RING_SECONDS = 45
PING_TIMEOUT = 40


def _user(r, prefix=""):
    return {
        "id": r[prefix + "id"],
        "name": r[prefix + "name"],
        "phone": r[prefix + "phone"],
        "status": r.get(prefix + "status") or "",
        "online": True,
        "publicKey": r.get(prefix + "public_key"),
    }


def _members(cur, S, call_id):
    cur.execute(
        f"""SELECT u.id, u.name, u.phone, u.status, u.public_key, m.state,
        (m.state='joined' AND m.last_ping > NOW() - INTERVAL '{PING_TIMEOUT} seconds') AS alive
        FROM {S}.group_members m JOIN {S}.users u ON u.id=m.user_id
        WHERE m.call_id=%s ORDER BY m.invited_at, u.id""",
        (call_id,),
    )
    out = []
    for r in cur.fetchall():
        state = r["state"]
        if state == "joined" and not r["alive"]:
            state = "left"
        out.append({"user": _user(r), "state": state})
    return out


def _finish_if_empty(cur, S, call_id):
    cur.execute(
        f"""UPDATE {S}.group_members SET state='left', left_at=NOW()
        WHERE call_id=%s AND state='joined' AND last_ping < NOW() - INTERVAL '{PING_TIMEOUT} seconds'""",
        (call_id,),
    )
    cur.execute(
        f"""UPDATE {S}.group_members SET state='missed'
        WHERE call_id=%s AND state='invited' AND invited_at < NOW() - INTERVAL '{RING_SECONDS} seconds'""",
        (call_id,),
    )
    cur.execute(f"SELECT COUNT(*) AS n FROM {S}.group_members WHERE call_id=%s AND state='joined'", (call_id,))
    joined = cur.fetchone()["n"]
    cur.execute(f"SELECT COUNT(*) AS n FROM {S}.group_members WHERE call_id=%s AND state='invited'", (call_id,))
    invited = cur.fetchone()["n"]
    if joined == 0 or (joined == 1 and invited == 0):
        cur.execute(
            f"UPDATE {S}.group_calls SET status='ended', ended_at=NOW() WHERE id=%s AND status='active'",
            (call_id,),
        )
        cur.execute(f"UPDATE {S}.group_signals SET payload=NULL, delivered=TRUE WHERE call_id=%s", (call_id,))
        return True
    return False


def _membership(cur, S, call_id, me):
    cur.execute(
        f"""SELECT g.id, g.kind, g.status, g.host_id, m.state FROM {S}.group_calls g
        JOIN {S}.group_members m ON m.call_id=g.id AND m.user_id=%s WHERE g.id=%s""",
        (me, call_id),
    )
    return cur.fetchone()


def incoming_group(cur, S, me):
    cur.execute(
        f"""SELECT g.id, g.kind, u.id AS h_id, u.name AS h_name, u.phone AS h_phone, u.status AS h_status,
        u.public_key AS h_public_key,
        (SELECT COUNT(*) FROM {S}.group_members x WHERE x.call_id=g.id) AS total
        FROM {S}.group_members m JOIN {S}.group_calls g ON g.id=m.call_id
        JOIN {S}.users u ON u.id=g.host_id
        WHERE m.user_id=%s AND m.state='invited' AND g.status='active'
        AND m.invited_at > NOW() - INTERVAL '{RING_SECONDS} seconds'
        ORDER BY g.id DESC LIMIT 1""",
        (me,),
    )
    r = cur.fetchone()
    if not r:
        return None
    return {"id": r["id"], "kind": r["kind"], "host": _user(r, "h_"), "total": int(r["total"])}


def history(cur, S, me):
    cur.execute(
        f"""SELECT g.id, g.kind, g.host_id, g.created_at, g.ended_at, m.state, m.joined_at,
        (SELECT COUNT(*) FROM {S}.group_members x WHERE x.call_id=g.id) AS total,
        (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM {S}.group_members x
           JOIN {S}.users u ON u.id=x.user_id WHERE x.call_id=g.id AND x.user_id<>%s) AS names
        FROM {S}.group_members m JOIN {S}.group_calls g ON g.id=m.call_id
        WHERE m.user_id=%s ORDER BY g.id DESC LIMIT 50""",
        (me, me),
    )
    out = []
    for r in cur.fetchall():
        outgoing = r["host_id"] == me
        answered = r["joined_at"] is not None
        secs = 0
        if r["ended_at"] and r["created_at"]:
            secs = int((r["ended_at"] - r["created_at"]).total_seconds())
        out.append({
            "id": r["id"], "kind": r["kind"], "group": True, "total": int(r["total"]),
            "names": r["names"] or "", "at": r["created_at"], "seconds": secs if answered else 0,
            "direction": "out" if outgoing else ("in" if answered else "missed"),
        })
    return out


def handle(action, body, cur, S, me, resp, err):
    if action == "group_start":
        ids = []
        for x in (body.get("userIds") or [])[: MAX_MEMBERS + 5]:
            try:
                v = int(x)
            except (TypeError, ValueError):
                continue
            if v != me and v not in ids:
                ids.append(v)
        if not ids:
            return err(400, "Выберите участников")
        if len(ids) + 1 > MAX_MEMBERS:
            return err(400, f"В групповом звонке не больше {MAX_MEMBERS} участников")
        kind = "video" if body.get("kind") == "video" else "audio"
        cur.execute(f"SELECT id FROM {S}.users WHERE id = ANY(%s) AND public_key IS NOT NULL", (ids,))
        valid = [r["id"] for r in cur.fetchall()]
        if not valid:
            return err(400, "Никто из выбранных ещё не заходил в RusAPP")
        cur.execute(f"INSERT INTO {S}.group_calls (host_id, kind) VALUES (%s,%s) RETURNING id", (me, kind))
        call_id = cur.fetchone()["id"]
        cur.execute(
            f"""INSERT INTO {S}.group_members (call_id, user_id, state, joined_at, last_ping)
            VALUES (%s,%s,'joined',NOW(),NOW())""",
            (call_id, me),
        )
        for uid in valid:
            cur.execute(f"INSERT INTO {S}.group_members (call_id, user_id) VALUES (%s,%s)", (call_id, uid))
        cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
        my_name = cur.fetchone()["name"]
        title = f"{my_name} и ещё {len(valid)}" if len(valid) > 1 else my_name
        for uid in valid:
            send_push(cur, S, uid, {
                "type": "group_call", "callId": call_id, "kind": kind, "from": my_name, "title": title,
                "body": "Групповой видеозвонок" if kind == "video" else "Групповой аудиозвонок",
            }, ttl=RING_SECONDS, urgency="high")
        return resp(200, {"callId": call_id, "members": _members(cur, S, call_id), "skipped": len(ids) - len(valid)})

    call_id = int(body.get("callId") or 0)
    m = _membership(cur, S, call_id, me)
    if not m:
        return err(404, "Звонок не найден")

    if action == "group_join":
        if m["status"] != "active":
            return err(409, "Звонок уже завершён")
        cur.execute(
            f"""UPDATE {S}.group_members SET state='joined', joined_at=COALESCE(joined_at, NOW()), last_ping=NOW(), left_at=NULL
            WHERE call_id=%s AND user_id=%s""",
            (call_id, me),
        )
        return resp(200, {"kind": m["kind"], "members": _members(cur, S, call_id)})

    if action == "group_decline":
        cur.execute(
            f"UPDATE {S}.group_members SET state='declined' WHERE call_id=%s AND user_id=%s AND state='invited'",
            (call_id, me),
        )
        _finish_if_empty(cur, S, call_id)
        return resp(200, {"ok": True})

    if action == "group_leave":
        cur.execute(
            f"UPDATE {S}.group_members SET state='left', left_at=NOW() WHERE call_id=%s AND user_id=%s AND state='joined'",
            (call_id, me),
        )
        cur.execute(
            f"UPDATE {S}.group_signals SET payload=NULL, delivered=TRUE WHERE call_id=%s AND (to_id=%s OR from_id=%s)",
            (call_id, me, me),
        )
        _finish_if_empty(cur, S, call_id)
        return resp(200, {"ok": True})

    if action == "group_invite":
        if m["status"] != "active" or m["state"] != "joined":
            return err(409, "Звонок уже завершён")
        cur.execute(f"SELECT COUNT(*) AS n FROM {S}.group_members WHERE call_id=%s", (call_id,))
        count = cur.fetchone()["n"]
        added = 0
        cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
        my_name = cur.fetchone()["name"]
        for x in (body.get("userIds") or [])[:MAX_MEMBERS]:
            try:
                uid = int(x)
            except (TypeError, ValueError):
                continue
            if count + added >= MAX_MEMBERS:
                break
            cur.execute(f"SELECT id FROM {S}.users WHERE id=%s AND public_key IS NOT NULL", (uid,))
            if not cur.fetchone():
                continue
            cur.execute(
                f"""INSERT INTO {S}.group_members (call_id, user_id) VALUES (%s,%s)
                ON CONFLICT (call_id, user_id) DO UPDATE SET state='invited', invited_at=NOW()
                WHERE {S}.group_members.state <> 'joined'""",
                (call_id, uid),
            )
            added += 1
            send_push(cur, S, uid, {
                "type": "group_call", "callId": call_id, "kind": m["kind"], "from": my_name, "title": my_name,
                "body": "Приглашает в групповой звонок",
            }, ttl=RING_SECONDS, urgency="high")
        return resp(200, {"members": _members(cur, S, call_id)})

    if action == "group_poll":
        if m["state"] == "joined":
            cur.execute(
                f"UPDATE {S}.group_members SET last_ping=NOW() WHERE call_id=%s AND user_id=%s",
                (call_id, me),
            )
        sigs = []
        for s in (body.get("signals") or [])[:60]:
            try:
                to_id = int(s.get("to"))
            except (TypeError, ValueError, AttributeError):
                continue
            payload = str(s.get("payload") or "")
            if not payload or len(payload) > 20000:
                continue
            sigs.append((call_id, me, to_id, payload))
        if sigs and m["status"] == "active":
            cur.execute(
                f"""SELECT user_id FROM {S}.group_members WHERE call_id=%s AND state IN ('joined','invited')""",
                (call_id,),
            )
            allowed = {r["user_id"] for r in cur.fetchall()}
            for row in sigs:
                if row[2] in allowed:
                    cur.execute(
                        f"INSERT INTO {S}.group_signals (call_id, from_id, to_id, payload) VALUES (%s,%s,%s,%s)",
                        row,
                    )
        ended = _finish_if_empty(cur, S, call_id) if m["status"] == "active" else True
        cur.execute(
            f"""SELECT id, from_id, payload FROM {S}.group_signals
            WHERE call_id=%s AND to_id=%s AND delivered=FALSE AND payload IS NOT NULL ORDER BY id LIMIT 100""",
            (call_id, me),
        )
        rows = cur.fetchall()
        if rows:
            cur.execute(
                f"UPDATE {S}.group_signals SET delivered=TRUE, payload=NULL WHERE id = ANY(%s)",
                ([r["id"] for r in rows],),
            )
        return resp(200, {
            "status": "ended" if ended else "active",
            "kind": m["kind"],
            "members": _members(cur, S, call_id),
            "signals": [{"id": r["id"], "from": r["from_id"], "payload": r["payload"]} for r in rows],
        })

    return err(400, "Неизвестное действие")
