/**
 * Table Tablets — Dealer View Dashboard
 * /commander/table-tablets
 *
 * Shows all tables with inline dealer view:
 * - Texas-style (timed): countdown clocks per seated player
 * - Charity / Home games: player names + open seat indicators
 * Tapping a table opens the full dealer tablet at /commander/dealer/[tableNumber]
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
    Monitor, Users, Loader2, ChevronRight, Power, DollarSign, Trophy,
    Clock, Timer, UserPlus, Armchair, ScanLine, Camera, X, CheckCircle
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
    // Dealer scan state
    const [scanningTable, setScanningTable] = useState(null); // table number being scanned
    const [scanCameraActive, setScanCameraActive] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [scanError, setScanError] = useState('');
    const [manualDealerQR, setManualDealerQR] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);

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

        // Fetch tables — API already joins commander_games + commander_table_seats
        try {
            const res = await fetch(`/api/commander/tables?venue_id=${venueId}`, { headers });
            const json = await res.json();
            if (json.success) {
                let tablesArr = Array.isArray(json.data) ? json.data
                    : Array.isArray(json.data?.tables) ? json.data.tables : [];

                // For active tables, fetch sessions to get time_remaining for countdown clocks
                const activeTbls = tablesArr.filter(t => t.status === 'in_use');
                if (activeTbls.length > 0) {
                    const sessionsByTable = {};
                    await Promise.all(activeTbls.map(async (t) => {
                        const tNum = t.table_number || t.number;
                        try {
                            const sRes = await fetch(`/api/commander/dealer/sessions?table=${tNum}`, { headers });
                            const sJson = await sRes.json();
                            if (sJson.success) sessionsByTable[tNum] = sJson.data || [];
                        } catch { /* non-fatal */ }
                    }));

                    // Merge session time_remaining into table seat data
                    tablesArr = tablesArr.map(t => {
                        const tNum = t.table_number || t.number;
                        const tableSessions = sessionsByTable[tNum];
                        if (!tableSessions || tableSessions.length === 0) return t;
                        return {
                            ...t,
                            seats: tableSessions.map(s => ({
                                seat_number: s.seat_number,
                                player_name: s.player_name,
                                member_id: s.member_id,
                                membership_tier: s.membership_tier,
                                membership_status: s.membership_status,
                                time_remaining: s.time_remaining,
                                time_balance_minutes: s.time_balance_minutes,
                                is_low: s.is_low,
                                is_critical: s.is_critical,
                                is_expired: s.is_expired,
                            }))
                        };
                    });
                }

                setTables(tablesArr);
            }
        } catch (err) { console.error('Failed to fetch tables:', err); }

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

    // Helper: get game + player info from table data
    const getTableGame = (table) => {
        const games = Array.isArray(table.commander_games) ? table.commander_games : [];
        return games.find(g => g.status !== 'closed') || games[0] || null;
    };

    const getSeatedCount = (table) => {
        const game = getTableGame(table);
        // Use seats array if available, otherwise fall back to game.current_players
        if (table.seats && table.seats.length > 0) return table.seats.length;
        if (game && game.current_players) return game.current_players;
        return 0;
    };

    const activeTables = tables.filter(t => t.status === 'in_use');
    const idleTables = tables.filter(t => t.status !== 'in_use');

    // Dealer scan functions
    const openDealerScan = (tableNumber) => {
        setScanningTable(tableNumber);
        setScanResult(null);
        setScanError('');
        setManualDealerQR('');
    };

    const closeDealerScan = () => {
        stopDealerCamera();
        setScanningTable(null);
        setScanResult(null);
        setScanError('');
    };

    const startDealerCamera = async () => {
        setScanError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            setScanCameraActive(true);

            if ('BarcodeDetector' in window) {
                const detector = new BarcodeDetector({ formats: ['qr_code'] });
                const interval = setInterval(async () => {
                    if (!videoRef.current || videoRef.current.readyState < 2) return;
                    try {
                        const barcodes = await detector.detect(videoRef.current);
                        if (barcodes.length > 0) {
                            stopDealerCamera();
                            handleDealerScan(barcodes[0].rawValue);
                        }
                    } catch { }
                }, 300);
                scanIntervalRef.current = interval;
            }
        } catch {
            setScanError('Camera access denied. Use manual entry.');
        }
    };

    const stopDealerCamera = () => {
        if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        setScanCameraActive(false);
    };

    const handleDealerScan = async (qrCode) => {
        setScanError('');
        setScanResult(null);
        try {
            const res = await fetch('/api/commander/tables/dealer-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ venue_id: venueId, qr_code: qrCode, table_number: scanningTable }),
            });
            const data = await res.json();
            if (data.success) {
                setScanResult(data.data);
                fetchAll(); // refresh tables to show new dealer
                setTimeout(() => closeDealerScan(), 3000);
            } else {
                setScanError(data.error || 'Failed to assign dealer');
            }
        } catch {
            setScanError('Network error');
        }
    };

    const handleManualDealerScan = (e) => {
        e.preventDefault();
        if (manualDealerQR.trim()) handleDealerScan(manualDealerQR.trim());
    };

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
                                            const game = getTableGame(table);
                                            const seatedCount = getSeatedCount(table);
                                            const seatPositions = computeSeatPositions(maxSeats);
                                            const seatData = table.seats || [];
                                            // Determine if this is timed (Texas-style)
                                            const hasTimed = seatData.some(s => s.time_remaining !== undefined && s.time_remaining !== null);

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
                                                                    {game?.dealer_staff_id && ` — Dealer assigned`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); openDealerScan(tNum); }}
                                                                style={{
                                                                    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                                                                    borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                                    fontSize: 10, fontWeight: 700, color: '#10B981',
                                                                }}
                                                                title="Scan dealer QR code"
                                                            >
                                                                <ScanLine size={12} /> Dealer
                                                            </button>
                                                            <span style={{ fontSize: 12, color: seatedCount > 0 ? '#31A24C' : '#B0B3B8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <Users size={13} /> {seatedCount}/{maxSeats}
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
                                                            const seatInfo = seatData.find(s => s.seat_number === seatNum);
                                                            const isOccupied = seatInfo ? true : (seatNum <= seatedCount && seatData.length === 0);
                                                            const timerColor = isOccupied && seatInfo?.time_remaining != null ? getTimerColor(seatInfo.time_remaining) : null;
                                                            const playerName = seatInfo?.player_name || (isOccupied ? `P${seatNum}` : '');
                                                            const tierColors = { daily: '#22D3EE', weekly: '#31A24C', monthly: '#F59E0B', yearly: '#8B5CF6' };
                                                            const memberTierColor = seatInfo?.membership_tier ? tierColors[seatInfo.membership_tier] : null;

                                                            return (
                                                                <div key={idx} style={{
                                                                    position: 'absolute', left: pos.left, top: pos.top,
                                                                    transform: 'translate(-50%, -50%)',
                                                                    width: 52, height: 52,
                                                                    borderRadius: '50%',
                                                                    background: isOccupied ? 'rgba(49,162,76,0.15)' : 'rgba(100,116,139,0.1)',
                                                                    border: isOccupied ? `2px solid ${timerColor || '#31A24C'}` : '2px dashed #3A3B3C',
                                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: 9, fontWeight: 600,
                                                                    transition: 'all 0.3s',
                                                                }}>
                                                                    {isOccupied ? (
                                                                        <>
                                                                            {/* Membership tier dot */}
                                                                            {memberTierColor && (
                                                                                <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: memberTierColor, border: '1px solid #242526' }} />
                                                                            )}
                                                                            <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, maxWidth: 42, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                                                                {playerName.substring(0, 6)}
                                                                            </span>
                                                                            {seatInfo?.time_remaining != null && (
                                                                                <span style={{ color: timerColor, fontSize: 8, fontWeight: 700, marginTop: 1 }}>
                                                                                    {formatTime(seatInfo.time_remaining)}
                                                                                </span>
                                                                            )}
                                                                            {seatInfo?.time_balance_minutes > 0 && (
                                                                                <span style={{ color: '#1877F2', fontSize: 7, fontWeight: 600, marginTop: 0 }}>
                                                                                    {Math.floor(seatInfo.time_balance_minutes / 60)}h bal
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

                                                    {/* Footer — countdown + membership summary */}
                                                    {hasTimed && (
                                                        <div style={{ padding: '8px 16px', borderTop: '1px solid #3A3B3C', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                            {seatData.filter(s => s.time_remaining !== undefined).map((s, i) => {
                                                                const tColor = getTimerColor(s.time_remaining);
                                                                const tierColors = { daily: '#22D3EE', weekly: '#31A24C', monthly: '#F59E0B', yearly: '#8B5CF6' };
                                                                const mColor = s.membership_tier ? tierColors[s.membership_tier] : null;
                                                                return (
                                                                    <span key={i} style={{
                                                                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                                                        background: `${tColor}20`, color: tColor,
                                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                                    }}>
                                                                        {mColor && <span style={{ width: 5, height: 5, borderRadius: '50%', background: mColor, display: 'inline-block' }} />}
                                                                        S{s.seat_number}: {formatTime(s.time_remaining)}
                                                                        {s.time_balance_minutes > 0 && <span style={{ fontSize: 8, opacity: 0.7 }}>({Math.floor(s.time_balance_minutes / 60)}h)</span>}
                                                                    </span>
                                                                );
                                                            })}
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

            {/* ── DEALER SCAN-IN MODAL ── */}
            {scanningTable && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={closeDealerScan} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)' }} />
                    <div style={{
                        position: 'relative', background: '#242526', borderRadius: 16,
                        width: '90%', maxWidth: 400, padding: 24,
                        border: '2px solid #3A3B3C', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>Dealer Scan-In</h3>
                                <p style={{ margin: 0, fontSize: 12, color: '#B0B3B8' }}>Table {scanningTable}</p>
                            </div>
                            <button onClick={closeDealerScan} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                <X size={20} color="#B0B3B8" />
                            </button>
                        </div>

                        {scanResult ? (
                            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                <CheckCircle size={48} color="#10B981" style={{ margin: '0 auto 12px' }} />
                                <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{scanResult.dealer_name}</p>
                                <p style={{ fontSize: 13, color: '#10B981', fontWeight: 600, margin: 0 }}>
                                    Assigned to Table {scanResult.table_number}
                                </p>
                            </div>
                        ) : (
                            <>
                                {scanError && (
                                    <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#EF4444' }}>
                                        {scanError}
                                    </div>
                                )}

                                {scanCameraActive ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <video
                                            ref={(el) => { videoRef.current = el; if (el && streamRef.current) el.srcObject = streamRef.current; }}
                                            autoPlay playsInline
                                            style={{ width: '100%', borderRadius: 12, background: '#000', marginBottom: 12 }}
                                        />
                                        <button onClick={stopDealerCamera}
                                            style={{ padding: '8px 20px', background: '#3A3B3C', color: '#E4E6EB', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ width: 64, height: 64, background: 'rgba(16,185,129,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                            <ScanLine size={32} color="#10B981" />
                                        </div>
                                        <p style={{ fontSize: 13, color: '#B0B3B8', marginBottom: 16 }}>Scan dealer QR code to assign</p>
                                        <button onClick={startDealerCamera}
                                            style={{ padding: '10px 24px', background: '#10B981', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <Camera size={16} /> Open Scanner
                                        </button>
                                    </div>
                                )}

                                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #3A3B3C' }}>
                                    <p style={{ fontSize: 11, color: '#8A8D91', marginBottom: 6, textAlign: 'center' }}>Or enter QR code manually</p>
                                    <form onSubmit={handleManualDealerScan} style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            type="text" value={manualDealerQR} onChange={(e) => setManualDealerQR(e.target.value)}
                                            placeholder="STAFF-1996-abc123"
                                            style={{ flex: 1, padding: '8px 12px', background: '#3A3B3C', border: '1px solid #4E4F50', borderRadius: 8, color: '#E4E6EB', fontSize: 13, outline: 'none' }}
                                        />
                                        <button type="submit" disabled={!manualDealerQR.trim()}
                                            style={{ padding: '8px 14px', background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                                            Assign
                                        </button>
                                    </form>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </CommanderLayout>
    );
}
