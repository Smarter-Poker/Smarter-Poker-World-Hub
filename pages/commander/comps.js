/**
 * Comp System — Enhanced
 * /commander/comps
 * 
 * Two pillars:
 * 1. Auto Rake-Back — comps earned per hour of play (configured in Settings)
 * 2. Manual Comp Issuance — categorized comps, PIN-gated, fully documented
 * 
 * All comp issuance requires staff PIN verification. No exceptions.
 * 
 * Tabs: Dashboard | Issue Comp | Comp Log | Rates
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  Gift, DollarSign, Users, Clock, Search, TrendingUp,
  Plus, Loader2, RefreshCw, Check, Star, Shield, X,
  UtensilsCrossed, Ticket, Coins, Timer, CreditCard,
  ShoppingBag, FileText, Award, ChevronDown, Filter, BarChart3
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync, broadcastChange } from '../../src/lib/commander/useCommanderSync';

// ─── Comp Categories ─────────────────────────────────────────
const COMP_CATEGORIES = [
  { key: 'free_time', label: 'Free Time', icon: Timer, color: '#3B82F6', desc: 'Comp Table Time' },
  { key: 'free_membership', label: 'Free Membership', icon: CreditCard, color: '#8B5CF6', desc: 'Comp Membership Period' },
  { key: 'free_chips', label: 'Free Chips', icon: Coins, color: '#F59E0B', desc: 'Bonus Chips' },
  { key: 'free_food', label: 'Food & Beverage', icon: UtensilsCrossed, color: '#EF4444', desc: 'Meals, Drinks, Snacks' },
  { key: 'cash_bonus', label: 'Cash Bonus', icon: DollarSign, color: '#31A24C', desc: 'Straight Cash Comp' },
  { key: 'tournament_entry', label: 'Tournament Entry', icon: Ticket, color: '#EC4899', desc: 'Free Tournament Seat' },
  { key: 'merchandise', label: 'Merchandise', icon: ShoppingBag, color: '#06B6D4', desc: 'Club Store Items' },
  { key: 'other', label: 'Other', icon: FileText, color: '#6B7280', desc: 'Custom Comp' },
];

const QUICK_AMOUNTS = [5, 10, 15, 20, 25, 50, 75, 100];
const MEMBERSHIP_DURATIONS = [
  { key: '1', label: '1 Day', days: 1 },
  { key: '7', label: '1 Week', days: 7 },
  { key: '30', label: '1 Month', days: 30 },
  { key: '90', label: '3 Months', days: 90 },
  { key: '180', label: '6 Months', days: 180 },
  { key: '365', label: '1 Year', days: 365 },
];

export default function CompSystem() {
  const router = useRouter();
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);

  // ─── Dashboard state ───
  const [stats, setStats] = useState({ today: 0, week: 0, allTime: 0, count: 0 });
  const [topEarners, setTopEarners] = useState([]);

  // ─── Issue Comp state ───
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [compAmount, setCompAmount] = useState('');
  const [compNotes, setCompNotes] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [awarded, setAwarded] = useState(false);
  const [awardError, setAwardError] = useState('');
  const [lastAwardData, setLastAwardData] = useState(null);
  const searchTimeoutRef = useRef(null);

  // ─── PIN auth state ───
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // ─── Comp Log state ───
  const [compLog, setCompLog] = useState([]);
  const [logFilter, setLogFilter] = useState('all');

  // ─── Settings state ───
  const [autoCompRate, setAutoCompRate] = useState(1);

  // ─── Auth helpers ───
  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;
  const getVenueId = () => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  };
  const getStaffSession = () => typeof window !== 'undefined' ? localStorage.getItem('commander_staff') : null;
  const getHeaders = () => {
    const token = getToken();
    const staffSession = getStaffSession();
    const headers = { Authorization: `Bearer ${token}` };
    if (staffSession) headers['x-staff-session'] = staffSession;
    return headers;
  };

  // ─── Load settings (auto comp rate) ───
  useEffect(() => {
    const staffSession = getStaffSession();
    if (!staffSession) return;
    fetch('/api/commander/settings', { headers: { 'x-staff-session': staffSession } })
      .then(r => r.json())
      .then(data => {
        if (data?.data?.auto_comp_rate !== undefined) {
          setAutoCompRate(data.data.auto_comp_rate);
        }
      })
      .catch(() => { });
  }, []);

  // ─── Fetch tab data ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const venueId = getVenueId();
      const headers = getHeaders();

      if (tab === 'dashboard') {
        const [membersRes, logRes] = await Promise.all([
          fetch(`/api/commander/members?venue_id=${venueId}&has_comps=true&limit=100`, { headers }),
          fetch(`/api/commander/comps/balances?venue_id=${venueId}&history=true`, { headers })
        ]);
        const membersJson = await membersRes.json();
        const logJson = await logRes.json();

        const members = membersJson.data?.members || membersJson.data || [];
        const withComps = members
          .filter(m => (m.comp_balance || 0) > 0)
          .sort((a, b) => (b.comp_balance || 0) - (a.comp_balance || 0))
          .slice(0, 5);
        setTopEarners(withComps);

        const txns = logJson.data?.transactions || [];
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);

        let today = 0, week = 0, allTime = 0, count = txns.length;
        txns.forEach(t => {
          const amt = Math.abs(t.amount || 0);
          allTime += amt;
          const d = new Date(t.created_at);
          if (d >= todayStart) today += amt;
          if (d >= weekStart) week += amt;
        });
        setStats({ today, week, allTime, count });

      } else if (tab === 'log') {
        const res = await fetch(`/api/commander/comps/balances?venue_id=${venueId}&history=true`, { headers });
        const json = await res.json();
        setCompLog(json.data?.transactions || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useCommanderSync(getVenueId(), fetchData, { entities: ['members'] });

  // ─── Member search ───
  const searchMembers = async (query) => {
    const q = query !== undefined ? query : searchQuery;
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const venueId = getVenueId();
      const headers = {};
      const staffSession = getStaffSession();
      if (staffSession) headers['x-staff-session'] = staffSession;
      const res = await fetch(`/api/commander/members/search?q=${encodeURIComponent(q)}&limit=10${venueId ? `&venue_id=${venueId}` : ''}`, { headers });
      const json = await res.json();
      if (json.success) setSearchResults(json.data || []);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  // Auto-search with debounce as user types
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); return; }
    searchTimeoutRef.current = setTimeout(() => { searchMembers(searchQuery); }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  // ─── Step 1: Click Issue Comp → show PIN modal ───
  const requestComp = () => {
    if (!selectedMember || !compAmount || !selectedCategory) return;
    setPinCode('');
    setPinError('');
    setShowPinModal(true);
  };

  // ─── Step 2: Verify PIN → award comp ───
  const verifyPinAndAward = async () => {
    if (!pinCode || pinCode.length !== 4) {
      setPinError('Enter your 4-digit staff PIN');
      return;
    }
    setVerifying(true);
    setPinError('');
    try {
      const venueId = getVenueId();
      const pinRes = await fetch('/api/commander/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, pin_code: pinCode })
      });
      const pinData = await pinRes.json();

      // Check both HTTP status and the 'valid' field from the API
      if (!pinRes.ok || !pinData.success || !pinData.data?.valid) {
        setPinError(pinData.error?.message || 'Invalid PIN — Please Try Again');
        setVerifying(false);
        return;
      }

      const authorizer = pinData.data?.staff;
      const authorizerName = authorizer?.display_name || 'Staff';
      setShowPinModal(false);
      setAwarding(true);
      setAwardError('');
      const token = getToken();
      const staffSession = getStaffSession();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      if (staffSession) headers['x-staff-session'] = staffSession;

      const catLabel = COMP_CATEGORIES.find(c => c.key === selectedCategory)?.label || selectedCategory;
      const isMembership = selectedCategory === 'free_membership';
      const durationLabel = isMembership
        ? (MEMBERSHIP_DURATIONS.find(d => d.key === compAmount)?.label || `${compAmount} Days`)
        : null;

      const body = {
        member_id: selectedMember.id,
        amount: isMembership ? 0 : parseFloat(compAmount),
        reason: isMembership
          ? `Free Membership — ${durationLabel}${compNotes ? ' — ' + compNotes : ''}`
          : `${catLabel}${compNotes ? ' — ' + compNotes : ''}`,
        type: 'award',
        comp_category: selectedCategory,
        notes: compNotes || '',
        authorized_by: authorizerName,
        authorized_pin: true,
      };
      if (isMembership) {
        body.membership_days = parseInt(compAmount);
      }

      const res = await fetch('/api/commander/comps/balances', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.success) {
        broadcastChange('members');
        const receiptData = {
          memberName: `${selectedMember.first_name} ${selectedMember.last_name}`,
          amount: isMembership ? 0 : parseFloat(compAmount),
          category: catLabel,
          durationLabel: durationLabel,
          isMembership: isMembership,
          notes: compNotes,
          authorizedBy: authorizerName,
          newBalance: json.data?.new_balance,
          newExpires: json.data?.membership_expires,
          timestamp: new Date().toLocaleString()
        };
        setLastAwardData(receiptData);
        setAwarded(true);

        // Auto-print receipt
        printCompReceipt(receiptData);

        setTimeout(() => {
          setAwarded(false);
          setSelectedMember(null);
          setSelectedCategory(null);
          setCompAmount('');
          setCompNotes('');
          setSearchQuery('');
          setSearchResults([]);
          setLastAwardData(null);
        }, 4000);
      } else {
        setAwardError(json.error || 'Failed To Issue Comp — Please Try Again');
      }
    } catch (err) {
      console.error(err);
      setAwardError('Network Error — Please Try Again');
    }
    finally { setAwarding(false); setVerifying(false); }
  };

  // ─── Auto-print receipt on comp completion ───
  const printCompReceipt = (data) => {
    try {
      const receiptWindow = window.open('', '_blank', 'width=400,height=600');
      if (!receiptWindow) return; // popup blocked
      receiptWindow.document.write(`
        <html>
        <head><title>Comp Receipt</title>
        <style>
          body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 20px 0; color: #000; }
          .center { text-align: center; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .bold { font-weight: bold; }
          .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
          h2 { margin: 0 0 4px; font-size: 16px; }
          .amount { font-size: 28px; font-weight: bold; text-align: center; margin: 12px 0; }
          .footer { font-size: 10px; text-align: center; margin-top: 16px; color: #666; }
          .stamp { border: 2px solid #000; padding: 4px 12px; display: inline-block; font-weight: bold; font-size: 11px; margin-top: 8px; letter-spacing: 1px; }
        </style>
        </head>
        <body>
          <div class="center">
            <h2>COMP RECEIPT</h2>
            <p style="font-size:11px;margin:0;">Club Commander</p>
          </div>
          <div class="divider"></div>
          <div class="row"><span>Date:</span><span>${data.timestamp}</span></div>
          <div class="row"><span>Member:</span><span class="bold">${data.memberName}</span></div>
          <div class="row"><span>Category:</span><span>${data.category}</span></div>
          ${data.notes ? `<div class="row"><span>Notes:</span><span>${data.notes}</span></div>` : ''}
          <div class="divider"></div>
          <div class="amount">$${data.amount.toFixed(2)}</div>
          <div class="divider"></div>
          <div class="row"><span>New Balance:</span><span class="bold">$${(data.newBalance || 0).toFixed(2)}</span></div>
          <div class="row"><span>Authorized By:</span><span>${data.authorizedBy}</span></div>
          <div class="center" style="margin-top:12px;">
            <span class="stamp">STAFF PIN VERIFIED</span>
          </div>
          <div class="footer">
            <p>This comp has been logged and documented.</p>
            <p>Thank you for playing!</p>
          </div>
        </body>
        </html>
      `);
      receiptWindow.document.close();
      setTimeout(() => { receiptWindow.print(); }, 300);
    } catch (e) { console.warn('Receipt print failed:', e); }
  };

  const resetIssueFlow = () => {
    setSelectedMember(null);
    setSelectedCategory(null);
    setCompAmount('');
    setCompNotes('');
    setSearchQuery('');
    setSearchResults([]);
    setAwarded(false);
    setAwardError('');
  };

  const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'issue', label: 'Issue Comp', icon: Gift },
    { key: 'log', label: 'Comp Log', icon: FileText },
    { key: 'rates', label: 'Rates', icon: TrendingUp },
  ];

  const filteredLog = logFilter === 'all'
    ? compLog
    : compLog.filter(t => (t.comp_category || 'cash_bonus') === logFilter);

  return (
    <CommanderLayout title="Comp System" backHref="/commander/dashboard?card=displays">
      <>
        <SEOHead
          title="Commander — Comps & Rewards"
          description="Club Commander Poker Room Management Tool."
          noindex={true}
        />
        <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

          {/* ═══ PIN Authorization Modal ═══ */}
          {showPinModal && (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
              <div className="bg-[#242526] rounded-2xl w-full max-w-sm border border-[#3A3B3C] shadow-2xl">
                <div className="p-5 text-center border-b border-[#3A3B3C]">
                  <div className="w-14 h-14 rounded-full bg-[#F59E0B]/10 flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-7 h-7 text-[#F59E0B]" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Staff PIN Required</h3>
                  <p className="text-sm text-[#B0B3B8] mt-1">
                    Authorize <span className="text-[#31A24C] font-bold">${compAmount}</span>{' '}
                    <span className="text-white font-medium">
                      {COMP_CATEGORIES.find(c => c.key === selectedCategory)?.label}
                    </span>{' '}
                    to <span className="text-white font-medium">{selectedMember?.first_name} {selectedMember?.last_name}</span>
                  </p>
                </div>
                <div className="p-5 space-y-4">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinCode}
                    onChange={e => { setPinCode(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                    onKeyDown={e => e.key === 'Enter' && verifyPinAndAward()}
                    placeholder="Enter 4-Digit PIN"
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
                    <button onClick={verifyPinAndAward} disabled={verifying || pinCode.length !== 4}
                      className="flex-1 py-3 rounded-xl bg-[#31A24C] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 active:bg-[#28883F]">
                      {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                      {verifying ? 'Verifying...' : 'Authorize'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Header ═══ */}
          <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-white">Comp System</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#31A24C]/20 text-[#31A24C] font-medium">
                ${autoCompRate}/hr rake-back
              </span>
            </div>
            <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>

          {/* ═══ Tabs ═══ */}
          <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-3 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'text-[#1877F2] border-[#1877F2]' : 'text-[#B0B3B8] border-transparent'
                  }`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          <div className="p-4 max-w-lg mx-auto">

            {/* ═══════════ DASHBOARD TAB ═══════════ */}
            {tab === 'dashboard' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Today" value={`$${stats.today.toFixed(2)}`} icon={Clock} color="#1877F2" />
                  <StatCard label="This Week" value={`$${stats.week.toFixed(2)}`} icon={TrendingUp} color="#31A24C" />
                  <StatCard label="All Time" value={`$${stats.allTime.toFixed(2)}`} icon={Award} color="#F59E0B" />
                  <StatCard label="Total Comps" value={stats.count} icon={Gift} color="#8B5CF6" />
                </div>

                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-[#31A24C]/10 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-[#31A24C]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Auto Rake-Back Rate</p>
                      <p className="text-xs text-[#B0B3B8]">Players Earn Comps Per Hour Of Play</p>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-[#31A24C] text-center py-2">
                    ${autoCompRate.toFixed(2)}<span className="text-base text-[#B0B3B8] font-normal">/hour</span>
                  </div>
                  <p className="text-xs text-[#6A6B6D] text-center">Configured In Settings</p>
                </div>

                <div>
                  <p className="text-xs text-[#B0B3B8] uppercase tracking-wider mb-2">Top Comp Balances</p>
                  {loading ? (
                    <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-[#1877F2] animate-spin" /></div>
                  ) : topEarners.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[#B0B3B8]">No comp balances yet</p>
                  ) : (
                    <div className="space-y-1">
                      {topEarners.map((m, i) => (
                        <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                          <span className="text-xs text-[#6A6B6D] w-5 font-bold">#{i + 1}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-white">{m.first_name} {m.last_name}</p>
                          </div>
                          <span className="text-base font-bold text-[#31A24C]">${(m.comp_balance || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════ ISSUE COMP TAB ═══════════ */}
            {tab === 'issue' && (
              <div className="space-y-4">
                {/* Error Banner */}
                {awardError && (
                  <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-3 flex items-center gap-2">
                    <X className="w-5 h-5 text-[#EF4444] shrink-0" />
                    <p className="text-sm text-[#EF4444] flex-1">{awardError}</p>
                    <button onClick={() => setAwardError('')} className="text-[#EF4444] text-xs underline">Dismiss</button>
                  </div>
                )}

                {awarded ? (
                  <div className="py-12 text-center">
                    <div className="w-20 h-20 rounded-full bg-[#31A24C]/20 flex items-center justify-center mx-auto mb-4">
                      <Check className="w-10 h-10 text-[#31A24C]" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Comp Issued</h2>
                    <p className="text-[#B0B3B8] mt-2">
                      ${compAmount} {COMP_CATEGORIES.find(c => c.key === selectedCategory)?.label} To {selectedMember?.first_name} {selectedMember?.last_name}
                    </p>
                    <p className="text-xs text-[#31A24C] mt-1">PIN Verified And Documented</p>
                    {lastAwardData && (
                      <p className="text-xs text-[#B0B3B8] mt-1">Authorized By: {lastAwardData.authorizedBy}</p>
                    )}
                    {lastAwardData && (
                      <button onClick={() => printCompReceipt(lastAwardData)}
                        className="mt-4 px-6 py-2 rounded-xl bg-[#3A3B3C] text-white text-sm font-medium active:bg-[#4A4B4C]">
                        Print Receipt Again
                      </button>
                    )}
                  </div>

                ) : !selectedMember ? (
                  <>
                    <p className="text-xs text-[#B0B3B8] uppercase tracking-wider">Step 1: Select Member</p>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B3B8]" />
                        <input type="text" value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search By Name Or Phone..."
                          autoFocus
                          className="w-full pl-10 pr-4 py-3 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-[#E4E6EB] placeholder-[#6A6B6D] focus:outline-none focus:border-[#1877F2]" />
                        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1877F2] animate-spin" />}
                      </div>
                    </div>

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
                            <span className="text-sm font-bold text-[#31A24C]">${(m.comp_balance || 0).toFixed(2)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>

                ) : (
                  <>
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
                      <button onClick={resetIssueFlow}
                        className="text-xs text-[#B0B3B8] px-2 py-1 rounded-lg active:bg-[#3A3B3C]">Change</button>
                    </div>

                    {!selectedCategory ? (
                      <>
                        <p className="text-xs text-[#B0B3B8] uppercase tracking-wider">Step 2: Comp Type</p>
                        <div className="grid grid-cols-2 gap-2">
                          {COMP_CATEGORIES.map(cat => {
                            const Icon = cat.icon;
                            return (
                              <button key={cat.key} onClick={() => setSelectedCategory(cat.key)}
                                className="p-4 bg-[#242526] border border-[#3A3B3C] rounded-xl text-left flex flex-col gap-2 active:border-[#1877F2] hover:border-[#4A4B4C] transition-colors">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.color + '20' }}>
                                  <Icon className="w-5 h-5" style={{ color: cat.color }} />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{cat.label}</p>
                                  <p className="text-[10px] text-[#6A6B6D]">{cat.desc}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-[#B0B3B8] uppercase tracking-wider">
                            {selectedCategory === 'free_membership' ? 'Step 3: Duration' : 'Step 3: Amount'}
                          </p>
                          <button onClick={() => { setSelectedCategory(null); setCompAmount(''); }}
                            className="ml-auto text-xs px-2 py-1 rounded-lg flex items-center gap-1 active:bg-[#3A3B3C]"
                            style={{ color: COMP_CATEGORIES.find(c => c.key === selectedCategory)?.color }}>
                            {(() => { const Cat = COMP_CATEGORIES.find(c => c.key === selectedCategory); const Icon = Cat?.icon; return Icon ? <Icon className="w-3 h-3" /> : null; })()}
                            {COMP_CATEGORIES.find(c => c.key === selectedCategory)?.label}
                            <X className="w-3 h-3 ml-1 text-[#6A6B6D]" />
                          </button>
                        </div>

                        {selectedCategory === 'free_membership' ? (
                          /* ── Membership Duration Picker ── */
                          <div className="grid grid-cols-3 gap-2">
                            {MEMBERSHIP_DURATIONS.map(dur => (
                              <button key={dur.key}
                                onClick={() => setCompAmount(dur.key)}
                                className={`py-3 rounded-xl text-sm font-semibold ${compAmount === dur.key ? 'bg-[#8B5CF6] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB]'}`}>
                                {dur.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          /* ── Dollar Amount Picker ── */
                          <>
                            <div className="grid grid-cols-4 gap-2">
                              {QUICK_AMOUNTS.map(amt => (
                                <button key={amt}
                                  onClick={() => setCompAmount(String(amt))}
                                  className={`py-2.5 rounded-xl text-sm font-semibold ${compAmount === String(amt) ? 'bg-[#31A24C] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB]'
                                    }`}>${amt}</button>
                              ))}
                            </div>
                            <input type="number" value={compAmount}
                              onChange={e => setCompAmount(e.target.value)}
                              placeholder="Custom Amount"
                              className="w-full px-4 py-3 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-[#E4E6EB] placeholder-[#6A6B6D] focus:outline-none focus:border-[#1877F2] text-center text-lg" />
                          </>
                        )}

                        <div>
                          <p className="text-xs text-[#B0B3B8] mb-1">Notes (optional)</p>
                          <input type="text" value={compNotes}
                            onChange={e => setCompNotes(e.target.value)}
                            placeholder="E.g., Birthday Bonus, 2 Hours Free Table Time..."
                            className="w-full px-4 py-2.5 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-[#E4E6EB] placeholder-[#6A6B6D] text-sm focus:outline-none focus:border-[#1877F2]" />
                        </div>

                        <button onClick={requestComp} disabled={awarding || !compAmount || (selectedCategory !== 'free_membership' && parseFloat(compAmount) <= 0)}
                          className="w-full py-4 rounded-xl bg-[#31A24C] text-white text-lg font-semibold flex items-center justify-center gap-2 active:bg-[#28883F] disabled:opacity-50">
                          {awarding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                          {selectedCategory === 'free_membership'
                            ? `Issue ${MEMBERSHIP_DURATIONS.find(d => d.key === compAmount)?.label || 'Membership'} — Requires PIN`
                            : `Issue $${compAmount || '0'} — Requires PIN`}
                        </button>
                        <p className="text-[10px] text-[#6A6B6D] text-center">
                          All Comps Require Staff PIN Verification And Are Fully Documented
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ═══════════ COMP LOG TAB ═══════════ */}
            {tab === 'log' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <button onClick={() => setLogFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${logFilter === 'all' ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                    All
                  </button>
                  {COMP_CATEGORIES.map(cat => (
                    <button key={cat.key} onClick={() => setLogFilter(cat.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1 ${logFilter === cat.key ? 'text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}
                      style={logFilter === cat.key ? { backgroundColor: cat.color } : {}}>
                      {cat.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-[#6A6B6D]">{filteredLog.length} comp transaction{filteredLog.length !== 1 ? 's' : ''}</p>

                {loading ? (
                  <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" /></div>
                ) : filteredLog.length === 0 ? (
                  <p className="py-10 text-center text-[#B0B3B8]">No Comp Transactions Yet</p>
                ) : (
                  <div className="space-y-1">
                    {filteredLog.slice(0, 50).map((t, i) => {
                      const cat = COMP_CATEGORIES.find(c => c.key === (t.comp_category || 'cash_bonus')) || COMP_CATEGORIES[4];
                      const CatIcon = cat.icon;
                      return (
                        <div key={t.id || i} className="flex items-center gap-3 px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: cat.color + '20' }}>
                            <CatIcon className="w-4 h-4" style={{ color: cat.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{t.member_name || 'Member'}</p>
                            <p className="text-[10px] text-[#6A6B6D] truncate">
                              {t.reason || cat.label}
                              {t.authorized_pin && <span className="text-[#31A24C] ml-1">[PIN]</span>}
                            </p>
                            {t.authorized_by && (
                              <p className="text-[10px] text-[#4A4B4C]">By: {t.authorized_by}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-bold ${(t.amount || 0) > 0 ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>
                              {(t.amount || 0) > 0 ? '+' : ''}${Math.abs(t.amount || 0).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-[#6A6B6D]">
                              {t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══════════ RATES TAB ═══════════ */}
            {tab === 'rates' && (
              <div className="space-y-4">
                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[#31A24C]/10 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-[#31A24C]" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-white">Auto Rake-Back</p>
                      <p className="text-xs text-[#B0B3B8]">Comps Earned Automatically Per Hour Of Play</p>
                    </div>
                  </div>
                  <div className="text-4xl font-bold text-[#31A24C] text-center py-3">
                    ${autoCompRate.toFixed(2)}<span className="text-lg text-[#B0B3B8] font-normal">/hour</span>
                  </div>
                  <p className="text-xs text-[#6A6B6D] text-center mb-3">Applied To All Seated Players. Configure In Settings.</p>
                  <button onClick={() => router.push('/commander/settings')}
                    className="w-full py-2.5 rounded-xl bg-[#3A3B3C] text-white text-sm font-medium active:bg-[#4A4B4C]">
                    Edit Rate In Settings
                  </button>
                </div>

                <div>
                  <p className="text-xs text-[#B0B3B8] uppercase tracking-wider mb-2">Rate Per Game Type</p>
                  <div className="space-y-2">
                    {[
                      { game: '$1/$2 NLH', rate: autoCompRate },
                      { game: '$2/$5 NLH', rate: autoCompRate * 1.5 },
                      { game: '$5/$10 NLH', rate: autoCompRate * 2.5 },
                      { game: '$1/$2 PLO', rate: autoCompRate * 1.2 },
                      { game: '$2/$5 PLO', rate: autoCompRate * 2.0 },
                    ].map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                        <p className="text-sm font-medium text-white">{r.game}</p>
                        <span className="text-base font-bold text-[#1877F2]">${r.rate.toFixed(2)}/hr</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-[#B0B3B8] uppercase tracking-wider mb-2">Manual Comp Categories</p>
                  <div className="space-y-1">
                    {COMP_CATEGORIES.map(cat => {
                      const Icon = cat.icon;
                      return (
                        <div key={cat.key} className="flex items-center gap-3 px-4 py-2.5 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.color + '20' }}>
                            <Icon className="w-4 h-4" style={{ color: cat.color }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-white">{cat.label}</p>
                            <p className="text-[10px] text-[#6A6B6D]">{cat.desc}</p>
                          </div>
                          <Shield className="w-3 h-3 text-[#F59E0B]" />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[#6A6B6D] text-center mt-2 flex items-center justify-center gap-1">
                    <Shield className="w-3 h-3 text-[#F59E0B]" /> All Manual Comps Require Staff PIN Verification
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
        <style jsx>{``}</style>
      </>
    </CommanderLayout>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs text-[#B0B3B8]">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
