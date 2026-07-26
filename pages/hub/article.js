/**
 * Single Article Page
 */
import SEOHead from '../../src/components/seo/SEOHead';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { Clock, Eye, Calendar, Share2, Bookmark, User } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import toast from '../../src/stores/toastStore';
import { addNewsBookmark, removeNewsBookmark, isArticleBookmarked } from '../../src/services/newsBookmarks';
import {
    addToReadLater,
    removeFromReadLater,
    isInReadLater,
    getLocalReadLaterMeta,
    saveLocalReadLaterMeta,
    toLocalReadLaterRow
} from '../../src/services/newsReadLater';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

// Guest bookmarks share the same localStorage key as /hub/news so the two
// surfaces stay in sync (news.js loads this key on mount).
const GUEST_BOOKMARKS_KEY = 'news_bookmarks';

function readGuestBookmarks() {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(GUEST_BOOKMARKS_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        console.warn('[article.js] Failed to read guest bookmarks:', e?.message || e);
        return [];
    }
}

function writeGuestBookmarks(list) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(GUEST_BOOKMARKS_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('[article.js] Failed to persist guest bookmarks:', e?.message || e);
    }
}

// Guest "read later" queue. Mirrors the guest-bookmark fallback above and uses
// the same key/shape (a JSON array of article ids) that newsReadLater's signed-in
// path stores in `news_read_later`, so /hub/news?filter=later can read either.
const GUEST_READ_LATER_KEY = 'news_read_later';

function readGuestReadLater() {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(GUEST_READ_LATER_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        console.warn('[article.js] Failed to read guest read-later queue:', e?.message || e);
        return [];
    }
}

function writeGuestReadLater(list) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(GUEST_READ_LATER_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('[article.js] Failed to persist guest read-later queue:', e?.message || e);
    }
}

// Absolute origin used for canonical/JSON-LD URLs (schema.org wants absolute
// URLs). Matches the fallback already used by handleShare below.
const SITE_ORIGIN = 'https://smarter.poker';

/**
 * Build the schema.org NewsArticle payload for the current row.
 *
 * Only fields that actually exist on the article are emitted — no placeholder
 * authors, dates or images. Returns null when there is nothing real to describe.
 */
function buildNewsArticleJsonLd(article) {
    if (!article?.id || !article?.title) return null;

    const url = `${SITE_ORIGIN}/hub/article?id=${encodeURIComponent(article.id)}`;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: String(article.title),
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url }
    };

    const description = (article.content || '').replace(/\s+/g, ' ').trim();
    if (description) jsonLd.description = description.slice(0, 300);
    if (article.image_url) jsonLd.image = [article.image_url];
    if (article.published_at) jsonLd.datePublished = article.published_at;
    if (article.updated_at) jsonLd.dateModified = article.updated_at;
    if (article.category) jsonLd.articleSection = String(article.category);
    if (article.source_name) {
        jsonLd.author = { '@type': 'Organization', name: String(article.source_name) };
    }
    // The publisher is this site — a fact about where the page is served, not
    // article metadata, so it is always safe to state.
    jsonLd.publisher = { '@type': 'Organization', name: 'Smarter.Poker', url: SITE_ORIGIN };

    return jsonLd;
}

