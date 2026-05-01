-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_rls_lockdown_tier_u_user_self_scoped.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (architectural — RLS policy DROP + CREATE)
-- AUTHOR:      Cowork agent (Phase 37 — RLS audit, tier-U user-scoped)
-- AFFECTS:     13 RLS policies on 9 tables
-- IRREVERSIBLE: yes — but reversible by re-CREATE with USING true
--
-- WHY:
--   These tables are user-self-scoped: the row's owner column should
--   match the writer's auth.uid(). Currently they have policies with
--   USING true / WITH CHECK true on roles {public}, meaning anyone
--   (including anon) can INSERT/UPDATE/DELETE arbitrary rows — letting
--   an attacker post comments as someone else, like as someone else,
--   etc.
--
--   Replacement uses auth.uid() = <owner_col> on roles {authenticated}.
--
--   Owner column per table:
--     profiles                   → id          (== auth.uid())
--     social_post_comments       → user_id
--     social_comment_likes       → user_id
--     social_page_reports        → reporter_id
--     sandbox_bookmarks          → user_id
--     sandbox_saved_hands        → user_id
--     sandbox_shared_scenarios   → creator_id
--     messenger_themes           → user_id
--     messenger_labels           → user_id
--
--   service_role still bypasses RLS, so server-side writes via API routes
--   continue to work regardless of these policies.
--
-- See .agent/workflows/migration-safety.md for the protocol.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_pre integer;
BEGIN
    SELECT COUNT(*) INTO v_pre
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN (
        'profiles','social_post_comments','social_comment_likes','social_page_reports',
        'sandbox_bookmarks','sandbox_saved_hands','sandbox_shared_scenarios',
        'messenger_themes','messenger_labels'
      )
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (qual IS NULL OR qual = 'true')
      AND (with_check IS NULL OR with_check = 'true');
    RAISE NOTICE 'Pre-flight: % wide-open user-scope policies present', v_pre;
    IF v_pre <> 13 THEN
        RAISE EXCEPTION 'Pre-flight: expected 13, found %', v_pre;
    END IF;
END $$;

-- ─── messenger_labels ──────────────────────────────────────────────────
DROP POLICY "messenger_labels_insert" ON public.messenger_labels;
CREATE POLICY "messenger_labels_insert_self" ON public.messenger_labels
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ─── messenger_themes ──────────────────────────────────────────────────
DROP POLICY "messenger_themes_insert" ON public.messenger_themes;
CREATE POLICY "messenger_themes_insert_self" ON public.messenger_themes
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ─── profiles (INSERT only — auth signup creates the row, then app can update) ──
DROP POLICY "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- ─── sandbox_bookmarks ─────────────────────────────────────────────────
DROP POLICY "sandbox_bookmarks_insert" ON public.sandbox_bookmarks;
CREATE POLICY "sandbox_bookmarks_insert_self" ON public.sandbox_bookmarks
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ─── sandbox_saved_hands ───────────────────────────────────────────────
DROP POLICY "sandbox_saved_hands_insert" ON public.sandbox_saved_hands;
CREATE POLICY "sandbox_saved_hands_insert_self" ON public.sandbox_saved_hands
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ─── sandbox_shared_scenarios ──────────────────────────────────────────
DROP POLICY "sandbox_shared_scenarios_delete" ON public.sandbox_shared_scenarios;
CREATE POLICY "sandbox_shared_scenarios_delete_self" ON public.sandbox_shared_scenarios
    FOR DELETE TO authenticated
    USING (auth.uid() = creator_id);
DROP POLICY "sandbox_shared_scenarios_insert" ON public.sandbox_shared_scenarios;
CREATE POLICY "sandbox_shared_scenarios_insert_self" ON public.sandbox_shared_scenarios
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = creator_id);
DROP POLICY "sandbox_shared_scenarios_update" ON public.sandbox_shared_scenarios;
CREATE POLICY "sandbox_shared_scenarios_update_self" ON public.sandbox_shared_scenarios
    FOR UPDATE TO authenticated
    USING (auth.uid() = creator_id)
    WITH CHECK (auth.uid() = creator_id);

-- ─── social_comment_likes ──────────────────────────────────────────────
DROP POLICY "social_comment_likes_delete" ON public.social_comment_likes;
CREATE POLICY "social_comment_likes_delete_self" ON public.social_comment_likes
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);
DROP POLICY "social_comment_likes_insert" ON public.social_comment_likes;
CREATE POLICY "social_comment_likes_insert_self" ON public.social_comment_likes
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
DROP POLICY "social_comment_likes_update" ON public.social_comment_likes;
CREATE POLICY "social_comment_likes_update_self" ON public.social_comment_likes
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ─── social_page_reports ───────────────────────────────────────────────
DROP POLICY "Anyone can report" ON public.social_page_reports;
CREATE POLICY "social_page_reports_insert_self" ON public.social_page_reports
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

-- ─── social_post_comments ──────────────────────────────────────────────
DROP POLICY "social_post_comments_insert" ON public.social_post_comments;
CREATE POLICY "social_post_comments_insert_self" ON public.social_post_comments
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ─── POST-APPLY ASSERTION ──────────────────────────────────────────────
DO $$
DECLARE v_remaining integer;
BEGIN
    -- All 13 wide-open policies are gone
    SELECT COUNT(*) INTO v_remaining
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN (
        'profiles','social_post_comments','social_comment_likes','social_page_reports',
        'sandbox_bookmarks','sandbox_saved_hands','sandbox_shared_scenarios',
        'messenger_themes','messenger_labels'
      )
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (qual IS NULL OR qual = 'true')
      AND (with_check IS NULL OR with_check = 'true');

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Post-apply: % wide-open policies still exist on user-scoped tables', v_remaining;
    END IF;
    RAISE NOTICE 'Post-apply: tier-U user-scoped lockdown complete';
END $$;
