# Deploying TRANSITLAB

TRANSITLAB is a split deployment:

| Part | What | Where |
|------|------|-------|
| **Frontend** | Vite SPA (`client/`) | **Vercel** — see root `vercel.json` |
| **API** | Express server (`server/`) | **Fly.io** — root `Dockerfile` + `fly.toml` |
| **Database** | PostgreSQL + PostGIS + pgRouting | **Fly.io** — `deploy/db.fly.toml` |

Vercel can't host the API (it needs a persistent PostGIS/pgRouting database), so
the backend lives on Fly. The pieces below are independent; deploy the database
first, then the API, then point the frontend at the API.

Prerequisites: a [Fly.io](https://fly.io) account and the
[`flyctl`](https://fly.io/docs/flyctl/install/) CLI (`fly auth login`). Run all
commands from the repo root.

---

## 1. Database (PostGIS + pgRouting)

This is **not** Fly's managed Postgres (that lacks pgRouting). It runs the same
`pgrouting/pgrouting` image as local development.

```bash
fly apps create transitlab-db
fly volumes create pgdata --size 3 -a transitlab-db -r lhr
fly secrets set POSTGRES_PASSWORD='<a-strong-password>' -a transitlab-db
fly deploy -c deploy/db.fly.toml -a transitlab-db
```

The database is private to your Fly org — reachable at `transitlab-db.flycast`
(or `transitlab-db.internal`), never exposed publicly.

## 2. API (Express)

```bash
fly apps create transitlab-api

# Point the API at the database and set auth/secret values:
fly secrets set -a transitlab-api \
  DATABASE_URL='postgres://transitlab:<the-password>@transitlab-db.flycast:5432/transitlab' \
  JWT_SECRET='<a-long-random-string>'

fly deploy -a transitlab-api      # uses ./fly.toml + ./Dockerfile
```

Migrations run automatically on deploy (the `release_command` in `fly.toml`,
idempotent). Confirm it's healthy:

```bash
curl https://transitlab-api.fly.dev/api/health
# {"status":"ok","db":"connected","postgis":"3.5.2","pgrouting":"3.8.0"}
```

### Seed the reference data (one-off, ~minutes)

Seeding pulls open data (TfL / OpenStreetMap / ONS) and builds the network graph.
It's too long for a release command, so run it once over SSH:

```bash
fly ssh console -a transitlab-api
# inside the machine:
node_modules/.bin/tsx server/src/scripts/seed/index.ts        # full seed
#   or limit the slow Overpass step:
OVERPASS_REGIONS=london node_modules/.bin/tsx server/src/scripts/seed/index.ts
```

(Optional: set `TFL_APP_KEY` as a secret first to avoid TfL rate limits.)

## 3. Frontend → API

In the Vercel project settings, set environment variables and redeploy:

```
VITE_API_BASE   = https://transitlab-api.fly.dev
VITE_MAPTILER_KEY = <optional, for the nicer vector base map>
```

Then update `CORS_ORIGIN` on the API to your Vercel origin:

```bash
fly secrets set CORS_ORIGIN='https://<your-project>.vercel.app' -a transitlab-api
```

---

## Notes

- **Region** — everything defaults to `lhr` (London); the data is UK-centric.
- **Costs** — the database machine runs continuously (it holds state); the API
  can scale to zero between requests (`auto_stop_machines`).
- **Backups** — add a Fly volume snapshot schedule or `pg_dump` cron for anything
  beyond a demo.
- **Alternative hosts** — any platform that runs the `Dockerfile` and provides a
  PostGIS+pgRouting database works (Render, Railway, a VM with the repo's
  `docker-compose.yml`). Only the database extension requirements are
  non-negotiable.
