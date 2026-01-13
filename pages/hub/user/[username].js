/**
 * PUBLIC USER PROFILE PAGE
 * View any user's profile including their Poker Resume
 * Route: /hub/user/[username]
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
        <>
            <Head><title>{profile.username || 'Profile'} | Smarter.Poker</title></Head>
            <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header */}
                <header style={{ background: C.card, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    <Link href="/hub" style={{ fontWeight: 700, fontSize: 22, color: C.blue, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>🧠 Smarter.Poker</Link>
                    <Link href="/hub/social-media" style={{ color: C.textSec, textDecoration: 'none' }}>← Back to Social</Link>
                </header>

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
                                    }}>✓ Friends</button>
                                ) : friendRequestSent ? (
                                    <button style={{
                                        padding: '10px 24px', background: '#e4e6eb', color: C.textSec,
                                        borderRadius: 8, border: 'none', fontWeight: 600
                                    }}>Request Sent</button>
                                ) : (
                                    <button onClick={handleAddFriend} style={{
                                        padding: '10px 24px', background: C.blue, color: 'white',
                                        borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer'
                                    }}>+ Add Friend</button>
                                )}
                                <button style={{
                                    padding: '10px 24px', background: '#e4e6eb', color: C.text,
                                    borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer'
                                }}>💬 Message</button>
                            </>
                        )}
                    </div>

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
        </>
    );
}
