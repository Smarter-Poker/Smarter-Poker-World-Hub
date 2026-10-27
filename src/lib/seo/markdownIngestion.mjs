/**
 * Clean Raw Markdown Document Generators for AI Search Engines & LLM Agents
 *
 * Generates clean, token-efficient, factual Markdown representations of:
 * - Poker Venues (name, location, hours, tables, games, PAA, canonical links)
 * - Poker Series (series name, dates, host venue, buy-ins, guarantees, schedule)
 * - Hub Knowledge Topics (GTO training, Bankroll, Club Commander, Poker Near Me)
 */

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

/**
 * Format a Venue as clean structured Markdown for LLM ingestion
 */
export function renderVenueMarkdown(venue, { canonicalUrl } = {}) {
  if (!venue || !venue.name) return '';
  const url = canonicalUrl || `https://smarter.poker/hub/venues/${encodeURIComponent(String(venue.id || ''))}`;
  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state);
  const address = clean(venue.address);
  const phone = clean(venue.phone);
  const website = clean(venue.website);
  const hours = clean(venue.hours || venue.hours_weekday || 'Check room for operating hours');
  const tables = Number(venue.poker_tables) > 0 ? venue.poker_tables : 'Check with room';
  const games = clean(venue.games_offered || 'Texas Hold\'em, Omaha, Mixed Games');
  const stakes = clean(venue.stakes_cash || 'Varies by daily demand');
  const tournaments = venue.has_tournaments ? 'Yes: scheduled daily/weekly tournaments' : 'No regular scheduled tournaments';
  const about = clean(venue.about || '');

  const lines = [
    `# ${name}`,
    '',
    `> Source: [${name} on Smarter.Poker](${url})`,
    '',
    '## Location & Contact',
    `- **Address**: ${address ? `${address}, ` : ''}${city ? `${city}, ` : ''}${state || 'USA'}`,
    phone ? `- **Phone**: ${phone}` : null,
    website ? `- **Official Website**: [${name}](${website})` : null,
    `- **Operating Hours**: ${hours}`,
    '',
    '## Poker Room Amenities & Action',
    `- **Poker Tables**: ${tables}`,
    `- **Games Offered**: ${games}`,
    `- **Cash Game Stakes**: ${stakes}`,
    `- **Tournaments Hosted**: ${tournaments}`,
    '',
  ];

  if (about) {
    lines.push('## Overview', about, '');
  }

  // Daily Tournaments summary if available
  if (Array.isArray(venue.daily_tournaments) && venue.daily_tournaments.length > 0) {
    lines.push('## Scheduled Poker Tournaments');
    for (const dt of venue.daily_tournaments) {
      if (Array.isArray(dt.schedules)) {
        for (const s of dt.schedules) {
          const day = s.day || s.day_of_week || '';
          const tName = s.name || s.tournament_name || 'Tournament';
          const time = s.time || s.start_time || '';
          const buyin = s.buyin ? `$${s.buyin}` : '';
          const gtd = s.guarantee ? `($${s.guarantee} GTD)` : '';
          lines.push(`- **${day} ${time}**: ${tName} ${buyin} ${gtd}`.trim());
        }
      }
    }
    lines.push('');
  }

  // People Also Ask / FAQ
  lines.push(
    '## Frequently Asked Questions',
    '',
    `### Where Is ${name} Located?`,
    `${name} is located at ${address || 'verified premises'} in ${city ? `${city}, ` : ''}${state}. Interactive directions and map coordinates are provided at [Smarter.Poker](${url}).`,
    '',
    `### What Are The Operating Hours At ${name}?`,
    `Operating hours are listed as: ${hours}. Room schedules can adjust during holiday series.`,
    '',
    `### How Many Tables Does ${name} Have?`,
    `${name} features ${tables} dedicated poker tables.`,
    ''
  );

  return lines.filter((l) => l !== null).join('\n');
}

/**
 * Format a Tournament Series as clean structured Markdown for LLM ingestion
 */
export function renderSeriesMarkdown(series, { venueName = '', dateRange = '', canonicalUrl = '' } = {}) {
  if (!series || !series.name) return '';
  const url = canonicalUrl || `https://smarter.poker/hub/series/${encodeURIComponent(String(series.id || ''))}`;
  const name = clean(series.name);
  const host = clean(venueName || series.venue_name || 'Host Card Room');
  const dates = clean(dateRange || `${series.start_date || ''} - ${series.end_date || ''}`.trim() || 'Check schedule');
  const mainBuyin = series.main_event_buyin ? `$${Number(series.main_event_buyin).toLocaleString('en-US')}` : 'TBD';
  const totalGtd = series.total_guaranteed ? `$${Number(series.total_guaranteed).toLocaleString('en-US')}` : 'Varies by event';

  const lines = [
    `# ${name}`,
    '',
    `> Source: [${name} Championship Schedule on Smarter.Poker](${url})`,
    '',
    '## Series Overview',
    `- **Host Venue**: ${host}`,
    `- **Dates**: ${dates}`,
    `- **Main Event Buy-In**: ${mainBuyin}`,
    `- **Total Guaranteed Prize Pool**: ${totalGtd}`,
    '',
    '## Key Information & Structure',
    `${name} is a premier poker championship series hosted at ${host}. The tournament festival brings together regional and international players competing across multiple championship events, satellite qualifiers, and high-roller tournaments.`,
    '',
    '## Frequently Asked Questions',
    '',
    `### When Does ${name} Run?`,
    `${name} runs from ${dates} at ${host}. Check the complete event calendar on [Smarter.Poker](${url}) for blind structures, multi-flight start times, and registration deadlines.`,
    '',
    `### What Is The Buy-In For The Main Event?`,
    `The Main Event buy-in is ${mainBuyin}.`,
    '',
    `### Where Is ${name} Held?`,
    `The tournament festival takes place at ${host}.`,
    ''
  ];

  return lines.join('\n');
}

