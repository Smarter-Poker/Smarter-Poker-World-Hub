#!/usr/bin/env node
/**
 * scripts/check-unchecked-money-rpc.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 * RATCHET: money RPCs whose {success:false} return value is never read.
 *
 * DISTINCT FROM scripts/check-swallowed-money-errors.mjs. That one catches a
 * Supabase *error* that is logged and ignored. This one catches the opposite
 * and more dangerous shape: the call SUCCEEDS at the transport level, the
 * function returns {success:false, error:'...'}, and the caller only ever
 * inspects the transport error — which is null. The failure is invisible and
 * execution continues as though the money moved.
 *
 * This is not theoretical. On 2026-08-19 it was a live free-item exploit in
 * /api/club-arena/marketplace-purchase:
 *
 *     const { error: deductErr } = await sb.rpc('fn_debit_chips', {...});
 *     if (deductErr) { ...  }        // null when the debit was REJECTED
 *     // -> purchase inserted, trigger delivers the item, no chips taken
 *
 * Under concurrency N buyers read the same balance, one debit lands, the rest
 * return {success:false} silently, and N items ship for one payment. It was
 * masked for a year by a unique index that happened to fail the losers'
 * inserts; the moment stackable items were exempted from that index, it became
 * exploitable.
 *
 * The 28 functions below all RETURN a success flag rather than raising —
 * enumerated from pg_proc, not guessed:
 *   select proname from pg_proc
 *    where prokind='f' and pg_get_functiondef(oid) like '%''success'', false%';
 *
 * BASELINE is frozen. New violations fail the build; paying debt down means
 * lowering BASELINE in the same commit, which is what makes a ratchet tighten
 * rather than drift.
 *
 * Exit 0 = at or below baseline. Exit 1 = a new violation was added.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

// Lower this when you fix call sites. Never raise it.
const BASELINE = 30;

const MONEY_FNS = new Set([
    'add_diamonds_to_balance', 'award_diamonds', 'award_diamonds_v2', 'bbj_promo_payout',
    'deduct_diamonds', 'fn_add_prepaid_credit_atomic', 'fn_admin_remove_player_chips',
    'fn_apply_credit_payment', 'fn_bbj_payout', 'fn_bbj_promo_payout_atomic',
    'fn_clawback_chips_atomic', 'fn_credit_chips', 'fn_credit_treasury', 'fn_debit_chips',
    'fn_debit_treasury', 'fn_generate_credit_invoice', 'fn_purchase_chips',
    'fn_purchase_club_chips', 'fn_transfer_chips', 'fn_trivia_award_diamonds',
    'fn_trivia_tournament_payout', 'fn_union_bbj_pool_payout', 'fn_union_credit_wallet',
    'fn_union_debit_wallet', 'fn_union_move_rake_to_chips_atomic', 'mint_club_chips',
    'mint_club_promo', 'send_wallet_diamond_transfer',
]);

const ROOTS = ['pages', 'src', 'scripts'];
const SKIP = ['node_modules', '.next', 'public/hub/club-arena/assets', '__tests__', `tests${path.sep}`];
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const CALL = /\.rpc\(\s*['"]([a-z0-9_]+)['"]/gi;
/** How far ahead of the call to look for a success check. */
const WINDOW = 25;

function* walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (SKIP.some((s) => p.includes(s))) continue;
        if (e.isDirectory()) yield* walk(p);
        else if (EXT.has(path.extname(e.name))) yield p;
    }
}

const violations = [];

for (const root of ROOTS) {
    for (const file of walk(root)) {
        let src;
        try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
        if (!src.includes('.rpc(')) continue;
        const lines = src.split('\n');

        for (const m of src.matchAll(CALL)) {
            const fn = m[1];
            if (!MONEY_FNS.has(fn)) continue;

            const idx = src.slice(0, m.index).split('\n').length - 1;
            const raw = (lines[idx] || '').trim();
            // Documentation, not a call site.
            if (/^(\*|\/\/|\/\*|#)/.test(raw)) continue;

            const window = lines.slice(idx, idx + WINDOW).join('\n');
            const checksSuccess = /\.success\b|\['success'\]|"success"|\?\.success/.test(window);
            if (checksSuccess) continue;

            violations.push({ file, line: idx + 1, fn, raw: raw.slice(0, 120) });
        }
    }
}

const count = violations.length;
const byFile = violations.reduce((acc, v) => {
    (acc[v.file] ||= []).push(v);
    return acc;
}, {});

console.log('[unchecked-money-rpc] money RPCs whose {success:false} is never read');
console.log(`[unchecked-money-rpc] found ${count}, baseline ${BASELINE}`);

// `--list` prints the outstanding debt so the next agent paying it down can see
// what is left without re-deriving it. Silent by default so CI output stays terse.
if (process.argv.includes('--list')) {
    console.log('');
    for (const [file, vs] of Object.entries(byFile).sort()) {
        console.log(`  ${file}`);
        for (const v of vs) console.log(`    :${v.line}  ${v.fn}`);
    }
    console.log('');
}

if (count > BASELINE) {
    console.error('');
    console.error(`::error::${count - BASELINE} NEW unchecked money-RPC call site(s).`);
    console.error('');
    console.error('These functions RETURN {success:false} instead of raising, so checking');
    console.error('only the Supabase error lets a REJECTED debit/credit look like it worked:');
    console.error('');
    console.error("    const { data, error } = await sb.rpc('fn_debit_chips', {...});");
    console.error('    if (error) throw error;');
    console.error("    if (!data?.success) { /* handle the refusal */ }   // <-- required");
    console.error('');
    for (const [file, vs] of Object.entries(byFile)) {
        console.error(`  ${file}`);
        for (const v of vs) console.error(`    ${v.line}: ${v.fn}  ${v.raw}`);
    }
    process.exit(1);
}

if (count < BASELINE) {
    console.log('');
    console.log(`[unchecked-money-rpc] ${BASELINE - count} fewer than baseline — lower BASELINE to ${count} in this commit to lock the gain in.`);
}

console.log('[unchecked-money-rpc] OK');
process.exit(0);
