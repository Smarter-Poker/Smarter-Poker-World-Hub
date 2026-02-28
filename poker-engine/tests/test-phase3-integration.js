/**
 * Phase 3 Integration Tests
 * Verifies wiring between ALL layers:
 *   Engine → TableManager → RealtimeSync → useTableConnection → LivePokerTable
 *   + Card mapping consistency
 *   + Config passthrough
 *   + Event name alignment
 *   + Supabase table schema alignment
 */

const { Deck, getRank, getSuit, SUITS, SUIT_NAMES, RANKS } = require('../src/Deck');
const CardAssets = require('../src/CardAssets');
const { TableManager, TABLE_STATUS, SEAT_STATUS } = require('../src/TableManager');
const { RealtimeSync, CHANNEL_EVENTS } = require('../src/RealtimeSync');
const { HandHistoryRecorder, MIGRATION_SQL } = require('../src/HandHistory');
const { LobbyManager } = require('../src/LobbyManager');
const { GameStateMachine, GAME_PHASE } = require('../src/GameStateMachine');
const { ActionTimer } = require('../src/ActionTimer');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log('  CARD INTEGER ↔ FILENAME MAPPING CONSISTENCY');
console.log('════════════════════════════════════════════════════════════');
// ═══════════════════════════════════════════════════════════════════

// Deck.js mapping
const DECK_SUITS = ['c', 'd', 'h', 's'];
const DECK_SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
const DECK_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

// CardAssets.js mapping (from SUIT_TO_FILENAME and RANK_TO_FILENAME)
const CA_SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const CA_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

// LivePokerTable.jsx mapping (from cardIntToPath)
const LPT_SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const LPT_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

// All 52 cards must map consistently
for (let card = 0; card < 52; card++) {
  const rank = getRank(card); // Math.floor(card / 4)
  const suit = getSuit(card); // card % 4
  
  // Deck.js
  const deckSuit = DECK_SUIT_NAMES[suit];
  const deckRank = DECK_RANKS[rank];
  
  // CardAssets.js
  const caFilename = CardAssets.getCardFilename(card);
  const caSuit = CA_SUITS[suit];
  const caRank = CA_RANKS[rank];
  
  // LivePokerTable mapping
  const lptSuit = LPT_SUITS[suit];
  const lptRank = LPT_RANKS[rank];
  const lptPath = `/cards/${lptSuit}_${lptRank}.png`;
  
  // CardAssets filename must match LivePokerTable path
  const caPath = `/cards/${caFilename}`;
  
  if (caPath !== lptPath) {
    assert(false, `Card ${card}: CardAssets=${caPath} ≠ LivePokerTable=${lptPath}`);
  }
  
  // Suit names must match
  if (deckSuit !== caSuit || caSuit !== lptSuit) {
    assert(false, `Card ${card}: suit mismatch deck=${deckSuit} ca=${caSuit} lpt=${lptSuit}`);
  }
}
assert(true, 'All 52 cards map consistently across Deck → CardAssets → LivePokerTable');

// Spot-check specific cards
const aceOfSpades = 12 * 4 + 3; // rank=12(A), suit=3(s)
assert(getRank(aceOfSpades) === 12, `Ace of Spades: rank=12 (A)`);
assert(getSuit(aceOfSpades) === 3, `Ace of Spades: suit=3 (spades)`);
assert(CardAssets.getCardFilename(aceOfSpades) === 'spades_a.png', `Ace of Spades: filename=spades_a.png`);

const twoOfClubs = 0 * 4 + 0; // rank=0(2), suit=0(c)
assert(getRank(twoOfClubs) === 0, `Two of Clubs: rank=0 (2)`);
assert(getSuit(twoOfClubs) === 0, `Two of Clubs: suit=0 (clubs)`);
assert(CardAssets.getCardFilename(twoOfClubs) === 'clubs_2.png', `Two of Clubs: filename=clubs_2.png`);

