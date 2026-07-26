import React from 'react';
import { Play } from 'lucide-react';
import SPImage from '../common/SPImage';
import { formatViews, FALLBACK_IMAGES, safeText, CardErrorBoundary } from './NewsBox';

function getYouTubeVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    // Handles youtube.com/shorts/ID, /embed/ID, /live/ID, watch?v=ID (v= in any
    // position), youtu.be/ID, and m.youtube.com variants of all of the above.
    const pathMatch = url.match(/(?:youtube\.com\/(?:shorts|embed|live)\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (pathMatch) return pathMatch[1];
    const watchMatch = url.match(/youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];
    return null;
}

function getReelThumbnail(reel) {
    if (typeof reel.thumbnail_url === 'string' && reel.thumbnail_url) return reel.thumbnail_url;
    const videoId = getYouTubeVideoId(reel.video_url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return FALLBACK_IMAGES.news;
}

// Mirrors the server-side title derivation in pages/api/news/reels.js:
// first caption line with any leading film-slate emoji (U+1F3AC) stripped.
function deriveTitle(reel) {
    const title = safeText(reel.title);
    if (title) return title;
    const caption = safeText(reel.caption);
    const firstLine = caption.split('\n')[0];
    const cleaned = firstLine.replace(/^\s*\u{1F3AC}?\uFE0F?\s*/u, '').trim();
    return cleaned || 'Poker Reel';
}

function ReelCardBody({ reel, onClick }) {
    if (!reel) return null;

    const openReel = () => {
        // Handler errors are outside the error boundary's reach — contain them.
        try {
            if (onClick) onClick();
        } catch (err) {
            console.warn('[ReelCard] onClick failed:', err?.message || err);
        }
    };

    // Get display values with proper fallbacks
    const thumbnailUrl = getReelThumbnail(reel);
    const displayTitle = deriveTitle(reel);
    const channelName =
        safeText(reel.channel_name) ||
        safeText(reel.profiles?.full_name) ||
        safeText(reel.profiles?.username) ||
        'Smarter.Poker';
    const videoUrl = safeText(reel.video_url);
    const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');

    // ACCESSIBILITY NOTE: unlike NewsBox, this card contains NO nested
    // interactive elements — the play overlay is a decorative aria-hidden div.
    // A div with role="button" + tabIndex + Enter/Space is therefore a valid
    // single interactive wrapper here and does NOT trip axe's
    // 'nested-interactive' rule. If a real <button> is ever added inside this
    // card, move the interaction to a stretched <button class="card-open">
    // sibling the way NewsBox does.
    return (
        <div
            className="reel-card"
            role="button"
            tabIndex={0}
            aria-label={`Play reel: ${displayTitle}`}
            onClick={openReel}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openReel();
                }
            }}
        >
            <div className="reel-thumbnail">
                <SPImage
                    src={thumbnailUrl}
                    alt={displayTitle}
                    fill
                    style={{ objectFit: 'cover' }}
                    onError={(e) => {
                        if (e?.target && e.target.src !== FALLBACK_IMAGES.news) {
                            e.target.src = FALLBACK_IMAGES.news;
                        }
                    }}
                />
                <div className="reel-overlay" aria-hidden="true">
                    <Play size={32} fill="#fff" color={isYouTube ? '#ff0000' : '#fff'} />
                </div>
                <div className="reel-channel">{channelName}</div>
            </div>
            <div className="reel-info">
                <h4>{displayTitle}</h4>
                <div className="reel-meta">
                    <span>{formatViews(reel.view_count || 0)} views</span>
                </div>
            </div>

            <style jsx>{`
                .reel-card {
                    position: relative;
                    background:
                        linear-gradient(135deg, rgba(30, 32, 38, 0.95) 0%, rgba(20, 22, 28, 0.98) 100%);
                    border: none;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
                }

                /* Chrome frame overlay for reel cards - border only, no glow */
                .reel-card::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 12px;
                    border: 5px solid rgba(180, 195, 220, 0.9);
                    box-shadow: none;
                    pointer-events: none;
                    z-index: 100;
                }

                .reel-card:hover {
                    box-shadow:
                        0 8px 32px rgba(236, 72, 153, 0.3);
                }

                .reel-card:hover::after {
                    border-color: rgba(236, 72, 153, 0.7);
                    box-shadow:
                        inset 0 0 10px rgba(236, 72, 153, 0.4),
                        0 0 15px rgba(236, 72, 153, 0.4);
                }

                .reel-card:focus-visible {
                    outline: 2px solid #5ef5f0;
                    outline-offset: 2px;
                }

                .reel-thumbnail {
                    position: relative;
                    aspect-ratio: 9/16;
                    overflow: hidden;
                }

                .reel-thumbnail :global(img) {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.3s;
                }

                .reel-card:hover .reel-thumbnail :global(img) {
                    transform: scale(1.05);
                }

                .reel-overlay {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.3);
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .reel-card:hover .reel-overlay,
                .reel-card:focus-visible .reel-overlay {
                    opacity: 1;
                }

                .reel-channel {
                    position: absolute;
                    bottom: 8px;
                    left: 8px;
                    right: 8px;
                    padding: 4px 8px;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(4px);
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 600;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .reel-info {
                    padding: 10px;
                }

                .reel-info h4 {
                    font-size: 12px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 4px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    line-height: 1.3;
                }

                .reel-meta {
                    font-size: 10px;
                    color: rgba(255, 255, 255, 0.5);
                }
            `}</style>
        </div>
    );
}

// MEMOISATION: pages/hub/news.js passes `onClick={() => openReelViewer(idx)}`,
// a brand-new function on every render, so the default shallow compare never
// bailed out. Compare only the reel fields this card reads. The callback is
// deliberately excluded — if a future handler closes over fast-changing state,
// wrap it in useCallback on the page rather than loosening this comparator.
const COMPARED_REEL_FIELDS = [
    'id',
    'title',
    'caption',
    'thumbnail_url',
    'video_url',
    'channel_name',
    'view_count'
];

export function areReelCardPropsEqual(prev, next) {
    if (prev === next) return true;
    const a = prev.reel;
    const b = next.reel;
    if (a === b) return true;
    if (!a || !b) return false;
    for (let i = 0; i < COMPARED_REEL_FIELDS.length; i++) {
        const field = COMPARED_REEL_FIELDS[i];
        if (a[field] !== b[field]) return false;
    }
    // profiles is only read for the channel label fallback
    if (a.profiles?.full_name !== b.profiles?.full_name) return false;
    if (a.profiles?.username !== b.profiles?.username) return false;
    return true;
}

// One malformed reel must not blank the carousel: contain it, render nothing
// for that slot rather than fabricating a placeholder reel.
function ReelCard(props) {
    return (
        <CardErrorBoundary key={props?.reel?.id ?? 'reel-card'} fallback={null}>
            <ReelCardBody {...props} />
        </CardErrorBoundary>
    );
}

export default React.memo(ReelCard, areReelCardPropsEqual);
