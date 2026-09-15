/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHICH PUSH SUBSCRIPTIONS BELONG TO THE SAME PHYSICAL DEVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure. No imports. It lives here rather than inside
 * `pages/api/cron/push-health.js` so the decision can be tested by RUNNING it —
 * the previous pins were regexes over that file's source, and every one of them
 * passed on 2026-09-07 while the bug they were guarding was live.
 *
 * ── THE PROBLEM THESE SOLVE (2026-09-07) ───────────────────────────────────
 *
 * Dan received the Estate Digest and the engine-break alert twice, on one
 * phone. His four active rows were two pairs:
 *
 *   iPhone, web.push.apple.com, identical user_agent
 *     device_id ff4645d3   last_receipt_at 2026-09-07 17:12:02   delivering
 *     device_id 657b16e5   last_receipt_at NULL since 2026-08-26  silent
 *
 *   Mac, fcm.googleapis.com, identical user_agent
 *     device_id ec90f0f1   last_receipt_at 2026-09-07 17:12:01   delivering
 *     device_id f902fc7b   last_receipt_at 2026-09-01 02:11       stale
 *
 * `push_subscriptions_one_active_per_device_uidx` is UNIQUE (user_id,
 * device_id), so two rows with DIFFERENT device_ids are both perfectly legal —
 * and every retire in this codebase matches on device_id, so none of them can
 * see across the pair. `deviceId` is minted into localStorage; an installed PWA
 * and a browser tab on one phone do not share that storage, so a single device
 * mints two ids and keeps both lineages alive for ever, each one dutifully
 * retiring only its own predecessors.
 *
 * `push-dispatch` then fans one outbox row out to every active row, so one
 * notification becomes two banners. The payload `tag` cannot collapse them:
 * a tag replaces within ONE service-worker registration, never across two.
 */

/**
 * The (user, push host, user agent) group a subscription belongs to.
 *
 * `user_agent` is deliberately part of the key even though two identical
 * iPhones on one account produce byte-identical strings. Merging on that alone
 * would be a guess; the receipt requirement in `selectRetirable` is what makes
 * it safe, because it never acts without proof that delivery to the group works.
 */
export function deviceGroupKey(s) {
    const ua = typeof s.user_agent === 'string' ? s.user_agent.trim() : '';
    return [
        s.user_id,
        String(s.endpoint || '')
            .replace('https://', '')
            .split('/')[0],
        // A MISSING USER AGENT NEVER GROUPS (2026-09-07 hardening).
        //
        // `user_agent || ''` meant every row without one landed in the same
        // bucket, so two GENUINELY DIFFERENT devices of one person on the same
        // push host could be treated as one device — and the silent one
        // retired. This code can take somebody's phone off notifications, so
        // the empty case must never merge.
        //
        // Measured before shipping: 0 active rows have a null or empty
        // user_agent and 0 such groups exist, so this changes nothing today.
        // It is here so that a legacy or partially-written row cannot make it
        // true later. An unknown agent gets a key nothing else can collide
        // with, which means such a row is always alone in its group and is
        // therefore never retirable.
        ua === '' ? `unknown-agent:${s.id ?? s.endpoint ?? Math.random()}` : ua,
    ].join('|');
}

/**
 * Which silent subscriptions may be retired, given every active row.
 *
 * Three conservative conditions, all of which must hold:
 *   1. a sibling IN THE SAME DEVICE GROUP is confirming receipts, so delivery
 *      to that device demonstrably works and silence is death, not quiet;
 *   2. the candidate is not itself that confirming sibling;
 *   3. the candidate is not the newest row in its group, because a device
 *      enrolled moments ago has not had time to confirm anything.
 *
 * A device whose only live row is silent is never touched — the alert in
 * push-health still fires for it, which is the correct outcome. Retiring on
 * "no receipt" alone would silence a working phone whose owner would have no
 * way to find out why, which is strictly worse than the duplicate banner.
 *
 * NOTE the condition that used to be here and is gone: proof used to be sought
 * per USER, so a working Mac authorised retiring a genuinely silent iPhone.
 * Delivery to a laptop says nothing about a phone.
 *
 * @param {Array} all      every ACTIVE subscription in the window
 * @param {Array} zombies  the matured, non-confirming subset of `all`
 * @param {number} zombieCutoffMs  epoch ms; a receipt at or after this is proof
 */
/**
 * PROVEN DEAD: sent to, accepted, and never once confirmed.
 *
 * selectRetirable() above deliberately spares a device that is the only live
 * row it has - "Nothing here can silence a device that is the only live row it
 * has". That was right as far as it went: a missing receipt can mean a dead
 * device, a blocked beacon, or a phone nobody has unlocked, and switching off
 * somebody's only device on that is a guess.
 *
 * But it leaves no way back. MEASURED 2026-09-15 on Dan's estate:
 *
 *   iPhone  active since 09-03, accepted sends through 09-15, receipts: NONE
 *   iPad    active since 08-30, accepted sends through 09-15, last receipt 08-31
 *
 * Every Apple endpoint in the database stopped confirming on 2026-09-08 while
 * every Chrome endpoint kept confirming to the minute. Apple answers 2xx for a
 * subscription whose device is long gone and never 410s it, so nothing reaps
 * it; the row has no confirming sibling, so nothing retires it; and the client
 * asks the BROWSER whether push is on, never the server, so nothing
 * re-registers it. Twelve days of silence that could not end.
 *
 * THE MISSING DISTINCTION IS SUSPICION VERSUS PROOF, and last_used_at carries
 * it. That column advances ONLY when the push service ACCEPTED a message
 * (push-dispatch sets it inside `if (result.ok)`). So a row whose last_used_at
 * has run days past its last receipt is not a device we merely have not heard
 * from - it is a device we have demonstrably been delivering to, repeatedly,
 * with nothing ever painting a pixel.
 *
 * A device nobody has pushed to has a still last_used_at and is never touched
 * by this, which is the conservatism the original guard was protecting.
 */
