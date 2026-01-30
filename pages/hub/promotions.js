/**
 * PROMOTIONS DISCOVERY PAGE
 * Aggregates active promotions from all venues, tours, and series.
 * Facebook light theme, Inter font, no emojis.
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const C = {
    bg: '#F0F2F5',
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
    blue: '#1877F2',
    green: '#42B72A',
};

const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'venue', label: 'Venues' },
    { key: 'tour', label: 'Tours' },
    { key: 'series', label: 'Series' },
];

const TYPE_BADGE_COLORS = {
    venue: { bg: 'rgba(24, 119, 242, 0.1)', color: '#1877F2' },
    tour: { bg: 'rgba(231, 76, 60, 0.1)', color: '#E74C3C' },
    series: { bg: 'rgba(243, 156, 18, 0.1)', color: '#F39C12' },
};

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDetailUrl(pageType, pageId) {
    if (pageType === 'venue') return `/hub/venues/${pageId}`;
    if (pageType === 'tour') return `/hub/tours/${pageId}`;
    if (pageType === 'series') return `/hub/series/${pageId}`;
    return '/hub/pages';
}

export default function PromotionsPage() {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');

    useEffect(() => {
        async function fetchPromotions() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch('/api/poker/promotions');
                if (!res.ok) throw new Error('Failed to fetch promotions');
                const json = await res.json();
                if (json.success) {
                    setPromotions(json.promotions || json.data || []);
                } else {
                    setPromotions([]);
                }
            } catch (err) {
                console.error('[Promotions] Fetch error:', err);
                setError(err.message);
                setPromotions([]);
            }
            setLoading(false);
        }
        fetchPromotions();
    }, []);

    // Debounced search
    useEffect(() => {
        const timeout = setTimeout(() => {
            setSearchQuery(searchInput);
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchInput]);

    // Filter promotions by tab and search
    const filtered = promotions.filter(p => {
        if (activeTab !== 'all' && p.page_type !== activeTab) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchContent = (p.content || '').toLowerCase().includes(q);
            const matchPage = (p.page_name || '').toLowerCase().includes(q);
            if (!matchContent && !matchPage) return false;
        }
        return true;
    });

    const tabCounts = {
        all: promotions.length,
        venue: promotions.filter(p => p.page_type === 'venue').length,
        tour: promotions.filter(p => p.page_type === 'tour').length,
        series: promotions.filter(p => p.page_type === 'series').length,
    };

    return (
        <>
            <Head>
                <title>Promotions &amp; Deals | Smarter.Poker</title>
                <meta name="description" content="Discover active promotions and deals from poker venues, tours, and series across the poker world." />
            </Head>

            <UniversalHeader />

            <div className="promos-wrapper">
                {/* Page Header */}
                <div className="promos-header">
                    <div className="header-inner">
                        <div className="header-top-row">
                            <div>
                                <h1 className="page-title">Promotions &amp; Deals</h1>
                                <p className="page-subtitle">Active promotions from venues, tours, and series</p>
                            </div>
                            <Link href="/hub/pages" legacyBehavior>
                                <a className="back-link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 18 9 12 15 6" />
                                    </svg>
                                    Pages
                                </a>
                            </Link>
                        </div>

                        {/* Search Bar */}
                        <div className="search-bar">
                            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#65676B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search promotions..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                className="search-input"
                            />
                            {searchInput && (
                                <button className="search-clear" onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="tabs-bar">
                    <div className="tabs-inner">
                        {FILTER_TABS.map(tab => (
                            <button
                                key={tab.key}
                                className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                {tab.label}
                                {tabCounts[tab.key] > 0 && (
                                    <span className="tab-count">{tabCounts[tab.key]}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="promos-content">
                    {loading ? (
                        <div className="state-box">
                            <div className="spinner" />
                            <p>Loading promotions...</p>
                        </div>
                    ) : error ? (
                        <div className="state-box">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCD0D5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <h3>Unable to load promotions</h3>
                            <p>Please try again later.</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="state-box">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCD0D5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                <line x1="2" y1="10" x2="22" y2="10" />
                                <line x1="6" y1="14" x2="10" y2="14" />
                                <line x1="14" y1="14" x2="18" y2="14" />
                            </svg>
                            <h3>No active promotions</h3>
                            <p>Follow venues to see their latest deals.</p>
                            <Link href="/hub/pages" legacyBehavior>
                                <a className="browse-btn">Browse Pages</a>
                            </Link>
                        </div>
                    ) : (
                        <div className="promos-list">
                            {filtered.map((promo, idx) => {
                                const badge = TYPE_BADGE_COLORS[promo.page_type] || TYPE_BADGE_COLORS.venue;
                                const detailUrl = getDetailUrl(promo.page_type, promo.page_id);
                                const typeLabel = promo.page_type === 'venue' ? 'Venue'
                                    : promo.page_type === 'tour' ? 'Tour'
                                    : promo.page_type === 'series' ? 'Series'
                                    : 'Page';

                                return (
                                    <div key={promo.id || idx} className="promo-card">
                                        {/* Card Header: Source info */}
                                        <div className="promo-card-header">
                                            <div className="source-info">
                                                <div className="source-icon" style={{ background: badge.bg, color: badge.color }}>
                                                    {promo.page_type === 'venue' && (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                                            <circle cx="12" cy="10" r="3" />
                                                        </svg>
                                                    )}
                                                    {promo.page_type === 'tour' && (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10" />
                                                            <line x1="2" y1="12" x2="22" y2="12" />
                                                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                                        </svg>
                                                    )}
                                                    {promo.page_type === 'series' && (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                                            <line x1="16" y1="2" x2="16" y2="6" />
                                                            <line x1="8" y1="2" x2="8" y2="6" />
                                                            <line x1="3" y1="10" x2="21" y2="10" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div className="source-text">
                                                    <Link href={detailUrl} legacyBehavior>
                                                        <a className="source-name">{promo.page_name || 'Unknown Page'}</a>
                                                    </Link>
                                                    <div className="source-meta">
                                                        <span className="type-badge" style={{ background: badge.bg, color: badge.color }}>
                                                            {typeLabel}
                                                        </span>
                                                        <span className="dot-sep">-</span>
                                                        <span className="time-ago">{timeAgo(promo.created_at)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Body: Promotion content */}
                                        <div className="promo-card-body">
                                            <p className="promo-content">{promo.content}</p>
                                        </div>

                                        {/* Card Footer: Link to source page */}
                                        <div className="promo-card-footer">
                                            <Link href={detailUrl} legacyBehavior>
                                                <a className="view-page-link">
                                                    View {typeLabel} Page
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="9 18 15 12 9 6" />
                                                    </svg>
                                                </a>
                                            </Link>
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
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                            <span>Home</span>
                        </a>
                    </Link>
                    <Link href="/hub/poker-near-me" legacyBehavior>
                        <a className="nav-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <span>Search</span>
                        </a>
                    </Link>
                    <Link href="/hub/pages" legacyBehavior>
                        <a className="nav-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="3" width="20" height="18" rx="2" />
                                <line x1="2" y1="9" x2="22" y2="9" />
                                <circle cx="8" cy="15" r="2" />
                                <line x1="14" y1="14" x2="20" y2="14" />
                            </svg>
                            <span>Pages</span>
                        </a>
                    </Link>
                    <span className="nav-item active">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <rect x="2" y="5" width="20" height="14" rx="2" opacity="0.2" />
                            <rect x="2" y="5" width="20" height="5" rx="2" />
                            <line x1="6" y1="14" x2="10" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <line x1="14" y1="14" x2="18" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span>Promos</span>
                    </span>
                    <Link href="/hub/notifications" legacyBehavior>
                        <a className="nav-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                            <span>Alerts</span>
                        </a>
                    </Link>
                </div>
            </div>

            <style jsx>{`
                .promos-wrapper {
                    min-height: 100vh;
                    background: ${C.bg};
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    padding-bottom: 72px;
                }

                /* Header */
                .promos-header {
                    background: ${C.card};
                    border-bottom: 1px solid #CCD0D5;
                    padding-top: 60px;
                }
                .header-inner {
                    max-width: 680px;
                    margin: 0 auto;
                    padding: 20px 16px 16px;
                }
                .header-top-row {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .page-title {
                    font-size: 24px;
                    font-weight: 800;
                    color: ${C.text};
                    margin: 0;
                    line-height: 1.2;
                }
                .page-subtitle {
                    font-size: 14px;
                    color: ${C.textSec};
                    margin: 4px 0 0;
                }
                .back-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    color: ${C.blue};
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                    white-space: nowrap;
                    flex-shrink: 0;
                }
                .back-link:hover {
                    text-decoration: underline;
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
                    background: ${C.bg};
                    color: ${C.text};
                    outline: none;
                    transition: border-color 0.2s, background 0.2s;
                    box-sizing: border-box;
                }
                .search-input:focus {
                    border-color: ${C.blue};
                    background: ${C.card};
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
                    color: ${C.textSec};
                    padding: 4px;
                    display: flex;
                }

                /* Tabs */
                .tabs-bar {
                    background: ${C.card};
                    border-bottom: 1px solid #CCD0D5;
                    position: sticky;
                    top: 56px;
                    z-index: 10;
                }
                .tabs-inner {
                    max-width: 680px;
                    margin: 0 auto;
                    padding: 0 16px;
                    display: flex;
                    gap: 0;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .tab-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 14px 16px;
                    border: none;
                    background: none;
                    font-size: 14px;
                    font-weight: 600;
                    color: ${C.textSec};
                    cursor: pointer;
                    white-space: nowrap;
                    border-bottom: 3px solid transparent;
                    transition: color 0.2s, border-color 0.2s;
                    font-family: inherit;
                }
                .tab-btn:hover {
                    color: ${C.blue};
                    background: rgba(24, 119, 242, 0.04);
                }
                .tab-btn.active {
                    color: ${C.blue};
                    border-bottom-color: ${C.blue};
                }
                .tab-count {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 20px;
                    height: 20px;
                    padding: 0 6px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 700;
                    background: #E4E6EB;
                    color: ${C.textSec};
                }
                .tab-btn.active .tab-count {
                    background: rgba(24, 119, 242, 0.12);
                    color: ${C.blue};
                }

                /* Content */
                .promos-content {
                    max-width: 680px;
                    margin: 0 auto;
                    padding: 16px;
                }

                /* State boxes (loading, error, empty) */
                .state-box {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    padding: 60px 20px;
                    background: ${C.card};
                    border-radius: 12px;
                    border: 1px solid #CCD0D5;
                }
                .state-box h3 {
                    font-size: 17px;
                    font-weight: 700;
                    color: ${C.text};
                    margin: 16px 0 4px;
                }
                .state-box p {
                    font-size: 14px;
                    color: ${C.textSec};
                    margin: 0;
                }
                .browse-btn {
                    display: inline-block;
                    margin-top: 16px;
                    padding: 10px 24px;
                    background: ${C.blue};
                    border: none;
                    border-radius: 8px;
                    color: #FFFFFF;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: inherit;
                    text-decoration: none;
                }
                .browse-btn:hover {
                    background: #1466D8;
                }

                /* Spinner */
                .spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid #E4E6EB;
                    border-top-color: ${C.blue};
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* Promo List */
                .promos-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                /* Promo Card */
                .promo-card {
                    background: ${C.card};
                    border-radius: 12px;
                    border: 1px solid #CCD0D5;
                    overflow: hidden;
                    transition: box-shadow 0.2s;
                }
                .promo-card:hover {
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
                }

                .promo-card-header {
                    padding: 14px 16px 0;
                }
                .source-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .source-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .source-text {
                    min-width: 0;
                    flex: 1;
                }
                .source-name {
                    font-size: 15px;
                    font-weight: 700;
                    color: ${C.text};
                    text-decoration: none;
                    display: block;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .source-name:hover {
                    color: ${C.blue};
                    text-decoration: underline;
                }
                .source-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 2px;
                }
                .type-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .dot-sep {
                    color: ${C.textSec};
                    font-size: 12px;
                }
                .time-ago {
                    font-size: 12px;
                    color: ${C.textSec};
                    font-weight: 500;
                }

                .promo-card-body {
                    padding: 12px 16px;
                }
                .promo-content {
                    font-size: 15px;
                    color: ${C.text};
                    line-height: 1.5;
                    margin: 0;
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .promo-card-footer {
                    padding: 0 16px 14px;
                    display: flex;
                    align-items: center;
                }
                .view-page-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 13px;
                    font-weight: 600;
                    color: ${C.blue};
                    text-decoration: none;
                    padding: 6px 12px;
                    border-radius: 6px;
                    transition: background 0.15s;
                }
                .view-page-link:hover {
                    background: rgba(24, 119, 242, 0.08);
                    text-decoration: none;
                }

                /* Bottom Nav */
                .bottom-nav {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: ${C.card};
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
                    color: ${C.textSec};
                    text-decoration: none;
                    font-size: 10px;
                    font-weight: 600;
                    transition: color 0.2s;
                    cursor: pointer;
                }
                .nav-item:hover {
                    color: ${C.blue};
                }
                .nav-item.active {
                    color: ${C.blue};
                }

                /* Responsive */
                @media (max-width: 640px) {
                    .page-title {
                        font-size: 20px;
                    }
                    .header-top-row {
                        flex-direction: column;
                    }
                    .tabs-inner {
                        padding: 0 12px;
                    }
                    .tab-btn {
                        padding: 12px 12px;
                        font-size: 13px;
                    }
                    .promos-content {
                        padding: 12px;
                    }
                    .promo-card-header {
                        padding: 12px 14px 0;
                    }
                    .promo-card-body {
                        padding: 10px 14px;
                    }
                    .promo-card-footer {
                        padding: 0 14px 12px;
                    }
                }
            `}</style>
        </>
    );
}
