import { getProfileJwt, compressImage } from './utils';
import { getAccessToken, getAuthUser } from '../../../src/lib/authUtils';
import { MAX_UPLOAD_SIZE } from './constants';
import { busEmit } from '../../../src/engine/EventBus';
import { broadcastSync } from '../../../src/lib/broadcastSync';
import { claimReward } from '../../../src/lib/claimReward';

export function useProfileHandlers({
    user, setUser, profile, setProfile, originalProfile, setOriginalProfile,
    setMessage, setCoverUploadPhase,
    setSaving, setSavePhase, undoTimerRef, undoSnapshot, setUndoSnapshot,
    setUserPhotos, setUserReels, setUserLives, setLoading, supabase,
    setSocialStats, setFriends, usernameStatus,
    isDirty, coverEditorOpen, setCoverEditorOpen
}) {

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

/**
 * handleAvatarUpload was removed 2026-08-21 (Dan: "they can now only use
 * avatars").
 *
 * It compressed a photo, requested a signed URL for `social-media/avatars/`,
 * PATCHed profiles.avatar_url, POSTed a metadata sync so the OAuth copy matched,
 * and claimed a "Profile Picture Uploaded" diamonds reward. It also set
 * user_avatars.is_active = false, deliberately demoting whatever avatar the
 * player had chosen so the photo would win — which is the line that makes this
 * a genuine product removal and not just a dead endpoint.
 *
 * Players change their avatar at /hub/avatars now. The rule is enforced in
 * Club Arena AvatarService.isLibraryAvatarUrl at the write point, because a
 * removed component still exists in every cached bundle.
 */

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

    return { fetchUser, handleCoverPhotoUpload, handleCoverPhotoRemove, handleSave };
}
