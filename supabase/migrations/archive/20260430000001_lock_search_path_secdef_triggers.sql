-- ═══════════════════════════════════════════════════════════════════════════
-- 20260430b — Lock search_path on the SECURITY DEFINER trigger functions
--             that the Supabase security advisor flagged as missing
--             search_path config.
--
-- WHY: SECURITY DEFINER functions run with the owner's privileges. Without
-- a fixed search_path, a malicious user with CREATE on a shadowing schema
-- could plant a same-named table or function (e.g. `profiles`,
-- `social_stories`) and intercept the trigger's inserts/lookups at the
-- moment new rows are written by other users.
--
-- The two functions touched here:
--
--   - enforce_live_comment_author_name()
--       Fires BEFORE INSERT on live_chat_comments. Reads from `profiles`
--       to overwrite NEW.author_name with the canonical username so
--       clients can't spoof another user's name.
--       (Added in fix 3843849c20 — see live-comment author_name lockdown.)
--
--   - fn_auto_create_story_from_post()
--       Fires AFTER INSERT on social_posts. Inserts into `social_stories`
--       to auto-create a 24h story whenever a post lands.
--
-- Both reference unqualified table names. Locking search_path = public,
-- extensions guarantees those resolve to public.profiles /
-- public.social_stories regardless of whatever junk a session sets.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.enforce_live_comment_author_name()
    SET search_path = public, extensions;

ALTER FUNCTION public.fn_auto_create_story_from_post()
    SET search_path = public, extensions;
