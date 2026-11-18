"""
EduConnect push delivery.

Two transports, chosen per device token:

* Android (new app builds)  -> FCM HTTP v1 via firebase_admin, sent to the
  *native* FCM token from Notifications.getDevicePushTokenAsync().
  Messages are FCM **data** messages. expo-notifications receives them and
  draws the notification itself, which is what makes the Accept / Decline
  category buttons appear even when the app is in the background or killed.
  (Anything sent through Expo's push service to Android arrives as an FCM
  *notification* message instead; the OS draws those and drops the buttons.)

* iOS + old Android builds  -> Expo push service with an ExponentPushToken.
  iOS renders category buttons for remote notifications natively.

Every send is logged and kept in a small per-user ring buffer that the
/api/push/diagnostics endpoint exposes.
"""
import json
import os
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta

import requests

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Must match src/calls/constants.js in the app.
CALL_CATEGORY = "incoming_call"
CALL_CHANNEL = "incoming_calls_v5"
MISSED_CALL_CHANNEL = "missed_calls"
MESSAGE_CHANNEL = "messages"
CALL_SOUND = os.getenv("CALL_NOTIFICATION_SOUND", "ringtone.wav")

PROVIDER_FCM = "fcm"
PROVIDER_EXPO = "expo"

_firebase_ready = None          # None = not tried yet
_firebase_error = None
_firebase_lock = threading.Lock()

_log_lock = threading.Lock()
_recent = defaultdict(lambda: deque(maxlen=40))


def log(msg, **fields):
    extra = " ".join(f"{k}={v}" for k, v in fields.items() if v is not None)
    print(f"[PUSH] {msg} {extra}".rstrip(), flush=True)


def record(user_id, entry):
    entry = dict(entry, ts=time.time())
    with _log_lock:
        _recent[int(user_id)].append(entry)


def recent_for(user_id):
    with _log_lock:
        return list(_recent.get(int(user_id), []))


# ─── Firebase ────────────────────────────────────────────────────────────────

def firebase_ready():
    """Initialise firebase_admin once from FIREBASE_CREDENTIALS (service account JSON)."""
    global _firebase_ready, _firebase_error
    if _firebase_ready is not None:
        return _firebase_ready
    with _firebase_lock:
        if _firebase_ready is not None:
            return _firebase_ready
        try:
            import firebase_admin
            from firebase_admin import credentials
            if firebase_admin._apps:
                _firebase_ready = True
                return True
            raw = os.getenv("FIREBASE_CREDENTIALS")
            if not raw:
                raise RuntimeError("FIREBASE_CREDENTIALS env var is not set")
            firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
            _firebase_ready = True
            log("firebase_admin initialised")
        except Exception as e:                                  # noqa: BLE001
            _firebase_ready = False
            _firebase_error = str(e)
            log("firebase_admin NOT available — Android pushes will fail", error=repr(e))
        return _firebase_ready


def firebase_status():
    firebase_ready()
    return {"enabled": bool(_firebase_ready), "error": _firebase_error}


# ─── Token classification ────────────────────────────────────────────────────

def is_expo_token(token):
    return isinstance(token, str) and (
        token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")
    )


def provider_for(token):
    return PROVIDER_EXPO if is_expo_token(token) else PROVIDER_FCM


def mask(token):
    if not token:
        return None
    return f"{token[:12]}…{token[-6:]}" if len(token) > 24 else "***"


# ─── Payload builders (pure — unit tested) ───────────────────────────────────
# `app_data` is what the app reads (notification.request.content.data).

def build_call(call):
    """call: dict with callId, callerId, callerName, callerRole, expiresAt (ms)."""
    role = (call.get("callerRole") or "").capitalize()
    app_data = {
        "type": "call",
        "v": 2,
        "callId": call["callId"],
        "meetingId": call["callId"],
        "callerId": call["callerId"],
        "callerName": call["callerName"],
        "callerRole": call.get("callerRole") or "",
        "expiresAt": call["expiresAt"],
        "test": bool(call.get("test")),
    }
    title = f"Incoming call from {call['callerName']}"
    body = f"{role} · Voice call" if role else "Voice call"
    return {
        "kind": "call",
        "title": title,
        "body": body,
        "app_data": app_data,
        "channel": CALL_CHANNEL,
        "category": CALL_CATEGORY,
        "sound": CALL_SOUND,
        "ttl": max(1, int(call.get("ttl", 45))),
        "high_priority": True,
        "visible": True,
        # Android: sent silently; the app draws the notification itself on the
        # "Incoming calls" channel (expo-notifications ignores channelId in data
        # messages and would use its "Miscellaneous" channel with the default sound).
        "android_app_renders": True,
    }


