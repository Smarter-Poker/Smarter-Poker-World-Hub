-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728015522_add_updated_at_to_commander_table_displays.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- `commander_table_displays` has no `updated_at` column, but two shipping
-- routes reference one:
--
--   pages/api/displays/[deviceId]/heartbeat.js:44  SELECTs it
--   pages/api/displays/index.js:168               WRITES it
--
-- The failed SELECT lands in `if (error || !display)`, so that heartbeat
-- route returns `404 Display not registered` for every device including
-- correctly registered ones, and re-registering an existing device fails
-- outright. The wall-display feature is live in code and dead in
-- production: the table holds a single row with NULL device_id and NULL
-- venue_id, so no real tablet has ever registered successfully.
--
-- Adding the column is the smaller change than editing both call sites,
-- and it is the column they clearly intended: every sibling commander_*
-- table carries created_at/updated_at.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.commander_table_displays
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep it honest without relying on every caller remembering to set it.
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_touch_updated_at() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commander_table_displays_touch ON public.commander_table_displays;
CREATE TRIGGER trg_commander_table_displays_touch
  BEFORE UPDATE ON public.commander_table_displays
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_table_displays'
      AND column_name='updated_at'
  ) THEN
    RAISE EXCEPTION 'updated_at was not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.commander_table_displays'::regclass
      AND tgname='trg_commander_table_displays_touch'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'touch trigger was not created';
  END IF;
END $$;
