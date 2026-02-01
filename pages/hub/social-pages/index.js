/**
 * Social Pages Hub - Browse, discover, and manage social pages
 * Displays venue pages, group pages, community pages with follow/join
 */
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { getAuthUser } from '../../../src/lib/authUtils';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A',
    red: '#FA383E', orange: '#F5A623',
};

const TABS = [
    { key: 'discover', label: 'Discover' },
    { key: 'following', label: 'Your Pages' },
    { key: 'managed', label: 'Managed' },
];

const TYPE_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'venue', label: 'Venues' },
    { key: 'group', label: 'Groups' },
    { key: 'community', label: 'Communities' },
    { key: 'brand', label: 'Brands' },
];

const timeAgo = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

function PageCard({ page, isFollowing, onFollow, onView }) {
    const typeLabel = { venue: 'Venue', group: 'Group', community: 'Community', brand: 'Brand' };
    const typeColor = { venue: C.blue, group: C.green, community: '#8b5cf6', brand: C.orange };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                overflow: 'hidden', cursor: 'pointer',
            }}
            onClick={onView}
        >
            {/* Cover */}
            <div style={{
                height: 100, background: page.cover_url
                    ? `url(${page.cover_url}) center/cover` : `linear-gradient(135deg, ${typeColor[page.page_type] || C.blue}, #8b5cf6)`,
                position: 'relative',
            }}>
                <span style={{
                    position: 'absolute', top: 8, left: 8, padding: '3px 8px',
                    borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                    {typeLabel[page.page_type] || page.page_type}
                </span>
                {page.is_verified && (
                    <span style={{
                        position: 'absolute', top: 8, right: 8, padding: '3px 8px',
                        borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: C.blue, color: '#fff',
                    }}>Verified</span>
                )}
            </div>

            {/* Avatar */}
            <div style={{ padding: '0 14px', marginTop: -24, position: 'relative', zIndex: 2 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 10, border: `3px solid ${C.card}`,
                    background: page.avatar_url ? `url(${page.avatar_url}) center/cover` : typeColor[page.page_type] || C.blue,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 800, fontSize: 18,
                }}>
                    {!page.avatar_url && (page.name || '?')[0].toUpperCase()}
                </div>
            </div>

            {/* Info */}
            <div style={{ padding: '8px 14px 14px' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.3 }}>
                    {page.name}
                </h3>
                {page.description && (
                    <p style={{
                        fontSize: 13, color: C.textSec, margin: '4px 0 0',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}>
                        {page.description}
                    </p>
                )}

                <div style={{ display: 'flex', gap: 12, margin: '8px 0', fontSize: 12, color: C.textSec }}>
                    <span>{page.follower_count || 0} followers</span>
                    <span>{page.post_count || 0} posts</span>
                    {page.location_city && <span>{page.location_city}, {page.location_state}</span>}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); onFollow(); }}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: 8,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: 'none', fontFamily: 'inherit',
                            background: isFollowing ? '#E4E6EB' : C.blue,
                            color: isFollowing ? C.text : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                    >
                        {isFollowing ? 'Following' : 'Follow'}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onView(); }}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: 8,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: 'none', fontFamily: 'inherit',
                            background: '#E4E6EB', color: C.text,
                        }}
                    >
                        View Page
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

