#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// autofix-cli — operator-facing control plane for the Vercel + Sentry
// autofix pipelines. Talks to the shared Supabase tables / RPCs:
//
//   autofix_config      kill-switch (paused / reason / since)
//   autofix_attempts    historical record, one row per attempt
//   autofix_budget      per-loop daily caps + today's spend
//
// Auth: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
// (SB_URL / SB_KEY also accepted so ops can set a scoped shell var.)
//
// Subcommands:
//   status              Print pause state + today's spend across buckets
//   pause "<reason>"    Flip kill-switch on with reason + ISO timestamp
//   unpause             Clear kill-switch
//   last [N]            Last N attempts (default 25), most recent first
//   attempts <status>   Filter last 50 attempts by status (errored, pr_opened, …)
//   budget              Per-loop spend snapshot for today
//
// Exit codes:
//   0 success / query ran
//   2 missing env / bad argv
//   3 Supabase error (non-2xx)
// ═════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SB_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SB_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

if (!SB_URL || !SB_KEY) {
  die(2, 'autofix-cli: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SB_URL/SB_KEY) in env');
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtTs(x) {
  if (!x) return '—';
  try { return new Date(x).toISOString().replace('T', ' ').slice(0, 19) + 'Z'; }
  catch { return String(x); }
}
function trunc(s, n) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function padEnd(s, n) { s = String(s ?? ''); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

async function okOrDie(res, context) {
  if (res.error) die(3, `autofix-cli: ${context}: ${res.error.message}`);
  return res;
}

// ── Commands ──────────────────────────────────────────────────────────────
async function cmdStatus() {
  // Kill-switch
  const cfg = (await okOrDie(
    await sb.from('autofix_config').select('paused,paused_reason,paused_at,paused_by').eq('id', 1).maybeSingle(),
    'config read'
  )).data || {};
  const paused = !!cfg.paused;
  console.log('── kill-switch ─────────────────');
  console.log(`  state : ${paused ? 'PAUSED' : 'running'}`);
  if (paused) {
    console.log(`  since : ${fmtTs(cfg.paused_at)}`);
    console.log(`  by    : ${cfg.paused_by || '—'}`);
    console.log(`  reason: ${cfg.paused_reason || '—'}`);
  }

  // Budgets
  console.log('\n── budgets (today) ──────────────');
  await cmdBudget({ quiet: true });
}

async function cmdPause(reason) {
  if (!reason) die(2, 'usage: pause "<reason>"');
  const who = process.env.USER || process.env.LOGNAME || 'cli';
  const row = {
    id: 1,
    paused: true,
    paused_reason: String(reason).slice(0, 500),
    paused_at: new Date().toISOString(),
    paused_by: String(who).slice(0, 64),
  };
  await okOrDie(await sb.from('autofix_config').upsert(row), 'pause upsert');
  console.log(`Paused. reason="${row.paused_reason}" by=${row.paused_by}`);
}

async function cmdUnpause() {
  await okOrDie(
    await sb.from('autofix_config').update({
      paused: false,
      paused_reason: null,
      paused_at: null,
      paused_by: null,
    }).eq('id', 1),
    'unpause'
  );
  console.log('Unpaused.');
}

async function cmdLast(n) {
  const limit = Math.min(Math.max(1, parseInt(n || '25', 10) || 25), 200);
  const { data } = await okOrDie(
    await sb.from('autofix_attempts')
      .select('id,source,status,created_at,repo,commit_sha,pr_url,pr_number,error_message')
      .order('created_at', { ascending: false })
      .limit(limit),
    'attempts list'
  );
  printAttempts(data || []);
}

async function cmdAttempts(status, n) {
  if (!status) die(2, 'usage: attempts <status> [N]');
  const limit = Math.min(Math.max(1, parseInt(n || '50', 10) || 50), 200);
  const { data } = await okOrDie(
    await sb.from('autofix_attempts')
      .select('id,source,status,created_at,repo,commit_sha,pr_url,pr_number,error_message')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit),
    'attempts by status'
  );
  printAttempts(data || []);
}

async function cmdBudget({ quiet = false } = {}) {
  // autofix_budget stores caps only; spend is computed from autofix_attempts.
  // Mirror the logic in the Postgres RPC: Haiku 4.5 pricing $1/MTok in,
  // $5/MTok out, summed across today's rows, grouped by source.
  const PRICE_IN = 1.00;   // $/MTok
  const PRICE_OUT = 5.00;
  const caps = (await okOrDie(
    await sb.from('autofix_budget').select('source,daily_cap_usd,notes'),
    'budget caps'
  )).data || [];

  // UTC day start — matches date_trunc('day', now() at time zone 'utc')
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const attempts = (await okOrDie(
    await sb.from('autofix_attempts')
      .select('source,claude_tokens_in,claude_tokens_out')
      .gte('created_at', dayStart.toISOString()),
    'budget attempts'
  )).data || [];

  const spendBySource = new Map();
  let globalSpend = 0;
  for (const a of attempts) {
    const tin = Number(a.claude_tokens_in || 0);
    const tout = Number(a.claude_tokens_out || 0);
    const d = (tin / 1e6) * PRICE_IN + (tout / 1e6) * PRICE_OUT;
    globalSpend += d;
    const src = a.source || 'unknown';
    spendBySource.set(src, (spendBySource.get(src) || 0) + d);
  }
  spendBySource.set('_global', globalSpend);

  const rows = caps.slice().sort((a, b) => a.source.localeCompare(b.source));
  if (!quiet) console.log('── budgets (today, UTC) ─────────');
  console.log(`  ${padEnd('source', 10)} ${padEnd('cap$', 7)} ${padEnd('spent$', 9)} ${padEnd('pct', 6)} notes`);
  for (const r of rows) {
    const cap = Number(r.daily_cap_usd ?? 0);
    const spent = Number(spendBySource.get(r.source) ?? 0);
    const pct = cap > 0 ? Math.min(999, Math.round((spent / cap) * 100)) : 0;
    const flag = cap > 0 && spent >= cap ? ' ⛔' : '';
    console.log(`  ${padEnd(r.source, 10)} ${padEnd(cap.toFixed(2), 7)} ${padEnd(spent.toFixed(4), 9)} ${padEnd(pct + '%', 6)} ${trunc(r.notes || '', 40)}${flag}`);
  }
}

function printAttempts(rows) {
  if (rows.length === 0) { console.log('(no rows)'); return; }
  console.log(`  ${padEnd('when', 20)} ${padEnd('src', 7)} ${padEnd('status', 18)} ${padEnd('repo', 32)} sha      pr`);
  for (const r of rows) {
    const pr = r.pr_number ? `#${r.pr_number}` : (r.pr_url ? '(link)' : '');
    const sha = r.commit_sha ? r.commit_sha.slice(0, 7) : '—';
    console.log(`  ${padEnd(fmtTs(r.created_at), 20)} ${padEnd(r.source || '—', 7)} ${padEnd(r.status || '—', 18)} ${padEnd(trunc(r.repo, 30), 32)} ${padEnd(sha, 8)} ${pr}`);
    if (r.error_message) console.log(`      ↳ ${trunc(r.error_message, 140)}`);
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const handlers = {
  status: () => cmdStatus(),
  pause: () => cmdPause(rest.join(' ').trim()),
  unpause: () => cmdUnpause(),
  last: () => cmdLast(rest[0]),
  attempts: () => cmdAttempts(rest[0], rest[1]),
  budget: () => cmdBudget({}),
};

if (!cmd || !handlers[cmd]) {
  console.error('autofix-cli — operator control plane');
  console.error('');
  console.error('Usage:');
  console.error('  autofix-cli status');
  console.error('  autofix-cli pause "<reason>"');
  console.error('  autofix-cli unpause');
  console.error('  autofix-cli last [N]              (default 25)');
  console.error('  autofix-cli attempts <status> [N] (default 50)');
  console.error('  autofix-cli budget');
  process.exit(cmd ? 2 : 0);
}

handlers[cmd]().catch((e) => die(3, `autofix-cli: ${e.stack || e.message || e}`));
