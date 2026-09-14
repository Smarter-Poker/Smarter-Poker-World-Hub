/**
 * TRAINING TOURNAMENT DETAIL — /hub/training/tournament/[id]
 * ============================================================
 * DEAD-LINK FIX 2026-08-15.
 *
 * The tournaments lobby links every LIVE tournament ("Play Now") and every
 * COMPLETED one ("View Results") to /hub/training/tournament/{id} — a route
 * that did not exist. Both buttons 404'd, so every entry in the list was a
 * dead end.
 *
 * Read-only tournament details remain available while entry, lifecycle, and
 * scoring move to one attempt-bound server transaction in Phase 9:
 *   GET  /api/training/tournaments?tournamentId=X
 *        -> { tournament, entries, userEntry, leaderboard }
 * Mutation controls stay visibly unavailable rather than calling the retired
 * browser-authored score path or implying a registration succeeded.
 */

import SEOHead from '../../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../../src/components/transitions/PageTransition';
import SkeletonLoader from '../../../../src/components/ui/SkeletonLoader';
import { getAuthUserId, authedFetch } from '../../../../src/lib/authUtils';
import { getGameById } from '../../../../src/data/TRAINING_LIBRARY';

const fetcher = (url) => authedFetch(url).then((r) => r.json());

function fmtTime(ts) {
  if (!ts) return '--';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '--';
  }
}

