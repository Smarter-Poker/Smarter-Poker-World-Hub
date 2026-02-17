/**
 * PERSONAL ASSISTANT — Strategy Hub
 * /hub/personal-assistant
 *
 * The Strategy Hub houses two primary tools:
 * 1. Virtual Sandbox — Theoretical hand exploration with GTO analysis
 * 2. Leak Finder — Post-session statistical leak detection
 *
 * Core Philosophy: This is a lab, not a cheat tool.
 * No live play advice, ever.
 */

import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../src/lib/supabase';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useAssistantStats, useRecentSessions } from '../../../src/hooks/useAssistant';
import JarvisChatWidget from '../../../src/components/jarvis/JarvisChatWidget';
import DashboardOverview from '../../../src/components/jarvis/DashboardOverview';
import FeatureGate from '../../../src/components/gates/FeatureGate';

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY HUB — Main Landing Page
// ═══════════════════════════════════════════════════════════════════════════

export default function PersonalAssistantPage() {
  const router = useRouter();
  const { user } = useAvatar();
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  //  INTRO VIDEO STATE - Video plays while page loads in background
  // Only show once per session (not on every reload)
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      return !sessionStorage.getItem('personal-assistant-intro-seen');
    }
    return false;
  });
  const introVideoRef = useRef(null);

  // Mark intro as seen when it ends
  const handleIntroEnd = useCallback(() => {
    sessionStorage.setItem('personal-assistant-intro-seen', 'true');
    setShowIntro(false);
  }, []);

  // Attempt to unmute video after it starts playing
  const handleIntroPlay = useCallback(() => {
    if (introVideoRef.current) {
      introVideoRef.current.muted = false;
    }
  }, []);

  // Use real hooks for data
  const { stats, isLoading: statsLoading } = useAssistantStats();
  const { sessions: recentSessions, isLoading: sessionsLoading } = useRecentSessions(5);

  const isLoading = statsLoading || sessionsLoading;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}>Initializing...</div>
      </div>
    );
  }

  return (
    <PageTransition>
      {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
      {showIntro && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <video
            ref={introVideoRef}
            src="/videos/personal-assistant-intro.mp4"
            autoPlay
            muted
            playsInline
            onPlay={handleIntroPlay}
            onEnded={handleIntroEnd}
            onError={handleIntroEnd}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          {/* Skip button */}
          <button
            onClick={handleIntroEnd}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              padding: '8px 20px',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 20,
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              zIndex: 100000
            }}
          >
            Skip
          </button>
        </div>
      )}
      <SEOHead
                title="Personal Poker Assistant — Jarvis AI"
                description="Get Personalized Poker Coaching, Hand Analysis, And Strategy Advice From Jarvis, Your AI Poker Assistant."
                canonical="/hub/personal-assistant"
            >
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

      <div className="strategy-hub-page" style={styles.container}>
        {/* Background */}
        <div style={styles.bgGrid} />
        <div style={styles.bgGlow} />

        {/* Header */}
        <UniversalHeader pageDepth={1} onMenuClick={() => setShowMenu(!showMenu)} />

        {/* Hamburger Menu Drawer */}
        {showMenu && (
          <>
            {/* Overlay */}
            <div
              onClick={() => setShowMenu(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                zIndex: 999,
              }}
            />
            {/* Menu Drawer */}
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25 }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 280,
                background: '#0a0e1a',
                borderRight: '1px solid rgba(0, 136, 255, 0.2)',
                zIndex: 1000,
                padding: '20px',
                overflowY: 'auto',
              }}
            >
              <h3 style={{ color: '#00D4FF', marginBottom: 24, fontSize: 20 }}>Menu</h3>
              {[
                { label: 'Overview', href: '/hub/personal-assistant' },
                { label: 'Virtual Sandbox', href: '/hub/personal-assistant/sandbox' },
                { label: 'Leak Finder', href: '/hub/personal-assistant/leaks' },
                { label: 'Goals', href: '/hub/personal-assistant?tab=goals' },
                { label: 'Tilt Log', href: '/hub/personal-assistant?tab=tilt' },
                { label: 'Bankroll', href: '/hub/personal-assistant?tab=bankroll' },
                { label: 'Opponents', href: '/hub/personal-assistant?tab=opponents' },
                { label: 'Hand History', href: '/hub/personal-assistant?tab=hands' },
                { label: 'Chat with Jarvis', href: '/hub/messenger?chat=jarvis' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    router.push(item.href);
                    setShowMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    marginBottom: 8,
                    background: 'rgba(0, 136, 255, 0.1)',
                    border: '1px solid rgba(0, 136, 255, 0.2)',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 15,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                    e.currentTarget.style.borderColor = '#00D4FF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 136, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.2)';
                  }}
                >
                  {item.label}
                </button>
              ))}
            </motion.div>
          </>
        )}

        {/* Main Content — Gated behind 100💎 day pass */}
        <FeatureGate featureKey="personal_assistant" userId={user?.id} cost={100} duration={24} featureName="Strategy Hub" description="Access Virtual Sandbox, Leak Finder, And Jarvis Coaching Tools For 24 Hours.">
          <main style={styles.main}>
            {/* Page Title */}
            <div style={styles.titleSection}>
              <h1 style={styles.pageTitle}>Strategy Hub</h1>
              <p style={styles.pageSubtitle}>Safe, Data-driven Tools To Refine Your Poker Game The Right Way.</p>
            </div>

            {/* Dashboard Overview */}
            <DashboardOverview stats={stats} isLoading={isLoading} />

            {/* Two Main Tool Cards */}
            <div style={styles.toolCardsContainer}>
              {/* Virtual Sandbox Card */}
              <motion.div
                style={styles.toolCard}
                whileHover={{ scale: 1.02, y: -4 }}
                transition={{ duration: 0.2 }}
                onClick={() => router.push('/hub/personal-assistant/sandbox')}
              >
                <div style={styles.toolIconContainer}>
                  <div style={styles.sandboxIcon}>
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <path d="M24 4L8 14v20l16 10 16-10V14L24 4z" stroke="#64b5f6" strokeWidth="2" fill="none" />
                      <path d="M24 24V44M8 14l16 10 16-10" stroke="#64b5f6" strokeWidth="2" />
                      <circle cx="24" cy="24" r="4" fill="#64b5f6" />
                    </svg>
                  </div>
                </div>
                <h2 style={styles.toolTitle}>Virtual Sandbox</h2>
                <p style={styles.toolDescription}>Explore Theoretical Hands</p>
                <ul style={styles.toolFeatures}>
                  <li style={styles.featureItem}>
                    <span style={styles.checkmark}>&#10003;</span>
                    Run any poker scenario
                  </li>
                  <li style={styles.featureItem}>
                    <span style={styles.checkmark}>&#10003;</span>
                    Test complex hands vs Villain types
                  </li>
                  <li style={styles.featureItem}>
                    <span style={styles.checkmark}>&#10003;</span>
                    See solver-verified GTO results
                  </li>
                </ul>
                <button style={styles.toolButton}>
                  Enter Sandbox
                </button>
                <span style={styles.toolFooter}>Not Live Play - Experiment Freely</span>
              </motion.div>

              {/* Leak Finder Card */}
              <motion.div
                style={styles.toolCard}
                whileHover={{ scale: 1.02, y: -4 }}
                transition={{ duration: 0.2 }}
                onClick={() => router.push('/hub/personal-assistant/leaks')}
              >
                <div style={styles.toolIconContainer}>
                  <div style={styles.leakIcon}>
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <circle cx="24" cy="24" r="18" stroke="#90caf9" strokeWidth="2" fill="none" />
                      <circle cx="24" cy="24" r="12" stroke="#90caf9" strokeWidth="2" fill="none" />
                      <circle cx="24" cy="24" r="6" stroke="#90caf9" strokeWidth="2" fill="none" />
                      <line x1="24" y1="6" x2="24" y2="2" stroke="#90caf9" strokeWidth="2" />
                      <line x1="24" y1="46" x2="24" y2="42" stroke="#90caf9" strokeWidth="2" />
                      <line x1="6" y1="24" x2="2" y2="24" stroke="#90caf9" strokeWidth="2" />
                      <line x1="46" y1="24" x2="42" y2="24" stroke="#90caf9" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
                <h2 style={styles.toolTitle}>Leak Finder</h2>
                <p style={styles.toolDescription}>Track & Improve Your Game</p>
                <ul style={styles.toolFeatures}>
                  <li style={styles.featureItem}>
                    <span style={styles.checkmark}>&#10003;</span>
                    Detect statistical leaks
                  </li>
                  <li style={styles.featureItem}>
                    <span style={styles.checkmark}>&#10003;</span>
                    Track progress over time
                  </li>
                  <li style={styles.featureItem}>
                    <span style={styles.checkmark}>&#10003;</span>
                    Get targeted training
                  </li>
                </ul>
                <button style={styles.toolButton}>
                  View Leaks
                </button>
                <span style={styles.toolFooter}>Post-play Review Only - Track And Improve</span>
              </motion.div>
            </div>

            {/* Trust Pillars Section */}
            <div style={styles.trustSection}>
              <h3 style={styles.trustTitle}>Honest, Regulator-Ready Poker Study</h3>
              <p style={styles.trustSubtitle}>
                <span style={styles.trustCheck}>&#10003;</span> Non-Exploitative
                <span style={styles.trustDot}> - </span>
                <span style={styles.trustCheck}>&#10003;</span> No Live Advice
                <span style={styles.trustDot}> - </span>
                <span style={styles.trustCheck}>&#10003;</span> Regulator-Safe
              </p>

              <div style={styles.trustPillars}>
                <div style={styles.pillar}>
                  <div style={styles.pillarIcon}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <path d="M16 2L4 8v8c0 7.18 5.12 13.89 12 16 6.88-2.11 12-8.82 12-16V8L16 2z" stroke="#64b5f6" strokeWidth="2" fill="none" />
                      <path d="M12 16l3 3 6-6" stroke="#64b5f6" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h4 style={styles.pillarTitle}>GTO Anchored</h4>
                  <p style={styles.pillarText}>Tied To Solver Analysis<br />AI Fill-in Clearly Labeled</p>
                </div>

                <div style={styles.pillar}>
                  <div style={styles.pillarIcon}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="14" stroke="#64b5f6" strokeWidth="2" fill="none" />
                      <path d="M12 16l3 3 6-6" stroke="#64b5f6" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h4 style={styles.pillarTitle}>Safe & Fair</h4>
                  <p style={styles.pillarText}>No Live Assist - No Exploit Hunting<br />Test In Peace</p>
                </div>

                <div style={styles.pillar}>
                  <div style={styles.pillarIcon}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <path d="M4 24V12l6-6h12l6 6v12l-6 6H10l-6-6z" stroke="#64b5f6" strokeWidth="2" fill="none" />
                      <path d="M10 20l4-8 4 6 4-4" stroke="#64b5f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h4 style={styles.pillarTitle}>Results-Driven</h4>
                  <p style={styles.pillarText}>Identify Leaks - Track Improvement<br />Train Smarter</p>
                </div>
              </div>
            </div>

            {/* Recent Sessions */}
            <div style={styles.recentSection}>
              <div style={styles.recentHeader}>
                <h3 style={styles.recentTitle}>Recent Sessions</h3>
                <select style={styles.recentFilter}>
                  <option>My Sessions</option>
                  <option>All Sessions</option>
                </select>
              </div>

              {isLoading ? (
                <div style={styles.loadingState}>Loading Sessions...</div>
              ) : recentSessions.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No Sessions Yet. Start Exploring In The Virtual Sandbox!</p>
                </div>
              ) : (
                <div style={styles.sessionsList}>
                  {recentSessions.map((session) => (
                    <div key={session.id} style={styles.sessionCard}>
                      <div style={styles.sessionLeft}>
                        <div style={styles.sessionIcon}>
                          {session.type === 'sandbox' ? (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <rect x="2" y="2" width="16" height="16" rx="2" stroke="#64b5f6" strokeWidth="1.5" fill="none" />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <circle cx="10" cy="10" r="8" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
                            </svg>
                          )}
                        </div>
                        <div style={styles.sessionInfo}>
                          <span style={styles.sessionTitle}>{session.title}</span>
                          {session.stack && <span style={styles.sessionMeta}> - {session.stack}</span>}
                        </div>
                      </div>
                      <div style={styles.sessionRight}>
                        <span style={{
                          ...styles.sessionEv,
                          color: session.evLoss < 0 ? '#ef4444' : '#22c55e'
                        }}>
                          {session.evLoss < 0 ? '' : '+'}{session.evLoss.toFixed(2)} BB
                          {session.type === 'leak' ? '/Hand Leakage' : ' of EV Loss'}
                        </span>
                        <span style={styles.sessionLink}>
                          {session.type === 'sandbox' ? 'Analyze in Sandbox >' : 'View Details >'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <footer style={styles.footer}>
              <div style={styles.footerBrand}>
                <img src="/smarter-poker-logo-transparent.png" alt="Smarter.Poker" style={styles.footerLogo} />
              </div>
              <div style={styles.footerLinks}>
                <a href="/about" style={styles.footerLink}>About</a>
                <a href="/features" style={styles.footerLink}>Features</a>
                <a href="/security" style={styles.footerLink}>Security</a>
                <a href="/terms" style={styles.footerLink}>Terms</a>
                <a href="/privacy" style={styles.footerLink}>Privacy</a>
              </div>
              <p style={styles.footerCopyright}>2024 Smarter.Poker. All Rights Reserved.</p>
            </footer>
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

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0d1929 0%, #0a1628 50%, #061018 100%)',
    fontFamily: 'Inter, -apple-system, sans-serif',
    position: 'relative',
  },
  bgGrid: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `
      linear-gradient(rgba(100, 181, 246, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(100, 181, 246, 0.03) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  bgGlow: {
    position: 'fixed',
    top: '-20%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '120%',
    height: '60%',
    background: 'radial-gradient(ellipse at center, rgba(100, 181, 246, 0.08) 0%, transparent 60%)',
    pointerEvents: 'none',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a1628',
  },
  loadingSpinner: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
  },
  main: {
    position: 'relative',
    zIndex: 1,
    padding: '20px 24px 40px',
  },
  titleSection: {
    textAlign: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  pageTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 32,
    fontWeight: 300,
    color: '#64b5f6',
    marginBottom: 8,
    letterSpacing: '0.05em',
  },
  pageSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: 400,
  },

  // Tool Cards
  toolCardsContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
    marginBottom: 40,
  },
  toolCard: {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
    border: '1px solid rgba(100, 181, 246, 0.2)',
    borderRadius: 16,
    padding: '32px 24px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  toolIconContainer: {
    marginBottom: 20,
  },
  sandboxIcon: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'rgba(100, 181, 246, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leakIcon: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'rgba(144, 202, 249, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: {
    fontSize: 22,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 6,
  },
  toolDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 20,
  },
  toolFeatures: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 24px 0',
    width: '100%',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    padding: '8px 0',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'left',
  },
  checkmark: {
    color: '#64b5f6',
    fontWeight: 700,
    fontSize: 14,
  },
  toolButton: {
    width: '100%',
    padding: '14px 24px',
    background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: 12,
  },
  toolFooter: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    fontStyle: 'italic',
  },

  // Trust Section
  trustSection: {
    textAlign: 'center',
    marginBottom: 40,
    padding: '32px 24px',
    background: 'linear-gradient(180deg, rgba(100, 181, 246, 0.05) 0%, transparent 100%)',
    borderRadius: 16,
  },
  trustTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 8,
  },
  trustSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 28,
  },
  trustCheck: {
    color: '#64b5f6',
  },
  trustDot: {
    color: 'rgba(255, 255, 255, 0.3)',
    margin: '0 8px',
  },
  trustPillars: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 24,
  },
  pillar: {
    padding: '24px 16px',
    background: 'rgba(100, 181, 246, 0.05)',
    borderRadius: 12,
    border: '1px solid rgba(100, 181, 246, 0.15)',
  },
  pillarIcon: {
    marginBottom: 12,
  },
  pillarTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 8,
  },
  pillarText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 1.5,
  },

  // Recent Sessions
  recentSection: {
    marginBottom: 40,
  },
  recentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  recentTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
  },
  recentFilter: {
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  loadingState: {
    padding: 40,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emptyState: {
    padding: 40,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
  },
  sessionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sessionCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  sessionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  sessionIcon: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
  },
  sessionMeta: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  sessionRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  sessionEv: {
    fontSize: 14,
    fontWeight: 600,
  },
  sessionLink: {
    fontSize: 12,
    color: '#64b5f6',
  },

  // Footer
  footer: {
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    paddingTop: 32,
    textAlign: 'center',
  },
  footerBrand: {
    marginBottom: 16,
  },
  footerLogo: {
    height: 28,
    opacity: 0.6,
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  footerLink: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textDecoration: 'none',
  },
  footerCopyright: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
};
