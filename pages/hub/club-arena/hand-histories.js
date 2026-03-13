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
import dynamic from 'next/dynamic';
import s from '../../../src/styles/UnionDashboard.module.css';
import '../../../src/styles/worlds/club-arena.css';

// SSG-safe: load HandReplayerModal only on client side
const HandReplayerModal = dynamic(
  () => import('../../../src/components/poker/HandReplayerModal'),
  { ssr: false }
);

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

// Lazy supabase client (SSG-safe — only created on client)
let _supabaseClient = null;
function getSupabase() {
  if (!_supabaseClient && typeof window !== 'undefined') {
    const { supabase } = require('../../../src/lib/supabase');
    _supabaseClient = supabase;
  }
  return _supabaseClient;
}

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
  const [filterTable, setFilterTable] = useState('');
  const [filterMinPot, setFilterMinPot] = useState('');

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
      const { supabase } = await import('../../../src/lib/supabase');
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
  }, [router.query.club, router.query.clubId, loadHands]);

  // Refresh on tab visibility change
  useEffect(() => {
    if (!clubId) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadHands(clubId, page);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [clubId, page, loadHands]);

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
          ) : error ? <div className={s.error}>{error}</div> : (
            <>
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
                {/* Filters */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <input value={filterTable} onChange={e => setFilterTable(e.target.value)} placeholder="Filter by table..." style={{ flex: '1 1 150px', padding: '8px 12px', background: '#3A3B3C', border: '1px solid #4A4B4C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px', outline: 'none' }} />
                  <input value={filterMinPot} onChange={e => setFilterMinPot(e.target.value.replace(/\D/g, ''))} placeholder="Min pot..." style={{ width: '100px', padding: '8px 12px', background: '#3A3B3C', border: '1px solid #4A4B4C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px', outline: 'none' }} />
                  {(filterTable || filterMinPot) && (
                    <button onClick={() => { setFilterTable(''); setFilterMinPot(''); }} className={s.btnGhost} style={{ fontSize: '12px', padding: '6px 12px' }}>✕ Clear</button>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Recent Hands ({data.total})</h3>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => loadHands(clubId, Math.max(1, page - 1))} disabled={page === 1 || loading} className={s.btnGhost}>◀ Prev</button>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{page} / {data.totalPages || 1}</span>
                    <button onClick={() => loadHands(clubId, Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages || loading} className={s.btnGhost}>Next ▶</button>
                  </div>
                </div>

                {loading && data.hands.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[1,2,3,4,5].map(i => <div key={i} className="ca-skeleton" style={{ height: '48px' }} />)}
                  </div>
                ) : data.hands.length === 0 ? (
                  <div className={s.emptyState}>
                    <span className={s.emptyIcon}>🎬</span>
                    <span className={s.emptyText}>You haven't played any hands yet.</span>
                    <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none', marginTop: '12px' }}>
                      <button className={s.btnPrimary} style={{ padding: '8px 20px', fontSize: '13px' }}>🏠 Join a Table</button>
                    </Link>
                  </div>
                ) : (() => {
                  // Apply client-side filters
                  const filtered = data.hands.filter(h => {
                    if (filterTable && !(h.tableName || '').toLowerCase().includes(filterTable.toLowerCase())) return false;
                    if (filterMinPot && Number(h.pot_total || 0) < Number(filterMinPot)) return false;
                    return true;
                  });
                  return filtered.length === 0 && (filterTable || filterMinPot) ? (
                    <div className={s.emptyState}>
                      <span className={s.emptyIcon}>🔍</span>
                      <span className={s.emptyText}>No hands match your filters.</span>
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
                        {filtered.map(h => (
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
                  );
                })()}
              </div>

              {/* Replayer Modal */}
              {activeHandId && (
                <HandReplayerModal 
                  handId={activeHandId}
                  supabase={getSupabase()}
                  currentUserId={userId}
                  clubId={clubId}
                  onClose={() => setActiveHandId(null)}
                />
              )}
            </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
