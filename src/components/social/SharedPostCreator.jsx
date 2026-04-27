import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import { getAccessToken } from '../../../src/lib/authUtils';
import { busEmit } from '../../../src/engine/EventBus';
import toast from '../../../src/stores/toastStore';
import { useActiveIdentity } from '../../../src/contexts/ActiveIdentityContext';
import CheckInModal from './CheckInModal';
import TrendingVenues from './TrendingVenues';
import { SharedAvatar as Avatar } from './SharedAvatar';
import { MAX_MEDIA, compressImage, getYouTubeVideoId, validateYouTubeVideo, sniffMimeType, SOCIAL_COLORS as C } from '../../../src/lib/socialHelpers';
import bgUpload from '../../../src/lib/backgroundVideoUpload';
import { validateVideoFile, generateThumbnail, compressVideo } from '../../../src/lib/videoCompressor';
import { uploadThumbnail } from '../../../src/lib/thumbnailUploader';


export function SharedPostCreator({ user, onPost, isPosting, onGoLive, onOpenClubPages, authorOverride, context = 'social-media' }) {
    const [postVisibility, setPostVisibility] = useState('public');
    const [content, setContent] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null); // null | { pct: number, label: string }
    const [error, setError] = useState('');
    const [preparingMedia, setPreparingMedia] = useState(false); // true while iOS file picker is open / transcoding
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionResults, setMentionResults] = useState([]);
    const [showMentions, setShowMentions] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    // 🔗 LINK PREVIEW STATE - SmarterPoker-style auto-detect
    const [linkPreview, setLinkPreview] = useState(null); // { url, title, image, domain }
    // 📍 CHECK-IN STATE
    const [checkInVenue, setCheckInVenue] = useState(null);
    const [showCheckInModal, setShowCheckInModal] = useState(false);
    const [linkLoading, setLinkLoading] = useState(false);
    const [showIdentityPicker, setShowIdentityPicker] = useState(false);
    const identityPickerRef = useRef(null);
    const fileRef = useRef(null);
    const inputRef = useRef(null);
    const mentionTimeout = useRef(null);
    const linkTimeout = useRef(null);
    const draftTimeout = useRef(null);
    const _submittingRef = useRef(false); // local double-submit guard
    const mountedRef = useRef(true); // guards setState after unmount
    const compressionRef = useRef({}); // { [blobUrl]: { controller, promise, result } }
    const _pickerOpenRef = useRef(false); // tracks if iOS file picker is open

    // Identity switching
    const { isClubMode, clubPage, hasClubPage, switchToPersonal, switchToClub } = useActiveIdentity();

    // Home group post targets
    const [homeGroupTargets, setHomeGroupTargets] = useState([]);
    const [activeHomeGroup, setActiveHomeGroup] = useState(null); // null = not posting as home group

    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        supabase.rpc('fn_list_my_post_targets').then(({ data, error }) => {
            if (cancelled || error) return;
            const hgs = (data || []).filter(t => t.kind === 'home_group');
            if (!cancelled) setHomeGroupTargets(hgs);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [user?.id]);

    // Click-outside handler: auto-close identity picker dropdown
    useEffect(() => {
        if (!showIdentityPicker) return;
        const handleClickOutside = (e) => {
            if (identityPickerRef.current && !identityPickerRef.current.contains(e.target)) {
                setShowIdentityPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showIdentityPicker]);

    // Restore draft from localStorage on mount
    useEffect(() => {
        try {
            const draft = localStorage.getItem('sp-post-draft');
            if (draft && !content) setContent(draft);
        } catch (e) { console.warn('[App] Handled exception:', e); }
    }, []);

    // Track media via ref for cleanup (avoids stale closure in useEffect)
    const mediaRef = useRef(media);
    mediaRef.current = media;

    // Cleanup pending timeouts + blob URLs on unmount
    useEffect(() => {
        return () => {
            if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
            if (linkTimeout.current) clearTimeout(linkTimeout.current);
            if (draftTimeout.current) clearTimeout(draftTimeout.current);
            // NOTE: Do NOT unsubscribe bgUpload here. The listener must stay alive
            // so onComplete fires and triggers the DB insert.
            // Cleanup happens via bgUpload.abort() when a new upload starts.
            // Revoke any staged blob URLs to free memory
            mediaRef.current.forEach(m => {
                if (m.file && m.url?.startsWith('blob:')) {
                    try { URL.revokeObjectURL(m.url); } catch (_) {}
                }
            });
            // Abort any running background compressions
            Object.values(compressionRef.current).forEach(c => {
                try { c.controller?.abort(); } catch (_) {}
            });
            compressionRef.current = {};
            mountedRef.current = false;
        };
    }, []);

    // Paste image handler — feeds into existing upload pipeline
    const handlePaste = async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        if (!user?.id) { setError('Please log in to upload media.'); return; }
        const imageFiles = [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (!imageFiles.length) return;
        e.preventDefault();
        const remaining = MAX_MEDIA - media.length;
        if (remaining <= 0) { setError(`Maximum ${MAX_MEDIA} images allowed`); return; }
        setUploading(true);
        const uploaded = [];
        for (const file of imageFiles.slice(0, remaining)) {
            try {
                const compressedFile = await compressImage(file);
                if (compressedFile.size > 4.5 * 1024 * 1024) {
                    setError('Pasted image is too large (max 4.5MB). Please copy a smaller image.');
                    continue;
                }
                const formData = new FormData();
                formData.append('file', compressedFile);
                formData.append('folder', 'photos');
                formData.append('prefix', user.id);
                const token = getAccessToken();
                if (!token) {
                    setError('Authentication required — please refresh the page and try again.');
                    continue;
                }
                const res = await fetch('/api/social/upload', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                });
                if (!res.ok) throw new Error(`Upload failed (${res.status})`);
                const json = await res.json();
                if (json.success && json.url) uploaded.push({ type: 'photo', url: json.url });
                else setError('Paste upload failed: ' + (json.error || 'Unknown'));
            } catch (err) { setError('Paste upload failed: ' + err.message); }
        }
        if (uploaded.length) {
            setMedia(prev => [...prev, ...uploaded]);
            toast.success(`${uploaded.length} image${uploaded.length > 1 ? 's' : ''} pasted!`);
        }
        setUploading(false);
    };

    // ── iOS FILE PICKER PREPARATION DETECTION ────────────────────────────────
    // On iOS, after the user selects a video and taps the blue checkmark,
    // the OS transcodes HEVC→H.264 which can take 30-90+ seconds.
    // During this time, our onChange never fires → dead screen.
    // Instead of relying on focus events (which don't fire on iOS), we show
    // a visible "Preparing..." indicator immediately when the button is clicked.
    // The indicator stays until handleFiles fires (file ready or cancel).
    //
    // CANCEL DETECTION: On iOS, tapping Cancel in the picker doesn't fire onChange.
    // We use visibilitychange as a secondary signal — when the picker dismisses,
    // the page becomes visible. If no file was selected after 2s, clear the indicator.
    // 120s hard safety timeout remains as ultimate backstop.
    useEffect(() => {
        if (!preparingMedia) return;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && _pickerOpenRef.current) {
                // Wait 2s for onChange to fire (transcoding may still be in progress)
                setTimeout(() => {
                    if (_pickerOpenRef.current) {
                        setPreparingMedia(false);
                        _pickerOpenRef.current = false;
                    }
                }, 2000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        const timer = setTimeout(() => { setPreparingMedia(false); _pickerOpenRef.current = false; }, 120_000);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            clearTimeout(timer);
        };
    }, [preparingMedia]);

    /**
     * handleFiles — STAGE ONLY (instant, no freeze)
     * Creates local blob preview URLs so user can see thumbnails and type a caption.
     * Actual upload happens in handlePost when user taps Post.
     *
     * Pipeline during staging (all background, zero freeze):
     *   1. Client-side file size validation (instant reject > 5GB)
     *   2. Blob URL for preview thumbnail
     *   3. Auto-thumbnail generation via canvas (2s frame)
     *   4. Background video compression for files > 50MB
     *   5. Signed URL prefetch for first video
     */
    const handleFiles = async (e) => {
        // Clear the iOS preparing indicator — file is now ready (or user cancelled)
        setPreparingMedia(false);
        _pickerOpenRef.current = false;

        const files = Array.from(e.target.files);
        if (!files.length) return;
        if (!user?.id) { setError('Please log in to upload media.'); return; }

        // Check total media limit
        const remaining = MAX_MEDIA - media.length;
        if (remaining <= 0) {
            setError(`Maximum ${MAX_MEDIA} images/videos allowed per post`);
            return;
        }
        const filesToStage = files.slice(0, remaining);
        if (files.length > remaining) {
            setError(`Only ${remaining} more file(s) can be added (max ${MAX_MEDIA})`);
        }

        setError('');

        // Stage files instantly with local blob URLs — ZERO network calls, ZERO freeze
        const staged = [];
        for (const file of filesToStage) {
            const mimeType = sniffMimeType(file);
            const isVideo = mimeType.startsWith('video/');

            // ── CLIENT-SIDE SIZE VALIDATION (instant, before any processing) ──
            if (isVideo) {
                const validation = validateVideoFile(file);
                if (!validation.valid) {
                    setError(validation.error);
                    continue; // skip this file, try the rest
                }
                if (validation.warning) {
                    toast.info(validation.warning, 5000);
                }
                if (validation.formatWarning) {
                    toast.info(validation.formatWarning, 4000);
                }
            }

            const localUrl = URL.createObjectURL(file);
            staged.push({
                type: isVideo ? 'video' : 'photo',
                url: localUrl,
                file,           // raw File object — uploaded in handlePost
                thumbnail: null, // set async below for videos
            });
        }

        if (!staged.length) return;
        setMedia(prev => [...prev, ...staged]);

        // ⚡ INSTANT FEEDBACK: toast the moment a video is selected (before any processing)
        const videoCount = staged.filter(s => s.type === 'video').length;
        if (videoCount > 0) {
            const sizeMB = Math.round(staged.filter(s => s.type === 'video').reduce((sum, s) => sum + (s.file?.size || 0), 0) / (1024 * 1024));
            toast.info(`Video selected (${sizeMB}MB) — preparing upload…`, 3000);
        }

        // ── BACKGROUND PROCESSING (runs while user types caption) ────────────
        for (const item of staged) {
            if (item.type !== 'video') continue;

            // 1. Auto-thumbnail: extract frame at ~2s via canvas
            generateThumbnail(item.file).then(thumb => {
                if (!mountedRef.current || !thumb) return;
                setMedia(prev => prev.map(m =>
                    m.url === item.url ? { ...m, thumbnail: thumb } : m
                ));
            });

            // 2. Background compression for large videos (> 50MB, < 2min)
            const controller = new AbortController();
            const compPromise = compressVideo(item.file, {
                signal: controller.signal,
                onProgress: ({ pct }) => {
                    if (!mountedRef.current) return;
                    // Update compression progress in media state
                    setMedia(prev => prev.map(m =>
                        m.url === item.url ? { ...m, compressPct: pct } : m
                    ));
                },
            }).then(result => {
                compressionRef.current[item.url] = { ...compressionRef.current[item.url], result };
                if (result.compressed && mountedRef.current) {
                    const savedMB = Math.round((result.originalSize - result.compressedSize) / (1024 * 1024));
                    toast.success(`Video compressed — saved ${savedMB}MB (${result.savings}% smaller)`, 3000);
                    setMedia(prev => prev.map(m =>
                        m.url === item.url ? { ...m, compressPct: null } : m
                    ));
                }
                return result;
            });
            compressionRef.current[item.url] = { controller, promise: compPromise, result: null };

            // 3. Signed URL prefetch
            bgUpload.prefetch({ file: item.file, userId: user.id, folder: 'videos' });
            break; // only process first video for prefetch
        }

        // Reset file input so the same file can be re-selected
        if (fileRef.current) fileRef.current.value = '';
    };

    // Handle @mention detection AND auto URL detection (SmarterPoker-style)
    const handleContentChange = (e) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;

        // Debounced draft save to localStorage
        if (draftTimeout.current) clearTimeout(draftTimeout.current);
        draftTimeout.current = setTimeout(() => {
            try { if (value.trim()) localStorage.setItem('sp-post-draft', value); else localStorage.removeItem('sp-post-draft'); } catch (e) { console.warn('[App] Handled exception:', e); }
        }, 2000);

        // 🔗 AUTO-DETECT URLs - SmarterPoker-style: remove URL and show preview card
        // ONLY trigger when URL is followed by a space (user finished typing the URL)
        const urlRegex = /((?:https?:\/\/|www\.)\S+)\s/i;
        const urlMatch = value.match(urlRegex);

        if (urlMatch && !linkPreview && !linkLoading) {
            let detectedUrl = urlMatch[1];
            detectedUrl = detectedUrl.replace(/[.,;:!?)]+$/, '');
            if (detectedUrl.toLowerCase().startsWith('www.')) detectedUrl = 'https://' + detectedUrl;

            const isYouTube = /youtube\.com|youtu\.be/i.test(detectedUrl);
            const cleanedValue = value.replace(urlMatch[0], '').trim();
            setContent(cleanedValue);
            setLinkLoading(true);

            if (linkTimeout.current) clearTimeout(linkTimeout.current);

            linkTimeout.current = setTimeout(async () => {
                try {
                    if (isYouTube) {
                        const validation = await validateYouTubeVideo(detectedUrl);
                        if (!validation.valid) {
                            setError(`❌ ${validation.error}`);
                            setLinkLoading(false);
                            return;
                        }
                        const videoId = getYouTubeVideoId(detectedUrl);
                        setLinkPreview({
                            url: detectedUrl,
                            title: 'YouTube Video',
                            image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                            domain: 'youtube.com',
                            type: 'video'
                        });
                    } else {
                        try {
                            const response = await fetch(`/api/link-preview?url=${encodeURIComponent(detectedUrl)}`);
                            if (!response.ok) throw new Error(`Request failed (${response.status})`);
                            const metadata = await response.json();

                            setLinkPreview({
                                url: detectedUrl,
                                title: metadata.title || 'Link',
                                description: metadata.description || null,
                                image: metadata.image || null,
                                domain: metadata.siteName || new URL(detectedUrl).hostname.replace(/^www\./i, ''),
                                type: 'link'
                            });
                        } catch (apiError) {
                            setLinkLoading(false);
                            console.warn('Link preview API error:', apiError);
                            const domain = new URL(detectedUrl).hostname.replace(/^www\./i, '');
                            setLinkPreview({
                                url: detectedUrl,
                                title: domain,
                                description: null,
                                image: null,
                                domain: domain,
                                type: 'link'
                            });
                        }
                    }
                } catch (err) {
                    console.warn('Link preview error:', err);
                    setError('Could not load link preview');
                }
                setLinkLoading(false);
            }, 300);

            setCursorPosition(cleanedValue.length);
            return; 
        }

        setContent(value);
        setCursorPosition(pos);

        // Check for @mention pattern
        const textBeforeCursor = value.substring(0, pos);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

        if (mentionMatch) {
            const query = mentionMatch[1];
            setMentionQuery(query);
            setShowMentions(true);

            if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
            if (query.length >= 1) {
                mentionTimeout.current = setTimeout(async () => {
                    try {
                        const { data } = await supabase.from('profiles')
                            // BUG-13 FIX: also select display_name as fallback when full_name is null
                            .select('id, username, full_name, display_name')
                            .ilike('username', `%${query}%`)
                            .limit(5);
                        if (data) setMentionResults(data);
                    } catch (e) { console.warn(e); }
                }, 200);
            }
        } else {
            setShowMentions(false);
            setMentionResults([]);
        }
    };

    const removeLinkPreview = () => {
        setLinkPreview(null);
        setError('');
    };

    const insertMention = (u) => {
        const textBeforeCursor = content.substring(0, cursorPosition);
        const textAfterCursor = content.substring(cursorPosition);
        const mentionStart = textBeforeCursor.lastIndexOf('@');
        const newContent = textBeforeCursor.substring(0, mentionStart) + `@${u.username} ` + textAfterCursor;
        setContent(newContent);
        setShowMentions(false);
        setMentionResults([]);
        inputRef.current?.focus();
    };

    const handlePost = async () => {
        if (isPosting || _submittingRef.current) return; // Double-submit guard
        _submittingRef.current = true;
        if (!content.trim() && !media.length && !linkPreview && !checkInVenue) { _submittingRef.current = false; return; }
        setError('');

        // ── STEP 1: Upload any staged files (files with .file property) ──────
        const stagedFiles = media.filter(m => m.file);
        let uploadedMedia = media.filter(m => !m.file); // already-uploaded items stay as-is

        if (stagedFiles.length > 0) {
            setUploading(true);
            setUploadProgress({ pct: 0, label: 'Uploading…' });

            for (const staged of stagedFiles) {
                const isVideo = staged.type === 'video';
                const folder = isVideo ? 'videos' : 'photos';
                try {
                    if (isVideo) {
                        // ── Use compressed file if background compression finished ──
                        let fileToUpload = staged.file;
                        const comp = compressionRef.current[staged.url];
                        if (comp?.promise) {
                            try {
                                const result = comp.result || await Promise.race([
                                    comp.promise,
                                    new Promise(r => setTimeout(() => r({ file: staged.file, compressed: false }), 500)),
                                ]);
                                if (result.compressed) fileToUpload = result.file;
                            } catch (_) { /* use original */ }
                        }

                        // ── Background-capable video upload ─────────────────────
                        let bgUnsub = null;
                        const videoUrl = await new Promise((resolve, reject) => {
                            // start() MUST be called before subscribe() because start() clears existing listeners
                            // to supersede any pending uploads. If subscribe() is called first, it gets wiped.
                            bgUpload.start({ file: fileToUpload, userId: user.id, folder, content: content?.trim(), thumbnail: staged.thumbnail }).catch(reject);
                            bgUnsub = bgUpload.subscribe({
                                onProgress: ({ pct, label }) => {
                                    if (!mountedRef.current) return;
                                    setUploadProgress({ pct, label });
                                },
                                onComplete: ({ publicUrl }) => resolve(publicUrl),
                                onError: ({ error }) => reject(error),
                                onBackground: () => {
                                    // Upload moved to background — reset the composer.
                                    // GhostPostCard in the feed shows progress.
                                    if (mountedRef.current) {
                                        setUploadProgress(null);
                                        setUploading(false);
                                        setContent('');
                                        setMedia([]);
                                        setLinkPreview(null);
                                        try { localStorage.removeItem('sp-post-draft'); } catch (_) {}
                                    }
                                },
                            });
                        });
                        if (bgUnsub) bgUnsub();
                        // Revoke blob URL now that we have the real URL
                        if (staged.url?.startsWith('blob:')) {
                            try { URL.revokeObjectURL(staged.url); } catch (_) {}
                        }
                        // Clean up compression cache
                        delete compressionRef.current[staged.url];
                        uploadedMedia.push({ type: 'video', url: videoUrl });

                        // Persist thumbnail to cloud storage (best-effort, awaited so URL is included in post)
                        if (staged.thumbnail) {
                            try {
                                const thumbUrl = await uploadThumbnail(staged.thumbnail, user.id);
                                if (thumbUrl) {
                                    uploadedMedia.push({ type: 'thumbnail', url: thumbUrl });
                                }
                            } catch (_) { /* thumbnail upload is best-effort */ }
                        }
                    } else {
                        // Compress image before upload
                        const compressedFile = await compressImage(staged.file);
                        if (compressedFile.size > 4.5 * 1024 * 1024) {
                            setError(`Image too large (max 4.5MB). Please choose a smaller image.`);
                            // Revoke blob URL for skipped file
                            if (staged.url?.startsWith('blob:')) {
                                try { URL.revokeObjectURL(staged.url); } catch (_) {}
                            }
                            continue;
                        }
                        const formData = new FormData();
                        formData.append('file', compressedFile);
                        formData.append('folder', folder);
                        formData.append('prefix', user.id);
                        const _imgToken = getAccessToken();
                        if (!_imgToken) {
                            setError('Authentication required — please refresh the page and try again.');
                            // Revoke blob URL for skipped file
                            if (staged.url?.startsWith('blob:')) {
                                try { URL.revokeObjectURL(staged.url); } catch (_) {}
                            }
                            continue;
                        }
                        const res = await fetch('/api/social/upload', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${_imgToken}` },
                            body: formData,
                        });
                        if (!res.ok) throw new Error(`Request failed (${res.status})`);
                        const json = await res.json();
                        if (json.success && json.url) {
                            // Revoke blob URL
                            if (staged.url?.startsWith('blob:')) {
                                try { URL.revokeObjectURL(staged.url); } catch (_) {}
                            }
                            uploadedMedia.push({ type: json.type || 'photo', url: json.url });
                        } else {
                            setError('Upload failed: ' + (json.error || 'Unknown error'));
                            // Revoke blob URL for failed upload
                            if (staged.url?.startsWith('blob:')) {
                                try { URL.revokeObjectURL(staged.url); } catch (_) {}
                            }
                        }
                    }
                } catch (err) {
                    if (bgUnsub) { bgUnsub(); bgUnsub = null; } // Always clean up listener
                    console.warn('[SharedPostCreator] Upload error:', err);
                    const isCancelled = err?.message === 'Upload cancelled' || err?.message === 'Upload aborted' || err?.message === 'Upload superseded';
                    if (isCancelled) {
                        // User-initiated cancel — reset state silently, don't show error
                        if (mountedRef.current) { setUploadProgress(null); setUploading(false); }
                        _submittingRef.current = false;
                        return;
                    }
                    if (mountedRef.current) {
                        setError('Upload failed: ' + err.message);
                        setUploadProgress(null);
                        setUploading(false);
                    }
                    _submittingRef.current = false;
                    return; // abort post on upload failure
                }
            }
            if (mountedRef.current) {
                setUploadProgress(null);
                setUploading(false);
            }
        }

        // ── STEP 2: Create the post with uploaded URLs ───────────────────────
        let urls = uploadedMedia.map(m => m.url);
        let type = uploadedMedia.some(m => m.type === 'video') ? 'video' : uploadedMedia.length ? 'image' : 'text';
        let cleanContent = content;

        if (linkPreview && type === 'text') {
            urls = [linkPreview.url];
            type = linkPreview.type || 'link';
        } else {
            const youtubeRegex = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g;
            const youtubeMatch = content.match(youtubeRegex);
            const generalUrlRegex = /(https?:\/\/[^\s]+)/g;
            const urlMatch = content.match(generalUrlRegex);

            if (youtubeMatch && type === 'text') {
                const fullUrl = youtubeMatch[0].startsWith('http') ? youtubeMatch[0] : `https://${youtubeMatch[0]}`;
                const validation = await validateYouTubeVideo(fullUrl);
                if (!validation.valid) {
                    setError(`${validation.error}`);
                    _submittingRef.current = false;
                    return;
                }
                urls = [fullUrl];
                type = 'video';
                cleanContent = content.replace(youtubeRegex, '').trim();
            } else if (urlMatch && type === 'text') {
                urls = [urlMatch[0]];
                type = 'link';
                cleanContent = content.replace(generalUrlRegex, '').trim();
            }
        }

        const mentionPattern = /@([\w.]+)/g;
        const mentions = [];
        let match;
        while ((match = mentionPattern.exec(content)) !== null) {
            mentions.push(match[1]);
        }
        
        // If posting as a home group, route through /api/social/pages/posts with the group's social_page_id
        let ok;
        if (activeHomeGroup?.social_page_id) {
            try {
                const token = getAccessToken();
                const res = await fetch('/api/social/pages/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        page_id: activeHomeGroup.social_page_id,
                        author_id: user?.id,
                        content: cleanContent,
                        content_type: urls.length > 0 ? 'media' : 'text',
                        visibility: postVisibility,
                        post_type: 'regular',
                        ...(urls.length > 0 ? { media_urls: urls } : {}),
                        ...(mentions && mentions.length > 0 ? { mentions } : {}),
                    }),
                });
                const json = await res.json();
                ok = json.success;
            } catch (e) {
                console.warn('[SharedPostCreator] Home group post error:', e);
                ok = false;
            }
        } else {
            ok = await onPost(cleanContent, urls, type, mentions, linkPreview, postVisibility);
        }
        if (ok) {
            if (checkInVenue) {
                try {
                    const token = getAccessToken();
                    if (token) {
                        const checkinRes = await fetch('/api/poker/checkins', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({
                                venue_id: checkInVenue.id,
                                user_name: authorOverride ? authorOverride.name : (user?.name || 'Player'),
                                message: cleanContent || null,
                            }),
                        });
                        if (checkinRes.ok) {
                            const venueName = checkInVenue.name;
                            const venueId = checkInVenue.id;
                            setCheckInVenue(null);
                            toast.success(`Checked in at ${venueName}`);
                            busEmit.venueCheckinCreated(venueId, venueName, user?.id);
                        } else if (checkinRes.status === 429) {
                            setCheckInVenue(null);
                        } else {
                            setCheckInVenue(null);
                        }
                    } else {
                        setCheckInVenue(null);
                    }
                } catch (e) {
                    setCheckInVenue(null);
                }
            }
            if (mountedRef.current) {
                setContent(''); setMedia([]); setLinkPreview(null);
            }
            try { localStorage.removeItem('sp-post-draft'); } catch (e) { console.warn('[App] Handled exception:', e); }
        }
        else if (mountedRef.current) setError('Unable to post at this time. Please try again later.');
        _submittingRef.current = false;
    };

    // Determine display identity:
    // If context is 'social-pages', use the authorOverride
    // If context is 'social-media', use club page override IF active, otherwise standard user
    // Home group mode takes priority over club mode in social-media context
    let postingAs = { name: user?.name, avatar: user?.avatar };
    
    if (context === 'social-pages' && authorOverride) {
        postingAs = { name: authorOverride.name, avatar: authorOverride.avatar_url };
    } else if (activeHomeGroup) {
        postingAs = { name: activeHomeGroup.target_name, avatar: activeHomeGroup.target_avatar };
    } else if (isClubMode && clubPage) {
        postingAs = { name: clubPage.name, avatar: clubPage.avatar_url };
    }

    const isHomeGroupMode = !!activeHomeGroup;
    const hasAnyIdentitySwitcher = hasClubPage || homeGroupTargets.length > 0;

    return (
        <div style={{ background: C.card, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, position: 'relative' }}>
            {/* Identity Switcher Banner - for Commander users with club pages OR home group memberships */}
            {context === 'social-media' && hasAnyIdentitySwitcher && (
                <div ref={identityPickerRef} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', transition: 'background 0.3s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSec }}>
                        <span>Posting As</span>
                        <button
                            onClick={() => setShowIdentityPicker(!showIdentityPicker)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: (isClubMode || isHomeGroupMode) ? '#E7F3FF' : '#F0F2F5',
                                border: `1px solid ${(isClubMode || isHomeGroupMode) ? '#1877F2' : C.border}`,
                                borderRadius: 20, padding: '4px 12px 4px 4px',
                                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                color: (isClubMode || isHomeGroupMode) ? '#1877F2' : C.text,
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%',
                                background: postingAs.avatar ? `url(${postingAs.avatar}) center/cover` : ((isClubMode || isHomeGroupMode) ? '#1877F2' : '#65676B'),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: 11, fontWeight: 700
                            }}>
                                {!postingAs.avatar && (postingAs.name?.[0] || '?')}
                            </div>
                            {postingAs.name || 'You'}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </div>

                    {showIdentityPicker && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 12, zIndex: 1001,
                            background: C.card, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            border: `1px solid ${C.border}`, minWidth: 240, overflow: 'hidden'
                        }}>
                            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: C.textSec, borderBottom: `1px solid ${C.border}` }}>
                                Switch Identity
                            </div>
                            {/* Personal Account */}
                            <button
                                onClick={() => { switchToPersonal(); setActiveHomeGroup(null); setShowIdentityPicker(false); toast.success('Switched to personal account', 2000); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                    padding: '10px 12px', border: 'none', cursor: 'pointer',
                                    background: !isClubMode && !isHomeGroupMode ? '#E7F3FF' : 'transparent',
                                    textAlign: 'left', transition: 'background 0.15s'
                                }}
                                onMouseEnter={e => { if (isClubMode || isHomeGroupMode) e.currentTarget.style.background = '#F0F2F5'; }}
                                onMouseLeave={e => { if (isClubMode || isHomeGroupMode) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <Avatar src={user?.avatar} name={user?.name} size={36} />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{user?.name || 'You'}</div>
                                    <div style={{ fontSize: 12, color: C.textSec }}>Personal Account</div>
                                </div>
                                {!isClubMode && !isHomeGroupMode && <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>}
                            </button>
                            {/* Club Page (only shown if user has one) */}
                            {hasClubPage && (
                                <button
                                    onClick={() => { switchToClub(); setActiveHomeGroup(null); setShowIdentityPicker(false); toast.success(`Now posting as ${clubPage?.name || 'Club'}`, 2000); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                        padding: '10px 12px', border: 'none', cursor: 'pointer',
                                        background: isClubMode && !isHomeGroupMode ? '#E7F3FF' : 'transparent',
                                        textAlign: 'left', transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={e => { if (!isClubMode || isHomeGroupMode) e.currentTarget.style.background = '#F0F2F5'; }}
                                    onMouseLeave={e => { if (!isClubMode || isHomeGroupMode) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <Avatar src={clubPage?.avatar_url} name={clubPage?.name || 'Club'} size={36} />
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{clubPage?.name || 'Club Page'}</div>
                                        <div style={{ fontSize: 12, color: C.textSec }}>Club Page</div>
                                    </div>
                                    {isClubMode && !isHomeGroupMode && <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>}
                                </button>
                            )}
                            {/* Home Groups section */}
                            {homeGroupTargets.length > 0 && (
                                <>
                                    <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: C.textSec, background: C.bg, borderTop: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Home Groups
                                    </div>
                                    {homeGroupTargets.map(hg => {
                                        const isActive = activeHomeGroup?.target_id === hg.target_id;
                                        return (
                                            <button
                                                key={hg.target_id}
                                                onClick={() => {
                                                    switchToPersonal();
                                                    setActiveHomeGroup(isActive ? null : hg);
                                                    setShowIdentityPicker(false);
                                                    toast.success(isActive ? 'Switched to personal account' : `Now posting as ${hg.target_name}`, 2000);
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                    padding: '10px 12px', border: 'none', cursor: 'pointer',
                                                    background: isActive ? '#E7F3FF' : 'transparent',
                                                    textAlign: 'left', transition: 'background 0.15s'
                                                }}
                                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F0F2F5'; }}
                                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <Avatar src={hg.target_avatar} name={hg.target_name} size={36} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hg.target_name}</div>
                                                    <div style={{ fontSize: 12, color: C.textSec }}>{hg.target_role ? (hg.target_role.charAt(0).toUpperCase() + hg.target_role.slice(1)) : 'Member'}</div>
                                                </div>
                                                {isActive && <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>}
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
            <div style={{ padding: 12, display: 'flex', gap: 8, transition: 'all 0.25s ease' }}>
                {context === 'social-pages' && authorOverride ? (
                    <div style={{ display: 'block', flexShrink: 0 }}>
                        <Avatar src={authorOverride.avatar_url} name={authorOverride.name} size={40} />
                    </div>
                ) : isHomeGroupMode ? (
                    <div style={{ display: 'block', flexShrink: 0, borderRadius: '50%', border: '2px solid #1877F2' }}>
                        <Avatar src={activeHomeGroup.target_avatar} name={activeHomeGroup.target_name} size={40} />
                    </div>
                ) : (isClubMode && clubPage) ? (
                    <Link href={`/hub/social-pages/${clubPage.id}`} style={{ display: 'block', cursor: 'pointer', flexShrink: 0, borderRadius: '50%', border: '2px solid #1877F2', transition: 'transform 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                        <Avatar src={clubPage.avatar_url} name={clubPage.name || 'Club'} size={40} />
                    </Link>
                ) : (
                    <Link href="/hub/profile" style={{ display: 'block', cursor: 'pointer' }}>
                        <Avatar src={user?.avatar} name={user?.name} size={40} />
                    </Link>
                )}
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        ref={inputRef}
                        value={content}
                        onChange={handleContentChange}
                        onPaste={handlePaste}
                        disabled={uploading}
                        placeholder={context === 'social-pages' ? `Post as ${postingAs.name}...` : isHomeGroupMode ? `Post as ${activeHomeGroup.target_name}...` : (isClubMode ? `Post as ${clubPage?.name || 'Club'}...` : `What's on your mind, ${user?.name || 'Player'}?`)}
                        style={{ width: '100%', background: C.bg, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 16, outline: 'none', boxSizing: 'border-box', color: uploading ? '#999' : C.text, opacity: uploading ? 0.6 : 1 }}
                        maxLength={5000}
                    />
                    {content.length > 4500 && (
                        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: content.length > 4900 ? '#FA383E' : C.textSec }}>
                            {5000 - content.length}
                        </span>
                    )}
                    {showMentions && mentionResults.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                            background: C.card, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            border: `1px solid ${C.border}`, zIndex: 1000, maxHeight: 200, overflowY: 'auto'
                        }}>
                            {mentionResults.map(u => (
                                <div
                                    key={u.id}
                                    onClick={() => insertMention(u)}
                                    style={{
                                        padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                        borderBottom: `1px solid ${C.border}`, transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Avatar name={u.username} size={32} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>@{u.username}</div>
                                        {u.full_name || u.display_name ? (
                                        <div style={{ fontSize: 12, color: C.textSec }}>
                                            {/* BUG-13 FIX: fall back to display_name if full_name is null */}
                                            {u.full_name || u.display_name}
                                        </div>
                                    ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {media.length > 0 && (
                <div style={{ padding: '0 12px 8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: media.length === 1 ? '1fr' : media.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 4 }}>
                        {media.map((m, i) => (
                            <div key={i} style={{ position: 'relative', aspectRatio: media.length === 1 ? '16/9' : '1', borderRadius: 8, overflow: 'hidden' }}>
                                {m.type === 'video' ? (
                                    // Tap-to-preview: shows thumbnail by default, loads <video> on tap
                                    m._previewing ? (
                                        <video
                                            src={m.url}
                                            controls
                                            playsInline
                                            autoPlay
                                            muted
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
                                            onEnded={() => setMedia(prev => prev.map((item, idx) => idx === i ? { ...item, _previewing: false } : item))}
                                        />
                                    ) : m.thumbnail ? (
                                        <div
                                            style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                                            onClick={() => setMedia(prev => prev.map((item, idx) => idx === i ? { ...item, _previewing: true } : item))}
                                        >
                                            <img src={m.thumbnail} alt="Video thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            {/* Play button overlay */}
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: 'rgba(0,0,0,0.2)',
                                            }}>
                                                <div style={{
                                                    width: 44, height: 44, borderRadius: '50%',
                                                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a2e, #16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                            onClick={() => setMedia(prev => prev.map((item, idx) => idx === i ? { ...item, _previewing: true } : item))}
                                        >
                                            <div style={{
                                                width: 44, height: 44, borderRadius: '50%',
                                                background: 'rgba(255,255,255,0.15)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M8 5v14l11-7z"/></svg>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <img src={m.url} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                <button
                                    onClick={() => {
                                        const item = media[i];
                                        // Cancel background compression if running
                                        if (item?.url && compressionRef.current[item.url]) {
                                            compressionRef.current[item.url].controller?.abort();
                                            delete compressionRef.current[item.url];
                                        }
                                        // Revoke blob URL to free memory
                                        if (item?.file && item?.url?.startsWith('blob:')) {
                                            try { URL.revokeObjectURL(item.url); } catch (_) {}
                                        }
                                        setMedia(prev => prev.filter((_, idx) => idx !== i));
                                    }}
                                    disabled={uploading}
                                    style={{
                                        position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: uploading ? 'not-allowed' : 'pointer',
                                        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        opacity: uploading ? 0.4 : 1,
                                    }}
                                >×</button>
                                {m.type === 'video' && (
                                    <div style={{
                                        position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.7)',
                                        padding: '2px 6px', borderRadius: 4, color: 'white', fontSize: 10,
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                                        VIDEO
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{media.length}/{MAX_MEDIA} files</div>
                </div>
            )}
            {(linkPreview || linkLoading) && (
                <div style={{ padding: '0 12px 8px' }}>
                    <div style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: C.bg,
                        position: 'relative'
                    }}>
                        {linkLoading ? (
                            <div style={{ padding: 24, textAlign: 'center', color: C.textSec }}>
                                <span style={{ fontSize: 24 }}>⏳</span>
                                <div style={{ marginTop: 8 }}>Loading Preview...</div>
                            </div>
                        ) : linkPreview && (
                            <>
                                <div style={{
                                    height: 400, position: 'relative',
                                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                                }}>
                                    {linkPreview.image ? (
                                        <img src={linkPreview.image} alt={linkPreview.title || 'Preview'} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center', position: 'absolute', top: 0, left: 0 }} />
                                    ) : (
                                        <span style={{ fontSize: 48, opacity: 0.5 }}>{linkPreview.type === 'video' ? '' : '🔗'}</span>
                                    )}
                                    {linkPreview.type === 'video' && linkPreview.image && (
                                        <div style={{
                                            position: 'absolute', width: 64, height: 64, borderRadius: '50%',
                                            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', fontSize: 28, zIndex: 1
                                        }}>▶</div>
                                    )}
                                </div>
                                <div style={{ padding: 12 }}>
                                    <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>{linkPreview.domain}</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: linkPreview.description ? 6 : 0 }}>{linkPreview.title}</div>
                                    {linkPreview.description && (
                                        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            {linkPreview.description}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={removeLinkPreview}
                                    style={{
                                        position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >×</button>
                            </>
                        )}
                    </div>
                </div>
            )}
            {error && <div style={{ padding: '0 12px 8px', color: C.red, fontSize: 13 }}>{error}</div>}
            {/* SINGLE progress bar — the ONLY upload progress indicator */}
            {uploading && uploadProgress && (
                <div style={{ padding: '0 12px 8px' }}>
                    <div style={{ background: '#E4E6EB', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 4,
                            background: 'linear-gradient(90deg, #1877F2, #42B72A)',
                            width: `${Math.min(uploadProgress.pct || 0, 100)}%`,
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                    <div style={{ fontSize: 13, color: C.textSec, marginTop: 4, textAlign: 'center', fontWeight: 600 }}>
                        {uploadProgress.label || `Uploading… ${uploadProgress.pct || 0}%`}
                    </div>
                </div>
            )}
            {/* ── Preparing Media Indicator (iOS transcoding) ── */}
            {preparingMedia && (
                <div style={{
                    padding: '12px 16px', background: 'linear-gradient(135deg, #E8F4FD, #D4E9F7)',
                    borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10
                }}>
                    <div style={{
                        width: 20, height: 20, border: '3px solid #1877F2', borderTopColor: 'transparent',
                        borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1877F2' }}>
                        Preparing Your Video — This May Take A Moment For Longer Videos...
                    </span>
                </div>
            )}
            <div style={{ borderTop: `1px solid ${C.border}` }}>
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFiles} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 8px 4px', gap: 4 }}>
                    <button
                    onClick={() => {
                        setPreparingMedia(true);
                        _pickerOpenRef.current = true;
                        fileRef.current?.click();
                    }}
                    disabled={media.length >= MAX_MEDIA || uploading}
                    style={{
                        padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: media.length >= MAX_MEDIA ? 'not-allowed' : 'pointer',
                        color: media.length >= MAX_MEDIA ? '#ccc' : '#65676B', fontSize: 14, fontWeight: 600, transition: 'background 0.2s', whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >{uploading ? 'Uploading…' : 'Photo/Video'}</button>
                    <span style={{ color: '#BCC0C4' }}>·</span>
                    <button
                        onClick={onGoLive}
                        style={{
                            padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer',
                            color: '#65676B', fontSize: 14, fontWeight: 600, transition: 'background 0.2s', whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >Go Live</button>
                    <span style={{ color: '#BCC0C4' }}>·</span>
                    <button
                        onClick={() => setShowCheckInModal(true)}
                        style={{
                            padding: '6px 8px', borderRadius: 6, border: 'none', background: checkInVenue ? '#E7F3FF' : 'transparent', cursor: 'pointer',
                            color: checkInVenue ? '#1877F2' : '#65676B', fontSize: 14, fontWeight: 600, transition: 'background 0.2s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = checkInVenue ? '#D4E6FA' : '#F0F2F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = checkInVenue ? '#E7F3FF' : 'transparent'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        Check In
                    </button>
                    {/* Reels, Find Friends, and Club Pages are in the bottom/side navigation naturally */}
                </div>
                <div style={{ padding: '4px 8px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {context === 'social-media' && (
                        <button onClick={() => setPostVisibility(v => v === 'public' ? 'friends' : 'public')} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: C.textSec, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }} title={postVisibility === 'public' ? 'Visible to everyone' : 'Visible to friends only'}>
                            {postVisibility === 'public' ? '🌐 Public' : '🔒 Friends'}
                        </button>
                    )}
                    <button onClick={handlePost} disabled={isPosting || uploading || (!content.trim() && !media.length && !linkPreview && !checkInVenue)} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: C.blue, color: 'white', fontWeight: 600, cursor: isPosting || uploading ? 'wait' : 'pointer', opacity: isPosting || uploading || (!content.trim() && !media.length && !linkPreview && !checkInVenue) ? 0.5 : 1, flex: 1 }}>{uploading ? 'Uploading…' : isPosting ? 'Posting…' : 'Post'}</button>
                </div>
            </div>
            {checkInVenue && (
                <div style={{
                    margin: '0 12px 8px', padding: '8px 12px', borderRadius: 8,
                    background: '#E7F3FF', border: '1px solid #B8D4F0', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1877F2" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1877F2' }}>
                        Checking in at {checkInVenue.name}
                    </span>
                    <button onClick={() => setCheckInVenue(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#65676B', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                </div>
            )}
            {showCheckInModal && (
                <CheckInModal
                    userId={user?.id}
                    onSelect={(venue) => {
                        setCheckInVenue(venue);
                        if (!content.trim()) {
                            setContent(`Checked in at ${venue.name}${venue.city ? ` — ${venue.city}` : ''}${venue.state ? `, ${venue.state}` : ''}`);
                        }
                    }}
                    onClose={() => setShowCheckInModal(false)}
                />
            )}
            {/* Always available */}
            <TrendingVenues
                onCheckIn={(venue) => {
                    setCheckInVenue(venue);
                    if (!content.trim()) {
                        setContent(`Checked in at ${venue.name}${venue.city ? ` — ${venue.city}` : ''}${venue.state ? `, ${venue.state}` : ''}`);
                    }
                }}
            />
        </div>
    );
}

// Ensure the helper is exported correctly from socialHelpers if needed, but we imported it above.
