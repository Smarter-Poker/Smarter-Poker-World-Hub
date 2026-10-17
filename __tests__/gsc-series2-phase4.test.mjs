import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDailyTournamentSchema } from '../src/lib/poker-near-me/structuredData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('GSC / AEO Series 2 - Phase 4: Temporal Tournament Hubs & Event Carousel Schema', () => {
  it('buildDailyTournamentSchema formats ISO startDate with start_time correctly', () => {
    const sampleTournaments = [
      {
        id: 't-1',
        venue_id: 201,
        venue_name: 'Bellagio Poker Room',
        tournament_name: 'Friday $200 Warm-Up',
        buy_in: 200,
        start_time: '7:00 PM',
        event_date: '2026-10-16',
        city: 'Las Vegas',
        state: 'NV',
      },
      {
        id: 't-2',
        venue_id: 202,
        venue_name: 'Aria Poker Room',
        tournament_name: 'Saturday $400 Deepstack',
        buy_in: 400,
        start_time: '11:00 AM',
        event_date: '2026-10-17',
        city: 'Las Vegas',
        state: 'NV',
      },
      {
        id: 't-3',
        venue_id: 203,
        venue_name: 'Wynn Poker Room',
        tournament_name: 'Sunday Noon Special',
        buy_in: 300,
        event_date: '2026-10-18',
        city: 'Las Vegas',
        state: 'NV',
      },
    ];

    const schema = buildDailyTournamentSchema(
      sampleTournaments,
      '2026-10-16T12:00:00Z',
      {
        canonical: 'https://smarter.poker/hub/tournaments/this-weekend',
        pageName: 'Poker Tournaments This Weekend',
        pageDescription: 'Browse weekend poker tournaments.',
      }
    );

    assert.equal(schema['@type'], 'CollectionPage');
    assert.equal(schema.mainEntity['@type'], 'ItemList');
    assert.equal(schema.mainEntity.itemListElement.length, 3);

    const item1 = schema.mainEntity.itemListElement[0].item;
    assert.equal(item1['@type'], 'SportsEvent');
    assert.equal(item1.name, 'Friday $200 Warm-Up');
    assert.equal(item1.startDate, '2026-10-16T19:00:00');
    assert.equal(item1.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
    assert.equal(item1.eventStatus, 'https://schema.org/EventScheduled');
    assert.equal(item1.offers.price, 200);
    assert.equal(item1.offers.priceCurrency, 'USD');
    assert.equal(item1.offers.availability, 'https://schema.org/InStock');

    const item2 = schema.mainEntity.itemListElement[1].item;
    assert.equal(item2.startDate, '2026-10-17T11:00:00');
    assert.equal(item2.offers.price, 400);

    const item3 = schema.mainEntity.itemListElement[2].item;
    // Falls back to noon anchor when start_time is omitted
    assert.equal(item3.startDate, '2026-10-18T12:00:00');
    assert.equal(item3.offers.price, 300);
  });

  it('pages/hub/venues/[id].js embeds SportsEvent carousel into venue schema when daily_tournaments exist', () => {
    const venuePageContent = fs.readFileSync(path.join(rootDir, 'pages/hub/venues/[id].js'), 'utf8');
    assert.match(venuePageContent, /'@type':\s*'SportsEvent'/);
    assert.match(venuePageContent, /venueNode\.event\s*=\s*eventNodes/);
    assert.match(venuePageContent, /availability:\s*'https:\/\/schema\.org\/InStock'/);
    assert.match(venuePageContent, /eventAttendanceMode:\s*'https:\/\/schema\.org\/OfflineEventAttendanceMode'/);
  });

  it('pages/hub/tournaments/this-weekend.js includes Live This Weekend badges and hydration resilience', () => {
    const weekendPageContent = fs.readFileSync(path.join(rootDir, 'pages/hub/tournaments/this-weekend.js'), 'utf8');
    assert.match(weekendPageContent, /Live This Weekend/);
    assert.match(weekendPageContent, /Open Now/);
    assert.match(weekendPageContent, /initialTournaments/);
  });
});
