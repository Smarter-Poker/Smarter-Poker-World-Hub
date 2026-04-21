-- =====================================================================
-- Pass 45: Text-field length caps across home_* user-writable surfaces
--
-- BUG (BI-1..BI-8, 8 verified):
--   Multiple user/host-writable text columns have NO length caps.
--   A single authenticated user/host can INSERT or UPDATE fields with
--   5MB+ payloads, causing:
--     • Storage bloat (per-row MBs)
--     • Feed/list query slowdowns (these rows ship in responses)
--     • Browser UI hangs rendering huge strings
--     • API-response bandwidth DoS
--     • Log-pipeline bloat
--
--   Verified accepted payloads (see 2026-04-21 transcript):
--     BI-1  groups.description        5,000,000 chars
--     BI-2  groups.tagline            1,000,000 chars
--     BI-3  games.title                 500,000 chars
--     BI-4  games.description         2,000,000 chars
--     BI-5  games.special_rules       2,000,000 chars
--     BI-6  games.food_drinks         2,000,000 chars
--     BI-7  games.notes_for_attendees 2,000,000 chars
--     BI-8  game_templates.*          1,000,000 chars each
--
-- FIX:
--   Add length CHECK constraints on all user/host-writable text columns.
--   Caps are generous compared to realistic UX:
--     - enum-like fields (game_type, format, stakes, visible_to): 64
--     - short display fields (city, state, zip, name, title): 120-200
--     - medium content (tagline, neighborhood, address): 200-500
--     - rich content (description, rules, notes, food_drinks): 2000-10000
--
--   Audit confirmed max existing length is 33 chars (groups.description);
--   no existing rows violate these caps — VALIDATE runs clean.
-- =====================================================================

-- ───── commander_home_groups ─────
ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_name_len CHECK (length(name) <= 120) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_name_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_description_len CHECK (description IS NULL OR length(description) <= 5000) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_description_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_tagline_len CHECK (tagline IS NULL OR length(tagline) <= 200) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_tagline_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_city_len CHECK (city IS NULL OR length(city) <= 100) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_city_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_state_len CHECK (state IS NULL OR length(state) <= 100) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_state_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_zip_len CHECK (zip_code IS NULL OR length(zip_code) <= 20) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_zip_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_invite_code_len CHECK (invite_code IS NULL OR length(invite_code) <= 64) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_invite_code_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_club_code_len CHECK (club_code IS NULL OR length(club_code) <= 64) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_club_code_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_charity_len CHECK (charity_beneficiary IS NULL OR length(charity_beneficiary) <= 200) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_charity_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_smoking_len CHECK (smoking_policy IS NULL OR length(smoking_policy) <= 200) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_smoking_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_typical_day_len CHECK (typical_day IS NULL OR length(typical_day) <= 500) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_typical_day_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_frequency_len CHECK (frequency IS NULL OR length(frequency) <= 100) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_frequency_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_default_gtype_len CHECK (default_game_type IS NULL OR length(default_game_type) <= 64) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_default_gtype_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_default_stakes_len CHECK (default_stakes IS NULL OR length(default_stakes) <= 64) NOT VALID;
ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_default_stakes_len;

-- ───── commander_home_games ─────
ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_title_len CHECK (title IS NULL OR length(title) <= 200) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_title_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_description_len CHECK (description IS NULL OR length(description) <= 10000) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_description_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_stakes_len CHECK (stakes IS NULL OR length(stakes) <= 64) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_stakes_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_type_len CHECK (game_type IS NULL OR length(game_type) <= 64) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_type_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_format_len CHECK (format IS NULL OR length(format) <= 64) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_format_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_address_len CHECK (address IS NULL OR length(address) <= 500) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_address_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_neighborhood_len CHECK (neighborhood IS NULL OR length(neighborhood) <= 200) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_neighborhood_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_loc_notes_len CHECK (location_notes IS NULL OR length(location_notes) <= 2000) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_loc_notes_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_notes_att_len CHECK (notes_for_attendees IS NULL OR length(notes_for_attendees) <= 5000) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_notes_att_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_special_rules_len CHECK (special_rules IS NULL OR length(special_rules) <= 5000) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_special_rules_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_food_drinks_len CHECK (food_drinks IS NULL OR length(food_drinks) <= 2000) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_food_drinks_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_cancel_reason_len CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 1000) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_cancel_reason_len;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_addr_visible_to_len CHECK (address_visible_to IS NULL OR length(address_visible_to) <= 64) NOT VALID;
ALTER TABLE public.commander_home_games VALIDATE CONSTRAINT chk_game_addr_visible_to_len;

-- ───── commander_home_game_templates ─────
ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_name_len CHECK (length(name) <= 120) NOT VALID;
ALTER TABLE public.commander_home_game_templates VALIDATE CONSTRAINT chk_tmpl_name_len;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_description_len CHECK (description IS NULL OR length(description) <= 5000) NOT VALID;
ALTER TABLE public.commander_home_game_templates VALIDATE CONSTRAINT chk_tmpl_description_len;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_special_rules_len CHECK (special_rules IS NULL OR length(special_rules) <= 5000) NOT VALID;
ALTER TABLE public.commander_home_game_templates VALIDATE CONSTRAINT chk_tmpl_special_rules_len;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_food_drinks_len CHECK (food_drinks IS NULL OR length(food_drinks) <= 2000) NOT VALID;
ALTER TABLE public.commander_home_game_templates VALIDATE CONSTRAINT chk_tmpl_food_drinks_len;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_stakes_len CHECK (stakes IS NULL OR length(stakes) <= 64) NOT VALID;
ALTER TABLE public.commander_home_game_templates VALIDATE CONSTRAINT chk_tmpl_stakes_len;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_game_type_len CHECK (game_type IS NULL OR length(game_type) <= 64) NOT VALID;
ALTER TABLE public.commander_home_game_templates VALIDATE CONSTRAINT chk_tmpl_game_type_len;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_format_len CHECK (format IS NULL OR length(format) <= 64) NOT VALID;
ALTER TABLE public.commander_home_game_templates VALIDATE CONSTRAINT chk_tmpl_format_len;

