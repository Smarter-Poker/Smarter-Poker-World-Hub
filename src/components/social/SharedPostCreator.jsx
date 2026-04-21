import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import { getAccessToken } from '../../../src/lib/authUtils';
import { busEmit } from '../../../src/engine/EventBus';
import toast from '../../../src/stores/toastStore';
import { useActiveIdentity } from '../../../src/contexts/ActiveIdentityContext';
import CheckInModal from './CheckInModal';
import TrendingVenues from './TrendingVenues';
import { SharedAvatar as Avatar } from './SharedAvatar';
import { MAX_MEDIA, compressImage, getYouTubeVideoId, validateYouTubeVideo, SOCIAL_COLORS as C } from '../../../src/lib/socialHelpers';

export function SharedPostCreator({ user, onPost, isPosting, onGoLive, onOpenClubPages, authorOverride, context = 'social-media' }) {
    const [postVisibility, setPostVisibility] = useState('public');
    const [content, setContent] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
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

    // Identity switching
    const { isClubMode, clubPage, hasClubPage, switchToPersonal, switchToClub } = useActiveIdentity();

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
        } catch {}
    }, []);

    // Cleanup pending timeouts on unmount to prevent zombie timers
    useEffect(() => {
        return () => {
            if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
            if (linkTimeout.current) clearTimeout(linkTimeout.current);
            if (draftTimeout.current) clearTimeout(draftTimeout.current);
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

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        if (!user?.id) { setError('Please log in to upload media.'); return; }

        // Check total media limit
        const remaining = MAX_MEDIA - media.length;
        if (remaining <= 0) {
            setError(`Maximum ${MAX_MEDIA} images/videos allowed per post`);
            return;
        }
        const filesToUpload = files.slice(0, remaining);
        if (files.length > remaining) {
            setError(`Only ${remaining} more file(s) can be added (max ${MAX_MEDIA})`);
        }

        setUploading(true);
        const uploaded = [];
        for (const file of filesToUpload) {
            const isVideo = file.type.startsWith('video/');
            const folder = isVideo ? 'videos' : 'photos';
            try {
                if (isVideo) {
                    // Direct-to-Supabase upload for videos (bypasses Vercel body limit)
                    const _uploadToken = getAccessToken();
                    if (!_uploadToken) {
                        setError('Authentication required — please refresh the page and try again.');
                        continue;
                    }
                    const metaRes = await fetch('/api/social/upload-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${_uploadToken}`,
                        },
                        body: JSON.stringify({
                            fileName: file.name,
                            fileSize: file.size,
                            mimeType: file.type,
                            folder,
                            prefix: user.id,
                        }),
                    });
                    if (!metaRes.ok) {
                        const errBody = await metaRes.json().catch(() => ({}));
                        throw new Error(errBody.error || `Request failed (${metaRes.status})`);
                    }
                    const meta = await metaRes.json();
                    if (!meta.success) {
                        setError('Upload failed: ' + (meta.error || 'Unknown error'));
                        continue;
                    }
                    if (!meta.signedUrl || !meta.signedUrl.startsWith('http')) {
                        setError('Video upload failed: invalid upload URL received');
                        continue;
                    }
                    // Supabase Storage signed-upload endpoint requires raw binary PUT with correct Content-Type.
                    // Vercel serverless functions intercept FormData and fail there, raw bytes are correct.
                    const uploadRes = await fetch(meta.signedUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': file.type },
                        body: file,
                    });
                    if (!uploadRes.ok) {
                        let errDetail = '';
                        try { const t = await uploadRes.text(); errDetail = t ? ` (${t.slice(0, 200)})` : ''; } catch {}
                        console.error('[SharedPostCreator] Video PUT failed', uploadRes.status, errDetail);
                        setError(`Video upload failed (${uploadRes.status})${errDetail} — please try again`);
                        continue;
                    }
                    uploaded.push({ type: 'video', url: meta.publicUrl });
                } else {
                    // Compress image before upload (skip GIFs, small files)
                    const compressedFile = await compressImage(file);
                    if (compressedFile.size > 4.5 * 1024 * 1024) {
                        setError(`Image ${file.name.substring(0,20)}... is too large (max 4.5MB). Please choose a smaller image.`);
                        continue;
                    }
                    const formData = new FormData();
                    formData.append('file', compressedFile);
                    formData.append('folder', folder);
                    formData.append('prefix', user.id);
                    const _imgToken = getAccessToken();
                    if (!_imgToken) {
                        setError('Authentication required — please refresh the page and try again.');
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
                        uploaded.push({ type: json.type || 'photo', url: json.url });
                    } else {
                        console.error('[SharedPostCreator] Upload failed:', json.error);
                        setError('Upload failed: ' + (json.error || 'Unknown error'));
                    }
                }
            } catch (err) {
                console.error('[SharedPostCreator] Upload error:', err);
                setError('Upload failed: ' + err.message);
            }
        }
        setMedia(prev => [...prev, ...uploaded]);
        setUploading(false);
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
            try { if (value.trim()) localStorage.setItem('sp-post-draft', value); else localStorage.removeItem('sp-post-draft'); } catch {}
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
                            console.error('Link preview API error:', apiError);
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
                    console.error('Link preview error:', err);
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
                            .select('id, username, full_name')
                            .ilike('username', `%${query}%`)
                            .limit(5);
                        if (data) setMentionResults(data);
                    } catch (e) { console.error(e); }
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
        if (isPosting) return;
        if (!content.trim() && !media.length && !linkPreview && !checkInVenue) return;
        setError('');
        let urls = media.map(m => m.url);
        let type = media.some(m => m.type === 'video') ? 'video' : media.length ? 'photo' : 'text';
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
                    setError(`❌ ${validation.error}`);
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
        
        const ok = await onPost(cleanContent, urls, type, mentions, linkPreview, postVisibility);
        if (ok) {
            if (checkInVenue) {
                try {
                    const token = await getAccessToken();
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
            setContent(''); setMedia([]); setLinkPreview(null); try { localStorage.removeItem('sp-post-draft'); } catch {}
        }
        else setError('Unable to post at this time. Please try again later.');
    };

    // Determine display identity:
    // If context is 'social-pages', use the authorOverride
    // If context is 'social-media', use club page override IF active, otherwise standard user
    let postingAs = { name: user?.name, avatar: user?.avatar };
    
    if (context === 'social-pages' && authorOverride) {
        postingAs = { name: authorOverride.name, avatar: authorOverride.avatar_url };
    } else if (isClubMode && clubPage) {
        postingAs = { name: clubPage.name, avatar: clubPage.avatar_url };
    }

    return (
        <div style={{ background: C.card, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, position: 'relative' }}>
            {/* Identity Switcher Banner - only for Commander users (social-media context only) */}
            {context === 'social-media' && hasClubPage && (
                <div ref={identityPickerRef} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', transition: 'background 0.3s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSec }}>
                        <span>Posting As</span>
                        <button
                            onClick={() => setShowIdentityPicker(!showIdentityPicker)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: isClubMode ? '#E7F3FF' : '#F0F2F5',
                                border: `1px solid ${isClubMode ? '#1877F2' : C.border}`,
                                borderRadius: 20, padding: '4px 12px 4px 4px',
                                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                color: isClubMode ? '#1877F2' : C.text,
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%',
                                background: postingAs.avatar ? `url(${postingAs.avatar}) center/cover` : (isClubMode ? '#1877F2' : '#65676B'),
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
                            border: `1px solid ${C.border}`, minWidth: 220, overflow: 'hidden'
                        }}>
                            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: C.textSec, borderBottom: `1px solid ${C.border}` }}>
                                Switch Identity
                            </div>
                            <button
                                onClick={() => { switchToPersonal(); setShowIdentityPicker(false); toast.success('Switched to personal account', 2000); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                    padding: '10px 12px', border: 'none', cursor: 'pointer',
                                    background: !isClubMode ? '#E7F3FF' : 'transparent',
                                    textAlign: 'left', transition: 'background 0.15s'
                                }}
                                onMouseEnter={e => { if (isClubMode) e.currentTarget.style.background = '#F0F2F5'; }}
                                onMouseLeave={e => { if (isClubMode) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <Avatar src={user?.avatar} name={user?.name} size={36} />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{user?.name || 'You'}</div>
                                    <div style={{ fontSize: 12, color: C.textSec }}>Personal Account</div>
                                </div>
                                {!isClubMode && <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>}
                            </button>
                            <button
                                onClick={() => { switchToClub(); setShowIdentityPicker(false); toast.success(`Now posting as ${clubPage?.name || 'Club'}`, 2000); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                    padding: '10px 12px', border: 'none', cursor: 'pointer',
                                    background: isClubMode ? '#E7F3FF' : 'transparent',
                                    textAlign: 'left', transition: 'background 0.15s'
                                }}
                                onMouseEnter={e => { if (!isClubMode) e.currentTarget.style.background = '#F0F2F5'; }}
                                onMouseLeave={e => { if (!isClubMode) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <Avatar src={clubPage?.avatar_url} name={clubPage?.name || 'Club'} size={36} />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{clubPage?.name || 'Club Page'}</div>
                                    <div style={{ fontSize: 12, color: C.textSec }}>Club Page</div>
                                </div>
                                {isClubMode && <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>}
                            </button>
                        </div>
                    )}
                </div>
            )}
            <div style={{ padding: 12, display: 'flex', gap: 8, transition: 'all 0.25s ease' }}>
                {context === 'social-pages' && authorOverride ? (
                    <div style={{ display: 'block', flexShrink: 0 }}>
                        <Avatar src={authorOverride.avatar_url} name={authorOverride.name} size={40} />
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
                        placeholder={context === 'social-pages' ? `Post as ${postingAs.name}...` : (isClubMode ? `Post as ${clubPage?.name || 'Club'}...` : `What's on your mind, ${user?.name || 'Player'}?`)}
                        style={{ width: '100%', background: C.bg, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 16, outline: 'none', boxSizing: 'border-box', color: C.text }}
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
                                        {u.full_name && <div style={{ fontSize: 12, color: C.textSec }}>{u.full_name}</div>}
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
                                    <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <img src={m.url} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                <button
                                    onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))}
                                    style={{
                                        position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer',
                                        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >×</button>
                                {m.type === 'video' && (
                                    <div style={{
                                        position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.7)',
                                        padding: '2px 6px', borderRadius: 4, color: 'white', fontSize: 10
                                    }}>VIDEO</div>
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
            {error && <div style={{ padding: '0 12px 8px', color: C.red, fontSize: 13 }}> {error}</div>}
            <div style={{ borderTop: `1px solid ${C.border}` }}>
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFiles} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 8px 4px', gap: 4 }}>
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={media.length >= MAX_MEDIA}
                        style={{
                            padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: media.length >= MAX_MEDIA ? 'not-allowed' : 'pointer',
                            color: media.length >= MAX_MEDIA ? '#ccc' : '#65676B', fontSize: 14, fontWeight: 600, transition: 'background 0.2s', whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >{uploading ? 'Uploading...' : 'Photo/Video'}</button>
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
                    <button onClick={handlePost} disabled={isPosting || (!content.trim() && !media.length && !linkPreview && !checkInVenue)} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: C.blue, color: 'white', fontWeight: 600, cursor: 'pointer', opacity: isPosting || (!content.trim() && !media.length && !linkPreview && !checkInVenue) ? 0.5 : 1, flex: 1 }}>Post</button>
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
