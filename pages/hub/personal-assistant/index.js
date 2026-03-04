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
import { useAssistantStats, useRecentSessions } from '../../../src/hooks/useAssistant';
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
  const { stats, isLoading: statsLoading } = useAssistantStats();
  const { sessions: recentSessions, isLoading: sessionsLoading } = useRecentSessions(5);
  const isLoading = statsLoading || sessionsLoading;

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
        {/* Background */}
        <div style={S.bgGrid} />
        <div style={S.bgGlow} />

        <UniversalHeader pageDepth={1} onMenuClick={() => setShowMenu(!showMenu)} />

        {/* Gated Content */}
        <FeatureGate featureKey="personal_assistant" userId={user?.id} cost={100} duration={24} featureName="Strategy Hub" description="Access Virtual Sandbox, Leak Finder, And Jarvis Coaching Tools For 24 Hours.">
          <main style={S.main}>

            {/* ═══════════════════════════════════════════════════════════
                IMAGE-BASED METAL FRAME with Dynamic Overlay Hotspots
               ═══════════════════════════════════════════════════════════ */}
            <div style={S.frameContainer}>
              {/* The metal frame image */}
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
                  top: '5%', left: '5%', width: '45%', height: '45%',
                  ...(hoveredZone === 'sandbox' ? S.hotspotHover : {}),
                }}
                onClick={() => router.push('/hub/personal-assistant/sandbox')}
                onMouseEnter={() => setHoveredZone('sandbox')}
                onMouseLeave={() => setHoveredZone(null)}
                title="Virtual Sandbox — Explore Theoretical Hands"
              />

              {/* ── HOTSPOT: Enter Sandbox Button ──────────────────────── */}
              <div
                id="hotspot-enter-sandbox"
                style={{
                  ...S.hotspot,
                  top: '39%', left: '7%', width: '38%', height: '6.5%',
                  ...(hoveredZone === 'enterSandbox' ? S.hotspotBtnHover : {}),
                }}
                onClick={() => router.push('/hub/personal-assistant/sandbox')}
                onMouseEnter={() => setHoveredZone('enterSandbox')}
                onMouseLeave={() => setHoveredZone(null)}
                title="Enter Sandbox"
              />

              {/* ── HOTSPOT: Leak Finder Card (entire right panel) ────── */}
              <div
                id="hotspot-leaks"
                style={{
                  ...S.hotspot,
                  top: '5%', left: '52%', width: '44%', height: '45%',
                  ...(hoveredZone === 'leaks' ? S.hotspotHover : {}),
                }}
                onClick={() => router.push('/hub/personal-assistant/leaks')}
                onMouseEnter={() => setHoveredZone('leaks')}
                onMouseLeave={() => setHoveredZone(null)}
                title="Leak Finder — Track and Improve Your Game"
              />

              {/* ── HOTSPOT: View Leaks Button ─────────────────────────── */}
              <div
                id="hotspot-view-leaks"
                style={{
                  ...S.hotspot,
                  top: '39%', left: '55%', width: '38%', height: '6.5%',
                  ...(hoveredZone === 'viewLeaks' ? S.hotspotBtnHover : {}),
                }}
                onClick={() => router.push('/hub/personal-assistant/leaks')}
                onMouseEnter={() => setHoveredZone('viewLeaks')}
                onMouseLeave={() => setHoveredZone(null)}
                title="View Leaks"
              />

              {/* ── HOTSPOT: GTO Anchored Pillar ───────────────────────── */}
              <div
                id="hotspot-gto"
                style={{
                  ...S.hotspot,
                  top: '63%', left: '5%', width: '28%', height: '12%',
                  ...(hoveredZone === 'gto' ? S.hotspotHover : {}),
                }}
                onClick={() => router.push('/hub/personal-assistant/sandbox')}
                onMouseEnter={() => setHoveredZone('gto')}
                onMouseLeave={() => setHoveredZone(null)}
                title="GTO Anchored — Tied To Solver Analysis"
              />

              {/* ── HOTSPOT: Safe & Fair Pillar ─────────────────────────── */}
              <div
                id="hotspot-safe"
                style={{
                  ...S.hotspot,
                  top: '63%', left: '36%', width: '28%', height: '12%',
                  ...(hoveredZone === 'safe' ? S.hotspotHover : {}),
                }}
                onMouseEnter={() => setHoveredZone('safe')}
                onMouseLeave={() => setHoveredZone(null)}
                title="Safe and Fair — No Exploit Hunting"
              />

              {/* ── HOTSPOT: Results-Driven Pillar ──────────────────────── */}
              <div
                id="hotspot-results"
                style={{
                  ...S.hotspot,
                  top: '63%', left: '67%', width: '28%', height: '12%',
                  ...(hoveredZone === 'results' ? S.hotspotHover : {}),
                }}
                onClick={() => router.push('/hub/personal-assistant/leaks')}
                onMouseEnter={() => setHoveredZone('results')}
                onMouseLeave={() => setHoveredZone(null)}
                title="Results-Driven — Identify Leaks, Track Improvement"
              />

              {/* ── HOTSPOT: Recent Sessions Area ──────────────────────── */}
              <div
                id="hotspot-sessions"
                style={{
                  ...S.hotspot,
                  top: '78%', left: '5%', width: '67%', height: '14%',
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
                  top: '80%', left: '74%', width: '22%', height: '6%',
                  ...(hoveredZone === 'filterBtn' ? S.hotspotBtnHover : {}),
                }}
                onClick={() => setSessionFilter(f => f === 'mine' ? 'all' : 'mine')}
                onMouseEnter={() => setHoveredZone('filterBtn')}
                onMouseLeave={() => setHoveredZone(null)}
                title="Toggle Session Filter"
              />

              {/* ── JARVIS AVATAR in Circular Frame (bottom-right) ─────── */}
              <div
                id="hotspot-jarvis"
                style={{
                  ...S.jarvisHotspot,
                  ...(hoveredZone === 'jarvis' ? S.jarvisHover : {}),
                }}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-jarvis-chat'));
                  }
                }}
                onMouseEnter={() => setHoveredZone('jarvis')}
                onMouseLeave={() => setHoveredZone(null)}
                title="Chat with Jarvis"
              >
                <img
                  src="/images/jarvis-avatar.png"
                  alt="Jarvis AI"
                  style={S.jarvisImg}
                  draggable={false}
                />
              </div>
            </div>

          </main>
        </FeatureGate>

        {/* Jarvis Chat Widget */}
        <JarvisChatWidget user={user} />
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
    width: '100%',
    minHeight: 'calc(100vh - 60px)',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    maxHeight: 'calc(100vh - 60px)',
  },

  // ── Generic hotspot (invisible interactive zone) ────────────────────────
  hotspot: {
    position: 'absolute',
    cursor: 'pointer',
    borderRadius: 8,
    transition: 'all 0.25s ease',
    zIndex: 2,
    // Debug: uncomment to see hotspot zones
    // background: 'rgba(255,0,0,0.15)', border: '1px solid red',
  },
  hotspotHover: {
    background: 'rgba(0,180,255,0.08)',
    boxShadow: '0 0 20px rgba(0,180,255,0.15)',
  },
  hotspotBtnHover: {
    background: 'rgba(0,180,255,0.15)',
    boxShadow: '0 0 15px rgba(0,180,255,0.25)',
    transform: 'scale(1.02)',
  },

  // ── Jarvis circular frame hotspot ───────────────────────────────────────
  jarvisHotspot: {
    position: 'absolute',
    bottom: '6%',
    right: '4%',
    width: '12%',
    height: '12%',
    borderRadius: '50%',
    cursor: 'pointer',
    overflow: 'hidden',
    zIndex: 3,
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Glow ring effect
    boxShadow: '0 0 12px rgba(0,212,255,0.4), inset 0 0 8px rgba(0,0,0,0.3)',
  },
  jarvisHover: {
    boxShadow: '0 0 25px rgba(0,212,255,0.7), 0 0 50px rgba(0,212,255,0.3), inset 0 0 10px rgba(0,212,255,0.15)',
    transform: 'scale(1.08)',
  },
  jarvisImg: {
    width: '85%',
    height: '85%',
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
    padding: '4% 6%',
    overflow: 'hidden',
  },
  sessionOverlayText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Inter, sans-serif',
  },
  sessionOverlayList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflow: 'hidden',
  },
  sessionOverlayRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  sessionRowHover: {
    background: 'rgba(100,181,246,0.12)',
  },
  sessionRowName: {
    fontSize: 11,
    fontWeight: 500,
    color: '#e2e8f0',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '60%',
  },
  sessionRowEv: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'Inter, sans-serif',
  },
};