def build_call_cancelled(call_id, reason):
    return {
        "kind": "call_cancelled",
        "app_data": {"type": "call_cancelled", "v": 2, "callId": call_id,
                     "meetingId": call_id, "reason": reason},
        "ttl": 120,
        "high_priority": True,
        "visible": False,            # headless: the app's task dismisses the call notification
    }


def build_missed_call(call_id, caller_id, caller_name):
    return {
        "kind": "missed_call",
        "title": "Missed call",
        "body": f"{caller_name} tried to call you",
        "app_data": {"type": "missed_call", "v": 2, "callId": call_id, "callerId": caller_id,
                     "callerName": caller_name},
        "channel": MISSED_CALL_CHANNEL,
        "sound": "default",
        "ttl": 86400,
        "high_priority": False,
        "visible": True,
    }


def build_message(sender_id, sender_name, preview, conversation_id):
    return {
        "kind": "message",
        "title": f"New message from {sender_name}",
        "body": preview,
        "app_data": {"type": "message", "v": 2, "senderId": sender_id, "senderName": sender_name,
                     "conversationId": conversation_id},
        "channel": MESSAGE_CHANNEL,
        "sound": "default",
        "ttl": 86400,
        "high_priority": True,
        "visible": True,
    }


def fcm_data(p):
    """
    FCM `data` map (all values must be strings) in the format expo-notifications
    reads on Android: title/message/channelId/categoryId are rendered natively,
    `body` (JSON) becomes notification.request.content.data in the app.
    A payload without title/message is a headless notification for the app's task.
    """
    data = {"body": json.dumps(p["app_data"], separators=(",", ":"))}
    if p.get("visible") and not p.get("android_app_renders"):
        data["title"] = p["title"]
        data["message"] = p["body"]
        data["channelId"] = p["channel"]
        data["priority"] = "max" if p["kind"] == "call" else "high"
        if p.get("sound"):
            data["sound"] = p["sound"]
        if p.get("category"):
            data["categoryId"] = p["category"]
    return data


def expo_message(token, p):
    if not p.get("visible"):
        return {"to": token, "data": p["app_data"], "priority": "high",
                "ttl": p["ttl"], "_contentAvailable": True}
    msg = {
        "to": token,
        "title": p["title"],
        "body": p["body"],
        "data": p["app_data"],
        "priority": "high" if p["high_priority"] else "default",
        "ttl": p["ttl"],
        "channelId": p["channel"],        # only used by old Android builds
        "sound": p.get("sound") or "default",
    }
    if p.get("category"):
        msg["categoryId"] = p["category"]
    if p["kind"] == "call":
        msg["interruptionLevel"] = "time-sensitive"
    return msg


# ─── Transports ──────────────────────────────────────────────────────────────

def _send_fcm(tokens, p):
    """Returns (ok_tokens, dead_tokens, errors{token: str})."""
    ok, dead, errors = [], [], {}
    if not tokens:
        return ok, dead, errors
    if not firebase_ready():
        for t in tokens:
            errors[t] = f"firebase not initialised: {_firebase_error}"
        return ok, dead, errors

    from firebase_admin import messaging
    android = messaging.AndroidConfig(
        priority="high" if p["high_priority"] else "normal",
        ttl=timedelta(seconds=p["ttl"]),
    )
    data = fcm_data(p)
    messages = [messaging.Message(data=data, android=android, token=t) for t in tokens]

    def classify(token, exc):
        name = type(exc).__name__
        text = str(exc)
        errors[token] = f"{name}: {text}"
        if name in ("UnregisteredError", "SenderIdMismatchError") or \
                "not a valid FCM registration token" in text or "Requested entity was not found" in text:
            dead.append(token)

    send_each = getattr(messaging, "send_each", None)
    if send_each:
        try:
            batch = send_each(messages)
            for token, resp in zip(tokens, batch.responses):
                if resp.success:
                    ok.append(token)
                else:
                    classify(token, resp.exception)
        except Exception as e:                                  # noqa: BLE001
            for t in tokens:
                errors[t] = f"batch failed: {e!r}"
    else:
        for token, m in zip(tokens, messages):
            try:
                messaging.send(m)
                ok.append(token)
            except Exception as e:                              # noqa: BLE001
                classify(token, e)
    return ok, dead, errors


