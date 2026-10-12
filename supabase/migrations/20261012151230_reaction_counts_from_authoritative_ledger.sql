-- TIER: 2; AUTHOR: Codex; AFFECTS: existing trig_sync_like_count trigger owner.
-- WHY: the invoker counter runs under author-only UPDATE RLS, leaving another
-- author's count unchanged. Reel hearts count likes; generic Posts preserve
-- all existing reaction rows (love/haha/wow/fire and other accepted reactions).
-- Recompute exact like-only ledger truth for the one legitimately mutated UUID.
-- Preserve trigger identity/order, reaction awards, restrictions, RLS and aliases.
-- No historical/bulk backfill: an affected row's ordinary next reaction repairs it.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF to_regprocedure('public.trig_sync_like_count()') IS NULL OR NOT EXISTS (
 SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_likes'::regclass AND tgname='trg_sync_like_count'
 AND tgfoid='public.trig_sync_like_count()'::regprocedure AND NOT tgisinternal) THEN
 RAISE EXCEPTION 'Maintained count trigger baseline missing'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.trig_sync_like_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE target uuid; reel_count bigint; post_count bigint;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'social_likes' OR TG_OP NOT IN ('INSERT','DELETE') THEN
   RAISE EXCEPTION 'Like counter called outside maintained reaction trigger'; END IF;
 target := CASE WHEN TG_OP='INSERT' THEN NEW.post_id ELSE OLD.post_id END;
 IF target IS NOT NULL THEN
   -- The same order on every legitimate mutation prevents cross-table deadlocks.
   -- Row locks serialize different players before taking a fresh ledger snapshot.
   PERFORM 1 FROM public.social_posts WHERE id=target FOR UPDATE;
   PERFORM 1 FROM public.social_reels WHERE id=target FOR UPDATE;
   SELECT count(*),count(*) FILTER (WHERE reaction_type='like') INTO post_count,reel_count FROM public.social_likes WHERE post_id=target;
   UPDATE public.social_posts SET like_count=post_count WHERE id=target;
   UPDATE public.social_reels SET like_count=reel_count WHERE id=target;
 END IF;
 IF TG_OP='INSERT' THEN RETURN NEW; ELSE RETURN OLD; END IF;
END $$;
REVOKE ALL ON FUNCTION public.trig_sync_like_count() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.trig_sync_like_count()'::regprocedure)
 OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_likes'::regclass
 AND tgname='trg_sync_like_count' AND tgfoid='public.trig_sync_like_count()'::regprocedure) THEN
  RAISE EXCEPTION 'Like counter owner postimage mismatch'; END IF;
END $$;
COMMIT;