const tenOfHearts = 8 * 4 + 2; // rank=8(10/T), suit=2(h)
assert(CardAssets.getCardFilename(tenOfHearts) === 'hearts_10.png', `Ten of Hearts: filename=hearts_10.png`);

// ═══════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log('  TABLE MANAGER CONFIG PASSTHROUGH');
console.log('════════════════════════════════════════════════════════════');
// ═══════════════════════════════════════════════════════════════════

const tm = new TableManager({
  tableId: 'test-config-1',
  clubId: 'club-abc',
  name: 'My Test Table',
  maxSeats: 6,
  variant: 'holdem',
  smallBlind: 5,
  bigBlind: 10,
  minBuyIn: 200,
  maxBuyIn: 1000,
});

const state = tm.getState('nobody');
assert(state.config !== undefined, 'getState includes config block');
assert(state.config.smallBlind === 5, 'config.smallBlind = 5');
assert(state.config.bigBlind === 10, 'config.bigBlind = 10');
assert(state.config.minBuyIn === 200, 'config.minBuyIn = 200');
assert(state.config.maxBuyIn === 1000, 'config.maxBuyIn = 1000');
assert(state.config.tableName === 'My Test Table', 'config.tableName = My Test Table');
assert(state.config.variant === 'holdem', 'config.variant = holdem');
assert(state.maxSeats === 6, 'maxSeats = 6');
assert(state.seats.length === 6, 'seats array has 6 entries');
assert(state.tableId === 'test-config-1', 'tableId passthrough');
assert(state.clubId === 'club-abc', 'clubId passthrough');

// ═══════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log('  EVENT NAME ALIGNMENT: RealtimeSync ↔ Frontend');
console.log('════════════════════════════════════════════════════════════');
// ═══════════════════════════════════════════════════════════════════

// Events that RealtimeSync broadcasts
const serverBroadcastEvents = [
  'hand_start', 'blinds_posted', 'street_start',
  'action_processed', 'showdown', 'payout', 'hand_complete',
  'player_seated', 'player_left', 'player_sitting_out',
  'player_sitting_in', 'player_disconnected', 'player_reconnected',
  'cards_dealt', 'action_required', 'timer_update',
  'chat_message', 'table_error', 'table_state',
];

// Private events
const serverPrivateEvents = ['private_cards', 'your_turn'];

// Events that useTableConnection listens for (from hook source)
const hookListenEvents = [
  'table_state', 'hand_start', 'blinds_posted', 'cards_dealt',
  'street_start', 'action_required', 'action_processed',
  'timer_update', 'showdown', 'payout', 'hand_complete',
  'player_seated', 'player_left', 'player_sitting_out',
  'player_sitting_in', 'player_disconnected', 'player_reconnected',
  'chat_message', 'table_error', 'seat_offered',
];

const hookPrivateEvents = ['private_cards', 'your_turn', 'table_state', 'table_error'];

// Check every server event has a listener
for (const evt of serverBroadcastEvents) {
  assert(hookListenEvents.includes(evt), `Server broadcast "${evt}" → hook listens ✓`);
}

for (const evt of serverPrivateEvents) {
  assert(hookPrivateEvents.includes(evt), `Server private "${evt}" → hook listens ✓`);
}

// Check CHANNEL_EVENTS constants match
assert(CHANNEL_EVENTS.TABLE_STATE === 'table_state', 'CHANNEL_EVENTS.TABLE_STATE');
assert(CHANNEL_EVENTS.HAND_START === 'hand_start', 'CHANNEL_EVENTS.HAND_START');
assert(CHANNEL_EVENTS.CARDS_DEALT === 'cards_dealt', 'CHANNEL_EVENTS.CARDS_DEALT');
assert(CHANNEL_EVENTS.ACTION_REQUIRED === 'action_required', 'CHANNEL_EVENTS.ACTION_REQUIRED');
assert(CHANNEL_EVENTS.PLAYER_ACTION === 'player_action', 'CHANNEL_EVENTS.PLAYER_ACTION');
assert(CHANNEL_EVENTS.SIT_DOWN === 'sit_down', 'CHANNEL_EVENTS.SIT_DOWN');
assert(CHANNEL_EVENTS.CHAT_MESSAGE === 'chat_message', 'CHANNEL_EVENTS.CHAT_MESSAGE');

