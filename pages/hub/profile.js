/**
 * SMARTER.POKER PROFILE PAGE - Full Editable Profile
 * Facebook-style profile with HendonMob integration
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MediaLibrary } from '../../src/components/social/MediaLibrary';
import { ProfilePictureHistory } from '../../src/components/social/ProfilePictureHistory';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';
import { useAvatar } from '../../src/contexts/AvatarContext';
import AvatarSelectorModal from '../../src/components/avatars/AvatarSelectorModal';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
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
                    style={{
                        width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${C.border}`,
                        fontSize: 15, resize: 'vertical', minHeight: 80, boxSizing: 'border-box',
                        fontFamily: 'inherit'
                    }}
                />
            ) : (
                <input
                    type={type}
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={{
                        width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${C.border}`,
                        fontSize: 15, boxSizing: 'border-box'
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
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);

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
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                // Fetch profile
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileData) {
                    setProfile(prev => ({ ...prev, ...profileData }));
                    setOriginalProfile(profileData);
                }
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
            <Head><title>My Profile | Smarter.Poker</title></Head>
            <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header */}
                <header style={{ background: C.card, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <BrainHomeButton style={{ position: 'relative', top: 0, left: 0, width: 40, height: 40 }} />
                        <span style={{ fontWeight: 600, fontSize: 18, color: C.text }}>Edit Profile</span>
                    </div>
                    <Link href="/hub/social-media" style={{ color: C.textSec, textDecoration: 'none' }}>← Back to Social</Link>
                </header>

                {/* Cover Photo Area */}
                <div style={{
                    height: 200,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    position: 'relative'
                }}>
                    <div style={{ position: 'absolute', bottom: -60, left: '50%', transform: 'translateX(-50%)' }}>
                        <Avatar src={profile.avatar_url} size={120} onUpload={handleAvatarUpload} />
                        <button
                            onClick={() => setLibraryOpen(true)}
                            style={{
                                position: 'absolute', bottom: -8, right: -8, background: C.blue, color: 'white',
                                border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 11,
                                fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                            }}
                        >
                            📸 Library
                        </button>
                    </div>
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
        </>
    );
}
