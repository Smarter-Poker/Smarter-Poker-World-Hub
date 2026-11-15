import test from 'node:test';
import assert from 'node:assert/strict';
import { activePokerSeats } from '../src/components/ui/activePokerSeats.mjs';
const seat = { id: 'occupancy', table_id: 'table', left_at: null, tables: { name: 'PLO 1/2', lifecycle: 'running' } };
test('returns live cash or tournament chairs including an all-in zero stack', () => {
  assert.deepEqual(activePokerSeats([{ ...seat, stack: 0 }], []), [{ id: 'table', name: 'PLO 1/2', href: '/hub/club-arena/table/table' }]);
});
test('returns the authenticated Lightning RPC room and suppresses its physical anchor', () => {
  const anchor = {...seat,tables:{...seat.tables,cluster_id:'cluster'}};
  assert.deepEqual(activePokerSeats([anchor], [{pool_session_id:'room',cluster_id:'cluster',name:'Lightning PLO'}]), [{id:'room',name:'Lightning PLO',href:'/hub/club-arena/table/room'}]);
  assert.equal(activePokerSeats([anchor], [])[0].id,'table');
});
test('the browser reads the authenticated RPC rather than the protected pool table', async () => {
  const {readFileSync} = await import('node:fs');
  const source=readFileSync('src/components/ui/ActivePokerSeatLink.jsx','utf8');
  assert.match(source,/rpc\('fn_lightning_my_sessions'\)/);
  assert.doesNotMatch(source,/from\('lightning_pool_session'\)/);
});
test('never resurrects a left or closed seat, and deduplicates room links', () => {
  assert.deepEqual(activePokerSeats([{ ...seat, left_at: 'now' }, { ...seat, tables: { lifecycle: 'closed' } }], []), []);
  assert.equal(activePokerSeats([seat, seat], []).length, 1);
});
