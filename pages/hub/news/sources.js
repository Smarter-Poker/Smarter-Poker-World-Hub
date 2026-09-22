/**
 * News - Sources
 *
 * Lists the canonical aggregated news sources (served by /api/news/source-boxes)
 * and lets the user enable/disable each one. Preferences persist to the
 * `mutedSources` key of news_preferences for signed-in users and to
 * localStorage ('news_muted_sources') for guests.
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useCallback, useEffect, useState } from 'react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import { getNewsPreferences, updateNewsPreferences } from '../../../src/services/newsPreferences';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { swrFallback, catalogueCacheHeaders } from '../../../src/lib/seo/swrFallback.mjs';
import { originFrom } from '../../../src/lib/poker-near-me/seriesSeo.mjs';

const MUTED_SOURCES_KEY = 'news_muted_sources';

function readLocalMuted() {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(MUTED_SOURCES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        console.warn('[sources.js] Failed to read muted sources:', e?.message || e);
        return [];
    }
}

function writeLocalMuted(arr) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(MUTED_SOURCES_KEY, JSON.stringify(arr));
    } catch (e) {
        console.warn('[sources.js] Failed to persist muted sources:', e?.message || e);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    // UTC so the server-rendered date and the hydrated one always agree.
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const SOURCE_BOXES_PATH = '/api/news/source-boxes';

// One shape for the server and the browser: the outlet's name and its latest
// public headline. Nothing else from the API row reaches the page.
function toSources(json) {
    const boxes = Array.isArray(json?.data) ? json.data : [];
    return boxes.map((box) => ({
        id: box._boxNumber ?? box.id,
        name: box._sourceName || box.source_name || 'Unknown Source',
        latestTitle: box._isEmpty || box._isError ? null : box.title || null,
        latestAt: box._isEmpty || box._isError ? null : box.published_at || null,
    }));
}

// A FEED PAGE SHOWS ITS FEED (2026-09-22). A Googlebot crawl measured this
// page at about 120 words: the outlet list was fetched in the browser, so the
// server sent a skeleton. The first list now arrives in the HTML; the browser
// still refreshes it and owns the per-reader enable/disable toggles.
export async function getServerSideProps({ req, res }) {
    catalogueCacheHeaders(res);
    const fallback = await swrFallback(originFrom(req), SOURCE_BOXES_PATH);
    return { props: { initialSources: toSources(fallback[SOURCE_BOXES_PATH]) } };
}

export default function NewsSources({ initialSources = [] }) {
    const [sources, setSources] = useState(initialSources);
    const [loading, setLoading] = useState(initialSources.length === 0);
    const [error, setError] = useState(null);
    const [muted, setMuted] = useState(() => new Set());
    const [userId, setUserId] = useState(null);

    // Resolve signed-in user (SSR-safe: runs client-side only)
    useEffect(() => {
        try {
            const user = getAuthUser();
            if (user?.id) setUserId(user.id);
        } catch (e) {
            console.warn('[sources.js]', e?.message || e);
        }
    }, []);

    // Fetch the real aggregated sources
    // `background` refreshes a server-rendered list without swapping it for
    // the skeleton, and keeps it on screen if the refresh fails.
    const fetchSources = useCallback(async ({ background = false } = {}) => {
        if (!background) setLoading(true);
        if (!background) setError(null);
        try {
            const res = await fetch(SOURCE_BOXES_PATH);
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            setSources(toSources(json));
        } catch (e) {
            if (!background) setError(e?.message || 'Failed to load sources');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSources({ background: initialSources.length > 0 });
        // Mount only: the server list is the starting point, not a dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchSources]);

    // Load persisted muted-source preferences (account first, local fallback)
    useEffect(() => {
        let cancelled = false;
        const loadLocal = () => {
            if (!cancelled) setMuted(new Set(readLocalMuted()));
        };
        if (userId) {
            getNewsPreferences(userId)
                .then((prefs) => {
                    if (cancelled) return;
                    if (Array.isArray(prefs?.mutedSources)) {
                        setMuted(new Set(prefs.mutedSources));
                    } else {
                        loadLocal();
                    }
                })
                .catch(loadLocal);
        } else {
            loadLocal();
        }
        return () => {
            cancelled = true;
        };
    }, [userId]);

    const toggleSource = async (name) => {
        const previous = new Set(muted);
        const next = new Set(muted);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        setMuted(next);
        const arr = [...next];
        writeLocalMuted(arr);
        if (userId) {
            try {
                await updateNewsPreferences(userId, { mutedSources: arr });
            } catch (e) {
                console.warn('[sources.js] Failed to save source preference:', e?.message || e);
                setMuted(previous);
                writeLocalMuted([...previous]);
                setError('Your source preference could not be saved. Please try again.');
            }
        }
    };

    return (
        <>
            <SEOHead
                title="News Sources - Poker Media Outlets"
                description="Every Outlet The Smarter.Poker News Feed Reads, How Often It Checks Each One And When It Last Succeeded. Nothing Is Republished In Full: A Story Is A Headline, A Summary And A Link Back. Free To Read."
                canonical="/hub/news/sources"
            />

            <PageTransition disableInitialAnimation>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#000407' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>

                        <h1 style={{ fontFamily: 'Arial Narrow, Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '-0.02em', fontSize: 'clamp(36px, 8vw, 58px)', fontWeight: 'bold', color: '#e4edf1', marginBottom: '12px' }}>
                            News Sources
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Manage Which News Sources Appear In Your Feed
                        </p>

                        {loading && (
                            <div style={{ display: 'grid', gap: '16px' }} aria-hidden="true">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="src-skel"
                                        style={{
                                            height: '84px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            animationDelay: `${i * 0.08}s`
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {!loading && error && (
                            <div
                                role="alert"
                                style={{
                                    background: 'rgba(239,68,68,0.06)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}>
                                    Could Not Load News Sources
                                </div>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px' }}>{error}</div>
                                <button
                                    type="button"
                                    onClick={() => fetchSources()}
                                    style={{
                                        background: 'rgba(0,212,255,0.12)',
                                        border: '1px solid rgba(0,212,255,0.4)',
                                        color: '#00d4ff',
                                        borderRadius: '8px',
                                        padding: '10px 24px',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {!loading && !error && sources.length === 0 && (
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '32px',
                                    textAlign: 'center',
                                    color: '#9ca3af'
                                }}
                            >
                                No News Sources Available Right Now. Check Back Soon.
                            </div>
                        )}

                        {!loading && !error && sources.length > 0 && (
                            <div style={{ display: 'grid', gap: '16px' }}>
                                {sources.map((source) => {
                                    const enabled = !muted.has(source.name);
                                    const latestDate = formatDate(source.latestAt);
                                    return (
                                        <div
                                            key={source.id}
                                            style={{
                                                background: '#061018',
                                                border: '1px solid #345468',
                                                borderRadius: '4px',
                                                padding: '20px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '16px',
                                                opacity: enabled ? 1 : 0.6,
                                                transition: 'opacity 0.2s'
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                                    {source.name}
                                                </div>
                                                {source.latestTitle ? (
                                                    <div
                                                        style={{
                                                            color: '#9ca3af',
                                                            fontSize: '14px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Latest: {source.latestTitle}
                                                        {latestDate ? ` - ${latestDate}` : ''}
                                                    </div>
                                                ) : (
                                                    <div style={{ color: '#6b7280', fontSize: '14px' }}>
                                                        Awaiting New Articles
                                                    </div>
                                                )}
                                            </div>

                                            <label style={{ minHeight: 44, padding: '4px 0', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flexShrink: 0 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={() => toggleSource(source.name)}
                                                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${source.name} in your feed`}
                                                    style={{ width: '24px', height: '24px', cursor: 'pointer', accentColor: '#31c2ff' }}
                                                />
                                                <span style={{ color: enabled ? '#10b981' : '#9ca3af', minWidth: '64px' }}>
                                                    {enabled ? 'Enabled' : 'Disabled'}
                                                </span>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!loading && !error && sources.length > 0 && (
                            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '24px' }}>
                                {userId
                                    ? 'Your source preferences are saved to your account.'
                                    : 'Sign in to sync source preferences across devices. For now they are saved on this device.'}
                            </p>
                        )}
                    </div>

                    <style jsx>{`
                        @keyframes src-shimmer {
                            0% {
                                background-position: -800px 0;
                            }
                            100% {
                                background-position: 800px 0;
                            }
                        }
                        .src-skel {
                            background-image: linear-gradient(
                                90deg,
                                rgba(255, 255, 255, 0.04) 0%,
                                rgba(255, 255, 255, 0.1) 50%,
                                rgba(255, 255, 255, 0.04) 100%
                            );
                            background-size: 800px 100%;
                            animation: src-shimmer 1.4s ease-in-out infinite;
                        }
                    `}</style>
                </div>
            </PageTransition>
          {/* Server rendered: measured on production this page returned
              almost nothing to a crawler (AEO phase 3, 2026-09-17). */}
          <HubPageSummary page="news-sources" />
        </>
    );
}
