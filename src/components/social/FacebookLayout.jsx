/**
 * FACEBOOK LAYOUT (SHELL)
 * Main shell component with Navigation, Chat Dock, and Responsive Grid
 * Uses real authenticated user data from SupabaseProvider
 */

import React, { useState, useEffect } from 'react';
import { FB_COLORS, FBAvatar } from './FacebookStyleCard';
import { NotificationBell, NotificationsDropdown } from './FacebookNotifications';
import { ChatDock, ChatWindow, ConversationList } from './FacebookMessenger';
import { useSupabase } from '../../providers/SupabaseProvider';
import { supabase } from '../../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NAVIGATION BAR
// ═══════════════════════════════════════════════════════════════════════════

const FBNavBar = ({
    currentUser,
    notifications = [],
    unreadNotifCount = 0,
    onSearch,
    onNavigate
}) => {
    const [showNotifs, setShowNotifs] = useState(false);
    const [showMessenger, setShowMessenger] = useState(false);

    return (
        <nav className="fb-navbar">
            {/* Left: Logo + Search */}
            <div className="fb-nav-left">
                <div className="fb-logo" onClick={() => onNavigate?.('/app')} style={{ cursor: 'pointer' }}>
                    <span className="logo-icon">&#x1F0CF;</span>
                </div>
                <div className="fb-search">
                    <span className="search-icon">&#x1F50D;</span>
                    <input
                        type="text"
                        placeholder="Search Smarter Poker"
                        onChange={(e) => onSearch?.(e.target.value)}
                    />
                </div>
            </div>

            {/* Center: Navigation Tabs */}
            <div className="fb-nav-center">
                <button
                    className="fb-nav-tab active"
                    title="Home"
                    onClick={() => onNavigate?.('/app/social')}
                >
                    <span className="tab-icon">&#x1F3E0;</span>
                </button>
                <button
                    className="fb-nav-tab"
                    title="Watch"
                    onClick={() => onNavigate?.('/app/watch')}
                >
                    <span className="tab-icon">&#x1F4FA;</span>
                </button>
                <button
                    className="fb-nav-tab"
                    title="Clubs"
                    onClick={() => onNavigate?.('/app/clubs')}
                >
                    <span className="tab-icon">&#x1F3B0;</span>
                </button>
                <button
                    className="fb-nav-tab"
                    title="GTO Training"
                    onClick={() => onNavigate?.('/app/training')}
                >
                    <span className="tab-icon">&#x1F9E0;</span>
                </button>
                <button
                    className="fb-nav-tab"
                    title="Games"
                    onClick={() => onNavigate?.('/app/arcade')}
                >
                    <span className="tab-icon">&#x1F3AE;</span>
                </button>

                {/* Mobile Menu (Hidden on Desktop) */}
                <button className="fb-nav-tab mobile-menu">
                    <span className="tab-icon">&#x2630;</span>
                </button>
            </div>

            {/* Right: User Actions */}
            <div className="fb-nav-right">
                <button className="fb-nav-icon" title="Menu">&#x229E;</button>

                <button
                    className={`fb-nav-icon ${showMessenger ? 'active' : ''}`}
                    title="Messenger"
                    onClick={() => setShowMessenger(!showMessenger)}
                >
                    &#x1F4AC;
                </button>

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
                                onMarkAllRead={() => { }}
                            />
                        </div>
                    )}
                </div>

                <div className="user-menu-trigger">
                    <FBAvatar src={currentUser?.avatar} size={40} />
                </div>
            </div>

            <style>{`
                .fb-navbar {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 56px;
                    background: ${FB_COLORS.bgWhite};
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 16px;
                    z-index: 1000;
                }

                .fb-nav-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 280px;
                }

                .logo-icon {
                    font-size: 40px;
                    cursor: pointer;
                }

                .fb-search {
                    position: relative;
                }

                .fb-search input {
                    width: 240px;
                    padding: 10px 16px 10px 40px;
                    background: ${FB_COLORS.bgMain};
                    border: none;
                    border-radius: 20px;
                    font-size: 15px;
                }

                .search-icon {
                    position: absolute;
                    left: 14px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: ${FB_COLORS.textSecondary};
                }

                .fb-nav-center {
                    display: flex;
                    justify-content: center;
                    flex: 1;
                    max-width: 600px;
                }

                .fb-nav-tab {
                    flex: 1;
                    height: 48px;
                    border: none;
                    background: transparent;
                    border-radius: 8px;
                    font-size: 24px;
                    color: ${FB_COLORS.textSecondary};
                    cursor: pointer;
                    position: relative;
                    max-width: 110px;
                }

                .fb-nav-tab:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .fb-nav-tab.active {
                    color: ${FB_COLORS.blue};
                }

                .fb-nav-tab.active::after {
                    content: '';
                    position: absolute;
                    bottom: -4px;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: ${FB_COLORS.blue};
                    border-radius: 2px 2px 0 0;
                }

                .mobile-menu { display: none; }

                .fb-nav-right {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 280px;
                    justify-content: flex-end;
                }

                .fb-nav-icon {
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: ${FB_COLORS.bgMain};
                    border-radius: 50%;
                    font-size: 18px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .fb-nav-icon:hover, .fb-nav-icon.active {
                    background: ${FB_COLORS.bgHover};
                }

                .fb-nav-icon.active {
                    color: ${FB_COLORS.blue};
                    background: ${FB_COLORS.blueLight};
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
                    .fb-nav-left { min-width: auto; }
                    .fb-nav-right { min-width: auto; }
                    .fb-search { display: none; }
                }

                @media (max-width: 768px) {
                    .fb-nav-center .fb-nav-tab:not(.active):not(.mobile-menu) { display: none; }
                    .mobile-menu { display: block; }
                }
            `}</style>
        </nav>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LAYOUT SHELL
