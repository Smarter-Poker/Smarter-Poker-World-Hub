/**
 * Commander Seed - Part 1: Foundation, Waitlist, Tables & Floor
 * CHECK CONSTRAINTS: All enum values validated against COMMANDER_FULL_SCHEMA.sql
 */
import {
    uuid, randomInt, randomPick, randomDate, dateAgo, today,
    insert, fetchExisting, PLAYER_NAMES, DEALER_NAMES,
} from './commander_seed_helpers.mjs';

async function main() {
    console.log('\n🌱 COMMANDER SEED — Part 1: Foundation, Waitlist, Tables & Floor\n');

    const venues = await fetchExisting('poker_venues', 'id,name', 10);
    const profiles = await fetchExisting('profiles', 'id,username,display_name', 50);

    if (!venues.length || !profiles.length) { console.error('Need existing venues and profiles!'); process.exit(1); }

    const VENUE_ID = venues[0].id;
    console.log(`  Using venue: ${venues[0].name} (${VENUE_ID})`);
    const userIds = profiles.map(p => p.id);
    const pick = () => randomPick(userIds);

    // ─── 1. STAFF (12) — role: owner|manager|floor|brush|dealer ───
    console.log('\n── Staff ──');
    const staffRoles = ['owner', 'manager', 'manager', 'floor', 'floor', 'floor', 'dealer', 'dealer', 'dealer', 'dealer', 'brush', 'brush'];
    const staffRows = staffRoles.map((role, i) => ({
        id: uuid(), venue_id: VENUE_ID, user_id: userIds[i % userIds.length],
        role, display_name: `Staff_${role}_${i + 1}`,
        email: `staff${i + 1}@venue.com`, phone: `555-010-${String(i).padStart(4, '0')}`,
        pin_code: String(1000 + i), is_active: true, hired_at: dateAgo(randomInt(30, 365)),
    }));
    const staffData = await insert('commander_staff', staffRows);
    const staffIds = staffData ? staffData.map(s => s.id) : [];

    // ─── 2. TABLES (15) — status: available|in_use|reserved|maintenance ───
    console.log('\n── Tables ──');
    const tblStatuses = ['in_use', 'in_use', 'in_use', 'in_use', 'in_use', 'in_use',
        'in_use', 'in_use', 'in_use', 'in_use', 'reserved', 'reserved', 'available', 'available', 'maintenance'];
    const tableRows = tblStatuses.map((status, i) => ({
        id: uuid(), venue_id: VENUE_ID, table_number: i + 1, table_name: `Table ${i + 1}`,
        max_seats: i < 10 ? 9 : 6, status,
        game_type: i < 6 ? 'nlh' : i < 9 ? 'plo' : randomPick(['nlh', 'plo', 'stud']),
        stakes: i < 3 ? '1/3' : i < 6 ? '2/5' : i < 9 ? '5/10' : '1/2',
        position_x: (i % 5) * 200 + 100, position_y: Math.floor(i / 5) * 200 + 100,
        player_count: status === 'in_use' ? randomInt(3, 9) : 0,
        occupied_seats: status === 'in_use' ? randomInt(3, 9) : 0,
        mode: 'cash',
    }));
    const tableData = await insert('commander_tables', tableRows);
    const tableIds = tableData ? tableData.map(t => t.id) : [];

    // ─── 3. GAMES (10) — game_type: nlh|plo|plo5|mixed|limit|stud|razz|other; status: waiting|running|breaking|closed ───
    console.log('\n── Games ──');
    const activeTIds = tableIds.slice(0, 10);
    const gameRows = activeTIds.map((tid, i) => ({
        id: uuid(), venue_id: VENUE_ID, table_id: tid,
        game_type: i < 6 ? 'nlh' : 'plo',
        stakes: i < 3 ? '1/3' : i < 6 ? '2/5' : '5/10',
        min_buyin: i < 3 ? 100 : i < 6 ? 200 : 500,
        max_buyin: i < 3 ? 300 : i < 6 ? 1000 : 3000,
        current_players: randomInt(4, 9), max_players: 9,
        status: 'running', started_at: dateAgo(randomInt(0, 1)),
        is_must_move: i === 3,
    }));
    const gameData = await insert('commander_games', gameRows);
    const gameIds = gameData ? gameData.map(g => g.id) : [];

    // ─── 4. SEATS — status: empty|occupied|reserved|away; seat_number: 1-10 ───
    console.log('\n── Seats ──');
    const seatRows = [];
    for (let gi = 0; gi < gameIds.length; gi++) {
        const numSeats = randomInt(5, 9);
        for (let s = 1; s <= numSeats; s++) {
            seatRows.push({
                id: uuid(), game_id: gameIds[gi], seat_number: s,
                player_id: pick(), player_name: randomPick(PLAYER_NAMES),
                status: s <= numSeats - 1 ? 'occupied' : randomPick(['occupied', 'reserved', 'away']),
                buyin_amount: randomInt(100, 2000), seated_at: dateAgo(randomInt(0, 1)),
            });
        }
    }
    await insert('commander_seats', seatRows);

    // ─── 5. WAITLIST (25) — signup_method: walk_in|app|phone|kiosk; status: waiting|called|seated|passed|removed ───
    console.log('\n── Waitlist ──');
    const wlRows = [];
    for (let i = 0; i < 25; i++) {
        wlRows.push({
            id: uuid(), venue_id: VENUE_ID,
            game_type: randomPick(['nlh', 'plo', 'nlh']),
            stakes: randomPick(['1/3', '2/5', '5/10']),
            player_id: pick(), player_name: randomPick(PLAYER_NAMES),
            player_phone: `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
            position: i + 1,
            signup_method: randomPick(['kiosk', 'walk_in', 'app', 'phone']),
            status: i < 18 ? 'waiting' : randomPick(['called', 'seated', 'passed']),
            call_count: randomInt(0, 3),
            notes: i % 5 === 0 ? 'VIP player, seat ASAP' : null,
        });
    }
    await insert('commander_waitlist', wlRows);

    // ─── 6. WAITLIST HISTORY (50) ───
    console.log('\n── Waitlist History ──');
    const wlhRows = [];
    for (let i = 0; i < 50; i++) {
        wlhRows.push({
            id: uuid(), venue_id: VENUE_ID, player_id: pick(),
            game_type: randomPick(['nlh', 'plo']), stakes: randomPick(['1/3', '2/5', '5/10']),
            wait_time_minutes: randomInt(5, 90), was_seated: Math.random() > 0.2,
            signup_method: randomPick(['kiosk', 'walk_in', 'app', 'phone']), created_at: randomDate(30),
        });
    }
    await insert('commander_waitlist_history', wlhRows);

    // ─── 7. DEALERS (10) ───
    console.log('\n── Dealers ──');
    const dealerRows = DEALER_NAMES.map((name, i) => ({
        id: uuid(), venue_id: VENUE_ID, user_id: userIds[(i + 12) % userIds.length],
        name, employee_id: `DLR-${String(i + 1).padStart(3, '0')}`,
        skill_level: randomInt(2, 5), certified_games: i < 5 ? ['nlh', 'plo'] : ['nlh'],
        is_active: i < 9, hired_date: today(),
    }));
    const dealerData = await insert('commander_dealers', dealerRows);
    const dealerIds = dealerData ? dealerData.map(d => d.id) : [];

    // ─── 8. DEALER ROTATIONS (60) ───
    console.log('\n── Dealer Rotations ──');
    const rotRows = [];
    for (let i = 0; i < 60; i++) {
        const startedAt = new Date(randomDate(14));
        const endedAt = new Date(startedAt.getTime() + randomInt(20, 40) * 60000);
        rotRows.push({
            id: uuid(), venue_id: VENUE_ID,
            dealer_id: randomPick(dealerIds), table_id: randomPick(tableIds),
            started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(),
            tips_reported: randomInt(5, 80),
        });
    }
    await insert('commander_dealer_rotations', rotRows);

    // ─── 9. INCIDENTS (10) ───
    console.log('\n── Incidents ──');
    const incTypes = ['dispute', 'rules_violation', 'cheating_suspicion', 'intoxication',
        'verbal_abuse', 'medical', 'chip_dispute', 'dealer_error', 'equipment_damage', 'trespass'];
    const incRows = incTypes.map((type, i) => ({
        id: uuid(), venue_id: VENUE_ID,
        reported_by: staffIds.length ? randomPick(staffIds) : null,
        player_id: pick(), table_id: tableIds.length ? randomPick(tableIds) : null,
        incident_type: type, severity: randomPick(['low', 'medium', 'high', 'critical']),
        description: `${type.replace(/_/g, ' ')} incident during evening session.`,
        action_taken: i < 7 ? 'Verbal warning issued, situation de-escalated.' : null,
        incident_status: i < 6 ? 'resolved' : randomPick(['open', 'investigating']),
        resolved_by: i < 6 && staffIds.length ? randomPick(staffIds) : null,
        resolution_notes: i < 6 ? 'Resolved per standard protocol.' : null,
        follow_up_required: i === 2 || i === 5,
        resolved_at: i < 6 ? randomDate(20) : null, created_at: randomDate(30),
    }));
    await insert('commander_incidents', incRows);

    // ─── 10. SERVICE REQUESTS (20) — request_type: food|drink|chips|table_change|cashout|floor|other; priority: INTEGER ───
    console.log('\n── Service Requests ──');
    const svcTypes = ['food', 'drink', 'chips', 'table_change', 'cashout', 'floor', 'other'];
    const svcRows = [];
    for (let i = 0; i < 20; i++) {
        svcRows.push({
            id: uuid(), venue_id: VENUE_ID,
            game_id: gameIds.length ? randomPick(gameIds) : null,
            player_id: pick(),
            request_type: randomPick(svcTypes),
            status: randomPick(['pending', 'acknowledged', 'completed', 'completed', 'completed']),
            priority: randomInt(1, 5),
            details: 'Player request during session.',
            assigned_to: staffIds.length ? randomPick(staffIds) : null,
            created_at: randomDate(7),
        });
    }
    await insert('commander_service_requests', svcRows);

    // ─── 11. PLAYER SESSIONS (40) — status: active|completed|abandoned ───
    console.log('\n── Player Sessions ──');
    const sessRows = [];
    for (let i = 0; i < 40; i++) {
        const checkin = new Date(randomDate(30));
        const duration = randomInt(60, 600);
        const checkout = new Date(checkin.getTime() + duration * 60000);
        sessRows.push({
            id: uuid(), venue_id: VENUE_ID, player_id: pick(),
            player_name: randomPick(PLAYER_NAMES),
            check_in_at: checkin.toISOString(),
            check_out_at: i < 35 ? checkout.toISOString() : null,
            status: i < 35 ? 'completed' : 'active',
            total_time_minutes: i < 35 ? duration : null,
            total_buyin: randomInt(200, 5000), comps_earned: randomInt(0, 50),
            created_at: checkin.toISOString(),
        });
    }
    await insert('commander_player_sessions', sessRows);

    // ─── 12. NOTIFICATIONS (15) — type: seat_available|tournament_starting|called_for_seat|promotion|custom ───
    console.log('\n── Notifications ──');
    const notifRows = [];
    for (let i = 0; i < 15; i++) {
        notifRows.push({
            id: uuid(), venue_id: VENUE_ID, player_id: pick(),
            notification_type: randomPick(['seat_available', 'tournament_starting', 'called_for_seat', 'promotion', 'custom']),
            channel: randomPick(['push', 'sms', 'in_app', 'email']),
            title: 'Notification', message: `Your spot is ready.`,
            status: randomPick(['sent', 'delivered', 'pending']),
            sent_at: randomDate(7), created_at: randomDate(7),
        });
    }
    await insert('commander_notifications', notifRows);

    // ─── 13. PLAYER PREFERENCES (10) ───
    console.log('\n── Player Preferences ──');
    const prefRows = [];
    for (let i = 0; i < 10; i++) {
        prefRows.push({
            id: uuid(), player_id: userIds[i % userIds.length], venue_id: VENUE_ID,
            preferred_games: ['nlh'], preferred_stakes: [randomPick(['1/3', '2/5'])],
            auto_join_waitlist: Math.random() > 0.5,
        });
    }
    await insert('commander_player_preferences', prefRows);

    console.log('\n✅ Part 1 complete!\n');
}

main().catch(console.error);
