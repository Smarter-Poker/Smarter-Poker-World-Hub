/**
 * The freeroll schedule has exactly one source: src/lib/freerolls/freeBuySchedule.mjs.
 *
 * Until 2026-11-11 roughly forty pages, feeds, calendars, schema nodes and
 * agent APIs described a schedule the Club Arena lobby has never run: four
 * events at 10 AM, 2 PM, 6 PM and 9 PM, 10,000 to 25,000 starting chips, a
 * Pot-Limit Omaha turbo, a Sunday Diamond Championship, "Diamond Freerolls
 * every 3 hours", and a combined "2,000 chips guaranteed every day" (60,000 a
 * month). public.tournaments shows five No-Limit Hold'em Free Buy events a day
 * at 00:30, 08:30, 12:30, 16:30 and 20:30 Central with 3,000 starting chips,
 * guarantees of 250 (Morning) and 500 (Afternoon) chips, and nothing else.
 *
 * This test pins the module to that schedule, requires the structured sources
 * to import it, and refuses the invented wording anywhere it could be served.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FREE_BUY_SCHEDULE,
  FREE_BUY_STARTING_CHIPS,
  FREE_BUY_SUMMARY,
  freeBuyAgentSchedule,
  freeBuyIcsEvents,
} from '../src/lib/freerolls/freeBuySchedule.mjs';

const ROOT = process.cwd();

test('canonical module matches the schedule the lobby actually runs', () => {
  assert.deepEqual(
    FREE_BUY_SCHEDULE.map((e) => [e.name, `${e.hour}:${String(e.minute).padStart(2, '0')}`, e.guaranteeChips]),
    [
      ['Midnight Free Buy', '0:30', 0],
      ['Morning Free Buy', '8:30', 250],
      ['Midday Free Buy', '12:30', 0],
      ['Afternoon Free Buy', '16:30', 500],
      ['Prime Time Free Buy', '20:30', 0],
    ],
  );
  assert.equal(FREE_BUY_STARTING_CHIPS, 3000);
  assert.equal(freeBuyAgentSchedule().length, 5);
  assert.equal(freeBuyIcsEvents().length, 5);
  assert.doesNotMatch(FREE_BUY_SUMMARY, /\$|2,000|Diamond|Omaha/);
});

const STRUCTURED_SOURCES = [
  'pages/freerolls.js',
  'pages/api/ai/freerolls.js',
  'pages/api/seo/series-calendar.js',
  'src/lib/mcp/mcpServer.mjs',
  'src/lib/poker-near-me/calendarExport.mjs',
  'src/lib/seo/hubPageSchema.js',
  'src/lib/seo/markdownIngestion.mjs',
];

test('every structured freeroll source reads the canonical module', () => {
  for (const rel of STRUCTURED_SOURCES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(src, /freerolls\/freeBuySchedule\.mjs/, `${rel} must import the canonical schedule`);
  }
});

const FORBIDDEN = [
  [/2,000[ -]Chips?\b[^\n]{0,60}(Freeroll|Daily|Guarant|Every|Tournament)/i, 'a 2,000-chip daily total'],
  [/(Freeroll|Daily|Guarant)[^\n]{0,40}2,000[ -]Chips?\b/i, 'a 2,000-chip daily total'],
  [/2,000\+ CHIPS DAILY/i, 'a 2,000-chip daily total'],
  [/60,000\+? chips monthly/i, 'a 60,000-chip monthly total'],
  [/Diamond Freerolls?[^\n]{0,20}Every 3 Hours/i, 'Diamond freerolls every 3 hours'],
  [/Sunday Diamond Championship|Weekly Diamond Arena Championship/i, 'a Sunday Diamond championship'],
  [/Morning Opener Freeroll|Afternoon Prime Freeroll|Evening Championship Freeroll|Nightcap Turbo Freeroll/i, 'an event that does not exist'],
  [/10:00 AM, 2:00 PM, 6:00 PM, 9:00 PM/i, 'the invented start times'],
];

const SCAN_ROOTS = ['pages', 'src', 'public'];
const SCAN_EXT = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.txt', '.json', '.md', '.xml']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.next')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCAN_EXT.has(path.extname(entry.name))) yield full;
  }
}

test('no served surface repeats the invented freeroll schedule', () => {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    const abs = path.join(ROOT, root);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const stat = fs.statSync(file);
      if (stat.size > 3_000_000) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const [re, why] of FORBIDDEN) {
          if (re.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1} (${why})`);
        }
      });
    }
  }
  assert.deepEqual(hits, [], `Invented freeroll copy found:\n${hits.join('\n')}`);
});
