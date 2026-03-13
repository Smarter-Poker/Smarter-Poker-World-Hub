/* ═══════════════════════════════════════════════════════════════
   Club Arena Hand Histories — Native Hub Page (replaces iframe shell)
   Chronological feed of hands mapped to HandReplayerModal
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiGet } from '../../../src/lib/club-arena/apiClient';
import HandReplayerModal from '../../../src/components/poker/HandReplayerModal';
import { createClient } from '../../../src/lib/supabase';
import s from '../../../src/styles/UnionDashboard.module.css';

const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Number(n || 0).toLocaleString();
};

const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function ClubArenaHandHistoriesPage() {
  useTrainingBus('arena-hand-histories');
  const router = useRouter();

  const [clubId, setClubId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [data, setData] = useState({ hands: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [activeHandId, setActiveHandId] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadHands = useCallback(async (cId, p) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiGet(`/api/club-arena/my-hands?clubId=${cId}&page=${p}&limit=50`);
      if (mountedRef.current) {
        setData(res);
        setPage(res.page);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      setUserId(session.user.id);
      
      const qClub = router.query.club || router.query.clubId;
      const supabase = createClient();
      let targetClub = qClub;
      
      if (!targetClub) {
        const { data: mem } = await supabase.from('club_members').select('club_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        targetClub = mem?.club_id;
      }
      
      if (targetClub && !cancelled) {
        setClubId(targetClub);
        loadHands(targetClub, 1);
      } else if (!cancelled) {
        setError('No club found.'); setLoading(false);
      }
    };

    (async () => {
      const supabase = createClient();
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
  }, [router.query.club, router.query.clubId, loadHands]);

  return (
    <HubErrorBoundary name="Hand Histories">
      <SEOHead title="My Hand Histories | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}

          {/* Header */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>🎬 My Hand Histories</div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}>
                <button className={s.btnGhost}>🏠 Lobby</button>
              </Link>
              <button onClick={() => clubId && loadHands(clubId, 1)} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* Body */}
          <div className={s.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Recent Hands ({data.total})</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => loadHands(clubId, Math.max(1, page - 1))} disabled={page === 1 || loading} className={s.btnGhost}>◀ Prev</button>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{page} / {data.totalPages || 1}</span>
                <button onClick={() => loadHands(clubId, Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages || loading} className={s.btnGhost}>Next ▶</button>
              </div>
            </div>

            {loading && data.hands.length === 0 ? (
              <div className={s.loading}>Loading Hand Histories...</div>
            ) : data.hands.length === 0 ? (
              <div className={s.emptyState}>
                <span className={s.emptyIcon}>🎬</span>
                <span className={s.emptyText}>You haven't played any hands yet.</span>
              </div>
            ) : (
              <div className={s.tableScroll}>
                <table className={s.dataTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>ID</th>
                      <th>Table Name</th>
                      <th>Time</th>
                      <th style={{ textAlign: 'right' }}>Pot Size</th>
                      <th style={{ textAlign: 'center' }}>Replay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.hands.map(h => (
                      <tr key={h.id} style={{ transition: 'background 0.2s' }}>
                        <td style={{ color: '#B0B3B8', fontFamily: 'monospace' }}>#{h.hand_number || h.hand_id?.split('-')[1]?.substring(0,4) || '?'}</td>
                        <td style={{ fontWeight: 600 }}>{h.tableName}</td>
                        <td style={{ color: '#94A3B8', fontSize: '13px' }}>{formatDate(h.created_at)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#F7C52A' }}>{fmtChips(h.pot_total)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            onClick={() => setActiveHandId(h.id)} 
                            className={s.btnPrimary} 
                            style={{ padding: '4px 12px', fontSize: '12px', background: '#31A24C' }}
                          >
                            ▶ Replay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Replayer Modal */}
          {activeHandId && (
            <HandReplayerModal 
              handId={activeHandId}
              supabase={createClient()}
              currentUserId={userId}
              clubId={clubId}
              onClose={() => setActiveHandId(null)}
            />
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
