/**
 *  SMARTER.POKER MESSENGER V2.0
 * Full-featured SmarterPoker Messenger clone with premium design
 * Real-time chat, read receipts, typing indicators, and poker-themed UI
 * Enhanced with: optimistic updates, message reactions, sound notifications
 */

import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import Image from 'next/image';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getAccessToken, ensureAuthReady, authedFetch } from '../../src/lib/authUtils';
import { broadcastSync } from '../../src/lib/broadcastSync';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { messengerPreferences } from '../../src/services/preferences-service';

const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), { ssr: false });
const ReportBugWidget = dynamic(() => import('../../src/components/ui/ReportBugWidget'), { ssr: false });
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';
import useTrainingBus from '../../src/hooks/useTrainingBus';

// Dynamic import for LiveKit (client-side only)
const LiveKitCall = dynamic(
    () => import('../../src/components/video/LiveKitCall'),
    { ssr: false }
);

// JarvisMessengerWidget's dynamic import was removed 2026-08-21: it was
// declared here and never rendered anywhere in this page, so it only served to
// keep a chunk in the graph. The Jarvis conversation itself is handled inline
// (see handleSelectConversation's isJarvis branch).

// God-Mode Stack
import { useMessengerStore } from '../../src/stores/messengerStore';
import { useOneSignal } from '../../src/contexts/OneSignalContext';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { createRingTone } from '../../src/utils/ringTone';
import { createMultiDeviceAuthListener, withRetry, getCircuit, isOnline } from '../../src/utils/authGuard';
import { useActiveIdentity } from '../../src/contexts/ActiveIdentityContext';
// BottomNavBar intentionally removed from messenger — input area was blocked

import { getTheme } from '../../src/components/messenger/MessengerTheme';

// Default light theme (overridden at component level)
let C = getTheme(false);

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS & HOOKS
// ═══════════════════════════════════════════════════════════════════════════

