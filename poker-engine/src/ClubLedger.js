/**
 * Smarter.Poker — Club Ledger
 * Module: ClubLedger
 * ═══════════════════════════════════════════════════════════════
 *
 * Manages all chip balance movements within the club poker economy.
 * Integrates with Supabase tables:
 *   - club_members (chip_balance, credit_limit, credit_used)
 *   - clubs (chip_treasury)
 *   - agents (business_balance, commission_rate, player_rakeback_rate)
 *   - club_transactions (all movements)
 *
 * Used by:
 *   - TournamentController (buy-ins, payouts, rake)
 *   - Cash game sessions (buy-ins, cashouts, rake)
 *   - Weekly settlement flows
 *
 * Can run in two modes:
 *   1. DB mode (with Supabase client) — reads/writes real balances
 *   2. In-memory mode (no DB) — tracks balances locally for testing/offline
 */

const EventEmitter = require('events');

// ═══════════════════════════════════════════════════════
// TRANSACTION TYPES
// ═══════════════════════════════════════════════════════

const TRANSACTION_TYPE = {
  // Tournament
  TOURNAMENT_BUYIN: 'tournament_buyin',
  TOURNAMENT_REBUY: 'tournament_rebuy',
  TOURNAMENT_ADDON: 'tournament_addon',
  TOURNAMENT_PAYOUT: 'tournament_payout',
  TOURNAMENT_REFUND: 'tournament_refund',
  TOURNAMENT_RAKE: 'tournament_rake',

  // Cash game
  CASH_BUYIN: 'cash_buyin',
  CASH_CASHOUT: 'cash_cashout',
  CASH_RAKE: 'cash_rake',

  // Administrative
  CHIP_GRANT: 'chip_grant',       // club owner adds chips to a member
  CHIP_REVOKE: 'chip_revoke',     // club owner removes chips
  CREDIT_ISSUE: 'credit_issue',   // agent extends credit
  CREDIT_REPAY: 'credit_repay',   // player repays credit

  // Settlement
  SETTLEMENT: 'settlement',       // weekly square-up
  RAKEBACK: 'rakeback',
  AGENT_FEE: 'agent_fee',
  JACKPOT_CONTRIBUTION: 'jackpot_contribution',
};

// ═══════════════════════════════════════════════════════
// CLUB LEDGER
// ═══════════════════════════════════════════════════════

class ClubLedger extends EventEmitter {
  /**
   * @param {Object} [config]
   * @param {Object} [config.supabase] — Supabase client (null = in-memory mode)
   */
  constructor(config = {}) {
    super();
    this.supabase = config.supabase || null;

    // In-memory state (always maintained, synced with DB when available)
    this.balances = new Map();     // Map<`${clubId}:${userId}`, number>
    this.clubTreasury = new Map(); // Map<clubId, number>
    this.transactions = [];        // Array of transaction records
    this.settlements = [];         // Array of settlement records
  }

  // ═══════════════════════════════════════════════════════
  // BALANCE OPERATIONS
  // ═══════════════════════════════════════════════════════

  /**
   * Deduct buy-in from a player's club balance.
   * @param {string} clubId
   * @param {string} userId
   * @param {number} amount — play chips to deduct
   * @param {number} [fee=0] — rake fee (goes to treasury)
   * @param {Object} [metadata] — { tournamentId, type, etc }
   * @returns {{ success: boolean, newBalance?: number, error?: string }}
   */
  deductBuyin(clubId, userId, amount, fee = 0, metadata = {}) {
    const key = `${clubId}:${userId}`;
    const currentBalance = this.balances.get(key) || 0;
    const totalDeduction = amount + fee;

    if (currentBalance < totalDeduction) {
      return { success: false, error: `Insufficient balance: have ${currentBalance}, need ${totalDeduction}` };
    }

    const newBalance = currentBalance - totalDeduction;
    this.balances.set(key, newBalance);

    // Fee goes to club treasury
    if (fee > 0) {
      const treasury = this.clubTreasury.get(clubId) || 0;
      this.clubTreasury.set(clubId, treasury + fee);
    }

    // Record transaction
    const txn = this._recordTransaction({
      clubId, userId, amount: -(amount + fee),
      balanceBefore: currentBalance, balanceAfter: newBalance,
      type: metadata.type || TRANSACTION_TYPE.TOURNAMENT_BUYIN,
      description: `Buy-in: ${amount} + ${fee} fee`,
      metadata,
    });

    this.emit('balance_change', { clubId, userId, amount: -totalDeduction, newBalance, transaction: txn });

    // DB sync (async, non-blocking)
    if (this.supabase) {
      this._syncDeductionToDB(clubId, userId, totalDeduction, fee, txn).catch(() => {});
    }

    return { success: true, newBalance, transactionId: txn.id };
  }

