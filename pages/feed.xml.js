/**
 * RSS 2.0 SYNDICATION FEED - /feed.xml
 *
 * Google Discover, Google News, Feedly, and AI search crawlers poll RSS feeds
 * declared via <link rel="alternate" type="application/rss+xml"> to discover
 * strategy guides, software comparisons, and interactive tools between full
 * sitemap crawls.
 */
import { LESSONS, LEARN_MODIFIED, lessonPath } from '../src/content/learn/lessons.js';
import { COMPARE_PAGES, AS_OF as COMPARE_AS_OF, comparePath } from '../src/content/compare/pages.js';
import { GLOSSARY_TERMS, glossaryTermPath } from '../src/content/glossary/terms.js';
import { RESEARCH_REPORTS, researchPath } from '../src/content/research/reports.js';
import { POKER_RULES, rulePath } from '../src/content/rules/rules.js';
import { POKER_VARIANTS, gameVariantPath } from '../src/content/games/variants.js';
import { POKER_MARKET_GUIDES, marketGuidePath } from '../src/content/guides/markets.js';
import { HAND_MATCHUPS, matchupPath } from '../src/content/learn/matchups.js';
import { SERIES_GUIDES, seriesGuidePath } from '../src/content/guides/seriesGuides.js';
import { SITE_URL, sendSitemapXmlResponse } from '../src/lib/seo/sitemapBuilders.mjs';
import { xmlEscape } from '../src/lib/videoLibraryWatch.mjs';
import { VENUE_COUNT_LABEL } from '../src/lib/venueCount.mjs';

const FEATURE_ITEMS = [
    {
        title: 'Smarter.Poker Platform Features & Tools Directory',
        link: `${SITE_URL}/features`,
        description: 'Explore Smarter.Poker Free Platform Verticals: Form W-2G Tax Ledger, Dealer Toke Tracker, Jarvis AI Coach, Virtual Sandbox, Club Commander, FaceTime Calls, And Solvers.',
    },
    {
        title: 'Poker Bankroll & Form W-2G Tax Ledger',
        link: `${SITE_URL}/features/bankroll-tax-tracker`,
        description: 'Track Session Wins And Losses, Scan Receipts, Log Form W-2G Jackpots, And Export IRS Schedule C CSV Spreadsheets For Your Certified Public Accountant.',
    },
    {
        title: 'Poker Dealer Toke Tracker & Shift Scheduling',
        link: `${SITE_URL}/features/poker-dealer-toke-tracker`,
        description: 'Log Cash And Tournament Downs, Track Tip Rates ($/hr And $/down), Manage Multi-Casino Shift Calendars, And Estimate Year-End Taxes.',
    },
    {
        title: 'PokerBrain & Jarvis AI Tactical Coach',
        link: `${SITE_URL}/features/poker-ai-coach`,
        description: 'Analyze Hands In Conversational Plain English, Automatically Detect Hidden Strategic Leaks, And Practice GTO Solver Equilibrium Lines.',
    },
    {
        title: 'Virtual Poker Table Sandbox & Runout Simulator',
        link: `${SITE_URL}/features/virtual-poker-sandbox`,
        description: 'Construct Custom Scenarios, Assign Stacks And Positions, Calculate Multiway Side Pots, And Simulate Thousands Of Turn And River Runouts.',
    },
    {
        title: 'Club Commander Live Poker Room Management',
        link: `${SITE_URL}/features/club-commander`,
        description: 'Modern Cardroom Operations Featuring Live Digital Waitlists, Multi-Screen TV Displays, Automated Two-Way Player SMS Alerts, And Tournament Clocks.',
    },
    {
        title: 'Live Poker Messenger & FaceTime Video Table Calls',
        link: `${SITE_URL}/features/poker-messenger-video-calls`,
        description: 'Connect Over Encrypted Multi-Peer Video Table Calls, Spatial Voice Audio, Direct Messaging, And Instant Hand History Replay Links With Zero App Downloads.',
    },
    {
        title: 'Multiplayer Poker Trivia & Brain Training',
        link: `${SITE_URL}/features/poker-trivia`,
        description: 'Sharpen Pot Odds Math, GTO Frequencies, And Poker Lore Across Survival Mode (3 Lives), 60-Second Blitz Attacks, And Global Daily Leaderboards.',
    },
    {
        title: 'GTO Poker Training Games & Decision Drills',
        link: `${SITE_URL}/features/poker-training-games`,
        description: 'Interactive Multi-Street Scenarios Across Multi-Table Tournaments, Deep Cash Games, Spins, And SNGs Graded With Instant Solver EV Loss Feedback.',
    },
    {
        title: 'Verified Home Poker Game Directory & Host Tools',
        link: `${SITE_URL}/features/home-poker-games`,
        description: 'Discover Safe, Vetted Home Poker Games Near You, Inspect Blind Structures And Host Reputation Badges, Or Host Games With Free Tournament Clocks.',
    },
    {
        title: 'Interactive Video Coaching Masterclasses & Pause Quizzes',
        link: `${SITE_URL}/features/interactive-video-coaching`,
        description: 'Watch Professional Video Masterclasses With Interactive Mid-Hand Pause Quizzes Prompting Strategic Choices Before Solution Reveals.',
    },
    {
        title: 'Live Poker Near Me & Cardroom Directory',
        link: `${SITE_URL}/features/poker-near-me`,
        description: `Explore ${VENUE_COUNT_LABEL} Verified Live Poker Rooms, 4,500+ Weekly Tournaments, WSOP/WPT Series Schedules, Cash Game Listings, And Waitlists With Instant GPS Directions.`,
    },
    {
        title: 'Private Poker Clubs & Union Hosting Arena',
        link: `${SITE_URL}/features/private-poker-clubs`,
        description: 'Create And Host Online Poker Clubs, Multi-Club Unions, Ring Games, And Multi-Table Tournaments With Real-Time Rakeback Tracking And WebRTC Video Calls.',
    },
    {
        title: 'Poker Reels & Social Video Feed Network',
        link: `${SITE_URL}/features/poker-reels-social-feed`,
        description: 'Stream Short-Form Video Reels Of Hero Calls And Bad Beats, Attach Replay Links, And Earn Diamond Creator Rewards.',
    },
    {
        title: 'GTO Preflop Charts & Range Matrix',
        link: `${SITE_URL}/features/preflop-charts-matrix`,
        description: 'Solver-Grade 169-Hand Preflop Range Matrices Across 15BB To 100BB Stack Depths With Color-Coded Mixed Action Frequencies.',
    },
    {
        title: 'Poker Equity & Tournament ICM Calculator Suite',
        link: `${SITE_URL}/features/poker-equity-calculators`,
        description: 'High-Precision Multiway Equity Engine Supporting Six Games (Holdem, PLO4/5/6, Stud, Razz) And Malmuth-Harville ICM Payout Solvers.',
    },
];

