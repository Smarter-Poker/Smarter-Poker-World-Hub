/**
 * Smarter.Poker — Tournament Engine
 * Module: BountyManager
 * ═══════════════════════════════════════════════════════════════
 *
 * Manages all bounty formats for tournaments:
 *
 *   KO (Knockout):
 *     - Fixed bounty per player (split from buy-in)
 *     - Eliminator wins full bounty immediately
 *
 *   PKO (Progressive Knockout):
 *     - Bounty starts at initial amount (split from buy-in)
 *     - On elimination: eliminator receives 50% of victim's bounty
 *     - Other 50% adds to eliminator's own bounty
 *     - Bounties grow throughout the tournament
 *     - Winner collects their own remaining bounty at the end
 *
 *   Mystery Bounty:
 *     - All bounty contributions go into a shared pool
 *     - Bounties NOT awarded during early phase
 *     - After threshold (field reduces to X players), each elimination
 *       awards a random bounty drawn from a weighted prize distribution
 *     - Creates exciting "envelope reveal" moments
 *
 * Integration:
 *   - Constructed by TournamentController
 *   - Hooks into registerPlayer() and _handleElimination()
 *   - Awards via ClubLedger.creditWinnings()
 * ═══════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════
// BOUNTY TYPES
// ═══════════════════════════════════════════════════════

const BOUNTY_TYPE = {
  NONE: 'none',
  KO: 'ko',
  PKO: 'pko',
  MYSTERY: 'mystery',
};

// ═══════════════════════════════════════════════════════
// DEFAULT MYSTERY BOUNTY PRIZE DISTRIBUTION
// ═══════════════════════════════════════════════════════

const DEFAULT_MYSTERY_TIERS = [
  { label: 'Min Prize',     multiplier: 1,    weight: 500 },
  { label: 'Small Prize',   multiplier: 1.5,  weight: 200 },
  { label: 'Medium Prize',  multiplier: 3,    weight: 150 },
  { label: 'Large Prize',   multiplier: 5,    weight: 80 },
  { label: 'Huge Prize',    multiplier: 10,   weight: 40 },
  { label: 'Mega Prize',    multiplier: 25,   weight: 20 },
  { label: 'Grand Prize',   multiplier: 50,   weight: 8 },
  { label: 'JACKPOT',       multiplier: 100,  weight: 2 },
];

// ═══════════════════════════════════════════════════════
// BOUNTY MANAGER
// ═══════════════════════════════════════════════════════

class BountyManager {
  /**
   * @param {Object} config
   * @param {string} config.bountyType — 'ko' | 'pko' | 'mystery' | 'none'
   * @param {number} config.bountyAmount — chips per player allocated to bounty
   * @param {number} config.totalBuyIn — full buy-in (bounty is split from this)
   * @param {number} [config.mysteryThreshold] — mystery phase starts when field
   *   reduces to this many players. 0 = immediate.
   * @param {Array}  [config.mysteryTiers] — custom weighted distribution
   * @param {string} config.tournamentId
   */
  constructor(config) {
    this.bountyType = config.bountyType || BOUNTY_TYPE.NONE;
    this.bountyAmount = config.bountyAmount || 0;
    this.totalBuyIn = config.totalBuyIn || 0;
    this.tournamentId = config.tournamentId || '';

    // Mystery-specific
    this.mysteryThreshold = config.mysteryThreshold || 0;
    this.mysteryTiers = config.mysteryTiers || DEFAULT_MYSTERY_TIERS;
    this.mysteryPool = 0;
    this.mysteryPhaseActive = false;
    this._mysteryEnvelopes = [];
    this._mysteryAwarded = [];

    // Per-player: Map<playerId, BountyInfo>
    this.playerBounties = new Map();

    // Aggregates
    this.totalBountyPool = 0;
    this.totalBountiesAwarded = 0;
    this.bountyHistory = [];
  }

  // ═══════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════

  /**
   * Track a player's bounty on registration.
   * @returns {{ bountyOnHead: number, prizePoolContribution: number }}
   */
  onPlayerRegister(playerId, playerName) {
    if (this.bountyType === BOUNTY_TYPE.NONE) {
      return { bountyOnHead: 0, prizePoolContribution: this.totalBuyIn };
    }

    const bountyContribution = this.bountyAmount;
    const prizePoolContribution = this.totalBuyIn - bountyContribution;

    if (this.bountyType === BOUNTY_TYPE.KO || this.bountyType === BOUNTY_TYPE.PKO) {
      this.playerBounties.set(playerId, {
        playerId, playerName,
        bountyOnHead: bountyContribution,
        bountiesCollected: 0,
        bountyEarnings: 0,
        eliminationCount: 0,
      });
      this.totalBountyPool += bountyContribution;
    } else if (this.bountyType === BOUNTY_TYPE.MYSTERY) {
      this.mysteryPool += bountyContribution;
      this.totalBountyPool += bountyContribution;
      this.playerBounties.set(playerId, {
        playerId, playerName,
        bountyOnHead: 0,
        bountiesCollected: 0,
        bountyEarnings: 0,
        eliminationCount: 0,
      });
    }

    return { bountyOnHead: bountyContribution, prizePoolContribution };
  }

  /**
   * Track a rebuy's bounty contribution.
   */
  onPlayerRebuy(playerId, rebuyBountyAmount) {
    if (this.bountyType === BOUNTY_TYPE.NONE) return;

    const info = this.playerBounties.get(playerId);
    if (!info) return;

    if (this.bountyType === BOUNTY_TYPE.KO) {
      info.bountyOnHead = this.bountyAmount;
      this.totalBountyPool += rebuyBountyAmount;
    } else if (this.bountyType === BOUNTY_TYPE.PKO) {
      info.bountyOnHead += rebuyBountyAmount;
      this.totalBountyPool += rebuyBountyAmount;
    } else if (this.bountyType === BOUNTY_TYPE.MYSTERY) {
      this.mysteryPool += rebuyBountyAmount;
      this.totalBountyPool += rebuyBountyAmount;
    }
  }

  // ═══════════════════════════════════════════════════════
  // ELIMINATION — core bounty award logic
  // ═══════════════════════════════════════════════════════

  /**
   * Process a bounty award on elimination.
   * @param {string} eliminatedId — the player who busted
   * @param {string} eliminatorId — the player who knocked them out
   * @param {number} playersRemaining — players left after this elimination
   * @returns {{ awards: Array<{playerId, amount, type, label}>, mysteryReveal?: Object } | null}
   */
  onElimination(eliminatedId, eliminatorId, playersRemaining) {
    if (this.bountyType === BOUNTY_TYPE.NONE) return null;
    if (!eliminatorId) return null;
    if (eliminatorId === eliminatedId) return null; // Can't bounty yourself

    const eliminated = this.playerBounties.get(eliminatedId);
    const eliminator = this.playerBounties.get(eliminatorId);
    if (!eliminated || !eliminator) return null;

    const awards = [];
    let mysteryReveal = null;

    switch (this.bountyType) {
      case BOUNTY_TYPE.KO:
        awards.push(...this._processKO(eliminated, eliminator));
        break;
      case BOUNTY_TYPE.PKO:
        awards.push(...this._processPKO(eliminated, eliminator));
        break;
      case BOUNTY_TYPE.MYSTERY: {
        const result = this._processMystery(eliminated, eliminator, playersRemaining);
        if (result) {
          awards.push(...result.awards);
          mysteryReveal = result.mysteryReveal;
        }
        break;
      }
    }

    for (const award of awards) {
      this.bountyHistory.push({
        eliminatorId, eliminatedId,
        amount: award.amount,
        type: award.type,
        timestamp: new Date().toISOString(),
      });
      this.totalBountiesAwarded += award.amount;
    }

    return { awards, mysteryReveal };
  }

  /** @private KO: full fixed bounty to eliminator */
  _processKO(eliminated, eliminator) {
    const amount = eliminated.bountyOnHead;
    if (amount <= 0) return [];

    eliminator.bountyEarnings += amount;
    eliminator.bountiesCollected++;
    eliminator.eliminationCount++;
    eliminated.bountyOnHead = 0;

    return [{
      playerId: eliminator.playerId,
      amount,
      type: 'ko_bounty',
      label: `Knockout bounty: ${eliminated.playerName}`,
    }];
  }

  /** @private PKO: 50% cash to eliminator, 50% added to eliminator's head */
  _processPKO(eliminated, eliminator) {
    const totalBounty = eliminated.bountyOnHead;
    if (totalBounty <= 0) return [];

    const cashPortion = Math.floor(totalBounty / 2);
    const addToHead = totalBounty - cashPortion;

    eliminator.bountyEarnings += cashPortion;
    eliminator.bountiesCollected++;
    eliminator.eliminationCount++;
    eliminator.bountyOnHead += addToHead;
    eliminated.bountyOnHead = 0;

    return [{
      playerId: eliminator.playerId,
      amount: cashPortion,
      type: 'pko_bounty',
      label: `Progressive bounty: ${eliminated.playerName} (${cashPortion} cash + ${addToHead} to your bounty)`,
    }];
  }

  /** @private Mystery: draw weighted envelope if phase is active */
  _processMystery(eliminated, eliminator, playersRemaining) {
    if (!this.mysteryPhaseActive) {
      if (this.mysteryThreshold > 0 && playersRemaining > this.mysteryThreshold) {
        eliminator.eliminationCount++;
        return { awards: [], mysteryReveal: null };
      }
      this.mysteryPhaseActive = true;
      this._generateMysteryEnvelopes(playersRemaining);
    }

    const envelope = this._drawMysteryEnvelope();
    if (!envelope) {
      eliminator.eliminationCount++;
      return { awards: [], mysteryReveal: null };
    }

    eliminator.bountyEarnings += envelope.amount;
    eliminator.bountiesCollected++;
    eliminator.eliminationCount++;
    this.mysteryPool -= envelope.amount;
    this._mysteryAwarded.push({
      eliminatorId: eliminator.playerId,
      eliminatedId: eliminated.playerId,
      ...envelope,
      timestamp: new Date().toISOString(),
    });

    return {
      awards: [{
        playerId: eliminator.playerId,
        amount: envelope.amount,
        type: 'mystery_bounty',
        label: `Mystery Bounty: ${envelope.label} (${envelope.amount})`,
      }],
      mysteryReveal: {
        amount: envelope.amount,
        label: envelope.label,
        multiplier: envelope.multiplier,
        eliminatorName: eliminator.playerName,
        eliminatedName: eliminated.playerName,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // MYSTERY ENVELOPE GENERATION
  // ═══════════════════════════════════════════════════════

  /** @private Generate prize envelopes from the mystery pool */
  _generateMysteryEnvelopes(remainingPlayers) {
    const numEnvelopes = Math.max(remainingPlayers - 1, 1);
    const pool = this.mysteryPool;
    if (pool <= 0 || numEnvelopes === 0) return;

    const basePrize = Math.floor(pool / numEnvelopes);
    const totalWeight = this.mysteryTiers.reduce((s, t) => s + t.weight, 0);
    this._mysteryEnvelopes = [];
    let allocated = 0;

    for (let i = 0; i < numEnvelopes; i++) {
      const tier = this._weightedRandomTier(totalWeight);
      const amount = Math.floor(basePrize * tier.multiplier);
      this._mysteryEnvelopes.push({ amount, label: tier.label, multiplier: tier.multiplier });
      allocated += amount;
    }

    // Normalize so total = pool exactly
    if (allocated > 0 && allocated !== pool) {
      const scale = pool / allocated;
      let runningTotal = 0;
      for (let i = 0; i < this._mysteryEnvelopes.length - 1; i++) {
        this._mysteryEnvelopes[i].amount = Math.floor(this._mysteryEnvelopes[i].amount * scale);
        runningTotal += this._mysteryEnvelopes[i].amount;
      }
      this._mysteryEnvelopes[this._mysteryEnvelopes.length - 1].amount = pool - runningTotal;
    }

    // Shuffle with crypto.randomBytes (Fisher-Yates)
    for (let i = this._mysteryEnvelopes.length - 1; i > 0; i--) {
      const rand = crypto.randomBytes(4).readUInt32BE(0);
      const j = rand % (i + 1);
      [this._mysteryEnvelopes[i], this._mysteryEnvelopes[j]] =
        [this._mysteryEnvelopes[j], this._mysteryEnvelopes[i]];
    }
  }

  /** @private Draw the next envelope from the shuffled stack */
  _drawMysteryEnvelope() {
    return this._mysteryEnvelopes.length > 0 ? this._mysteryEnvelopes.shift() : null;
  }

  /** @private Weighted random selection using crypto PRNG */
  _weightedRandomTier(totalWeight) {
    const rand = crypto.randomBytes(4).readUInt32BE(0) % totalWeight;
    let cumulative = 0;
    for (const tier of this.mysteryTiers) {
      cumulative += tier.weight;
      if (rand < cumulative) return tier;
    }
    return this.mysteryTiers[0];
  }

  // ═══════════════════════════════════════════════════════
  // WINNER FINAL BOUNTY (PKO only)
  // ═══════════════════════════════════════════════════════

  /**
   * PKO: winner collects their own accumulated bounty.
   * Call this when the tournament ends.
   */
  onTournamentEnd(winnerId) {
    if (this.bountyType !== BOUNTY_TYPE.PKO) return null;

    const winner = this.playerBounties.get(winnerId);
    if (!winner || winner.bountyOnHead <= 0) return null;

    const amount = winner.bountyOnHead;
    winner.bountyEarnings += amount;
    winner.bountyOnHead = 0;

    this.bountyHistory.push({
      eliminatorId: winnerId,
      eliminatedId: winnerId,
      amount,
      type: 'pko_self_bounty',
      timestamp: new Date().toISOString(),
    });
    this.totalBountiesAwarded += amount;

    return {
      playerId: winnerId,
      amount,
      type: 'pko_self_bounty',
      label: `Own bounty collected: ${amount}`,
    };
  }

  // ═══════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════

  getPlayerBounty(playerId) {
    return this.playerBounties.get(playerId) || null;
  }

  getState() {
    const leaderboard = [...this.playerBounties.values()]
      .filter(b => b.bountyEarnings > 0 || b.eliminationCount > 0)
      .sort((a, b) => b.bountyEarnings - a.bountyEarnings)
      .slice(0, 20);

    return {
      bountyType: this.bountyType,
      totalBountyPool: this.totalBountyPool,
      totalBountiesAwarded: this.totalBountiesAwarded,
      remainingPool: this.bountyType === BOUNTY_TYPE.MYSTERY ? this.mysteryPool : undefined,
      mysteryPhaseActive: this.bountyType === BOUNTY_TYPE.MYSTERY ? this.mysteryPhaseActive : undefined,
      mysteryEnvelopesRemaining: this.bountyType === BOUNTY_TYPE.MYSTERY ? this._mysteryEnvelopes.length : undefined,
      leaderboard,
      recentAwards: this.bountyHistory.slice(-5),
    };
  }

  getLeaderboard() {
    return [...this.playerBounties.values()]
      .sort((a, b) => b.bountyEarnings - a.bountyEarnings);
  }
}

module.exports = { BountyManager, BOUNTY_TYPE, DEFAULT_MYSTERY_TIERS };
