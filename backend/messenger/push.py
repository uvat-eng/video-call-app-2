import json
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException

CONTACT = "mailto:support@rusapp.su"


def _b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def get_vapid(cur, schema):
    cur.execute(f"SELECT key, value FROM {schema}.app_settings WHERE key IN ('vapid_private','vapid_public')")
    rows = {r["key"]: r["value"] for r in cur.fetchall()}
    if "vapid_private" in rows and "vapid_public" in rows:
        return rows["vapid_private"], rows["vapid_public"]
    key = ec.generate_private_key(ec.SECP256R1())
    priv = _b64u(key.private_numbers().private_value.to_bytes(32, "big"))
    pub = _b64u(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    cur.execute(
        f"INSERT INTO {schema}.app_settings (key, value) VALUES ('vapid_private', %s), ('vapid_public', %s) ON CONFLICT (key) DO NOTHING",
        (priv, pub),
    )
    cur.execute(f"SELECT key, value FROM {schema}.app_settings WHERE key IN ('vapid_private','vapid_public')")
    rows = {r["key"]: r["value"] for r in cur.fetchall()}
    return rows["vapid_private"], rows["vapid_public"]


def send_push(cur, schema, user_id, payload, ttl=60, urgency="high"):
    cur.execute(f"SELECT id, endpoint, p256dh, auth FROM {schema}.push_subs WHERE user_id=%s", (user_id,))
    subs = cur.fetchall()
    if not subs:
        return 0
    priv, _ = get_vapid(cur, schema)
    sent = 0
    dead = []
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
                data=json.dumps(payload, ensure_ascii=False),
                vapid_private_key=priv,
                vapid_claims={"sub": CONTACT},
                ttl=ttl,
                headers={"Urgency": urgency},
                timeout=3,
            )
            sent += 1
        except WebPushException as e:
            code = getattr(getattr(e, "response", None), "status_code", 0)
            if code in (404, 410):
                dead.append(s["id"])
        except Exception:
            continue
    if dead:
        cur.execute(f"DELETE FROM {schema}.push_subs WHERE id = ANY(%s)", (dead,))
    return sent
