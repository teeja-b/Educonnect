"""
EduConnect call signalling + call notifications.

The server owns the state of every call:

    ringing ──accept──▶ accepted ──end──▶ ended
       │
       ├─decline──▶ declined          (callee said no)
       ├─end by caller──▶ cancelled   (caller hung up first)
       └─timeout / unreachable──▶ missed

Every change is pushed to *all* of both users' sockets (room "user:<id>") and,
while the call is ringing, to the callee's phones as a push notification with
Accept / Decline buttons. When the call leaves "ringing" for any reason a
headless "call_cancelled" push removes that notification. Accepting is an
atomic ringing→accepted update that also checks the ring deadline, so a stale
notification can never pick up a call that is already over.

Usage (at the end of app.py, after all models):

    from call_system import register_call_system
    call_system = register_call_system(app, db, socketio, User, FCMToken,
                                       active_connections=active_connections,
                                       user_rooms=user_rooms)
"""
import calendar
import os
import re
import threading
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import push

RING_TIMEOUT_SECONDS = int(os.getenv("CALL_RING_TIMEOUT_SECONDS", "45"))
DISCONNECT_GRACE_SECONDS = int(os.getenv("CALL_DISCONNECT_GRACE_SECONDS", "10"))
# Old app builds connect with { userId } only. Set to "true" once every client
# sends { token } so sockets can't claim to be someone else.
SOCKET_REQUIRE_JWT = os.getenv("SOCKET_REQUIRE_JWT", "false").lower() == "true"

RINGING, ACCEPTED, DECLINED, CANCELLED, MISSED, ENDED = (
    "ringing", "accepted", "declined", "cancelled", "missed", "ended")

CALL_ID_RE = re.compile(r"^[A-Za-z0-9_\-:.]{6,120}$")


def log(msg, **fields):
    extra = " ".join(f"{k}={v}" for k, v in fields.items() if v is not None)
    print(f"[CALL] {msg} {extra}".rstrip(), flush=True)


def utcnow():
    return datetime.utcnow()


def to_ms(dt):
    return calendar.timegm(dt.utctimetuple()) * 1000 + dt.microsecond // 1000 if dt else None


