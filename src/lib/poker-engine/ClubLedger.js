/**
 * ClubLedger — Club Chip Balance & Transaction Ledger
 * 
 * Handles all club-level chip operations:
 *   - Balance queries and updates
 *   - Transaction recording (buy-in, cashout, transfer, rake, BBJ, promo)
 *   - Agent commission tracking
 *   - Cross-club transfers (union tournaments)
 * 
 * Works alongside ChipBridge (which handles table-level chip locking).
 * ClubLedger operates at the club/member level, not the table level.
 */

const TRANSACTION_TYPE = {
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  BUY_IN: 'buy_in',
  CASHOUT: 'cashout',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  RAKE: 'rake',
  BBJ_CONTRIBUTION: 'bbj_contribution',
  BBJ_PAYOUT: 'bbj_payout',
  PROMO_CREDIT: 'promo_credit',
  PROMO_DEBIT: 'promo_debit',
  AGENT_COMMISSION: 'agent_commission',
  TOURNAMENT_BUYIN: 'tournament_buyin',
  TOURNAMENT_PAYOUT: 'tournament_payout',
  ADJUSTMENT: 'adjustment',
};

class ClubLedger {
  /**
   * @param {Object} [config]
   * @param {Object} [config.supabase] - Supabase client
   */
  constructor(config = {}) {
    this.supabase = config.supabase || null;
  }

  /**
   * Set the Supabase client (lazy init).
   */
  setSupabase(sb) {
    this.supabase = sb;
  }

  /**
   * Get a member's chip balance.
   * @param {string} clubId
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async getBalance(clubId, userId) {
    if (!this.supabase) return 0;
    const { data } = await this.supabase
      .from('club_members')
      .select('chip_balance')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .single();
    return data?.chip_balance || 0;
  }

  /**
   * Credit chips to a member's balance.
   * @param {string} clubId
   * @param {string} userId
   * @param {number} amount
   * @param {string} type - TRANSACTION_TYPE
   * @param {Object} [meta] - Additional metadata
   * @returns {Promise<{ success: boolean, newBalance?: number, error?: string }>}
   */
  async credit(clubId, userId, amount, type = TRANSACTION_TYPE.DEPOSIT, meta = {}) {
    if (!this.supabase || amount <= 0) return { success: false, error: 'Invalid' };

    try {
      const { data, error } = await this.supabase.rpc('fn_credit_chips', {
        p_club_id: clubId,
        p_user_id: userId,
        p_amount: amount,
      });

      if (error) {
        // Fallback: direct update
        const current = await this.getBalance(clubId, userId);
        const newBal = current + amount;
        const { error: upErr } = await this.supabase
          .from('club_members')
          .update({ chip_balance: newBal })
          .eq('club_id', clubId)
          .eq('user_id', userId);
        if (upErr) return { success: false, error: upErr.message };

        await this._recordTransaction(clubId, userId, amount, type, meta);
        return { success: true, newBalance: newBal };
      }

      await this._recordTransaction(clubId, userId, amount, type, meta);
      return { success: true, newBalance: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Debit chips from a member's balance.
   * @param {string} clubId
   * @param {string} userId
   * @param {number} amount
   * @param {string} type - TRANSACTION_TYPE
   * @param {Object} [meta] - Additional metadata
   * @returns {Promise<{ success: boolean, newBalance?: number, error?: string }>}
   */
  async debit(clubId, userId, amount, type = TRANSACTION_TYPE.WITHDRAWAL, meta = {}) {
    if (!this.supabase || amount <= 0) return { success: false, error: 'Invalid' };

    try {
      const current = await this.getBalance(clubId, userId);
      if (current < amount) {
        return { success: false, error: 'Insufficient balance', available: current };
      }

      const newBal = current - amount;
      const { error } = await this.supabase
        .from('club_members')
        .update({ chip_balance: newBal })
        .eq('club_id', clubId)
        .eq('user_id', userId);

      if (error) return { success: false, error: error.message };

      await this._recordTransaction(clubId, userId, -amount, type, meta);
      return { success: true, newBalance: newBal };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Transfer chips between two members in the same club.
   * @param {string} clubId
   * @param {string} fromUserId
   * @param {string} toUserId
   * @param {number} amount
   * @param {Object} [meta]
   */
  async transfer(clubId, fromUserId, toUserId, amount, meta = {}) {
    const debitResult = await this.debit(clubId, fromUserId, amount, TRANSACTION_TYPE.TRANSFER_OUT, {
      ...meta, toUserId,
    });
    if (!debitResult.success) return debitResult;

    const creditResult = await this.credit(clubId, toUserId, amount, TRANSACTION_TYPE.TRANSFER_IN, {
      ...meta, fromUserId,
    });
    if (!creditResult.success) {
      // Rollback debit
      await this.credit(clubId, fromUserId, amount, TRANSACTION_TYPE.ADJUSTMENT, { reason: 'transfer_rollback' });
      return creditResult;
    }

    return { success: true, fromBalance: debitResult.newBalance, toBalance: creditResult.newBalance };
  }

  /**
   * Record a transaction in chip_transactions table.
   * @private
   */
  async _recordTransaction(clubId, userId, amount, type, meta = {}) {
    if (!this.supabase) return;
    try {
      await this.supabase.from('chip_transactions').insert({
        club_id: clubId,
        user_id: userId,
        amount,
        type,
        metadata: meta,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[ClubLedger] Transaction record failed:', err.message);
    }
  }

  /**
   * Get transaction history for a member.
   * @param {string} clubId
   * @param {string} userId
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {string} [options.type] - Filter by type
   */
  async getTransactions(clubId, userId, options = {}) {
    if (!this.supabase) return [];
    let query = this.supabase
      .from('chip_transactions')
      .select('*')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(options.limit || 50);

    if (options.type) query = query.eq('type', options.type);

    const { data } = await query;
    return data || [];
  }
}

module.exports = { ClubLedger, TRANSACTION_TYPE };
