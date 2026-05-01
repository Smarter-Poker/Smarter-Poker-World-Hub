/**
 * /hub/social-media/compose — multi-screen FB-style upload flow.
 *
 * Renders one of three screens based on the compose store's `step` field:
 *   1. picker  → AlbumPicker
 *   2. edit    → EditPostScreen
 *   3. cover   → CoverFramePicker
 *
 * The Post-now action lifts the upload-and-publish workflow out of
 * SharedPostCreator's handlePost (which still serves the inline composer
 * on /hub/social-media for desktop users).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useComposeStore } from '../../../src/stores/composeStore';
import { supabase } from '../../../src/lib/supabase';
import { getAccessToken, getAuthUser } from '../../../src/lib/authUtils';
import bgUpload from '../../../src/lib/backgroundVideoUpload';
import { busEmit } from '../../../src/engine/EventBus';
import { broadcastSync, BROADCAST_TAB_ID } from '../../../src/lib/broadcastSync';
import toast from '../../../src/stores/toastStore';

// AlbumPicker import REMOVED (2026-05-01 per Dan): the review-grid screen
// was firing a SECOND iOS Photos picker on mount and breaking real uploads.
// Flow is now direct: iOS Photos picker → EditPostScreen (staging).
import EditPostScreen from '../../../src/components/social/compose/EditPostScreen';
import CoverFramePicker from '../../../src/components/social/compose/CoverFramePicker';

// ─── helpers (mirror social-media/index.js patterns) ─────────────────────────
const _withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
]);

const _isFreshJwt = (tok) => {
    if (typeof tok !== 'string') return false;
    const parts = tok.split('.');
    if (parts.length !== 3) return false;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
        const json = (typeof atob === 'function')
            ? atob(b64 + pad)
            : Buffer.from(b64 + pad, 'base64').toString('utf-8');
        const payload = JSON.parse(json);
        if (typeof payload.exp !== 'number') return false;
        return payload.exp > Math.floor(Date.now() / 1000) + 30;
    } catch (_) { return false; }
};

async function ensureFreshSession() {
    let ok = false;
    try {
        const { data } = await _withTimeout(supabase.auth['getSession'](), 4000, 'getSession');
        ok = _isFreshJwt(data?.session?.access_token);
    } catch (_) {}
    if (!ok) {
        try {
            const raw = localStorage.getItem('smarter-poker-auth');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (_isFreshJwt(parsed?.access_token)) ok = true;
            }
        } catch (_) {}
    }
    if (!ok) {
        try {
            const { data: refreshed } = await _withTimeout(supabase.auth['refreshSession'](), 4000, 'refreshSession');
            if (_isFreshJwt(refreshed?.session?.access_token)) ok = true;
        } catch (_) {}
    }
    return ok;
}

async function uploadImage(file, userId, folder) {
    const token = getAccessToken();
    if (!token) throw new Error('Missing auth token');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    fd.append('prefix', userId);
    const res = await fetch('/api/social/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    const json = await res.json();
    if (!json.success || !json.url) throw new Error(json.error || 'upload returned no URL');
    return json.url;
}

// Inline user-resolution mirroring social-media/index.js: prefer cached profile,
// fall back to JWT user_metadata. Avoids a network round-trip on mount.
function resolveCurrentUser() {
    if (typeof window === 'undefined') return null;
    try {
        const cached = localStorage.getItem('sp-social-user');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.id && parsed?.ts && (Date.now() - parsed.ts) < 3600000) {
                return { id: parsed.id, name: parsed.name || parsed.full_name, full_name: parsed.full_name, username: parsed.username, avatar: parsed.avatar };
            }
        }
    } catch (_) {}
    try {
        const u = getAuthUser();
        if (u) {
            const fullName = u.user_metadata?.full_name;
            const alias = u.user_metadata?.poker_alias;
            return { id: u.id, name: fullName || alias || 'User', full_name: fullName, username: alias, avatar: u.user_metadata?.avatar_url };
        }
    } catch (_) {}
    return null;
}

export default function ComposePage() {
    const router = useRouter();
    const [user, setUser] = useState(() => resolveCurrentUser());
    useEffect(() => {
        // Re-resolve once after mount in case cache wasn't ready synchronously
        if (!user) {
            const u = resolveCurrentUser();
            if (u) setUser(u);
        }
    }, [user]);
    const step = useComposeStore(s => s.step);
    const setStep = useComposeStore(s => s.setStep);
    const reset = useComposeStore(s => s.reset);

    const exitToFeed = useCallback(() => {
        reset();
        router.replace('/hub/social-media');
    }, [reset, router]);

    // Lock body scroll while compose is open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    // Reset store on full unmount (route hop away)
    useEffect(() => () => reset(), [reset]);

    const handlePostNow = useCallback(async () => {
        const state = useComposeStore.getState();
        if (state.inFlight) return;

        if (!user?.id) {
            toast.error('Please sign in to post.');
            return;
        }
        if (!state.media.length) {
            useComposeStore.setState({ error: 'Please pick at least one photo or video.' });
            return;
        }

        useComposeStore.setState({
            inFlight: true,
            error: null,
            uploadPct: 0,
            uploadLabel: 'Preparing…',
            uploadStage: 'preflight',
        });

        try {
            // 1. Session preflight (timeout-guarded)
            const sessionOk = await ensureFreshSession();
            if (!sessionOk) {
                throw new Error('Your session has expired. Please refresh the page or log in again.');
            }

            // 2. Upload all media. Videos use background TUS; images use POST /api/social/upload.
            useComposeStore.getState().setUploadStage('uploading');
            const uploadedUrls = [];
            let videoUrl = null;
            const totalCount = state.media.length;
            let doneCount = 0;
            for (const m of state.media) {
                if (m.type === 'video') {
                    const url = await new Promise((resolve, reject) => {
                        let unsub = null;
                        bgUpload.start({
                            file: m.file,
                            userId: user.id,
                            folder: 'videos',
                            content: state.draft?.trim() || '',
                            thumbnail: null, // server cron extracts thumbnails
                        }).catch(reject);
                        unsub = bgUpload.subscribe({
                            // Live progress feed → composeStore so EditPostScreen
                            // can render a progress overlay while the upload runs.
                            onProgress: ({ pct, label }) => {
                                // Average across multiple files: each file contributes
                                // 100/totalCount of the overall progress.
                                const overall = Math.round(((doneCount * 100) + (pct || 0)) / Math.max(totalCount, 1));
                                useComposeStore.getState().setUploadProgress(
                                    overall,
                                    label || `Uploading… ${pct || 0}%`,
                                );
                            },
                            onComplete: ({ publicUrl }) => { unsub?.(); resolve(publicUrl); },
                            onError: ({ error }) => { unsub?.(); reject(error); },
                            onBackground: () => { /* ghost card takes over in feed */ },
                        });
                    });
                    videoUrl = url;
                    uploadedUrls.push(url);
                    doneCount += 1;
                } else {
                    useComposeStore.getState().setUploadProgress(
                        Math.round((doneCount / Math.max(totalCount, 1)) * 100),
                        `Uploading photo ${doneCount + 1} of ${totalCount}…`,
                    );
                    const url = await uploadImage(m.file, user.id, 'photos');
                    uploadedUrls.push(url);
                    doneCount += 1;
                }
            }
            useComposeStore.getState().setUploadProgress(100, 'Creating post…');
            useComposeStore.getState().setUploadStage('creating');

            // 3. Persist custom cover (if user uploaded one) — gives us a thumbnail_url
            let thumbnailUrl = null;
            if (state.customCoverFile) {
                try {
                    thumbnailUrl = await uploadImage(state.customCoverFile, user.id, 'thumbnails');
                } catch (e) {
                    console.warn('[Compose] custom cover upload failed:', e?.message || e);
                }
            }

            // 4. Persist post via fn_create_social_post RPC, with new fields in metadata
            const contentType = state.media.some(m => m.type === 'video') ? 'video' : 'image';

            // PHASE-B (2026-05-01): RPC now accepts V2 fields atomically.
            // No more separate UPDATE patch — single round-trip + transactional.
            const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_create_social_post', {
                p_author_id: user.id,
                p_content: state.draft?.trim() || '',
                p_content_type: contentType,
                p_media_urls: uploadedUrls,
                p_visibility: state.visibility || 'public',
                p_achievement_data: null,
                p_thumbnail_url: thumbnailUrl,
                p_ai_label: !!state.aiLabel,
                p_audience_mode: state.audienceMode || null,
                p_audience_list: state.audienceList?.length ? state.audienceList : null,
                p_share_to_story: !!state.shareToStory,
                p_metadata_location: state.location || null,
                p_topics: state.topics?.length ? state.topics : null,
                p_cover_frame_index: state.coverFrameIndex,
            });

            if (rpcError || !rpcResult?.success) {
                const msg = rpcError?.message || rpcResult?.error || 'Post creation failed';
                throw new Error(msg);
            }

            const postId = rpcResult.id;

            // 5. Optional: also publish as 24h story.
            // AUDIT (2026-05-01 secondary pass): bug fixes —
            //   • The story RPC's caption param is `p_content`, not
            //     `p_caption`. The previous call name-mismatched and
            //     silently dropped the caption.
            //   • Story creation was gated on `videoUrl` so an image-only
            //     post with share-to-story enabled silently no-op'd. Use
            //     the first uploaded URL as the media regardless of type
            //     and pass the actual media_type.
            if (state.shareToStory && uploadedUrls.length > 0) {
                try {
                    const storyMedia = videoUrl || uploadedUrls[0];
                    const storyMediaType = videoUrl ? 'video' : 'image';
                    await supabase.rpc('fn_create_story', {
                        p_user_id: user.id,
                        p_content: state.draft?.trim() || '',
                        p_media_url: storyMedia,
                        p_media_type: storyMediaType,
                    });
                } catch (storyErr) {
                    console.warn('[Compose] share-to-story failed:', storyErr?.message || storyErr);
                }
            }

            // 6. Persist share_to_groups + co_authors selections in metadata.
            // No backend mirror-job exists yet for either; we save the
            // selections to social_posts.metadata so future infrastructure
            // (Hetzner Open Claw worker per CLUB-ARENA-OFFICIAL-
            // UPGRADE-INTEGRATION.md) can pick them up. Read-merge-write
            // pattern preserves any sibling fields the RPC stored.
            const needsMetaPatch =
                (state.shareToGroups?.length || state.coAuthors?.length) && postId;
            if (needsMetaPatch) {
                try {
                    const { data: existing } = await supabase
                        .from('social_posts')
                        .select('metadata')
                        .eq('id', postId)
                        .maybeSingle();
                    const base = (existing?.metadata && typeof existing.metadata === 'object')
                        ? existing.metadata
                        : {};
                    const merged = { ...base };
                    if (state.shareToGroups?.length) {
                        merged.share_to_groups = state.shareToGroups.map(g => ({ id: g.id, name: g.name }));
                    }
                    if (state.coAuthors?.length) {
                        merged.co_authors = state.coAuthors.map(a => ({
                            id: a.id, name: a.name, username: a.username,
                        }));
                    }
                    await supabase.from('social_posts')
                        .update({ metadata: merged })
                        .eq('id', postId);
                } catch (metaErr) {
                    // Non-fatal — the post is created, just missing the
                    // metadata sidecar fields.
                    console.warn('[Compose] metadata sidecar save failed:', metaErr?.message || metaErr);
                }
            }

            // 7. Notify the rest of the app + cross-tab sync.
            // AUDIT-PASS-3 (2026-05-01): added masterBus.publish('SOCIAL_POST')
            // so the social-media page realtime handler — which deliberately
            // SKIPS self-authored posts (line 4313) on the assumption they
            // were already added optimistically — falls through to the
            // masterBus loadFeed(0) reload trigger instead. Without this,
            // the user's own post never appeared in their own feed until
            // a manual refresh. Also added broadcastSync so OTHER open tabs
            // see the new post.
            try {
                busEmit.dataMutated?.('social');
                busEmit.socialPostCreated?.(postId, user.id);
                if (typeof window !== 'undefined' && window.masterBus?.publish) {
                    window.masterBus.publish('SOCIAL_POST', { id: postId, authorId: user.id });
                }
                broadcastSync('smarter_poker_social_sync', { action: 'refresh_feed', tabId: BROADCAST_TAB_ID });
            } catch (_) {}

            // AUDIT-PASS-3 (2026-05-01): success chime — restored from
            // SharedPostCreator's old handlePost. Compose.js had silently
            // dropped this when it took over the post-create handler.
            try {
                if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
                    const ac = new (window.AudioContext || window.webkitAudioContext)();
                    const o = ac.createOscillator();
                    const g = ac.createGain();
                    o.connect(g); g.connect(ac.destination);
                    o.type = 'sine';
                    o.frequency.setValueAtTime(880, ac.currentTime);
                    o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.12);
                    g.gain.setValueAtTime(0.0001, ac.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.02);
                    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
                    o.start();
                    o.stop(ac.currentTime + 0.2);
                    setTimeout(() => { try { ac.close(); } catch (_) {} }, 400);
                }
            } catch (_) { /* audio is a nice-to-have, never block the post */ }

            toast.success('Posted!', 2000);
            // Persist last audience choice so the next compose defaults to it
            try {
                if (state.audienceMode) localStorage.setItem('sp-compose-last-audience', state.audienceMode);
            } catch (_) {}

            exitToFeed();
        } catch (e) {
            const msg = e?.message || 'Something went wrong. Please try again.';
            console.warn('[Compose] post failed:', e);
            useComposeStore.setState({ inFlight: false, error: msg });
            try { toast.error(msg, 8000); } catch (_) {}
        }
    }, [user, exitToFeed]);

    // Restore last audience choice on first load
    useEffect(() => {
        try {
            const last = localStorage.getItem('sp-compose-last-audience');
            if (last) useComposeStore.getState().setAudience(last);
        } catch (_) {}
    }, []);

    // ── Render the active step ────────────────────────────────────────
    // KILL-ALBUMPICKER (2026-05-01 per Dan): the picker step is dead. If
    // any caller (or stale state) tries to set step='picker', we render
    // EditPostScreen anyway. AlbumPicker was opening a duplicate iOS
    // picker on mount and breaking real uploads.
    if (step === 'cover') {
        return <CoverFramePicker onBack={() => setStep('edit')} onSave={() => setStep('edit')} />;
    }
    // Default + 'picker' fallback both render EditPostScreen.
    return (
        <EditPostScreen
            onBack={exitToFeed}
            onEditCover={() => setStep('cover')}
            onPostNow={handlePostNow}
        />
    );
}

// Skip the layout chrome — this is a fullscreen flow.
ComposePage.getLayout = (page) => page;
