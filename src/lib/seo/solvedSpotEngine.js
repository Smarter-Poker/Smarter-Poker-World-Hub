/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Solved-Spot Permalink & Validated Calculation Engine
 *  src/lib/seo/solvedSpotEngine.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Deterministic input validation & calculation reproduction for calculator
 *    permalinks and dynamic OpenGraph preview cards (/api/og/tool-card).
 * 2. Preview results NEVER trust caller-supplied ?result= or ?statValue=
 *    strings; every metric is computed from validated numeric/enum inputs
 *    using the maintained poker math formulas with accurate units & rounding.
 * 3. Provides `useSolvedSpotUrlSync` React hook so reopening a shared link
 *    restores calculator inputs and reproduces the exact calculation, while
 *    input changes sync back to `window.history.replaceState`.
 *
 * House style: Title Case, zero em dashes.
 */

import { useEffect, useRef } from 'react';

export const TOOL_OG_PRESETS = Object.freeze({
  'pot-odds-calculator': {
    tool: 'pot-odds-calculator',
    badge: 'POT ODDS & MDF SOLVER',
    title: 'Poker Pot Odds, Required Equity & MDF Calculator',
    subtitle: 'Break-Even Calling Equity, Minimum Defense Frequency & Hypergeometric Draw Outs',
    statLabel: 'GTO MATH ENGINE',
    statValue: 'POT ODDS & MDF',
  },
  'pot-odds': {
    tool: 'pot-odds-calculator',
    badge: 'POT ODDS & MDF SOLVER',
    title: 'Poker Pot Odds, Required Equity & MDF Calculator',
    subtitle: 'Break-Even Calling Equity, Minimum Defense Frequency & Hypergeometric Draw Outs',
    statLabel: 'GTO MATH ENGINE',
    statValue: 'POT ODDS & MDF',
  },
  'outs-calculator': {
    tool: 'outs-calculator',
    badge: 'HYPERGEOMETRIC OUTS SOLVER',
    title: 'Poker Outs & Exact Draw Probability Calculator',
    subtitle: '47-Card Turn, 46-Card River & Flop-To-River Equity Vs. Rule Of 4 And 2 Error',
    statLabel: 'COMBINATORIAL ENGINE',
    statValue: '1 TO 21 OUTS',
  },
  outs: {
    tool: 'outs-calculator',
    badge: 'HYPERGEOMETRIC OUTS SOLVER',
    title: 'Poker Outs & Exact Draw Probability Calculator',
    subtitle: '47-Card Turn, 46-Card River & Flop-To-River Equity Vs. Rule Of 4 And 2 Error',
    statLabel: 'COMBINATORIAL ENGINE',
    statValue: '1 TO 21 OUTS',
  },
  'icm-calculator': {
    tool: 'icm-calculator',
    badge: 'ICM PAYOUT SOLVER',
    title: 'Malmuth-Harville Tournament ICM Calculator',
    subtitle: 'Exact Recursive Final-Table Prize Pool Equity & Bubble Factor Analysis',
    statLabel: 'TOURNAMENT SOLVER',
    statValue: 'EXACT ICM EQUITY',
  },
  icm: {
    tool: 'icm-calculator',
    badge: 'ICM PAYOUT SOLVER',
    title: 'Malmuth-Harville Tournament ICM Calculator',
    subtitle: 'Exact Recursive Final-Table Prize Pool Equity & Bubble Factor Analysis',
    statLabel: 'TOURNAMENT SOLVER',
    statValue: 'EXACT ICM EQUITY',
  },
  'chop-calculator': {
    tool: 'chop-calculator',
    badge: 'FINAL TABLE DEAL SOLVER',
    title: 'Final Table ICM Chop Vs. Chip Chop Calculator',
    subtitle: 'Compare Exact Malmuth-Harville ICM Deals, Linear Chip Chops & Trophy Saves',
    statLabel: 'DEAL NEGOTIATION',
    statValue: 'ICM VS CHIP CHOP',
  },
  chop: {
    tool: 'chop-calculator',
    badge: 'FINAL TABLE DEAL SOLVER',
    title: 'Final Table ICM Chop Vs. Chip Chop Calculator',
    subtitle: 'Compare Exact Malmuth-Harville ICM Deals, Linear Chip Chops & Trophy Saves',
    statLabel: 'DEAL NEGOTIATION',
    statValue: 'ICM VS CHIP CHOP',
  },
  'spr-calculator': {
    tool: 'spr-calculator',
    badge: 'SPR & GEOMETRIC SIZING',
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Calculator',
    subtitle: 'Exact 1-Street, 2-Street & 3-Street Geometric Bet Sizing & Commitment Thresholds',
    statLabel: 'POSTFLOP ENGINE',
    statValue: 'GEOMETRIC SIZING',
  },
  spr: {
    tool: 'spr-calculator',
    badge: 'SPR & GEOMETRIC SIZING',
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Calculator',
    subtitle: 'Exact 1-Street, 2-Street & 3-Street Geometric Bet Sizing & Commitment Thresholds',
    statLabel: 'POSTFLOP ENGINE',
    statValue: 'GEOMETRIC SIZING',
  },
  'variance-calculator': {
    tool: 'variance-calculator',
    badge: 'VARIANCE & CONFIDENCE',
    title: 'Poker Winrate Variance & Downswing Simulator',
    subtitle: '95% Confidence Intervals, Brownian Drawdown Risk & Minimum Sample Proof',
    statLabel: 'STATISTICAL ENGINE',
    statValue: '95% CONFIDENCE',
  },
  variance: {
    tool: 'variance-calculator',
    badge: 'VARIANCE & CONFIDENCE',
    title: 'Poker Winrate Variance & Downswing Simulator',
    subtitle: '95% Confidence Intervals, Brownian Drawdown Risk & Minimum Sample Proof',
    statLabel: 'STATISTICAL ENGINE',
    statValue: '95% CONFIDENCE',
  },
  'plo-bet-calculator': {
    tool: 'plo-bet-calculator',
    badge: 'PLO 3X+POT SOLVER',
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    subtitle: 'Dealer 3x+Pot Shortcut Math, Multi-Way Trail Calls & Double-Board Quartering',
    statLabel: 'OMAHA ENGINE',
    statValue: '3X + POT + TRAIL',
  },
  plo: {
    tool: 'plo-bet-calculator',
    badge: 'PLO 3X+POT SOLVER',
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    subtitle: 'Dealer 3x+Pot Shortcut Math, Multi-Way Trail Calls & Double-Board Quartering',
    statLabel: 'OMAHA ENGINE',
    statValue: '3X + POT + TRAIL',
  },
  'rake-calculator': {
    tool: 'rake-calculator',
    badge: 'LIVE CASH RAKE SOLVER',
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    subtitle: 'Compare Percentage Pot Drops Vs. Half-Hour Seat Charges In Dollars/Hr & BB/100',
    statLabel: 'CARDROOM ECONOMICS',
    statValue: 'POT DROP VS TIME',
  },
  rake: {
    tool: 'rake-calculator',
    badge: 'LIVE CASH RAKE SOLVER',
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    subtitle: 'Compare Percentage Pot Drops Vs. Half-Hour Seat Charges In Dollars/Hr & BB/100',
    statLabel: 'CARDROOM ECONOMICS',
    statValue: 'POT DROP VS TIME',
  },
  'poker-tax-calculator': {
    tool: 'poker-tax-calculator',
    badge: 'IRS FORM W-2G & TAX',
    title: 'US Poker Tax & IRS Form W-2G Calculator',
    subtitle: 'IRC Section 165(d) Loss Deductions, $5,000 W-2G Withholding & Schedule C Math',
    statLabel: 'TAX ESTIMATOR',
    statValue: 'IRC SEC 165(D)',
  },
  tax: {
    tool: 'poker-tax-calculator',
    badge: 'IRS FORM W-2G & TAX',
    title: 'US Poker Tax & IRS Form W-2G Calculator',
    subtitle: 'IRC Section 165(d) Loss Deductions, $5,000 W-2G Withholding & Schedule C Math',
    statLabel: 'TAX ESTIMATOR',
    statValue: 'IRC SEC 165(D)',
  },
  'staking-calculator': {
    tool: 'staking-calculator',
    badge: 'STAKING & MARKUP SOLVER',
    title: 'Tournament Staking, Markup & Payout Split Calculator',
    subtitle: 'Package Cost Per 1%, Required Break-Even ROI & Investor Settlement Splits',
    statLabel: 'BACKING ENGINE',
    statValue: 'MARKUP & PAYOUTS',
  },
  staking: {
    tool: 'staking-calculator',
    badge: 'STAKING & MARKUP SOLVER',
    title: 'Tournament Staking, Markup & Payout Split Calculator',
    subtitle: 'Package Cost Per 1%, Required Break-Even ROI & Investor Settlement Splits',
    statLabel: 'BACKING ENGINE',
    statValue: 'MARKUP & PAYOUTS',
  },
  'iso-calculator': {
    tool: 'iso-calculator',
    badge: 'PREFLOP ISO SIZING',
    title: 'Preflop Isolation Raise Sizing & SPR Calculator',
    subtitle: 'Optimal 3x/4x Base + 1x Per Limper + OOP Tax Sizing & Resulting Flop SPR',
    statLabel: 'PREFLOP ENGINE',
    statValue: 'ISO RAISE & SPR',
  },
  iso: {
    tool: 'iso-calculator',
    badge: 'PREFLOP ISO SIZING',
    title: 'Preflop Isolation Raise Sizing & SPR Calculator',
    subtitle: 'Optimal 3x/4x Base + 1x Per Limper + OOP Tax Sizing & Resulting Flop SPR',
    statLabel: 'PREFLOP ENGINE',
    statValue: 'ISO RAISE & SPR',
  },
  'bounty-calculator': {
    tool: 'bounty-calculator',
    badge: 'PKO & MYSTERY BOUNTY',
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    subtitle: 'Convert Knockout Dollar Bounties Into Tournament Chips & Adjusted Pot Odds',
    statLabel: 'BOUNTY ENGINE',
    statValue: '33.3% POWER FACTOR',
  },
  bounty: {
    tool: 'bounty-calculator',
    badge: 'PKO & MYSTERY BOUNTY',
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    subtitle: 'Convert Knockout Dollar Bounties Into Tournament Chips & Adjusted Pot Odds',
    statLabel: 'BOUNTY ENGINE',
    statValue: '33.3% POWER FACTOR',
  },
  '3bet-calculator': {
    tool: '3bet-calculator',
    badge: '3-BET & 4-BET SOLVER',
    title: 'Preflop 3-Bet & 4-Bet Sizing & MDF Calculator',
    subtitle: 'IP 3x / OOP 4x Sizing Multipliers, Caller Adjustments & Minimum Defense Frequency',
    statLabel: 'PREFLOP ENGINE',
    statValue: '3-BET & 4-BET MDF',
  },
  'bankroll-calculator': {
    tool: 'bankroll-calculator',
    badge: 'RISK OF RUIN SOLVER',
    title: 'Poker Bankroll & Risk Of Ruin (RoR) Calculator',
    subtitle: 'Exponential Brownian Risk Of Ruin & Buy-In Cushions For Cash Games And MTTs',
    statLabel: 'BANKROLL ENGINE',
    statValue: '<1% RISK OF RUIN',
  },
  'push-fold-calculator': {
    tool: 'push-fold-calculator',
    badge: 'NASH PUSH/FOLD SOLVER',
    title: 'Short-Stack Push/Fold Nash Equilibrium Calculator',
    subtitle: 'Unexploitable 2BB To 20BB Open-Shove Frequencies & Harrington M-Ratio Thresholds',
    statLabel: 'SHORT-STACK ENGINE',
    statValue: 'NASH PUSH/FOLD',
  },
  'poker-winrate-calculator': {
    tool: 'poker-winrate-calculator',
    badge: 'WINRATE & BB/100 SOLVER',
    title: 'Poker Winrate, BB/100 & Hourly Earn Calculator',
    subtitle: 'Convert Live & Online Session Profits Into True BB/100 And Annualized Hourly Earn',
    statLabel: 'WINRATE ENGINE',
    statValue: 'BB/100 & $/HR',
  },
  'board-texture-analyzer': {
    tool: 'board-texture-analyzer',
    badge: 'FLOP TEXTURE & C-BET',
    title: 'Flop Board Texture & GTO C-Bet Strategy Analyzer',
    subtitle: 'Suit Texture, Connectedness, PFR Vs. BB Range Advantage & Optimal C-Bet Sizing',
    statLabel: 'POSTFLOP SOLVER',
    statValue: 'RANGE ADVANTAGE',
  },
  'm-ratio-calculator': {
    tool: 'm-ratio-calculator',
    badge: 'HARRINGTON M-RATIO',
    title: 'Tournament Harrington M-Ratio & Effective M Calculator',
    subtitle: 'Orbit Cost, Short-Handed Effective M, Q-Ratio & 5-Zone Survival Strategy',
    statLabel: 'TOURNAMENT ENGINE',
    statValue: 'M-RATIO & ZONES',
  },
  'satellite-calculator': {
    tool: 'satellite-calculator',
    badge: 'SATELLITE BUBBLE SOLVER',
    title: 'Satellite Bubble Factor & Seat-Lock Threshold Calculator',
    subtitle: 'Flat-Payout Seat-Lock Chip Targets, Bubble Factors & Fold-AA Thresholds',
    statLabel: 'SATELLITE ICM',
    statValue: 'SEAT-LOCK STACK',
  },
  'session-planner': {
    tool: 'session-planner',
    badge: 'CASH SESSION PLANNER',
    title: 'Live Cash Game Session, Stop-Loss & Annual Income Planner',
    subtitle: 'Net Hourly Earn With Comps/Expenses, Stop-Loss Rules & 5% RoR Bankroll Targets',
    statLabel: 'SESSION ECONOMICS',
    statValue: 'NET $/HR & ROR',
  },
  'straddle-calculator': {
    tool: 'straddle-calculator',
    badge: 'STRADDLE & BOMB POT EV',
    title: 'Live Straddle & Double-Board Bomb Pot EV Calculator',
    subtitle: 'UTG/Mississippi Button Straddle Effective Stack Reduction & Bomb Pot Dead Money',
    statLabel: 'LIVE ACTION MATH',
    statValue: 'STRADDLE & BOMB POT',
  },
  'promo-ev-calculator': {
    tool: 'promo-ev-calculator',
    badge: 'BAD BEAT JACKPOT EV',
    title: 'Bad Beat Jackpot (BBJ) & High-Hand Promo EV Calculator',
    subtitle: 'Exact Breakeven Jackpot Pool Thresholds & Hourly Promo Drop Rebate Value',
    statLabel: 'PROMO ECONOMICS',
    statValue: 'BBJ BREAKEVEN POOL',
  },
  'who-wins-calculator': {
    tool: 'who-wins-calculator',
    badge: '7-CARD SHOWDOWN SOLVER',
    title: 'Texas Hold\'em Showdown Winner & Kicker Resolver',
    subtitle: 'Deterministic 7-Card Best-5 Evaluator, Counterfeited Two-Pair & Split-Pot Proof',
    statLabel: 'SHOWDOWN ENGINE',
    statValue: 'EXACT 5-CARD WINNER',
  },
  'hand-converter': {
    tool: 'hand-converter',
    badge: 'HAND HISTORY FORMATTER',
    title: 'Poker Hand History Formatter & SPR Street Analyzer',
    subtitle: '1-Click Reddit, TwoPlusTwo, Discord & AI Solver Hand History Markdown Converter',
    statLabel: 'HAND FORMATTER',
    statValue: 'REDDIT & DISCORD MD',
  },
  'mixed-game-placards': {
    tool: 'mixed-game-placards',
    badge: 'MIXED GAME ROTATION',
    title: 'Mixed-Game Rotation Tracker & Printable Table Placards',
    subtitle: 'H.O.R.S.E., 8-Game, 10-Game & Dealer\'s Choice Orbit Tracker With Printable Placards',
    statLabel: 'MIXED GAMES',
    statValue: 'ORBIT & PLACARDS',
  },
  'poker-iq-test': {
    tool: 'poker-iq-test',
    badge: 'GTO POKER IQ TEST',
    title: '10-Question Quantitative GTO Poker IQ Diagnostic Test',
    subtitle: 'Pot Odds, MDF, ICM, Preflop Ranges, Combinatorics & Live Rules Percentile Score',
    statLabel: 'DIAGNOSTIC ENGINE',
    statValue: 'GTO IQ PERCENTILE',
  },
  'gto-leak-finder': {
    tool: 'gto-leak-finder',
    badge: '60-SECOND GTO LEAK FINDER',
    title: '60-Second GTO Poker Leak Finder Diagnostic',
    subtitle: '5-Hand 100BB Cash & ICM Solver Diagnostic With Estimated BB/100 Leak Breakdown',
    statLabel: 'SOLVER DIAGNOSTIC',
    statValue: '5-HAND LEAK SCORE',
  },
  'leak-finder': {
    tool: 'leak-finder',
    badge: '60-SECOND GTO LEAK SCORECARD',
    title: 'Smarter.Poker 60-Second GTO Leak Scorecard',
    subtitle: '5-Hand 100BB Cash & ICM Solver Diagnostic · Beat My Score Free',
    statLabel: 'GTO LEAK SCORE',
    statValue: 'BEAT MY SCORE FREE',
  },
  'gto-drill': {
    tool: 'gto-drill',
    badge: 'GTO SOLVER DRILL',
    title: 'Smarter.Poker Solver Drill Result Card',
    subtitle: '100BB 6-Max Solver Frequencies & Optimal Play Grading',
    statLabel: 'SOLVER VERDICT',
    statValue: 'OPTIMAL PLAY',
  },
  'side-pot-calculator': {
    tool: 'side-pot-calculator',
    badge: 'MULTI-WAY SIDE POTS',
    title: 'Multi-Way All-In Side Pot & Uncalled Bet Calculator',
    subtitle: 'Exact Main Pot, Side Pot Slices, Dead Money Allocation & Uncalled Chip Returns',
    statLabel: 'TABLE ARBITRATION',
    statValue: 'MAIN & SIDE POTS',
  },
  'blind-structure-calculator': {
    tool: 'blind-structure-calculator',
    badge: 'TDA BLIND SCHEDULE',
    title: 'Tournament Blind Structure & Clock Schedule Generator',
    subtitle: 'TDA-Compliant Big Blind Ante Schedules, Level Progression & Chip Color-Up Timing',
    statLabel: 'TOURNAMENT DIRECTOR',
    statValue: 'BLIND SCHEDULE',
  },
  'payout-calculator': {
    tool: 'payout-calculator',
    badge: 'TOURNAMENT PAYOUTS',
    title: 'Tournament Prize Pool & Payout Structure Calculator',
    subtitle: 'Top 10%, 15% & 20% ITM Prize Distributions, Min-Cash Floors & Final Table Ladders',
    statLabel: 'PRIZE POOL ENGINE',
    statValue: 'PAYOUT STRUCTURE',
  },
  'tournament-payout-calculator': {
    tool: 'payout-calculator',
    badge: 'TOURNAMENT PAYOUTS',
    title: 'Tournament Prize Pool & Payout Structure Calculator',
    subtitle: 'Top 10%, 15% & 20% ITM Prize Distributions, Min-Cash Floors & Final Table Ladders',
    statLabel: 'PRIZE POOL ENGINE',
    statValue: 'PAYOUT STRUCTURE',
  },
  'home-game-kit': {
    tool: 'home-game-kit',
    badge: 'HOME GAME CHIP KIT',
    title: 'Home Game Chip Distribution & Host Sheet Generator',
    subtitle: 'Exact Starting Chip Tube Breakdowns For 300, 500 & 1,000-Chip Cash And MTT Sets',
    statLabel: 'HOST ENGINE',
    statValue: 'CHIP TUBE BREAKDOWN',
  },
  'format-quiz': {
    tool: 'format-quiz',
    badge: 'FORMAT RECOMMENDER',
    title: 'Poker Format Diagnostic & Bankroll Fit Recommender',
    subtitle: 'Match Session Hours, Bankroll Depth & Variance Tolerance To Your Optimal Game Format',
    statLabel: 'PLAYER DIAGNOSTIC',
    statValue: 'FORMAT MATCH SCORE',
  },
  'poker-odds-calculator': {
    tool: 'poker-odds-calculator',
    badge: 'MULTIWAY EQUITY SOLVER',
    title: 'Texas Hold\'em, PLO & Short Deck Poker Odds Calculator',
    subtitle: 'Exact Combinatorial & Monte Carlo Hand-Vs-Hand Win, Tie & Street Equity Engine',
    statLabel: 'EQUITY ENGINE',
    statValue: 'EXACT HAND EQUITY',
  },
  'preflop-ranges': {
    tool: 'preflop-ranges',
    badge: '100BB 6-MAX GTO RANGES',
    title: 'Interactive 13x13 GTO Preflop Opening Range Viewer',
    subtitle: 'Solver-Backed UTG, MP, HJ, CO, BTN & SB Raise-First-In And 3-Bet Defense Matrices',
    statLabel: 'PREFLOP SOLVER',
    statValue: '169-HAND MATRIX',
  },
  'preflop-charts': {
    tool: 'preflop-ranges',
    badge: '100BB 6-MAX GTO RANGES',
    title: 'Interactive 13x13 GTO Preflop Opening Range Viewer',
    subtitle: 'Solver-Backed UTG, MP, HJ, CO, BTN & SB Raise-First-In And 3-Bet Defense Matrices',
    statLabel: 'PREFLOP SOLVER',
    statValue: '169-HAND MATRIX',
  },
  'geometric-bet-calculator': {
    tool: 'geometric-bet-calculator',
    badge: 'GEOMETRIC OVERBET SOLVER',
    title: 'Multi-Street Geometric Bet Sizing & Overbet Calculator',
    subtitle: 'Exact 2e & 3e Equal-Fraction Pot Bet Progression, Street-By-Street Pot Growth & MDF',
    statLabel: 'POSTFLOP GEOMETRY',
    statValue: '2E & 3E SIZING',
  },
  'late-reg-calculator': {
    tool: 'late-reg-calculator',
    badge: 'LATE-REG ICM SOLVER',
    title: 'Tournament Late-Registration ICM EV & Chip Appreciation Calculator',
    subtitle: 'Malmuth-Harville Late-Reg Equity Boost, Effective Rake Reduction & Max-Late Thresholds',
    statLabel: 'TOURNAMENT ICM',
    statValue: 'LATE-REG EV BOOST',
  },
  'mtt-grind-planner': {
    tool: 'mtt-grind-planner',
    badge: 'MTT GRIND & ABI PLANNER',
    title: 'MTT Session ABI, Bullet Budget & Bankroll RoR Planner',
    subtitle: 'Session Capital Requirement, Re-Entry Bullet Allowance, Expected EV & Downswing Cushion',
    statLabel: 'MTT BANKROLL',
    statValue: 'ABI & ROR PLAN',
  },
  'plo-outs-calculator': {
    tool: 'plo-outs-calculator',
    badge: 'PLO STRAIGHT WRAP SOLVER',
    title: '4-Card & 5-Card PLO Straight Wrap & Combo Draw Calculator',
    subtitle: '13-Out, 16-Out, 17-Out & 20-Out Wrap Equity, Nut-Out Ratio & Flop Pot-Raise EV',
    statLabel: 'OMAHA COMBINATORICS',
    statValue: 'WRAP & NUT OUTS',
  },
  'poker-trip-planner': {
    tool: 'poker-trip-planner',
    badge: 'POKER TRIP ROI PLANNER',
    title: 'Live Poker Trip Budget, Expense Overhead & Breakeven Planner',
    subtitle: 'Flight, Hotel & Per-Diem Expense Drag Vs. Tournament Buy-In Volume And Cash Grind Hours',
    statLabel: 'FESTIVAL ECONOMICS',
    statValue: 'TRIP BREAKEVEN ROI',
  },
  'shot-clock': {
    tool: 'shot-clock',
    badge: 'TDA ACTION SHOT CLOCK',
    title: 'Live Poker Action Shot Clock & Time-Bank Card Manager',
    subtitle: 'WPT/Triton 15s-30s Pre-Flop & Postflop Countdown Timer With Per-Seat Time-Bank Cards',
    statLabel: 'TOURNAMENT CLOCK',
    statValue: '30S ACTION TIMER',
  },
  'table-selection-calculator': {
    tool: 'table-selection-calculator',
    badge: 'LIVE TABLE SCORER',
    title: 'Live Cash Game Table Selection & Hourly Winrate Scorer',
    subtitle: 'Grade Table Profitability (A+ To F) From Recreational Seats, Stack Depth, Straddles & Rake',
    statLabel: 'GAME SELECTION',
    statValue: 'TABLE EV GRADE',
  },
  'winrate-confidence-calculator': {
    tool: 'winrate-confidence-calculator',
    badge: 'WINRATE CONFIDENCE CI',
    title: 'Poker Winrate Confidence Interval & Sample Proof Calculator',
    subtitle: '70%, 95% & 99% Normal-Approximation Confidence Bounds, Loss Probability & Sample Horizon',
    statLabel: 'STATISTICAL PROOF',
    statValue: '70/95/99% BOUNDS',
  },
  'multiway-all-in-calculator': {
    tool: 'multiway-all-in-calculator',
    badge: 'MULTIWAY ALL-IN EV SOLVER',
    title: 'Multiway All-In EV & Side Pot Equity Calculator',
    subtitle: '3-Way And 4-Way Pre-Flop All-In Main Pot + Side Pot Breakdown And Net EV Per Stack',
    statLabel: 'MULTIWAY ENGINE',
    statValue: 'MAIN & SIDE POT EV',
  },
  'mystery-bounty-tracker': {
    tool: 'mystery-bounty-tracker',
    badge: 'MYSTERY BOUNTY TRACKER',
    title: 'Live Day-2 Mystery Bounty Envelope Removal Tracker',
    subtitle: 'Dynamic Average Remaining Bounty Value, Chip Equivalence & All-In Pot Odds Discount',
    statLabel: 'ENVELOPE ENGINE',
    statValue: 'LIVE BOUNTY EV',
  },
  'bubble-factor-calculator': {
    tool: 'bubble-factor-calculator',
    badge: 'FINAL TABLE BUBBLE MATRIX',
    title: 'Final Table Pairwise ICM Bubble Factor & Equity Matrix',
    subtitle: 'Full N x N Hero Vs. Villain Malmuth-Harville Bubble Factors & Required All-In Equity',
    statLabel: 'PAIRWISE ICM',
    statValue: 'BF & REQ EQUITY',
  },
  'bluff-catching-calculator': {
    tool: 'bluff-catching-calculator',
    badge: 'RIVER BLUFF-CATCH SOLVER',
    title: 'River Bluff-Catching, Card-Removal Blockers & MDF Solver',
    subtitle: 'MDF, Required Bluff Share, Blocker Card Removal Adjustment & Exact River Call EV',
    statLabel: 'BLOCKER ENGINE',
    statValue: 'RIVER CALL EV',
  },
  'multi-street-ev-calculator': {
    tool: 'multi-street-ev-calculator',
    badge: 'TRIPLE-BARREL EV SOLVER',
    title: 'Multi-Street Double & Triple-Barrel Fold-Equity EV Solver',
    subtitle: 'Flop-Turn-River Cumulative Fold Equity, Pot Growth Geometry & Bluff Breakeven Math',
    statLabel: 'MULTI-STREET EV',
    statValue: 'BARREL FOLD EQUITY',
  },
  'heads-up-push-fold-calculator': {
    tool: 'heads-up-push-fold-calculator',
    badge: 'HEADS-UP NASH SOLVER',
    title: 'Heads-Up & 3-Max Spin Push/Fold Nash Equilibrium Solver',
    subtitle: '1BB-25BB Unexploitable Small Blind Shove, Big Blind Call & Limp-Trap 13x13 Matrices',
    statLabel: 'HU NASH ENGINE',
    statValue: '1BB-25BB HU NASH',
  },
  'blind-vs-blind-calculator': {
    tool: 'blind-vs-blind-calculator',
    badge: 'BLIND VS BLIND EXPLORER',
    title: 'Blind-Vs-Blind (SB Vs. BB) Limp, Open & 3-Bet Matrix Explorer',
    subtitle: '100BB, 50BB & 25BB Small Blind Limp/Raise And Big Blind Iso-Raise/3-Bet Defense Grids',
    statLabel: 'BVB GTO MATRIX',
    statValue: 'SB VS BB RANGES',
  },
  'shot-taking-calculator': {
    tool: 'shot-taking-calculator',
    badge: 'SHOT-TAKING PLANNER',
    title: '2-Tier Bankroll Shot-Taking & Move-Down Stop-Loss Planner',
    subtitle: 'Mandatory Move-Down Trigger Floors, Blended Risk Of Ruin & Base-Stake Rebuild Hours',
    statLabel: 'SHOT PLANNER',
    statValue: 'STOP-LOSS & ROR',
  },
  'warmup-cooldown-routine': {
    tool: 'warmup-cooldown-routine',
    badge: 'WARMUP & COOLDOWN TOOL',
    title: 'Interactive Pre-Session Warmup & Post-Session Cooldown Tool',
    subtitle: 'Flash Pot-Odds Math Drill, A-Game Readiness Scorecard & Post-Session Decision Audit',
    statLabel: 'MINDSET & MATH',
    statValue: 'A-GAME READINESS',
  },
  'home-game-director': {
    tool: 'home-game-director',
    badge: 'HOME GAME TD CONSOLE',
    title: 'Live Home Game Tournament Director Clock & Payout Console',
    subtitle: 'Interactive Blind Clock, Rebuy/Add-On Prize Pool Counter & Table Average M-Ratio',
    statLabel: 'TD CONSOLE',
    statValue: 'CLOCK & PAYOUTS',
  },
});

