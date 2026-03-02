/**
 * ChipBridge — Connects the poker engine to Club Arena's chip economy
 * ═══════════════════════════════════════════════════════════════════
 *
 * Used by:
 *   - /api/poker/engine/seat.js (lock/unlock/rebuy on sit/stand/add)
 *   - LobbyManager.js (rake recording after each hand, auto-unlock safety net)
 *
 * All chip lock/unlock operations use ATOMIC Supabase RPCs with
 * FOR UPDATE row locking — no race conditions possible.
 *
 * Non-club tables (clubId is null) skip all chip operations.
 *
 * CHANGE LOG:
 *   2026-03-01: Rewrote lock/unlock to use lock_chips_for_table /
 *               unlock_chips_from_table RPCs. Eliminates table_chip_locks
 *               table dependency and race conditions (CRIT-1 + CRIT-3 fix).
 */

const { createClient } = require('@supabase/supabase-js');

let _supabaseAdmin = null;

function getSupabase() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabaseAdmin;
}

// ═══════════════════════════════════════════════════════════════
// In-memory tracking of which player/table combos have active locks.
// Used by LobbyManager auto-unlock safety net to avoid double-unlock.
// Keyed by `${tableId}:${userId}` → { amount, lockedAt }
// ═══════════════════════════════════════════════════════════════
const _activeLocks = new Map();

function _lockKey(tableId, userId) {
  return `${tableId}:${userId}`;
}

// ═══════════════════════════════════════════════════════════════
// LOCK CHIPS — Player sits down at table
// Uses lock_chips_for_table RPC (atomic, FOR UPDATE row lock)
// ═══════════════════════════════════════════════════════════════

