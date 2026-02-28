/**
 * Table Tablets — Dealer View Dashboard
 * /commander/table-tablets
 *
 * Shows all tables with inline dealer view matching the Table Management visuals:
 * - Poker table image with positioned seat badges (avatars, names, timers)
 * - Dealer "D" badge on each table
 * - Fullscreen popup when a table is clicked
 * Tapping a table opens a fullscreen overlay with real-time seat data.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
    Monitor, Users, Loader2, ChevronRight, Power, DollarSign, Trophy,
    Clock, Timer, UserPlus, Armchair, ScanLine, Camera, X, CheckCircle,
    Maximize2, Minimize2
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

// Arc-length parameterized ellipse for equal visual spacing — matches tables.js
function computeSeatPositions(maxSeats) {
    const rx = 47, ry = 22, cxE = 50, cyE = 50;
    const STEPS = 360;
    const startAngle = Math.PI / 2;
    const cumArc = [0];
    for (let i = 1; i <= STEPS; i++) {
        const t0 = startAngle + ((i - 1) / STEPS) * 2 * Math.PI;
        const t1 = startAngle + (i / STEPS) * 2 * Math.PI;
        const dx = rx * (Math.cos(t1) - Math.cos(t0));
        const dy = ry * (Math.sin(t1) - Math.sin(t0));
        cumArc.push(cumArc[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalArc = cumArc[STEPS];
    const totalSlots = maxSeats + 1; // +1 for dealer
    const allPos = [];
    for (let p = 0; p < totalSlots; p++) {
        const target = (p / totalSlots) * totalArc;
        let idx = 1;
        while (idx <= STEPS && cumArc[idx] < target) idx++;
        const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
        allPos.push({
            top: `${cyE + ry * Math.sin(angle)}%`,
            left: `${cxE + rx * Math.cos(angle)}%`,
        });
    }
    const dealerPos = allPos[0];
    const seatPositions = allPos.slice(1);
    seatPositions.forEach(p => { const t = parseFloat(p.top); if (t < 30) p.top = '30%'; });
    return { dealerPos, seatPositions };
}

export default function TableTabletsPage() {
    const router = useRouter();
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [venueId, setVenueId] = useState(null);
    const [venueName, setVenueName] = useState('');
    // Fullscreen table popup
    const [fullscreenTable, setFullscreenTable] = useState(null);
    // Dealer scan state
    const [scanningTable, setScanningTable] = useState(null);
    const [scanCameraActive, setScanCameraActive] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [scanError, setScanError] = useState('');
    const [manualDealerQR, setManualDealerQR] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    // Live countdown tick — tracks when API data was last fetched
    const lastFetchAt = useRef(Date.now());
    const [tickCounter, setTickCounter] = useState(0);

    useEffect(() => {
        try {
            const staff = localStorage.getItem('commander_staff');
            if (!staff) { router.push('/commander/login').catch(() => { }); return; }
            const parsed = JSON.parse(staff);
            setVenueId(parsed.venue_id);
            if (parsed.venue_name) setVenueName(parsed.venue_name);
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

        lastFetchAt.current = Date.now();
        setLoading(false);
    }, [venueId]);

    useEffect(() => { if (venueId) fetchAll(); }, [venueId, fetchAll]);

    // Auto-refresh every 10s
    useEffect(() => {
        if (!venueId) return;
        const interval = setInterval(fetchAll, 10000);
        return () => clearInterval(interval);
    }, [venueId, fetchAll]);

    // 1-second tick for live countdown display
    useEffect(() => {
        const tick = setInterval(() => setTickCounter(c => c + 1), 1000);
        return () => clearInterval(tick);
    }, []);

    // Compute adjusted time_remaining accounting for seconds elapsed since last API fetch
    const adjustTime = useCallback((apiTimeRemaining) => {
        if (apiTimeRemaining == null) return null;
        const elapsed = Math.floor((Date.now() - lastFetchAt.current) / 1000);
        return Math.max(0, apiTimeRemaining - elapsed);
    }, [tickCounter]); // eslint-disable-line react-hooks/exhaustive-deps

    // Helper: get game + player info from table data
    const getTableGame = (table) => {
        const games = Array.isArray(table.commander_games) ? table.commander_games : [];
        return games.find(g => g.status !== 'closed') || games[0] || null;
    };

    const getSeatedCount = (table) => {
        const game = getTableGame(table);
        if (game && game.current_players) return game.current_players;
        if (table.seats && table.seats.length > 0) return table.seats.length;
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
                fetchAll();
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

    // ── Renders a single table visualization (reused in grid and fullscreen) ──
    const renderTableVisual = (table, isFullscreen = false) => {
        const tNum = table.table_number || table.number;
        const maxSeats = table.max_seats || 9;
        const game = getTableGame(table);
        const seatedCount = getSeatedCount(table);
        const seatData = table.seats || [];
        const hasTimed = seatData.some(s => s.time_remaining !== undefined && s.time_remaining !== null);
        const { dealerPos, seatPositions } = computeSeatPositions(maxSeats);

        // Build seat array — merge session data, table_seats data, then fill with anonymous badges
        const seatArr = Array.from({ length: maxSeats }, (_, i) => {
            const seatNum = i + 1;
            // Priority 1: session data (from dealer sessions API — has time_remaining)
            const session = seatData.find(s => s.seat_number === seatNum);
            if (session) return { number: seatNum, taken: session };
            // Priority 2: table_seats data (from tables API — has player_name)
            const tableSeat = (table.seats || []).find(s => s.seat_number === seatNum && s.status === 'occupied');
            if (tableSeat) return { number: seatNum, taken: { player_name: tableSeat.player_name, seat_number: seatNum } };
            return { number: seatNum, taken: null };
        });

        // If game has current_players but few/no seat records, fill with anonymous players
        const gamePlayers = game?.current_players || 0;
        const actuallySeated = seatArr.filter(s => s.taken).length;
        if (gamePlayers > actuallySeated) {
            let toFill = gamePlayers - actuallySeated;
            let pNum = 1;
            for (let i = 0; i < seatArr.length && toFill > 0; i++) {
                if (!seatArr[i].taken) {
                    seatArr[i].taken = { player_name: `P${pNum}`, seat_number: seatArr[i].number, _anonymous: true };
                    pNum++;
                    toFill--;
                }
            }
        }
        const occupiedCount = seatArr.filter(s => s.taken).length;

        const avatarSize = isFullscreen ? 64 : 52;
        const fontSize = isFullscreen ? 14 : 13;
        const nameMaxWidth = isFullscreen ? 140 : 110;

        return (
            <div style={{ position: 'relative', width: '100%', paddingBottom: isFullscreen ? '56%' : '64%', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: '1 / 1', marginTop: isFullscreen ? '-22%' : '-18%' }}>
                    {/* Poker table image */}
                    <img
                        src="/images/poker-table-black-gold.png"
                        alt="Poker Table"
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                        }}
                    />

                    {/* Game info in center */}
                    <div style={{
                        position: 'absolute', top: '48%', left: '50%',
                        transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                    }}>
                        <div style={{ fontSize: isFullscreen ? 15 : 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                            {venueName || 'Table'} #{tNum}
                        </div>
                        <div style={{ fontSize: isFullscreen ? 24 : 20, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1 }}>
                            {game ? (game.game_type || table.game_type || '').toUpperCase() : table.game_type?.toUpperCase() || ''}
                        </div>
                        <div style={{ fontSize: isFullscreen ? 18 : 16, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: 700 }}>
                            {game?.stakes || table.stakes || ''}
                        </div>
                    </div>

                    {/* Dealer badge */}
                    <div style={{
                        position: 'absolute', top: dealerPos.top, left: dealerPos.left,
                        transform: 'translate(-50%, -50%)', textAlign: 'center', width: isFullscreen ? 90 : 80, zIndex: 3,
                    }}>
                        <div style={{
                            width: isFullscreen ? 72 : 64, height: isFullscreen ? 72 : 64, borderRadius: '50%', margin: '0 auto 4px',
                            background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                            border: '3px solid #E4E6EB',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 16px rgba(24,119,242,0.4)',
                            fontSize: isFullscreen ? 32 : 28, fontWeight: 900, color: '#fff',
                        }}>D</div>
                        <div style={{ fontSize: isFullscreen ? 12 : 11, fontWeight: 700, color: '#1877F2', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {game?.dealer_name || game?.dealer_staff_id ? 'Dealer' : 'No Dealer'}
                        </div>
                    </div>

                    {/* Seat badges — matching tables.js avatar style */}
                    {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                        const pos = seatPositions[idx];
                        const isOccupied = !!seat.taken;
                        const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                        const fullName = seat.taken?.player_name || '';
                        const memberActive = seat.taken?.membership_status === 'active';

                        const leftPct = parseFloat(pos.left);
                        const isLeftSide = leftPct < 25;
                        const isRightSide = leftPct > 75;
                        const badgeTransform = isLeftSide
                            ? 'translate(-17px, -50%)'
                            : isRightSide
                                ? 'translate(calc(-100% + 17px), -50%)'
                                : 'translate(-50%, -50%)';
                        const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                        // Timer computation — live 1-second countdown
                        let timerText = null, timerColor = null;
                        if (isOccupied && seat.taken) {
                            if (seat.taken.time_remaining != null) {
                                const rem = adjustTime(seat.taken.time_remaining);
                                timerText = rem <= 0 ? 'EXPIRED' : formatTime(rem);
                                timerColor = getTimerColor(rem);
                            }
                        }

                        return (
                            <div key={seat.number} style={{
                                position: 'absolute', top: pos.top, left: pos.left,
                                transform: badgeTransform, zIndex: 2,
                                display: 'flex', flexDirection: badgeDirection, alignItems: 'center', gap: 8,
                                background: 'rgba(36,37,38,0.9)',
                                borderRadius: 12,
                                padding: '5px 10px 5px 5px',
                                border: `2px solid ${isOccupied
                                    ? (memberActive ? 'rgba(49,162,76,0.7)' : seat.taken?.membership_status ? 'rgba(239,68,68,0.5)' : 'rgba(24,119,242,0.5)')
                                    : 'rgba(62,64,66,0.6)'}`,
                                backdropFilter: 'blur(6px)',
                                minWidth: isFullscreen ? 80 : 70,
                            }}>
                                {/* Avatar circle */}
                                <div style={{
                                    width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isOccupied
                                        ? 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)'
                                        : 'rgba(255,255,255,0.06)',
                                    border: `2px solid ${isOccupied
                                        ? (memberActive ? '#31A24C' : seat.taken?.membership_status ? '#EF4444' : '#1877F2')
                                        : 'rgba(62,64,66,0.5)'}`,
                                    overflow: 'hidden',
                                }}>
                                    {isOccupied ? (
                                        <span style={{ fontSize: isFullscreen ? 24 : 20, fontWeight: 800, color: '#fff' }}>{firstName.charAt(0).toUpperCase()}</span>
                                    ) : (
                                        <span style={{ fontSize: isFullscreen ? 18 : 16, fontWeight: 600, color: '#B0B3B8' }}>{seat.number}</span>
                                    )}
                                </div>
                                {/* Name + Timer */}
                                <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                                    <div style={{
                                        fontSize, fontWeight: 600, lineHeight: 1.2,
                                        color: isOccupied ? '#E4E6EB' : '#B0B3B8',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        maxWidth: nameMaxWidth,
                                    }}>
                                        {isOccupied ? fullName : 'Open'}
                                    </div>
                                    {timerText && (
                                        <div style={{
                                            fontSize: isFullscreen ? 13 : 12, fontWeight: 700, color: timerColor,
                                            fontFamily: 'monospace', lineHeight: 1.2,
                                        }}>
                                            {timerText}
                                        </div>
                                    )}
                                    {isOccupied && seat.taken?.time_balance_minutes > 0 && (
                                        <div style={{ fontSize: isFullscreen ? 11 : 10, color: '#1877F2', fontWeight: 600 }}>
                                            {Math.floor(seat.taken.time_balance_minutes / 60)}h bal
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
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
                                {tables.length} tables — {activeTables.length} active • Tap to expand
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
                            {/* ACTIVE TABLES — expanded cards with full table visual */}
                            {activeTables.length > 0 && (
                                <>
                                    <h2 style={{ fontSize: 14, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Timer size={14} /> Active Tables ({activeTables.length})
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {activeTables.map(table => {
                                            const tNum = table.table_number || table.number;
                                            const maxSeats = table.max_seats || 9;
                                            const game = getTableGame(table);
                                            const seatedCount = getSeatedCount(table);

                                            return (
                                                <div key={table.id || tNum}
                                                    onClick={() => setFullscreenTable(table)}
                                                    style={{
                                                        background: '#1a1a2e', border: '2px solid rgba(49,162,76,0.3)', borderRadius: 16,
                                                        cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.2s, transform 0.2s',
                                                    }}>

                                                    {/* Table header — game info bar */}
                                                    <div style={{
                                                        padding: '12px 16px',
                                                        background: game?.status === 'running'
                                                            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                                            : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                                                        color: '#fff',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    }}>
                                                        <div>
                                                            <div style={{ fontSize: 16, fontWeight: 800 }}>
                                                                {game ? `${(game.game_type || table.game_type || 'NLH').toUpperCase()} ${game.stakes || ''}` : table.game_type ? `${table.game_type} ${table.stakes || ''}` : 'Cash Game'}
                                                            </div>
                                                            <div style={{ fontSize: 13, opacity: 0.9 }}>
                                                                Table {tNum}{table.table_name && table.table_name !== `Table ${tNum}` ? ` · ${table.table_name}` : ''} · {maxSeats}-max
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); openDealerScan(tNum); }}
                                                                style={{
                                                                    background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
                                                                    borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                                    fontSize: 10, fontWeight: 700, color: '#fff',
                                                                }}
                                                                title="Scan dealer QR code"
                                                            >
                                                                <ScanLine size={12} /> Dealer
                                                            </button>
                                                            <span style={{
                                                                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                                background: 'rgba(255,255,255,0.2)', textTransform: 'uppercase',
                                                                display: 'flex', alignItems: 'center', gap: 4,
                                                            }}>
                                                                <Users size={13} /> {seatedCount}/{maxSeats}
                                                            </span>
                                                            <Maximize2 size={14} color="rgba(255,255,255,0.7)" />
                                                        </div>
                                                    </div>

                                                    {/* Full poker table visualization */}
                                                    {renderTableVisual(table, false)}
                                                </div>
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
                                                <button key={table.id || tNum} onClick={() => setFullscreenTable(table)}
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
        @keyframes fullscreenIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>

            {/* ── FULLSCREEN TABLE POPUP ── */}
            {fullscreenTable && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0A0A0A', display: 'flex', flexDirection: 'column', animation: 'fullscreenIn 0.2s ease-out' }}>
                    {/* Fullscreen header */}
                    <div style={{
                        padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: fullscreenTable.status === 'in_use'
                            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                            : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                        color: '#fff', flexShrink: 0,
                    }}>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 800 }}>
                                Table {fullscreenTable.table_number}
                                {fullscreenTable.table_name && fullscreenTable.table_name !== `Table ${fullscreenTable.table_number}` ? ` · ${fullscreenTable.table_name}` : ''}
                            </div>
                            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>
                                {(() => {
                                    const g = getTableGame(fullscreenTable);
                                    return g
                                        ? `${(g.game_type || '').toUpperCase()} ${g.stakes || ''} · ${getSeatedCount(fullscreenTable)}/${fullscreenTable.max_seats || 9} seated`
                                        : `${(fullscreenTable.game_type || '').toUpperCase()} ${fullscreenTable.stakes || ''} · ${fullscreenTable.max_seats || 9} seats · ${STATUS_BADGE[fullscreenTable.status]?.label || fullscreenTable.status}`;
                                })()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button
                                onClick={() => openDealerScan(fullscreenTable.table_number)}
                                style={{
                                    background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
                                    borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    fontSize: 13, fontWeight: 700, color: '#fff',
                                }}
                            >
                                <ScanLine size={14} /> Scan Dealer
                            </button>
                            <button
                                onClick={() => setFullscreenTable(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                                    width: 40, height: 40, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={22} color="#fff" />
                            </button>
                        </div>
                    </div>

                    {/* Fullscreen table visual */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflow: 'hidden' }}>
                        <div style={{ width: '100%', maxWidth: 1000 }}>
                            {renderTableVisual(fullscreenTable, true)}
                        </div>
                    </div>

                    {/* Fullscreen footer — timer summary */}
                    {(() => {
                        const seatData = fullscreenTable.seats || [];
                        const timedSeats = seatData.filter(s => s.time_remaining !== undefined);
                        if (timedSeats.length === 0) return null;
                        return (
                            <div style={{
                                padding: '12px 20px', borderTop: '1px solid #3A3B3C',
                                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                                background: '#1a1a1a', flexShrink: 0,
                            }}>
                                {timedSeats.map((s, i) => {
                                    const adjTime = adjustTime(s.time_remaining);
                                    const tColor = getTimerColor(adjTime);
                                    return (
                                        <span key={i} style={{
                                            fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                            background: `${tColor}20`, color: tColor,
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                        }}>
                                            S{s.seat_number}: {adjTime <= 0 ? 'EXPIRED' : formatTime(adjTime)}
                                            {s.player_name && <span style={{ fontSize: 10, opacity: 0.7 }}>({s.player_name.split(' ')[0]})</span>}
                                        </span>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ── DEALER SCAN-IN MODAL ── */}
            {scanningTable && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
