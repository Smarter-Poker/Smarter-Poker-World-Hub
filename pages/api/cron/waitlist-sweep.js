/**
 * /api/cron/waitlist-sweep — the recurring half of the waitlist TTLs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS
 *
 * `fn_offer_open_seat` (club-arena, 20260830021000) already applies both
 * waitlist TTLs — a lapsed three-minute offer, and a queue row abandoned for
 * more than a day — and applying them there is deliberate: it is the only path
 * that turns a queue row into an interrupt, so a row cannot outlive its own
 * expiry by the width of a scheduler window.
 *
 * But it only runs WHEN A SEAT OPENS AT THAT TABLE. On a table nobody leaves,
 * nothing runs, and two things rot in plain sight:
 *
 *   1. THE LOBBY OVERSTATES THE QUEUE. "Waiting 6" counts `waiting` rows, so a
 *      table quiet for a week advertises a line made entirely of people who
 *      have long since gone. Players choose a game off that number.
 *   2. AN OFFER LAPSES IN SILENCE, POSSIBLY FOREVER, AND THE QUEUE STALLS
 *      BEHIND IT. The player whose sixty seconds ran out is only told when the
 *      NEXT seat opens at that table. If none ever does, they are never told
 *      at all — they simply stop being in the line, with no idea why. Worse,
 *      until 2026-08-31 nothing then offered that seat to the next player
 *      either, so the notification's own promise ("went to the next player in
 *      line") was false and the seat sat open above a motionless queue. That is the same class of complaint as
 *      "the seat open push should only occur if you are on a list waiting for
 *      a seat" (Dan 2026-08-29), seen from the other end.
 *
 * This calls `fn_sweep_stale_waitlists`, which is the SAME rules rather
 * than a second opinion about them — and which, since 2026-08-31, also calls
 * `fn_offer_open_seat` for every table it touched, so the seat actually moves
 * to the next player instead of merely being marked lapsed — it shares the notification text and the
 * bell-only `_push` marker with the offer path, so a sweep and an offer can
 * never disagree about what an expiry looks like. All this route adds is
 * reach: the tables the offer path never visits.
 *
 * WHY IT CANNOT FAIL SILENTLY
 *
 * A sweep that errors and returns 200 is indistinguishable from a sweep with
 * nothing to do, and the whole point of it is to correct something nobody is
 * watching. An RPC error is a 500 so the cron health dashboard shows it.
 *
 * WHY THE COUNTS ARE IN THE RESPONSE
 *
 * `entries_expired` should trend toward zero as the offer path does more of
 * the work. A run that suddenly expires hundreds means either an outage left a
 * backlog or something upstream stopped retiring rows — both worth seeing, and
 * neither visible from a bare "ok".
 *
 * Cadence: every minute, via Open Claw (CLAUDE.md section 11 — NOT
 * vercel.json). It was every ten while the offer lasted three minutes and the
 * sweep only announced a lapse. Dan's 2026-08-31 rule makes the offer a
 * SIXTY-SECOND exclusive hold and this sweep the thing that advances the
 * queue, so a ten-minute tick would leave a seat held-then-abandoned and the
 * next player waiting for up to ten minutes. The scan is bounded (200 tables)
 * and only visits tables with a live queue, so an empty waitlist costs one
 * cheap RPC a minute.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

let _admin = null;
function getAdmin() {
    if (_admin) return _admin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _admin = createClient(url, key, { auth: { persistSession: false } });
    return _admin;
}

export const config = { maxDuration: 60 };

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
    }

    const started = Date.now();
    try {
        // No arguments: the TTLs are defaults on the function signature, so the
        // rule lives in one place and this route cannot drift from the offer
        // path by passing a different number.
        const { data, error } = await admin.rpc('fn_sweep_stale_waitlists');

        if (error) {
            return res.status(500).json({
                status: 'failed',
                error: error.message,
                duration_ms: Date.now() - started,
            });
        }

        return res.status(200).json({
            status: 'ok',
            offers_expired: Number(data?.offers_expired || 0),
            entries_expired: Number(data?.entries_expired || 0),
            seated_retired: Number(data?.seated_retired || 0),
            // The number that says the queue actually MOVED. offers_expired
            // without seats_reoffered is the exact failure this sweep existed
            // to hide: a lapsed hold closed, and nobody handed the seat on.
            seats_reoffered: Number(data?.seats_reoffered || 0),
            tables_scanned: Number(data?.tables_scanned || 0),
            duration_ms: Date.now() - started,
        });
    } catch (e) {
        return res.status(500).json({
            status: 'failed',
            error: e?.message || 'waitlist-sweep threw',
            duration_ms: Date.now() - started,
        });
    }
}

export default withCronHealth('waitlist-sweep', handler);
