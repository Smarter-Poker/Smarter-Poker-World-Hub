/**
 * PERSONAL ASSISTANT — Strategy Hub
 * /hub/personal-assistant
 *
 * Image-based Futuristic Metal Frame with dynamic overlay buttons
 * Uses the provided metal frame image as the visual skin
 * Jarvis AI avatar in the circular frame (bottom-right)
 */

import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useRecentSessions } from '../../../src/hooks/useAssistant';
import JarvisChatWidget from '../../../src/components/jarvis/JarvisChatWidget';
import FeatureGate from '../../../src/components/gates/FeatureGate';

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY HUB — Image-Based Metal Frame Layout
// ═══════════════════════════════════════════════════════════════════════════

export default function PersonalAssistantPage() {
  const router = useRouter();
  const { user } = useAvatar();
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [sessionFilter, setSessionFilter] = useState('mine');

  // Intro video - only show once per session
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      return !sessionStorage.getItem('personal-assistant-intro-seen');
    }
    return false;
  });
  const introVideoRef = useRef(null);

  const handleIntroEnd = useCallback(() => {
    sessionStorage.setItem('personal-assistant-intro-seen', 'true');
    setShowIntro(false);
  }, []);

  const handleIntroPlay = useCallback(() => {
    if (introVideoRef.current) {
      introVideoRef.current.muted = false;
    }
  }, []);

  // Real data hooks
  const { sessions: recentSessions, isLoading: sessionsLoading } = useRecentSessions(5);
  const isLoading = sessionsLoading;

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div style={S.loadingWrap}>
        <div style={S.loadingText}>Initializing...</div>
      </div>
    );
  }

  return (
    <PageTransition>
      {/* Intro Video Overlay */}
      {showIntro && (
        <div style={S.introOverlay}>
          <video
            ref={introVideoRef}
            src="/videos/personal-assistant-intro.mp4"
            autoPlay muted playsInline
            onPlay={handleIntroPlay}
            onEnded={handleIntroEnd}
            onError={handleIntroEnd}
            style={S.introVideo}
          />
          <button onClick={handleIntroEnd} style={S.skipBtn}>Skip</button>
        </div>
      )}

      <SEOHead
        title="Personal Poker Assistant - Jarvis AI"
        description="Get Personalized Poker Coaching, Hand Analysis, And Strategy Advice From Jarvis, Your AI Poker Assistant."
        canonical="/hub/personal-assistant"
      >
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </SEOHead>

      <div style={S.page}>
        <UniversalHeader pageDepth={1} onMenuClick={() => setShowMenu(!showMenu)} />

        {/* Page Title Header */}
        <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 10 }}>
          <h1 style={{ color: '#fff', fontSize: 'clamp(20px, 3.5vw, 32px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', textShadow: '0 2px 10px rgba(0,0,0,0.5)', margin: 0 }}>
            MEET JARVIS YOUR PERSONAL ASSISTANT
          </h1>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            FULL-PAGE METAL FRAME — Image fills entire viewport
           ═══════════════════════════════════════════════════════════ */}
        <div style={S.frameContainer}>
          {/* The metal frame image — strictly controls container height/width */}
          <img
            src="/images/personal-assistant-frame.png"
            alt="Strategy Hub"
            style={S.frameImage}
            draggable={false}
          />

          {/* ── HOTSPOT: Virtual Sandbox Card (entire left panel) ──── */}
          <div
            id="hotspot-sandbox"
            style={{
              ...S.hotspot,
              top: '13.7%', left: '14.0%', width: '35.4%', height: '33.7%',
            }}
            onClick={() => router.push('/hub/personal-assistant/sandbox')}
            title="Virtual Sandbox — Explore Theoretical Hands"
          />

          {/* ── HOTSPOT: Enter Sandbox Button ──────────────────────── */}
          <div
            id="hotspot-enter-sandbox"
            style={{
              ...S.hotspot,
              top: '40.0%', left: '17.5%', width: '28.5%', height: '4.9%',
            }}
            onClick={() => router.push('/hub/personal-assistant/sandbox')}
            title="Enter Sandbox"
          />

          {/* ── HOTSPOT: Leak Finder Card (entire right panel) ────── */}
          <div
            id="hotspot-leaks"
            style={{
              ...S.hotspot,
              top: '13.7%', left: '50.5%', width: '35.4%', height: '33.7%',
            }}
            onClick={() => router.push('/hub/personal-assistant/leaks')}
            title="Leak Finder — Track and Improve Your Game"
          />

          {/* ── HOTSPOT: View Leaks Button ─────────────────────────── */}
          <div
            id="hotspot-view-leaks"
            style={{
              ...S.hotspot,
              top: '40.0%', left: '53.9%', width: '28.5%', height: '4.9%',
            }}
            onClick={() => router.push('/hub/personal-assistant/leaks')}
            title="View Leaks"
          />

          {/* ── HOTSPOT: GTO Anchored Pillar ───────────────────────── */}
          <div
            id="hotspot-gto"
            style={{
              ...S.hotspot,
              top: '55.7%', left: '15.1%', width: '22.9%', height: '11.7%',
            }}
            onClick={() => router.push('/hub/personal-assistant/sandbox')}
            title="GTO Anchored — Tied To Solver Analysis"
          />

          {/* ── HOTSPOT: Safe & Fair Pillar ─────────────────────────── */}
          <div
            id="hotspot-safe"
            style={{
              ...S.hotspot,
              top: '55.7%', left: '38.5%', width: '22.9%', height: '11.7%',
            }}
            title="Safe and Fair — No Exploit Hunting"
          />

          {/* ── HOTSPOT: Results-Driven Pillar ──────────────────────── */}
          <div
            id="hotspot-results"
            style={{
              ...S.hotspot,
              top: '55.7%', left: '61.9%', width: '22.9%', height: '11.7%',
            }}
            onClick={() => router.push('/hub/personal-assistant/leaks')}
            title="Results-Driven — Identify Leaks, Track Improvement"
          />

          {/* ── HOTSPOT: Recent Sessions Area ──────────────────────── */}
          <div
            id="hotspot-sessions"
            style={{
              ...S.hotspot,
              top: '69.8%', left: '12.0%', width: '76.0%', height: '16.6%',
            }}
            title="Recent Sessions"
          >
            {/* Dynamic session list overlay */}
            <div style={S.sessionOverlay}>
              {isLoading ? (
                <div style={S.sessionOverlayText}>Loading...</div>
              ) : recentSessions.length === 0 ? (
                <div style={S.sessionOverlayText}>No Sessions Yet</div>
              ) : (
                <div style={S.sessionOverlayList}>
                  {recentSessions.slice(0, 3).map((session) => (
                    <div
                      key={session.id}
                      style={{
                        ...S.sessionOverlayRow,
                        ...(hoveredZone === `session-${session.id}` ? S.sessionRowHover : {}),
                      }}
                      onClick={() => router.push(
                        session.type === 'sandbox'
                          ? '/hub/personal-assistant/sandbox'
                          : '/hub/personal-assistant/leaks'
                      )}
                      onMouseEnter={() => setHoveredZone(`session-${session.id}`)}
                      onMouseLeave={() => setHoveredZone(null)}
                    >
                      <span style={S.sessionRowName}>{session.title}</span>
                      <span style={{
                        ...S.sessionRowEv,
                        color: session.evLoss < 0 ? '#ef4444' : '#22c55e',
                      }}>
                        {session.evLoss < 0 ? '' : '+'}{session.evLoss?.toFixed(2) || '0.00'} BB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── HOTSPOT: My Sessions Dropdown ──────────────────────── */}
          <div
            id="hotspot-my-sessions"
            style={{
              ...S.hotspot,
              top: '70.3%', left: '72.3%', width: '14.6%', height: '4.4%',
            }}
            onClick={() => setSessionFilter(f => f === 'mine' ? 'all' : 'mine')}
            title="Toggle Session Filter"
          />

          {/* ── JARVIS AVATAR in Circular Frame (bottom-right) ─────── */}
          <div
            id="hotspot-jarvis"
            style={{
              ...S.jarvisHotspot,
              top: '79.2%', left: '79.0%', width: '8.0%', height: '8.0%',
            }}
          >
            <img
              src="/images/jarvis-avatar-circle.png"
              alt="Jarvis AI"
              style={S.jarvisImg}
              draggable={false}
            />
          </div>
        </div>

        {/* Global Jarvis widget is removed to avoid duplicate avatars; functionality is inside the frame */}
      </div>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  // Page base
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0d1929 0%, #0a1628 50%, #061018 100%)',
    fontFamily: 'Inter, -apple-system, sans-serif',
    position: 'relative',
  },
  bgGrid: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundImage: 'linear-gradient(rgba(100,181,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(100,181,246,0.03) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  bgGlow: {
    position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)',
    width: '120%', height: '60%',
    background: 'radial-gradient(ellipse at center, rgba(100,181,246,0.08) 0%, transparent 60%)',
    pointerEvents: 'none',
  },
  loadingWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a1628',
  },
  loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
  main: {
    position: 'relative', zIndex: 1,
    padding: '0',
    maxWidth: '100%',
    margin: '0 auto',
  },

  // Intro video
  introOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99999, background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  introVideo: { width: '100%', height: '100%', objectFit: 'cover' },
  skipBtn: {
    position: 'absolute', top: 20, right: 20,
    padding: '8px 20px', background: 'rgba(255,255,255,0.2)',
    backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 20, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer',
    zIndex: 100000,
  },

  // ── Image-based frame container ─────────────────────────────────────────
  frameContainer: {
    position: 'relative',
    margin: '20px auto',
    // Mathematical constraint: never exceed the structural proportion of the viewport height. 
    // This flawlessly pins the div container to the exact pixel footprint of the image.
    width: '100%',
    maxWidth: 'min(961px, calc((100vh - 100px) * (961 / 1024)))',
    userSelect: 'none',
  },
  frameImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },

  // ── Generic hotspot (invisible interactive zone) ────────────────────────
  hotspot: {
    position: 'absolute',
    cursor: 'pointer',
    borderRadius: 8,
    zIndex: 2,
  },

  // ── Jarvis circular frame hotspot ───────────────────────────────────────
  jarvisHotspot: {
    position: 'absolute',
    borderRadius: '50%',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jarvisImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '50%',
  },

  // ── Dynamic session overlay ─────────────────────────────────────────────
  sessionOverlay: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '0 4% 3% 4%',
    overflow: 'hidden',
  },
  sessionOverlayText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'Inter, sans-serif',
  },
  sessionOverlayList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    overflow: 'hidden',
  },
  sessionOverlayRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 4,
    cursor: 'pointer',
  },
  sessionRowName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#e2e8f0',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '65%',
  },
  sessionRowEv: {
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'Inter, sans-serif',
  },
};
