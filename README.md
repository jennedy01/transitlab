# TRANSITLAB

<!-- Deployment badge — replace YOUR_PROJECT once the Vercel project is created:
     https://vercel.com/<account>/<project>/deployments -->
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jennedy01/transitlab)
<!-- ![Vercel](https://img.shields.io/github/deployments/jennedy01/transitlab/production?label=vercel&logo=vercel) -->

A transport planning studio where rail and transit experts design new train, tube,
light rail, and freight lines across the United Kingdom — drawn directly onto real
maps, with the existing network shown for context and a suite of analysis tools to
evaluate proposals.

> **Indicative tool.** All cost, demand, and journey-time figures produced by
> TRANSITLAB are rough planning estimates, not forecasts.

## Stack

| Layer      | Technology |
|------------|-----------|
| Frontend   | React + TypeScript, Vite, MapLibre GL JS, Terra Draw, Zustand, Tailwind |
| Backend    | Node.js + Express + TypeScript |
| Database   | PostgreSQL + PostGIS + pgRouting (via Docker) |
| Auth       | Email/password, JWT (bcrypt) |

This is an npm-workspaces monorepo: `shared` (types) → `server` (API) → `client` (UI).

## Prerequisites

- **Node ≥ 20** (the repo is developed against Node 20). If you use `nvm`: `nvm use 20`.
- **Docker Desktop** (for the PostGIS + pgRouting database). No local Postgres needed.

## Quick start

```bash
# 1. install dependencies for all workspaces
npm install

# 2. copy environment template and fill in optional keys
cp .env.example .env

# 3. bring up the database container (PostGIS + pgRouting)
npm run db:up

# 4. run migrations (creates the schema + spatial indexes)
npm run migrate

# 5. seed reference data (rolling stock, population, TfL, OSM rail)
npm run seed

# 6. run the app (server :4010 + client :5174)
npm run dev
```

Open http://localhost:5174.

## Repository layout

```
transitlab/
├── docker-compose.yml      # Postgres + PostGIS + pgRouting
├── shared/                 # TypeScript types shared by client and server
├── server/
│   └── src/
│       ├── routes/         # auth, schemes, lines, analysis
│       ├── analysis/       # catchment, missing-links, cost, journey-time, overlap
│       ├── db/             # connection, migrations, PostGIS setup
│       ├── scripts/seed/   # tfl, overpass, ons-population, rolling-stock
│       └── middleware/
└── client/
    └── src/
        ├── map/            # MapLibre setup, layers, Terra Draw integration
        ├── components/     # panels, profile strip, scheme tree, ui
        ├── store/          # Zustand stores
        ├── pages/
        └── lib/
```

## Data sources & attribution

TRANSITLAB is built entirely on open data:

- **TfL Unified API** — London transit lines/stations. Powered by TfL Open Data.
- **OpenStreetMap (Overpass API)** — national rail and freight geometry. © OpenStreetMap contributors, ODbL.
- **OpenRailwayMap** — raster infrastructure overlays (reference only). CC-BY-SA.
- **ONS Open Geography Portal & Census 2021** — LSOA boundaries and population. © Crown copyright, Open Government Licence v3.0.

Attribution is surfaced in the application footer.

## Features

- **Draw lines** on a real UK map (Terra Draw): place vertices, drag to edit, drop
  stations along the line, assign per-segment structure (tunnel / cutting / surface /
  embankment / viaduct / bridge — tunnels render dashed).
- **Engineering properties** per line (mode, gauge, electrification, rolling stock)
  and per segment (structure, track count, speed).
- **Reference network** — the existing UK rail/tube/freight network and a population
  density choropleth, loaded per viewport from seeded open data.
- **Vertical profile strip** — a live structural cross-section of the selected line.
- **Analysis tools** (server-side, PostGIS / pgRouting):
  catchment population (walk-radius buffers), indicative capital cost, journey time,
  coverage overlap, and **missing links** (poorly-connected population centres, and
  how a proposed line closes them).

Ports: API on **:4010**, client on **:5174**. A seeded demo scheme opens on first run.

## Deployment

This is a split deployment: a **static frontend** and a **stateful backend**.

### Frontend → Vercel

The client is a Vite SPA. `vercel.json` (repo root) builds it and serves it with
SPA rewrites:

| Setting | Value |
|---------|-------|
| Install command | `npm install` |
| Build command | `npm run build -w @transitlab/client` |
| Output directory | `client/dist` |
| Rewrites | all routes → `/index.html` |

Import this repo at [vercel.com/new](https://vercel.com/new) (or run `vercel`), then
set the environment variable **`VITE_API_BASE`** to your deployed API URL (and
optionally `VITE_MAPTILER_KEY`).

### Backend → a Postgres host (not Vercel)

The Express API depends on **PostgreSQL + PostGIS + pgRouting**, which Vercel does
not provide. Host the API and database on a platform that does (e.g. Fly.io, Render,
Railway, or any VM running the `docker-compose.yml` here), run `npm run migrate &&
npm run seed`, and point the frontend's `VITE_API_BASE` at it. Until then the
Vercel-hosted frontend loads but its data/analysis calls have no backend to reach.

For local development, see **Quick start** above — everything runs on your machine.

## Build status

All eight build stages are complete: scaffold/database, map foundation, seed
pipelines, auth + schemes, drawing, the profile strip, the analysis suite, and
polish (collapsible panels for tablet, reduced-motion support, keyboard focus,
and the seeded demo scheme).