// Escape '<' so the serialized JSON can never terminate the <script> block it
// lives in (e.g. a headline containing "</script>").
function serializeJsonLd(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Bookmarks made from this page before it moved to `news_bookmarks` live in the
// legacy `article_bookmarks` table. Read it as a fallback (and migrate the row
// forward) so pre-existing bookmarks are not silently orphaned.
async function hasLegacyBookmark(userId, articleId) {
    try {
        const { data, error } = await supabase
            .from('article_bookmarks')
            .select('id')
            .eq('user_id', userId)
            .eq('article_id', articleId)
            .maybeSingle();
        if (error) return false;
        return !!data;
    } catch (e) {
        console.warn('[article.js] Legacy bookmark lookup failed:', e?.message || e);
        return false;
    }
}

async function removeLegacyBookmark(userId, articleId) {
    try {
        const { error } = await supabase
            .from('article_bookmarks')
            .delete()
            .eq('user_id', userId)
            .eq('article_id', articleId);
        if (error) console.warn('[article.js] Legacy bookmark cleanup failed:', error.message);
    } catch (e) {
        console.warn('[article.js] Legacy bookmark cleanup failed:', e?.message || e);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export default function ArticlePage() {
    const router = useRouter();
    const { id, slug } = router.query;
    const [menuOpen, setMenuOpen] = useState(false);
    const [article, setArticle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [related, setRelated] = useState([]);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [isReadLater, setIsReadLater] = useState(false);
    const [userId, setUserId] = useState(null);

    const menuConfig = getMenuConfig('article', null, {}, {});

    useEffect(() => {
        try {
            const user = getAuthUser();
            if (user?.id) setUserId(user.id);
        } catch (e) {
            console.warn('[article.js]', e);
        }
    }, []);

    const fetchRelated = useCallback(async (category, excludeId) => {
        try {
            const { data } = await supabase
                .from('poker_news')
                .select('id, title, image_url, slug')
                .eq('category', category)
                .eq('is_published', true)
                .neq('id', excludeId)
                .order('published_at', { ascending: false })
                .limit(3);
            if (data) setRelated(data);
        } catch (e) {
            console.warn('[article.js]', e);
        }
    }, []);

    const fetchArticle = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let query = supabase.from('poker_news').select('*').eq('is_published', true);

            if (id) {
                query = query.eq('id', id);
            } else if (slug) {
                query = query.eq('slug', slug);
            }

            const { data, error: fetchError } = await query
                .order('published_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (fetchError) {
                console.warn('Failed to fetch article:', fetchError.message);
                setError(fetchError.message || 'Failed to load article');
                setArticle(null);
            } else if (data) {
                setArticle(data);
                // Fetch related articles
                fetchRelated(data.category, data.id);
                // Record the view (fire-and-forget) so direct visits and
                // related-article clicks count, matching news.js behavior.
                fetch('/api/news/articles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: data.id })
                }).catch((e) => console.warn('[article.js] View tracking failed:', e?.message || e));
            } else {
                setArticle(null);
            }
        } catch (e) {
            console.warn('Failed to fetch article:', e);
            setError(e?.message || 'Failed to load article');
            setArticle(null);
        } finally {
            setLoading(false);
        }
    }, [id, slug, fetchRelated]);

    useEffect(() => {
        if (!router.isReady) return;
        if (id || slug) {
            fetchArticle();
        } else {
            // No identifying params — show the not-found state instead of an
            // infinite skeleton.
            setLoading(false);
        }
    }, [router.isReady, id, slug, fetchArticle]);

    useEffect(() => {
        if (!article?.id) return;
        let cancelled = false;
        const check = async () => {
            try {
                if (userId) {
                    let bookmarked = await isArticleBookmarked(userId, article.id);
                    if (!bookmarked && (await hasLegacyBookmark(userId, article.id))) {
                        bookmarked = true;
                        // One-time forward migration so /hub/news sees it too.
                        const migrated = await addNewsBookmark(userId, article.id, {
                            title: article.title,
                            url: article.source_url,
                            source: article.source_name,
                            thumbnail: article.image_url
                        });
                        if (migrated) await removeLegacyBookmark(userId, article.id);
                    }
                    if (!cancelled) setIsBookmarked(bookmarked);
                } else {
                    const list = readGuestBookmarks();
                    if (!cancelled) setIsBookmarked(list.some((x) => String(x) === String(article.id)));
                }
            } catch (e) {
                console.warn('[article.js]', e);
            }
        };
        check();
        return () => {
            cancelled = true;
        };
    }, [userId, article?.id]);

    // Read-later membership. Kept separate from the bookmark check above so a
    // failure in one never hides the other control's true state.
    useEffect(() => {
        if (!article?.id) return;
        let cancelled = false;
        const check = async () => {
            try {
                if (userId) {
                    const saved = await isInReadLater(userId, article.id);
                    if (!cancelled) setIsReadLater(saved);
                } else {
                    const list = readGuestReadLater();
                    if (!cancelled) setIsReadLater(list.some((x) => String(x) === String(article.id)));
                }
            } catch (e) {
                console.warn('[article.js]', e);
            }
        };
        check();
        return () => {
            cancelled = true;
        };
    }, [userId, article?.id]);

    const handleReadLater = async () => {
        if (!article?.id) return;
        const articleId = article.id;
        try {
            if (isReadLater) {
                if (userId) await removeFromReadLater(userId, articleId);
                writeGuestReadLater(readGuestReadLater().filter((x) => String(x) !== String(articleId)));
                saveLocalReadLaterMeta(
                    getLocalReadLaterMeta().filter((r) => String(r.article_id) !== String(articleId))
                );
                setIsReadLater(false);
                toast.success('Removed From Read Later');
            } else {
                if (userId) {
                    await addToReadLater(userId, articleId, {
                        title: article.title,
                        url: article.source_url,
                        source: article.source_name,
                        thumbnail: article.image_url
                    });
                }
                const list = readGuestReadLater();
                if (!list.some((x) => String(x) === String(articleId))) {
                    writeGuestReadLater([...list, articleId]);
                }
                // Cache the columns /hub/news needs to RENDER this saved story.
                // The id array alone is not enough there: the feed is paginated,
                // so an article saved from this page is usually not in the page
                // of rows /hub/news has loaded, and the queue would silently drop
                // it. Real values from the row on screen only — nothing invented.
                saveLocalReadLaterMeta([
                    toLocalReadLaterRow(articleId, article),
                    ...getLocalReadLaterMeta().filter((r) => String(r.article_id) !== String(articleId))
                ]);
                setIsReadLater(true);
                toast.success('Saved To Read Later');
            }
        } catch {
            toast.error('Failed To Update Read Later');
        }
    };

    const handleBookmark = async () => {
        if (!article?.id) return;
        const articleId = article.id;
        try {
            if (isBookmarked) {
                if (userId) {
                    await removeNewsBookmark(userId, articleId);
                    // Clear any legacy row too, or it would resurrect on reload.
                    await removeLegacyBookmark(userId, articleId);
                }
                writeGuestBookmarks(readGuestBookmarks().filter((x) => String(x) !== String(articleId)));
                setIsBookmarked(false);
                toast.success('Bookmark Removed');
            } else {
                if (userId) {
                    await addNewsBookmark(userId, articleId, {
                        title: article.title,
                        url: article.source_url,
                        source: article.source_name,
                        thumbnail: article.image_url
                    });
                }
                const list = readGuestBookmarks();
                if (!list.some((x) => String(x) === String(articleId))) {
                    writeGuestBookmarks([...list, articleId]);
                }
                setIsBookmarked(true);
                toast.success('Article Bookmarked');
            }
        } catch {
            toast.error('Failed To Update Bookmark');
        }
    };

    const handleShare = async () => {
        if (!article) return;
        const url = typeof window !== 'undefined' ? window.location.href : `https://smarter.poker/hub/article?id=${article.id}`;
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: article.title,
                    url
                });
                return;
            } catch (err) {
                if (err?.name === 'AbortError') return; // User dismissed the share sheet
                // Fall through to clipboard fallback
            }
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(url);
                toast.success('Link Copied To Clipboard');
            } catch {
                toast.error('Could Not Copy Link');
            }
        } else {
            toast.error('Sharing Not Supported On This Device');
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0a12', paddingBottom: 70 }}>
                <style jsx>{`
                    @keyframes art-shimmer {
                        0% {
                            background-position: -800px 0;
                        }
                        100% {
                            background-position: 800px 0;
                        }
                    }
                    .art-skel {
                        background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.04) 100%);
                        background-size: 800px 100%;
                        animation: art-shimmer 1.4s ease-in-out infinite;
                        border-radius: 6px;
                    }
                `}</style>
                {/* Hero image placeholder */}
                <div className="art-skel" style={{ width: '100%', height: 280 }} />
                {/* Content area */}
                <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
                    {/* Category pill */}
                    <div className="art-skel" style={{ width: 80, height: 24, borderRadius: 12, marginBottom: 20 }} />
                    {/* Title */}
                    <div className="art-skel" style={{ width: '90%', height: 36, marginBottom: 12 }} />
                    <div className="art-skel" style={{ width: '70%', height: 36, marginBottom: 28 }} />
                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {[80, 100, 80, 90].map((w, i) => (
                            <div key={i} className="art-skel" style={{ width: w, height: 14 }} />
                        ))}
                    </div>
                    {/* Body lines */}
                    {[1, 0.95, 0.85, 1, 0.9, 0.75].map((w, i) => (
                        <div key={i} className="art-skel" style={{ width: `${w * 100}%`, height: 16, marginBottom: 18, animationDelay: `${i * 0.08}s` }} />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="article-page error-state">
                <h1>Something Went Wrong</h1>
                <p>We could not load this article. Check your connection and try again.</p>
                <button type="button" onClick={fetchArticle}>Try Again</button>
                <Link href="/hub/news">← Back To News</Link>
                <style jsx>{`
                    .article-page.error-state {
                        min-height: 100vh;
                        background: #0a0a12;
                        color: #fff;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 16px;
                        padding: 24px;
                        text-align: center;
                    }
                    .article-page.error-state h1 {
                        font-size: 24px;
                        margin: 0;
                    }
                    .article-page.error-state p {
                        color: rgba(255, 255, 255, 0.6);
                        font-size: 14px;
                        margin: 0;
                        max-width: 420px;
                    }
                    .article-page.error-state button {
                        background: rgba(0, 212, 255, 0.12);
                        border: 1px solid rgba(0, 212, 255, 0.4);
                        color: #00d4ff;
                        border-radius: 8px;
                        padding: 10px 24px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    .article-page.error-state :global(a) {
                        color: #00d4ff;
                    }
                `}</style>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="article-page not-found">
                <h1>Article Not Found</h1>
                <Link href="/hub/news">← Back To News</Link>
                <style jsx>{`
                    .article-page.not-found {
                        min-height: 100vh;
                        background: #0a0a12;
                        color: #fff;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 16px;
                    }
                    .article-page.not-found h1 {
                        font-size: 24px;
                        margin: 0;
                    }
                    .article-page.not-found :global(a) {
                        color: #00d4ff;
                    }
                `}</style>
            </div>
        );
    }

    const articleDescription = article.content
        ? `${article.content.replace(/\s+/g, ' ').trim().slice(0, 157)}...`
        : 'Read Poker Strategy Articles, News Stories, And Educational Content On Smarter.Poker.';
    const publishedDate = formatDate(article.published_at);
    const paragraphs = (article.content || '')
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);
    const newsArticleJsonLd = buildNewsArticleJsonLd(article);

    return (
        <>
            {/* schema.org NewsArticle for this story. Emitted only once a real
                row has loaded, so search engines never index a skeleton.
                MUST stay OUTSIDE <PageTransition>: that component is loaded with
                dynamic(..., { ssr: false }), so anything inside it is absent from the
                server-rendered HTML — and JSON-LD that is not in the SSR payload is
                invisible to crawlers, which defeats the point of emitting it. */}
            {newsArticleJsonLd && (
                <Head>
                    <script
                        type="application/ld+json"
                        key="article-jsonld"
                        dangerouslySetInnerHTML={{ __html: serializeJsonLd(newsArticleJsonLd) }}
                    />
                </Head>
            )}

        <PageTransition>
            <SEOHead
                title={article.title || 'Poker Article'}
                description={articleDescription}
                canonical={`/hub/article?id=${article.id}`}
                ogImage={article.image_url || undefined}
            />

            <div className="article-page">
                {/* UniversalHeader */}
                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="right"
                    theme="dark"
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Header — share/bookmark actions only (back button is in UniversalHeader) */}
                <header className="header">
                    <div style={{ width: 60 }} />
                    <div className="actions">
                        <button type="button" onClick={handleShare} aria-label="Share article">
                            <Share2 size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={handleReadLater}
                            aria-label={isReadLater ? 'Remove from read later' : 'Save to read later'}
                            title={isReadLater ? 'Remove from read later' : 'Save to read later'}
                            aria-pressed={isReadLater}
                            style={isReadLater ? { background: 'rgba(168,85,247,0.2)', borderColor: '#a855f7' } : {}}
                        >
                            <Clock size={18} color={isReadLater ? '#a855f7' : '#fff'} />
                        </button>
                        <button
                            type="button"
                            onClick={handleBookmark}
                            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark article'}
                            aria-pressed={isBookmarked}
                            style={isBookmarked ? { background: 'rgba(0,212,255,0.2)', borderColor: '#00d4ff' } : {}}
                        >
                            <Bookmark size={18} fill={isBookmarked ? '#00d4ff' : 'none'} color={isBookmarked ? '#00d4ff' : '#fff'} />
                        </button>
                    </div>
                </header>

                {/* Hero Image.
                    Deliberately a raw <img>, not next/image: image_url comes from
                    the scraper and can be ANY remote host (each publisher's CDN).
                    next/image throws at runtime for a hostname that is not listed
                    in next.config images.remotePatterns, which would turn a new
                    source into a hard page error. Revisit only alongside a
                    verified remotePatterns entry (or unoptimized/a loader). */}
                {article.image_url && (
                    <div className="hero-image">
                        <img src={article.image_url} alt={article.title || ''} loading="eager" fetchpriority="high" decoding="async" />
                    </div>
                )}

                {/* Article Content */}
                <article className="content">
                    {article.category && <div className="category">{article.category}</div>}
                    <h1>{article.title}</h1>

                    <div className="meta">
                        <span><User size={14} /> {article.source_name || 'Smarter.Poker'}</span>
                        {publishedDate && (
                            <span><Calendar size={14} /> {publishedDate}</span>
                        )}
                        <span><Clock size={14} /> {article.read_time || 3} min read</span>
                        <span><Eye size={14} /> {(article.views || 0).toLocaleString()} views</span>
                    </div>

                    <div className="body">
                        {paragraphs.map((paragraph, i) => (
                            <p key={i}>{paragraph}</p>
                        ))}
                    </div>
                </article>

                {/* Related Articles */}
                {related.length > 0 && (
                    <section className="related">
                        <h3>Related Articles</h3>
                        <div className="related-grid">
                            {related.map(item => (
                                <Link key={item.id} href={`/hub/article?id=${item.id}`}>
                                    <div className="related-card">
                                        {item.image_url ? (
                                            <img src={item.image_url} alt="" loading="lazy" decoding="async" />
                                        ) : (
                                            <div className="related-card-placeholder" aria-hidden="true" />
                                        )}
                                        <span>{item.title}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <style jsx>{`
                    .article-page {
                        min-height: 100vh;
                        background: #0a0a12;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }

                    .header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 16px 24px;
                        background: rgba(10, 10, 18, 0.95);
                        backdrop-filter: blur(12px);
                        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                        z-index: 99;
                    }

                    .actions {
                        display: flex;
                        gap: 8px;
                    }

                    .actions button {
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        color: #fff;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .actions button:hover {
                        background: rgba(0, 212, 255, 0.1);
                        border-color: #00d4ff;
                    }

                    .hero-image {
                        width: 100%;
                        max-height: 400px;
                        overflow: hidden;
                    }

                    .hero-image img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    }

                    .content {
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 40px 24px;
                    }

                    .category {
                        display: inline-block;
                        padding: 6px 12px;
                        background: rgba(0, 212, 255, 0.15);
                        color: #00d4ff;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 700;
                        text-transform: uppercase;
                        margin-bottom: 16px;
                    }

                    .content h1 {
                        font-size: clamp(28px, 5vw, 42px);
                        font-weight: 700;
                        line-height: 1.2;
                        margin-bottom: 20px;
                    }

                    .meta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 20px;
                        padding-bottom: 24px;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                        margin-bottom: 32px;
                    }

                    .meta span {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.6);
                    }

                    .body p {
                        font-size: 17px;
                        line-height: 1.8;
                        color: rgba(255, 255, 255, 0.85);
                        margin-bottom: 24px;
                    }

                    .related {
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 40px 24px;
                        border-top: 1px solid rgba(255, 255, 255, 0.06);
                    }

                    .related h3 {
                        font-size: 18px;
                        margin-bottom: 20px;
                    }

                    .related-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                        gap: 16px;
                    }

                    .related-card {
                        background: rgba(255, 255, 255, 0.03);
                        border-radius: 12px;
                        overflow: hidden;
                        cursor: pointer;
                        transition: transform 0.2s;
                    }

                    .related-card:hover {
                        transform: translateY(-4px);
                    }

                    .related-card img {
                        width: 100%;
                        aspect-ratio: 16/10;
                        object-fit: cover;
                    }

                    .related-card-placeholder {
                        width: 100%;
                        aspect-ratio: 16/10;
                        background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(168, 85, 247, 0.08));
                    }

                    .related-card span {
                        display: block;
                        padding: 12px;
                        font-size: 13px;
                        font-weight: 500;
                    }
                `}</style>
            </div>
            <BottomNavBar />
        </PageTransition>
        </>
    );
}
