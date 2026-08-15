/**
 * SharedVideoComponents — Extracted from social-media/index.js L214-811
 * VideoThumbnail, VideoPostWrapper, FullScreenVideoViewer
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SOCIAL_COLORS as C,
  isYouTubeUrl,
  getYouTubeVideoId,
  getYouTubeEmbedUrl,
  getYouTubeThumbnail,
} from '../../lib/socialHelpers';
import { useYouTubeErrorManager, YouTubeErrorOverlay } from '../../hooks/useYouTubeErrorManager';
import toast from '../../stores/toastStore';

// ═══════════════════════════════════════════════════════════════════════════
// YOUTUBE POSTER LADDER (2026-08-15 poster-quality fix, per Dan)
// ═══════════════════════════════════════════════════════════════════════════
// Every feed video tile postered from hqdefault.jpg — a 480×360 4:3 frame
// with letterbox bars — upscaled to a ~740px card: grainy AND distorted.
// (A 2026-05-07 re-encode job also nulled thumbnail_url on 2,372 reels, so
// nearly every YT post fell into this path.) This ladder starts at
// maxresdefault (1280×720, true 16:9) and steps down only when YouTube
// doesn't have the size: maxres → sd → hq. YouTube sometimes serves a
// 120×90 grey placeholder instead of a 404 for a missing size, so onLoad
// treats that as a miss too.

const YT_POSTER_FILES = ['maxresdefault.jpg', 'sddefault.jpg', 'hqdefault.jpg'];

export function YouTubePosterImg({ videoId, alt = '', style = {}, onLoadValid, onExhausted, ...props }) {
  const [rung, setRung] = useState(0);
  useEffect(() => { setRung(0); }, [videoId]);
  const exhaustedRef = useRef(false);
  useEffect(() => { exhaustedRef.current = false; }, [videoId]);

  if (!videoId || rung >= YT_POSTER_FILES.length) return null;
  const src = `https://img.youtube.com/vi/${videoId}/${YT_POSTER_FILES[rung]}`;

  const advance = () => {
    setRung((r) => {
      const next = r + 1;
      if (next >= YT_POSTER_FILES.length && !exhaustedRef.current) {
        exhaustedRef.current = true;
        if (onExhausted) onExhausted();
      }
      return next;
    });
  };

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={style}
      onError={advance}
      onLoad={(e) => {
        const img = e.target;
        if (img.naturalWidth <= 120 && img.naturalHeight <= 90) advance();
        else if (onLoadValid) onLoadValid(e);
      }}
      {...props}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO THUMBNAIL - Robust with fallback for invalid YouTube IDs
// ═══════════════════════════════════════════════════════════════════════════

export function VideoThumbnail({ url, style = {}, onValidated }) {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isValid, setIsValid] = useState(null);
  const imgRef = useRef(null);
  // 2026-08-15 poster-quality fix: render via the maxres→sd→hq ladder
  // (see YouTubePosterImg above) instead of pinning 480×360 hqdefault.
  const ladderVideoId = getYouTubeVideoId(url);
  const thumbnailUrl = getYouTubeThumbnail(url);

  const FallbackUI = ({ showUnavailable = false }) => (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        ...style,
      }}
    >
      <span style={{ fontSize: 48, marginBottom: 8 }}></span>
      <span style={{ fontSize: 14, opacity: 0.8 }}>
        {showUnavailable ? 'Video Unavailable' : 'Video'}
      </span>
    </div>
  );

  if (thumbnailError || !thumbnailUrl) {
    return <FallbackUI showUnavailable={thumbnailError} />;
  }

  const handleLoad = (e) => {
    setIsLoaded(true);
    const img = e.target;
    const isInvalid = img.naturalWidth <= 120 && img.naturalHeight <= 90;
    if (isInvalid) {
      setThumbnailError(true);
      setIsValid(false);
      if (onValidated) onValidated(false);
    } else {
      setIsValid(true);
      if (onValidated) onValidated(true);
    }
  };

  const handleError = () => {
    setThumbnailError(true);
    setIsValid(false);
    if (onValidated) onValidated(false);
  };

  return (
    <>
      {!isLoaded && !thumbnailError && <FallbackUI />}
      <YouTubePosterImg
        videoId={ladderVideoId}
        alt="Video Thumbnail"
        // eager, NOT lazy: this img is display:none until it loads, and a
        // lazy image that never intersects the viewport never loads — the
        // FallbackUI gradient would show forever.
        loading="eager"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: isLoaded && !thumbnailError ? 'block' : 'none',
          ...style,
        }}
        onLoadValid={handleLoad}
        onExhausted={handleError}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO POST WRAPPER - Handles click behavior based on video validity
// ═══════════════════════════════════════════════════════════════════════════

export function VideoPostWrapper({ url, onValidVideoClick, children }) {
  const [isVideoValid, setIsVideoValid] = useState(null);

  const handleClick = () => {
    if (isVideoValid === false) {
      toast.error('This video is no longer available on YouTube.');
      return;
    }
    if (onValidVideoClick) onValidVideoClick(url);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        cursor: isVideoValid === false ? 'not-allowed' : 'pointer',
        aspectRatio: '16/9',
        maxHeight: 400,
        background: '#000',
        overflow: 'hidden',
      }}
    >
      {isYouTubeUrl(url) ? (
        <VideoThumbnail url={url} onValidated={(valid) => setIsVideoValid(valid)} />
      ) : (
        children
      )}

      {isVideoValid !== false && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.9)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#333',
            fontSize: 28,
            pointerEvents: 'none',
            transition: 'transform 0.15s, background 0.15s',
          }}
        >
          ▶
        </div>
      )}

      {isVideoValid === false && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(100,100,100,0.6)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              fontSize: 28,
              pointerEvents: 'none',
            }}
          ></div>
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              background: 'rgba(200,50,50,0.8)',
              padding: '4px 10px',
              borderRadius: 4,
              color: 'white',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Video unavailable
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED VIDEO POSTER - Self-healing thumbnail tile for the social feed.
// ═══════════════════════════════════════════════════════════════════════════
//
// FEED-VIDEO-POSTER-2026-05-07 (per Dan, after ~10 prior "fixes" on the same
// symptom: "why when you upload a video is it still giving the black screen
// with play button instead of using the selected or uploaded thumbnail?!"):
//
// Three distinct upstream failure modes all manifest identically as
// "black + play button" on the feed:
//   1. thumbnail_url is NULL (live replay posts; thumbnail upload silent-fail
//      in SharedPostCreator; mid-publish race before cron back-fills it).
//   2. thumbnail_url is populated but the image 404s / CORS-fails / is slow
//      — the previous renderer's <img background:#000 alt=""> showed black
//      with no broken-image icon, so the user couldn't tell.
//   3. Fallback used <video src + #t=0.001> — iOS Safari refuses to decode
//      that fragment without playback, leaving a black <video> element.
//
// VideoPostWrapper sits ABOVE this component and unconditionally draws a
// white play button overlay, so all three modes render as black + play.
//
// This component fixes all three in one place:
//   • Render <img src={thumbnailUrl}> first — cheap, cacheable, the
//     happy path.
//   • On <img onError>, fall through to <video> (so #2 above stops being
//     a silent black tile).
//   • The <video> uses IntersectionObserver autoplay (the same trick
//     FeedVideoPlayer in SmarterPokerStyleCard uses) — when the tile
//     scrolls into view, video.play() forces iOS Safari to decode the
//     first frame. Combined with poster={thumbnailUrl} as belt-and-
//     suspenders, even if autoplay is blocked by data-saver / Reduced
//     Motion / Low Power Mode, the poster still renders.
//   • muted + playsInline + loop are required for iOS auto-decode.
//
// This is intentionally tolerant: if every layer fails (network down,
// blob:// URL, malformed src) the worst case is the same black tile we
// had before — never worse.

export function FeedVideoPoster({ videoUrl, thumbnailUrl }) {
  const [imgFailed, setImgFailed] = useState(false);
  // FEED-VIDEO-POSTER-2026-05-08 audit Pass 4 fix B5 — defensive depth.
  // When BOTH thumbnail and video URLs fail to load, render a gradient
  // placeholder instead of a broken <video> element. The black <video>
  // background + VideoPostWrapper's play button overlay would otherwise
  // re-create the original "black tile + play button" symptom for this
  // dead-pipeline case.
  const [videoFailed, setVideoFailed] = useState(false);
  // FEED-VIDEO-POSTER-2026-05-08-Round2 audit Pass 3 fix B7 — separate
  // failure state for the YT-id-derived hqdefault.jpg fallback. The prior
  // code reused setImgFailed for BOTH the user-supplied thumbnail AND the
  // YT-derived poster: when both 404'd, the second onError called
  // setImgFailed(true) on a state already true, React bailed out, and the
  // broken <img> stayed stuck on screen with VideoPostWrapper's play
  // overlay = the original "black + play" symptom we shipped this
  // component to eliminate.
  const [ytPosterFailed, setYtPosterFailed] = useState(false);
  const videoRef = useRef(null);

  // FEED-VIDEO-POSTER-2026-05-08 audit Pass 1 fix B3 — reset imgFailed when
  // thumbnailUrl changes. Without this, after a transcode worker backfills
  // a missing thumbnail (e.g., the 749 YT-reel re-encode jobs queued
  // 2026-05-07 will write fresh thumbnail_url values via realtime), the
  // component stays stuck in Branch 2 forever because imgFailed=true never
  // resets. The next img attempt with the fresh URL is exactly what we want.
  // Same logic for videoFailed when videoUrl prop changes, and ytPosterFailed
  // when videoUrl changes (because the YT id is derived from videoUrl).
  useEffect(() => {
    setImgFailed(false);
  }, [thumbnailUrl]);
  useEffect(() => {
    setVideoFailed(false);
    setYtPosterFailed(false);
  }, [videoUrl]);

  // IntersectionObserver autoplay forces iOS Safari to decode the first
  // frame of the <video> element. Without this, Safari ignores #t=0.001
  // and renders pure black until the user taps play — exactly the bug
  // Dan kept reporting.
  //
  // FEED-VIDEO-POSTER-2026-05-08 audit Pass 1 fix B1 — `imgFailed` MUST be
  // in the deps array. On mount: Branch 1 renders, videoRef is null, this
  // effect early-returns. When img onError flips imgFailed → true, Branch 2
  // mounts a fresh <video>, but without imgFailed in deps, the effect
  // doesn't re-run, so NO observer attaches → no autoplay → iOS Safari
  // shows the same pure black tile we shipped this component to fix.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof IntersectionObserver === 'undefined') return; // SSR / older browsers
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Best-effort: if autoplay is blocked, poster still shows.
            video.play().catch(() => {
              /* silenced — poster handles fallback */
            });
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.5 }
    );
    obs.observe(video);
    return () => {
      obs.unobserve(video);
      obs.disconnect();
    };
    // FEED-VIDEO-POSTER-2026-05-08 audit Pass 3 fix B6 — videoFailed MUST
    // be in the deps array. When the <video> errors and we flip to the
    // gradient placeholder, we want the prior observer to be torn down
    // (cleanup fires) so it doesn't keep referencing the unmounted
    // <video> element. Without this, IntersectionObserver lives outside
    // React's lifecycle and would leak until the component unmounts.
    //
    // FEED-VIDEO-POSTER-2026-05-08-Round2 audit Pass 4 fix B8 — thumbnailUrl
    // MUST also be in the deps array. The Branch 1↔Branch 2 discriminator
    // is `thumbnailUrl && !imgFailed`. When realtime UPDATE clears
    // thumbnail_url to NULL (e.g., the in-flight 749 transcode jobs queued
    // 2026-05-07 by reencode_low_quality_youtube_reels_targeted, which set
    // thumbnail_url=NULL on 2,372 reels and propagates to social_posts via
    // m7_2_mirror_all_video_posts), the component transitions Branch 1
    // (img) → Branch 2 (video) but imgFailed stays false. Without
    // thumbnailUrl in deps, this effect doesn't re-run — videoRef.current
    // was null on the prior render's <img> branch and bailed out, and now
    // that videoRef.current points at the fresh <video>, no observer
    // attaches → no autoplay-on-scroll → iOS Safari shows pure black.
    // Adding thumbnailUrl makes the effect re-run on every Branch 1↔2
    // transition. Cost: redundant re-runs when thumbnailUrl mutates while
    // we're in Branch 1 (img). Those re-runs early-return at `if (!video)`
    // because videoRef.current is still null. Cheap.
  }, [videoUrl, imgFailed, videoFailed, thumbnailUrl]);

  // FEED-VIDEO-POSTER-2026-05-08 audit Pass 1 fix B4 — YouTube URLs cannot
  // render inside a <video> element (they require an iframe). The 1-up
  // call site is gated by VideoPostWrapper which short-circuits to
  // VideoThumbnail for YT URLs, but the 2-up call site at
  // pages/hub/social-media/index.js:1692 bypasses VideoPostWrapper and
  // hands the URL directly to FeedVideoPoster. If a 2-up post has a YT
  // first tile, the original Branch 2 code below would stuff a YT URL
  // into <video src> and produce a broken element. Guard it here so both
  // call sites are safe.
  const isYouTube = !!(videoUrl && typeof videoUrl === 'string' && isYouTubeUrl(videoUrl));
  if (isYouTube) {
    // FEED-VIDEO-POSTER-2026-05-08-Round2 audit Pass 3 fix B7 — try the
    // user-supplied thumbnail FIRST (highest fidelity), then independently
    // try the YT-id-derived hqdefault.jpg using a separate failure flag
    // (ytPosterFailed). The prior single-state design caused an infinite
    // broken-img stuck-state when both URLs 404'd — see comment block
    // above the useState declarations for the full root-cause writeup.
    if (thumbnailUrl && !imgFailed) {
      return (
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
          onError={() => setImgFailed(true)}
        />
      );
    }
    const ytId = getYouTubeVideoId(videoUrl);
    if (ytId && !ytPosterFailed) {
      // 2026-08-15 poster-quality fix: maxres→sd→hq ladder replaces the
      // pinned 480×360 hqdefault (grainy at card width). onExhausted keeps
      // the exact ytPosterFailed semantics the B7 fix established.
      return (
        <YouTubePosterImg
          videoId={ytId}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
          onExhausted={() => setYtPosterFailed(true)}
        />
      );
    }
    // YT id missing OR YT-derived poster also failed — render gradient,
    // NEVER fall through to <video> below (YT URLs cannot render in
    // <video> elements; they require iframes via VideoPostWrapper).
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        }}
      />
    );
  }

  // Branch 1 — happy path: we have a thumbnail URL and it hasn't errored yet.
  // VideoPostWrapper draws the play button overlay above this img.
  if (thumbnailUrl && !imgFailed) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  // FEED-VIDEO-POSTER-2026-05-08 audit Pass 4 fix B5 — video pipeline failed.
  // Once the <video> element fires onError, that src is dead — re-rendering
  // it would just produce the same broken element + VideoPostWrapper's play
  // overlay = "black tile + play button" (the original symptom). Render a
  // gradient placeholder instead. The check is `videoFailed` alone (not
  // `imgFailed && videoFailed`): when thumbnailUrl is null we skip Branch 1
  // entirely so imgFailed stays false even though we still want the gradient
  // when video errors. The user can still tap the parent for full playback
  // navigation (parent's onClick handler is unaffected by this branch).
  if (videoFailed) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        }}
      />
    );
  }

  // Branch 2 — fallback: no thumbnail URL OR the img errored.
  // Use autoplay-on-scroll <video> with poster as belt-and-suspenders.
  // Append #t=0.001 only when the URL is a real http(s) src that doesn't
  // already carry a time fragment, so we don't break blob: URLs or videos
  // that already use a fragment.
  const playableSrc =
    videoUrl &&
    typeof videoUrl === 'string' &&
    !videoUrl.startsWith('blob:') &&
    !videoUrl.includes('#t=')
      ? `${videoUrl}#t=0.001`
      : videoUrl;

  return (
    <video
      ref={videoRef}
      src={playableSrc}
      // FEED-VIDEO-POSTER-2026-05-08 audit Pass 1 fix B2 — don't hand the
      // browser a poster URL we KNOW just 404'd as <img>. Reusing it as
      // poster causes the same fetch failure twice and produces the same
      // black tile we shipped this component to eliminate.
      poster={imgFailed ? undefined : thumbnailUrl || undefined}
      preload="metadata"
      muted
      playsInline
      loop
      // FEED-VIDEO-POSTER-2026-05-08 audit Pass 4 fix B5 — flag <video>
      // load failures so the gradient-placeholder branch above renders
      // on the next pass.
      onError={() => setVideoFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL SCREEN VIDEO VIEWER - TikTok/Reels style immersive viewer
// ═══════════════════════════════════════════════════════════════════════════

export function FullScreenVideoViewer({
  videoUrl,
  author,
  caption,
  onClose,
  onLike,
  onComment,
  onShare,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shareToast, setShareToast] = useState(false);

  const overlayTimerRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const progressRAF = useRef(null);
  // BUG FIX (SVC-1): track showHeart dismiss timer — prevents setState-after-unmount
  // when user double-taps and navigates away within 800ms.
  const showHeartTimerRef = useRef(null);
  // BUG FIX (SVC-2): track YouTube onLoad retry timers — prevents stale postMessage
  // to a closed/unmounted iframe after the user closes the viewer within 1500ms.
  const ytOnLoadTimersRef = useRef([]);
  // BUG FIX (SVC-3): track shareToast dismiss timer — prevents setState-after-unmount
  // when the user shares then immediately closes the viewer within 2000ms.
  const shareToastTimerRef = useRef(null);

  // Centralized YouTube error management
  const ytVideoId = isYouTubeUrl(videoUrl) ? getYouTubeVideoId(videoUrl) : null;
  const {
    ytError: managedYtError,
    errorInfo,
    thumbnailUrl,
  } = useYouTubeErrorManager({
    active: !!ytVideoId,
    videoId: ytVideoId,
    surface: 'FullScreenVideoViewer',
    autoActionDelay: 3000,
    onError: () => onClose?.(),
  });

  useEffect(() => {
    if (showOverlay && isPlaying) {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 5000);
    }
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [showOverlay, isPlaying]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      // Cancel any running progress RAF to prevent memory leak
      if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
      // BUG FIX (SVC-1/2/3): cancel all tracked timers on unmount
      clearTimeout(showHeartTimerRef.current);
      clearTimeout(shareToastTimerRef.current);
      ytOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
      ytOnLoadTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleTouchStart = (e) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const handleTouchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
        onClose();
      }
    };
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onClose]);

  const handleTap = (e) => {
    const now = Date.now();
    const DOUBLE_TAP_WINDOW = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_WINDOW) {
      onLike?.();
      try {
        navigator?.vibrate?.(15);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
      setShowHeart(true);
      // BUG FIX (SVC-1): cancel previous heart timer before scheduling a new one.
      if (showHeartTimerRef.current) clearTimeout(showHeartTimerRef.current);
      showHeartTimerRef.current = setTimeout(() => {
        showHeartTimerRef.current = null;
        setShowHeart(false);
      }, 800);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    // Single tap = reveal overlay + toggle play/pause simultaneously
    // BUG FIX: Previously first tap only showed overlay (no play/pause toggle),
    // requiring a second tap to actually play/pause the video.
    setShowOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 5000);

    const isYT = isYouTubeUrl(videoUrl);
    if (!isYT && videoRef.current) {
      if (videoRef.current.paused) {
        // Don't assert playing until the promise resolves — a rejected
        // play() (autoplay policy) used to leave the UI claiming playback.
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
        // Paused = anchor overlay (don't auto-hide)
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      }
    } else if (isYT) {
      const iframe = containerRef.current?.querySelector('iframe');
      if (iframe?.contentWindow) {
        if (!isPlaying) {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
          setIsPlaying(true);
        } else {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
            '*'
          );
          setIsPlaying(false);
          if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        }
      }
    }
  };

  const updateProgress = () => {
    if (videoRef.current && videoRef.current.duration) {
      setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
    }
    progressRAF.current = requestAnimationFrame(updateProgress);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#000',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={handleTap}
    >
      {/* Close Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10001,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(10px)',
          border: 'none',
          cursor: 'pointer',
          color: 'white',
          fontSize: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>

      {/* Video */}
      {isYouTubeUrl(videoUrl) ? (
        <div
          style={{ position: 'relative', width: '100vw', height: '100vh', pointerEvents: 'none' }}
        >
          <iframe
            src={`${getYouTubeEmbedUrl(videoUrl)}&enablejsapi=1&mute=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={(e) => {
              try {
                const iframeWindow = e.target.contentWindow;
                if (iframeWindow) {
                  // Mandatory: mute=1 in URL enables autoplay; unMute via postMessage restores audio
                  // BUG FIX (SVC-2): cancel previous retry batch before scheduling new ones.
                  ytOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
                  ytOnLoadTimersRef.current = [300, 800, 1500].map((delay) =>
                    setTimeout(() => {
                      iframeWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
                        '*'
                      );
                      iframeWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
                        '*'
                      );
                    }, delay)
                  );
                }
              } catch (err) {
                console.warn('[FullScreenVideoViewer] YT onLoad init failed:', err);
              }
            }}
          />
          {/* Age-restricted / unavailable video overlay */}
          {managedYtError && (
            <YouTubeErrorOverlay
              errorCode={managedYtError}
              videoId={getYouTubeVideoId(videoUrl)}
              thumbnailUrl={thumbnailUrl}
              actionLabel="Closing in 3 seconds..."
              style={{ pointerEvents: 'auto' }}
            />
          )}
        </div>
      ) : (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          playsInline
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: '100%',
            objectFit: 'contain',
            cursor: 'pointer',
          }}
          onPlay={() => {
            setIsPlaying(true);
            progressRAF.current = requestAnimationFrame(updateProgress);
          }}
          onPause={() => {
            setIsPlaying(false);
            if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
          }}
          onError={() => setIsPlaying(false)}
        />
      )}

      {/* Author Info */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 16,
          right: 16,
          color: 'white',
          textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <img
            src={author?.avatar || '/default-avatar.png'}
            alt={author?.name}
            style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid white' }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{author?.name || 'Player'}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Smarter.Poker</div>
          </div>
        </div>
        {caption && (
          <div style={{ fontSize: 14, lineHeight: 1.4, maxHeight: 80, overflow: 'hidden' }}>
            {caption}
          </div>
        )}
      </div>

      {/* Bottom Overlay */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
          padding: '24px 12px 20px',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          opacity: showOverlay ? 1 : 0,
          pointerEvents: showOverlay ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
          zIndex: 10002,
        }}
      >
        <button
          onClick={onLike}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            color: 'white',
          }}
        >
          <span style={{ fontSize: 24 }}>👍</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>Like</span>
        </button>
        <button
          onClick={onComment}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            color: 'white',
          }}
        >
          <span style={{ fontSize: 24 }}>💬</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>Comment</span>
        </button>
        <button
          onClick={() => {
            onShare?.();
            // BUG FIX (SVC-3): cancel previous shareToast timer before scheduling a new one.
            if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
            setShareToast(true);
            shareToastTimerRef.current = setTimeout(() => {
              shareToastTimerRef.current = null;
              setShareToast(false);
            }, 2000);
          }}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            color: 'white',
          }}
        >
          <span style={{ fontSize: 24 }}>📤</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>Share</span>
        </button>
      </div>

      {/* Double-tap heart */}
      {showHeart && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 80,
            pointerEvents: 'none',
            zIndex: 10003,
            animation: 'heartBurstFS 0.8s ease-out forwards',
          }}
        >
          ❤️
        </div>
      )}

      {/* Progress bar */}
      {!isYouTubeUrl(videoUrl) && progress > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'rgba(255,255,255,0.2)',
            zIndex: 10003,
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #FF2D55, #FF6B6B)',
              transition: 'width 0.1s linear',
            }}
          />
        </div>
      )}

      {/* Share Toast */}
      {shareToast && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.15)',
            color: 'white',
            padding: '8px 20px',
            borderRadius: 20,
            fontSize: 14,
            zIndex: 10003,
            backdropFilter: 'blur(10px)',
          }}
        >
          Link Copied
        </div>
      )}

      {/* Heart burst animation CSS */}
      <style>{`
                @keyframes heartBurstFS {
                    0% { opacity: 1; transform: translate(-50%, -50%) scale(0.3); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
                }
            `}</style>

      {/* Paused indicator */}
      {!isPlaying && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.4)',
            border: '2px solid rgba(255,255,255,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 32,
            pointerEvents: 'none',
          }}
        >
          ▶
        </div>
      )}
    </div>
  );
}
