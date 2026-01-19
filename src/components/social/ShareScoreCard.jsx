/**
 * 🏆 SHARE SCORE CARD COMPONENT
 * src/app/social/components/ShareScoreCard.jsx
 * 
 * Training game results as playable social cards.
 * Other users can click to attempt the same challenge.
 */

import React, { useState, useCallback, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 SCORE TIER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SCORE_TIERS = {
  perfect: { threshold: 100, label: 'PERFECT', color: '#FFD700', icon: '👑', glow: 'rgba(255, 215, 0, 0.5)' },
  excellent: { threshold: 90, label: 'EXCELLENT', color: '#32CD32', icon: '🌟', glow: 'rgba(50, 205, 50, 0.5)' },
  great: { threshold: 75, label: 'GREAT', color: '#00BFFF', icon: '✨', glow: 'rgba(0, 191, 255, 0.5)' },
  good: { threshold: 50, label: 'GOOD', color: '#9400D3', icon: '👍', glow: 'rgba(148, 0, 211, 0.5)' },
  learning: { threshold: 0, label: 'LEARNING', color: '#FF6B35', icon: '📚', glow: 'rgba(255, 107, 53, 0.5)' }
};

const getScoreTier = (score) => {
  if (score >= 100) return SCORE_TIERS.perfect;
  if (score >= 90) return SCORE_TIERS.excellent;
  if (score >= 75) return SCORE_TIERS.great;
  if (score >= 50) return SCORE_TIERS.good;
  return SCORE_TIERS.learning;
};

// ═══════════════════════════════════════════════════════════════════════════
// 🏆 SHARE SCORE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const ShareScoreCard = ({
  post,
  currentUserId,
  onPlayChallenge,
  onLike,
  onAuthorClick,
  animationDelay = 0
}) => {
  const [isPlayHovered, setIsPlayHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Extract score data from post
  const scoreData = useMemo(() => {
    const data = post.achievementData || {};
    return {
      challengeType: data.challengeType || 'preflop',
      challengeId: data.challengeId,
      score: data.score || 0,
      accuracy: data.accuracy || 0,
      timeSpent: data.timeSpent || 0,
      gtoLines: data.gtoLines || [],
      xpEarned: data.xpEarned || 0
    };
  }, [post.achievementData]);

  const scoreTier = useMemo(() => getScoreTier(scoreData.score), [scoreData.score]);

  // Handle play challenge
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setTimeout(() => {
      onPlayChallenge?.(scoreData.challengeId, scoreData.challengeType);
    }, 500);
  }, [scoreData, onPlayChallenge]);

  return (
    <article
      className="share-score-card glass-card"
      style={{
        '--score-color': scoreTier.color,
        '--score-glow': scoreTier.glow,
        animationDelay: `${animationDelay}ms`
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
          </div>
          <div className="author-details">
            <span className="author-name">{getAuthorDisplayName(post.author)}</span>
            <span className="post-time">{post.relativeTime}</span>
          </div>
        </button>
        <div className="score-badge">
          <span className="badge-icon">{scoreTier.icon}</span>
          <span className="badge-label">{scoreTier.label}</span>
        </div>
      </header>

      {/* Score Display */}
      <div className="score-display">
        <div className="score-circle">
          <svg viewBox="0 0 100 100" className="score-ring">
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke={scoreTier.color}
              strokeWidth="8"
              strokeDasharray={`${scoreData.score * 2.83} 283`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className="score-progress"
            />
          </svg>
          <div className="score-value">
            <span className="score-number">{scoreData.score}</span>
            <span className="score-label">SCORE</span>
          </div>
        </div>

        <div className="score-stats">
          <div className="stat">
            <span className="stat-icon">🎯</span>
            <span className="stat-value">{scoreData.accuracy}%</span>
            <span className="stat-label">Accuracy</span>
          </div>
          <div className="stat">
            <span className="stat-icon">⏱️</span>
            <span className="stat-value">{scoreData.timeSpent}s</span>
            <span className="stat-label">Time</span>
          </div>
          <div className="stat">
            <span className="stat-icon">⚡</span>
            <span className="stat-value">+{scoreData.xpEarned}</span>
            <span className="stat-label">XP</span>
          </div>
        </div>
      </div>

      {/* GTO Lines Preview */}
      {scoreData.gtoLines.length > 0 && (
        <div className="gto-preview">
          <span className="gto-label">GTO Lines:</span>
          <div className="gto-lines">
            {scoreData.gtoLines.slice(0, 3).map((line, i) => (
              <span key={i} className="gto-line">{line}</span>
            ))}
            {scoreData.gtoLines.length > 3 && (
              <span className="gto-more">+{scoreData.gtoLines.length - 3} more</span>
            )}
          </div>
        </div>
      )}

      {/* Action Message */}
      <div className="challenge-prompt">
        <span>🎮</span>
        <span>Can you beat this score?</span>
      </div>

      {/* Play Button */}
      <button
        className={`play-button interactive glow-shift ${isPlaying ? 'playing' : ''}`}
        onClick={handlePlay}
        onMouseEnter={() => setIsPlayHovered(true)}
        onMouseLeave={() => setIsPlayHovered(false)}
        disabled={isPlaying}
      >
        {isPlaying ? (
          <span className="play-loading">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
        ) : (
          <>
            <span className="play-icon">{isPlayHovered ? '▶️' : '🎮'}</span>
            <span className="play-text">Play This Challenge</span>
          </>
        )}
      </button>

      <style>{`
        .share-score-card {
          padding: 0;
          overflow: hidden;
          animation: score-card-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
          border: 1px solid var(--score-color);
          box-shadow: 0 0 25px var(--score-glow);
        }

        @keyframes score-card-in {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
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
          width: 40px;
          height: 40px;
        }

        .author-avatar img,
        .avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--score-color);
        }

        .avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--score-color), rgba(0,0,0,0.3));
          color: white;
          font-weight: 700;
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
        }

        .post-time {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .score-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: linear-gradient(135deg, var(--score-glow), transparent);
          border: 1px solid var(--score-color);
          border-radius: 20px;
        }

        .badge-icon {
          font-size: 1rem;
        }

        .badge-label {
          font-family: 'Exo 2', sans-serif;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 1px;
          color: var(--score-color);
        }

        /* Score Display */
        .score-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 32px;
          padding: 24px;
        }

        .score-circle {
          position: relative;
          width: 120px;
          height: 120px;
        }

        .score-ring {
          width: 100%;
          height: 100%;
        }

        .score-progress {
          filter: drop-shadow(0 0 8px var(--score-color));
          animation: score-fill 1s ease-out forwards;
        }

        @keyframes score-fill {
          from { stroke-dasharray: 0 283; }
        }

        .score-value {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .score-number {
          font-family: 'Exo 2', sans-serif;
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--score-color);
          text-shadow: 0 0 20px var(--score-glow);
          line-height: 1;
        }

        .score-label {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 2px;
        }

        .score-stats {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .stat-icon {
          font-size: 1.1rem;
        }

        .stat-value {
          font-family: 'Exo 2', sans-serif;
          font-weight: 700;
          color: white;
          min-width: 50px;
        }

        .stat-label {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
        }

        /* GTO Preview */
        .gto-preview {
          padding: 12px 20px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .gto-label {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 6px;
          display: block;
        }

        .gto-lines {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .gto-line {
          padding: 4px 10px;
          background: rgba(0, 255, 255, 0.1);
          border: 1px solid rgba(0, 255, 255, 0.2);
          border-radius: 6px;
          font-size: 0.8rem;
          color: #00FFFF;
          font-family: monospace;
        }

        .gto-more {
          padding: 4px 10px;
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.8rem;
        }

        /* Challenge Prompt */
        .challenge-prompt {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: rgba(255, 215, 0, 0.05);
          color: #FFD700;
          font-size: 0.9rem;
          font-weight: 500;
        }

        /* Play Button */
        .play-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, var(--score-color), color-mix(in srgb, var(--score-color) 60%, #000));
          border: none;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .play-button:hover {
          filter: brightness(1.1);
        }

        .play-button:disabled {
          cursor: not-allowed;
        }

        .play-icon {
          font-size: 1.3rem;
          transition: transform 0.3s ease;
        }

        .play-button:hover .play-icon {
          transform: scale(1.2);
        }

        .play-loading {
          display: flex;
          gap: 6px;
        }

        .play-loading .dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: play-dot 1s ease-in-out infinite;
        }

        .play-loading .dot:nth-child(1) { animation-delay: 0s; }
        .play-loading .dot:nth-child(2) { animation-delay: 0.15s; }
        .play-loading .dot:nth-child(3) { animation-delay: 0.3s; }

        @keyframes play-dot {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1.2); opacity: 1; }
        }

        @media (max-width: 500px) {
          .score-display {
            flex-direction: column;
          }

          .score-stats {
            flex-direction: row;
            gap: 20px;
          }

          .stat {
            flex-direction: column;
            text-align: center;
          }

          .stat-value {
            min-width: auto;
          }
        }
      `}</style>
    </article>
  );
};

export default ShareScoreCard;
