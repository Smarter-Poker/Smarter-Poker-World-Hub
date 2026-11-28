/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  UNIVERSAL POKER SEARCH & COMMAND DIRECTORY (/search)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Real-time search engine across Smarter.Poker's entire structured corpus:
 * 52 Interactive Calculators, 25 Hand Matchups, 30 Official Rules, 15 Game
 * Variants, 12 Regional Markets, 10 Major Series Guides, 15 Research Reports,
 * plus Top Starting Hands and Product/Venue Comparisons.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../src/components/seo/SEOHead';
import UniversalHeader from '../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../src/components/seo/AiPromptLauncher';
import SmarterAccountUnlockGate from '../src/components/seo/SmarterAccountUnlockGate';
import { HAND_MATCHUPS, matchupPath } from '../src/content/learn/matchups';
import { POKER_RULES, rulePath } from '../src/content/rules/rules';
import { POKER_VARIANTS, gameVariantPath } from '../src/content/games/variants';
import { POKER_MARKET_GUIDES, marketGuidePath } from '../src/content/guides/markets';
import { SERIES_GUIDES, seriesGuidePath } from '../src/content/guides/seriesGuides';
import { RESEARCH_REPORTS, researchPath } from '../src/content/research/reports';
import { STARTING_HANDS, handPath } from '../src/content/learn/hands';
import { COMPARE_PAGES, comparePath } from '../src/content/compare/pages';
import { LESSONS } from '../src/content/learn/lessons';
import { GLOSSARY_TERMS } from '../src/content/glossary/terms';
import { POKER_POSITIONS, positionPath } from '../src/content/learn/positions';
import { POKER_STAKES, stakePath } from '../src/content/learn/stakes';
import { FAMOUS_HANDS, famousHandPath } from '../src/content/learn/famousHands';
import { POKER_ROADMAPS, roadmapPath } from '../src/content/learn/roadmaps';
import { US_POKER_STATES, stateGuidePath } from '../src/content/guides/states';
import { PLAYER_ARCHETYPES, playerTypePath } from '../src/content/learn/playerTypes';
import { BOARD_TEXTURES, boardTexturePath } from '../src/content/learn/boardTextures';
import { INTERNATIONAL_POKER_GUIDES, internationalGuidePath } from '../src/content/guides/internationalMarkets';
import { VENUE_COUNT_LABEL } from '../src/lib/venueCount.mjs';

export const POKER_GAMES = POKER_VARIANTS;
export const POKER_MARKETS = POKER_MARKET_GUIDES;

