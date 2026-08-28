#!/usr/bin/env node
/**
 * TRIVIA FACTUAL QUALITY AUDIT (one-shot)
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs the factual-accuracy audit directly through the service-role API so it
 * can fire NOW rather than waiting on a deploy and a cron tick.
 *
 * Usage:
 *   node scripts/trivia-quality-audit-now.js --limit=200
 *   node scripts/trivia-quality-audit-now.js --category=famous_hands --limit=500
 *   node scripts/trivia-quality-audit-now.js --re-audit=90 --model=grok-3
 *   node scripts/trivia-quality-audit-now.js --dry-run --limit=20
 *
 * Flags:
 *   --limit=N          questions to audit this run (default 20)
 *   --category=X       restrict to one category
 *   --source=X         restrict to one exact generator source (useful for
 *                      auditing a newly inserted batch before it is served)
 *   --min-quality=N    only audit rows at or above this quality_score
 *   --re-audit=DAYS    also re-audit rows last audited more than DAYS ago
 *                      (use when running a better model than the original)
 *   --model=NAME       verifier model (default grok-3-mini)
 *   --batch=N          questions per Grok call (default 4)
 *   --concurrency=N    parallel Grok calls (default 5)
 *   --dry-run          score but write nothing
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XAI_API_KEY
 *      (all required)
 *
 * SCORING (see the note on the "uncertain" tier below):
 *   verified=true  & confidence >= 0.85 -> quality_score 9
 *   verified=true  & confidence <  0.85 -> keep the row playable (max(current, 7))
 *   verified=false & confidence >= 0.70 -> quality_score 2 (below the gameplay floor)
 *   verified=false & confidence <  0.70 -> quality_score 5 (human review)
 *
 * WHAT WAS BROKEN:
 *   - SOURCE FILTER. The query was `WHERE source IN ('grok-3-mini','grok-3')`,
 *     but almost no Grok-generated row carries those values: trivia-grok-seed.js
 *     set no source at all, the bootstrap API sets 'grok-bootstrap', and the
 *     other seeding scripts set none either. Only trivia-grok-parallel-fill.js
 *     rows were ever audited, so the bulk of the AI-generated pool permanently
 *     escaped fact-checking. The default now covers every unaudited row; the
 *     optional --source flag narrows a targeted batch without weakening the
 *     full-pool default.
 *   - POOL SHRINK. The "uncertain" branch set quality_score = 5 for everything
 *     that was not (verified && conf>=0.85) and not (!verified && conf>=0.70) —
 *     INCLUDING questions the verifier marked verified=TRUE at 0.70-0.84
 *     confidence. The gameplay floor is 6, so every audit run silently REMOVED
 *     correct questions from rotation while the header claimed qs=5 merely
 *     "surfaces in the dashboard". Verified-true questions now stay playable.
 *   - TLS verification was disabled on a production connection carrying the
 *     service password, and the pooler host and user were hardcoded.
 *   - One Grok call per question. The QA prompt is small, so questions are now
 *     batched and the calls run concurrently: roughly 60% cheaper and several
 *     times faster, which is what makes auditing a 15,000-row backlog viable.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const { createClient } = require('@supabase/supabase-js');

const XAI_KEY = process.env.XAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !XAI_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or XAI_API_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20', 10);
const MODEL = args.find(a => a.startsWith('--model='))?.split('=')[1] || 'grok-3-mini'; // mini works, full = better
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1] || null;
const SOURCE = args.find(a => a.startsWith('--source='))?.split('=')[1] || null;
const MIN_QUALITY = args.find(a => a.startsWith('--min-quality='))
  ? parseInt(args.find(a => a.startsWith('--min-quality=')).split('=')[1], 10)
  : null;
const RE_AUDIT_DAYS = args.find(a => a.startsWith('--re-audit='))
  ? parseInt(args.find(a => a.startsWith('--re-audit=')).split('=')[1], 10)
  : null;
const BATCH = Math.max(1, Math.min(8, parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '4', 10)));
const CONCURRENCY = Math.max(1, Math.min(10, parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10)));
const DRY_RUN = args.includes('--dry-run');

/** Gameplay quality floor — must match [mode].js MIN_QUALITY_SCORE. */
const QUALITY_FLOOR = 6;
/** Score kept for verified-true questions the verifier is less sure about. */
const VERIFIED_UNCERTAIN_SCORE = 7;

const SYSTEM_PROMPT = `You are a quality-assurance reviewer for a poker trivia game. For each multiple-choice question you receive, you must verify FOUR things and reject the question if ANY fail.

CHECK 1 — FACTUAL ACCURACY (most important):
- Is the marked-correct answer actually correct? Verify against publicly known facts.
- If the explanation contradicts the marked answer, reject.

CHECK 2 — NO ANSWER-REVEALING TEXT:
- The question must NOT contain words or phrases that give away the answer.
- If the question text leaks the answer, reject (verified=false, confidence >= 0.8).

CHECK 3 — DISTRACTOR PARITY:
- All four options must be in the same category and roughly the same length.
- Joke distractors that obviously aren't real answers -> reject.

CHECK 4 — DIFFICULTY HONESTY:
- If marked "hard" but only one option could plausibly be the answer -> reject.

You will receive a JSON array of questions, each with an "index". Return a verdict
for EVERY index you were given, in this exact shape (no markdown):
{
  "verdicts": [
    {
      "index": 0,
      "verified": true,
      "confidence": 0.00,
      "reasoning": "1-2 sentences. Cite the fact AND/OR which check failed",
      "failure_modes": ["factual"|"reveals_answer"|"distractor_quality"|"difficulty_mismatch"],
      "corrected_answer_text": "if verified=false and you know the right answer; else null"
    }
  ]
}`;

