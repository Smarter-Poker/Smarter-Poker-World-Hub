/**
 * PERSONAL ASSISTANT — Strategy Hub
 * /hub/personal-assistant
 *
 * Futuristic Metal UI — Matching the World Hub card aesthetic
 * Two primary tools: Virtual Sandbox + Leak Finder
 * Jarvis AI assistant in the circular frame
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
// STRATEGY HUB — Main Landing Page (Futuristic Metal UI)
// ═══════════════════════════════════════════════════════════════════════════

export default function PersonalAssistantPage() {
  const router = useRouter();
  const { user } = useAvatar();
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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
                OUTER METAL FRAME — Matches World Hub card aesthetic
               ═══════════════════════════════════════════════════════════ */}
            <div style={S.outerFrame}>

              {/* Corner Rivets */}
              <div style={{ ...S.rivet, top: 8, left: 8 }} />
              <div style={{ ...S.rivet, top: 8, right: 8 }} />
              <div style={{ ...S.rivet, bottom: 8, left: 8 }} />
              <div style={{ ...S.rivet, bottom: 8, right: 8 }} />

              {/* Cyan accent bars (top) */}
              <div style={S.accentBarTop} />

              {/* Inner content area */}
              <div style={S.innerFrame}>

                {/* ── Two Tool Cards ──────────────────────────────────── */}
                <div style={S.toolRow}>

                  {/* Virtual Sandbox Card */}
                  <div
                    style={S.toolCard}
                    onClick={() => router.push('/hub/personal-assistant/sandbox')}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,180,255,0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(100,181,246,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    {/* Card inner rivets */}
                    <div style={{ ...S.cardRivet, top: 6, left: 6 }} />
                    <div style={{ ...S.cardRivet, top: 6, right: 6 }} />
                    <div style={{ ...S.cardRivet, bottom: 6, left: 6 }} />
                    <div style={{ ...S.cardRivet, bottom: 6, right: 6 }} />

                    <div style={S.toolIconWrap}>
                      <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
                        <path d="M24 4L8 14v20l16 10 16-10V14L24 4z" stroke="#64b5f6" strokeWidth="2" fill="none" />
                        <path d="M24 24V44M8 14l16 10 16-10" stroke="#64b5f6" strokeWidth="2" />
                        <circle cx="24" cy="24" r="4" fill="#64b5f6" />
                      </svg>
                    </div>
                    <h2 style={S.toolTitle}>Virtual Sandbox</h2>
                    <p style={S.toolSub}>Explore Theoretical Hands</p>
                    <ul style={S.bulletList}>
                      <li style={S.bulletItem}><span style={S.bullet} /> Run Any Poker Scenario</li>
                      <li style={S.bulletItem}><span style={S.bullet} /> Test Complex Hands Vs Villain Types</li>
                      <li style={S.bulletItem}><span style={S.bullet} /> See Solver-Verified GTO Results</li>
                    </ul>
                    <button style={S.toolBtn} onClick={(e) => { e.stopPropagation(); router.push('/hub/personal-assistant/sandbox'); }}>
                      Enter Sandbox
                    </button>
                  </div>

                  {/* Leak Finder Card */}
                  <div
                    style={S.toolCard}
                    onClick={() => router.push('/hub/personal-assistant/leaks')}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,180,255,0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(100,181,246,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{ ...S.cardRivet, top: 6, left: 6 }} />
                    <div style={{ ...S.cardRivet, top: 6, right: 6 }} />
                    <div style={{ ...S.cardRivet, bottom: 6, left: 6 }} />
                    <div style={{ ...S.cardRivet, bottom: 6, right: 6 }} />

                    <div style={S.toolIconWrap}>
                      <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
                        <circle cx="24" cy="24" r="18" stroke="#90caf9" strokeWidth="2" fill="none" />
                        <circle cx="24" cy="24" r="12" stroke="#90caf9" strokeWidth="2" fill="none" />
                        <circle cx="24" cy="24" r="6" stroke="#90caf9" strokeWidth="2" fill="none" />
                        <line x1="24" y1="6" x2="24" y2="2" stroke="#90caf9" strokeWidth="2" />
                        <line x1="24" y1="46" x2="24" y2="42" stroke="#90caf9" strokeWidth="2" />
                        <line x1="6" y1="24" x2="2" y2="24" stroke="#90caf9" strokeWidth="2" />
                        <line x1="46" y1="24" x2="42" y2="24" stroke="#90caf9" strokeWidth="2" />
                      </svg>
                    </div>
                    <h2 style={S.toolTitle}>Leak Finder</h2>
                    <p style={S.toolSub}>Track and Improve Your Game</p>
                    <ul style={S.bulletList}>
                      <li style={S.bulletItem}><span style={S.bullet} /> Detect Statistical Leaks</li>
                      <li style={S.bulletItem}><span style={S.bullet} /> Track Progress Over Time</li>
                      <li style={S.bulletItem}><span style={S.bullet} /> Get Targeted Training</li>
                    </ul>
                    <button style={{ ...S.toolBtn, background: 'linear-gradient(135deg, #374151, #1f2937)' }} onClick={(e) => { e.stopPropagation(); router.push('/hub/personal-assistant/leaks'); }}>
                      View Leaks
                    </button>
                  </div>
                </div>

                {/* ── Trust Pillars Section ───────────────────────────── */}
                <div style={S.trustSection}>
                  <h3 style={S.trustTitle}>Honest, Regulator-Ready Poker Study</h3>
                  <div style={S.pillarRow}>
                    <div style={S.pillar}>
                      <div style={S.pillarIcon}>
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                          <path d="M16 2L4 8v8c0 7.18 5.12 13.89 12 16 6.88-2.11 12-8.82 12-16V8L16 2z" stroke="#64b5f6" strokeWidth="2" fill="none" />
                          <path d="M12 16l3 3 6-6" stroke="#64b5f6" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                      <h4 style={S.pillarTitle}>GTO Anchored</h4>
                      <p style={S.pillarText}>Tied To Solver Analysis</p>
                    </div>
                    <div style={S.pillar}>
                      <div style={S.pillarIcon}>
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="16" r="14" stroke="#64b5f6" strokeWidth="2" fill="none" />
                          <path d="M12 16l3 3 6-6" stroke="#64b5f6" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                      <h4 style={S.pillarTitle}>Safe and Fair</h4>
                      <p style={S.pillarText}>No Exploit Hunting</p>
                    </div>
                    <div style={S.pillar}>
                      <div style={S.pillarIcon}>
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                          <path d="M4 24V12l6-6h12l6 6v12l-6 6H10l-6-6z" stroke="#64b5f6" strokeWidth="2" fill="none" />
                          <path d="M10 20l4-8 4 6 4-4" stroke="#64b5f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <h4 style={S.pillarTitle}>Results-Driven</h4>
                      <p style={S.pillarText}>Identify Leaks - Track Improvement</p>
                    </div>
                  </div>
                </div>

                {/* ── Recent Sessions ─────────────────────────────────── */}
                <div style={S.sessionsSection}>
                  <div style={S.sessionsHeader}>
                    <h3 style={S.sessionsTitle}>Recent Sessions</h3>
                    <select style={S.sessionsFilter}>
                      <option>My Sessions</option>
                      <option>All Sessions</option>
                    </select>
                  </div>

                  {isLoading ? (
                    <div style={S.emptyState}>Loading Sessions...</div>
                  ) : recentSessions.length === 0 ? (
                    <div style={S.emptyState}>No Sessions Yet. Start Exploring In The Virtual Sandbox!</div>
                  ) : (
                    <div style={S.sessionsList}>
                      {recentSessions.map((session) => (
                        <div key={session.id} style={S.sessionRow}
                          onClick={() => router.push(session.type === 'sandbox' ? '/hub/personal-assistant/sandbox' : '/hub/personal-assistant/leaks')}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(100,181,246,0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                        >
                          <div style={S.sessionLeft}>
                            <div style={S.sessionDot}>
                              {session.type === 'sandbox' ? (
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                  <rect x="2" y="2" width="16" height="16" rx="2" stroke="#64b5f6" strokeWidth="1.5" fill="none" />
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                  <circle cx="10" cy="10" r="8" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
                                </svg>
                              )}
                            </div>
                            <div>
                              <span style={S.sessionName}>{session.title}</span>
                              {session.stack && <span style={S.sessionMeta}> - {session.stack}</span>}
                            </div>
                          </div>
                          <div style={S.sessionRight}>
                            <span style={{ ...S.sessionEv, color: session.evLoss < 0 ? '#ef4444' : '#22c55e' }}>
                              {session.evLoss < 0 ? '' : '+'}{session.evLoss.toFixed(2)} BB
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Jarvis Circular Frame (bottom-right) ────────────── */}
                <div
                  style={S.jarvisFrame}
                  onClick={() => {
                    // Open Jarvis chat
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('open-jarvis-chat'));
                    }
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,212,255,0.5), inset 0 0 10px rgba(0,212,255,0.15)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 12px rgba(0,212,255,0.3), inset 0 0 6px rgba(0,0,0,0.4)'; }}
                  title="Chat with Jarvis"
                >
                  <img src="/images/jarvis-avatar.png" alt="Jarvis AI" style={S.jarvisImg} />
                </div>

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
// STYLES — Futuristic Metal Frame UI
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
    padding: '8px 16px 40px',
    maxWidth: 720,
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

  // ── Outer metal frame ──────────────────────────────────────────────────
  outerFrame: {
    position: 'relative',
    background: 'linear-gradient(145deg, #2a3040 0%, #1a1f2e 30%, #151a26 70%, #1e2432 100%)',
    border: '3px solid #3a4050',
    borderRadius: 16,
    padding: 6,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  rivet: {
    position: 'absolute', width: 12, height: 12, borderRadius: '50%',
    background: 'linear-gradient(145deg, #4a5060, #2a3040)',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
    zIndex: 2,
  },
  accentBarTop: {
    position: 'absolute', top: 0, left: '15%', right: '15%', height: 2,
    background: 'linear-gradient(90deg, transparent, rgba(0,180,255,0.6), transparent)',
    borderRadius: 1, zIndex: 2,
  },
  innerFrame: {
    background: 'linear-gradient(180deg, rgba(15,20,30,0.95) 0%, rgba(10,15,25,0.98) 100%)',
    border: '1px solid rgba(100,181,246,0.12)',
    borderRadius: 12,
    padding: '20px 16px 16px',
    position: 'relative',
  },

  // ── Tool cards row ─────────────────────────────────────────────────────
  toolRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 16,
  },
  toolCard: {
    position: 'relative',
    background: 'linear-gradient(145deg, rgba(30,35,50,0.9) 0%, rgba(20,25,38,0.95) 100%)',
    border: '1px solid rgba(100,181,246,0.2)',
    borderRadius: 10,
    padding: '20px 14px 16px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    textAlign: 'left',
  },
  cardRivet: {
    position: 'absolute', width: 8, height: 8, borderRadius: '50%',
    background: 'linear-gradient(145deg, #3a4050, #252a38)',
    border: '1px solid rgba(255,255,255,0.06)',
    zIndex: 1,
  },
  toolIconWrap: {
    width: 52, height: 52, borderRadius: '50%',
    background: 'rgba(100,181,246,0.08)',
    border: '1px solid rgba(100,181,246,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  toolTitle: {
    fontSize: 17, fontWeight: 700, color: '#e2e8f0',
    marginBottom: 4, fontFamily: 'Inter, sans-serif',
  },
  toolSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px',
    fontWeight: 600,
  },
  bulletList: {
    listStyle: 'none', padding: 0, margin: '0 0 16px 0',
  },
  bulletItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 0', fontSize: 13, color: 'rgba(255,255,255,0.8)',
  },
  bullet: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#64b5f6', flexShrink: 0,
  },
  toolBtn: {
    width: '100%', padding: '10px 16px',
    background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
    border: '1px solid rgba(100,181,246,0.3)',
    borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.2s ease',
    letterSpacing: '0.3px',
  },

  // ── Trust pillars ──────────────────────────────────────────────────────
  trustSection: {
    background: 'rgba(100,181,246,0.04)',
    border: '1px solid rgba(100,181,246,0.1)',
    borderRadius: 10,
    padding: '16px 14px',
    marginBottom: 12,
  },
  trustTitle: {
    fontSize: 16, fontWeight: 700, color: '#e2e8f0',
    textAlign: 'center', marginBottom: 14,
    fontFamily: 'Inter, sans-serif',
  },
  pillarRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
  },
  pillar: {
    background: 'rgba(100,181,246,0.05)',
    border: '1px solid rgba(100,181,246,0.12)',
    borderRadius: 8, padding: '14px 10px',
    textAlign: 'center',
  },
  pillarIcon: { marginBottom: 8, display: 'flex', justifyContent: 'center' },
  pillarTitle: {
    fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4,
  },
  pillarText: {
    fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4,
  },

  // ── Recent sessions ────────────────────────────────────────────────────
  sessionsSection: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(100,181,246,0.08)',
    borderRadius: 10,
    padding: '14px',
  },
  sessionsHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  sessionsTitle: {
    fontSize: 16, fontWeight: 700, color: '#e2e8f0',
    fontFamily: 'Inter, sans-serif',
  },
  sessionsFilter: {
    padding: '6px 12px', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
    color: '#94a3b8', fontSize: 12, cursor: 'pointer',
  },
  emptyState: {
    padding: '24px 16px', textAlign: 'center',
    color: 'rgba(255,255,255,0.4)', fontSize: 13,
  },
  sessionsList: { display: 'flex', flexDirection: 'column', gap: 4 },
  sessionRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
  },
  sessionLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  sessionDot: {
    width: 28, height: 28, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  sessionName: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
  sessionMeta: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  sessionRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  sessionEv: { fontSize: 13, fontWeight: 600 },

  // ── Jarvis circular frame ──────────────────────────────────────────────
  jarvisFrame: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'linear-gradient(145deg, #2a3040, #1a1f2e)',
    border: '2px solid rgba(100,181,246,0.25)',
    boxShadow: '0 0 12px rgba(0,212,255,0.3), inset 0 0 6px rgba(0,0,0,0.4)',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'box-shadow 0.3s ease',
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
};
