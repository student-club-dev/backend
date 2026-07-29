# Nginx — WebSocket proxying

## Why this exists

The mobile team reported (§17.2) that `transport=websocket` returns **400**, so the Kotlin client
runs on Engine.IO long-polling instead. Consequences today: high battery drain, `typing`/`presence`
arriving late, and connections dropping often on mobile data.

Nginx is not managed from this repository — it lives on the server — so this directory holds the
configuration and someone with server access applies it. **Nothing in the application code can fix
this.**

## Applying it

```bash
sudo cp deploy/nginx/socket-io.conf /etc/nginx/snippets/socket-io.conf
# then, inside the API server { } block:
#     include /etc/nginx/snippets/socket-io.conf;
sudo nginx -t && sudo systemctl reload nginx
```

## Verifying it

```bash
curl -i -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://<host>/socket.io/?EIO=4&transport=websocket'
```

- **`101`** — the upgrade works.
- **`400`** — the snippet is not being applied to this route (check `include` placement, and that no
  earlier `location` matches `/socket.io/` first).

## What is already handled in the application

Running several API replicas needs Socket.IO events to cross instances. That is **already wired**:
`RedisIoAdapter` is attached in `src/main.ts` and backed by `@socket.io/redis-adapter`. No sticky
sessions or `ip_hash` are required.
