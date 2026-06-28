#!/usr/bin/env bash
# One-time Codespace setup: install deps, bring up PostGIS+pgRouting, migrate,
# and seed a London-scale dataset (full national Overpass is skipped to keep
# first boot quick — run `npm run seed` later for the rest).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[setup] installing dependencies…"
npm install

echo "[setup] starting database…"
docker compose up -d db

echo "[setup] waiting for the database to accept connections…"
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U transitlab -d transitlab >/dev/null 2>&1; then
    echo "[setup] database ready"
    break
  fi
  sleep 2
done

echo "[setup] running migrations…"
npm run migrate

# The client talks to the API same-origin (/api), proxied by Vite — see
# vite.config.ts. This keeps everything behind one public port.
echo "VITE_API_BASE=" > client/.env.local

echo "[setup] seeding reference data (London region; ~a few minutes)…"
OVERPASS_REGIONS=london npm run seed || echo "[setup] seed had a hiccup — re-run with: OVERPASS_REGIONS=london npm run seed"

echo "[setup] done. The app starts automatically (postStart)."
