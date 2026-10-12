/** Event-owned native playback suspension; never changes feed or user preferences. */
export function createNativeReelVisibility({ getVideo, getIdentity, document: doc, window: win }) {
  let pending = null;
  let pageHidden = false;
  let disposed = false;
  const hidden = () => pageHidden || doc.hidden === true || doc.visibilityState === 'hidden';
  const suspend = (remember = true) => {
    const video = getVideo();
    if (!video) return;
    if (!video.paused && !video.ended) {
      if (remember && !pending) pending = { video, source: video.currentSrc || video.src, identity: getIdentity() };
      video.pause();
    }
  };
  const restore = () => {
    if (disposed || hidden()) return;
    const saved = pending;
    pending = null;
    const video = getVideo();
    if (!saved || saved.video !== video || saved.identity !== getIdentity()
      || saved.source !== (video?.currentSrc || video?.src) || !video.paused || video.ended) return;
    const resumed = video.play();
    // Browser autoplay policy may refuse a return; the visible controls stay paused.
    resumed?.catch?.(() => {});
  };
  const visibility = () => hidden() ? suspend() : restore();
  const play = event => {
    if (event.target === getVideo() && hidden()) suspend(false);
  };
  const hide = () => { pageHidden = true; suspend(); };
  const show = () => { pageHidden = false; visibility(); };
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('play', play, true);
  win.addEventListener('pagehide', hide);
  win.addEventListener('pageshow', show);
  if (hidden()) suspend(false);
  return () => {
    disposed = true; pending = null;
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('play', play, true);
    win.removeEventListener('pagehide', hide);
    win.removeEventListener('pageshow', show);
  };
}
