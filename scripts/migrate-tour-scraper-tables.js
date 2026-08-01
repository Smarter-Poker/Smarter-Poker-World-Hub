#!/usr/bin/env node
/**
 * One-shot migration script for tour-schedule-scraper tables
 * Connects to Supabase via service role JWT (REST API → execute SQL)
 */

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tour_schedule_registry (
    id            BIGSERIAL PRIMARY KEY,
    tour_name     TEXT NOT NULL UNIQUE,
    registry_data JSONB NOT NULL DEFAULT '{}',
    events_count  INT,
    last_scraped  TIMESTAMPTZ,
    last_modified TIMESTAMPTZ DEFAULT now(),
    created_at    TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tsr_name ON tour_schedule_registry(tour_name)`,
  `CREATE INDEX IF NOT EXISTS idx_tsr_scraped ON tour_schedule_registry(last_scraped)`,
  `ALTER TABLE tour_schedule_registry ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tour_schedule_registry' AND policyname='tsr_service') THEN
      CREATE POLICY tsr_service ON tour_schedule_registry FOR ALL USING (true) WITH CHECK (true);
    END IF;
  END $$`,
  `CREATE TABLE IF NOT EXISTS tour_schedule_sources (
    id             BIGSERIAL PRIMARY KEY,
    tour_name      TEXT NOT NULL UNIQUE,
    sources_config JSONB NOT NULL DEFAULT '{}',
    is_active      BOOLEAN DEFAULT true,
    pdf_only       BOOLEAN DEFAULT false,
    updated_at     TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tss_active ON tour_schedule_sources(is_active)`,
  `ALTER TABLE tour_schedule_sources ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tour_schedule_sources' AND policyname='tss_service') THEN
      CREATE POLICY tss_service ON tour_schedule_sources FOR ALL USING (true) WITH CHECK (true);
    END IF;
  END $$`,
  // Extend tour_event_details if it exists
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS series_name TEXT`,
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS event_number INT`,
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS guaranteed BIGINT`,
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS start_time TEXT`,
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS starting_chips INT`,
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS levels INT`,
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS pdf_source_url TEXT`,
  `ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'side_event'`,
  // scraper_runs extensions
  `ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS tours_scraped INT DEFAULT 0`,
  `ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS tours_updated INT DEFAULT 0`,
  `ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS total_events INT DEFAULT 0`,
  `ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS pdf_events_found INT DEFAULT 0`,
  `ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS errors_count INT DEFAULT 0`,
];

async function runStatement(sql) {
  // Use pg-meta style endpoint via service role
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  if (!resp.ok && resp.status !== 404) {
    const body = await resp.text();
    return { ok: false, status: resp.status, body };
  }
  // If exec RPC not available, try the pg endpoint
  const resp2 = await fetch(`https://api.supabase.com/v1/projects/kuklfnapbkmacvwxktbh/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const body2 = await resp2.text();
  return { ok: resp2.ok, status: resp2.status, body: body2.substring(0, 100) };
}

(async () => {
  console.log(`Running ${STATEMENTS.length} migration statements...`);
  let ok = 0; let fail = 0;
  for (let i = 0; i < STATEMENTS.length; i++) {
    const sql = STATEMENTS[i];
    const preview = sql.trim().substring(0, 60).replace(/\s+/g, ' ');
    const result = await runStatement(sql);
    if (result.ok || result.status === 200 || result.status === 201 || result.status === 204) {
      console.log(`  [${i+1}/${STATEMENTS.length}] ✓ ${preview}`);
      ok++;
    } else {
      console.log(`  [${i+1}/${STATEMENTS.length}] ${result.status} ${preview}`);
      console.log(`    → ${result.body?.substring(0, 120)}`);
      // Non-fatal for ALTER IF NOT EXISTS on missing table
      if (result.body?.includes('does not exist') || result.body?.includes('already exists')) {
        ok++;
      } else {
        fail++;
      }
    }
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
