/**
 * LobbyCanvas.jsx — Pure cinematic background layer
 *
 * Renders ONLY the background visuals:
 *   - Grok AI-generated galaxy/cinematic background image
 *   - Animated radar sweep + sonar pulse rings
 *   - Dark vignette overlay for text readability
 *   - Metallic border accents
 *
 * Pod icons are rendered by LobbyOverlay in a grid layout below the search bar.
 */

import React, { useState, useEffect } from 'react';

// ─── Animated overlay for subtle motion ───
function AnimatedOverlay() {
  return (
    <>
      {/* Large rotating radar sweep — cinematic scale */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '60vmin',
        height: '60vmin',
        maxWidth: 550,
        maxHeight: 550,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 2,
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(110,231,239,0.10) 20deg, rgba(110,231,239,0.03) 40deg, transparent 60deg)',
          animation: 'lobbySweep 7s linear infinite',
        }} />
      </div>

      {/* Sonar pulse ring 1 */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 200,
        height: 200,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '1px solid rgba(110,231,239,0.14)',
        animation: 'lobbyPulse 5s ease-out infinite',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* Sonar pulse ring 2 (offset) */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 200,
        height: 200,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '1px solid rgba(110,231,239,0.08)',
        animation: 'lobbyPulse 5s ease-out 2.5s infinite',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* CSS keyframes */}
      <style jsx global>{`
        @keyframes lobbySweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes lobbyPulse {
          0% { width: 80px; height: 80px; opacity: 0.45; }
          100% { width: 550px; height: 550px; opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ─── Main LobbyCanvas Component (background only) ───
export default function LobbyCanvas() {
  const [bgLoaded, setBgLoaded] = useState(false);

  // Preload background image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.onerror = () => console.warn('[LobbyCanvas] Background image failed to load, using fallback gradient');
    img.src = '/images/lobby-bg/default.png';
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
            background: 'radial-gradient(ellipse at 50% 50%, #0a1628 0%, #060e1c 40%, #030818 70%, #010408 100%)',
          }}
        />
      )}

      {/* Dark overlay for readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.7) 100%)',
          zIndex: 1,
        }}
      />

      {/* Animated radar + pulse */}
      <AnimatedOverlay />

      {/* Metallic top border accent */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(110,231,239,0.4), rgba(255,215,0,0.2), rgba(110,231,239,0.4), transparent)',
        zIndex: 20,
      }} />

      {/* Metallic bottom border accent */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(110,231,239,0.25), transparent)',
        zIndex: 20,
      }} />
    </div>
  );
}
