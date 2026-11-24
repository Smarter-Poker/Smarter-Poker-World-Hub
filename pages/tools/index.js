/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MASTER POKER TOOLS, GTO SOLVERS & MATH CALCULATORS DIRECTORY (/tools)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Server-rendered directory hub at /tools (and raw Markdown at /tools.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const INTERACTIVE_TOOLS = [
  {
    name: 'Multiway Poker Odds & Equity Calculator',
    href: '/tools/poker-odds-calculator',
    mdHref: '/tools/poker-odds-calculator.md',
    badge: 'Equity Engine',
    summary:
      'Exact Combinatorial And Monte Carlo Hand-Vs-Hand Equity Calculator For Texas Hold\'em, PLO4, PLO5, PLO6, And Short Deck With Dead Card Removal.',
    formula: 'Equity = Winning + 0.5 * Tied Board Runouts / Total Possible Runouts',
  },
  {
    name: 'Tournament ICM & Final Table Deal Calculator',
    href: '/tools/icm-calculator',
    mdHref: '/tools/icm-calculator.md',
    badge: 'MTT ICM Solver',
    summary:
      'Malmuth-Harville Independent Chip Model Calculator Converting Tournament Chip Stacks Into Real Dollar Prize Pool Equity ($EV), Bubble Factors, And Final Table Chop Numbers.',
    formula: 'P(Player i Finishes 1st) = Chips_i / Total_Chips_In_Play',
  },
  {
    name: '13x13 GTO Preflop Range Matrix & Position Hub',
    href: '/tools/preflop-ranges',
    mdHref: '/tools/preflop-ranges.md',
    badge: '100BB 6-Max GTO',
    summary:
      'Interactive 169-Hand 13x13 GTO Preflop Charts Covering Unexploitable Raise First In (RFI), 3-Bet, And 4-Bet Frequencies Across All Six Table Positions.',
    formula: '1,326 Total Hold\'em Combos Across 169 Canonical Starting Hands',
  },
  {
    name: 'Pot Odds, Required Equity & MDF Calculator',
    href: '/tools/pot-odds-calculator',
    mdHref: '/tools/pot-odds-calculator.md',
    badge: 'Postflop Math',
    summary:
      'Instant Pot Odds Ratio, Break-Even Calling Equity Percentage, Minimum Defense Frequency (MDF), Polarized Bluff-To-Value Ratio, And Rule Of 4 And 2 Draw Outs Solver.',
    formula: 'Required Equity = Call / (Pot + Bet + Call) | MDF = Pot / (Pot + Bet)',
  },
  {
    name: 'Bankroll Management & Risk Of Ruin Calculator',
    href: '/tools/bankroll-calculator',
    mdHref: '/tools/bankroll-calculator.md',
    badge: 'Variance & RoR',
    summary:
      'Brownian Motion Risk Of Ruin (RoR) Probability Calculator Computing Exact Buy-In Requirements Based On True Winrate (BB/100) And Format Standard Deviation.',
    formula: 'Risk Of Ruin = exp(-2 * Winrate * Bankroll_BB / Variance_BB)',
  },
  {
    name: 'Short-Stack Push/Fold Nash Equilibrium Chart',
    href: '/tools/push-fold-calculator',
    mdHref: '/tools/push-fold-calculator.md',
    badge: '5BB-20BB Jam',
    summary:
      'Unexploitable Short-Stack Tournament All-In Shove And Call Ranges From 5BB To 20BB With Big Blind Antes Across Every 6-Max Seat.',
    formula: 'EV(Shove) = Fold% * Dead_Pot + Call% * (Equity * Final_Pot - Stack)',
  },
  {
    name: 'PKO & Mystery Bounty Chip Equity Calculator',
    href: '/tools/bounty-calculator',
    mdHref: '/tools/bounty-calculator.md',
    badge: 'PKO & Mystery',
    summary:
      'Converts Progressive Knockout Cash Bounties And Mystery Bounty Envelopes Into Tournament Chip Equivalents And Discounted All-In Calling Equity Thresholds.',
    formula: '1x Starting 50/50 PKO Bounty = 33.3% Of Starting Chip Stack',
  },
  {
    name: 'Live & Online Winrate (BB/100 To $/Hr) Calculator',
    href: '/tools/poker-winrate-calculator',
    mdHref: '/tools/poker-winrate-calculator.md',
    badge: 'Winrate & EV',
    summary:
      'Translates Online Big-Blinds-Per-100-Hands (BB/100) Into Live Hourly Dollar Winrates ($/Hr), Monthly Volume Projections, And 95% Confidence Intervals.',
    formula: 'Hourly Rate ($/Hr) = (BB/100 * Hands_Per_Hour / 100) * Big_Blind',
  },
  {
    name: 'Multi-Way All-In Main & Side Pot Calculator',
    href: '/tools/side-pot-calculator',
    mdHref: '/tools/side-pot-calculator.md',
    badge: 'All-In Side Pots',
    summary:
      'Slices Multi-Way All-In Confrontations For Up To 9 Players Into Exact Main Pot And Sequential Side Pots With Dead Money And Uncalled Bet Returns.',
    formula: 'Pot_k = (Level_k - Level_{k-1}) * Eligible_Players_At_Level_k',
  },
  {
    name: 'Tournament Blind Structure & Chip Distribution Generator',
    href: '/tools/blind-structure-calculator',
    mdHref: '/tools/blind-structure-calculator.md',
    badge: 'Tournament Clock',
    summary:
      'Generates Custom Home Game And Club Tournament Blind Schedules, Big Blind Ante Progressions, Color-Up Levels, And TDA Starting Chip Counts.',
    formula: 'Tournament Ends When Total Chips In Play Reach 20 To 30 Big Blinds',
  },
  {
    name: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
    href: '/tools/spr-calculator',
    mdHref: '/tools/spr-calculator.md',
    badge: 'Geometric Sizing',
    summary:
      'Calculates Effective Stack-To-Pot Ratio (SPR), Commitment Zones, And Exact 1-Street, 2-Street, And 3-Street Geometric Bet Sizing Percentages.',
    formula: 'Geometric Sizing s = 0.5 * ((1 + 2 * SPR)^(1 / Streets) - 1)',
  },
  {
    name: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    href: '/tools/plo-bet-calculator',
    mdHref: '/tools/plo-bet-calculator.md',
    badge: 'Pot-Limit & Bomb Pot',
    summary:
      'Computes Exact Pot-Limit Omaha Maximum Bet And Raise Sizes Using The Dealer 3x Plus Trail Formula And Solves Double-Board Bomb Pot Split Equity And Quartering Risk.',
    formula: 'Max Pot Bet = 3 * Last_Bet + Trail_Calls + Previous_Pot',
  },
  {
    name: 'Tournament Payout & Prize Pool Distribution Calculator',
    href: '/tools/payout-calculator',
    mdHref: '/tools/payout-calculator.md',
    badge: 'TDA Prize Pool',
    summary:
      'Generates Official TDA-Compliant Tournament Prize Pool Distributions Across Top 10%, Top 15%, Top 20%, And Winner-Take-All Payout Structures With Bubble Factor Estimates.',
    formula: 'Net Prize Pool = Entries * (Buy_In - Fee) + Rebuys * Buy_In + Added_Money',
  },
  {
    name: 'Live Cash Game Rake & Time-Charge Calculator',
    href: '/tools/rake-calculator',
    mdHref: '/tools/rake-calculator.md',
    badge: 'Rake Economics',
    summary:
      'Compares Casino Percentage Pot Drop Rake Plus Bad Beat Jackpot Drops Against Timed Seat Collection In $/Hr, Effective BB/100 Drag, And 1,000-Hour Annual Cost.',
    formula: 'Rake BB/100 = ((Pots_Won_Hr * Avg_Drop / Big_Blind) / Hands_Per_Hr) * 100',
  },
  {
    name: 'GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator',
    href: '/tools/3bet-calculator',
    mdHref: '/tools/3bet-calculator.md',
    badge: '3-Bet & 4-Bet Math',
    summary:
      'Calculates Solver-Approved In-Position And Out-Of-Position 3-Bet, Multiway Squeeze, And 4-Bet Sizing In Big Blinds With Villain Minimum Defense Frequency (MDF).',
    formula: '3-Bet Size = Open_BB * ((IP ? 3.0 : 4.0) + 1.0 * Callers)',
  },
  {
    name: 'Final Table Deal & ICM Chop Calculator',
    href: '/tools/chop-calculator',
    mdHref: '/tools/chop-calculator.md',
    badge: 'ICM Vs Chip Chop',
    summary:
      'Compares Exact Malmuth-Harville Recursive ICM Chop, Linear Chip Chop, And Hybrid Save-Amount Final Table Deal Payouts Side By Side With Shareable Scenario Permalinks.',
    formula: 'Chip Chop_i = Min_Prize + (Chips_i / Total_Chips) * Surplus_Pool',
  },
  {
    name: 'Poker Variance & Downswing Simulator',
    href: '/tools/variance-calculator',
    mdHref: '/tools/variance-calculator.md',
    badge: 'Confidence & Swings',
    summary:
      'Calculates 1-SD, 2-SD, And 3-SD Winrate Confidence Intervals, Probability Of Running Below Zero, And Expected Downswing Thresholds Across Any Hand Sample.',
    formula: 'Min Hands (95% Conf) = ((1.96 * SD_100) / Winrate_100)^2 * 100',
  },
  {
    name: 'Poker Outs & Draw Probability Calculator',
    href: '/tools/outs-calculator',
    mdHref: '/tools/outs-calculator.md',
    badge: 'Hypergeometric Outs',
    summary:
      'Computes Exact Turn, River, And Combined Flop-To-River Draw Hit Probabilities, Rule Of 4 And 2 Approximation Error, And Minimum Implied Odds Required.',
    formula: 'Flop-To-River Hit % = 1 - ((47 - Outs) / 47) * ((46 - Outs) / 46)',
  },
  {
    name: 'US Poker Tax & Form W-2G Calculator',
    href: '/tools/poker-tax-calculator',
    mdHref: '/tools/poker-tax-calculator.md',
    badge: 'IRS Form W-2G & 165d',
    summary:
      'Estimates US Federal Poker Taxes, IRS $5,000 Form W-2G Tournament Reporting Triggers, And Recreational Schedule A Vs Professional Schedule C Net Session Deductions.',
    formula: 'Deductible Losses = Min(Gross_Winning_Sessions, Gross_Losing_Sessions)',
  },
  {
    name: 'Poker Staking & Markup Split Calculator',
    href: '/tools/staking-calculator',
    mdHref: '/tools/staking-calculator.md',
    badge: 'Staking & Markup',
    summary:
      'Calculates Tournament Staking Markup, Cost Per 1% Share, Investor Breakeven ROI, And Post-Series Payout Splits With Copyable X And Discord Backing Summaries.',
    formula: 'Investor Breakeven ROI % = (Markup_Multiplier - 1.0) * 100%',
  },
  {
    name: 'Pre-Flop Isolation Raise Sizing Calculator',
    href: '/tools/iso-calculator',
    mdHref: '/tools/iso-calculator.md',
    badge: 'Limper Isolation',
    summary:
      'Computes Optimal Pre-Flop Isolation Raise Sizing Against Live And Online Limpers Based On Hero Position, Effective Stack Depth, And Resulting Flop SPR.',
    formula: 'ISO Size (BB) = Base_Open + 1.0 * Limpers + (OOP ? 1.5 : 0)',
  },
  {
    name: 'Home Game Chip Set & Setup Calculator',
    href: '/tools/home-game-kit',
    mdHref: '/tools/home-game-kit.md',
    badge: 'Chip Tube & Rules',
    summary:
      'Calculates Per-Player Starting Chip Tube Breakdowns For 300, 500, And 1,000 Piece Sets With Color-Up Schedules And Printable House Rules & Hand Rankings.',
    formula: '30 To 36 Physical Chips Per Player Across 3 To 4 Active Denominations',
  },
  {
    name: 'Poker Format Selector & Study Roadmap Quiz',
    href: '/tools/format-quiz',
    mdHref: '/tools/format-quiz.md',
    badge: 'Format Diagnostic',
    summary:
      'Interactive 5-Parameter Diagnostic Matching Your Session Schedule, Bankroll Cushion, And Variance Tolerance To Your Optimal Game Format And 7-Day Study Plan.',
    formula: '5-Axis Weighted Profile Match + Custom 7-Day Tool Curriculum',
  },
  {
    name: 'Interactive Flop Board Texture & GTO C-Bet Frequency Analyzer',
    href: '/tools/board-texture-analyzer',
    mdHref: '/tools/board-texture-analyzer.md',
    badge: 'Flop C-Bet Solver',
    summary:
      'Analyzes Any 3-Card Flop For Connectedness (0-100), Dynamic Vs Static Rating, Range And Nut Advantage, And Optimal 33% Vs 75% GTO C-Bet Frequencies.',
    formula: 'Connectedness + Range Advantage -> Check% / Small 33% Bet% / Big 75% Bet%',
  },
  {
    name: 'Tournament M-Ratio, Effective M & Q-Ratio Survival Calculator',
    href: '/tools/m-ratio-calculator',
    mdHref: '/tools/m-ratio-calculator.md',
    badge: 'Harrington M-Ratio',
    summary:
      'Calculates Cost Per Orbit, Dan Harrington M-Ratio, Short-Handed Effective M, Q-Ratio, Harrington Zone Classification, And Minutes Before Blinding Out.',
    formula: 'M = Stack / (SB + BB + Ante) | Effective M = M * (Players / 10)',
  },
  {
    name: 'Live Cash Game Session, Stop-Loss & Annual Hourly Planner',
    href: '/tools/session-planner',
    mdHref: '/tools/session-planner.md',
    badge: 'Session & Stop-Loss',
    summary:
      'Computes Gross And Net Hourly Winrates With Casino Comps Minus Tips, Monthly And Annual Net Income, A-Game Stop-Loss Limits, And 20-35 Buy-In Bankrolls.',
    formula: 'Net $/Hr = Gross_Winrate + Casino_Comps - (Session_Expenses / Hours)',
  },
  {
    name: 'Live Poker Straddle, Mississippi Button Straddle & Bomb Pot EV Calculator',
    href: '/tools/straddle-calculator',
    mdHref: '/tools/straddle-calculator.md',
    badge: 'Straddle & Bomb Pot',
    summary:
      'Calculates Straddled Effective Stack Depth, Straddler Steal Breakeven Frequency, Bomb Pot Dead Money SPR, And Double-Board Quartering & Scoop Math.',
    formula: 'Straddled BB = Stack / (2 * BB) | Bomb Pot SPR = (Stack - Ante) / Dead_Pool',
  },
  {
    name: 'Interactive Poker Hand History Formatter & Share Card Generator',
    href: '/tools/hand-converter',
    mdHref: '/tools/hand-converter.md',
    badge: 'Hand Share Card',
    summary:
      'Converts Live And Online Hands Into Suit-Symbol Reddit Markdown, Discord/X Share Cards, Deep-Link Permalinks, And ChatGPT/Claude GTO Solver Prompts.',
    formula: 'Street-By-Street Pot Progression + ♠️ ♥️ ♦️ ♣️ Markdown & Solver Prompt',
  },
  {
    name: 'Tournament Satellite Seat-Bubble & Milestone Survival Calculator',
    href: '/tools/satellite-calculator',
    mdHref: '/tools/satellite-calculator.md',
    badge: 'Satellite Bubble',
    summary:
      'Computes Target Average Seat Stack, Hero Seat Lock Percentage, Satellite Bubble Factor (1.5x-8.0x), And Required All-In Calling Equity Showing When To Fold AA/KK.',
    formula: 'Target Seat Stack = Total_Chips / Seats_Awarded | Req Eq = BF / (BF + 1)',
  },
  {
    name: 'Bad Beat Jackpot (BBJ) & High-Hand Promotion EV Calculator',
    href: '/tools/promo-ev-calculator',
    mdHref: '/tools/promo-ev-calculator.md',
    badge: 'BBJ & High-Hand EV',
    summary:
      'Calculates Qualifier Hit Odds, Per-Hand And Hourly Expected Value From Bad Beat Jackpots And High-Hand Promotions, And Breakeven Jackpot Pool Thresholds.',
    formula: 'Net Promo EV/Hand = BBJ_EV + High_Hand_EV - Personal_Promo_Drop_Cost',
  },
  {
    name: 'What Beats What? Interactive Texas Hold\'em Showdown & Kicker Resolver',
    href: '/tools/who-wins-calculator',
    mdHref: '/tools/who-wins-calculator.md',
    badge: 'Showdown Resolver',
    summary:
      'Deterministic 7-Card Showdown Evaluator Resolving Winning 5-Card Hands, Kicker Tie-Breakers, Counterfeited Two Pairs, And Split Pot Chops.',
    formula: 'Max_5_Card_Rank(2_Hole + 5_Board) Across All 21 5-Card Combinations',
  },
  {
    name: 'Mixed Game (HORSE / 8-Game / Dealer\'s Choice) Rotation Tracker & Placards',
    href: '/tools/mixed-game-placards',
    mdHref: '/tools/mixed-game-placards.md',
    badge: 'HORSE & 8-Game',
    summary:
      'Interactive Live Table Mixed Game Orbit Tracker With Fixed-Limit/Pot-Limit/No-Limit Rules, 8-Or-Better Qualifier Reminders, And Printable Table Placards.',
    formula: 'Active Variant = Floor((Hand - 1) / Hands_Per_Orbit) Mod Rotation_Length',
  },
  {
    name: 'Interactive 10-Question GTO & Live Poker IQ Diagnostic Assessment',
    href: '/tools/poker-iq-test',
    mdHref: '/tools/poker-iq-test.md',
    badge: '100-200 Poker IQ',
    summary:
      '10-Question Quantitative Assessment Across Pot Odds, RFI, ICM, PKO, Board Textures, And TDA Rules Grading Players On A 100-To-200 Poker IQ Scale.',
    formula: 'Poker IQ = 100 + 10 * Correct_Domains (100-200 Solver Master Scale)',
  },
  {
    name: 'PLO Wrap, Redraw & Nut-Out Probability Analyzer',
    href: '/tools/plo-outs-calculator',
    mdHref: '/tools/plo-outs-calculator.md',
    badge: 'PLO Wrap Solver',
    summary:
      'Analyzes 13-Out, 16-Out, 17-Out, And 20-Out Pot-Limit Omaha Straight Wraps, Double-Suited Flush Redraws, Nut Vs Dirty Outs, And Pot-Limit Max-Call Thresholds.',
    formula: '4-Card PLO Flop-To-River Hit % = 1 - ((45 - Outs) / 45) * ((44 - Outs) / 44)',
  },
  {
    name: 'Tournament Late-Registration & Re-Entry ICM EV Calculator',
    href: '/tools/late-reg-calculator',
    mdHref: '/tools/late-reg-calculator.md',
    badge: 'Late-Reg ICM Boost',
    summary:
      'Computes ICM Chip Appreciation And Free Dollar Equity Gained When Entering A Tournament At 15BB To 30BB With 40% To 60% Of The Field Already Eliminated.',
    formula: 'Late-Reg ICM Entry Value = Net_Buy_In * (Field_Remaining_Fraction)^(-0.235)',
  },
  {
    name: 'Poker Winrate Confidence-Interval & Sample Size Calculator',
    href: '/tools/winrate-confidence-calculator',
    mdHref: '/tools/winrate-confidence-calculator.md',
    badge: '70%/95%/99% CI',
    summary:
      'Computes 70%, 95%, And 99% Winrate Confidence Bounds, Normal CDF Probability Of Being A True Losing Player, And Required Sample Size In Hands Or Live Hours.',
    formula: '95% CI = Observed_WR +/- 1.96 * (Std_Dev / Sqrt(Hands / 100))',
  },
  {
    name: 'Live Poker Trip & Festival Budget Planner',
    href: '/tools/poker-trip-planner',
    mdHref: '/tools/poker-trip-planner.md',
    badge: 'Series Budget & ROI',
    summary:
      'Calculates Total Travel Overhead (Flights, Hotel, Per Diem), Effective Expense Rake % On Tournament Buy-Ins, Break-Even Gross Winnings, And Net Trip EV.',
    formula: 'Effective Expense Rake % = Total_Travel_Overhead / Total_Tournament_Action',
  },
  {
    name: 'Poker Action Clock & Home Game Shot-Clock Timer',
    href: '/tools/shot-clock',
    mdHref: '/tools/shot-clock.md',
    badge: 'WPT/Triton Shot Clock',
    summary:
      'Full-Featured 15s/20s/30s/45s Tournament Action Clock With 30s/60s Time-Bank Extension Card Inventory Across Seats 1 To 9 And Web Audio Countdown Alerts.',
    formula: 'Primary Decision Window (15s-45s) + Per-Seat Time-Bank Extension Cards',
  },
  {
    name: 'GTO Geometric Bet-Sizing & Overbet Planner (2e / 3e)',
    href: '/tools/geometric-bet-calculator',
    mdHref: '/tools/geometric-bet-calculator.md',
    badge: '2e / 3e Overbet Math',
    summary:
      'Computes Exact Constant Pot-Fraction Geometric Bet Sizes Across 2 Or 3 Streets So The Final Chip Goes All-In On The River Plus Comparison Vs 33%/75%/Jam.',
    formula: 'Geometric Pot Fraction g = (((2 * Stack + Pot) / Pot)^(1 / Streets) - 1) / 2',
  },
  {
    name: 'Live Cash Game Table-Selection & Profitability Scorecard',
    href: '/tools/table-selection-calculator',
    mdHref: '/tools/table-selection-calculator.md',
    badge: 'Table Selection Grader',
    summary:
      'Grades Any Live Cash Table From S-Tier Whale Table To F Immediate Table Change Based On VPIP>40% Players, Stack Depth, Straddles, Bomb Pots, And Rake Cap.',
    formula: 'Net BB/Hr = Gross_Table_Winrate_BB_Hr - (Hourly_Raked_Pots_Won * Rake_Cap / BB)',
  },
  {
    name: 'MTT Session Schedule & Average Buy-In (ABI) Planner',
    href: '/tools/mtt-grind-planner',
    mdHref: '/tools/mtt-grind-planner.md',
    badge: 'MTT ABI & Exposure',
    summary:
      'Calculates Single-Session Tournament Capital Exposure Including Re-Entries, Effective ABI Bankroll Ratios, Session 0-ITM Brick Probability, And Expected Session EV.',
    formula: 'Session Brick Risk (0 ITMs) = (1 - ITM_Probability)^(Tournaments_In_Session)',
  },
  {
    name: 'Embeddable Webmaster Poker Widgets',
    href: '/tools/embeds',
    mdHref: '/tools/embeds.md',
    badge: 'Free Iframes',
    summary:
      'Copy-And-Paste Responsive Iframe Embeds For Poker Blogs, Study Discords, And Card Room Websites With Zero External Script Dependencies.',
    formula: '100% Free Responsive HTML5 Iframe Widgets',
  },
];

const TOOL_CATEGORY_MAP = {
  '/tools/poker-odds-calculator': 'Equity & GTO',
  '/tools/preflop-ranges': 'Equity & GTO',
  '/tools/pot-odds-calculator': 'Equity & GTO',
  '/tools/spr-calculator': 'Equity & GTO',
  '/tools/plo-bet-calculator': 'Equity & GTO',
  '/tools/3bet-calculator': 'Equity & GTO',
  '/tools/outs-calculator': 'Equity & GTO',
  '/tools/iso-calculator': 'Equity & GTO',
  '/tools/board-texture-analyzer': 'Equity & GTO',
  '/tools/who-wins-calculator': 'Equity & GTO',
  '/tools/plo-outs-calculator': 'Equity & GTO',
  '/tools/geometric-bet-calculator': 'Equity & GTO',
  '/tools/icm-calculator': 'Tournaments & ICM',
  '/tools/push-fold-calculator': 'Tournaments & ICM',
  '/tools/bounty-calculator': 'Tournaments & ICM',
  '/tools/blind-structure-calculator': 'Tournaments & ICM',
  '/tools/payout-calculator': 'Tournaments & ICM',
  '/tools/chop-calculator': 'Tournaments & ICM',
  '/tools/variance-calculator': 'Tournaments & ICM',
  '/tools/staking-calculator': 'Tournaments & ICM',
  '/tools/m-ratio-calculator': 'Tournaments & ICM',
  '/tools/satellite-calculator': 'Tournaments & ICM',
  '/tools/late-reg-calculator': 'Tournaments & ICM',
  '/tools/mtt-grind-planner': 'Tournaments & ICM',
  '/tools/bankroll-calculator': 'Live Cash & Bankroll',
  '/tools/poker-winrate-calculator': 'Live Cash & Bankroll',
  '/tools/rake-calculator': 'Live Cash & Bankroll',
  '/tools/poker-tax-calculator': 'Live Cash & Bankroll',
  '/tools/session-planner': 'Live Cash & Bankroll',
  '/tools/straddle-calculator': 'Live Cash & Bankroll',
  '/tools/promo-ev-calculator': 'Live Cash & Bankroll',
  '/tools/winrate-confidence-calculator': 'Live Cash & Bankroll',
  '/tools/poker-trip-planner': 'Live Cash & Bankroll',
  '/tools/table-selection-calculator': 'Live Cash & Bankroll',
  '/tools/side-pot-calculator': 'Home Game & Utilities',
  '/tools/home-game-kit': 'Home Game & Utilities',
  '/tools/format-quiz': 'Home Game & Utilities',
  '/tools/hand-converter': 'Home Game & Utilities',
  '/tools/mixed-game-placards': 'Home Game & Utilities',
  '/tools/poker-iq-test': 'Home Game & Utilities',
  '/tools/shot-clock': 'Home Game & Utilities',
  '/tools/embeds': 'Home Game & Utilities',
};

const TOOL_FILTER_CATEGORIES = [
  'All 42 Tools',
  'Equity & GTO',
  'Tournaments & ICM',
  'Live Cash & Bankroll',
  'Home Game & Utilities',
];

const FEATURED_QUICK_LAUNCH = [
  { label: 'Multiway Odds Engine', href: '/tools/poker-odds-calculator', tag: 'Equity' },
  { label: '13x13 GTO Ranges', href: '/tools/preflop-ranges', tag: 'Preflop' },
  { label: 'Tournament ICM Solver', href: '/tools/icm-calculator', tag: 'ICM' },
  { label: 'Flop Board Texture Analyzer', href: '/tools/board-texture-analyzer', tag: 'Postflop' },
  { label: 'PLO Wrap & Nut-Out Analyzer', href: '/tools/plo-outs-calculator', tag: 'Omaha' },
  { label: 'GTO Geometric 2e/3e Sizing', href: '/tools/geometric-bet-calculator', tag: 'Overbets' },
  { label: 'Late-Reg ICM EV Calculator', href: '/tools/late-reg-calculator', tag: 'MTT Edge' },
  { label: 'Live Table Selection Grader', href: '/tools/table-selection-calculator', tag: 'Live Cash' },
];

const POSITIONAL_CHARTS = [
  { pos: 'UTG', slug: 'utg', rfi: '14.9%', combos: '198 Combos', floor: '55+, A3s+, K9s+, QTs+, J9s+, T9s, AJo+, KQo' },
  { pos: 'MP', slug: 'mp', rfi: '18.1%', combos: '240 Combos', floor: '44+, A2s+, K8s+, Q9s+, J9s+, T8s+, 98s, ATo+, KJo+' },
  { pos: 'HJ', slug: 'hj', rfi: '22.0%', combos: '292 Combos', floor: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, A9o+, KTo+, QJo' },
  { pos: 'CO', slug: 'co', rfi: '28.5%', combos: '378 Combos', floor: '22+, A2s+, K3s+, Q6s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, K9o+, QTo+, JTo' },
  { pos: 'BTN', slug: 'btn', rfi: '44.6%', combos: '591 Combos', floor: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 75s+, 64s+, 53s+, A2o+, K7o+, Q8o+, J8o+, T8o+' },
  { pos: 'SB', slug: 'sb', rfi: '41.9%', combos: '556 Combos', floor: '3BB Raise-Or-Fold Strategy Vs Big Blind Across 41.9% Of All Starting Hands' },
];

const TOOLS_FAQS = [
  {
    question: 'Are All Smarter.Poker Calculators And GTO Range Tools Free To Use?',
    answer:
      'Yes. Every Calculator Under /tools On Smarter.Poker Is 100% Free To Use Directly In Your Browser On Desktop And Mobile With Zero Paywalls, Zero Subscriptions, And Instant Server-Rendered Output.',
  },
  {
    question: 'Can AI Assistants Query Smarter.Poker Calculators Via Markdown Or MCP?',
    answer:
      'Yes. Append .md Or ?format=md With Query Parameters To Any Calculator URL Under /tools To Receive Pre-Computed Markdown Tables, Or Invoke The Smarter.Poker MCP Server At /api/mcp.',
  },
  {
    question: 'Which Poker Math Calculators Are Included In The Smarter.Poker Directory?',
    answer:
      'The Suite Includes All 42 Free Browser-Native Tools (41 Interactive Calculators + Embeds & Streamer Bot API): Multiway Equity, Malmuth-Harville ICM, Tournament Deal & ICM Chop Calculator, 13x13 GTO Preflop Ranges, Pot Odds & MDF, Poker Outs & Rule Of 2 And 4 Calculator, Bankroll Risk Of Ruin, Bankroll Variance & Downswing Simulator, Short-Stack Push/Fold, PKO & Mystery Bounty, Winrate Converter, Multi-Way Side Pots, Blind Structure Generator, SPR Geometric Sizing, PLO Max Bet, Tournament Payouts, Live Cash Rake, 3-Bet/4-Bet Sizing, Pre-Flop Isolation Raise Calculator, Poker Staking & Markup Calculator, US Poker Tax & IRS W-2G Calculator, Home Game Blind Timer & Chip Distribution Kit, What Poker Format Fits Your Brain Quiz, Flop Board Texture Analyzer, Tournament M-Ratio Calculator, Live Cash Session Planner, Straddle & Bomb Pot EV Calculator, Hand History Formatter, Satellite Seat-Bubble Calculator, Bad Beat Jackpot & Promo EV Calculator, What Beats What Showdown Resolver, Mixed Game Rotation Tracker & Placards, 10-Question Poker IQ Test, PLO Wrap & Nut-Out Analyzer, Tournament Late-Reg ICM EV Calculator, Winrate Confidence-Interval Calculator, Poker Trip & Series Budget Planner, WPT/Triton Poker Action Shot Clock, GTO Geometric 2e/3e Bet-Sizing Planner, Live Table-Selection Grader, And MTT Session & ABI Grind Planner.',
  },
];

const TOOLS = INTERACTIVE_TOOLS;

export default function PokerToolsDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All 42 Tools');
  const canonicalPath = '/tools';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = '42 Free Poker Calculators And Solvers';
  const pageDesc =
    'Explore All 42 Free Browser-Native Smarter.Poker Tools (41 Interactive Calculators + Embeds & Streamer Bot API) Covering Equity, GTO Ranges, ICM, PLO Wraps, Geometric Sizing, Late-Reg ICM, Winrate Confidence, Trip Budgets, Shot Clock, Table Selection, And MTT ABI Planning.';

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return INTERACTIVE_TOOLS.filter((tool) => {
      const cat = TOOL_CATEGORY_MAP[tool.href] || 'Home Game & Utilities';
      const matchesCat = activeCategory === 'All 42 Tools' || cat === activeCategory;
      const matchesQuery =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        tool.badge.toLowerCase().includes(q) ||
        tool.summary.toLowerCase().includes(q) ||
        tool.formula.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [searchQuery, activeCategory]);

  const schema = useMemo(() => {
    const baseSchema = hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Interactive Poker Tools & GTO Calculators Suite',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Math & GTO Calculator Suite',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools & Calculators', canonicalPath],
      ],
      faqs: TOOLS_FAQS,
    });

    return [
      schemas.organization,
      ...(Array.isArray(baseSchema) ? baseSchema : [baseSchema]),
      {
        '@type': 'ItemList',
        '@id': 'https://smarter.poker/tools#tool-list',
        name: 'Smarter.Poker Interactive Poker Calculators & Solvers',
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: INTERACTIVE_TOOLS.length,
        itemListElement: INTERACTIVE_TOOLS.map((tool, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: tool.name,
          url: `https://smarter.poker${tool.href}`,
        })),
      },
    ];
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/hub" style={{ color: '#38bdf8', textDecoration: 'none' }}>Hub</Link>
          {' / '}
          <span>Poker Tools &amp; Calculators</span>
        </nav>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Free Interactive Poker Calculators, GTO Solvers &amp; Tournament Math Tools
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> Smarter.Poker Provides <strong>42 Free Browser-Native Tools (41 Interactive Calculators + Embeds &amp; Streamer Bot API)</strong> Covering Exact Multiway Hand Equity, Malmuth-Harville ICM Prize Pool Valuation, Tournament Deal &amp; ICM Chop Calculator, 13x13 GTO Preflop Ranges, Pot Odds And Minimum Defense Frequency (MDF), Poker Outs &amp; Rule Of 2 And 4, Risk Of Ruin Bankroll Math, Variance &amp; Downswing Simulator, Short-Stack Push/Fold Charts, PKO Bounty Discounts, Winrate Conversion, Multi-Way Side Pots, Tournament Blind Schedules, Geometric SPR Bet Sizing, Pot-Limit Omaha Max Bets, PLO Wrap &amp; Nut-Out Analyzer, Tournament Late-Reg ICM EV Calculator, Winrate Confidence-Interval Calculator, Poker Trip &amp; Series Budget Planner, WPT/Triton Poker Action Shot Clock, GTO Geometric 2e/3e Bet-Sizing Planner, Live Table-Selection Grader, MTT Session &amp; ABI Grind Planner, And 10-Question Poker IQ Test.
        </p>

        {/* Pinned & Featured Quick-Launch Shelf */}
        <section
          aria-label="Pinned And Featured Quick-Launch Shelf"
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 12,
            padding: 18,
            marginBottom: 22,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Pinned &amp; Featured Quick-Launch Shelf
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: 10 }}>
            {FEATURED_QUICK_LAUNCH.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#070b14',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  color: '#f8fafc',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                <span>{item.label}</span>
                <span style={{ fontSize: 11, color: '#38bdf8', background: '#1e293b', padding: '2px 7px', borderRadius: 4 }}>
                  {item.tag}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Instant Search & Category Filter Bar */}
        <section
          aria-label="Instant Search And Category Filter Bar"
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 12,
            padding: 18,
            marginBottom: 28,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="tools-instant-search" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>
              Instant Filter Across All 42 Interactive Poker Calculators &amp; Solvers
            </label>
            <input
              id="tools-instant-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter By Name, Formula, ICM, PLO Wrap, Geometric 3e, Shot Clock, Late-Reg, Rake..."
              style={{
                width: '100%',
                padding: '11px 14px',
                background: '#070b14',
                border: '1px solid #38bdf8',
                borderRadius: 8,
                color: '#f8fafc',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TOOL_FILTER_CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      padding: '7px 13px',
                      borderRadius: 6,
                      border: isActive ? '1px solid #38bdf8' : '1px solid #1e293b',
                      background: isActive ? '#38bdf8' : '#070b14',
                      color: isActive ? '#070b14' : '#cbd5e1',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>
              Showing {filteredTools.length} Of {INTERACTIVE_TOOLS.length} Tools
            </span>
          </div>
        </section>

        {/* Grid Of Interactive Calculators */}
        <section style={{ marginBottom: 44 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
            Complete Suite Of 42 Interactive Poker Calculators ({filteredTools.length} Displayed)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
            {filteredTools.map((tool) => (
              <div
                key={tool.href}
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 6, background: '#1e293b', color: '#38bdf8' }}>
                      {tool.badge}
                    </span>
                    <a href={tool.mdHref} style={{ fontSize: 12, color: '#64748b', textDecoration: 'none' }}>
                      Markdown API
                    </a>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 8px 0' }}>
                    <Link href={tool.href} style={{ color: '#f8fafc', textDecoration: 'none' }}>
                      {tool.name}
                    </Link>
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: '#94a3b8', margin: '0 0 12px 0' }}>
                    {tool.summary}
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#cbd5e1', background: '#070b14', padding: '8px 10px', borderRadius: 8, border: '1px solid #1e293b', marginBottom: 12, fontFamily: 'monospace' }}>
                    {tool.formula}
                  </div>
                  <Link
                    href={tool.href}
                    style={{
                      display: 'inline-block',
                      padding: '8px 14px',
                      background: '#0284c7',
                      color: '#ffffff',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Launch Calculator
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Positional 100BB 6-Max GTO Preflop Charts Table */}
        <section style={{ marginBottom: 44 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            100BB 6-Max Positional GTO Preflop Range Charts
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Solver-Approved 100BB 6-Max Raise First In (RFI) Frequencies And Combos By Table Position
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Seat Position</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>RFI Frequency</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Combo Count</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Representative Opening Range Floor</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Interactive Chart</th>
                </tr>
              </thead>
              <tbody>
                {POSITIONAL_CHARTS.map((row) => (
                  <tr key={row.slug} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.pos}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.rfi}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.combos}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.floor}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/tools/preflop-ranges/${row.slug}`} style={{ color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}>
                        Open {row.pos} 13x13 Chart
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation To Knowledge Hubs */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Explore Connected Smarter.Poker Strategy &amp; Data Hubs
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/learn/hands" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              169 Starting Hand Encyclopedia
            </Link>
            <Link href="/learn/matchups" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              25 All-In Hand Matchups
            </Link>
            <Link href="/learn/poker-hand-rankings" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Hand Rankings Cheat Sheet
            </Link>
            <Link href="/rules" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              30 Official TDA &amp; Cash Rules
            </Link>
            <Link href="/games" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              15 Poker Variants &amp; Mixed Games
            </Link>
            <Link href="/poker-rooms/guides" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              12 US Regional Poker Market Guides
            </Link>
            <Link href="/poker-rooms/first-time-guide" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              First-Time Live Poker Room Guide
            </Link>
            <Link href="/poker-series/guides" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              10 Major Poker Series Survival Guides
            </Link>
            <Link href="/learn" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              GTO Strategy Academy
            </Link>
            <Link href="/research" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Empirical Poker Research Hub
            </Link>
            <Link href="/glossary" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Glossary
            </Link>
            <Link href="/compare" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              30 Platform Comparisons
            </Link>
            <Link href="/hub/video-library" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Video Library
            </Link>
          </div>
        </section>

        <FaqSection faqs={TOOLS_FAQS} />

        <CitationBacklinkBox
          title="Smarter.Poker Interactive Poker Tools & GTO Calculators Suite"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="GTO Math & Solvers"
          badgeValue="42 Free Poker Calculators"
          summary="Complete Directory Of 42 Free Browser-Native Poker Calculators, GTO Preflop Range Matrices, And Tournament Director Utilities."
          slug="poker-tools-suite"
        />

        <AiPromptLauncher
          title="Smarter.Poker Interactive Poker Tools & Calculators Suite"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderToolsDirectoryMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderToolsDirectoryMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}
