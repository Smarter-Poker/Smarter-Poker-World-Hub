-- Fleet Content Programme Phase 6 approval gates.
--
-- Every new publishing way starts OFF. The worker also checks the fleet-wide
-- content_settings.engine_enabled switch before it reads a mode or composes
-- live copy. ON CONFLICT DO NOTHING preserves any later explicit approval.
INSERT INTO public.horse_post_modes (mode, enabled, description)
VALUES
  ('club_data_digest', false, 'Official club daily or weekly facts and completed tournament results'),
  ('local_event', false, 'Grounded local poker event listings from the unified calendar'),
  ('seasonal_local', false, 'Curated seasonal local sports context')
ON CONFLICT (mode) DO NOTHING;
