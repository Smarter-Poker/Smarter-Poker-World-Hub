/**
 * WELCOME PACKAGE: who has already been paid.
 * ═══════════════════════════════════════════════════════════════════════════
 * Until 2026-10-08T04:09:38Z (migration 20261007220628) every account was
 * paid the welcome package at birth: handle_new_user minted 500 under
 * signup:<id> (from 2026-09-08), earlier seeders registered seed:<id> or
 * wrote a signup_bonus row, and accounts older than the Mint register
 * (2026-09-03) were simply born holding the balance with no record at all.
 *
 * Since then the package is earned by verifying a phone. fn_ca_mint's replay
 * check only sees its own op claim (signup:<id>), so on its own it would pay
 * a second 500 to any older account paid by one of the earlier paths. This
 * module is the one place that answers "was this account already paid":
 *
 *   - created before the Mint register existed (2026-09-03T01:53:41Z):
 *     paid at birth with no record, so the record cannot be consulted
 *   - a signup: or seed: register row   -> paid
 *   - a signup_bonus / signup:<id> row  -> paid
 *   - otherwise unpaid. From the register's start the register is the
 *     authority: 114 accounts created 2026-09-03..10-08 carry no record
 *     because the old birth grant was refused (issuance freeze), and they
 *     are owed the package once they verify.
 *
 * Fail CLOSED: a read error answers "paid" so no money moves on a guess; the
 * caller reports it and the ensure-profile re-ask retries on a later login.
 */
export const WELCOME_PACKAGE_EARNED_SINCE = '2026-10-08T04:09:38Z';
export const MINT_REGISTER_STARTED = '2026-09-03T01:53:41Z';

export async function welcomePackageAlreadyPaid(supabase, userId, createdAt) {
    const created = createdAt ? Date.parse(createdAt) : NaN;
    if (!Number.isFinite(created) || created < Date.parse(MINT_REGISTER_STARTED)) {
        return { paid: true, reason: 'paid_at_birth' };
    }
    const [{ data: reg, error: regErr }, { data: txn, error: txnErr }] = await Promise.all([
        supabase.from('ca_mint_ledger').select('op_id')
            .in('op_id', [`signup:${userId}`, `seed:${userId}`]).limit(1),
        supabase.from('diamond_transactions').select('id')
            .eq('user_id', userId)
            .or(`transaction_type.eq.signup_bonus,reference_id.eq.signup:${userId}`)
            .limit(1),
    ]);
    if (regErr || txnErr) return { paid: true, reason: 'unknown', error: (regErr || txnErr).message };
    if ((reg?.length ?? 0) > 0 || (txn?.length ?? 0) > 0) return { paid: true, reason: 'recorded' };
    return { paid: false };
}
