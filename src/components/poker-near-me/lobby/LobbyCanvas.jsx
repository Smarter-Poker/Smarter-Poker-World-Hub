/**
 * LobbyCanvas.jsx — Dynamic canvas-based lobby illustration
 *
 * Replaces the R3F 3D scene with a polished 2D canvas illustration
 * featuring animated starfield, holographic radar, and positioned pod icons
 * arranged in an elliptical layout matching the AAA command center reference.
 *
 * Architecture:
 *   - Background canvas: animated stars, nebula, grid lines, radar sweep
 *   - HTML overlay: positioned pod icons with glow effects, labels
 *   - Click/hover handling: direct DOM events on pod elements
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

// ─── Pod definitions with elliptical layout positions ───
// Positions are percentages of container (x%, y%) matching reference layout
const ALL_PODS = [
  // Top arc
  { id: 'nearme',    label: 'Near Me',       x: 18, y: 16, color: '#00d2ff', icon: '/images/lobby-pods/nearme.png' },
  { id: 'search',    label: 'Search\nVenues', x: 42, y: 10, color: '#6ee7ef', icon: '/images/lobby-pods/search.png' },
  { id: 'livegames', label: 'Live Games',    x: 66, y: 16, color: '#ff4444', icon: '/images/lobby-pods/livegames.png' },
  // Mid sides
  { id: 'tours',     label: 'Tours',         x: 6,  y: 42, color: '#c9a227', icon: '/images/lobby-pods/tours.png' },
  { id: 'mapview',   label: 'Map View',      x: 88, y: 28, color: '#3b82f6', icon: '/images/lobby-pods/mapview.png' },
  { id: 'calendar',  label: 'Calendar',      x: 90, y: 50, color: '#8b5cf6', icon: '/images/lobby-pods/calendar.png' },
  // Bottom arc
  { id: 'roadtrip',  label: 'Trip\nPlanner',  x: 8,  y: 72, color: '#ff6b35', icon: '/images/lobby-dock/trip-planner.png' },
  { id: 'series',    label: 'Series',        x: 24, y: 80, color: '#f59e0b', icon: '/images/lobby-pods/series.png' },
  { id: 'daily',     label: 'Daily',         x: 40, y: 84, color: '#22c55e', icon: '/images/lobby-pods/daily.png' },
  { id: 'social',    label: 'Friends',       x: 56, y: 84, color: '#00d2ff', icon: '/images/lobby-dock/friends.png' },
  { id: 'alerts',    label: 'Alerts',        x: 72, y: 80, color: '#ef4444', icon: '/images/lobby-dock/alerts.png' },
  { id: 'wallet',    label: 'Rewards',       x: 90, y: 72, color: '#ffd700', icon: '/images/lobby-pods/wallet.png' },
];

// ─── Canvas background renderer ───
function useCanvasAnimation(canvasRef) {
  const frameRef = useRef(0);
  const starsRef = useRef([]);
  const initRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();

    // Generate stars once
    if (!initRef.current) {
      starsRef.current = Array.from({ length: 300 }, () => ({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 1.8 + 0.3,
        brightness: Math.random(),
        twinkleSpeed: Math.random() * 2 + 0.5,
        twinkleOffset: Math.random() * Math.PI * 2,
      }));
      initRef.current = true;
    }

    let running = true;

    const draw = (time) => {
      if (!running) return;
      const t = time * 0.001;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // ── Background gradient ──
      const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, w * 0.7);
      bgGrad.addColorStop(0, '#0a1628');
      bgGrad.addColorStop(0.4, '#060e1c');
      bgGrad.addColorStop(0.7, '#030818');
      bgGrad.addColorStop(1, '#010408');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // ── Nebula haze ──
      const nebGrad = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, w * 0.4);
      nebGrad.addColorStop(0, 'rgba(110, 50, 180, 0.06)');
      nebGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = nebGrad;
      ctx.fillRect(0, 0, w, h);

      const nebGrad2 = ctx.createRadialGradient(w * 0.7, h * 0.6, 0, w * 0.7, h * 0.6, w * 0.35);
      nebGrad2.addColorStop(0, 'rgba(0, 100, 180, 0.05)');
      nebGrad2.addColorStop(1, 'transparent');
      ctx.fillStyle = nebGrad2;
      ctx.fillRect(0, 0, w, h);

      // ── Stars ──
      starsRef.current.forEach(star => {
        const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(t * star.twinkleSpeed + star.twinkleOffset));
        const alpha = star.brightness * twinkle;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 220, 255, ${alpha * 0.8})`;
        ctx.fill();
      });

      // ── Central holographic platform ──
      const cx = w * 0.48;
      const cy = h * 0.52;
      const platformRx = w * 0.28;
      const platformRy = h * 0.22;

      // Platform glow
      const platGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, platformRx);
      platGlow.addColorStop(0, 'rgba(110, 231, 239, 0.08)');
      platGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.04)');
      platGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = platGlow;
      ctx.fillRect(0, 0, w, h);

      // Concentric elliptical rings
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 1; i <= 5; i++) {
        const rx = platformRx * (i / 5);
        const ry = platformRy * (i / 5);
        const ringAlpha = 0.08 + 0.04 * Math.sin(t * 0.5 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(110, 231, 239, ${ringAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Radar sweep
      const sweepAngle = t * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const sweepX = Math.cos(sweepAngle) * platformRx;
      const sweepY = Math.sin(sweepAngle) * platformRy;
      ctx.lineTo(sweepX, sweepY);
      ctx.strokeStyle = `rgba(110, 231, 239, 0.25)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Sweep trail
      for (let i = 1; i <= 8; i++) {
        const trailAngle = sweepAngle - i * 0.12;
        const trailX = Math.cos(trailAngle) * platformRx;
        const trailY = Math.sin(trailAngle) * platformRy;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(trailX, trailY);
        ctx.strokeStyle = `rgba(110, 231, 239, ${0.15 - i * 0.018})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();

      // ── Grid lines (subtle) ──
      ctx.save();
      ctx.globalAlpha = 0.03;
      ctx.strokeStyle = '#6ee7ef';
      ctx.lineWidth = 0.5;
      // Horizontal
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Vertical
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.restore();

      // ── Sonar pulse rings ──
      const pulseTime = (t * 0.5) % 3;
      const pulseRadius = pulseTime * platformRx * 1.2;
      const pulseAlpha = Math.max(0, 0.15 * (1 - pulseTime / 3));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.ellipse(0, 0, pulseRadius, pulseRadius * (platformRy / platformRx), 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(110, 231, 239, ${pulseAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // ── Edge vignette ──
      const vigGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.25, w * 0.5, h * 0.5, w * 0.7);
      vigGrad.addColorStop(0, 'transparent');
      vigGrad.addColorStop(0.7, 'transparent');
      vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      // ── Decorative corner accents ──
      const cornerSize = 30;
      ctx.strokeStyle = 'rgba(110, 231, 239, 0.15)';
      ctx.lineWidth = 1;
      // Top-left
      ctx.beginPath(); ctx.moveTo(0, cornerSize); ctx.lineTo(0, 0); ctx.lineTo(cornerSize, 0); ctx.stroke();
      // Top-right
      ctx.beginPath(); ctx.moveTo(w - cornerSize, 0); ctx.lineTo(w, 0); ctx.lineTo(w, cornerSize); ctx.stroke();
      // Bottom-left
      ctx.beginPath(); ctx.moveTo(0, h - cornerSize); ctx.lineTo(0, h); ctx.lineTo(cornerSize, h); ctx.stroke();
      // Bottom-right
      ctx.beginPath(); ctx.moveTo(w - cornerSize, h); ctx.lineTo(w, h); ctx.lineTo(w, h - cornerSize); ctx.stroke();

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    const resizeHandler = () => {
      resize();
    };
    window.addEventListener('resize', resizeHandler);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resizeHandler);
    };
  }, [canvasRef]);
}

// ─── Pod Icon Component ───
function PodIcon({ pod, isActive, isHovered, onHover, onLeave, onClick }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const glowColor = pod.color;
  const glowIntensity = isActive ? 0.5 : isHovered ? 0.35 : 0.15;
  const scale = isActive ? 1.12 : isHovered ? 1.08 : 1;
  const borderAlpha = isActive ? 0.8 : isHovered ? 0.6 : 0.3;

  return (
    <div
      onClick={() => onClick(pod.id)}
      onMouseEnter={() => onHover(pod.id)}
      onMouseLeave={onLeave}
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
      }}
    >
      {/* Icon circle */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08), rgba(0,0,0,0.3))`,
          border: `1.5px solid ${glowColor}${Math.round(borderAlpha * 255).toString(16).padStart(2, '0')}`,
          boxShadow: `
            0 0 ${isActive ? 20 : 10}px ${glowColor}${Math.round(glowIntensity * 255).toString(16).padStart(2, '0')},
            inset 0 0 12px rgba(0,0,0,0.4)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          transition: 'box-shadow 0.3s, border-color 0.3s',
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
              width: 40,
              height: 40,
              objectFit: 'cover',
              borderRadius: '50%',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.3s',
            }}
          />
        ) : (
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `radial-gradient(circle, ${glowColor}40, ${glowColor}10)`,
            border: `1px solid ${glowColor}60`,
          }} />
        )}
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
          fontSize: 9,
          fontWeight: 600,
          color: isActive ? '#ffffff' : 'rgba(200, 220, 240, 0.85)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          textAlign: 'center',
          textShadow: `0 0 8px ${glowColor}60, 0 1px 3px rgba(0,0,0,0.8)`,
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
  const canvasRef = useRef(null);
  const [hoveredPod, setHoveredPod] = useState(null);

  useCanvasAnimation(canvasRef);

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
      {/* Animated canvas background */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />

      {/* Metallic top border accent */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(110,231,239,0.3), rgba(255,215,0,0.15), rgba(110,231,239,0.3), transparent)',
      }} />

      {/* Metallic bottom border accent */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(110,231,239,0.2), transparent)',
      }} />

      {/* Pod icons positioned absolutely */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {ALL_PODS.map(pod => (
          <PodIcon
            key={pod.id}
            pod={pod}
            isActive={activePod === pod.id}
            isHovered={hoveredPod === pod.id}
            onHover={handleHover}
            onLeave={handleLeave}
            onClick={handlePodClick}
          />
        ))}
      </div>

      {/* Center title watermark — subtle */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '48%',
        transform: 'translate(-50%, -50%)',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.3em',
        color: 'rgba(110, 231, 239, 0.12)',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        COMMAND CENTER
      </div>

      {/* Connecting lines from pods to center (decorative) */}
      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {ALL_PODS.map(pod => (
          <line
            key={`line-${pod.id}`}
            x1={pod.x}
            y1={pod.y}
            x2={48}
            y2={52}
            stroke={pod.color}
            strokeOpacity={activePod === pod.id ? 0.2 : hoveredPod === pod.id ? 0.12 : 0.04}
            strokeWidth="0.15"
            strokeDasharray="1 2"
          />
        ))}
      </svg>
    </div>
  );
}
