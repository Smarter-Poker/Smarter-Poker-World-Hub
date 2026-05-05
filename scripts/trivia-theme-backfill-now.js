#!/usr/bin/env node
/**
 * Sandbox-side one-shot theme backfill (matches workers cron logic).
 * Tags up to N un-themed questions per run via grok-3-mini.
 * Each call is incremental + idempotent — runs persist progress
 * even if the bash sandbox times out mid-batch.
 */
import pg from '../node_modules/pg/lib/index.js';

const PG_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const XAI_KEY = process.env.XAI_API_KEY;
if (!PG_PASSWORD || !XAI_KEY) { console.error('Missing env'); process.exit(1); }

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20', 10);
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);

const SYSTEM = 'Output ONLY a 1-3 word kebab-case theme tag. No JSON, no quotes, no explanation. Examples: "black-friday", "phil-hellmuth-bracelets", "wsop-main-event-buy-in", "tda-string-bet-rule".';

async function tagOne(row) {
  const opts = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;
  const userMsg = `Category: ${row.category}\nQ: ${row.question}\nA: ${opts[row.correct_index]}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
        max_tokens: 50, temperature: 0, reasoning_effort: 'low',
      }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const raw = String(data.choices?.[0]?.message?.content || '').toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    return raw || null;
  } catch { return null; }
}

const { Client } = pg.default || pg;
const c = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 6543,
  user: 'postgres.kuklfnapbkmacvwxktbh', password: PG_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(`SELECT id, category, question, options, correct_index FROM trivia_questions WHERE theme IS NULL ORDER BY RANDOM() LIMIT $1`, [LIMIT]);
console.log(`tagging ${r.rows.length} rows, concurrency=${CONCURRENCY}`);

let tagged = 0;
let failed = 0;
for (let i = 0; i < r.rows.length; i += CONCURRENCY) {
  const slice = r.rows.slice(i, i + CONCURRENCY);
  const results = await Promise.all(slice.map(tagOne));
  for (let k = 0; k < slice.length; k++) {
    const theme = results[k];
    if (!theme) { failed++; continue; }
    await c.query('UPDATE trivia_questions SET theme = $1 WHERE id = $2', [theme, slice[k].id]);
    tagged++;
  }
  process.stdout.write(`  tagged ${tagged} / failed ${failed}\r`);
}
console.log(`\ndone: ${tagged} tagged, ${failed} failed`);
await c.end();
