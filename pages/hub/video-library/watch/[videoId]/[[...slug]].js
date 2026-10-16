import ThumbnailImage from '../../../../../src/components/video-library/VideoThumbnail';
/**
 * VIDEO WATCH PAGE - /hub/video-library/watch/<youtube id>/<title-slug>
 *
 * Owner plan 2026-10-12, Phase 2 of 8: "a page for every video so Google can
 * find them". Before this, a video only existed as a popup over the library
 * (/hub/video-library?v=<id>), so no search engine could list a single video
 * and a shared link previewed as the generic library.
 *
 * Rendered on the server from the verified public catalog, so a crawler that
 * runs no JavaScript reads the title, channel, date, length and the related
 * videos, and Google reads a VideoObject. The visible privacy-enhanced
 * YouTube player is present in server HTML with autoplay disabled, so search
 * crawlers can discover it without clicking a facade.
 *
 * Rules carried over from the library: only rows that pass the catalog's
 * availability gate render (blocked, stale, non-embeddable or taken-down
 * videos are a 404); titles are cleaned the same way; sports and slots pages
 * exist for shared links but are not offered to search engines.
 *
 * The slug is cosmetic. Any slug renders the same page, and the canonical tag
 * names the one true address, so no redirect is ever needed.
 */
import { useEffect, useRef, useState } from 'react';
import PauseQuiz from '../../../../../src/components/video-library/PauseQuiz';
import PlayerLinks from '../../../../../src/components/video-library/PlayerLinks';
import { useAvatar } from '../../../../../src/contexts/AvatarContext';
import VideoQueue from '../../../../../src/components/video-library/VideoQueue';
import StudyStatus from '../../../../../src/components/video-library/StudyStatus';
import WatchTracking from '../../../../../src/components/video-library/WatchTracking';
import useVideoLibraryWatchTracking from '../../../../../src/hooks/useVideoLibraryWatchTracking';
import { claimEarnedWatchReward } from '../../../../../src/services/videoWatchHistory';
import useVideoLibraryQueue from '../../../../../src/components/video-library/useVideoLibraryQueue';
import { PLAYER_ORIGIN } from '../../../../../src/lib/videoLibraryPlayback.mjs';
import { videoLibrarySocialShareHref } from '../../../../../src/lib/videoLibrarySocialShare.mjs';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CHANNEL_KEY_RE } from '../../../../../src/lib/videoLibraryChannels.mjs';
import WatchPlaybackTools, { WatchDescription, subscribeWatchPlayer } from '../../../../../src/components/video-library/WatchPlaybackTools';
import { useYouTubeErrorManager } from '../../../../../src/hooks/useYouTubeErrorManager';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../../src/components/video-library/VideoLibrarySEOHead';
import HubPageShell from '../../../../../src/components/ui/HubPageShell';
import { getMenuConfig } from '../../../../../src/config/hamburgerMenus';
import {
    BLOCKED_VIDEO_LIBRARY_IDS,
    YOUTUBE_VIDEO_ID_RE,
    isVideoLibraryVideoAllowed,
} from '../../../../../src/lib/videoLibraryAvailability';
import {
    VIDEO_LIBRARY_POKER_TYPES,
    isCuratedFeedVideo,
    mixedContentFilter,
    durationSeconds,
} from '../../../../../src/lib/videoLibraryCuration.mjs';
import {
    VIDEO_ROW_FIELDS,
    VIDEO_TYPE_LABELS,
    buildVideoJsonLd,
    buildWatchDescription,
    isIndexableWatchVideo,
    normaliseVideoRow,
    readableDate,
    readableDuration,
    videoThumbnailUrl,
    watchPath,
    watchUrl,
} from '../../../../../src/lib/videoLibraryWatch.mjs';
import { formatViewCount, getVideoChannel, getVideoMetaLine } from '../../../../../src/lib/videoLibraryCards';

const UniversalHeader = dynamic(() => import('../../../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../../../src/components/ui/HamburgerMenu'), { ssr: false });

const RELATED_LIMIT = 8;
const CHANNEL_LIMIT = 6;

