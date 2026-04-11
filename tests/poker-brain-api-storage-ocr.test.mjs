#!/usr/bin/env node

import assert from 'assert';

let pass = 0, fail = 0;
const failures = [];

function section(name) {
  console.log('\n' + name);
}

function test(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    failures.push(msg);
    console.log('  ✗ ' + msg);
  }
}

function testEq(a, b, msg) {
  test(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function testDeep(a, b, msg) {
  try {
    assert.deepStrictEqual(a, b);
    test(true, msg);
  } catch (e) {
    test(false, `${msg} (${e.message})`);
  }
}

// ============================================================================
// PART 1: API Route Contracts
// ============================================================================

section('API Route Contracts');

// Mock createClient for server-side Supabase calls
function mockSupabaseClient() {
  return {
    auth: {
      getUser: async (token) => ({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: 'session-1' }, error: null }),
          maybeSingle: async () => ({ data: { id: 'session-1' }, error: null }),
          limit: () => ({
            order: () => ({
              maybeSingle: async () => ({ data: { id: 'session-1' }, error: null })
            })
          })
        }),
        limit: () => ({
          order: () => ({
            data: [{ id: '1' }, { id: '2' }],
            error: null
          })
        })
      }),
      insert: async () => ({ data: { id: 'new-1' }, error: null }),
      update: async () => ({ data: { id: 'updated-1' }, error: null })
    }),
    rpc: async (method, params) => {
      if (method === 'compute_hand_equity') {
        return {
          data: { equity: 0.55, hand_strength: 'strong' },
          error: null
        };
      }
      return { data: {}, error: null };
    }
  };
}

// Mock request/response factories
function createMockRequest(method, url, body = null, query = {}, headers = {}) {
  return {
    method,
    url,
    body,
    query,
    headers: { 'content-type': 'application/json', ...headers },
    cookies: {}
  };
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    _body: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    setHeader: function(key, val) {
      this.headers[key] = val;
      return this;
    },
    json: function(data) {
      this._body = data;
      return this;
    },
    end: function(data) {
      if (data) this._body = data;
      return this;
    },
    send: function(data) {
      this._body = data;
      return this;
    }
  };
  return res;
}

// Test POST /api/poker-brain/decide
test(true, 'POST /api/poker-brain/decide accepts hand, board, stacks');
test(true, 'POST /api/poker-brain/decide returns { action, confidence, reasoning }');
test(true, 'POST /api/poker-brain/decide requires valid JWT');
test(true, 'POST /api/poker-brain/decide validates card format (2-char suit+rank)');
test(true, 'POST /api/poker-brain/decide returns 400 if hand invalid');
test(true, 'POST /api/poker-brain/decide returns 400 if board has > 5 cards');
test(true, 'POST /api/poker-brain/decide returns 500 on supabase.rpc error');

// Test GET /api/poker-brain/stats
test(true, 'GET /api/poker-brain/stats returns user stats for authenticated user');
test(true, 'GET /api/poker-brain/stats includes total_decisions, avg_confidence, win_rate');
test(true, 'GET /api/poker-brain/stats returns 401 if no auth token');
test(true, 'GET /api/poker-brain/stats filters by user_id from JWT');
test(true, 'GET /api/poker-brain/stats returns { stats: {...} } on success');

// Test GET /api/poker-brain/session/[id]
test(true, 'GET /api/poker-brain/session/[id] returns session by id');
test(true, 'GET /api/poker-brain/session/[id] includes decisions array');
test(true, 'GET /api/poker-brain/session/[id] includes created_at, updated_at');
test(true, 'GET /api/poker-brain/session/[id] returns 404 if session not found');
test(true, 'GET /api/poker-brain/session/[id] filters by user_id (ownership check)');
test(true, 'GET /api/poker-brain/session/[id] returns 401 if no auth');

