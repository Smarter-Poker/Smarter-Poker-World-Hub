// ═══════════════════════════════════════════════════════════════════════════
// STANDARD DIAMOND REWARDS — 14 Ways to Earn (Daily Cap: 500 💎)
// Streak Multipliers: 1.0x (Days 1-3), 1.5x (Days 4-6), 2.0x (Day 7+)
// ═══════════════════════════════════════════════════════════════════════════
export const STANDARD_REWARDS = [
    // ── Daily ──
    { id: 'daily_login', icon: '📅', name: 'Daily Login', amount: '5-50 💎', note: 'Scales With Streak (Day 1: 5💎, Day 7+: 50💎)', category: 'Daily' },
    { id: 'daily_trivia', icon: '🧠', name: 'Daily Trivia Challenge', amount: '+15 💎', note: 'Complete The Daily Challenge (Any Score!)', category: 'Daily' },
    // ── Social ──
    { id: 'social_post', icon: '📝', name: 'Create Post', amount: '+10 💎', note: 'Share A Hand, Achievement, Or Thought (1/day)', category: 'Social' },
    { id: 'share_content', icon: '📤', name: 'Share Content', amount: '+10 💎', note: 'Share A Post Or Score Card (1/day)', category: 'Social' },
    { id: 'strategy_comment', icon: '💬', name: 'Strategy Comment', amount: '+5 💎', note: 'Leave A Strategy Comment (5/day)', category: 'Social' },
    { id: 'reaction', icon: '👍', name: 'Like / React', amount: '+2 💎', note: 'React To A Post (10/day Max)', category: 'Social' },
    { id: 'follow_user', icon: '👥', name: 'Follow A Player', amount: '+5 💎', note: 'Follow Another Player (3/day Max)', category: 'Social' },
    // ── Training / Content ──
    { id: 'video_watch', icon: '🎬', name: 'Watch A Video', amount: '+3 💎', note: 'Watch 5+ Minutes Of Training Content (3/day)', category: 'Training' },
    { id: 'video_favorite', icon: '⭐', name: 'Favorite A Video', amount: '+2 💎', note: 'Save A Video To Favorites (3/day Max)', category: 'Training' },
    // ── Engagement ──
    { id: 'venue_review', icon: '📍', name: 'Venue Review', amount: '+25 💎', note: 'Review A Venue You\'ve Visited (GPS Verified, 1/venue)', category: 'Engagement' },
    // ── One-Time ──
    { id: 'profile_pic', icon: '📸', name: 'Profile Picture', amount: '+10 💎', note: 'Upload Your First Profile Picture', category: 'One-Time' },
    { id: 'profile_complete', icon: '✅', name: 'Profile Complete', amount: '+50 💎', note: 'Complete Avatar + Bio + Username', category: 'One-Time' },
    { id: 'hendonmob_link', icon: '🔗', name: 'HendonMob Link', amount: '+25 💎', note: 'Link Your HendonMob Profile', category: 'One-Time' },
    // ── Referral ──
    { id: 'referral_success', icon: '🏆', name: 'Successful Referral', amount: '+500 💎', note: 'Refer A Friend Who Verifies Email & Phone (BYPASSES CAP!)', category: 'Referral', bypassesCap: true },
];