// Phase 3: Sound preference gate — only play if messageSounds is enabled
let _soundPrefsRef = { messageSounds: true };
function setSoundPrefsRef(prefs) { _soundPrefsRef = prefs; }
function playMessageSound() {
    if (!_soundPrefsRef.messageSounds) return; // Respect preference
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0tRXFuYz0mFTNNaWxofmh+YKStoJd/aGtbL09OYUFRYWOHeoKK');
        audio.volume = 0.3;
        audio.play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    } catch (e) { console.warn("[messenger.js]", e); }
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return date.toLocaleDateString();
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDateHeader(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 smarter-poker-style SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════

import { Phone, Video, Search, Info, Home, Building, Crown } from 'lucide-react';

const PhoneIcon = ({ size = 24, color = '#0084FF' }) => (
    <Phone size={size} color={color} strokeWidth={2.5} />
);

const VideoIcon = ({ size = 24, color = '#0084FF' }) => (
    <Video size={size} color={color} strokeWidth={2.5} />
);

const SearchIcon = ({ size = 24, color = '#0084FF' }) => (
    <Search size={size} color={color} strokeWidth={2.5} />
);

const InfoIcon = ({ size = 24, color = '#0084FF' }) => (
    <Info size={size} color={color} strokeWidth={2.5} />
);

// ═══════════════════════════════════════════════════════════════════════════
// 📦 EXTRACTED MESSENGER COMPONENTS (CODE-SPLIT BUNDLE OVERLAY)
// ═══════════════════════════════════════════════════════════════════════════

const Avatar = dynamic(() => import('../../src/components/messenger/Avatar').then(m => m.Avatar), { ssr: false });
const SearchBar = dynamic(() => import('../../src/components/messenger/SearchBar').then(m => m.SearchBar), { ssr: false });

const MessageInput = dynamic(
    () => import('../../src/components/messenger/MessageInput').then(m => m.MessageInput),
    { ssr: false }
);

const MessageBubble = dynamic(
    () => import('../../src/components/messenger/MessageBubble').then(m => m.MessageBubble),
    { ssr: false }
);

const ConversationItem = dynamic(
    () => import('../../src/components/messenger/ConversationItem').then(m => m.ConversationItem),
    { ssr: false }
);

const Toast = dynamic(
    () => import('../../src/components/messenger/MessengerLobbyComponents').then(m => m.Toast),
    { ssr: false }
);

const TypingIndicator = dynamic(
    () => import('../../src/components/messenger/MessengerLobbyComponents').then(m => m.TypingIndicator),
    { ssr: false }
);

const ConversationSkeleton = dynamic(
    () => import('../../src/components/messenger/MessengerLobbyComponents').then(m => m.ConversationSkeleton),
    { ssr: false }
);

const EmptyConversationState = dynamic(
    () => import('../../src/components/messenger/MessengerLobbyComponents').then(m => m.EmptyConversationState),
    { ssr: false }
);


// ═══════════════════════════════════════════════════════════════════════════
// 🔴 FAVICON BADGE UTILITY
// ═══════════════════════════════════════════════════════════════════════════

// P4 FIX: Reuse cached favicon image to prevent DOM/memory leak
// CRASH FIX: This used to throw InvalidStateError when the favicon failed to
// load (network blip, extension blocking, 404 during deploy churn). The throw
// propagated all the way to HubErrorBoundary and rendered "Messenger
// Temporarily Unavailable" — the entire messenger page died because the
// favicon couldn't be drawn. Now: we never call drawImage on a broken image,
// we attach onerror to recover, and we wrap the whole thing in try/catch so a
// favicon failure can never take down the page.
let _faviconImg = null;
function updateFaviconBadge(count) {
    if (typeof document === 'undefined') return;
    try {
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';

        if (count <= 0) {
            link.href = '/favicon.ico';
            if (!link.parentNode) document.head.appendChild(link);
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');

        // Reuse cached image to avoid repeated Image() allocations.
        // If a previous load errored we reset to null so this call retries.
        if (!_faviconImg) {
            _faviconImg = new window.Image();
            _faviconImg.onerror = () => { _faviconImg = null; };
            _faviconImg.src = '/favicon.ico';
        }

        const draw = () => {
            try {
                // `complete` is true for BOTH successful loads AND failed loads
                // (404, broken state). naturalWidth>0 is the actual liveness check.
                if (!_faviconImg || !_faviconImg.naturalWidth) {
                    // Image is broken — render a solid-color badge with no base
                    // so we still get the unread-count signal in the tab.
                    ctx.fillStyle = '#0a0a15';
                    ctx.fillRect(0, 0, 32, 32);
                } else {
                    ctx.drawImage(_faviconImg, 0, 0, 32, 32);
                }
                ctx.beginPath();
                ctx.arc(24, 8, 9, 0, 2 * Math.PI);
                ctx.fillStyle = '#E41E3F';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(count > 9 ? '9+' : String(count), 24, 8.5);
                link.href = canvas.toDataURL('image/png');
                if (!link.parentNode) document.head.appendChild(link);
            } catch (drawErr) {
                // Never let favicon drawing crash the page.
                console.warn('[messenger] favicon draw failed (non-fatal):', drawErr?.message || drawErr);
                _faviconImg = null;
            }
        };

        if (_faviconImg.complete) {
            // complete=true for both load and error — draw() handles both branches.
            draw();
        } else {
            _faviconImg.onload = draw;
            // onerror was set above; on error _faviconImg is reset and we skip drawing.
        }
    } catch (outerErr) {
        // Defensive — DOM access can fail during tab close, page transition, etc.
        console.warn('[messenger] favicon update failed (non-fatal):', outerErr?.message || outerErr);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// 📱 MAIN MESSENGER PAGE
// ═══════════════════════════════════════════════════════════════════════════

function MessengerPage() {
    // Zustand Global State (replaces UI-related useState)
    const selectedConversation = useMessengerStore((s) => s.selectedConversation);
    const setSelectedConversation = useMessengerStore((s) => s.setSelectedConversation);
    const showNewChat = useMessengerStore((s) => s.showNewChat);
    const setShowNewChat = useMessengerStore((s) => s.setShowNewChat);
    const showSearch = useMessengerStore((s) => s.showSearch);
    const setShowSearch = useMessengerStore((s) => s.setShowSearch);
    const cachedConversations = useMessengerStore((s) => s.conversations);
    const setCachedConversations = useMessengerStore((s) => s.setConversations);
    const hasCachedConversations = useMessengerStore((s) => s.hasCachedConversations);

    // 🚌 EventBus session tracking + DATA_MUTATED listener
    useTrainingBus('messenger');

    // Refresh friends sidebar when friendships change on other pages
    useEffect(() => {
        let debounceTimer = null;
        let mounted = true;
        const unsub = eventBus.on(EventType.DATA_MUTATED, (payload) => {
            if (payload?.entity === 'friends') {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    if (!mounted) return;
                    try {
                        const token = getAccessToken();
                        const resp = await authedFetch('/api/friends?action=list', {
                            headers: { 'Authorization': 'Bearer ' + token }
                        }).then(r => r.json()).catch(() => ({ data: { friends: [] } }));
                        if (mounted && resp?.data?.friends) setFriends(resp.data.friends);
                    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                }, 800);
            }
        });
        return () => { mounted = false; clearTimeout(debounceTimer); unsub(); };
    }, []);

    // Identity switching
    const { isClubMode, clubPage, hasClubPage, ownedPages, switchToPersonal, switchToClub, identityLoaded, refreshUnreadCounts } = useActiveIdentity();

    const getClubMetadata = () => {
        if (isClubMode && clubPage) {
            return {
                is_club_identity: true,
                club_id: clubPage.id,
                club_name: clubPage.name,
                club_avatar: clubPage.avatar_url
            };
        }
        return null;
    };

    // 🛡️ INSTANT AUTH: Initialize user synchronously from localStorage
    // Prevents "Sign In" flash while async profile fetch completes
    const [user, setUser] = useState(() => {
        if (typeof window === 'undefined') return null;
        try {
            const authUser = getAuthUser();
            if (authUser) {
                return {
                    ...authUser,
                    username: authUser.user_metadata?.poker_alias || authUser.email?.split('@')[0],
                    avatar_url: authUser.user_metadata?.avatar_url || null,
                    full_name: authUser.user_metadata?.full_name || null,
                };
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return null;
    });
    const [loading, setLoading] = useState(!hasCachedConversations());
    const [conversations, setConversations] = useState(cachedConversations);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isMobile, setIsMobile] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [composing, setComposing] = useState(false);
    const [toast, setToast] = useState(null);
    const [messageRequestCount, setMessageRequestCount] = useState(0);
    const [isTyping, setIsTyping] = useState(false);
    const [otherTyping, setOtherTyping] = useState(false);
    // New enhanced features
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [messageSearchResults, setMessageSearchResults] = useState([]);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [friends, setFriends] = useState([]); // Friends list for quick access
    // Jitsi Call State
    const [showCall, setShowCall] = useState(false);
    const [callType, setCallType] = useState('video'); // 'audio' or 'video'
    const [callRoomName, setCallRoomName] = useState('');
    const [showUserInfo, setShowUserInfo] = useState(false);
    const [showPushPrompt, setShowPushPrompt] = useState(false);

    // CLUB ARENA widget: the club inboxes live inside this messenger rather than
    // in a second app. Collapsed by default for someone who is here for personal
    // messages; opened automatically when the messenger is entered from Club
    // Arena (?clubId=), which is the only time we know the user came for a club.
    const [clubDrawerOpen, setClubDrawerOpen] = useState(false);
    const [pushPromptHandled, setPushPromptHandled] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('messenger_push_prompt_handled') === '1';
        }
        return false;
    });
    // Editing State
    const [editingMessage, setEditingMessage] = useState(null); // message being edited
    const [editText, setEditText] = useState('');
    // Reply State
    const [replyToMessage, setReplyToMessage] = useState(null); // message being replied to
    // Forward State
    const [forwardingMessage, setForwardingMessage] = useState(null); // message to forward
    // Dark Mode Detection
    const [isDarkMode, setIsDarkMode] = useState(false);
    // Online Presence
    const [otherUserStatus, setOtherUserStatus] = useState('offline'); // 'online' | 'away' | 'offline'
    const [otherUserLastSeen, setOtherUserLastSeen] = useState(null);
    // Pinned Conversations
    const [pinnedConvoIds, setPinnedConvoIds] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('sp-pinned-conversations') || '[]');
        } catch { return []; }
    });
    // Stable identity for "which conversations exist", independent of order or
    // of the array being rebuilt. See the request-count effect below.
    const conversationIdKey = useMemo(
        () => (conversations || []).map(c => c.id).sort().join(','),
        [conversations]
    );

    // Users this account has blocked. send-message and start-conversation have
    // enforced messenger_blocked for a while, but nothing in this messenger
    // ever wrote it - the only writer was the in-game table messenger - so the
    // table was empty platform-wide and blocking did nothing here.
    const [blockedUserIds, setBlockedUserIds] = useState([]);
    // Hidden messages (delete-for-me persistence)
    const [hiddenMessageIds] = useState(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]'));
        } catch { return new Set(); }
    });
    // Incoming Call State (for seamless calling like Snapchat/WhatsApp)
    const [incomingCall, setIncomingCall] = useState(null); // { callerId, callerName, callerAvatar, callType, roomName }
    const [callingUser, setCallingUser] = useState(null); // Track who we're calling
    const [isVip, setIsVip] = useState(false); // VIP status for Jarvis daily limits
    const incomingCallAudioRef = useRef(null);
    // outgoingCallAudioRef removed - using Web Audio API createRingTone() instead
    const outgoingRingToneRef = useRef(null); // Web Audio API ring tone (more reliable)
    const callTimeoutRef = useRef(null);
    const callStartTimeRef = useRef(null); // Track call start for duration
    // BUG-3 FIX: Refs to avoid stale closures in long-lived Realtime signaling listener
    const showCallRef = useRef(false);
    const callingUserRef = useRef(null);

    // Hamburger Menu State
    const [menuOpen, setMenuOpen] = useState(false);
    const [preferences, setPreferences] = useState({
        notifications: true,
        readReceipts: true,
        activeStatus: true,
        messageSounds: true
    });
    // Ref mirror of preferences to avoid stale closures in long-lived WebSocket callbacks
    const preferencesRef = useRef(preferences);
    useEffect(() => { preferencesRef.current = preferences; setSoundPrefsRef(preferences); }, [preferences]);

    // Message Cache for Instant Display — Map with LRU eviction (max 20 conversations)
    const MESSAGE_CACHE_MAX = 20;
    const messageCacheRef = useRef(new Map());
    useEffect(() => {
        if (activeConversation?.id && messages.length > 0) {
            const cache = messageCacheRef.current;
            // Move to end (most recent) — delete+re-set implements LRU
            cache.delete(activeConversation.id);
            cache.set(activeConversation.id, messages);
            // Evict oldest entry if over limit
            if (cache.size > MESSAGE_CACHE_MAX) {
                const oldestKey = cache.keys().next().value;
                cache.delete(oldestKey);
            }
        }
    }, [messages, activeConversation?.id]);

    // Phase 3: Connection status state
    const [connectionStatus, setConnectionStatus] = useState('connected'); // 'connected' | 'reconnecting' | 'disconnected'
    // Phase 3: Scroll-to-bottom FAB state
    const [showScrollDown, setShowScrollDown] = useState(false);

    // OneSignal Push Notifications
    const { isInitialized: pushReady, isSubscribed: pushSubscribed, subscribe: subscribePush, setExternalUserId } = useOneSignal();

    // Dark Mode detection & theme override
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => { setIsDarkMode(e.matches); C = getTheme(e.matches); };
        setIsDarkMode(mq.matches);
        C = getTheme(mq.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Load preferences from service (localStorage + Supabase)
    useEffect(() => {
        let cancelled = false;
        messengerPreferences.get(user?.id).then(prefs => {
            if (!cancelled) setPreferences(prefs);
        });
        return () => { cancelled = true; };
    }, [user]);

    // Preference update handler with Supabase sync
    const updatePreference = async (key, value) => {
        const updated = { ...preferences, [key]: value };
        setPreferences(updated);
        await messengerPreferences.update(user?.id, { [key]: value });

        // 📲 PUSH NOTIFICATIONS: Hook toggle into OneSignal subscribe/unsubscribe
        if (key === 'notifications') {
            if (value && pushReady && subscribePush) {
                try {
                    await subscribePush();
                    setToast({ type: 'success', message: 'Push Notifications Enabled' });
                } catch (e) {
                    console.warn('[Messenger] Push subscribe error:', e);
                }
            } else if (!value && pushReady) {
                // Note: OneSignal doesn't have a direct unsubscribe in the hook,
                // but disabling the preference stops sound + visual notifications
                setToast({ type: 'info', message: 'Notifications Disabled' });
            }
        }
    };

    // Global unread count for header badge - refresh after reading messages
    const { refreshUnread } = useUnreadCount();

    const messagesEndRef = useRef(null);
    const searchTimeout = useRef(null);
    const searchInputRef = useRef(null);
    const typingTimeout = useRef(null);
    const messageSearchTimeout = useRef(null);
    const activeConversationRef = useRef(null);
    const profileCacheRef = useRef(new Map()); // Cache sender profiles to avoid repeated fetches (LRU, max 50)
    const PROFILE_CACHE_MAX = 50;
    const messagesContainerRef = useRef(null); // Scroll container for pagination position preservation

    // Keep ref in sync so global RT channel can read it without re-subscribing
    useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);
    // The 30s inbox poll is deliberately NOT re-created when the sidebar
    // changes (that would tear down and rebuild the interval on every
    // incoming message), so it reads the current list through a ref.
    const conversationsRef = useRef([]);
    useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
    // DEEP-SWEEP FIX: callTypeRef prevents stale closure in broadcast handlers
    const callTypeRef = useRef(callType);
    useEffect(() => { callTypeRef.current = callType; }, [callType]);
    const typingChannelRef = useRef(null);

    // Menu config with handlers
    const menuConfig = getMenuConfig('messenger', user, preferences, {
        setNotifications: (val) => updatePreference('notifications', val),
        setReadReceipts: (val) => updatePreference('readReceipts', val),
        setActiveStatus: (val) => updatePreference('activeStatus', val),
        setMessageSounds: (val) => updatePreference('messageSounds', val)
    });

    // Check for mobile
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Phase 3: Keyboard shortcuts (Escape closes panels)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showUserInfo) { setShowUserInfo(false); return; }
                if (showMessageSearch) { setShowMessageSearch(false); return; }
                if (forwardingMessage) { setForwardingMessage(null); return; }
                if (editingMessage) { setEditingMessage(null); setEditText(''); return; }
                if (replyToMessage) { setReplyToMessage(null); return; }
                if (menuOpen) { setMenuOpen(false); return; }
                // On mobile, Escape navigates back to sidebar
                if (isMobile && activeConversation) { setActiveConversation(null); setShowSidebar(true); return; }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showUserInfo, showMessageSearch, forwardingMessage, editingMessage, replyToMessage, menuOpen, isMobile, activeConversation]);

    // NOTE: Identity-switch reload effect is placed AFTER loadConversationsRef declaration below

    // Phase 3: Connection status monitor (navigator.onLine + Supabase health)
    // On reconnect, reload conversations and the active conversation to catch missed messages.
    const goOnlineUserRef = useRef(null);
    const loadConversationsRef = useRef(null);
    const loadMessagesRef = useRef(null);
    // PERF 2026-08-24: in-flight de-duplication for loadConversations.
    // Opening the messenger fired the SAME full inbox request 3-4 times
    // concurrently: the init effect, the identity effect (user?.id null->id),
    // the auth listener (INITIAL_SESSION / TOKEN_REFRESHED) and the immediate
    // pollInbox() all call it on mount. Holds { key, promise } so overlapping
    // callers for the same (user, identity context) share one round-trip.
    const loadConvInFlightRef = useRef(null);

    // Reload conversations and clear active chat when switching identity contexts (Personal <-> Club)
    // MUST be placed AFTER loadConversationsRef declaration so the ref exists when the effect fires.
    useEffect(() => {
        if (!user?.id) return;
        setActiveConversation(null);
        setMessages([]);
        // PERF 2026-08-24: do NOT blank the list here. This effect also fires on
        // the ordinary null->id transition of user?.id at mount, and clearing
        // threw away the localStorage-cached conversations written on the last
        // visit - so the sidebar went empty and the user stared at a skeleton
        // until the slowest in-flight request returned. loadConversations()
        // below replaces the list wholesale when it resolves, and it is keyed on
        // the identity context, so a real Personal <-> Club switch still swaps
        // the contents; it just no longer flashes empty on a plain reload.
        if (!Array.isArray(conversationsRef.current) || conversationsRef.current.length === 0) {
            setConversations([]);
        }
        // loadConversationsRef.current is set later in the render body (line ~3694)
        // but effects fire post-render, so by the time this callback executes the ref is populated.
        loadConversationsRef.current?.(user.id);
    }, [isClubMode, clubPage?.id, user?.id]);
    useEffect(() => { goOnlineUserRef.current = user; }, [user]);
    useEffect(() => {
        const goOnline = () => {
            setConnectionStatus('connected');
            // Reload missed messages after reconnect — use refs to avoid stale closures
            const currentUser = goOnlineUserRef.current;
            if (currentUser?.id) {
                loadConversationsRef.current?.(currentUser.id);
                const activeConv = activeConversationRef.current;
                if (activeConv?.id && !activeConv.isJarvis) {
                    loadMessagesRef.current?.(activeConv.id);
                }
            }
        };
        const goOffline = () => setConnectionStatus('disconnected');
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        if (!navigator.onLine) setConnectionStatus('disconnected');
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);


    // Load user and conversations — PARALLEL init with cache-first render
    useEffect(() => {
        async function init() {
            try {
                // BULLETPROOF: Use authUtils instead of getSafeUser (avoids AbortError)
                let authUser = getAuthUser();

                // FALLBACK: If sync localStorage check fails, try async session check
                // This catches browser restarts, stale tabs, and token refresh scenarios
                if (!authUser) {
                    try {
                        authUser = await ensureAuthReady(supabase);
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                }

                if (authUser) {
                    const token = getAccessToken();
                    const headers = { 'Authorization': 'Bearer ' + token };

                    // PARALLEL: Fire all 3 independent API calls at once
                    const [profileResult, convoResult, friendsResult] = await Promise.allSettled([
                        // 1. Profile
                        authedFetch('/api/user/get-header-stats', {
                            method: 'POST',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        }).then(r => r.json()).catch(() => ({})),
                        // 2. Conversations
                        loadConversations(authUser.id),
                        // 3. Friends
                        authedFetch('/api/friends?action=list', { headers })
                            .then(r => r.json()).catch(() => ({ data: { friends: [] } }))
                    ]);

                    // Process profile
                    const profileResp = profileResult.status === 'fulfilled' ? profileResult.value : {};
                    const prof = profileResp?.profile || {};
                    setUser({
                        ...authUser,
                        username: prof.username || authUser.email?.split('@')[0],
                        avatar_url: prof.avatar_url,
                        full_name: prof.full_name,
                        is_vip: prof.is_vip
                    });
                    setIsVip(!!prof.is_vip);

                    // Process friends
                    const friendsResp = friendsResult.status === 'fulfilled' ? friendsResult.value : {};
                    if (friendsResp?.data?.friends) {
                        setFriends(friendsResp.data.friends);
                    }
                }
            } catch (e) {
                console.warn('Init error:', e);
            }
            setLoading(false);
        }
        init();
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════
    // DEEP-LINK COMPOSE: Auto-start conversation when arriving from profile page
    // URL format: /hub/messenger?compose=username&uid=userId
    // ═══════════════════════════════════════════════════════════════════════════
    const router = useRouter();
    // Track the last-handled uid (not a boolean) so re-clicking Message for a
    // different user in the same session correctly opens THAT conversation.
    const lastHandledUid = useRef(null);
    const [composeFocus, setComposeFocus] = useState(false);
    const [conversationDraft, setConversationDraft] = useState(''); // pre-filled text from ?draft= param
    useEffect(() => {
        if (!user?.id) return;
        const { compose, uid } = router.query;
        if (!compose || !uid) return;
        // Prevent handling the same deep-link twice (deduplication)
        if (lastHandledUid.current === uid) return;

        lastHandledUid.current = uid;

        // Look up the target user's profile and start a conversation
        const openCompose = async () => {
            try {
                const { data: targetProfile } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .eq('id', uid)
                    .maybeSingle();

                if (targetProfile) {
                    // Auto-start conversation with this user
                    await handleStartConversation(targetProfile);
                    // Signal that the message input should auto-focus for composing
                    setComposeFocus(true);
                } else {
                    console.warn('[Messenger] Deep-link target not found:', compose, uid);
                    setToast({ type: 'error', message: 'User not found' });
                    // Reset lock so user can retry
                    lastHandledUid.current = null;
                }
                // Clean up the URL query params without navigation or React state reset
                // We use history API directly because router.replace triggers _app.js remount via router.asPath key
                window.history.replaceState(null, '', '/hub/messenger');
            } catch (e) {
                console.warn('[Messenger] Deep-link compose error:', e?.message || e);
                setToast({ type: 'error', message: 'Failed to start conversation. Please try again.' });
                lastHandledUid.current = null; // Reset so user can retry
                window.history.replaceState(null, '', '/hub/messenger');
            }
        };

        openCompose();
    }, [user?.id, router.query]);

    // ── Handle ?conversation=convId&draft=text deep-link (from Message Host button) ──
    const lastHandledConvLink = useRef(null);
    useEffect(() => {
        if (!user?.id) return;
        const { conversation: convIdParam, recipientId, draft } = router.query;
        const linkKey = convIdParam || recipientId;
        // BUG-FIX: do NOT guard on conversations.length here.
        // If we do, lastHandledConvLink.current gets set to linkKey on the first
        // render (before conversations load), and the effect never re-runs for
        // the same linkKey once conversations are available.
        if (!linkKey || lastHandledConvLink.current === linkKey) return;
        lastHandledConvLink.current = linkKey;

        const draftText = draft ? decodeURIComponent(draft) : '';

        if (convIdParam) {
            // Find the conversation in our list and open it
            const found = conversations.find(c => c.id === convIdParam);
            if (found) {
                setActiveConversation(found);
                // BUG-FIX: set draft only for THIS conversation; cleared after mount
                // via the useEffect below that watches activeConversation.id changes.
                if (draftText) setConversationDraft(draftText);
                setComposeFocus(true);
                if (isMobile) setShowSidebar(false);
            } else {
                // Conversation not found. This covers two sub-cases:
                //  (a) conversations.length > 0 but convId not in the list (genuine 404)
                //  (b) conversations.length === 0 (still loading)
                // In both cases we MUST reset the ref so the effect can retry
                // once conversations arrive via Realtime subscription.
                // BUG-FIX: previously kept the ref set when length===0, which blocked
                // the retry — the early-return guard (line 2733) would fire first.
                lastHandledConvLink.current = null;
            }
        } else if (recipientId) {
            // Recipient-based — look up profile and start conversation
            (async () => {
                try {
                    const { data: targetProfile } = await supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .eq('id', recipientId)
                        .maybeSingle();
                    if (targetProfile) {
                        await handleStartConversation(targetProfile);
                        if (draftText) setConversationDraft(draftText);
                        setComposeFocus(true);
                    }
                } catch (e) {
                    console.warn('[Messenger] recipientId deep-link error:', e?.message || e);
                }
            })();
        }
        window.history.replaceState(null, '', '/hub/messenger');
    }, [user?.id, router.query, conversations]);

    // BUG-FIX: Clear conversationDraft when the user switches to a different
    // conversation AFTER the initial deep-link draft has been consumed.
    // Without this, every subsequent conversation gets the stale draft
    // pre-filled because conversationDraft state never resets.
    const lastDraftConvId = useRef(null);
    useEffect(() => {
        if (!activeConversation?.id) return;
        if (lastDraftConvId.current !== null &&
            lastDraftConvId.current !== activeConversation.id &&
            conversationDraft) {
            setConversationDraft('');
        }
        lastDraftConvId.current = activeConversation.id;
    }, [activeConversation?.id]);

    // ═══════════════════════════════════════════════════════════════════════════
    // MESSAGE REQUEST COUNT: Fetch pending message requests for sidebar badge
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!user?.id) return;
        const fetchRequestCount = async () => {
            try {
                // Count conversations where current user is a participant AND is_request=true
                // AND the request was NOT sent by the current user (they see it in their inbox)
                const { data: participations } = await supabase
                    .from('social_conversation_participants')
                    .select('conversation_id')
                    .eq('user_id', user.id)
                    .limit(200);

                if (!participations || participations.length === 0) return;

                const convIds = participations.map(p => p.conversation_id);
                const { count } = await supabase
                    .from('social_conversations')
                    .select('id', { count: 'exact', head: true })
                    .in('id', convIds)
                    .eq('is_request', true)
                    .neq('request_sender_id', user.id);

                setMessageRequestCount(count || 0);
            } catch (e) {
                console.warn('[Messenger] Request count error:', e?.message || e);
            }
        };
        fetchRequestCount();
        // `conversations` gets a NEW array identity on every incoming message,
        // every preview update, every 30s poll tick and every re-sort, and this
        // effect runs TWO Supabase queries. Keying on the sorted id set instead
        // means it re-runs when the set of conversations actually changes, not
        // when the array is merely rebuilt or reordered.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, conversationIdKey]);

    // ═══════════════════════════════════════════════════════════════════════════
    // PROFILE SYNC: Update local user state when profile is edited
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        let debounceTimer = null;
        const handleProfileUpdated = (e) => {
            // OPTIMISTIC: Instant UI update from event.detail (no network needed)
            const d = e?.detail;
            if (d && (d.full_name || d.avatar_url || d.username)) {
                setUser(prev => ({
                    ...prev,
                    ...(d.full_name ? { full_name: d.full_name } : {}),
                    ...(d.username ? { username: d.username } : {}),
                    ...(d.avatar_url ? { avatar_url: d.avatar_url } : {}),
                }));
            }
            // VERIFY: Debounced fetch confirms and fills remaining fields
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    const authUser = getAuthUser();
                    if (!authUser) return;
                    const token = getAccessToken();
                    const resp = await authedFetch('/api/user/get-header-stats', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                    }).then(r => r.json()).catch(() => ({}));
                    const p = resp?.profile;
                    if (p?.username || p?.avatar_url) {
                        setUser(prev => ({
                            ...prev,
                            username: p.username || prev?.username,
                            avatar_url: p.avatar_url ?? prev?.avatar_url,
                            full_name: p.full_name || prev?.full_name,
                        }));
                    }
                } catch { /* non-critical */ }
            }, 300);
        };

        window.addEventListener('profile-updated', handleProfileUpdated);

        // Cross-tab: BroadcastChannel avatar sync
        let avatarBc = null;
        try {
            avatarBc = new BroadcastChannel('smarter_poker_avatar_sync');
            avatarBc.onmessage = () => handleProfileUpdated();
        } catch { /* BroadcastChannel not supported */ }

        return () => {
            clearTimeout(debounceTimer);
            window.removeEventListener('profile-updated', handleProfileUpdated);
            if (avatarBc) avatarBc.close();
        };
    }, []);

    //  MULTI-DEVICE RESILIENCE: Listen for auth changes from ANY device
    // This handles: token refresh, login from another device, session recovery
    useEffect(() => {
        const cleanup = createMultiDeviceAuthListener(supabase, async (authUser, event) => {

            if (!authUser) {
                // User signed out - clear state
                setUser(null);
                setConversations([]);
                setMessages([]);
                setActiveConversation(null);
                return;
            }

            // User is authenticated (from any device) - ensure we have latest data
            if (authUser.id !== user?.id || event === 'TOKEN_REFRESHED') {
                // Update user state
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, is_vip')
                    .eq('id', authUser.id)
                    .maybeSingle();

                setUser({ ...authUser, ...(profile || {}) });
                setIsVip(!!profile?.is_vip);

                // Reload conversations (uses API-first approach, resilient to RLS)
                await loadConversations(authUser.id);
            }
        }, 500); // 500ms debounce to handle rapid token events

        return cleanup;
    }, [user?.id]); // Re-subscribe if user changes

    // Check for pending calls when messenger opens (for users coming from push notification)
    useEffect(() => {
        if (!user?.id) return;

        const ac = new AbortController();

        async function checkPendingCalls(signal) {
            try {
                const pendingToken = getAccessToken();
                const res = await authedFetch(`/api/calls/pending?userId=${user.id}`, {
                    headers: pendingToken ? { Authorization: `Bearer ${pendingToken}` } : {},
                    signal,
                });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const result = await res.json();

                if (result.success && result.pendingCall) {
                    const call = result.pendingCall;

                    // Show incoming call UI
                    setIncomingCall({
                        callerId: call.callerId,
                        callerName: call.callerName,
                        callerAvatar: call.callerAvatar,
                        callType: call.callType,
                        roomName: call.roomName,
                        pendingCallId: call.id, // Store ID for cleanup
                    });

                    // Play incoming call sound
                    if (incomingCallAudioRef.current) {
                        incomingCallAudioRef.current.loop = true;
                        incomingCallAudioRef.current.play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.warn('[Pending calls]', e);
            }
        }

        checkPendingCalls(ac.signal);
        return () => ac.abort();
    }, [user?.id]);

    // isPaginatingRef: when true, the messages change was a backward-pagination prepend.
    // The scroll-to-bottom effect must NOT fire in this case — rAF in loadOlderMessages restores position.
    const isPaginatingRef = useRef(false);

    // Scroll to bottom when messages change — but skip during backward pagination
    useEffect(() => {
        if (isPaginatingRef.current) {
            isPaginatingRef.current = false;
            return;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

        // 📡 GLOBAL Background Poll: Refresh sidebar unread counts every 30s
        // Replaces the unfiltered global-messenger postgres_changes channel that streamed ALL
        // social_messages rows to every logged-in user - eliminating that Supabase Realtime MAU cost.
        //
        // 2026-08-20: THIS POLL WAS READING THE WRONG MESSENGER.
        // It queried messenger_participants + messenger_messages, which belong
        // to the in-game table messenger (LivePokerTable / useMessengerService).
        // Every other path on this page reads the social_* family, so the
        // conversation ids could never match the sidebar's and the .find() at
        // the bottom always returned undefined. The poll was a no-op that cost
        // two queries per user every 30 seconds, forever. The 2026-08-15 note
        // below patched a 42703 on this same block without anyone noticing the
        // table family itself was wrong.
        //
        // It now calls fn_get_user_conversations - the exact RPC behind
        // /api/messenger/get-conversations - so the poll is one query instead
        // of two AND can never disagree with the list it is updating. The
        // context argument keeps it scoped to the identity currently selected
        // in the Club Arena widget.
        useEffect(() => {
            if (!user?.id) return;
            const pollInbox = async () => {
                try {
                    const { data: rows, error } = await supabase.rpc('fn_get_user_conversations', {
                        p_user_id: user.id,
                        p_context_entity_id: isClubMode && clubPage ? clubPage.id : null,
                    });
                    if (error) throw error;
                    setConnectionStatus('connected');
                    if (!rows?.length) return;
                    const data = rows.map(r => ({
                        conversation_id: r.conversation_id,
                        unread_count: Number(r.unread_count) || 0,
                    }));

                    // A conversation that did not exist when the sidebar was
                    // built could only ever be UPDATED below, never ADDED - the
                    // map() walks `prev`, so an id that is not already in the
                    // list stayed invisible until a full page reload. That is
                    // exactly the shape of the weekly statement thread: the
                    // union creates it, and a club owner sitting in the
                    // messenger would never see it arrive.
                    //
                    // Rebuilding through loadConversations rather than
                    // synthesising a row here keeps one definition of what a
                    // sidebar row is, and costs a request only on the tick
                    // where a genuinely new thread appeared. The global
                    // postgres_changes subscription is deliberately NOT coming
                    // back: it streamed every social_messages row to every
                    // logged-in user, which is why it was removed.
                    const knownIds = new Set(
                        (conversationsRef.current || []).map(c => c && c.id).filter(Boolean)
                    );
                    const hasNewThread = knownIds.size > 0
                        && data.some(d => d.conversation_id && !knownIds.has(d.conversation_id));

                    if (hasNewThread) {
                        try {
                            await loadConversationsRef.current?.(user.id);
                        } catch (e) {
                            console.warn('[Messenger] New-thread refresh failed:', e?.message || e);
                        }
                    } else {
                    setConversations(prev => {
                        let anyChanged = false;
                        const updated = prev.map(c => {
                            const p = data.find(d => d.conversation_id === c.id);
                            if (!p) return c;
                            const newUnread = p.unread_count || 0;
                            const oldUnread = c.unreadCount || 0;
                            if (newUnread === oldUnread) return c;
                            anyChanged = true;
                            if (newUnread > oldUnread) {
                                const currentActive = activeConversationRef.current;
                                if (!currentActive || currentActive.id !== c.id) {
                                    if (preferencesRef.current?.messageSounds !== false) playMessageSound();
                                    if (typeof window !== 'undefined' && eventBus) {
                                        eventBus.emit(EventType.MESSAGE_RECEIVED, { conversationId: c.id }, 'FullMessenger');
                                    }
                                }
                            }
                            return { ...c, unreadCount: newUnread };
                        });
                        if (!anyChanged) return prev;
                        return updated.sort((a, b) => {
                            const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                            const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                            return timeB - timeA;
                        });
                    });
                    }
                } catch (e) {
                    setConnectionStatus('disconnected');
                }
                // Same tick refreshes the per-identity counts behind the Club
                // Arena drawer badge, so it can no longer sit minutes behind
                // the club rows it is summarising.
                try { await refreshUnreadCounts?.(); } catch (_e) { /* non-fatal */ }
            };
            pollInbox();
            const intervalId = setInterval(pollInbox, 30000);
            return () => clearInterval(intervalId);
            // identity is a dependency: switching to a club in the Club Arena
            // widget changes which inbox this poll is counting.
        }, [user?.id, isClubMode, clubPage?.id, refreshUnreadCounts]);

    // Load this account's block list once, so the conversation menu can offer
    // Block or Unblock correctly rather than guessing.
    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const token = getAccessToken();
                const resp = await authedFetch('/api/messenger/block-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ action: 'list' }),
                });
                const json = await resp.json();
                if (!cancelled && json?.success) setBlockedUserIds(json.blocked || []);
            } catch (e) {
                console.warn('[Messenger] Block list load failed:', e?.message || e);
            }
        })();
        return () => { cancelled = true; };
    }, [user?.id]);

    // ── Search across every conversation, not just by contact name ──
    //
    // The sidebar filter only ever matched the other person's name, so there
    // was no way to find a message by what it said. /api/messenger/global-search
    // does exactly that - auth'd, LIKE-escaped, rate limited, capped at 30 -
    // and had zero callers since the day it was written. This is its caller.
    const [messageHits, setMessageHits] = useState([]);
    const [messageHitsLoading, setMessageHitsLoading] = useState(false);

    useEffect(() => {
        const q = (searchQuery || '').trim();
        if (q.length < 2) { setMessageHits([]); setMessageHitsLoading(false); return; }
        let cancelled = false;
        setMessageHitsLoading(true);
        const t = setTimeout(async () => {
            try {
                const token = getAccessToken();
                const resp = await authedFetch('/api/messenger/global-search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ query: q }),
                });
                const json = await resp.json();
                if (!cancelled) setMessageHits(json?.success ? (json.results || []) : []);
            } catch (e) {
                console.warn('[Messenger] Message search failed:', e?.message || e);
                if (!cancelled) setMessageHits([]);
            } finally {
                if (!cancelled) setMessageHitsLoading(false);
            }
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [searchQuery]);

    const handleToggleBlock = useCallback(async (targetUserId, shouldBlock) => {
        if (!targetUserId || !user?.id) return;
        // optimistic, reverted on failure
        setBlockedUserIds(prev => (shouldBlock
            ? Array.from(new Set([...prev, targetUserId]))
            : prev.filter(id => id !== targetUserId)));
        try {
            const token = getAccessToken();
            const resp = await authedFetch('/api/messenger/block-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    action: shouldBlock ? 'block' : 'unblock',
                    targetUserId,
                }),
            });
            const json = await resp.json();
            if (!json?.success) throw new Error(json?.error || 'Block failed');
        } catch (e) {
            console.warn('[Messenger] Block toggle failed:', e?.message || e);
            setBlockedUserIds(prev => (shouldBlock
                ? prev.filter(id => id !== targetUserId)
                : Array.from(new Set([...prev, targetUserId]))));
        }
    }, [user?.id]);

    // Subscribe to real-time messages for ACTIVE conversation
    useEffect(() => {
        if (!user || !activeConversation) return;

        const channel = supabase
            .channel(`conversation:${activeConversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, async (payload) => {
                const newMsg = payload.new;
                // Skip if this is our own message (already added via optimistic update)
                if (newMsg.sender_id === user.id) return;

                // Play sound for incoming message (respect preferences — read from ref to avoid stale closure)
                if (preferencesRef.current.messageSounds !== false) playMessageSound();

                // Fetch sender profile (cached to avoid N queries for same sender)
                let profile = profileCacheRef.current.get(newMsg.sender_id);
                if (!profile) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url, is_vip')
                        .eq('id', newMsg.sender_id)
                        .maybeSingle();
                    profile = data;
                    if (profile) {
                        // LRU eviction: delete oldest entry if at capacity
                        if (profileCacheRef.current.size >= PROFILE_CACHE_MAX) {
                            const oldestKey = profileCacheRef.current.keys().next().value;
                            profileCacheRef.current.delete(oldestKey);
                        }
                        profileCacheRef.current.set(newMsg.sender_id, profile);
                    }
                }

                setMessages(prev => {
                    // Check for duplicates (defensive against null entries)
                    if (prev.some(m => m && m.id === newMsg.id)) return prev;
                    return [...prev, { ...newMsg, profiles: profile || null }];
                });

                // FIX #9: Delivery confirmation — broadcast back to sender that we received their message
                try {
                    if (typingChannelRef.current) {
                        typingChannelRef.current.send({
                            type: 'broadcast',
                            event: 'delivered',
                            payload: { messageId: newMsg.id, receiverId: user.id },
                        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }
                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

                // Update conversation preview and re-sort to move to top
                setConversations(prev => {
                    const updated = prev.map(c =>
                        c.id === activeConversation.id
                            ? { ...c, last_message_preview: newMsg.content, last_message_at: newMsg.created_at }
                            : c
                    );
                    // Re-sort by last_message_at (most recent first)
                    return updated.sort((a, b) => {
                        const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                        const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                        return timeB - timeA;
                    });
                });
            })
            // Real-time UPDATE — catches edits, delete-for-everyone, and reactions
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'social_messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, (payload) => {
                const updatedMsg = payload.new;
                setMessages(prev => prev.map(m => {
                    if (!m) return m;
                    if (m.id !== updatedMsg.id) return m;
                    // Detect real edit: content changed AND message not deleted
                    const wasEdited = m.is_edited || (updatedMsg.content !== m.content && !updatedMsg.is_deleted);
                    return { ...m, content: updatedMsg.content, is_deleted: updatedMsg.is_deleted, updated_at: updatedMsg.updated_at, is_edited: wasEdited };
                }));
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    // Use activeConversation.id (primitive) not the full object — the object changes identity
    // on every setConversations call (sidebar preview refresh), which would tear down the
    // subscription and create a gap window on every incoming message.
    }, [user?.id, activeConversation?.id]);

    // Typing indicator broadcast
    const typingTimerRef = useRef(null);
    useEffect(() => {
        if (!user || !activeConversation) return;

        const typingChannel = supabase
            .channel(`typing:${activeConversation.id}`)
            .on('broadcast', { event: 'typing' }, (payload) => {
                // Someone else is typing
                if (payload.payload.userId !== user.id) {
                    setOtherTyping(true);
                    // Clear previous timer to prevent accumulation
                    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                    typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3000);
                }
            })
            .on('broadcast', { event: 'read_receipt' }, (payload) => {
                // Other user read our messages — update ✓✓ checkmarks in real-time
                if (payload.payload.readerId !== user.id) {
                    setMessages(prev => prev.map(m =>
                        m && m.sender_id === user.id ? { ...m, is_read: true, status: 'read' } : m
                    ));
                }
            })
            // FIX #9: Listen for delivery confirmations from the other user
            .on('broadcast', { event: 'delivered' }, (payload) => {
                if (payload.payload.receiverId !== user.id) {
                    const deliveredId = payload.payload.messageId;
                    setMessages(prev => prev.map(m => {
                        if (!m) return m;
                        // Only upgrade from 'sent' to 'delivered', don't downgrade from 'read'
                        if (m.id === deliveredId && m.sender_id === user.id && m.status !== 'read' && !m.is_read) {
                            return { ...m, status: 'delivered' };
                        }
                        return m;
                    }));
                }
            })
            .subscribe();
            
        typingChannelRef.current = typingChannel;

        return () => {
            typingChannelRef.current = null;
            supabase.removeChannel(typingChannel);
            // Clean up any pending typing timeout on conversation switch
            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
                typingTimerRef.current = null;
            }
            setOtherTyping(false);
        };
    // Same primitive-dep pattern as above — avoids teardown on every sidebar refresh
    }, [user?.id, activeConversation?.id]);

    // ═══════════════════════════════════════════════════════════════════════════
    // 📞 CALL SIGNALING VIA SUPABASE REALTIME
    // Listen for incoming calls, call accepted/declined, call ended
    // BUG-3 FIX: Use refs for showCall/callingUser to avoid channel teardown on state changes
    // ═══════════════════════════════════════════════════════════════════════════
    // Keep refs in sync with state (prevents stale closures in broadcast handlers)
    useEffect(() => { showCallRef.current = showCall; }, [showCall]);
    useEffect(() => { callingUserRef.current = callingUser; }, [callingUser]);

    useEffect(() => {
        if (!user) return;

        const callChannel = supabase
            .channel(`call-signal:${user.id}`)
            .on('broadcast', { event: 'incoming_call' }, (payload) => {
                const { callerId, callerName, callerAvatar, callType, roomName } = payload.payload;

                // Don't show incoming call if we're already in a call (read from ref, not state)
                if (showCallRef.current) return;

                // 🔒 TAB CLAIM: Only one tab should handle the call
                // Use localStorage to prevent multiple tabs from all ringing
                const claimKey = `call_claim_${roomName}`;
                const existingClaim = localStorage.getItem(claimKey);
                const now = Date.now();

                // If another tab claimed this call within the last 30 seconds, ignore
                if (existingClaim && (now - parseInt(existingClaim)) < 30000) {
                    return;
                }

                // Claim this call for this tab
                localStorage.setItem(claimKey, now.toString());

                // Clean up old claims after 35 seconds
                setTimeout(() => localStorage.removeItem(claimKey), 35000);

                setIncomingCall({ callerId, callerName, callerAvatar, callType, roomName });

                // Play ringing sound
                if (incomingCallAudioRef.current) {
                    incomingCallAudioRef.current.loop = true;
                    incomingCallAudioRef.current.play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                }

                // Auto-decline after 30 seconds
                if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = setTimeout(() => {
                    handleDeclineCall('timeout');
                }, 30000);
            })
            .on('broadcast', { event: 'call_declined' }, (payload) => {
                // Read from ref to avoid stale closure
                if (callingUserRef.current) {
                    const reason = payload.payload.reason === 'timeout' ? 'No answer' : 'Call declined';
                    setToast({ type: 'info', message: reason });

                    // ── CALL RECEIPT: Save missed/declined receipt as message in chat ──
                    // DEEP-SWEEP FIX: Use refs to avoid stale closure (this handler is created once at mount)
                    const receiptStatus = payload.payload.reason === 'timeout' ? 'missed' : 'declined';
                    const currentConvo = activeConversationRef.current;
                    const currentCallType = callTypeRef.current;
                    if (currentConvo?.id && user?.id) {
                        const receiptPayload = JSON.stringify({
                            type: currentCallType,
                            duration: 0,
                            status: receiptStatus,
                        });
                        // Route through authenticated API (not anon supabase.rpc) to bypass RLS
                        const receiptToken = getAccessToken();
                        authedFetch('/api/messenger/send-message', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(receiptToken ? { Authorization: `Bearer ${receiptToken}` } : {}),
                            },
                            body: JSON.stringify({
                                conversationId: currentConvo.id,
                                content: `[CALL_RECEIPT]${receiptPayload}`,
                                media_metadata: getClubMetadata(),
                            }),
                        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }

                    // ── MISSED CALL NOTIFICATION: Only for timeout (not for active decline) ──
                    // Declined = callee pressed Decline (they already know). Missed = timeout (they need to know).
                    if (receiptStatus === 'missed' && currentConvo?.otherUser?.id && user?.id) {
                        const token = getAccessToken();
                        authedFetch('/api/messenger/insert-missed-call-notification', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({
                                calleeId: currentConvo.otherUser.id,
                                callType: currentCallType,
                                reason: receiptStatus,
                            }),
                        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }

                    // DEFENSE-IN-DEPTH: Caller-side cancel of pending_calls row.
                    // The callee already cancels, but if their fetch failed this ensures cleanup.
                    if (user?.id && currentConvo?.otherUser?.id) {
                        const cancelToken = getAccessToken();
                        if (cancelToken) {
                            authedFetch('/api/calls/cancel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cancelToken}` },
                                body: JSON.stringify({ callerId: user.id, calleeId: currentConvo.otherUser.id }),
                            }).catch(() => {});
                        }
                    }

                    setCallingUser(null);
                    // BUG-8 FIX: Also close the call modal — caller shouldn't stay in empty room
                    setShowCall(false);
                    setCallRoomName('');
                    // Stop outgoing ring (Web Audio only now)
                    if (outgoingRingToneRef.current) {
                        outgoingRingToneRef.current.stop();
                        outgoingRingToneRef.current = null;
                    }
                }
            })
            .on('broadcast', { event: 'call_accepted' }, (payload) => {
                // The caller's call is already showing, just clear the "calling" state
                setCallingUser(null);
                // Track call start time for call receipt
                callStartTimeRef.current = Date.now();
                // Stop outgoing ring - call connected! (Web Audio only now)
                if (outgoingRingToneRef.current) {
                    outgoingRingToneRef.current.stop();
                    outgoingRingToneRef.current = null;
                }
            })
            .on('broadcast', { event: 'call_ended' }, (payload) => {
                setShowCall(false);
                setCallRoomName('');
                setCallingUser(null);
                setIncomingCall(null);
                setToast({ type: 'info', message: 'Call Ended' });
                // Stop any ringing (Web Audio only now)
                if (outgoingRingToneRef.current) outgoingRingToneRef.current.stop();
                // BUG-7 FIX: Also stop incoming ring audio if it was playing
                if (incomingCallAudioRef.current) {
                    incomingCallAudioRef.current.loop = false;
                    incomingCallAudioRef.current.pause();
                    incomingCallAudioRef.current.currentTime = 0;
                }
                // Stop any running call timeout
                if (callTimeoutRef.current) {
                    clearTimeout(callTimeoutRef.current);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(callChannel);
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        };
    // Use user?.id (primitive) not the full user object — profile updates would tear
    // down the call channel, creating a gap window where incoming calls are dropped.
    }, [user?.id]);

    // Handle accepting incoming call
    const handleAcceptCall = async () => {
        if (!incomingCall || !user) return;

        // Stop ringing
        if (incomingCallAudioRef.current) {
            incomingCallAudioRef.current.loop = false;
            incomingCallAudioRef.current.pause();
            incomingCallAudioRef.current.currentTime = 0;
        }
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

        // Notify caller that we accepted (subscribe, send, then cleanup)
        try {
            const channel = supabase.channel(`call-signal:${incomingCall.callerId}`);
            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Channel timeout')), 5000);
                    channel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            clearTimeout(timeout);
                            resolve();
                        } else if (status === 'CHANNEL_ERROR') {
                            clearTimeout(timeout);
                            reject(new Error('Channel error'));
                        }
                    });
                });
                await channel.send({
                    type: 'broadcast',
                    event: 'call_accepted',
                    payload: { accepterId: user.id }
                });
            } finally {
                // Cleanup after a short delay
                setTimeout(() => supabase.removeChannel(channel), 1000);
            }
        } catch (e) {
            console.warn('[Messenger] Accept call signaling error (non-blocking):', e?.message || e);
        }

        // Join the call
        callStartTimeRef.current = Date.now(); // Track start time for receipt
        setCallRoomName(incomingCall.roomName);
        setCallType(incomingCall.callType);
        setShowCall(true);

        // Cancel pending call in database
        if (incomingCall.pendingCallId) {
            authedFetch('/api/calls/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ callId: incomingCall.pendingCallId }),
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        } else {
            authedFetch('/api/calls/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ callerId: incomingCall.callerId, calleeId: user.id }),
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }

        setIncomingCall(null);
    };

    // Handle declining incoming call
    const handleDeclineCall = async (reason = 'declined') => {
        if (!incomingCall) return;

        // Stop ringing
        if (incomingCallAudioRef.current) {
            incomingCallAudioRef.current.loop = false;
            incomingCallAudioRef.current.pause();
            incomingCallAudioRef.current.currentTime = 0;
        }
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

        // Notify caller that we declined (subscribe, send, then cleanup)
        try {
            const channel = supabase.channel(`call-signal:${incomingCall.callerId}`);
            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Channel timeout')), 5000);
                    channel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            clearTimeout(timeout);
                            resolve();
                        } else if (status === 'CHANNEL_ERROR') {
                            clearTimeout(timeout);
                            reject(new Error('Channel error'));
                        }
                    });
                });
                await channel.send({
                    type: 'broadcast',
                    event: 'call_declined',
                    payload: { declinerId: user?.id, reason }
                });
            } finally {
                // Cleanup after a short delay
                setTimeout(() => supabase.removeChannel(channel), 1000);
            }
        } catch (e) {
            console.warn('[Messenger] Decline call signaling error (non-blocking):', e?.message || e);
        }
        if (incomingCall.pendingCallId) {
            authedFetch('/api/calls/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ callId: incomingCall.pendingCallId }),
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        } else {
            authedFetch('/api/calls/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ callerId: incomingCall.callerId, calleeId: user.id }),
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }

        setIncomingCall(null);
    };

    // Broadcast our typing state — reuse the existing typing channel subscription
    // Phase 3 BUGFIX: Throttle to max once every 2s to prevent flooding Supabase
    const lastTypingBroadcast = useRef(0);
    const broadcastTyping = () => {
        if (!user || !activeConversation) return;
        const now = Date.now();
        if (now - lastTypingBroadcast.current < 2000) return; // Throttle: max once per 2s
        lastTypingBroadcast.current = now;
        if (typingChannelRef.current) {
            typingChannelRef.current.send({
                type: 'broadcast',
                event: 'typing',
                payload: { userId: user.id, username: user.username },
            }).catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
        }
    };

    const loadConversations = async (userId) => {
        // PERF 2026-08-24: collapse concurrent duplicate loads (see
        // loadConvInFlightRef). Keyed on the exact request identity, so a
        // genuine context switch (Personal <-> Club) is never de-duplicated
        // against the previous context's request. The entry is cleared when the
        // request settles, so a LATER refresh always issues a fresh fetch.
        const inFlightKey = `${userId}::${isClubMode && clubPage ? clubPage.id : 'personal'}`;
        const pending = loadConvInFlightRef.current;
        if (pending && pending.key === inFlightKey) return pending.promise;

        const run = loadConversationsInner(userId);
        loadConvInFlightRef.current = { key: inFlightKey, promise: run };
        try {
            return await run;
        } finally {
            if (loadConvInFlightRef.current?.promise === run) loadConvInFlightRef.current = null;
        }
    };

    const loadConversationsInner = async (userId) => {
        //  HARDENED: Circuit breaker + offline detection + retry + guaranteed fallback
        const circuit = getCircuit('messenger-conversations', { failureThreshold: 3, resetTimeout: 30000 });


        // Check offline - return cached data if available
        if (!isOnline()) {
            // Keep existing conversations if we have them
            return;
        }

        try {
            // PRIMARY: Use API with service_role + circuit breaker
            const result = await circuit.execute(
                async () => {
                    const token = getAccessToken();
                    const resp = await authedFetch('/api/messenger/get-conversations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ 
                            userId,
                            contextEntityId: isClubMode && clubPage ? clubPage.id : null
                        }),
                    });
                    if (!resp.ok) throw new Error(`API returned ${resp.status}`);
                    return await resp.json();
                },
                // Fallback when circuit is OPEN - use empty (don't crash)
                async () => ({ success: true, conversations: conversations || [] })
            );

            if (result.success && Array.isArray(result.conversations)) {
                setConversations(result.conversations);
                setCachedConversations(result.conversations); // Persist to cache for instant load
                return;
            }
        } catch (apiErr) {
            console.warn('[Messenger] Conversation API fetch failed, falling back to Supabase direct query:', apiErr?.message || apiErr);
        }

        // FALLBACK 1: Try direct Supabase query with retry
        try {
            const { data, error } = await withRetry(
                async () => {
                    // The identity filter has to be applied here too. Without
                    // it this fallback returned EVERY conversation the user
                    // participates in - private personal DMs included -
                    // rendered underneath the "MESSAGING AS: <CLUB>" header.
                    // The API route's own fallback carries a long comment
                    // about fixing exactly this; the client copy never got it.
                    // IS NOT DISTINCT FROM semantics: null means the personal
                    // inbox, and .eq() would never match a NULL column.
                    const activeContextId = isClubMode && clubPage ? clubPage.id : null;
                    let q = supabase
                        .from('social_conversation_participants')
                        .select(`
                            conversation_id,
                            last_read_at,
                            social_conversations (
                                id,
                                last_message_at,
                                last_message_preview,
                                is_group,
                                group_name,
                                is_request,
                                request_sender_id
                            )
                        `)
                        .eq('user_id', userId);
                    q = activeContextId
                        ? q.eq('context_entity_id', activeContextId)
                        : q.is('context_entity_id', null);
                    const { data: participations, error: partError } = await q
                        .order('social_conversations(last_message_at)', { ascending: false });

                    if (partError) throw partError;
                    return { data: participations, error: null };
                },
                { maxAttempts: 2, baseDelayMs: 500, circuitName: 'supabase-conversations' }
            );

            if (!data || data.length === 0) {
                setConversations([]);
                return;
            }

            // BATCHED ENRICHMENT: Fetch ALL other participants in ONE query (not per-conversation)
            const conversationIds = data.map(p => p.conversation_id);

            // Batch 1: All other participants across all conversations
            const { data: allParticipants } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id, user_id, profiles(id, username, display_name, full_name, avatar_url, is_vip)')
                .in('conversation_id', conversationIds)
                .neq('user_id', userId);

            // Build lookup: conversationId → [participants]
            const participantsByConvo = {};
            (allParticipants || []).forEach(p => {
                if (!participantsByConvo[p.conversation_id]) participantsByConvo[p.conversation_id] = [];
                participantsByConvo[p.conversation_id].push(p);
            });

            // Batch 2: Unread counts — single query for ALL candidate messages
            const earliestRead = data.reduce((earliest, p) => {
                const ts = p.last_read_at || '1970-01-01';
                return ts < earliest ? ts : earliest;
            }, data[0].last_read_at || '1970-01-01');

            let unreadByConvo = {};
            try {
                const { data: unreadMsgs } = await supabase
                    .from('social_messages')
                    .select('conversation_id, created_at')
                    .in('conversation_id', conversationIds)
                    .neq('sender_id', userId)
                    .eq('is_deleted', false)
                    .gt('created_at', earliestRead)
                    .limit(5000);

                // Count per-conversation using per-conversation last_read_at
                const readMap = new Map(data.map(p => [p.conversation_id, p.last_read_at || '1970-01-01']));
                (unreadMsgs || []).forEach(msg => {
                    const lastRead = readMap.get(msg.conversation_id);
                    if (lastRead && msg.created_at > lastRead) {
                        unreadByConvo[msg.conversation_id] = (unreadByConvo[msg.conversation_id] || 0) + 1;
                    }
                });
            } catch (e) { console.warn('[messenger.js] Unread batch failed:', e); }

            // Assemble enriched conversations
            const enriched = data.map(p => {
                const otherParticipants = participantsByConvo[p.conversation_id] || [];
                let otherUser = null;

                if (otherParticipants.length === 1) {
                    otherUser = otherParticipants[0]?.profiles;
                    if (!otherUser && otherParticipants[0]?.user_id) {
                        otherUser = { id: otherParticipants[0].user_id, username: 'User', avatar_url: null };
                    }
                } else if (otherParticipants.length > 1) {
                    otherUser = otherParticipants[0]?.profiles;
                    if (otherUser) {
                        otherUser = { ...otherUser, isGroupChat: true, participantCount: otherParticipants.length + 1 };
                    }
                }

                return {
                    id: p.conversation_id,
                    ...p.social_conversations,
                    otherUser,
                    unreadCount: unreadByConvo[p.conversation_id] || 0,
                    last_read_at: p.last_read_at,
                    isRequest: p.social_conversations?.is_request || false,
                };
            });

            // Sort and set.
            //
            // This used to be `.filter(c => c.otherUser)`, which silently threw
            // away every GROUP conversation - a group has no single other
            // party, so otherUser is null by definition. The union's weekly
            // statement thread is exactly that shape, so on any request that
            // fell through to this path the statements were fetched and then
            // discarded before render. A group is kept if it says so or if it
            // has a title to show.
            // Requests where the user is the RECIPIENT stay filtered out.
            const sorted = enriched
                .filter(c => c.otherUser || c.is_group || c.title || c.group_name)
                .filter(c => !(c.is_request && c.request_sender_id && c.request_sender_id !== userId))
                .sort((a, b) => {
                    const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                    const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                    return timeB - timeA;
                });
            setConversations(sorted);
        } catch (e) {
            console.warn('[MESSENGER] All fallbacks failed:', e);
            // FINAL FALLBACK: Don't crash - keep existing conversations or set empty
            if (!conversations || conversations.length === 0) {
                setConversations([]);
            }
        }
    };
    // Keep ref in sync so the reconnect handler always calls the latest version
    loadConversationsRef.current = loadConversations;

    const loadMessages = async (conversationId) => {
        // Optimistic UI check for instant loading
        const cachedMessages = messageCacheRef.current.get(conversationId);
        if (cachedMessages) {
            setMessages(cachedMessages);
            setLoadingMessages(false);
        } else {
            setLoadingMessages(true);
        }
        setHasMoreMessages(true); // Reset on new conversation
        try {

            // Use API route to bypass RLS issues
            const msgToken = getAccessToken();
            const response = await authedFetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
                },
                body: JSON.stringify({ conversationId, userId: user.id, limit: 50 }),
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.messages) {
                // Staleness guard: if the user switched conversations while this fetch was in-flight,
                // discard the response so we don't overwrite the current conversation's messages.
                if (activeConversationRef.current?.id !== conversationId) return;

                // Filter out hidden messages — re-read from localStorage for freshness
                const freshHiddenIds = (() => {
                    try { return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]')); }
                    catch { return hiddenMessageIds; }
                })();
                const filtered = result.messages.filter(m => !freshHiddenIds.has(m.id));
                setMessages(filtered);
                setHasMoreMessages(result.messages.length >= 50);
            } else {
                if (activeConversationRef.current?.id !== conversationId) return;
                setMessages([]);
                setHasMoreMessages(false);
            }

            // Mark as read - use API with service role to bypass RLS
            try {
                const readToken = getAccessToken();
                await authedFetch('/api/messenger/mark-read', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(readToken ? { Authorization: `Bearer ${readToken}` } : {}),
                    },
                    body: JSON.stringify({ conversationId, userId: user.id }),
                });
            } catch (e) {
                console.warn('Mark read failed:', e);
            }

            // M2 FIX: Only broadcast read receipt if readReceipts preference is enabled
            // Read from ref to avoid stale closure in long-lived callback
            if (preferencesRef.current.readReceipts !== false) {
                try {
                    if (typingChannelRef.current) {
                        typingChannelRef.current.send({
                            type: 'broadcast',
                            event: 'read_receipt',
                            payload: { readerId: user.id, conversationId },
                        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }
                } catch { /* non-critical */ }
            }

            //  Immediately refresh global unread count to clear header badge
            if (refreshUnread) refreshUnread();
            // DEEP SWEEP FIX: Push native global unread sync event to clear badges on other tabs
            broadcastSync('smarter_poker_unread_sync', 'refresh_unread');

        } catch (e) {
            console.warn('Load messages error:', e);
        }
        setLoadingMessages(false);
    };
    // Keep ref in sync so the reconnect handler always calls the latest version
    loadMessagesRef.current = loadMessages;

    // Send lock — prevents double-send from rapid Enter spam, thumbs-up taps, or retry button mashing.
    // Without this, two concurrent authedFetch('/api/messenger/send-message') calls create duplicate DB rows.
    const sendLockRef = useRef(false);

    // Load older messages (pagination — triggered when scrolling to top)
    // FIX #3: useRef-based lock prevents duplicate pagination from rapid scroll
    const paginationLockRef = useRef(false);
    const loadOlderMessages = useCallback(async () => {
        if (!activeConversation || loadingOlderMessages || !hasMoreMessages || messages.length === 0) return;
        // Double-check with ref lock (state updates are async, ref is synchronous)
        if (paginationLockRef.current) return;
        paginationLockRef.current = true;
        setLoadingOlderMessages(true);
        // Capture conversation at pagination start — user may switch before fetch resolves
        const paginationConvId = activeConversation.id;
        try {
            const container = messagesContainerRef.current;
            const prevScrollHeight = container?.scrollHeight || 0;
            const oldestMsg = messages[0];
            const msgToken = getAccessToken();
            const response = await authedFetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: paginationConvId,
                    userId: user.id,
                    before: oldestMsg.created_at,
                    limit: 50,
                }),
            });
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();
            // Staleness guard: discard if user switched conversations while paginating
            if (activeConversationRef.current?.id !== paginationConvId) return;
            if (result.success && result.messages?.length > 0) {
                // Filter out hidden messages — re-read from localStorage for freshness
                const freshHiddenIds = (() => {
                    try { return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]')); }
                    catch { return new Set(); }
                })();
                const filteredOlder = result.messages.filter(m => !freshHiddenIds.has(m.id));
                setMessages(prev => {
                    // Signal scroll effect to skip — rAF below will restore position
                    isPaginatingRef.current = true;
                    return [...filteredOlder, ...prev];
                });
                setHasMoreMessages(result.messages.length >= 50);
                // Preserve scroll position after prepending older messages
                requestAnimationFrame(() => {
                    if (container) {
                        container.scrollTop = container.scrollHeight - prevScrollHeight;
                    }
                });
            } else {
                setHasMoreMessages(false);
            }
        } catch (e) {
            console.warn('Load older messages error:', e);
        }
        setLoadingOlderMessages(false);
        paginationLockRef.current = false;
    }, [activeConversation, loadingOlderMessages, hasMoreMessages, messages, user]);

    const handleSelectConversation = async (conversation) => {
        setActiveConversation(conversation);
        setComposeFocus(false); // Reset auto-focus so switching chats doesn't pop the mobile keyboard
        setShowScrollDown(false); // Phase 3 BUGFIX: Reset FAB when switching conversations
        if (isMobile) setShowSidebar(false);

        // Special handling for Jarvis AI
        if (conversation.isJarvis) {
            // 🟢 Jarvis is ALWAYS online — force status immediately
            setOtherUserStatus('online');
            setOtherUserLastSeen(null);

            // Load Jarvis conversation from localStorage
            const saved = localStorage.getItem('jarvis_messenger_history');
            if (saved) {
                try {
                    const history = JSON.parse(saved);
                    setMessages(history);
                } catch (e) {
                    console.warn('Failed to load Jarvis history:', e);
                    setMessages([{
                        id: 'welcome',
                        content: "Hey! I'm Jarvis, your poker AI assistant. Ask me anything about strategy, hand analysis, or GTO concepts.",
                        created_at: new Date().toISOString(),
                        sender_id: 'jarvis',
                        profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                        isJarvis: true
                    }]);
                }
            } else {
                // Show welcome message
                setMessages([{
                    id: 'welcome',
                    content: "Hey! I'm Jarvis, your poker AI assistant. Ask me anything about strategy, hand analysis, or GTO concepts.",
                    created_at: new Date().toISOString(),
                    sender_id: 'jarvis',
                    profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                    isJarvis: true
                }]);
            }
            return;
        }

        // Regular conversation handling
        await loadMessages(conversation.id);

        // Update local unread count
        setConversations(prev => prev.map(c =>
            c.id === conversation.id ? { ...c, unreadCount: 0 } : c
        ));

        // Check online presence of the other user
        // Capture at dispatch time — if user switches conversations before await resolves,
        // discard the result so we don't stamp the new conversation's UI with stale data.
        const selectedConvId = conversation.id;
        if (conversation.otherUser?.id) {
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('last_seen_at')
                    .eq('id', conversation.otherUser.id)
                    .maybeSingle();
                // Staleness guard: bail if user already switched to a different conversation
                if (activeConversationRef.current?.id !== selectedConvId) return;
                if (profile?.last_seen_at) {
                    const diff = Date.now() - new Date(profile.last_seen_at).getTime();
                    setOtherUserLastSeen(profile.last_seen_at);
                    setOtherUserStatus(diff < 120000 ? 'online' : 'offline'); // 2 min threshold
                } else {
                    setOtherUserStatus('offline');
                    setOtherUserLastSeen(null);
                }
            } catch { setOtherUserStatus('offline'); }
        }
    };

    // Jarvis history is persisted to localStorage but capped at 200 messages.
    // Without a cap, QuotaExceededError eventually throws silently, corrupting history.
    const JARVIS_HISTORY_CAP = 200;
    const saveJarvisHistory = (messages) => {
        try {
            const capped = messages.slice(-JARVIS_HISTORY_CAP);
            localStorage.setItem('jarvis_messenger_history', JSON.stringify(capped));
        } catch (e) {
            console.warn('[Jarvis] localStorage quota exceeded — history not saved:', e?.message);
        }
    };

    const handleSendMessage = async (content) => {
        if (!user || !activeConversation || !content.trim()) return;

        // Special handling for Jarvis AI
        if (activeConversation.isJarvis) {
            // ── Jarvis Daily Usage Limiter (5/day for free users, unlimited for VIP) ──
            const JARVIS_DAILY_LIMIT = 5;
            const today = new Date().toISOString().split('T')[0];
            const usageKey = `jarvis_daily_usage_${today}`;
            const currentUsage = parseInt(localStorage.getItem(usageKey) || '0', 10);

            if (!isVip && currentUsage >= JARVIS_DAILY_LIMIT) {
                const limitMsg = {
                    id: `jarvis-limit-${Date.now()}`,
                    content: `⚡ You've used all ${JARVIS_DAILY_LIMIT} free Jarvis messages today. Upgrade to **VIP** for unlimited Jarvis AI access, advanced analytics, and more!\n\n👑 [Upgrade to VIP →](/hub/diamond-store)`,
                    created_at: new Date().toISOString(),
                    sender_id: 'jarvis',
                    profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                    isJarvis: true
                };
                setMessages(prev => [...prev, limitMsg]);
                return;
            }

            // Increment daily usage for non-VIP
            if (!isVip) {
                localStorage.setItem(usageKey, String(currentUsage + 1));
            }
            const userMsg = {
                id: `user-${Date.now()}`,
                content: content.trim(),
                created_at: new Date().toISOString(),
                sender_id: user.id,
                profiles: { id: user.id, username: user.username, avatar_url: user.avatar_url },
                isUser: true
            };

            setMessages(prev => {
                const updated = [...prev, userMsg];
                saveJarvisHistory(updated);
                return updated;
            });

            // Show typing indicator
            const typingMsg = {
                id: 'typing',
                content: 'Thinking...',
                created_at: new Date().toISOString(),
                sender_id: 'jarvis',
                profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                isJarvis: true,
                isTyping: true
            };
            setMessages(prev => [...prev, typingMsg]);

            try {
                const jarvisToken = getAccessToken();
                const jarvisController = new AbortController();
                const jarvisTimeout = setTimeout(() => jarvisController.abort(), 30000); // 30s — AI can be slow
                const response = await authedFetch('/api/geeves/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(jarvisToken ? { Authorization: `Bearer ${jarvisToken}` } : {}),
                    },
                    signal: jarvisController.signal,
                    body: JSON.stringify({
                        message: content,
                        context: 'messenger',
                        history: messages.slice(-6).map(m => ({
                            role: m.isUser ? 'user' : 'assistant',
                            content: m.content
                        }))
                    })
                });
                clearTimeout(jarvisTimeout);

                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                const data = await response.json();

                // Remove typing indicator and add response
                setMessages(prev => {
                    const withoutTyping = prev.filter(m => m.id !== 'typing');
                    const jarvisMsg = {
                        id: `jarvis-${Date.now()}`,
                        content: data.response || data.message || "I'm having trouble processing that. Try asking again.",
                        created_at: new Date().toISOString(),
                        sender_id: 'jarvis',
                        profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                        isJarvis: true
                    };
                    const updated = [...withoutTyping, jarvisMsg];
                    saveJarvisHistory(updated);
                    return updated;
                });
            } catch (error) {
                console.warn('Jarvis chat error:', error);
                setMessages(prev => {
                    const withoutTyping = prev.filter(m => m.id !== 'typing');
                    const errorMsg = {
                        id: `jarvis-error-${Date.now()}`,
                        content: "Connection issue. Please try again.",
                        created_at: new Date().toISOString(),
                        sender_id: 'jarvis',
                        profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                        isJarvis: true
                    };
                    const updated = [...withoutTyping, errorMsg];
                    saveJarvisHistory(updated);
                    return updated;
                });
            }
            return;
        }

        // Regular message handling
        // Prepend reply context if replying to a message
        let finalContent = content.trim();

        // Send lock: prevent double-send from rapid Enter spam, thumbs-up, or retry mashing
        if (sendLockRef.current) return;
        sendLockRef.current = true;

        // Capture conversation at send time — user may switch before the await resolves
        const sendConversationId = activeConversation.id;

        if (replyToMessage) {
            const replyText = (replyToMessage.content || replyToMessage.text || '').replace(/\[REPLY:[^\]]+\]\s*/, '').slice(0, 80);
            finalContent = `[REPLY:${replyText}] ${finalContent}`;
            setReplyToMessage(null); // Clear reply state after embedding
        }

        // Optimistic update - show message immediately
        const tempId = `temp-${Date.now()}`;
        const optimisticMsg = {
            id: tempId,
            content: finalContent,
            created_at: new Date().toISOString(),
            sender_id: user.id,
            profiles: isClubMode && clubPage
                ? { id: user.id, username: clubPage.name, avatar_url: clubPage.avatar_url, is_club_identity: true, club_id: clubPage.id }
                : { id: user.id, username: user.username, avatar_url: user.avatar_url },
            status: 'sending',
        };
        setMessages(prev => [...prev, optimisticMsg]);
        // Update conversation preview and re-sort to move to top
        setConversations(prev => {
            const updated = prev.map(c =>
                c.id === sendConversationId
                    ? { ...c, last_message_preview: finalContent, last_message_at: new Date().toISOString() }
                    : c
            );
            // Re-sort by last_message_at (most recent first)
            return updated.sort((a, b) => {
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                return timeB - timeA;
            });
        });

        try {
            // Route through API for XSS sanitization, rate limiting, and auth verification
            const sendToken = getAccessToken();
            const sendResp = await authedFetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sendToken ? { Authorization: `Bearer ${sendToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: sendConversationId,
                    content: finalContent,
                    media_metadata: getClubMetadata(),
                }),
            });
            const sendResult = await sendResp.json();
            if (!sendResp.ok || !sendResult.success) throw new Error(sendResult.error || 'Send failed');
            const data = sendResult.msgId;

            // Replace optimistic message with real one — only if still in same conversation
            if (activeConversationRef.current?.id === sendConversationId) {
                const realId = data || tempId;
                setMessages(prev => prev.map(m =>
                    m.id === tempId
                        ? { ...m, id: realId, content: sendResult.content || m.content, status: 'sent' }
                        : m
                ));
            }

            // Notify header to refresh unread badges
            busEmit.dataMutated('messenger');
            // DEEP SWEEP FIX: Push native global Message Sent event
            busEmit.messageSent(sendConversationId, activeConversation.otherUser?.id);
        } catch (e) {
            console.warn('Send message error:', e);
            // Mark message as failed
            setMessages(prev => prev.map(m =>
                m.id === tempId ? { ...m, status: 'failed' } : m
            ));
            setToast({ type: 'error', message: 'Failed To Send Message. Tap To Retry.' });
        } finally {
            sendLockRef.current = false;
        }
    };

    // Retry handler for failed messages — removes failed msg and re-sends
    const handleRetryMessage = (failedMsg) => {
        if (!failedMsg?.content) return;
        setMessages(prev => prev.filter(m => m.id !== failedMsg.id));
        handleSendMessage(failedMsg.content);
    };

    // Handle message reaction
    const handleReaction = async (messageId, emoji) => {
        if (!user) return;
        // Optimistic UI: immediately toggle the reaction locally
        setMessages(prev => prev.map(m => {
            if (!m || m.id !== messageId) return m;
            const existing = m.reactions || {};
            const userList = existing[emoji] || [];
            const hasReacted = userList.includes(user.id);
            const updated = hasReacted
                ? userList.filter(id => id !== user.id)
                : [...userList, user.id];
            return {
                ...m,
                reactions: { ...existing, [emoji]: updated },
            };
        }));

        const rollbackReaction = () => {
            setMessages(prev => prev.map(m => {
                if (!m || m.id !== messageId) return m;
                const existing = m.reactions || {};
                const userList = existing[emoji] || [];
                // Reverse the toggle
                const wasAdded = userList.includes(user.id);
                const reverted = wasAdded
                    ? userList.filter(id => id !== user.id)
                    : [...userList, user.id];
                return { ...m, reactions: { ...existing, [emoji]: reverted } };
            }));
        };

        try {
            // Route through API — fn_toggle_message_reaction is 403 for authenticated role (missing GRANT EXECUTE)
            const token = getAccessToken();
            const resp = await authedFetch('/api/messenger/react-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ messageId, reaction: emoji }),
            });
            const result = await resp.json().catch(() => ({}));
            if (!resp.ok || !result.success) {
                // API returned failure — roll back optimistic update
                rollbackReaction();
                return;
            }
            // DEEP SWEEP FIX: Push native global Message Reacted event
            busEmit.messageReacted(activeConversation?.id, messageId, emoji);
        } catch (e) {
            console.warn('Reaction error:', e);
            rollbackReaction();
        }
    };

    // Handle message deletion (SmarterPoker-style: delete for me vs delete for everyone)
    const handleDeleteMessage = async (messageId, deleteType = 'for_me') => {
        if (!user) return;

        // For Jarvis messages, just remove from localStorage
        if (activeConversation?.isJarvis) {
            setMessages(prev => {
                const updated = deleteType === 'all'
                    ? []
                    : prev.filter(m => m.id !== messageId);
                saveJarvisHistory(updated);
                return updated;
            });
            setToast({ type: 'success', message: deleteType === 'all' ? 'All messages deleted' : 'Message deleted' });
            return;
        }

        try {
            if (deleteType === 'for_everyone') {
                // EAGER STATE SYNCHRONIZATION: Mark as deleted immediately (BFCache-safe)
                const prevMessages = messages;
                setMessages(prev => prev.map(m =>
                    m.id === messageId
                        ? { ...m, content: '[Message deleted]', is_deleted: true }
                        : m
                ));
                setToast({ type: 'success', message: 'Message Deleted For Everyone' });
                busEmit.dataMutated('messenger');
                if (refreshUnread) refreshUnread();
                broadcastSync('smarter_poker_unread_sync', 'refresh_unread');

                // Route through authenticated API — anon supabase.rpc may silently fail if
                // fn_delete_message lacks EXECUTE grant or SECURITY DEFINER.
                const deleteToken = getAccessToken();
                authedFetch('/api/messenger/delete-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(deleteToken ? { Authorization: `Bearer ${deleteToken}` } : {}),
                    },
                    body: JSON.stringify({ messageId }),
                }).then(async (delResp) => {
                    const delResult = await delResp.json().catch(() => ({}));
                    if (!delResp.ok || !delResult.success) {
                        // Rollback on failure
                        setMessages(prevMessages);
                        setToast({ type: 'error', message: 'Could Not Delete Message' });
                    }
                }).catch(() => {
                    setMessages(prevMessages);
                    setToast({ type: 'error', message: 'Could Not Delete Message' });
                });

            } else {
                // Delete for me only — persist to localStorage so it survives refresh
                const hiddenKey = 'sp-hidden-messages';
                try {
                    const existing = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
                    const updated = [...existing, messageId].slice(-1000); // FIFO: keep last 1000
                    localStorage.setItem(hiddenKey, JSON.stringify(updated));
                } catch { /* localStorage full or corrupted */ }
                setMessages(prev => prev.filter(m => m.id !== messageId));
                setToast({ type: 'success', message: 'Message Removed' });
            }
        } catch (e) {
            console.warn('Delete message error:', e);
            setToast({ type: 'error', message: 'Failed To Delete Message' });
        }
    };

    // Handle message editing (inline edit → API call)
    const handleEditMessage = async (message) => {
        setEditingMessage(message);
        setEditText(message.content);
    };

    const handleEditSave = () => {
        if (!editingMessage || !editText.trim() || !user) return;

        // EAGER STATE SYNCHRONIZATION: Update message content immediately (BFCache-safe)
        const newContent = editText.trim();
        const editingId = editingMessage.id;
        const originalContent = editingMessage.content; // Capture for targeted rollback
        setMessages(prev => prev.map(m =>
            m.id === editingId ? { ...m, content: newContent, is_edited: true } : m
        ));
        setEditingMessage(null);
        setEditText('');

        // Fire-and-forget API call in background
        (async () => {
            try {
                const token = getAccessToken();
                const resp = await authedFetch('/api/messenger/edit-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        messageId: editingId,
                        userId: user.id,
                        content: newContent,
                    }),
                });
                const result = await resp.json();
                if (result.success) {
                    // Apply server sanitized content if different
                    const sanitizedContent = result.content || newContent;
                    if (sanitizedContent !== newContent) {
                        setMessages(prev => prev.map(m =>
                            m.id === editingId ? { ...m, content: sanitizedContent } : m
                        ));
                    }
                    setToast({ type: 'success', message: 'Message Edited' });
                    busEmit.messageEdited(activeConversation?.id, editingId);
                } else {
                    // Targeted rollback — restore only the edited message, not the entire snapshot
                    setMessages(prev => prev.map(m =>
                        m.id === editingId ? { ...m, content: originalContent, is_edited: m.is_edited && m.content !== originalContent } : m
                    ));
                    setToast({ type: 'error', message: result.error || 'Edit Failed' });
                }
            } catch (e) {
                console.warn('Edit message error:', e);
                // Targeted rollback on network error
                setMessages(prev => prev.map(m =>
                    m.id === editingId ? { ...m, content: originalContent } : m
                ));
                setToast({ type: 'error', message: 'Failed To Edit Message' });
            }
        })();
    };


    const handleEditCancel = () => {
        setEditingMessage(null);
        setEditText('');
    };

    // Handle reply — sets the reply state with the message being replied to
    const handleReplyMessage = (message) => {
        setReplyToMessage(message);
        setEditingMessage(null); // Cancel any active edit
    };

    // Handle unsend — delete for everyone with undo feedback
    const handleUnsendMessage = async (messageId) => {
        // Save the message content for potential undo
        const originalMessage = messages.find(m => m.id === messageId);
        if (!originalMessage) return;

        // Immediately hide from UI (optimistic)
        setMessages(prev => prev.map(m =>
            m.id === messageId ? { ...m, is_deleted: true, content: 'This message was unsent' } : m
        ));

        setToast({ type: 'info', message: 'Message Unsent' });

        // Delete via authenticated API (not anon supabase.rpc which may lack grants)
        try {
            const unsendToken = getAccessToken();
            const unsendResp = await authedFetch('/api/messenger/delete-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(unsendToken ? { Authorization: `Bearer ${unsendToken}` } : {}),
                },
                body: JSON.stringify({ messageId }),
            });
            const unsendResult = await unsendResp.json().catch(() => ({}));
            if (!unsendResp.ok || !unsendResult.success) throw new Error(unsendResult.error || 'Delete failed');
            // DEEP SWEEP FIX: Data mutated
            busEmit.dataMutated('messenger');
        } catch (e) {
            console.warn('Unsend error:', e);
            // Restore on failure
            setMessages(prev => prev.map(m =>
                m.id === messageId ? originalMessage : m
            ));
            setToast({ type: 'error', message: 'Unsend Failed' });
        }
    };

    // Handle forwarding a message to another conversation
    const handleForwardMessage = (message) => {
        setForwardingMessage(message);
    };

    const handleForwardSend = async (targetConversation) => {
        if (!forwardingMessage || !targetConversation || !user) return;
        try {
            // Strip tokens that don't make sense when forwarded to a different conversation
            let rawContent = forwardingMessage.content || '';

            // Call receipts — never forward (contain call state for THIS conversation's call)
            if (rawContent.startsWith('[CALL_RECEIPT]')) {
                setToast({ type: 'info', message: 'Call Receipts Cannot Be Forwarded' });
                setForwardingMessage(null);
                return;
            }

            // Strip [REPLY:...] prefix — the reply context is meaningless in a different thread
            rawContent = rawContent.replace(/^\[REPLY:[^\]]+\]\s*/, '');

            // If content is now empty (was reply-only), use placeholder
            const content = rawContent.trim()
                ? `[Forwarded] ${rawContent.trim()}`
                : '[Forwarded Message]';

            const token = getAccessToken();
            const resp = await authedFetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: targetConversation.id,
                    content,
                    media_metadata: getClubMetadata(),
                }),
            });
            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || `Forward failed (${resp.status})`);
            }
            setToast({ type: 'success', message: `Message Forwarded To ${targetConversation.otherUser?.full_name || targetConversation.otherUser?.display_name || targetConversation.otherUser?.username || 'Conversation'}` });
            // Update the target conversation's sidebar preview (global listener skips own messages)
            const forwardedAt = new Date().toISOString();
            setConversations(prev => prev.map(c =>
                c.id === targetConversation.id
                    ? { ...c, last_message_preview: content, last_message_at: forwardedAt }
                    : c
            ));
            // DEEP SWEEP FIX: Push native global Message Forwarded event
            busEmit.messageForwarded(forwardingMessage.conversation_id || activeConversation?.id, targetConversation.id);
        } catch (e) {
            console.warn('Forward error:', e);
            setToast({ type: 'error', message: 'Failed To Forward Message' });
        }
        setForwardingMessage(null);
    };

    // Handle GIF send — sends GIF URL as a message
    const handleGifSend = (gifUrl) => {
        if (!gifUrl) return;
        handleSendMessage(`[GIF](${gifUrl})`);
    };

    // Pin/Unpin conversation
    const handleTogglePin = (conversationId) => {
        setPinnedConvoIds(prev => {
            const updated = prev.includes(conversationId)
                ? prev.filter(id => id !== conversationId)
                : [...prev, conversationId].slice(0, 5); // max 5 pinned
            localStorage.setItem('sp-pinned-conversations', JSON.stringify(updated));
            return updated;
        });
    };

    // Handle media (photo/video) upload
    const handleMediaUpload = async (file) => {
        if (!user || !activeConversation || !file) {
            return;
        }
        // Capture conversationId at start — if user switches conversation during a slow
        // upload the setMessages update must target the original conversation's messages.
        const uploadConversationId = activeConversation.id;


        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            setToast({ type: 'error', message: 'Only Images And Videos Are Supported' });
            return;
        }

        // File size limit: 10MB for images, 50MB for videos
        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setToast({ type: 'error', message: `File too large. Max ${isVideo ? '50MB' : '10MB'}` });
            return;
        }

        // Optimistic UI update
        const tempId = `temp-${Date.now()}`;
        const mediaPreview = URL.createObjectURL(file);
        const tempMessage = {
            id: tempId,
            content: isImage ? `Photo` : `Video`,
            media_url: mediaPreview,
            media_type: isImage ? 'image' : 'video',
            created_at: new Date().toISOString(),
            sender_id: user.id,
            status: 'sending',
            profiles: { id: user.id, username: user.full_name || user.username || user.user_metadata?.username, avatar_url: user.avatar_url || user.user_metadata?.avatar_url },
            _blobUrl: mediaPreview, // Track for cleanup
        };
        setMessages(prev => [...prev, tempMessage]);
        setToast({ type: 'success', message: 'Uploading...' });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        try {
            // ── SIGNED-URL UPLOAD (bypasses SDK auth lock, works with social-media bucket) ──
            // The 'user-media' bucket doesn't exist — use upload-url proxy to social-media bucket.
            const uploadToken = getAccessToken();
            const metaRes = await authedFetch('/api/social/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${uploadToken}` },
                body: JSON.stringify({
                    fileName: file.name || `media_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
                    fileSize: file.size,
                    mimeType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
                    folder: 'messages',
                    prefix: user.id,
                }),
            });
            if (!metaRes.ok) {
                const errText = await metaRes.text().catch(() => 'unknown');
                throw new Error(`Upload URL error: ${metaRes.status} ${errText.slice(0, 100)}`);
            }
            const meta = await metaRes.json();
            if (!meta.success || !meta.signedUrl) throw new Error(meta.error || 'No signed URL returned');

            // PUT the file directly to Supabase Storage via the signed URL
            const uploadController = new AbortController();
            const uploadTimeout = setTimeout(() => uploadController.abort(), 5 * 60 * 1000); // 5min for large video
            const uploadRes = await fetch(meta.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || (isVideo ? 'video/mp4' : 'image/jpeg') },
                body: file,
                signal: uploadController.signal,
            });
            clearTimeout(uploadTimeout);
            if (!uploadRes.ok) throw new Error(`Storage PUT failed: HTTP ${uploadRes.status}`);

            const publicUrl = meta.publicUrl;


            // Send message with media URL — route through API for XSS sanitization + rate limiting
            const content = isImage
                ? `[Image](${publicUrl})`
                : `[Video](${publicUrl})`;

            const mediaToken = getAccessToken();
            const mediaResp = await authedFetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(mediaToken ? { Authorization: `Bearer ${mediaToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: uploadConversationId, // use captured id — user may have switched conversations
                    content: content,
                    media_metadata: getClubMetadata(),
                }),
            });
            const mediaResult = await mediaResp.json();
            if (!mediaResp.ok || !mediaResult.success) throw new Error(mediaResult.error || 'Send failed');

            // Update message with real data — only if user hasn't switched conversations
            if (activeConversationRef.current?.id === uploadConversationId) {
                setMessages(prev => prev.map(m =>
                    m.id === tempId
                        ? { ...m, id: mediaResult.msgId || tempId, content, media_url: publicUrl, status: 'sent' }
                        : m
                ));
            }

            // Revoke blob URL to prevent memory leak
            URL.revokeObjectURL(mediaPreview);

            // Notify header to refresh unread badges
            busEmit.dataMutated('messenger');

            setToast({ type: 'success', message: `${isImage ? 'Photo' : 'Video'} sent!` });
        } catch (e) {
            console.warn('Media upload error:', e);
            setMessages(prev => prev.map(m =>
                m.id === tempId && activeConversationRef.current?.id === uploadConversationId
                    ? { ...m, status: 'failed' } : m
            ));
            // Revoke blob URL on failure too to prevent memory leak
            URL.revokeObjectURL(mediaPreview);
            setToast({ type: 'error', message: `Upload failed: ${e.message || 'Unknown error'}` });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // VOICE MESSAGE UPLOAD — Uploads audio blob to Supabase, sends as [Audio](url)
    // ═══════════════════════════════════════════════════════════════════════════
    const handleVoiceSend = async (audioBlob, durationSeconds) => {
        if (!user || !activeConversation || !audioBlob) return;
        // Capture conversationId at start — voice uploads can take seconds; user may switch.
        const voiceConversationId = activeConversation.id;

        // Optimistic UI
        const tempId = `temp-voice-${Date.now()}`;
        const blobUrl = URL.createObjectURL(audioBlob);
        const tempMessage = {
            id: tempId,
            content: `[Audio](${blobUrl})|dur:${durationSeconds || 0}`,
            created_at: new Date().toISOString(),
            sender_id: user.id,
            status: 'sending',
            profiles: { id: user.id, username: user.full_name || user.username || user.user_metadata?.username, avatar_url: user.avatar_url || user.user_metadata?.avatar_url },
        };
        setMessages(prev => [...prev, tempMessage]);
        setToast({ type: 'success', message: 'Sending Voice Message...' });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        try {
            // ── SIGNED-URL UPLOAD for voice (bypasses SDK auth lock, social-media bucket) ──
            const voiceUploadToken = getAccessToken();
            const voiceMetaRes = await authedFetch('/api/social/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${voiceUploadToken}` },
                body: JSON.stringify({
                    fileName: `voice_${Date.now()}.webm`,
                    fileSize: audioBlob.size,
                    mimeType: 'audio/webm',
                    folder: 'messages',
                    prefix: user.id,
                }),
            });
            if (!voiceMetaRes.ok) throw new Error(`Voice upload URL: HTTP ${voiceMetaRes.status}`);
            const voiceMeta = await voiceMetaRes.json();
            if (!voiceMeta.success || !voiceMeta.signedUrl) throw new Error(voiceMeta.error || 'No signed URL');

            const voiceController = new AbortController();
            const voiceUploadTimeout = setTimeout(() => voiceController.abort(), 60000); // 60s for audio upload
            const voicePutRes = await fetch(voiceMeta.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'audio/webm' },
                body: audioBlob,
                signal: voiceController.signal,
            });
            clearTimeout(voiceUploadTimeout);
            if (!voicePutRes.ok) throw new Error(`Voice PUT failed: HTTP ${voicePutRes.status}`);

            const publicUrl = voiceMeta.publicUrl;

            const content = `[Audio](${publicUrl})|dur:${durationSeconds || 0}`;

            // Send via API
            const voiceToken = getAccessToken();
            const resp = await authedFetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(voiceToken ? { Authorization: `Bearer ${voiceToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: voiceConversationId,
                    content: content,
                    media_metadata: getClubMetadata(),
                }),
            });
            const result = await resp.json();
            if (!resp.ok || !result.success) throw new Error(result.error || 'Send failed');

            // Only update UI if user hasn't switched conversations during the upload
            if (activeConversationRef.current?.id === voiceConversationId) {
                setMessages(prev => prev.map(m =>
                    m.id === tempId
                        ? { ...m, id: result.msgId || tempId, content, status: 'sent' }
                        : m
                ));
            }

            URL.revokeObjectURL(blobUrl);
            busEmit.dataMutated('messenger');
            setToast({ type: 'success', message: 'Voice Message Sent' });
        } catch (e) {
            console.warn('Voice upload error:', e);
            setMessages(prev => prev.map(m =>
                m.id === tempId && activeConversationRef.current?.id === voiceConversationId
                    ? { ...m, status: 'failed' } : m
            ));
            URL.revokeObjectURL(blobUrl);
            setToast({ type: 'error', message: `Voice Send Failed: ${e.message}` });
        }
    };

    const handleSearchUser = useCallback((query) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            try {
                const escaped = query.replace(/[%_\\]/g, '\\$&');
                const { data } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .or(`username.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
                    .neq('id', user?.id)
                    .limit(10);

                setSearchResults(data || []);
            } catch (e) {
                console.warn('Search error:', e);
            }
        }, 300);
    }, [user]);

    const handleStartConversation = async (otherUser) => {
        if (!user) return;
        setSearchQuery('');
        setSearchResults([]);

        try {
            // Route through API — fn_get_or_create_conversation requires service role (no GRANT to authenticated)
            const startToken = getAccessToken();
            const resp = await authedFetch('/api/messenger/start-conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(startToken ? { Authorization: `Bearer ${startToken}` } : {}),
                },
                body: JSON.stringify({
                    otherUserId: otherUser.id,
                    // Club mode: scope the new conversation to the club identity so it
                    // lands in the club inbox (personal inbox for the recipient).
                    contextEntityId: isClubMode && clubPage ? clubPage.id : null,
                    contextEntityType: isClubMode && clubPage ? 'club' : null,
                }),
            });
            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${resp.status}`);
            }
            const { conversationId: convId, isRequest } = await resp.json();

            const newConv = {
                id: convId,
                otherUser,
                last_message_preview: null,
                last_message_at: new Date().toISOString(),
                unreadCount: 0,
                isRequest: isRequest || false,
            };

            // Add to list if not exists. If it DOES exist, grab the hydrated version
            // (which has last_message_preview, unreadCount, etc.) so the sidebar
            // preview doesn't blank out when the user opens an existing thread.
            let convToSelect = newConv;
            setConversations(prev => {
                const existing = prev.find(c => c.id === convId);
                if (existing) {
                    // Merge in the latest otherUser profile in case avatar/name changed
                    convToSelect = { ...existing, otherUser };
                    return prev;
                }
                return [newConv, ...prev];
            });

            handleSelectConversation(convToSelect);

            // Show toast if this is a message request (non-friend)
            if (isRequest) {
                setToast({
                    type: 'info',
                    message: `${otherUser.full_name || otherUser.username} isn't your friend — your message will be sent as a request`
                });
            }
        } catch (e) {
            console.warn('Start conversation error:', e);
            setToast({ type: 'error', message: 'Could not create conversation. Please try again later.' });
            throw e; // re-throw so the caller (openCompose) can catch and handle it
        }
    };

    // Handle message search within a conversation
    const handleMessageSearch = useCallback((query) => {
        if (messageSearchTimeout.current) clearTimeout(messageSearchTimeout.current);

        if (!query || query.length < 2 || !activeConversation) {
            setMessageSearchResults([]);
            return;
        }

        messageSearchTimeout.current = setTimeout(async () => {
            try {
                const resp = await authedFetch('/api/messenger/search-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId: activeConversation.id,
                        query,
                    }),
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                setMessageSearchResults(data.results || []);
            } catch (e) {
                console.warn('Message search error:', e);
            }
        }, 300);
    }, [activeConversation]);

    // ════════════════════════════════════════════════════════████████████████
    // 🟢🔴 REAL-TIME PRESENCE: WebSocket-based online/offline tracking
    // Uses Supabase Realtime Presence channel for instant green/red dot updates
    // ════════════════════════════════════════════════════════████████████████
    useEffect(() => {
        if (!user?.id) return;

        // 1. Update DB presence (for cross-page last_seen_at persistence)
        // M3 FIX: Only broadcast presence if activeStatus preference is enabled
        const updateDbPresence = async (isOnlineNow) => {
            try {
                // If active status is disabled, always report offline
                const effectiveOnline = preferencesRef.current.activeStatus !== false ? isOnlineNow : false;
                // Route through API — fn_update_presence returns 403 for authenticated role (missing GRANT EXECUTE)
                const presenceToken = getAccessToken();
                await authedFetch('/api/messenger/update-presence', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(presenceToken ? { Authorization: `Bearer ${presenceToken}` } : {}),
                    },
                    body: JSON.stringify({ isOnline: effectiveOnline }),
                });
            } catch (e) {
                console.warn('[Presence] DB update error:', e);
            }
        };

        updateDbPresence(true);

        // 2. Join global Presence channel — all messenger users share this channel
        const presenceChannel = supabase.channel('messenger-online', {
            config: { presence: { key: user.id } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                const onlineSet = new Set(Object.keys(state || {}));
                setOnlineUsers(onlineSet);
                if (process.env.NODE_ENV === 'development') {
                    console.debug('[Presence] Sync — online users:', onlineSet.size);
                }

                // Update active conversation's other user status in real-time
                if (activeConversationRef.current?.otherUser?.id) {
                    const otherId = activeConversationRef.current.otherUser.id;
                    setOtherUserStatus(onlineSet.has(otherId) ? 'online' : 'offline');
                }
            })
            .on('presence', { event: 'join' }, ({ key }) => {
                setOnlineUsers(prev => new Set([...prev, key]));
                // Instant green dot if the joining user is the active chat partner
                if (activeConversationRef.current?.otherUser?.id === key) {
                    setOtherUserStatus('online');
                }
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                // Instant red dot if the leaving user is the active chat partner
                if (activeConversationRef.current?.otherUser?.id === key) {
                    setOtherUserStatus('offline');
                    setOtherUserLastSeen(new Date().toISOString());
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // M3 FIX: Only track presence if activeStatus preference is enabled
                    if (preferencesRef.current.activeStatus !== false) {
                        await presenceChannel.track({
                            online_at: new Date().toISOString(),
                            user_id: user.id,
                        });
                    }
                }
            });

        // 3. Set offline on unmount or page close
        const handleUnload = () => {
            updateDbPresence(false);
            presenceChannel.untrack();
            
            // EDGE-CASE FIX: If user closes tab while calling/in-call, clean up pending calls.
            // Try both orderings (caller->callee and callee->caller) since we don't know which
            // role this user played in the interrupted call.
            if (showCallRef.current || callingUserRef.current) {
                const token = getAccessToken();
                const otherUserId = activeConversationRef.current?.otherUser?.id;
                if (token && user?.id && otherUserId && otherUserId !== user.id) {
                    try {
                        authedFetch('/api/calls/cancel', {
                            method: 'POST',
                            keepalive: true,
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ callerId: user.id, calleeId: otherUserId })
                        }).catch(() => {});
                        authedFetch('/api/calls/cancel', {
                            method: 'POST',
                            keepalive: true,
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ callerId: otherUserId, calleeId: user.id })
                        }).catch(() => {});
                    } catch (e) { /* ignore — tab is closing */ }
                }
            }
        };
        window.addEventListener('beforeunload', handleUnload);

        // 4. Handle visibility changes (tab switch = away)
        const handleVisibility = () => {
            if (document.hidden) {
                presenceChannel.untrack();
            } else if (preferencesRef.current.activeStatus !== false) {
                // Only re-track if active status is enabled (respect user preference)
                presenceChannel.track({
                    online_at: new Date().toISOString(),
                    user_id: user.id,
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            document.removeEventListener('visibilitychange', handleVisibility);
            supabase.removeChannel(presenceChannel);
            updateDbPresence(false);
        };
    }, [user?.id]);

    // Calculate total unread count — derived from conversations, gated on primitive change
    const totalUnreadSum = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    useEffect(() => {
        setTotalUnreadCount(totalUnreadSum);
        // Update browser tab title with unread badge
        if (typeof document !== 'undefined') {
            document.title = totalUnreadSum > 0 ? `(${totalUnreadSum}) Messenger | Smarter.Poker` : 'Messenger | Smarter.Poker';
        }
        // Update favicon with red badge (potentially expensive canvas op — only run on actual change)
        updateFaviconBadge(totalUnreadSum);
        // Cleanup: reset favicon and title when leaving messenger
        return () => {
            if (typeof document !== 'undefined') {
                document.title = 'Smarter.Poker';
                updateFaviconBadge(0);
            }
        };
    // Use primitive dep — avoids expensive favicon/title updates on every conversations array mutation
    // (e.g. last_message_preview refresh, sidebar reorder) that doesn't change the unread count.
    }, [totalUnreadSum]);

    // ── PostMessage Bridge: emit unread count to embedding parent (Club Arena) ──
    // When embedded via iframe with ?hideHeader=true, notify the parent frame so
    // the CA GlobalHeader badge stays in real-time sync — no polling needed.
    useEffect(() => {
        if (router.query.hideHeader !== 'true') return; // Only when embedded
        if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
        window.parent.postMessage(
            { type: 'MESSENGER_UNREAD_COUNT', count: totalUnreadSum, source: 'smarter-poker-messenger' },
            window.location.origin
        );
    }, [totalUnreadSum, router.query.hideHeader]);

    // ── PostMessage Bridge: emit identity switch to parent (Club Arena) ──
    // Keeps CA header identity indicator in sync when user switches inside the iframe.
    useEffect(() => {
        if (router.query.hideHeader !== 'true') return;
        if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
        window.parent.postMessage(
            {
                type: 'MESSENGER_IDENTITY_CHANGED',
                mode: isClubMode ? 'club' : 'personal',
                clubPageId: clubPage?.id || null,
                source: 'smarter-poker-messenger',
            },
            window.location.origin
        );
    }, [isClubMode, clubPage?.id, router.query.hideHeader]);

    // ── PostMessage Bridge: listen for deep-link commands from parent ──
    // Allows CA to open a specific conversation inside the iframe by sending:
    //   { type: 'OPEN_CONVERSATION', id: '<conversationId>' }
    useEffect(() => {
        if (router.query.hideHeader !== 'true') return;
        const handleParentMessage = (event) => {
            // Security: only accept messages from same origin
            if (event.origin !== window.location.origin) return;
            const { type, id } = event.data || {};
            if (type === 'OPEN_CONVERSATION' && id && conversations.length > 0) {
                const found = conversations.find(c => c.id === id);
                if (found) setActiveConversation(found);
            }
        };
        window.addEventListener('message', handleParentMessage);
        return () => window.removeEventListener('message', handleParentMessage);
    }, [conversations, router.query.hideHeader]);

    // Sync local conversations state to Zustand/localStorage cache
    // This ensures re-entry renders current data (RT updates, mark-read, sent messages)
    useEffect(() => {
        if (conversations.length > 0) {
            setCachedConversations(conversations);
        }
    }, [conversations]);

    // 📲 Link OneSignal to user ID for push notifications
    useEffect(() => {
        let cancelled = false;
        let promptTimer = null;

        if (user?.id && pushReady && setExternalUserId) {
            // Link user's Supabase ID to OneSignal for targeted notifications
            setExternalUserId(user.id);

            // Check Supabase for cross-device persistence (if localStorage missed it)
            if (!pushPromptHandled && !pushSubscribed) {
                supabase.from('profiles').select('messenger_preferences').eq('id', user.id).maybeSingle().then(({ data }) => {
                    if (cancelled) return;
                    if (data?.messenger_preferences?.pushPromptHandled) {
                        setPushPromptHandled(true);
                        try { localStorage.setItem('messenger_push_prompt_handled', '1'); } catch (e) { console.warn('[App] Handled exception:', e); }
                        return;
                    }
                    // User hasn't handled it — show prompt after 3s delay
                    promptTimer = setTimeout(() => {
                        if (!cancelled) setShowPushPrompt(true);
                    }, 3000);
                });
            }
        }

        return () => {
            cancelled = true;
            if (promptTimer) clearTimeout(promptTimer);
        };
    }, [user?.id, pushReady, pushSubscribed, pushPromptHandled, setExternalUserId]);

    /**
     * Persist "the user has answered the push prompt" everywhere it is read:
     * local state, localStorage, and profiles.messenger_preferences. The RPC is
     * an atomic JSONB merge; the fallback is a read-modify-write, which is only
     * safe here because this flag is one-way (false -> true).
     */
    const persistPushPromptHandled = useCallback(async () => {
        setPushPromptHandled(true);
        try {
            localStorage.setItem('messenger_push_prompt_handled', '1');
        } catch (e) {
            console.warn('[Messenger] push prompt localStorage write failed:', e?.message || e);
        }
        if (!user?.id) return;
        try {
            const { error } = await supabase.rpc('fn_merge_messenger_preferences', {
                p_user_id: user.id,
                p_key: 'pushPromptHandled',
                p_value: true,
            });
            if (!error) return;
            throw error;
        } catch (_) {
            try {
                const { data: cur } = await supabase
                    .from('profiles')
                    .select('messenger_preferences')
                    .eq('id', user.id)
                    .maybeSingle();
                const merged = { ...(cur?.messenger_preferences || {}), pushPromptHandled: true };
                const { error: prefErr } = await supabase
                    .from('profiles')
                    .update({ messenger_preferences: merged })
                    .eq('id', user.id);
                if (prefErr) {
                    console.warn('[Messenger] push prompt pref persist failed:', prefErr.message);
                }
            } catch (e2) {
                console.warn('[Messenger] push prompt pref persist failed:', e2?.message || e2);
            }
        }
    }, [user?.id]);

    const handlePushEnable = useCallback(async () => {
        let success = false;
        try {
            if (subscribePush) success = await subscribePush();
        } catch (e) {
            console.warn('[Messenger] push subscribe failed:', e?.message || e);
        }
        await persistPushPromptHandled();
        setShowPushPrompt(false);
        if (success) setToast({ type: 'success', message: 'Push Notifications Enabled' });
    }, [subscribePush, persistPushPromptHandled]);

    const handlePushDismiss = useCallback(async () => {
        await persistPushPromptHandled();
        setShowPushPrompt(false);
    }, [persistPushPromptHandled]);

    // Opened from Club Arena -> the club inbox is what they came for.
    useEffect(() => {
        if (router.query.clubId || router.query.forceIdentity) setClubDrawerOpen(true);
    }, [router.query.clubId, router.query.forceIdentity]);

    // Aggregate unread across every club the user holds a page for, so the
    // collapsed widget can say whether opening it is worth the tap.
    const clubUnreadTotal = (ownedPages || []).reduce(
        (sum, p) => sum + (Number(p?.unread_count) || 0),
        0
    );

    // Start a Jitsi call - Now uses real-time signaling for instant popup
    const startCall = async (type) => {
        if (!activeConversation || !user) return;

        // BUG-9 FIX: Prevent double-click or calling while already in a call
        if (callingUser || showCall) {
            return;
        }

        const otherUser = activeConversation?.otherUser;

        // 🔒 CRITICAL VALIDATION: Ensure we're calling the right person
        if (!otherUser?.id) {
            setToast({ type: 'error', message: 'Cannot Start Call - User Not Found' });
            console.warn('❌ CALL ERROR: otherUser is missing!', { activeConversation });
            return;
        }

        // Block calls for message request conversations — must accept request first
        if (activeConversation.isRequest) {
            setToast({ type: 'error', message: 'Accept The Message Request Before Calling' });
            return;
        }

        // Block calls in group chats - only 1-on-1 calls are supported
        if (otherUser.isGroupChat) {
            setToast({ type: 'error', message: 'Calls Are Only Available In 1-on-1 Conversations' });
            return;
        }

        // NEVER call yourself - this would be a bug
        if (otherUser.id === user.id) {
            setToast({ type: 'error', message: 'Cannot Call Yourself' });
            console.warn('❌ CALL ERROR: Attempted to call self!', { otherUser, currentUser: user.id });
            return;
        }

        // Generate unique room name: smarter-poker-{conversationId}-{timestamp}
        const roomName = `smarter-poker-${activeConversation.id.slice(0, 8)}-${Date.now()}`;
        // BUG FIX: Use profile-fetched name (user.full_name from line 2651), not
        // user.user_metadata.full_name which is stale Google OAuth data for Google
        // sign-in users who changed their profile name after registration.
        const callerName = user.full_name || user.username || user.user_metadata?.full_name || user.user_metadata?.username || 'Someone';
        const callerAvatar = user.avatar_url || user.user_metadata?.avatar_url || null;

        // Set calling state to show "Calling..." UI
        setCallingUser(otherUser);
        setCallType(type);

        // 📞 Send real-time call signal to the other user
        // CRITICAL: Must subscribe before sending broadcast
        try {
            const channel = supabase.channel(`call-signal:${otherUser.id}`);
            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Channel timeout')), 5000);
                    channel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            clearTimeout(timeout);
                            resolve();
                        } else if (status === 'CHANNEL_ERROR') {
                            clearTimeout(timeout);
                            reject(new Error('Channel error'));
                        }
                    });
                });

                await channel.send({
                    type: 'broadcast',
                    event: 'incoming_call',
                    payload: {
                        callerId: user.id,
                        callerName: callerName,
                        callerAvatar: callerAvatar,
                        callType: type,
                        roomName: roomName,
                    }
                });
            } finally {
                // Cleanup channel after a delay (receiver has their own listener)
                setTimeout(() => supabase.removeChannel(channel), 2000);
            }

            // 📱 Create pending call in database (for offline users)
            try {
                const callToken = getAccessToken();
                await authedFetch('/api/calls/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(callToken ? { Authorization: `Bearer ${callToken}` } : {}),
                    },
                    body: JSON.stringify({
                        callerId: user.id,
                        calleeId: otherUser.id,
                        callerName: callerName,
                        callerAvatar: callerAvatar,
                        callType: type,
                        roomName: roomName,
                    }),
                });
            } catch (e) {
                console.warn('[Messenger] Call signal broadcast error (non-blocking):', e?.message || e);
            }


            // Also send push notification for users not on the page
            // This will make their phone RING like a real call!
            try {
                const pushRes = await authedFetch('/api/notifications/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`,
                        message: `${callerName} is calling you`,
                        url: `https://smarter.poker/hub/messenger`,
                        externalUserIds: [otherUser.id],
                        // 📞 CALL-SPECIFIC: Makes the phone ring like a real call!
                        isCall: true,
                        callType: type,
                        roomName: roomName,
                        callerId: user.id,
                    }),
                });
                if (!pushRes.ok) throw new Error(`Request failed (${pushRes.status})`);
                const pushResult = await pushRes.json();
                if (pushResult.error) {
                    console.warn('[Messenger] Push notification reported error (non-blocking):', pushResult.error);
                }
            } catch (pushError) {
                console.warn('[Messenger] Push notification for call failed (non-blocking):', pushError?.message || pushError);
            }
        } catch (e) {
            console.warn('Failed to send call signal:', e);
            setToast({ type: 'error', message: 'Failed To Call. Please Try Again.' });
            setCallingUser(null);
            return;
        }

        // Start the call immediately for the caller
        setCallRoomName(roomName);
        setShowCall(true);

        //  Play outgoing ring sound while waiting for answer
        // BUG-4 FIX: Always stop and clear existing ring tone before creating new one
        if (outgoingRingToneRef.current) {
            outgoingRingToneRef.current.stop();
            outgoingRingToneRef.current = null;
        }
        outgoingRingToneRef.current = createRingTone();
        if (outgoingRingToneRef.current) {
            outgoingRingToneRef.current.start();
        }

        setToast({ type: 'info', message: `Calling ${otherUser.full_name || otherUser.username}...` });
    };

    const isEndingCallRef = useRef(false);
    // End call - notify the other party
    const endCall = async () => {
        if (!showCallRef.current && !callingUserRef.current) return;
        if (isEndingCallRef.current) return;
        isEndingCallRef.current = true;

        // BUG-7 FIX: Stop ALL audio sources immediately
        if (outgoingRingToneRef.current) {
            outgoingRingToneRef.current.stop();
            outgoingRingToneRef.current = null;
        }
        if (incomingCallAudioRef.current) {
            incomingCallAudioRef.current.loop = false;
            incomingCallAudioRef.current.pause();
            incomingCallAudioRef.current.currentTime = 0;
        }

        // Notify the other user that call ended (subscribe, send, then cleanup)
        // BUG-2 FIX: Send on BOTH channel patterns to avoid signal:sender vs signal:receiver mismatch
        if (activeConversation?.otherUser?.id) {
            const otherUserId = activeConversation.otherUser.id;
            const channelNames = [
                `call-signal:${otherUserId}`,   // Other user's listener channel
                `call-signal:${user?.id}`,       // Own channel (callee may be listening here)
            ];
            for (const chName of channelNames) {
                try {
                    const channel = supabase.channel(chName);
                    try {
                        await new Promise((resolve) => {
                            const timeout = setTimeout(resolve, 2000);
                            channel.subscribe((status) => {
                                if (status === 'SUBSCRIBED') {
                                    clearTimeout(timeout);
                                    resolve();
                                }
                            });
                        });
                        await channel.send({
                            type: 'broadcast',
                            event: 'call_ended',
                            payload: { enderId: user?.id }
                        });
                    } finally {
                        setTimeout(() => supabase.removeChannel(channel), 1000);
                    }
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            }
        }

        // Save call receipt as structured JSON message
        if (activeConversation?.id && user?.id) {
            let receiptStatus = 'completed';
            let callDuration = 0;

            if (callStartTimeRef.current) {
                // Call was connected — save completed receipt with duration
                callDuration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                receiptStatus = 'completed';
            } else {
                // Call was never connected — caller hung up before answer = cancelled
                receiptStatus = 'cancelled';
            }

            const receiptPayload = JSON.stringify({
                type: callType,
                duration: callDuration,
                status: receiptStatus,
            });

            try {
                // Route through authenticated API (not anon supabase.rpc) to bypass RLS
                const endReceiptToken = getAccessToken();
                await authedFetch('/api/messenger/send-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(endReceiptToken ? { Authorization: `Bearer ${endReceiptToken}` } : {}),
                    },
                    body: JSON.stringify({
                        conversationId: activeConversation.id,
                        content: `[CALL_RECEIPT]${receiptPayload}`,
                        media_metadata: getClubMetadata(),
                    }),
                });
            } catch (e) {
                console.warn('[Messenger] Call receipt save failed (non-blocking):', e?.message || e);
            }
        }
        callStartTimeRef.current = null;

        // Cancel any pending call in database (in case call wasn't answered).
        // CRITICAL FIX: We don't know if this user is the caller or the callee — try both orderings.
        // The cancel API verifies the authenticated user is a party to the call before deleting.
        if (activeConversation?.otherUser?.id && user?.id) {
            const cancelToken = getAccessToken();
            const otherUserId = activeConversation.otherUser.id;
            if (cancelToken) {
                // Try as caller (we initiated the call)
                authedFetch('/api/calls/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cancelToken}` },
                    body: JSON.stringify({ callerId: user.id, calleeId: otherUserId }),
                }).catch(() => {});
                // Try as callee (they initiated the call) — ensures cleanup regardless of who called whom
                authedFetch('/api/calls/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cancelToken}` },
                    body: JSON.stringify({ callerId: otherUserId, calleeId: user.id }),
                }).catch(() => {});
            }
        }

        setShowCall(false);
        setCallRoomName('');
        setCallingUser(null);
        setToast({ type: 'info', message: 'Call Ended' });
        
        // Reset the flag so future calls can be ended
        setTimeout(() => {
            isEndingCallRef.current = false;
        }, 1000);
    };

    // BUG-4 FIX: Clean up ring tone AudioContext on component unmount
    useEffect(() => {
        return () => {
            if (outgoingRingToneRef.current) {
                outgoingRingToneRef.current.stop();
                outgoingRingToneRef.current = null;
            }
            if (incomingCallAudioRef.current) {
                incomingCallAudioRef.current.pause();
            }
            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
            }
        };
    }, []);

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
                background: C.bg,
                display: 'flex',
            }}>
                {/* Skeleton sidebar */}
                <div style={{
                    width: 360, background: C.card,
                    borderRight: `1px solid ${C.border}`,
                }}>
                    <div style={{ padding: '12px 16px' }}>
                        <div style={{
                            width: 140, height: 28, borderRadius: 8,
                            background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s infinite',
                        }} />
                    </div>
                    <ConversationSkeleton count={8} theme={C} />
                </div>
                {/* Skeleton chat area */}
                <div style={{
                    flex: 1, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{ textAlign: 'center', color: C.textSec }}>
                        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>💬</div>
                        <div>Loading Messenger...</div>
                    </div>
                </div>
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}</style>
            </div>
        );
    }

    // Not logged in — only show after loading completes to prevent flash
    if (!user && !loading) {
        return (
            <>
                <SEOHead
                    title="Messenger — Direct Messages"
                    description="Chat With Friends And Poker Players Directly On Smarter.Poker Messenger."
                    canonical="/hub/messenger"
                />
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: C.bg,
                }}>
                    <div style={{
                        textAlign: 'center',
                        padding: 40,
                        background: C.card,
                        borderRadius: 16,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}></div>
                        <h2 style={{ margin: '0 0 8px', color: C.text }}>Sign In To Messenger</h2>
                        <p style={{ color: C.textSec, marginBottom: 24 }}>Connect With Your Poker Network</p>
                        <Link href="/auth/login" style={{
                            display: 'inline-block',
                            padding: '12px 32px',
                            background: C.blue,
                            color: 'white',
                            borderRadius: 8,
                            fontWeight: 600,
                            textDecoration: 'none',
                        }}>Log In</Link>
                    </div>
                </div>
            </>
        );
    }

    const otherUser = activeConversation?.otherUser;

    // A group thread has no other user, so every header that read otherUser
    // rendered blank for one - including the union's weekly statement thread.
    // The API path names it `title`, the direct-Supabase fallback `group_name`.
    const activeTitle =
        otherUser?.full_name
        || otherUser?.display_name
        || otherUser?.username
        || activeConversation?.title
        || activeConversation?.group_name
        || (activeConversation?.is_group ? 'Group' : '');

    return (
        <>
            <Head>
                <title>Messenger | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <style>{`
                    /* MOBILE-FIRST MESSENGER */
                    .messenger-page { 
                        width: 100%; 
                        max-width: 100%; 
                        margin: 0 auto; 
                        overflow-x: hidden;
                        /* Account for UniversalHeader height + optional bottom nav padding from parent */
                        height: ${router.query.hideHeader === 'true' ? '100vh' : 'calc(100vh - 54px)'};
                        height: ${router.query.hideHeader === 'true' ? '100dvh' : 'calc(100dvh - 54px)'};
                        padding-bottom: ${router.query.bottomPad ? `${parseInt(router.query.bottomPad, 10)}px` : '0px'};
                        box-sizing: border-box;
                    }
                    
                    /* Mobile-specific messenger styles */
                    @media (max-width: 768px) {
                        .messenger-page {
                            height: ${router.query.hideHeader === 'true' ? '100vh' : 'calc(100vh - 54px)'};
                            height: ${router.query.hideHeader === 'true' ? '100dvh' : 'calc(100dvh - 54px)'};
                        }
                        
                        /* Smaller avatars on mobile */
                        .messenger-page img[src*="avatar"],
                        .messenger-page [style*="borderRadius: '50%'"] {
                            max-width: 44px;
                            max-height: 44px;
                        }
                        
                        /* Conversation list - tighter padding */
                        .messenger-page aside {
                            padding: 0;
                        }
                        
                        /* Message bubbles - wider on mobile */
                        .messenger-page [style*="paddingLeft: 60px"],
                        .messenger-page [style*="paddingRight: 60px"] {
                            padding-left: 8px !important;
                            padding-right: 8px !important;
                        }
                    }
                    
                    @keyframes bounce {
                        0%, 60%, 100% { transform: translateY(0); }
                        30% { transform: translateY(-4px); }
                    }
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.1); opacity: 0.8; }
                    }
                    @keyframes reactionPopIn {
                        0% { transform: scale(0.7); opacity: 0; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    /* shimmer defined in loading fallback */
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.3; }
                    }
                `}</style>
            </Head>

            {/* UNIVERSAL HEADER - Mobile responsive with diamond/XP */}
            {router.query.hideHeader !== 'true' && (
                <UniversalHeader
                    pageDepth={1}
                    onMenuClick={() => setMenuOpen(true)}
                />
            )}

            {/* Hamburger Menu */}
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="left"
                theme="dark"
                user={user}
                showProfile={true}
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />

            {/* Forward Message Modal */}
            {forwardingMessage && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setForwardingMessage(null)}>
                    <div style={{
                        background: C.card, borderRadius: 12, width: 360, maxHeight: 480,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 16 }}>
                            Forward Message
                            <button onClick={() => setForwardingMessage(null)} style={{
                                float: 'right', background: 'none', border: 'none', cursor: 'pointer',
                                color: C.textSec, fontSize: 20,
                            }}>×</button>
                        </div>
                        <div style={{ padding: '8px 0', maxHeight: 360, overflowY: 'auto' }}>
                            {conversations.filter(c => c.id !== activeConversation?.id && !c.isJarvis).map(conv => (
                                <button
                                    key={conv.id}
                                    onClick={() => handleForwardSend(conv)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        width: '100%', padding: '10px 16px', border: 'none',
                                        background: 'transparent', cursor: 'pointer', textAlign: 'left',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Avatar src={conv.otherUser?.avatar_url} name={conv.otherUser?.full_name || conv.otherUser?.display_name || conv.otherUser?.username} size={36} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{conv.otherUser?.full_name || conv.otherUser?.display_name || conv.otherUser?.username}</div>
                                    </div>
                                </button>
                            ))}
                            {conversations.filter(c => c.id !== activeConversation?.id && !c.isJarvis).length === 0 && (
                                <div style={{ textAlign: 'center', padding: 20, color: C.textSec }}>No other conversations to forward to</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            <Toast toast={toast} onDismiss={() => setToast(null)} theme={C} />

            {/* Push Notification Subscription Banner */}
            {showPushPrompt && !pushSubscribed && (
                <PushPromptModal
                    setShowPushPrompt={setShowPushPrompt}
                    onEnable={handlePushEnable}
                    onDismiss={handlePushDismiss}
                    C={C}
                    isMobile={isMobile}
                />
            )}

            {/* Ringing Audio for Incoming Calls */}
            <audio
                ref={incomingCallAudioRef}
                src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0tRXFuYz0mFTNNaWxofmh+YKStoJd/aGtbL09OYUFRYWOHeoKK"
            />



            {/* Outgoing Ring: Using Web Audio API createRingTone() instead */}

            {/* ════════════════════════════════════════════════════════
                BUG-2 FIX: "CALLING..." OVERLAY - Shows while waiting for answer
                ════════════════════════════════════════════════════════ */}
            {callingUser && !showCall && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 24,
                        padding: 40,
                        textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        maxWidth: 360,
                        width: '90%',
                    }}>
                        {/* Call Type Icon */}
                        <div style={{
                            fontSize: 48,
                            marginBottom: 16,
                            animation: 'pulse 1.5s infinite',
                        }}>
                            {callType === 'video' ? '\ud83d\udcf9' : '\ud83d\udcde'}
                        </div>

                        {/* Callee Avatar */}
                        <div style={{
                            width: 100,
                            height: 100,
                            borderRadius: '50%',
                            margin: '0 auto 16px',
                            background: callingUser.avatar_url
                                ? `url(${callingUser.avatar_url}) center/cover`
                                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 40,
                            color: 'white',
                            border: '3px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 0 0 4px rgba(0,132,255,0.3), 0 0 30px rgba(0,132,255,0.4)',
                            animation: 'ring 1.5s infinite',
                        }}>
                            {!callingUser.avatar_url && (callingUser.username?.[0]?.toUpperCase() || callingUser.full_name?.[0]?.toUpperCase() || '?')}
                        </div>

                        {/* Callee Name */}
                        <h2 style={{
                            color: 'white',
                            fontSize: 24,
                            fontWeight: 600,
                            margin: '0 0 8px 0',
                        }}>
                            {callingUser.full_name || callingUser.username || 'User'}
                        </h2>

                        {/* Status */}
                        <p style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: 16,
                            margin: '0 0 32px 0',
                        }}>
                            Calling...
                        </p>

                        {/* Cancel Button */}
                        <button
                            onClick={() => {
                                setCallingUser(null);
                                if (outgoingRingToneRef.current) {
                                    outgoingRingToneRef.current.stop();
                                    outgoingRingToneRef.current = null;
                                }
                                endCall();
                            }}
                            style={{
                                width: 70,
                                height: 70,
                                borderRadius: '50%',
                                border: 'none',
                                background: 'linear-gradient(135deg, #ff4757 0%, #c0392b 100%)',
                                color: 'white',
                                fontSize: 28,
                                cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(255,71,87,0.4)',
                                transition: 'transform 0.2s',
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                            title="Cancel Call"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════
                INCOMING CALL POPUP - Shows when someone calls you
                ════════════════════════════════════════════════════════ */}
            {incomingCall && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 24,
                        padding: 40,
                        textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        maxWidth: 360,
                        width: '90%',
                    }}>
                        {/* BUG-6 FIX: Call Type Icon — show actual icons, not plain text */}
                        <div style={{
                            fontSize: 48,
                            marginBottom: 16,
                            animation: 'pulse 1.5s infinite',
                        }}>
                            {incomingCall.callType === 'video' ? '📹' : '📞'}
                        </div>

                        {/* Caller Avatar */}
                        <div style={{
                            width: 100,
                            height: 100,
                            borderRadius: '50%',
                            margin: '0 auto 16px',
                            background: incomingCall.callerAvatar
                                ? `url(${incomingCall.callerAvatar}) center/cover`
                                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 40,
                            color: 'white',
                            border: '3px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 0 0 4px rgba(0,132,255,0.3), 0 0 30px rgba(0,132,255,0.4)',
                            animation: 'ring 1.5s infinite',
                        }}>
                            {!incomingCall.callerAvatar && (incomingCall.callerName?.[0]?.toUpperCase() || '?')}
                        </div>

                        {/* Caller Name */}
                        <h2 style={{
                            color: 'white',
                            fontSize: 24,
                            fontWeight: 600,
                            margin: '0 0 8px 0',
                        }}>
                            {incomingCall.callerName}
                        </h2>

                        {/* Call Type Label */}
                        <p style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: 16,
                            margin: '0 0 32px 0',
                        }}>
                            Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call...
                        </p>

                        {/* Accept / Decline Buttons */}
                        <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
                            <button
                                onClick={() => handleDeclineCall('declined')}
                                style={{
                                    width: 70,
                                    height: 70,
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #ff4757 0%, #c0392b 100%)',
                                    color: 'white',
                                    fontSize: 28,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 20px rgba(255,71,87,0.4)',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                title="Decline"
                            >
                                ×
                            </button>
                            <button
                                onClick={handleAcceptCall}
                                style={{
                                    width: 70,
                                    height: 70,
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #00b894 0%, #27ae60 100%)',
                                    color: 'white',
                                    fontSize: 28,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 20px rgba(0,184,148,0.4)',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                title="Accept"
                            >
                                📞
                            </button>
                        </div>
                    </div>

                    {/* Ring Animation Keyframes */}
                    <style>{`
                        @keyframes ring {
                            0%, 100% { box-shadow: 0 0 0 4px rgba(0,132,255,0.3), 0 0 30px rgba(0,132,255,0.4); }
                            50% { box-shadow: 0 0 0 8px rgba(0,132,255,0.2), 0 0 50px rgba(0,132,255,0.6); }
                        }
                        @keyframes pulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.1); }
                        }
                    `}</style>
                </div>
            )}

            {/* LiveKit Video Call Modal - True seamless WhatsApp/Snapchat style */}
            {showCall && callRoomName && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: '#000',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* Call Header */}
                    <div style={{
                        padding: '12px 16px',
                        background: 'rgba(0,0,0,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #333',
                        zIndex: 10,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {callType === 'video' ? <VideoIcon size={24} color="white" /> : <PhoneIcon size={24} color="white" />}
                            <div>
                                <div style={{ color: 'white', fontWeight: 600 }}>
                                    {callType === 'video' ? 'Video' : 'Voice'} Call with {activeConversation?.otherUser?.full_name || activeConversation?.otherUser?.display_name || activeConversation?.otherUser?.username || 'User'}
                                </div>
                                <div style={{ color: '#888', fontSize: 12 }}>Smarter Poker Video</div>
                            </div>
                        </div>
                        <button
                            onClick={endCall}
                            style={{
                                padding: '10px 20px',
                                background: '#E53935',
                                color: 'white',
                                border: 'none',
                                borderRadius: 8,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            📵 End Call
                        </button>
                    </div>
                    {/* LiveKit Video Component — BUG-1 FIX: Pass auth token for API calls */}
                    <LiveKitCall
                        roomName={callRoomName}
                        participantName={user?.full_name || user?.username || user?.user_metadata?.username || 'User'}
                        participantId={user?.id}
                        callType={callType}
                        otherUserName={activeConversation?.otherUser?.full_name || activeConversation?.otherUser?.display_name || activeConversation?.otherUser?.username}
                        onEnd={endCall}
                        authToken={getAccessToken()}
                    />
                </div>
            )}

            <div className="messenger-page" style={{
                display: 'flex',
                background: C.bg,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
            }}>
                {/* ════════════════════════════════════════════════════════
                    LEFT SIDEBAR - Conversation List
                    ════════════════════════════════════════════════════════ */}
                <aside style={{
                    width: isMobile ? '100%' : 360,
                    background: C.card,
                    borderRight: `1px solid ${C.border}`,
                    display: (isMobile && !showSidebar) ? 'none' : 'flex',
                    flexDirection: 'column',
                    height: '100%',
                }}>
                    {/* Header - SmarterPoker Messenger Style */}
                    <div style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.blue }}>Messenger</h1>
                            {/* M6: Unread badge on sidebar header */}
                            {totalUnreadCount > 0 && (
                                <div style={{
                                    minWidth: 22, height: 22, borderRadius: 11,
                                    background: C.red, color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: 700, padding: '0 6px',
                                }}>{totalUnreadCount > 99 ? '99+' : totalUnreadCount}</div>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                setComposing(true);
                                setTimeout(() => searchInputRef.current?.focus(), 100);
                            }}
                            title="New Message"
                            style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: composing ? C.blue : C.bg,
                                border: 'none', cursor: 'pointer', fontSize: 16,
                                color: composing ? 'white' : C.text,
                                transition: 'all 0.2s',
                            }}>✏️</button>
                    </div>

                    {/* Search */}
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        onSearchUser={handleSearchUser}
                        searchResults={searchResults}
                        onSelectUser={(user) => {
                            handleStartConversation(user);
                            setComposing(false);
                        }}
                        inputRef={searchInputRef}
                        composing={composing}
                        theme={C}
                    />

                    {/* ── CLUB ARENA widget ──────────────────────────────────
                        The club inboxes are not a second messenger; they are a
                        section of this one. Collapsed it is a labelled row with
                        the aggregate club unread count. Opened it is the identity
                        strip: Me, then one tile per club, each switching the
                        inbox via context_entity_id — private DMs stay private,
                        the club context only decides which inbox they land in.

                        Gate note: hasClubPage is ownedPages.length > 0, which is
                        false for the whole window between mount and the pages
                        fetch resolving — and stays false forever if that fetch
                        fails or the session is not readable yet. Gating on it
                        alone meant the section silently did not exist on the one
                        entry point it was built for. When we arrived from Club
                        Arena (?clubId=) we know the user came for a club, so the
                        section renders and says what it is waiting for. */}
                    {(hasClubPage || router.query.clubId || router.query.forceIdentity) && (
                        <div style={{ padding: '0 16px 12px 16px', borderBottom: `1px solid ${C.border}`, marginBottom: 8, flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => setClubDrawerOpen((v) => !v)}
                                aria-expanded={clubDrawerOpen}
                                aria-controls="club-arena-inboxes"
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 0',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: isClubMode ? C.blue : C.text,
                                    font: 'inherit',
                                    textAlign: 'left',
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 26,
                                        height: 26,
                                        borderRadius: 8,
                                        background: isClubMode ? `${C.blue}22` : `${C.textSec}18`,
                                        color: isClubMode ? C.blue : C.textSec,
                                        fontSize: 13,
                                        flexShrink: 0,
                                    }}
                                >
                                    ♠
                                </span>
                                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>
                                    CLUB ARENA
                                </span>
                                {!clubDrawerOpen && clubUnreadTotal > 0 && (
                                    <span
                                        style={{
                                            background: '#ef4444',
                                            color: 'white',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            borderRadius: 10,
                                            minWidth: 18,
                                            height: 18,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '0 5px',
                                        }}
                                    >
                                        {clubUnreadTotal > 99 ? '99+' : clubUnreadTotal}
                                    </span>
                                )}
                                <span
                                    aria-hidden="true"
                                    style={{
                                        color: C.textSec,
                                        fontSize: 11,
                                        transform: clubDrawerOpen ? 'rotate(90deg)' : 'none',
                                        transition: 'transform 0.2s ease',
                                    }}
                                >
                                    ▶
                                </span>
                            </button>

                            {/* "Loading" only while identity detection is still
                                running. It used to render on !hasClubPage with
                                no settled flag, so a user who owns no club page
                                - or whose lookup failed, since both paths in
                                ActiveIdentityContext swallow into console.warn
                                - sat on "Loading your clubs..." permanently. */}
                            {clubDrawerOpen && !hasClubPage && !identityLoaded && (
                                <div style={{ padding: '4px 0 10px 0', fontSize: 12, color: C.textSec }}>
                                    Loading your clubs...
                                </div>
                            )}

                            {clubDrawerOpen && !hasClubPage && identityLoaded && (
                                <div style={{ padding: '4px 0 10px 0', fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
                                    No club inboxes yet. Clubs you own or help run show up here,
                                    each with its own inbox.
                                </div>
                            )}

                            {clubDrawerOpen && hasClubPage && (
                            <div id="club-arena-inboxes">
                            <div className="no-scrollbar" style={{ display: 'flex', gap: 20, overflowX: 'auto', padding: '4px 0 8px 0' }}>
                                {/* Personal Identity */}
                                <div onClick={() => switchToPersonal()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
                                    <div style={{ 
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 60,
                                        height: 60,
                                        borderRadius: '50%', 
                                        border: `2px solid ${!isClubMode ? C.blue : 'transparent'}`,
                                        boxShadow: !isClubMode ? `0 0 10px ${C.blue}44` : 'none',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        background: C.card,
                                    }}>
                                        <Avatar src={user?.avatar_url || user?.user_metadata?.avatar_url} name={user?.full_name || user?.user_metadata?.full_name || user?.username || 'Personal'} size={54} showOnline={false} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: !isClubMode ? 700 : 500, color: !isClubMode ? C.blue : C.textSec, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Me</span>
                                    
                                    {/* Personal Unread Count (Placeholder if needed, usually personal count is in header) */}
                                    {!isClubMode && totalUnreadCount > 0 && (
                                        <div style={{ position: 'absolute', top: -2, right: -2, background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: `2px solid ${C.bg}` }}>
                                            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                                        </div>
                                    )}
                                </div>
                                
                                {ownedPages.map(page => (
                                    <div key={page.id} onClick={() => switchToClub(page)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
                                        <div style={{ 
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: 60,
                                            height: 60,
                                            borderRadius: '50%', 
                                            border: `2px solid ${isClubMode && clubPage?.id === page.id ? C.blue : 'transparent'}`,
                                            boxShadow: isClubMode && clubPage?.id === page.id ? `0 0 12px ${C.blue}66` : 'none',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                            background: C.card,
                                            transform: isClubMode && clubPage?.id === page.id ? 'scale(1.05)' : 'scale(1)',
                                        }}>
                                            <Avatar src={page.avatar_url} name={page.name} size={54} showOnline={false} />
                                        </div>
                                        
                                        {/* Entity Type Badge */}
                                        <div style={{ 
                                            position: 'absolute', 
                                            bottom: 18, 
                                            right: 0, 
                                            background: C.bg, 
                                            borderRadius: '50%', 
                                            width: 18, 
                                            height: 18, 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            border: `1px solid ${C.border}`,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                            color: page.page_type === 'home_game' ? '#10b981' : (page.page_type === 'casino' ? '#f59e0b' : C.blue),
                                        }}>
                                            {page.page_type === 'home_game' ? <Home size={10} /> : (page.page_type === 'casino' ? <Building size={10} /> : <Crown size={10} />)}
                                        </div>

                                        <span title={page.name} style={{ 
                                            fontSize: 11, 
                                            fontWeight: isClubMode && clubPage?.id === page.id ? 700 : 500, 
                                            color: isClubMode && clubPage?.id === page.id ? C.blue : C.textSec,
                                            whiteSpace: 'nowrap',
                                            maxWidth: 64,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            textAlign: 'center'
                                        }}>
                                            {page.name}
                                        </span>

                                        {/* Unread Badge */}
                                        {page.unread_count > 0 && (
                                            <div style={{ position: 'absolute', top: -2, right: -2, background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: `2px solid ${C.bg}` }}>
                                                {page.unread_count > 99 ? '99+' : page.unread_count}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Messaging As Banner */}
                            <div style={{ 
                                marginTop: 8, 
                                padding: '6px 12px', 
                                background: isClubMode ? `${C.blue}15` : `${C.textSec}10`, 
                                borderRadius: 8, 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 8,
                                border: `1px dashed ${isClubMode ? `${C.blue}44` : 'transparent'}`,
                                transition: 'all 0.3s ease'
                            }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: isClubMode ? C.blue : C.textSec, boxShadow: isClubMode ? `0 0 6px ${C.blue}` : 'none' }} />
                                <span style={{ fontSize: 11, color: isClubMode ? C.blue : C.textSec, fontWeight: 600, letterSpacing: '0.01em' }}>
                                    {isClubMode ? `MESSAGING AS: ${clubPage?.name?.toUpperCase() || 'CLUB'}` : 'MESSAGING AS: PERSONAL ACCOUNT'}
                                </span>
                            </div>
                            </div>
                            )}

                            {/* Collapsed but scoped to a club: say so, and give a
                                one-tap way back. Otherwise the inbox looks empty
                                for no visible reason. */}
                            {!clubDrawerOpen && isClubMode && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>
                                        {clubPage?.name || 'Club'} inbox
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => switchToPersonal()}
                                        style={{
                                            marginLeft: 'auto',
                                            background: 'none',
                                            border: `1px solid ${C.border}`,
                                            borderRadius: 8,
                                            color: C.textSec,
                                            fontSize: 11,
                                            padding: '3px 8px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Back to personal
                                    </button>
                                </div>
                            )}
                        </div>
                    )}


                    {/* Message Requests Banner — Facebook-style */}
                    {messageRequestCount > 0 && (
                        <Link href="/hub/messenger/requests" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 16px', margin: '0 12px 8px', borderRadius: 10,
                            background: 'linear-gradient(135deg, rgba(0, 132, 255, 0.08), rgba(0, 132, 255, 0.04))',
                            border: `1px solid rgba(0, 132, 255, 0.15)`,
                            cursor: 'pointer', textDecoration: 'none', transition: 'all 0.2s',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #0084FF, #0066CC)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="none">
                                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                                    </svg>
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Message Requests</div>
                                    <div style={{ fontSize: 12, color: C.textSec }}>{messageRequestCount} pending {messageRequestCount === 1 ? 'request' : 'requests'}</div>
                                </div>
                            </div>
                            <div style={{
                                minWidth: 22, height: 22, borderRadius: 11,
                                background: '#0084FF', color: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: 700, padding: '0 6px',
                            }}>{messageRequestCount}</div>
                        </Link>
                    )}

                    {/* Conversations List - Only show actual conversations with messages */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {conversations.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                {/* An empty CLUB inbox is not the same as an empty
                                    personal one, and saying "No Conversations Yet"
                                    for both reads as a bug the first time a club
                                    inbox is opened. */}
                                <div style={{ color: C.text, fontWeight: 500, marginBottom: 4 }}>
                                    {isClubMode
                                        ? `No messages in ${clubPage?.name || 'this club'} yet`
                                        : 'No Conversations Yet'}
                                </div>
                                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
                                    {isClubMode
                                        ? 'Conversations you start while messaging as this club appear here. Your personal messages stay in your own inbox.'
                                        : 'Search For People To Start Messaging!'}
                                </div>
                                <button
                                    onClick={() => {
                                        setComposing(true);
                                        setTimeout(() => searchInputRef.current?.focus(), 100);
                                    }}
                                    style={{
                                        padding: '12px 24px',
                                        background: C.blue,
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 24,
                                        fontWeight: 600,
                                        fontSize: 15,
                                        cursor: 'pointer',
                                        marginTop: 16,
                                    }}>Search For People</button>
                            </div>
                        ) : (
                            <>                                {/* Regular Conversations */}
                                {conversations.filter(conv => {
                                    if (!searchQuery) return true;
                                    const q = searchQuery.toLowerCase();
                                    const otherName = conv.otherUser?.full_name?.toLowerCase() || '';
                                    const otherDisplayName = conv.otherUser?.display_name?.toLowerCase() || '';
                                    const otherUsername = conv.otherUser?.username?.toLowerCase() || '';
                                    // Group threads have no other user, so matching on
                                    // names alone hid them the moment anything was typed.
                                    const groupTitle = (conv.title || conv.group_name || '').toLowerCase();
                                    return otherName.includes(q) || otherDisplayName.includes(q)
                                        || otherUsername.includes(q) || groupTitle.includes(q);
                                }).sort((a, b) => {
                                    // Pinned conversations always sort to top (using localStorage-backed state)
                                    const aPinned = pinnedConvoIds.includes(a.id);
                                    const bPinned = pinnedConvoIds.includes(b.id);
                                    if (aPinned && !bPinned) return -1;
                                    if (!aPinned && bPinned) return 1;
                                    return 0; // Preserve existing chronological order
                                }).map(conv => (
                                    <ConversationItem
                                        key={conv.id}
                                        conversation={conv}
                                        isActive={activeConversation?.id === conv.id}
                                        onClick={() => handleSelectConversation(conv)}
                                        currentUserId={user.id}
                                        onlineUsers={onlineUsers}
                                        isPinned={pinnedConvoIds.includes(conv.id)}
                                        isBlocked={blockedUserIds.includes(
                                            conv.otherUser?.id
                                            || conv.participants?.find(p => p.id !== user.id)?.id
                                        )}
                                        onBlock={handleToggleBlock}
                                        theme={C}
                                        onPin={(id) => {
                                            setPinnedConvoIds(prev => {
                                                const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
                                                try { localStorage.setItem('sp-pinned-conversations', JSON.stringify(next)); } catch (e) { console.warn('[App] Handled exception:', e); }
                                                return next;
                                            });
                                        }}
                                        onDelete={async (id) => {
                                            // Optimistic UI: remove immediately
                                            setConversations(prev => prev.filter(c => c.id !== id));
                                            if (activeConversation?.id === id) {
                                                setActiveConversation(null);
                                                setShowSidebar(true);
                                            }
                                            // Persist: delete from Supabase so it doesn't reappear on refresh
                                            try {
                                                const token = getAccessToken();
                                                await authedFetch('/api/messenger/delete-conversation', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                    },
                                                    body: JSON.stringify({ conversationId: id, userId: user.id }),
                                                });
                                                busEmit.dataMutated('messenger');
                                            } catch (e) {
                                                console.warn('[Messenger] Delete conversation failed:', e);
                                                // Re-fetch to restore if delete failed
                                                loadConversations(user.id);
                                            }
                                        }}
                                    />
                                ))}

                                {/* Messages matching the search, from every
                                    conversation. The list above only ever
                                    filtered on the other person's name. */}
                                {searchQuery.trim().length >= 2 && (
                                    <div style={{ padding: '4px 0 12px' }}>
                                        <div style={{
                                            padding: '10px 16px 6px',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            color: C.textSec,
                                        }}>
                                            Messages
                                            {messageHitsLoading ? '' : ` (${messageHits.length})`}
                                        </div>

                                        {messageHitsLoading && (
                                            <div style={{ padding: '6px 16px', fontSize: 13, color: C.textSec }}>
                                                Searching...
                                            </div>
                                        )}

                                        {!messageHitsLoading && messageHits.length === 0 && (
                                            <div style={{ padding: '6px 16px', fontSize: 13, color: C.textSec }}>
                                                No messages match that.
                                            </div>
                                        )}

                                        {!messageHitsLoading && messageHits.map(hit => {
                                            const conv = conversations.find(c => c.id === hit.conversation_id);
                                            const who = hit.isOwn
                                                ? 'You'
                                                : (hit.sender?.display_name || hit.sender?.username || 'Unknown');
                                            return (
                                                <button
                                                    key={hit.id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (conv) {
                                                            setSearchQuery('');
                                                            handleSelectConversation(conv);
                                                        }
                                                    }}
                                                    disabled={!conv}
                                                    title={conv ? 'Open this conversation' : 'Conversation not in this inbox'}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        padding: '8px 16px',
                                                        border: 'none',
                                                        background: 'transparent',
                                                        cursor: conv ? 'pointer' : 'default',
                                                        opacity: conv ? 1 : 0.55,
                                                    }}
                                                    onMouseEnter={e => { if (conv) e.currentTarget.style.background = C.hoverBg; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    <div style={{
                                                        fontSize: 12,
                                                        color: C.textSec,
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        gap: 8,
                                                    }}>
                                                        <span style={{ fontWeight: 600 }}>{who}</span>
                                                        <span>{hit.created_at ? new Date(hit.created_at).toLocaleDateString() : ''}</span>
                                                    </div>
                                                    <div style={{
                                                        fontSize: 13,
                                                        color: C.text,
                                                        marginTop: 2,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {hit.content}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        borderTop: `1px solid ${C.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        {/* Jarvis AI - Locked at Bottom (above Report Bug) */}
                        <div
                            onClick={() => handleSelectConversation({
                                id: 'jarvis-ai',
                                isJarvis: true,
                                otherUser: {
                                    id: 'jarvis',
                                    username: 'jarvis',
                                    full_name: 'Jarvis',
                                    avatar_url: null
                                },
                                last_message_preview: 'Your Poker AI Assistant',
                                last_message_at: new Date().toISOString(),
                                unreadCount: 0
                            })}
                            style={{
                                padding: '12px 16px',
                                cursor: 'pointer',
                                background: activeConversation?.id === 'jarvis-ai'
                                    ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 150, 255, 0.1))'
                                    : '#2a2a2a',
                                borderBottom: `1px solid ${C.border}`,
                                borderLeft: activeConversation?.id === 'jarvis-ai' ? '3px solid #00D4FF' : '3px solid transparent',
                                transition: 'all 0.2s',
                                position: 'relative'
                            }}
                            onMouseEnter={e => {
                                if (activeConversation?.id !== 'jarvis-ai') {
                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.05)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (activeConversation?.id !== 'jarvis-ai') {
                                    e.currentTarget.style.background = '#2a2a2a';
                                }
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {/* Jarvis Avatar */}
                                <Image src="/images/jarvis-avatar.png" alt="Jarvis AI" width={48} height={48} style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    boxShadow: '0 2px 8px rgba(0, 212, 255, 0.3)',
                                    border: '2px solid #00D4FF',
                                    position: 'relative'
                                }} />
                                {/* Always Online Indicator */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 36,
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    background: C.green,
                                    border: '2px solid white'
                                }} />

                                {/* Jarvis Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        marginBottom: 4
                                    }}>
                                        <span style={{
                                            fontWeight: 600,
                                            fontSize: 15,
                                            color: '#00D4FF'
                                        }}>Jarvis</span>
                                    </div>
                                    <div style={{
                                        fontSize: 13,
                                        color: '#00D4FF',
                                        lineHeight: 1.3
                                    }}>
                                        Your Personal Smarter.Poker Coach - Always Online Always Available! Ask Me Anything...
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{
                            padding: 12,
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                        }}>
                            <ReportBugWidget contextPath="/hub/messenger" theme={isDarkMode ? 'dark' : 'light'} />
                            
                            <Link href="/hub/social-media" style={{
                                color: C.blue, fontSize: 14, fontWeight: 500, textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 28, height: 28, borderRadius: '50%', background: C.bg,
                                    fontSize: 14, color: C.text,
                                }}>←</span>
                            Back To Social Hub
                        </Link>
                    </div>
                </div>
                </aside>

                {/* ════════════════════════════════════════════════════════
                    RIGHT PANEL - Chat Window
                    ════════════════════════════════════════════════════════ */}
                <main style={{
                    flex: 1,
                    display: (isMobile && showSidebar) ? 'none' : 'flex',
                    flexDirection: 'column',
                    background: C.card,
                    position: 'relative', // Phase 3 BUGFIX: anchor for scroll-to-bottom FAB
                }}>
                    {
                        activeConversation ? (
                            <>
                                {/* Chat Header */}
                                <div style={{
                                    padding: '10px 16px',
                                    borderBottom: `1px solid ${C.border}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    background: C.card,
                                }}>
                                    {isMobile && (
                                        <button
                                            onClick={() => {
                                                setShowSidebar(true);
                                                setActiveConversation(null);
                                            }}
                                            style={{
                                                background: C.bg, border: 'none', cursor: 'pointer',
                                                fontSize: 16, padding: '6px 10px',
                                                borderRadius: 8, color: C.blue, fontWeight: 600,
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                marginRight: 4,
                                            }}
                                            aria-label="Back to conversations"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="15 18 9 12 15 6" />
                                            </svg>
                                            Back
                                        </button>
                                    )}

                                    <Link href={`/hub/user/${otherUser?.username}`}>
                                        <Avatar src={otherUser?.avatar_url} name={activeTitle} size={40} online={!!otherUser && otherUserStatus === 'online'} />
                                    </Link>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 15 }}>{activeTitle}</div>
                                        <div style={{ fontSize: 12, color: otherUserStatus === 'online' ? C.green : C.textSec }}>
                                            {otherUserStatus === 'online' ? 'Active Now' : otherUserLastSeen ? `Active ${(() => {
                                                const diff = Date.now() - new Date(otherUserLastSeen).getTime();
                                                const mins = Math.floor(diff / 60000);
                                                if (mins < 1) return 'just now';
                                                if (mins < 60) return `${mins}m ago`;
                                                const hrs = Math.floor(mins / 60);
                                                if (hrs < 24) return `${hrs}h ago`;
                                                return `${Math.floor(hrs / 24)}d ago`;
                                            })()}` : 'Offline'}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={() => setShowMessageSearch(!showMessageSearch)}
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: showMessageSearch ? C.bg : 'transparent',
                                                border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}
                                            title="Search Messages"
                                        ><SearchIcon size={20} /></button>
                                        {/* Hide call buttons for message request conversations */}
                                        {!activeConversation?.isRequest && (
                                            <>
                                        <button
                                            onClick={() => startCall('audio')}
                                            title="Voice Call"
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}><PhoneIcon size={20} /></button>
                                        <button
                                            onClick={() => startCall('video')}
                                            title="Video Call"
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}><VideoIcon size={20} /></button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => setShowUserInfo(!showUserInfo)}
                                            title="User Info"
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: showUserInfo ? C.bg : 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}><InfoIcon size={20} /></button>
                                    </div>
                                </div >

                                {/* Message Search Bar */}
                                {
                                    showMessageSearch && (
                                        <div style={{
                                            padding: '8px 16px',
                                            borderBottom: `1px solid ${C.border}`,
                                            background: C.bg,
                                            position: 'relative',
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                background: C.card,
                                                borderRadius: 20,
                                                padding: '0 12px',
                                                border: `1px solid ${C.border}`,
                                            }}>
                                                <span style={{ color: C.textSec, marginRight: 8 }}></span>
                                                <input
                                                    type="text"
                                                    value={messageSearchQuery}
                                                    onChange={e => {
                                                        setMessageSearchQuery(e.target.value);
                                                        handleMessageSearch(e.target.value);
                                                    }}
                                                    placeholder="Search In This Conversation..."
                                                    style={{
                                                        flex: 1,
                                                        border: 'none',
                                                        background: 'transparent',
                                                        padding: '8px 0',
                                                        fontSize: 14,
                                                        outline: 'none',
                                                    }}
                                                />
                                                {messageSearchQuery && (
                                                    <button
                                                        onClick={() => { setMessageSearchQuery(''); setMessageSearchResults([]); }}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: C.textSec, fontSize: 14,
                                                        }}
                                                    >×</button>
                                                )}
                                            </div>

                                            {/* Search Results Dropdown */}
                                            {messageSearchResults.length > 0 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: 16,
                                                    right: 16,
                                                    background: C.card,
                                                    borderRadius: 8,
                                                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                                                    maxHeight: 240,
                                                    overflowY: 'auto',
                                                    zIndex: 100,
                                                }}>
                                                    <div style={{ padding: '8px 12px', fontSize: 12, color: C.textSec, borderBottom: `1px solid ${C.border}` }}>
                                                        {messageSearchResults.length} result{messageSearchResults.length !== 1 ? 's' : ''}
                                                    </div>
                                                    {messageSearchResults.map(result => (
                                                        <div
                                                            key={result.id}
                                                            onClick={() => {
                                                                // Scroll to message (future: highlight it)
                                                                const el = document.getElementById(`msg-${result.id}`);
                                                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                setShowMessageSearch(false);
                                                                setMessageSearchQuery('');
                                                                setMessageSearchResults([]);
                                                            }}
                                                            style={{
                                                                padding: '10px 12px',
                                                                borderBottom: `1px solid ${C.border}`,
                                                                cursor: 'pointer',
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                        >
                                                            <div style={{ fontSize: 13, color: C.text, marginBottom: 2 }}>
                                                                {result.content.slice(0, 80)}{result.content.length > 80 ? '...' : ''}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: C.textSec }}>
                                                                {timeAgo(result.created_at)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                }

                                {/* Messages */}
                                {/* Phase 3: Connection status banner */}
                                {connectionStatus !== 'connected' && (
                                    <div style={{
                                        padding: '6px 16px',
                                        background: connectionStatus === 'reconnecting' ? '#FFA500' : C.red,
                                        color: 'white',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                    }}>
                                        <span style={{ animation: connectionStatus === 'reconnecting' ? 'pulse 1.5s infinite' : 'none' }}>
                                            {connectionStatus === 'reconnecting' ? '⟳' : '!'}
                                        </span>
                                        {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connection Lost'}
                                    </div>
                                )}

                                <div
                                    ref={messagesContainerRef}
                                    onScroll={(e) => {
                                        // Infinite scroll — load older messages when near top
                                        if (e.target.scrollTop < 100 && hasMoreMessages && !loadingOlderMessages) {
                                            loadOlderMessages();
                                        }
                                        // Phase 3: Show scroll-to-bottom FAB when scrolled up
                                        // BUGFIX: Only call setState when value actually changes to avoid re-renders on every scroll frame
                                        const el = e.target;
                                        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                                        const shouldShow = distFromBottom > 200;
                                        setShowScrollDown(prev => prev === shouldShow ? prev : shouldShow);
                                    }}
                                    style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '16px 0',
                                    position: 'relative',
                                }}>
                                    {/* Loading older messages indicator */}
                                    {loadingOlderMessages && (
                                        <div style={{ textAlign: 'center', padding: '12px 0', color: C.textSec, fontSize: 13 }}>
                                            Loading older messages...
                                        </div>
                                    )}
                                    {/* User info header */}
                                    <div style={{ textAlign: 'center', marginBottom: 24, padding: '0 20px' }}>
                                        <Avatar src={otherUser?.avatar_url} name={activeTitle} size={80} showOnline={false} />
                                        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 17 }}>{activeTitle}</div>
                                        <div style={{ color: C.textSec, fontSize: 13 }}>Smarter.Poker Member</div>
                                        <Link href={`/hub/user/${otherUser?.username}`} style={{
                                            display: 'inline-block',
                                            marginTop: 12,
                                            padding: '8px 16px',
                                            background: C.bg,
                                            borderRadius: 8,
                                            color: C.text,
                                            textDecoration: 'none',
                                            fontSize: 14,
                                            fontWeight: 500,
                                        }}>View Profile</Link>
                                    </div>

                                    {loadingMessages ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                                            Loading messages...
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                                            <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                                            Say hi to start the conversation!
                                        </div>
                                    ) : (() => {
                                        const _today = new Date();
                                        const _yesterday = new Date(_today);
                                        _yesterday.setDate(_today.getDate() - 1);
                                        // Defensive: drop any null/undefined entries so a single bad
                                        // realtime payload can't crash the entire conversation view.
                                        const _validMessages = (messages || []).filter(Boolean);
                                        return (
                                        _validMessages.map((msg, i) => {
                                            const isOwn = msg.sender_id === user.id;
                                            const prevMsg = _validMessages[i - 1];
                                            const nextMsg = _validMessages[i + 1];
                                            const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                                            const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;

                                            // Date divider — show between messages on different days
                                            const msgDate = new Date(msg.created_at);
                                            const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;
                                            const showDateDivider = !prevDate ||
                                                msgDate.toDateString() !== prevDate.toDateString();

                                            let dateLabel = '';
                                            if (showDateDivider) {
                                                if (msgDate.toDateString() === _today.toDateString()) dateLabel = 'Today';
                                                else if (msgDate.toDateString() === _yesterday.toDateString()) dateLabel = 'Yesterday';
                                                else dateLabel = msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: msgDate.getFullYear() !== _today.getFullYear() ? 'numeric' : undefined });
                                            }

                                            return (
                                                <Fragment key={msg.id}>
                                                    {showDateDivider && (
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: 12,
                                                            padding: '12px 16px', margin: '4px 0',
                                                        }}>
                                                            <div style={{ flex: 1, height: 1, background: C.border }} />
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: C.textSec, whiteSpace: 'nowrap',
                                                                letterSpacing: '0.3px',
                                                            }}>{dateLabel}</span>
                                                            <div style={{ flex: 1, height: 1, background: C.border }} />
                                                        </div>
                                                    )}
                                                    <MessageBubble
                                                        message={msg}
                                                        isOwn={isOwn}
                                                        showAvatar={showAvatar}
                                                        sender={msg.profiles}
                                                        showTime={isLastInGroup}
                                                        isLastInGroup={isLastInGroup}
                                                        onRetry={handleRetryMessage}
                                                        onReact={handleReaction}
                                                        onDelete={handleDeleteMessage}
                                                        onEdit={handleEditMessage}
                                                        onForward={handleForwardMessage}
                                                        onCallBack={startCall}
                                                        onReply={handleReplyMessage}
                                                        onUnsend={handleUnsendMessage}
                                                        currentUserId={user.id}
                                                        theme={C}
                                                    />
                                                </Fragment>
                                            );
                                        })
                                    ); })()}
                                    {/* Typing indicator */}
                                    {otherTyping && <TypingIndicator name={otherUser?.full_name || otherUser?.display_name || otherUser?.username} theme={C} />}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Phase 3: Scroll-to-bottom FAB */}
                                {showScrollDown && (
                                    <button
                                        onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                                        style={{
                                            position: 'absolute',
                                            bottom: 80,
                                            right: 20,
                                            width: 40,
                                            height: 40,
                                            borderRadius: '50%',
                                            background: C.card,
                                            border: `1px solid ${C.border}`,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            zIndex: 20,
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)'; }}
                                        aria-label="Scroll to bottom"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                    </button>
                                )}

                                {/* Identity Banner - shows when messaging as Club Page */}
                                {isClubMode && clubPage && hasClubPage && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 16px',
                                        background: '#E7F3FF',
                                        borderTop: `1px solid ${C.border}`,
                                        fontSize: 13, color: '#1877F2'
                                    }}>
                                        <div style={{
                                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                            background: clubPage.avatar_url ? `url(${clubPage.avatar_url}) center/cover` : '#1877F2',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', fontSize: 9, fontWeight: 700
                                        }}>
                                            {!clubPage.avatar_url && (clubPage.name?.[0] || 'C')}
                                        </div>
                                        <span style={{ fontWeight: 600 }}>Messaging as {clubPage.name}</span>
                                    </div>
                                )}
                                {/* Message Input */}
                                {/* Reply banner — shows when replying to a message */}
                                {replyToMessage && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 16px', background: isDarkMode ? '#1a3a5c' : '#E7F3FF',
                                        borderTop: `1px solid ${C.border}`,
                                        borderLeft: `3px solid ${C.blue}`,
                                    }}>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>Replying To {replyToMessage.profiles?.username || 'Message'}</div>
                                            <div style={{
                                                fontSize: 13, color: C.textSec,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {(replyToMessage.content || '').replace(/\[REPLY:[^\]]+\]\s*/, '').slice(0, 80)}
                                            </div>
                                        </div>
                                        <button onClick={() => setReplyToMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 18 }}>×</button>
                                    </div>
                                )}
                                {/* Edit bar — shows when editing a message */}
                                {editingMessage && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 16px', background: '#E7F3FF',
                                        borderTop: `1px solid ${C.border}`,
                                    }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>Editing Message</div>
                                            <input
                                                type="text" value={editText}
                                                onChange={e => setEditText(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') handleEditCancel(); }}
                                                style={{
                                                    width: '100%', border: 'none', background: 'transparent',
                                                    fontSize: 14, outline: 'none', color: C.text,
                                                }}
                                                autoFocus
                                            />
                                        </div>
                                        <button onClick={handleEditCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 18 }}>×</button>
                                        <button onClick={handleEditSave} style={{ background: C.blue, border: 'none', borderRadius: 20, color: 'white', padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Save</button>
                                    </div>
                                )}

                                <MessageInput key={activeConversation.id} onSend={handleSendMessage} onTyping={broadcastTyping} onMediaUpload={handleMediaUpload} onGifSend={handleGifSend} onVoiceSend={handleVoiceSend} autoFocus={composeFocus} initialText={conversationDraft} theme={C} />
                            </>
                        ) : (
                            /* No conversation selected */
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column',
                                color: C.textSec,
                            }}>
                                <div style={{ fontSize: 80, marginBottom: 16 }}></div>
                                <h2 style={{ margin: 0, color: C.text, fontWeight: 600 }}>Select A Conversation</h2>
                                <p style={{ marginTop: 8, color: C.textSec }}>Choose From Your Existing Chats Or Search For Someone New</p>
                            </div>
                        )}
                </main >

                {/* Jarvis is now integrated as a conversation in the list */}
            </div >
        </>
    );
}

const PushPromptModal = dynamic(() => import('../../src/components/messenger/modals/PushPromptModal'), { ssr: false });
export default function MessengerPageWithBoundary() {
    return (
        <HubErrorBoundary name="Messenger">
            <MessengerPage />
            {/* BottomNavBar intentionally removed — messenger is full-screen chat; the nav bar was overlaying the message input area and blocking user interaction */}
        </HubErrorBoundary>
    );
}
