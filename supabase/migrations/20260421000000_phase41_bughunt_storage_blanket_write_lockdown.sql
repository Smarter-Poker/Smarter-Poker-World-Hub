-- =====================================================================
-- Pass 43: Storage blanket-write lockdown — BG-2, BG-3 (CATASTROPHIC)
--
-- REQUIRES: supabase_storage_admin privileges.
-- RUN VIA:  supabase db push   (from local env where you're authed as
--                               dashboard user with storage-admin rights)
--           or paste into the Supabase dashboard SQL editor logged in
--           as an admin user.
--
-- Attempted via MCP apply_migration and execute_sql — both hit
-- "42501: must be owner of relation objects" because the MCP connects
-- as postgres which is NOT a member of supabase_storage_admin on
-- hosted-tier projects. This is Supabase's intended security boundary.
--
-- BUGS (verified live — see audit transcript 2026-04-21):
--
--   BG-2 "Authenticated users can update" — UPDATE policy had
--         using_qual=true, with_check=true for role authenticated.
--         Any authenticated user can REPLACE any object in any bucket:
--         another user's avatar, a venue logo, a DM attachment, a club
--         logo, a story. Catastrophic trust violation.
--
--   BG-3 "Authenticated users can delete" — DELETE policy had
--         using_qual=true for role authenticated.
--         Any authenticated user can WIPE any object in any bucket.
--         Trivial denial-of-service by any logged-in account.
--
-- FIX:
--   Replace both blanket policies with owner-scoped variants that
--   restrict mutations to the file's own uploader. storage.objects.owner
--   is auto-stamped to auth.uid() by the Supabase storage API on upload.
--
--   Admin-uploaded files (owner IS NULL — e.g., venue-logos uploaded via
--   service_role) remain modifiable only by service_role (which bypasses
--   RLS entirely). Per-bucket scoped policies that already exist (for
--   avatars, user-media, social-media, stories, uploads, messenger_media)
--   continue to layer on top — those are more permissive for specific
--   path-based patterns and remain intact, which is correct.
--
-- SCOPE LIMITATIONS:
--   Does NOT touch BG-1 ("Authenticated users can upload" with_check=true).
--   That policy enables impersonation via path forgery (upload
--   avatars/{other-uid}/foo.jpg with upsert=true). Fixing it requires
--   adding per-bucket scoped INSERT policies for 14 buckets currently
--   relying on the blanket — tracked for Pass 44.
--
--   Does NOT touch BG-5 (messenger_media bucket.public=true). Fixing
--   that requires client-code change from getPublicUrl → createSignedUrl
--   on pages/hub/messenger.js:3974,4058 — a coordinated app deploy, not
--   a pure RLS change.
-- =====================================================================

DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

CREATE POLICY "authenticated_update_own_objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (owner = auth.uid())
  WITH CHECK (owner = auth.uid());

CREATE POLICY "authenticated_delete_own_objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (owner = auth.uid());

COMMENT ON POLICY "authenticated_update_own_objects" ON storage.objects IS
  'Pass 43: Replaces catastrophic "Authenticated users can update" blanket '
  'policy (using=true, with_check=true). Restricts UPDATE to the file''s '
  'own uploader via owner=auth.uid(). Per-bucket scoped policies for '
  'avatars/user-media/etc. continue to apply additively.';

COMMENT ON POLICY "authenticated_delete_own_objects" ON storage.objects IS
  'Pass 43: Replaces catastrophic "Authenticated users can delete" blanket '
  'policy (using=true). Restricts DELETE to the file''s own uploader via '
  'owner=auth.uid(). Admin-uploaded files (owner IS NULL) can only be '
  'removed via service_role, which is correct.';