  /**
   * Credit winnings to a player's club balance.
   * @param {string} clubId
   * @param {string} userId
   * @param {number} amount
   * @param {Object} [metadata]
   * @returns {{ success: boolean, newBalance?: number }}
   */
  creditWinnings(clubId, userId, amount, metadata = {}) {
    const key = `${clubId}:${userId}`;
    const currentBalance = this.balances.get(key) || 0;
    const newBalance = currentBalance + amount;
    this.balances.set(key, newBalance);

    const txn = this._recordTransaction({
      clubId, userId, amount,
      balanceBefore: currentBalance, balanceAfter: newBalance,
      type: metadata.type || TRANSACTION_TYPE.TOURNAMENT_PAYOUT,
      description: `Payout: ${amount}${metadata.place ? ` (${metadata.place} place)` : ''}`,
      metadata,
    });

    this.emit('balance_change', { clubId, userId, amount, newBalance, transaction: txn });

    if (this.supabase) {
      this._syncCreditToDB(clubId, userId, amount, txn).catch(() => {});
    }

    return { success: true, newBalance, transactionId: txn.id };
  }

  /**
   * Process rake — add to club treasury.
   * @param {string} clubId
   * @param {number} amount
   * @param {Object} [metadata]
   */
  processRake(clubId, amount, metadata = {}) {
    if (amount <= 0) return { success: true };

    const treasury = this.clubTreasury.get(clubId) || 0;
    this.clubTreasury.set(clubId, treasury + amount);

    const txn = this._recordTransaction({
      clubId, userId: null, amount,
      type: metadata.type || TRANSACTION_TYPE.TOURNAMENT_RAKE,
      description: `Rake: ${amount}`,
      metadata,
    });

    this.emit('rake_collected', { clubId, amount, newTreasury: treasury + amount });

    if (this.supabase) {
      this._syncRakeToDB(clubId, amount, txn).catch(() => {});
    }

    return { success: true, newTreasury: treasury + amount };
  }

  /**
   * Issue chips to a player (club owner / agent action).
   * @param {string} clubId
   * @param {string} userId
   * @param {number} amount
   * @param {Object} [metadata]
   */
  grantChips(clubId, userId, amount, metadata = {}) {
    const key = `${clubId}:${userId}`;
    const current = this.balances.get(key) || 0;
    const newBalance = current + amount;
    this.balances.set(key, newBalance);

    this._recordTransaction({
      clubId, userId, amount,
      balanceBefore: current, balanceAfter: newBalance,
      type: TRANSACTION_TYPE.CHIP_GRANT,
      description: `Chips granted: ${amount}`,
      metadata,
    });

    return { success: true, newBalance };
  }

  /**
   * Revoke chips from a player.
   */
  revokeChips(clubId, userId, amount, metadata = {}) {
    const key = `${clubId}:${userId}`;
    const current = this.balances.get(key) || 0;
    const newBalance = Math.max(0, current - amount);
    this.balances.set(key, newBalance);

    this._recordTransaction({
      clubId, userId, amount: -amount,
      balanceBefore: current, balanceAfter: newBalance,
      type: TRANSACTION_TYPE.CHIP_REVOKE,
      description: `Chips revoked: ${amount}`,
      metadata,
    });

    return { success: true, newBalance };
  }

  // ═══════════════════════════════════════════════════════
  // BALANCE QUERIES
  // ═══════════════════════════════════════════════════════

  /** Get a player's current balance in a club. */
  getBalance(clubId, userId) {
    return this.balances.get(`${clubId}:${userId}`) || 0;
  }

  /** Set a player's balance (for initialization / DB sync). */
  setBalance(clubId, userId, amount) {
    this.balances.set(`${clubId}:${userId}`, amount);
  }

  /** Get club treasury balance. */
  getTreasury(clubId) {
    return this.clubTreasury.get(clubId) || 0;
  }

  /** Set club treasury (for initialization). */
  setTreasury(clubId, amount) {
    this.clubTreasury.set(clubId, amount);
  }

  // ═══════════════════════════════════════════════════════
  // SETTLEMENT SYSTEM
  // ═══════════════════════════════════════════════════════

  /**
   * Get settlement report for a club over a date range.
   * Shows each player's net result (P/L) from tournaments and cash games.
   * @param {string} clubId
   * @param {string} [startDate] — ISO date string (default: 7 days ago)
   * @param {string} [endDate] — ISO date string (default: now)
   * @returns {{ players: Array<{userId, net, deposits, withdrawals, rake}> }}
   */
  getSettlementReport(clubId, startDate, endDate) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const playerMap = new Map(); // userId → { deposits, withdrawals, rake }

