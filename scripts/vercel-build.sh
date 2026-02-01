#!/usr/bin/env bash
set -euo pipefail

pick() {
  for value in "$@"; do
    if [[ -n "$value" ]]; then
      echo "$value"
      return 0
    fi
  done
  echo ""
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(pick "${POSTGRES_PRISMA_URL:-}" "${POSTGRES_URL:-}" "${POSTGRES_URL_NON_POOLING:-}")"
  export DATABASE_URL
  echo "DATABASE_URL was not set. Resolved from Vercel Postgres env (PRISMA_URL/URL/NON_POOLING)."
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (non-empty). Set DATABASE_URL or provide POSTGRES_PRISMA_URL / POSTGRES_URL."
  exit 1
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  DIRECT_URL="$(pick "${POSTGRES_URL_NON_POOLING:-}" "${POSTGRES_PRISMA_URL:-}" "${DATABASE_URL:-}")"
  export DIRECT_URL
  echo "DIRECT_URL was not set. Resolved from Vercel Postgres env (NON_POOLING/PRISMA_URL) or DATABASE_URL."
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: DIRECT_URL resolved to empty. Provide DIRECT_URL or POSTGRES_URL_NON_POOLING."
  exit 1
fi

echo "Prisma env prepared (values hidden). Running Prisma + Next build..."

npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma
next build
