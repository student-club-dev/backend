# coturn — TURN relay for 1:1 calls

## Why this exists

WebRTC is peer-to-peer by default, but a share of students sit behind symmetric NAT or a
university/corporate network that only allows outbound 443 — direct (P2P) media never connects for
them. TURN is the fallback: it relays the audio/video through a server both sides can always reach.
`GET /v1/calls/ice-servers` (`src/modules/calls/infrastructure/ice-credentials.ts`) mints a
short-lived coturn credential for the app; this directory holds the coturn side of that contract.

coturn is not managed from this repository the way `db`/`redis`/`backend` are — it needs a public
IP and a real TLS certificate that do not exist in every environment this compose file is used in
(local dev, CI) — so it stays off by default and someone with server access brings it up
explicitly. **Nothing in the application code can fix a coturn misconfiguration.**

## Certificates

Both routes below (Docker and manual) expect a cert/key pair for `turn.elonuz.uz` (or your chosen
TURN hostname) at the paths in `turnserver.conf`'s `cert`/`pkey` lines. Issue with certbot the same
way as the API host:

```bash
sudo certbot certonly --standalone -d turn.elonuz.uz
```

coturn does not reload its cert automatically — a renewal hook must restart it. Which command that
is depends on how you run coturn; see the matching section below.

## Running it via Docker Compose (recommended)

`docker-compose.yml` has a `coturn` service that renders `turnserver.conf` and runs `turnserver` in
a container. It is **not** started by a plain `docker compose up` — it sits behind the `calls`
Compose profile precisely because the certificate above and a public IP are not guaranteed to exist
yet. Bring it up explicitly once they do:

```bash
# Fill in .env first: TURN_STATIC_SECRET (byte-identical to the backend's own value),
# SERVER_PRIVATE_IP, SERVER_PUBLIC_IP — see .env.example for what each one does.
docker compose --profile calls up -d coturn
docker compose logs -f coturn
```

What the service does, so a failure is easy to place:

- `deploy/coturn/entrypoint.sh` substitutes `__TURN_STATIC_SECRET__`, `__SERVER_PRIVATE_IP__` and
  `__SERVER_PUBLIC_IP__` in a copy of `turnserver.conf` from those three env vars, then execs
  `turnserver` with it. The committed file on disk keeps the placeholders — nothing renders them
  until the container starts, and the rendered copy never gets written back into the repo.
- It refuses to start (clear message on stderr, non-zero exit) if any of the three env vars is
  empty, or if the TLS cert/key are not present at the mounted path — never silently falling back
  to serving without TLS.
- `network_mode: host`: coturn allocates a relay port per active call out of a wide range
  (49152–65535 by default), and mapping that whole range through Docker's bridge/NAT is
  impractical — host networking is coturn's documented Docker deployment mode for this reason.
  This also means the `ports:` note in `docker-compose.yml` is descriptive only (Docker ignores
  `ports:` under host networking); what actually needs to be open on the host firewall is 3478
  (UDP+TCP), 5349/tcp, 443/tcp, and the relay range above.
- The container runs as root, not the image's default `nobody`: Let's Encrypt's
  `archive/<domain>/` directory is `root:root 0700`, so `live/<domain>/privkey.pem` — a symlink
  into it — cannot be read by a non-root process no matter its own permissions.

Renewal hook for this route:

```bash
echo 'cd /opt/studentclub && docker compose --profile calls restart coturn' | \
  sudo tee /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh
```

## Installing coturn manually (no Docker)

Everything below is an alternative to the Compose service above — use it only if coturn runs
directly on a host that is not managed through this repo's `docker-compose.yml`.

Ubuntu/Debian:

```bash
sudo apt-get update && sudo apt-get install -y coturn
```

Enable the systemd service (Debian/Ubuntu packages ship it disabled by default):