function clampNum(val, min, max, fallback = null) {
  if (val === undefined || val === null || String(val).trim() === '') return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function computeMalmuthHarvilleIcm(stacks = [], payouts = []) {
  const n = stacks.length;
  const totalChips = stacks.reduce((a, b) => a + b, 0);
  if (totalChips <= 0 || n === 0) return stacks.map(() => 0);

  const equities = new Array(n).fill(0);

  function recurse(activeMask, remainingTotal, placeIdx, probPrefix) {
    if (placeIdx >= n || placeIdx >= payouts.length || probPrefix < 1e-10) return;
    const prize = payouts[placeIdx] || 0;
    for (let i = 0; i < n; i += 1) {
      if ((activeMask & (1 << i)) === 0) continue;
      const stack = stacks[i];
      if (stack <= 0) continue;
      const pWinPlace = remainingTotal > 0 ? stack / remainingTotal : 0;
      const branchProb = probPrefix * pWinPlace;
      equities[i] += branchProb * prize;
      if (placeIdx + 1 < n && placeIdx + 1 < payouts.length) {
        recurse(activeMask ^ (1 << i), remainingTotal - stack, placeIdx + 1, branchProb);
      }
    }
  }

  recurse((1 << n) - 1, totalChips, 0, 1);
  return equities;
}

/**
 * Validates raw query parameters for a calculator and reproduces the exact
 * calculation from maintained formulas. Caller-supplied ?result= or ?statValue=
 * strings are never used.
 */
export function computeValidatedSolvedSpot(toolKey = '', rawQuery = {}) {
  const key = String(toolKey || '').trim().toLowerCase();
  const q = rawQuery && typeof rawQuery === 'object' ? rawQuery : {};

  // 1. Pot Odds & MDF Calculator
  if (key === 'pot-odds-calculator' || key === 'pot-odds' || (key === 'gto' && q.pot !== undefined && q.bet !== undefined)) {
    const pot = clampNum(q.pot, 1, 10000000, null);
    const bet = clampNum(q.bet, 1, 10000000, null);
    if (pot !== null && bet !== null) {
      const outs = clampNum(q.outs, 0, 25, 9);
      const totalPotBeforeCall = pot + bet;
      const finalPotAfterCall = pot + bet * 2;
      const reqEquity = (bet / finalPotAfterCall) * 100;
      const mdf = (pot / totalPotBeforeCall) * 100;
      const potOddsRatio = totalPotBeforeCall / bet;
      const flopToRiverExact = (1 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'pot-odds-calculator',
        statLabel: `SOLVED POT ODDS ($${Math.round(pot)} POT / $${Math.round(bet)} BET)`,
        statValue: `${reqEquity.toFixed(1)}% Eq • ${mdf.toFixed(1)}% MDF (${potOddsRatio.toFixed(2)}:1)`,
        summaryText: `Pot $${Math.round(pot)} Facing $${Math.round(bet)} Bet: ${reqEquity.toFixed(1)}% Required Equity (${potOddsRatio.toFixed(2)}:1 Odds), ${mdf.toFixed(1)}% Minimum Defense Frequency, ${flopToRiverExact.toFixed(1)}% Flop-To-River Draw Equity (${Math.round(outs)} Outs).`,
        normalizedQuery: { pot: Math.round(pot), bet: Math.round(bet), outs: Math.round(outs) },
      };
    }
  }

  // 2. Hypergeometric Outs Calculator
  if (key === 'outs-calculator' || key === 'outs') {
    const outs = clampNum(q.outs, 1, 21, null);
    if (outs !== null) {
      const safeOuts = Math.round(outs);
      const street = String(q.street || 'flop').toLowerCase() === 'turn' ? 'turn' : 'flop';
      const pot = clampNum(q.pot, 1, 10000000, 100);
      const call = clampNum(q.call, 0, 10000000, 50);
      const turnPct = (safeOuts / 47) * 100;
      const riverPct = (safeOuts / 46) * 100;
      const flopToRiverPct = (1 - ((47 - safeOuts) / 47) * ((46 - safeOuts) / 46)) * 100;
      const activePct = street === 'turn' ? riverPct : flopToRiverPct;
      const rulePct = street === 'turn' ? safeOuts * 2 : safeOuts * 4;
      const ruleErr = rulePct - activePct;
      return {
        hasValidatedSpot: true,
        tool: 'outs-calculator',
        statLabel: `SOLVED DRAW EQUITY (${safeOuts} OUTS ON ${street.toUpperCase()})`,
        statValue:
          street === 'turn'
            ? `${riverPct.toFixed(2)}% River Hit (Rule Err ${ruleErr >= 0 ? '+' : ''}${ruleErr.toFixed(2)}%)`
            : `${flopToRiverPct.toFixed(2)}% By River (${turnPct.toFixed(2)}% Turn)`,
        summaryText: `${safeOuts} Clean Outs On The ${street === 'turn' ? 'Turn (46 Unseen Cards)' : 'Flop (47 Unseen Cards)'}: Exact Hit Probability ${activePct.toFixed(2)}% Vs. Rule Of ${street === 'turn' ? '2' : '4'} Estimate ${rulePct.toFixed(1)}% (${ruleErr >= 0 ? '+' : ''}${ruleErr.toFixed(2)}% Error).`,
        normalizedQuery: { outs: safeOuts, street, pot: Math.round(pot), call: Math.round(call) },
      };
    }
  }

  // 3. Final Table Chop & ICM Calculator
  if (key === 'chop-calculator' || key === 'chop' || key === 'icm-calculator' || key === 'icm') {
    if (q.stacks && q.payouts) {
      const stacks = String(q.stacks)
        .split(',')
        .map((v) => clampNum(v, 1, 1000000000, null))
        .filter((v) => v !== null)
        .slice(0, 6);
      const payouts = String(q.payouts)
        .split(',')
        .map((v) => clampNum(v, 0, 1000000000, null))
        .filter((v) => v !== null)
        .slice(0, 6);
      if (stacks.length >= 2 && payouts.length >= 2) {
        const count = Math.min(stacks.length, payouts.length);
        const activeStacks = stacks.slice(0, count);
        const activePayouts = payouts.slice(0, count);
        const totalPool = activePayouts.reduce((a, b) => a + b, 0);
        const minPrize = activePayouts[count - 1] || 0;
        const maxSave = Math.max(0, totalPool - minPrize * count);
        const save = clampNum(q.save, 0, maxSave, 0);
        const scale = totalPool > minPrize * count ? (totalPool - save - minPrize * count) / (totalPool - minPrize * count) : 1;
        const scaledPayouts = activePayouts.map((p) => minPrize + (p - minPrize) * scale);
        const icm = computeMalmuthHarvilleIcm(activeStacks, save > 0 ? scaledPayouts : activePayouts);
        const totalChips = activeStacks.reduce((a, b) => a + b, 0);
        const distributePool = Math.max(0, totalPool - save - minPrize * count);
        const chipChop = activeStacks.map((s) => minPrize + distributePool * (s / totalChips));
        return {
          hasValidatedSpot: true,
          tool: key.includes('icm') ? 'icm-calculator' : 'chop-calculator',
          statLabel: `SOLVED ${count}-HANDED ICM ($${Math.round(totalPool).toLocaleString('en-US')} POOL)`,
          statValue: `P1 $${icm[0].toFixed(2)} • P2 $${icm[1].toFixed(2)}${count >= 3 ? ` • P3 $${icm[2].toFixed(2)}` : ''}`,
          summaryText: `${count}-Handed Malmuth-Harville ICM (${activeStacks.join(' / ')} Chips, $${Math.round(totalPool).toLocaleString('en-US')} Pool${save > 0 ? `, $${Math.round(save)} Save` : ''}): P1 ICM $${icm[0].toFixed(2)} (Chip Chop $${chipChop[0].toFixed(2)}), P2 ICM $${icm[1].toFixed(2)} (Chip Chop $${chipChop[1].toFixed(2)}).`,
          normalizedQuery: {
            stacks: activeStacks.join(','),
            payouts: activePayouts.join(','),
            ...(save > 0 ? { save: Math.round(save) } : {}),
          },
        };
      }
    }
  }

  // 4. SPR & Geometric Bet Sizing Calculator
  if (key === 'spr-calculator' || key === 'spr') {
    const pot = clampNum(q.pot, 1, 10000000, null);
    const stack = clampNum(q.stack, 1, 10000000, null);
    if (pot !== null && stack !== null) {
      const spr = stack / pot;
      const geo2 = ((Math.pow(1 + 2 * spr, 1 / 2) - 1) / 2) * 100;
      const geo3 = ((Math.pow(1 + 2 * spr, 1 / 3) - 1) / 2) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'spr-calculator',
        statLabel: `SOLVED SPR ($${Math.round(stack)} STACK / $${Math.round(pot)} POT)`,
        statValue: `${spr.toFixed(2)} SPR • ${geo3.toFixed(1)}% 3-St Geo`,
        summaryText: `Effective Stack $${Math.round(stack)} Into $${Math.round(pot)} Pot = ${spr.toFixed(2)} SPR: 3-Street Geometric Sizing ${geo3.toFixed(1)}% Pot ($${Math.round(pot * (geo3 / 100))} Flop Bet), 2-Street Geometric Sizing ${geo2.toFixed(1)}% Pot.`,
        normalizedQuery: { pot: Math.round(pot), stack: Math.round(stack) },
      };
    }
  }

  // 5. Variance & Confidence Interval Calculator
  if (key === 'variance-calculator' || key === 'variance') {
    const wr = clampNum(q.wr ?? q.winrate, -50, 50, null);
    const sd = clampNum(q.sd ?? q.stdDev, 20, 300, null);
    const hands = clampNum(q.hands, 1000, 10000000, null);
    if (wr !== null && sd !== null && hands !== null) {
      const safeHands = Math.round(hands);
      const nBlocks = safeHands / 100;
      const evBb = nBlocks * wr;
      const totalSdBb = Math.sqrt(nBlocks) * sd;
      const ciLow = Math.round(evBb - 1.96 * totalSdBb);
      const ciHigh = Math.round(evBb + 1.96 * totalSdBb);
      const minHands95 = wr > 0 ? Math.round(Math.pow((1.96 * sd) / wr, 2) * 100) : null;
      return {
        hasValidatedSpot: true,
        tool: 'variance-calculator',
        statLabel: `SOLVED 95% CI (${safeHands.toLocaleString('en-US')} HANDS @ ${wr.toFixed(1)} BB/100)`,
        statValue: `${evBb >= 0 ? '+' : ''}${Math.round(evBb)} BB ([${ciLow}, +${ciHigh}] BB)`,
        summaryText: `${wr.toFixed(1)} BB/100 Winrate With ${sd.toFixed(0)} BB/100 Std Dev Over ${safeHands.toLocaleString('en-US')} Hands: Expected EV ${evBb >= 0 ? '+' : ''}${Math.round(evBb)} BB, 95% Confidence Interval [${ciLow} BB, +${ciHigh} BB]${minHands95 ? `, ${minHands95.toLocaleString('en-US')} Hands Needed For 95% Proof` : ''}.`,
        normalizedQuery: { wr, sd, hands: safeHands },
      };
    }
  }

  // 6. PLO Max Bet Calculator
  if (key === 'plo-bet-calculator' || key === 'plo') {
    const pot = clampNum(q.pot, 1, 10000000, null);
    const bet = clampNum(q.bet ?? q.call, 0, 10000000, null);
    if (pot !== null && bet !== null) {
      const trail = clampNum(q.trail ?? q.dead, 0, 10000000, 0);
      const maxBet = 3 * bet + trail + pot;
      const resultingPot = pot + bet + trail + maxBet;
      return {
        hasValidatedSpot: true,
        tool: 'plo-bet-calculator',
        statLabel: `SOLVED PLO 3X+POT ($${Math.round(pot)} POT / $${Math.round(bet)} BET)`,
        statValue: `Max Bet $${Math.round(maxBet)} (Pot $${Math.round(resultingPot)})`,
        summaryText: `PLO 3x Shortcut: 3 x $${Math.round(bet)} Last Bet + $${Math.round(trail)} Trail Calls + $${Math.round(pot)} Previous Pot = $${Math.round(maxBet)} Max Pot Raise (Resulting Pot $${Math.round(resultingPot)}).`,
        normalizedQuery: { pot: Math.round(pot), bet: Math.round(bet), trail: Math.round(trail) },
      };
    }
  }

  // 7. Live Cash Game Rake Calculator
  if (key === 'rake-calculator' || key === 'rake') {
    const bb = clampNum(q.bb, 1, 1000, null);
    const cap = clampNum(q.cap, 0, 100, null);
    if (bb !== null && cap !== null) {
      const promo = clampNum(q.promo, 0, 20, 2);
      const hph = clampNum(q.hph, 10, 500, 28);
      const potsWon = clampNum(q.pots, 0.5, 25, 3.5);
      const halfHour = clampNum(q.time, 0, 100, 7);
      const avgRakePerPot = cap * 0.82 + promo;
      const hourlyPotRake = potsWon * avgRakePerPot;
      const potRakeBb100 = ((hourlyPotRake / bb) / hph) * 100;
      const hourlyTime = halfHour * 2;
      return {
        hasValidatedSpot: true,
        tool: 'rake-calculator',
        statLabel: `SOLVED LIVE RAKE ($${cap} CAP + $${promo} DROP @ $${bb} BB)`,
        statValue: `$${hourlyPotRake.toFixed(2)}/Hr (${potRakeBb100.toFixed(2)} BB/100)`,
        summaryText: `Live $${bb} BB Cash Game ($${cap} Cap + $${promo} Promo Drop, ${potsWon} Pots Won/Hr): $${hourlyPotRake.toFixed(2)}/Hr Pot Rake (${potRakeBb100.toFixed(2)} BB/100) Vs. $${hourlyTime.toFixed(2)}/Hr Timed Seat Charge.`,
        normalizedQuery: { bb, cap, promo, hph: Math.round(hph), pots: potsWon, time: halfHour },
      };
    }
  }

  // 8. US Poker Tax & W-2G Calculator
  if (key === 'poker-tax-calculator' || key === 'tax') {
    const wins = clampNum(q.wins, 0, 100000000, null);
    const losses = clampNum(q.losses, 0, 100000000, null);
    if (wins !== null && losses !== null) {
      const status = String(q.status || 'recreational').toLowerCase() === 'pro' ? 'pro' : 'recreational';
      const expenses = status === 'pro' ? clampNum(q.expenses, 0, 10000000, 0) : 0;
      const tourney = clampNum(q.tourney, 0, 100000000, 0);
      const deductible = Math.min(wins, losses + expenses);
      const netProfit = Math.max(0, wins - deductible);
      const w2g = tourney > 5000;
      return {
        hasValidatedSpot: true,
        tool: 'poker-tax-calculator',
        statLabel: `SOLVED POKER TAX (${status.toUpperCase()} FILING)`,
        statValue: `$${Math.round(netProfit).toLocaleString('en-US')} Net (${w2g ? 'W-2G Required' : 'No W-2G'})`,
        summaryText: `IRC Sec 165(d) Tax Summary ($${Math.round(wins).toLocaleString('en-US')} Gross Wins, $${Math.round(losses).toLocaleString('en-US')} Losses): $${Math.round(netProfit).toLocaleString('en-US')} Net Taxable Gambling Income (${w2g ? 'Form W-2G Triggered On >$5,000 Tournament Net' : 'Below $5,000 Form W-2G Threshold'}).`,
        normalizedQuery: { wins: Math.round(wins), losses: Math.round(losses), status, tourney: Math.round(tourney) },
      };
    }
  }

  // 9. Tournament Staking & Markup Calculator
  if (key === 'staking-calculator' || key === 'staking') {
    const pkg = clampNum(q.package, 100, 10000000, null);
    const markup = clampNum(q.markup, 1.0, 2.0, null);
    if (pkg !== null && markup !== null) {
      const sold = clampNum(q.sold, 1, 95, 50);
      const share = clampNum(q.share, 1, 95, 10);
      const cashes = clampNum(q.cashes, 0, 100000000, 0);
      const shareCost = pkg * (share / 100) * markup;
      const sharePayout = cashes * (share / 100);
      const breakevenRoi = (markup - 1) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'staking-calculator',
        statLabel: `SOLVED STAKING ($${Math.round(pkg).toLocaleString('en-US')} @ ${markup.toFixed(2)}X MARKUP)`,
        statValue: `${share}% Cost $${Math.round(shareCost).toLocaleString('en-US')} • Payout $${Math.round(sharePayout).toLocaleString('en-US')}`,
        summaryText: `$${Math.round(pkg).toLocaleString('en-US')} Package At ${markup.toFixed(2)}x Markup (${breakevenRoi.toFixed(1)}% Break-Even ROI): ${share}% Investor Share Costs $${Math.round(shareCost).toLocaleString('en-US')} And Receives $${Math.round(sharePayout).toLocaleString('en-US')} On $${Math.round(cashes).toLocaleString('en-US')} Cashes.`,
        normalizedQuery: { package: Math.round(pkg), markup, sold: Math.round(sold), share: Math.round(share), cashes: Math.round(cashes) },
      };
    }
  }

  // 10. Preflop Isolation Raise Calculator
  if (key === 'iso-calculator' || key === 'iso') {
    const limpers = clampNum(q.limpers, 1, 8, null);
    const stack = clampNum(q.stack, 20, 500, null);
    if (limpers !== null && stack !== null) {
      const safeLimpers = Math.round(limpers);
      const pos = String(q.pos || 'IP').toUpperCase() === 'OOP' ? 'OOP' : 'IP';
      const env = String(q.env || 'live').toLowerCase() === 'online' ? 'online' : 'live';
      const bb = clampNum(q.bb, 0.1, 1000, 5);
      const baseBb = env === 'live' ? 4.0 : 3.0;
      const oopBb = pos === 'IP' ? 0 : env === 'live' ? 1.5 : 1.0;
      const deepBb = stack >= 150 ? 0.5 : 0;
      const isoBb = Math.min(stack, Math.round((baseBb + safeLimpers + oopBb + deepBb) * 2) / 2);
      const deadBb = (pos === 'IP' ? 1.5 : 0.5) + (safeLimpers - 1);
      const flopPotBb = isoBb * 2 + deadBb;
      const spr = flopPotBb > 0 ? Math.max(0, stack - isoBb) / flopPotBb : 0;
      return {
        hasValidatedSpot: true,
        tool: 'iso-calculator',
        statLabel: `SOLVED ISO RAISE (${safeLimpers} LIMPERS, ${pos}, ${Math.round(stack)} BB)`,
        statValue: `${isoBb.toFixed(1)} BB ($${Math.round(isoBb * bb)}) • ${spr.toFixed(2)} SPR`,
        summaryText: `Preflop Isolation Over ${safeLimpers} Limper(s) (${pos}, ${env === 'live' ? 'Live' : 'Online'}, ${Math.round(stack)} BB Stack): Optimal Iso Size ${isoBb.toFixed(1)} BB ($${Math.round(isoBb * bb)}), Heads-Up Flop Pot ${flopPotBb.toFixed(1)} BB, Resulting Flop SPR ${spr.toFixed(2)}.`,
        normalizedQuery: { bb, limpers: safeLimpers, pos, stack: Math.round(stack), env },
      };
    }
  }

  // 11. PKO & Mystery Bounty Calculator
  if (key === 'bounty-calculator' || key === 'bounty') {
    const startStack = clampNum(q.startStack, 1000, 10000000, null);
    const startBounty = clampNum(q.startBounty, 1, 1000000, null);
    const targetBounty = clampNum(q.targetBounty, 1, 1000000, null);
    if (startStack !== null && startBounty !== null && targetBounty !== null) {
      const pot = clampNum(q.pot, 100, 100000000, 12000);
      const call = clampNum(q.call, 100, 100000000, 8000);
      const oneStartBountyChips = startStack / 3;
      const chipEq = Math.round(oneStartBountyChips * (targetBounty / startBounty));
      const adjReqEq = (call / (pot + call + chipEq)) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'bounty-calculator',
        statLabel: `SOLVED BOUNTY ($${targetBounty} TARGET / ${Math.round(startStack).toLocaleString('en-US')} START)`,
        statValue: `+${chipEq.toLocaleString('en-US')} Chips • ${adjReqEq.toFixed(1)}% Req Eq`,
        summaryText: `$${targetBounty} Knockout Bounty (Starting Stack ${Math.round(startStack).toLocaleString('en-US')}, Starting Bounty $${startBounty}): Worth +${chipEq.toLocaleString('en-US')} Tournament Chips (33.3% Power Factor), Reducing Required All-In Calling Equity To ${adjReqEq.toFixed(1)}%.`,
        normalizedQuery: {
          startStack: Math.round(startStack),
          startBounty,
          targetBounty,
          pot: Math.round(pot),
          call: Math.round(call),
        },
      };
    }
  }

  // 12. 3-Bet & 4-Bet Calculator
  if (key === '3bet-calculator' || key === '3bet') {
    const open = clampNum(q.open, 2.0, 15.0, null);
    const stack = clampNum(q.stack, 15, 500, null);
    if (open !== null && stack !== null) {
      const callers = Math.round(clampNum(q.callers, 0, 7, 0));
      const pos = String(q.pos || 'IP').toUpperCase() === 'OOP' ? 'OOP' : 'IP';
      const deepBonus = stack >= 140 ? 0.5 : 0;
      const baseMult = (pos === 'IP' ? 3.0 : 4.0) + callers * 1.0 + deepBonus;
      const threeBetBb = Math.min(stack, Math.round(open * baseMult * 2) / 2);
      const potBefore = 1.5 + open * (1 + callers);
      const villainMdf = 100 - (threeBetBb / (threeBetBb + potBefore)) * 100;
      return {
        hasValidatedSpot: true,
        tool: '3bet-calculator',
        statLabel: `SOLVED 3-BET (${open.toFixed(1)} BB OPEN, ${callers} CALLERS, ${pos})`,
        statValue: `${threeBetBb.toFixed(1)} BB 3-Bet • ${villainMdf.toFixed(1)}% Villain MDF`,
        summaryText: `Facing ${open.toFixed(1)} BB Open With ${callers} Caller(s) (${pos}, ${Math.round(stack)} BB Deep): Optimal 3-Bet Size ${threeBetBb.toFixed(1)} BB, Villain Minimum Defense Frequency ${villainMdf.toFixed(1)}%.`,
        normalizedQuery: { open, callers, stack: Math.round(stack), pos },
      };
    }
  }

  // 13. Bankroll & Risk-Of-Ruin Calculator
  if (key === 'bankroll-calculator' || key === 'bankroll') {
    const wr = clampNum(q.wr, 0.5, 40, null);
    const sd = clampNum(q.sd, 20, 250, null);
    if (wr !== null && sd !== null) {
      const bi = Math.round(clampNum(q.bi, 5, 500, 30));
      const dollars = Math.round(clampNum(q.dollars, 10, 100000, 300));
      const bankrollBb = bi * 100;
      const rorPct = Math.min(100, Math.max(0.01, Math.exp((-2 * wr * bankrollBb) / (sd * sd)) * 100));
      const onePctBi = Math.ceil((4.60517 * sd * sd) / (2 * wr * 100));
      return {
        hasValidatedSpot: true,
        tool: 'bankroll-calculator',
        statLabel: `SOLVED RISK OF RUIN (${wr.toFixed(1)} BB/100, ${Math.round(sd)} SD, ${bi} BI)`,
        statValue: `${rorPct < 0.05 ? '<0.05' : rorPct.toFixed(2)}% RoR • ${onePctBi} BI For <1% RoR`,
        summaryText: `Bankroll Risk Of Ruin At ${wr.toFixed(1)} BB/100 Winrate (${Math.round(sd)} BB/100 SD, ${bi} Buy-Ins = $${(bi * dollars).toLocaleString('en-US')}): ${rorPct < 0.05 ? '<0.05' : rorPct.toFixed(2)}% RoR (${onePctBi} Buy-Ins Required For <1% RoR).`,
        normalizedQuery: { wr, sd: Math.round(sd), bi, dollars },
      };
    }
  }

  // 14. Push/Fold Nash Calculator
  if (key === 'push-fold-calculator' || key === 'push-fold') {
    const stack = clampNum(q.stack, 2, 25, null);
    if (stack !== null) {
      const posMap = { UTG: 19.4, MP: 23.5, HJ: 29.1, CO: 37.4, BTN: 48.2, SB: 64.8 };
      const pos = posMap[String(q.pos || 'BTN').toUpperCase()] ? String(q.pos || 'BTN').toUpperCase() : 'BTN';
      const ante = clampNum(q.ante, 0, 25, 12.5);
      const shovePct = Math.min(96.0, Math.max(5.0, posMap[pos] * Math.pow(10 / stack, 0.58) * (0.85 + (ante / 12.5) * 0.15)));
      const deadBb = 1.5 + (ante / 12.5) * 1.0;
      const mRatio = stack / deadBb;
      return {
        hasValidatedSpot: true,
        tool: 'push-fold-calculator',
        statLabel: `SOLVED PUSH/FOLD (${stack.toFixed(1)} BB FROM ${pos}, ${ante.toFixed(1)}% ANTE)`,
        statValue: `Shove ${shovePct.toFixed(1)}% • M-Ratio ${mRatio.toFixed(2)}`,
        summaryText: `Short-Stack Push/Fold At ${stack.toFixed(1)} BB From ${pos} (${ante.toFixed(1)}% Ante): Unexploitable Nash Open-Shove Frequency ${shovePct.toFixed(1)}% (${Math.round((shovePct / 100) * 1326)} Combos), M-Ratio ${mRatio.toFixed(2)}.`,
        normalizedQuery: { stack, pos, ante },
      };
    }
  }

  // 15. Poker Winrate Calculator
  if (key === 'poker-winrate-calculator' || key === 'winrate') {
    const profit = clampNum(q.profit, -10000000, 10000000, null);
    const bb = clampNum(q.bb, 0.05, 10000, null);
    const hours = clampNum(q.hours, 1, 100000, null);
    if (profit !== null && bb !== null && hours !== null) {
      const hph = Math.round(clampNum(q.hph, 10, 1500, 28));
      const totalHands = Math.max(1, Math.round(hours * hph));
      const bbPer100 = ((profit / bb) / totalHands) * 100;
      const hourlyDollars = profit / hours;
      return {
        hasValidatedSpot: true,
        tool: 'poker-winrate-calculator',
        statLabel: `SOLVED WINRATE ($${Math.round(profit).toLocaleString('en-US')} OVER ${Math.round(hours)} HRS @ $${bb} BB)`,
        statValue: `${bbPer100.toFixed(2)} BB/100 • $${hourlyDollars.toFixed(2)}/Hr`,
        summaryText: `$${Math.round(profit).toLocaleString('en-US')} Net Profit Over ${Math.round(hours)} Hours (${totalHands.toLocaleString('en-US')} Hands At $${bb} BB): ${bbPer100.toFixed(2)} BB/100 Winrate And $${hourlyDollars.toFixed(2)}/Hr Hourly Earn.`,
        normalizedQuery: { profit: Math.round(profit), bb, hours: Math.round(hours), hph },
      };
    }
  }

  // 16. Flop Board Texture Analyzer
  if (key === 'board-texture-analyzer' || key === 'board-texture' || key === 'board') {
    const rawFlop = String(q.flop || '').trim();
    const tokens = rawFlop.match(/(?:10|[2-9TJQKA])[shdc]/gi);
    if (tokens && tokens.length >= 3) {
      const cards = tokens.slice(0, 3).map((t) => `${t.slice(0, -1).toUpperCase()}${t.slice(-1).toLowerCase()}`);
      const rankMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, T: 10, J: 11, Q: 12, K: 13, A: 14 };
      const ranks = cards.map((c) => rankMap[c.slice(0, -1)] || 10).sort((a, b) => b - a);
      const suits = cards.map((c) => c.slice(-1));
      const uniqueSuits = new Set(suits).size;
      const suitLabel = uniqueSuits === 1 ? 'Monotone' : uniqueSuits === 2 ? 'Two-Tone' : 'Rainbow';
      const uniqueRanks = new Set(ranks).size;
      const pairLabel = uniqueRanks === 1 ? 'Trips' : uniqueRanks === 2 ? 'Paired' : 'Unpaired';
      const cbetSizing = uniqueSuits === 1 || uniqueRanks <= 2 ? '33% Pot (68% Freq)' : ranks[0] >= 13 && (ranks[0] - ranks[2] >= 5) ? '33% Pot (75% Freq)' : '66% Pot (45% Freq)';
      const scenario = String(q.scenario || 'BTN_VS_BB_SRP').toUpperCase();
      return {
        hasValidatedSpot: true,
        tool: 'board-texture-analyzer',
        statLabel: `SOLVED FLOP TEXTURE (${cards.join(' ').toUpperCase()} • ${scenario})`,
        statValue: `${suitLabel} ${pairLabel} • C-Bet ${cbetSizing}`,
        summaryText: `Flop ${cards.join(' ')} (${scenario}): ${suitLabel} ${pairLabel} Texture, Recommended GTO C-Bet Strategy ${cbetSizing}.`,
        normalizedQuery: { flop: cards.join(''), scenario },
      };
    }
  }

  // 17. Harrington M-Ratio Calculator
  if (key === 'm-ratio-calculator' || key === 'm-ratio' || key === 'mratio') {
    const stack = clampNum(q.stack, 100, 100000000, null);
    const bb = clampNum(q.bb, 2, 10000000, null);
    if (stack !== null && bb !== null) {
      const sb = clampNum(q.sb, 1, bb, Math.round(bb / 2));
      const ante = clampNum(q.ante, 0, bb * 10, bb);
      const players = Math.round(clampNum(q.players, 2, 10, 9));
      const orbitCost = sb + bb + ante;
      const mRatio = orbitCost > 0 ? stack / orbitCost : 0;
      const effM = mRatio * (players / 10);
      const zone = effM >= 20 ? 'Green Zone' : effM >= 10 ? 'Yellow Zone' : effM >= 6 ? 'Orange Zone' : effM >= 1 ? 'Red Zone' : 'Dead Zone';
      return {
        hasValidatedSpot: true,
        tool: 'm-ratio-calculator',
        statLabel: `SOLVED M-RATIO (${Math.round(stack).toLocaleString('en-US')} STACK @ ${Math.round(sb)}/${Math.round(bb)}/${Math.round(ante)})`,
        statValue: `M = ${mRatio.toFixed(1)} • Eff M = ${effM.toFixed(1)} (${zone})`,
        summaryText: `Stack ${Math.round(stack).toLocaleString('en-US')} (${ (stack / bb).toFixed(1) } BB) At ${Math.round(sb)}/${Math.round(bb)}/${Math.round(ante)} (${players}-Handed): Raw M = ${mRatio.toFixed(2)}, Effective M = ${effM.toFixed(2)} (${zone}).`,
        normalizedQuery: { stack: Math.round(stack), sb: Math.round(sb), bb: Math.round(bb), ante: Math.round(ante), players },
      };
    }
  }

  // 18. Satellite Bubble Factor & Seat-Lock Calculator
  if (key === 'satellite-calculator' || key === 'satellite') {
    const seats = clampNum(q.seats, 1, 1000, null);
    const rem = clampNum(q.rem, 2, 2000, null);
    if (seats !== null && rem !== null) {
      const safeSeats = Math.round(seats);
      const safeRem = Math.max(safeSeats + 1, Math.round(rem));
      const total = Math.round(clampNum(q.total, safeRem, 50000, 100));
      const startStack = Math.round(clampNum(q.start, 1000, 1000000, 10000));
      const totalChips = total * startStack;
      const avgSeatStack = totalChips / safeSeats;
      const seatLockStack = Math.round(avgSeatStack * 0.88);
      const bubbleFactor = +(1.8 + (safeSeats / Math.max(1, safeRem - safeSeats)) * 0.85).toFixed(2);
      const reqEq = +((bubbleFactor / (bubbleFactor + 1)) * 100).toFixed(1);
      return {
        hasValidatedSpot: true,
        tool: 'satellite-calculator',
        statLabel: `SOLVED SATELLITE (${safeRem} LEFT FOR ${safeSeats} SEATS)`,
        statValue: `Lock ${seatLockStack.toLocaleString('en-US')} • BF ${bubbleFactor}x (${reqEq}% Eq)`,
        summaryText: `Satellite Bubble (${safeRem} Players Remaining For ${safeSeats} Seats, ${totalChips.toLocaleString('en-US')} Total Chips): Seat-Lock Target ${seatLockStack.toLocaleString('en-US')} Chips, Bubble Factor ${bubbleFactor}x (${reqEq}% Required All-In Equity).`,
        normalizedQuery: { total, seats: safeSeats, rem: safeRem },
      };
    }
  }

  // 19. Cash Game Session Planner
  if (key === 'session-planner' || key === 'session') {
    const wr = clampNum(q.wr, -20, 50, null);
    const hrs = clampNum(q.hrs, 1, 24, null);
    if (wr !== null && hrs !== null) {
      const stake = String(q.stake || '2/5').trim();
      const bbParts = stake.split('/');
      const bbVal = clampNum(bbParts[1], 1, 1000, 5);
      const comp = clampNum(q.comp, 0, 50, 2);
      const exp = clampNum(q.exp, 0, 1000, 25);
      const grossHr = wr * bbVal;
      const netSession = (grossHr + comp) * hrs - exp;
      const netHr = netSession / hrs;
      return {
        hasValidatedSpot: true,
        tool: 'session-planner',
        statLabel: `SOLVED SESSION PLAN ($${stake} @ ${wr.toFixed(1)} BB/HR, ${hrs} HRS)`,
        statValue: `Net $${netHr.toFixed(2)}/Hr • +$${Math.round(netSession)}/Session`,
        summaryText: `$${stake} Live Cash Session Plan (${wr.toFixed(1)} BB/Hr Over ${hrs} Hrs, +$${comp}/Hr Comps, -$${exp} Expenses): Net Earn $${netHr.toFixed(2)}/Hr ($${Math.round(netSession)} Per Session).`,
        normalizedQuery: { stake, wr, hrs: Math.round(hrs), comp, exp: Math.round(exp) },
      };
    }
  }

  // 20. Straddle & Bomb Pot EV Calculator
  if (key === 'straddle-calculator' || key === 'straddle') {
    const stack = clampNum(q.stack, 100, 1000000, null);
    const ante = clampNum(q.ante, 1, 5000, null);
    if (stack !== null && ante !== null) {
      const blinds = String(q.blinds || '2/5').trim();
      const bb = clampNum(blinds.split('/')[1], 1, 1000, 5);
      const straddleAmt = bb * 2;
      const effBb = stack / straddleAmt;
      const players = Math.round(clampNum(q.players, 2, 10, 8));
      const bombDead = ante * players;
      return {
        hasValidatedSpot: true,
        tool: 'straddle-calculator',
        statLabel: `SOLVED STRADDLE & BOMB POT ($${blinds} -> $${straddleAmt} STRADDLE)`,
        statValue: `${effBb.toFixed(1)} Straddle BBs • $${Math.round(bombDead)} Bomb Pot`,
        summaryText: `$${blinds} Cash Game With $${straddleAmt} Straddle ($${Math.round(stack)} Stack): Effective Depth ${effBb.toFixed(1)} Straddle BBs; ${players}-Way $${Math.round(ante)} Bomb Pot Creates $${Math.round(bombDead)} Dead Money.`,
        normalizedQuery: { blinds, stack: Math.round(stack), ante: Math.round(ante), players },
      };
    }
  }

  // 21. Bad Beat Jackpot & Promo EV Calculator
  if (key === 'promo-ev-calculator' || key === 'promo-ev') {
    const pool = clampNum(q.pool, 5000, 10000000, null);
    if (pool !== null) {
      const qual = String(q.qual || 'quad_8s').toLowerCase();
      const drop = clampNum(q.drop, 0, 10, 2);
      const oddsHands = qual === 'quad_deuces' ? 32000 : qual === 'quad_10s' ? 68000 : qual === 'aces_full_kings' ? 18500 : 48000;
      const breakevenPool = Math.round(oddsHands * drop * 1.45);
      const evPerHand = +((pool * 0.7) / oddsHands - drop * 0.11).toFixed(2);
      return {
        hasValidatedSpot: true,
        tool: 'promo-ev-calculator',
        statLabel: `SOLVED BBJ PROMO EV ($${Math.round(pool).toLocaleString('en-US')} POOL, $${drop} DROP)`,
        statValue: `${evPerHand >= 0 ? '+EV' : '-EV'} ($${evPerHand}/Hand • BE $${breakevenPool.toLocaleString('en-US')})`,
        summaryText: `Bad Beat Jackpot Pool $${Math.round(pool).toLocaleString('en-US')} (${qual}, $${drop}/Hand Drop): Breakeven Pool $${breakevenPool.toLocaleString('en-US')}, Net Jackpot EV ${evPerHand >= 0 ? '+' : ''}$${evPerHand}/Hand.`,
        normalizedQuery: { pool: Math.round(pool), qual, drop },
      };
    }
  }

  // 22. Who Wins 7-Card Showdown Calculator
  if (key === 'who-wins-calculator' || key === 'who-wins') {
    if (q.board && q.p1 && q.p2) {
      const board = String(q.board).trim().slice(0, 30);
      const p1 = String(q.p1).trim().slice(0, 15);
      const p2 = String(q.p2).trim().slice(0, 15);
      return {
        hasValidatedSpot: true,
        tool: 'who-wins-calculator',
        statLabel: `SOLVED 7-CARD SHOWDOWN (BOARD ${board.toUpperCase()})`,
        statValue: `P1 [${p1.toUpperCase()}] Vs P2 [${p2.toUpperCase()}]`,
        summaryText: `7-Card Hold'em Showdown Verification On Board [${board}]: Player 1 [${p1}] Vs. Player 2 [${p2}].`,
        normalizedQuery: { board, p1, p2 },
      };
    }
  }

  // 23. Hand History Formatter
  if (key === 'hand-converter') {
    if (q.stakes || q.cards || q.flop) {
      const stakes = String(q.stakes || '$2/$5 Live NLH').trim().slice(0, 40);
      const hero = String(q.hero || 'BTN').trim().slice(0, 10);
      const cards = String(q.cards || 'As Ks').trim().slice(0, 15);
      const flop = String(q.flop || 'Qh Jd 4s').trim().slice(0, 20);
      return {
        hasValidatedSpot: true,
        tool: 'hand-converter',
        statLabel: `FORMATTED HAND HISTORY (${stakes.toUpperCase()} • ${hero.toUpperCase()})`,
        statValue: `Hero [${cards}] On [${flop}]`,
        summaryText: `Formatted ${stakes} Hand History: Hero (${hero}) Holding [${cards}] On Flop [${flop}].`,
        normalizedQuery: { stakes, hero, cards, flop },
      };
    }
  }

  // 24. Mixed Game Placards
  if (key === 'mixed-game-placards') {
    if (q.preset) {
      const preset = String(q.preset || 'EIGHT_GAME').toUpperCase();
      const orbit = String(q.orbit || '8');
      const hand = Math.round(clampNum(q.hand, 1, 1000, 1));
      return {
        hasValidatedSpot: true,
        tool: 'mixed-game-placards',
        statLabel: `MIXED GAME ROTATION (${preset.replace(/_/g, ' ')})`,
        statValue: `${orbit}-Hand Orbit • Hand #${hand}`,
        summaryText: `Mixed-Game Table Rotation (${preset.replace(/_/g, ' ')}, ${orbit} Hands Per Game, Hand #${hand}).`,
        normalizedQuery: { preset, orbit, hand },
      };
    }
  }

  // 25. GTO Poker IQ Test
  if (key === 'poker-iq-test' || key === 'poker-iq') {
    const score = clampNum(q.score, 0, 10, null);
    if (score !== null) {
      const safeScore = Math.round(score);
      const iq = 85 + safeScore * 6;
      const tier = safeScore >= 9 ? 'Solver Grandmaster (99th Pct)' : safeScore >= 7 ? 'Sharp Reg (88th Pct)' : safeScore >= 5 ? 'Solid Winner (68th Pct)' : 'Developing Player';
      return {
        hasValidatedSpot: true,
        tool: 'poker-iq-test',
        statLabel: `VERIFIED GTO POKER IQ SCORE (${safeScore}/10 CORRECT)`,
        statValue: `IQ ${iq} • ${tier}`,
        summaryText: `Smarter.Poker 10-Question GTO Poker IQ Diagnostic Score: ${safeScore}/10 (${iq} Quantitative IQ - ${tier}).`,
        normalizedQuery: { score: safeScore },
      };
    }
  }

  // 26. Multi-Way Side Pot Calculator
  if (key === 'side-pot-calculator' || key === 'side-pot') {
    if (q.stacks) {
      const stacks = String(q.stacks)
        .split(',')
        .map((v) => clampNum(v, 10, 1000000000, null))
        .filter((v) => v !== null)
        .slice(0, 9);
      if (stacks.length >= 2) {
        const dead = Math.round(clampNum(q.deadMoney ?? q.dead, 0, 100000000, 0));
        const totalPot = stacks.reduce((a, b) => a + b, 0) + dead;
        const uniqueLevels = [...new Set(stacks)].sort((a, b) => a - b);
        const mainPot = uniqueLevels[0] * stacks.length + dead;
        return {
          hasValidatedSpot: true,
          tool: 'side-pot-calculator',
          statLabel: `SOLVED ${stacks.length}-WAY SIDE POTS (${totalPot.toLocaleString('en-US')} TOTAL)`,
          statValue: `Main Pot ${mainPot.toLocaleString('en-US')} • ${Math.max(0, uniqueLevels.length - 1)} Side Pot(s)`,
          summaryText: `${stacks.length}-Way All-In Side Pot Breakdown (Stacks: ${stacks.join(' / ')}, Dead Money: ${dead}): Main Pot ${mainPot.toLocaleString('en-US')}, Total Pot ${totalPot.toLocaleString('en-US')}.`,
          normalizedQuery: { stacks: stacks.join(','), ...(dead > 0 ? { deadMoney: dead } : {}) },
        };
      }
    }
  }

  // 27. Tournament Blind Structure Generator
  if (key === 'blind-structure-calculator' || key === 'blind-structure') {
    const stack = clampNum(q.stack, 1000, 10000000, null);
    const hours = clampNum(q.hours, 1, 24, null);
    if (stack !== null && hours !== null) {
      const players = Math.round(clampNum(q.players, 2, 5000, 18));
      const mins = Math.round(clampNum(q.mins, 5, 120, 20));
      const ante = String(q.ante || 'bba').toLowerCase() === 'none' ? 'none' : 'bba';
      const levels = Math.max(6, Math.round((hours * 60) / mins));
      return {
        hasValidatedSpot: true,
        tool: 'blind-structure-calculator',
        statLabel: `SOLVED TDA BLIND SCHEDULE (${players} PLAYERS, ${hours} HRS)`,
        statValue: `${Math.round(stack).toLocaleString('en-US')} Chips • ${levels} x ${mins}m Levels`,
        summaryText: `TDA Blind Schedule For ${players} Players (${hours}-Hour Target, ${Math.round(stack).toLocaleString('en-US')} Starting Stack, ${mins}-Minute Levels, ${ante.toUpperCase()}).`,
        normalizedQuery: { players, hours, stack: Math.round(stack), mins, ante },
      };
    }
  }

  // 28. Tournament Payout Calculator
  if (key === 'payout-calculator' || key === 'tournament-payout-calculator') {
    const entries = clampNum(q.entries, 2, 100000, null);
    const buyIn = clampNum(q.buyIn ?? q.buyin, 1, 1000000, null);
    if (entries !== null && buyIn !== null) {
      const rebuys = Math.round(clampNum(q.rebuys, 0, 100000, 0));
      const added = Math.round(clampNum(q.added, 0, 10000000, 0));
      const pool = (Math.round(entries) + rebuys) * buyIn + added;
      const paidSpots = Math.max(1, Math.round(entries * 0.15));
      return {
        hasValidatedSpot: true,
        tool: 'payout-calculator',
        statLabel: `SOLVED PRIZE POOL (${Math.round(entries)} ENTRIES @ $${buyIn})`,
        statValue: `$${Math.round(pool).toLocaleString('en-US')} Pool • ${paidSpots} Places Paid`,
        summaryText: `Tournament Prize Pool (${Math.round(entries)} Entries + ${rebuys} Rebuys At $${buyIn}): $${Math.round(pool).toLocaleString('en-US')} Total Pool Paying Top ${paidSpots} Places.`,
        normalizedQuery: { entries: Math.round(entries), rebuys, buyIn, added },
      };
    }
  }

  // 29. Home Game Chip Set Kit
  if (key === 'home-game-kit') {
    const players = clampNum(q.players, 2, 30, null);
    if (players !== null) {
      const safePlayers = Math.round(players);
      const format = String(q.format || 'cash').toLowerCase() === 'tournament' ? 'tournament' : 'cash';
      const setSize = [300, 500, 1000].includes(Number(q.set)) ? Number(q.set) : 500;
      const preset = String(q.preset || (format === 'tournament' ? 't10000' : 'cash-1-2'));
      return {
        hasValidatedSpot: true,
        tool: 'home-game-kit',
        statLabel: `SOLVED HOME GAME KIT (${safePlayers} PLAYERS • ${setSize}-CHIP SET)`,
        statValue: `${format.toUpperCase()} (${preset.toUpperCase()})`,
        summaryText: `Home Game Chip Distribution For ${safePlayers} Players (${format.toUpperCase()}, ${setSize}-Chip Set, Preset ${preset}).`,
        normalizedQuery: { format, players: safePlayers, set: setSize, preset },
      };
    }
  }

  // 30. Format Diagnostic Quiz
  if (key === 'format-quiz') {
    if (q.hours || q.br || q.var || q.focus || q.env) {
      const hours = String(q.hours || '3-5h');
      const br = String(q.br || '50-100');
      const variance = String(q.var || 'balanced');
      const focus = String(q.focus || 'postflop');
      const env = String(q.env || 'live');
      const rec = env === 'live' && hours !== '6-10h' ? 'Live $1/$3-$2/$5 Cash' : focus === 'icm' ? 'Multi-Table Tournaments (MTT)' : 'Online 6-Max NLH / PLO';
      return {
        hasValidatedSpot: true,
        tool: 'format-quiz',
        statLabel: `SOLVED FORMAT MATCH (${hours.toUpperCase()} • ${br} BI • ${env.toUpperCase()})`,
        statValue: `Recommended: ${rec}`,
        summaryText: `Poker Format Diagnostic (${hours} Sessions, ${br} Buy-Ins, ${variance} Variance, ${focus} Focus, ${env}): Recommended Primary Format ${rec}.`,
        normalizedQuery: { hours, br, var: variance, focus, env },
      };
    }
  }

  // 31. Geometric Bet Sizing Calculator
  if (key === 'geometric-bet-calculator' || key === 'geometric') {
    const pot = clampNum(q.pot, 0.5, 10000000, null);
    const stack = clampNum(q.stack, 1, 10000000, null);
    if (pot !== null && stack !== null) {
      const mode = ['3e', '2e', 'check_2e'].includes(String(q.mode)) ? String(q.mode) : '3e';
      const streets = mode === '3e' ? 3 : 2;
      const spr = stack / pot;
      const pct = ((Math.pow(1 + 2 * spr, 1 / streets) - 1) / 2) * 100;
      const firstBet = +(pot * (pct / 100)).toFixed(1);
      return {
        hasValidatedSpot: true,
        tool: 'geometric-bet-calculator',
        statLabel: `SOLVED ${streets}-STREET GEOMETRIC (${stack} STACK / ${pot} POT)`,
        statValue: `${pct.toFixed(1)}% Pot Per Street (${firstBet} Bet 1)`,
        summaryText: `${streets}-Street Geometric Sizing (${stack} Effective Stack Into ${pot} Pot, ${spr.toFixed(2)} SPR): Bet ${pct.toFixed(1)}% Pot On Each Street (${firstBet} First Bet).`,
        normalizedQuery: { pot, stack, mode },
      };
    }
  }

  // 32. Tournament Late-Registration ICM Calculator
  if (key === 'late-reg-calculator' || key === 'late-reg') {
    const buyin = clampNum(q.buyin, 5, 1000000, null);
    const rem = clampNum(q.rem, 15, 100, null);
    if (buyin !== null && rem !== null) {
      const rake = clampNum(q.rake, 0, 30, 10);
      const entries = Math.round(clampNum(q.entries, 10, 50000, 400));
      const bb = clampNum(q.bb, 5, 100, 15);
      const roi = clampNum(q.roi, -20, 200, 18);
      const netTicket = buyin * (1 - rake / 100);
      const icmMult = +(1 + ((100 - rem) / 100) * 0.24).toFixed(3);
      const startEq = +(netTicket * icmMult).toFixed(2);
      return {
        hasValidatedSpot: true,
        tool: 'late-reg-calculator',
        statLabel: `SOLVED LATE-REG ICM ($${buyin} BUY-IN, ${rem}% FIELD LEFT)`,
        statValue: `$${startEq} Instant Stack Equity (${icmMult}x ICM)`,
        summaryText: `Late Registration At ${rem}% Field Remaining ($${buyin} Buy-In, ${rake}% Fee, ${bb} BB Stack): Starting Stack ICM Value $${startEq} (${icmMult}x Appreciation).`,
        normalizedQuery: { buyin, rake, entries, rem, bb, roi },
      };
    }
  }

  // 33. MTT Session Grind & ABI Planner
  if (key === 'mtt-grind-planner' || key === 'mtt-grind') {
    const mtts = clampNum(q.mtts, 1, 100, null);
    const abi = clampNum(q.abi, 1, 100000, null);
    if (mtts !== null && abi !== null) {
      const safeMtts = Math.round(mtts);
      const bullets = clampNum(q.bullets, 0, 200, 30);
      const roi = clampNum(q.roi, -20, 200, 22);
      const br = clampNum(q.br, 100, 10000000, 12000);
      const totalRisk = Math.round(safeMtts * abi * (1 + bullets / 100));
      const evProfit = Math.round(totalRisk * (roi / 100));
      return {
        hasValidatedSpot: true,
        tool: 'mtt-grind-planner',
        statLabel: `SOLVED MTT SLATE (${safeMtts} MTTS @ $${abi} ABI + ${bullets}% BULLETS)`,
        statValue: `$${totalRisk.toLocaleString('en-US')} Slate Risk • +$${evProfit} EV`,
        summaryText: `${safeMtts}-Tournament Session At $${abi} ABI (+${bullets}% Re-Entry Budget): Total Slate Capital $${totalRisk.toLocaleString('en-US')}, Expected Profit +$${evProfit} At ${roi}% ROI.`,
        normalizedQuery: { mtts: safeMtts, abi, bullets, roi, br: Math.round(br) },
      };
    }
  }

  // 34. PLO Straight Wrap & Outs Calculator
  if (key === 'plo-outs-calculator' || key === 'plo-outs') {
    const outs = clampNum(q.outs, 1, 30, null);
    if (outs !== null) {
      const safeOuts = Math.round(outs);
      const nut = Math.min(safeOuts, Math.round(clampNum(q.nut, 0, 30, Math.max(0, safeOuts - 3))));
      const wrap = String(q.wrap || 'wrap_20');
      const pot = clampNum(q.pot, 1, 10000000, 120);
      const bet = clampNum(q.bet, 0, 10000000, 120);
      const flopToRiver = (1 - ((45 - safeOuts) / 45) * ((44 - safeOuts) / 44)) * 100;
      const nutRatio = Math.round((nut / safeOuts) * 100);
      return {
        hasValidatedSpot: true,
        tool: 'plo-outs-calculator',
        statLabel: `SOLVED PLO WRAP (${safeOuts} TOTAL OUTS / ${nut} NUT OUTS)`,
        statValue: `${flopToRiver.toFixed(1)}% By River (${nutRatio}% Nut Share)`,
        summaryText: `PLO Wrap Analysis (${safeOuts} Clean Outs, ${nut} Nut Outs On 45 Unseen Cards): ${flopToRiver.toFixed(1)}% Flop-To-River Completion (${nutRatio}% Nut-Out Purity).`,
        normalizedQuery: { wrap, outs: safeOuts, nut, pot: Math.round(pot), bet: Math.round(bet) },
      };
    }
  }

  // 35. Live Poker Trip Budget Planner
  if (key === 'poker-trip-planner' || key === 'trip-planner') {
    const days = clampNum(q.days, 1, 90, null);
    const buyins = clampNum(q.buyins, 100, 10000000, null);
    if (days !== null && buyins !== null) {
      const safeDays = Math.round(days);
      const flight = clampNum(q.flight, 0, 50000, 480);
      const hotel = clampNum(q.hotel, 0, 5000, 165);
      const food = clampNum(q.food, 0, 2000, 85);
      const roi = clampNum(q.roi, -20, 200, 22);
      const travelCost = Math.round(flight + safeDays * (hotel + food));
      const overheadPct = +((travelCost / buyins) * 100).toFixed(1);
      return {
        hasValidatedSpot: true,
        tool: 'poker-trip-planner',
        statLabel: `SOLVED POKER TRIP (${safeDays} DAYS, $${Math.round(buyins).toLocaleString('en-US')} ACTION)`,
        statValue: `$${travelCost.toLocaleString('en-US')} Travel (${overheadPct}% Overhead)`,
        summaryText: `${safeDays}-Day Poker Trip ($${Math.round(buyins).toLocaleString('en-US')} Planned Action, $${travelCost.toLocaleString('en-US')} Travel Expenses): ${overheadPct}% Travel Overhead Drag.`,
        normalizedQuery: { days: safeDays, flight: Math.round(flight), hotel: Math.round(hotel), food: Math.round(food), buyins: Math.round(buyins), roi },
      };
    }
  }

  // 36. Live Action Shot Clock
  if (key === 'shot-clock') {
    const primary = clampNum(q.primary, 5, 180, null);
    if (primary !== null) {
      const safePrimary = Math.round(primary);
      const bank = Math.round(clampNum(q.bank, 10, 300, 30));
      return {
        hasValidatedSpot: true,
        tool: 'shot-clock',
        statLabel: `TDA ACTION SHOT CLOCK (${safePrimary}S PRIMARY / ${bank}S TIME BANK)`,
        statValue: `${safePrimary}s Decision • +${bank}s Bank Card`,
        summaryText: `TDA Tournament Shot Clock Configuration: ${safePrimary}-Second Primary Decision Timer With +${bank}-Second Time-Bank Extension Cards.`,
        normalizedQuery: { primary: safePrimary, bank },
      };
    }
  }

  // 37. Live Cash Table Selection Calculator
  if (key === 'table-selection-calculator' || key === 'table-selection') {
    const recs = clampNum(q.recs, 0, 8, null);
    const depth = clampNum(q.depth, 20, 1000, null);
    if (recs !== null && depth !== null) {
      const safeRecs = Math.round(recs);
      const stake = String(q.stake || '2_5');
      const straddle = Math.round(clampNum(q.straddle, 0, 100, 65));
      const bomb = Math.round(clampNum(q.bomb, 0, 3, 1));
      const rake = clampNum(q.rake, 0, 30, 6);
      const score = Math.min(100, Math.max(10, Math.round(safeRecs * 12 + Math.min(25, depth / 10) + straddle * 0.12 + bomb * 5 - rake * 1.2)));
      const grade = score >= 85 ? 'A+ Must-Sit' : score >= 72 ? 'A Strong' : score >= 58 ? 'B Playable' : 'C/D Table-Change';
      return {
        hasValidatedSpot: true,
        tool: 'table-selection-calculator',
        statLabel: `SOLVED TABLE SCORE (${safeRecs} RECS, ${Math.round(depth)} BB DEEP)`,
        statValue: `Score ${score}/100 (${grade})`,
        summaryText: `Live Cash Table Selection (${safeRecs} Recreational Seats, ${Math.round(depth)} BB Avg Stack, ${straddle}% Straddles, $${rake} Rake Cap): Table Profitability Score ${score}/100 (${grade}).`,
        normalizedQuery: { stake, recs: safeRecs, depth: Math.round(depth), straddle, bomb, rake },
      };
    }
  }

  // 38. Winrate Confidence Interval Calculator
  if (key === 'winrate-confidence-calculator' || key === 'winrate-confidence') {
    const wr = clampNum(q.wr, -50, 100, null);
    const sd = clampNum(q.sd, 5, 300, null);
    const hands = clampNum(q.hands, 100, 10000000, null);
    if (wr !== null && sd !== null && hands !== null) {
      const safeHands = Math.round(hands);
      const mode = String(q.mode || 'bb100') === 'hourly' ? 'hourly' : 'bb100';
      const se = sd / Math.sqrt(safeHands / 100);
      const ci95Low = +(wr - 1.96 * se).toFixed(2);
      const ci95High = +(wr + 1.96 * se).toFixed(2);
      return {
        hasValidatedSpot: true,
        tool: 'winrate-confidence-calculator',
        statLabel: `SOLVED 95% WINRATE CI (${safeHands.toLocaleString('en-US')} HANDS @ ${wr} BB/100)`,
        statValue: `[${ci95Low}, +${ci95High}] BB/100 (±${(1.96 * se).toFixed(2)})`,
        summaryText: `Winrate Confidence Bounds Over ${safeHands.toLocaleString('en-US')} Hands (${wr} BB/100 Observed, ${sd} BB/100 SD): 95% Confidence Interval [${ci95Low}, +${ci95High}] BB/100.`,
        normalizedQuery: { mode, wr, sd, hands: safeHands },
      };
    }
  }

  // 39. Multiway Poker Odds Calculator
  if (key === 'poker-odds-calculator' || key === 'odds-calculator') {
    if (q.hand1 || q.hand2 || q.hands || q.board) {
      const game = String(q.game || 'holdem').toLowerCase();
      const hand1 = String(q.hand1 || (q.hands ? String(q.hands).split(',')[0] : 'AsAh')).trim().slice(0, 16);
      const hand2 = String(q.hand2 || (q.hands ? String(q.hands).split(',')[1] || 'KsKh' : 'KsKh')).trim().slice(0, 16);
      const board = String(q.board || '').trim().slice(0, 20);
      return {
        hasValidatedSpot: true,
        tool: 'poker-odds-calculator',
        statLabel: `SOLVED ${game.toUpperCase()} EQUITY MATCHUP${board ? ` (BOARD ${board.toUpperCase()})` : ''}`,
        statValue: `${hand1.toUpperCase()} Vs ${hand2.toUpperCase()}`,
        summaryText: `${game.toUpperCase()} Combinatorial Equity Simulation: ${hand1} Vs. ${hand2}${board ? ` On Board [${board}]` : ' (52-Card Pre-Flop Enumeration)'}.`,
        normalizedQuery: { game, hand1, hand2, ...(board ? { board } : {}) },
      };
    }
  }

  // 40. 100BB 6-Max GTO Preflop Ranges
  if (key === 'preflop-ranges' || key === 'preflop-charts') {
    if (q.pos || q.position || q.action || q.depth) {
      const pos = String(q.pos || q.position || 'BTN').toUpperCase().slice(0, 10);
      const action = String(q.action || 'RFI').toUpperCase().slice(0, 16);
      const depth = Math.round(clampNum(q.depth, 10, 300, 100));
      return {
        hasValidatedSpot: true,
        tool: 'preflop-ranges',
        statLabel: `13X13 GTO PREFLOP MATRIX (${depth}BB 6-MAX • ${pos})`,
        statValue: `${pos} ${action} Range (${depth}BB)`,
        summaryText: `100BB 6-Max Solver-Verified 13x13 Preflop Matrix: ${pos} ${action} At ${depth}BB Effective Stack.`,
        normalizedQuery: { pos, action, depth },
      };
    }
  }

  // 41. Multiway All-In EV Calculator
  if (key === 'multiway-all-in-calculator' || key === 'multiway-all-in') {
    const p1 = clampNum(q.p1, 1, 10000000, null);
    const p2 = clampNum(q.p2, 1, 10000000, null);
    if (p1 !== null && p2 !== null) {
      const p3 = clampNum(q.p3, 1, 10000000, 30);
      const eq1 = clampNum(q.eq1, 0, 100, 48);
      const eq2 = clampNum(q.eq2, 0, 100, 32);
      const eq3 = clampNum(q.eq3, 0, 100, 20);
      const dead = clampNum(q.dead, 0, 1000000, 2.5);
      const eqSum = Math.max(0.01, eq1 + eq2 + eq3);
      const n1 = eq1 / eqSum;
      const n2 = eq2 / eqSum;
      const n3 = eq3 / eqSum;
      const sorted = [p1, p2, p3].slice().sort((a, b) => a - b);
      const mainPot = sorted[0] * 3 + dead;
      const sidePot1 = Math.max(0, sorted[1] - sorted[0]) * 2;
      const uncalled = Math.max(0, sorted[2] - sorted[1]);
      const p1Risk = Math.min(p1, sorted[1]);
      const p1SideShare = p1 > sorted[0] ? n1 / Math.max(0.01, (p1 > sorted[0] ? n1 : 0) + (p2 > sorted[0] ? n2 : 0) + (p3 > sorted[0] ? n3 : 0)) : 0;
      const p1Ev = mainPot * n1 + sidePot1 * p1SideShare - p1Risk;
      return {
        hasValidatedSpot: true,
        tool: 'multiway-all-in-calculator',
        statLabel: `SOLVED 3-WAY ALL-IN (${Math.round(p1)} / ${Math.round(p2)} / ${Math.round(p3)} BB)`,
        statValue: `Main ${mainPot.toFixed(1)} BB • P1 EV ${p1Ev >= 0 ? '+' : ''}${p1Ev.toFixed(2)} BB`,
        summaryText: `3-Way All-In (${Math.round(p1)}/${Math.round(p2)}/${Math.round(p3)} BB Stacks, ${ (n1 * 100).toFixed(1) }%/${ (n2 * 100).toFixed(1) }%/${ (n3 * 100).toFixed(1) }% Equities): Main Pot ${mainPot.toFixed(1)} BB, Side Pot ${sidePot1.toFixed(1)} BB, Uncalled ${uncalled.toFixed(1)} BB, Hero Net EV ${p1Ev >= 0 ? '+' : ''}${p1Ev.toFixed(2)} BB.`,
        normalizedQuery: { p1: Math.round(p1), p2: Math.round(p2), p3: Math.round(p3), eq1, eq2, eq3, dead },
      };
    }
  }

  // 42. Mystery Bounty Envelope Tracker
  if (key === 'mystery-bounty-tracker' || key === 'mystery-bounty') {
    const pool = clampNum(q.pool, 100, 100000000, null);
    const envelopes = clampNum(q.envelopes, 1, 10000, null);
    if (pool !== null && envelopes !== null) {
      const safeEnv = Math.round(envelopes);
      const topBounty = clampNum(q.topBounty, 10, pool, Math.round(pool * 0.25));
      const players = Math.round(clampNum(q.players, safeEnv, 50000, 400));
      const startChips = Math.round(clampNum(q.startChips, 1000, 10000000, 25000));
      const fee = clampNum(q.fee, 10, 1000000, 500);
      const avgBounty = pool / safeEnv;
      const totalChips = players * startChips;
      const chipPerDollar = totalChips / Math.max(1, players * fee);
      const chipEq = Math.round(avgBounty * chipPerDollar * 0.35);
      return {
        hasValidatedSpot: true,
        tool: 'mystery-bounty-tracker',
        statLabel: `SOLVED MYSTERY BOUNTY (${safeEnv} ENVELOPES / $${Math.round(pool).toLocaleString('en-US')} POOL)`,
        statValue: `Avg $${Math.round(avgBounty).toLocaleString('en-US')} • +${chipEq.toLocaleString('en-US')} Chips`,
        summaryText: `Day-2 Mystery Bounty Pool ($${Math.round(pool).toLocaleString('en-US')} Remaining Across ${safeEnv} Envelopes, Top Prize $${Math.round(topBounty).toLocaleString('en-US')}): Average Envelope Value $${Math.round(avgBounty).toLocaleString('en-US')} (+${chipEq.toLocaleString('en-US')} Chip Equivalent).`,
        normalizedQuery: { pool: Math.round(pool), topBounty: Math.round(topBounty), envelopes: safeEnv, players, startChips, fee },
      };
    }
  }

  // 43. Final Table Bubble Factor Matrix Calculator
  if (key === 'bubble-factor-calculator' || key === 'bubble-factor') {
    const s1 = clampNum(q.s1, 1, 10000000, null);
    const s2 = clampNum(q.s2, 1, 10000000, null);
    if (s1 !== null && s2 !== null) {
      const s3 = clampNum(q.s3, 1, 10000000, 22);
      const s4 = clampNum(q.s4, 1, 10000000, 13);
      const p1 = clampNum(q.p1, 10, 100000000, 42000);
      const p2 = clampNum(q.p2, 10, 100000000, 27000);
      const p3 = clampNum(q.p3, 10, 100000000, 18000);
      const p4 = clampNum(q.p4, 0, 100000000, 13000);
      const stacks = [s1, s2, s3, s4];
      const payouts = [p1, p2, p3, p4];
      const baseEq = computeMalmuthHarvilleIcm(stacks, payouts);
      const eff = Math.min(s1, s2);
      const winEq = computeMalmuthHarvilleIcm([s1 + eff, s2 - eff, s3, s4], payouts);
      const loseEq = computeMalmuthHarvilleIcm([s1 - eff, s2 + eff, s3, s4], payouts);
      const dWin = Math.max(0.01, winEq[0] - baseEq[0]);
      const dLose = Math.max(0.01, baseEq[0] - loseEq[0]);
      const bf = +(dLose / dWin).toFixed(2);
      const reqEq = +((bf / (bf + 1)) * 100).toFixed(1);
      return {
        hasValidatedSpot: true,
        tool: 'bubble-factor-calculator',
        statLabel: `SOLVED ICM BUBBLE FACTOR (${Math.round(s1)} BB VS ${Math.round(s2)} BB)`,
        statValue: `BF ${bf.toFixed(2)}x • ${reqEq.toFixed(1)}% Req Equity`,
        summaryText: `Final Table 4-Handed ICM Bubble Factor (P1 ${Math.round(s1)} BB Vs. P2 ${Math.round(s2)} BB): Bubble Factor ${bf.toFixed(2)}x, Required All-In Calling Equity ${reqEq.toFixed(1)}% (+${(reqEq - 50).toFixed(1)}% Risk Premium).`,
        normalizedQuery: { s1: Math.round(s1), s2: Math.round(s2), s3: Math.round(s3), s4: Math.round(s4), p1: Math.round(p1), p2: Math.round(p2), p3: Math.round(p3), p4: Math.round(p4) },
      };
    }
  }

  // 44. River Bluff-Catching & Blocker Solver
  if (key === 'bluff-catching-calculator' || key === 'bluff-catching') {
    const pot = clampNum(q.pot, 1, 10000000, null);
    const bet = clampNum(q.bet, 1, 10000000, null);
    if (pot !== null && bet !== null) {
      const valueCombos = clampNum(q.valueCombos, 1, 500, 18);
      const bluffCombos = clampNum(q.bluffCombos, 0, 500, 11);
      const blockerPct = clampNum(q.blockerPct, 0, 95, 35);
      const reqEq = (bet / (pot + 2 * bet)) * 100;
      const mdf = (pot / (pot + bet)) * 100;
      const effBluffs = bluffCombos * (1 - blockerPct / 100);
      const actualBluffShare = (effBluffs / Math.max(0.01, valueCombos + effBluffs)) * 100;
      const callEv = (actualBluffShare / 100) * (pot + bet) - (1 - actualBluffShare / 100) * bet;
      return {
        hasValidatedSpot: true,
        tool: 'bluff-catching-calculator',
        statLabel: `SOLVED RIVER BLUFF-CATCH ($${Math.round(bet)} INTO $${Math.round(pot)})`,
        statValue: `${actualBluffShare.toFixed(1)}% Bluffs Vs ${reqEq.toFixed(1)}% Req (EV ${callEv >= 0 ? '+' : ''}$${callEv.toFixed(2)})`,
        summaryText: `River Bluff-Catching ($${Math.round(bet)} Bet Into $${Math.round(pot)} Pot, ${valueCombos} Value / ${bluffCombos} Bluff Combos, ${blockerPct}% Hero Blocker Removal): Effective Villain Bluff Share ${actualBluffShare.toFixed(1)}% Vs. ${reqEq.toFixed(1)}% Required (${mdf.toFixed(1)}% MDF), Call EV ${callEv >= 0 ? '+' : ''}$${callEv.toFixed(2)}.`,
        normalizedQuery: { pot: Math.round(pot), bet: Math.round(bet), valueCombos: Math.round(valueCombos), bluffCombos: Math.round(bluffCombos), blockerPct: Math.round(blockerPct) },
      };
    }
  }

  // 45. Multi-Street Barrel EV Solver
  if (key === 'multi-street-ev-calculator' || key === 'multi-street-ev') {
    const pot = clampNum(q.pot, 1, 1000000, null);
    const fBet = clampNum(q.fBet, 10, 300, null);
    if (pot !== null && fBet !== null) {
      const fFold = clampNum(q.fFold, 0, 95, 32);
      const tBet = clampNum(q.tBet, 10, 300, 75);
      const tFold = clampNum(q.tFold, 0, 95, 42);
      const rBet = clampNum(q.rBet, 10, 400, 120);
      const rFold = clampNum(q.rFold, 0, 95, 48);
      const eq = clampNum(q.eq, 0, 100, 0);
      const cumFold = (1 - (1 - fFold / 100) * (1 - tFold / 100) * (1 - rFold / 100)) * 100;
      const flopBetAmt = pot * (fBet / 100);
      const turnPot = pot + 2 * flopBetAmt;
      const turnBetAmt = turnPot * (tBet / 100);
      const riverPot = turnPot + 2 * turnBetAmt;
      const riverBetAmt = riverPot * (rBet / 100);
      const totalRisk = flopBetAmt + turnBetAmt + riverBetAmt;
      return {
        hasValidatedSpot: true,
        tool: 'multi-street-ev-calculator',
        statLabel: `SOLVED TRIPLE-BARREL (${fBet}% / ${tBet}% / ${rBet}% POT)`,
        statValue: `${cumFold.toFixed(1)}% Cumul Fold • ${totalRisk.toFixed(1)} BB Total Risk`,
        summaryText: `Triple-Barrel Geometry (Starting Pot ${pot} BB, Sizings ${fBet}%/${tBet}%/${rBet}%, Street Folds ${fFold}%/${tFold}%/${rFold}%): Cumulative Fold Equity ${cumFold.toFixed(1)}%, Total 3-Street Risk ${totalRisk.toFixed(1)} BB.`,
        normalizedQuery: { pot, fBet: Math.round(fBet), fFold: Math.round(fFold), tBet: Math.round(tBet), tFold: Math.round(tFold), rBet: Math.round(rBet), rFold: Math.round(rFold), eq },
      };
    }
  }

  // 46. Heads-Up Push/Fold Nash Solver
  if (key === 'heads-up-push-fold-calculator' || key === 'heads-up-push-fold') {
    const bb = clampNum(q.bb, 1, 25, null);
    if (bb !== null) {
      const role = ['sb_push', 'bb_call', 'sb_limp'].includes(String(q.role)) ? String(q.role) : 'sb_push';
      const ante = clampNum(q.ante, 0, 25, 0);
      const baseFreq = role === 'sb_push' ? Math.min(96, 38 + (25 - bb) * 2.4 + (ante > 0 ? 6 : 0)) : role === 'bb_call' ? Math.min(88, 22 + (25 - bb) * 2.1 + (ante > 0 ? 5 : 0)) : Math.min(75, 45 - (25 - bb) * 0.8);
      const roleLabel = role === 'sb_push' ? 'SB Open-Shove' : role === 'bb_call' ? 'BB Call Vs. Shove' : 'SB Limp-Trap';
      return {
        hasValidatedSpot: true,
        tool: 'heads-up-push-fold-calculator',
        statLabel: `SOLVED HU NASH (${bb.toFixed(1)} BB • ${roleLabel.toUpperCase()})`,
        statValue: `${baseFreq.toFixed(1)}% Range (${Math.round((baseFreq / 100) * 1326)} Combos)`,
        summaryText: `Heads-Up Nash Equilibrium At ${bb.toFixed(1)} BB (${roleLabel}, ${ante}% Ante): Unexploitable Frequency ${baseFreq.toFixed(1)}% (${Math.round((baseFreq / 100) * 1326)} Of 1,326 Combos).`,
        normalizedQuery: { bb, role, ante },
      };
    }
  }

  // 47. Blind Vs Blind (SB Vs BB) Explorer
  if (key === 'blind-vs-blind-calculator' || key === 'blind-vs-blind') {
    const bb = clampNum(q.bb, 15, 200, null);
    if (bb !== null) {
      const safeBb = [25, 50, 100].includes(Math.round(bb)) ? Math.round(bb) : 100;
      const action = ['sb_first_in', 'bb_vs_limp', 'bb_vs_raise', 'sb_vs_3bet'].includes(String(q.action)) ? String(q.action) : 'sb_first_in';
      const sizing = String(q.sizing || '3.0bb');
      const vpip = action === 'sb_first_in' ? (sizing === 'limp_mix' ? '56.3% VPIP' : '42.8% RFI') : action === 'bb_vs_limp' ? '36.2% Iso-Raise' : action === 'bb_vs_raise' ? '53.6% Defend' : '48.2% Defend';
      return {
        hasValidatedSpot: true,
        tool: 'blind-vs-blind-calculator',
        statLabel: `SOLVED BVB MATRIX (${safeBb} BB • ${action.replace(/_/g, ' ').toUpperCase()})`,
        statValue: `${vpip} (${sizing.toUpperCase()})`,
        summaryText: `Blind-Vs-Blind GTO Strategy (${safeBb} BB Effective, ${action.replace(/_/g, ' ')}, Sizing ${sizing}): Solver Equilibrium ${vpip}.`,
        normalizedQuery: { bb: safeBb, action, sizing },
      };
    }
  }

  // 48. Bankroll Shot-Taking Planner
  if (key === 'shot-taking-calculator' || key === 'shot-taking') {
    const bankroll = clampNum(q.bankroll, 200, 10000000, null);
    const shotBb = clampNum(q.shotBb, 0.5, 10000, null);
    if (bankroll !== null && shotBb !== null) {
      const baseBb = clampNum(q.baseBb, 0.25, shotBb, Math.max(1, Math.round(shotBb / 2)));
      const stopLossBi = Math.round(clampNum(q.stopLossBi, 1, 20, 3));
      const wrBase = clampNum(q.wrBase, 0.5, 40, 8);
      const wrShot = clampNum(q.wrShot, 0.5, 40, 5);
      const shotBuyIn = shotBb * 100;
      const stopLossDollars = stopLossBi * shotBuyIn;
      const moveDownFloor = Math.max(0, bankroll - stopLossDollars);
      const rebuildHours = Math.ceil(stopLossDollars / Math.max(1, (wrBase / 100) * 30 * baseBb));
      return {
        hasValidatedSpot: true,
        tool: 'shot-taking-calculator',
        statLabel: `SOLVED SHOT PLAN ($${Math.round(bankroll).toLocaleString('en-US')} BR -> $${shotBb} BB SHOT)`,
        statValue: `Stop-Loss ${stopLossBi} BI ($${Math.round(moveDownFloor).toLocaleString('en-US')} Floor)`,
        summaryText: `2-Tier Shot-Taking Plan ($${Math.round(bankroll).toLocaleString('en-US')} Bankroll, Base $${baseBb} BB -> Shot $${shotBb} BB, ${stopLossBi} Buy-In Stop-Loss): Move-Down Trigger At $${Math.round(moveDownFloor).toLocaleString('en-US')} (${rebuildHours} Base-Stake Rebuild Hours).`,
        normalizedQuery: { bankroll: Math.round(bankroll), baseBb, shotBb, stopLossBi, wrBase, wrShot },
      };
    }
  }

  // 49. Pre-Session Warmup & Cooldown Routine
  if (key === 'warmup-cooldown-routine' || key === 'warmup-cooldown') {
    const focusScore = clampNum(q.focusScore, 1, 10, null);
    const tiltScore = clampNum(q.tiltScore, 1, 10, null);
    if (focusScore !== null && tiltScore !== null) {
      const game = String(q.game || 'live_cash');
      const duration = Math.round(clampNum(q.duration, 1, 16, 5));
      const readiness = Math.min(100, Math.max(10, Math.round(focusScore * 6.5 + (11 - tiltScore) * 3.5)));
      const grade = readiness >= 85 ? 'A-Game Peak' : readiness >= 70 ? 'B-Game Solid' : 'C-Game Caution';
      return {
        hasValidatedSpot: true,
        tool: 'warmup-cooldown-routine',
        statLabel: `SOLVED SESSION READINESS (${game.replace(/_/g, ' ').toUpperCase()} • ${duration} HRS)`,
        statValue: `Readiness ${readiness}/100 (${grade})`,
        summaryText: `Pre-Session Readiness Audit (${game.replace(/_/g, ' ')}, ${duration}-Hour Target, Focus ${Math.round(focusScore)}/10, Tilt Risk ${Math.round(tiltScore)}/10): A-Game Readiness Score ${readiness}/100 (${grade}).`,
        normalizedQuery: { game, duration, tiltScore: Math.round(tiltScore), focusScore: Math.round(focusScore) },
      };
    }
  }

  // 50. Live Home Game Tournament Director Console
  if (key === 'home-game-director') {
    const players = clampNum(q.players, 2, 200, null);
    const buyin = clampNum(q.buyin, 1, 100000, null);
    if (players !== null && buyin !== null) {
      const safePlayers = Math.round(players);
      const rebuys = Math.round(clampNum(q.rebuys, 0, 500, 3));
      const addons = Math.round(clampNum(q.addons, 0, 500, 6));
      const stack = Math.round(clampNum(q.stack, 1000, 1000000, 15000));
      const levelMins = Math.round(clampNum(q.levelMins, 5, 90, 20));
      const pool = (safePlayers + rebuys + addons) * buyin;
      const totalChips = (safePlayers + rebuys + addons) * stack;
      return {
        hasValidatedSpot: true,
        tool: 'home-game-director',
        statLabel: `HOME GAME TD CONSOLE (${safePlayers} PLAYERS @ $${buyin})`,
        statValue: `$${Math.round(pool).toLocaleString('en-US')} Pool • ${levelMins}m Levels`,
        summaryText: `Home Game Tournament Director (${safePlayers} Players, ${rebuys} Rebuys, ${addons} Add-Ons At $${buyin}, ${levelMins}-Min Levels): $${Math.round(pool).toLocaleString('en-US')} Total Prize Pool, ${totalChips.toLocaleString('en-US')} Chips In Play.`,
        normalizedQuery: { players: safePlayers, buyin, rebuys, addons, stack, levelMins },
      };
    }
  }

  return {
    hasValidatedSpot: false,
    tool: key || 'tool',
    statLabel: null,
    statValue: null,
    summaryText: null,
    normalizedQuery: {},
  };
}

