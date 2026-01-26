/**
 * PUBLIC USER PROFILE PAGE - FACEBOOK STYLE
 * View any user's profile with cover photo, tabs, friends, posts, and poker resume
 * Route: /hub/user/[username]
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../src/lib/supabase';

// Components
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ArticleCard from '../../../src/components/social/ArticleCard';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', gold: '#FFD700', green: '#42B72A',
};

// Helper: Time ago
const timeAgo = (date) => {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

// Avatar Component with online status
function Avatar({ src, name, size = 120, showOnline = false, onlineTime = null }) {
    const initials = (name || 'U').charAt(0).toUpperCase();
    const colors = ['#1877F2', '#42B72A', '#F02849', '#A033FF', '#FF6600'];
    const bgColor = colors[initials.charCodeAt(0) % colors.length];

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            {src ? (
                <img src={src} alt={name} style={{
                    width: size, height: size, borderRadius: '50%', objectFit: 'cover',
                    border: '4px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }} />
            ) : (
                <div style={{
                    width: size, height: size, borderRadius: '50%', background: bgColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: size * 0.4, fontWeight: 700, color: 'white',
                    border: '4px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}>{initials}</div>
            )}
            {showOnline && (
                <div style={{
                    position: 'absolute', bottom: size * 0.05, right: size * 0.05,
                    background: C.green, color: 'white', fontSize: 10, fontWeight: 600,
                    padding: '2px 6px', borderRadius: 10, border: '2px solid white'
                }}>{onlineTime || '●'}</div>
            )}
        </div>
    );
}

// Friend Avatar for grid
function FriendAvatar({ friend, currentUserFriends = [] }) {
    const mutualCount = friend.mutualCount || 0;
    return (
        <Link href={`/hub/user/${friend.username}`} style={{ textDecoration: 'none', textAlign: 'center' }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
                <img
                    src={friend.avatar_url || '/default-avatar.png'}
                    alt={friend.username}
                    style={{
                        width: '100%', aspectRatio: '1', borderRadius: '50%',
                        objectFit: 'cover', background: '#e4e6eb',
                        border: '3px solid #1877F2'
                    }}
                />
            </div>
            <div style={{
                fontSize: 13, fontWeight: 600, color: C.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
                {friend.full_name?.split(' ').slice(0, 2).join(' ') || friend.username}
            </div>
            <div style={{ fontSize: 11, color: C.textSec }}>
                {mutualCount > 0 ? `${mutualCount} mutual friends` : ''}
            </div>
        </Link>
    );
}

// Poker Resume Badge - Always shows, with placeholder if no HendonMob linked
function PokerResumeBadge({ hendonData, isOwnProfile = false }) {
    const hasHendon = hendonData?.hendon_url;
    const hasData = hendonData?.hendon_total_cashes || hendonData?.hendon_total_earnings;

    return (
        <div style={{
            background: hasHendon
                ? 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2e 100%)'
                : 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
            borderRadius: 12, padding: 20, color: 'white', marginBottom: 16,
            border: hasHendon ? '1px solid rgba(255, 215, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: hasHendon ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                    }}>{hasHendon ? '🏆' : '🎯'}</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>POKER RESUME</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Tournament Career Statistics</div>
                    </div>
                </div>
                {hasHendon ? (
                    <div style={{
                        background: 'rgba(255, 215, 0, 0.15)', border: '1px solid rgba(255, 215, 0, 0.4)',
                        padding: '3px 10px', borderRadius: 16, fontSize: 10, fontWeight: 600, color: C.gold
                    }}>✓ VERIFIED</div>
                ) : (
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '3px 10px', borderRadius: 16, fontSize: 10, fontWeight: 600, color: '#888'
                    }}>NOT LINKED</div>
                )}
            </div>
            {hasHendon && hasData ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: C.gold }}>{hendonData.hendon_total_cashes?.toLocaleString() || '—'}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>Cashes</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#00ff88' }}>${hendonData.hendon_total_earnings?.toLocaleString() || '—'}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>Earnings</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#00d4ff' }}>{hendonData.hendon_best_finish || '—'}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>Best Finish</div>
                    </div>
                </div>
            ) : hasHendon ? (
                <div style={{ textAlign: 'center', padding: 16, opacity: 0.6 }}>Stats pending sync...</div>
            ) : (
                <div style={{ textAlign: 'center', padding: 20 }}>
                    <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>Resume not added yet</div>
                    <div style={{ fontSize: 12, opacity: 0.5 }}>
                        {isOwnProfile
                            ? 'Link your HendonMob profile in settings to display your tournament stats'
                            : 'This player hasn\'t linked their HendonMob profile yet'
                        }
                    </div>
                </div>
            )}
            {hendonData?.hendon_url && (
                <a href={hendonData.hendon_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', textAlign: 'center', marginTop: 12, color: C.gold, fontSize: 12, textDecoration: 'none' }}>
                    View Full Resume on HendonMob →
                </a>
            )}
        </div>
    );
}

// Post Card Component
function PostCard({ post, author }) {
    const isArticleOrLink = post.content_type === 'article' || post.content_type === 'link';

    return (
        <div style={{ background: C.card, borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <img src={author?.avatar_url || '/default-avatar.png'} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{author?.full_name || author?.username}</div>
                    <div style={{ fontSize: 12, color: C.textSec }}>{timeAgo(post.created_at)} · 🌍</div>
                </div>
            </div>
            {post.content && (
                <div style={{ padding: '0 12px 12px', fontSize: 15, color: C.text, lineHeight: 1.4 }}>{post.content}</div>
            )}
            {isArticleOrLink ? (
                // Use centralized ArticleCard for article/link posts
                <ArticleCard
                    url={post.link_url || (() => {
                        const match = post.content?.match(/https?:\/\/[^\s"'<>]+/);
                        return match ? match[0] : null;
                    })()}
                    title={post.link_title}
                    description={post.link_description}
                    image={post.link_image || post.media_urls?.[0]}
                    siteName={post.link_site_name}
                    fallbackContent={post.content}
                />
            ) : post.media_urls?.length > 0 && (
                <div>
                    {post.media_urls.length === 1 ? (
                        post.content_type === 'video' ? (
                            <video src={post.media_urls[0]} controls style={{ width: '100%', maxHeight: 400, objectFit: 'cover' }} />
                        ) : (
                            <img src={post.media_urls[0]} style={{ width: '100%', maxHeight: 500, objectFit: 'cover' }} />
                        )
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                            {post.media_urls.slice(0, 4).map((url, i) => (
                                <img key={i} src={url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                            ))}
                        </div>
                    )}
                </div>
            )}
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', color: C.textSec, fontSize: 13 }}>
                <span>{post.like_count > 0 && `👍 ${post.like_count}`}</span>
                <span>{post.comment_count > 0 && `${post.comment_count} comments`}</span>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex' }}>
                <button style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontWeight: 500, fontSize: 13 }}>👍 Like</button>
                <button style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontWeight: 500, fontSize: 13 }}>💬 Comment</button>
                <button style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontWeight: 500, fontSize: 13 }}>↗️ Share</button>
            </div>
        </div>
    );
}

export default function UserProfilePage() {
    const router = useRouter();
    const { username } = router.query;

    // Core state
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [isFriend, setIsFriend] = useState(false);
    const [friendRequestSent, setFriendRequestSent] = useState(false);

    // Stats and content
    const [stats, setStats] = useState({ friends: 0, following: 0, followers: 0, posts: 0 });
    const [friends, setFriends] = useState([]);
    const [currentUserFriends, setCurrentUserFriends] = useState([]);
    const [posts, setPosts] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [videos, setVideos] = useState([]);
    const [reels, setReels] = useState([]);

    // Tab state
    const [activeTab, setActiveTab] = useState('all');

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
                    setLoading(false);
                    return;
                }

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

                    // Get current user's friends for mutual calculation
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

                // Fetch all stats in parallel
                const [friendsRes, followingRes, followersRes, postsRes] = await Promise.all([
                    supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`user_id.eq.${data.id},friend_id.eq.${data.id}`),
                    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
                    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
                    supabase.from('social_posts').select('*', { count: 'exact', head: true }).eq('author_id', data.id)
                ]);

                setStats({
                    friends: friendsRes.count || 0,
                    following: followingRes.count || 0,
                    followers: followersRes.count || 0,
                    posts: postsRes.count || 0
                });

                // Fetch friends with profiles
                const { data: userFriendships } = await supabase
                    .from('friendships')
                    .select('user_id, friend_id')
                    .eq('status', 'accepted')
                    .or(`user_id.eq.${data.id},friend_id.eq.${data.id}`)
                    .limit(20);

                if (userFriendships?.length > 0) {
                    const friendIds = userFriendships.map(f => f.user_id === data.id ? f.friend_id : f.user_id);
                    const { data: friendProfiles } = await supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .in('id', friendIds);

                    if (friendProfiles) {
                        const friendsWithMutual = friendProfiles.map(friend => {
                            const mutualCount = currentUserFriends.filter(id => friendIds.includes(id) && id !== friend.id).length;
                            return { ...friend, mutualCount };
                        });
                        friendsWithMutual.sort((a, b) => b.mutualCount - a.mutualCount);
                        setFriends(friendsWithMutual);
                    }
                }

                // Fetch posts
                const { data: userPosts } = await supabase
                    .from('social_posts')
                    .select('*')
                    .eq('author_id', data.id)
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (userPosts) setPosts(userPosts);

                // Fetch photos (posts with image media)
                const { data: userPhotos } = await supabase
                    .from('social_posts')
                    .select('id, media_urls, content, created_at, content_type')
                    .eq('author_id', data.id)
                    .not('media_urls', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(50);
                // Filter to only posts with image URLs (not videos)
                if (userPhotos) {
                    const photoList = userPhotos.filter(p =>
                        p.content_type === 'image' ||
                        (p.media_urls && p.media_urls.some(url =>
                            url && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') || url.includes('.webp') || !url.includes('video'))
                        ))
                    );
                    setPhotos(photoList);
                }

                // Fetch video posts
                const { data: userVideos } = await supabase
                    .from('social_posts')
                    .select('id, media_urls, content, created_at, content_type')
                    .eq('author_id', data.id)
                    .eq('content_type', 'video')
                    .not('media_urls', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(30);
                if (userVideos) setVideos(userVideos);

                // Fetch reels
                const { data: userReels } = await supabase
                    .from('social_reels')
                    .select('id, video_url, caption, thumbnail_url, view_count, created_at')
                    .eq('author_id', data.id)
                    .order('created_at', { ascending: false })
                    .limit(30);
                if (userReels) setReels(userReels);

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

    const handleMessage = () => {
        router.push(`/hub/messenger?user=${profile.username}`);
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 16 }}>♠️</div>
                    <div style={{ color: C.textSec }}>Loading profile...</div>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                    <h2 style={{ color: C.text, margin: '0 0 8px' }}>User not found</h2>
                    <p style={{ color: C.textSec }}>The profile you're looking for doesn't exist.</p>
                    <Link href="/hub/social-media" style={{ color: C.blue, fontWeight: 600 }}>Back to Social</Link>
                </div>
            </div>
        );
    }

    const isOwnProfile = currentUser?.id === profile.id;
    const displayName = profile.full_name || profile.username;
    const locationParts = [profile.city, profile.state, profile.country].filter(Boolean);

    return (
        <PageTransition>
            <Head>
                <title>{displayName} | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <style>{`
                    .fb-profile-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .fb-profile-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .fb-profile-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .fb-profile-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .fb-profile-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .fb-profile-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="fb-profile-page" style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                <UniversalHeader pageDepth={2} />

                {/* COVER PHOTO */}
                <div style={{
                    height: 220,
                    background: profile.cover_photo_url
                        ? `url(${profile.cover_photo_url}) center/cover`
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
                    position: 'relative',
                    borderRadius: '0 0 12px 12px'
                }}>
                    {/* Dark overlay for better text visibility */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)', borderRadius: '0 0 12px 12px' }} />
                </div>

                {/* PROFILE HEADER - Facebook Style */}
                <div style={{ padding: '0 16px', marginTop: -50, position: 'relative', zIndex: 10 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                        {/* Avatar */}
                        <Avatar src={profile.avatar_url} name={profile.username} size={120} />

                        {/* Name & Stats */}
                        <div style={{ flex: 1, paddingBottom: 8 }}>
                            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: C.text }}>{displayName}</h1>
                            <div style={{ display: 'flex', gap: 8, fontSize: 14, color: C.textSec, marginTop: 4 }}>
                                <span><strong>{stats.friends}</strong> friends</span>
                                <span>·</span>
                                <span><strong>{stats.posts}</strong> posts</span>
                            </div>
                        </div>
                    </div>

                    {/* Intro Bar - Location, Work, School */}
                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 14, color: C.textSec }}>
                        {locationParts.length > 0 && <span>📍 {locationParts.join(', ')}</span>}
                        {profile.occupation && <span>· 💼 {profile.occupation}</span>}
                        {profile.home_casino && <span>· 🎰 {profile.home_casino}</span>}
                        {profile.instagram && <span>· 📸 @{profile.instagram.replace('@', '')}</span>}
                    </div>

                    {/* Friends Row - "Friends with..." */}
                    {friends.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                            <div style={{ display: 'flex' }}>
                                {friends.slice(0, 3).map((f, i) => (
                                    <img key={f.id} src={f.avatar_url || '/default-avatar.png'}
                                        style={{
                                            width: 28, height: 28, borderRadius: '50%', objectFit: 'cover',
                                            border: '2px solid white', marginLeft: i > 0 ? -10 : 0
                                        }} />
                                ))}
                            </div>
                            <span style={{ fontSize: 13, color: C.textSec }}>
                                Friends with <strong>{friends.slice(0, 2).map(f => f.full_name?.split(' ')[0] || f.username).join(', ')}</strong>
                                {friends.length > 2 && ` and ${friends.length - 2} others`}
                            </span>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        {isOwnProfile ? (
                            <>
                                <Link href="/hub/profile" style={{
                                    flex: 1, padding: '10px 16px', background: '#e4e6eb', color: C.text,
                                    borderRadius: 8, textDecoration: 'none', fontWeight: 600, textAlign: 'center', fontSize: 14
                                }}>✏️ Edit Profile</Link>
                            </>
                        ) : (
                            <>
                                {isFriend ? (
                                    <button style={{
                                        padding: '10px 20px', background: '#e4e6eb', color: C.text,
                                        borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14
                                    }}>👥 Friends</button>
                                ) : friendRequestSent ? (
                                    <button style={{
                                        padding: '10px 20px', background: '#e4e6eb', color: C.textSec,
                                        borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14
                                    }}>⏳ Request Sent</button>
                                ) : (
                                    <button onClick={handleAddFriend} style={{
                                        padding: '10px 20px', background: C.blue, color: 'white',
                                        borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14
                                    }}>➕ Add Friend</button>
                                )}
                                <button onClick={handleMessage} style={{
                                    flex: 1, padding: '10px 16px', background: C.blue, color: 'white',
                                    borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14
                                }}>💬 Message</button>
                                <button style={{
                                    padding: '10px 14px', background: '#e4e6eb', color: C.text,
                                    borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14
                                }}>⋮</button>
                            </>
                        )}
                    </div>
                </div>

                {/* TABS - All | Photos | Videos | Reels */}
                <div style={{
                    display: 'flex', borderBottom: `1px solid ${C.border}`,
                    marginTop: 16, background: C.card, padding: '0 16px'
                }}>
                    {['all', 'photos', 'videos', 'reels'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '14px 24px', background: 'none', border: 'none',
                                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                color: activeTab === tab ? C.blue : C.textSec,
                                borderBottom: activeTab === tab ? `3px solid ${C.blue}` : '3px solid transparent',
                                textTransform: 'capitalize'
                            }}
                        >{tab}</button>
                    ))}
                </div>

                {/* TAB CONTENT */}
                <div style={{ padding: 16 }}>
                    {/* ALL TAB */}
                    {activeTab === 'all' && (
                        <>
                            {/* Poker Resume - At Top */}
                            <PokerResumeBadge hendonData={profile} isOwnProfile={isOwnProfile} />

                            {/* Personal Details Card */}
                            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>Personal details</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {profile.city && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: C.text }}>
                                            <span style={{ fontSize: 18 }}>📍</span>
                                            <span>Lives in <strong>{profile.city}{profile.state ? `, ${profile.state}` : ''}</strong></span>
                                        </div>
                                    )}
                                    {profile.hometown && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: C.text }}>
                                            <span style={{ fontSize: 18 }}>🏠</span>
                                            <span>From <strong>{profile.hometown}</strong></span>
                                        </div>
                                    )}
                                    {profile.birth_year && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: C.text }}>
                                            <span style={{ fontSize: 18 }}>🎂</span>
                                            <span>Born in <strong>{profile.birth_year}</strong></span>
                                        </div>
                                    )}
                                    {profile.favorite_game && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: C.text }}>
                                            <span style={{ fontSize: 18 }}>🎰</span>
                                            <span>Favorite game: <strong>{profile.favorite_game}</strong></span>
                                        </div>
                                    )}
                                    {profile.home_casino && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: C.text }}>
                                            <span style={{ fontSize: 18 }}>🏨</span>
                                            <span>Home casino: <strong>{profile.home_casino}</strong></span>
                                        </div>
                                    )}
                                    {profile.favorite_hand && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: C.text }}>
                                            <span style={{ fontSize: 18 }}>🃏</span>
                                            <span>Favorite hand: <strong>{profile.favorite_hand}</strong></span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Friends Section */}
                            {friends.length > 0 && (
                                <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Friends</h3>
                                            <div style={{ fontSize: 14, color: C.textSec }}>{stats.friends} friends</div>
                                        </div>
                                        <Link href="/hub/friends" style={{ color: C.blue, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>See all</Link>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                        {friends.slice(0, 8).map(friend => (
                                            <FriendAvatar key={friend.id} friend={friend} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* All Posts Section */}
                            <div style={{ marginTop: 16 }}>
                                <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>All posts</h3>

                                {/* Post Composer (for others' profiles) */}
                                {!isOwnProfile && currentUser && (
                                    <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                            <img src={currentUser.avatar_url || '/default-avatar.png'} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                                            <div style={{
                                                flex: 1, padding: '10px 16px', background: C.bg, borderRadius: 20,
                                                color: C.textSec, fontSize: 15, cursor: 'pointer'
                                            }}>Write something to {profile.full_name?.split(' ')[0] || profile.username}...</div>
                                        </div>
                                        <div style={{ display: 'flex', borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
                                            <button style={{ flex: 1, padding: 8, background: 'none', border: 'none', color: C.textSec, fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>📝 Write post</button>
                                            <button style={{ flex: 1, padding: 8, background: 'none', border: 'none', color: C.textSec, fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>🖼️ Share photo</button>
                                        </div>
                                    </div>
                                )}

                                {/* Posts Feed */}
                                {posts.length > 0 ? (
                                    posts.map(post => <PostCard key={post.id} post={post} author={profile} />)
                                ) : (
                                    <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center', color: C.textSec }}>
                                        <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
                                        <p>No posts yet</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* PHOTOS TAB */}
                    {activeTab === 'photos' && (
                        <div>
                            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>Photos</h3>
                            {photos.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                                    {photos.map(photo => (
                                        photo.media_urls?.map((url, i) => (
                                            <div key={`${photo.id}-${i}`} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                                <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                        ))
                                    ))}
                                </div>
                            ) : (
                                <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center', color: C.textSec }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>📷</div>
                                    <p>No photos yet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* VIDEOS TAB */}
                    {activeTab === 'videos' && (
                        <div>
                            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>Videos</h3>
                            {videos.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                                    {videos.map(video => (
                                        video.media_urls?.map((url, i) => (
                                            <div key={`${video.id}-${i}`} style={{ aspectRatio: '16/9', overflow: 'hidden', borderRadius: 8, background: '#000' }}>
                                                <video
                                                    src={url}
                                                    controls
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            </div>
                                        ))
                                    ))}
                                </div>
                            ) : (
                                <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center', color: C.textSec }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>🎥</div>
                                    <p>No videos yet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* REELS TAB */}
                    {activeTab === 'reels' && (
                        <div>
                            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>Reels</h3>
                            {reels.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                                    {reels.map(reel => (
                                        <Link key={reel.id} href={`/hub/reels?id=${reel.id}`} style={{ textDecoration: 'none' }}>
                                            <div style={{ aspectRatio: '9/16', position: 'relative', overflow: 'hidden', borderRadius: 8, background: '#000' }}>
                                                {reel.thumbnail_url ? (
                                                    <img src={reel.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <video src={reel.video_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                                                )}
                                                <div style={{
                                                    position: 'absolute', bottom: 8, left: 8,
                                                    color: 'white', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4
                                                }}>
                                                    ▶️ {reel.view_count || 0}
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center', color: C.textSec }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>🎬</div>
                                    <p>No reels yet</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Bottom padding */}
                <div style={{ height: 80 }} />
            </div>
        </PageTransition>
    );
}
