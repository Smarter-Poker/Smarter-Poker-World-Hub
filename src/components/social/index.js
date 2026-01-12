/**
 * 🃏 POKER SOCIAL COMPONENTS - BARREL EXPORT
 * src/app/social/components/index.js
 * 
 * Facebook Clone with a Poker Twist - Component Library
 */

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 HEAT & EFFECTS (Dark Theme)
// ═══════════════════════════════════════════════════════════════════════════
export {
    HeatMapBorder,
    GTOMasterGlow,
    default as HeatMapBorderDefault
} from './HeatMapBorder';

// ═══════════════════════════════════════════════════════════════════════════
// 🃏 POKER REPUTATION & BADGES
// ═══════════════════════════════════════════════════════════════════════════
export {
    PokerTierBadge,
    PokerReactionBar,
    WinRateDisplay,
    PokerAchievementBadge,
    default as PokerReputationDefault
} from './PokerReputationBadges';

// ═══════════════════════════════════════════════════════════════════════════
// 📰 FEED COMPONENTS (Dark Theme)
// ═══════════════════════════════════════════════════════════════════════════
export {
    PokerFeedCard,
    default as PokerFeedCardDefault
} from './PokerFeedCard';

// ═══════════════════════════════════════════════════════════════════════════
// 📖 STORIES (Dark Theme)
// ═══════════════════════════════════════════════════════════════════════════
export {
    PokerStoriesRow,
    default as PokerStoriesRowDefault
} from './PokerStoriesRow';

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 FACEBOOK-STYLE COMPONENTS (Light Theme - RECOMMENDED)
// ═══════════════════════════════════════════════════════════════════════════
export {
    FBAvatar,
    CreatePostBox,
    FBPostCard,
    FBStoriesRow,
    FB_COLORS,
    default as FacebookStyleDefault
} from './FacebookStyleCard';

export {
    ChatWindow,
    ConversationList,
    ChatDock,
    default as FacebookMessengerDefault
} from './FacebookMessenger';

export {
    NotificationItem,
    NotificationsDropdown,
    NotificationBell,
    NOTIFICATION_TYPES,
    default as FacebookNotificationsDefault
} from './FacebookNotifications';

export {
    FriendCard,
    FriendRequestsSection,
    PeopleYouMayKnow,
    FriendsList,
    default as FacebookFriendsDefault
} from './FacebookFriends';

export {
    ReelCard,
    ReelsCarousel,
    default as FacebookReelsDefault
} from './FacebookReels';

export {
    PhotoGrid,
    PhotoLightbox,
    PhotoAlbumGrid,
    default as FacebookPhotosDefault
} from './FacebookPhotos';

export {
    default as FacebookLayout
} from './FacebookLayout';

export {
    default as FacebookClubView
} from '../views/FacebookClubView';

export {
    default as FacebookWatchView
} from '../views/FacebookWatchView';

export {
    default as FacebookFeedView
} from '../views/FacebookFeedView';

export {
    default as FacebookProfileView
} from '../views/FacebookProfileView';

export const POKER_SOCIAL_COMPONENTS = {
    // Heat Effects
    HeatMapBorder: 'HeatMapBorder',
    GTOMasterGlow: 'GTOMasterGlow',

    // Reputation
    PokerTierBadge: 'PokerTierBadge',
    PokerReactionBar: 'PokerReactionBar',
    WinRateDisplay: 'WinRateDisplay',
    PokerAchievementBadge: 'PokerAchievementBadge',

    // Feed
    PokerFeedCard: 'PokerFeedCard',

    // Stories
    PokerStoriesRow: 'PokerStoriesRow'
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 POKER CONSTANTS (Shared across components)
// ═══════════════════════════════════════════════════════════════════════════

export const POKER_TIERS = {
    fish: { icon: '🐟', name: 'Fish', level: 1 },
    reg: { icon: '♠️', name: 'Reg', level: 2 },
    grinder: { icon: '💪', name: 'Grinder', level: 3 },
    shark: { icon: '🦈', name: 'Shark', level: 4 },
    whale: { icon: '🐋', name: 'Whale', level: 5 },
    gto_master: { icon: '👑', name: 'GTO Master', level: 6 }
};

export const POKER_REACTIONS = {
    fold: { icon: '🃏', label: 'Fold' },
    call: { icon: '✋', label: 'Call' },
    raise: { icon: '🔥', label: 'Raise' },
    allIn: { icon: '💎', label: 'All-In' },
    nuts: { icon: '🥜', label: 'The Nuts!' },
    cooler: { icon: '🧊', label: 'Cooler' }
};

export const POST_TYPES = {
    status: { icon: '💭', label: 'Status Update' },
    hand_history: { icon: '🃏', label: 'Hand Analysis' },
    session_recap: { icon: '📊', label: 'Session Recap' },
    bad_beat: { icon: '💔', label: 'Bad Beat Story' },
    big_win: { icon: '🏆', label: 'Big Win' },
    question: { icon: '❓', label: 'Strategy Question' },
    gto_breakdown: { icon: '🧠', label: 'GTO Breakdown' },
    live_stream: { icon: '🔴', label: 'Live Session' }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 THEME COLORS
// ═══════════════════════════════════════════════════════════════════════════

export const POKER_THEME = {
    // Brand Colors
    primary: '#FF6B35',      // Club Orange
    secondary: '#3B82F6',    // Action Blue
    accent: '#22C55E',       // Winner Green
    danger: '#EF4444',       // Fold Red

    // Tier Colors
    fish: '#6B7280',
    reg: '#3B82F6',
    grinder: '#8B5CF6',
    shark: '#EF4444',
    whale: '#F59E0B',
    gtoMaster: '#FFD700',

    // Background
    darkBg: '#0A0F1E',
    cardBg: 'rgba(18, 24, 38, 0.95)',

    // Semantic
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6'
};
