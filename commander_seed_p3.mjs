/**
 * Commander Seed - Part 3: Social, Leagues, Tax, Streaming, Home Games, Remaining
 */
import {
    uuid, randomInt, randomPick, randomDate, dateAgo, today,
    insert, fetchExisting, PLAYER_NAMES,
} from './commander_seed_helpers.mjs';

async function main() {
    console.log('\n🌱 COMMANDER SEED — Part 3: Social, Leagues, Tax, Streaming, Home Games\n');

    const venues = await fetchExisting('poker_venues', 'id,name', 10);
    const profiles = await fetchExisting('profiles', 'id,username', 50);
    const staff = await fetchExisting('commander_staff', 'id,venue_id', 20);
    const tables = await fetchExisting('commander_tables', 'id', 20);
    const games = await fetchExisting('commander_games', 'id', 20);

    const VENUE_ID = venues[0].id;
    const userIds = profiles.map(p => p.id);
    const pick = () => randomPick(userIds);
    const staffIds = staff.map(s => s.id);
    const tableIds = tables.map(t => t.id);
    const gameIds = games.map(g => g.id);

    // ─── 1. LEAGUES (2 leagues) ───
    console.log('\n── Leagues ──');
    const leagueRows = [
        { name: 'Winter Championship Series', season: 'Winter 2026', status: 'active' },
        { name: 'Monthly Points Race', season: 'February 2026', status: 'active' },
    ].map(l => ({
        id: uuid(), venue_id: VENUE_ID, ...l,
        description: `${l.name} - ${l.season}`,
        scoring_system: JSON.stringify({ first: 100, second: 70, third: 50, fourth: 35, fifth: 25 }),
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
                id: uuid(), league_id: lid,
                player_id: userIds[i % userIds.length],
                points: randomInt(50, 500) - i * 20,
                events_played: randomInt(3, 12),
                cashes: randomInt(1, 8),
                wins: randomInt(0, 3),
                earnings: randomInt(200, 8000),
            });
        }
    }
    await insert('commander_league_standings', standRows);

    // ─── 3. TAX EVENTS (8 W-2G events) ───
    console.log('\n── Tax Events ──');
    const taxRows = [];
    for (let i = 0; i < 8; i++) {
        const gross = randomInt(5000, 50000);
        const buyin = randomInt(100, 1000);
        taxRows.push({
            id: uuid(), venue_id: VENUE_ID,
            player_id: pick(),
            event_type: randomPick(['tournament', 'bad_beat_jackpot', 'high_hand', 'tournament']),
            gross_amount: gross,
            buy_in: buyin,
            net_amount: gross - buyin,
            withholding_required: gross >= 5000,
            withholding_amount: gross >= 5000 ? Math.floor(gross * 0.24) : 0,
            w2g_generated: gross >= 5000,
            created_at: randomDate(90),
        });
    }
    await insert('commander_tax_events', taxRows);

    // ─── 4. SELF EXCLUSIONS (3 entries) ───
    console.log('\n── Self Exclusions ──');
    const exclRows = [
        { exclusion_type: 'voluntary', duration_days: 90, reason: 'Personal decision', scope: 'venue' },
        { exclusion_type: 'voluntary', duration_days: 30, reason: 'Taking a break', scope: 'venue' },
        { exclusion_type: 'mandatory', duration_days: 365, reason: 'Behavioral issues', scope: 'venue' },
    ].map((e, i) => ({
        id: uuid(), player_id: userIds[(i + 30) % userIds.length],
        ...e, venue_id: VENUE_ID,
        created_at: dateAgo(randomInt(10, 60)),
        expires_at: dateAgo(-e.duration_days),
        acknowledged: true,
        exclusion_status: i < 2 ? 'active' : 'expired',
    }));
    await insert('commander_self_exclusions', exclRows);

    // ─── 5. SPENDING LIMITS (5 players) ───
    console.log('\n── Spending Limits ──');
    const spendRows = [];
    for (let i = 0; i < 5; i++) {
        spendRows.push({
            id: uuid(),
            player_id: userIds[(i + 35) % userIds.length],
            daily_limit: randomPick([500, 1000, 2000, null]),
            weekly_limit: randomPick([2000, 5000, null]),
            monthly_limit: randomPick([5000, 10000, 20000, null]),
            session_duration_limit: randomPick([4, 6, 8, null]),
            loss_limit: randomPick([500, 1000, null]),
            cooling_off_enabled: Math.random() > 0.5,
            alerts_enabled: true,
        });
    }
    await insert('commander_spending_limits', spendRows);

    // ─── 6. STREAMS (3 stream configs) ───
    console.log('\n── Streams ──');
    const streamRows = [
        { status: 'live', platforms: ['youtube', 'twitch'], delay_minutes: 15, viewer_count: randomInt(50, 500) },
        { status: 'offline', platforms: ['youtube'], delay_minutes: 30, viewer_count: 0 },
        { status: 'offline', platforms: ['twitch'], delay_minutes: 15, viewer_count: 0 },
    ].map((s, i) => ({
        id: uuid(), venue_id: VENUE_ID,
        table_id: tableIds[i] || null,
        ...s,
        overlay_config: JSON.stringify({ show_pot: true, show_cards: false, show_player_names: true }),
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
            hand_number: 1000 + i,
            board: ['As', 'Kh', 'Qd', 'Jc', 'Ts'].slice(0, randomInt(3, 5)),
            pot_size: randomInt(50, 5000),
            rfid_captured: Math.random() > 0.7,
            created_at: randomDate(7),
        });
    }
    await insert('commander_hand_history', handRows);

    // ─── 8. HOME GROUPS (2 groups) ───
    console.log('\n── Home Game Groups ──');
    const homeGroupRows = [
        { name: 'Saturday Night Poker Club', description: 'Weekly home game for regulars', default_game_type: 'NLH', default_stakes: '1/2', frequency: 'weekly' },
        { name: 'High Rollers Home Game', description: 'Monthly deep stack event', default_game_type: 'PLO', default_stakes: '5/10', frequency: 'monthly' },
    ].map((g, i) => ({
        id: uuid(), ...g,
        owner_id: userIds[i],
        club_code: `HG-${String(randomInt(1000, 9999))}`,
        invite_code: `invite-${uuid().slice(0, 8)}`,
        is_private: i === 1,
        requires_approval: i === 1,
        city: 'Las Vegas', state: 'NV',
        typical_buyin_min: i === 0 ? 100 : 500,
        typical_buyin_max: i === 0 ? 300 : 2000,
        max_players: i === 0 ? 9 : 6,
        member_count: randomInt(8, 20),
        games_hosted: randomInt(5, 30),
        is_active: true,
    }));
    const homeGroupData = await insert('commander_home_groups', homeGroupRows);
    const homeGroupIds = homeGroupData ? homeGroupData.map(g => g.id) : [];

    // ─── 9. HOME MEMBERS (10 per group) ───
    console.log('\n── Home Game Members ──');
    const hmRows = [];
    for (const gid of homeGroupIds) {
        for (let i = 0; i < 10; i++) {
            hmRows.push({
                id: uuid(), group_id: gid,
                user_id: userIds[i % userIds.length],
                role: i === 0 ? 'owner' : i < 3 ? 'admin' : 'member',
                status: 'active',
                games_attended: randomInt(2, 20),
                can_host: i < 3,
                notifications_enabled: true,
            });
        }
    }
    await insert('commander_home_members', hmRows);

    // ─── 10. HOME GAMES (6 games) ───
    console.log('\n── Home Games ──');
    const hgRows = [];
    for (const gid of homeGroupIds) {
        for (let i = 0; i < 3; i++) {
            const schedDate = new Date();
            schedDate.setDate(schedDate.getDate() - (20 - i * 10));
            hgRows.push({
                id: uuid(), group_id: gid,
                host_id: pick(),
                title: `${i === 0 ? 'Past' : i === 1 ? 'Recent' : 'Upcoming'} Game Night`,
                game_type: 'NLH', stakes: '1/2',
                buyin_min: 100, buyin_max: 300,
                scheduled_date: schedDate.toISOString().split('T')[0],
                start_time: '19:00', end_time: '23:00',
                max_players: 9, min_players: 4,
                rsvp_yes: randomInt(4, 8),
                status: i < 2 ? 'completed' : 'scheduled',
                allow_guests: true, guest_limit: 2,
                food_drinks: 'Pizza and beer provided',
            });
        }
    }
    const hgData = await insert('commander_home_games', hgRows);
    const homeGameIds = hgData ? hgData.map(g => g.id) : [];

    // ─── 11. HOME RSVPS (4 per game) ───
    console.log('\n── Home Game RSVPs ──');
    const rsvpRows = [];
    for (const hgId of homeGameIds) {
        for (let i = 0; i < 4; i++) {
            rsvpRows.push({
                id: uuid(), game_id: hgId,
                user_id: userIds[i % userIds.length],
                response: randomPick(['yes', 'yes', 'yes', 'maybe', 'no']),
                bringing_guests: randomInt(0, 1),
                is_confirmed: true,
                responded_at: randomDate(14),
            });
        }
    }
    await insert('commander_home_rsvps', rsvpRows);

    // ─── 12. VENUE POSTS (12 posts) ───
    console.log('\n── Venue Posts ──');
    const postContents = [
        { content: 'Tonight\'s action is heating up! 10 tables running, NLH and PLO.', type: 'update' },
        { content: 'HUGE bad beat jackpot hit last night! $47,000 split among the table!', type: 'announcement' },
        { content: 'New promotion: Aces Cracked every Monday and Wednesday!', type: 'promotion' },
        { content: 'Weekend Major Tournament this Saturday - $300 buy-in, $15K guaranteed!', type: 'event' },
        { content: 'Congratulations to Mike Chen for winning our Monthly Championship!', type: 'announcement' },
        { content: 'We\'ve added 3 new PLO tables due to popular demand. Come play!', type: 'update' },
        { content: 'Happy Hour Double Comps 4-6pm every day this month!', type: 'promotion' },
        { content: 'Live stream tonight on our YouTube channel - Table 1 feature table!', type: 'announcement' },
        { content: 'New dealer training program starting next week. Apply within!', type: 'update' },
        { content: 'Holiday Special: Freeroll tournament for all loyalty members!', type: 'event' },
        { content: 'High Hand of the Hour winners tonight: $500 each hour!', type: 'promotion' },
        { content: 'Thank you to all players who made 2025 our best year ever!', type: 'announcement' },
    ];
    const vpRows = postContents.map((p, i) => ({
        id: uuid(), venue_id: VENUE_ID,
        author_id: pick(),
        author_name: `Staff Member ${randomInt(1, 5)}`,
        content: p.content, post_type: p.type,
        likes_count: randomInt(5, 100),
        comments_count: randomInt(0, 20),
        shares_count: randomInt(0, 10),
        is_pinned: i === 0,
        is_published: true,
        created_at: randomDate(30),
    }));
    await insert('commander_venue_posts', vpRows);

    // ─── 13. VENUE PHOTOS (8 photos) ───
    console.log('\n── Venue Photos ──');
    const photoRows = [
        { caption: 'Main poker room floor', category: 'poker_room' },
        { caption: 'Final table action shot', category: 'tournament' },
        { caption: 'January High Hand winner - Royal Flush!', category: 'high_hand' },
        { caption: 'Grand opening night', category: 'event' },
        { caption: 'VIP lounge area', category: 'general' },
        { caption: 'February tournament champion', category: 'winner' },
        { caption: 'New table felt and chairs', category: 'poker_room' },
        { caption: 'Weekend warrior meetup group photo', category: 'event' },
    ].map((p, i) => ({
        id: uuid(), venue_id: VENUE_ID,
        uploaded_by: pick(),
        url: `https://placehold.co/800x600/1a1a2e/22D3EE?text=Photo+${i + 1}`,
        thumbnail_url: `https://placehold.co/200x150/1a1a2e/22D3EE?text=Thumb+${i + 1}`,
        ...p,
        is_cover_photo: i === 0,
        is_featured: i < 3,
        display_order: i,
        likes_count: randomInt(10, 80),
    }));
    await insert('commander_venue_photos', photoRows);

    // ─── 14. VENUE REVIEWS (6 reviews) ───
    console.log('\n── Venue Reviews ──');
    const reviewRows = [
        { title: 'Best poker room in the area', content: 'Great staff, fair games, love the comps!', overall_rating: 5 },
        { title: 'Solid experience', content: 'Good action, waitlist can be long on weekends.', overall_rating: 4 },
        { title: 'Amazing tournaments', content: 'Tournament structure is one of the best around.', overall_rating: 5 },
        { title: 'Decent room', content: 'Could use AC improvement, but games are good.', overall_rating: 3 },
        { title: 'Great PLO action', content: 'Only place with regular PLO games. Staff is top notch.', overall_rating: 4 },
        { title: 'VIP treatment is excellent', content: 'Loyalty program is the best in town.', overall_rating: 5 },
    ].map((r, i) => ({
        id: uuid(), venue_id: VENUE_ID,
        reviewer_id: userIds[(i + 20) % userIds.length],
        ...r,
        game_selection_rating: randomInt(3, 5),
        staff_rating: randomInt(4, 5),
        atmosphere_rating: randomInt(3, 5),
        food_rating: randomInt(2, 5),
        games_played: ['NLH 1/3', 'NLH 2/5'],
        is_verified: Math.random() > 0.3,
        is_published: true,
        helpful_count: randomInt(0, 20),
        created_at: randomDate(60),
    }));
    await insert('commander_venue_reviews', reviewRows);

    // ─── 15. VENUE FOLLOWERS (25 followers) ───
    console.log('\n── Venue Followers ──');
    const followerRows = [];
    for (let i = 0; i < 25; i++) {
        followerRows.push({
            id: uuid(), venue_id: VENUE_ID,
            user_id: userIds[i % userIds.length],
            notify_posts: true,
            notify_events: true,
            notify_promotions: Math.random() > 0.3,
            notify_tournaments: Math.random() > 0.2,
            followed_at: randomDate(90),
        });
    }
    await insert('commander_venue_followers', followerRows);

    // ─── 16. REMAINING TABLES ───

    // Notifications (15)
    console.log('\n── Notifications ──');
    const notifRows = [];
    for (let i = 0; i < 15; i++) {
        notifRows.push({
            id: uuid(), venue_id: VENUE_ID,
            player_id: pick(),
            notification_type: randomPick(['waitlist_ready', 'promotion', 'tournament_start', 'announcement']),
            channel: randomPick(['push', 'sms', 'in_app']),
            title: 'Notification',
            message: `Your ${randomPick(['waitlist spot', 'promotion', 'tournament'])} is ready.`,
            status: randomPick(['sent', 'delivered', 'read']),
            sent_at: randomDate(7),
            created_at: randomDate(7),
        });
    }
    await insert('commander_notifications', notifRows);

    // Player Preferences (10)
    console.log('\n── Player Preferences ──');
    const prefRows = [];
    for (let i = 0; i < 10; i++) {
        prefRows.push({
            id: uuid(),
            player_id: userIds[i % userIds.length],
            venue_id: VENUE_ID,
            preferred_games: ['NLH'],
            preferred_stakes: [randomPick(['1/3', '2/5'])],
            auto_join_waitlist: Math.random() > 0.5,
        });
    }
    await insert('commander_player_preferences', prefRows);

    // Wait Time Predictions (20)
    console.log('\n── Wait Time Predictions ──');
    const wtpRows = [];
    for (let h = 10; h <= 23; h++) {
        for (let dow = 0; dow < 2; dow++) {
            wtpRows.push({
                id: uuid(), venue_id: VENUE_ID,
                game_type: 'NLH', stakes: '1/3',
                hour_of_day: h, day_of_week: dow + 5,
                predicted_minutes: randomInt(10, 60),
                actual_minutes: randomInt(5, 70),
                confidence: +(Math.random() * 0.4 + 0.6).toFixed(2),
            });
        }
    }
    await insert('commander_wait_time_predictions', wtpRows);

    // Dealer Marketplace (3 listings)
    console.log('\n── Dealer Marketplace ──');
    const dmRows = [
        { name: 'Pro Dealer Mike', hourly_rate: 35, games_offered: ['NLH', 'PLO'], bio: '10 years experience dealing', rating: 4.8 },
        { name: 'Ace Dealer Service', hourly_rate: 40, games_offered: ['NLH', 'PLO', 'Stud'], bio: 'Professional dealing team', rating: 4.5 },
        { name: 'Quick Deal Jessica', hourly_rate: 30, games_offered: ['NLH'], bio: 'Fast and accurate dealing', rating: 4.9 },
    ].map(d => ({
        id: uuid(), dealer_id: pick(),
        ...d,
        service_area: ['Las Vegas', 'Henderson'],
        verified: Math.random() > 0.3,
        status: 'active',
    }));
    await insert('commander_dealer_marketplace', dmRows);

    // Equipment Rentals (3 items)
    console.log('\n── Equipment Rentals ──');
    const eqRows = [
        { name: 'Professional Poker Table (10-seat)', category: 'tables', daily_rate: 75 },
        { name: 'Chip Set (500pc Clay)', category: 'chips', daily_rate: 25 },
        { name: 'Automatic Card Shuffler', category: 'equipment', daily_rate: 40 },
    ].map(e => ({
        id: uuid(), vendor_id: pick(), ...e, available: true,
    }));
    await insert('commander_equipment_rentals', eqRows);

    // Export Jobs (3)
    console.log('\n── Export Jobs ──');
    const expRows = [
        { export_type: 'player_report', format: 'csv', status: 'completed' },
        { export_type: 'financial_summary', format: 'pdf', status: 'completed' },
        { export_type: 'tournament_results', format: 'csv', status: 'pending' },
    ].map(e => ({
        id: uuid(), venue_id: VENUE_ID,
        requested_by: staffIds.length ? randomPick(staffIds) : null,
        ...e,
        date_from: dateAgo(30), date_to: dateAgo(0),
        row_count: e.status === 'completed' ? randomInt(50, 500) : null,
        created_at: randomDate(14),
    }));
    await insert('commander_export_jobs', expRows);

    // Club Announcements (5)
    console.log('\n── Club Announcements ──');
    if (homeGroupIds.length) {
        const annRows = [];
        for (let i = 0; i < 5; i++) {
            annRows.push({
                id: uuid(),
                group_id: randomPick(homeGroupIds),
                author_id: pick(),
                title: `Announcement ${i + 1}`,
                message: randomPick([
                    'Game night this Saturday! RSVP now.',
                    'New house rules posted - please review.',
                    'Congratulations to last week\'s winner!',
                    'Holiday game schedule change - check calendar.',
                    'Welcome to our newest members!',
                ]),
                message_type: randomPick(['general', 'game_update', 'rules_update']),
                target_all: true,
                status: 'sent',
                send_push: true,
                created_at: randomDate(14),
            });
        }
        await insert('commander_club_announcements', annRows);
    }

    console.log('\n✅ Part 3 complete!\n');
}

main().catch(console.error);
