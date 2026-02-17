# Production DB Sync (Supabase + Prisma)

## Goal
Keep Prisma migrations reproducible in Vercel production by using the correct Supabase URLs.

## Required environment variables
- `DATABASE_URL`
  - Supabase Transaction pooler URL (`:6543`)
  - Must include `pgbouncer=true` (recommended: `connection_limit=1`)
  - Example:
    - `postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
- `DIRECT_URL`
  - Supabase direct URL (`db.<project-ref>.supabase.co:5432`)
  - Example:
    - `postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres`

Deprecated keys (do not use for runtime/migrate resolution):
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL`

## Verify env locally before migration
```bash
npm run prisma:env:check
```

## Deploy migration against production DB
```bash
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true&connection_limit=1" \
DIRECT_URL="postgresql://...@db.<project-ref>.supabase.co:5432/postgres" \
npm run prisma:migrate:deploy
```

## Recover failed migration (P3009)
Only if `prisma migrate deploy` cannot apply the change:

```bash
npm run prisma:migrate:status

# Case A: migration SQL not applied
npm run prisma:migrate:resolve:rolledback

# Case B: migration SQL already applied
npm run prisma:migrate:resolve:applied
```

After resolving, run `npm run prisma:migrate:deploy` again.

## Secret rotation checklist
1. Rotate in Supabase dashboard:
   - DB password
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_JWT_SECRET`
2. Update Vercel Production vars:
   ```bash
   vercel env rm DATABASE_URL production
   vercel env add DATABASE_URL production
   vercel env rm DIRECT_URL production
   vercel env add DIRECT_URL production
   vercel env rm SUPABASE_SERVICE_ROLE_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   vercel env rm SUPABASE_SECRET_KEY production
   vercel env add SUPABASE_SECRET_KEY production
   vercel env rm SUPABASE_JWT_SECRET production
   vercel env add SUPABASE_JWT_SECRET production
   ```
3. Trigger redeploy.
