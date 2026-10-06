-- 20261006141142_a_legal_name_is_never_a_handle_or_a_public_name.sql
-- Applied to production 2026-10-06 14:11 UTC as version 20261006141142 after a
-- rolled-back dry run. Post-apply: 22 audit rows; the only rows still matching
-- either test are the two brand accounts excluded below. (The audit rows name
-- the migration by its reserved slug 20261006142000_...; that string is kept.)
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2 (data correction, audited, reversible)
-- AUTHOR:       Claude, 2026-10-06, on Dan's instruction of the same day
-- AFFECTS:      public.profiles.username (15 rows), public.profiles.display_name
--               (7 rows), public.admin_audit_log (22 rows)
-- IRREVERSIBLE: no (every changed row is listed in admin_audit_log with the
--               value it replaced, keyed by profile id)
--
-- WHY:
--   Ruling 25: a person's legal name is readable only by them and platform
--   staff. Two places still published it:
--
--   1. USERNAMES. 15 people's username is their legal name with the spaces
--      taken out. The username is public: it is the profile address and the
--      fallback handle at every table. They were derived from the legal name
--      by the old OAuth callback and ensure-profile fallbacks, which
--      #2171 (live 2026-10-06) stopped for new accounts. Dan, 2026-10-06:
--      "CHANGE IT TO A UNIQUE POKER NAME."
--   2. STAFF AND VENUE-OWNER DISPLAY NAMES. 7 people (2 admins, 5 venue
--      owners) still show their legal name as their display name; migration
--      20261006050321 cleared ordinary players only. Dan, 2026-10-06: "SAME
--      THING, CHANGE THERE 'REAL NAME' TO A POKER ALIAS."
--
--   Not changed, deliberately: the two Smarter.Poker brand accounts
--   (00000000-...-0001 "smarter.poker" and the service identity
--   2d1cd6c3 "Smarter.Poker Official"). Their "full name" is the brand, not a
--   person, so there is no legal name to hide. 516 horses whose username
--   equals their persona name are not people either.
--
-- HOW:
--   * Every new name was checked on production before this was written:
--     free in username, alias and display_name (case and punctuation
--     ignored), not reserved, and matching the username format
--     ^[a-z0-9][a-z0-9_.]{2,19}$. 9ca264f1 gets "savage", its own alias.
--     A display name that already is the person's chosen alias (KingFish,
--     Danimal, Johnny) is used as is; the four without one get a new alias.
--   * Pre-image: each row must STILL carry its legal name in the column
--     being changed, so this refuses if someone already fixed it by hand.
--   * One admin_audit_log row per change, holding the old value (owner-only
--     data, staff-readable table) so a revert is one UPDATE per row.
--   * Post-image: each row carries exactly the name assigned (a person's
--     display name that equals a horse's is silently dropped by
--     trg_reject_horse_name_on_human; this would catch that).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE _renames (id uuid PRIMARY KEY, col text NOT NULL, new_value text NOT NULL) ON COMMIT DROP;
INSERT INTO _renames (id, col, new_value) VALUES
  ('b4f88502-e3e7-4718-a1bf-d326297cb6be', 'username', 'bountyfox96'),
  ('c27c1fb3-7025-4aeb-8369-e230cf5121fe', 'username', 'broadwayhustler75'),
  ('982f1723-ae9a-411b-9ef0-aebf114224c6', 'username', 'suitedknight39'),
  ('35c34eaf-827c-4921-a7a7-1a74d76796da', 'username', 'quadpanther79'),
  ('603dd88e-c5f5-4605-b76a-db67283f98ef', 'username', 'buttonhawk23'),
  ('5a8466fc-93d5-41c5-b6b4-a9e598b28e30', 'username', 'riverranger24'),
  ('91765c65-70ac-4e33-822e-11bf810142c9', 'username', 'flopmaverick69'),
  ('91d2f95f-7519-4a69-b617-4cc0bd3cbbb0', 'username', 'gutshottiger57'),
  ('aa9ff918-d0ad-4669-81fd-2da7be9fe7e7', 'username', 'suitedshark20'),
  ('41347dbb-a18d-4188-a3fd-c96810da21fa', 'username', 'pocketjaguar27'),
  ('34337d2d-5310-423d-8ae4-41a167fbb7c9', 'username', 'suitedwolf31'),
  ('3207d865-422a-449e-bc87-0edc7d76289c', 'username', 'shortraven17'),
  ('a4b48dc5-f193-487f-ba3e-fc30fae8b4cd', 'username', 'riverviper65'),
  ('628c0ddc-c7c3-4207-8dfb-34c9d4a40456', 'username', 'floprider44'),
  ('9ca264f1-c0aa-4df9-bc39-1a97bdaad016', 'username', 'savage'),
  ('47965354-0e56-43ef-931c-ddaab82af765', 'display_name', 'KingFish'),
  ('9b027798-9532-403f-a5c1-15554ce2959c', 'display_name', 'Danimal'),
  ('1ed711e3-33bb-40e5-ac06-7d3e67fe3484', 'display_name', 'Johnny'),
  ('a9299039-e557-4e3b-802a-3b790a179ea7', 'display_name', 'NutsCobra72'),
  ('efbba185-729d-4a8d-bbdd-6346c77056a7', 'display_name', 'FeltRider55'),
  ('af9aa869-f19d-47e0-89be-461473924d3e', 'display_name', 'FeltHawk75'),
  ('6fd4f8ef-5bd9-48b3-bfd8-0f32dd752dc4', 'display_name', 'BountyShark90');

