/**
 * ChipBridge — Connects the poker engine to Club Arena's chip economy
 * ═══════════════════════════════════════════════════════════════════
 *
 * Used by:
 *   - /api/poker/engine/seat.js (lock/unlock/rebuy on sit/stand/add)
 *   - LobbyManager.js (rake recording after each hand)
 *
 * All operations use service_role for server-side atomic DB writes.
 * Non-club tables (clubId is null) skip all chip operations.
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
// LOCK CHIPS — Player sits down at table
// Deducts from club_members.chip_balance → table_chip_locks
// ═══════════════════════════════════════════════════════════════

async function lockChips(clubId, userId, tableId, amount) {
  if (!clubId) return { success: true, skipped: true }; // Non-club table
  const sb = getSupabase();

  // 1. Read fresh balance
  const { data: member, error: memErr } = await sb
    .from('club_members')
    .select('chip_balance')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();

  if (memErr || !member) {
    return { success: false, error: 'Not a member of this club' };
  }

  const balance = member.chip_balance || 0;
  if (balance < amount) {
    return {
      success: false,
      error: `Insufficient chips. Have ${balance}, need ${amount}`,
      available: balance,
    };
  }

  // 2. Deduct from chip_balance
  const { error: deductErr } = await sb
    .from('club_members')
    .update({ chip_balance: balance - amount })
    .eq('club_id', clubId)
    .eq('user_id', userId);

  if (deductErr) {
    return { success: false, error: 'Failed to deduct chips', details: deductErr.message };
  }

  // 3. Create/update lock record
  const { data: existingLock } = await sb
    .from('table_chip_locks')
    .select('id, amount')
    .eq('table_id', tableId)
    .eq('user_id', userId)
    .single();

  if (existingLock) {
    await sb
      .from('table_chip_locks')
      .update({
        amount: (existingLock.amount || 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingLock.id);
  } else {
    await sb.from('table_chip_locks').insert({
      table_id: tableId,
      user_id: userId,
      amount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // 4. Record transaction
  await sb.from('chip_transactions').insert({
    from_user_id: userId,
    to_user_id: userId,
    club_id: clubId,
    transaction_type: 'table_lock',
    amount: -amount,
    notes: `Chips locked for table ${tableId.slice(0, 8)}`,
  });

  return {
    success: true,
    locked: amount,
    remainingBalance: balance - amount,
  };
}

// ═══════════════════════════════════════════════════════════════
// UNLOCK CHIPS — Player stands up from table
// Returns chips from engine stack → club_members.chip_balance
// Deletes table_chip_locks record
// ═══════════════════════════════════════════════════════════════

async function unlockChips(clubId, userId, tableId, cashoutAmount) {
  if (!clubId) return { success: true, skipped: true };
  const sb = getSupabase();

  // 1. Read fresh balance
  const { data: member } = await sb
    .from('club_members')
    .select('chip_balance')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();

  const currentBalance = member?.chip_balance || 0;

  // 2. Return engine cashout to chip_balance
  if (cashoutAmount > 0) {
    await sb
      .from('club_members')
      .update({ chip_balance: currentBalance + cashoutAmount })
      .eq('club_id', clubId)
      .eq('user_id', userId);
  }

  // 3. Delete lock record
  await sb
    .from('table_chip_locks')
    .delete()
    .eq('table_id', tableId)
    .eq('user_id', userId);

  // 4. Record transaction
  if (cashoutAmount > 0) {
    await sb.from('chip_transactions').insert({
      from_user_id: userId,
      to_user_id: userId,
      club_id: clubId,
      transaction_type: 'table_unlock',
      amount: cashoutAmount,
      notes: `Chips returned from table ${tableId.slice(0, 8)}`,
    });
  }

  return {
    success: true,
    returned: cashoutAmount,
    newBalance: currentBalance + cashoutAmount,
  };
}

// ═══════════════════════════════════════════════════════════════
// REBUY CHIPS — Player adds chips at table
// Same as lockChips but for an already-seated player
// ═══════════════════════════════════════════════════════════════

async function rebuyChips(clubId, userId, tableId, amount) {
  // Reuses lockChips logic — deducts from balance, adds to lock
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

    // 2. Update club total rake
    const { data: club } = await sb
      .from('clubs')
      .select('total_rake, hands_played')
      .eq('id', clubId)
      .single();

    if (club) {
      await sb
        .from('clubs')
        .update({
          total_rake: (club.total_rake || 0) + rakeAmount,
          hands_played: (club.hands_played || 0) + 1,
        })
        .eq('id', clubId);
    }

    // 3. Track rake per agent (for commission calculations)
    // Get all players at the table who have agents
    if (playerContributions && playerContributions.length > 0) {
      const playerIds = playerContributions.map(p => p.playerId);

      const { data: members } = await sb
        .from('club_members')
        .select('user_id, agent_id')
        .eq('club_id', clubId)
        .in('user_id', playerIds);

      if (members) {
        // Group rake by agent
        const agentRake = {};
        for (const member of members) {
          if (member.agent_id) {
            const contrib = playerContributions.find(p => p.playerId === member.user_id);
            if (contrib) {
              agentRake[member.agent_id] = (agentRake[member.agent_id] || 0) + (contrib.rakeContribution || 0);
            }
          }
        }

        // Update each agent's weekly_rake_generated
        for (const [agentUserId, rakeGenerated] of Object.entries(agentRake)) {
          const { data: agent } = await sb
            .from('agents')
            .select('id, weekly_rake_generated')
            .eq('user_id', agentUserId)
            .eq('club_id', clubId)
            .single();

          if (agent) {
            await sb
              .from('agents')
              .update({
                weekly_rake_generated: (agent.weekly_rake_generated || 0) + rakeGenerated,
                last_active_at: new Date().toISOString(),
              })
              .eq('id', agent.id);
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
// CHECK LOCK EXISTS — Used by LobbyManager auto-unlock
// Returns true if a table_chip_locks record exists for this player/table
// ═══════════════════════════════════════════════════════════════

async function checkLockExists(tableId, userId) {
  const sb = getSupabase();
  const { data } = await sb
    .from('table_chip_locks')
    .select('id')
    .eq('table_id', tableId)
    .eq('user_id', userId)
    .single();
  return !!data;
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

module.exports = {
  lockChips,
  unlockChips,
  rebuyChips,
  recordRake,
  getChipBalance,
  getSupabase,
  checkLockExists,
  getSupabase,
};
