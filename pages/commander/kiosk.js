/**
 * Membership Gate / Player Kiosk
 * /commander/kiosk
 * Self-service check-in terminal for players entering the poker room
 * - Image-based welcome screen with invisible hitboxes
 * - Member lookup by phone or name
 * - Quick waitlist signup
 * - Session check-in
 * - New member popup directing to staff
 * Designed for tablet at room entrance, large touch targets
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  UserCheck, Users, Search, Phone, ChevronRight, Loader2,
  CheckCircle2, AlertTriangle, Clock, Plus, Timer, DollarSign, X
} from 'lucide-react';

export default function MembershipKiosk() {
  const router = useRouter();
  const [mode, setMode] = useState('home'); // home, lookup, register, waitlist, buy_time, success
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [gameType, setGameType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedTimePackage, setSelectedTimePackage] = useState(null);
  const [purchasingTime, setPurchasingTime] = useState(false);
  const [showNewMemberPopup, setShowNewMemberPopup] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueId, setVenueId] = useState(null);
  const [lookupIntent, setLookupIntent] = useState('checkin'); // 'checkin' or 'waitlist'

  // New member fields
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Load venue name from staff session
  useEffect(() => {
    try {
      const staffStr = localStorage.getItem('commander_staff');
      if (staffStr) {
        const staffData = JSON.parse(staffStr);
        if (staffData.venue_name) setVenueName(staffData.venue_name);
        if (staffData.venue_id) setVenueId(staffData.venue_id);
      }
    } catch { /* */ }
  }, []);

  const reset = () => {
    setMode('home'); setPhone(''); setName(''); setSearchResults([]);
    setSelectedMember(null); setGameType(''); setSuccessMsg('');
    setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail('');
    setShowNewMemberPopup(false); setLookupIntent('checkin');
  };

  // Auto-reset after inactivity
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

  const searchMembers = async () => {
    const query = phone || name;
    if (!query || query.length < 2) return;
    setSearching(true);
    try {
      let venueId = null;
      const staffSession = typeof window !== 'undefined' ? localStorage.getItem('commander_staff') : null;
      if (staffSession) {
        try { venueId = JSON.parse(staffSession).venue_id; } catch { /* */ }
      }
      const headers = {};
      if (staffSession) headers['x-staff-session'] = staffSession;
      const res = await fetch(`/api/commander/members/search?q=${encodeURIComponent(query)}&limit=10${venueId ? `&venue_id=${venueId}` : ''}`, { headers });
      const json = await res.json();
      if (json.success) setSearchResults(json.data || []);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  const checkIn = async (member) => {
    setSubmitting(true);
    try {
      await fetch('/api/commander/members/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: member.id })
      });

      // Also mark any matching waitlist entries as checked-in
      // This links web sign-ups to kiosk check-in
      try {
        const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        const venueId = staffData.venue_id;
        const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
        const staffStr = localStorage.getItem('commander_staff') || '';
        if (venueId) {
          // Fetch active waitlist entries for this venue
          const wlRes = await fetch(`/api/commander/waitlist?venue_id=${venueId}`, {
            headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffStr }
          });
          const wlData = await wlRes.json();
          if (wlData.success && wlData.data) {
            const memberName = (member.name || `${member.first_name} ${member.last_name}`).toLowerCase().trim();
            const memberPhone = (member.phone || '').replace(/\D/g, '');
            // Find matching waitlist entries by name or phone
            const matchingEntries = (wlData.data || []).filter(w => {
              if (w.status !== 'waiting' && w.status !== 'called') return false;
              if (w.checked_in_at) return false;
              const wName = (w.player_name || '').toLowerCase().trim();
              const wPhone = (w.player_phone || '').replace(/\D/g, '');
              // Match by phone (most reliable) or by name
              if (memberPhone && wPhone && memberPhone.slice(-10) === wPhone.slice(-10)) return true;
              if (wName && memberName && wName === memberName) return true;
              return false;
            });
            // Check in each matching waitlist entry
            for (const entry of matchingEntries) {
              await fetch(`/api/commander/waitlist/${entry.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffStr },
                body: JSON.stringify({ checked_in_at: new Date().toISOString() })
              });
            }
          }
        }
      } catch (wlErr) {
        // Non-critical — member check-in already succeeded
        console.warn('Waitlist check-in sync warning:', wlErr);
      }

      setSuccessMsg(`Welcome back, ${member.first_name || member.name}!`);
      setMode('success');
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const joinWaitlist = async () => {
    if (!selectedMember || !gameType) return;
    setSubmitting(true);
    try {
      // Parse gameType label (e.g. "$1/$2 NLH") into game_type + stakes
      const parts = gameType.split(' ');
      const parsedStakes = parts.length > 1 ? parts.slice(0, -1).join(' ') : gameType;
      const parsedGameType = parts.length > 1 ? parts[parts.length - 1] : 'NLH';

      // Get venue_id from staff localStorage
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const venueId = staffData.venue_id;

      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
      const staffStr = localStorage.getItem('commander_staff') || '';
      await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-staff-session': staffStr
        },
        body: JSON.stringify({
          venue_id: venueId,
          player_name: selectedMember.name || `${selectedMember.first_name} ${selectedMember.last_name}`,
          player_phone: selectedMember.phone,
          game_type: parsedGameType,
          stakes: parsedStakes,
          signup_method: 'kiosk'
        })
      });
      setSuccessMsg(`Added to ${gameType} waitlist! We'll text you when a seat opens.`);
      setMode('success');
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const registerNewMember = async () => {
    if (!newFirst || !newLast) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/commander/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: newFirst,
          last_name: newLast,
          phone: newPhone || null,
          email: newEmail || null
        })
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Welcome, ${newFirst}! You're all set.`);
        setMode('success');
      }
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  return (
    <>
      <SEOHead
        title="Commander — Player Kiosk"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] flex flex-col items-center justify-center p-0" style={{ overflow: 'hidden' }}>

        {/* ===== HOME — Image-Based Welcome ===== */}
        {mode === 'home' && (
          <div style={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a'
          }}>
            {/* Background Image */}
            <img
              src="/images/commander/kiosk-welcome.png"
              alt="Welcome Kiosk"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
              draggable={false}
            />

            {/* Invisible Hitboxes — positioned over the baked-in buttons */}
            {/* These percentages match the button positions in the provided image */}

            {/* Check In — Blue button (pixel: 36-45%) */}
            <button
              onClick={() => { setLookupIntent('checkin'); setMode('lookup'); }}
              style={{
                position: 'absolute',
                top: '35%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '55%',
                height: '11%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                zIndex: 10
              }}
              aria-label="Check In"
            />

            {/* Join Waitlist — Green button (pixel: 50-59%) → opens venue waitlist page */}
            <button
              onClick={() => {
                if (venueId) {
                  router.push(`/hub/commander/waitlist/${venueId}`);
                } else {
                  setLookupIntent('waitlist'); setMode('lookup');
                }
              }}
              style={{
                position: 'absolute',
                top: '49%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '55%',
                height: '11%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                zIndex: 10
              }}
              aria-label="Join Waitlist"
            />

            {/* New Member — Grey button (pixel: 64-73%) */}
            <button
              onClick={() => setShowNewMemberPopup(true)}
              style={{
                position: 'absolute',
                top: '63%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '55%',
                height: '11%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                zIndex: 10
              }}
              aria-label="New Member"
            />
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

        {/* ===== NON-HOME MODES — Contained in a panel ===== */}
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

            {/* ===== MEMBER LOOKUP ===== */}
            {mode === 'lookup' && !selectedMember && (
              <div className="w-full max-w-md space-y-4">
                <h2 className="text-2xl font-bold text-white">Find Your Account</h2>

                <div>
                  <label className="text-sm text-[#B0B3B8] mb-1 block">Phone Number</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 123-4567" autoFocus
                    className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-5 py-4 text-white text-xl text-center placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]" />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#3A3B3C]" />
                  <span className="text-xs text-[#B0B3B8]">Or</span>
                  <div className="flex-1 h-px bg-[#3A3B3C]" />
                </div>

                <div>
                  <label className="text-sm text-[#B0B3B8] mb-1 block">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-5 py-4 text-white text-xl text-center placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]" />
                </div>

                <button onClick={searchMembers} disabled={(!phone && !name) || searching}
                  className="w-full py-4 rounded-xl bg-[#1877F2] text-white text-lg font-semibold active:bg-[#1565D8] disabled:opacity-50 flex items-center justify-center gap-2">
                  {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  Search
                </button>

                {searchResults.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {searchResults.map(m => (
                      <button key={m.id} onClick={() => setSelectedMember(m)}
                        className="w-full bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 flex items-center gap-3 active:bg-[#3A3B3C] text-left">
                        <UserCheck className="w-6 h-6 text-[#1877F2]" />
                        <div className="flex-1">
                          <p className="text-lg font-medium text-white">{m.name || `${m.first_name} ${m.last_name}`}</p>
                          {m.phone && <p className="text-sm text-[#B0B3B8]">{m.phone}</p>}
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#B0B3B8]" />
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && (phone || name) && !searching && (
                  <div className="text-center py-4">
                    <p className="text-[#B0B3B8] mb-3">No Account Found</p>
                    <p className="text-sm text-[#B0B3B8]">
                      Please see <span className="text-[#1877F2] font-bold">{venueName || 'venue'}</span> staff to register.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ===== MEMBER FOUND — Actions ===== */}
            {mode === 'lookup' && selectedMember && (
              <div className="w-full max-w-md space-y-4">

                <div className="bg-[#242526] rounded-2xl p-5 text-center border border-[#3A3B3C]">
                  <div className="w-16 h-16 rounded-full bg-[#1877F2]/20 flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-8 h-8 text-[#1877F2]" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    {selectedMember.name || `${selectedMember.first_name} ${selectedMember.last_name}`}
                  </h2>
                  {selectedMember.phone && <p className="text-[#B0B3B8] mt-1">{selectedMember.phone}</p>}
                  {selectedMember.time_balance_minutes !== undefined && (
                    <div className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full ${(selectedMember.time_balance_minutes || 0) > 0 ? 'bg-[#31A24C]/10 text-[#31A24C]' : 'bg-[#EF4444]/10 text-[#EF4444]'
                      }`}>
                      <Timer className="w-4 h-4" />
                      <span className="text-sm font-bold">{selectedMember.time_balance_minutes || 0} min on card</span>
                    </div>
                  )}
                </div>

                <button onClick={() => checkIn(selectedMember)} disabled={submitting}
                  className="w-full py-5 rounded-2xl bg-[#1877F2] text-white text-xl font-semibold active:bg-[#1565D8] disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-6 h-6" />}
                  Check In
                </button>

                <div>
                  <p className="text-sm text-[#B0B3B8] mb-2">Join A Waitlist:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['$1/$2 NLH', '$2/$5 NLH', '$1/$2 PLO', '$5/$10 NLH'].map(g => (
                      <button key={g} onClick={() => setGameType(g)}
                        className={`py-4 rounded-xl text-base font-medium ${gameType === g ? 'bg-[#31A24C] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'
                          }`}>
                        {g}
                      </button>
                    ))}
                  </div>
                  {gameType && (
                    <button onClick={joinWaitlist} disabled={submitting}
                      className="w-full mt-3 py-4 rounded-xl bg-[#31A24C] text-white text-lg font-semibold active:bg-[#28883F] disabled:opacity-50">
                      Join {gameType} Waitlist
                    </button>
                  )}
                </div>

                <button onClick={() => setMode('buy_time')}
                  className="w-full py-5 rounded-2xl bg-[#F59E0B]/10 border-2 border-[#F59E0B]/40 text-[#F59E0B] text-xl font-semibold flex items-center justify-center gap-3 active:bg-[#F59E0B]/20">
                  <Timer className="w-6 h-6" /> Buy Play Time
                </button>
              </div>
            )}

            {/* ===== BUY TIME ===== */}
            {mode === 'buy_time' && selectedMember && (
              <div className="w-full max-w-md space-y-4">

                <div className="bg-[#242526] rounded-2xl p-4 border border-[#3A3B3C] flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-[#1877F2]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-white">
                      {selectedMember.first_name} {selectedMember.last_name}
                    </p>
                    <p className="text-sm text-[#B0B3B8]">
                      Current balance: <span className="font-bold text-[#31A24C]">{selectedMember.time_balance_minutes || 0} min</span>
                    </p>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-white text-center">Select Time Package</h3>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { minutes: 30, price: 5, label: '30 Min' },
                    { minutes: 60, price: 10, label: '1 Hour' },
                    { minutes: 120, price: 18, label: '2 Hours' },
                    { minutes: 180, price: 25, label: '3 Hours' },
                    { minutes: 300, price: 35, label: '5 Hours' },
                    { minutes: 480, price: 50, label: '8 Hours' }
                  ].map(pkg => (
                    <button key={pkg.minutes}
                      onClick={() => setSelectedTimePackage(pkg)}
                      className={`py-5 rounded-2xl text-center space-y-1 border-2 ${selectedTimePackage?.minutes === pkg.minutes
                        ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B]'
                        : 'bg-[#242526] border-[#3A3B3C] text-[#E4E6EB] active:border-[#F59E0B]'
                        }`}>
                      <p className="text-2xl font-bold">{pkg.label}</p>
                      <p className="text-lg font-semibold">${pkg.price}</p>
                    </button>
                  ))}
                </div>

                {selectedTimePackage && (
                  <button
                    onClick={async () => {
                      setPurchasingTime(true);
                      try {
                        const res = await fetch('/api/commander/kiosk/buy-time', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            member_id: selectedMember.id,
                            minutes: selectedTimePackage.minutes,
                            amount: selectedTimePackage.price,
                            payment_method: 'kiosk'
                          })
                        });
                        const json = await res.json();
                        if (json.success) {
                          setSuccessMsg(`${selectedTimePackage.label} added! New balance: ${json.data.new_balance} min`);
                          const pw = window.open('', '_blank', 'width=400,height=600');
                          if (pw) {
                            pw.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>@page{margin:0;size:80mm auto}body{font-family:'Courier New',monospace;margin:0;padding:0}.r{width:72mm;padding:4mm;margin:0 auto}.c{text-align:center}.b{font-weight:bold}.big{font-size:24px}.med{font-size:14px}.sm{font-size:11px}.d{border-top:1px dashed #000;margin:3mm 0}.row{display:flex;justify-content:space-between}</style></head><body><div class="r"><div class="c b med">SMARTER.POKER</div><div class="c sm">Time Purchase Receipt</div><div class="d"></div><div class="row sm"><span>Player:</span><span class="b">${selectedMember.name || selectedMember.first_name || 'Player'}</span></div><div class="d"></div><div class="row sm"><span>Package:</span><span class="b">${selectedTimePackage.label}</span></div><div class="row sm"><span>Minutes:</span><span class="b">${selectedTimePackage.minutes}</span></div><div class="d"></div><div class="c b big">$${selectedTimePackage.price}</div><div class="c sm">PAID - KIOSK</div><div class="d"></div><div class="sm c" style="opacity:.6">${new Date().toLocaleString()}</div><div class="sm c" style="opacity:.4;margin-top:1mm">Smarter.Poker</div></div></body></html>`);
                            pw.document.close();
                            setTimeout(() => { pw.print(); pw.close(); }, 500);
                          }
                          setMode('success');
                        }
                      } catch (err) { console.error(err); }
                      finally { setPurchasingTime(false); }
                    }}
                    disabled={purchasingTime}
                    className="w-full py-5 rounded-2xl bg-[#F59E0B] text-white text-xl font-semibold flex items-center justify-center gap-3 active:bg-[#D97706] disabled:opacity-50">
                    {purchasingTime ? <Loader2 className="w-6 h-6 animate-spin" /> : <DollarSign className="w-6 h-6" />}
                    Buy {selectedTimePackage.label} — ${selectedTimePackage.price}
                  </button>
                )}
              </div>
            )}

            {/* ===== NEW MEMBER REGISTRATION ===== */}
            {mode === 'register' && (
              <div className="w-full max-w-md space-y-4">
                <h2 className="text-2xl font-bold text-white">New Member</h2>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-[#B0B3B8] mb-1 block">First Name</label>
                    <input type="text" value={newFirst} onChange={e => setNewFirst(e.target.value)}
                      className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-[#1877F2]" autoFocus />
                  </div>
                  <div>
                    <label className="text-sm text-[#B0B3B8] mb-1 block">Last Name</label>
                    <input type="text" value={newLast} onChange={e => setNewLast(e.target.value)}
                      className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-[#1877F2]" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[#B0B3B8] mb-1 block">Phone (for Waitlist Texts)</label>
                  <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]" />
                </div>
                <div>
                  <label className="text-sm text-[#B0B3B8] mb-1 block">Email (optional)</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]" />
                </div>

                <button onClick={registerNewMember} disabled={!newFirst || !newLast || submitting}
                  className="w-full py-4 rounded-xl bg-[#31A24C] text-white text-lg font-semibold active:bg-[#28883F] disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Create Account
                </button>
              </div>
            )}

            {/* ===== SUCCESS ===== */}
            {mode === 'success' && (
              <div className="w-full max-w-md text-center space-y-6">
                <div className="w-24 h-24 rounded-full bg-[#31A24C]/20 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-12 h-12 text-[#31A24C]" />
                </div>
                <h2 className="text-3xl font-bold text-white">{successMsg}</h2>
                <p className="text-[#B0B3B8]">This Screen Will Reset Automatically</p>
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

