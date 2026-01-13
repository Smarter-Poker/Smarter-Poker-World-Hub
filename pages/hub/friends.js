/**
 * SMARTER.POKER FRIENDS PAGE
 * View friends, friend requests, and discover suggested connections
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A', red: '#FA383E',
};

function Avatar({ src, name, size = 60 }) {
    return (
        <img
            src={src || '/default-avatar.png'}
            alt={name || 'User'}
            style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
        />
    );
}

function FriendRequestCard({ request, onAccept, onIgnore }) {
    const user = request.requester;
    return (
        <div style={{
            background: C.card, borderRadius: 12, padding: 16,
            display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)', border: `2px solid ${C.blue}`
        }}>
            <Link href={`/hub/user/${user?.id}`} style={{ flexShrink: 0 }}>
                <Avatar src={user?.avatar_url} name={user?.full_name || user?.username} size={80} />
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 17, color: C.text, marginBottom: 4 }}>
                    {user?.full_name || user?.username || 'Poker Player'}
                </div>
                <div style={{ fontSize: 13, color: C.blue, marginBottom: 8 }}>
                    🤝 Friend Request
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => onAccept(request)}
                        style={{
                            padding: '8px 20px', borderRadius: 6, border: 'none',
                            background: C.blue, color: 'white', fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        Accept
                    </button>
                    <button
                        onClick={() => onIgnore(request)}
                        style={{
                            padding: '8px 20px', borderRadius: 6, border: `1px solid ${C.border}`,
                            background: C.card, color: C.text, fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        Ignore
                    </button>
                </div>
            </div>
        </div>
    );
}

function FriendCard({ user, isFriend, isPending, onAddFriend, onRemoveFriend }) {
    return (
        <div style={{
            background: C.card, borderRadius: 12, padding: 16,
            display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
        }}>
            <Link href={`/hub/user/${user.id}`} style={{ flexShrink: 0 }}>
                <Avatar src={user.avatar_url} name={user.full_name || user.username} size={80} />
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/hub/user/${user.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ fontWeight: 600, fontSize: 17, color: C.text, marginBottom: 4 }}>
                        {user.full_name || user.username || 'Poker Player'}
                    </div>
                </Link>
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
            </div>
            <div>
                {isFriend ? (
                    <button
                        onClick={() => onRemoveFriend(user.id)}
                        style={{
                            padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.border}`,
                            background: C.card, color: C.text, fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        ✓ Friends
                    </button>
                ) : isPending ? (
                    <button
                        disabled
                        style={{
                            padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.border}`,
                            background: '#f0f0f0', color: C.textSec, fontWeight: 600, cursor: 'not-allowed'
                        }}
                    >
                        ⏳ Pending
                    </button>
                ) : (
                    <button
                        onClick={() => onAddFriend(user.id)}
                        style={{
                            padding: '8px 16px', borderRadius: 6, border: 'none',
                            background: C.blue, color: 'white', fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        + Add Friend
                    </button>
                )}
            </div>
        </div>
    );
}

export default function FriendsPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [friends, setFriends] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [friendIds, setFriendIds] = useState(new Set());
    const [pendingIds, setPendingIds] = useState(new Set());

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

        if (friendships) {
            setFriends(friendships.map(f => f.friend));
            setFriendIds(new Set(friendships.map(f => f.friend_id)));
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

        // Fetch suggested friends (all other users not already friends or pending)
        const { data: allUsers } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', authUser.id)
            .limit(20);

        if (allUsers) {
            const friendIdSet = new Set(friendships?.map(f => f.friend_id) || []);
            const pendingIdSet = new Set(outgoingRequests?.map(r => r.friend_id) || []);
            const incomingIdSet = new Set(incomingRequests?.map(r => r.user_id) || []);
            setSuggestions(allUsers.filter(u =>
                !friendIdSet.has(u.id) && !pendingIdSet.has(u.id) && !incomingIdSet.has(u.id)
            ));
        }

        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddFriend = async (friendId) => {
        if (!user) return;

        // Create friend request (pending status)
        const { error } = await supabase
            .from('friendships')
            .insert({ user_id: user.id, friend_id: friendId, status: 'pending' });

        if (!error) {
            // Move to pending
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

        // Also create the reverse friendship
        await supabase
            .from('friendships')
            .insert({ user_id: user.id, friend_id: request.user_id, status: 'accepted' });

        // Update UI
        const newFriend = request.requester;
        setFriends(prev => [...prev, newFriend]);
        setFriendIds(prev => new Set([...prev, request.user_id]));
        setFriendRequests(prev => prev.filter(r => r.id !== request.id));
    };

    const handleIgnoreRequest = async (request) => {
        if (!user) return;

        await supabase
            .from('friendships')
            .delete()
            .eq('id', request.id);

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

    if (loading) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
    if (!user) return (
        <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <h2>Please log in to view friends</h2>
                <Link href="/auth/login" style={{ color: C.blue }}>Log In</Link>
            </div>
        </div>
    );

    return (
        <>
            <Head><title>Friends | Smarter.Poker</title></Head>
            <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header */}
                <header style={{ background: C.card, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    <Link href="/hub" style={{ fontWeight: 700, fontSize: 22, color: C.blue, textDecoration: 'none' }}>Smarter.Poker</Link>
                    <div style={{ fontWeight: 600, fontSize: 18, color: C.text }}>Friends</div>
                    <Link href="/hub/social-media" style={{ color: C.textSec, textDecoration: 'none' }}>← Back</Link>
                </header>

                <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
                    {/* Friend Requests */}
                    {friendRequests.length > 0 && (
                        <div style={{ marginBottom: 32 }}>
                            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: C.text }}>
                                🔔 Friend Requests ({friendRequests.length})
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {friendRequests.map(request => (
                                    <FriendRequestCard
                                        key={request.id}
                                        request={request}
                                        onAccept={handleAcceptRequest}
                                        onIgnore={handleIgnoreRequest}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Current Friends */}
                    <div style={{ marginBottom: 32 }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: C.text }}>
                            👥 Your Friends ({friends.length})
                        </h2>
                        {friends.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {friends.map(friend => (
                                    <FriendCard
                                        key={friend.id}
                                        user={friend}
                                        isFriend={true}
                                        onRemoveFriend={handleRemoveFriend}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div style={{ background: C.card, borderRadius: 12, padding: 32, textAlign: 'center', color: C.textSec }}>
                                You haven't added any friends yet. Check out the suggestions below!
                            </div>
                        )}
                    </div>

                    {/* Suggested Friends */}
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: C.text }}>
                            ✨ Suggested Friends
                        </h2>
                        {suggestions.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {suggestions.map(suggested => (
                                    <FriendCard
                                        key={suggested.id}
                                        user={suggested}
                                        isFriend={false}
                                        isPending={pendingIds.has(suggested.id)}
                                        onAddFriend={handleAddFriend}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div style={{ background: C.card, borderRadius: 12, padding: 32, textAlign: 'center', color: C.textSec }}>
                                No suggestions available right now.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

