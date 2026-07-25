/**
 * PERSONAL ASSISTANT — Strategy Hub
 * /hub/personal-assistant
 *
 * Image-based Futuristic Metal Frame with dynamic overlay buttons
 * Uses the provided metal frame image as the visual skin
 * Jarvis AI avatar in the circular frame (bottom-right)
 */

import { useRouter } from 'next/router';
import Image from 'next/image';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useRecentSessions } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

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

  // ═══ ACTION GATE: Users can view the hub, but navigating to tools is gated ═══
  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const menuConfig = getMenuConfig('hub-home', user, {}, {});



  // Real data hooks
  const { sessions: recentSessions, isLoading: sessionsLoading, refetch: refetchSessions } = useRecentSessions(5);
  const isLoading = sessionsLoading;

  useEffect(() => { setMounted(true); }, []);

  // 📢 Bus listener — refresh sessions when sandbox analyzes a hand or saves a bookmark
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSandboxUpdate = () => {
      try { refetchSessions?.(); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    };
    window.addEventListener('pa-sandbox-updated', handleSandboxUpdate);
    window.addEventListener('pa-data-updated', handleSandboxUpdate);
    return () => {
      window.removeEventListener('pa-sandbox-updated', handleSandboxUpdate);
      window.removeEventListener('pa-data-updated', handleSandboxUpdate);
    };
  }, [refetchSessions]);

  // ─── Wave 3: Hand of the Day (W3-4) ─────────────────────────────────────
  const [dailyHand, setDailyHand] = useState(null);
  useEffect(() => {
    fetch('/api/training/hand-of-the-day')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.hand) setDailyHand(json.hand);
      })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, []);

  const loadHandInSandbox = (hand) => {
    if (!guardAction()) return;
    const params = new URLSearchParams();
    if (hand.heroHand) params.set('h', hand.heroHand);
    if (hand.position) params.set('p', hand.position);
    if (hand.board) params.set('b', hand.board);
    if (hand.pot) params.set('pot', hand.pot);
    router.push(`/hub/personal-assistant/sandbox?${params.toString()}`);
  };

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


      <SEOHead
        title="Personal Poker Assistant - Jarvis AI"
        description="Get Personalized Poker Coaching, Hand Analysis, And Strategy Advice From Jarvis, Your AI Poker Assistant."
        canonical="/hub/personal-assistant"
      >

      </SEOHead>

      <div style={S.page}>
        <UniversalHeader pageDepth={1} onMenuClick={() => setShowMenu(!showMenu)} />
        <HamburgerMenu
          isOpen={showMenu}
          onClose={() => setShowMenu(false)}
          direction="left"
          theme="dark"
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        {/* Page Title Header */}
        <div style={{ textAlign: 'center', margin: '16px auto 0' }}>
          <h1 style={{ color: '#fff', fontSize: 'clamp(20px, 3.5vw, 32px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', textShadow: '0 2px 10px rgba(0,0,0,0.5)', margin: 0 }}>
            MEET JARVIS YOUR PERSONAL ASSISTANT
          </h1>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            FULL-PAGE METAL FRAME — Image fills entire viewport
           ═══════════════════════════════════════════════════════════ */}
        <div style={S.frameContainer}>
          {/* The metal frame image — strictly controls container height/width */}
          <Image src="/images/personal-assistant-frame.png" alt="Strategy Hub" width={961} height={1024} />

          {/* ── HOTSPOT: Virtual Sandbox Card (entire left panel) ──── */}
          <div
            id="hotspot-sandbox"
            style={{
              ...S.hotspot,
              top: '13.7%', left: '14.0%', width: '35.4%', height: '33.7%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/sandbox'); }}
            title="Virtual Sandbox — Explore Theoretical Hands"
          />

          {/* ── HOTSPOT: Enter Sandbox Button ──────────────────────── */}
          <div
            id="hotspot-enter-sandbox"
            style={{
              ...S.hotspot,
              top: '40.0%', left: '17.5%', width: '28.5%', height: '4.9%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/sandbox'); }}
            title="Enter Sandbox"
          />

          {/* ── HOTSPOT: Leak Finder Card (entire right panel) ────── */}
          <div
            id="hotspot-leaks"
            style={{
              ...S.hotspot,
              top: '13.7%', left: '50.5%', width: '35.4%', height: '33.7%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/leaks'); }}
            title="Leak Finder — Track and Improve Your Game"
          />

          {/* ── HOTSPOT: View Leaks Button ─────────────────────────── */}
          <div
            id="hotspot-view-leaks"
            style={{
              ...S.hotspot,
              top: '40.0%', left: '53.9%', width: '28.5%', height: '4.9%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/leaks'); }}
            title="View Leaks"
          />

          {/* ── HOTSPOT: GTO Anchored Pillar ───────────────────────── */}
          <div
            id="hotspot-gto"
            style={{
              ...S.hotspot,
              top: '55.7%', left: '15.1%', width: '22.9%', height: '11.7%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/sandbox'); }}
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
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/leaks'); }}
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
              top: '82.0%', left: '81.5%', width: '7.5%', height: '7.5%',
            }}
          >
            <Image src="/images/jarvis-avatar-circle.png" alt="Jarvis AI" width={200} height={200} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          </div>
        </div>

        {/* Global Jarvis widget is removed to avoid duplicate avatars; functionality is inside the frame */}

        {/* Wave 3: Hand of the Day widget (W3-4) */}
        {dailyHand && (
          <div style={{
            maxWidth: 'min(961px, calc((100vh - 100px) * (961 / 1024)))',
            margin: '12px auto 0',
            padding: '14px 18px',
            background: 'linear-gradient(135deg, rgba(35,116,225,0.12), rgba(139,92,246,0.08))',
            border: '1px solid rgba(35,116,225,0.25)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4599FF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                🃏 Hand of the Day
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>
                {dailyHand.heroHand || '??'} — {dailyHand.position || 'BTN'}
                {dailyHand.board ? <span style={{ color: '#65676B', fontWeight: 400, marginLeft: 6 }}>| Board: {dailyHand.board}</span> : null}
              </div>
              {dailyHand.title && (
                <div style={{ fontSize: 11, color: '#B0B3B8', marginTop: 2 }}>{dailyHand.title}</div>
              )}
            </div>
            <button
              onClick={() => loadHandInSandbox(dailyHand)}
              style={{
                padding: '10px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'linear-gradient(135deg, #2374E1, #1565c0)',
                border: 'none', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
                minHeight: 44, touchAction: 'manipulation',
              }}
            >
              Load in Sandbox ▸
            </button>
          </div>
        )}
      </div>
      {UpgradePopup}
          <BottomNavBar />
    </PageTransition>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  // Page base
  page: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
  introVideo: { width: '100%', height: '100%', objectFit: 'contain' },
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
    margin: '0 auto',
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