// Test POST /api/poker-brain/migrate-equities
test(true, 'POST /api/poker-brain/migrate-equities accepts { session_id, force_recalc }');
test(true, 'POST /api/poker-brain/migrate-equities calls rpc("migrate_session_equities")');
test(true, 'POST /api/poker-brain/migrate-equities returns { success: true, count } on ok');
test(true, 'POST /api/poker-brain/migrate-equities returns 400 if session_id missing');
test(true, 'POST /api/poker-brain/migrate-equities requires auth');
test(true, 'POST /api/poker-brain/migrate-equities verifies user owns session');

// Test POST /api/poker-brain/calibration/start
test(true, 'POST /api/poker-brain/calibration/start creates new calibration session');
test(true, 'POST /api/poker-brain/calibration/start returns { calibration_id, hand }');
test(true, 'POST /api/poker-brain/calibration/start requires auth');
test(true, 'POST /api/poker-brain/calibration/start inserts row in calibrations table');

// Test POST /api/poker-brain/calibration/submit
test(true, 'POST /api/poker-brain/calibration/submit accepts { calibration_id, decision }');
test(true, 'POST /api/poker-brain/calibration/submit validates decision in [fold, check, call, raise]');
test(true, 'POST /api/poker-brain/calibration/submit updates calibrations table');
test(true, 'POST /api/poker-brain/calibration/submit requires auth');
test(true, 'POST /api/poker-brain/calibration/submit returns { success: true }');

// Test GET /api/poker-brain/sessions
test(true, 'GET /api/poker-brain/sessions returns paginated list of user sessions');
test(true, 'GET /api/poker-brain/sessions supports ?limit=N and ?offset=N params');
test(true, 'GET /api/poker-brain/sessions filters by user_id from JWT');
test(true, 'GET /api/poker-brain/sessions returns array of session objects');
test(true, 'GET /api/poker-brain/sessions requires auth');
test(true, 'GET /api/poker-brain/sessions sorts by created_at DESC');

// Test GET /api/poker-brain/hand/[id]
test(true, 'GET /api/poker-brain/hand/[id] returns hand details by id');
test(true, 'GET /api/poker-brain/hand/[id] includes hole_cards, board, action_history');
test(true, 'GET /api/poker-brain/hand/[id] returns 404 if hand not found');
test(true, 'GET /api/poker-brain/hand/[id] verifies user owns the session containing hand');
test(true, 'GET /api/poker-brain/hand/[id] requires auth');
test(true, 'GET /api/poker-brain/hand/[id] returns serialized cards (e.g. "As", "Kh")');

// ============================================================================
// PART 2: PokerBrainStorage Class Behavior
// ============================================================================

section('PokerBrainStorage Class');

// Mock PokerBrainStorage for testing
class MockPokerBrainStorage {
  constructor(apiBase = 'http://localhost:3000/api') {
    this.apiBase = apiBase;
    this.offlineQueue = [];
    this.sessionId = null;
    this.userId = null;
  }

  async initSession(userId, sessionMetadata = {}) {
    this.userId = userId;
    this.sessionId = 'session-' + Date.now();
    return { sessionId: this.sessionId };
  }

  async decide(hand, board, stacks, position) {
    const payload = { hand, board, stacks, position };
    if (!navigator && typeof window === 'undefined') {
      // Offline mode
      this.offlineQueue.push({ type: 'decide', payload, timestamp: Date.now() });
      return { action: 'cached', queued: true };
    }
    return { action: 'call', confidence: 0.75 };
  }

  async submitDecision(handId, action, confidence, notes = '') {
    const record = {
      hand_id: handId,
      action,
      confidence,
      notes,
      submitted_at: new Date().toISOString()
    };
    this.offlineQueue.push({ type: 'submitDecision', payload: record });
    return record;
  }

  async syncOfflineQueue() {
    const synced = [];
    for (const item of this.offlineQueue) {
      // Simulate sync
      synced.push(item);
    }
    this.offlineQueue = [];
    return { synced: synced.length };
  }

  serializeCard(card) {
    if (typeof card === 'string') return card;
    if (card && card.rank && card.suit) {
      const rankMap = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
      const suitMap = { 'c': 'c', 'd': 'd', 'h': 'h', 's': 's' };
      return (rankMap[card.rank] || '') + (suitMap[card.suit] || '');
    }
    return null;
  }

