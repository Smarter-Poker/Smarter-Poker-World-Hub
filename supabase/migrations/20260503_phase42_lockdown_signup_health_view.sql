-- Phase 42 audit fix: lock signup_health_view to service_role only
-- Applied via Supabase MCP on 2026-05-03.
-- All 3 legitimate consumers (admin SSR page, /api/health/signup, crons) use service_role.
-- Closes auth_users_exposed advisor warning + small information-disclosure surface.
REVOKE ALL ON public.signup_health_view FROM anon, authenticated;
GRANT SELECT ON public.signup_health_view TO service_role;
