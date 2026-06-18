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
        const fetchUser = async () => {
            try {
                const authUser = getAuthUser();

                if (authUser) {
                    setUser(authUser);
                    // Fetch profile using native fetch to avoid AbortError
                    try {
                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

                        // Use user JWT for profile read (respects RLS) — fallback to anon key
                        const loadToken = getProfileJwt();

                        // Profile read uses the get_my_full_profile() RPC because
                        // direct table SELECT of phone/email is blocked at column
                        // level for non-service-role callers. The RPC runs
                        // SECURITY DEFINER + auth.uid() so it can only ever
                        // return THIS user's row.
                        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_my_full_profile`, {
                            method: 'POST',
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${loadToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: '{}'
                        });

                        if (response.ok) {
                            const profiles = await response.json();
                            const profileData = Array.isArray(profiles) ? profiles[0] : profiles;
                            if (profileData) {
                                // Parse full_name into first_name/last_name if those columns are empty
                                if (!profileData.first_name && !profileData.last_name && profileData.full_name) {
                                    const parts = profileData.full_name.trim().split(/\s+/);
                                    profileData.first_name = parts[0] || '';
                                    profileData.last_name = parts.slice(1).join(' ') || '';
                                }
                                setProfile(prev => ({ ...prev, ...profileData }));
                                setOriginalProfile(profileData);
                            }
                        }

                        // Fetch social stats and friends
                        const headers = {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${loadToken}`,
                            'Content-Type': 'application/json'
                        };

                        // ── Parallel fetch: all social data at once (60% faster) ──
                        const [friendsRes, followersRes, followingRes, postsRes, photosRes, reelsRes, livesRes] = await Promise.all([
                            fetch(`${supabaseUrl}/rest/v1/friendships?or=(user_id.eq.${authUser.id},friend_id.eq.${authUser.id})&status=eq.accepted&select=user_id,friend_id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/follows?following_id=eq.${authUser.id}&select=id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/follows?follower_id=eq.${authUser.id}&select=id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&select=id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&content_type=eq.photo&order=created_at.desc&limit=50&select=id,media_urls,content,created_at`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&content_type=eq.video&order=created_at.desc&limit=50&select=id,media_urls,content,created_at`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/live_streams?broadcaster_id=eq.${authUser.id}&status=eq.ended&order=created_at.desc&limit=50&select=id,title,video_url,thumbnail_url,is_draft,is_posted,viewer_count,started_at,ended_at,created_at`, { headers }),
                        ]);

                        const friendsData = friendsRes.ok ? await friendsRes.json() : [];
                        const followersData = followersRes.ok ? await followersRes.json() : [];
                        const followingData = followingRes.ok ? await followingRes.json() : [];
                        const postsData = postsRes.ok ? await postsRes.json() : [];

                        // Deduplicate bidirectional friendship rows to get the true friend count
                        const uniqueFriendIds = new Set(friendsData.map(f => f.user_id === authUser.id ? f.friend_id : f.user_id));

                        setSocialStats({
                            friends: uniqueFriendIds.size,
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
                            setFriends(friendProfiles.map(f => ({ ...f, mutualCount: 0 })));
                        }

                        // Photos
                        const photosData = photosRes.ok ? await photosRes.json() : [];
                        setUserPhotos(photosData.flatMap(post =>
                            (post.media_urls || []).map((url, idx) => ({
                                id: `${post.id}-${idx}`, media_url: url, content: post.content, created_at: post.created_at
                            }))
                        ));

                        // Reels
                        const reelsData = reelsRes.ok ? await reelsRes.json() : [];
                        setUserReels(reelsData.flatMap(post =>
                            (post.media_urls || []).map((url, idx) => ({
                                id: `${post.id}-${idx}`, media_url: url, content: post.content, created_at: post.created_at
                            }))
                        ));

                        // Lives
                        const livesData = livesRes.ok ? await livesRes.json() : [];
                        setUserLives(livesData);
                    } catch (e) {
                        console.warn('[Profile] Error fetching profile:', e);
                    }
                }
            } catch (e) {
                console.warn('[Profile] Auth error:', e);
            }
            setLoading(false);
        };
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

    const handleAvatarUpload = async (file) => {
        if (!user) return;
        if (file.size > MAX_UPLOAD_SIZE) {
            setMessage('Error: Image too large (max 5MB). Please choose a smaller image.');
            return;
        }

        // Phase 1: Compress
        setAvatarUploadPhase('Compressing');
        const compressed = await compressImage(file, 800, 0.85);

        // Phase 2: Upload via signed-URL proxy (avoids SDK auth lock + uses service role)
        setAvatarUploadPhase('Uploading');
        const avatarToken = getAccessToken();
        const avatarMetaRes = await fetch('/api/social/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${avatarToken}` },
            body: JSON.stringify({
                fileName: `avatar_${Date.now()}.${compressed.name.split('.').pop() || 'jpg'}`,
                fileSize: compressed.size,
                mimeType: compressed.type || 'image/jpeg',
                folder: 'avatars',
                prefix: user.id,
            }),
        });
        if (!avatarMetaRes.ok) {
            setAvatarUploadPhase(null);
            setMessage('Error getting upload URL: ' + avatarMetaRes.status);
            return;
        }
        const avatarMeta = await avatarMetaRes.json();
        if (!avatarMeta.success || !avatarMeta.signedUrl) {
            setAvatarUploadPhase(null);
            setMessage('Error uploading avatar: ' + (avatarMeta.error || 'No signed URL'));
            return;
        }

        const avatarPutRes = await fetch(avatarMeta.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': compressed.type || 'image/jpeg' },
            body: compressed,
        });
        if (!avatarPutRes.ok) {
            setAvatarUploadPhase(null);
            setMessage('Error uploading avatar: HTTP ' + avatarPutRes.status);
            return;
        }

        const publicUrl = avatarMeta.publicUrl;

        // Phase 3: Save to database
        setAvatarUploadPhase('Saving');
        const _supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const _supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const _avatarToken = getProfileJwt();

        try {
            const avatarRes = await fetch(`${_supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _supabaseKey, 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ avatar_url: publicUrl, updated_at: new Date().toISOString() }),
            });
            if (!avatarRes.ok) {
                const errText = await avatarRes.text();
                setAvatarUploadPhase(null);
                setMessage('Error saving avatar: ' + errText);
                console.warn('Save error:', errText);
                return;
            }

            // ── DEACTIVATE AI/PRESET AVATARS ──
            // If the user manually uploaded a photo, it should override any AI or preset avatars.
            await fetch(`${_supabaseUrl}/rest/v1/user_avatars?user_id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _supabaseKey, 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
            });
        } catch (fetchErr) {
            setAvatarUploadPhase(null);
            setMessage('Error saving avatar: ' + fetchErr.message);
            return;
        }

        // ── UPDATE AUTH METADATA ──
        try {
            const mdRes = await fetch('/api/auth/update-metadata', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ metadata: { avatar_url: publicUrl } })
            });
            if (!mdRes.ok) console.warn('[Avatar Upload] Non-fatal error syncing auth metadata:', await mdRes.text());
        } catch (mdErr) {
            console.warn('[Avatar Upload] Failed to update auth metadata:', mdErr);
        }

        setAvatarUploadPhase(null);
        setProfile(prev => ({ ...prev, avatar_url: publicUrl }));

        // ── CRITICAL: Dispatch bus event so header updates in real-time ──
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('profile-updated', {
                detail: { avatar_url: publicUrl }
            }));
        }

        // ── CACHE: Invalidate profile cache + notify other tabs ──
        try {
            const cacheKey = `sp-profile-cache-${profile.username}`;
            localStorage.removeItem(cacheKey);
            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
            broadcastSync('smarter_poker_avatar_sync', 'refresh');
        } catch { /* noop */ }
        busEmit.dataMutated('profile');

        // Award profile pic diamonds (fire-and-forget, 10 one-time)
        claimReward('/api/rewards/profile-pic', { userId: user.id }, 'Profile Picture Uploaded');
        setMessage('Avatar saved!');
        setOriginalProfile(prev => ({ ...prev, avatar_url: publicUrl }));
    };

    const handleCoverPhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // Reset input so same file can be re-selected
        if (!file || !user) return;
        if (file.size > MAX_UPLOAD_SIZE) {
            setMessage('Error: Cover photo too large (max 5MB). Please choose a smaller image.');
            return;
        }

        setCoverUploadPhase('Compressing');

        try {
            // Compress before upload (max 1600px wide)
            const compressed = await compressImage(file, 1600, 0.85);

            // Replace file reference with compressed version
            const uploadFile = compressed;
            setCoverUploadPhase('Uploading');
            // Use the server-side upload proxy (service role key) to bypass storage RLS
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('folder', 'covers');
            formData.append('prefix', user.id);

            const _coverToken = getAccessToken();
            const uploadRes = await fetch('/api/social/upload', {
                method: 'POST',
                headers: _coverToken ? { Authorization: `Bearer ${_coverToken}` } : {},
                body: formData,
            });
            // HIGH FIX #2j: Add response.ok check before .json()
            if (!uploadRes.ok) {
                const errorText = await uploadRes.text().catch(() => 'Unknown error');
                throw new Error(`HTTP ${uploadRes.status}: ${errorText}`);
            }
            const uploadJson = await uploadRes.json();

            if (!uploadJson.success || !uploadJson.url) {
                throw new Error(uploadJson.error || 'Upload failed');
            }

            const publicUrl = uploadJson.url;
            setCoverUploadPhase('Saving');

            // Update database — direct PostgREST (avoids SIGNED_OUT cascade)
            const _coverUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const _coverKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            const _coverJwt = getProfileJwt();

            const coverSaveRes = await fetch(`${_coverUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _coverKey, 'Authorization': `Bearer ${_coverJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ cover_photo_url: publicUrl, updated_at: new Date().toISOString() }),
            });
            if (!coverSaveRes.ok) {
                const errText = await coverSaveRes.text();
                setCoverUploadPhase(null);
                setMessage('Error saving cover photo: ' + errText);
                console.warn('Save error:', errText);
                return;
            }

            setCoverUploadPhase(null);
            setProfile(prev => ({ ...prev, cover_photo_url: publicUrl, cover_photo_position: '50% 50%' }));
            setOriginalProfile(prev => ({ ...prev, cover_photo_url: publicUrl, cover_photo_position: '50% 50%' }));
            setMessage('Cover photo uploaded! Drag to reposition.');
            setCoverEditorOpen(true);

            // ── CRITICAL: Dispatch bus event so profile page updates in real-time ──
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('profile-updated', {
                    detail: { cover_photo_url: publicUrl }
                }));
            }

            // ── CACHE: Invalidate profile cache + notify other tabs ──
            try {
                const cacheKey = `sp-profile-cache-${profile.username}`;
                localStorage.removeItem(cacheKey);
                broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                broadcastSync('smarter_poker_avatar_sync', 'refresh');
            } catch { /* noop */ }
            busEmit.dataMutated('profile');
        } catch (error) {
            setCoverUploadPhase(null);
            setMessage('Error uploading cover photo: ' + error.message);
            console.warn('Upload error:', error);
        }
    };

    const handleCoverPhotoRemove = async (e) => {
        e.stopPropagation(); // Prevent triggering the upload click
        if (!user || !profile.cover_photo_url) return;

        // Confirm removal
        if (!confirm('Remove cover photo?')) return;

        setMessage('Removing cover photo...');

        // Try to delete from storage — detect bucket from URL
        try {
            const url = profile.cover_photo_url;
            if (url.includes('/social-media/')) {
                // New uploads via /api/social/upload go to social-media bucket
                const pathMatch = url.split('/social-media/')[1];
                if (pathMatch) {
                    await supabase.storage.from('social-media').remove([pathMatch]);
                }
            } else if (url.includes('/avatars/')) {
                // Legacy uploads went to avatars bucket
                const pathMatch = url.split('/avatars/')[1];
                if (pathMatch) {
                    await supabase.storage.from('avatars').remove([pathMatch]);
                }
            }
        } catch (deleteErr) {
            console.warn('Storage delete error (may not exist):', deleteErr);
            // Continue anyway - file might already be deleted
        }

        // Update database to remove URL — direct PostgREST (avoids SIGNED_OUT cascade)
        const _rmUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const _rmKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const _rmJwt = getProfileJwt();

        try {
            const rmRes = await fetch(`${_rmUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _rmKey, 'Authorization': `Bearer ${_rmJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ cover_photo_url: null, cover_photo_position: '50% 50%', updated_at: new Date().toISOString() }),
            });
            if (!rmRes.ok) {
                const errText = await rmRes.text();
                setMessage('Error removing cover photo: ' + errText);
                console.warn('Update error:', errText);
                return;
            }
        } catch (fetchErr) {
            setMessage('Error removing cover photo: ' + fetchErr.message);
            console.warn('Cover remove fetch error:', fetchErr);
            return;
        }

        setProfile(prev => ({ ...prev, cover_photo_url: null, cover_photo_position: '50% 50%' }));
        setOriginalProfile(prev => ({ ...prev, cover_photo_url: null, cover_photo_position: '50% 50%' }));
        setMessage('Cover photo removed!');

        // ── CRITICAL: Dispatch bus event so profile page updates in real-time ──
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('profile-updated', {
                detail: { cover_photo_url: null, cover_photo_position: '50% 50%' }
            }));
        }

        // ── CACHE: Invalidate profile cache + notify other tabs ──
        try {
            const cacheKey = `sp-profile-cache-${profile.username}`;
            localStorage.removeItem(cacheKey);
            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
            broadcastSync('smarter_poker_avatar_sync', 'refresh');
        } catch { /* noop */ }
        busEmit.dataMutated('profile');
    };

    const handleSave = async () => {
        if (!user) return;
        if (usernameStatus === 'taken') {
            setMessage('Error: Username is already taken. Please choose a different username.');
            return;
        }
        // Email format validation
        if (profile.email && profile.email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(profile.email.trim())) {
                setMessage('Error: Please enter a valid email address.');
                return;
            }
        }
        // HendonMob URL format validation
        if (profile.hendon_url && profile.hendon_url.trim()) {
            const url = profile.hendon_url.trim().toLowerCase();
            if (!url.includes('hendonmob.com') && !url.includes('pokerdb.')) {
                setMessage('Error: HendonMob URL must be from thehendonmob.com or pokerdb.thehendonmob.com');
                return;
            }
        }
        setSaving(true);
        setMessage('');
        setSavePhase('Validating');

        // ── CRITICAL: Use direct PostgREST fetch — NOT supabase.update() ──
        // supabase.update() triggers autoRefreshToken → if refresh fails → SIGNED_OUT event
        // → authGuard clears session → user gets logged out. Direct fetch avoids this cascade.
        // The global fetch interceptor in _app.js auto-injects JWT for auth.
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const updatePayload = {
            full_name: `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim(),
            display_name: `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim() || (profile.username || '').trim() || null,
            first_name: (profile.first_name || '').trim(),
            last_name: (profile.last_name || '').trim(),
            username: (profile.username || '').trim() || null,
            alias: (profile.username || '').trim() || null,
            bio: profile.bio,
            city: profile.city,
            state: profile.state,
            country: profile.country,
            phone: profile.phone,
            email: profile.email,
            website: profile.website,
            twitter: profile.twitter,
            instagram: profile.instagram,
            tiktok: profile.tiktok,
            telegram: profile.telegram,
            hendon_url: profile.hendon_url,
            favorite_game: profile.favorite_game,
            favorite_hand: profile.favorite_hand,
            favorite_hand_type: profile.favorite_hand_type || 'holdem',
            favorite_hand_plo: profile.favorite_hand_plo || '',
            home_casino: profile.home_casino,
            birth_year: profile.birth_year ? parseInt(profile.birth_year, 10) || null : null,
            birthday: (() => {
                const b = profile.birthday;
                if (!b) return null;
                const parts = b.split('-');
                // Only save if all 3 parts (year, month, day) are present, non-empty, and numeric
                if (parts.length === 3 && parts[0] && parts[1] && parts[2] &&
                    /^\d{4}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{1,2}$/.test(parts[2])) {
                    return b;
                }
                return null;
            })(),
            avatar_url: profile.avatar_url,
            cover_photo_url: profile.cover_photo_url,
            cover_photo_position: profile.cover_photo_position || '50% 50%',
            card_back_preference: profile.card_back_preference,
            updated_at: new Date().toISOString(),
        };

        // Get user's JWT from localStorage for authenticated write
        const userToken = getProfileJwt();

        setSavePhase('Saving');
        let error = null;
        try {
            const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify(updatePayload),
            });
            if (!res.ok) {
                const errBody = await res.text();
                error = { message: `HTTP ${res.status}: ${errBody}` };
            }
        } catch (fetchErr) {
            error = { message: fetchErr.message };
        }

        // ── UPDATE AUTH METADATA ──
        if (!error) {
            try {
                const mdRes = await fetch('/api/auth/update-metadata', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        metadata: {
                            poker_alias: (profile.username || '').trim() || null,
                            full_name: `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim(),
                            avatar_url: profile.avatar_url || null
                        }
                    })
                });
                if (!mdRes.ok) {
                    console.warn('[Profile Edit] Non-fatal error syncing auth metadata:', await mdRes.text());
                }
            } catch (mdErr) {
                console.warn('[Profile Edit] Failed to update auth metadata:', mdErr);
            }
        }

        if (error) {
            setSaving(false);
            setSavePhase(null);
            setMessage(`Error saving profile: ${error.message || error.code || JSON.stringify(error)}`);
            console.warn('Profile save error:', error);
        } else {
            setSavePhase('Syncing');
            // ── UNDO: Store snapshot before overwriting originalProfile ──
            setUndoSnapshot({ ...originalProfile });
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 10000);

            // ── OPTIMISTIC: Update originalProfile immediately (already succeeded) ──
            setOriginalProfile({ ...profile });

            // Fire Phase 2 diamond reward claims (fire-and-forget with toast)
            if (profile.avatar_url) {
                claimReward('/api/rewards/profile-pic', { userId: user.id }, 'Profile Picture Uploaded');
            }
            if (profile.hendon_url && profile.hendon_url.trim().length >= 5) {
                claimReward('/api/rewards/hendonmob-link', { userId: user.id }, 'HendonMob Profile Linked');
            }
            if (profile.avatar_url && profile.bio && profile.username) {
                claimReward('/api/rewards/profile-complete', { userId: user.id }, 'Profile Completed');
            }

            // ── CRITICAL: Dispatch bus event so header updates in real-time ──
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('profile-updated', {
                    detail: {
                        full_name: `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim(),
                        first_name: (profile.first_name || '').trim(),
                        last_name: (profile.last_name || '').trim(),
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                    }
                }));
            }
            busEmit.dataMutated('profile');

            // ── CACHE: Invalidate profile cache + avatar sync ──
            try {
                const cacheKey = `sp-profile-cache-${profile.username}`;
                localStorage.removeItem(cacheKey);
                
                // ALSO update the username cache used by UniversalHeader & ProfileRedirect
                localStorage.setItem('sp-profile-username', JSON.stringify({
                    userId: user.id,
                    username: profile.username,
                    ts: Date.now()
                }));
                
                broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                broadcastSync('smarter_poker_avatar_sync', 'refresh');
            } catch { /* noop */ }

            setSaving(false);
            setSavePhase(null);
            // Show success toast (non-blocking)
            setMessage(undoSnapshot ? 'Profile saved! Tap to Undo (10s)' : 'Profile saved successfully!');
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
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
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
                    <CollapsibleSection id="sec-basic" title="Basic Information" icon="👤">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="First Name" value={profile.first_name} onChange={updateField('first_name')} placeholder="John" icon="📛" maxLength={50} />
                            <ProfileField label="Last Name" value={profile.last_name} onChange={updateField('last_name')} placeholder="Doe" icon="📛" maxLength={50} />
                            <div>
                                <ProfileField
                                    label="Username"
                                    value={profile.username}
                                    onChange={updateField('username')}
                                    placeholder="@JohnDoe"
                                    icon="@"
                                    maxLength={30}
                                    suffix={usernameStatus === 'checking' ? '⟳' : usernameStatus === 'available' ? '✅' : usernameStatus === 'taken' ? '❌' : null}
                                />
                                {/* Username validation label */}
                                {usernameStatus !== 'idle' && (
                                    <div style={{
                                        fontSize: 11, fontWeight: 600, marginTop: -12, marginBottom: 8, paddingLeft: 2,
                                        color: usernameStatus === 'available' ? '#42B72A'
                                            : usernameStatus === 'taken' ? '#FA383E'
                                            : '#888'
                                    }}>
                                        {usernameStatus === 'checking' && 'Checking availability...'}
                                        {usernameStatus === 'available' && 'Username is available'}
                                        {usernameStatus === 'taken' && 'Username is already taken'}
                                    </div>
                                )}
                            </div>
                        </div>
                        <ProfileField label="Bio" value={profile.bio} onChange={updateField('bio')} type="textarea" placeholder="Tell Us About Yourself And Your Poker Journey..." icon="" maxLength={500} showCount />

                        {/* Profile Picture History */}
                        <ProfilePictureHistory
                            userId={user?.id}
                            supabase={supabase}
                            onViewAll={() => setLibraryOpen(true)}
                            limit={6}
                            onPictureRestored={async (item) => {
                                const newUrl = item.thumbnail_url || item.public_url;
                                try {
                                    // 1. Sync Auth Metadata
                                    const _avatarToken = getProfileJwt();
                                    await fetch('/api/auth/update-metadata', {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ metadata: { avatar_url: newUrl } })
                                    });

                                    // 2. Update local state
                                    setProfile(prev => ({ ...prev, avatar_url: newUrl }));
                                    setOriginalProfile(prev => ({ ...prev, avatar_url: newUrl }));
                                    
                                    // 3. Dispatch event for header/identity update
                                    window.dispatchEvent(new CustomEvent('profile-updated', {
                                        detail: { avatar_url: newUrl }
                                    }));
                                    
                                    setMessage('Profile picture restored!');
                                } catch (err) {
                                    setMessage('Error syncing restored picture: ' + err.message);
                                }
                            }}
                        />
                    </CollapsibleSection>

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
                    <CollapsibleSection id="sec-cards" title="Card Deck Preference" icon="🎴">
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
                                        border: profile.card_back_preference === deck ? '3px solid #FFD700' : `2px solid ${C.border}`,
                                        padding: 8,
                                        textAlign: 'center',
                                        transition: 'all 0.2s ease',
                                        background: profile.card_back_preference === deck ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                                        boxShadow: profile.card_back_preference === deck ? '0 0 15px rgba(255, 215, 0, 0.3)' : 'none'
                                    }}
                                >
                                    <img
                                        src={`/images/card-backs/${deck}.png`}
                                        alt={`${deck} deck`}
                                        loading="lazy"
                                        style={{
                                            width: '100%',
                                            aspectRatio: '2.5 / 3.5',
                                            objectFit: 'cover',
                                            borderRadius: 6,
                                            marginBottom: 8,
                                            background: deck === 'white' ? '#f0f0f0' : deck === 'black' ? '#1a1a1a' : 'transparent'
                                        }}
                                    />
                                    <div style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: profile.card_back_preference === deck ? C.gold : C.textSec,
                                        textTransform: 'uppercase'
                                    }}>
                                        {profile.card_back_preference === deck && ' '}
                                        {deck}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CollapsibleSection>

                    {/* Poker Info */}
                    <CollapsibleSection id="sec-poker" title="Poker Info" icon="♠️">
                        <ProfileField label="Favorite Game" value={profile.favorite_game} onChange={updateField('favorite_game')} placeholder="No Limit Hold'em" icon="" />

                        {/* Birthday — Dropdown Selectors */}
                        <div style={{ marginTop: 16 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>🎂 Birthday</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <select
                                    value={profile.birthday ? profile.birthday.split('-')[1] : ''}
                                    onChange={(e) => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const month = e.target.value;
                                        const year = parts[0] || '';
                                        let day = parts[2] || '';
                                        // Auto-clamp day if new month has fewer days
                                        if (day && month) {
                                            const max = getDaysInMonth(month, year);
                                            if (parseInt(day, 10) > max) day = String(max).padStart(2, '0');
                                        }
                                        updateField('birthday')(month && year && day ? `${year}-${month}-${day}` : (month || year || day ? `${year}-${month}-${day}` : ''));
                                    }}
                                    style={{
                                        flex: 1, padding: 12, fontSize: 15, borderRadius: 8,
                                        border: `1px solid ${C.border}`, background: '#ffffff',
                                        color: '#000000', boxSizing: 'border-box', cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Month</option>
                                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={profile.birthday ? profile.birthday.split('-')[2] : ''}
                                    onChange={(e) => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const day = e.target.value;
                                        const year = parts[0] || '';
                                        const month = parts[1] || '';
                                        updateField('birthday')(month && year && day ? `${year}-${month}-${day}` : (month || year || day ? `${year}-${month}-${day}` : ''));
                                    }}
                                    style={{
                                        width: 80, padding: 12, fontSize: 15, borderRadius: 8,
                                        border: `1px solid ${C.border}`, background: '#ffffff',
                                        color: '#000000', boxSizing: 'border-box', cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Day</option>
                                    {(() => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const maxDay = getDaysInMonth(parts[1], parts[0]);
                                        return Array.from({ length: maxDay }, (_, i) => (
                                            <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{i + 1}</option>
                                        ));
                                    })()}
                                </select>
                                <select
                                    value={profile.birthday ? profile.birthday.split('-')[0] : ''}
                                    onChange={(e) => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const year = e.target.value;
                                        const month = parts[1] || '';
                                        const day = parts[2] || '';
                                        updateField('birthday')(month && year && day ? `${year}-${month}-${day}` : (month || year || day ? `${year}-${month}-${day}` : ''));
                                    }}
                                    style={{
                                        width: 100, padding: 12, fontSize: 15, borderRadius: 8,
                                        border: `1px solid ${C.border}`, background: '#ffffff',
                                        color: '#000000', boxSizing: 'border-box', cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Year</option>
                                    {Array.from({ length: 80 }, (_, i) => {
                                        const yr = new Date().getFullYear() - 16 - i;
                                        return <option key={yr} value={String(yr)}>{yr}</option>;
                                    })}
                                </select>
                                {profile.birthday && (
                                    <div style={{ fontSize: 12, color: C.gold, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        💎 300
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 4, opacity: 0.7 }}>
                                Earn 300 diamonds on your birthday (accounts must be 60+ days old)
                            </div>
                        </div>

                        {/* Home Casino - Venue Autocomplete */}
                        <div style={{ marginTop: 16 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>🏨 Home Casino</label>
                            <HomeCasinoSelector
                                value={profile.home_casino}
                                onChange={(name) => updateField('home_casino')(name)}
                            />
                        </div>

                        <FavoriteHandPicker
                            value={profile.favorite_hand}
                            gameType="holdem"
                            onChangeValue={updateField('favorite_hand')}
                        />
                        <FavoriteHandPicker
                            value={profile.favorite_hand_plo}
                            gameType="plo"
                            onChangeValue={updateField('favorite_hand_plo')}
                        />
                    </CollapsibleSection>

                    {/* HendonMob Integration / Poker Resume */}
                    <CollapsibleSection id="sec-resume" title="Poker Resume" icon="🏆">
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
                                biggest_cash: profile.hendon_biggest_cash,
                            }}
                            onRefresh={async () => {
                                if (!profile.hendon_url) {
                                    setMessage('Please enter your Hendon Mob URL first');
                                    return;
                                }

                                setIsRefreshing(true);
                                setMessage('🔄 Checking for updated stats...');
                                try {
                                    const _syncToken = getAccessToken();

                                    // Step 1: Try reading from DB (Scrapling may have already synced)
                                    const dbRes = await fetch('/api/hendonmob/sync', {
                                        method: 'GET',
                                        headers: {
                                            ...(_syncToken ? { 'Authorization': `Bearer ${_syncToken}` } : {}),
                                        },
                                    });
                                    const dbData = await dbRes.json();

                                    if (dbRes.ok && dbData.success && (dbData.total_cashes != null || dbData.total_earnings != null)) {
                                        // DB has data — use it
                                        setProfile(prev => ({
                                            ...prev,
                                            hendon_total_cashes: dbData.total_cashes,
                                            hendon_total_earnings: dbData.total_earnings,
                                            hendon_biggest_cash: dbData.biggest_cash,
                                        }));
                                        busEmit.dataMutated('profile');
                                        // Dispatch profile-updated + cache invalidation for cross-tab sync
                                        if (typeof window !== 'undefined') {
                                            window.dispatchEvent(new CustomEvent('profile-updated', {
                                                detail: { hendon_total_cashes: dbData.total_cashes, hendon_total_earnings: dbData.total_earnings }
                                            }));
                                        }
                                        try {
                                            const cacheKey = `sp-profile-cache-${profile.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                        } catch { /* noop */ }
                                        setMessage('✅ Stats refreshed successfully!');
                                        setIsRefreshing(false);
                                        return;
                                    }

                                    // Step 2: No data in DB yet (new user) — prompt manual entry
                                    setMessage('📋 No synced stats found. Opening your HendonMob page...');
                                    window.open(profile.hendon_url, '_blank');
                                    await new Promise(r => setTimeout(r, 800));

                                    const earningsInput = window.prompt(
                                        'Your HendonMob page is open in a new tab.\n\nEnter your Total Live Earnings from that page (numbers only, e.g. 900957):',
                                        ''
                                    );
                                    if (earningsInput === null) { setIsRefreshing(false); return; }

                                    const cashesInput = window.prompt(
                                        'Now enter your Total Cashes count:',
                                        ''
                                    );
                                    if (cashesInput === null) { setIsRefreshing(false); return; }

                                    const biggestInput = window.prompt(
                                        'Enter your Best Live Cash amount (numbers only, e.g. 252020):\n\n(Leave blank if unsure)',
                                        ''
                                    );

                                    const totalEarnings = parseFloat(String(earningsInput).replace(/[^0-9.]/g, '')) || null;
                                    const totalCashes = parseInt(String(cashesInput).replace(/[^0-9]/g, ''), 10) || null;
                                    const biggestCash = biggestInput ? parseFloat(String(biggestInput).replace(/[^0-9.]/g, '')) : null;

                                    if (!totalCashes && !totalEarnings) {
                                        setMessage('No valid stats entered. Please try again.');
                                        setIsRefreshing(false);
                                        return;
                                    }

                                    // Save to DB via POST
                                    const postRes = await fetch('/api/hendonmob/sync', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            ...(_syncToken ? { 'Authorization': `Bearer ${_syncToken}` } : {}),
                                        },
                                        body: JSON.stringify({
                                            hendonUrl: profile.hendon_url,
                                            stats: { totalCashes, totalEarnings, biggestCash }
                                        })
                                    });
                                    const postData = await postRes.json();

                                    if (postRes.ok && postData.success) {
                                        setProfile(prev => ({
                                            ...prev,
                                            hendon_total_cashes: postData.total_cashes,
                                            hendon_total_earnings: postData.total_earnings,
                                            hendon_biggest_cash: postData.biggest_cash,
                                        }));
                                        busEmit.dataMutated('profile');
                                        // Dispatch profile-updated + cache invalidation for cross-tab sync
                                        if (typeof window !== 'undefined') {
                                            window.dispatchEvent(new CustomEvent('profile-updated', {
                                                detail: { hendon_total_cashes: postData.total_cashes, hendon_total_earnings: postData.total_earnings }
                                            }));
                                        }
                                        try {
                                            const cacheKey = `sp-profile-cache-${profile.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                        } catch { /* noop */ }
                                        setMessage('✅ Stats saved successfully! Your Poker Resume is now live.');
                                    } else {
                                        setMessage(`❌ ${postData.error || 'Could not save stats.'}`);
                                    }
                                } catch (e) {
                                    console.warn('Sync error:', e);
                                    setMessage('❌ Error syncing stats. Please try again.');
                                }
                                setIsRefreshing(false);
                            }}
                            isRefreshing={isRefreshing}
                        />
                    </CollapsibleSection>

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
