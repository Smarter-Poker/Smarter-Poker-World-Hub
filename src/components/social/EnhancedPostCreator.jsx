/**
 * ✍️ ENHANCED POST CREATOR MODAL
 * src/components/social/EnhancedPostCreator.jsx
 * 
 * Full-featured post creator with image/video uploads,
 * media previews, and spatial animations.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { SocialService } from '../../services/SocialService';
import { validatePostContent } from '../../services/social-types';
import toast from '../../stores/toastStore';
import { claimReward } from '../../lib/claimReward';
import { busEmit } from '../../engine/EventBus';
import { broadcastSync, BROADCAST_TAB_ID } from '../../lib/broadcastSync';
import { getAccessToken } from '../../lib/authUtils';
import { compressImage, sniffMimeType } from '../../lib/socialHelpers';
import bgUpload from '../../lib/backgroundVideoUpload';
import { validateVideoFile, generateThumbnail, compressVideo } from '../../lib/videoCompressor';
import ghostPost from '../../stores/ghostPostStore';
import { VideoThumbnailPicker } from './VideoThumbnailPicker';
import { uploadThumbnail } from '../../lib/thumbnailUploader';

import { useSupabase } from '../../providers/SupabaseProvider';

// File validation — uses sniffMimeType to correctly handle iOS Photo Library uploads.
// Size constants are aligned with the upload API limits.
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
];
const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/hevc', 'video/x-matroska',
  'application/octet-stream', // iOS fallback when extension sniffing gives generic type
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;          // 10MB (pre-compression)
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;    // 5GB (matches /api/social/upload-url)

const validateFile = (file) => {
  const mimeType = sniffMimeType(file);
  const isVideo = mimeType.startsWith('video/');

  if (isVideo) {
    if (!ALLOWED_VIDEO_TYPES.includes(mimeType)) {
      return { valid: false, error: `Unsupported video format (${mimeType}). Try MP4, MOV, or WebM.` };
    }
    if (file.size > MAX_VIDEO_SIZE) {
      return { valid: false, error: 'Video too large. Max 5 GB.' };
    }
  } else {
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return { valid: false, error: `Unsupported image format (${mimeType}). Use JPEG, PNG, GIF, or WebP.` };
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return { valid: false, error: 'Image too large (before compression). Max 10 MB.' };
    }
  }
  return { valid: true };
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_MEDIA_FILES = 4;
const MAX_CHARS = 2000;

// ═══════════════════════════════════════════════════════════════════════════
// 🖼️ MEDIA PREVIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const MediaPreview = ({ file, onRemove, onCancelUpload, uploadProgress, uploadStatusLabel, thumbnail }) => {
  const [preview, setPreview] = useState(null);
  // Use sniffMimeType so iOS MOV files (which have empty file.type) are detected as video
  const isVideo = sniffMimeType(file).startsWith('video/');

  useEffect(() => {
    // Use thumbnail if available (lighter than <video>), otherwise create blob URL for images only
    if (thumbnail) { setPreview(thumbnail); return; }
    if (!isVideo) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    // For videos without thumbnail, use null — show placeholder instead of loading heavy <video>
    setPreview(null);
  }, [file, thumbnail, isVideo]);

  return (
    <div className="media-preview-item">
      {isVideo ? (
        preview ? (
          <img src={preview} alt="Video preview" className="preview-media" />
        ) : (
          <div className="preview-media" style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)"><path d="M8 5v14l11-7z" /></svg>
          </div>
        )
      ) : (
        <img src={preview} alt="Preview" className="preview-media" />
      )}

      {/* Upload Progress Overlay — shows clock dial + % + Cancel button */}
      {uploadProgress !== undefined && uploadProgress < 100 && (
        <div className="upload-progress-overlay">
          <div
            className="progress-ring"
            style={{ '--progress': uploadProgress }}
          >
            <span className="progress-pct">{uploadProgress}%</span>
          </div>
          {uploadStatusLabel && (
            <span className="progress-label">{uploadStatusLabel}</span>
          )}
          <button
            onClick={onCancelUpload || onRemove}
            style={{
              marginTop: 6,
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 10,
              padding: '3px 12px',
              fontSize: 11,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Remove Button — disabled during upload (Cancel button in overlay handles cancel) */}
      <button
        className="remove-media-btn"
        onClick={onRemove}
        aria-label="Remove"
        disabled={uploadProgress !== undefined && uploadProgress < 100}
      >
        ✕
      </button>

      {/* Type Badge */}
      <div className="media-type-badge">
        {isVideo ? '🎬' : '📷'}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════
// ✍️ ENHANCED POST CREATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const EnhancedPostCreator = ({
  isOpen = true,  // Default to true for inline mode
  onClose,
  onPostCreated,
  user,              // User object passed from parent
  supabase: supabaseProp, // Supabase client passed from parent (optional — falls back to useSupabase)
  inline = false     // New: inline mode renders without modal overlay
}) => {
  // Resolve supabase: prefer explicit prop (legacy callers), fall back to context (inline FeedView usage)
  const { supabase: supabaseCtx } = useSupabase();
  const supabase = supabaseProp || supabaseCtx;

  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  // Per-file status label shown in the progress overlay (e.g. "Compressing… 45%", "Preparing…", "Uploading…")
  const [uploadStatus, setUploadStatus] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  // STAGE-AWARE BANNER (audit-6 2026-04-30 per Dan): see SharedPostCreator
  // for the rationale. 'picker' | 'loading' | 'staging' | null.
  const [preparingStage, setPreparingStage] = useState(null);
  const preparingMedia = preparingStage !== null;
  const setPreparingMedia = (val) => setPreparingStage(val ? 'staging' : null);
  const _hasFileArrivedRef = useRef(false);
  const _focusGraceTimerRef = useRef(null); // AUDIT-7 — see SharedPostCreator for rationale

  const textareaRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const xhrRef = useRef(null);          // holds active video XHR so we can abort on unmount
  const draftTimeout = useRef(null);    // debounce handle for draft auto-save
  const mountedRef = useRef(true);      // unmount guard for background upload callbacks
  // WH-2 BUG FIX: 1.5s success-close timer was not tracked. Added successTimerRef
  // so the existing unmount cleanup can cancel it if user navigates away first.
  const successTimerRef = useRef(null);
  const compressionRef = useRef({});    // { [fileKey]: { controller, promise, result } }
  const thumbnailRef = useRef({});      // { [fileKey]: dataUrl }
  // RACE FIX (2026-04-29): mirror SharedPostCreator — track in-flight
  // generateThumbnail promises so submit can await before deciding to skip
  // the thumbnail. iPhone HEVC decode takes 30+ seconds so virtually every
  // upload was being shipped with thumbnail_url=NULL.
  const thumbnailPromiseRef = useRef({}); // { [fileKey]: Promise<dataUrl|null> }
  const _pickerOpenRef = useRef(false);  // tracks if iOS file picker is open
  const [thumbnails, setThumbnails] = useState({});

  // Auto-dismiss error after 10 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 10_000);
    return () => clearTimeout(timer);
  }, [error]);

  // Stable file key — survives array index shifts when files are removed
  const _fileKey = (f) => `${f.name}_${f.size}_${f.lastModified}`;

  // BUG FIX (2026-04-30 per Dan): visibilitychange-based clear was REMOVED.
  // iOS Safari does NOT fire visibilitychange when its file picker
  // opens/closes, so the safety timer never fired and the banner stuck
  // up the moment Photo/Video was tapped, before any file was selected.
  // The banner now lifecycle: handleFileSelect raises it when a file is
  // actually selected → cleared at the bottom of handleFileSelect after
  // staging completes. A 60s ultimate-backstop guards stuck state.
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

  // AUDIT-6 (2026-04-30): focus-based cancel detection — see SharedPostCreator
  // useEffect for full rationale.
  useEffect(() => {
    if (preparingStage !== 'picker') return;
    const onFocus = () => {
      if (!mountedRef.current) return;
      setPreparingStage(prev => prev === 'picker' ? 'loading' : prev);
      // AUDIT-8 — see SharedPostCreator: NO short watchdog. iOS handoff is
      // 5-30s, watchdog at 5s was clearing the banner mid-legitimate-pick.
      // 90s ultimate backstop covers the cancel case.
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [preparingStage]);

  // Track mount lifecycle
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // NOTE: Do NOT unsubscribe bgUpload here. The listener must stay alive
      // so onComplete fires and triggers the DB insert (social_posts).
      // Cleanup happens via bgUpload.abort() when a new upload starts.
      // Abort any running background compressions
      Object.values(compressionRef.current).forEach(c => {
        try { c.controller?.abort(); } catch (_) { }
      });
      compressionRef.current = {};
    };
  }, []);


  // Character count
  const charCount = content.length;
  const charPercentage = (charCount / MAX_CHARS) * 100;

  // Focus textarea when modal opens + restore any saved draft
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
    if (isOpen) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const clipUrl = urlParams.get('clipUrl');
        const clipTitle = urlParams.get('title');

        if (clipUrl) {
           setContent(`${clipTitle || 'Check out my stream clip!'} \n\n${clipUrl}`);
        } else {
           const saved = localStorage.getItem('sp-enhanced-post-draft');
           if (saved) setContent(saved);
        }
      } catch (e) { /* ignore */ }
    }
  }, [isOpen]);

  // Reset state when modal closes — do NOT clear draft (user may reopen)
  useEffect(() => {
    if (!isOpen) {
      // Abort any in-progress video upload when the modal closes
      if (xhrRef.current) { try { xhrRef.current.abort(); } catch (_) { } xhrRef.current = null; }
      setMediaFiles([]);
      setUploadProgress({});
      setUploadStatus({});
      setError(null);
      setShowSuccess(false);
      setPreparingMedia(false);
    }
  }, [isOpen]);

  // Abort XHR on component unmount (navigation away mid-upload)
  useEffect(() => {
    return () => {
      if (xhrRef.current) { try { xhrRef.current.abort(); } catch (_) { } }
      if (draftTimeout.current) clearTimeout(draftTimeout.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        if (onClose) onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e) => {
    if (e.target === modalRef.current && !isSubmitting) {
      if (onClose) onClose();
    }
  }, [isSubmitting, onClose]);

  // Handle file selection
  const handleFileSelect = useCallback((e) => {
    _pickerOpenRef.current = false;

    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      // User cancelled the picker — make sure no banner is up
      setPreparingStage(null);
      return;
    }
    // AUDIT-6/7: mark file arrival so the focus-watchdog (if pending) bails,
    // explicitly clear the pending watchdog timer to free its setTimeout
    // reference now, and transition stage to 'staging' (iOS handoff over).
    _hasFileArrivedRef.current = true;
    if (_focusGraceTimerRef.current) {
      clearTimeout(_focusGraceTimerRef.current);
      _focusGraceTimerRef.current = null;
    }
    setPreparingStage('staging');

    // Limit total files
    const remainingSlots = MAX_MEDIA_FILES - mediaFiles.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_MEDIA_FILES} media files allowed`);
      // AUDIT-3 FIX (2026-04-30): clear the banner on early-return paths so
      // it doesn't sit at "Preparing your video" for the full 60s backstop
      // when the user has already maxed out their media slots.
      setPreparingMedia(false);
      return;
    }

    const filesToAdd = files.slice(0, remainingSlots);

    // Validate each file using sniffMimeType-aware validator
    for (const file of filesToAdd) {
      const validation = validateFile(file);
      if (!validation.valid) {
        setError(validation.error);
        // AUDIT-3 FIX (2026-04-30): same as above — file rejected = clear banner.
        setPreparingMedia(false);
        return;
      }
    }

    setMediaFiles(prev => [...prev, ...filesToAdd]);
    setError(null);

    // POPUP CLEANUP (2026-04-29 per Dan): keep exactly one upload toast
    // (the "Upload running in background" one in bgUpload). The other
    // toasts ("Video selected (XMB)…", "Large video…", "Your video will
    // be optimized…") fired in addition to that and stacked 3+ popups
    // on every video upload. Removed.
    const videoFiles = filesToAdd.filter(f => sniffMimeType(f).startsWith('video/'));

    // 🚀 PREFETCH + BACKGROUND PROCESSING
    // AUDIT-6 (2026-04-30): mobile path skips client generateThumbnail (see
    // SharedPostCreator for full rationale — iPhone HEVC decode adds 1-8s
    // on top of the iOS handoff, server-side cron fills in thumbnail_url).
    const _isMobile = typeof navigator !== 'undefined'
      && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
    if (user?.id) {
      const startIdx = mediaFiles.length; // index offset for new files
      for (let j = 0; j < filesToAdd.length; j++) {
        const file = filesToAdd[j];
        const mime = sniffMimeType(file);
        if (!mime.startsWith('video/')) continue;
        const fk = _fileKey(file);

        // Hard validation only — soft warnings deliberately not toasted.
        const validation = validateVideoFile(file);
        if (!validation.valid) { setError(validation.error); continue; }

        if (_isMobile) {
          // Mobile: defer thumbnail generation to the cron worker server-side.
          thumbnailPromiseRef.current[fk] = Promise.resolve(null);
          // Still kick the signed-URL prefetch so it's warm by Post-tap time.
          bgUpload.prefetch({ file, userId: user.id, folder: 'videos' });
          break;
        }

        // DESKTOP: client-side thumbnail at staging time.
        // Auto-thumbnail generation — store the PROMISE so submit can await
        // it. The previous code only saved the resolved value, which meant
        // any submit fired before HEVC decode finished (every iPhone upload)
        // shipped with thumbnail_url=NULL.
        const thumbPromise = generateThumbnail(file)
          .then(thumb => {
            if (!mountedRef.current) return null;
            if (thumb) {
              setThumbnails(prev => ({ ...prev, [fk]: thumb }));
              // Only set in ref if user hasn't already picked a custom one
              if (!thumbnailRef.current[fk]) {
                thumbnailRef.current[fk] = thumb;
              }
            }
            return thumb || null;
          })
          .catch(err => {
            console.warn('[EnhancedPostCreator] generateThumbnail failed:', err?.message || err);
            return null;
          });
        thumbnailPromiseRef.current[fk] = thumbPromise;

        // Background compression for large videos
        const controller = new AbortController();
        const compPromise = compressVideo(file, {
          signal: controller.signal,
          onProgress: ({ pct }) => {
            if (!mountedRef.current) return;
            setUploadStatus(prev => ({ ...prev, [fk]: `Compressing\u2026 ${pct}%` }));
          },
        }).then(result => {
          compressionRef.current[fk] = { ...compressionRef.current[fk], result };
          if (result.compressed && mountedRef.current) {
            const savedMB = Math.round((result.originalSize - result.compressedSize) / (1024 * 1024));
            toast.success(`Video compressed \u2014 saved ${savedMB}MB (${result.savings}% smaller)`, 3000);
            setUploadStatus(prev => ({ ...prev, [fk]: 'Compressed \u2714' }));
          } else if (mountedRef.current) {
            setUploadStatus(prev => ({ ...prev, [fk]: undefined }));
          }
          return result;
        });
        compressionRef.current[fk] = { controller, promise: compPromise, result: null };

        // Signed URL prefetch (first video only)
        bgUpload.prefetch({ file, userId: user.id, folder: 'videos' });
        break;
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Clear the staging banner once the first thumbnail resolves OR a 30s
    // ceiling fires (iOS HEVC decode is slow). Per-tile pulses take over.
    // Mirrors SharedPostCreator pattern.
    const firstVideo = filesToAdd.find(f => sniffMimeType(f).startsWith('video/'));
    if (firstVideo) {
      const fk = _fileKey(firstVideo);
      const promise = thumbnailPromiseRef.current[fk];
      const ceiling = new Promise(r => setTimeout(r, 30_000));
      Promise.race([promise || Promise.resolve(null), ceiling]).finally(() => {
        if (mountedRef.current) setPreparingMedia(false);
      });
    } else {
      setPreparingMedia(false);
    }
  }, [mediaFiles.length, user?.id]);

  // Remove media file
  const removeMedia = useCallback((index) => {
    // Cancel background compression if running (use file key, not index)
    const file = mediaFiles[index];
    if (file) {
      const fk = _fileKey(file);
      if (compressionRef.current[fk]) {
        compressionRef.current[fk].controller?.abort();
        delete compressionRef.current[fk];
      }
      setThumbnails(prev => { const n = { ...prev }; delete n[fk]; return n; });
      // Also purge from ref so stale thumbnail can't persist for re-added files with same key
      delete thumbnailRef.current[fk];
    }
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  }, [mediaFiles]);

  // Submit post
  const handleSubmit = useCallback(async () => {
    // Double-submit guard — prevents race condition before React re-renders disabled state
    if (isSubmitting) return;

    // Validate content (allow empty if media exists)
    if (!content.trim() && mediaFiles.length === 0) {
      setError('Please add some content or media');
      return;
    }

    if (content.trim()) {
      const validation = validatePostContent(content);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
    }

    if (!supabase) {
      setError('Supabase client not available');
      return;
    }

    if (!user || !user.id) {
      setError('Please log in to create a post');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // ⚡ IMMEDIATE FEEDBACK: show "Preparing…" for every media file right away.
    // This eliminates the ~15-second silent gap before the signed URL comes back.
    const immediateProgress = {};
    const immediateStatus = {};
    mediaFiles.forEach((f, idx) => {
      const isVid = sniffMimeType(f).startsWith('video/');
      immediateProgress[idx] = 0;
      immediateStatus[idx] = isVid ? 'Preparing upload…' : 'Compressing…';
    });
    setUploadProgress(immediateProgress);
    setUploadStatus(immediateStatus);

    // Hoisted above try{} so the catch{} block can read wasBackground without a ReferenceError
    let uploadedMedia = [];

    try {
      const socialService = new SocialService(supabase);

      // 👻 GHOST POST: Create optimistic placeholder in the feed for video uploads
      const hasVideo = mediaFiles.some(f => sniffMimeType(f).startsWith('video/'));
      let videoPreviewUrl = null;
      if (hasVideo) {
        // Create a blurred preview from the first video file
        const firstVideo = mediaFiles.find(f => sniffMimeType(f).startsWith('video/'));
        if (firstVideo) {
          try { videoPreviewUrl = URL.createObjectURL(firstVideo); } catch (_) { }
        }
        ghostPost.create({
          content: content.trim(),
          user: user ? { id: user.id, name: user.name, avatar: user.avatar } : {},
          videoPreviewUrl,
          contentType: 'video',
        });
      }

      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const mimeType = sniffMimeType(file);
        const isVideo = mimeType.startsWith('video/');
        const folder = isVideo ? 'videos' : 'photos';

        try {
          let bgUnsub = null;   // hoisted: catch block can safely call bgUnsub() for both video/image
          let wasBackground = false;
          if (isVideo) {
            // ── Use compressed file if background compression finished ──
            let fileToUpload = file;
            const fk = _fileKey(file);
            const comp = compressionRef.current[fk];
            if (comp?.promise) {
              try {
                const result = comp.result || await Promise.race([
                  comp.promise,
                  new Promise(r => setTimeout(() => r({ file, compressed: false }), 500)),
                ]);
                if (result.compressed) fileToUpload = result.file;
              } catch (_) { /* use original */ }
            }

            // ── Background-capable video upload ───────────────────────────────
            const videoIndex = i;

            const videoUrl = await new Promise((resolve, reject) => {
              // 1. Start the upload (this clears any old listeners from previous uploads)
              bgUpload.start({ 
                  file: fileToUpload, 
                  userId: user.id, 
                  folder, 
                  content: content?.trim(), 
                  thumbnail: thumbnailRef.current[_fileKey(file)] || null 
              }).catch(reject);

              // 2. Subscribe to the new upload's events immediately after
              bgUnsub = bgUpload.subscribe({
                onProgress: ({ pct, label }) => {
                  if (!mountedRef.current) return;
                  setUploadProgress(prev => ({ ...prev, [videoIndex]: pct }));
                  setUploadStatus(prev => ({ ...prev, [videoIndex]: label }));
                  ghostPost.updateProgress(pct, label);
                },
                onComplete: ({ publicUrl, wasBackground: bg }) => {
                  wasBackground = bg;
                  resolve(publicUrl);
                },
                onError: ({ error }) => reject(error),
                onBackground: () => {
                  if (onClose) {
                    // Modal mode — close the modal
                    onClose();
                  } else {
                    // Inline mode — clear the form so it's ready for the next post.
                    // GhostPostCard takes over showing upload progress in the feed.
                    if (mountedRef.current) {
                      setContent('');
                      setMediaFiles([]);
                      setUploadProgress({});
                      setUploadStatus({});
                      setIsSubmitting(false);
                      try { localStorage.removeItem('sp-enhanced-post-draft'); } catch (_) { }
                    }
                  }
                },
              });
            });

            if (bgUnsub) bgUnsub();
            // Clean up compression cache
            delete compressionRef.current[_fileKey(file)];
            // Carry the selected thumbnail alongside the video URL so createPost can persist it
            uploadedMedia.push({ 
              url: videoUrl, 
              type: 'video', 
              name: file.name, 
              thumbnail: thumbnailRef.current[_fileKey(file)] || null, 
              wasBackground 
            });

            if (!wasBackground && mountedRef.current) {
              setUploadProgress(prev => ({ ...prev, [videoIndex]: 100 }));
              setUploadStatus(prev => ({ ...prev, [videoIndex]: 'Done' }));
            }


          } else {
            // Compress image before upload
            setUploadProgress(prev => ({ ...prev, [i]: 10 }));
            const compressedFile = await compressImage(file);
            if (compressedFile.size > 4.5 * 1024 * 1024) {
              throw new Error(`Image is too large (max 4.5MB). Please choose a smaller image.`);
            }

            const formData = new FormData();
            formData.append('file', compressedFile);
            formData.append('folder', folder);
            formData.append('prefix', user.id);

            const _imgToken = getAccessToken();
            if (!_imgToken) {
              throw new Error('Authentication required — please refresh the page and try again.');
            }

            setUploadProgress(prev => ({ ...prev, [i]: 50 }));
            const res = await fetch('/api/social/upload', {
              method: 'POST',
              headers: { Authorization: `Bearer ${_imgToken}` },
              body: formData,
            });

            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();

            if (json.success && json.url) {
              uploadedMedia.push({
                url: json.url,
                type: json.type || 'photo',
                name: file.name
              });
              setUploadProgress(prev => ({ ...prev, [i]: 100 }));
            } else {
              throw new Error(json.error || 'Unknown upload error');
            }
          }
        } catch (uploadErr) {
          if (bgUnsub) { bgUnsub(); bgUnsub = null; } // Always clean up listener on error
          console.warn('Media upload failed:', uploadErr);
          ghostPost.remove(); // Clean up ghost post on upload failure
          const isCancelled = uploadErr?.message === 'Upload cancelled' || uploadErr?.message === 'Upload aborted' || uploadErr?.message === 'Upload superseded';
          if (!isCancelled) {
            setError(`Upload failed: ${uploadErr.message}`);
          }
          setIsSubmitting(false);
          return;
        }
      }

      // Determine content type — compare against normalized 'video'/'photo' strings set during upload,
      // NOT against raw MIME types (which are no longer stored in uploadedMedia.type)
      const contentType = uploadedMedia.some(m => m.type === 'video')
        ? 'video'
        : uploadedMedia.length > 0
          ? 'image'
          : 'text';

      // Upload thumbnail data URL to Storage before persisting — avoids storing large base64 in DB
      // RACE FIX (2026-04-29): rawThumb may be null because generateThumbnail
      // hadn't completed when uploadedMedia was assembled (iPhone HEVC decode
      // takes 30+s). Await the stored promise (with 60s ceiling) before
      // deciding to skip — fixes the "every video post has NULL thumbnail_url"
      // bug confirmed via SQL audit.
      let rawThumb = uploadedMedia.find(m => m.type === 'video')?.thumbnail || null;
      if (!rawThumb && mediaFiles.length > 0) {
        // Pull from any in-flight thumbnail promise for the first video file.
        const firstVideoFile = mediaFiles.find(f => sniffMimeType(f).startsWith('video/'));
        if (firstVideoFile) {
          const fk = _fileKey(firstVideoFile);
          const pendingPromise = thumbnailPromiseRef.current[fk];
          if (pendingPromise) {
            try {
              rawThumb = await Promise.race([
                pendingPromise,
                new Promise(r => setTimeout(() => r(null), 60_000)),
              ]);
            } catch (e) {
              console.warn('[EnhancedPostCreator] await thumbnail promise threw:', e?.message || e);
            }
          }
        }
      }
      let persistedThumbnailUrl = null;
      if (rawThumb && typeof rawThumb === 'string' && rawThumb.startsWith('data:') && user?.id) {
        // Best-effort: failure here means no thumbnail but post still goes through.
        // thumbnailUploader logs HTTP details on failure now.
        persistedThumbnailUrl = await uploadThumbnail(rawThumb, user.id, 'thumbnails').catch(err => {
          console.warn('[EnhancedPostCreator] uploadThumbnail threw:', err?.message || err);
          return null;
        });
        if (!persistedThumbnailUrl) {
          console.warn('[EnhancedPostCreator] uploadThumbnail returned null — post will save without thumbnail_url');
        }
      } else if (rawThumb && typeof rawThumb === 'string' && rawThumb.startsWith('http')) {
        // Already a real URL (e.g. from a previous upload or YouTube)
        persistedThumbnailUrl = rawThumb;
      } else {
        console.warn('[EnhancedPostCreator] no thumbnail dataUrl after wait — post saving without thumbnail_url');
      }

      // Create post with rich media objects
      const newPost = await socialService.createPost({
        authorId: user.id,
        content: content.trim() || (contentType === 'image' ? '📸' : contentType === 'video' ? '🎬' : ''),
        contentType,
        mediaUrls: uploadedMedia.map(m => m.url),
        thumbnailUrl: persistedThumbnailUrl,
        visibility
      });

      // Award social post diamonds (fire-and-forget with toast)
      if (user?.id) {
        claimReward('/api/rewards/social-post', { userId: user.id, postId: newPost?.id }, 'New Post Published');
      }


      // Emit EventBus event for cross-page reactivity
      busEmit.socialPostCreated(newPost?.id, user.id);
      // Cross-tab sync — refresh feed in other open tabs
      broadcastSync('smarter_poker_social_sync', { action: 'refresh_feed', tabId: BROADCAST_TAB_ID });

      // 👻 Promote ghost post to real post — replaces the placeholder in the feed
      if (hasVideo) {
        ghostPost.promote(newPost);
      }

      // ── Success UX: differs based on whether we went background ──────────
      const videoWentBackground = uploadedMedia.some(m => m.wasBackground);

      if (videoWentBackground) {
        // Modal is already closed — fire a persistent clickable toast pointing to the feed
        toast.action(
          '✅ Your video is live! Tap to see it in the feed.',
          () => { window.location.href = '/hub/social-media'; },
          'success'
        );
        // Clean up state even though modal is gone
        try { localStorage.removeItem('sp-enhanced-post-draft'); } catch (_) { }
        onPostCreated?.(newPost);
      } else {
        // Quick upload (<10s) — stay in modal, show success animation
        setShowSuccess(true);
        triggerSuccessParticles();
        toast.success('Posted Successfully!', 2000);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          successTimerRef.current = null;
          setContent('');
          setMediaFiles([]);
          setUploadProgress({});
          setUploadStatus({});
          setThumbnails({});
          thumbnailRef.current = {};
          setShowSuccess(false);
          try { localStorage.removeItem('sp-enhanced-post-draft'); } catch (_) { }
          onPostCreated?.(newPost);
          if (onClose) onClose();
        }, 1500);
      }


    } catch (err) {
      const isCancelled = err?.message === 'Upload cancelled' || err?.message === 'Upload aborted' || err?.message === 'Upload superseded';

      // 👻 Always remove ghost post on error/cancel so feed placeholders don't linger
      ghostPost.remove();

      // Don't log user-initiated cancellations to Sentry — they are intentional
      if (!isCancelled) {
        try {
          Sentry.captureException(err, {
            tags: { area: 'social', action: 'create_post' },
            extra: {
              contentLength: content?.length,
              mediaCount: mediaFiles?.length,
              userId: user?.id,
              errorCode: err?.code,
              errorDetails: err?.details,
              errorHint: err?.hint,
            },
          });
        } catch (_sentryErr) { /* never let Sentry itself crash the UI */ }
      }

      console.warn('[EnhancedPostCreator] Post creation error:', err);

      // Cancelled uploads — clean up silently, no user-facing error
      if (isCancelled) {
        if (mountedRef.current) {
          setIsSubmitting(false);
        }
        return;
      }

      // SAFETY: Robust error message extraction
      let errorMessage = 'Failed to create post';
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (err?.error_description) {
        errorMessage = err.error_description;
      }

      // Sanitize technical DB errors from the user-facing message (still captured in Sentry above)
      const lowerMsg = errorMessage.toLowerCase();
      const isDatabaseError =
        lowerMsg.includes('ambiguous') ||
        lowerMsg.includes('column') ||
        lowerMsg.includes('syntax') ||
        lowerMsg.includes('relation') ||
        lowerMsg.includes('constraint') ||
        lowerMsg.includes('violates');

      const isAuthError =
        lowerMsg.includes('permission') ||
        lowerMsg.includes('policy') ||
        lowerMsg.includes('rls');

      const isNetworkError =
        lowerMsg.includes('network') ||
        lowerMsg.includes('timed out') ||
        lowerMsg.includes('failed to fetch');

      const userFriendlyMessage = isDatabaseError
        ? 'Unable to post right now. Our team has been notified — please try again shortly.'
        : isAuthError
          ? 'You do not have permission to post. Please log in.'
          : isNetworkError
            ? 'Upload failed due to a network issue. Please check your connection and try again.'
            : errorMessage;

      const videoWentBackground = uploadedMedia.some(m => m.wasBackground);

      if (videoWentBackground) {
        toast.error(`❌ ${userFriendlyMessage}`);
      } else if (mountedRef.current) {
        setError(userFriendlyMessage);
        setIsSubmitting(false);
      }
    } finally {
      // BUG FIX (4-pass audit, sweep 2): non-background success path never
      // reset isSubmitting. In inline mode (SmarterPokerFeedView, where
      // onClose is undefined and the modal doesn't unmount on success),
      // the Post button stayed disabled forever after a successful post.
      // The success animation's setTimeout resets content/mediaFiles/etc.
      // but had no setIsSubmitting(false). Belt-and-suspenders: also reset
      // here in finally so any future code path that forgets to reset is
      // caught. Idempotent with existing resets in onBackground/catch paths.
      if (mountedRef.current) setIsSubmitting(false);
    }
  }, [content, mediaFiles, visibility, user, supabase, onPostCreated, onClose, isSubmitting]);

  // Success particle effect
  const triggerSuccessParticles = useCallback(() => {
    const modal = document.querySelector('.creator-card');
    if (!modal) return;

    const rect = modal.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const particles = 20;

    for (let i = 0; i < particles; i++) {
      const particle = document.createElement('div');
      particle.className = 'success-particle';
      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;
      particle.style.setProperty('--angle', `${(i / particles) * 360}deg`);
      particle.style.setProperty('--distance', `${80 + Math.random() * 60}px`);
      particle.style.setProperty('--color', ['#00FFFF', '#FF00FF', '#FFD700', '#32CD32'][i % 4]);
      document.body.appendChild(particle);

      setTimeout(() => particle.remove(), 1000);
    }
  }, []);

  if (!isOpen) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // 🎨 INLINE MODE RENDER (for embedding in feed)
  // ─────────────────────────────────────────────────────────────────────────
  if (inline) {
    return (
      <div className={`creator-card-inline ${showSuccess ? 'success' : ''}`}>
        {/* Success Overlay */}
        {showSuccess && (
          <div className="success-overlay-inline">
            <span className="success-icon">✨</span>
            <span className="success-text">Posted!</span>
          </div>
        )}

        {/* Author Row */}
        <div className="inline-author-row">
          <div className="author-avatar-inline">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" />
            ) : (
              <div className="avatar-placeholder">
                {user?.email?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="inline-textarea"
            placeholder={`What's on your mind, ${user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'}?`}
            value={content}
            onChange={(e) => {
              const val = e.target.value;
              setContent(val);
              setError(null);
              // Debounced draft auto-save (restores text if user reopens or refreshes)
              if (draftTimeout.current) clearTimeout(draftTimeout.current);
              draftTimeout.current = setTimeout(() => {
                try {
                  if (val.trim()) localStorage.setItem('sp-enhanced-post-draft', val);
                  else localStorage.removeItem('sp-enhanced-post-draft');
                } catch (_) { }
              }, 2000);
            }}
            maxLength={MAX_CHARS}
            disabled={isSubmitting}
            rows={1}
            onFocus={(e) => e.target.rows = 3}
            onBlur={(e) => { if (!content) e.target.rows = 1; }}
          />
        </div>

        {/* Media Previews */}
        {mediaFiles.length > 0 && (
          <div className="media-preview-grid-inline">
            {mediaFiles.map((file, index) => {
              const isVideo = file.type.startsWith('video');
              const fk = _fileKey(file);
              return (
                <div key={index} style={{ width: '100%' }}>
                  <MediaPreview
                    file={file}
                    onRemove={() => removeMedia(index)}
                    onCancelUpload={() => {
                      bgUpload.abort();
                      if (mountedRef.current) {
                        setUploadProgress({});
                        setUploadStatus({});
                        setIsSubmitting(false);
                      }
                    }}
                    uploadProgress={uploadProgress[index]}
                    uploadStatusLabel={uploadStatus[fk] || uploadStatus[index]}
                    thumbnail={thumbnails[fk]}
                  />
                  {isVideo && !isSubmitting && (
                    <VideoThumbnailPicker
                      file={file}
                      currentThumbnail={thumbnails[fk]}
                      onSelect={(thumb) => {
                        setThumbnails(prev => ({ ...prev, [fk]: thumb }));
                        thumbnailRef.current[fk] = thumb;
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-inline">
            <span>⚠️ {error}</span>
            <button
              className="error-dismiss-btn"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >×</button>
          </div>
        )}

        {/* Divider */}
        {preparingMedia && (
          <div style={{
            padding: '10px 12px', background: 'linear-gradient(135deg, #E8F4FD, #D4E9F7)',
            borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8
          }}>
            <div style={{
              width: 16, height: 16, border: '2.5px solid #1877F2', borderTopColor: 'transparent',
              borderRadius: '50%',
              // GPU compositing parity with SharedPostCreator (audit-2 2026-04-30):
              // generic `spin` keyframe + no transform layer was getting
              // rate-limited by iOS Safari during HEVC decode. Use the same
              // spPrepSpin/translateZ(0) hint the primary path now uses.
              animation: 'spPrepSpin 0.8s linear infinite',
              WebkitAnimation: 'spPrepSpin 0.8s linear infinite',
              willChange: 'transform',
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1877F2' }}>
              {preparingStage === 'picker'
                ? 'Opening Photos…'
                : preparingStage === 'loading'
                ? 'Loading your video — this can take 5–25s on iPhone for HEVC clips…'
                : 'Preparing Your Video — This May Take A Moment...'}
            </span>

          </div>
        )}
        <div className="inline-divider" />

        {/* Actions Row */}
        <div className="inline-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-msvideo,video/3gpp,video/3gpp2,video/hevc,video/x-matroska"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={isSubmitting || mediaFiles.length >= MAX_MEDIA_FILES}
          />

          <button
            className="inline-action-btn"
            onClick={() => { if (_focusGraceTimerRef.current) { clearTimeout(_focusGraceTimerRef.current); _focusGraceTimerRef.current = null; } _pickerOpenRef.current = true; _hasFileArrivedRef.current = false; setPreparingStage('picker'); fileInputRef.current?.click(); /* AUDIT-6/7: instant on-tap banner + clear stale watchdog from previous picker session */ }}
            disabled={isSubmitting || mediaFiles.length >= MAX_MEDIA_FILES}
          >
            <span className="icon">📷</span> Photo/Video
          </button>
          <button className="inline-action-btn" disabled>
            <span className="icon">🎬</span> Live
          </button>
          <button className="inline-action-btn" disabled>
            <span className="icon">🃏</span> Share Hand
          </button>

          {/* Post Button (shows when content exists) */}
          {(content.trim() || mediaFiles.length > 0) && (
            <button
              className="inline-post-btn"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? '...' : 'Post'}
            </button>
          )}
        </div>

        <style>{`
          .creator-card-inline {
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            margin-bottom: 16px;
            padding: 12px 16px;
            position: relative;
          }

          .creator-card-inline.success {
            box-shadow: 0 0 20px rgba(50, 205, 50, 0.3);
          }

          .success-overlay-inline {
            position: absolute;
            inset: 0;
            background: rgba(240, 255, 240, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            border-radius: 8px;
            z-index: 10;
          }

          .success-overlay-inline .success-icon { font-size: 1.5rem; }
          .success-overlay-inline .success-text { 
            color: #22C55E; 
            font-weight: 600; 
          }

          .inline-author-row {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .author-avatar-inline {
            width: 40px;
            height: 40px;
            flex-shrink: 0;
          }

          .author-avatar-inline img,
          .author-avatar-inline .avatar-placeholder {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
          }

          .author-avatar-inline .avatar-placeholder {
            background: linear-gradient(135deg, #1877F2, #00D9FF);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
          }

          .inline-textarea {
            flex: 1;
            border: none;
            background: #F0F2F5;
            border-radius: 20px;
            padding: 10px 16px;
            font-size: 17px;
            color: #050505;
            resize: none;
            min-height: 40px;
            transition: background 0.2s ease;
          }

          .inline-textarea:focus {
            outline: none;
            background: #E4E6EB;
          }

          .inline-textarea::placeholder {
            color: #65676B;
          }

          .media-preview-grid-inline {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin: 12px 0;
          }

          .error-inline {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            color: #DC2626;
            font-size: 14px;
            padding: 8px 0;
          }
          .error-inline .error-dismiss-btn {
            flex-shrink: 0;
            background: none;
            border: none;
            color: #DC2626;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            padding: 0 2px;
            opacity: 0.7;
          }
          .error-inline .error-dismiss-btn:hover { opacity: 1; }

          .inline-divider {
            height: 1px;
            background: #E4E6EB;
            margin: 12px 0;
          }

          .inline-actions {
            display: flex;
            justify-content: space-around;
            align-items: center;
          }

          .inline-action-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: transparent;
            border: none;
            border-radius: 6px;
            font-size: 15px;
            font-weight: 600;
            color: #65676B;
            cursor: pointer;
          }

          .inline-action-btn:hover:not(:disabled) {
            background: #F2F2F2;
          }

          .inline-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .inline-action-btn .icon { font-size: 20px; }

          .inline-post-btn {
            background: #1877F2;
            color: white;
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            margin-left: auto;
          }

          .inline-post-btn:hover:not(:disabled) {
            background: #166FE5;
          }

          .inline-post-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🎨 MODAL MODE RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="post-creator-overlay"
      ref={modalRef}
      onClick={handleBackdropClick}
    >
      <div className={`creator-card glass-card ${showSuccess ? 'success' : ''}`}>
        {/* Success Overlay */}
        {showSuccess && (
          <div className="success-overlay">
            <div className="success-icon">✨</div>
            <div className="success-text">Post Created!</div>
          </div>
        )}

        {/* Header */}
        <header className="creator-header">
          <h2>Create Post</h2>
          {onClose && (
            <button
              className="close-btn interactive"
              onClick={onClose}
              aria-label="Close"
              disabled={isSubmitting}
            >
              ✕
            </button>
          )}
        </header>

        {/* Author Preview */}
        <div className="author-preview">
          <div className="author-avatar">
            <div className="avatar-placeholder">
              {user?.email?.[0]?.toUpperCase() || '?'}
            </div>
          </div>
          <div className="author-info">
            <span className="author-name">{user?.email?.split('@')[0] || 'You'}</span>
            <select
              className="visibility-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="public">🌍 Public</option>
              <option value="followers">👥 Followers</option>
              <option value="private">🔒 Private</option>
            </select>
          </div>
        </div>

        {/* Content Input */}
        <div className="content-input-container">
          <textarea
            ref={textareaRef}
            className="content-textarea"
            placeholder="Share Your Poker Journey, Achievements, Or Insights..."
            value={content}
            onChange={(e) => {
              const val = e.target.value;
              setContent(val);
              setError(null);
              // Debounced draft auto-save (restores text if user reopens or refreshes)
              if (draftTimeout.current) clearTimeout(draftTimeout.current);
              draftTimeout.current = setTimeout(() => {
                try {
                  if (val.trim()) localStorage.setItem('sp-enhanced-post-draft', val);
                  else localStorage.removeItem('sp-enhanced-post-draft');
                } catch (_) { }
              }, 2000);
            }}
            maxLength={MAX_CHARS}
            disabled={isSubmitting}
          />

          {/* Character Counter */}
          <div className="char-counter">
            <div
              className="char-progress"
              style={{
                width: `${Math.min(charPercentage, 100)}%`,
                background: charPercentage > 90
                  ? '#FF4444'
                  : charPercentage > 75
                    ? '#FFD700'
                    : '#00FFFF'
              }}
            />
            <span className={charPercentage > 90 ? 'warning' : ''}>
              {charCount}/{MAX_CHARS}
            </span>
          </div>
        </div>

        {/* Media Previews */}
        {mediaFiles.length > 0 && (
          <div className="media-preview-grid">
            {mediaFiles.map((file, index) => {
              const isVideo = file.type.startsWith('video');
              const fk = _fileKey(file);
              return (
                <div key={index} style={{ width: '100%' }}>
                  <MediaPreview
                    file={file}
                    onRemove={() => removeMedia(index)}
                    onCancelUpload={() => {
                      bgUpload.abort();
                      if (mountedRef.current) {
                        setUploadProgress({});
                        setUploadStatus({});
                        setIsSubmitting(false);
                      }
                    }}
                    uploadProgress={uploadProgress[index]}
                    uploadStatusLabel={uploadStatus[fk] || uploadStatus[index]}
                    thumbnail={thumbnails[fk]}
                  />
                  {isVideo && !isSubmitting && (
                    <VideoThumbnailPicker
                      file={file}
                      currentThumbnail={thumbnails[fk]}
                      onSelect={(thumb) => {
                        setThumbnails(prev => ({ ...prev, [fk]: thumb }));
                        thumbnailRef.current[fk] = thumb;
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span>⚠️ {error}</span>
            <button
              className="error-dismiss-btn"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >×</button>
          </div>
        )}

        {/* Preparing Media Indicator */}
        {preparingMedia && (
          <div style={{
            padding: '10px 12px', background: 'rgba(24,119,242,0.1)',
            borderRadius: 6, margin: '0 16px 12px', display: 'flex', alignItems: 'center', gap: 8
          }}>
            <div style={{
              width: 16, height: 16, border: '2.5px solid #1877F2', borderTopColor: 'transparent',
              borderRadius: '50%',
              // GPU compositing parity with SharedPostCreator (audit-2 2026-04-30) — see note on the
              // sibling banner above for why generic `spin` was insufficient on iOS.
              animation: 'spPrepSpin 0.8s linear infinite',
              WebkitAnimation: 'spPrepSpin 0.8s linear infinite',
              willChange: 'transform',
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1877F2' }}>
              {preparingStage === 'picker'
                ? 'Opening Photos…'
                : preparingStage === 'loading'
                ? 'Loading your video — this can take 5–25s on iPhone for HEVC clips…'
                : 'Preparing Your Video — This May Take A Moment...'}
            </span>

          </div>
        )}

        {/* Actions */}
        <footer className="creator-actions">
          <div className="action-tools">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-msvideo,video/3gpp,video/3gpp2,video/hevc,video/x-matroska"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={isSubmitting || mediaFiles.length >= MAX_MEDIA_FILES}
            />

            <button
              className="tool-btn interactive"
              title="Add Photo/Video"
              onClick={() => { if (_focusGraceTimerRef.current) { clearTimeout(_focusGraceTimerRef.current); _focusGraceTimerRef.current = null; } _pickerOpenRef.current = true; _hasFileArrivedRef.current = false; setPreparingStage('picker'); fileInputRef.current?.click(); /* AUDIT-6/7: instant on-tap banner + clear stale watchdog from previous picker session */ }}
              disabled={isSubmitting || mediaFiles.length >= MAX_MEDIA_FILES}
            >
              📷
            </button>
            <button
              className="tool-btn interactive"
              title="Record Video"
              disabled
            >
              🎬
            </button>
            <button
              className="tool-btn interactive"
              title="Add Poll (Coming Soon)"
              disabled
            >
              📊
            </button>

            {/* Media count indicator */}
            {mediaFiles.length > 0 && (
              <span className="media-count">
                {mediaFiles.length}/{MAX_MEDIA_FILES}
              </span>
            )}
          </div>

          <button
            className="submit-btn interactive glow-shift"
            onClick={handleSubmit}
            disabled={isSubmitting || (!content.trim() && mediaFiles.length === 0)}
          >
            {isSubmitting ? (
              <span className="submit-loading">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </span>
            ) : (
              <>
                <span>Post</span>
                <span className="arrow">→</span>
              </>
            )}
          </button>
        </footer>
      </div>

      <style>{`
        .post-creator-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 24px;
          animation: overlay-fade 0.3s ease;
        }
        
        @keyframes overlay-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .creator-card {
          position: relative;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 0;
          background: rgba(20, 20, 35, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          animation: card-pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        @keyframes card-pop-in {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .creator-card.success {
          transform: scale(1.02);
          box-shadow: 0 0 60px rgba(50, 205, 50, 0.4);
        }
        
        /* Success Overlay */
        .success-overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 30, 20, 0.95);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10;
          border-radius: 16px;
          animation: success-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes success-pop {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        
        .success-icon {
          font-size: 4rem;
          margin-bottom: 16px;
          animation: success-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes success-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        
        .success-text {
          font-family: 'Exo 2', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: #32CD32;
          text-shadow: 0 0 20px rgba(50, 205, 50, 0.5);
        }
        
        /* Header */
        .creator-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .creator-header h2 {
          font-family: 'Exo 2', sans-serif;
          font-size: 1.1rem;
          color: white;
          margin: 0;
        }
        
        .close-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: none;
          border-radius: 50%;
          color: rgba(255, 255, 255, 0.6);
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .close-btn:hover:not(:disabled) {
          background: rgba(255, 68, 68, 0.2);
          color: #FF6B6B;
        }
        
        .close-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        /* Author Preview */
        .author-preview {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
        }
        
        .author-avatar {
          width: 44px;
          height: 44px;
        }
        
        .avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: linear-gradient(135deg, #00FFFF, #0088FF);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 1.1rem;
        }
        
        .author-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .author-name {
          font-weight: 600;
          color: white;
        }
        
        .visibility-select {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 4px 8px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.8rem;
          cursor: pointer;
        }
        
        .visibility-select option {
          background: #1a1a2e;
          color: white;
        }
        
        /* Content Input */
        .content-input-container {
          padding: 0 20px 16px;
        }
        
        .content-textarea {
          width: 100%;
          min-height: 120px;
          max-height: 200px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          line-height: 1.6;
          resize: vertical;
          transition: border-color 0.2s ease;
        }
        
        .content-textarea::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        
        .content-textarea:focus {
          outline: none;
          border-color: rgba(0, 255, 255, 0.3);
        }
        
        .content-textarea:disabled {
          opacity: 0.5;
        }
        
        /* Character Counter */
        .char-counter {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 8px;
        }
        
        .char-progress {
          height: 3px;
          background: #00FFFF;
          border-radius: 2px;
          transition: width 0.2s ease, background 0.2s ease;
          max-width: 100px;
        }
        
        .char-counter span {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
        }
        
        .char-counter span.warning {
          color: #FF6B6B;
        }
        
        /* Media Preview Grid */
        .media-preview-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          padding: 0 20px 16px;
        }
        
        .media-preview-item {
          position: relative;
          aspect-ratio: 1;
          border-radius: 12px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.3);
        }
        
        .preview-media {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .upload-progress-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px;
        }
        
        .progress-ring {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: conic-gradient(
            #00FFFF calc(var(--progress) * 1%),
            rgba(255, 255, 255, 0.1) calc(var(--progress) * 1%)
          );
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .progress-ring::before {
          content: '';
          position: absolute;
          width: 36px;
          height: 36px;
          background: rgba(20, 20, 35, 0.95);
          border-radius: 50%;
        }
        
        .progress-ring span {
          position: relative;
          z-index: 1;
          font-size: 0.75rem;
          font-weight: 600;
          color: #00FFFF;
        }

        .progress-label {
          font-size: 0.65rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          text-align: center;
          max-width: 90px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: 0.02em;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        }
        
        .remove-media-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          background: rgba(0, 0, 0, 0.7);
          border: none;
          border-radius: 50%;
          color: white;
          font-size: 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        
        .media-preview-item:hover .remove-media-btn {
          opacity: 1;
        }
        
        .remove-media-btn:hover {
          background: rgba(255, 68, 68, 0.8);
        }
        
        .remove-media-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .media-type-badge {
          position: absolute;
          bottom: 8px;
          left: 8px;
          padding: 2px 6px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 4px;
          font-size: 0.8rem;
        }
        
        /* Error */
        .error-message {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin: 0 20px 16px;
          padding: 12px;
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid rgba(255, 68, 68, 0.3);
          border-radius: 8px;
          color: #FF6B6B;
          font-size: 0.9rem;
        }
        .error-message .error-dismiss-btn {
          flex-shrink: 0;
          background: none;
          border: none;
          color: #FF6B6B;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0 2px;
          opacity: 0.7;
        }
        .error-message .error-dismiss-btn:hover { opacity: 1; }
        
        /* Actions */
        .creator-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .action-tools {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .tool-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: none;
          border-radius: 8px;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .tool-btn:not(:disabled):hover {
          background: rgba(0, 255, 255, 0.1);
          transform: scale(1.05);
        }
        
        .tool-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .media-count {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        
        .submit-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(0, 191, 255, 0.1));
          border: 1px solid rgba(0, 255, 255, 0.3);
          border-radius: 12px;
          color: #00FFFF;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .submit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .submit-btn:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(0, 255, 255, 0.3), rgba(0, 191, 255, 0.2));
          transform: translateY(-1px);
        }
        
        .submit-btn .arrow {
          transition: transform 0.2s ease;
        }
        
        .submit-btn:hover .arrow {
          transform: translateX(4px);
        }
        
        .submit-loading {
          display: flex;
          gap: 4px;
        }
        
        .submit-loading .dot {
          width: 6px;
          height: 6px;
          background: #00FFFF;
          border-radius: 50%;
          animation: loading-bounce 1s ease-in-out infinite;
        }
        
        .submit-loading .dot:nth-child(1) { animation-delay: 0s; }
        .submit-loading .dot:nth-child(2) { animation-delay: 0.15s; }
        .submit-loading .dot:nth-child(3) { animation-delay: 0.3s; }
        
        @keyframes loading-bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1.2); opacity: 1; }
        }
        
        /* Success Particles */
        :global(.success-particle) {
          position: fixed;
          width: 10px;
          height: 10px;
          background: var(--color, #00FFFF);
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          animation: particle-explode 1s ease-out forwards;
        }
        
        @keyframes particle-explode {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: 
              translate(
                calc(cos(var(--angle)) * var(--distance)),
                calc(sin(var(--angle)) * var(--distance))
              ) 
              scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default EnhancedPostCreator;
