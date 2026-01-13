/**
 * ✍️ ENHANCED POST CREATOR MODAL
 * src/components/social/EnhancedPostCreator.jsx
 * 
 * Full-featured post creator with image/video uploads,
 * media previews, and spatial animations.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SocialService } from '../../services/SocialService';
import { validatePostContent } from '../../services/social-types';

// Simple file validation since MediaUploadService may not exist
const validateFile = (file, mediaType) => {
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

  if (mediaType === 'video') {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return { valid: false, error: 'Invalid video format. Use MP4 or WebM.' };
    }
    if (file.size > MAX_VIDEO_SIZE) {
      return { valid: false, error: 'Video too large. Max 100MB.' };
    }
  } else {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { valid: false, error: 'Invalid image format. Use JPEG, PNG, GIF, or WebP.' };
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return { valid: false, error: 'Image too large. Max 10MB.' };
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

const MediaPreview = ({ file, onRemove, uploadProgress }) => {
  const [preview, setPreview] = useState(null);
  const isVideo = file.type.startsWith('video/');

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
            <span>{uploadProgress}%</span>
          </div>
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
  user,           // User object passed from parent
  supabase,       // Supabase client passed from parent
  inline = false  // New: inline mode renders without modal overlay
}) => {

  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const textareaRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);

  // Character count
  const charCount = content.length;
  const charPercentage = (charCount / MAX_CHARS) * 100;

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setMediaFiles([]);
      setUploadProgress({});
      setError(null);
      setShowSuccess(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e) => {
    if (e.target === modalRef.current && !isSubmitting) {
      onClose();
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

    // Validate each file
    for (const file of filesToAdd) {
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      const validation = validateFile(file, mediaType);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
    }

    setMediaFiles(prev => [...prev, ...filesToAdd]);
    setError(null);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [mediaFiles.length]);

  // Remove media file
  const removeMedia = useCallback((index) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Submit post
  const handleSubmit = useCallback(async () => {
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

    setIsSubmitting(true);
    setError(null);

    try {
      const socialService = new SocialService(supabase);

      // Upload media files first using direct Supabase storage
      const uploadedMedia = [];

      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const isVideo = file.type.startsWith('video/');
        const bucket = isVideo ? 'videos' : 'images';
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}_${i}.${fileExt}`;

        try {
          setUploadProgress(prev => ({ ...prev, [i]: 10 }));

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          setUploadProgress(prev => ({ ...prev, [i]: 80 }));

          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

          setUploadProgress(prev => ({ ...prev, [i]: 100 }));

          uploadedMedia.push({
            url: urlData.publicUrl,
            type: file.type,
            name: file.name
          });
        } catch (uploadErr) {
          console.error('Media upload failed:', uploadErr);
          setError(`Failed to upload ${file.name}`);
          setIsSubmitting(false);
          return;
        }
      }

      // Determine content type
      const contentType = uploadedMedia.some(m => m.type?.startsWith('video/'))
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

      // Show success animation
      setShowSuccess(true);
      triggerSuccessParticles();

      setTimeout(() => {
        setContent('');
        setMediaFiles([]);
        setUploadProgress({});
        setShowSuccess(false);
        onPostCreated?.(newPost);
        if (onClose) onClose();
      }, 1500);

    } catch (err) {
      console.error('Post creation error:', err);
      setError('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [content, mediaFiles, visibility, user, supabase, onPostCreated, onClose]);

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
              setContent(e.target.value);
              setError(null);
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
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
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
            placeholder="Share your poker journey, achievements, or insights..."
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setError(null);
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
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
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
          align-items: center;
          justify-content: center;
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
