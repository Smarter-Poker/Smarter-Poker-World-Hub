/**
 * 🔥 HEAT MAP GLOW BORDER
 * src/app/social/components/HeatMapBorder.jsx
 * 
 * Dynamic border glow that intensifies as posts trend in real-time.
 * Visual feedback for engagement momentum.
 */

import React, { useEffect, useState, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 HEAT LEVELS
// ═══════════════════════════════════════════════════════════════════════════

const HEAT_LEVELS = {
    cold: {
        threshold: 0,
        color: 'rgba(100, 100, 120, 0.3)',
        intensity: 0,
        pulse: false
    },
    warm: {
        threshold: 5,
        color: 'rgba(255, 165, 0, 0.4)',
        intensity: 1,
        pulse: false
    },
    hot: {
        threshold: 15,
        color: 'rgba(255, 107, 53, 0.5)',
        intensity: 2,
        pulse: true
    },
    fire: {
        threshold: 30,
        color: 'rgba(255, 68, 68, 0.6)',
        intensity: 3,
        pulse: true
    },
    viral: {
        threshold: 100,
        color: 'rgba(148, 0, 211, 0.7)',
        intensity: 4,
        pulse: true
    }
};

const getHeatLevel = (recentEngagement) => {
    if (recentEngagement >= 100) return HEAT_LEVELS.viral;
    if (recentEngagement >= 30) return HEAT_LEVELS.fire;
    if (recentEngagement >= 15) return HEAT_LEVELS.hot;
    if (recentEngagement >= 5) return HEAT_LEVELS.warm;
    return HEAT_LEVELS.cold;
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 HEAT MAP BORDER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const HeatMapBorder = ({
    children,
    engagement = 0,
    recentEngagement = 0, // Engagement in last hour
    className = ''
}) => {
    const [currentHeat, setCurrentHeat] = useState(HEAT_LEVELS.cold);
    const [isGlowing, setIsGlowing] = useState(false);

    // Calculate heat level
    useEffect(() => {
        const heat = getHeatLevel(recentEngagement);
        setCurrentHeat(heat);

        if (heat.intensity > 0) {
            setIsGlowing(true);
        }
    }, [recentEngagement]);

    // Generate animated gradient
    const borderStyle = useMemo(() => {
        if (currentHeat.intensity === 0) {
            return {};
        }

        const glowSize = 5 + (currentHeat.intensity * 5);

        return {
            '--heat-color': currentHeat.color,
            '--heat-glow-size': `${glowSize}px`,
            '--heat-intensity': currentHeat.intensity
        };
    }, [currentHeat]);

    return (
        <div
            className={`heat-map-container ${className} ${isGlowing ? 'glowing' : ''} ${currentHeat.pulse ? 'pulsing' : ''}`}
            style={borderStyle}
            data-heat-level={currentHeat.intensity}
        >
            {children}

            {/* Heat Indicator Badge */}
            {currentHeat.intensity >= 2 && (
                <div className="heat-indicator">
                    <span className="heat-icon">🔥</span>
                    <span className="heat-label">
                        {currentHeat.intensity >= 4 ? 'VIRAL' :
                            currentHeat.intensity >= 3 ? 'ON FIRE' : 'TRENDING'}
                    </span>
                </div>
            )}

            <style>{`
        .heat-map-container {
          position: relative;
          transition: all 0.3s ease;
        }

        .heat-map-container.glowing {
          box-shadow: 
            0 0 var(--heat-glow-size) var(--heat-color),
            inset 0 0 calc(var(--heat-glow-size) / 2) transparent;
        }

        .heat-map-container.pulsing {
          animation: heat-pulse 2s ease-in-out infinite;
        }

        @keyframes heat-pulse {
          0%, 100% {
            box-shadow: 
              0 0 var(--heat-glow-size) var(--heat-color),
              inset 0 0 0 transparent;
          }
          50% {
            box-shadow: 
              0 0 calc(var(--heat-glow-size) * 1.5) var(--heat-color),
              inset 0 0 5px var(--heat-color);
          }
        }

        /* Heat level-specific animations */
        .heat-map-container[data-heat-level="3"] {
          animation: heat-pulse 1.5s ease-in-out infinite;
        }

        .heat-map-container[data-heat-level="4"] {
          animation: heat-pulse 1s ease-in-out infinite, viral-shimmer 3s linear infinite;
        }

        @keyframes viral-shimmer {
          0% {
            filter: hue-rotate(0deg);
          }
          100% {
            filter: hue-rotate(30deg);
          }
        }

        /* Heat Indicator Badge */
        .heat-indicator {
          position: absolute;
          top: -10px;
          right: 16px;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          background: linear-gradient(135deg, #FF4444, #FF6B35);
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 700;
          color: white;
          text-transform: uppercase;
          letter-spacing: 1px;
          box-shadow: 0 4px 15px rgba(255, 68, 68, 0.4);
          animation: badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 10;
        }

        .heat-map-container[data-heat-level="4"] .heat-indicator {
          background: linear-gradient(135deg, #9400D3, #FF00FF);
          box-shadow: 0 4px 15px rgba(148, 0, 211, 0.4);
          animation: badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), viral-badge 2s ease-in-out infinite;
        }

        @keyframes badge-pop {
          from {
            opacity: 0;
            transform: scale(0.5) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes viral-badge {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .heat-icon {
          font-size: 0.9rem;
        }
      `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 GTO MASTER GLOW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const GTOMasterGlow = ({
    children,
    isGTOMaster = false,
    className = ''
}) => {
    if (!isGTOMaster) {
        return <div className={className}>{children}</div>;
    }

    return (
        <div className={`gto-master-container ${className}`}>
            {children}

            {/* Crown Badge */}
            <div className="gto-crown">👑</div>

            <style>{`
        .gto-master-container {
          position: relative;
          animation: gto-master-pulse 3s ease-in-out infinite;
          box-shadow: 
            0 0 20px rgba(255, 215, 0, 0.3),
            0 0 40px rgba(0, 255, 255, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        @keyframes gto-master-pulse {
          0%, 100% {
            box-shadow: 
              0 0 20px rgba(255, 215, 0, 0.3),
              0 0 40px rgba(0, 255, 255, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }
          50% {
            box-shadow: 
              0 0 30px rgba(255, 215, 0, 0.5),
              0 0 60px rgba(0, 255, 255, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.3);
          }
        }

        .gto-master-container::before {
          content: '';
          position: absolute;
          inset: -2px;
          background: linear-gradient(
            45deg,
            #FFD700,
            #00FFFF,
            #FFD700,
            #00FFFF
          );
          background-size: 300% 300%;
          border-radius: inherit;
          z-index: -1;
          animation: gto-gradient 4s linear infinite;
          opacity: 0.6;
        }

        @keyframes gto-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .gto-crown {
          position: absolute;
          top: -15px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 1.5rem;
          filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));
          animation: crown-float 2s ease-in-out infinite;
          z-index: 10;
        }

        @keyframes crown-float {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-3px); }
        }
      `}</style>
        </div>
    );
};

export default HeatMapBorder;
