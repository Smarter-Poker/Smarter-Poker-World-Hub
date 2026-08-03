/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  transferMath.test.mjs — pure decision logic for the SEND / RECEIVE
 *  diamond flow (pages/api/store/diamond-transfer.js).
 *
 *  Run:  node --test src/lib/rewards/__tests__/transferMath.test.mjs
 *
 *  WHY RE-IMPLEMENTED HERE RATHER THAN IMPORTED:
 *  the handler is a single 714-line default-export Next.js API route whose
 *  gates are interleaved with `await supabase...` calls; nothing is exported.
 *  Every function below is a line-for-line transcription of a decision in the
 *  handler or in the SQL it depends on, with the source line cited. If the
 *  handler changes, these tests must be re-synced — the citations tell you
 *  exactly where to look.
 *
 *  NO NETWORK / NO DATABASE. Pure arithmetic and branch logic only.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ───────────────────────────────────────────────────────────────────────────
// CONSTANTS — transcribed from pages/api/store/diamond-transfer.js:48-97
// ───────────────────────────────────────────────────────────────────────────
const MIN_TRANSFER                = 10;    // :48
const NEW_USER_BLOCK_DAYS         = 30;    // :65
const GRADUATION_DAYS             = 120;   // :67
const FREE_EARNED_30DAY_LIMIT     = 100;   // :69
const PURCHASED_WON_30DAY_LIMIT   = 500;   // :70
const MAX_TRANSFER_STANDARD       = 100;   // :84
const MAX_TRANSFER_VIP            = 500;   // :85
const DAILY_LIMIT_STANDARD        = 500;   // :86
const DAILY_LIMIT_VIP             = 2000;  // :87
const COOLDOWN_SECONDS            = 60;    // :88
const VIP_FRIENDSHIP_DAYS         = 60;    // :90
const PER_RECIPIENT_DAILY_LIMIT   = 200;   // :91
const PER_RECIPIENT_COOLDOWN_SECONDS = 300;// :92
const RECIPIENT_DAILY_RECEIVE_LIMIT  = 1000;// :93

// Transcribed from supabase/migrations/20260517000001_harmonize_anti_farming_age_thresholds.sql:78-84
const CAP_PER_PAIR_24H            = 5000;
const CAP_PER_USER_24H            = 50000;
const CAP_BURST_60S               = 2000;
const CAP_FRESH_PAID_24H          = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // :62

// ───────────────────────────────────────────────────────────────────────────
// PURE LOGIC UNDER TEST
// ───────────────────────────────────────────────────────────────────────────

/** handler :232-240 — body parse + minimum. Returns {ok} or {ok:false,status,error}. */
export function parseAmount(rawAmount) {
    const amount = parseInt(rawAmount, 10);
    if (isNaN(amount) || amount < MIN_TRANSFER) {
        return { ok: false, status: 400, error: `Minimum transfer is ${MIN_TRANSFER} diamonds`, amount };
    }
    return { ok: true, amount };
}

/** handler :235-245 — recipient shape + self-transfer. */
export function validateRecipient(userId, recipientId) {
    if (!recipientId || typeof recipientId !== 'string' || !UUID_RE.test(recipientId)) {
        return { ok: false, status: 400, error: 'Valid recipient is required' };
    }
    // NOTE: strict === on raw strings. See TRANSFER-AUDIT.md "case-sensitive
    // self-transfer" — this is a byte compare, not a UUID compare.
    if (userId === recipientId) {
        return { ok: false, status: 400, error: 'Cannot transfer diamonds to yourself' };
    }
    return { ok: true };
}

/** handler :277-279 — recipient/sender profile existence. */
export function requireBothProfiles(profiles, userId, recipientId) {
    const sender = profiles.find(p => p.id === userId);
    const recipient = profiles.find(p => p.id === recipientId);
    if (!sender || !recipient) return { ok: false, status: 404, error: 'User not found' };
    return { ok: true, sender, recipient };
}

/** handler :261-266 — friendship-age tier. */
export function friendshipTier(friendshipAgeDays) {
    const isVipTier = friendshipAgeDays >= VIP_FRIENDSHIP_DAYS;
    return {
        isVipTier,
        maxTransferVip:  isVipTier ? MAX_TRANSFER_VIP : MAX_TRANSFER_STANDARD,
        dailyLimitTier:  isVipTier ? DAILY_LIMIT_VIP  : DAILY_LIMIT_STANDARD,
    };
}

/** handler :306-320 — the trust ladder that unlocks / skips every JS gate. */
export function trustState({ senderAgeDays, firstPurchaseAgeDays = null, isFarmingFlagged = false }) {
    const hasPaid = firstPurchaseAgeDays !== null;
    const isPostPurchaseCooldown = hasPaid && firstPurchaseAgeDays >= 7;              // :310
    const isFreshPaid = hasPaid && !isPostPurchaseCooldown && senderAgeDays < NEW_USER_BLOCK_DAYS; // :311
    const isGraduated = senderAgeDays >= GRADUATION_DAYS;                              // :317
    const isFullyUnrestricted = !isFarmingFlagged && (isGraduated || isPostPurchaseCooldown); // :318-320
    return { hasPaid, isPostPurchaseCooldown, isFreshPaid, isGraduated, isFullyUnrestricted };
}

/** handler :325-338 — GUARD 16 hard block for unpaid accounts < 30d. */
export function newUserBlock({ isKingfish, hasPaid, senderAgeDays }) {
    if (!isKingfish && !hasPaid && senderAgeDays < NEW_USER_BLOCK_DAYS) {
        return { ok: false, status: 403, gateType: 'new_user_block',
                 daysRemaining: Math.ceil(NEW_USER_BLOCK_DAYS - senderAgeDays) };
    }
    return { ok: true };
}

/** handler :340-364 — fresh-paid 500/24h cap. */
export function freshPaidCap({ isKingfish, isFreshPaid, sent24h, amount }) {
    if (!isKingfish && isFreshPaid && sent24h + amount > CAP_FRESH_PAID_24H) {
        return { ok: false, status: 429, gateType: 'fresh_paid_24h_cap' };
    }
    return { ok: true };
}

