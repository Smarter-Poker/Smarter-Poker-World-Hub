/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SEO MASS INJECTION SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════════
 * Injects SEOHead component into all pages that currently use `import Head from 'next/head'`
 * but don't have proper SEO meta tags.
 *
 * Usage: node scripts/inject-seo.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, '..', 'pages');

// ─── SEO Configuration per page path ─────────────────────────────────────────
const SEO_CONFIG = {
    // ═══ Hub Core ═══
    'hub/index.js': {
        title: 'Poker Hub — Your Command Center',
        desc: 'Access all Smarter.Poker features from one hub: GTO training, poker near me, bankroll tracking, trivia, news, social, and more.',
        canonical: '/hub',
    },
    'hub/poker-near-me.js': {
        title: 'Poker Near Me — Find Live Poker Rooms & Casinos',
        desc: 'Discover live poker rooms, casinos, and card rooms near you. Real-time game info, tournament schedules, and interactive maps across the United States.',
        canonical: '/hub/poker-near-me',
    },
    'hub/training.js': {
        title: 'GTO Poker Training — 100 Games to Master',
        desc: 'Interactive GTO poker training with 100+ scenario-based games. Master MTT, Cash, Spins, Mental Game, and Advanced Theory with AI coaching from Jarvis.',
        canonical: '/hub/training',
    },
    'hub/news.js': {
        title: 'Poker News — Latest Headlines & Updates',
        desc: 'Stay up to date with the latest poker news, tournament results, industry updates, and strategy articles from top sources.',
        canonical: '/hub/news',
    },
    'hub/video-library.js': {
        title: 'Poker Video Library — Watch & Learn',
        desc: 'Curated poker video library with strategy content, tournament coverage, and training videos. Track your watch history and get AI tactical analysis.',
        canonical: '/hub/video-library',
    },
    'hub/diamond-store.js': {
        title: 'Diamond Store — Premium Poker Gear & Merchandise',
        desc: 'Shop premium poker merchandise, gear, and accessories in the Smarter.Poker Diamond Store. Exclusive items for VIP members.',
        canonical: '/hub/diamond-store',
    },
    'hub/bankroll-manager.js': {
        title: 'Bankroll Manager — Track Your Poker Profits',
        desc: 'Professional bankroll tracking for poker players. Monitor sessions, analyze leaks, track ROI, and visualize trends with detailed analytics and variance analysis.',
        canonical: '/hub/bankroll-manager',
    },
    'hub/memory-games.js': {
        title: 'Poker Memory Games — Train Your Brain',
        desc: 'Sharpen your poker cognitive skills with memory matrix games. Train pattern recognition, recall speed, and mental agility.',
        canonical: '/hub/memory-games',
    },
    'hub/diamond-arcade.js': {
        title: 'Diamond Arcade — Poker Arcade Games',
        desc: 'Play arcade-style poker games, earn diamonds, climb leaderboards, and win prizes in the Smarter.Poker Diamond Arcade.',
        canonical: '/hub/diamond-arcade',
    },
    'hub/events-calendar.js': {
        title: 'Poker Events Calendar — Tournaments & Series',
        desc: 'Find upcoming poker tournaments, series, and events. Live updates, schedules, and registration info for events worldwide.',
        canonical: '/hub/events-calendar',
    },
    'hub/daily-tournaments.js': {
        title: 'Daily Poker Tournaments — Compete Every Day',
        desc: 'Join daily poker tournaments on Smarter.Poker. Compete against players worldwide with daily challenges and prize pools.',
        canonical: '/hub/daily-tournaments',
    },
    'hub/social-media.js': {
        title: 'Social Hub — Poker Community & Feed',
        desc: 'Connect with poker players worldwide. Share updates, follow friends, join discussions, and build your poker network on the Smarter.Poker social hub.',
        canonical: '/hub/social-media',
    },
    'hub/leaderboards.js': {
        title: 'Poker Leaderboards — Global Rankings',
        desc: 'See who tops the charts across all Smarter.Poker games. Global rankings for training, trivia, memory games, and more.',
        canonical: '/hub/leaderboards',
    },
    'hub/friends.js': {
        title: 'Friends — Your Poker Network',
        desc: 'Manage your poker friends network. Add friends, view their stats, challenge them to games, and stay connected.',
        canonical: '/hub/friends',
    },
    'hub/club-arena.js': {
        title: 'Club Arena — Private Online Poker Clubs',
        desc: 'Create and join private online poker clubs. Real-time gameplay, tournaments, hand histories, player stats, and club management.',
        canonical: '/hub/club-arena',
    },
    'hub/diamond-arena.js': {
        title: 'Diamond Arena — Competitive Poker Games',
        desc: 'Compete in high-stakes Diamond Arena poker games. Earn diamonds, climb rankings, and prove your skills.',
        canonical: '/hub/diamond-arena',
    },
    'hub/promotions.js': {
        title: 'Promotions — Current Offers & Rewards',
        desc: 'Discover current promotions, bonuses, and reward opportunities on Smarter.Poker. VIP offers and special events.',
        canonical: '/hub/promotions',
    },
    'hub/reels.js': {
        title: 'Poker Reels — Short Poker Content',
        desc: 'Watch and share short poker videos, highlights, and tips on Smarter.Poker Reels.',
        canonical: '/hub/reels',
    },
    'hub/lives.js': {
        title: 'Live Streams — Watch Poker Live',
        desc: 'Watch live poker streams and events. Follow your favorite players and catch the action in real time.',
        canonical: '/hub/lives',
    },
    'hub/messenger.js': {
        title: 'Messenger — Direct Messages',
        desc: 'Chat with friends and poker players directly on Smarter.Poker Messenger.',
        canonical: '/hub/messenger',
    },
    'hub/notifications.js': {
        title: 'Notifications',
        desc: 'Stay updated with your latest activity, friend requests, game invitations, and community updates.',
        canonical: '/hub/notifications',
        noindex: true,
    },
    'hub/help.js': {
        title: 'Help Center — Support & FAQ',
        desc: 'Get help with Smarter.Poker features. FAQ, tutorials, and live support with Geeves, your poker help assistant.',
        canonical: '/hub/help',
    },
    'hub/settings.js': {
        title: 'Settings — Account & Preferences',
        desc: 'Manage your Smarter.Poker account settings, preferences, notifications, and privacy options.',
        canonical: '/hub/settings',
        noindex: true,
    },
    'hub/profile.js': {
        title: 'Player Profile',
        desc: 'View and manage your Smarter.Poker profile, stats, achievements, and poker history.',
        canonical: '/hub/profile',
        noindex: true,
    },
    'hub/profile-edit.js': {
        title: 'Edit Profile',
        desc: 'Update your Smarter.Poker profile information, avatar, and display settings.',
        canonical: '/hub/profile-edit',
        noindex: true,
    },
    'hub/avatars.js': {
        title: 'Avatar Collection',
        desc: 'Browse and select from the Smarter.Poker avatar collection. Customize your player identity.',
        canonical: '/hub/avatars',
        noindex: true,
    },
    'hub/article.js': {
        title: 'Poker Article',
        desc: 'Read poker strategy articles, news stories, and educational content on Smarter.Poker.',
        canonical: '/hub/article',
    },
    'hub/pages.js': {
        title: 'Social Pages — Community Pages',
        desc: 'Discover community pages on Smarter.Poker. Follow pages for poker content, strategy, and community discussions.',
        canonical: '/hub/pages',
    },

    // ═══ Hub — Trivia ═══
    'hub/trivia/index.js': {
        title: 'Poker Trivia — Test Your Knowledge',
        desc: 'Put your poker knowledge to the test with multiple game modes: Endless, Survival, Time Attack, Mixed, PvP, and Tournaments.',
        canonical: '/hub/trivia',
    },
    'hub/trivia/endless.js': {
        title: 'Endless Trivia — Keep the Streak Alive',
        desc: 'How many poker trivia questions can you answer in a row? Play Endless mode to test your limits.',
        canonical: '/hub/trivia/endless',
    },
    'hub/trivia/survival.js': {
        title: 'Survival Trivia — One Life Challenge',
        desc: 'One wrong answer and you are out. Test your poker knowledge in Survival mode.',
        canonical: '/hub/trivia/survival',
    },
    'hub/trivia/survival-game.js': {
        title: 'Survival Trivia Game',
        desc: 'Play the Survival Trivia challenge. Answer correctly or lose your streak.',
        canonical: '/hub/trivia/survival-game',
        noindex: true,
    },
    'hub/trivia/time-attack.js': {
        title: 'Time Attack Trivia — Beat the Clock',
        desc: 'Race against the clock in Time Attack poker trivia. Answer as many questions as possible before time runs out.',
        canonical: '/hub/trivia/time-attack',
    },
    'hub/trivia/mixed.js': {
        title: 'Mixed Trivia — All Categories',
        desc: 'Challenge yourself with mixed poker trivia covering all categories and difficulty levels.',
        canonical: '/hub/trivia/mixed',
    },
    'hub/trivia/pvp.js': {
        title: 'PvP Trivia — Player vs Player',
        desc: 'Challenge other players to head-to-head poker trivia battles. Prove who knows poker best.',
        canonical: '/hub/trivia/pvp',
    },
    'hub/trivia/tournaments.js': {
        title: 'Trivia Tournaments — Compete for Prizes',
        desc: 'Enter poker trivia tournaments. Compete against the community for diamonds, XP, and leaderboard glory.',
        canonical: '/hub/trivia/tournaments',
    },
    'hub/trivia/leaderboard.js': {
        title: 'Trivia Leaderboard — Top Players',
        desc: 'See who dominates the poker trivia leaderboard. Global rankings across all game modes.',
        canonical: '/hub/trivia/leaderboard',
    },
    'hub/trivia/achievements.js': {
        title: 'Trivia Achievements — Unlock Rewards',
        desc: 'Track your poker trivia achievements. Unlock badges, rewards, and bragging rights.',
        canonical: '/hub/trivia/achievements',
    },
    'hub/trivia/stats.js': {
        title: 'Trivia Stats — Your Performance',
        desc: 'View your poker trivia performance stats, accuracy rates, and category breakdowns.',
        canonical: '/hub/trivia/stats',
        noindex: true,
    },
    'hub/trivia/settings.js': {
        title: 'Trivia Settings',
        desc: 'Customize your poker trivia experience with difficulty, sound, and display settings.',
        canonical: '/hub/trivia/settings',
        noindex: true,
    },
    'hub/trivia/[mode].js': {
        title: 'Poker Trivia Game',
        desc: 'Play poker trivia on Smarter.Poker. Test your knowledge across multiple game modes.',
        canonical: '/hub/trivia',
        noindex: true,
    },
    'hub/trivia/timer-test.js': {
        title: 'Timer Test',
        desc: 'Trivia timer test page.',
        noindex: true,
    },

    // ═══ Hub — Training Sub-pages ═══
    'hub/training/achievements.js': {
        title: 'Training Achievements — Milestones Unlocked',
        desc: 'Track your GTO training achievements and milestones on Smarter.Poker.',
        canonical: '/hub/training/achievements',
    },
    'hub/training/challenges.js': {
        title: 'Daily Training Challenges',
        desc: 'Complete daily GTO training challenges to sharpen your poker skills and earn rewards.',
        canonical: '/hub/training/challenges',
    },
    'hub/training/leaderboard.js': {
        title: 'Training Leaderboard — Top Students',
        desc: 'See who leads the GTO training leaderboard on Smarter.Poker.',
        canonical: '/hub/training/leaderboard',
    },
    'hub/training/progress.js': {
        title: 'Training Progress — Your Journey',
        desc: 'Track your GTO training progress across all 100 games and categories.',
        canonical: '/hub/training/progress',
        noindex: true,
    },
    'hub/training/streaks.js': {
        title: 'Training Streaks — Stay Consistent',
        desc: 'Build and maintain your daily training streaks on Smarter.Poker.',
        canonical: '/hub/training/streaks',
        noindex: true,
    },
    'hub/training/tournaments.js': {
        title: 'Training Tournaments — Compete & Learn',
        desc: 'Enter GTO training tournaments. Compete against other students in scenario-based challenges.',
        canonical: '/hub/training/tournaments',
    },
    'hub/training/jarvis.js': {
        title: 'Jarvis AI Coach — GTO Analysis',
        desc: 'Get personalized GTO coaching from Jarvis, your AI poker intelligence. Solver-grade analysis for every hand.',
        canonical: '/hub/training/jarvis',
    },
    'hub/training/scenario-demo.js': {
        title: 'Training Scenario Demo',
        desc: 'Preview a GTO training scenario on Smarter.Poker.',
        noindex: true,
    },

    // ═══ Hub — Diamond Store Sub-pages ═══
    'hub/diamond-store/cart.js': {
        title: 'Shopping Cart — Diamond Store',
        desc: 'View and manage items in your Diamond Store shopping cart.',
        canonical: '/hub/diamond-store/cart',
        noindex: true,
    },
    'hub/diamond-store/orders.js': {
        title: 'Order History — Diamond Store',
        desc: 'View your Diamond Store order history and track shipments.',
        canonical: '/hub/diamond-store/orders',
        noindex: true,
    },
    'hub/diamond-store/wishlist.js': {
        title: 'Wishlist — Diamond Store',
        desc: 'Your saved items in the Diamond Store wishlist.',
        canonical: '/hub/diamond-store/wishlist',
        noindex: true,
    },

    // ═══ Hub — Diamond Arcade Sub-pages ═══
    'hub/diamond-arcade/achievements.js': {
        title: 'Arcade Achievements',
        desc: 'Track your Diamond Arcade achievements and unlocked rewards.',
        canonical: '/hub/diamond-arcade/achievements',
    },
    'hub/diamond-arcade/leaderboard.js': {
        title: 'Arcade Leaderboard — Top Scorers',
        desc: 'See who leads the Diamond Arcade with the highest scores and most wins.',
        canonical: '/hub/diamond-arcade/leaderboard',
    },
    'hub/diamond-arcade/prizes.js': {
        title: 'Arcade Prizes — Rewards Catalog',
        desc: 'Browse available prizes and rewards in the Diamond Arcade.',
        canonical: '/hub/diamond-arcade/prizes',
    },
    'hub/diamond-arcade/stats.js': {
        title: 'Arcade Stats — Your Performance',
        desc: 'View your Diamond Arcade game stats, win rates, and earnings.',
        canonical: '/hub/diamond-arcade/stats',
        noindex: true,
    },
    'hub/diamond-arcade/winnings.js': {
        title: 'Arcade Winnings — Your Earnings',
        desc: 'Track your Diamond Arcade winnings and prize history.',
        canonical: '/hub/diamond-arcade/winnings',
        noindex: true,
    },

    // ═══ Hub — Memory Games Sub-pages ═══
    'hub/memory-games/achievements.js': {
        title: 'Memory Games Achievements',
        desc: 'Track your memory game achievements and cognitive training progress.',
        canonical: '/hub/memory-games/achievements',
    },
    'hub/memory-games/leaderboard.js': {
        title: 'Memory Games Leaderboard',
        desc: 'See who has the sharpest memory on the Smarter.Poker memory games leaderboard.',
        canonical: '/hub/memory-games/leaderboard',
    },
    'hub/memory-games/stats.js': {
        title: 'Memory Games Stats',
        desc: 'View your memory game performance, scores, and improvement trends.',
        canonical: '/hub/memory-games/stats',
        noindex: true,
    },
    'hub/memory-games/tutorial.js': {
        title: 'Memory Games Tutorial — How to Play',
        desc: 'Learn how to play the Smarter.Poker memory games with this step-by-step tutorial.',
        canonical: '/hub/memory-games/tutorial',
    },

    // ═══ Hub — Reels Sub-pages ═══
    'hub/reels/saved.js': {
        title: 'Saved Reels',
        desc: 'View your saved poker reels and short clips.',
        canonical: '/hub/reels/saved',
        noindex: true,
    },
    'hub/reels/my-reels.js': {
        title: 'My Reels',
        desc: 'Manage your posted poker reels and short clips.',
        canonical: '/hub/reels/my-reels',
        noindex: true,
    },

    // ═══ Hub — News Sub-pages ═══
    'hub/news/sources.js': {
        title: 'News Sources — Poker Media Outlets',
        desc: 'Browse poker news sources and media outlets aggregated on Smarter.Poker.',
        canonical: '/hub/news/sources',
    },

    // ═══ Hub — Bankroll Sub-pages ═══
    'hub/bankroll-manager/export.js': {
        title: 'Export Bankroll Data',
        desc: 'Export your bankroll data for tax reporting or external analysis.',
        canonical: '/hub/bankroll-manager/export',
        noindex: true,
    },

    // ═══ Hub — Social Pages Sub-pages ═══
    'hub/social-pages/index.js': {
        title: 'Social Pages — Community',
        desc: 'Discover and follow community pages on Smarter.Poker.',
        canonical: '/hub/social-pages',
    },
    'hub/social-pages/create.js': {
        title: 'Create Social Page',
        desc: 'Create a new social page on Smarter.Poker to share content and build a community.',
        canonical: '/hub/social-pages/create',
        noindex: true,
    },
    'hub/social-pages/[pageId].js': {
        title: 'Social Page',
        desc: 'View a community page on Smarter.Poker.',
        noindex: true,
    },

    // ═══ Hub — Messenger Sub-pages ═══
    'hub/messenger/requests.js': {
        title: 'Message Requests',
        desc: 'View pending message requests.',
        canonical: '/hub/messenger/requests',
        noindex: true,
    },
    'hub/messenger/blocked.js': {
        title: 'Blocked Users',
        desc: 'Manage blocked users in Messenger.',
        canonical: '/hub/messenger/blocked',
        noindex: true,
    },

    // ═══ Hub — User Profile ═══
    'hub/user/[username].js': {
        title: 'Player Profile',
        desc: 'View a poker player profile, stats, and achievements on Smarter.Poker.',
        noindex: true,
    },

    // ═══ Hub — Venues ═══
    'hub/venues/[id].js': {
        title: 'Poker Venue Details',
        desc: 'View detailed information about this poker venue including games, tournaments, and hours.',
        noindex: true,
    },

    // ═══ Hub — Personal Assistant ═══
    'hub/personal-assistant/index.js': {
        title: 'Personal Poker Assistant — Jarvis AI',
        desc: 'Get personalized poker coaching, hand analysis, and strategy advice from Jarvis, your AI poker assistant.',
        canonical: '/hub/personal-assistant',
    },
    'hub/personal-assistant/sandbox.js': {
        title: 'AI Sandbox — Practice with Jarvis',
        desc: 'Practice poker scenarios in the AI sandbox with Jarvis guidance.',
        canonical: '/hub/personal-assistant/sandbox',
        noindex: true,
    },
    'hub/personal-assistant/leaks.js': {
        title: 'Leak Finder — Fix Your Game',
        desc: 'Identify and fix leaks in your poker game with AI-powered analysis from Jarvis.',
        canonical: '/hub/personal-assistant/leaks',
    },

    // ═══ Hub — Misc ═══
    'hub/[orbId].js': {
        title: 'Smarter.Poker Feature',
        desc: 'Explore this Smarter.Poker feature.',
        noindex: true,
    },
    'hub/gto-trainer.js': {
        title: 'GTO Trainer',
        desc: 'GTO poker training on Smarter.Poker.',
        canonical: '/hub/gto-trainer',
        noindex: true,
    },
    'hub/header-test.js': {
        title: 'Header Test',
        desc: 'Header test page.',
        noindex: true,
    },
    'hub/god-mode-demo.js': {
        title: 'God Mode Demo',
        desc: 'Demo page.',
        noindex: true,
    },
    'hub/godmode.js': {
        title: 'God Mode',
        desc: 'Admin page.',
        noindex: true,
    },
    'hub/reset-auth.js': {
        title: 'Reset Authentication',
        desc: 'Reset authentication session.',
        noindex: true,
    },
    'hub/marketplace.js': {
        title: 'Marketplace',
        desc: 'Smarter.Poker marketplace.',
        canonical: '/hub/marketplace',
        noindex: true,
    },
    'hub/tournaments.js': {
        title: 'Tournaments',
        desc: 'Poker tournaments on Smarter.Poker.',
        canonical: '/hub/tournaments',
        noindex: true,
    },
    'hub/bankroll.js': {
        title: 'Bankroll',
        desc: 'Bankroll redirect.',
        noindex: true,
    },

    // ═══ Other Top-level Pages ═══
    'terms.js': {
        title: 'Terms of Service',
        desc: 'Smarter.Poker terms of service. Read our usage policies and user agreements.',
        canonical: '/terms',
    },
    'legal/official-rules.js': {
        title: 'Official Rules — Promotions & Contests',
        desc: 'Official rules for Smarter.Poker promotions, contests, and giveaways.',
        canonical: '/legal/official-rules',
    },
    '404.js': {
        title: 'Page Not Found',
        desc: 'The page you are looking for does not exist.',
        noindex: true,
    },
    'clear-cache.js': {
        title: 'Clear Cache',
        desc: 'Clear browser cache for Smarter.Poker.',
        noindex: true,
    },
    'poker-room-demo.js': {
        title: 'Poker Room Demo',
        desc: 'Demo poker room page.',
        noindex: true,
    },
    'premium-table-demo.js': {
        title: 'Premium Table Demo',
        desc: 'Demo premium poker table.',
        noindex: true,
    },
    'training-table-demo.js': {
        title: 'Training Table Demo',
        desc: 'Demo training poker table.',
        noindex: true,
    },

    // ═══ Horses ═══
    'horses/index.js': {
        title: 'Poker Horses — Fantasy Poker Game',
        desc: 'Play fantasy poker by picking your horses. Follow live tournament action and compete on leaderboards.',
        canonical: '/horses',
    },

    // ═══ Hub — Tours ═══
    'hub/tours/[code].js': {
        title: 'Poker Tour Details',
        desc: 'View details for this poker tour on Smarter.Poker.',
        noindex: true,
    },

    // ═══ Hub — Club Arena Sub-pages ═══
    'hub/club-arena/players.js': {
        title: 'Club Arena — Players',
        desc: 'Search and view poker players in Club Arena.',
        canonical: '/hub/club-arena/players',
        noindex: true,
    },
    'hub/club-arena/marketplace.js': {
        title: 'Club Arena — Marketplace',
        desc: 'Browse the Club Arena marketplace.',
        canonical: '/hub/club-arena/marketplace',
        noindex: true,
    },
    'hub/club-arena/messages.js': {
        title: 'Club Arena — Messages',
        desc: 'View your Club Arena messages.',
        canonical: '/hub/club-arena/messages',
        noindex: true,
    },
    'hub/club-arena/player-stats.js': {
        title: 'Club Arena — Player Stats',
        desc: 'View player statistics in Club Arena.',
        canonical: '/hub/club-arena/player-stats',
        noindex: true,
    },
    'hub/club-arena/hand-histories.js': {
        title: 'Club Arena — Hand Histories',
        desc: 'Review your poker hand histories in Club Arena.',
        canonical: '/hub/club-arena/hand-histories',
        noindex: true,
    },
    'hub/club-arena/admin.js': {
        title: 'Club Arena — Admin',
        desc: 'Club Arena administration panel.',
        canonical: '/hub/club-arena/admin',
        noindex: true,
    },
    'hub/club-arena/cashier.js': {
        title: 'Club Arena — Cashier',
        desc: 'Club Arena cashier for deposits and withdrawals.',
        canonical: '/hub/club-arena/cashier',
        noindex: true,
    },
    'hub/club-arena/lobby.js': {
        title: 'Club Arena — Game Lobby',
        desc: 'Browse available poker games in Club Arena.',
        canonical: '/hub/club-arena/lobby',
        noindex: true,
    },
    'hub/club-arena/leaderboard.js': {
        title: 'Club Arena — Leaderboard',
        desc: 'View Club Arena leaderboard rankings.',
        canonical: '/hub/club-arena/leaderboard',
        noindex: true,
    },
};

