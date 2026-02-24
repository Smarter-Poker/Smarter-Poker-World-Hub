/**
 * Membership Gate / Player Kiosk
 * /commander/kiosk
 * Self-service check-in terminal for players entering the poker room
 * - Image-based welcome screen with invisible hitboxes
 * - Check In: search waitlist by name/phone, confirm check-in for all games
 * - Join Waitlist: enter name, select game(s), add to waitlist
 * - New Member: popup directing to staff for membership registration
 * Designed for tablet at room entrance, large touch targets
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  UserCheck, Users, Search, Phone, ChevronRight, Loader2,
  CheckCircle2, AlertTriangle, Clock, Plus, Timer, DollarSign, X
} from 'lucide-react';

// Format phone to 555-555-5555 (internal display only)
function formatPhone(raw) {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  const digits = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Capitalize first letter of every word
function titleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// Live phone formatter: adds dashes as user types (XXX-XXX-XXXX)
function liveFormatPhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export default function MembershipKiosk() {
  const router = useRouter();
  const [mode, setMode] = useState('home');
  // home | scan | scan_join | join_name | join_game | success
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showNewMemberPopup, setShowNewMemberPopup] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueId, setVenueId] = useState(null);

  // Join waitlist fields
  const [joinName, setJoinName] = useState('');
  const [joinPhone, setJoinPhone] = useState('');
  const [selectedGames, setSelectedGames] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);

  // Check-in: waitlist matches
  const [waitlistMatches, setWaitlistMatches] = useState([]);

  // QR Scan check-in
  const [scanQR, setScanQR] = useState('');
  const [scanError, setScanError] = useState('');

  // Staff session header for API calls
  const [staffHeader, setStaffHeader] = useState('');

  // Load venue info from staff session
  useEffect(() => {
    try {
      const staffStr = localStorage.getItem('commander_staff');
      if (staffStr) {
        const staffData = JSON.parse(staffStr);
        if (staffData.venue_name) setVenueName(staffData.venue_name);
        if (staffData.venue_id) setVenueId(staffData.venue_id);
        setStaffHeader(staffStr);
      }
    } catch { /* */ }
  }, []);

  const reset = () => {
    setMode('home'); setPhone(''); setName(''); setSearchResults([]);
    setSuccessMsg(''); setShowNewMemberPopup(false);
    setJoinName(''); setJoinPhone(''); setSelectedGames([]);
    setWaitlistMatches([]); setScanQR(''); setScanError('');
  };

  // Auto-reset after inactivity on success
  useEffect(() => {
    if (mode === 'success') {
      const t = setTimeout(reset, 8000);
      return () => clearTimeout(t);
    }
  }, [mode]);

  // Auto-dismiss new member popup
  useEffect(() => {
    if (showNewMemberPopup) {
      const t = setTimeout(() => setShowNewMemberPopup(false), 10000);
      return () => clearTimeout(t);
    }
  }, [showNewMemberPopup]);

  // ── Fetch available games for this venue ──
  const fetchGames = async () => {
    if (!venueId) return;
    try {
      const res = await fetch(`/api/commander/waitlist?venue_id=${venueId}`, {
        headers: { 'x-staff-session': staffHeader }
      });
      const json = await res.json();
      if (json.success && json.data) {
        // Extract unique game_type + stakes combos from current waitlist
        const seen = new Set();
        const games = [];
        json.data.forEach(e => {
          const key = `${e.game_type}|${e.stakes}`;
          if (!seen.has(key)) {
            seen.add(key);
            games.push({ game_type: e.game_type, stakes: e.stakes, label: `${e.stakes} ${e.game_type}` });
          }
        });
        if (games.length > 0) setAvailableGames(games);
      }
    } catch { /* */ }
    // Always provide fallback games
    if (availableGames.length === 0) {
      setAvailableGames([
        { game_type: 'NLH', stakes: '$1/$2', label: '$1/$2 NLH' },
        { game_type: 'NLH', stakes: '$2/$5', label: '$2/$5 NLH' },
        { game_type: 'PLO', stakes: '$1/$2', label: '$1/$2 PLO' },
        { game_type: 'NLH', stakes: '$5/$10', label: '$5/$10 NLH' }
      ]);
    }
  };

  // ── CHECK IN: Search waitlist for player ──
  const searchWaitlist = async () => {
    const query = (phone || name).trim();
    if (!query || query.length < 2 || !venueId) return;
    setSearching(true);
    try {
      // Fetch all active waitlist entries for this venue
      const res = await fetch(`/api/commander/waitlist?venue_id=${venueId}`, {
        headers: { 'x-staff-session': staffHeader }
      });
      const json = await res.json();
      if (json.success && json.data) {
        const q = query.toLowerCase();
        const matches = json.data.filter(entry => {
          const nameMatch = entry.player_name?.toLowerCase().includes(q);
          const phoneMatch = entry.player_phone?.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
          return nameMatch || phoneMatch;
        });
        setWaitlistMatches(matches);
      }
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  // ── CHECK IN: Confirm check-in for all matching games ──
  const confirmCheckIn = async () => {
    if (waitlistMatches.length === 0) return;
    setSubmitting(true);
    try {
      // Check in all matched waitlist entries
      for (const entry of waitlistMatches) {
        await fetch(`/api/commander/waitlist/${entry.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-staff-session': staffHeader
          },
          body: JSON.stringify({ checked_in_at: new Date().toISOString() })
        });
      }
      const playerName = titleCase(waitlistMatches[0]?.player_name || 'Player');
      const gameList = waitlistMatches.map(e => `${e.stakes} ${e.game_type}`).join(', ');
      setSuccessMsg(`✅ ${playerName} — Checked In!\n${gameList}`);
      setMode('success');
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  // ── SCAN CARD: Look up member by QR code and check in ──
  const handleScanCheckIn = async () => {
    if (!scanQR.trim() || !venueId) return;
    setSubmitting(true);
    setScanError('');
    try {
      const res = await fetch('/api/commander/members/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffHeader },
        body: JSON.stringify({ qr_code: scanQR.trim(), venue_id: venueId })
      });
      const json = await res.json();
      if (!json.success || !json.data?.member) {
        setScanError('Card not recognized. Please try again or search by name.');
        setSubmitting(false);
        return;
      }
      const member = json.data.member;

      // Also check in to waitlist if they have matching entries
      try {
        const wlRes = await fetch(`/api/commander/waitlist?venue_id=${venueId}`, {
          headers: { 'x-staff-session': staffHeader }
        });
        const wlData = await wlRes.json();
        if (wlData.success && wlData.data) {
          const memberName = (member.name || `${member.first_name} ${member.last_name}`).toLowerCase().trim();
          const memberPhone = (member.phone || '').replace(/\D/g, '');
          const matchingEntries = (wlData.data || []).filter(w => {
            if (w.status !== 'waiting' && w.status !== 'called') return false;
            if (w.checked_in_at) return false;
            const wName = (w.player_name || '').toLowerCase().trim();
            const wPhone = (w.player_phone || '').replace(/\D/g, '');
            if (memberPhone && wPhone && memberPhone.slice(-10) === wPhone.slice(-10)) return true;
            if (wName && memberName && wName === memberName) return true;
            return false;
          });
          for (const entry of matchingEntries) {
            await fetch(`/api/commander/waitlist/${entry.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'x-staff-session': staffHeader },
              body: JSON.stringify({ checked_in_at: new Date().toISOString() })
            });
          }
        }
      } catch { /* non-critical */ }

      setSuccessMsg(`✅ ${titleCase(member.first_name || member.name || 'Player')} — Checked In!`);
      setMode('success');
    } catch (err) {
      console.error(err);
      setScanError('Scan failed. Please try again.');
    }
    finally { setSubmitting(false); }
  };

  // ── SCAN CARD → JOIN WAITLIST: Look up member, pre-fill name/phone, go to game select ──
  const handleScanJoinWaitlist = async () => {
    if (!scanQR.trim() || !venueId) return;
    setSubmitting(true);
    setScanError('');
    try {
      const res = await fetch('/api/commander/members/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffHeader },
        body: JSON.stringify({ qr_code: scanQR.trim(), venue_id: venueId })
      });
      const json = await res.json();
      if (!json.success || !json.data?.member) {
        setScanError('Card not recognized. Please enter your name manually.');
        setSubmitting(false);
        return;
      }
      const member = json.data.member;
      const memberName = member.name || `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Player';
      setJoinName(memberName);
      setJoinPhone(member.phone || '');
      fetchGames();
      setMode('join_game');
    } catch (err) {
      console.error(err);
      setScanError('Scan failed. Please enter your name manually.');
    }
    finally { setSubmitting(false); }
  };

  // ── JOIN WAITLIST: Add player to selected games ──
  const submitJoinWaitlist = async () => {
    if (!joinName.trim() || selectedGames.length === 0 || !venueId) return;
    setSubmitting(true);
    try {
      for (const game of selectedGames) {
        await fetch('/api/commander/waitlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-staff-session': staffHeader
          },
          body: JSON.stringify({
            venue_id: venueId,
            game_type: game.game_type,
            stakes: game.stakes,
            player_name: joinName.trim(),
            player_phone: joinPhone.trim() || null,
            signup_method: 'kiosk'
          })
        });
      }
      const gameList = selectedGames.map(g => g.label).join(', ');
      setSuccessMsg(`✅ ${titleCase(joinName.trim())} Added To Waitlist!\n${gameList}`);
      setMode('success');
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  // Haptic feedback for touch devices (iPads, mobiles)
  const haptic = () => {
    try { if (navigator.vibrate) navigator.vibrate(15); } catch { /* not supported */ }
  };

  return (
    <>
      <SEOHead
        title="Commander — Player Kiosk"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#000000] text-[#E4E6EB] font-['Inter'] flex flex-col items-center justify-center p-0" style={{ overflow: 'hidden' }}>

        {/* ===== HOME — Image-Based Welcome ===== */}
        {mode === 'home' && (
          <div style={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000000'
          }}>
            {/*
              Image + hitbox wrapper — hitboxes are positioned relative to THIS container
              so they scale perfectly with the image at any viewport size
            */}
            <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%', display: 'flex' }}>
              {/* Background Image — PNG with transparent background */}
              <img
                src="/images/commander/kiosk-welcome.png?v=3"
                alt="Welcome Kiosk"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block'
                }}
                draggable={false}
              />

              {/* Invisible Hitboxes — positioned relative to the image */}
              {/* Percentages are relative to image dimensions (829x946 after trim) */}

              {/* Check In — Blue button */}
              {/* Image: y~378-448/946 ≈ 40%-47.4%, centered, width ~65% */}
              <button
                onClick={() => { haptic(); setScanQR(''); setScanError(''); setMode('scan'); }}
                style={{
                  position: 'absolute',
                  top: '39.5%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '65%',
                  height: '8%',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                  WebkitTapHighlightColor: 'transparent'
                }}
                aria-label="Check In"
              />

              {/* Join Waitlist — Green button */}
              {/* Image: y~496-566/946 ≈ 52.4%-59.8% */}
              <button
                onClick={() => { haptic(); fetchGames(); setMode('join_name'); }}
                style={{
                  position: 'absolute',
                  top: '52%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '65%',
                  height: '8%',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                  WebkitTapHighlightColor: 'transparent'
                }}
                aria-label="Join Waitlist"
              />

              {/* New Member — Grey button */}
              {/* Image: y~622-692/946 ≈ 65.7%-73.2% */}
              <button
                onClick={() => { haptic(); setShowNewMemberPopup(true); }}
                style={{
                  position: 'absolute',
                  top: '65.5%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '65%',
                  height: '8%',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                  WebkitTapHighlightColor: 'transparent'
                }}
                aria-label="New Member"
              />
            </div>
          </div>
        )}

        {/* ===== NEW MEMBER POPUP ===== */}
        {showNewMemberPopup && (
          <div
            onClick={() => setShowNewMemberPopup(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              padding: '24px'
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'linear-gradient(145deg, #2a2d30, #1a1c1f)',
                border: '2px solid rgba(0,200,255,0.3)',
                borderRadius: '20px',
                padding: '48px 40px',
                maxWidth: '480px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 0 40px rgba(0,200,255,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
                position: 'relative'
              }}
            >
              {/* Close Button */}
              <button
                onClick={() => setShowNewMemberPopup(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#B0B3B8'
                }}
              >
                <X className="w-5 h-5" />
              </button>

              {/* Icon */}
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1877F2, #0d5bbd)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                boxShadow: '0 0 20px rgba(24,119,242,0.4)'
              }}>
                <Users className="w-10 h-10" style={{ color: '#fff' }} />
              </div>

              <h2 style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#fff',
                marginBottom: '16px',
                fontFamily: "'Inter', sans-serif"
              }}>
                Welcome!
              </h2>

              <p style={{
                fontSize: '20px',
                color: '#E4E6EB',
                lineHeight: '1.5',
                marginBottom: '32px',
                fontFamily: "'Inter', sans-serif"
              }}>
                Please see{' '}
                <span style={{
                  color: '#1877F2',
                  fontWeight: '700'
                }}>
                  {venueName || 'our'}
                </span>{' '}
                staff to register for membership.
              </p>

              <button
                onClick={() => setShowNewMemberPopup(false)}
                style={{
                  padding: '16px 48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #3A3B3C, #2a2b2c)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#E4E6EB',
                  fontSize: '18px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                Got It
              </button>
            </div>
          </div>
        )}

        {/* ===== NON-HOME MODES ===== */}
        {mode !== 'home' && (
          <div className="w-full max-w-md mx-auto p-6" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

            {/* Back button */}
            <button onClick={reset}
              style={{
                position: 'fixed',
                top: '24px',
                left: '24px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
                padding: '12px 20px',
                color: '#E4E6EB',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 50,
                fontFamily: "'Inter', sans-serif"
              }}>
              ← Back
            </button>

            {/* ===== SCAN CARD MODE (CHECK-IN) ===== */}
            {mode === 'scan' && (
              <div className="w-full max-w-md space-y-4">
                <div className="text-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-[#1877F2]/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-[#1877F2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Scan Your Player Card</h2>
                  <p className="text-[#B0B3B8] text-sm">Hold your card&apos;s QR code up to the scanner</p>
                </div>

                <input
                  type="text"
                  value={scanQR}
                  onChange={e => setScanQR(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleScanCheckIn(); }}
                  placeholder="Waiting for scan..."
                  autoFocus
                  className="w-full bg-[#3A3B3C] border-2 border-[#1877F2]/50 rounded-xl px-5 py-5 text-white text-xl text-center placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]"
                />

                <button onClick={handleScanCheckIn} disabled={!scanQR.trim() || submitting}
                  className="w-full py-5 rounded-2xl bg-[#1877F2] text-white text-xl font-semibold active:bg-[#1565D8] disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-6 h-6" />}
                  Check In
                </button>

                {scanError && (
                  <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-4 text-center">
                    <p className="text-[#EF4444] text-sm font-medium">{scanError}</p>
                  </div>
                )}

                <div className="text-center pt-2">
                  <button onClick={() => { fetchGames(); setMode('join_name'); }}
                    className="text-[#1877F2] text-sm font-medium underline">
                    Search By Name Instead
                  </button>
                </div>
              </div>
            )}

            {/* ===== SCAN CARD MODE (JOIN WAITLIST) ===== */}
            {mode === 'scan_join' && (
              <div className="w-full max-w-md space-y-4">
                <div className="text-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-[#31A24C]/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-[#31A24C]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Scan Card to Join</h2>
                  <p className="text-[#B0B3B8] text-sm">Hold your card&apos;s QR code up to the scanner</p>
                </div>

                <input
                  type="text"
                  value={scanQR}
                  onChange={e => setScanQR(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleScanJoinWaitlist(); }}
                  placeholder="Waiting for scan..."
                  autoFocus
                  className="w-full bg-[#3A3B3C] border-2 border-[#31A24C]/50 rounded-xl px-5 py-5 text-white text-xl text-center placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#31A24C]"
                />

                <button onClick={handleScanJoinWaitlist} disabled={!scanQR.trim() || submitting}
                  className="w-full py-5 rounded-2xl bg-[#31A24C] text-white text-xl font-semibold active:bg-[#28883F] disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-6 h-6" />}
                  Join Waitlist
                </button>

                {scanError && (
                  <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-4 text-center">
                    <p className="text-[#EF4444] text-sm font-medium">{scanError}</p>
                  </div>
                )}

                <div className="text-center pt-2">
                  <button onClick={() => { fetchGames(); setMode('join_name'); }}
                    className="text-[#31A24C] text-sm font-medium underline">
                    Enter Name Manually Instead
                  </button>
                </div>
              </div>
            )}

            {/* ===== JOIN WAITLIST: Enter Name ===== */}
            {mode === 'join_name' && (
              <div className="w-full max-w-md space-y-4">
                <h2 className="text-2xl font-bold text-white text-center mb-2">Join Waitlist</h2>

                {/* Scan Card — Primary Action */}
                <button onClick={() => { setScanQR(''); setScanError(''); setMode('scan_join'); }}
                  className="w-full py-5 rounded-2xl bg-[#242526] border-2 border-[#31A24C] text-[#E4E6EB] text-xl font-semibold active:bg-[#3A3B3C] flex items-center justify-center gap-3">
                  <svg className="w-6 h-6 text-[#31A24C]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                  Scan Player Card
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#3A3B3C]" />
                  <span className="text-xs text-[#B0B3B8]">Or Enter Manually</span>
                  <div className="flex-1 h-px bg-[#3A3B3C]" />
                </div>

                <div>
                  <label className="text-sm text-[#B0B3B8] mb-1 block">Your Name *</label>
                  <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)}
                    placeholder="First and Last Name"
                    className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-5 py-4 text-white text-xl text-center placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#31A24C]" />
                </div>

                <div>
                  <label className="text-sm text-[#B0B3B8] mb-1 block">Phone (optional — for text alerts)</label>
                  <input type="tel" inputMode="numeric" value={joinPhone} onChange={e => setJoinPhone(liveFormatPhone(e.target.value))}
                    placeholder="(555) 123-4567"
                    className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-5 py-4 text-white text-xl text-center placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#31A24C]" />
                </div>

                <button onClick={() => { if (joinName.trim()) setMode('join_game'); }}
                  disabled={!joinName.trim()}
                  className="w-full py-5 rounded-2xl bg-[#31A24C] text-white text-xl font-semibold active:bg-[#28883F] disabled:opacity-50 flex items-center justify-center gap-2">
                  <ChevronRight className="w-6 h-6" />
                  Next — Select Game
                </button>
              </div>
            )}

            {/* ===== JOIN WAITLIST: Select Game(s) ===== */}
            {mode === 'join_game' && (
              <div className="w-full max-w-md space-y-4">
                <h2 className="text-2xl font-bold text-white text-center mb-1">Select Game</h2>
                <p className="text-center text-[#B0B3B8] text-sm mb-4">
                  Joining as <span className="text-white font-bold">{titleCase(joinName)}</span>
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {availableGames.map(g => {
                    const isSelected = selectedGames.some(s => s.label === g.label);
                    return (
                      <button key={g.label}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedGames(selectedGames.filter(s => s.label !== g.label));
                          } else {
                            setSelectedGames([...selectedGames, g]);
                          }
                        }}
                        className={`py-5 rounded-2xl text-center border-2 ${isSelected
                          ? 'bg-[#31A24C]/20 border-[#31A24C] text-[#31A24C]'
                          : 'bg-[#242526] border-[#3A3B3C] text-[#E4E6EB] active:border-[#31A24C]'
                          }`}>
                        <p className="text-lg font-bold">{g.label}</p>
                        {isSelected && <p className="text-sm mt-1">✓ Selected</p>}
                      </button>
                    );
                  })}
                </div>

                {selectedGames.length > 0 && (
                  <button onClick={submitJoinWaitlist} disabled={submitting}
                    className="w-full py-5 rounded-2xl bg-[#31A24C] text-white text-xl font-semibold active:bg-[#28883F] disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                    Join {selectedGames.length} Waitlist{selectedGames.length > 1 ? 's' : ''}
                  </button>
                )}

                <button onClick={() => setMode('join_name')}
                  className="w-full py-3 rounded-xl bg-transparent text-[#B0B3B8] text-base active:text-white">
                  ← Back to Name
                </button>
              </div>
            )}

            {/* ===== SUCCESS ===== */}
            {mode === 'success' && (
              <div className="w-full max-w-md text-center space-y-6">
                <div className="w-24 h-24 rounded-full bg-[#31A24C]/20 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-12 h-12 text-[#31A24C]" />
                </div>
                <h2 className="text-2xl font-bold text-white whitespace-pre-line">{successMsg}</h2>

                {/* Membership reminder */}
                <div style={{
                  background: 'linear-gradient(145deg, #2a2d30, #1a1c1f)',
                  border: '1px solid rgba(245,158,11,0.4)',
                  borderRadius: '16px',
                  padding: '20px 24px',
                  marginTop: '16px'
                }}>
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="w-6 h-6 text-[#F59E0B] flex-shrink-0" />
                    <p className="text-lg font-semibold text-[#F59E0B]">Membership Required</p>
                  </div>
                  <p className="text-[#E4E6EB] text-base leading-relaxed">
                    You are checked in, but still need a membership to play.
                    Please see <span className="text-[#1877F2] font-bold">{venueName || 'venue'}</span> staff to sign up.
                  </p>
                </div>

                <p className="text-[#B0B3B8] text-sm">This Screen Will Reset Automatically</p>
                <button onClick={reset}
                  className="px-8 py-4 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] text-lg font-medium active:bg-[#4A4B4C]">
                  Done
                </button>
              </div>
            )}

          </div>
        )}

        {/* Branding */}
        <div className="fixed bottom-4 right-6">
          <p className="text-white/10 text-xs">Powered By Smarter.Poker</p>
        </div>
      </div>
    </>
  );
}
