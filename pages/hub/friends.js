/**
 * SMARTER.POKER FRIENDS PAGE
 * View friends and discover suggested connections
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
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A',
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

function FriendCard({ user, isFriend, onAddFriend, onRemoveFriend }) {
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
    const [suggestions, setSuggestions] = useState([]);
    const [friendIds, setFriendIds] = useState(new Set());

    useEffect(() => {
        const fetchData = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) {
                setLoading(false);
                return;
            }
            setUser(authUser);

            // Fetch current friends
            const { data: friendships } = await supabase
                .from('friendships')
                .select('friend_id, friend:profiles!friendships_friend_id_fkey(*)')
                .eq('user_id', authUser.id)
                .eq('status', 'accepted');

            if (friendships) {
                setFriends(friendships.map(f => f.friend));
                setFriendIds(new Set(friendships.map(f => f.friend_id)));
            }

            // Fetch suggested friends (all other users not already friends)
            const { data: allUsers } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', authUser.id)
                .limit(20);

            if (allUsers) {
                const friendIdSet = new Set(friendships?.map(f => f.friend_id) || []);
                setSuggestions(allUsers.filter(u => !friendIdSet.has(u.id)));
            }

            setLoading(false);
        };
        fetchData();
    }, []);

    const handleAddFriend = async (friendId) => {
        if (!user) return;

        // Create friendship (or friend request)
        const { error } = await supabase
            .from('friendships')
            .insert({ user_id: user.id, friend_id: friendId, status: 'accepted' });

        if (!error) {
            // Move from suggestions to friends
            const newFriend = suggestions.find(s => s.id === friendId);
            if (newFriend) {
                setFriends(prev => [...prev, newFriend]);
                setSuggestions(prev => prev.filter(s => s.id !== friendId));
                setFriendIds(prev => new Set([...prev, friendId]));
            }
        }
    };

    const handleRemoveFriend = async (friendId) => {
        if (!user) return;

        const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('user_id', user.id)
            .eq('friend_id', friendId);

        if (!error) {
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
                    <Link href="/hub/social-media" style={{ color: C.textSec, textDecoration: 'none' }}>← Back to Social</Link>
                </header>

                <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
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
