import json
import os
import hashlib
import secrets
import psycopg2
import psycopg2.extras
from push import get_vapid, send_push
import group
import gchat
import base64
import uuid
import boto3

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
        "publicKey": r.get("public_key"),
        "avatar": r.get("avatar"),
    }


def th(token):
    return hashlib.sha256(token.encode()).hexdigest()


USER_COLS = f"u.id, u.name, u.phone, u.status, u.last_seen, u.public_key, u.avatar, (u.last_seen > NOW() - INTERVAL '{ONLINE_SECONDS} seconds') AS online"


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
          (SELECT MAX(m.created_at) FROM {S}.messages m WHERE m.chat_id=c.id) AS last_at,
          (SELECT COALESCE(MAX(m.id),0) FROM {S}.messages m WHERE m.chat_id=c.id) AS last_id,
          (SELECT COUNT(*) FROM {S}.messages m WHERE m.chat_id=c.id AND m.sender_id<>%s AND m.read_at IS NULL) AS unread,
          (SELECT COALESCE(MAX(m.id),0) FROM {S}.messages m WHERE m.chat_id=c.id AND m.sender_id=%s AND m.read_at IS NOT NULL) AS read_upto
        FROM {S}.chats c
        JOIN {S}.users u ON u.id = CASE WHEN c.user_a=%s THEN c.user_b ELSE c.user_a END
        WHERE c.user_a=%s OR c.user_b=%s
        """,
        (me, me, me, me, me),
    )
    rows = sorted(cur.fetchall(), key=lambda r: (r["last_id"], r["chat_id"]), reverse=True)
    return [{
        "id": r["chat_id"],
        "peer": user_out(r),
        "lastAt": r["last_at"],
        "unread": int(r["unread"] or 0),
        "readUpto": int(r["read_upto"] or 0),
    } for r in rows]


def chat_access(cur, me, chat_id):
    cur.execute(f"SELECT user_a, user_b FROM {S}.chats WHERE id=%s", (chat_id,))
    r = cur.fetchone()
    if not r or me not in (r["user_a"], r["user_b"]):
        return None
    return r["user_b"] if r["user_a"] == me else r["user_a"]


def inbox(cur, me, sid, cursor):
    cur.execute(
        f"""SELECT m.id, m.chat_id, m.sender_id, m.cipher, m.iv, m.sender_key, m.created_at
        FROM {S}.messages m JOIN {S}.chats c ON c.id=m.chat_id
        WHERE (c.user_a=%s OR c.user_b=%s) AND m.id > %s AND m.cipher IS NOT NULL
        AND (m.sender_id<>%s OR m.sender_session IS DISTINCT FROM %s)
        ORDER BY m.id LIMIT 200""",
        (me, me, cursor, me, sid),
    )
    return [{"id": r["id"], "chatId": r["chat_id"], "cipher": r["cipher"], "iv": r["iv"], "mine": r["sender_id"] == me,
             "senderKey": r["sender_key"], "at": r["created_at"]} for r in cur.fetchall()]


def purge_delivered(cur, me):
    cur.execute(
        f"""UPDATE {S}.messages m SET cipher=NULL, iv=NULL, sender_key=NULL
        FROM {S}.chats c WHERE c.id=m.chat_id AND (c.user_a=%s OR c.user_b=%s) AND m.cipher IS NOT NULL
        AND m.created_at < NOW() - INTERVAL '30 days'""",
        (me, me),
    )


def max_msg_id(cur, uid):
    cur.execute(
        f"""SELECT COALESCE(MAX(m.id),0) AS n FROM {S}.messages m JOIN {S}.chats c ON c.id=m.chat_id
        WHERE c.user_a=%s OR c.user_b=%s""",
        (uid, uid),
    )
    return int(cur.fetchone()["n"])


def device_label(body):
    return str(body.get("deviceName") or "").strip()[:120] or "Устройство"


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
    """API мессенджера RuChat: регистрация, вход, контакты, чаты, сообщения и сигналинг звонков"""
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
            cur.execute(f"INSERT INTO {S}.sessions (token, user_id, device_name) VALUES (%s,%s,%s)", (th(tok), uid, device_label(body)))
            return resp(200, {"token": tok, "user": {"id": uid, "name": name, "phone": phone, "status": "", "online": True, "publicKey": None, "avatar": None}})

        if action == "login":
            phone = norm_phone(body.get("phone"))
            pw = str(body.get("password") or "")
            cur.execute(f"SELECT * FROM {S}.users WHERE phone=%s", (phone,))
            u = cur.fetchone()
            if not u or hash_pw(pw, u["salt"]) != u["password_hash"]:
                return err(401, "Неверный номер или пароль")
            tok = secrets.token_hex(32)
            cur.execute(
                f"INSERT INTO {S}.sessions (token, user_id, device_name, msg_cursor) VALUES (%s,%s,%s,%s)",
                (th(tok), u["id"], device_label(body), 0),
            )
            u["online"] = True
            return resp(200, {"token": tok, "user": {**user_out(u), "hasKeyBackup": bool(u.get("key_backup"))}, "keyBackup": u.get("key_backup")})

        if not token:
            return err(401, "Нужно войти")
        cur.execute(f"SELECT id, user_id, msg_cursor FROM {S}.sessions WHERE token=%s", (th(token),))
        s = cur.fetchone()
        if not s:
            return err(401, "Сессия истекла, войдите снова")
        me = s["user_id"]
        sid = s["id"]
        cur.execute(f"UPDATE {S}.users SET last_seen=NOW() WHERE id=%s", (me,))
        cur.execute(f"UPDATE {S}.sessions SET last_active=NOW() WHERE id=%s", (sid,))

        if action == "devices":
            cur.execute(
                f"""SELECT id, device_name, created_at, last_active FROM {S}.sessions
                WHERE user_id=%s AND last_active > NOW() - INTERVAL '60 days' ORDER BY last_active DESC""",
                (me,),
            )
            return resp(200, {"devices": [{"id": r["id"], "name": r["device_name"] or "Устройство", "createdAt": r["created_at"],
                                           "lastActive": r["last_active"], "current": r["id"] == sid} for r in cur.fetchall()]})

        if action == "device_remove":
            did = int(body.get("deviceId") or 0)
            if did == sid:
                return err(400, "Чтобы выйти на этом устройстве, нажмите «Выйти»")
            cur.execute(f"DELETE FROM {S}.push_subs WHERE session_id=%s AND user_id=%s", (did, me))
            cur.execute(f"DELETE FROM {S}.sessions WHERE id=%s AND user_id=%s", (did, me))
            return resp(200, {"ok": True})

        if action == "link_request":
            device_pub = str(body.get("devicePub") or "")
            if len(device_pub) < 40 or len(device_pub) > 400:
                return err(400, "Некорректный ключ устройства")
            cur.execute(f"DELETE FROM {S}.device_links WHERE user_id=%s OR created_at < NOW() - INTERVAL '15 minutes'", (me,))
            alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            code = "".join(secrets.choice(alphabet) for _ in range(8))
            cur.execute(
                f"INSERT INTO {S}.device_links (code, user_id, device_pub, device_name) VALUES (%s,%s,%s,%s)",
                (code, me, device_pub, device_label(body)),
            )
            return resp(200, {"code": code})

        if action == "link_lookup":
            code = "".join(ch for ch in str(body.get("code") or "").upper() if ch.isalnum())
            cur.execute(
                f"""SELECT device_pub, device_name FROM {S}.device_links WHERE code=%s AND user_id=%s
                AND payload IS NULL AND created_at > NOW() - INTERVAL '15 minutes'""",
                (code, me),
            )
            r = cur.fetchone()
            if not r:
                return err(404, "Код не найден или устарел. Проверьте, что на обоих устройствах один и тот же аккаунт")
            return resp(200, {"devicePub": r["device_pub"], "deviceName": r["device_name"]})

        if action == "link_approve":
            code = "".join(ch for ch in str(body.get("code") or "").upper() if ch.isalnum())
            payload = str(body.get("payload") or "")
            if not payload or len(payload) > 200000:
                return err(400, "Некорректные данные")
            cur.execute(
                f"""UPDATE {S}.device_links SET payload=%s WHERE code=%s AND user_id=%s AND payload IS NULL
                AND created_at > NOW() - INTERVAL '15 minutes' RETURNING code""",
                (payload, code, me),
            )
            if not cur.fetchone():
                return err(404, "Код устарел — запросите новый на подключаемом устройстве")
            return resp(200, {"ok": True})

        if action == "link_poll":
            code = "".join(ch for ch in str(body.get("code") or "").upper() if ch.isalnum())
            cur.execute(f"SELECT payload FROM {S}.device_links WHERE code=%s AND user_id=%s", (code, me))
            r = cur.fetchone()
            if not r:
                return resp(200, {"status": "expired"})
            if not r["payload"]:
                return resp(200, {"status": "waiting"})
            cur.execute(f"DELETE FROM {S}.device_links WHERE code=%s", (code,))
            return resp(200, {"status": "ready", "payload": r["payload"]})

        if action == "avatar_set":
            raw = str(body.get("image") or "")
            icon = str(body.get("icon") or "")
            if icon:
                if not icon.startswith("icon:") or len(icon) > 60:
                    return err(400, "Некорректная иконка")
                cur.execute(f"UPDATE {S}.users SET avatar=%s WHERE id=%s", (icon, me))
            elif raw:
                if len(raw) > 700000:
                    return err(400, "Фото слишком большое")
                key = f"avatars/{me}-{uuid.uuid4().hex[:10]}.jpg"
                s3 = boto3.client("s3", endpoint_url="https://bucket.poehali.dev",
                                  aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                                  aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"])
                s3.put_object(Bucket="files", Key=key, Body=base64.b64decode(raw), ContentType="image/jpeg")
                url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
                cur.execute(f"UPDATE {S}.users SET avatar=%s WHERE id=%s", (url, me))
            else:
                cur.execute(f"UPDATE {S}.users SET avatar=NULL WHERE id=%s", (me,))
            cur.execute(f"SELECT {USER_COLS} FROM {S}.users u WHERE u.id=%s", (me,))
            return resp(200, {"user": user_out(cur.fetchone())})

        if action == "me":
            cur.execute(f"SELECT {USER_COLS}, (u.key_backup IS NOT NULL) AS hkb FROM {S}.users u WHERE u.id=%s", (me,))
            r = cur.fetchone()
            return resp(200, {"user": {**user_out(r), "hasKeyBackup": bool(r["hkb"])}})

        if action == "push_key":
            _, pub = get_vapid(cur, S)
            return resp(200, {"publicKey": pub})

        if action == "push_subscribe":
            sub = body.get("subscription") or {}
            endpoint = str(sub.get("endpoint") or "")
            keys = sub.get("keys") or {}
            if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
                return err(400, "Некорректная подписка")
            cur.execute(
                f"""INSERT INTO {S}.push_subs (user_id, endpoint, p256dh, auth, session_id) VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth,
                session_id=EXCLUDED.session_id""",
                (me, endpoint, keys["p256dh"], keys["auth"], sid),
            )
            return resp(200, {"ok": True})

        if action == "push_test":
            n = send_push(cur, S, me, {"type": "test", "title": "RuChat", "body": "Уведомления работают"}, ttl=60, urgency="high")
            cur.execute(f"SELECT COUNT(*) AS n FROM {S}.push_subs WHERE user_id=%s", (me,))
            return resp(200, {"sent": n, "devices": cur.fetchone()["n"]})

        if action == "push_unsubscribe":
            cur.execute(f"DELETE FROM {S}.push_subs WHERE endpoint=%s AND user_id=%s", (str(body.get("endpoint") or ""), me))
            return resp(200, {"ok": True})

        if action == "set_key":
            key = str(body.get("publicKey") or "")
            if len(key) < 40 or len(key) > 1000:
                return err(400, "Некорректный ключ")
            cur.execute(f"UPDATE {S}.users SET public_key=%s WHERE id=%s", (key, me))
            cur.execute(f"SELECT chat_id, sender_id FROM {S}.key_waits WHERE recipient_id=%s", (me,))
            waits = cur.fetchall()
            if waits:
                cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
                my_name = cur.fetchone()["name"]
                for w in waits:
                    send_push(cur, S, w["sender_id"], {
                        "type": "key_ready", "chatId": w["chat_id"], "uid": w["sender_id"], "peerKey": key,
                        "title": f"{my_name} теперь в RuChat", "body": "Ваши сообщения доставлены",
                    }, ttl=2419200, urgency="high")
                cur.execute(f"DELETE FROM {S}.key_waits WHERE recipient_id=%s", (me,))
            return resp(200, {"ok": True})

        if action == "key_backup":
            blob = str(body.get("backup") or "")
            if len(blob) < 40 or len(blob) > 20000:
                return err(400, "Некорректные данные")
            cur.execute(f"SELECT password_hash, salt FROM {S}.users WHERE id=%s", (me,))
            pu = cur.fetchone()
            if hash_pw(str(body.get("password") or ""), pu["salt"]) != pu["password_hash"]:
                return err(403, "Неверный пароль")
            cur.execute(f"UPDATE {S}.users SET key_backup=%s WHERE id=%s", (blob, me))
            return resp(200, {"ok": True})

        if action == "peer_key":
            cur.execute(f"SELECT public_key FROM {S}.users WHERE id=%s", (int(body.get("userId") or 0),))
            r = cur.fetchone()
            if not r:
                return err(404, "Пользователь не найден")
            return resp(200, {"publicKey": r["public_key"]})

        if action == "wait_key":
            chat_id = int(body.get("chatId") or 0)
            peer = chat_access(cur, me, chat_id)
            if not peer:
                return err(403, "Нет доступа к чату")
            cur.execute(f"SELECT public_key FROM {S}.users WHERE id=%s", (peer,))
            pk = cur.fetchone()["public_key"]
            if pk:
                return resp(200, {"publicKey": pk})
            ensure_contact(cur, peer, me)
            cur.execute(
                f"""INSERT INTO {S}.key_waits (chat_id, sender_id, recipient_id) VALUES (%s,%s,%s)
                ON CONFLICT (chat_id, sender_id) DO NOTHING""",
                (chat_id, me, peer),
            )
            return resp(200, {"publicKey": None})

        if action == "update_profile":
            name = str(body.get("name") or "").strip()[:80]
            status = str(body.get("status") or "").strip()[:140]
            if len(name) < 2:
                return err(400, "Укажите имя")
            cur.execute(f"UPDATE {S}.users SET name=%s, status=%s WHERE id=%s", (name, status, me))
            cur.execute(f"SELECT {USER_COLS} FROM {S}.users u WHERE u.id=%s", (me,))
            return resp(200, {"user": user_out(cur.fetchone())})

        if action == "logout":
            cur.execute(f"DELETE FROM {S}.push_subs WHERE session_id=%s", (sid,))
            cur.execute(f"DELETE FROM {S}.sessions WHERE token=%s", (th(token),))
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

        if action == "match_contacts":
            hashes = [str(h).lower() for h in (body.get("hashes") or [])[:5000] if isinstance(h, str) and len(h) == 64]
            if not hashes:
                return resp(200, {"matches": []})
            cur.execute(
                f"""SELECT {USER_COLS}, encode(sha256(u.phone::bytea), 'hex') AS ph FROM {S}.users u
                WHERE encode(sha256(u.phone::bytea), 'hex') = ANY(%s) AND u.id <> %s""",
                (hashes, me),
            )
            rows = cur.fetchall()
            for r in rows:
                ensure_contact(cur, me, r["id"])
            return resp(200, {"matches": [{"hash": r["ph"], "user": user_out(r)} for r in rows]})

        if action == "add_contact":
            phone = norm_phone(body.get("phone"))
            if not phone:
                return err(400, "Номер указан неверно. Пример: +7 900 123-45-67")
            cur.execute(f"SELECT {USER_COLS} FROM {S}.users u WHERE u.phone=%s", (phone,))
            u = cur.fetchone()
            if not u:
                return err(404, "Этого человека ещё нет в RuChat — пригласите его")
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
            cipher = str(body.get("cipher") or "")
            iv = str(body.get("iv") or "")
            sender_key = str(body.get("senderKey") or "")
            if not cipher or not iv or not sender_key or len(cipher) > 60000 or len(iv) > 32:
                return err(400, "Сообщение должно быть зашифровано")
            peer = chat_access(cur, me, chat_id)
            if not peer:
                return err(403, "Нет доступа к чату")
            ensure_contact(cur, peer, me)
            cur.execute(
                f"""INSERT INTO {S}.messages (chat_id, sender_id, text, cipher, iv, sender_key, read_at, sender_session)
                VALUES (%s,%s,'',%s,%s,%s, CASE WHEN %s THEN NOW() ELSE NULL END, %s) RETURNING id, created_at""",
                (chat_id, me, cipher, iv, sender_key, bool(body.get("silent")), sid),
            )
            r = cur.fetchone()
            cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
            my_name = cur.fetchone()["name"]
            cur.execute(
                f"""SELECT COUNT(*) AS n FROM {S}.messages m JOIN {S}.chats c ON c.id=m.chat_id
                WHERE (c.user_a=%s OR c.user_b=%s) AND m.sender_id<>%s AND m.read_at IS NULL""",
                (peer, peer, peer),
            )
            badge = cur.fetchone()["n"] + gchat.unread_total(cur, S, peer)
            if not body.get("silent"):
                send_push(cur, S, peer, {"type": "message", "chatId": chat_id, "from": my_name, "badge": badge,
                                         "title": my_name, "body": "Новое сообщение"}, ttl=86400, urgency="high")
            return resp(200, {"id": r["id"], "at": r["created_at"]})

        if action == "poll":
            ack = [int(x) for x in (body.get("ack") or [])[:500] if str(x).isdigit()]
            cursor = s["msg_cursor"]
            new_cursor = int(body.get("cursor") or 0)
            if ack:
                cur.execute(
                    f"""UPDATE {S}.messages m SET delivered_at=NOW()
                    FROM {S}.chats c WHERE c.id=m.chat_id AND (c.user_a=%s OR c.user_b=%s)
                    AND m.sender_id<>%s AND m.id = ANY(%s) AND m.delivered_at IS NULL""",
                    (me, me, me, ack),
                )
            if new_cursor > cursor:
                cursor = min(new_cursor, max_msg_id(cur, me))
                cur.execute(f"UPDATE {S}.sessions SET msg_cursor=%s WHERE id=%s", (cursor, sid))
                purge_delivered(cur, me)
            read_chat = int(body.get("readChat") or 0)
            gchat.mark_read(cur, S, me, -read_chat if read_chat < 0 else 0)
            if read_chat > 0 and chat_access(cur, me, read_chat):
                cur.execute(
                    f"""UPDATE {S}.messages SET read_at=NOW() WHERE chat_id=%s AND sender_id<>%s
                    AND read_at IS NULL AND delivered_at IS NOT NULL""",
                    (read_chat, me),
                )
            return resp(200, {"chats": list_chats(cur, me), "groups": gchat.list_groups(cur, S, me, ONLINE_SECONDS),
                              "inbox": inbox(cur, me, sid, cursor), "cursor": cursor, "incoming": incoming_call(cur, me),
                              "incomingGroup": group.incoming_group(cur, S, me)})

        if action == "file_put":
            raw = str(body.get("data") or "")
            if not raw or len(raw) > 3_000_000:
                return err(400, "Слишком большой фрагмент файла")
            data = base64.b64decode(raw)
            key = f"chatfiles/{uuid.uuid4().hex}.bin"
            s3 = boto3.client("s3", endpoint_url="https://bucket.poehali.dev",
                              aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                              aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"])
            s3.put_object(Bucket="files", Key=key, Body=data, ContentType="application/octet-stream")
            return resp(200, {"url": f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"})

        if action.startswith("gchat_"):
            def direct_unread(uid):
                cur.execute(
                    f"""SELECT COUNT(*) AS n FROM {S}.messages m JOIN {S}.chats c ON c.id=m.chat_id
                    WHERE (c.user_a=%s OR c.user_b=%s) AND m.sender_id<>%s AND m.read_at IS NULL""",
                    (uid, uid, uid),
                )
                return int(cur.fetchone()["n"])
            return gchat.handle(action, body, cur, S, me, resp, err, ONLINE_SECONDS, direct_unread)

        if action.startswith("group_"):
            return group.handle(action, body, cur, S, me, resp, err)

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
            return resp(200, {"calls": out, "groupCalls": group.history(cur, S, me)})

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
                f"UPDATE {S}.calls SET offer=NULL, answer=NULL WHERE status NOT IN ('ringing','active') AND (caller_id=%s OR callee_id=%s) AND offer IS NOT NULL",
                (me, me),
            )
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
            new_id = cur.fetchone()["id"]
            cur.execute(f"SELECT name FROM {S}.users WHERE id=%s", (me,))
            my_name = cur.fetchone()["name"]
            send_push(cur, S, other, {"type": "call", "callId": new_id, "kind": kind, "from": my_name,
                                      "title": my_name,
                                      "body": "Входящий видеозвонок" if kind == "video" else "Входящий аудиозвонок"},
                      ttl=RING_SECONDS, urgency="high")
            return resp(200, {"callId": new_id})

        if action in ("call_get", "call_answer", "call_end", "call_reoffer", "call_reanswer"):
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
            if action == "call_reoffer":
                if c["status"] != "active":
                    return err(409, "Звонок уже завершён")
                seq = int(c["reseq"] or 0) + 1
                cur.execute(
                    f"UPDATE {S}.calls SET reoffer=%s, reseq=%s, reanswer=NULL WHERE id=%s",
                    (json.dumps({"by": me, "data": str(body.get("offer") or "")}), seq, call_id),
                )
                return resp(200, {"seq": seq})
            if action == "call_reanswer":
                if c["status"] != "active":
                    return err(409, "Звонок уже завершён")
                cur.execute(
                    f"UPDATE {S}.calls SET reanswer=%s, reanswer_seq=%s WHERE id=%s",
                    (json.dumps({"by": me, "data": str(body.get("answer") or "")}), int(body.get("seq") or 0), call_id),
                )
                return resp(200, {"ok": True})
            if action == "call_end":
                if c["status"] in ("ringing", "active"):
                    new_status = "declined" if c["status"] == "ringing" and c["callee_id"] == me else "ended"
                    cur.execute(f"UPDATE {S}.calls SET status=%s, ended_at=NOW(), offer=NULL, answer=NULL, reoffer=NULL, reanswer=NULL WHERE id=%s", (new_status, call_id))
                else:
                    cur.execute(f"UPDATE {S}.calls SET offer=NULL, answer=NULL WHERE id=%s", (call_id,))
                return resp(200, {"ok": True})
            status = c["status"]
            if status == "ringing" and (c["created_at"] is not None):
                cur.execute(f"SELECT (NOW() - %s) > INTERVAL '{RING_SECONDS} seconds' AS old", (c["created_at"],))
                if cur.fetchone()["old"]:
                    cur.execute(f"UPDATE {S}.calls SET status='missed', ended_at=NOW(), offer=NULL, answer=NULL WHERE id=%s", (call_id,))
                    status = "missed"
            reoffer = json.loads(c["reoffer"]) if c.get("reoffer") else None
            reanswer = json.loads(c["reanswer"]) if c.get("reanswer") else None
            return resp(200, {
                "status": status,
                "answer": c["answer"] if c["caller_id"] == me else None,
                "offer": c["offer"] if c["callee_id"] == me and status == "ringing" else None,
                "kind": c["kind"],
                "reseq": c["reseq"],
                "reoffer": reoffer["data"] if reoffer and reoffer["by"] != me else None,
                "reanswerSeq": c["reanswer_seq"],
                "reanswer": reanswer["data"] if reanswer and reanswer["by"] != me else None,
            })

        return err(400, "Неизвестное действие")
    finally:
        cur.close()
        conn.close()