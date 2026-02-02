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

extract_port() {
  local url="$1"
  local without_proto="${url#*://}"
  local hostport="${without_proto%%/*}"
  local port=""
  if [[ "$hostport" == *"@"* ]]; then
    hostport="${hostport##*@}"
  fi
  if [[ "$hostport" == *":"* ]]; then
    port="${hostport##*:}"
  fi
  echo "$port"
}

database_source="DATABASE_URL"
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -n "${POSTGRES_PRISMA_URL:-}" ]]; then
    DATABASE_URL="${POSTGRES_PRISMA_URL}"
    database_source="POSTGRES_PRISMA_URL"
  elif [[ -n "${POSTGRES_URL:-}" ]]; then
    DATABASE_URL="${POSTGRES_URL}"
    database_source="POSTGRES_URL"
  elif [[ -n "${POSTGRES_URL_NON_POOLING:-}" ]]; then
    DATABASE_URL="${POSTGRES_URL_NON_POOLING}"
    database_source="POSTGRES_URL_NON_POOLING"
  elif [[ -n "${SUPABASE_DATABASE_URL:-}" ]]; then
    DATABASE_URL="${SUPABASE_DATABASE_URL}"
    database_source="SUPABASE_DATABASE_URL"
  fi
  export DATABASE_URL
  echo "DATABASE_URL was not set. Resolved from ${database_source}."
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (non-empty). Set DATABASE_URL or provide POSTGRES_PRISMA_URL / POSTGRES_URL."
  exit 1
fi

direct_source="DIRECT_URL"
if [[ -z "${DIRECT_URL:-}" ]]; then
  if [[ -n "${POSTGRES_URL_NON_POOLING:-}" ]]; then
    DIRECT_URL="${POSTGRES_URL_NON_POOLING}"
    direct_source="POSTGRES_URL_NON_POOLING"
  elif [[ -n "${POSTGRES_PRISMA_URL:-}" ]]; then
    DIRECT_URL="${POSTGRES_PRISMA_URL}"
    direct_source="POSTGRES_PRISMA_URL"
  elif [[ -n "${SUPABASE_DATABASE_URL:-}" ]]; then
    DIRECT_URL="${SUPABASE_DATABASE_URL}"
    direct_source="SUPABASE_DATABASE_URL"
  else
    DIRECT_URL="${DATABASE_URL:-}"
    direct_source="DATABASE_URL"
  fi
  export DIRECT_URL
  echo "DIRECT_URL was not set. Resolved from ${direct_source}."
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: DIRECT_URL resolved to empty. Provide DIRECT_URL or POSTGRES_URL_NON_POOLING."
  exit 1
fi

if [[ "${direct_source}" == "DATABASE_URL" ]]; then
  direct_port="$(extract_port "${DIRECT_URL}")"
  if [[ -n "${direct_port}" && "${direct_port}" != "5432" ]]; then
    echo "ERROR: DIRECT_URL fell back to DATABASE_URL but port ${direct_port} is not 5432."
    exit 1
  fi
fi

echo "Prisma env prepared (values hidden). DATABASE_URL source=${database_source}, DIRECT_URL source=${direct_source}."

echo "Checking for failed migrations..."
node -e "const { execSync } = require('child_process');\ntry {\n  const output = execSync('npx prisma migrate status --schema prisma/schema.prisma --json', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();\n  const data = JSON.parse(output);\n  if (data.hasFailedMigrations) {\n    console.error('ERROR: Failed migrations detected in the target database.');\n    console.error('Resolve before deploy:');\n    console.error('  npx prisma migrate resolve --applied \"20260202001000_seed_xrule_tenant\"');\n    console.error('  npx prisma migrate deploy');\n    process.exit(1);\n  }\n} catch (error) {\n  console.error('ERROR: Unable to check migration status.');\n  console.error(error?.message || error);\n  process.exit(1);\n}\n"

npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma
next build
