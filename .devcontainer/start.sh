#!/usr/bin/env bash
# Runs on every Codespace start: ensure the database is up and migrated, then
# launch the API + client (port 5174 is forwarded publicly). Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d db
for i in $(seq 1 60); do
  docker compose exec -T db pg_isready -U transitlab -d transitlab >/dev/null 2>&1 && break
  sleep 2
done
npm run migrate >/dev/null 2>&1 || true

# Start API + client together, detached, so the forwarded URL stays live.
if ! curl -s -m2 http://localhost:5174/ >/dev/null 2>&1; then
  echo "[start] launching API + client…"
  nohup npm run dev >/tmp/transitlab-dev.log 2>&1 &
fi

cat <<'MSG'

  TRANSITLAB is starting.
  → Open the forwarded port 5174 (it is set to PUBLIC).
  → Share that https://…-5174.app.github.dev URL with anyone.
  Logs: tail -f /tmp/transitlab-dev.log

MSG
