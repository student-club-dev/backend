# Nginx — WebSocket proxying

## Why this exists

The mobile team reported (§17.2) that `transport=websocket` returns **400**, so the Kotlin client
runs on Engine.IO long-polling instead. Consequences today: high battery drain, `typing`/`presence`
arriving late, and connections dropping often on mobile data.

Nginx is not managed from this repository — it lives on the server — so this directory holds the
configuration and someone with server access applies it. **Nothing in the application code can fix
this.**

## The other half: media uploads

Chat media is uploaded through the same server block, and nginx caps request bodies — default 1 MB,
`10m` on the studentclub-prod site. **The application no longer has a size limit of its own** (chat
media parity spec §2), so nginx's cap is now the only one there is: anything over it is answered
**413** before it ever reaches Node, and the client never learns why.

`deploy/nginx/media-upload.conf` removes it for the two upload routes and turns off request
buffering, so the body streams to Node instead of being spooled to nginx's disk first. See the
comments in that file for why both halves are needed.

Uploads are now bounded by the daily quota and by disk space, not by a number in nginx — so this no
longer needs raising when a limit changes, because there is no longer a limit to change.

### Serving media from a separate origin

Worth doing when there is time. `kind = FILE` now accepts **any** type (parity spec §1), which is
safe because `GET /v1/media/{id}/raw` always answers `application/octet-stream` with
`Content-Disposition: attachment`, `nosniff` and a `sandbox` CSP — a browser never executes what a
chat stored. Serving media from `media.studentclub.uz` instead would add one more layer: even a
bypass of those headers would land on an origin with no session cookies to steal.

## Applying it

```bash
sudo cp deploy/nginx/socket-io.conf /etc/nginx/snippets/socket-io.conf
sudo cp deploy/nginx/media-upload.conf /etc/nginx/snippets/media-upload.conf
# then, inside the API server { } block:
#     include /etc/nginx/snippets/socket-io.conf;
#     include /etc/nginx/snippets/media-upload.conf;
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