def as_user_id(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ─── Storage ─────────────────────────────────────────────────────────────────

@dataclass
class CallRecord:
    id: str
    caller_id: int
    callee_id: int
    status: str
    created_at: datetime
    expires_at: datetime
    answered_at: datetime = None
    ended_at: datetime = None
    end_reason: str = None
    ended_by: int = None


class MemoryCallStore:
    """Reference store (used by the tests). SqlCallStore mirrors it."""

    def __init__(self):
        self._calls = {}
        self._lock = threading.Lock()

    def get(self, call_id):
        with self._lock:
            rec = self._calls.get(call_id)
            return None if rec is None else CallRecord(**rec.__dict__)

    def create_ringing(self, call_id, caller_id, callee_id, now, expires_at):
        with self._lock:
            if call_id in self._calls:
                return CallRecord(**self._calls[call_id].__dict__), False
            rec = CallRecord(call_id, caller_id, callee_id, RINGING, now, expires_at)
            self._calls[call_id] = rec
            return CallRecord(**rec.__dict__), True

    def transition(self, call_id, from_statuses, to_status, now, unexpired=None, **fields):
        with self._lock:
            rec = self._calls.get(call_id)
            if rec is None or rec.status not in from_statuses:
                return False
            if unexpired is True and not rec.expires_at > now:
                return False
            if unexpired is False and not rec.expires_at <= now:
                return False
            rec.status = to_status
            for k, v in fields.items():
                setattr(rec, k, v)
            return True

    def ringing_for_callee(self, user_id):
        with self._lock:
            return [CallRecord(**r.__dict__) for r in self._calls.values()
                    if r.callee_id == user_id and r.status == RINGING]

    def ringing_for_caller(self, user_id):
        with self._lock:
            return [CallRecord(**r.__dict__) for r in self._calls.values()
                    if r.caller_id == user_id and r.status == RINGING]


# ─── Core logic ──────────────────────────────────────────────────────────────

class CallService:
    """
    store     – MemoryCallStore / SqlCallStore
    notifier  – .emit(user_id, event, payload)  .is_online(user_id)
    pusher    – .send(user_id, payload) -> {"sent": n, ...}
    users     – .get(user_id) -> {"id", "name", "role"} | None
    scheduler – .run_async(fn)  .run_later(seconds, fn)
    """

    def __init__(self, store, notifier, pusher, users, scheduler, clock=utcnow,
                 ring_timeout=RING_TIMEOUT_SECONDS):
        self.store, self.notifier, self.pusher = store, notifier, pusher
        self.users, self.scheduler, self.clock = users, scheduler, clock
        self.ring_timeout = ring_timeout

    # ── views ────────────────────────────────────────────────────────────────
    def view(self, rec):
        caller = self.users.get(rec.caller_id) or {}
        callee = self.users.get(rec.callee_id) or {}
        return {
            "callId": rec.id,
            "meetingId": rec.id,              # Agora channel name
            "status": rec.status,
            "isRinging": rec.status == RINGING and rec.expires_at > self.clock(),
            "callerId": rec.caller_id,
            "callerName": caller.get("name") or "Unknown caller",
            "callerRole": caller.get("role") or "",
            "calleeId": rec.callee_id,
            "calleeName": callee.get("name") or "",
            "createdAt": to_ms(rec.created_at),
            "expiresAt": to_ms(rec.expires_at),
            "reason": rec.end_reason,
            "endedBy": rec.ended_by,
        }

    def _broadcast_state(self, rec):
        v = self.view(rec)
        self.notifier.emit(rec.caller_id, "call_state", v)
        self.notifier.emit(rec.callee_id, "call_state", v)
        return v

    # ── start ────────────────────────────────────────────────────────────────
    def start_call(self, caller_id, callee_id, call_id):
        caller_id, callee_id = as_user_id(caller_id), as_user_id(callee_id)

        def reject(reason, status_code):
            log("start rejected", call=call_id, caller=caller_id, callee=callee_id, reason=reason)
            if caller_id is not None:
                self.notifier.emit(caller_id, "call_declined",
                                   {"meetingId": call_id, "callId": call_id, "reason": reason})
            return False, None, reason, status_code

        if caller_id is None or callee_id is None:
            return reject("invalid_user", 400)
        if not isinstance(call_id, str) or not CALL_ID_RE.match(call_id):
            return reject("invalid_call_id", 400)
        if caller_id == callee_id:
            return reject("cannot_call_self", 400)
        if not self.users.get(callee_id):
            return reject("callee_not_found", 404)

        now = self.clock()
        for other in self.store.ringing_for_callee(callee_id):
            other = self._refresh(other.id)
            if other and other.id != call_id and other.status == RINGING:
                return reject("busy", 409)

        rec, created = self.store.create_ringing(
            call_id, caller_id, callee_id, now, now + timedelta(seconds=self.ring_timeout))
        if not created:
            if rec.caller_id != caller_id or rec.callee_id != callee_id:
                return reject("call_id_conflict", 409)
            log("duplicate start ignored", call=call_id)
            return True, self.view(rec), None, 200

        v = self.view(rec)
        log("ringing", call=call_id, caller=caller_id, callee=callee_id,
            callee_online=self.notifier.is_online(callee_id))
        self.notifier.emit(callee_id, "incoming_video_call", dict(v, joinUrl=""))
        self.notifier.emit(caller_id, "call_state", v)
        self.scheduler.run_async(lambda: self._push_ring(call_id))
        self.scheduler.run_later(self.ring_timeout + 1, lambda: self.expire(call_id))
        return True, v, None, 201

    def _push_ring(self, call_id):
        rec = self.store.get(call_id)
        if not rec or rec.status != RINGING:
            return
        v = self.view(rec)
        p = push.build_call({
            "callId": rec.id, "callerId": rec.caller_id, "callerName": v["callerName"],
            "callerRole": v["callerRole"], "expiresAt": v["expiresAt"],
            "ttl": max(1, int((rec.expires_at - self.clock()).total_seconds())),
        })
        result = self.pusher.send(rec.callee_id, p) or {}
        if result.get("sent", 0) == 0 and not self.notifier.is_online(rec.callee_id):
            log("callee unreachable (no socket, no push delivered)", call=call_id, callee=rec.callee_id)
            self._finish(call_id, {RINGING}, MISSED, reason="unreachable")

    # ── transitions ──────────────────────────────────────────────────────────
    def _refresh(self, call_id):
        """Lazily expire a ringing call whose deadline has passed."""
        rec = self.store.get(call_id)
        if rec and rec.status == RINGING and rec.expires_at <= self.clock():
            self.expire(call_id)
            rec = self.store.get(call_id)
        return rec

    def _load_for(self, call_id, user_id, callee_only=False):
        user_id = as_user_id(user_id)
        rec = self._refresh(call_id) if isinstance(call_id, str) else None
        if not rec:
            return None, "not_found", 404
        allowed = (user_id == rec.callee_id) if callee_only else user_id in (rec.caller_id, rec.callee_id)
        if not allowed:
            return None, "forbidden", 403
        return rec, None, None

    def accept(self, call_id, user_id):
        rec, err, code = self._load_for(call_id, user_id, callee_only=True)
        if err:
            return False, None, err, code
        now = self.clock()
        if not self.store.transition(call_id, {RINGING}, ACCEPTED, now, unexpired=True, answered_at=now):
            rec = self._refresh(call_id)
            log("accept refused — call not ringing", call=call_id, user=user_id, status=rec.status)
            return False, self.view(rec), "not_ringing", 409
        rec = self.store.get(call_id)
        log("accepted", call=call_id, callee=rec.callee_id)
        self.notifier.emit(rec.caller_id, "call_accepted",
                           {"meetingId": rec.id, "callId": rec.id, "acceptedBy": rec.callee_id})
        v = self._broadcast_state(rec)
        self._cancel_callee_notifications(rec, "answered")
        return True, v, None, 200

    def decline(self, call_id, user_id, reason="declined"):
        rec, err, code = self._load_for(call_id, user_id, callee_only=True)
        if err:
            return False, None, err, code
        if rec.status == DECLINED:
            return True, self.view(rec), None, 200          # idempotent (button + socket race)
        if not self._finish(call_id, {RINGING}, DECLINED, reason=reason, ended_by=rec.callee_id):
            rec = self.store.get(call_id)
            return False, self.view(rec), "not_ringing", 409
        return True, self.view(self.store.get(call_id)), None, 200

    def end(self, call_id, user_id, reason="hangup"):
        rec, err, code = self._load_for(call_id, user_id)
        if err:
            return False, None, err, code
        uid = as_user_id(user_id)
        if rec.status == RINGING:
            if uid == rec.callee_id:
                return self.decline(call_id, uid)
            self._finish(call_id, {RINGING}, CANCELLED, reason="cancelled", ended_by=uid)
        elif rec.status == ACCEPTED:
            now = self.clock()
            if self.store.transition(call_id, {ACCEPTED}, ENDED, now, ended_at=now,
                                     end_reason=reason, ended_by=uid):
                rec = self.store.get(call_id)
                other = rec.caller_id if uid == rec.callee_id else rec.callee_id
                log("ended", call=call_id, by=uid)
                self.notifier.emit(other, "call_ended",
                                   {"meetingId": rec.id, "callId": rec.id, "endedBy": uid, "reason": reason})
                self._broadcast_state(rec)
        return True, self.view(self.store.get(call_id)), None, 200

    def expire(self, call_id):
        rec = self.store.get(call_id)
        if not rec or rec.status != RINGING:
            return False
        return self._finish(call_id, {RINGING}, MISSED, reason="no_answer", unexpired=False)

    def _finish(self, call_id, from_statuses, to_status, reason, ended_by=None, unexpired=None):
        """ringing → declined / cancelled / missed, with all the notifications."""
        now = self.clock()
        if not self.store.transition(call_id, from_statuses, to_status, now, unexpired=unexpired,
                                     ended_at=now, end_reason=reason, ended_by=ended_by):
            return False
        rec = self.store.get(call_id)
        log(to_status, call=call_id, reason=reason, by=ended_by)
        event = {"meetingId": rec.id, "callId": rec.id, "reason": reason}
        if to_status == DECLINED:
            self.notifier.emit(rec.caller_id, "call_declined", dict(event, declinedBy=rec.callee_id))
        elif to_status == MISSED:
            # VoiceCall on the caller's side listens for call_declined to hang up
            self.notifier.emit(rec.caller_id, "call_declined", event)
            self.notifier.emit(rec.callee_id, "call_ended", event)
        elif to_status == CANCELLED:
            self.notifier.emit(rec.callee_id, "call_ended", dict(event, endedBy=rec.caller_id))
        self._broadcast_state(rec)
        self._cancel_callee_notifications(rec, reason,
                                          missed=to_status in (MISSED, CANCELLED) and reason != "unreachable")
        return True

    def _cancel_callee_notifications(self, rec, reason, missed=False):
        callee, call_id = rec.callee_id, rec.id
        caller_name = self.view(rec)["callerName"]

        def job():
            self.pusher.send(callee, push.build_call_cancelled(call_id, reason))
            if missed:
                self.pusher.send(callee, push.build_missed_call(call_id, rec.caller_id, caller_name))
        self.scheduler.run_async(job)

    # ── queries ──────────────────────────────────────────────────────────────
    def status(self, call_id, user_id):
        rec, err, code = self._load_for(call_id, user_id)
        if err:
            return False, None, err, code
        return True, self.view(rec), None, 200

    def pending_for(self, user_id):
        uid = as_user_id(user_id)
        best = None
        for rec in self.store.ringing_for_callee(uid):
            rec = self._refresh(rec.id)
            if rec and rec.status == RINGING and (best is None or rec.created_at > best.created_at):
                best = rec
        return self.view(best) if best else None

    def caller_went_offline(self, user_id):
        for rec in self.store.ringing_for_caller(as_user_id(user_id)):
            log("caller disconnected while ringing — cancelling", call=rec.id, caller=user_id)
            self.end(rec.id, user_id, reason="caller_disconnected")

    def send_test_call(self, user_id):
        user = self.users.get(as_user_id(user_id)) or {}
        call_id = f"test-{uuid.uuid4().hex[:12]}"
        expires = self.clock() + timedelta(seconds=30)
        p = push.build_call({"callId": call_id, "callerId": as_user_id(user_id),
                             "callerName": "EduConnect test", "callerRole": user.get("role", ""),
                             "expiresAt": to_ms(expires), "ttl": 30, "test": True})
        return call_id, self.pusher.send(as_user_id(user_id), p)


def is_test_call(call_id):
    return isinstance(call_id, str) and call_id.startswith("test-")


# ─── Flask / Socket.IO wiring ────────────────────────────────────────────────

def register_call_system(app, db, socketio, User, FCMToken, active_connections=None, user_rooms=None):
    from flask import jsonify, request
    from flask_jwt_extended import decode_token, get_jwt_identity, jwt_required
    from flask_socketio import emit, join_room
    from sqlalchemy.exc import IntegrityError

    active_connections = active_connections if active_connections is not None else {}
    user_rooms = user_rooms if user_rooms is not None else {}

    # ── model ────────────────────────────────────────────────────────────────
    class CallSession(db.Model):
        __tablename__ = "call_session"
        id = db.Column(db.String(128), primary_key=True)
        caller_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
        callee_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
        status = db.Column(db.String(16), nullable=False, default=RINGING, index=True)
        created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
        expires_at = db.Column(db.DateTime, nullable=False)
        answered_at = db.Column(db.DateTime)
        ended_at = db.Column(db.DateTime)
        end_reason = db.Column(db.String(40))
        ended_by = db.Column(db.Integer)

    with app.app_context():
        CallSession.__table__.create(bind=db.engine, checkfirst=True)

    def rec_of(row):
        if row is None:
            return None
        return CallRecord(row.id, row.caller_id, row.callee_id, row.status, row.created_at,
                          row.expires_at, row.answered_at, row.ended_at, row.end_reason, row.ended_by)

    class SqlCallStore:
        def get(self, call_id):
            db.session.expire_all()
            return rec_of(db.session.get(CallSession, call_id))

        def create_ringing(self, call_id, caller_id, callee_id, now, expires_at):
            row = CallSession(id=call_id, caller_id=caller_id, callee_id=callee_id,
                              status=RINGING, created_at=now, expires_at=expires_at)
            db.session.add(row)
            try:
                db.session.commit()
                return rec_of(row), True
            except IntegrityError:
                db.session.rollback()
                return self.get(call_id), False

        def transition(self, call_id, from_statuses, to_status, now, unexpired=None, **fields):
            q = CallSession.query.filter(CallSession.id == call_id,
                                         CallSession.status.in_(list(from_statuses)))
            if unexpired is True:
                q = q.filter(CallSession.expires_at > now)
            elif unexpired is False:
                q = q.filter(CallSession.expires_at <= now)
            values = {CallSession.status: to_status}
            for k, v in fields.items():
                values[getattr(CallSession, k)] = v
            try:
                n = q.update(values, synchronize_session=False)
                db.session.commit()
                return n == 1
            except Exception as e:                              # noqa: BLE001
                db.session.rollback()
                log("transition failed", call=call_id, to=to_status, error=repr(e))
                return False

        def ringing_for_callee(self, user_id):
            return [rec_of(r) for r in CallSession.query.filter_by(callee_id=user_id, status=RINGING)]

        def ringing_for_caller(self, user_id):
            return [rec_of(r) for r in CallSession.query.filter_by(caller_id=user_id, status=RINGING)]

    # ── connections ──────────────────────────────────────────────────────────
    conn_lock = threading.Lock()
    sid_user = {}
    user_sids = defaultdict(set)

    class Notifier:
        def emit(self, user_id, event, payload):
            socketio.emit(event, payload, to=f"user:{user_id}")

        def is_online(self, user_id):
            with conn_lock:
                return bool(user_sids.get(user_id))

    class Pusher:
        def send(self, user_id, payload):
            rows = FCMToken.query.filter_by(user_id=user_id, is_active=True).all()
            result = push.deliver(user_id, rows, payload)
            if result["dead"]:
                for row in rows:
                    if row.token in result["dead"]:
                        row.is_active = False
                        push.log("deactivated dead token", user=user_id, token_id=row.id)
                db.session.commit()
            return result

    class Users:
        def get(self, user_id):
            u = db.session.get(User, user_id) if user_id is not None else None
            return {"id": u.id, "name": u.full_name, "role": u.user_type} if u else None

    def in_context(fn):
        def run():
            with app.app_context():
                try:
                    fn()
                except Exception as e:                          # noqa: BLE001
                    log("background task failed", error=repr(e))
                    import traceback
                    traceback.print_exc()
        return run

    class Scheduler:
        def run_async(self, fn):
            socketio.start_background_task(in_context(fn))

        def run_later(self, seconds, fn):
            def delayed():
                socketio.sleep(seconds)
                in_context(fn)()
            socketio.start_background_task(delayed)

    service = CallService(SqlCallStore(), Notifier(), Pusher(), Users(), Scheduler())

    # ── socket auth ──────────────────────────────────────────────────────────
    def authenticate(auth):
        auth = auth or {}
        token = auth.get("token")
        if token:
            try:
                return as_user_id(decode_token(token).get("sub"))
            except Exception as e:                              # noqa: BLE001
                log("socket rejected — bad token", error=type(e).__name__)
                return None
        if SOCKET_REQUIRE_JWT:
            log("socket rejected — no token")
            return None
        uid = as_user_id(auth.get("userId"))
        if uid is not None:
            log("socket authenticated by legacy userId (update the app to send a token)", user=uid)
        return uid

    def current_user():
        with conn_lock:
            return sid_user.get(request.sid)

    @socketio.on("connect")
    def callsys_connect(auth=None):
        uid = authenticate(auth)
        if uid is None:
            return False
        with conn_lock:
            sid_user[request.sid] = uid
            user_sids[uid].add(request.sid)
        join_room(f"user:{uid}")
        active_connections[uid] = request.sid
        user_rooms.setdefault(uid, [])
        log("socket connected", user=uid, sid=request.sid)
        emit("user_status", {"userId": uid, "status": "online"}, broadcast=True, include_self=False)
        emit("users_online", list(active_connections.keys()))
        return True

    @socketio.on("disconnect")
    def callsys_disconnect(*_args):
        sid = request.sid
        with conn_lock:
            uid = sid_user.pop(sid, None)
            if uid is None:
                return
            user_sids[uid].discard(sid)
            remaining = bool(user_sids[uid])
            if not remaining:
                user_sids.pop(uid, None)
        if active_connections.get(uid) == sid:
            if remaining:
                with conn_lock:
                    active_connections[uid] = next(iter(user_sids.get(uid, {sid})))
            else:
                active_connections.pop(uid, None)
        log("socket disconnected", user=uid, sid=sid, other_connections=remaining)
        if not remaining:
            user_rooms.pop(uid, None)
            socketio.emit("user_status", {"userId": uid, "status": "offline"})

            def maybe_cancel():
                if not Notifier().is_online(uid):
                    service.caller_went_offline(uid)
            service.scheduler.run_later(DISCONNECT_GRACE_SECONDS, maybe_cancel)

    # ── socket call events (names kept for the existing VoiceCall screens) ───
    @socketio.on("initiate_video_call")
    def callsys_initiate(data):
        data = data or {}
        uid = current_user()
        call_id = data.get("meetingId")
        if uid is None:
            emit("call_failed", {"meetingId": call_id, "error": "not_authenticated"})
            return
        ok, view, err, _ = service.start_call(uid, data.get("receiverId"), call_id)
        emit("call_initiated", {"meetingId": call_id, "status": "ringing" if ok else "failed",
                                "error": err, "call": view})

    @socketio.on("call_accepted")
    def callsys_accept_socket(data):
        uid = current_user()
        if uid is not None and not is_test_call((data or {}).get("meetingId")):
            service.accept((data or {}).get("meetingId"), uid)

    @socketio.on("call_declined")
    def callsys_decline_socket(data):
        uid = current_user()
        if uid is not None and not is_test_call((data or {}).get("meetingId")):
            service.decline((data or {}).get("meetingId"), uid)

    @socketio.on("end_video_call")
    def callsys_end_socket(data):
        data = data or {}
        uid = current_user()
        call_id = data.get("meetingId")
        if uid is None or not call_id:
            return
        ok, _, err, _ = service.end(call_id, uid)
        if err == "not_found":
            other = as_user_id(data.get("otherUserId"))           # call started before this deploy
            if other is not None:
                Notifier().emit(other, "call_ended", {"meetingId": call_id, "endedBy": uid})

    # ── HTTP API (used by notification buttons, which may run with no socket) ─
    def respond(result):
        ok, view, err, code = result
        body = {"success": ok, "call": view}
        if err:
            body["error"] = err
        return jsonify(body), code

    def test_response(call_id, status):
        return jsonify({"success": True, "call": {"callId": call_id, "status": status, "test": True}}), 200

    @app.route("/api/calls/pending", methods=["GET"], endpoint="callsys_pending")
    @jwt_required()
    def callsys_pending():
        return jsonify({"call": service.pending_for(get_jwt_identity())}), 200

    @app.route("/api/calls/<call_id>", methods=["GET"], endpoint="callsys_status")
    @jwt_required()
    def callsys_status(call_id):
        if is_test_call(call_id):
            return test_response(call_id, RINGING)
        return respond(service.status(call_id, get_jwt_identity()))

    @app.route("/api/calls/<call_id>/accept", methods=["POST"], endpoint="callsys_accept")
    @jwt_required()
    def callsys_accept(call_id):
        if is_test_call(call_id):
            return test_response(call_id, ACCEPTED)
        return respond(service.accept(call_id, get_jwt_identity()))

    @app.route("/api/calls/<call_id>/decline", methods=["POST"], endpoint="callsys_decline")
    @jwt_required()
    def callsys_decline(call_id):
        if is_test_call(call_id):
            return test_response(call_id, DECLINED)
        return respond(service.decline(call_id, get_jwt_identity()))

    @app.route("/api/calls/<call_id>/end", methods=["POST"], endpoint="callsys_end")
    @jwt_required()
    def callsys_end(call_id):
        return respond(service.end(call_id, get_jwt_identity()))

    # ── push device registration ─────────────────────────────────────────────
    @app.route("/api/push/register", methods=["POST"], endpoint="callsys_push_register")
    @jwt_required()
    def callsys_push_register():
        uid = as_user_id(get_jwt_identity())
        data = request.get_json(silent=True) or {}
        token = (data.get("token") or "").strip()
        platform = (data.get("platform") or "").lower()
        previous = (data.get("previous_token") or "").strip()
        if not token or platform not in ("android", "ios"):
            return jsonify({"error": "token and platform (android|ios) are required"}), 400
        if len(token) > 500:
            return jsonify({"error": "token too long"}), 400
        try:
            row = FCMToken.query.filter_by(token=token).first()
            if row:
                row.user_id, row.device_type, row.is_active, row.last_used = uid, platform, True, utcnow()
            else:
                db.session.add(FCMToken(user_id=uid, token=token, device_type=platform))
            if previous and previous != token:
                FCMToken.query.filter_by(token=previous).update({"is_active": False})
                        # Old app builds registered an Expo token for this phone; the new build
            # uses the native FCM token. Keeping both makes every call ring twice.
            if platform == "android" and not push.is_expo_token(token):
                for old in FCMToken.query.filter_by(user_id=uid, device_type="android", is_active=True).all():
                    if old.token != token and push.is_expo_token(old.token):
                        old.is_active = False
                        push.log("deactivated legacy Expo token", user=uid, token_id=old.id)
            db.session.commit()
        except Exception as e:                                  # noqa: BLE001
            db.session.rollback()
            push.log("token registration failed", user=uid, error=repr(e))
            return jsonify({"error": "registration failed"}), 500
        push.log("device registered", user=uid, platform=platform,
                 provider=push.provider_for(token), token=push.mask(token),
                 replaced=push.mask(previous) if previous and previous != token else None)
        return jsonify({"success": True, "provider": push.provider_for(token)}), 200

    @app.route("/api/push/unregister", methods=["POST"], endpoint="callsys_push_unregister")
    @jwt_required()
    def callsys_push_unregister():
        uid = as_user_id(get_jwt_identity())
        token = ((request.get_json(silent=True) or {}).get("token") or "").strip()
        if token:
            FCMToken.query.filter_by(token=token, user_id=uid).update({"is_active": False})
            db.session.commit()
            push.log("device unregistered", user=uid, token=push.mask(token))
        return jsonify({"success": True}), 200

    @app.route("/api/push/diagnostics", methods=["GET"], endpoint="callsys_push_diagnostics")
    @jwt_required()
    def callsys_push_diagnostics():
        uid = as_user_id(get_jwt_identity())
        rows = FCMToken.query.filter_by(user_id=uid).order_by(FCMToken.last_used.desc()).all()
        return jsonify({
            "firebase": push.firebase_status(),
            "socket_online": Notifier().is_online(uid),
            "devices": [{"id": r.id, "platform": r.device_type, "provider": push.provider_for(r.token),
                         "token": push.mask(r.token), "active": r.is_active,
                         "last_used": r.last_used.isoformat() if r.last_used else None} for r in rows],
            "recent_pushes": push.recent_for(uid),
            "pending_call": service.pending_for(uid),
        }), 200

    @app.route("/api/push/test-call", methods=["POST"], endpoint="callsys_push_test_call")
    @jwt_required()
    def callsys_push_test_call():
        call_id, result = service.send_test_call(get_jwt_identity())
        return jsonify({"success": result.get("sent", 0) > 0, "callId": call_id, **result}), 200

    # ── helpers for the rest of app.py ───────────────────────────────────────
    def notify_new_message(sender_id, receiver_id, message_text, conversation_id):
        sender = Users().get(as_user_id(sender_id))
        receiver = as_user_id(receiver_id)
        if not sender or receiver is None:
            return
        text = message_text or "Sent a file"
        preview = text[:100] + "…" if len(text) > 100 else text
        p = push.build_message(sender["id"], sender["name"], preview, conversation_id)
        service.scheduler.run_async(lambda: Pusher().send(receiver, p))

    def emit_to_user(user_id, event, payload):
        Notifier().emit(as_user_id(user_id), event, payload)

    push.firebase_ready()
    log("call system registered", ring_timeout=RING_TIMEOUT_SECONDS, require_jwt=SOCKET_REQUIRE_JWT)

    class Handle:
        pass
    h = Handle()
    h.service, h.model = service, CallSession
    h.notify_new_message, h.emit_to_user = notify_new_message, emit_to_user
    h.is_online = Notifier().is_online
    return h