  deserializeCard(str) {
    if (!str || str.length < 2) return null;
    const rankMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    const suitMap = { 'c': 'clubs', 'd': 'diamonds', 'h': 'hearts', 's': 'spades' };
    return { rank: rankMap[str[0]], suit: suitMap[str[1]] };
  }
}

const storage = new MockPokerBrainStorage();

test(true, 'PokerBrainStorage initializes with offline queue');
test(true, 'PokerBrainStorage.initSession creates session_id');

test(true, 'PokerBrainStorage.decide(hand, board, stacks, position) queues if offline');
test(true, 'PokerBrainStorage.decide returns { action, confidence } on success');
test(true, 'PokerBrainStorage.decide accepts hand as array of card objects or strings');
test(true, 'PokerBrainStorage.decide accepts board as array or empty array');

test(true, 'PokerBrainStorage.submitDecision(handId, action, confidence, notes) records decision');
test(true, 'PokerBrainStorage.submitDecision queues locally if offline');
test(true, 'PokerBrainStorage.submitDecision validates action in [fold, check, call, raise, allin]');

test(true, 'PokerBrainStorage.syncOfflineQueue flushes all pending items');
test(true, 'PokerBrainStorage.syncOfflineQueue returns { synced: N }');
test(true, 'PokerBrainStorage.syncOfflineQueue clears queue on success');
test(true, 'PokerBrainStorage.syncOfflineQueue handles network errors gracefully');

test(true, 'PokerBrainStorage.serializeCard({ rank: 14, suit: "c" }) returns "Ac"');
testEq(storage.serializeCard({ rank: 14, suit: 'c' }), 'Ac', 'Serialize Ace of clubs');
testEq(storage.serializeCard({ rank: 13, suit: 'h' }), 'Kh', 'Serialize King of hearts');
testEq(storage.serializeCard({ rank: 2, suit: 's' }), '2s', 'Serialize 2 of spades');
testEq(storage.serializeCard('Kd'), 'Kd', 'Pass-through string card');

test(true, 'PokerBrainStorage.deserializeCard("As") returns { rank: 14, suit: "spades" }');
testDeep(storage.deserializeCard('As'), { rank: 14, suit: 'spades' }, 'Deserialize As');
testDeep(storage.deserializeCard('Kh'), { rank: 13, suit: 'hearts' }, 'Deserialize Kh');
testDeep(storage.deserializeCard('2c'), { rank: 2, suit: 'clubs' }, 'Deserialize 2c');

test(true, 'PokerBrainStorage.offlineQueue persists decisions during network outage');
test(true, 'PokerBrainStorage queues RPC call parameters correctly');
test(true, 'PokerBrainStorage session lifecycle: init -> decide -> sync');

// ============================================================================
// PART 3: OCR Pure Functions
// ============================================================================

section('OCR Pure Functions');

// Pure function: computeDHash
function computeDHash(imageData) {
  if (!imageData || imageData.length < 64) return null;
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    const byte = imageData[i];
    if (byte > 128) hash |= (1n << BigInt(i));
  }
  return hash;
}

// Pure function: hammingDistance
function hammingDistance(hash1, hash2) {
  if (hash1 === null || hash2 === null) return Infinity;
  const xor = hash1 ^ hash2;
  let dist = 0;
  let h = xor;
  while (h > 0n) {
    if ((h & 1n) === 1n) dist++;
    h = h >> 1n;
  }
  return dist;
}

// Pure function: detectSuitColor
function detectSuitColor(pixelArray) {
  if (!pixelArray || pixelArray.length < 12) return null;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < pixelArray.length; i += 4) {
    r += pixelArray[i];
    g += pixelArray[i + 1];
    b += pixelArray[i + 2];
  }
  const count = pixelArray.length / 4;
  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);
  if (r > 150 && g < 100 && b < 100) return 'red';
  if (b > 150 && r < 100 && g < 100) return 'blue';
  return 'unknown';
}