// ─── Commander pages: all get noindex ─────────────────────────────────────────
const COMMANDER_PAGES = {
    'commander/index.js': 'Club Commander — Poker Room Management Suite',
    'commander/login.js': 'Club Commander — Sign In',
    'commander/register.js': 'Club Commander — Register Your Venue',
    'commander/onboarding.js': 'Club Commander — Onboarding',
    'commander/dashboard.js': 'Commander Dashboard — Room Overview',
    'commander/tables.js': 'Commander — Table Management',
    'commander/waitlist/index.js': 'Commander — Waitlist Management',
    'commander/members.js': 'Commander — Member Management',
    'commander/tournaments/index.js': 'Commander — Tournament Management',
    'commander/analytics.js': 'Commander — Analytics & Reports',
    'commander/cashier.js': 'Commander — Cashier Operations',
    'commander/staff.js': 'Commander — Staff Management',
    'commander/dealers.js': 'Commander — Dealer Management',
    'commander/dealer-rotation.js': 'Commander — Dealer Rotation',
    'commander/settings.js': 'Commander — Settings',
    'commander/promotions.js': 'Commander — Promotions',
    'commander/schedule.js': 'Commander — Game Schedule',
    'commander/reports.js': 'Commander — Reports',
    'commander/floor.js': 'Commander — Floor Management',
    'commander/floor-calls.js': 'Commander — Floor Calls',
    'commander/lobby.js': 'Commander — Player Lobby',
    'commander/kiosk.js': 'Commander — Player Kiosk',
    'commander/comps.js': 'Commander — Comps & Rewards',
    'commander/high-hands.js': 'Commander — High Hands',
    'commander/incidents.js': 'Commander — Incident Reports',
    'commander/activity.js': 'Commander — Activity Log',
    'commander/notifications.js': 'Commander — Notifications',
    'commander/marketplace.js': 'Commander — Marketplace',
    'commander/membership-plans.js': 'Commander — Membership Plans',
    'commander/open-game.js': 'Commander — Open Game',
    'commander/poker-room.js': 'Commander — Poker Room',
    'commander/leaderboards.js': 'Commander — Leaderboards',
    'commander/leagues.js': 'Commander — Leagues',
    'commander/reputation.js': 'Commander — Player Reputation',
    'commander/responsible-gaming.js': 'Commander — Responsible Gaming',
    'commander/table-assignments.js': 'Commander — Table Assignments',
    'commander/table-vibes.js': 'Commander — Table Vibes',
    'commander/member-import.js': 'Commander — Member Import',
    'commander/tournament-settings.js': 'Commander — Tournament Settings',
    'commander/must-move.js': 'Commander — Must-Move Tables',
    'commander/shift-handoff.js': 'Commander — Shift Handoff',
    'commander/close-day.js': 'Commander — Close Day',
    'commander/exports.js': 'Commander — Data Exports',
    'commander/downloads.js': 'Commander — Downloads',
    'commander/displays.js': 'Commander — Digital Displays',
    'commander/streaming.js': 'Commander — Streaming',
    'commander/system-info.js': 'Commander — System Info',
    'commander/churn-prediction.js': 'Commander — Churn Prediction',
    'commander/qr-code.js': 'Commander — QR Code',
    'commander/time-billing.js': 'Commander — Time Billing',
    'commander/game-types.js': 'Commander — Game Types',
    'commander/room-presets.js': 'Commander — Room Presets',
    'commander/announcements.js': 'Commander — Announcements',
};

