-- Audit Pass 1 fixes (corrected constraint names)

-- B1: Add social-feed tables to supabase_realtime so postgres_changes
--     subscriptions actually fire on writes.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.commander_home_posts,
  public.commander_home_post_comments,
  public.commander_home_post_likes,
  public.commander_home_polls,
  public.commander_home_poll_votes;

-- B2: REPLICA IDENTITY FULL so RLS sees the full OLD row on UPDATE/DELETE
--     realtime events (DEFAULT only emits PK; RLS evaluates against empty
--     row body and either drops legitimate events or leaks deletes).
ALTER TABLE public.commander_home_posts          REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_post_comments  REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_post_likes     REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_polls          REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_poll_votes     REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_groups         REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_games          REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_members        REPLICA IDENTITY FULL;
ALTER TABLE public.commander_home_rsvps          REPLICA IDENTITY FULL;

-- B3: data-loss landmine. owner_id/host_id CASCADE → account deletion
--     nukes entire groups/games. Switch to RESTRICT so deletion requires
--     explicit ownership transfer (or running the GDPR scrub fn first).
ALTER TABLE public.commander_home_groups
  DROP CONSTRAINT fk_commander_home_groups_owner_id_profiles;
ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT fk_commander_home_groups_owner_id_profiles
  FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.commander_home_games
  DROP CONSTRAINT fk_commander_home_games_host_id_profiles;
ALTER TABLE public.commander_home_games
  ADD CONSTRAINT fk_commander_home_games_host_id_profiles
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- B4: fn_hg_caller_display_name UUID enumeration leak — lock to
--     authenticated/service_role only.
REVOKE EXECUTE ON FUNCTION public.fn_hg_caller_display_name(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_hg_caller_display_name(uuid)
  TO authenticated, service_role;
