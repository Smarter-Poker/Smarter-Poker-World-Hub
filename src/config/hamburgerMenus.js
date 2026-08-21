/**
 * Hamburger Menu Configurations
 * ═══════════════════════════════════════════════════════════════════════════
 * Centralized menu configurations for all World Hub pages
 * Each world has its own menu items, toggles, and navigation
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
    Spade, CalendarDays, Target, BarChart3, Calculator, Palette, Download,
    Brain, Flame, Wallet, MapPin, Clock, Lock, FileText, ClipboardList,
    Undo2, RotateCcw, Clapperboard, Share2, Zap, Thermometer, Volume2,
    UploadCloud, SlidersHorizontal, FolderOpen, Save, Bookmark, Flag,
    LayoutGrid, RefreshCw, ListChecks, Gauge, Home as HomeIcon, UserPlus,
    Newspaper, Timer, Trophy as TrophyIcon, MessageSquare, Sparkles,
} from 'lucide-react';

// NOTE: sign-out lives in exactly ONE place — HamburgerMenu.handleLogout,
// which clears the full cache list (sp-social-user, sp-vip-status,
// smarter-poker-auth, sp-cached-header-user, sp-cached-settings-profile,
// sp-notif-count). The menu auto-appends a "Log Out" row whenever a config
// does not already supply one, so configs must NOT define their own.

// Helper to copy / share the current user's referral link.
export const copyReferralLink = async (user) => {
    const notify = async (kind, message) => {
        try {
            const { default: toast } = await import('react-hot-toast');
            if (kind === 'error') toast.error(message);
            else toast.success(message);
        } catch (_) {
            try { window.alert(message); } catch (__) { /* non-browser */ }
        }
    };

    if (!user?.id) {
        await notify('error', 'Please log in to use referral links.');
        return;
    }
    try {
        // Shared singleton — it is the only client configured with the
        // `smarter-poker-auth` storage key, so the profiles read runs
        // authenticated instead of anonymously failing RLS.
        const { supabase } = await import('../lib/supabase');
        const { data, error } = await supabase
            .from('profiles')
            .select('player_number')
            .eq('id', user.id)
            .maybeSingle();
        if (error || !data?.player_number) {
            await notify('error', 'Could not find your player number. Please try again.');
            return;
        }
        const link = `https://smarter.poker/auth/signup?ref=${data.player_number}`;
        // Safari revokes the user-gesture clipboard grant across an await, so
        // prefer the native share sheet on mobile.
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({ title: 'Smarter Poker', text: 'Join me on Smarter Poker', url: link });
                return;
            } catch (shareErr) {
                if (shareErr?.name === 'AbortError') return; // user dismissed
            }
        }
        await navigator.clipboard.writeText(link);
        await notify('success', 'Referral link copied — you earn 500 diamonds per signup.');
    } catch (err) {
        console.warn('Copy referral link error:', err);
        await notify('error', 'Failed to copy referral link. Please try again.');
    }
};