-- ───── commander_home_game_tables ─────
ALTER TABLE public.commander_home_game_tables
  ADD CONSTRAINT chk_gtable_name_len CHECK (length(name) <= 120) NOT VALID;
ALTER TABLE public.commander_home_game_tables VALIDATE CONSTRAINT chk_gtable_name_len;

ALTER TABLE public.commander_home_game_tables
  ADD CONSTRAINT chk_gtable_stakes_len CHECK (stakes IS NULL OR length(stakes) <= 64) NOT VALID;
ALTER TABLE public.commander_home_game_tables VALIDATE CONSTRAINT chk_gtable_stakes_len;

ALTER TABLE public.commander_home_game_tables
  ADD CONSTRAINT chk_gtable_game_type_len CHECK (game_type IS NULL OR length(game_type) <= 64) NOT VALID;
ALTER TABLE public.commander_home_game_tables VALIDATE CONSTRAINT chk_gtable_game_type_len;

ALTER TABLE public.commander_home_game_tables
  ADD CONSTRAINT chk_gtable_format_len CHECK (format IS NULL OR length(format) <= 64) NOT VALID;
ALTER TABLE public.commander_home_game_tables VALIDATE CONSTRAINT chk_gtable_format_len;

-- ───── commander_home_members ─────
ALTER TABLE public.commander_home_members
  ADD CONSTRAINT chk_member_phone_len CHECK (phone IS NULL OR length(phone) <= 50) NOT VALID;
ALTER TABLE public.commander_home_members VALIDATE CONSTRAINT chk_member_phone_len;

ALTER TABLE public.commander_home_members
  ADD CONSTRAINT chk_member_private_note_len CHECK (host_private_note IS NULL OR length(host_private_note) <= 2000) NOT VALID;
ALTER TABLE public.commander_home_members VALIDATE CONSTRAINT chk_member_private_note_len;

-- ───── commander_home_invite_tokens ─────
ALTER TABLE public.commander_home_invite_tokens
  ADD CONSTRAINT chk_invite_label_len CHECK (label IS NULL OR length(label) <= 120) NOT VALID;
ALTER TABLE public.commander_home_invite_tokens VALIDATE CONSTRAINT chk_invite_label_len;

-- ───── commander_home_rsvps ─────
ALTER TABLE public.commander_home_rsvps
  ADD CONSTRAINT chk_rsvp_message_len CHECK (message IS NULL OR length(message) <= 1000) NOT VALID;
ALTER TABLE public.commander_home_rsvps VALIDATE CONSTRAINT chk_rsvp_message_len;

ALTER TABLE public.commander_home_rsvps
  ADD CONSTRAINT chk_rsvp_final_note_len CHECK (final_result_note IS NULL OR length(final_result_note) <= 2000) NOT VALID;
ALTER TABLE public.commander_home_rsvps VALIDATE CONSTRAINT chk_rsvp_final_note_len;

ALTER TABLE public.commander_home_rsvps
  ADD CONSTRAINT chk_rsvp_response_len CHECK (response IS NULL OR length(response) <= 64) NOT VALID;
ALTER TABLE public.commander_home_rsvps VALIDATE CONSTRAINT chk_rsvp_response_len;

-- ───── commander_home_seats ─────
ALTER TABLE public.commander_home_seats
  ADD CONSTRAINT chk_seat_note_len CHECK (note IS NULL OR length(note) <= 500) NOT VALID;
ALTER TABLE public.commander_home_seats VALIDATE CONSTRAINT chk_seat_note_len;

ALTER TABLE public.commander_home_seats
  ADD CONSTRAINT chk_seat_player_name_len CHECK (player_name IS NULL OR length(player_name) <= 120) NOT VALID;
ALTER TABLE public.commander_home_seats VALIDATE CONSTRAINT chk_seat_player_name_len;

-- ───── commander_home_seat_reservations ─────
ALTER TABLE public.commander_home_seat_reservations
  ADD CONSTRAINT chk_reservation_note_len CHECK (note IS NULL OR length(note) <= 500) NOT VALID;
ALTER TABLE public.commander_home_seat_reservations VALIDATE CONSTRAINT chk_reservation_note_len;

COMMENT ON CONSTRAINT chk_grp_description_len ON public.commander_home_groups IS
  'Pass 45: Caps description at 5000 chars. Seals BI-1 (5MB description DoS).';
COMMENT ON CONSTRAINT chk_game_description_len ON public.commander_home_games IS
  'Pass 45: Caps description at 10000 chars. Seals BI-4 (2MB description DoS).';
COMMENT ON CONSTRAINT chk_game_special_rules_len ON public.commander_home_games IS
  'Pass 45: Caps special_rules at 5000 chars. Seals BI-5 (2MB rules DoS).';