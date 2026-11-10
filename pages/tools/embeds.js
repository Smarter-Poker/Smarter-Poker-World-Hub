import React, { useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { DEAD_TOOL_REPLACEMENTS } from '../../src/lib/seo/backlinkCatalog.mjs';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { Code, Copy, Check, ExternalLink, ShieldCheck, Zap } from 'lucide-react';

const WIDGETS = [
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
];

export const EMBEDDABLE_TOOLS = WIDGETS;

export const PARTNER_BADGES = [
  {
    id: 'badge-venue',
    title: 'Verified Live Poker Room Badge',
    description: 'For casinos, Texas social poker clubs, and charity rooms listed in the Smarter.Poker directory.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=venue',
    targetUrl: 'https://smarter.poker/hub/poker-near-me/lobby',
    altText: 'Verified Poker Room: Smarter.Poker Directory',
  },
  {
    id: 'badge-commander',
    title: 'Powered By Club Commander Waitlist Badge',
    description: 'For card rooms running live waitlists, tournament clocks, and seat alerts with Club Commander.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=commander',
    targetUrl: 'https://smarter.poker/compare/best-poker-room-management-software',
    altText: 'Live Waitlist & Clocks: Powered By Club Commander',
  },
  {
    id: 'badge-research',
    title: 'Smarter.Poker Empirical Research Citation Badge',
    description: 'For journalists, Substack writers, and poker bloggers citing Smarter.Poker industry benchmark studies.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=research',
    targetUrl: 'https://smarter.poker/research',
    altText: 'Empirical Data Source: Smarter.Poker Research',
  },
  {
    id: 'badge-gto',
    title: 'GTO Math Verified Solver Badge',
    description: 'For strategy articles, hand breakdowns, and training posts referencing Smarter.Poker GTO preflop and ICM ranges.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=gto',
    targetUrl: 'https://smarter.poker/tools/preflop-ranges',
    altText: 'GTO Math Verified: Smarter.Poker Solver',
  },
  {
    id: 'badge-club',
    title: 'Smarter.Poker Club Arena Partner Badge',
    description: 'For private online poker clubs, home game hosts, and league organizers running games on Club Arena.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=club',
    targetUrl: 'https://smarter.poker/compare/best-poker-club-apps',
    altText: 'Private Club Platform: Smarter.Poker Club Arena',
  },
  {
    id: 'badge-daily',
    title: 'Daily GTO Hand Challenge Verified Badge',
    description: 'For training blogs, study Discord servers, and hand recap posts linking to the Smarter.Poker Daily GTO Challenge.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=daily',
    targetUrl: 'https://smarter.poker/hub/training/daily-challenge',
    altText: 'Daily GTO Challenge: Solver Verified On Smarter.Poker',
  },
  {
    id: 'badge-rules',
    title: 'Official Poker Rules & TDA Authority Badge',
    description: 'For tournament directors, card room rulebooks, and floor ruling guides citing Smarter.Poker Official Rules.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=rules',
    targetUrl: 'https://smarter.poker/rules',
    altText: 'Official Poker Rules: Smarter.Poker TDA & RROP',
  },
  {
    id: 'badge-award-top50',
    title: 'US Live Poker Room Benchmark Index Badge',
    description: 'For poker rooms and casino properties included in the US Live Poker Room Rake & Jackpot Benchmark Report (324+ venues).',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-top50',
    targetUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    altText: 'US Live Poker Room Index: Smarter.Poker Directory',
  },
  {
    id: 'badge-award-texas',
    title: 'Texas Social Card Room Benchmark Badge',
    description: 'For Texas social poker clubs profiled in the Cardroom Waitlist Turnover & Time-Collection Benchmark.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-texas',
    targetUrl: 'https://smarter.poker/research/cardroom-waitlist-turnover-and-table-utilization-benchmark',
    altText: 'Texas Card Room Benchmark: Smarter.Poker Directory',
  },
  {
    id: 'badge-award-vegas',
    title: 'Las Vegas Strip & Clark County Room Benchmark Badge',
    description: 'For Las Vegas casino poker rooms featured in the US Live Poker Room Rake & Vegas Market Guide.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-vegas',
    targetUrl: 'https://smarter.poker/poker-rooms/guides/las-vegas-nevada',
    altText: 'Las Vegas Room Benchmark: Smarter.Poker Directory',
  },
  {
    id: 'badge-award-florida',
    title: 'Florida Card Room & Series Benchmark Badge',
    description: 'For South Florida and Tampa Bay poker rooms featured in the Florida Poker Rooms & Market Strategy Guide.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-florida',
    targetUrl: 'https://smarter.poker/poker-rooms/guides/south-florida-miami-hollywood',
    altText: 'Florida Room Benchmark: Smarter.Poker Directory',
  },
  {
    id: 'badge-award-california',
    title: 'California Flat-Drop Card Room Benchmark Badge',
    description: 'For Los Angeles and Bay Area card rooms featured in the California Flat-Drop Strategy Guide.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-california',
    targetUrl: 'https://smarter.poker/poker-rooms/guides/los-angeles-california',
    altText: 'California Room Benchmark: Smarter.Poker Directory',
  },
  {
    id: 'badge-award-cpa',
    title: 'Form W-2G & Schedule C Tax Ledger Badge (For CPAs)',
    description: 'For gaming CPA firms, tax attorneys, and financial advisors linking to the free Form W-2G poker session tax ledger.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-cpa',
    targetUrl: 'https://smarter.poker/features/bankroll-tax-tracker',
    altText: 'Form W-2G Tax Ledger: Smarter.Poker Bankroll Tool',
  },
  {
    id: 'badge-award-dealer',
    title: 'Casino Dealer Toke & Shift Tracker Resource Badge',
    description: 'For casino dealer schools, hospitality programs, and dealer communities linking to the free Toke Tracker and study tools.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-dealer',
    targetUrl: 'https://smarter.poker/features/poker-dealer-toke-tracker',
    altText: 'Dealer Toke & Shift Tool: Smarter.Poker Toke Tracker',
  },
  {
    id: 'badge-award-edu',
    title: 'University Game Theory & Quantitative Dataset Badge',
    description: 'For university game theory syllabi, quantitative finance clubs, and open-source poker research repositories.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-edu',
    targetUrl: 'https://smarter.poker/api/datasets/catalog',
    altText: 'Poker Math & ICM Dataset: Smarter.Poker Research',
  },
];

export const STREAM_CHAT_COMMANDS = [
  {
    id: 'cmd-odds',
    command: '!odds',
    cmd: '!odds',
    query: 'AA vs KK',
    desc: 'Preflop matchup & draw equity calculator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=odds&q=AA+vs+KK',
    title: 'Preflop Matchup & Draw Equity Command (!odds AA vs KK)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=odds&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/poker-odds-calculator',
  },
  {
    id: 'cmd-potodds',
    command: '!potodds',
    cmd: '!potodds',
    query: '100 50',
    desc: 'Pot odds & Minimum Defense Frequency (MDF) calculator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=potodds&q=100+50',
    title: 'Pot Odds & Minimum Defense Frequency Command (!potodds 100 50)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=potodds&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  {
    id: 'cmd-pushfold',
    command: '!pushfold',
    cmd: '!pushfold',
    query: '10 BTN',
    desc: '10BB short-stack Nash push/fold range solver',
    example: 'https://smarter.poker/api/stream/cmd?cmd=pushfold&q=10+BTN',
    title: '10BB Short-Stack Nash Push/Fold Command (!pushfold)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=pushfold&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/push-fold-calculator',
  },
  {
    id: 'cmd-icm',
    command: '!icm',
    cmd: '!icm',
    query: '40,30,20,10',
    desc: 'Tournament final table ICM bubble factor & payout equity',
    example: 'https://smarter.poker/api/stream/cmd?cmd=icm&q=40,30,20,10',
    title: 'Tournament Final Table ICM Bubble Factor Command (!icm)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=icm&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/icm-calculator',
  },
  {
    id: 'cmd-bounty',
    command: '!bounty',
    cmd: '!bounty',
    query: '100 50 10000',
    desc: 'PKO & Mystery Bounty chip equivalent & odds discount',
    example: 'https://smarter.poker/api/stream/cmd?cmd=bounty&q=100+50+10000',
    title: 'PKO & Mystery Bounty Chip Equivalent Command (!bounty)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=bounty&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/bounty-calculator',
  },
  {
    id: 'cmd-winrate',
    command: '!winrate',
    cmd: '!winrate',
    query: '5 85',
    desc: 'Poker bankroll Risk of Ruin & BB/100 variance calculator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=winrate&q=5+85',
    title: 'Poker Bankroll Risk Of Ruin & Variance Command (!winrate)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=winrate&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
  },
  {
    id: 'cmd-plo',
    command: '!plo',
    cmd: '!plo',
    query: '100 50',
    desc: 'Pot-Limit Omaha max raise (3x + trail + pot) calculator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=plo&q=100+50',
    title: 'Pot-Limit Omaha Max Raise (3x + Trail + Pot) Command (!plo)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=plo&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/plo-bet-calculator',
  },
  {
    id: 'cmd-rake',
    command: '!rake',
    cmd: '!rake',
    query: '10 5 7',
    desc: 'Live cash game rake cap vs time collection analyzer',
    example: 'https://smarter.poker/api/stream/cmd?cmd=rake&q=10+5+7',
    title: 'Live Cash Game Rake Cap Vs. Time Collection Command (!rake)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=rake&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/rake-calculator',
  },
  {
    id: 'cmd-3bet',
    command: '!3bet',
    cmd: '!3bet',
    query: '2.5 IP',
    desc: 'Solver-approved IP/OOP 3-bet & 4-bet sizing calculator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=3bet&q=2.5+IP',
    title: 'Solver-Approved IP/OOP 3-Bet & 4-Bet Sizing Command (!3bet)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=3bet&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/3bet-calculator',
  },
  {
    id: 'cmd-rule',
    command: '!rule',
    cmd: '!rule',
    query: 'one-chip',
    desc: 'Official Poker TDA & RROP floor rulings lookup',
    example: 'https://smarter.poker/api/stream/cmd?cmd=rule&q=one-chip',
    title: 'Official Poker TDA & RROP Floor Rulings Command (!rule)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=rule&q=$(querystring))',
    toolUrl: 'https://smarter.poker/rules',
  },
  {
    id: 'cmd-chop',
    command: '!chop',
    cmd: '!chop',
    query: '50000,30000,20000 5000,3000,2000',
    desc: 'Final table ICM chop & chip chop deal calculator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=chop&q=50000,30000,20000+5000,3000,2000',
    title: 'Final Table ICM Chop & Chip Chop Deal Command (!chop 50000,30000,20000 5000,3000,2000)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=chop&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/chop-calculator',
  },
  {
    id: 'cmd-outs',
    command: '!outs',
    cmd: '!outs',
    query: '9 flop',
    desc: 'Exact hypergeometric poker draw outs & Rule of 2 and 4',
    example: 'https://smarter.poker/api/stream/cmd?cmd=outs&q=9+flop',
    title: 'Exact Hypergeometric Poker Draw Outs Command (!outs 9 flop)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=outs&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/outs-calculator',
  },
  {
    id: 'cmd-variance',
    command: '!variance',
    cmd: '!variance',
    query: '5 85 50000',
    desc: 'Poker winrate confidence interval & downswing simulator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=variance&q=5+85+50000',
    title: 'Poker Winrate Confidence Interval & Downswing Command (!variance 5 85 50000)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=variance&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/variance-calculator',
  },
  {
    id: 'cmd-matchup',
    command: '!matchup',
    cmd: '!matchup',
    query: 'aa-vs-kk',
    desc: 'Canonical preflop hand-vs-hand equity lookup',
    example: 'https://smarter.poker/api/stream/cmd?cmd=matchup&q=aa-vs-kk',
    title: 'Canonical Preflop Hand-Vs-Hand Equity Command (!matchup aa-vs-kk)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=matchup&q=$(querystring))',
    toolUrl: 'https://smarter.poker/learn/matchups',
  },
  {
    id: 'cmd-tax',
    command: '!tax',
    cmd: '!tax',
    query: 'net=25000&losses=10000',
    desc: 'US poker tax & IRS $5,000 Form W-2G withholding calculator',
    example: 'https://smarter.poker/api/stream/cmd?cmd=tax&q=net=25000',
    title: 'US Poker Tax & IRS $5,000 Form W-2G Withholding Command (!tax net=25000&losses=10000)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=tax&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/poker-tax-calculator',
  },
  {
    id: 'cmd-stake',
    command: '!stake',
    cmd: '!stake',
    query: 'buyin=1000&markup=1.2&sold=50',
    desc: 'Tournament staking markup, breakeven ROI & payout split',
    example: 'https://smarter.poker/api/stream/cmd?cmd=stake&q=1000+1.2+50',
    title: 'Tournament Staking Markup, Breakeven ROI & Payout Split Command (!stake 1000 1.2 50)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=stake&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/staking-calculator',
  },
  {
    id: 'cmd-iso',
    command: '!iso',
    cmd: '!iso',
    query: 'limpers=2&oop=true',
    desc: 'Pre-flop limper isolation raise sizing & flop SPR',
    example: 'https://smarter.poker/api/stream/cmd?cmd=iso&q=2',
    title: 'Pre-Flop Limper Isolation Raise Sizing & Flop SPR Command (!iso 2)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=iso&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/iso-calculator',
  },
  {
    id: 'cmd-series',
    command: '!series',
    cmd: '!series',
    query: 'wsop-las-vegas',
    desc: 'Major poker tournament series structure & survival guide',
    example: 'https://smarter.poker/api/stream/cmd?cmd=series&q=wsop-las-vegas',
    title: 'Major Poker Tournament Series Structure & Survival Guide Command (!series wsop-las-vegas)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=series&q=$(querystring))',
    toolUrl: 'https://smarter.poker/poker-series/guides',
  },
  {
    id: 'cmd-board',
    command: '!board',
    cmd: '!board',
    query: 'AsKh7d',
    desc: 'Flop board texture, range advantage & GTO C-Bet sizing',
    example: 'https://smarter.poker/api/stream/cmd?cmd=board&q=AsKh7d',
    title: 'Flop Board Texture, Range Advantage & GTO C-Bet Sizing Command (!board AsKh7d)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=board&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/board-texture-analyzer',
  },
  {
    id: 'cmd-mratio',
    command: '!mratio',
    cmd: '!mratio',
    query: '25000 500 1000 1000',
    desc: 'Harrington tournament M-Ratio, Effective M & Zone classification',
    example: 'https://smarter.poker/api/stream/cmd?cmd=mratio&q=25000+500+1000+1000',
    title: 'Harrington M-Ratio, Effective M & Zone Classification Command (!mratio 25000 500 1000 1000)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=mratio&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/m-ratio-calculator',
  },
  {
    id: 'cmd-straddle',
    command: '!straddle',
    cmd: '!straddle',
    query: '1/3',
    desc: 'Live cash game straddle & double-board bomb pot EV math',
    example: 'https://smarter.poker/api/stream/cmd?cmd=straddle&q=1/3',
    title: 'Live Cash Game Straddle & Bomb Pot EV Math Command (!straddle 1/3)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=straddle&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/straddle-calculator',
  },
  {
    id: 'cmd-sat',
    command: '!sat',
    cmd: '!sat',
    query: '12 10',
    desc: 'Satellite bubble factor, seat-lock stack & fold-AA threshold',
    example: 'https://smarter.poker/api/stream/cmd?cmd=sat&q=12+10',
    title: 'Satellite Bubble Factor & Seat-Lock Threshold Command (!sat 12 10)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=sat&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/satellite-calculator',
  },
  {
    id: 'cmd-bbj',
    command: '!bbj',
    cmd: '!bbj',
    query: '250000',
    desc: 'Bad Beat Jackpot breakeven pool & high-hand promo EV math',
    example: 'https://smarter.poker/api/stream/cmd?cmd=bbj&q=250000',
    title: 'Bad Beat Jackpot Breakeven Pool & Promo EV Command (!bbj 250000)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=bbj&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/promo-ev-calculator',
  },
  {
    id: 'cmd-position',
    command: '!position',
    cmd: '!position',
    query: 'btn',
    desc: 'Table seat position GTO RFI %, 3-Bet % & BB/100 winrate (!pos btn)',
    example: 'https://smarter.poker/api/stream/cmd?cmd=position&q=btn',
    title: 'Table Seat Position GTO RFI %, 3-Bet % & Winrate Command (!position btn / !pos utg)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=position&q=$(querystring))',
    toolUrl: 'https://smarter.poker/learn/positions',
  },
  {
    id: 'cmd-math',
    command: '!math',
    cmd: '!math',
    query: 'mdf',
    desc: 'Instant quantitative poker formula lookup (mdf, spr, ev, kelly)',
    example: 'https://smarter.poker/api/stream/cmd?cmd=math&q=mdf',
    title: 'Instant Quantitative Poker Formula Lookup Command (!math mdf / !math spr / !math ev)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=math&q=$(querystring))',
    toolUrl: 'https://smarter.poker/learn/poker-math',
  },
  {
    id: 'cmd-iq',
    command: '!iq',
    cmd: '!iq',
    query: '',
    desc: '10-Question Interactive GTO Poker IQ Diagnostic Test link',
    example: 'https://smarter.poker/api/stream/cmd?cmd=iq',
    title: '10-Question GTO Poker IQ Diagnostic Test Command (!iq)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=iq&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/poker-iq-test',
  },
];

export const STREAMER_COMMANDS = STREAM_CHAT_COMMANDS;

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');
  if (isMarkdownRequested) {
    const { renderEmbedsMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderEmbedsMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}

const WIDGET_CATEGORY_MAP = {
  'odds-calculator': 'equity',
  'preflop-ranges': 'equity',
  'pot-odds-calculator': 'equity',
  'spr-calculator': 'equity',
  '3bet-calculator': 'equity',
  'outs-calculator': 'equity',
  'icm-calculator': 'tournament',
  'push-fold-calculator': 'tournament',
  'bounty-calculator': 'tournament',
  'blind-structure-calculator': 'tournament',
  'payout-calculator': 'tournament',
  'chop-calculator': 'tournament',
  'staking-calculator': 'tournament',
  'format-quiz': 'tournament',
  'side-pot-calculator': 'cash',
  'plo-bet-calculator': 'cash',
  'rake-calculator': 'cash',
  'iso-calculator': 'cash',
  'poker-winrate-calculator': 'cash',
  'bankroll-calculator': 'bankroll',
  'variance-calculator': 'bankroll',
  'poker-tax-calculator': 'bankroll',
  'home-game-kit': 'bankroll',
};

export default function WebmasterEmbedPortal() {
  const [copiedId, setCopiedId] = useState(null);
  const [embedFormat, setEmbedFormat] = useState('iframe');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [partnerDomain, setPartnerDomain] = useState('');
  const [botPlatform, setBotPlatform] = useState('nightbot');
  const [previewWidgetId, setPreviewWidgetId] = useState(null);

  const cleanPartner = String(partnerDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  const getEmbedCode = (widget) => {
    const utmEmbed = cleanPartner ? `&utm_source=${encodeURIComponent(cleanPartner)}&utm_medium=embed` : '';
    const utmLander = cleanPartner ? `?utm_source=${encodeURIComponent(cleanPartner)}&utm_medium=embed` : '';
    const fullEmbedUrl = `${widget.embedUrl}${utmEmbed}`;
    const fullLanderUrl = `${widget.landerUrl}${utmLander}`;

    if (embedFormat === 'sdk') {
      const partnerAttr = cleanPartner ? ` data-partner="${cleanPartner}"` : '';
      return `<div data-smarter-poker-widget="${widget.id}"${partnerAttr}></div>\n<script async src="https://smarter.poker/embed-sdk.js"></script>`;
    }
    if (embedFormat === 'react') {
      return `<div className="smarter-poker-widget">\n  <iframe src="${fullEmbedUrl}" width="100%" height={${widget.height}} style={{ border: 0, borderRadius: 12, overflow: 'hidden', maxWidth: '100%' }} loading="lazy" title="${widget.title}" />\n  <p style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>Powered By <a href="${fullLanderUrl}" target="_blank" rel="noopener noreferrer">${widget.creditAnchor}</a></p>\n</div>`;
    }
    if (embedFormat === 'oembed') {
      return `https://smarter.poker/api/seo/oembed?url=${encodeURIComponent(widget.landerUrl)}&format=json${cleanPartner ? `&partner=${encodeURIComponent(cleanPartner)}` : ''}`;
    }
    if (embedFormat === 'markdown') {
      return `### [${widget.title}](${fullLanderUrl})\n${widget.description}\n\n[![${widget.creditAnchor}](https://smarter.poker/api/seo/badge?type=gto)](${fullLanderUrl})`;
    }
    if (embedFormat === 'bbcode') {
      return `[url=${fullLanderUrl}][b]${widget.title} (${widget.creditAnchor})[/b][/url]\n${widget.description}\nLaunch Free Calculator: [url=${fullLanderUrl}]${fullLanderUrl}[/url]`;
    }
    return `<iframe src="${fullEmbedUrl}" width="${widget.width}" height="${widget.height}" frameborder="0" loading="lazy" style="border:0;border-radius:12px;overflow:hidden;max-width:100%;" title="${widget.title}"></iframe>\n<p style="font-size:12px;text-align:center;color:#94AFCC;margin-top:6px;">Powered By <a href="${fullLanderUrl}" target="_blank" rel="noopener" style="color:#4E9CFF;text-decoration:none;font-weight:600;">${widget.creditAnchor}</a></p>`;
  };

  const getBotSyntax = (cmdItem) => {
    const endpoint = cmdItem.nightbot.replace(/^\$\(urlfetch\s+/, '').replace(/\?\$\(querystring\)\)$/, '');
    if (botPlatform === 'streamelements') {
      return `\${customapi.${endpoint}&q=\${queryencode \${1:}}}`;
    }
    if (botPlatform === 'fossabot') {
      return `\$(customapi ${endpoint}&q=\$(querystring))`;
    }
    return cmdItem.nightbot;
  };

  const visibleWidgets =
    selectedCategory === 'all'
      ? WIDGETS
      : WIDGETS.filter((w) => (WIDGET_CATEGORY_MAP[w.id] || 'equity') === selectedCategory);

  const handleCopy = (widget) => {
    const code = getEmbedCode(widget);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedId(widget.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const EMBEDS_FAQS = [
    {
      question: 'How Do I Embed The Smarter.Poker Odds Calculator On My Website?',
      answer:
        'Copy The Responsive HTML Iframe Snippet From This Portal And Paste It Into Your CMS Or HTML Page. It Automatically Adjusts To Mobile And Desktop Viewports With Zero API Keys Required.',
    },
    {
      question: 'Are Smarter.Poker Embeddable Poker Widgets Free For Commercial And Affiliate Sites?',
      answer:
        'Yes. All Smarter.Poker Widgets Are 100% Free To Embed On Poker Blogs, News Portals, Casino Affiliate Sites, And Media Publications.',
    },
    {
      question: 'Can I Customize The Theme Or Default Poker Game Variant For The Widget?',
      answer:
        'Yes. You Can Append URL Query Parameters Such As ?game=holdem, ?game=plo4, Or ?embed=true To Preselect Specific Variants And Lock Widget Dimensions.',
    },
    {
      question: 'Do These Widgets Require Any JavaScript Dependencies Or External Tracking Scripts?',
      answer:
        'No. Smarter.Poker Widgets Run Entirely Within Sandboxed Responsive Iframes, Requiring Zero External Scripts Or Client Libraries On Your Host Domain.',
    },
  ];

  const EMBEDS_SCHEMA = [
    schemas.organization,
    ...hubProductSchema({
      path: '/tools/embeds',
      name: 'Smarter.Poker Webmaster Widgets & Embed Distribution Center',
      description: 'Free embeddable poker widgets, odds calculators, ICM solvers, and GTO charts for poker webmasters, bloggers, and media sites.',
      applicationCategory: 'WebApplication',
      applicationSubCategory: 'DeveloperApplication',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Embed Widgets', '/tools/embeds'],
      ],
      faqs: EMBEDS_FAQS,
      howTo: {
        name: 'How To Embed Smarter.Poker Calculators On Your Website',
        description: `Step-by-step instructions for copying and embedding all ${WIDGETS.length} responsive poker calculators, ${PARTNER_BADGES.length} SVG badges, and ${STREAM_CHAT_COMMANDS.length} Nightbot stream commands into WordPress, Ghost, Substack, or custom HTML sites.`,
        steps: [
          {
            name: 'Select A Poker Widget Or Attribution Badge',
            text: `Choose from any of the ${WIDGETS.length} interactive poker calculators (Multiway Odds, ICM, GTO Preflop Ranges, Pot Odds, Push/Fold, Bankroll, Bounty, Winrate, Side Pot, Blind Structure, SPR, PLO Max Bet, Payouts, Rake, 3-Bet Sizing, Final Table Chop, Variance, Draw Outs, Poker Tax, Staking, Iso-Raise, Home Game Kit, or Format Quiz), ${PARTNER_BADGES.length} SVG attribution badges, or ${STREAM_CHAT_COMMANDS.length} Nightbot/StreamElements commands.`,
          },
          {
            name: 'Copy The Responsive Iframe Or Badge Snippet',
            text: 'Click the Copy Code button to copy the clean, sandboxed HTML5 iframe snippet or SVG badge with optimal responsive dimensions.',
          },
          {
            name: 'Paste Into Your Website CMS Or HTML Template',
            text: 'Paste the iframe snippet into your WordPress Custom HTML block, Webflow embed element, or static HTML template.',
          },
          {
            name: 'Test Live Responsiveness Across Desktop And Mobile',
            text: 'Preview your published page on mobile and desktop browsers to verify seamless touch interaction and automatic height scaling.',
          },
        ],
      },
    }),
    {
      '@type': 'ItemList',
      '@id': 'https://smarter.poker/tools/embeds#widget-list',
      name: 'Smarter.Poker Free Embeddable Poker Calculators & Solvers',
      numberOfItems: WIDGETS.length,
      itemListElement: WIDGETS.map((widget, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: widget.title,
        description: widget.description,
        url: widget.landerUrl,
      })),
    },
  ];

  return (
    <>
      <SEOHead
        title="Free Poker Widgets & Embeds"
        description="Free embeddable poker widgets for webmasters and bloggers. Embed real-time odds calculators, tournament ICM solvers, and GTO preflop charts with simple HTML iframe snippets."
        canonical="https://smarter.poker/tools/embeds"
        jsonLd={EMBEDS_SCHEMA}
        ogImage="/api/og/tool-card?tool=embeds&title=Free+Poker+Widgets+And+Embeds&subtitle=Responsive+Iframe+Widgets+For+Odds+ICM+And+Preflop+Ranges&statLabel=WIDGETS&statValue=100%+FREE"
        markdownUrl="https://smarter.poker/tools/embeds.md"
      />

      <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', paddingBottom: '60px' }}>
        <UniversalHeader pageDepth={1} />

        <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
          <header style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', background: 'rgba(78, 156, 255, 0.1)', border: '1px solid rgba(78, 156, 255, 0.25)', color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px' }}>
              <Code size={14} /> Webmaster Distribution Portal
            </div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>
              Free Embeddable Poker Tools For Webmasters
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255, 255, 255, 0.75)', maxWidth: '720px', margin: '0 auto', lineHeight: 1.6 }}>
              Add Interactive, Responsive Poker Calculators And GTO Charts To Your Website, Poker Forum, Or Strategy Blog. All Widgets Are Completely Free To Use With Canonical Attribution.
            </p>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '24px' }}>
              <Zap size={24} style={{ color: '#fbbf24', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>Zero Configuration Required</h3>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                Copy The HTML Snippet Directly Into Your WordPress Post, Ghost Blog, Or Custom CMS. Works Seamlessly Without External Script Dependencies.
              </p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '24px' }}>
              <ShieldCheck size={24} style={{ color: '#34d399', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>Mobile-Optimized & Responsive</h3>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                Each Calculator Dynamically Adapts To Desktop, Tablet, And Smartphone Screens With Lightning-Fast Sub-50ms Touch Response Times.
              </p>
            </div>
          </div>

          <section aria-labelledby="available-widgets-heading">
            <h2 id="available-widgets-heading" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '16px' }}>
              Available Embeddable Widgets
            </h2>

            {/* Partner Attribution & Multi-Format Configuration Bar */}
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.04)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
                borderRadius: '14px',
                padding: '20px',
                marginBottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: '1 1 260px' }}>
                  <label
                    htmlFor="partner-domain-input"
                    style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8', marginBottom: '6px' }}
                  >
                    Optional Partner Domain For Referral Attribution (UTM Source)
                  </label>
                  <input
                    id="partner-domain-input"
                    type="text"
                    value={partnerDomain}
                    onChange={(e) => setPartnerDomain(e.target.value)}
                    placeholder="example.com or your-club-name"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: '#06060c',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      color: '#f8fafc',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    Embed Snippet Format
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      { id: 'iframe', label: 'HTML5 Iframe' },
                      { id: 'sdk', label: '1-Line JS SDK' },
                      { id: 'react', label: 'React / Next.js' },
                      { id: 'oembed', label: 'OEmbed 1.0 URL' },
                      { id: 'markdown', label: 'Markdown / Substack' },
                      { id: 'bbcode', label: 'Forum BBCode' },
                    ].map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setEmbedFormat(fmt.id)}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '7px',
                          border: embedFormat === fmt.id ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
                          background: embedFormat === fmt.id ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                          color: embedFormat === fmt.id ? '#38bdf8' : '#cbd5e1',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { id: 'all', label: `All Widgets (${WIDGETS.length})` },
                  { id: 'equity', label: 'Equity & Preflop (6)' },
                  { id: 'tournament', label: 'Tournament & ICM (8)' },
                  { id: 'cash', label: 'Cash Game & Rake (5)' },
                  { id: 'bankroll', label: 'Bankroll, Tax & Home Game (4)' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      border: selectedCategory === cat.id ? '1px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: selectedCategory === cat.id ? 'rgba(96, 165, 250, 0.16)' : 'transparent',
                      color: selectedCategory === cat.id ? '#93c5fd' : '#94a3b8',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {visibleWidgets.map((widget) => {
                const code = getEmbedCode(widget);
                const isCopied = copiedId === widget.id;

                return (
                  <article
                    key={widget.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '28px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>{widget.title}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setPreviewWidgetId(previewWidgetId === widget.id ? null : widget.id)}
                          style={{
                            padding: '5px 11px',
                            borderRadius: '6px',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            background: previewWidgetId === widget.id ? 'rgba(56, 189, 248, 0.22)' : 'rgba(56, 189, 248, 0.08)',
                            color: '#7dd3fc',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {previewWidgetId === widget.id ? 'Hide Inline Preview' : 'Test Inline Preview'}
                        </button>
                        <Link
                          href={widget.landerUrl}
                          target="_blank"
                          rel="noopener"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', color: '#60a5fa', textDecoration: 'none' }}
                        >
                          Open Full Tool <ExternalLink size={14} />
                        </Link>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                      {widget.description}
                    </p>

                    {previewWidgetId === widget.id && (
                      <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(56, 189, 248, 0.28)', background: '#050811' }}>
                        <iframe
                          src={widget.embedUrl}
                          width="100%"
                          height={widget.height}
                          style={{ border: 0, display: 'block', maxWidth: '100%' }}
                          loading="lazy"
                          title={`Live Preview: ${widget.title}`}
                        />
                      </div>
                    )}

                    <div style={{ position: 'relative' }}>
                      <textarea
                        readOnly
                        value={code}
                        aria-label={`HTML Embed Code for ${widget.title}`}
                        style={{
                          width: '100%',
                          height: '90px',
                          background: '#06060c',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          padding: '12px',
                          color: '#a5b4fc',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(widget)}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isCopied ? '#059669' : '#2563eb',
                          color: '#fff',
                          border: 0,
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy Embed Code
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Verified Partner & Venue SVG Backlink Badges */}
          <section aria-labelledby="partner-badges-heading" style={{ marginTop: '48px' }}>
            <h2 id="partner-badges-heading" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '12px' }}>
              Verified Partner, Venue & Media Attribution Badges
            </h2>
            <p style={{ fontSize: '0.96rem', color: 'rgba(255, 255, 255, 0.72)', lineHeight: 1.6, marginBottom: '24px' }}>
              Card Rooms, Club Operators, Strategy Bloggers, And Journalists Can Embed These Lightweight Dynamic SVG Badges On Their Websites, Footers, Or GitHub Readmes With Direct Canonical Attribution.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {PARTNER_BADGES.map((badge) => {
                const badgeSnippet = `<a href="${badge.targetUrl}" target="_blank" rel="noopener" title="${badge.altText}"><img src="${badge.badgeUrl}" alt="${badge.altText}" height="28" /></a>`;
                const isBadgeCopied = copiedId === badge.id;
                return (
                  <article
                    key={badge.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(56, 189, 248, 0.18)',
                      borderRadius: '14px',
                      padding: '22px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{badge.title}</h3>
                      <img src={badge.badgeUrl} alt={badge.altText} height="28" style={{ display: 'block' }} />
                    </div>
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.72)', margin: '0 0 12px 0' }}>
                      {badge.description}
                    </p>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        readOnly
                        value={badgeSnippet}
                        aria-label={`HTML Badge Embed Code for ${badge.title}`}
                        style={{
                          width: '100%',
                          height: '64px',
                          background: '#06060c',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          padding: '10px',
                          color: '#7dd3fc',
                          fontFamily: 'monospace',
                          fontSize: '0.82rem',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(badgeSnippet);
                            setCopiedId(badge.id);
                            setTimeout(() => setCopiedId(null), 2500);
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isBadgeCopied ? '#059669' : '#0284c7',
                          color: '#fff',
                          border: 0,
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isBadgeCopied ? (
                          <>
                            <Check size={14} /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy Badge HTML
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Twitch, YouTube & Kick Streamer Chatbot Commands */}
          <section aria-labelledby="streamer-commands-heading" style={{ marginTop: '48px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
              <h2 id="streamer-commands-heading" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
                26 Twitch, YouTube &amp; Kick Streamer Chatbot Commands (Nightbot / StreamElements)
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { id: 'nightbot', label: 'Nightbot' },
                  { id: 'streamelements', label: 'StreamElements' },
                  { id: 'fossabot', label: 'Fossabot' },
                ].map((plat) => (
                  <button
                    key={plat.id}
                    type="button"
                    onClick={() => setBotPlatform(plat.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '7px',
                      border: botPlatform === plat.id ? '1px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.12)',
                      background: botPlatform === plat.id ? 'rgba(168, 85, 247, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                      color: botPlatform === plat.id ? '#e9d5ff' : '#94a3b8',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {plat.label}
                  </button>
                ))}
              </div>
            </div>
            <p style={{ fontSize: '0.96rem', color: 'rgba(255, 255, 255, 0.72)', lineHeight: 1.6, marginBottom: '24px' }}>
              Add All 26 Instant Live Poker Equity, Pot Odds, ICM Bubble Factors, Final Table Chop, Variance, Draw Outs, US Poker Tax, Staking Markup, Limper Isolation, Series Survival Guides, Flop Board Texture, Harrington M-Ratio, Straddle &amp; Bomb Pot EV, Satellite Bubble Factor, Bad Beat Jackpot EV, Seat Position Ranges, Poker Math Formulas, GTO IQ Test, PLO Max Bet Math, And Official TDA Floor Rulings Commands Directly To Your Stream Chat. Viewers Type The Command In Chat And Receive An Instant Sub-380-Character Mathematical Answer With Canonical Attribution.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '16px' }}>
              {STREAM_CHAT_COMMANDS.map((cmdItem) => {
                const isCmdCopied = copiedId === cmdItem.id;
                const botSyntax = getBotSyntax(cmdItem);
                return (
                  <article
                    key={cmdItem.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(168, 85, 247, 0.24)',
                      borderRadius: '14px',
                      padding: '20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'rgba(168, 85, 247, 0.16)',
                          border: '1px solid rgba(168, 85, 247, 0.4)',
                          color: '#d8b4fe',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                        }}
                      >
                        {cmdItem.command}
                      </span>
                      <Link
                        href={cmdItem.toolUrl}
                        style={{ fontSize: '0.8rem', color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Open Tool &rarr;
                      </Link>
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 10px 0', color: '#f8fafc' }}>
                      {cmdItem.title}
                    </h3>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        readOnly
                        value={botSyntax}
                        aria-label={`Nightbot Command Syntax for ${cmdItem.command}`}
                        style={{
                          width: '100%',
                          height: '58px',
                          background: '#06060c',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          color: '#e9d5ff',
                          fontFamily: 'monospace',
                          fontSize: '0.78rem',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(botSyntax);
                            setCopiedId(cmdItem.id);
                            setTimeout(() => setCopiedId(null), 2500);
                          }
                        }}
                        style={{
                          marginTop: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isCmdCopied ? '#059669' : '#7e22ce',
                          color: '#fff',
                          border: 0,
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isCmdCopied ? (
                          <>
                            <Check size={13} /> Copied Nightbot Syntax!
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy Nightbot Command
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* 12-Item Dead-Tool Replacement & Webmaster Migration Matrix */}
          <section aria-labelledby="dead-tool-replacements-heading" style={{ marginTop: '48px' }}>
            <h2 id="dead-tool-replacements-heading" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '12px' }}>
              Legacy &amp; Discontinued Poker Tool Replacement Matrix (12 Drop-In Upgrades)
            </h2>
            <p style={{ fontSize: '0.96rem', color: 'rgba(255, 255, 255, 0.72)', lineHeight: 1.6, marginBottom: '24px' }}>
              Maintaining A Poker Strategy Guide, University Syllabus, Or Forum Resource Thread With Broken Links To Discontinued Software? Replace Retired Tools With Free, Zero-Install Browser Calculators And Copy The Clean HTML Anchor Snippet Below.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {DEAD_TOOL_REPLACEMENTS.map((item) => {
                const anchorHtml = `<a href="${item.replacementUrl}" target="_blank" rel="noopener">${item.recommendedAnchorText}</a>`;
                const copyKey = `dead-${item.id}`;
                const isDeadCopied = copiedId === copyKey;
                return (
                  <article
                    key={item.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(251, 191, 36, 0.22)',
                      borderRadius: '14px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(251, 191, 36, 0.14)',
                            color: '#fcd34d',
                          }}
                        >
                          {item.category}
                        </span>
                        <Link
                          href={item.replacementUrl}
                          style={{ fontSize: '0.8rem', color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}
                        >
                          Live Tool &rarr;
                        </Link>
                      </div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
                        {item.legacyToolName}
                      </h3>
                      <p style={{ fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.65)', margin: 0, lineHeight: 1.5 }}>
                        {item.status}
                      </p>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(anchorHtml);
                            setCopiedId(copyKey);
                            setTimeout(() => setCopiedId(null), 2500);
                          }
                        }}
                        style={{
                          width: '100%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          background: isDeadCopied ? '#059669' : 'rgba(251, 191, 36, 0.16)',
                          border: '1px solid rgba(251, 191, 36, 0.4)',
                          color: isDeadCopied ? '#fff' : '#fde68a',
                          borderRadius: '6px',
                          padding: '7px 12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isDeadCopied ? (
                          <>
                            <Check size={13} /> Copied Replacement Link!
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy Replacement HTML Link
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Open Datasets, JSON Feed & Syndication APIs */}
          <section
            aria-labelledby="syndication-apis-heading"
            style={{
              marginTop: '48px',
              padding: '24px',
              background: 'rgba(16, 185, 129, 0.04)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '14px',
            }}
          >
            <h2 id="syndication-apis-heading" style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 10px 0', color: '#34d399' }}>
              Open Datasets, JSON Feed 1.1 & Multilingual Syndication APIs
            </h2>
            <p style={{ fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.78)', lineHeight: 1.55, margin: '0 0 16px 0' }}>
              Developers, Academic Researchers, And International Poker Portals Can Ingest Smarter.Poker Citations, Structured Datasets, Zenodo/DataCite Metadata, And Localized Embeds In 7 Languages Directly Via REST Or MCP:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <a
                href="/api/datasets/catalog"
                style={{
                  padding: '8px 14px',
                  background: '#064e3b',
                  border: '1px solid #10b981',
                  borderRadius: '6px',
                  color: '#ecfdf5',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Open Dataset Catalog API
              </a>
              <a
                href="/api/datasets/catalog?format=cff"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  color: '#bae6fd',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Academic Citation File Format Manifest
              </a>
              <a
                href="/api/feeds/research"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  color: '#bae6fd',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Research & Calculator JSON Feed 1.1
              </a>
              <a
                href="/api/seo/outreach-generator"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #a855f7',
                  borderRadius: '6px',
                  color: '#e9d5ff',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Multilingual Outreach & Snippet Generator API
              </a>
              <a
                href="/api/ai/backlink-opportunities"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #f59e0b',
                  borderRadius: '6px',
                  color: '#fde68a',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                AI Backlink & Citation Catalog API
              </a>
              <a
                href="/api/seo/oembed?mode=catalog"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  color: '#bae6fd',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                OEmbed 1.0 & Partner Manifest API
              </a>
              <a
                href="/embed-sdk.js"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #10b981',
                  borderRadius: '6px',
                  color: '#a7f3d0',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                One-Line JS Widget SDK
              </a>
            </div>
          </section>
          {/* Frequently Asked Questions */}
          <section
            aria-label="Frequently Asked Questions"
            style={{
              marginTop: '40px',
              padding: '24px',
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '12px',
            }}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#f0f6fc',
                margin: '0 0 16px 0',
              }}
            >
              Frequently Asked Questions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {EMBEDS_FAQS.map((faq, idx) => (
                <details
                  key={idx}
                  style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#f0f6fc',
                  }}
                >
                  <summary
                    style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      color: '#58a6ff',
                      outline: 'none',
                    }}
                  >
                    {faq.question}
                  </summary>
                  <p
                    style={{
                      margin: '10px 0 0',
                      fontSize: '0.88rem',
                      lineHeight: 1.6,
                      color: '#8b949e',
                    }}
                  >
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>

          {/* Related Free Poker Ecosystem Hubs */}
          <section
            aria-label="Related Free Poker Tools And Freerolls"
            style={{
              marginTop: '40px',
              padding: '24px',
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '12px',
            }}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#f0f6fc',
                margin: '0 0 16px 0',
              }}
            >
              Related Free Poker Ecosystem Hubs
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <Link
                href="/tools"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '6px',
                  color: '#38bdf8',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                All 34 Free Poker Calculators
              </Link>
              <Link
                href="/compare"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(88, 166, 255, 0.12)',
                  border: '1px solid rgba(88, 166, 255, 0.3)',
                  borderRadius: '6px',
                  color: '#58a6ff',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Compare Free Poker Tools Vs. Paid Software
              </Link>
              <Link
                href="/freerolls"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(0, 230, 118, 0.12)',
                  border: '1px solid rgba(0, 230, 118, 0.3)',
                  borderRadius: '6px',
                  color: '#00e676',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Play Daily $2,000 Guaranteed Freerolls
              </Link>
              <Link
                href="/rules"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                30 Official TDA &amp; Cash Rules
              </Link>
              <Link
                href="/games"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                15 Poker Variants &amp; Mixed Games
              </Link>
              <Link
                href="/learn/poker-hand-rankings"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Poker Hand Rankings Cheat Sheet
              </Link>
              <Link
                href="/poker-rooms/guides"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                12 US Regional Poker Market Guides
              </Link>
              <Link
                href="/research"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                15 Empirical Poker Studies
              </Link>
              <Link
                href="/tools/poker-odds-calculator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Poker Odds Calculator
              </Link>
              <Link
                href="/tools/icm-calculator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Tournament ICM Calculator
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
