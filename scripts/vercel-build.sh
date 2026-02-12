#!/usr/bin/env bash
set -euo pipefail

# Prisma migrate/status must run with:
# - POSTGRES_PRISMA_URL: Supabase pooler Transaction URL (port 6543, pgbouncer=true)
# - POSTGRES_URL_NON_POOLING: Supabase direct URL (db.<project-ref>.supabase.co:5432)
PRISMA_CMD="node scripts/prisma-command.mjs"

echo "[vercel-build] prisma generate"
npx prisma generate

echo "[vercel-build] checking prisma migrate status (no --json on Prisma 5.19.x)"
STATUS_OUT="$($PRISMA_CMD migrate status --schema prisma/schema.prisma 2>&1 || true)"

echo "$STATUS_OUT"

# Detect failed migrations (Prisma prints this exact line)
if echo "$STATUS_OUT" | grep -q "Following migration have failed:"; then
  echo ""
  echo "❌ Prisma has failed migrations. DO NOT run migrate deploy during build."
  echo "Run the following command against the target DB, then redeploy:"
  echo "  npm run prisma:migrate:resolve:applied"
  echo ""
  echo "Then verify:"
  echo "  npm run prisma:migrate:status"
  exit 1
fi

# Also guard for P3009 if wording differs
if echo "$STATUS_OUT" | grep -q "P3009"; then
  echo ""
  echo "❌ Prisma P3009 detected. Resolve the failed migration, then redeploy."
  echo "  npm run prisma:migrate:resolve:applied"
  exit 1
fi

echo "[vercel-build] prisma migrate deploy"
$PRISMA_CMD migrate deploy --schema prisma/schema.prisma

echo "[vercel-build] next build"
npx next build
