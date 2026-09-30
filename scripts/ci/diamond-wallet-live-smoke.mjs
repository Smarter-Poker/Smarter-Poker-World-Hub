#!/usr/bin/env node
/**
 * diamond-wallet-live-smoke.mjs - phase 8 of 8, 2026-09-29
 * =========================================================================
 * IS THE DIAMOND WALLET ACTUALLY SERVING? A read-only answer, on demand.
 *
 *   node scripts/ci/diamond-wallet-live-smoke.mjs [--json]
 *
 * WHAT IT ASKS
 *   1. ca-static.smarter.poker/build-info.json and
 *      smarter.poker/hub/club-arena/build-info.json agree on `ca_sha` -
 *      the rewrite is serving the bundle the origin published, not a stale
 *      edge copy of an older one.
 *   2. smarter.poker/api/health says ok.
 *   3. Every Postgres object the wallet depends on exists and answers a
 *      well-formed shape for a real player, matched field by field against
 *      scripts/ci/lib/diamond-wallet-contract.mjs - the SAME snapshot
 *      __tests__/the-route-and-the-client-agree.test.mjs pins the code
 *      against. Offline the code matches the snapshot; here the snapshot
 *      matches the database. A drift on either side has a reader.
 *
 * THREE OUTCOMES, NEVER TWO (10.86)
 *   exit 0  PASS     every question was asked and answered correctly
 *   exit 1  FAIL     a question was asked and the answer was wrong
 *   exit 3  UNKNOWN  a question could not be asked, or its answer could not
 *                    be read. This is NOT a pass and NOT a failure, and it
 *                    has its own code so a caller cannot fold it into
 *                    either. `res.ok` is checked before any body is read;
 *                    an unreadable answer is never coerced to an empty one.
 *
 * WHY IT DOES NOT USE scripts/ci/lib/resilient-fetch.mjs, which every other
 * gate here does: that helper calls process.exit(1) when the network is
 * down. For a required CI gate that is correct. For this one it would turn
 * "I could not reach the site" into FAIL, which is precisely the collapse
 * 10.86 rule 1 forbids - and fixing the check while leaving the trap one
 * level up is rule 4. So the transport below is local, small, and reports
 * unreachable as UNKNOWN.
 *
 * THE DATABASE SECTION NEEDS A KEY, AND SAYS SO WHEN IT HAS NONE.
 * fn_diamond_wallet_summary and fn_diamond_flow_by_kind refuse any caller
 * that is neither the subject nor service_role (`..._is_own_only`, 42501),
 * so section 3 reads SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) from the
 * ENVIRONMENT. It never reads a .env file, never prints a key, and never
 * guesses an identity. With no key in the environment, section 3 is
 * UNKNOWN with that as its stated reason - not skipped, not green.
 *
 * WHAT IT IS NOT
 *   - NOT SCHEDULED, and must never become scheduled. World Hub CLAUDE.md
 *     10.9 and Club Arena 10.85 forbid an agent creating a Claude scheduled
 *     task; section 11.3 forbids a new vercel.json cron, a new
 *     pages/api/cron/ handler and a new GitHub `schedule:` trigger, and
 *     CHECK 6 fails the build on the net-new counts. This is a command a
 *     person runs.
 *   - NOT A REPAIR (10.11, 10.12). It writes nothing, retries nothing,
 *     reconciles nothing and fixes nothing. Every request below is a GET,
 *     or a POST to a read-only PostgREST rpc. If it reports FAIL, the fix
 *     is a change at the root of whatever it found, not a job that patches
 *     the symptom afterwards.
 */
import {
  SNAPSHOT_TAKEN,
  WALLET_SUMMARY_KEYS,
  WALLET_SUMMARY_ARENA_KEYS,
  LIFETIME_TOTALS_KEYS,
  FLOW_KEYS,
  FLOW_LINE_KEYS,
  BUCKET_KEYS,
  REQUIRED_FUNCTIONS,
} from './lib/diamond-wallet-contract.mjs';

const PASS = 'PASS';
const FAIL = 'FAIL';
const UNKNOWN = 'UNKNOWN';
const EXIT = { [PASS]: 0, [FAIL]: 1, [UNKNOWN]: 3 };

const ORIGIN = 'https://ca-static.smarter.poker';
const SITE = 'https://smarter.poker';
const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://kuklfnapbkmacvwxktbh.supabase.co'
).replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

const results = [];
const record = (name, verdict, detail) => {
  results.push({ name, verdict, detail });
  return verdict;
};

