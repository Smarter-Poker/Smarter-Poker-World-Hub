/* ═══════════════════════════════════════════════════════════════
   Club Arena Leaderboard — Native Hub Page (replaces iframe shell)
   4 Modes: Chips | Volume | Activity | Big Winners
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall } from '../../../src/lib/club-arena/apiClient';
import { eventBus } from '../../../src/engine/EventBus';
import s from '../../../src/styles/UnionDashboard.module.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};

const MEDAL = ['🥇', '🥈', '🥉'];
const MODES = [
  { id: 'chips', label: '💰 Chip Balance', desc: 'Ranked by current chip balance' },
  { id: 'volume', label: '📊 7-Day Volume', desc: 'Ranked by total transaction volume (7 days)' },
  { id: 'activity', label: '⚡ Most Active', desc: 'Ranked by transaction count (7 days)' },
  { id: 'big_winners', label: '🏆 Big Winners', desc: 'Ranked by net positive chip flow (7 days)' },
];

export default function ClubArenaLeaderboardPage() {
  useTrainingBus('club-arena-leaderboard');
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [mode, setMode] = useState('chips');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [metric, setMetric] = useState('chips');

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Load Leaderboard ───────────────────────────────────────
  const loadLeaderboard = useCallback(async (cId, action, silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const targetClubId = cId || clubId;
      const targetAction = action || mode;
      if (!targetClubId) { setError('No club selected.'); setLoading(false); return; }
      const res = await apiCall('/api/club-arena/club-leaderboard', { clubId: targetClubId, action: targetAction, limit: 50 });
      if (mountedRef.current) {
        setLeaderboard(res.leaderboard || []);
        setMetric(res.metric || targetAction);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clubId, mode]);

  // ── Initial Load ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      const qClub = router.query.club || router.query.clubId;
      if (qClub) { setClubId(qClub); loadLeaderboard(qClub, 'chips'); return; }
      if (session) {
        const { supabase } = await import('../../../src/lib/supabase');
        const { data: membership } = await supabase
          .from('club_members').select('club_id').eq('user_id', session.user.id)
          .limit(1).maybeSingle();
        if (membership?.club_id && !cancelled) { setClubId(membership.club_id); loadLeaderboard(membership.club_id, 'chips'); return; }
      }
      if (!cancelled) { setError('No club found.'); setLoading(false); }
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await init(session); return; }
      const timeout = setTimeout(() => { if (!cancelled) { setError('login_required'); setLoading(false); } }, 3000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
        clearTimeout(timeout);
        if (sess && !cancelled) await init(sess);
        else if (!cancelled) { setError('login_required'); setLoading(false); }
        subscription?.unsubscribe();
      });
      authUnsub = subscription;
    })();

    return () => { cancelled = true; authUnsub?.unsubscribe?.(); };
  }, [router.query.club, router.query.clubId]);

  // ── Mode Switch ────────────────────────────────────────────
  useEffect(() => {
    if (clubId) loadLeaderboard(clubId, mode);
  }, [mode]);

  // ── EventBus ───────────────────────────────────────────────
  useEffect(() => {
    const refresh = () => { if (clubId) loadLeaderboard(clubId, mode, true); };
    const events = ['CHIPS_DISTRIBUTED', 'CASHOUT_APPROVED', 'BALANCE_UPDATED'];
    events.forEach(ev => eventBus.on(ev, refresh));
    return () => events.forEach(ev => eventBus.off(ev, refresh));
  }, [clubId, mode, loadLeaderboard]);

  // ── Value Renderer ─────────────────────────────────────────
  const renderValue = (entry) => {
    if (metric === 'chips') return fmtChips(entry.chips);
    if (metric === 'volume') return fmtChips(entry.volume);
    if (metric === 'activity') return `${fmt(entry.txCount)} txns`;
    if (metric === 'big_winners') {
      const net = entry.netFlow || 0;
      return (
        <span style={{ color: net >= 0 ? '#31A24C' : '#E41E3F' }}>
          {net >= 0 ? '+' : ''}{fmtChips(net)}
        </span>
      );
    }
    return '—';
  };

  const renderSecondary = (entry) => {
    if (metric === 'chips') return null;
    if (metric === 'volume') return `${fmt(entry.txCount)} txns`;
    if (metric === 'activity') return `${fmtChips(entry.volume)} vol`;
    if (metric === 'big_winners') return `${fmtChips(entry.volume)} vol`;
    return null;
  };

  // ── Loading / Login ────────────────────────────────────────
  if (loading && leaderboard.length === 0) {
    return (
      <HubErrorBoundary name="Leaderboard">
        <SEOHead title="Leaderboard | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}>
          <div className={s.inner} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="ca-skeleton" style={{ height: '48px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>{[1,2,3,4].map(i => <div key={i} className="ca-skeleton" style={{ height: '36px', flex: 1 }} />)}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>{[1,2,3].map(i => <div key={i} className="ca-skeleton" style={{ height: '140px', width: '140px', borderRadius: '16px' }} />)}</div>
            {[1,2,3,4,5].map(i => <div key={i} className="ca-skeleton" style={{ height: '44px' }} />)}
          </div>
        </div>
      </HubErrorBoundary>
    );
  }

  const currentMode = MODES.find(m => m.id === mode);

  return (
    <HubErrorBoundary name="Leaderboard">
      <SEOHead title="Leaderboard | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error / Login ──────────────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access the Leaderboard.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}

          {/* ── Page Header ──────────────────────────────────── */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              🏆 Leaderboard
              <span className={s.unionCode}>{leaderboard.length} players</span>
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <button onClick={() => loadLeaderboard(clubId, mode)} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Mode Selector ────────────────────────────────── */}
          <div className={s.tabs}>
            {MODES.map(m => (
              <button
                key={m.id}
                className={`${s.tab} ${mode === m.id ? s.tabActive : ''}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Mode Description */}
          {currentMode && (
            <div style={{ color: '#B0B3B8', fontSize: '13px', marginBottom: '16px', paddingLeft: '4px' }}>
              {currentMode.desc}
            </div>
          )}

          {/* ── Podium: Top 3 ─────────────────────────────────── */}
          {leaderboard.length >= 3 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {/* 2nd Place */}
              {[1, 0, 2].map(idx => {
                const entry = leaderboard[idx];
                if (!entry) return null;
                const isFirst = idx === 0;
                return (
                  <div key={entry.userId} style={{
                    background: isFirst ? 'linear-gradient(135deg, rgba(247,197,42,0.15), rgba(247,197,42,0.05))' : '#242526',
                    border: isFirst ? '2px solid rgba(247,197,42,0.4)' : '1px solid #3A3B3C',
                    borderRadius: '16px',
                    padding: isFirst ? '24px 20px' : '20px 16px',
                    textAlign: 'center',
                    minWidth: '120px',
                    flex: '0 1 160px',
                    order: idx === 1 ? 0 : idx === 0 ? 1 : 2,
                    transform: isFirst ? 'scale(1.08)' : 'none',
                    transition: 'transform 0.2s ease',
                  }}>
                    <div style={{ fontSize: isFirst ? '40px' : '32px', marginBottom: '8px' }}>
                      {MEDAL[idx]}
                    </div>
                    {entry.avatar ? (
                      <img src={entry.avatar} alt="" style={{
                        width: isFirst ? '56px' : '44px',
                        height: isFirst ? '56px' : '44px',
                        borderRadius: '50%',
                        border: isFirst ? '3px solid #F7C52A' : '2px solid #3A3B3C',
                        marginBottom: '8px',
                      }} />
                    ) : (
                      <div style={{
                        width: isFirst ? '56px' : '44px',
                        height: isFirst ? '56px' : '44px',
                        borderRadius: '50%',
                        background: '#3A3B3C',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isFirst ? '20px' : '16px',
                        margin: '0 auto 8px',
                        border: isFirst ? '3px solid #F7C52A' : '2px solid #3A3B3C',
                      }}>
                        {(entry.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#E4E6EB', marginBottom: '4px' }}>
                      {entry.name}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: isFirst ? '18px' : '15px', color: isFirst ? '#F7C52A' : '#4599FF' }}>
                      {renderValue(entry)}
                    </div>
                    {renderSecondary(entry) && (
                      <div style={{ fontSize: '11px', color: '#B0B3B8', marginTop: '4px' }}>
                        {renderSecondary(entry)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Rankings Table ─────────────────────────────────── */}
          {leaderboard.length === 0 ? (
            <div className={s.emptyState}><span className={s.emptyIcon}>🏆</span><span className={s.emptyText}>No leaderboard data available</span></div>
          ) : (
            <div className={s.section}>
              <div className={s.sectionTitle}>Full Rankings</div>
              <div className={s.tableScroll}>
                <table className={s.dataTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      <th>Player</th>
                      <th>Role</th>
                      <th style={{ textAlign: 'right' }}>{currentMode?.label?.split(' ').slice(1).join(' ') || 'Score'}</th>
                      {renderSecondary(leaderboard[0] || {}) && <th style={{ textAlign: 'right' }}>Details</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => (
                      <tr key={entry.userId} style={i < 3 ? { background: 'rgba(247,197,42,0.05)' } : undefined}>
                        <td>
                          <span style={{ fontWeight: 700, fontSize: i < 3 ? '20px' : '14px' }}>
                            {i < 3 ? MEDAL[i] : entry.rank}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {entry.avatar ? (
                              <img src={entry.avatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                            ) : (
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                                {(entry.name || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <span style={{ fontWeight: i < 3 ? 700 : 500 }}>{entry.name}</span>
                          </div>
                        </td>
                        <td><span style={{ fontSize: '11px', color: '#B0B3B8', textTransform: 'uppercase' }}>{entry.role}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{renderValue(entry)}</td>
                        {renderSecondary(leaderboard[0] || {}) && (
                          <td style={{ textAlign: 'right', fontSize: '12px', color: '#B0B3B8' }}>{renderSecondary(entry)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