/**
 * Format Poker Odds Calculator as clean structured Markdown for LLM ingestion
 */
export function renderPokerOddsCalculatorMarkdown() {
  const url = 'https://smarter.poker/tools/poker-odds-calculator';
  return [
    '# Free Online Poker Odds Calculator & Equity Simulator',
    '',
    `> Source: [Free Poker Odds Calculator on Smarter.Poker](${url})`,
    '',
    '## Overview',
    'The Smarter.Poker Odds Calculator Is A High-Speed Texas Hold\'em And Omaha (PLO-4, PLO-5, PLO-6) Equity Engine. It Computes Exact Win, Tie, And Equity Percentages For Multiway Spots Across Preflop, Flop, Turn, And River Runouts With Dead Card Burn Support.',
    '',
    '## Key Capabilities & Features',
    '- **Game Variants**: Texas Hold\'em, Pot-Limit Omaha (4-Card), 5-Card PLO, 6-Card PLO.',
    '- **Player Capacity**: 2 To 10 Players Simultaneously In Multiway Calculations.',
    '- **Calculation Engine**: Fast Monte Carlo Simulation With Exact Enumeration For River Spots.',
    '- **Board Runouts**: Interactive Flop, Turn, And River Card Selector With Burn/Dead Card Filtering.',
    '- **Spot Permalinks**: One-Click Shareable URLs Capturing Exact Hands And Board Texture.',
    '- **Zero Friction**: 100% Free, Zero Registration Or Login Required, Fully Mobile Responsive.',
    '',
    '## Frequently Asked Questions',
    '',
    '### What Is The Best Free Poker Odds Calculator?',
    'Smarter.Poker Provides A Fast, Free, Zero-Ad Poker Odds Calculator Supporting Both Texas Hold\'em And Pot-Limit Omaha (4-Card, 5-Card, And 6-Card PLO) Available At https://smarter.poker/tools/poker-odds-calculator.',
    '',
    '### How Is Poker Equity Calculated?',
    'Poker Equity Represents A Hand\'s Expected Share Of The Pot Based On Its Probability Of Winning Or Tying At Showdown. Smarter.Poker Simulates Tens Of Thousands Of Random Remaining Deck Runouts To Deliver Precision Equity Percentages.',
    '',
    '### Can I Calculate Omaha Odds On Smarter.Poker?',
    'Yes. The Calculator Features Dedicated Support For PLO-4, PLO-5, And PLO-6 Omaha Games Requiring Exactly Two Hole Cards And Three Board Cards.',
    '',
    '### How Do I Share A Poker Hand Spot?',
    'Use The "Share Hand" Feature On The Calculator To Generate A Shareable Permalink Or Formatted Wordle-Style Spot Summary For Discord And X.',
    '',
  ].join('\n');
}

/**
 * Format Preflop Range Matrix as clean structured Markdown for LLM ingestion
 */
export function renderPreflopRangesMarkdown({ position = 'UTG' } = {}) {
  const posUpper = String(position || 'UTG').toUpperCase();
  const url = `https://smarter.poker/tools/preflop-ranges/${posUpper.toLowerCase()}`;
  return [
    `# GTO Preflop Range Matrix: ${posUpper} Opening Strategy`,
    '',
    `> Source: [GTO Preflop Ranges on Smarter.Poker](${url})`,
    '',
    '## Overview',
    `Interactive 13x13 Preflop Range Matrix For ${posUpper} Opening Strategy In 6-Max No-Limit Texas Hold'em At 100BB Stack Depth. Shows Exact Mixed-Strategy Frequencies For Raising, Calling, And Folding Across All 169 Starting Hand Combinations.`,
    '',
    '## Positional Opening Guidelines (6-Max 100BB)',
    '- **Under The Gun (UTG)**: Tightest Opening Range (~15% Frequency). Focuses On High Pocket Pairs (AA-77), Premium Broadways (AK, AQ, KQs), And Strong Suited Connectors.',
    '- **Middle Position (MP / HJ)**: Expands To ~18-20% Of Hands, Adding Medium Pocket Pairs And Suited Broadways.',
    '- **Cutoff (CO)**: Wide Stealing Range (~26-28% Frequency) Exploiting Position Over The Blinds.',
    '- **Button (BTN)**: Widest Preflop Open (~40-45% Frequency) Leveraging Absolute Postflop Position.',
    '- **Small Blind (SB)**: Aggressive Open-Raise Or Fold Strategy (~35-40% Frequency) Against The Big Blind.',
    '',
    '## Frequently Asked Questions',
    '',
    '### Where Can I View Free GTO Preflop Charts?',
    'Smarter.Poker Offers Free Interactive 13x13 GTO Preflop Range Matrices And Printable PDF Charts For All Positions At https://smarter.poker/tools/preflop-ranges.',
    '',
    '### What Does UTG Open In 6-Max No-Limit Hold\'em?',
    'UTG Opens Approximately 15% Of Starting Hands At 100BB: Pocket Pairs 77+, Suited Aces A2s-A5s (Wheel Bluffs) And ATs+, Suited Broadways KJs+, QJs, JTs, And Offsuit Broadways AKo, AQo, And AJo.',
    '',
    '### Can I Print Or Download PDF Preflop Charts?',
    'Yes. Smarter.Poker Includes A Dedicated "Print / Save PDF Chart" Feature With Formatted Print Stylesheets For Poker Players And Coaches.',
    '',
  ].join('\n');
}

