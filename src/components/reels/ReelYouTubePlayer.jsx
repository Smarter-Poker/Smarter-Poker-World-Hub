import { useEffect, useRef, useState } from 'react';
import { reelSeekSeconds } from '../../lib/reelGestureNavigation.mjs';
import { loadReelYouTubeAPI } from '../../lib/loadReelYouTubeAPI.mjs';

// React owns the host, the official API owns its iframe. Swiping changes the
// video in one player; cleanup destroys only that API-owned child.
export default function ReelYouTubePlayer({ videoId, active = true, autoplay = true, muted = true, iframeRef, eventRef, onMutedChange, commandRef, title }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const loadedIdRef = useRef(null);
  const desiredRef = useRef(null);
  desiredRef.current = { videoId, active, autoplay, muted, title };
  const playbackIntentRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState(null);

  const applyDesired = () => {
    const player = playerRef.current;
    const desired = desiredRef.current;
    if (!readyRef.current || !player || !desired) return;
    if (!desired.active || !desired.videoId) { player.pauseVideo(); return; }
    if (loadedIdRef.current !== desired.videoId) {
      playbackIntentRef.current = null;
      player.mute();
      const method = desired.autoplay ? 'loadVideoById' : 'cueVideoById';
      player[method]({ videoId: desired.videoId, startSeconds: 0 });
      loadedIdRef.current = desired.videoId;
    }
    if (desired.muted) player.mute();
    else { player.unMute(); player.setVolume(100); }
    if ((!desired.autoplay && playbackIntentRef.current !== 'playVideo') || playbackIntentRef.current === 'pauseVideo') player.pauseVideo();
    const frame = player.getIframe();
    if (frame) frame.title = desired.title || 'Reel Video';
  };

  useEffect(() => {
    let disposed = false;
    let player = null;
    readyRef.current = false;
    setFailure(null);
    setReady(false);
    const forward = (event, info) => {
      if (disposed || !player || !desiredRef.current.active) return;
      const frame = player.getIframe();
      eventRef?.current?.({ origin: new URL(frame.src).origin, source: frame?.contentWindow, data: { event, info, videoId: desiredRef.current.videoId } });
    };
    loadReelYouTubeAPI().then((YT) => {
      if (disposed || !hostRef.current) return;
      const initial = desiredRef.current;
      const frame = document.createElement('iframe');
      const params = new URLSearchParams({ autoplay: initial.active && initial.autoplay ? '1' : '0', mute: '1', playsinline: '1', controls: '0', rel: '0', enablejsapi: '1', origin: window.location.origin, widget_referrer: window.location.origin });
      frame.src = `https://www.youtube-nocookie.com/embed/${initial.videoId}?${params}`;
      frame.title = initial.title || 'Reel Video';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      Object.assign(frame.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' });
      hostRef.current.appendChild(frame);
      if (iframeRef) iframeRef.current = frame;
      loadedIdRef.current = initial.videoId;
      player = new YT.Player(frame, { events: {
        onReady: () => { if (disposed) return; readyRef.current = true; setReady(true); if (iframeRef) iframeRef.current = player.getIframe(); applyDesired(); forward('onReady'); const state = player.getPlayerState?.(); if (Number.isFinite(state)) forward('onStateChange', state); if (desiredRef.current.active && (desiredRef.current.autoplay || playbackIntentRef.current === 'playVideo') && playbackIntentRef.current !== 'pauseVideo') player.playVideo(); },
        onStateChange: (event) => {
          if (disposed) return;
          const desired = desiredRef.current;
          if (!desired.active) { player.pauseVideo(); return; }
          const observedId = player.getVideoData?.()?.video_id;
          if (observedId && observedId !== desired.videoId) return;
          // The provider state is authoritative; no timed play/unmute retries.
          forward('onStateChange', event.data);
          if (event.data === 0 && (desired.autoplay || playbackIntentRef.current === 'playVideo') && playbackIntentRef.current !== 'pauseVideo') { player.seekTo(0, true); player.playVideo(); }
        },
        onError: (event) => forward('onError', event.data),
        onAutoplayBlocked: () => forward('onAutoplayBlocked'),
      } });
      playerRef.current = player;
    }).catch((error) => { if (!disposed) setFailure(error.message); });
    return () => {
      disposed = true;
      readyRef.current = false;
      playerRef.current = null;
      if (iframeRef) iframeRef.current = null;
      player?.destroy();
    };
  }, [attempt]);

  useEffect(() => {
    if (!commandRef) return;
    const command = (name, args = []) => {
      if (name === 'playVideo' || name === 'pauseVideo') playbackIntentRef.current = name;
      const player = playerRef.current;
      if (!readyRef.current || !player || !desiredRef.current.active) return;
      if (name === 'seekToPercent') { const seconds = reelSeekSeconds(args[0], player.getDuration()); if (seconds !== null) player.seekTo(seconds, true); return; }
      if (['playVideo', 'pauseVideo', 'mute', 'unMute', 'setVolume', 'setPlaybackRate', 'seekTo'].includes(name)) player[name](...args);
    };
    commandRef.current = command;
    return () => { if (commandRef.current === command) commandRef.current = null; };
  }, [commandRef]);
  useEffect(applyDesired, [videoId, active, autoplay, muted, title]);
  useEffect(() => { if (readyRef.current && active && autoplay && playbackIntentRef.current !== 'pauseVideo') playerRef.current?.playVideo(); }, [active, autoplay]);
  useEffect(() => {
    const observeSound = (event) => {
      const frame = iframeRef?.current;
      if (!desiredRef.current.active || !frame || event.source !== frame.contentWindow || !['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(event.origin)) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'infoDelivery') {
          if (typeof data.info?.muted === 'boolean') onMutedChange?.(data.info.muted);
          eventRef?.current?.({ origin: event.origin, source: event.source, data });
        }
      } catch { /* Non-API messages carry no playback state. */ }
    };
    window.addEventListener('message', observeSound);
    return () => window.removeEventListener('message', observeSound);
  }, [iframeRef, onMutedChange, eventRef]);
  return <div ref={hostRef} data-reel-youtube-api={failure ? 'error' : ready ? 'ready' : 'loading'} data-reel-youtube-active={active ? 'true' : 'false'} style={{ position: 'absolute', inset: 0 }}>
    {failure ? <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'grid', placeContent: 'center', gap: 12, textAlign: 'center', color: '#fff', background: '#000c', padding: 24 }}><p>Video Player Could Not Load</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry Player</button></div> : null}
  </div>;
}