def _send_expo(tokens, p):
    ok, dead, errors = [], [], {}
    if not tokens:
        return ok, dead, errors
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    access_token = os.getenv("EXPO_ACCESS_TOKEN")
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    for i in range(0, len(tokens), 100):
        chunk = tokens[i:i + 100]
        try:
            resp = requests.post(EXPO_PUSH_URL, json=[expo_message(t, p) for t in chunk],
                                 headers=headers, timeout=10)
            body = resp.json()
        except Exception as e:                                  # noqa: BLE001
            for t in chunk:
                errors[t] = f"request failed: {e!r}"
            continue
        if body.get("errors"):
            for t in chunk:
                errors[t] = f"expo errors: {body['errors']}"
            continue
        tickets = body.get("data", [])
        if isinstance(tickets, dict):
            tickets = [tickets]
        for token, ticket in zip(chunk, tickets):
            if ticket.get("status") == "ok":
                ok.append(token)
            else:
                detail = (ticket.get("details") or {}).get("error")
                errors[token] = f"{detail}: {ticket.get('message')}"
                if detail == "DeviceNotRegistered":
                    dead.append(token)
    return ok, dead, errors


def deliver(user_id, token_rows, p, context=None):
    """
    Send payload `p` to every token row. token_rows: objects with .id, .token, .device_type.
    Returns {"sent": n, "attempted": n, "dead": [token, ...]}.
    """
    by_provider = {PROVIDER_FCM: [], PROVIDER_EXPO: []}
    rows_by_token = {}
    # A phone with the new app registers a native FCM token. Any Expo token
    # registered for Android by the old app would make every call ring twice
    # (once without buttons), so those are skipped once an FCM token exists.
    has_android_fcm = any((r.device_type or "").lower() == "android" and provider_for(r.token) == PROVIDER_FCM
                          for r in token_rows)
    for row in token_rows:
        platform = (row.device_type or "").lower()
        if platform == "web" or row.token in rows_by_token:
            continue           # browsers get calls over the socket; skip duplicate rows
        if has_android_fcm and platform == "android" and provider_for(row.token) == PROVIDER_EXPO:
            log("skipped legacy Expo token (device has FCM token)", user=user_id, token_id=row.id)
            continue
        by_provider[provider_for(row.token)].append(row.token)
        rows_by_token[row.token] = row

    results = {}
    for provider, sender in ((PROVIDER_FCM, _send_fcm), (PROVIDER_EXPO, _send_expo)):
        toks = by_provider[provider]
        if not toks:
            continue
        ok, dead, errors = sender(toks, p)
        for t in toks:
            row = rows_by_token[t]
            legacy = provider == PROVIDER_EXPO and (row.device_type or "").lower() == "android"
            entry = {
                "kind": p["kind"], "callId": p["app_data"].get("callId"), "tokenId": row.id,
                "provider": provider, "platform": row.device_type, "legacy": legacy,
                "ok": t in ok, "error": errors.get(t), "deactivated": t in dead,
            }
            record(user_id, entry)
            log("sent" if t in ok else "FAILED", user=user_id, kind=p["kind"],
                call=p["app_data"].get("callId"), token_id=row.id, provider=provider,
                platform=row.device_type, legacy=legacy or None, error=errors.get(t), **(context or {}))
        results[provider] = (ok, dead)

    sent = sum(len(v[0]) for v in results.values())
    dead_all = [t for v in results.values() for t in v[1]]
    attempted = sum(len(v) for v in by_provider.values())
    if attempted == 0:
        record(user_id, {"kind": p["kind"], "callId": p["app_data"].get("callId"),
                         "ok": False, "error": "no registered devices"})
        log("no registered devices", user=user_id, kind=p["kind"], call=p["app_data"].get("callId"))
    return {"sent": sent, "attempted": attempted, "dead": dead_all}
