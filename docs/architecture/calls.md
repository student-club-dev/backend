# Calls — 1:1 audio/video real-time protocol (ElonUz backend)

**Status:** shipped — Level 1 (audio/video calling between two connected students, signalling +
TURN relay only; no SFU, no group calls, no VoIP push — those are later phases).
**Design source:** `docs/superpowers/specs/2026-08-01-chat-calls-design.md` — full rationale for
every decision below, the glare algorithm's security analysis, and the VoIP-push phasing plan.
**Feeds:** the `calls` module. Built on top of the connections + chat subsystems in
`docs/architecture/chat.md` (chat is the access gate — you can only call a student you are
connected with) and appends a `CALL` message to the conversation when a call ends.

WebRTC itself is peer-to-peer: the server never sees decoded audio/video, only signalling (SDP,
ICE) and, when direct connectivity fails, relayed media through TURN. This document covers the
signalling protocol; TURN deployment is `deploy/coturn/README.md`.

---

## Namespace, auth, authorization

Namespace **`/calls`** (separate from `/chat` — an SDP can never reach a chat socket). The
handshake carries the access JWT the same way `/chat` does (`auth: { token }`), and each socket
joins one personal room, `user:{studentId}`.

**Rule 0 — every client → server event resolves the call and asserts the caller is one of its two
participants**, before anything else. A `callId` is an identifier, not a capability: without this
check, anyone who learns one could accept a stranger's invite (and listen to the live media), push
an SDP that redirects the stream, or hang up any call on the platform. A non-participant gets
**403 `FORBIDDEN`**, never 404 — same rule as everywhere else in this codebase (`CLAUDE.md` §Auth &
Ownership). Beyond participation, a handful of events are further restricted by role:

| Event | Who may send it |
|---|---|
| `call:accept` | only the callee |
| `call:decline` | only the callee |
| `call:cancel` | only the caller |
| everything else that reaches a live call | either participant |

`conversationId` is never taken from the client on `call:invite` — it is resolved server-side from
the (caller, callee) pair, otherwise an attacker could inject a fake `CALL` message into a
conversation they are not a member of.

---

## Events (17 total)

