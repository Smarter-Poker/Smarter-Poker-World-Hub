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


  // Unmuting must happen inside a real user gesture — browsers block
  // programmatic unmute of an autoplaying video.

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

        {/* ═══════════════════════════════════════════════════════════
            FULL-PAGE METAL FRAME — Image fills entire viewport
           ═══════════════════════════════════════════════════════════ */}
        <div style={S.frameContainer}>
          {/* The metal frame image — strictly controls container height/width */}
          <Image 
            src="/images/jarvis-combined.png" 
            alt="Virtual Sandbox and Leak Finder" 
            width={1122} 
            height={1402} 
            quality={100}
            style={S.frameImage} 
            priority
          />

          {/* ── HOTSPOT: Virtual Sandbox Card (Left Panel) ──── */}
          <div
            id="hotspot-sandbox"
            style={{
              ...S.hotspot,
              top: '23%', left: '8%', width: '40%', height: '35%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/sandbox'); }}
            title="Virtual Sandbox — Explore Theoretical Hands"
          />

          {/* ── HOTSPOT: Leak Finder Card (Right Panel) ────── */}
          <div
            id="hotspot-leaks"
            style={{
              ...S.hotspot,
              top: '23%', left: '52%', width: '40%', height: '35%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/leaks'); }}
            title="Leak Finder — Track and Improve Your Game"
          />

          {/* ── HOTSPOT: Recent Sessions ───────────────────────── */}
          <div
            id="hotspot-recent-sessions"
            style={{
              ...S.hotspot,
              top: '60%', left: '8%', width: '40%', height: '11%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/leaks'); }}
            title="Recent Sessions"
          />

          {/* ── HOTSPOT: New Leaks ─────────────────────────────── */}
          <div
            id="hotspot-new-leaks"
            style={{
              ...S.hotspot,
              top: '60%', left: '52%', width: '40%', height: '11%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/leaks'); }}
            title="New Leaks"
          />

          {/* ── HOTSPOT: Last Session ──────────────────────────── */}
          <div
            id="hotspot-last-session"
            style={{
              ...S.hotspot,
              top: '74%', left: '8%', width: '40%', height: '11%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/personal-assistant/sandbox'); }}
            title="Last Session"
          />

          {/* ── HOTSPOT: Training Center ───────────────────────── */}
          <div
            id="hotspot-training-center"
            style={{
              ...S.hotspot,
              top: '74%', left: '52%', width: '40%', height: '11%',
            }}
            onClick={() => { if (guardAction()) router.push('/hub/training'); }}
            title="Training Center"
          />
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
    background: 'url(/images/jarvis-bg.png) center center / cover no-repeat fixed',
    backgroundColor: '#0a1628', // Fallback color
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
    maxWidth: 'min(1122px, calc((100vh - 100px) * (1122 / 1402)))',
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
