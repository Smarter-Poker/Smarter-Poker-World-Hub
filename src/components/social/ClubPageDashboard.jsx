/**
 * ClubPageDashboard — extracted from pages/hub/social-media.js
 * Owner management dashboard for a Club Page (posts, photos, schedule, live games, followers).
 */
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

// Shared color theme (Facebook-style light)
const C = {
    bg: '#18191A', card: '#242526', text: '#E4E6EB', textSec: '#B0B3B8',
    border: '#3A3B3C', blue: '#2D88FF', blueHover: '#1A7AFF', green: '#42B72A', red: '#FA383E',
};

// Utility helpers
const timeAgo = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

function Avatar({ src, name, size = 40, online, onClick, linkTo }) {
    const router = useRouter();
    const handleClick = onClick || (linkTo ? () => router.push(linkTo) : null);
    return (
        <div style={{ position: 'relative', display: 'inline-block', cursor: handleClick ? 'pointer' : 'default' }} onClick={handleClick}>
            <img src={src || '/default-avatar.png'} alt={name || 'User'} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
            {online !== undefined && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: online ? C.green : '#ccc', border: '2px solid white' }} />}
        </div>
    );
}

const AMENITIES_LIST = [
    {
        cat: 'Dining & Beverages', items: [
            { k: 'food_service', l: 'Food Service' }, { k: 'food_tableside', l: 'Food Tableside' },
            { k: 'order_food_at_table', l: 'Order Food at Table' }, { k: 'full_bar', l: 'Full Bar' },
            { k: 'cocktail_service', l: 'Cocktail Service' }, { k: 'self_serve_drinks', l: 'Self Serve Drink Station' },
            { k: 'snack_bar', l: 'Snack Bar' }, { k: 'room_service', l: 'Room Service' },
        ]
    },
    {
        cat: 'Parking & Lodging', items: [
            { k: 'free_parking', l: 'Free Parking' }, { k: 'self_parking', l: 'Self Parking' },
            { k: 'valet_parking', l: 'Valet Parking' }, { k: 'parking_garage', l: 'Parking Garage' },
            { k: 'hotel_onsite', l: 'Hotel On-Site' }, { k: 'discounted_hotel', l: 'Discounted Hotel Rates' },
        ]
    },
    {
        cat: 'Player Services', items: [
            { k: 'phone_in_list', l: 'Phone-in Waitlist' }, { k: 'check_cashing', l: 'Check Cashing' },
            { k: 'currency_exchange', l: 'Currency Exchange' }, { k: 'safe_deposit', l: 'Safe Deposit Boxes' },
            { k: 'atm_onsite', l: 'ATM On-Site' }, { k: 'coat_check', l: 'Coat Check' },
        ]
    },
    {
        cat: 'Player Perks', items: [
            { k: 'comps_program', l: 'Comps Program' }, { k: 'loyalty_program', l: 'Loyalty Program' },
            { k: 'rewards_card', l: 'Player Rewards Card' }, { k: 'hourly_drawings', l: 'Hourly Drawings' },
            { k: 'jackpot_promos', l: 'Jackpot Promotions' },
        ]
    },
    {
        cat: 'Comfort & Environment', items: [
            { k: 'non_smoking', l: 'Non-Smoking' }, { k: 'smoking_area', l: 'Smoking Area' },
            { k: 'massage', l: 'Massage Service' }, { k: 'nearby_restrooms', l: 'Nearby Restrooms' },
            { k: 'wifi', l: 'Free WiFi' }, { k: 'usb_chargers', l: 'USB Chargers' },
            { k: 'charging_stations', l: 'Charging Stations' }, { k: 'televisions', l: 'Televisions' },
            { k: 'tvs_at_tables', l: 'TVs at Tables' },
        ]
    },
    {
        cat: 'Table Features', items: [
            { k: 'auto_shufflers', l: 'Auto Shufflers' }, { k: 'rfid_tables', l: 'RFID Tables' },
            { k: 'live_streaming', l: 'Live Streaming' },
        ]
    },
    {
        cat: 'Facility', items: [
            { k: 'private_room', l: 'Private Card Room' }, { k: 'high_limit', l: 'High-Limit Room' },
            { k: 'tournament_room', l: 'Tournament Room' }, { k: 'membership_required', l: 'Membership Required' },
        ]
    },
];
const CATEGORY_LABELS = { poker_room: 'Poker Room', casino: 'Casino', card_club: 'Card Club', charity: 'Charity Organization', league: 'League / Tour', home_game: 'Home Game', other: 'Other' };
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