function pickCard(video) {
    const channel = getVideoChannel(video);
    return {
        videoId: video.videoId,
        title: video.title,
        duration: video.duration || '',
        thumbnail: video.thumbnail || null,
        href: watchPath(video),
        meta: getVideoMetaLine(video),
        channelName: channel.name,
    };
}

export async function getServerSideProps({ params, res }) {
    const videoId = String(params?.videoId || '');
    if (!YOUTUBE_VIDEO_ID_RE.test(videoId) || BLOCKED_VIDEO_LIBRARY_IDS.includes(videoId)) {
        res.setHeader('Cache-Control', 'public, s-maxage=60');
        return { notFound: true };
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Service role only: the public catalog view is not granted to the anon
    // role (checked 2026-10-12), so a public-key fallback would always fail.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        res.statusCode = 503;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Retry-After', '120');
        return { props: { unavailable: true } };
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: row, error } = await db
            .from('video_library_public_catalog')
            .select(VIDEO_ROW_FIELDS)
            .eq('youtube_video_id', videoId)
            .maybeSingle();
        if (error) throw error;

        const video = row ? normaliseVideoRow(row) : null;
        // The same gate the library uses: a fresh verification, embeddable,
        // a supported type, a readable title and the mixed-content rule.
        if (!video || !isVideoLibraryVideoAllowed(video) || !isCuratedFeedVideo(video)) {
            res.setHeader('Cache-Control', 'public, s-maxage=60');
            return { notFound: true };
        }

        const relatedTypes = VIDEO_LIBRARY_POKER_TYPES.includes(video.type) ? VIDEO_LIBRARY_POKER_TYPES : [video.type];
        const [channelResult, relatedResult] = await Promise.all([
            db.from('video_library_public_catalog')
                .select(VIDEO_ROW_FIELDS)
                .eq('source_id', video.source)
                .in('type', relatedTypes)
                .neq('youtube_video_id', videoId)
                .or(mixedContentFilter())
                .order('published_at', { ascending: false, nullsFirst: false })
                .limit(CHANNEL_LIMIT + 4),
            db.from('video_library_public_catalog')
                .select(VIDEO_ROW_FIELDS)
                .eq('type', video.type)
                .neq('source_id', video.source)
                .or(mixedContentFilter())
                .order('published_at', { ascending: false, nullsFirst: false })
                .limit(RELATED_LIMIT + 6),
        ]);
        const usable = (result, limit) => (result.error ? [] : (result.data || []))
            .map(normaliseVideoRow)
            .filter(item => isVideoLibraryVideoAllowed(item) && isCuratedFeedVideo(item))
            .slice(0, limit)
            .map(pickCard);
        if (channelResult.error) console.warn('[video-watch] channel videos unavailable:', channelResult.error.message);
        if (relatedResult.error) console.warn('[video-watch] related videos unavailable:', relatedResult.error.message);

        const channel = getVideoChannel(video);
        // Link only to a channel page that exists, at its canonical address.
        // video.source is often a legacy key (WSOP) that 308-redirects, or a
        // key with no registered channel at all (a 404): neither belongs in
        // crawlable HTML.
        let channelHref = null;
        if (CHANNEL_KEY_RE.test(String(video.source || ''))) {
            try {
                const { loadVideoLibraryChannels } = await import('../../../../../src/lib/server/videoLibraryChannels');
                const resolved = await loadVideoLibraryChannels({ channelId: video.source, limit: 1 });
                channelHref = resolved?.channel?.path || null;
            } catch (error) {
                channelHref = null;
            }
        }
        const description = buildWatchDescription(video, channel.name);
        res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
        return {
            props: {
                video: {
                    videoId: video.videoId,
                    source: video.source || null,
                    title: video.title,
                    type: video.type,
                    duration: video.duration || '',
                    views: video.views || '',
                    publishedAt: video.publishedAt || null,
                    thumbnail: video.thumbnail || null,
                    attributionUrl: video.attributionUrl || null,
                },
                channel,
                channelHref,
                description,
                canonical: watchPath(video),
                indexable: isIndexableWatchVideo(video),
                jsonLd: buildVideoJsonLd(video, { channelName: channel.name, description }),
                channelVideos: usable(channelResult, CHANNEL_LIMIT),
                relatedVideos: usable(relatedResult, RELATED_LIMIT),
            },
        };
    } catch (error) {
        console.warn('[video-watch] catalog read failed:', error?.message || error);
        res.statusCode = 503;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Retry-After', '120');
        return { props: { unavailable: true } };
    }
}

