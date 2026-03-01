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
    Maximize2, Minimize2, Copy, ExternalLink, Wifi, WifiOff, ChevronDown, ChevronUp, Link2,
    Lock, Unlock, ShieldCheck, Phone, AlertTriangle, Bell
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync, broadcastChange } from '../../src/lib/commander/useCommanderSync';

const STATUS_BADGE = {
    in_use: { bg: '#31A24C', label: 'Active' },
    available: { bg: '#1877F2', label: 'Open' },
    reserved: { bg: '#F59E0B', label: 'Reserved' },
    maintenance: { bg: '#6B7280', label: 'Maint.' },
};

// Full game type name mapping — never show abbreviations to dealers
const GAME_TYPE_MAP = {
    nlh: 'No Limit Hold\'em', nolimit: 'No Limit Hold\'em',
    plo: 'Pot Limit Omaha', potlimitomaha: 'Pot Limit Omaha',
    plh: 'Pot Limit Hold\'em',
    lh: 'Limit Hold\'em', limit: 'Limit Hold\'em',
    lo: 'Limit Omaha',
    mix: 'Mixed Games', mixed: 'Mixed Games',
    plo5: 'PLO 5-Card', plo6: 'PLO 6-Card',
    stud: 'Seven Card Stud', razz: 'Razz',
    horse: 'H.O.R.S.E.',
};
function getFullGameName(type) {
    if (!type) return 'Cash Game';
    return GAME_TYPE_MAP[type.toLowerCase()] || type.toUpperCase();
}
function isTournamentTable(table) {
    const mode = table.mode || table.table_purpose || 'cash';
    return mode === 'tournament';
}
function formatStakes(stakes) {
    if (!stakes) return '';
    // Already has $ → return as is
    if (stakes.includes('$')) return stakes;
    // Format: "1/2" → "$1/$2"
    const parts = stakes.split('/');
    return parts.map(p => `$${p.trim()}`).join('/');
}

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
    const [dealerMap, setDealerMap] = useState({}); // table_number -> dealer_name
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
    // Tablet assignment panel
    const [showAssignPanel, setShowAssignPanel] = useState(false);
    const [displayStatus, setDisplayStatus] = useState({}); // table_number -> { is_online, last_heartbeat }
    const [copiedTable, setCopiedTable] = useState(null);
    // Tablet lock mode
    const [lockedTable, setLockedTable] = useState(null); // table_number that is locked
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinValue, setPinValue] = useState('');
    const [pinError, setPinError] = useState('');
    const [pinLoading, setPinLoading] = useState(false);
    // Player interactions (fullscreen mode)
    const [showPlayerMenu, setShowPlayerMenu] = useState(null); // { number, taken, tableNumber }
    const [playerActionLoading, setPlayerActionLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [seatScanner, setSeatScanner] = useState(null); // { tableNumber, seatNumber }
    const seatScannerVideoRef = useRef(null);
    const seatScannerStreamRef = useRef(null);
    const [movingPlayer, setMovingPlayer] = useState(null); // { seat, player_name, tableNumber }
    // Call Clock (60-second countdown)
    const [callClockSeconds, setCallClockSeconds] = useState(null);
    const callClockRef = useRef(null);
    // Call Floor state
    const [callFloorSending, setCallFloorSending] = useState(false);
    const [callFloorSent, setCallFloorSent] = useState(false);

    useEffect(() => {
        try {
            const staff = localStorage.getItem('commander_staff');
            if (!staff) { router.push('/commander/login').catch(() => { }); return; }
            const parsed = JSON.parse(staff);
            setVenueId(parsed.venue_id);
            if (parsed.venue_name) setVenueName(parsed.venue_name);
        } catch { router.push('/commander/login').catch(() => { }); }

        // Restore locked table from localStorage
        try {
            const saved = localStorage.getItem('tablet_locked_table');
            if (saved) {
                const { table_number, venue_id: savedVenue } = JSON.parse(saved);
                if (table_number) setLockedTable(table_number);
            }
        } catch { /* ignore */ }
    }, [router]);

    // When locked table is set, also set it as the fullscreen table
    useEffect(() => {
        if (lockedTable && tables.length > 0) {
            const table = tables.find(t => (t.table_number || t.number) === lockedTable);
            if (table) setFullscreenTable(table);
        }
    }, [lockedTable, tables]);

    // Browser back/navigation prevention when locked
    useEffect(() => {
        if (!lockedTable) return;
        const handleBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
        const handlePopState = (e) => { window.history.pushState(null, '', window.location.href); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);
        window.history.pushState(null, '', window.location.href);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [lockedTable]);

    // Lock a table
    const lockToTable = (tableNumber) => {
        setLockedTable(tableNumber);
        localStorage.setItem('tablet_locked_table', JSON.stringify({ table_number: tableNumber, venue_id: venueId }));
    };

    // Unlock with PIN
    const handleUnlockAttempt = async () => {
        if (!pinValue || pinValue.length !== 4) { setPinError('Enter your 4-digit PIN'); return; }
        setPinLoading(true);
        setPinError('');
        try {
            const res = await fetch('/api/commander/staff/verify-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin_code: pinValue, venue_id: venueId }),
            });
            const json = await res.json();
            if (json.success && json.data?.staff) {
                const role = json.data.staff.role;
                if (role === 'owner' || role === 'manager') {
                    // Unlock!
                    setLockedTable(null);
                    setFullscreenTable(null);
                    setShowPinModal(false);
                    setPinValue('');
                    localStorage.removeItem('tablet_locked_table');
                } else {
                    setPinError('Owner or Manager PIN required');
                }
            } else {
                setPinError(json.error || 'Invalid PIN');
            }
        } catch {
            setPinError('Network error — try again');
        }
        setPinLoading(false);
    };

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
                                session_status: s.session_status || 'active',
                                missed_blinds: s.missed_blinds || 0,
                                session_id: s.session_id,
                                member_number: s.member_number,
                                status: 'occupied',
                            }))
                        };
                    });
                }

                setTables(tablesArr);
            }
        } catch (err) { console.error('Failed to fetch tables:', err); }

        lastFetchAt.current = Date.now();
        setLoading(false);

        // Fetch active dealer rotations — maps table_number to dealer_name
        try {
            const rotRes = await fetch(`/api/commander/dealers/rotations?venue_id=${venueId}`, { headers });
            const rotData = await rotRes.json();
            if (rotData.success) {
                const rots = rotData.data?.rotations || rotData.data || [];
                const map = {};
                (Array.isArray(rots) ? rots : []).forEach(r => {
                    if (r.table_number && !r.ended_at) {
                        map[r.table_number] = r.dealer_name || r.commander_dealers?.name || 'Dealer';
                    }
                });
                setDealerMap(map);
            }
        } catch (err) { console.error('Failed to fetch dealer rotations:', err); }
    }, [venueId]);

    useEffect(() => { if (venueId) { fetchAll(); fetchDisplayStatus(); } }, [venueId, fetchAll]);

    // Fetch tablet online status from commander_table_displays
    const fetchDisplayStatus = useCallback(async () => {
        if (!venueId) return;
        try {
            const staffSession = localStorage.getItem('commander_staff') || '';
            const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
            const res = await fetch(`/api/commander/displays/status?venue_id=${venueId}`, {
                headers: { 'x-staff-session': staffSession, Authorization: `Bearer ${token}` },
            });
            const json = await res.json();
            if (json.success && json.data) {
                const map = {};
                json.data.forEach(d => {
                    const tNum = d.device_id?.match(/table-(\d+)/)?.[1];
                    if (tNum) map[parseInt(tNum)] = { is_online: d.is_online, last_heartbeat: d.last_heartbeat };
                });
                setDisplayStatus(map);
            }
        } catch { /* non-fatal */ }
    }, [venueId]);

    const copyTabletUrl = (tableNum) => {
        const url = `${window.location.origin}/commander/tablet/${tableNum}${venueId ? `?venue=${venueId}` : ''}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiedTable(tableNum);
            setTimeout(() => setCopiedTable(null), 2000);
        }).catch(() => { });
    };

    // Auto-refresh every 10s
    useEffect(() => {
        if (!venueId) return;
        const interval = setInterval(fetchAll, 30000); // fallback — real-time sync handles instant updates
        return () => clearInterval(interval);
    }, [venueId, fetchAll]);

    // Commander Data Bus — instant cross-tab sync for tables, games, dealers
    useCommanderSync(venueId, fetchAll, { entities: ['tables', 'games', 'dealers'] });

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

    const activeCashTables = tables.filter(t => t.status === 'in_use' && !isTournamentTable(t));
    const activeTournamentTables = tables.filter(t => t.status === 'in_use' && isTournamentTable(t));
    const activeTables = [...activeCashTables, ...activeTournamentTables];
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
            const res = await fetch('/api/commander/dealer/scan-in', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ venue_id: venueId, qr_code: qrCode, table_number: scanningTable }),
            });
            const data = await res.json();
            if (data.success) {
                setScanResult({
                    dealer_name: data.data?.dealer?.name || data.data?.dealer_name || 'Dealer',
                    table_number: data.data?.table_number || scanningTable,
                });
                fetchAll();
                broadcastChange('dealers');
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

    // ── Toast auto-clear ──
    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }
    }, [toast]);

    // ── Player action handlers (for fullscreen mode) ──
    const callSessionAction = async (tableNumber, seatNumber, action, extra = {}) => {
        setPlayerActionLoading(true);
        try {
            const res = await fetch('/api/commander/dealer/session-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table_number: tableNumber, seat_number: seatNumber, venue_id: venueId, action, ...extra }),
            });
            const json = await res.json();
            setPlayerActionLoading(false);
            return json;
        } catch {
            setPlayerActionLoading(false);
            return { success: false, error: 'Network error' };
        }
    };

    const removePlayer = async (tableNumber, seatNumber) => {
        setPlayerActionLoading(true);
        try {
            const res = await fetch('/api/commander/dealer/player-unseat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table_number: tableNumber, seat_number: seatNumber }),
            });
            const json = await res.json();
            if (json.success) {
                setToast({ type: 'success', text: `${json.data.player_name} removed · ${json.data.unused_minutes_returned}m returned` });
                setShowPlayerMenu(null);
                fetchAll();
            } else {
                setToast({ type: 'error', text: json.error || 'Failed to remove player' });
            }
        } catch { setToast({ type: 'error', text: 'Network error' }); }
        setPlayerActionLoading(false);
    };

    const handleSeatScan = async (qrData, tableNumber, seatNumber) => {
        closeSeatScanner();
        try {
            const res = await fetch('/api/commander/dealer/player-scan-in', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_code: qrData, table_number: tableNumber, seat_number: seatNumber, venue_id: venueId }),
            });
            const json = await res.json();
            if (json.success) {
                setToast({ type: 'success', text: `✅ ${json.data.player_name} seated at S${seatNumber}` });
                fetchAll();
            } else {
                setToast({ type: 'error', text: json.error || 'Could not seat player' });
            }
        } catch { setToast({ type: 'error', text: 'Network error' }); }
    };

    const openSeatScanner = (tableNumber, seatNumber) => {
        setSeatScanner({ tableNumber, seatNumber });
        setShowPlayerMenu(null);
        setTimeout(async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
                });
                seatScannerStreamRef.current = stream;
                if (seatScannerVideoRef.current) {
                    seatScannerVideoRef.current.srcObject = stream;
                    seatScannerVideoRef.current.play();
                }
                if ('BarcodeDetector' in window) {
                    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                    const scanLoop = async () => {
                        if (!seatScannerStreamRef.current || !seatScannerVideoRef.current) return;
                        try {
                            const barcodes = await detector.detect(seatScannerVideoRef.current);
                            if (barcodes.length > 0) {
                                handleSeatScan(barcodes[0].rawValue, tableNumber, seatNumber);
                                return;
                            }
                        } catch { }
                        if (seatScannerStreamRef.current) requestAnimationFrame(scanLoop);
                    };
                    setTimeout(scanLoop, 500);
                }
            } catch {
                setToast({ type: 'error', text: 'Camera access denied — use manual entry' });
            }
        }, 200);
    };

    const closeSeatScanner = () => {
        if (seatScannerStreamRef.current) {
            seatScannerStreamRef.current.getTracks().forEach(t => t.stop());
            seatScannerStreamRef.current = null;
        }
        setSeatScanner(null);
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
                        <div style={{ fontSize: isFullscreen ? 16 : 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                            {venueName || ''}{venueName ? ' · ' : ''}TABLE {tNum}
                        </div>
                        <div style={{ fontSize: isFullscreen ? 22 : 18, fontWeight: 800, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5 }}>
                            {isTournamentTable(table) && !game?.game_type && !table.game_type ? 'Tournament' : getFullGameName(game?.game_type || table.game_type)}
                        </div>
                        <div style={{ fontSize: isFullscreen ? 20 : 16, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: 700 }}>
                            {formatStakes(game?.stakes || table.stakes)}
                        </div>
                        {table.table_purpose && (
                            <div style={{ fontSize: isFullscreen ? 11 : 9, fontWeight: 800, marginTop: 6, padding: '2px 10px', borderRadius: 4, display: 'inline-block', letterSpacing: 1.5, textTransform: 'uppercase', background: isTournamentTable(table) ? 'rgba(245,158,11,0.3)' : table.table_purpose === 'must_move' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)', color: isTournamentTable(table) ? '#F59E0B' : table.table_purpose === 'must_move' ? '#F59E0B' : '#22c55e', border: `1px solid ${isTournamentTable(table) ? 'rgba(245,158,11,0.5)' : table.table_purpose === 'must_move' ? 'rgba(245,158,11,0.5)' : 'rgba(34,197,94,0.5)'}` }}>
                                {isTournamentTable(table) ? 'Tournament' : table.table_purpose === 'must_move' ? 'Must Move' : 'Main Game'}
                            </div>
                        )}
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
                            {dealerMap[tNum] || game?.dealer_name || 'No Dealer'}
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

                        // Timer computation — live 1-second countdown (FREEZE when paused/meal_break)
                        let timerText = null, timerColor = null;
                        const isPausedOrBreak = seat.taken?.session_status === 'paused' || seat.taken?.session_status === 'meal_break';
                        if (isOccupied && seat.taken) {
                            if (seat.taken.time_remaining != null) {
                                const rem = isPausedOrBreak ? Math.max(0, seat.taken.time_remaining) : adjustTime(seat.taken.time_remaining);
                                timerText = rem <= 0 ? 'EXPIRED' : (isPausedOrBreak ? `⏸ ${formatTime(rem)}` : formatTime(rem));
                                timerColor = isPausedOrBreak ? '#8A8D91' : getTimerColor(rem);
                            }
                        }

                        return (
                            <div key={seat.number}
                                onClick={isFullscreen ? () => {
                                    if (movingPlayer && !isOccupied) {
                                        // Complete the move
                                        (async () => {
                                            const json = await callSessionAction(movingPlayer.tableNumber, movingPlayer.seat.number, 'move', { target_seat: seat.number });
                                            if (json.success) {
                                                setToast({ type: 'success', text: `✅ ${json.data.player_name} moved S${json.data.from_seat} → S${json.data.to_seat}` });
                                                fetchAll();
                                            } else {
                                                setToast({ type: 'error', text: json.error || 'Move failed' });
                                            }
                                            setMovingPlayer(null);
                                        })();
                                        return;
                                    }
                                    if (movingPlayer && isOccupied) { setToast({ type: 'error', text: 'Seat occupied — pick an empty seat' }); return; }
                                    if (isOccupied) setShowPlayerMenu({ ...seat, tableNumber: tNum });
                                    else openSeatScanner(tNum, seat.number);
                                } : undefined}
                                style={{
                                    position: 'absolute', top: pos.top, left: pos.left,
                                    transform: badgeTransform, zIndex: 2,
                                    cursor: isFullscreen ? 'pointer' : 'default',
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
                                        <span style={{ fontSize: isFullscreen ? 18 : 16, fontWeight: 600, color: movingPlayer && isFullscreen ? '#22c55e' : '#B0B3B8' }}>{seat.number}</span>
                                    )}
                                    {/* Missed Blinds Sticker — overlays top-right of avatar */}
                                    {isOccupied && (seat.taken?.missed_blinds || 0) > 0 && (
                                        <div style={{
                                            position: 'absolute', top: -4, right: -4,
                                            width: isFullscreen ? 22 : 18, height: isFullscreen ? 22 : 18,
                                            borderRadius: '50%',
                                            background: (seat.taken.missed_blinds >= 2) ? '#EF4444' : '#F97316',
                                            border: '2px solid #242526',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: isFullscreen ? 10 : 8, fontWeight: 900, color: '#fff',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                                            zIndex: 3,
                                        }}>
                                            {seat.taken.missed_blinds}
                                        </div>
                                    )}
                                </div>
                                {/* Name + Timer */}
                                <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                                    <div style={{
                                        fontSize, fontWeight: 600, lineHeight: 1.2,
                                        color: isOccupied ? '#E4E6EB' : (movingPlayer && isFullscreen ? '#22c55e' : '#B0B3B8'),
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        maxWidth: nameMaxWidth, position: 'relative',
                                    }}>
                                        {isOccupied ? fullName : (movingPlayer && isFullscreen ? 'Move here' : (isFullscreen ? 'Open' : 'Open'))}

                                    </div>
                                    {/* Session Status (Paused / Meal Break) */}
                                    {isOccupied && seat.taken?.session_status && seat.taken.session_status !== 'active' && (
                                        <div style={{ fontSize: isFullscreen ? 11 : 10, fontWeight: 700, color: seat.taken.session_status === 'meal_break' ? '#22c55e' : '#F59E0B', lineHeight: 1.2 }}>
                                            {seat.taken.session_status === 'paused' ? '⏸️ PAUSED' : '🍽️ MEAL BREAK'}
                                        </div>
                                    )}
                                    {!isOccupied && isFullscreen && (
                                        <div style={{ fontSize: 10, color: movingPlayer ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.25)' }}>{movingPlayer ? 'Tap to confirm' : 'Tap to seat'}</div>
                                    )}
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

                    {/* ── Tablet Assignment Panel ────────── */}
                    <div style={{ background: '#242526', border: '1px solid #3A3B3C', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
                        <button
                            onClick={() => setShowAssignPanel(!showAssignPanel)}
                            style={{
                                width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: 'transparent', border: 'none', cursor: 'pointer', color: '#E4E6EB',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Link2 size={16} color="#1877F2" />
                                <span style={{ fontSize: 14, fontWeight: 700 }}>Tablet Assignment</span>
                                <span style={{ fontSize: 11, color: '#8A8D91', fontWeight: 500 }}>
                                    Copy a URL → open on tablet → done
                                </span>
                            </div>
                            {showAssignPanel ? <ChevronUp size={16} color="#B0B3B8" /> : <ChevronDown size={16} color="#B0B3B8" />}
                        </button>
                        {showAssignPanel && (
                            <div style={{ padding: '0 16px 16px', borderTop: '1px solid #3A3B3C' }}>
                                <p style={{ fontSize: 12, color: '#8A8D91', margin: '12px 0 12px', lineHeight: 1.5 }}>
                                    Each table gets a unique URL. Open this URL in the tablet browser and it will auto-display that table fullscreen.
                                    Tablets auto-register and show as online when the page is active.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                                    {tables.map(table => {
                                        const tNum = table.table_number || table.number;
                                        const status = displayStatus[tNum];
                                        const isOnline = status?.is_online && status?.last_heartbeat &&
                                            (Date.now() - new Date(status.last_heartbeat).getTime()) < 120000; // 2 min threshold
                                        const isCopied = copiedTable === tNum;
                                        return (
                                            <div key={tNum} style={{
                                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                                background: '#1a1b1d', border: '1px solid #3A3B3C', borderRadius: 10,
                                            }}>
                                                {/* Online indicator */}
                                                <div style={{
                                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                    background: isOnline ? '#31A24C' : '#4E4F50',
                                                    boxShadow: isOnline ? '0 0 6px rgba(49,162,76,0.5)' : 'none',
                                                }} title={isOnline ? 'Tablet Online' : 'Tablet Offline'} />
                                                {/* Table info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#E4E6EB' }}>Table {tNum}</div>
                                                    <div style={{ fontSize: 10, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        /commander/tablet/{tNum}
                                                    </div>
                                                </div>
                                                {/* Actions */}
                                                <button
                                                    onClick={() => copyTabletUrl(tNum)}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                        background: isCopied ? '#31A24C' : '#3A3B3C',
                                                        color: isCopied ? '#fff' : '#B0B3B8',
                                                        border: 'none', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    {isCopied ? <><CheckCircle size={12} /> Copied</> : <><Copy size={12} /> Copy URL</>}
                                                </button>
                                                <a
                                                    href={`/commander/tablet/${tNum}${venueId ? `?venue=${venueId}` : ''}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    style={{
                                                        padding: '6px 10px', borderRadius: 8,
                                                        background: 'rgba(24,119,242,0.1)', border: '1px solid rgba(24,119,242,0.3)',
                                                        color: '#1877F2', textDecoration: 'none',
                                                        display: 'flex', alignItems: 'center',
                                                    }}
                                                    title="Preview in new tab"
                                                >
                                                    <ExternalLink size={12} />
                                                </a>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
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
                                Go to Tables & Floor
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* ACTIVE TOURNAMENT TABLES — amber section */}
                            {activeTournamentTables.length > 0 && (
                                <>
                                    <h2 style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Trophy size={14} /> Tournament Tables ({activeTournamentTables.length})
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {activeTournamentTables.map(table => {
                                            const tNum = table.table_number || table.number;
                                            const maxSeats = table.max_seats || 9;
                                            const game = getTableGame(table);
                                            const seatedCount = getSeatedCount(table);

                                            return (
                                                <div key={table.id || tNum}
                                                    onClick={() => setFullscreenTable(table)}
                                                    style={{
                                                        background: '#1a1a2e', border: '2px solid rgba(245,158,11,0.4)', borderRadius: 16,
                                                        cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.2s, transform 0.2s',
                                                    }}>

                                                    {/* Table header — tournament amber gradient */}
                                                    <div style={{
                                                        padding: '12px 16px',
                                                        background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                                                        color: '#fff',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    }}>
                                                        <div>
                                                            <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <Trophy size={16} />
                                                                {formatStakes(game?.stakes || table.stakes)} {game?.game_type || table.game_type ? getFullGameName(game?.game_type || table.game_type) : 'Tournament'}
                                                            </div>
                                                            <div style={{ fontSize: 13, opacity: 0.9 }}>
                                                                Table {tNum}{table.table_name && table.table_name !== `Table ${tNum}` ? ` · ${table.table_name}` : ''} · {maxSeats}-max · Tournament
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>
                                                                <Users size={14} /> {seatedCount}/{maxSeats}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'pulse 2s infinite' }} />
                                                                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>TOURNAMENT</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Table visual */}
                                                    <div style={{ padding: '12px 16px 16px' }}>
                                                        {renderTableVisual(table)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* ACTIVE CASH TABLES — expanded cards with full table visual */}
                            {activeCashTables.length > 0 && (
                                <>
                                    <h2 style={{ fontSize: 14, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Timer size={14} /> Active Cash Tables ({activeCashTables.length})
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {activeCashTables.map(table => {
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
                                                        background: isTournamentTable(table)
                                                            ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                                                            : game?.status === 'running'
                                                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                                                : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                                                        color: '#fff',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    }}>
                                                        <div>
                                                            <div style={{ fontSize: 16, fontWeight: 800 }}>
                                                                {formatStakes(game?.stakes || table.stakes)} {getFullGameName(game?.game_type || table.game_type)}
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
        @keyframes pulse { from { transform: scale(1); opacity: 1; } to { transform: scale(1.08); opacity: 0.85; } }
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
                            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
                                Table {fullscreenTable.table_number}
                                {fullscreenTable.table_name && fullscreenTable.table_name !== `Table ${fullscreenTable.table_number}` ? ` · ${fullscreenTable.table_name}` : ''}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 700, opacity: 0.95, marginTop: 4 }}>
                                {(() => {
                                    const g = getTableGame(fullscreenTable);
                                    const gameType = getFullGameName(g?.game_type || fullscreenTable.game_type);
                                    const stakes = formatStakes(g?.stakes || fullscreenTable.stakes);
                                    return g
                                        ? `${stakes} ${gameType} · ${getSeatedCount(fullscreenTable)}/${fullscreenTable.max_seats || 9} seated`
                                        : `${stakes} ${gameType} · ${fullscreenTable.max_seats || 9} seats`;
                                })()}
                            </div>
                            {fullscreenTable.table_purpose && (
                                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 4, marginTop: 4, display: 'inline-block', letterSpacing: 1.5, textTransform: 'uppercase', background: isTournamentTable(fullscreenTable) ? 'rgba(245,158,11,0.4)' : fullscreenTable.table_purpose === 'must_move' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.2)', color: isTournamentTable(fullscreenTable) ? '#FCD34D' : fullscreenTable.table_purpose === 'must_move' ? '#FCD34D' : '#fff' }}>
                                    {isTournamentTable(fullscreenTable) ? 'Tournament' : fullscreenTable.table_purpose === 'must_move' ? 'Must Move' : 'Main Game'}
                                </span>
                            )}
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
                            {!lockedTable ? (
                                <>
                                    {/* Lock button */}
                                    <button
                                        onClick={() => lockToTable(fullscreenTable.table_number || fullscreenTable.number)}
                                        style={{
                                            background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)',
                                            borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            fontSize: 13, fontWeight: 700, color: '#F59E0B',
                                        }}
                                        title="Lock tablet to this table"
                                    >
                                        <Lock size={14} /> Lock Tablet
                                    </button>
                                    {/* Close button */}
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
                                </>
                            ) : (
                                /* Locked — show unlock button */
                                <button
                                    onClick={() => { setShowPinModal(true); setPinValue(''); setPinError(''); }}
                                    style={{
                                        background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
                                        borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        fontSize: 13, fontWeight: 700, color: '#EF4444',
                                    }}
                                    title="Unlock — requires manager PIN"
                                >
                                    <Unlock size={14} /> Unlock
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Fullscreen table visual */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ width: '100%', maxWidth: 1000 }}>
                            {renderTableVisual(fullscreenTable, true)}
                        </div>

                        {/* ── Call Clock Countdown (bottom-right) ── */}
                        {callClockSeconds !== null && (
                            <div
                                onClick={() => { clearInterval(callClockRef.current); setCallClockSeconds(null); }}
                                style={{
                                    position: 'absolute', bottom: 20, right: 20, zIndex: 100,
                                    width: 100, height: 100, borderRadius: '50%',
                                    background: callClockSeconds <= 10 ? 'rgba(239,68,68,0.9)' : 'rgba(24,119,242,0.9)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                                    border: `3px solid ${callClockSeconds <= 10 ? '#EF4444' : '#1877F2'}`,
                                    animation: callClockSeconds <= 10 ? 'pulse 0.5s infinite alternate' : 'none',
                                    transition: 'background 0.3s, border-color 0.3s',
                                }}>
                                <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{callClockSeconds}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>CALL CLOCK</div>
                            </div>
                        )}

                        {/* ── Floating Action Buttons (bottom corners) ── */}
                        <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', zIndex: 50, pointerEvents: 'none' }}>
                            {/* Call Floor — bottom-left */}
                            <button
                                disabled={callFloorSending || callFloorSent}
                                onClick={async () => {
                                    setCallFloorSending(true);
                                    try {
                                        const tNum = fullscreenTable.table_number;
                                        const res = await fetch('/api/commander/floor-call', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ venue_id: venueId, table_number: tNum, table_name: fullscreenTable.table_name || `Table ${tNum}` }),
                                        });
                                        const json = await res.json();
                                        if (json.success) {
                                            setCallFloorSent(true);
                                            setToast({ type: 'success', text: `📢 Floor called — Table ${tNum}` });
                                            broadcastChange('floor_calls');
                                            setTimeout(() => setCallFloorSent(false), 30000);
                                        } else {
                                            setToast({ type: 'error', text: json.error || 'Floor call failed' });
                                        }
                                    } catch { setToast({ type: 'error', text: 'Network error' }); }
                                    setCallFloorSending(false);
                                }}
                                style={{
                                    pointerEvents: 'auto',
                                    background: callFloorSent ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)', border: 'none',
                                    borderRadius: 14, padding: '14px 24px', cursor: callFloorSent ? 'default' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    fontSize: 15, fontWeight: 800, color: '#fff',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                                    opacity: callFloorSending ? 0.6 : 1,
                                }}
                            >
                                <Phone size={18} />
                                {callFloorSent ? '✓ Floor Called' : callFloorSending ? 'Calling...' : 'Call Floor'}
                            </button>

                            {/* Call Clock — bottom-right */}
                            {callClockSeconds === null && (
                                <button
                                    onClick={() => {
                                        setCallClockSeconds(60);
                                        if (callClockRef.current) clearInterval(callClockRef.current);
                                        callClockRef.current = setInterval(() => {
                                            setCallClockSeconds(prev => {
                                                if (prev <= 1) { clearInterval(callClockRef.current); callClockRef.current = null; return 0; }
                                                return prev - 1;
                                            });
                                        }, 1000);
                                    }}
                                    style={{
                                        pointerEvents: 'auto',
                                        background: 'rgba(24,119,242,0.9)', border: 'none',
                                        borderRadius: 14, padding: '14px 24px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        fontSize: 15, fontWeight: 800, color: '#fff',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                                    }}
                                >
                                    <Timer size={18} />
                                    Call Clock (60s)
                                </button>
                            )}
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
                    {/* ── Toast Notification ── */}
                    {toast && (
                        <div style={{
                            position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 10001,
                            padding: '12px 24px', borderRadius: 14,
                            background: toast.type === 'success' ? 'rgba(49,162,76,0.95)' : 'rgba(239,68,68,0.95)',
                            color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}>
                            {toast.text}
                        </div>
                    )}

                    {/* ── Move Mode Banner ── */}
                    {movingPlayer && (
                        <div style={{
                            position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 10001,
                            padding: '10px 20px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12,
                            background: 'rgba(24,119,242,0.95)', color: '#fff', fontSize: 14, fontWeight: 700,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}>
                            🪑 Moving {movingPlayer.player_name} — tap an empty seat
                            <button onClick={() => { setMovingPlayer(null); setToast({ type: 'success', text: 'Move cancelled' }); }}
                                style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >Cancel</button>
                        </div>
                    )}
                </div>
            )}

            {/* ── PLAYER ACTION MENU (fullscreen mode) ── */}
            {showPlayerMenu && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setShowPlayerMenu(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: '#242526', borderRadius: 20, padding: '24px', width: '90%', maxWidth: 340, border: '2px solid #3A3B3C', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 10px', background: 'linear-gradient(135deg, #1877F2, #1565c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#fff' }}>
                                {(showPlayerMenu.taken?.player_name || 'P').charAt(0).toUpperCase()}
                            </div>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>{showPlayerMenu.taken?.player_name || 'Player'}</h3>
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8D91' }}>Seat {showPlayerMenu.number} · Table {showPlayerMenu.tableNumber}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                { label: '🪑 Move Player', color: '#1877F2', action: () => { setMovingPlayer({ seat: showPlayerMenu, player_name: showPlayerMenu.taken?.player_name || 'Player', tableNumber: showPlayerMenu.tableNumber }); setShowPlayerMenu(null); setToast({ type: 'success', text: `Tap an empty seat to move ${showPlayerMenu.taken?.player_name || 'player'}` }); } },
                                { label: '❌ Remove Player', color: '#EF4444', action: () => removePlayer(showPlayerMenu.tableNumber, showPlayerMenu.number) },
                                ...(showPlayerMenu.taken?.session_status === 'paused' || showPlayerMenu.taken?.session_status === 'meal_break'
                                    ? [{ label: '▶️ Resume Timer', color: '#22c55e', action: async () => { const json = await callSessionAction(showPlayerMenu.tableNumber, showPlayerMenu.number, 'resume'); if (json.success) { setToast({ type: 'success', text: `▶️ ${json.data.player_name} resumed` }); } else { setToast({ type: 'error', text: json.error || 'Resume failed' }); } setShowPlayerMenu(null); fetchAll(); } }]
                                    : [{ label: '⏸️ Pause Timer', color: '#F59E0B', action: async () => { const json = await callSessionAction(showPlayerMenu.tableNumber, showPlayerMenu.number, 'pause'); if (json.success) { setToast({ type: 'success', text: `⏸️ ${json.data.player_name} paused` }); } else { setToast({ type: 'error', text: json.error || 'Pause failed' }); } setShowPlayerMenu(null); fetchAll(); } }]
                                ),
                                { label: '⚠️ Missed Blinds', color: '#F97316', action: async () => { const json = await callSessionAction(showPlayerMenu.tableNumber, showPlayerMenu.number, 'missed_blinds'); if (json.success) { const count = json.data.missed_blinds_count; if (count >= 3) { setToast({ type: 'error', text: `🚫 ${json.data.player_name} removed — 3 missed blinds` }); await removePlayer(showPlayerMenu.tableNumber, showPlayerMenu.number); } else { setToast({ type: 'success', text: `⚠️ Missed blind #${count} for ${json.data.player_name}` }); } fetchAll(); } else { setToast({ type: 'error', text: json.error || 'Failed' }); } setShowPlayerMenu(null); } },
                                { label: '🍽️ 30-Min Meal Break', color: '#8B5CF6', action: async () => { const json = await callSessionAction(showPlayerMenu.tableNumber, showPlayerMenu.number, 'meal_break'); if (json.success) { setToast({ type: 'success', text: `🍽️ 30-min meal break for ${json.data.player_name}` }); } else { setToast({ type: 'error', text: json.error || 'Failed' }); } setShowPlayerMenu(null); fetchAll(); } },
                            ].map((btn, i) => (
                                <button key={i} onClick={btn.action} disabled={playerActionLoading}
                                    style={{ padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: `${btn.color}15`, color: btn.color, fontSize: 15, fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.15s' }}
                                >{btn.label}</button>
                            ))}
                        </div>
                        <button onClick={() => setShowPlayerMenu(null)} style={{ width: '100%', marginTop: 12, padding: '12px', borderRadius: 12, background: '#3A3B3C', border: 'none', color: '#8A8D91', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* ── SEAT SCANNER MODAL ── */}
            {seatScanner && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 10003, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📸</div>
                        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: 0 }}>Scan Player for Seat {seatScanner.seatNumber}</h3>
                        <p style={{ fontSize: 13, color: '#8A8D91', margin: '6px 0 0' }}>Hold QR code in front of camera</p>
                    </div>
                    <div style={{ width: '90%', maxWidth: 400, aspectRatio: '4/3', borderRadius: 16, overflow: 'hidden', border: '3px solid #1877F2', position: 'relative' }}>
                        <video ref={seatScannerVideoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); const val = e.target.elements.qr.value.trim(); if (val) handleSeatScan(val, seatScanner.tableNumber, seatScanner.seatNumber); }}
                        style={{ display: 'flex', gap: 8, marginTop: 16, width: '90%', maxWidth: 400 }}>
                        <input name="qr" type="text" placeholder="Or enter QR code manually..."
                            style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '2px solid #3A3B3C', background: '#18191A', color: '#E4E6EB', fontSize: 14, outline: 'none' }} autoComplete="off" />
                        <button type="submit" style={{ padding: '12px 20px', borderRadius: 12, background: '#1877F2', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Scan</button>
                    </form>
                    <button onClick={closeSeatScanner} style={{ marginTop: 12, padding: '14px 48px', borderRadius: 12, background: '#EF4444', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
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

            {/* ── PIN UNLOCK MODAL ── */}
            {showPinModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={() => setShowPinModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)' }} />
                    <div style={{
                        position: 'relative', background: '#242526', borderRadius: 20,
                        width: '90%', maxWidth: 360, padding: 32,
                        border: '2px solid #3A3B3C', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                    }}>
                        {/* Header */}
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px',
                                background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <ShieldCheck size={32} color="#EF4444" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff' }}>Unlock Tablet</h3>
                            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8A8D91' }}>
                                Enter manager or owner PIN to unlock
                            </p>
                        </div>

                        {/* PIN display */}
                        <div style={{
                            display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20,
                        }}>
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} style={{
                                    width: 40, height: 48, borderRadius: 10,
                                    background: pinValue.length > i ? '#1877F2' : '#3A3B3C',
                                    border: `2px solid ${pinValue.length > i ? '#1877F2' : '#4E4F50'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s',
                                }}>
                                    {pinValue.length > i && (
                                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff' }} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Error */}
                        {pinError && (
                            <div style={{
                                padding: '8px 12px', marginBottom: 16, borderRadius: 10,
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                color: '#EF4444', fontSize: 13, fontWeight: 600, textAlign: 'center',
                            }}>
                                {pinError}
                            </div>
                        )}

                        {/* Numeric keypad */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        if (key === null) return;
                                        if (key === 'del') { setPinValue(v => v.slice(0, -1)); setPinError(''); }
                                        else if (pinValue.length < 4) { setPinValue(v => v + key); setPinError(''); }
                                    }}
                                    style={{
                                        padding: '16px 0', borderRadius: 12,
                                        background: key === null ? 'transparent' : key === 'del' ? '#3A3B3C' : '#3A3B3C',
                                        border: key === null ? 'none' : '1px solid #4E4F50',
                                        color: '#E4E6EB', fontSize: key === 'del' ? 14 : 22, fontWeight: 700,
                                        cursor: key === null ? 'default' : 'pointer',
                                        visibility: key === null ? 'hidden' : 'visible',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    {key === 'del' ? '⌫' : key}
                                </button>
                            ))}
                        </div>

                        {/* Submit */}
                        <button
                            onClick={handleUnlockAttempt}
                            disabled={pinLoading || pinValue.length !== 4}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 12,
                                background: pinValue.length === 4 ? '#EF4444' : '#3A3B3C',
                                color: '#fff', border: 'none', fontSize: 16, fontWeight: 700,
                                cursor: pinValue.length === 4 ? 'pointer' : 'not-allowed',
                                opacity: pinLoading ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                transition: 'all 0.2s',
                            }}
                        >
                            {pinLoading ? (
                                <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verifying...</>
                            ) : (
                                <><Unlock size={18} /> Unlock Tablet</>
                            )}
                        </button>

                        {/* Cancel */}
                        <button
                            onClick={() => { setShowPinModal(false); setPinValue(''); setPinError(''); }}
                            style={{
                                width: '100%', padding: '10px', marginTop: 8,
                                background: 'transparent', border: 'none', borderRadius: 8,
                                color: '#8A8D91', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </CommanderLayout>
    );
}
