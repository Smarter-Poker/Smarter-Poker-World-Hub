#!/usr/bin/env node
/**
 * One-shot version of /cron/trivia-quality-audit — runs the same logic
 * directly via the pg pooler so the audit can fire NOW without waiting for
 * the workers VM image deploy + 09:00 UTC cron tick.
 *
 * Same decision rules as the workers handler:
 *   - verified=true & confidence ≥ 0.85 → quality_score = 9
 *   - verified=false & confidence ≥ 0.70 → quality_score = 2 (excluded by gameplay floor)
 *   - everything else                    → quality_score = 5 (uncertain — surface in dashboard)
 */
import pg from '../node_modules/pg/lib/index.js';

const PG_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const XAI_KEY = process.env.XAI_API_KEY;
if (!PG_PASSWORD || !XAI_KEY) { console.error('Missing SUPABASE_DB_PASSWORD or XAI_API_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20', 10);
const MODEL = args.find(a => a.startsWith('--model='))?.split('=')[1] || 'grok-3-mini'; // mini works, full = better
const DRY_RUN = args.includes('--dry-run');

const SYSTEM_PROMPT = `You are a quality-assurance reviewer for a poker trivia game. For each multiple-choice question you receive, you must verify FOUR things and reject the question if ANY fail.

CHECK 1 — FACTUAL ACCURACY (most important):
- Is the marked-correct answer actually correct? Verify against publicly known facts.
- If the explanation contradicts the marked answer, reject.

CHECK 2 — NO ANSWER-REVEALING TEXT:
- The question must NOT contain words or phrases that give away the answer.
- If the question text leaks the answer, reject (verified=false, confidence ≥ 0.8).

CHECK 3 — DISTRACTOR PARITY:
- All four options must be in the same category and roughly the same length.
- Joke distractors that obviously aren't real answers → reject.

CHECK 4 — DIFFICULTY HONESTY:
- If marked "hard" but only one option could plausibly be the answer → reject.

Output ONLY valid JSON in this exact shape (no markdown):
{
  "verified": true | false,
  "confidence": 0.00 to 1.00,
  "reasoning": "1-2 sentences. Cite the fact AND/OR which check failed",
  "failure_modes": ["factual"|"reveals_answer"|"distractor_quality"|"difficulty_mismatch"],
  "corrected_answer_text": "if verified=false and you know the right answer; else null"
}`;

function buildPrompt(q) {
  const opts = (typeof q.options === 'string') ? JSON.parse(q.options) : q.options;
  return `Question: ${q.question}
Options:
  A) ${opts[0]}
  B) ${opts[1]}
  C) ${opts[2]}
  D) ${opts[3]}
Marked correct: ${'ABCD'[q.correct_index]}) ${opts[q.correct_index]}
Explanation: ${q.explanation}
Category: ${q.category}${q.subcategory ? ` (subcategory: ${q.subcategory})` : ''}`;
}

async function callGrok(systemPrompt, userPrompt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  try {
    const payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.0,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    };
    if (MODEL.includes('mini')) payload.reasoning_effort = 'low';
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` },
      signal: ctrl.signal,
      body: JSON.stringify(payload),
    });
    clearTimeout(t);
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Grok ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const inputCost = (usage.prompt_tokens || 0) / 1e6 * (MODEL.includes('mini') ? 0.30 : 5.00);
    const outputCost = (usage.completion_tokens || 0) / 1e6 * (MODEL.includes('mini') ? 0.50 : 15.00);
    return { content, costUsd: inputCost + outputCost };
  } finally {
    clearTimeout(t);
  }
}

const { Client } = pg.default || pg;

async function main() {
  const t0 = Date.now();
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 6543,
    user: 'postgres.kuklfnapbkmacvwxktbh', password: PG_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Pull oldest un-audited Grok questions
  const r = await c.query(
    `SELECT id, category, subcategory, difficulty, question, options, correct_index, explanation, source, quality_score
     FROM trivia_questions
     WHERE source IN ('grok-3-mini', 'grok-3') AND last_audited_at IS NULL
     ORDER BY created_at ASC LIMIT $1`,
    [LIMIT]
  );

  if (r.rows.length === 0) {
    console.log('No un-audited Grok questions to audit.');
    await c.end();
    return;
  }

  console.log(`Auditing ${r.rows.length} questions with ${MODEL}${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  let totalCost = 0;
  let verifiedTrue = 0;
  let verifiedFalse = 0;
  let uncertain = 0;
  let errors = 0;
  const flagged = [];

  for (const q of r.rows) {
    try {
      const result = await callGrok(SYSTEM_PROMPT, buildPrompt(q));
      totalCost += result.costUsd;
      let parsed;
      try { parsed = JSON.parse(result.content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
      catch (e) { errors++; console.warn(`  parse fail for ${q.id.slice(0,8)}: ${e.message}`); continue; }

      const verified = !!parsed.verified;
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      const reasoning = String(parsed.reasoning || '').slice(0, 1000);
      const correctedAns = parsed.corrected_answer_text ? String(parsed.corrected_answer_text).slice(0, 200) : null;

      let newQS;
      if (verified && confidence >= 0.85) { newQS = 9; verifiedTrue++; }
      else if (!verified && confidence >= 0.70) {
        newQS = 2; verifiedFalse++;
        flagged.push({ id: q.id.slice(0,8), q: q.question.slice(0, 80), conf: Math.round(confidence*100), reasoning: reasoning.slice(0, 150), corrected: correctedAns });
      }
      else { newQS = 5; uncertain++; }

      const failureModes = Array.isArray(parsed.failure_modes)
        ? parsed.failure_modes.filter(f => typeof f === 'string').map(f => f.slice(0,30))
        : [];

      if (!DRY_RUN) {
        await c.query(
          `INSERT INTO trivia_quality_audits
           (question_id, verifier_model, verified, confidence, reasoning, failure_modes, corrected_answer_text, previous_quality_score, new_quality_score, cost_usd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [q.id, MODEL, verified, confidence, reasoning, failureModes, correctedAns, q.quality_score, newQS, result.costUsd]
        );
        await c.query(
          `UPDATE trivia_questions SET quality_score = $1, last_audited_at = NOW(), audit_verified = $2, audit_confidence = $3 WHERE id = $4`,
          [newQS, verified, confidence, q.id]
        );
      }

      const tag = verified && confidence >= 0.85 ? '✓' : !verified && confidence >= 0.70 ? '✗' : '?';
      process.stdout.write(`  ${tag} ${q.category.padEnd(20)} qs ${q.quality_score}→${newQS} | conf ${(confidence*100).toFixed(0)}% | $${totalCost.toFixed(4)}\r`);
    } catch (e) {
      errors++;
      console.warn(`  audit error for ${q.id.slice(0,8)}: ${e.message.slice(0,80)}`);
    }
  }

  await c.end();

  console.log(`\n\n=== AUDIT SUMMARY ===`);
  console.log(`  audited:       ${r.rows.length}`);
  console.log(`  ✓ verified:    ${verifiedTrue}  (qs → 9)`);
  console.log(`  ✗ flagged:     ${verifiedFalse}  (qs → 2, excluded by gameplay floor)`);
  console.log(`  ? uncertain:   ${uncertain}  (qs → 5, surfaced for human review)`);
  console.log(`  errors:        ${errors}`);
  console.log(`  total cost:    $${totalCost.toFixed(4)}`);
  console.log(`  elapsed:       ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (flagged.length > 0) {
    console.log(`\n=== FLAGGED (sample) ===`);
    for (const f of flagged.slice(0, 5)) {
      console.log(`  [${f.id}] conf ${f.conf}%`);
      console.log(`    Q: ${f.q}`);
      console.log(`    Why: ${f.reasoning}`);
      if (f.corrected) console.log(`    Correct? ${f.corrected}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
