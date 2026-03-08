/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Union Games | Tournaments & Cash Games
   SmarterPoker Dark Theme | Union-Level Tournament + Cash Table Management
   ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import dynamic from 'next/dynamic';
import usePersistedFilters from '../../../src/hooks/usePersistedFilters';
const SkeletonDark = dynamic(() => import('../../../src/components/ui/SkeletonDark'), { ssr: false });

const FB = {
  bg: '#18191A', card: '#242526', text: '#E4E6EB', dim: '#B0B3B8',
  border: '#3E4042', primary: '#2374E1', green: '#31A24C', red: '#FA383E',
  gold: '#F7C52A', hover: '#3A3B3C', purple: '#A855F7', teal: '#059669',
  orange: '#ea580c',
};

const STATUS_COLORS = {
  scheduled: '#2374E1', registering: '#31A24C', late_reg: '#059669', running: '#ea580c',
  break: '#eab308', paused: '#eab308', final_table: '#9333ea', complete: '#6b7280', cancelled: '#dc2626',
  waiting: '#2374E1', closed: '#6b7280', deleted: '#dc2626',
};

const getToken = () => getAccessToken();

const api = async (action, params) => {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated — please log in again');
  const res = await fetch('/api/club-arena/union-games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
};

export default function UnionGames() {
  const router = useRouter();
  const unionId = router.query?.union || null;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { filters, setFilter } = usePersistedFilters('club-arena-union-games', { tab: 'tournaments', subTab: 'upcoming', tableFilter: 'active' });
  const tab = filters.tab;
  const setTab = (val) => setFilter('tab', val);
  const subTab = filters.subTab;
  const setSubTab = (val) => setFilter('subTab', val);
  const tableFilter = filters.tableFilter;
  const setTableFilter = (val) => setFilter('tableFilter', val);

  // Data
  const [tournaments, setTournaments] = useState([]);
  const [tables, setTables] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [unionInfo, setUnionInfo] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { key, fn } two-tap confirm

  // Modals
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // filter tournaments/tables by name

  useEffect(() => {
    const authUser = getAuthUser();
    if (authUser) {
      setUser(authUser);
    } else {
      router.push('/auth/login');
    }
  }, [router]);

  // Load union info
  useEffect(() => {
    if (!unionId || !user) return;
    const _c = new AbortController();
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/club-arena/union-dashboard?unionId=${unionId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: _c.signal,
        });
        const d = await res.json();
        if (d.union) setUnionInfo(d.union);
      } catch (e) {
        if (e.name !== 'AbortError') console.error('[union-games] union info load:', e);
      }
    })();
    return () => _c.abort();
  }, [unionId, user]);

  const loadTournaments = useCallback(async () => {
    if (!unionId) return;
    const statusMap = {
      upcoming: ['scheduled', 'registering', 'late_reg'],
      running: ['running', 'late_reg', 'break', 'paused', 'final_table'],
      past: ['complete', 'cancelled'],
    };
    try {
      const res = await api('list_tournaments', { unionId, status: statusMap[subTab] });
      if (res.success) {
        const fresh = res.tournaments || [];
        setTournaments(fresh);
        if (res.clubs?.length) setClubs(res.clubs);
        // Sync selectedTournament to the fresh version (prevents stale modal data)
        setSelectedTournament(prev => prev
          ? fresh.find(t => t.id === prev.id) || null
          : null
        );
      } else {
        console.error('[union-games] list_tournaments:', res.error);
      }
    } catch (e) {
      console.error('[union-games] loadTournaments:', e);
    }
  }, [unionId, subTab]);

  const loadTables = useCallback(async () => {
    if (!unionId) return;
    try {
      // Pass statusFilter so API queries only what we need (no client-side filtering needed)
      const statusFilter = tableFilter === 'active' ? 'active'
        : tableFilter === 'closed' ? 'closed'
        : 'all';
      const res = await api('list_tables', { unionId, statusFilter });
      if (res.success) {
        setTables(res.tables || []);
        if (res.clubs?.length) setClubs(res.clubs);
      } else {
        console.error('[union-games] list_tables:', res.error);
      }
    } catch (e) {
      console.error('[union-games] loadTables:', e);
    }
  }, [unionId, tableFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'tournaments') await loadTournaments();
      else await loadTables();
    } catch (e) {
      console.error('[union-games] loadData:', e);
    } finally {
      setLoading(false);
    }
  }, [tab, loadTournaments, loadTables]);

  useEffect(() => { if (user && unionId) loadData(); }, [user, unionId, loadData]);

  // ── Realtime subscriptions for live updates ──
  useEffect(() => {
    if (!unionId || !user || clubs.length === 0) return;
    const clubIds = clubs.map(c => c.id);

    // Subscribe to tournament changes across all union clubs
    // Build a filter string for clubs in this union (PostgREST IN syntax)
    const clubIdFilter = clubIds.length === 1
      ? `club_id=eq.${clubIds[0]}`
      : undefined; // Supabase realtime filter only supports eq, not in — filter in callback

    const tournChannel = supabase
      .channel(`union-tournaments:${unionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'club_tournaments',
      }, (payload) => {
        const row = payload.new || payload.old;
        if (row && clubIds.includes(row.club_id)) {
          loadTournaments();
        }
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn(`[UnionGames] Tournament channel status: ${status}`);
        }
      });

    // Subscribe to table changes across all union clubs
    const tableChannel = supabase
      .channel(`union-tables:${unionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tables',
      }, (payload) => {
        const row = payload.new || payload.old;
        if (row && clubIds.includes(row.club_id)) {
          loadTables();
        }
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn(`[UnionGames] Table channel status: ${status}`);
        }
      });

    // Polling fallback every 15s — silent (no loading state change)
    const poll = setInterval(async () => {
      if (tab === 'tournaments') await loadTournaments();
      else await loadTables();
    }, 15000);

    return () => {
      supabase.removeChannel(tournChannel);
      supabase.removeChannel(tableChannel);
      clearInterval(poll);
    };
  }, [unionId, user, clubs.length, tab, loadTournaments, loadTables]);

  // Filtered lists based on search
  const filteredTournaments = searchQuery.trim()
    ? tournaments.filter(t => (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : tournaments;
  const filteredTables = searchQuery.trim()
    ? tables.filter(t => (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : tables;

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const twoTap = (key, fn) => {
    if (confirmAction?.key !== key) {
      setConfirmAction({ key, fn });
      setTimeout(() => setConfirmAction(c => c?.key === key ? null : c), 4000);
    } else {
      setConfirmAction(null);
      fn();
    }
  };

  const handleStartTournament = (id) => {
    twoTap(`start-${id}`, async () => {
      try {
        const res = await api('start_tournament', { unionId, tournamentId: id });
        showToast(`Tournament started with ${res.players || 0} players`);
        loadData();
      } catch (e) { showToast(e.message || 'Failed to start tournament', 'error'); }
    });
  };

  const handleCancelTournament = (id) => {
    twoTap(`cancel-${id}`, async () => {
      try {
        const res = await api('cancel_tournament', { unionId, tournamentId: id });
        showToast(`Cancelled — ${res.refunded || 0} players refunded`);
        loadData();
      } catch (e) { showToast(e.message || 'Failed to cancel tournament', 'error'); }
    });
  };

  const handleOpenRegistration = async (id) => {
    try {
      await api('open_registration', { unionId, tournamentId: id });
      showToast('Registration opened');
      loadData();
    } catch (e) { showToast(e.message || 'Failed to open registration', 'error'); }
  };

  const handleCloseTable = (id) => {
    twoTap(`close-table-${id}`, async () => {
      try {
        await api('close_table', { unionId, tableId: id });
        showToast('Table closed');
        loadData();
      } catch (e) { showToast(e.message || 'Failed to close table', 'error'); }
    });
  };

  // BUG #4 FIX: Don't flash blank — show skeleton while auth resolves
  if (!user) {
    return (
      <div style={{ background: FB.bg, minHeight: '100vh' }}>
        <SEOHead title="Union Games | Club Arena" />
        <UniversalHeader />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
          <SkeletonDark variant="table-rows" rows={6} />
        </div>
      </div>
    );
  }

  // BUG #5 FIX: No unionId param — redirect to Club Arena
  if (!unionId) {
    return (
      <div style={{ background: FB.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <SEOHead title="Union Games | Club Arena" />
        <UniversalHeader />
        <div style={{ color: '#FA383E', fontSize: 16 }}>No union specified.</div>
        <button onClick={() => router.push('/hub/club-arena')}
          style={{ background: FB.primary, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
          ← Back to Club Arena
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: FB.bg, minHeight: '100vh', color: FB.text }}>
      <SEOHead title={`Games | ${unionInfo?.name || 'Union'}`} />
      <UniversalHeader />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999, padding: '12px 20px',
          background: toast.type === 'error' ? FB.red : FB.green, color: '#fff',
          borderRadius: 8, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ background: FB.card, padding: '16px 24px', borderBottom: `1px solid ${FB.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => router.push(`/hub/club-arena/union-dashboard?union=${unionId}`)}
          style={{ background: 'none', border: 'none', color: FB.dim, cursor: 'pointer', fontSize: 20 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Union Games</h1>
          <span style={{ color: FB.dim, fontSize: 13 }}>{unionInfo?.name || 'Loading...'} — {clubs.length} clubs</span>
        </div>
        <div style={{ flex: 1 }} />
        {tab === 'tournaments' && clubs.length > 0 && (
          <button onClick={() => setShowCreateTournament(true)} style={{
            background: FB.green, color: '#fff', border: 'none', padding: '8px 20px',
            borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13,
          }}>+ Create Tournament</button>
        )}
        {tab === 'cash' && clubs.length > 0 && (
          <button onClick={() => setShowCreateTable(true)} style={{
            background: FB.primary, color: '#fff', border: 'none', padding: '8px 20px',
            borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13,
          }}>+ Create Table</button>
        )}
      </div>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${FB.border}`, background: FB.card }}>
        {[{ id: 'tournaments', label: 'Tournaments' }, { id: 'cash', label: 'Cash Games' }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedTournament(null); setSearchQuery(''); }}
            style={{
              flex: 1, padding: '12px 0', background: 'transparent', border: 'none',
              borderBottom: tab === t.id ? `3px solid ${FB.primary}` : '3px solid transparent',
              color: tab === t.id ? FB.primary : FB.dim, fontWeight: 700, cursor: 'pointer', fontSize: 14,
            }}>{t.label}</button>
        ))}
      </div>

      {/* Sub-filters */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        {tab === 'tournaments' ? (
          ['upcoming', 'running', 'past'].map(f => (
            <button key={f} onClick={() => { setSubTab(f); setSelectedTournament(null); }}
              style={{
                padding: '6px 16px', borderRadius: 20, border: `1px solid ${subTab === f ? FB.primary : FB.border}`,
                background: subTab === f ? FB.primary : FB.card, color: subTab === f ? '#fff' : FB.dim,
                fontWeight: 600, cursor: 'pointer', fontSize: 12, textTransform: 'capitalize', whiteSpace: 'nowrap',
              }}>{f}</button>
          ))
        ) : (
          ['active', 'closed', 'all'].map(f => (
            <button key={f} onClick={() => setTableFilter(f)}
              style={{
                padding: '6px 16px', borderRadius: 20, border: `1px solid ${tableFilter === f ? FB.primary : FB.border}`,
                background: tableFilter === f ? FB.primary : FB.card, color: tableFilter === f ? '#fff' : FB.dim,
                fontWeight: 600, cursor: 'pointer', fontSize: 12, textTransform: 'capitalize', whiteSpace: 'nowrap',
              }}>{f}</button>
          ))
        )}
      </div>

      {/* Search bar */}
      <div style={{ padding: '0 16px 8px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={tab === 'tournaments' ? 'Search tournaments...' : 'Search tables...'}
          style={{
            width: '100%', padding: '8px 14px', background: FB.card,
            border: `1px solid ${FB.border}`, borderRadius: 8, color: FB.text,
            fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', overflowX: 'auto' }}>
        {tab === 'tournaments' ? (
          <>
            <div style={{ background: FB.card, borderRadius: 8, padding: '8px 14px', border: `1px solid ${FB.border}`, minWidth: 90 }}>
              <div style={{ fontSize: 10, color: FB.dim }}>Total</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FB.text }}>{tournaments.length}</div>
            </div>
            <div style={{ background: FB.card, borderRadius: 8, padding: '8px 14px', border: `1px solid ${FB.border}`, minWidth: 90 }}>
              <div style={{ fontSize: 10, color: FB.dim }}>Players</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FB.green }}>{tournaments.reduce((s, t) => s + (t.registered_count || 0), 0)}</div>
            </div>
            <div style={{ background: FB.card, borderRadius: 8, padding: '8px 14px', border: `1px solid ${FB.border}`, minWidth: 90 }}>
              <div style={{ fontSize: 10, color: FB.dim }}>Prize Pools</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FB.gold }}>{tournaments.reduce((s, t) => s + Math.max(Number(t.prize_pool) || 0, Number(t.guaranteed_prize) || 0), 0).toLocaleString()}</div>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: FB.card, borderRadius: 8, padding: '8px 14px', border: `1px solid ${FB.border}`, minWidth: 90 }}>
              <div style={{ fontSize: 10, color: FB.dim }}>Tables</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FB.text }}>{tables.length}</div>
            </div>
            <div style={{ background: FB.card, borderRadius: 8, padding: '8px 14px', border: `1px solid ${FB.border}`, minWidth: 90 }}>
              <div style={{ fontSize: 10, color: FB.dim }}>Active</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FB.green }}>{tables.filter(t => t.status === 'running').length}</div>
            </div>
            <div style={{ background: FB.card, borderRadius: 8, padding: '8px 14px', border: `1px solid ${FB.border}`, minWidth: 90 }}>
              <div style={{ fontSize: 10, color: FB.dim }}>Players Seated</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FB.primary }}>{tables.reduce((s, t) => s + (t.current_players || 0), 0)}</div>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '0 16px 100px' }}>
        {loading ? (
          <SkeletonDark variant="table-rows" rows={5} />
        ) : tab === 'tournaments' ? (
          /* ═══ TOURNAMENTS LIST ═══ */
          filteredTournaments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: FB.dim }}>
              {searchQuery ? `No tournaments match "${searchQuery}"` : `No ${subTab} tournaments. ${subTab === 'upcoming' ? 'Create one to get started!' : ''}`}
            </div>
          ) : (
            filteredTournaments.map(t => (
              <div key={t.id} onClick={() => setSelectedTournament(t)} style={{
                background: FB.card, borderRadius: 12, padding: 16, marginTop: 12,
                border: `1px solid ${FB.border}`, cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    {t.settings?.isUnionTournament && (
                      <span style={{ fontSize: 10, background: FB.purple, color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>UNION</span>
                    )}
                  </div>
                  <span style={{
                    background: STATUS_COLORS[t.status] || FB.dim, color: '#fff', fontSize: 10,
                    fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0, marginLeft: 8,
                  }}>{t.status?.replace(/_/g, ' ')}</span>
                </div>
                {/* Info row */}
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: FB.dim, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span>🏢 {clubs.find(cl => cl.id === t.club_id)?.name || 'Unknown Club'}</span>
                  <span>🃏 {(t.game_type || 'NLHE').toUpperCase()} {(t.settings?.tournamentType || 'MTT').toUpperCase()}</span>
                  <span>💰 Buy-in: {Number(t.buy_in).toLocaleString()}</span>
                  <span>👥 {t.registered_count}/{t.max_players}</span>
                  <span style={{ color: FB.gold }}>🏆 {Math.max(Number(t.prize_pool), Number(t.guaranteed_prize)).toLocaleString()}{Number(t.guaranteed_prize) > Number(t.prize_pool) ? ' GTD' : ''}</span>
                  {t.start_time && <span>🕐 {new Date(t.start_time).toLocaleString()}</span>}
                </div>
                {/* Actions */}
                {['scheduled', 'registering'].includes(t.status) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    {t.status === 'scheduled' && (
                      <button onClick={() => handleOpenRegistration(t.id)} style={{
                        padding: '6px 14px', background: FB.green, color: '#fff', border: 'none',
                        borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>Open Registration</button>
                    )}
                    {t.status === 'registering' && t.registered_count >= 2 && (
                      <button onClick={() => handleStartTournament(t.id)} style={{
                        padding: '6px 14px', background: confirmAction?.key === `start-${t.id}` ? '#c2410c' : FB.orange, color: '#fff', border: 'none',
                        borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>{confirmAction?.key === `start-${t.id}` ? 'Confirm Start?' : 'Start Now'}</button>
                    )}
                    <button onClick={() => handleCancelTournament(t.id)} style={{
                      padding: '6px 14px', background: confirmAction?.key === `cancel-${t.id}` ? '#991b1b' : FB.red, color: '#fff', border: 'none',
                      borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>{confirmAction?.key === `cancel-${t.id}` ? 'Confirm Cancel?' : 'Cancel'}</button>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          /* ═══ CASH GAMES LIST ═══ */
          filteredTables.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: FB.dim }}>
              {searchQuery ? `No tables match "${searchQuery}"` : `No ${tableFilter} tables. Create one to get started!`}
            </div>
          ) : (
            filteredTables.map(t => (
              <div key={t.id} style={{
                background: FB.card, borderRadius: 12, padding: 16, marginTop: 12,
                border: `1px solid ${FB.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                    {t.settings?.createdByUnion && (
                      <span style={{ marginLeft: 8, fontSize: 10, background: FB.purple, color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>UNION</span>
                    )}
                  </div>
                  <span style={{
                    background: STATUS_COLORS[t.status] || FB.dim, color: '#fff', fontSize: 10,
                    fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                  }}>{t.status}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: FB.dim, flexWrap: 'wrap' }}>
                  <span> {clubs.find(cl => cl.id === t.club_id)?.name || 'Unknown'}</span>
                  <span> {(t.game_type || t.game_variant)?.toUpperCase() || 'NLH'}</span>
                  <span> {t.small_blind}/{t.big_blind}</span>
                  <span> {t.current_players || 0}/{t.max_seats || t.max_players}</span>
                  <span>🃏 Buy-in: {(t.min_buyin || t.min_buy_in || 0).toLocaleString()}–{(t.max_buyin || t.max_buy_in || 0).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => router.push(`/hub/club-arena/lobby?club=${t.club_id}`)} style={{
                    padding: '6px 14px', background: FB.primary, color: '#fff', border: 'none',
                    borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>Go to Club Lobby</button>
                  {['waiting', 'running'].includes(t.status) && (t.current_players || 0) === 0 && (
                    <button onClick={() => handleCloseTable(t.id)} style={{
                      padding: '6px 14px', background: confirmAction?.key === `close-table-${t.id}` ? '#991b1b' : FB.red, color: '#fff', border: 'none',
                      borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>{confirmAction?.key === `close-table-${t.id}` ? 'Confirm Close?' : 'Close Table'}</button>
                  )}
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* ═══ CREATE TOURNAMENT MODAL ═══ */}
      {showCreateTournament && (
        <CreateTournamentModal
          unionId={unionId} clubs={clubs}
          onClose={() => setShowCreateTournament(false)}
          onCreated={() => { setShowCreateTournament(false); showToast('Tournament created'); loadData(); }}
        />
      )}

      {/* ═══ CREATE TABLE MODAL ═══ */}
      {showCreateTable && (
        <CreateTableModal
          unionId={unionId} clubs={clubs}
          onClose={() => setShowCreateTable(false)}
          onCreated={() => { setShowCreateTable(false); showToast('Table created'); loadData(); }}
        />
      )}

      {/* ═══ TOURNAMENT DETAIL MODAL ═══ */}
      {selectedTournament && (
        <TournamentDetailModal
          t={selectedTournament} unionId={unionId} clubs={clubs}
          onClose={() => setSelectedTournament(null)}
          onAction={(msg) => { setSelectedTournament(null); if (msg) showToast(msg); loadData(); }}
        />
      )}

      {/* Union Bottom Navigation */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
        background: '#242526', borderTop: '1px solid #3E4042',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '6px 0' }}>
          {[
            { label: 'Club Arena', emoji: '🏠', href: '/hub/club-arena' },
            { label: 'Dashboard', emoji: '🏛', href: `/hub/club-arena/union-dashboard?union=${unionId}` },
            { label: 'Games', emoji: '🎮', href: null, active: true },
          ].map(item => (
            item.href ? (
              <a key={item.label} href={item.href} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                flex: 1, padding: '8px 4px', textDecoration: 'none',
                color: '#B0B3B8',
              }}>
                <span style={{ fontSize: 20 }}>{item.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
              </a>
            ) : (
              <div key={item.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                flex: 1, padding: '8px 4px', color: '#2374E1', cursor: 'default',
              }}>
                <span style={{ fontSize: 20 }}>{item.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
              </div>
            )
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CREATE TOURNAMENT MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function CreateTournamentModal({ unionId, clubs, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', type: 'xmtt', variant: 'nlh', buyIn: 100,
    startingChips: 10000, maxPlayers: 200, lateRegLevels: 6,
    rebuyEnabled: false, rebuyLevels: 4, addonEnabled: false,
    guaranteedPrize: 0, scheduledStart: '', hostClubId: clubs[0]?.id || '',
    selectedClubs: clubs.map(c => c.id),
  });
  const [saving, setSaving] = useState(false);

  // Auto-add host club to participating clubs when host changes
  // Use fully functional update so we don't need form.selectedClubs in deps
  useEffect(() => {
    if (!form.hostClubId) return;
    setForm(p => {
      if (p.selectedClubs.includes(p.hostClubId)) return p;
      return { ...p, selectedClubs: [...p.selectedClubs, p.hostClubId] };
    });
  }, [form.hostClubId]);

  const [saveError, setSaveError] = useState(null);

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError('Tournament name required'); return; }
    if (!form.hostClubId) { setSaveError('Select a host club'); return; }
    setSaveError(null);
    setSaving(true);
    try {
      await api('create_tournament', {
        unionId,
        hostClubId: form.hostClubId,
        name: form.name,
        type: form.type,
        variant: form.variant,
        buyIn: form.buyIn,
        startingChips: form.startingChips,
        maxPlayers: form.maxPlayers,
        lateRegLevels: form.lateRegLevels,
        rebuyEnabled: form.rebuyEnabled,
        rebuyLevels: form.rebuyLevels,
        addonEnabled: form.addonEnabled,
        guaranteedPrize: form.guaranteedPrize,
        scheduledStart: form.scheduledStart || null,
        participatingClubIds: form.selectedClubs,
      });
      onCreated();
    } catch (e) {
      setSaveError(e.message || 'Failed to create tournament');
    } finally {
      setSaving(false);
    }
  };

  const toggleClub = (id) => {
    // Prevent deselecting the host club
    if (id === form.hostClubId) return;
    setForm(p => ({
      ...p,
      selectedClubs: p.selectedClubs.includes(id)
        ? p.selectedClubs.filter(c => c !== id)
        : [...p.selectedClubs, id],
    }));
  };

  const F = (label, key, type = 'text', opts = {}) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, color: FB.dim, marginBottom: 3 }}>{label}</label>
      {type === 'select' ? (
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          style={{ width: '100%', padding: 8, background: FB.bg, color: FB.text, border: `1px solid ${FB.border}`, borderRadius: 6, fontSize: 13 }}>
          {opts.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'checkbox' ? (
        <input type="checkbox" checked={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
          style={{ width: '100%', padding: 8, background: FB.bg, color: FB.text, border: `1px solid ${FB.border}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          {...opts} />
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: FB.card, borderRadius: 16, padding: 24, width: 440, maxHeight: '85vh',
        overflow: 'auto', border: `1px solid ${FB.border}`,
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Create Union Tournament</h2>

        {F('Tournament Name', 'name')}
        {F('Type', 'type', 'select', {
          options: [
            { value: 'xmtt', label: 'XMTT (Cross-Club MTT)' },
            { value: 'mtt', label: 'MTT (Single Club)' },
            { value: 'sng', label: 'Sit & Go' },
          ]
        })}
        {F('Host Club', 'hostClubId', 'select', {
          options: clubs.map(c => ({ value: c.id, label: c.name })),
        })}
        {F('Variant', 'variant', 'select', {
          options: [
            { value: 'nlh', label: "NL Hold'em" }, { value: 'plo4', label: 'PLO4' },
            { value: 'plo5', label: 'PLO5' }, { value: 'short_deck', label: 'Short Deck' },
          ]
        })}
        {F('Buy-in', 'buyIn', 'number')}
        {F('Starting Chips', 'startingChips', 'number')}
        {F('Max Players', 'maxPlayers', 'number')}
        {(form.type === 'mtt' || form.type === 'xmtt') && F('Late Registration (levels)', 'lateRegLevels', 'number')}
        {F('Guaranteed Prize Pool', 'guaranteedPrize', 'number')}
        {(form.type === 'mtt' || form.type === 'xmtt') && F('Scheduled Start', 'scheduledStart', 'datetime-local')}

        <div style={{ display: 'flex', gap: 16, marginTop: 8, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: FB.dim }}>
            <input type="checkbox" checked={form.rebuyEnabled} onChange={e => setForm(p => ({ ...p, rebuyEnabled: e.target.checked }))} />
            Rebuys
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: FB.dim }}>
            <input type="checkbox" checked={form.addonEnabled} onChange={e => setForm(p => ({ ...p, addonEnabled: e.target.checked }))} />
            Add-on
          </label>
        </div>

        {form.rebuyEnabled && F('Rebuy Levels (how many levels rebuys are open)', 'rebuyLevels', 'number', { min: 1 })}

        {/* Participating Clubs */}
        {form.type === 'xmtt' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: FB.dim, marginBottom: 6 }}>
              Participating Clubs ({form.selectedClubs.length})
            </label>
            <div style={{
              background: FB.bg, borderRadius: 8, padding: 8,
              border: `1px solid ${FB.border}`, maxHeight: 150, overflow: 'auto',
            }}>
              {clubs.map(c => (
                <div key={c.id} onClick={() => toggleClub(c.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 6, cursor: 'pointer', marginTop: 2,
                  background: form.selectedClubs.includes(c.id) ? FB.green + '20' : 'transparent',
                }}>
                  <span style={{ fontSize: 15 }}>{form.selectedClubs.includes(c.id) ? '' : '⬜'}</span>
                  {c.logo_url && <img src={c.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }}  loading="lazy" />}
                  <span style={{ fontSize: 13, color: FB.text }}>{c.name}</span>
                  {c.id === form.hostClubId && <span style={{ fontSize: 10, color: FB.gold, fontWeight: 700 }}>HOST</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {saveError && (
          <div style={{ background: 'rgba(250,56,62,0.12)', border: '1px solid rgba(250,56,62,0.3)', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 12, color: '#FA383E' }}>
            {saveError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: FB.border, color: FB.text, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: 10, background: FB.green, color: '#fff', border: 'none',
            borderRadius: 8, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1,
          }}>{saving ? 'Creating...' : 'Create Tournament'}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CREATE TABLE MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function CreateTableModal({ unionId, clubs, onClose, onCreated }) {
  const [form, setForm] = useState({
    clubId: clubs[0]?.id || '', tableName: '', gameVariant: 'nlh',
    smallBlind: 1, bigBlind: 2, ante: 0,
    minBuyIn: 80, maxBuyIn: 400, maxPlayers: 9,
    actionTime: 30, rakePercent: 5, rakeCap: 3,
  });
  const [saving, setSaving] = useState(false);

  // Auto-calculate buy-in range when blinds change
  useEffect(() => {
    const bb = parseFloat(form.bigBlind) || 2;
    setForm(p => ({
      ...p,
      minBuyIn: bb * 40,
      maxBuyIn: bb * 200,
      tableName: p.tableName || '',
    }));
  }, [form.bigBlind]);

  const [saveError, setSaveError] = useState(null);

  const handleSave = async () => {
    if (!form.clubId) { setSaveError('Select a club'); return; }
    setSaveError(null);
    setSaving(true);
    try {
      await api('create_table', { unionId, ...form });
      onCreated();
    } catch (e) {
      setSaveError(e.message || 'Failed to create table');
    } finally {
      setSaving(false);
    }
  };

  const F = (label, key, type = 'text', opts = {}) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, color: FB.dim, marginBottom: 3 }}>{label}</label>
      {type === 'select' ? (
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          style={{ width: '100%', padding: 8, background: FB.bg, color: FB.text, border: `1px solid ${FB.border}`, borderRadius: 6, fontSize: 13 }}>
          {opts.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
          style={{ width: '100%', padding: 8, background: FB.bg, color: FB.text, border: `1px solid ${FB.border}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          {...opts} />
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: FB.card, borderRadius: 16, padding: 24, width: 420, maxHeight: '85vh',
        overflow: 'auto', border: `1px solid ${FB.border}`,
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Create Cash Table</h2>

        {F('Club', 'clubId', 'select', { options: clubs.map(c => ({ value: c.id, label: c.name })) })}
        {F('Table Name (optional)', 'tableName')}
        {F('Game', 'gameVariant', 'select', {
          options: [
            { value: 'nlh', label: "NL Hold'em" }, { value: 'plo4', label: 'PLO4' },
            { value: 'plo5', label: 'PLO5' }, { value: 'plo6', label: 'PLO6' },
            { value: 'plo8', label: 'PLO Hi/Lo' }, { value: 'short_deck', label: 'Short Deck' },
          ]
        })}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {F('Small-Blind', 'smallBlind', 'number')}
          {F('Big-Blind', 'bigBlind', 'number')}
        </div>
        {F('Ante', 'ante', 'number')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {F('Min Buy-in', 'minBuyIn', 'number')}
          {F('Max Buy-in', 'maxBuyIn', 'number')}
        </div>
        {F('Max Players', 'maxPlayers', 'select', {
          options: [
            { value: 2, label: '2 (Heads Up)' }, { value: 6, label: '6-Max' },
            { value: 8, label: '8-Max' }, { value: 9, label: '9-Max (Full Ring)' },
            { value: 10, label: '10-Max' },
          ]
        })}
        {F('Action Time (seconds)', 'actionTime', 'number')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {F('Rake %', 'rakePercent', 'number')}
          {F('Rake Cap (BB)', 'rakeCap', 'number')}
        </div>

        {saveError && (
          <div style={{ background: 'rgba(250,56,62,0.12)', border: '1px solid rgba(250,56,62,0.3)', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 12, color: '#FA383E' }}>
            {saveError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: FB.border, color: FB.text, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: 10, background: FB.primary, color: '#fff', border: 'none',
            borderRadius: 8, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1,
          }}>{saving ? 'Creating...' : 'Create Table'}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TOURNAMENT DETAIL MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function TournamentDetailModal({ t, unionId, clubs, onClose, onAction }) {
  const [regs, setRegs] = useState([]);
  const [tourneyState, setTourneyState] = useState(null);
  const [actionProcessing, setActionProcessing] = useState(null);
  const [confirmKey, setConfirmKey] = useState(null);

  const handleTournamentAction = async (action, label) => {
    const key = `${action}-${t.id}`;
    if (confirmKey !== key) {
      setConfirmKey(key);
      setTimeout(() => setConfirmKey(c => c === key ? null : c), 4000);
      return;
    }
    setConfirmKey(null);
    setActionProcessing(action);
    try {
      const res = await api(action, { unionId, tournamentId: t.id });
      onAction(res.message || `${label} successful`);
    } catch (e) {
      // Surface error inside modal
      alert(e.message || `Failed: ${label}`);
    } finally {
      setActionProcessing(null);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Use union-games API (service role) — avoids anon-client RLS dependency
        const res = await api('get_tournament_details', { unionId, tournamentId: t.id });
        if (active && res.success) {
          setRegs(res.registrations || []);
        }
      } catch (e) {
        if (active) console.error('[TournamentDetail] regs fetch:', e);
      }
    })();
    return () => { active = false; };
  }, [t.id, unionId]);

  // Subscribe to tournament channel for live state (replaces 5s HTTP poll)
  useEffect(() => {
    const liveEvents = [
      'player_registered', 'player_unregistered', 'player_seated',
      'player_busted', 'player_eliminated', 'player_moved',
      'player_rebuy', 'player_addon',
      'tournament_started', 'level_change', 'break_started', 'break_ended',
      'tournament_complete', 'victory',
    ];
    const tCh = supabase.channel(`union-tournament:${t.id}`);
    for (const evt of liveEvents) {
      tCh.on('broadcast', { event: evt }, (payload) => {
        setTourneyState(prev => ({ ...prev, ...payload.payload, _lastEvent: evt }));
      });
    }
    tCh.on('system', {}, (status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[UnionTournament] Channel error:', status);
      }
    });
    tCh.subscribe((status) => {
      if (status !== 'SUBSCRIBED') {
        console.warn(`[UnionTournament] Broadcast channel ${t.id} status: ${status}`);
      }
    });

    // DB fallback: postgres_changes on club_tournaments keeps status/level in sync
    const dbCh = supabase
      .channel(`union-tournament-db:${t.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'club_tournaments',
        filter: `id=eq.${t.id}`,
      }, (payload) => {
        setTourneyState(prev => ({ ...prev, ...payload.new }));
      })
      .on('system', {}, (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[UnionTournament] Postgres channel error:', status);
        }
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn(`[UnionTournament] Postgres channel ${t.id} status: ${status}`);
        }
      });

    return () => {
      supabase.removeChannel(tCh);
      supabase.removeChannel(dbCh);
    };
  }, [t.id, t.status]);

  const rows = [
    ['Type', `${(t.game_type || 'nlhe').toUpperCase()} / ${(t.settings?.tournamentType || 'MTT').toUpperCase()}`],
    ['Buy-in', Number(t.buy_in).toLocaleString()],
    ['Starting Chips', Number(t.starting_chips).toLocaleString()],
    ['Players', `${t.registered_count}/${t.max_players}`],
    ['Prize Pool', Math.max(Number(t.prize_pool), Number(t.guaranteed_prize)).toLocaleString()],
    ['Late Reg', t.late_reg_levels ? `${t.late_reg_levels} levels` : 'No'],
    ['Rebuys', t.rebuy_enabled ? `Yes (${t.rebuy_levels} levels)` : 'No'],
    ['Add-on', t.addon_enabled ? 'Yes' : 'No'],
    ['Status', t.status?.replace(/_/g, ' ')?.toUpperCase()],
  ];

  if (t.settings?.clubIds?.length > 1) {
    rows.push(['Clubs', `${t.settings.clubIds.length} participating`]);
  }
  if (t.start_time) {
    rows.push(['Scheduled', new Date(t.start_time).toLocaleString()]);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: FB.card, borderRadius: 16, padding: 24, width: 440, maxHeight: '85vh',
        overflow: 'auto', border: `1px solid ${FB.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t.name}</h2>
          <span style={{
            background: STATUS_COLORS[t.status] || FB.dim, color: '#fff', fontSize: 10,
            fontWeight: 700, padding: '3px 10px', borderRadius: 4, textTransform: 'uppercase',
          }}>{t.status?.replace(/_/g, ' ')}</span>
        </div>
        {/* Info table */}
        <div style={{ background: FB.bg, borderRadius: 8, padding: 12, marginBottom: 16 }}>
          {rows.map(([k, v], i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', padding: '4px 0',
              borderBottom: i < rows.length - 1 ? `1px solid ${FB.border}` : 'none',
              fontSize: 13,
            }}>
              <span style={{ color: FB.dim }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Live HUD for running tournaments */}
        {tourneyState && ['running', 'late_reg', 'break', 'paused', 'final_table'].includes(t.status) && (
          <div style={{ background: '#1a2332', borderRadius: 10, padding: 14, marginBottom: 16, border: '1px solid #2d4a6f' }}>
            <div style={{ fontSize: 12, color: FB.gold, fontWeight: 700, marginBottom: 8 }}>LIVE — Engine State</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
              <div><span style={{ color: FB.dim }}>Level:</span> <strong>{tourneyState.currentLevel}</strong></div>
              <div><span style={{ color: FB.dim }}>Blinds:</span> <strong>{tourneyState.blinds?.smallBlind}/{tourneyState.blinds?.bigBlind}{tourneyState.blinds?.ante ? ` (${tourneyState.blinds.ante})` : ''}</strong></div>
              <div><span style={{ color: FB.dim }}>Players:</span> <strong style={{ color: FB.green }}>{tourneyState.playersRemaining}/{tourneyState.totalEntries}</strong></div>
              <div><span style={{ color: FB.dim }}>Avg Stack:</span> <strong>{(tourneyState.averageStack || 0).toLocaleString()}</strong></div>
              <div><span style={{ color: FB.dim }}>Prize Pool:</span> <strong style={{ color: FB.gold }}>{(tourneyState.prizePool || 0).toLocaleString()}</strong></div>
              <div><span style={{ color: FB.dim }}>Tables:</span> <strong>{tourneyState.tablesActive}</strong></div>
              {tourneyState.lateRegOpen && <div style={{ gridColumn: '1 / -1', color: FB.teal, fontWeight: 700 }}>Late Registration OPEN</div>}
              {tourneyState.levelTimeRemaining > 0 && (
                <div><span style={{ color: FB.dim }}>Next Level:</span> <strong>{Math.ceil(tourneyState.levelTimeRemaining / 60)}m</strong></div>
              )}
              {tourneyState.totalRebuys > 0 && <div><span style={{ color: FB.dim }}>Rebuys:</span> <strong>{tourneyState.totalRebuys}</strong></div>}
              {tourneyState.totalAddons > 0 && <div><span style={{ color: FB.dim }}>Add-ons:</span> <strong>{tourneyState.totalAddons}</strong></div>}
            </div>
            {/* Table breakdown */}
            {tourneyState.tables?.length > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid #2d4a6f', paddingTop: 8 }}>
                <div style={{ fontSize: 11, color: FB.dim, marginBottom: 4 }}>Tables ({tourneyState.tables.length})</div>
                {tourneyState.tables.map((tbl, i) => (
                  <div key={i} style={{ fontSize: 11, color: FB.text, padding: '2px 0' }}>
                    Table {i + 1}: {tbl.players?.length || 0} players {tbl.handInProgress ? '🃏' : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Registered players */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: FB.dim, marginBottom: 6 }}>Registered Players ({regs.length})</div>
          {regs.length === 0 && <div style={{ fontSize: 12, color: FB.dim }}>No players registered yet</div>}
          <div style={{ background: FB.bg, borderRadius: 8, padding: 8, maxHeight: 200, overflow: 'auto' }}>
            {(() => {
              const clubMap = {};
              (clubs || []).forEach(c => { clubMap[c.id] = c.name; });
              return regs.slice(0, 30).map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: FB.text, padding: '3px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.display_name || r.user_id.slice(0, 8)}{r.club_id && clubMap[r.club_id] ? ` (${clubMap[r.club_id]})` : ''}</span>
                  <span style={{ color: FB.dim }}>{r.status}{r.finish_position ? ` — #${r.finish_position}` : ''}</span>
                </div>
              ));
            })()}
            {regs.length > 30 && <div style={{ fontSize: 11, color: FB.dim }}>+{regs.length - 30} more</div>}
          </div>
        </div>

        {/* Admin Actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {/* Pause — running/late_reg/final_table */}
          {['running', 'late_reg', 'break', 'final_table'].includes(t.status) && (
            <button
              disabled={!!actionProcessing}
              onClick={() => handleTournamentAction('pause_tournament', 'Pause')}
              style={{
                flex: 1, padding: '9px 0', background: confirmKey === `pause_tournament-${t.id}` ? '#d97706' : '#eab308',
                color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: actionProcessing ? 0.5 : 1,
              }}>
              {actionProcessing === 'pause_tournament' ? 'Pausing...' : confirmKey === `pause_tournament-${t.id}` ? 'Confirm Pause?' : '⏸ Pause'}
            </button>
          )}
          {/* Resume — paused only */}
          {t.status === 'paused' && (
            <button
              disabled={!!actionProcessing}
              onClick={() => handleTournamentAction('resume_tournament', 'Resume')}
              style={{
                flex: 1, padding: '9px 0', background: FB.teal,
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: actionProcessing ? 0.5 : 1,
              }}>
              {actionProcessing === 'resume_tournament' ? 'Resuming...' : '▶ Resume'}
            </button>
          )}
          {/* Cancel — scheduled/registering/paused */}
          {['scheduled', 'registering', 'paused', 'running', 'late_reg'].includes(t.status) && (
            <button
              disabled={!!actionProcessing}
              onClick={() => handleTournamentAction('cancel_tournament', 'Cancel')}
              style={{
                flex: 1, padding: '9px 0',
                background: confirmKey === `cancel_tournament-${t.id}` ? '#991b1b' : FB.red,
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: actionProcessing ? 0.5 : 1,
              }}>
              {actionProcessing === 'cancel_tournament' ? 'Cancelling...' : confirmKey === `cancel_tournament-${t.id}` ? 'Confirm Cancel?' : '✕ Cancel'}
            </button>
          )}
        </div>

        <button onClick={onClose} style={{
          width: '100%', padding: 10, background: FB.border, color: FB.text,
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
        }}>Close</button>
      </div>
    </div>
  );
}
