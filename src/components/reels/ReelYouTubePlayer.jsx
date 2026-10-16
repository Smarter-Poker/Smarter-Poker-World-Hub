import { useEffect, useRef, useState } from 'react';
import { reelYouTubeFrameHtml } from '../../lib/reelsSeo.mjs';
import { reelSeekSeconds } from '../../lib/reelGestureNavigation.mjs';
import { loadReelYouTubeAPI } from '../../lib/loadReelYouTubeAPI.mjs';

// React owns the host, the official API owns its iframe. Swiping changes the
// video in one player; cleanup destroys only that API-owned child.
export default function ReelYouTubePlayer({ videoId, active = true, autoplay = true, muted = true, iframeRef, eventRef, onMutedChange, commandRef, title, playbackScopeKey = null, captionsRequested = false, captionsFontSize = 0, onCaptionsStateChange }) {
  const hostRef = useRef(null);
  const initialFrameHtmlRef = useRef(reelYouTubeFrameHtml(videoId));
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const loadedIdRef = useRef(null);
  const desiredRef = useRef(null);
  desiredRef.current = { videoId, active, autoplay, muted, title, playbackScopeKey, captionsRequested, captionsFontSize };
  const playbackIntentRef = useRef(null);
  const pageHiddenRef = useRef(false);
  const visible = () => !pageHiddenRef.current && (typeof document === 'undefined' || (document.visibilityState !== 'hidden' && document.hidden !== true));
  const visibilityHoldRef = useRef(!visible());
  const visibilityResumeRef = useRef(null);
  const observedIdentityRef = useRef({ videoId, active, playbackScopeKey });
  const previousIdentity = observedIdentityRef.current;
  if (previousIdentity.videoId !== videoId || previousIdentity.active !== active || previousIdentity.playbackScopeKey !== playbackScopeKey) {
    visibilityResumeRef.current = null;
    // A newly selected clip while hidden must remain cued on return.
    visibilityHoldRef.current = !visible();
    observedIdentityRef.current = { videoId, active, playbackScopeKey };
  }
  const captionsCallbackRef = useRef(onCaptionsStateChange);
  captionsCallbackRef.current = onCaptionsStateChange;
  const restartPositionRef = useRef(null);
  const stopProgressRef = useRef(() => {});
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState(null);

  const applyDesired = () => {
    const player = playerRef.current;
    const desired = desiredRef.current;
    if (!desired) return;
    if (!desired.active) { playbackIntentRef.current = null; stopProgressRef.current(); if (readyRef.current) player?.pauseVideo(); return; }
    if (!readyRef.current || !player) return;
    if (!desired.videoId) { stopProgressRef.current(); player.pauseVideo(); return; }
    if (loadedIdRef.current !== desired.videoId) {
      stopProgressRef.current();
      playbackIntentRef.current = null;
      player.mute();
      const method = desired.autoplay && visible() && !visibilityHoldRef.current ? 'loadVideoById' : 'cueVideoById';
      player[method]({ videoId: desired.videoId, startSeconds: 0 });
      loadedIdRef.current = desired.videoId;
    }
    if (!visible() || visibilityHoldRef.current) { stopProgressRef.current(); player.mute(); player.pauseVideo(); return; }
    if (desired.muted) player.mute();
    else { player.unMute(); player.setVolume(100); }
    if ((!desired.autoplay && playbackIntentRef.current !== 'playVideo') || playbackIntentRef.current === 'pauseVideo') player.pauseVideo();
    const frame = player.getIframe();
    if (frame) frame.title = desired.title || 'Reel Video';
  };

  useEffect(() => {
    let disposed = false;
    let player = null;
    let progressFrame = null;
    let readyDeadline = null;
    let readinessExpired = false;
    let lastProgressAt = -Infinity;
    const stopProgress = () => { if (progressFrame !== null) window.cancelAnimationFrame(progressFrame); progressFrame = null; };
    stopProgressRef.current = stopProgress;
    const drawProgress = (at) => {
      progressFrame = null;
      if (disposed || !player || !readyRef.current || !desiredRef.current.active || !visible() || visibilityHoldRef.current) return;
      if (at - lastProgressAt >= 100) {
        const currentTime = player.getCurrentTime?.(), duration = player.getDuration?.();
        const playbackRate = player.getPlaybackRate?.();
        if (Number.isFinite(currentTime) && duration > 0) forward('infoDelivery', { currentTime, duration, ...(Number.isFinite(playbackRate) && playbackRate > 0 ? { playbackRate } : {}) });
        const observedMuted = player.isMuted?.();
        if (typeof observedMuted === 'boolean') onMutedChange?.(observedMuted);
        lastProgressAt = at;
      }
      progressFrame = window.requestAnimationFrame(drawProgress);
    };
    const startProgress = () => { stopProgress(); lastProgressAt = -Infinity; progressFrame = window.requestAnimationFrame(drawProgress); };
    readyRef.current = false;
    setFailure(null);
    setReady(false);
    const forward = (event, info, ownedVideoId = desiredRef.current.videoId) => {
      if (disposed || !player || !desiredRef.current.active) return;
      const frame = player.getIframe();
      eventRef?.current?.({ origin: new URL(frame.src).origin, source: frame?.contentWindow, data: { event, info, videoId: ownedVideoId } });
    };
    const publishCaptions = (status) => {
      const desired = desiredRef.current;
      if (disposed || !desired.active) return;
      captionsCallbackRef.current?.({ status, requested: Boolean(desired.captionsRequested), videoId: desired.videoId, availability: 'provider-managed' });
    };
    const applyCaptions = () => {
      if (disposed || !player || !readyRef.current) return;
      const observedId = player.getVideoData?.()?.video_id;
      if (observedId && observedId !== desiredRef.current.videoId) return;
      // The supported module exposes fontSize/reload, not a caption-track list.
      // Module readiness is never presented as proof of a spoken caption track.
      try {
        const modules = player.getOptions?.();
        if (Array.isArray(modules) && modules.includes('captions')) {
          const options = player.getOptions('captions');
          if (Array.isArray(options) && options.includes('fontSize')) player.setOption('captions', 'fontSize', Math.max(-1, Math.min(3, Number(desiredRef.current.captionsFontSize) || 0)));
          publishCaptions('module-ready');
        } else publishCaptions('provider-managed');
      } catch { publishCaptions('provider-managed'); }
    };
    publishCaptions('loading');
    loadReelYouTubeAPI().then((YT) => {
      if (disposed || !hostRef.current) return;
      const initial = desiredRef.current;
      const frame = hostRef.current.querySelector('iframe') || document.createElement('iframe');
      const params = new URLSearchParams({ autoplay: initial.active && initial.autoplay && visible() && !visibilityHoldRef.current ? '1' : '0', mute: '1', playsinline: '1', controls: '0', rel: '0', enablejsapi: '1', origin: window.location.origin, widget_referrer: window.location.origin });
      if (initial.captionsRequested) params.set('cc_load_policy', '1');
      const saved = restartPositionRef.current;
      if (saved?.videoId === initial.videoId && saved.playbackScopeKey === initial.playbackScopeKey) {
        params.set('start', String(Math.floor(saved.seconds)));
        if (!saved.playing) { playbackIntentRef.current = 'pauseVideo'; params.set('autoplay', '0'); }
      }
      frame.src = `https://www.youtube-nocookie.com/embed/${initial.videoId}?${params}`;
      frame.title = initial.title || 'Reel Video';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      Object.assign(frame.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' });
      if (!frame.parentNode) hostRef.current.appendChild(frame);
      if (iframeRef) iframeRef.current = frame;
      loadedIdRef.current = initial.videoId;
      player = new YT.Player(frame, { events: {
        onReady: () => { if (disposed || readinessExpired) return; clearTimeout(readyDeadline); readyRef.current = true; setReady(true); if (iframeRef) iframeRef.current = player.getIframe(); applyDesired(); if (saved?.videoId === desiredRef.current.videoId && saved.playbackScopeKey === desiredRef.current.playbackScopeKey && Number.isFinite(saved.seconds)) { player.seekTo?.(saved.seconds, true); restartPositionRef.current = null; } applyCaptions(); forward('onReady'); const state = player.getPlayerState?.(); if (Number.isFinite(state) && visible() && !visibilityHoldRef.current) forward('onStateChange', state); if (state === 1 && visible() && !visibilityHoldRef.current) startProgress(); if (visible() && !visibilityHoldRef.current && desiredRef.current.active && (desiredRef.current.autoplay || playbackIntentRef.current === 'playVideo') && playbackIntentRef.current !== 'pauseVideo') player.playVideo(); },
        onStateChange: (event) => {
          if (disposed) return;
          if (readinessExpired) { player.mute(); player.pauseVideo(); return; }
          const desired = desiredRef.current;
          if (!desired.active) { player.pauseVideo(); return; }
          if (!visible() || visibilityHoldRef.current) { stopProgress(); if (event.data === 1) { player.mute(); player.pauseVideo(); } return; }
          const observedId = player.getVideoData?.()?.video_id;
          if (observedId && observedId !== desired.videoId) return;
          if (event.data === 1 && playbackIntentRef.current === 'pauseVideo') { stopProgress(); player.pauseVideo(); return; }
          // The provider state is authoritative; no timed play/unmute retries.
          forward('onStateChange', event.data);
          if (event.data === 1) startProgress(); else stopProgress();
          if (event.data === 0 && (desired.autoplay || playbackIntentRef.current === 'playVideo') && playbackIntentRef.current !== 'pauseVideo') { player.seekTo(0, true); player.playVideo(); }
        },
        onError: (event) => { const observedId = player.getVideoData?.()?.video_id; if (observedId && observedId !== desiredRef.current.videoId) return; stopProgress(); publishCaptions('error'); forward('onError', event.data); },
        onApiChange: applyCaptions,
        onAutoplayBlocked: () => { stopProgress(); forward('onAutoplayBlocked'); },
      } });
      playerRef.current = player;
      readyDeadline = setTimeout(() => { if (!disposed && !readyRef.current) { readinessExpired = true; stopProgress(); forward('onPlayerUnavailable', undefined, loadedIdRef.current); player?.mute(); player?.pauseVideo(); publishCaptions('error'); setFailure('Video Player Did Not Become Ready'); } }, 15000);
    }).catch((error) => { if (!disposed) { publishCaptions('error'); setFailure(error.message); } });
    return () => {
      const seconds = player?.getCurrentTime?.();
      if (readyRef.current && Number.isFinite(seconds)) restartPositionRef.current = { videoId: loadedIdRef.current, playbackScopeKey: desiredRef.current.playbackScopeKey, seconds, playing: (player?.getPlayerState?.() === 1 || visibilityResumeRef.current?.videoId === loadedIdRef.current) && playbackIntentRef.current !== 'pauseVideo' };
      forward('onPlayerDisposed', undefined, loadedIdRef.current);
      disposed = true;
      clearTimeout(readyDeadline);
      stopProgress();
      readyRef.current = false;
      playerRef.current = null;
      if (iframeRef) iframeRef.current = null;
      player?.destroy();
    };
  }, [attempt, captionsRequested]);

  useEffect(() => {
    if (!commandRef) return;
    const command = (name, args = []) => {
      if (!desiredRef.current.active) return;
      if (name === 'playVideo' || name === 'pauseVideo') {
        playbackIntentRef.current = name;
        if (name === 'pauseVideo') visibilityResumeRef.current = null;
        if (name === 'playVideo' && visible()) visibilityHoldRef.current = false;
      }
      const player = playerRef.current;
      if (!readyRef.current || !player || !desiredRef.current.active) return;
      if (!visible() && ['playVideo', 'unMute', 'setVolume'].includes(name)) return;
      if (name === 'seekToPercent') { const seconds = reelSeekSeconds(args[0], player.getDuration()); if (seconds !== null) player.seekTo(seconds, true); return; }
      if (['playVideo', 'pauseVideo', 'mute', 'unMute', 'setVolume', 'setPlaybackRate', 'seekTo'].includes(name)) player[name](...args);
    };
    commandRef.current = command;
    return () => { if (commandRef.current === command) commandRef.current = null; };
  }, [commandRef]);
  useEffect(() => { if (active) captionsCallbackRef.current?.({ status: readyRef.current ? 'provider-managed' : 'loading', requested: Boolean(captionsRequested), videoId, availability: 'provider-managed' }); }, [videoId, active, captionsRequested]);
  useEffect(applyDesired, [videoId, active, autoplay, muted, title, playbackScopeKey]);
  useEffect(() => { if (visible() && !visibilityHoldRef.current && readyRef.current && active && autoplay && playbackIntentRef.current !== 'pauseVideo') playerRef.current?.playVideo(); }, [active, autoplay]);
  useEffect(() => {
    const player = playerRef.current;
    if (!readyRef.current || !player) return;
    try {
      if (player.getOptions?.('captions')?.includes('fontSize')) player.setOption('captions', 'fontSize', Math.max(-1, Math.min(3, Number(captionsFontSize) || 0)));
    } catch { /* The provider may unload its caption module between events. */ }
  }, [captionsFontSize]);
  useEffect(() => {
    const suspend = () => {
      const desired = desiredRef.current;
      const player = playerRef.current;
      if (!visibilityHoldRef.current) {
        visibilityResumeRef.current = desired.active && readyRef.current && player?.getPlayerState?.() === 1 && playbackIntentRef.current !== 'pauseVideo'
          ? { videoId: desired.videoId, playbackScopeKey: desired.playbackScopeKey } : null;
      }
      visibilityHoldRef.current = true;
      stopProgressRef.current();
      if (readyRef.current) { player?.mute(); player?.pauseVideo(); }
    };
    const change = () => {
      if (!visible()) { suspend(); return; }
      const saved = visibilityResumeRef.current;
      visibilityResumeRef.current = null;
      const desired = desiredRef.current;
      if (!saved || !desired.active || saved.videoId !== desired.videoId || saved.playbackScopeKey !== desired.playbackScopeKey || playbackIntentRef.current === 'pauseVideo') return;
      visibilityHoldRef.current = false;
      applyDesired();
      if (readyRef.current) playerRef.current?.playVideo();
    };
    const pageHide = () => { pageHiddenRef.current = true; suspend(); };
    const pageShow = () => { pageHiddenRef.current = false; change(); };
    document.addEventListener?.('visibilitychange', change);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    if (!visible()) suspend();
    return () => {
      visibilityResumeRef.current = null;
      document.removeEventListener?.('visibilitychange', change);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
    };
  }, []);
  useEffect(() => {
    const observeSound = (event) => {
      const frame = iframeRef?.current;
      if (!visible() || visibilityHoldRef.current || !desiredRef.current.active || !frame || event.source !== frame.contentWindow || !['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(event.origin)) return;
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
  return <div data-reel-youtube-api={failure ? 'error' : ready ? 'ready' : 'loading'} data-reel-youtube-active={active ? 'true' : 'false'} style={{ position: 'absolute', inset: 0 }}>
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} dangerouslySetInnerHTML={{ __html: initialFrameHtmlRef.current }} />
    {failure ? <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'grid', placeContent: 'center', gap: 12, textAlign: 'center', color: '#fff', background: '#000c', padding: 24 }}><p>Video Player Could Not Load</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry Player</button></div> : null}
  </div>;
}
