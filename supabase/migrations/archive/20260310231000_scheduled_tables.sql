-- ═══════════════════════════════════════════════════════════════
-- Scheduled Tables — Auto-open tables at configured times
-- Adds scheduling columns to existing table_templates table
-- ═══════════════════════════════════════════════════════════════

-- Schedule configuration
ALTER TABLE public.table_templates
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS schedule_days INTEGER[] DEFAULT '{}',  -- 0=Sun, 1=Mon, ..., 6=Sat
  ADD COLUMN IF NOT EXISTS schedule_time TEXT DEFAULT NULL,        -- 'HH:MM' in club timezone
  ADD COLUMN IF NOT EXISTS schedule_timezone TEXT DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS last_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_scheduled_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_templates_schedule
  ON table_templates(schedule_enabled, next_scheduled_at)
  WHERE schedule_enabled = TRUE;

DO $$ BEGIN RAISE NOTICE 'table_templates schedule columns added'; END $$;
