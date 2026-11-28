/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /api/seo/oembed - oEmbed 1.0 Provider & Partner Installation Manifest API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements the oEmbed 1.0 specification (https://oembed.com/) so CMS
 * platforms (WordPress, Ghost, Discourse, Medium/Embedly, Notion, Substack)
 * automatically convert pasted Smarter.Poker calculator, research, rule,
 * game variant, hand, and comparison URLs into interactive embeds or
 * structured citation cards with canonical attribution.
 *
 * Query Parameters:
 * - url: Canonical https://smarter.poker/... URL to embed
 * - format: 'json' (default; returns 501 for 'xml' per oEmbed 1.0 spec)
 * - maxwidth: Optional maximum width in pixels (default: 800)
 * - maxheight: Optional maximum height in pixels (default: widget height)
 * - partner: Optional partner domain/identifier for utm_source attribution
 * - mode: 'catalog' to return the full Partner Installation & oEmbed Manifest
 */

import { BADGE_PRESETS } from './badge.js';
import { STREAMER_BOT_COMMANDS } from '../stream/cmd.js';
import { RESEARCH_REPORTS, RESEARCH_DATASET_DOI, RESEARCH_DATASET_DOI_URL } from '../../../src/content/research/reports.js';
import { DEAD_TOOL_REPLACEMENTS } from '../../../src/lib/seo/backlinkCatalog.mjs';
import { ZENODO_RECORDS } from '../../../src/lib/seo/datasetCatalog.mjs';
import { recordSeoTelemetryEvent } from './referral-stats.js';

const SITE_ORIGIN = 'https://smarter.poker';

export const OEMBED_CALCULATORS = [
  {
    id: 'odds-calculator',
    title: 'Multiway Poker Odds Calculator',
    description: 'Real-time Texas Hold\'em equity calculator supporting 2 to 10 players, exact card pickers, dead cards, and instant simulation.',
    embedUrl: 'https://smarter.poker/tools/poker-odds-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Free Poker Odds Calculator',
  },
  {
    id: 'icm-calculator',
    title: 'Tournament ICM Calculator',
    description: 'Malmuth-Harville mathematical model converting tournament chip stacks to real dollar equity values for final table and bubble decisions.',
    embedUrl: 'https://smarter.poker/tools/icm-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/icm-calculator',
    height: 720,
    width: '100%',
    creditAnchor: 'Smarter.Poker Tournament ICM Calculator',
  },
  {
    id: 'preflop-ranges',
    title: 'GTO Preflop Range Matrix Hub',
    description: 'Interactive 13x13 preflop starting hand chart covering all 169 combinations and 1,326 combos across 6-max positions.',
    embedUrl: 'https://smarter.poker/tools/preflop-ranges?embed=true',
    landerUrl: 'https://smarter.poker/tools/preflop-ranges',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker GTO Preflop Ranges',
  },
  {
    id: 'pot-odds-calculator',
    title: 'Pot Odds, Implied Odds & MDF Calculator',
    description: 'Instant pot odds, break-even equity percentage, minimum defense frequency (MDF), and outs-to-equity calculator for cash games and tournaments.',
    embedUrl: 'https://smarter.poker/tools/pot-odds-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/pot-odds-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker Pot Odds & MDF Calculator',
  },
  {
    id: 'push-fold-calculator',
    title: 'Short-Stack Push/Fold Nash Equilibrium Chart',
    description: 'Interactive 3BB to 20BB short-stack tournament push/fold Nash equilibrium solver chart across every table position with ante adjustments.',
    embedUrl: 'https://smarter.poker/tools/push-fold-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/push-fold-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Push/Fold Nash Chart',
  },
  {
    id: 'bankroll-calculator',
    title: 'Poker Bankroll & Risk Of Ruin Calculator',
    description: 'Variance simulator and Risk of Ruin (RoR) calculator computing required buy-ins from BB/100 winrate and standard deviation.',
    embedUrl: 'https://smarter.poker/tools/bankroll-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/bankroll-calculator',
    height: 720,
    width: '100%',
    creditAnchor: 'Smarter.Poker Bankroll & Risk Of Ruin Calculator',
  },
  {
    id: 'bounty-calculator',
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    description: 'Progressive Knockout (PKO) and Mystery Bounty chip conversion and calling-equity adjustment calculator using bounty power factors.',
    embedUrl: 'https://smarter.poker/tools/bounty-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/bounty-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker PKO & Mystery Bounty Calculator',
  },
  {
    id: 'poker-winrate-calculator',
    title: 'Poker Winrate (BB/100 To $/Hr) & Volume Calculator',
    description: 'Converts online BB/100 and live hourly winrates into projected monthly and annual earnings with confidence intervals.',
    embedUrl: 'https://smarter.poker/tools/poker-winrate-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
    height: 720,
    width: '100%',
    creditAnchor: 'Smarter.Poker Winrate & Hourly Earnings Calculator',
  },
  {
    id: 'side-pot-calculator',
    title: 'Multi-Way All-In Main & Side Pot Calculator',
    description: 'Slices multi-way all-in confrontations for up to 9 players into exact main pot and sequential side pots with dead money and uncalled bet returns.',
    embedUrl: 'https://smarter.poker/tools/side-pot-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/side-pot-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Multi-Way Side Pot Calculator',
  },
  {
    id: 'blind-structure-calculator',
    title: 'Tournament Blind Structure & Chip Distribution Generator',
    description: 'Generates TDA-compliant home game and club tournament blind schedules, big blind ante progressions, color-up levels, and starting chip counts.',
    embedUrl: 'https://smarter.poker/tools/blind-structure-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/blind-structure-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Tournament Blind Structure Generator',
  },
  {
    id: 'spr-calculator',
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
    description: 'Calculates effective Stack-To-Pot Ratio (SPR), commitment zones, and exact 1-street, 2-street, and 3-street geometric bet sizing percentages.',
    embedUrl: 'https://smarter.poker/tools/spr-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/spr-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker SPR & Geometric Sizing Calculator',
  },
  {
    id: 'plo-bet-calculator',
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    description: 'Calculates exact Pot-Limit Omaha maximum bet and raise sizes using the 3x plus trail formula and solves double-board bomb pot split equity.',
    embedUrl: 'https://smarter.poker/tools/plo-bet-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/plo-bet-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker PLO Max Bet & Bomb Pot Calculator',
  },
  {
    id: 'payout-calculator',
    title: 'Tournament Payout & Prize Pool Distribution Calculator',
    description: 'Generates TDA-compliant tournament prize pool payouts across Top 10%, Top 15%, Top 20%, and Winner-Take-All structures with ICM bubble factors.',
    embedUrl: 'https://smarter.poker/tools/payout-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/payout-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Tournament Payout Calculator',
  },
  {
    id: 'rake-calculator',
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    description: 'Compares casino percentage pot drop rake plus jackpot drops against timed seat collection in $/Hr, BB/100 drag, and 1,000-hour annual cost.',
    embedUrl: 'https://smarter.poker/tools/rake-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/rake-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Live Cash Rake Calculator',
  },
  {
    id: '3bet-calculator',
    title: 'GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator',
    description: 'Calculates solver-approved In-Position and Out-Of-Position 3-bet, multiway squeeze, and 4-bet sizing in big blinds with villain MDF.',
    embedUrl: 'https://smarter.poker/tools/3bet-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/3bet-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker GTO 3-Bet & 4-Bet Calculator',
  },
  {
    id: 'chop-calculator',
    title: 'Final Table Deal & ICM Chop Calculator',
    description: 'Compares exact Malmuth-Harville ICM chop, linear chip chop, and hybrid save-amount final table deal payouts side by side.',
    embedUrl: 'https://smarter.poker/tools/chop-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/chop-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Final Table ICM Chop Calculator',
  },
  {
    id: 'variance-calculator',
    title: 'Poker Variance & Downswing Simulator',
    description: 'Calculates 1-SD, 2-SD, and 3-SD winrate confidence intervals, probability of loss, and expected downswing thresholds across any hand sample.',
    embedUrl: 'https://smarter.poker/tools/variance-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/variance-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Variance & Downswing Simulator',
  },
  {
    id: 'outs-calculator',
    title: 'Poker Outs & Draw Probability Calculator',
    description: 'Computes exact hypergeometric turn, river, and combined flop-to-river draw equity, Rule of 4 and 2 error, and minimum implied odds.',
    embedUrl: 'https://smarter.poker/tools/outs-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/outs-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker Outs & Draw Probability Calculator',
  },
  {
    id: 'poker-tax-calculator',
    title: 'US Poker Tax & Form W-2G Calculator',
    description: 'Estimates US federal poker taxes, IRS Form W-2G $5,000 net tournament triggers, and Schedule A vs Schedule C session deductions.',
    embedUrl: 'https://smarter.poker/tools/poker-tax-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/poker-tax-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker US Poker Tax & Form W-2G Calculator',
  },
  {
    id: 'staking-calculator',
    title: 'Poker Staking & Markup Split Calculator',
    description: 'Calculates tournament staking markup, investor share cost, package EV breakeven ROI, and post-series payout splits.',
    embedUrl: 'https://smarter.poker/tools/staking-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/staking-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Staking & Markup Calculator',
  },
  {
    id: 'iso-calculator',
    title: 'Pre-Flop Isolation Raise Sizing Calculator',
    description: 'Calculates optimal pre-flop isolation raise sizing against live and online limpers based on position, stack depth, and resulting flop SPR.',
    embedUrl: 'https://smarter.poker/tools/iso-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/iso-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker Pre-Flop Isolation Raise Calculator',
  },
  {
    id: 'home-game-kit',
    title: 'Home Game Chip Set & Setup Calculator',
    description: 'Calculates per-player starting chip tube breakdowns for 300, 500, and 1,000 piece sets with color-up schedules and house rules.',
    embedUrl: 'https://smarter.poker/tools/home-game-kit?embed=true',
    landerUrl: 'https://smarter.poker/tools/home-game-kit',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Home Game Chip Set Calculator',
  },
  {
    id: 'format-quiz',
    title: 'Poker Format Selector & Study Roadmap Quiz',
    description: 'Interactive 5-parameter diagnostic matching your session schedule, bankroll cushion, and variance tolerance to a 7-day study plan.',
    embedUrl: 'https://smarter.poker/tools/format-quiz?embed=true',
    landerUrl: 'https://smarter.poker/tools/format-quiz',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Format Selector Quiz',
  },
  {
    id: 'board-texture-analyzer',
    title: 'Flop Board Texture & GTO C-Bet Strategy Analyzer',
    description: 'Classifies any 3-card flop by suit texture, pairing, connectedness, PFR vs. BB range/nut advantage, and solver C-bet sizing.',
    embedUrl: 'https://smarter.poker/tools/board-texture-analyzer?embed=true',
    landerUrl: 'https://smarter.poker/tools/board-texture-analyzer',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Flop Board Texture & C-Bet Analyzer',
  },
  {
    id: 'm-ratio-calculator',
    title: 'Tournament Harrington M-Ratio & Effective M Calculator',
    description: 'Computes orbit cost, raw Harrington M-Ratio, short-handed Effective M, Q-Ratio, and 5-Zone tournament survival strategy.',
    embedUrl: 'https://smarter.poker/tools/m-ratio-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/m-ratio-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Harrington M-Ratio Calculator',
  },
  {
    id: 'session-planner',
    title: 'Live Cash Game Session, Stop-Loss & Annual Income Planner',
    description: 'Projects net hourly and annual cash-game income after comps and expenses, stop-loss limits, and 5% Risk-of-Ruin bankroll targets.',
    embedUrl: 'https://smarter.poker/tools/session-planner?embed=true',
    landerUrl: 'https://smarter.poker/tools/session-planner',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Cash Game Session & Bankroll Planner',
  },
  {
    id: 'straddle-calculator',
    title: 'Live Straddle & Double-Board Bomb Pot EV Calculator',
    description: 'Calculates UTG and Mississippi Button straddle effective stack reduction, steal thresholds, and multi-way bomb pot dead money math.',
    embedUrl: 'https://smarter.poker/tools/straddle-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/straddle-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Live Straddle & Bomb Pot Calculator',
  },
  {
    id: 'hand-converter',
    title: 'Poker Hand History Formatter & SPR Street Analyzer',
    description: 'Converts raw poker hand details into clean Reddit, TwoPlusTwo, Discord, and AI Solver markdown with street-by-street SPR.',
    embedUrl: 'https://smarter.poker/tools/hand-converter?embed=true',
    landerUrl: 'https://smarter.poker/tools/hand-converter',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker Hand History Formatter',
  },
  {
    id: 'satellite-calculator',
    title: 'Satellite Bubble Factor & Seat-Lock Threshold Calculator',
    description: 'Computes flat-payout tournament satellite seat-lock chip targets, bubble factors, and fold-AA survival thresholds.',
    embedUrl: 'https://smarter.poker/tools/satellite-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/satellite-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Satellite Bubble & Seat-Lock Calculator',
  },
  {
    id: 'promo-ev-calculator',
    title: 'Bad Beat Jackpot (BBJ) & High-Hand Promo EV Calculator',
    description: 'Calculates exact Bad Beat Jackpot breakeven pool thresholds, table-share EV, and hourly high-hand promo drop rebates.',
    embedUrl: 'https://smarter.poker/tools/promo-ev-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/promo-ev-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Bad Beat Jackpot & Promo EV Calculator',
  },
  {
    id: 'who-wins-calculator',
    title: 'Texas Hold\'em Showdown Winner & Kicker Resolver',
    description: 'Evaluates any two Hold\'em hands across a 5-card board to determine the exact winning 5-card hand, kicker, or split pot.',
    embedUrl: 'https://smarter.poker/tools/who-wins-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/who-wins-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Hold\'em Showdown Winner Calculator',
  },
  {
    id: 'mixed-game-placards',
    title: 'Mixed-Game Rotation Tracker & Printable Table Placards',
    description: 'Interactive H.O.R.S.E., 8-Game, and 10-Game orbit rotation tracker with printable table placards and dealing rules.',
    embedUrl: 'https://smarter.poker/tools/mixed-game-placards?embed=true',
    landerUrl: 'https://smarter.poker/tools/mixed-game-placards',
    height: 800,
    width: '100%',
    creditAnchor: 'Smarter.Poker Mixed-Game Rotation & Table Placards',
  },
  {
    id: 'poker-iq-test',
    title: '10-Question Quantitative GTO Poker IQ Diagnostic Test',
    description: 'Tests pot odds, MDF, Malmuth-Harville ICM, preflop ranges, combinatorics, and TDA rules with instant percentile scoring.',
    embedUrl: 'https://smarter.poker/tools/poker-iq-test?embed=true',
    landerUrl: 'https://smarter.poker/tools/poker-iq-test',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker GTO Poker IQ Test',
  },
  {
    id: 'gto-leak-finder',
    title: '60-Second GTO Poker Leak Finder Diagnostic',
    description: 'Interactive 5-hand 100BB cash and MTT ICM solver diagnostic estimating BB/100 EV loss across five core strategy pillars.',
    embedUrl: 'https://smarter.poker/tools/gto-leak-finder?embed=true',
    landerUrl: 'https://smarter.poker/tools/gto-leak-finder',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker 60-Second GTO Leak Finder',
  },
  {
    id: 'geometric-bet-calculator',
    title: 'Geometric Bet Sizing (2e & 3e) Street Calculator',
    description: 'Computes exact 1-street, 2-street (2e), and 3-street (3e) geometric pot-fraction bet sizing and villain MDF across flop, turn, and river.',
    embedUrl: 'https://smarter.poker/tools/geometric-bet-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/geometric-bet-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Geometric Bet Sizing Calculator',
  },
  {
    id: 'late-reg-calculator',
    title: 'Tournament Late-Registration ICM & Equity Boost Calculator',
    description: 'Calculates tournament late-registration ICM starting-stack equity appreciation, elimination boost, and registration overlay advantage.',
    embedUrl: 'https://smarter.poker/tools/late-reg-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/late-reg-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Late-Registration ICM Calculator',
  },
  {
    id: 'mtt-grind-planner',
    title: 'MTT Sunday Grind Schedule, ABI & Bankroll Planner',
    description: 'Models multi-table tournament session buy-in exposure, Average Buy-In (ABI), peak concurrent table load, and 100-to-300 ABI bankroll cushions.',
    embedUrl: 'https://smarter.poker/tools/mtt-grind-planner?embed=true',
    landerUrl: 'https://smarter.poker/tools/mtt-grind-planner',
    height: 800,
    width: '100%',
    creditAnchor: 'Smarter.Poker MTT Grind & ABI Planner',
  },
  {
    id: 'plo-outs-calculator',
    title: 'PLO4 & PLO5 Straight Wrap Outs & Nut Equity Calculator',
    description: 'Computes 13-out, 16-out, 17-out, and 20-out Omaha straight wrap plus flush redraw hypergeometric turn-and-river equity and nut-out ratios.',
    embedUrl: 'https://smarter.poker/tools/plo-outs-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/plo-outs-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker PLO Wrap & Outs Calculator',
  },
  {
    id: 'poker-trip-planner',
    title: 'Poker Trip, Travel Overhead & Breakeven EV Planner',
    description: 'Calculates live poker festival flight, hotel, and per-diem expense drag against cash-game hours and tournament buy-in volume.',
    embedUrl: 'https://smarter.poker/tools/poker-trip-planner?embed=true',
    landerUrl: 'https://smarter.poker/tools/poker-trip-planner',
    height: 800,
    width: '100%',
    creditAnchor: 'Smarter.Poker Festival Trip & Overhead Planner',
  },
  {
    id: 'shot-clock',
    title: 'TDA Tournament Shot Clock & Time-Bank Manager',
    description: 'Live tournament action timer supporting 15s, 20s, and 30s shot clocks, 30-second time-bank extensions, and TDA first-action adjustments.',
    embedUrl: 'https://smarter.poker/tools/shot-clock?embed=true',
    landerUrl: 'https://smarter.poker/tools/shot-clock',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker TDA Tournament Shot Clock',
  },
  {
    id: 'table-selection-calculator',
    title: 'Live Cash Game Table Selection & Winrate Multiplier Calculator',
    description: 'Scores live cash game table profitability from recreational player count, average stack depth, VPIP splashiness, and hourly rake drag.',
    embedUrl: 'https://smarter.poker/tools/table-selection-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/table-selection-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Live Table Selection Calculator',
  },
  {
    id: 'winrate-confidence-calculator',
    title: 'Poker Winrate Confidence Interval (70% / 95% / 99%) Calculator',
    description: 'Computes 70%, 95%, and 99% BB/100 winrate confidence bounds, true probability of loss, and hands required for statistical proof.',
    embedUrl: 'https://smarter.poker/tools/winrate-confidence-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/winrate-confidence-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Winrate Confidence Calculator',
  },
  {
    id: 'multiway-all-in-calculator',
    title: 'Multiway All-In EV & Side Pot Equity Calculator',
    description: 'Slices 3-way and 4-way pre-flop all-in confrontations into main pot and sequential side pots with exact equity weighting and net EV per stack.',
    embedUrl: 'https://smarter.poker/tools/multiway-all-in-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/multiway-all-in-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Multiway All-In EV Calculator',
  },
  {
    id: 'mystery-bounty-tracker',
    title: 'Live Day-2 Mystery Bounty Envelope Removal Tracker',
    description: 'Live Day-2 Mystery Bounty envelope removal tracker dynamically recomputing average remaining bounty value, chip equivalence, and pot odds discount.',
    embedUrl: 'https://smarter.poker/tools/mystery-bounty-tracker?embed=true',
    landerUrl: 'https://smarter.poker/tools/mystery-bounty-tracker',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Mystery Bounty Envelope Tracker',
  },
  {
    id: 'bubble-factor-calculator',
    title: 'Final Table Pairwise ICM Bubble Factor & Equity Matrix',
    description: 'Computes the complete final table N x N pairwise Malmuth-Harville ICM bubble factor and required all-in calling equity matrix for every stack pair.',
    embedUrl: 'https://smarter.poker/tools/bubble-factor-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/bubble-factor-calculator',
    height: 800,
    width: '100%',
    creditAnchor: 'Smarter.Poker Final Table Bubble Factor Matrix',
  },
  {
    id: 'bluff-catching-calculator',
    title: 'River Bluff-Catching, Card-Removal Blockers & MDF Solver',
    description: 'Calculates river Minimum Defense Frequency (MDF), polarized bluff-to-value ratios, actual villain bluff share after Hero blocker removal, and exact call EV.',
    embedUrl: 'https://smarter.poker/tools/bluff-catching-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/bluff-catching-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker River Bluff-Catching Solver',
  },
  {
    id: 'multi-street-ev-calculator',
    title: 'Multi-Street Double & Triple-Barrel Fold-Equity EV Solver',
    description: 'Solves flop-turn-river double and triple-barrel cumulative fold equity, street-by-street pot growth geometry, and multi-street bluff breakeven frequencies.',
    embedUrl: 'https://smarter.poker/tools/multi-street-ev-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/multi-street-ev-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Multi-Street Barrel EV Solver',
  },
  {
    id: 'heads-up-push-fold-calculator',
    title: 'Heads-Up & 3-Max Spin Push/Fold Nash Equilibrium Solver',
    description: 'Interactive 13x13 Heads-Up and 3-Max Spin/Hyper SNG 1BB-25BB Nash equilibrium Small Blind push, Big Blind call, and limp-trap hand matrix explorer.',
    embedUrl: 'https://smarter.poker/tools/heads-up-push-fold-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/heads-up-push-fold-calculator',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker Heads-Up Push/Fold Nash Solver',
  },
  {
    id: 'blind-vs-blind-calculator',
    title: 'Blind-Vs-Blind (SB Vs. BB) Limp, Open & 3-Bet Matrix Explorer',
    description: 'Explores 100BB, 50BB, and 25BB Blind-vs-Blind Small Blind limp/raise strategies and Big Blind iso-raise/3-bet defense frequencies across a 13x13 grid.',
    embedUrl: 'https://smarter.poker/tools/blind-vs-blind-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/blind-vs-blind-calculator',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker Blind-Vs-Blind SB Vs. BB Explorer',
  },
  {
    id: 'shot-taking-calculator',
    title: '2-Tier Bankroll Shot-Taking & Move-Down Stop-Loss Planner',
    description: 'Plans disciplined higher-stake shot-taking with mandatory move-down stop-loss triggers, blended Risk of Ruin, and rebuild duration at base stakes.',
    embedUrl: 'https://smarter.poker/tools/shot-taking-calculator?embed=true',
    landerUrl: 'https://smarter.poker/tools/shot-taking-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Bankroll Shot-Taking Planner',
  },
  {
    id: 'warmup-cooldown-routine',
    title: 'Interactive Poker Pre-Session Warmup & Post-Session Cooldown Tool',
    description: 'Combines a pre-session pot-odds and MDF flash math warmup drill with an A-Game readiness scorecard and post-session decision quality cooldown audit.',
    embedUrl: 'https://smarter.poker/tools/warmup-cooldown-routine?embed=true',
    landerUrl: 'https://smarter.poker/tools/warmup-cooldown-routine',
    height: 800,
    width: '100%',
    creditAnchor: 'Smarter.Poker Pre-Session Warmup & Cooldown Tool',
  },
  {
    id: 'home-game-director',
    title: 'Live Home Game Tournament Director Clock & Payout Console',
    description: 'Full-screen home game tournament director blind timer with live rebuy/add-on prize pool counter, table average Harrington M-Ratio monitor, and payout splitter.',
    embedUrl: 'https://smarter.poker/tools/home-game-director?embed=true',
    landerUrl: 'https://smarter.poker/tools/home-game-director',
    height: 800,
    width: '100%',
    creditAnchor: 'Smarter.Poker Home Game Tournament Director',
  },
];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizePartnerSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function buildOembedPayload({
  url = '',
  maxwidth = 800,
  maxheight = 820,
  partner = '',
} = {}) {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) {
    return { status: 400, body: { error: 'Missing required url query parameter' } };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { status: 404, body: { error: 'Invalid URL' } };
  }

  if (parsed.hostname !== 'smarter.poker' && parsed.hostname !== 'www.smarter.poker') {
    return { status: 404, body: { error: 'URL must belong to https://smarter.poker' } };
  }

  const pathname = parsed.pathname.replace(/\/$/, '') || '/';
  const width = Math.min(1200, Math.max(320, Number(maxwidth) || 800));
  const partnerSlug = sanitizePartnerSlug(partner || parsed.searchParams.get('utm_source') || '');
  const utmSuffix = partnerSlug
    ? `&utm_source=${encodeURIComponent(partnerSlug)}&utm_medium=oembed&utm_campaign=partner_embed`
    : '';
  const landerUtmSuffix = partnerSlug
    ? `?utm_source=${encodeURIComponent(partnerSlug)}&utm_medium=oembed&utm_campaign=partner_embed`
    : '';

  const matchedWidget = OEMBED_CALCULATORS.find((w) => {
    const toolPath = w.landerUrl.replace(SITE_ORIGIN, '').replace(/\/$/, '');
    return toolPath === pathname;
  });

  if (matchedWidget) {
    const height = Math.min(
      1000,
      Math.max(480, Math.min(Number(maxheight) || matchedWidget.height, matchedWidget.height))
    );
    const iframeSrc = `${matchedWidget.embedUrl}${utmSuffix}`;
    const landerHref = `${matchedWidget.landerUrl}${landerUtmSuffix}`;
    const html = `<iframe src="${escapeHtml(iframeSrc)}" width="100%" height="${height}" frameborder="0" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="border:0;border-radius:12px;overflow:hidden;max-width:${width}px;" title="${escapeHtml(matchedWidget.title)}"></iframe><p style="font-size:12px;text-align:center;color:#94AFCC;margin-top:6px;">Powered By <a href="${escapeHtml(landerHref)}" target="_blank" rel="noopener" style="color:#4E9CFF;text-decoration:none;font-weight:600;">${escapeHtml(matchedWidget.creditAnchor)}</a></p>`;

    return {
      status: 200,
      body: {
        version: '1.0',
        type: 'rich',
        provider_name: 'Smarter.Poker',
        provider_url: SITE_ORIGIN,
        title: matchedWidget.title,
        author_name: 'Smarter.Poker Engineering & Quantitative Research',
        author_url: `${SITE_ORIGIN}/tools`,
        width,
        height,
        thumbnail_url: `${SITE_ORIGIN}/api/og/tool-card?tool=${encodeURIComponent(matchedWidget.id)}&title=${encodeURIComponent(matchedWidget.title)}`,
        thumbnail_width: 1200,
        thumbnail_height: 630,
        cache_age: 86400,
        html,
      },
    };
  }

  if (pathname.startsWith('/research/')) {
    const slug = pathname.replace('/research/', '');
    const report = RESEARCH_REPORTS.find((r) => r.slug === slug);
    if (report) {
      const canonicalUrl = `${SITE_ORIGIN}/research/${report.slug}`;
      const hrefWithUtm = `${canonicalUrl}${landerUtmSuffix}`;
      const keyFinding = report.keyFindings?.[0] || report.subtitle;
      const html = `<blockquote class="smarter-poker-citation" cite="${escapeHtml(canonicalUrl)}" style="margin:16px 0;padding:18px 20px;background:#0d1524;border-left:4px solid #38bdf8;border-radius:10px;color:#f8fafc;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;"><p style="margin:0 0 10px 0;font-size:15px;line-height:1.55;font-weight:600;">${escapeHtml(keyFinding)}</p><footer style="font-size:12.5px;color:#94a3b8;">Source: <a href="${escapeHtml(hrefWithUtm)}" target="_blank" rel="noopener" style="color:#38bdf8;font-weight:700;text-decoration:none;">${escapeHtml(report.title)} (Smarter.Poker Research)</a> • Parent Dataset Archive: <a href="${escapeHtml(RESEARCH_DATASET_DOI_URL)}" target="_blank" rel="noopener" style="color:#7dd3fc;text-decoration:none;">Zenodo DOI ${escapeHtml(RESEARCH_DATASET_DOI)}</a></footer></blockquote>`;

      return {
        status: 200,
        body: {
          version: '1.0',
          type: 'rich',
          provider_name: 'Smarter.Poker Research',
          provider_url: `${SITE_ORIGIN}/research`,
          title: report.title,
          author_name: 'Smarter.Poker Research Division',
          author_url: `${SITE_ORIGIN}/research`,
          width,
          height: 220,
          thumbnail_url: `${SITE_ORIGIN}/api/og/tool-card?tool=research&title=${encodeURIComponent(report.shortTitle || report.title)}`,
          thumbnail_width: 1200,
          thumbnail_height: 630,
          cache_age: 86400,
          html,
        },
      };
    }
  }

  const canonicalUrl = `${SITE_ORIGIN}${pathname === '/' ? '' : pathname}`;
  const hrefWithUtm = `${canonicalUrl}${landerUtmSuffix}`;
  const fallbackTitle =
    pathname === '/'
      ? 'Smarter.Poker: GTO Poker Training, 52 Free Calculators & Live Poker Room Directory'
      : `Smarter.Poker Reference (${pathname})`;
  const html = `<div class="smarter-poker-embed-card" style="padding:16px 20px;background:#0d1524;border:1px solid rgba(56,189,248,0.3);border-radius:10px;color:#f8fafc;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;"><a href="${escapeHtml(hrefWithUtm)}" target="_blank" rel="noopener" style="color:#38bdf8;font-size:15px;font-weight:700;text-decoration:none;">${escapeHtml(fallbackTitle)}</a><p style="margin:6px 0 0 0;font-size:12.5px;color:#94a3b8;">Interactive Poker Calculators, GTO Preflop Ranges, And Empirical Benchmarks At Smarter.Poker</p></div>`;

  return {
    status: 200,
    body: {
      version: '1.0',
      type: 'rich',
      provider_name: 'Smarter.Poker',
      provider_url: SITE_ORIGIN,
      title: fallbackTitle,
      author_name: 'Smarter.Poker',
      author_url: SITE_ORIGIN,
      width,
      height: 160,
      thumbnail_url: `${SITE_ORIGIN}/api/seo/badge?mode=og`,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      cache_age: 86400,
      html,
    },
  };
}

