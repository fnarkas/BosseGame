#!/usr/bin/env bash
# Runs ON the server (deploy.sh calls it over ssh after uploading). Idempotent:
#
#   * data folder  ~/srv/pokemon-data  (database, certificate, backups, logs)
#   * a self-signed certificate, made once, so the game is served over HTTPS
#     on the LAN (browsers only allow the microphone on HTTPS; accept the
#     warning once per device)
#   * Tailscale Serve, when Tailscale is installed: publishes the game on the
#     tailnet at https://<machine>.<tailnet>.ts.net:8443/ with a real Let's
#     Encrypt certificate that Tailscale issues and renews by itself, so
#     devices on the tailnet get no warning. Needs MagicDNS and "HTTPS
#     Certificates" enabled under DNS in the Tailscale admin console.
#     POKEMON_TAILSCALE=0 skips this step. It listens on 8443, not 443: the
#     Tailscale app binds its Serve port on every interface of the Mac, so a
#     Serve on 443 would take the port the game itself listens on
#     (POKEMON_TAILSCALE_PORT overrides; 443, 8443 and 10000 are allowed).
#   * launchd agent  se.landin.pokemon         keeps the server running,
#                                              restarts it on crash and at login
#   * launchd agent  se.landin.pokemon.backup  copies the database every night
#
# Every run rewrites the agents and restarts the server, which is how a deploy
# picks up new code. Override with POKEMON_DATA_DIR, POKEMON_PORT and
# POKEMON_TAILSCALE.

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${POKEMON_DATA_DIR:-$HOME/srv/pokemon-data}"
PORT="${POKEMON_PORT:-443}"
LABEL="se.landin.pokemon"
AGENTS="$HOME/Library/LaunchAgents"
LOG_DIR="$DATA_DIR/logs"
DB="$DATA_DIR/game.db"
CERT="$DATA_DIR/cert.pem"
KEY="$DATA_DIR/key.pem"
UID_NUM="$(id -u)"
USE_TAILSCALE="${POKEMON_TAILSCALE:-1}"
TS_PORT="${POKEMON_TAILSCALE_PORT:-8443}"

mkdir -p "$DATA_DIR" "$LOG_DIR" "$DATA_DIR/backups" "$AGENTS"

# launchd does not read the shell profile, so find node now and pin its path.
NODE="$(command -v node || true)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -z "$NODE" ] && [ -x "$candidate" ]; then NODE="$candidate"; fi
done
if [ -z "$NODE" ]; then
    echo "node was not found on $(hostname). Install it (brew install node) and deploy again." >&2
    exit 1
fi
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "node $("$NODE" --version) is too old; the server needs 22.5 or newer for node:sqlite." >&2
    exit 1
fi

# The Bonjour name (System Settings > Sharing) is what the iPads use; the
# DHCP hostname can be something else entirely.
BONJOUR="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
GAME_HOST="$(echo "$BONJOUR" | tr '[:upper:]' '[:lower:]').local"

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "==> Creating self-signed certificate for $GAME_HOST"
    SHORT="$(hostname -s)"
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout "$KEY" -out "$CERT" \
        -subj "/CN=$GAME_HOST" \
        -addext "subjectAltName=DNS:$GAME_HOST,DNS:$(hostname),DNS:${SHORT}.local,DNS:${SHORT}.lan,DNS:localhost" \
        >/dev/null 2>&1
    chmod 600 "$KEY"
fi

echo "==> Writing launchd agents"
cat > "$AGENTS/$LABEL.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE</string>
        <string>--no-warnings=ExperimentalWarning</string>
        <string>server/index.js</string>
    </array>
    <key>WorkingDirectory</key><string>$APP_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key><string>$PORT</string>
        <key>POKEMON_DB_PATH</key><string>$DB</string>
        <key>SSL_CERT</key><string>$CERT</string>
        <key>SSL_KEY</key><string>$KEY</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>5</integer>
    <key>StandardOutPath</key><string>$LOG_DIR/server.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/server.log</string>
</dict>
</plist>
EOF

cat > "$AGENTS/$LABEL.backup.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$APP_DIR/deploy/backup.sh</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>POKEMON_DB_PATH</key><string>$DB</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>3</integer>
        <key>Minute</key><integer>30</integer>
    </dict>
    <key>StandardOutPath</key><string>$LOG_DIR/backup.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/backup.log</string>
</dict>
</plist>
EOF

# The GUI domain exists when the user is logged in on the Mac; over ssh with
# nobody logged in, fall back to the per-user domain.
DOMAIN="gui/$UID_NUM"
launchctl print "$DOMAIN" >/dev/null 2>&1 || DOMAIN="user/$UID_NUM"

# bootout returns before launchd has finished tearing the service down, and a
# bootstrap in that window fails with "Bootstrap failed: 5: Input/output
# error". Wait for it to be gone, then retry the bootstrap a few times.
restart_agent() {
    local name="$1" plist="$2"
    if launchctl print "$DOMAIN/$name" >/dev/null 2>&1; then
        launchctl bootout "$DOMAIN/$name" 2>/dev/null || true
        for _ in $(seq 1 40); do
            launchctl print "$DOMAIN/$name" >/dev/null 2>&1 || break
            sleep 0.25
        done
    fi
    for attempt in 1 2 3 4 5; do
        if launchctl bootstrap "$DOMAIN" "$plist" 2>/dev/null; then
            return 0
        fi
        sleep "$attempt"
    done
    echo "Could not load $name into $DOMAIN:" >&2
    launchctl bootstrap "$DOMAIN" "$plist" || true
    return 1
}

