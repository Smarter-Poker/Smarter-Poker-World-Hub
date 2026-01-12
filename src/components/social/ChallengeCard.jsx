/**
 * 🎮 CHALLENGE CARD COMPONENT
 * src/app/social/components/ChallengeCard.jsx
 * 
 * Inline training challenge that appears every N posts in the feed.
 * Anti-Gravity flip animation to training game.
 */

import React, { useState, useCallback, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 CHALLENGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

const CHALLENGE_TYPES = {
    preflop: {
        icon: '🃏',
        title: 'Preflop Precision',
        description: 'Test your preflop decision making',
        difficulty: 'Easy',
        xpReward: 50,
        color: '#00FFFF'
    },
    range: {
        icon: '📊',
        title: 'Range Builder',
        description: 'Construct the optimal range',
        difficulty: 'Medium',
        xpReward: 100,
        color: '#FFD700'
    },
    gto: {
        icon: '🧠',
        title: 'GTO Showdown',
        description: 'Find the game-theory optimal play',
        difficulty: 'Hard',
        xpReward: 200,
        color: '#FF00FF'
    },
    blitz: {
        icon: '⚡',
        title: 'Speed Blitz',
        description: '30 seconds to make 5 decisions',
        difficulty: 'Expert',
        xpReward: 300,
        color: '#FF6B35'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎮 CHALLENGE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const ChallengeCard = ({
    challengeType = 'preflop',
    onAccept,
    onDismiss,
    animationDelay = 0
}) => {
    const [isFlipping, setIsFlipping] = useState(false);
    const [isAccepted, setIsAccepted] = useState(false);

    const challenge = useMemo(() =>
        CHALLENGE_TYPES[challengeType] || CHALLENGE_TYPES.preflop
        , [challengeType]);

    // Handle accept with flip animation
    const handleAccept = useCallback(() => {
        setIsFlipping(true);
        setIsAccepted(true);

        // Trigger callback after flip animation
        setTimeout(() => {
            onAccept?.(challengeType);
        }, 600);
    }, [challengeType, onAccept]);

    // Handle dismiss
    const handleDismiss = useCallback(() => {
        onDismiss?.(challengeType);
    }, [challengeType, onDismiss]);

    return (
        <div
            className={`challenge-card ${isFlipping ? 'flipping' : ''}`}
            style={{
                '--challenge-color': challenge.color,
                animationDelay: `${animationDelay}ms`
            }}
        >
            {/* Front Face */}
            <div className="card-face front">
                {/* Animated Background */}
                <div className="challenge-bg">
                    <div className="bg-orb orb-1" />
                    <div className="bg-orb orb-2" />
                    <div className="bg-orb orb-3" />
                </div>

                {/* Content */}
                <div className="challenge-content">
                    <div className="challenge-badge">
                        <span className="badge-icon">{challenge.icon}</span>
                        <span className="badge-text">CHALLENGE</span>
                    </div>

                    <h3 className="challenge-title">{challenge.title}</h3>
                    <p className="challenge-desc">{challenge.description}</p>

                    <div className="challenge-meta">
                        <span className="meta-difficulty" data-difficulty={challenge.difficulty.toLowerCase()}>
                            {challenge.difficulty}
                        </span>
                        <span className="meta-reward">
                            <span className="reward-icon">⚡</span>
                            <span className="reward-value">+{challenge.xpReward} XP</span>
                        </span>
                    </div>

                    <div className="challenge-actions">
                        <button
                            className="action-btn primary interactive glow-shift"
                            onClick={handleAccept}
                        >
                            <span>Accept Challenge</span>
                            <span className="btn-arrow">→</span>
                        </button>
                        <button
                            className="action-btn secondary"
                            onClick={handleDismiss}
                        >
                            Skip
                        </button>
                    </div>
                </div>
            </div>

            {/* Back Face (Loading/Transition) */}
            <div className="card-face back">
                <div className="loading-content">
                    <div className="loading-icon">{challenge.icon}</div>
                    <div className="loading-text">Loading Challenge...</div>
                    <div className="loading-dots">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                    </div>
                </div>
            </div>

            <style>{`
        .challenge-card {
          position: relative;
          perspective: 1200px;
          animation: challenge-float-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
        }

        @keyframes challenge-float-in {
          from {
            opacity: 0;
            transform: translateY(40px) rotateX(10deg) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotateX(0) scale(1);
          }
        }

        .card-face {
          border-radius: 16px;
          overflow: hidden;
          backface-visibility: hidden;
          transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .card-face.front {
          position: relative;
          background: linear-gradient(
            135deg,
            rgba(20, 20, 40, 0.95),
            rgba(10, 10, 30, 0.98)
          );
          border: 2px solid var(--challenge-color);
          box-shadow: 
            0 0 30px color-mix(in srgb, var(--challenge-color) 30%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .card-face.back {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #0a0a1a, #1a1a3e);
          border: 2px solid var(--challenge-color);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotateX(180deg);
        }

        .challenge-card.flipping .card-face.front {
          transform: rotateX(180deg);
        }

        .challenge-card.flipping .card-face.back {
          transform: rotateX(0);
        }

        /* Background Orbs */
        .challenge-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(40px);
          opacity: 0.3;
          animation: orb-drift 8s ease-in-out infinite;
        }

        .orb-1 {
          width: 120px;
          height: 120px;
          background: var(--challenge-color);
          top: -40px;
          right: -40px;
        }

        .orb-2 {
          width: 80px;
          height: 80px;
          background: #FF00FF;
          bottom: -20px;
          left: 20%;
          animation-delay: -3s;
        }

        .orb-3 {
          width: 60px;
          height: 60px;
          background: #00FFFF;
          top: 50%;
          left: -20px;
          animation-delay: -5s;
        }

        @keyframes orb-drift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(10px, -10px); }
        }

        /* Content */
        .challenge-content {
          position: relative;
          padding: 24px;
          text-align: center;
        }

        .challenge-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          margin-bottom: 16px;
        }

        .badge-icon {
          font-size: 1.2rem;
        }

        .badge-text {
          font-family: 'Exo 2', sans-serif;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 2px;
          color: var(--challenge-color);
        }

        .challenge-title {
          font-family: 'Exo 2', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          margin: 0 0 8px 0;
          text-shadow: 0 0 20px var(--challenge-color);
        }

        .challenge-desc {
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 20px 0;
          font-size: 0.95rem;
        }

        .challenge-meta {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .meta-difficulty {
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .meta-difficulty[data-difficulty="easy"] {
          background: rgba(50, 205, 50, 0.2);
          color: #32CD32;
        }

        .meta-difficulty[data-difficulty="medium"] {
          background: rgba(255, 215, 0, 0.2);
          color: #FFD700;
        }

        .meta-difficulty[data-difficulty="hard"] {
          background: rgba(255, 107, 53, 0.2);
          color: #FF6B35;
        }

        .meta-difficulty[data-difficulty="expert"] {
          background: rgba(148, 0, 211, 0.2);
          color: #9400D3;
        }

        .meta-reward {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #00FFFF;
          font-weight: 600;
        }

        .reward-icon {
          font-size: 1rem;
        }

        /* Actions */
        .challenge-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .action-btn.primary {
          background: linear-gradient(135deg, var(--challenge-color), color-mix(in srgb, var(--challenge-color) 70%, #000));
          border: none;
          color: white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }

        .action-btn.primary:hover {
          transform: scale(1.02);
          box-shadow: 0 8px 25px color-mix(in srgb, var(--challenge-color) 40%, transparent);
        }

        .action-btn.primary .btn-arrow {
          transition: transform 0.2s ease;
        }

        .action-btn.primary:hover .btn-arrow {
          transform: translateX(4px);
        }

        .action-btn.secondary {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.6);
        }

        .action-btn.secondary:hover {
          border-color: rgba(255, 255, 255, 0.4);
          color: white;
        }

        /* Loading State */
        .loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .loading-icon {
          font-size: 3rem;
          animation: loading-pulse 1s ease-in-out infinite;
        }

        @keyframes loading-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .loading-text {
          font-family: 'Exo 2', sans-serif;
          color: var(--challenge-color);
          font-weight: 600;
        }

        .loading-dots {
          display: flex;
          gap: 8px;
        }

        .loading-dots .dot {
          width: 8px;
          height: 8px;
          background: var(--challenge-color);
          border-radius: 50%;
          animation: dot-bounce 1s ease-in-out infinite;
        }

        .loading-dots .dot:nth-child(1) { animation-delay: 0s; }
        .loading-dots .dot:nth-child(2) { animation-delay: 0.15s; }
        .loading-dots .dot:nth-child(3) { animation-delay: 0.3s; }

        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default ChallengeCard;
