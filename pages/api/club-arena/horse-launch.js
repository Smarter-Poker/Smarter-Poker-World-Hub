import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/horse-launch
 *
 * Server-side horse fleet launcher for the Midway Union.
 * Creates cash tables + tournaments across Shark Club & Club JAQK,
 * then seats horses at 4 tables each (2 cash + 2 tournament).
 *
 * Actions:
 *   launch_all     — Full fleet deployment (cash + tournaments + SNGs + Spins)
 *   launch_cash    — Cash tables only
 *   launch_tournaments — Today's tournaments only
 *   launch_sngs    — All SNGs
 *   launch_spins   — All Spins
 *   status         — Current fleet status
 *   shutdown       — Mark all horse-owned tables as closed
 *
 * Auth: Bearer token (must be platform owner / admin)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// Phase 61: Was injected by automated retrofit at line 291 INSIDE
// createTournament's function body — out of scope when handler ran,
// causing ReferenceError on every POST. Moved to module scope so the
// handler's idempotency guard actually works.
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

// Phase 61: Fisher-Yates shuffle helper. Replaces 5 sites that used
// arr.sort(() => Math.random() - 0.5) — mathematically biased
// (some permutations 2x more likely). Mutates in place; returns arr.
function _shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDWAY UNION CLUBS
// ═══════════════════════════════════════════════════════════════════════════════
const SHARK_CLUB_ID = 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';
const JAQK_CLUB_ID  = 'a0000000-0000-0000-0000-000000000001';
const UNION_ID      = 'fade0000-0000-0000-0000-000000000001';
const OWNER_ID      = '47965354-0e56-43ef-931c-ddaab82af765'; // Dan

