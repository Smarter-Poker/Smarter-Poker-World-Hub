/**
 * Waitlist Desk View — The Board
 * /commander/waitlist/desk
 * Professional Bravo Poker-style grid: black background, uniform colored headers,
 * table numbers sub-row, venue branding, scrolling ticker.
 * 4 games per page, auto-rotates every 10s if more games exist.
 * Click a player name → action buttons. Real-time via Supabase + 15s polling.
 *
 * FULLY CUSTOMIZABLE: Colors, logo, game types via ⚙️ Settings modal.
 * Settings persist to Supabase via /api/commander/settings (desk_customization field).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRealtimeUpdates } from '../../../src/lib/commander/useRealtimeUpdates';
import {
  RefreshCw, Loader2, Users, UserPlus, ArrowLeft,
  PhoneCall, Armchair, SkipForward, Trash2,
  MessageSquare, Phone, X, Settings, Upload, Plus, Trash, GripVertical,
  Globe, CheckCircle, AlertTriangle
} from 'lucide-react';

const GAMES_PER_PAGE = 4;
const ROTATE_INTERVAL = 10000;

// Default customization — the classic gold theme
const DEFAULT_CUSTOM = {
  headerColor: '#B8860B',
  accentColor: '#D4AF37',
  bgColor: '#000000',
  cardBgColor: '#050505',
  textColor: '#E0E0E0',
  borderColor: '#666666',
  logoUrl: '',
  tickerMessage: '',
  gameTypes: [],  // empty = auto-detect from tables
  playerFontSize: 28,
};

export default function WaitlistDesk() {
  const router = useRouter();
  const [tables, setTables] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seatModal, setSeatModal] = useState(null);
  const [callLoading, setCallLoading] = useState(null);
  const [smsStatus, setSmsStatus] = useState(null);
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [venueName, setVenueName] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [custom, setCustom] = useState(DEFAULT_CUSTOM);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const getStaffSession = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_staff') || '' : '';

  // Load venue info + saved desk customization
  useEffect(() => {
    try {
      const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      if (staff.venue_name) setVenueName(staff.venue_name);
    } catch { }

    // Fetch saved settings
    (async () => {
      try {
        const token = getToken();
        const staffSession = getStaffSession();
        const res = await fetch('/api/commander/settings', {
          headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession }
        });
        const json = await res.json();
        if (json.success && json.data?.desk_customization) {
          setCustom(prev => ({ ...prev, ...json.data.desk_customization }));
        }
      } catch { }
    })();
  }, []);

  const saveCustomization = async (newCustom) => {
    setCustom(newCustom);
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch('/api/commander/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ desk_customization: newCustom })
      });
    } catch (err) { console.error('Failed to save customization:', err); }
  };

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const vid = staffData.venue_id || '';
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };
      const [tabRes, wlRes] = await Promise.all([
        fetch(`/api/commander/tables?venue_id=${vid}`, { headers }),
        fetch(`/api/commander/waitlist?venue_id=${vid}`, { headers })
      ]);
      const tabJson = await tabRes.json();
      const wlJson = await wlRes.json();
      if (tabJson.success) setTables(tabJson.data?.tables || tabJson.data || []);
      if (wlJson.success) setWaitlists(wlJson.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });
  useRealtimeUpdates(venueId, () => fetchData(), !!venueId);

  // ── ACTION HANDLERS ─────────────────────────────────────────────
  const handleCall = async (entry) => {
    setCallLoading(entry.id); setSmsStatus(null);
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      const res = await fetch('/api/commander/waitlist/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ waitlist_id: entry.id })
      });
      const json = await res.json();
      if (json.data?.sms_sent) setSmsStatus({ type: 'sent', text: `SMS sent to ${entry.player_name}` });
      else if (json.data?.sms_status === 'no_phone') setSmsStatus({ type: 'none', text: 'No Phone — Verbal Page Only' });
      else setSmsStatus({ type: 'none', text: 'Called — SMS Unavailable' });
      setSelectedPlayer(null); await fetchData();
      setTimeout(() => setSmsStatus(null), 3000);
    } catch (err) { console.error(err); }
    finally { setCallLoading(null); }
  };

  const handleSeat = async (entry, tableNumber, seatNumber) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch('/api/commander/waitlist/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ waitlist_id: entry.id, table_number: tableNumber, seat_number: seatNumber })
      });
      setSeatModal(null); setSelectedPlayer(null); await fetchData();
    } catch (err) { console.error(err); }
  };

  const handlePass = async (entry) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch(`/api/commander/waitlist/${entry.id}/pass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession }
      });
      setSelectedPlayer(null); await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleRemove = async (entry) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch(`/api/commander/waitlist/${entry.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession }
      });
      setSelectedPlayer(null); await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleCheckIn = async (entry) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch(`/api/commander/waitlist/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ checked_in_at: new Date().toISOString() })
      });
      setSelectedPlayer(null); await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleAddWalkIn = async (playerData) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const parts = (playerData.game_type || 'NLH 1/3').split(' ');
      const res = await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({
          venue_id: staffData.venue_id, player_name: playerData.player_name,
          game_type: parts[0] || 'NLH', stakes: parts.slice(1).join(' ') || '1/3',
          player_phone: playerData.phone || null, signup_method: 'staff'
        })
      });
      const json = await res.json();
      if (json.success) { setShowAddWalkIn(false); await fetchData(); }
    } catch (err) { console.error(err); }
  };

  // ── GROUP & SORT ────────────────────────────────────────────────
  const waitlistByGame = {};
  waitlists.filter(w => w.status === 'waiting' || w.status === 'called').forEach(w => {
    const key = w.stakes ? `${(w.game_type || 'NLH').toUpperCase()} ${w.stakes}` : (w.game_type || 'Unknown').toUpperCase();
    if (!waitlistByGame[key]) waitlistByGame[key] = [];
    waitlistByGame[key].push(w);
  });
  Object.values(waitlistByGame).forEach(entries => {
    entries.sort((a, b) => {
      if (a.status === 'called' && b.status !== 'called') return -1;
      if (b.status === 'called' && a.status !== 'called') return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  });

  const getTableNums = (gameLabel) => {
    const parts = gameLabel.split(' ');
    const gameType = parts[0];
    const stakes = parts.slice(1).join(' ');
    return tables
      .filter(t => {
        if (t.is_active === false || t.status === 'maintenance') return false;
        const tGame = (t.game_type || '').toUpperCase();
        const tStakes = (t.stakes || '').trim();
        if (tGame === gameType && tStakes === stakes) return true;
        if (tGame === gameType && !tStakes) return true;
        return `${tGame} ${tStakes}`.trim() === gameLabel;
      })
      .map(t => t.table_number)
      .sort((a, b) => a - b);
  };

  const breakTables = tables
    .filter(t => t.status === 'break' || t.status === 'dealer_break')
    .map(t => t.table_number)
    .sort((a, b) => a - b);

  const activeTables = tables.filter(t => t.is_active !== false && t.status !== 'maintenance');
  const totalWaiting = waitlists.filter(w => w.status === 'waiting').length;
  const gameEntries = Object.entries(waitlistByGame);

  // ── PAGINATION ─────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(gameEntries.length / GAMES_PER_PAGE));
  const visibleGames = gameEntries.slice(
    currentPage * GAMES_PER_PAGE,
    (currentPage + 1) * GAMES_PER_PAGE
  );

  useEffect(() => {
    if (totalPages <= 1) return;
    const timer = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [totalPages]);

  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(0);
  }, [totalPages, currentPage]);

  // Ticker
  const tickerParts = [];
  if (breakTables.length > 0) tickerParts.push(`BREAK ${breakTables.join('--')}`);
  if (custom.tickerMessage) tickerParts.push(custom.tickerMessage);
  else tickerParts.push('Download the Smarter Poker App for live waitlist updates');
  tickerParts.push(`${totalWaiting} players currently waiting`);
  const tickerMessage = tickerParts.join('   \u00A0\u00A0\u00A0-\u00A0\u00A0\u00A0   ');

  // ── DYNAMIC STYLES ──────────────────────────────────────────────
  const c = custom;
  const headerGradient = `linear-gradient(180deg, ${lighten(c.headerColor, 15)}, ${c.headerColor}, ${darken(c.headerColor, 25)})`;
  const headerBorderBottom = `2px solid ${darken(c.headerColor, 30)}`;

  if (loading) {
    return <div style={{ minHeight: '100vh', background: c.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 className="animate-spin" size={32} color={c.accentColor} />
    </div>;
  }

  return (
    <>
      <SEOHead title="The Board — Poker Waiting List" noindex={true} />
      <div style={{ minHeight: '100vh', background: c.bgColor, color: c.textColor, fontFamily: "'Inter', 'Segoe UI', sans-serif", display: 'flex', flexDirection: 'column' }}>

        {/* ═══ TOP BAR ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: `2px solid ${c.borderColor}44`, background: c.cardBgColor }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <ArrowLeft size={16} color={c.accentColor} />
            </button>
            {c.logoUrl && <img src={c.logoUrl} alt="" style={{ height: '64px', width: 'auto', borderRadius: '6px', objectFit: 'contain' }} />}
            <span style={{ fontSize: '22px', fontWeight: 700, color: c.accentColor, letterSpacing: '0.5px', textTransform: 'uppercase', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {venueName || 'Poker Room'}
            </span>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: '36px', fontWeight: 800, color: c.accentColor, letterSpacing: '4px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              POKER WAITING LIST
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '0 0 auto' }}>
            <span style={{ fontSize: '13px', color: `${c.textColor}88`, textAlign: 'right', lineHeight: '1.3', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              Powered By<br /><strong>Club Commander</strong>
            </span>
          </div>
        </div>

        {/* ═══ CONTROLS BAR ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px', borderBottom: `1px solid ${c.borderColor}33`, background: c.cardBgColor }}>
          <span style={{ fontSize: '18px', color: `${c.textColor}88`, fontWeight: 600 }}>
            {totalWaiting} waiting &bull; {gameEntries.length} game{gameEntries.length !== 1 ? 's' : ''}
            {totalPages > 1 && <span style={{ marginLeft: '8px', color: c.accentColor }}>Page {currentPage + 1}/{totalPages}</span>}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowAddWalkIn(true)} style={makeBtn(c)}>
              <UserPlus size={18} /> Add Player
            </button>
            <button onClick={() => { }} style={makeBtn(c)}>
              <Phone size={18} /> Call-In
            </button>
            <button onClick={() => setShowSettings(true)} style={makeBtn(c)} title="Customize Desk">
              <Settings size={18} />
            </button>
            <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', background: `linear-gradient(180deg, ${c.cardBgColor}, ${darken(c.cardBgColor, 10)})`, border: `2px solid ${c.borderColor}88`, borderRadius: '6px', color: `${c.textColor}99`, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* ═══ SMS TOAST ═══ */}
        {smsStatus && (
          <div style={{ margin: '6px 16px 0', padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: c.accentColor, background: c.cardBgColor, border: `1px solid ${c.borderColor}55`, borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {smsStatus.type === 'sent' ? <MessageSquare size={14} /> : <Phone size={14} />}
            {smsStatus.text}
          </div>
        )}

        {/* ═══ BRAVO GRID ═══ */}
        {gameEntries.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
            <Users size={40} color={`${c.textColor}33`} />
            <p style={{ color: `${c.textColor}66`, marginTop: '12px', fontSize: '16px' }}>No Players Waiting</p>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', padding: '12px 16px', gap: '2px', alignItems: 'stretch' }}>
            {visibleGames.map(([gameLabel, entries]) => {
              const tableNums = getTableNums(gameLabel);
              return (
                <div key={gameLabel} style={{ flex: '0 0 calc(25% - 2px)', maxWidth: 'calc(25% - 2px)', minWidth: '140px', border: `3px solid ${c.borderColor}`, borderRadius: '4px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ padding: '14px 10px', textAlign: 'center', fontWeight: 800, fontSize: '26px', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', background: headerGradient, textShadow: '0 2px 4px rgba(0,0,0,0.5)', borderBottom: headerBorderBottom }}>
                    {gameLabel}
                  </div>
                  {/* Table Numbers */}
                  <div style={{ padding: '4px 8px', textAlign: 'center', fontSize: '16px', color: `${c.textColor}99`, borderBottom: `1px solid ${c.borderColor}55`, background: c.cardBgColor, fontWeight: 600, letterSpacing: '0.5px' }}>
                    {tableNums.length > 0 ? tableNums.join('-') : '—'}
                  </div>
                  {/* Player Names */}
                  <div style={{ flex: 1, background: c.bgColor }}>
                    {entries.map((entry) => {
                      const isCalled = entry.status === 'called';
                      const isSelected = selectedPlayer?.id === entry.id;
                      const hasApp = entry.signup_method === 'app';
                      const isWeb = entry.signup_method === 'web';
                      const isCheckedIn = !!entry.checked_in_at;
                      // Calculate web check-in countdown (1 hour from creation)
                      const webMinutesLeft = isWeb && !isCheckedIn && entry.created_at
                        ? Math.max(0, Math.ceil((new Date(entry.created_at).getTime() + 60 * 60 * 1000 - Date.now()) / 60000))
                        : null;
                      const isExpired = webMinutesLeft !== null && webMinutesLeft <= 0;
                      return (
                        <div key={entry.id}>
                          <div
                            onClick={() => setSelectedPlayer(isSelected ? null : entry)}
                            style={{
                              padding: '8px 12px', borderBottom: `1px solid ${c.bgColor === '#000000' ? '#1a1a1a' : c.borderColor + '22'}`,
                              cursor: 'pointer', display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', transition: 'background-color 0.1s',
                              backgroundColor: isCalled ? `${c.accentColor}14` : isExpired ? 'rgba(239,68,68,0.08)' : isSelected ? 'rgba(255,255,255,0.04)' : 'transparent'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {hasApp && <span style={{ color: c.accentColor, fontSize: '16px' }}>♦</span>}
                              {isWeb && !isCheckedIn && (
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', background: isExpired ? '#EF4444' : '#3B82F6', padding: '1px 5px', borderRadius: '3px', letterSpacing: '0.5px', lineHeight: '16px' }}>
                                  {isExpired ? '⚠ EXPIRED' : 'WEB'}
                                </span>
                              )}
                              {isWeb && isCheckedIn && (
                                <CheckCircle size={14} style={{ color: '#10B981' }} />
                              )}
                              <span style={{ fontSize: `${c.playerFontSize}px`, fontWeight: 700, letterSpacing: '0.3px', color: isCalled ? c.accentColor : isExpired ? '#EF4444' : c.textColor }}>
                                {entry.player_name}
                              </span>
                              {isWeb && !isCheckedIn && webMinutesLeft !== null && !isExpired && (
                                <span style={{ fontSize: '12px', color: webMinutesLeft <= 10 ? '#F59E0B' : '#64748B', fontWeight: 600 }}>
                                  {webMinutesLeft}m
                                </span>
                              )}
                            </span>
                            {isCalled && <span style={{ fontSize: '14px', fontWeight: 800, color: c.bgColor, background: c.accentColor, padding: '2px 6px', borderRadius: '3px', letterSpacing: '0.5px' }}>CALLED</span>}
                          </div>

                          {isSelected && (
                            <div style={{ display: 'flex', padding: '8px 12px', gap: '8px', background: `linear-gradient(180deg, ${lighten(c.cardBgColor, 5)}, ${c.cardBgColor})`, borderBottom: `2px solid ${c.borderColor}55`, flexWrap: 'wrap' }}>
                              {isWeb && !isCheckedIn && (
                                <button onClick={(e) => { e.stopPropagation(); handleCheckIn(entry); }} style={makeActionBtnGreen(c)}>
                                  <CheckCircle size={18} /> Check In
                                </button>
                              )}
                              {entry.status !== 'called' && (
                                <button onClick={(e) => { e.stopPropagation(); handleCall(entry); }}
                                  disabled={callLoading === entry.id} style={makeActionBtn(c)}>
                                  {callLoading === entry.id ? <Loader2 size={18} className="animate-spin" /> : <PhoneCall size={18} />}
                                  Call
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); setSeatModal(entry); }} style={makeActionBtnGreen(c)}>
                                <Armchair size={18} /> Seat
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handlePass(entry); }} style={makeActionBtn(c)}>
                                <SkipForward size={18} /> Pass
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleRemove(entry); }} style={makeActionBtnRed(c)}>
                                <Trash2 size={18} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ PAGE DOTS ═══ */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '6px 0', background: c.cardBgColor }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <span
                key={i}
                onClick={() => setCurrentPage(i)}
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: i === currentPage ? c.accentColor : `${c.textColor}33`,
                  transform: i === currentPage ? 'scale(1.3)' : 'scale(1)'
                }}
              />
            ))}
          </div>
        )}

        {/* ═══ JOIN WAIT LIST BUTTON (for mobile/kiosk users) ═══ */}
        <div style={{ padding: '10px 16px', background: c.cardBgColor, borderTop: `1px solid ${c.borderColor}33` }}>
          <button
            onClick={() => {
              // Navigate to the public waitlist kiosk page
              const staffData = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('commander_staff') || '{}') : {};
              const vid = staffData.venue_id;
              if (vid) window.open(`/hub/commander/waitlist/${vid}`, '_blank');
            }}
            style={{
              width: '100%', padding: '16px 24px', fontSize: '22px', fontWeight: 800,
              letterSpacing: '1px', textTransform: 'uppercase',
              background: `linear-gradient(180deg, ${lighten(c.headerColor, 15)}, ${c.headerColor})`,
              border: `3px solid ${c.accentColor}`,
              borderRadius: '8px', color: '#fff', cursor: 'pointer',
              boxShadow: `0 4px 12px ${c.accentColor}33, inset 0 1px 0 rgba(255,255,255,0.15)`,
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            Join Wait List
          </button>
        </div>

        {/* ═══ SCROLLING TICKER ═══ */}
        <div style={{ padding: '18px 0', borderTop: `2px solid ${c.borderColor}55`, background: c.cardBgColor, overflow: 'hidden', whiteSpace: 'nowrap', position: 'relative' }}>
          <div style={{ display: 'inline-flex', animation: 'tickerScroll 30s linear infinite' }}>
            <span style={{ fontSize: '39px', color: c.accentColor, fontWeight: 700, letterSpacing: '1px', paddingRight: '150px', whiteSpace: 'nowrap' }}>{tickerMessage}</span>
            <span style={{ fontSize: '39px', color: c.accentColor, fontWeight: 700, letterSpacing: '1px', paddingRight: '150px', whiteSpace: 'nowrap' }}>{tickerMessage}</span>
          </div>
        </div>

        {/* ═══ SEAT MODAL ═══ */}
        {seatModal && (
          <div style={overlayStyle} onClick={() => setSeatModal(null)}>
            <div style={modalStyle(c)} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: c.accentColor, margin: 0 }}>Seat Player</h3>
                  <p style={{ fontSize: '13px', color: `${c.textColor}88`, margin: '2px 0 0' }}>{seatModal.player_name}</p>
                </div>
                <button onClick={() => setSeatModal(null)} style={modalCloseStyle(c)}><X size={14} /></button>
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {activeTables.filter(t => {
                  const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
                  return seated < (t.max_seats || 9);
                }).map(table => {
                  const maxSeats = table.max_seats || 9;
                  const seats = table.seats || [];
                  const openSeats = [];
                  for (let s = 1; s <= maxSeats; s++) {
                    if (!seats.find(se => se.seat_number === s && se.status === 'occupied')) openSeats.push(s);
                  }
                  return (
                    <div key={table.table_number} style={{ background: `${c.cardBgColor}`, border: `1px solid ${c.borderColor}55`, borderRadius: '6px', padding: '10px', marginBottom: '8px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: c.textColor, margin: '0 0 8px' }}>
                        Table {table.table_number}
                        {table.game_type && <span style={{ color: `${c.textColor}88` }}> — {table.game_type}</span>}
                      </p>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {openSeats.map(seat => (
                          <button key={seat} onClick={() => handleSeat(seatModal, table.table_number, seat)} style={{
                            width: '36px', height: '36px', borderRadius: '4px', background: '#0a1a0a',
                            border: '1px solid #2a5a2a', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#4CAF50', cursor: 'pointer'
                          }}>{seat}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ ADD PLAYER MODAL ═══ */}
        {showAddWalkIn && (
          <div style={overlayStyle} onClick={() => setShowAddWalkIn(false)}>
            <div style={modalStyle(c)} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: c.accentColor, margin: 0 }}>Add Player To Waitlist</h3>
                <button onClick={() => setShowAddWalkIn(false)} style={modalCloseStyle(c)}><X size={14} /></button>
              </div>
              <WalkInForm onSubmit={handleAddWalkIn} activeTables={activeTables} custom={c} />
            </div>
          </div>
        )}

        {/* ═══ SETTINGS MODAL ═══ */}
        {showSettings && (
          <DeskSettingsModal
            custom={custom}
            onSave={(newCustom) => { saveCustomization(newCustom); setShowSettings(false); }}
            onClose={() => setShowSettings(false)}
            onUpdate={setCustom}
          />
        )}
      </div>

      <style jsx>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </>
  );
}

// ── WALK-IN FORM ──────────────────────────────────────────────────
function WalkInForm({ onSubmit, activeTables, custom: c }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gameType, setGameType] = useState('NLH 1/3');
  const [submitting, setSubmitting] = useState(false);

  let gameTypes = [...new Set(activeTables.map(t => t.game_type).filter(Boolean))];
  // Merge custom game types
  if (c.gameTypes && c.gameTypes.length > 0) {
    gameTypes = [...new Set([...c.gameTypes, ...gameTypes])];
  }
  if (gameTypes.length === 0) gameTypes.push('NLH 1/3', 'NLH 2/5', 'PLO 1/3');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    await onSubmit({ player_name: name.trim(), phone: phone.trim(), game_type: gameType });
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: c.textColor, marginBottom: '4px' }}>Player Name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g., Mike S." autoFocus required style={formInputStyle(c)} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: c.textColor, marginBottom: '4px' }}>Phone <span style={{ color: `${c.textColor}55` }}>(for SMS)</span></label>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="(555) 123-4567" style={formInputStyle(c)} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: c.textColor, marginBottom: '4px' }}>Game</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {gameTypes.map(g => (
            <button key={g} type="button" onClick={() => setGameType(g)}
              style={{
                padding: '6px 14px', borderRadius: '4px', border: `1px solid ${c.borderColor}`,
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: gameType === g ? c.accentColor : c.cardBgColor,
                color: gameType === g ? '#000' : c.textColor
              }}>{g}</button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={!name.trim() || submitting} style={{
        width: '100%', height: '40px', background: c.accentColor, color: '#000',
        borderRadius: '4px', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer'
      }}>
        {submitting ? 'Adding...' : 'Add to Waitlist'}
      </button>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════
// ⚙️ DESK SETTINGS MODAL
// ══════════════════════════════════════════════════════════════════
function DeskSettingsModal({ custom, onSave, onClose, onUpdate }) {
  const [draft, setDraft] = useState({ ...DEFAULT_CUSTOM, ...custom });
  const [activeTab, setActiveTab] = useState('colors');
  const [newGame, setNewGame] = useState('');
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef(null);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'logos');
      formData.append('prefix', 'waitlist-desk');
      const res = await fetch('/api/social/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.success && json.url) {
        update('logoUrl', json.url);
      } else {
        alert('Upload failed: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Logo upload error:', err);
      alert('Upload failed');
    }
    setUploading(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const update = (field, value) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    onUpdate(next); // live preview
  };

  const tabs = [
    { id: 'colors', label: 'Colors' },
    { id: 'branding', label: 'Logo & Branding' },
    { id: 'games', label: 'Game Types' },
  ];

  const colorFields = [
    { key: 'headerColor', label: 'Column Header' },
    { key: 'accentColor', label: 'Accent / Gold' },
    { key: 'bgColor', label: 'Background' },
    { key: 'cardBgColor', label: 'Bar Background' },
    { key: 'textColor', label: 'Player Text' },
    { key: 'borderColor', label: 'Borders' },
  ];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #444', borderRadius: '12px', width: '100%', maxWidth: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={20} color="#D4AF37" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>Desk Customization</h3>
          </div>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#222', border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #333', background: '#0a0a0a' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, padding: '10px 8px', background: 'transparent', border: 'none',
                borderBottom: activeTab === t.id ? '2px solid #D4AF37' : '2px solid transparent',
                color: activeTab === t.id ? '#D4AF37' : '#888', fontSize: '13px',
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {activeTab === 'colors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {colorFields.map(cf => (
                <div key={cf.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '14px', fontWeight: 600, color: '#ccc' }}>{cf.label}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="color"
                      value={draft[cf.key]}
                      onChange={e => update(cf.key, e.target.value)}
                      style={{ width: '44px', height: '36px', border: '2px solid #444', borderRadius: '6px', cursor: 'pointer', background: '#111', padding: '2px' }}
                    />
                    <input
                      type="text"
                      value={draft[cf.key]}
                      onChange={e => update(cf.key, e.target.value)}
                      style={{ width: '90px', padding: '6px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '13px', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              ))}
              <button onClick={() => {
                setDraft({ ...draft, ...DEFAULT_CUSTOM });
                onUpdate({ ...draft, ...DEFAULT_CUSTOM });
              }} style={{ marginTop: '8px', padding: '8px 16px', background: '#222', border: '1px solid #444', borderRadius: '6px', color: '#888', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Reset to Defaults
              </button>
            </div>
          )}

          {activeTab === 'branding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#ccc', marginBottom: '8px' }}>Club Logo</label>
                <input type="file" ref={logoInputRef} accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                      background: 'linear-gradient(180deg, #1a1a1a, #0a0a0a)', border: '2px solid #D4AF37',
                      borderRadius: '8px', color: '#D4AF37', fontSize: '14px', fontWeight: 700,
                      cursor: uploading ? 'wait' : 'pointer',
                      boxShadow: '0 2px 8px rgba(212,175,55,0.2)',
                      opacity: uploading ? 0.6 : 1
                    }}
                  >
                    {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                  </button>
                  {draft.logoUrl && (
                    <button onClick={() => update('logoUrl', '')} style={{ padding: '8px 12px', background: '#1a0a0a', border: '1px solid #C62828', borderRadius: '6px', color: '#EF5350', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Remove
                    </button>
                  )}
                </div>
                {draft.logoUrl && (
                  <div style={{ marginTop: '12px', padding: '16px', background: '#0a0a0a', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
                    <img src={draft.logoUrl} alt="Logo Preview" style={{ maxHeight: '80px', maxWidth: '240px', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#ccc', marginBottom: '8px' }}>Ticker Message</label>
                <input
                  type="text"
                  value={draft.tickerMessage}
                  onChange={e => update('tickerMessage', e.target.value)}
                  placeholder="Download the Smarter Poker App for live waitlist updates"
                  style={{ width: '100%', padding: '10px 12px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
                Add custom game types. If empty, games auto-detect from your active tables.
              </p>
              {(draft.gameTypes || []).map((g, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <GripVertical size={16} color="#555" />
                  <span style={{ flex: 1, padding: '8px 12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', color: '#fff', fontSize: '14px' }}>{g}</span>
                  <button onClick={() => {
                    const next = draft.gameTypes.filter((_, idx) => idx !== i);
                    update('gameTypes', next);
                  }} style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#1a0a0a', border: '1px solid #C62828', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#EF5350' }}>
                    <Trash size={14} />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={newGame}
                  onChange={e => setNewGame(e.target.value)}
                  placeholder="e.g., NLH 5/10"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newGame.trim()) {
                      update('gameTypes', [...(draft.gameTypes || []), newGame.trim()]);
                      setNewGame('');
                    }
                  }}
                  style={{ flex: 1, padding: '8px 12px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '14px' }}
                />
                <button onClick={() => {
                  if (newGame.trim()) {
                    update('gameTypes', [...(draft.gameTypes || []), newGame.trim()]);
                    setNewGame('');
                  }
                }} style={{ padding: '8px 14px', background: '#D4AF37', color: '#000', borderRadius: '4px', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          )}


        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #333', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', background: '#222', border: '1px solid #444', borderRadius: '6px', color: '#ccc', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onSave(draft)} style={{ padding: '10px 24px', background: '#D4AF37', border: 'none', borderRadius: '6px', color: '#000', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── STYLE HELPERS ──────────────────────────────────────────────────
function lighten(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(2.55 * percent));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(2.55 * percent));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function darken(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(2.55 * percent));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(2.55 * percent));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function makeBtn(c) {
  return {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    background: `linear-gradient(180deg, ${lighten(c.cardBgColor, 8)}, ${c.cardBgColor})`,
    border: `2px solid ${c.accentColor}`, borderRadius: '6px', color: c.accentColor,
    fontSize: '16px', fontWeight: 700, cursor: 'pointer',
    boxShadow: `0 2px 8px ${c.accentColor}33, inset 0 1px 0 rgba(255,255,255,0.05)`,
    textTransform: 'uppercase', letterSpacing: '0.5px'
  };
}

function makeActionBtn(c) {
  return {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    borderRadius: '6px', border: `2px solid ${c.borderColor}`, fontSize: '18px',
    fontWeight: 700, cursor: 'pointer',
    background: `linear-gradient(180deg, ${lighten(c.cardBgColor, 10)}, ${c.cardBgColor})`, color: c.textColor,
    boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
    textTransform: 'uppercase', letterSpacing: '0.5px'
  };
}

function makeActionBtnGreen(c) {
  return {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    borderRadius: '6px', border: '2px solid #2E7D32', fontSize: '18px',
    fontWeight: 700, cursor: 'pointer',
    background: 'linear-gradient(180deg, #1a2e1a, #0a1a0a)', color: '#4CAF50',
    boxShadow: '0 3px 8px rgba(46,125,50,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
    textTransform: 'uppercase', letterSpacing: '0.5px'
  };
}

function makeActionBtnRed(c) {
  return {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    borderRadius: '6px', border: '2px solid #C62828', fontSize: '18px',
    fontWeight: 700, cursor: 'pointer',
    background: 'linear-gradient(180deg, #2a1a1a, #1a0a0a)', color: '#EF5350',
    boxShadow: '0 3px 8px rgba(198,40,40,0.3), inset 0 1px 0 rgba(255,255,255,0.05)'
  };
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
};

function modalStyle(c) {
  return {
    background: '#111', border: `1px solid ${c.borderColor}`, borderRadius: '8px',
    width: '100%', maxWidth: '420px', padding: '20px'
  };
}

function modalCloseStyle(c) {
  return {
    width: '28px', height: '28px', borderRadius: '4px', background: '#222',
    border: `1px solid ${c.borderColor}`, display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', color: `${c.textColor}88`
  };
}

function formInputStyle(c) {
  return {
    width: '100%', height: '40px', padding: '0 10px', background: '#1a1a1a',
    border: `1px solid ${c.borderColor}`, borderRadius: '4px', color: '#fff',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  };
}
