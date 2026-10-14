#!/usr/bin/env bash
# Export the whole pad database to one JSON file per day, keep the last 30.
# A publicly writable database is one request away from losing everything:
# run this from cron on a machine that is always on.
set -euo pipefail
DB="${PAD_DB_URL:-https://web-pad-5213c.firebaseio.com}"
DIR="${PAD_BACKUP_DIR:-$HOME/pad-backups}"
mkdir -p "$DIR"
curl -fsS --max-time 300 "$DB/.json" -o "$DIR/$(date +%F).json"
ls -1t "$DIR"/*.json | tail -n +31 | xargs -r rm --
echo "saved $DIR/$(date +%F).json"