export default function ClubPageDashboard({ C, page, userId, onBack, onPageUpdated, onGoLive }) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('posts');
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [postContent, setPostContent] = useState('');
    const [posting, setPosting] = useState(false);
    const [editingPage, setEditingPage] = useState(false);
    const [editName, setEditName] = useState(page.name || '');
    const [editDesc, setEditDesc] = useState(page.description || '');
    const [editWebsite, setEditWebsite] = useState(page.website || '');
    const [editPhone, setEditPhone] = useState(page.phone || '');
    const [editAvatarUrl, setEditAvatarUrl] = useState(page.avatar_url || '');
    const [editCity, setEditCity] = useState(page.location_city || '');
    const [editState, setEditState] = useState(page.location_state || '');
    const [editAddress, setEditAddress] = useState((page.metadata || {}).address || '');
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const isDraft = !page.is_public || page.metadata?.needs_setup;
    const [showPreview, setShowPreview] = useState(false);
    const [qrData, setQrData] = useState(null);
    const [qrLoading, setQrLoading] = useState(false);

    // ── Setup Completion Tracker ──
    const meta = page.metadata || {};
    const completionChecks = [
        { key: 'logo', label: 'Upload a logo', done: !!(meta.logo_url || page.avatar_url) },
        { key: 'cover', label: 'Add a cover photo', done: !!(meta.cover_photo_url || page.cover_url) },
        { key: 'description', label: 'Write a description', done: !!(page.description && page.description.length > 10) },
        { key: 'schedule', label: 'Set your schedule', done: !!meta.run_schedule && Object.values(meta.run_schedule).some(d => d && d.open) },
        { key: 'post', label: 'Create your first post', done: posts.length > 0 },
    ];
    const completedCount = completionChecks.filter(c => c.done).length;
    const completionPct = Math.round((completedCount / completionChecks.length) * 100);

    // ── JWT Auth Helper: ensures all mutation calls include the Bearer token ──
    const getAuthHeaders = async () => {
        const headers = { 'Content-Type': 'application/json' };
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }
        } catch (e) { /* will fall through without auth — server will reject if required */ }
        return headers;
    };

    // Enhanced state — Photos, Schedule, Tournaments, Amenities
    // (meta is already declared above in completion tracker)
    const [photos, setPhotos] = useState(meta.photos || []);
    const [newPhotoUrl, setNewPhotoUrl] = useState('');
    const [newPhotoCaption, setNewPhotoCaption] = useState('');
    const [schedule, setSchedule] = useState(() => {
        const s = meta.run_schedule || {};
        const init = {};
        DAYS.forEach(d => { init[d] = { open: false, hours: '', games: [], location: '', ...(s[d] || {}) }; });
        return init;
    });
    const [newGame, setNewGame] = useState({});
    const [tournaments, setTournaments] = useState([]);
    const [amenities, setAmenities] = useState(meta.amenities || {});
    const [socialLinks, setSocialLinks] = useState(meta.social_links || { facebook: '', instagram: '', twitter: '' });
    const [metaSaving, setMetaSaving] = useState(false);
    const [metaSaved, setMetaSaved] = useState('');

    // Fetch tournaments on mount (always, so floating Live Event button works on all tabs)
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        (async () => {
            try {
                const res = await fetch(`/api/public/venue/${page.id}`, { signal: controller.signal });
                const data = await res.json();
                if (!cancelled && data.success) {
                    setTournaments(data.data.upcoming_tournaments || []);
                }
            } catch (err) { if (err.name !== 'AbortError') console.error('Failed to load tournaments:', err); }
        })();
        return () => { cancelled = true; controller.abort(); };
    }, [page.id]);

    // Live Games state
    const [liveGames, setLiveGames] = useState([]);
    const [loadingGames, setLoadingGames] = useState(false);
    // Timer tick for live countdown clocks
    const [timerTick, setTimerTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTimerTick(p => p + 1), 1000);
        return () => clearInterval(t);
    }, []);
    const [pendingFollowers, setPendingFollowers] = useState([]);

    // Cover photo state
    const [coverPhoto, setCoverPhoto] = useState((page.metadata || {}).cover_photo_url || page.cover_url || '');
    const [coverUploading, setCoverUploading] = useState(false);
    const coverInputRef = useRef(null);

    // Logo upload state
    const [logoUrl, setLogoUrl] = useState((page.metadata || {}).logo_url || page.avatar_url || '');
    const [logoUploading, setLogoUploading] = useState(false);
    const logoInputRef = useRef(null);

    // Post media upload state
    const [postMedia, setPostMedia] = useState([]);
    const [postUploading, setPostUploading] = useState(false);
    const postMediaRef = useRef(null);

    const handleCoverUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCoverUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'covers');
            formData.append('prefix', page.id);
            const { data: { session: _coverSess } } = await supabase.auth.getSession();
            const uploadRes = await fetch('/api/social/upload', {
                method: 'POST',
                headers: _coverSess?.access_token ? { Authorization: `Bearer ${_coverSess.access_token}` } : {},
                body: formData,
            });
            const uploadJson = await uploadRes.json();
            if (uploadJson.success && uploadJson.url) {
                const url = uploadJson.url;
                setCoverPhoto(url);
                // Save to both metadata.cover_photo_url AND cover_url column so public page stays in sync
                const merged = { ...page.metadata, cover_photo_url: url };
                setMetaSaving(true); setMetaSaved('');
                try {
                    const saveHeaders = await getAuthHeaders();
                    const res = await fetch('/api/social/pages', {
                        method: 'PUT', headers: saveHeaders,
                        body: JSON.stringify({ id: page.id, owner_id: userId, cover_url: url, metadata: merged }),
                    });
                    const json = await res.json();
                    if (json.success && json.data) {
                        onPageUpdated(json.data);
                        setMetaSaved('Cover photo updated!');
                        setTimeout(() => setMetaSaved(''), 2000);
                    }
                } catch (saveErr) { console.error('Cover save error:', saveErr); }
                setMetaSaving(false);
            } else {
                alert('Cover upload failed: ' + (uploadJson.error || 'Unknown error'));
            }
        } catch (err) { console.error('Cover upload error:', err); alert('Cover upload error: ' + err.message); }
        setCoverUploading(false);
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'logos');
            formData.append('prefix', page.id);
            const { data: { session: _logoSess } } = await supabase.auth.getSession();
            const uploadRes = await fetch('/api/social/upload', {
                method: 'POST',
                headers: _logoSess?.access_token ? { Authorization: `Bearer ${_logoSess.access_token}` } : {},
                body: formData,
            });
            const uploadJson = await uploadRes.json();
            if (uploadJson.success && uploadJson.url) {
                const url = uploadJson.url;
                setLogoUrl(url);
                // Save to both metadata.logo_url AND avatar_url column so public page stays in sync
                const merged = { ...page.metadata, logo_url: url };
                setMetaSaving(true); setMetaSaved('');
                try {
                    const saveHeaders = await getAuthHeaders();
                    const res = await fetch('/api/social/pages', {
                        method: 'PUT', headers: saveHeaders,
                        body: JSON.stringify({ id: page.id, owner_id: userId, avatar_url: url, metadata: merged }),
                    });
                    const json = await res.json();
                    if (json.success && json.data) {
                        onPageUpdated(json.data);
                        setMetaSaved('Logo updated!');
                        setTimeout(() => setMetaSaved(''), 2000);
                    }
                } catch (saveErr) { console.error('Logo save error:', saveErr); }
                setMetaSaving(false);
            } else {
                alert('Logo upload failed: ' + (uploadJson.error || 'Unknown error'));
            }
        } catch (err) { console.error('Logo upload error:', err); alert('Logo upload error: ' + err.message); }
        setLogoUploading(false);
        if (logoInputRef.current) logoInputRef.current.value = '';
    };

    const handlePostMediaSelect = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const remaining = 10 - postMedia.length;
        if (remaining <= 0) return;
        const toUpload = files.slice(0, remaining);
        setPostUploading(true);
        const uploaded = [];
        for (const file of toUpload) {
            const isVideo = file.type.startsWith('video/');
            try {
                if (isVideo) {
                    // Direct-to-Supabase upload for videos (bypasses Vercel body limit)
                    const { data: { session: _clubVidSess } } = await supabase.auth.getSession();
                    const metaRes = await fetch('/api/social/upload-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(_clubVidSess?.access_token ? { Authorization: `Bearer ${_clubVidSess.access_token}` } : {}),
                        },
                        body: JSON.stringify({
                            fileName: file.name,
                            fileSize: file.size,
                            mimeType: file.type,
                            folder: 'club-posts',
                            prefix: page.id,
                        }),
                    });
                    const meta = await metaRes.json();
                    if (!meta.success) {
                        alert('Upload failed: ' + (meta.error || 'Unknown error'));
                        continue;
                    }
                    const uploadRes = await fetch(meta.signedUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': file.type },
                        body: file,
                    });
                    if (!uploadRes.ok) {
                        alert('Video upload failed — please try again');
                        continue;
                    }
                    uploaded.push({ type: 'video', url: meta.publicUrl });
                } else {
                    // Keep existing API for images (small files)
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('folder', 'club-posts');
                    formData.append('prefix', page.id);
                    const { data: { session: _clubImgSess } } = await supabase.auth.getSession();
                    const res = await fetch('/api/social/upload', {
                        method: 'POST',
                        headers: _clubImgSess?.access_token ? { Authorization: `Bearer ${_clubImgSess.access_token}` } : {},
                        body: formData,
                    });
                    const json = await res.json();
                    if (json.success && json.url) {
                        uploaded.push({ type: json.type || 'photo', url: json.url });
                    } else {
                        console.error('[ClubPage] Upload failed:', json.error);
                        alert('Upload failed: ' + (json.error || 'Unknown error'));
                    }
                }
            } catch (err) {
                console.error('[ClubPage] Upload error:', err);
                alert('Upload failed: ' + err.message);
            }
        }
        setPostMedia(prev => [...prev, ...uploaded]);
        setPostUploading(false);
        if (postMediaRef.current) postMediaRef.current.value = '';
    };

    // Fetch live games
    useEffect(() => {
        if (activeTab === 'live_games') {
            const fetchGames = async () => {
                setLoadingGames(true);
                const controller = new AbortController();
                try {
                    const res = await fetch(`/api/social/pages/games?page_id=${page.id}`, { signal: controller.signal });
                    const json = await res.json();
                    if (json.success) { setLiveGames(json.data || []); setTimerTick(0); }
                } catch (e) { if (e.name !== 'AbortError') console.error('Games fetch error:', e); }
                setLoadingGames(false);
            };
            const fetchPending = async () => {
                const controller = new AbortController();
                try {
                    const res = await fetch(`/api/social/pages/follow?page_id=${page.id}&requester_id=${userId}`, { signal: controller.signal });
                    const json = await res.json();
                    if (json.success) setPendingFollowers((json.data || []).filter(f => f.status === 'pending'));
                } catch (e) { if (e.name !== 'AbortError') console.error('Pending fetch error:', e); }
            };
            fetchGames();
            fetchPending();
            const interval = setInterval(() => { fetchGames(); fetchPending(); }, 15000);
            return () => clearInterval(interval);
        }
    }, [activeTab, page.id]);

    const handleApproveFollower = async (followerId, action) => {
        try {
            await fetch('/api/social/pages/follow', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_id: page.id, user_id: userId, action, follower_id: followerId }),
            });
            setPendingFollowers(prev => prev.filter(f => f.user_id !== followerId));
        } catch (e) { console.error('Approve/reject error:', e); }
    };

    // Save metadata helper
    const saveMetadata = async (newMeta, label) => {
        setMetaSaving(true); setMetaSaved('');
        try {
            const merged = { ...page.metadata, ...newMeta };
            const authHeaders = await getAuthHeaders();
            const res = await fetch('/api/social/pages', {
                method: 'PUT', headers: authHeaders,
                body: JSON.stringify({ id: page.id, owner_id: userId, metadata: merged }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                onPageUpdated(json.data);
                setMetaSaved(label || 'Saved!');
                setTimeout(() => setMetaSaved(''), 2000);

                // Auto-geocode locations in background (fire-and-forget)
                try {
                    const locations = [];
                    if (json.data.location_city) {
                        locations.push(json.data.location_city + (json.data.location_state ? ', ' + json.data.location_state : ''));
                    }
                    const sched = merged.run_schedule || newMeta.run_schedule;
                    if (sched) {
                        Object.values(sched).forEach(day => {
                            if (day && day.open && day.location && day.location.trim()) {
                                locations.push(day.location.trim());
                            }
                        });
                    }
                    const existing = merged.geocoded_locations || {};
                    const unique = [...new Set(locations)].filter(loc => !existing[loc]);
                    if (unique.length > 0) {
                        fetch('/api/social/geocode-locations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ page_id: page.id, locations: unique }),
                        }).catch(() => { });
                    }
                } catch (geoErr) {
                }
            }
        } catch (e) { console.error('Meta save error:', e); setMetaSaved('Error saving'); }
        setMetaSaving(false);
    };

    // Fetch posts
    useEffect(() => {
        const fetchPosts = async () => {
            setLoadingPosts(true);
            try {
                const res = await fetch(`/api/social/pages/posts?page_id=${page.id}&user_id=${userId}`, { signal });
                const json = await res.json();
                if (json.success) setPosts(json.data || []);
            } catch (e) { console.error('Club page posts fetch error:', e); }
            setLoadingPosts(false);
        };

        fetchPosts();
    }, [page.id, userId]);

    const handlePost = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!postContent.trim() && postMedia.length === 0) return;
        setPosting(true);
        try {
            const mediaUrls = postMedia.map(m => m.url);
            const contentType = postMedia.some(m => m.type === 'video') ? 'video' : (postMedia.length > 0 ? 'image' : 'text');
            const res = await fetch('/api/social/pages/posts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_id: page.id, author_id: userId, content: postContent.trim(), content_type: contentType, media_urls: mediaUrls }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                setPosts(prev => [{ ...json.data, author: { username: 'You' }, user_liked: false }, ...prev]);
                setPostContent('');
                setPostMedia([]);
            } else if (json.error) {
                alert('Post failed: ' + json.error);
            }
        } catch (e) {
            console.error('Post error:', e);
            alert('Post failed: ' + e.message);
        }
        setPosting(false);
    };

    const handleDeletePost = async (postId) => {
        try { await fetch(`/api/social/pages/posts?id=${postId}&author_id=${userId}`, { method: 'DELETE' }); setPosts(prev => prev.filter(p => p.id !== postId)); } catch (e) { console.error('Delete error:', e); }
    };

    const handleSavePage = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        setSaving(true);
        try {
            // Merge address into metadata and clear draft flags on save
            const updatedMetadata = { ...page.metadata, address: editAddress.trim() };
            // Auto-publish on save: if page was a draft, publishing it when the user saves edits
            if (updatedMetadata.needs_setup) delete updatedMetadata.needs_setup;
            if (updatedMetadata.status === 'draft') updatedMetadata.status = 'published';

            const body = {
                id: page.id, owner_id: userId, name: editName.trim(), description: editDesc.trim(),
                website: editWebsite.trim(), phone: editPhone.trim(),
                avatar_url: editAvatarUrl.trim() || null, location_city: editCity.trim(),
                location_state: editState.trim(), metadata: updatedMetadata,
                is_public: true, // Always publish when user saves edits
            };
            const authHeaders = await getAuthHeaders();
            const res = await fetch('/api/social/pages', {
                method: 'PUT', headers: authHeaders,
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (json.success && json.data) { onPageUpdated(json.data); setEditingPage(false); }
        } catch (e) { console.error('Save error:', e); }
        setSaving(false);
    };

    // Publish page (separate from save — for the draft banner button)
    const publishPage = async () => {
        setPublishing(true);
        try {
            const updatedMetadata = { ...page.metadata };
            delete updatedMetadata.needs_setup;
            if (updatedMetadata.status === 'draft') updatedMetadata.status = 'published';
            const authHeaders = await getAuthHeaders();
            const res = await fetch('/api/social/pages', {
                method: 'PUT', headers: authHeaders,
                body: JSON.stringify({
                    id: page.id, owner_id: userId,
                    is_public: true,
                    metadata: updatedMetadata
                }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                onPageUpdated(json.data);
                // Auto-fetch QR code after publishing
                fetchQrCode(json.data.id);
            }
        } catch (e) { console.error('Publish error:', e); }
        setPublishing(false);
    };

    // Fetch QR code for published pages
    const fetchQrCode = async (pageId) => {
        setQrLoading(true);
        try {
            const res = await fetch(`/api/social/pages/qrcode?page_id=${pageId || page.id}`);
            const json = await res.json();
            if (json.success && json.data) setQrData(json.data);
        } catch (e) { console.error('QR code fetch error:', e); }
        setQrLoading(false);
    };

    // Load QR code on mount if page is already published
    useEffect(() => {
        if (page.is_public && !page.metadata?.needs_setup) fetchQrCode();
    }, [page.is_public]);

    const handleTogglePin = async (post) => {
        try {
            await fetch('/api/social/pages/posts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: post.id, author_id: userId, is_pinned: !post.is_pinned }) });
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_pinned: !p.is_pinned } : p));
        } catch (e) { console.error('Pin error:', e); }
    };

    const inputSt = { width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
    const labelSt = { display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 };
    const btnPrimary = { padding: '8px 20px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
    const btnSec = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
    const cardSt = { background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 };
    const savedBadge = metaSaved ? <span style={{ fontSize: 12, color: metaSaved === 'Error saving' ? '#F02849' : '#42B72A', fontWeight: 600, marginLeft: 8 }}>{metaSaved}</span> : null;

    const tabs = [
        { key: 'posts', label: 'Posts' },
        { key: 'photos', label: 'Photos' },
        { key: 'schedule', label: 'Schedule' },
        { key: 'tournaments', label: 'Tourneys' },
        { key: 'amenities', label: 'Amenities' },
        { key: 'live_games', label: 'Live Games' },
        { key: 'about', label: 'About' },
    ];

    return (
        <div style={{ paddingBottom: 8 }}>
            {/* Header */}
            <div style={{ background: C.card, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
                {/* Cover Photo Area */}
                <div style={{
                    height: 200, position: 'relative',
                    background: coverPhoto ? `url(${coverPhoto}) center/cover no-repeat` : 'linear-gradient(135deg, #1877F2 0%, #166FE5 50%, #1877F2 100%)',
                    display: 'flex', alignItems: 'flex-end', padding: 16
                }}>
                    {/* Edit Cover Photo button */}
                    <input type="file" accept="image/*" ref={coverInputRef} onChange={handleCoverUpload} style={{ display: 'none' }} />
                    <button onClick={() => coverInputRef.current?.click()} disabled={coverUploading} style={{
                        position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13, fontWeight: 600,
                        fontFamily: 'inherit', backdropFilter: 'blur(4px)'
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                        </svg>
                        {coverUploading ? 'Uploading...' : 'Upload Photo'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input type="file" accept="image/*" ref={logoInputRef} onChange={handleLogoUpload} style={{ display: 'none' }} />
                        <div
                            onClick={() => logoInputRef.current?.click()}
                            title="Click To Upload Logo"
                            style={{
                                width: 80, height: 80, borderRadius: '50%', background: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 30, fontWeight: 800, color: '#1877F2', border: '3px solid #fff',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer',
                                position: 'relative', overflow: 'hidden'
                            }}
                        >
                            {logoUrl ? (
                                <img src={logoUrl} alt={page.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            ) : (
                                (page.name || 'C')[0].toUpperCase()
                            )}
                            <div style={{
                                position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: '50%',
                                background: '#3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                                </svg>
                            </div>
                            {logoUploading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1877F2', borderRadius: '50%' }}>...</div>}
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>{page.name}</h2>
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                                {page.follower_count || 0} follower{(page.follower_count || 0) !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ═══ DRAFT BANNER with Setup Completion Tracker ═══ */}
                {isDraft && (
                    <div style={{
                        padding: '16px', background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.06) 100%)',
                        borderBottom: '2px solid rgba(245,158,11,0.3)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%', background: 'rgba(245,158,11,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 18, fontWeight: 700, color: '#F59E0B'
                                }}>⚠</div>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F59E0B' }}>Draft — Not Published Yet</div>
                                    <div style={{ fontSize: 12, color: '#B0B3B8' }}>{completionPct}% complete — {completedCount}/{completionChecks.length} steps done</div>
                                </div>
                            </div>
                            <button onClick={publishPage} disabled={publishing} style={{
                                padding: '10px 24px', borderRadius: 8, border: 'none',
                                background: completionPct === 100 ? '#42B72A' : '#4E4F50',
                                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'inherit', boxShadow: completionPct === 100 ? '0 2px 8px rgba(66,183,42,0.4)' : 'none',
                                opacity: publishing ? 0.6 : 1, whiteSpace: 'nowrap'
                            }}>{publishing ? 'Publishing...' : '🚀 Publish Page'}</button>
                        </div>
                        {/* Progress Bar */}
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 10 }}>
                            <div style={{ height: '100%', width: `${completionPct}%`, borderRadius: 3, background: completionPct === 100 ? '#42B72A' : '#F59E0B', transition: 'width 0.5s ease' }} />
                        </div>
                        {/* Checklist */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {completionChecks.map(item => (
                                <div key={item.key} style={{
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                                    padding: '4px 10px', borderRadius: 6,
                                    background: item.done ? 'rgba(66,183,42,0.15)' : 'rgba(255,255,255,0.06)',
                                    color: item.done ? '#42B72A' : '#B0B3B8', fontWeight: 600
                                }}>
                                    <span>{item.done ? '✓' : '○'}</span>
                                    <span style={{ textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.7 : 1 }}>{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Bar */}
                <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => { if (window.history.length > 1) router.back(); else onBack(); }} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB',
                        color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Back</button>
                    <button onClick={() => setEditingPage(!editingPage)} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: editingPage ? C.blue : '#E4E6EB',
                        color: editingPage ? '#fff' : C.text,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Edit Page</button>
                    {onGoLive && <button onClick={onGoLive} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB',
                        color: '#E53935', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 6
                    }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E53935', display: 'inline-block' }}></span>Go Live</button>}
                    <button onClick={() => setShowPreview(!showPreview)} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: showPreview ? '#7C3AED' : '#E4E6EB',
                        color: showPreview ? '#fff' : C.text,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>{showPreview ? '✕ Exit Preview' : '👁 Preview as Visitor'}</button>
                    <button onClick={() => router.push(`/club/${page.id}`)} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB',
                        color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto'
                    }}>View Public Page</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderTop: `1px solid ${C.border}` }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            color: activeTab === t.key ? C.blue : C.textSec,
                            fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                            borderBottom: activeTab === t.key ? `3px solid ${C.blue}` : '3px solid transparent'
                        }}>{t.label}</button>
                    ))}
                </div>
            </div>

            {/* Edit Page Panel */}
            {editingPage && (
                <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: C.text }}>Edit Page Info</h3>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Name</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Description</label>
                    <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, resize: 'vertical', marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Website</label>
                            <input value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="https://..."
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Phone</label>
                            <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="(555) 555-5555"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                    </div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4, marginTop: 10 }}>Profile Image URL</label>
                    <input value={editAvatarUrl} onChange={e => setEditAvatarUrl(e.target.value)} placeholder="https://your-image-url.com/logo.png"
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Street Address</label>
                    <input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="123 Main St"
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>City</label>
                            <input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="Las Vegas"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>State</label>
                            <input value={editState} onChange={e => setEditState(e.target.value)} placeholder="NV"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                        <button onClick={() => setEditingPage(false)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={handleSavePage} disabled={saving} style={{
                            padding: '8px 20px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1
                        }}>{saving ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                </div>
            )}

            {/* Posts Tab */}
            {activeTab === 'posts' && (
                <>
                    {/* Post Composer */}
                    <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                                {(page.name || 'C')[0].toUpperCase()}
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Post as {page.name}</span>
                        </div>
                        <textarea
                            value={postContent}
                            onChange={e => setPostContent(e.target.value)}
                            placeholder={`What's happening at ${page.name || 'your venue'}?`}
                            rows={3}
                            style={{
                                width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8,
                                fontSize: 15, outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                                boxSizing: 'border-box', lineHeight: 1.4, color: '#050505', background: '#fff'
                            }}
                        />

                        {/* Media preview thumbnails */}
                        {postMedia.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                {postMedia.map((m, i) => (
                                    <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #CCD0D5' }}>
                                        {m.type === 'video' ? (
                                            <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                        <button onClick={() => setPostMedia(prev => prev.filter((_, j) => j !== i))} style={{
                                            position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                                            background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer',
                                            fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
                                        }}>x</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Media toolbar + Post button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #E4E6EB' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input type="file" accept="image/*,video/*" multiple ref={postMediaRef} onChange={handlePostMediaSelect} style={{ display: 'none' }} />
                                <button onClick={() => postMediaRef.current?.click()} disabled={postUploading} style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                                    border: 'none', background: '#F0F2F5', color: '#1877F2', fontSize: 13,
                                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#45BD62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                                    </svg>
                                    {postUploading ? 'Uploading...' : 'Photo/Video'}
                                </button>
                            </div>
                            <button onClick={handlePost} disabled={posting || postUploading || (!postContent.trim() && postMedia.length === 0)} style={{
                                padding: '8px 24px', borderRadius: 8, border: 'none', background: '#1877F2', color: '#fff',
                                fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                opacity: (posting || postUploading || (!postContent.trim() && postMedia.length === 0)) ? 0.5 : 1
                            }}>{posting ? 'Posting...' : 'Post'}</button>
                        </div>
                    </div>

                    {/* Posts Feed */}
                    {loadingPosts ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ width: 32, height: 32, border: '3px solid #E4E6EB', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                            <p>Loading Posts...</p>
                        </div>
                    ) : posts.length === 0 ? (
                        <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
                            <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Posts Yet</p>
                            <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Share Your First Update With Your Followers!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {posts.map(post => (
                                <div key={post.id} style={{ background: C.card, borderRadius: 10, border: '1px solid #E4E6EB', overflow: 'hidden' }}>
                                    <div style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                                                    {(page.name || 'C')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{page.name}</div>
                                                    <div style={{ fontSize: 11, color: C.textSec }}>{timeAgo(post.created_at)}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {post.is_pinned && <span style={{ fontSize: 10, background: '#FFB800', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>PINNED</span>}
                                                <button onClick={() => handleTogglePin(post)} title={post.is_pinned ? 'Unpin' : 'Pin'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 13, fontWeight: 600 }}>{post.is_pinned ? 'Unpin' : 'Pin'}</button>
                                                <button onClick={() => handleDeletePost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 14 }}>x</button>
                                            </div>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 15, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{post.content}</p>
                                    </div>
                                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '6px 14px', display: 'flex', gap: 16, fontSize: 12, color: C.textSec }}>
                                        <span>{post.like_count || 0} likes</span>
                                        <span>{post.comment_count || 0} comments</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Photos Tab */}
            {activeTab === 'photos' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Photo Gallery</h3>
                        {savedBadge}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        <input value={newPhotoUrl} onChange={e => setNewPhotoUrl(e.target.value)} placeholder="Image URL (https://...)" style={{ ...inputSt, flex: 2, minWidth: 200 }} />
                        <input value={newPhotoCaption} onChange={e => setNewPhotoCaption(e.target.value)} placeholder="Caption (optional)" style={{ ...inputSt, flex: 1, minWidth: 120 }} />
                        <button onClick={() => {
                            if (!newPhotoUrl.trim()) return;
                            const updated = [...photos, { url: newPhotoUrl.trim(), caption: newPhotoCaption.trim(), uploaded_at: new Date().toISOString() }];
                            setPhotos(updated); setNewPhotoUrl(''); setNewPhotoCaption('');
                            saveMetadata({ photos: updated }, 'Photo added!');
                        }} disabled={!newPhotoUrl.trim() || metaSaving} style={{ ...btnPrimary, opacity: !newPhotoUrl.trim() || metaSaving ? 0.5 : 1, whiteSpace: 'nowrap' }}>+ Add Photo</button>
                    </div>
                    {photos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Photos Yet</div>
                            <p style={{ margin: 0, fontSize: 14 }}>No Photos Yet. Add Photos To Showcase Your Venue!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                            {photos.map((photo, i) => (
                                <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: '#1a1a2e' }}>
                                    <img src={photo.url} alt={photo.caption || 'Club photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                    {photo.caption && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '16px 8px 6px', fontSize: 11, color: '#fff' }}>{photo.caption}</div>}
                                    <button onClick={() => {
                                        const updated = photos.filter((_, j) => j !== i);
                                        setPhotos(updated); saveMetadata({ photos: updated }, 'Photo removed');
                                    }} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Schedule Tab */}
            {activeTab === 'schedule' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Weekly Run Schedule</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {savedBadge}
                            <button onClick={() => saveMetadata({ run_schedule: schedule }, 'Schedule saved!')} disabled={metaSaving} style={{ ...btnPrimary, opacity: metaSaving ? 0.5 : 1 }}>
                                {metaSaving ? 'Saving...' : 'Save Schedule'}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {DAYS.map(day => {
                            const d = schedule[day];
                            return (
                                <div key={day} style={{ background: d.open ? 'rgba(24,119,242,0.06)' : '#f5f5f5', borderRadius: 10, padding: '10px 14px', border: `1px solid ${d.open ? 'rgba(24,119,242,0.2)' : '#e4e6eb'}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: d.open ? 8 : 0 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 70 }}>
                                            <input type="checkbox" checked={d.open} onChange={e => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], open: e.target.checked } }))} style={{ width: 18, height: 18, accentColor: C.blue }} />
                                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{day}</span>
                                        </label>
                                        {d.open && (
                                            <input value={d.hours} onChange={e => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], hours: e.target.value } }))} placeholder="e.g. 10am - 4am" style={{ ...inputSt, flex: 1, maxWidth: 180 }} />
                                        )}
                                        {!d.open && <span style={{ fontSize: 13, color: C.textSec, fontStyle: 'italic' }}>Closed</span>}
                                    </div>
                                    {d.open && (
                                        <div style={{ marginLeft: 28 }}>
                                            <input value={d.location || ''} onChange={e => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], location: e.target.value } }))} placeholder="Location (e.g. Chicago, IL)" style={{ ...inputSt, marginBottom: 6, maxWidth: 260 }} />
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                                {(d.games || []).map((g, gi) => (
                                                    <span key={gi} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.blue, color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                                                        {g}
                                                        <button onClick={() => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], games: prev[day].games.filter((_, k) => k !== gi) } }))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 2 }}>×</button>
                                                    </span>
                                                ))}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <input value={newGame[day] || ''} onChange={e => setNewGame(prev => ({ ...prev, [day]: e.target.value }))} placeholder="Add Game (e.g. 1/2 NLH)" onKeyDown={e => {
                                                    if (e.key === 'Enter' && (newGame[day] || '').trim()) {
                                                        setSchedule(prev => ({ ...prev, [day]: { ...prev[day], games: [...(prev[day].games || []), newGame[day].trim()] } }));
                                                        setNewGame(prev => ({ ...prev, [day]: '' }));
                                                    }
                                                }} style={{ ...inputSt, flex: 1 }} />
                                                <button onClick={() => {
                                                    if (!(newGame[day] || '').trim()) return;
                                                    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], games: [...(prev[day].games || []), newGame[day].trim()] } }));
                                                    setNewGame(prev => ({ ...prev, [day]: '' }));
                                                }} style={btnSec}>Add</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tournaments Tab — Read-Only (managed via Commander) */}
            {activeTab === 'tournaments' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Tournament Schedule</h3>
                    </div>
                    {/* Commander-only notice */}
                    <div style={{ background: 'rgba(24,119,242,0.06)', border: '1px solid rgba(24,119,242,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>&#9432;</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Tournament Schedules Are Managed Through Club Commander</div>
                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>Tournaments Added In Commander Automatically Appear Here And On Your Public Page.</div>
                        </div>
                        <button onClick={() => window.open('/commander/tournaments', '_blank')} style={{ ...btnPrimary, whiteSpace: 'nowrap', fontSize: 12 }}>Open Commander</button>
                    </div>
                    {/* Auto-published tournament list (read-only) */}
                    {tournaments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 30, color: C.textSec }}><div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Tournaments Yet</div><p style={{ margin: 0, fontSize: 14 }}>Add Tournaments Through Club Commander To See Them Here.</p></div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {tournaments.map((t, i) => {
                                const d = t.scheduled_start ? new Date(t.scheduled_start) : null;
                                const GLABELS = { NLH: "NL Hold'em", PLO: 'PLO', PLO5: 'PLO-5', PLO8: 'PLO Hi-Lo', nlh: "NL Hold'em", plo: 'PLO', plo5: 'PLO-5', plo8: 'PLO Hi-Lo', mixed: 'Mixed', limit: 'Limit', stud: 'Stud', razz: 'Razz' };
                                const isLive = ['running', 'break', 'final_table'].includes(t.status);
                                const isCompleted = t.status === 'completed';
                                const statusColor = isLive ? '#42B72A' : isCompleted ? '#B0B3B8' : '#1877F2';
                                const statusLabel = isLive ? (t.status === 'break' ? 'BREAK' : t.status === 'final_table' ? 'FINAL TABLE' : 'LIVE') : isCompleted ? 'Completed' : 'Upcoming';
                                const prizePool = (t.current_entries || 0) * (t.buyin_amount || 0);
                                return (
                                    <div key={t.id || i}
                                        onClick={() => t.id && window.open(`/commander/tournaments/${t.id}/public`, '_blank')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                                            background: isLive ? 'rgba(66,183,42,0.04)' : '#f5f5f5',
                                            borderRadius: 10,
                                            border: isLive ? '1px solid rgba(66,183,42,0.25)' : '1px solid #e4e6eb',
                                            cursor: t.id ? 'pointer' : 'default', transition: 'all 0.15s'
                                        }}>
                                        {d && <div style={{ minWidth: 44, textAlign: 'center', background: '#fff', borderRadius: 8, padding: '4px 6px', border: '1px solid #e4e6eb' }}>
                                            <div style={{ fontSize: 10, color: C.textSec, textTransform: 'uppercase', fontWeight: 700 }}>{d.toLocaleDateString('en-US', { month: 'short' })}</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{d.getDate()}</div>
                                        </div>}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 800, color: statusColor, textTransform: 'uppercase',
                                                    letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    padding: '2px 6px', borderRadius: 4,
                                                    background: isLive ? 'rgba(66,183,42,0.12)' : isCompleted ? 'rgba(176,179,184,0.12)' : 'rgba(24,119,242,0.08)'
                                                }}>
                                                    {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#42B72A', animation: 'pulse 1.5s infinite' }} />}
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                                                {d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                                                {t.game_type ? ` · ${GLABELS[t.game_type] || t.game_type}` : ''}
                                                {t.buyin_amount ? ` · $${t.buyin_amount} Buy-in` : ''}
                                                {t.guaranteed_prize ? ` · $${t.guaranteed_prize.toLocaleString()} GTD` : ''}
                                            </div>
                                            {(isLive || isCompleted) && (
                                                <div style={{ fontSize: 11, color: isLive ? '#42B72A' : C.textSec, marginTop: 3, fontWeight: 600 }}>
                                                    {isLive && t.players_remaining ? `${t.players_remaining} players remaining` : ''}
                                                    {isLive && t.players_remaining && prizePool > 0 ? ' · ' : ''}
                                                    {prizePool > 0 ? `$${prizePool.toLocaleString()} prize pool` : ''}
                                                    {isLive && !t.players_remaining && t.current_entries ? `${t.current_entries} entries` : ''}
                                                </div>
                                            )}
                                        </div>
                                        {t.id && <span style={{ fontSize: 14, color: C.textSec }}>›</span>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Amenities Tab */}
            {activeTab === 'amenities' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Venue Amenities</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {savedBadge}
                            <button onClick={() => saveMetadata({ amenities }, 'Amenities saved!')} disabled={metaSaving} style={{ ...btnPrimary, opacity: metaSaving ? 0.5 : 1 }}>
                                {metaSaving ? 'Saving...' : 'Save Amenities'}
                            </button>
                        </div>
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textSec }}>Toggle The Amenities Your Venue Offers. Visitors Will See These On Your Public Page.</p>
                    {AMENITIES_LIST.map(cat => (
                        <div key={cat.cat} style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat.cat}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
                                {cat.items.map(item => (
                                    <label key={item.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: amenities[item.k] ? 'rgba(24,119,242,0.08)' : '#f5f5f5', border: `1px solid ${amenities[item.k] ? 'rgba(24,119,242,0.3)' : '#e4e6eb'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                                        <input type="checkbox" checked={!!amenities[item.k]} onChange={e => setAmenities(prev => ({ ...prev, [item.k]: e.target.checked }))} style={{ width: 16, height: 16, accentColor: C.blue }} />
                                        <span style={{ fontSize: 13, color: C.text }}>{item.l}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pending Follow Requests — visible above all tabs */}
            {pendingFollowers.length > 0 && (
                <div style={{ ...cardSt, marginBottom: 8 }}>
                    <div style={{ marginBottom: 0, borderRadius: 10, border: '2px solid #f59e0b', background: '#fffbeb', padding: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>Pending Follow Requests ({pendingFollowers.length})</div>
                        {pendingFollowers.map(f => (
                            <div key={f.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.profile?.full_name || f.profile?.username || 'Unknown'}</div>
                                        <div style={{ fontSize: 11, color: C.textSec }}>{f.profile?.username ? `@${f.profile.username}` : `Requested ${new Date(f.created_at).toLocaleDateString()}`}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => handleApproveFollower(f.user_id, 'approve')} style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                                    <button onClick={() => handleApproveFollower(f.user_id, 'reject')} style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Live Games Tab — Read-Only Commander Status */}
            {activeTab === 'live_games' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Live Game Board</h3>
                        <Link href="/hub/commander" style={{ fontSize: 13, fontWeight: 600, color: C.blue, textDecoration: 'none' }}>Manage In Club Commander →</Link>
                    </div>

                    <div style={{ fontSize: 12, color: C.textSec, padding: '8px 12px', background: '#f0f7ff', borderRadius: 8, marginBottom: 12 }}>
                        Live games are managed through Club Commander. This board shows the current game status in real-time.
                    </div>

                    {/* Read-Only Games List */}
                    {loadingGames ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ width: 32, height: 32, border: '3px solid #E4E6EB', borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                            Loading games...
                        </div>
                    ) : liveGames.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M12 8v4l3 3" /></svg>
                            </div>
                            <div style={{ fontSize: 18, marginBottom: 6, fontWeight: 700, color: C.text }}>No Active Games</div>
                            <p style={{ margin: '0 0 12px', fontSize: 14 }}>Open Club Commander To Create And Manage Live Games</p>
                            <Link href="/hub/commander" style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 8, background: C.blue, color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Open Club Commander</Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {liveGames.map(game => {
                                const seatArr = Array.from({ length: game.max_seats }, (_, i) => {
                                    const taken = (game.seats || []).find(s => s.seat_number === i + 1 && s.status !== 'waitlist');
                                    return { number: i + 1, taken };
                                });
                                const waitlist = (game.seats || []).filter(s => s.status === 'waitlist').sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
                                const occupiedCount = seatArr.filter(s => s.taken).length;
                                const openSeats = game.max_seats - occupiedCount;

                                // Arc-length parameterized ellipse: equal visual spacing
                                const rx = 47, ry = 22, cxE = 50, cyE = 50;
                                const STEPS = 360;
                                const startAngle = Math.PI / 2; // dealer at bottom (90°)
                                const cumArc = [0];
                                for (let i = 1; i <= STEPS; i++) {
                                    const t0 = startAngle + ((i - 1) / STEPS) * 2 * Math.PI;
                                    const t1 = startAngle + (i / STEPS) * 2 * Math.PI;
                                    const dx = rx * (Math.cos(t1) - Math.cos(t0));
                                    const dy = ry * (Math.sin(t1) - Math.sin(t0));
                                    cumArc.push(cumArc[i - 1] + Math.sqrt(dx * dx + dy * dy));
                                }
                                const totalArc = cumArc[STEPS];
                                const allPos = [];
                                for (let p = 0; p < 10; p++) {
                                    const target = (p / 10) * totalArc;
                                    let idx = 1;
                                    while (idx <= STEPS && cumArc[idx] < target) idx++;
                                    const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
                                    allPos.push({
                                        top: `${cyE + ry * Math.sin(angle)}%`,
                                        left: `${cxE + rx * Math.cos(angle)}%`,
                                    });
                                }
                                // pos[0]=dealer(bottom), pos[1-9]=seats going counter-clockwise
                                const dealerTop = allPos[0].top;
                                const dealerLeft = allPos[0].left;
                                const seatPositions = allPos.slice(1);
                                // Clamp top seat to not float above rail
                                seatPositions.forEach(p => { const t = parseFloat(p.top); if (t < 30) p.top = '30%'; });



                                return (
                                    <div key={game.id} style={{ background: '#1a1a2e', borderRadius: 16, border: '1px solid #2d2d44', overflow: 'hidden' }}>
                                        {/* Game Header */}
                                        <div style={{ padding: '12px 16px', background: game.status === 'running' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)', color: '#fff' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 800 }}>{game.game_name}</div>
                                                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                                                        {game.game_type} &middot; ${game.stakes} &middot; {game.max_seats}-max
                                                        {game.table_number ? ` · ${game.table_number}` : ''}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                                                        {game.status === 'running' ? '🟢 RUNNING' : '🔵 OPEN'}
                                                    </span>
                                                    <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
                                                        {occupiedCount}/{game.max_seats} seated
                                                        {openSeats > 0 && <span style={{ color: '#86efac', marginLeft: 4 }}>({openSeats} open)</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Poker Table Visualization — Full Width (cropped viewport) */}
                                        <div style={{ position: 'relative', width: '100%', paddingBottom: '64%', overflow: 'hidden', marginTop: 10, marginBottom: 10 }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: '1 / 1', marginTop: '-18%' }}>
                                                {/* Table image fills entire container */}
                                                <Image src="/images/poker-table-black-gold.png" alt="Poker Table" width={640} height={640} style={{
                                                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                                    objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                                                }} />

                                                {/* Game info in center of table */}
                                                <div style={{
                                                    position: 'absolute', top: '48%', left: '50%',
                                                    transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                                                        {page.name || 'Club'}
                                                    </div>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                                        {game.table_number || game.game_name}
                                                    </div>
                                                    <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: 700 }}>
                                                        ${game.stakes}
                                                    </div>
                                                </div>

                                                {/* Dealer seat — on the bottom rail of the table */}
                                                <div style={{
                                                    position: 'absolute', top: dealerTop, left: dealerLeft,
                                                    transform: 'translate(-50%, -50%)', textAlign: 'center', width: 90, zIndex: 3,
                                                }}>
                                                    <div style={{
                                                        width: 80, height: 80, borderRadius: '50%', margin: '0 auto 4px',
                                                        background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                                                        border: '3px solid #E4E6EB',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 16px rgba(24,119,242,0.4)',
                                                        fontSize: 32, fontWeight: 900, color: '#fff',
                                                        letterSpacing: 1,
                                                    }}>D</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1877F2', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {game.dealer_name || 'No Dealer'}
                                                    </div>
                                                </div>

                                                {/* 9 Player seat chips on the table rail */}
                                                {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                                                    const pos = seatPositions[idx];
                                                    const isOccupied = !!seat.taken;
                                                    const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                                                    const fullName = seat.taken?.player_name || '';
                                                    const avatarUrl = seat.taken?.avatar_url || null;
                                                    // Direction-aware badge: left-side extends right, right-side extends left
                                                    const leftPct = parseFloat(pos.left);
                                                    const isLeftSide = leftPct < 25;
                                                    const isRightSide = leftPct > 75;
                                                    const badgeTransform = isLeftSide
                                                        ? 'translate(-17px, -50%)'
                                                        : isRightSide
                                                            ? 'translate(calc(-100% + 17px), -50%)'
                                                            : 'translate(-50%, -50%)';
                                                    const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                                                    // Timer computation
                                                    let timerText = null, timerColor = null;
                                                    if (isOccupied) {
                                                        const session = (game.sessions || []).find(s => s.seat_number === seat.number);
                                                        if (session) {
                                                            const isTexas = game.venue_type === 'texas';
                                                            if (isTexas) {
                                                                const rem = Math.max(0, (session.time_remaining || 0) - timerTick);
                                                                const mins = Math.floor(rem / 60);
                                                                const secs = rem % 60;
                                                                timerText = `${mins}:${String(secs).padStart(2, '0')}`;
                                                                const isExpired = rem <= 0;
                                                                const isCritical = rem <= 300 && rem > 0;
                                                                const isLow = rem <= 900 && rem > 0;
                                                                timerColor = isExpired ? '#ef4444' : isCritical ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e';
                                                                if (isExpired) timerText = 'EXPIRED';
                                                            } else {
                                                                const elapsed = (session.elapsed_seconds || 0) + timerTick;
                                                                const hrs = Math.floor(elapsed / 3600);
                                                                const mins = Math.floor((elapsed % 3600) / 60);
                                                                timerText = `${hrs}:${String(mins).padStart(2, '0')}`;
                                                                timerColor = '#a78bfa';
                                                            }
                                                        }
                                                    }

                                                    return (
                                                        <div key={seat.number} style={{
                                                            position: 'absolute', top: pos.top, left: pos.left,
                                                            transform: badgeTransform, zIndex: 2,
                                                            display: 'flex', flexDirection: badgeDirection, alignItems: 'center', gap: 10,
                                                            background: 'rgba(36,37,38,0.9)',
                                                            borderRadius: 14,
                                                            padding: '6px 12px 6px 6px',
                                                            border: `2px solid ${isOccupied ? 'rgba(24,119,242,0.5)' : 'rgba(62,64,66,0.6)'}`,
                                                            backdropFilter: 'blur(6px)',
                                                            minWidth: 80,
                                                        }}>
                                                            {/* Avatar circle */}
                                                            <div style={{
                                                                width: 68, height: 68, borderRadius: '50%', flexShrink: 0,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                background: isOccupied
                                                                    ? (avatarUrl ? 'transparent' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)')
                                                                    : 'rgba(255,255,255,0.06)',
                                                                border: `2px solid ${isOccupied ? '#1877F2' : 'rgba(62,64,66,0.5)'}`,
                                                                overflow: 'hidden',
                                                            }}>
                                                                {isOccupied ? (
                                                                    avatarUrl ? (
                                                                        <img src={avatarUrl} alt={firstName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                                                    ) : (
                                                                        <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{firstName.charAt(0).toUpperCase()}</span>
                                                                    )
                                                                ) : (
                                                                    <span style={{ fontSize: 18, fontWeight: 600, color: '#B0B3B8' }}>{seat.number}</span>
                                                                )}
                                                            </div>
                                                            {/* Name + Timer text */}
                                                            <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                                                                <div style={{
                                                                    fontSize: 16, fontWeight: 600, lineHeight: 1.2,
                                                                    color: isOccupied ? '#E4E6EB' : '#B0B3B8',
                                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                    maxWidth: 140,
                                                                }}>
                                                                    {isOccupied ? fullName : 'Open'}
                                                                </div>
                                                                {timerText && (
                                                                    <div style={{
                                                                        fontSize: 14, fontWeight: 700, color: timerColor,
                                                                        fontFamily: 'monospace', lineHeight: 1.2,
                                                                        animation: timerColor === '#ef4444' ? 'pulse 1s infinite' : 'none',
                                                                    }}>
                                                                        {timerText}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Waitlist — Read Only */}
                                        {waitlist.length > 0 && (
                                            <div style={{ padding: '8px 16px 12px', background: '#1a1a2e', borderTop: '1px solid #2d2d44' }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>Waitlist</div>
                                                {waitlist.map((w, i) => (
                                                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', padding: '2px 0', fontSize: 11 }}>
                                                        <span style={{ color: '#d4d4d8' }}>#{w.waitlist_position || i + 1} — {w.player_name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                    }
                </div>
            )
            }


            {/* About Tab */}
            {
                activeTab === 'about' && (
                    <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: C.text }}>About</h3>
                        {page.description && <p style={{ margin: '0 0 12px', fontSize: 14, color: C.text, lineHeight: 1.5 }}>{page.description}</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {page.category && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /></svg>
                                    <span style={{ fontSize: 14, color: C.text }}>{CATEGORY_LABELS[page.category] || page.category}</span>
                                </div>
                            )}
                            {(page.location_city || page.location_state) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                    <span style={{ fontSize: 14, color: C.text }}>{[page.location_city, page.location_state].filter(Boolean).join(', ')}</span>
                                </div>
                            )}
                            {page.website && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                                    <a href={page.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.blue }}>{page.website}</a>
                                </div>
                            )}
                            {page.phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" /></svg>
                                    <span style={{ fontSize: 14, color: C.text }}>{page.phone}</span>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 16, padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.textSec }}>Page created {page.created_at ? new Date(page.created_at).toLocaleDateString() : 'recently'}</span>
                        </div>

                        {/* QR Code & Referral Section */}
                        {!isDraft && (
                            <div style={{ marginTop: 12, padding: 16, border: `1px solid ${C.border}`, borderRadius: 12, background: '#242526' }}>
                                <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: C.text }}>QR Code & Referral Link</h4>
                                <p style={{ margin: '0 0 12px', fontSize: 12, color: C.textSec, lineHeight: 1.4 }}>
                                    Print this QR code and place it on your tables, at the front desk, or in promotions. Players who scan it will auto-follow your page.
                                </p>
                                {qrLoading ? (
                                    <div style={{ textAlign: 'center', padding: 20, color: C.textSec, fontSize: 13 }}>Loading QR code...</div>
                                ) : qrData ? (
                                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <img src={qrData.qr_code_url} alt="Club Page QR Code" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid #E4E6EB' }} />
                                            <div style={{ marginTop: 6 }}>
                                                <a href={qrData.qr_code_url} download={`${page.name}-qr-code.svg`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.blue, fontWeight: 600, textDecoration: 'none' }}>
                                                    Download QR Code
                                                </a>
                                            </div>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 200 }}>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: C.textSec, display: 'block', marginBottom: 4 }}>Referral URL</label>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <input readOnly value={qrData.follow_url} style={{
                                                    flex: 1, padding: '6px 10px', border: '1px solid #3A3B3C', borderRadius: 6,
                                                    fontSize: 12, fontFamily: 'monospace', background: '#18191A', color: C.text
                                                }} onClick={e => { e.target.select(); navigator.clipboard?.writeText(qrData.follow_url); }} />
                                                <button onClick={() => { navigator.clipboard?.writeText(qrData.follow_url); }} style={{
                                                    padding: '6px 12px', borderRadius: 6, border: 'none', background: C.blue,
                                                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
                                                }}>Copy</button>
                                            </div>
                                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 6 }}>
                                                Referral Code: <strong>{qrData.referral_code}</strong>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => fetchQrCode()} style={{
                                        padding: '8px 20px', borderRadius: 8, border: 'none', background: C.blue,
                                        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                                    }}>Generate QR Code</button>
                                )}
                            </div>
                        )}
                    </div>
                )
            }

            {/* Floating Green Live Events Button */}
            {(() => {
                const liveTourneys = tournaments.filter(t => ['running', 'break', 'final_table'].includes(t.status));
                if (liveTourneys.length === 0) return null;
                const lt = liveTourneys[0];
                return (
                    <div
                        onClick={() => lt.id && window.open(`/commander/tournaments/${lt.id}/public`, '_blank')}
                        style={{
                            position: 'fixed', bottom: 24, right: 24, zIndex: 1000, cursor: lt.id ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px',
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            borderRadius: 50, boxShadow: '0 4px 24px rgba(34,197,94,0.45), 0 0 0 3px rgba(34,197,94,0.15)',
                            color: '#fff', fontFamily: 'inherit',
                            transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(34,197,94,0.55), 0 0 0 4px rgba(34,197,94,0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(34,197,94,0.45), 0 0 0 3px rgba(34,197,94,0.15)'; }}
                    >
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.8)', animation: 'pulse 1.5s infinite' }} />
                        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>🏆 LIVE EVENT{liveTourneys.length > 1 ? `S (${liveTourneys.length})` : ''}</span>
                        <span style={{ fontSize: 12, opacity: 0.9, fontWeight: 500 }}>{lt.name}</span>
                    </div>
                );
            })()}

            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div >
    );
}
