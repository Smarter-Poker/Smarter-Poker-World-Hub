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
import ghostPost from '../../stores/ghostPostStore';

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

const MediaPreview = ({ file, onRemove, uploadProgress, uploadStatusLabel }) => {
  const [preview, setPreview] = useState(null);
  // Use sniffMimeType so iOS MOV files (which have empty file.type) are detected as video
  const isVideo = sniffMimeType(file).startsWith('video/');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="media-preview-item">
      {isVideo ? (
        <video src={preview} className="preview-media" muted />
      ) : (
        <img src={preview} alt="Preview" className="preview-media" />
      )}

      {/* Upload Progress Overlay */}
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
        </div>
      )}

      {/* Remove Button */}
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

  const textareaRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const xhrRef = useRef(null);          // holds active video XHR so we can abort on unmount
  const draftTimeout = useRef(null);    // debounce handle for draft auto-save
  const mountedRef = useRef(true);      // unmount guard for background upload callbacks

  // Track mount lifecycle
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
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
        const saved = localStorage.getItem('sp-enhanced-post-draft');
        if (saved) setContent(saved);
      } catch (e) { /* ignore */ }
    }
  }, [isOpen]);

  // Reset state when modal closes — do NOT clear draft (user may reopen)
  useEffect(() => {
    if (!isOpen) {
      // Abort any in-progress video upload when the modal closes
      if (xhrRef.current) { try { xhrRef.current.abort(); } catch (_) {} xhrRef.current = null; }
      setMediaFiles([]);
      setUploadProgress({});
      setUploadStatus({});
      setError(null);
      setShowSuccess(false);
    }
  }, [isOpen]);

  // Abort XHR on component unmount (navigation away mid-upload)
  useEffect(() => {
    return () => {
      if (xhrRef.current) { try { xhrRef.current.abort(); } catch (_) {} }
      if (draftTimeout.current) clearTimeout(draftTimeout.current);
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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit total files
    const remainingSlots = MAX_MEDIA_FILES - mediaFiles.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_MEDIA_FILES} media files allowed`);
      return;
    }

    const filesToAdd = files.slice(0, remainingSlots);

    // Validate each file using sniffMimeType-aware validator
    for (const file of filesToAdd) {
      const validation = validateFile(file);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
    }

    setMediaFiles(prev => [...prev, ...filesToAdd]);
    setError(null);

    // 🚀 PREFETCH: If user selected a video, start fetching the upload URL now.
    // By the time they type a caption and hit "Post", the URL is already cached.
    if (user?.id) {
      for (const file of filesToAdd) {
        const mime = sniffMimeType(file);
        if (mime.startsWith('video/')) {
          bgUpload.prefetch({ file, userId: user.id, folder: 'videos' });
          break; // only prefetch the first video
        }
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [mediaFiles.length, user?.id]);

  // Remove media file
  const removeMedia = useCallback((index) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

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

    try {
      const socialService = new SocialService(supabase);

      // Upload media files first using direct Supabase storage
      const uploadedMedia = [];

      // 👻 GHOST POST: Create optimistic placeholder in the feed for video uploads
      const hasVideo = mediaFiles.some(f => sniffMimeType(f).startsWith('video/'));
      let videoPreviewUrl = null;
      if (hasVideo) {
        // Create a blurred preview from the first video file
        const firstVideo = mediaFiles.find(f => sniffMimeType(f).startsWith('video/'));
        if (firstVideo) {
          try { videoPreviewUrl = URL.createObjectURL(firstVideo); } catch (_) {}
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
          if (isVideo) {
            // ── Background-capable video upload ───────────────────────────────
            // XHR lives at module level — survives modal unmount.
            // >10s: modal auto-closes, user can browse, completion fires clickable toast.
            const videoIndex = i;
            let bgUnsub = null;
            let wasBackground = false;

            const videoUrl = await new Promise((resolve, reject) => {
              bgUnsub = bgUpload.subscribe({
                onProgress: ({ pct, label }) => {
                  if (!mountedRef.current) return; // Guard: modal may be unmounted
                  setUploadProgress(prev => ({ ...prev, [videoIndex]: pct }));
                  setUploadStatus(prev => ({ ...prev, [videoIndex]: label }));
                  // Update ghost post progress
                  ghostPost.updateProgress(pct, label);
                },
                onComplete: ({ publicUrl, wasBackground: bg }) => {
                  wasBackground = bg;
                  resolve(publicUrl);
                },
                onError: ({ error }) => reject(error),
                onBackground: () => {
                  // Upload taking >10s — close modal, let user browse
                  if (onClose) onClose();
                },
              });

              bgUpload.start({ file, userId: user.id, folder }).catch(reject);
            });

            if (bgUnsub) bgUnsub();
            uploadedMedia.push({ url: videoUrl, type: 'video', name: file.name, wasBackground });
            
            if (!wasBackground) {
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
          console.warn('Media upload failed:', uploadErr);
          ghostPost.remove(); // Clean up ghost post on upload failure
          setError(`Upload failed: ${uploadErr.message}`);
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

      // Create post with rich media objects
      const newPost = await socialService.createPost({
        authorId: user.id,
        content: content.trim() || (contentType === 'image' ? '📸' : contentType === 'video' ? '🎬' : ''),
        contentType,
        mediaUrls: uploadedMedia.map(m => m.url),
        visibility
      });

      // Award social post diamonds (fire-and-forget with toast)
      if (user?.id) {
        claimReward('/api/rewards/social-post', { userId: user.id, postId: newPost?.id }, 'New Post Published');
      }

      // Show success animation
      setShowSuccess(true);
      triggerSuccessParticles();

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
        try { localStorage.removeItem('sp-enhanced-post-draft'); } catch (_) {}
        onPostCreated?.(newPost);
      } else {
        // Quick upload (<10s) — stay in modal, show success animation
        setShowSuccess(true);
        triggerSuccessParticles();
        toast.success('Posted Successfully!', 2000);
        setTimeout(() => {
          setContent('');
          setMediaFiles([]);
          setUploadProgress({});
          setUploadStatus({});
          setShowSuccess(false);
          try { localStorage.removeItem('sp-enhanced-post-draft'); } catch (_) {}
          onPostCreated?.(newPost);
          if (onClose) onClose();
        }, 1500);
      }


    } catch (err) {
      // Log full error to Sentry for post-mortem visibility before sanitizing for users
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

      console.warn('[EnhancedPostCreator] Post creation error:', err);

      // 👻 Remove ghost post on error
      ghostPost.remove();

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
      } else {
        setError(userFriendlyMessage);
        setIsSubmitting(false);
      }
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
                } catch (_) {}
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
            {mediaFiles.map((file, index) => (
              <MediaPreview
                key={index}
                file={file}
                onRemove={() => removeMedia(index)}
                uploadProgress={uploadProgress[index]}
                uploadStatusLabel={uploadStatus[index]}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {error && <div className="error-inline">⚠️ {error}</div>}

        {/* Divider */}
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
            onClick={() => fileInputRef.current?.click()}
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
            color: #DC2626;
            font-size: 14px;
            padding: 8px 0;
          }

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
                } catch (_) {}
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
            {mediaFiles.map((file, index) => (
              <MediaPreview
                key={index}
                file={file}
                onRemove={() => removeMedia(index)}
                uploadProgress={uploadProgress[index]}
                uploadStatusLabel={uploadStatus[index]}
              />
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            ⚠️ {error}
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
              onClick={() => fileInputRef.current?.click()}
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
          margin: 0 20px 16px;
          padding: 12px;
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid rgba(255, 68, 68, 0.3);
          border-radius: 8px;
          color: #FF6B6B;
          font-size: 0.9rem;
        }
        
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
