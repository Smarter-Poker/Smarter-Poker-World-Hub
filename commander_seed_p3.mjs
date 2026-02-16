/**
 * Commander Seed - Part 3: Social, Leagues, Tax, Streaming, Home Games, Remaining
 * CHECK CONSTRAINTS: All enum values validated against COMMANDER_FULL_SCHEMA.sql
 */
import {
    uuid, randomInt, randomPick, randomDate, dateAgo, today,
    insert, fetchExisting, PLAYER_NAMES,
} from './commander_seed_helpers.mjs';

async function main() {
    console.log('\n🌱 COMMANDER SEED — Part 3: Social, Leagues, Tax, Streaming, Home Games\n');

    const venues = await fetchExisting('poker_venues', 'id,name', 10);
    const profiles = await fetchExisting('profiles', 'id,username', 50);
    const staff = await fetchExisting('commander_staff', 'id', 20);
    const tables = await fetchExisting('commander_tables', 'id', 20);
    const games = await fetchExisting('commander_games', 'id', 20);

    const VENUE_ID = venues[0].id;
    const userIds = profiles.map(p => p.id);
    const pick = () => randomPick(userIds);
    const staffIds = staff.map(s => s.id);
    const tableIds = tables.map(t => t.id);
    const gameIds = games.map(g => g.id);

    // ─── 1. LEAGUES (2) — status: upcoming|active|completed|cancelled (reuse leaderboard status) ───
    console.log('\n── Leagues ──');
    const leagueRows = [
        { name: 'Winter Championship Series', season: 'Winter 2026', status: 'active' },
        { name: 'Monthly Points Race', season: 'February 2026', status: 'active' },
    ].map(l => ({
        id: uuid(), venue_id: VENUE_ID, ...l,
        description: `${l.name} - ${l.season}`,
        scoring_system: JSON.stringify({ first: 100, second: 70, third: 50 }),
        start_date: dateAgo(30), end_date: dateAgo(-60),
    }));
    const leagueData = await insert('commander_leagues', leagueRows);
    const leagueIds = leagueData ? leagueData.map(l => l.id) : [];

    // ─── 2. LEAGUE STANDINGS (15 per league) ───
    console.log('\n── League Standings ──');
    const standRows = [];
    for (const lid of leagueIds) {
        for (let i = 0; i < 15; i++) {
            standRows.push({
                id: uuid(), league_id: lid, player_id: userIds[i % userIds.length],
                points: randomInt(50, 500) - i * 20, events_played: randomInt(3, 12),
                cashes: randomInt(1, 8), wins: randomInt(0, 3), earnings: randomInt(200, 8000),
            });
        }
    }
    await insert('commander_league_standings', standRows);

    // ─── 3. TAX EVENTS (8) ───
    console.log('\n── Tax Events ──');
    const taxRows = [];
    for (let i = 0; i < 8; i++) {
        const gross = randomInt(5000, 50000);
        const buyin = randomInt(100, 1000);
        taxRows.push({
            id: uuid(), venue_id: VENUE_ID, player_id: pick(),
            event_type: randomPick(['tournament', 'bad_beat_jackpot', 'high_hand']),
            gross_amount: gross, buy_in: buyin, net_amount: gross - buyin,
            withholding_required: gross >= 5000,
            withholding_amount: gross >= 5000 ? Math.floor(gross * 0.24) : 0,
            w2g_generated: gross >= 5000, created_at: randomDate(90),
        });
    }
    await insert('commander_tax_events', taxRows);

    // ─── 4. SELF EXCLUSIONS ───
    console.log('\n── Self Exclusions ──');
    const exclRows = [
        { exclusion_type: 'voluntary', duration_days: 90, reason: 'Personal decision', scope: 'venue' },
        { exclusion_type: 'voluntary', duration_days: 30, reason: 'Taking a break', scope: 'venue' },
        { exclusion_type: 'mandatory', duration_days: 365, reason: 'Behavioral issues', scope: 'venue' },
    ].map((e, i) => ({
        id: uuid(), player_id: userIds[(i + 30) % userIds.length],
        ...e, venue_id: VENUE_ID,
        created_at: dateAgo(randomInt(10, 60)), expires_at: dateAgo(-e.duration_days),
        acknowledged: true, exclusion_status: i < 2 ? 'active' : 'expired',
    }));
    await insert('commander_self_exclusions', exclRows);

    // ─── 5. SPENDING LIMITS (5) ───
    console.log('\n── Spending Limits ──');
    const spendRows = [];
    for (let i = 0; i < 5; i++) {
        spendRows.push({
            id: uuid(), player_id: userIds[(i + 35) % userIds.length],
            daily_limit: randomPick([500, 1000, 2000, null]),
            weekly_limit: randomPick([2000, 5000, null]),
            monthly_limit: randomPick([5000, 10000, 20000, null]),
            session_duration_limit: randomPick([4, 6, 8, null]),
            cooling_off_enabled: Math.random() > 0.5, alerts_enabled: true,
        });
    }
    await insert('commander_spending_limits', spendRows);

    // ─── 6. STREAMS (3) ───
    console.log('\n── Streams ──');
    const streamRows = [
        { status: 'live', platforms: ['youtube', 'twitch'], delay_minutes: 15, viewer_count: randomInt(50, 500) },
        { status: 'offline', platforms: ['youtube'], delay_minutes: 30, viewer_count: 0 },
        { status: 'offline', platforms: ['twitch'], delay_minutes: 15, viewer_count: 0 },
    ].map((s, i) => ({
        id: uuid(), venue_id: VENUE_ID, table_id: tableIds[i] || null, ...s,
        overlay_config: JSON.stringify({ show_pot: true, show_cards: false }),
        started_at: s.status === 'live' ? dateAgo(0) : null,
        ended_at: s.status === 'offline' ? dateAgo(randomInt(1, 7)) : null,
    }));
    await insert('commander_streams', streamRows);

    // ─── 7. HAND HISTORY (20 hands) ───
    console.log('\n── Hand History ──');
    const handRows = [];
    for (let i = 0; i < 20; i++) {
        handRows.push({
            id: uuid(), venue_id: VENUE_ID,
            table_id: tableIds.length ? randomPick(tableIds) : null,
            game_id: gameIds.length ? randomPick(gameIds) : null,
            hand_number: 1000 + i, board: ['As', 'Kh', 'Qd', 'Jc', 'Ts'].slice(0, randomInt(3, 5)),
            pot_size: randomInt(50, 5000), rfid_captured: Math.random() > 0.7,
            created_at: randomDate(7),
        });
    }
    await insert('commander_hand_history', handRows);

    // ─── 8. HOME GROUPS (2) — frequency: weekly|biweekly|monthly|irregular ───
    console.log('\n── Home Game Groups ──');
    const homeGroupRows = [
        { name: 'Saturday Night Poker Club', description: 'Weekly home game', default_game_type: 'nlh', default_stakes: '1/2', frequency: 'weekly' },
        { name: 'High Rollers Home Game', description: 'Monthly deep stack', default_game_type: 'plo', default_stakes: '5/10', frequency: 'monthly' },
    ].map((g, i) => ({
        id: uuid(), ...g, owner_id: userIds[i],
        club_code: `HG-${randomInt(1000, 9999)}`, invite_code: `inv-${uuid().slice(0, 8)}`,
        is_private: i === 1, requires_approval: i === 1,
        city: 'Las Vegas', state: 'NV',
        typical_buyin_min: i === 0 ? 100 : 500, typical_buyin_max: i === 0 ? 300 : 2000,
        max_players: i === 0 ? 9 : 6, member_count: randomInt(8, 20),
        games_hosted: randomInt(5, 30), is_active: true,
    }));
    const hgData = await insert('commander_home_groups', homeGroupRows);
    const homeGroupIds = hgData ? hgData.map(g => g.id) : [];

    // ─── 9. HOME MEMBERS (10 per group) — role: owner|admin|member; status: pending|approved|declined|banned ───
    console.log('\n── Home Game Members ──');
    const hmRows = [];
    for (const gid of homeGroupIds) {
        for (let i = 0; i < 10; i++) {
            hmRows.push({
                id: uuid(), group_id: gid, user_id: userIds[i % userIds.length],
                role: i === 0 ? 'owner' : i < 3 ? 'admin' : 'member',
                status: 'approved', games_attended: randomInt(2, 20),
                can_host: i < 3, notifications_enabled: true,
            });
        }
    }
    await insert('commander_home_members', hmRows);

    // ─── 10. HOME GAMES (6) — status: draft|scheduled|confirmed|in_progress|completed|cancelled ───
    // address_visible_to: all|rsvp|approved
    console.log('\n── Home Games ──');
    const hgGameRows = [];
    for (const gid of homeGroupIds) {
        for (let i = 0; i < 3; i++) {
            const schedDate = new Date(); schedDate.setDate(schedDate.getDate() - (20 - i * 10));
            hgGameRows.push({
                id: uuid(), group_id: gid, host_id: pick(),
                title: `Game Night ${i + 1}`, game_type: 'nlh', stakes: '1/2',
                buyin_min: 100, buyin_max: 300,
                scheduled_date: schedDate.toISOString().split('T')[0],
                start_time: '19:00', end_time: '23:00',
                max_players: 9, min_players: 4, rsvp_yes: randomInt(4, 8),
                status: i < 2 ? 'completed' : 'scheduled',
                address_visible_to: 'rsvp',
                allow_guests: true, guest_limit: 2, food_drinks: 'Pizza and beer provided',
            });
        }
    }
    const hgGameData = await insert('commander_home_games', hgGameRows);
    const homeGameIds = hgGameData ? hgGameData.map(g => g.id) : [];

    // ─── 11. HOME RSVPS — response: yes|maybe|no|waitlist ───
    console.log('\n── Home Game RSVPs ──');
    const rsvpRows = [];
    for (const hgId of homeGameIds) {
        for (let i = 0; i < 4; i++) {
            rsvpRows.push({
                id: uuid(), game_id: hgId, user_id: userIds[i % userIds.length],
                response: randomPick(['yes', 'yes', 'yes', 'maybe', 'no']),
                bringing_guests: randomInt(0, 1), is_confirmed: true,
                responded_at: randomDate(14),
            });
        }
    }
    await insert('commander_home_rsvps', rsvpRows);

    // ─── 12. VENUE POSTS (12) ───
    console.log('\n── Venue Posts ──');
    const vpRows = [
        'Tonight\'s action is heating up! 10 tables running.',
        'HUGE bad beat jackpot hit last night! $47,000 split!',
        'New promotion: Aces Cracked every Monday and Wednesday!',
        'Weekend Major Tournament Saturday - $300 buy-in, $15K GTD!',
        'Congratulations to Mike Chen for winning our Monthly!',
        'We\'ve added 3 new PLO tables due to popular demand.',
        'Happy Hour Double Comps 4-6pm every day this month!',
        'Live stream tonight on YouTube - Table 1 feature!',
        'New dealer training program starting next week.',
        'Holiday Special: Freeroll for all loyalty members!',
        'High Hand of the Hour winners tonight: $500 each!',
        'Thank you for making 2025 our best year ever!',
    ].map((content, i) => ({
        id: uuid(), venue_id: VENUE_ID, author_id: pick(),
        author_name: `Staff ${randomInt(1, 5)}`, content,
        post_type: randomPick(['update', 'announcement', 'promotion', 'event']),
        likes_count: randomInt(5, 100), comments_count: randomInt(0, 20),
        shares_count: randomInt(0, 10), is_pinned: i === 0, is_published: true,
        created_at: randomDate(30),
    }));
    await insert('commander_venue_posts', vpRows);

    // ─── 13. VENUE PHOTOS (8) ───
    console.log('\n── Venue Photos ──');
    const photoRows = ['Main room floor', 'Final table', 'Royal Flush winner', 'Grand opening',
        'VIP lounge', 'February champion', 'New table felt', 'Weekend group photo'].map((caption, i) => ({
            id: uuid(), venue_id: VENUE_ID, uploaded_by: pick(),
            url: `https://placehold.co/800x600/1a1a2e/22D3EE?text=Photo+${i + 1}`,
            thumbnail_url: `https://placehold.co/200x150/1a1a2e/22D3EE?text=Thumb+${i + 1}`,
            caption, category: randomPick(['poker_room', 'tournament', 'event', 'general']),
            is_cover_photo: i === 0, is_featured: i < 3, display_order: i, likes_count: randomInt(10, 80),
        }));
    await insert('commander_venue_photos', photoRows);

    // ─── 14. VENUE REVIEWS (6) ───
    console.log('\n── Venue Reviews ──');
    const reviewRows = [
        { title: 'Best poker room in the area', content: 'Great staff, fair games!', overall_rating: 5 },
        { title: 'Solid experience', content: 'Good action, long weekend waits.', overall_rating: 4 },
        { title: 'Amazing tournaments', content: 'Best structure around.', overall_rating: 5 },
        { title: 'Decent room', content: 'Could improve AC but games are good.', overall_rating: 3 },
        { title: 'Great PLO action', content: 'Only regular PLO games in town.', overall_rating: 4 },
        { title: 'VIP treatment excellent', content: 'Best loyalty program.', overall_rating: 5 },
    ].map((r, i) => ({
        id: uuid(), venue_id: VENUE_ID,
        reviewer_id: userIds[(i + 20) % userIds.length], ...r,
        game_selection_rating: randomInt(3, 5), staff_rating: randomInt(4, 5),
        atmosphere_rating: randomInt(3, 5), food_rating: randomInt(2, 5),
        games_played: ['nlh 1/3', 'nlh 2/5'],
        is_verified: Math.random() > 0.3, is_published: true,
        helpful_count: randomInt(0, 20), created_at: randomDate(60),
    }));
    await insert('commander_venue_reviews', reviewRows);

    // ─── 15. VENUE FOLLOWERS (25) ───
    console.log('\n── Venue Followers ──');
    const follRows = [];
    for (let i = 0; i < 25; i++) {
        follRows.push({
            id: uuid(), venue_id: VENUE_ID, user_id: userIds[i % userIds.length],
            notify_posts: true, notify_events: true,
            notify_promotions: Math.random() > 0.3, notify_tournaments: Math.random() > 0.2,
            followed_at: randomDate(90),
        });
    }
    await insert('commander_venue_followers', follRows);

    // ─── 16. CLUB ANNOUNCEMENTS (5) — type: announcement|game_reminder|event|update|urgent; status: draft|scheduled|sent|cancelled ───
    console.log('\n── Club Announcements ──');
    if (homeGroupIds.length) {
        const annRows = [
            'Game night this Saturday! RSVP now.',
            'New house rules posted - please review.',
            'Congratulations to last week\'s winner!',
            'Holiday game schedule change.',
            'Welcome to our newest members!',
        ].map((msg, i) => ({
            id: uuid(), group_id: randomPick(homeGroupIds), author_id: pick(),
            title: `Announcement ${i + 1}`, message: msg,
            message_type: randomPick(['announcement', 'game_reminder', 'event', 'update']),
            target_all: true, status: 'sent', send_push: true, created_at: randomDate(14),
        }));
        await insert('commander_club_announcements', annRows);
    }

    // ─── 17. WAIT TIME PREDICTIONS (20) ───
    console.log('\n── Wait Time Predictions ──');
    const wtpRows = [];
    for (let h = 10; h <= 23; h++) {
        for (let dow = 0; dow < 2; dow++) {
            wtpRows.push({
                id: uuid(), venue_id: VENUE_ID, game_type: 'nlh', stakes: '1/3',
                hour_of_day: h, day_of_week: dow + 5,
                predicted_minutes: randomInt(10, 60), actual_minutes: randomInt(5, 70),
                confidence: +(Math.random() * 0.4 + 0.6).toFixed(2),
            });
        }
    }
    await insert('commander_wait_time_predictions', wtpRows);

    // ─── 18. DEALER MARKETPLACE (3) ───
    console.log('\n── Dealer Marketplace ──');
    const dmRows = [
        { name: 'Pro Dealer Mike', hourly_rate: 35, games_offered: ['nlh', 'plo'], bio: '10 years', rating: 4.8 },
        { name: 'Ace Dealer Service', hourly_rate: 40, games_offered: ['nlh', 'plo', 'stud'], bio: 'Pro team', rating: 4.5 },
        { name: 'Quick Deal Jessica', hourly_rate: 30, games_offered: ['nlh'], bio: 'Fast & accurate', rating: 4.9 },
    ].map(d => ({
        id: uuid(), dealer_id: pick(), ...d,
        service_area: ['Las Vegas', 'Henderson'], verified: true, status: 'active',
    }));
    await insert('commander_dealer_marketplace', dmRows);

    // ─── 19. EQUIPMENT RENTALS (3) ───
    console.log('\n── Equipment Rentals ──');
    await insert('commander_equipment_rentals', [
        { id: uuid(), vendor_id: pick(), name: 'Pro Poker Table (10-seat)', category: 'tables', daily_rate: 75, available: true },
        { id: uuid(), vendor_id: pick(), name: 'Chip Set (500pc Clay)', category: 'chips', daily_rate: 25, available: true },
        { id: uuid(), vendor_id: pick(), name: 'Auto Card Shuffler', category: 'equipment', daily_rate: 40, available: true },
    ]);

    // ─── 20. EXPORT JOBS (3) ───
    console.log('\n── Export Jobs ──');
    await insert('commander_export_jobs', [
        { id: uuid(), venue_id: VENUE_ID, requested_by: staffIds[0] || null, export_type: 'player_report', format: 'csv', status: 'completed', row_count: 245, created_at: randomDate(7) },
        { id: uuid(), venue_id: VENUE_ID, requested_by: staffIds[0] || null, export_type: 'financial_summary', format: 'pdf', status: 'completed', row_count: 30, created_at: randomDate(14) },
        { id: uuid(), venue_id: VENUE_ID, requested_by: staffIds[0] || null, export_type: 'tournament_results', format: 'csv', status: 'pending', created_at: randomDate(1) },
    ]);

    console.log('\n✅ Part 3 complete!\n');
}

main().catch(console.error);