/** handler :367-369 — recipient must be >= 7 days old. */
export function recipientAgeGate({ isKingfish, recipientAgeDays }) {
    if (!isKingfish && recipientAgeDays < 7) return { ok: false, status: 403 };
    return { ok: true };
}

/** handler :372-379 — per-transfer maximum. */
export function perTransferCap({ isKingfish, isFullyUnrestricted, maxTransferVip, amount }) {
    if (!isKingfish && !isFullyUnrestricted && amount > maxTransferVip) {
        return { ok: false, status: 400 };
    }
    return { ok: true };
}

/** handler :382-384 — balance check (JS pre-flight; re-checked atomically in SQL). */
export function balanceCheck({ balance, amount }) {
    if ((balance ?? 0) < amount) return { ok: false, status: 400, error: 'Insufficient diamond balance' };
    return { ok: true };
}

/** handler :404-448 — source-tiered rolling 30-day cap for 30..119 day accounts. */
export function sourceTierCap({ isKingfish, isFullyUnrestricted, isGraduated,
                                alreadySent30Day, ipAlreadySent30Day,
                                purchasedWonAvailable, amount }) {
    const effectiveAlreadySent = Math.max(alreadySent30Day, ipAlreadySent30Day); // :421
    if (isKingfish || isFullyUnrestricted || isGraduated) return { ok: true, effectiveAlreadySent, skipped: true };
    const activeCap = purchasedWonAvailable >= amount ? PURCHASED_WON_30DAY_LIMIT : FREE_EARNED_30DAY_LIMIT; // :428
    const capLabel  = purchasedWonAvailable >= amount ? 'purchased/won' : 'free/earned';
    if (effectiveAlreadySent + amount > activeCap) {
        return { ok: false, status: 429, gateType: 'source_tier_cap', cap: activeCap, capType: capLabel, effectiveAlreadySent };
    }
    return { ok: true, effectiveAlreadySent, cap: activeCap, capType: capLabel };
}

/** handler :475-489 — per-recipient rolling 30-day cap. */
export function perRecipientCap({ isKingfish, isFullyUnrestricted, recipientTotal30Day, amount }) {
    if (!isKingfish && !isFullyUnrestricted && recipientTotal30Day + amount > PER_RECIPIENT_DAILY_LIMIT) {
        return { ok: false, status: 429 };
    }
    return { ok: true };
}

/** handler :510-527 — GUARD 12 inbound cap, measured on the RECIPIENT. */
export function recipientReceiveCap({ isKingfish, recipientReceiveTotal, amount }) {
    if (!isKingfish && recipientReceiveTotal + amount > RECIPIENT_DAILY_RECEIVE_LIMIT) {
        return { ok: false, status: 429, gateType: 'broadcaster_receive_cap' };
    }
    return { ok: true };
}

/**
 * DB trigger caps — fn_check_anti_farming_gift_cap(uuid,uuid,integer),
 * supabase/migrations/20260517000001_harmonize_anti_farming_age_thresholds.sql:85-320.
 * Fires BEFORE INSERT on the SENDER's negative ledger row inside deduct_diamonds,
 * so a violation aborts the whole RPC and the debit never commits.
 * ALL THREE WINDOWS ARE MEASURED ON THE SENDER ONLY.
 */
export function dbGiftCapCheck({ senderId, recipientId, amount,
                                 isKingfishSender = false, isFarmingFlagged = false,
                                 accountAgeDays = 999, daysSincePurchase = null,
                                 pair24h = 0, total24h = 0, burst60s = 0, freshPaid24h = 0 }) {
    if (!senderId || !recipientId || amount === null || amount <= 0) return { allowed: false, code: 'invalid_args' }; // :87
    if (senderId === recipientId) return { allowed: false, code: 'self_transfer' };                                   // :97
    if (isKingfishSender) return { allowed: true, code: 'ok', reason: 'kingfish_sender_bypass' };                     // :109
    if (!isFarmingFlagged) {
        if (daysSincePurchase !== null && daysSincePurchase >= 7)                                                     // :182
            return { allowed: true, code: 'ok', reason: 'trusted_purchaser_7d_bypass' };
        if (accountAgeDays >= 120)                                                                                    // :191
            return { allowed: true, code: 'ok', reason: 'trusted_120d_unflagged_bypass' };
        if (daysSincePurchase === null && accountAgeDays < 30)                                                        // :200
            return { allowed: false, code: 'new_user_block' };
        if (accountAgeDays < 30 && daysSincePurchase !== null) {                                                      // :214
            if (freshPaid24h + amount > CAP_FRESH_PAID_24H) return { allowed: false, code: 'fresh_paid_24h_cap' };
            return { allowed: true, code: 'ok', reason: 'fresh_paid_within_500_per_day' };
        }
    }
    if (pair24h  + amount > CAP_PER_PAIR_24H) return { allowed: false, code: 'pair_24h_cap' };   // :257
    if (total24h + amount > CAP_PER_USER_24H) return { allowed: false, code: 'user_24h_cap' };   // :280
    if (burst60s + amount > CAP_BURST_60S)    return { allowed: false, code: 'burst_cap' };      // :303
    return { allowed: true, code: 'ok', reason: 'within_caps' };
}

/**
 * deduct_diamonds(...) decision core —
 * supabase/migrations/20260505210000_strict_serialized_cooldown_deduct_diamonds.sql:40-109.
 * The cooldown EXISTS check runs INSIDE the `FOR UPDATE` lock, which is what
 * actually serialises concurrent double-submits.
 */
export function deductDecision({ balance, amount, cooldownSeconds = COOLDOWN_SECONDS,
                                 hasPriorRowWithSameReference = false,
                                 secondsSinceLastGiftSent = Infinity, profileExists = true }) {
    if (hasPriorRowWithSameReference) return { success: true, idempotent: true, balance };        // :42-57
    if (!profileExists) return { success: false, error: 'User not found' };                       // :65
    if (balance < amount) return { success: false, error: 'Insufficient diamonds', balance };     // :69
    if (cooldownSeconds > 0 && secondsSinceLastGiftSent <= cooldownSeconds) {                     // :81-94
        return { success: false, error: 'Please wait before sending again', cooldown_active: true };
    }
    return { success: true, balance: balance - amount, charged: amount, ledgerAmount: -amount };  // :96-109
}

