#!/usr/bin/env node
/**
 * Daily Content Engine worker (Gate 3, I-1: private dry runs only).
 *
 *   node services/daily-content/bin/worker.mjs --date 2026-11-12 --simulate-day
 *       Runs one full day with a simulated clock: each slot is planned at its
 *       snapshot time and run to completion. Source data is read now.
 *   node services/daily-content/bin/worker.mjs --tick
 *       One real-time tick for today's Chicago date.
 *
 * Env (read from DC_ENV_FILE, default the World Hub .env.local; never printed):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   DC_RENDER_ROOT  directory for render jobs (default ./.dc-render)
 *   DC_CHROMIUM     Chromium executable for Playwright
 * Publishing is impossible from this build: it refuses --live, and every
 * destination is disabled in the database with the global pause on.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, hostname } from 'node:os';
import { createRequire } from 'node:module';
import { Engine } from '../lib/engine.mjs';
import { SupabaseStore, supabaseReader } from '../lib/store-supabase.mjs';
import { SLOT_ORDER, slotTimes } from '../lib/boards.mjs';
import { chicagoDate } from '../lib/time.mjs';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

if (flag('--live')) { console.error('Refused: publishing is not authorized (Gate 4).'); process.exit(2); }

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(process.env.DC_ENV_FILE || join(homedir(), 'Documents/Smarter-Poker-World-Hub/.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase env'); process.exit(2); }
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(url, key, { auth: { persistSession: false } });

const renderRoot = resolve(process.env.DC_RENDER_ROOT || '.dc-render');
mkdirSync(renderRoot, { recursive: true });
const renderer = {
  async render(spec, jobKey) {
    const { renderSpec } = await import('../render/render.mjs');
    const dir = join(renderRoot, jobKey.replace(/[^a-zA-Z0-9_.-]+/g, '_'));
    mkdirSync(dir, { recursive: true });
    return renderSpec(spec, dir, { chromiumPath: process.env.DC_CHROMIUM });
  },
};

let simulatedNow = null;
const clock = () => simulatedNow || new Date();
const engine = new Engine({
  store: new SupabaseStore(sb), reader: supabaseReader(sb), renderer, clock,
  owner: `dc-worker@${hostname()}:${process.pid}`, dryRun: true,
  log: (...a) => console.log(...a),
});

const t0 = Date.now();
if (flag('--simulate-day')) {
  const ymd = opt('--date', chicagoDate(new Date()));
  for (const slot of SLOT_ORDER) {
    simulatedNow = new Date(slotTimes(ymd, slot).snapshotAt.getTime() + 60000);
    const ran = await engine.tick(ymd);
    const ed = await engine.store.latestEdition(ymd, slot);
    console.log(JSON.stringify({ slot, simulated_now: simulatedNow.toISOString(), jobs_run: ran, edition: ed && { id: ed.id, status: ed.status, reason: ed.status_reason, headline: ed.headline } }));
  }
} else if (flag('--tick')) {
  const ran = await engine.tick(chicagoDate(new Date()));
  console.log(JSON.stringify({ tick: new Date().toISOString(), jobs_run: ran }));
} else {
  console.log('usage: worker.mjs --simulate-day [--date YYYY-MM-DD] | --tick');
}
console.log(JSON.stringify({ elapsed_s: Math.round((Date.now() - t0) / 1000) }));