const CALCULATOR_ITEMS = [
  {
    title: 'Multiway Poker Odds & Equity Calculator',
    href: '/tools/poker-odds-calculator',
    badge: 'Equity Engine',
    summary: 'Exact Combinatorial And Monte Carlo Hand-Vs-Hand Equity Calculator For Hold\'em, PLO4/5/6, And Short Deck.',
  },
  {
    title: 'Tournament ICM & Final Table Deal Calculator',
    href: '/tools/icm-calculator',
    badge: 'MTT ICM Solver',
    summary: 'Malmuth-Harville Independent Chip Model Calculator Converting Chip Stacks Into Real Dollar Prize Equity ($EV).',
  },
  {
    title: '13x13 GTO Preflop Range Matrix & Position Hub',
    href: '/tools/preflop-ranges',
    badge: '100BB 6-Max GTO',
    summary: 'Interactive 169-Hand 13x13 GTO Preflop Charts Covering Raise First In (RFI), 3-Bet, And 4-Bet Frequencies.',
  },
  {
    title: 'Pot Odds, Required Equity & MDF Calculator',
    href: '/tools/pot-odds-calculator',
    badge: 'Postflop Math',
    summary: 'Instant Pot Odds Ratio, Break-Even Calling Equity Percentage, And Minimum Defense Frequency (MDF) Solver.',
  },
  {
    title: 'Bankroll Management & Risk Of Ruin Calculator',
    href: '/tools/bankroll-calculator',
    badge: 'Variance & RoR',
    summary: 'Risk Of Ruin Probability Calculator Computing Buy-In Requirements Based On Winrate And Standard Deviation.',
  },
  {
    title: 'Short-Stack Push/Fold Nash Equilibrium Chart',
    href: '/tools/push-fold-calculator',
    badge: '5BB-20BB Jam',
    summary: 'Unexploitable Short-Stack Tournament All-In Shove And Call Ranges From 5BB To 20BB With Big Blind Antes.',
  },
  {
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    href: '/tools/bounty-calculator',
    badge: 'PKO & Mystery',
    summary: 'Converts Progressive Knockout Cash Bounties And Mystery Envelopes Into Tournament Chip Equivalents.',
  },
  {
    title: 'Live & Online Winrate (BB/100 To $/Hr) Calculator',
    href: '/tools/poker-winrate-calculator',
    badge: 'Winrate & EV',
    summary: 'Translates Big-Blinds-Per-100-Hands (BB/100) Into Live Hourly Dollar Winrates And Confidence Intervals.',
  },
  {
    title: 'Multi-Way All-In Main & Side Pot Calculator',
    href: '/tools/side-pot-calculator',
    badge: 'All-In Side Pots',
    summary: 'Slices Multi-Way All-In Confrontations For Up To 9 Players Into Exact Main Pot And Sequential Side Pots.',
  },
  {
    title: 'Tournament Blind Structure & Clock Generator',
    href: '/tools/blind-structure-calculator',
    badge: 'Tournament Clock',
    summary: 'Generates Home Game And Club Tournament Blind Schedules, Big Blind Antes, And Color-Up Levels.',
  },
  {
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Sizing Calculator',
    href: '/tools/spr-calculator',
    badge: 'Geometric Sizing',
    summary: 'Calculates Effective Stack-To-Pot Ratio (SPR), Commitment Zones, And 1/2/3-Street Geometric Bet Sizes.',
  },
  {
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    href: '/tools/plo-bet-calculator',
    badge: 'Pot-Limit & Bomb Pot',
    summary: 'Computes Exact Pot-Limit Maximum Raises Using The 3x Plus Trail Formula And Double-Board Bomb Pot Splits.',
  },
  {
    title: 'Tournament Payout & Prize Pool Distribution Calculator',
    href: '/tools/payout-calculator',
    badge: 'TDA Prize Pool',
    summary: 'Generates TDA-Compliant Tournament Prize Pool Distributions Across Top 10%, Top 15%, And Top 20% Structures.',
  },
  {
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    href: '/tools/rake-calculator',
    badge: 'Rake Economics',
    summary: 'Compares Casino Percentage Pot Drop Rake Plus Jackpot Drops Against Timed Seat Collection In BB/100.',
  },
  {
    title: 'GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator',
    href: '/tools/3bet-calculator',
    badge: '3-Bet & 4-Bet Math',
    summary: 'Calculates Solver-Approved In-Position And Out-Of-Position 3-Bet, Multiway Squeeze, And 4-Bet Sizing.',
  },
  {
    title: 'Final Table ICM Vs Chip-Chop Deal Settlement Calculator',
    href: '/tools/chop-calculator',
    badge: 'ICM Vs Chip Chop',
    summary: 'Side-By-Side Tournament Deal Settlement Comparing ICM, Chip Chop, And Save-Some For Play.',
  },
  {
    title: 'Multi-Table Tournament (MTT) Variance & ROI Simulator',
    href: '/tools/variance-calculator',
    badge: 'Downswing Sim',
    summary: 'Models Tournament Downswings, Confidence Intervals, And Bankroll Swings Across 1,000+ MTT Samples.',
  },
  {
    title: 'Outs, Rule Of 4 And 2 & Draw Odds Calculator',
    href: '/tools/outs-calculator',
    badge: 'Draw Math',
    summary: 'Calculates Turn, River, And Combined Flop-To-River Hit Probabilities For Any Number Of Clean Outs.',
  },
  {
    title: 'US Poker Tax, W-2G Withholding & OBBBA 90% Loss Cap Calculator',
    href: '/tools/poker-tax-calculator',
    badge: '2026 IRS Tax Math',
    summary: 'Calculates Federal W-2G Thresholds, 2026 90% Gambling Loss Deduction Cap, And Phantom Tax Exposure.',
  },
  {
    title: 'Tournament Staking, Markup & Swap Settlement Calculator',
    href: '/tools/staking-calculator',
    badge: 'Backing & Swaps',
    summary: 'Calculates Fair Markup Pricing, Investor Share Payouts, Piece Swaps, And Tax Withholding Splits.',
  },
  {
    title: 'Preflop Isolation Raise (Iso-Raise) Sizing Calculator',
    href: '/tools/iso-calculator',
    badge: 'Limper Punish Math',
    summary: 'Calculates Optimal In-Position And Out-Of-Position Isolation Raise Sizing Over Multiple Live Limpers.',
  },
  {
    title: 'Home Game Chip Set Breakdown & Starting Stack Planner',
    href: '/tools/home-game-kit',
    badge: 'Chip Set Planner',
    summary: 'Builds Optimal Per-Player Chip Counts From Your Physical 300, 500, Or 1,000-Piece Poker Chip Set.',
  },
  {
    title: 'Interactive Poker Format & Game Selector Quiz',
    href: '/tools/format-quiz',
    badge: 'Format Matcher',
    summary: 'Matches Your Bankroll, Risk Tolerance, And Schedule To Cash Games, MTTs, PLO, Or Spin-And-Gos.',
  },
  {
    title: 'Embeddable Webmaster Poker Widgets & Streamer Bot Suite',
    href: '/tools/embeds',
    badge: 'Free HTML5 Iframes',
    summary: 'Copy-And-Paste Responsive Calculator Iframe Embeds And 44 Nightbot/StreamElements/Discord Commands.',
  },
  {
    title: 'Interactive Flop Board Texture & GTO C-Bet Frequency Analyzer',
    href: '/tools/board-texture-analyzer',
    badge: 'Flop C-Bet Solver',
    summary: 'Analyzes Any 3-Card Flop For Suit Texture, Pairing, Connectedness, Range Advantage, And Optimal GTO C-Bet Sizing.',
  },
  {
    title: 'Tournament M-Ratio, Effective M & Q-Ratio Survival Calculator',
    href: '/tools/m-ratio-calculator',
    badge: 'Harrington M-Zones',
    summary: 'Computes Dan Harrington M-Ratio, Short-Handed Effective M, Q-Ratio, And Orbit Survival Time Across All Five Zones.',
  },
  {
    title: 'Live Cash Game Session, Stop-Loss & Annual Hourly Planner',
    href: '/tools/session-planner',
    badge: 'Cash Grind Planner',
    summary: 'Calculates Net Hourly Winrate With Casino Comps And Expenses, Annual Income Projections, And A-Game Stop-Loss Limits.',
  },
  {
    title: 'Live Poker Straddle, Mississippi Straddle & Bomb Pot EV Calculator',
    href: '/tools/straddle-calculator',
    badge: 'Straddle & Bomb Pot',
    summary: 'Calculates Effective Stack Compression, Required Steal Equity, And Single/Double-Board Bomb Pot Commitment Thresholds.',
  },
  {
    title: 'Interactive Poker Hand History Formatter & Share Card Generator',
    href: '/tools/hand-converter',
    badge: 'Reddit & Discord Formatter',
    summary: 'Formats Raw Poker Hands Into Suit-Symbol Reddit Markdown, Discord Share Cards, And AI Solver Review Prompts.',
  },
  {
    title: 'Tournament Satellite Seat-Bubble & Milestone Survival Calculator',
    href: '/tools/satellite-calculator',
    badge: 'Satellite Bubble Math',
    summary: 'Calculates Target Seat Stacks, Seat-Lock Probability, Satellite Bubble Factors, And Fold-Even-Aces Thresholds.',
  },
  {
    title: 'Bad Beat Jackpot (BBJ) & High-Hand Promotion EV Calculator',
    href: '/tools/promo-ev-calculator',
    badge: 'BBJ & High-Hand EV',
    summary: 'Calculates Exact Qualifier Hit Probabilities, Player/Table/Room Share $EV, And Breakeven Jackpot Pool Thresholds.',
  },
  {
    title: 'What Beats What? Interactive Texas Hold\'em Showdown & Kicker Resolver',
    href: '/tools/who-wins-calculator',
    badge: 'Showdown Judge',
    summary: 'Deterministic 7-Card Evaluator Resolving Winning 5-Card Hands, Kicker Tie-Breakers, Counterfeited Two Pairs, And Split Pots.',
  },
  {
    title: 'Mixed Game (HORSE / 8-Game / Dealer\'s Choice) Rotation Tracker & Placards',
    href: '/tools/mixed-game-placards',
    badge: 'Mixed Game Tracker',
    summary: 'Interactive Orbit Game Rotation Tracker And Printable Table Placards For HORSE, 8-Game, And Dealer\'s Choice.',
  },
  {
    title: 'Interactive 10-Question GTO & Live Poker IQ Diagnostic Assessment',
    href: '/tools/poker-iq-test',
    badge: '100-200 IQ Test',
    summary: 'Ten-Question Quantitative Poker Assessment Grading Pot Odds, MDF, ICM, Bounties, Board Textures, And TDA Floor Rules.',
  },
  {
    title: 'PLO Wrap, Redraw & Nut-Out Probability Analyzer',
    href: '/tools/plo-outs-calculator',
    badge: 'PLO Wrap Solver',
    summary: 'Calculates Turn, River, And Combined Flop-To-River Equity For 13/16/17/20-Out PLO Straight Wraps And Nut Flush Redraws.',
  },
  {
    title: 'Tournament Late-Registration & Re-Entry ICM EV Calculator',
    href: '/tools/late-reg-calculator',
    badge: 'Late-Reg ICM Boost',
    summary: 'Computes ICM Chip Appreciation And Free Dollar Equity Gained When Late-Registering At 15BB To 30BB.',
  },
  {
    title: 'Poker Winrate Confidence-Interval & Sample Size Calculator',
    href: '/tools/winrate-confidence-calculator',
    badge: '70%/95%/99% CI',
    summary: 'Calculates 70%, 95%, And 99% Winrate Confidence Bounds, True Losing Probability, And Sample Size Requirements.',
  },
  {
    title: 'Live Poker Trip & Festival Budget Planner',
    href: '/tools/poker-trip-planner',
    badge: 'Series Budget & ROI',
    summary: 'Computes Total Travel Overhead, Effective Expense Rake % On Buy-Ins, Break-Even Gross Winnings, And Net Trip EV.',
  },
  {
    title: 'Poker Action Clock & Home Game Shot-Clock Timer',
    href: '/tools/shot-clock',
    badge: 'WPT/Triton Shot Clock',
    summary: 'Interactive 15s-45s Tournament Action Clock With 30s/60s Time-Bank Extension Cards Across All 9 Seats.',
  },
  {
    title: 'GTO Geometric Bet-Sizing & Overbet Planner (2e / 3e)',
    href: '/tools/geometric-bet-calculator',
    badge: '2e / 3e Overbet Math',
    summary: 'Calculates Constant Pot-Fraction Geometric Bet Sizes Across 2 Or 3 Streets To Put The Final Chip All-In On The River.',
  },
  {
    title: 'Live Cash Game Table-Selection & Profitability Scorecard',
    href: '/tools/table-selection-calculator',
    badge: 'Table Selection Grader',
    summary: 'Grades Live Cash Game Tables From S-Tier Whale Table To F Immediate Table Change Based On Rec Density And Rake Drag.',
  },
  {
    title: 'MTT Session Schedule & Average Buy-In (ABI) Planner',
    href: '/tools/mtt-grind-planner',
    badge: 'MTT ABI & Exposure',
    summary: 'Calculates Single-Session Tournament Capital Exposure, Effective ABI Ratios, And Session 0-ITM Brick Probability.',
  },
  {
    title: '3-Way & 4-Way Multiway All-In Main & Side-Pot EV Calculator',
    href: '/tools/multiway-all-in-calculator',
    badge: '3-Way/4-Way All-In EV',
    summary: 'Computes Exact Main-Pot And Sequential Side-Pot Expected Value, Dead-Money Allocation, And Multiway Calling Equity Thresholds.',
  },
  {
    title: 'Live Mystery Bounty Pool Tracker & Envelope EV Calculator',
    href: '/tools/mystery-bounty-tracker',
    badge: 'Live Envelope Tracker',
    summary: 'Tracks Remaining Unopened Mystery Bounty Envelopes In Real Time To Compute Average Knockout EV, Chip Equivalence, And Top-Chest Odds.',
  },
  {
    title: 'Tournament ICM Bubble Factor & Risk Premium Matrix Calculator',
    href: '/tools/bubble-factor-calculator',
    badge: 'Pairwise ICM Matrix',
    summary: 'Computes Pairwise Malmuth-Harville ICM Bubble Factors, Risk Premium Percentages, And Final Table All-In Calling Equity Thresholds.',
  },
  {
    title: 'River Bluff-Catching, Minimum Defense Frequency & Blocker EV Calculator',
    href: '/tools/bluff-catching-calculator',
    badge: 'River Blocker & MDF',
    summary: 'Evaluates River Bluff-Catching Expected Value Using Pot-Odds Alpha, Defender MDF, And Card-Removal Blocker Ratios.',
  },
  {
    title: 'Multi-Street Flop-Turn-River Barrel & Cumulative Fold Equity Calculator',
    href: '/tools/multi-street-ev-calculator',
    badge: '3-Street Barrel EV',
    summary: 'Models Street-By-Street Pot Growth, Remaining SPR Compression, And Cumulative Triple-Barrel Bluff Breakeven Thresholds.',
  },
  {
    title: 'Heads-Up (HU) & 3-Max Short-Stack Nash Push/Fold/Limp Equilibrium Solver',
    href: '/tools/heads-up-push-fold-calculator',
    badge: '1BB-25BB HU Nash',
    summary: 'Unexploitable 1BB-To-25BB Heads-Up And 3-Max Small Blind Push/Limp And Big Blind Call Nash Equilibrium Charts.',
  },
  {
    title: 'Blind-Vs-Blind (SB Vs BB) GTO Range & Limp-Raise Matrix Calculator',
    href: '/tools/blind-vs-blind-calculator',
    badge: 'SB Vs BB Equilibrium',
    summary: 'Solves Small Blind Versus Big Blind Limp, Open-Raise, Iso-Raise, And Limp-3-Bet Frequencies From 20BB To 100BB.',
  },
  {
    title: 'Bankroll Shot-Taking, Stake Move-Up & Stop-Loss Ladder Calculator',
    href: '/tools/shot-taking-calculator',
    badge: '2-Tier Move-Up Plan',
    summary: 'Builds A Disciplined Two-Tier Bankroll Move-Up Plan With Exact Shot Buy-In Budgets, Hard Drop-Down Floors, And Combined RoR.',
  },
  {
    title: 'Pre-Session Mental Game Warm-Up & Post-Session Cooldown Builder',
    href: '/tools/warmup-cooldown-routine',
    badge: 'A-Game Readiness',
    summary: 'Three-Minute Pre-Session A-Game Readiness Diagnostic, Hard Stop-Loss Contract, And Post-Session Decision Grading Journal.',
  },
  {
    title: 'Home Game Host Director: Live Waitlist, Random Seat Draw & Payout Ledger',
    href: '/tools/home-game-director',
    badge: 'Host Console & Ledger',
    summary: 'Browser-Native Home Poker Table Seat Randomizer, Buy-In And Rebuy Audit Ledger, And Minimum-Transfer Net Settlement Solver.',
  },
];

