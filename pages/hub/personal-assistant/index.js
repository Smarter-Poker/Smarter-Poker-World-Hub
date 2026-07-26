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
import { useRecentSessions, useAssistantStats } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import DashboardOverview from '../../../src/components/jarvis/DashboardOverview';
import JarvisChatWidget from '../../../src/components/jarvis/JarvisChatWidget';

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY HUB — Image-Based Metal Frame Layout
// ═══════════════════════════════════════════════════════════════════════════

export default function PersonalAssistantPage() {
  const router = useRouter();
  const { user } = useAvatar();
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [hoveredZone, setHoveredZone] = useState(null);

  // ═══ ACTION GATE: Users can view the hub, but navigating to tools is gated ═══
  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const menuConfig = getMenuConfig('hub-home', user, {}, {});

  // Intro video - only show once per session
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      return !sessionStorage.getItem('personal-assistant-intro-seen');
    }
    return false;
  });
  const introVideoRef = useRef(null);
  const [introSoundOn, setIntroSoundOn] = useState(false);

  const handleIntroEnd = useCallback(() => {
    sessionStorage.setItem('personal-assistant-intro-seen', 'true');
    setShowIntro(false);
  }, []);

  // Unmuting must happen inside a real user gesture — browsers block
  // programmatic unmute of an autoplaying video.
  const handleIntroUnmute = useCallback(() => {
    if (introVideoRef.current) {
      introVideoRef.current.muted = false;
      setIntroSoundOn(true);
    }
  }, []);

  // Real data hooks
  const { sessions: recentSessions, isLoading: sessionsLoading, refetch: refetchSessions } = useRecentSessions(5);
  const { stats, isLoading: statsLoading } = useAssistantStats();
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

  // ── Card-notation helpers ────────────────────────────────────────────────
  // The sandbox expects q.h as a concatenated card string ('AhKd') and q.b as
  // comma-separated cards. Normalize and validate here so bad notation (e.g.
  // 'AKs', spaced cards) is skipped instead of half-hydrating the sandbox.
  const normalizeHeroHand = (raw) => {
    const hand = String(raw || '').replace(/[\s,]/g, '');
    return /^([2-9TJQKA][shdc]){2}$/i.test(hand) ? hand : null;
  };
  const normalizeBoardCards = (raw) => {
    const cards = String(raw || '').replace(/[\s,]/g, '').match(/[2-9TJQKA][shdc]/gi) || [];
    return cards.length >= 3 ? cards.slice(0, 5) : null;
  };

  const loadHandInSandbox = (hand) => {
    if (!guardAction()) return;
    const params = new URLSearchParams();
    const hero = normalizeHeroHand(hand.heroHand);
    if (hero) params.set('h', hero);
    if (hand.position) params.set('p', hand.position);
    const board = normalizeBoardCards(hand.board);
    if (board) params.set('b', board.join(','));
    const pot = Number(hand.pot);
    if (Number.isFinite(pot) && pot > 0) params.set('pot', String(pot));
    router.push(`/hub/personal-assistant/sandbox?${params.toString()}`);
  };

  // Restore a recent session in the sandbox (or open the leak finder),
  // behind the same feature gate as every other navigation on this page.
  const openSession = (session) => {
    if (!guardAction()) return;
    if (session.type !== 'sandbox') {
      router.push('/hub/personal-assistant/leaks');
      return;
    }
    const params = new URLSearchParams();
    const hero = normalizeHeroHand(session.hero_hand);
    if (hero) params.set('h', hero);
    if (session.hero_position) params.set('p', session.hero_position);
    const board = normalizeBoardCards(
      `${session.board_flop || ''}${session.board_turn || ''}${session.board_river || ''}`
    );
    if (board) params.set('b', board.join(','));
    const pot = Number(session.pot_size_bb);
    if (Number.isFinite(pot) && pot > 0) params.set('pot', String(pot));
    const stack = Number(session.hero_stack);
    if (Number.isFinite(stack) && stack > 0) params.set('s', String(stack));
    const qs = params.toString();
    router.push(`/hub/personal-assistant/sandbox${qs ? `?${qs}` : ''}`);
  };

  const formatSessionDate = (d) => {
    if (!d) return '';
    const t = new Date(d);
    return isNaN(t.getTime()) ? String(d) : t.toLocaleDateString();
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
      {showIntro && (
        <div style={S.introOverlay}>
          <video
            ref={introVideoRef}
            src="/videos/personal-assistant-intro.mp4"
            autoPlay muted playsInline
            onEnded={handleIntroEnd}
            onError={handleIntroEnd}
            style={{ ...S.introVideo, objectFit: 'contain' }}
          />
          {!introSoundOn && (
            <button onClick={handleIntroUnmute} style={{ ...S.skipBtn, right: 110 }}>
              Tap for Sound
            </button>
          )}
          <button onClick={handleIntroEnd} style={S.skipBtn}>Skip</button>
        </div>
      )}

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
          <Image src="/images/personal-assistant-frame.png" alt="Strategy Hub" width={961} height={1024} style={S.frameImage} />

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

          {/* ── HOTSPOT: Safe & Fair Pillar (informational, not clickable) ── */}
          <div
            id="hotspot-safe"
            style={{
              ...S.hotspot,
              cursor: 'default',
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
                      onClick={() => openSession(session)}
                      onMouseEnter={() => setHoveredZone(`session-${session.id}`)}
                      onMouseLeave={() => setHoveredZone(null)}
                    >
                      <span style={S.sessionRowName}>{session.title}</span>
                      {typeof session.evLoss === 'number' && session.evLoss !== 0 ? (
                        <span style={{
                          ...S.sessionRowEv,
                          color: session.evLoss < 0 ? '#ef4444' : '#22c55e',
                        }}>
                          {session.evLoss < 0 ? '' : '+'}{session.evLoss.toFixed(2)} BB
                        </span>
                      ) : (
                        <span style={{ ...S.sessionRowEv, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                          {formatSessionDate(session.date)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── JARVIS AVATAR in Circular Frame (bottom-right) ─────── */}
          <div
            id="hotspot-jarvis"
            style={{
              ...S.jarvisHotspot,
              top: '82.0%', left: '81.5%', width: '7.5%', height: '7.5%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/messenger?chat=jarvis'); }}
            title="Chat with Jarvis"
          >
            <Image src="/images/jarvis-avatar-circle.png" alt="Jarvis AI" width={200} height={200} style={S.jarvisImg} />
          </div>
        </div>

        {/* Dashboard stat cards — fed by /api/assistant/stats */}
        <div style={{
          maxWidth: 'min(961px, calc((100vh - 100px) * (961 / 1024)))',
          margin: '20px auto 0',
          width: '100%',
          padding: '0 12px',
          boxSizing: 'border-box',
        }}>
          <DashboardOverview stats={stats} isLoading={statsLoading} />
        </div>

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
                Hand of the Day
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

      {/* Floating Jarvis chat entry point (logged-in users) */}
      <JarvisChatWidget user={user} />

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
  loadingWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a1628',
  },
  loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },

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

  // ── Jarvis circular frame hotspot (clickable — opens Jarvis chat) ───────
  jarvisHotspot: {
    position: 'absolute',
    borderRadius: '50%',
    cursor: 'pointer',
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
  sessionRowHover: {
    background: 'rgba(255,255,255,0.08)',
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
