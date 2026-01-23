/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — 13-ORB MANIFEST (FINAL ORDER)
   PokerBros-style card registry with official names
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
    { id: 'social-media', color: '#ff4d4d', label: 'Social Media', gradient: ['#ff6b6b', '#c73d3d'], imageUrl: '/images/social_media_card_art.png', description: 'STAY CONNECTED TO THE POKER WORLD — SHARE WHAT MATTERS TO YOU' },
    { id: 'news', color: '#ff6600', label: 'News', gradient: ['#ff8c42', '#e55812'], imageUrl: '/images/news_card_art.png', description: 'BREAKING POKER NEWS FROM AROUND THE WORLD' },
    { id: 'club-arena', color: '#ff9900', label: 'Club Arena', gradient: ['#ffb347', '#cc7722'], imageUrl: '/cards/club-arena.jpg', description: 'PLAY AGAINST OTHER PLAYERS FROM CLUBS AROUND THE WORLD' },
    { id: 'diamond-arena', color: '#ffee00', label: 'Diamond Arena', gradient: ['#fff176', '#c9b000'], imageUrl: '/cards/diamond-arena.jpg', description: 'PLAY LIVE POKER WITH DIAMONDS' },
    { id: 'training', color: '#00ff66', label: 'Training', gradient: ['#69f0ae', '#00c853'], imageUrl: '/cards/training.jpg', description: 'SHARPEN YOUR SKILLS, MASTER THE GAME!' },
    { id: 'memory-games', color: '#00ffff', label: 'Memory Games', gradient: ['#84ffff', '#00bcd4'], imageUrl: '/cards/memory-games.jpg', description: 'TRAIN AND CONDITION GTO MEMORY FOR LIVE DECISIONS' },
    { id: 'personal-assistant', color: '#0088ff', label: 'Personal Assistant', gradient: ['#64b5f6', '#1565c0'], imageUrl: '/cards/personal-assistant.jpg', description: 'FINDS YOUR LEAKS AND FIXES YOUR GAME' },
    { id: 'diamond-arcade', color: '#9900ff', label: 'Diamond Arcade', gradient: ['#ce93d8', '#7b1fa2'], imageUrl: '/cards/diamond-arcade.jpg', description: 'COMPETE UNDER PRESSURE TO WIN DIAMONDS' },
    { id: 'bankroll-manager', color: '#ff00ff', label: 'Bankroll Manager', gradient: ['#f48fb1', '#c2185b'], imageUrl: '/cards/bankroll-manager.jpg', description: 'TRACK, MANAGE, AND GROW YOUR POKER BANKROLL' },
    { id: 'poker-near-me', color: '#ffffff', label: 'Poker Near Me', gradient: ['#e0e0e0', '#9e9e9e'], imageUrl: '/cards/poker-near-me.jpg', description: 'FIND ALL THE CASH GAMES AND TOURNAMENTS NEAR YOU' },
    { id: 'marketplace', color: '#ffd700', label: 'Marketplace', gradient: ['#ffe066', '#ccaa00'], imageUrl: '/cards/marketplace.jpg', description: 'SHOP FOR PREMIUM POKER GEAR AND ACCESSORIES' },
    { id: 'trivia', color: '#00ccff', label: 'Trivia', gradient: ['#4dd0e1', '#0097a7'], imageUrl: '/cards/trivia.jpg', description: 'POKER TRIVIA, COMPETITIVE GAMES AND MORE!' },
    { id: 'video-library', color: '#ff4444', label: 'Video Library', gradient: ['#ff6666', '#cc3333'], imageUrl: '/cards/video-library.jpg', description: 'THOUSANDS OF HOURS OF CASH GAME AND TOURNAMENT CONTENT' },
];

// Utility exports
export const ORB_COUNT = POKER_IQ_ORBS.length;
export const getOrbById = (id: string) => POKER_IQ_ORBS.find(orb => orb.id === id);
export const getOrbByIndex = (index: number) => POKER_IQ_ORBS[index % POKER_IQ_ORBS.length];
