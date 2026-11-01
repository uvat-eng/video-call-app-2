import json
import os
import hashlib
import secrets
import psycopg2
import psycopg2.extras

S = "t_p46289391_video_call_app_2"
RING_SECONDS = 45
ONLINE_SECONDS = 40

HEADERS = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}


def to_json(o):
    return o.isoformat() if hasattr(o, "isoformat") else str(o)


def resp(code, data):
    return {"statusCode": code, "headers": HEADERS, "body": json.dumps(data, default=to_json, ensure_ascii=False)}


def err(code, msg):
    return resp(code, {"error": msg})


def norm_phone(p):
    digits = "".join(ch for ch in str(p or "") if ch.isdigit())
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    return "+" + digits if 10 <= len(digits) <= 15 else ""


def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100000).hex()


def user_out(r):
    return {
        "id": r["id"],
        "name": r["name"],
        "phone": r["phone"],
        "status": r.get("status") or "",
        "lastSeen": r.get("last_seen"),
        "online": bool(r.get("online")),
    }


USER_COLS = f"u.id, u.name, u.phone, u.status, u.last_seen, (u.last_seen > NOW() - INTERVAL '{ONLINE_SECONDS} seconds') AS online"


def chat_pair(a, b):
    return (a, b) if a < b else (b, a)


def get_or_create_chat(cur, me, other):
    a, b = chat_pair(me, other)
    cur.execute(f"SELECT id FROM {S}.chats WHERE user_a=%s AND user_b=%s", (a, b))
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute(f"INSERT INTO {S}.chats (user_a, user_b) VALUES (%s,%s) RETURNING id", (a, b))
    return cur.fetchone()["id"]


def ensure_contact(cur, owner, contact):
    cur.execute(
        f"INSERT INTO {S}.contacts (owner_id, contact_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
        (owner, contact),
    )


def list_chats(cur, me):
    cur.execute(
        f"""
        SELECT c.id AS chat_id, {USER_COLS},
          lm.text AS last_text, lm.created_at AS last_at, lm.sender_id AS last_sender,
          (SELECT COUNT(*) FROM {S}.messages m WHERE m.chat_id=c.id AND m.sender_id<>%s AND m.read_at IS NULL) AS unread
        FROM {S}.chats c
        JOIN {S}.users u ON u.id = CASE WHEN c.user_a=%s THEN c.user_b ELSE c.user_a END
        LEFT JOIN LATERAL (
          SELECT text, created_at, sender_id FROM {S}.messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1
        ) lm ON TRUE
        WHERE c.user_a=%s OR c.user_b=%s
        ORDER BY COALESCE(lm.created_at, c.created_at) DESC
        """,
        (me, me, me, me),
    )
    out = []
    for r in cur.fetchall():
        out.append({
            "id": r["chat_id"],
            "peer": user_out(r),
            "lastText": r["last_text"] or "",
            "lastAt": r["last_at"],
            "lastMine": r["last_sender"] == me,
            "unread": int(r["unread"] or 0),
        })
    return out


def chat_access(cur, me, chat_id):
    cur.execute(f"SELECT user_a, user_b FROM {S}.chats WHERE id=%s", (chat_id,))
    r = cur.fetchone()
    if not r or me not in (r["user_a"], r["user_b"]):
        return None
    return r["user_b"] if r["user_a"] == me else r["user_a"]


def chat_messages(cur, me, chat_id, after_id):
    cur.execute(
        f"UPDATE {S}.messages SET read_at=NOW() WHERE chat_id=%s AND sender_id<>%s AND read_at IS NULL",
        (chat_id, me),
    )
    cur.execute(
        f"""SELECT id, sender_id, text, created_at, read_at FROM {S}.messages
        WHERE chat_id=%s AND id>%s ORDER BY id DESC LIMIT 200""",
        (chat_id, after_id),
    )
    rows = list(reversed(cur.fetchall()))
    cur.execute(
        f"SELECT COALESCE(MAX(id),0) AS m FROM {S}.messages WHERE chat_id=%s AND sender_id=%s AND read_at IS NOT NULL",
        (chat_id, me),
    )
    read_upto = cur.fetchone()["m"]
    msgs = [{
        "id": r["id"],
        "mine": r["sender_id"] == me,
        "text": r["text"],
        "at": r["created_at"],
        "read": r["read_at"] is not None,
    } for r in rows]
    return msgs, read_upto


def incoming_call(cur, me):
    cur.execute(
        f"""SELECT cl.id, cl.kind, cl.offer, {USER_COLS} FROM {S}.calls cl
        JOIN {S}.users u ON u.id=cl.caller_id
        WHERE cl.callee_id=%s AND cl.status='ringing' AND cl.created_at > NOW() - INTERVAL '{RING_SECONDS} seconds'
        ORDER BY cl.id DESC LIMIT 1""",
        (me,),
    )
    r = cur.fetchone()
    if not r:
        return None
    return {"id": r["id"], "kind": r["kind"], "offer": r["offer"], "peer": user_out(r)}


