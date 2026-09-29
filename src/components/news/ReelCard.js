import React, { useEffect, useState } from 'react';
import SPImage from '../common/SPImage';
import { safeText, CardErrorBoundary } from './NewsBox';
import { getYouTubeVideoId } from '../../lib/socialHelpers';

function getReelThumbnail(reel) {
    if (typeof reel.thumbnail_url === 'string' && reel.thumbnail_url.trim()) {
        return reel.thumbnail_url.trim();
    }
    const videoId = getYouTubeVideoId(reel.video_url);
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
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

export function formatReelViews(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return '0';
    if (count < 1000) return String(Math.floor(count));

    const divisor = count >= 1000000 ? 1000000 : 1000;
    const suffix = count >= 1000000 ? 'M' : 'K';
    const floored = Math.floor((count / divisor) * 10) / 10;
    return `${String(floored).replace(/\.0$/, '')}${suffix}`;
}

function ReelCardBody({ reel, onClick }) {
    const thumbnailUrl = reel ? getReelThumbnail(reel) : '';
    const [posterFailed, setPosterFailed] = useState(false);

    useEffect(() => {
        setPosterFailed(false);
    }, [thumbnailUrl]);

    if (!reel) return null;

    const displayTitle = deriveTitle(reel);
    const channelName =
        safeText(reel.channel_name) ||
        safeText(reel.profiles?.full_name) ||
        safeText(reel.profiles?.username) ||
        'Smarter.Poker';

    const openReel = () => {
        try {
            if (onClick) onClick();
        } catch (err) {
            console.warn('[ReelCard] onClick failed:', err?.message || err);
        }
    };

    return (
        <button
            className="news-reel-scan"
            type="button"
            aria-label={`Play Reel: ${displayTitle}`}
            onClick={openReel}
        >
            <span className="news-reel-scan__media">
                {thumbnailUrl && !posterFailed ? (
                    <SPImage
                        src={thumbnailUrl}
                        alt=""
                        fill
                        sizes="(max-width: 600px) 40vw, (max-width: 1024px) 24vw, 190px"
                        style={{ objectFit: 'cover' }}
                        onError={() => setPosterFailed(true)}
                    />
                ) : (
                    <span className="news-reel-scan__missing">Poster Unavailable</span>
                )}
            </span>
            <span className="news-reel-scan__title">{displayTitle}</span>
            <span className="news-reel-scan__meta">
                <span>{channelName}</span>
                <span>{formatReelViews(reel.view_count)} Views</span>
            </span>

            <style jsx>{`
                .news-reel-scan {
                    appearance: none;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    width: 100%;
                    min-width: 0;
                    min-height: 44px;
                    margin: 0;
                    padding: 0;
                    overflow: visible;
                    border: 0;
                    background: transparent;
                    color: #e4e7ec;
                    font-family: var(--font-inter, Inter), system-ui, sans-serif;
                    text-align: start;
                    cursor: pointer;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }

                .news-reel-scan:focus-visible {
                    outline: 3px solid #8fd4ff;
                    outline-offset: 4px;
                }

                .news-reel-scan:active .news-reel-scan__media {
                    opacity: 0.78;
                }

                .news-reel-scan__media {
                    position: relative;
                    display: grid;
                    place-items: center;
                    width: 100%;
                    aspect-ratio: 9 / 16;
                    overflow: hidden;
                    background: #000;
                }

                .news-reel-scan__missing {
                    max-width: 12ch;
                    color: #9aa5b3;
                    font-family: 'Roboto Condensed', var(--font-rajdhani, 'Arial Narrow'), sans-serif;
                    font-size: clamp(12px, 3.2vw, 15px);
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    line-height: 1.35;
                    text-align: center;
                    text-transform: uppercase;
                }

                .news-reel-scan__title {
                    display: -webkit-box;
                    min-width: 0;
                    overflow: hidden;
                    color: #f4f7fb;
                    font-size: clamp(13px, 3.5vw, 16px);
                    font-weight: 700;
                    line-height: 1.3;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;
                }

                .news-reel-scan__meta {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    gap: 4px 10px;
                    min-width: 0;
                    color: #9aa5b3;
                    font-size: clamp(12px, 3vw, 14px);
                    font-weight: 600;
                    line-height: 1.35;
                }

                .news-reel-scan__meta > span {
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                @media (min-width: 769px) {
                    .news-reel-scan__missing {
                        font-size: 14px;
                    }

                    .news-reel-scan__title {
                        font-size: 15px;
                    }

                    .news-reel-scan__meta {
                        font-size: 12px;
                    }
                }
            `}</style>
        </button>
    );
}

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
    // The callback identifies the reel's current position. If SWR reorders the
    // feed, retaining the old closure would open the wrong reel.
    if (prev.onClick !== next.onClick) return false;
    const a = prev.reel;
    const b = next.reel;
    if (a === b) return true;
    if (!a || !b) return false;
    for (let i = 0; i < COMPARED_REEL_FIELDS.length; i++) {
        const field = COMPARED_REEL_FIELDS[i];
        if (a[field] !== b[field]) return false;
    }
    if (a.profiles?.full_name !== b.profiles?.full_name) return false;
    if (a.profiles?.username !== b.profiles?.username) return false;
    return true;
}

// One malformed reel must not blank the surrounding console.
function ReelCard(props) {
    return (
        <CardErrorBoundary key={props?.reel?.id ?? 'reel-card'} fallback={null}>
            <ReelCardBody {...props} />
        </CardErrorBoundary>
    );
}

export default React.memo(ReelCard, areReelCardPropsEqual);