// ═══════════════════════════════════════════════════════════════════════════════
// CASH TABLE CONFIGS (39 tables)
// ═══════════════════════════════════════════════════════════════════════════════
const CASH_TABLES = [
  // NLH Full Ladder
  { name: 'NLH Micro 0.10/0.20',     sb: 0.10, bb: 0.20, max: 9, variant: 'nlh' },
  { name: 'NLH 0.25/0.50',           sb: 0.25, bb: 0.50, max: 9, variant: 'nlh' },
  { name: 'NLH 0.50/1.00',           sb: 0.50, bb: 1.00, max: 9, variant: 'nlh' },
  { name: 'NLH 1/2',                 sb: 1.00, bb: 2.00, max: 9, variant: 'nlh' },
  { name: 'NLH 2/4',                 sb: 2.00, bb: 4.00, max: 9, variant: 'nlh' },
  { name: 'NLH 2/5',                 sb: 2.00, bb: 5.00, max: 9, variant: 'nlh' },
  { name: 'NLH 3/6',                 sb: 3.00, bb: 6.00, max: 9, variant: 'nlh' },
  { name: 'NLH 5/10',                sb: 5.00, bb: 10.0, max: 6, variant: 'nlh' },
  { name: 'NLH 10/25',               sb: 10.0, bb: 25.0, max: 6, variant: 'nlh' },
  // NLH 6-Max
  { name: 'NLH 6-Max 0.10/0.20',     sb: 0.10, bb: 0.20, max: 6, variant: 'nlh' },
  { name: 'NLH 6-Max 0.25/0.50',     sb: 0.25, bb: 0.50, max: 6, variant: 'nlh' },
  { name: 'NLH 6-Max 0.50/1.00',     sb: 0.50, bb: 1.00, max: 6, variant: 'nlh' },
  { name: 'NLH 6-Max 1/2',           sb: 1.00, bb: 2.00, max: 6, variant: 'nlh' },
  // PLO4
  { name: 'PLO4 0.10/0.20',          sb: 0.10, bb: 0.20, max: 9, variant: 'plo4' },
  { name: 'PLO4 0.25/0.50',          sb: 0.25, bb: 0.50, max: 9, variant: 'plo4' },
  { name: 'PLO4 0.50/1.00',          sb: 0.50, bb: 1.00, max: 9, variant: 'plo4' },
  { name: 'PLO4 1/2',                sb: 1.00, bb: 2.00, max: 6, variant: 'plo4' },
  { name: 'PLO4 2/5',                sb: 2.00, bb: 5.00, max: 6, variant: 'plo4' },
  { name: 'PLO4 5/10',               sb: 5.00, bb: 10.0, max: 6, variant: 'plo4' },
  // PLO5
  { name: 'PLO5 0.25/0.50',          sb: 0.25, bb: 0.50, max: 6, variant: 'plo5' },
  { name: 'PLO5 0.50/1.00',          sb: 0.50, bb: 1.00, max: 6, variant: 'plo5' },
  { name: 'PLO5 1/2',                sb: 1.00, bb: 2.00, max: 6, variant: 'plo5' },
  { name: 'PLO5 2/5',                sb: 2.00, bb: 5.00, max: 6, variant: 'plo5' },
  // PLO6
  { name: 'PLO6 0.25/0.50',          sb: 0.25, bb: 0.50, max: 6, variant: 'plo6' },
  { name: 'PLO6 0.50/1.00',          sb: 0.50, bb: 1.00, max: 6, variant: 'plo6' },
  { name: 'PLO6 1/2',                sb: 1.00, bb: 2.00, max: 6, variant: 'plo6' },
  { name: 'PLO6 2/5',                sb: 2.00, bb: 5.00, max: 6, variant: 'plo6' },
  // PLO8
  { name: 'PLO8 0.25/0.50',          sb: 0.25, bb: 0.50, max: 9, variant: 'plo8' },
  { name: 'PLO8 0.50/1.00',          sb: 0.50, bb: 1.00, max: 9, variant: 'plo8' },
  { name: 'PLO8 1/2',                sb: 1.00, bb: 2.00, max: 9, variant: 'plo8' },
  { name: 'PLO8 2/5',                sb: 2.00, bb: 5.00, max: 6, variant: 'plo8' },
  // OFC Pineapple
  { name: 'Pineapple 0.25/0.50',     sb: 0.25, bb: 0.50, max: 6, variant: 'ofc_pineapple' },
  { name: 'Pineapple 0.50/1.00',     sb: 0.50, bb: 1.00, max: 6, variant: 'ofc_pineapple' },
  { name: 'Pineapple 1/2',           sb: 1.00, bb: 2.00, max: 6, variant: 'ofc_pineapple' },
  // Short Deck
  { name: 'Short Deck 0.50/1.00',    sb: 0.50, bb: 1.00, max: 6, variant: 'short_deck' },
  { name: 'Short Deck 1/2',          sb: 1.00, bb: 2.00, max: 6, variant: 'short_deck' },
  // Bomb Pot
  { name: 'Bomb Pot NLH 0.25/0.50',  sb: 0.25, bb: 0.50, max: 9, variant: 'nlh' },
  { name: 'Bomb Pot PLO4 0.50/1.00', sb: 0.50, bb: 1.00, max: 9, variant: 'plo4' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT CONFIGS (Full Weekly Schedule)
// ═══════════════════════════════════════════════════════════════════════════════
const BLIND_STANDARD = JSON.stringify([
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 10 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 10 },
  { level: 3, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 10 },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 8 },
  { level: 5, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 8 },
  { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 8 },
  { level: 7, smallBlind: 300, bigBlind: 600, ante: 60, durationMinutes: 6 },
  { level: 8, smallBlind: 400, bigBlind: 800, ante: 80, durationMinutes: 6 },
  { level: 9, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 5 },
  { level: 10, smallBlind: 750, bigBlind: 1500, ante: 150, durationMinutes: 5 },
]);
const BLIND_TURBO = JSON.stringify([
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 4 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 4 },
  { level: 3, smallBlind: 100, bigBlind: 200, ante: 20, durationMinutes: 3 },
  { level: 4, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 3 },
  { level: 5, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 3 },
  { level: 6, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 2 },
  { level: 7, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 2 },
  { level: 8, smallBlind: 750, bigBlind: 1500, ante: 150, durationMinutes: 2 },
]);
const BLIND_HYPER = JSON.stringify([
  { level: 1, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 2 },
  { level: 2, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 2 },
  { level: 3, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 2 },
  { level: 4, smallBlind: 400, bigBlind: 800, ante: 100, durationMinutes: 1 },
  { level: 5, smallBlind: 800, bigBlind: 1600, ante: 200, durationMinutes: 1 },
]);
const BLIND_SNG = JSON.stringify([
  { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 3 },
  { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 3 },
  { level: 3, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 3 },
  { level: 4, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 3 },
  { level: 5, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 3 },
  { level: 6, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 2 },
  { level: 7, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 2 },
  { level: 8, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 2 },
]);
const BLIND_SPIN = JSON.stringify([
  { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 2 },
  { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 2 },
  { level: 3, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 2 },
  { level: 4, smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 1 },
  { level: 5, smallBlind: 100, bigBlind: 200, ante: 0, durationMinutes: 1 },
]);