export function buildPartnerInstallationCatalog({ partner = '' } = {}) {
  const partnerSlug = sanitizePartnerSlug(partner);
  const utmQuery = partnerSlug
    ? `&utm_source=${encodeURIComponent(partnerSlug)}&utm_medium=embed&utm_campaign=partner_kit`
    : '';
  const badgeKeys = Object.keys(BADGE_PRESETS);

  return {
    schema_version: '1.0.0',
    generated_at: '2026-11-10',
    provider_name: 'Smarter.Poker',
    provider_url: SITE_ORIGIN,
    embed_portal_url: `${SITE_ORIGIN}/tools/embeds`,
    one_line_sdk_url: `${SITE_ORIGIN}/embed-sdk.js`,
    oembed_endpoint: `${SITE_ORIGIN}/api/seo/oembed`,
    partner_attribution_slug: partnerSlug || null,
    counts: {
      embeddable_calculators: OEMBED_CALCULATORS.length,
      svg_attribution_badges: badgeKeys.length,
      streamer_chat_commands: STREAMER_BOT_COMMANDS.length,
      dead_tool_replacements: DEAD_TOOL_REPLACEMENTS.length,
      zenodo_dataset_deposits: ZENODO_RECORDS.length,
    },
    one_line_sdk_example: `<div data-smarter-poker-widget="odds-calculator"${partnerSlug ? ` data-partner="${partnerSlug}"` : ''}></div>\n<script async src="https://smarter.poker/embed-sdk.js"></script>`,
    calculators: OEMBED_CALCULATORS.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description,
      lander_url: w.landerUrl,
      embed_url: `${w.embedUrl}${utmQuery}`,
      oembed_url: `${SITE_ORIGIN}/api/seo/oembed?url=${encodeURIComponent(w.landerUrl)}&format=json${partnerSlug ? `&partner=${encodeURIComponent(partnerSlug)}` : ''}`,
      sdk_snippet: `<div data-smarter-poker-widget="${w.id}"${partnerSlug ? ` data-partner="${partnerSlug}"` : ''}></div><script async src="https://smarter.poker/embed-sdk.js"></script>`,
    })),
    badges: badgeKeys.map((type) => ({
      type,
      label: BADGE_PRESETS[type].label,
      value: BADGE_PRESETS[type].value,
      badge_url: `${SITE_ORIGIN}/api/seo/badge?type=${encodeURIComponent(type)}`,
    })),
    streamer_commands: STREAMER_BOT_COMMANDS,
    zenodo_dataset_deposits: ZENODO_RECORDS,
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    url = '',
    format = 'json',
    maxwidth = '800',
    maxheight = '820',
    partner = '',
    mode = '',
  } = req.query || {};

  if (String(format || 'json').toLowerCase() === 'xml') {
    return res.status(501).json({ error: 'XML oEmbed format not implemented; use format=json' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (String(mode || '').toLowerCase() === 'catalog' || !url) {
    recordSeoTelemetryEvent({
      category: 'oembed_discoveries',
      item: 'catalog',
      partner: partner || req.headers?.referer || '',
      source: 'oembed-catalog',
      req,
    });
    return res.status(200).json(buildPartnerInstallationCatalog({ partner }));
  }

  const result = buildOembedPayload({ url, maxwidth, maxheight, partner });
  recordSeoTelemetryEvent({
    category: 'oembed_discoveries',
    item: url,
    partner: partner || req.headers?.referer || '',
    source: 'oembed-url',
    req,
  });
  return res.status(result.status).json(result.body);
}