const AUTHORITY_HUB_ITEMS = [
  {
    category: 'Hand Matchups',
    title: 'Poker Hand Vs Hand Matchup Odds Directory (25 Matchups)',
    href: '/learn/matchups',
    badge: 'Matchup Index',
    summary: 'Interactive Preflop Equity Directory Covering 25 Canonical Hold\'em All-In Confrontations And Flop Shifts.',
  },
  {
    category: 'Major Series Guides',
    title: 'Major Live Poker Tournament Series Guides (WSOP, WPT, Wynn)',
    href: '/poker-series/guides',
    badge: '10 Series Guides',
    summary: 'Complete Player Logistics, Rake Comparison, And Registration Timing For 10 Premier North American Series.',
  },
  {
    category: 'Regional Poker Markets',
    title: 'First-Time Live Casino Poker Room Etiquette & Survival Guide',
    href: '/poker-rooms/first-time-guide',
    badge: 'Live Etiquette',
    summary: 'Step-By-Step Check-In, Chip Buying, One-Chip Call Rule, And Tipping Etiquette For First-Time Live Players.',
  },
  {
    category: 'Research Studies',
    title: 'Official Smarter.Poker Press Kit, DOIs & Media Fast Facts',
    href: '/press',
    badge: 'Media & DOIs',
    summary: 'Quotable 2026 Industry Benchmarks, 6 Zenodo DOIs, Software Heritage SWHIDs, And Brand Boilerplates.',
  },
  {
    category: 'Table Positions',
    title: '9-Seat Poker Position Strategy Encyclopedia (UTG To Button & Blinds)',
    href: '/learn/positions',
    badge: '9 Table Positions',
    summary: 'Seat-By-Seat GTO Raise First In (RFI), 3-Bet, Cold-Call, And Expected BB/100 Winrates Across All Nine Table Positions.',
  },
  {
    category: 'Stake Guides',
    title: 'Poker Stake Level & Move-Up Readiness Authority Hub',
    href: '/learn/stakes',
    badge: '7 Stake Tiers',
    summary: 'Bankroll Thresholds, Population Tendencies, And Shot-Taking Checklists From $1/$2 Live Cash To $5/$10 And Circuit MTTs.',
  },
  {
    category: 'Famous Hands',
    title: 'Famous Historic Poker Hands & GTO Solver Breakdown Archive',
    href: '/learn/famous-hands',
    badge: '12 Iconic Hands',
    summary: 'Twelve Historic Championship And High-Stakes Broadcast Hands Analyzed Street By Street Through A Modern GTO Solver Lens.',
  },
  {
    category: 'Player Roadmaps',
    title: '90-Day Poker Player Progression & Study Roadmaps',
    href: '/learn/roadmaps',
    badge: '5 Career Tracks',
    summary: 'Step-By-Step 90-Day Study Curriculums For Live Cash Beginners, $2/$5 Pros, Circuit MTT Grinders, PLO Players, And Hosts.',
  },
  {
    category: 'US State Guides',
    title: 'US State-By-State Poker Legality, Tax Withholding & Room Directory',
    href: '/poker-rooms/states',
    badge: '51 States & DC',
    summary: 'State-By-State Legal Status, Minimum Age, W-2G State Tax Withholding Rates, And Rake Models Across All 50 US States And DC.',
  },
  {
    category: 'GTO Lessons',
    title: 'Complete Poker Math Formulas, Equations & Solver Proofs Hub',
    href: '/learn/poker-math',
    badge: '12 Core Equations',
    summary: 'Master Reference For Pot Odds, EV, MDF, Alpha, Geometric Bet Sizing, SPR, ICM, Risk Of Ruin, And Hypergeometric Draws.',
  },
  {
    category: 'GTO Lessons',
    title: 'Printable One-Page Poker Cheat Sheets & Reference Cards Hub',
    href: '/learn/cheat-sheets',
    badge: 'Print-Ready Cards',
    summary: 'Print-Optimized Reference Cards For Hand Rankings, Rule Of 4 And 2, 6-Max RFI Ranges, 10BB Push/Fold, And Chip Counts.',
  },
  {
    category: 'GTO Lessons',
    title: 'Online Vs. Live Poker Strategy Transition Authority Guide',
    href: '/learn/online-vs-live-poker',
    badge: 'Online To Live',
    summary: 'Side-By-Side Adjustments For Open-Raise Sizing, Hands Per Hour, Multiway Pots, Rake Caps, And Physical Live Dynamics.',
  },
  {
    category: 'GTO Lessons',
    title: 'Live Poker Tells, Betting Timing & Anti-Angle-Shooting Encyclopedia',
    href: '/learn/live-poker-tells',
    badge: 'Physical Tells & Defense',
    summary: 'Behavioral Tells, Action-Timing Clues, Chip-Handling Mechanics, And Official TDA Protection Against Live Angle Shots.',
  },
  {
    category: 'Regional Poker Markets',
    title: 'Live Casino Poker Comps, Rewards Cards & Dealer Tipping Guide',
    href: '/poker-rooms/comps-and-tipping-guide',
    badge: 'Comps & Toke Math',
    summary: 'Hourly Comp Earning Rates ($1-$3/Hr), Tier Multipliers, Dealer Tipping Standards, And Monthly Comp Offset Calculator.',
  },
  {
    category: 'Player Archetypes',
    title: 'Poker Player Types & Exploitative Counter-Strategy Encyclopedia',
    href: '/learn/player-types',
    badge: '8 Player Archetypes',
    summary: 'HUD Stat Profiles (VPIP/PFR/3-Bet) And Exploitative Adjustments Against TAG, LAG, Nit, Calling Station, And Maniac Seats.',
  },
  {
    category: 'Board Textures',
    title: 'Flop Board Texture & GTO C-Bet Strategy Authority Encyclopedia',
    href: '/learn/board-textures',
    badge: '12 Flop Archetypes',
    summary: 'Range Advantage, Nut Advantage, And Optimal 33% Vs 75% C-Bet Frequencies Across Canonical Flop Board Textures.',
  },
  {
    category: 'GTO Lessons',
    title: 'Poker Mental Game, Tilt Control & A-Game Performance Authority Hub',
    href: '/learn/mental-game',
    badge: 'Tilt & Performance',
    summary: 'Diagnostic Triggers And Counter-Protocols For Injustice Tilt, Revenge Tilt, Downswing Despair, And Stop-Loss Discipline.',
  },
  {
    category: 'GTO Lessons',
    title: 'Poker As A Business: Professional Bankroll, Taxes, Staking & LLC Guide',
    href: '/learn/poker-as-a-business',
    badge: 'Pro Operations',
    summary: 'Complete Operations Manual For Professional Poker Players Covering Schedule C Filing, Staking Contracts, And Bankroll Reserves.',
  },
  {
    category: 'International Poker Guides',
    title: 'International Live Poker Destinations & Global Casino Authority Guide',
    href: '/poker-rooms/international',
    badge: '10 Global Poker Hubs',
    summary: 'International Rake Structures, Currency Rules, And Tax Treaties Across London, Rozvadov, Barcelona, Monte Carlo, And Manila.',
  },
  {
    category: 'GTO Lessons',
    title: 'Poker Math Formulas Encyclopedia: 15 Core Equations, LaTeX & Worked Examples',
    href: '/learn/formulas',
    badge: '15 Algebraic Proofs',
    summary: 'Complete Algebraic Derivations, LaTeX Equations, And Worked Table Examples For Pot Odds, MDF, ICM, Bubble Factor, SPR, And RoR.',
  },
  {
    category: 'GTO Lessons',
    title: '8 Multi-Table Tournament (MTT) Stages Strategy Playbook',
    href: '/learn/tournament-stages',
    badge: '8 MTT Phases',
    summary: 'Chronological MTT Playbook Covering Early Deepstack Levels, Antes, Late-Reg Close, Money Bubble, ITM, Final Table ICM, And Heads-Up.',
  },
  {
    category: 'GTO Lessons',
    title: '12 Common Poker Leaks, BB/100 Winrate Cost & GTO Solver Cure Directory',
    href: '/learn/leaks',
    badge: '12 Leak Diagnostics',
    summary: 'Diagnostic Database Of The 12 Most Expensive Preflop, Postflop, And ICM Leaks With HUD Thresholds And Solver Remediation Drills.',
  },
  {
    category: 'GTO Lessons',
    title: '15 Poker HUD Statistics Encyclopedia: Formulas, GTO Targets & Exploits',
    href: '/learn/hud-stats',
    badge: '15 HUD Metrics',
    summary: 'Quantitative Reference For 15 Essential HUD Statistics (VPIP, PFR, 3-Bet, C-Bet, WTSD, W$SD, WWSF, AF) With 6-Max/9-Max GTO Targets.',
  },
  {
    category: 'GTO Lessons',
    title: '15 Common Poker Myths Debunked By GTO Solvers & Combinatorics',
    href: '/learn/poker-myths-debunked',
    badge: '15 Solver Fact-Checks',
    summary: 'Fact-Checked Debunking Of 15 Widespread Table Folklore Claims Using CFR Solver Equilibriums And 52-Card Combinatorics.',
  },
  {
    category: 'GTO Lessons',
    title: 'Cross-Format Poker Strategy Migration Matrix (6 Transition Blueprints)',
    href: '/learn/format-migration-guide',
    badge: '6 Format Blueprints',
    summary: 'Six Mathematical Transition Blueprints For Players Switching Between Live Cash, Online 6-Max, MTT Tournaments, And PLO.',
  },
  {
    category: 'Research Studies',
    title: 'Smarter.Poker Quantitative Research Faculty & Editorial Verification Team',
    href: '/authors',
    badge: '4 Research Desks',
    summary: 'Profiles And Audit Credentials For Smarter.Poker Quantitative Solver, Cardroom Operations, Tournament ICM, And PLO Research Desks.',
  },
  {
    category: 'Comparisons',
    title: 'Interactive Poker Software, Solver, Bankroll & Cardroom Decision Matrix',
    href: '/compare/decision-matrix',
    badge: '20-Scenario Matrix',
    summary: 'Twenty-Scenario Quantitative Recommendation Matrix Comparing GTO Solvers, Calculators, Venue Directories, And Private Club Platforms.',
  },
  {
    category: 'Regional Poker Markets',
    title: '10 Major Airport, Interstate & Cross-Border Live Poker Travel Corridors',
    href: '/poker-rooms/corridors',
    badge: '10 Travel Corridors',
    summary: 'Geographic Routing Directory Connecting Major Non-Casino Metros And Airports To Their Closest Legal Live Poker Rooms.',
  },
  {
    category: 'Regional Poker Markets',
    title: 'Best Live Poker Rooms By Game Variant (PLO, Big O, Mixed, Stud & High-Stakes)',
    href: '/poker-rooms/by-game',
    badge: '6 Variant Directories',
    summary: `Curated Directory Grouping ${VENUE_COUNT_LABEL} North American Poker Rooms By PLO, Big O, Mixed Games, 7-Card Stud, High-Stakes NLH, And Daily MTTs.`,
  },
  {
    category: 'Regional Poker Markets',
    title: 'Live Poker Room Security, Floor Dispute Escalation & Angle-Shot Protection Guide',
    href: '/poker-rooms/security-and-disputes-guide',
    badge: 'Security & Disputes',
    summary: 'Official TDA And RROP Protocols For Floor Disputes, Surveillance Reviews, Cage Safety, And Defending Against 8 Common Angle Shots.',
  },
  {
    category: 'Regional Poker Markets',
    title: '12-Month Live Poker Series, Circuit & Festival Seasonal Planning Calendar',
    href: '/poker-rooms/seasonal-calendar',
    badge: '12-Month Circuit',
    summary: 'Month-By-Month Global Live Poker Circuit Planner Mapping Peak Tournament Festivals And Cash Game Liquidity From January To December.',
  },
  {
    category: 'Research Studies',
    title: '2026 Annual State Of Live & Online Poker Industry Whitepaper',
    href: '/research/annual-state-of-poker-2026',
    badge: '2026 Flagship Whitepaper',
    summary: `Flagship 2026 Quantitative Industry Report Synthesizing ${VENUE_COUNT_LABEL} Venues, 4,500+ Weekly Tournaments, And 10M+ Simulated GTO Hands.`,
  },
  {
    category: 'Research Studies',
    title: '2026 Master Quantitative Poker Benchmark Tables (Rake, Variance, ICM & GTO)',
    href: '/research/benchmarks',
    badge: '6 Master Tables',
    summary: 'Single-Page Master Reference Consolidating All First-Party Smarter.Poker Rake, Winrate, Standard Deviation, ICM, And HUD Benchmark Tables.',
  },
  {
    category: 'Research Studies',
    title: 'Smarter.Poker Canonical Fact Ledger, Entity Provenance & AI Verification Hub',
    href: '/facts',
    badge: 'Entity Fact Ledger',
    summary: 'Authoritative Fact Sheet And Machine-Verifiable Provenance Ledger Synchronized With /.well-known/ai-facts.json.',
  },
];