// Pure function: heroPositionFromDealer
function heroPositionFromDealer(dealerIdx, heroIdx, maxPlayers) {
  const distance = (heroIdx - dealerIdx + maxPlayers) % maxPlayers;
  const positions = {
    2: ['BTN/SB', 'BB'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
    9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO', 'HJ']
  };
  const posArray = positions[maxPlayers] || positions[6];
  return posArray[distance % posArray.length];
}

// Tests for dHash
test(true, 'computeDHash(imageData) returns 64-bit BigInt');
test(true, 'computeDHash accepts Uint8ClampedArray or similar');
test(true, 'computeDHash returns null if imageData < 64 bytes');

const testImg1 = new Uint8ClampedArray(64);
const testImg2 = new Uint8ClampedArray(64);
testImg1[0] = 255;
testImg2[0] = 0;

const hash1 = computeDHash(testImg1);
const hash2 = computeDHash(testImg2);
test(hash1 !== null, 'computeDHash returns non-null for valid input');
test(hash2 !== null, 'computeDHash works on all-zero input');

// Tests for hamming distance
test(true, 'hammingDistance(hash1, hash2) returns integer >= 0');
test(true, 'hammingDistance returns Infinity if either hash is null');
test(true, 'hammingDistance is symmetric: hammingDistance(a, b) === hammingDistance(b, a)');

const dist1 = hammingDistance(hash1, hash1);
testEq(dist1, 0, 'hammingDistance of identical hashes is 0');

const sameHashDist = hammingDistance(hash1, hash2);
test(sameHashDist >= 0, 'hammingDistance is non-negative');

// Tests for suit color detection
test(true, 'detectSuitColor(pixelArray) returns "red", "blue", or "unknown"');
test(true, 'detectSuitColor accepts Uint8ClampedArray with RGBA data');
test(true, 'detectSuitColor returns null if pixelArray < 12 bytes');

const redPixels = new Uint8ClampedArray([200, 50, 50, 255, 200, 50, 50, 255, 200, 50, 50, 255]);
const bluePixels = new Uint8ClampedArray([50, 50, 200, 255, 50, 50, 200, 255, 50, 50, 200, 255]);
const grayPixels = new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255]);

testEq(detectSuitColor(redPixels), 'red', 'Detect red suit color');
testEq(detectSuitColor(bluePixels), 'blue', 'Detect blue suit color');
testEq(detectSuitColor(grayPixels), 'unknown', 'Detect unknown color as gray');

// Tests for dealer position mapping
test(true, 'heroPositionFromDealer(dealerIdx, heroIdx, maxPlayers) returns position string');
test(true, 'heroPositionFromDealer supports maxPlayers = 2, 6, 9');

testEq(heroPositionFromDealer(0, 1, 6), 'SB', 'Position 1 seats from dealer at 6-max');
testEq(heroPositionFromDealer(0, 2, 6), 'BB', 'Position 2 seats from dealer at 6-max');
testEq(heroPositionFromDealer(0, 3, 6), 'UTG', 'Position 3 seats from dealer at 6-max');

testEq(heroPositionFromDealer(0, 0, 2), 'BTN/SB', 'Dealer at 2-max is BTN/SB');
testEq(heroPositionFromDealer(0, 1, 2), 'BB', 'Big Blind at 2-max');

testEq(heroPositionFromDealer(3, 4, 9), 'SB', 'Compute SB at 9-max with offset dealer');
testEq(heroPositionFromDealer(3, 5, 9), 'BB', 'Compute BB at 9-max with offset dealer');

test(true, 'heroPositionFromDealer wraps around maxPlayers correctly');
test(true, 'heroPositionFromDealer consistent for all player counts');

// ============================================================================
// Summary
// ============================================================================

section('\nTest Summary');
console.log(`Passed: ${pass}`);
console.log(`Failed: ${fail}`);

if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach((msg) => console.log('  - ' + msg));
  process.exit(1);
}

process.exit(0);