# The Mac App Store build has no `tailscale` on the PATH, only the app's CLI.
TS="$(command -v tailscale || true)"
if [ -z "$TS" ] && [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
    TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
fi
TS_HOST=""
TS_URL=""

# The Tailscale app binds its Serve listener on every interface of the Mac
# (lsof shows IPNExtension on *:443), so a Serve left on the game's port takes
# it before Node can bind: the server dies with EADDRINUSE and launchd gives
# up. Switch such a Serve off before starting the server; Serve is set up on
# TS_PORT further down.
port_holders() {
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -v '^COMMAND\|node' || true
}
if [ -n "$TS" ] && [ "$TS_PORT" != "$PORT" ]; then
    "$TS" serve --https="$PORT" off >/dev/null 2>&1 || true
    # The extension lets go of the port a moment after the config changes.
    for _ in $(seq 1 20); do
        [ -n "$(port_holders)" ] || break
        sleep 0.25
    done
fi
if [ -n "$(port_holders)" ]; then
    echo "==> Warning: something other than node already listens on port $PORT:" >&2
    port_holders >&2
fi

echo "==> Restarting $LABEL ($DOMAIN)"
restart_agent "$LABEL" "$AGENTS/$LABEL.plist"
restart_agent "$LABEL.backup" "$AGENTS/$LABEL.backup.plist"

# launchd sometimes leaves a freshly bootstrapped KeepAlive agent in "not
# running" (a spawn pended after an earlier crash); a kickstart gets it going.
agent_running() {
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -q 'state = running'
}
agent_running || launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || true

# Tailscale Serve terminates TLS with the certificate Tailscale issues for this
# machine and proxies to the self-signed server on the LAN port. The serve
# config is stored by Tailscale and survives reboots; setting the same target
# again is a no-op, so this is safe to run on every deploy.
setup_tailscale() {
    [ "$USE_TAILSCALE" = 1 ] || return 0
    if [ -z "$TS" ]; then
        echo "==> Tailscale is not installed; the game is reachable on the LAN only"
        return 0
    fi
    local status
    status="$("$TS" status --json 2>/dev/null || true)"
    if ! echo "$status" | grep -q '"BackendState": "Running"'; then
        echo "==> Tailscale is not running; skipping Tailscale Serve" >&2
        return 0
    fi
    # "DNSName": "olofs-mac-mini.tailxxxx.ts.net." -> olofs-mac-mini.tailxxxx.ts.net
    TS_HOST="$(echo "$status" | sed -n 's/.*"DNSName": "\([^"]*\)\.".*/\1/p' | head -n 1)"
    if [ -z "$TS_HOST" ]; then
        echo "==> This machine has no MagicDNS name; skipping Tailscale Serve" >&2
        return 0
    fi
    # CertDomains lists the names Tailscale may issue certificates for; it is
    # empty until HTTPS Certificates is enabled in the admin console.
    if ! echo "$status" | sed -n '/"CertDomains"/,/\]/p' | grep -q "\"$TS_HOST\""; then
        echo "==> Tailscale can not issue a certificate for $TS_HOST; skipping Tailscale Serve." >&2
        echo "    Enable MagicDNS and HTTPS Certificates under DNS in the Tailscale admin console." >&2
        TS_HOST=""
        return 0
    fi
    TS_URL="https://$TS_HOST/"
    [ "$TS_PORT" = 443 ] || TS_URL="https://$TS_HOST:$TS_PORT/"
    echo "==> Tailscale Serve: $TS_URL -> https://localhost:$PORT/"
    if ! "$TS" serve --bg --https="$TS_PORT" "https+insecure://localhost:$PORT" >/dev/null; then
        echo "    tailscale serve failed; the game is still reachable on the LAN" >&2
        TS_HOST=""
    fi
}

setup_tailscale

# Give the server a moment, then prove it answers.
for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    agent_running || launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || true
    if curl -sk --max-time 2 "https://localhost:$PORT/api/accounts" >/dev/null 2>&1; then
        if [ "$PORT" = 443 ]; then
            echo "==> Up: https://$GAME_HOST/  (LAN, self-signed certificate)"
        else
            echo "==> Up: https://$GAME_HOST:$PORT/  (LAN, self-signed certificate)"
        fi
        # A machine can not reach its own Tailscale Serve (its tailnet IP is
        # local, so the request lands on the Node server directly), so the
        # tailnet address is checked by deploy.sh from the dev machine.
        [ -z "$TS_HOST" ] || echo "==> Tailnet: $TS_URL  (trusted certificate)"
        exit 0
    fi
done
echo "The server did not answer on port $PORT." >&2
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PORT is held by:" >&2
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2 || true
fi
echo "Last log lines:" >&2
tail -n 20 "$LOG_DIR/server.log" >&2 || true
exit 1