// ─── Main processor ──────────────────────────────────────────────────────────

function getRelativePath(filePath) {
    return path.relative(PAGES_DIR, filePath).replace(/\\/g, '/');
}

function processFile(filePath) {
    const relPath = getRelativePath(filePath);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has SEOHead
    if (content.includes('SEOHead')) {
        console.log(`  ⏭  ${relPath} — already has SEOHead`);
        return false;
    }

    // Skip _app.js and _document.js
    if (relPath === '_app.js' || relPath === '_document.js') return false;

    // Skip api/ and files without Head import
    if (relPath.startsWith('api/')) return false;

    // Check if this is a Commander page
    const commanderTitle = COMMANDER_PAGES[relPath];
    if (commanderTitle) {
        return processCommanderPage(filePath, relPath, content, commanderTitle);
    }

    // Check if we have SEO config for this page
    const config = SEO_CONFIG[relPath];
    if (!config) {
        // If page has Head but no config, skip for now
        if (content.includes("import Head from 'next/head'")) {
            console.log(`  ⚠  ${relPath} — has Head but no SEO config defined`);
        }
        return false;
    }

    // Check if page has Head import
    if (!content.includes("import Head from 'next/head'")) {
        // Add Head-based SEO
        return addSEOToHeadlessPage(filePath, relPath, content, config);
    }

    return replacHeadWithSEO(filePath, relPath, content, config);
}

