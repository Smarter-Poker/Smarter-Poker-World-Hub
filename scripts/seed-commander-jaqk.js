#!/usr/bin/env node
/**
 * Comprehensive seed script for Club JAQK (venue_id: 1996) in Club Commander.
 * Populates all Commander tables with realistic test data.
 *
 * Schema-validated against production Supabase as of 2026-02-16.
 *
 * Usage: node scripts/seed-commander-jaqk.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996; // Club JAQK — integer FK to poker_venues.id
const VENUE_UUID = '005cddc8-ecd9-4cd9-aca1-b809609d1239'; // Club JAQK social_pages UUID (for UUID venue_id columns)
const uuid = () => crypto.randomUUID();
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
let inserted = 0;
let errors = 0;

async function insert(table, rows, selectCols = 'id') {
    const { data, error } = await sb.from(table).insert(rows).select(selectCols);
    if (error) {
        console.error(`  ❌ ${table}: ${error.message}`);
        errors++;
        return [];
    }
    const count = Array.isArray(data) ? data.length : 1;
    inserted += count;
    console.log(`  ✅ ${table}: ${count} rows inserted`);
    return data || [];
}

async function upsert(table, rows, selectCols = 'venue_id') {
    const { data, error } = await sb.from(table).upsert(rows).select(selectCols);
    if (error) {
        console.error(`  ❌ ${table}: ${error.message}`);
        errors++;
        return [];
    }
    const count = Array.isArray(data) ? data.length : 1;
    inserted += count;
    console.log(`  ✅ ${table}: ${count} rows upserted`);
    return data || [];
}

// Real profile IDs from the database (FK constraint on profiles.id)
const PROFILE_IDS = [
    '9b027798-9532-403f-a5c1-15554ce2959c', // Danimal
    'f39893fa-6830-49b6-9f80-b32191328ac0', // RangeBot_Rex
    '9b918b56-08d8-4a06-b8a0-de2bf4022303', // DeepStack_AI
    '262b4a43-9749-4994-b6e5-b4b107ead280', // FinalTestPoker
    'c1b575fb-3efd-43b6-b314-353e1d300aaa', // MusicCityAsh
    '0d8a22d1-8ea8-40d7-a821-10547198ff6c', // IndyBrian
    '7e616640-58dd-4d8d-a18e-2f37f057bcd9', // Burls
    'b6d34da3-9b2d-40b9-9dc3-8a46b74e651f', // CappedRange_CR
    '6cf64a8a-04db-458c-ab06-18f559163143', // FoldTo3B_F3B
    '113fc1bc-25f5-4508-8244-2aa3aa04a3cf', // RainbowFlop_R
    '6a1fad7d-e358-43d0-b019-13492c9d2bce', // RocketCityCal
    'de9802a0-3b0c-4155-abea-31a1a2bac68b', // DryFlop_DF
    'f1042170-33c9-4063-b427-910fe1683c72', // NutBlocker_NB
    'a23ca5c9-b748-482f-9b59-9db35f7aa996', // NOLASam
    '652899fd-f80c-4903-bd5c-9999c946ae49', // HartfordMel
    '8964a644-c3e0-4297-93d8-ab1113c363bc', // MKETyler
    'f847d6ec-06ba-4268-b6d0-5ec070143750', // BmoreCharles
    'f0dbd49e-0991-4f49-8d4a-a715694e96aa', // BostonKev
    '4d5ec8d4-375b-4656-8deb-8e9ab7d342b6', // CLEPatrick
    'c8f5500d-03f6-4cc8-a8f7-e439af601aba', // Whale_Wayne
    '70be5a51-133b-4bba-b262-6e2424c5bcfd', // RegFish_RF
    '6fdfcb70-b8f3-4ed1-89ca-a7d8af136dfc', // Station_Stan
    '64d37b1c-3907-4133-8902-9fb2ecad90f6', // Q10
    '9ca264f1-c0aa-4df9-bc39-1a97bdaad016', // marcelagorczak
    '90efbc2c-8ee2-445b-9ac3-d71f0106c602', // chase
    'f4567ffe-e2ab-4d95-994b-c3f345d79d3d', // test_dev_agent
    '5bbd93d5-5d24-4c3c-90f6-0f13f007b238', // SharkBot_SB
    '00000000-0000-0000-0000-000000000001', // SmarterPokerOfficial
    'cea20995-9f16-42fe-a3ee-7633f55a3ab2', // testuser_jetski_01
    'dbebfb3c-75a7-4d4f-a6de-f7d3b6af3cec', // Chase1
];

const PLAYER_NAMES = [
    { first: 'Marcus', last: 'Chen', tier: 'platinum' },
    { first: 'Sarah', last: 'Rodriguez', tier: 'gold' },
    { first: 'James', last: 'Williams', tier: 'gold' },
    { first: 'Emily', last: 'Nakamura', tier: 'gold' },
    { first: 'David', last: 'Okonkwo', tier: 'platinum' },
    { first: 'Olivia', last: 'Martin', tier: 'gold' },
    { first: 'Michael', last: 'Patel', tier: 'gold' },
    { first: 'Jessica', last: 'Thompson', tier: 'vip' },
    { first: 'Daniel', last: 'Kim', tier: 'platinum' },
    { first: 'Ashley', last: 'Garcia', tier: 'gold' },
    { first: 'Christopher', last: 'Lee', tier: 'gold' },
    { first: 'Amanda', last: 'Johnson', tier: 'gold' },
    { first: 'Robert', last: 'Nguyen', tier: 'gold' },
    { first: 'Stephanie', last: 'Brown', tier: 'gold' },
    { first: 'Kevin', last: 'Davis', tier: 'platinum' },
    { first: 'Megan', last: 'Wilson', tier: 'vip' },
    { first: 'Anthony', last: 'Moore', tier: 'gold' },
    { first: 'Lauren', last: 'Taylor', tier: 'gold' },
    { first: 'Brian', last: 'Anderson', tier: 'gold' },
    { first: 'Nicole', last: 'White', tier: 'gold' },
];

const STAFF_DEFS = [
    { role: 'owner', name: 'Daniel Bekavac', email: 'daniel@bekavactrading.com', phone: '5559001001', pin: '9001' },
    { role: 'manager', name: 'Maria Santos', email: 'maria.s@jaqk.com', phone: '5559001002', pin: '9002' },
    { role: 'manager', name: 'Tony Rizzo', email: 'tony.r@jaqk.com', phone: '5559001003', pin: '9003' },
    { role: 'floor', name: 'Jake Harper', email: 'jake.h@jaqk.com', phone: '5559001004', pin: '9004' },
    { role: 'floor', name: 'Lisa Chen', email: 'lisa.c@jaqk.com', phone: '5559001005', pin: '9005' },
    { role: 'dealer', name: 'Mike Torres', email: 'mike.t@jaqk.com', phone: '5559001006', pin: '9006' },
    { role: 'dealer', name: 'Jenny Park', email: 'jenny.p@jaqk.com', phone: '5559001007', pin: '9007' },
    { role: 'dealer', name: 'Carlos Vega', email: 'carlos.v@jaqk.com', phone: '5559001008', pin: '9008' },
    { role: 'brush', name: 'Sam Reeves', email: 'sam.r@jaqk.com', phone: '5559001009', pin: '9009' },
];

// ─────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('  CLUB JAQK (venue 1996) — Seed Data Script');
    console.log('  Schema-validated 2026-02-16');
    console.log('═══════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════
    //  PHASE 1: Core Infrastructure
    // ═══════════════════════════════════════════════════
    console.log('── Phase 1: Core Infrastructure ──────────────\n');

    // 1a. Venue Settings
    // Actual columns: venue_id, hard_stop_enabled, hard_stop_time, room_open,
    //   default_game_type, default_stakes, max_tables, default_seats_per_table,
    //   time_billing_rate, late_reg_levels, default_starting_chips, house_rules,
    //   updated_at, updated_by, last_hard_stop_date
    // venue_settings PK is venue_id, not id
    await upsert('commander_venue_settings', [{
        venue_id: VENUE_ID,
        hard_stop_enabled: true,
        hard_stop_time: '02:00:00',
        room_open: true,
        default_game_type: 'nlh',
        default_stakes: '1/2',
        max_tables: 20,
        default_seats_per_table: 9,
        time_billing_rate: 8,
        late_reg_levels: 6,
        default_starting_chips: 20000,
        house_rules: 'Standard JAQK poker room rules. No electronic devices at the table during a hand. English only at the table during a hand.',
    }]);

    // 1b. Staff — user_id is FK to profiles.id (must use real profile IDs)
    // Check if staff already exists for this venue
    const { data: existingStaff } = await sb.from('commander_staff').select('id').eq('venue_id', VENUE_ID);
    let STAFF_IDS;
    if (existingStaff && existingStaff.length >= 9) {
        STAFF_IDS = existingStaff.map(s => s.id);
        console.log(`  ⏭️  commander_staff: ${existingStaff.length} rows already exist, skipping`);
    } else {
        const staffRows = STAFF_DEFS.map((s, i) => ({
            venue_id: VENUE_ID,
            user_id: PROFILE_IDS[i],
            role: s.role,
            display_name: s.name,
            email: s.email,
            phone: s.phone,
            pin_code: s.pin,
            is_active: true,
            permissions: {},
            hired_at: ago(rand(90, 365)),
        }));
        const staffResult = await insert('commander_staff', staffRows);
        STAFF_IDS = staffResult.map(s => s.id);
    }

    // 1c. Members (20 realistic players)
    // membership_tier check constraint: 'bronze', 'silver', 'gold' known to work
    const memberRows = PLAYER_NAMES.map((p, i) => ({
        venue_id: VENUE_ID,
        member_number: `JAQK-${String(i + 1).padStart(5, '0')}`,
        qr_code: `CMD-${VENUE_ID}-${uuid().substring(0, 8)}`,
        first_name: p.first,
        last_name: p.last,
        email: `${p.first.toLowerCase()}.${p.last.toLowerCase()}@email.com`,
        phone: `555100${String(1001 + i)}`,
        id_type: pick(['drivers_license', 'passport', 'state_id']),
        membership_tier: p.tier,
        membership_status: 'active',
        total_visits: rand(5, 120),
        total_hours_played: rand(20, 800),
        last_visit: ago(rand(0, 14)),
        address: { street: `${rand(100, 9999)} Main St`, city: 'Houston', state: 'TX', zip: '77001' },
        notes: i % 5 === 0 ? 'VIP regular — prefers seat 1 or 9' : null,
        comp_balance: 0,
        comp_lifetime_earned: 0,
        comp_lifetime_redeemed: 0,
    }));
    const memberResult = await insert('commander_members', memberRows);
    const MEMBER_IDS = memberResult.map(m => m.id);

    // 1d. Game Types
    // Actual columns: id, venue_id, name, short_code, stakes, min_buyin, max_buyin,
    //   max_players, rake_type, rake_percent, rake_cap, time_rate, is_active, sort_order, color, notes
    await insert('commander_game_types', [
        { venue_id: VENUE_ID, name: 'NL Hold\'em 1/2', short_code: 'NLH12', stakes: '1/2', min_buyin: 100, max_buyin: 300, max_players: 9, is_active: true, sort_order: 1, color: '#22D3EE' },
        { venue_id: VENUE_ID, name: 'NL Hold\'em 2/5', short_code: 'NLH25', stakes: '2/5', min_buyin: 200, max_buyin: 1000, max_players: 9, is_active: true, sort_order: 2, color: '#A78BFA' },
        { venue_id: VENUE_ID, name: 'NL Hold\'em 5/10', short_code: 'NLH510', stakes: '5/10', min_buyin: 500, max_buyin: 3000, max_players: 9, is_active: true, sort_order: 3, color: '#F59E0B' },
        { venue_id: VENUE_ID, name: 'PLO 1/2/5', short_code: 'PLO125', stakes: '1/2', min_buyin: 200, max_buyin: 500, max_players: 9, is_active: true, sort_order: 4, color: '#10B981' },
        { venue_id: VENUE_ID, name: 'PLO 2/5/10', short_code: 'PLO2510', stakes: '2/5', min_buyin: 500, max_buyin: 2000, max_players: 9, is_active: true, sort_order: 5, color: '#EC4899' },
        { venue_id: VENUE_ID, name: 'Mixed Game', short_code: 'MIX510', stakes: '5/10', min_buyin: 500, max_buyin: 2000, max_players: 9, is_active: true, sort_order: 6, color: '#EF4444' },
    ]);

    // ═══════════════════════════════════════════════════
    //  PHASE 2: Comp System (USER PRIORITY)
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 2: Comp System ──────────────────────\n');

    // 2a. Comp Rates — rate_type values: 'hourly', 'tournament', 'session'
    await insert('commander_comp_rates', [
        { venue_id: VENUE_ID, name: 'Standard 1/2 Rate', rate_type: 'hourly', comp_value: 1, per_unit: 1, unit_label: 'hour', min_stakes: '1/2', game_types: ['nlh'], is_active: true, is_default: true, weekday_multiplier: 1, weekend_multiplier: 1.5, vip_multiplier: 2 },
        { venue_id: VENUE_ID, name: 'Mid-Stakes 2/5 Rate', rate_type: 'hourly', comp_value: 2, per_unit: 1, unit_label: 'hour', min_stakes: '2/5', game_types: ['nlh', 'plo'], is_active: true, is_default: false, weekday_multiplier: 1, weekend_multiplier: 1.5, vip_multiplier: 2 },
        { venue_id: VENUE_ID, name: 'High-Stakes 5/10 Rate', rate_type: 'hourly', comp_value: 4, per_unit: 1, unit_label: 'hour', min_stakes: '5/10', game_types: ['nlh', 'plo', 'mixed'], is_active: true, is_default: false, weekday_multiplier: 1, weekend_multiplier: 2, vip_multiplier: 3 },
        { venue_id: VENUE_ID, name: 'Tournament Entry Comp', rate_type: 'tournament', comp_value: 5, per_unit: 1, unit_label: 'event', min_stakes: null, game_types: ['tournament'], is_active: true, is_default: false, weekday_multiplier: 1, weekend_multiplier: 1, vip_multiplier: 1.5 },
    ]);

    // 2b. Comp Balances — player_id is FK to profiles.id (real UUIDs)
    const compBalances = PROFILE_IDS.slice(0, 20).map((pid, i) => {
        const earned = rand(200, 3000);
        const redeemed = rand(50, Math.floor(earned * 0.6));
        const expired = rand(0, 50);
        return {
            venue_id: VENUE_ID,
            player_id: pid,
            current_balance: earned - redeemed - expired,
            lifetime_earned: earned,
            lifetime_redeemed: redeemed,
            lifetime_expired: expired,
            lifetime_adjusted: i % 5 === 0 ? rand(10, 50) : 0,
            last_earned_at: ago(rand(0, 7)),
            last_redeemed_at: ago(rand(1, 30)),
            is_frozen: i === 19,
            frozen_reason: i === 19 ? 'Account under review' : null,
        };
    });
    await insert('commander_comp_balances', compBalances);

    // 2c. Comp Transactions — transaction_type: 'earn', 'redeem', 'adjust'
    const txTypePicks = ['earn', 'earn', 'earn', 'redeem', 'earn', 'adjust', 'earn', 'earn'];
    const compTxs = [];
    for (let d = 0; d < 30; d++) {
        const numTxs = rand(1, 4);
        for (let t = 0; t < numTxs; t++) {
            const pid = pick(PROFILE_IDS.slice(0, 20));
            const type = pick(txTypePicks);
            const amount = type === 'earn' ? rand(2, 20)
                : type === 'redeem' ? -rand(5, 30)
                    : rand(-20, 20);
            const balBefore = rand(100, 1500);
            compTxs.push({
                venue_id: VENUE_ID,
                player_id: pid,
                transaction_type: type,
                amount,
                balance_before: balBefore,
                balance_after: balBefore + amount,
                source_type: type === 'earn' ? 'session' : type === 'redeem' ? 'redemption' : 'manual',
                multiplier: type === 'earn' && d % 6 === 0 ? 1.5 : 1,
                hours_played: type === 'earn' ? rand(2, 8) : null,
                description: type === 'earn' ? `${rand(2, 8)}hrs at ${pick(['1/2 NLH', '2/5 NLH', 'PLO 1/2', '5/10 NLH'])}`
                    : type === 'redeem' ? `Comp redeemed — ${pick(['food voucher', 'restaurant', 'merchandise', 'tournament entry'])}`
                        : 'Manual adjustment by manager',
                approved_by: STAFF_IDS.length ? pick(STAFF_IDS) : null,
                metadata: {},
                created_at: ago(d + Math.random()),
            });
        }
    }
    await insert('commander_comp_transactions', compTxs);

    // 2d. Comp Redemptions
    // Actual columns: id, transaction_id, venue_id(int), player_id(uuid FK profiles),
    //   redemption_type, comp_amount, cash_value, description, item_details, processed_by, processed_at, status, notes
    // Valid redemption_type: food, merchandise, hotel, cash, other
    const redemptionTypes = ['food', 'merchandise', 'hotel', 'cash', 'food', 'food', 'other'];
    const compRedemptions = [];
    for (let i = 0; i < 15; i++) {
        const pid = pick(PROFILE_IDS.slice(0, 20));
        const rType = pick(redemptionTypes);
        const compAmt = rType === 'hotel' ? rand(50, 200) : rType === 'tournament_entry' ? rand(20, 100) : rand(5, 40);
        compRedemptions.push({
            venue_id: VENUE_ID,
            player_id: pid,
            redemption_type: rType,
            comp_amount: compAmt,
            cash_value: compAmt * 0.8,
            description: rType === 'food' ? pick(['Lunch buffet', 'Dinner voucher', '$20 food credit', 'Breakfast comp', 'Restaurant credit'])
                : rType === 'merchandise' ? pick(['JAQK branded hoodie', 'Card protector', 'Poker chip set', 'T-shirt'])
                    : rType === 'hotel' ? 'Hotel room comp — 1 night'
                        : rType === 'cash' ? 'Cash comp payout'
                            : 'Miscellaneous comp redemption',
            status: i < 12 ? 'completed' : (i === 12 ? 'pending' : 'cancelled'),
            processed_by: STAFF_IDS.length ? pick(STAFF_IDS) : null,
            processed_at: i < 12 ? ago(rand(1, 45)) : null,
            created_at: ago(rand(1, 45)),
        });
    }
    await insert('commander_comp_redemptions', compRedemptions);

    // 2e. Member Comp Log
    // Actual columns: id, venue_id(int), member_id(uuid FK), amount, type, reason,
    //   authorized_by, authorized_pin, processed_by, balance_after
    const memberCompLog = [];
    for (let i = 0; i < 25; i++) {
        memberCompLog.push({
            venue_id: VENUE_ID,
            member_id: MEMBER_IDS.length ? pick(MEMBER_IDS) : uuid(),
            amount: rand(-30, 60),
            type: pick(['earn', 'redeem', 'adjust', 'bonus']),
            reason: pick(['Hourly comp earned', 'Food voucher redeemed', 'Manager adjustment', 'Monthly expiration', 'VIP bonus']),
            authorized_by: pick(STAFF_DEFS).name,
            authorized_pin: true,
            processed_by: STAFF_IDS.length ? pick(STAFF_IDS) : null,
            balance_after: rand(50, 1500),
            created_at: ago(rand(0, 30)),
        });
    }
    await insert('commander_member_comp_log', memberCompLog);

    // ═══════════════════════════════════════════════════
    //  PHASE 3: Operations
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 3: Operations ──────────────────────\n');

    // 3a. High Hands
    // Actual columns: id, venue_id(int), promotion_id(uuid FK), player_id(uuid FK profiles),
    //   table_id(uuid FK), game_id(uuid FK), hand_rank, cards, board_cards,
    //   prize_amount, verified, verified_by(uuid FK profiles), verified_at, notes, status
    const handDescs = [
        { desc: 'Quad Aces', cards: ['Ah', 'Ad'], board: ['Ac', 'As', 'Kh', '7d', '3c'], rank: 'Quad Aces' },
        { desc: 'Straight Flush 9-K Hearts', cards: ['Kh', 'Qh'], board: ['Jh', 'Th', '9h', '3d', '2c'], rank: 'Straight Flush' },
        { desc: 'Quad Kings', cards: ['Kd', 'Kc'], board: ['Ks', 'Kh', 'Ah', '5d', '2c'], rank: 'Quad Kings' },
        { desc: 'Full House Aces/Kings', cards: ['Ah', 'Ac'], board: ['Ad', 'Kh', 'Ks', '7d', '3c'], rank: 'Full House Aces over Kings' },
        { desc: 'Quad Queens', cards: ['Qh', 'Qd'], board: ['Qc', 'Qs', 'Ah', '7d', '3c'], rank: 'Quad Queens' },
        { desc: 'Straight Flush 5-9 Spades', cards: ['8s', '9s'], board: ['7s', '6s', '5s', 'Kd', '2c'], rank: 'Straight Flush' },
        { desc: 'Quad Jacks', cards: ['Jh', 'Jd'], board: ['Jc', 'Js', 'Ah', '7d', '3c'], rank: 'Quad Jacks' },
        { desc: 'Full House Kings/Aces', cards: ['Kh', 'Kd'], board: ['Kc', 'Ah', 'As', '7d', '3c'], rank: 'Full House Kings over Aces' },
        { desc: 'Quad Tens', cards: ['Th', 'Td'], board: ['Tc', 'Ts', 'Ah', '7d', '3c'], rank: 'Quad Tens' },
        { desc: 'Royal Flush Hearts', cards: ['Ah', 'Kh'], board: ['Qh', 'Jh', 'Th', '3d', '2c'], rank: 'Royal Flush' },
    ];
    const highHands = handDescs.map((h, i) => ({
        venue_id: VENUE_ID,
        player_id: PROFILE_IDS[i],
        hand_rank: h.rank,
        cards: h.cards,
        board_cards: h.board,
        prize_amount: h.rank.includes('Royal') || h.rank.includes('Straight Flush') ? rand(200, 1000) : rand(25, 200),
        verified: true,
        verified_by: PROFILE_IDS[0],
        verified_at: ago(rand(0, 30)),
        notes: `${h.desc} — Table T${rand(1, 12)} during ${pick(['afternoon', 'evening', 'late night'])} session`,
        status: 'verified',
        created_at: ago(rand(0, 30)),
    }));
    await insert('commander_high_hands', highHands);

    // 3b. Floor Calls
    // Actual columns: id, venue_id(uuid!), table_number(int), reason, description,
    //   priority, status, called_by, responded_by(uuid), responded_at, resolution
    const floorCallReasons = ['seat_change', 'dispute', 'chip_request', 'dealer_issue', 'rules_question', 'player_complaint', 'table_transfer', 'break_request'];
    // NOTE: venue_id is UUID type for floor_calls — need to look up venue UUID
    // Actually let's check: the FK spec says venue_id is UUID but venue 1996 is an integer.
    // The existing data from P1 scripts used integer venue_id. Let's try integer as string UUID won't work.
    // Actually spec says `venue_id: string uuid` — this table might use a different FK ref.
    // Let's skip FK and just insert with a matching mechanism
    const floorCalls = floorCallReasons.map((reason, i) => ({
        venue_id: VENUE_UUID,
        table_number: rand(1, 12),
        reason,
        description: reason === 'dispute' ? 'Side pot calculation dispute between seat 3 and seat 7'
            : reason === 'seat_change' ? 'Player requests move to 2/5 table, currently on waitlist'
                : reason === 'chip_request' ? 'Need chip runner for Table 6, player buying in $500'
                    : reason === 'dealer_issue' ? 'Dealer push needed — break overdue'
                        : reason === 'rules_question' ? 'String bet ruling needed'
                            : reason === 'player_complaint' ? 'Excessive tanking complaint from multiple players'
                                : reason === 'table_transfer' ? 'Seat open at 5/10, player requesting transfer'
                                    : 'Player requests extra break time',
        priority: reason === 'dispute' ? 'high' : (reason === 'rules_question' ? 'medium' : 'normal'),
        status: i < 5 ? 'resolved' : (i === 5 ? 'in_progress' : 'open'),
        called_by: PLAYER_NAMES[i].first + ' ' + PLAYER_NAMES[i].last,
        responded_by: STAFF_IDS.length ? pick(STAFF_IDS) : null,
        responded_at: i < 5 ? ago(rand(0, 7)) : null,
        resolution: i < 5 ? 'Resolved by floor manager' : null,
        created_at: ago(rand(0, 14)),
    }));
    await insert('commander_floor_calls', floorCalls);

    // 3c. Activity Log
    // Actual columns: id, venue_id(uuid!), event_type, message, detail, actor_id(uuid),
    //   actor_name, member_id(uuid), table_number(int), metadata, created_at
    const activityTypes = ['check_in', 'table_open', 'table_close', 'tournament_start', 'tournament_end', 'high_hand', 'comp_issued', 'member_join', 'waitlist_add', 'shift_change', 'floor_call', 'announcement'];
    const activityLog = [];
    for (let d = 0; d < 14; d++) {
        const numEntries = rand(2, 5);
        for (let e = 0; e < numEntries; e++) {
            const type = pick(activityTypes);
            // venue_id is UUID type for this table
            activityLog.push({
                venue_id: VENUE_UUID,
                event_type: type,
                message: type === 'check_in' ? `${pick(PLAYER_NAMES).first} ${pick(PLAYER_NAMES).last} checked in`
                    : type === 'table_open' ? `Table T${rand(1, 12)} opened — ${pick(['1/2 NLH', '2/5 NLH', 'PLO 1/2', '5/10 NLH'])}`
                        : type === 'table_close' ? `Table T${rand(1, 12)} closed`
                            : type === 'tournament_start' ? 'JAQK Nightly Turbo started'
                                : type === 'tournament_end' ? 'Tuesday Morning Grind completed'
                                    : type === 'high_hand' ? `New high hand: ${pick(handDescs).desc}`
                                        : type === 'comp_issued' ? `Comp issued to ${pick(PLAYER_NAMES).first} ${pick(PLAYER_NAMES).last}`
                                            : type === 'member_join' ? `New member: ${pick(PLAYER_NAMES).first} ${pick(PLAYER_NAMES).last}`
                                                : type === 'waitlist_add' ? `${pick(PLAYER_NAMES).first} added to 2/5 waitlist`
                                                    : type === 'shift_change' ? 'Shift change: Night → Graveyard'
                                                        : type === 'floor_call' ? 'Floor called to Table T' + rand(1, 12)
                                                            : 'Weekend promotion announced',
                actor_id: STAFF_IDS.length ? pick(STAFF_IDS) : null,
                actor_name: pick(STAFF_DEFS).name,
                table_number: ['table_open', 'table_close', 'floor_call'].includes(type) ? rand(1, 12) : null,
                metadata: {},
                created_at: ago(d + Math.random()),
            });
        }
    }
    await insert('commander_activity_log', activityLog);

    // 3d. Room Presets
    // Actual columns: id, venue_id(int FK poker_venues), name, description, tables(jsonb),
    //   is_default, auto_apply_schedule, created_by, last_applied_at
    await insert('commander_room_presets', [
        { venue_id: VENUE_ID, name: 'Weekend Rush', description: 'Full room — all games running, max capacity', tables: { total: 16, nlh_1_2: 6, nlh_2_5: 4, plo_1_2: 3, nlh_5_10: 2, mixed: 1 }, is_default: false, created_by: STAFF_IDS[0] || null },
        { venue_id: VENUE_ID, name: 'Quiet Weeknight', description: 'Reduced offering — core games only', tables: { total: 8, nlh_1_2: 4, nlh_2_5: 2, plo_1_2: 1, mixed: 1 }, is_default: false, created_by: STAFF_IDS[0] || null },
        { venue_id: VENUE_ID, name: 'Tournament Night', description: 'Tournament priority layout — reduced cash games', tables: { total: 12, nlh_1_2: 3, nlh_2_5: 2, tournament: 7 }, is_default: true, created_by: STAFF_IDS[0] || null },
    ]);

    // 3e. Seat Preferences
    // Actual columns: id, player_id(uuid), venue_id(uuid!), preferred_seats(int[]),
    //   left_handed, near_tv, away_from_tv, notes, updated_at
    const seatPrefs = PROFILE_IDS.slice(0, 10).map((pid) => ({
        player_id: pid,
        preferred_seats: [rand(1, 3), rand(7, 9)],
        left_handed: Math.random() > 0.8,
        near_tv: Math.random() > 0.5,
        away_from_tv: false,
        notes: pick([null, 'Likes to be near dealer', 'Prefers quiet end', 'Wants seat facing TV', null]),
        updated_at: new Date().toISOString(),
    }));
    await insert('commander_seat_preferences', seatPrefs);

    // 3f. Notification Log
    // Actual columns: id, user_id(uuid FK profiles), group_id(uuid FK home_groups),
    //   announcement_id(uuid FK), notification_type, title, body, channel, status,
    //   sent_at, delivered_at, read_at, error_message, metadata
    const notifTypes = ['comp_earned', 'comp_redeemed', 'waitlist_called', 'tournament_reminder', 'promotion', 'high_hand_alert', 'shift_reminder', 'maintenance'];
    const notifLog = [];
    for (let i = 0; i < 20; i++) {
        const type = pick(notifTypes);
        notifLog.push({
            user_id: PROFILE_IDS[i % 20],
            notification_type: type,
            title: type === 'comp_earned' ? 'Comps Earned'
                : type === 'comp_redeemed' ? 'Comp Redeemed'
                    : type === 'waitlist_called' ? 'Your Seat is Ready!'
                        : type === 'tournament_reminder' ? 'Tournament Starting Soon'
                            : type === 'promotion' ? 'New Promotion Available'
                                : type === 'high_hand_alert' ? 'New High Hand!'
                                    : type === 'shift_reminder' ? 'Shift Starting in 30min'
                                        : 'Scheduled Maintenance',
            body: type === 'comp_earned' ? `You earned $${rand(2, 15)} in comps for your ${rand(2, 8)}hr session`
                : type === 'waitlist_called' ? 'Please report to the brush stand within 5 minutes'
                    : type === 'tournament_reminder' ? 'JAQK Nightly Turbo starts in 15 minutes'
                        : 'Check Commander for details',
            channel: pick(['push', 'sms', 'in_app', 'email']),
            status: i < 16 ? 'delivered' : (i < 18 ? 'pending' : 'failed'),
            sent_at: i < 16 ? ago(rand(0, 14)) : null,
            delivered_at: i < 12 ? ago(rand(0, 14)) : null,
            metadata: {},
            created_at: ago(rand(0, 14)),
        });
    }
    await insert('commander_notification_log', notifLog);

    // 3g. Shift Handoffs
    // Actual columns: id, venue_id(uuid!), outgoing_staff_id, outgoing_staff_name,
    //   incoming_staff_id, incoming_staff_name, shift_date(date), handoff_time(timestamptz),
    //   acknowledged_at, status, open_tables_count, active_players_count, waitlist_count,
    //   open_incidents_count, notes, issues, vip_alerts, pending_actions, table_snapshot
    const shiftHandoffs = [];
    for (let i = 0; i < 5; i++) {
        const outIdx = i % STAFF_IDS.length;
        const inIdx = (i + 1) % STAFF_IDS.length;
        const shiftDate = new Date(Date.now() - (i * 2 + 1) * 86400000);
        shiftHandoffs.push({
            venue_id: VENUE_UUID,
            outgoing_staff_id: STAFF_IDS[outIdx] || uuid(),
            outgoing_staff_name: STAFF_DEFS[outIdx].name,
            incoming_staff_id: STAFF_IDS[inIdx] || uuid(),
            incoming_staff_name: STAFF_DEFS[inIdx].name,
            shift_date: shiftDate.toISOString().split('T')[0],
            handoff_time: shiftDate.toISOString(),
            status: 'completed',
            open_tables_count: rand(6, 16),
            active_players_count: rand(30, 120),
            waitlist_count: rand(0, 15),
            open_incidents_count: rand(0, 3),
            notes: pick([
                'Table 7 has an ongoing dispute — player in seat 4. Floor is monitoring.',
                'All tables running smooth. 2/5 waitlist is 6 deep.',
                'Chip inventory low on $25 chips — restock before weekend.',
                'VIP player Marcus Chen arriving around 8pm — reserved seat at 5/10.',
                '3 dealers called out — may need to combine tables if it stays slow.',
            ]),
            vip_alerts: i === 0 ? 'Marcus Chen expected at 8pm, reserved 5/10 seat' : null,
            table_snapshot: {},
            created_at: shiftDate.toISOString(),
        });
    }
    await insert('commander_shift_handoffs', shiftHandoffs);

    // 3h. Progressive Jackpots
    // Actual columns: id, promotion_id(uuid FK), venue_id(int FK), name, current_amount, seed_amount, status
    await insert('commander_progressive_jackpots', [
        {
            venue_id: VENUE_ID,
            name: 'Bad Beat Jackpot — NLH',
            current_amount: 12450.00,
            seed_amount: 5000.00,
            status: 'active',
        },
        {
            venue_id: VENUE_ID,
            name: 'High Hand Bonus',
            current_amount: 500.00,
            seed_amount: 500.00,
            status: 'active',
        },
    ]);

    // 3i. Player Reputation
    // Actual columns: id, player_id(uuid), reviewer_id(uuid), reviewer_type(text),
    //   venue_id(uuid!), reliability(int), sportsmanship(int), etiquette(int),
    //   communication(int), comment, context
    const repScores = [];
    for (let i = 0; i < 10; i++) {
        repScores.push({
            player_id: PROFILE_IDS[i],
            reviewer_id: PROFILE_IDS[(i + 10) % 20],
            reviewer_type: 'staff',
            reliability: rand(3, 5),
            sportsmanship: rand(3, 5),
            etiquette: rand(3, 5),
            communication: rand(3, 5),
            comment: pick([
                'Great player, always respectful at the table',
                'Consistent regular, follows all house rules',
                'Occasional angle shooting behavior observed',
                'Excellent sportsmanship, good for the game',
                'Can be slow but generally cooperative',
            ]),
            context: pick(['cash_game', 'tournament', 'general']),
            created_at: ago(rand(0, 30)),
        });
    }
    await insert('commander_player_reputation', repScores);

    // ═══════════════════════════════════════════════════
    //  PHASE 4: Financial
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 4: Financial ───────────────────────\n');

    // 4a. Cash Transactions
    // Actual columns: id, venue_id(uuid!), session_id(uuid), player_name(text req),
    //   table_number(int), seat_number(int), type(text req), amount(numeric req),
    //   chip_count, payment_method, processed_by(uuid), notes
    const cashTxs = [];
    for (let i = 0; i < 20; i++) {
        const player = pick(PLAYER_NAMES);
        const isBuyin = i % 3 !== 0;
        cashTxs.push({
            venue_id: VENUE_UUID,
            player_name: `${player.first} ${player.last}`,
            table_number: rand(1, 12),
            seat_number: rand(1, 9),
            type: isBuyin ? 'buy_in' : 'cash_out',
            amount: isBuyin ? pick([100, 200, 300, 500, 1000]) : pick([150, 350, 600, 1200, 2500]),
            payment_method: isBuyin ? pick(['cash', 'card', 'app']) : 'cash',
            processed_by: STAFF_IDS.length ? pick(STAFF_IDS) : null,
            created_at: ago(rand(0, 14)),
        });
    }
    await insert('commander_cash_transactions', cashTxs);

    // 4b. Escrow Transactions
    // Actual columns: id, home_game_id(uuid FK), player_id(uuid FK profiles), amount(numeric req),
    //   status, payment_method
    const escrowTxs = [];
    for (let i = 0; i < 5; i++) {
        escrowTxs.push({
            player_id: PROFILE_IDS[i],
            amount: pick([200, 500, 1000, 1500, 2000]),
            status: i < 3 ? 'released' : (i === 3 ? 'held' : 'expired'),
            payment_method: pick(['cash', 'venmo', 'zelle', 'card']),
            created_at: ago(rand(0, 14)),
        });
    }
    await insert('commander_escrow_transactions', escrowTxs);

    // ═══════════════════════════════════════════════════
    //  DONE
    // ═══════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  COMPLETE: ${inserted} rows inserted, ${errors} errors`);
    console.log('═══════════════════════════════════════════════\n');

    if (errors > 0) {
        process.exit(1);
    }
})();
