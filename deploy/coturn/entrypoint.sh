#!/bin/sh
# Renders turnserver.conf's placeholders from the environment and execs turnserver.
#
# The committed turnserver.conf ships with __TURN_STATIC_SECRET__ / __SERVER_PRIVATE_IP__ /
# __SERVER_PUBLIC_IP__ placeholders on purpose — a real secret must never be committed (anyone
# holding it can mint TURN credentials for any student). This substitutes them into a copy at
# container start, from env vars only; the template on disk is never modified.
set -eu

CONFIG_TEMPLATE="/deploy/turnserver.conf.template"
CONFIG_RENDERED="/tmp/turnserver.conf"

if [ -z "${TURN_STATIC_SECRET:-}" ] || [ -z "${SERVER_PRIVATE_IP:-}" ] || [ -z "${SERVER_PUBLIC_IP:-}" ]; then
  echo "coturn: TURN_STATIC_SECRET, SERVER_PRIVATE_IP and SERVER_PUBLIC_IP must all be set — refusing to start. See deploy/coturn/README.md." >&2
  exit 1
fi

# sed's replacement text treats backslash, the delimiter (|) and & specially; escape all three so
# a secret containing any of them is substituted literally instead of corrupting the rendered
# config (or, for `&`, silently duplicating whatever matched).
sed_escape() {
  printf '%s' "$1" | sed -e 's/[\\|&]/\\&/g'
}

sed \
  -e "s|__TURN_STATIC_SECRET__|$(sed_escape "$TURN_STATIC_SECRET")|g" \
  -e "s|__SERVER_PRIVATE_IP__|$(sed_escape "$SERVER_PRIVATE_IP")|g" \
  -e "s|__SERVER_PUBLIC_IP__|$(sed_escape "$SERVER_PUBLIC_IP")|g" \
  "$CONFIG_TEMPLATE" > "$CONFIG_RENDERED"

# 443/TLS is what lets calls connect from networks that block everything else (university Wi-Fi) —
# fail loudly here rather than have coturn start and silently serve without it.
CERT_PATH=$(grep -m1 '^cert=' "$CONFIG_RENDERED" | cut -d= -f2-)
PKEY_PATH=$(grep -m1 '^pkey=' "$CONFIG_RENDERED" | cut -d= -f2-)

if [ ! -f "$CERT_PATH" ] || [ ! -f "$PKEY_PATH" ]; then
  echo "coturn: TLS certificate not found at $CERT_PATH / $PKEY_PATH." >&2
  echo "coturn: mount /etc/letsencrypt read-only with a real certificate for the TURN_HOST domain — refusing to start without TLS." >&2
  exit 1
fi

exec turnserver -c "$CONFIG_RENDERED" --log-file=stdout
