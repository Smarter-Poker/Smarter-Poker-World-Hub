import { useRef, useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

const INITIAL_OVERLAYS = [
  {
    id: 'diamonds',
    label: '485\nDIAMONDS',
    topPct: 59,
    leftPct: 28,
    color: '#00d4ff',
    subColor: '#a0d8ff',
    fontSize: 28,
    subFontSize: 11,
  },
  {
    id: 'vip',
    label: 'EXPIRES: 30 DAYS',
    topPct: 60,
    leftPct: 72,
    color: '#e0f0ff',
    subColor: null,
    fontSize: 14,
    subFontSize: null,
  },
];

export default function WalletAlign() {
  const containerRef = useRef(null);
  const [overlays, setOverlays] = useState(INITIAL_OVERLAYS);
  const dragging = useRef(null);
  const [copied, setCopied] = useState(false);

  const onMouseDown = useCallback((e, id) => {
    e.preventDefault();
    dragging.current = { id, startX: e.clientX, startY: e.clientY };
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setOverlays(prev =>
      prev.map(o =>
        o.id === dragging.current.id
          ? { ...o, leftPct: Math.round(xPct * 10) / 10, topPct: Math.round(yPct * 10) / 10 }
          : o
      )
    );
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const diamonds = overlays.find(o => o.id === 'diamonds');
  const vip = overlays.find(o => o.id === 'vip');

  const coordsText = `Diamond Balance:  top: '${diamonds.topPct}%', left: '${diamonds.leftPct}%'
VIP Expiry:       top: '${vip.topPct}%',  left: '${vip.leftPct}%'`;

  const handleCopy = () => {
    navigator.clipboard.writeText(coordsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Head>
        <title>Wallet Overlay Position Editor</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: '100vh',
        background: '#050a15',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px',
        fontFamily: "'Inter', sans-serif",
        color: '#e2e8f0',
      }}>
        <h1 style={{ fontFamily: "'Orbitron', sans-serif", color: '#00d4ff', fontSize: 20, marginBottom: 8, letterSpacing: 2 }}>
          💎 WALLET OVERLAY POSITION EDITOR
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 20, textAlign: 'center' }}>
          Drag each label to the perfect position. Copy the coordinates when done.
        </p>

        {/* Image container with draggable overlays */}
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 480,
            userSelect: 'none',
            cursor: 'default',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          }}
        >
          <img
            src="/images/diamond-wallet-bg.jpg"
            alt="Wallet Background"
            style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
            draggable={false}
          />

          {overlays.map(o => (
            <div
              key={o.id}
              onMouseDown={e => onMouseDown(e, o.id)}
              style={{
                position: 'absolute',
                top: `${o.topPct}%`,
                left: `${o.leftPct}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'grab',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '6px 10px',
                background: 'rgba(0,0,0,0.4)',
                border: '1.5px dashed rgba(0,212,255,0.7)',
                borderRadius: 8,
                backdropFilter: 'blur(2px)',
                zIndex: 10,
                minWidth: 90,
              }}
              title={`Drag to reposition — currently top: ${o.topPct}%, left: ${o.leftPct}%`}
            >
              {o.id === 'diamonds' ? (
                <>
                  <div style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: o.fontSize,
                    fontWeight: 900,
                    color: o.color,
                    lineHeight: 1,
                    textShadow: '0 0 12px rgba(0,200,255,0.9)',
                  }}>485</div>
                  <div style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: o.subFontSize,
                    fontWeight: 700,
                    color: o.subColor,
                    letterSpacing: '1.5px',
                    marginTop: 2,
                    textTransform: 'uppercase',
                  }}>DIAMONDS</div>
                </>
              ) : (
                <div style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: o.fontSize,
                  fontWeight: 800,
                  color: o.color,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  textShadow: '0 0 10px rgba(0,180,255,0.6)',
                }}>EXPIRES: 30 DAYS</div>
              )}
              {/* Position badge */}
              <div style={{
                marginTop: 4,
                fontSize: 9,
                color: 'rgba(0,212,255,0.8)',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}>
                ↕ {o.topPct}% ↔ {o.leftPct}%
              </div>
            </div>
          ))}
        </div>

        {/* Live coordinate readout */}
        <div style={{
          marginTop: 24,
          width: '100%',
          maxWidth: 480,
          background: 'rgba(0,212,255,0.05)',
          border: '1px solid rgba(0,212,255,0.2)',
          borderRadius: 10,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(0,212,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            📋 Live Coordinates
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {overlays.map(o => (
              <div key={o.id} style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>
                  {o.id === 'diamonds' ? '💎 Diamond Balance' : '👑 VIP Expiry'}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#00d4ff', lineHeight: 1.8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>top:</span> {o.topPct}%<br />
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>left:</span> {o.leftPct}%
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleCopy}
            style={{
              marginTop: 14,
              width: '100%',
              padding: '12px 20px',
              background: copied ? 'rgba(0,200,100,0.2)' : 'rgba(0,212,255,0.12)',
              border: copied ? '1px solid rgba(0,200,100,0.5)' : '1px solid rgba(0,212,255,0.4)',
              borderRadius: 8,
              color: copied ? '#4ade80' : '#00d4ff',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {copied ? '✅ COPIED! SEND TO AGENT' : '📋 COPY COORDINATES FOR AGENT'}
          </button>
          
          <pre style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 6,
            fontSize: 11,
            color: '#a0d8ff',
            fontFamily: 'monospace',
            lineHeight: 1.7,
            border: '1px solid rgba(255,255,255,0.06)',
            whiteSpace: 'pre-wrap',
          }}>
            {coordsText}
          </pre>
        </div>

        <p style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          When happy with placement — copy coords and paste them to me. I'll lock them in immediately.
        </p>
      </div>
    </>
  );
}
