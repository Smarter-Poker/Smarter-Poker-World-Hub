#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Claude-assisted fix for tsc / generic build failures.
//
// Mirrors scripts/sentry-autofix/run.mjs conventions but much thinner:
//   - Only parses TS file paths from the snippet (no multi-step stack
//     resolver needed — TSC gives file:line directly).
//   - Sends at most 2 files to Claude (target + tsconfig if relevant).
//   - maxTokens 3072, Haiku 4.5. Same budget circuit-breaker.
//
// Emits the same /tmp/vercel-autofix-commit-{title,body}.txt files the
// OOM strategy does, plus writes file mutations to disk.
// ═════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const STRATEGY = process.env.STRATEGY || 'generic';
const SNIPPET = process.env.SNIPPET || '';
const COMMIT_SHA = process.env.COMMIT_SHA;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const ATTEMPT_ID = process.env.ATTEMPT_ID;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const MAX_FILES = 2;
const MAX_FILE_BYTES = 200_000;

function log(o) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...o }));
}

function fail(reason, extra = {}) {
  log({ level: 'error', reason, ...extra });
  process.exit(2);
}

// --- Budget circuit-breaker -------------------------------------------------
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
try {
  const { data: exhausted, error } = await sb.rpc('autofix_budget_exhausted');
  if (!error && exhausted === true) {
    log({ level: 'warn', reason: 'daily_budget_cap_hit' });
    await sb
      .from('autofix_attempts')
      .update({ status: 'skipped_unfixable', error_message: 'daily_budget_cap_hit' })
      .eq('id', ATTEMPT_ID);
    process.exit(0);
  }
} catch (e) {
  log({ level: 'warn', msg: 'budget check threw — proceeding', err: String(e) });
}

// --- Extract file paths from the snippet ------------------------------------
function extractFilePaths(snippet) {
  const paths = new Set();
  const re = /(?:^|\s|['"`(])((?:pages|lib|components|src|services|data|app|scripts|hooks)\/[^\s'"`):]+\.(?:tsx?|jsx?|mjs|cjs))/g;
  for (const m of snippet.matchAll(re)) paths.add(m[1]);
  return Array.from(paths).slice(0, MAX_FILES);
}

const files = extractFilePaths(SNIPPET);
if (files.length === 0 && STRATEGY === 'tsc') {
  fail('no_file_paths_in_snippet', { snippetHead: SNIPPET.slice(0, 200) });
}

const readable = [];
for (const f of files) {
  try {
    const stat = fs.statSync(f);
    if (stat.size > MAX_FILE_BYTES) {
      log({ level: 'warn', msg: 'file too large — skipping', file: f, size: stat.size });
      continue;
    }
    readable.push({ path: f, content: fs.readFileSync(f, 'utf8') });
  } catch (e) {
    log({ level: 'warn', msg: 'file not readable', file: f, err: String(e) });
  }
}

// --- Build Claude prompt ----------------------------------------------------
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const systemPrompt = `You fix Vercel build failures. You receive:
- A build-log excerpt showing the failure.
- Up to ${MAX_FILES} source files.

Return ONLY a JSON object of the form:
{
  "explanation": "1-3 sentences",
  "patches": [{"path": "relative/path.ts", "new_content": "<full new file content>"}],
  "test_note": "human-readable note on manual verification or 'none-possible'"
}

Rules:
- Do NOT modify files outside the provided set.
- Prefer the smallest change that fixes the compile error.
- If the fix is unsafe or ambiguous, return {"patches": []} with an explanation.
- Do not output markdown fences around the JSON.`;

const userPrompt = [
  `Build strategy: ${STRATEGY}`,
  `Commit: ${COMMIT_SHA}`,
  `Deployment: ${DEPLOYMENT_ID}`,
  '',
  'Build log excerpt:',
  '```',
  SNIPPET.slice(0, 3000),
  '```',
  '',
  ...readable.map(
    (f) => `--- FILE: ${f.path} ---\n${f.content}\n--- END FILE ---`
  ),
].join('\n');

log({ level: 'info', msg: 'calling Claude', model: MODEL, files: readable.length });

let response;
try {
  response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3072,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
} catch (e) {
  fail('claude_call_failed', { err: String(e) });
}

// Log token usage back to Supabase for cost tracking
try {
  await sb
    .from('autofix_attempts')
    .update({
      claude_tokens_in: response.usage?.input_tokens ?? null,
      claude_tokens_out: response.usage?.output_tokens ?? null,
    })
    .eq('id', ATTEMPT_ID);
} catch {}

const body = response.content
  .filter((c) => c.type === 'text')
  .map((c) => c.text)
  .join('');

let parsed;
try {
  // Strip optional ```json fences just in case
  const clean = body.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
  parsed = JSON.parse(clean);
} catch (e) {
  fail('claude_response_not_json', { body: body.slice(0, 500) });
}

if (!Array.isArray(parsed.patches) || parsed.patches.length === 0) {
  log({ level: 'info', reason: 'claude_refused_or_empty', explanation: parsed.explanation });
  await sb
    .from('autofix_attempts')
    .update({ status: 'skipped_unfixable', error_message: parsed.explanation || 'claude returned empty patches' })
    .eq('id', ATTEMPT_ID);
  process.exit(0);
}

// Apply patches — only to files we read in (defense-in-depth against path traversal)
const allowedPaths = new Set(readable.map((f) => f.path));
for (const p of parsed.patches) {
  if (!allowedPaths.has(p.path)) {
    fail('patch_path_not_in_allowlist', { path: p.path });
  }
  const resolved = path.resolve(p.path);
  const cwd = path.resolve('.');
  if (!resolved.startsWith(cwd + path.sep)) fail('patch_path_escape', { path: p.path });
  fs.writeFileSync(p.path, p.new_content);
  log({ level: 'info', action: 'patched', path: p.path });
}

const title = `fix(build): autofix ${STRATEGY} build failure on ${COMMIT_SHA.slice(0, 7)}`;
const bodyOut = [
  `Vercel deployment \`${DEPLOYMENT_ID}\` failed with a \`${STRATEGY}\` error.`,
  '',
  '**Explanation:**',
  parsed.explanation || '(none)',
  '',
  '**Test note:**',
  parsed.test_note || 'none-possible',
  '',
  'Build-log excerpt:',
  '```',
  SNIPPET.slice(0, 1500),
  '```',
  '',
  '---',
  `Autofix attempt: \`${ATTEMPT_ID}\``,
  `Model: \`${MODEL}\``,
].join('\n');

fs.writeFileSync('/tmp/vercel-autofix-commit-title.txt', title);
fs.writeFileSync('/tmp/vercel-autofix-commit-body.txt', bodyOut);
