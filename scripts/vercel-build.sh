#!/usr/bin/env bash
set -euo pipefail

echo "[vercel-build] prisma generate"
npx prisma generate

echo "[vercel-build] checking prisma migrate status (no --json on Prisma 5.19.x)"
STATUS_OUT="$(npx prisma migrate status --schema prisma/schema.prisma 2>&1 || true)"

echo "$STATUS_OUT"

# Detect failed migrations (Prisma prints this exact line)
if echo "$STATUS_OUT" | grep -q "Following migration have failed:"; then
  echo ""
  echo "❌ Prisma has failed migrations. DO NOT run migrate deploy during build."
  echo "Run the following command against the target DB, then redeploy:"
  echo "  npx prisma migrate resolve --applied \"20260202001000_seed_xrule_tenant\""
  echo ""
  echo "Then verify:"
  echo "  npx prisma migrate status --schema prisma/schema.prisma"
  exit 1
fi

# Also guard for P3009 if wording differs
if echo "$STATUS_OUT" | grep -q "P3009"; then
  echo ""
  echo "❌ Prisma P3009 detected. Resolve the failed migration, then redeploy."
  echo "  npx prisma migrate resolve --applied \"20260202001000_seed_xrule_tenant\""
  exit 1
fi

echo "[vercel-build] prisma migrate deploy"
npx prisma migrate deploy --schema prisma/schema.prisma

echo "[vercel-build] next build"
npx next build
