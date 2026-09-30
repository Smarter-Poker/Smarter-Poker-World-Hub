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
import useMessengerConversationLink from '../../src/hooks/useMessengerConversationLink';
import useMessengerContinuity from '../../src/hooks/useMessengerContinuity';
import ContinuityStatus from '../../src/components/messenger/ContinuityStatus';
import { isMessageId, visibleMessageBoundary } from '../../src/lib/messengerContinuity.mjs';
import { broadcastSync, listenBroadcast } from '../../src/lib/broadcastSync';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { messengerPreferences } from '../../src/services/preferences-service';

const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const ReportBugWidget = dynamic(() => import('../../src/components/ui/ReportBugWidget'), { ssr: false });
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import useMessengerSearch from '../../src/hooks/useMessengerSearch';
import { resolveMessengerClubEntry } from '../../src/lib/messengerClubEntry.mjs';
import { createMessengerSendOperation, restoreMessengerSendOperations, messengerOperationMessage,
    mergeMessengerPendingMessages, reconcileMessengerMessage, acknowledgeMessengerSend,
    performMessengerSend, saveMessengerSendOperation } from '../../src/lib/messengerSendOperation.mjs';

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
import { isOnline } from '../../src/utils/authGuard';
import { useActiveIdentity } from '../../src/contexts/ActiveIdentityContext';
// BottomNavBar intentionally removed from messenger — input area was blocked

import ClubArenaWorkspace from '../../src/components/messenger/ClubArenaWorkspace';
import { requestPushNudge } from '../../src/lib/push/enrollment-nudge.mjs';
import AccountingInvoiceCard from '../../src/components/messenger/AccountingInvoiceCard';
import AccountingConversationIntroduction from '../../src/components/messenger/AccountingConversationIntroduction';
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