// ═══════════════════════════════════════════════════════════════════════════
// EASTER EGGS — 100 Hidden Achievements (6 Categories)
// From database schema: 20260112_diamond_reward_system.sql
// ═══════════════════════════════════════════════════════════════════════════
export const EASTER_EGGS = {
    performance: [
        { id: 'egg_gto_machine', icon: '🤖', name: 'GTO Machine', reward: '+100 💎', trigger: '100 questions, no hints', rarity: 'epic' },
        { id: 'egg_speed_demon', icon: '⚡', name: 'Speed Demon', reward: '+50 💎', trigger: '20 correct answers < 3s each', rarity: 'rare' },
        { id: 'egg_optimizer', icon: '🔧', name: 'The Optimizer', reward: '+40 💎', trigger: 'First-try fix on a Leak Signal', rarity: 'uncommon' },
        { id: 'egg_dead_reckoning', icon: '🎯', name: 'Dead Reckoning', reward: '+200 💎', trigger: 'Level 5+ pass with 100% on first try', rarity: 'legendary' },
        { id: 'egg_calculated_risk', icon: '📐', name: 'Calculated Risk', reward: '+30 💎', trigger: '5 consecutive close-to-GTO alternate lines', rarity: 'uncommon' },
        { id: 'egg_deep_diver', icon: '🤿', name: 'Deep Diver', reward: '+60 💎', trigger: '60+ mins in Charts section in one day', rarity: 'rare' },
        { id: 'egg_night_owl', icon: '🦉', name: 'The Night Owl', reward: '+50 💎', trigger: 'Complete training between 2AM-5AM', rarity: 'rare' },
        { id: 'egg_perfectionist', icon: '✨', name: 'The Perfectionist', reward: '+150 💎', trigger: '5 consecutive levels with 0 errors', rarity: 'epic' },
        { id: 'egg_comeback_kid', icon: '💪', name: 'The Comeback Kid', reward: '+75 💎', trigger: 'Pass with 95% after 2 fails', rarity: 'rare' },
        { id: 'egg_chart_navigator', icon: '🗺️', name: 'Chart Navigator', reward: '+30 💎', trigger: 'Interact with 10 charts in 5 mins', rarity: 'uncommon' },
    ],
    timing_loyalty: [
        { id: 'egg_sunrise_grinder', icon: '🌅', name: 'Sunrise Grinder', reward: '+50 💎', trigger: 'Training at local sunrise time', rarity: 'rare' },
        { id: 'egg_anniversary', icon: '🎂', name: 'The Anniversary', reward: '+100 💎', trigger: 'Login 1 month to the minute after signup', rarity: 'epic' },
        { id: 'egg_lunch_break', icon: '🥪', name: 'Lunch Break', reward: '+20 💎', trigger: '3 games between 12PM-1PM', rarity: 'common' },
        { id: 'egg_weekend_warrior', icon: '⚔️', name: 'Weekend Warrior', reward: '+150 💎', trigger: 'Hit 500 cap on Sat & Sun', rarity: 'epic' },
        { id: 'egg_new_year', icon: '🎆', name: 'New Year, New Ranges', reward: '+203 💎', trigger: 'Play on Jan 1st', rarity: 'rare' },
        { id: 'egg_solidarity', icon: '🤝', name: 'Solidarity', reward: '+75 💎', trigger: 'Login at same time as 3 referrals', rarity: 'rare' },
        { id: 'egg_button_masher', icon: '👆', name: 'Button Masher', reward: '+5 💎', trigger: 'Click logo 10 times rapidly', rarity: 'common' },
        { id: 'egg_dark_mode_detective', icon: '🕵️', name: 'Dark Mode Detective', reward: '+10 💎', trigger: 'Toggle theme 5 times in 10s', rarity: 'common' },
        { id: 'egg_librarian', icon: '📚', name: 'The Librarian', reward: '+30 💎', trigger: 'Search 20 specific player/game types', rarity: 'uncommon' },
        { id: 'egg_precision_pointer', icon: '🎯', name: 'Precision Pointer', reward: '+15 💎', trigger: 'Hover every chart element before move', rarity: 'common' },
        { id: 'egg_explorer', icon: '🧭', name: 'The Explorer', reward: '+25 💎', trigger: 'Click every tab in Manager < 30s', rarity: 'uncommon' },
        { id: 'egg_jackpot', icon: '🏆', name: 'The Jackpot', reward: '+45 💎', trigger: '1/1000 chance Diamond Crit', rarity: 'legendary' },
        { id: 'egg_binary_king', icon: '👑', name: 'Binary King', reward: '+20 💎', trigger: 'End day with 101 or 010 Diamonds', rarity: 'uncommon' },
        { id: 'egg_developers_handshake', icon: '🤝', name: "Developer's Handshake", reward: '+50 💎', trigger: 'Scroll to bottom of Credits', rarity: 'rare' },
        { id: 'egg_ghost', icon: '👻', name: 'The Ghost', reward: '+500 💎', trigger: '30-day streak with no missed tasks', rarity: 'legendary' },
    ],
    strategy_mastery: [
        { id: 'egg_machine', icon: '⚙️', name: 'The Machine', reward: '+100 💎', trigger: '50-question session, median time < 1.5s', rarity: 'epic' },
        { id: 'egg_pure_strategy', icon: '♟️', name: 'Pure Strategy', reward: '+75 💎', trigger: 'Pick 100% freq move 25 times in a row', rarity: 'rare' },
        { id: 'egg_mix_master', icon: '🎚️', name: 'Mix Master', reward: '+50 💎', trigger: 'Identify 5 mixed strategies in a row', rarity: 'rare' },
        { id: 'egg_punisher', icon: '💀', name: 'The Punisher', reward: '+40 💎', trigger: 'Play correctly vs simulated whale line 10x', rarity: 'uncommon' },
        { id: 'egg_folding_legend', icon: '🃏', name: 'Folding Legend', reward: '+60 💎', trigger: 'Find a GTO Fold with Top Pair', rarity: 'rare' },
        { id: 'egg_value_extractor', icon: '💰', name: 'Value Extractor', reward: '+80 💎', trigger: 'Maximize EV in one level', rarity: 'epic' },
        { id: 'egg_bluffcatcher', icon: '🎣', name: 'The Bluffcatcher', reward: '+50 💎', trigger: 'Correct call on triple-barrel bluff', rarity: 'rare' },
        { id: 'egg_range_architect', icon: '🏗️', name: 'Range Architect', reward: '+40 💎', trigger: 'View full range of 1 position 50x', rarity: 'uncommon' },
        { id: 'egg_equity_expert', icon: '📈', name: 'Equity Expert', reward: '+30 💎', trigger: 'Guess equity within 2%', rarity: 'uncommon' },
        { id: 'egg_blocker_pro', icon: '🛡️', name: 'Blocker Pro', reward: '+45 💎', trigger: 'Win hand using specific blocker info', rarity: 'rare' },
        { id: 'egg_overbet_outlaw', icon: '🤠', name: 'Overbet Outlaw', reward: '+35 💎', trigger: 'Execute 2x Pot overbet correctly', rarity: 'rare' },
        { id: 'egg_minimum_defense', icon: '🛡️', name: 'Minimum Defense', reward: '+55 💎', trigger: 'Identify MDF correctly 3x', rarity: 'rare' },
        { id: 'egg_sniper', icon: '🎯', name: 'The Sniper', reward: '+150 💎', trigger: 'Pass level with < 10s total on clock', rarity: 'legendary' },
        { id: 'egg_check_raise_king', icon: '👑', name: 'Check-Raise King', reward: '+40 💎', trigger: 'Find 10 check-raise lines in 1 session', rarity: 'uncommon' },
        { id: 'egg_tanker', icon: '⏱️', name: 'The Tanker', reward: '+20 💎', trigger: 'Spend exactly 29s on a question', rarity: 'common' },
        { id: 'egg_postflop_wizard', icon: '🧙', name: 'Post-Flop Wizard', reward: '+100 💎', trigger: '0 missed Turn/River decisions for 24h', rarity: 'epic' },
        { id: 'egg_preflop_bot', icon: '🤖', name: 'Pre-Flop Bot', reward: '+250 💎', trigger: '500 pre-flop decisions at 100% accuracy', rarity: 'legendary' },
        { id: 'egg_small_baller', icon: '🏀', name: 'Small Baller', reward: '+30 💎', trigger: 'Win level using only 33% pot sizing', rarity: 'uncommon' },
        { id: 'egg_polarizer', icon: '⚡', name: 'Polarizer', reward: '+50 💎', trigger: 'Identify polarized vs condensed range', rarity: 'rare' },
        { id: 'egg_indifference_point', icon: '⚖️', name: 'Indifference Point', reward: '+100 💎', trigger: 'Make opponent EV zero', rarity: 'epic' },
    ],
    social_viral: [
        { id: 'egg_retweet_royalty', icon: '👑', name: 'Retweet Royalty', reward: '+500 💎', trigger: 'Developer shares your post', rarity: 'legendary' },
        { id: 'egg_hashtag_hero', icon: '#️⃣', name: 'Hashtag Hero', reward: '+50 💎', trigger: 'Use 3 main tags in 10 posts', rarity: 'uncommon' },
        { id: 'egg_recruiter', icon: '🎖️', name: 'The Recruiter', reward: '+200 💎', trigger: '2 referrals reach Level 5 same day', rarity: 'epic' },
        { id: 'egg_video_star', icon: '🎬', name: 'Video Star', reward: '+150 💎', trigger: 'Post Mac Studio Terminal use', rarity: 'rare' },
        { id: 'egg_comment_king', icon: '💬', name: 'Comment King', reward: '+100 💎', trigger: 'Strategy comment reaches 50 likes', rarity: 'rare' },
        { id: 'egg_squad_goals', icon: '👥', name: 'Squad Goals', reward: '+250 💎', trigger: '5 referrals active simultaneously', rarity: 'epic' },
        { id: 'egg_wall_of_fame', icon: '🏆', name: 'Wall of Fame', reward: '+300 💎', trigger: 'Featured on Daily Top Grinder', rarity: 'legendary' },
        { id: 'egg_discord_diamond', icon: '💎', name: 'Discord Diamond', reward: '+50 💎', trigger: 'Reach Active role in Discord', rarity: 'uncommon' },
        { id: 'egg_streamer', icon: '📺', name: "Streamer's Luck", reward: '+200 💎', trigger: 'Stream Orb for 1 hour', rarity: 'epic' },
        { id: 'egg_ghost_writer', icon: '✍️', name: 'The Ghost Writer', reward: '+500 💎', trigger: 'Tip added to loading screen', rarity: 'legendary' },
        { id: 'egg_feedback_loop', icon: '🐛', name: 'Feedback Loop', reward: '+300 💎', trigger: 'Submit bug that gets fixed', rarity: 'epic' },
        { id: 'egg_social_butterfly', icon: '🦋', name: 'Social Butterfly', reward: '+40 💎', trigger: 'Share a loss/learning moment', rarity: 'common' },
        { id: 'egg_stalking_success', icon: '👀', name: 'Stalking Success', reward: '+25 💎', trigger: 'Follow all 4 Agent accounts', rarity: 'common' },
        { id: 'egg_bio_hacker', icon: '🔗', name: 'Bio Hacker', reward: '+100 💎', trigger: 'Orb URL in social bio', rarity: 'rare' },
        { id: 'egg_group_chat_leader', icon: '💬', name: 'Group Chat Leader', reward: '+60 💎', trigger: 'Invite 3 to private study group', rarity: 'uncommon' },
        { id: 'egg_diplomat', icon: '🌍', name: 'The Diplomat', reward: '+150 💎', trigger: 'Refer someone from different country', rarity: 'rare' },
        { id: 'egg_meme_lord', icon: '😂', name: 'Meme Lord', reward: '+100 💎', trigger: 'Meme gets 20+ likes', rarity: 'rare' },
        { id: 'egg_poll_master', icon: '📊', name: 'Poll Master', reward: '+30 💎', trigger: 'Vote in 10 Hand of the Day polls', rarity: 'common' },
        { id: 'egg_ambassador', icon: '🏅', name: 'The Ambassador', reward: '+1,000 💎', trigger: 'Reach 20 successful referrals', rarity: 'legendary' },
        { id: 'egg_storyteller', icon: '📱', name: 'Storyteller', reward: '+40 💎', trigger: 'Share Level Up to IG/FB Story', rarity: 'common' },
    ],
    meta_interface: [
        { id: 'egg_konami_code', icon: '🎮', name: 'Konami Code', reward: '+50 💎', trigger: 'Enter Up-Up-Down-Down on dash', rarity: 'rare' },
        { id: 'egg_terminal_junkie', icon: '⌨️', name: 'Terminal Junkie', reward: '+75 💎', trigger: '10 commands without mouse', rarity: 'rare' },
        { id: 'egg_collector', icon: '🎨', name: 'The Collector', reward: '+100 💎', trigger: 'Own 3 Orange Ball skins', rarity: 'epic' },
        { id: 'egg_deep_sleeper', icon: '😴', name: 'Deep Sleeper', reward: '+50 💎', trigger: 'Leave Orb open for 24 hours', rarity: 'uncommon' },
        { id: 'egg_efficiency_expert', icon: '⚡', name: 'Efficiency Expert', reward: '+20 💎', trigger: 'Login to Game in < 2s', rarity: 'common' },
        { id: 'egg_volume_control', icon: '🔊', name: 'Volume Control', reward: '+5 💎', trigger: 'Toggle mute 10 times in a heater', rarity: 'common' },
        { id: 'egg_window_shopper', icon: '🛍️', name: 'Window Shopper', reward: '+25 💎', trigger: 'View store 5 days, buy nothing', rarity: 'uncommon' },
        { id: 'egg_data_miner', icon: '⛏️', name: 'Data Miner', reward: '+50 💎', trigger: 'Export hand history 10 times', rarity: 'rare' },
        { id: 'egg_cleaner', icon: '🧹', name: 'The Cleaner', reward: '+10 💎', trigger: 'Clear all notifications', rarity: 'common' },
        { id: 'egg_zoomer', icon: '🔍', name: 'Zoomer', reward: '+15 💎', trigger: 'Change UI scaling 3 times', rarity: 'common' },
        { id: 'egg_ghost_user', icon: '👻', name: 'The Ghost User', reward: '+20 💎', trigger: 'Login via Incognito mode', rarity: 'uncommon' },
        { id: 'egg_toggle_titan', icon: '🎚️', name: 'Toggle Titan', reward: '+30 💎', trigger: '50 Search filter switches', rarity: 'uncommon' },
        { id: 'egg_scroll_marathon', icon: '📜', name: 'Scroll Marathon', reward: '+40 💎', trigger: 'Scroll to bottom of leaderboard', rarity: 'common' },
        { id: 'egg_architect', icon: '🏗️', name: 'The Architect', reward: '+50 💎', trigger: 'Customize Dashboard layout', rarity: 'uncommon' },
        { id: 'egg_multi_tabber', icon: '📑', name: 'Multi-Tabber', reward: '+100 💎', trigger: '4 charts open in 4 windows', rarity: 'epic' },
        { id: 'egg_refresh_rebel', icon: '🔄', name: 'Refresh Rebel', reward: '+5 💎', trigger: 'Refresh during loading screen', rarity: 'common' },
        { id: 'egg_hardware_enthusiast', icon: '💻', name: 'Hardware Enthusiast', reward: '+50 💎', trigger: 'Access from 3 different IPs', rarity: 'rare' },
        { id: 'egg_waiter', icon: '⏳', name: 'The Waiter', reward: '+20 💎', trigger: 'Wait 5 mins on Reward screen', rarity: 'uncommon' },
        { id: 'egg_minimalist', icon: '🎯', name: 'The Minimalist', reward: '+100 💎', trigger: 'Play with 0 HUD elements', rarity: 'epic' },
        { id: 'egg_color_blind', icon: '🎨', name: 'Color Blind', reward: '+30 💎', trigger: 'Change Yellow Ball to custom color', rarity: 'uncommon' },
    ],
    legacy_milestones: [
        { id: 'egg_centurion', icon: '💯', name: 'The Centurion', reward: '+1,000 💎', trigger: '100-day login streak', rarity: 'legendary' },
        { id: 'egg_millionaire', icon: '💰', name: 'Millionaire', reward: '+2,500 💎', trigger: '1,000,000 lifetime diamonds earned', rarity: 'legendary' },
        { id: 'egg_old_guard', icon: '🛡️', name: 'Old Guard', reward: '+500 💎', trigger: 'Member for 1 year', rarity: 'epic' },
        { id: 'egg_finisher', icon: '🏁', name: 'The Finisher', reward: '+2,000 💎', trigger: 'Complete every training game in DB', rarity: 'legendary' },
        { id: 'egg_zero_leak', icon: '💧', name: 'Zero Leak', reward: '+1,500 💎', trigger: '1,000 hands with no leak signals', rarity: 'legendary' },
        { id: 'egg_high_roller', icon: '🎲', name: 'High Roller', reward: '+500 💎', trigger: 'Spend 10k Diamonds in one day', rarity: 'epic' },
        { id: 'egg_oracle', icon: '🔮', name: 'The Oracle', reward: '+300 💎', trigger: 'Predict 10 GTO moves in a row', rarity: 'epic' },
        { id: 'egg_server_first', icon: '🥇', name: 'Server First', reward: '+200 💎', trigger: 'Be the first to pass a new level', rarity: 'rare' },
        { id: 'egg_diamond_hands', icon: '💎', name: 'Diamond Hands', reward: '+400 💎', trigger: 'Hold 5k+ Diamonds for 30 days', rarity: 'epic' },
        { id: 'egg_whale', icon: '🐋', name: 'The Whale', reward: '+10,000 💎', trigger: 'Reach 100 Referrals', rarity: 'legendary' },
        { id: 'egg_beta_tester', icon: '🧪', name: 'Beta Tester', reward: '+500 💎', trigger: 'User ID within first 500 signups', rarity: 'epic' },
        { id: 'egg_level_100_boss', icon: '👑', name: 'Level 100 Boss', reward: '+1,000 💎', trigger: 'Reach Level 100', rarity: 'legendary' },
        { id: 'egg_multi_level_master', icon: '⚡', name: 'Multi-Level Master', reward: '+250 💎', trigger: 'Clear 10 levels in 1 hour', rarity: 'epic' },
        { id: 'egg_daily_legend', icon: '🌟', name: 'Daily Legend', reward: '+1,000 💎', trigger: 'Hit 500 cap 30 days in a row', rarity: 'legendary' },
        { id: 'egg_infinity', icon: '♾️', name: 'To Infinity', reward: '+5,000 💎', trigger: 'Earn 1,000,000 total diamonds', rarity: 'legendary' },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
// DIAMOND PACKAGES — 1 Diamond = 1 Cent ($0.01)
// 5% bonus on purchases of $100 or more
// ═══════════════════════════════════════════════════════════════════════════
export const DIAMOND_PACKAGES = [
    {
        id: 'micro',
        name: 'Micro',
        diamonds: 100,
        price: 1.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'small',
        name: 'Small',
        diamonds: 500,
        price: 5.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'medium',
        name: 'Medium',
        diamonds: 1000,
        price: 10.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'standard',
        name: 'Standard',
        diamonds: 2500,
        price: 25.00,
        popular: true,
        bonus: 0,
    },
    {
        id: 'large',
        name: 'Large',
        diamonds: 5000,
        price: 50.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'value',
        name: 'Value',
        diamonds: 10000,
        price: 100.00,
        popular: false,
        bonus: 500, // 5% bonus
        hasDiscount: true,
    },
    {
        id: 'premium',
        name: 'Premium',
        diamonds: 25000,
        price: 250.00,
        popular: false,
        bonus: 1250, // 5% bonus
        hasDiscount: true,
    },
    {
        id: 'whale',
        name: 'Whale',
        diamonds: 50000,
        price: 500.00,
        popular: false,
        bonus: 2500, // 5% bonus
        hasDiscount: true,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// VIP MEMBERSHIP — $19.99/month for all features
// ═══════════════════════════════════════════════════════════════════════════
export const VIP_MEMBERSHIP = {
    daily: {
        id: 'vip-daily',
        name: 'VIP Daily Pass',
        price: 150,
        interval: 'day',
        isDiamondCost: true,
        popular: false,
    },
    monthly: {
        id: 'vip-monthly',
        name: 'VIP Monthly',
        price: 19.99,
        interval: 'month',
        popular: true,
    },
    annual: {
        id: 'vip-annual',
        name: 'VIP Annual',
        price: 199.99,
        interval: 'year',
        savings: 39.89, // 2 months free
        popular: false,
    },
};

export const VIP_BENEFITS = [
    // ─── SMARTER.POKER PLATFORM ───
    { icon: '', title: 'Ad-Free Experience Across The Entire Platform', description: 'No Ads Or Banners Anywhere On The Platform', value: 'Platform', category: 'Smarter.Poker' },
    { icon: '', title: 'Unlimited GTO Training Games (No Diamond Cost)', description: 'Play All GTO Training Games Without Spending Diamonds', value: 'Unlimited', category: 'Smarter.Poker' },
    { icon: '', title: 'Unlimited Memory Games (No Diamond Cost)', description: 'Play All Memory Games Without Spending Diamonds', value: 'Unlimited', category: 'Smarter.Poker' },
    { icon: '', title: 'Unlimited Poker Trivia (No Diamond Cost)', description: 'Play All Poker Trivia Games Without Spending Diamonds', value: 'Unlimited', category: 'Smarter.Poker' },
    { icon: '', title: 'Full Access To GTO AI Personal Assistant', description: 'Priority AI Coaching & Hand Analysis', value: 'Unlimited', category: 'Smarter.Poker' },
    { icon: '', title: 'Advanced Leak Finder Analysis Tools', description: 'Full Leak Detection And Analysis Tools', value: '$50/Mo', category: 'Smarter.Poker' },
    { icon: '', title: 'Bankroll Manager Pro — All Session Tracking & Analytics', description: 'All Pro Tools For Session Tracking & Analytics', value: '$25/Mo', category: 'Smarter.Poker' },
    { icon: '', title: 'Advanced Poker Near Me Filters & Venue Intelligence', description: 'Premium Filters And Venue Intelligence', value: '$15/Mo', category: 'Smarter.Poker' },
    { icon: '', title: 'Free Entry To All Diamond Arena Freeroll Tournaments', description: 'Unlimited Freeroll Tournament Entries', value: 'Unlimited', category: 'Smarter.Poker' },
    { icon: '', title: 'Early Access To New Platform Features & Beta Programs', description: 'Be First To Try New Features Before Public Release', value: 'VIP Only', category: 'Smarter.Poker' },
    // ─── BONUS PERKS (included in Platform) ───
    { icon: '', title: '500 Bonus Diamonds Credited Every Month', description: '500 Bonus Diamonds Credited Every Month', value: '500/Mo', category: 'Smarter.Poker' },
    { icon: '', title: 'Up To 5 Custom AI-Generated Avatars', description: 'Create Up To 5 AI-Generated Custom Avatars', value: '5 Slots', category: 'Smarter.Poker' },
    { icon: '', title: 'Exclusive Gold VIP Profile Badge & Cosmetic Flair', description: 'Exclusive Gold VIP Border, Crown Icon & Profile Cosmetics', value: 'Exclusive', category: 'Smarter.Poker' },
    { icon: '', title: 'Priority Support With Fast-Track Assistance', description: 'Fast-Track Support And Dedicated Assistance', value: 'VIP Only', category: 'Smarter.Poker' },
    // ─── CLUB & DIAMOND ARENA FEATURES ───
    { icon: '', title: 'Unlimited Rabbit Hunting — See What Cards Would Have Come', description: 'See What Cards Would Have Come After Folding', value: 'Unlimited', category: 'Club & Diamond Arena' },
    { icon: '', title: 'Show Stack In BBs — Always-On Big-Blind Display', description: 'Display Chip Stacks In Big-Blinds For Better Decisions', value: 'Unlimited', category: 'Club & Diamond Arena' },
    { icon: '', title: 'Unlimited Offline Protection During Hands', description: 'Protection When Disconnected During Hands', value: 'Unlimited', category: 'Club & Diamond Arena' },
    { icon: '', title: 'Auto Time Bank Activation When Needed', description: 'Automatic Time Bank Activation When Needed', value: 'Unlimited', category: 'Club & Diamond Arena' },
    { icon: '', title: '120 Seconds Of Free Time Bank Each Month', description: '120 Seconds Of Free Time Bank Each Month', value: '+120s/Mo', category: 'Club & Diamond Arena' },
    { icon: '', title: '1,200 Interactive Emojis Per Month', description: '1,200 Free Emojis To Throw At The Tables', value: '1,200/Mo', category: 'Club & Diamond Arena' },
    { icon: '', title: '3 Exclusive Table Themes Unlocked', description: '3 Exclusive Table Themes Unlocked', value: '3 Themes', category: 'Club & Diamond Arena' },
    { icon: '', title: 'Create Up To 3 Private Clubs', description: 'Create Up To 3 Private Clubs', value: '3 Clubs', category: 'Club & Diamond Arena' },
    { icon: '', title: '1,000 Player Tags Per Month To Track Opponents', description: '1,000 Tags Per Month To Track Opponents', value: '1,000/Mo', category: 'Club & Diamond Arena' },
    { icon: '', title: 'VIP Priority Tournament Seating & Early Registration', description: 'Get Priority Seating And Early Registration For Tournaments', value: 'VIP Only', category: 'Club & Diamond Arena' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANDISE — Physical goods
// ═══════════════════════════════════════════════════════════════════════════
export const MERCHANDISE = [
    {
        id: 'card-protector-gold',
        name: 'Gold Card Protector',
        description: 'Premium Weighted Card Protector With Smarter.Poker Logo',
        price: 24.99,
        image: '/merch/card-protector-gold.jpg',
        category: 'accessories',
    },
    {
        id: 'card-protector-black',
        name: 'Stealth Card Protector',
        description: 'Matte Black Weighted Card Protector',
        price: 24.99,
        image: '/merch/card-protector-black.jpg',
        category: 'accessories',
    },
    {
        id: 'hoodie-neural',
        name: 'Neural Network Hoodie',
        description: 'Premium Hoodie With Neural Poker Design',
        price: 59.99,
        image: '/merch/hoodie-neural.jpg',
        category: 'apparel',
    },
    {
        id: 'tshirt-gto',
        name: 'GTO Wizard Tee',
        description: '100% Cotton Tee With GTO Brain Graphic',
        price: 29.99,
        image: '/merch/tshirt-gto.jpg',
        category: 'apparel',
    },
    {
        id: 'hat-diamond',
        name: 'Diamond Dad Hat',
        description: 'Embroidered Diamond Logo Cap',
        price: 34.99,
        image: '/merch/hat-diamond.jpg',
        category: 'apparel',
    },
    {
        id: 'deck-premium',
        name: 'Premium Playing Cards',
        description: 'Casino-Quality Smarter.Poker Deck',
        price: 14.99,
        image: '/merch/deck-premium.jpg',
        category: 'accessories',
    },
    {
        id: 'chip-set-100',
        name: '100-Chip Travel Set',
        description: 'Clay Composite Chips In Aluminum Case',
        price: 79.99,
        image: '/merch/chip-set-100.jpg',
        category: 'accessories',
    },
    {
        id: 'chip-set-500',
        name: '500-Chip Pro Set',
        description: 'Full Tournament Set With Dealer Button',
        price: 199.99,
        image: '/merch/chip-set-500.jpg',
        category: 'accessories',
    },
];
