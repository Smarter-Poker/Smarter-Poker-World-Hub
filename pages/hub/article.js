/**
 * Single Article Page
 */
import SEOHead from '../../src/components/seo/SEOHead';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Eye, Calendar, Share2, Bookmark, User, BookOpen, ExternalLink } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';
import { getAccessToken, getAuthUser } from '../../src/lib/authUtils';
import { newsImageUrl } from '../../src/lib/security/imageHosts.js';
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
import NewsletterCaptureBar from '../../src/components/news/NewsletterCaptureBar';

const ArticleReaderModal = dynamic(() => import('../../src/components/social/ArticleReaderModal'), { ssr: false });
const FALLBACK_HERO_IMAGE = '/api/news/email-image?fallback=1&m=hero';
const FALLBACK_THUMB_IMAGE = '/api/news/email-image?fallback=1&m=thumb';

function normalizeComparableText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function buildDisplayParagraphs(article) {
    if (!article) return [];
    const normTitle = normalizeComparableText(article.title);
    const seen = new Set();
    const out = [];
    const candidates = [
        article.summary || '',
        article.excerpt || '',
        ...String(article.content || '').split('\n'),
    ];
    for (const raw of candidates) {
        const cleaned = String(raw || '').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim();
        if (!cleaned) continue;
        const norm = normalizeComparableText(cleaned);
        if (!norm || norm === normTitle || seen.has(norm)) continue;
        seen.add(norm);
        out.push(cleaned);
    }
    return out;
}

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

