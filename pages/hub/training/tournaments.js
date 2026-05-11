/**
 * TRAINING TOURNAMENTS LOBBY
 * ═══════════════════════════════════════════════════════════════════════════
 * Competitive timed training challenges vs other players
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { getGameById } from '../../../src/data/TRAINING_LIBRARY';
import { supabase } from '../../../src/lib/supabase';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// BUG FIX (TRAIN-TOURNAMENTS-A11Y-1): SVG icon components replacing the
// tournaments lobby emoji set. Strict rules from PR #362/#365/#369 — NO
// JSX comments inside && or ternary expressions, and no emoji characters
// in legacy fallback strings (SWC's parser chokes on some). Replacements:
// TrophyIcon (header + empty state + status), DiamondIcon, GoldMedalIcon,
// SilverMedalIcon, BronzeMedalIcon, LiveDotIcon, ClockIcon, CheckIcon,
// BookIcon, QuestionIcon, UsersIcon, TargetIcon (game-icon fallback).
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size = 14, vb = '0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function TrophyIcon({ size = 20 }) {
  return (
    <_Svg size={size}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </_Svg>
  );
}
function DiamondIcon({ size = 14 }) {
  return (
    <_Svg size={size}>
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M11 3 8 9l4 12 4-12-3-6" />
      <path d="M2 9h20" />
    </_Svg>
  );
}
function MedalIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="14" r="7" />
      <path d="M8.21 13.89 6 22l6-3 6 3-2.21-8.12" />
      <path d="M9 7h6" />
    </svg>
  );
}
function GoldMedalIcon({ size = 16 })   { return <MedalIcon size={size} color="#FFD700" />; }
function SilverMedalIcon({ size = 16 }) { return <MedalIcon size={size} color="#C0C0C0" />; }
function BronzeMedalIcon({ size = 16 }) { return <MedalIcon size={size} color="#CD7F32" />; }
function LiveDotIcon({ size = 8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="#ef4444" />
    </svg>
  );
}
function ClockIcon({ size = 14 }) {
  return (
    <_Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </_Svg>
  );
}
function CheckIcon({ size = 14 }) {
  return (
    <_Svg size={size}>
      <polyline points="20 6 9 17 4 12" />
    </_Svg>
  );
}
function BookIcon({ size = 14 }) {
  return (
    <_Svg size={size}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </_Svg>
  );
}
function QuestionIcon({ size = 14 }) {
  return (
    <_Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </_Svg>
  );
}
function UsersIcon({ size = 14 }) {
  return (
    <_Svg size={size}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </_Svg>
  );
}
function TargetIcon({ size = 16 }) {
  return (
    <_Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </_Svg>
  );
}


export default function TournamentsPage() {
  useTrainingBus('tournaments');
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'upcoming', 'completed'
  const [registering, setRegistering] = useState(null);

  // Load auth user once
  useEffect(() => {
    const _c = new AbortController();

    try {
      setUser(getAuthUser());
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    return () => _c.abort();
  }, []);
  // SWR key includes tab + user so switching tabs is instant on revisit
  const swrKey = `/api/training/tournaments?status=${activeTab}${user ? `&userId=${user.id}` : ''}`;
  const {
    data: swrData,
    isLoading: loading,
    mutate: refreshTournaments,
  } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then((r) => r.json())
      .then((d) => (d.success ? d.tournaments || [] : []))
  );
  const tournaments = swrData || [];

  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`train-tourn:${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'commander_tournament_entries',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          refreshTournaments();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(_ch);
    };
  }, [user?.id, refreshTournaments]);

  const registerForTournament = async (tournamentId) => {
    if (!user) {
      alert('Please sign in to register');
      return;
    }

    setRegistering(tournamentId);
    try {
      const res = await authedFetch('/api/training/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          tournamentId,
          action: 'register',
        }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        alert('Registered successfully!');
        refreshTournaments(); // Refresh
        // Emit bus event if tournament had an entry fee
        if (data.entryFee > 0) {
          busEmit.diamondsSpent(data.entryFee, 'Training Tournament Entry');
        }
      } else {
        alert(data.error || 'Registration failed');
      }
    } catch (error) {
      console.warn('Register error:', error);
    } finally {
      setRegistering(null);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getStatusBadge = (status) => {
    // TRAIN-TOURNAMENTS-A11Y-1: SVG status badges replace emoji prefixes.
    const wrap = (children, bg) => (
      <span style={{ ...styles.badge, background: bg, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
      </span>
    );
    switch (status) {
      case 'live':
        return wrap(<><LiveDotIcon size={8} /> LIVE</>, '#31A24C');
      case 'scheduled':
        return wrap(<><ClockIcon size={12} /> Upcoming</>, '#00E0FF');
      case 'complete':
        return wrap(<><CheckIcon size={12} /> Complete</>, '#6b7280');
      default:
        return null;
    }
  };

  return (
    <>
    <PageTransition>
      <SEOHead
        title="Training Tournaments — Compete & Learn"
        description="Enter GTO Training Tournaments. Compete Against Other Students In Scenario-based Challenges."
        canonical="/hub/training/tournaments"
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div style={styles.content}>
          {/* Header */}
          <div style={styles.header}>
            <h1 style={styles.title}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#fbbf24' }}>
                <TrophyIcon size={22} />
                Training Tournaments
              </span>
            </h1>
            <p style={styles.subtitle}>Compete Against Other Players In Timed GTO Challenges</p>
          </div>

          {/* Tab Navigation */}
          <div style={styles.tabs}>
            {['live', 'upcoming', 'completed'].map((tab) => (
              <button
                key={tab}
                type="button"
                aria-label={`Filter by ${tab}`}
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab ? styles.tabActive : {}),
                }}
              >
                tab === 'live' ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LiveDotIcon size={8} /> Live</span>) : tab === 'upcoming' ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ClockIcon size={12} /> Upcoming</span>) : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckIcon size={12} /> Past</span>)
              </button>
            ))}
          </div>

          {/* Tournament List */}
          {loading ? (
            <SkeletonLoader variant="card" count={3} style={{ padding: '16px' }} />
          ) : tournaments.length === 0 ? (
            <div style={styles.emptyState}>
              <span style={{ ...styles.emptyIcon, display: 'inline-flex', color: '#475569' }}><TrophyIcon size={48} /></span>
              <p>No {activeTab} tournaments</p>
              {activeTab === 'live' && (
                <p style={styles.emptyHint}>Check Upcoming Tournaments Or Wait For The Next One!</p>
              )}
            </div>
          ) : (
            <div style={styles.tournamentList}>
              {tournaments.map((tournament, i) => {
                const game = getGameById(tournament.game_id);

                return (
                  <div key={tournament.id} style={styles.tournamentCard}>
                    <div style={styles.cardHeader}>
                      <div style={styles.cardTitle}>
                        <span style={{ ...styles.gameIcon, display: 'inline-flex' }}>{game?.icon ? game.icon : <TargetIcon size={16} />}</span>
                        {tournament.name}
                      </div>
                      {getStatusBadge(tournament.status)}
                    </div>

                    <div style={styles.cardDetails}>
                      <div style={styles.detailRow}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><BookIcon size={12} /> Game:</span>
                        <span>{game?.name || tournament.game_id}</span>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ClockIcon size={12} /> Time:</span>
                        <span>
                          {formatDate(tournament.start_time)} at {formatTime(tournament.start_time)}
                        </span>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><QuestionIcon size={12} /> Questions:</span>
                        <span>{tournament.questions_count}</span>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UsersIcon size={12} /> Players:</span>
                        <span>
                          {tournament.entry_count}
                          {tournament.max_entries ? `/${tournament.max_entries}` : ''}
                        </span>
                      </div>
                    </div>

                    <div style={styles.prizes}>
                      <div style={styles.prizeItem}>
                        <span style={{ display: 'inline-flex' }}><GoldMedalIcon size={14} /></span>
                        <span style={{ ...styles.prizeAmount, display: 'inline-flex', alignItems: 'center', gap: 2 }}>{tournament.prize_1st}<DiamondIcon size={12} /></span>
                      </div>
                      <div style={styles.prizeItem}>
                        <span style={{ display: 'inline-flex' }}><SilverMedalIcon size={14} /></span>
                        <span style={{ ...styles.prizeAmount, display: 'inline-flex', alignItems: 'center', gap: 2 }}>{tournament.prize_2nd}<DiamondIcon size={12} /></span>
                      </div>
                      <div style={styles.prizeItem}>
                        <span style={{ display: 'inline-flex' }}><BronzeMedalIcon size={14} /></span>
                        <span style={{ ...styles.prizeAmount, display: 'inline-flex', alignItems: 'center', gap: 2 }}>{tournament.prize_3rd}<DiamondIcon size={12} /></span>
                      </div>
                    </div>

                    {tournament.entry_fee_diamonds > 0 && (
                      <div style={{ ...styles.entryFee, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Entry: {tournament.entry_fee_diamonds}<DiamondIcon size={12} /></div>
                    )}

                    {tournament.status === 'scheduled' && (
                      <button
                        type="button"
                        aria-label={`Register for tournament: ${tournament.name}`}
                        onClick={() => registerForTournament(tournament.id)}
                        disabled={registering === tournament.id}
                        style={styles.registerBtn}
                      >
                        {registering === tournament.id ? 'Registering...' : 'Register Now'}
                      </button>
                    )}

                    {tournament.status === 'live' && (
                      <Link
                        href={`/hub/training/tournament/${tournament.id}`}
                        style={styles.playBtn}
                      >
                        Play Now →
                      </Link>
                    )}

                    {tournament.status === 'complete' && (
                      <Link
                        href={`/hub/training/tournament/${tournament.id}`}
                        style={styles.viewBtn}
                      >
                        View Results
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
    <ConnectionToast />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: '#0a0a0a',
    color: '#FFFFFF',
  },
  content: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '80px 24px 40px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#9ca3af',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    background: '#1a1a1a',
    padding: '6px',
    borderRadius: '12px',
  },
  tab: {
    flex: 1,
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#9ca3af',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
    color: '#fff',
  },
  loading: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#9ca3af',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#9ca3af',
  },
  emptyIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '16px',
  },
  emptyHint: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '8px',
  },
  tournamentList: {
    display: 'grid',
    gap: '16px',
  },
  tournamentCard: {
    background: '#1a1a1a',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  gameIcon: {
    fontSize: '24px',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#fff',
  },
  cardDetails: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '6px',
  },
  prizes: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '12px 0',
    marginBottom: '16px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  prizeItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  prizeAmount: {
    fontWeight: 600,
    color: '#FFD700',
  },
  entryFee: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '12px',
  },
  registerBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  playBtn: {
    display: 'block',
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #31A24C, #228B22)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
  },
  viewBtn: {
    display: 'block',
    width: '100%',
    padding: '14px',
    background: '#2a2a2a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color: '#9ca3af',
    fontSize: '16px',
    fontWeight: 500,
    textAlign: 'center',
    textDecoration: 'none',
  },
  actions: {
    textAlign: 'center',
    marginTop: '40px',
  },
  backButton: {
    color: '#00E0FF',
    textDecoration: 'none',
    fontSize: '16px',
  },
};