// Helper function to create menu items.
// `opts` carries the structural flags the renderer understands:
//   id       — stable identity used for de-duplication (never match on copy)
//   hardNav  — force a full document load (getServerSideProps SPAs)
//   danger   — destructive styling + separation
//   variant  — 'flat' removes the border/padding chrome
export const createMenuItem = {
    navigation: (label, href, icon = null, badge = null, onClick = null, opts = {}) => ({
        type: 'navigation',
        label,
        href,
        icon,
        badge,
        onClick,
        ...opts
    }),
    toggle: (label, checked, onChange, hint = null, icon = null, opts = {}) => ({
        type: 'toggle',
        label,
        checked,
        onChange,
        hint,
        icon,
        ...opts
    }),
    action: (label, onClick, icon = null, primary = false, closeOnClick = true, opts = {}) => ({
        type: 'action',
        label,
        onClick,
        icon,
        primary,
        closeOnClick,
        ...opts
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
    ),

    // ── lucide-react set (repo rule: icons, never bare emoji in labels) ─────
    spade: <Spade size={24} strokeWidth={2} />,
    schedule: <CalendarDays size={24} strokeWidth={2} />,
    target: <Target size={24} strokeWidth={2} />,
    chart: <BarChart3 size={24} strokeWidth={2} />,
    calculator: <Calculator size={24} strokeWidth={2} />,
    palette: <Palette size={24} strokeWidth={2} />,
    install: <Download size={24} strokeWidth={2} />,
    brain: <Brain size={24} strokeWidth={2} />,
    flame: <Flame size={24} strokeWidth={2} />,
    wallet: <Wallet size={24} strokeWidth={2} />,
    mapPin: <MapPin size={24} strokeWidth={2} />,
    clock: <Clock size={24} strokeWidth={2} />,
    lock: <Lock size={24} strokeWidth={2} />,
    fileText: <FileText size={24} strokeWidth={2} />,
    clipboard: <ClipboardList size={24} strokeWidth={2} />,
    undo: <Undo2 size={24} strokeWidth={2} />,
    reset: <RotateCcw size={24} strokeWidth={2} />,
    replay: <Clapperboard size={24} strokeWidth={2} />,
    share: <Share2 size={24} strokeWidth={2} />,
    zap: <Zap size={24} strokeWidth={2} />,
    heatmap: <Thermometer size={24} strokeWidth={2} />,
    sound: <Volume2 size={24} strokeWidth={2} />,
    upload: <UploadCloud size={24} strokeWidth={2} />,
    sliders: <SlidersHorizontal size={24} strokeWidth={2} />,
    folder: <FolderOpen size={24} strokeWidth={2} />,
    save: <Save size={24} strokeWidth={2} />,
    bookmark: <Bookmark size={24} strokeWidth={2} />,
    flag: <Flag size={24} strokeWidth={2} />,
    grid: <LayoutGrid size={24} strokeWidth={2} />,
    refresh: <RefreshCw size={24} strokeWidth={2} />,
    checklist: <ListChecks size={24} strokeWidth={2} />,
    gauge: <Gauge size={24} strokeWidth={2} />,
    hub: <HomeIcon size={24} strokeWidth={2} />,
    userPlus: <UserPlus size={24} strokeWidth={2} />,
    news: <Newspaper size={24} strokeWidth={2} />,
    timer: <Timer size={24} strokeWidth={2} />,
    award: <TrophyIcon size={24} strokeWidth={2} />,
    chat: <MessageSquare size={24} strokeWidth={2} />,
    sparkles: <Sparkles size={24} strokeWidth={2} />
};

// Menu configurations for each world
export const MENU_CONFIGS = {
    'hub-home': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Quick Navigation'),
            createMenuItem.grid([
                {
                    label: 'Personal Assistant',
                    href: '/hub/personal-assistant',
                    icon: MenuIcons.brain
                },
                {
                    label: 'GTO Sandbox',
                    href: '/hub/personal-assistant/sandbox',
                    icon: MenuIcons.target
                },
                {
                    label: 'Leak Finder',
                    href: '/hub/personal-assistant/leaks',
                    icon: MenuIcons.flame
                },
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
                    hardNav: true,
                    icon: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="2" y="6" width="6" height="14" rx="1" fill="#8b5cf6" />
                            <rect x="9" y="3" width="6" height="17" rx="1" fill="#a78bfa" />
                            <rect x="16" y="6" width="6" height="14" rx="1" fill="#A78BFA" />
                        </svg>
                    )
                },
                {
                    label: 'Diamond Store',
                    href: '/hub/diamond-store',
                    icon: MenuIcons.store
                },
                // Friends has a permanent BottomNavBar tab, so the grid spends
                // its 8 slots on destinations the tab bar cannot reach.
                {
                    label: 'Messenger',
                    href: '/hub/messenger',
                    icon: MenuIcons.message
                }
            ]),
            createMenuItem.divider(),
            createMenuItem.section('Dealer Tools'),
            createMenuItem.navigation('♠ Toke Tracker', '/hub/toke-tracker'),
            createMenuItem.navigation('Work Schedule & Dealer Downs', '/hub/toke-tracker'),
            createMenuItem.navigation('◆ Set Monthly Goal', '/hub/toke-tracker/shift'),
            createMenuItem.divider(),
            createMenuItem.navigation('Reels', '/hub/reels', MenuIcons.video),
            createMenuItem.navigation('News', '/hub/news'),
            createMenuItem.navigation('Poker Near Me', '/hub/poker-near-me/lobby'),
            createMenuItem.navigation('Home Games', '/hub/home-games'),
            createMenuItem.navigation('Session History', '/hub/session-history'),
            createMenuItem.navigation('Odds Calculator', '/hub/poker-tools'),
            createMenuItem.divider(),
            createMenuItem.action('Customize My Hub', () => {
                // Preferred path: the page passes an openCardCustomizer handler
                // (pages/hub/index.js does).
                if (typeof handlers?.openCardCustomizer === 'function') {
                    handlers.openCardCustomizer();
                    return;
                }
                // Fallback so the item is never a silent no-op on other pages that
                // reuse the 'hub-home' menu: dispatch the app-wide bus event that
                // pages/hub/index.js already listens for ('hub-open-customizer').
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('hub-open-customizer'));
                }
            }),
            createMenuItem.navigation('Install App', '/hub/install')
        ],
        bottomLinks: [
            { label: 'Help and Support', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    // NOTE (menu audit): no page in the known codebase requests the 'training'
    // worldKey via getMenuConfig(). Left in place — unreferenced-by-the-known-pages,
    // needs a human to confirm before removal.
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
            createMenuItem.navigation('Training Library', '/hub/training', MenuIcons.training),
            createMenuItem.navigation('My Progress', '/hub/training/progress', MenuIcons.chart),
            createMenuItem.navigation('Leaderboard', '/hub/training/leaderboard', MenuIcons.trophy),
            createMenuItem.navigation('GTO Sandbox', '/hub/personal-assistant/sandbox', MenuIcons.target),
            createMenuItem.navigation('Leak Finder', '/hub/personal-assistant/leaks', MenuIcons.flame)
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
            // Label is 'Allow Friend Requests' (not 'Friend Requests') so it does not
            // collide with the 'Friend Requests' navigation item above it.
            createMenuItem.toggle(
                'Allow Friend Requests',
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

    // NOTE (menu audit): no page in the known codebase requests the 'diamond-store'
    // worldKey via getMenuConfig(). Left in place — unreferenced-by-the-known-pages,
    // needs a human to confirm before removal.
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
            createMenuItem.navigation('Account Settings', '/hub/settings?section=account', MenuIcons.settings),
            createMenuItem.navigation('Privacy & Security', '/hub/settings?section=privacy', MenuIcons.lock),
            createMenuItem.navigation('Notifications', '/hub/settings?section=notifications', MenuIcons.flag),
            createMenuItem.navigation('Display & Sound', '/hub/settings?section=display', MenuIcons.sliders),
            createMenuItem.navigation('Billing & Payments', '/hub/settings?section=billing', MenuIcons.wallet),
            createMenuItem.divider(),
            createMenuItem.section('Account Actions'),
            // Sign-out lives in bottomLinks only: HamburgerMenu owns handleLogout
            // (shared supabase client) and auto-appends a 'Log Out' row whenever no
            // sign-out item exists in menuItems or bottomLinks, deduping any
            // config-supplied row. So it can never be a no-op, and never doubles up.
            createMenuItem.navigation(
                'Delete Account',
                '/hub/settings?section=delete-account',
                MenuIcons.flag,
                null,
                null,
                { danger: true, id: 'delete-account' }
            )
        ],
        bottomLinks: [
            { label: 'Help & Support', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'bankroll-manager': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.action('Adjust Bankroll', handlers.onAdjustBankroll),
            createMenuItem.divider(),
            createMenuItem.section('Views'),
            createMenuItem.navigation('Dashboard', '/hub/bankroll-manager?view=dashboard'),
            createMenuItem.navigation('Log Session', '/hub/bankroll-manager?view=log-session'),
            createMenuItem.navigation('Trip Tracker', '/hub/bankroll-manager?view=trips'),
            createMenuItem.navigation('Reports', '/hub/bankroll-manager?view=reports'),
            createMenuItem.navigation('Saved Receipts', '/hub/bankroll-manager?view=receipts'),
            createMenuItem.divider(),
            createMenuItem.section('Game Types'),
            createMenuItem.navigation('Cash Games', '/hub/bankroll-manager?type=cash'),
            createMenuItem.navigation('Tournaments', '/hub/bankroll-manager?type=tournament'),
            createMenuItem.navigation('Table Games', '/hub/bankroll-manager?type=casino'),
            createMenuItem.navigation('Slots', '/hub/bankroll-manager?type=slots'),
            createMenuItem.navigation('Sports Betting', '/hub/bankroll-manager?type=sports'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Display EUR', state.currencyEUR || false, handlers.setCurrencyEUR, 'Show amounts in Euros'),
            createMenuItem.toggle('Auto-Save', state.autoSave !== false, handlers.setAutoSave),
            createMenuItem.toggle('Notifications', state.notifications !== false, handlers.setNotifications),
            createMenuItem.navigation('Bankroll Rules', '/hub/bankroll-manager?view=rules'),
            createMenuItem.navigation('Goals', '/hub/bankroll-manager?view=goals'),
            createMenuItem.navigation('Manage Venues & Settings', '/hub/bankroll-manager?view=settings'),
            createMenuItem.navigation('Export Data', '/hub/bankroll-manager/export')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'poker-near-me': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.action('Search Poker Near Me', () => handlers?.openGlobalSearch?.(), null, true, true),
            createMenuItem.divider(),
            createMenuItem.section('Browse'),
            createMenuItem.navigation('Venues', '/hub/poker-near-me/venues'),
            createMenuItem.navigation('Events', '/hub/poker-near-me/events'),
            createMenuItem.navigation('Live Games', '/hub/poker-near-me/live-games'),
            createMenuItem.navigation('Map View', '/hub/poker-near-me/map'),
            createMenuItem.navigation('Saved', '/hub/poker-near-me/saved'),
            createMenuItem.divider(),
            createMenuItem.section('More Tools'),
            // Game Trends / Peak Activity / Compare Venues are lobby pods — the only
            // place GameTrendsDashboard, PeakActivityHeatmap and VenueCompare are
            // mounted. They are NOT More-tab sub-tabs (MORE_SUB_TABS in
            // pages/hub/poker-near-me/[pnmTab].js is overview/roadtrip/social/alerts/
            // nearmenow/tripcost), so the old '/more?feature=' links landed on the
            // More overview with the param silently stripped by that page's deep-link
            // writer. The lobby reads ?pod= on mount (POD_FEATURES) and preserves it
            // in its own URL write-back.
            // hardNav: true is required, not cosmetic. This menu is rendered BY the
            // lobby (lobby.js builds getMenuConfig('poker-near-me')), and the lobby's
            // ?pod= reader is a mount-only effect with a [] dep list that reads
            // window.location.search — nothing there watches router.query. A <Link>
            // click from the lobby to the lobby with a different query string is a
            // same-route client transition: the page component never unmounts, the
            // reader never re-runs, and the item is a dead click. A real document
            // load remounts the page so the pod panel actually opens. Same reason the
            // club-arena deep links below opt in.
            createMenuItem.navigation('Game Trends', '/hub/poker-near-me/lobby?pod=gametrends', null, null, null, { hardNav: true }),
            createMenuItem.navigation('Peak Activity', '/hub/poker-near-me/lobby?pod=peakheatmap', null, null, null, { hardNav: true }),
            createMenuItem.navigation('Compare Venues', '/hub/poker-near-me/lobby?pod=compare', null, null, null, { hardNav: true }),
            createMenuItem.navigation('Trip Cost Calculator', '/hub/poker-near-me/roadtrip'),
            createMenuItem.navigation('Game Alerts', '/hub/poker-near-me/alerts'),
            createMenuItem.divider(),
            createMenuItem.section('Help'),
            createMenuItem.action('Replay Tutorial', () => handlers?.replayTutorial?.(), null, false, true),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Geofence Alerts', state.geofenceAlerts !== false, handlers.setGeofenceAlerts, 'Get Notified When Near Poker Venues'),
            createMenuItem.toggle('Location Services', state.locationEnabled !== false, handlers.setLocationEnabled),
            createMenuItem.toggle('Show Newcomer-Friendly', state.showNewcomerFriendly !== false, handlers.setShowNewcomerFriendly)
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'video-library': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Browse'),
            createMenuItem.navigation('All Videos', '/hub/video-library'),
            createMenuItem.navigation('Cash Games', '/hub/video-library?type=cash'),
            createMenuItem.navigation('Tournaments', '/hub/video-library?type=tournament'),
            createMenuItem.divider(),
            createMenuItem.section('Sources'),
            createMenuItem.navigation('Hustler Casino Live', '/hub/video-library?source=HCL'),
            createMenuItem.navigation('The Lodge', '/hub/video-library?source=LODGE'),
            createMenuItem.navigation('Triton Poker', '/hub/video-library?source=TRITON'),
            createMenuItem.navigation('Live at the Bike', '/hub/video-library?source=LATB'),
            createMenuItem.navigation('TCH Live', '/hub/video-library?source=TCH'),
            createMenuItem.navigation('WSOP', '/hub/video-library?source=WSOP'),
            createMenuItem.navigation('WPT', '/hub/video-library?source=WPT'),
            createMenuItem.divider(),
            createMenuItem.section('My Library'),
            createMenuItem.navigation('Favorites', '/hub/video-library?filter=favorites'),
            createMenuItem.navigation('Watch History', '/hub/video-library?filter=history'),
            createMenuItem.navigation('Watch Later', '/hub/video-library?filter=watchlater'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Autoplay', state.autoplay !== false, handlers.setAutoplay),
            createMenuItem.toggle('HD Quality', state.hdQuality !== false, handlers.setHdQuality),
            createMenuItem.toggle('Captions', state.captions || false, handlers.setCaptions)
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'diamond-arena': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Game Modes'),
            createMenuItem.navigation('Cash Games', '/hub/diamond-arena?mode=cash'),
            createMenuItem.navigation('Tournaments', '/hub/diamond-arena?mode=tournament'),
            createMenuItem.navigation('Sit & Go', '/hub/diamond-arena?mode=sng'),
            createMenuItem.divider(),
            createMenuItem.section('My Arena'),
            createMenuItem.navigation('Active Tables', '/hub/diamond-arena?filter=active'),
            createMenuItem.navigation('Tournament Schedule', '/hub/diamond-arena/schedule'),
            createMenuItem.navigation('Leaderboard', '/hub/diamond-arena/leaderboard'),
            createMenuItem.navigation('My Stats', '/hub/diamond-arena/stats'),
            createMenuItem.navigation('Hand History', '/hub/diamond-arena/history'),
            createMenuItem.divider(),
            createMenuItem.section('Diamond Store'),
            createMenuItem.navigation('Buy Diamonds', '/hub/diamond-store?category=diamonds'),
            createMenuItem.navigation('VIP Benefits', '/hub/diamond-store?category=vip'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Sound Effects', state.soundEffects !== false, handlers.setSoundEffects),
            createMenuItem.toggle('Animations', state.animations !== false, handlers.setAnimations),
            createMenuItem.toggle('Auto-Rebuy', state.autoRebuy || false, handlers.setAutoRebuy),
            createMenuItem.navigation('Table Preferences', '/hub/settings?section=table')
        ],
        bottomLinks: [
            { label: 'Help & Rules', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'trivia': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Game Modes'),
            createMenuItem.navigation('Daily Challenge', '/hub/trivia?mode=daily'),
            createMenuItem.navigation('Quick Play', '/hub/trivia?mode=quick'),
            createMenuItem.navigation('Practice Mode', '/hub/trivia?mode=practice'),
            createMenuItem.divider(),
            createMenuItem.section('My Progress'),
            createMenuItem.navigation('Leaderboard', '/hub/trivia/leaderboard'),
            createMenuItem.navigation('My Stats', '/hub/trivia/stats'),
            createMenuItem.navigation('Achievements', '/hub/trivia/achievements'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Sound Effects', state.soundEffects !== false, handlers.setSoundEffects),
            createMenuItem.toggle('Timer', state.timerEnabled !== false, handlers.setTimerEnabled),
            createMenuItem.toggle('Hints', state.hintsEnabled || false, handlers.setHintsEnabled),
            createMenuItem.navigation('Difficulty', '/hub/trivia/settings')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'news': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Browse'),
            createMenuItem.navigation('All News', '/hub/news'),
            createMenuItem.navigation('Videos', '/hub/news?tab=videos'),
            createMenuItem.navigation('Reels', '/hub/news?tab=reels'),
            createMenuItem.navigation('Events', '/hub/news?tab=events'),
            createMenuItem.divider(),
            createMenuItem.section('Sources'),
            createMenuItem.navigation('PokerNews', '/hub/news?source=pokernews'),
            createMenuItem.navigation('CardPlayer', '/hub/news?source=cardplayer'),
            createMenuItem.navigation('WSOP', '/hub/news?source=wsop'),
            createMenuItem.navigation('WPT', '/hub/news?source=wpt'),
            createMenuItem.navigation('MSPT', '/hub/news?source=mspt'),
            createMenuItem.divider(),
            createMenuItem.section('My Feed'),
            createMenuItem.navigation('Bookmarks', '/hub/news?filter=bookmarks'),
            createMenuItem.navigation('Read Later', '/hub/news?filter=later'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Push Notifications', state.pushNotifications || false, handlers.setPushNotifications),
            createMenuItem.toggle('Email Digest', state.emailDigest || false, handlers.setEmailDigest),
            createMenuItem.navigation('Manage Sources', '/hub/news/sources')
        ],
        bottomLinks: [
            { label: 'Hub', href: '/hub', icon: MenuIcons.home },
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),




    'sandbox': (user, state, handlers) => {
        const gridItems1 = [
            { label: `Quiz ${state.quizMode ? 'ON' : 'OFF'}`, onClick: handlers.onToggleQuiz, icon: MenuIcons.checklist },
            { label: `Coach ${state.coachMode ? 'ON' : 'OFF'}`, onClick: handlers.onToggleCoach, icon: MenuIcons.brain },
            { label: 'Ranges', onClick: handlers.onRanges, icon: MenuIcons.grid },
            { label: 'Villains', onClick: handlers.onVillains, icon: MenuIcons.users },
        ];

        // 3-across keeps the tile row square-ish at 375px and avoids the
        // orphaned half-width tile the 2-column layout always produced.
        const gridItems2 = [
            { label: 'Undo', onClick: handlers.onUndo, icon: MenuIcons.undo },
            { label: 'Reset', onClick: handlers.onReset, icon: MenuIcons.reset },
            { label: 'Replay', onClick: handlers.onReplay, icon: MenuIcons.replay },
        ];

        if (state.hasResults) {
            gridItems2.push({ label: 'Results', onClick: handlers.onResults, icon: MenuIcons.chart });
            gridItems2.push({ label: 'Share', onClick: handlers.onShare, icon: MenuIcons.share });
            gridItems2.push({ label: 'Report', onClick: handlers.onReport, icon: MenuIcons.fileText });
        }

        return {
            menuItems: [
                createMenuItem.section('Tools'),
                createMenuItem.grid(gridItems1),

                createMenuItem.section('Actions'),
                createMenuItem.grid(gridItems2, 3),

                createMenuItem.section('Study'),
                createMenuItem.action('Import Hand History', handlers.onImportHH, MenuIcons.upload),
                createMenuItem.action('Leak Stats', handlers.onLeakStats, MenuIcons.flame),
                createMenuItem.action('Session Analytics', handlers.onAnalytics, MenuIcons.chart),
                createMenuItem.action('Share Scenario', handlers.onShareScenario, MenuIcons.share),
                createMenuItem.navigation('Leak Finder', '/hub/personal-assistant/leaks', MenuIcons.flame),

                createMenuItem.section('Saves & Lore'),
                createMenuItem.action(
                    state.saveStatus === 'saving' ? 'Saving...' : state.saveStatus === 'saved' ? 'Saved' : 'Save Session',
                    handlers.onSave, MenuIcons.save, false, false
                ),
                createMenuItem.action('Sessions', handlers.onSessions, MenuIcons.clock),
                createMenuItem.action('Folders', handlers.onFolders, MenuIcons.folder),
                createMenuItem.action(`Log (${state.sessionLogCount || 0})`, handlers.onLog, MenuIcons.clipboard),
                createMenuItem.action('Templates', handlers.onTemplates, MenuIcons.bookmark),
                // onSaveTemplate opens the naming prompt in sandbox.js — never
                // call saveAsTemplate() bare, it takes a name argument.
                createMenuItem.action('Save as Template', handlers.onSaveTemplate, MenuIcons.save),
                createMenuItem.action('Save Spot', handlers.onSaveSpot, MenuIcons.bookmark),
                createMenuItem.action('Session Report', handlers.onReport, MenuIcons.fileText),

                createMenuItem.section('Pro Features'),
                // God Mode injects fabricated solver output, so it is dev-only.
                // It used to render unconditionally: every production player saw a
                // 'God Mode' row that GodModePanel then refused — advertising an
                // admin tool and dead-ending on it.
                //
                // This matches what hasGodModeAccess() in GodModePanel.jsx actually
                // does for the callers that exist today: nothing on this surface
                // supplies a server-verified admin flag, so the panel's `isAdmin`
                // prop is always undefined and its decision reduces to
                // NODE_ENV !== 'production'. Gating the row on the same single
                // condition keeps the row and the panel in agreement instead of
                // branching on a `state.isAdmin` key no caller sets.
                //
                // If a server-verified admin flag ever lands, wire it BOTH here
                // (via the getMenuConfig state object in sandbox.js) and into the
                // <GodModePanel isAdmin={...}> prop — changing only one side
                // re-creates the dead-end row this replaced. The panel's own check
                // stays as defence in depth: hiding a menu row is not a security
                // boundary.
                ...(process.env.NODE_ENV !== 'production'
                    ? [
                        createMenuItem.action('God Mode', handlers.onGodMode, MenuIcons.zap),
                    ] : []),
                createMenuItem.action('Pro Import', handlers.onProImport, MenuIcons.upload),
                createMenuItem.action('Custom Spot', handlers.onCustomSpot, MenuIcons.sliders),
                createMenuItem.action('Quick Drill', handlers.onDrill, MenuIcons.timer),
                createMenuItem.toggle('Equity Heatmap', state.showHeatmap, handlers.onToggleHeatmap, 'Overlay board equity on the felt', MenuIcons.heatmap),
                createMenuItem.toggle('Node Locks', state.showNodeLocks, handlers.onToggleNodeLocks, 'Lock villain frequencies to exploit them', MenuIcons.lock),
                createMenuItem.toggle('Sound', state.soundEnabled, handlers.onToggleSound, 'Card, chip and coach audio', MenuIcons.sound),
            ],
            bottomLinks: [
                { id: 'tutorial', label: 'Play Tutorial', icon: MenuIcons.help, onClick: handlers.onPlayTutorial, action: true },
                { label: 'Leak Finder', href: '/hub/personal-assistant/leaks', icon: MenuIcons.flame },
                { label: 'PA Hub', href: '/hub/personal-assistant', icon: MenuIcons.brain },
                { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings },
                { label: 'Help', href: '/hub/help', icon: MenuIcons.help },
                { label: 'World Hub', href: '/hub', icon: MenuIcons.home }
            ]
        };
    },

    // ── Personal Assistant hub ────────────────────────────────────────────────
    'personal-assistant': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Coach Tools'),
            createMenuItem.grid([
                { label: 'GTO Sandbox', href: '/hub/personal-assistant/sandbox', icon: MenuIcons.target },
                { label: 'Leak Finder', href: '/hub/personal-assistant/leaks', icon: MenuIcons.flame },
                { label: 'Training', href: '/hub/training', icon: MenuIcons.training },
                { label: 'Preflop Charts', href: '/hub/preflop-charts', icon: MenuIcons.grid },
                { label: 'Session History', href: '/hub/session-history', icon: MenuIcons.clock },
                { label: 'Bankroll', href: '/hub/bankroll-manager', icon: MenuIcons.wallet },
            ]),

            createMenuItem.section('Ask Jarvis'),
            createMenuItem.action('Open Jarvis Chat', handlers?.onOpenJarvis, MenuIcons.chat),
            createMenuItem.navigation('Odds Calculator', '/hub/poker-tools', MenuIcons.calculator),
            createMenuItem.navigation('Video Library', '/hub/video-library', MenuIcons.video),

            createMenuItem.section('Progress'),
            createMenuItem.navigation('My Progress', '/hub/training/progress', MenuIcons.chart),
            createMenuItem.navigation('Leaderboard', '/hub/training/leaderboard', MenuIcons.trophy),
            createMenuItem.navigation('World Hub', '/hub', MenuIcons.home)
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    // ── Leak Finder ───────────────────────────────────────────────────────────
    // Single-page surface: the "Views" entries switch tab / scroll to a section
    // rather than navigating, so they are actions driven by handlers the page
    // supplies. EVERY row below has a real producer in leaks.js — rows whose
    // handler is missing are omitted entirely rather than rendered dead.
    'leaks': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Views'),
            ...(handlers?.onViewOverview
                ? [createMenuItem.action('Overview', handlers.onViewOverview, MenuIcons.gauge)]
                : []),
            ...(handlers?.onViewLeaks
                ? [createMenuItem.action(
                    state?.leakCount ? `Detected Leaks (${state.leakCount})` : 'Detected Leaks',
                    handlers.onViewLeaks, MenuIcons.flame,
                )]
                : []),
            ...(handlers?.onViewAnalytics
                ? [createMenuItem.action('Insights & Analytics', handlers.onViewAnalytics, MenuIcons.chart)]
                : []),

            createMenuItem.section('Actions'),
            ...(handlers?.onRescan
                ? [createMenuItem.action(
                    state?.isDetecting ? 'Detection Running…' : 'Re-run Detection',
                    handlers.onRescan, MenuIcons.refresh,
                )]
                : []),
            ...(handlers?.onPracticeWorst
                ? [createMenuItem.action('Practice Worst Leak', handlers.onPracticeWorst, MenuIcons.target)]
                : []),

            ...(handlers?.onToggleResolved
                ? [
                    createMenuItem.section('Filters'),
                    createMenuItem.toggle('Show Resolved', !!state?.showResolved, handlers.onToggleResolved,
                        'Include leaks you have already fixed', MenuIcons.checklist),
                ]
                : []),

            createMenuItem.section('Navigation'),
            createMenuItem.navigation('GTO Sandbox', '/hub/personal-assistant/sandbox', MenuIcons.target),
            createMenuItem.navigation('PA Hub', '/hub/personal-assistant', MenuIcons.brain),
            createMenuItem.navigation('Session History', '/hub/session-history', MenuIcons.clock),
            createMenuItem.navigation('World Hub', '/hub', MenuIcons.home)
        ],
        bottomLinks: [
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings },
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'preflop-charts': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Training Modes'),
            createMenuItem.navigation('Speed Drill', '/hub/preflop-charts?mode=speed-drill'),
            createMenuItem.navigation('Pressure Cooker', '/hub/preflop-charts?mode=pressure-cooker'),
            createMenuItem.navigation('Pattern Recognition', '/hub/preflop-charts?mode=pattern'),
            createMenuItem.navigation('Mixed Strategy', '/hub/preflop-charts?mode=mixed'),
            createMenuItem.divider(),
            createMenuItem.section('Progress'),
            createMenuItem.navigation('Leaderboard', '/hub/preflop-charts/leaderboard'),
            createMenuItem.navigation('My Stats', '/hub/preflop-charts/stats'),
            createMenuItem.navigation('Achievements', '/hub/preflop-charts/achievements'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Sound Effects', state.soundEffects !== false, handlers.setSoundEffects),
            createMenuItem.toggle('Keyboard Shortcuts', state.keyboardShortcuts !== false, handlers.setKeyboardShortcuts),
            createMenuItem.toggle('Show Timer', state.showTimer !== false, handlers.setShowTimer),
            createMenuItem.toggle('Visual Hints', state.visualHints || false, handlers.setVisualHints),
            createMenuItem.divider(),
            createMenuItem.navigation('How to Play', '/hub/preflop-charts/tutorial'),
            createMenuItem.navigation('GTO Training', '/hub/training')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'avatars': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Avatar Options'),
            // 'Create New' pointed at the identical href — one row, not two.
            createMenuItem.navigation('My Avatars', '/hub/avatars', MenuIcons.users),
            createMenuItem.divider(),
            createMenuItem.section('Quick Navigation'),
            createMenuItem.navigation('Profile', '/hub/profile', MenuIcons.users),
            createMenuItem.navigation('Settings', '/hub/settings', MenuIcons.settings)
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'profile': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Profile'),
            createMenuItem.navigation('View Profile', '/hub/profile'),
            createMenuItem.navigation('Edit Profile', '/hub/profile-edit'),
            createMenuItem.navigation('My Avatars', '/hub/avatars'),
            createMenuItem.divider(),
            createMenuItem.section('Activity'),
            createMenuItem.navigation('My Posts', '/hub/social-media'),
            createMenuItem.navigation('My Friends', '/hub/friends'),
            createMenuItem.navigation('Notifications', '/hub/notifications'),
            createMenuItem.navigation('Odds Calculator', '/hub/poker-tools'),
            createMenuItem.navigation('Personal Assistant', '/hub/personal-assistant'),
            createMenuItem.divider(),
            createMenuItem.section('Work'),
            createMenuItem.navigation('Work Schedule & Dealer Downs', '/hub/toke-tracker', MenuIcons.schedule),
            createMenuItem.navigation('Link to a Venue', '/hub/my-venues', MenuIcons.mapPin),
            createMenuItem.divider(),
            { type: 'action', id: 'invite-friends', label: 'Invite Friends', openInviteModal: true, closeOnClick: false, icon: MenuIcons.userPlus },
            createMenuItem.navigation('Install App', '/hub/install', MenuIcons.install)
        ],
        bottomLinks: [
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    // NOTE (menu audit): no page in the known codebase requests the 'social'
    // worldKey via getMenuConfig(). Left in place — unreferenced-by-the-known-pages,
    // needs a human to confirm before removal.
    'social': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Social Hub'),
            createMenuItem.navigation('Feed', '/hub/social-media', MenuIcons.message),
            createMenuItem.navigation('Friends', '/hub/friends', MenuIcons.users),
            createMenuItem.navigation('Messenger', '/hub/messenger', MenuIcons.chat),
            createMenuItem.navigation('Reels', '/hub/reels', MenuIcons.video),
            createMenuItem.divider(),
            createMenuItem.section('Content'),
            createMenuItem.navigation('News', '/hub/news', MenuIcons.news),
            createMenuItem.navigation('Lives', '/hub/lives', MenuIcons.video),
            createMenuItem.navigation('Video Library', '/hub/video-library', MenuIcons.video),
            createMenuItem.navigation('Odds Calculator', '/hub/poker-tools', MenuIcons.calculator),
            createMenuItem.divider(),
            createMenuItem.section('Club Pages'),
            // When a club page exists, 'My Club Page' already resolves to the
            // club-pages view — a second identical row was pure duplication.
            createMenuItem.navigation(
                state.clubPageCreated ? 'My Club Page' : 'Add Club Page',
                state.clubPageCreated ? '/hub/social-media?view=club-pages' : '/hub/social-media?createPage=true',
                MenuIcons.grid
            ),
            ...(state.clubPageCreated
                ? []
                : [createMenuItem.navigation('Browse Club Pages', '/hub/social-media?view=club-pages', MenuIcons.grid)]),
            createMenuItem.divider(),
            { type: 'action', id: 'invite-friends', label: 'Invite Friends', openInviteModal: true, closeOnClick: false, icon: MenuIcons.userPlus },
            createMenuItem.navigation('Install App', '/hub/install', MenuIcons.install)
        ],
        bottomLinks: [
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    'notifications': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Notifications'),
            createMenuItem.navigation('All', '/hub/notifications'),
            createMenuItem.navigation('Mentions', '/hub/notifications?filter=mentions'),
            createMenuItem.navigation('Friend Requests', '/hub/notifications?filter=friends'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            // Master push switch. The page writes it across every category column in
            // user_notification_preferences, which pages/api/notifications/send.js reads
            // to filter recipients — so turning it off genuinely stops delivery.
            // Per-category control lives in Settings (linked below).
            createMenuItem.toggle(
                'Push Notifications',
                state.pushEnabled !== false,
                handlers.setPushEnabled,
                'Turns off every push category. Fine-tune them in Settings.'
            )
            // 'Email Notifications' removed: nothing in this codebase sends
            // preference-gated email, so the toggle could only ever store a value that
            // no sender consulted. Re-add it together with a real email fan-out that
            // reads user_notification_preferences.
        ],
        bottomLinks: [
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    'tournaments': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Tournaments'),
            createMenuItem.navigation('Daily Tournaments', '/hub/daily-tournaments'),
            createMenuItem.navigation('Events Calendar', '/hub/events-calendar'),
            createMenuItem.navigation('Leaderboards', '/hub/leaderboards'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Poker Near Me', '/hub/poker-near-me/lobby'),
            createMenuItem.navigation('Home Games', '/hub/home-games'),
            createMenuItem.navigation('Promotions', '/hub/promotions')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'leaderboards': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Leaderboards'),
            createMenuItem.navigation('Overall', '/hub/leaderboards'),
            createMenuItem.navigation('Weekly', '/hub/leaderboards?period=weekly'),
            createMenuItem.navigation('Monthly', '/hub/leaderboards?period=monthly'),
            createMenuItem.divider(),
            createMenuItem.section('Categories'),
            createMenuItem.navigation('Training', '/hub/leaderboards?category=training'),
            createMenuItem.navigation('Tournaments', '/hub/leaderboards?category=tournaments'),
            createMenuItem.navigation('Social', '/hub/leaderboards?category=social')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'events': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Events'),
            createMenuItem.navigation('Calendar', '/hub/events-calendar'),
            createMenuItem.navigation('Upcoming', '/hub/events-calendar?view=upcoming'),
            createMenuItem.navigation('Past Events', '/hub/events-calendar?view=past'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Daily Tournaments', '/hub/daily-tournaments'),
            createMenuItem.navigation('Promotions', '/hub/promotions')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'promotions': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Promotions'),
            createMenuItem.navigation('All Promotions', '/hub/promotions'),
            // Normalized to the canonical param used by the diamond-store and
            // diamond-arena configs (?category=vip); ?tab=vip landed unfiltered.
            createMenuItem.navigation('VIP Offers', '/hub/diamond-store?category=vip'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Diamond Store', '/hub/diamond-store'),
            createMenuItem.navigation('Events', '/hub/events-calendar')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'toke-tracker': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Toke Tracker'),
            createMenuItem.navigation('Dashboard', '/hub/toke-tracker', MenuIcons.home),
            createMenuItem.navigation('Shift Tracker', '/hub/toke-tracker/shift', MenuIcons.timer),
            createMenuItem.navigation('Analytics', '/hub/toke-tracker/analytics', MenuIcons.chart),
            createMenuItem.navigation('Dealer Vault', '/hub/toke-tracker/vault', MenuIcons.lock),
            createMenuItem.navigation('Tax Summary & Export', '/hub/toke-tracker/vault?tab=tax', MenuIcons.fileText),
            createMenuItem.navigation('Venue Intel', '/hub/toke-tracker/venues', MenuIcons.mapPin),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Shift Notifications',
                state.shiftNotifications !== false,
                handlers.setShiftNotifications,
                'Get alerts when shifts start/end'
            ),
            createMenuItem.toggle(
                'Auto-Save Shifts',
                state.autoSaveShifts !== false,
                handlers.setAutoSaveShifts,
                'Automatically save shift data'
            ),
            createMenuItem.toggle(
                'Down Timer Alerts',
                state.downTimerAlerts !== false,
                handlers.setDownTimerAlerts,
                '35-min down timer notifications'
            ),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Bankroll Manager', '/hub/bankroll-manager', MenuIcons.wallet),
            createMenuItem.navigation('Poker Near Me', '/hub/poker-near-me/lobby', MenuIcons.mapPin),
            createMenuItem.navigation('World Hub', '/hub', MenuIcons.home)
        ],
        bottomLinks: [
            { label: 'Help & Support', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),



    'help': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Help Center'),
            createMenuItem.navigation('FAQ', '/hub/help', MenuIcons.help),
            createMenuItem.navigation('Contact Support', '/hub/help#contact', MenuIcons.chat),
            // 'Report Issue' removed: ReportBugWidget is rendered inline in
            // every drawer, so the row was a duplicate path to the same flow.
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Settings', '/hub/settings', MenuIcons.settings),
            createMenuItem.navigation('Home', '/hub', MenuIcons.home)
        ],
        bottomLinks: []
    }),

    'article': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Article'),
            createMenuItem.navigation('Back to News', '/hub/news'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Social Hub', '/hub/social-media'),
            createMenuItem.navigation('Home', '/hub')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    // NOTE (menu audit): no Next.js page in the known codebase requests the
    // 'club-arena' worldKey via getMenuConfig() — but Club Arena is a separate SPA
    // served statically from public/hub/club-arena via a rewrite, and may consume
    // this config itself. Left in place — unreferenced-by-the-known-pages, needs a
    // human to confirm before removal.
    'club-arena': (user, state, handlers) => ({
        menuItems: [
            // Club Arena is a getServerSideProps SPA: EVERY href below needs a
            // full document load, not a client-side Next.js transition.
            createMenuItem.section('Club Navigation'),
            createMenuItem.navigation('My Clubs', '/hub/club-arena', MenuIcons.grid, null, null, { hardNav: true }),
            createMenuItem.navigation('Find Clubs', '/hub/club-arena#find', MenuIcons.users, null, null, { hardNav: true }),
            createMenuItem.navigation('Create Club', '/hub/club-arena#create', MenuIcons.userPlus, null, null, { hardNav: true }),
            createMenuItem.divider(),
            createMenuItem.section('Game Modes'),
            createMenuItem.navigation('Cash Games', '/hub/club-arena?mode=cash', MenuIcons.spade, null, null, { hardNav: true }),
            createMenuItem.navigation('Tournaments', '/hub/club-arena?mode=tournament', MenuIcons.trophy, null, null, { hardNav: true }),
            createMenuItem.navigation('Sit & Go', '/hub/club-arena?mode=sng', MenuIcons.timer, null, null, { hardNav: true }),
            createMenuItem.navigation('Spin-It', '/hub/club-arena?mode=spin', MenuIcons.refresh, null, null, { hardNav: true }),
            createMenuItem.divider(),
            createMenuItem.section('Club Features'),
            createMenuItem.navigation('Messages', '/hub/club-arena/messages'),
            createMenuItem.navigation('Players', '/hub/club-arena/players'),
            createMenuItem.navigation('Cashier', '/hub/club-arena/cashier'),
            createMenuItem.navigation('Leaderboard', '/hub/club-arena/leaderboard'),
            // Route names below must match the club-arena SPA's own router.
            // 'hand-history' is singular there — '/hand-histories' was a dead link.
            createMenuItem.navigation('Hand Histories', '/hub/club-arena/hand-history'),
            // The SPA has no '/player-stats' route; '/player-sessions' is the closest
            // real one (per-player session results), so this points there instead.
            createMenuItem.navigation('Player Stats', '/hub/club-arena/player-sessions'),
            createMenuItem.divider(),
            // Show Midway Union application option if:
            // - User is a club owner (state.isClubOwner)
            // - Their active club is NOT already in a union (state.clubInUnion === false)
            // - unionApplicationStatus === 'approved' short-circuits the whole block:
            //   it previously rendered an empty 'Midway Union' section header with no
            //   items under it.
            ...(state.isClubOwner && state.clubInUnion === false && state.unionApplicationStatus !== 'approved' ? [
                createMenuItem.section('Midway Union'),
                ...(state.unionApplicationStatus === 'pending' ? [
                    createMenuItem.action(
                        'Union Application Pending',
                        handlers.onViewApplicationStatus,
                        MenuIcons.clock, false, true
                    ),
                ] : state.unionApplicationStatus === 'approved' ? [] : [
                    createMenuItem.action(
                        'Apply to Midway Union',
                        handlers.onApplyToUnion,
                        MenuIcons.award, true, true
                    ),
                ]),
                createMenuItem.divider(),
            ] : []),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Sound Effects',
                state.soundEffects !== false,
                handlers.setSoundEffects
            ),
            createMenuItem.toggle(
                'Notifications',
                state.notifications !== false,
                handlers.setNotifications
            ),
            createMenuItem.toggle(
                'Auto-Rebuy',
                state.autoRebuy || false,
                handlers.setAutoRebuy
            ),
            createMenuItem.toggle(
                'Show Table Previews',
                state.tablePreview !== false,
                handlers.setTablePreview,
                'See table cards before joining'
            ),
            createMenuItem.toggle(
                'Compact View',
                state.compactView || false,
                handlers.setCompactView
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Table Preferences', '/hub/settings?section=table'),
            createMenuItem.navigation('Privacy Settings', '/hub/settings?section=privacy')
        ],
        bottomLinks: [
            { label: 'Help & Rules', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Home', href: '/hub', icon: MenuIcons.home }
        ]
    }),

    // NOTE (menu audit): no page in the known codebase requests the 'lives'
    // worldKey via getMenuConfig(). Left in place — unreferenced-by-the-known-pages,
    // needs a human to confirm before removal.
    'lives': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Live Streams'),
            createMenuItem.navigation('Live Now', '/hub/lives'),
            createMenuItem.navigation('Upcoming', '/hub/lives?filter=upcoming'),
            createMenuItem.navigation('Past Streams', '/hub/lives?filter=past'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Reels', '/hub/reels'),
            createMenuItem.navigation('Social Hub', '/hub/social-media')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    })
};

// Identity-based de-duplication. Never match on user-facing copy — it breaks
// the moment a label is reworded or localized.
const hasItemWithId = (list, id) => (list || []).some((i) => i?.id === id);

/**
 * Helper to get menu config for a specific world.
 * An unknown worldKey falls back to the universal hub menu rather than
 * returning an empty drawer (the "never a blank screen" rule).
 */
export function getMenuConfig(worldKey, user, state = {}, handlers = {}) {
    const config = MENU_CONFIGS[worldKey] || MENU_CONFIGS['hub-home'];
    if (!MENU_CONFIGS[worldKey] && process.env.NODE_ENV !== 'production') {
        console.warn(`No menu config found for world: ${worldKey} — falling back to hub-home`);
    }
    const result = config(user, state, handlers) || {};
    const menuItems = result.menuItems || [];
    let bottomLinks = result.bottomLinks || [];

    // Inject "Invite Friends" into bottomLinks for logged-in users, unless the
    // config already surfaces it somewhere.
    if (user) {
        const alreadyHasReferral =
            hasItemWithId(menuItems, 'invite-friends') ||
            hasItemWithId(bottomLinks, 'invite-friends') ||
            menuItems.some((i) => i?.openInviteModal) ||
            bottomLinks.some((l) => l?.openInviteModal);
        if (!alreadyHasReferral) {
            const referralItem = {
                id: 'invite-friends',
                label: 'Invite Friends',
                action: true,
                openInviteModal: true,
                icon: MenuIcons.userPlus,
            };
            // Place it above Settings when present; otherwise append.
            const settingsIdx = bottomLinks.findIndex((l) => l?.label === 'Settings');
            bottomLinks = settingsIdx >= 0
                ? [...bottomLinks.slice(0, settingsIdx), referralItem, ...bottomLinks.slice(settingsIdx)]
                : [...bottomLinks, referralItem];
        }
    }

    return { ...result, menuItems, bottomLinks };
}