/**
 * add_diamonds_to_balance(...) decision core —
 * supabase/migrations/20260501120000_multiplier_aware_diamond_awards.sql:33-121.
 * The multiplier exclusion list is exactly ('purchase','deduction','adjustment',
 * 'refund','transfer') — 'diamond_gift_received' and 'diamond_gift_refund'
 * are NOT on it.
 */
const MULTIPLIER_EXEMPT_TYPES = ['purchase', 'deduction', 'adjustment', 'refund', 'transfer']; // :63
export function creditDecision({ balance, amount, type, multiplier = 1.0,
                                 referenceIdAlreadyUsed = false, profileExists = true }) {
    if (referenceIdAlreadyUsed) return { success: false, duplicate: true, error: 'Duplicate reference_id' }; // :35-46
    if (!profileExists) return { success: false, error: 'Profile not found' };                               // :56
    let actual = amount;
    if (amount > 0 && !MULTIPLIER_EXEMPT_TYPES.includes(type) && multiplier > 1.0) {                          // :62-66
        actual = Math.round(amount * multiplier);
    }
    const newBalance = balance + actual;
    if (newBalance < 0) return { success: false, error: 'Insufficient diamonds' };                            // :73
    return { success: true, old_balance: balance, new_balance: newBalance, raw_amount: amount, actual_amount: actual };
}

/**
 * handler :629-647 — how the route interprets the credit result.
 * Returns what the route does next.
 */
export function creditOutcome({ creditErr, creditResult }) {
    if (creditErr || (creditResult && creditResult.success === false && !creditResult.duplicate)) {
        return { action: 'refund_and_500' };   // :638-643
    }
    if (creditResult && creditResult.duplicate) return { action: 'treat_as_success_no_refund' }; // :645-647
    return { action: 'success_200' };
}

/** Full end-to-end money movement for one transfer, as the code actually behaves. */
export function settleTransfer({ amount, senderBalance, recipientBalance, recipientMultiplier = 1.0 }) {
    const d = deductDecision({ balance: senderBalance, amount, secondsSinceLastGiftSent: Infinity });
    if (!d.success) return { moved: false, reason: d.error, senderBalance, recipientBalance };
    const c = creditDecision({ balance: recipientBalance, amount, type: 'diamond_gift_received', multiplier: recipientMultiplier });
    if (!c.success) {
        // handler :615-627 refund path — note it reuses add_diamonds_to_balance
        const r = creditDecision({ balance: d.balance, amount, type: 'diamond_gift_refund', multiplier: 1.0 });
        return { moved: false, refunded: r.success, senderBalance: r.success ? r.new_balance : d.balance, recipientBalance };
    }
    return {
        moved: true,
        debited:  amount,
        credited: c.actual_amount,
        senderBalance:    d.balance,
        recipientBalance: c.new_balance,
        minted: c.actual_amount - amount,
        senderLedger:    { transaction_type: 'diamond_gift_sent',     amount: -amount },
        recipientLedger: { transaction_type: 'diamond_gift_received', amount: c.actual_amount },
    };
}

// TX_TYPES keys present in src/components/store/DiamondWalletModal.jsx:68-120
const WALLET_TX_TYPE_KEYS = new Set([
    'purchase','feature_unlock','game_cost','arcade_entry','bonus','signup_bonus','daily_bonus',
    'daily_login','daily_trivia','streak_reward','vip_reward','vip_stipend','achievement','challenge',
    'tournament_prize','tournament_refund','pvp_win','pvp_refund','game_reward','trivia_reward',
    'social_post','follow','reaction','comment','share','referral','profile_complete','profile_pic',
    'video_watch','video_favorite','hendonmob_link','venue_review','promo_code',
    'diamond_gift_sent','diamond_gift_received','diamond_gift_refund','diamond_received',
    'vip_daily','refund','adjustment',
]);

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('amount validation (handler :232-240)', () => {
    test('rejects zero, negative and sub-minimum amounts', () => {
        for (const bad of [0, -1, -100, 1, 9]) {
            const r = parseAmount(bad);
            assert.equal(r.ok, false, `expected ${bad} rejected`);
            assert.equal(r.status, 400);
        }
    });
    test('rejects non-numeric / missing amounts', () => {
        for (const bad of [undefined, null, '', 'abc', {}, [], NaN]) {
            assert.equal(parseAmount(bad).ok, false);
        }
    });
    test('accepts the minimum exactly', () => {
        assert.deepEqual(parseAmount(10), { ok: true, amount: 10 });
        assert.deepEqual(parseAmount('10'), { ok: true, amount: 10 });
    });
    test('fractional amounts are TRUNCATED by parseInt, never fractional', () => {
        assert.equal(parseAmount(10.9).amount, 10);
        assert.equal(parseAmount('10.99').amount, 10);
        assert.equal(parseAmount('99.5').amount, 99);
        assert.equal(parseAmount(9.99).ok, false); // truncates to 9 -> below MIN
        assert.ok(Number.isInteger(parseAmount('10.99').amount));
    });
    test('DEFECT: parseInt silently mangles exponent / suffixed input', () => {
        // "1e3" means 1000 to a human and to Number(); parseInt reads 1.
        assert.equal(parseInt('1e3', 10), 1);
        assert.equal(parseAmount('1e3').ok, false); // 1 < MIN_TRANSFER -> at least it is rejected
        assert.equal(parseAmount('50abc').amount, 50); // accepted as 50
        assert.equal(parseAmount(' 250 ').amount, 250);
    });
});

describe('recipient validation (handler :235-245)', () => {
    const me = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const them = '11111111-2222-3333-4444-555555555555';
    test('rejects non-UUID recipients before anything else', () => {
        for (const bad of [undefined, null, '', 'nope', 12345, `${them}'--`, `%${them}%`]) {
            assert.equal(validateRecipient(me, bad).ok, false);
        }
    });
    test('blocks self-transfer', () => {
        const r = validateRecipient(me, me);
        assert.equal(r.ok, false);
        assert.equal(r.error, 'Cannot transfer diamonds to yourself');
    });
    test('DEFECT: self-transfer check is a case-SENSITIVE string compare', () => {
        // UUID_RE has the /i flag (handler :62) so an upper-cased copy of your
        // own id passes shape validation, and `userId === recipientId` is false.
        assert.ok(UUID_RE.test(me.toUpperCase()));
        assert.equal(validateRecipient(me, me.toUpperCase()).ok, true,
            'JS self-transfer guard does NOT catch an upper-cased self id');
        // Backstop: the DB cap function compares real uuid values, so it does.
        assert.equal(dbGiftCapCheck({ senderId: me, recipientId: me, amount: 100 }).code, 'self_transfer');
    });
    test('accepts a well-formed distinct recipient', () => {
        assert.equal(validateRecipient(me, them).ok, true);
    });
});