export const DEAD_AFTER_DAYS = 7;

// No `now` parameter on purpose: the test is last_used_at against the last
// proof of life, both of them recorded facts. Comparing against the clock
// would retire a row for being OLD rather than for being UNDELIVERABLE.
export function selectProvenDead(all, deadAfterDays = DEAD_AFTER_DAYS) {
    const windowMs = deadAfterDays * 86400_000;
    return (all || []).filter((s) => {
        if (!s.last_used_at) return false;          // never sent to: proves nothing
        const sentMs = Date.parse(s.last_used_at);
        if (!Number.isFinite(sentMs)) return false;
        // The clock starts at the last proof of life, or at enrolment if there
        // has never been one. Never at "now", which would retire on age alone.
        const ref = s.last_receipt_at || s.created_at;
        const refMs = Date.parse(ref || 0);
        if (!Number.isFinite(refMs) || refMs === 0) return false;
        return sentMs - refMs >= windowMs;
    });
}

export function selectRetirable(all, zombies, zombieCutoffMs) {
    const isConfirming = (s) =>
        Boolean(s.last_receipt_at) && Date.parse(s.last_receipt_at) >= zombieCutoffMs;

    const confirmingGroups = new Set(all.filter(isConfirming).map(deviceGroupKey));
    const newestInGroup = new Map();
    for (const s of all) {
        const k = deviceGroupKey(s);
        const prev = newestInGroup.get(k);
        if (!prev || Date.parse(s.created_at || 0) > Date.parse(prev.created_at || 0)) {
            newestInGroup.set(k, s);
        }
    }

    return zombies.filter((z) => {
        const k = deviceGroupKey(z);
        return confirmingGroups.has(k) && !isConfirming(z) && newestInGroup.get(k)?.id !== z.id;
    });
}

/**
 * Which of a group's CONFIRMING rows are redundant.
 *
 * ── THE HALF selectRetirable CANNOT SEE (2026-09-07, second pass) ──────────
 *
 * `selectRetirable` only ever returns rows drawn from `zombies`, and a zombie
 * is by definition a row that is NOT confirming receipts. So it handles the
 * pair shape that was live this morning - one delivering row, one silent one -
 * and is structurally blind to the other shape:
 *
 *   Mac, fcm.googleapis.com, identical user_agent
 *     device_id ec90f0f1   last_receipt_at 2026-09-07 17:12:01   delivering
 *     device_id 5e1652b1   created 19:42:43, confirms later      delivering
 *
 * Two rows in ONE group that BOTH deliver are two banners on one screen, for
 * ever. Nothing ages out, because neither is ever silent; nothing merges them,
 * because the UNIQUE index is on (user_id, device_id) and these differ. The
 * morning's fix retired the silent siblings and this pair simply re-formed
 * when the browser minted a fresh `deviceId` at 19:42 and then started
 * confirming - which is the ordinary outcome, not an unlucky one.
 *
 * ── WHY THIS ONE CAN BE DECIDED, WHEN THE SILENT CASE MUST BE CAUTIOUS ─────
 *
 * `selectRetirable` is careful because retiring a silent row might be taking a
 * working phone off notifications with no way for its owner to find out. That
 * risk does not exist here: EVERY row considered has itself confirmed a recent
 * receipt, and the one kept is the most recent confirmer in the group. The
 * device provably still receives push after the retire, because the survivor
 * is the row that most recently proved it.
 *
 * So the rule is simply: one confirming row per group. Keep the freshest
 * receipt, retire the rest, tie-break on id so the choice is deterministic and
 * a test can pin it.
 *
 * Groups with zero or one confirming row return nothing - this function is
 * only ever subtractive on a genuine duplicate.
 *
 * @param {Array} all every ACTIVE subscription in the window
 * @param {number} zombieCutoffMs epoch ms; a receipt at or after this is proof
 */
export function selectDuplicateConfirmers(all, zombieCutoffMs) {
    const isConfirming = (s) =>
        Boolean(s.last_receipt_at) && Date.parse(s.last_receipt_at) >= zombieCutoffMs;

    const byGroup = new Map();
    for (const s of all) {
        if (!isConfirming(s)) continue;
        const k = deviceGroupKey(s);
        if (!byGroup.has(k)) byGroup.set(k, []);
        byGroup.get(k).push(s);
    }

    const redundant = [];
    for (const rows of byGroup.values()) {
        if (rows.length < 2) continue;
        const ranked = rows.slice().sort((a, b) => {
            const d = Date.parse(b.last_receipt_at) - Date.parse(a.last_receipt_at);
            if (d !== 0) return d;
            return String(a.id) < String(b.id) ? -1 : 1;
        });
        redundant.push(...ranked.slice(1));
    }
    return redundant;
}
