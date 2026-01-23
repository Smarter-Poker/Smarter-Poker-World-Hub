/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — 11-ORB MANIFEST (FINAL ORDER)
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
    { id: 'social-media', color: '#ff4d4d', label: 'Social Media', gradient: ['#ff6b6b', '#c73d3d'], imageUrl: '/images/social_media_card_art.png', description: 'Connect & Share' },
    { id: 'news', color: '#ff6600', label: 'News', gradient: ['#ff8c42', '#e55812'], imageUrl: '/images/news_card_art.png', description: 'Poker News Hub' },
    { id: 'club-arena', color: '#ff9900', label: 'Club Arena', gradient: ['#ffb347', '#cc7722'], imageUrl: '/cards/club-arena.jpg', description: 'Private Games' },
    { id: 'diamond-arena', color: '#ffee00', label: 'Diamond Arena', gradient: ['#fff176', '#c9b000'], imageUrl: '/cards/diamond-arena.jpg', description: 'Compete & Win' },
    { id: 'training', color: '#00ff66', label: 'Training', gradient: ['#69f0ae', '#00c853'], imageUrl: '/cards/training.jpg', description: 'Master GTO' },
    { id: 'memory-games', color: '#00ffff', label: 'Memory Games', gradient: ['#84ffff', '#00bcd4'], imageUrl: '/cards/memory-games.jpg', description: 'Brain Training' },
    { id: 'personal-assistant', color: '#0088ff', label: 'Personal Assistant', gradient: ['#64b5f6', '#1565c0'], imageUrl: '/cards/personal-assistant.jpg', description: 'AI Coach' },
    { id: 'diamond-arcade', color: '#9900ff', label: 'Diamond Arcade', gradient: ['#ce93d8', '#7b1fa2'], imageUrl: '/cards/diamond-arcade.jpg', description: 'Play & Earn' },
    { id: 'bankroll-manager', color: '#ff00ff', label: 'Bankroll Manager', gradient: ['#f48fb1', '#c2185b'], imageUrl: '/cards/bankroll-manager.jpg', description: 'Track Stats' },
    { id: 'poker-near-me', color: '#ffffff', label: 'Poker Near Me', gradient: ['#e0e0e0', '#9e9e9e'], imageUrl: '/cards/poker-near-me.jpg', description: 'Find Live Games' },
    { id: 'trivia', color: '#00ccff', label: 'Trivia', gradient: ['#4dd0e1', '#0097a7'], imageUrl: '/cards/trivia.jpg', description: 'Test Knowledge' },
    { id: 'video-library', color: '#ff4444', label: 'Video Library', gradient: ['#ff6666', '#cc3333'], imageUrl: '/cards/video-library.jpg', description: 'Learn & Watch' },
];

// Utility exports
export const ORB_COUNT = POKER_IQ_ORBS.length;
export const getOrbById = (id: string) => POKER_IQ_ORBS.find(orb => orb.id === id);
export const getOrbByIndex = (index: number) => POKER_IQ_ORBS[index % POKER_IQ_ORBS.length];