function rankLabel(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

export default function TrainingTournamentDetail() {
  const router = useRouter();
  const { id } = router.query;
  const userId = getAuthUserId();

  const { data, error, isLoading } = useSWR(
    id ? `/api/training/tournaments?tournamentId=${encodeURIComponent(id)}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const tournament = data?.tournament || null;
  const entries = data?.entries || [];
  const userEntry = data?.userEntry || null;
  const game = tournament ? getGameById(tournament.game_id) : null;

  const status = tournament?.status || '';
  const isLive = status === 'live';
  const isComplete = status === 'complete' || status === 'completed';
  const canStart = isLive && userEntry && userEntry.status === 'registered';
  const isPlaying = userEntry && userEntry.status === 'playing';

  return (
    <PageTransition>
      <SEOHead
        title={tournament ? `${tournament.name} | Training Tournament` : 'Training Tournament'}
        description={tournament?.description || 'Competitive timed training challenge'}
      />
      <UniversalHeader />

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 14px 48px' }}>
        <Link
          href="/hub/training/tournaments"
          style={{ color: 'var(--sp-text-dim, #9aa4b2)', fontSize: 13, textDecoration: 'none' }}
        >
          &larr; All Tournaments
        </Link>

        {isLoading && <SkeletonLoader />}

        {!isLoading && (error || !tournament) && (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.2rem', margin: '12px 0 6px' }}>Tournament Not Found</h1>
            <p style={{ opacity: 0.7, fontSize: 14 }}>
              It May Have Been Removed, Or The Link Is Out Of Date.
            </p>
          </div>
        )}

        {!isLoading && tournament && (
          <>
            <header style={{ marginTop: 14, marginBottom: 8 }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '3px 9px',
                  borderRadius: 999,
                  fontSize: 12,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  background: isLive
                    ? 'rgba(34,197,94,0.15)'
                    : isComplete
                      ? 'rgba(148,163,184,0.15)'
                      : 'rgba(59,130,246,0.15)',
                  color: isLive ? '#22c55e' : isComplete ? '#94a3b8' : '#3b82f6',
                }}
              >
                {isLive ? 'Live now' : isComplete ? 'Completed' : 'Scheduled'}
              </div>
              <h1 style={{ fontSize: '1.5rem', margin: '8px 0 4px' }}>{tournament.name}</h1>
              {tournament.description && (
                <p style={{ opacity: 0.75, fontSize: 14, margin: 0 }}>{tournament.description}</p>
              )}
            </header>

            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10,
                margin: '16px 0',
              }}
            >
              {[
                ['Game', game?.name || tournament.game_id || '--'],
                ['Questions', tournament.questions_count ?? '--'],
                [
                  'Time limit',
                  tournament.time_limit_seconds
                    ? `${Math.round(tournament.time_limit_seconds / 60)} min`
                    : '--',
                ],
                ['Entrants', tournament.entry_count ?? entries.length],
                ['Entry fee', tournament.entry_fee_diamonds ? `${tournament.entry_fee_diamonds} diamonds` : 'Free'],
                ['Starts', fmtTime(tournament.start_time)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </section>

            {(tournament.prize_1st || tournament.prize_2nd || tournament.prize_3rd) && (
              <section style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, textTransform: 'uppercase' }}>
                  Prizes
                </h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 14 }}>
                  <span>1st &mdash; <strong>{tournament.prize_1st || 0}</strong></span>
                  <span>2nd &mdash; <strong>{tournament.prize_2nd || 0}</strong></span>
                  <span>3rd &mdash; <strong>{tournament.prize_3rd || 0}</strong></span>
                </div>
              </section>
            )}

            {userId && userEntry && (
              <section
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,215,0,0.07)',
                  border: '1px solid rgba(255,215,0,0.22)',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 13, opacity: 0.8 }}>Your Entry</div>
                <div style={{ fontSize: 14 }}>
                  Status <strong>{userEntry.status}</strong>
                  {userEntry.score != null && <> &middot; Score <strong>{userEntry.score}</strong></>}
                  {userEntry.final_rank != null && (
                    <> &middot; Finished <strong>{rankLabel(userEntry.final_rank)}</strong></>
                  )}
                  {userEntry.prize_won ? <> &middot; Won <strong>{userEntry.prize_won}</strong></> : null}
                </div>
              </section>
            )}

            {canStart && (
              <button
                type="button"
                disabled
                title="Tournament Runs Reopen After Attempt-Bound Settlement Is Certified"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: 'not-allowed',
                  background: 'linear-gradient(135deg,#ffd700,#f0a500)',
                  color: '#1a1a1a',
                  marginBottom: 8,
                  opacity: 0.62,
                }}
              >
                Tournament Runs Temporarily Paused
              </button>
            )}

            {isPlaying && !canStart && (
              <div
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '12px 16px',
                  borderRadius: 10,
                  fontWeight: 800,
                  background: 'rgba(234,179,8,0.10)',
                  color: '#eab308',
                  marginBottom: 8,
                }}
              >
                Resume Is Paused Until This Entry Is Bound To A Verified Attempt
              </div>
            )}

            {isLive && !userEntry && (
              <p style={{ fontSize: 13, opacity: 0.75 }}>
                You Are Not Registered For This Tournament. Register From the{' '}
                <Link href="/hub/training/tournaments" style={{ color: '#ffd700' }}>
                  Tournaments Lobby
                </Link>
                .
              </p>
            )}

            <section style={{ marginTop: 22 }}>
              <h2 style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, textTransform: 'uppercase' }}>
                {isComplete ? 'Final results' : 'Leaderboard'}
              </h2>
              {entries.length === 0 && (
                <p style={{ fontSize: 14, opacity: 0.7 }}>No Entries Yet.</p>
              )}
              {entries.map((e, i) => {
                const mine = userId && e.user_id === userId;
                return (
                  <div
                    key={e.id || `${e.user_id}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      marginBottom: 4,
                      background: mine ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.03)',
                      border: mine ? '1px solid rgba(255,215,0,0.3)' : '1px solid transparent',
                    }}
                  >
                    <span style={{ minWidth: 42, opacity: 0.7, fontSize: 13 }}>
                      {rankLabel(e.final_rank || i + 1)}
                    </span>
                    <span style={{ flex: 1, fontWeight: mine ? 700 : 400 }}>
                      {e.profiles?.username || 'Player'}
                      {mine ? ' (you)' : ''}
                    </span>
                    {e.accuracy != null && (
                      <span style={{ fontSize: 12, opacity: 0.65 }}>{e.accuracy}% Acc</span>
                    )}
                    <strong style={{ minWidth: 54, textAlign: 'right' }}>{e.score ?? 0}</strong>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </PageTransition>
  );
}