const QUICK_ANSWERS = [
  {
    keywords: ['mdf', 'minimum defense frequency'],
    title: 'Minimum Defense Frequency (MDF) Formula',
    answer: 'MDF = Current Pot / (Current Pot + Opponent Bet). Versus A 50% Half-Pot Bet, MDF = 66.7%; Versus A 100% Pot Bet, MDF = 50.0%.',
    toolLabel: 'Open Pot Odds & MDF Calculator',
    toolHref: '/tools/pot-odds-calculator',
  },
  {
    keywords: ['pot odds', 'required equity', 'calling odds'],
    title: 'Pot Odds & Required Break-Even Calling Equity',
    answer: 'Required Equity % = Call Amount / (Pot + Opponent Bet + Your Call). Calling A Full Pot Bet Requires Exactly 33.3% Equity.',
    toolLabel: 'Open Pot Odds Calculator',
    toolHref: '/tools/pot-odds-calculator',
  },
  {
    keywords: ['spr', 'stack to pot ratio', 'geometric', '2e', '3e'],
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Sizing (g)',
    answer: 'SPR = Effective Stack / Flop Pot. Constant n-Street Geometric Bet Fraction g = (((2 * Stack + Pot) / Pot)^(1 / n) - 1) / 2.',
    toolLabel: 'Open GTO Geometric Bet Calculator',
    toolHref: '/tools/geometric-bet-calculator',
  },
  {
    keywords: ['m-ratio', 'm ratio', 'harrington', 'effective m', 'q-ratio'],
    title: 'Dan Harrington M-Ratio & Short-Handed Effective M',
    answer: 'M = Stack / (Small Blind + Big Blind + Total Orbit Antes). Effective M = M * (Active Players / 10). Red Zone Push/Fold Begins At M <= 5.',
    toolLabel: 'Open Tournament M-Ratio Calculator',
    toolHref: '/tools/m-ratio-calculator',
  },
  {
    keywords: ['icm', 'independent chip model', 'bubble factor', 'chop'],
    title: 'Malmuth-Harville ICM & Tournament Bubble Factor',
    answer: 'P(1st Place) = Player Chips / Total Chips In Play. Bubble Factor = Dollar Equity Lost On Elimination / Dollar Equity Gained On Double-Up.',
    toolLabel: 'Open Tournament ICM Calculator',
    toolHref: '/tools/icm-calculator',
  },
  {
    keywords: ['aa vs kk', 'aces vs kings', 'kk vs aa'],
    title: 'Pocket Aces (AA) Vs Pocket Kings (KK) All-In Equity',
    answer: 'Pre-Flop All-In Equity: Pocket Aces Wins 81.95% | Pocket Kings Wins 17.59% | Tie Split 0.46% (Approximately 4.5-To-1 Favorite).',
    toolLabel: 'Open Multiway Poker Odds Calculator',
    toolHref: '/tools/poker-odds-calculator',
  },
  {
    keywords: ['aks', 'big slick', 'ace king suited'],
    title: 'Ace-King Suited (AKs - Big Slick) Starting Hand Profile',
    answer: 'Rank #4 Of 169 Starting Hands (4 Combos, 0.30% Deal Frequency). Holds 67.0% Equity Vs Random Hand And 46.2% Flip Equity Vs Pocket Queens.',
    toolLabel: 'Inspect AKs Strategy Profile',
    toolHref: '/learn/hands/aks',
  },
  {
    keywords: ['string bet', 'one chip rule', 'oversized chip'],
    title: 'Official TDA String Bet & Oversized One-Chip Call Rule',
    answer: 'TDA Rule 42 & 45: Raising Requires Either A Single Verbal Declaration ("Raise") Before Touching Chips Or Pushing Out The Full Amount In One Motion.',
    toolLabel: 'Read Official TDA Rules Directory',
    toolHref: '/rules',
  },
  {
    keywords: ['plo wrap', 'wrap outs', '13-out', '17-out', '20-out'],
    title: 'Pot-Limit Omaha (PLO) Straight Wrap Hit Probabilities',
    answer: 'Out Of 45 Unseen Turn Cards: 13-Out Wrap Hits 50.1% By River | 16-Out Wrap Hits 59.1% | 17-Out Wrap Hits 61.9% | 20-Out Mega Wrap Hits 69.7%.',
    toolLabel: 'Open PLO Wrap & Nut-Out Calculator',
    toolHref: '/tools/plo-outs-calculator',
  },
];