describe('nonexistent user (handler :269-279)', () => {
    const me = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const them = '11111111-2222-3333-4444-555555555555';
    test('404 when the recipient profile row is absent', () => {
        const r = requireBothProfiles([{ id: me, diamonds: 5000 }], me, them);
        assert.equal(r.ok, false);
        assert.equal(r.status, 404);
    });
    test('404 when the sender profile row is absent', () => {
        const r = requireBothProfiles([{ id: them, diamonds: 0 }], me, them);
        assert.equal(r.ok, false);
        assert.equal(r.status, 404);
    });
    test('ok when both rows come back', () => {
        assert.equal(requireBothProfiles([{ id: me }, { id: them }], me, them).ok, true);
    });
});

describe('balance ceiling (handler :382-384 + deduct_diamonds :69)', () => {
    test('JS rejects amount > balance', () => {
        assert.equal(balanceCheck({ balance: 99, amount: 100 }).ok, false);
        assert.equal(balanceCheck({ balance: 100, amount: 100 }).ok, true);
        assert.equal(balanceCheck({ balance: null, amount: 10 }).ok, false);
        assert.equal(balanceCheck({ balance: undefined, amount: 10 }).ok, false);
    });
    test('SQL re-checks it under the row lock, so a stale JS read cannot overdraw', () => {
        const d = deductDecision({ balance: 50, amount: 100 });
        assert.equal(d.success, false);
        assert.equal(d.error, 'Insufficient diamonds');
    });
    test('a successful debit can never drive the balance negative', () => {
        for (const [bal, amt] of [[100, 100], [1000, 10], [10, 10]]) {
            const d = deductDecision({ balance: bal, amount: amt });
            assert.equal(d.success, true);
            assert.ok(d.balance >= 0);
            assert.equal(d.balance, bal - amt);
        }
    });
});

describe('friendship tier & per-transfer cap (handler :261-266, :372-379)', () => {
    test('under 60 days of friendship the cap is 100', () => {
        const t = friendshipTier(59.9);
        assert.equal(t.isVipTier, false);
        assert.equal(t.maxTransferVip, MAX_TRANSFER_STANDARD);
        assert.equal(perTransferCap({ isKingfish: false, isFullyUnrestricted: false, maxTransferVip: t.maxTransferVip, amount: 101 }).ok, false);
        assert.equal(perTransferCap({ isKingfish: false, isFullyUnrestricted: false, maxTransferVip: t.maxTransferVip, amount: 100 }).ok, true);
    });
    test('60+ days unlocks 500', () => {
        const t = friendshipTier(60);
        assert.equal(t.isVipTier, true);
        assert.equal(t.maxTransferVip, MAX_TRANSFER_VIP);
        assert.equal(t.dailyLimitTier, DAILY_LIMIT_VIP);
        assert.equal(perTransferCap({ isKingfish: false, isFullyUnrestricted: false, maxTransferVip: 500, amount: 500 }).ok, true);
        assert.equal(perTransferCap({ isKingfish: false, isFullyUnrestricted: false, maxTransferVip: 500, amount: 501 }).ok, false);
    });
    test('isFullyUnrestricted and isKingfish skip the per-transfer cap entirely', () => {
        assert.equal(perTransferCap({ isKingfish: false, isFullyUnrestricted: true, maxTransferVip: 100, amount: 999999 }).ok, true);
        assert.equal(perTransferCap({ isKingfish: true, isFullyUnrestricted: false, maxTransferVip: 100, amount: 999999 }).ok, true);
    });
});

describe('trust ladder (handler :306-320)', () => {
    test('brand new unpaid account is restricted and hard-blocked', () => {
        const s = trustState({ senderAgeDays: 3 });
        assert.deepEqual(s, { hasPaid: false, isPostPurchaseCooldown: false, isFreshPaid: false, isGraduated: false, isFullyUnrestricted: false });
        const b = newUserBlock({ isKingfish: false, hasPaid: s.hasPaid, senderAgeDays: 3 });
        assert.equal(b.ok, false);
        assert.equal(b.daysRemaining, 27);
    });
    test('day 29.5 is still blocked, day 30 is not', () => {
        assert.equal(newUserBlock({ isKingfish: false, hasPaid: false, senderAgeDays: 29.5 }).ok, false);
        assert.equal(newUserBlock({ isKingfish: false, hasPaid: false, senderAgeDays: 30 }).ok, true);
    });
    test('ANY completed purchase lifts the 30-day block immediately (hasPaid, not isFreshPaid)', () => {
        // handler :325 tests `!hasPaid`, so a purchase 1 minute old unblocks a 1-day-old account.
        const s = trustState({ senderAgeDays: 1, firstPurchaseAgeDays: 0.001 });
        assert.equal(s.hasPaid, true);
        assert.equal(s.isFreshPaid, true);
        assert.equal(s.isFullyUnrestricted, false);
        assert.equal(newUserBlock({ isKingfish: false, hasPaid: true, senderAgeDays: 1 }).ok, true);
        // ...but the 500/24h fresh-paid cap then applies.
        assert.equal(freshPaidCap({ isKingfish: false, isFreshPaid: true, sent24h: 450, amount: 51 }).ok, false);
        assert.equal(freshPaidCap({ isKingfish: false, isFreshPaid: true, sent24h: 450, amount: 50 }).ok, true);
    });
    test('7 days after first purchase every JS gate is skipped', () => {
        const s = trustState({ senderAgeDays: 8, firstPurchaseAgeDays: 7 });
        assert.equal(s.isPostPurchaseCooldown, true);
        assert.equal(s.isFullyUnrestricted, true);
        assert.equal(s.isGraduated, false);
    });
    test('120 days unflagged also unrestricts; flagged never does', () => {
        assert.equal(trustState({ senderAgeDays: 120 }).isFullyUnrestricted, true);
        assert.equal(trustState({ senderAgeDays: 500, isFarmingFlagged: true }).isFullyUnrestricted, false);
        assert.equal(trustState({ senderAgeDays: 500, firstPurchaseAgeDays: 400, isFarmingFlagged: true }).isFullyUnrestricted, false);
    });
});

