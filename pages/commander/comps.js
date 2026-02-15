/**
 * Comp System
 * /commander/comps
 * 
 * Floor managers use this to:
 * - View comp rates per game/hour
 * - Award manual comps to players
 * - View top comp earners
 * - Process comp redemptions
 * - Set auto-comp rules based on play time
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Gift, DollarSign, Users, Clock, Search,
  Plus, Loader2, RefreshCw, Check, Star, TrendingUp, Lock, X, Shield
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

export default function CompSystem() {
  const router = useRouter();
  const [tab, setTab] = useState('award'); // award, balances, rates, history
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [balances, setBalances] = useState([]);
  const [rates, setRates] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [compAmount, setCompAmount] = useState('');
  const [compReason, setCompReason] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [awarded, setAwarded] = useState(false);

  // PIN authorization state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;
  const getVenueId = () => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  };

  useEffect(() => { fetchData(); }, [tab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const venueId = getVenueId();
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (tab === 'balances') {
        // Get members with comp balances from members API
        const res = await fetch(`/api/commander/members?venue_id=${venueId}&has_comps=true&limit=100`);
        const json = await res.json();
        if (json.success) {
          const members = json.data?.members || json.data || [];
          setBalances(members.filter(m => (m.comp_balance || 0) > 0).map(m => ({
            member_id: m.id,
            member_name: m.first_name,
            last_name: m.last_name,
            balance: m.comp_balance || 0,
            lifetime_earned: m.comp_lifetime_earned || 0,
            membership_tier: m.membership_tier
          })));
        }
      } else if (tab === 'rates') {
        const res = await fetch('/api/commander/comps/rates', { headers });
        const json = await res.json();
        if (json.success) setRates(json.data || []);
      } else if (tab === 'history') {
        const res = await fetch(`/api/commander/comps/balances?venue_id=${venueId}&history=true`, { headers });
        const json = await res.json();
        setTransactions(json.data?.transactions || json.transactions || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const searchMembers = async () => {
    if (!searchQuery || searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/commander/members/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      const json = await res.json();
      if (json.success) setSearchResults(json.data || []);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  // Step 1: User clicks "Award" → show PIN modal
  const requestComp = () => {
    if (!selectedMember || !compAmount) return;
    setPinCode('');
    setPinError('');
    setShowPinModal(true);
  };

  // Step 2: Verify PIN, then award
  const verifyPinAndAward = async () => {
    if (!pinCode || pinCode.length < 4) {
      setPinError('Enter your 4+ digit staff PIN');
      return;
    }
    setVerifying(true);
    setPinError('');
    try {
      const venueId = getVenueId();
      // Verify PIN
      const pinRes = await fetch('/api/commander/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, pin_code: pinCode })
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok || !pinData.success) {
        setPinError(pinData.error?.message || 'Invalid PIN');
        setVerifying(false);
        return;
      }

      const authorizer = pinData.data?.staff;

      // PIN valid → award comp
      setShowPinModal(false);
      setAwarding(true);
      const token = getToken();
      const res = await fetch('/api/commander/comps/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          member_id: selectedMember.id,
          amount: parseFloat(compAmount),
          reason: compReason || 'Manual comp award',
          type: 'award',
          authorized_by: authorizer?.display_name || authorizer?.id || 'Staff',
          authorized_pin: true
        })
      });
      const json = await res.json();
      if (json.success) {
        setAwarded(true);
        setTimeout(() => {
          setAwarded(false);
          setSelectedMember(null);
          setCompAmount('');
          setCompReason('');
          setSearchQuery('');
          setSearchResults([]);
        }, 2000);
      }
    } catch (err) { console.error(err); }
    finally { setAwarding(false); }
  };

  const TABS = [
    { key: 'award', label: 'Award', icon: Gift },
    { key: 'balances', label: 'Balances', icon: DollarSign },
    { key: 'rates', label: 'Rates', icon: TrendingUp },
    { key: 'history', label: 'History', icon: Clock }
  ];

  const QUICK_AMOUNTS = [5, 10, 15, 20, 25, 50];
  const REASONS = ['Play time', 'Tournament entry', 'Bad beat bonus', 'Promotion', 'Loyalty reward', 'Manager discretion'];

  return (
    <CommanderLayout title="Comp System" backHref="/commander/dashboard">
    <>
      <Head><title>Comp System | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* PIN Authorization Modal */}
        {showPinModal && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
            <div className="bg-[#242526] rounded-2xl w-full max-w-sm border border-[#3A3B3C] shadow-2xl">
              <div className="p-5 text-center border-b border-[#3A3B3C]">
                <div className="w-14 h-14 rounded-full bg-[#F59E0B]/10 flex items-center justify-center mx-auto mb-3">
                  <Shield className="w-7 h-7 text-[#F59E0B]" />
                </div>
                <h3 className="text-lg font-bold text-white">Staff Authorization</h3>
                <p className="text-sm text-[#B0B3B8] mt-1">
                  Enter your staff PIN to award <span className="text-[#31A24C] font-bold">${compAmount}</span> comp
                  to <span className="text-white font-medium">{selectedMember?.first_name} {selectedMember?.last_name}</span>
                </p>
              </div>
              <div className="p-5 space-y-4">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinCode}
                  onChange={e => { setPinCode(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  onKeyDown={e => e.key === 'Enter' && verifyPinAndAward()}
                  placeholder="Enter 4+ digit PIN"
                  autoFocus
                  className="w-full px-4 py-4 bg-[#18191A] border border-[#4A4B4C] rounded-xl text-white text-center text-2xl tracking-[0.5em] placeholder:text-[#6A6B6D] placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-[#1877F2]"
                />
                {pinError && (
                  <p className="text-sm text-[#EF4444] text-center">{pinError}</p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setShowPinModal(false); setPinCode(''); setPinError(''); }}
                    className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-white font-medium active:bg-[#4A4B4C]">
                    Cancel
                  </button>
                  <button onClick={verifyPinAndAward} disabled={verifying || pinCode.length < 4}
                    className="flex-1 py-3 rounded-xl bg-[#31A24C] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 active:bg-[#28883F]">
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {verifying ? 'Verifying...' : 'Authorize'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="cmd-back-btn" onClick={() => router.push('/commander/dashboard')}>
              <ArrowLeft size={16} /> Back
            </button>
            <h1 className="text-lg font-bold text-white">Comp System</h1>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-3 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px ${
                tab === t.key ? 'text-[#1877F2] border-[#1877F2]' : 'text-[#B0B3B8] border-transparent'
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 max-w-lg mx-auto">

          {/* ===== AWARD TAB ===== */}
          {tab === 'award' && (
            <div className="space-y-4">
              {awarded ? (
                <div className="py-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-[#31A24C]/20 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-10 h-10 text-[#31A24C]" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Comp Awarded</h2>
                  <p className="text-[#B0B3B8] mt-2">${compAmount} to {selectedMember?.first_name} {selectedMember?.last_name}</p>
                </div>
              ) : !selectedMember ? (
                <>
                  {/* Search */}
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B3B8]" />
                      <input type="text" value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchMembers()}
                        placeholder="Search member by name or phone..."
                        className="w-full pl-10 pr-4 py-3 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-[#E4E6EB] placeholder-[#6A6B6D] focus:outline-none focus:border-[#1877F2]" />
                    </div>
                    <button onClick={searchMembers} disabled={searching}
                      className="px-4 py-3 bg-[#1877F2] rounded-xl text-white font-medium active:bg-[#1565D8]">
                      {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
                    </button>
                  </div>

                  {/* Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-1">
                      {searchResults.map(m => (
                        <button key={m.id} onClick={() => setSelectedMember(m)}
                          className="w-full px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl text-left flex items-center gap-3 active:bg-[#2D2E2F]">
                          <div className="w-10 h-10 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                            <Users className="w-5 h-5 text-[#1877F2]" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-white">{m.first_name} {m.last_name}</p>
                            <p className="text-xs text-[#B0B3B8]">{m.phone || m.email || m.member_number || ''}</p>
                          </div>
                          {m.comp_balance !== undefined && (
                            <span className="text-sm font-bold text-[#31A24C]">${(m.comp_balance || 0).toFixed(2)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Selected member */}
                  <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                      <Users className="w-6 h-6 text-[#1877F2]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-bold text-white">{selectedMember.first_name} {selectedMember.last_name}</p>
                      <p className="text-xs text-[#B0B3B8]">
                        Balance: <span className="text-[#31A24C] font-bold">${(selectedMember.comp_balance || 0).toFixed(2)}</span>
                      </p>
                    </div>
                    <button onClick={() => { setSelectedMember(null); setSearchResults([]); }}
                      className="text-xs text-[#B0B3B8]">Change</button>
                  </div>

                  {/* Quick amounts */}
                  <div>
                    <p className="text-xs text-[#B0B3B8] uppercase tracking-wider mb-2">Amount</p>
                    <div className="grid grid-cols-3 gap-2">
                      {QUICK_AMOUNTS.map(amt => (
                        <button key={amt}
                          onClick={() => setCompAmount(String(amt))}
                          className={`py-3 rounded-xl text-base font-semibold ${
                            compAmount === String(amt) ? 'bg-[#31A24C] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB]'
                          }`}>${amt}</button>
                      ))}
                    </div>
                    <input type="number" value={compAmount}
                      onChange={e => setCompAmount(e.target.value)}
                      placeholder="Custom amount"
                      className="w-full mt-2 px-4 py-3 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-[#E4E6EB] placeholder-[#6A6B6D] focus:outline-none focus:border-[#1877F2] text-center text-lg" />
                  </div>

                  {/* Reason */}
                  <div>
                    <p className="text-xs text-[#B0B3B8] uppercase tracking-wider mb-2">Reason</p>
                    <div className="flex flex-wrap gap-2">
                      {REASONS.map(r => (
                        <button key={r} onClick={() => setCompReason(r)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                            compReason === r ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'
                          }`}>{r}</button>
                      ))}
                    </div>
                  </div>

                  {/* Award button */}
                  <button onClick={requestComp} disabled={awarding || !compAmount}
                    className="w-full py-4 rounded-xl bg-[#31A24C] text-white text-lg font-semibold flex items-center justify-center gap-2 active:bg-[#28883F] disabled:opacity-50">
                    {awarding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
                    Award ${compAmount || '0'} Comp
                  </button>
                </>
              )}
            </div>
          )}

          {/* ===== BALANCES TAB ===== */}
          {tab === 'balances' && (
            <div className="space-y-2">
              <p className="text-sm text-[#B0B3B8] mb-3">Members with comp balances (sorted by highest)</p>
              {loading ? (
                <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" /></div>
              ) : balances.length === 0 ? (
                <p className="py-10 text-center text-[#B0B3B8]">No comp balances yet</p>
              ) : (
                balances.sort((a, b) => (b.balance || 0) - (a.balance || 0)).map((b, i) => (
                  <div key={b.member_id || i} className="flex items-center gap-3 px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                    <span className="text-xs text-[#B0B3B8] w-6">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{b.member_name || b.first_name || 'Member'} {b.last_name || ''}</p>
                    </div>
                    <span className="text-lg font-bold text-[#31A24C]">${(b.balance || 0).toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ===== RATES TAB ===== */}
          {tab === 'rates' && (
            <div className="space-y-4">
              <p className="text-sm text-[#B0B3B8]">Auto-comp earning rates per hour of play</p>
              {loading ? (
                <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {[
                    { game: '$1/$2 NLH', rate: 1.00, tier: 'standard' },
                    { game: '$2/$5 NLH', rate: 2.00, tier: 'standard' },
                    { game: '$5/$10 NLH', rate: 4.00, tier: 'standard' },
                    { game: '$1/$2 PLO', rate: 1.50, tier: 'standard' },
                    { game: '$2/$5 PLO', rate: 3.00, tier: 'standard' }
                  ].concat(rates).map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-white">{r.game || r.game_type}</p>
                        <p className="text-xs text-[#B0B3B8]">{r.tier || 'All tiers'}</p>
                      </div>
                      <span className="text-base font-bold text-[#1877F2]">${(r.rate || r.rate_per_hour || 0).toFixed(2)}/hr</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== HISTORY TAB ===== */}
          {tab === 'history' && (
            <div className="space-y-1">
              <p className="text-sm text-[#B0B3B8] mb-3">Recent comp transactions</p>
              {loading ? (
                <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" /></div>
              ) : transactions.length === 0 ? (
                <p className="py-10 text-center text-[#B0B3B8]">No transactions yet</p>
              ) : (
                transactions.slice(0, 30).map((t, i) => (
                  <div key={t.id || i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#3A3B3C]/50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      t.type === 'award' || t.amount > 0 ? 'bg-[#31A24C]/10' : 'bg-[#EF4444]/10'
                    }`}>
                      {t.type === 'award' || t.amount > 0
                        ? <Plus className="w-4 h-4 text-[#31A24C]" />
                        : <DollarSign className="w-4 h-4 text-[#EF4444]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{t.member_name || 'Member'}</p>
                      <p className="text-[10px] text-[#B0B3B8]">{t.reason || t.type}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${t.amount > 0 ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>
                        {t.amount > 0 ? '+' : ''}${Math.abs(t.amount || 0).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-[#B0B3B8]">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    <style jsx>{`
        .cmd-back-btn {
          background: none;
          border: 1px solid #444;
          border-radius: 10px;
          padding: 8px 14px;
          color: #ccc;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
        }
        .cmd-back-btn:hover {
          border-color: #666;
          color: #fff;
        }
      `}</style>
    </>
    </CommanderLayout>
  );
}
