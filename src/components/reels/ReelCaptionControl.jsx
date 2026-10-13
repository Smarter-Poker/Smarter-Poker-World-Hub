import { useEffect, useRef, useState } from 'react';
import { getReelCaptionTrack, uploadReelCaptionTrack, validateReelWebVTT, MAX_REEL_CAPTION_BYTES } from '../../lib/reelNativeCaptions.mjs';

/** Provider requests and creator-owned tracks remain distinct from caption prose. */
export default function ReelCaptionControl({ native = false, reel, ownerId = null, videoRef, requested, onToggle, state, getAccessToken, uploadCommandRef, storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, fetcher = fetch }) {
  const [trackState, setTrackState] = useState(native ? 'loading' : 'provider-managed');
  const [message, setMessage] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const inputRef = useRef(null), trackRef = useRef(null), uploadRef = useRef(null), pendingRef = useRef(false), unknownUploadRef = useRef(null);
  const scope = `${ownerId || 'public'}:${reel?.id || ''}:${native}`;
  const currentRef = useRef(null);
  currentRef.current = { scope, reel, ownerId, requested, getAccessToken };
  const creator = Boolean(native && ownerId && reel?.author_id === ownerId && reel?.id);
  const removeTrack = () => {
    const current = trackRef.current;
    if (!current) return;
    current.element.removeEventListener('load', current.load);
    current.element.removeEventListener('error', current.error);
    clearTimeout(current.timeout);
    current.element.remove();
    trackRef.current = null;
  };
  const attachTrack = (url, expectedScope) => {
    if (currentRef.current.scope !== expectedScope || !videoRef?.current) return;
    removeTrack();
    const video = videoRef.current;
    const element = document.createElement('track');
    element.kind = 'captions'; element.srclang = 'und'; element.label = 'Creator Captions'; element.src = url;
    const matches = () => currentRef.current.scope === expectedScope && trackRef.current?.element === element && videoRef.current === video;
    const load = () => {
      if (!matches()) return;
      clearTimeout(trackRef.current.timeout);
      // Native browser cues using automatic placement otherwise sit behind
      // the Reels progress controls. Preserve every explicitly authored line
      // and horizontal setting, and render the original cue text natively.
      for (const cue of Array.from(element.track.cues || [])) {
        if (cue.line !== 'auto') continue;
        cue.snapToLines = false;
        cue.line = 70;
        if (cue.position === 'auto' && cue.align === 'center' && cue.size === 100) cue.size = 70;
      }
      element.track.mode = currentRef.current.requested ? 'showing' : 'disabled';
      setTrackState('available'); setMessage('Creator Captions Are Available');
    };
    const error = () => { if (matches()) { clearTimeout(trackRef.current.timeout); element.track.mode = 'disabled'; setTrackState('error'); setMessage('Captions Could Not Load. Select CC To Retry.'); } };
    element.addEventListener('load', load); element.addEventListener('error', error);
    trackRef.current = { element, load, error, scope: expectedScope };
    trackRef.current.timeout = setTimeout(error, 15000);
    video.appendChild(element);
    // A hidden text track loads cues without turning captions on or fabricating availability.
    element.track.mode = currentRef.current.requested ? 'showing' : 'hidden';
    setTrackState('loading');
    if (element.readyState === 2) load(); else if (element.readyState === 3) error();
  };
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const expectedScope = scope;
    if (unknownUploadRef.current !== expectedScope) unknownUploadRef.current = null;
    removeTrack(); uploadRef.current?.abort(); uploadRef.current = null; pendingRef.current = false;
    setMessage(''); setTrackState(native ? 'loading' : 'provider-managed');
    if (!native || !reel?.id) return () => { live = false; controller.abort(); };
    const timeout = setTimeout(() => { controller.abort(); if (live && currentRef.current.scope === expectedScope) { setTrackState('error'); setMessage('Caption Request Timed Out. Select CC To Retry.'); } }, 15000);
    getReelCaptionTrack(reel, { accessToken: getAccessToken?.(), signal: controller.signal, fetcher, storageUrl }).then(url => {
      if (!live || controller.signal.aborted || currentRef.current.scope !== expectedScope) return;
      unknownUploadRef.current = null;
      if (url) attachTrack(url, expectedScope);
      else { setTrackState('unavailable'); setMessage('No Creator Caption Track Has Been Added'); }
    }).catch(() => {
      if (!live || controller.signal.aborted || currentRef.current.scope !== expectedScope) return;
      setTrackState('error'); setMessage('Captions Could Not Load. Select CC To Retry.');
    }).finally(() => clearTimeout(timeout));
    return () => { live = false; clearTimeout(timeout); controller.abort(); uploadRef.current?.abort(); uploadRef.current = null; pendingRef.current = false; removeTrack(); };
  }, [scope, reel?.author_id, native, videoRef, getAccessToken, fetcher, storageUrl, requestVersion]);
  useEffect(() => { const current = trackRef.current; if (native && trackState === 'available' && current?.scope === scope) current.element.track.mode = requested ? 'showing' : 'disabled'; }, [native, scope, requested, trackState]);
  useEffect(() => {
    if (!uploadCommandRef) return;
    const command = () => { if (!creator || currentRef.current.scope !== scope || pendingRef.current) return; if (unknownUploadRef.current === scope) setRequestVersion(value => value + 1); else inputRef.current?.click(); };
    uploadCommandRef.current = creator ? command : null;
    return () => { if (uploadCommandRef.current === command) uploadCommandRef.current = null; };
  }, [creator, scope, uploadCommandRef]);
  const upload = async (file) => {
    if (!file || !creator || pendingRef.current) return;
    const expectedScope = scope;
    const controller = new AbortController(); uploadRef.current = controller; pendingRef.current = true;
    let timeout, posted = false;
    try {
      if (!file.name?.toLowerCase().endsWith('.vtt') || file.size <= 0 || file.size > MAX_REEL_CAPTION_BYTES) throw new Error('Choose A WebVTT File Under 100 KB');
      setMessage('Uploading Creator Captions');
      timeout = setTimeout(() => { controller.abort(); if (uploadRef.current === controller) { uploadRef.current = null; pendingRef.current = false; } if (currentRef.current.scope === expectedScope) { if (posted) { unknownUploadRef.current = expectedScope; setTrackState('error'); setMessage('Caption Upload Outcome Is Unknown. Reload Captions To Read The Saved Track.'); } else setMessage('Caption File Read Timed Out. Choose The File Again.'); } }, 15000);
      const text = await file.text();
      if (currentRef.current.scope !== expectedScope || controller.signal.aborted) return;
      validateReelWebVTT(text, { duration: videoRef?.current?.duration });
      const token = currentRef.current.getAccessToken?.();
      if (!token) throw new Error('Sign In Before Adding Captions');
      posted = true;
      const url = await uploadReelCaptionTrack(reel, text, { accessToken: token, signal: controller.signal, fetcher, storageUrl });
      if (currentRef.current.scope !== expectedScope || controller.signal.aborted) return;
      attachTrack(url, expectedScope); setMessage('Caption File Saved. Loading The Verified Track.');
    } catch (error) {
      if (currentRef.current.scope !== expectedScope || controller.signal.aborted) return;
      if (posted && error.name === 'TypeError') { unknownUploadRef.current = expectedScope; setTrackState('error'); setMessage('Caption Upload Outcome Is Unknown. Reload Captions To Read The Saved Track.'); } else setMessage(error.message || 'Caption Upload Failed');
    } finally {
      clearTimeout(timeout);
      if (uploadRef.current === controller) { uploadRef.current = null; pendingRef.current = false; }
    }
  };
  const unavailable = native && trackState === 'unavailable';
  const loading = native && trackState === 'loading';
  const label = native ? trackState === 'error' ? 'Retry Loading Captions' : loading ? 'Loading Creator Captions' : unavailable ? 'Captions Unavailable For This Upload' : requested ? 'Turn Captions Off' : 'Turn Captions On' : requested ? 'Use Provider Caption Preference' : 'Request Captions When Available';
  return <>
    <button type="button" data-reel-captions data-reel-caption-status={native ? trackState : state?.status || 'provider-managed'} aria-label={label} aria-pressed={Boolean(requested && (!native || trackState === 'available'))} disabled={unavailable || loading} title={native ? label : `${label}. YouTube Determines Track Availability.`} onClick={() => native && trackState === 'error' ? setRequestVersion(value => value + 1) : onToggle()} style={{ color: '#fff', background: 'transparent', border: 0, minWidth: 44, minHeight: 44, fontSize: 14, fontWeight: 700, opacity: unavailable || loading ? 0.45 : 1 }}>CC</button>
    <input ref={inputRef} type="file" accept=".vtt,text/vtt" hidden aria-label="Add Creator Caption File" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} />
    {message ? <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>{message}</span> : null}
  </>;
}
