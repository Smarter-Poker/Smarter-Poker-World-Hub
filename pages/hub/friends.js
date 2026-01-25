/**
 * SMARTER.POKER FRIENDS & FOLLOWERS PAGE
 * View friends, friend requests, following, followers, and discover suggested connections
 * Features Facebook-style follow system with auto-follow on declined requests
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../../src/lib/supabase';

// God-Mode Stack
import { useFriendsStore } from '../../src/stores/friendsStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

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
    if (seconds < 300) return 'online'; // Within 5 minutes = online
    if (seconds < 60) return 'Just now';
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
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW BUTTON - Premium animated follow/unfollow button
// ═══════════════════════════════════════════════════════════════════════════
function FollowButton({ isFollowing, onFollow, onUnfollow, size = 'normal' }) {
    const [hovering, setHovering] = useState(false);

    const baseStyle = {
        padding: size === 'small' ? '6px 14px' : '8px 18px',
        borderRadius: 20,
        border: 'none',
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
                {hovering ? '✕ Unfollow' : '✓ Following'}
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
            <Link href={`/hub/user/${user?.id}`} style={{ flexShrink: 0 }}>
                <Avatar src={user?.avatar_url} name={user?.full_name || user?.username} size={70} />
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: C.text, marginBottom: 4 }}>
                    {user?.full_name || user?.username || 'Poker Player'}
                </div>
                <div style={{ fontSize: 13, color: C.blue, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ animation: 'pulse 2s infinite' }}>🤝</span> Wants to be friends
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
                        ✓ Accept
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
                        title="They'll become your follower"
                    >
                        Decline
                    </button>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 8, fontStyle: 'italic' }}>
                    💡 Declining will convert them to a follower
                </div>
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
                    <div style={{ fontSize: 12, color: C.pink, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>💜</span> Follows you
                    </div>
                )}
                {user.city && user.state && (
                    <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>
                        📍 {user.city}, {user.state}
                    </div>
                )}
                {user.favorite_game && (
                    <div style={{ fontSize: 13, color: C.textSec }}>
                        🃏 {user.favorite_game}
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
                                    <span style={{ opacity: 0.6 }}>⏱️</span>
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
                            padding: '8px 16px',
                            borderRadius: 10,
                            border: `1px solid ${C.green}`,
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: C.green,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        ✓ Friends
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
                                padding: '6px 14px',
                                borderRadius: 20,
                                background: 'rgba(156, 163, 175, 0.15)',
                                color: C.textSec,
                                fontWeight: 600,
                                fontSize: 12,
                            }}>
                                Request Sent
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
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
export default function FriendsPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('discover'); // requests, friends, following, followers, discover

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

    // ID sets for quick lookup
    const [friendIds, setFriendIds] = useState(new Set());
    const [pendingIds, setPendingIds] = useState(new Set());
    const [followingIds, setFollowingIds] = useState(new Set());
    const [followerIds, setFollowerIds] = useState(new Set());
    const [myFriendIds, setMyFriendIds] = useState([]); // For mutual friends calculation

    const fetchData = async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
            setLoading(false);
            return;
        }
        setUser(authUser);

        // Fetch current friends (accepted)
        const { data: friendships } = await supabase
            .from('friendships')
            .select('friend_id, friend:profiles!friendships_friend_id_fkey(*)')
            .eq('user_id', authUser.id)
            .eq('status', 'accepted');

        let currentFriendIdsList = [];
        if (friendships) {
            setFriends(friendships.map(f => f.friend));
            currentFriendIdsList = friendships.map(f => f.friend_id);
            setFriendIds(new Set(currentFriendIdsList));
            setMyFriendIds(currentFriendIdsList);
        }

        // Fetch pending friend requests (where I am the receiver)
        const { data: incomingRequests } = await supabase
            .from('friendships')
            .select('id, user_id, requester:profiles!friendships_user_id_fkey(*)')
            .eq('friend_id', authUser.id)
            .eq('status', 'pending');

        if (incomingRequests) {
            setFriendRequests(incomingRequests);
        }

        // Fetch my pending outgoing requests
        const { data: outgoingRequests } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', authUser.id)
            .eq('status', 'pending');

        if (outgoingRequests) {
            setPendingIds(new Set(outgoingRequests.map(r => r.friend_id)));
        }

        // Fetch people I'm following
        const { data: myFollowing } = await supabase
            .from('follows')
            .select('following_id, following:profiles!follows_following_id_fkey(*)')
            .eq('follower_id', authUser.id);

        if (myFollowing) {
            setFollowing(myFollowing.map(f => f.following));
            setFollowingIds(new Set(myFollowing.map(f => f.following_id)));
        }

        // Fetch my followers
        const { data: myFollowers } = await supabase
            .from('follows')
            .select('follower_id, follower:profiles!follows_follower_id_fkey(*)')
            .eq('following_id', authUser.id);

        if (myFollowers) {
            setFollowers(myFollowers.map(f => f.follower));
            setFollowerIds(new Set(myFollowers.map(f => f.follower_id)));
        }

        // Fetch ALL users for discovery (show everyone)
        const { data: allUsers } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', authUser.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (allUsers && currentFriendIdsList.length > 0) {
            // Calculate mutual friends for each suggestion
            const usersWithMutual = await Promise.all(allUsers.map(async (u) => {
                const { data: theirFriends } = await supabase
                    .from('friendships')
                    .select('user_id, friend_id')
                    .eq('status', 'accepted')
                    .or(`user_id.eq.${u.id},friend_id.eq.${u.id}`)
                    .limit(50);
                let mutualCount = 0;
                if (theirFriends) {
                    const theirFriendIds = theirFriends.map(f => f.user_id === u.id ? f.friend_id : f.user_id);
                    mutualCount = currentFriendIdsList.filter(id => theirFriendIds.includes(id)).length;
                }
                return { ...u, mutualCount };
            }));
            // Sort by mutual friends (descending)
            usersWithMutual.sort((a, b) => b.mutualCount - a.mutualCount);
            setSuggestions(usersWithMutual);
        } else if (allUsers) {
            setSuggestions(allUsers.map(u => ({ ...u, mutualCount: 0 })));
        }

        // Keep discover as default - user came here to find friends
        setActiveTab('discover');

        setLoading(false);
    };

    useEffect(() => {
        fetchData();
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
                    .limit(20);

                if (data) {
                    setSearchResults(data);
                }
            } catch (e) {
                console.error('Search error:', e);
            }
            setIsSearching(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, user?.id]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const handleFollow = async (userId) => {
        if (!user) return;

        const { error } = await supabase
            .from('follows')
            .insert({ follower_id: user.id, following_id: userId, source: 'direct' });

        if (!error) {
            // Find the user profile and add to following
            const targetUser = suggestions.find(u => u.id === userId) ||
                followers.find(u => u.id === userId);
            if (targetUser) {
                setFollowing(prev => [...prev, targetUser]);
            }
            setFollowingIds(prev => new Set([...prev, userId]));
        }
    };

    const handleUnfollow = async (userId) => {
        if (!user) return;

        await supabase
            .from('follows')
            .delete()
            .eq('follower_id', user.id)
            .eq('following_id', userId);

        setFollowing(prev => prev.filter(f => f.id !== userId));
        setFollowingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(userId);
            return newSet;
        });
    };

    const handleAddFriend = async (friendId) => {
        if (!user) return;

        const { error } = await supabase
            .from('friendships')
            .insert({ user_id: user.id, friend_id: friendId, status: 'pending' });

        if (!error) {
            setPendingIds(prev => new Set([...prev, friendId]));
        }
    };

    const handleAcceptRequest = async (request) => {
        if (!user) return;

        // Update the original request to accepted
        const { error: updateError } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', request.id);

        if (updateError) return;

        // Create reverse friendship
        await supabase
            .from('friendships')
            .insert({ user_id: user.id, friend_id: request.user_id, status: 'accepted' });

        // Update UI
        const newFriend = request.requester;
        setFriends(prev => [...prev, newFriend]);
        setFriendIds(prev => new Set([...prev, request.user_id]));
        setFriendRequests(prev => prev.filter(r => r.id !== request.id));
    };

    // 🔥 DECLINE = AUTO-FOLLOW (Facebook style)
    const handleDeclineRequest = async (request) => {
        if (!user) return;

        // Delete the friend request
        await supabase
            .from('friendships')
            .delete()
            .eq('id', request.id);

        // 🔥 Auto-convert declined requester to follower
        // The REQUESTER now FOLLOWS the person who declined
        await supabase
            .from('follows')
            .upsert({
                follower_id: request.user_id,     // Person who sent request
                following_id: user.id,             // Person who declined (me)
                source: 'declined_friend_request'
            }, { onConflict: 'follower_id,following_id' });

        // Update UI - add them to followers
        const newFollower = request.requester;
        if (newFollower && !followerIds.has(newFollower.id)) {
            setFollowers(prev => [...prev, newFollower]);
            setFollowerIds(prev => new Set([...prev, newFollower.id]));
        }

        // Remove from requests
        setFriendRequests(prev => prev.filter(r => r.id !== request.id));
    };

    const handleRemoveFriend = async (friendId) => {
        if (!user) return;

        // Remove both directions
        await supabase
            .from('friendships')
            .delete()
            .eq('user_id', user.id)
            .eq('friend_id', friendId);

        await supabase
            .from('friendships')
            .delete()
            .eq('user_id', friendId)
            .eq('friend_id', user.id);

        const removedFriend = friends.find(f => f.id === friendId);
        if (removedFriend) {
            setFriends(prev => prev.filter(f => f.id !== friendId));
            setSuggestions(prev => [...prev, removedFriend]);
            setFriendIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(friendId);
                return newSet;
            });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    if (loading) return (
        <div style={{
            minHeight: '100vh',
            background: C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.text
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>👥</div>
                <div>Loading connections...</div>
            </div>
        </div>
    );

    if (!user) return (
        <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: C.text }}>
                <h2>Please log in to view friends</h2>
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
                        <div style={{ fontSize: 32, marginBottom: 16 }}>🔍</div>
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
                    <EmptyState icon="🤷" message="No pending friend requests" />
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
                    <EmptyState icon="👥" message="You haven't added any friends yet" />
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
                    <EmptyState icon="🔍" message="You're not following anyone yet" />
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
                    <EmptyState icon="💜" message="No followers yet" />
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
                    <EmptyState icon="✨" message="No suggestions available" />
                );
        }
    };

    return (
        <PageTransition>
            <Head>
                <title>Friends & Followers | Smarter.Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .friends-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .friends-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .friends-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .friends-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .friends-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .friends-page { zoom: 1.5; } }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                `}</style>
            </Head>
            <div className="friends-page" style={{
                minHeight: '100vh',
                background: C.bg,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
                color: C.text
            }}>
                {/* Header - Universal Header */}
                <UniversalHeader pageDepth={2} />

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
                    }}>
                        <span style={{ fontSize: 20, color: C.textSec }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search for friends by name or username..."
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
                            >✕</button>
                        )}
                    </div>
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
