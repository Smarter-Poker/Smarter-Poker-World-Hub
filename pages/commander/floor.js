/**
 * Live Floor Map
 * /commander/floor
 *
 * Visual bird's-eye view of ALL tables in the poker room.
 * Floor managers see at a glance:
 * - Which tables are running, which are empty
 * - Game type + stakes per table
 * - Seated vs open count
 * - Waitlist demand
 *
 * Designed for large tablets / desktop monitors at the floor podium.
 * All cards are uniform size. Active tables are visually prominent.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  RefreshCw, Users, Clock, AlertTriangle,
  Loader2, Maximize2, Layout, Activity, Armchair
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_CONFIG = {
  in_use: { color: '#31A24C', glow: 'rgba(49,162,76,0.25)', label: 'Active', icon: '●' },
  available: { color: '#1877F2', glow: 'rgba(24,119,242,0.15)', label: 'Open', icon: '○' },
  reserved: { color: '#F59E0B', glow: 'rgba(245,158,11,0.15)', label: 'Reserved', icon: '◆' },
  maintenance: { color: '#6B7280', glow: 'rgba(107,114,128,0.15)', label: 'Maintenance', icon: '⚙' },
  breaking: { color: '#EF4444', glow: 'rgba(239,68,68,0.15)', label: 'Breaking', icon: '✕' },
};

const GAME_COLORS = {
  'NLH': '#1877F2', 'PLO': '#31A24C', 'MIXED': '#F59E0B',
  'TOURNAMENT': '#A855F7', 'OMAHA': '#EF4444', 'NLO': '#22D3EE',
};

export default function FloorMap() {
  const router = useRouter();
  const [tables, setTables] = useState([]);
  const [waitlists, setWaitlists] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [now, setNow] = useState(new Date());
  const [venueId, setVenueId] = useState(null);
  const [venueName, setVenueName] = useState('');

  useEffect(() => {
    try {
      const staff = localStorage.getItem('commander_staff');
      if (!staff) { router.push('/commander/login').catch(() => { }); return; }
      const parsed = JSON.parse(staff);
      if (!parsed.venue_id) { router.push('/commander/login').catch(() => { }); return; }
      setVenueId(parsed.venue_id);
      setVenueName(parsed.venue_name || '');
    } catch { router.push('/commander/login').catch(() => { }); }
  }, [router]);

  const fetchAll = useCallback(async () => {
    if (!venueId) return;
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };

      const [tablesRes, waitlistRes, gamesRes] = await Promise.all([
        fetch(`/api/commander/tables?venue_id=${venueId}`, { headers }).then(r => r.json()),
        fetch(`/api/commander/waitlist?venue_id=${venueId}`, { headers }).then(r => r.json()).catch(() => ({ success: false })),
        fetch(`/api/commander/games/venue/${venueId}`, { headers }).then(r => r.json()).catch(() => ({ success: false })),
      ]);

      let rawTables = Array.isArray(tablesRes.data) ? tablesRes.data : (tablesRes.data?.tables || []);

      // Merge game data into tables
      const gamesArr = Array.isArray(gamesRes.data?.games) ? gamesRes.data.games
        : Array.isArray(gamesRes.data) ? gamesRes.data : [];
      const activeGames = gamesArr.filter(g => g.status === 'running' || g.status === 'waiting');

      if (rawTables.length > 0 && activeGames.length > 0) {
        rawTables = rawTables.map(t => {
          const game = activeGames.find(g => g.table_id === t.id);
          if (game) {
            return {
              ...t,
              status: 'in_use',
              game_type: (game.game_type || t.game_type || '').toUpperCase(),
              stakes: game.stakes || t.stakes || '',
              current_players: game.current_players || 0,
              max_players: game.max_players || t.max_seats || 9,
              game_started_at: game.started_at || game.created_at,
            };
          }
          return t;
        });
      } else if (rawTables.length === 0 && activeGames.length > 0) {
        rawTables = activeGames.map((g, idx) => ({
          id: g.id,
          table_number: g.table_number || idx + 1,
          table_name: g.table_name || null,
          status: 'in_use',
          game_type: (g.game_type || 'NLH').toUpperCase(),
          stakes: g.stakes || '',
          max_seats: g.max_players || 9,
          current_players: g.current_players || 0,
          game_started_at: g.started_at || g.created_at,
        }));
      }

      setTables(rawTables);

      if (waitlistRes.success) {
        const grouped = {};
        const arr = Array.isArray(waitlistRes.data) ? waitlistRes.data : [];
        arr.filter(w => w.status === 'waiting').forEach(w => {
          const game = (w.game_type || 'Unknown').toUpperCase();
          grouped[game] = (grouped[game] || 0) + 1;
        });
        setWaitlists(grouped);
      }
    } catch (err) { console.error('Floor fetch error:', err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { if (venueId) fetchAll(); }, [venueId, fetchAll]);
  useEffect(() => {
    if (!venueId) return;
    const poll = setInterval(fetchAll, 15000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [venueId, fetchAll]);

  // Computed stats
  const activeCount = tables.filter(t => t.status === 'in_use').length;
  const openCount = tables.filter(t => t.status === 'available').length;
  const reservedCount = tables.filter(t => t.status === 'reserved').length;
  const maintCount = tables.filter(t => t.status === 'maintenance').length;
  const totalSeats = tables.reduce((s, t) => s + (t.max_seats || 9), 0);
  const occupiedSeats = tables.reduce((s, t) => s + (t.current_players || 0), 0);
  const totalWaiting = Object.values(waitlists).reduce((s, n) => s + n, 0);

  const filtered = tables
    .filter(t => filter === 'all' ? true : t.status === filter)
    .sort((a, b) => (a.table_number || 0) - (b.table_number || 0));

  // Elapsed time since game start
  const getElapsed = (startedAt) => {
    if (!startedAt) return '';
    const diff = Math.floor((now - new Date(startedAt)) / 1000);
    if (diff < 0) return '';
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Seat fill bar
  const renderSeatBar = (occupied, max) => {
    const pct = max > 0 ? (occupied / max) * 100 : 0;
    const barColor = pct >= 100 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#31A24C';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 3, background: barColor, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: barColor, minWidth: 32, textAlign: 'right' }}>{occupied}/{max}</span>
      </div>
    );
  };

  return (
    <CommanderLayout title="Floor Map | Commander" backHref="/commander/dashboard?card=floor">
      <SEOHead title="Commander — Floor Map" description="Live poker room floor map." noindex={true} />
      <div style={{ minHeight: '100vh', background: '#18191A', color: '#E4E6EB', fontFamily: 'Inter, sans-serif' }}>

        {/* Header bar */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3A3B3C' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layout size={18} color="#1877F2" /> Floor Map
            </h1>
            <p style={{ fontSize: 12, color: '#8A8D91', margin: 0 }}>
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {tables.length} tables
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchAll} style={{ width: 36, height: 36, borderRadius: 10, background: '#242526', border: '1px solid #3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <RefreshCw size={16} color="#B0B3B8" />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'Active', value: activeCount, color: '#31A24C', icon: <Activity size={14} /> },
            { label: 'Open', value: openCount, color: '#1877F2', icon: <Armchair size={14} /> },
            { label: 'Seats', value: `${occupiedSeats}/${totalSeats}`, color: '#E4E6EB', icon: <Users size={14} /> },
            { label: 'Waiting', value: totalWaiting, color: '#F59E0B', icon: <AlertTriangle size={14} /> },
          ].map(stat => (
            <div key={stat.label} style={{
              background: `${stat.color}08`, border: `1px solid ${stat.color}30`,
              borderRadius: 12, padding: '10px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: '#8A8D91', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {stat.icon} {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Waitlist banner */}
        {totalWaiting > 0 && (
          <div style={{ margin: '0 16px 8px', padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, fontWeight: 600 }}>
              {Object.entries(waitlists).map(([game, count]) => (
                <span key={game} style={{ color: '#F59E0B' }}>{game}: {count} waiting</span>
              ))}
            </div>
          </div>
        )}

        {/* Filter pills */}
        <div style={{ padding: '8px 16px 12px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {[
            { key: 'all', label: `All (${tables.length})` },
            { key: 'in_use', label: `Active (${activeCount})` },
            { key: 'available', label: `Open (${openCount})` },
            { key: 'reserved', label: `Reserved (${reservedCount})` },
            { key: 'maintenance', label: `Maint. (${maintCount})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: filter === f.key ? '#1877F2' : '#242526',
              color: filter === f.key ? '#fff' : '#B0B3B8',
              border: filter === f.key ? '1px solid #1877F2' : '1px solid #3A3B3C',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Table Grid */}
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <Loader2 size={32} color="#1877F2" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 16px', textAlign: 'center' }}>
            <Layout size={48} color="#4A5E78" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#64748B', fontSize: 14 }}>No tables match this filter</p>
          </div>
        ) : (
          <div style={{ padding: '0 16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {filtered.map(table => {
              const tNum = table.table_number || table.number;
              const status = table.status || 'available';
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.available;
              const gameType = (table.game_type || '').toUpperCase();
              const gameColor = GAME_COLORS[gameType] || '#B0B3B8';
              const maxSeats = table.max_seats || 9;
              const occupied = table.current_players || 0;
              const isActive = status === 'in_use';
              const elapsed = isActive ? getElapsed(table.game_started_at) : '';

              return (
                <button key={table.id || tNum}
                  onClick={() => router.push(`/commander/tables`)}
                  style={{
                    background: isActive
                      ? `linear-gradient(135deg, rgba(49,162,76,0.08) 0%, rgba(24,119,242,0.04) 100%)`
                      : '#242526',
                    border: `2px solid ${isActive ? `${cfg.color}50` : '#3A3B3C'}`,
                    borderRadius: 14,
                    padding: '14px 14px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex', flexDirection: 'column',
                    minHeight: 130,
                    position: 'relative',
                    overflow: 'hidden',
                  }}>

                  {/* Active glow effect */}
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: -1, left: -1, right: -1, height: 3,
                      background: `linear-gradient(90deg, ${cfg.color}, ${gameColor})`,
                      borderRadius: '14px 14px 0 0',
                    }} />
                  )}

                  {/* Row 1: Table number + status badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>T{tNum}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: `${cfg.color}18`, color: cfg.color,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{cfg.label}</span>
                  </div>

                  {/* Row 2: Game type + stakes (always rendered for uniform height) */}
                  <div style={{ marginBottom: 8, minHeight: 22 }}>
                    {isActive && gameType ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: gameColor,
                          background: `${gameColor}15`, padding: '2px 8px', borderRadius: 6,
                        }}>{gameType}</span>
                        {table.stakes && (
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#E4E6EB' }}>{table.stakes}</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#4A5E78', fontStyle: 'italic' }}>
                        {status === 'reserved' ? 'Reserved' : status === 'maintenance' ? 'Under maintenance' : 'No game'}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Seat fill bar */}
                  <div style={{ marginTop: 'auto' }}>
                    {renderSeatBar(occupied, maxSeats)}
                    {/* Elapsed time for active tables */}
                    {isActive && elapsed && (
                      <div style={{ fontSize: 10, color: '#8A8D91', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={10} /> Running {elapsed}
                      </div>
                    )}
                  </div>

                  {/* Table name if custom */}
                  {table.table_name && table.table_name !== `Table ${tNum}` && (
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {table.table_name}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        button:hover { transform: translateY(-1px) !important; border-color: rgba(24,119,242,0.5) !important; }
      `}</style>
    </CommanderLayout>
  );
}