const TOOL_ITEMS = [
    {
        title: 'Free Poker Tools, GTO Solvers & Math Calculators Directory',
        link: `${SITE_URL}/tools`,
        description: 'Master Directory Of 52 Interactive Poker Math Calculators, GTO Preflop Range Matrices, ICM Deal Solvers, And Bankroll Variance Engines.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Free Poker Odds & Equity Calculator',
        link: `${SITE_URL}/tools/poker-odds-calculator`,
        description: 'Calculate Exact Texas Holdem And Omaha Hand Equity, Outs, And Pot Odds Instantly.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Free ICM & Tournament Payout Calculator',
        link: `${SITE_URL}/tools/icm-calculator`,
        description: 'Compute Malmuth-Harville Independent Chip Model Tournament Equity And Final Table Deal Numbers.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Pot Odds, MDF & Hypergeometric Outs Calculator',
        link: `${SITE_URL}/tools/pot-odds-calculator`,
        description: 'Compute Exact Pot Odds Ratios, Required Calling Equity, Minimum Defense Frequency (MDF), And Turn/River Draw Probabilities.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Bankroll & Risk Of Ruin Calculator',
        link: `${SITE_URL}/tools/bankroll-calculator`,
        description: 'Compute Brownian Motion Risk Of Ruin Percentages And Required Buy-In Buffers Across Cash Games, PLO, And Tournaments.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Short-Stack Push/Fold Nash Equilibrium Chart Calculator',
        link: `${SITE_URL}/tools/push-fold-calculator`,
        description: 'Interactive 5BB To 20BB Short-Stack Jamming Ranges Across All Table Positions With Big Blind Ante Adjustments.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'PKO & Mystery Bounty Chip Equity Calculator',
        link: `${SITE_URL}/tools/bounty-calculator`,
        description: 'Convert Cash Knockout Bounties Into Tournament Chip-Equivalent Values And Bounty-Adjusted Calling Equity Thresholds.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Winrate Confidence Interval & Variance Calculator',
        link: `${SITE_URL}/tools/poker-winrate-calculator`,
        description: 'Compute 95% Winrate Confidence Intervals, Probability Of Loss Over Sample Size, And Minimum Hands Required For Statistical Proof.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Multi-Way All-In Side Pot Calculator',
        link: `${SITE_URL}/tools/side-pot-calculator`,
        description: 'Split Multi-Way All-In Main Pots, Side Pots, Dead Money, And Uncalled Bet Returns For 2 To 9 Players.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Tournament Blind Structure & Chip Distribution Generator',
        link: `${SITE_URL}/tools/blind-structure-calculator`,
        description: 'Build TDA-Compliant Tournament Blind Schedules, Color-Up Breaks, And Starting Chip Denomination Distributions.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
        link: `${SITE_URL}/tools/spr-calculator`,
        description: 'Compute Exact Flop SPR, Commitment Thresholds, And 1-Street, 2-Street, And 3-Street Geometric Bet Sizing Percentages.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Pot-Limit Omaha (PLO) Max Bet & Double-Board Bomb Pot Calculator',
        link: `${SITE_URL}/tools/plo-bet-calculator`,
        description: 'Compute Exact Pot-Limit Maximum Raise Totals (3x + Trail + Pot) And Double-Board Bomb Pot Split Equity.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Tournament Payout & Prize Pool Distribution Calculator',
        link: `${SITE_URL}/tools/payout-calculator`,
        description: 'Generate WSOP And TDA Power-Law Tournament Payout Schedules, Pay Jumps, And Bubble Multipliers.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Cash Game Rake, Promo Drop & Time-Charge Calculator',
        link: `${SITE_URL}/tools/rake-calculator`,
        description: 'Compare Percentage Pot Rake, California Flat Flop Drop, And Texas Time-Charge Impact On Hourly Winrate.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Preflop 3-Bet, 4-Bet Sizing & Minimum Defense Calculator',
        link: `${SITE_URL}/tools/3bet-calculator`,
        description: 'Calculate Solver-Backed IP/OOP 3-Bet And 4-Bet Sizing, Break-Even Fold Equity, And Value-To-Bluff Ratios.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Final Table Deal & ICM Chop Calculator',
        link: `${SITE_URL}/tools/chop-calculator`,
        description: 'Compare Exact Malmuth-Harville ICM Chop, Linear Chip Chop, And Save-Amount Final Table Deal Payouts.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Variance, Downswing & Confidence Simulator',
        link: `${SITE_URL}/tools/variance-calculator`,
        description: 'Simulate Winrate Confidence Intervals, Probability Of Loss, And Expected Downswings In Buy-Ins.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Postflop Poker Outs & Draw Probability Calculator',
        link: `${SITE_URL}/tools/outs-calculator`,
        description: 'Calculate Exact Hypergeometric Turn, River, And Flop-To-River Draw Odds Alongside The Rule Of 4 And 2.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'US Poker Tax, Form W-2G & Session Deduction Calculator',
        link: `${SITE_URL}/tools/poker-tax-calculator`,
        description: 'Estimate IRS Form W-2G Tournament Thresholds ($5,000) And Recreational Vs Professional Session Tax Deductions.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Tournament Staking, Markup & Investor Split Calculator',
        link: `${SITE_URL}/tools/staking-calculator`,
        description: 'Compute Staking Markup Breakeven ROI, Investor Share Costs, And Post-Series Payout Splits.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Pre-Flop Isolation Raise (ISO) & Limper Sizing Calculator',
        link: `${SITE_URL}/tools/iso-calculator`,
        description: 'Calculate Optimal Pre-Flop Isolation Raise Sizing Against Live And Online Limpers With Resulting Flop SPR.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Home Game Chip Set Denomination & Setup Calculator',
        link: `${SITE_URL}/tools/home-game-kit`,
        description: 'Compute Optimal 300, 500, And 1,000 Piece Chip Set Breakdowns And Printable Home Game House Rules.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Format Selector & 7-Day Study Roadmap Quiz',
        link: `${SITE_URL}/tools/format-quiz`,
        description: 'Match Your Session Schedule, Bankroll Cushion, And Risk Tolerance To Your Optimal Poker Format And Study Plan.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Flop Board Texture & GTO C-Bet Strategy Analyzer',
        link: `${SITE_URL}/tools/board-texture-analyzer`,
        description: 'Classify Any 3-Card Flop By Suit Texture, Connectedness, Range/Nut Advantage, And Optimal GTO C-Bet Sizing.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Tournament Harrington M-Ratio & Effective M Calculator',
        link: `${SITE_URL}/tools/m-ratio-calculator`,
        description: 'Compute Orbit Cost, Harrington M-Ratio, Short-Handed Effective M, Q-Ratio, And 5-Zone Survival Strategy.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Cash Game Session, Stop-Loss & Annual Income Planner',
        link: `${SITE_URL}/tools/session-planner`,
        description: 'Project Net Hourly And Annual Cash-Game Income After Comps And Expenses With Stop-Loss And Bankroll Targets.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Straddle & Double-Board Bomb Pot EV Calculator',
        link: `${SITE_URL}/tools/straddle-calculator`,
        description: 'Calculate UTG And Mississippi Button Straddle Effective Stack Reduction And Double-Board Bomb Pot Quartering Math.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Hand History Formatter & SPR Street Analyzer',
        link: `${SITE_URL}/tools/hand-converter`,
        description: 'Convert Raw Poker Hand Details Into Clean Reddit, TwoPlusTwo, Discord, And AI Solver Markdown With Street SPR.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Satellite Bubble Factor & Seat-Lock Threshold Calculator',
        link: `${SITE_URL}/tools/satellite-calculator`,
        description: 'Compute Flat-Payout Tournament Satellite Seat-Lock Chip Targets, Bubble Factors, And Fold-AA Survival Thresholds.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Bad Beat Jackpot (BBJ) & High-Hand Promo EV Calculator',
        link: `${SITE_URL}/tools/promo-ev-calculator`,
        description: 'Calculate Exact Bad Beat Jackpot Breakeven Pool Thresholds, Table-Share EV, And Hourly High-Hand Promo Rebates.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Texas Holdem Showdown Winner & Kicker Resolver',
        link: `${SITE_URL}/tools/who-wins-calculator`,
        description: 'Evaluate Any Two Holdem Hands Across A 5-Card Board To Determine The Exact Winning 5-Card Hand, Kicker, Or Split Pot.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Mixed-Game Rotation Tracker & Printable Table Placards',
        link: `${SITE_URL}/tools/mixed-game-placards`,
        description: 'Interactive HORSE, 8-Game, And 10-Game Orbit Rotation Tracker With Printable Table Placards And Dealing Rules.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '10-Question Quantitative GTO Poker IQ Diagnostic Test',
        link: `${SITE_URL}/tools/poker-iq-test`,
        description: 'Test Pot Odds, MDF, Malmuth-Harville ICM, Preflop Ranges, Combinatorics, And TDA Rules With Percentile Scoring.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'PLO4 & PLO5 Straight Wrap Outs & Nut Equity Calculator',
        link: `${SITE_URL}/tools/plo-outs-calculator`,
        description: 'Compute 13, 16, 17, And 20-Out Omaha Straight Wrap Plus Flush Redraw Hypergeometric Turn-And-River Equity.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Tournament Late-Registration ICM & Equity Boost Calculator',
        link: `${SITE_URL}/tools/late-reg-calculator`,
        description: 'Calculate Tournament Late-Registration ICM Starting-Stack Equity Appreciation, Elimination Boost, And Overlay Advantage.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Winrate Confidence Interval (70% / 95% / 99%) Calculator',
        link: `${SITE_URL}/tools/winrate-confidence-calculator`,
        description: 'Compute 70%, 95%, And 99% BB/100 Winrate Confidence Bounds, True Probability Of Loss, And Proof-Of-Win Sample Size.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Trip, Travel Overhead & Breakeven EV Planner',
        link: `${SITE_URL}/tools/poker-trip-planner`,
        description: 'Calculate Live Poker Festival Flight, Hotel, And Per-Diem Expense Drag Against Cash Hours And Tournament Volume.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'TDA Tournament Shot Clock & Time-Bank Manager',
        link: `${SITE_URL}/tools/shot-clock`,
        description: 'Live Tournament Action Timer Supporting 15s, 20s, And 30s Shot Clocks, Time-Bank Extensions, And Printable Cards.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Geometric Bet Sizing (2e & 3e) Street Calculator',
        link: `${SITE_URL}/tools/geometric-bet-calculator`,
        description: 'Compute Exact 1-Street, 2-Street (2e), And 3-Street (3e) Geometric Pot-Fraction Bet Sizing And Villain MDF.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Cash Game Table Selection & Winrate Multiplier Calculator',
        link: `${SITE_URL}/tools/table-selection-calculator`,
        description: 'Score Live Cash Game Table Profitability From Recreational Player Count, Average Stack Depth, And Hourly Rake Drag.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'MTT Sunday Grind Schedule, ABI & Bankroll Planner',
        link: `${SITE_URL}/tools/mtt-grind-planner`,
        description: 'Model Multi-Table Tournament Session Buy-In Exposure, Average Buy-In (ABI), And 100-To-300 ABI Bankroll Cushions.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '3-Way & 4-Way Multiway All-In Main & Side-Pot EV Calculator',
        link: `${SITE_URL}/tools/multiway-all-in-calculator`,
        description: 'Compute Main-Pot And Sequential Side-Pot Expected Value, Dead-Money Allocation, And Multiway Calling Equity Thresholds.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Mystery Bounty Pool Tracker & Envelope EV Calculator',
        link: `${SITE_URL}/tools/mystery-bounty-tracker`,
        description: 'Track Remaining Mystery Bounty Envelopes In Real Time To Compute Average Knockout EV, Chip Equivalence, And Top-Chest Odds.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Tournament ICM Bubble Factor & Risk Premium Matrix Calculator',
        link: `${SITE_URL}/tools/bubble-factor-calculator`,
        description: 'Compute Pairwise Malmuth-Harville ICM Bubble Factors, Risk Premium Percentages, And Final Table All-In Calling Equity Thresholds.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'River Bluff-Catching, Minimum Defense Frequency & Blocker EV Calculator',
        link: `${SITE_URL}/tools/bluff-catching-calculator`,
        description: 'Evaluate River Bluff-Catching Expected Value Using Pot-Odds Alpha, Defender MDF, And Card-Removal Blocker Ratios.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Multi-Street Flop-Turn-River Barrel & Cumulative Fold Equity Calculator',
        link: `${SITE_URL}/tools/multi-street-ev-calculator`,
        description: 'Model Street-By-Street Pot Growth, SPR Compression, And Cumulative Triple-Barrel Bluff Breakeven Thresholds.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Heads-Up (HU) & 3-Max Short-Stack Nash Push/Fold/Limp Equilibrium Solver',
        link: `${SITE_URL}/tools/heads-up-push-fold-calculator`,
        description: 'Unexploitable 1BB-To-25BB Heads-Up And 3-Max Small Blind Push/Limp And Big Blind Call Nash Equilibrium Charts.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Blind-Vs-Blind (SB Vs BB) GTO Range & Limp-Raise Matrix Calculator',
        link: `${SITE_URL}/tools/blind-vs-blind-calculator`,
        description: 'Solve Small Blind Versus Big Blind Limp, Open-Raise, Iso-Raise, And Limp-3-Bet Frequencies From 20BB To 100BB.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Bankroll Shot-Taking, Stake Move-Up & Stop-Loss Ladder Calculator',
        link: `${SITE_URL}/tools/shot-taking-calculator`,
        description: 'Build A Disciplined Two-Tier Bankroll Move-Up Plan With Exact Shot Buy-In Budgets, Hard Drop-Down Floors, And Combined RoR.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Pre-Session Mental Game Warm-Up & Post-Session Cooldown Builder',
        link: `${SITE_URL}/tools/warmup-cooldown-routine`,
        description: '3-Minute Pre-Session A-Game Readiness Diagnostic, Hard Stop-Loss Contract, And Post-Session Decision Grading Journal.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Home Game Host Director: Live Waitlist, Random Seat Draw & Payout Ledger',
        link: `${SITE_URL}/tools/home-game-director`,
        description: 'Browser-Native Home Poker Table Seat Randomizer, Buy-In And Rebuy Audit Ledger, And Minimum-Transfer Net Settlement Solver.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Math Formulas Encyclopedia: 15 Core Equations, LaTeX & Worked Examples',
        link: `${SITE_URL}/learn/formulas`,
        description: 'Complete Algebraic Reference For 15 Foundational Poker Math Formulas Including Pot Odds, MDF, ICM, SPR, Geometric Sizing, And RoR.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '8 Multi-Table Tournament (MTT) Stages Strategy Playbook',
        link: `${SITE_URL}/learn/tournament-stages`,
        description: 'Chronological MTT Playbook Covering Early Deepstack Levels, Antes, Late-Reg Close, Money Bubble, ITM, Final Table ICM, And Heads-Up.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '12 Common Poker Leaks, BB/100 Winrate Cost & GTO Solver Cure Directory',
        link: `${SITE_URL}/learn/leaks`,
        description: 'Diagnostic Database Of The 12 Most Expensive Preflop, Postflop, And ICM Leaks With HUD Thresholds And Solver Remediation Drills.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '15 Poker HUD Statistics Encyclopedia: Formulas, GTO Targets & Exploits',
        link: `${SITE_URL}/learn/hud-stats`,
        description: 'Quantitative Reference For 15 Essential HUD Statistics (VPIP, PFR, 3-Bet, C-Bet, WTSD, W$SD, WWSF, AF) With 6-Max/9-Max GTO Targets.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '15 Common Poker Myths Debunked By GTO Solvers & Combinatorics',
        link: `${SITE_URL}/learn/poker-myths-debunked`,
        description: 'Fact-Checked Debunking Of 15 Widespread Table Folklore Claims Using CFR Solver Equilibriums And 52-Card Combinatorics.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Cross-Format Poker Strategy Migration Matrix (6 Transition Blueprints)',
        link: `${SITE_URL}/learn/format-migration-guide`,
        description: 'Six Mathematical Transition Blueprints For Players Switching Between Live Cash, Online 6-Max, MTT Tournaments, And PLO.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Smarter.Poker Quantitative Research Faculty & Editorial Verification Team',
        link: `${SITE_URL}/authors`,
        description: 'Profiles And Audit Credentials For Smarter.Poker Quantitative Solver, Cardroom Operations, Tournament ICM, And PLO Research Desks.',
        category: 'Press & Media',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Interactive Poker Software, Solver, Bankroll & Cardroom Decision Matrix',
        link: `${SITE_URL}/compare/decision-matrix`,
        description: '20-Scenario Quantitative Recommendation Matrix Comparing GTO Solvers, Calculators, Venue Directories, And Private Club Platforms.',
        category: 'Poker Software Comparison',
        pubDate: COMPARE_AS_OF,
    },
    {
        title: '10 Major Airport, Interstate & Cross-Border Live Poker Travel Corridors',
        link: `${SITE_URL}/poker-rooms/corridors`,
        description: 'Geographic Routing Directory Connecting Major Non-Casino Metros And Airports To Their Closest Legal Live Poker Rooms.',
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Best Live Poker Rooms By Game Variant (PLO, Big O, Mixed, Stud & High-Stakes)',
        link: `${SITE_URL}/poker-rooms/by-game`,
        description: `Curated Directory Grouping ${VENUE_COUNT_LABEL} North American Poker Rooms By PLO, Big O, Mixed Games, 7-Card Stud, High-Stakes NLH, And Daily MTTs.`,
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Poker Room Security, Floor Dispute Escalation & Angle-Shot Protection Guide',
        link: `${SITE_URL}/poker-rooms/security-and-disputes-guide`,
        description: 'Official TDA And RROP Protocols For Floor Disputes, Surveillance Reviews, Cage Safety, And Defending Against 8 Common Angle Shots.',
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '12-Month Live Poker Series, Circuit & Festival Seasonal Planning Calendar',
        link: `${SITE_URL}/poker-rooms/seasonal-calendar`,
        description: 'Month-By-Month Global Live Poker Circuit Planner Mapping Peak Tournament Festivals And Cash Game Liquidity From January To December.',
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '2026 Annual State Of Live & Online Poker Industry Whitepaper',
        link: `${SITE_URL}/research/annual-state-of-poker-2026`,
        description: `Flagship 2026 Quantitative Industry Report Synthesizing ${VENUE_COUNT_LABEL} Venues, 4,500+ Weekly Tournaments, And 10M+ Simulated GTO Hands (DOI: 10.5281/zenodo.15129481).`,
        category: 'Poker Industry Research',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '2026 Master Quantitative Poker Benchmark Tables (Rake, Variance, ICM & GTO)',
        link: `${SITE_URL}/research/benchmarks`,
        description: 'Single-Page Master Reference Consolidating All First-Party Smarter.Poker Rake, Winrate, Standard Deviation, ICM, And HUD Benchmark Tables.',
        category: 'Poker Industry Research',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Smarter.Poker Canonical Fact Ledger, Entity Provenance & AI Verification Hub',
        link: `${SITE_URL}/facts`,
        description: 'Authoritative Fact Sheet And Machine-Verifiable Provenance Ledger Synchronized With /.well-known/ai-facts.json.',
        category: 'Press & Media',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'First-Time Live Casino Poker Room Etiquette & Tipping Guide',
        link: `${SITE_URL}/poker-rooms/first-time-guide`,
        description: 'Interactive First-Time Live Casino Poker Room Guide With Dealer Tipping Calculator, Chip Denominations, And Etiquette.',
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Casino Poker Comps, Rewards Cards & Dealer Tipping Guide',
        link: `${SITE_URL}/poker-rooms/comps-and-tipping-guide`,
        description: 'Complete Financial Guide To Live Poker Room Player Rewards, Comp Earning Rates, And Cash/Tournament Dealer Toke Standards.',
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'US State-By-State Poker Legality, Tax Withholding & Live Room Directory',
        link: `${SITE_URL}/poker-rooms/states`,
        description: 'State-By-State Regulatory Guide Covering Commercial Casinos, Tribal Gaming, Social Card Clubs, And W-2G Tax Withholding.',
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'International Live Poker Destinations & Global Travel Guides',
        link: `${SITE_URL}/poker-rooms/international`,
        description: 'Flagship Cardrooms, Cash Game Stakes, Rake Caps, Currency Rules, And Visitor Tax Laws Across 10 Global Poker Destinations.',
        category: 'Live Poker Guides',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Smarter.Poker Official Press Kit & 2026 Industry Benchmarks',
        link: `${SITE_URL}/press`,
        description: 'Quotable 2026 US Poker Industry Fast Facts, Official Brand Boilerplates, And Media Citation Snippets.',
        category: 'Press & Media',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Universal Poker Search & Command Directory',
        link: `${SITE_URL}/search`,
        description: `Instant Command Palette And Search Directory Indexing 52 Interactive Calculators, 70 MCP Tools, And ${VENUE_COUNT_LABEL} Live Poker Rooms.`,
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Official Poker Hand Rankings Chart & Tie-Breaker Cheat Sheet',
        link: `${SITE_URL}/learn/poker-hand-rankings`,
        description: 'Complete 52-Card High Hand Rankings, 5-Card And 7-Card Combinatorics, Short Deck 6+ Rules, Omaha Must-Use-Two Rules, And Lowball Systems.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '9-Seat Poker Position Strategy Encyclopedia (UTG To Button & Blinds)',
        link: `${SITE_URL}/learn/positions`,
        description: 'Exact 100BB Solver Raise First In (RFI), 3-Bet, Cold-Call, And Expected BB/100 Winrate Benchmarks Across All Nine Seats.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Stake Level & Move-Up Readiness Authority Hub',
        link: `${SITE_URL}/learn/stakes`,
        description: 'Quantitative Breakdown Of Live Cash, Online Cash, PLO, And Tournament Stake Tiers With Bankroll And Shot-Taking Checklists.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Famous Historic Poker Hands & GTO Solver Breakdown Archive',
        link: `${SITE_URL}/learn/famous-hands`,
        description: 'Twelve Iconic Championship Poker Hands Deconstructed Street By Street Through A Modern GTO Solver Lens.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '90-Day Poker Player Progression & Study Roadmaps',
        link: `${SITE_URL}/learn/roadmaps`,
        description: 'Structured 90-Day Step-By-Step Study And Bankroll Curriculums For Five Distinct Live And Online Player Tracks.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Player Archetypes & Exploitative Counter-Strategy Encyclopedia',
        link: `${SITE_URL}/learn/player-types`,
        description: 'Quantitative VPIP/PFR/3-Bet HUD Profiles, Behavioral Tells, And Street-By-Street Exploits For 8 Poker Player Archetypes.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: '12 Canonical Flop Board Textures & GTO C-Bet Strategy Encyclopedia',
        link: `${SITE_URL}/learn/board-textures`,
        description: 'Solver Range Advantage, Nut Advantage, Optimal C-Bet Frequencies, Sizing Splits, And Turn Barrel Plans Across 12 Flop Textures.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Mental Game, Tilt Control & Peak Performance Authority Guide',
        link: `${SITE_URL}/learn/mental-game`,
        description: 'Scientific Guide To Mastering Poker Psychology, The Seven Types Of Tilt, Logic-Injection Resets, And A-Game Stop-Loss Rules.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker As A Business: Professional Bankroll, Schedule C Taxes & Operations',
        link: `${SITE_URL}/learn/poker-as-a-business`,
        description: 'Operational Blueprint For Professional Poker Players Covering Risk Capital, IRS Schedule C Vs Schedule A Taxes, And Form W-2G.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Complete Poker Math Formulas, Equations & Solver Proofs Reference Hub',
        link: `${SITE_URL}/learn/poker-math`,
        description: 'Core Poker Math Equations Covering Pot Odds, EV, Minimum Defense Frequency (MDF), SPR, Geometric Sizing, And Risk Of Ruin.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Printable One-Page Poker Cheat Sheets & Reference Cards Hub',
        link: `${SITE_URL}/learn/cheat-sheets`,
        description: 'Print-Ready Reference Cards For Hand Rankings, Rule Of 4 And 2 Draw Odds, 6-Max GTO RFI Charts, And Push/Fold Grids.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Online Vs. Live Poker Strategy Transition Guide',
        link: `${SITE_URL}/learn/online-vs-live-poker`,
        description: 'Quantitative Comparison Of Online 6-Max Play Versus Live 9-Handed Casino Poker Sizing, Pace, Multiway Frequencies, And Rake.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Live Poker Tells, Betting Timing & Anti-Angle-Shooting Encyclopedia',
        link: `${SITE_URL}/learn/live-poker-tells`,
        description: 'Empirical Guide To Live Casino Behavioral Tells, Action-Timing Patterns, Chip Mechanics, And TDA Angle-Shoot Defenses.',
        category: 'Poker Rules & Strategy',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Interactive 169-Hand GTO Preflop Range Matrix',
        link: `${SITE_URL}/tools/preflop-ranges`,
        description: 'Study Opening, 3-Bet, And Big Blind Defense Preflop Charts Across Stack Depths And Positions.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Free Poker Webmaster Widgets & Embed Center',
        link: `${SITE_URL}/tools/embeds`,
        description: 'Embed Free Responsive Poker Odds Calculators, ICM Solvers, GTO Preflop Charts, And Verified SVG Authority Badges On Any Website Or Blog.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Five Free Daily Poker Tournaments (Freerolls)',
        link: `${SITE_URL}/freerolls`,
        description: 'Five Free No-Limit Hold\'em Tournaments Every Day At 12:30 AM, 8:30 AM, 12:30 PM, 4:30 PM And 8:30 PM Central. Zero Buy-In, Zero Deposit Required. Funded Diamond Games Are Not Open For Play Yet.',
        category: 'Poker Freerolls',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Software & Freeroll Platform Comparisons',
        link: `${SITE_URL}/compare`,
        description: 'Compare Smarter.Poker Free GTO Calculators, Equity Solvers, And Daily Freerolls Against Paid Software And Legacy Networks.',
        category: 'Poker Software Comparison',
        pubDate: COMPARE_AS_OF,
    },
    {
        title: 'Smarter.Poker AI Agent OpenAPI Specification',
        link: `${SITE_URL}/api/openapi.json`,
        description: 'Public OpenAPI 3.1.0 Machine-Readable API Specification For Autonomous AI Agents, MCP Tools, And Custom GPTs.',
        category: 'Developer APIs',
        pubDate: LEARN_MODIFIED,
    },
];