function getTodaysTournaments() {
  const today = new Date().getDay(); // 0=Sun … 6=Sat
  const ALL_TOURNAMENTS = [
    // Monday
    { name: 'FREEROLL — Monday Kickoff (NLH)', variant: 'freezeout', game: 'NLH', buyIn: 0, fee: 0, gtd: 100, chips: 3000, max: 100, horsesTarget: 30, blinds: BLIND_TURBO, day: 1, hour: 19 },
    { name: 'FREEROLL — PLO4 Welcome', variant: 'freezeout', game: 'PLO4', buyIn: 0, fee: 0, gtd: 50, chips: 3000, max: 50, horsesTarget: 20, blinds: BLIND_TURBO, day: 1, hour: 21 },
    // Tuesday
    { name: '5 Chip Freezeout — NLH Deep Stack', variant: 'freezeout', game: 'NLH', buyIn: 5, fee: 0.5, gtd: 200, chips: 5000, max: 100, horsesTarget: 25, blinds: BLIND_STANDARD, day: 2, hour: 19 },
    { name: '10 Chip Freezeout — PLO5 Action', variant: 'freezeout', game: 'PLO5', buyIn: 10, fee: 1, gtd: 300, chips: 5000, max: 50, horsesTarget: 20, blinds: BLIND_STANDARD, day: 2, hour: 21 },
    // Wednesday
    { name: '10 Chip Bounty Hunter — NLH', variant: 'bounty', game: 'NLH', buyIn: 10, fee: 1, gtd: 500, chips: 5000, max: 100, horsesTarget: 30, blinds: BLIND_STANDARD, day: 3, hour: 19 },
    { name: '25 Chip Bounty Hunter — PLO4', variant: 'bounty', game: 'PLO4', buyIn: 25, fee: 2.5, gtd: 1000, chips: 10000, max: 50, horsesTarget: 20, blinds: BLIND_STANDARD, day: 3, hour: 21 },
    // Thursday
    { name: '15 Chip PKO — NLH Progressive', variant: 'progressive_bounty', game: 'NLH', buyIn: 15, fee: 1.5, gtd: 750, chips: 7500, max: 100, horsesTarget: 25, blinds: BLIND_STANDARD, day: 4, hour: 19 },
    { name: '20 Chip PKO — PLO8 Hi-Lo', variant: 'progressive_bounty', game: 'PLO8', buyIn: 20, fee: 2, gtd: 500, chips: 7500, max: 50, horsesTarget: 20, blinds: BLIND_STANDARD, day: 4, hour: 21 },
    // Friday
    { name: '25 Chip Mystery Bounty — NLH', variant: 'mystery_bounty', game: 'NLH', buyIn: 25, fee: 2.5, gtd: 1500, chips: 10000, max: 100, horsesTarget: 30, blinds: BLIND_STANDARD, day: 5, hour: 20 },
    { name: '10 Chip Mystery Bounty — Pineapple', variant: 'mystery_bounty', game: 'OFC_PINEAPPLE', buyIn: 10, fee: 1, gtd: 250, chips: 5000, max: 30, horsesTarget: 15, blinds: BLIND_TURBO, day: 5, hour: 22 },
    // Saturday
    { name: '50 Chip Saturday Major — 5K GTD', variant: 'freezeout', game: 'NLH', buyIn: 50, fee: 5, gtd: 5000, chips: 15000, max: 200, horsesTarget: 40, blinds: BLIND_STANDARD, day: 6, hour: 18 },
    { name: '5 Chip Turbo Bounty — NLH', variant: 'bounty', game: 'NLH', buyIn: 5, fee: 0.5, gtd: 150, chips: 3000, max: 50, horsesTarget: 25, blinds: BLIND_TURBO, day: 6, hour: 20 },
    { name: '10 Chip Turbo PLO4 — Saturday Night', variant: 'freezeout', game: 'PLO4', buyIn: 10, fee: 1, gtd: 300, chips: 5000, max: 50, horsesTarget: 20, blinds: BLIND_TURBO, day: 6, hour: 22 },
    // Sunday
    { name: '100 Chip Sunday Championship — 10K GTD', variant: 'freezeout', game: 'NLH', buyIn: 100, fee: 10, gtd: 10000, chips: 20000, max: 200, horsesTarget: 50, blinds: BLIND_STANDARD, day: 0, hour: 17 },
    { name: '50 Chip Sunday PLO4 Championship — 3K GTD', variant: 'freezeout', game: 'PLO4', buyIn: 50, fee: 5, gtd: 3000, chips: 15000, max: 100, horsesTarget: 30, blinds: BLIND_STANDARD, day: 0, hour: 19 },
    { name: '25 Chip PKO — Sunday Night Showdown', variant: 'progressive_bounty', game: 'NLH', buyIn: 25, fee: 2.5, gtd: 1500, chips: 10000, max: 100, horsesTarget: 30, blinds: BLIND_STANDARD, day: 0, hour: 21 },
    { name: 'FREEROLL — Sunday Night Freebie', variant: 'freezeout', game: 'NLH', buyIn: 0, fee: 0, gtd: 200, chips: 3000, max: 100, horsesTarget: 30, blinds: BLIND_HYPER, day: 0, hour: 23 },
    // Daily (every day)
    { name: 'Daily Freeroll — NLH', variant: 'freezeout', game: 'NLH', buyIn: 0, fee: 0, gtd: 50, chips: 2000, max: 100, horsesTarget: 20, blinds: BLIND_HYPER, day: -1, hour: 12 },
    { name: '10 Chip Daily Grinder — 250 GTD', variant: 'freezeout', game: 'NLH', buyIn: 10, fee: 1, gtd: 250, chips: 5000, max: 100, horsesTarget: 25, blinds: BLIND_STANDARD, day: -1, hour: 20 },
  ];
  return ALL_TOURNAMENTS.filter(t => t.day === today || t.day === -1);
}

