/**
 * ✍️ FLOATING POST CREATOR MODAL
 * src/app/social/components/PostCreator.jsx
 * 
 * Overlay modal for creating new posts with spatial animations
 * and haptic feedback on successful post.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSupabase } from '../../providers/SupabaseProvider';
import { useSocialOrb } from '../../providers/SocialOrbProvider';
import { SocialService } from '../SocialService';
import { validatePostContent } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// ✍️ POST CREATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const PostCreator = ({
    isOpen,
    onClose,
    onPostCreated
}) => {
    const { user, supabase } = useSupabase();
    const { state: socialState } = useSocialOrb();

    const [content, setContent] = useState('');
    const [visibility, setVisibility] = useState('public');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);

    const textareaRef = useRef(null);
    const modalRef = useRef(null);

    // Character count
    const charCount = content.length;
    const maxChars = 2000;
    const charPercentage = (charCount / maxChars) * 100;

    // Focus textarea when modal opens
    useEffect(() => {
        if (isOpen && textareaRef.current) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Handle backdrop click
    const handleBackdropClick = useCallback((e) => {
        if (e.target === modalRef.current) {
            onClose();
        }
    }, [onClose]);

    // Submit post
    const handleSubmit = useCallback(async () => {
        const validation = validatePostContent(content);
        if (!validation.valid) {
            setError(validation.error);
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const socialService = new SocialService(supabase);
            const newPost = await socialService.createPost({
                authorId: user.id,
                content: content.trim(),
                contentType: 'text',
                visibility
            });

            // Show success animation
            setShowSuccess(true);
            triggerSuccessParticles();

            setTimeout(() => {
                setContent('');
                setShowSuccess(false);
                onPostCreated?.(newPost);
                onClose();
            }, 1500);

        } catch (err) {
            console.error('Post creation error:', err);
            setError('Failed to create post. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }, [content, visibility, user, supabase, onPostCreated, onClose]);

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
                    <button
                        className="close-btn interactive"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
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
                        maxLength={maxChars}
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
                            {charCount}/{maxChars}
                        </span>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="error-message">
                        ⚠️ {error}
                    </div>
                )}

                {/* Actions */}
                <footer className="creator-actions">
                    <div className="action-tools">
                        <button className="tool-btn interactive" title="Add Image" disabled>
                            📷
                        </button>
                        <button className="tool-btn interactive" title="Add GIF" disabled>
                            🎬
                        </button>
                        <button className="tool-btn interactive" title="Add Poll" disabled>
                            📊
                        </button>
                    </div>

                    <button
                        className="submit-btn interactive glow-shift"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !content.trim()}
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
          padding: 0;
          overflow: hidden;
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
          animation: success-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes success-pop {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
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
        
        .close-btn:hover {
          background: rgba(255, 68, 68, 0.2);
          color: #FF6B6B;
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
          min-height: 150px;
          max-height: 300px;
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
          opacity: 0.5;
        }
        
        .tool-btn:not(:disabled):hover {
          background: rgba(255, 255, 255, 0.1);
          opacity: 1;
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

export default PostCreator;
