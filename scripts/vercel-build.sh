#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (non-empty) for Prisma build/migrate."
  exit 1
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  export DIRECT_URL="$DATABASE_URL"
else
  export DIRECT_URL="$DIRECT_URL"
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: DIRECT_URL resolved to empty even after fallback."
  exit 1
fi

echo "Prisma env prepared. Running generate/migrate..."

npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma
next build
