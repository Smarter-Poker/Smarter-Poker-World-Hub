// LAW: every write that creates a per-user bankroll segment or rule names the
// table's natural key, so a returning user never hits the unique constraint.
//
// 2026-11-26 production: PokerIQ-Production logged 193
// bankroll_segments_user_id_segment_type_key and 96
// bankroll_rules_user_id_rule_type_key refusals in 24 h, all from
// initializeUserBankroll() on every Bankroll Manager open. supabase-js
// .upsert() without onConflict emits ON CONFLICT ("id"); the payload never
// carries id, so the insert fell through to (user_id, segment_type) /
// (user_id, rule_type) and was refused with 23505.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BANKROLL_RULE_CREATE_ONLY,
  BANKROLL_RULE_KEY,
  BANKROLL_RULE_UPSERT,
  BANKROLL_SEGMENT_CREATE_ONLY,
  BANKROLL_SEGMENT_KEY,
} from '../src/lib/bankroll/naturalKeys.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIRS = ['pages', 'src', 'lib', 'components', 'app', 'utils', 'services'];
const SKIP = new Set(['node_modules', '.next', 'archive', '_legacy_backups', '__tests__', 'types']);
const EXT = /\.(?:[cm]?js|jsx|ts|tsx)$/;

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

// Each .from('<table>') chain up to the end of its statement.
function chains(source, table) {
  const out = [];
  const re = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g');
  let m;
  while ((m = re.exec(source))) {
    const rest = source.slice(m.index);
    const end = rest.search(/;\s*(?:\n|$)/);
    out.push({ index: m.index, text: end === -1 ? rest.slice(0, 1500) : rest.slice(0, end) });
  }
  return out;
}

const files = SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d), []));

test('the source scan reads real writers (it is not vacuous)', () => {
  const writers = files.filter((f) => /bankroll_(segments|rules)/.test(readFileSync(f, 'utf8')));
  assert.ok(writers.length >= 2, `expected bankroll writers, found ${writers.length}`);
  const upserts = writers.flatMap((f) => chains(readFileSync(f, 'utf8'), 'bankroll_(?:segments|rules)'))
    .filter((c) => c.text.includes('.upsert('));
  assert.ok(upserts.length >= 3, `expected the known upserts, found ${upserts.length}`);
});

test('natural keys match the live unique constraints', () => {
  assert.equal(BANKROLL_SEGMENT_KEY, 'user_id,segment_type');
  assert.equal(BANKROLL_RULE_KEY, 'user_id,rule_type');
  assert.deepEqual({ ...BANKROLL_SEGMENT_CREATE_ONLY }, { onConflict: 'user_id,segment_type', ignoreDuplicates: true });
  assert.deepEqual({ ...BANKROLL_RULE_CREATE_ONLY }, { onConflict: 'user_id,rule_type', ignoreDuplicates: true });
  assert.deepEqual({ ...BANKROLL_RULE_UPSERT }, { onConflict: 'user_id,rule_type' });
  assert.ok(Object.isFrozen(BANKROLL_SEGMENT_CREATE_ONLY) && Object.isFrozen(BANKROLL_RULE_CREATE_ONLY));
});

test('every upsert into bankroll_segments / bankroll_rules names the natural key', () => {
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const table of ['bankroll_segments', 'bankroll_rules']) {
      for (const c of chains(src, table)) {
        if (!c.text.includes('.upsert(')) continue;
        const named = /BANKROLL_(?:SEGMENT|RULE)_(?:CREATE_ONLY|UPSERT)/.test(c.text)
          || /onConflict\s*:\s*['"`]user_id\s*,\s*(?:segment_type|rule_type)['"`]/.test(c.text);
        if (!named) offenders.push(`${relative(ROOT, file)} @${c.index}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'upsert without its natural-key onConflict targets "id" and is refused with 23505');
});

test('a bankroll segment is never created with a plain insert', () => {
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const c of chains(src, 'bankroll_segments')) {
      if (c.text.includes('.insert(')) offenders.push(`${relative(ROOT, file)} @${c.index}`);
    }
  }
  assert.deepEqual(offenders, [], 'select-then-insert races the default-row creator; use an upsert on the natural key');
});

test('a bankroll rule is inserted plainly only under a freshly minted custom rule type', () => {
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const c of chains(src, 'bankroll_rules')) {
      if (!c.text.includes('.insert(')) continue;
      const minted = /rule_type:\s*ruleType\b/.test(c.text) && src.includes('`custom_${Date.now()}`');
      if (!minted) offenders.push(`${relative(ROOT, file)} @${c.index}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('initializeUserBankroll creates only what is missing', () => {
  const src = readFileSync(join(ROOT, 'src/lib/bankroll/bankrollSelectors.ts'), 'utf8');
  const start = src.indexOf('export async function initializeUserBankroll');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(body, /BANKROLL_SEGMENT_CREATE_ONLY/);
  assert.match(body, /BANKROLL_RULE_CREATE_ONLY/);
  assert.doesNotMatch(body, /BANKROLL_RULE_UPSERT/, 'a merge here would reset every user rule to the default');
});
