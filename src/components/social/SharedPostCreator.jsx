import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
// useRouter import removed (PHASE-E 2026-05-03): the only consumer was the
// killed compose-V2 fork in handleFiles. Removing it eliminates a per-mount
// hook subscription that's now pure dead weight.
import { supabase } from '../../../src/lib/supabase';
import { getAccessToken } from '../../../src/lib/authUtils';
import { busEmit } from '../../../src/engine/EventBus';
import toast from '../../../src/stores/toastStore';
import { useActiveIdentity } from '../../../src/contexts/ActiveIdentityContext';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import CheckInModal from './CheckInModal';
import TrendingVenues from './TrendingVenues';
import { SharedAvatar as Avatar } from './SharedAvatar';
import {
  MAX_MEDIA,
  compressImage,
  getYouTubeVideoId,
  validateYouTubeVideo,
  sniffMimeType,
  SOCIAL_COLORS as C,
} from '../../../src/lib/socialHelpers';
import bgUpload from '../../../src/lib/backgroundVideoUpload';
import {
  validateVideoFile,
  generateThumbnail,
  generateFrames,
  compressVideo,
} from '../../../src/lib/videoCompressor';
import { uploadThumbnail } from '../../../src/lib/thumbnailUploader';
// useComposeStore import removed (2026-05-03): the /compose route handoff
// is gone, inline staging handles everything via local component state.

