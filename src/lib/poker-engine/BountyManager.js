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
 *     - Winner collects their own remaining bounty
 *
 *   Mystery Bounty:
 *     - All bounty contributions go into a shared pool
 *     - Bounties NOT awarded during early phase
 *     - After threshold (e.g., Day 2 / top X players), each elimination
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
  KO: 'ko',           // Standard Knockout
  PKO: 'pko',         // Progressive Knockout
  MYSTERY: 'mystery',  // Mystery Bounty
};

// ═══════════════════════════════════════════════════════
// DEFAULT MYSTERY BOUNTY PRIZE DISTRIBUTION
// ═══════════════════════════════════════════════════════
// Weighted distribution: most players get small prizes,
// a few get massive jackpots. Weights must sum to pool amount.
// Percentages of the mystery pool allocated per tier.

const DEFAULT_MYSTERY_TIERS = [
  { label: 'Min Prize',     multiplier: 1,    weight: 500 },  // 50% of envelopes
  { label: 'Small Prize',   multiplier: 1.5,  weight: 200 },  // 20%
  { label: 'Medium Prize',  multiplier: 3,    weight: 150 },  // 15%
  { label: 'Large Prize',   multiplier: 5,    weight: 80 },   // 8%
  { label: 'Huge Prize',    multiplier: 10,   weight: 40 },   // 4%
  { label: 'Mega Prize',    multiplier: 25,   weight: 20 },   // 2%
  { label: 'Grand Prize',   multiplier: 50,   weight: 8 },    // 0.8%
  { label: 'JACKPOT',       multiplier: 100,  weight: 2 },    // 0.2%
];

// ═══════════════════════════════════════════════════════
// BOUNTY MANAGER
// ═══════════════════════════════════════════════════════

class BountyManager {
  /**
   * @param {Object} config
   * @param {string} config.bountyType — 'ko' | 'pko' | 'mystery'
   * @param {number} config.bountyAmount — chips allocated per player to bounty
   * @param {number} config.totalBuyIn — full buy-in amount (bounty portion is split from this)
   * @param {number} [config.mysteryThreshold] — for mystery: eliminations begin after
   *   field reduces to this many players (e.g., 15% of field)
   * @param {Array} [config.mysteryTiers] — custom mystery bounty distribution
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
    this._mysteryEnvelopes = []; // Pre-generated prize envelopes
    this._mysteryAwarded = [];   // History of mystery prizes awarded

    // Per-player bounty tracking: Map<playerId, BountyInfo>
    this.playerBounties = new Map();

    // Aggregate tracking
    this.totalBountyPool = 0;
    this.totalBountiesAwarded = 0;
    this.bountyHistory = []; // { eliminatorId, eliminatedId, amount, type, timestamp }
  }

  // ═══════════════════════════════════════════════════════
  // REGISTRATION — called when a player registers/rebuys
  // ═══════════════════════════════════════════════════════

  /**
   * Track a player's bounty on registration.
   * @param {string} playerId
   * @param {string} playerName
   * @returns {{ bountyOnHead: number, prizePoolContribution: number }}
   */
  onPlayerRegister(playerId, playerName) {
    if (this.bountyType === BOUNTY_TYPE.NONE) {
      return { bountyOnHead: 0, prizePoolContribution: this.totalBuyIn };
    }

    const bountyContribution = this.bountyAmount;
    const prizePoolContribution = this.totalBuyIn - bountyContribution;

    if (this.bountyType === BOUNTY_TYPE.KO || this.bountyType === BOUNTY_TYPE.PKO) {
      // Each player starts with their own bounty on their head
      this.playerBounties.set(playerId, {
        playerId,
        playerName,
        bountyOnHead: bountyContribution,
        bountiesCollected: 0,
        bountyEarnings: 0,
        eliminationCount: 0,
      });
      this.totalBountyPool += bountyContribution;
    } else if (this.bountyType === BOUNTY_TYPE.MYSTERY) {
      // Mystery: all bounty money goes to shared pool
      this.mysteryPool += bountyContribution;
      this.totalBountyPool += bountyContribution;
      this.playerBounties.set(playerId, {
        playerId,
        playerName,
        bountyOnHead: 0, // No visible bounty — mystery
        bountiesCollected: 0,
        bountyEarnings: 0,
        eliminationCount: 0,
      });
    }

    return { bountyOnHead: bountyContribution, prizePoolContribution };
  }

  /**
   * Track a rebuy's bounty contribution.
   * @param {string} playerId
   * @param {number} rebuyBountyAmount — bounty portion of rebuy cost
   */
  onPlayerRebuy(playerId, rebuyBountyAmount) {
    if (this.bountyType === BOUNTY_TYPE.NONE) return