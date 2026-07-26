/**
 * SMARTERPOKER LAYOUT (SHELL)
 * Main shell component with Navigation, Chat Dock, and Responsive Grid
 * Uses real authenticated user data from SupabaseProvider
 */

import React, { useState, useEffect } from 'react';
import { SP_COLORS, SPAvatar } from './SmarterPokerStyleCard';
import { NotificationBell, NotificationsDropdown } from './SmarterPokerNotifications';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import { useRouter } from 'next/router';
import { useUnreadCount, UnreadBadge } from '../../hooks/useUnreadCount';
import { eventBus, EventType } from '../../engine/EventBus';
import { SocialErrorBoundary } from './SocialErrorBoundary';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NAVIGATION BAR
// ═══════════════════════════════════════════════════════════════════════════

const SPNavBar = ({
    currentUser,
    notifications = [],
    unreadNotifCount = 0,
    onSearch,
    onNavigate
}) => {
    const [showNotifs, setShowNotifs] = useState(false);
    const [showMessenger, setShowMessenger] = useState(false);
    
    // Wire into the global unread count state
    const { unreadCount } = useUnreadCount();

    return (
        <nav className="sp-navbar">
            {/* left: Logo + Search */}
            <div className="sp-nav-left">
                <div className="sp-logo" onClick={() => onNavigate?.('/app')} style={{ cursor: 'pointer' }}>
                    <span className="logo-icon">&#x1F0CF;</span>
                </div>
                <div className="sp-search">
                    <span className="search-icon">&#x1F50D;</span>
                    <input
                        type="text"
                        placeholder="Search Smarter Poker"
                        onChange={(e) => onSearch?.(e.target.value)}
                    />
                </div>
            </div>

            {/* Center: Navigation Tabs */}
            <div className="sp-nav-center">
                <button
                    className="sp-nav-tab active"
                    title="Home"
                    onClick={() => onNavigate?.('/app/social')}
                >
                    <span className="tab-icon">&#x1F3E0;</span>
                </button>
                <button
                    className="sp-nav-tab"
                    title="Watch"
                    onClick={() => onNavigate?.('/app/watch')}
                >
                    <span className="tab-icon">&#x1F4FA;</span>
                </button>
                <button
                    className="sp-nav-tab"
                    title="Clubs"
                    onClick={() => onNavigate?.('/app/clubs')}
                >
                    <span className="tab-icon">&#x1F3B0;</span>
                </button>
                <button
                    className="sp-nav-tab"
                    title="GTO Training"
                    onClick={() => onNavigate?.('/app/training')}
                >
                    <span className="tab-icon">&#x1F9E0;</span>
                </button>
                <button
                    className="sp-nav-tab"
                    title="Games"
                    onClick={() => onNavigate?.('/app/arcade')}
                >
                    <span className="tab-icon">&#x1F3AE;</span>
                </button>

                {/* Mobile Menu (Hidden on Desktop) */}
                <button className="sp-nav-tab mobile-menu">
                    <span className="tab-icon">&#x2630;</span>
                </button>
            </div>

            {/* right: User Actions */}
            <div className="sp-nav-right">
                <button className="sp-nav-icon" title="Menu">&#x229E;</button>

                <div style={{ position: 'relative' }}>
                    <button
                        className={`sp-nav-icon ${showMessenger ? 'active' : ''}`}
                        title="Messenger"
                        onClick={() => setShowMessenger(!showMessenger)}
                    >
                        &#x1F4AC;
                    </button>
                    <UnreadBadge count={unreadCount} style={{ top: -2, right: -2 }} />
                </div>

                <div className="notif-wrapper">
                    <NotificationBell
                        unreadCount={unreadNotifCount}
                        isOpen={showNotifs}
                        onClick={() => setShowNotifs(!showNotifs)}
                    />
                    {showNotifs && (
                        <div className="notif-dropdown-container">
                            <NotificationsDropdown
                                notifications={notifications}
                                onNotificationClick={async (notif) => {
                                    // Mark as read in Supabase
                                    if (notif?.id && !notif.read) {
                                        try {
                                            const { error } = await supabase
                                                .from('notifications')
                                                // BUGFIX (header-audit #1): write BOTH legacy flags. Writing only
                                                // `read` left is_read NULL, and the unread filter treated a NULL
                                                // is_read as unread — so the badge came straight back.
                                                .update({ read: true, is_read: true })
                                                .eq('id', notif.id);
                                            if (error) throw error;
                                            setNotifications(prev => prev.map(n =>
                                                n.id === notif.id ? { ...n, read: true } : n
                                            ));
                                            setUnreadCount(prev => Math.max(0, prev - 1));
                                        } catch { /* silent */ }
                                    }
                                    // Navigate based on type
                                    const type = notif?.type || '';
                                    if (type === 'like' || type === 'comment' || type === 'reaction') {
                                        onNavigate?.('feed');
                                    } else if (type === 'follow' || type === 'friend_request') {
                                        onNavigate?.('profile');
                                    }
                                    setShowNotifs(false);
                                }}
                                onMarkAllRead={async () => {
                                    if (!authUser?.id) return;
                                    try {
                                        const { error } = await supabase
                                            .from('notifications')
                                            // BUGFIX (header-audit #1): mark-all must write BOTH legacy flags,
                                            // otherwise the next poll re-counts every row it just cleared.
                                            .update({ read: true, is_read: true })
                                            .eq('user_id', authUser.id)
                                            .eq('read', false);
                                        if (error) throw error;
                                        // Update local state immediately
                                        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                                        setUnreadCount(0);
                                    } catch (e) {
                                        console.warn('Mark all read failed:', e.message);
                                    }
                                }}
                            />
                        </div>
                    )}
                </div>

                <div className="user-menu-trigger">
                    <SPAvatar src={currentUser?.avatar} size={40} />
                </div>
            </div>

            <style>{`
                .sp-navbar {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 56px;
                    background: ${SP_COLORS.bgWhite};
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 16px;
                    z-index: 1000;
                }

                .sp-nav-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 280px;
                }

                .logo-icon {
                    font-size: 40px;
                    cursor: pointer;
                }

                .sp-search {
                    position: relative;
                }

                .sp-search input {
                    width: 240px;
                    padding: 10px 16px 10px 40px;
                    background: ${SP_COLORS.bgMain};
                    border: none;
                    border-radius: 20px;
                    font-size: 15px;
                }

                .search-icon {
                    position: absolute;
                    left: 14px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: ${SP_COLORS.textSecondary};
                }

                .sp-nav-center {
                    display: flex;
                    justify-content: center;
                    flex: 1;
                    max-width: 600px;
                }

                .sp-nav-tab {
                    flex: 1;
                    height: 48px;
                    border: none;
                    background: transparent;
                    border-radius: 8px;
                    font-size: 24px;
                    color: ${SP_COLORS.textSecondary};
                    cursor: pointer;
                    position: relative;
                    max-width: 110px;
                }

                .sp-nav-tab:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .sp-nav-tab.active {
                    color: ${SP_COLORS.blue};
                }

                .sp-nav-tab.active::after {
                    content: '';
                    position: absolute;
                    bottom: -4px;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: ${SP_COLORS.blue};
                    border-radius: 2px 2px 0 0;
                }

                .mobile-menu { display: none; }

                .sp-nav-right {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 280px;
                    justify-content: flex-end;
                }

                .sp-nav-icon {
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: ${SP_COLORS.bgMain};
                    border-radius: 50%;
                    font-size: 18px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .sp-nav-icon:hover, .sp-nav-icon.active {
                    background: ${SP_COLORS.bgHover};
                }

                .sp-nav-icon.active {
                    color: ${SP_COLORS.blue};
                    background: ${SP_COLORS.blueLight};
                }

                .notif-wrapper {
                    position: relative;
                }

                .notif-dropdown-container {
                    position: absolute;
                    top: 48px;
                    right: -80px;
                    z-index: 1001;
                }

                .user-menu-trigger {
                    cursor: pointer;
                }

                @media (max-width: 1100px) {
                    .sp-nav-left { min-width: auto; }
                    .sp-nav-right { min-width: auto; }
                    .sp-search { display: none; }
                }

                @media (max-width: 768px) {
                    .sp-nav-center .sp-nav-tab:not(.active):not(.mobile-menu) { display: none; }
                    .mobile-menu { display: block; }
                }
            `}</style>
        </nav>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📢 NOTIFICATION NOISE REDUCTION — suppress low-value types
// ═══════════════════════════════════════════════════════════════════════════
const BLOCKED_NOTIF_TYPES = ['like', 'comment', 'share', 'mention', 'tag', 'hand_reaction'];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LAYOUT SHELL
// ═══════════════════════════════════════════════════════════════════════════

export const SmarterPokerLayout = ({ children, currentUser: propUser, onNavigate }) => {
    const router = useRouter();
    // 1. Get Real User Data from Supabase auth
    const [authUser, setAuthUser] = useState(null);
    const [authProfile, setAuthProfile] = useState(null);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const user = getAuthUser();
                if (user) {
                    setAuthUser(user);
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('username, avatar_url')
                        .eq('id', user.id)
                        .maybeSingle();
                    setAuthProfile(profile);
                }
            } catch (err) {
                console.warn('Auth error:', err);
            }
        };
        checkAuth();
    }, []);

    const currentUser = propUser || (authUser ? {
        id: authUser.id,
        name: authProfile?.username || authUser.email?.split('@')[0] || 'Player',
        avatar: authProfile?.avatar_url || null,
        online: true
    } : { id: 'guest', name: 'Guest', avatar: null, online: false });

    // 2. Fetch real notifications from Supabase
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!authUser?.id) return;

        async function fetchNotifications() {
            try {
                const { data } = await supabase
                    .from('notifications')
                    .select('id, type, message, created_at, read')
                    .eq('user_id', authUser.id)
                    .not('type', 'in', `(${BLOCKED_NOTIF_TYPES.join(',')})`)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (data) {
                    setNotifications(data.map(n => ({
                        id: n.id,
                        type: n.type || 'info',
                        text: n.message,
                        time: getRelativeTime(n.created_at),
                        read: n.read,
                    })));
                    setUnreadCount(data.filter(n => !n.read).length);
                }
            } catch {
                // Notifications table may not exist yet - fail silently
            }
        }

        fetchNotifications();
    }, [authUser?.id]);

    // Listen for EventBus events to update notification state
    useEffect(() => {
        const unsub1 = eventBus.on(EventType.NOTIFICATIONS_READ, () => {
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        });
        const unsub2 = eventBus.on(EventType.SOCIAL_POST_CREATED, () => {
            // A new post was created — could generate notifications for followers
            // Re-fetch notifications after a short delay
            if (authUser?.id) {
                setTimeout(async () => {
                    try {
                        const { data } = await supabase
                            .from('notifications')
                            .select('id, type, message, created_at, read')
                            .eq('user_id', authUser.id)
                            .not('type', 'in', `(${BLOCKED_NOTIF_TYPES.join(',')})`)
                            .order('created_at', { ascending: false })
                            .limit(20);
                        if (data) {
                            setNotifications(data.map(n => ({
                                id: n.id,
                                type: n.type || 'info',
                                text: n.message,
                                time: getRelativeTime(n.created_at),
                                read: n.read,
                            })));
                            setUnreadCount(data.filter(n => !n.read).length);
                        }
                    } catch { /* silent */ }
                }, 2000);
            }
        });
        const unsub2_refresh = eventBus.on(EventType.SOCIAL_FEED_REFRESHED, () => {
            // A new post was created — could generate notifications for followers
            // Re-fetch notifications after a short delay
            if (authUser?.id) {
                setTimeout(async () => {
                    try {
                        const { data } = await supabase
                            .from('notifications')
                            .select('id, type, message, created_at, read')
                            .eq('user_id', authUser.id)
                            .not('type', 'in', `(${BLOCKED_NOTIF_TYPES.join(',')})`)
                            .order('created_at', { ascending: false })
                            .limit(20);
                        if (data) {
                            setNotifications(data.map(n => ({
                                id: n.id,
                                type: n.type || 'info',
                                text: n.message,
                                time: getRelativeTime(n.created_at),
                                read: n.read,
                            })));
                            setUnreadCount(data.filter(n => !n.read).length);
                        }
                    } catch { /* silent */ }
                }, 2000);
            }
        });
        return () => {
            if (unsub1) unsub1();
            if (unsub2) unsub2();
            if (unsub2) unsub2_refresh();
        };
    }, [authUser?.id]);

    // Supabase Realtime: new notifications appear instantly
    useEffect(() => {
        if (!authUser?.id) return;
        const channel = supabase.channel(`notifs-${authUser.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${authUser.id}`
                },
                (payload) => {
                    const n = payload.new;
                    if (BLOCKED_NOTIF_TYPES.includes(n.type)) return; // Skip blocked types
                    setNotifications(prev => {
                        // Dedup guard — prevent duplicate if Supabase retries delivery
                        if (prev.some(existing => existing.id === n.id)) return prev;
                        return [{
                            id: n.id,
                            type: n.type || 'info',
                            text: n.message,
                            time: getRelativeTime(n.created_at),
                            read: n.read,
                        }, ...prev];
                    });
                    if (!n.read) setUnreadCount(prev => prev + 1);
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [authUser?.id]);

    // 3. Chat State management - Replaced legacy ChatDock with Messenger Deep Linking
    const handleOpenChat = (participant) => {
        if (!participant) return;
        const targetUsername = participant.username || participant.name || participant.id;
        if (targetUsername && participant.id) {
            router.push(`/hub/messenger?compose=${encodeURIComponent(targetUsername)}&uid=${participant.id}`);
        }
    };

    // 4. Inject props into children
    const childrenWithProps = React.Children.map(children, child => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child, {
                currentUser,
                onOpenChat: handleOpenChat,
                onNavigate
            });
        }
        return child;
    });

    return (
        <div className="sp-shell">
            <SPNavBar
                currentUser={currentUser}
                unreadNotifCount={unreadCount}
                notifications={notifications}
                onNavigate={onNavigate}
            />

            <main className="sp-content-area">
                <SocialErrorBoundary>
                    {childrenWithProps}
                </SocialErrorBoundary>
            </main>

            <style>{`
                .sp-shell {
                    background: ${SP_COLORS.bgMain};
                    min-height: 100vh;
                    padding-top: 56px;
                }

                .sp-content-area {
                    min-height: calc(100vh - 56px);
                }

                /* Scrollbar Styling */
                ::-webkit-scrollbar {
                    width: 8px;
                }

                ::-webkit-scrollbar-track {
                    background: transparent;
                }

                ::-webkit-scrollbar-thumb {
                    background: #BCC0C4;
                    border-radius: 4px;
                }

                ::-webkit-scrollbar-thumb:hover {
                    background: #A8ABAF;
                }
            `}</style>
        </div>
    );
};

function getRelativeTime(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
}

export default SmarterPokerLayout;
