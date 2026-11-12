#!/usr/bin/env node
/**
 * Acceptance test 1 (read-only, production): the Nov 11, 2026 board recomputed
 * through fn_daily_content_source must reproduce the approved top 3
 * (298, 240, 236). With --compare <p1-snapshot.json> every row is compared.
 * Prints a JSON report; exits non-zero on failure. Writes nothing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { buildDailyBoard } from '../lib/scoring.mjs';
import { chicagoDayBounds, dateLabel } from '../lib/time.mjs';

const require = createRequire(import.meta.url);
const envFile = process.env.DC_ENV_FILE || join(homedir(), 'Documents/Smarter-Poker-World-Hub/.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ymd = '2026-11-11';
const { start, end } = chicagoDayBounds(ymd);
const { data, error } = await sb.rpc('fn_daily_content_source', { p_from: start.toISOString(), p_to: end.toISOString(), p_detail: true });
if (error) { console.error(error.message); process.exit(1); }
const b = buildDailyBoard(data, { periodYmd: ymd, periodLabel: dateLabel(ymd) });
const top = b.payload.rows.map((r) => ({ rank: r.rank_label, name: r.name, score: r.score, wins: r.wins, scoring_finishes: r.scoring_finishes, prize_chips: r.prize_chips, horse: r.horse }));
const expect = [298, 240, 236];
const report = {
  test: 1, period: ymd, completeness: b.completeness, board: b.board, qualifying_events: b.payload.completeness.qualifying_events,
  top3: top.slice(0, 3).map((r) => r.score), pass_top3: expect.every((s, i) => top[i]?.score === s), rows: top,
  next_below_board: b.payload.next_below_board, human_callout: b.payload.human_callout.qualifies ? `${b.payload.human_callout.name}, ${b.payload.human_callout.position} of ${b.payload.human_callout.field}, ${b.payload.human_callout.event}` : null,
};
const ci = process.argv.indexOf('--compare');
if (ci > 0) {
  const p1 = JSON.parse(readFileSync(process.argv[ci + 1], 'utf8'));
  report.p1_compare = p1.rows.map((r, i) => ({ rank: r.rank, p1: `${r.name} ${r.score} pc${r.prize_chips}`, now: top[i] ? `${top[i].name} ${top[i].score} pc${top[i].prize_chips}` : null,
    match: !!top[i] && top[i].name === r.name && top[i].score === r.score && top[i].prize_chips === r.prize_chips }));
  report.pass_all_rows = report.p1_compare.every((x) => x.match);
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass_top3 && report.pass_all_rows !== false ? 0 : 1);
