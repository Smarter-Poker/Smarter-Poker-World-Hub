/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND STORE — Purchase Diamonds
   Buy diamonds to use across the Smarter.Poker ecosystem
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

// God-Mode Stack
import { useDiamondStoreStore } from '../../src/stores/diamondStoreStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import ShoppingCart from '../../src/components/store/ShoppingCart';
import useCartStore from '../../src/stores/cartStore';
import supabase from '../../src/lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// XP SYSTEM — Quadratic Progression (Infinite Levels)
// Formula: Level = floor(sqrt(XP / 100)) + 1
// Verified: 700,000 XP = Level 84
// ═══════════════════════════════════════════════════════════════════════════

// Calculate level from total XP
function calculateLevelFromXP(xp) {
    return Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
}

// Calculate total XP required for a given level
function calculateXPForLevel(level) {
    if (level <= 1) return 0;
    return Math.pow(level - 1, 2) * 100;
}

// Calculate XP required to reach next level from current XP
function calculateXPToNextLevel(currentXP) {
    const currentLevel = calculateLevelFromXP(currentXP);
    const xpForNextLevel = calculateXPForLevel(currentLevel + 1);
    return xpForNextLevel - currentXP;
}

// Generate example milestones for display
const XP_MILESTONES = [
    { level: 1, xp: 0 },
    { level: 5, xp: 1600 },
    { level: 10, xp: 8100 },
    { level: 15, xp: 19600 },
    { level: 20, xp: 36100 },
    { level: 25, xp: 57600 },
    { level: 30, xp: 84100 },
    { level: 40, xp: 152100 },
    { level: 50, xp: 240100 },
    { level: 75, xp: 547600 },
    { level: 84, xp: 688900 }, // Verified production data
    { level: 100, xp: 980100 },
];

// ═══════════════════════════════════════════════════════════════════════════
// STANDARD DIAMOND REWARDS — 10 Ways to Earn (Daily Cap: 500 💎)
// Streak Multipliers: 1.0x (Days 1-3), 1.5x (Days 4-6), 2.0x (Day 7+)
// ═══════════════════════════════════════════════════════════════════════════
const STANDARD_REWARDS = [
    { id: 'daily_login', icon: '📅', name: 'Daily Login', amount: '5-50 💎', note: 'Scales with streak (Day 1: 5💎, Day 7+: 50💎)', category: 'Daily' },
    { id: 'first_training_of_day', icon: '🎯', name: 'First Training', amount: '+25 💎', note: 'Complete your first training session of the day', category: 'Daily' },
    { id: 'level_completion_85', icon: '✅', name: 'Level Mastery', amount: '+10 💎', note: 'Complete a level with 85%+ accuracy', category: 'Training' },
    { id: 'perfect_score_bonus', icon: '💯', name: 'Perfect Score', amount: '+5 💎', note: 'Bonus for 100% accuracy on a level', category: 'Training' },
    { id: 'new_level_unlocked', icon: '🔓', name: 'Level Unlocked', amount: '+50 💎', note: 'Unlock a new training level', category: 'Training' },
    { id: 'social_post_share', icon: '📝', name: 'Share Post', amount: '+15 💎', note: 'Share a hand, achievement, or thought', category: 'Social' },
    { id: 'strategy_comment', icon: '💬', name: 'Strategy Comment', amount: '+5 💎', note: 'Leave a thoughtful strategy comment', category: 'Social' },
    { id: 'xp_level_up', icon: '⬆️', name: 'XP Level Up', amount: '+100 💎', note: 'Reach a new XP level', category: 'Progression' },
    { id: 'gto_chart_study', icon: '📊', name: 'Chart Study', amount: '+10 💎', note: 'Study GTO charts for 3+ minutes', category: 'Training' },
    { id: 'referral_success', icon: '👥', name: 'Successful Referral', amount: '+500 💎', note: 'Refer a friend who verifies email & phone (BYPASSES CAP!)', category: 'Referral', bypassesCap: true },
];

