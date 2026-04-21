/**
 * Social Pages Hub - Browse, discover, and manage social pages
 * Displays venue pages, group pages, community pages with follow/join
 */
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';

import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { SOCIAL_COLORS, timeAgo } from '../../../src/lib/socialHelpers';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

const C = SOCIAL_COLORS;

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

// #2: Category filter chips
const CATEGORIES = [
    { key: 'all', label: 'All Categories' },
    { key: 'poker room', label: 'Poker Rooms' },
    { key: 'home game', label: 'Home Games' },
    { key: 'study group', label: 'Study Groups' },
    { key: 'tournament circuit', label: 'Tournaments' },
    { key: 'coaching', label: 'Coaching' },
    { key: 'entertainment', label: 'Entertainment' },
    { key: 'strategy', label: 'Strategy' },
];



function PageCard({ page, isFollowing, onFollow, onView, followBusy }) {
    const typeLabel = { venue: 'Venue', group: 'Group', community: 'Community', brand: 'Brand' };
    const typeColor = { venue: C.blue, group: C.green, community: '#8b5cf6', brand: C.orange };
    // #3: Featured detection
    const isFeatured = page.metadata?.featured || page.is_verified;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: C.card, borderRadius: 12,
                border: isFeatured ? '2px solid #F5A623' : `1px solid ${C.border}`,
                overflow: 'hidden', cursor: 'pointer',
                boxShadow: isFeatured ? '0 4px 16px rgba(245,166,35,0.15)' : 'none',
                position: 'relative',
            }}
            onClick={onView}
        >
            {/* #3: Featured badge */}
            {isFeatured && (
                <div style={{
                    position: 'absolute', top: 0, right: 0, zIndex: 5,
                    background: 'linear-gradient(135deg, #F5A623, #FF8C00)', color: '#fff',
                    padding: '4px 10px 4px 14px', fontSize: 10, fontWeight: 800,
                    borderBottomLeftRadius: 10, letterSpacing: 0.5,
                    display: 'flex', alignItems: 'center', gap: 3,
                }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    FEATURED
                </div>
            )}
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
                        position: 'absolute', top: 8, right: isFeatured ? 'auto' : 8, left: isFeatured ? 8 : 'auto', top: isFeatured ? 'auto' : 8, bottom: isFeatured ? 8 : 'auto',
                        padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
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

    // #1: Trending pages state
    const [trendingPages, setTrendingPages] = useState([]);
    // #2: Category filter
    const [categoryFilter, setCategoryFilter] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('sp_cat_filter') || 'all';
        return 'all';
    });
    // #4: Suggested pages
    const [suggestedPages, setSuggestedPages] = useState([]);

    // #2: Infinite scroll state
    const PAGE_SIZE = 20;
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const sentinelRef = useRef(null);
    const fetchIdRef = useRef(0); // Prevent stale fetches

    // Build query params (without offset — that's handled per-fetch)
    const buildParams = useCallback((off = 0) => {
        const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
        if (typeFilter !== 'all') p.set('page_type', typeFilter);
        if (search) p.set('search', search);
        if (user?.id) p.set('user_id', user.id);
        if (tab === 'following') p.set('followed_only', 'true');
        if (tab === 'managed' && user?.id) p.set('owner_id', user.id);
        return p;
    }, [typeFilter, search, user, tab]);

    // Fetch a batch of pages
    const fetchBatch = useCallback(async (off, append = false) => {
        if (user === undefined) return; // auth not resolved yet
        const id = ++fetchIdRef.current;
        if (!append) setLoading(true);
        else setLoadingMore(true);
        try {
            const params = buildParams(off);
            const res = await fetch(`/api/social/pages?${params}`);
            const json = await res.json();
            if (id !== fetchIdRef.current) return; // stale
            if (json.success) {
                const batch = json.data || [];
                const followSet = new Set();
                batch.forEach(p => { if (p.is_following) followSet.add(p.id); });
                if (append) {
                    setPages(prev => [...prev, ...batch]);
                    setFollowingIds(prev => { const n = new Set(prev); batch.forEach(p => { if (p.is_following) n.add(p.id); }); return n; });
                } else {
                    setPages(batch);
                    setFollowingIds(followSet);
                }
                setHasMore(batch.length >= PAGE_SIZE);
                setOffset(off + batch.length);
            }
        } catch (e) { console.warn('[App] Handled exception:', e); }
        if (!append) setLoading(false);
        else setLoadingMore(false);
    }, [user, buildParams]);

    // Initial fetch + refetch when filters/tab/search change
    useEffect(() => {
        setOffset(0);
        setHasMore(true);
        setPages([]);
        fetchBatch(0, false);
    }, [fetchBatch]);

    const refreshPages = useCallback(() => {
        setOffset(0);
        setHasMore(true);
        setPages([]);
        fetchBatch(0, false);
    }, [fetchBatch]);

    // #2: IntersectionObserver for infinite scroll
    useEffect(() => {
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
                    fetchBatch(offset, true);
                }
            },
            { rootMargin: '300px' }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore, offset, fetchBatch]);

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

    // #1: Fetch trending pages (top by follower count, separate from main listing)
    useEffect(() => {
        if (tab !== 'discover' || search) return;
        const fetchTrending = async () => {
            try {
                const p = new URLSearchParams({ limit: '8', sort: 'popular' });
                if (user?.id) p.set('user_id', user.id);
                const res = await fetch(`/api/social/pages?${p}`);
                const json = await res.json();
                if (json.success) setTrendingPages((json.data || []).filter(pg => (pg.follower_count || 0) > 0).slice(0, 8));
            } catch (e) { console.warn('[App] Handled exception:', e); }
        };
        fetchTrending();
    }, [tab, user, search]);

    // #4: Fetch suggested pages (different category/type from followed)
    useEffect(() => {
        if (!user || tab !== 'discover' || search) { setSuggestedPages([]); return; }
        const fetchSuggested = async () => {
            try {
                const p = new URLSearchParams({ limit: '6' });
                p.set('user_id', user.id);
                const res = await fetch(`/api/social/pages?${p}`);
                const json = await res.json();
                if (json.success) {
                    const notFollowed = (json.data || []).filter(pg => !followingIds.has(pg.id));
                    setSuggestedPages(notFollowed.slice(0, 4));
                }
            } catch (e) { console.warn('[App] Handled exception:', e); }
        };
        fetchSuggested();
    }, [user, tab, search, followingIds]);

    // #2: Persist category filter
    useEffect(() => {
        if (typeof window !== 'undefined') localStorage.setItem('sp_cat_filter', categoryFilter);
    }, [categoryFilter]);

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
                                    aria-label="Create a new social page"
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
                                aria-label="Search social pages"
                                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 42px 10px 40px', borderRadius: 20,
                                    border: `1px solid ${C.border}`, fontSize: 15, fontFamily: 'inherit',
                                    background: C.bg, color: C.text, outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                            {loading && searchInput && (
                                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', border: `2px solid #E4E6EB`, borderTopColor: C.blue, animation: 'spin 0.6s linear infinite' }} />
                            )}
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 0 }}>
                            {TABS.map(t => (
                                <button key={t.key} onClick={() => setTab(t.key)} aria-label={`Show ${t.label}`} style={{
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
                        display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                    }}>
                        {TYPE_FILTERS.map(f => (
                            <button key={f.key} onClick={() => setTypeFilter(f.key)} aria-label={`Filter by ${f.label}`} style={{
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
                    {/* #2: Category Filter Chips */}
                    <div style={{
                        maxWidth: 960, margin: '0 auto', padding: '4px 16px 8px',
                        display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                    }}>
                        {CATEGORIES.map(cat => (
                            <button key={cat.key} onClick={() => setCategoryFilter(cat.key)} aria-label={`Category: ${cat.label}`} style={{
                                padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                border: categoryFilter === cat.key ? 'none' : `1px solid ${C.border}`,
                                background: categoryFilter === cat.key ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'transparent',
                                color: categoryFilter === cat.key ? '#fff' : C.textSec,
                                transition: 'all 0.2s',
                            }}>
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>

                    {/* #1: Trending Pages Banner */}
                    {tab === 'discover' && !search && trendingPages.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2">
                                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                </svg>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Trending Now</h3>
                            </div>
                            <div style={{
                                display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
                                WebkitOverflowScrolling: 'touch',
                            }}>
                                {trendingPages.map((tp, idx) => {
                                    const tColor = { venue: C.blue, group: C.green, community: '#8b5cf6', brand: C.orange };
                                    return (
                                        <div key={tp.id} onClick={() => router.push(`/hub/social-pages/${tp.slug || tp.id}`)} style={{
                                            flexShrink: 0, width: 180, background: C.card, borderRadius: 12,
                                            border: `1px solid ${C.border}`, overflow: 'hidden', cursor: 'pointer',
                                            transition: 'transform 0.15s', position: 'relative',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                        >
                                            <div style={{
                                                height: 60, background: tp.cover_url
                                                    ? `url(${tp.cover_url}) center/cover`
                                                    : `linear-gradient(135deg, ${tColor[tp.page_type] || C.blue}, #8b5cf6)`,
                                            }} />
                                            {/* Rank badge */}
                                            <div style={{
                                                position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: '50%',
                                                background: idx < 3 ? '#F5A623' : 'rgba(0,0,0,0.5)', color: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 11, fontWeight: 800,
                                            }}>{idx + 1}</div>
                                            <div style={{ padding: '8px 10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                                                        background: tp.avatar_url ? `url(${tp.avatar_url}) center/cover` : tColor[tp.page_type] || C.blue,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', fontWeight: 700, fontSize: 12,
                                                    }}>{!tp.avatar_url && (tp.name || '?')[0].toUpperCase()}</div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tp.name}</div>
                                                        <div style={{ fontSize: 11, color: C.textSec }}>{tp.follower_count || 0} followers</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                                    <div style={{ height: 100, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '300px 100%' }} />
                                    <div style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                            <div style={{ width: 48, height: 48, borderRadius: 10, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ width: '60%', height: 14, borderRadius: 4, background: '#E4E6EB', marginBottom: 6, animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                                <div style={{ width: '40%', height: 10, borderRadius: 4, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <div style={{ flex: 1, height: 36, borderRadius: 8, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                            <div style={{ flex: 1, height: 36, borderRadius: 8, background: '#E4E6EB', animation: 'shimmerAnim 1.5s infinite linear', backgroundImage: 'linear-gradient(90deg, #E4E6EB 0px, #F0F2F5 40px, #E4E6EB 80px)', backgroundSize: '200px 100%' }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
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
                                {tab === 'following' ? 'No followed pages yet' : tab === 'managed' ? 'No pages created yet' : search ? `No results for "${search}"` : 'No pages found'}
                            </h3>
                            <p style={{ fontSize: 14, color: C.textSec, margin: 0 }}>
                                {tab === 'managed' ? 'Create your first page to get started.' : search ? 'Try a different search term or clear your filters.' : 'Try a different search or filter.'}
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
                                {pages
                                    .filter(pg => categoryFilter === 'all' || (pg.category || '').toLowerCase() === categoryFilter)
                                    .map(page => (
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

                    {/* #2: Infinite Scroll Sentinel */}
                    {!loading && hasMore && (
                        <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                            {loadingMore && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textSec, fontSize: 13 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid #E4E6EB`, borderTopColor: C.blue, animation: 'spin 0.6s linear infinite' }} />
                                    Loading more...
                                </div>
                            )}
                        </div>
                    )}

                    {/* #4: Pages You May Like — Suggestion Rail */}
                    {tab === 'discover' && !search && !loading && suggestedPages.length > 0 && (
                        <div style={{
                            marginTop: 24, background: C.card, borderRadius: 12,
                            border: `1px solid ${C.border}`, padding: 16,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2">
                                    <circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0114 0v2" />
                                    <line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" />
                                </svg>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Pages You May Like</h3>
                            </div>
                            <div style={{
                                display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4,
                                WebkitOverflowScrolling: 'touch',
                            }}>
                                {suggestedPages.map(sp => {
                                    const spColor = { venue: C.blue, group: C.green, community: '#8b5cf6', brand: C.orange };
                                    return (
                                        <div key={sp.id} style={{
                                            flexShrink: 0, width: 200, background: C.bg, borderRadius: 10,
                                            border: `1px solid ${C.border}`, overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                height: 50, background: sp.cover_url
                                                    ? `url(${sp.cover_url}) center/cover`
                                                    : `linear-gradient(135deg, ${spColor[sp.page_type] || C.blue}, #8b5cf6)`,
                                            }} />
                                            <div style={{ padding: '8px 10px' }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</div>
                                                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8 }}>{sp.follower_count || 0} followers</div>
                                                <button onClick={(e) => { e.stopPropagation(); handleFollow(sp.id); }} style={{
                                                    width: '100%', padding: '6px 0', borderRadius: 6, border: 'none',
                                                    background: followingIds.has(sp.id) ? '#E4E6EB' : C.blue,
                                                    color: followingIds.has(sp.id) ? C.text : '#fff',
                                                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}>{followingIds.has(sp.id) ? 'Following' : 'Follow'}</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

              <BottomNavBar />
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes shimmerAnim { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
            `}
            </style>
        </>
    );
}
