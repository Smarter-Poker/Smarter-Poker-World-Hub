/**
 * SMARTER.POKER FRIENDS & FOLLOWERS PAGE
 * View friends, friend requests, following, followers, and discover suggested connections
 * Features SmarterPoker-style follow system with auto-follow on declined requests
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import toast from '../../src/stores/toastStore';
import { broadcastSyncDebounced, listenBroadcast, BROADCAST_TAB_ID } from '../../src/lib/broadcastSync';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import { getAuthUser } from '../../src/lib/authUtils';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { friendPreferences } from '../../src/services/preferences-service';
import { usePersistedState } from '../../src/hooks/usePersistedState';
import { getAccessToken } from '../../src/lib/authUtils';
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

const C = {
    bg: '#0a0a0a', card: '#1a1a1a', cardHover: '#252525', text: '#FFFFFF', textSec: '#9ca3af',
    border: '#2a2a2a', blue: '#3b82f6', green: '#22c55e', red: '#ef4444',
    purple: '#8b5cf6', pink: '#ec4899', orange: '#f97316', cyan: '#06b6d4',
    gradient1: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
    gradient2: 'linear-gradient(135deg, #ec4899 0%, #f97316 100%)',
    gradient3: 'linear-gradient(135deg, #22c55e 0%, #06b6d4 100%)',
};

// Time ago helper for last active status
function timeAgo(date) {
    if (!date) return null;
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 300) return 'online'; // Within 5 minutes = online
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
}

function Avatar({ src, name, size = 60, hasStory = false }) {
    return (
        <div style={{
            width: size + (hasStory ? 6 : 0),
            height: size + (hasStory ? 6 : 0),
            borderRadius: '50%',
            background: hasStory ? C.gradient2 : 'transparent',
            padding: hasStory ? 3 : 0,
            flexShrink: 0
        }}>
            <img
                src={src || '/default-avatar.png'}
                alt={name || 'User'}
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: hasStory ? `3px solid ${C.card}` : 'none'
                }}
                loading="lazy" />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW BUTTON - Premium animated follow/unfollow button
// ═══════════════════════════════════════════════════════════════════════════
function FollowButton({ isFollowing, onFollow, onUnfollow, size = 'normal' }) {
    const [hovering, setHovering] = useState(false);

    const baseStyle = {
        width: size === 'small' ? 110 : 130,
        boxSizing: 'border-box',
        justifyContent: 'center',
        padding: size === 'small' ? '6px 14px' : '8px 18px',
        borderRadius: 20,
        border: '1px solid transparent',
        fontWeight: 600,
        fontSize: size === 'small' ? 12 : 14,
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    };

    if (isFollowing) {
        return (
            <button
                onClick={onUnfollow}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                style={{
                    ...baseStyle,
                    background: hovering ? 'rgba(239, 68, 68, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                    color: hovering ? C.red : C.purple,
                    border: `1px solid ${hovering ? C.red : C.purple}`,
                }}
            >
                {hovering ? '× Unfollow' : ' Following'}
            </button>
        );
    }

    return (
        <button
            onClick={onFollow}
            style={{
                ...baseStyle,
                background: C.gradient2,
                color: 'white',
                boxShadow: '0 4px 15px rgba(236, 72, 153, 0.3)',
            }}
        >Follow</button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FRIEND REQUEST CARD - With Accept/Decline (auto-follow on decline)
// ═══════════════════════════════════════════════════════════════════════════
function FriendRequestCard({ request, onAccept, onDecline }) {
    const user = request.requester;

    return (
        <div style={{
            background: C.card,
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            border: `2px solid ${C.blue}`,
            boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
            transition: 'all 0.3s ease'
        }}>
            <Link href={`/hub/user/${user?.username || user?.id}`} style={{ flexShrink: 0 }}>
                <Avatar src={user?.avatar_url} name={user?.full_name || user?.username} size={70} />
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: C.text, marginBottom: 4 }}>
                    {user?.full_name || user?.username || 'Poker Player'}
                </div>
                <span style={{ fontSize: 14, color: C.blue }}>Friend Request Pending</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
                <button
                    onClick={() => onAccept(request)}
                    style={{
                        padding: '10px 24px',
                        borderRadius: 10,
                        border: 'none',
                        background: C.gradient1,
                        color: 'white',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                        transition: 'transform 0.2s',
                    }}
                >
                    Accept
                </button>
                <button
                    onClick={() => onDecline(request)}
                    style={{
                        padding: '10px 24px',
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: 'transparent',
                        color: C.textSec,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                    title="They'll Become Your Follower"
                >
                    Decline
                </button>
            </div>
            <div style={{ fontSize: 11, color: C.textSec, marginTop: 8, fontStyle: 'italic' }}>
                Declining will convert them to a follower
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// USER CARD - For friends, followers, following, and suggestions
// ═══════════════════════════════════════════════════════════════════════════
function UserCard({
    user,
    isFriend,
    isPending,
    isFollowing,
    isFollower,
    mutualCount = 0,
    onAddFriend,
    onRemoveFriend,
    onFollow,
    onUnfollow
}) {
    return (
        <div style={{
            background: C.card,
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.3s ease',
            border: `1px solid ${C.border}`,
        }}>
            <Link href={`/hub/user/${user.username || user.id}`} style={{ flexShrink: 0 }}>
                <Avatar src={user.avatar_url} name={user.full_name || user.username} size={70} />
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/hub/user/${user.username || user.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 4 }}>
                        {user.full_name || user.username || 'Poker Player'}
                    </div>
                </Link>
                {mutualCount > 0 && (
                    <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>
                        {mutualCount} mutual friends
                    </div>
                )}
                {isFollower && !isFriend && (
                    <div style={{ fontSize: 12, color: C.pink, marginBottom: 4 }}>
                        Follows you
                    </div>
                )}
                {user.city && user.state && (
                    <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>
                        {user.city}, {user.state}
                    </div>
                )}
                {user.favorite_game && (
                    <div style={{ fontSize: 13, color: C.textSec }}>
                        {user.favorite_game}
                    </div>
                )}
                {/* Last Active Status */}
                {user.last_active && (() => {
                    const status = timeAgo(user.last_active);
                    const isOnline = status === 'online';
                    return (
                        <div style={{
                            fontSize: 12,
                            color: isOnline ? C.green : C.textSec,
                            marginTop: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                        }}>
                            {isOnline ? (
                                <>
                                    <span style={{
                                        width: 8, height: 8,
                                        borderRadius: '50%',
                                        background: C.green,
                                        boxShadow: '0 0 6px rgba(34, 197, 94, 0.6)'
                                    }} />
                                    Online now
                                </>
                            ) : (
                                <>
                                    <span style={{ opacity: 0.6, fontSize: 10 }}>Active</span>
                                    Active {status}
                                </>
                            )}
                        </div>
                    );
                })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                {isFriend ? (
                    <button
                        onClick={() => onRemoveFriend(user.id)}
                        style={{
                            width: 110,
                            justifyContent: 'center',
                            boxSizing: 'border-box',
                            padding: '6px 14px',
                            borderRadius: 20,
                            border: `1px solid ${C.green}`,
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: C.green,
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        Friends
                    </button>
                ) : (
                    <>
                        {/* Follow/Unfollow Button */}
                        <FollowButton
                            isFollowing={isFollowing}
                            onFollow={() => onFollow(user.id)}
                            onUnfollow={() => onUnfollow(user.id)}
                            size="small"
                        />

                        {/* Add Friend Button (if not already pending) */}
                        {!isPending ? (
                            <button
                                onClick={() => onAddFriend(user.id)}
                                style={{
                                    width: 110,
                                    justifyContent: 'center',
                                    boxSizing: 'border-box',
                                    padding: '6px 14px',
                                    borderRadius: 20,
                                    border: `1px solid ${C.blue}`,
                                    background: 'transparent',
                                    color: C.blue,
                                    fontWeight: 600,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                            >
                                Add Friend
                            </button>
                        ) : (
                            <div style={{
                                width: 110,
                                boxSizing: 'border-box',
                                padding: '6px 14px',
                                borderRadius: 20,
                                background: 'rgba(156, 163, 175, 0.15)',
                                color: C.textSec,
                                fontWeight: 600,
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                Request Sent
                            </div>
                        )}
                    </>
                )}
            </div>
        </div >
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB BUTTON
// ═══════════════════════════════════════════════════════════════════════════
function TabButton({ active, onClick, icon, label, count }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '12px 20px',
                borderRadius: 12,
                border: 'none',
                background: active ? C.gradient1 : 'transparent',
                color: active ? 'white' : C.textSec,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.3s ease',
                position: 'relative',
            }}
        >
            {icon && <span>{icon}</span>}
            <span>{label}</span>
            {count > 0 && (
                <span style={{
                    background: active ? 'rgba(255,255,255,0.25)' : C.purple,
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700,
                }}>
                    {count}
                </span>
            )}
        </button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════
function FriendsPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = usePersistedState('sp-filters-friends-tab', 'discover'); // requests, friends, following, followers, discover

    // Deep-link: ?tab=friends|followers|following|requests|discover overrides persisted tab
    const VALID_TABS = new Set(['friends', 'followers', 'following', 'requests', 'discover']);
    useEffect(() => {
        const tab = router.query?.tab;
        if (tab && VALID_TABS.has(tab)) {
            setActiveTab(tab);
        }
    }, [router.query?.tab]);

    // Data states
    const [friends, setFriends] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [suggestions, setSuggestions] = useState([]);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchFilter, setSearchFilter] = useState('all'); // 'all' | 'friends' | 'non-friends'

    // ID sets for quick lookup
    const [friendIds, setFriendIds] = useState(new Set());
    const [pendingIds, setPendingIds] = useState(new Set());
    const [followingIds, setFollowingIds] = useState(new Set());
    const [followerIds, setFollowerIds] = useState(new Set());
    const [myFriendIds, setMyFriendIds] = useState([]); // For mutual friends calculation

    // Hamburger Menu State
    const [menuOpen, setMenuOpen] = useState(false);
    const [preferences, setPreferences] = useState({
        allowRequests: true,
        showOnlineStatus: true,
        friendSuggestions: true
    });

    // Load preferences from service (localStorage + Supabase)
    useEffect(() => {
        friendPreferences.get(user?.id).then(prefs => {
            setPreferences(prefs);
        });
    }, [user]);

    // Preference update handler with Supabase sync
    const updatePreference = async (key, value) => {
        const updated = { ...preferences, [key]: value };
        setPreferences(updated);
        await friendPreferences.update(user?.id, { [key]: value });
    };

    // Menu config
    const menuConfig = getMenuConfig('friends', user, preferences, {
        setAllowRequests: (val) => updatePreference('allowRequests', val),
        setShowOnlineStatus: (val) => updatePreference('showOnlineStatus', val),
        setFriendSuggestions: (val) => updatePreference('friendSuggestions', val)
    });

    const FRIENDS_CACHE_KEY = 'sp-friends-cache';
    const FRIENDS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    const actionInProgress = useRef(false); // Prevent double-click spam
    const mounted = useRef(true);

    useEffect(() => {
        return () => { mounted.current = false; };
    }, []);

    const fetchData = async () => {
        //  BULLETPROOF: Use authUtils to avoid AbortError
        const authUser = getAuthUser();
        if (!authUser || !mounted.current) {
            if (mounted.current) setLoading(false);
            return;
        }
        setUser(authUser);

        // ── PHASE 1: Cache Hydration (instant render) ──
        try {
            const cachedRaw = localStorage.getItem(FRIENDS_CACHE_KEY);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (cached._cachedAt && (Date.now() - cached._cachedAt) < FRIENDS_CACHE_TTL && cached.data) {
                    const d = cached.data;
                    if (mounted.current) {
                        setFriends(d.friends || []);
                        setFriendIds(new Set(d.friendIds || []));
                        setMyFriendIds(d.friendIds || []);
                        setFriendRequests(d.friendRequests || []);
                        setPendingIds(new Set((d.pendingOutgoing || []).map(r => r.friend_id)));
                        setFollowing(d.following || []);
                        setFollowingIds(new Set(d.followingIds || []));
                        setFollowers(d.followers || []);
                        setFollowerIds(new Set(d.followerIds || []));
                        setSuggestions((d.suggestions || []).map(u => ({ ...u, mutualCount: 0 })));
                        setLoading(false); // Instant render from cache
                    }
                }
            }
        } catch { /* cache miss or corrupt — continue to API */ }

        // ── PHASE 2: Background revalidation (fresh data) ──
        try {
            // Fetch ALL friends data through API (service role key, bypasses RLS)
            const token = getAccessToken();
            const resp = await fetch('/api/friends?action=full', {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            });

            if (resp.ok) {
                const result = await resp.json();
                if (!mounted.current) return; // Added guard
                const d = result.data || {};

                // Friends
                setFriends(d.friends || []);
                setFriendIds(new Set(d.friendIds || []));
                setMyFriendIds(d.friendIds || []);

                // Friend requests
                setFriendRequests(d.friendRequests || []);

                // Pending outgoing
                setPendingIds(new Set((d.pendingOutgoing || []).map(r => r.friend_id)));

                // Following
                setFollowing(d.following || []);
                setFollowingIds(new Set(d.followingIds || []));

                // Followers
                setFollowers(d.followers || []);
                setFollowerIds(new Set(d.followerIds || []));

                // Suggestions
                setSuggestions((d.suggestions || []).map(u => ({ ...u, mutualCount: 0 })));

                // Save to cache for next visit
                try {
                    localStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify({
                        _cachedAt: Date.now(),
                        data: d,
                    }));
                } catch { /* quota exceeded */ }
            } else {
                console.warn('[Friends] API returned', resp.status);
            }
        } catch (err) {
            console.warn('[Friends] fetchData error:', err);
        }

        if (mounted.current) setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // EventBus: Session tracking + DATA_MUTATED listener
    // ═══════════════════════════════════════════════════════════════════════
    useTrainingBus('friends');

    useEffect(() => {
        let debounceTimer = null;
        const debouncedFetch = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchData(), 500);
        };
        const unsubMutated = eventBus.on(EventType.DATA_MUTATED, debouncedFetch);
        const unsubMsgReceived = eventBus.on(EventType.MESSAGE_RECEIVED, debouncedFetch);
        return () => {
            clearTimeout(debounceTimer);
            unsubMutated();
            unsubMsgReceived();
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // SEARCH FUNCTIONALITY
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
                    .neq('id', user?.id || '')
                    .limit(50);

                if (data && mounted.current) {
                    // Apply friend filter
                    let filtered = data;
                    if (searchFilter === 'friends') {
                        filtered = data.filter(p => friendIds.has(p.id));
                    } else if (searchFilter === 'non-friends') {
                        filtered = data.filter(p => !friendIds.has(p.id));
                    }
                    setSearchResults(filtered);
                }
            } catch (e) {
                console.warn('[Friends] Search error:', e?.message || e);
            }
            if (mounted.current) setIsSearching(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, searchFilter, user?.id, friendIds]);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        let friendsChannel = null;

        const _ch = supabase
            .channel(`friends:${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `user_id=eq.${user.id}` }, () => { fetchData(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${user.id}` }, () => { fetchData(); })
            .subscribe();
        friendsChannel = _ch;

        // TIER 1: Friend Request Realtime Sync
        // Cross-tab sync when friend requests are sent/accepted/declined
        const cleanupFriendsBc = listenBroadcast('smarter_poker_friends_sync', (msg) => {
            // Self-tab suppression: this tab already updated local state
            if (msg?.tabId === BROADCAST_TAB_ID) return;
            fetchData();
        });

        return () => {
            supabase.removeChannel(friendsChannel);
            cleanupFriendsBc();
        };
    }, [user?.id]);

    // EventBus: Listen for friend-related events from other components (e.g. messenger, profile)
    useEffect(() => {
        const unsubSent = eventBus.on(EventType.FRIEND_REQUEST_SENT, () => { fetchData(); });
        const unsubAccepted = eventBus.on(EventType.FRIEND_REQUEST_ACCEPTED, () => { fetchData(); });
        return () => {
            unsubSent();
            unsubAccepted();
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════
    
    // [BugFix] BFCache stale UI prevention: Sync cache on ANY optimistic state mutation
    useEffect(() => {
        if (loading) return;
        try {
            localStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify({
                _cachedAt: Date.now(),
                data: {
                    friends,
                    friendIds: Array.from(friendIds),
                    friendRequests,
                    pendingOutgoing: Array.from(pendingIds).map(id => ({ friend_id: id })),
                    following,
                    followingIds: Array.from(followingIds),
                    followers,
                    followerIds: Array.from(followerIds),
                    suggestions
                }
            }));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, [friends, friendIds, friendRequests, pendingIds, following, followingIds, followers, followerIds, suggestions, loading]);

    const handleFollow = async (userId) => {
        if (!user || actionInProgress.current) return;
        actionInProgress.current = true;
        try {

        // Optimistic update — apply immediately, rollback on error
        const targetUser = suggestions.find(u => u.id === userId) ||
            followers.find(u => u.id === userId);
        if (targetUser) setFollowing(prev => [...prev, targetUser]);
        setFollowingIds(prev => new Set([...prev, userId]));

        const { error } = await supabase
            .from('social_follows')
            .insert({ follower_id: user.id, following_id: userId, source: 'direct' });

        if (error) {
            // Rollback on failure
            setFollowing(prev => prev.filter(f => f.id !== userId));
            setFollowingIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
            toast.error('Could not follow user. Please try again.');
        } else {
            busEmit.dataMutated('friends');
            broadcastSyncDebounced('smarter_poker_friends_sync', { action: 'refresh', tabId: BROADCAST_TAB_ID });
        }
        } finally { actionInProgress.current = false; }
    };

    const handleUnfollow = async (userId) => {
        if (!user || actionInProgress.current) return;
        actionInProgress.current = true;
        try {

        // Optimistic update — remove immediately, restore on error
        const removed = following.find(f => f.id === userId);
        setFollowing(prev => prev.filter(f => f.id !== userId));
        setFollowingIds(prev => { const s = new Set(prev); s.delete(userId); return s; });

        const { error } = await supabase
            .from('social_follows')
            .delete()
            .eq('follower_id', user.id)
            .eq('following_id', userId);

        if (error) {
            // Rollback on failure
            if (removed) setFollowing(prev => [...prev, removed]);
            setFollowingIds(prev => new Set([...prev, userId]));
            toast.error('Could not unfollow user. Please try again.');
        } else {
            busEmit.dataMutated('friends');
            broadcastSyncDebounced('smarter_poker_friends_sync', { action: 'refresh', tabId: BROADCAST_TAB_ID });
        }
        } finally { actionInProgress.current = false; }
    };

    const handleAddFriend = async (friendId) => {
        if (!user || actionInProgress.current) return;
        actionInProgress.current = true;

        // Optimistic UI update
        setPendingIds(prev => new Set([...prev, friendId]));

        try {
            const { error } = await supabase
                .from('friendships')
                .insert({ user_id: user.id, friend_id: friendId, status: 'pending' });

            if (!error) {
                toast.success('Friend request sent!');
                busEmit.friendRequestSent(friendId);
                broadcastSyncDebounced('smarter_poker_friends_sync', { action: 'refresh', tabId: BROADCAST_TAB_ID });
                // Insert in-app notification for the recipient so it shows in their bell
                const senderName = user?.user_metadata?.full_name || user?.user_metadata?.username || 'Someone';
                const senderUsername = user?.user_metadata?.username || user?.id;
                supabase.from('notifications').insert({
                    user_id: friendId,
                    actor_id: user.id,
                    type: 'friend_request',
                    title: senderName,
                    message: 'sent you a friend request',
                    action_url: `/hub/user/${senderUsername}`,
                    data: { sender_id: user.id, sender_name: senderName },
                    read: false,
                }).then().catch(e => console.warn('[friends] Notification insert (non-fatal):', e));
            } else {
                // Rollback optimistic update
                setPendingIds(prev => {
                    const next = new Set(prev);
                    next.delete(friendId);
                    return next;
                });
                toast.error('Could not send friend request. Please try again.');
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e);
            toast.error('Network error. Please try again.');
        } finally { actionInProgress.current = false; }
    };

    const handleAcceptRequest = (request) => {
        if (!user || actionInProgress.current) return;
        actionInProgress.current = true;

        // EAGER STATE SYNCHRONIZATION: Update UI and BFCache immediately
        const newFriend = request.requester;
        setFriends(prev => [...prev, newFriend]);
        setFriendIds(prev => new Set([...prev, request.user_id]));
        setFriendRequests(prev => prev.filter(r => r.id !== request.id));
        toast.success('Friend request accepted!');
        eventBus.emit(EventType.FRIEND_REQUEST_ACCEPTED, { friendId: request.user_id }, 'FriendsPage');
        busEmit.dataMutated('friends');
        broadcastSyncDebounced('smarter_poker_friends_sync', { action: 'refresh', tabId: BROADCAST_TAB_ID });

        // Fire-and-forget DB updates
        supabase.from('friendships').update({ status: 'accepted' }).eq('id', request.id)
            .then(({ error }) => {
                if (error) {
                    // Rollback on failure
                    setFriends(prev => prev.filter(f => f.id !== request.user_id));
                    setFriendIds(prev => { const s = new Set(prev); s.delete(request.user_id); return s; });
                    setFriendRequests(prev => [...prev, request]);
                    toast.error('Failed to accept friend request.');
                } else {
                    // Create reverse friendship after confirm — use upsert to handle unique constraint edge cases
                    supabase.from('friendships').upsert(
                        { user_id: user.id, friend_id: request.user_id, status: 'accepted' },
                        { onConflict: 'user_id,friend_id', ignoreDuplicates: false }
                    ).then().catch(e => console.warn('[friends] Handled exception:', e));
                    // Send "friend_accepted" in-app notification to the requester (parity with Horse engine)
                    try {
                        const token = getAccessToken();
                        fetch('/api/notifications/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-admin-secret': '' },
                            body: JSON.stringify({
                                title: user?.user_metadata?.poker_alias || user?.user_metadata?.full_name || 'Your Friend',
                                message: 'accepted your friend request',
                                externalUserIds: [request.user_id],
                                url: `https://smarter.poker/hub/user/${user?.user_metadata?.poker_alias || user?.id}`,
                                data: { type: 'friend_accepted', friend_id: user?.id }
                            })
                        }).catch(e => console.warn('[friends] Notification send failed (non-fatal):', e));
                    } catch (e) { console.warn('[friends] Notification setup error (non-fatal):', e); }
                }
            }).catch(e => console.warn('[friends] Handled exception:', e));

        actionInProgress.current = false;
    };

    //  DECLINE = AUTO-FOLLOW (SmarterPoker style)
    const handleDeclineRequest = (request) => {
        if (!user || actionInProgress.current) return;
        actionInProgress.current = true;

        // EAGER STATE SYNCHRONIZATION: Update UI immediately
        const newFollower = request.requester;
        if (newFollower && !followerIds.has(newFollower.id)) {
            setFollowers(prev => [...prev, newFollower]);
            setFollowerIds(prev => new Set([...prev, newFollower.id]));
        }
        setFriendRequests(prev => prev.filter(r => r.id !== request.id));
        busEmit.dataMutated('friends');
        broadcastSyncDebounced('smarter_poker_friends_sync', { action: 'refresh', tabId: BROADCAST_TAB_ID });

        // Fire-and-forget DB updates
        supabase.from('friendships').delete().eq('id', request.id).then().catch(e => console.warn('[friends] Handled exception:', e));
        supabase.from('social_follows').upsert({
            follower_id: request.user_id,
            following_id: user.id
        }, { onConflict: 'follower_id,following_id' }).then().catch(e => console.warn('[friends] Handled exception:', e));

        actionInProgress.current = false;
    };

    const handleRemoveFriend = async (friendId) => {
        if (!user || actionInProgress.current) return;
        actionInProgress.current = true;

        // Optimistic update — capture state for rollback
        const removedFriend = friends.find(f => f.id === friendId);
        const prevFriends = [...friends];
        const prevFriendIds = new Set(friendIds);
        const prevSuggestions = [...suggestions];

        if (removedFriend) {
            setFriends(prev => prev.filter(f => f.id !== friendId));
            setSuggestions(prev => [...prev, removedFriend]);
            setFriendIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(friendId);
                return newSet;
            });
        }

        try {
            // Delete both directions in parallel to avoid orphan records
            const [res1, res2] = await Promise.all([
                supabase.from('friendships').delete()
                    .eq('user_id', user.id)
                    .eq('friend_id', friendId),
                supabase.from('friendships').delete()
                    .eq('user_id', friendId)
                    .eq('friend_id', user.id),
            ]);
            if (res1.error || res2.error) throw res1.error || res2.error; // Either failed — rollback

            busEmit.dataMutated('friends');
            broadcastSyncDebounced('smarter_poker_friends_sync', { action: 'refresh', tabId: BROADCAST_TAB_ID });
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } finally { actionInProgress.current = false; }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    if (loading) return (
        <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 70 }}>
            <style>{`
                @keyframes fr-shimmer {
                    0%   { background-position: -600px 0; }
                    100% { background-position: 600px 0; }
                }
                .fr-skel {
                    background-image: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.11) 50%, rgba(255,255,255,0.04) 100%);
                    background-size: 600px 100%;
                    animation: fr-shimmer 1.4s ease-in-out infinite;
                    border-radius: 6px;
                }
            `}</style>
            {/* Header skeleton */}
            <div style={{ height: 56, background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
                <div className="fr-skel" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                <div className="fr-skel" style={{ flex: 1, height: 14, maxWidth: 120 }} />
            </div>
            {/* Stats bar skeleton */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 48, padding: '20px 16px', background: C.card, borderBottom: `1px solid ${C.border}` }}>
                {[1,2,3].map(i => (
                    <div key={i} style={{ textAlign: 'center' }}>
                        <div className="fr-skel" style={{ width: 32, height: 28, marginBottom: 6, borderRadius: 4 }} />
                        <div className="fr-skel" style={{ width: 52, height: 11 }} />
                    </div>
                ))}
            </div>
            {/* Search bar skeleton */}
            <div style={{ padding: '16px 20px', background: C.card, borderBottom: `1px solid ${C.border}` }}>
                <div className="fr-skel" style={{ width: '100%', height: 44, borderRadius: 24 }} />
            </div>
            {/* Tabs skeleton */}
            <div style={{ display: 'flex', gap: 8, padding: 16, borderBottom: `1px solid ${C.border}` }}>
                {[80, 90, 70, 90, 90].map((w, i) => <div key={i} className="fr-skel" style={{ width: w, height: 34, borderRadius: 20 }} />)}
            </div>
            {/* Friend card skeletons */}
            <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
                {[1,2,3,4].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: C.card, borderRadius: 12, marginBottom: 12, border: `1px solid ${C.border}` }}>
                        <div className="fr-skel" style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <div className="fr-skel" style={{ width: '45%', height: 14, marginBottom: 8 }} />
                            <div className="fr-skel" style={{ width: '60%', height: 12 }} />
                        </div>
                        <div className="fr-skel" style={{ width: 80, height: 34, borderRadius: 20 }} />
                    </div>
                ))}
            </div>
        </div>
    );

    if (!user) return (
        <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: C.text }}>
                <h2>Please Log In To View Friends</h2>
                <Link href="/auth/login" style={{ color: C.blue }}>Log In</Link>
            </div>
        </div>
    );

    const renderContent = () => {
        // If searching, show search results
        if (searchQuery.trim()) {
            if (isSearching) {
                return (
                    <div style={{ textAlign: 'center', padding: 48, color: C.textSec }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: 16 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        <div>Searching...</div>
                    </div>
                );
            }

            if (searchResults.length > 0) {
                return (
                    <div>
                        <div style={{
                            fontSize: 14,
                            color: C.textSec,
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}>
                            <span>🔎</span> Found {searchResults.length} {searchResults.length === 1 ? 'person' : 'people'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {searchResults.map(person => (
                                <UserCard
                                    key={person.id}
                                    user={person}
                                    isFriend={friendIds.has(person.id)}
                                    isPending={pendingIds.has(person.id)}
                                    isFollowing={followingIds.has(person.id)}
                                    isFollower={followerIds.has(person.id)}
                                    onRemoveFriend={handleRemoveFriend}
                                    onFollow={handleFollow}
                                    onUnfollow={handleUnfollow}
                                    onAddFriend={handleAddFriend}
                                />
                            ))}
                        </div>
                    </div>
                );
            }

            return <EmptyState icon="🔎" message={`No users found for "${searchQuery}"`} />;
        }

        switch (activeTab) {
            case 'requests':
                return friendRequests.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {friendRequests.map(request => (
                            <FriendRequestCard
                                key={request.id}
                                request={request}
                                onAccept={handleAcceptRequest}
                                onDecline={handleDeclineRequest}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>} message="No Pending Friend Requests" />
                );

            case 'friends':
                return friends.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {friends.map(friend => (
                            <UserCard
                                key={friend.id}
                                user={friend}
                                isFriend={true}
                                isFollowing={followingIds.has(friend.id)}
                                isFollower={followerIds.has(friend.id)}
                                onRemoveFriend={handleRemoveFriend}
                                onFollow={handleFollow}
                                onUnfollow={handleUnfollow}
                                onAddFriend={handleAddFriend}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>} message="You haven't added any friends yet" />
                );

            case 'following':
                return following.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {following.map(person => (
                            <UserCard
                                key={person.id}
                                user={person}
                                isFriend={friendIds.has(person.id)}
                                isPending={pendingIds.has(person.id)}
                                isFollowing={true}
                                isFollower={followerIds.has(person.id)}
                                onRemoveFriend={handleRemoveFriend}
                                onFollow={handleFollow}
                                onUnfollow={handleUnfollow}
                                onAddFriend={handleAddFriend}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>} message="You're not following anyone yet" />
                );

            case 'followers':
                return followers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {followers.map(person => (
                            <UserCard
                                key={person.id}
                                user={person}
                                isFriend={friendIds.has(person.id)}
                                isPending={pendingIds.has(person.id)}
                                isFollowing={followingIds.has(person.id)}
                                isFollower={true}
                                onRemoveFriend={handleRemoveFriend}
                                onFollow={handleFollow}
                                onUnfollow={handleUnfollow}
                                onAddFriend={handleAddFriend}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>} message="No Followers Yet" />
                );

            case 'discover':
            default:
                return suggestions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {suggestions.map(person => (
                            <UserCard
                                key={person.id}
                                user={person}
                                isFriend={false}
                                isPending={pendingIds.has(person.id)}
                                isFollowing={followingIds.has(person.id)}
                                isFollower={followerIds.has(person.id)}
                                mutualCount={person.mutualCount || 0}
                                onRemoveFriend={handleRemoveFriend}
                                onFollow={handleFollow}
                                onUnfollow={handleUnfollow}
                                onAddFriend={handleAddFriend}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState icon="" message="No Suggestions Available" />
                );
        }
    };

    return (
        <PageTransition>
            <SEOHead
                title="Friends — Your Poker Network"
                description="Manage Your Poker Friends Network. Add Friends, View Their Stats, Challenge Them To Games, And Stay Connected."
                canonical="/hub/friends"
            />
            <div className="friends-page" style={{
                minHeight: '100vh',
                background: C.bg,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
                color: C.text
            }}>
                {/* Header - Universal Header */}
                <UniversalHeader
                    pageDepth={2}
                    onMenuClick={() => setMenuOpen(true)}
                />

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

                {/* Stats Bar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 32,
                    padding: '20px 16px',
                    background: C.card,
                    borderBottom: `1px solid ${C.border}`,
                }}>
                    <StatItem label="Friends" value={friends.length} color={C.green} />
                    <StatItem label="Following" value={following.length} color={C.pink} />
                    <StatItem label="Followers" value={followers.length} color={C.purple} />
                </div>

                {/* Search Bar */}
                <div style={{
                    padding: '16px 20px',
                    background: C.card,
                    borderBottom: `1px solid ${C.border}`,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: C.bg,
                        borderRadius: 24,
                        padding: '12px 20px',
                        border: `1px solid ${C.border}`,
                        marginBottom: 10,
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        <input
                            type="text"
                            placeholder="Search For Friends By Name Or Username..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: C.text,
                                fontSize: 15,
                            }}
                        />
                        {isSearching && <span style={{ fontSize: 16 }}>⏳</span>}
                        {searchQuery && !isSearching && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: C.textSec,
                                    fontSize: 16,
                                }}
                            >×</button>
                        )}
                    </div>
                    {/* Search filter: All / Friends / Non-Friends */}
                    {searchQuery.trim() && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[['all', 'All Users'], ['friends', 'Friends Only'], ['non-friends', 'Non-Friends']].map(([val, label]) => (
                                <button
                                    key={val}
                                    onClick={() => setSearchFilter(val)}
                                    style={{
                                        padding: '5px 14px',
                                        borderRadius: 16,
                                        border: `1px solid ${searchFilter === val ? C.blue : C.border}`,
                                        background: searchFilter === val ? 'rgba(59,130,246,0.15)' : 'transparent',
                                        color: searchFilter === val ? C.blue : C.textSec,
                                        fontWeight: searchFilter === val ? 700 : 500,
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                >{label}</button>
                            ))}
                        </div>
                    )}
                </div>
                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    gap: 8,
                    padding: '16px',
                    overflowX: 'auto',
                    background: C.bg,
                    borderBottom: `1px solid ${C.border}`,
                }}>
                    <TabButton
                        active={activeTab === 'discover'}
                        onClick={() => setActiveTab('discover')}
                        icon=""
                        label="Discover"
                        count={suggestions.length}
                    />
                    <TabButton
                        active={activeTab === 'requests'}
                        onClick={() => setActiveTab('requests')}
                        icon=""
                        label="Requests"
                        count={friendRequests.length}
                    />
                    <TabButton
                        active={activeTab === 'friends'}
                        onClick={() => setActiveTab('friends')}
                        icon=""
                        label="Friends"
                        count={friends.length}
                    />
                    <TabButton
                        active={activeTab === 'following'}
                        onClick={() => setActiveTab('following')}
                        icon=""
                        label="Following"
                        count={following.length}
                    />
                    <TabButton
                        active={activeTab === 'followers'}
                        onClick={() => setActiveTab('followers')}
                        icon=""
                        label="Followers"
                        count={followers.length}
                    />
                </div>

                {/* Content */}
                <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
                    {renderContent()}
                </div>
            </div>
              <BottomNavBar />
    </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatItem({ label, value, color }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{
                fontSize: 28,
                fontWeight: 800,
                color,
                textShadow: `0 0 20px ${color}40`
            }}>
                {value}
            </div>
            <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{label}</div>
        </div>
    );
}

function EmptyState({ icon, message }) {
    return (
        <div style={{
            background: C.card,
            borderRadius: 16,
            padding: 48,
            textAlign: 'center',
            color: C.textSec,
            border: `1px solid ${C.border}`
        }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
            <div>{message}</div>
        </div>
    );
}

export default function FriendsPageWithBoundary() {
    return (
        <HubErrorBoundary name="Friends">
            <FriendsPage />
        </HubErrorBoundary>
    );
}