    for (const txn of this.transactions) {
      if (txn.clubId !== clubId) continue;
      if (!txn.userId) continue;
      const txnDate = new Date(txn.createdAt);
      if (txnDate < start || txnDate > end) continue;

      if (!playerMap.has(txn.userId)) {
        playerMap.set(txn.userId, { deposits: 0, withdrawals: 0, rake: 0 });
      }
      const p = playerMap.get(txn.userId);

      if (txn.amount < 0) {
        p.deposits += Math.abs(txn.amount); // money in (buy-ins, rebuys)
      } else {
        p.withdrawals += txn.amount; // money out (payouts, cashouts)
      }
    }

    const players = [];
    for (const [userId, data] of playerMap) {
      const net = data.withdrawals - data.deposits;
      players.push({
        userId,
        net,
        deposits: data.deposits,
        withdrawals: data.withdrawals,
        settled: false,
      });
    }

    // Sort: biggest losers first (they owe money), then winners
    players.sort((a, b) => a.net - b.net);

    return {
      clubId,
      period: { start: start.toISOString(), end: end.toISOString() },
      players,
      totalRake: this.transactions
        .filter(t => t.clubId === clubId && t.type === TRANSACTION_TYPE.TOURNAMENT_RAKE &&
          new Date(t.createdAt) >= start && new Date(t.createdAt) <= end)
        .reduce((s, t) => s + t.amount, 0),
    };
  }

  /**
   * Record a settlement between player and club/agent.
   * @param {string} clubId
   * @param {string} userId
   * @param {number} amount — positive = player pays club, negative = club pays player
   * @param {Object} [metadata]
   */
  recordSettlement(clubId, userId, amount, metadata = {}) {
    const settlement = {
      id: `settle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      clubId,
      userId,
      amount,
      settledAt: new Date().toISOString(),
      settledBy: metadata.settledBy || null,
      period: metadata.period || null,
      metadata,
    };

    this.settlements.push(settlement);

    this._recordTransaction({
      clubId, userId, amount: amount > 0 ? -amount : Math.abs(amount),
      type: TRANSACTION_TYPE.SETTLEMENT,
      description: `Settlement: ${amount > 0 ? 'player pays' : 'club pays'} ${Math.abs(amount)}`,
      metadata: { ...metadata, settlementId: settlement.id },
    });

    this.emit('settlement_recorded', settlement);

    if (this.supabase) {
      this._syncSettlementToDB(settlement).catch(() => {});
    }

    return { success: true, settlement };
  }

  /**
   * Get pending settlement amounts for all members of a club.
   * This is the quick view for the agent/owner.
   */
  getPendingSettlements(clubId) {
    const report = this.getSettlementReport(clubId);
    return report.players.filter(p => p.net !== 0);
  }

  // ═══════════════════════════════════════════════════════
  // AGENT COMMISSION
  // ═══════════════════════════════════════════════════════

  /**
   * Process agent commission on rake.
   * @param {string} clubId
   * @param {string} agentId
   * @param {number} rakeAmount — total rake to calculate commission from
   * @param {number} commissionRate — e.g. 0.12 for 12%
   * @param {Object} [metadata]
   */
  processAgentCommission(clubId, agentId, rakeAmount, commissionRate, metadata = {}) {
    const commission = Math.floor(rakeAmount * commissionRate);
    if (commission <= 0) return { success: true, commission: 0 };

    this._recordTransaction({
      clubId, userId: agentId, amount: commission,
      type: TRANSACTION_TYPE.AGENT_FEE,
      description: `Agent commission: ${(commissionRate * 100).toFixed(1)}% of ${rakeAmount} = ${commission}`,
      metadata: { ...metadata, rakeAmount, commissionRate },
    });

    this.emit('agent_commission', { clubId, agentId, commission, rakeAmount });
    return { success: true, commission };
  }

  /**
   * Process rakeback to a player.
   * @param {string} clubId
   * @param {string} userId
   * @param {number} rakeAmount
   * @param {number} rakebackRate — e.g. 0.05 for 5%
   */
  processRakeback(clubId, userId, rakeAmount, rakebackRate, metadata = {}) {
    const rakeback = Math.floor(rakeAmount * rakebackRate);
    if (rakeback <= 0) return { success: true, rakeback: 0 };

    const key = `${clubId}:${userId}`;
    const current = this.balances.get(key) || 0;
    this.balances.set(key, current + rakeback);

    this._recordTransaction({
      clubId, userId, amount: rakeback,
      balanceBefore: current, balanceAfter: current + rakeback,
      type: TRANSACTION_TYPE.RAKEBACK,
      description: `Rakeback: ${(rakebackRate * 100).toFixed(1)}% of ${rakeAmount} = ${rakeback}`,
      metadata: { ...metadata, rakeAmount, rakebackRate },
    });

    return { success: true, rakeback, newBalance: current + rakeback };
  }

  // ═══════════════════════════════════════════════════════
  // CROSS-CLUB (XMTT) SUPPORT
  // ═══════════════════════════════════════════════════════

  /**
   * Transfer chips between clubs (for xMTT prize distribution).
   * When a player from Club B wins in a Union tournament hosted by Club A,
   * the payout comes from the pooled prize and is credited to their Club B balance.
   * @param {string} sourceClubId
   * @param {string} destClubId
   * @param {string} userId
   * @param {number} amount
   * @param {Object} [metadata]
   */
  crossClubTransfer(sourceClubId, destClubId, userId, amount, metadata = {}) {
    // Debit from source club's treasury perspective
    const srcTreasury = this.clubTreasury.get(sourceClubId) || 0;
    this.clubTreasury.set(sourceClubId, srcTreasury - amount);

    // Credit to player in their home club
    this.creditWinnings(destClubId, userId, amount, {
      ...metadata, type: TRANSACTION_TYPE.TOURNAMENT_PAYOUT, crossClub: true, sourceClubId,
    });

    this.emit('cross_club_transfer', { sourceClubId, destClubId, userId, amount });
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════
  // LOAD FROM DB
  // ═══════════════════════════════════════════════════════

  /**
   * Load all member balances for a club from DB into memory.
   * @param {string} clubId
   */
  async loadClubBalances(clubId) {
    if (!this.supabase) return;
    const { data, error } = await this.supabase
      .from('club_members')
      .select('user_id, chip_balance')
      .eq('club_id', clubId)
      .eq('is_active', true);

    if (error || !data) return;
    for (const row of data) {
      this.balances.set(`${clubId}:${row.user_id}`, row.chip_balance || 0);
    }
  }

  /**
   * Load club treasury from DB.
   * @param {string} clubId
   */
  async loadClubTreasury(clubId) {
    if (!this.supabase) return;
    const { data, error } = await this.supabase
      .from('clubs')
      .select('chip_treasury')
      .eq('id', clubId)
      .single();

    if (error || !data) return;
    this.clubTreasury.set(clubId, data.chip_treasury || 0);
  }

  // ═══════════════════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════════════════

  /** @private */
  _recordTransaction(txnData) {
    const txn = {
      id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      clubId: txnData.clubId,
      userId: txnData.userId,
      amount: txnData.amount,
      balanceBefore: txnData.balanceBefore,
      balanceAfter: txnData.balanceAfter,
      type: txnData.type,
      description: txnData.description || '',
      metadata: txnData.metadata || {},
      createdAt: new Date().toISOString(),
    };
    this.transactions.push(txn);
    return txn;
  }

  /** @private DB sync methods */
  async _syncDeductionToDB(clubId, userId, totalAmount, fee, txn) {
    if (!this.supabase) return;
    // Update member balance
    await this.supabase.rpc('decrement_chip_balance', { p_club_id: clubId, p_user_id: userId, p_amount: totalAmount }).catch(() => {
      // Fallback: manual update
      this.supabase.from('club_members')
        .update({ chip_balance: this.getBalance(clubId, userId) })
        .eq('club_id', clubId).eq('user_id', userId).then(() => {});
    });
    // Record transaction
    await this.supabase.from('club_transactions').insert({
      club_id: clubId, user_id: userId, amount: -totalAmount,
      transaction_type: txn.type, description: txn.description, metadata: txn.metadata,
    }).catch(() => {});
  }

  async _syncCreditToDB(clubId, userId, amount, txn) {
    if (!this.supabase) return;
    await this.supabase.from('club_members')
      .update({ chip_balance: this.getBalance(clubId, userId) })
      .eq('club_id', clubId).eq('user_id', userId).catch(() => {});
    await this.supabase.from('club_transactions').insert({
      club_id: clubId, user_id: userId, amount,
      transaction_type: txn.type, description: txn.description, metadata: txn.metadata,
    }).catch(() => {});
  }

  async _syncRakeToDB(clubId, amount, txn) {
    if (!this.supabase) return;
    await this.supabase.rpc('increment_club_treasury', { p_club_id: clubId, p_amount: amount }).catch(() => {
      const newTreasury = this.getTreasury(clubId);
      this.supabase.from('clubs').update({ chip_treasury: newTreasury }).eq('id', clubId).then(() => {});
    });
    await this.supabase.from('club_transactions').insert({
      club_id: clubId, user_id: null, amount,
      transaction_type: 'tournament_rake', description: txn.description, metadata: txn.metadata,
    }).catch(() => {});
  }

  async _syncSettlementToDB(settlement) {
    if (!this.supabase) return;
    await this.supabase.from('club_transactions').insert({
      club_id: settlement.clubId, user_id: settlement.userId,
      amount: settlement.amount, transaction_type: 'settlement',
      description: `Weekly settlement`, metadata: settlement.metadata,
    }).catch(() => {});
  }
}


module.exports = {
  ClubLedger,
  TRANSACTION_TYPE,
};
