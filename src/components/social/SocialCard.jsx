/**
 * 🃏 SOCIAL POST CARD COMPONENT
 * src/app/social/components/SocialCard.jsx
 * 
 * Interactive social post with glassmorphism, neon-glow hover states,
 * and haptic scale-spring feedback on interaction.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getAuthorDisplayName } from '../../utils/displayName';
import { INTERACTION_TYPES } from '../../services/social-types';

// ═══════════════════════════════════════════════════════════════════════════
// 🎴 SOCIAL CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const SocialCard = ({
  post,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onAuthorClick,
  onPostClick,
  isExpanded = false,
  animationDelay = 0
}) => {
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.engagement?.likeCount || 0);
  const [currentReactionType, setCurrentReactionType] = useState('like');
  const [showReactions, setShowReactions] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const likePendingRef = useRef(false);

  // Sync from parent when props change (e.g. EventBus-driven updates)
  useEffect(() => {
    setIsLiked(post.isLiked);
    setLikeCount(post.engagement?.likeCount || 0);
  }, [post.isLiked, post.engagement?.likeCount]);

  // Tier-based styling
  const tierStyles = useMemo(() => {
    const tiers = {
      BRONZE: { glow: 'rgba(205, 127, 50, 0.3)', accent: '#CD7F32' },
      SILVER: { glow: 'rgba(192, 192, 192, 0.3)', accent: '#C0C0C0' },
      GOLD: { glow: 'rgba(255, 215, 0, 0.3)', accent: '#FFD700' },
      GTO_MASTER: { glow: 'rgba(148, 0, 211, 0.3)', accent: '#9400D3' }
    };
    return tiers[post.author?.tier] || tiers.BRONZE;
  }, [post.author?.tier]);

  // Handle like with optimistic update, swap detection, and rapid-click guard
  const handleLike = useCallback(async (reactionType = 'like') => {
    if (likePendingRef.current) return; // prevent rapid fire
    likePendingRef.current = true;

    const wasLiked = isLiked;
    const prevType = currentReactionType;
    const prevCount = likeCount;
    const isSwap = wasLiked && reactionType !== prevType;

    // Optimistic update
    if (isSwap) {
      // Swap: stay liked, just change type. Count unchanged.
      setCurrentReactionType(reactionType);
    } else {
      // Toggle
      setIsLiked(!wasLiked);
      setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);
      if (!wasLiked) setCurrentReactionType(reactionType);
    }
    setIsAnimating(true);
    setShowReactions(false);

    // Trigger particle burst only on NEW like
    if (!wasLiked && !isSwap) {
      triggerParticleBurst();
    }

    try {
      await onLike?.(post.id, reactionType);
    } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }

    likePendingRef.current = false;
    setTimeout(() => setIsAnimating(false), 600);
  }, [isLiked, likeCount, currentReactionType, post.id, onLike]);

  // Particle burst effect
  const triggerParticleBurst = useCallback(() => {
    const button = document.querySelector(`#like-btn-${post.id}`);
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const particles = 8;

    for (let i = 0; i < particles; i++) {
      const particle = document.createElement('div');
      particle.className = 'like-particle';
      particle.style.left = `${rect.left + rect.width / 2}px`;
      particle.style.top = `${rect.top + rect.height / 2}px`;
      particle.style.setProperty('--angle', `${(i / particles) * 360}deg`);
      document.body.appendChild(particle);

      setTimeout(() => particle.remove(), 800);
    }
  }, [post.id]);

  return (
    <article
      className={`social-card glass-card interactive ${isExpanded ? 'expanded' : ''}`}
      style={{
        animationDelay: `${animationDelay}ms`,
        '--tier-glow': tierStyles.glow,
        '--tier-accent': tierStyles.accent
      }}
    >
      {/* Author Header */}
      <header className="card-header">
        <button
          className="author-info interactive"
          onClick={() => onAuthorClick?.(post.author?.id)}
        >
          <div className="author-avatar">
            {post.author?.avatarUrl ? (
              <img src={post.author.avatarUrl} alt={post.author.username} />
            ) : (
              <div className="avatar-placeholder">
                {post.author?.username?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="level-badge">
              {post.author?.level || 1}
            </div>
          </div>

          <div className="author-details">
            <span className="author-name">
              {getAuthorDisplayName(post.author)}
              {post.author?.isVerified && <span className="verified-badge">✓</span>}
            </span>
            <span className="post-time">{post.relativeTime}</span>
          </div>
        </button>

        <div className="tier-indicator" title={post.author?.tier}>
          {post.author?.tier === 'GTO_MASTER' ? '👑' :
            post.author?.tier === 'GOLD' ? '🥇' :
              post.author?.tier === 'SILVER' ? '🥈' : '🥉'}
        </div>
      </header>

      {/* Post Content */}
      <div
        className="card-content"
        onClick={() => onPostClick?.(post.id)}
      >
        <p className="post-text">{post.content}</p>

        {/* Media Grid */}
        {post.mediaUrls?.length > 0 && (
          <div className={`media-grid media-count-${Math.min(post.mediaUrls.length, 4)}`}>
            {post.mediaUrls.slice(0, 4).map((url, i) => (
              <div key={i} className="media-item">
                {post.contentType === 'video' && i === 0 ? (
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <video
                        src={url}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        muted playsInline preload="metadata"
                    />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.2)' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 4 }}><polygon points="5,3 19,12 5,21"/></svg>
                        </div>
                    </div>
                  </div>
                ) : (
                  <img src={url} alt={`Media ${i + 1}`} loading="lazy" />
                )}
                {i === 3 && post.mediaUrls.length > 4 && (
                  <div className="media-overflow">+{post.mediaUrls.length - 4}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Achievement Card */}
        {post.contentType === 'achievement' && post.achievementData && (
          <div className="achievement-card">
            <div className="achievement-icon">{post.achievementData.icon || '🏆'}</div>
            <div className="achievement-text">
              <span className="achievement-title">{post.achievementData.title}</span>
              <span className="achievement-desc">{post.achievementData.description}</span>
            </div>
          </div>
        )}
      </div>

      {/* Engagement Stats */}
      <div className="engagement-stats">
        {likeCount > 0 && (
          <span className="stat-item">
            {INTERACTION_TYPES.like.emoji} {likeCount}
          </span>
        )}
        {post.engagement?.commentCount > 0 && (
          <span className="stat-item">
            {post.engagement.commentCount} comment{post.engagement.commentCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Action Bar */}
      <footer className="card-actions">
        <div className="reaction-container">
          <button
            id={`like-btn-${post.id}`}
            className={`action-btn like-btn ${isLiked ? 'liked' : ''} ${isAnimating ? 'animating' : ''}`}
            onClick={() => handleLike('like')}
            onMouseEnter={() => setShowReactions(true)}
            onMouseLeave={() => setTimeout(() => setShowReactions(false), 300)}
          >
            <span className="btn-icon">{isLiked ? '❤️' : '🤍'}</span>
            <span className="btn-label">Like</span>
          </button>

          {/* Reaction picker */}
          {showReactions && (
            <div
              className="reactions-popup"
              onMouseEnter={() => setShowReactions(true)}
              onMouseLeave={() => setShowReactions(false)}
            >
              {Object.entries(INTERACTION_TYPES || {}).map(([type, config]) => (
                <button
                  key={type}
                  className="reaction-btn scale-spring"
                  onClick={() => handleLike(type)}
                  title={config.label}
                >
                  {config.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="action-btn"
          onClick={() => onComment?.(post.id)}
        >
          <span className="btn-icon">💬</span>
          <span className="btn-label">Comment</span>
        </button>

        <button
          className="action-btn"
          onClick={() => onShare?.(post.id)}
        >
          <span className="btn-icon">🔗</span>
          <span className="btn-label">Share</span>
        </button>
      </footer>

      <style>{`
        .social-card {
          padding: 0;
          overflow: hidden;
          animation: card-float-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                      box-shadow 0.3s ease;
        }
        
        @keyframes card-float-in {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95) rotateX(5deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1) rotateX(0);
          }
        }
        
        .social-card:hover {
          transform: translateY(-4px) translateZ(10px);
          box-shadow: 
            0 12px 40px rgba(0, 0, 0, 0.4),
            0 0 30px var(--tier-glow),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }
        
        /* Header */
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .author-info {
          display: flex;
          align-items: center;
          gap: 12px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }
        
        .author-avatar {
          position: relative;
          width: 44px;
          height: 44px;
        }
        
        .author-avatar img,
        .avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--tier-accent);
        }
        
        .avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--tier-accent), rgba(0,0,0,0.3));
          color: white;
          font-weight: 700;
          font-size: 1.1rem;
        }
        
        .level-badge {
          position: absolute;
          bottom: -4px;
          right: -4px;
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #00FFFF, #0088FF);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 700;
          color: white;
          border: 2px solid #0a0a1a;
        }
        
        .author-details {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        
        .author-name {
          font-weight: 600;
          color: white;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .verified-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          background: #00BFFF;
          border-radius: 50%;
          font-size: 0.7rem;
          color: white;
        }
        
        .post-time {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
        }
        
        .tier-indicator {
          font-size: 1.25rem;
          filter: drop-shadow(0 0 8px var(--tier-glow));
        }
        
        /* Content */
        .card-content {
          padding: 16px 20px;
          cursor: pointer;
        }
        
        .post-text {
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.6;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        /* Media Grid */
        .media-grid {
          display: grid;
          gap: 4px;
          margin-top: 12px;
          border-radius: 12px;
          overflow: hidden;
        }
        
        .media-count-1 { grid-template-columns: 1fr; }
        .media-count-2 { grid-template-columns: 1fr 1fr; }
        .media-count-3 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; }
        .media-count-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        
        .media-count-3 .media-item:first-child { grid-row: span 2; }
        
        .media-item {
          position: relative;
          aspect-ratio: 16/9;
          overflow: hidden;
        }
        
        .media-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        
        .media-item:hover img {
          transform: scale(1.05);
        }
        
        .media-overflow {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
        }
        
        /* Achievement Card */
        .achievement-card {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 12px;
          padding: 16px;
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.05));
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 12px;
        }
        
        .achievement-icon {
          font-size: 2.5rem;
        }
        
        .achievement-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .achievement-title {
          font-weight: 700;
          color: #FFD700;
        }
        
        .achievement-desc {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.6);
        }
        
        /* Engagement Stats */
        .engagement-stats {
          display: flex;
          gap: 16px;
          padding: 8px 20px;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.5);
        }
        
        .stat-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        /* Actions */
        .card-actions {
          display: flex;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding: 8px 12px;
        }
        
        .reaction-container {
          position: relative;
          flex: 1;
        }
        
        .action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .action-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
        }
        
        .action-btn.liked {
          color: #FF1493;
        }
        
        .action-btn.animating .btn-icon {
          animation: like-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes like-bounce {
          0% { transform: scale(1); }
          30% { transform: scale(1.4); }
          50% { transform: scale(0.9); }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        
        .btn-icon {
          font-size: 1.1rem;
        }
        
        .btn-label {
          font-size: 0.85rem;
          font-weight: 500;
        }
        
        /* Reactions Popup */
        .reactions-popup {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 4px;
          padding: 8px 12px;
          background: rgba(20, 20, 40, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 30px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          animation: popup-appear 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 10;
        }
        
        @keyframes popup-appear {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        
        .reaction-btn {
          font-size: 1.5rem;
          padding: 6px;
          background: none;
          border: none;
          cursor: pointer;
          border-radius: 50%;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .reaction-btn:hover {
          transform: scale(1.3);
        }
        
        /* Particle burst effect */
        :global(.like-particle) {
          position: fixed;
          width: 8px;
          height: 8px;
          background: #FF1493;
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          animation: particle-burst 0.8s ease-out forwards;
        }
        
        @keyframes particle-burst {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(cos(var(--angle)) * 50px),
              calc(sin(var(--angle)) * 50px)
            ) scale(0);
            opacity: 0;
          }
        }
        
        @media (max-width: 600px) {
          .btn-label {
            display: none;
          }
          
          .action-btn {
            padding: 12px 8px;
          }
        }
      `}</style>
    </article>
  );
};

export default SocialCard;
