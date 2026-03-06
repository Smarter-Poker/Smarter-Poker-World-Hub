/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Union Games | Tournaments & Cash Games
   Facebook Dark Theme | Union-Level Tournament + Cash Table Management
   ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';

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

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
};

const api = async (action, params) => {
  const token = await getToken();
  const res = await fetch('/api/club-arena/union-games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...params }),
  });
  return res.json();
};

export default function UnionGames() {
  const router = useRouter();
  const unionId = router.query?.union || null;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tournaments');
  const [subTab, setSubTab] = useState('upcoming');
  const [tableFilter, setTableFilter] = useState('active');

  // Data
  const [tournaments, setTournaments] = useState([]);
  const [tables, setTables] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [unionInfo, setUnionInfo] = useState(null);
  const [toast, setToast] = useState(null);

  // Modals
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
      else router.push('/auth/login');
    });
  }, []);

  // Load union info
  useEffect(() => {
    if (!unionId || !user) return;
    (async () => {
      const token = await getToken();
      const res = await fetch(`/api/club-arena/union-dashboard?unionId=${unionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (d.union) setUnionInfo(d.union);
    })();
  }, [unionId, user]);

  const loadTournaments = useCallback(async () => {
    const controller = new AbortController();
    const { signal } = controller;
    if (!unionId) return;
    const statusMap = {
      upcoming: ['scheduled', 'registering', 'late_reg'],
      running: ['running', 'late_reg', 'break', 'paused', 'final_table'],
      past: ['complete', 'cancelled'],
    };
    const res = await api('list_tournaments', { unionId, status: statusMap[subTab] });
    if (res.success) {
      setTournaments(res.tournaments || []);
      if (res.clubs?.length) setClubs(res.clubs);
    }
  }, [unionId, subTab]);

  const loadTables = useCallback(async () => {
    const controller = new AbortController();
    const { signal } = controller;
    if (!unionId) return;
    const res = await api('list_tables', { unionId });
    if (res.success) {
      const all = res.tables || [];
      if (tableFilter === 'active') setTables(all.filter(t => ['waiting', 'running'].includes(t.status)));
      else if (tableFilter === 'closed') setTables(all.filter(t => t.status === 'closed'));
      else setTables(all);
      if (res.clubs?.length) setClubs(res.clubs);
    }
  }, [unionId, tableFilter]);

  const loadData = useCallback(async () => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    if (tab === 'tournaments') await loadTournaments();
    else await loadTables();
    setLoading(false);
  }, [tab, loadTournaments, loadTables]);

  useEffect(() => { if (user && unionId) loadData(); }, [user, unionId, loadData]);

  // ── Realtime subscriptions for live updates ──
  useEffect(() => {
    if (!unionId || !user || clubs.length === 0) return;
    const clubIds = clubs.map(c => c.id);

    // Subscribe to tournament changes across all union clubs
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
      .subscribe();

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
      .subscribe();

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
  }, [unionId, user, clubs, tab, loadTournaments, loadTables]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleStartTournament = async (id) => {
    if (!confirm('Start this tournament? All registered players will be seated.')) return;
    const res = await api('start_tournament', { unionId, tournamentId: id });
    if (res.success) { showToast(`Tournament started with ${res.players} players`); loadData(); }
    else showToast(res.error || 'Failed', 'error');
  };

  const handleCancelTournament = async (id) => {
    if (!confirm('Cancel this tournament? All players will be refunded.')) return;
    const res = await api('cancel_tournament', { unionId, tournamentId: id });
    if (res.success) { showToast(`Cancelled — ${res.refunded} players refunded`); loadData(); }
    else showToast(res.error || 'Failed', 'error');
  };

  const handleOpenRegistration = async (id) => {
    const res = await api('open_registration', { unionId, tournamentId: id });
    if (res.success) { showToast('Registration opened'); loadData(); }
    else showToast(res.error || 'Failed', 'error');
  };

  const handleCloseTable = async (id) => {
    if (!confirm('Close this table?')) return;
    const res = await api('close_table', { unionId, tableId: id });
    if (res.success) { showToast('Table closed'); loadData(); }
    else showToast(res.error || 'Failed', 'error');
  };

  if (!user) return null;

  return (
    <div style={{ background: FB.bg, minHeight: '100vh', color: FB.text }}>
      <SEOHead title={`Games | ${unionInfo?.name || 'Union'}`} />

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
          <button key={t.id} onClick={() => { setTab(t.id); }}
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
            <button key={f} onClick={() => setSubTab(f)}
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
          <div style={{ textAlign: 'center', padding: 40, color: FB.dim }}>Loading...</div>
        ) : tab === 'tournaments' ? (
          /* ═══ TOURNAMENTS LIST ═══ */
          tournaments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: FB.dim }}>
              No {subTab} tournaments. {subTab === 'upcoming' && 'Create one to get started!'}
            </div>
          ) : (
            tournaments.map(t => (
              <div key={t.id} onClick={() => setSelectedTournament(t)} style={{
                background: FB.card, borderRadius: 12, padding: 16, marginTop: 12,
                border: `1px solid ${FB.border}`, cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                    {t.settings?.isUnionTournament && (
                      <span style={{ marginLeft: 8, fontSize: 10, background: FB.purple, color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>UNION</span>
                    )}
                  </div>
                  <span style={{
                    background: STATUS_COLORS[t.status] || FB.dim, color: '#fff', fontSize: 10,
                    fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                  }}>{t.status?.replace('_', ' ')}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: FB.dim, flexWrap: 'wrap' }}>
                  <span> {t.clubs?.name || 'Unknown Club'}</span>
                  <span> {t.variant?.toUpperCase()} {t.type?.toUpperCase()}</span>
                  <span> {Number(t.buy_in).toLocaleString()}</span>
                  <span> {t.registered_count}/{t.max_players}</span>
                  <span> {Math.max(Number(t.prize_pool), Number(t.guaranteed_prize)).toLocaleString()}{Number(t.guaranteed_prize) > Number(t.prize_pool) ? ' GTD' : ''}</span>
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
                        padding: '6px 14px', background: FB.orange, color: '#fff', border: 'none',
                        borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>Start Now</button>
                    )}
                    <button onClick={() => handleCancelTournament(t.id)} style={{
                      padding: '6px 14px', background: FB.red, color: '#fff', border: 'none',
                      borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          /* ═══ CASH GAMES LIST ═══ */
          tables.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: FB.dim }}>
              No {tableFilter} tables. Create one to get started!
            </div>
          ) : (
            tables.map(t => (
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
                  <span> {t.clubs?.name || 'Unknown'}</span>
                  <span> {t.game_variant?.toUpperCase() || 'NLH'}</span>
                  <span> {t.small_blind}/{t.big_blind}</span>
                  <span> {t.current_players || 0}/{t.max_players}</span>
                  <span>🃏 Buy-in: {t.min_buy_in}-{t.max_buy_in}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => router.push(`/hub/club-arena/lobby?club=${t.club_id}`)} style={{
                    padding: '6px 14px', background: FB.primary, color: '#fff', border: 'none',
                    borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>Go to Club Lobby</button>
                  {['waiting', 'running'].includes(t.status) && (t.current_players || 0) === 0 && (
                    <button onClick={() => handleCloseTable(t.id)} style={{
                      padding: '6px 14px', background: FB.red, color: '#fff', border: 'none',
                      borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>Close Table</button>
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
          onAction={() => { setSelectedTournament(null); loadData(); }}
        />
      )}
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
  useEffect(() => {
    if (form.hostClubId && !form.selectedClubs.includes(form.hostClubId)) {
      setForm(p => ({ ...p, selectedClubs: [...p.selectedClubs, p.hostClubId] }));
    }
  }, [form.hostClubId]);

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Tournament name required');
    if (!form.hostClubId) return alert('Select a host club');
    setSaving(true);
    const res = await api('create_tournament', {
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
    setSaving(false);
    if (res.success) onCreated();
    else alert(res.error || 'Failed');
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
                  {c.logo_url && <img src={c.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />}
                  <span style={{ fontSize: 13, color: FB.text }}>{c.name}</span>
                  {c.id === form.hostClubId && <span style={{ fontSize: 10, color: FB.gold, fontWeight: 700 }}>HOST</span>}
                </div>
              ))}
            </div>
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

  const handleSave = async () => {
    if (!form.clubId) return alert('Select a club');
    setSaving(true);
    const res = await api('create_table', { unionId, ...form });
    setSaving(false);
    if (res.success) onCreated();
    else alert(res.error || 'Failed');
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
          {F('Small Blind', 'smallBlind', 'number')}
          {F('Big Blind', 'bigBlind', 'number')}
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('tournament_registrations')
        .select('user_id, display_name, club_id, status, registered_at, finish_position, payout_amount')
        .eq('tournament_id', t.id)
        .in('status', ['registered', 'playing', 'eliminated', 'winner'])
        .order('registered_at');
      setRegs(data || []);
    })();
  }, [t.id]);

  // Poll engine state for running tournaments
  useEffect(() => {
    if (!['running', 'late_reg', 'break', 'paused', 'final_table'].includes(t.status)) return;
    let active = true;
    const poll = async () => {
      const controller = new AbortController();
      const { signal } = controller;
      try {
        const token = await getToken();
        const res = await fetch('/api/poker/engine/tournament', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'state', tournamentId: t.id }),
        });
        const data = await res.json();
        if (active && data.success !== false) setTourneyState(data);
      } catch (e) { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [t.id, t.status]);

  const rows = [
    ['Type', `${t.variant?.toUpperCase()} ${t.type?.toUpperCase()}`],
    ['Buy-in', Number(t.buy_in).toLocaleString()],
    ['Starting Chips', Number(t.starting_chips).toLocaleString()],
    ['Players', `${t.registered_count}/${t.max_players}`],
    ['Prize Pool', Math.max(Number(t.prize_pool), Number(t.guaranteed_prize)).toLocaleString()],
    ['Late Reg', t.late_reg_levels ? `${t.late_reg_levels} levels` : 'No'],
    ['Rebuys', t.rebuy_enabled ? `Yes (${t.rebuy_levels} levels)` : 'No'],
    ['Add-on', t.addon_enabled ? 'Yes' : 'No'],
    ['Status', t.status?.replace('_', ' ')?.toUpperCase()],
  ];

  if (t.settings?.clubIds?.length > 1) {
    rows.push(['Clubs', `${t.settings.clubIds.length} participating`]);
  }
  if (t.scheduled_start) {
    rows.push(['Scheduled', new Date(t.scheduled_start).toLocaleString()]);
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
          }}>{t.status?.replace('_', ' ')}</span>
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

        <button onClick={onClose} style={{
          width: '100%', padding: 10, background: FB.border, color: FB.text,
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
        }}>Close</button>
      </div>
    </div>
  );
}
