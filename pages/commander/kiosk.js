/**
 * Membership Gate / Player Kiosk
 * /commander/kiosk
 * Self-service check-in terminal for players entering the poker room
 * - Member lookup by phone or name
 * - Quick waitlist signup
 * - Session check-in
 * - New member registration
 * Designed for tablet at room entrance, large touch targets
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  UserCheck, Users, Search, Phone, ChevronRight, Loader2,
  CheckCircle2, AlertTriangle, Clock, Plus, ArrowLeft
} from 'lucide-react';

export default function MembershipKiosk() {
  const router = useRouter();
  const [mode, setMode] = useState('home'); // home, lookup, register, waitlist, success
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [gameType, setGameType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // New member fields
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const reset = () => {
    setMode('home'); setPhone(''); setName(''); setSearchResults([]);
    setSelectedMember(null); setGameType(''); setSuccessMsg('');
    setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail('');
  };

  // Auto-reset after inactivity
  useEffect(() => {
    if (mode === 'success') {
      const t = setTimeout(reset, 8000);
      return () => clearTimeout(t);
    }
  }, [mode]);

  const searchMembers = async () => {
    const query = phone || name;
    if (!query || query.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/commander/members/search?q=${encodeURIComponent(query)}&limit=10`);
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
      setSuccessMsg(`Welcome back, ${member.first_name || member.name}!`);
      setMode('success');
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const joinWaitlist = async () => {
    if (!selectedMember || !gameType) return;
    setSubmitting(true);
    try {
      await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: selectedMember.name || `${selectedMember.first_name} ${selectedMember.last_name}`,
          phone: selectedMember.phone,
          game_type: gameType,
          member_id: selectedMember.id
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
      <Head>
        <title>Check In | Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
      </Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] flex flex-col items-center justify-center p-6">

        {/* ===== HOME ===== */}
        {mode === 'home' && (
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">Welcome</h1>
              <p className="text-lg text-[#B0B3B8]">Tap to get started</p>
            </div>

            <button onClick={() => setMode('lookup')}
              className="w-full py-6 rounded-2xl bg-[#1877F2] text-white text-xl font-semibold flex items-center justify-center gap-3 active:bg-[#1565D8]">
              <UserCheck className="w-7 h-7" /> Check In
            </button>

            <button onClick={() => setMode('lookup')}
              className="w-full py-6 rounded-2xl bg-[#31A24C] text-white text-xl font-semibold flex items-center justify-center gap-3 active:bg-[#28883F]">
              <Clock className="w-7 h-7" /> Join Waitlist
            </button>

            <button onClick={() => setMode('register')}
              className="w-full py-6 rounded-2xl bg-[#3A3B3C] text-[#E4E6EB] text-xl font-semibold flex items-center justify-center gap-3 active:bg-[#4A4B4C]">
              <Plus className="w-7 h-7" /> New Member
            </button>
          </div>
        )}

        {/* ===== MEMBER LOOKUP ===== */}
        {mode === 'lookup' && !selectedMember && (
          <div className="w-full max-w-md space-y-4">
            <button onClick={reset} className="flex items-center gap-2 text-[#B0B3B8] mb-4">
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
            <h2 className="text-2xl font-bold text-white">Find Your Account</h2>

            <div>
              <label className="text-sm text-[#B0B3B8] mb-1 block">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="(555) 123-4567" autoFocus
                className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-5 py-4 text-white text-xl text-center placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]" />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#3A3B3C]" />
              <span className="text-xs text-[#B0B3B8]">or</span>
              <div className="flex-1 h-px bg-[#3A3B3C]" />
            </div>

            <div>
              <label className="text-sm text-[#B0B3B8] mb-1 block">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name"
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
                <p className="text-[#B0B3B8] mb-3">No account found</p>
                <button onClick={() => { setNewFirst(name.split(' ')[0] || ''); setNewLast(name.split(' ').slice(1).join(' ') || ''); setNewPhone(phone); setMode('register'); }}
                  className="px-6 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">
                  Register as New Member
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== MEMBER FOUND — Actions ===== */}
        {mode === 'lookup' && selectedMember && (
          <div className="w-full max-w-md space-y-4">
            <button onClick={() => setSelectedMember(null)} className="flex items-center gap-2 text-[#B0B3B8] mb-4">
              <ArrowLeft className="w-5 h-5" /> Back
            </button>

            <div className="bg-[#242526] rounded-2xl p-5 text-center border border-[#3A3B3C]">
              <div className="w-16 h-16 rounded-full bg-[#1877F2]/20 flex items-center justify-center mx-auto mb-3">
                <UserCheck className="w-8 h-8 text-[#1877F2]" />
              </div>
              <h2 className="text-2xl font-bold text-white">
                {selectedMember.name || `${selectedMember.first_name} ${selectedMember.last_name}`}
              </h2>
              {selectedMember.phone && <p className="text-[#B0B3B8] mt-1">{selectedMember.phone}</p>}
            </div>

            <button onClick={() => checkIn(selectedMember)} disabled={submitting}
              className="w-full py-5 rounded-2xl bg-[#1877F2] text-white text-xl font-semibold active:bg-[#1565D8] disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-6 h-6" />}
              Check In
            </button>

            <div>
              <p className="text-sm text-[#B0B3B8] mb-2">Join a waitlist:</p>
              <div className="grid grid-cols-2 gap-2">
                {['$1/$2 NLH', '$2/$5 NLH', '$1/$2 PLO', '$5/$10 NLH'].map(g => (
                  <button key={g} onClick={() => setGameType(g)}
                    className={`py-4 rounded-xl text-base font-medium ${
                      gameType === g ? 'bg-[#31A24C] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'
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
          </div>
        )}

        {/* ===== NEW MEMBER REGISTRATION ===== */}
        {mode === 'register' && (
          <div className="w-full max-w-md space-y-4">
            <button onClick={reset} className="flex items-center gap-2 text-[#B0B3B8] mb-4">
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
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
              <label className="text-sm text-[#B0B3B8] mb-1 block">Phone (for waitlist texts)</label>
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
            <p className="text-[#B0B3B8]">This screen will reset automatically</p>
            <button onClick={reset}
              className="px-8 py-4 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] text-lg font-medium active:bg-[#4A4B4C]">
              Done
            </button>
          </div>
        )}

        {/* Branding */}
        <div className="fixed bottom-4 right-6">
          <p className="text-white/10 text-xs">Powered by Smarter.Poker</p>
        </div>
      </div>
    </>
  );
}