function processCommanderPage(filePath, relPath, content, title) {
    if (!content.includes("import Head from 'next/head'")) {
        console.log(`  ⏭  ${relPath} — Commander page without Head import (skipping)`);
        return false;
    }

    // Replace Head import with SEOHead
    content = content.replace(
        /import Head from ['"]next\/head['"];?/,
        "import SEOHead from '../../src/components/seo/SEOHead';"
    );

    // Replace <Head>...</Head> blocks with SEOHead
    const headBlockRegex = /<Head>([\s\S]*?)<\/Head>/;
    const match = content.match(headBlockRegex);
    if (match) {
        const replacement = `<SEOHead\n                title="${title}"\n                description="Club Commander poker room management tool."\n                noindex={true}\n            />`;
        content = content.replace(headBlockRegex, replacement);
    }

    fs.writeFileSync(filePath, content);
    console.log(`  ✅ ${relPath} — Commander page SEO injected (noindex)`);
    return true;
}

function replacHeadWithSEO(filePath, relPath, content, config) {
    // Replace Head import with SEOHead import
    // Calculate the relative path to the SEOHead component
    const depth = relPath.split('/').length - 1;
    const prefix = depth === 0 ? './' : '../'.repeat(depth);
    const importPath = `${prefix}src/components/seo/SEOHead`;

    content = content.replace(
        /import Head from ['"]next\/head['"];?/,
        `import SEOHead from '${importPath}';`
    );

    // Build the SEOHead tag
    const attrs = [];
    attrs.push(`title="${config.title}"`);
    attrs.push(`description="${config.desc}"`);
    if (config.canonical) attrs.push(`canonical="${config.canonical}"`);
    if (config.noindex) attrs.push(`noindex={true}`);

    const seoTag = `<SEOHead\n                ${attrs.join('\n                ')}\n            />`;

    // Replace <Head>...</Head> blocks
    const headBlockRegex = /<Head>([\s\S]*?)<\/Head>/;
    const match = content.match(headBlockRegex);
    if (match) {
        // Check if there are non-SEO elements like font links we need to preserve
        const innerContent = match[1];
        const fontLinks = innerContent.match(/<link[^>]*fonts[^>]*>/g);

        if (fontLinks && fontLinks.length > 0) {
            const seoWithChildren = `<SEOHead\n                ${attrs.join('\n                ')}\n            >\n                ${fontLinks.join('\n                ')}\n            </SEOHead>`;
            content = content.replace(headBlockRegex, seoWithChildren);
        } else {
            content = content.replace(headBlockRegex, seoTag);
        }
    }

    fs.writeFileSync(filePath, content);
    console.log(`  ✅ ${relPath} — SEO injected`);
    return true;
}

function addSEOToHeadlessPage(filePath, relPath, content, config) {
    // Page doesn't have Head import — add SEOHead import and tag
    const depth = relPath.split('/').length - 1;
    const prefix = depth === 0 ? './' : '../'.repeat(depth);
    const importPath = `${prefix}src/components/seo/SEOHead`;

    // Add import after last import statement
    const lastImportIndex = content.lastIndexOf('import ');
    const endOfImportLine = content.indexOf('\n', lastImportIndex);

    if (lastImportIndex === -1) {
        console.log(`  ⚠  ${relPath} — no imports found, skipping`);
        return false;
    }

    const before = content.substring(0, endOfImportLine + 1);
    const after = content.substring(endOfImportLine + 1);
    content = before + `import SEOHead from '${importPath}';\n` + after;

    // Try to add SEOHead tag after first return (
    const returnIndex = content.indexOf('return (');
    if (returnIndex === -1) {
        console.log(`  ⚠  ${relPath} — no return statement found`);
        return false;
    }

    const attrs = [];
    attrs.push(`title="${config.title}"`);
    attrs.push(`description="${config.desc}"`);
    if (config.canonical) attrs.push(`canonical="${config.canonical}"`);
    if (config.noindex) attrs.push(`noindex={true}`);

    // We'll skip auto-injection for headless pages as it's too risky without seeing the JSX structure
    console.log(`  ⚠  ${relPath} — headless page, needs manual SEOHead insertion`);
    return false;
}

// ─── Walk all pages ──────────────────────────────────────────────────────────

function walkDir(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip node_modules, api, auth, demo, admin
            if (['node_modules', 'api', 'auth', 'demo'].includes(entry.name)) continue;
            results.push(...walkDir(fullPath));
        } else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) {
            results.push(fullPath);
        }
    }
    return results;
}

// ─── Execute ─────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('  SEO MASS INJECTION — Smarter.Poker');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const allPages = walkDir(PAGES_DIR);
console.log(`Found ${allPages.length} page files to process\n`);

let injected = 0;
let skipped = 0;

for (const page of allPages) {
    const result = processFile(page);
    if (result) injected++;
    else skipped++;
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  COMPLETE: ${injected} pages injected, ${skipped} skipped`);
console.log('═══════════════════════════════════════════════════════════════');
