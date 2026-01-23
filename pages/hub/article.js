/**
 * Single Article Page
 */
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowLeft, Clock, Eye, Calendar, Share2, Bookmark, User } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';

// God-Mode Stack
import { useArticleStore } from '../../src/stores/articleStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

export default function ArticlePage() {
    const router = useRouter();
    const { id, slug } = router.query;
    const [article, setArticle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [related, setRelated] = useState([]);

    useEffect(() => {
        if (id || slug) {
            fetchArticle();
        }
    }, [id, slug]);

    const fetchArticle = async () => {
        setLoading(true);
        try {
            let query = supabase.from('poker_news').select('*');

            if (id) {
                query = query.eq('id', id);
            } else if (slug) {
                query = query.eq('slug', slug);
            }

            const { data, error } = await query.single();

            if (!error && data) {
                setArticle(data);
                // Fetch related articles
                fetchRelated(data.category, data.id);
            }
        } catch (e) {
            console.error('Failed to fetch article:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchRelated = async (category, excludeId) => {
        try {
            const { data } = await supabase
                .from('poker_news')
                .select('id, title, image_url, slug')
                .eq('category', category)
                .neq('id', excludeId)
                .limit(3);
            if (data) setRelated(data);
        } catch (e) { }
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const handleShare = async () => {
        if (navigator.share) {
            await navigator.share({
                title: article.title,
                url: window.location.href
            });
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert('Link copied to clipboard!');
        }
    };

    if (loading) {
        return (
            <div className="article-page loading">
                <div className="spinner" />
                <style jsx>{`
                    .article-page { min-height: 100vh; background: #0a0a12; display: flex; align-items: center; justify-content: center; }
                    .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #00d4ff; border-radius: 50%; animation: spin 1s linear infinite; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="article-page not-found">
                <h1>Article Not Found</h1>
                <Link href="/hub/news">← Back to News</Link>
                <style jsx>{`
                    .article-page { min-height: 100vh; background: #0a0a12; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
                    h1 { font-size: 24px; }
                    a { color: #00d4ff; }
                `}</style>
            </div>
        );
    }

    return (
        <PageTransition>
            <Head>
                <title>{article.title} | Smarter.Poker</title>
                <meta name="description" content={article.excerpt || article.content?.substring(0, 160)} />
            </Head>

            <div className="article-page">
                {/* UniversalHeader */}
                <UniversalHeader pageDepth={2} />

                {/* Header */}
                <header className="header">
                    <div className="back-btn">
                        <ArrowLeft size={20} />
                        <span>Back to News</span>
                    </div>
                    <div className="actions">
                        <button onClick={handleShare}><Share2 size={18} /></button>
                        <button><Bookmark size={18} /></button>
                    </div>
                </header>

                {/* Hero Image */}
                {article.image_url && (
                    <div className="hero-image">
                        <img src={article.image_url} alt={article.title} />
                    </div>
                )}

                {/* Article Content */}
                <article className="content">
                    <div className="category">{article.category}</div>
                    <h1>{article.title}</h1>

                    <div className="meta">
                        <span><User size={14} /> {article.source_name || 'Smarter.Poker'}</span>
                        <span><Calendar size={14} /> {formatDate(article.published_at)}</span>
                        <span><Clock size={14} /> {article.read_time || 3} min read</span>
                        <span><Eye size={14} /> {(article.views || 0).toLocaleString()} views</span>
                    </div>

                    <div className="body">
                        {article.content?.split('\n').map((paragraph, i) => (
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
                                        <img src={item.image_url} alt="" />
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
                        background: rgba(10,10,18,0.95);
                        backdrop-filter: blur(12px);
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                        position: sticky;
                        top: 0;
                        z-index: 100;
                    }

                    .back-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        color: #fff;
                        text-decoration: none;
                        font-size: 14px;
                    }

                    .back-btn:hover { color: #00d4ff; }

                    .actions { display: flex; gap: 8px; }

                    .actions button {
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: #fff;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .actions button:hover {
                        background: rgba(0,212,255,0.1);
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
                        background: rgba(0,212,255,0.15);
                        color: #00d4ff;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 700;
                        text-transform: uppercase;
                        margin-bottom: 16px;
                    }

                    h1 {
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
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                        margin-bottom: 32px;
                    }

                    .meta span {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                    }

                    .body p {
                        font-size: 17px;
                        line-height: 1.8;
                        color: rgba(255,255,255,0.85);
                        margin-bottom: 24px;
                    }

                    .related {
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 40px 24px;
                        border-top: 1px solid rgba(255,255,255,0.06);
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
                        background: rgba(255,255,255,0.03);
                        border-radius: 12px;
                        overflow: hidden;
                        cursor: pointer;
                        transition: transform 0.2s;
                    }

                    .related-card:hover { transform: translateY(-4px); }

                    .related-card img {
                        width: 100%;
                        aspect-ratio: 16/10;
                        object-fit: cover;
                    }

                    .related-card span {
                        display: block;
                        padding: 12px;
                        font-size: 13px;
                        font-weight: 500;
                    }
                `}</style>
            </div>
        </PageTransition>
    );
}
