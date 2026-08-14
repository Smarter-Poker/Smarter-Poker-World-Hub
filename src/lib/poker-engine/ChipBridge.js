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
const { resilientMutation, resilientQuery } = require('./SupabaseResilience');

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
    // Phase 48f: resilient — financial critical
    const { data: result, error: rpcErr } = await resilientMutation(sb, () => sb.rpc('lock_chips_for_table', {
      p_user_id: userId,
      p_club_id: clubId,
      p_table_id: tableId,
      p_amount: amount,
    }), { critical: true });

    if (rpcErr) {
      console.warn('[ChipBridge.lockChips] RPC error:', rpcErr);
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

    // ── SCHEMA REALITY (CHECK 13, 2026-08-14) ────────────────────────────
    // This code was written against a chip_escrow_holds design that never
    // shipped. The LIVE table has: wallet_id (NOT NULL, FK wallets.id),
    // user_id, club_id, hold_type CHECK(tournament_register|cashout_pending|
    // inter_club_transfer|bomb_pot_ante|rebuy_pending|other), related_id,
    // amount, status CHECK(held|released|captured|expired), expires_at
    // (NOT NULL), released_at, released_reason.
    //
    // The old writes used player_id / table_id / status 'locked' /
    // unlocked_at — every one absent or illegal — so the "cold-start
    // recovery" escrow record has NEVER written a single row (0 rows in
    // production), and every read against it was a 42703 the resilience
    // wrapper dutifully retried and swallowed. Mapping used from here on:
    //   player_id  -> user_id
    //   table_id   -> related_id   (hold_type 'other' marks table-seat holds)
    //   'locked'   -> 'held'       'unlocked' -> 'released' (+released_at/_reason)
    //   wallet_id  -> resolved from wallets by user_id
    //   expires_at -> now + 24h    (table-seat locks are hours, not days)
    // Track in chip_escrow for cold-start recovery (non-blocking, Phase 48f: resilient)
    (async () => {
      try {
        const { data: wallet } = await resilientQuery(sb, () => sb
          .from('wallets').select('id').eq('user_id', userId).limit(1).maybeSingle());
        if (!wallet?.id) {
          console.warn('[ChipBridge] Escrow insert skipped: no wallet row for user', userId);
          return;
        }
        const { error } = await resilientMutation(sb, () => sb.from('chip_escrow_holds').insert({
          wallet_id: wallet.id,
          user_id: userId,
          club_id: clubId,
          hold_type: 'other',
          related_id: tableId,
          amount: amount,
          status: 'held',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }));
        if (error) console.warn('[ChipBridge] Escrow insert warning:', error.message);
      } catch (err) {
        console.warn('[ChipBridge] Escrow insert threw:', err?.message || err);
      }
    })();

    return {
      success: true,
      locked: amount,
      remainingBalance: result.balance_after,
    };
  } catch (err) {
    console.warn('[ChipBridge.lockChips] Error:', err);
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
    // Phase 48f: resilient — financial critical
    const { data: result, error: rpcErr } = await resilientMutation(sb, () => sb.rpc('unlock_chips_from_table', {
      p_user_id: userId,
      p_club_id: clubId,
      p_table_id: tableId,
      p_amount: cashoutAmount || 0,
    }), { critical: true });

    if (rpcErr) {
      console.warn('[ChipBridge.unlockChips] RPC error:', rpcErr);
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

    // Clear chip_escrow record (non-blocking, Phase 48f: resilient)
    // Real schema (see the mapping note in lockChips): held -> released.
    resilientMutation(sb, () => sb.from('chip_escrow_holds')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_reason: 'table_unlock',
      })
      .eq('user_id', userId)
      .eq('related_id', tableId)
      .eq('status', 'held')
    ).then(({ error }) => {
      if (error) console.warn('[ChipBridge] Escrow update warning:', error.message);
    });

    return {
      success: true,
      returned: cashoutAmount || 0,
      newBalance: result.balance_after,
    };
  } catch (err) {
    console.warn('[ChipBridge.unlockChips] Error:', err);
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

    // Phase 48f: resilient — financial critical
    await resilientMutation(sb, () => sb.from('rake_records').insert({
      club_id: clubId,
      table_id: tableId,
      hand_id: handId || `hand_${Date.now()}`,
      pot_size: potSize || 0,
      rake_amount: rakeAmount,
      num_players: numPlayers || 0,
      bbj_contribution: 0,
      player_contributions: Object.keys(contribMap || {}).length > 0 ? contribMap : null,
    }), { critical: true });

    // 2. Update club total rake with optimistic lock (Phase 48f: resilient)
    const { data: club } = await resilientQuery(sb, () => sb
      .from('clubs')
      .select('total_rake, hands_played')
      .eq('id', clubId)
      .maybeSingle()
    );

    if (club) {
      const oldRake = club.total_rake || 0;
      const oldHands = club.hands_played || 0;
      const { data: upd } = await resilientMutation(sb, () => sb
        .from('clubs')
        .update({
          total_rake: oldRake + rakeAmount,
          hands_played: oldHands + 1,
        })
        .eq('id', clubId)
        .eq('total_rake', oldRake) // optimistic lock
        .select('id'),
        { critical: true }
      );

      // Retry once on conflict (concurrent hand)
      if (!upd?.length) {
        const { data: fresh } = await resilientQuery(sb, () => sb.from('clubs').select('total_rake, hands_played').eq('id', clubId).maybeSingle());
        if (fresh) {
          const freshRake = fresh.total_rake || 0;
          await resilientMutation(sb, () => sb.from('clubs').update({
            total_rake: freshRake + rakeAmount,
            hands_played: (fresh.hands_played || 0) + 1,
          }).eq('id', clubId).eq('total_rake', freshRake), { critical: true }); // optimistic lock on retry too
        }
      }
    }

    // 3. Track rake per agent (for commission calculations)
    if (playerContributions && playerContributions.length > 0) {
      const playerIds = playerContributions.map(p => p.playerId);

      // Phase 48f: resilient query
      const { data: members } = await resilientQuery(sb, () => sb
        .from('club_members')
        .select('user_id, agent_id')
        .eq('club_id', clubId)
        .in('user_id', playerIds)
      );

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

        for (const [agentUserId, rakeGenerated] of Object.entries(agentRake || {})) {
          // Phase 48f: resilient query + mutation for agent rake tracking
          const { data: agent } = await resilientQuery(sb, () => sb
            .from('agents')
            .select('id, weekly_rake_generated')
            .eq('user_id', agentUserId)
            .eq('club_id', clubId)
            .maybeSingle()
          );

          if (agent) {
            const oldWeekly = agent.weekly_rake_generated || 0;
            const { data: rUpd } = await resilientMutation(sb, () => sb
              .from('agents')
              .update({
                weekly_rake_generated: oldWeekly + rakeGenerated,
                last_active_at: new Date().toISOString(),
              })
              .eq('id', agent.id)
              .eq('weekly_rake_generated', oldWeekly) // optimistic lock
              .select('id')
            );

            // Retry once on conflict
            if (!rUpd?.length) {
              const { data: freshA } = await resilientQuery(sb, () => sb.from('agents').select('weekly_rake_generated').eq('id', agent.id).maybeSingle());
              if (freshA) {
                const freshWeekly = freshA.weekly_rake_generated || 0;
                await resilientMutation(sb, () => sb.from('agents').update({
                  weekly_rake_generated: freshWeekly + rakeGenerated,
                  last_active_at: new Date().toISOString(),
                }).eq('id', agent.id).eq('weekly_rake_generated', freshWeekly)); // optimistic lock on retry
              }
            }
          }
        }
      }
    }

    return { success: true, rakeRecorded: rakeAmount };
  } catch (err) {
    console.warn('[ChipBridge.recordRake]', err);
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
    // Phase 48f: resilient query
    // Real schema (see the mapping note in lockChips). The old query used
    // table_id/player_id/'locked' — the cold-start source of truth 42703'd
    // on every call and the catch answered "assume lock exists".
    const { data } = await resilientQuery(sb, () => sb
      .from('chip_escrow_holds')
      .select('id')
      .eq('related_id', tableId)
      .eq('user_id', userId)
      .eq('status', 'held')
      .limit(1)
      .maybeSingle()
    );
    return !!data;
  } catch (err) {
    console.warn('[ChipBridge.checkLockExists] DB check failed:', err.message);
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
  // Phase 48f: resilient query
  const { data } = await resilientQuery(sb, () => sb
    .from('club_members')
    .select('chip_balance')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle()
  );
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
