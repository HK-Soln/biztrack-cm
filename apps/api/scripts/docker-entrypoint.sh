#!/bin/sh
# Container entrypoint for the API: run release-phase scripts (DB migrations, etc.)
# BEFORE starting the app, then hand off to the CMD. Portable across Railway/ECS/etc.
#
# NOTE: this runs on every container start. On a single instance (Railway default) that's
# effectively once per deploy. If you scale to multiple replicas, prefer a platform
# "pre-deploy"/release phase (e.g. Railway Pre-Deploy Command) so migrations run once,
# and remove the migration line here — concurrent replicas racing migrations can conflict.
set -e

echo "[entrypoint] Running database migrations..."
# Run from the api package dir so ts-node + tsconfig-paths resolve the entities' @/ imports.
( cd /app/apps/api \
  && node -r tsconfig-paths/register ./node_modules/typeorm/cli-ts-node-commonjs.js \
       migration:run -d src/database/data-source.ts )

# Add other pre-start steps here as needed (e.g. seed reference data, cache warmups).

echo "[entrypoint] Release scripts complete. Starting: $*"
exec "$@"
