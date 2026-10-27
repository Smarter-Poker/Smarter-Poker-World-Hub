import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderVenueMarkdown,
  renderSeriesMarkdown,
  renderPokerOddsCalculatorMarkdown,
  renderPreflopRangesMarkdown,
  renderIcmCalculatorMarkdown,
  renderAboutPlatformMarkdown,
} from '../src/lib/seo/markdownIngestion.mjs';

test('renderVenueMarkdown outputs clean token-efficient Markdown', () => {
  const venue = {
    id: 2499,
    name: 'Bellagio Poker Room',
    venue_type: 'casino',
    address: '3600 S. Las Vegas Blvd.',
    city: 'Las Vegas',
    state: 'NV',
    phone: '(702) 693-7291',
    website: 'https://www.bellagio.com',
    hours: '24 Hours',
    poker_tables: 40,
    games_offered: 'Hold\'em, Omaha, Mixed',
    stakes_cash: '1/3 to 100/200',
    has_tournaments: true,
    daily_tournaments: [
      {
        schedules: [
          { day: 'Friday', time: '11:00 AM', name: 'No Limit Hold\'em', buyin: 150, guarantee: 10000 },
        ],
      },
    ],
  };

  const md = renderVenueMarkdown(venue, { canonicalUrl: 'https://smarter.poker/hub/venues/2499' });
  assert.ok(md.includes('# Bellagio Poker Room'));
  assert.ok(md.includes('https://smarter.poker/hub/venues/2499'));
  assert.ok(md.includes('3600 S. Las Vegas Blvd.'));
  assert.ok(md.includes('Las Vegas, NV'));
  assert.ok(md.includes('40'));
  assert.ok(md.includes('24 Hours'));
  assert.ok(md.includes('Friday 11:00 AM'));
  assert.ok(md.includes('Frequently Asked Questions'));
  assert.ok(md.includes('Where Is Bellagio Poker Room Located?'));
});

test('renderSeriesMarkdown outputs clean structured tournament series Markdown', () => {
  const series = {
    id: 468,
    name: 'DeepStack Showdown (March) 2026',
    venue_name: 'Venetian Las Vegas',
    main_event_buyin: 1600,
    total_guaranteed: 500000,
    start_date: '2026-02-25',
    end_date: '2026-03-31',
  };

  const md = renderSeriesMarkdown(series, {
    venueName: 'Venetian Las Vegas',
    dateRange: 'February 25 - March 31, 2026',
    canonicalUrl: 'https://smarter.poker/hub/series/468',
  });

  assert.ok(md.includes('# DeepStack Showdown (March) 2026'));
  assert.ok(md.includes('Venetian Las Vegas'));
  assert.ok(md.includes('$1,600'));
  assert.ok(md.includes('$500,000'));
  assert.ok(md.includes('February 25 - March 31, 2026'));
  assert.ok(md.includes('https://smarter.poker/hub/series/468'));
  assert.ok(md.includes('Frequently Asked Questions'));
});

test('renderPokerOddsCalculatorMarkdown outputs clean structured odds calculator Markdown', () => {
  const md = renderPokerOddsCalculatorMarkdown();
  assert.ok(md.includes('# Free Online Poker Odds Calculator & Equity Simulator'));
  assert.ok(md.includes('https://smarter.poker/tools/poker-odds-calculator'));
  assert.ok(md.includes('Texas Hold\'em'));
  assert.ok(md.includes('Pot-Limit Omaha'));
  assert.ok(md.includes('Monte Carlo'));
  assert.ok(md.includes('Frequently Asked Questions'));
  assert.ok(!md.includes('—'), 'Must not contain em dashes');
});

test('renderPreflopRangesMarkdown outputs clean structured range matrix Markdown', () => {
  const md = renderPreflopRangesMarkdown({ position: 'BTN' });
  assert.ok(md.includes('# GTO Preflop Range Matrix: BTN Opening Strategy'));
  assert.ok(md.includes('https://smarter.poker/tools/preflop-ranges/btn'));
  assert.ok(md.includes('13x13 Preflop Range Matrix'));
  assert.ok(md.includes('Frequently Asked Questions'));
  assert.ok(!md.includes('—'), 'Must not contain em dashes');
});

test('renderIcmCalculatorMarkdown outputs clean structured ICM calculator Markdown', () => {
  const md = renderIcmCalculatorMarkdown();
  assert.ok(md.includes('# Tournament ICM Calculator & Final Table Equity Engine'));
  assert.ok(md.includes('https://smarter.poker/tools/icm-calculator'));
  assert.ok(md.includes('Malmuth-Harville Independent Chip Model'));
  assert.ok(md.includes('Frequently Asked Questions'));
  assert.ok(!md.includes('—'), 'Must not contain em dashes');
});

test('renderAboutPlatformMarkdown outputs clean structured about platform Markdown', () => {
  const md = renderAboutPlatformMarkdown();
  assert.ok(md.includes('# About Smarter.Poker: Free Online Poker Platform'));
  assert.ok(md.includes('https://smarter.poker/about'));
  assert.ok(md.includes('Smarter Software Inc.'));
  assert.ok(md.includes('No Real-Money Gambling'));
  assert.ok(!md.includes('—'), 'Must not contain em dashes');
});
