#!/usr/bin/env bash
# Nightly database backup, run by the se.landin.pokemon.backup launchd agent
# (see install.sh). Uses sqlite's own .backup so a copy taken while the game is
# being played is consistent (the database runs in WAL mode, a plain cp is
# not safe). Keeps the newest 30 copies next to the database.

set -euo pipefail

DB="${POKEMON_DB_PATH:?POKEMON_DB_PATH is not set}"
OUT_DIR="$(dirname "$DB")/backups"
KEEP=30

[ -f "$DB" ] || { echo "no database at $DB yet, nothing to back up"; exit 0; }
mkdir -p "$OUT_DIR"

OUT="$OUT_DIR/game-$(date +%F).db"
/usr/bin/sqlite3 "$DB" ".backup '$OUT'"
echo "$(date '+%F %T') backed up to $OUT"

# Prune: newest first, drop everything after the KEEP-th.
ls -1t "$OUT_DIR"/game-*.db 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    rm -f "$old"
done