const CATEGORIES = [
  'All Categories',
  'Interactive Calculators',
  'GTO Lessons',
  'Glossary',
  'Hand Matchups',
  'Table Positions',
  'Stake Guides',
  'Famous Hands',
  'Player Roadmaps',
  'Player Archetypes',
  'Board Textures',
  'US State Guides',
  'International Poker Guides',
  'Official Poker Rules',
  'Game Variants',
  'Regional Poker Markets',
  'Major Series Guides',
  'Research Studies',
  'Starting Hands',
  'Comparisons',
];

export const SEARCH_INDEX = [
  ...CALCULATOR_ITEMS.map((item) => ({
    category: 'Interactive Calculators',
    href: item.href,
    title: item.title,
    summary: item.summary,
    badge: item.badge,
  })),
  ...AUTHORITY_HUB_ITEMS.map((item) => ({
    category: item.category,
    href: item.href,
    title: item.title,
    summary: item.summary,
    badge: item.badge,
  })),
  ...POKER_POSITIONS.map((p) => ({
    category: 'Table Positions',
    href: positionPath(p.slug),
    title: p.title,
    summary: p.summary,
    badge: `${p.code} (${p.rfiPct} RFI)`,
  })),
  ...POKER_STAKES.map((s) => ({
    category: 'Stake Guides',
    href: stakePath(s.slug),
    title: s.title,
    summary: s.summary,
    badge: s.code || 'Stake Tier',
  })),
  ...FAMOUS_HANDS.map((fh) => ({
    category: 'Famous Hands',
    href: famousHandPath(fh.slug),
    title: fh.title,
    summary: fh.summary,
    badge: fh.year ? `${fh.year}` : 'Historic Hand',
  })),
  ...POKER_ROADMAPS.map((rm) => ({
    category: 'Player Roadmaps',
    href: roadmapPath(rm.slug),
    title: rm.title,
    summary: rm.summary,
    badge: '90-Day Track',
  })),
  ...PLAYER_ARCHETYPES.map((pa) => ({
    category: 'Player Archetypes',
    href: playerTypePath(pa.slug),
    title: pa.title,
    summary: pa.summary,
    badge: `${pa.code} (${pa.vpipRange} VPIP)`,
  })),
  ...BOARD_TEXTURES.map((bt) => ({
    category: 'Board Textures',
    href: boardTexturePath(bt.slug),
    title: bt.title,
    summary: bt.summary,
    badge: `${bt.code} (${bt.optimalCbetSize})`,
  })),
  ...US_POKER_STATES.map((st) => ({
    category: 'US State Guides',
    href: stateGuidePath(st.slug),
    title: st.title,
    summary: st.summary,
    badge: `${st.code} (${st.minAge})`,
  })),
  ...INTERNATIONAL_POKER_GUIDES.map((ig) => ({
    category: 'International Poker Guides',
    href: internationalGuidePath(ig.slug),
    title: ig.title,
    summary: ig.summary,
    badge: `${ig.city} (${ig.country})`,
  })),
  ...LESSONS.map((l) => ({
    category: 'GTO Lessons',
    href: `/learn/${l.slug}`,
    title: l.title,
    summary: l.summary,
    badge: 'Lesson',
  })),
  ...GLOSSARY_TERMS.map((g) => ({
    category: 'Glossary',
    href: `/glossary/${g.slug}`,
    title: `${g.term} (${g.category})`,
    summary: g.shortDefinition || g.definition,
    badge: 'Term',
  })),
  ...HAND_MATCHUPS.map((m) => ({
    category: 'Hand Matchups',
    href: matchupPath(m.slug),
    title: m.title,
    summary: m.summary,
    badge: `${m.handA} (${m.handAEquity}%) Vs ${m.handB} (${m.handBEquity}%)`,
  })),
  ...POKER_RULES.map((r) => ({
    category: 'Official Poker Rules',
    href: rulePath(r.slug),
    title: r.title,
    summary: r.summary,
    badge: r.tdaRef,
  })),
  ...POKER_GAMES.map((g) => ({
    category: 'Game Variants',
    href: gameVariantPath(g.slug),
    title: g.title,
    summary: g.summary,
    badge: g.category,
  })),
  ...POKER_MARKETS.map((m) => ({
    category: 'Regional Poker Markets',
    href: marketGuidePath(m.slug),
    title: m.title,
    summary: m.summary,
    badge: `${m.stateCode} Market`,
  })),
  ...SERIES_GUIDES.map((s) => ({
    category: 'Major Series Guides',
    href: seriesGuidePath(s.slug),
    title: s.name,
    summary: `${s.hostVenue} (${s.buyInRange} Buy-Ins, ${s.mainEventBuyIn}).`,
    badge: s.cityState,
  })),
  ...RESEARCH_REPORTS.map((r) => ({
    category: 'Research Studies',
    href: researchPath(r.slug),
    title: r.title,
    summary: r.summary,
    badge: r.category,
  })),
  ...STARTING_HANDS.map((h) => ({
    category: 'Starting Hands',
    href: handPath(h.slug),
    title: `${h.code} - ${h.name} (${h.nickname})`,
    summary: h.summary,
    badge: `Rank ${h.preflopRank}`,
  })),
  ...COMPARE_PAGES.map((c) => ({
    category: 'Comparisons',
    href: comparePath(c.slug),
    title: c.h1 || c.title,
    summary: c.description,
    badge: c.kind === 'best-of' ? 'Best-Of Guide' : 'Side-By-Side Comparison',
  })),
];