Fifteen of these come from the mobile team's original spec; **`call:connected`** and **`call:auth`**
are additions — see [For the mobile team](#for-the-mobile-team) below.

### Client → Server (state-changing)

| Event | Payload | Ack |
|---|---|---|
| `call:invite` | `{ calleeId, media: "AUDIO"\|"VIDEO", sdp }` | `{ status:"ok", callId, expiresAt, relayOnly }` |
| `call:accept` | `{ callId, sdp }` | `{ status:"ok", callId, relayOnly }` |
| `call:connected` | `{ callId }` | `{ status:"ok", callId }` |
| `call:decline` | `{ callId, reason: "DECLINED"\|"BUSY" }` | `{ status:"ok", callId }` |
| `call:cancel` | `{ callId }` | `{ status:"ok", callId }` |
| `call:end` | `{ callId }` | `{ status:"ok", callId }` |
| `call:auth` | `{ token }` | `{ status:"ok", expiresAt }` |

### Client → Server, relayed verbatim to the peer (server never inspects the content)

Same shape as `/chat`'s send path, but the server does not persist or transform any of these — it
forwards the payload byte-for-byte to whichever participant did not send it. This is the only
guarantee that codec settings the client negotiated (Opus `useinbandfec`/`usedtx`, H.264 profile
order) survive the round trip. None of these are ever logged, even at debug level: an SDP or ICE
candidate carries the sender's home IP address.

| Event | Payload | Delivered to |
|---|---|---|
| `call:ringing` | `{ callId }` | the other participant, unchanged |
| `call:ice` | `{ callId, candidate: { candidate, sdpMid, sdpMLineIndex } }` | the other participant, unchanged |
| `call:renegotiate` | `{ callId, sdp }` | the other participant, unchanged |
| `call:media-state` | `{ callId, audioEnabled, videoEnabled }` | the other participant, unchanged |

`call:ice` and `call:renegotiate` are additionally capped per participant (500 ICE candidates, 10
renegotiations per call) — a burst past the cap acks `RATE_LIMITED` rather than being silently
dropped, so the client can back off.

**There is a second, per-socket limit on top of those.** Every event on this namespace draws from
one shared token bucket per socket: **30 tokens, refilling at 15 per second**. It is what a dual-
stack device trickling candidates actually hits first — a burst past 30 frames in ~2 seconds acks
`RATE_LIMITED` even though the per-call ICE cap (500) is nowhere near. Trickle candidates as they
arrive rather than flushing a whole gathered set at once, and back off on `RATE_LIMITED` instead of
retrying immediately. `call:end`, `call:cancel` and `call:decline` are the exception: they draw from
their own small bucket (5 tokens, 1/s), so an ICE burst can never leave the user unable to hang up.

### Server → Client (no ack — these are notifications, not requests)

| Event | Payload | Sent to |
|---|---|---|
| `call:incoming` | `{ callId, conversationId, caller: StudentSummaryDto, media, sdp, relayOnly, expiresAt }` | every socket in the callee's personal room |
| `call:accepted` | `{ callId, sdp, relayOnly }` | the caller |
| `call:taken` | `{ callId }` | the answering student's OTHER devices (the one that answered is excluded) |
| `call:declined` | `{ callId, reason }` | the caller |
| `call:canceled` | `{ callId }` | the callee |
| `call:ended` | `{ callId, reason, durationMs, endedBy }` | both participants |

`call:ended` is emitted for **every close that has no dedicated event of its own** — the peer's
`call:end`, a timer (ring timeout, connect timeout, the 4-hour cap, the disconnect grace) and a
glare preemption, none of which the receiving client has anything else to act on. It is **not** sent
for a decline or a cancel: those close the call too, but they arrive as `call:declined` /
`call:canceled`. ⚠️ A client that tears down its `RTCPeerConnection` only on `call:ended` hangs on
the ringing screen after a decline — handle all three. The timer/preemption closes happen inside the
service, which hands the outcome to a registered broadcaster; the gateway is the only thing that
turns it into `call:ended` on the wire.

---

## State machine

```mermaid
stateDiagram-v2
    [*] --> RINGING: call:invite
    RINGING --> CONNECTING: call:accept (callee)
    RINGING --> MISSED: 45s ring timeout
    RINGING --> DECLINED: call:decline (callee)
    RINGING --> CANCELED: call:cancel (caller)
    RINGING --> DECLINED: glare — a smaller-uuid invite preempts this one (reason BUSY)
    CONNECTING --> ACTIVE: call:connected (either side; the 2nd is a no-op)
    CONNECTING --> FAILED: 30s connect timeout
    CONNECTING --> ENDED: call:end
    ACTIVE --> ENDED: call:end
    ACTIVE --> ENDED: 4h max-duration cap (reason TIMEOUT)
    RINGING --> FAILED: 20s disconnect grace elapses
    CONNECTING --> FAILED: 20s disconnect grace elapses
    ACTIVE --> FAILED: 20s disconnect grace elapses
    MISSED --> [*]
    DECLINED --> [*]
    CANCELED --> [*]
    FAILED --> [*]
    ENDED --> [*]
```

`RINGING`, `CONNECTING` and `ACTIVE` are the only non-terminal statuses; every transition out of a
terminal one is rejected (a retried `call:end` is a silent no-op, not an error).

**Why `CONNECTING` exists.** `call:accept` alone cannot mean "media is flowing" — ICE negotiation
still has to complete, and the 30-second connect timeout needs a status to measure from. So
`call:accept` moves `RINGING → CONNECTING`, and the client's own `call:connected` (once its ICE
state reaches `connected`) moves `CONNECTING → ACTIVE` and stamps `answeredAt`.

**Glare** (both students invite each other within the same window) is resolved without another
round trip: whichever `call:invite` has the lexicographically **smaller** `callId` wins, but only
when the existing call is a true mirror pair (same two students, reversed) and is still `RINGING` —
otherwise a fresh invite could tear down a conversation already answered, or a connected third party
could preempt a call they are not even in. The loser is closed with `reason: BUSY` and never counted
against its own caller's rate-limit budget — being out-glared is not abuse.

**Multi-device.** `call:incoming` reaches every one of the callee's connected sockets; the first
`call:accept` wins an atomic compare-and-set, and every other device gets `call:taken` (the
answering socket itself is excluded, so it does not tell itself to stop ringing).

