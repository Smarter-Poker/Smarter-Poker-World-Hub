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
    { id: 'social-media', color: '#ff4d4d', label: 'Social Media', gradient: ['#ff6b6b', '#c73d3d'], imageUrl: '/cards/social-media.jpg' },
    { id: 'club-arena', color: '#ff9900', label: 'Club Arena', gradient: ['#ffb347', '#cc7722'], imageUrl: '/cards/club-arena.jpg' },
    { id: 'diamond-arena', color: '#ffee00', label: 'Diamond Arena', gradient: ['#fff176', '#c9b000'], imageUrl: '/cards/diamond-arena.jpg' },
    { id: 'training', color: '#00ff66', label: 'Training', gradient: ['#69f0ae', '#00c853'], imageUrl: '/cards/training.jpg' },
    { id: 'memory-games', color: '#00ffff', label: 'Memory Games', gradient: ['#84ffff', '#00bcd4'], imageUrl: '/cards/memory-games.jpg' },
    { id: 'personal-assistant', color: '#0088ff', label: 'Personal Assistant', gradient: ['#64b5f6', '#1565c0'], imageUrl: '/cards/personal-assistant.jpg' },
    { id: 'diamond-arcade', color: '#9900ff', label: 'Diamond Arcade', gradient: ['#ce93d8', '#7b1fa2'], imageUrl: '/cards/diamond-arcade.jpg' },
    { id: 'bankroll-manager', color: '#ff00ff', label: 'Bankroll Manager', gradient: ['#f48fb1', '#c2185b'], imageUrl: '/cards/bankroll-manager.jpg' },
    { id: 'poker-near-me', color: '#ffffff', label: 'Poker Near Me', gradient: ['#e0e0e0', '#9e9e9e'], imageUrl: '/cards/poker-near-me.jpg' },
    { id: 'trivia', color: '#00ccff', label: 'Trivia', gradient: ['#4dd0e1', '#0097a7'], imageUrl: '/cards/trivia.jpg' },
    { id: 'video-library', color: '#ff4444', label: 'Video Library', gradient: ['#ff6666', '#cc3333'], imageUrl: '/cards/video-library.jpg' },
];

// Utility exports
export const ORB_COUNT = POKER_IQ_ORBS.length;
export const getOrbById = (id: string) => POKER_IQ_ORBS.find(orb => orb.id === id);
export const getOrbByIndex = (index: number) => POKER_IQ_ORBS[index % POKER_IQ_ORBS.length];
