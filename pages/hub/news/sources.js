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
import BankrollImageHeader from '../../../src/components/bankroll/BankrollImageHeader';

// The image header prints the page's single h1 through this component.
const PageTitle = (props) => <h1 {...props} />;
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
                <div className="smarterdesign news-sources-page" style={{ minHeight: '100vh', paddingBottom: 90, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#040d18' }}>
                    <UniversalHeader pageDepth={2} />

                    <div className="news-sources-body">
                        {/* #SMARTERDESIGN image header (Dan, 2026-11-27): the same
                            News seal and press scene as /hub/news, the page name in
                            live white lettering and the painted chrome "?" holding
                            the explanation. Back To News sits ABOVE the frame. */}
                        <BankrollImageHeader
                            art="news"
                            section="news-sources"
                            title="News Sources"
                            parent="Poker News"
                            heading={PageTitle}
                            back={{ href: '/hub/news', label: 'Back To News' }}
                            className="news-sources-header"
                            helpContent={(
                                <>
                                    <p>Choose Which Outlets Appear In Your Poker News Feed. Turn A Source Off To Hide Its Stories; Turn It Back On At Any Time.</p>
                                    <p>Each Row Shows The Latest Headline The Feed Read From That Outlet. Stories Are A Headline, A Summary And A Link Back To The Original.</p>
                                    <p>Signed In, Your Choices Save To Your Account. Otherwise They Are Saved On This Device.</p>
                                </>
                            )}
                        />

                        {loading && (
                            <div className="news-sources-list" aria-hidden="true">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div key={i} className="news-source-row src-skel" style={{ height: '84px', animationDelay: `${i * 0.08}s` }} />
                                ))}
                            </div>
                        )}

                        {!loading && error && (
                            <div role="alert" className="sd-panel news-sources-state">
                                <div className="news-sources-state-title">Could Not Load News Sources</div>
                                <div className="news-sources-state-copy">{error}</div>
                                <button type="button" className="sd-button sd-primary" onClick={() => fetchSources()}>
                                    Try Again
                                </button>
                            </div>
                        )}

                        {!loading && !error && sources.length === 0 && (
                            <div className="sd-panel news-sources-state">
                                <div className="news-sources-state-copy">No News Sources Available Right Now. Check Back Soon.</div>
                            </div>
                        )}

                        {!loading && !error && sources.length > 0 && (
                            <div className="news-sources-list">
                                {sources.map((source) => {
                                    const enabled = !muted.has(source.name);
                                    const latestDate = formatDate(source.latestAt);
                                    return (
                                        <div key={source.id} className={`news-source-row ${enabled ? '' : 'is-off'}`}>
                                            <div style={{ minWidth: 0 }}>
                                                <div className="news-source-name">{source.name}</div>
                                                {source.latestTitle ? (
                                                    <div className="news-source-latest">
                                                        Latest: {source.latestTitle}
                                                        {latestDate ? ` - ${latestDate}` : ''}
                                                    </div>
                                                ) : (
                                                    <div className="news-source-latest">Awaiting New Articles</div>
                                                )}
                                            </div>

                                            <label className={`sd-button news-source-toggle ${enabled ? 'active' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={() => toggleSource(source.name)}
                                                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${source.name} in your feed`}
                                                />
                                                <span>{enabled ? 'Enabled' : 'Disabled'}</span>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!loading && !error && sources.length > 0 && (
                            <p className="news-sources-note">
                                {userId
                                    ? 'Your Source Preferences Are Saved To Your Account.'
                                    : 'Sign In To Sync Source Preferences Across Devices. For Now They Are Saved On This Device.'}
                            </p>
                        )}
                    </div>

                    <style jsx>{`
                        .news-sources-body {
                            box-sizing: border-box;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 84px 12px 40px;
                        }
                        .news-sources-body :global(.news-sources-header) {
                            margin-bottom: 14px;
                        }
                        .news-sources-list {
                            display: grid;
                            gap: 8px;
                        }
                        .news-source-row {
                            box-sizing: border-box;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            gap: 14px;
                            padding: 12px 12px 12px 16px;
                            border: 3px solid transparent;
                            border-image: url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch;
                            background: linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%);
                            transition: opacity 0.2s;
                        }
                        .news-source-row.is-off {
                            opacity: 0.66;
                        }
                        .news-source-name {
                            margin-bottom: 3px;
                            color: #f2f7ff;
                            font: 700 1.15rem/1.15 var(--sd-type);
                        }
                        .news-source-latest {
                            overflow: hidden;
                            color: #bdd0e2;
                            font-size: 14px;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }
                        .news-source-toggle {
                            position: relative;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            flex-shrink: 0;
                            min-width: 112px;
                            min-height: 44px;
                        }
                        .news-source-toggle input {
                            position: absolute;
                            inset: 0;
                            width: 100%;
                            height: 100%;
                            margin: 0;
                            opacity: 0;
                            cursor: pointer;
                        }
                        .news-source-toggle:focus-within {
                            outline: 2px solid #9ee3ff;
                            outline-offset: 2px;
                        }
                        .news-sources-state {
                            display: grid;
                            justify-items: center;
                            gap: 10px;
                            padding: 22px;
                            text-align: center;
                        }
                        .news-sources-state-title {
                            color: #ff8a93;
                            font: 700 1.15rem/1.2 var(--sd-type);
                        }
                        .news-sources-state-copy {
                            color: #bdd0e2;
                            font-size: 14px;
                        }
                        .news-sources-note {
                            margin-top: 18px;
                            color: #bdd0e2;
                            font-size: 13px;
                            text-align: center;
                        }
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
                                rgba(134, 218, 255, 0.04) 0%,
                                rgba(134, 218, 255, 0.1) 50%,
                                rgba(134, 218, 255, 0.04) 100%
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