export default function SocialPagesHub() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [tab, setTab] = useState('discover');
    const [typeFilter, setTypeFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [followingIds, setFollowingIds] = useState(new Set());

    useEffect(() => {
        const u = getAuthUser();
        if (u) setUser(u);
    }, []);

    const fetchPages = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (typeFilter !== 'all') params.set('page_type', typeFilter);
            if (search) params.set('search', search);
            if (user?.id) params.set('user_id', user.id);
            if (tab === 'following') params.set('followed_only', 'true');
            if (tab === 'managed' && user?.id) params.set('owner_id', user.id);

            const res = await fetch(`/api/social/pages?${params}`);
            const json = await res.json();
            if (json.success) {
                setPages(json.data || []);
                const followSet = new Set();
                (json.data || []).forEach(p => { if (p.is_following) followSet.add(p.id); });
                setFollowingIds(followSet);
            }
        } catch (e) {
            console.error('Failed to fetch pages:', e);
        }
        setLoading(false);
    }, [tab, typeFilter, search, user]);

    useEffect(() => { fetchPages(); }, [fetchPages]);

    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const handleFollow = async (pageId) => {
        if (!user) { router.push('/auth/login'); return; }
        const isFollowing = followingIds.has(pageId);

        // Optimistic update
        setFollowingIds(prev => {
            const next = new Set(prev);
            if (isFollowing) next.delete(pageId); else next.add(pageId);
            return next;
        });
        setPages(prev => prev.map(p =>
            p.id === pageId ? {
                ...p,
                is_following: !isFollowing,
                follower_count: isFollowing ? Math.max(0, (p.follower_count || 1) - 1) : (p.follower_count || 0) + 1
            } : p
        ));

        try {
            await fetch('/api/social/pages/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_id: pageId,
                    user_id: user.id,
                    action: isFollowing ? 'unfollow' : 'follow'
                }),
            });
        } catch {}
    };

    return (
        <>
            <Head>
                <title>Social Pages | Smarter.Poker</title>
                <meta name="description" content="Discover and follow poker venues, groups, and community pages" />
            </Head>
            <UniversalHeader />

            <div style={{
                minHeight: '100vh', background: C.bg, paddingBottom: 72,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            }}>
                {/* Header */}
                <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, paddingTop: 60 }}>
                    <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0 }}>Social Pages</h1>
                                <p style={{ fontSize: 14, color: C.textSec, margin: '4px 0 0' }}>
                                    Discover venues, groups, and communities
                                </p>
                            </div>
                            {user && (
                                <button
                                    onClick={() => router.push('/hub/social-pages/create')}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8, border: 'none',
                                        background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'inherit',
                                    }}
                                >
                                    + Create Page
                                </button>
                            )}
                        </div>

                        {/* Search */}
                        <div style={{ position: 'relative', marginBottom: 12 }}>
                            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input
                                type="text" placeholder="Search pages..."
                                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: 20,
                                    border: `1px solid ${C.border}`, fontSize: 15, fontFamily: 'inherit',
                                    background: C.bg, color: C.text, outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 0 }}>
                            {TABS.map(t => (
                                <button key={t.key} onClick={() => setTab(t.key)} style={{
                                    padding: '12px 16px', border: 'none', background: 'none',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    color: tab === t.key ? C.blue : C.textSec,
                                    borderBottom: `3px solid ${tab === t.key ? C.blue : 'transparent'}`,
                                }}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Type Filters */}
                <div style={{
                    background: C.card, borderBottom: `1px solid ${C.border}`,
                    position: 'sticky', top: 56, zIndex: 10,
                }}>
                    <div style={{
                        maxWidth: 960, margin: '0 auto', padding: '8px 16px',
                        display: 'flex', gap: 8, overflowX: 'auto',
                    }}>
                        {TYPE_FILTERS.map(f => (
                            <button key={f.key} onClick={() => setTypeFilter(f.key)} style={{
                                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                border: `1px solid ${typeFilter === f.key ? C.blue : C.border}`,
                                background: typeFilter === f.key ? '#E7F3FF' : C.bg,
                                color: typeFilter === f.key ? C.blue : C.text,
                            }}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <div style={{
                                width: 32, height: 32, border: `3px solid #E4E6EB`,
                                borderTopColor: C.blue, borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite', margin: '0 auto',
                            }}/>
                            <p style={{ color: C.textSec, fontSize: 14, marginTop: 12 }}>Loading pages...</p>
                        </div>
                    ) : pages.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', background: C.card,
                            borderRadius: 12, border: `1px solid ${C.border}`,
                        }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCD0D5" strokeWidth="1.5">
                                <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/>
                            </svg>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '16px 0 4px' }}>
                                {tab === 'following' ? 'No followed pages yet' : tab === 'managed' ? 'No pages created yet' : 'No pages found'}
                            </h3>
                            <p style={{ fontSize: 14, color: C.textSec, margin: 0 }}>
                                {tab === 'managed' ? 'Create your first page to get started.' : 'Try a different search or filter.'}
                            </p>
                            {tab === 'managed' && (
                                <button onClick={() => router.push('/hub/social-pages/create')} style={{
                                    marginTop: 16, padding: '10px 24px', background: C.blue, border: 'none',
                                    borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    Create a Page
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 12,
                        }}>
                            <AnimatePresence>
                                {pages.map(page => (
                                    <PageCard
                                        key={page.id}
                                        page={page}
                                        isFollowing={followingIds.has(page.id)}
                                        onFollow={() => handleFollow(page.id)}
                                        onView={() => router.push(`/hub/social-pages/${page.slug || page.id}`)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* Bottom Nav */}
                <div style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0,
                    background: C.card, borderTop: `1px solid ${C.border}`,
                    display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 50,
                }}>
                    {[
                        { href: '/hub/social-media', label: 'Home', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
                        { href: '/hub/poker-near-me', label: 'Search', icon: null, isSvg: true },
                        { href: '/hub/social-pages', label: 'Pages', active: true, icon: null, isSvg: true },
                        { href: '/hub/friends', label: 'Friends', icon: null, isSvg: true },
                        { href: '/hub/notifications', label: 'Alerts', icon: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' },
                    ].map((nav, i) => (
                        <Link key={i} href={nav.href} legacyBehavior>
                            <a style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                padding: '4px 12px', color: nav.active ? C.blue : C.textSec,
                                textDecoration: 'none', fontSize: 10, fontWeight: 600,
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill={nav.active ? 'currentColor' : 'none'}
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    {i === 0 && <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
                                    {i === 1 && <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}
                                    {i === 2 && <><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/></>}
                                    {i === 3 && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>}
                                    {i === 4 && <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
                                </svg>
                                <span>{nav.label}</span>
                            </a>
                        </Link>
                    ))}
                </div>
            </div>

            <style jsx global>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
}
