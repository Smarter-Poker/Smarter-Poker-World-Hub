/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Tournaments Page
   Create, browse, register for, and manage club tournaments
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { supabase } from '../../../src/lib/supabase';

const FB = {
  bg: '#18191A', card: '#242526', text: '#E4E6EB', dim: '#B0B3B8',
  border: '#3E4042', primary: '#2374E1', green: '#31A24C', danger: '#FA383E',
  gold: '#FFD700', hover: '#3A3B3C',
};

const TYPE_LABELS = { mtt: 'MTT', sng: 'Sit & Go', spin: 'Spin & Go', xmtt: 'XMTT' };
const STATUS_COLORS = {
  scheduled: '#2374E1', registering: '#31A24C', running: '#ea580c',
  paused: '#eab308', final_table: '#9333ea', complete: '#6b7280', cancelled: '#dc2626',
};

// BUG #148 FIX: supabase.auth.session?.() is v1 API — returns undefined in v2.
// Migrated to async getSession() so tournament API calls include a valid token.
async function api(action, params) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch('/api/club-arena/tournaments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...params }),
  }).then(r => r.json());
}

export default function TournamentsPage() {
  const router = useRouter();
  if (!router.isReady) return null;
  const { club: clubId } = router.query;

  const [user, setUser] = useState(null);
  const [clubInfo, setClubInfo] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [tab, setTab] = useState('upcoming'); // upcoming | running | past
  const [chipBalance, setChipBalance] = useState(0);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
      else router.push('/auth/login');
    });
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    if (!clubId || !user) return;
    setLoading(true);

    // Club info + role
    const { data: member } = await supabase
      .from('club_members')
      .select('role, chip_balance, clubs(name, avatar_url)')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .single();

    if (member) {
      setClubInfo(member.clubs);
      setIsAdmin(['owner', 'admin', 'manager'].includes(member.role));
      setChipBalance(member.chip_balance || 0);
    }

    // Status filter based on tab
    const statusMap = {
      upcoming: ['scheduled', 'registering'],
      running: ['running', 'paused', 'final_table'],
      past: ['complete', 'cancelled'],
    };

    const res = await api('list', { clubId, status: statusMap[tab] });
    if (res.success) setTournaments(res.tournaments || []);
    setLoading(false);
  }, [clubId, user, tab]);

  // Deep Bug Hunt Parity Fix: 100% real-time saving and UI updates
  useEffect(() => {
    loadData();

    if (!clubId) return;

    // Listen to changes on club_tournaments to instantly refresh the list
    // when AI horses or humans register (registered_count updates)
    const channel = supabase.channel(`tournaments_list_${clubId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'club_tournaments',
        filter: `club_id=eq.${clubId}`
      }, () => {
        // We use a slight delay so rapid burst AI registrations don't spam the API
        setTimeout(() => loadData(), 500);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, clubId]);

  // Register
  const handleRegister = async (tournamentId) => {
    const res = await api('register', { tournamentId });
    if (res.success) {
      loadData();
      setSelectedTournament(null);
    } else {
      alert(res.error || 'Registration failed');
    }
  };

  // Unregister
  const handleUnregister = async (tournamentId) => {
    if (!confirm('Unregister from this tournament? Buy-in will be refunded.')) return;
    const res = await api('unregister', { tournamentId });
    if (res.success) loadData();
    else alert(res.error);
  };

  if (!user) return null;

  return (
    <div style={{ background: FB.bg, minHeight: '100vh', color: FB.text }}>
      <SEOHead title={`Tournaments | ${clubInfo?.name || 'Club Arena'}`} />

      {/* Header */}
      <div style={{ background: FB.card, padding: '16px 24px', borderBottom: `1px solid ${FB.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubId}`)}
          style={{ background: 'none', border: 'none', color: FB.dim, cursor: 'pointer', fontSize: 20 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Tournaments</h1>
          <span style={{ color: FB.dim, fontSize: 13 }}>{clubInfo?.name} — Balance: {chipBalance.toLocaleString()} chips</span>
        </div>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} style={{
            background: FB.green, color: '#fff', border: 'none', padding: '8px 20px',
            borderRadius: 8, fontWeight: 700, cursor: 'pointer',
          }}>+ Create Tournament</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${FB.border}`, background: FB.card }}>
        {['upcoming', 'running', 'past'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
            background: tab === t ? FB.primary : 'transparent',
            color: tab === t ? '#fff' : FB.dim,
            fontWeight: tab === t ? 700 : 500, fontSize: 14,
          }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {/* Tournament List */}
      <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
        {loading && <div style={{ color: FB.dim, textAlign: 'center', padding: 40 }}>Loading...</div>}

        {!loading && tournaments.length === 0 && (
          <div style={{ color: FB.dim, textAlign: 'center', padding: 40 }}>
            No {tab} tournaments
          </div>
        )}

        {tournaments.map(t => (
          <div key={t.id} onClick={() => setSelectedTournament(t)} style={{
            background: FB.card, borderRadius: 12, padding: 16, marginBottom: 12,
            border: `1px solid ${FB.border}`, cursor: 'pointer',
            transition: 'background 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{
                background: STATUS_COLORS[t.status] || FB.dim,
                color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px',
                borderRadius: 4, textTransform: 'uppercase',
              }}>{t.status}</span>
              <span style={{
                background: FB.primary + '30', color: FB.primary,
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              }}>{TYPE_LABELS[t.type] || t.type}</span>
              <span style={{ color: FB.dim, fontSize: 12 }}>{t.variant?.toUpperCase()}</span>
            </div>

            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{t.name}</h3>

            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: FB.dim }}>
              <span>Buy-in: <strong style={{ color: FB.text }}>{Number(t.buy_in).toLocaleString()}</strong></span>
              <span>Players: <strong style={{ color: FB.text }}>{t.registered_count}/{t.max_players}</strong></span>
              <span>Prize Pool: <strong style={{ color: FB.gold }}>
                {Math.max(Number(t.prize_pool), Number(t.guaranteed_prize)).toLocaleString()}
                {Number(t.guaranteed_prize) >Number(t.prize_pool) ? ' GTD' : ''}
              </strong></span>
            </div>

            {t.scheduled_start && (
              <div style={{ fontSize: 12, color: FB.dim, marginTop: 4 }}>
                Starts: {new Date(t.scheduled_start).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Tournament Modal */}
      {showCreate && <CreateTournamentModal clubId={clubId} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadData(); }} />}

      {/* Tournament Detail Modal */}
      {selectedTournament && (
        <TournamentDetailModal
          tournament={selectedTournament}
          chipBalance={chipBalance}
          userId={user?.id}
          isAdmin={isAdmin}
          onRegister={handleRegister}
          onUnregister={handleUnregister}
          onClose={() => setSelectedTournament(null)}
          onStart={async () => {
            await api('start', { tournamentId: selectedTournament.id });
            loadData();
            setSelectedTournament(null);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CREATE TOURNAMENT MODAL
// ═══════════════════════════════════════════════════════
function CreateTournamentModal({ clubId, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', type: 'mtt', variant: 'nlh', buyIn: 100,
    startingChips: 10000, maxPlayers: 100, lateRegLevels: 6,
    rebuyEnabled: false, rebuyLevels: 4, addonEnabled: false,
    guaranteedPrize: 0, scheduledStart: '', sngSize: 6,
    xmttClubIds: [], // for XMTT: participating club UUIDs
  });
  const [saving, setSaving] = useState(false);
  const [sisterClubs, setSisterClubs] = useState([]);

  // Load sister clubs (same union) when XMTT selected
  useEffect(() => {
    if (form.type !== 'xmtt' || !clubId) return;
    (async () => {
      // Find this club's union
      const { data: uc } = await supabase
        .from('union_clubs')
        .select('union_id')
        .eq('club_id', clubId)
        .limit(1);
      if (!uc?.length) { setSisterClubs([]); return; }

      // Get all clubs in same union
      const { data: allUc } = await supabase
        .from('union_clubs')
        .select('club_id, clubs(id, name, avatar_url)')
        .eq('union_id', uc[0].union_id);

      const sisters = (allUc || [])
        .filter(u => u.club_id !== clubId && u.clubs)
        .map(u => ({ id: u.clubs.id, name: u.clubs.name, logo: u.clubs.avatar_url }));
      setSisterClubs(sisters);
      // Auto-select all sister clubs
      setForm(p => ({ ...p, xmttClubIds: sisters.map(s => s.id) }));
    })();
  }, [form.type, clubId]);

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Tournament name required');
    setSaving(true);
    const payload = { clubId, ...form };
    // For XMTT, include this club + selected clubs
    if (form.type === 'xmtt') {
      payload.settings = {
        ...(payload.settings || {}),
        clubIds: [clubId, ...form.xmttClubIds],
        isXmtt: true,
      };
    }
    const res = await api('create', payload);
    setSaving(false);
    if (res.success) onCreated();
    else alert(res.error || 'Failed to create');
  };

  const toggleXmttClub = (id) => {
    setForm(p => ({
      ...p,
      xmttClubIds: p.xmttClubIds.includes(id)
        ? p.xmttClubIds.filter(c => c !== id)
        : [...p.xmttClubIds, id],
    }));
  };

  const F = (label, key, type = 'text', opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: FB.dim, marginBottom: 4 }}>{label}</label>
      {type === 'select' ? (
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          style={{ width: '100%', padding: 8, background: FB.bg, color: FB.text, border: `1px solid ${FB.border}`, borderRadius: 6, fontSize: 14 }}>
          {opts.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'checkbox' ? (
        <input type="checkbox" checked={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
          style={{ width: '100%', padding: 8, background: FB.bg, color: FB.text, border: `1px solid ${FB.border}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
          {...opts} />
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: FB.card, borderRadius: 16, padding: 24, width: 420, maxHeight: '80vh',
        overflow: 'auto', border: `1px solid ${FB.border}`,
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Create Tournament</h2>

        {F('Tournament Name', 'name')}
        {F('Type', 'type', 'select', {
          options: [
            { value: 'mtt', label: 'MTT (Multi-Table)' },
            { value: 'sng', label: 'Sit & Go' },
            { value: 'spin', label: 'Spin & Go' },
            { value: 'xmtt', label: 'XMTT (Cross-Club)' },
          ]
        })}
        {F('Variant', 'variant', 'select', {
          options: [
            { value: 'nlh', label: "NL Hold'em" }, { value: 'plo4', label: 'PLO4' },
            { value: 'plo5', label: 'PLO5' }, { value: 'short_deck', label: 'Short Deck' },
            { value: 'pineapple', label: 'Crazy Pineapple' },
          ]
        })}
        {F('Buy-in', 'buyIn', 'number')}
        {F('Starting Chips', 'startingChips', 'number')}
        {(form.type === 'mtt' || form.type === 'xmtt') && F('Max Players', 'maxPlayers', 'number')}
        {form.type === 'sng' && F('Table Size', 'sngSize', 'number')}
        {(form.type === 'mtt' || form.type === 'xmtt') && F('Late Registration (levels)', 'lateRegLevels', 'number')}
        {F('Guaranteed Prize Pool', 'guaranteedPrize', 'number')}
        {(form.type === 'mtt' || form.type === 'xmtt') && F('Scheduled Start', 'scheduledStart', 'datetime-local')}

        {/* XMTT: Sister club selection */}
        {form.type === 'xmtt' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: FB.dim, marginBottom: 6 }}>
              Participating Clubs ({form.xmttClubIds.length + 1} clubs)
            </label>
            <div style={{
              background: FB.bg, borderRadius: 8, padding: 8,
              border: `1px solid ${FB.border}`, maxHeight: 160, overflow: 'auto',
            }}>
              {/* This club (always included) */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 6, background: FB.primary + '20',
              }}>
                <span style={{ fontSize: 16 }}></span>
                <span style={{ fontSize: 13, color: FB.text, fontWeight: 600 }}>This Club (host)</span>
              </div>
              {sisterClubs.length === 0 && (
                <div style={{ fontSize: 12, color: FB.dim, padding: '8px 8px 4px', textAlign: 'center' }}>
                  No sister clubs found. Your club must be part of a union for XMTT.
                </div>
              )}
              {sisterClubs.map(sc => (
                <div key={sc.id} onClick={() => toggleXmttClub(sc.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 6, cursor: 'pointer', marginTop: 4,
                  background: form.xmttClubIds.includes(sc.id) ? FB.green + '20' : 'transparent',
                }}>
                  <span style={{ fontSize: 16 }}>
                    {form.xmttClubIds.includes(sc.id) ? '' : '⬜'}
                  </span>
                  {sc.logo && <img src={sc.logo} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />}
                  <span style={{ fontSize: 13, color: FB.text }}>{sc.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: FB.border, color: FB.text, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: 10, background: FB.green, color: '#fff', border: 'none',
            borderRadius: 8, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1,
          }}>{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TOURNAMENT DETAIL MODAL
// ═══════════════════════════════════════════════════════
function TournamentDetailModal({ tournament: t, chipBalance, userId, isAdmin, onRegister, onUnregister, onClose, onStart }) {
  const router = useRouter();
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [tourneyState, setTourneyState] = useState(null);

  useEffect(() => {
    // Check if user is registered
    (async () => {
      const { data } = await supabase
        .from('tournament_registrations')
        .select('id')
        .eq('tournament_id', t.id)
        .eq('user_id', userId)
        .eq('status', 'registered')
        .single();
      setIsRegistered(!!data);
    })();
    // Load registrations
    (async () => {
      const { data } = await supabase
        .from('tournament_registrations')
        .select('user_id, status, registered_at, finish_position, payout_amount')
        .eq('tournament_id', t.id)
        .in('status', ['registered', 'playing', 'eliminated'])
        .order('registered_at');
      setRegistrations(data || []);
    })();
    // Poll tournament state if running
    if (['running', 'late_reg'].includes(t.status)) {
      const poll = async () => {
        try {
          const { data: { session: pollSession } } = await supabase.auth.getSession();
          const res = await fetch('/api/poker/engine/tournament', {
            method: 'POST', headers: {
              'Content-Type': 'application/json',
              ...(pollSession?.access_token ? { Authorization: `Bearer ${pollSession.access_token}` } : {}),
            },
            body: JSON.stringify({ action: 'state', tournamentId: t.id }),
          });
          const d = await res.json();
          if (d.success) setTourneyState(d);
        } catch (_) { }
      };
      poll();
      const iv = setInterval(poll, 5000);
      return () => clearInterval(iv);
    }
  }, [t.id, userId, t.status]);

  // Find user's assigned table
  const goToTable = async () => {
    try {
      const { data: { session: goSession } } = await supabase.auth.getSession();
      const res = await fetch('/api/poker/engine/tournament', {
        method: 'POST', headers: {
          'Content-Type': 'application/json',
          ...(goSession?.access_token ? { Authorization: `Bearer ${goSession.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'state', tournamentId: t.id }),
      });
      const d = await res.json();
      if (d.success && d.tables) {
        // Search all tables for the user's seat
        for (const tbl of d.tables) {
          const seated = tbl.players?.find(p =>String(p.playerId) === String(userId));
          if (seated) {
            router.push(`/hub/club-arena/table/${tbl.tableId}?tournament=${t.id}`);
            return;
          }
        }
      }
      alert('Could not find your table assignment. You may be eliminated or not yet seated.');
    } catch (e) {
      alert('Error finding table: ' + e.message);
    }
  };

  useEffect(() => {
    // Check if user is registered
    (async () => {
      const { data } = await supabase
        .from('tournament_registrations')
        .select('id')
        .eq('tournament_id', t.id)
        .eq('user_id', userId)
        .eq('status', 'registered')
        .single();
      setIsRegistered(!!data);
    })();
    // Load registrations
    (async () => {
      const { data } = await supabase
        .from('tournament_registrations')
        .select('user_id, status, registered_at, finish_position, payout_amount')
        .eq('tournament_id', t.id)
        .in('status', ['registered', 'playing', 'eliminated'])
        .order('registered_at');
      setRegistrations(data || []);
    })();
  }, [t.id, userId]);

  const canRegister = ['scheduled', 'registering'].includes(t.status) && !isRegistered && chipBalance >= t.buy_in;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: FB.card, borderRadius: 16, padding: 24, width: 480, maxHeight: '80vh',
        overflow: 'auto', border: `1px solid ${FB.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ background: STATUS_COLORS[t.status], color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>{t.status}</span>
          <span style={{ background: FB.primary + '30', color: FB.primary, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>{TYPE_LABELS[t.type]}</span>
        </div>

        <h2 style={{ margin: '0 0 16px' }}>{t.name}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[
            ['Variant', t.variant?.toUpperCase()],
            ['Buy-in', Number(t.buy_in).toLocaleString()],
            ['Starting Chips', Number(t.starting_chips).toLocaleString()],
            ['Players', `${t.registered_count}/${t.max_players}`],
            ['Prize Pool', Math.max(Number(t.prize_pool), Number(t.guaranteed_prize)).toLocaleString()],
            ['Late Reg', t.late_reg_levels ? `${t.late_reg_levels} levels` : 'No'],
            ['Rebuys', t.rebuy_enabled ? 'Yes' : 'No'],
            ['Add-on', t.addon_enabled ? 'Yes' : 'No'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: FB.dim }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Blind Structure Preview */}
        {t.blind_structure && t.blind_structure.length > 0 && (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', color: FB.dim, fontSize: 13 }}>Blind Structure ({t.blind_structure.length} levels)</summary>
            <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
              {t.blind_structure.map((lvl, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: '4px 8px', fontSize: 12,
                  background: lvl.isBreak ? FB.border : 'transparent',
                  color: lvl.isBreak ? FB.gold : FB.dim,
                }}>
                  {lvl.isBreak ? (
                    <span>— BREAK ({lvl.duration}m) —</span>
                  ) : (
                    <>
                      <span style={{ width: 30 }}>L{lvl.level}</span>
                      <span style={{ width: 100 }}>{lvl.smallBlind}/{lvl.bigBlind}</span>
                      <span style={{ width: 60 }}>Ante: {lvl.ante}</span>
                      <span>{lvl.duration}m</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Registered Players */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: FB.dim, marginBottom: 4 }}>Registered Players ({registrations.length})</div>
          {registrations.length === 0 && <div style={{ fontSize: 12, color: FB.dim }}>No players registered yet</div>}
          {registrations.slice(0, 20).map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: FB.text, padding: '2px 0' }}>
              {r.user_id.slice(0, 8)}... — {r.status}
              {r.finish_position && ` — #${r.finish_position}`}
            </div>
          ))}
          {registrations.length > 20 && (
            <div style={{ fontSize: 11, color: FB.dim }}>+{registrations.length - 20} more</div>
          )}
        </div>

        {/* Live Tournament Stats (when running) */}
        {tourneyState && ['running', 'late_reg'].includes(t.status) && (
          <div style={{ background: FB.bg, padding: 12, borderRadius: 8, marginBottom: 16, border: `1px solid ${FB.border}` }}>
            <div style={{ fontSize: 11, color: FB.gold, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Live Tournament</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              <div><span style={{ color: FB.dim }}>Level:</span> <strong>{tourneyState.currentLevel}</strong></div>
              <div><span style={{ color: FB.dim }}>Blinds:</span> <strong>{tourneyState.blinds?.smallBlind}/{tourneyState.blinds?.bigBlind}</strong></div>
              <div><span style={{ color: FB.dim }}>Players:</span> <strong>{tourneyState.playersRemaining}/{tourneyState.totalEntries}</strong></div>
              <div><span style={{ color: FB.dim }}>Avg Stack:</span> <strong>{(tourneyState.averageStack || 0).toLocaleString()}</strong></div>
              <div><span style={{ color: FB.dim }}>Prize Pool:</span> <strong style={{ color: FB.gold }}>{(tourneyState.prizePool || 0).toLocaleString()}</strong></div>
              {tourneyState.levelTimeRemaining > 0 && (
                <div><span style={{ color: FB.dim }}>Next Level:</span> <strong>{Math.ceil(tourneyState.levelTimeRemaining / 60)}m</strong></div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: FB.border, color: FB.text, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close</button>

          {/* Go to Table — when running and registered */}
          {isRegistered && ['running', 'late_reg'].includes(t.status) && (
            <button onClick={goToTable} style={{
              flex: 1, padding: 10, background: '#ea580c', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(234,88,12,0.4)',
            }}>Go to Table</button>
          )}

          {canRegister && (
            <button onClick={() => onRegister(t.id)} style={{
              flex: 1, padding: 10, background: FB.green, color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
            }}>Register ({Number(t.buy_in).toLocaleString()})</button>
          )}

          {isRegistered && ['scheduled', 'registering'].includes(t.status) && (
            <button onClick={() => onUnregister(t.id)} style={{
              flex: 1, padding: 10, background: FB.danger, color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
            }}>Unregister</button>
          )}

          {isAdmin && ['scheduled', 'registering'].includes(t.status) && t.registered_count >= 2 && (
            <button onClick={onStart} style={{
              flex: 1, padding: 10, background: '#ea580c', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
            }}>Start Now</button>
          )}
        </div>
      </div>
    </div>
  );
}
