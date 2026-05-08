/**
 * Create Social Page - Venue, Group, Community, or Brand page
 */
import SEOHead from '../../../src/components/seo/SEOHead';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useRequireAuth, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { supabase } from '../../../src/lib/supabase';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', red: '#FA383E',
};

const PAGE_TYPES = [
    { key: 'venue', label: 'Venue Page', desc: 'For poker rooms and casinos', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
    { key: 'home_game', label: 'Home Game', desc: 'For your private home game night or weekly group', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { key: 'group', label: 'Group Page', desc: 'For study groups and communities', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { key: 'community', label: 'Community', desc: 'For open poker communities', icon: 'M12 2L2 7l10 5 10-5-10-5z' },
    { key: 'brand', label: 'Brand Page', desc: 'For poker brands and products', icon: 'M20 7h-3V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v3H4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z' },
];

const CATEGORIES = [
    'general', 'poker room', 'home game', 'study group', 'tournament circuit',
    'coaching', 'entertainment', 'strategy', 'news', 'regional',
];

export default function CreateSocialPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const [form, setForm] = useState({
        page_type: '',
        name: '',
        description: '',
        category: 'general',
        website: '',
        contact_email: '',
        phone: '',
        location_city: '',
        location_state: '',
        is_public: true,
        allow_member_posts: true,
        require_post_approval: false,
        slug: '',
        avatar_url: '',
        cover_url: '',
        // #7: Social links
        social_twitter: '',
        social_instagram: '',
        social_discord: '',
        social_facebook: '',
    });

    // #6: Avatar + Cover upload state
    const avatarInputRef = useRef(null);
    const coverInputRef = useRef(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [coverPreview, setCoverPreview] = useState(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);

    // Custom URL slug checking
    const [slugStatus, setSlugStatus] = useState(null);
    const [slugError, setSlugError] = useState('');
    const [slugSuggestions, setSlugSuggestions] = useState([]);
    const slugTimerRef = useRef(null);

    const { user, checking: authChecking } = useRequireAuth('/hub/social-pages/create');
    useTrainingBus('social-pages-create');

    // Cleanup slug debounce timer on unmount to prevent stale state updates
    useEffect(() => {
        return () => { if (slugTimerRef.current) clearTimeout(slugTimerRef.current); };
    }, []);

    // Club Commander access gate
    const [isCommander, setIsCommander] = useState(null); // null=checking, true/false=result
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            try {
                // Check if user owns any clubs OR is admin/owner in club_members
                const { data: ownedClubs } = await supabase
                    .from('clubs').select('id').eq('owner_id', user.id).limit(1);
                if (ownedClubs && ownedClubs.length > 0) { setIsCommander(true); return; }

                const { data: memberRoles } = await supabase
                    .from('club_members').select('id').eq('user_id', user.id)
                    .in('role', ['owner', 'admin']).limit(1);
                setIsCommander(memberRoles && memberRoles.length > 0);
            } catch { setIsCommander(false); }
        })();
    }, [user]);

    function update(field, value) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    // #6: Handle file upload for avatar/cover
    const handleFileUpload = useCallback(async (file, type) => {
        if (!file) return;
        const isAvatar = type === 'avatar';
        if (isAvatar) setUploadingAvatar(true);
        else setUploadingCover(true);

        // Show local preview immediately
        const previewUrl = URL.createObjectURL(file);
        if (isAvatar) setAvatarPreview(previewUrl);
        else setCoverPreview(previewUrl);

        try {
            const token = getAccessToken();
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder', isAvatar ? 'page-avatars' : 'page-covers');
            fd.append('prefix', user?.id || 'anon');

            const res = await fetch('/api/social/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: fd,
            });
            const json = await res.json();
            if (json.success && json.url) {
                update(isAvatar ? 'avatar_url' : 'cover_url', json.url);
            } else {
                setError(`Failed to upload ${type}: ${json.error || 'Unknown error'}`);
                // Revert preview
                if (isAvatar) setAvatarPreview(null);
                else setCoverPreview(null);
            }
        } catch {
            setError(`Network error uploading ${type}`);
            if (isAvatar) setAvatarPreview(null);
            else setCoverPreview(null);
        }
        if (isAvatar) setUploadingAvatar(false);
        else setUploadingCover(false);
    }, [user]);

    async function handleSubmit(signal) {
        if (!form.name.trim()) { setError('Page name is required'); return; }
        if (!form.page_type) { setError('Select a page type'); return; }

        setSubmitting(true);
        setError(null);

        try {
            const token = getAccessToken();
            const body = { ...form };
            // Only send slug if user explicitly set one
            if (!body.slug || !body.slug.trim()) delete body.slug;
            const res = await fetch('/api/social/pages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body),
            });
            const json = await res.json();

            if (json.success) {
                busEmit.dataMutated('social-pages');
                router.push(`/hub/social-pages/${json.data.slug || json.data.id}`);
            } else {
                setError(json.error || 'Failed to create page');
            }
        } catch (e) {
            setError('Network error. Please try again.');
        }
        setSubmitting(false);
    }

    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
        color: C.text, outline: 'none', boxSizing: 'border-box', background: C.bg,
    };

    const labelStyle = {
        fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block',
    };

    return (
        <>
            <SEOHead
                title="Create Social Page"
                description="Create A New Social Page On Smarter.Poker To Share Content And Build A Community."
                canonical="/hub/social-pages/create"
                noindex={true}
            />
            <UniversalHeader />

            <div style={{
                minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg, paddingTop: 60,
                fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" ,
            }}>
                <div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>
                    {/* Back */}
                    <button onClick={() => step > 1 ? setStep(step - 1) : router.back()} style={{
                        display: 'flex', alignItems: 'center', gap: 4, background: 'none',
                        border: 'none', color: C.blue, fontSize: 14, fontWeight: 600,
                        cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: 'inherit',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                        {step > 1 ? 'Back' : 'Cancel'}
                    </button>

                    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
                        {isCommander === null ? (
                            /* Loading Commander check */
                            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                <div style={{
                                    width: 32, height: 32, border: '3px solid #E4E6EB',
                                    borderTopColor: C.blue, borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
                                }} />
                                <p style={{ color: C.textSec, fontSize: 14 }}>Checking Access...</p>
                            </div>
                        ) : isCommander === false ? (
                            /* Blocked — not a Commander */
                            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCD0D5" strokeWidth="1.5">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '16px 0 8px' }}>
                                    Club Commander Required
                                </h2>
                                <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 20px', lineHeight: 1.5 }}>
                                    Creating Social Pages is available to Club Commander account holders.
                                    Set up your club first to unlock this feature.
                                </p>
                                <button onClick={() => router.push('/hub/commander')} style={{
                                    padding: '10px 24px', background: C.blue, border: 'none',
                                    borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    Go to Club Commander
                                </button>
                            </div>
                        ) : (
                        <>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>
                            Create a Page
                        </h1>
                        <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 8px' }}>
                            Step {step} of 2 — {step === 1 ? 'Choose type' : 'Page details'}
                        </p>
                        {/* Visual Progress Bar */}
                        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                            <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.blue, transition: 'background 0.3s' }} />
                            <div style={{ flex: 1, height: 4, borderRadius: 2, background: step >= 2 ? C.blue : '#E4E6EB', transition: 'background 0.3s' }} />
                        </div>

                        {/* #5: Template Gallery — shown above Step 1 type selector */}
                        {step === 1 && (
                            <div style={{ marginBottom: 20, padding: 14, background: '#F8F9FA', borderRadius: 10, border: `1px solid ${C.border}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Quick Templates</span>
                                    <span style={{ fontSize: 11, color: C.textSec, marginLeft: 'auto' }}>Pre-fill your page</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {[
                                        { type: 'venue', name: 'Poker Room', desc: 'Professional card room venue with schedule & games', cat: 'poker room', icon: '🏢' },
                                        { type: 'group', name: 'Home Game Group', desc: 'Private home game with regular schedule', cat: 'home game', icon: '🏠' },
                                        { type: 'group', name: 'Study Group', desc: 'Strategy & hand analysis discussion group', cat: 'study group', icon: '📚' },
                                        { type: 'community', name: 'Tournament Series', desc: 'Tournament circuit or series community page', cat: 'tournament circuit', icon: '🏆' },
                                    ].map(tmpl => (
                                        <button key={tmpl.cat} onClick={() => {
                                            // Home Game Group quick-template also funnels to the
                                            // canonical Club Commander Home Games signup, not the
                                            // generic social-pages creator.
                                            if (tmpl.cat === 'home game') {
                                                window.location.href = 'https://commander.smarter.poker/commander/register?tier=home_game&from=social_pages&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate');
                                                return;
                                            }
                                            update('page_type', tmpl.type);
                                            update('category', tmpl.cat);
                                            update('description', tmpl.desc);
                                            setStep(2);
                                        }} style={{
                                            padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                                            background: C.card, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                                            transition: 'border-color 0.2s, box-shadow 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.boxShadow = '0 2px 8px rgba(24,119,242,0.1)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none'; }}
                                        >
                                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{tmpl.icon} {tmpl.name}</div>
                                            <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.3 }}>{tmpl.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {error && (
                            <div style={{
                                padding: '10px 14px', borderRadius: 8, background: '#FEE2E2',
                                color: '#DC2626', fontSize: 13, fontWeight: 500, marginBottom: 16,
                            }}>
                                {error}
                            </div>
                        )}

                        {step === 1 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {PAGE_TYPES.map(pt => (
                                    <motion.button
                                        key={pt.key}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => {
                                            // REGULATORY: home_game pages are auto-provisioned when a
                                            // commander_home_groups row is created. All three entry
                                            // ports (Social Pages / Poker Near Me / Club Commander)
                                            // must funnel through the same canonical signup screen.
                                            if (pt.key === 'home_game') {
                                                window.location.href = 'https://commander.smarter.poker/commander/register?tier=home_game&from=social_pages&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate');
                                                return;
                                            }
                                            update('page_type', pt.key);
                                            setStep(2);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 14, padding: 16,
                                            borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                                            fontFamily: 'inherit',
                                            border: form.page_type === pt.key ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                                            background: form.page_type === pt.key ? '#E7F3FF' : C.card,
                                        }}
                                    >
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 10, background: '#E7F3FF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d={pt.icon} />
                                                {pt.key === 'venue' && <circle cx="12" cy="10" r="3" />}
                                                {pt.key === 'group' && <circle cx="9" cy="7" r="4" />}
                                                {pt.key === 'community' && <><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>}
                                            </svg>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{pt.label}</div>
                                            <div style={{ fontSize: 13, color: C.textSec }}>{pt.desc}</div>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 16 }}>
                            {/* Main Form Column */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                                {/* #6: Avatar + Cover Upload */}
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'start' }}>
                                    {/* Avatar Upload */}
                                    <div>
                                        <label style={labelStyle}>Avatar</label>
                                        <div
                                            onClick={() => avatarInputRef.current?.click()}
                                            style={{
                                                width: 80, height: 80, borderRadius: 12, cursor: 'pointer',
                                                border: `2px dashed ${C.border}`, background: avatarPreview || form.avatar_url
                                                    ? `url(${avatarPreview || form.avatar_url}) center/cover` : C.bg,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexDirection: 'column', gap: 2, position: 'relative',
                                                transition: 'border-color 0.2s',
                                            }}
                                            aria-label="Upload avatar photo"
                                        >
                                            {uploadingAvatar ? (
                                                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.blue, animation: 'spin 0.6s linear infinite' }} />
                                            ) : !(avatarPreview || form.avatar_url) && (
                                                <>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                                    <span style={{ fontSize: 10, color: C.textSec, fontWeight: 500 }}>Upload</span>
                                                </>
                                            )}
                                        </div>
                                        <input ref={avatarInputRef} type="file" accept="image/*" hidden
                                            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], 'avatar'); e.target.value = ''; }} />
                                    </div>

                                    {/* Cover Upload */}
                                    <div>
                                        <label style={labelStyle}>Cover Photo</label>
                                        <div
                                            onClick={() => coverInputRef.current?.click()}
                                            style={{
                                                width: '100%', height: 80, borderRadius: 10, cursor: 'pointer',
                                                border: `2px dashed ${C.border}`, background: coverPreview || form.cover_url
                                                    ? `url(${coverPreview || form.cover_url}) center/cover` : C.bg,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexDirection: 'column', gap: 2, position: 'relative',
                                                transition: 'border-color 0.2s',
                                            }}
                                            aria-label="Upload cover photo"
                                        >
                                            {uploadingCover ? (
                                                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.blue, animation: 'spin 0.6s linear infinite' }} />
                                            ) : !(coverPreview || form.cover_url) && (
                                                <>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                                    <span style={{ fontSize: 10, color: C.textSec, fontWeight: 500 }}>Upload Cover</span>
                                                </>
                                            )}
                                        </div>
                                        <input ref={coverInputRef} type="file" accept="image/*" hidden
                                            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], 'cover'); e.target.value = ''; }} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Page Name *</label>
                                    <input type="text" value={form.name} onChange={e => {
                                        update('name', e.target.value);
                                        // Auto-suggest slug from name if slug field is empty or matches the previous auto-generated slug
                                        if (!form.slug || form.slug === form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)) {
                                            const suggested = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
                                            update('slug', suggested);
                                            setSlugStatus(null);
                                            setSlugError('');
                                            setSlugSuggestions([]);
                                            if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
                                            if (suggested.length >= 3) {
                                                setSlugStatus('checking');
                                                slugTimerRef.current = setTimeout(async () => {
                                                    try {
                                                        const res = await fetch(`/api/social/pages/check-slug?slug=${encodeURIComponent(suggested)}`);
                                                        const json = await res.json();
                                                        if (json.success) {
                                                            setSlugStatus(json.available ? 'available' : 'taken');
                                                            setSlugError(json.error || '');
                                                            setSlugSuggestions(json.suggestions || []);
                                                        }
                                                    } catch { setSlugStatus(null); }
                                                }, 500);
                                            }
                                        }
                                    }}
                                        placeholder="Enter Page Name" style={{ ...inputStyle, borderColor: error && !form.name.trim() ? C.red : undefined }} maxLength={100}
                                        aria-label="Page name" />
                                    {error && !form.name.trim() && (
                                        <p style={{ fontSize: 11, color: C.red, margin: '4px 0 0', fontWeight: 500 }}>Page name is required</p>
                                    )}
                                </div>

                                <div>
                                    <label style={labelStyle}>Description</label>
                                    <textarea value={form.description} onChange={e => update('description', e.target.value)}
                                        placeholder="Tell People About This Page..."
                                        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} maxLength={500} />
                                </div>

                                <div>
                                    <label style={labelStyle}>Category</label>
                                    <select value={form.category} onChange={e => update('category', e.target.value)}
                                        style={inputStyle}>
                                        {CATEGORIES.map(c => (
                                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>City</label>
                                        <input type="text" value={form.location_city}
                                            onChange={e => update('location_city', e.target.value)}
                                            placeholder="City" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>State</label>
                                        <input type="text" value={form.location_state}
                                            onChange={e => update('location_state', e.target.value)}
                                            placeholder="State" style={inputStyle} />
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>Website</label>
                                    <input type="url" value={form.website} onChange={e => update('website', e.target.value)}
                                        placeholder="https://..." style={inputStyle} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Contact Email</label>
                                        <input type="email" value={form.contact_email} onChange={e => update('contact_email', e.target.value)}
                                            placeholder="contact@example.com" aria-label="Contact email"
                                            style={{ ...inputStyle, borderColor: form.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact_email) ? C.red : undefined }} />
                                        {form.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact_email) && (
                                            <p style={{ fontSize: 11, color: C.red, margin: '4px 0 0', fontWeight: 500 }}>Invalid email format</p>
                                        )}
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Phone</label>
                                        <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)}
                                            placeholder="(555) 123-4567" aria-label="Phone number" style={inputStyle} />
                                    </div>
                                </div>

                                {/* Custom URL (Optional) */}
                                <div>
                                    <label style={labelStyle}>Custom URL (Optional)</label>
                                    <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 6px' }}>
                                        Leave blank for an auto-generated URL
                                    </p>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 0,
                                        border: `1px solid ${slugStatus === 'available' ? '#42B72A' : slugStatus === 'taken' || slugStatus === 'invalid' ? '#FA383E' : C.border}`,
                                        borderRadius: 8, overflow: 'hidden', background: C.bg,
                                        transition: 'border-color 0.2s',
                                    }}>
                                        <span style={{
                                            padding: '10px 10px 10px 12px', fontSize: 12, color: C.textSec,
                                            whiteSpace: 'nowrap', background: '#E4E6EB', borderRight: `1px solid ${C.border}`,
                                            fontWeight: 500,
                                        }}>
                                            smarter.poker/.../
                                        </span>
                                        <input
                                            type="text"
                                            value={form.slug}
                                            onChange={e => {
                                                const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 60);
                                                update('slug', raw);
                                                setSlugStatus(null);
                                                setSlugError('');
                                                setSlugSuggestions([]);
                                                if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
                                                if (raw.length >= 3) {
                                                    setSlugStatus('checking');
                                                    slugTimerRef.current = setTimeout(async () => {
                                                        try {
                                                            const res = await fetch(`/api/social/pages/check-slug?slug=${encodeURIComponent(raw)}`);
                                                            const json = await res.json();
                                                            if (json.success) {
                                                                setSlugStatus(json.available ? 'available' : 'taken');
                                                                setSlugError(json.error || '');
                                                                setSlugSuggestions(json.suggestions || []);
                                                                if (json.formatted && json.formatted !== raw) {
                                                                    update('slug', json.formatted);
                                                                }
                                                            }
                                                        } catch {
                                                            setSlugStatus(null);
                                                        }
                                                    }, 500);
                                                } else if (raw.length > 0) {
                                                    setSlugStatus('invalid');
                                                    setSlugError('Must be at least 3 characters');
                                                }
                                            }}
                                            placeholder="my-poker-club"
                                            style={{
                                                flex: 1, padding: '10px 12px', border: 'none', fontSize: 14,
                                                fontFamily: 'inherit', outline: 'none', background: 'transparent',
                                                color: C.text, minWidth: 0,
                                            }}
                                        />
                                        <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center' }}>
                                            {slugStatus === 'checking' && (
                                                <div style={{
                                                    width: 14, height: 14, borderRadius: '50%',
                                                    border: `2px solid ${C.border}`, borderTopColor: C.blue,
                                                    animation: 'spin 0.6s linear infinite',
                                                }} />
                                            )}
                                            {slugStatus === 'available' && (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#42B72A" strokeWidth="3">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            )}
                                            {(slugStatus === 'taken' || slugStatus === 'invalid') && (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FA383E" strokeWidth="3">
                                                    <line x1="18" y1="6" x2="6" y2="18" />
                                                    <line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                    {slugError && (
                                        <p style={{ fontSize: 11, marginTop: 4, marginBottom: 0, color: '#FA383E', fontWeight: 500 }}>
                                            {slugError}
                                        </p>
                                    )}
                                    {slugStatus === 'available' && (
                                        <p style={{ fontSize: 11, marginTop: 4, marginBottom: 0, color: '#42B72A', fontWeight: 500 }}>
                                            Available: smarter.poker/hub/social-pages/{form.slug}
                                        </p>
                                    )}
                                    {slugSuggestions.length > 0 && slugStatus === 'taken' && (
                                        <div style={{ marginTop: 6 }}>
                                            <p style={{ fontSize: 11, color: C.textSec, margin: '0 0 4px', fontWeight: 500 }}>Try these instead:</p>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {slugSuggestions.map(s => (
                                                    <button key={s} onClick={() => {
                                                        update('slug', s);
                                                        setSlugStatus('checking');
                                                        setSlugError('');
                                                        setSlugSuggestions([]);
                                                        if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
                                                        slugTimerRef.current = setTimeout(async () => {
                                                            try {
                                                                const res = await fetch(`/api/social/pages/check-slug?slug=${encodeURIComponent(s)}`);
                                                                const json = await res.json();
                                                                if (json.success) {
                                                                    setSlugStatus(json.available ? 'available' : 'taken');
                                                                    setSlugError(json.error || '');
                                                                    setSlugSuggestions(json.suggestions || []);
                                                                }
                                                            } catch { setSlugStatus(null); }
                                                        }, 200);
                                                    }} style={{
                                                        padding: '4px 10px', borderRadius: 12, fontSize: 12,
                                                        border: `1px solid ${C.blue}`, background: '#E7F3FF',
                                                        color: C.blue, cursor: 'pointer', fontWeight: 500,
                                                        fontFamily: 'inherit',
                                                    }}>{s}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Settings */}
                                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>Settings</h3>

                                    {[
                                        { field: 'is_public', label: 'Public Page', desc: 'Anyone can find and view this page' },
                                        { field: 'allow_member_posts', label: 'Member Posts', desc: 'Allow followers to create posts' },
                                        { field: 'require_post_approval', label: 'Post Approval', desc: 'Review posts before they appear' },
                                    ].map(setting => (
                                        <div key={setting.field} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 0', borderBottom: `1px solid ${C.bg}`,
                                        }}>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{setting.label}</div>
                                                <div style={{ fontSize: 12, color: C.textSec }}>{setting.desc}</div>
                                            </div>
                                            <button onClick={() => update(setting.field, !form[setting.field])} style={{
                                                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                                                background: form[setting.field] ? C.blue : '#CCD0D5',
                                                position: 'relative', transition: 'background 0.2s',
                                            }}>
                                                <div style={{
                                                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                                    position: 'absolute', top: 2,
                                                    left: form[setting.field] ? 22 : 2,
                                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                }} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* #7: Social Links */}
                                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                                        Social Links
                                    </h3>
                                    <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 10px' }}>Connect your social accounts (optional)</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {[
                                            { key: 'social_twitter', label: 'Twitter/X', placeholder: '@handle', color: '#1DA1F2' },
                                            { key: 'social_instagram', label: 'Instagram', placeholder: '@username', color: '#E4405F' },
                                            { key: 'social_discord', label: 'Discord', placeholder: 'Invite link', color: '#5865F2' },
                                            { key: 'social_facebook', label: 'Facebook', placeholder: 'Page URL', color: '#1877F2' },
                                        ].map(sl => (
                                            <div key={sl.key}>
                                                <label style={{ fontSize: 12, fontWeight: 600, color: sl.color, display: 'block', marginBottom: 4 }}>{sl.label}</label>
                                                <input type="text" value={form[sl.key]} onChange={e => update(sl.key, e.target.value)}
                                                    placeholder={sl.placeholder}
                                                    style={{
                                                        width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
                                                        border: `1px solid ${C.border}`, fontFamily: 'inherit', outline: 'none',
                                                        background: C.bg, color: C.text, boxSizing: 'border-box',
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <button onClick={handleSubmit} disabled={submitting || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid'} style={{
                                    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                                    background: (submitting || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid') ? '#CCD0D5' : C.blue, color: '#fff',
                                    fontSize: 15, fontWeight: 700, cursor: (submitting || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid') ? 'default' : 'pointer',
                                    fontFamily: 'inherit', marginTop: 8,
                                }}>
                                    {submitting ? 'Creating...' : 'Create Page'}
                                </button>
                            </div>

                            {/* #6: Live Preview Card */}
                            <div style={{ width: 260, flexShrink: 0, position: 'sticky', top: 80 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Live Preview</div>
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                                    overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                                }}>
                                    {/* Preview cover */}
                                    <div style={{
                                        height: 80,
                                        background: coverPreview || form.cover_url
                                            ? `url(${coverPreview || form.cover_url}) center/cover`
                                            : `linear-gradient(135deg, ${{ venue: C.blue, group: C.green, community: '#8b5cf6', brand: C.orange }[form.page_type] || C.blue}, #8b5cf6)`,
                                        position: 'relative',
                                    }}>
                                        <span style={{
                                            position: 'absolute', top: 6, left: 6, padding: '2px 6px',
                                            borderRadius: 3, fontSize: 10, fontWeight: 700,
                                            background: 'rgba(0,0,0,0.5)', color: '#fff',
                                            textTransform: 'uppercase',
                                        }}>
                                            {{ venue: 'Venue', group: 'Group', community: 'Community', brand: 'Brand' }[form.page_type] || 'Page'}
                                        </span>
                                    </div>
                                    {/* Preview avatar */}
                                    <div style={{ padding: '0 10px', marginTop: -18 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8, border: `2px solid ${C.card}`,
                                            background: avatarPreview || form.avatar_url
                                                ? `url(${avatarPreview || form.avatar_url}) center/cover`
                                                : ({ venue: C.blue, group: C.green, community: '#8b5cf6', brand: C.orange }[form.page_type] || '#CCC'),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontWeight: 800, fontSize: 15,
                                        }}>
                                            {!(avatarPreview || form.avatar_url) && (form.name || '?')[0].toUpperCase()}
                                        </div>
                                    </div>
                                    {/* Preview info */}
                                    <div style={{ padding: '6px 10px 12px' }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: form.name ? C.text : '#CCC', marginBottom: 2 }}>
                                            {form.name || 'Page Name'}
                                        </div>
                                        <div style={{
                                            fontSize: 11, color: form.description ? C.textSec : '#DDD',
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                        }}>
                                            {form.description || 'Description will appear here...'}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11, color: C.textSec }}>
                                            <span>0 followers</span>
                                            <span>0 posts</span>
                                            {form.location_city && <span>{form.location_city}{form.location_state ? `, ${form.location_state}` : ''}</span>}
                                        </div>
                                        {/* Preview social links */}
                                        {(form.social_twitter || form.social_instagram || form.social_discord || form.social_facebook) && (
                                            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                                {form.social_twitter && <span style={{ padding: '2px 6px', borderRadius: 4, background: '#E8F5FE', color: '#1DA1F2', fontSize: 10, fontWeight: 600 }}>X</span>}
                                                {form.social_instagram && <span style={{ padding: '2px 6px', borderRadius: 4, background: '#FCE4EC', color: '#E4405F', fontSize: 10, fontWeight: 600 }}>IG</span>}
                                                {form.social_discord && <span style={{ padding: '2px 6px', borderRadius: 4, background: '#EDE7F6', color: '#5865F2', fontSize: 10, fontWeight: 600 }}>DC</span>}
                                                {form.social_facebook && <span style={{ padding: '2px 6px', borderRadius: 4, background: '#E3F2FD', color: '#1877F2', fontSize: 10, fontWeight: 600 }}>FB</span>}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                            <div style={{ flex: 1, height: 28, borderRadius: 6, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>Follow</div>
                                            <div style={{ flex: 1, height: 28, borderRadius: 6, background: '#E4E6EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 11, fontWeight: 600 }}>View Page</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </div>
                        )}
                        </>
                        )}
                    </div>
                </div>
              <BottomNavBar />
            </div>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
}
