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
    const [memberSearch, setMemberSearch] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [removingMember, setRemovingMember] = useState(new Set());
    const [initialForm, setInitialForm] = useState(null); // #12 Unsaved changes guard

    // Editable fields
    const [form, setForm] = useState({
        name: '', description: '', category: '', website: '',
        contact_email: '', phone: '', location_city: '', location_state: '',
        is_public: true, allow_member_posts: true, require_post_approval: false,
        slug: '',
        // P8-7: Social links
        social_instagram: '', social_twitter: '', social_facebook: '',
    });

    // Custom URL slug checking
    const [slugStatus, setSlugStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
    const [slugError, setSlugError] = useState('');
    const [slugSuggestions, setSlugSuggestions] = useState([]);
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
                    // P8-7: Hydrate social links from metadata
                    social_instagram: json.data.metadata?.social_links?.instagram || '',
                    social_twitter: json.data.metadata?.social_links?.twitter || '',
                    social_facebook: json.data.metadata?.social_links?.facebook || '',
                });
                // #12: Store initial form state for dirty detection
                setInitialForm({
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
                    social_instagram: json.data.metadata?.social_links?.instagram || '',
                    social_twitter: json.data.metadata?.social_links?.twitter || '',
                    social_facebook: json.data.metadata?.social_links?.facebook || '',
                });
            }
        } catch (e) {
            console.warn('[manage.js] Failed to fetch page:', e?.message || e);
        }
        setLoading(false);
    }, [pageId, user, router]);

    useEffect(() => { const _c = new AbortController(); fetchPage(_c.signal); return () => _c.abort(); }, [fetchPage]);

    // Cleanup slug debounce timer on unmount
    useEffect(() => {
        return () => { if (slugTimerRef.current) clearTimeout(slugTimerRef.current); };
    }, []);

    // #12: Unsaved changes guard — beforeunload
    const isFormDirty = initialForm && JSON.stringify(form) !== JSON.stringify(initialForm);
    useEffect(() => {
        const handler = (e) => {
            if (isFormDirty) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isFormDirty]);

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
        if (tabRef.current === 'posts' || tabRef.current === 'analytics') fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_page_followers', filter: `page_id=eq.${resolvedId}` }, () => {
        if (tabRef.current === 'members') fetchMembers();
        fetchPage(); // refresh follower count
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
        } catch (e) { console.warn('[manage.js] fetchMembers error:', e?.message || e); }
    };

    const fetchPosts = async () => {
        try {
            const res = await fetch(`/api/social/pages/posts?page_id=${page.id}&limit=50`);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) setPosts(json.data || []);
        } catch (e) { console.warn('[manage.js] fetchPosts error:', e?.message || e); }
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
                body: JSON.stringify({
                    id: page.id,
                    ...form,
                    // P8-7: Nest social links into metadata.social_links
                    metadata: {
                        ...page.metadata,
                        social_links: {
                            instagram: form.social_instagram || '',
                            twitter: form.social_twitter || '',
                            facebook: form.social_facebook || '',
                        },
                    },
                }),
            });
            const json = await res.json();
            if (json.success) {
                busEmit.dataMutated('social-pages');
                setMessage('Settings saved successfully');
                setPage(json.data);
                // Reset slug status since it's now the saved slug
                setSlugStatus(null);
                setSlugError('');
                // If slug changed, update the URL so fetchPage/realtime don't use the stale slug
                if (json.data.slug && json.data.slug !== pageId) {
                    router.replace(`/hub/social-pages/${json.data.slug}/manage`, undefined, { shallow: true });
                }
            } else {
                setMessage('Error: ' + (json.error || 'Failed to save'));
            }
        } catch {
            setMessage('Error: Network error');
        }
        setSaving(false);
    };

    const handleDeletePost = (postId) => {
        if (!confirm('Delete this post?')) return;
        // EAGER STATE SYNCHRONIZATION: Remove from list immediately (BFCache-safe)
        const prevPosts = posts;
        setPosts(prev => prev.filter(p => p.id !== postId));
        busEmit.dataMutated('social-pages');

        // Fire-and-forget with rollback on failure
        const token = getAccessToken();
        fetch(`/api/social/pages/posts?id=${postId}&author_id=${user.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(e => {
            console.warn('[manage.js] Error:', e?.message || e);
            setPosts(prevPosts);
        });
    };

    const handlePinPost = (postId, pinned) => {
        // EAGER STATE SYNCHRONIZATION: Toggle pin state immediately (BFCache-safe)
        const prevPosts = posts;
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: !pinned } : p));
        busEmit.dataMutated('social-pages');

        // Fire-and-forget with rollback on failure
        const token = getAccessToken();
        fetch('/api/social/pages/posts', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id: postId, author_id: user.id, is_pinned: !pinned }),
        }).catch(e => {
            console.warn('[manage.js] Error:', e?.message || e);
            setPosts(prevPosts);
        });
    };

    // #9: Delete Page handler
    const handleDeletePage = async () => {
        setDeleting(true);
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/social/pages?id=${page.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                busEmit.dataMutated('social-pages');
                router.push('/hub/social-pages');
            } else {
                setMessage('Error: Failed to delete page');
            }
        } catch {
            setMessage('Error: Network error during deletion');
        }
        setDeleting(false);
        setShowDeleteModal(false);
    };

    // #10: Remove member handler
    const handleRemoveMember = (followerId) => {
        setRemovingMember(prev => { const next = new Set(prev); next.add(followerId); return next; });

        // EAGER STATE SYNCHRONIZATION: Remove from list immediately (BFCache-safe)
        const prevMembers = members;
        setMembers(prev => prev.filter(m => m.user_id !== followerId));
        setMessage('Member removed');
        busEmit.dataMutated('social-pages');

        // Fire-and-forget with rollback on failure
        const token = getAccessToken();
        fetch(`/api/social/pages/follow?page_id=${page.id}&follower_id=${followerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        }).then(res => {
            if (!res.ok) {
                setMembers(prevMembers);
                setMessage('Error: Failed to remove member');
            }
        }).catch(() => {
            setMembers(prevMembers);
            setMessage('Error: Network error');
        }).finally(() => {
            setRemovingMember(prev => { const next = new Set(prev); next.delete(followerId); return next; });
        });
    };

    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
        color: C.text, outline: 'none', boxSizing: 'border-box', background: C.bg,
    };

    if (loading) {
        return (
            <><UniversalHeader pageDepth={2} />
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg, padding: '76px 16px 80px', fontFamily: "var(--font-inter), -apple-system, sans-serif", maxWidth: 700, margin: '0 auto' }}>
                    <SkeletonLight variant="profile" />
                    <SkeletonLight variant="list" rows={4} />
                </div></>
        );
    }

    if (!page) {
        return (
            <><UniversalHeader pageDepth={2} />
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
            <UniversalHeader pageDepth={2} />

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
                                    {/* --- Completeness Progress Bar --- */}
                                    {(() => {
                                        const checks = [
                                            { label: 'Page Name', done: !!form.name?.trim() },
                                            { label: 'Description', done: !!form.description?.trim() },
                                            { label: 'Location (City & State)', done: !!(form.location_city?.trim() && form.location_state?.trim()) },
                                            { label: 'Contact Info', done: !!(form.contact_email?.trim() || form.phone?.trim()) },
                                            { label: 'Social Links', done: !!(form.social_instagram?.trim() || form.social_twitter?.trim() || form.social_facebook?.trim()) },
                                            { label: 'Custom URL', done: !!form.slug?.trim() }
                                        ];
                                        const completed = checks.filter(c => c.done).length;
                                        const percentage = Math.round((completed / checks.length) * 100);
                                        const is100 = percentage === 100;
                                        
                                        return (
                                            <div style={{
                                                background: '#0D192E', border: '1px solid #4A5E78', borderRadius: 12, padding: 20, marginBottom: 8,
                                                boxShadow: 'inset 0 0 16px rgba(0,0,0,0.4)',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            Profile Completeness
                                                            {is100 && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                                                        </h3>
                                                        <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 13 }}>
                                                            {is100 ? 'Your page is fully configured!' : 'Complete the checklist below to maximize discoverability.'}
                                                        </p>
                                                    </div>
                                                    <div style={{ fontSize: 24, fontWeight: 800, color: is100 ? '#22D3EE' : '#fff' }}>
                                                        {percentage}%
                                                    </div>
                                                </div>
                                                
                                                {/* Progress Track */}
                                                <div style={{ height: 10, background: '#132240', borderRadius: 5, overflow: 'hidden', marginBottom: 16 }}>
                                                    <div style={{
                                                        height: '100%', width: `${percentage}%`,
                                                        background: 'linear-gradient(90deg, #3B82F6 0%, #22D3EE 100%)',
                                                        transition: 'width 0.4s ease-out',
                                                        boxShadow: '0 0 10px rgba(34, 211, 238, 0.4)'
                                                    }} />
                                                </div>
                                                
                                                {/* Checklist */}
                                                {!is100 && (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                        {checks.map(c => (
                                                            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <div style={{
                                                                    width: 18, height: 18, borderRadius: '50%',
                                                                    border: `2px solid ${c.done ? '#22D3EE' : '#4A5E78'}`,
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                }}>
                                                                    {c.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
                                                                </div>
                                                                <span style={{ fontSize: 13, color: c.done ? '#94A3B8' : '#fff', textDecoration: c.done ? 'line-through' : 'none' }}>
                                                                    {c.label}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    
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
                                    {/* P8-7: Social Links Editor */}
                                    <div style={{
                                        borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8,
                                    }}>
                                        <label style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8, display: 'block' }}>
                                            Social Media Links
                                        </label>
                                        <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 12px' }}>
                                            Add your social media profiles to display on your About tab
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {[
                                                { key: 'social_instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourpage', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E4405F" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="#E4405F" stroke="none" /></svg>) },
                                                { key: 'social_twitter', label: 'Twitter / X', placeholder: 'https://x.com/yourpage', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"><path d="M4 4l6.5 8L4 20h2l5.5-6.8L16 20h4l-7-8.5L20 4h-2l-5 6.2L9 4H4z" /></svg>) },
                                                { key: 'social_facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1877F2" strokeWidth="2"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></svg>) },
                                            ].map(s => (
                                                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5', borderRadius: 8 }}>
                                                        {s.icon}
                                                    </div>
                                                    <input
                                                        type="url"
                                                        value={form[s.key]}
                                                        onChange={e => setForm(f => ({ ...f, [s.key]: e.target.value }))}
                                                        placeholder={s.placeholder}
                                                        style={inputStyle}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

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
                                                    setSlugSuggestions([]);
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
                                                                    setSlugSuggestions(json.suggestions || []);
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
                                        {slugSuggestions.length > 0 && slugStatus === 'taken' && (
                                            <div style={{ marginTop: 6 }}>
                                                <p style={{ fontSize: 11, color: C.textSec, margin: '0 0 4px', fontWeight: 500 }}>Try these instead:</p>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    {slugSuggestions.map(s => (
                                                        <button key={s} onClick={() => {
                                                            setForm(f => ({ ...f, slug: s }));
                                                            setSlugStatus('checking');
                                                            setSlugError('');
                                                            setSlugSuggestions([]);
                                                            if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
                                                            slugTimerRef.current = setTimeout(async () => {
                                                                try {
                                                                    const res = await fetch(`/api/social/pages/check-slug?slug=${encodeURIComponent(s)}&page_id=${page.id}`);
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

                                    <button onClick={handleSave} disabled={saving || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid'} style={{
                                        width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                                        background: (saving || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid') ? '#CCD0D5' : C.blue, color: '#fff',
                                        fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8,
                                    }}>
                                        {saving ? 'Saving...' : 'Save Settings'}
                                    </button>

                                    {/* #12: Unsaved changes warning */}
                                    {isFormDirty && (
                                        <div style={{
                                            marginTop: 12, padding: '10px 14px', borderRadius: 8,
                                            background: '#FEF3C7', border: '1px solid #F59E0B',
                                            fontSize: 13, fontWeight: 500, color: '#92400E',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                        }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                            </svg>
                                            You have unsaved changes
                                        </div>
                                    )}

                                    {/* #9: Danger Zone — Delete Page */}
                                    <div style={{
                                        borderTop: `1px solid ${C.border}`, paddingTop: 24, marginTop: 24,
                                    }}>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.red, margin: '0 0 8px' }}>Danger Zone</h3>
                                        <p style={{ fontSize: 13, color: C.textSec, margin: '0 0 12px' }}>
                                            Permanently delete this page and all its content. This cannot be undone.
                                        </p>
                                        <button onClick={() => setShowDeleteModal(true)} style={{
                                            padding: '10px 24px', borderRadius: 8, border: `1px solid ${C.red}`,
                                            background: 'transparent', color: C.red, fontSize: 14, fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                        }}>
                                            Delete Page
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Members Tab */}
                            {tab === 'members' && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
                                            {members.length} member{members.length !== 1 ? 's' : ''}
                                        </p>
                                        {members.length > 3 && (
                                            <input
                                                type="text" placeholder="Search members..."
                                                value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                                                aria-label="Search members"
                                                style={{
                                                    padding: '6px 12px', borderRadius: 20, border: `1px solid ${C.border}`,
                                                    fontSize: 13, fontFamily: 'inherit', background: C.bg, color: C.text,
                                                    outline: 'none', width: 180,
                                                }}
                                            />
                                        )}
                                    </div>
                                    {members
                                        .filter(m => !memberSearch || (m.profile?.full_name || m.profile?.username || '').toLowerCase().includes(memberSearch.toLowerCase()))
                                        .map(m => (
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
                                                {m.role === 'owner' ? (
                                                    <div style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>Owner</div>
                                                ) : (
                                                    <select value={m.role || 'follower'} onChange={async (e) => {
                                                        const newRole = e.target.value;
                                                        const prevRole = m.role;
                                                        setMembers(prev => prev.map(mm => mm.id === m.id ? { ...mm, role: newRole } : mm)); // optimistic
                                                        try {
                                                            const token = getAccessToken();
                                                            const res = await fetch('/api/social/pages/follow', {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                                body: JSON.stringify({ page_id: page.id, follower_id: m.user_id, role: newRole }),
                                                            });
                                                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                                            const json = await res.json();
                                                            if (!json.success) throw new Error(json.error || 'Update failed');
                                                            setMessage(`Role updated to ${newRole}`);
                                                            busEmit.dataMutated('social-pages');
                                                        } catch (err) {
                                                            setMembers(prev => prev.map(mm => mm.id === m.id ? { ...mm, role: prevRole } : mm)); // rollback
                                                            setMessage('Failed to update role');
                                                        }
                                                    }} style={{
                                                        fontSize: 12, padding: '2px 6px', borderRadius: 6,
                                                        border: `1px solid ${C.border}`, background: C.bg,
                                                        color: C.text, fontFamily: 'inherit', cursor: 'pointer',
                                                    }}>
                                                        <option value="follower">Follower</option>
                                                        <option value="moderator">Moderator</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                )}
                                            </div>
                                            {/* #10: Remove button for non-owner members */}
                                            {m.role !== 'owner' && (
                                                <button
                                                    onClick={() => handleRemoveMember(m.user_id)}
                                                    disabled={removingMember.has(m.user_id)}
                                                    aria-label={`Remove ${m.profile?.full_name || 'member'}`}
                                                    style={{
                                                        padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
                                                        background: C.bg, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                                                        color: C.red, opacity: removingMember.has(m.user_id) ? 0.5 : 1,
                                                    }}
                                                >
                                                    {removingMember.has(m.user_id) ? 'Removing...' : 'Remove'}
                                                </button>
                                            )}
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
                                    {/* #11: 7-day Post Frequency Sparkline */}
                                    {posts.length > 0 && (() => {
                                        const now = new Date();
                                        const days = Array.from({ length: 7 }, (_, i) => {
                                            const d = new Date(now);
                                            d.setDate(d.getDate() - (6 - i));
                                            return d.toISOString().slice(0, 10);
                                        });
                                        const counts = days.map(day => posts.filter(p => (p.created_at || '').slice(0, 10) === day).length);
                                        const max = Math.max(...counts, 1);
                                        const w = 300, h = 60, pad = 4;
                                        const points = counts.map((c, i) => `${pad + i * ((w - 2 * pad) / 6)},${h - pad - (c / max) * (h - 2 * pad)}`).join(' ');
                                        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                                        return (
                                            <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${C.border}` }}>
                                                <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: C.text }}>Posts (Last 7 Days)</h4>
                                                <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80 }}>
                                                    <polyline points={points} fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    {counts.map((c, i) => (
                                                        <circle key={i} cx={pad + i * ((w - 2 * pad) / 6)} cy={h - pad - (c / max) * (h - 2 * pad)} r="3" fill={C.blue} />
                                                    ))}
                                                </svg>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textSec, marginTop: 4 }}>
                                                    {days.map((d, i) => <span key={d}>{dayLabels[new Date(d).getDay()] || d.slice(5)}</span>)}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Overview Stats Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {[
                                            { label: 'Page Views', value: page.view_count || 0, color: '#0EA5E9', icon: '\uD83D\uDC41' },
                                            { label: 'Followers', value: page.follower_count || 0, color: C.blue, icon: '\uD83D\uDC65' },
                                            { label: 'Total Posts', value: posts.length, color: C.green, icon: '\uD83D\uDCDD' },
                                            { label: 'Total Likes', value: posts.reduce((sum, p) => sum + (p.like_count || 0), 0), color: C.orange, icon: '\uD83D\uDC4D' },
                                            { label: 'Total Comments', value: posts.reduce((sum, p) => sum + (p.comment_count || 0), 0), color: '#9333EA', icon: '\uD83D\uDCAC' },
                                            { label: 'Avg Rating', value: page.avg_rating ? page.avg_rating.toFixed(1) : '\u2014', color: '#F59E0B', icon: '\u2B50' },
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

            {/* #9: Delete Confirmation Modal */}
            {showDeleteModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }} onClick={() => setShowDeleteModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: C.card, borderRadius: 12, padding: 24, maxWidth: 420, width: '100%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.red, margin: '0 0 8px' }}>Delete Page</h3>
                        <p style={{ fontSize: 14, color: C.text, margin: '0 0 16px', lineHeight: 1.5 }}>
                            This will permanently delete <strong>{page.name}</strong> and all its posts, comments, and followers. This action cannot be undone.
                        </p>
                        <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 6 }}>
                            Type <strong>{page.name}</strong> to confirm:
                        </label>
                        <input
                            type="text" value={deleteConfirm}
                            onChange={e => setDeleteConfirm(e.target.value)}
                            placeholder={page.name}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 8,
                                border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
                                color: C.text, outline: 'none', boxSizing: 'border-box', background: C.bg,
                                marginBottom: 16,
                            }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }} style={{
                                flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${C.border}`,
                                background: C.card, color: C.text, fontSize: 14, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                            }}>Cancel</button>
                            <button
                                onClick={handleDeletePage}
                                disabled={deleteConfirm !== page.name || deleting}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                                    background: deleteConfirm === page.name ? C.red : '#CCD0D5',
                                    color: '#fff', fontSize: 14, fontWeight: 600,
                                    cursor: deleteConfirm === page.name ? 'pointer' : 'default',
                                    fontFamily: 'inherit', opacity: deleting ? 0.7 : 1,
                                }}
                            >
                                {deleting ? 'Deleting...' : 'Delete Forever'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
}
