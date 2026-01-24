/**
 * PUBLIC USER PROFILE PAGE
 * View any user's profile including their Poker Resume
 * Route: /hub/user/[username]
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../../../src/lib/supabase';

// God-Mode Stack
import { useUserProfileStore } from '../../../src/stores/userProfileStore';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', gold: '#FFD700',
};

function Avatar({ src, name, size = 120 }) {
    const initials = (name || 'U').charAt(0).toUpperCase();
    const colors = ['#1877F2', '#42B72A', '#F02849', '#A033FF', '#FF6600'];
    const bgColor = colors[initials.charCodeAt(0) % colors.length];

    return src ? (
        <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '4px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
    ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: 'white', border: '4px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            {initials}
        </div>
    );
}

function PokerResumeBadge({ hendonData }) {
    if (!hendonData?.hendon_url) return null;

    const hasData = hendonData.hendon_total_cashes || hendonData.hendon_total_earnings;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2e 100%)',
            borderRadius: 16, padding: 24, color: 'white', marginTop: 16,
            border: '1px solid rgba(255, 215, 0, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 215, 0, 0.1)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, boxShadow: '0 2px 10px rgba(255, 215, 0, 0.4)'
                    }}>🏆</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 0.5 }}>POKER RESUME</div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Tournament Career Statistics</div>
                    </div>
                </div>
                <div style={{
                    background: 'rgba(255, 215, 0, 0.15)',
                    border: '1px solid rgba(255, 215, 0, 0.4)',
                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    color: C.gold
                }}>
                    ✓ VERIFIED
                </div>
            </div>

            {hasData ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ fontSize: 32, fontWeight: 800, color: C.gold, textShadow: '0 0 10px rgba(255, 215, 0, 0.3)' }}>
                            {hendonData.hendon_total_cashes?.toLocaleString() || '—'}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Cashes</div>
                    </div>
                    <div style={{
                        background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#00ff88', textShadow: '0 0 10px rgba(0, 255, 136, 0.3)' }}>
                            ${hendonData.hendon_total_earnings?.toLocaleString() || '—'}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Earnings</div>
                    </div>
                    <div style={{
                        background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#00d4ff', textShadow: '0 0 10px rgba(0, 212, 255, 0.3)' }}>
                            {hendonData.hendon_best_finish || '—'}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Best Finish</div>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 20, opacity: 0.6 }}>
                    Stats pending sync...
                </div>
            )}
        </div>
    );
}

export default function UserProfilePage() {
    const router = useRouter();
    const { username } = router.query;
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [isFriend, setIsFriend] = useState(false);
    const [friendRequestSent, setFriendRequestSent] = useState(false);

    // New state for stats and friends
    const [stats, setStats] = useState({ friends: 0, following: 0, followers: 0, posts: 0 });
    const [friends, setFriends] = useState([]);
    const [currentUserFriends, setCurrentUserFriends] = useState([]);

    useEffect(() => {
        if (!username) return;

        const fetchProfile = async () => {
            try {
                // Get current user
                const { data: { user } } = await supabase.auth.getUser();
                if (user) setCurrentUser(user);

                // Fetch the profile by username
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('username', username)
                    .single();

                if (error || !data) {
                    setProfile(null);
                } else {
                    setProfile(data);

                    // Check friendship status
                    if (user) {
                        const { data: friendship } = await supabase
                            .from('friendships')
                            .select('status')
                            .or(`and(user_id.eq.${user.id},friend_id.eq.${data.id}),and(user_id.eq.${data.id},friend_id.eq.${user.id})`)
                            .maybeSingle();

                        if (friendship) {
                            setIsFriend(friendship.status === 'accepted');
                            setFriendRequestSent(friendship.status === 'pending');
                        }

                        // Get current user's friends for mutual friend calculation
                        const { data: myFriends } = await supabase
                            .from('friendships')
                            .select('user_id, friend_id')
                            .eq('status', 'accepted')
                            .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

                        if (myFriends) {
                            const myFriendIds = myFriends.map(f => f.user_id === user.id ? f.friend_id : f.user_id);
                            setCurrentUserFriends(myFriendIds);
                        }
                    }

                    // Fetch stats: friends count
                    const { count: friendsCount } = await supabase
                        .from('friendships')
                        .select('*', { count: 'exact', head: true })
                        .eq('status', 'accepted')
                        .or(`user_id.eq.${data.id},friend_id.eq.${data.id}`);

                    // Fetch stats: following count
                    const { count: followingCount } = await supabase
                        .from('follows')
                        .select('*', { count: 'exact', head: true })
                        .eq('follower_id', data.id);

                    // Fetch stats: followers count
                    const { count: followersCount } = await supabase
                        .from('follows')
                        .select('*', { count: 'exact', head: true })
                        .eq('followed_id', data.id);

                    // Fetch stats: posts count
                    const { count: postsCount } = await supabase
                        .from('social_posts')
                        .select('*', { count: 'exact', head: true })
                        .eq('author_id', data.id);

                    setStats({
                        friends: friendsCount || 0,
                        following: followingCount || 0,
                        followers: followersCount || 0,
                        posts: postsCount || 0
                    });

                    // Fetch this user's friends with their profiles
                    const { data: userFriendships } = await supabase
                        .from('friendships')
                        .select('user_id, friend_id, created_at')
                        .eq('status', 'accepted')
                        .or(`user_id.eq.${data.id},friend_id.eq.${data.id}`)
                        .limit(20);

                    if (userFriendships && userFriendships.length > 0) {
                        const friendIds = userFriendships.map(f => f.user_id === data.id ? f.friend_id : f.user_id);

                        const { data: friendProfiles } = await supabase
                            .from('profiles')
                            .select('id, username, full_name, avatar_url')
                            .in('id', friendIds);

                        if (friendProfiles) {
                            // Calculate mutual friends for each friend
                            const friendsWithMutual = friendProfiles.map(friend => {
                                const mutualCount = currentUserFriends ?
                                    currentUserFriends.filter(myFriendId =>
                                        friendIds.includes(myFriendId) && myFriendId !== friend.id
                                    ).length : 0;
                                return { ...friend, mutualCount };
                            });

                            // Sort by mutual friends count (highest first)
                            friendsWithMutual.sort((a, b) => b.mutualCount - a.mutualCount);
                            setFriends(friendsWithMutual);
                        }
                    }
                }
            } catch (e) {
                console.error('Error fetching profile:', e);
            }
            setLoading(false);
        };

        fetchProfile();
    }, [username]);

    const handleAddFriend = async () => {
        if (!currentUser || !profile) return;
        try {
            await supabase.from('friendships').insert({
                user_id: currentUser.id,
                friend_id: profile.id,
                status: 'pending'
            });
            setFriendRequestSent(true);
        } catch (e) {
            console.error('Error sending friend request:', e);
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
            </div>
        );
    }

    if (!profile) {
        return (
            <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <h2>User not found</h2>
                    <Link href="/hub/social-media" style={{ color: C.blue }}>Back to Social</Link>
                </div>
            </div>
        );
    }

    const isOwnProfile = currentUser?.id === profile.id;

    return (
        <PageTransition>
            <Head>
                <title>{profile.username || 'Profile'} | Smarter.Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    .user-profile-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .user-profile-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .user-profile-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .user-profile-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .user-profile-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .user-profile-page { zoom: 1.5; } }
                `}</style>
            </Head>
            <div className="user-profile-page" style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* UniversalHeader */}
                <UniversalHeader pageDepth={2} />

                {/* Cover Photo */}
                <div style={{
                    height: 200,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    position: 'relative'
                }}>
                    <div style={{ position: 'absolute', bottom: -60, left: '50%', transform: 'translateX(-50%)' }}>
                        <Avatar src={profile.avatar_url} name={profile.username} size={120} />
                    </div>
                </div>

                {/* Profile Info */}
                <div style={{ maxWidth: 800, margin: '80px auto 40px', padding: '0 16px', textAlign: 'center' }}>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: C.text }}>
                        {profile.full_name || profile.username}
                    </h1>
                    {profile.username && (
                        <div style={{ color: C.textSec, fontSize: 16, marginTop: 4 }}>@{profile.username}</div>
                    )}

                    {/* Bio */}
                    {profile.bio && (
                        <p style={{ color: C.text, marginTop: 16, fontSize: 15, lineHeight: 1.5 }}>{profile.bio}</p>
                    )}

                    {/* Location & Info */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                        {(profile.city || profile.country) && (
                            <span style={{ color: C.textSec, fontSize: 14 }}>
                                📍 {[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}
                            </span>
                        )}
                        {profile.birth_year && (
                            <span style={{ color: C.textSec, fontSize: 14 }}>🎂 {new Date().getFullYear() - profile.birth_year} years old</span>
                        )}
                    </div>

                    {/* Poker Info */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                        {profile.favorite_game && (
                            <span style={{ color: C.textSec, fontSize: 14 }}>🎰 {profile.favorite_game}</span>
                        )}
                        {profile.favorite_hand && (
                            <span style={{ color: C.textSec, fontSize: 14 }}>🃏 {profile.favorite_hand}</span>
                        )}
                        {profile.home_casino && (
                            <span style={{ color: C.textSec, fontSize: 14 }}>🏨 {profile.home_casino}</span>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                        {isOwnProfile ? (
                            <Link href="/hub/profile" style={{
                                padding: '10px 24px', background: C.blue, color: 'white',
                                borderRadius: 8, textDecoration: 'none', fontWeight: 600
                            }}>Edit Profile</Link>
                        ) : (
                            <>
                                {isFriend ? (
                                    <button style={{
                                        padding: '10px 24px', background: '#e4e6eb', color: C.text,
                                        borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer'
                                    }}>Friends</button>
                                ) : friendRequestSent ? (
                                    <button style={{
                                        padding: '10px 24px', background: '#e4e6eb', color: C.textSec,
                                        borderRadius: 8, border: 'none', fontWeight: 600
                                    }}>Request Sent</button>
                                ) : (
                                    <button onClick={handleAddFriend} style={{
                                        padding: '10px 24px', background: C.blue, color: 'white',
                                        borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer'
                                    }}>Add Friend</button>
                                )}
                                <button style={{
                                    padding: '10px 24px', background: '#e4e6eb', color: C.text,
                                    borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer'
                                }}>Message</button>
                            </>
                        )}
                    </div>

                    {/* Stats Row - Friends, Following, Followers, Posts */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 32,
                        marginTop: 24,
                        padding: '16px 0',
                        borderTop: `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.border}`,
                    }}>
                        <div style={{ textAlign: 'center', cursor: 'pointer' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{stats.friends}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Friends</div>
                        </div>
                        <div style={{ textAlign: 'center', cursor: 'pointer' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{stats.followers}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Followers</div>
                        </div>
                        <div style={{ textAlign: 'center', cursor: 'pointer' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{stats.following}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Following</div>
                        </div>
                        <div style={{ textAlign: 'center', cursor: 'pointer' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{stats.posts}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Posts</div>
                        </div>
                    </div>

                    {/* Friends Section - Facebook Style */}
                    {friends.length > 0 && (
                        <div style={{
                            background: C.card, borderRadius: 12, padding: 20, marginTop: 24,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'left'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Friends</h3>
                                <Link href="/hub/friends" style={{ color: C.blue, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                                    See all
                                </Link>
                            </div>
                            <div style={{ fontSize: 14, color: C.textSec, marginBottom: 16 }}>
                                {stats.friends} friends
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {friends.slice(0, 8).map(friend => (
                                    <Link
                                        key={friend.id}
                                        href={`/hub/user/${friend.username}`}
                                        style={{ textDecoration: 'none', textAlign: 'center' }}
                                    >
                                        <div style={{ position: 'relative', marginBottom: 8 }}>
                                            <img
                                                src={friend.avatar_url || '/default-avatar.png'}
                                                alt={friend.username}
                                                style={{
                                                    width: '100%',
                                                    aspectRatio: '1',
                                                    borderRadius: 12,
                                                    objectFit: 'cover',
                                                    background: '#e4e6eb'
                                                }}
                                            />
                                        </div>
                                        <div style={{
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: C.text,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {friend.full_name?.split(' ').slice(0, 2).join(' ') || friend.username}
                                        </div>
                                        {friend.mutualCount > 0 && (
                                            <div style={{ fontSize: 12, color: C.textSec }}>
                                                {friend.mutualCount} mutual friends
                                            </div>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Poker Resume - The main feature! */}
                    <PokerResumeBadge hendonData={profile} />

                    {/* Social Links */}
                    {(profile.twitter || profile.instagram || profile.website) && (
                        <div style={{
                            background: C.card, borderRadius: 12, padding: 20, marginTop: 24,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: C.text }}>🔗 Links</h3>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                                {profile.twitter && (
                                    <a href={`https://twitter.com/${profile.twitter.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                                        style={{ color: C.blue, textDecoration: 'none', fontSize: 14 }}>
                                        𝕏 {profile.twitter}
                                    </a>
                                )}
                                {profile.instagram && (
                                    <a href={`https://instagram.com/${profile.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                                        style={{ color: C.blue, textDecoration: 'none', fontSize: 14 }}>
                                        📸 {profile.instagram}
                                    </a>
                                )}
                                {profile.website && (
                                    <a href={profile.website} target="_blank" rel="noopener noreferrer"
                                        style={{ color: C.blue, textDecoration: 'none', fontSize: 14 }}>
                                        🌐 Website
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}
