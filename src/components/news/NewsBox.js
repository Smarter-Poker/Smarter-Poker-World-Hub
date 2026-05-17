import React from 'react';
import { Eye, Bookmark, BookmarkCheck, Share2, CheckCircle, Clock } from 'lucide-react';

// Fallback images for different categories
const FALLBACK_IMAGES = {
    tournament: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=400',
    strategy: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=400',
    industry: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=400',
    news: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=400',
    online: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=400'
};

function formatViews(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Source accent colors
const SOURCE_COLORS_LOCAL = {
    'PokerNews': '#e53935',
    'MSPT': '#1565c0',
    'CardPlayer': '#43a047',
    'Card Player': '#43a047',
    'WSOP': '#f9a825',
    'Poker.org': '#7b1fa2',
    'Pokerfuse': '#00897b'
};

export default function NewsBox({ article, index, onOpen, isBookmarked, onBookmark, onShare, isRead }) {
    // Calculate dynamic read time: ~200 words per minute or pseudo-random based on title
    const textToEstimate = article.content || article.summary || article.excerpt || article.title || '';
    const wordCount = textToEstimate.trim().split(/\s+/).filter(Boolean).length;
    const dynamicReadTime = wordCount > 50 
        ? Math.min(12, Math.max(2, Math.ceil(wordCount / 200))) 
        : Math.min(5, Math.max(2, article.title ? (article.title.length % 4) + 2 : 3));
    
    // Override if we have a valid, non-default read_time in database
    const readTime = (article.read_time && article.read_time !== 3) ? article.read_time : dynamicReadTime;

    const categoryColors = {
        tournament: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', icon: 'Trophy' },
        strategy: { bg: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa', icon: '📚' },
        industry: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', icon: '💼' },
        news: { bg: 'rgba(0, 212, 255, 0.15)', color: '#2374E1', icon: '📰' },
        online: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', icon: '💻' }
    };
    const catStyle = categoryColors[article.category] || categoryColors.news;

    // Get image with fallback — proxy cardplayer.com images through our server (they block direct browser access)
    const rawImageUrl = article.image_url;
    const isCardPlayerImage = rawImageUrl && (
        rawImageUrl.includes('cardplayer.com')
    );
    const imageUrl = isCardPlayerImage
        ? `/api/proxy?url=${encodeURIComponent(rawImageUrl)}`
        : (rawImageUrl || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news);
    const fallbackUrl = FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news;

    const srcColor = SOURCE_COLORS_LOCAL[article.source_name] || '#5ef5f0';

    return (
        <div
            className={`news-box ${isRead ? 'read' : ''}`}
            data-source={article.source_name}
            style={{ '--src-accent': srcColor }}
            onClick={() => onOpen(article)}
        >
            {/* Quick Actions */}
            <div className="box-actions">
                <button onClick={(e) => { e.stopPropagation(); onBookmark(article.id, article); }} title="Bookmark">
                    {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onShare(article); }} title="Share">
                    <Share2 size={14} />
                </button>
            </div>

            {/* Read Indicator */}
            {isRead && (
                <div className="read-indicator">
                    <CheckCircle size={10} /> Read
                </div>
            )}

            {/* Reading Time Badge */}
            {readTime > 0 && (
                <div className="read-time-badge">
                    <Clock size={9} /> {readTime} min
                </div>
            )}

            {/* Image with fallback */}
            <div className="box-image">
                <img
                    src={imageUrl}
                    alt={article.title}
                    loading="lazy"
                    onError={(e) => {
                        // Try category fallback before giving up
                        if (e.target.src !== fallbackUrl) {
                            e.target.src = fallbackUrl;
                        } else {
                            e.target.style.display = 'none';
                            e.target.parentElement.classList.add('no-image');
                        }
                    }}
                />
                <div className="image-placeholder">
                    <span className="placeholder-icon">{catStyle.icon}</span>
                    <span className="placeholder-text">{article.category?.toUpperCase() || 'POKER'}</span>
                </div>
                <div className="box-overlay" />
            </div>

            {/* Content - compact: title + excerpt + meta */}
            <div className="box-content">
                <h3 className="box-title">{article.title}</h3>
                {article.content && (
                    <p className="box-excerpt">{article.content.replace(/<[^>]*>/g, '').slice(0, 90)}...</p>
                )}
                <div className="box-meta">
                    <span className="source" style={{ color: srcColor }}>{article.source_name || 'Smarter.Poker'}</span>
                    <span className="separator">•</span>
                    <span className="time">{timeAgo(article.published_at)}</span>
                    <span className="separator">•</span>
                    <span className="views"><Eye size={10} /> {formatViews(article.views || 0)}</span>
                </div>
            </div>

            <style>{`
                .news-box {
                    position: relative;
                    background: #1a1c1e;
                    border-radius: 16px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    height: 340px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }
                
                /* Chrome frame overlay - border only, no glow */
                .news-box::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 16px;
                    border: 5px solid rgba(180, 195, 220, 0.9);
                    box-shadow: none;
                    pointer-events: none;
                    z-index: 100;
                }


                .news-box:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }

                .news-box.read {
                    opacity: 0.7;
                }

                .news-box.read:hover {
                    opacity: 1;
                }

                .box-actions {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    display: flex;
                    gap: 6px;
                    z-index: 10;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .news-box:hover .box-actions {
                    opacity: 1;
                }

                .box-actions button {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .box-actions button:hover {
                    background: rgba(0, 212, 255, 0.4);
                }

                .read-indicator {
                    position: absolute;
                    top: 12px;
                    left: 12px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(34, 197, 94, 0.9);
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 600;
                    color: #fff;
                    z-index: 10;
                }

                .box-image {
                    position: relative;
                    width: 100%;
                    height: 240px;
                    overflow: hidden;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 12px 12px 0 0;
                }

                .box-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: center top;
                    transition: transform 0.4s;
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 1;
                }

                .news-box:hover .box-image img {
                    transform: scale(1.08);
                }

                .box-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to top, rgba(10, 10, 18, 0.9) 0%, transparent 60%);
                    z-index: 2;
                }

                .image-placeholder {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 50%, #16213e 100%);
                    z-index: 0;
                }

                .box-image.no-image .image-placeholder {
                    z-index: 1;
                }

                .placeholder-icon {
                    font-size: 48px;
                    opacity: 0.6;
                }

                .placeholder-text {
                    font-size: 12px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: rgba(255, 255, 255, 0.4);
                    margin-top: 8px;
                }

                .box-content {
                    padding: 6px 8px 12px 8px;
                    margin: 6px 0 0 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 2px;
                    height: auto !important;
                    min-height: 60px !important;
                    flex-grow: 1;
                    flex-shrink: 0;
                    background: #1a1c1e;
                    overflow: hidden;
                    border-radius: 6px 6px 0 0;
                }

                .box-category {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    width: fit-content;
                }

                .box-title {
                    font-size: 13px;
                    font-weight: 600;
                    line-height: 1.3;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin: 0;
                }

                .news-box-large .box-title {
                    font-size: 18px;
                    -webkit-line-clamp: 3;
                }

                .box-excerpt {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    line-height: 1.5;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .box-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    white-space: nowrap;
                    overflow: hidden;
                }

                .box-meta .source {
                    color: #2374E1;
                    font-weight: 600;
                }

                .box-meta .separator {
                    opacity: 0.3;
                }

                .box-meta .views {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }

                /* =============================================================
                   SOCIAL MEDIA FORMULA - Mobile Override (INSIDE NewsBox scope)
                   styled-jsx scoping requires these rules HERE, not in the parent
                   ============================================================= */
                @media (max-width: 768px) {
                    .news-box {
                        height: auto !important;
                        min-height: auto !important;
                        max-height: none !important;
                        border-radius: 12px !important;
                        box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;
                        border: none !important;
                        margin-bottom: 0 !important;
                        overflow: hidden !important;
                    }

                    .news-box::after {
                        content: '' !important;
                        display: block !important;
                        position: absolute !important;
                        inset: 0 !important;
                        border-radius: 12px !important;
                        border: 4px solid rgba(180, 195, 220, 0.9) !important;
                        box-shadow: none !important;
                        pointer-events: none !important;
                        z-index: 10 !important;
                    }

                    .box-image {
                        height: auto !important;
                        aspect-ratio: 16/9;
                        border-radius: 0 !important;
                    }

                    .box-image img {
                        position: relative !important;
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: cover !important;
                        border-radius: 0 !important;
                    }

                    .box-content {
                        padding: 12px 16px !important;
                    }

                    .box-title {
                        font-size: 15px !important;
                        line-height: 1.4 !important;
                        white-space: normal !important;
                        overflow: visible !important;
                        text-overflow: unset !important;
                    }

                    .box-overlay {
                        display: none !important;
                    }

                    .box-meta {
                        font-size: 12px !important;
                    }
                }
            `}</style>
        </div>
    );
}

// Re-export helpers for sibling components
export { FALLBACK_IMAGES, formatViews, timeAgo, SOURCE_COLORS_LOCAL };