const SNG_CONFIGS = [
  { name: '5 Chip Turbo SNG 6-Max NLH',   game: 'NLH', buyIn: 5, fee: 0.5, chips: 1500, max: 6, blinds: BLIND_SNG },
  { name: '10 Chip SNG 9-Max NLH',        game: 'NLH', buyIn: 10, fee: 1, chips: 2000, max: 9, blinds: BLIND_SNG },
  { name: '25 Chip SNG 6-Max NLH',        game: 'NLH', buyIn: 25, fee: 2.5, chips: 2000, max: 6, blinds: BLIND_SNG },
  { name: '5 Chip Turbo SNG 6-Max PLO4',  game: 'PLO4', buyIn: 5, fee: 0.5, chips: 1500, max: 6, blinds: BLIND_SNG },
  { name: '10 Chip SNG 6-Max PLO4',       game: 'PLO4', buyIn: 10, fee: 1, chips: 2000, max: 6, blinds: BLIND_SNG },
  { name: '10 Chip SNG 6-Max PLO5',       game: 'PLO5', buyIn: 10, fee: 1, chips: 2000, max: 6, blinds: BLIND_SNG },
  { name: '5 Chip SNG 9-Max PLO8',        game: 'PLO8', buyIn: 5, fee: 0.5, chips: 2000, max: 9, blinds: BLIND_SNG },
  { name: '5 Chip SNG 6-Max Pineapple',   game: 'OFC_PINEAPPLE', buyIn: 5, fee: 0.5, chips: 1500, max: 6, blinds: BLIND_SNG },
];

const SPIN_CONFIGS = [
  { name: '1 Chip Spin NLH',       game: 'NLH', buyIn: 1, fee: 0.1, chips: 500, max: 3 },
  { name: '3 Chip Spin NLH',       game: 'NLH', buyIn: 3, fee: 0.3, chips: 500, max: 3 },
  { name: '5 Chip Spin NLH',       game: 'NLH', buyIn: 5, fee: 0.5, chips: 500, max: 3 },
  { name: '10 Chip Spin NLH',      game: 'NLH', buyIn: 10, fee: 1, chips: 500, max: 3 },
  { name: '3 Chip Spin PLO4',      game: 'PLO4', buyIn: 3, fee: 0.3, chips: 500, max: 3 },
  { name: '5 Chip Spin PLO4',      game: 'PLO4', buyIn: 5, fee: 0.5, chips: 500, max: 3 },
  { name: '3 Chip Spin PLO5',      game: 'PLO5', buyIn: 3, fee: 0.3, chips: 500, max: 3 },
  { name: '3 Chip Spin PLO8',      game: 'PLO8', buyIn: 3, fee: 0.3, chips: 500, max: 3 },
  { name: '3 Chip Spin Pineapple', game: 'OFC_PINEAPPLE', buyIn: 3, fee: 0.3, chips: 500, max: 3 },
];

