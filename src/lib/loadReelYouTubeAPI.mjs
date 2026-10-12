let pendingAPI = null;
export function loadReelYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pendingAPI) return pendingAPI;
  pendingAPI = new Promise((resolve, reject) => {
    let settled = false;
    const previousReady = window.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      script.onerror = null;
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previousReady;
      if (error) { pendingAPI = null; script.remove(); reject(error); }
      else resolve(window.YT);
    };
    const ready = () => {
      try { previousReady?.(); } catch (error) { console.warn('[Reels] Previous YouTube ready callback failed:', error); }
      if (window.YT?.Player) finish();
      else finish(new Error('YouTube player API was unavailable'));
    };
    const deadline = setTimeout(() => finish(new Error('YouTube player API did not load')), 15000);
    window.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.reelsYoutubeApi = 'true';
    script.onerror = () => finish(new Error('YouTube player API could not load'));
    document.head.appendChild(script);
  });
  return pendingAPI;
}
