/**
 * LobbyCanvas.jsx — Dynamic Grok-powered lobby illustration
 *
 * Uses a Grok AI-generated cinematic background image with positioned
 * pod icons arranged in an elliptical layout. Each pod uses a Grok-generated
 * photorealistic 3D icon.
 *
 * Architecture:
 *   - Background: Grok-generated cinematic image with CSS parallax overlay
 *   - Animated layer: lightweight CSS animations for glow and pulse
 *   - HTML overlay: positioned pod icons with glow effects, labels
 *   - Click/hover handling: direct DOM events on pod elements
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

// ─── Pod definitions with elliptical layout positions ───
// Positions are percentages of container (x%, y%)
// NOTE: roadtrip, social, alerts are NOT here — they live in the dock (LobbyOverlay)
// Keeping 9 unique pods arranged in a generous ellipse with safe margins (15-85% x, 18-68% y)
const ALL_PODS = [
  // ── Top arc (3 pods) ──
  { id: 'nearme',    label: 'Near Me',        x: 20, y: 22, color: '#00d2ff', icon: '/images/lobby-pods/nearme.png' },
  { id: 'search',    label: 'Search\nVenues',  x: 48, y: 16, color: '#6ee7ef', icon: '/images/lobby-pods/search.png' },
  { id: 'livegames', label: 'Live Games',     x: 76, y: 22, color: '#ff4444', icon: '/images/lobby-pods/livegames.png' },
  // ── Mid flanks (2 pods) ──
  { id: 'tours',     label: 'Tours',          x: 14, y: 46, color: '#c9a227', icon: '/images/lobby-pods/tours.png' },
  { id: 'mapview',   label: 'Map View',       x: 84, y: 38, color: '#3b82f6', icon: '/images/lobby-pods/mapview.png' },
  // ── Lower arc (4 pods) ──
  { id: 'calendar',  label: 'Calendar',       x: 82, y: 58, color: '#8b5cf6', icon: '/images/lobby-pods/calendar.png' },
  { id: 'series',    label: 'Series',         x: 22, y: 64, color: '#f59e0b', icon: '/images/lobby-pods/series.png' },
  { id: 'daily',     label: 'Daily',          x: 42, y: 68, color: '#22c55e', icon: '/images/lobby-pods/daily.png' },
  { id: 'wallet',    label: 'Rewards',        x: 64, y: 66, color: '#ffd700', icon: '/images/lobby-pods/wallet.png' },
];

// ─── Animated overlay for subtle motion ───
function AnimatedOverlay() {
  return (
    <>
      {/* Large rotating radar sweep — cinematic scale */}
      <div style={{
        position: 'absolute',
        left: '48%',
        top: '46%',
        width: '55vmin',
        height: '55vmin',
        maxWidth: 500,
        maxHeight: 500,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 2,
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(110,231,239,0.12) 20deg, rgba(110,231,239,0.04) 40deg, transparent 60deg)',
          animation: 'lobbySweep 6s linear infinite',
        }} />
      </div>

      {/* Outer static ring — gives structure to the radar area */}
      <div style={{
        position: 'absolute',
        left: '48%',
        top: '46%',
        width: '45vmin',
        height: '45vmin',
        maxWidth: 420,
        maxHeight: 420,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '1px solid rgba(110,231,239,0.08)',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* Sonar pulse ring 1 */}
      <div style={{
        position: 'absolute',
        left: '48%',
        top: '46%',
        width: 280,
        height: 280,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '1.5px solid rgba(110,231,239,0.18)',
        animation: 'lobbyPulse 4s ease-out infinite',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* Sonar pulse ring 2 (offset) */}
      <div style={{
        position: 'absolute',
        left: '48%',
        top: '46%',
        width: 280,
        height: 280,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '1px solid rgba(110,231,239,0.1)',
        animation: 'lobbyPulse 4s ease-out 2s infinite',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* Sonar pulse ring 3 (third wave for depth) */}
      <div style={{
        position: 'absolute',
        left: '48%',
        top: '46%',
        width: 280,
        height: 280,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '1px solid rgba(110,231,239,0.06)',
        animation: 'lobbyPulse 4s ease-out 3s infinite',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* CSS keyframes injected */}
      <style jsx global>{`
        @keyframes lobbySweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes lobbyPulse {
          0% { width: 100px; height: 100px; opacity: 0.5; }
          100% { width: 600px; height: 600px; opacity: 0; }
        }
        @keyframes podFloat {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-3px); }
        }
        @keyframes podGlow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.15); }
        }
      `}</style>
    </>
  );
}

// ─── Pod Icon Component ───
function PodIcon({ pod, isActive, isHovered, onHover, onLeave, onClick, index }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const glowColor = pod.color;
  const glowIntensity = isActive ? 0.5 : isHovered ? 0.35 : 0.15;
  const scale = isActive ? 1.15 : isHovered ? 1.1 : 1;
  const borderAlpha = isActive ? 0.8 : isHovered ? 0.6 : 0.3;

  // Staggered float animation
  const floatDelay = index * 0.4;

  return (
    <div
      onClick={() => onClick(pod.id)}
      onMouseEnter={() => onHover(pod.id)}
      onMouseLeave={onLeave}
      onTouchStart={() => onHover(pod.id)}
      style={{
        position: 'absolute',
        left: `${pod.x}%`,
        top: `${pod.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        zIndex: 10,
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        animation: `podFloat ${3 + (index % 3) * 0.5}s ease-in-out ${floatDelay}s infinite`,
      }}
    >
      {/* Icon circle with Grok-generated image */}
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.1), rgba(0,0,0,0.4))`,
          border: `2px solid ${glowColor}${Math.round(borderAlpha * 255).toString(16).padStart(2, '0')}`,
          boxShadow: `
            0 0 ${isActive ? 25 : 12}px ${glowColor}${Math.round(glowIntensity * 255).toString(16).padStart(2, '0')},
            0 0 ${isActive ? 50 : 20}px ${glowColor}${Math.round(glowIntensity * 0.5 * 255).toString(16).padStart(2, '0')},
            inset 0 0 15px rgba(0,0,0,0.5)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          transition: 'box-shadow 0.3s, border-color 0.3s',
          animation: isActive ? 'podGlow 2s ease-in-out infinite' : 'none',
        }}
      >
        {!imgError ? (
          <img
            src={pod.icon}
            alt={pod.label}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImgError(true)}
            style={{
              width: 54,
              height: 54,
              objectFit: 'cover',
              borderRadius: '50%',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.4s ease-in',
            }}
          />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: `radial-gradient(circle, ${glowColor}40, ${glowColor}10)`,
            border: `1px solid ${glowColor}60`,
          }} />
        )}
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: isActive ? '#ffffff' : isHovered ? 'rgba(220, 235, 255, 0.95)' : 'rgba(200, 220, 240, 0.8)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          textAlign: 'center',
          textShadow: `0 0 10px ${glowColor}80, 0 0 20px ${glowColor}40, 0 1px 3px rgba(0,0,0,0.9)`,
          lineHeight: 1.2,
          whiteSpace: 'pre-line',
          transition: 'color 0.3s',
        }}
      >
        {pod.label}
      </div>
    </div>
  );
}

// ─── Main LobbyCanvas Component ───
export default function LobbyCanvas({ onPodClick, activePod, liveData }) {
  const [hoveredPod, setHoveredPod] = useState(null);
  const [bgLoaded, setBgLoaded] = useState(false);

  // Preload background image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.src = '/images/lobby-bg/default.png';
  }, []);

  const handlePodClick = useCallback((podId) => {
    onPodClick?.(podId);
  }, [onPodClick]);

  const handleHover = useCallback((podId) => {
    setHoveredPod(podId);
  }, []);

  const handleLeave = useCallback(() => {
    setHoveredPod(null);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: '#010408',
      }}
    >
      {/* Grok AI-generated cinematic background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: bgLoaded ? 'url(/images/lobby-bg/default.png)' : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: bgLoaded ? 1 : 0,
          transition: 'opacity 1.2s ease-in',
        }}
      />

      {/* Fallback gradient (shown while image loads) */}
      {!bgLoaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 48% 50%, #0a1628 0%, #060e1c 40%, #030818 70%, #010408 100%)',
          }}
        />
      )}

      {/* Dark overlay to ensure text readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 48% 46%, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.7) 100%)',
          zIndex: 1,
        }}
      />

      {/* Animated CSS overlay (radar sweep, pulse rings) */}
      <AnimatedOverlay />

      {/* Metallic top border accent */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(110,231,239,0.4), rgba(255,215,0,0.2), rgba(110,231,239,0.4), transparent)',
        zIndex: 20,
      }} />

      {/* Metallic bottom border accent */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(110,231,239,0.25), transparent)',
        zIndex: 20,
      }} />

      {/* Connecting lines from pods to center (decorative) */}
      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          {ALL_PODS.map(pod => (
            <linearGradient key={`grad-${pod.id}`} id={`line-grad-${pod.id}`} x1={`${pod.x}%`} y1={`${pod.y}%`} x2="48%" y2="46%">
              <stop offset="0%" stopColor={pod.color} stopOpacity={activePod === pod.id ? 0.3 : hoveredPod === pod.id ? 0.15 : 0.06} />
              <stop offset="100%" stopColor={pod.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ALL_PODS.map(pod => (
          <line
            key={`line-${pod.id}`}
            x1={pod.x}
            y1={pod.y}
            x2={48}
            y2={46}
            stroke={`url(#line-grad-${pod.id})`}
            strokeWidth="0.15"
            strokeDasharray={activePod === pod.id ? 'none' : '1 2'}
          />
        ))}
      </svg>

      {/* Pod icons positioned absolutely */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
        {ALL_PODS.map((pod, index) => (
          <PodIcon
            key={pod.id}
            pod={pod}
            index={index}
            isActive={activePod === pod.id}
            isHovered={hoveredPod === pod.id}
            onHover={handleHover}
            onLeave={handleLeave}
            onClick={handlePodClick}
          />
        ))}
      </div>

      {/* Center title watermark */}
      <div style={{
        position: 'absolute',
        left: '48%',
        top: '46%',
        transform: 'translate(-50%, -50%)',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.4em',
        color: 'rgba(110, 231, 239, 0.15)',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 3,
        textShadow: '0 0 20px rgba(110, 231, 239, 0.08)',
      }}>
        COMMAND CENTER
      </div>
    </div>
  );
}