describe('source-tier 30-day cap (handler :404-448)', () => {
    const base = { isKingfish: false, isFullyUnrestricted: false, isGraduated: false };
    test('free/earned pool caps at 100 per 30 days', () => {
        const r = sourceTierCap({ ...base, alreadySent30Day: 60, ipAlreadySent30Day: 0, purchasedWonAvailable: 0, amount: 50 });
        assert.equal(r.ok, false);
        assert.equal(r.cap, FREE_EARNED_30DAY_LIMIT);
        assert.equal(r.capType, 'free/earned');
    });
    test('purchased/won pool caps at 500 per 30 days', () => {
        const ok = sourceTierCap({ ...base, alreadySent30Day: 400, ipAlreadySent30Day: 0, purchasedWonAvailable: 10000, amount: 100 });
        assert.equal(ok.ok, true);
        assert.equal(ok.cap, PURCHASED_WON_30DAY_LIMIT);
        const bad = sourceTierCap({ ...base, alreadySent30Day: 450, ipAlreadySent30Day: 0, purchasedWonAvailable: 10000, amount: 51 });
        assert.equal(bad.ok, false);
    });
    test('the IP-wide total is used when it exceeds the account total (alt-account defence)', () => {
        const r = sourceTierCap({ ...base, alreadySent30Day: 0, ipAlreadySent30Day: 95, purchasedWonAvailable: 0, amount: 10 });
        assert.equal(r.effectiveAlreadySent, 95);
        assert.equal(r.ok, false);
    });
    test('graduated / unrestricted / kingfish skip it', () => {
        assert.equal(sourceTierCap({ ...base, isGraduated: true, alreadySent30Day: 10 ** 6, ipAlreadySent30Day: 0, purchasedWonAvailable: 0, amount: 10 ** 6 }).ok, true);
        assert.equal(sourceTierCap({ ...base, isKingfish: true, alreadySent30Day: 10 ** 6, ipAlreadySent30Day: 0, purchasedWonAvailable: 0, amount: 10 ** 6 }).ok, true);
    });
    test('DEFECT: the pool is chosen by AVAILABILITY, not by what is actually spent', () => {
        // purchasedWonAvailable >= amount picks the 500 cap even though the debit
        // comes out of one undifferentiated profiles.diamonds balance. A user with
        // 1 purchased diamond-batch can send 500 of their FREE diamonds.
        const r = sourceTierCap({ ...base, alreadySent30Day: 0, ipAlreadySent30Day: 0, purchasedWonAvailable: 100, amount: 100 });
        assert.equal(r.cap, PURCHASED_WON_30DAY_LIMIT);
        assert.equal(r.capType, 'purchased/won');
    });
});

describe('per-recipient and inbound caps (handler :475-527)', () => {
    test('200 per 30 days to the same friend', () => {
        assert.equal(perRecipientCap({ isKingfish: false, isFullyUnrestricted: false, recipientTotal30Day: 150, amount: 51 }).ok, false);
        assert.equal(perRecipientCap({ isKingfish: false, isFullyUnrestricted: false, recipientTotal30Day: 150, amount: 50 }).ok, true);
    });
    test('per-recipient cap is skipped for unrestricted senders', () => {
        assert.equal(perRecipientCap({ isKingfish: false, isFullyUnrestricted: true, recipientTotal30Day: 10 ** 9, amount: 10 ** 6 }).ok, true);
    });
    test('inbound 1000/30d is measured on the RECIPIENT and only kingfish skips it', () => {
        assert.equal(recipientReceiveCap({ isKingfish: false, recipientReceiveTotal: 999, amount: 2 }).ok, false);
        assert.equal(recipientReceiveCap({ isKingfish: false, recipientReceiveTotal: 999, amount: 1 }).ok, true);
        // note: isFullyUnrestricted is NOT consulted here (handler :517) — correct,
        // the cap protects the receiver, not the sender.
        assert.equal(recipientReceiveCap({ isKingfish: true, recipientReceiveTotal: 10 ** 9, amount: 10 ** 6 }).ok, true);
    });
});

