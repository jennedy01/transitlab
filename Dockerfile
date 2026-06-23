# ---------------------------------------------------------------------------
# TRANSITLAB API image (Express + PostGIS/pgRouting client).
#
# Build context is the repo root: the server consumes the `@transitlab/shared`
# workspace as TypeScript source, so it runs under tsx (no separate JS build).
# Only the server + shared workspaces are installed (the client is not needed).
#
#   docker build -t transitlab-api .
#   docker run -p 8080:8080 -e DATABASE_URL=... transitlab-api
# ---------------------------------------------------------------------------
FROM node:20-slim

WORKDIR /app

# Manifests first for dependency-layer caching. All workspace package.json files
# are present so the npm `workspaces` config resolves; only server + shared are
# actually installed.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci --workspace=@transitlab/server --workspace=@transitlab/shared --include-workspace-root

# Application source.
COPY shared ./shared
COPY server ./server

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run the TypeScript server directly with tsx.
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]
