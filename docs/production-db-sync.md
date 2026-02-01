# Production DB schema sync (Prisma)

This app expects the production Postgres schema to match `prisma/schema.prisma`. If the production DB is missing columns (e.g., `Venue.note`), Prisma queries will fail with `P2022` errors.

## Prerequisites

- A **non-pooling** Supabase/Postgres connection string (direct 5432), such as `POSTGRES_URL_NON_POOLING` or `POSTGRES_PRISMA_URL`.
- Node.js 18+ is recommended.
- Set `DIRECT_URL` to the non-pooling connection in environments that run migrations.
  - If you cannot set it, use the same value as `DATABASE_URL` (see `.env.example`).

## Steps (local terminal)

```bash
cd /workspaces/saiya

# Prefer direct (non-pooling) connection
export DATABASE_URL="$POSTGRES_URL_NON_POOLING"
export DIRECT_URL="$POSTGRES_URL_NON_POOLING"
# If not available, fall back to Prisma URL
# export DATABASE_URL="$POSTGRES_PRISMA_URL"
# export DIRECT_URL="$POSTGRES_PRISMA_URL"

node -v
npm -v

npm install
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma
```

## Verify the schema on Supabase

Run in Supabase SQL Editor:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'Venue'
order by ordinal_position;
```

If the table name differs in casing, list tables first:

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;
```

## Fallback (manual SQL)

Only if `prisma migrate deploy` cannot apply the change:

```sql
alter table "Venue" add column if not exists "note" text;
```

Repeat for any other missing columns that exist in `prisma/schema.prisma`.
