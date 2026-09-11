#!/usr/bin/env bash
# Deploy the game to the family server from this (dev) machine:
#
#   npm run deploy                 # test, build, upload, restart
#   npm run deploy -- --skip-tests
#
# Uploads dist/ (the built game), server/ (the API, no npm dependencies) and
# deploy/ to the server with rsync, then runs deploy/install.sh there, which
# (re)installs the launchd service, restarts it and, when Tailscale is running
# there, publishes the game on the tailnet with a trusted certificate (see
# install.sh). The database and the self-signed certificate live outside the
# uploaded folders and are never touched.
#
#   DEPLOY_HOST   ssh target, default oloflandin@Olofs-Mac-mini.local
#   DEPLOY_DIR    folder on the server, relative to its home, default srv/pokemon
#
# Tip: `ssh-copy-id $DEPLOY_HOST` once, and no password is asked. Without a key
# the ssh connection is shared, so the password is asked once per deploy.

set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-oloflandin@Olofs-Mac-mini.local}"
DIR="${DEPLOY_DIR:-srv/pokemon}"
SKIP_TESTS=0
for arg in "$@"; do
    case "$arg" in
        --skip-tests) SKIP_TESTS=1 ;;
        *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
done

# One ssh connection shared by every step below.
CTL="$(mktemp -u "${TMPDIR:-/tmp}/pokemon-deploy.XXXXXX")"
SSH="ssh -o ControlMaster=auto -o ControlPath=$CTL -o ControlPersist=120"
trap 'ssh -o ControlPath="$CTL" -O exit "$HOST" 2>/dev/null || true' EXIT

if [ "$SKIP_TESTS" = 0 ]; then
    echo "==> Tests"
    npm test
fi

echo "==> Build"
npm run build

echo "==> Upload to $HOST:$DIR"
$SSH "$HOST" "mkdir -p '$DIR/dist' '$DIR/server' '$DIR/deploy'"
rsync -az --delete -e "$SSH" dist/ "$HOST:$DIR/dist/"
rsync -az --delete -e "$SSH" server/ "$HOST:$DIR/server/"
rsync -az --delete -e "$SSH" deploy/ "$HOST:$DIR/deploy/"
rsync -az -e "$SSH" package.json "$HOST:$DIR/package.json"

echo "==> Install and restart on $HOST"
INSTALL_LOG="$(mktemp "${TMPDIR:-/tmp}/pokemon-install.XXXXXX")"
$SSH "$HOST" "bash '$DIR/deploy/install.sh'" | tee "$INSTALL_LOG"

# install.sh sets up Tailscale Serve but can not test it from the server (a
# machine's own tailnet address bypasses Serve), so check it from here. The
# first request after a fresh setup makes Tailscale fetch the certificate,
# which can take a while.
TS_URL="$(sed -n 's/^==> Tailnet: \(https:[^ ]*\).*/\1/p' "$INSTALL_LOG")"
rm -f "$INSTALL_LOG"
if [ -n "$TS_URL" ]; then
    echo "==> Checking $TS_URL from this machine"
    code=000
    for _ in 1 2 3 4 5 6; do
        code="$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' "${TS_URL}api/accounts" || true)"
        [ "$code" = 200 ] && break
        sleep 5
    done
    if [ "$code" = 200 ]; then
        echo "==> Up: $TS_URL  (tailnet, trusted certificate)"
    elif curl -sk --max-time 10 -o /dev/null "${TS_URL}api/accounts"; then
        echo "$TS_URL answers but its certificate is not trusted. On the server, run:" >&2
        echo "    /Applications/Tailscale.app/Contents/MacOS/Tailscale serve status" >&2
        exit 1
    else
        echo "Could not reach $TS_URL from this machine (is it on the tailnet?). Try from another device." >&2
    fi
fi
