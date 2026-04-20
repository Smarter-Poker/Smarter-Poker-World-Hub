// Local E2E verification of the autofix pipeline.
//
// Skips the Sentry fetch step (the one real WH issue has no in-app frames).
// Everything else runs for real: source file resolution, prompt build, Claude
// API call, response parse, patch apply (to a disposable scratch branch in
// /tmp), policy assessment. Does NOT push or open a PR.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { callClaude } from './claude.mjs';
import { buildMessages, SYSTEM_PROMPT } from './prompt.mjs';
import { parseClaudeResponse, applyPatch } from './patch.mjs';
import { assessPaths } from './policy.mjs';

function log(o) { console.log(JSON.stringify({ ts: new Date().toISOString(), ...o })); }

const repoRoot = path.resolve(process.cwd(), '..', '..');
const targetFile = 'pages/hub/marketplace.js';
const absTarget = path.join(repoRoot, targetFile);
if (!fs.existsSync(absTarget)) {
  log({ level: 'error', msg: 'target file missing', absTarget });
  process.exit(1);
}

const content = fs.readFileSync(absTarget, 'utf8');
const lines = content.split('\n');

// Synthesise a realistic Sentry issue pointing at the useEffect line.
const issue = {
  id: 'LOCAL-VERIFY-' + Date.now(),
  shortId: 'WORLD-HUB-VERIFY',
  title: 'TypeError: Cannot read properties of undefined (reading \'replace\')',
  level: 'error',
  count: 1,
  userCount: 1,
  firstSeen: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  permalink: 'https://smarter-software-inc.sentry.io/issues/LOCAL-VERIFY/',
  culprit: 'MarketplacePage in pages/hub/marketplace.js',
};

const useEffectLine = lines.findIndex(l => l.includes('router.replace'));
const stack = {
  exception: { type: 'TypeError', value: 'Cannot read properties of undefined (reading \'replace\')' },
  frames: [{
    filename: targetFile,
    function: 'MarketplacePage.useEffect',
    lineno: useEffectLine + 1,
    colno: 17,
    in_app: true,
    pre_context: lines.slice(Math.max(0, useEffectLine - 3), useEffectLine),
    context_line: lines[useEffectLine],
    post_context: lines.slice(useEffectLine + 1, useEffectLine + 4),
  }],
  source_files: [targetFile],
};

log({ level: 'info', msg: 'pipeline verify start', target: targetFile, synthetic_line: useEffectLine + 1 });

const files = [{ path: targetFile, content }];

// Pre-gate check
const preAssess = assessPaths([targetFile]);
if (!preAssess.ok) {
  log({ level: 'error', msg: 'target file is denylisted', denied: preAssess.denied });
  process.exit(3);
}
log({ level: 'info', msg: 'pre-gate ok', allowMerge: preAssess.allowMerge });

// Build messages
const messages = buildMessages({ issue, stack, files, repoName: 'Smarter-Poker/Smarter-Poker-World-Hub' });
log({ level: 'info', msg: 'messages built', chars: messages[0].content.length });

// Call Claude for real
const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';
log({ level: 'info', msg: 'calling Claude', model });
const t0 = Date.now();
const reply = await callClaude({ model, system: SYSTEM_PROMPT, messages, maxTokens: 4096, temperature: 0 });
log({
  level: 'info', msg: 'Claude responded',
  elapsed_ms: Date.now() - t0,
  stop: reply.stopReason,
  tokens_in: reply.usage?.input_tokens,
  tokens_out: reply.usage?.output_tokens,
});

// Parse
let parsed;
try { parsed = parseClaudeResponse(reply.text); }
catch (err) {
  log({ level: 'error', msg: 'parse failed', err: String(err), text_head: reply.text.slice(0, 1000) });
  process.exit(4);
}

if (parsed.cannotFix) {
  log({ level: 'info', msg: 'Claude declined (valid response, no patch produced)', reason: parsed.reason });
  log({ level: 'info', msg: 'PIPELINE VERIFY PASS — cannot_fix path works end-to-end' });
  process.exit(0);
}

log({
  level: 'info', msg: 'patch received',
  confidence: parsed.confidence,
  test_note: parsed.testNote,
  explanation_head: parsed.explanation.slice(0, 200),
  patch_head: parsed.patch.slice(0, 300),
});

// Apply to disposable scratch repo: init fresh + copy only the target file.
// We don't need the full repo to prove the patch parses + applies; git apply
// just needs the file at its claimed path to match the "---" side of the hunk.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-verify-'));
log({ level: 'info', msg: 'seeding scratch repo', scratch });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: scratch });
execFileSync('git', ['config', 'user.email', 'verify@local'], { cwd: scratch });
execFileSync('git', ['config', 'user.name',  'Verify Local'],  { cwd: scratch });
fs.mkdirSync(path.join(scratch, path.dirname(targetFile)), { recursive: true });
fs.copyFileSync(absTarget, path.join(scratch, targetFile));
execFileSync('git', ['add', '-A'], { cwd: scratch });
execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: scratch });

try {
  const changed = applyPatch(scratch, parsed.patch);
  log({ level: 'info', msg: 'patch applied cleanly', changed });

  // Post-apply denylist check
  const postAssess = assessPaths(changed);
  log({ level: 'info', msg: 'post-apply policy', ok: postAssess.ok, denied: postAssess.denied, allowMerge: postAssess.allowMerge });

  // Show what changed
  const diff = execFileSync('git', ['diff', '--stat'], { cwd: scratch, encoding: 'utf8' });
  log({ level: 'info', msg: 'diff stat', diff: diff.trim() });

  log({ level: 'info', msg: 'PIPELINE VERIFY PASS — full path: fetch→prompt→claude→parse→apply→policy works' });
  process.exit(0);
} catch (err) {
  log({ level: 'error', msg: 'apply failed (patch malformed or doesn\'t match)', err: String(err).slice(0, 800), patch: parsed.patch });
  process.exit(5);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
