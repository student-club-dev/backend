# Nginx — WebSocket proxying

## Why this exists

The mobile team reported (§17.2) that `transport=websocket` returns **400**, so the Kotlin client
runs on Engine.IO long-polling instead. Consequences today: high battery drain, `typing`/`presence`
arriving late, and connections dropping often on mobile data.

Nginx is not managed from this repository — it lives on the server — so this directory holds the
configuration and someone with server access applies it. **Nothing in the application code can fix
this.**

## The other half: `client_max_body_size`

Chat media is uploaded through the same server block, and nginx's default cap is **1 MB** (the
studentclub-prod site had it set to `10m`). The largest upload the API accepts is a **64 MB video**
— see `MEDIA_LIMITS` in `src/modules/media/domain/media-limits.ts`. Anything over the nginx cap is
answered **413** before it ever reaches Node, so the application's own limit and its Uzbek error
message never run.

Set it at `server` level, above the room the app needs:

```nginx
client_max_body_size 70m;
```

Raise this whenever a `maxBytes` in `media-limits.ts` goes up.

## Applying it

```bash
sudo cp deploy/nginx/socket-io.conf /etc/nginx/snippets/socket-io.conf
# then, inside the API server { } block:
#     include /etc/nginx/snippets/socket-io.conf;
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` first, always: a failed test means nothing is reloaded and the live site keeps serving
the previous configuration. Reload rather than restart — existing connections are not dropped.

Applied on studentclub-prod 2026-07-31 by pasting the two `location` blocks directly into
`/etc/nginx/sites-available/api.studentclub.uz` rather than via the snippet.

## Verifying it

```bash
curl -s -o /dev/null -m 5 -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://<host>/socket.io/?EIO=4&transport=websocket'
```

- **`101`** — the upgrade works. Keep the `-m 5`: on success the connection becomes a tunnel and
  curl, which does not speak WebSocket, hangs until the timeout. **A hang here is the pass, not a
  failure.**
- **`400`** — the snippet is not being applied to this route (check `include` placement, and that no
  earlier `location` matches `/socket.io/` first).

Also confirm the polling fallback still answers, since clients on networks that block WebSocket
depend on it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'https://<host>/socket.io/?EIO=4&transport=polling'
```

## What is already handled in the application

Running several API replicas needs Socket.IO events to cross instances. That is **already wired**:
`RedisIoAdapter` is attached in `src/main.ts` and backed by `@socket.io/redis-adapter`. No sticky
sessions or `ip_hash` are required.