function compareMessageTimestamps(left, right) {
    const milliseconds = Date.parse(left) - Date.parse(right);
    if (milliseconds !== 0) return milliseconds;
    // Postgres preserves microseconds; Date.parse alone would acknowledge a
    // later message within the same millisecond as an older read boundary.
    const fraction = value => Number((String(value).match(/\.(\d+)/)?.[1] || '').padEnd(9, '0'));
    return fraction(left) - fraction(right);
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 smarter-poker-style SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════

import { Phone, Video, Search, Info } from 'lucide-react';
import { spKeyActivate } from '../../src/lib/keyboardActivate';

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
    const showNewChat = useMessengerStore((s) => s.showNewChat);
    const setShowNewChat = useMessengerStore((s) => s.setShowNewChat);
    const showSearch = useMessengerStore((s) => s.showSearch);
    const setShowSearch = useMessengerStore((s) => s.setShowSearch);

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
    const { ownedPages, switchToPersonal, switchToClub } = useActiveIdentity();
    const [clubAccess, setClubAccess] = useState({ userId: null, clubs: [] });
    const [workspaceSelection, setWorkspaceSelection] = useState({ clubId: null, folder: 'messages' });
    const [inboxError, setInboxError] = useState(null);
    const [weeklyPreview, setWeeklyPreview] = useState(null);
    const [pendingConversationId, setPendingConversationId] = useState(null);
    const clubDrawerOpen = !!workspaceSelection.clubId;
    // A meaningful moment for notifications: the person opened their invoices.
    // The prompt host decides whether an ask is allowed (cool-down, already on,
    // blocked, and never for the owner's receipts).
    const invoiceWorkspaceOpen = clubDrawerOpen && workspaceSelection.folder === 'invoices';
    useEffect(() => {
        if (invoiceWorkspaceOpen) requestPushNudge('invoice_workspace');
    }, [invoiceWorkspaceOpen]);


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
    const authIdentityRef = useRef(user?.id || null);
    const authGenerationRef = useRef(0);
    // The old global cache could paint another account or club before auth.
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState([]);
    const joinedClubs = clubAccess.userId === user?.id ? clubAccess.clubs : [];
    const selectedClub = joinedClubs.find(c => c.id === workspaceSelection.clubId);
    // Entering a club does not make an ordinary member its representative.
    const clubPage = selectedClub?.canManage ? ownedPages.find(p => p.id === selectedClub.pageId) : null;
    const isClubMode = !!clubPage;
    const hasClubPage = !!clubPage;
    const workspaceBase = `${user?.id || ''}:${workspaceSelection.clubId || 'social'}:${workspaceSelection.folder}`;
    const workspaceEpochRef = useRef({ key: null, generation: 0 });
    if (workspaceEpochRef.current.key !== workspaceBase) {
        workspaceEpochRef.current = { key: workspaceBase, generation: workspaceEpochRef.current.generation + 1 };
    }
    const workspaceKey = `${workspaceBase}:${workspaceEpochRef.current.generation}`;
    const workspaceRef = useRef(workspaceKey);
    workspaceRef.current = workspaceKey;
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const sendOperationsRef = useRef(new Map());
    const sendOperationRef = useRef(null);
    const forwardOperationRef = useRef(null);
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
    const { controller: continuity, edit: editContinuity, flush: flushContinuity } = useMessengerContinuity({
        actorId: user?.id, scope: workspaceKey, identityRef: authIdentityRef,
        workspace: { workspace: workspaceSelection.clubId ? 'club' : 'social', clubId: workspaceSelection.clubId, folder: workspaceSelection.folder },
    });
    const pinnedConvoIds = continuity.pins;
    const [showSavedMessages, setShowSavedMessages] = useState(false);
    const [hasNewerMessages, setHasNewerMessages] = useState(false);
    const [loadingNewerMessages, setLoadingNewerMessages] = useState(false);
    const [historyError, setHistoryError] = useState(null);
    const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null);
    const historyWindowRef = useRef({ conversationId: null, hasNewer: false });
    const pendingScrollRef = useRef(null);
    const explicitAnchorRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const visibleReadRef = useRef(null);
    const lastVisibleReadRef = useRef(null);
    const restoreSequenceRef = useRef(0);
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
    const { refreshUnread, messengerUnread } = useUnreadCount();
    const [workspaceUnread, setWorkspaceUnread] = useState(null);
    const [incomingRead, setIncomingRead] = useState(null);

    const messagesEndRef = useRef(null);
    const searchTimeout = useRef(null);
    const searchInputRef = useRef(null);
    const typingTimeout = useRef(null);
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
                if (replyToMessage) { clearReply(); return; }
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
    const markConversationReadRef = useRef(null);
    const inboxRequestSequence = useRef(0);
    const messagesRequestSequence = useRef(0);
    // PERF 2026-08-24: in-flight de-duplication for loadConversations.
    // Opening the messenger fired the SAME full inbox request 3-4 times
    // concurrently: the init effect, the identity effect (user?.id null->id),
    // the auth listener (INITIAL_SESSION / TOKEN_REFRESHED) and the immediate
    // pollInbox() all call it on mount. Holds { key, promise } so overlapping
    // callers for the same (user, identity context) share one round-trip.
    const loadConvInFlightRef = useRef(null);
    useEffect(() => {
        setWorkspaceSelection({ clubId: null, folder: 'messages' });
        setClubAccess({ userId: null, clubs: [] });
        setPendingConversationId(null);
    }, [user?.id]);


    useEffect(() => {
        activeConversationRef.current = null;
        setActiveConversation(null);
        setMessages([]);
        paginationLockRef.current = null;
        setLoadingOlderMessages(false);
        messageCacheRef.current.clear();
        setConversations([]);
        setSearchQuery('');
        setShowMessageSearch(false);
        setShowUserInfo(false);
        setInboxError(null);
        setShowSavedMessages(false);
        setFirstUnreadMessageId(null);
        setHistoryError(null);
        historyWindowRef.current = { conversationId: null, hasNewer: false };
        pendingScrollRef.current = null;
        lastVisibleReadRef.current = null;
        setReplyToMessage(null);
        if (user?.id) { setLoading(true); loadConversationsRef.current?.(user.id); }
    }, [workspaceKey]);
    useEffect(() => { goOnlineUserRef.current = user; }, [user]);
    useEffect(() => {
        const goOnline = () => {
            setConnectionStatus('connected');
            // Reload missed messages after reconnect — use refs to avoid stale closures
            const currentUser = goOnlineUserRef.current;
            if (currentUser?.id) {
                loadConversationsRef.current?.(currentUser.id, { invalidate: true });
                const activeConv = activeConversationRef.current;
                if (activeConv?.id && !activeConv.isJarvis) {
                    loadMessagesRef.current?.(activeConv.id);
                }
            }
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && isOnline()) goOnline();
        };
        const goOffline = () => setConnectionStatus('disconnected');
        const stopUnreadSync = listenBroadcast('smarter_poker_unread_sync', msg => {
            if (msg !== 'refresh_unread') return;
            const currentUser = goOnlineUserRef.current;
            if (currentUser?.id) loadConversationsRef.current?.(currentUser.id, { invalidate: true });
        });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        if (!navigator.onLine) setConnectionStatus('disconnected');
        return () => {
            stopUnreadSync();
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);


    // Load user and conversations — PARALLEL init with cache-first render
    useEffect(() => {
        let cancelled = false;
        const authGeneration = authGenerationRef.current;
        const current = () => !cancelled && authGenerationRef.current === authGeneration;
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

                if (authUser && current()) {
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

                    if (!current()) return;

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
                    authIdentityRef.current = authUser.id;
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
            if (current()) setLoading(false);
        }
        init();
        return () => { cancelled = true; };
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
    const deepLinkDraftRef = useRef(null);
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
                    .select('id, username, avatar_url')
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

    const resolveConversationRef = useRef(null);
    resolveConversationRef.current = async (conversationId, draftText = '', controls = {}) => {
        const accountId = user?.id;
        const requestScope = workspaceRef.current;
        try {
            const token = getAccessToken();
            const response = await authedFetch('/api/messenger/get-conversations', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ workspace: 'resolve', conversationId }),
            });
            const result = await response.json();
            if (workspaceRef.current !== requestScope || controls.isCurrent?.() === false) return;
            if (!response.ok || !result.success || result.conversation?.id !== conversationId
                || !Array.isArray(result.clubs) || !Array.isArray(result.conversations)
                || !result.conversations.some(conversation => conversation.id === conversationId)
                || !['messages', 'invoices'].includes(result.folder)) {
                throw new Error(result.error || 'Conversation Unavailable');
            }
            controls.onResolved?.();
            setClubAccess({ userId: accountId, clubs: result.clubs });
            setWorkspaceSelection({ clubId: result.clubId, folder: result.folder });
            setConversations(result.conversations);
            setPendingConversationId(result.conversation.id);
            if (draftText) deepLinkDraftRef.current = { actorId: accountId, conversationId, text: draftText.slice(0, 2000) };
        } catch (error) {
            if (workspaceRef.current === requestScope && controls.isCurrent?.() !== false) setToast({ type: 'error', message: error.message });
        }
    };
    useMessengerConversationLink({
        userId: user?.id, scope: workspaceKey, conversation: router.query.conversation, draft: router.query.draft,
        resolve: (...args) => resolveConversationRef.current(...args),
    });
    const lastHandledConvLink = useRef(null);
    useEffect(() => {
        if (!user?.id) return;
        const { conversation, recipientId } = router.query;
        const key = `${user.id}:${recipientId || ''}`;
        if (conversation || !recipientId || lastHandledConvLink.current === key) return;
        lastHandledConvLink.current = key;
        if (recipientId) {
            (async () => {
                const { data } = await supabase.from('profiles').select('id,username,avatar_url').eq('id', recipientId).maybeSingle();
                if (data) await handleStartConversation(data);
            })();
        }
    }, [user?.id, router.query]);
    useEffect(() => {
        if (!pendingConversationId) return;
        const found = conversations.find(c => c.id === pendingConversationId);
        if (!found) return;
        handleSelectConversation(found);
        setPendingConversationId(null);
        // Remove only consumed parameters; retain the embedded host's context.
        const url = new URL(window.location.href);
        url.searchParams.delete('conversation');
        url.searchParams.delete('draft');
        window.history.replaceState(null, '', url.pathname + url.search);
    }, [pendingConversationId, conversations, workspaceKey]);

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
        let cancelled = false;
        let profileSequence = 0;
        // Keep the auth callback synchronous: a slow profile request must never
        // hold or discard a later sign-out/account switch.
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            const authUser = event === 'SIGNED_OUT' ? null : session?.user;
            const nextId = authUser?.id || null;
            const changed = authIdentityRef.current !== nextId;
            const sequence = ++profileSequence;
            if (changed || event === 'SIGNED_OUT') {
                authIdentityRef.current = nextId;
                authGenerationRef.current++;
                // Invalidate pending work before React commits the new actor.
                workspaceRef.current = `auth:${authGenerationRef.current}`;
                activeConversationRef.current = null;
                setConversations([]);
                setMessages([]);
                setActiveConversation(null);
                messageCacheRef.current.clear();
                sendOperationsRef.current.clear();
                forwardOperationRef.current = null;
                sendLockRef.current = null;
                setFriends([]);
                setIsVip(false);
            }
            if (!authUser) {
                setUser(null);
                setLoading(false);
                return;
            }

            setUser(previous => previous?.id === nextId ? { ...previous, ...authUser } : {
                ...authUser,
                username: authUser.user_metadata?.poker_alias || authUser.email?.split('@')[0],
                avatar_url: authUser.user_metadata?.avatar_url || null,
            });
            // The workspace effect loads a new actor after its state commits.
            if (!changed && event === 'TOKEN_REFRESHED') loadConversationsRef.current?.(nextId, { invalidate: true });
            void (async () => {
                try {
                    const { data: profile } = await supabase.from('profiles')
                        .select('id, username, avatar_url, is_vip').eq('id', nextId).maybeSingle();
                    if (cancelled || sequence !== profileSequence || authIdentityRef.current !== nextId) return;
                    setUser(previous => previous?.id === nextId ? { ...previous, ...(profile || {}) } : previous);
                    setIsVip(!!profile?.is_vip);
                } catch (error) {
                    if (!cancelled && sequence === profileSequence) console.warn('[Messenger] Profile refresh failed:', error?.message || error);
                }
            })();
        });

        return () => { cancelled = true; profileSequence++; data?.subscription?.unsubscribe(); };
    }, []);

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

    // Keep an older reading window stable; scroll only for an explicit target
    // or when the reader was already at the newest edge.
    useEffect(() => {
        if (isPaginatingRef.current) { isPaginatingRef.current = false; return; }
        const scope = workspaceRef.current;
        const conversationId = activeConversationRef.current?.id;
        let frame;
        const placeViewport = () => {
            if (scope !== workspaceRef.current || conversationId !== activeConversationRef.current?.id) return;
            const container = messagesContainerRef.current;
            const target = pendingScrollRef.current;
            if (!container || loadingMessages) return;
            // Dynamic bubbles initially render zero-height placeholders. Neither
            // a reading target nor a receipt may be resolved from that geometry.
            const rows = [...container.querySelectorAll('[data-message-id]')];
            if (rows.some(row => row.getBoundingClientRect().height <= 0)) return;
            if (container && target?.conversationId === conversationId && target.scope === scope) {
                const node = target.messageId && container.querySelector(`[data-message-id="${target.messageId}"]`);
                if (node) container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top - (target.offset || 0);
                else if (target.bottom) container.scrollTop = container.scrollHeight;
                pendingScrollRef.current = null;
                stickToBottomRef.current = !historyWindowRef.current.hasNewer && container.scrollHeight - container.scrollTop - container.clientHeight < 80;
            } else if (container && stickToBottomRef.current && !historyWindowRef.current.hasNewer) container.scrollTop = container.scrollHeight;
            visibleReadRef.current?.();
        };
        const queuePlacement = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(placeViewport); };
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(queuePlacement) : null;
        const container = messagesContainerRef.current;
        if (container) {
            observer?.observe(container);
            container.querySelectorAll('[data-message-id]').forEach(row => observer?.observe(row));
        }
        queuePlacement();
        return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
    }, [messages, loadingMessages]);

    const activeDraftReplyId = isMessageId(activeConversation?.id) ? continuity.state(activeConversation.id).draft.replyToId : null;
    useEffect(() => {
        if (!activeDraftReplyId) { setReplyToMessage(null); return; }
        const conversationId = activeConversation?.id;
        const scope = workspaceRef.current;
        let cancelled = false;
        const found = messages.find(message => message.id === activeDraftReplyId && !message.is_deleted);
        if (found) { setReplyToMessage(found); return; }
        setReplyToMessage({ id: activeDraftReplyId, content: 'Loading Original Message...' });
        void (async () => {
            try {
                const response = await authedFetch('/api/messenger/get-messages', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                    body: JSON.stringify({ conversationId, anchorMessageId: activeDraftReplyId, limit: 10 }),
                });
                const result = await response.json();
                if (cancelled || scope !== workspaceRef.current || activeConversationRef.current?.id !== conversationId) return;
                const original = response.ok && result.success ? result.messages?.find(message => message.id === activeDraftReplyId && !message.is_deleted) : null;
                setReplyToMessage(original || { id: activeDraftReplyId, unavailable: true, content: 'Original Message Is Unavailable' });
            } catch {
                if (!cancelled && scope === workspaceRef.current) setReplyToMessage({ id: activeDraftReplyId, unavailable: true, content: 'Original Message Is Unavailable' });
            }
        })();
        return () => { cancelled = true; };
    }, [activeDraftReplyId, activeConversation?.id, workspaceKey]);
    const clearReply = () => {
        setReplyToMessage(null);
        if (isMessageId(activeConversation?.id)) editContinuity(activeConversation.id, 'draft', { text: continuity.state(activeConversation.id).draft.text, replyToId: null });
    };

    // Refresh the same authorized workspace used for initial loading.
    useEffect(() => {
        if (!user?.id) return;
        const timer = setInterval(() => loadConversationsRef.current?.(user.id), 30000);
        return () => clearInterval(timer);
    }, [workspaceKey]);

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

    const sidebarSearch = useMessengerSearch({
        query: searchQuery,
        scope: user?.id ? workspaceKey : null,
        url: '/api/messenger/global-search',
        payload: { workspace: workspaceSelection.clubId ? 'club' : 'social', ...workspaceSelection },
        request: authedFetch,
    });
    const visibleSearchConversations = new Set(conversations.map(conversation => conversation.id));
    const messageHits = sidebarSearch.results.filter(message => visibleSearchConversations.has(message.conversation_id));
    const messageHitsLoading = sidebarSearch.loading;
    const messageHitsError = sidebarSearch.error;
    const conversationSearch = useMessengerSearch({
        query: messageSearchQuery,
        scope: user?.id && showMessageSearch && activeConversation?.id
            ? `${workspaceKey}:${activeConversation.id}` : null,
        url: '/api/messenger/search-messages',
        payload: { conversationId: activeConversation?.id },
        request: authedFetch,
    });
    const messageSearchResults = conversationSearch.results.filter(message => message.conversation_id === activeConversation?.id);

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

        const requestScope = workspaceKey;
        const channel = supabase
            .channel(`conversation:${activeConversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, async (payload) => {
                const newMsg = payload.new;
                if (newMsg.message_type === 'invoice') {
                    // Realtime data is not proof of an issued financial record.
                    if (activeConversationRef.current?.id === newMsg.conversation_id) loadMessagesRef.current?.(newMsg.conversation_id);
                    return;
                }
                if (historyWindowRef.current.conversationId === newMsg.conversation_id && historyWindowRef.current.hasNewer) {
                    // Keep the current history window contiguous. Load Newer or
                    // Jump To Latest fetches this arrival through the private reader.
                    loadConversationsRef.current?.(user.id, { invalidate: true });
                    return;
                }
                if (newMsg.sender_id === user.id) {
                    if (workspaceRef.current !== requestScope || activeConversationRef.current?.id !== newMsg.conversation_id) return;
                    const operation = sendOperationsRef.current.get(newMsg.request_id);
                    if (operation) acknowledgeMessengerSend(operation, newMsg, localStorage);
                    setMessages(previous => reconcileMessengerMessage(previous, { ...newMsg, status: 'sent' }));
                    return;
                }

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

                if (workspaceRef.current !== requestScope || activeConversationRef.current?.id !== newMsg.conversation_id) return;
                setMessages(prev => {
                    // Check for duplicates (defensive against null entries)
                    if (prev.some(m => m && m.id === newMsg.id)) return prev;
                    return [...prev, { ...newMsg, profiles: profile || null }];
                });

                setIncomingRead({ scope: requestScope, conversationId: newMsg.conversation_id, messageId: newMsg.id });

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
                if (updatedMsg.message_type === 'invoice') {
                    if (activeConversationRef.current?.id === updatedMsg.conversation_id) loadMessagesRef.current?.(updatedMsg.conversation_id);
                    return;
                }
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

    // A rendered row outside the viewport is not read. History navigation may
    // intentionally leave many newer rows unloaded or below the visible edge.
    visibleReadRef.current = () => {
        const conversationId = activeConversationRef.current?.id;
        if (!isMessageId(conversationId) || document.visibilityState !== 'visible' || pendingScrollRef.current) return;
        const boundary = visibleMessageBoundary(messagesContainerRef.current);
        if (!boundary || !messages.some(message => message.id === boundary.last && message.conversation_id === conversationId)) return;
        const key = `${workspaceRef.current}:${conversationId}:${boundary.last}`;
        if (lastVisibleReadRef.current === key) return;
        lastVisibleReadRef.current = key;
        markConversationReadRef.current?.(conversationId, boundary.last);
    };
    useEffect(() => {
        if (!incomingRead || incomingRead.scope !== workspaceRef.current) return;
        const frame = requestAnimationFrame(() => visibleReadRef.current?.());
        return () => cancelAnimationFrame(frame);
    }, [incomingRead]);

    // Typing indicator broadcast
    const typingTimerRef = useRef(null);
    useEffect(() => {
        if (!user || !activeConversation) return;
        const requestScope = workspaceKey;
        const current = () => workspaceRef.current === requestScope && activeConversationRef.current?.id === activeConversation.id;

        const typingChannel = supabase
            .channel(`typing:${activeConversation.id}`)
            .on('broadcast', { event: 'typing' }, (payload) => {
                // Someone else is typing
                if (current() && payload.payload.userId !== user.id) {
                    setOtherTyping(true);
                    // Clear previous timer to prevent accumulation
                    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                    typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3000);
                }
            })
            .on('broadcast', { event: 'read_receipt' }, (payload) => {
                // Other user read our messages — update ✓✓ checkmarks in real-time
                const readThrough = payload.payload.readThrough;
                if (current() && payload.payload.readerId !== user.id && payload.payload.conversationId === activeConversation.id && Number.isFinite(Date.parse(readThrough))) {
                    setMessages(prev => prev.map(m =>
                        m && m.sender_id === user.id && compareMessageTimestamps(m.created_at, readThrough) <= 0 ? { ...m, is_read: true, status: 'read' } : m
                    ));
                }
            })
            // FIX #9: Listen for delivery confirmations from the other user
            .on('broadcast', { event: 'delivered' }, (payload) => {
                if (current() && payload.payload.receiverId !== user.id) {
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
                        sendOperationRef.current?.(`[CALL_RECEIPT]${receiptPayload}`, {
                            conversationId: currentConvo.id, actorId: user.id,
                        });
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

    const loadConversations = async (userId, { invalidate = false } = {}) => {
        // PERF 2026-08-24: collapse concurrent duplicate loads (see
        // loadConvInFlightRef). Keyed on the exact request identity, so a
        // genuine context switch (Personal <-> Club) is never de-duplicated
        // against the previous context's request. The entry is cleared when the
        // request settles, so a LATER refresh always issues a fresh fetch.
        const inFlightKey = workspaceKey;
        const pending = loadConvInFlightRef.current;
        if (!invalidate && pending && pending.key === inFlightKey) return pending.promise;

        const run = loadConversationsInner(userId);
        loadConvInFlightRef.current = { key: inFlightKey, promise: run };
        try {
            return await run;
        } finally {
            if (loadConvInFlightRef.current?.promise === run) loadConvInFlightRef.current = null;
        }
    };

    const loadConversationsInner = async (userId) => {
        const requestKey = workspaceKey;
        const requestSequence = ++inboxRequestSequence.current;
        const current = () => workspaceRef.current === requestKey && inboxRequestSequence.current === requestSequence;
        if (!isOnline()) {
            setInboxError('You Are Offline. Reconnect To Refresh This Inbox.');
            setLoading(false);
            return;
        }
        try {
            const token = getAccessToken();
            const resp = await authedFetch('/api/messenger/get-conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ workspace: workspaceSelection.clubId ? 'club' : 'social', ...workspaceSelection }),
            });
            const result = await resp.json();
            if (!current()) return;
            if (!resp.ok || !result.success || !Array.isArray(result.conversations)) throw new Error(result.error || 'Inbox Unavailable');
            const previous = new Map(conversationsRef.current.map(c => [c.id, c.unreadCount]));
            if (result.conversations.some(c => previous.has(c.id) && c.unreadCount > previous.get(c.id) && c.id !== activeConversationRef.current?.id)) {
                if (preferencesRef.current.messageSounds !== false) playMessageSound();
            }
            setConnectionStatus('connected');
            setClubAccess({ userId, clubs: result.clubs });
            setConversations(result.conversations);
            setWorkspaceUnread({ key: requestKey, counts: result.unreadCounts });
            setWeeklyPreview(result.weeklySummary ? { key: requestKey, report: result.weeklySummary } : null);
            setInboxError(null);
        } catch (error) {
            if (!current()) return;
            setConversations([]);
            setInboxError(error.message || 'Inbox Unavailable. Please Retry.');
        } finally {
            if (current()) setLoading(false);
        }
    };
    // Keep ref in sync so the reconnect handler always calls the latest version
    loadConversationsRef.current = loadConversations;

    const markConversationRead = async (conversationId, throughMessageId) => {
        const requestScope = workspaceKey;
        const current = () => workspaceRef.current === requestScope && activeConversationRef.current?.id === conversationId;
        try {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(throughMessageId || '')
                || !current() || document.visibilityState === 'hidden') return;
            // Do not clear local/global badges or emit a read receipt on failure.
            const readResponse = await authedFetch('/api/messenger/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ conversationId, throughMessageId }),
            });
            const readResult = await readResponse.json();
            if (!readResponse.ok || readResult.success !== true) {
                if (current()) setToast({ type: 'error', message: 'Read Status Could Not Be Saved. Please Reopen This Conversation.' });
                return;
            }
            if (current()) {
                loadConversationsRef.current?.(user.id, { invalidate: true });
            }

            // M2 FIX: Only broadcast read receipt if readReceipts preference is enabled
            // Read from ref to avoid stale closure in long-lived callback
            if (preferencesRef.current.readReceipts !== false) {
                try {
                    if (current() && typingChannelRef.current) {
                        typingChannelRef.current.send({
                            type: 'broadcast',
                            event: 'read_receipt',
                            payload: { readerId: user.id, conversationId, readThrough: readResult.readThrough },
                        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }
                } catch { /* non-critical */ }
            }

            //  Immediately refresh global unread count to clear header badge
            if (workspaceRef.current !== requestScope) return;
            if (refreshUnread) refreshUnread();
            // DEEP SWEEP FIX: Push native global unread sync event to clear badges on other tabs
            broadcastSync('smarter_poker_unread_sync', 'refresh_unread');

        } catch (error) {
            console.warn('[Messenger] Read persistence failed:', error);
            if (current()) setToast({ type: 'error', message: 'Read Status Could Not Be Saved. Please Reopen This Conversation.' });
        }
    };
    markConversationReadRef.current = markConversationRead;

    const loadMessages = async (conversationId, navigation = {}) => {
        const requestScope = workspaceKey;
        const requestSequence = ++messagesRequestSequence.current;
        // A new bounded window invalidates pages owned by its predecessor,
        // including navigation within the same conversation.
        paginationLockRef.current = null;
        newerPageRef.current = null;
        isPaginatingRef.current = false;
        setLoadingOlderMessages(false);
        setLoadingNewerMessages(false);
        const current = () => workspaceRef.current === requestScope && activeConversationRef.current?.id === conversationId && messagesRequestSequence.current === requestSequence;
        // Optimistic UI check for instant loading
        const currentAnchor = !navigation.firstUnread && !navigation.latest && !navigation.anchorMessageId
            && historyWindowRef.current.conversationId === conversationId ? visibleMessageBoundary(messagesContainerRef.current) : null;
        const anchorMessageId = navigation.anchorMessageId || currentAnchor?.first;
        const cachedMessages = navigation.anchorMessageId || navigation.firstUnread || navigation.latest ? null : messageCacheRef.current.get(conversationId);
        const messagesAtStart = new Map((messagesRef.current || []).map(message => [message.id, message]));
        const replacingWindow = !!(navigation.anchorMessageId || navigation.firstUnread || navigation.latest);
        if (cachedMessages) {
            setMessages(cachedMessages);
            setLoadingMessages(false);
        } else {
            setMessages([]);
            setLoadingMessages(true);
        }
        setHasMoreMessages(true); // Reset on new conversation
        setHistoryError(null);
        lastVisibleReadRef.current = null;
        try {

            // Use API route to bypass RLS issues
            const msgToken = getAccessToken();
            const response = await authedFetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
                },
                body: JSON.stringify({ conversationId, userId: user.id, limit: 50,
                    ...(anchorMessageId ? { anchorMessageId } : { firstUnread: navigation.firstUnread === true }) }),
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.messages) {
                // Staleness guard: if the user switched conversations while this fetch was in-flight,
                // discard the response so we don't overwrite the current conversation's messages.
                if (!current()) return;

                // Filter out hidden messages — re-read from localStorage for freshness
                const freshHiddenIds = (() => {
                    try { return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]')); }
                    catch { return hiddenMessageIds; }
                })();
                const filtered = result.messages.filter(m => !freshHiddenIds.has(m.id));
                continuity.ingestSavedItems(result.savedItems);
                for (const operation of restoreMessengerSendOperations(localStorage, user.id)) {
                    if (!sendOperationsRef.current.has(operation.requestId)) sendOperationsRef.current.set(operation.requestId, operation);
                }
                for (const message of filtered) {
                    const operation = sendOperationsRef.current.get(message.request_id);
                    if (operation) acknowledgeMessengerSend(operation, message, localStorage);
                }
                setMessages(previous => {
                    if (!current()) return previous;
                    const merged = new Map(filtered.map(message => [message.id, message]));
                    // Only preserve changes made while this request was pending.
                    // Older cached rows remain owned by the server snapshot.
                    for (const message of previous) {
                        const lastReturned = filtered.at(-1);
                        const newArrivalAtLatestEdge = !messagesAtStart.has(message?.id) && result.hasNewer !== true
                            && (!lastReturned || compareMessageTimestamps(message.created_at, lastReturned.created_at) > 0
                                || (compareMessageTimestamps(message.created_at, lastReturned.created_at) === 0 && String(message.id) > String(lastReturned.id)));
                        if (replacingWindow && !merged.has(message?.id) && !newArrivalAtLatestEdge) continue;
                        if (message && !freshHiddenIds.has(message.id) && messagesAtStart.get(message.id) !== message
                            && (!message.conversation_id || message.conversation_id === conversationId)) {
                            const initial = messagesAtStart.get(message.id);
                            const snapshot = merged.get(message.id);
                            const changedFields = initial && snapshot
                                ? Object.fromEntries(Object.entries(message).filter(([key, value]) => initial[key] !== value)) : message;
                            merged.set(message.id, { ...snapshot, ...changedFields });
                        }
                    }
                    const rows = [...merged.values()].reduce((all, message) => reconcileMessengerMessage(all, message), []);
                    return mergeMessengerPendingMessages(rows, sendOperationsRef.current.values(), user.id, conversationId).sort((a, b) =>
                        compareMessageTimestamps(a.created_at, b.created_at) || String(a.id).localeCompare(String(b.id)));
                });
                setHasMoreMessages(result.hasOlder ?? result.messages.length >= 50);
                setHasNewerMessages(result.hasNewer === true);
                historyWindowRef.current = { conversationId, hasNewer: result.hasNewer === true };
                if (result.firstUnreadMessageId) setFirstUnreadMessageId(previous => previous || result.firstUnreadMessageId);
                const target = result.anchorMessageId || (navigation.firstUnread ? result.firstUnreadMessageId : null);
                pendingScrollRef.current = { scope: requestScope, conversationId, messageId: target,
                    offset: result.anchorUnavailable ? 0 : navigation.offset ?? currentAnchor?.offset ?? 0, bottom: !target };
                if (result.anchorUnavailable) setToast({ type: 'info', message: 'That Message Is No Longer Available. Showing Recent Messages.' });
                if (filtered.length) setIncomingRead({ scope: requestScope, conversationId, messageId: filtered[filtered.length - 1].id });
            } else {
                if (!current()) return;
                throw new Error(result.error || 'Messages Unavailable');
            }

        } catch (e) {
            console.warn('Load messages error:', e);
            if (current()) { setHistoryError({ direction: 'window', navigation }); setToast({ type: 'error', message: 'Messages Could Not Be Loaded. Please Retry.' }); }
        } finally {
            if (current()) setLoadingMessages(false);
        }
    };
    // Keep ref in sync so the reconnect handler always calls the latest version
    loadMessagesRef.current = loadMessages;

    // Own the composer submission until its response; explicit retries use the saved operation.
    const sendLockRef = useRef(null);

    // Load older messages (pagination — triggered when scrolling to top)
    // FIX #3: useRef-based lock prevents duplicate pagination from rapid scroll
    const paginationLockRef = useRef(null);
    const loadOlderMessages = useCallback(async () => {
        if (!activeConversation || !hasMoreMessages || messages.length === 0 || historyError?.direction === 'older') return;
        // Double-check with ref lock (state updates are async, ref is synchronous)
        if (paginationLockRef.current?.scope === workspaceKey && paginationLockRef.current?.conversationId === activeConversation.id) return;
        const operation = { scope: workspaceKey, conversationId: activeConversation.id };
        paginationLockRef.current = operation;
        setLoadingOlderMessages(true);
        // Capture conversation at pagination start — user may switch before fetch resolves
        const paginationConvId = activeConversation.id;
        const requestScope = workspaceKey;
        const windowSequence = messagesRequestSequence.current;
        const currentWindow = () => messagesRequestSequence.current === windowSequence && workspaceRef.current === requestScope && activeConversationRef.current?.id === paginationConvId;
        try {
            const container = messagesContainerRef.current;
            const prevScrollHeight = container?.scrollHeight || 0;
            const prevScrollTop = container?.scrollTop || 0;
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
                    firstUnread: false,
                    before: oldestMsg.created_at,
                    beforeId: oldestMsg.id,
                    limit: 50,
                }),
            });
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();
            // Staleness guard: discard if user switched conversations while paginating
            if (paginationLockRef.current !== operation || !currentWindow()) return;
            if (result.success && result.messages?.length > 0) {
                // Filter out hidden messages — re-read from localStorage for freshness
                const freshHiddenIds = (() => {
                    try { return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]')); }
                    catch { return new Set(); }
                })();
                const filteredOlder = result.messages.filter(m => !freshHiddenIds.has(m.id));
                continuity.ingestSavedItems(result.savedItems);
                setMessages(prev => {
                    if (!currentWindow()) return prev;
                    // Signal scroll effect to skip — rAF below will restore position
                    isPaginatingRef.current = true;
                    const existingIds = new Set(prev.map(message => message.id));
                    return [...filteredOlder.filter(message => !existingIds.has(message.id)), ...prev];
                });
                setHasMoreMessages(result.hasOlder ?? result.messages.length >= 50);
                // Preserve scroll position after prepending older messages
                requestAnimationFrame(() => {
                    if (container && currentWindow()) {
                        container.scrollTop = prevScrollTop + container.scrollHeight - prevScrollHeight;
                    }
                });
            } else {
                setHasMoreMessages(false);
            }
        } catch (e) {
            console.warn('Load older messages error:', e);
            if (currentWindow()) setHistoryError({ direction: 'older' });
        } finally {
            if (paginationLockRef.current === operation) {
                paginationLockRef.current = null;
                setLoadingOlderMessages(false);
            }
        }
    }, [activeConversation, loadingOlderMessages, hasMoreMessages, messages, user, workspaceKey, historyError]);

    const newerPageRef = useRef(null);
    const loadNewerMessages = async () => {
        const conversationId = activeConversationRef.current?.id;
        const scope = workspaceRef.current;
        if (!conversationId || !hasNewerMessages || (newerPageRef.current?.scope === scope && newerPageRef.current?.conversationId === conversationId)) return;
        const latest = messages.filter(message => isMessageId(message.id)).at(-1);
        if (!latest) return;
        const owner = { scope, conversationId };
        const windowSequence = messagesRequestSequence.current;
        newerPageRef.current = owner;
        setLoadingNewerMessages(true);
        setHistoryError(null);
        const currentWindow = () => messagesRequestSequence.current === windowSequence && workspaceRef.current === scope && activeConversationRef.current?.id === conversationId;
        const current = () => newerPageRef.current === owner && currentWindow();
        try {
            const response = await authedFetch('/api/messenger/get-messages', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ conversationId, after: latest.created_at, afterId: latest.id, limit: 50 }),
            });
            const result = await response.json();
            if (!current()) return;
            if (!response.ok || !result.success || !Array.isArray(result.messages)) throw new Error('Messages Unavailable');
            continuity.ingestSavedItems(result.savedItems);
            setMessages(previous => currentWindow() ? result.messages.reduce((rows, message) => reconcileMessengerMessage(rows, message), previous) : previous);
            setHasNewerMessages(result.hasNewer === true);
            historyWindowRef.current = { conversationId, hasNewer: result.hasNewer === true };
        } catch {
            if (current()) setHistoryError({ direction: 'newer' });
        } finally {
            if (newerPageRef.current === owner) { newerPageRef.current = null; setLoadingNewerMessages(false); }
        }
    };

    const rememberReadingPosition = () => {
        const conversationId = activeConversationRef.current?.id;
        if (!isMessageId(conversationId) || pendingScrollRef.current) return;
        const boundary = visibleMessageBoundary(messagesContainerRef.current);
        if (boundary) editContinuity(conversationId, 'position', { messageId: boundary.first, offset: boundary.offset });
    };

    const handleSelectConversation = async (conversation) => {
        rememberReadingPosition();
        flushContinuity();
        const selectionSequence = ++restoreSequenceRef.current;
        newerPageRef.current = null;
        setLoadingNewerMessages(false);
        activeConversationRef.current = conversation;
        paginationLockRef.current = null;
        setLoadingOlderMessages(false);
        setActiveConversation(conversation);
        setReplyToMessage(null);
        setFirstUnreadMessageId(null);
        setHistoryError(null);
        setHasNewerMessages(false);
        historyWindowRef.current = { conversationId: conversation.id, hasNewer: false };
        pendingScrollRef.current = { scope: workspaceRef.current, conversationId: conversation.id, bottom: true };
        stickToBottomRef.current = true;
        setMessageSearchQuery('');
        setShowMessageSearch(false);
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

        // Read continuity before choosing a bounded history window. Edits made
        // while this response is pending stay owned by the local draft.
        const scope = workspaceRef.current;
        await continuity.read(conversation.id);
        if (selectionSequence !== restoreSequenceRef.current || scope !== workspaceRef.current || activeConversationRef.current?.id !== conversation.id) return;
        const linkedDraft = deepLinkDraftRef.current;
        if (linkedDraft?.actorId === user.id && linkedDraft.conversationId === conversation.id) {
            if (!continuity.state(conversation.id).draft.text) editContinuity(conversation.id, 'draft', { text: linkedDraft.text, replyToId: null });
            else setToast({ type: 'info', message: 'Your Existing Draft Was Kept.' });
            deepLinkDraftRef.current = null;
        }
        const position = continuity.state(conversation.id).position;
        const explicit = explicitAnchorRef.current;
        explicitAnchorRef.current = null;
        await loadMessages(conversation.id, explicit?.conversationId === conversation.id
            ? { anchorMessageId: explicit.messageId }
            : position.messageId ? { anchorMessageId: position.messageId, offset: position.offset } : { firstUnread: true });

        // The persisted read receipt clears the badge after messages load.

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
            console.warn('[Jarvis] localStorage quota exceeded - history not saved:', e?.message);
        }
    };

    const runSendOperation = async (operation) => {
        if (!operation || authIdentityRef.current !== operation.actorId) return null;
        const scope = workspaceRef.current;
        const generation = authGenerationRef.current;
        const current = () => authGenerationRef.current === generation && authIdentityRef.current === operation.actorId
            && workspaceRef.current === scope;
        const changed = updated => {
            if (!current()) return;
            const row = updated.receipt || messengerOperationMessage(updated);
            const cached = messageCacheRef.current.get(updated.conversationId) || [];
            messageCacheRef.current.set(updated.conversationId, reconcileMessengerMessage(cached, row));
            if (activeConversationRef.current?.id === updated.conversationId) {
                setMessages(previous => current() && activeConversationRef.current?.id === updated.conversationId
                    ? reconcileMessengerMessage(previous, row) : previous);
            }
        };
        try {
            const receipt = await performMessengerSend(operation, {
                storage: localStorage, currentActor: () => authGenerationRef.current === generation ? authIdentityRef.current : null,
                changed,
                send: body => {
                    if (authGenerationRef.current !== generation || authIdentityRef.current !== operation.actorId) throw new Error('Account Changed');
                    return authedFetch('/api/messenger/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                        body,
                    });
                },
            });
            if (current()) {
                if (receipt) {
                    loadConversationsRef.current?.(operation.actorId, { invalidate: true });
                    busEmit.dataMutated('messenger');
                    busEmit.messageSent(operation.conversationId);
                } else setToast({ type: 'error', message: 'Message Was Not Confirmed. Open This Conversation And Tap Retry.' });
            }
            return receipt;
        } catch (error) {
            operation.status = 'failed';
            changed(operation);
            if (current()) setToast({ type: 'error', message: 'Message Could Not Be Saved For Retry. Please Check Browser Storage.' });
            return null;
        }
    };
    const queueMessengerSend = async (content, options = {}) => {
        const actorId = options.actorId || user?.id;
        if (!actorId || authIdentityRef.current !== actorId) return Promise.resolve(null);
        let operation;
        try {
        operation = createMessengerSendOperation({
            actorId, conversationId: options.conversationId || activeConversation?.id, content,
            requestId: options.requestId, metadata: options.metadata === undefined ? getClubMetadata() : options.metadata,
            messageType: options.messageType || 'text', profile: options.profile || (isClubMode && clubPage
                ? { id: actorId, username: clubPage.name, avatar_url: clubPage.avatar_url, is_club_identity: true, club_id: clubPage.id }
                : { id: actorId, username: user.username, avatar_url: user.avatar_url }),
        });
        } catch {
            setToast({ type: 'error', message: 'Message Could Not Be Prepared. Please Check The Message And Try Again.' });
            return null;
        }
        try { saveMessengerSendOperation(localStorage, operation); }
        catch { setToast({ type: 'error', message: 'Message Could Not Be Saved For Retry. Your Draft Was Kept.' }); return null; }
        sendOperationsRef.current.set(operation.requestId, operation);
        options.onRecorded?.();
        return runSendOperation(operation);
    };
    sendOperationRef.current = queueMessengerSend;

    const handleSendMessage = async (content, controls = {}) => {
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
            controls.onRecorded?.();

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

        if (replyToMessage?.unavailable || replyToMessage?.content === 'Loading Original Message...') {
            setToast({ type: 'error', message: 'Remove The Unavailable Reply Before Sending.' });
            return;
        }
        // A retry reuses this operation rather than rebuilding from the composer.
        if (sendLockRef.current) return;
        const sendOwner = {};
        sendLockRef.current = sendOwner;
        let finalContent = content.trim();
        if (replyToMessage) {
            const replyText = (replyToMessage.content || replyToMessage.text || '').replace(/\[REPLY:[^\]]+\]\s*/, '').slice(0, 80);
            finalContent = `[REPLY:${replyText}] ${finalContent}`;
        }
        const conversationId = activeConversation.id;
        const draftOwner = continuity.state(conversationId).draft;
        try {
            await queueMessengerSend(finalContent, { onRecorded: () => {
                if (controls.consumeDraft) continuity.clearDraftIfUnchanged(conversationId, draftOwner);
                else if (draftOwner.replyToId) editContinuity(conversationId, 'draft', { text: draftOwner.text, replyToId: null });
                setReplyToMessage(null);
                controls.onRecorded?.();
                if (historyWindowRef.current.hasNewer) void loadMessages(conversationId, { latest: true });
                stickToBottomRef.current = true;
            } });
        } finally {
            if (sendLockRef.current === sendOwner) sendLockRef.current = null;
        }
    };

    // Only the saved original operation may be retried. A different active
    // conversation or account must never become its destination or sender.
    const handleRetryMessage = (failedMsg) => {
        if (!failedMsg?.request_id || failedMsg.sender_id !== authIdentityRef.current
            || activeConversationRef.current?.id !== failedMsg.conversation_id) return;
        const operation = sendOperationsRef.current.get(failedMsg.request_id);
        if (!operation || operation.actorId !== failedMsg.sender_id
            || operation.conversationId !== failedMsg.conversation_id) return;
        return runSendOperation(operation);
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
        if (isMessageId(activeConversation?.id) && isMessageId(message?.id)) editContinuity(activeConversation.id, 'draft', { text: continuity.state(activeConversation.id).draft.text, replyToId: message.id });
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
        if (!forwardingMessage || !targetConversation || !user || forwardOperationRef.current) return;
        const owner = {};
        forwardOperationRef.current = owner;
        const actorId = user.id;
        const scope = workspaceRef.current;
        const generation = authGenerationRef.current;
        const current = () => authIdentityRef.current === actorId && authGenerationRef.current === generation && workspaceRef.current === scope;
        const original = forwardingMessage;
        try {
            let rawContent = original.content || '';
            if (rawContent.startsWith('[CALL_RECEIPT]')) {
                setToast({ type: 'info', message: 'Call Receipts Cannot Be Forwarded' });
                return;
            }
            rawContent = rawContent.replace(/^\[REPLY:[^\]]+\]\s*/, '');
            const content = rawContent.trim() ? `[Forwarded] ${rawContent.trim()}` : '[Forwarded Message]';
            const receipt = await queueMessengerSend(content, { actorId, conversationId: targetConversation.id });
            if (receipt && current()) {
                setToast({ type: 'success', message: `Message Forwarded To ${targetConversation.otherUser?.full_name || targetConversation.otherUser?.display_name || targetConversation.otherUser?.username || 'Conversation'}` });
                busEmit.messageForwarded(original.conversation_id || activeConversation?.id, targetConversation.id);
            }
        } finally {
            if (forwardOperationRef.current === owner) forwardOperationRef.current = null;
            if (current()) setForwardingMessage(previous => previous === original ? null : previous);
        }
    };

    // Handle GIF send — sends GIF URL as a message
    const handleGifSend = (gifUrl) => {
        if (!gifUrl) return;
        handleSendMessage(`[GIF](${gifUrl})`);
    };

    const handleTogglePin = (conversationId) => continuity.write(conversationId, 'pin', !pinnedConvoIds.includes(conversationId));
    const handleSaveMessage = async (message, saved) => {
        if (isMessageId(message?.id) && isMessageId(message.conversation_id)
            && await continuity.write(message.conversation_id, 'saved', { messageId: message.id, saved }) && saved) await continuity.read(message.conversation_id);
    };
    const openSavedMessage = async item => {
        explicitAnchorRef.current = { conversationId: item.conversationId, messageId: item.messageId };
        setShowSavedMessages(false);
        await resolveConversationRef.current(item.conversationId);
    };

    // Uploads retain their original account, destination and club identity. Only
    // the final URL enters a durable send operation; a blob preview is not retryable.
    const uploadMessengerAttachment = async (file, { fileName, mimeType, contentForUrl, timeoutMs }) => {
        if (!user || !activeConversation || !file) return;
        const actorId = user.id;
        const conversationId = activeConversation.id;
        const generation = authGenerationRef.current;
        const scope = workspaceRef.current;
        const requestId = crypto.randomUUID();
        const metadata = getClubMetadata();
        const profile = isClubMode && clubPage
            ? { id: actorId, username: clubPage.name, avatar_url: clubPage.avatar_url, is_club_identity: true, club_id: clubPage.id }
            : { id: actorId, username: user.full_name || user.username || user.user_metadata?.username, avatar_url: user.avatar_url || user.user_metadata?.avatar_url };
        const sameAccount = () => authIdentityRef.current === actorId && authGenerationRef.current === generation;
        const current = () => sameAccount() && workspaceRef.current === scope && activeConversationRef.current?.id === conversationId;
        const blobUrl = URL.createObjectURL(file);
        const tempId = `temp-${requestId}`;
        setMessages(previous => [...previous, { id: tempId, request_id: requestId, conversation_id: conversationId,
            content: contentForUrl(blobUrl), created_at: new Date().toISOString(), sender_id: actorId,
            profiles: profile, status: 'sending' }]);
        setToast({ type: 'info', message: 'Uploading...' });
        try {
            const token = getAccessToken();
            const response = await authedFetch('/api/social/upload-url', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ fileName, fileSize: file.size, mimeType, folder: 'messages', prefix: actorId }),
            });
            const upload = await response.json();
            if (!response.ok || !upload.success || !upload.signedUrl || !upload.publicUrl) throw new Error('Upload Could Not Be Started');
            if (!sameAccount()) return;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const result = await fetch(upload.signedUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file, signal: controller.signal });
                if (!result.ok) throw new Error('Upload Did Not Complete');
            } finally { clearTimeout(timeout); }
            if (!sameAccount()) return;
            await queueMessengerSend(contentForUrl(upload.publicUrl), { actorId, conversationId, requestId, metadata, profile });
        } catch (error) {
            if (current()) {
                setMessages(previous => current() ? previous.filter(message => message.id !== tempId) : previous);
                setToast({ type: 'error', message: 'Upload Failed. Select The File Again To Retry.' });
            }
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    };

    // Handle media (photo/video) upload.
    const handleMediaUpload = async (file) => {
        if (!user || !activeConversation || !file) return;
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            setToast({ type: 'error', message: 'Only Images And Videos Are Supported' });
            return;
        }
        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setToast({ type: 'error', message: `File Too Large. Max ${isVideo ? '50MB' : '10MB'}` });
            return;
        }
        return uploadMessengerAttachment(file, {
            fileName: file.name || `media_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
            mimeType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
            contentForUrl: url => isImage ? `[Image](${url})` : `[Video](${url})`, timeoutMs: 5 * 60 * 1000,
        });
    };

    const handleVoiceSend = async (audioBlob, durationSeconds) => {
        if (!user || !activeConversation || !audioBlob) return;
        return uploadMessengerAttachment(audioBlob, {
            fileName: `voice_${Date.now()}.webm`, mimeType: 'audio/webm',
            contentForUrl: url => `[Audio](${url})|dur:${durationSeconds || 0}`, timeoutMs: 60000,
        });
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
                    .select('id, username, avatar_url')
                    .or(`username.ilike.%${escaped}%,display_name.ilike.%${escaped}%`)
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
                    contextEntityId: selectedClub?.pageId || null,
                    contextEntityType: selectedClub?.pageId ? 'club' : null,
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
                    message: `${otherUser.full_name || otherUser.username} isn't your friend - your message will be sent as a request`
                });
            }
        } catch (e) {
            console.warn('Start conversation error:', e);
            setToast({ type: 'error', message: 'Could not create conversation. Please try again later.' });
            throw e; // re-throw so the caller (openCompose) can catch and handle it
        }
    };

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
                    console.debug('[Presence] Sync - online users:', onlineSet.size);
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
            if (type === 'OPEN_CONVERSATION' && id) resolveConversationRef.current?.(id);
        };
        window.addEventListener('message', handleParentMessage);
        return () => window.removeEventListener('message', handleParentMessage);
    }, [conversations, router.query.hideHeader]);

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

    const enterClubWorkspace = (club, folder = 'messages') => {
        if (!club || !joinedClubs.some(c => c.id === club.id)) return;
        setWorkspaceSelection({ clubId: club.id, folder: folder === 'invoices' ? 'invoices' : 'messages' });
        const page = club.canManage && ownedPages.find(p => p.id === club.pageId);
        if (page) switchToClub(page);
        else switchToPersonal();
    };
    const leaveClubWorkspace = () => {
        setWorkspaceSelection({ clubId: null, folder: 'messages' });
        switchToPersonal();
    };
    // A URL selects only among clubs the server has confirmed this user joined.
    const handledClubEntry = useRef(null);
    useEffect(() => {
        const entry = resolveMessengerClubEntry(joinedClubs, router.query);
        if (!entry) return;
        const key = `${user?.id}:${entry.club.id}:${entry.folder}`;
        if (handledClubEntry.current === key) return;
        handledClubEntry.current = key;
        enterClubWorkspace(entry.club, entry.folder);
    }, [user?.id, joinedClubs, router.query.clubId, router.query.forceIdentity, router.query.folder, router.query.conversation]);

    /*
     * ITEM 13 (2026-09-08): next.config.js redirects /hub/live-help to
     * /hub/messenger?chat=jarvis, and nothing here read `chat` - so the
     * redirect dropped you on the plain inbox. Jarvis is reachable only
     * through handleSelectConversation's isJarvis branch, which nothing
     * triggered from the URL.
     */
    const jarvisOpenedRef = useRef(false);
    useEffect(() => {
        if (router.query.chat !== 'jarvis' || jarvisOpenedRef.current) return;
        jarvisOpenedRef.current = true;
        // The SAME object the sidebar's Jarvis row builds. A thinner one leaves
        // the thread header without an otherUser and leaves the active-id
        // highlight ('jarvis-ai') pointing at nothing.
        handleSelectConversation({
            id: 'jarvis-ai',
            isJarvis: true,
            otherUser: {
                id: 'jarvis',
                username: 'jarvis',
                full_name: 'Jarvis',
                avatar_url: null,
            },
            last_message_preview: 'Your Poker AI Assistant',
            last_message_at: new Date().toISOString(),
            unreadCount: 0,
        });
    }, [router.query.chat]);

    // Start a Jitsi call - Now uses real-time signaling for instant popup
    const startCall = async (type) => {
        if (!activeConversation || !user) return;

        // BUG-9 FIX: Prevent double-click or calling while already in a call
        if (callingUser || showCall) {
            return;
        }

        const continuityButtonStyle = { minHeight: 44, border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.blue, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
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

            await queueMessengerSend(`[CALL_RECEIPT]${receiptPayload}`, { conversationId: activeConversation.id });
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

    if (loading && clubAccess.userId !== user?.id) {
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
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                ` }} />
            </div>
        );
    }

    // Not logged in — only show after loading completes to prevent flash
    if (!user && !loading) {
        return (
            <>
                <SEOHead
                    title="Messenger - Direct Messages"
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

    const continuityButtonStyle = { minHeight: 44, border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.blue, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
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
                <style dangerouslySetInnerHTML={{ __html: `
                    /* MOBILE-FIRST MESSENGER */
                    .messenger-page { 
                        width: 100%; 
                        max-width: 100%; 
                        margin: 0 auto; 
                        overflow-x: hidden;
                        /* Keep the full-screen composer above the app-shell footer. */
                        height: ${router.query.hideHeader === 'true' ? 'calc(100vh - var(--sp-footer-height, 56px))' : 'calc(100vh - var(--sp-header-height, 54px) - var(--sp-footer-height, 56px))'};
                        height: ${router.query.hideHeader === 'true' ? 'calc(100dvh - var(--sp-footer-height, 56px))' : 'calc(100dvh - var(--sp-header-height, 54px) - var(--sp-footer-height, 56px))'};
                        padding-bottom: ${router.query.bottomPad ? `${parseInt(router.query.bottomPad, 10)}px` : '0px'};
                        box-sizing: border-box;
                    }
                    
                    /* Mobile-specific messenger styles */
                    @media (max-width: 768px) {
                        .messenger-page {
                            height: ${router.query.hideHeader === 'true' ? 'calc(100vh - var(--sp-footer-height, 56px))' : 'calc(100vh - var(--sp-header-height, 54px) - var(--sp-footer-height, 56px))'};
                            height: ${router.query.hideHeader === 'true' ? 'calc(100dvh - var(--sp-footer-height, 56px))' : 'calc(100dvh - var(--sp-header-height, 54px) - var(--sp-footer-height, 56px))'};
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
                ` }} />
            </Head>

            {/* UNIVERSAL HEADER - Mobile responsive with diamond/XP */}
            {router.query.hideHeader !== 'true' && (
                <UniversalHeader
                    pageDepth={1}
                    commandMenuOpen={menuOpen}
                    onCommandMenuOpenChange={setMenuOpen}
                    commandMenuItems={menuConfig.menuItems}
                    commandMenuBottomLinks={menuConfig.bottomLinks}
                />
            )}

            {/* Forward Message Modal */}
            {forwardingMessage && (
                <div
                  data-sp-skip-a11y="backdrop: click dismisses, Escape is the keyboard path" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setForwardingMessage(null)}>
                    <div
                      data-sp-skip-a11y="propagation guard, not a control" style={{
                        background: C.card, borderRadius: 12, width: 360, maxHeight: 480,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '8px 8px 8px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Forward Message</span>
                            <button onClick={() => setForwardingMessage(null)} aria-label="Close" className="sp-icon-btn" style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: C.textSec, fontSize: 20,
                                minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
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
                                <div style={{ textAlign: 'center', padding: 20, color: C.textSec }}>No Other Conversations To Forward To</div>
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
                    <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes ring {
                            0%, 100% { box-shadow: 0 0 0 4px rgba(0,132,255,0.3), 0 0 30px rgba(0,132,255,0.4); }
                            50% { box-shadow: 0 0 0 8px rgba(0,132,255,0.2), 0 0 50px rgba(0,132,255,0.6); }
                        }
                        @keyframes pulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.1); }
                        }
                    ` }} />
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
                    {/* Call Header. Below the status bar so End Call is reachable (mobile phase 0b). */}
                    <div style={{
                        padding: '12px 16px',
                        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
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
                                    {callType === 'video' ? 'Video' : 'Voice'} Call With {activeConversation?.otherUser?.full_name || activeConversation?.otherUser?.display_name || activeConversation?.otherUser?.username || 'User'}
                                </div>
                                <div style={{ color: '#888', fontSize: 12 }}>Smarter Poker Video</div>
                            </div>
                        </div>
                        <button
                            onClick={endCall}
                            aria-label="End Call"
                            style={{
                                padding: '10px 20px',
                                minHeight: 44,
                                touchAction: 'manipulation',
                                WebkitTapHighlightColor: 'transparent',
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
                height: router.query.hideHeader === 'true' ? 'calc(100dvh - var(--sp-footer-height, 56px))' : 'calc(100dvh - var(--sp-header-height, 54px) - var(--sp-footer-height, 56px))',
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
                    minHeight: 0,
                    flexShrink: 0,
                }}>
                    <div data-messenger-inbox-scroll style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <div style={{ padding: '8px 16px' }}>
                        <button type="button" aria-label="Saved Messages" onClick={() => { setShowSavedMessages(value => !value); if (!showSavedMessages) void continuity.read(); }}
                            style={continuityButtonStyle}>
                            Saved Messages
                        </button>
                    </div>
                    <ContinuityStatus controller={continuity} theme={C} />
                    {showSavedMessages && <section aria-label="Saved Messages List" style={{ padding: '8px 16px', color: C.text, borderBottom: `1px solid ${C.border}` }}>
                        {continuity.loading ? <p>Loading Saved Messages...</p> : continuity.errors.has('read') ? <p>Saved Messages Are Unavailable.</p>
                            : continuity.saved.length === 0 ? <p>No Saved Messages Yet</p> : continuity.saved.map(item => <div key={item.messageId} style={{ marginBottom: 12 }}>
                                <button type="button" aria-label="Open Saved Message" disabled={!item.message || item.message.is_deleted} onClick={() => openSavedMessage(item)}
                                    style={{ border: 0, background: 'none', color: C.text, textAlign: 'left', cursor: 'pointer', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.message && !item.message.is_deleted ? (item.message.content || 'Saved Message').slice(0, 120) : 'Message Is No Longer Available'}
                                </button>
                                <button type="button" aria-label="Remove Saved Message" onClick={() => continuity.write(item.conversationId, 'saved', { messageId: item.messageId, saved: false })}
                                    style={continuityButtonStyle}>Remove</button>
                            </div>)}
                        {continuity.hasMoreSaved && !continuity.loading && <button type="button" style={continuityButtonStyle} onClick={() => continuity.read(null, continuity.nextSavedCursor)}>Load More Saved Messages</button>}
                    </section>}
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

                    <ClubArenaWorkspace clubs={joinedClubs} open={clubDrawerOpen}
                        clubId={workspaceSelection.clubId} folder={workspaceSelection.folder} theme={C}
                        unreadCounts={workspaceUnread?.key === workspaceKey ? workspaceUnread.counts : messengerUnread?.clubs?.[workspaceSelection.clubId]}
                        clubUnread={messengerUnread?.clubs}
                        onEnter={enterClubWorkspace} onExit={leaveClubWorkspace}
                        onFolder={folder => setWorkspaceSelection(prev => ({ ...prev, folder }))} />
                    {loading && <div role="status" style={{ padding: 12, color: C.textSec }}>Loading Inbox...</div>}
                    {inboxError && <div role="alert" style={{ padding: 16, color: C.textSec }}>
                        {inboxError}
                        <button type="button" onClick={() => loadConversationsRef.current?.(user.id)}>Retry</button>
                    </div>}

                    {/* Message Requests Banner — Facebook-style */}
                    {!clubDrawerOpen && messageRequestCount > 0 && (
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
                                    <div style={{ fontSize: 12, color: C.textSec }}>{messageRequestCount} Pending {messageRequestCount === 1 ? 'request' : 'requests'}</div>
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
                    <div>
                        {!loading && !inboxError && weeklyPreview?.key === workspaceKey && selectedClub?.canManage && workspaceSelection.folder === 'invoices' && <div style={{ padding: 12 }}>
                            <AccountingInvoiceCard theme={C} meta={{ invoice_type: 'club_weekly_accounting', preview: true,
                                status: weeklyPreview.report.status, lines: weeklyPreview.report }}
                                content={`${weeklyPreview.report.basis_source}. ${weeklyPreview.report.note}`} />
                        </div>}
                        {loading || inboxError ? null : conversations.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                {/* An empty CLUB inbox is not the same as an empty
                                    personal one, and saying "No Conversations Yet"
                                    for both reads as a bug the first time a club
                                    inbox is opened. */}
                                <div style={{ color: C.text, fontWeight: 500, marginBottom: 4 }}>
                                    {workspaceSelection.folder === 'invoices' ? 'No Issued Invoices Yet' : isClubMode
                                        ? `No Messages In ${selectedClub?.name || 'This Club'} Yet`
                                        : 'No Conversations Yet'}
                                </div>
                                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
                                    {workspaceSelection.folder === 'invoices' ? 'Issued Invoices And Invoice Discussions Appear Here.' : isClubMode
                                        ? 'Conversations you start while messaging as this club appear here. Your personal messages stay in your own inbox.'
                                        : 'Search For People To Start Messaging!'}
                                </div>
                                {workspaceSelection.folder !== 'invoices' && <button
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
                                    }}>Search For People</button>}
                            </div>
                        ) : (
                            <>                                {/* Regular Conversations */}
                                {conversations.filter(conv => {
                                    // ITEM 13 (2026-09-08): ?filter=unread was a
                                    // hamburger row that landed on the identical
                                    // default inbox, because nothing here read the
                                    // param. Now it does.
                                    if (router.query.filter === 'unread'
                                        && !(Number(conv.unreadCount) > 0)) return false;
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
                                        onPin={handleTogglePin}
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
                                            {messageHitsLoading || messageHitsError ? '' : ` (${messageHits.length})`}
                                        </div>

                                        {messageHitsLoading && (
                                            <div style={{ padding: '6px 16px', fontSize: 13, color: C.textSec }}>
                                                Searching...
                                            </div>
                                        )}

                                        {messageHitsError && <div role="status" style={{ padding: '6px 16px', fontSize: 13, color: C.textSec }}>{messageHitsError}</div>}
                                        {!messageHitsLoading && !messageHitsError && messageHits.length === 0 && (
                                            <div style={{ padding: '6px 16px', fontSize: 13, color: C.textSec }}>
                                                No Messages Match That.
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

                    {/* Bottom actions share the same anchored layout in every inbox. */}
                    </div>
                    <div data-messenger-bottom-actions style={{
                        flexShrink: 0,
                        marginTop: 'auto',
                        borderTop: `1px solid ${C.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        {/* Jarvis AI - Locked at Bottom (above Report Bug) */}
                        <div
                          role="button"
                          tabIndex={0}
                          onKeyDown={spKeyActivate}
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
                                <Image src="/images/jarvis-avatar.webp" alt="Jarvis AI" width={48} height={48} style={{
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
                    </div>
                </div>
                </aside>

                {/* ════════════════════════════════════════════════════════
                    RIGHT PANEL - Chat Window
                    ════════════════════════════════════════════════════════ */}
                <main style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
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

                                    {activeConversation.isAccounting || !otherUser?.username
                                        ? <Avatar name={activeTitle} size={40} showOnline={false} />
                                        : <Link href={`/hub/user/${otherUser.username}`}><Avatar src={otherUser.avatar_url} name={activeTitle} size={40} online={otherUserStatus === 'online'} /></Link>}

                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: C.text, fontWeight: 600, fontSize: 15 }}>{activeTitle}</div>
                                        <div style={{ fontSize: 12, color: otherUserStatus === 'online' ? C.green : C.textSec }}>
                                            {activeConversation.isAccounting ? 'Invoices And Accounting Discussions' : otherUserStatus === 'online' ? 'Active Now' : otherUserLastSeen ? `Active ${(() => {
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
                                        {!activeConversation?.isRequest && !activeConversation.isAccounting && (
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
                                        {!activeConversation.isAccounting && <button
                                            onClick={() => setShowUserInfo(!showUserInfo)}
                                            title="User Info"
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: showUserInfo ? C.bg : 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}><InfoIcon size={20} /></button>}
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
                                                    }}
                                                    placeholder="Search In This Conversation..."
                                                    style={{
                                                        flex: 1,
                                                        border: 'none',
                                                        background: 'transparent',
                                                        color: C.text,
                                                        padding: '8px 0',
                                                        fontSize: 14,
                                                        outline: 'none',
                                                    }}
                                                />
                                                {messageSearchQuery && (
                                                    <button
                                                        onClick={() => { setMessageSearchQuery(''); }}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: C.textSec, fontSize: 14,
                                                        }}
                                                    >×</button>
                                                )}
                                            </div>

                                            {messageSearchQuery.trim().length >= 2 && (
                                                <div role="status" style={{ padding: '6px 0', fontSize: 13, color: C.textSec }}>
                                                    {conversationSearch.loading ? 'Searching...' : conversationSearch.error || (messageSearchResults.length === 0 ? 'No Messages Match That.' : '')}
                                                </div>
                                            )}
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
                                                          role="button"
                                                          tabIndex={0}
                                                          onKeyDown={spKeyActivate}
                                                            key={result.id}
                                                            onClick={() => {
                                                                void loadMessages(activeConversation.id, { anchorMessageId: result.id });
                                                                setShowMessageSearch(false);
                                                                setMessageSearchQuery('');
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

                                {!activeConversation.isJarvis && <div style={{ display: 'flex', gap: 8, padding: '6px 12px', flexWrap: 'wrap' }}>
                                    {firstUnreadMessageId && <button type="button" style={continuityButtonStyle} onClick={() => loadMessages(activeConversation.id, { anchorMessageId: firstUnreadMessageId })}>Jump To First Unread</button>}
                                    {hasNewerMessages && <button type="button" style={continuityButtonStyle} onClick={() => loadMessages(activeConversation.id, { latest: true })}>Jump To Latest</button>}
                                    {historyError && <button type="button" style={continuityButtonStyle} onClick={() => {
                                        const retry = historyError; setHistoryError(null);
                                        if (retry.direction === 'newer') void loadNewerMessages();
                                        else if (retry.direction === 'older') void loadMessages(activeConversation.id, { anchorMessageId: messages.find(message => isMessageId(message.id))?.id });
                                        else void loadMessages(activeConversation.id, retry.navigation);
                                    }}>Retry Loading Messages</button>}
                                </div>}
                                <div
                                    ref={messagesContainerRef}
                                    data-messenger-message-scroll
                                    data-conversation-id={activeConversation.id}
                                    onScroll={(e) => {
                                        // Infinite scroll — load older messages when near top
                                        if (e.target.scrollTop < 100 && hasMoreMessages && !loadingOlderMessages) {
                                            loadOlderMessages();
                                        }
                                        // Phase 3: Show scroll-to-bottom FAB when scrolled up
                                        // BUGFIX: Only call setState when value actually changes to avoid re-renders on every scroll frame
                                        const el = e.target;
                                        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                                        stickToBottomRef.current = distFromBottom < 80 && !historyWindowRef.current.hasNewer;
                                        rememberReadingPosition();
                                        visibleReadRef.current?.();
                                        const shouldShow = distFromBottom > 200 || historyWindowRef.current.hasNewer;
                                        setShowScrollDown(prev => prev === shouldShow ? prev : shouldShow);
                                    }}
                                    style={{
                                    flex: 1,
                                    minHeight: 0,
                                    overflowY: 'auto',
                                    padding: '16px 0',
                                    position: 'relative',
                                }}>
                                    {/* Loading older messages indicator */}
                                    {loadingOlderMessages && (
                                        <div style={{ textAlign: 'center', padding: '12px 0', color: C.textSec, fontSize: 13 }}>
                                            Loading Older Messages...
                                        </div>
                                    )}
                                    {/* Accounting conversations describe documents, not a synthetic user. */}
                                    {activeConversation.isAccounting ? (
                                        <AccountingConversationIntroduction title={activeTitle} theme={C} />
                                    ) : <div style={{ textAlign: 'center', marginBottom: 24, padding: '0 20px' }}>
                                        <Avatar src={otherUser?.avatar_url} name={activeTitle} size={80} showOnline={false} />
                                        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 17 }}>{activeTitle}</div>
                                        <div style={{ color: C.textSec, fontSize: 13 }}>Smarter.Poker Member</div>
                                        {otherUser?.username && <Link href={`/hub/user/${otherUser.username}`} style={{
                                            display: 'inline-block',
                                            marginTop: 12,
                                            padding: '8px 16px',
                                            background: C.bg,
                                            borderRadius: 8,
                                            color: C.text,
                                            textDecoration: 'none',
                                            fontSize: 14,
                                            fontWeight: 500,
                                        }}>View Profile</Link>}
                                    </div>}

                                    {loadingMessages ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                                            Loading Messages...
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                                            {activeConversation.isAccounting ? 'No Accounting Documents Or Discussions Yet' : <>
                                                <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                                                Say Hi To Start The Conversation!
                                            </>}
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
                                                    <div data-message-id={msg.id} data-client-request-id={msg.request_id || undefined} data-send-status={msg.status || undefined}>
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
                                                        onSave={activeConversation.isJarvis ? undefined : handleSaveMessage}
                                                        isSaved={continuity.savedState(msg.id).saved === true}
                                                        saving={continuity.isSaving(activeConversation.id, 'saved')}
                                                        currentUserId={user.id}
                                                        theme={C}
                                                    />
                                                    {isOwn && msg.status === 'failed' && msg.request_id && (
                                                        <button type="button" aria-label="Retry Message" onClick={() => handleRetryMessage(msg)}
                                                            style={{ display: 'block', margin: '0 8px 8px auto', border: 0, background: 'none', color: C.blue, cursor: 'pointer' }}>
                                                            Retry Message
                                                        </button>
                                                    )}
                                                    </div>
                                                </Fragment>
                                            );
                                        })
                                    ); })()}
                                    {/* Typing indicator */}
                                    {otherTyping && <TypingIndicator name={otherUser?.full_name || otherUser?.display_name || otherUser?.username} theme={C} />}
                                    {hasNewerMessages && <button type="button" disabled={loadingNewerMessages} onClick={loadNewerMessages}
                                        style={{ ...continuityButtonStyle, display: 'block', margin: '12px auto' }}>
                                        {loadingNewerMessages ? 'Loading Newer Messages...' : 'Load Newer Messages'}
                                    </button>}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Phase 3: Scroll-to-bottom FAB */}
                                {showScrollDown && (
                                    <button
                                        onClick={() => { stickToBottomRef.current = true; if (hasNewerMessages) void loadMessages(activeConversation.id, { latest: true }); else messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
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
                                        <span style={{ fontWeight: 600 }}>Messaging As {clubPage.name}</span>
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
                                        <button onClick={clearReply} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 18 }}>×</button>
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

                                <ContinuityStatus controller={continuity} conversationId={activeConversation.isJarvis ? null : activeConversation.id} theme={C}
                                    onUsePosition={position => loadMessages(activeConversation.id, position.messageId ? { anchorMessageId: position.messageId, offset: position.offset } : { latest: true })} />
                                <MessageInput key={`${user.id}:${activeConversation.id}`} onSend={handleSendMessage} onTyping={broadcastTyping} onMediaUpload={handleMediaUpload} onGifSend={handleGifSend} onVoiceSend={handleVoiceSend} autoFocus={composeFocus} value={activeConversation.isJarvis ? undefined : continuity.state(activeConversation.id).draft.text}
                                    onDraftChange={activeConversation.isJarvis ? undefined : text => editContinuity(activeConversation.id, 'draft', { text, replyToId: continuity.state(activeConversation.id).draft.replyToId })} theme={C} />
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
        </HubErrorBoundary>
    );
}
