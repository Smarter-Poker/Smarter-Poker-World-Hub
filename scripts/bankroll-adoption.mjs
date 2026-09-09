#!/usr/bin/env node
/**
 * WHO ACTUALLY USES THE BANKROLL MANAGER
 *
 * Counted on 2026-09-08: 1,029 accounts carry `is_vip` and exactly ONE has
 * ever written a bankroll entry, the test account, last written in February.
 * Zero W-2G forms, zero dealer documents, zero receipts, two player notes.
 *
 * That number is why several defects survived for months: six premium routes
 * answered 403 to every user, every scanned buy-in failed to save with 23514,
 * and both vault uploads were refused by a bucket policy. Nobody was there to
 * report it. Every one of those is fixed as of that day.
 *
 * So the question is whether fixing them changes anything, and nothing was
 * measuring. PostHog would, and `capture()` no-ops silently while
 * NEXT_PUBLIC_POSTHOG_KEY is unset - which it is, in the browser bundle
 * production serves today, so the signup and first_login events already in
 * the code have been firing into nothing. Setting that variable is Dan's
 * (CLAUDE.md 10.85: an agent may say which variable and where it lives,
 * never write one).
 *
 * This script needs no such key. It asks the database, which knows.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/bankroll-adoption.mjs [--json]
 *
 * Run it before and after a change that is meant to matter. A number that
 * does not move is an answer too.
 */
import { readFileSync, existsSync } from 'node:fs';

function envFromFile() {
    if (!existsSync('.env.local')) return {};
    return Object.fromEntries(
        readFileSync('.env.local', 'utf8')
            .split('\n')
            .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
            .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
    );
}

const fileEnv = envFromFile();
const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
    console.error('[bankroll-adoption] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(2);
}

/** Count rows without fetching them: PostgREST returns the total in a header. */
async function count(table, query = '') {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=id${query}`, {
        method: 'HEAD',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' },
    });
    if (!res.ok && res.status !== 206) throw new Error(`${table} answered ${res.status}`);
    const range = res.headers.get('content-range') || '';
    const total = Number(range.split('/')[1]);
    return Number.isFinite(total) ? total : 0;
}

/** Distinct user_ids in a table, which PostgREST cannot count for us. */
async function distinctUsers(table) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=user_id&limit=10000`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) throw new Error(`${table} answered ${res.status}`);
    const rows = await res.json();
    return new Set(rows.map((r) => r.user_id)).size;
}

const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const report = {
    measured_at: new Date().toISOString(),
    vip_accounts: await count('profiles', '&is_vip=eq.true'),
    total_accounts: await count('profiles'),
    ledger_entries: await count('bankroll_ledger'),
    ledger_users: await distinctUsers('bankroll_ledger'),
    entries_last_30_days: await count('bankroll_ledger', `&entry_date=gte.${since}`),
    trips: await count('bankroll_trips'),
    receipts_scanned: await count('bankroll_receipts'),
    receipts_waiting: await count('bankroll_receipts', '&status=eq.unassigned'),
    receipts_filed: await count('bankroll_receipts', '&status=eq.assigned'),
    // WHAT THE ON-DEVICE READER ACTUALLY DID.
    //
    // PostHog is dark in production, so this table is the only channel that
    // answers it. `read_engine_failed` above zero means the DEPLOY is broken
    // and nobody has noticed, which is exactly how the reader shipped on
    // 2026-09-09 with every asset 404ing. `read_no_text` above a trickle
    // points at the photograph or its preprocessing instead.
    read_ok: await count('bankroll_receipts', '&read_outcome=eq.read'),
    read_no_text: await count('bankroll_receipts', '&read_outcome=eq.no_text'),
    read_engine_failed: await count('bankroll_receipts', '&read_outcome=eq.engine_failed'),
    read_route_refused: await count('bankroll_receipts', '&read_outcome=eq.route_refused'),
    read_not_recorded: await count('bankroll_receipts', '&read_outcome=is.null'),
    w2g_forms: await count('w2g_forms'),
    dealer_documents: await count('dealer_documents'),
    player_notes: await count('player_notes'),
};
report.vip_reach_percent = report.vip_accounts
    ? Math.round((report.ledger_users / report.vip_accounts) * 1000) / 10
    : 0;

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
} else {
    const row = (label, value) => console.log(`  ${String(label).padEnd(26)} ${value}`);
    console.log('\n  BANKROLL MANAGER ADOPTION');
    console.log(`  ${report.measured_at}\n`);
    row('accounts', report.total_accounts);
    row('with is_vip', report.vip_accounts);
    row('who have logged anything', `${report.ledger_users}  (${report.vip_reach_percent}% of VIPs)`);
    console.log('');
    row('ledger entries', report.ledger_entries);
    row('entries in 30 days', report.entries_last_30_days);
    row('trips', report.trips);
    console.log('');
    row('receipts scanned', report.receipts_scanned);
    row('waiting to be filed', report.receipts_waiting);
    row('filed', report.receipts_filed);
    console.log('');
    console.log('  WHAT THE ON-DEVICE READER DID');
    row('read', report.read_ok);
    row('no legible text', report.read_no_text);
    row('ENGINE FAILED', report.read_engine_failed);
    row('server refused', report.read_route_refused);
    row('scanned before this', report.read_not_recorded);
    if (report.read_engine_failed > 0) {
        console.log('');
        console.log('  The engine failed to start for a real person. That is a broken');
        console.log('  deploy, not a bad photograph. Check that public/tesseract is');
        console.log('  served: curl -sI https://smarter.poker/tesseract/worker.min.js');
    }
    row('W-2G forms', report.w2g_forms);
    row('dealer documents', report.dealer_documents);
    row('player notes', report.player_notes);
    console.log('');
}
