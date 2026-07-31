#!/usr/bin/env node
/**
 * Parallel Grok fill — Phase 50.
 *
 * Runs N concurrent grok-3-mini calls per round, validates, dedupes,
 * and inserts directly via the pg pooler. Designed to fit a single
 * round into a sandbox-bash 45s timeout (~30s per Grok call,
 * concurrency masks per-call latency so wall time = max-call time).
 *
 * Usage:
 *   node scripts/trivia-grok-parallel-fill.js \
 *     --category=poker_history --difficulty=easy \
 *     --rounds=2 --concurrency=5 --batch-size=10 \
 *     --target=2000 --cost-cap=25
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XAI_API_KEY,
 *   SUPABASE_DB_PASSWORD                        (required)
 *   SUPABASE_DB_HOST, SUPABASE_DB_USER,
 *   SUPABASE_DB_PORT, SUPABASE_DB_NAME,
 *   SUPABASE_DB_CA                              (optional, see below)
 *
 * Output: progress to stdout, JSON summary at end.
 *
 * WHAT WAS BROKEN:
 *   - `ssl: { rejectUnauthorized: false }` disabled certificate verification on
 *     a production database connection that carries the service password.
 *     Anyone able to intercept the connection could present their own
 *     certificate and read or rewrite everything. Verification is now ON; if a
 *     custom root is genuinely needed, supply it through SUPABASE_DB_CA.
 *   - The pooler host and database user were hardcoded, so a project-ref or
 *     region change would break the script with a confusing auth error. Both
 *     now come from env, with the current values as documented defaults.
 *   - There was NO cost cap (unlike trivia-grok-seed.js), so a large
 *     --rounds x --concurrency ran to completion no matter the spend.
 *   - The script blindly generated ROUNDS x CONCURRENCY x BATCH questions for a
 *     single fixed difficulty, with no reference to what the category actually
 *     needed. Large fills overshot the target and skewed the difficulty mix.
 */

import pg from '../node_modules/pg/lib/index.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XAI_KEY = process.env.XAI_API_KEY;
const PG_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!SUPABASE_URL || !SERVICE_KEY || !XAI_KEY || !PG_PASSWORD) {
  console.error('Missing env: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XAI_API_KEY, SUPABASE_DB_PASSWORD');
  process.exit(1);
}

// Connection topology from env, with the current production values as defaults.
const DB_HOST = process.env.SUPABASE_DB_HOST || 'aws-0-us-west-2.pooler.supabase.com';
const DB_USER = process.env.SUPABASE_DB_USER || 'postgres.kuklfnapbkmacvwxktbh';
const DB_PORT = parseInt(process.env.SUPABASE_DB_PORT || '6543', 10);
const DB_NAME = process.env.SUPABASE_DB_NAME || 'postgres';

/**
 * TLS config. The Supabase pooler presents a certificate chaining to a public
 * root, so verification succeeds with the system trust store. SUPABASE_DB_CA
 * exists for deployments behind a private root — it is NOT an escape hatch for
 * turning verification off.
 */
export function buildSslConfig(env = process.env) {
  const ca = env.SUPABASE_DB_CA;
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

const args = process.argv.slice(2);
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1] || 'poker_history';
const DIFFICULTY = args.find(a => a.startsWith('--difficulty='))?.split('=')[1] || 'easy';
const ROUNDS = parseInt(args.find(a => a.startsWith('--rounds='))?.split('=')[1] || '1', 10);
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const BATCH = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '10', 10);
/** Per-category depth target; the per-difficulty need is derived from it. */
const TARGET = parseInt(args.find(a => a.startsWith('--target='))?.split('=')[1] || '2000', 10);
/** Hard spend ceiling for this invocation, mirroring trivia-grok-seed.js. */
const COST_CAP_USD = parseFloat(args.find(a => a.startsWith('--cost-cap='))?.split('=')[1] || '25');

/** 20/50/30 difficulty split — the share of TARGET this difficulty should hold. */
const DIFFICULTY_SHARES = { easy: 0.20, medium: 0.50, hard: 0.30 };