function describeQuestion(q, index) {
  const opts = (typeof q.options === 'string') ? JSON.parse(q.options) : q.options;
  return {
    index,
    question: q.question,
    options: opts,
    marked_correct: `${'ABCD'[q.correct_index]}) ${opts[q.correct_index]}`,
    explanation: q.explanation,
    category: q.category,
    difficulty: q.difficulty,
    subcategory: q.subcategory || null,
  };
}

async function callGrok(userPayload) {
  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    temperature: 0.0,
    // Scales with batch size — a fixed 600 truncated multi-question replies.
    max_tokens: 400 * userPayload.length + 200,
    response_format: { type: 'json_object' },
  };
  if (MODEL.includes('mini')) payload.reasoning_effort = 'low';

  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` },
        signal: ctrl.signal,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.text();
        const error = new Error(`Grok ${res.status}: ${errBody.slice(0, 200)}`);
        error.status = res.status;
        if (attempt < 3 && (res.status === 429 || (res.status >= 500 && res.status <= 526))) {
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, Math.min(10000, 1000 * (2 ** attempt))));
          continue;
        }
        throw error;
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};
      const inputCost = (usage.prompt_tokens || 0) / 1e6 * (MODEL.includes('mini') ? 0.30 : 5.00);
      const outputCost = (usage.completion_tokens || 0) / 1e6 * (MODEL.includes('mini') ? 0.50 : 15.00);
      return { content, costUsd: inputCost + outputCost };
    } catch (error) {
      lastError = error;
      if (attempt >= 3 || (error?.status && !(error.status === 429 || (error.status >= 500 && error.status <= 526)))) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(10000, 1000 * (2 ** attempt))));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Grok audit request failed before receiving a response');
}

/**
 * Decide the new quality_score.
 *
 * The critical case is verified=true with confidence below 0.85. The old code
 * dropped those to 5, BELOW the gameplay floor of 6, so every audit pass
 * shrank the usable pool the 60-day guarantee depends on — deleting correct
 * questions from rotation for the crime of being slightly less certain.
 */
function scoreVerdict(verified, confidence, currentScore) {
  if (verified && confidence >= 0.85) return { newQS: 9, tier: 'verified' };
  if (verified) return { newQS: Math.max(currentScore || 0, VERIFIED_UNCERTAIN_SCORE), tier: 'verified-soft' };
  if (confidence >= 0.70) return { newQS: 2, tier: 'flagged' };
  return { newQS: 5, tier: 'uncertain' };
}

/** Run tasks with bounded concurrency. */
async function runPool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function loadCandidates() {
  const rows = [];
  const pageSize = 1000; // Hosted PostgREST's default maximum response size.
  const cutoff = RE_AUDIT_DAYS !== null && Number.isFinite(RE_AUDIT_DAYS)
    ? new Date(Date.now() - RE_AUDIT_DAYS * 86400000).toISOString()
    : null;

  while (rows.length < LIMIT) {
    let q = supabase
      .from('trivia_questions')
      .select('id, category, subcategory, difficulty, question, options, correct_index, explanation, source, quality_score');
    q = cutoff
      ? q.or(`last_audited_at.is.null,last_audited_at.lt.${cutoff}`)
      : q.is('last_audited_at', null);
    if (CATEGORY) q = q.eq('category', CATEGORY);
    if (SOURCE) q = q.eq('source', SOURCE);
    if (MIN_QUALITY !== null && Number.isFinite(MIN_QUALITY)) q = q.gte('quality_score', MIN_QUALITY);

    const want = Math.min(pageSize, LIMIT - rows.length);
    const from = rows.length;
    const { data, error } = await q
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + want - 1);
    if (error) throw new Error(`candidate query failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < want) break;
  }
  return rows;
}

