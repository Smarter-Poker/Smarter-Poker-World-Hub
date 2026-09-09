#!/usr/bin/env node
/**
 * check-live-contracts.mjs - CHECK 25
 * ─────────────────────────────────────────────────────────────────────────
 * THE CODE IS CHECKED AGAINST THE LIVE DATABASE AND THE LIVE MODEL LIST.
 *
 * WHY THIS EXISTS (2026-09-08)
 * Three defects shipped with green CI and a written "verified" line, each one
 * a boundary the tests never crossed:
 *
 *   1. The receipt sheet opened the entry form with category 'session'.
 *      bankroll_ledger_category_check has never allowed it. Every scanned
 *      buy-in was refused with 23514 "Failed To Log Entry".
 *   2. /api/bankroll/tax-report read `f.amount` from w2g_forms. The column is
 *      gross_amount. Every uploaded W-2G printed "-".
 *   3. Two routes posted `grok-2-vision-latest` to api.x.ai. The model does
 *      not exist. Every dealer-document scan and every hand scan failed.
 *
 * Every existing gate compares source to source. This one asks the database
 * and the model API, so the next copy of any of the three goes red on the
 * pull request instead of in a user's hands.
 *
 * WHAT IT CHECKS
 *   A. VALUES: every bankroll_ledger category and expense_type the code can
 *      emit is in the live CHECK constraint (read via fn_ci_check_constraints,
 *      a service_role-only RPC, migration 20260908230551).
 *   B. COLUMNS: every column the bankroll writers and readers name exists in
 *      the live table (PostgREST OpenAPI, the same source CHECK 13 reads).
 *   C. MODELS: every model id named in code exists at api.x.ai. Asked with no
 *      credential: a missing model answers "Model not found" BEFORE
 *      authentication; an existing one asks for a key.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/ci/check-live-contracts.mjs
 * EXIT: 0 clean · 1 a contract is broken · 2 script error
 *       A network that cannot reach a source is reported and skipped, never
 *       treated as green: the exit is 0 only when every check that ran passed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const failures = [];
const skipped = [];
const fail = (msg) => failures.push(msg);

// ─────────────────────────────────────────────────────────────────────────
// WHAT THE CODE EMITS
// ─────────────────────────────────────────────────────────────────────────

function categoriesTheCodeEmits() {
  const out = new Map(); // value -> where
  const add = (v, where) => { if (v) out.set(v, where); };

  const modal = code('src/components/bankroll/LogEntryModal.jsx');
  const cats = modal.slice(modal.indexOf('const CATEGORIES = ['), modal.indexOf('];', modal.indexOf('const CATEGORIES = [')));
  for (const m of cats.matchAll(/id:\s*'([a-z_]+)'/g)) add(m[1], 'LogEntryModal CATEGORIES');

  const page = code('pages/hub/bankroll-manager.js');
  const map = page.slice(page.indexOf('const TYPE_TO_CATEGORY = {'), page.indexOf('};', page.indexOf('const TYPE_TO_CATEGORY = {')));
  for (const m of map.matchAll(/:\s*'([a-z_]+)'/g)) add(m[1], 'bankroll-manager TYPE_TO_CATEGORY');

  return out;
}

async function categoriesFromTheRouter() {
  const inbox = await import(pathToFileURL(join(ROOT, 'src/lib/bankroll/receiptInbox.mjs')).href);
  const routing = await import(pathToFileURL(join(ROOT, 'src/lib/bankroll/receiptRouting.mjs')).href);
  const out = new Map();
  for (const kind of ['tournament', 'cash', 'cashout']) {
    const v = inbox.ledgerCategoryFor({ destination: 'session', prefill: { entryKind: kind, finish_position: kind === 'cashout' ? 1 : null } });
    if (v) out.set(v, `receiptInbox.ledgerCategoryFor(${kind})`);
  }
  const expenseTypes = new Map();
  for (const category of ['hotel', 'flights', 'rental_car', 'gas', 'meals', 'transport', 'tips', 'tournament', 'buy_in', 'other', 'unknown_category']) {
    const r = routing.routeScan(routing.normaliseScan({ document_type: 'expense', confidence: 90, amount: 1, category }));
    if (r.prefill.expense_type) expenseTypes.set(r.prefill.expense_type, `receiptRouting EXPENSE_TYPE_MAP[${category}]`);
  }
  return { categories: out, expenseTypes };
}

/** Columns each bankroll writer/reader names, table by table. */
async function columnsTheCodeNames() {
  const inbox = await import(pathToFileURL(join(ROOT, 'src/lib/bankroll/receiptInbox.mjs')).href);
  const out = {};
  const add = (table, cols, where) => { (out[table] ||= new Map()); for (const c of cols) out[table].set(c, where); };

  const route = { destination: 'tax', label: 'x', summary: 'x', prefill: { vendor: 'x', gross_amount: 1, federal_withheld: 0, state_withheld: 0, date: '2026-01-01', tax_year: 2026 } };
  add('w2g_forms', Object.keys(inbox.w2gRowFromReceipt('u', route, 'https://x/y.jpg', '2026-01-01')), 'receiptInbox.w2gRowFromReceipt');
  add('bankroll_receipts', [...Object.keys(inbox.receiptRowFromScan('u', { imageUrl: 'x', extracted: {}, route, documentType: 'w2g' })), 'assigned_kind', 'assigned_id', 'assigned_at', 'created_at', 'id'], 'receiptInbox.receiptRowFromScan + page assignment');

  const tax = code('pages/api/bankroll/tax-report.js');
  const w2gBlock = tax.slice(tax.indexOf('report.uploadedW2gForms = '), tax.indexOf('}));', tax.indexOf('report.uploadedW2gForms = ')));
  add('w2g_forms', [...w2gBlock.matchAll(/\bf\.([a-z_]+)/g)].map((m) => m[1]), 'tax-report uploadedW2gForms');

  const vault = code('src/components/bankroll/DealerVault.jsx');
  const payload = vault.slice(vault.indexOf('const insertPayload = {'), vault.indexOf('};', vault.indexOf('const insertPayload = {')));
  add('dealer_documents', [...payload.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]), 'DealerVault insertPayload');

  const selectors = code('src/lib/bankroll/bankrollSelectors.ts');
  const createTrip = selectors.indexOf('export async function createTrip');
  const insertAt = selectors.indexOf('.insert({', createTrip);
  const tripInsert = selectors.slice(insertAt, selectors.indexOf('})', insertAt));
  add('bankroll_trips', [...tripInsert.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]), 'bankrollSelectors.createTrip');

  return out;
}

