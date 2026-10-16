import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getWeekendDates } from '../src/lib/poker-near-me/weekendSchedule.mjs';
import { buildDailyTournamentSchema } from '../src/lib/poker-near-me/structuredData.js';

describe('Weekend Schedule & Intent Landing Page Helpers', () => {
  it('correctly calculates Friday-Sunday weekend dates from a weekday anchor', () => {
    // Thursday 2026-10-15 should yield Friday 2026-10-16 through Sunday 2026-10-18
    const thursdayDate = new Date('2026-10-15T15:00:00Z');
    const weekend = getWeekendDates(thursdayDate, 'America/New_York');

    assert.equal(weekend.friday, '2026-10-16');
    assert.equal(weekend.saturday, '2026-10-17');
    assert.equal(weekend.sunday, '2026-10-18');
    assert.deepEqual(weekend.dates, ['2026-10-16', '2026-10-17', '2026-10-18']);
    assert.equal(weekend.isCurrentlyWeekend, false);
    assert.equal(weekend.weekendRangeLabel, 'Oct 16 – 18, 2026');
  });

  it('correctly identifies weekend active state when reference date is Saturday', () => {
    const saturdayDate = new Date('2026-10-17T18:00:00Z');
    const weekend = getWeekendDates(saturdayDate, 'America/New_York');

    assert.equal(weekend.friday, '2026-10-16');
    assert.equal(weekend.saturday, '2026-10-17');
    assert.equal(weekend.sunday, '2026-10-18');
    assert.equal(weekend.isCurrentlyWeekend, true);
    assert.equal(weekend.referenceDay, 'Saturday');
  });

  it('correctly rolls over to the next weekend when reference date is Monday', () => {
    const mondayDate = new Date('2026-10-19T14:00:00Z');
    const weekend = getWeekendDates(mondayDate, 'America/New_York');

    assert.equal(weekend.friday, '2026-10-23');
    assert.equal(weekend.saturday, '2026-10-24');
    assert.equal(weekend.sunday, '2026-10-25');
    assert.equal(weekend.isCurrentlyWeekend, false);
    assert.equal(weekend.weekendRangeLabel, 'Oct 23 – 25, 2026');
  });

  it('buildDailyTournamentSchema supports custom canonical and page metadata', () => {
    const sampleTournaments = [
      {
        id: 'tourn-1',
        venue_id: 101,
        venue_name: 'Bellagio Poker Room',
        tournament_name: 'Saturday Deepstack',
        buy_in: 400,
        city: 'Las Vegas',
        state: 'NV',
      },
      {
        id: 'tourn-2',
        venue_id: 102,
        venue_name: 'Aria Poker Room',
        tournament_name: 'Sunday High Roller',
        buy_in: 1000,
        city: 'Las Vegas',
        state: 'NV',
      },
    ];

    const schema = buildDailyTournamentSchema(
      sampleTournaments,
      '2026-10-16T00:00:00Z',
      {
        canonical: 'https://smarter.poker/hub/tournaments/this-weekend',
        pageName: 'Poker Tournaments This Weekend',
        pageDescription: 'Browse weekend poker tournaments.',
      }
    );

    assert.equal(schema['@type'], 'CollectionPage');
    assert.equal(schema.url, 'https://smarter.poker/hub/tournaments/this-weekend');
    assert.equal(schema.name, 'Poker Tournaments This Weekend');
    assert.equal(schema.description, 'Browse weekend poker tournaments.');
    assert.equal(schema.mainEntity['@type'], 'ItemList');
    assert.equal(schema.mainEntity.numberOfItems, 2);
    assert.equal(schema.mainEntity.itemListElement.length, 2);

    const firstItem = schema.mainEntity.itemListElement[0];
    assert.equal(firstItem['@type'], 'ListItem');
    assert.equal(firstItem.position, 1);
    assert.equal(firstItem.item['@type'], 'SportsEvent');
    assert.equal(firstItem.item.name, 'Saturday Deepstack');
    assert.equal(firstItem.item.location.name, 'Bellagio Poker Room');
    assert.equal(firstItem.item.offers.price, 400);
  });
});
