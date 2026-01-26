/**
 * SMARTER.POKER PROFILE PAGE - Full Editable Profile
 * Facebook-style profile with HendonMob integration
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { MediaLibrary } from '../../src/components/social/MediaLibrary';
import { ProfilePictureHistory } from '../../src/components/social/ProfilePictureHistory';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// God-Mode Stack
import { useProfileStore } from '../../src/stores/profileStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import { staggerContainer, staggerItem } from '../../src/utils/animations';
import toast from '../../src/stores/toastStore';

// Light Theme Colors
const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', gold: '#FFD700',
};

// Auto-format hand notation: 4s5s → 4♠5♠, AsKh → A♠K♥
function formatFavoriteHand(input) {
    if (!input) return input;
    return input
        .replace(/([AKQJT2-9])s/gi, '$1♠')
        .replace(/([AKQJT2-9])h/gi, '$1♥')
        .replace(/([AKQJT2-9])d/gi, '$1♦')
        .replace(/([AKQJT2-9])c/gi, '$1♣');
}

function Avatar({ src, size = 120, onUpload }) {
    const fileRef = useRef(null);

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (onUpload) onUpload(file);
    };

    return (
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
            <img
                src={src || '/default-avatar.png'}
                alt="Profile"
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '4px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
            />
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
            <div style={{
                position: 'absolute', bottom: 4, right: 4, width: 32, height: 32, borderRadius: '50%',
                background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)', border: `1px solid ${C.border}`
            }}>
                📷
            </div>
        </div>
    );
}

function ProfileField({ label, value, onChange, type = 'text', placeholder, icon }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>
                {icon && <span style={{ marginRight: 6 }}>{icon}</span>}
                {label}
            </label>
            {type === 'textarea' ? (
                <textarea
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    style={{
                        width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${C.border}`,
                        fontSize: 15, resize: 'vertical', minHeight: 80, boxSizing: 'border-box',
                        fontFamily: 'inherit', color: '#000000', background: '#ffffff'
                    }}
                />
            ) : (
                <input
                    type={type}
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    style={{
                        width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${C.border}`,
                        fontSize: 15, boxSizing: 'border-box', color: '#000000', background: '#ffffff'
                    }}
                />
            )}
        </div>
    );
}

// Poker Resume Badge - displays scraped HendonMob data in Smarter.Poker style
function PokerResumeBadge({ hendonData, onRefresh, isRefreshing, syncStatus }) {
    if (!hendonData?.hendon_url) return null;

    const hasData = hendonData.total_cashes || hendonData.total_earnings;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2e 100%)',
            borderRadius: 16, padding: 24, color: 'white', marginTop: 16,
            border: '1px solid rgba(255, 215, 0, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 215, 0, 0.1)'
        }}>
            {/* Header */}
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
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>HendonMob Stats</div>
                    </div>
                </div>
                {hasData && (
                    <div style={{
                        background: 'rgba(0, 255, 136, 0.2)',
                        border: '1px solid rgba(0, 255, 136, 0.5)',
                        padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        color: '#00FF88'
                    }}>
                        ✓ SYNCED
                    </div>
                )}
            </div>

            {hasData ? (
                <>
                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: C.gold, textShadow: '0 0 10px rgba(255, 215, 0, 0.3)' }}>
                                {hendonData.total_cashes?.toLocaleString() || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Cashes</div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#00ff88', textShadow: '0 0 10px rgba(0, 255, 136, 0.3)' }}>
                                ${hendonData.total_earnings?.toLocaleString() || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Earnings</div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#00d4ff', textShadow: '0 0 10px rgba(0, 212, 255, 0.3)' }}>
                                ${hendonData.biggest_cash?.toLocaleString() || hendonData.best_finish || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Big Cash</div>
                        </div>
                    </div>

                    {/* Last Updated + Re-sync */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                        {hendonData.last_scraped && (
                            <div style={{ fontSize: 11, opacity: 0.4 }}>
                                Last synced: {new Date(hendonData.last_scraped).toLocaleDateString()}
                            </div>
                        )}
                        <button
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            style={{
                                background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                                padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: isRefreshing ? 'wait' : 'pointer',
                                opacity: isRefreshing ? 0.7 : 1
                            }}
                        >
                            {isRefreshing ? '🔄 Syncing...' : '🔄 Re-sync'}
                        </button>
                    </div>
                </>
            ) : (
                /* No data yet - show sync button with better status */
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    {isRefreshing ? (
                        <>
                            <div style={{ fontSize: 48, marginBottom: 12, animation: 'spin 1s linear infinite' }}>🔄</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: C.gold, marginBottom: 8 }}>
                                Fetching your tournament stats...
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.6 }}>
                                This may take a few seconds
                            </div>
                            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
                                Click below to fetch your tournament stats from Hendon Mob
                            </div>
                            <button
                                onClick={onRefresh}
                                style={{
                                    background: C.gold, color: '#000', border: 'none',
                                    padding: '12px 32px', borderRadius: 8, fontWeight: 700,
                                    cursor: 'pointer', fontSize: 15
                                }}
                            >
                                🔄 Sync Stats Now
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ProfilePage() {
    const router = useRouter();
    const { avatar } = useAvatar();

    // Zustand Global State (replaces UI-related useState)
    const libraryOpen = useProfileStore((s) => s.libraryOpen);
    const setLibraryOpen = useProfileStore((s) => s.setLibraryOpen);
    const saving = useProfileStore((s) => s.saving);
    const setSaving = useProfileStore((s) => s.setSaving);
    const isRefreshing = useProfileStore((s) => s.isRefreshing);
    const setIsRefreshing = useProfileStore((s) => s.setIsRefreshing);

    // Ref for cover photo upload
    const coverPhotoRef = useRef(null);

    // Local state (keep for data/session)
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    // Social stats and friends
    const [socialStats, setSocialStats] = useState({ friends: 0, followers: 0, following: 0, posts: 0 });
    const [friends, setFriends] = useState([]);

    // Photo, Reels, and Lives galleries
    const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
    const [reelsGalleryOpen, setReelsGalleryOpen] = useState(false);
    const [livesGalleryOpen, setLivesGalleryOpen] = useState(false);
    const [userPhotos, setUserPhotos] = useState([]);
    const [userReels, setUserReels] = useState([]);
    const [userLives, setUserLives] = useState([]);

    // Profile fields
    const [profile, setProfile] = useState({
        full_name: '',
        username: '',
        bio: '',
        city: '',
        state: '',
        country: '',
        phone: '',
        website: '',
        twitter: '',
        instagram: '',
        hendon_url: '',
        favorite_game: '',
        favorite_hand: '',
        home_casino: '',
        birth_year: '',
        avatar_url: '',
        cover_photo_url: '', // Cover photo for profile
        card_back_preference: 'white', // Default to white deck
        // HendonMob scraped data
        hendon_total_cashes: null,
        hendon_total_earnings: null,
        hendon_best_finish: null,
        hendon_biggest_cash: null,
        hendon_last_scraped: null,
    });
    const [originalProfile, setOriginalProfile] = useState(null);

    // Award diamonds and XP for profile actions
    const awardProfileReward = async (reason, diamonds, xp) => {
        if (!user) return;
        try {
            // Award diamonds via diamond_ledger insert
            if (diamonds > 0) {
                await supabase.from('diamond_ledger').insert({
                    user_id: user.id,
                    amount: diamonds,
                    type: 'earn',
                    source: reason,
                    description: `Profile: ${reason}`
                });
            }
            // Award XP by updating profiles
            if (xp > 0) {
                await supabase.rpc('fn_add_xp', { p_user_id: user.id, p_amount: xp });
            }
        } catch (e) {
            console.error('Reward error:', e);
        }
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                // FIXED: Check BOTH storage key formats:
                // 1. New unified key: 'smarter-poker-auth' (from supabase.ts)
                // 2. Legacy Supabase keys: 'sb-*-auth-token'
                let authUser = null;

                // First, try the new unified storage key
                const unifiedToken = localStorage.getItem('smarter-poker-auth');
                if (unifiedToken) {
                    try {
                        const tokenData = JSON.parse(unifiedToken);
                        authUser = tokenData?.user || null;
                    } catch (e) { /* ignore parse errors */ }
                }

                // Fallback: check legacy Supabase keys
                if (!authUser) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) {
                        try {
                            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                            authUser = tokenData?.user || null;
                        } catch (e) { /* ignore parse errors */ }
                    }
                }

                if (authUser) {
                    setUser(authUser);
                    // Fetch profile using native fetch to avoid AbortError
                    try {
                        const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
                        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

                        const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${authUser.id}&select=*`, {
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        if (response.ok) {
                            const profiles = await response.json();
                            const profileData = profiles[0];
                            if (profileData) {
                                setProfile(prev => ({ ...prev, ...profileData }));
                                setOriginalProfile(profileData);
                            }
                        }

                        // Fetch social stats and friends
                        const headers = {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json'
                        };

                        // Count friends
                        const friendsRes = await fetch(
                            `${supabaseUrl}/rest/v1/friendships?or=(user_id.eq.${authUser.id},friend_id.eq.${authUser.id})&status=eq.accepted&select=user_id,friend_id`,
                            { headers }
                        );
                        const friendsData = friendsRes.ok ? await friendsRes.json() : [];

                        // Count followers
                        const followersRes = await fetch(
                            `${supabaseUrl}/rest/v1/follows?following_id=eq.${authUser.id}&select=id`,
                            { headers }
                        );
                        const followersData = followersRes.ok ? await followersRes.json() : [];

                        // Count following
                        const followingRes = await fetch(
                            `${supabaseUrl}/rest/v1/follows?follower_id=eq.${authUser.id}&select=id`,
                            { headers }
                        );
                        const followingData = followingRes.ok ? await followingRes.json() : [];

                        // Count posts
                        const postsRes = await fetch(
                            `${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&select=id`,
                            { headers }
                        );
                        const postsData = postsRes.ok ? await postsRes.json() : [];

                        setSocialStats({
                            friends: friendsData.length,
                            followers: followersData.length,
                            following: followingData.length,
                            posts: postsData.length
                        });

                        // Get friend profiles for display
                        if (friendsData.length > 0) {
                            const friendIds = friendsData.map(f => f.user_id === authUser.id ? f.friend_id : f.user_id);
                            const profilesRes = await fetch(
                                `${supabaseUrl}/rest/v1/profiles?id=in.(${friendIds.join(',')})&select=id,full_name,username,avatar_url`,
                                { headers }
                            );
                            const friendProfiles = profilesRes.ok ? await profilesRes.json() : [];

                            // Calculate mutual friends for each (simplified - just use random for now since we don't have full network data)
                            const friendsWithMutual = friendProfiles.map(f => ({
                                ...f,
                                mutualCount: 0 // Will be calculated properly with RPC in future
                            }));

                            setFriends(friendsWithMutual);
                        }

                        // Fetch user's photos (posts with images)
                        // Uses content_type='photo' and media_urls array is not empty
                        const photosRes = await fetch(
                            `${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&content_type=eq.photo&order=created_at.desc&limit=50&select=id,media_urls,content,created_at`,
                            { headers }
                        );
                        const photosData = photosRes.ok ? await photosRes.json() : [];
                        // Transform to flatten media_urls array for display
                        const flatPhotos = photosData.flatMap(post =>
                            (post.media_urls || []).map((url, idx) => ({
                                id: `${post.id}-${idx}`,
                                media_url: url,
                                content: post.content,
                                created_at: post.created_at
                            }))
                        );
                        setUserPhotos(flatPhotos);

                        // Fetch user's reels (posts with video content_type)
                        const reelsRes = await fetch(
                            `${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&content_type=eq.video&order=created_at.desc&limit=50&select=id,media_urls,content,created_at`,
                            { headers }
                        );
                        const reelsData = reelsRes.ok ? await reelsRes.json() : [];
                        // Transform to flatten media_urls array for video display
                        const flatReels = reelsData.flatMap(post =>
                            (post.media_urls || []).map((url, idx) => ({
                                id: `${post.id}-${idx}`,
                                media_url: url,
                                content: post.content,
                                created_at: post.created_at
                            }))
                        );
                        setUserReels(flatReels);

                        // Fetch user's saved lives (draft streams)
                        const livesRes = await fetch(
                            `${supabaseUrl}/rest/v1/live_streams?broadcaster_id=eq.${authUser.id}&status=eq.ended&order=created_at.desc&limit=50&select=id,title,video_url,thumbnail_url,is_draft,is_posted,viewer_count,started_at,ended_at,created_at`,
                            { headers }
                        );
                        const livesData = livesRes.ok ? await livesRes.json() : [];
                        setUserLives(livesData);
                    } catch (e) {
                        console.error('[Profile] Error fetching profile:', e);
                    }
                }
            } catch (e) {
                console.error('[Profile] Auth error:', e);
            }
            setLoading(false);
        };
        fetchUser();
    }, []);

    const updateField = (field) => (value) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    const handleAvatarUpload = async (file) => {
        if (!user) return;
        setMessage('Uploading avatar...');

        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/avatar.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            setMessage('Error uploading avatar: ' + uploadError.message);
            console.error('Upload error:', uploadError);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

        // Auto-save to database immediately
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', user.id);

        if (updateError) {
            setMessage('Error saving avatar: ' + updateError.message);
            console.error('Save error:', updateError);
            return;
        }

        setProfile(prev => ({ ...prev, avatar_url: publicUrl }));

        // Award diamonds/XP for first avatar if this is the first time
        if (!originalProfile?.avatar_url) {
            await awardProfileReward('first_avatar', 15, 25);
            setMessage('🎉 Avatar saved! +15 💎 +25 XP!');
            setOriginalProfile(prev => ({ ...prev, avatar_url: publicUrl }));
        } else {
            setMessage('✓ Avatar saved!');
        }
    };

    const handleCoverPhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setMessage('Uploading cover photo...');

        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/cover.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            setMessage('Error uploading cover photo: ' + uploadError.message);
            console.error('Upload error:', uploadError);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

        // Auto-save to database immediately
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ cover_photo_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', user.id);

        if (updateError) {
            setMessage('Error saving cover photo: ' + updateError.message);
            console.error('Save error:', updateError);
            return;
        }

        setProfile(prev => ({ ...prev, cover_photo_url: publicUrl }));
        setMessage('✓ Cover photo saved!');
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setMessage('');

        // Use update instead of upsert to avoid XP trigger issues
        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: profile.full_name,
                username: profile.username,
                bio: profile.bio,
                city: profile.city,
                state: profile.state,
                country: profile.country,
                phone: profile.phone,
                website: profile.website,
                twitter: profile.twitter,
                instagram: profile.instagram,
                hendon_url: profile.hendon_url,
                favorite_game: profile.favorite_game,
                favorite_hand: profile.favorite_hand,
                home_casino: profile.home_casino,
                birth_year: profile.birth_year,
                avatar_url: profile.avatar_url,
                cover_photo_url: profile.cover_photo_url,
                card_back_preference: profile.card_back_preference,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

        setSaving(false);
        if (error) {
            setMessage(`Error saving profile: ${error.message || error.code || JSON.stringify(error)}`);
            console.error('Profile save error:', error);
        } else {
            // Award rewards for first-time profile updates
            const rewards = [];

            // First time setting avatar (15 diamonds, 25 XP)
            if (profile.avatar_url && (!originalProfile || !originalProfile.avatar_url)) {
                await awardProfileReward('first_avatar', 15, 25);
                rewards.push('🎉 +15 💎 +25 XP for adding profile picture!');
            }

            // First time linking HendonMob (15 diamonds, 25 XP)
            if (profile.hendon_url && (!originalProfile || !originalProfile.hendon_url)) {
                await awardProfileReward('hendonmob_linked', 15, 25);
                rewards.push('🏆 +15 💎 +25 XP for linking Hendon Mob!');
            }

            if (rewards.length > 0) {
                setMessage(rewards.join(' '));
                // Small delay to show rewards before navigating
                setTimeout(() => router.back(), 2000);
            } else {
                router.back();
            }
        }
    };

    if (loading) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
    if (!user) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
            <h2>Please log in to view your profile</h2>
            <Link href="/auth/login" style={{ color: C.blue }}>Log In</Link>
        </div>
    </div>;

    return (
        <>
            <Head>
                <title>My Profile | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .profile-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
                    
                    
                    
                    
                    
                `}</style>
            </Head>
            <div className="profile-page" style={{ minHeight: '100vh', background: '#0a0e1a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header - Universal Header with Back navigation (nested page) */}
                <UniversalHeader pageDepth={2} />

                {/* Cover Photo Area - Clickable to upload */}
                <div
                    onClick={() => coverPhotoRef.current?.click()}
                    style={{
                        height: 200,
                        background: profile.cover_photo_url
                            ? `url(${profile.cover_photo_url}) center/cover no-repeat`
                            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        position: 'relative',
                        cursor: 'pointer'
                    }}
                >
                    <input
                        ref={coverPhotoRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleCoverPhotoUpload}
                    />

                    {/* Add Cover Photo - Bottom Right inside cover */}
                    <div style={{
                        position: 'absolute',
                        bottom: 12,
                        right: 12,
                        background: 'rgba(0,0,0,0.6)',
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                    }}>
                        📷 {profile.cover_photo_url ? 'Change Cover' : 'Add Cover Photo'}
                    </div>

                    {/* Profile Avatar - Center */}
                    <div style={{ position: 'absolute', bottom: -60, left: '50%', transform: 'translateX(-50%)' }}>
                        <Avatar src={profile.avatar_url} size={120} onUpload={handleAvatarUpload} />
                    </div>
                </div>

                {/* Action Buttons Row - BELOW cover photo in the black area */}
                <div style={{
                    background: C.bg,
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    maxWidth: 800,
                    margin: '0 auto',
                    marginTop: 70 // Account for avatar overlap
                }}>
                    {/* Left side - Photos & Reels */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => setPhotoGalleryOpen(true)}
                            style={{
                                background: C.card,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            📷 Photos
                        </button>
                        <button
                            onClick={() => setReelsGalleryOpen(true)}
                            style={{
                                background: C.card,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            🎬 Reels
                        </button>
                        <button
                            onClick={() => setLivesGalleryOpen(true)}
                            style={{
                                background: C.card,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            🔴 Lives
                        </button>
                    </div>

                    {/* Right side - Build Custom Avatar */}
                    <button
                        onClick={() => router.push('/hub/avatars')}
                        style={{
                            background: 'linear-gradient(135deg, #00f5ff, #0099ff)',
                            color: '#0a0e27',
                            border: 'none',
                            borderRadius: 8,
                            padding: '10px 16px',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,245,255,0.4)'
                        }}
                    >
                        Build A Custom Avatar
                    </button>
                </div>

                {/* Main Content */}
                <div style={{ maxWidth: 800, margin: '80px auto 40px', padding: '0 16px' }}>
                    {message && (
                        <div style={{
                            padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center',
                            background: message.includes('Error') ? '#ffebee' : '#e8f5e9',
                            color: message.includes('Error') ? '#c62828' : '#2e7d32'
                        }}>
                            {message}
                        </div>
                    )}

                    {/* Social Stats Row */}
                    <div style={{
                        background: C.card, borderRadius: 8, padding: 16, marginBottom: 16,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        display: 'flex', justifyContent: 'space-around', textAlign: 'center'
                    }}>
                        <div style={{ cursor: 'pointer' }} onClick={() => router.push('/hub/friends')}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.friends}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Friends</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.followers}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Followers</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.following}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Following</div>
                        </div>
                        <div style={{ cursor: 'pointer' }} onClick={() => router.push('/hub/social-media')}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.posts}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Posts</div>
                        </div>
                    </div>

                    {/* Friends Section - Facebook Style */}
                    {friends.length > 0 && (
                        <div style={{
                            background: C.card, borderRadius: 8, padding: 16, marginBottom: 16,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Friends</h3>
                                <a
                                    href="/hub/friends"
                                    style={{ color: C.blue, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
                                >
                                    See all
                                </a>
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: 12
                            }}>
                                {friends.slice(0, 8).map(friend => (
                                    <a
                                        key={friend.id}
                                        href={`/hub/user/${friend.username || friend.id}`}
                                        style={{
                                            textDecoration: 'none',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <img
                                            src={friend.avatar_url || '/default-avatar.png'}
                                            alt={friend.full_name || friend.username}
                                            style={{
                                                width: 80, height: 80, borderRadius: '50%',
                                                objectFit: 'cover', marginBottom: 8,
                                                border: '2px solid #eee'
                                            }}
                                        />
                                        <div style={{
                                            fontSize: 13, fontWeight: 600, color: C.text,
                                            maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {friend.full_name || friend.username || 'User'}
                                        </div>
                                        {friend.mutualCount > 0 && (
                                            <div style={{ fontSize: 11, color: C.textSec }}>
                                                {friend.mutualCount} mutual friends
                                            </div>
                                        )}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Basic Info */}
                    <div style={{ background: C.card, borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: C.text }}>👤 Basic Information</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="Full Name" value={profile.full_name} onChange={updateField('full_name')} placeholder="John Doe" icon="📛" />
                            <ProfileField label="Username" value={profile.username} onChange={updateField('username')} placeholder="@johndoe" icon="@" />
                        </div>
                        <ProfileField label="Bio" value={profile.bio} onChange={updateField('bio')} type="textarea" placeholder="Tell us about yourself and your poker journey..." icon="📝" />

                        {/* Profile Picture History */}
                        <ProfilePictureHistory
                            userId={user?.id}
                            supabase={supabase}
                            onViewAll={() => setLibraryOpen(true)}
                            limit={6}
                        />
                    </div>

                    {/* Location */}
                    <div style={{ background: C.card, borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: C.text }}>📍 Location</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            <ProfileField label="City" value={profile.city} onChange={updateField('city')} placeholder="Las Vegas" />
                            <ProfileField label="State" value={profile.state} onChange={updateField('state')} placeholder="Nevada" />
                            <ProfileField label="Country" value={profile.country} onChange={updateField('country')} placeholder="USA" />
                        </div>
                    </div>

                    {/* Contact & Social */}
                    <div style={{ background: C.card, borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: C.text }}>🔗 Contact & Social</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="Phone" value={profile.phone} onChange={updateField('phone')} type="tel" placeholder="+1 555 123 4567" icon="📱" />
                            <ProfileField label="Website" value={profile.website} onChange={updateField('website')} placeholder="https://yoursite.com" icon="🌐" />
                            <ProfileField label="Twitter/X" value={profile.twitter} onChange={updateField('twitter')} placeholder="@username" icon="𝕏" />
                            <ProfileField label="Instagram" value={profile.instagram} onChange={updateField('instagram')} placeholder="@username" icon="📸" />
                        </div>
                    </div>

                    {/* Card Deck Preference */}
                    <div style={{ background: C.card, borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: C.text }}>🎴 Card Deck Preference</h3>
                        <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                            Choose your preferred card back design. This will be used across all games (Training, Club Arena, Diamond Arena).
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            {['white', 'black', 'red', 'blue'].map(deck => (
                                <div
                                    key={deck}
                                    onClick={() => updateField('card_back_preference')(deck)}
                                    style={{
                                        cursor: 'pointer',
                                        borderRadius: 8,
                                        border: profile.card_back_preference === deck ? '3px solid #FFD700' : '2px solid #DADDE1',
                                        padding: 8,
                                        textAlign: 'center',
                                        transition: 'all 0.2s ease',
                                        background: profile.card_back_preference === deck ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                                        boxShadow: profile.card_back_preference === deck ? '0 0 15px rgba(255, 215, 0, 0.3)' : 'none'
                                    }}
                                >
                                    <img
                                        src={`/images/card-backs/${deck}.jpg`}
                                        alt={`${deck} deck`}
                                        style={{
                                            width: '100%',
                                            height: 100,
                                            objectFit: 'contain',
                                            borderRadius: 8,
                                            marginBottom: 8,
                                            background: 'transparent'
                                        }}
                                    />
                                    <div style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: profile.card_back_preference === deck ? C.gold : C.textSec,
                                        textTransform: 'uppercase'
                                    }}>
                                        {profile.card_back_preference === deck && '✓ '}
                                        {deck}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Poker Info */}
                    <div style={{ background: C.card, borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: C.text }}>🃏 Poker Info</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="Favorite Game" value={profile.favorite_game} onChange={updateField('favorite_game')} placeholder="No Limit Hold'em" icon="🎰" />
                            <ProfileField label="Favorite Hand" value={profile.favorite_hand} onChange={(val) => updateField('favorite_hand')(formatFavoriteHand(val))} placeholder="A♠ K♠ or type AsKs" icon="🃏" />
                            <ProfileField label="Home Casino" value={profile.home_casino} onChange={updateField('home_casino')} placeholder="Bellagio" icon="🏨" />
                            <ProfileField label="Birth Year" value={profile.birth_year} onChange={updateField('birth_year')} placeholder="1990" icon="🎂" />
                        </div>
                    </div>

                    {/* HendonMob Integration / Poker Resume */}
                    <div style={{ background: C.card, borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: C.text }}>🏆 Poker Resume</h3>
                        <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                            Link your Hendon Mob profile to automatically display your tournament stats.
                            Stats are synced directly from HendonMob.
                        </p>

                        <ProfileField
                            label="Hendon Mob Profile URL"
                            value={profile.hendon_url}
                            onChange={updateField('hendon_url')}
                            placeholder="https://pokerdb.thehendonmob.com/player.php?a=r&n=YOUR_ID"
                            icon="🔗"
                        />

                        {/* Display Poker Resume badge with sync button */}
                        <PokerResumeBadge
                            hendonData={{
                                hendon_url: profile.hendon_url,
                                total_cashes: profile.hendon_total_cashes,
                                total_earnings: profile.hendon_total_earnings,
                                best_finish: profile.hendon_best_finish,
                                biggest_cash: profile.hendon_biggest_cash,
                                last_scraped: profile.hendon_last_scraped,
                            }}
                            onRefresh={async () => {
                                if (!profile.hendon_url) {
                                    setMessage('Please enter your Hendon Mob URL first');
                                    return;
                                }
                                setIsRefreshing(true);
                                setMessage('🔄 Syncing stats from Hendon Mob... This may take 15-30 seconds.');
                                try {
                                    const res = await fetch('/api/hendonmob/sync', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: user.id, hendonUrl: profile.hendon_url })
                                    });
                                    const data = await res.json();
                                    if (res.ok && data.success) {
                                        setProfile(prev => ({
                                            ...prev,
                                            hendon_total_cashes: data.total_cashes,
                                            hendon_total_earnings: data.total_earnings,
                                            hendon_best_finish: data.best_finish,
                                            hendon_biggest_cash: data.biggest_cash,
                                            hendon_last_scraped: new Date().toISOString()
                                        }));
                                        setMessage('✅ Stats synced successfully!');
                                    } else {
                                        setMessage(`❌ ${data.error || 'Could not sync stats. Please check your URL.'}`);
                                    }
                                } catch (e) {
                                    console.error('Sync error:', e);
                                    setMessage('❌ Error syncing stats. Please try again later.');
                                }
                                setIsRefreshing(false);
                            }}
                            isRefreshing={isRefreshing}
                        />
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            width: '100%', padding: 16, background: C.blue, color: 'white',
                            border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
                            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1
                        }}
                    >
                        {saving ? 'Saving...' : '💾 Save Profile'}
                    </button>
                </div>
            </div>

            {/* Media Library Modal */}
            <MediaLibrary
                isOpen={libraryOpen}
                onClose={() => setLibraryOpen(false)}
                userId={user?.id}
                supabase={supabase}
                mode="browse"
            />

            {/* Photo Gallery Modal */}
            {photoGalleryOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: 16, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', borderBottom: '1px solid #333'
                    }}>
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>📷 My Photos</h2>
                        <button
                            onClick={() => setPhotoGalleryOpen(false)}
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: 28, cursor: 'pointer'
                            }}
                        >×</button>
                    </div>
                    <div style={{
                        flex: 1, overflow: 'auto', padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 16,
                        maxWidth: 600, margin: '0 auto', width: '100%'
                    }}>
                        {userPhotos.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                                <div style={{ fontSize: 18 }}>No photos yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    Photos from your posts will appear here
                                </div>
                            </div>
                        ) : (
                            userPhotos.map(photo => (
                                <div key={photo.id} style={{
                                    background: '#111', borderRadius: 12, overflow: 'hidden'
                                }}>
                                    <img
                                        src={photo.media_url}
                                        alt={photo.content || 'Photo'}
                                        style={{
                                            width: '100%', height: 'auto',
                                            display: 'block'
                                        }}
                                    />
                                    {photo.content && (
                                        <div style={{
                                            padding: '12px 16px', color: 'white',
                                            fontSize: 14, background: '#1a1a1a'
                                        }}>{photo.content}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Reels Gallery Modal */}
            {reelsGalleryOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: 16, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', borderBottom: '1px solid #333'
                    }}>
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>🎬 My Reels</h2>
                        <button
                            onClick={() => setReelsGalleryOpen(false)}
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: 28, cursor: 'pointer'
                            }}
                        >×</button>
                    </div>
                    <div style={{
                        flex: 1, overflow: 'auto', padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 16,
                        maxWidth: 600, margin: '0 auto', width: '100%'
                    }}>
                        {userReels.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
                                <div style={{ fontSize: 18 }}>No reels yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    Videos from your posts will appear here
                                </div>
                            </div>
                        ) : (
                            userReels.map(reel => (
                                <div
                                    key={reel.id}
                                    style={{
                                        background: '#111', borderRadius: 12, overflow: 'hidden'
                                    }}
                                >
                                    <video
                                        src={reel.media_url}
                                        poster={reel.thumbnail_url}
                                        style={{
                                            width: '100%', height: 'auto',
                                            display: 'block', maxHeight: '80vh'
                                        }}
                                        controls
                                    />
                                    {reel.caption && (
                                        <div style={{
                                            padding: '12px 16px', color: 'white',
                                            fontSize: 14, background: '#1a1a1a'
                                        }}>{reel.caption}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Lives Gallery Modal */}
            {livesGalleryOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: 16, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', borderBottom: '1px solid #333'
                    }}>
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>🔴 My Lives</h2>
                        <button
                            onClick={() => setLivesGalleryOpen(false)}
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: 28, cursor: 'pointer'
                            }}
                        >×</button>
                    </div>
                    <div style={{
                        flex: 1, overflow: 'auto', padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 16,
                        maxWidth: 600, margin: '0 auto', width: '100%'
                    }}>
                        {userLives.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🔴</div>
                                <div style={{ fontSize: 18 }}>No saved lives yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    When you end a live stream, you can save it here
                                </div>
                            </div>
                        ) : (
                            userLives.map(live => {
                                const duration = live.started_at && live.ended_at
                                    ? Math.round((new Date(live.ended_at) - new Date(live.started_at)) / 1000)
                                    : 0;
                                const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
                                const dateStr = new Date(live.created_at).toLocaleDateString();

                                return (
                                    <div
                                        key={live.id}
                                        style={{
                                            background: '#1a1a1a',
                                            borderRadius: 12,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* Video Preview */}
                                        <div style={{ position: 'relative', background: '#000' }}>
                                            {live.video_url ? (
                                                <video
                                                    src={live.video_url}
                                                    poster={live.thumbnail_url}
                                                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '80vh' }}
                                                    controls
                                                />
                                            ) : live.thumbnail_url ? (
                                                <img
                                                    src={live.thumbnail_url}
                                                    alt={live.title}
                                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '100%', height: '100%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#666', fontSize: 40
                                                }}>📺</div>
                                            )}
                                            {/* Duration badge */}
                                            <div style={{
                                                position: 'absolute', bottom: 8, right: 8,
                                                background: 'rgba(0,0,0,0.8)', color: 'white',
                                                padding: '4px 8px', borderRadius: 4, fontSize: 12
                                            }}>{durationStr}</div>
                                            {/* Status badge */}
                                            <div style={{
                                                position: 'absolute', top: 8, left: 8,
                                                background: live.is_posted ? '#42B72A' : '#FA383E',
                                                color: 'white',
                                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                                            }}>{live.is_posted ? 'Posted' : 'Draft'}</div>
                                        </div>
                                        {/* Info */}
                                        <div style={{ padding: 12 }}>
                                            <div style={{ color: 'white', fontWeight: 600, marginBottom: 4 }}>
                                                {live.title || 'Live Stream'}
                                            </div>
                                            <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
                                                {dateStr} • {live.viewer_count || 0} viewers
                                            </div>
                                            {/* Actions */}
                                            {!live.is_posted && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        onClick={async () => {
                                                            if (!live.video_url) {
                                                                alert('No video available to post');
                                                                return;
                                                            }
                                                            // Post to feed
                                                            const { error } = await supabase.from('social_posts').insert({
                                                                author_id: user?.id,
                                                                content: `🔴 ${live.title || 'Live replay'}`,
                                                                content_type: 'video',
                                                                media_urls: [live.video_url],
                                                                visibility: 'public'
                                                            });
                                                            if (!error) {
                                                                await supabase.from('live_streams')
                                                                    .update({ is_posted: true, is_draft: false })
                                                                    .eq('id', live.id);
                                                                setUserLives(prev => prev.map(l =>
                                                                    l.id === live.id ? { ...l, is_posted: true, is_draft: false } : l
                                                                ));
                                                            }
                                                        }}
                                                        style={{
                                                            flex: 1, padding: '10px 16px', borderRadius: 6,
                                                            background: '#1877F2', color: 'white',
                                                            border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >📤 Post</button>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('Delete this live stream?')) {
                                                                await supabase.from('live_streams').delete().eq('id', live.id);
                                                                setUserLives(prev => prev.filter(l => l.id !== live.id));
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '10px 16px', borderRadius: 6,
                                                            background: 'transparent', color: '#FA383E',
                                                            border: '1px solid #FA383E', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >🗑️</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