const ARTICLE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Next.js gives an array for a repeated query key (?id=a&id=b); the article lookup needs one string.
function firstQueryValue(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' ? raw.trim() : '';
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
    const id = firstQueryValue(router.query.id);
    const slug = firstQueryValue(router.query.slug);
    const [menuOpen, setMenuOpen] = useState(false);
    const [article, setArticle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [related, setRelated] = useState([]);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [isReadLater, setIsReadLater] = useState(false);
    const [userId, setUserId] = useState(null);
    const [readerOpen, setReaderOpen] = useState(false);
    // Every article load takes a ticket; only the newest load may touch state, so a slow response
    // for the previous story can never replace the one the reader just opened.
    const fetchSeqRef = useRef(0);

    const menuConfig = getMenuConfig('article', null, {}, {});

    useEffect(() => {
        try {
            const user = getAuthUser();
            if (user?.id) setUserId(user.id);
        } catch (e) {
            console.warn('[article.js]', e);
        }
    }, []);

    const fetchRelated = useCallback(async (category, excludeId, seq) => {
        try {
            const { data } = await supabase
                .from('poker_news')
                .select('id, title, image_url, slug')
                .eq('category', category)
                .eq('is_published', true)
                .neq('id', excludeId)
                .order('published_at', { ascending: false })
                .limit(3);
            if (data && seq === fetchSeqRef.current) setRelated(data);
        } catch (e) {
            console.warn('[article.js]', e);
        }
    }, []);

    const fetchArticle = useCallback(async () => {
        const seq = ++fetchSeqRef.current;
        setLoading(true);
        setError(null);
        // Per-story state belongs to the previous story until the new one loads; clear it so a
        // bookmark or read-later toggle can never act on another article's saved state.
        setRelated([]);
        setIsBookmarked(false);
        setIsReadLater(false);
        setReaderOpen(false);
        try {
            if ((id && !ARTICLE_UUID_RE.test(id)) || (!id && !slug)) {
                // A malformed id can never match a row; Postgres would reject it as a uuid syntax error.
                setArticle(null);
                return;
            }
            let query = supabase.from('poker_news').select('*').eq('is_published', true);

            if (id) {
                query = query.eq('id', id);
            } else {
                query = query.eq('slug', slug);
            }

            const { data, error: fetchError } = await query
                .order('published_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (seq !== fetchSeqRef.current) return;

            if (fetchError) {
                console.warn('Failed to fetch article:', fetchError.message);
                setError(fetchError.message || 'Failed to load article');
                setArticle(null);
            } else if (data) {
                setArticle(data);
                // Fetch related articles
                fetchRelated(data.category, data.id, seq);
                // Record the view (fire-and-forget) so direct visits and
                // related-article clicks count, matching news.js behavior.
                const accessToken = getAccessToken();
                fetch('/api/news/articles', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                    },
                    body: JSON.stringify({ id: data.id })
                }).catch((e) => console.warn('[article.js] View tracking failed:', e?.message || e));
            } else {
                setArticle(null);
            }
        } catch (e) {
            if (seq !== fetchSeqRef.current) return;
            console.warn('Failed to fetch article:', e);
            setError(e?.message || 'Failed to load article');
            setArticle(null);
        } finally {
            if (seq === fetchSeqRef.current) setLoading(false);
        }
    }, [id, slug, fetchRelated]);

    useEffect(() => {
        if (!router.isReady) return;
        if (id || slug) {
            fetchArticle();
        } else {
            // No identifying params — show the not-found state instead of an
            // infinite skeleton, and retire any lookup still in flight for a previous story.
            fetchSeqRef.current += 1;
            setArticle(null);
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
                // Guest storage is for GUESTS only. Writing it while signed in
                // left one account's saved article ids and titles in the browser
                // for whoever used it next — on a shared machine the next signed
                // -out visitor would see them in Read Later. Signed-in users get
                // their list (with metadata) back from addToReadLater/getReadLater,
                // so the local copy buys nothing.
                if (!userId) {
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
                }
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
                } else {
                    writeGuestBookmarks(readGuestBookmarks().filter((x) => String(x) !== String(articleId)));
                }
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
                } else {
                    const list = readGuestBookmarks();
                    if (!list.some((x) => String(x) === String(articleId))) {
                        writeGuestBookmarks([...list, articleId]);
                    }
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
                <p>We Could Not Load This Article. Check Your Connection And Try Again.</p>
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

    const paragraphs = buildDisplayParagraphs(article);
    const primarySummary = paragraphs[0] || '';
    const articleDescription = primarySummary
        ? `${primarySummary.slice(0, 157)}${primarySummary.length > 157 ? '...' : ''}`
        : 'Read Poker Strategy Articles, News Stories, And Educational Content On Smarter.Poker.';
    const publishedDate = formatDate(article.published_at);
    const newsArticleJsonLd = buildNewsArticleJsonLd(article);
    const guardedHeroSrc = newsImageUrl(article.image_url) || FALLBACK_HERO_IMAGE;
    const externalSourceUrl =
        typeof article.source_url === 'string' &&
        /^https?:\/\//i.test(article.source_url.trim()) &&
        !article.source_url.includes('smarter.poker')
            ? article.source_url.trim()
            : '';

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
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
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
                        <button type="button" onClick={handleShare} aria-label="Share Article">
                            <Share2 size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={handleReadLater}
                            aria-label={isReadLater ? 'Remove From Read Later' : 'Save To Read Later'}
                            title={isReadLater ? 'Remove From Read Later' : 'Save To Read Later'}
                            aria-pressed={isReadLater}
                            style={isReadLater ? { background: 'rgba(79,193,179,0.2)', borderColor: '#4fc1b3' } : {}}
                        >
                            <Clock size={18} color={isReadLater ? '#4fc1b3' : '#fff'} />
                        </button>
                        <button
                            type="button"
                            onClick={handleBookmark}
                            aria-label={isBookmarked ? 'Remove Bookmark' : 'Bookmark Article'}
                            aria-pressed={isBookmarked}
                            style={isBookmarked ? { background: 'rgba(96,165,250,0.2)', borderColor: '#60a5fa' } : {}}
                        >
                            <Bookmark size={18} fill={isBookmarked ? '#60a5fa' : 'none'} color={isBookmarked ? '#60a5fa' : '#fff'} />
                        </button>
                    </div>
                </header>

                {/* Hero Image routed through same-origin newsImageUrl + guaranteed Vanguard fallback */}
                <div className="hero-image">
                    <img
                        src={guardedHeroSrc}
                        alt={article.title || 'Smarter.Poker News Story'}
                        loading="eager"
                        fetchpriority="high"
                        decoding="async"
                        onError={(ev) => {
                            if (!ev.currentTarget.dataset.fb) {
                                ev.currentTarget.dataset.fb = '1';
                                ev.currentTarget.src = FALLBACK_HERO_IMAGE;
                            }
                        }}
                    />
                </div>

                {/* Article Content */}
                <article className="content">
                    {article.category && <div className="category">{article.category}</div>}
                    <h1>{article.title}</h1>

                    <div className="meta">
                        <span><User size={14} /> {article.source_name || 'Smarter.Poker'}</span>
                        {publishedDate && (
                            <span><Calendar size={14} /> {publishedDate}</span>
                        )}
                        <span><Clock size={14} /> {article.read_time || 3} Min Read</span>
                        <span><Eye size={14} /> {(article.views || 0).toLocaleString()} Views</span>
                    </div>

                    <div className="body">
                        {paragraphs.length > 0 ? (
                            paragraphs.map((paragraph, i) => (
                                <p key={i}>{paragraph}</p>
                            ))
                        ) : (
                            <p>
                                Open The Full Dispatch Below To Read Complete Coverage From {article.source_name || 'Our Poker News Desk'}.
                            </p>
                        )}
                    </div>

                    {externalSourceUrl && (
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '12px',
                                alignItems: 'center',
                                margin: '8px 0 28px 0',
                                padding: '18px 20px',
                                background: '#07131d',
                                border: '1px solid #234055',
                                borderRadius: '12px',
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setReaderOpen(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: '#4fc1b3',
                                    color: '#05070a',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '12px 20px',
                                    fontSize: '14px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                <BookOpen size={16} />
                                Read Full Story In Reader
                            </button>
                            <a
                                href={externalSourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                    background: '#0d1e2c',
                                    border: '1px solid #28475c',
                                    color: '#60a5fa',
                                    textDecoration: 'none',
                                    borderRadius: '8px',
                                    padding: '11px 18px',
                                    fontSize: '13.5px',
                                    fontWeight: 700,
                                }}
                            >
                                Open Original At {article.source_name || 'Source'}
                                <ExternalLink size={14} />
                            </a>
                        </div>
                    )}

                    <NewsletterCaptureBar variant="inline" pathname="/hub/article" />
                </article>

                {/* Related Articles */}
                {related.length > 0 && (
                    <section className="related">
                        <h3>Related Articles</h3>
                        <div className="related-grid">
                            {related.map(item => {
                                const relSrc = newsImageUrl(item.image_url) || FALLBACK_THUMB_IMAGE;
                                return (
                                    <Link key={item.id} href={`/hub/article?id=${item.id}`}>
                                        <div className="related-card">
                                            <img
                                                src={relSrc}
                                                alt={item.title || 'Related Poker Story'}
                                                loading="lazy"
                                                decoding="async"
                                                onError={(ev) => {
                                                    if (!ev.currentTarget.dataset.fb) {
                                                        ev.currentTarget.dataset.fb = '1';
                                                        ev.currentTarget.src = FALLBACK_THUMB_IMAGE;
                                                    }
                                                }}
                                            />
                                            <span>{item.title}</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}

                {readerOpen && externalSourceUrl && (
                    <ArticleReaderModal
                        url={externalSourceUrl}
                        title={article.title || 'Poker News Story'}
                        onClose={() => setReaderOpen(false)}
                    />
                )}

                <style jsx>{`
                    .article-page {
                        min-height: 100vh;
                        padding-bottom: 76px;
                        background: #000407;
                        color: #e4edf1;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }

                    .header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 16px 24px;
                        background: rgba(3, 9, 13, 0.96);
                        backdrop-filter: blur(12px);
                        border-bottom: 1px solid #345468;
                        position: sticky;
                        top: 64px;
                        z-index: 100;
                    }

                    .actions {
                        display: flex;
                        gap: 8px;
                    }

                    .actions button {
                        width: 44px;
                        height: 44px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 999px;
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
                        max-height: 480px;
                        overflow: hidden;
                        border-bottom: 1px solid #345468;
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
                        background: #071822;
                        color: #31c2ff;
                        border: 1px solid #345468;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: 700;
                        text-transform: uppercase;
                        margin-bottom: 16px;
                    }

                    .content h1 {
                        font-family: 'Arial Narrow', Arial, sans-serif;
                        text-transform: uppercase;
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
                        background: #061018;
                        border: 1px solid #284758;
                        border-radius: 4px;
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
                        background: linear-gradient(135deg, rgba(79, 193, 179, 0.12), rgba(96, 165, 250, 0.12));
                    }

                    .related-card span {
                        display: block;
                        padding: 12px;
                        font-size: 13px;
                        font-weight: 500;
                    }

                    @media (min-width: 900px) {
                        .hero-image { width: min(1180px, calc(100% - 48px)); margin: 24px auto 0; border: 1px solid #345468; }
                        .content { padding-top: 56px; }
                    }

                    @media (max-width: 640px) {
                        .header { top: 56px; padding: 10px 14px; }
                        .content { padding: 28px 18px; }
                        .meta { gap: 12px; }
                    }
                `}</style>
            </div>
        </PageTransition>
        </>
    );
}
