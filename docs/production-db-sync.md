# Production DB schema sync (Prisma)

This app expects the production Postgres schema to match `prisma/schema.prisma`. If the production DB is missing columns (e.g., `Venue.note`), Prisma queries will fail with `P2022` errors.

## Prerequisites

- Use Supabase Pooler **Session** mode (usually 5432) for Prisma CLI in IPv4-only environments.
  Direct host (`db.<project-ref>.supabase.co`) may require IPv6 or an IPv4 add-on.
- Use Supabase Pooler **Transaction** mode (usually 6543) for runtime `DATABASE_URL`.
  - Add `pgbouncer=true&connection_limit=1` when using transaction pooler.
- Node.js 18+ is recommended.
- Set `DIRECT_URL` to the Session pooler connection in environments that run migrations.
  - If you cannot set it, use the same value as `DATABASE_URL` (see `.env.example`).
  - Avoid saving `DIRECT_URL` as an empty string in Vercel env vars; remove it or set a real direct URL.
  - On Vercel/Supabase, the build script and runtime can auto-resolve `DATABASE_URL` / `DIRECT_URL` from `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`.
- For single-tenant setups, `XRULE_TENANT_ID` can be set to skip DB lookup of the Xrule tenant.

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

## Migration recovery (P3009)

If Prisma reports `P3009` (failed migration found) in production, you must resolve it manually.
Decide whether the failed migration already applied its SQL or not, then mark it:

```bash
# Mark as rolled back (if the migration did NOT apply)
npx prisma migrate resolve --rolled-back 20260202001000_seed_xrule_tenant

# Mark as applied (if the migration DID apply successfully)
npx prisma migrate resolve --applied 20260202001000_seed_xrule_tenant
```

After resolving, re-run `npx prisma migrate deploy`.
Prisma 5.19.x does not support `prisma migrate status --json`, so builds check the text output instead.
