/**
 * POKER PAGES - Facebook Pages-style discovery and follow management
 * Browse venues, tours, and tournament series as followable pages.
 * Integrated with /api/poker/follow for Supabase persistence.
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const CATEGORIES = [
    { key: 'all', label: 'All Pages' },
    { key: 'venues', label: 'Venues' },
    { key: 'tours', label: 'Tours' },
    { key: 'series', label: 'Series' },
];

const SORT_OPTIONS = [
    { key: 'popular', label: 'Popular' },
    { key: 'name', label: 'A-Z' },
    { key: 'newest', label: 'Upcoming' },
];

const PAGE_TYPE_ICONS = {
    venue: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    ),
    tour: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    ),
    series: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    ),
};

const TYPE_COLORS = {
    venue: { bg: '#1877F2', light: 'rgba(24, 119, 242, 0.1)', border: 'rgba(24, 119, 242, 0.2)' },
    tour: { bg: '#E74C3C', light: 'rgba(231, 76, 60, 0.1)', border: 'rgba(231, 76, 60, 0.2)' },
    series: { bg: '#F39C12', light: 'rgba(243, 156, 18, 0.1)', border: 'rgba(243, 156, 18, 0.2)' },
};

function getAnonymousUserId() {
    try {
        let uid = localStorage.getItem('sp-anon-uid');
        if (!uid) {
            uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem('sp-anon-uid', uid);
        }
        return uid;
    } catch {
        return 'anon-fallback';
    }
}

export default function PokerPagesPage() {
    const router = useRouter();

    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('all');
    const [sort, setSort] = useState('popular');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [showFollowing, setShowFollowing] = useState(false);
    const [summary, setSummary] = useState({});
    const [followingIds, setFollowingIds] = useState(new Set());

    const userId = typeof window !== 'undefined' ? getAnonymousUserId() : '';

    const fetchPages = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                category,
                sort,
                limit: '100',
            });
            if (search) params.set('search', search);
            if (userId) params.set('user_id', userId);
            if (showFollowing) params.set('followed_only', 'true');

            const res = await fetch(`/api/poker/pages?${params}`);
            const json = await res.json();

            if (json.success) {
                setPages(json.data || []);
                setSummary(json.summary || {});
                // Track following state locally
                const followSet = new Set();
                (json.data || []).forEach(p => {
                    if (p.is_following) followSet.add(`${p.page_type}:${p.page_id}`);
                });
                setFollowingIds(followSet);
            }
        } catch (e) {
            console.error('Failed to fetch pages:', e);
        }
        setLoading(false);
    }, [category, sort, search, userId, showFollowing]);

    useEffect(() => {
        fetchPages();
    }, [fetchPages]);

    // Handle search with debounce
    useEffect(() => {
        const timeout = setTimeout(() => {
            setSearch(searchInput);
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchInput]);

    // Handle URL search param
    useEffect(() => {
        if (router.query.search) {
            setSearchInput(router.query.search);
            setSearch(router.query.search);
        }
        if (router.query.category) {
            setCategory(router.query.category);
        }
    }, [router.query]);

    const handleFollow = async (pageType, pageId) => {
        const key = `${pageType}:${pageId}`;
        const isCurrentlyFollowing = followingIds.has(key);
        const newState = !isCurrentlyFollowing;

        // Optimistic update
        setFollowingIds(prev => {
            const next = new Set(prev);
            if (newState) next.add(key);
            else next.delete(key);
            return next;
        });

        setPages(prev => prev.map(p => {
            if (p.page_type === pageType && p.page_id === pageId) {
                return {
                    ...p,
                    is_following: newState,
                    follower_count: newState
                        ? (p.follower_count || 0) + 1
                        : Math.max(0, (p.follower_count || 0) - 1),
                };
            }
            return p;
        }));

        // Update localStorage
        try {
            const storageKey = `followed-${pageType === 'venue' ? 'venues' : pageType === 'tour' ? 'tours' : 'series'}`;
            const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (newState) {
                if (!stored.includes(pageId)) stored.push(pageId);
            } else {
                const idx = stored.indexOf(pageId);
                if (idx !== -1) stored.splice(idx, 1);
            }
            localStorage.setItem(storageKey, JSON.stringify(stored));
        } catch {}

        // Call API
        try {
            await fetch('/api/poker/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_type: pageType,
                    page_id: pageId,
                    action: newState ? 'follow' : 'unfollow',
                    user_id: userId,
                }),
            });
        } catch {}
    };

    const followingCount = Array.from(followingIds).length;

    return (
        <>
            <Head>
                <title>Poker Pages | Smarter.Poker</title>
                <meta name="description" content="Discover and follow poker venues, tours, and tournament series. Stay updated with your favorite poker rooms." />
            </Head>

            <UniversalHeader />

            <div className="pages-wrapper">
                {/* Header */}
                <div className="pages-header">
                    <div className="header-content">
                        <div className="header-top">
                            <div>
                                <h1 className="page-title">Poker Pages</h1>
                                <p className="page-subtitle">Follow venues, tours, and series for updates</p>
                            </div>
                            <Link href="/hub/social-media" legacyBehavior>
                                <a className="back-to-social">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 18 9 12 15 6" />
                                    </svg>
                                    Social Media
                                </a>
                            </Link>
                        </div>

                        {/* Stats Bar */}
                        <div className="stats-bar">
                            <div className="stat-item">
                                <span className="stat-num">{summary.venues || 0}</span>
                                <span className="stat-label">Venues</span>
                            </div>
                            <div className="stat-divider" />
                            <div className="stat-item">
                                <span className="stat-num">{summary.tours || 0}</span>
                                <span className="stat-label">Tours</span>
                            </div>
                            <div className="stat-divider" />
                            <div className="stat-item">
                                <span className="stat-num">{summary.series || 0}</span>
                                <span className="stat-label">Series</span>
                            </div>
                            <div className="stat-divider" />
                            <div className="stat-item following-stat">
                                <span className="stat-num">{followingCount}</span>
                                <span className="stat-label">Following</span>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="search-bar">
                            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#65676B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search pages..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                className="search-input"
                            />
                            {searchInput && (
                                <button className="search-clear" onClick={() => { setSearchInput(''); setSearch(''); }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="toolbar">
                    <div className="toolbar-inner">
                        {/* Category Tabs */}
                        <div className="category-tabs">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.key}
                                    className={`cat-tab ${category === cat.key ? 'active' : ''}`}
                                    onClick={() => setCategory(cat.key)}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Controls */}
                        <div className="toolbar-controls">
                            <button
                                className={`following-toggle ${showFollowing ? 'active' : ''}`}
                                onClick={() => setShowFollowing(!showFollowing)}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill={showFollowing ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                </svg>
                                {showFollowing ? 'Following' : 'All'}
                            </button>

                            <div className="sort-select-wrap">
                                <select
                                    className="sort-select"
                                    value={sort}
                                    onChange={e => setSort(e.target.value)}
                                >
                                    {SORT_OPTIONS.map(s => (
                                        <option key={s.key} value={s.key}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="pages-content">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner" />
                            <p>Loading pages...</p>
                        </div>
                    ) : pages.length === 0 ? (
                        <div className="empty-state">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCD0D5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="18" rx="2" />
                                <line x1="2" y1="9" x2="22" y2="9" />
                                <circle cx="8" cy="15" r="2" />
                                <line x1="14" y1="14" x2="20" y2="14" />
                                <line x1="14" y1="17" x2="18" y2="17" />
                            </svg>
                            <h3>{showFollowing ? 'No followed pages yet' : 'No pages found'}</h3>
                            <p>{showFollowing ? 'Follow venues, tours, and series to see them here.' : 'Try a different search or category.'}</p>
                            {showFollowing && (
                                <button className="browse-btn" onClick={() => setShowFollowing(false)}>
                                    Browse All Pages
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="pages-grid">
                            {pages.map(page => {
                                const typeColor = TYPE_COLORS[page.page_type] || TYPE_COLORS.venue;
                                const isFollowing = followingIds.has(`${page.page_type}:${page.page_id}`);
                                return (
                                    <div key={`${page.page_type}-${page.page_id}`} className="page-card">
                                        {/* Card Header Banner */}
                                        <div className="card-banner" style={{ background: typeColor.bg }}>
                                            <span className="banner-type">{page.page_type === 'venue' ? 'Venue' : page.page_type === 'tour' ? 'Tour' : 'Series'}</span>
                                            {page.follower_count > 0 && (
                                                <span className="banner-followers">{page.follower_count} follower{page.follower_count !== 1 ? 's' : ''}</span>
                                            )}
                                        </div>

                                        {/* Card Body */}
                                        <div className="card-body">
                                            {/* Icon + Name */}
                                            <div className="card-identity">
                                                <div className="card-icon" style={{ background: typeColor.light, color: typeColor.bg }}>
                                                    {PAGE_TYPE_ICONS[page.page_type]}
                                                </div>
                                                <div className="card-name-group">
                                                    <h3 className="card-name" onClick={() => router.push(page.detail_url)}>
                                                        {page.name}
                                                    </h3>
                                                    <span className="card-category">{page.category}</span>
                                                </div>
                                            </div>

                                            {/* Subtitle / Location */}
                                            {page.subtitle && (
                                                <p className="card-subtitle">{page.subtitle}</p>
                                            )}

                                            {/* Extra info */}
                                            <div className="card-meta">
                                                {page.page_type === 'venue' && page.has_tournaments && (
                                                    <span className="meta-tag tournaments">Tournaments</span>
                                                )}
                                                {page.page_type === 'series' && page.total_events && (
                                                    <span className="meta-tag events">{page.total_events} Events</span>
                                                )}
                                                {page.page_type === 'series' && page.main_event_buyin && (
                                                    <span className="meta-tag buyin">${Number(page.main_event_buyin).toLocaleString()} Main</span>
                                                )}
                                                {page.page_type === 'tour' && page.established && (
                                                    <span className="meta-tag established">Est. {page.established}</span>
                                                )}
                                                {page.page_type === 'series' && page.start_date && (
                                                    <span className="meta-tag date">
                                                        {new Date(page.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="card-actions">
                                                <button
                                                    className={`follow-btn ${isFollowing ? 'following' : ''}`}
                                                    onClick={() => handleFollow(page.page_type, page.page_id)}
                                                >
                                                    {isFollowing ? (
                                                        <>
                                                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
                                                            Following
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" strokeLinecap="round"/></svg>
                                                            Follow
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    className="view-btn"
                                                    onClick={() => router.push(page.detail_url)}
                                                >
                                                    View Page
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Bottom Nav */}
                <div className="bottom-nav">
                    <Link href="/hub/social-media" legacyBehavior>
                        <a className="nav-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            <span>Home</span>
                        </a>
                    </Link>
                    <Link href="/hub/poker-near-me" legacyBehavior>
                        <a className="nav-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <span>Search</span>
                        </a>
                    </Link>
                    <span className="nav-item active">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="2" y="3" width="20" height="18" rx="2" opacity="0.2"/><rect x="2" y="3" width="20" height="7" rx="2"/><circle cx="8" cy="14" r="2"/><rect x="12" y="13" width="8" height="2" rx="1"/></svg>
                        <span>Pages</span>
                    </span>
                    <Link href="/hub/friends" legacyBehavior>
                        <a className="nav-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span>Friends</span>
                        </a>
                    </Link>
                    <Link href="/hub/notifications" legacyBehavior>
                        <a className="nav-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                            <span>Alerts</span>
                        </a>
                    </Link>
                </div>
            </div>

            <style jsx>{`
                .pages-wrapper {
                    min-height: 100vh;
                    background: #F0F2F5;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    padding-bottom: 72px;
                }

                /* Header */
                .pages-header {
                    background: #FFFFFF;
                    border-bottom: 1px solid #CCD0D5;
                    padding-top: 60px;
                }
                .header-content {
                    max-width: 960px;
                    margin: 0 auto;
                    padding: 20px 16px 16px;
                }
                .header-top {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .page-title {
                    font-size: 24px;
                    font-weight: 800;
                    color: #050505;
                    margin: 0;
                    line-height: 1.2;
                }
                .page-subtitle {
                    font-size: 14px;
                    color: #65676B;
                    margin: 4px 0 0;
                }
                .back-to-social {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    color: #1877F2;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                    white-space: nowrap;
                    flex-shrink: 0;
                }
                .back-to-social:hover {
                    text-decoration: underline;
                }

                /* Stats */
                .stats-bar {
                    display: flex;
                    align-items: center;
                    gap: 0;
                    background: #F0F2F5;
                    border-radius: 10px;
                    padding: 12px 16px;
                    margin-bottom: 12px;
                }
                .stat-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    flex: 1;
                }
                .stat-num {
                    font-size: 18px;
                    font-weight: 800;
                    color: #050505;
                }
                .stat-label {
                    font-size: 11px;
                    font-weight: 600;
                    color: #65676B;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .stat-divider {
                    width: 1px;
                    height: 28px;
                    background: #CCD0D5;
                }
                .following-stat .stat-num {
                    color: #1877F2;
                }

                /* Search */
                .search-bar {
                    position: relative;
                }
                .search-icon {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    pointer-events: none;
                }
                .search-input {
                    width: 100%;
                    padding: 10px 36px 10px 40px;
                    border: 1px solid #CCD0D5;
                    border-radius: 20px;
                    font-size: 15px;
                    font-family: inherit;
                    background: #F0F2F5;
                    color: #050505;
                    outline: none;
                    transition: border-color 0.2s, background 0.2s;
                }
                .search-input:focus {
                    border-color: #1877F2;
                    background: #FFFFFF;
                }
                .search-input::placeholder {
                    color: #8A8D91;
                }
                .search-clear {
                    position: absolute;
                    right: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #65676B;
                    padding: 4px;
                    display: flex;
                }

                /* Toolbar */
                .toolbar {
                    background: #FFFFFF;
                    border-bottom: 1px solid #CCD0D5;
                    position: sticky;
                    top: 56px;
                    z-index: 10;
                }
                .toolbar-inner {
                    max-width: 960px;
                    margin: 0 auto;
                    padding: 0 16px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }
                .category-tabs {
                    display: flex;
                    gap: 0;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .cat-tab {
                    padding: 14px 16px;
                    border: none;
                    background: none;
                    font-size: 14px;
                    font-weight: 600;
                    color: #65676B;
                    cursor: pointer;
                    white-space: nowrap;
                    border-bottom: 3px solid transparent;
                    transition: color 0.2s, border-color 0.2s;
                    font-family: inherit;
                }
                .cat-tab:hover {
                    color: #1877F2;
                    background: rgba(24, 119, 242, 0.04);
                }
                .cat-tab.active {
                    color: #1877F2;
                    border-bottom-color: #1877F2;
                }
                .toolbar-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }
                .following-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 7px 14px;
                    border-radius: 20px;
                    border: 1px solid #CCD0D5;
                    background: #F0F2F5;
                    font-size: 13px;
                    font-weight: 600;
                    color: #050505;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                }
                .following-toggle:hover {
                    background: #E4E6EB;
                }
                .following-toggle.active {
                    background: #E7F3FF;
                    border-color: #1877F2;
                    color: #1877F2;
                }
                .sort-select-wrap {
                    position: relative;
                }
                .sort-select {
                    padding: 7px 28px 7px 12px;
                    border-radius: 20px;
                    border: 1px solid #CCD0D5;
                    background: #F0F2F5;
                    font-size: 13px;
                    font-weight: 600;
                    color: #050505;
                    cursor: pointer;
                    font-family: inherit;
                    appearance: none;
                    -webkit-appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2365676B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 10px center;
                }

                /* Content */
                .pages-content {
                    max-width: 960px;
                    margin: 0 auto;
                    padding: 16px;
                }

                /* Loading */
                .loading-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 60px 20px;
                    gap: 12px;
                }
                .loading-state p {
                    color: #65676B;
                    font-size: 14px;
                }
                .spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid #E4E6EB;
                    border-top-color: #1877F2;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* Empty */
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    background: #FFFFFF;
                    border-radius: 12px;
                    border: 1px solid #CCD0D5;
                }
                .empty-state h3 {
                    font-size: 17px;
                    font-weight: 700;
                    color: #050505;
                    margin: 16px 0 4px;
                }
                .empty-state p {
                    font-size: 14px;
                    color: #65676B;
                    margin: 0;
                }
                .browse-btn {
                    margin-top: 16px;
                    padding: 10px 24px;
                    background: #1877F2;
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: inherit;
                }
                .browse-btn:hover {
                    background: #1466D8;
                }

                /* Pages Grid */
                .pages-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 12px;
                }

                /* Page Card */
                .page-card {
                    background: #FFFFFF;
                    border-radius: 12px;
                    border: 1px solid #CCD0D5;
                    overflow: hidden;
                    transition: box-shadow 0.2s;
                }
                .page-card:hover {
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
                }
                .card-banner {
                    padding: 10px 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .banner-type {
                    font-size: 11px;
                    font-weight: 700;
                    color: rgba(255, 255, 255, 0.9);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .banner-followers {
                    font-size: 11px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.8);
                }
                .card-body {
                    padding: 14px;
                }
                .card-identity {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }
                .card-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .card-name-group {
                    min-width: 0;
                }
                .card-name {
                    font-size: 15px;
                    font-weight: 700;
                    color: #050505;
                    margin: 0;
                    cursor: pointer;
                    line-height: 1.3;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .card-name:hover {
                    color: #1877F2;
                    text-decoration: underline;
                }
                .card-category {
                    font-size: 12px;
                    color: #65676B;
                    font-weight: 500;
                }
                .card-subtitle {
                    font-size: 13px;
                    color: #65676B;
                    margin: 0 0 8px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .card-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 12px;
                }
                .meta-tag {
                    display: inline-flex;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .meta-tag.tournaments {
                    background: #E7F3FF;
                    color: #1877F2;
                }
                .meta-tag.events {
                    background: #FFF4E5;
                    color: #E67E22;
                }
                .meta-tag.buyin {
                    background: #E8F5E9;
                    color: #2E7D32;
                }
                .meta-tag.established {
                    background: #F3E5F5;
                    color: #7B1FA2;
                }
                .meta-tag.date {
                    background: #E8EAF6;
                    color: #303F9F;
                }

                /* Actions */
                .card-actions {
                    display: flex;
                    gap: 8px;
                }
                .follow-btn {
                    flex: 1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                    background: #1877F2;
                    border: none;
                    color: #FFFFFF;
                }
                .follow-btn:hover {
                    background: #1466D8;
                }
                .follow-btn.following {
                    background: #E4E6EB;
                    color: #050505;
                }
                .follow-btn.following:hover {
                    background: #D8DADF;
                }
                .view-btn {
                    flex: 1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                    background: #E4E6EB;
                    border: none;
                    color: #050505;
                }
                .view-btn:hover {
                    background: #D8DADF;
                }

                /* Bottom Nav */
                .bottom-nav {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: #FFFFFF;
                    border-top: 1px solid #CCD0D5;
                    display: flex;
                    align-items: center;
                    justify-content: space-around;
                    padding: 6px 0;
                    z-index: 50;
                }
                .nav-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    padding: 4px 12px;
                    color: #65676B;
                    text-decoration: none;
                    font-size: 10px;
                    font-weight: 600;
                    transition: color 0.2s;
                    cursor: pointer;
                }
                .nav-item:hover {
                    color: #1877F2;
                }
                .nav-item.active {
                    color: #1877F2;
                }

                /* Responsive */
                @media (max-width: 640px) {
                    .pages-grid {
                        grid-template-columns: 1fr;
                    }
                    .toolbar-inner {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 8px;
                        padding: 8px 16px;
                    }
                    .toolbar-controls {
                        justify-content: space-between;
                    }
                    .page-title {
                        font-size: 20px;
                    }
                    .stats-bar {
                        padding: 10px 8px;
                    }
                    .stat-num {
                        font-size: 16px;
                    }
                    .header-top {
                        flex-direction: column;
                    }
                }
            `}</style>
        </>
    );
}
