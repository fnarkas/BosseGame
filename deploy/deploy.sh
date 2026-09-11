#!/usr/bin/env bash
# Deploy the game to the family server from this (dev) machine:
#
#   npm run deploy                 # test, build, upload, restart
#   npm run deploy -- --skip-tests
#
# Uploads dist/ (the built game), server/ (the API, no npm dependencies) and
# deploy/ to the server with rsync, then runs deploy/install.sh there, which
# (re)installs the launchd service and restarts it. The database and the
# certificate live outside the uploaded folders and are never touched.
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
$SSH "$HOST" "bash '$DIR/deploy/install.sh'"
