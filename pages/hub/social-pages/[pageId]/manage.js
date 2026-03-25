/**
 * Social Page Management - Owner/admin dashboard for managing page settings,
 * members, content moderation, and analytics
 */
import SEOHead from '../../../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import { useRequireAuth, getAccessToken } from '../../../../src/lib/authUtils';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../../src/engine/EventBus';
import SkeletonLight from '../../../../src/components/ui/SkeletonLight';
import { supabase } from '../../../../src/lib/supabase';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A', red: '#FA383E', orange: '#F5A623',
};

const TABS = ['settings', 'members', 'posts', 'analytics', 'invitations'];

export default function ManageSocialPage() {
    const router = useRouter();
    const { pageId } = router.query;
    const [page, setPage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('settings');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [members, setMembers] = useState([]);
    const [posts, setPosts] = useState([]);

    // Editable fields
    const [form, setForm] = useState({
        name: '', description: '', category: '', website: '',
        contact_email: '', phone: '', location_city: '', location_state: '',
        is_public: true, allow_member_posts: true, require_post_approval: false,
        slug: '',
    });

    // Custom URL slug checking
    const [slugStatus, setSlugStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
    const [slugError, setSlugError] = useState('');
    const slugTimerRef = useRef(null);
    const tabRef = useRef('settings');

    const { user, checking: authChecking } = useRequireAuth(`/hub/social-pages/${pageId}/manage`);
    useTrainingBus('social-pages-manage');

    const fetchPage = useCallback(async (signal) => {
        if (!pageId || !user) return;
        setLoading(true);
        try {
            // Detect UUID vs slug and use appropriate API parameter
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId);
            const param = isUUID ? `id=${pageId}` : `slug=${pageId}`;
            const res = await fetch(`/api/social/pages?${param}&user_id=${user.id}`);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success && json.data) {
                if (json.data.owner_id !== user.id) {
                    router.push(`/hub/social-pages/${pageId}`);
                    return;
                }
                setPage(json.data);
                setForm({
                    name: json.data.name || '',
                    description: json.data.description || '',
                    category: json.data.category || 'general',
                    website: json.data.website || '',
                    contact_email: json.data.contact_email || '',
                    phone: json.data.phone || '',
                    location_city: json.data.location_city || '',
                    location_state: json.data.location_state || '',
                    is_public: json.data.is_public !== false,
                    allow_member_posts: json.data.allow_member_posts !== false,
                    require_post_approval: json.data.require_post_approval || false,
                    slug: json.data.slug || '',
                });
            }
        } catch (e) {
            console.error('Failed to fetch page:', e);
        }
        setLoading(false);
    }, [pageId, user, router]);

    useEffect(() => { const _c = new AbortController(); fetchPage(_c.signal); return () => _c.abort(); }, [fetchPage]);

    // Cleanup slug debounce timer on unmount
    useEffect(() => {
        return () => { if (slugTimerRef.current) clearTimeout(slugTimerRef.current); };
    }, []);

    useEffect(() => {
        if (!page) return;
        tabRef.current = tab;
        if (tab === 'members') fetchMembers();
        if (tab === 'posts' || tab === 'analytics') fetchPosts();
    }, [tab, page]);
  // Realtime subscription — live updates (stable deps, no tab recreation)
  useEffect(() => {

    if (!router.isReady) return;

    if (!pageId || !page) return;
    // Always use the resolved page.id (UUID) for realtime, not the raw URL param
    const resolvedId = page.id;
    const _ch = supabase
      .channel(`social-page-mgr:${resolvedId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'social_pages', filter: `id=eq.${resolvedId}` }, () => {
        fetchPage();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_posts', filter: `page_id=eq.${resolvedId}` }, () => {
        if (tabRef.current === 'posts') fetchPosts();
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [pageId, page, fetchPage]);

    const fetchMembers = async () => {
        try {
            const reqParam = user?.id ? `&requester_id=${user.id}` : '';
            const res = await fetch(`/api/social/pages/follow?page_id=${page.id}${reqParam}`);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setMembers(json.data || []);
        } catch (e) { console.error("[manage.js]", e); }
    };

    const fetchPosts = async () => {
        try {
            const res = await fetch(`/api/social/pages/posts?page_id=${page.id}&limit=50`);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setPosts(json.data || []);
        } catch (e) { console.error("[manage.js]", e); }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id: page.id, ...form }),
            });
            const json = await res.json();
            if (json.success) {
                busEmit.dataMutated('social-pages');
                setMessage('Settings saved successfully');
                setPage(json.data);
                // Reset slug status since it's now the saved slug
                setSlugStatus(null);
                setSlugError('');
            } else {
                setMessage('Error: ' + (json.error || 'Failed to save'));
            }
        } catch {
            setMessage('Error: Network error');
        }
        setSaving(false);
    };

    const handleDeletePost = async (postId) => {
        if (!confirm('Delete this post?')) return;
        try {
            const token = getAccessToken();
            await fetch(`/api/social/pages/posts?id=${postId}&author_id=${user.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            busEmit.dataMutated('social-pages');
            setPosts(prev => prev.filter(p => p.id !== postId));
        } catch (e) { console.error("[manage.js]", e); }
    };

    const handlePinPost = async (postId, pinned) => {
        try {
            const token = getAccessToken();
            await fetch('/api/social/pages/posts', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id: postId, author_id: user.id, is_pinned: !pinned }),
            });
            busEmit.dataMutated('social-pages');
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: !pinned } : p));
        } catch (e) { console.error("[manage.js]", e); }
    };

    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
        color: C.text, outline: 'none', boxSizing: 'border-box', background: C.bg,
    };

    if (loading) {
        return (
            <><UniversalHeader />
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg, padding: '76px 16px 80px', fontFamily: "var(--font-inter), -apple-system, sans-serif", maxWidth: 700, margin: '0 auto' }}>
                    <SkeletonLight variant="profile" />
                    <SkeletonLight variant="list" rows={4} />
                </div></>
        );
    }

    if (!page) {
        return (
            <><UniversalHeader />
                <div style={{
                    minHeight: '100vh', background: C.bg, paddingTop: 80, textAlign: 'center',
                    fontFamily: "var(--font-inter), -apple-system, sans-serif" }}>
                    <p style={{ color: C.textSec }}>Page Not Found Or Access Denied.</p>
                </div></>
        );
    }

    return (
        <>
            <SEOHead
                title="Manage Social Page"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />
            <UniversalHeader />

            <div style={{
                minHeight: '100vh', background: C.bg, paddingTop: 60,
                fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" ,
            }}>
                <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <button onClick={() => router.push(`/hub/social-pages/${pageId}`)} style={{
                            background: 'none', border: 'none', color: C.blue, fontSize: 14,
                            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Back to Page
                        </button>
                    </div>

                    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}` }}>
                            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>
                                Manage: {page.name}
                            </h1>
                            <p style={{ fontSize: 14, color: C.textSec, margin: '4px 0 0' }}>
                                {page.follower_count || 0} followers - {page.post_count || 0} posts
                            </p>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
                            {TABS.map(t => (
                                <button key={t} onClick={() => setTab(t)} style={{
                                    padding: '12px 20px', border: 'none', background: 'none',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    color: tab === t ? C.blue : C.textSec,
                                    borderBottom: `3px solid ${tab === t ? C.blue : 'transparent'}`,
                                    textTransform: 'capitalize',
                                }}>
                                    {t}
                                </button>
                            ))}
                        </div>

                        <div style={{ padding: 24 }}>
                            {message && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                                    background: message.startsWith('Error') ? '#FEE2E2' : '#D1FAE5',
                                    color: message.startsWith('Error') ? '#DC2626' : '#059669',
                                    fontSize: 13, fontWeight: 500,
                                }}>
                                    {message}
                                </div>
                            )}

                            {/* Settings Tab */}
                            {tab === 'settings' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div>
                                        <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>
                                            Page Name
                                        </label>
                                        <input type="text" value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                            style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>
                                            Description
                                        </label>
                                        <textarea value={form.description}
                                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>City</label>
                                            <input type="text" value={form.location_city}
                                                onChange={e => setForm(f => ({ ...f, location_city: e.target.value }))} style={inputStyle} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>State</label>
                                            <input type="text" value={form.location_state}
                                                onChange={e => setForm(f => ({ ...f, location_state: e.target.value }))} style={inputStyle} />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>Website</label>
                                        <input type="url" value={form.website}
                                            onChange={e => setForm(f => ({ ...f, website: e.target.value }))} style={inputStyle} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>Contact Email</label>
                                            <input type="email" value={form.contact_email}
                                                onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@example.com" style={inputStyle} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>Phone</label>
                                            <input type="tel" value={form.phone}
                                                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 123-4567" style={inputStyle} />
                                        </div>
                                    </div>

                                    {/* Toggle Settings */}
                                    {[
                                        { field: 'is_public', label: 'Public Page' },
                                        { field: 'allow_member_posts', label: 'Allow Member Posts' },
                                        { field: 'require_post_approval', label: 'Require Post Approval' },
                                    ].map(s => (
                                        <div key={s.field} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 0', borderBottom: `1px solid ${C.bg}`,
                                        }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{s.label}</span>
                                            <button onClick={() => setForm(f => ({ ...f, [s.field]: !f[s.field] }))} style={{
                                                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                                                background: form[s.field] ? C.blue : '#CCD0D5', position: 'relative',
                                            }}>
                                                <div style={{
                                                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                                    position: 'absolute', top: 2,
                                                    left: form[s.field] ? 22 : 2, transition: 'left 0.2s',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                }} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Custom URL Section */}
                                    <div style={{
                                        borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8,
                                    }}>
                                        <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block' }}>
                                            Custom URL
                                        </label>
                                        <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 8px' }}>
                                            Set a clean, memorable URL for your page
                                        </p>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 0,
                                            border: `1px solid ${slugStatus === 'available' ? C.green : slugStatus === 'taken' || slugStatus === 'invalid' ? C.red : C.border}`,
                                            borderRadius: 8, overflow: 'hidden', background: C.bg,
                                            transition: 'border-color 0.2s',
                                        }}>
                                            <span style={{
                                                padding: '10px 10px 10px 12px', fontSize: 13, color: C.textSec,
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
                                                    setForm(f => ({ ...f, slug: raw }));
                                                    setSlugStatus(null);
                                                    setSlugError('');
                                                    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
                                                    if (raw.length >= 3) {
                                                        setSlugStatus('checking');
                                                        slugTimerRef.current = setTimeout(async () => {
                                                            try {
                                                                const res = await fetch(`/api/social/pages/check-slug?slug=${encodeURIComponent(raw)}&page_id=${page.id}`);
                                                                const json = await res.json();
                                                                if (json.success) {
                                                                    setSlugStatus(json.available ? 'available' : 'taken');
                                                                    setSlugError(json.error || '');
                                                                    if (json.formatted && json.formatted !== raw) {
                                                                        setForm(f => ({ ...f, slug: json.formatted }));
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
                                                placeholder="clubjaqk"
                                                style={{
                                                    flex: 1, padding: '10px 12px', border: 'none', fontSize: 14,
                                                    fontFamily: 'inherit', outline: 'none', background: 'transparent',
                                                    color: C.text, minWidth: 0,
                                                }}
                                            />
                                            <div style={{ padding: '0 12px', display: 'flex', alignItems: 'center' }}>
                                                {slugStatus === 'checking' && (
                                                    <div style={{
                                                        width: 16, height: 16, borderRadius: '50%',
                                                        border: `2px solid ${C.border}`, borderTopColor: C.blue,
                                                        animation: 'spin 0.6s linear infinite',
                                                    }} />
                                                )}
                                                {slugStatus === 'available' && (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                )}
                                                {(slugStatus === 'taken' || slugStatus === 'invalid') && (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="3">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                        {slugError && (
                                            <p style={{
                                                fontSize: 12, marginTop: 4, marginBottom: 0,
                                                color: slugStatus === 'available' ? C.green : C.red,
                                                fontWeight: 500,
                                            }}>
                                                {slugError}
                                            </p>
                                        )}
                                        {slugStatus === 'available' && (
                                            <p style={{ fontSize: 12, marginTop: 4, marginBottom: 0, color: C.green, fontWeight: 500 }}>
                                                This URL is available
                                            </p>
                                        )}
                                        {form.slug && form.slug.length >= 3 && slugStatus === 'available' && (
                                            <p style={{ fontSize: 11, marginTop: 6, marginBottom: 0, color: C.textSec }}>
                                                Your page will be at: <strong>smarter.poker/hub/social-pages/{form.slug}</strong>
                                            </p>
                                        )}
                                    </div>

                                    <button onClick={handleSave} disabled={saving || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid'} style={{
                                        width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                                        background: (saving || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid') ? '#CCD0D5' : C.blue, color: '#fff',
                                        fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8,
                                    }}>
                                        {saving ? 'Saving...' : 'Save Settings'}
                                    </button>
                                </div>
                            )}

                            {/* Members Tab */}
                            {tab === 'members' && (
                                <div>
                                    <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                                        {members.length} member{members.length !== 1 ? 's' : ''}
                                    </p>
                                    {members.map(m => (
                                        <div key={m.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                                            borderBottom: `1px solid ${C.bg}`,
                                        }}>
                                            <div style={{
                                                width: 40, height: 40, borderRadius: '50%',
                                                background: m.profile?.avatar_url ? `url(${m.profile.avatar_url}) center/cover` : C.blue,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 700, fontSize: 16,
                                            }}>
                                                {!m.profile?.avatar_url && (m.profile?.full_name || '?')[0]}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                                                    {m.profile?.full_name || m.profile?.username || 'Unknown'}
                                                </div>
                                                <div style={{ fontSize: 12, color: C.textSec, textTransform: 'capitalize' }}>
                                                    {m.role}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Posts Tab */}
                            {tab === 'posts' && (
                                <div>
                                    <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                                        {posts.length} post{posts.length !== 1 ? 's' : ''}
                                    </p>
                                    {posts.map(p => (
                                        <div key={p.id} style={{
                                            padding: '12px 0', borderBottom: `1px solid ${C.bg}`,
                                            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                                                    {p.author?.full_name || 'Unknown'}
                                                    {p.is_pinned && <span style={{ color: C.blue, marginLeft: 6 }}>[Pinned]</span>}
                                                </div>
                                                <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>
                                                    {(p.content || '').substring(0, 100)}
                                                    {(p.content || '').length > 100 ? '...' : ''}
                                                </div>
                                                <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>
                                                    {p.like_count || 0} likes - {p.comment_count || 0} comments
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => handlePinPost(p.id, p.is_pinned)} style={{
                                                    padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.border}`,
                                                    background: C.bg, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                                                    color: p.is_pinned ? C.blue : C.textSec,
                                                }}>
                                                    {p.is_pinned ? 'Unpin' : 'Pin'}
                                                </button>
                                                <button onClick={() => handleDeletePost(p.id)} style={{
                                                    padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.border}`,
                                                    background: C.bg, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                                                    color: C.red,
                                                }}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Analytics Tab */}
                            {tab === 'analytics' && (
                                <div>
                                    {/* Overview Stats Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {[
                                            { label: 'Followers', value: page.follower_count || 0, color: C.blue, icon: '👥' },
                                            { label: 'Total Posts', value: posts.length, color: C.green, icon: '📝' },
                                            { label: 'Total Likes', value: posts.reduce((sum, p) => sum + (p.like_count || 0), 0), color: C.orange, icon: '👍' },
                                            { label: 'Total Comments', value: posts.reduce((sum, p) => sum + (p.comment_count || 0), 0), color: '#9333EA', icon: '💬' },
                                        ].map(s => (
                                            <div key={s.label} style={{
                                                background: C.bg, borderRadius: 12, padding: 16, textAlign: 'center',
                                                border: `1px solid ${C.border}`,
                                            }}>
                                                <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                                                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginTop: 2 }}>{s.label}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Engagement Rate */}
                                    <div style={{
                                        background: C.bg, borderRadius: 12, padding: 16, marginBottom: 24,
                                        border: `1px solid ${C.border}`,
                                    }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: C.text }}>Engagement Rate</h4>
                                        <div style={{ fontSize: 13, color: C.textSec }}>
                                            {posts.length > 0 ? (
                                                <>
                                                    <span style={{ fontSize: 28, fontWeight: 800, color: C.blue }}>
                                                        {((posts.reduce((s, p) => s + (p.like_count || 0) + (p.comment_count || 0), 0) / posts.length)).toFixed(1)}
                                                    </span>
                                                    <span style={{ marginLeft: 4 }}>interactions per post</span>
                                                </>
                                            ) : 'No posts yet to calculate engagement'}
                                        </div>
                                    </div>

                                    {/* Top Posts */}
                                    {posts.length > 0 && (
                                        <div style={{
                                            background: C.bg, borderRadius: 12, padding: 16,
                                            border: `1px solid ${C.border}`,
                                        }}>
                                            <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: C.text }}>Top Posts by Engagement</h4>
                                            {[...posts]
                                                .sort((a, b) => ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0)))
                                                .slice(0, 5)
                                                .map((p, i) => (
                                                    <div key={p.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                                                        borderBottom: i < 4 ? `1px solid ${C.border}` : 'none',
                                                    }}>
                                                        <div style={{
                                                            width: 28, height: 28, borderRadius: '50%', background: C.blue,
                                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: 13, fontWeight: 700, flexShrink: 0,
                                                        }}>{i + 1}</div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {(p.content || '').substring(0, 80)}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                                                                {p.like_count || 0} likes · {p.comment_count || 0} comments
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Invitations Tab */}
                            {tab === 'invitations' && (
                                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                    <p style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Invite Members</p>
                                    <p style={{ fontSize: 13, color: C.textSec }}>
                                        Share this link to invite people to your page:
                                    </p>
                                    <div style={{
                                        background: C.bg, borderRadius: 8, padding: '12px 16px',
                                        fontSize: 13, color: C.blue, marginTop: 12, wordBreak: 'break-all',
                                        border: `1px solid ${C.border}`,
                                    }}>
                                        {typeof window !== 'undefined' ? `${window.location.origin}/hub/social-pages/${page.slug || page.id}` : ''}
                                    </div>
                                    <button onClick={() => {
                                        navigator.clipboard.writeText(`${window.location.origin}/hub/social-pages/${page.slug || page.id}`);
                                        setMessage('Link copied to clipboard!');
                                    }} style={{
                                        marginTop: 12, padding: '8px 20px', borderRadius: 8, border: 'none',
                                        background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'inherit',
                                    }}>
                                        Copy Link
                                    </button>

                                    {/* QR Code */}
                                    <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
                                        <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>QR Code</p>
                                        <p style={{ fontSize: 12, color: C.textSec, marginBottom: 12 }}>
                                            Scan to visit your page
                                        </p>
                                        {typeof window !== 'undefined' && (
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/hub/social-pages/${page.slug || page.id}`)}`}
                                                alt={`QR code for ${page.name}`}
                                                width={200} height={200}
                                                style={{ borderRadius: 8, border: `1px solid ${C.border}` }}
                                            />
                                        )}
                                        <div style={{ marginTop: 8 }}>
                                            <button onClick={() => {
                                                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`${window.location.origin}/hub/social-pages/${page.slug || page.id}`)}`;
                                                const a = document.createElement('a');
                                                a.href = qrUrl;
                                                a.download = `${page.slug || page.id}-qr.png`;
                                                a.target = '_blank';
                                                a.click();
                                            }} style={{
                                                padding: '6px 16px', borderRadius: 6, border: `1px solid ${C.border}`,
                                                background: C.bg, color: C.text, fontSize: 12, fontWeight: 600,
                                                cursor: 'pointer', fontFamily: 'inherit',
                                            }}>
                                                Download QR Code
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
              <BottomNavBar />
            </div>
            <style jsx global>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
}
