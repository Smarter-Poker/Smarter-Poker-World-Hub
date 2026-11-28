/**
 * TRAINING TOURNAMENTS LOBBY
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Competitive timed training challenges vs other players
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-60 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-20 — hex sweep batch 6: extended palette literals routed
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { getGameById } from '../../../src/data/TRAINING_LIBRARY';
import { supabase } from '../../../src/lib/supabase';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import TrainingSignInPrompt from '../../../src/components/training/TrainingSignInPrompt';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';

const TAB_LABELS = { live: 'Live', scheduled: 'Upcoming', completed: 'Past' };
// TRAIN-WIRE-EMPTY-5a — adoption: shared empty-state primitive



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
function GoldMedalIcon({ size = 16 })   { return <MedalIcon size={size} color="#86daff" />; }
function SilverMedalIcon({ size = 16 }) { return <MedalIcon size={size} color="#C0C0C0" />; }
function BronzeMedalIcon({ size = 16 }) { return <MedalIcon size={size} color="#86daff" />; }
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
  const router = useRouter();
  useTrainingBus('tournaments');
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'scheduled', 'completed'
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine !== false);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);



  // Load auth user once
  useEffect(() => {
    const _c = new AbortController();

    try {
      setUser(getAuthUser());
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    setAuthChecked(true);
    return () => _c.abort();
  }, []);
  // SWR key includes tab + user so switching tabs is instant on revisit
  const swrKey = `/api/training/tournaments?status=${activeTab}${user ? `&userId=${user.id}` : ''}`;
  const {
    data: swrData,
    isLoading: loading,
    error: tournamentsError,
    mutate: refreshTournaments,
  } = useSWR(swrKey, async (url) => {
    // The lobby is open to everyone (Dan, 2026-10-12). authedFetch attaches
    // Authorization only when a session exists; a stale session that cannot
    // be refreshed falls back to the shared, signed-out listing.
    let response = await authedFetch(url);
    if (response.status === 401) {
      response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true || !Array.isArray(payload.tournaments)) {
      throw new Error(payload?.error || 'Tournament Data Could Not Be Loaded');
    }
    return payload.tournaments;
  });
  const tournaments = swrData || [];

  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`train-tourn:${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'training_tournaments',
        },
        () => {
          refreshTournaments();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'training_tournament_entries',
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
    const wrap = (children) => (
      <span className={s.tag}>
        {children}
      </span>
    );
    switch (status) {
      case 'live':
        return wrap(<><LiveDotIcon size={8} /> Live</>);
      case 'scheduled':
        return wrap(<><ClockIcon size={12} /> Upcoming</>);
      case 'complete':
        return wrap(<><CheckIcon size={12} /> Complete</>);
      default:
        return null;
    }
  };

  return (
    <>
    <PageTransition>
      <SEOHead
        title="Training Tournaments - Compete & Learn"
        description="GTO Training Tournaments On Smarter.Poker: A Field Plays The Same Hands In The Same Order And Is Ranked On Decision Quality Against The Solver, Not On Chips Won. Free To Enter, And Nothing In It Is A Wager."
        canonical="/hub/training/tournaments"
      />

      <div className={s.shell}>
        <UniversalHeader pageDepth={2} />

        <main className={s.page}>
          <TrainingPageHead slug="training-tournaments" note="Compete Against Other Players In Timed GTO Challenges" />

          {!isOnline && (
            <p role="status" data-offline-banner="true" className={s.note}>
              Offline. Live Tournament Sync Will Resume After Reconnection.
            </p>
          )}

          {/* Tab Navigation */}
          <div className={s.segmented} role="group" aria-label="Tournament Status">
            {['live', 'scheduled', 'completed'].map((tab) => (
              <button
                key={tab}
                type="button"
                aria-label={`Filter by ${tab}`}
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`sd-button ${s.button}`}
              >
                {tab === 'live' ? (
                  <><LiveDotIcon size={8} /> Live</>
                ) : tab === 'scheduled' ? (
                  <><ClockIcon size={14} /> Upcoming</>
                ) : (
                  <><CheckIcon size={14} /> Past</>
                )}
              </button>
            ))}
          </div>

          {authChecked && !user?.id && (
            <TrainingSignInPrompt
              returnPath="/hub/training/tournaments"
              message="Sign In To Register And Track Your Tournament Entries."
            />
          )}

          {/* Tournament List */}
          {loading ? (
            <div role="status" aria-label="Loading Tournaments" className={s.grid}>
              {[0, 1, 2].map((n) => (
                <div key={n} className={`sd-panel ${s.skeleton}`} aria-hidden>
                  <span className={s.skeletonBar} />
                  <span className={s.skeletonBar} />
                  <span className={s.skeletonBar} />
                </div>
              ))}
            </div>
          ) : tournamentsError ? (
            <TrainerEmptyState
              variant="retry"
              title="Tournament Data Unavailable"
              message="The Tournament Lobby Could Not Be Loaded. No Empty Results Were Assumed."
              cta={{ label: 'Try Again', onClick: () => refreshTournaments() }}
            />
          ) : tournaments.length === 0 ? (
            <TrainerEmptyState
              variant="no-data"
              title={`No ${TAB_LABELS[activeTab]} Tournaments`}
              message={activeTab === 'live' ? 'Check Upcoming Tournaments Or Wait For The Next One.' : 'Check Back Soon For New Tournaments.'}
            />
          ) : (
            <div className={s.grid}>
              {tournaments.map((tournament) => {
                const game = getGameById(tournament.game_id);

                return (
                  <article key={tournament.id} className={`sd-panel ${s.card}`}>
                    <div className={s.row}>
                      <h2 className={s.subTitle}>
                        <span className={s.ice} aria-hidden>{game?.icon ? game.icon : <TargetIcon size={16} />}</span>{' '}
                        {tournament.name}
                      </h2>
                      {getStatusBadge(tournament.status)}
                    </div>

                    <div className={s.list}>
                      <div className={s.kv}>
                        <span className={s.iconLabel}><BookIcon size={12} /> Game</span>
                        <strong>{game?.name || tournament.game_id}</strong>
                      </div>
                      <div className={s.kv}>
                        <span className={s.iconLabel}><ClockIcon size={12} /> Time</span>
                        <strong>{formatDate(tournament.start_time)} At {formatTime(tournament.start_time)}</strong>
                      </div>
                      <div className={s.kv}>
                        <span className={s.iconLabel}><QuestionIcon size={12} /> Questions</span>
                        <strong>{tournament.questions_count}</strong>
                      </div>
                      <div className={s.kv}>
                        <span className={s.iconLabel}><UsersIcon size={12} /> Players</span>
                        <strong>
                          {tournament.entry_count}
                          {tournament.max_entries ? `/${tournament.max_entries}` : ''}
                        </strong>
                      </div>
                    </div>

                    <div className={s.metrics3} aria-label="Prizes">
                      {[
                        ['1st', <GoldMedalIcon key="g" size={14} />, tournament.prize_1st],
                        ['2nd', <SilverMedalIcon key="s" size={14} />, tournament.prize_2nd],
                        ['3rd', <BronzeMedalIcon key="b" size={14} />, tournament.prize_3rd],
                      ].map(([place, icon, prize]) => (
                        <div key={place} className={`sd-metric ${s.metric}`}>
                          <span className={s.metricLabel}><span className={s.iconLabel}>{icon} {place}</span></span>
                          <strong className={s.metricValue} data-tone="ice"><span className={s.iconLabel}>{prize}<DiamondIcon size={12} /></span></strong>
                        </div>
                      ))}
                    </div>

                    {tournament.entry_fee_diamonds > 0 && (
                      <p className={s.small}><span className={s.iconLabel}>Entry: {tournament.entry_fee_diamonds}<DiamondIcon size={12} /></span></p>
                    )}

                    {tournament.status === 'scheduled' && (
                      <button
                        type="button"
                        aria-label={`Verified registration is not available for tournament: ${tournament.name}`}
                        disabled
                        title="Registration Reopens After Server-Authoritative Settlement Is Certified"
                        className={`sd-button ${s.primaryAction}`}
                      >
                        Registration Temporarily Paused
                      </button>
                    )}

                    {tournament.status === 'live' && (
                      <Link
                        href={`/hub/training/tournament/${tournament.id}`}
                        className={`sd-button sd-primary ${s.primaryAction}`}
                      >
                        View Live Standings
                      </Link>
                    )}

                    {tournament.status === 'complete' && (
                      <Link
                        href={`/hub/training/tournament/${tournament.id}`}
                        className={`sd-button ${s.primaryAction}`}
                      >
                        View Results
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
    <ConnectionToast />
      {/* Server rendered: measured on production this page returned
          only chrome to a crawler (AEO phase 3, 2026-09-17). */}
      <HubPageSummary page="training-tournaments" />
    </>
  );
}
