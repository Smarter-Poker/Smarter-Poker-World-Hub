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
 *     --rounds=2 --concurrency=5 --batch-size=10
 *
 * Output: progress to stdout, JSON summary at end.
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

const args = process.argv.slice(2);
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1] || 'poker_history';
const DIFFICULTY = args.find(a => a.startsWith('--difficulty='))?.split('=')[1] || 'easy';
const ROUNDS = parseInt(args.find(a => a.startsWith('--rounds='))?.split('=')[1] || '1', 10);
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const BATCH = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '10', 10);

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
  console.log(`Phase 50 — parallel Grok fill for ${CATEGORY}/${DIFFICULTY} (${ROUNDS} rounds × ${CONCURRENCY} concurrent × ${BATCH} q)`);

  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 6543,
    user: 'postgres.kuklfnapbkmacvwxktbh',
    password: PG_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const dedup = await loadDedup(client, CATEGORY);
  console.log(`  starting dedup set size: ${dedup.size}`);

  let totalCost = 0;
  let totalInserted = 0;
  let totalRejected = 0;
  let totalGrokFails = 0;

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
    const calls = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      const subcat = subcats[(round * CONCURRENCY + i) % subcats.length];
      calls.push((async () => {
        try {
          const r = await grokCall(subcat, BATCH, DIFFICULTY);
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
  console.log(`  inserted: ${totalInserted}`);
  console.log(`  rejected: ${totalRejected}`);
  console.log(`  grok fails: ${totalGrokFails}`);
  console.log(`  cost: $${totalCost.toFixed(4)}`);
  console.log(`  elapsed: ${elapsed}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