const SUBCAT_MAP = {
  poker_history: ['Origins of poker', 'WSOP history', 'Online poker boom', 'Black Friday April 2011', 'Famous poker venues', 'Poker in pop culture', 'Pre-Hold\'em era games'],
  famous_hands: ['Moneymaker vs Farha 2003', 'Negreanu vs Hansen', 'Ivey vs Dwan', 'Dead Man\'s Hand', 'Bad beats on TV', 'Final table coolers', 'Heads-up bluffs'],
  player_profiles: ['Phil Hellmuth career', 'Doyle Brunson legacy', 'Phil Ivey accomplishments', 'Daniel Negreanu', 'Vanessa Selbst', 'Online specialists', 'Cash game pros'],
  tournament_facts: ['WSOP Main Event winners', 'Big One for One Drop', 'EPT champions', 'WPT history', 'Triton series records', 'Prize pool records', 'Final-table payouts'],
  rule_knowledge: ['Hand rankings', 'TDA betting rules', 'String-bet calls', 'Dealer button rules', 'All-in protocol', 'Showdown order', 'Dead button rules', 'Splash-the-pot etiquette'],
};

const subcats = SUBCAT_MAP[CATEGORY] || ['general'];

const SYSTEM_PROMPT = 'You are a poker historian and rules expert. Output ONLY valid JSON. Every fact must be verifiable from public sources. No invented dates, names, or amounts.';

function buildPrompt(subcategory, count, difficulty) {
  return `Generate ${count} factually accurate ${difficulty}-difficulty poker trivia questions about: ${subcategory}.

Rules:
- 4 multiple-choice options each, exactly one correct (set correct_index 0-3)
- Distractors must be plausible but clearly wrong (no joke options)
- "${difficulty}": easy = casual fans know, medium = enthusiasts, hard = serious students
- Provide a 1-2 sentence explanation citing the source/event/year
- Avoid duplicating well-known questions; vary scenarios

Return ONLY this JSON shape (no markdown):
{"questions":[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"...","subcategory":"${subcategory}"}]}`;
}

async function grokCallOnce(subcategory, count, difficulty, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(subcategory, count, difficulty) },
        ],
        max_tokens: 4000,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
      }),
    });
    clearTimeout(t);
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Grok ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const callCost = ((usage.prompt_tokens || 0) / 1e6) * 0.30 + ((usage.completion_tokens || 0) / 1e6) * 0.50;
    return { content, callCost, subcategory };
  } finally {
    clearTimeout(t);
  }
}

async function grokCall(subcategory, count, difficulty) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await grokCallOnce(subcategory, count, difficulty, 90000);
    } catch (e) {
      lastErr = e;
      // brief backoff
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

function validateQ(q) {
  if (!q || typeof q !== 'object') return false;
  if (typeof q.question !== 'string' || q.question.length < 15 || q.question.length > 500) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (q.options.some(o => typeof o !== 'string' || o.length < 1 || o.length > 200)) return false;
  if (new Set(q.options.map(o => o.toLowerCase().trim())).size !== 4) return false;
  if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) return false;
  if (typeof q.explanation !== 'string' || q.explanation.length < 20 || q.explanation.length > 1500) return false;
  return true;
}

const { Client } = pg.default || pg;