```bash
sudo sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

Renewal hook for this route:

```bash
echo 'systemctl restart coturn' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh
```

### Applying the config by hand

`turnserver.conf` in this directory ships with three placeholders that must never be committed as
real values: `__TURN_STATIC_SECRET__`, `__SERVER_PRIVATE_IP__`, `__SERVER_PUBLIC_IP__`. Render them
from the environment at deploy time rather than editing the file by hand:

```bash
sudo TURN_STATIC_SECRET="$(grep -m1 '^TURN_STATIC_SECRET=' /opt/studentclub/.env | cut -d= -f2-)" \
     SERVER_PRIVATE_IP="$(hostname -I | awk '{print $1}')" \
     SERVER_PUBLIC_IP="<this host's public IP>" \
     envsubst '${TURN_STATIC_SECRET} ${SERVER_PRIVATE_IP} ${SERVER_PUBLIC_IP}' \
     < deploy/coturn/turnserver.conf \
     | sed -e 's/__TURN_STATIC_SECRET__/'"$TURN_STATIC_SECRET"'/' \
           -e 's/__SERVER_PRIVATE_IP__/'"$SERVER_PRIVATE_IP"'/' \
           -e 's/__SERVER_PUBLIC_IP__/'"$SERVER_PUBLIC_IP"'/' \
  | sudo tee /etc/turnserver.conf > /dev/null
sudo systemctl restart coturn
```

`TURN_STATIC_SECRET` here **must be byte-identical** to the backend's own `TURN_STATIC_SECRET` (the
same value the API's `.env` uses) — coturn validates the HMAC the API computes, so a mismatch fails
every relayed call with an auth error, not a clear one.

## Deploy-blocking checklist

Do not consider this host live until every line below is checked. Each one is a documented failure
mode, not a theoretical one — see `docs/architecture/calls.md` §TURN/ICE and the review history in
`docs/superpowers/specs/2026-08-01-chat-calls-design.md` §9.3.

- [ ] **443/TLS is reachable from the public internet.** Students call from university Wi-Fi where
      3478/UDP and even 3478/TCP are frequently blocked and 443 is the only open port. Verify:
      ```bash
      openssl s_client -connect turn.elonuz.uz:443 -alpn h2 </dev/null 2>&1 | grep -i "CONNECTED\|error"
      ```
      A `CONNECTED` line (not a connection refused/timeout) means the port is open. This is
      `alt-tls-listening-port=443` in `turnserver.conf` — do not remove it to "simplify" the config.
- [ ] **The `denied-peer-ip` list is complete** — RFC1918 (10/8, 172.16/12, 192.168/16), loopback,
      `0.0.0.0/8`, CGNAT (`100.64.0.0/10`), **and `169.254.0.0/16`** (cloud metadata —
      `169.254.169.254` serves IAM credentials on every major cloud; a TURN credential is enough to
      reach it through the relay), **and the IPv6 equivalents** (`::1`, `fc00::/7`, `fe80::/10`). A
      dual-stack host skips every IPv4 rule above if the IPv6 lines are missing.
- [ ] **`static-auth-secret` is rendered from `TURN_STATIC_SECRET` at deploy time and identical to
      the backend's `TURN_STATIC_SECRET`.** Never a value typed or committed by hand. Confirm:
      ```bash
      # Docker Compose route:
      docker compose exec coturn grep static-auth-secret /tmp/turnserver.conf
      # Manual route:
      grep static-auth-secret /etc/turnserver.conf   # must NOT show __TURN_STATIC_SECRET__
      ```
- [ ] **The coturn host sits on a network segment with no route to the API, the database, or the
      cloud metadata endpoint.** coturn relays arbitrary UDP/TCP to whatever `denied-peer-ip` does
      not block; a misconfigured or bypassed deny rule must still not reach anything sensitive.
      Confirm with a route/firewall check from the coturn host, not an assumption:
      ```bash
      curl -m 2 -o /dev/null -w '%{http_code}\n' http://169.254.169.254/ || echo "unreachable (expected)"
      curl -m 2 -o /dev/null -w '%{http_code}\n' https://api.studentclub.uz/v1/health || echo "unreachable (expected)"
      ```

## Verifying

```bash
turnutils_uclient -T -u <username> -w <credential> turn.elonuz.uz
```

Mint a real `username`/`credential` pair from the running backend instead of guessing one — it is
the same value `GET /v1/calls/ice-servers` returns to the app:

```bash
docker compose exec -T backend node -e '
const { buildIceCredential } = require("./dist/modules/calls/infrastructure/ice-credentials");
const c = buildIceCredential(process.env.TURN_STATIC_SECRET, "diag", 3600, Date.now());
console.log(c.username, c.credential);'
```

`turnutils_uclient` reporting a successful allocation confirms the whole path: coturn is listening,
the secret matches, and the deny list has not accidentally blocked the client's own address.