describe('DB trigger caps — sender-side only (migration 20260517000001:78-320)', () => {
    const me = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const them = '11111111-2222-3333-4444-555555555555';
    const base = { senderId: me, recipientId: them, accountAgeDays: 45, daysSincePurchase: null };
    test('per-pair 5,000 / 24h', () => {
        assert.equal(dbGiftCapCheck({ ...base, amount: 1, pair24h: 5000 }).code, 'pair_24h_cap');
        assert.equal(dbGiftCapCheck({ ...base, amount: 2000, pair24h: 3000 }).allowed, true);   // exactly 5000
        assert.equal(dbGiftCapCheck({ ...base, amount: 2000, pair24h: 3001 }).code, 'pair_24h_cap');
    });
    test('the 2,000/60s burst cap makes the 5,000 pair cap unreachable in one transfer', () => {
        // Any single transfer > 2,000 dies on burst_cap first, so the pair cap can
        // only ever be consumed 2,000 at a time, one minute apart (handler :547
        // also passes a 60s in-lock cooldown to deduct_diamonds).
        assert.equal(dbGiftCapCheck({ ...base, amount: 5000, pair24h: 0 }).code, 'burst_cap');
        assert.equal(dbGiftCapCheck({ ...base, amount: 2001, pair24h: 0 }).code, 'burst_cap');
        assert.equal(dbGiftCapCheck({ ...base, amount: 2000, pair24h: 0 }).allowed, true);
    });
    test('per-user 50,000 / 24h', () => {
        assert.equal(dbGiftCapCheck({ ...base, amount: 1, pair24h: 0, total24h: 50000 }).code, 'user_24h_cap');
        assert.equal(dbGiftCapCheck({ ...base, amount: 100, pair24h: 0, total24h: 49900 }).allowed, true);
    });
    test('burst 2,000 / 60s', () => {
        assert.equal(dbGiftCapCheck({ ...base, amount: 1, burst60s: 2000 }).code, 'burst_cap');
        assert.equal(dbGiftCapCheck({ ...base, amount: 2000, burst60s: 0 }).allowed, true);
        assert.equal(dbGiftCapCheck({ ...base, amount: 2001, burst60s: 0 }).code, 'burst_cap');
    });
    test('caps are evaluated in pair -> user -> burst order', () => {
        const r = dbGiftCapCheck({ ...base, amount: 100, pair24h: 4999, total24h: 49999, burst60s: 1999 });
        assert.equal(r.code, 'pair_24h_cap');
    });
    test('min account age 30 days is enforced in the DB too, for unpaid accounts', () => {
        assert.equal(dbGiftCapCheck({ ...base, accountAgeDays: 29, amount: 10 }).code, 'new_user_block');
        assert.equal(dbGiftCapCheck({ ...base, accountAgeDays: 30, amount: 10 }).allowed, true);
    });
    test('DEFECT: the 7-day-post-purchase bypass short-circuits ALL THREE caps', () => {
        // migration :182-189 returns allowed:true BEFORE pair/user/burst are read.
        const r = dbGiftCapCheck({ ...base, daysSincePurchase: 7, amount: 1000000,
                                   pair24h: 10 ** 9, total24h: 10 ** 9, burst60s: 10 ** 9 });
        assert.equal(r.allowed, true);
        assert.equal(r.reason, 'trusted_purchaser_7d_bypass');
    });
    test('DEFECT: 120-day unflagged accounts also bypass all three caps', () => {
        const r = dbGiftCapCheck({ ...base, accountAgeDays: 120, amount: 10 ** 6, pair24h: 10 ** 9 });
        assert.equal(r.allowed, true);
        assert.equal(r.reason, 'trusted_120d_unflagged_bypass');
    });
    test('a flagged account falls straight through to the hard caps', () => {
        const r = dbGiftCapCheck({ ...base, isFarmingFlagged: true, accountAgeDays: 900, daysSincePurchase: 900, amount: 1, pair24h: 5000 });
        assert.equal(r.code, 'pair_24h_cap');
    });
    test('zero / negative amounts are rejected by the DB layer as invalid_args', () => {
        assert.equal(dbGiftCapCheck({ ...base, amount: 0 }).code, 'invalid_args');
        assert.equal(dbGiftCapCheck({ ...base, amount: -500 }).code, 'invalid_args');
    });
});

describe('debit / credit symmetry — the core money invariant', () => {
    test('happy path: debit === credit, both ledger rows agree, no diamonds created', () => {
        const r = settleTransfer({ amount: 250, senderBalance: 1000, recipientBalance: 40 });
        assert.equal(r.moved, true);
        assert.equal(r.debited, 250);
        assert.equal(r.credited, 250);
        assert.equal(r.minted, 0);
        assert.equal(r.senderBalance, 750);
        assert.equal(r.recipientBalance, 290);
        assert.equal(r.senderLedger.amount + r.recipientLedger.amount, 0, 'ledger must be zero-sum');
        assert.equal(r.senderLedger.transaction_type, 'diamond_gift_sent');
        assert.equal(r.recipientLedger.transaction_type, 'diamond_gift_received');
    });
    test('conservation of diamonds across many amounts', () => {
        for (const amt of [10, 11, 37, 99, 100, 499, 500, 4999]) {
            const r = settleTransfer({ amount: amt, senderBalance: 100000, recipientBalance: 0 });
            assert.equal(r.senderBalance + r.recipientBalance, 100000, `broke at amount=${amt}`);
        }
    });
    test('CRITICAL DEFECT: recipient diamond_multiplier MINTS diamonds on every gift', () => {
        // add_diamonds_to_balance multiplies any positive credit whose p_type is not
        // in ('purchase','deduction','adjustment','refund','transfer').
        // 'diamond_gift_received' is not on that list, and diamond_multiplier reaches
        // 2.00 via share streaks (20260506112000_fix_share_streak_cst_anchor.sql:68-72).
        assert.equal(MULTIPLIER_EXEMPT_TYPES.includes('diamond_gift_received'), false);
        const r = settleTransfer({ amount: 100, senderBalance: 1000, recipientBalance: 0, recipientMultiplier: 2.0 });
        assert.equal(r.debited, 100);
        assert.equal(r.credited, 200);
        assert.equal(r.minted, 100, '100 diamonds ($1.00) created out of nothing');
        assert.notEqual(r.senderBalance + r.recipientBalance, 1000);
    });
    test('CRITICAL DEFECT: every multiplier tier inflates the credit', () => {
        for (const [mult, expected] of [[1.0, 100], [1.2, 120], [1.5, 150], [1.75, 175], [2.0, 200]]) {
            const c = creditDecision({ balance: 0, amount: 100, type: 'diamond_gift_received', multiplier: mult });
            assert.equal(c.actual_amount, expected, `multiplier ${mult}`);
        }
    });
    test('CRITICAL DEFECT: the ROLLBACK refund is multiplied too', () => {
        // handler :615-627 calls add_diamonds_to_balance with p_type 'diamond_gift_refund',
        // which is likewise not on the exemption list.
        assert.equal(MULTIPLIER_EXEMPT_TYPES.includes('diamond_gift_refund'), false);
        const refund = creditDecision({ balance: 900, amount: 100, type: 'diamond_gift_refund', multiplier: 2.0 });
        assert.equal(refund.actual_amount, 200);
        assert.equal(refund.new_balance, 1100, 'sender ends 100 diamonds RICHER than before the failed transfer');
    });
    test('a credit type on the exemption list is NOT multiplied (control)', () => {
        for (const t of MULTIPLIER_EXEMPT_TYPES) {
            assert.equal(creditDecision({ balance: 0, amount: 100, type: t, multiplier: 2.0 }).actual_amount, 100);
        }
    });
});