// ═══════════════════════════════════════════════════════════════════════════
// EASTER EGGS — 100 Hidden Achievements (6 Categories)
// From database schema: 20260112_diamond_reward_system.sql
// ═══════════════════════════════════════════════════════════════════════════
const EASTER_EGGS = {
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
        { id: 'egg_jackpot', icon: '🎰', name: 'The Jackpot', reward: '+45 💎', trigger: '1/1000 chance Diamond Crit', rarity: 'legendary' },
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
        { id: 'egg_millionaire', icon: '💰', name: 'Millionaire', reward: '+2,500 💎', trigger: '1,000,000 lifetime XP', rarity: 'legendary' },
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
const DIAMOND_PACKAGES = [
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
const VIP_MEMBERSHIP = {
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

const VIP_BENEFITS = [
    // GOLD TIER CARD FEATURES
    { icon: '📊', title: 'Show Stack in BBs', description: 'Display chip stacks in big blinds for better decisions', value: 'Gold' },
    { icon: '🐰', title: 'Rabbit Hunting', description: 'See what cards would have come after folding', value: 'Gold' },
    { icon: '🛡️', title: 'Offline Protection', description: 'Protection when disconnected during hands', value: 'Gold' },
    { icon: '⏱️', title: 'Auto Time Bank', description: 'Automatic time bank activation', value: 'Gold' },
    { icon: '🕐', title: 'Free Time Bank', description: '+120 seconds of free time bank', value: '+120' },
    { icon: '🎨', title: 'Available Themes', description: '3 exclusive table themes to choose from', value: '+3' },
    { icon: '🏠', title: 'Club Creation Limit', description: 'Create up to 3 private clubs', value: '+3' },
    { icon: '😀', title: 'Free Emojis', description: '1,200 free emojis to use at the tables', value: '+1200' },
    { icon: '🏷️', title: 'Player Tags', description: '1,000 tags to track and label opponents', value: '+1000' },
    { icon: '📈', title: 'Leaderboard Boost', description: '6% score boost on all leaderboards', value: '+6%' },
    // SMARTER.POKER EXCLUSIVES
    { icon: '🎟️', title: 'Free Roll Entries', description: 'Free entry to all Diamond Arena freeroll tournaments', value: 'Unlimited' },
    { icon: '🧠', title: 'Premium Training', description: 'Full access to all training modules & drills', value: '$50/mo' },
    { icon: '🤖', title: 'AI Personal Assistant', description: 'Priority AI coaching & hand analysis', value: '$100/mo' },
    { icon: '🎁', title: 'Daily Diamond Bonus', description: '+25 💎 free every day ($7.50/mo value)', value: '$7.50/mo' },
    { icon: '✨', title: 'VIP Badge & Flair', description: 'Exclusive Gold VIP profile badge and cosmetics', value: 'Exclusive' },
    { icon: '🚀', title: '2x XP Boost', description: 'Double XP earnings on all activities', value: '$25/mo' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANDISE — Physical goods
// ═══════════════════════════════════════════════════════════════════════════
const MERCHANDISE = [
    {
        id: 'card-protector-gold',
        name: 'Gold Card Protector',
        description: 'Premium weighted card protector with Smarter.Poker logo',
        price: 24.99,
        image: '/merch/card-protector-gold.jpg',
        category: 'accessories',
    },
    {
        id: 'card-protector-black',
        name: 'Stealth Card Protector',
        description: 'Matte black weighted card protector',
        price: 24.99,
        image: '/merch/card-protector-black.jpg',
        category: 'accessories',
    },
    {
        id: 'hoodie-neural',
        name: 'Neural Network Hoodie',
        description: 'Premium hoodie with neural poker design',
        price: 59.99,
        image: '/merch/hoodie-neural.jpg',
        category: 'apparel',
    },
    {
        id: 'tshirt-gto',
        name: 'GTO Wizard Tee',
        description: '100% cotton tee with GTO brain graphic',
        price: 29.99,
        image: '/merch/tshirt-gto.jpg',
        category: 'apparel',
    },
    {
        id: 'hat-diamond',
        name: 'Diamond Dad Hat',
        description: 'Embroidered diamond logo cap',
        price: 34.99,
        image: '/merch/hat-diamond.jpg',
        category: 'apparel',
    },
    {
        id: 'deck-premium',
        name: 'Premium Playing Cards',
        description: 'Casino-quality Smarter.Poker deck',
        price: 14.99,
        image: '/merch/deck-premium.jpg',
        category: 'accessories',
    },
    {
        id: 'chip-set-100',
        name: '100-Chip Travel Set',
        description: 'Clay composite chips in aluminum case',
        price: 79.99,
        image: '/merch/chip-set-100.jpg',
        category: 'accessories',
    },
    {
        id: 'chip-set-500',
        name: '500-Chip Pro Set',
        description: 'Full tournament set with dealer button',
        price: 199.99,
        image: '/merch/chip-set-500.jpg',
        category: 'accessories',
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// PACKAGE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function PackageCard({ pkg, onSelect, isSelected, onAddToCart }) {
    const totalDiamonds = pkg.diamonds + pkg.bonus;

    return (
        <div
            onClick={() => onSelect(pkg.id)}
            style={{
                position: 'relative',
                background: isSelected
                    ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(138, 43, 226, 0.2))'
                    : 'rgba(255, 255, 255, 0.05)',
                border: isSelected
                    ? '2px solid #00D4FF'
                    : pkg.popular
                        ? '2px solid rgba(255, 215, 0, 0.5)'
                        : pkg.hasDiscount
                            ? '2px solid rgba(0, 255, 136, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 16,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
            }}
        >
            {/* Popular Badge */}
            {pkg.popular && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    right: 16,
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    color: '#0a1628',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                }}>
                    Popular
                </div>
            )}

            {/* 5% Discount Badge */}
            {pkg.hasDiscount && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    right: 16,
                    background: 'linear-gradient(135deg, #00ff88, #00cc66)',
                    color: '#0a1628',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                }}>
                    +5% Bonus
                </div>
            )}

            {/* Diamond Count */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
            }}>
                <span style={{ fontSize: 32 }}>💎</span>
                <div>
                    <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 24,
                        fontWeight: 700,
                        color: '#00D4FF',
                    }}>
                        {totalDiamonds.toLocaleString()}
                    </div>
                    {pkg.bonus > 0 && (
                        <div style={{
                            fontSize: 11,
                            color: '#00ff88',
                            fontWeight: 600,
                        }}>
                            ({pkg.diamonds.toLocaleString()} + {pkg.bonus.toLocaleString()} bonus)
                        </div>
                    )}
                </div>
            </div>

            {/* Package Name */}
            <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#fff',
                marginBottom: 6,
            }}>
                {pkg.name}
            </div>

            {/* Price - 1 diamond = 1 cent */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <span style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#fff',
                }}>
                    ${pkg.price.toFixed(2)}
                </span>
                <span style={{
                    fontSize: 10,
                    color: 'rgba(255, 255, 255, 0.5)',
                }}>
                    1💎 = $0.01
                </span>
            </div>

            {/* Add to Cart Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onAddToCart && onAddToCart(pkg);
                }}
                style={{
                    width: '100%',
                    marginTop: 12,
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
                Add to Cart
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIP MEMBERSHIP CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function VIPCard({ plan, isSelected, onSelect }) {
    return (
        <div
            onClick={() => onSelect(plan.id)}
            style={{
                position: 'relative',
                background: isSelected
                    ? 'linear-gradient(135deg, rgba(24, 119, 242, 0.3), rgba(66, 133, 244, 0.3))'
                    : 'linear-gradient(135deg, rgba(24, 119, 242, 0.1), rgba(66, 133, 244, 0.1))',
                border: isSelected
                    ? '2px solid #1877F2'
                    : plan.popular
                        ? '2px solid rgba(24, 119, 242, 0.5)'
                        : '1px solid rgba(24, 119, 242, 0.3)',
                borderRadius: 16,
                padding: 24,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                flex: 1,
            }}
        >
            {plan.popular && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    right: 16,
                    background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                }}>
                    Recommended
                </div>
            )}

            {plan.savings && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    left: 16,
                    background: 'linear-gradient(135deg, #00ff88, #00cc66)',
                    color: '#0a1628',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                }}>
                    Save ${plan.savings.toFixed(2)}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 36 }}>👑</span>
                <div>
                    <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 20,
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        {plan.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
                        All features included
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>
                    ${plan.price.toFixed(2)}
                </span>
                <span style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.5)' }}>
                    /{plan.interval}
                </span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANDISE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function MerchCard({ item, onSelect }) {
    return (
        <div
            onClick={() => onSelect(item.id)}
            style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 12,
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}
        >
            {/* Product Image Placeholder */}
            <div style={{
                height: 120,
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(138, 43, 226, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
            }}>
                {item.category === 'apparel' ? '👕' : '🎴'}
            </div>

            <div style={{ padding: 14 }}>
                <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#fff',
                    marginBottom: 4,
                }}>
                    {item.name}
                </div>
                <div style={{
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.5)',
                    marginBottom: 8,
                    lineHeight: 1.4,
                }}>
                    {item.description}
                </div>
                <div style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#00D4FF',
                }}>
                    ${item.price.toFixed(2)}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAMOND STORE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function DiamondStorePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('diamonds'); // diamonds, vip, merch, rewards
    const [rewardsSubTab, setRewardsSubTab] = useState('overview'); // overview, diamonds, xp, eggs
    const [selectedPackage, setSelectedPackage] = useState('standard');
    const [selectedVIP, setSelectedVIP] = useState('vip-monthly');
    const [isProcessing, setIsProcessing] = useState(false);

    // 🎬 INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('marketplace-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('marketplace-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    const { addItem } = useCartStore();

    // Add diamond package to cart
    const handleAddToCart = (pkg) => {
        console.log('[Diamond Store] Adding to cart:', pkg);
        const cartItem = {
            id: `diamond-${pkg.id}`,
            name: pkg.name,
            type: 'diamonds',
            diamonds: pkg.diamonds,
            bonus: pkg.bonus || 0,
            price: pkg.price,
            quantity: 1
        };
        console.log('[Diamond Store] Cart item:', cartItem);
        addItem(cartItem);
        console.log('[Diamond Store] Item added to cart');
    };

    // Handle checkout from cart
    const handleCheckout = async (items) => {
        console.log('[Diamond Store] Checkout initiated with items:', items);
        setIsProcessing(true);

        try {
            console.log('[Diamond Store] Checking authentication...');
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            console.log('[Diamond Store] Auth result:', {
                hasUser: !!user,
                email: user?.email,
                error: authError
            });

            if (!user || authError) {
                console.error('[Diamond Store] Not authenticated:', authError);
                alert('Please sign in to complete your purchase');
                setIsProcessing(false);
                return;
            }

            console.log('[Diamond Store] User authenticated, getting session for token...');
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                console.error('[Diamond Store] No session token available');
                alert('Session expired. Please refresh and try again.');
                setIsProcessing(false);
                return;
            }

            console.log('[Diamond Store] Creating checkout session...');

            // Create checkout session
            const response = await fetch('/api/store/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    type: 'diamonds',
                    items: items.map(item => ({
                        name: item.name,
                        diamonds: item.diamonds,
                        bonus: item.bonus,
                        price: item.price,
                        quantity: item.quantity
                    }))
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error?.message || 'Failed to create checkout session');
            }

            // Redirect to Stripe Checkout
            window.location.href = data.data.url;

        } catch (error) {
            console.error('Checkout error:', error);
            alert(error.message || 'Failed to start checkout. Please try again.');
            setIsProcessing(false);
        }
    };

    // Direct VIP subscription checkout (no cart)
    const handleVIPSubscribe = async (tier) => {
        setIsProcessing(true);

        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (!user || authError) {
                alert('Please sign in to subscribe to VIP');
                setIsProcessing(false);
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                alert('Session expired. Please refresh and try again.');
                setIsProcessing(false);
                return;
            }

            // For now, show coming soon message
            // TODO: Add Stripe Price IDs for VIP subscriptions
            alert('VIP subscriptions coming soon! We need to configure Stripe Price IDs first.');
            setIsProcessing(false);

        } catch (error) {
            console.error('VIP subscribe error:', error);
            alert('Failed to start VIP subscription. Please try again.');
            setIsProcessing(false);
        }
    };

    // Direct diamond package purchase (adds to cart)
    const handleDiamondPurchase = (pkg) => {
        handleAddToCart(pkg);
    };

    const handleMerchPurchase = (itemId) => {
        alert('Merchandise store coming soon!');
    };

    const selectedPkg = DIAMOND_PACKAGES.find(p => p.id === selectedPackage);
    const selectedVIPPlan = selectedVIP === 'vip-monthly' ? VIP_MEMBERSHIP.monthly : VIP_MEMBERSHIP.annual;

    return (
        <>
            <PageTransition>
                {/* 🎬 INTRO VIDEO OVERLAY - Plays while page loads behind it */}
                {showIntro && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 99999,
                        background: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <video
                            ref={introVideoRef}
                            src="/videos/marketplace-intro.mp4"
                            autoPlay
                            muted
                            playsInline
                            onPlay={handleIntroPlay}
                            onEnded={handleIntroEnd}
                            onError={handleIntroEnd}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                        {/* Skip button */}
                        <button
                            onClick={handleIntroEnd}
                            style={{
                                position: 'absolute',
                                top: 20,
                                right: 20,
                                padding: '8px 20px',
                                background: 'rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: 20,
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: 'pointer',
                                zIndex: 100000
                            }}
                        >
                            Skip
                        </button>
                    </div>
                )}
                <Head>
                    <title>Diamond Store — Smarter.Poker</title>
                    <meta name="description" content="Purchase diamonds to unlock premium features" />
                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                    <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .diamond-store-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
                    
                    
                    
                    
                    
                `}</style>
                </Head>

                <div className="diamond-store-page" style={styles.container}>
                    {/* Background */}
                    <div style={styles.bgGrid} />
                    <div style={styles.bgGlow} />

                    {/* Header */}
                    <UniversalHeader pageDepth={1} />
                    <div style={styles.header}>
                        <div style={{ width: 100 }} />
                        <h1 style={styles.pageTitle}>💎 Store</h1>
                        <div style={{ width: 100 }} />
                    </div>

                    {/* Tab Navigation */}
                    <div style={styles.tabNav}>
                        <button
                            onClick={() => setActiveTab('diamonds')}
                            style={{
                                ...styles.tabButton,
                                ...(activeTab === 'diamonds' ? styles.tabButtonActive : {}),
                            }}
                        >
                            💎 Diamonds
                        </button>
                        <button
                            onClick={() => setActiveTab('vip')}
                            style={{
                                ...styles.tabButton,
                                ...(activeTab === 'vip' ? styles.tabButtonActiveVIP : {}),
                            }}
                        >
                            👑 VIP Membership
                        </button>
                        <button
                            onClick={() => setActiveTab('merch')}
                            style={{
                                ...styles.tabButton,
                                ...(activeTab === 'merch' ? styles.tabButtonActive : {}),
                            }}
                        >
                            🛍️ Merch
                        </button>
                        <button
                            onClick={() => setActiveTab('rewards')}
                            style={{
                                ...styles.tabButton,
                                ...(activeTab === 'rewards' ? styles.tabButtonActive : {}),
                            }}
                        >
                            🎁 Smarter Rewards
                        </button>
                    </div>

                    {/* Main Content */}
                    <div style={styles.content}>

                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* DIAMONDS TAB */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'diamonds' && (
                            <>
                                {/* Intro */}
                                <div style={styles.intro}>
                                    <p style={styles.introText}>
                                        <strong>1 Diamond = $0.01</strong> — Use diamonds for tournament entries,
                                        premium training, cosmetics, and more. <span style={{ color: '#00ff88' }}>5% bonus on $100+ purchases!</span>
                                    </p>
                                </div>

                                {/* Package Grid */}
                                <div style={styles.packageGrid}>
                                    {DIAMOND_PACKAGES.map(pkg => (
                                        <PackageCard
                                            key={pkg.id}
                                            pkg={pkg}
                                            isSelected={selectedPackage === pkg.id}
                                            onSelect={setSelectedPackage}
                                            onAddToCart={handleAddToCart}
                                        />
                                    ))}
                                </div>

                                {/* Purchase Section */}
                                <div style={styles.purchaseSection}>
                                    <div style={styles.selectedInfo}>
                                        {selectedPkg && (
                                            <>
                                                <span style={styles.selectedLabel}>Selected:</span>
                                                <span style={styles.selectedName}>{selectedPkg.name}</span>
                                                <span style={styles.selectedDiamonds}>
                                                    💎 {(selectedPkg.diamonds + selectedPkg.bonus).toLocaleString()}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleDiamondPurchase(selectedPkg)}
                                        disabled={!selectedPackage || isProcessing}
                                        style={{
                                            ...styles.purchaseButton,
                                            opacity: (!selectedPackage || isProcessing) ? 0.6 : 1,
                                        }}
                                    >
                                        {isProcessing ? 'Processing...' : `Purchase for $${selectedPkg?.price.toFixed(2) || '0.00'}`}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* VIP MEMBERSHIP TAB */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'vip' && (
                            <>
                                {/* VIP Hero */}
                                <div style={styles.vipHero}>
                                    <h2 style={styles.vipTitle}>👑 VIP Membership</h2>
                                    <p style={styles.vipSubtitle}>
                                        Unlock <strong>everything</strong> for one low monthly price. No diamond costs, no limits.
                                    </p>
                                </div>

                                {/* VIP Plan Selection */}
                                <div style={styles.vipPlansRow}>
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.monthly}
                                        isSelected={selectedVIP === 'vip-monthly'}
                                        onSelect={setSelectedVIP}
                                    />
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.annual}
                                        isSelected={selectedVIP === 'vip-annual'}
                                        onSelect={setSelectedVIP}
                                    />
                                </div>

                                {/* Subscribe Button */}
                                <div style={styles.vipSubscribeSection}>
                                    <button
                                        onClick={handleVIPSubscribe}
                                        disabled={isProcessing}
                                        style={{
                                            ...styles.vipSubscribeButton,
                                            opacity: isProcessing ? 0.6 : 1,
                                        }}
                                    >
                                        {isProcessing ? 'Processing...' : `Subscribe for $${selectedVIPPlan.price.toFixed(2)}/${selectedVIPPlan.interval}`}
                                    </button>
                                    <p style={styles.vipCancelNote}>Cancel anytime. No commitment required.</p>
                                </div>

                                {/* VIP Benefits Table */}
                                <div style={styles.benefitsSection}>
                                    <h3 style={styles.benefitsTitle}>Everything Included with VIP</h3>
                                    <div style={styles.benefitsGrid}>
                                        {VIP_BENEFITS.map((benefit, idx) => (
                                            <div key={idx} style={styles.benefitCard}>
                                                <span style={styles.benefitIcon}>{benefit.icon}</span>
                                                <div style={styles.benefitInfo}>
                                                    <div style={styles.benefitTitle}>{benefit.title}</div>
                                                    <div style={styles.benefitDesc}>{benefit.description}</div>
                                                </div>
                                                <div style={styles.benefitValue}>{benefit.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Value Comparison */}
                                <div style={styles.valueComparison}>
                                    <div style={styles.valueBox}>
                                        <div style={styles.valueLabel}>Total Feature Value</div>
                                        <div style={styles.valueAmount}>$200+/mo</div>
                                    </div>
                                    <div style={styles.valueDivider}>→</div>
                                    <div style={styles.valueBoxHighlight}>
                                        <div style={styles.valueLabel}>VIP Price</div>
                                        <div style={styles.vipPrice}>$19.99/mo</div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* MERCHANDISE TAB */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'merch' && (
                            <>
                                <div style={styles.intro}>
                                    <h2 style={styles.merchTitle}>🛍️ Official Merch</h2>
                                    <p style={styles.introText}>
                                        Rep the Smarter.Poker brand at the tables. Premium quality gear for serious players.
                                    </p>
                                </div>

                                {/* Apparel Section */}
                                <div style={styles.merchSection}>
                                    <h3 style={styles.merchCategoryTitle}>👕 Apparel</h3>
                                    <div style={styles.merchGrid}>
                                        {MERCHANDISE.filter(m => m.category === 'apparel').map(item => (
                                            <MerchCard key={item.id} item={item} onSelect={handleMerchPurchase} />
                                        ))}
                                    </div>
                                </div>

                                {/* Accessories Section */}
                                <div style={styles.merchSection}>
                                    <h3 style={styles.merchCategoryTitle}>🎴 Accessories</h3>
                                    <div style={styles.merchGrid}>
                                        {MERCHANDISE.filter(m => m.category === 'accessories').map(item => (
                                            <MerchCard key={item.id} item={item} onSelect={handleMerchPurchase} />
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}


                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* SMARTER REWARDS TAB - Comprehensive Rewards Information Center */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'rewards' && (
                            <>
                                {/* Sub-Tab Navigation */}
                                <div style={styles.rewardsSubNav}>
                                    <button
                                        onClick={() => setRewardsSubTab('overview')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'overview' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        📋 Overview
                                    </button>
                                    <button
                                        onClick={() => setRewardsSubTab('diamonds')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'diamonds' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        💎 Diamond Rewards
                                    </button>
                                    <button
                                        onClick={() => setRewardsSubTab('xp')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'xp' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        📈 XP System
                                    </button>
                                    <button
                                        onClick={() => setRewardsSubTab('eggs')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'eggs' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        🎁 Easter Eggs
                                    </button>
                                </div>

                                {/* OVERVIEW SUB-TAB */}
                                {rewardsSubTab === 'overview' && (
                                    <div style={styles.rewardsOverview}>
                                        <h2 style={styles.earnTitle}>🎁 Smarter Rewards</h2>
                                        <p style={styles.introText}>
                                            Welcome to the Smarter Rewards system! Earn diamonds and XP by playing, training, and engaging with the community.
                                        </p>

                                        <div style={styles.overviewGrid}>
                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}>💎</div>
                                                <h3 style={styles.overviewCardTitle}>Diamond Rewards</h3>
                                                <p style={styles.overviewCardText}>
                                                    Earn diamonds through daily logins, training, social engagement, and referrals.
                                                    <strong style={{ color: '#00ff88' }}> Daily cap: 500 💎</strong> with streak multipliers!
                                                </p>
                                            </div>

                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}>📈</div>
                                                <h3 style={styles.overviewCardTitle}>XP System</h3>
                                                <p style={styles.overviewCardText}>
                                                    Progress through <strong>infinite levels</strong> using the quadratic formula.
                                                    Level = floor(sqrt(XP / 100)) + 1. Verified: 700,000 XP = Level 84!
                                                </p>
                                            </div>

                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}>🎁</div>
                                                <h3 style={styles.overviewCardTitle}>Easter Eggs</h3>
                                                <p style={styles.overviewCardText}>
                                                    Discover <strong>100 hidden achievements</strong> across 6 categories.
                                                    From Performance to Legacy Milestones, find them all for massive rewards!
                                                </p>
                                            </div>
                                        </div>

                                        <div style={styles.quickStats}>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>500 💎</span>
                                                <span style={styles.quickStatLabel}>Daily Cap</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>∞</span>
                                                <span style={styles.quickStatLabel}>XP Levels</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>100</span>
                                                <span style={styles.quickStatLabel}>Easter Eggs</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>10</span>
                                                <span style={styles.quickStatLabel}>Standard Rewards</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* DIAMOND REWARDS SUB-TAB */}
                                {rewardsSubTab === 'diamonds' && (
                                    <div style={styles.diamondRewardsSection}>
                                        <h2 style={styles.earnTitle}>💎 Diamond Rewards</h2>
                                        <p style={styles.introText}>
                                            All 10 ways you can earn diamonds on Smarter.Poker
                                        </p>

                                        {/* Daily Cap Banner */}
                                        <div style={styles.capBanner}>
                                            <div style={styles.capInfo}>
                                                <span style={styles.capNumber}>500</span>
                                                <span style={styles.capLabel}>Daily Cap</span>
                                            </div>
                                            <div style={styles.capDivider} />
                                            <div style={styles.streakMultipliers}>
                                                <div style={styles.multiplierItem}>
                                                    <span style={styles.multiplierValue}>1.5x</span>
                                                    <span style={styles.multiplierLabel}>Days 4-6</span>
                                                </div>
                                                <div style={styles.multiplierItem}>
                                                    <span style={styles.multiplierValueGold}>2.0x</span>
                                                    <span style={styles.multiplierLabel}>Day 7+</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Standard Rewards List */}
                                        <div style={styles.rewardCategory}>
                                            <h3 style={styles.categoryTitle}>💎 All Standard Rewards</h3>
                                            <div style={styles.rewardList}>
                                                {STANDARD_REWARDS.map((reward, idx) => (
                                                    <div key={idx} style={reward.bypassesCap ? { ...styles.rewardItem, ...styles.referralHighlight } : styles.rewardItem}>
                                                        <span style={styles.rewardIcon}>{reward.icon}</span>
                                                        <div style={styles.rewardDetails}>
                                                            <span style={styles.rewardName}>{reward.name}</span>
                                                            <span style={styles.rewardNote}>{reward.note}</span>
                                                        </div>
                                                        <span style={reward.bypassesCap ? styles.referralReward : styles.rewardAmount}>{reward.amount}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* XP SYSTEM SUB-TAB */}
                                {rewardsSubTab === 'xp' && (
                                    <div style={styles.xpSystemSection}>
                                        <h2 style={styles.earnTitle}>📈 XP System - Infinite Progression</h2>
                                        <p style={styles.introText}>
                                            Level up using the quadratic formula: <code style={styles.formula}>Level = floor(sqrt(XP / 100)) + 1</code>
                                        </p>

                                        {/* Formula Explanation */}
                                        <div style={styles.formulaBox}>
                                            <h3 style={styles.formulaTitle}>How It Works</h3>
                                            <p style={styles.formulaText}>
                                                Your level is calculated dynamically from your total XP using a quadratic formula.
                                                This means each level requires progressively more XP than the last, creating a satisfying
                                                long-term progression curve. <strong>There is no level cap!</strong>
                                            </p>
                                            <div style={styles.verifiedExample}>
                                                <span style={styles.verifiedLabel}>Verified:</span>
                                                <span style={styles.verifiedValue}>700,000 XP = Level 84</span>
                                            </div>
                                        </div>

                                        {/* Example Milestones */}
                                        <h3 style={styles.categoryTitle}>📊 Example Milestones</h3>
                                        <div style={styles.xpTableContainer}>
                                            <table style={styles.xpTable}>
                                                <thead>
                                                    <tr style={styles.xpTableHeader}>
                                                        <th style={styles.xpTableHeaderCell}>Level</th>
                                                        <th style={styles.xpTableHeaderCell}>Total XP Required</th>
                                                        <th style={styles.xpTableHeaderCell}>XP to Next Level</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {XP_MILESTONES.map((milestone) => {
                                                        const xpToNext = calculateXPToNextLevel(milestone.xp);
                                                        return (
                                                            <tr key={milestone.level} style={styles.xpTableRow}>
                                                                <td style={styles.xpTableCell}>
                                                                    <span style={styles.levelBadge}>Lv {milestone.level}</span>
                                                                </td>
                                                                <td style={styles.xpTableCell}>
                                                                    {milestone.xp.toLocaleString()} XP
                                                                </td>
                                                                <td style={styles.xpTableCell}>
                                                                    {xpToNext.toLocaleString()} XP
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* EASTER EGGS SUB-TAB */}
                                {rewardsSubTab === 'eggs' && (
                                    <div style={styles.easterEggsSection}>
                                        <h2 style={styles.earnTitle}>🎁 Easter Eggs - 100 Hidden Achievements</h2>
                                        <p style={styles.introText}>
                                            Discover 100 hidden achievements across 6 categories for massive bonus rewards!
                                        </p>

                                        {/* Performance Category (10 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>🎯 Performance (10 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.performance.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>{egg.icon}</div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Timing & Loyalty Category (15 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>⏰ Timing & Loyalty (15 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.timing_loyalty.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>{egg.icon}</div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Strategy & Mastery Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>♟️ Strategy & Mastery (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.strategy_mastery.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>{egg.icon}</div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Social/Viral Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>🌟 Social & Viral (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.social_viral.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>{egg.icon}</div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Meta/Interface Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>🎮 Meta & Interface (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.meta_interface.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>{egg.icon}</div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Legacy/Milestones Category (15 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>🏆 Legacy & Milestones (15 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.legacy_milestones.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>{egg.icon}</div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Legal Note */}
                        <p style={styles.legalNote}>
                            Diamonds are virtual currency and have no real-world cash value.
                            All purchases are final. See our <a href="/terms" style={styles.link}>Terms of Service</a> for details.
                        </p>
                    </div>
                </div>
            </PageTransition>

            {/* Shopping Cart Component */}
            <ShoppingCart onCheckout={handleCheckout} />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#18191A',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.02) 1px, transparent 1px)
            `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%',
        left: '50%',
        width: '100%',
        height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 212, 255, 0.1), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(36, 37, 38, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },
    // TAB NAVIGATION
    tabNav: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(36, 37, 38, 0.95)',
        position: 'sticky',
        top: 0,
        zIndex: 99,
    },
    tabButton: {
        padding: '10px 24px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 10,
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    tabButtonActive: {
        background: 'rgba(0, 212, 255, 0.2)',
        border: '1px solid #00D4FF',
        color: '#00D4FF',
    },
    tabButtonActiveVIP: {
        background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.2), rgba(66, 133, 244, 0.2))',
        border: '1px solid #1877F2',
        color: '#1877F2',
    },
    backButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    pageTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#E4E6EB',
    },
    content: {
        maxWidth: 900,
        margin: '0 auto',
        padding: '32px 24px',
    },
    intro: {
        textAlign: 'center',
        marginBottom: 40,
    },
    introText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: 600,
        margin: '0 auto',
        lineHeight: 1.6,
    },
    packageGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 20,
        marginBottom: 40,
    },
    purchaseSection: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 48,
    },
    selectedInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    selectedLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    selectedName: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
    },
    selectedDiamonds: {
        fontSize: 18,
        fontWeight: 700,
        color: '#00D4FF',
    },
    purchaseButton: {
        padding: '14px 40px',
        background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
    earnSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    earnTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 16,
        textAlign: 'center',
    },
    earnSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 24,
    },
    earnGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
    },
    earnCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '20px 12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
    },
    earnIcon: {
        fontSize: 28,
    },
    earnLabel: {
        fontSize: 13,
        fontWeight: 500,
        color: '#fff',
    },
    earnReward: {
        fontSize: 12,
        fontWeight: 600,
        color: '#00ff88',
    },
    legalNote: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        maxWidth: 500,
        margin: '0 auto',
        lineHeight: 1.6,
    },
    link: {
        color: '#00D4FF',
        textDecoration: 'none',
    },
    // YELLOW BALL REWARD SYSTEM STYLES
    rewardSystem: {
        marginBottom: 40,
    },
    capBanner: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 32,
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1))',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 16,
        padding: '20px 32px',
        marginBottom: 32,
    },
    capInfo: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    capNumber: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 36,
        fontWeight: 700,
        color: '#FFD700',
    },
    capLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    capDivider: {
        width: 1,
        height: 50,
        background: 'rgba(255, 215, 0, 0.3)',
    },
    streakMultipliers: {
        display: 'flex',
        gap: 24,
    },
    multiplierItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    multiplierValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#00ff88',
    },
    multiplierValueGold: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#FFD700',
    },
    multiplierLabel: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    payoutSection: {
        marginBottom: 32,
    },
    payoutTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 16,
    },
    payoutGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 12,
    },
    payoutCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
    },
    referralCard: {
        background: 'rgba(0, 255, 136, 0.1)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
    },
    payoutIcon: {
        fontSize: 24,
    },
    payoutInfo: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    payoutName: {
        fontSize: 14,
        fontWeight: 500,
        color: '#fff',
    },
    payoutNote: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    bypassNote: {
        fontSize: 11,
        color: '#00ff88',
        fontWeight: 600,
    },
    payoutReward: {
        fontSize: 14,
        fontWeight: 600,
        color: '#00D4FF',
    },
    referralReward: {
        fontSize: 14,
        fontWeight: 700,
        color: '#00ff88',
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SMARTER REWARDS SUB-TAB STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    rewardsSubNav: {
        display: 'flex',
        gap: 8,
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(36, 37, 38, 0.95)',
        position: 'sticky',
        top: 80,
        zIndex: 98,
        overflowX: 'auto',
    },
    rewardsSubTab: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        padding: '10px 20px',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
    },
    rewardsSubTabActive: {
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        color: '#fff',
        border: '1px solid transparent',
    },

    // Overview Section
    rewardsOverview: {
        padding: '32px 24px',
    },
    overviewGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
        marginTop: 32,
        marginBottom: 32,
    },
    overviewCard: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
    },
    overviewIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    overviewCardTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 12,
    },
    overviewCardText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
    },
    quickStats: {
        display: 'flex',
        justifyContent: 'space-around',
        gap: 20,
        marginTop: 32,
        padding: '24px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    quickStat: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
    },
    quickStatValue: {
        fontSize: 32,
        fontWeight: 700,
        color: '#00ff88',
        fontFamily: 'Orbitron, sans-serif',
    },
    quickStatLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },

    // Diamond Rewards Section
    diamondRewardsSection: {
        padding: '32px 24px',
    },
    rewardCategory: {
        marginBottom: 32,
    },
    categoryTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 16,
        fontFamily: 'Orbitron, sans-serif',
    },
    rewardList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    rewardItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
    },
    rewardIcon: {
        fontSize: 24,
        flexShrink: 0,
    },
    rewardDetails: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    rewardName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#E4E6EB',
    },
    rewardNote: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    rewardAmount: {
        fontSize: 14,
        fontWeight: 700,
        color: '#00D4FF',
        flexShrink: 0,
    },
    referralHighlight: {
        background: 'rgba(0, 255, 136, 0.1)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
    },

    // XP System Section
    xpSystemSection: {
        padding: '32px 24px',
    },
    formula: {
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '2px 8px',
        borderRadius: 4,
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#00D4FF',
    },
    xpTableContainer: {
        marginTop: 24,
        overflowX: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        background: 'rgba(255, 255, 255, 0.02)',
    },
    xpTable: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    xpTableHeader: {
        background: 'rgba(255, 255, 255, 0.05)',
        borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
    },
    xpTableHeaderCell: {
        padding: '16px',
        textAlign: 'left',
        fontSize: 12,
        fontWeight: 700,
        color: '#E4E6EB',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    xpTableRow: {
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        transition: 'background 0.2s ease',
    },
    xpTableCell: {
        padding: '16px',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    levelBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
    },
    unlocksList: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
    },
    unlockBadge: {
        display: 'inline-block',
        padding: '4px 10px',
        background: 'rgba(0, 255, 136, 0.15)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
        borderRadius: 6,
        fontSize: 11,
        color: '#00ff88',
        fontWeight: 600,
    },
    noUnlocks: {
        color: 'rgba(255, 255, 255, 0.3)',
    },

    // Easter Eggs Section
    easterEggsSection: {
        padding: '32px 24px',
    },
    eggGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: 20,
        marginTop: 24,
    },
    eggCard: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 20,
        textAlign: 'center',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
    },
    eggIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    eggName: {
        fontSize: 16,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 8,
    },
    eggReward: {
        fontSize: 18,
        fontWeight: 700,
        color: '#FFD700',
        marginBottom: 12,
        fontFamily: 'Orbitron, sans-serif',
    },
    eggTrigger: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 1.5,
    },
    // Egg Category Styles
    eggCategory: {
        marginBottom: 48,
    },
    eggCategoryTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 20,
        fontFamily: 'Orbitron, sans-serif',
    },
    // Rarity Badge Styles
    rarityBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        marginBottom: 8,
        letterSpacing: '0.5px',
    },
    rarityCommon: {
        background: 'rgba(158, 158, 158, 0.2)',
        border: '1px solid rgba(158, 158, 158, 0.4)',
        color: '#9E9E9E',
    },
    rarityUncommon: {
        background: 'rgba(76, 175, 80, 0.2)',
        border: '1px solid rgba(76, 175, 80, 0.4)',
        color: '#4CAF50',
    },
    rarityRare: {
        background: 'rgba(33, 150, 243, 0.2)',
        border: '1px solid rgba(33, 150, 243, 0.4)',
        color: '#2196F3',
    },
    rarityEpic: {
        background: 'rgba(156, 39, 176, 0.2)',
        border: '1px solid rgba(156, 39, 176, 0.4)',
        color: '#9C27B0',
    },
    rarityLegendary: {
        background: 'rgba(255, 152, 0, 0.2)',
        border: '1px solid rgba(255, 152, 0, 0.4)',
        color: '#FF9800',
    },
    // Formula Box Styles
    formulaBox: {
        background: 'rgba(0, 212, 255, 0.05)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 32,
    },
    formulaTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#00D4FF',
        marginBottom: 12,
        fontFamily: 'Orbitron, sans-serif',
    },
    formulaText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
        marginBottom: 16,
    },
    verifiedExample: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: 'rgba(0, 255, 136, 0.1)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
        borderRadius: 8,
    },
    verifiedLabel: {
        fontSize: 12,
        fontWeight: 700,
        color: '#00FF88',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    verifiedValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#E4E6EB',
    },
    easterSection: {
        textAlign: 'center',
        marginBottom: 24,
    },
    easterTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 8,
    },
    easterSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 20,
    },
    easterGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
    },
    easterCategory: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '16px 12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid',
        borderRadius: 12,
    },
    categoryRange: {
        fontSize: 11,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
    },
    categoryName: {
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    },
    categoryExample: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        fontStyle: 'italic',
    },
    legendaryNote: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.7)',
        background: 'rgba(255, 215, 0, 0.1)',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 10,
        padding: '14px 20px',
        lineHeight: 1.6,
        textAlign: 'center',
    },
    // 5-PILLAR CARD STYLES
    pillarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 24,
    },
    pillarCard: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid',
        borderRadius: 16,
        padding: 20,
        textAlign: 'left',
    },
    pillarHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    pillarIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
    },
    pillarName: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
    },
    pillarRange: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    pillarExamples: {
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        paddingTop: 12,
    },
    exampleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 8,
    },
    exDiamonds: {
        marginLeft: 'auto',
        color: '#00D4FF',
        fontWeight: 600,
    },
    exDiamondsRare: {
        marginLeft: 'auto',
        color: '#8a2be2',
        fontWeight: 600,
    },
    exDiamondsEpic: {
        marginLeft: 'auto',
        color: '#ff6b9d',
        fontWeight: 600,
    },
    exDiamondsLegendary: {
        marginLeft: 'auto',
        color: '#FFD700',
        fontWeight: 700,
    },
    // VIP MEMBERSHIP STYLES
    vipHero: {
        textAlign: 'center',
        marginBottom: 32,
    },
    vipTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 32,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: 12,
    },
    vipSubtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: 500,
        margin: '0 auto',
        lineHeight: 1.6,
    },
    vipPlansRow: {
        display: 'flex',
        gap: 20,
        marginBottom: 24,
    },
    vipSubscribeSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    vipSubscribeButton: {
        padding: '16px 48px',
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        fontSize: 18,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(138, 43, 226, 0.4)',
    },
    vipCancelNote: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 12,
    },
    benefitsSection: {
        marginBottom: 32,
    },
    benefitsTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 20,
        fontWeight: 600,
        color: '#E4E6EB',
        marginBottom: 20,
        textAlign: 'center',
    },
    benefitsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 12,
    },
    benefitCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: 'rgba(24, 119, 242, 0.1)',
        border: '1px solid rgba(24, 119, 242, 0.2)',
        borderRadius: 10,
    },
    benefitIcon: {
        fontSize: 24,
        width: 40,
        textAlign: 'center',
    },
    benefitInfo: {
        flex: 1,
    },
    benefitTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#E4E6EB',
    },
    benefitDesc: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    benefitValue: {
        fontSize: 12,
        fontWeight: 600,
        color: '#00ff88',
        textAlign: 'right',
    },
    valueComparison: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        padding: '24px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        marginBottom: 32,
    },
    valueBox: {
        textAlign: 'center',
    },
    valueBoxHighlight: {
        textAlign: 'center',
        padding: '16px 32px',
        background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.2), rgba(66, 133, 244, 0.2))',
        borderRadius: 12,
        border: '2px solid #1877F2',
    },
    valueLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    valueAmount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.3)',
        textDecoration: 'line-through',
    },
    vipPrice: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#1877F2',
    },
    valueDivider: {
        fontSize: 24,
        color: 'rgba(255, 255, 255, 0.3)',
    },
    // MERCHANDISE STYLES
    merchTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 12,
    },
    merchSection: {
        marginBottom: 32,
    },
    merchCategoryTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#E4E6EB',
        marginBottom: 16,
    },
    merchGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
    },
};