// ═══════════════════════════════════════════════════════════════════════════

export const FacebookLayout = ({ children, currentUser: propUser, onNavigate }) => {
    // 1. Get Real User Data from Supabase auth
    const { user: authUser, profile: authProfile } = useSupabase();

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

    // 3. Chat State management
    const [openChats, setOpenChats] = useState([]);

    const handleOpenChat = (participant) => {
        if (openChats.find(c => c.conversation.id === participant.id || c.conversation.participants[0].id === participant.id)) {
            return;
        }

        const newChat = {
            conversation: {
                id: `chat_${participant.id}`,
                participants: [participant],
                lastMessage: null
            },
            messages: [],
            minimized: false
        };

        setOpenChats(prev => [...prev, newChat]);
    };

    const handleCloseChat = (chatId) => {
        setOpenChats(openChats.filter(c => c.conversation.id !== chatId));
    };

    const handleMinimizeChat = (chatId) => {
        setOpenChats(openChats.map(c =>
            c.conversation.id === chatId
                ? { ...c, minimized: !c.minimized }
                : c
        ));
    };

    const handleSendMessage = async (chatId, text) => {
        if (!authUser?.id || !text.trim()) return;

        // Optimistic local update
        setOpenChats(prev => prev.map(c => {
            if (c.conversation.id === chatId) {
                return {
                    ...c,
                    messages: [...c.messages, {
                        id: Date.now(),
                        text,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        senderId: authUser.id
                    }]
                };
            }
            return c;
        }));

        // Persist to Supabase
        try {
            const participantId = chatId.replace('chat_', '');
            await supabase.from('social_messages').insert({
                sender_id: authUser.id,
                receiver_id: participantId,
                content: text,
            });
        } catch {
            // Message table may not exist - fail silently
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
        <div className="fb-shell">
            <FBNavBar
                currentUser={currentUser}
                unreadNotifCount={unreadCount}
                notifications={notifications}
                onNavigate={onNavigate}
            />

            <main className="fb-content-area">
                {childrenWithProps}
            </main>

            {/* Chat Dock */}
            <ChatDock
                openChats={openChats}
                currentUser={currentUser}
                onClose={handleCloseChat}
                onMinimize={handleMinimizeChat}
                onSend={handleSendMessage}
            />

            <style>{`
                .fb-shell {
                    background: ${FB_COLORS.bgMain};
                    min-height: 100vh;
                    padding-top: 56px;
                }

                .fb-content-area {
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

export default FacebookLayout;