describe('refund on failed credit (handler :613-643)', () => {
    test('credit failure triggers a compensating refund and the sender is made whole', () => {
        const d = deductDecision({ balance: 1000, amount: 100 });
        assert.equal(d.balance, 900);
        const c = creditDecision({ balance: 0, amount: 100, type: 'diamond_gift_received', profileExists: false });
        assert.equal(c.success, false);
        const outcome = creditOutcome({ creditErr: null, creditResult: c });
        assert.equal(outcome.action, 'refund_and_500');
        const refund = creditDecision({ balance: d.balance, amount: 100, type: 'diamond_gift_refund' });
        assert.equal(refund.new_balance, 1000);
    });
    test('a transport-level creditErr also triggers the refund', () => {
        assert.equal(creditOutcome({ creditErr: { message: 'timeout' }, creditResult: null }).action, 'refund_and_500');
    });
    test('DEFECT: a duplicate reference_id is treated as SUCCESS with no refund', () => {
        // handler :638 excludes `duplicate` from the rollback condition and :645
        // logs "idempotent retry". add_diamonds_to_balance :35-46 returns
        // duplicate:true WITHOUT crediting anybody — so the sender stays debited
        // and the recipient never receives the diamonds.
        const c = creditDecision({ balance: 0, amount: 100, type: 'diamond_gift_received', referenceIdAlreadyUsed: true });
        assert.equal(c.success, false);
        assert.equal(c.duplicate, true);
        assert.equal(creditOutcome({ creditErr: null, creditResult: c }).action, 'treat_as_success_no_refund');
    });
    test('DEFECT: the refund RPC result is never inspected (handler :617-623)', () => {
        // The route awaits add_diamonds_to_balance and discards the return value,
        // so a returned {success:false} refund is indistinguishable from a real one
        // while the client is told "your diamonds have been restored".
        const failedRefund = creditDecision({ balance: 900, amount: 100, type: 'diamond_gift_refund', profileExists: false });
        assert.equal(failedRefund.success, false);
        const whatTheRouteReportsToTheUser = 'Transfer failed — your diamonds have been restored';
        const actualSenderBalance = 900; // still short 100
        assert.equal(actualSenderBalance, 900);
        assert.ok(whatTheRouteReportsToTheUser.includes('restored'));
    });
});

describe('double-submit / concurrency (deduct_diamonds :41-94)', () => {
    test('two concurrent identical requests: only the first debits', () => {
        // Both requests read the same pre-state and pass every JS gate, then both
        // call deduct_diamonds. The FOR UPDATE row lock serialises them and the
        // in-lock cooldown EXISTS check aborts the loser.
        const first = deductDecision({ balance: 1000, amount: 100, secondsSinceLastGiftSent: Infinity });
        assert.equal(first.success, true);
        assert.equal(first.balance, 900);
        const second = deductDecision({ balance: 900, amount: 100, secondsSinceLastGiftSent: 0 });
        assert.equal(second.success, false);
        assert.equal(second.cooldown_active, true);
        assert.equal(900, first.balance, 'balance moved exactly once');
    });
    test('the 60s in-lock cooldown boundary', () => {
        assert.equal(deductDecision({ balance: 1000, amount: 10, secondsSinceLastGiftSent: 60 }).success, false);
        assert.equal(deductDecision({ balance: 1000, amount: 10, secondsSinceLastGiftSent: 61 }).success, true);
    });
    test('DEFECT: the cooldown is the ONLY double-submit defence — reference_id is fresh per request', () => {
        // handler :530 does `const transferId = randomUUID()` per invocation, so two
        // submits of the same click carry different reference_ids and the RPC-level
        // idempotency guard can never match. If p_cooldown_seconds were ever 0 or the
        // sender's prior gift aged past 60s, both would debit.
        const a = deductDecision({ balance: 1000, amount: 100, cooldownSeconds: 0, secondsSinceLastGiftSent: 0 });
        const b = deductDecision({ balance: a.balance, amount: 100, cooldownSeconds: 0, secondsSinceLastGiftSent: 0 });
        assert.equal(a.success, true);
        assert.equal(b.success, true);
        assert.equal(b.balance, 800, 'both debited — no idempotency key protects this');
    });
    test('a genuine idempotent replay (same reference_id) does not double-debit', () => {
        const replay = deductDecision({ balance: 900, amount: 100, hasPriorRowWithSameReference: true });
        assert.equal(replay.success, true);
        assert.equal(replay.idempotent, true);
        assert.equal(replay.balance, 900, 'balance untouched');
    });
});

describe('ledger rows render in the wallet UI (DiamondWalletModal.jsx:68-120)', () => {
    test('both sides of a transfer have a TX_TYPES entry (no grey "Adjustment")', () => {
        const r = settleTransfer({ amount: 100, senderBalance: 500, recipientBalance: 0 });
        assert.ok(WALLET_TX_TYPE_KEYS.has(r.senderLedger.transaction_type));
        assert.ok(WALLET_TX_TYPE_KEYS.has(r.recipientLedger.transaction_type));
    });
    test('the refund type also renders', () => {
        assert.ok(WALLET_TX_TYPE_KEYS.has('diamond_gift_refund'));
    });
    test('sender row is negative, recipient row is positive', () => {
        const r = settleTransfer({ amount: 75, senderBalance: 500, recipientBalance: 0 });
        assert.ok(r.senderLedger.amount < 0);
        assert.ok(r.recipientLedger.amount > 0);
        assert.equal(Math.abs(r.senderLedger.amount), r.recipientLedger.amount);
    });
});