const SPIN_MULTIPLIERS = [
  { mult: 2, weight: 75 }, { mult: 3, weight: 15 }, { mult: 5, weight: 7 },
  { mult: 10, weight: 2.5 }, { mult: 25, weight: 0.4 }, { mult: 100, weight: 0.1 },
];

function rollMultiplier() {
  const total = SPIN_MULTIPLIERS.reduce((s, m) => s + m.weight, 0);
  let roll = Math.random() * total;
  for (const m of SPIN_MULTIPLIERS) { roll -= m.weight; if (roll <= 0) return m.mult; }
  return 2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Fetch all active horses, split into Shark half and JAQK half */
async function getHorsesByClub() {
  const { data: horses, error } = await getSupabase()
    .from('profiles')
    .select('id, display_name')
    .eq('is_horse', true)
    .in('horse_status', ['active', 'seated'])
    .order('id')
    .limit(350);

  if (error || !horses?.length) return { shark: [], jaqk: [], all: [] };

  const half = Math.ceil(horses.length / 2);
  return {
    shark: horses.slice(0, half),
    jaqk: horses.slice(half),
    all: horses,
  };
}

/** Create cash tables, alternating between clubs */
async function createCashTables(log) {
  let created = 0;
  const tableIds = { union: [] };

  for (const cfg of CASH_TABLES) {
    // UNION LAW: all union-visible games are hosted by the Midway Union house
    // club. Member clubs (Shark, JAQK) never host union games directly.
    const clubId = UNION_ID;

    const { data, error } = await getSupabase()
      .from('tables')
      .insert({
        club_id: clubId,
        union_id: UNION_ID,
        name: cfg.name,
        game_type: 'cash',
        game_variant: cfg.variant,
        stakes: `${cfg.sb}/${cfg.bb}`,
        small_blind: cfg.sb,
        big_blind: cfg.bb,
        min_buy_in: cfg.bb * 40,
        max_buy_in: cfg.bb * 200,
        max_players: cfg.max,
        current_players: 0,
        status: 'active',
        is_deleted: false,
        settings: {
          straddle_enabled: true,
          run_it_twice: false,
          bomb_pot_enabled: cfg.name.includes('Bomb'),
          time_bank_seconds: 30,
          auto_muck: true,
        },
      })
      .select('id')
      .maybeSingle();

    if (!error && data) {
      created++;
      tableIds.union.push(data.id);
    } else {
      log.push(`⚠️ Table "${cfg.name}" failed: ${error?.message}`);
    }
  }
  return { created, tableIds };
}

/** Create a tournament in Supabase */
async function createTournament(cfg, clubId) {
  const startTime = new Date();
  startTime.setHours(cfg.hour, 0, 0, 0);
  // If the start time is in the past, set it to 2 minutes from now
  if (startTime.getTime() < Date.now()) {
    startTime.setTime(Date.now() + 2 * 60 * 1000);
  }

  const { data, error } = await getSupabase()
    .from('tournaments')
    .insert({
      club_id: clubId,
      union_id: UNION_ID,
      name: cfg.name,
      game_type: cfg.game,
      variant: cfg.variant,
      tournament_type: 'MTT',
      buy_in_amount: cfg.buyIn,
      buy_in_fee: cfg.fee,
      guaranteed_prize: cfg.gtd,
      starting_chips: cfg.chips,
      max_players: cfg.max,
      current_players: 0,
      status: 'REGISTERING',
      blind_structure: cfg.blinds,
      late_reg_levels: 8,
      late_reg_mins: 8,
      start_time: startTime.toISOString(),
    })
    .select('id')
    .maybeSingle();

  return { id: data?.id, error: error?.message };
}

/** Register a batch of horses for a tournament */
async function registerHorses(tournamentId, horses) {
  let registered = 0;
  for (const horse of horses) {
    const { error } = await getSupabase()
      .from('tournament_players')
      .insert({
        tournament_id: tournamentId,
        user_id: horse.id,
        username: horse.display_name || `Horse-${horse.id.slice(0,4)}`,
        status: 'registered',
        chips: 0,
      });
    if (!error) registered++;
  }
  // Update player count
  const { error: err_tournaments_97573 } = await getSupabase()
    .from('tournaments')
    .update({ current_players: registered })
    .eq('id', tournamentId);
  if (err_tournaments_97573) console.warn('[Supabase] Silent mutation failed in tournaments:', err_tournaments_97573.message);
  return registered;
}

/** Seat a horse at a cash table */
async function seatHorseAtTable(tableId, horseId, maxPlayers, bigBlind) {
  // Find next open seat
  const { data: existingSeats } = await getSupabase()
    .from('table_seats')
    .select('seat_number')
    .eq('table_id', tableId)
    .is('left_at', null);
  const taken = new Set((existingSeats || []).map(s => s.seat_number));
  let seat = 1;
  while (taken.has(seat) && seat <= maxPlayers) seat++;
  if (seat > maxPlayers) return false;

  const buyIn = (bigBlind || 1) * 100;
  
  // Enforce atomic bankroll deduction
  const { error } = await getSupabase().rpc('atomic_table_buyin', {
    p_user_id: horseId,
    p_table_id: tableId,
    p_seat_number: seat,
    p_amount: buyIn,
    p_auto_rebuy: false
  });
  
  if (error) {
    console.warn(`[Horse Launch] Failed to buy into table ${tableId}: ${error.message}`);
    return false;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Auth: must be platform owner
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
  const user = authData?.user;
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
  if (user.id !== OWNER_ID) return res.status(403).json({ error: 'Admin only' });

  const { action } = req.body;
  const log = [];
  const t0 = Date.now();

  try {
    // ═══════════════════════════════════════════════════════
    // LAUNCH ALL
    // ═══════════════════════════════════════════════════════
    if (action === 'launch_all') {
      const horses = await getHorsesByClub();
      if (horses.all.length === 0) {
        return res.status(400).json({ error: 'No active horses found. Create horse profiles first.' });
      }

      const horseStats = new Map();
      for (const h of horses.all) {
        horseStats.set(h.id, { cash: 0, tournaments: 0 });
      }

      // 1. Create cash tables (alternating clubs)
      // Create 3 batches of cash tables so there are ~738 seats available for 355 horses (everyone gets 2)
      let cashCreated = 0;
      const tableIds = { union: [] };
      for (let i = 0; i < 3; i++) {
        const res = await createCashTables(log);
        cashCreated += res.created;
        tableIds.union.push(...res.tableIds.union);
      }
      log.push(`✅ Cash tables created: ${cashCreated} (all hosted by Midway Union)`);

      // 2. Create today's tournaments (alternating clubs)
      const todaysTournaments = getTodaysTournaments();
      let tournamentsCreated = 0;
      let tournamentsRegistered = 0;
      const tournamentIds = { union: [] };

      for (const cfg of todaysTournaments) {
        // UNION LAW: tournaments are hosted by the Midway Union house club.
        const clubId = UNION_ID;
        const result = await createTournament(cfg, clubId);
        if (result.id) {
          tournamentsCreated++;
          tournamentIds.union.push(result.id);
          
          // Register target number of horses - picking from those with < 2 tournaments
          let availableHorses = horses.all.filter(h => (horseStats.get(h.id)?.tournaments || 0) < 2);
          availableHorses = _shuffleInPlace([...availableHorses]); // Phase 61: Fisher-Yates
          const targetHorses = Math.min(cfg.horsesTarget, availableHorses.length);
          const horseSlice = availableHorses.slice(0, targetHorses);
          const reg = await registerHorses(result.id, horseSlice);
          for (const h of horseSlice) {
            const stat = horseStats.get(h.id);
            stat.tournaments += 1;
          }
          tournamentsRegistered += reg;
        } else {
          log.push(`⚠️ Tournament "${cfg.name}" failed: ${result.error}`);
        }
      }
      log.push(`✅ Tournaments created: ${tournamentsCreated}, horses registered: ${tournamentsRegistered}`);

      // 3. Create SNGs (alternating clubs)
      let sngsCreated = 0, sngRegistered = 0;
      for (const cfg of SNG_CONFIGS) {
        // UNION LAW: SNGs are hosted by the Midway Union house club.
        const clubId = UNION_ID;
        const { data, error } = await getSupabase()
          .from('tournaments')
          .insert({
            club_id: clubId,
            union_id: UNION_ID,
            name: cfg.name,
            game_type: cfg.game,
            variant: 'SNG',
            tournament_type: 'SNG',
            buy_in_amount: cfg.buyIn,
            buy_in_fee: cfg.fee,
            starting_chips: cfg.chips,
            max_players: cfg.max,
            current_players: 0,
            status: 'REGISTERING',
            blind_structure: cfg.blinds,
            late_reg_levels: 0,
            late_reg_mins: 0,
            start_time: new Date(Date.now() + 15000).toISOString(),
          })
          .select('id')
          .maybeSingle();
        if (!error && data) {
          sngsCreated++;
          let availableHorses = horses.all.filter(h => (horseStats.get(h.id)?.tournaments || 0) < 2);
          availableHorses = _shuffleInPlace([...availableHorses]); // Phase 61: Fisher-Yates
          const sngHorses = availableHorses.slice(0, cfg.max);
          sngRegistered += await registerHorses(data.id, sngHorses);
          for (const h of sngHorses) {
            const stat = horseStats.get(h.id);
            stat.tournaments += 1;
          }
        }
      }
      log.push(`✅ SNGs created: ${sngsCreated}, horses registered: ${sngRegistered}`);

      // 4. Create Spins (alternating clubs, with multiplier)
      let spinsCreated = 0, spinRegistered = 0;
      for (const cfg of SPIN_CONFIGS) {
        // UNION LAW: spins are hosted by the Midway Union house club.
        const clubId = UNION_ID;
        const mult = rollMultiplier();
        const prize = cfg.buyIn * cfg.max * mult;
        const { data, error } = await getSupabase()
          .from('tournaments')
          .insert({
            club_id: clubId,
            union_id: UNION_ID,
            name: `${cfg.name} (${mult}x)`,
            game_type: cfg.game,
            variant: 'SPIN',
            tournament_type: 'SPIN',
            buy_in_amount: cfg.buyIn,
            buy_in_fee: cfg.fee,
            starting_chips: cfg.chips,
            max_players: cfg.max,
            current_players: 0,
            status: 'REGISTERING',
            guaranteed_prize: prize,
            blind_structure: BLIND_SPIN,
            late_reg_levels: 0,
            late_reg_mins: 0,
            start_time: new Date(Date.now() + 15000).toISOString(),
          })
          .select('id')
          .maybeSingle();
        if (!error && data) {
          spinsCreated++;
          let availableHorses = horses.all.filter(h => (horseStats.get(h.id)?.tournaments || 0) < 2);
          availableHorses = _shuffleInPlace([...availableHorses]); // Phase 61: Fisher-Yates
          const spinHorses = availableHorses.slice(0, cfg.max);
          spinRegistered += await registerHorses(data.id, spinHorses);
          for (const h of spinHorses) {
            const stat = horseStats.get(h.id);
            stat.tournaments += 1;
          }
        }
      }
      log.push(`✅ Spins created: ${spinsCreated}, horses registered: ${spinRegistered}`);

      // 4.5. Pre-fund all horses to 500,000 chips so they don't bounce off atomic wallet deductions
      const { error: massFundErr } = await getSupabase().rpc('mass_fund_horses', { p_amount: 500000 });
      if (massFundErr) {
        log.push(`⚠️ mass_fund_horses RPC failed: ${massFundErr.message} — horses may lack chips for buy-ins`);
        console.warn('[horse-launch] mass_fund_horses failed:', massFundErr.message);
      } else {
        log.push(`✅ Granted core bankroll to all horses for atomic cash game buy-ins`);
      }

      // 5. Seat horses at cash tables (2 per horse, split by club)
      let cashSeats = 0;
      const allTables = await getSupabase()
        .from('tables')
        .select('id, club_id, max_players, current_players, big_blind')
        .eq('status', 'active')
        .neq('game_type', 'tournament')
        .order('current_players', { ascending: true });
      const activeTables = allTables.data || [];

      // Seat Shark horses at Shark tables, JAQK horses at JAQK tables.
      // Phase 61: Fisher-Yates instead of biased sort(() => Math.random() - 0.5).
      // UNION LAW: every horse plays in the shared Midway Union game pool,
      // mixing with players from all member clubs.
      const allHorses = _shuffleInPlace([...horses.all]);

      for (const [clubHorses, clubId] of [[allHorses, UNION_ID]]) {
        const clubTables = activeTables.filter(t => t.club_id === clubId);
        for (const horse of clubHorses) {
          const stat = horseStats.get(horse.id);
          for (const table of clubTables) {
            if (stat.cash >= 2) break; // 2 cash tables per horse
            if ((table.current_players || 0) >= table.max_players) continue;
            const didSeat = await seatHorseAtTable(table.id, horse.id, table.max_players, table.big_blind);
            if (didSeat) {
              stat.cash++;
              cashSeats++;
              table.current_players = (table.current_players || 0) + 1;
            }
          }
        }
      }
      log.push(`✅ Horses seated at cash tables: ${cashSeats}`);

      // Update horse statuses to 'seated'
      const { error: err_profiles_z2iy8 } = await getSupabase()
        .from('profiles')
        .update({ horse_status: 'seated' })
        .eq('is_horse', true)
        .in('horse_status', ['active']);
      if (err_profiles_z2iy8) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_z2iy8.message);

      const elapsed = Date.now() - t0;
      const summary = {
        horses: horses.all.length,
        sharkHorses: horses.shark.length,
        jaqkHorses: horses.jaqk.length,
        cashTables: cashCreated,
        tournaments: tournamentsCreated,
        sngs: sngsCreated,
        spins: spinsCreated,
        cashSeats,
        tournamentsRegistered,
        sngRegistered,
        spinRegistered,
        elapsed: `${elapsed}ms`,
        log,
      };

      return res.json({ success: true, action: 'launch_all', ...summary });
    }

    // ═══════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════
    if (action === 'status') {
      const { count: totalHorses } = await getSupabase()
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_horse', true)
        .in('horse_status', ['active', 'seated']);

      const { count: seatedHorses } = await getSupabase()
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_horse', true)
        .eq('horse_status', 'seated');

      const { count: activeTables } = await getSupabase()
        .from('tables')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gt('current_players', 0);

      const { count: regTournaments } = await getSupabase()
        .from('tournaments')
        .select('*', { count: 'exact', head: true })
        .in('status', ['REGISTERING', 'RUNNING', 'ANNOUNCED']);

      return res.json({
        success: true,
        totalHorses: totalHorses || 0,
        seatedHorses: seatedHorses || 0,
        activeTables: activeTables || 0,
        activeTournaments: regTournaments || 0,
      });
    }

    // ═══════════════════════════════════════════════════════
    // SHUTDOWN
    // ═══════════════════════════════════════════════════════
    if (action === 'shutdown') {
      // Remove all horse seats
      const { data: horseIds } = await getSupabase()
        .from('profiles')
        .select('id')
        .eq('is_horse', true);
      const ids = (horseIds || []).map(h => h.id);

      if (ids.length > 0) {
        // Leave all cash tables
        const { error: err_table_seats_lud1v } = await getSupabase()
          .from('table_seats')
          .update({ left_at: new Date().toISOString() })
          .in('user_id', ids)
          .is('left_at', null);
        if (err_table_seats_lud1v) console.warn('[Supabase] Silent mutation failed in table_seats:', err_table_seats_lud1v.message);

        // Unregister from tournaments
        const { error: err_tournament_players_87u4a } = await getSupabase()
          .from('tournament_players')
          .update({ status: 'withdrawn' })
          .in('user_id', ids)
          .in('status', ['registered']);
        if (err_tournament_players_87u4a) console.warn('[Supabase] Silent mutation failed in tournament_players:', err_tournament_players_87u4a.message);

        // Reset horse status
        const { error: err_profiles_secno } = await getSupabase()
          .from('profiles')
          .update({ horse_status: 'active' })
          .eq('is_horse', true)
          .eq('horse_status', 'seated');
        if (err_profiles_secno) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_secno.message);
      }

      // Recount all tables
      const { data: tables } = await getSupabase()
        .from('tables')
        .select('id')
        .eq('status', 'active');
      for (const t of (tables || [])) {
        const { count } = await getSupabase()
          .from('table_seats')
          .select('*', { count: 'exact', head: true })
          .eq('table_id', t.id)
          .is('left_at', null);
        const { error: err_tables_ceuy2 } = await getSupabase().from('tables').update({ current_players: count ?? 0 }).eq('id', t.id);
        if (err_tables_ceuy2) console.warn('[Supabase] Silent mutation failed in tables:', err_tables_ceuy2.message);
      }

      return res.json({ success: true, action: 'shutdown', horsesRemoved: ids.length });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[horse-launch]', err);
    return res.status(500).json({ error: err.message || 'Launch failed', log });
  }
}
