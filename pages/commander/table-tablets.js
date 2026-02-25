/**
 * Table Tablets — Dealer View Dashboard
 * /commander/table-tablets
 *
 * Shows all tables with inline dealer view:
 * - Texas-style (timed): countdown clocks per seated player
 * - Charity / Home games: player names + open seat indicators
 * Tapping a table opens the full dealer tablet at /commander/dealer/[tableNumber]
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
    Monitor, Users, Loader2, ChevronRight, Power, DollarSign, Trophy,
    Clock, Timer, UserPlus, Armchair
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_BADGE = {
    in_use: { bg: '#31A24C', label: 'Active' },
    available: { bg: '#1877F2', label: 'Open' },
    reserved: { bg: '#F59E0B', label: 'Reserved' },
    maintenance: { bg: '#6B7280', label: 'Maint.' },
};

function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function getTimerColor(seconds) {
    if (seconds <= 0) return '#EF4444';
    if (seconds <= 300) return '#EF4444';   // < 5 min — red
    if (seconds <= 900) return '#F59E0B';   // < 15 min — yellow
    return '#31A24C';                       // green
}

// Compute seat positions around an oval
function computeSeatPositions(maxSeats) {
    const positions = [];
    for (let i = 0; i < maxSeats; i++) {
        const angle = (Math.PI * 2 * i) / maxSeats - Math.PI / 2;
        const rx = 42, ry = 36;
        positions.push({
            left: `${50 + rx * Math.cos(angle)}%`,
            top: `${50 + ry * Math.sin(angle)}%`,
        });
    }
    return positions;
}

export default function TableTabletsPage() {
    const router = useRouter();
    const [tables, setTables] = useState([]);
    const [sessions, setSessions] = useState({});
    const [loading, setLoading] = useState(true);
    const [venueId, setVenueId] = useState(null);

    useEffect(() => {
        try {
            const staff = localStorage.getItem('commander_staff');
            if (!staff) { router.push('/commander/login').catch(() => { }); return; }
            const parsed = JSON.parse(staff);
            setVenueId(parsed.venue_id);
        } catch { router.push('/commander/login').catch(() => { }); }
    }, [router]);

    const fetchAll = useCallback(async () => {
        if (!venueId) return;
        const staffSession = localStorage.getItem('commander_staff') || '';
        const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
        const headers = { 'x-staff-session': staffSession, Authorization: `Bearer ${token}` };

        // Fetch tables
        let tablesArr = [];
        try {
            const res = await fetch(`/api/commander/tables?venue_id=${venueId}`, { headers });
            const json = await res.json();
            if (json.success) {
                tablesArr = Array.isArray(json.data) ? json.data
                    : Array.isArray(json.data?.tables) ? json.data.tables : [];
                setTables(tablesArr);
            }
        } catch (err) { console.error('Failed to fetch tables:', err); }

        // Fetch sessions for active tables
        try {
            const activeTables = tablesArr.filter(t => t.status === 'in_use');
            const sessionData = {};
            await Promise.all(activeTables.map(async (t) => {
                try {
                    const tNum = t.table_number || t.number;
                    const res = await fetch(`/api/commander/dealer/sessions?table=${tNum}`, { headers });
                    const json = await res.json();
                    if (json.success) sessionData[tNum] = json.data || [];
                } catch { }
            }));
            setSessions(sessionData);
        } catch { }

        setLoading(false);
    }, [venueId]);

    useEffect(() => { if (venueId) fetchAll(); }, [venueId, fetchAll]);

    // Auto-refresh every 10s
    useEffect(() => {
        if (!venueId) return;
        const interval = setInterval(fetchAll, 10000);
        return () => clearInterval(interval);
    }, [venueId, fetchAll]);

    const openTablet = (tableNumber) => {
        router.push(`/commander/dealer/${tableNumber}`);
    };

    const activeTables = tables.filter(t => t.status === 'in_use');
    const idleTables = tables.filter(t => t.status !== 'in_use');

    return (
        <CommanderLayout title="Table Tablets | Commander" backHref="/commander/dashboard?card=floor">
            <SEOHead title="Commander — Table Tablets" description="Dealer tablet view for all tables." noindex={true} />
            <div style={{ minHeight: '100vh', background: '#18191A', color: '#E4E6EB', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px' }}>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 40, height: 40, background: 'rgba(24,119,242,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Monitor size={20} color="#1877F2" />
                        </div>
                        <div>
                            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Table Tablets</h1>
                            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
                                {tables.length} tables — {activeTables.length} active
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '80px 0', textAlign: 'center' }}>
                            <Loader2 size={32} color="#1877F2" style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                    ) : tables.length === 0 ? (
                        <div style={{ background: '#242526', border: '1px solid #3A3B3C', borderRadius: 16, padding: 40, textAlign: 'center' }}>
                            <Monitor size={48} color="#4A5E78" style={{ margin: '0 auto 12px' }} />
                            <p style={{ color: '#64748B', marginBottom: 16 }}>No tables configured</p>
                            <button onClick={() => router.push('/commander/tables')}
                                style={{ padding: '10px 20px', background: '#1877F2', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
                                Go to Table Management
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* ACTIVE TABLES — expanded cards with seat view */}
                            {activeTables.length > 0 && (
                                <>
                                    <h2 style={{ fontSize: 14, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Timer size={14} /> Active Tables ({activeTables.length})
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {activeTables.map(table => {
                                            const tNum = table.table_number || table.number;
                                            const maxSeats = table.max_seats || 9;
                                            const tableSessions = sessions[tNum] || [];
                                            const game = Array.isArray(table.commander_games) && table.commander_games.length > 0
                                                ? table.commander_games.find(g => g.status !== 'closed') : null;
                                            const seatPositions = computeSeatPositions(maxSeats);
                                            const hasTimed = tableSessions.some(s => s.time_remaining !== undefined && s.time_remaining !== null);

                                            return (
                                                <button key={table.id || tNum} onClick={() => openTablet(tNum)}
                                                    style={{ background: '#242526', border: '2px solid rgba(49,162,76,0.3)', borderRadius: 16, padding: 0, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', transition: 'border-color 0.2s' }}>

                                                    {/* Table header */}
                                                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3A3B3C' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <div style={{ width: 36, height: 36, background: 'rgba(49,162,76,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#31A24C' }}>
                                                                {tNum}
                                                            </div>
                                                            <div>
                                                                <p style={{ margin: 0, fontWeight: 600, color: '#fff', fontSize: 14 }}>Table {tNum}</p>
                                                                <p style={{ margin: 0, fontSize: 11, color: '#B0B3B8' }}>
                                                                    {game ? `${game.game_type?.toUpperCase() || 'NLH'} ${game.stakes || ''}` : table.game_type ? `${table.game_type} ${table.stakes || ''}` : 'Cash Game'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ fontSize: 12, color: '#B0B3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <Users size={13} /> {tableSessions.length}/{maxSeats}
                                                            </span>
                                                            <ChevronRight size={16} color="#64748B" />
                                                        </div>
                                                    </div>

                                                    {/* Oval table with seats */}
                                                    <div style={{ position: 'relative', width: '100%', paddingBottom: '55%', overflow: 'hidden' }}>
                                                        {/* Oval felt */}
                                                        <div style={{
                                                            position: 'absolute', top: '18%', left: '10%', right: '10%', bottom: '18%',
                                                            background: 'radial-gradient(ellipse at center, #1a5c2a 0%, #0d3318 100%)',
                                                            borderRadius: '50%', border: '3px solid #2d7a3d',
                                                            boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5), 0 0 15px rgba(45,122,61,0.3)',
                                                        }} />

                                                        {/* Seat badges */}
                                                        {seatPositions.map((pos, idx) => {
                                                            const seatNum = idx + 1;
                                                            const session = tableSessions.find(s => s.seat_number === seatNum);
                                                            const isOccupied = !!session;
                                                            const timerColor = isOccupied && hasTimed ? getTimerColor(session.time_remaining) : null;

                                                            return (
                                                                <div key={idx} style={{
                                                                    position: 'absolute', left: pos.left, top: pos.top,
                                                                    transform: 'translate(-50%, -50%)',
                                                                    width: 48, height: 48,
                                                                    borderRadius: '50%',
                                                                    background: isOccupied ? 'rgba(49,162,76,0.15)' : 'rgba(100,116,139,0.1)',
                                                                    border: isOccupied ? `2px solid ${timerColor || '#31A24C'}` : '2px dashed #3A3B3C',
                                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: 9, fontWeight: 600,
                                                                    transition: 'all 0.3s',
                                                                }}>
                                                                    {isOccupied ? (
                                                                        <>
                                                                            <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                                                                {(session.player_name || 'P').substring(0, 5)}
                                                                            </span>
                                                                            {hasTimed && (
                                                                                <span style={{ color: timerColor, fontSize: 8, fontWeight: 700, marginTop: 1 }}>
                                                                                    {formatTime(session.time_remaining)}
                                                                                </span>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        <span style={{ color: '#4A5E78', fontSize: 10 }}>{seatNum}</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Footer — countdown summary for timed games */}
                                                    {hasTimed && (
                                                        <div style={{ padding: '8px 16px', borderTop: '1px solid #3A3B3C', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                            {tableSessions.filter(s => s.time_remaining !== undefined).map((s, i) => (
                                                                <span key={i} style={{
                                                                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                                                    background: `${getTimerColor(s.time_remaining)}20`,
                                                                    color: getTimerColor(s.time_remaining),
                                                                }}>
                                                                    S{s.seat_number}: {formatTime(s.time_remaining)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* IDLE TABLES — compact grid */}
                            {idleTables.length > 0 && (
                                <>
                                    <h2 style={{ fontSize: 14, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Armchair size={14} /> Available Tables ({idleTables.length})
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                                        {idleTables.map(table => {
                                            const tNum = table.table_number || table.number;
                                            const maxSeats = table.max_seats || 9;
                                            const statusCfg = STATUS_BADGE[table.status] || STATUS_BADGE.available;
                                            return (
                                                <button key={table.id || tNum} onClick={() => openTablet(tNum)}
                                                    style={{
                                                        background: '#242526', border: '1px solid #3A3B3C', borderRadius: 12,
                                                        padding: '14px 12px', cursor: 'pointer', textAlign: 'left',
                                                        display: 'flex', flexDirection: 'column', gap: 6, transition: 'border-color 0.2s',
                                                    }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>Table {tNum}</span>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                                                            background: `${statusCfg.bg}20`, color: statusCfg.bg,
                                                        }}>
                                                            {statusCfg.label}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B' }}>
                                                        <Armchair size={12} /> {maxSeats} seats
                                                        {table.table_name && table.table_name !== `Table ${tNum}` && (
                                                            <span>— {table.table_name}</span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        button:hover { border-color: rgba(24,119,242,0.4) !important; }
      `}</style>
        </CommanderLayout>
    );
}