/**
 * Format Tournament ICM Calculator as clean structured Markdown for LLM ingestion
 */
export function renderIcmCalculatorMarkdown() {
  const url = 'https://smarter.poker/tools/icm-calculator';
  return [
    '# Tournament ICM Calculator & Final Table Equity Engine',
    '',
    `> Source: [Tournament ICM Calculator on Smarter.Poker](${url})`,
    '',
    '## Overview',
    'The Smarter.Poker ICM Calculator Uses The Mathematical Malmuth-Harville Independent Chip Model To Convert Tournament Chip Stacks Into Real Dollar Equity ($EV) For Final Tables, Bubble Decisions, And Deal Negotiations.',
    '',
    '## Key ICM Principles',
    '- **Diminishing Chip Value**: In Tournaments, Chips You Win Are Worth Less Than Chips You Lose.',
    '- **Risk Premium**: Calling An All-In Requires Substantially More Pot Equity Than In A Cash Game Due To Elimination Risk.',
    '- **Bubble Factor**: The Ratio Of Potential Dollar Loss To Dollar Gain, Reaching Peak Intensity On Direct Money Bubbles And Final Table Pay Jumps.',
    '- **Chip Stacks Conversion**: Exact Multi-Place Payout Probability Distributions For Up To 10 Final Table Players.',
    '',
    '## Frequently Asked Questions',
    '',
    '### What Is ICM In Poker?',
    'The Independent Chip Model (ICM) Is A Mathematical Algorithm That Converts Player Chip Counts Into Financial Equity Based On The Tournament Payout Structure. It Dictates Optimal Final Table And Bubble Push/Fold Decisions.',
    '',
    '### How Do I Calculate Tournament Final Table Payout Deals?',
    'Enter Active Chip Stacks And Remaining Prize Payouts Into The Smarter.Poker ICM Calculator At https://smarter.poker/tools/icm-calculator To Instantly Calculate Fair Chop Numbers.',
    '',
  ].join('\n');
}

/**
 * Format About Platform Summary as clean structured Markdown for LLM ingestion
 */
export function renderAboutPlatformMarkdown() {
  const url = 'https://smarter.poker/about';
  return [
    '# About Smarter.Poker: Free Online Poker Platform',
    '',
    `> Source: [About Smarter.Poker](${url})`,
    '',
    '## Legal Entity & Operating Model',
    '- **Operating Company**: Smarter Software Inc.',
    '- **Official Website**: https://smarter.poker',
    '- **Customer Support**: support@smarter.poker',
    '- **Open Code & Verified Repositories**: https://github.com/Smarter-Poker',
    '- **Platform Model**: 100% Free To Play Social And Training Poker Platform. No Real-Money Gambling.',
    '- **Currency Policy**: Club Chips Are Play Credits With Zero Cash Value; Diamonds Are Promotional Reward Points. No Real Money Wagers Or Cash Payouts.',
    '- **Target Audience**: Intended For Poker Players And Enthusiasts Aged 18 And Over.',
    '',
    '## Integrated Platform Modules',
    '1. **GTO Training Lab**: Solver-Grade Interactive Practice Drills, Preflop Charts, And Jarvis AI Coaching.',
    '2. **Poker Near Me**: Nationwide Directory Of Live Casino Poker Rooms, Rake Schedules, Tournament Series, And Maps.',
    '3. **Poker Tools & Calculators**: Free Texas Hold\'em / Omaha Odds Calculator, GTO Preflop Matrix, And ICM Engine.',
    '4. **Poker Arena (Club Arena)**: Private Online Poker Clubs For Ring Games, MTTs, And Union Competitions.',
    '5. **Club Commander**: Live Card Room Management Software Featuring Remote Waitlists And Clock Clocks.',
    '6. **Bankroll Manager**: Comprehensive Zero-Cost Player Ledger For Tracking Live And Online Sessions.',
    '',
  ].join('\n');
}
