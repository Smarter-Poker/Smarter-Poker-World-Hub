/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — 13-ORB MANIFEST (FINAL ORDER)
   premium card registry with official names
   ═══════════════════════════════════════════════════════════════════════════ */

export interface OrbConfig {
    id: string;
    color: string;
    label: string;
    gradient: [string, string]; // [top color, bottom color]
    icon?: string;
    description?: string;
    imageUrl?: string; // Custom card image (800x1200 recommended)
}

export const POKER_IQ_ORBS: OrbConfig[] = [
    { id: 'bankroll-manager', color: '#ff00ff', label: 'Bankroll Manager', gradient: ['#f48fb1', '#c2185b'], imageUrl: '/cards/bankroll-manager.jpg', description: 'PROFESSIONAL TRACKING — MANAGE AND GROW YOUR POKER BANKROLL' },
    { id: 'preflop-charts', color: '#00ffff', label: 'Preflop Charts', gradient: ['#84ffff', '#00bcd4'], imageUrl: '/cards/preflop-charts.jpg', description: 'MASTER GTO RANGES — TRAIN PREFLOP DECISIONS UNDER PRESSURE' },
    { id: 'poker-near-me', color: '#ffffff', label: 'Poker Near Me', gradient: ['#e0e0e0', '#9e9e9e'], imageUrl: '/cards/poker-near-me.jpg', description: '680 VENUES  ALL TOURNAMENTS REAL TIME DATA' },
    { id: 'marketplace', color: '#ffd700', label: 'Marketplace', gradient: ['#ffe066', '#ccaa00'], imageUrl: '/cards/marketplace.jpg', description: 'PREMIUM POKER GEAR — CARDS, CHIPS, AND EXCLUSIVE MERCH' },
    { id: 'personal-assistant', color: '#0088ff', label: 'Personal Assistant', gradient: ['#64b5f6', '#1565c0'], imageUrl: '/cards/personal-assistant.jpg', description: 'YOUR AI COACH — FINDS YOUR LEAKS AND LEVELS UP YOUR GAME' },
    { id: 'training', color: '#00ff66', label: 'Training', gradient: ['#69f0ae', '#00c853'], imageUrl: '/cards/training.jpg', description: '100 GAMES TO MASTER — LEVEL UP YOUR POKER IQ ONE DRILL AT A TIME' },
    { id: 'news', color: '#ff6600', label: 'News', gradient: ['#ff8c42', '#e55812'], imageUrl: '/cards/news.jpg', description: 'BREAKING POKER NEWS — TOURNAMENTS, DRAMA, AND LEGEND STORIES' },
    { id: 'trivia', color: '#00ccff', label: 'Trivia', gradient: ['#4dd0e1', '#0097a7'], imageUrl: '/cards/trivia.jpg', description: 'TEST YOUR KNOWLEDGE — POKER HISTORY, STRATEGY, AND FUN FACTS' },
    { id: 'social-media', color: '#ff4d4d', label: 'Social Media', gradient: ['#ff6b6b', '#c73d3d'], imageUrl: '/cards/social-media.jpg', description: 'STAY CONNECTED TO THE POKER WORLD — SHARE YOUR WINS, FOLLOW YOUR HEROES' },
    { id: 'diamond-arena', color: '#ffee00', label: 'Diamond Arena', gradient: ['#fff176', '#c9b000'], imageUrl: '/cards/diamond-arena.jpg', description: 'HIGH STAKES ACTION — PLAY FOR DIAMONDS AGAINST ELITE COMPETITION' },
    { id: 'club-arena', color: '#ff9900', label: 'Club Arena', gradient: ['#ffb347', '#cc7722'], imageUrl: '/cards/club-arena.jpg', description: 'JOIN PRIVATE CLUBS — COMPETE WITH PLAYERS FROM AROUND THE WORLD' },
    { id: 'my-clubs', color: '#00bfff', label: 'My Clubs', gradient: ['#4dd0e1', '#00838f'], imageUrl: '/cards/my-clubs.jpg', description: 'YOUR CLUBS & VENUES — QUICK ACCESS TO WAITLISTS, LIVE GAMES & MORE' },
    { id: 'video-library', color: '#ff4444', label: 'Video Library', gradient: ['#ff6666', '#cc3333'], imageUrl: '/cards/video-library.jpg', description: 'ENDLESS CONTENT — THOUSANDS OF HOURS OF CASH AND TOURNAMENT PLAY' },
    { id: 'poker-tools', color: '#1877F2', label: 'Odds Calculator', gradient: ['#4299E1', '#1A56DB'], imageUrl: '/cards/poker-tools.jpg', description: 'CALCULATE YOUR EDGE — INSTANT EQUITY FOR HOLD\'EM, OMAHA, PLO5, PLO6' },
    { id: 'MLB-ANALYTICS', color: '#003A70', label: 'MLB Analytics', gradient: ['#003A70', '#CE1141'], imageUrl: '/cards/mlb-analytics-v7.jpg', description: 'MLB SPORTS BETTING ANALYTICS AND PREDICTIONS' },
];

// Club Commander — only shown to users with a Commander account
export const COMMANDER_ORB: OrbConfig = {
    id: 'club-commander',
    color: '#cc0000',
    label: 'Club Commander',
    gradient: ['#991111', '#440000'],
    imageUrl: '/cards/club-commander.jpg',
    description: 'MANAGE YOUR POKER ROOM — FULL COMMAND CENTER FOR YOUR VENUE',
};

// Work Schedule & Dealer Downs — only shown to users linked as staff at a venue
export const EMPLOYEE_PORTAL_ORB: OrbConfig = {
    id: 'employee-portal',
    color: '#2374e1',
    label: 'Work Schedule & Dealer Downs',
    gradient: ['#2374e1', '#1a56db'],
    imageUrl: '/cards/employee-portal.jpg',
    description: 'YOUR WORK HUB — VIEW SCHEDULE, TRACK DOWNS, AND TIME CLOCK',
};

// Toke Tracker — always shown for ALL authenticated users (traveler/independent dealer access)
export const TOKE_TRACKER_ORB: OrbConfig = {
    id: 'toke-tracker',
    color: '#f59e0b',
    label: 'Toke Tracker',
    gradient: ['#f59e0b', '#b45309'],
    imageUrl: '/cards/toke-tracker.jpg',
    description: 'DEALER INCOME ENGINE — TRACK TOKES, DOWNS, EXPENSES & CAREER STATS',
};

// Cards that can never be hidden by the user (core identity cards)
export const PINNED_ORB_IDS: string[] = ['toke-tracker'];

// Utility exports
export const ORB_COUNT = POKER_IQ_ORBS.length;
export const getOrbById = (id: string) => POKER_IQ_ORBS.find(orb => orb.id === id);
export const getOrbByIndex = (index: number) => POKER_IQ_ORBS[index % POKER_IQ_ORBS.length];