async function main() {
  const t0 = Date.now();
  const rows = await loadCandidates();

  if (rows.length === 0) {
    console.log('No questions match the selection criteria.');
    return;
  }

  console.log(`Auditing ${rows.length} questions with ${MODEL}` +
    ` (batch ${BATCH}, concurrency ${CONCURRENCY})${DRY_RUN ? ' [DRY RUN]' : ''}` +
    `${CATEGORY ? ` — category ${CATEGORY}` : ''}` +
    `${SOURCE ? ` — source ${SOURCE}` : ''}` +
    `${RE_AUDIT_DAYS !== null ? ` — re-auditing rows older than ${RE_AUDIT_DAYS} days` : ''}\n`);

  // Chunk into Grok batches.
  const chunks = [];
  for (let i = 0; i < rows.length; i += BATCH) chunks.push(rows.slice(i, i + BATCH));

  let totalCost = 0;
  const counts = { verified: 0, 'verified-soft': 0, flagged: 0, uncertain: 0 };
  let errors = 0;
  let updated = 0;
  const flagged = [];

  await runPool(chunks, CONCURRENCY, async (chunk, chunkIndex) => {
    let result;
    try {
      result = await callGrok(chunk.map((q, i) => describeQuestion(q, i)));
    } catch (e) {
      errors += chunk.length;
      console.warn(`  batch ${chunkIndex} failed: ${String(e.message).slice(0, 120)}`);
      return;
    }
    totalCost += result.costUsd;

    let parsed;
    try {
      parsed = JSON.parse(result.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
    } catch (e) {
      errors += chunk.length;
      console.warn(`  batch ${chunkIndex} parse fail: ${e.message}`);
      return;
    }

    const verdicts = Array.isArray(parsed?.verdicts) ? parsed.verdicts
      : Array.isArray(parsed) ? parsed : [];
    const byIndex = new Map();
    for (const v of verdicts) {
      if (Number.isInteger(v?.index)) byIndex.set(v.index, v);
    }

    for (let i = 0; i < chunk.length; i++) {
      const q = chunk[i];
      const v = byIndex.get(i);
      if (!v) {
        // A verdict the model failed to return must never be treated as a
        // silent pass or a silent demotion — it is an error, and the row keeps
        // last_audited_at NULL so the next run picks it up again.
        errors++;
        continue;
      }

      const verified = !!v.verified;
      const confidence = Math.max(0, Math.min(1, Number(v.confidence) || 0));
      const reasoning = String(v.reasoning || '').slice(0, 1000);
      const correctedAns = v.corrected_answer_text ? String(v.corrected_answer_text).slice(0, 200) : null;
      const { newQS, tier } = scoreVerdict(verified, confidence, q.quality_score);
      counts[tier]++;

      if (tier === 'flagged') {
        flagged.push({
          id: String(q.id).slice(0, 8),
          q: String(q.question).slice(0, 80),
          conf: Math.round(confidence * 100),
          reasoning: reasoning.slice(0, 150),
          corrected: correctedAns,
        });
      }

      const failureModes = Array.isArray(v.failure_modes)
        ? v.failure_modes.filter(f => typeof f === 'string').map(f => f.slice(0, 30))
        : [];

      if (!DRY_RUN) {
        try {
          const { error: auditError } = await supabase.from('trivia_quality_audits').insert({
            question_id: q.id,
            verifier_model: MODEL,
            verified,
            confidence,
            reasoning,
            failure_modes: failureModes,
            corrected_answer_text: correctedAns,
            previous_quality_score: q.quality_score,
            new_quality_score: newQS,
            cost_usd: result.costUsd / chunk.length,
          });
          if (auditError) throw auditError;
          const { error: questionError } = await supabase
            .from('trivia_questions')
            .update({
              quality_score: newQS,
              last_audited_at: new Date().toISOString(),
              audit_verified: verified,
              audit_confidence: confidence,
            })
            .eq('id', q.id);
          if (questionError) throw questionError;
          updated++;
        } catch (e) {
          errors++;
          console.warn(`  write failed for ${String(q.id).slice(0, 8)}: ${String(e.message).slice(0, 100)}`);
        }
      }
    }

    console.log(`  batch ${chunkIndex + 1}/${chunks.length} done | cost $${totalCost.toFixed(4)}`);
  });

  const stillPlayable = counts.verified + counts['verified-soft'];
  const demoted = counts.flagged + counts.uncertain;

  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`  audited:        ${rows.length}`);
  console.log(`  verified (9):   ${counts.verified}`);
  console.log(`  verified soft:  ${counts['verified-soft']}  (kept at >= ${VERIFIED_UNCERTAIN_SCORE}, still playable)`);
  console.log(`  flagged (2):    ${counts.flagged}  (below the gameplay floor of ${QUALITY_FLOOR})`);
  console.log(`  uncertain (5):  ${counts.uncertain}  (human review; below the floor)`);
  console.log(`  rows updated:   ${updated}`);
  console.log(`  errors:         ${errors}`);
  console.log(`  net playable:   ${stillPlayable} kept, ${demoted} removed from rotation`);
  console.log(`  total cost:     $${totalCost.toFixed(4)}`);
  console.log(`  elapsed:        ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (flagged.length > 0) {
    console.log('\n=== FLAGGED (sample) ===');
    for (const f of flagged.slice(0, 5)) {
      console.log(`  [${f.id}] conf ${f.conf}%`);
      console.log(`    Q: ${f.q}`);
      console.log(`    Why: ${f.reasoning}`);
      if (f.corrected) console.log(`    Correct? ${f.corrected}`);
    }
  }

  if (demoted > 0) {
    console.log(`\n  NOTE: ${demoted} questions left the playable pool. Re-check depth with`);
    console.log('        node scripts/trivia-pool-report.js');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
