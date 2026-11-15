import test from 'node:test';
import assert from 'node:assert/strict';
import { activePokerSeats } from '../src/components/ui/activePokerSeats.mjs';
const seat = { id: 'occupancy', table_id: 'table', left_at: null, tables: { name: 'PLO 1/2', lifecycle: 'running' } };
test('returns live cash or tournament chairs including an all-in zero stack', () => {
  assert.deepEqual(activePokerSeats([{ ...seat, stack: 0 }], []), [{ id: 'table', name: 'PLO 1/2', href: '/hub/club-arena/table/table' }]);
});
test('returns the authenticated Lightning room rather than its physical anchor', () => {
  assert.equal(activePokerSeats([seat], [{ id: 'room', anchor_seat_id: 'occupancy', state: 'playing', exited_at: null }])[0].id, 'room');
  assert.equal(activePokerSeats([seat], [{ id: 'old', anchor_seat_id: 'occupancy', state: 'closed' }])[0].id, 'table');
});
test('never resurrects a left or closed seat, and deduplicates room links', () => {
  assert.deepEqual(activePokerSeats([{ ...seat, left_at: 'now' }, { ...seat, tables: { lifecycle: 'closed' } }], []), []);
  assert.equal(activePokerSeats([seat, seat], []).length, 1);
});