async function lockChips(clubId, userId, tableId, amount) {
  if (!clubId) return { success: true, skipped: true }; // Non-club table
  const sb = getSupabase();

  try {
    const { data: result, error: rpcErr } = await sb.rpc('lock_chips_for_table', {
      p_user_id: userId,
      p_club_id: clubId,
      p_table_id: tableId,
      p_amount: amount,
    });

    if (rpcErr) {
      console.error('[ChipBridge.lockChips] RPC error:', rpcErr);
      return { success: false, error: rpcErr.message };
    }

    if (!result?.success) {
      return {
        success: false,
        error: result?.error || 'Lock failed',
        available: result?.balance,
      };
    }

    // Track the lock in memory for auto-unlock safety net
    const key = _lockKey(tableId, userId);
    const existing = _activeLocks.get(key);
    _activeLocks.set(key, {
      amount: (existing?.amount || 0) + amount,
      lockedAt: Date.now(),
    });

    // Track in chip_escrow for cold-start recovery (non-blocking)
    sb.from('chip_escrow').insert({
      club_id: clubId,
      player_id: userId,
      table_id: tableId,
      amount: amount,
      status: 'locked',
    }).then(({ error }) => {
      if (error) console.warn('[ChipBridge] Escrow insert warning:', error.message);
    });

    return {
      success: true,
      locked: amount,
      remainingBalance: result.balance_after,
    };
  } catch (err) {
    console.error('[ChipBridge.lockChips] Error:', err);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// UNLOCK CHIPS — Player stands up from table
// Uses unlock_chips_from_table RPC (atomic, FOR UPDATE row lock)
// cashoutAmount = player's current engine stack (may be > or < buy-in)
// ═══════════════════════════════════════════════════════════════

async function unlockChips(clubId, userId, tableId, cashoutAmount) {
  if (!clubId) return { success: true, skipped: true };
  const sb = getSupabase();

  const key = _lockKey(tableId, userId);

  try {
    const { data: result, error: rpcErr } = await sb.rpc('unlock_chips_from_table', {
      p_user_id: userId,
      p_club_id: clubId,
      p_table_id: tableId,
      p_amount: cashoutAmount || 0,
    });

    if (rpcErr) {
      console.error('[ChipBridge.unlockChips] RPC error:', rpcErr);
      // DO NOT clear in-memory lock — allows retry
      return { success: false, error: rpcErr.message };
    }

    if (!result?.success) {
      // RPC returned an application-level error (e.g. no lock found)
      // Clear in-memory tracking since DB has no lock to clean up
      _activeLocks.delete(key);
      return { success: false, error: result?.error || 'Unlock failed' };
    }

    // SUCCESS: clear in-memory lock only after confirmed DB unlock
    _activeLocks.delete(key);

    // Clear chip_escrow record (non-blocking)
    sb.from('chip_escrow')
      .update({ status: 'unlocked', unlocked_at: new Date().toISOString() })
      .eq('player_id', userId)
      .eq('table_id', tableId)
      .eq('status', 'locked')
      .then(({ error }) => {
        if (error) console.warn('[ChipBridge] Escrow update warning:', error.message);
      });

    return {
      success: true,
      returned: cashoutAmount || 0,
      newBalance: result.balance_after,
    };
  } catch (err) {
    console.error('[ChipBridge.unlockChips] Error:', err);
    // DO NOT clear in-memory lock — allows retry
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// REBUY CHIPS — Player adds chips at table
// Same as lockChips — deducts additional chips from balance
// ═══════════════════════════════════════════════════════════════

async function rebuyChips(clubId, userId, tableId, amount) {
  return lockChips(clubId, userId, tableId, amount);
}

// ═══════════════════════════════════════════════════════════════
// RECORD RAKE — After each hand completes
// Writes to rake_records and updates agent weekly tracking
// ═══════════════════════════════════════════════════════════════

async function recordRake({ clubId, tableId, handId, potSize, rakeAmount, numPlayers, playerContributions }) {
  if (!clubId || !rakeAmount || rakeAmount <= 0) return { success: true, skipped: true };
  const sb = getSupabase();

  try {
    // 1. Insert rake record (including per-player contributions for rakeback)
    const contribMap = {};
    if (playerContributions?.length > 0) {
      for (const pc of playerContributions) {
        if (pc.playerId && pc.rakeContribution > 0) {
          contribMap[pc.playerId] = (contribMap[pc.playerId] || 0) + pc.rakeContribution;
        }
      }
    }

    await sb.from('rake_records').insert({
      club_id: clubId,
      table_id: tableId,
      hand_id: handId || `hand_${Date.now()}`,
      pot_size: potSize || 0,
      rake_amount: rakeAmount,
      num_players: numPlayers || 0,
      bbj_contribution: 0,
      player_contributions: Object.keys(contribMap).length > 0 ? contribMap : null,
    });

    // 2. Update club total rake with optimistic lock
    const { data: club } = await sb
      .from('clubs')
      .select('total_rake, hands_played')
      .eq('id', clubId)
      .single();

    if (club) {
      const oldRake = club.total_rake || 0;
      const oldHands = club.hands_played || 0;
      const { data: upd } = await sb
        .from('clubs')
        .update({
          total_rake: oldRake + rakeAmount,
          hands_played: oldHands + 1,
        })
        .eq('id', clubId)
        .eq('total_rake', oldRake) // optimistic lock
        .select('id');

      // Retry once on conflict (concurrent hand)
      if (!upd?.length) {
        const { data: fresh } = await sb.from('clubs').select('total_rake, hands_played').eq('id', clubId).single();
        if (fresh) {
          await sb.from('clubs').update({
            total_rake: (fresh.total_rake || 0) + rakeAmount,
            hands_played: (fresh.hands_played || 0) + 1,
          }).eq('id', clubId);
        }
      }
    }

    // 3. Track rake per agent (for commission calculations)
    if (playerContributions && playerContributions.length > 0) {
      const playerIds = playerContributions.map(p => p.playerId);

      const { data: members } = await sb
        .from('club_members')
        .select('user_id, agent_id')
        .eq('club_id', clubId)
        .in('user_id', playerIds);

      if (members) {
        const agentRake = {};
        for (const member of members) {
          if (member.agent_id) {
            const contrib = playerContributions.find(p => p.playerId === member.user_id);
            if (contrib) {
              agentRake[member.agent_id] = (agentRake[member.agent_id] || 0) + (contrib.rakeContribution || 0);
            }
          }
        }

        for (const [agentUserId, rakeGenerated] of Object.entries(agentRake)) {
          const { data: agent } = await sb
            .from('agents')
            .select('id, weekly_rake_generated')
            .eq('user_id', agentUserId)
            .eq('club_id', clubId)
            .single();

          if (agent) {
            const oldWeekly = agent.weekly_rake_generated || 0;
            const { data: rUpd } = await sb
              .from('agents')
              .update({
                weekly_rake_generated: oldWeekly + rakeGenerated,
                last_active_at: new Date().toISOString(),
              })
              .eq('id', agent.id)
              .eq('weekly_rake_generated', oldWeekly) // optimistic lock
              .select('id');

            // Retry once on conflict
            if (!rUpd?.length) {
              const { data: freshA } = await sb.from('agents').select('weekly_rake_generated').eq('id', agent.id).single();
              if (freshA) {
                await sb.from('agents').update({
                  weekly_rake_generated: (freshA.weekly_rake_generated || 0) + rakeGenerated,
                  last_active_at: new Date().toISOString(),
                }).eq('id', agent.id);
              }
            }
          }
        }
      }
    }

    return { success: true, rakeRecorded: rakeAmount };
  } catch (err) {
    console.error('[ChipBridge.recordRake]', err);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CHECK LOCK EXISTS — Used by LobbyManager auto-unlock safety net
// Returns true if an in-memory lock exists for this player/table.
// This prevents double-unlock when seat.js already handled stand-up.
// ═══════════════════════════════════════════════════════════════

async function checkLockExists(tableId, userId) {
  // Check in-memory first (fast path for normal operation)
  if (_activeLocks.has(_lockKey(tableId, userId))) return true;

  // CRITICAL: On cold start, in-memory map is empty but DB may have locks.
  // Query chip_escrow as source of truth.
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('chip_escrow')
      .select('id')
      .eq('table_id', tableId)
      .eq('player_id', userId)
      .eq('status', 'locked')
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error('[ChipBridge.checkLockExists] DB check failed:', err.message);
    // Fail safe: assume lock exists to allow cleanup attempt
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════
// GET CLUB CHIP BALANCE — For buy-in validation
// ═══════════════════════════════════════════════════════════════

async function getChipBalance(clubId, userId) {
  if (!clubId) return null;
  const sb = getSupabase();
  const { data } = await sb
    .from('club_members')
    .select('chip_balance')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();
  return data?.chip_balance || 0;
}

// ═══════════════════════════════════════════════════════════════
// CLEAR ALL LOCKS FOR TABLE — Emergency cleanup on table destroy
// ═══════════════════════════════════════════════════════════════

function clearLocksForTable(tableId) {
  let cleared = 0;
  for (const [key] of _activeLocks) {
    if (key.startsWith(`${tableId}:`)) {
      _activeLocks.delete(key);
      cleared++;
    }
  }
  return cleared;
}

module.exports = {
  lockChips,
  unlockChips,
  rebuyChips,
  recordRake,
  getChipBalance,
  getSupabase,
  checkLockExists,
  clearLocksForTable,
};
