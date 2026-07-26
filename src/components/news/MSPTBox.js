// UNREFERENCED: nothing in the repo imports this component today (verified repo-wide) — kept pending a decision on its future.
import React from 'react';
import { timeAgo, safeText, CardErrorBoundary } from './NewsBox';

const MSPT_ACCENT = '#dc2626';
const MSPT_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80';

function MSPTBoxBody({ msptNews = [], onOpenMSPT }) {
    const featured = Array.isArray(msptNews) ? msptNews[0] : null;
    const publishedLabel = featured?.published_at ? timeAgo(featured.published_at) : '';

    const featuredTitle = safeText(featured?.title);
    const prizePool = safeText(featured?.prize_pool);
    const imageUrl = (typeof featured?.image_url === 'string' && featured.image_url)
        ? featured.image_url
        : MSPT_FALLBACK_IMAGE;

    const openFeatured = () => {
        // Handler errors are outside the error boundary's reach — contain them.
        try {
            if (featured && onOpenMSPT) onOpenMSPT(featured);
        } catch (err) {
            console.warn('[MSPTBox] onOpenMSPT failed:', err?.message || err);
        }
    };

    // ACCESSIBILITY NOTE: this card contains NO nested interactive elements, so
    // a div with role="button" + tabIndex + Enter/Space is a valid single
    // interactive wrapper and does NOT trip axe's 'nested-interactive' rule
    // (unlike NewsBox, which really did contain <button>s and has been
    // restructured). If a real <button> is ever added inside this card, move
    // the interaction to a stretched <button class="card-open"> sibling the way
    // NewsBox does.
    return (
        <div
            className="news-box mspt-box"
            style={{ '--src-accent': MSPT_ACCENT }}
            role="button"
            tabIndex={0}
            aria-label={featuredTitle ? `Open MSPT article: ${featuredTitle}` : 'MSPT News & Updates'}
            onClick={openFeatured}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openFeatured();
                }
            }}
        >
            {/* Image */}
            <div className="box-image">
                <img
                    src={imageUrl}
                    alt={featuredTitle || 'MSPT News'}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                        if (e?.target && e.target.src !== MSPT_FALLBACK_IMAGE) {
                            e.target.src = MSPT_FALLBACK_IMAGE;
                        }
                    }}
                />
                <div className="box-overlay" />
            </div>

            {/* Content */}
            <div className="box-content">
                {/* Title */}
                <h3 className="box-title">{featuredTitle || "MSPT News & Updates"}</h3>

                {/* Description */}
                <p className="box-excerpt">
                    {prizePool ? `${prizePool} - ` : ''}
                    Latest updates from Mid-States Poker Tour events and tournaments.
                </p>

                {/* Meta */}
                <div className="box-meta">
                    <span className="source">MSPT</span>
                    <span className="separator">•</span>
                    <span className="time">{publishedLabel || 'Live'}</span>
                </div>
            </div>

            <style jsx>{`
                .news-box {
                    position: relative;
                    background: #1a1c1e;
                    border-radius: 16px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }
                .news-box::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: 16px;
                    border: 5px solid rgba(180, 195, 220, 0.9);
                    pointer-events: none;
                    z-index: 100;
                }
                .news-box:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                .news-box:focus-visible {
                    outline: 2px solid #5ef5f0;
                    outline-offset: 2px;
                }
                .mspt-box {
                    height: 340px;
                }
                /* MSPT brand accent lives on the chrome frame so it is
                   actually visible (a border on the box itself would be
                   hidden underneath the ::after frame). */
                .mspt-box:hover::after {
                    border-color: rgba(220, 38, 38, 0.7);
                }
                .mspt-box:hover {
                    box-shadow: 0 8px 32px rgba(220, 38, 38, 0.2);
                }
                .box-image {
                    position: relative;
                    width: 100%;
                    height: 240px;
                    overflow: hidden;
                    border-radius: 12px 12px 0 0;
                }
                .box-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .box-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to top, rgba(10, 10, 18, 0.9) 0%, transparent 60%);
                    z-index: 2;
                }
                .box-content {
                    padding: 6px 8px 12px 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    flex-grow: 1;
                }
                .box-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
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
                }
                .box-meta .source {
                    color: #dc2626;
                    font-weight: 600;
                }
                .box-meta .separator {
                    opacity: 0.3;
                }
            `}</style>
        </div>
    );
}

// MEMOISATION: made explicit so the memo is not defeated by callback identity.
// Only the first entry of msptNews is rendered, so compare that entry's fields;
// onOpenMSPT is deliberately excluded — if a future handler closes over
// fast-changing state, wrap it in useCallback at the call site rather than
// loosening this comparator.
const COMPARED_MSPT_FIELDS = ['id', 'title', 'image_url', 'prize_pool', 'published_at'];

export function areMSPTBoxPropsEqual(prev, next) {
    if (prev === next) return true;
    const a = Array.isArray(prev.msptNews) ? prev.msptNews[0] : null;
    const b = Array.isArray(next.msptNews) ? next.msptNews[0] : null;
    if (a === b) return true;
    if (!a || !b) return false;
    for (let i = 0; i < COMPARED_MSPT_FIELDS.length; i++) {
        const field = COMPARED_MSPT_FIELDS[i];
        if (a[field] !== b[field]) return false;
    }
    return true;
}

// A malformed MSPT row must not blank whatever surface hosts this box.
function MSPTBox(props) {
    return (
        <CardErrorBoundary fallback={null}>
            <MSPTBoxBody {...props} />
        </CardErrorBoundary>
    );
}

export default React.memo(MSPTBox, areMSPTBoxPropsEqual);
