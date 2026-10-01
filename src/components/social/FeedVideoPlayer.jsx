/**
 * FeedVideoPlayer - a video post in the feed (Phase 8.1).
 *
 * Native rows (an uploaded file with a playable src) play muted while half
 * of the tile is on screen, pause when it leaves, and carry one 44px control
 * in the corner that unmutes or mutes. The choice is remembered under the
 * same localStorage key the Reels carousel uses (sp:reels:muted, see
 * ReelsFeedCarousel.jsx), so one preference governs both surfaces.
 *
 * YouTube rows stay a poster that opens Reels: FeedVideoPoster draws the
 * thumbnail through its maxres/sd/hq ladder and never a video element. An
 * iframe per card would cost about 1 MB each; Reels is the playback surface.
 *
 * Why the native branch owns its <video> instead of wrapping FeedVideoPoster
 * outright: FeedVideoPoster's happy path is a static <img> whenever a
 * thumbnail exists (SharedVideoComponents.jsx, Branch 1), so an Unmute button
 * over it would have nothing to unmute for exactly the rows that have a
 * poster. The <video> here keeps the poster, the 50 percent
 * IntersectionObserver play/pause and the onError fallthrough: when the src
 * dies, FeedVideoPoster takes over and its img/gradient chain renders, which
 * is the self-healing tile the feed already had.
 *
 * The card click still opens Reels. This component never stops a click on
 * the tile; only the mute control stops propagation, so double-tap to like
 * and the wrapper's navigation keep working. `onOpen`, when given, is called
 * on a tile click for callers whose tile is not already a click target.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FeedVideoPoster } from './SharedVideoComponents';
import { isYouTubeUrl } from '../../lib/socialHelpers';

export const REELS_MUTED_KEY = 'sp:reels:muted';

/** The remembered choice; muted unless the viewer unmuted before. */
export function readStoredMuted() {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(REELS_MUTED_KEY) !== '0';
  } catch (_) {
    return true;
  }
}

export function writeStoredMuted(muted) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REELS_MUTED_KEY, muted ? '1' : '0');
  } catch (_) {
    /* sandboxed contexts may throw */
  }
}

export function feedVideoUrl(post) {
  const urls = post?.mediaUrls || post?.media_urls;
  const first = Array.isArray(urls) ? urls[0] : null;
  return typeof first === 'string' && first ? first : null;
}

/** True when the row plays in a <video> element rather than a YouTube poster. */
export function isNativeFeedVideo(post) {
  const url = feedVideoUrl(post);
  if (!url) return false;
  const playbackType = post?.playbackType || post?.playback_type || null;
  if (playbackType === 'youtube_embed' || playbackType === 'external_embed') return false;
  return !isYouTubeUrl(url);
}

const playableSrc = (url) =>
  url && !url.startsWith('blob:') && !url.includes('#t=') ? `${url}#t=0.001` : url;

function SpeakerIcon({ muted }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

export default function FeedVideoPlayer({ post, posterUrl = null, onOpen }) {
  const videoUrl = feedVideoUrl(post);
  const native = isNativeFeedVideo(post);
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(() => readStoredMuted());
  const [videoFailed, setVideoFailed] = useState(false);

  // Muted autoplay while half the tile is on screen, paused otherwise: the
  // same 0.5 threshold FeedVideoPoster uses for its own fallback <video>.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !native || videoFailed) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const attempt = video.play();
            if (attempt && typeof attempt.catch === 'function') {
              attempt.catch(() => {
                /* autoplay refused: the poster stays */
              });
            }
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.5 }
    );
    observer.observe(video);
    return () => {
      observer.unobserve(video);
      observer.disconnect();
    };
  }, [native, videoFailed]);

  const toggleMuted = (event) => {
    // The tile around this control opens Reels on click and likes on a
    // double tap; the control must not reach either handler.
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const next = !muted;
    if (videoRef.current) videoRef.current.muted = next;
    setMuted(next);
    writeStoredMuted(next);
  };

  const handleOpen = () => {
    if (typeof onOpen === 'function') onOpen(post);
  };

  if (!native || videoFailed) {
    return (
      <div
        data-feed-video="poster"
        data-sp-skip-a11y="not a control: the card around the tile opens Reels"
        onClick={handleOpen}
        style={{ position: 'relative', width: '100%', height: '100%' }}
      >
        <FeedVideoPoster videoUrl={videoUrl} thumbnailUrl={posterUrl || null} />
      </div>
    );
  }

  return (
    <div
      data-feed-video="native"
      data-sp-skip-a11y="not a control: the card around the tile opens Reels"
      onClick={handleOpen}
      style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}
    >
      <video
        ref={videoRef}
        src={playableSrc(videoUrl)}
        poster={posterUrl || undefined}
        preload="metadata"
        muted={muted}
        playsInline
        loop
        onError={() => setVideoFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000', display: 'block' }}
      />
      <button
        type="button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        onClick={toggleMuted}
        onKeyDown={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          zIndex: 2,
          width: 44,
          height: 44,
          minWidth: 44,
          minHeight: 44,
          padding: 0,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <SpeakerIcon muted={muted} />
      </button>
    </div>
  );
}
