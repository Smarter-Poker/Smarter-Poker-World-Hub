/**
 * Hamburger Menu Configurations
 * ═══════════════════════════════════════════════════════════════════════════
 * Centralized menu configurations for all World Hub pages
 * Each world has its own menu items, toggles, and navigation
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Helper function to create menu items
export const createMenuItem = {
    navigation: (label, href, icon = null, badge = null, onClick = null) => ({
        type: 'navigation',
        label,
        href,
        icon,
        badge,
        onClick
    }),
    toggle: (label, checked, onChange, hint = null) => ({
        type: 'toggle',
        label,
        checked,
        onChange,
        hint
    }),
    action: (label, onClick, icon = null, primary = false, closeOnClick = true) => ({
        type: 'action',
        label,
        onClick,
        icon,
        primary,
        closeOnClick
    }),
    divider: () => ({
        type: 'divider'
    }),
    section: (label) => ({
        type: 'section',
        label
    }),
    grid: (items, columns = 2) => ({
        type: 'grid',
        items,
        columns
    })
};

// Common icons (SVG components)
export const MenuIcons = {
    help: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
        </svg>
    ),
    settings: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
    ),
    home: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    training: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
    ),
    trophy: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0012 0V2z" />
        </svg>
    ),
    message: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
    ),
    users: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
    ),
    video: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
    ),
    store: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
        </svg>
    )
};

// Menu configurations for each world
export const MENU_CONFIGS = {
    'hub-home': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Quick Navigation'),
            createMenuItem.grid([
                {
                    label: 'Training',
                    href: '/hub/training',
                    icon: MenuIcons.training
                },
                {
                    label: 'Diamond Arena',
                    href: '/hub/diamond-arena',
                    icon: MenuIcons.trophy
                },
                {
                    label: 'Club Arena',
                    href: '/hub/club-arena',
                    icon: (
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="6" width="6" height="14" rx="1" fill="#8b5cf6" />
                            <rect x="9" y="3" width="6" height="17" rx="1" fill="#a78bfa" />
                            <rect x="16" y="6" width="6" height="14" rx="1" fill="#c4b5fd" />
                        </svg>
                    )
                },
                {
                    label: 'Diamond Store',
                    href: '/hub/diamond-store',
                    icon: MenuIcons.store
                },
                {
                    label: 'Friends',
                    href: '/hub/friends',
                    icon: MenuIcons.users
                },
                {
                    label: 'Messenger',
                    href: '/hub/messenger',
                    icon: MenuIcons.message
                }
            ]),
            createMenuItem.divider(),
            createMenuItem.navigation('Reels', '/hub/reels', MenuIcons.video),
            createMenuItem.navigation('News', '/hub/news'),
            createMenuItem.navigation('Poker Near Me', '/hub/poker-near-me')
        ],
        bottomLinks: [
            { label: 'Help and support', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    'training': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Training Settings'),
            createMenuItem.toggle(
                'View Mode',
                state.viewMode === 'pro',
                (checked) => handlers.setViewMode(checked ? 'pro' : 'standard'),
                state.viewMode === 'pro' ? 'Advanced terminology' : 'Beginner-friendly'
            ),
            createMenuItem.toggle(
                'Sound Effects',
                state.soundEnabled || false,
                handlers.setSoundEnabled
            ),
            createMenuItem.toggle(
                'Timer',
                state.timerEnabled !== false,
                handlers.setTimerEnabled
            ),
            createMenuItem.toggle(
                'Auto-Advance',
                state.autoAdvance || false,
                handlers.setAutoAdvance,
                'Automatically move to next question'
            ),
            createMenuItem.toggle(
                'Show Hints',
                state.showHints !== false,
                handlers.setShowHints,
                'Display helpful hints during training'
            ),
            createMenuItem.divider(),
            createMenuItem.section('Navigation'),
            createMenuItem.navigation('Training Library', '/hub/training'),
            createMenuItem.navigation('My Progress', '/hub/training/progress'),
            createMenuItem.navigation('Leaderboard', '/hub/training/leaderboard')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    'messenger': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Conversations'),
            createMenuItem.navigation('All Messages', '/hub/messenger?filter=all'),
            createMenuItem.navigation('Unread', '/hub/messenger?filter=unread', null, state.unreadCount || null),
            createMenuItem.navigation('Archived', '/hub/messenger?filter=archived'),
            createMenuItem.navigation('Message Requests', '/hub/messenger/requests', null, state.requestCount || null),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Notifications',
                state.notifications !== false,
                handlers.setNotifications
            ),
            createMenuItem.toggle(
                'Read Receipts',
                state.readReceipts !== false,
                handlers.setReadReceipts
            ),
            createMenuItem.toggle(
                'Active Status',
                state.activeStatus !== false,
                handlers.setActiveStatus
            ),
            createMenuItem.toggle(
                'Message Sounds',
                state.messageSounds !== false,
                handlers.setMessageSounds
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Privacy Settings', '/hub/settings?section=privacy'),
            createMenuItem.navigation('Blocked Users', '/hub/messenger/blocked')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'reels': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Feed'),
            createMenuItem.navigation('For You', '/hub/reels?feed=foryou'),
            createMenuItem.navigation('Following', '/hub/reels?feed=following'),
            createMenuItem.navigation('Trending', '/hub/reels?feed=trending'),
            createMenuItem.divider(),
            createMenuItem.action('Upload Reel', handlers.onUploadReel, null, true),
            createMenuItem.navigation('My Reels', '/hub/reels/my-reels'),
            createMenuItem.navigation('Saved Reels', '/hub/reels/saved'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Autoplay',
                state.autoplay !== false,
                handlers.setAutoplay
            ),
            createMenuItem.toggle(
                'Sound on Scroll',
                state.soundOnScroll !== false,
                handlers.setSoundOnScroll
            ),
            createMenuItem.toggle(
                'Data Saver',
                state.dataSaver || false,
                handlers.setDataSaver,
                'Reduce video quality to save data'
            ),
            createMenuItem.toggle(
                'Show Captions',
                state.showCaptions !== false,
                handlers.setShowCaptions
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Content Preferences', '/hub/settings?section=content')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'friends': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.navigation('Friend Requests', '/hub/friends?tab=requests', null, state.requestCount || null),
            createMenuItem.navigation('Suggestions', '/hub/friends?tab=suggestions'),
            createMenuItem.navigation('All Friends', '/hub/friends?tab=all'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Friend Requests',
                state.allowRequests !== false,
                handlers.setAllowRequests,
                'Who can send you friend requests'
            ),
            createMenuItem.toggle(
                'Show Online Status',
                state.showOnlineStatus !== false,
                handlers.setShowOnlineStatus
            ),
            createMenuItem.toggle(
                'Friend Suggestions',
                state.friendSuggestions !== false,
                handlers.setFriendSuggestions
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Privacy Settings', '/hub/settings?section=privacy'),
            createMenuItem.navigation('Blocked Users', '/hub/settings?section=blocked')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'diamond-store': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Categories'),
            createMenuItem.navigation('All Products', '/hub/diamond-store'),
            createMenuItem.navigation('Diamonds', '/hub/diamond-store?category=diamonds'),
            createMenuItem.navigation('VIP Membership', '/hub/diamond-store?category=vip'),
            createMenuItem.navigation('Merchandise', '/hub/diamond-store?category=merch'),
            createMenuItem.divider(),
            createMenuItem.navigation('Shopping Cart', '/hub/diamond-store/cart', MenuIcons.store, state.cartCount || null),
            createMenuItem.navigation('Order History', '/hub/diamond-store/orders'),
            createMenuItem.navigation('Wishlist', '/hub/diamond-store/wishlist'),
            createMenuItem.navigation('Payment Methods', '/hub/settings?section=payments'),
            createMenuItem.divider(),
            createMenuItem.section('Preferences'),
            createMenuItem.toggle(
                'Email Receipts',
                state.emailReceipts !== false,
                handlers.setEmailReceipts
            ),
            createMenuItem.toggle(
                'Promotional Emails',
                state.promoEmails || false,
                handlers.setPromoEmails
            )
        ],
        bottomLinks: [
            { label: 'Help & Support', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'settings': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Quick Navigation'),
            createMenuItem.navigation('Account Settings', '/hub/settings?section=account'),
            createMenuItem.navigation('Privacy & Security', '/hub/settings?section=privacy'),
            createMenuItem.navigation('Notifications', '/hub/settings?section=notifications'),
            createMenuItem.navigation('Display & Sound', '/hub/settings?section=display'),
            createMenuItem.navigation('Billing & Payments', '/hub/settings?section=billing'),
            createMenuItem.divider(),
            createMenuItem.section('Account Actions'),
            createMenuItem.action('Sign Out', handlers.onSignOut, null, false, true),
            createMenuItem.navigation('Delete Account', '/hub/settings?section=delete-account')
        ],
        bottomLinks: [
            { label: 'Help & Support', href: '/hub/help', icon: MenuIcons.help }
        ]
    })
};

// Helper to get menu config for a specific world
export function getMenuConfig(worldKey, user, state = {}, handlers = {}) {
    const config = MENU_CONFIGS[worldKey];
    if (!config) {
        console.warn(`No menu config found for world: ${worldKey}`);
        return { menuItems: [], bottomLinks: [] };
    }
    return config(user, state, handlers);
}