def handler(event: dict, context) -> dict:
    """API мессенджера RusAPP: регистрация, вход, контакты, чаты, сообщения и сигналинг звонков"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
            "Access-Control-Max-Age": "86400"}, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except ValueError:
        body = {}
    if event.get("httpMethod") == "GET":
        return resp(200, {"ok": True, "service": "messenger"})
    action = body.get("action", "")
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    token = headers.get("x-auth-token", "")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if action == "register":
            phone = norm_phone(body.get("phone"))
            name = str(body.get("name") or "").strip()[:80]
            pw = str(body.get("password") or "")
            if not phone:
                return err(400, "Укажите корректный номер телефона")
            if len(name) < 2:
                return err(400, "Укажите имя")
            if len(pw) < 6:
                return err(400, "Пароль — минимум 6 символов")
            cur.execute(f"SELECT id FROM {S}.users WHERE phone=%s", (phone,))
            if cur.fetchone():
                return err(409, "Этот номер уже зарегистрирован — войдите")
            salt = secrets.token_hex(16)
            cur.execute(
                f"INSERT INTO {S}.users (phone, name, password_hash, salt) VALUES (%s,%s,%s,%s) RETURNING id",
                (phone, name, hash_pw(pw, salt), salt),
            )
            uid = cur.fetchone()["id"]
            tok = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {S}.sessions (token, user_id) VALUES (%s,%s)", (tok, uid))
            return resp(200, {"token": tok, "user": {"id": uid, "name": name, "phone": phone, "status": "", "online": True}})

        if action == "login":
            phone = norm_phone(body.get("phone"))
            pw = str(body.get("password") or "")
            cur.execute(f"SELECT * FROM {S}.users WHERE phone=%s", (phone,))
            u = cur.fetchone()
            if not u or hash_pw(pw, u["salt"]) != u["password_hash"]:
                return err(401, "Неверный номер или пароль")
            tok = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {S}.sessions (token, user_id) VALUES (%s,%s)", (tok, u["id"]))
            u["online"] = True
            return resp(200, {"token": tok, "user": user_out(u)})

        if not token:
            return err(401, "Нужно войти")
        cur.execute(f"SELECT user_id FROM {S}.sessions WHERE token=%s", (token,))
        s = cur.fetchone()
        if not s:
            return err(401, "Сессия истекла, войдите снова")
        me = s["user_id"]
        cur.execute(f"UPDATE {S}.users SET last_seen=NOW() WHERE id=%s", (me,))

        if action == "me":
            cur.execute(f"SELECT {USER_COLS} FROM {S}.users u WHERE u.id=%s", (me,))
            return resp(200, {"user": user_out(cur.fetchone())})

        if action == "update_profile":
            name = str(body.get("name") or "").strip()[:80]
            status = str(body.get("status") or "").strip()[:140]
            if len(name) < 2:
                return err(400, "Укажите имя")
            cur.execute(f"UPDATE {S}.users SET name=%s, status=%s WHERE id=%s", (name, status, me))
            cur.execute(f"SELECT {USER_COLS} FROM {S}.users u WHERE u.id=%s", (me,))
            return resp(200, {"user": user_out(cur.fetchone())})

        if action == "logout":
            cur.execute(f"DELETE FROM {S}.sessions WHERE token=%s", (token,))
            return resp(200, {"ok": True})

        if action == "contacts":
            cur.execute(
                f"""SELECT {USER_COLS} FROM {S}.contacts c JOIN {S}.users u ON u.id=c.contact_id
                WHERE c.owner_id=%s
                UNION
                SELECT {USER_COLS} FROM {S}.chats ch JOIN {S}.users u ON u.id = CASE WHEN ch.user_a=%s THEN ch.user_b ELSE ch.user_a END
                WHERE ch.user_a=%s OR ch.user_b=%s
                ORDER BY name""",
                (me, me, me, me),
            )
            return resp(200, {"contacts": [user_out(r) for r in cur.fetchall()]})

        if action == "add_contact":
            phone = norm_phone(body.get("phone"))
            cur.execute(f"SELECT {USER_COLS} FROM {S}.users u WHERE u.phone=%s", (phone,))
            u = cur.fetchone()
            if not u:
                return err(404, "Пользователь с таким номером ещё не в RusAPP")
            if u["id"] == me:
                return err(400, "Это ваш номер")
            ensure_contact(cur, me, u["id"])
            chat_id = get_or_create_chat(cur, me, u["id"])
            return resp(200, {"contact": user_out(u), "chatId": chat_id})

        if action == "open_chat":
            other = int(body.get("userId") or 0)
            cur.execute(f"SELECT id FROM {S}.users WHERE id=%s", (other,))
            if not cur.fetchone() or other == me:
                return err(404, "Пользователь не найден")
            ensure_contact(cur, me, other)
            return resp(200, {"chatId": get_or_create_chat(cur, me, other)})

        if action == "send":
            chat_id = int(body.get("chatId") or 0)
            text = str(body.get("text") or "").strip()[:4000]
            if not text:
                return err(400, "Пустое сообщение")
            peer = chat_access(cur, me, chat_id)
            if not peer:
                return err(403, "Нет доступа к чату")
            ensure_contact(cur, peer, me)
            cur.execute(
                f"INSERT INTO {S}.messages (chat_id, sender_id, text) VALUES (%s,%s,%s) RETURNING id, created_at",
                (chat_id, me, text),
            )
            r = cur.fetchone()
            return resp(200, {"message": {"id": r["id"], "mine": True, "text": text, "at": r["created_at"], "read": False}})

        if action == "poll":
            result = {"chats": list_chats(cur, me), "incoming": incoming_call(cur, me)}
            chat_id = int(body.get("chatId") or 0)
            if chat_id and chat_access(cur, me, chat_id):
                msgs, read_upto = chat_messages(cur, me, chat_id, int(body.get("afterId") or 0))
                result["chatId"] = chat_id
                result["messages"] = msgs
                result["readUpto"] = read_upto
            return resp(200, result)

        if action == "calls":
            cur.execute(
                f"""SELECT cl.id, cl.kind, cl.status, cl.caller_id, cl.created_at, cl.answered_at, cl.ended_at, {USER_COLS}
                FROM {S}.calls cl
                JOIN {S}.users u ON u.id = CASE WHEN cl.caller_id=%s THEN cl.callee_id ELSE cl.caller_id END
                WHERE cl.caller_id=%s OR cl.callee_id=%s
                ORDER BY cl.id DESC LIMIT 100""",
                (me, me, me),
            )
            out = []
            for r in cur.fetchall():
                outgoing = r["caller_id"] == me
                answered = r["answered_at"] is not None
                secs = 0
                if answered and r["ended_at"]:
                    secs = int((r["ended_at"] - r["answered_at"]).total_seconds())
                direction = "out" if outgoing else ("in" if answered else "missed")
                out.append({"id": r["id"], "kind": r["kind"], "direction": direction, "answered": answered,
                            "at": r["created_at"], "seconds": secs, "peer": user_out(r)})
            return resp(200, {"calls": out})

        if action == "call_start":
            other = int(body.get("userId") or 0)
            kind = "video" if body.get("kind") == "video" else "audio"
            offer = str(body.get("offer") or "")
            if not offer:
                return err(400, "Нет данных соединения")
            cur.execute(f"SELECT id FROM {S}.users WHERE id=%s", (other,))
            if not cur.fetchone() or other == me:
                return err(404, "Пользователь не найден")
            cur.execute(
                f"""SELECT id FROM {S}.calls WHERE caller_id=%s AND callee_id=%s AND offer=%s
                AND created_at > NOW() - INTERVAL '30 seconds' ORDER BY id DESC LIMIT 1""",
                (me, other, offer),
            )
            dup = cur.fetchone()
            if dup:
                return resp(200, {"callId": dup["id"]})
            cur.execute(
                f"INSERT INTO {S}.calls (caller_id, callee_id, kind, offer) VALUES (%s,%s,%s,%s) RETURNING id",
                (me, other, kind, offer),
            )
            return resp(200, {"callId": cur.fetchone()["id"]})

        if action in ("call_get", "call_answer", "call_end"):
            call_id = int(body.get("callId") or 0)
            cur.execute(f"SELECT * FROM {S}.calls WHERE id=%s", (call_id,))
            c = cur.fetchone()
            if not c or me not in (c["caller_id"], c["callee_id"]):
                return err(404, "Звонок не найден")
            if action == "call_answer":
                if c["callee_id"] != me or c["status"] != "ringing":
                    return err(409, "Звонок уже завершён")
                cur.execute(
                    f"UPDATE {S}.calls SET status='active', answer=%s, answered_at=NOW() WHERE id=%s",
                    (str(body.get("answer") or ""), call_id),
                )
                return resp(200, {"ok": True})
            if action == "call_end":
                if c["status"] in ("ringing", "active"):
                    new_status = "declined" if c["status"] == "ringing" and c["callee_id"] == me else "ended"
                    cur.execute(f"UPDATE {S}.calls SET status=%s, ended_at=NOW() WHERE id=%s", (new_status, call_id))
                return resp(200, {"ok": True})
            status = c["status"]
            if status == "ringing" and (c["created_at"] is not None):
                cur.execute(f"SELECT (NOW() - %s) > INTERVAL '{RING_SECONDS} seconds' AS old", (c["created_at"],))
                if cur.fetchone()["old"]:
                    cur.execute(f"UPDATE {S}.calls SET status='missed', ended_at=NOW() WHERE id=%s", (call_id,))
                    status = "missed"
            return resp(200, {"status": status, "answer": c["answer"] if c["caller_id"] == me else None})

        return err(400, "Неизвестное действие")
    finally:
        cur.close()
        conn.close()