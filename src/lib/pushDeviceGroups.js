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
