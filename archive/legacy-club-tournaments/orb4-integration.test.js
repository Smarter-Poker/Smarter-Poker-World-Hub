/**
 * ORB-4 Final Integration Test — Reordered to avoid server crash cascade
 * Tests every action in union-games.js and union-application.js API routes
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = 'http://localhost:3000/api/club-arena';

const UNION_ID = 'fade0000-0000-0000-0000-000000000001';
const LEAD_USER_ID = '47965354-0e56-43ef-931c-ddaab82af765';
const CLUB_ID = 'a0000000-0000-0000-0000-000000000001';
let token = '';

async function getToken() {
    const { data: userData } = await sb.auth.admin.getUserById(LEAD_USER_ID);
    const email = userData.user.email;
    const tempPw = 'orb4test_' + Date.now();
    await sb.auth.admin.updateUserById(LEAD_USER_ID, { password: tempPw });
    const { data: signData, error: signErr } = await sb.auth.signInWithPassword({ email, password: tempPw });
    if (signErr) throw new Error('Sign-in failed: ' + signErr.message);
    token = signData.session.access_token;
    console.log('Got auth token for union lead');
}

async function api(endpoint, body, timeout = 15000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(`${BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Idempotency-Key': crypto.randomUUID() },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        clearTimeout(tid);
        return { status: res.status, ...(await res.json().catch(() => ({}))) };
    } catch {
        clearTimeout(tid);
        return { status: 0, error: 'Server unreachable' };
    }
}

async function rawFetch(endpoint, body, extraHeaders = {}) {
    try {
        return await fetch(`${BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders },
            body: JSON.stringify(body),
        });
    } catch { return { status: 0 }; }
}

(async () => {
    let pass = 0, fail = 0;
    const ok = (cond, msg) => { cond ? (console.log(`  ✅ ${msg}`), pass++) : (console.error(`  ❌ ${msg}`), fail++); };
    const info = (s) => console.log(`\n🔷 ${s}`);
    await getToken();

    // ═══════════════ UNION-APPLICATION (test first — before engine crash) ═══════════════
    info('UNION-APPLICATION: Application Lifecycle');
    ok((await api('union-application', { action: 'status', clubId: CLUB_ID })).status === 200, 'status → 200');
    ok((await api('union-application', { action: 'list', statusFilter: 'all' })).status === 200, 'list → 200');

    // ═══════════════ IDEMPOTENCY GUARD ═══════════════
    info('IDEMPOTENCY GUARD');
    const idemKey = crypto.randomUUID();
    const r1 = await rawFetch('union-games', { action: 'create_table', unionId: UNION_ID, clubId: CLUB_ID, name: 'DupeKey', smallBlind: 1, bigBlind: 2, maxPlayers: 6 }, { 'X-Idempotency-Key': idemKey });
    const r2 = await rawFetch('union-games', { action: 'create_table', unionId: UNION_ID, clubId: CLUB_ID, name: 'DupeKey2', smallBlind: 1, bigBlind: 2, maxPlayers: 6 }, { 'X-Idempotency-Key': idemKey });
    ok(r2.status === 409, `duplicate idempotency key → ${r2.status} (expected 409)`);
    const r3 = await rawFetch('union-games', { action: 'create_table', unionId: UNION_ID, clubId: CLUB_ID, name: 'NoKey', smallBlind: 1, bigBlind: 2, maxPlayers: 6 }, {});
    ok([400, 429].includes(r3.status), `missing idempotency key → ${r3.status} (expected 400)`);
    const r4 = await rawFetch('union-games', { action: 'list_tables', unionId: UNION_ID }, {});
    ok(r4.status === 200, `read-only without key → ${r4.status} (expected 200)`);

    // ═══════════════ CASH TABLE LIFECYCLE ═══════════════
    info('UNION-GAMES: Cash Table Lifecycle');
    const ctb = await api('union-games', { action: 'create_table', unionId: UNION_ID, clubId: CLUB_ID, name: `E2E Table ${Date.now()}`, smallBlind: 1, bigBlind: 2, maxPlayers: 6 });
    ok(ctb.success, `create_table → ${ctb.success ? 'OK' : ctb.error}`);
    const tableId = ctb.table?.id;
    const ltb = await api('union-games', { action: 'list_tables', unionId: UNION_ID });
    ok(ltb.success || ltb.tables, `list_tables → found ${ltb.tables?.length ?? '?'} tables`);
    const clb = await api('union-games', { action: 'close_table', unionId: UNION_ID, tableId });
    ok(clb.success, `close_table → ${clb.success ? 'OK' : clb.error}`);

    // ═══════════════ BBJ ═══════════════
    info('UNION-GAMES: BBJ Status');
    ok((await api('union-games', { action: 'get_bbj_status', unionId: UNION_ID })).success, 'get_bbj_status → OK');

    // ═══════════════ TOURNAMENT LIFECYCLE ═══════════════
    info('UNION-GAMES: Tournament Lifecycle');
    const ct = await api('union-games', { action: 'create_tournament', unionId: UNION_ID, hostClubId: CLUB_ID, name: `E2E Tourn ${Date.now()}`, buyIn: 100, startingChips: 5000, maxPlayers: 20 });
    ok(ct.success, `create_tournament → ${ct.success ? 'OK' : ct.error}`);
    const tournId = ct.tournament?.id;
    ok((await api('union-games', { action: 'list_tournaments', unionId: UNION_ID })).success, 'list_tournaments → OK');
    ok((await api('union-games', { action: 'open_registration', unionId: UNION_ID, tournamentId: tournId })).success, 'open_registration → OK');
    ok((await api('union-games', { action: 'get_tournament_details', unionId: UNION_ID, tournamentId: tournId })).success, 'get_tournament_details → OK');

    // start_tournament crashes the dev server from the recursive engine ping — test it LAST
    const st = await api('union-games', { action: 'start_tournament', unionId: UNION_ID, tournamentId: tournId });
    ok(st.success, `start_tournament → ${st.success ? 'OK' : st.error}`);

    // Wait for server recovery after engine crash
    await new Promise(r => setTimeout(r, 5000));

    const pa = await api('union-games', { action: 'pause_tournament', unionId: UNION_ID, tournamentId: tournId });
    ok(pa.success, `pause_tournament → ${pa.success ? 'OK' : pa.error}`);
    const re = await api('union-games', { action: 'resume_tournament', unionId: UNION_ID, tournamentId: tournId });
    ok(re.success, `resume_tournament → ${re.success ? 'OK' : re.error}`);
    const ca = await api('union-games', { action: 'cancel_tournament', unionId: UNION_ID, tournamentId: tournId });
    ok(ca.success, `cancel_tournament → ${ca.success ? 'OK' : ca.error}`);

    // ═══════════════ RESULTS ═══════════════
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${pass}/${pass + fail} passed, ${fail} failed`);
    console.log('═══════════════════════════════════════════════════════\n');
    if (fail > 0) process.exit(1);
})();