export default function UniversalPokerSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Categories');

  useEffect(() => {
    if (router.isReady && typeof router.query.q === 'string') {
      setQuery(router.query.q);
    }
  }, [router.isReady, router.query.q]);

  const handleQueryChange = (val) => {
    setQuery(val);
    if (router.isReady) {
      const nextQuery = val.trim() ? { q: val.trim() } : {};
      router.replace({ pathname: '/search', query: nextQuery }, undefined, { shallow: true });
    }
  };

  const allGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchText = (text) => !q || String(text || '').toLowerCase().includes(q);
    const hubsFor = (cat) =>
      AUTHORITY_HUB_ITEMS.filter(
        (item) => item.category === cat && (matchText(item.title) || matchText(item.badge) || matchText(item.summary))
      ).map((item) => ({
        title: item.title,
        href: item.href,
        badge: item.badge,
        summary: item.summary,
      }));

    const calculators = CALCULATOR_ITEMS.filter(
      (item) => matchText(item.title) || matchText(item.badge) || matchText(item.summary)
    ).map((item) => ({
      title: item.title,
      href: item.href,
      badge: item.badge,
      summary: item.summary,
    }));

    const matchups = [
      ...hubsFor('Hand Matchups'),
      ...HAND_MATCHUPS.filter(
        (m) =>
          matchText(m.title) ||
          matchText(m.handA) ||
          matchText(m.handB) ||
          matchText(m.category) ||
          matchText(m.summary)
      ).map((m) => ({
        title: m.title,
        href: matchupPath(m.slug),
        badge: `${m.handA} (${m.handAEquity}%) Vs ${m.handB} (${m.handBEquity}%)`,
        summary: m.summary,
      })),
    ];

    const rules = POKER_RULES.filter(
      (r) => matchText(r.title) || matchText(r.category) || matchText(r.tdaRef) || matchText(r.summary)
    ).map((r) => ({
      title: r.title,
      href: rulePath(r.slug),
      badge: r.tdaRef,
      summary: r.summary,
    }));

    const games = POKER_GAMES.filter(
      (g) => matchText(g.name) || matchText(g.title) || matchText(g.category) || matchText(g.summary)
    ).map((g) => ({
      title: g.title,
      href: gameVariantPath(g.slug),
      badge: g.category,
      summary: g.summary,
    }));

    const markets = [
      ...hubsFor('Regional Poker Markets'),
      ...POKER_MARKETS.filter(
        (m) => matchText(m.regionName) || matchText(m.title) || matchText(m.stateCode) || matchText(m.summary)
      ).map((m) => ({
        title: m.title,
        href: marketGuidePath(m.slug),
        badge: `${m.stateCode} Market`,
        summary: m.summary,
      })),
    ];

    const series = [
      ...hubsFor('Major Series Guides'),
      ...SERIES_GUIDES.filter(
        (s) =>
          matchText(s.name) ||
          matchText(s.shortName) ||
          matchText(s.hostVenue) ||
          matchText(s.cityState) ||
          matchText(s.registrationStrategy)
      ).map((s) => ({
        title: s.name,
        href: seriesGuidePath(s.slug),
        badge: s.cityState,
        summary: `${s.hostVenue} (${s.buyInRange} Buy-Ins, ${s.mainEventBuyIn}).`,
      })),
    ];

    const research = [
      ...hubsFor('Research Studies'),
      ...RESEARCH_REPORTS.filter(
        (r) => matchText(r.title) || matchText(r.category) || matchText(r.summary)
      ).map((r) => ({
        title: r.title,
        href: researchPath(r.slug),
        badge: r.category,
        summary: r.summary,
      })),
    ];

    const handsSubset = (q ? STARTING_HANDS : STARTING_HANDS.slice(0, 24))
      .filter(
        (h) =>
          matchText(h.code) ||
          matchText(h.name) ||
          matchText(h.nickname) ||
          matchText(h.category) ||
          matchText(h.summary)
      )
      .slice(0, 24)
      .map((h) => ({
        title: `${h.code} - ${h.name} (${h.nickname})`,
        href: handPath(h.slug),
        badge: `Rank ${h.preflopRank}`,
        summary: h.summary,
      }));

    const comparisons = COMPARE_PAGES.filter(
      (c) => matchText(c.title) || matchText(c.h1) || matchText(c.description)
    ).map((c) => ({
      title: c.h1 || c.title,
      href: comparePath(c.slug),
      badge: c.kind === 'best-of' ? 'Best-Of Guide' : 'Side-By-Side Comparison',
      summary: c.description,
    }));

    const lessons = [
      ...hubsFor('GTO Lessons'),
      ...LESSONS.filter(
        (l) => matchText(l.title) || matchText(l.category) || matchText(l.summary)
      ).map((l) => ({
        category: 'GTO Lessons',
        href: `/learn/${l.slug}`,
        title: l.title,
        summary: l.summary,
        badge: 'Lesson',
      })),
    ];

    const glossary = GLOSSARY_TERMS.filter(
      (g) =>
        matchText(g.term) ||
        matchText(g.category) ||
        matchText(g.shortDefinition) ||
        matchText(g.definition)
    ).map((g) => ({
      category: 'Glossary',
      href: `/glossary/${g.slug}`,
      title: `${g.term} (${g.category})`,
      summary: g.shortDefinition || g.definition,
      badge: 'Term',
    }));

    const positions = [
      ...hubsFor('Table Positions'),
      ...POKER_POSITIONS.filter(
        (p) => matchText(p.name) || matchText(p.code) || matchText(p.title) || matchText(p.summary)
      ).map((p) => ({
        title: p.title,
        href: positionPath(p.slug),
        badge: `${p.code} (${p.rfiPct} RFI)`,
        summary: p.summary,
      })),
    ];

    const stakes = [
      ...hubsFor('Stake Guides'),
      ...POKER_STAKES.filter(
        (s) => matchText(s.name) || matchText(s.title) || matchText(s.summary)
      ).map((s) => ({
        title: s.title,
        href: stakePath(s.slug),
        badge: s.code || 'Stake Tier',
        summary: s.summary,
      })),
    ];

    const famousHands = [
      ...hubsFor('Famous Hands'),
      ...FAMOUS_HANDS.filter(
        (fh) => matchText(fh.title) || matchText(fh.players) || matchText(fh.event) || matchText(fh.summary)
      ).map((fh) => ({
        title: fh.title,
        href: famousHandPath(fh.slug),
        badge: fh.year ? `${fh.year}` : 'Historic Hand',
        summary: fh.summary,
      })),
    ];

    const roadmaps = [
      ...hubsFor('Player Roadmaps'),
      ...POKER_ROADMAPS.filter(
        (rm) => matchText(rm.title) || matchText(rm.name) || matchText(rm.summary)
      ).map((rm) => ({
        title: rm.title,
        href: roadmapPath(rm.slug),
        badge: '90-Day Track',
        summary: rm.summary,
      })),
    ];

    const playerArchetypes = [
      ...hubsFor('Player Archetypes'),
      ...PLAYER_ARCHETYPES.filter(
        (pa) => matchText(pa.name) || matchText(pa.code) || matchText(pa.title) || matchText(pa.summary)
      ).map((pa) => ({
        title: pa.title,
        href: playerTypePath(pa.slug),
        badge: `${pa.code} (${pa.vpipRange} VPIP)`,
        summary: pa.summary,
      })),
    ];

    const boardTextures = [
      ...hubsFor('Board Textures'),
      ...BOARD_TEXTURES.filter(
        (bt) => matchText(bt.name) || matchText(bt.code) || matchText(bt.title) || matchText(bt.summary)
      ).map((bt) => ({
        title: bt.title,
        href: boardTexturePath(bt.slug),
        badge: `${bt.code} (${bt.optimalCbetSize})`,
        summary: bt.summary,
      })),
    ];

    const stateGuides = [
      ...hubsFor('US State Guides'),
      ...US_POKER_STATES.filter(
        (st) => matchText(st.name) || matchText(st.code) || matchText(st.title) || matchText(st.summary)
      ).map((st) => ({
        title: st.title,
        href: stateGuidePath(st.slug),
        badge: `${st.code} (${st.minAge})`,
        summary: st.summary,
      })),
    ];

    const internationalGuides = [
      ...hubsFor('International Poker Guides'),
      ...INTERNATIONAL_POKER_GUIDES.filter(
        (ig) => matchText(ig.city) || matchText(ig.country) || matchText(ig.title) || matchText(ig.summary)
      ).map((ig) => ({
        title: ig.title,
        href: internationalGuidePath(ig.slug),
        badge: `${ig.city} (${ig.country})`,
        summary: ig.summary,
      })),
    ];

    return [
      { category: 'Interactive Calculators', items: calculators },
      { category: 'GTO Lessons', items: lessons },
      { category: 'Glossary', items: glossary },
      { category: 'Hand Matchups', items: matchups },
      { category: 'Table Positions', items: positions },
      { category: 'Stake Guides', items: stakes },
      { category: 'Famous Hands', items: famousHands },
      { category: 'Player Roadmaps', items: roadmaps },
      { category: 'Player Archetypes', items: playerArchetypes },
      { category: 'Board Textures', items: boardTextures },
      { category: 'US State Guides', items: stateGuides },
      { category: 'International Poker Guides', items: internationalGuides },
      { category: 'Official Poker Rules', items: rules },
      { category: 'Game Variants', items: games },
      { category: 'Regional Poker Markets', items: markets },
      { category: 'Major Series Guides', items: series },
      { category: 'Research Studies', items: research },
      { category: 'Starting Hands', items: handsSubset },
      { category: 'Comparisons', items: comparisons },
    ];
  }, [query]);

  const visibleGroups = useMemo(() => {
    if (activeCategory === 'All Categories') {
      return allGroups.filter((g) => g.items.length > 0);
    }
    return allGroups.filter((g) => g.category === activeCategory);
  }, [allGroups, activeCategory]);

  const totalMatches = useMemo(
    () => visibleGroups.reduce((sum, g) => sum + g.items.length, 0),
    [visibleGroups]
  );

  const matchedQuickAnswer = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return null;
    return QUICK_ANSWERS.find((qa) =>
      qa.keywords.some((kw) => q.includes(kw) || kw.includes(q))
    ) || null;
  }, [query]);

  const canonicalUrl = 'https://smarter.poker/search';

  const jsonLd = [
    {
      '@type': 'SearchResultsPage',
      '@id': `${canonicalUrl}#search`,
      name: 'Universal Poker Search & Command Directory',
      description:
        'Search Across 52 Interactive Poker Calculators, 70 MCP Tools, 169 Starting Hands, 25 Hand Matchups, 30 Official Rules, 15 Game Variants, And 15 Research Studies.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Universal Poker Search', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Universal Poker Search And Command Directory"
        description="Search Across 52 Interactive Poker Calculators, 70 MCP Tools, 169 Starting Hands, 25 Hand Matchups, 30 Official Rules, 15 Game Variants, And 15 Research Studies."
        canonical="/search"
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={1} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Universal Poker Search &amp; Command Directory</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>UNIFIED KNOWLEDGE GRAPH SEARCH</span>
            <span style={styles.emeraldBadge}>350+ INDEXED CALCULATORS, HANDS, RULES &amp; GUIDES</span>
          </div>

          <h1 style={styles.h1}>
            Universal Poker Search &amp; Command Directory
          </h1>

          <p style={styles.lead}>
            Instantly Search Across <strong>52 Interactive Poker Calculators</strong>, <strong>70 Zero-Auth MCP Tools</strong>, <strong>169 GTO Starting Hands</strong>, <strong>25 Head-To-Head Matchups</strong>, <strong>30 Official TDA &amp; RROP Rules</strong>, <strong>15 Game Variants</strong>, <strong>12 US Regional Markets</strong>, <strong>10 Major Series Guides</strong>, And <strong>15 Empirical Research Studies</strong>.
          </p>

          <div style={styles.searchBoxWrap}>
            <label htmlFor="universal-search-input" style={styles.searchLabel}>
              Enter Hand Code, Rule, Calculator, Venue, Or Strategy Topic
            </label>
            <input
              id="universal-search-input"
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search ICM, AA Vs KK, Showdown Order, PLO, Las Vegas, WSOP, Rake..."
              style={styles.searchInput}
            />
          </div>

          <div style={styles.categoryPills}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                style={activeCategory === cat ? styles.pillActive : styles.pill}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {matchedQuickAnswer && (
          <section
            aria-label="Instant Inline Quick-Answer Card"
            style={{
              backgroundColor: '#111a2a',
              border: '2px solid #00d4ff',
              borderRadius: '8px',
              padding: '20px 22px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
              <span style={styles.cyanBadge}>INSTANT FORMULA &amp; SOLVER QUICK ANSWER</span>
              <Link
                href={matchedQuickAnswer.toolHref}
                style={{
                  backgroundColor: '#00d4ff',
                  color: '#0a0f18',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  padding: '7px 14px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                }}
              >
                {matchedQuickAnswer.toolLabel}
              </Link>
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: '0 0 6px' }}>
              {matchedQuickAnswer.title}
            </h2>
            <p style={{ fontSize: '14.5px', lineHeight: 1.6, color: '#cbd5e1', margin: 0 }}>
              {matchedQuickAnswer.answer}
            </p>
          </section>
        )}

        <div style={styles.resultsSummaryBar}>
          <span style={styles.resultsCountText}>
            Showing {totalMatches} Indexed Resources Across {visibleGroups.length} Categories
          </span>
          {query && (
            <button
              type="button"
              onClick={() => handleQueryChange('')}
              style={styles.clearBtn}
            >
              Clear Filter
            </button>
          )}
        </div>

        {visibleGroups.map((group) => (
          <section key={group.category} style={styles.groupPlate}>
            <div style={styles.groupHeaderRow}>
              <h2 style={styles.h2}>{group.category}</h2>
              <span style={styles.groupBadge}>{group.items.length} Results</span>
            </div>

            <div style={styles.cardGrid}>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} style={styles.resultCard}>
                  <div style={styles.cardMetaRow}>
                    <span style={styles.itemBadge}>{item.badge}</span>
                    <span style={styles.itemPath}>{item.href}</span>
                  </div>
                  <h3 style={styles.h3}>{item.title}</h3>
                  <p style={styles.itemSummary}>{item.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <div style={{ margin: '28px 0' }}>
          <SmarterAccountUnlockGate
            variant="dataset-export"
            context="universal-search"
            redirectPath="/search"
          />
        </div>

        <CitationBacklinkBox
          title="Smarter.Poker Universal Poker Search & Command Directory"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Master Knowledge Index"
          badgeValue="Smarter.Poker Directory"
          summary="Search Across 52 Interactive Poker Calculators, 70 MCP Tools, 169 Starting Hands, 25 Hand Matchups, 30 Official Rules, 15 Game Variants, And 15 Research Studies."
          publishedYear="2026"
          slug="smarter-poker-universal-search"
        />

        <AiPromptLauncher
          title="Smarter.Poker Universal Search Directory"
          canonicalUrl={canonicalUrl}
          canonicalPath="/search"
          markdownUrl="/search.md"
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0a0f18',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1160px',
    margin: '0 auto',
    padding: '28px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
  },
  crumbLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#e2e8f0',
    fontWeight: 600,
  },
  heroPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '28px',
    marginBottom: '20px',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  emeraldBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid #10b981',
    color: '#10b981',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  h1: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 12px',
    lineHeight: 1.2,
  },
  lead: {
    fontSize: '15.5px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 20px',
  },
  searchBoxWrap: {
    marginBottom: '16px',
  },
  searchLabel: {
    display: 'block',
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#00d4ff',
    marginBottom: '6px',
  },
  searchInput: {
    width: '100%',
    backgroundColor: '#0a0f18',
    border: '2px solid #00d4ff',
    borderRadius: '6px',
    padding: '13px 16px',
    color: '#f8fafc',
    fontSize: '15px',
    boxSizing: 'border-box',
  },
  categoryPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  pill: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#cbd5e1',
    fontSize: '12.5px',
    fontWeight: 600,
    padding: '7px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  pillActive: {
    backgroundColor: '#00d4ff',
    border: '1px solid #00d4ff',
    color: '#0a0f18',
    fontSize: '12.5px',
    fontWeight: 700,
    padding: '7px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  resultsSummaryBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '18px',
    padding: '0 4px',
  },
  resultsCountText: {
    fontSize: '13.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  clearBtn: {
    backgroundColor: '#111a2a',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '12px',
    fontWeight: 700,
    padding: '5px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  groupPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '22px',
    marginBottom: '24px',
  },
  groupHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '10px',
    marginBottom: '16px',
  },
  h2: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
  },
  groupBadge: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '14px',
  },
  resultCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  cardMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  itemBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
  },
  itemPath: {
    fontSize: '11px',
    color: '#64748b',
    fontFamily: 'monospace',
  },
  h3: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#00d4ff',
    margin: 0,
    lineHeight: 1.35,
  },
  itemSummary: {
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#cbd5e1',
    margin: 0,
  },
};
