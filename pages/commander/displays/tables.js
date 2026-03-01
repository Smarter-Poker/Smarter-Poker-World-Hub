/**
 * Table Status TV Display — with click-to-lock kiosk mode
 * /commander/displays/tables
 * 
 * Full-screen display for TV / tablet via wireless HDMI transmitter
 * Shows: all tables, game type, stakes, players seated, open seats
 * Color-coded: green = open seats, blue = full, grey = inactive
 * 
 * LOCK MODE: Tap any table → locks display to that single table
 * Only owner/manager PIN can unlock back to all-tables view.
 * Lock state persists in localStorage across refreshes.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
import DealerTicker from '../../../src/components/commander/shared/DealerTicker';
import useCommanderSync from '../../../src/lib/commander/useCommanderSync';

/* ─── Helpers ────────────────────────────────────────────── */

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
  const totalSlots = maxSeats + 1;
  const allPos = [];
  for (let p = 0; p < totalSlots; p++) {
    const target = (p / totalSlots) * totalArc;
    let idx = 1;
    while (idx <= STEPS && cumArc[idx] < target) idx++;
    const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
    allPos.push({ top: `${cyE + ry * Math.sin(angle)}%`, left: `${cxE + rx * Math.cos(angle)}%` });
  }
  const dealerPos = allPos[0];
  const seatPositions = allPos.slice(1);
  seatPositions.forEach(p => { const t = parseFloat(p.top); if (t < 30) p.top = '30%'; });
  return { dealerPos, seatPositions };
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
  if (seconds <= 300) return '#EF4444';
  if (seconds <= 900) return '#F59E0B';
  return '#31A24C';
}

/* ─── Main Component ─────────────────────────────────────── */

