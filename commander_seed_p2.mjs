/**
 * Commander Seed - Part 2: Tournaments, Promotions, Comps, Analytics, Reports
 */
import {
    uuid, randomInt, randomPick, randomDate, dateAgo, today,
    insert, fetchExisting, GAME_TYPES, STAKES, PLAYER_NAMES,
} from './commander_seed_helpers.mjs';

async function main() {
    console.log('\n🌱 COMMANDER SEED — Part 2: Tournaments, Promos, Comps, Analytics\n');

    const venues = await fetchExisting('poker_venues', 'id,name', 10);
    const profiles = await fetchExisting('profiles', 'id,username', 50);
    const staff = await fetchExisting('commander_staff', 'id,venue_id', 20);
    const tables = await fetchExisting('commander_tables', 'id,venue_id', 20);

    const VENUE_ID = venues[0].id;
    const userIds = profiles.map(p => p.id);
    const pick = () => randomPick(userIds);
    const staffIds = staff.map(s => s.id);
    const tableIds = tables.map(t => t.id);

    // ─── 1. TOURNAMENTS (12 tournaments over 30 days) ───
    console.log('\n── Tournaments ──');
    const tourneyConfigs = [
        { name: 'Daily Deepstack NLH', type: 'freezeout', buyin: 150, fee: 30, chips: 20000, gtd: 5000 },
        { name: 'Nightly Turbo', type: 'freezeout', buyin: 80, fee: 15, chips: 10000, gtd: 2000 },
        { name: 'Weekend Major', type: 'freezeout', buyin: 300, fee: 50, chips: 30000, gtd: 15000 },
        { name: 'Bounty Hunter Special', type: 'bounty', buyin: 100, fee: 20, chips: 15000, gtd: 3000 },
        { name: 'Rebuy Madness', type: 'rebuy', buyin: 60, fee: 10, chips: 8000, gtd: 1500 },
        { name: 'Satellite to Main Event', type: 'satellite', buyin: 50, fee: 10, chips: 5000, gtd: 0 },
        { name: 'PLO Championship', type: 'freezeout', buyin: 200, fee: 30, chips: 25000, gtd: 8000 },
        { name: 'Seniors $500 Event', type: 'freezeout', buyin: 500, fee: 50, chips: 40000, gtd: 20000 },
        { name: 'Ladies Night Tournament', type: 'freezeout', buyin: 100, fee: 15, chips: 12000, gtd: 2500 },
        { name: 'Freeroll Friday', type: 'freeroll', buyin: 0, fee: 0, chips: 5000, gtd: 500 },
        { name: 'High Roller $1K', type: 'freezeout', buyin: 1000, fee: 100, chips: 50000, gtd: 50000 },
        { name: 'Mystery Bounty', type: 'bounty', buyin: 200, fee: 30, chips: 20000, gtd: 10000 },
    ];
    const tStatuses = ['completed', 'completed', 'completed', 'completed', 'completed',
        'completed', 'completed', 'running', 'running', 'registration', 'scheduled', 'scheduled'];
    const tourneyRows = tourneyConfigs.map((t, i) => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (30 - i * 2.5));
        return {
            id: uuid(),
            venue_id: VENUE_ID,
            name: t.name,
            description: `${t.name} - ${t.type} format`,
            tournament_type: t.type,
            buyin_amount: t.buyin,
            buyin_fee: t.fee,
            starting_chips: t.chips,
            guaranteed_pool: t.gtd,
            scheduled_start: startDate.toISOString(),
            status: tStatuses[i],
            current_entries: tStatuses[i] === 'completed' ? randomInt(20, 60) : randomInt(5, 30),
            players_remaining: tStatuses[i] === 'completed' ? 0 : tStatuses[i] === 'running' ? randomInt(5, 20) : null,
            current_level: tStatuses[i] === 'running' ? randomInt(8, 15) : tStatuses[i] === 'completed' ? 25 : 0,
            max_entries: randomPick([50, 80, 100, 120]),
            late_registration_levels: 6,
            allows_rebuys: t.type === 'rebuy',
            rebuy_amount: t.type === 'rebuy' ? t.buyin : null,
            rebuy_chips: t.type === 'rebuy' ? t.chips : null,
            max_rebuys: t.type === 'rebuy' ? 3 : null,
            bounty_amount: t.type === 'bounty' ? Math.floor(t.buyin * 0.5) : null,
            blind_structure: JSON.stringify([
                { level: 1, sb: 25, bb: 50, ante: 0, duration: 20 },
                { level: 2, sb: 50, bb: 100, ante: 0, duration: 20 },
                { level: 3, sb: 75, bb: 150, ante: 25, duration: 20 },
                { level: 4, sb: 100, bb: 200, ante: 25, duration: 20 },
                { level: 5, sb: 150, bb: 300, ante: 50, duration: 20 },
            ]),
            created_by: staffIds.length ? randomPick(staffIds) : null,
        };
    });
    const tourneyData = await insert('commander_tournaments', tourneyRows);
    const tourneyIds = tourneyData ? tourneyData.map(t => t.id) : [];

    // ─── 2. TOURNAMENT ENTRIES (15-40 per completed tournament) ───
    console.log('\n── Tournament Entries ──');
    const entryRows = [];
    for (let ti = 0; ti < Math.min(tourneyIds.length, 8); ti++) {
        const numEntries = randomInt(15, 40);
        for (let e = 0; e < numEntries; e++) {
            const isElim = ti < 7 && e >= 3;
            entryRows.push({
                id: uuid(),
                tournament_id: tourneyIds[ti],
                player_id: pick(),
                player_name: randomPick(PLAYER_NAMES),
                registration_method: randomPick(['staff', 'kiosk', 'online']),
                status: isElim ? 'eliminated' : e < 3 ? 'active' : 'registered',
                current_chips: isElim ? 0 : randomInt(5000, 80000),
                rebuy_count: tourneyConfigs[ti].type === 'rebuy' ? randomInt(0, 2) : 0,
                total_invested: tourneyConfigs[ti].buyin + tourneyConfigs[ti].fee,
                finish_position: isElim ? randomInt(4, numEntries) : null,
                payout_amount: isElim && e < 6 ? randomInt(100, 5000) : null,
                created_at: randomDate(30),
            });
        }
    }
    await insert('commander_tournament_entries', entryRows);

    // ─── 3. PROMOTIONS (8 promotions) ───
    console.log('\n── Promotions ──');
    const promoConfigs = [
        { name: 'High Hand of the Hour', type: 'high_hand', prize: 500, desc: 'Best hand each hour wins' },
        { name: 'Royal Flush Jackpot', type: 'progressive_jackpot', prize: 25000, desc: 'Progressive jackpot for royals' },
        { name: 'Bad Beat Jackpot', type: 'progressive_jackpot', prize: 50000, desc: 'Quad Jacks beaten or better' },
        { name: 'Aces Cracked', type: 'high_hand', prize: 200, desc: 'Win $200 when your aces get cracked' },
        { name: 'Splash Pot Frenzy', type: 'splash_pot', prize: 100, desc: 'Random splash pots every hour' },
        { name: 'New Player Bonus', type: 'bonus', prize: 50, desc: 'First-time players get $50 promo chips' },
        { name: 'Happy Hour Double Comps', type: 'comp_multiplier', prize: 0, desc: 'Double comp rate 4-6pm daily' },
        { name: 'Weekend Warrior Bonus', type: 'bonus', prize: 100, desc: 'Play 8+ hours Sat-Sun, earn $100 bonus' },
    ];
    const promoRows = promoConfigs.map((p, i) => ({
        id: uuid(),
        venue_id: VENUE_ID,
        name: p.name,
        description: p.desc,
        promotion_type: p.type,
        prize_type: p.prize > 0 ? 'cash' : 'comp',
        prize_value: p.prize,
        prize_description: `$${p.prize} ${p.prize > 0 ? 'cash' : 'in comps'}`,
        start_date: dateAgo(30),
        end_date: i < 5 ? dateAgo(-30) : dateAgo(5),
        is_active: i < 5,
        status: i < 5 ? 'active' : 'expired',
        is_featured: i < 3,
        game_types: ['NLH', 'PLO'],
        total_awarded: randomInt(5, 50),
        total_value_awarded: randomInt(500, 15000),
        created_by: staffIds.length ? randomPick(staffIds) : null,
        created_at: dateAgo(45),
    }));
    const promoData = await insert('commander_promotions', promoRows);
    const promoIds = promoData ? promoData.map(p => p.id) : [];

    // ─── 4. PROMOTION AWARDS (30 awards) ───
    console.log('\n── Promotion Awards ──');
    const awardRows = [];
    for (let i = 0; i < 30; i++) {
        awardRows.push({
            id: uuid(),
            promotion_id: randomPick(promoIds),
            venue_id: VENUE_ID,
            player_id: pick(),
            player_name: randomPick(PLAYER_NAMES),
            award_type: randomPick(['high_hand', 'jackpot', 'bonus', 'splash']),
            prize_value: randomInt(50, 2000),
            prize_description: `$${randomInt(50, 2000)} prize`,
            game_details: `${randomPick(['NLH', 'PLO'])} ${randomPick(['1/3', '2/5'])}`,
            status: randomPick(['paid', 'paid', 'paid', 'pending', 'approved']),
            approved_by: staffIds.length ? randomPick(staffIds) : null,
            created_at: randomDate(30),
        });
    }
    await insert('commander_promotion_awards', awardRows);

    // ─── 5. COMP RATES (5 rate tiers) ───
    console.log('\n── Comp Rates ──');
    const compRateRows = [
        { name: 'Standard Cash Rate', rate_type: 'hourly', comp_value: 1.00, per_unit: 1, unit_label: 'hour', min_stakes: '1/2', is_default: true },
        { name: 'Mid-Stakes Rate', rate_type: 'hourly', comp_value: 2.00, per_unit: 1, unit_label: 'hour', min_stakes: '2/5', is_default: false },
        { name: 'High-Stakes Rate', rate_type: 'hourly', comp_value: 5.00, per_unit: 1, unit_label: 'hour', min_stakes: '5/10', is_default: false },
        { name: 'Tournament Comp', rate_type: 'per_event', comp_value: 5.00, per_unit: 1, unit_label: 'tournament', min_stakes: null, is_default: false },
        { name: 'VIP Bonus Rate', rate_type: 'hourly', comp_value: 3.00, per_unit: 1, unit_label: 'hour', min_stakes: '1/2', is_default: false },
    ].map(r => ({ id: uuid(), venue_id: VENUE_ID, ...r, game_types: ['NLH', 'PLO'], is_active: true, weekday_multiplier: 1.0, weekend_multiplier: 1.5, vip_multiplier: 2.0 }));
    await insert('commander_comp_rates', compRateRows);

    // ─── 6. COMP BALANCES (20 players) ───
    console.log('\n── Comp Balances ──');
    const compBalRows = [];
    for (let i = 0; i < 20; i++) {
        const lifetime = randomInt(50, 2000);
        const redeemed = randomInt(0, Math.floor(lifetime * 0.7));
        compBalRows.push({
            id: uuid(),
            venue_id: VENUE_ID,
            player_id: userIds[i % userIds.length],
            current_balance: lifetime - redeemed,
            lifetime_earned: lifetime,
            lifetime_redeemed: redeemed,
            lifetime_expired: randomInt(0, 50),
            lifetime_adjusted: randomInt(-20, 20),
            last_earned_at: randomDate(14),
            last_redeemed_at: randomDate(30),
            is_frozen: false,
        });
    }
    await insert('commander_comp_balances', compBalRows);

    // ─── 7. COMP TRANSACTIONS (40 transactions) ───
    console.log('\n── Comp Transactions ──');
    const compTxRows = [];
    for (let i = 0; i < 40; i++) {
        const isEarn = Math.random() > 0.3;
        const amt = randomInt(1, 50);
        compTxRows.push({
            id: uuid(),
            venue_id: VENUE_ID,
            player_id: pick(),
            transaction_type: isEarn ? 'earned' : randomPick(['redeemed', 'adjusted', 'expired']),
            amount: isEarn ? amt : -amt,
            balance_before: randomInt(10, 500),
            balance_after: randomInt(10, 500),
            source_type: isEarn ? 'session' : 'redemption',
            hours_played: isEarn ? randomInt(1, 8) : null,
            description: isEarn ? 'Comp earned for cash game session' : 'Comp redeemed at restaurant',
            created_at: randomDate(30),
        });
    }
    await insert('commander_comp_transactions', compTxRows);

    // ─── 8. ANALYTICS DAILY (30 days) ───
    console.log('\n── Analytics Daily ──');
    const analyticsRows = [];
    for (let d = 0; d < 30; d++) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const base = isWeekend ? 1.4 : 1.0;
        analyticsRows.push({
            id: uuid(),
            venue_id: VENUE_ID,
            date: date.toISOString().split('T')[0],
            total_sessions: Math.floor(randomInt(30, 60) * base),
            unique_players: Math.floor(randomInt(25, 50) * base),
            new_players: randomInt(1, 5),
            returning_players: Math.floor(randomInt(20, 45) * base),
            total_play_hours: Math.floor(randomInt(150, 400) * base),
            avg_session_hours: +(randomInt(30, 70) / 10).toFixed(1),
            peak_concurrent_players: Math.floor(randomInt(30, 70) * base),
            peak_hour: randomInt(18, 23),
            total_buyin: Math.floor(randomInt(15000, 50000) * base),
            total_cashout: Math.floor(randomInt(14000, 48000) * base),
            avg_buyin: randomInt(200, 600),
            tables_opened: Math.floor(randomInt(8, 15) * base),
            max_tables_running: Math.floor(randomInt(10, 15) * base),
            table_hours: Math.floor(randomInt(80, 200) * base),
            nlhe_hours: Math.floor(randomInt(50, 150) * base),
            plo_hours: Math.floor(randomInt(20, 50) * base),
            tournaments_run: d % 2 === 0 ? randomInt(1, 3) : 0,
            tournament_entries: d % 2 === 0 ? randomInt(15, 60) : 0,
            waitlist_joins: Math.floor(randomInt(10, 40) * base),
            waitlist_seats: Math.floor(randomInt(8, 35) * base),
            avg_wait_time_minutes: randomInt(10, 45),
            promotions_awarded: randomInt(2, 10),
            promotion_value_awarded: randomInt(200, 3000),
            service_requests: randomInt(5, 20),
            calculated_at: date.toISOString(),
        });
    }
    await insert('commander_analytics_daily', analyticsRows);

    // ─── 9. PLAYER STATS (40 players) ───
    console.log('\n── Player Stats ──');
    const psRows = [];
    for (let i = 0; i < 40; i++) {
        const visits = randomInt(5, 100);
        const hours = visits * randomInt(2, 8);
        psRows.push({
            id: uuid(),
            venue_id: VENUE_ID,
            player_id: userIds[i % userIds.length],
            first_visit: dateAgo(randomInt(60, 365)),
            last_visit: dateAgo(randomInt(0, 14)),
            total_visits: visits,
            visits_this_month: randomInt(2, 15),
            total_hours: hours,
            hours_this_month: randomInt(10, 80),
            avg_session_hours: +(hours / visits).toFixed(1),
            total_buyin: visits * randomInt(200, 800),
            total_cashout: visits * randomInt(180, 820),
            preferred_game: randomPick(['NLH', 'PLO']),
            preferred_stakes: randomPick(['1/3', '2/5', '5/10']),
            tournaments_played: randomInt(0, 30),
            tournament_cashes: randomInt(0, 10),
            tournament_wins: randomInt(0, 3),
            total_tournament_earnings: randomInt(0, 15000),
            loyalty_points: randomInt(100, 5000),
            loyalty_tier: randomPick(['bronze', 'silver', 'gold', 'platinum']),
            is_vip: Math.random() > 0.7,
        });
    }
    await insert('commander_player_stats', psRows);

    // ─── 10. LEADERBOARDS (3 leaderboards) ───
    console.log('\n── Leaderboards ──');
    const lbRows = [
        { name: 'Monthly Hours Champion', leaderboard_type: 'hours', period_type: 'monthly' },
        { name: 'Weekly High Hand', leaderboard_type: 'high_hand', period_type: 'weekly' },
        { name: 'Tournament Points Leader', leaderboard_type: 'tournament_points', period_type: 'season' },
    ].map(lb => ({
        id: uuid(), venue_id: VENUE_ID, ...lb,
        start_date: dateAgo(30), end_date: dateAgo(-30),
        status: 'active',
        min_hours: lb.period_type === 'monthly' ? 10 : 0,
        eligible_games: ['NLH', 'PLO'],
    }));
    const lbData = await insert('commander_leaderboards', lbRows);
    const lbIds = lbData ? lbData.map(l => l.id) : [];

    // ─── 11. LEADERBOARD ENTRIES (20 entries per board) ───
    console.log('\n── Leaderboard Entries ──');
    const lbeRows = [];
    for (const lbId of lbIds) {
        for (let i = 0; i < 20; i++) {
            lbeRows.push({
                id: uuid(),
                leaderboard_id: lbId,
                player_id: userIds[i % userIds.length],
                score: randomInt(50, 500),
                rank: i + 1,
                hours_played: randomInt(10, 100),
                sessions_count: randomInt(3, 25),
                points_earned: randomInt(100, 2000),
            });
        }
    }
    await insert('commander_leaderboard_entries', lbeRows);

    // ─── 12. AUDIT LOGS (100 entries) ───
    console.log('\n── Audit Logs ──');
    const auditActions = ['login', 'logout', 'seat_player', 'unseat_player', 'add_to_waitlist',
        'remove_from_waitlist', 'open_table', 'close_table', 'start_game', 'end_game',
        'create_tournament', 'register_player', 'eliminate_player', 'award_promotion',
        'update_settings', 'export_data', 'create_incident', 'resolve_incident',
        'issue_comp', 'redeem_comp'];
    const auditRows = [];
    for (let i = 0; i < 100; i++) {
        const action = randomPick(auditActions);
        auditRows.push({
            id: uuid(),
            venue_id: VENUE_ID,
            staff_id: staffIds.length ? randomPick(staffIds) : null,
            actor_type: 'staff',
            actor_name: `Staff Member ${randomInt(1, 12)}`,
            action,
            action_category: action.includes('tournament') ? 'tournament' : action.includes('comp') ? 'comp' : 'operations',
            target_type: action.includes('player') ? 'player' : action.includes('table') ? 'table' : 'system',
            target_name: randomPick(PLAYER_NAMES),
            status: 'success',
            created_at: randomDate(30),
        });
    }
    await insert('commander_audit_logs', auditRows);

    console.log('\n✅ Part 2 complete!\n');
}

main().catch(console.error);
