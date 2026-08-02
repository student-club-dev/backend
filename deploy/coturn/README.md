# coturn — TURN relay for 1:1 calls

## Why this exists

WebRTC is peer-to-peer by default, but a share of students sit behind symmetric NAT or a
university/corporate network that only allows outbound 443 — direct (P2P) media never connects for
them. TURN is the fallback: it relays the audio/video through a server both sides can always reach.
`GET /v1/calls/ice-servers` (`src/modules/calls/infrastructure/ice-credentials.ts`) mints a
short-lived coturn credential for the app; this directory holds the coturn side of that contract.

coturn is not managed from this repository — it runs on its own host — so this directory holds the
configuration and someone with server access applies it. **Nothing in the application code can fix
a coturn misconfiguration.**

## Installing coturn

Ubuntu/Debian:

```bash
sudo apt-get update && sudo apt-get install -y coturn
```

Enable the systemd service (Debian/Ubuntu packages ship it disabled by default):

```bash
sudo sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

## Certificates

`turnserver.conf` expects a cert/key pair for `turn.elonuz.uz` (or your chosen TURN hostname) at
the paths in the `cert`/`pkey` lines. Issue with certbot the same way as the API host:

```bash
sudo certbot certonly --standalone -d turn.elonuz.uz
```

coturn does not reload its cert automatically — add a renewal hook that restarts it:

```bash
echo 'systemctl restart coturn' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh
```

## Applying it

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
