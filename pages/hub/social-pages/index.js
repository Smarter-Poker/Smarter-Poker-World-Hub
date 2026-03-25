/**
 * Social Pages Hub - Browse, discover, and manage social pages
 * Displays venue pages, group pages, community pages with follow/join
 */
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

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

function PageCard({ page, isFollowing, onFollow, onView, followBusy }) {
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

                {page.slug && (
                    <p style={{ fontSize: 11, color: C.blue, margin: '4px 0 0', fontWeight: 500 }}>
                        smarter.poker/.../{ page.slug }
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
                        disabled={followBusy}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: 8,
                            fontSize: 13, fontWeight: 600, cursor: followBusy ? 'default' : 'pointer',
                            border: 'none', fontFamily: 'inherit',
                            background: isFollowing ? '#E4E6EB' : C.blue,
                            color: isFollowing ? C.text : '#fff',
                            opacity: followBusy ? 0.7 : 1, transition: 'opacity 0.15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                    >
                        {followBusy ? (
                            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
                        ) : isFollowing ? 'Following' : 'Follow'}
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
    const { user } = useAuthUser();
    useTrainingBus('social-pages');

    // Persisted filters for tab and typeFilter
    const { filters, setFilter } = usePersistedFilters('social-pages', {
        tab: 'discover',
        typeFilter: 'all'
    });

    const tab = filters.tab;
    const typeFilter = filters.typeFilter;
    const setTab = (val) => setFilter('tab', val);
    const setTypeFilter = (val) => setFilter('typeFilter', val);

    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [followingIds, setFollowingIds] = useState(new Set());
    const [followLoading, setFollowLoading] = useState(new Set());



    // SWR-backed pages fetch — cached 60s, instant on tab/filter switch
    const swrParams = new URLSearchParams({ limit: '50' });
    if (typeFilter !== 'all') swrParams.set('page_type', typeFilter);
    if (search) swrParams.set('search', search);
    if (user?.id) swrParams.set('user_id', user.id);
    if (tab === 'following') swrParams.set('followed_only', 'true');
    if (tab === 'managed' && user?.id) swrParams.set('owner_id', user.id);
    const swrKey = user !== undefined ? `/api/social/pages?${swrParams}` : null;

    const { data: swrData, isLoading: loading, mutate: refreshPages } = useSWR(swrKey, (url) =>
        fetch(url).then(r => r.json()).then(json => {
            if (json.success) {
                const followSet = new Set();
                (json.data || []).forEach(p => { if (p.is_following) followSet.add(p.id); });
                setFollowingIds(followSet);
            }
            return json.success ? (json.data || []) : [];
        })
    );
    const pages = swrData || [];

    // Listen for dataMutated events from other pages (create, manage, detail) to auto-refresh listing
    useEffect(() => {
        const handler = (event) => {
            if (event?.payload?.entity === 'social-pages') {
                refreshPages();
            }
        };
        const unsub = eventBus.on(EventType.DATA_MUTATED, handler);
        return () => { if (typeof unsub === 'function') unsub(); };
    }, [refreshPages]);



    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const handleFollow = async (pageId) => {
        if (!user) { router.push('/auth/login'); return; }
        if (followLoading.has(pageId)) return; // Prevent double-clicks
        const isFollowing = followingIds.has(pageId);

        // Set loading state
        setFollowLoading(prev => { const next = new Set(prev); next.add(pageId); return next; });

        // Optimistic update (followingIds only — pages are SWR-managed)
        setFollowingIds(prev => {
            const next = new Set(prev);
            if (isFollowing) next.delete(pageId); else next.add(pageId);
            return next;
        });

        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/follow', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    page_id: pageId,
                    user_id: user.id,
                    action: isFollowing ? 'unfollow' : 'follow'
                }),
            });
            if (!res.ok) throw new Error('Follow failed');
            busEmit.dataMutated('social-pages');
        } catch {
            // Rollback optimistic update on failure
            setFollowingIds(prev => {
                const next = new Set(prev);
                if (isFollowing) next.add(pageId); else next.delete(pageId);
                return next;
            });
        } finally {
            setFollowLoading(prev => { const next = new Set(prev); next.delete(pageId); return next; });
        }
    };

    return (
        <>
            <SEOHead
                title="Social Pages — Community"
                description="Discover And Follow Community Pages On Smarter.Poker."
                canonical="/hub/social-pages"
            />
            <UniversalHeader />

            <div style={{
                minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg, paddingBottom: 72,
                fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" ,
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
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text" placeholder="Search Pages..."
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
                            }} />
                            <p style={{ color: C.textSec, fontSize: 14, marginTop: 12 }}>Loading Pages...</p>
                        </div>
                    ) : pages.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', background: C.card,
                            borderRadius: 12, border: `1px solid ${C.border}`,
                        }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCD0D5" strokeWidth="1.5">
                                <rect x="2" y="3" width="20" height="18" rx="2" /><line x1="2" y1="9" x2="22" y2="9" />
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
                                        followBusy={followLoading.has(page.id)}
                                        onFollow={() => handleFollow(page.id)}
                                        onView={() => router.push(`/hub/social-pages/${page.slug || page.id}`)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

              <BottomNavBar />
            </div>

            <style jsx global>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
}