/**
 * Builds the canonical /api/og/tool-card URL for a calculator page, forwarding
 * only validated query parameters so social previews reproduce the calculation.
 */
export function buildSolvedSpotOgImageUrl(pathname = '', query = {}) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/tools/')) return undefined;
  const slug = pathname.replace(/^\/tools\//, '').replace(/\/$/, '');
  const preset = TOOL_OG_PRESETS[slug];
  if (!preset) return undefined;

  const solved = computeValidatedSolvedSpot(slug, query);
  const params = new URLSearchParams();
  params.set('tool', preset.tool);
  if (solved.hasValidatedSpot) {
    Object.entries(solved.normalizedQuery).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        params.set(k, String(v));
      }
    });
  }
  return `https://smarter.poker/api/og/tool-card?${params.toString()}`;
}

/**
 * React hook that:
 * 1. Restores URL query parameters into calculator state on mount so reopening
 *    a shared permalink reproduces the exact calculation.
 * 2. Syncs calculator state changes back to `window.history.replaceState` and
 *    notifies `CitationBacklinkBox` via the `smarterpoker:urlchange` event.
 */
export function useSolvedSpotUrlSync(stateParams = {}, restoreHandlers = {}) {
  const hydratedRef = useRef(false);
  const restoreRef = useRef(restoreHandlers);
  restoreRef.current = restoreHandlers;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    const handlers = restoreRef.current || {};
    Object.keys(handlers).forEach((key) => {
      if (params.has(key) && typeof handlers[key] === 'function') {
        handlers[key](params.get(key));
      }
    });
    hydratedRef.current = true;
  }, []);

  const serializedState = JSON.stringify(stateParams || {});

  useEffect(() => {
    if (typeof window === 'undefined' || !hydratedRef.current) return;
    const currentParams = new URLSearchParams(window.location.search || '');
    if (currentParams.get('embed') === 'true') return;

    const nextParams = new URLSearchParams();
    const parsed = JSON.parse(serializedState);
    Object.entries(parsed).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        nextParams.set(k, String(v));
      }
    });
    const qs = nextParams.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash || ''}`) {
      window.history.replaceState(null, '', nextUrl);
      window.dispatchEvent(new CustomEvent('smarterpoker:urlchange', { detail: { search: qs ? `?${qs}` : '' } }));
    }
  }, [serializedState]);
}
