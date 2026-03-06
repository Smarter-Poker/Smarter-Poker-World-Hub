/**
 * Social Page Management - Owner/admin dashboard for managing page settings,
 * members, content moderation, and analytics
 */
import Link from 'next/link';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import { getAuthUser, getAccessToken } from '../../../../src/lib/authUtils';
import SkeletonLight from '../../../../src/components/ui/SkeletonLight';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A', red: '#FA383E', orange: '#F5A623',
};

const TABS = ['settings', 'members', 'posts', 'invitations'];

export default function ManageSocialPage() {
    const router = useRouter();
    if (!router.isReady) return null;
    const { pageId } = router.query;
    const [user, setUser] = useState(null);
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
    });

    useEffect(() => {
        const u = getAuthUser();
        if (!u) { router.push('/auth/login'); return; }
        setUser(u);
    }, [router]);

    const fetchPage = useCallback(async (signal) => {
        if (!pageId || !user) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/social/pages?id=${pageId}&user_id=${user.id}`);
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
                });
            }
        } catch (e) {
            console.error('Failed to fetch page:', e);
        }
        setLoading(false);
    }, [pageId, user, router]);

    useEffect(() => { const _c = new AbortController(); fetchPage(_c.signal); return () => _c.abort(); }, [fetchPage]);

    useEffect(() => {
        if (!page) return;
        if (tab === 'members') fetchMembers();
        if (tab === 'posts') fetchPosts();
    }, [tab, page]);

    const fetchMembers = async () => {
        try {
            const reqParam = user?.id ? `&requester_id=${user.id}` : '';
            const res = await fetch(`/api/social/pages/follow?page_id=${page.id}${reqParam}`);
            const json = await res.json();
            if (json.success) setMembers(json.data || []);
        } catch (e) { console.error("[manage.js]", e); }
    };

    const fetchPosts = async () => {
        try {
            const res = await fetch(`/api/social/pages/posts?page_id=${page.id}&limit=50`);
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
                body: JSON.stringify({ id: page.id, owner_id: user.id, ...form }),
            });
            const json = await res.json();
            if (json.success) {
                setMessage('Settings saved successfully');
                setPage(json.data);
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
                <div style={{ minHeight: '100vh', background: C.bg, padding: '76px 16px 80px', fontFamily: "var(--font-inter), -apple-system, sans-serif", maxWidth: 700, margin: '0 auto' }}>
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

                                    <button onClick={handleSave} disabled={saving} style={{
                                        width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                                        background: saving ? '#CCD0D5' : C.blue, color: '#fff',
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
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