DO $pre$
DECLARE v_bad int; v_taken int;
BEGIN
  -- Each row still publishes its legal name in the column we change.
  SELECT count(*) INTO v_bad
    FROM _renames r JOIN public.profiles p ON p.id = r.id
   WHERE NOT CASE r.col
     WHEN 'username' THEN
       length(regexp_replace(coalesce(p.full_name, ''), '[^a-zA-Z0-9]', '', 'g')) >= 4
       AND lower(regexp_replace(p.username, '[^a-zA-Z0-9]', '', 'g')) IN (
             lower(regexp_replace(coalesce(p.full_name, ''), '[^a-zA-Z0-9]', '', 'g')),
             lower(regexp_replace(concat(p.first_name, p.last_name), '[^a-zA-Z0-9]', '', 'g')))
     ELSE
       lower(btrim(p.display_name)) IN (
             lower(btrim(p.full_name)),
             lower(btrim(concat_ws(' ', nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), '')))))
   END;
  IF v_bad <> 0 OR (SELECT count(*) FROM _renames r JOIN public.profiles p ON p.id = r.id) <> 22 THEN
    RAISE EXCEPTION 'pre: % of 22 rows no longer carry a legal name (or a row is missing); re-read before applying', v_bad;
  END IF;
  -- Every new username is still free (someone could have taken one since).
  SELECT count(*) INTO v_taken
    FROM _renames r JOIN public.profiles p ON lower(p.username) = lower(r.new_value) AND p.id <> r.id
   WHERE r.col = 'username';
  IF v_taken <> 0 THEN
    RAISE EXCEPTION 'pre: % new username(s) were taken since review', v_taken;
  END IF;
END
$pre$;

INSERT INTO public.admin_audit_log (action, target_type, target_id, details, before_state, after_state, actor_role)
SELECT CASE r.col WHEN 'username' THEN 'username_legal_name_replaced' ELSE 'display_name_legal_name_replaced' END,
       'profile', r.id::text,
       jsonb_build_object('migration', '20261006142000_a_legal_name_is_never_a_handle_or_a_public_name',
                          'ruling', 25,
                          'instruction', 'Dan 2026-10-06',
                          'revert', 'UPDATE profiles SET ' || r.col || ' = before_state->>''' || r.col || ''' WHERE id = target_id'),
       jsonb_build_object(r.col, CASE r.col WHEN 'username' THEN p.username ELSE p.display_name END),
       jsonb_build_object(r.col, r.new_value),
       'migration'
  FROM _renames r JOIN public.profiles p ON p.id = r.id;

UPDATE public.profiles p SET username = r.new_value, updated_at = now()
  FROM _renames r WHERE r.id = p.id AND r.col = 'username';
UPDATE public.profiles p SET display_name = r.new_value, updated_at = now()
  FROM _renames r WHERE r.id = p.id AND r.col = 'display_name';

DO $post$
DECLARE v_wrong int; v_audit int;
BEGIN
  SELECT count(*) INTO v_wrong
    FROM _renames r JOIN public.profiles p ON p.id = r.id
   WHERE (r.col = 'username' AND p.username IS DISTINCT FROM r.new_value)
      OR (r.col = 'display_name' AND p.display_name IS DISTINCT FROM r.new_value);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log
   WHERE action IN ('username_legal_name_replaced', 'display_name_legal_name_replaced')
     AND details->>'migration' = '20261006142000_a_legal_name_is_never_a_handle_or_a_public_name';
  IF v_wrong <> 0 OR v_audit <> 22 THEN
    RAISE EXCEPTION 'post: % row(s) do not carry their new name, % audit rows', v_wrong, v_audit;
  END IF;
END
$post$;

COMMIT;
