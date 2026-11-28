// fn_bankroll_totals (the dashboard tiles) must add a row up exactly as
// ledgerMath.entryCents does (every other totaller).
//
// On 2026-11-28 #3289 changed ledgerMath's expense rule to
// -|gross_out - gross_in| while the installed fn_bankroll_totals still used
// gross_out - |gross_in|, so an expense typed into gross_out was a cost on
// the chart and a gain on the tiles. Nothing failed: the SQL lives in a
// migration no test read. This test reads the NEWEST migration that defines
// fn_bankroll_totals, pulls out its row rule, and runs it against entryCents
// on a table of cases. Changing the JavaScript rule without shipping a
// migration that changes the function the same way now fails CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryCents, toCents } from '../src/lib/bankroll/ledgerMath.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');

function newestDefinition() {
  const files = fs.readdirSync(DIR)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .filter((f) => /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.fn_bankroll_totals\s*\(/i.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
  assert.ok(files.length > 0, 'no migration defines fn_bankroll_totals');
  const file = files[files.length - 1];
  return { file, sql: fs.readFileSync(path.join(DIR, file), 'utf8') };
}

/** Every `CASE WHEN category = 'expense' THEN a ELSE b END` arm of the function body. */
function rowRules(sql) {
  const start = sql.search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.fn_bankroll_totals\s*\(/i);
  const body = sql.slice(start, sql.indexOf('$fn$;', start));
  return [...body.matchAll(/CASE\s+WHEN\s+category\s*=\s*'expense'\s+THEN\s+(.+?)\s+ELSE\s+(.+?)\s+END/gis)]
    .map((m) => ({ expense: m[1].trim(), other: m[2].trim() }));
}

/** A SQL arithmetic expression over out_c / in_c / abs() as a JavaScript function. Nothing else is accepted. */
function compile(expression) {
  assert.match(expression, /^[\sout_cin()abs+\-]+$/, 'unexpected token in SQL row rule: ' + expression);
  // eslint-disable-next-line no-new-func
  return new Function('out_c', 'in_c', 'return ' + expression.replace(/\babs\(/g, 'Math.abs(') + ';');
}

const CASES = [];
for (const grossIn of [0, 40, -40, 12.34, -0.01, 1000]) {
  for (const grossOut of [0, 25, -25, 12.34, 0.01, 1000]) CASES.push({ gross_in: grossIn, gross_out: grossOut });
}

test('the newest fn_bankroll_totals migration uses ledgerMath.entryCents for every row', () => {
  const { file, sql } = newestDefinition();
  const rules = rowRules(sql);
  assert.equal(rules.length, 2, file + ': expected the expense rule in the balance and the period arms');
  for (const rule of rules) {
    const expense = compile(rule.expense);
    const other = compile(rule.other);
    for (const values of CASES) {
      const out_c = toCents(values.gross_out);
      const in_c = toCents(values.gross_in);
      assert.equal(expense(out_c, in_c), entryCents({ ...values, category: 'expense' }),
        file + ' expense arm ' + rule.expense + ' for ' + JSON.stringify(values));
      for (const category of ['poker_cash', 'slots', 'deposit', 'withdrawal']) {
        assert.equal(other(out_c, in_c), entryCents({ ...values, category }),
          file + ' other arm ' + rule.other + ' for ' + category + ' ' + JSON.stringify(values));
      }
    }
  }
});

test('the newest fn_bankroll_totals rounds each value to cents as toCents does', () => {
  const { file, sql } = newestDefinition();
  const conversions = sql.match(/floor\(l\.gross_(?:in|out) \* 100 \+ 0\.5\)/g) || [];
  assert.equal(conversions.length, 4, file + ': gross_in and gross_out are converted with floor(x * 100 + 0.5) in both arms');
});

test('the guard sees the rule change that made it necessary', () => {
  const old = compile('out_c - abs(in_c)');
  const values = { gross_in: 0, gross_out: 25 };
  assert.notEqual(old(toCents(values.gross_out), toCents(values.gross_in)), entryCents({ ...values, category: 'expense' }),
    'the pre-#3289 SQL rule would fail this guard');
});