describe('full gate ordering — nothing moves money before every check runs', () => {
    const me = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const them = '11111111-2222-3333-4444-555555555555';

    /** Runs the gates in the same order as the handler and reports where it stopped. */
    function runGates(ctx) {
        const a = parseAmount(ctx.rawAmount);                              if (!a.ok) return 'amount';        // :238
        const v = validateRecipient(ctx.userId, ctx.recipientId);          if (!v.ok) return 'recipient';     // :235/:243
        if (!ctx.friendship) return 'friendship';                                                             // :256
        const p = requireBothProfiles(ctx.profiles, ctx.userId, ctx.recipientId); if (!p.ok) return 'profiles'; // :277
        const t = trustState(ctx);
        if (!newUserBlock({ isKingfish: false, hasPaid: t.hasPaid, senderAgeDays: ctx.senderAgeDays }).ok) return 'new_user_block'; // :325
        if (!freshPaidCap({ isKingfish: false, isFreshPaid: t.isFreshPaid, sent24h: ctx.sent24h ?? 0, amount: a.amount }).ok) return 'fresh_paid'; // :347
        if (!recipientAgeGate({ isKingfish: false, recipientAgeDays: ctx.recipientAgeDays }).ok) return 'recipient_age'; // :367
        const ft = friendshipTier(ctx.friendshipAgeDays ?? 0);
        if (!perTransferCap({ isKingfish: false, isFullyUnrestricted: t.isFullyUnrestricted, maxTransferVip: ft.maxTransferVip, amount: a.amount }).ok) return 'per_transfer'; // :372
        if (!balanceCheck({ balance: p.sender.diamonds, amount: a.amount }).ok) return 'balance';              // :382
        if (!sourceTierCap({ isKingfish: false, isFullyUnrestricted: t.isFullyUnrestricted, isGraduated: t.isGraduated,
                             alreadySent30Day: ctx.alreadySent30Day ?? 0, ipAlreadySent30Day: ctx.ipAlreadySent30Day ?? 0,
                             purchasedWonAvailable: ctx.purchasedWonAvailable ?? 0, amount: a.amount }).ok) return 'source_tier'; // :433
        if (!perRecipientCap({ isKingfish: false, isFullyUnrestricted: t.isFullyUnrestricted, recipientTotal30Day: ctx.recipientTotal30Day ?? 0, amount: a.amount }).ok) return 'per_recipient'; // :483
        if (!recipientReceiveCap({ isKingfish: false, recipientReceiveTotal: ctx.recipientReceiveTotal ?? 0, amount: a.amount }).ok) return 'inbound'; // :517
        const db = dbGiftCapCheck({ senderId: ctx.userId, recipientId: ctx.recipientId, amount: a.amount,
                                    accountAgeDays: ctx.senderAgeDays, daysSincePurchase: ctx.firstPurchaseAgeDays ?? null,
                                    pair24h: ctx.pair24h ?? 0, total24h: ctx.total24h ?? 0, burst60s: ctx.burst60s ?? 0 });
        if (!db.allowed) return `db:${db.code}`;                                                              // trigger, inside deduct_diamonds
        return 'DEBIT';
    }

    const good = {
        userId: me, recipientId: them, rawAmount: 50, friendship: true,
        profiles: [{ id: me, diamonds: 10000 }, { id: them, diamonds: 0 }],
        senderAgeDays: 45, recipientAgeDays: 30, friendshipAgeDays: 10,
        alreadySent30Day: 0, ipAlreadySent30Day: 0, purchasedWonAvailable: 0,
        recipientTotal30Day: 0, recipientReceiveTotal: 0,
    };

    test('a fully valid transfer reaches the debit', () => {
        assert.equal(runGates(good), 'DEBIT');
    });
    test('every rejection happens strictly before the debit', () => {
        const cases = [
            ['amount',          { rawAmount: 0 }],
            ['amount',          { rawAmount: -50 }],
            ['amount',          { rawAmount: 9 }],
            ['amount',          { rawAmount: 'x' }],
            ['recipient',       { recipientId: 'not-a-uuid' }],
            ['recipient',       { recipientId: me }],
            ['friendship',      { friendship: false }],
            ['profiles',        { profiles: [{ id: me, diamonds: 10000 }] }],
            ['new_user_block',  { senderAgeDays: 5 }],
            ['recipient_age',   { recipientAgeDays: 6 }],
            ['per_transfer',    { rawAmount: 101 }],
            ['balance',         { rawAmount: 100, profiles: [{ id: me, diamonds: 99 }, { id: them, diamonds: 0 }] }],
            ['source_tier',     { alreadySent30Day: 99 }],
            ['per_recipient',   { rawAmount: 100, recipientTotal30Day: 150 }],
            ['inbound',         { recipientReceiveTotal: 999 }],
            ['db:pair_24h_cap', { rawAmount: 100, senderAgeDays: 45, purchasedWonAvailable: 10 ** 6, pair24h: 4999 }],
            ['db:burst_cap',    { rawAmount: 100, senderAgeDays: 45, purchasedWonAvailable: 10 ** 6, burst60s: 1999 }],
        ];
        for (const [expected, patch] of cases) {
            assert.equal(runGates({ ...good, ...patch }), expected, `patch ${JSON.stringify(patch)}`);
        }
    });
    test('DEFECT: a 7-day-post-purchase sender skips 6 of the JS gates in one step', () => {
        const skipper = { ...good, senderAgeDays: 8, firstPurchaseAgeDays: 7,
                          rawAmount: 900, recipientTotal30Day: 10 ** 6, alreadySent30Day: 10 ** 6,
                          pair24h: 10 ** 6, total24h: 10 ** 6, burst60s: 10 ** 6 };
        // 8 days old, 900 diamonds in one shot, 1,000,000 already sent this month,
        // 1,000,000 already sent to THIS friend today — and it still reaches the debit.
        assert.equal(runGates(skipper), 'DEBIT');
        // The inbound recipient cap is the only gate left standing.
        assert.equal(runGates({ ...skipper, recipientReceiveTotal: 101 }), 'inbound');
    });
});

describe('constants match the documented economy', () => {
    test('caps are the values the audit and the popups quote', () => {
        assert.equal(CAP_PER_PAIR_24H, 5000);
        assert.equal(CAP_PER_USER_24H, 50000);
        assert.equal(CAP_BURST_60S, 2000);
        assert.equal(NEW_USER_BLOCK_DAYS, 30);
        assert.equal(RECIPIENT_DAILY_RECEIVE_LIMIT, 1000);
        assert.equal(COOLDOWN_SECONDS, 60);
        assert.equal(PER_RECIPIENT_COOLDOWN_SECONDS, 300);
    });
    test('1 diamond = $0.01, so the mint defect is priced correctly', () => {
        const CENTS_PER_DIAMOND = 1;
        const r = settleTransfer({ amount: 5000, senderBalance: 10 ** 6, recipientBalance: 0, recipientMultiplier: 2.0 });
        assert.equal(r.minted * CENTS_PER_DIAMOND / 100, 50, '$50.00 created by one max-pair transfer at 2x');
    });
});
