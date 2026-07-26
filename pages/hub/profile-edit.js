/**
 * SMARTER.POKER PROFILE PAGE - Full Editable Profile
 * SmarterPoker-style profile with HendonMob integration
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { claimReward } from '../../src/lib/claimReward';
import { useRouter } from 'next/router';

const FavoriteHandPicker = dynamic(() => import('../../src/components/profile/FavoriteHandPicker'), { ssr: false });
const CoverPhotoEditor = dynamic(() => import('../../src/components/profile/CoverPhotoEditor'), { ssr: false });
const MediaLibrary = dynamic(() => import('../../src/components/social/MediaLibrary').then(mod => mod.MediaLibrary), { ssr: false });
const ProfilePictureHistory = dynamic(() => import('../../src/components/social/ProfilePictureHistory').then(mod => mod.ProfilePictureHistory), { ssr: false });
import { useAvatar } from '../../src/contexts/AvatarContext';
import { supabase } from '../../src/lib/supabase';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), { ssr: false });

// God-Mode Stack
import { useProfileStore } from '../../src/stores/profileStore';
import { getAccessToken, getAuthUser } from '../../src/lib/authUtils';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { busEmit } from '../../src/engine/EventBus';
import { broadcastSync } from '../../src/lib/broadcastSync';

const ProfileCompletionBar = dynamic(() => import('../../src/components/profile-edit/ProfileCompletionBar'), { ssr: false });
const Toast = dynamic(() => import('../../src/components/profile-edit/Toast'), { ssr: false });
const ProfileSkeleton = dynamic(() => import('../../src/components/profile-edit/ProfileSkeleton'), { ssr: false });
const CollapsibleSection = dynamic(() => import('../../src/components/profile-edit/CollapsibleSection'), { ssr: false });
const SectionNav = dynamic(() => import('../../src/components/profile-edit/SectionNav'), { ssr: false });
const Avatar = dynamic(() => import('../../src/components/profile-edit/Avatar'), { ssr: false });
const ProfileField = dynamic(() => import('../../src/components/profile-edit/ProfileField'), { ssr: false });
const PokerResumeBadge = dynamic(() => import('../../src/components/profile-edit/PokerResumeBadge'), { ssr: false });
const HomeCasinoSelector = dynamic(() => import('../../src/components/profile-edit/HomeCasinoSelector'), { ssr: false });
const PhotoGalleryModal = dynamic(() => import('../../src/components/profile-edit/PhotoGalleryModal'), { ssr: false });
const ReelsGalleryModal = dynamic(() => import('../../src/components/profile-edit/ReelsGalleryModal'), { ssr: false });
const LivesGalleryModal = dynamic(() => import('../../src/components/profile-edit/LivesGalleryModal'), { ssr: false });
import { getProfileJwt, getDaysInMonth, stripSocialHandle, calcProfileCompletion, compressImage } from '../../src/components/profile-edit/utils';
import { C, MAX_UPLOAD_SIZE } from '../../src/components/profile-edit/constants';
import { useProfileHandlers } from '../../src/components/profile-edit/profileHandlers';
const BasicInfoSection = dynamic(() => import('../../src/components/profile-edit/BasicInfoSection'), { ssr: false });
const PokerInfoSection = dynamic(() => import('../../src/components/profile-edit/PokerInfoSection'), { ssr: false });
const PokerResumeSection = dynamic(() => import('../../src/components/profile-edit/PokerResumeSection'), { ssr: false });
const CardDeckPreferenceSection = dynamic(() => import('../../src/components/profile-edit/CardDeckPreferenceSection'), { ssr: false });

const BottomNavBar = dynamic(() => import('../../src/components/ui/BottomNavBar'), { ssr: false });

// Light Theme Colors


// ── Shared JWT helper — eliminates 8 duplicated auth patterns ──


// Days-in-month helper for birthday validation


// Max file size for uploads (5MB)


// Social link URL stripping patterns


// Profile completion calculator


// ── Image compression utility — reduces upload size 60-80% ──


// ── Profile Completion Progress Bar ──


// ── Animated Toast Notification — slide-in/out with color coding ──


// ── Loading Skeleton with shimmer ──


// ── Collapsible Section with localStorage memory ──


// ── Section Jump Navigation (floating pill bar) ──






// Poker Resume Badge - displays scraped HendonMob data in Smarter.Poker style


// ── Home Casino Venue Autocomplete ──────────────────────────────────────────


export default function ProfilePage() {
    const router = useRouter();
    useTrainingBus('profile-edit');
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
    const [avatarUploadPhase, setAvatarUploadPhase] = useState(null); // 'Compressing' | 'Uploading' | 'Saving' | null
    const [coverUploadPhase, setCoverUploadPhase] = useState(null); // 'Compressing' | 'Uploading' | 'Saving' | null
    const [usernameStatus, setUsernameStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken'
    const usernameCheckRef = useRef(null);

    // Auto-save debounce ref (5 seconds of inactivity)
    const autoSaveRef = useRef(null);
    const [savePhase, setSavePhase] = useState(null); // 'Validating' | 'Saving' | 'Syncing' | null

    // Undo last save state
    const [undoSnapshot, setUndoSnapshot] = useState(null);
    const undoTimerRef = useRef(null);

    // Toast exit animation
    const [toastExiting, setToastExiting] = useState(false);

    // Auto-dismiss success messages after 3.5 seconds with exit animation
    useEffect(() => {
        if (message && !message.includes('Error')) {
            setToastExiting(false);
            const exitTimer = setTimeout(() => setToastExiting(true), 3000);
            const removeTimer = setTimeout(() => { setMessage(''); setToastExiting(false); }, 3300);
            return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
        }
    }, [message]);

    // Cleanup auto-save + undo timer + username check refs on unmount (prevent ghost timeouts)
    useEffect(() => {
        return () => {
            if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
        };
    }, []);

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

    // HamburgerMenu state
    const [menuOpen, setMenuOpen] = useState(false);
    const menuConfig = getMenuConfig('profile', user, {}, {});

    // Profile fields
    const [profile, setProfile] = useState({
        full_name: '',
        first_name: '',
        last_name: '',
        username: '',
        bio: '',
        city: '',
        state: '',
        country: '',
        phone: '',
        email: '',
        website: '',
        twitter: '',
        instagram: '',
        tiktok: '',
        telegram: '',
        hendon_url: '',
        favorite_game: '',
        favorite_hand: '',
        favorite_hand_type: 'holdem',
        favorite_hand_plo: '',
        home_casino: '',
        birth_year: '',
        birthday: '',
        avatar_url: '',
        cover_photo_url: '', // Cover photo for profile
        cover_photo_position: '50% 50%', // CSS object-position for repositioned cover
        card_back_preference: 'white', // Default to white deck
        // HendonMob scraped data
        hendon_total_cashes: null,
        hendon_total_earnings: null,
        hendon_best_finish: null,
        hendon_biggest_cash: null,
        hendon_last_scraped: null,
    });
    const [originalProfile, setOriginalProfile] = useState(null);
    const [coverEditorOpen, setCoverEditorOpen] = useState(false);

    // ── Unsaved changes warning ──
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (!originalProfile || !profile) return;
            // Compare key fields to detect dirty state
            const fields = ['first_name','last_name','username','bio','city','state','country',
                'phone','email','website','twitter','instagram','tiktok','telegram',
                'hendon_url','favorite_game','favorite_hand','favorite_hand_plo',
                'home_casino','birth_year','birthday','card_back_preference'];
            const isDirty = fields.some(f => String(profile[f] || '') !== String(originalProfile[f] || ''));
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [profile, originalProfile]);

    useEffect(() => {
        
        fetchUser();
    }, []);

    // ── Ctrl+S keyboard shortcut to save ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (!saving && user) {
                    // Trigger save via DOM click to avoid stale closure
                    const saveBtn = document.querySelector('[data-save-btn]');
                    if (saveBtn) saveBtn.click();
                }
            }
            // Escape key closes gallery modals
            if (e.key === 'Escape') {
                if (photoGalleryOpen) setPhotoGalleryOpen(false);
                else if (reelsGalleryOpen) setReelsGalleryOpen(false);
                else if (livesGalleryOpen) setLivesGalleryOpen(false);
                else if (coverEditorOpen) setCoverEditorOpen(false);
                else if (libraryOpen) setLibraryOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saving, user, photoGalleryOpen, reelsGalleryOpen, livesGalleryOpen, coverEditorOpen, libraryOpen]);

    // ── Dirty check helper — detects unsaved changes ──
    const isDirty = (() => {
        if (!originalProfile || !profile) return false;
        const fields = ['first_name','last_name','username','bio','city','state','country',
            'phone','email','website','twitter','instagram','tiktok','telegram',
            'hendon_url','favorite_game','favorite_hand','favorite_hand_plo',
            'home_casino','birth_year','birthday','card_back_preference'];
        return fields.some(f => String(profile[f] || '') !== String(originalProfile[f] || ''));
    })();

    const { fetchUser, handleAvatarUpload, handleCoverPhotoUpload, handleCoverPhotoRemove, handleSave } = useProfileHandlers({
        user, profile, setProfile, originalProfile, setOriginalProfile,
        setMessage, setAvatarUploadPhase, setCoverUploadPhase,
        setSaving, setSavePhase, undoTimerRef, setUndoSnapshot,
        setUserPhotos, setUserReels, setUserLives, setLoading, supabase,
        isDirty, coverEditorOpen, setCoverEditorOpen
    });

    const updateField = (field) => (value) => {
        // Social link auto-formatting: strip URLs and @ prefixes
        const socialFields = { twitter: 'twitter', instagram: 'instagram', tiktok: 'tiktok', telegram: 'telegram' };
        if (socialFields[field]) {
            value = stripSocialHandle(value, socialFields[field]);
        }
        // Username format enforcement: alphanumeric + underscores only (mixed case allowed)
        if (field === 'username' && value) {
            value = value.replace(/[^a-zA-Z0-9_]/g, '');
        }
        setProfile(prev => ({ ...prev, [field]: value }));

        // Auto-save debounce: save after 5 seconds of inactivity (only if dirty)
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(() => {
            // Re-check isDirty at fire time — profile/originalProfile may have changed
            const saveBtn = document.querySelector('[data-save-btn]');
            if (saveBtn && !saveBtn.disabled && saveBtn.textContent.includes('Unsaved')) saveBtn.click();
        }, 5000);

        // Username uniqueness check (debounced)
        if (field === 'username') {
            if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
            const trimmed = (value || '').trim();
            if (!trimmed || trimmed.length < 3) {
                setUsernameStatus('idle');
                return;
            }
            // Skip check if username hasn't changed from original (case-insensitive: KingFish == kingfish is still yours)
            if (originalProfile && trimmed.toLowerCase() === (originalProfile.username || '').trim().toLowerCase()) {
                setUsernameStatus('available');
                return;
            }
            setUsernameStatus('checking');
            usernameCheckRef.current = setTimeout(async () => {
                try {
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                    // Use ilike for case-insensitive duplicate check (KingFish conflicts with kingfish)
                    const res = await fetch(
                        `${supabaseUrl}/rest/v1/profiles?username=ilike.${encodeURIComponent(trimmed)}&select=id`,
                        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${getProfileJwt()}` } }
                    );
                    const data = res.ok ? await res.json() : [];
                    // If the only result is the current user, it's available
                    const takenByOther = data.filter(d => d.id !== user?.id);
                    setUsernameStatus(takenByOther.length > 0 ? 'taken' : 'available');
                } catch {
                    setUsernameStatus('idle');
                }
            }, 500);
        }
    };

    

    

    

    

    if (loading) return <ProfileSkeleton />;
    if (!user) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
            <h2>Please Log In To View Your Profile</h2>
            <Link href="/auth/login" style={{ color: C.blue }}>Log In</Link>
        </div>
    </div>;

    return (
        <>
            <SEOHead
                title="Edit Profile"
                description="Update Your Smarter.Poker Profile Information, Avatar, And Display Settings."
                canonical="/hub/profile-edit"
                noindex={true}
            />
            <div className="profile-page" style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header - Universal Header with Back navigation (nested page) */}
                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="right"
                    theme="dark"
                    user={user}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Cover Photo Area - Clickable to upload */}
                <div
                    onClick={() => coverPhotoRef.current?.click()}
                    style={{
                        height: 200,
                        position: 'relative',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        background: profile.cover_photo_url ? '#0d0d1e' : '#E5E7EB',
                    }}
                >
                    {/* Cover Photo Image with saved position */}
                    {profile.cover_photo_url && (
                        <img
                            src={profile.cover_photo_url}
                            alt="Cover photo"
                            loading="lazy"
                            style={{
                                position: 'absolute', inset: 0, width: '100%', height: '100%',
                                objectFit: 'cover',
                                objectPosition: profile.cover_photo_position || '50% 50%',
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    <input
                        ref={coverPhotoRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleCoverPhotoUpload}
                    />

                    {/* Remove Cover Photo - Top Right (only show if cover exists) */}
                    {profile.cover_photo_url && (
                        <button
                            onClick={handleCoverPhotoRemove}
                            style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                background: 'rgba(0,0,0,0.7)',
                                color: 'white',
                                border: '1px solid rgba(255,255,255,0.3)',
                                padding: '8px 12px',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220,38,38,0.9)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
                        >
                            Remove
                        </button>
                    )}

                    {/* Reposition button - only when cover exists */}
                    {profile.cover_photo_url && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setCoverEditorOpen(true); }}
                            style={{
                                position: 'absolute',
                                bottom: 12,
                                left: 12,
                                background: 'rgba(0,0,0,0.6)',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                border: '1px solid rgba(255,255,255,0.2)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(24,119,242,0.8)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
                        >
                            Reposition
                        </button>
                    )}

                    {/* Add/Change Cover Photo - Bottom Right inside cover */}
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
                        {profile.cover_photo_url ? 'Change Cover' : 'Add Cover Photo'}
                    </div>

                    {/* Cover Upload Progress Overlay */}
                    {coverUploadPhase && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.7)', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '12px 12px 0 0', zIndex: 5,
                        }}>
                            <div style={{
                                width: 40, height: 40, border: '3px solid rgba(255,255,255,0.2)',
                                borderTop: '3px solid #00f5ff', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 10 }}>
                                {coverUploadPhase}...
                            </div>
                        </div>
                    )}

                    {/* Profile Avatar - MOVED outside overflow:hidden container */}
                </div>

                {/* Profile Avatar - overlapping cover photo bottom */}
                <div style={{ position: 'relative', zIndex: 2, marginTop: -60, display: 'flex', justifyContent: 'center' }}>
                    <Avatar src={profile.avatar_url} size={120} onUpload={handleAvatarUpload} uploadPhase={avatarUploadPhase} />
                </div>

                {/* Cover Photo Reposition Editor Modal */}
                {coverEditorOpen && profile.cover_photo_url && (
                    <CoverPhotoEditor
                        imageUrl={profile.cover_photo_url}
                        initialPosition={profile.cover_photo_position || '50% 50%'}
                        coverHeight={200}
                        onCancel={() => setCoverEditorOpen(false)}
                        onSave={async (positionStr) => {
                            // Direct PostgREST fetch — avoids SIGNED_OUT cascade
                            const _posUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                            const _posKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                            const _posJwt = getProfileJwt();

                            try {
                                const posRes = await fetch(`${_posUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                                    method: 'PATCH',
                                    headers: { 'apikey': _posKey, 'Authorization': `Bearer ${_posJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                                    body: JSON.stringify({ cover_photo_position: positionStr, updated_at: new Date().toISOString() }),
                                });
                                if (!posRes.ok) {
                                    const errText = await posRes.text();
                                    setMessage('Error saving position: ' + errText);
                                    return;
                                }
                            } catch (fetchErr) {
                                setMessage('Error saving position: ' + fetchErr.message);
                                console.warn('Reposition fetch error:', fetchErr);
                                return;
                            }
                            setProfile(prev => ({ ...prev, cover_photo_position: positionStr }));
                            setOriginalProfile(prev => ({ ...prev, cover_photo_position: positionStr }));
                            setCoverEditorOpen(false);
                            setMessage('Cover photo position saved!');
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('profile-updated', {
                                    detail: { cover_photo_position: positionStr }
                                }));
                            }
                            try {
                                const cacheKey = `sp-profile-cache-${profile.username}`;
                                localStorage.removeItem(cacheKey);
                                broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                broadcastSync('smarter_poker_avatar_sync', 'refresh');
                            } catch { /* noop */ }
                            busEmit.dataMutated('profile');
                        }}
                    />
                )}

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
                            Reels
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

                    {/* Right side - Share Profile + Build Custom Avatar */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={async () => {
                                const shareUrl = `https://smarter.poker/hub/user/${profile.username || user?.id}`;
                                try {
                                    await navigator.clipboard.writeText(shareUrl);
                                    setMessage('Profile link copied to clipboard!');
                                } catch {
                                    // Fallback for older browsers
                                    const ta = document.createElement('textarea');
                                    ta.value = shareUrl;
                                    document.body.appendChild(ta);
                                    ta.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(ta);
                                    setMessage('Profile link copied to clipboard!');
                                }
                            }}
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
                            Share Profile
                        </button>
                        <button
                            onClick={() => window.open(`/hub/user/${profile.username || user?.id}`, '_blank')}
                            style={{
                                background: 'transparent',
                                color: '#1877F2',
                                border: '1px solid #1877F2',
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(24,119,242,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            View Public Profile
                        </button>
                        <button
                            onClick={() => router.push('/hub/avatars')}
                            style={{
                                background: '#E74C3C',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(231,76,60,0.3)'
                            }}
                        >
                            Build A Custom Avatar
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div style={{ maxWidth: 800, margin: '80px auto 40px', padding: '0 16px' }}>
                    {/* Non-blocking Toast notification */}
                    <Toast message={message} onDismiss={() => { setMessage(''); setToastExiting(false); }} isExiting={toastExiting} />

                    {/* Profile Completion Progress Bar */}
                    <ProfileCompletionBar profile={profile} />

                    {/* Section Jump Navigation */}
                    <SectionNav />

                    {/* Social Stats Row */}
                    <div style={{
                        background: C.card, borderRadius: 12, padding: 16, marginBottom: 16,
                        border: `1px solid ${C.border}`,
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

                    {/* Friends Section - SmarterPoker Style */}
                    {friends.length > 0 && (
                        <div style={{
                            background: C.card, borderRadius: 8, padding: 16, marginBottom: 16,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Friends</h3>
                                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
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
                                {/* eslint-disable @next/next/no-html-link-for-pages */}
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
                                            loading="lazy"
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
                                {/* eslint-enable @next/next/no-html-link-for-pages */}
                            </div>
                        </div>
                    )}

                    {/* Basic Info */}
                    <BasicInfoSection profile={profile} updateField={updateField} setProfile={setProfile} />

                    {/* Location */}
                    <CollapsibleSection id="sec-location" title="Location" icon="📍">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            <ProfileField label="City" value={profile.city} onChange={updateField('city')} placeholder="Las Vegas" maxLength={100} />
                            <ProfileField label="State" value={profile.state} onChange={updateField('state')} placeholder="Nevada" maxLength={100} />
                            <ProfileField label="Country" value={profile.country} onChange={updateField('country')} placeholder="USA" maxLength={100} />
                        </div>
                    </CollapsibleSection>

                    {/* Contact & Social */}
                    <CollapsibleSection id="sec-social" title="Contact & Social" icon="🔗">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="Email" value={profile.email} onChange={updateField('email')} type="email" placeholder="you@example.com" icon="✉️" maxLength={100} />
                            <ProfileField label="Phone" value={profile.phone} onChange={updateField('phone')} type="tel" placeholder="555-123-4567" icon="📱" maxLength={20} />
                            <ProfileField label="Website" value={profile.website} onChange={updateField('website')} placeholder="https://yoursite.com" icon="🌐" maxLength={200} />
                            <ProfileField label="Twitter/X" value={profile.twitter} onChange={updateField('twitter')} placeholder="Username" icon="𝕏" maxLength={100} />
                            <ProfileField label="Instagram" value={profile.instagram} onChange={updateField('instagram')} placeholder="Username" icon="📸" maxLength={100} />
                            <ProfileField label="TikTok" value={profile.tiktok} onChange={updateField('tiktok')} placeholder="Username" icon="🎵" maxLength={100} />
                            <ProfileField label="Telegram" value={profile.telegram} onChange={updateField('telegram')} placeholder="Username" icon="✈️" maxLength={100} />
                        </div>
                    </CollapsibleSection>

                    {/* Card Deck Preference */}
                    <CardDeckPreferenceSection profile={profile} updateField={updateField} />

                    {/* Poker Info */}
                    <PokerInfoSection profile={profile} updateField={updateField} />

                    {/* HendonMob Integration / Poker Resume */}
                    <PokerResumeSection profile={profile} updateField={updateField} saving={saving} setProfile={setProfile} setMessage={setMessage} />

                    {/* View Public Profile Link */}
                    {profile.username && (
                        <div style={{ textAlign: 'center', marginTop: 4, marginBottom: 8 }}>
                            <a
                                href={`/hub/social-media/profile/${profile.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    fontSize: 13, color: '#1877F2', textDecoration: 'none',
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 20,
                                    background: 'rgba(24,119,242,0.06)',
                                    border: '1px solid rgba(24,119,242,0.15)',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(24,119,242,0.12)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(24,119,242,0.06)'; }}
                            >
                                View My Public Profile
                                <span style={{ fontSize: 11 }}>↗</span>
                            </a>
                        </div>
                    )}

                    {/* Save + Discard + Undo Buttons */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        {isDirty && (
                            <button
                                onClick={() => {
                                    if (confirm('Discard all unsaved changes?')) {
                                        setProfile({ ...originalProfile });
                                        setMessage('Changes discarded.');
                                    }
                                }}
                                style={{
                                    flex: '0 0 auto', padding: '16px 24px',
                                    background: 'transparent', color: '#FA383E',
                                    border: '2px solid #FA383E', borderRadius: 8,
                                    fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                Discard Changes
                            </button>
                        )}
                        {undoSnapshot && !isDirty && (
                            <button
                                onClick={async () => {
                                    // Restore snapshot and save to DB
                                    setProfile({ ...undoSnapshot });
                                    setOriginalProfile({ ...undoSnapshot });
                                    setUndoSnapshot(null);
                                    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                                    // Persist undo to database
                                    try {
                                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                                        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                                        const undoToken = getProfileJwt();
                                        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                                            method: 'PATCH',
                                            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${undoToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                                            body: JSON.stringify({
                                                first_name: (undoSnapshot.first_name || '').trim(),
                                                last_name: (undoSnapshot.last_name || '').trim(),
                                                full_name: `${(undoSnapshot.first_name || '').trim()} ${(undoSnapshot.last_name || '').trim()}`.trim(),
                                                username: (undoSnapshot.username || '').trim() || null,
                                                bio: undoSnapshot.bio, city: undoSnapshot.city, state: undoSnapshot.state,
                                                country: undoSnapshot.country, phone: undoSnapshot.phone, email: undoSnapshot.email,
                                                updated_at: new Date().toISOString(),
                                            }),
                                        });
                                        // Full 4-layer sync for undo save
                                        window.dispatchEvent(new CustomEvent('profile-updated', {
                                            detail: {
                                                full_name: `${(undoSnapshot.first_name || '').trim()} ${(undoSnapshot.last_name || '').trim()}`.trim(),
                                                first_name: (undoSnapshot.first_name || '').trim(),
                                                last_name: (undoSnapshot.last_name || '').trim(),
                                                username: undoSnapshot.username,
                                                avatar_url: undoSnapshot.avatar_url,
                                            }
                                        }));
                                        try {
                                            const cacheKey = `sp-profile-cache-${undoSnapshot.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                            broadcastSync('smarter_poker_avatar_sync', 'refresh');
                                        } catch { /* noop */ }
                                        busEmit.dataMutated('profile');
                                        setMessage('Undo successful — previous profile restored.');
                                    } catch (e) {
                                        console.warn('Undo save error:', e);
                                        setMessage('Error: Could not undo. Please try again.');
                                    }
                                }}
                                style={{
                                    flex: '0 0 auto', padding: '16px 24px',
                                    background: 'rgba(255,215,0,0.08)', color: '#FFD700',
                                    border: '2px solid rgba(255,215,0,0.4)', borderRadius: 8,
                                    fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    animation: 'undoPulse 2s ease-in-out infinite',
                                }}
                            >
                                Undo Save
                            </button>
                        )}
                        <button
                            data-save-btn="true"
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                flex: 1, padding: 16,
                                background: isDirty ? 'linear-gradient(135deg, #1877F2, #0E5FC7)' : C.blue,
                                color: 'white',
                                border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
                                cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                                boxShadow: isDirty ? '0 4px 15px rgba(24,119,242,0.4)' : 'none',
                                transition: 'all 0.3s ease',
                                position: 'relative'
                            }}
                        >
                            {saving
                                ? (savePhase ? `${savePhase}...` : 'Saving...')
                                : isDirty ? 'Save Profile (Unsaved Changes)' : 'Save Profile'
                            }
                        </button>
                    </div>
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
            <PhotoGalleryModal isOpen={photoGalleryOpen} onClose={() => setPhotoGalleryOpen(false)} userPhotos={userPhotos} />

            {/* Reels Gallery Modal */}
            <ReelsGalleryModal isOpen={reelsGalleryOpen} onClose={() => setReelsGalleryOpen(false)} userReels={userReels} />

            {/* Lives Gallery Modal */}
            <LivesGalleryModal isOpen={livesGalleryOpen} onClose={() => setLivesGalleryOpen(false)} userLives={userLives} user={user} setUserLives={setUserLives} setMessage={setMessage} />
            {/* Global CSS keyframes for toast and avatar spinner */}
            <style>{`
                @keyframes toastSlideIn {
                    from { opacity: 0; transform: translateX(60px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes toastSlideOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(60px); }
                }
                @keyframes undoPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(255,215,0,0.3); }
                    50% { box-shadow: 0 0 12px 4px rgba(255,215,0,0.15); }
                }
                @keyframes avatarSpin {
                    to { transform: rotate(360deg); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                /* Mobile responsive grids */
                @media (max-width: 600px) {
                    .profile-page [style*="grid-template-columns: repeat(2"] {
                        grid-template-columns: 1fr !important;
                    }
                    .profile-page [style*="grid-template-columns: repeat(3"] {
                        grid-template-columns: 1fr !important;
                    }
                    .profile-page [style*="grid-template-columns: repeat(4"] {
                        grid-template-columns: repeat(2, 1fr) !important;
                    }
                }
            `}</style>
        </>
    );
}