export default function TablesDisplay() {
  const [tables, setTables] = useState([]);
  const [now, setNow] = useState(new Date());
  const [dealerMap, setDealerMap] = useState({});
  const wakeLockRef = useRef(null);
  const lastFetchAt = useRef(Date.now());

  // Lock mode state
  const [lockedTableNum, setLockedTableNum] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Extract venueId/venueName from staff session (client-only)
  const [venueId, setVenueId] = useState(null);
  const [venueName, setVenueName] = useState('');

  // Mount: read localStorage for staff session + restore lock state
  useEffect(() => {
    try {
      const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      if (staff.venue_id) setVenueId(staff.venue_id);
      if (staff.venue_name) setVenueName(staff.venue_name);
    } catch { /* ignore */ }
    try {
      const saved = localStorage.getItem('display_locked_table');
      if (saved) {
        const { table_number } = JSON.parse(saved);
        if (table_number) setLockedTableNum(table_number);
      }
    } catch { /* ignore */ }
  }, []);

  // Prevent back navigation while locked
  useEffect(() => {
    if (!lockedTableNum) return;
    const handleBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const handlePopState = () => { window.history.pushState(null, '', window.location.href); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [lockedTableNum]);

  /* ─── Data Fetching ──────────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
      const headers = { 'x-staff-session': staffSession, Authorization: `Bearer ${token}` };

      const res = await fetch(`/api/commander/tables?venue_id=${venueId}`, { headers });
      const json = await res.json();
      if (json.success) {
        let tablesArr = Array.isArray(json.data) ? json.data
          : Array.isArray(json.data?.tables) ? json.data.tables : [];

        // Fetch sessions for tables with active games to get seat + timer data
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
                time_remaining: s.time_remaining,
                is_expired: s.is_expired,
                is_critical: s.is_critical,
                status: 'occupied',
              }))
            };
          });
        }

        setTables(tablesArr);
        lastFetchAt.current = Date.now();
      }
    } catch (err) { console.error('Display fetch error:', err); }
    setNow(new Date());
  }, [venueId]);

  // Fetch dealer rotations
  const fetchDealers = useCallback(async () => {
    if (!venueId) return;
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
      const res = await fetch(`/api/commander/dealers/rotations?venue_id=${venueId}`, {
        headers: { 'x-staff-session': staffSession, Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        const rots = json.data?.rotations || json.data || [];
        const map = {};
        (Array.isArray(rots) ? rots : []).forEach(r => {
          if (r.table_number && !r.ended_at) {
            map[r.table_number] = r.dealer_name || r.commander_dealers?.name || 'Dealer';
          }
        });
        setDealerMap(map);
      }
    } catch { /* non-fatal */ }
  }, [venueId]);

  useEffect(() => {
    fetchData();
    fetchDealers();
    const poll = setInterval(() => { fetchData(); fetchDealers(); }, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [fetchData, fetchDealers]);

  // Commander Data Bus — instant sync
  useCommanderSync(venueId, () => { fetchData(); fetchDealers(); }, { entities: ['tables', 'games', 'dealers'] });

  // Wake lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch { }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLockRef.current?.release(); };
  }, []);

  /* ─── Lock / Unlock ──────────────────────────────── */

  const lockToTable = (tableNumber) => {
    setLockedTableNum(tableNumber);
    localStorage.setItem('display_locked_table', JSON.stringify({ table_number: tableNumber, venue_id: venueId }));
  };

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
          setLockedTableNum(null);
          setShowPinModal(false);
          setPinValue('');
          localStorage.removeItem('display_locked_table');
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

  /* ─── Computed ────────────────────────────────────── */

  const adjustTime = useCallback((apiTimeRemaining) => {
    if (apiTimeRemaining == null) return null;
    const elapsed = Math.floor((Date.now() - lastFetchAt.current) / 1000);
    return Math.max(0, apiTimeRemaining - elapsed);
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const goFullscreen = () => document.documentElement.requestFullscreen?.();

  // All tables — show everything (active, available, reserved, maintenance)
  const allTables = tables;
  const activeTables = tables.filter(t => t.status === 'in_use');
  const totalSeated = activeTables.reduce((sum, t) => {
    const games = Array.isArray(t.commander_games) ? t.commander_games : [];
    const game = games.find(g => g.status !== 'closed') || games[0];
    const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
    return sum + (game?.current_players || seated || 0);
  }, 0);
  const totalOpen = activeTables.reduce((sum, t) => {
    const max = t.max_seats || 9;
    const games = Array.isArray(t.commander_games) ? t.commander_games : [];
    const game = games.find(g => g.status !== 'closed') || games[0];
    const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
    const count = game?.current_players || seated || 0;
    return sum + Math.max(0, max - count);
  }, 0);

  // Locked table data — find the specific table for kiosk view
  const lockedTable = lockedTableNum ? tables.find(t => (t.table_number || t.number) === lockedTableNum) : null;

  /* ─── LOCKED KIOSK VIEW ──────────────────────────── */

  if (lockedTableNum) {
    const table = lockedTable;
    const maxSeats = table?.max_seats || 9;
    const { dealerPos, seatPositions } = computeSeatPositions(maxSeats);
    const games = table ? (Array.isArray(table.commander_games) ? table.commander_games : []) : [];
    const game = games.find(g => g.status !== 'closed') || games[0] || null;
    const gameType = (game?.game_type || table?.game_type || 'NLH').toUpperCase();
    const stakes = game?.stakes || table?.stakes || '';
    const dealerName = dealerMap[lockedTableNum] || game?.dealer_name || 'No Dealer';
    const seatData = table?.seats || [];
    const isActive = table?.status === 'in_use';

    // Build seat array
    const seatArr = Array.from({ length: maxSeats }, (_, i) => {
      const seatNum = i + 1;
      const seat = seatData.find(s => s.seat_number === seatNum);
      return { number: seatNum, player: seat || null };
    });

    // Fill anonymous players if game has current_players but few seat records
    const gamePlayers = game?.current_players || 0;
    const actuallySeated = seatArr.filter(s => s.player).length;
    if (gamePlayers > actuallySeated) {
      let toFill = gamePlayers - actuallySeated;
      let pNum = 1;
      for (let i = 0; i < seatArr.length && toFill > 0; i++) {
        if (!seatArr[i].player) {
          seatArr[i].player = { player_name: `Player ${pNum}`, seat_number: seatArr[i].number };
          pNum++; toFill--;
        }
      }
    }
    const occupiedCount = seatArr.filter(s => s.player).length;

    return (
      <CommanderLayout title="Table Status Display" backHref="/commander/dashboard?card=displays">
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          background: '#0A0A0A', color: '#E4E6EB', fontFamily: 'Inter, sans-serif', overflow: 'hidden', zIndex: 50,
        }}>
          {/* Top Bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 24px', flexShrink: 0,
            background: isActive
              ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
              : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
          }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>
                🔒 Table {lockedTableNum}
                {table?.table_name && table.table_name !== `Table ${lockedTableNum}` && (
                  <span style={{ fontWeight: 500, opacity: 0.85, marginLeft: 8 }}>· {table.table_name}</span>
                )}
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginTop: 2 }}>
                {gameType} {stakes && `· ${stakes}`} · {maxSeats}-Max
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                padding: '8px 16px', borderRadius: 24,
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                fontSize: 15, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                👥 {occupiedCount} / {maxSeats}
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'monospace', margin: 0 }}>
                {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
              {/* Unlock button */}
              <button
                onClick={() => { setShowPinModal(true); setPinValue(''); setPinError(''); }}
                style={{
                  padding: '8px 16px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.2)', border: '2px solid rgba(239,68,68,0.5)',
                  color: '#EF4444', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                🔓 Unlock
              </button>
            </div>
          </div>

          {/* Table Visual */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 24px', overflow: 'hidden' }}>
            {!table ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🔒</div>
                <p style={{ fontSize: 20, color: '#8A8D91', fontWeight: 600 }}>Table {lockedTableNum} — Loading...</p>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: 1100, position: 'relative' }}>
                <div style={{ position: 'relative', width: '100%', paddingBottom: '52%', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: '1 / 1', marginTop: '-24%' }}>
                    <img src="/images/poker-table-black-gold.png" alt="Poker Table"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', zIndex: 0 }} />

                    {/* Center info */}
                    <div style={{ position: 'absolute', top: '48%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>
                        {venueName || 'Poker Room'}
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 900, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {gameType}
                      </div>
                      <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: 700 }}>
                        {stakes}
                      </div>
                      {!isActive && (
                        <div style={{ fontSize: 14, color: '#1877F2', fontWeight: 700, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                          Table Open
                        </div>
                      )}
                    </div>

                    {/* Dealer badge */}
                    <div style={{ position: 'absolute', top: dealerPos.top, left: dealerPos.left, transform: 'translate(-50%, -50%)', textAlign: 'center', width: 100, zIndex: 3 }}>
                      <div style={{
                        width: 76, height: 76, borderRadius: '50%', margin: '0 auto 6px',
                        background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                        border: '3px solid #E4E6EB',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 16px rgba(0,0,0,0.6), 0 0 20px rgba(24,119,242,0.3)',
                        fontSize: 34, fontWeight: 900, color: '#fff',
                      }}>D</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1877F2', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dealerName}
                      </div>
                    </div>

                    {/* Seat badges */}
                    {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                      const pos = seatPositions[idx];
                      const isOccupied = !!seat.player;
                      const firstName = seat.player?.player_name?.split(' ')[0] || '';
                      const fullName = seat.player?.player_name || '';
                      const leftPct = parseFloat(pos.left);
                      const isLeftSide = leftPct < 25;
                      const isRightSide = leftPct > 75;
                      const badgeTransform = isLeftSide ? 'translate(-17px, -50%)' : isRightSide ? 'translate(calc(-100% + 17px), -50%)' : 'translate(-50%, -50%)';
                      const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                      let timerText = null, timerColor = null;
                      if (isOccupied && seat.player?.time_remaining != null) {
                        const rem = adjustTime(seat.player.time_remaining);
                        timerText = rem <= 0 ? 'EXPIRED' : formatTime(rem);
                        timerColor = getTimerColor(rem);
                      }
                      const isExpired = seat.player?.is_expired;
                      const borderColor = isOccupied
                        ? (isExpired ? '#EF4444' : 'rgba(24,119,242,0.5)')
                        : 'rgba(62,64,66,0.5)';

                      return (
                        <div key={seat.number} style={{
                          position: 'absolute', top: pos.top, left: pos.left,
                          transform: badgeTransform, zIndex: 2,
                          display: 'flex', flexDirection: badgeDirection, alignItems: 'center', gap: 10,
                          background: isExpired ? 'rgba(239,68,68,0.15)' : 'rgba(36,37,38,0.92)',
                          borderRadius: 14, padding: '6px 12px 6px 6px',
                          border: `2px solid ${borderColor}`, backdropFilter: 'blur(8px)', minWidth: 90,
                        }}>
                          <div style={{
                            width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isOccupied ? 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)' : 'rgba(255,255,255,0.06)',
                            border: `2px solid ${borderColor}`, overflow: 'hidden',
                          }}>
                            {isOccupied ? (
                              <span style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{firstName.charAt(0).toUpperCase()}</span>
                            ) : (
                              <span style={{ fontSize: 20, fontWeight: 600, color: '#6B7280' }}>{seat.number}</span>
                            )}
                          </div>
                          <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2, color: isOccupied ? '#E4E6EB' : '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                              {isOccupied ? fullName : 'Open'}
                            </div>
                            {timerText && (
                              <div style={{ fontSize: 14, fontWeight: 700, color: timerColor, fontFamily: 'monospace', lineHeight: 1.3 }}>
                                {timerText}
                              </div>
                            )}
                            {isOccupied && seat.player?.membership_tier && (
                              <div style={{ fontSize: 11, color: '#8B5CF6', fontWeight: 600 }}>{seat.player.membership_tier}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ticker */}
          <DealerTicker accentColor="#1877F2" bgColor="#000" fontSize={18} borderColor="rgba(255,255,255,0.1)" speed={22} showBorder={true} />

          {/* Footer */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', margin: 0 }}>🔒 Locked to Table {lockedTableNum} — Manager PIN required to unlock</p>
            <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11, letterSpacing: 1, margin: 0 }}>Powered By Smarter.Poker</p>
          </div>

          {/* PIN Modal */}
          {showPinModal && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} onClick={() => setShowPinModal(false)}>
              <div onClick={(e) => e.stopPropagation()} style={{
                background: '#242526', borderRadius: 20, padding: '32px 28px', width: '90%', maxWidth: 360,
                border: '2px solid #3A3B3C', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#E4E6EB', margin: 0 }}>Manager Unlock</h3>
                  <p style={{ fontSize: 13, color: '#8A8D91', marginTop: 6 }}>Enter owner or manager PIN</p>
                </div>
                <div style={{
                  background: '#18191A', border: '2px solid #3A3B3C', borderRadius: 14,
                  padding: '16px', textAlign: 'center', marginBottom: 16,
                  fontSize: 32, fontWeight: 700, color: '#E4E6EB', letterSpacing: 12, fontFamily: 'monospace',
                  minHeight: 50,
                }}>
                  {'•'.repeat(pinValue.length) || <span style={{ color: '#4E4F50', fontSize: 16, letterSpacing: 1 }}>Enter PIN</span>}
                </div>
                {pinError && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#EF4444', fontSize: 13, fontWeight: 600, textAlign: 'center',
                  }}>{pinError}</div>
                )}
                {/* Numeric Keypad */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, i) => {
                    if (key === null) return <div key={i} />;
                    const isDelete = key === 'del';
                    return (
                      <button key={i}
                        onClick={() => {
                          if (isDelete) setPinValue(v => v.slice(0, -1));
                          else if (pinValue.length < 4) setPinValue(v => v + key);
                        }}
                        style={{
                          padding: '14px', borderRadius: 12, fontSize: isDelete ? 14 : 22,
                          fontWeight: 700, cursor: 'pointer',
                          background: isDelete ? '#3A3B3C' : '#2A2B2D',
                          border: '1px solid #4A4B4D', color: '#E4E6EB',
                        }}
                      >
                        {isDelete ? '⌫' : key}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={handleUnlockAttempt}
                  disabled={pinLoading || pinValue.length !== 4}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12,
                    background: pinValue.length === 4 ? '#1877F2' : '#3A3B3C',
                    color: '#fff', border: 'none', fontSize: 16, fontWeight: 700,
                    cursor: pinValue.length === 4 ? 'pointer' : 'default',
                    opacity: pinLoading ? 0.6 : 1,
                  }}
                >
                  {pinLoading ? 'Verifying...' : '🔓 Unlock Display'}
                </button>
              </div>
            </div>
          )}
        </div>
      </CommanderLayout>
    );
  }

  /* ─── NORMAL ALL-TABLES VIEW ─────────────────────── */

  return (
    <CommanderLayout title="Table Status Display" backHref="/commander/dashboard?card=displays">
      <div onClick={goFullscreen}
        className="min-h-screen bg-black text-white font-['Inter'] select-none overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-[#1877F2] px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-3xl font-bold tracking-wide">TABLE STATUS</h1>
            <div className="flex gap-4">
              <span className="text-lg opacity-90">
                <strong>{allTables.length}</strong> Tables
              </span>
              <span className="text-lg opacity-90">
                <strong>{totalSeated}</strong> Playing
              </span>
              <span className="text-lg opacity-90">
                <strong className={totalOpen > 0 ? 'text-[#31A24C]' : ''}>{totalOpen}</strong> Open
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-white/60">Tap a table to lock display</p>
            <p className="text-3xl font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Table Grid */}
        <div className="flex-1 p-6 overflow-hidden">
          {allTables.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-4xl font-bold text-white/15">No Active Tables</p>
            </div>
          ) : (
            <div className={`grid gap-4 h-full ${allTables.length <= 6 ? 'grid-cols-3 grid-rows-2' :
              allTables.length <= 9 ? 'grid-cols-3 grid-rows-3' :
                allTables.length <= 12 ? 'grid-cols-4 grid-rows-3' :
                  allTables.length <= 16 ? 'grid-cols-4 grid-rows-4' :
                    'grid-cols-5 grid-rows-4'
              }`}>
              {allTables.map(table => {
                const tNum = table.table_number || table.number;
                const maxSeats = table.max_seats || 9;
                const seats = table.seats || [];
                const games = Array.isArray(table.commander_games) ? table.commander_games : [];
                const game = games.find(g => g.status !== 'closed') || games[0];
                const seated = game?.current_players || seats.filter(s => s.status === 'occupied').length || 0;
                const open = Math.max(0, maxSeats - seated);
                const isFull = open === 0 && seated > 0;
                const isEmpty = seated === 0;
                const isActive = table.status === 'in_use';
                const seatPositions = computeSeatPositions(maxSeats).seatPositions;
                const dealer = dealerMap[tNum];

                return (
                  <div key={table.id || tNum}
                    onClick={(e) => { e.stopPropagation(); lockToTable(tNum); }}
                    className={`relative rounded-2xl p-3 flex flex-col items-center justify-center border-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:brightness-110 ${!isActive ? 'bg-white/[0.03] border-white/10' :
                      isFull ? 'bg-[#1877F2]/10 border-[#1877F2]/30' :
                        'bg-[#31A24C]/10 border-[#31A24C]/30'
                      }`}>

                    {/* Mini seat ring */}
                    <div className="relative w-20 h-16 mb-1">
                      <div className={`absolute inset-[15%] rounded-[50%] border ${!isActive ? 'border-white/10' : isFull ? 'border-[#1877F2]/20' : 'border-[#31A24C]/20'}`} />
                      {seatPositions.map((pos, i) => {
                        const seatData = seats.find(s => s.seat_number === i + 1);
                        const isOccupied = seatData?.status === 'occupied' || (isActive && i < seated);
                        return (
                          <div key={i}
                            className={`absolute w-2.5 h-2.5 rounded-full ${isOccupied ? 'bg-[#1877F2]' : 'bg-white/15'}`}
                            style={{ left: `${parseFloat(pos.left)}%`, top: `${parseFloat(pos.top)}%`, transform: 'translate(-50%, -50%)' }} />
                        );
                      })}
                    </div>

                    {/* Table number */}
                    <p className="text-2xl font-bold text-white">T{tNum}</p>

                    {/* Game info */}
                    <p className="text-xs text-white/50 truncate max-w-full">
                      {(game?.game_type || table.game_type || 'NLH').toUpperCase()} {game?.stakes || table.stakes || ''}
                    </p>

                    {/* Dealer */}
                    {dealer && (
                      <p className="text-[10px] text-[#1877F2] font-semibold truncate max-w-full mt-0.5">
                        🎲 {dealer}
                      </p>
                    )}

                    {/* Seat count */}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-white/70">{seated}/{maxSeats}</span>
                      {isActive && open > 0 && (
                        <span className="text-xs font-bold text-[#31A24C] bg-[#31A24C]/20 px-2 py-0.5 rounded-full">
                          {open} OPEN
                        </span>
                      )}
                      {isActive && isFull && (
                        <span className="text-xs font-bold text-[#1877F2] bg-[#1877F2]/20 px-2 py-0.5 rounded-full">
                          FULL
                        </span>
                      )}
                      {!isActive && (
                        <span className="text-xs font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                          {table.status === 'reserved' ? 'RSVD' : table.status === 'maintenance' ? 'MAINT' : 'IDLE'}
                        </span>
                      )}
                    </div>

                    {/* Lock hint on hover */}
                    <div className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40">
                      <span className="text-white text-sm font-bold bg-black/60 px-4 py-2 rounded-xl">🔒 Tap to Lock</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dealer Push/Break + Promo Ticker */}
        <DealerTicker
          accentColor="#1877F2"
          bgColor="#000"
          fontSize={18}
          borderColor="rgba(255,255,255,0.1)"
          speed={22}
          showBorder={true}
        />

        {/* Footer */}
        <div className="border-t border-white/10 px-8 py-2 flex items-center justify-between">
          <p className="text-sm text-white/20">See The Front Desk Or Join The Waitlist For An Open Seat</p>
          <p className="text-white/15 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