export function buildRssFeedXml() {
    const learnDate = new Date(`${LEARN_MODIFIED}T00:00:00Z`).toUTCString();
    const compareDate = new Date(`${COMPARE_AS_OF}T00:00:00Z`).toUTCString();
    const latestTime = Math.max(
        new Date(`${LEARN_MODIFIED}T00:00:00Z`).getTime(),
        new Date(`${COMPARE_AS_OF}T00:00:00Z`).getTime()
    );
    const lastBuildDate = new Date(latestTime).toUTCString();

    const items = [
        ...TOOL_ITEMS.map((item) => ({
            title: item.title,
            link: item.link,
            guid: item.link,
            description: item.description,
            category: item.category,
            pubDate: learnDate,
        })),
        ...LESSONS.map((lesson) => {
            const url = `${SITE_URL}${lessonPath(lesson.slug)}`;
            return {
                title: lesson.title || lesson.h1,
                link: url,
                guid: url,
                description: lesson.summary || lesson.metaDescription || '',
                category: lesson.category || 'Poker Strategy',
                pubDate: learnDate,
            };
        }),
        ...COMPARE_PAGES.map((page) => {
            const url = `${SITE_URL}${comparePath(page.slug)}`;
            return {
                title: page.title || page.h1,
                link: url,
                guid: url,
                description: page.description || '',
                category: 'Poker Software Comparison',
                pubDate: compareDate,
            };
        }),
        ...RESEARCH_REPORTS.map((report) => {
            const url = `${SITE_URL}${researchPath(report.slug)}`;
            const reportDate = report.modifiedDate
                ? new Date(`${report.modifiedDate}T00:00:00Z`).toUTCString()
                : learnDate;
            return {
                title: report.title,
                link: url,
                guid: url,
                description: report.summary || '',
                category: report.category || 'Poker Industry Research',
                pubDate: reportDate,
            };
        }),
        ...POKER_RULES.map((rule) => {
            const url = `${SITE_URL}${rulePath(rule.slug)}`;
            return {
                title: `${rule.title} (${rule.tdaRef})`,
                link: url,
                guid: url,
                description: rule.summary || '',
                category: `Official Poker Rules (${rule.category})`,
                pubDate: learnDate,
            };
        }),
        ...POKER_VARIANTS.map((variant) => {
            const url = `${SITE_URL}${gameVariantPath(variant.slug)}`;
            return {
                title: `${variant.name} Rules, Hand Rankings & Strategy`,
                link: url,
                guid: url,
                description: variant.summary || '',
                category: `Poker Variants (${variant.category})`,
                pubDate: learnDate,
            };
        }),
        ...POKER_MARKET_GUIDES.map((market) => {
            const url = `${SITE_URL}${marketGuidePath(market.slug)}`;
            return {
                title: market.title,
                link: url,
                guid: url,
                description: market.summary || '',
                category: 'Regional Live Poker Market Guides',
                pubDate: learnDate,
            };
        }),
        ...HAND_MATCHUPS.map((matchup) => {
            const url = `${SITE_URL}${matchupPath(matchup.slug)}`;
            return {
                title: matchup.title,
                link: url,
                guid: url,
                description: matchup.summary || '',
                category: `Preflop Hand Matchups (${matchup.category})`,
                pubDate: learnDate,
            };
        }),
        ...SERIES_GUIDES.map((guide) => {
            const url = `${SITE_URL}${seriesGuidePath(guide.slug)}`;
            return {
                title: `${guide.name} Strategy & Player Guide`,
                link: url,
                guid: url,
                description: `${guide.hostVenue} (${guide.cityState}) - ${guide.buyInRange} Buy-Ins, ${guide.blindStructureRating} Structure.`,
                category: 'Major Poker Series Guides',
                pubDate: learnDate,
            };
        }),
        ...FEATURE_ITEMS.map((item) => ({
            title: item.title,
            link: item.link,
            guid: item.link,
            description: item.description,
            category: 'Poker Platform Features',
            pubDate: learnDate,
        })),
        ...GLOSSARY_TERMS.map((term) => {
            const url = `${SITE_URL}${glossaryTermPath(term.slug)}`;
            return {
                title: `${term.term} - Poker Glossary Definition`,
                link: url,
                guid: url,
                description: term.definition || '',
                category: `Poker Glossary (${term.category})`,
                pubDate: learnDate,
            };
        }),
    ];

    const itemsXml = items
        .map(
            (item) => `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.link)}</link>
      <guid isPermaLink="true">${xmlEscape(item.guid)}</guid>
      <description>${xmlEscape(item.description)}</description>
      <category>${xmlEscape(item.category)}</category>
      <pubDate>${xmlEscape(item.pubDate)}</pubDate>
    </item>`
        )
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Smarter.Poker Strategy, Tools &amp; Comparisons</title>
    <link>${SITE_URL}</link>
    <description>GTO Poker Strategy Lessons, Interactive Equity &amp; ICM Calculators, And Verified Poker Platform Comparisons From Smarter.Poker.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

export async function getServerSideProps({ req, res }) {
    const xml = buildRssFeedXml();
    const latestTime = Math.max(
        new Date(`${LEARN_MODIFIED}T00:00:00Z`).getTime(),
        new Date(`${COMPARE_AS_OF}T00:00:00Z`).getTime()
    );
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    sendSitemapXmlResponse(req, res, xml, {
        cacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400',
        lastModified: new Date(latestTime).toUTCString(),
    });
    return { props: {} };
}

export default function RssFeed() {
    return null;
}
