-- Enable Row Level Security on all public tables
--
-- Background:
--   This app accesses PostgreSQL exclusively via Prisma using the `postgres`
--   superuser role (DATABASE_URL / DIRECT_URL).  The superuser bypasses RLS,
--   so enabling RLS has NO effect on the application.
--
--   However, Supabase also exposes every public table through PostgREST
--   (accessible with the public `anon` key).  Without RLS, any client that
--   knows the anon key can query or mutate data directly.
--
--   Enabling RLS with NO permissive policies means PostgREST access is denied
--   by default for all roles (anon / authenticated), while Prisma continues to
--   work unchanged.
--
-- Supabase Security Advisor report: 13 errors / 2026-02-22
-- Lint: rls_disabled_in_public (0013)

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Tenant"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Agency"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Intermediary"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Venue"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Event"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EventDay"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sale"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Access"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Attachment"         ENABLE ROW LEVEL SECURITY;

-- No permissive policies are added intentionally.
-- Default behaviour with RLS enabled and no policies = DENY ALL for
-- non-superuser roles (anon / authenticated via PostgREST).
-- The postgres superuser used by Prisma is exempt from RLS by design.