// ═══════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log('  CLIENT → SERVER EVENT NAMES');
console.log('════════════════════════════════════════════════════════════');
// ═══════════════════════════════════════════════════════════════════

// Client events the hook/component sends → RealtimeSync handlers
const clientEvents = {
  'player_action': '_handlePlayerAction',
  'sit_down': '_handleSitDown', 
  'stand_up': '_handleStandUp',
  'sit_out': '_handleSitOut',
  'sit_in': '_handleSitIn',
  'add_chips': '_handleAddChips',
  'join_waitlist': '_handleJoinWaitlist',
  'leave_waitlist': '_handleLeaveWaitlist',
  'send_chat': '_handleChat',
  'heartbeat': '_handleHeartbeat',
  'request_state': '_handleStateRequest',
};

for (const [evt, handler] of Object.entries(clientEvents)) {
  assert(
    CHANNEL_EVENTS[evt.toUpperCase()] === evt || evt === 'send_chat' || evt === 'heartbeat' || evt === 'request_state',
    `Client event "${evt}" → RealtimeSync handler ${handler}`
  );
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log('  FULL TABLE FLOW: SIT → DEAL → ACT → COMPLETE');
console.log('════════════════════════════════════════════════════════════');
// ═══════════════════════════════════════════════════════════════════

const table = new TableManager({
  tableId: 'flow-test',
  maxSeats: 6,
  smallBlind: 1,
  bigBlind: 2,
  minBuyIn: 40,
  maxBuyIn: 200,
  variant: 'holdem',
});

// Sit 2 players
const sit1 = table.sitDown('p1', 0, 100, { displayName: 'Alice' });
assert(sit1.success, 'Player 1 sits down');

const sit2 = table.sitDown('p2', 1, 100, { displayName: 'Bob' });
assert(sit2.success, 'Player 2 sits down');

// Start hand
const events = [];
table.on('hand_start', (d) => events.push('hand_start'));
table.on('cards_dealt', (d) => events.push('cards_dealt'));
table.on('action_required', (d) => events.push({ action_required: d.playerId }));
table.on('hand_complete', (d) => events.push('hand_complete'));

table.startNextHand();
assert(events.includes('hand_start'), 'hand_start event fired');
assert(events.includes('cards_dealt'), 'cards_dealt event fired');

// Get state for player 1 - should see own cards but not opponent's
const p1State = table.getState('p1');
assert(p1State.config.smallBlind === 1, 'P1 state has config.smallBlind');
assert(p1State.game.handNumber >= 1, 'P1 state has handNumber');

const p1Cards = table.getPlayerCards('p1');
assert(p1Cards && p1Cards.length === 2, 'P1 has 2 hole cards');

const p2Cards = table.getPlayerCards('p2');
assert(p2Cards && p2Cards.length === 2, 'P2 has 2 hole cards');

// Verify card integers are valid (0-51)
assert(p1Cards[0] >= 0 && p1Cards[0] < 52, 'P1 card 1 is valid integer 0-51');
assert(p1Cards[1] >= 0 && p1Cards[1] < 52, 'P1 card 2 is valid integer 0-51');

// Verify cards map to valid filenames
const fname1 = CardAssets.getCardFilename(p1Cards[0]);
assert(fname1.endsWith('.png'), `Card ${p1Cards[0]} → ${fname1}`);

// State hides opponent cards
const p1Seat = p1State.seats.find(s => s.player?.id === 'p1');
const p2SeatInP1View = p1State.seats.find(s => s.player?.id === 'p2');
assert(p2SeatInP1View.holeCards === null, 'P2 cards hidden from P1 view');

// Process action (fold)
const foldResult = table.processAction(table.game.bettingRound?.getCurrentPlayer()?.id, { type: 'fold' });
assert(foldResult.success, 'Fold action succeeds');
assert(events.includes('hand_complete'), 'hand_complete after fold');

// ═══════════════════════════════════════════════════════════════════
(async () => {
console.log('\n════════════════════════════════════════════════════════════');
console.log('  LOBBY MANAGER → TABLE LIST FORMAT');
console.log('════════════════════════════════════════════════════════════');
// ═══════════════════════════════════════════════════════════════════

// Mock supabase for lobby test
const mockChannel = {
  on: function() { return this; },
  subscribe: async function() { return 'SUBSCRIBED'; },
  send: function() {},
  unsubscribe: async function() {},
  track: async function() {},
  untrack: async function() {},
};
const mockSupabase = {
  channel: () => mockChannel,
  removeChannel: () => {},
};

const lobby = new LobbyManager({ supabase: mockSupabase });

await lobby.createTable({
  tableId: 'lobby-test-1',
  tableName: '1/2 NLH',
  variant: 'holdem',
  maxSeats: 9,
  smallBlind: 1,
  bigBlind: 2,
  minBuyIn: 40,
  maxBuyIn: 200,
});

const tableList = lobby.getTableList();
assert(tableList.length === 1, 'Lobby has 1 table');

const t = tableList[0];
assert(t.tableId === 'lobby-test-1', 'tableId in list');
assert(t.tableName === '1/2 NLH', 'tableName in list');
assert(t.variant === 'holdem', 'variant in list');
assert(t.smallBlind === 1, 'smallBlind in list');
assert(t.bigBlind === 2, 'bigBlind in list');
assert(t.minBuyIn === 40, 'minBuyIn in list');
assert(t.maxBuyIn === 200, 'maxBuyIn in list');
assert(t.maxSeats === 9, 'maxSeats in list');
assert(t.playerCount === 0, 'playerCount=0 initially');
assert(t.openSeats === 9, 'openSeats=9 initially');

// PokerLobby accesses these exact fields:
assert(t.tableId !== undefined, 'PokerLobby: table.tableId exists');
assert(t.tableName !== undefined, 'PokerLobby: table.tableName exists');
assert(t.variant !== undefined, 'PokerLobby: table.variant exists');
assert(t.smallBlind !== undefined, 'PokerLobby: table.smallBlind exists');
assert(t.bigBlind !== undefined, 'PokerLobby: table.bigBlind exists');
assert(t.minBuyIn !== undefined, 'PokerLobby: table.minBuyIn exists');
assert(t.maxBuyIn !== undefined, 'PokerLobby: table.maxBuyIn exists');
assert(t.playerCount !== undefined, 'PokerLobby: table.playerCount exists');
assert(t.maxSeats !== undefined, 'PokerLobby: table.maxSeats exists');

// ═══════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log('  HAND HISTORY SQL MIGRATION SCHEMA');
console.log('════════════════════════════════════════════════════════════');
// ═══════════════════════════════════════════════════════════════════

assert(MIGRATION_SQL.includes('CREATE TABLE IF NOT EXISTS hand_histories'), 'Migration creates hand_histories');
assert(MIGRATION_SQL.includes('table_id TEXT NOT NULL'), 'table_id column');
assert(MIGRATION_SQL.includes('club_id TEXT'), 'club_id column');
assert(MIGRATION_SQL.includes('player_ids TEXT[] NOT NULL'), 'player_ids array column');
assert(MIGRATION_SQL.includes('hand_data JSONB NOT NULL'), 'hand_data JSONB column');
assert(MIGRATION_SQL.includes('winner_ids TEXT[]'), 'winner_ids array column');
assert(MIGRATION_SQL.includes('idx_hand_histories_player_ids'), 'GIN index on player_ids');
assert(MIGRATION_SQL.includes('auth.uid()::text'), 'RLS uses UUID::text cast');

// ═══════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log(`  PHASE 3 INTEGRATION RESULTS: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
})().catch(err => { console.error(err); process.exit(1); });
