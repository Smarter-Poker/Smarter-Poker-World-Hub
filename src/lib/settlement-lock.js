/**
 * Settlement Lock Checker
 *
 * Import this in ANY API that moves chips (buyin, cashout, distribute, send, etc.)
 * Call checkSettlementLock(clubId) before processing any chip transaction.
 *
 * During Monday 4:00-4:10 AM CST, all chip operations are frozen for settlement.
 *
 * Usage:
 *   import { checkSettlementLock } from '../lib/settlement-lock';
 *
 *   // At the top of your handler:
 *   const lockCheck = await checkSettlementLock(supabase, clubId);
 *   if (lockCheck.locked) {
 *     return res.status(423).json({
 *       error: 'Club is temporarily locked for weekly settlement',
 *       locked: true,
 *       unlock_at: lockCheck.unlock_at,
 *       reason: lockCheck.reason,
 *     });
 *   }
 */

/**
 * Check if a club is currently locked for settlement
 * @param {Object} supabase - Supabase admin client
 * @param {number|string} clubId - Club ID to check
 * @returns {{ locked: boolean, unlock_at?: string, reason?: string }}
 */
export async function checkSettlementLock(supabase, clubId) {
  try {
    // Fast check on clubs table first (indexed, no join)
    const { data: club } = await supabase
      .from('clubs')
      .select('settlement_locked, settlement_locked_until')
      .eq('id', clubId)
      .maybeSingle();

    if (!club?.settlement_locked) {
      return { locked: false };
    }

    // Verify lock hasn't expired
    const unlockTime = new Date(club.settlement_locked_until);
    if (unlockTime <= new Date()) {
      // Lock expired — clear it
      const { error: unlockErr } = await supabase
        .from('clubs')
        .update({ settlement_locked: false, settlement_locked_until: null })
        .eq('id', clubId);
      if (unlockErr) console.error('[SettlementLock] Club unlock failed:', unlockErr.message);

      // Also deactivate settlement_locks record
      const { error: lockErr } = await supabase
        .from('settlement_locks')
        .update({ is_active: false, unlocked_at: new Date().toISOString() })
        .eq('club_id', clubId)
        .eq('is_active', true);
      if (lockErr) console.error('[SettlementLock] Lock deactivation failed:', lockErr.message);

      return { locked: false };
    }

    // Get the lock details
    const { data: lock } = await supabase
      .from('settlement_locks')
      .select('lock_reason, unlock_at')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .maybeSingle();

    return {
      locked: true,
      unlock_at: lock?.unlock_at || club.settlement_locked_until,
      reason: lock?.lock_reason || 'Weekly auto-settlement in progress. Operations resume at 4:10 AM CST.',
    };

  } catch (err) {
    // On error, don't block operations
    console.error('[settlement-lock] Check error:', err.message);
    return { locked: false };
  }
}

/**
 * HTTP 423 response helper for locked clubs
 * @param {Object} res - Next.js response object
 * @param {Object} lockCheck - Result from checkSettlementLock
 */
export function sendLockedResponse(res, lockCheck) {
  return res.status(423).json({
    error: 'Club is temporarily locked for weekly settlement',
    locked: true,
    unlock_at: lockCheck.unlock_at,
    reason: lockCheck.reason,
    message: '⏳ Weekly settlement is processing. All send, receive, buy-in, and cashout operations will resume at 4:10 AM CST.',
  });
}