**`relayOnly`.** Set on the `call:invite` ack, `call:incoming` and `call:accepted` — never on
`GET /v1/calls/ice-servers`, since that endpoint is fetched before the peer is even known. `true`
means this pair has no completed call between them yet, so the client must use
`iceTransportPolicy: "relay"` and must not gather or emit host/srflx candidates; the server also
drops any non-relay candidate it does see. Otherwise the very first ring — even one the callee
declines or never answers — would leak the caller's home IP to a stranger. Once the pair has one
genuinely answered call between them, `relayOnly` is `false` and ordinary P2P ICE applies.

---

## Timers

Four deterministic, cancellable BullMQ jobs (`ring:{callId}`, `connect:{callId}`, `max:{callId}`,
`grace:{callId}:{studentId}`) back every non-terminal status, with a 10-minute reconciliation cron
(below) as a backstop if Redis or a job is ever lost.

| Timer | Duration | Fires when | Outcome |
|---|---|---|---|
| **ring** | 45 s | still `RINGING` | `MISSED` (reason `TIMEOUT`) |
| **connect** | 30 s | still `CONNECTING` | `FAILED` |
| **max** | 4 h | still `ACTIVE` | `ENDED` (reason `TIMEOUT`) |
| **disconnect grace** | 20 s | a participant's socket dropped and has not come back (no `call:*` frame renewed its presence marker) | `FAILED`, from whichever status the call was actually in |

Every timer re-reads the live call before acting and does nothing if it already moved on (a job
firing a few hundred milliseconds after a legitimate `call:accept` must not downgrade an answered
call to `MISSED`) — the job cancellation is the primary defence, this re-read is the backstop.

A short disconnect (elevator, tunnel) does not end the call: WebRTC media is independent of this
signalling socket, so the 20-second grace window exists precisely so a quick reconnect is invisible
to the other party.

**Reconciliation cron** (`src/cron/call-reconciliation.cron.ts`, every 10 minutes): closes any call
still `RINGING`/`CONNECTING`/`ACTIVE` past the 4-hour cap directly in Postgres. It exists only for
the case where Redis or a BullMQ job was lost outright (a Redis restart, an evicted key) — without
it, such a call would stay `RINGING` forever in the student's history. See the calls/TURN section
of [the RUNBOOK](../handoff/RUNBOOK.md) for what a warning from this cron means operationally.

---

## Error codes

Used on both the WS ack (`{ status: "error", error: { code, message } }`) and the REST surface, per
the project's shared `ERROR_CODE` set — the same code means the same thing on either transport.

| Code | Typical HTTP status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | the socket never completed the handshake (no `client.data.user`) |
| `TOKEN_EXPIRED` | 401 | the access token's `exp` has passed — only enforced on state-creating events (`call:invite`, `call:accept`); see the token policy below |
| `FORBIDDEN` | 403 | the caller is not a participant of this call, or is a participant but the wrong role for this event (Rule 0) |
| `NOT_CONNECTED` | 403 | caller and callee are not a connection — `call:invite` only |
| `USER_BLOCKED` | 403 | one has blocked the other — `call:invite` only |
| `STUDENT_NOT_FOUND` | 404 | the caller's own student record could not be loaded (edge case, `call:invite` only) |
| `CALL_NOT_FOUND` | 404 | no such `callId`, or it is already fully cleaned up in a way the request cannot recover |
| `CALL_BUSY` | 409 | the callee (or caller) is already on a call and lost the glare check — `call:invite` only |
| `INVALID_CALL_STATE` | 409 | `call:accept` lost the race to another of the callee's own devices |
| `VALIDATION_ERROR` | 422 | the payload failed DTO validation (wrong type, missing field, oversized `sdp`/`candidate`, non-uuid `callId`, …) |
| `RATE_LIMITED` | 429 | the global or per-pair invite limit, the per-socket event bucket, or the per-call ICE/renegotiate cap |
| `INTERNAL_ERROR` | 500 | unexpected failure (fallback) |
| `NOT_IMPLEMENTED` | 503 | REST only — `GET /v1/calls/ice-servers` when `TURN_HOST`/`TURN_STATIC_SECRET` are not configured (only possible outside production) |

### Token freshness — three policies, not one

A blanket "reject on expired token" rule is wrong here: the access token lives 15 minutes, a call
can live 4 hours. So the check applies differently by event:

| Event kind | Policy |
|---|---|
| State-creating (`call:invite`, `call:accept`) | a fresh token is **required** — refusing here is safe, nothing is torn down |
| Terminating (`call:end`, `call:cancel`, `call:decline`) | **always accepted**, expired token or not — hanging up must never fail, or the microphone keeps streaming |
| In-call (`call:ice`, `call:renegotiate`, `call:media-state`, `call:connected`) | accepted for the life of the call — bounded by the call's own 4-hour cap, not the token's |

`call:auth { token }` lets a socket refresh its stored `tokenExp` in place, without reconnecting —
see [For the mobile team](#for-the-mobile-team).

---

## For the mobile team

Two protocol additions on top of the original spec, plus one field. All three ship in this phase
and require regenerating the client from the OpenAPI spec.

| Change | What it is | Why it had to be added |
|---|---|---|
| **`call:connected`** (client → server, new) | `{ callId }`, sent once the client's own ICE connection state reaches `connected` | The `CONNECTING → ACTIVE` transition — and the 30-second connect timeout the spec already describes — need a client-observable "media is actually flowing" signal. Treating the first `call:ice` frame as "connected" was considered and rejected: exchanging candidates does not mean the connection succeeded, so the timeout would fire incorrectly. |
| **`call:auth`** (client → server, new) | `{ token }` → ack `{ status:"ok", expiresAt }` | Refreshes a live socket's stored token expiry **without a reconnect**. Without it, a call outlives the ~15-minute access token, and once it has expired the callee's device can no longer satisfy `call:accept`'s freshness check — calls to them silently become `MISSED`, with no error the user can act on. **This is gated behind `CALLS_ENFORCE_TOKEN_EXPIRY`, currently `false` in every environment** — see the RUNBOOK. Do not assume the server is enforcing token expiry on `/calls` sockets until both platforms ship `call:auth` and that flag flips to `true`; flipping it early fails every call longer than ~16 minutes. |
| **`relayOnly: boolean`** | added to the `call:invite` ack, `call:incoming` and `call:accepted` | `true` ⇒ set `iceTransportPolicy: "relay"` and emit no host/srflx candidates for this call — see the state machine section above for the full rule. Not present on `GET /v1/calls/ice-servers`, which is called before either peer is known. |
| **`MessageType.CALL`** + **`MessageDto.call`** | a finished call now appends a `CALL`-typed message to the conversation, with `body: null` and `call: { callId, media, status, durationMs, endReason }` set | Lets the call show up in ordinary chat history/pagination without a separate "recent calls" endpoint. Sending `message:send { type: "CALL" }` (WS or REST) yourself is rejected — only the server produces this message type. |
| **`callId` is a uuid v4** (e.g. `3fa8...`, 36 characters), not the `cal_01J...` ULID the original spec described | `callId` has to exist **before** the database row does — it claims two Redis keys the moment `call:invite` is received — so Prisma's own id generator runs too late. `crypto.randomUUID()` needed no new dependency and is cryptographically random, unlike a ULID's time-ordered, guessable-with-effort prefix. Student ids (`calleeId`, etc.) are unaffected — they are still cuids. |

Everything else — event names, payload shapes for the fifteen original events, the state machine,
error codes, and rate limits — matches the original spec.

### ⚠️ Re-emit `call:connected` after every `/calls` reconnect during a live call

The server tracks each participant's presence per **student**, and clears it when their socket drops.
That is what arms the 20-second disconnect grace — and the only thing that disarms it is a `call:*`
frame arriving from that student for that call. **A reconnect alone does not restore presence**: the
new socket carries no call ids, and the server has nothing to attribute it to until the client says
so.

Once ICE has settled a call can go completely quiet on this socket — media flows peer-to-peer, no
signalling frames at all — so a client that reconnects and then simply waits has its healthy call
closed `FAILED` when the grace timer fires.

So: the moment the `/calls` socket reconnects while a call is live, send **`call:connected
{ callId }`** for it, before anything else. It is idempotent — if the call is already `ACTIVE` the
status write is a no-op and only the presence marker is refreshed — so sending it after every
reconnect is always safe, and it is the same event the client already sends when ICE first connects.
Any other in-call event (`call:ice`, `call:media-state`) refreshes presence too, but only
`call:connected` is guaranteed to be available with nothing else to say.
