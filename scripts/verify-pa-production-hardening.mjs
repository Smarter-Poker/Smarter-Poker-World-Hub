#!/usr/bin/env node

/**
 * Read-only production hardening probe for the Personal Assistant.
 *
 * The probe never starts an audit, records a drill answer, or writes account
 * data. It exercises public availability, bounded concurrent page load,
 * authenticated API reads, and direct PostgREST owner-isolation boundaries.
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Keep the post-deployment watchdog dependency-free. Local verification still
// loads the untracked environment file without ever printing its contents.
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const baseUrl = String(process.env.PA_VERIFY_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const email = process.env.TEST_USER_EMAIL; // 2026-09-04: no personal-account default; unset = no session
const password = process.env.TEST_USER_PASSWORD || '';
const requireAuth = process.argv.includes('--require-auth');
const configuredConcurrency = Number(process.env.PA_PROBE_CONCURRENCY || 4);
const configuredRequests = Number(process.env.PA_PROBE_REQUESTS || 16);
const concurrency = Math.min(8, Math.max(1, Number.isFinite(configuredConcurrency) ? configuredConcurrency : 4));
const requestCount = Math.min(40, Math.max(4, Number.isFinite(configuredRequests) ? configuredRequests : 16));
const timeoutMs = 15_000;

// Every authenticated, read-only API used by the Personal Assistant and its
// connected Sandbox surfaces belongs in the post-deployment watchdog. Keeping
// this list broad makes a shared-auth regression visible immediately without
// mutating the protected account.
export const protectedReadRoutes = [
  '/api/assistant/stats',
  '/api/assistant/leaks',
  '/api/assistant/leaks/audit-jobs',
  '/api/assistant/sandbox/sandbox-quiz',
  '/api/sandbox/coach-accuracy',
  '/api/sandbox/create-share',
  '/api/sandbox/leaderboard',
  '/api/sandbox/macro-analysis',
  '/api/sandbox/quiz-leaderboard?limit=5',
  '/api/sandbox/saved-hands',
  '/api/sandbox/session-stats',
  '/api/sandbox/sessions',
];

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

export async function boundedMap(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  let active = 0;
  let peak = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      active += 1;
      peak = Math.max(peak, active);
      try { output[index] = await worker(items[index], index); }
      finally { active -= 1; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return { output, peak };
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    return { status: response.status, ok: response.ok, durationMs: Math.round(performance.now() - started), body };
  } finally {
    clearTimeout(timer);
  }
}

async function signIn() {
  if (!supabaseUrl || !anonKey || !password || !email) return null;
  const result = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!result.ok || !result.body?.access_token || !result.body?.user?.id) {
    throw new Error(`Protected verifier authentication failed (${result.status}).`);
  }
  return { token: result.body.access_token, userId: result.body.user.id };
}

async function probeRls(table, token, userId) {
  const query = `select=user_id&user_id=neq.${encodeURIComponent(userId)}&limit=1`;
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const authenticated = await request(`${supabaseUrl}/rest/v1/${table}?${query}`, { headers });
  const anonymous = await request(`${supabaseUrl}/rest/v1/${table}?select=user_id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: 'application/json' },
  });
  const authenticatedSafe = [401, 403, 404].includes(authenticated.status)
    || (authenticated.status === 200 && Array.isArray(authenticated.body) && authenticated.body.length === 0);
  const anonymousSafe = [401, 403, 404].includes(anonymous.status)
    || (anonymous.status === 200 && Array.isArray(anonymous.body) && anonymous.body.length === 0);
  if (!authenticatedSafe || !anonymousSafe) throw new Error(`${table} exposed another user's row.`);
  return { table, authenticatedStatus: authenticated.status, anonymousStatus: anonymous.status };
}

export async function runProductionHardeningProbe() {
  const publicRoutes = [
    '/hub/personal-assistant',
    '/hub/personal-assistant/sandbox',
    '/hub/personal-assistant/leaks',
    '/sandbox/phase-six-watchdog',
  ];
  const publicChecks = [];
  for (const route of publicRoutes) {
    const result = await request(`${baseUrl}${route}`);
    if (!result.ok) throw new Error(`${route} returned ${result.status}.`);
    publicChecks.push({ route, status: result.status, durationMs: result.durationMs });
  }

  const loadTargets = Array.from({ length: requestCount }, (_, index) => publicRoutes[index % publicRoutes.length]);
  const load = await boundedMap(loadTargets, concurrency, route => request(`${baseUrl}${route}`));
  if (load.output.some(result => !result.ok)) throw new Error('Bounded page load produced a non-success response.');
  const durations = load.output.map(result => result.durationMs);
  const p95Ms = percentile(durations, 0.95);
  if (p95Ms > 8_000) throw new Error(`Bounded page-load p95 exceeded 8000ms (${p95Ms}ms).`);

  const session = await signIn();
  if (requireAuth && !session) throw new Error('Protected verification credentials are required.');
  let protectedChecks = [];
  let rlsChecks = [];
  if (session) {
    const authHeaders = { Authorization: `Bearer ${session.token}`, Accept: 'application/json' };
    for (const route of protectedReadRoutes) {
      const result = await request(`${baseUrl}${route}`, { headers: authHeaders });
      if (!result.ok) throw new Error(`${route} returned ${result.status} for the protected account.`);
      protectedChecks.push({ route, status: result.status, durationMs: result.durationMs });
    }
    rlsChecks = await Promise.all([
      'pa_leak_audit_jobs',
      'hand_audit_decisions',
      'leak_review_state',
      'user_leaks',
    ].map(table => probeRls(table, session.token, session.userId)));
  }

  return {
    success: true,
    baseUrl,
    publicChecks,
    load: { requests: requestCount, concurrency, observedPeak: load.peak, p95Ms, maxMs: Math.max(...durations) },
    authenticated: Boolean(session),
    protectedChecks,
    rlsChecks,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runProductionHardeningProbe()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ success: false, error: error?.message || 'Production hardening probe failed.' }));
      process.exitCode = 1;
    });
}