async function loadDedup(client, category) {
  const r = await client.query(
    'SELECT question FROM trivia_questions WHERE category = $1',
    [category],
  );
  const set = new Set();
  for (const row of r.rows) {
    const norm = (row.question || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
    if (norm) set.add(norm);
  }
  return set;
}

async function main() {
  const t0 = Date.now();
  console.log(`Phase 50 — parallel Grok fill for ${CATEGORY}/${DIFFICULTY} (${ROUNDS} rounds x ${CONCURRENCY} concurrent x ${BATCH} q, cost cap $${COST_CAP_USD})`);

  const client = new Client({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER,
    password: PG_PASSWORD,
    database: DB_NAME,
    ssl: buildSslConfig(),
  });
  await client.connect();

  const dedup = await loadDedup(client, CATEGORY);
  console.log(`  starting dedup set size: ${dedup.size}`);

  // Ask the DB what this difficulty actually needs instead of blindly
  // generating ROUNDS x CONCURRENCY x BATCH and overshooting the mix.
  const existing = await client.query(
    'SELECT COUNT(*)::int AS n FROM trivia_questions WHERE category = $1 AND difficulty = $2',
    [CATEGORY, DIFFICULTY],
  );
  const have = existing.rows[0]?.n || 0;
  const difficultyTarget = Math.round(TARGET * (DIFFICULTY_SHARES[DIFFICULTY] ?? 0.33));
  const need = Math.max(0, difficultyTarget - have);
  console.log(`  ${CATEGORY}/${DIFFICULTY}: have ${have}, target ${difficultyTarget}, need ${need}`);

  if (need === 0) {
    console.log('  already at target for this difficulty — nothing to do');
    await client.end();
    return;
  }

  let totalCost = 0;
  let totalInserted = 0;
  let totalRejected = 0;
  let totalGrokFails = 0;
  let stopReason = null;

  // Insert as soon as each call resolves so partial completion still persists
  async function insertRows(rows) {
    if (rows.length === 0) return 0;
    const cols = ['category','difficulty','question','options','correct_index','explanation','subcategory','quality_score','source','engine_metadata'];
    const values = [];
    const placeholders = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const base = i * cols.length;
      placeholders.push(`(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`);
      values.push(
        row.category, row.difficulty, row.question, JSON.stringify(row.options),
        row.correct_index, row.explanation, row.subcategory, row.quality_score,
        row.source, JSON.stringify(row.engine_metadata),
      );
    }
    const sql = `INSERT INTO trivia_questions (${cols.join(',')}) VALUES ${placeholders.join(',')}`;
    const r = await client.query(sql, values);
    return r.rowCount;
  }

  for (let round = 0; round < ROUNDS; round++) {
    // Both guards are checked BETWEEN rounds: a round already in flight is
    // allowed to finish and persist rather than being abandoned mid-insert.
    if (totalCost >= COST_CAP_USD) {
      stopReason = `cost cap $${COST_CAP_USD} reached at $${totalCost.toFixed(4)}`;
      console.warn(`  stopping: ${stopReason}`);
      break;
    }
    if (totalInserted >= need) {
      stopReason = `difficulty target reached (${have + totalInserted}/${difficultyTarget})`;
      console.log(`  stopping: ${stopReason}`);
      break;
    }

    // Do not generate more than the remaining need in this round.
    const remaining = need - totalInserted;
    const perCall = Math.max(1, Math.min(BATCH, Math.ceil(remaining / CONCURRENCY)));
    const callsThisRound = Math.max(1, Math.min(CONCURRENCY, Math.ceil(remaining / perCall)));

    const calls = [];
    for (let i = 0; i < callsThisRound; i++) {
      const subcat = subcats[(round * CONCURRENCY + i) % subcats.length];
      calls.push((async () => {
        try {
          const r = await grokCall(subcat, perCall, DIFFICULTY);
          totalCost += r.callCost || 0;
          let parsed;
          try {
            parsed = JSON.parse(r.content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
          } catch { totalGrokFails++; return; }
          const qs = parsed.questions || [];
          const rows = [];
          for (const q of qs) {
            if (!validateQ(q)) { totalRejected++; continue; }
            const norm = q.question.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
            if (dedup.has(norm)) { totalRejected++; continue; }
            dedup.add(norm);
            rows.push({
              category: CATEGORY, difficulty: DIFFICULTY,
              question: q.question.trim(),
              options: q.options.map(o => String(o).trim()),
              correct_index: q.correct_index,
              explanation: q.explanation.trim(),
              subcategory: `grok:${subcat.slice(0, 60)}`,
              quality_score: 7,
              source: 'grok-3-mini',
              engine_metadata: { model: 'grok-3-mini', topic: subcat, generated_at: new Date().toISOString() },
            });
          }
          if (rows.length > 0) {
            const inserted = await insertRows(rows);
            totalInserted += inserted;
            console.log(`  ${subcat.slice(0,30)} +${inserted} (total ${totalInserted}, cost $${totalCost.toFixed(4)})`);
          }
        } catch (e) {
          totalGrokFails++;
          console.warn(`  ${subcat.slice(0,30)} ERR: ${e.message.slice(0,100)}`);
        }
      })());
    }
    await Promise.all(calls);
  }

  await client.end();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== summary ===`);
  console.log(`  category:   ${CATEGORY}/${DIFFICULTY}`);
  console.log(`  inserted:   ${totalInserted}`);
  console.log(`  now at:     ${have + totalInserted}/${difficultyTarget} for this difficulty`);
  console.log(`  rejected:   ${totalRejected}`);
  console.log(`  grok fails: ${totalGrokFails}`);
  console.log(`  cost:       $${totalCost.toFixed(4)} (cap $${COST_CAP_USD})`);
  console.log(`  elapsed:    ${elapsed}s`);
  if (stopReason) console.log(`  stopped:    ${stopReason}`);
  if (have + totalInserted < difficultyTarget) {
    console.log(`  re-run to add the remaining ${difficultyTarget - have - totalInserted}.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