export function SharedPostCreator({
  user,
  onPost,
  isPosting,
  onGoLive,
  onOpenClubPages,
  authorOverride,
  context = 'social-media',
}) {
  const { avatar: contextAvatar } = useAvatar();
  const [postVisibility, setPostVisibility] = useState('public');
  const [content, setContent] = useState('');
  const [media, setMedia] = useState([]);
  const [thumbPickerIdx, setThumbPickerIdx] = useState(null);
  const [thumbFrames, setThumbFrames] = useState([]);
  const [thumbFramesLoading, setThumbFramesLoading] = useState(false);
  const [scrubberTime, setScrubberTime] = useState(0); // current scrubber position in seconds
  const [scrubberDuration, setScrubberDuration] = useState(0);
  const [scrubberCapture, setScrubberCapture] = useState(null); // data URL of scrubber preview frame
  const thumbFileInputRef = useRef(null);
  const scrubberVideoRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // null | { pct: number, label: string }
  const [error, setError] = useState('');
  // STAGE-AWARE BANNER (audit-6 2026-04-30 per Dan):
  // 'picker'  — user just tapped Photo/Video, OS file picker is opening
  // 'loading' — picker dismissed, iOS handing the file off (sandbox copy + iCloud pull)
  // 'staging' — JS has the File handle, generating thumbnail / preparing upload
  // null      — banner hidden
  const [preparingStage, setPreparingStage] = useState(null);
  // Compatibility shim for legacy callers that still expect a boolean.
  const preparingMedia = preparingStage !== null;
  const setPreparingMedia = (val) => setPreparingStage(val ? 'staging' : null);
  const _hasFileArrivedRef = useRef(false); // tracks whether change event fired since picker opened — used to detect cancel
  const _focusGraceTimerRef = useRef(null); // 5s watchdog after picker closes; stored as ref so it survives the 'picker'->'loading' useEffect re-run
  // AUDIT-13 (2026-04-30 per Dan: "3s on Mac, 25s on iPhone — why?"):
  // Timing instrumentation. Records timestamps at each phase of the
  // upload-staging flow so we can see EXACTLY where the seconds go.
  // Displayed inline at the bottom of the banner during staging and
  // also written to sessionStorage 'sp-upload-timings' for Dan to copy.
  const _timingsRef = useRef({});
  const [timingDisplay, setTimingDisplay] = useState('');
  const _bumpTiming = (key) => {
    const t0 = _timingsRef.current.tap || performance.now();
    const now = performance.now();
    _timingsRef.current[key] = Math.round(now - t0);
    // Format for inline display
    const t = _timingsRef.current;
    const fmt = (ms) => (ms == null ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
    const line = [
      t.tap != null ? `tap=0` : null,
      t.focus != null ? `focus=${fmt(t.focus)}` : null,
      t.change != null ? `change=${fmt(t.change)}` : null,
      t.setMedia != null ? `setMedia=${fmt(t.setMedia)}` : null,
      t.thumb != null ? `thumb=${fmt(t.thumb)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    setTimingDisplay(line);
    try {
      sessionStorage.setItem('sp-upload-timings', JSON.stringify(_timingsRef.current));
    } catch (_) {}
  };
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  // 🔗 LINK PREVIEW STATE - SmarterPoker-style auto-detect
  const [linkPreview, setLinkPreview] = useState(null); // { url, title, image, domain }
  // 📍 CHECK-IN STATE
  const [checkInVenue, setCheckInVenue] = useState(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const identityPickerRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const mentionTimeout = useRef(null);
  const linkTimeout = useRef(null);
  const draftTimeout = useRef(null);
  const _submittingRef = useRef(false); // local double-submit guard
  const mountedRef = useRef(true); // guards setState after unmount
  const compressionRef = useRef({}); // { [blobUrl]: { controller, promise, result } }
  // RACE FIX (2026-04-29): track in-flight thumbnail promises so handlePost
  // can await them. Without this, every upload where the user taps Post
  // before generateThumbnail finishes (which is virtually all iPhone uploads
  // because HEVC decode is slow) ships with thumbnail_url=NULL. SQL audit
  // confirmed ZERO thumbnails ever uploaded for ANY user before this fix.
  const thumbnailPromiseRef = useRef({}); // { [blobUrl]: Promise<dataUrl|null> }
  const _pickerOpenRef = useRef(false); // tracks if iOS file picker is open

  // Identity switching
  const { isClubMode, clubPage, hasClubPage, switchToPersonal, switchToClub } = useActiveIdentity();

  // Home group post targets
  const [homeGroupTargets, setHomeGroupTargets] = useState([]);
  const [activeHomeGroup, setActiveHomeGroup] = useState(null); // null = not posting as home group

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .rpc('fn_list_my_post_targets')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const hgs = (data || []).filter((t) => t.kind === 'home_group');
        if (!cancelled) setHomeGroupTargets(hgs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Click-outside handler: auto-close identity picker dropdown
  useEffect(() => {
    if (!showIdentityPicker) return;
    const handleClickOutside = (e) => {
      if (identityPickerRef.current && !identityPickerRef.current.contains(e.target)) {
        setShowIdentityPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showIdentityPicker]);

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem('sp-post-draft');
      if (draft && !content) setContent(draft);
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  }, []);

  // AUDIT-16: refresh the session whenever the tab returns from
  // backgrounded. iOS Safari suspends the SDK's auto-refresh timer when
  // the tab is hidden (lock screen, app switch, push notification, OS
  // file picker). The session can silently expire while the user is away.
  // This visibilitychange listener forces a fresh refresh the moment they
  // return, so any subsequent upload or post-create gets a fresh JWT.
  useEffect(() => {
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        supabase.auth['getSession']().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Track media via ref for cleanup (avoids stale closure in useEffect)
  const mediaRef = useRef(media);
  mediaRef.current = media;

  // Cleanup pending timeouts + blob URLs on unmount
  useEffect(() => {
    return () => {
      if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
      if (linkTimeout.current) clearTimeout(linkTimeout.current);
      if (draftTimeout.current) clearTimeout(draftTimeout.current);
      // NOTE: Do NOT unsubscribe bgUpload here. The listener must stay alive
      // so onComplete fires and triggers the DB insert.
      // Cleanup happens via bgUpload.abort() when a new upload starts.
      // Revoke any staged blob URLs to free memory
      mediaRef.current.forEach((m) => {
        if (m.file && m.url?.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(m.url);
          } catch (_) {}
        }
      });
      // Abort any running background compressions
      Object.values(compressionRef.current).forEach((c) => {
        try {
          c.controller?.abort();
        } catch (_) {}
      });
      compressionRef.current = {};
      // AUDIT-MAX (2026-05-03 Pass 4 finding): clear thumbnail promise
      // ref so resolved values don't keep references alive after unmount.
      // generateThumbnail can't be aborted (it returns a bare Promise),
      // but dropping the ref lets the Promise + its resolved data url
      // get garbage-collected once the in-flight decode finishes.
      thumbnailPromiseRef.current = {};
      mountedRef.current = false;
    };
  }, []);

  // Paste image handler — feeds into existing upload pipeline
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    if (!user?.id) {
      setError('Please log in to upload media.');
      return;
    }
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (!imageFiles.length) return;
    e.preventDefault();
    const remaining = MAX_MEDIA - media.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_MEDIA} images allowed`);
      return;
    }
    setUploading(true);
    const uploaded = [];
    for (const file of imageFiles.slice(0, remaining)) {
      try {
        const compressedFile = await compressImage(file);
        if (compressedFile.size > 4.5 * 1024 * 1024) {
          setError('Pasted image is too large (max 4.5MB). Please copy a smaller image.');
          continue;
        }
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('folder', 'photos');
        formData.append('prefix', user.id);
        const token = getAccessToken();
        if (!token) {
          setError('Authentication required — please refresh the page and try again.');
          continue;
        }
        const res = await fetch('/api/social/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const json = await res.json();
        if (json.success && json.url) uploaded.push({ type: 'photo', url: json.url });
        else setError('Paste upload failed: ' + (json.error || 'Unknown'));
      } catch (err) {
        setError('Paste upload failed: ' + err.message);
      }
    }
    if (uploaded.length) {
      setMedia((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} image${uploaded.length > 1 ? 's' : ''} pasted!`);
    }
    setUploading(false);
  };

  // ── iOS FILE PICKER PREPARATION DETECTION ────────────────────────────────
  // On iOS, after the user selects a video and taps the blue checkmark,
  // the OS transcodes HEVC→H.264 which can take 30-90+ seconds.
  // During this time, our onChange never fires → dead screen.
  // Instead of relying on focus events (which don't fire on iOS), we show
  // a visible "Preparing..." indicator immediately when the button is clicked.
  // The indicator stays until handleFiles fires (file ready or cancel).
  //
  // CANCEL DETECTION: On iOS, tapping Cancel in the picker doesn't fire onChange.
  // We use visibilitychange as a secondary signal — when the picker dismisses,
  // visibilitychange-based clear was REMOVED 2026-04-30: iOS Safari does NOT
  // fire visibilitychange when its file picker opens/closes, so this timer
  // was both ineffective on iOS AND racing against the deferred clear in
  // handleFiles. The banner now lifecycle: handleFiles raises it when a file
  // is selected → cleared via thumbnailPromise OR 30s ceiling at the bottom
  // of handleFiles. A 60s ultimate-backstop timer guards against stuck state
  // if the deferred clear logic ever errors.
  useEffect(() => {
    if (!preparingMedia) return;
    const backstop = setTimeout(() => {
      if (mountedRef.current) {
        setPreparingStage(null);
        _pickerOpenRef.current = false;
        _hasFileArrivedRef.current = false;
      }
    }, 90_000);
    return () => clearTimeout(backstop);
  }, [preparingMedia]);

  // AUDIT-6 (2026-04-30 per Dan): instant on-tap feedback. The moment the
  // user taps the Photo/Video button we raise the banner in 'picker'
  // state. iOS Safari does NOT fire visibilitychange around its file
  // picker, but it DOES restore window focus when the picker dismisses
  // (selection or cancel). When focus returns:
  //   • If a change event fires within ~5s → handleFiles transitions
  //     stage to 'staging' (the file is now in our hands).
  //   • If no change event fires → user cancelled. Clear the banner.
  // Without this listener, a cancelled picker would leave the banner up
  // until the 90s ultimate backstop fired.
  useEffect(() => {
    if (preparingStage !== 'picker') return;
    const onFocus = () => {
      if (!mountedRef.current) return;
      _bumpTiming('focus'); // AUDIT-13: T-elapsed when picker dismisses
      // Picker just dismissed. Switch to 'loading' state — iOS is now
      // doing its sandbox-copy / iCloud-pull work before firing change.
      setPreparingStage((prev) => (prev === 'picker' ? 'loading' : prev));
      // AUDIT-8 FIX (2026-04-30 per Dan — REPRODUCED ON HIS iPHONE):
      // NO short watchdog. The previous 5s 'cancel detection' fired
      // mid-handoff for legitimate iPhone HEVC selections (the iOS
      // sandbox-copy + iCloud-pull window is 5-30s, not <5s). Net
      // effect for Dan: banner cleared at T+5s, then 5-25s of BLANK
      // screen until the change event finally fired and staging
      // started. Exactly what he reported: "nothing happens for 25-30s
      // before the video starts staging". Removing the watchdog
      // entirely; the banner now stays up through the entire iOS
      // handoff. Cancel detection falls back to the 90s ultimate
      // backstop (sibling useEffect above) — annoying if the user
      // genuinely cancels (banner stuck for up to 90s) but
      // ZERO risk of clearing a banner mid-legitimate-upload, which
      // was the user-visible disaster.
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [preparingStage]);

  /**
   * handleFiles — STAGE ONLY (instant, no freeze)
   * Creates local blob preview URLs so user can see thumbnails and type a caption.
   * Actual upload happens in handlePost when user taps Post.
   *
   * Pipeline during staging (all background, zero freeze):
   *   1. Client-side file size validation (instant reject > 5GB)
   *   2. Blob URL for preview thumbnail
   *   3. Auto-thumbnail generation via canvas (2s frame)
   *   4. Background video compression for files > 50MB
   *   5. Signed URL prefetch for first video
   */
  // AUDIT-9 (2026-04-30 per Dan: silent fail on iPhone). The change event
  // fires after a 25-30s iOS handoff, but somewhere between that fire and
  // staging-tile-rendered, the flow was failing without surfacing any
  // error or toast — looking like the app froze. The real handler below
  // is now wrapped so ANY thrown error is captured and shown to the user
  // both via setError (composer red banner) and toast (top-of-screen).
  // A diagnostic trail is also written to sessionStorage so Dan can
  // copy-paste it back to me on the next failure.
  const _logUploadStep = (step, extra) => {
    try {
      const trail = JSON.parse(sessionStorage.getItem('sp-upload-debug') || '[]');
      trail.push({ t: new Date().toISOString(), step, ...extra });
      // Keep only the last 30 entries to avoid unbounded growth.
      sessionStorage.setItem('sp-upload-debug', JSON.stringify(trail.slice(-30)));
      if (typeof console !== 'undefined') console.log('[SharedPostCreator]', step, extra || '');
    } catch (_) {
      /* sessionStorage may be unavailable */
    }
  };
  const handleFiles = async (e) => {
    try {
      _bumpTiming('change'); // AUDIT-13: T-elapsed when iOS dispatched the change event (handoff complete)
      _logUploadStep('handleFiles:enter', { files: e?.target?.files?.length });
      // Picker closed AND a file was actually selected (no-files handled below).
      _pickerOpenRef.current = false;

      // AUDIT-6: mark that the change event fired so the focus-watchdog in
      // the useEffect above does NOT clear the banner. Then transition to
      // 'staging' — JS now has the File handle, the slow iOS handoff is
      // over, we're doing our own work. Also explicitly clear the
      // watchdog timer here — it would fire harmlessly (the
      // _hasFileArrivedRef check skips), but clearing now frees the
      // setTimeout reference immediately instead of leaking it for ~5s.
      if (e?.target?.files?.length > 0) {
        _hasFileArrivedRef.current = true;
        if (_focusGraceTimerRef.current) {
          clearTimeout(_focusGraceTimerRef.current);
          _focusGraceTimerRef.current = null;
        }
        setPreparingStage('staging');
      }

      const files = Array.from(e.target.files);
      if (!files.length) {
        setPreparingStage(null);
        return;
      }
      if (!user?.id) {
        setError('Please log in to upload media.');
        setPreparingStage(null);
        return;
      }

      // KILL-COMPOSE-V2-FORK (2026-05-03 per Dan: "nothing works, make it
      // fully functional so I can actually post videos again"):
      // The detour to /hub/social-media/compose introduced too many
      // failure modes (router race, store sync, AlbumPicker auto-click,
      // EditPostScreen mount timing). The inline staging path below
      // (handlePost ~line 706) is the proven flow that works on iPhone
      // and desktop. Falling through to it now. /compose is still
      // reachable as a direct URL but we no longer auto-route there.

      // Check total media limit
      const remaining = MAX_MEDIA - media.length;
      if (remaining <= 0) {
        setError(`Maximum ${MAX_MEDIA} images/videos allowed per post`);
        setPreparingMedia(false);
        return;
      }
      const filesToStage = files.slice(0, remaining);
      if (files.length > remaining) {
        setError(`Only ${remaining} more file(s) can be added (max ${MAX_MEDIA})`);
      }

      setError('');

      // Stage files instantly with local blob URLs — ZERO network calls, ZERO freeze
      const staged = [];
      for (const file of filesToStage) {
        const mimeType = sniffMimeType(file);
        const isVideo = mimeType.startsWith('video/');

        // ── CLIENT-SIDE SIZE VALIDATION (instant, before any processing) ──
        // POPUP CLEANUP (2026-04-29 per Dan): only show ONE upload toast
        // ("Upload running in background"). The validation warnings
        // ("Large video", "Your video will be optimized…") fired in
        // ADDITION to the background toast and made the user see 3 stacked
        // popups for every video. Removed; keep only the hard-error path.
        if (isVideo) {
          const validation = validateVideoFile(file);
          if (!validation.valid) {
            setError(validation.error);
            continue; // skip this file, try the rest
          }
          // Soft warnings deliberately not shown — single bg toast is enough.
        }

        const localUrl = URL.createObjectURL(file);
        staged.push({
          type: isVideo ? 'video' : 'photo',
          url: localUrl,
          file, // raw File object — uploaded in handlePost
          thumbnail: null, // set async below for videos
        });
      }

      // AUDIT-3 FIX: if all files were rejected (size cap, etc.), clear the
      // banner here too — the bottom Promise.race only runs for the
      // happy path. Without this, an all-rejected batch leaves the
      // 'Preparing your video' banner up for the full 60s backstop.
      if (!staged.length) {
        _logUploadStep('handleFiles:exit-no-staged', {
          reason: 'all files rejected by validation',
        });
        setPreparingMedia(false);
        // AUDIT-9: previously the banner just disappeared with no
        // explanation. Surface a visible error so the user knows WHY.
        try {
          toast.error('No file was staged — file may be too large (>5GB) or unsupported format');
        } catch (_) {}
        setError('No file was staged. The file may be too large or in an unsupported format.');
        return;
      }
      _logUploadStep('handleFiles:setMedia', {
        count: staged.length,
        types: staged.map((s) => s.type),
      });
      _bumpTiming('setMedia'); // AUDIT-13: T-elapsed at setMedia (validation+blob URL creation done)
      setMedia((prev) => [...prev, ...staged]);

      // ⚡ INSTANT FEEDBACK is now handled by the inline "Preparing Your Video"
      // banner at the top of the composer + the "Generating thumbnail…"
      // pulse on the preview tile. No toast here — Dan asked to keep
      // exactly one popup (the background-running one), and that fires
      // on Post-tap, not on file-select.

      // ── BACKGROUND PROCESSING (runs while user types caption) ────────────
      // AUDIT-12 (2026-04-30 per Dan: "this is what I want" — screenshot
      // showed a real thumbnail with 1:16 duration overlay). Reverting
      // the audit-6 mobile-skip. Run generateThumbnail on mobile too —
      // it's been heavily optimized (audit-3 fast-path captures the first
      // decoded frame in 1-2s on iOS, 8s hard cap). The previous theory
      // that mobile HEVC decode + iOS handoff was unbearable was wrong:
      // the actual crash was the autoplay-<video> staging tile, which is
      // now a static placeholder. With the real thumbnail running, Dan
      // sees the iOS-style preview tile he expects.
      // AUDIT-MAX (2026-05-03 Pass 2 finding): a stray `break` at the bottom
      // of this loop was meant to limit ONLY the bgUpload.prefetch call to
      // the first video, but it short-circuited thumbnail + compression for
      // videos #2..#N too. Multi-video posts shipped with no thumbnails on
      // the trailing tiles and uncompressed copies sent over the wire.
      // Restructured: thumbnail + compression run for EVERY video; prefetch
      // runs once for the first.
      for (const item of staged) {
        if (item.type !== 'video') continue;

        // 1. Auto-thumbnail: extract frame at ~2s via canvas.
        // Store the PROMISE in a ref so handlePost can await it. Without this
        // the captured `staged` array in handlePost has thumbnail=null forever
        // because React state updates don't mutate captured references —
        // every iPhone upload was shipping with thumbnail_url=NULL because
        // HEVC decode (~30s) never finished before user tapped Post.
        const thumbPromise = generateThumbnail(item.file)
          .then((thumb) => {
            _bumpTiming('thumb'); // AUDIT-13: T-elapsed at thumbnail resolution
            if (mountedRef.current && thumb) {
              setMedia((prev) =>
                prev.map((m) => (m.url === item.url ? { ...m, thumbnail: thumb } : m))
              );
            }
            return thumb || null;
          })
          .catch((err) => {
            _bumpTiming('thumb');
            console.warn('[SharedPostCreator] generateThumbnail failed:', err?.message || err);
            return null;
          });
        thumbnailPromiseRef.current[item.url] = thumbPromise;

        // 2. Background compression for large videos (> 50MB, < 2min)
        const controller = new AbortController();
        const compPromise = compressVideo(item.file, {
          signal: controller.signal,
          onProgress: ({ pct }) => {
            if (!mountedRef.current) return;
            // Update compression progress in media state
            setMedia((prev) =>
              prev.map((m) => (m.url === item.url ? { ...m, compressPct: pct } : m))
            );
          },
        }).then((result) => {
          // AUDIT-MAX-3 (2026-05-03 Pass 1 finding): the original code
          // unconditionally re-set compressionRef.current[item.url] here,
          // which RESURRECTED a deleted entry if the user removed the
          // staged item via the × button between staging and compression
          // completion. The resurrected entry was `{...undefined, result}`
          // = `{result}` — controller missing, so the unmount cleanup
          // loop's c.controller?.abort() silently no-op'd and the
          // compressed File blob stayed pinned until next composer reset.
          // Now: only update if the entry still exists.
          if (compressionRef.current[item.url]) {
            compressionRef.current[item.url] = { ...compressionRef.current[item.url], result };
          }
          if (result.compressed && mountedRef.current) {
            const savedMB = Math.round(
              (result.originalSize - result.compressedSize) / (1024 * 1024)
            );
            toast.success(
              `Video compressed — saved ${savedMB}MB (${result.savings}% smaller)`,
              3000
            );
            setMedia((prev) =>
              prev.map((m) => (m.url === item.url ? { ...m, compressPct: null } : m))
            );
          }
          return result;
        });
        compressionRef.current[item.url] = { controller, promise: compPromise, result: null };
      }

      // 3. Signed URL prefetch — only for the first video (one upload-url at a
      //    time; subsequent prefetches would clobber the cached signed URL
      //    that bgUpload.start consumes).
      const firstStagedVideo = staged.find((s) => s.type === 'video');
      if (firstStagedVideo) {
        bgUpload.prefetch({ file: firstStagedVideo.file, userId: user.id, folder: 'videos' });
      }

      // Reset file input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = '';

      // Clear the "Preparing Your Video" spinner once the first thumbnail
      // resolves OR after a 30s ceiling (whichever comes first). The
      // per-tile "Generating thumbnail…" pulse takes over from there.
      // Without this, mobile users saw a 20-30 second blank UI between
      // picking the file and any feedback.
      const firstVideoStaged = staged.find((s) => s.type === 'video');
      if (firstVideoStaged) {
        const promise = thumbnailPromiseRef.current[firstVideoStaged.url];
        const ceiling = new Promise((r) => setTimeout(r, 30_000));
        Promise.race([promise || Promise.resolve(null), ceiling]).finally(() => {
          if (mountedRef.current) setPreparingMedia(false);
        });
      } else {
        setPreparingMedia(false);
      }
      _logUploadStep('handleFiles:exit-success');
    } catch (err) {
      // AUDIT-9 (2026-04-30 per Dan): NEVER let handleFiles fail
      // silently. Whatever throws here MUST surface to the user as
      // a visible error so they don't sit staring at a frozen UI
      // wondering if the app is broken (the symptom Dan reported).
      const msg = err?.message ? String(err.message).slice(0, 300) : 'Unknown staging error';
      _logUploadStep('handleFiles:THREW', {
        message: msg,
        stack: (err?.stack || '').slice(0, 500),
      });
      try {
        console.error('[SharedPostCreator] handleFiles threw:', err);
      } catch (_) {}
      if (mountedRef.current) {
        setPreparingStage(null);
        _pickerOpenRef.current = false;
        _hasFileArrivedRef.current = false;
        setError(`Staging failed: ${msg}`);
        try {
          toast.error(`Video staging failed: ${msg}`, 6000);
        } catch (_) {}
      }
      // Clear the file input so the user can try again with the same file
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Handle @mention detection AND auto URL detection (SmarterPoker-style)
  const handleContentChange = (e) => {
    const value = e.target.value;
    const pos = e.target.selectionStart;

    // Debounced draft save to localStorage
    if (draftTimeout.current) clearTimeout(draftTimeout.current);
    draftTimeout.current = setTimeout(() => {
      try {
        if (value.trim()) localStorage.setItem('sp-post-draft', value);
        else localStorage.removeItem('sp-post-draft');
      } catch (e) {
        console.warn('[App] Handled exception:', e);
      }
    }, 2000);

    // 🔗 AUTO-DETECT URLs - SmarterPoker-style: remove URL and show preview card
    // ONLY trigger when URL is followed by a space (user finished typing the URL)
    const urlRegex = /((?:https?:\/\/|www\.)\S+)\s/i;
    const urlMatch = value.match(urlRegex);

    if (urlMatch && !linkPreview && !linkLoading) {
      let detectedUrl = urlMatch[1];
      detectedUrl = detectedUrl.replace(/[.,;:!?)]+$/, '');
      if (detectedUrl.toLowerCase().startsWith('www.')) detectedUrl = 'https://' + detectedUrl;

      const isYouTube = /youtube\.com|youtu\.be/i.test(detectedUrl);
      const cleanedValue = value.replace(urlMatch[0], '').trim();
      setContent(cleanedValue);
      setLinkLoading(true);

      if (linkTimeout.current) clearTimeout(linkTimeout.current);

      linkTimeout.current = setTimeout(async () => {
        try {
          if (isYouTube) {
            const validation = await validateYouTubeVideo(detectedUrl);
            if (!validation.valid) {
              setError(`❌ ${validation.error}`);
              setLinkLoading(false);
              return;
            }
            const videoId = getYouTubeVideoId(detectedUrl);
            setLinkPreview({
              url: detectedUrl,
              title: 'YouTube Video',
              image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              domain: 'youtube.com',
              type: 'video',
            });
          } else {
            try {
              const response = await fetch(
                `/api/link-preview?url=${encodeURIComponent(detectedUrl)}`
              );
              if (!response.ok) throw new Error(`Request failed (${response.status})`);
              const metadata = await response.json();

              setLinkPreview({
                url: detectedUrl,
                title: metadata.title || 'Link',
                description: metadata.description || null,
                image: metadata.image || null,
                domain: metadata.siteName || new URL(detectedUrl).hostname.replace(/^www\./i, ''),
                type: 'link',
              });
            } catch (apiError) {
              setLinkLoading(false);
              console.warn('Link preview API error:', apiError);
              const domain = new URL(detectedUrl).hostname.replace(/^www\./i, '');
              setLinkPreview({
                url: detectedUrl,
                title: domain,
                description: null,
                image: null,
                domain: domain,
                type: 'link',
              });
            }
          }
        } catch (err) {
          console.warn('Link preview error:', err);
          setError('Could not load link preview');
        }
        setLinkLoading(false);
      }, 300);

      setCursorPosition(cleanedValue.length);
      return;
    }

    setContent(value);
    setCursorPosition(pos);

    // Check for @mention pattern
    const textBeforeCursor = value.substring(0, pos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      setShowMentions(true);

      if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
      if (query.length >= 1) {
        mentionTimeout.current = setTimeout(async () => {
          try {
            const { data } = await supabase
              .from('profiles')
              // BUG-13 FIX: also select display_name as fallback when full_name is null
              .select('id, username, full_name, display_name')
              .ilike('username', `%${query}%`)
              .limit(5);
            if (data) setMentionResults(data);
          } catch (e) {
            console.warn(e);
          }
        }, 200);
      }
    } else {
      setShowMentions(false);
      setMentionResults([]);
    }
  };

  const removeLinkPreview = () => {
    setLinkPreview(null);
    setError('');
  };

  const insertMention = (u) => {
    const textBeforeCursor = content.substring(0, cursorPosition);
    const textAfterCursor = content.substring(cursorPosition);
    const mentionStart = textBeforeCursor.lastIndexOf('@');
    const newContent =
      textBeforeCursor.substring(0, mentionStart) + `@${u.username} ` + textAfterCursor;
    setContent(newContent);
    setShowMentions(false);
    setMentionResults([]);
    inputRef.current?.focus();
  };

  const handlePost = async () => {
    if (isPosting || _submittingRef.current) return; // Double-submit guard
    _submittingRef.current = true;
    // BUG-10 FIX (2026-04-29): wrap entire body in try/finally so that any
    // uncaught throw (network error in onPost, validateYouTubeVideo,
    // /api/social/pages/posts, etc.) doesn't leave _submittingRef stuck at
    // true and freeze the Post button until full page reload.
    try {
      if (!content.trim() && !media.length && !linkPreview && !checkInVenue) {
        _submittingRef.current = false;
        return;
      }
      setError('');

      // PHASE-A (2026-05-03): network pre-check. If the device is offline OR
      // the connection is too slow to plausibly complete the upload, fail
      // fast with a clear message instead of letting TUS retry-loop for 60s
      // and then spit out a generic "Upload failed: timeout" error. We
      // check navigator.onLine + navigator.connection.effectiveType (Network
      // Information API) — both are advisory, but they catch the common
      // "airplane mode mid-flight" / "subway tunnel" cases that produce
      // the worst UX. Only block on hard offline; warn-only on slow.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError("You're offline. Reconnect and try again.");
        try {
          toast.error("You're offline. Reconnect and try again.", 5000);
        } catch (_) {}
        _submittingRef.current = false;
        return;
      }
      if (media.some((m) => m.type === 'video') && typeof navigator !== 'undefined') {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const eff = conn?.effectiveType;
        if (eff === 'slow-2g' || eff === '2g') {
          // Don't block — just warn. Some 2g connections can still
          // upload tiny files, and Network Information API isn't
          // available everywhere; treating it as fatal would falsely
          // block users on browsers that don't expose it.
          try {
            toast.info('Slow connection detected — upload may take a while.', 4000);
          } catch (_) {}
        }
      }

      // AUDIT-17 (2026-04-30 per Dan: "make all real deep corrections,
      // zero patches"). Refresh the session at the START of every post,
      // BUT WITH A TIMEOUT GUARD. Audit-16 used a bare
      // supabase.auth['getSession']() — that call uses navigator.locks
      // internally, and on iPhone Safari the lock can be held by a
      // stale tab/session and never release. Without a timeout, every
      // Post tap would hang forever. Race against a 4s timer: if
      // getSession doesn't resolve in 4s, fall through to
      // localStorage-only validation (same approach bgUpload._ensureBearer
      // uses). The post then proceeds with whatever token is currently
      // cached, and if it's expired the post-create's own session-refresh
      // (audit-15) gets one more shot.
      try {
        const _withTimeout = (p, ms, label) =>
          Promise.race([
            p,
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
            ),
          ]);
        // AUDIT-18: an access_token in localStorage may be shape-valid
        // but expired. Accepting it makes the upload+post run with an
        // expired JWT; bgUpload's pre-flight gets 401 from Storage and
        // fn_create_social_post returns 'forbidden: anonymous'. Validate
        // the exp claim (same _isFreshJWT pattern bgUpload uses) so the
        // fast-path only applies when the token is genuinely fresh.
        const _isFreshJwt = (tok) => {
          if (typeof tok !== 'string') return false;
          const parts = tok.split('.');
          if (parts.length !== 3) return false;
          try {
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
            const json =
              typeof atob === 'function'
                ? atob(b64 + pad)
                : Buffer.from(b64 + pad, 'base64').toString('utf-8');
            const payload = JSON.parse(json);
            if (typeof payload.exp !== 'number') return false;
            return payload.exp > Math.floor(Date.now() / 1000) + 30; // 30s skew
          } catch (_) {
            return false;
          }
        };
        let sessionOk = false;
        try {
          const { data } = await _withTimeout(supabase.auth['getSession'](), 4000, 'getSession');
          sessionOk = _isFreshJwt(data?.session?.access_token);
        } catch (lockErr) {
          console.warn(
            '[SharedPostCreator] getSession timed out (likely locks contention):',
            lockErr?.message
          );
        }
        if (!sessionOk) {
          // Fall back to localStorage check — same as bgUpload's _ensureBearer.
          try {
            const raw = localStorage.getItem('smarter-poker-auth');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (_isFreshJwt(parsed?.access_token)) sessionOk = true;
            }
          } catch (_) {
            /* localStorage may be unavailable */
          }
        }
        if (!sessionOk) {
          // Last resort: try refreshSession with same timeout guard.
          try {
            const { data: refreshed } = await _withTimeout(
              supabase.auth.refreshSession(),
              4000,
              'refreshSession'
            );
            if (_isFreshJwt(refreshed?.session?.access_token)) sessionOk = true;
          } catch (refreshErr) {
            console.warn('[SharedPostCreator] refreshSession timed out:', refreshErr?.message);
          }
        }
        if (!sessionOk) {
          if (mountedRef.current)
            setError('Your session has expired. Please refresh the page or log in again.');
          _submittingRef.current = false;
          return;
        }
      } catch (sessionErr) {
        // Never block the post over a session-refresh exception. Log and continue.
        // The post-create call's own refresh (audit-15) is the safety net.
        console.warn(
          '[SharedPostCreator] Session preflight threw:',
          sessionErr?.message || sessionErr
        );
      }

      // ── STEP 1: Upload any staged files (files with .file property) ──────
      const stagedFiles = media.filter((m) => m.file);
      let uploadedMedia = media.filter((m) => !m.file); // already-uploaded items stay as-is

      if (stagedFiles.length > 0) {
        setUploading(true);
        setUploadProgress({ pct: 0, label: 'Uploading…' });

        for (const staged of stagedFiles) {
          const isVideo = staged.type === 'video';
          const folder = isVideo ? 'videos' : 'photos';
          let bgUnsub = null; // hoisted: accessible in catch regardless of video/image path
          try {
            if (isVideo) {
              // ── Use compressed file if background compression finished ──
              let fileToUpload = staged.file;
              const comp = compressionRef.current[staged.url];
              if (comp?.promise) {
                try {
                  const result =
                    comp.result ||
                    (await Promise.race([
                      comp.promise,
                      new Promise((r) =>
                        setTimeout(() => r({ file: staged.file, compressed: false }), 500)
                      ),
                    ]));
                  if (result.compressed) fileToUpload = result.file;
                } catch (_) {
                  /* use original */
                }
              }

              // ── Background-capable video upload ─────────────────────
              const videoUrl = await new Promise((resolve, reject) => {
                // start() MUST be called before subscribe() because start() clears existing listeners
                // to supersede any pending uploads. If subscribe() is called first, it gets wiped.
                bgUpload
                  .start({
                    file: fileToUpload,
                    userId: user.id,
                    folder,
                    content: content?.trim(),
                    thumbnail: staged.thumbnail,
                  })
                  .catch(reject);
                bgUnsub = bgUpload.subscribe({
                  onProgress: ({ pct, label }) => {
                    if (!mountedRef.current) return;
                    setUploadProgress({ pct, label });
                  },
                  onComplete: ({ publicUrl }) => resolve(publicUrl),
                  onError: ({ error }) => reject(error),
                  onBackground: () => {
                    // Upload moved to background — reset the composer.
                    // GhostPostCard in the feed shows progress.
                    if (mountedRef.current) {
                      setUploadProgress(null);
                      setUploading(false);
                      setContent('');
                      setMedia([]);
                      setLinkPreview(null);
                      try {
                        localStorage.removeItem('sp-post-draft');
                      } catch (_) {}
                    }
                  },
                });
              });
              if (bgUnsub) bgUnsub();
              // Revoke blob URL now that we have the real URL
              if (staged.url?.startsWith('blob:')) {
                try {
                  URL.revokeObjectURL(staged.url);
                } catch (_) {}
              }
              // Clean up compression cache
              delete compressionRef.current[staged.url];
              uploadedMedia.push({ type: 'video', url: videoUrl });

              // Persist thumbnail to cloud storage. RACE FIX
              // (2026-04-29): the thumbnail data URL may not be on
              // staged yet — generateThumbnail runs in the background
              // since file-select. If user tapped Post before it
              // finished (every iPhone HEVC upload), staged.thumbnail
              // is null. AWAIT the stored promise (with 60s ceiling
              // for slow iPhone HEVC decode) before deciding to skip.
              let thumbDataUrl = staged.thumbnail;
              const pendingThumbPromise = thumbnailPromiseRef.current[staged.url];
              if (!thumbDataUrl && pendingThumbPromise) {
                try {
                  thumbDataUrl = await Promise.race([
                    pendingThumbPromise,
                    new Promise((r) => setTimeout(() => r(null), 60_000)),
                  ]);
                } catch (e) {
                  console.warn(
                    '[SharedPostCreator] await thumbnail promise threw:',
                    e?.message || e
                  );
                }
              }
              if (thumbDataUrl) {
                try {
                  const thumbUrl = await uploadThumbnail(thumbDataUrl, user.id);
                  if (thumbUrl) {
                    uploadedMedia.push({ type: 'thumbnail', url: thumbUrl });
                  } else {
                    console.warn(
                      '[SharedPostCreator] uploadThumbnail returned null — see thumbnailUploader logs for HTTP details'
                    );
                  }
                } catch (e) {
                  console.warn('[SharedPostCreator] uploadThumbnail threw:', e?.message || e);
                }
              } else {
                console.warn(
                  '[SharedPostCreator] no thumbnail dataUrl after wait — post will save without thumbnail_url'
                );
              }
              // Cleanup: free the promise ref so we don't leak memory
              delete thumbnailPromiseRef.current[staged.url];
            } else {
              // Compress image before upload
              const compressedFile = await compressImage(staged.file);
              if (compressedFile.size > 4.5 * 1024 * 1024) {
                setError(`Image too large (max 4.5MB). Please choose a smaller image.`);
                // Revoke blob URL for skipped file
                if (staged.url?.startsWith('blob:')) {
                  try {
                    URL.revokeObjectURL(staged.url);
                  } catch (_) {}
                }
                continue;
              }
              const formData = new FormData();
              formData.append('file', compressedFile);
              formData.append('folder', folder);
              formData.append('prefix', user.id);
              const _imgToken = getAccessToken();
              if (!_imgToken) {
                setError('Authentication required — please refresh the page and try again.');
                // Revoke blob URL for skipped file
                if (staged.url?.startsWith('blob:')) {
                  try {
                    URL.revokeObjectURL(staged.url);
                  } catch (_) {}
                }
                continue;
              }
              const res = await fetch('/api/social/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${_imgToken}` },
                body: formData,
              });
              if (!res.ok) throw new Error(`Request failed (${res.status})`);
              const json = await res.json();
              if (json.success && json.url) {
                // Revoke blob URL
                if (staged.url?.startsWith('blob:')) {
                  try {
                    URL.revokeObjectURL(staged.url);
                  } catch (_) {}
                }
                uploadedMedia.push({ type: json.type || 'photo', url: json.url });
              } else {
                setError('Upload failed: ' + (json.error || 'Unknown error'));
                // Revoke blob URL for failed upload
                if (staged.url?.startsWith('blob:')) {
                  try {
                    URL.revokeObjectURL(staged.url);
                  } catch (_) {}
                }
              }
            }
          } catch (err) {
            if (bgUnsub) {
              bgUnsub();
              bgUnsub = null;
            } // Always clean up listener
            console.warn('[SharedPostCreator] Upload error:', err);
            const isCancelled =
              err?.message === 'Upload cancelled' ||
              err?.message === 'Upload aborted' ||
              err?.message === 'Upload superseded';
            if (isCancelled) {
              // User-initiated cancel — reset state silently, don't show error
              if (mountedRef.current) {
                setUploadProgress(null);
                setUploading(false);
              }
              _submittingRef.current = false;
              return;
            }
            // PHASE-A (2026-05-03): map common low-level errors to
            // human-readable messages. Generic "Upload failed: <msg>"
            // hides the real cause from users (every iPhone JWT-stale
            // bug looked like "Upload failed: Invalid Compact JWS"
            // which means nothing to a non-engineer). Patterns are
            // matched on the error message string because tus-js-client
            // doesn't expose status codes consistently across versions.
            const rawMsg = (err?.message || String(err) || 'unknown').toLowerCase();
            let friendlyMsg;
            if (
              rawMsg.includes('compact jws') ||
              rawMsg.includes('jwt expired') ||
              rawMsg.includes('jws') ||
              rawMsg.includes('access denied') ||
              rawMsg.includes('unauthorized')
            ) {
              friendlyMsg = 'Your session expired. Please refresh the page or log in again.';
            } else if (
              rawMsg.includes('413') ||
              rawMsg.includes('too large') ||
              rawMsg.includes('payload too large')
            ) {
              friendlyMsg = 'Video file is too large. Maximum 5GB.';
            } else if (
              rawMsg.includes('403') ||
              rawMsg.includes('forbidden') ||
              rawMsg.includes('not allowed') ||
              rawMsg.includes('row level security')
            ) {
              friendlyMsg =
                'Permission denied — your account may not have upload access. Please log out and back in.';
            } else if (
              rawMsg.includes('mime') ||
              rawMsg.includes('type not allowed') ||
              rawMsg.includes('content type')
            ) {
              friendlyMsg = 'File format not supported. Try MP4, MOV, or HEVC.';
            } else if (
              rawMsg.includes('network') ||
              rawMsg.includes('failed to fetch') ||
              rawMsg.includes('econnreset') ||
              rawMsg.includes('timeout') ||
              rawMsg.includes('aborted')
            ) {
              friendlyMsg = 'Network error during upload. Check your connection and try again.';
            } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
              friendlyMsg = "You're offline. Reconnect and try again.";
            } else {
              friendlyMsg = 'Upload failed: ' + (err?.message || 'unknown error');
            }
            if (mountedRef.current) {
              setError(friendlyMsg);
              setUploadProgress(null);
              setUploading(false);
            }
            try {
              toast.error(friendlyMsg, 7000);
            } catch (_) {}
            _submittingRef.current = false;
            return; // abort post on upload failure
          }
        }
        if (mountedRef.current) {
          setUploadProgress(null);
          setUploading(false);
        }
      }

      // ── STEP 2: Create the post with uploaded URLs ───────────────────────
      let urls = uploadedMedia.filter((m) => m.type !== 'thumbnail').map((m) => m.url);
      let type = uploadedMedia.some((m) => m.type === 'video')
        ? 'video'
        : uploadedMedia.filter((m) => m.type !== 'thumbnail').length
          ? 'image'
          : 'text';
      // Persist thumbnail URL for video posts — extracted from uploadedMedia or from direct upload above
      const persistedThumbnailUrl = uploadedMedia.find((m) => m.type === 'thumbnail')?.url || null;
      let cleanContent = content;

      if (linkPreview && type === 'text') {
        urls = [linkPreview.url];
        type = linkPreview.type || 'link';
      } else {
        const youtubeRegex =
          /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g;
        const youtubeMatch = content.match(youtubeRegex);
        const generalUrlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = content.match(generalUrlRegex);

        if (youtubeMatch && type === 'text') {
          const fullUrl = youtubeMatch[0].startsWith('http')
            ? youtubeMatch[0]
            : `https://${youtubeMatch[0]}`;
          const validation = await validateYouTubeVideo(fullUrl);
          if (!validation.valid) {
            setError(`${validation.error}`);
            _submittingRef.current = false;
            return;
          }
          urls = [fullUrl];
          type = 'video';
          cleanContent = content.replace(youtubeRegex, '').trim();
        } else if (urlMatch && type === 'text') {
          urls = [urlMatch[0]];
          type = 'link';
          cleanContent = content.replace(generalUrlRegex, '').trim();
        }
      }

      const mentionPattern = /@([\w.]+)/g;
      const mentions = [];
      let match;
      while ((match = mentionPattern.exec(content)) !== null) {
        mentions.push(match[1]);
      }

      let finalContent = cleanContent;
      if (checkInVenue) {
        const prefix = `Checked in at ${checkInVenue.name}`;
        finalContent = cleanContent ? `${prefix} — ${cleanContent}` : prefix;
      }

      // If posting as a home group, route through /api/social/pages/posts with the group's social_page_id
      let ok;
      if (activeHomeGroup?.social_page_id) {
        try {
          const token = getAccessToken();
          if (!token) throw new Error('Authentication required — please refresh and try again.');
          const res = await fetch('/api/social/pages/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              page_id: activeHomeGroup.social_page_id,
              author_id: user?.id,
              content: finalContent,
              content_type: urls.length > 0 ? 'media' : 'text',
              visibility: postVisibility,
              post_type: 'regular',
              ...(persistedThumbnailUrl ? { thumbnail_url: persistedThumbnailUrl } : {}),
              ...(linkPreview ? { link_preview: linkPreview } : {}),
              ...(urls.length > 0 ? { media_urls: urls } : {}),
              ...(mentions && mentions.length > 0 ? { mentions } : {}),
            }),
          });
          const json = await res.json();
          ok = json.success;
        } catch (e) {
          console.warn('[SharedPostCreator] Home group post error:', e);
          if (mountedRef.current) setError(e?.message || 'Could not post to home group');
          ok = false;
        }
      } else {
        ok = await onPost(
          finalContent,
          urls,
          type,
          mentions,
          linkPreview,
          postVisibility,
          persistedThumbnailUrl
        );
      }
      if (ok) {
        if (checkInVenue) {
          try {
            const token = getAccessToken();
            if (token) {
              const checkinRes = await fetch('/api/poker/checkins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  venue_id: checkInVenue.id,
                  user_name: authorOverride ? authorOverride.name : user?.name || 'Player',
                  message: finalContent || null,
                  skip_post: true,
                }),
              });
              if (checkinRes.ok) {
                busEmit.venueCheckinCreated(checkInVenue.id, checkInVenue.name, user?.id);
              }
              // Ignore 429 and others here to avoid double toasts, the post was already created.
            }
          } catch (e) {
            console.warn('[SharedPostCreator] checkin API threw:', e);
          }
          setCheckInVenue(null);
        }
        if (mountedRef.current) {
          setContent('');
          setMedia([]);
          setLinkPreview(null);
          // 2026-05-08 (per Dan: "WHEN THE VIDEO FINALLY POSTS, YOU GET A
          // DOUBLE POSTED SUCCESSFULLY AND POST SHARED SUCCESSFULLY. REMOVE
          // THE BOTTOM ONE"): the parent feed page
          // (pages/hub/social-media/index.js handlePost) already shows a
          // 'Posted Successfully!' toast WITH an audio chime immediately
          // after onPost resolves. The secondary 'Post shared successfully!'
          // toast here was stacking on top of it. Removed; the parent's
          // toast is the canonical confirmation surface.
        }
        try {
          localStorage.removeItem('sp-post-draft');
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
      } else if (mountedRef.current)
        setError('Unable to post at this time. Please try again later.');
    } catch (postErr) {
      console.warn('[SharedPostCreator] Post creation error:', postErr);
      if (mountedRef.current) {
        setError('Unable to post: ' + (postErr?.message || 'unknown error'));
        setUploading(false);
        setUploadProgress(null);
      }
    } finally {
      // ALWAYS reset the submit guard, even on uncaught throw, so user
      // isn't permanently locked out of posting.
      _submittingRef.current = false;
    }
  };

  // Determine display identity:
  // If context is 'social-pages', use the authorOverride
  // If context is 'social-media', use club page override IF active, otherwise standard user
  // Home group mode takes priority over club mode in social-media context
  let postingAs = { name: user?.name, avatar: user?.avatar };

  if (context === 'social-pages' && authorOverride) {
    postingAs = { name: authorOverride.name, avatar: authorOverride.avatar_url };
  } else if (activeHomeGroup) {
    postingAs = { name: activeHomeGroup.target_name, avatar: activeHomeGroup.target_avatar };
  } else if (isClubMode && clubPage) {
    postingAs = { name: clubPage.name, avatar: clubPage.avatar_url };
  }

  const isHomeGroupMode = !!activeHomeGroup;
  const hasAnyIdentitySwitcher = hasClubPage || homeGroupTargets.length > 0;

  return (
    <div
      style={{
        background: C.card,
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        marginBottom: 2,
        position: 'relative',
      }}
    >
      {/* Identity Switcher Banner - for Commander users with club pages OR home group memberships */}
      {context === 'social-media' && hasAnyIdentitySwitcher && (
        <div
          ref={identityPickerRef}
          style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            transition: 'background 0.3s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: C.textSec,
            }}
          >
            <span>Posting As</span>
            <button
              onClick={() => setShowIdentityPicker(!showIdentityPicker)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: isClubMode || isHomeGroupMode ? '#E7F3FF' : '#F0F2F5',
                border: `1px solid ${isClubMode || isHomeGroupMode ? '#1877F2' : C.border}`,
                borderRadius: 20,
                padding: '4px 12px 4px 4px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: isClubMode || isHomeGroupMode ? '#1877F2' : C.text,
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: postingAs.avatar
                    ? `url(${postingAs.avatar}) center/cover`
                    : isClubMode || isHomeGroupMode
                      ? '#1877F2'
                      : '#65676B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {!postingAs.avatar && (postingAs.name?.[0] || '?')}
              </div>
              {postingAs.name || 'You'}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {showIdentityPicker && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 12,
                zIndex: 1001,
                background: C.card,
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                border: `1px solid ${C.border}`,
                minWidth: 240,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSec,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                Switch Identity
              </div>
              {/* Personal Account */}
              <button
                onClick={() => {
                  switchToPersonal();
                  setActiveHomeGroup(null);
                  setShowIdentityPicker(false);
                  toast.success('Switched to personal account', 2000);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  cursor: 'pointer',
                  background: !isClubMode && !isHomeGroupMode ? '#E7F3FF' : 'transparent',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (isClubMode || isHomeGroupMode) e.currentTarget.style.background = '#F0F2F5';
                }}
                onMouseLeave={(e) => {
                  if (isClubMode || isHomeGroupMode)
                    e.currentTarget.style.background = 'transparent';
                }}
              >
                <Avatar src={contextAvatar?.imageUrl || user?.avatar} name={user?.name} size={36} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                    {user?.name || 'You'}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec }}>Personal Account</div>
                </div>
                {!isClubMode && !isHomeGroupMode && (
                  <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>
                )}
              </button>
              {/* Club Page (only shown if user has one) */}
              {hasClubPage && (
                <button
                  onClick={() => {
                    switchToClub();
                    setActiveHomeGroup(null);
                    setShowIdentityPicker(false);
                    toast.success(`Now posting as ${clubPage?.name || 'Club'}`, 2000);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    background: isClubMode && !isHomeGroupMode ? '#E7F3FF' : 'transparent',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isClubMode || isHomeGroupMode)
                      e.currentTarget.style.background = '#F0F2F5';
                  }}
                  onMouseLeave={(e) => {
                    if (!isClubMode || isHomeGroupMode)
                      e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Avatar src={clubPage?.avatar_url} name={clubPage?.name || 'Club'} size={36} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                      {clubPage?.name || 'Club Page'}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec }}>Club Page</div>
                  </div>
                  {isClubMode && !isHomeGroupMode && (
                    <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>
                  )}
                </button>
              )}
              {/* Home Groups section */}
              {homeGroupTargets.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.textSec,
                      background: C.bg,
                      borderTop: `1px solid ${C.border}`,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Home Groups
                  </div>
                  {homeGroupTargets.map((hg) => {
                    const isActive = activeHomeGroup?.target_id === hg.target_id;
                    return (
                      <button
                        key={hg.target_id}
                        onClick={() => {
                          switchToPersonal();
                          setActiveHomeGroup(isActive ? null : hg);
                          setShowIdentityPicker(false);
                          toast.success(
                            isActive
                              ? 'Switched to personal account'
                              : `Now posting as ${hg.target_name}`,
                            2000
                          );
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '10px 12px',
                          border: 'none',
                          cursor: 'pointer',
                          background: isActive ? '#E7F3FF' : 'transparent',
                          textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = '#F0F2F5';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Avatar src={hg.target_avatar} name={hg.target_name} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: C.text,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {hg.target_name}
                          </div>
                          <div style={{ fontSize: 12, color: C.textSec }}>
                            {hg.target_role
                              ? hg.target_role.charAt(0).toUpperCase() + hg.target_role.slice(1)
                              : 'Member'}
                          </div>
                        </div>
                        {isActive && (
                          <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: 12, display: 'flex', gap: 8, transition: 'all 0.25s ease' }}>
        {context === 'social-pages' && authorOverride ? (
          <div style={{ display: 'block', flexShrink: 0 }}>
            <Avatar src={authorOverride.avatar_url} name={authorOverride.name} size={40} />
          </div>
        ) : isHomeGroupMode ? (
          <div
            style={{
              display: 'block',
              flexShrink: 0,
              borderRadius: '50%',
              border: '2px solid #1877F2',
            }}
          >
            <Avatar
              src={activeHomeGroup.target_avatar}
              name={activeHomeGroup.target_name}
              size={40}
            />
          </div>
        ) : isClubMode && clubPage ? (
          <Link
            href={`/hub/social-pages/${clubPage.id}`}
            style={{
              display: 'block',
              cursor: 'pointer',
              flexShrink: 0,
              borderRadius: '50%',
              border: '2px solid #1877F2',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Avatar src={clubPage.avatar_url} name={clubPage.name || 'Club'} size={40} />
          </Link>
        ) : (
          <Link href="/hub/profile" style={{ display: 'block', cursor: 'pointer' }}>
            <Avatar src={contextAvatar?.imageUrl || user?.avatar} name={user?.name} size={40} />
          </Link>
        )}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            value={content}
            onChange={handleContentChange}
            onPaste={handlePaste}
            disabled={uploading}
            placeholder={
              context === 'social-pages'
                ? `Post as ${postingAs.name}...`
                : isHomeGroupMode
                  ? `Post as ${activeHomeGroup.target_name}...`
                  : isClubMode
                    ? `Post as ${clubPage?.name || 'Club'}...`
                    : `What's on your mind, ${user?.name || 'Player'}?`
            }
            style={{
              width: '100%',
              background: C.bg,
              border: 'none',
              borderRadius: 20,
              padding: '10px 16px',
              fontSize: 16,
              outline: 'none',
              boxSizing: 'border-box',
              color: uploading ? '#999' : C.text,
              opacity: uploading ? 0.6 : 1,
            }}
            maxLength={5000}
          />
          {content.length > 4500 && (
            <span
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 11,
                color: content.length > 4900 ? '#FA383E' : C.textSec,
              }}
            >
              {5000 - content.length}
            </span>
          )}
          {showMentions && mentionResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: C.card,
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: `1px solid ${C.border}`,
                zIndex: 1000,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {mentionResults.map((u) => (
                <div
                  key={u.id}
                  onClick={() => insertMention(u)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    borderBottom: `1px solid ${C.border}`,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Avatar name={u.username} size={32} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>@{u.username}</div>
                    {u.full_name || u.display_name ? (
                      <div style={{ fontSize: 12, color: C.textSec }}>
                        {/* BUG-13 FIX: fall back to display_name if full_name is null */}
                        {u.full_name || u.display_name}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {media.length > 0 && (
        <div style={{ padding: '0 12px 8px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                media.length === 1 ? '1fr' : media.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)',
              gap: 4,
            }}
          >
            {media.map((m, i) => (
              <div
                key={i}
                style={{
                  position: 'relative',
                  aspectRatio: media.length === 1 ? '16/9' : '1',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {m.type === 'video' ? (
                  // Tap-to-preview: shows thumbnail by default, loads <video> on tap
                  m._previewing ? (
                    <video
                      src={m.url}
                      controls
                      playsInline
                      autoPlay
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        background: '#000',
                      }}
                      onEnded={() =>
                        setMedia((prev) =>
                          prev.map((item, idx) =>
                            idx === i ? { ...item, _previewing: false } : item
                          )
                        )
                      }
                    />
                  ) : m.thumbnail ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                      onClick={() =>
                        setMedia((prev) =>
                          prev.map((item, idx) =>
                            idx === i ? { ...item, _previewing: true } : item
                          )
                        )
                      }
                    >
                      <img
                        src={m.thumbnail}
                        alt="Video thumbnail"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {/* Play button overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0,0,0,0.2)',
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // AUDIT-12 (2026-04-30 per Dan: page CRASHES on staging):
                    // The previous version rendered a <video src={blob} autoPlay>
                    // which OOMed iPhone Safari and crashed both mobile AND
                    // desktop pages because the audit-9 "revert autoplay"
                    // commit was empty (commit-tree/update-ref workaround
                    // pushed an unchanged tree). The autoplay video has been
                    // crashing pages this whole time. NOW actually replaced
                    // with a static placeholder — a generating-thumbnail
                    // spinner identical to the one from before audit-6.
                    // Tap promotes to a controlled <video> for full preview.
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        gap: 10,
                      }}
                      onClick={() =>
                        setMedia((prev) =>
                          prev.map((item, idx) =>
                            idx === i ? { ...item, _previewing: true } : item
                          )
                        )
                      }
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          border: '3px solid rgba(255,255,255,0.18)',
                          borderTopColor: '#fff',
                          animation: 'spThumbSpin 0.9s linear infinite',
                          WebkitAnimation: 'spThumbSpin 0.9s linear infinite',
                          willChange: 'transform',
                          WebkitTransform: 'translateZ(0)',
                          transform: 'translateZ(0)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          color: 'rgba(255,255,255,0.85)',
                          fontWeight: 600,
                          letterSpacing: 0.3,
                        }}
                      >
                        Generating thumbnail…
                      </span>
                    </div>
                  )
                ) : (
                  <img
                    src={m.url}
                    loading="lazy"
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                <button
                  onClick={() => {
                    // AUDIT-MAX-3 (2026-05-03 Pass 4 finding): use the tile's
                    // CURRENT m.url (closure-captured at this render) as the
                    // identity, and filter setMedia by url instead of by
                    // index. The previous `prev.filter((_, idx) => idx !== i)`
                    // was index-based: rapid double-tap on the × button before
                    // re-render fires both handlers with the same closure
                    // index `i`, batched setState removes 2 items instead of
                    // 1 (first filter shifts indices down, second filter
                    // removes the new item-at-index-0). url-based filter is
                    // idempotent on repeat fires.
                    const item = m;
                    if (!item?.url) return;
                    // Cancel background compression if running
                    if (compressionRef.current[item.url]) {
                      compressionRef.current[item.url].controller?.abort();
                      delete compressionRef.current[item.url];
                    }
                    // Drop the thumbnail promise so the resolved data url
                    // can be garbage-collected.
                    if (thumbnailPromiseRef.current[item.url]) {
                      delete thumbnailPromiseRef.current[item.url];
                    }
                    // Revoke blob URL to free memory
                    if (item.file && item.url.startsWith('blob:')) {
                      try {
                        URL.revokeObjectURL(item.url);
                      } catch (_) {}
                    }
                    setMedia((prev) => prev.filter((p) => p.url !== item.url));
                  }}
                  disabled={uploading}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)',
                    border: 'none',
                    color: 'white',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: uploading ? 0.4 : 1,
                  }}
                >
                  ×
                </button>
                {m.type === 'video' && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      left: 4,
                      background: 'rgba(0,0,0,0.7)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      color: 'white',
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    VIDEO
                  </div>
                )}
                {/* ── Thumbnail picker trigger (videos only) ── */}
                {m.type === 'video' && !m._previewing && (
                  <button
                    onClick={() => {
                      if (thumbPickerIdx === i) {
                        setThumbPickerIdx(null);
                        return;
                      }
                      setThumbPickerIdx(i);
                      setThumbFrames([]);
                      setScrubberCapture(null);
                      setScrubberTime(0);
                      setScrubberDuration(0);
                      setThumbFramesLoading(true);
                      generateFrames(m.file, 6).then((frames) => {
                        setThumbFrames(frames);
                        setThumbFramesLoading(false);
                      });
                    }}
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      right: 4,
                      background: 'rgba(0,0,0,0.75)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      color: 'white',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 11,
                      cursor: 'pointer',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                    </svg>
                    Thumbnail
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* ── Thumbnail Picker Panel ── */}
          {thumbPickerIdx !== null && media[thumbPickerIdx]?.type === 'video' && (
            <div
              style={{
                margin: '8px 0 0',
                background: 'rgba(0,0,0,0.9)',
                borderRadius: 10,
                padding: '10px 12px',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>
                  Choose Thumbnail
                </span>
                <button
                  onClick={() => setThumbPickerIdx(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Hidden video for scrubbing */}
              <video
                ref={scrubberVideoRef}
                src={media[thumbPickerIdx]?.url}
                muted
                playsInline
                preload="metadata"
                style={{ display: 'none' }}
                onLoadedMetadata={() => {
                  const dur = scrubberVideoRef.current?.duration || 0;
                  setScrubberDuration(dur);
                  setScrubberTime(0);
                }}
                onSeeked={() => {
                  // Capture the frame the user scrubbed to
                  const v = scrubberVideoRef.current;
                  if (!v) return;
                  try {
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.min(v.videoWidth || 640, 640);
                    canvas.height = Math.round(
                      canvas.width * ((v.videoHeight || 360) / (v.videoWidth || 640))
                    );
                    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
                    setScrubberCapture(canvas.toDataURL('image/jpeg', 0.85));
                  } catch (_) {}
                }}
              />

              {/* Scrubber preview */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  background: '#000',
                  borderRadius: 8,
                  overflow: 'hidden',
                  marginBottom: 10,
                }}
              >
                {scrubberCapture ? (
                  <img
                    src={scrubberCapture}
                    alt="Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(255,255,255,0.4)',
                      fontSize: 12,
                    }}
                  >
                    Drag slider to pick frame
                  </div>
                )}
                {scrubberDuration > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      right: 8,
                      background: 'rgba(0,0,0,0.7)',
                      color: 'white',
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {Math.floor(scrubberTime / 60)}:
                    {String(Math.floor(scrubberTime % 60)).padStart(2, '0')} /{' '}
                    {Math.floor(scrubberDuration / 60)}:
                    {String(Math.floor(scrubberDuration % 60)).padStart(2, '0')}
                  </div>
                )}
              </div>

              {/* Scrubber slider */}
              <input
                type="range"
                min="0"
                max={scrubberDuration || 100}
                step="0.1"
                value={scrubberTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  setScrubberTime(t);
                  if (scrubberVideoRef.current) scrubberVideoRef.current.currentTime = t;
                }}
                style={{
                  width: '100%',
                  accentColor: '#4f9eff',
                  marginBottom: 10,
                  cursor: 'pointer',
                }}
              />

              {/* Use this frame button */}
              {scrubberCapture && (
                <button
                  onClick={() => {
                    setMedia((prev) =>
                      prev.map((item, idx) =>
                        idx === thumbPickerIdx ? { ...item, thumbnail: scrubberCapture } : item
                      )
                    );
                    setThumbPickerIdx(null);
                    setScrubberCapture(null);
                  }}
                  style={{
                    width: '100%',
                    background: '#4f9eff',
                    border: 'none',
                    color: 'white',
                    borderRadius: 8,
                    padding: '8px 0',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: 8,
                  }}
                >
                  Use This Frame
                </button>
              )}

              {/* Quick-pick filmstrip */}
              {thumbFramesLoading ? (
                <div
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 11,
                    textAlign: 'center',
                    padding: '4px 0',
                  }}
                >
                  Loading frames…
                </div>
              ) : (
                thumbFrames.length > 0 && (
                  <>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>
                      Quick picks:
                    </div>
                    <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4 }}>
                      {thumbFrames.map(
                        (f, fi) =>
                          f.dataUrl && (
                            <div
                              key={fi}
                              onClick={() => {
                                setMedia((prev) =>
                                  prev.map((item, idx) =>
                                    idx === thumbPickerIdx
                                      ? { ...item, thumbnail: f.dataUrl }
                                      : item
                                  )
                                );
                                setThumbPickerIdx(null);
                                setScrubberCapture(null);
                              }}
                              style={{
                                flexShrink: 0,
                                width: 72,
                                height: 46,
                                borderRadius: 5,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: '2px solid transparent',
                                transition: 'border-color 0.15s',
                              }}
                            >
                              <img
                                src={f.dataUrl}
                                alt={`Frame ${fi + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                          )
                      )}
                    </div>
                  </>
                )
              )}

              {/* Upload custom thumbnail */}
              <div
                style={{
                  marginTop: 8,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  paddingTop: 8,
                }}
              >
                <input
                  ref={thumbFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setMedia((prev) =>
                        prev.map((item, idx) =>
                          idx === thumbPickerIdx ? { ...item, thumbnail: ev.target.result } : item
                        )
                      );
                      setThumbPickerIdx(null);
                      setScrubberCapture(null);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => thumbFileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px dashed rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.7)',
                    borderRadius: 8,
                    padding: '7px 0',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 7v3h-2V7h-3V5h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z" />
                  </svg>
                  Upload Your Own Image
                </button>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>
            {media.length}/{MAX_MEDIA} files
          </div>
        </div>
      )}
      {(linkPreview || linkLoading) && (
        <div style={{ padding: '0 12px 8px' }}>
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: 'hidden',
              background: C.bg,
              position: 'relative',
            }}
          >
            {linkLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.textSec }}>
                <span style={{ fontSize: 24 }}>⏳</span>
                <div style={{ marginTop: 8 }}>Loading Preview...</div>
              </div>
            ) : (
              linkPreview && (
                <>
                  <div
                    style={{
                      height: 400,
                      position: 'relative',
                      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {linkPreview.image ? (
                      <img
                        src={linkPreview.image}
                        alt={linkPreview.title || 'Preview'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 48, opacity: 0.5 }}>
                        {linkPreview.type === 'video' ? '' : '🔗'}
                      </span>
                    )}
                    {linkPreview.type === 'video' && linkPreview.image && (
                      <div
                        style={{
                          position: 'absolute',
                          width: 64,
                          height: 64,
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.7)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: 28,
                          zIndex: 1,
                        }}
                      >
                        ▶
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.textSec,
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      {linkPreview.domain}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: C.text,
                        marginBottom: linkPreview.description ? 6 : 0,
                      }}
                    >
                      {linkPreview.title}
                    </div>
                    {linkPreview.description && (
                      <div
                        style={{
                          fontSize: 12,
                          color: C.textSec,
                          lineHeight: 1.4,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {linkPreview.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={removeLinkPreview}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.7)',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </>
              )
            )}
          </div>
        </div>
      )}
      {error && <div style={{ padding: '0 12px 8px', color: C.red, fontSize: 13 }}>{error}</div>}
      {/* SINGLE progress bar — the ONLY upload progress indicator */}
      {uploading && uploadProgress && (
        <div style={{ padding: '0 12px 8px' }}>
          <div style={{ background: '#E4E6EB', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 4,
                background: 'linear-gradient(90deg, #1877F2, #42B72A)',
                width: `${Math.min(uploadProgress.pct || 0, 100)}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 6,
            }}
          >
            <div style={{ fontSize: 13, color: C.textSec, fontWeight: 600 }}>
              {uploadProgress.label || `Uploading… ${uploadProgress.pct || 0}%`}
            </div>
            <button
              onClick={() => {
                bgUpload.abort();
                if (mountedRef.current) {
                  setUploading(false);
                  setUploadProgress(null);
                }
              }}
              style={{
                background: 'none',
                border: '1px solid #ccc',
                borderRadius: 12,
                padding: '2px 10px',
                fontSize: 12,
                color: '#666',
                cursor: 'pointer',
                fontWeight: 600,
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Preparing Media Indicator REMOVED 2026-05-08 ──
                Per Dan: "WHATS THIS WEIRD 'LOADING YOUR VIDEO' THIS LOOKS
                LIKE BROKEN CODE AND DOES ABSOLUTLY NOTHING TO SPEED
                ANYTHING UP OR HAVE ANY FUNCTIONALITY". The banner was
                purely informational (with a debug-style timing display
                like "tap=0 · focus=5.4s") — it could not actually
                accelerate iOS HEVC decode or the file-picker handoff,
                only signal that something was happening. The
                preparingMedia / preparingStage / timingDisplay state
                machinery is left intact upstream because the same
                state drives the in-tile staging spinner on the media
                preview row (StagingTile.jsx). Removing only the
                top-of-viewport banner.

                If a status surface is wanted again later, the existing
                state ALREADY tracks: 'picker' | 'loading' | 'staging'
                with millisecond-precision timing in _timingsRef. */}
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={handleFiles}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 8px 4px',
            gap: 4,
          }}
        >
          <button
            onClick={() => {
              // AUDIT-6 (2026-04-30 per Dan): raise the banner the
              // moment the user taps Photo/Video — don't wait for
              // the change event, which only fires AFTER iOS hands
              // the file to Safari (5–25s for iPhone HEVC). The
              // useEffect on preparingStage handles the 'cancel'
              // case via window.focus + 5s grace window: if the
              // picker dismisses without a change event, banner
              // clears automatically. 90s ultimate-backstop in the
              // sibling useEffect is the safety net.
              // AUDIT-7: clear any stale watchdog from a previous
              // picker session so it can't fire mid-new-session
              // and mistakenly clear the new banner.
              if (_focusGraceTimerRef.current) {
                clearTimeout(_focusGraceTimerRef.current);
                _focusGraceTimerRef.current = null;
              }
              _pickerOpenRef.current = true;
              _hasFileArrivedRef.current = false;
              // AUDIT-13: reset and start the timing baseline. tap=0 by definition.
              _timingsRef.current = { tap: performance.now() };
              setTimingDisplay('tap=0');
              // iOS-USER-GESTURE: fileRef.click() MUST fire synchronously
              // inside the same handler call as the user tap, otherwise
              // iOS Safari refuses to open the Photos picker. After the
              // user picks, handleFiles below stages the files inline
              // (setMedia + thumbnail/compression in background). When
              // the user taps Post, handlePost runs the upload via
              // bgUpload + onPost callback to the parent feed page.
              setPreparingStage('picker');
              fileRef.current?.click();
            }}
            disabled={media.length >= MAX_MEDIA || uploading}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              cursor: media.length >= MAX_MEDIA ? 'not-allowed' : 'pointer',
              color: media.length >= MAX_MEDIA ? '#ccc' : '#65676B',
              fontSize: 14,
              fontWeight: 600,
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F0F2F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {uploading ? 'Uploading…' : 'Photo/Video'}
          </button>
          <span style={{ color: '#BCC0C4' }}>·</span>
          <button
            onClick={onGoLive}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#65676B',
              fontSize: 14,
              fontWeight: 600,
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F0F2F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Go Live
          </button>
          <span style={{ color: '#BCC0C4' }}>·</span>
          <button
            onClick={() => setShowCheckInModal(true)}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: 'none',
              background: checkInVenue ? '#E7F3FF' : 'transparent',
              cursor: 'pointer',
              color: checkInVenue ? '#1877F2' : '#65676B',
              fontSize: 14,
              fontWeight: 600,
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = checkInVenue ? '#D4E6FA' : '#F0F2F5')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = checkInVenue ? '#E7F3FF' : 'transparent')
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Check In
          </button>
          {/* Reels, Find Friends, and Club Pages are in the bottom/side navigation naturally */}
        </div>
        <div style={{ padding: '4px 8px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
          {context === 'social-media' && (
            <button
              onClick={() => setPostVisibility((v) => (v === 'public' ? 'friends' : 'public'))}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 12,
                color: C.textSec,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
              }}
              title={
                postVisibility === 'public' ? 'Visible to everyone' : 'Visible to friends only'
              }
            >
              {postVisibility === 'public' ? '🌐 Public' : '🔒 Friends'}
            </button>
          )}
          <button
            onClick={handlePost}
            disabled={
              isPosting ||
              uploading ||
              (!content.trim() && !media.length && !linkPreview && !checkInVenue)
            }
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              background: C.blue,
              color: 'white',
              fontWeight: 600,
              cursor: isPosting || uploading ? 'wait' : 'pointer',
              opacity:
                isPosting ||
                uploading ||
                (!content.trim() && !media.length && !linkPreview && !checkInVenue)
                  ? 0.5
                  : 1,
              flex: 1,
            }}
          >
            {uploading ? 'Uploading…' : isPosting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
      {checkInVenue && (
        <div
          style={{
            margin: '0 12px 8px',
            padding: '8px 12px',
            borderRadius: 8,
            background: '#E7F3FF',
            border: '1px solid #B8D4F0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1877F2"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1877F2' }}>
            Checking in at {checkInVenue.name}
          </span>
          <button
            onClick={() => setCheckInVenue(null)}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#65676B',
              fontSize: 16,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
      {showCheckInModal && (
        <CheckInModal
          userId={user?.id}
          onSelect={(venue) => {
            setCheckInVenue(venue);
            if (!content.trim()) {
              setContent(
                `Checked in at ${venue.name}${venue.city ? ` — ${venue.city}` : ''}${venue.state ? `, ${venue.state}` : ''}`
              );
            }
          }}
          onClose={() => setShowCheckInModal(false)}
        />
      )}
      {/* Always available */}
      <TrendingVenues
        onCheckIn={(venue) => {
          setCheckInVenue(venue);
          if (!content.trim()) {
            setContent(
              `Checked in at ${venue.name}${venue.city ? ` — ${venue.city}` : ''}${venue.state ? `, ${venue.state}` : ''}`
            );
          }
        }}
      />
    </div>
  );
}

// Ensure the helper is exported correctly from socialHelpers if needed, but we imported it above.
