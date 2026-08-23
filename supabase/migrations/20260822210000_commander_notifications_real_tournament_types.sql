-- commander_notifications.notification_type could not express what happened.
--
-- APPLIED TO PRODUCTION 2026-08-22 via the Supabase MCP before this file was
-- committed. All 8 existing rows remain valid.
--
-- notify.js sends ten kinds of tournament announcement - tournament_starting,
-- seat_assignment, level_up, break, break_ending, final_table, elimination,
-- itm, winner, custom - but the CHECK allowed only five values, none of which
-- covered a break, a level change, a final table or a winner. So the route
-- wrote `type === 'custom' ? 'custom' : 'tournament_starting'`: every
-- announcement of any kind was recorded as the tournament STARTING, and the
-- real type survived only in metadata.sub_type. Anything reading or counting
-- notification_type saw one tournament start per announcement.
--
-- Storing the truth is not possible without widening the constraint, and
-- coercing at the writer is what produced the wrong data in the first place.
--
-- Every value already present stays legal: custom (3), called_for_seat (2),
-- tournament_starting (2), seat_available (1). The waitlist/seat vocabulary is
-- preserved alongside the tournament one.
--
-- ROLLBACK:
--   ALTER TABLE public.commander_notifications
--     DROP CONSTRAINT commander_notifications_notification_type_check;
--   ALTER TABLE public.commander_notifications
--     ADD CONSTRAINT commander_notifications_notification_type_check
--     CHECK (notification_type = ANY (ARRAY['seat_available','tournament_starting',
--            'called_for_seat','promotion','custom']));
--   Re-coerce in notify.js at the same time, or the rollback rejects new rows.

ALTER TABLE public.commander_notifications
  DROP CONSTRAINT IF EXISTS commander_notifications_notification_type_check;

ALTER TABLE public.commander_notifications
  ADD CONSTRAINT commander_notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    -- waitlist / seating vocabulary (pre-existing, unchanged)
    'seat_available'::text,
    'called_for_seat'::text,
    'promotion'::text,
    'custom'::text,
    -- tournament announcements, matching notify.js NOTIFICATION_TYPES
    'tournament_starting'::text,
    'seat_assignment'::text,
    'level_up'::text,
    'break'::text,
    'break_ending'::text,
    'final_table'::text,
    'elimination'::text,
    'itm'::text,
    'winner'::text
  ]));

DO $$
DECLARE
  bad int;
  def text;
BEGIN
  SELECT count(*) INTO bad FROM public.commander_notifications
   WHERE notification_type IS NOT NULL
     AND notification_type NOT IN ('seat_available','called_for_seat','promotion','custom',
                                   'tournament_starting','seat_assignment','level_up','break',
                                   'break_ending','final_table','elimination','itm','winner');
  IF bad > 0 THEN
    RAISE EXCEPTION '% existing notification row(s) fall outside the new vocabulary', bad;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.commander_notifications'::regclass
     AND conname = 'commander_notifications_notification_type_check';
  IF def IS NULL OR position('final_table' in def) = 0 THEN
    RAISE EXCEPTION 'notification_type constraint did not widen';
  END IF;

  RAISE NOTICE 'commander_notifications.notification_type now covers the real tournament types';
END $$;
