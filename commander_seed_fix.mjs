/**
 * Commander Seed - Fix: Seed the 3 tables that failed in Part 2
 */
import {
    uuid, randomInt, randomPick, randomDate, dateAgo,
    insert, fetchExisting, PLAYER_NAMES,
} from './commander_seed_helpers.mjs';

async function main() {
    console.log('\n🔧 COMMANDER SEED — Fixing 3 failed tables\n');

    const venues = await fetchExisting('poker_venues', 'id', 1);
    const profiles = await fetchExisting('profiles', 'id', 50);
    const staff = await fetchExisting('commander_staff', 'id', 20);
    const VENUE_ID = venues[0].id;
    const userIds = profiles.map(p => p.id);
    const pick = () => randomPick(userIds);
    const staffIds = staff.map(s => s.id);

    // ─── COMP RATES (5) — rate_type: hourly|buyin|session|tournament ───
    console.log('── Comp Rates ──');
    const compRateRows = [
        { name: 'Standard Cash Rate', rate_type: 'hourly', comp_value: 1.00, per_unit: 1, unit_label: 'hour', min_stakes: '1/2', is_default: true },
        { name: 'Mid-Stakes Rate', rate_type: 'hourly', comp_value: 2.00, per_unit: 1, unit_label: 'hour', min_stakes: '2/5', is_default: false },
        { name: 'High-Stakes Rate', rate_type: 'hourly', comp_value: 5.00, per_unit: 1, unit_label: 'hour', min_stakes: '5/10', is_default: false },
        { name: 'Tournament Comp', rate_type: 'tournament', comp_value: 5.00, per_unit: 1, unit_label: 'tournament', min_stakes: null, is_default: false },
        { name: 'VIP Bonus Rate', rate_type: 'session', comp_value: 3.00, per_unit: 1, unit_label: 'session', min_stakes: '1/2', is_default: false },
    ].map(r => ({ id: uuid(), venue_id: VENUE_ID, ...r, game_types: ['nlh', 'plo'], is_active: true, weekday_multiplier: 1.0, weekend_multiplier: 1.5, vip_multiplier: 2.0 }));
    await insert('commander_comp_rates', compRateRows);

    // ─── COMP TRANSACTIONS (40) — transaction_type: earn|redeem|adjust|expire ───
    console.log('── Comp Transactions ──');
    const compTxRows = [];
    for (let i = 0; i < 40; i++) {
        const isEarn = Math.random() > 0.3;
        compTxRows.push({
            id: uuid(), venue_id: VENUE_ID, player_id: pick(),
            transaction_type: isEarn ? 'earn' : randomPick(['redeem', 'adjust', 'expire']),
            amount: isEarn ? randomInt(1, 50) : -randomInt(1, 50),
            balance_before: randomInt(10, 500), balance_after: randomInt(10, 500),
            source_type: isEarn ? 'session' : 'redemption',
            hours_played: isEarn ? randomInt(1, 8) : null,
            description: isEarn ? 'Comp earned for cash game' : 'Comp redeemed',
            created_at: randomDate(30),
        });
    }
    await insert('commander_comp_transactions', compTxRows);

    // ─── AUDIT LOGS (100) — action_category: auth|waitlist|game|table|tournament|player|promotion|comp|settings|staff|export|admin ───
    console.log('── Audit Logs ──');
    const auditActions = [
        { action: 'login', cat: 'auth' }, { action: 'logout', cat: 'auth' },
        { action: 'seat_player', cat: 'waitlist' }, { action: 'unseat_player', cat: 'waitlist' },
        { action: 'add_to_waitlist', cat: 'waitlist' }, { action: 'remove_from_waitlist', cat: 'waitlist' },
        { action: 'open_table', cat: 'table' }, { action: 'close_table', cat: 'table' },
        { action: 'start_game', cat: 'game' }, { action: 'end_game', cat: 'game' },
        { action: 'create_tournament', cat: 'tournament' }, { action: 'register_player', cat: 'tournament' },
        { action: 'eliminate_player', cat: 'tournament' }, { action: 'award_promotion', cat: 'promotion' },
        { action: 'update_settings', cat: 'settings' }, { action: 'export_data', cat: 'export' },
        { action: 'create_incident', cat: 'admin' }, { action: 'resolve_incident', cat: 'admin' },
        { action: 'issue_comp', cat: 'comp' }, { action: 'redeem_comp', cat: 'comp' },
    ];
    const auditRows = [];
    for (let i = 0; i < 100; i++) {
        const a = randomPick(auditActions);
        auditRows.push({
            id: uuid(), venue_id: VENUE_ID,
            staff_id: staffIds.length ? randomPick(staffIds) : null,
            actor_type: 'staff', actor_name: `Staff ${randomInt(1, 12)}`,
            action: a.action, action_category: a.cat,
            target_type: a.cat === 'player' || a.cat === 'waitlist' ? 'player' : 'system',
            target_name: randomPick(PLAYER_NAMES), status: 'success',
            created_at: randomDate(30),
        });
    }
    await insert('commander_audit_logs', auditRows);

    console.log('\n✅ Fix complete!\n');
}

main().catch(console.error);