/**
 * One request, three outcomes.
 *
 * `{ ok: true, status, body }`  the server answered and the body parsed
 * `{ ok: false, unknown: true, why }` could not tell: transport died, the
 *      request timed out, the status was not ok, or the body would not
 *      parse. NEVER an empty body standing in for a real one.
 */
async function ask(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, unknown: true, why: `unreachable: ${err?.message || err}` };
  }
  // res.ok FIRST, every time. `(await res.json()).x` on a 403 body is
  // undefined, and `undefined || []` reads as good news (10.86 rule 2).
  if (!res.ok) {
    let peek = '';
    try {
      peek = (await res.text()).slice(0, 200);
    } catch {
      peek = '<body unreadable>';
    }
    return { ok: false, unknown: true, status: res.status, why: `HTTP ${res.status} ${peek}` };
  }
  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { ok: false, unknown: true, status: res.status, why: `body is not json: ${err?.message}` };
  }
  return { ok: true, status: res.status, body };
}

/** A PostgREST call that may legitimately answer 4xx, so the caller can read it. */
async function askPostgrest(pathAndQuery, init = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1${pathAndQuery}`, {
      ...init,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, unknown: true, why: `unreachable: ${err?.message || err}` };
  }
  let body = null;
  let raw = '';
  try {
    raw = await res.text();
    body = raw ? JSON.parse(raw) : null;
  } catch {
    if (!res.ok) return { ok: false, unknown: true, status: res.status, why: `HTTP ${res.status} ${raw.slice(0, 200)}` };
    return { ok: false, unknown: true, status: res.status, why: 'body is not json' };
  }
  if (!res.ok) return { ok: false, status: res.status, body, why: `HTTP ${res.status} ${raw.slice(0, 200)}` };
  return { ok: true, status: res.status, body };
}

const missing = (have, want) => want.filter((k) => !have.includes(k));
const extra = (have, want) => have.filter((k) => !want.includes(k));

// ─────────────────────────────────────────────────────────────────────────
// 1. The two build-info documents agree on ca_sha
// ─────────────────────────────────────────────────────────────────────────
async function checkBundleAgreement() {
  const a = await ask(`${ORIGIN}/build-info.json`);
  const b = await ask(`${SITE}/hub/club-arena/build-info.json`);
  if (!a.ok) return record('club arena bundle: origin and rewrite agree', UNKNOWN, `origin ${a.why}`);
  if (!b.ok) return record('club arena bundle: origin and rewrite agree', UNKNOWN, `rewrite ${b.why}`);

  const originSha = a.body?.ca_sha;
  const rewriteSha = b.body?.ca_sha;
  if (typeof originSha !== 'string' || typeof rewriteSha !== 'string') {
    return record(
      'club arena bundle: origin and rewrite agree',
      UNKNOWN,
      `one document has no ca_sha string (origin=${typeof originSha}, rewrite=${typeof rewriteSha})`
    );
  }
  if (originSha !== rewriteSha) {
    return record(
      'club arena bundle: origin and rewrite agree',
      FAIL,
      `origin ca_sha ${originSha} but smarter.poker serves ${rewriteSha}: the rewrite ` +
        'is handing players a different bundle from the one the origin published'
    );
  }
  return record('club arena bundle: origin and rewrite agree', PASS, `ca_sha ${originSha}`);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. The World Hub is healthy
// ─────────────────────────────────────────────────────────────────────────
async function checkSiteHealth() {
  const r = await ask(`${SITE}/api/health`);
  if (!r.ok) return record('world hub /api/health', UNKNOWN, r.why);
  const status = r.body?.status ?? r.body?.ok;
  const healthy = status === 'ok' || status === true || status === 'healthy';
  if (!healthy) {
    return record('world hub /api/health', FAIL, `status is ${JSON.stringify(status)}`);
  }
  const sha = r.body?.commitSha || r.body?.sha || 'unreported';
  return record('world hub /api/health', PASS, `ok, commitSha ${sha}`);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Every diamond object exists and answers the shape the wallet reads
// ─────────────────────────────────────────────────────────────────────────
async function checkDiamondObjects() {
  if (!SUPABASE_KEY) {
    return record(
      'diamond rpcs answer the shape the wallet reads',
      UNKNOWN,
      'no SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in the environment. ' +
        'fn_diamond_wallet_summary and fn_diamond_flow_by_kind refuse a caller that ' +
        'is neither the subject nor service_role, so this section could not be asked. ' +
        'This is not a pass.'
    );
  }

  // A real player, discovered rather than assumed. Never printed: the id
  // identifies a person and nothing here needs to show it.
  const who = await askPostgrest(
    '/diamond_transactions?select=user_id&order=created_at.desc&limit=1'
  );
  if (!who.ok || !Array.isArray(who.body) || !who.body[0]?.user_id) {
    return record(
      'diamond rpcs answer the shape the wallet reads',
      UNKNOWN,
      `could not read a real player to ask about: ${who.why || 'no rows'}`
    );
  }
  const userId = process.env.SMOKE_USER_ID || who.body[0].user_id;

  const problems = [];
  const unknowns = [];

  // player_line: a COMPUTED column. Absent from `*`, absent from
  // information_schema, and the one thing a stored-column check cannot see.
  const line = await askPostgrest('/diamond_transactions?select=id,player_line&limit=1');
  if (!line.ok) {
    (line.unknown ? unknowns : problems).push(`player_line: ${line.why}`);
  } else if (!Array.isArray(line.body) || line.body.length === 0) {
    unknowns.push('player_line: the ledger returned no row to read it from');
  } else if (!('player_line' in line.body[0])) {
    problems.push('player_line: PostgREST did not return the computed column');
  }

  // fn_diamond_lifetime_totals - RETURNS TABLE, so PostgREST answers an array.
  const totals = await askPostgrest('/rpc/fn_diamond_lifetime_totals', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!totals.ok) {
    (totals.body?.code === 'PGRST202' ? problems : totals.unknown ? unknowns : problems).push(
      `fn_diamond_lifetime_totals: ${totals.why}`
    );
  } else {
    const row = Array.isArray(totals.body) ? totals.body[0] : totals.body;
    if (!row || typeof row !== 'object') {
      problems.push('fn_diamond_lifetime_totals: returned nothing to read');
    } else {
      const gone = missing(Object.keys(row), LIFETIME_TOTALS_KEYS);
      if (gone.length) problems.push(`fn_diamond_lifetime_totals is missing ${gone.join(', ')}`);
      for (const k of ['lifetime_earned', 'lifetime_spent']) {
        if (row[k] !== undefined && !Number.isFinite(Number(row[k]))) {
          problems.push(`fn_diamond_lifetime_totals.${k} is not a number`);
        }
      }
    }
  }

  // fn_diamond_wallet_summary - RETURNS jsonb.
  const summary = await askPostgrest('/rpc/fn_diamond_wallet_summary', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!summary.ok) {
    (summary.unknown ? unknowns : problems).push(`fn_diamond_wallet_summary: ${summary.why}`);
  } else if (!summary.body || typeof summary.body !== 'object') {
    problems.push('fn_diamond_wallet_summary: returned no object');
  } else {
    const keys = Object.keys(summary.body);
    const gone = missing(keys, WALLET_SUMMARY_KEYS);
    const news = extra(keys, WALLET_SUMMARY_KEYS);
    if (gone.length) problems.push(`fn_diamond_wallet_summary is missing ${gone.join(', ')}`);
    if (news.length) {
      unknowns.push(
        `fn_diamond_wallet_summary now also returns ${news.join(', ')} - the pinned ` +
          `snapshot (${SNAPSHOT_TAKEN}) is behind the database`
      );
    }
    for (const k of ['on_hand', 'collateral', 'sendable', 'in_arena']) {
      if (!Number.isFinite(Number(summary.body[k]))) {
        problems.push(`fn_diamond_wallet_summary.${k} is not a number`);
      }
    }
    const arena = summary.body.arena;
    if (arena && typeof arena === 'object') {
      const goneArena = missing(Object.keys(arena), WALLET_SUMMARY_ARENA_KEYS);
      if (goneArena.length) {
        problems.push(`fn_diamond_wallet_summary.arena is missing ${goneArena.join(', ')}`);
      }
    }
  }

  // fn_diamond_flow_by_kind - RETURNS jsonb, and carries the bucket vocabulary.
  const flow = await askPostgrest('/rpc/fn_diamond_flow_by_kind', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId }),
  });
  let liveBuckets = [];
  if (!flow.ok) {
    (flow.unknown ? unknowns : problems).push(`fn_diamond_flow_by_kind: ${flow.why}`);
  } else if (!flow.body || typeof flow.body !== 'object') {
    problems.push('fn_diamond_flow_by_kind: returned no object');
  } else {
    const gone = missing(Object.keys(flow.body), FLOW_KEYS);
    if (gone.length) problems.push(`fn_diamond_flow_by_kind is missing ${gone.join(', ')}`);
    for (const side of ['spent', 'earned']) {
      const lines = flow.body[side];
      if (!Array.isArray(lines)) {
        problems.push(`fn_diamond_flow_by_kind.${side} is not a list`);
        continue;
      }
      for (const l of lines) {
        const goneLine = missing(Object.keys(l || {}), FLOW_LINE_KEYS);
        if (goneLine.length) {
          problems.push(`a ${side} bucket line is missing ${goneLine.join(', ')}`);
          continue;
        }
        liveBuckets.push(l.bucket);
        if (!Number.isFinite(Number(l.lifetime))) {
          problems.push(`bucket '${l.bucket}' has a non-numeric lifetime`);
        }
      }
    }
  }
  liveBuckets = [...new Set(liveBuckets)].sort();
  const strangers = liveBuckets.filter((b) => !BUCKET_KEYS.includes(b));
  if (strangers.length) {
    // A bucket nobody pinned is a bucket no branch was written for: the
    // player watches those diamonds vanish out of the breakdown.
    problems.push(
      `the ledger produced bucket(s) the contract does not know: ${strangers.join(', ')}`
    );
  }

  // fn_diamond_kind_bucket / _row_label / _ledger_line: exist and answer.
  const bucketProbe = await askPostgrest('/rpc/fn_diamond_kind_bucket', {
    method: 'POST',
    body: JSON.stringify({
      p_type: 'purchase',
      p_transaction_type: 'diamond_gift_sent',
      p_source: null,
      p_amount: -10,
    }),
  });
  if (!bucketProbe.ok) {
    (bucketProbe.unknown ? unknowns : problems).push(`fn_diamond_kind_bucket: ${bucketProbe.why}`);
  } else {
    const row = Array.isArray(bucketProbe.body) ? bucketProbe.body[0] : bucketProbe.body;
    if (!row || row.bucket !== 'gifts_sent') {
      problems.push(
        `fn_diamond_kind_bucket put a sent gift in '${row?.bucket}' rather than gifts_sent`
      );
    }
  }

  const labelProbe = await askPostgrest('/rpc/fn_diamond_kind_row_label', {
    method: 'POST',
    body: JSON.stringify({ p_kind: 'diamond_gift_sent', p_amount: -10 }),
  });
  if (!labelProbe.ok) {
    (labelProbe.unknown ? unknowns : problems).push(`fn_diamond_kind_row_label: ${labelProbe.why}`);
  } else if (typeof labelProbe.body !== 'string' || labelProbe.body.length === 0) {
    problems.push('fn_diamond_kind_row_label returned no label');
  }

  const lineProbe = await askPostgrest('/rpc/fn_diamond_ledger_line', {
    method: 'POST',
    body: JSON.stringify({
      p_type: 'purchase',
      p_transaction_type: 'diamond_gift_sent',
      p_source: null,
      p_amount: -10,
      p_description: null,
    }),
  });
  if (!lineProbe.ok) {
    (lineProbe.unknown ? unknowns : problems).push(`fn_diamond_ledger_line: ${lineProbe.why}`);
  } else if (typeof lineProbe.body !== 'string' || lineProbe.body.length === 0) {
    problems.push('fn_diamond_ledger_line returned no line');
  }

  if (problems.length) {
    return record('diamond rpcs answer the shape the wallet reads', FAIL, problems.join('; '));
  }
  if (unknowns.length) {
    return record('diamond rpcs answer the shape the wallet reads', UNKNOWN, unknowns.join('; '));
  }
  return record(
    'diamond rpcs answer the shape the wallet reads',
    PASS,
    `${REQUIRED_FUNCTIONS.length} objects answered; buckets seen: ` +
      (liveBuckets.length ? liveBuckets.join(', ') : 'none on this ledger')
  );
}

// ─────────────────────────────────────────────────────────────────────────
async function main() {
  const json = process.argv.includes('--json');

  await checkBundleAgreement();
  await checkSiteHealth();
  await checkDiamondObjects();

  const verdict = results.some((r) => r.verdict === FAIL)
    ? FAIL
    : results.some((r) => r.verdict === UNKNOWN)
      ? UNKNOWN
      : PASS;

  if (json) {
    console.log(JSON.stringify({ verdict, exit: EXIT[verdict], snapshot: SNAPSHOT_TAKEN, results }, null, 2));
  } else {
    console.log(`diamond wallet live smoke - contract snapshot ${SNAPSHOT_TAKEN}`);
    console.log('-'.repeat(72));
    for (const r of results) {
      console.log(`${r.verdict.padEnd(7)} ${r.name}`);
      console.log(`        ${r.detail}`);
    }
    console.log('-'.repeat(72));
    console.log(`${verdict} (exit ${EXIT[verdict]})`);
    if (verdict === UNKNOWN) {
      console.log('UNKNOWN is not a pass. Something could not be asked or could not be read.');
    }
  }
  process.exit(EXIT[verdict]);
}

main();