/** Every model id named in code, with where and which endpoint it is for. */
function modelsTheCodeNames() {
  const out = new Map();
  const dirs = ['pages/api', 'src/lib', 'src/content-engine', 'vendor/commander-shared/src/lib'];
  const walk = (dir, acc = []) => {
    let entries = [];
    try { entries = readdirSync(join(ROOT, dir)); } catch { return acc; }
    for (const name of entries) {
      const rel = join(dir, name);
      if (name === 'node_modules' || name.startsWith('.')) continue;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, acc);
      else if (/\.(js|mjs|cjs|ts)$/.test(name)) acc.push(rel);
    }
    return acc;
  };
  // Only ids that are SENT TO x.ai: a raw fetch of api.x.ai, or the shared
  // Grok client's chat/images calls. An Anthropic call in translate.js or a
  // Whisper call is somebody else's contract.
  const ANCHOR = /api\.x\.ai|chat\.completions\.create\(|images\.generate\(|createChatCompletion\(|generateImage\(/;
  for (const rel of dirs.flatMap((d) => walk(d))) {
    const src = code(rel);
    for (const m of src.matchAll(/model:\s*['"]([a-z0-9][a-z0-9.-]*)['"]/g)) {
      const before = src.slice(Math.max(0, m.index - 1500), m.index);
      if (ANCHOR.test(before)) out.set(m[1], rel);
    }
    if (rel.endsWith('grokClient.js')) for (const m of src.matchAll(/:\s*'(grok-[a-z0-9.-]+)'/g)) out.set(m[1], rel + ' MODEL_MAP');
  }
  // OpenAI-era aliases are mapped by the shared client, never sent as-is.
  for (const k of [...out.keys()]) if (/^(gpt-|dall-e)/.test(k)) out.delete(k);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// WHAT THE WORLD ACCEPTS
// ─────────────────────────────────────────────────────────────────────────

async function liveCheckValues(url, key) {
  const r = await fetch(`${url}/rest/v1/rpc/fn_ci_check_constraints`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!r.ok) throw new Error(`fn_ci_check_constraints answered ${r.status}`);
  const rows = await r.json();
  const values = (table, column) => {
    const row = rows.find((x) => x.table_name === table && x.definition.includes(`(${column} = ANY`));
    if (!row) return null;
    return [...row.definition.matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  };
  return { values };
}

async function liveColumns(url, key) {
  const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`OpenAPI answered ${r.status}`);
  const j = await r.json();
  return (table) => (j.definitions[table] ? Object.keys(j.definitions[table].properties || {}) : null);
}

async function modelExists(name) {
  const isImage = /image|imagine/.test(name);
  const endpoint = isImage ? 'https://api.x.ai/v1/images/generations' : 'https://api.x.ai/v1/chat/completions';
  const body = isImage ? { model: name, prompt: 'a dot', n: 1 } : { model: name, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 };
  const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  const msg = String(j.error?.message || j.error || '');
  if (/model not found/i.test(msg)) return false;
  return true; // "Incorrect API key" or a real answer: the name resolved
}

// ─────────────────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // A. values
  if (url && key) {
    let live;
    try { live = await liveCheckValues(url, key); } catch (e) { skipped.push(`A values: ${e.message}`); }
    if (live) {
      const allowedCats = live.values('bankroll_ledger', 'category');
      const allowedExp = live.values('bankroll_ledger', 'expense_type');
      if (!allowedCats) fail('A: bankroll_ledger.category has no CHECK constraint the RPC can see');
      if (!allowedExp) fail('A: bankroll_ledger.expense_type has no CHECK constraint the RPC can see');
      const emitted = categoriesTheCodeEmits();
      const routed = await categoriesFromTheRouter();
      for (const [v, where] of [...emitted, ...routed.categories]) {
        if (allowedCats && !allowedCats.includes(v)) fail(`A: ${where} emits category '${v}', which bankroll_ledger_category_check refuses (allowed: ${allowedCats.join(', ')})`);
      }
      for (const [v, where] of routed.expenseTypes) {
        if (allowedExp && !allowedExp.includes(v)) fail(`A: ${where} emits expense_type '${v}', which the CHECK refuses (allowed: ${allowedExp.join(', ')})`);
      }
      console.log(`  A. values: ${emitted.size + routed.categories.size} categories and ${routed.expenseTypes.size} expense types checked against the live CHECKs`);
    }
  } else {
    skipped.push('A values and B columns: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  }

  // B. columns
  if (url && key) {
    let cols;
    try { cols = await liveColumns(url, key); } catch (e) { skipped.push(`B columns: ${e.message}`); }
    if (cols) {
      const named = await columnsTheCodeNames();
      let n = 0;
      for (const [table, map] of Object.entries(named)) {
        const live = cols(table);
        if (!live) { fail(`B: table ${table} is not exposed by PostgREST`); continue; }
        for (const [c, where] of map) { n++; if (!live.includes(c)) fail(`B: ${where} names ${table}.${c}, which does not exist (live: ${live.join(', ')})`); }
      }
      console.log(`  B. columns: ${n} column references across ${Object.keys(named).length} tables checked against the live schema`);
    }
  }

  // C. models
  const models = modelsTheCodeNames();
  let reachable = true;
  for (const [name, where] of models) {
    let exists;
    try { exists = await modelExists(name); } catch (e) { reachable = false; skipped.push(`C models: api.x.ai unreachable (${e.message})`); break; }
    if (!exists) fail(`C: ${where} names model '${name}', which api.x.ai answers "Model not found"`);
  }
  if (reachable) console.log(`  C. models: ${models.size} model ids checked against api.x.ai`);

  for (const s of skipped) console.log(`  SKIPPED (not green, not red): ${s}`);
  if (failures.length) {
    console.error('\n[check-live-contracts] BROKEN CONTRACTS:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('[check-live-contracts] OK');
}

main().catch((e) => { console.error('[check-live-contracts] script error:', e); process.exit(2); });