function Thumbnail({ videoId, size, vertical = false, catalogThumbnail, priority = false }) {
    return <ThumbnailImage video={{ videoId, thumbnail: catalogThumbnail }} size={size} vertical={vertical} priority={priority} />;
}

function VideoList({ title, videos }) {
    if (!videos?.length) return null;
    return (
        <section className="vl-watch-list" aria-label={title}>
            <h2 className="vl-up-next-label">{title}</h2>
            <ul>
                {videos.map(item => (
                    <li key={item.videoId}>
                        <Link href={item.href} className="vl-up-next-card">
                            <span className="vl-up-next-media">
                                <Thumbnail videoId={item.videoId} size="mqdefault" catalogThumbnail={item.thumbnail} />
                                {item.duration && <span className="vl-duration">{item.duration}</span>}
                            </span>
                            <span className="vl-up-next-copy">
                                <strong>{item.title}</strong>
                                <span>{item.meta}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default function VideoWatchPage({ unavailable, video, channel, channelHref = null, description, canonical, indexable, jsonLd, channelVideos, relatedVideos }) {
    const router = useRouter();
    const { user } = useAvatar();
    const playbackQueue = useVideoLibraryQueue(user?.id);
    const queueIndex = playbackQueue.queue.items.findIndex(item => item.videoId === video?.videoId);
    const nextQueued = queueIndex >= 0 ? playbackQueue.queue.items[queueIndex + 1] : null;
    const nextVideo = queueIndex >= 0 ? nextQueued : (relatedVideos?.[0] || channelVideos?.[0]);
    const openQueuedVideo = item => { if (!item) return; setNavigationError(false); void router.push(`${item.href || watchPath(item)}?play=1`).then(success => { if (!success) setNavigationError(true); }).catch(() => setNavigationError(true)); };
    const iframeRef = useRef(null);
    const [miniPlayer, setMiniPlayer] = useState(false);
    const [quizMarkers, setQuizMarkers] = useState([]);
    useEffect(() => { setQuizMarkers([]); }, [video?.videoId, user?.id]);
    const [autoplayNext, setAutoplayNext] = useState(true);
    const [navigationError, setNavigationError] = useState(false);
    const attemptPlayback = router.query.play === '1';
    useEffect(() => { setMiniPlayer(false); }, [video?.videoId]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [shareState, setShareState] = useState('idle');
    const { ytError, errorInfo } = useYouTubeErrorManager({ active: Boolean(video) && !unavailable, videoId: video?.videoId, iframeRef, surface: 'VideoWatchPage', autoActionDelay: 0 });
    const tracking = useVideoLibraryWatchTracking({ iframeRef, video: { ...video, durationSeconds: durationSeconds(video?.duration) }, ownerId: user?.id, active: Boolean(video) && !unavailable && !ytError });
    // A visit after a lifecycle-flushed qualifying session asks the existing,
    // server-verified reward endpoint once; no client-side reward rule.
    useEffect(() => {
        if (tracking.status === 'ready') claimEarnedWatchReward(user?.id, video?.videoId, tracking.savedSeconds);
    }, [tracking.status, tracking.savedSeconds, user?.id, video?.videoId]);
    // Saved progress never changes the mounted iframe URL. Resume is an
    // explicit seek/play command, and only real provider PLAYING events earn time.
    const commandPlayer = (func, args = []) => iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }), PLAYER_ORIGIN);
    const resumeWatching = () => {
        if (document.hidden || !(tracking.resumeSeconds > 0)) return;
        commandPlayer('seekTo', [tracking.resumeSeconds, true]);
        commandPlayer('playVideo');
    };
    const closePlayer = () => { commandPlayer('pauseVideo'); setMiniPlayer(false); };
    // The library menu, minus its player settings (autoplay and captions
    // belong to the library's own player, not this page).
    const libraryMenu = getMenuConfig('video-library', null, {}, {});
    const menuItems = (libraryMenu.menuItems || [])
        .filter(item => item.type !== 'toggle' && !(item.type === 'section' && item.label === 'Settings'))
        .filter((item, index, items) => !(item.type === 'divider' && (index === items.length - 1 || items[index + 1]?.type === 'divider')));
    const menuConfig = { ...libraryMenu, menuItems };

    const header = (
        <div className="vl-header-area">
            <div className="vl-global-header">
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />
            </div>
        </div>
    );

    if (unavailable || !video) {
        return (
            <>
                <SEOHead title="Video Temporarily Unavailable" description="This Video Page Could Not Load Right Now. Try Again In A Minute." noindex />
                <div className="video-library-page">
                    <HubPageShell className="video-library" maxWidth={1760} header={header}>
                        <div className="vl-empty-state">
                            <span className="vl-empty-kicker">Video Library</span>
                            <h1>This Video Could Not Load Right Now</h1>
                            <p>The Video Catalog Did Not Answer. Try Again In A Minute, Or Browse The Library.</p>
                            <Link href="/hub/video-library" className="vl-pill-button is-primary">Browse The Video Library</Link>
                        </div>
                    </HubPageShell>
                </div>
            </>
        );
    }

    const seconds = durationSeconds(video.duration);
    const views = formatViewCount(video.views);
    const published = readableDate(video.publishedAt);
    const typeLabel = VIDEO_TYPE_LABELS[video.type] || 'Poker';
    const libraryHref = `/hub/video-library?v=${encodeURIComponent(video.videoId)}`;

    const share = async () => {
        const url = watchUrl(video);
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share({ title: video.title, url });
                setShareState('shared');
                return;
            }
            await navigator.clipboard.writeText(url);
            setShareState('copied');
        } catch (error) {
            if (error?.name === 'AbortError') return;
            setShareState('failed');
        }
    };

    return (
        <>
            <SEOHead
                title={`${video.title} | ${channel.name}`}
                description={description}
                canonical={canonical}
                ogImage={videoThumbnailUrl(video)}
                ogType="video.other"
                noindex={!indexable}
                jsonLd={jsonLd}
            />
            <div className="video-library-page">
                <HubPageShell className="video-library" maxWidth={1760} header={header}>
                    <article className="vl-watch-page" data-video-id={video.videoId}>
                        <nav className="vl-breadcrumbs" aria-label="Breadcrumb">
                            <Link href="/hub">World Hub</Link>
                            <span aria-hidden="true">/</span>
                            <Link href="/hub/video-library">Video Library</Link>
                            <span aria-hidden="true">/</span>
                            <span aria-current="page">{video.title}</span>
                        </nav>

                        <div className="vl-watch-page-grid">
                            <div className="vl-watch-page-main">
                                <div className={`vl-player-stage vl-watch-page-player${miniPlayer ? ' is-mini-player' : ''}${seconds > 0 && seconds <= 180 ? ' is-vertical-player' : ''}`}>
                                    <iframe
                                        key={video.videoId}
                                        ref={iframeRef}
                                        onLoad={event => subscribeWatchPlayer(event.currentTarget, attemptPlayback)}
                                        src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=0&rel=0&playsinline=1&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker')}`}
                                        title={video.title}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                                        referrerPolicy="strict-origin-when-cross-origin"
                                        allowFullScreen
                                    />
                                    {ytError && <div className="vl-playback-error" role="alert"><p>{errorInfo?.description}</p><button type="button" onClick={closePlayer}>Close Player</button></div>}
                                    {miniPlayer && <div className="vl-mini-controls"><button type="button" onClick={() => setMiniPlayer(false)}>Expand Player</button><button type="button" onClick={closePlayer}>Close Player</button></div>}
                                </div>
                                <WatchPlaybackTools key={`tools:${video.videoId}:${user?.id || 'anonymous'}`} iframeRef={iframeRef} active={!ytError} attemptPlayback={attemptPlayback}
                                    onMarkersChange={setQuizMarkers}
                                    duration={seconds} nextTitle={nextVideo?.title}
                                    onNext={() => openQueuedVideo(queueIndex >= 0 ? playbackQueue.advance(video.videoId) : nextVideo)}
                                    autoplay={autoplayNext} onAutoplayChange={setAutoplayNext}
                                    mini={miniPlayer} onMiniChange={setMiniPlayer} />
                                {VIDEO_LIBRARY_POKER_TYPES.includes(video.type) && <PauseQuiz key={`quiz:${video.videoId}:${user?.id || 'anonymous'}`} iframeRef={iframeRef} videoId={video.videoId} active={!ytError} markers={quizMarkers} />}
                                {tracking.status === 'ready' && tracking.resumeSeconds > 0 && <button type="button" className="vl-pill-button" onClick={resumeWatching}>Resume Saved Position</button>}
                                <WatchTracking tracking={tracking} ownerId={user?.id} returnPath={watchPath(video)} />

                                {playbackQueue.error && <p role="alert">{playbackQueue.error}</p>}
                                {navigationError && <p role="alert">The Next Video Could Not Open. Choose A Video Below To Try Again.</p>}
                                <div className="vl-info-copy">
                                    <h1 id="vl-watch-title">{video.title}</h1>
                                    <p className="vl-info-meta">{[views, published, readableDuration(seconds)].filter(Boolean).join(' · ')}</p>
                                    <PlayerLinks video={video} />
                                </div>

                                <div className="vl-info-channel">
                                    <span className="vl-avatar" aria-hidden="true">
                                        {channel.logo ? <img src={channel.logo} alt="" loading="lazy" decoding="async" /> : <span>{channel.initials}</span>}
                                    </span>
                                    {channelHref ? <Link className="vl-info-source vl-channel-link" href={channelHref}>{channel.name}</Link> : <span className="vl-info-source">{channel.name}</span>}
                                </div>

                                <div className="vl-hud" role="group" aria-label="Video actions">
                                    <Link href={videoLibrarySocialShareHref(video)} className="vl-hud-link">Share To Feed</Link>
                                    <button type="button" disabled={!(relatedVideos[0] || channelVideos[0])} onClick={() => playbackQueue.enqueueNext(relatedVideos[0] || channelVideos[0], video)}>Queue Next Video</button>
                                    <Link href={libraryHref} className="vl-hud-link is-primary">Save, Playlists And Training</Link>
                                    <button type="button" onClick={share}>
                                        {shareState === 'copied' ? 'Link Copied' : shareState === 'failed' ? 'Copy Failed' : 'Share'}
                                    </button>
                                    <a
                                        className="vl-hud-link"
                                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Watch On YouTube
                                    </a>
                                </div>

                                <section className="vl-watch-about" aria-labelledby="vl-watch-about-title">
                                    <h2 id="vl-watch-about-title">About This Video</h2>
                                    <WatchDescription key={video.videoId} text={description} />
                                    <dl>
                                        <div><dt>Channel</dt><dd>{channelHref ? <Link href={channelHref}>{channel.name}</Link> : channel.name}</dd></div>
                                        <div><dt>Type</dt><dd><Link href={`/hub/video-library?type=${encodeURIComponent(video.type)}`}>{typeLabel}</Link></dd></div>
                                        {published && <div><dt>Published</dt><dd>{published}</dd></div>}
                                        {seconds > 0 && <div><dt>Length</dt><dd>{readableDuration(seconds)}</dd></div>}
                                        {views && <div><dt>Views On YouTube</dt><dd>{views.replace(/\s*Views$/i, '')}</dd></div>}
                                    </dl>
                                </section>
                            </div>

                            <aside className="vl-watch-page-side">
                                <VideoQueue currentVideoId={video.videoId} ownerId={user?.id} onPlay={openQueuedVideo} />
                                <StudyStatus />
                                <VideoList title={`More From ${channel.name}`} videos={channelVideos} />
                                <VideoList title="Related Videos" videos={relatedVideos} />
                                <Link href="/hub/video-library" className="vl-show-more">Browse The Full Video Library</Link>
                            </aside>
                        </div>
                    </article>
                </HubPageShell>
            </div>
        </>
    );
}
