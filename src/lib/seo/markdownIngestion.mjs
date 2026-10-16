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
  const tournaments = venue.has_tournaments ? 'Yes — scheduled daily/weekly tournaments' : 'No regular scheduled tournaments';
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
