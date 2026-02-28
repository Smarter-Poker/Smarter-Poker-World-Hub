/**
 * Cashier — Texas Club Style
 * /commander/cashier
 * Simple operations with inline action modals:
 * 1. Scan Player Card (QR code)
 * 2. Add Time (adds minutes directly to player's time balance)
 * 3. Update Membership (changes tier + expiry on player)
 * 4. Tournament Registration (backup for long cage lines)
 * 5. Cash Game Buy-In Receipt
 * Collapsible transaction log at bottom
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  QrCode, Clock, CreditCard, Loader2, Search,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Receipt, Lock, Delete, DollarSign, Banknote, Users, Trophy
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const QUICK_AMOUNTS = [50, 100, 200, 300, 500, 1000];
// Fallback time options — overridden by owner settings from Time Billing page
const DEFAULT_TIME_OPTIONS = [
  { label: '1 Hour', minutes: 60 },
  { label: '2 Hours', minutes: 120 },
  { label: '3 Hours', minutes: 180 },
  { label: '4 Hours', minutes: 240 },
  { label: '5 Hr Pack', minutes: 300 },
  { label: '20 Hr Pack', minutes: 1200 },
];
// Fallback tiers — overridden by owner settings from membership-plans
const DEFAULT_MEMBERSHIP_TIERS = [
  { tier: 'daily', label: 'Daily', color: '#22D3EE', duration: 1 },
  { tier: 'weekly', label: 'Weekly', color: '#31A24C', duration: 7 },
  { tier: 'monthly', label: 'Monthly', color: '#F59E0B', duration: 30 },
  { tier: 'yearly', label: 'Yearly', color: '#8B5CF6', duration: 365 },
];

export default function Cashier() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState(null);
  const [message, setMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Scanner
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Scanned player
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Player Search
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Modals
  const [showBuyIn, setShowBuyIn] = useState(false);
  const [showAddTime, setShowAddTime] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [showPlayerHistory, setShowPlayerHistory] = useState(false);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);

  // Buy-In form
  const [buyInAmount, setBuyInAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');

  // Add Time form
  const [selectedTime, setSelectedTime] = useState(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [timePayMethod, setTimePayMethod] = useState('cash');
  const [recentTimeTransactions, setRecentTimeTransactions] = useState([]);

  // Membership form
  const [selectedTier, setSelectedTier] = useState(null);
  const [memberPayMethod, setMemberPayMethod] = useState('cash');
  const [recentMemberTransactions, setRecentMemberTransactions] = useState([]);

  // Dynamic pricing from Time Billing settings
  const [timeBillingRate, setTimeBillingRate] = useState(0); // $/hour
  const [bulkTimePackages, setBulkTimePackages] = useState([]); // [{name, hours, price}]
  const [membershipPlans, setMembershipPlans] = useState([]); // from membership-plans API

  // PIN verification
  const [pinStep, setPinStep] = useState(false);
  const [pinDigits, setPinDigits] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [verifiedStaff, setVerifiedStaff] = useState(null);
  const [pinCacheExpiry, setPinCacheExpiry] = useState(0);
  const [pendingAction, setPendingAction] = useState(null); // 'buyin' | 'addtime' | 'membership'

  const isPinCached = () => verifiedStaff && Date.now() < pinCacheExpiry;
  const lockPin = () => { setVerifiedStaff(null); setPinCacheExpiry(0); };

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      if (s.venue_id) setVenueId(s.venue_id);
    } catch { }
  }, []);

  const getToken = () => localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const token = getToken();
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };

      const today = new Date().toISOString().split('T')[0];
      const txRes = await fetch(`/api/commander/cashier?venue_id=${venueId}&date=${today}&limit=200`, { headers });
      const txJson = await txRes.json();
      setTransactions(txJson.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch owner-configured pricing from Time Billing settings + membership plans
  useEffect(() => {
    if (!venueId) return;
    const loadPricing = async () => {
      try {
        const token = getToken();
        const staffSession = localStorage.getItem('commander_staff') || '';
        const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };

        // Time billing settings
        const settingsRes = await fetch('/api/commander/settings', { headers });
        const settingsJson = await settingsRes.json();
        if (settingsJson.success && settingsJson.data) {
          setTimeBillingRate(settingsJson.data.time_billing_rate || 0);
          setBulkTimePackages(settingsJson.data.bulk_time_packages || []);
        }

        // Membership plans
        const plansRes = await fetch(`/api/commander/membership-plans?venue_id=${venueId}`, { headers });
        const plansJson = await plansRes.json();
        if (plansJson.success && plansJson.data?.plans) {
          setMembershipPlans(plansJson.data.plans.filter(p => p.is_active !== false));
        }
      } catch (err) { console.error('Pricing load error:', err); }
    };
    loadPricing();
  }, [venueId]);

  // Build dynamic time options from owner settings
  const TIME_OPTIONS = (() => {
    const hourlyOpt = timeBillingRate > 0
      ? [{ label: '1 Hour', minutes: 60, price: Math.round(timeBillingRate) }]
      : [];
    if (bulkTimePackages.length > 0) {
      const pkgOpts = bulkTimePackages.map(pkg => ({
        label: pkg.name || `${pkg.hours} Hr Pack`,
        minutes: (pkg.hours || 0) * 60,
        price: pkg.price || 0,
      }));
      return [...hourlyOpt, ...pkgOpts];
    }
    return hourlyOpt.length > 0
      ? [...hourlyOpt, ...DEFAULT_TIME_OPTIONS.slice(1).map(opt => ({
        ...opt, price: Math.round(timeBillingRate * (opt.minutes / 60)),
      }))]
      : DEFAULT_TIME_OPTIONS.map(opt => ({ ...opt, price: 0 }));
  })();

  // Build dynamic membership tiers from owner settings
  const MEMBERSHIP_TIERS = membershipPlans.length > 0
    ? membershipPlans.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(plan => {
      const priceField = plan.tier === 'daily' ? 'price_daily' : plan.tier === 'weekly' ? 'price_weekly' : plan.tier === 'monthly' ? 'price_monthly' : 'price_yearly';
      const durationMap = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };
      return {
        tier: plan.tier,
        label: plan.name || plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1),
        color: plan.color || '#1877F2',
        duration: durationMap[plan.tier] || 30,
        price: plan[priceField] || 0,
        planId: plan.id,
      };
    })
    : DEFAULT_MEMBERSHIP_TIERS.map(t => ({ ...t, price: 0 }));

  // QR Scanner
  const startScan = async () => {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const scanLoop = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              handleScanResult(barcodes[0].rawValue);
              return;
            }
          } catch { }
          if (streamRef.current) requestAnimationFrame(scanLoop);
        };
        setTimeout(scanLoop, 500);
      }
    } catch (err) {
      console.error('Camera Error:', err);
      setMessage({ type: 'error', text: 'Camera Access Denied Or Unavailable' });
      setScanning(false);
    }
  };

  const stopScan = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const handleScanResult = async (qrData) => {
    stopScan();
    try {
      const token = getToken();
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };
      const res = await fetch(`/api/commander/members?search=${encodeURIComponent(qrData)}&venue_id=${venueId}`, { headers });
      const json = await res.json();
      const members = json.data?.members || json.data || [];
      if (json.success && members.length > 0) {
        const member = members[0];
        selectMember(member);
      } else {
        setMessage({ type: 'error', text: 'Player Not Found — Try Manual Search' });
        setShowPlayerSearch(true);
      }
    } catch {
      setMessage({ type: 'error', text: 'Error Looking Up Player' });
    }
  };

  // Select a member from search results or scan
  const selectMember = (member) => {
    const name = member.name || `${member.first_name || ''} ${member.last_name || ''}`.trim();
    setMessage({ type: 'success', text: `Found: ${name}` });
    playSuccessSound();
    setSelectedPlayer({
      id: member.id,
      player_name: name,
      user_id: member.user_id || member.id,
      membership_tier: member.membership_tier,
      membership_status: member.membership_status,
      membership_expires: member.membership_expires,
      time_balance_minutes: member.time_balance_minutes || 0,
      member_number: member.member_number,
      phone: member.phone,
    });
    setShowPlayerSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Manual player search
  const searchPlayers = async (query) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query || query.length < 2) { setSearchResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const token = getToken();
        const staffSession = localStorage.getItem('commander_staff') || '';
        const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };
        const res = await fetch(`/api/commander/members/search?q=${encodeURIComponent(query)}&venue_id=${venueId}&limit=8`, { headers });
        const json = await res.json();
        setSearchResults(json.data || []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  };

  // === PIN Logic ===
  const requestPinFor = (action) => {
    if (isPinCached()) {
      executeAction(action, verifiedStaff);
      return;
    }
    setPendingAction(action);
    setPinDigits('');
    setPinError('');
    setPinStep(true);
  };

  const handlePinDigit = (d) => {
    const next = pinDigits + d;
    setPinDigits(next);
    setPinError('');
    if (next.length === 4) verifyPinAndExecute(next);
  };

  const verifyPinAndExecute = async (digits) => {
    setPinVerifying(true);
    setPinError('');
    try {
      const pinRes = await fetch('/api/commander/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, pin_code: digits })
      });
      const pinJson = await pinRes.json();
      if (!pinJson.success || !pinJson.data?.valid) {
        setPinError(pinJson.error?.message || 'Invalid PIN');
        setPinDigits('');
        setPinVerifying(false);
        return;
      }
      const staff = pinJson.data.staff;
      setVerifiedStaff(staff);
      setPinCacheExpiry(Date.now() + 5 * 60 * 1000);
      setPinStep(false);
      await executeAction(pendingAction, staff);
      setPendingAction(null);
    } catch {
      setPinError('Network Error');
      setPinDigits('');
    }
    setPinVerifying(false);
  };

  // === Execute Actions ===
  const executeAction = async (action, staff) => {
    if (action === 'buyin') await doBuyIn(staff);
    else if (action === 'addtime') await doAddTime(staff);
    else if (action === 'membership') await doUpdateMembership(staff);
    else if (action?.type === 'void') await executeVoid(action.txId, action.voidType, action.details, action.actionLabel, staff);
  };

  // Buy-In Receipt
  const doBuyIn = async (staff) => {
    if (!buyInAmount || parseFloat(buyInAmount) <= 0) {
      setMessage({ type: 'error', text: 'Enter A Valid Amount' });
      return;
    }
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch('/api/commander/cashier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': staffSession },
        body: JSON.stringify({
          venue_id: venueId,
          player_name: selectedPlayer?.player_name || 'Walk-Up',
          type: 'buy_in',
          amount: parseFloat(buyInAmount),
          payment_method: payMethod,
          pin_verified_by: staff?.id || null
        })
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `Buy-In Receipt — $${parseFloat(buyInAmount).toLocaleString()} — ${selectedPlayer?.player_name || 'Walk-Up'}` });
        setShowBuyIn(false);
        printReceipt({
          player_name: selectedPlayer?.player_name || 'Walk-Up',
          amount: parseFloat(buyInAmount),
          payment_method: payMethod,
          created_at: new Date().toISOString(),
          staff_name: staff?.display_name || 'Staff'
        });
        playSuccessSound();
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error || 'Transaction Failed' });
      }
    } catch { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); }
  };

  // Calculate time price
  const getTimePrice = () => {
    if (selectedTime) {
      const opt = TIME_OPTIONS.find(o => o.minutes === selectedTime);
      return opt?.price || 0;
    }
    if (customMinutes) return Math.ceil(parseInt(customMinutes) * (timeBillingRate / 60));
    return 0;
  };

  // Add Time to Player
  const doAddTime = async (staff) => {
    const mins = selectedTime || parseInt(customMinutes) || 0;
    if (mins <= 0) { setMessage({ type: 'error', text: 'Select A Time Amount' }); return; }
    if (!selectedPlayer?.id) { setMessage({ type: 'error', text: 'Select A Player First' }); return; }
    const price = getTimePrice();
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': staffSession };
      const newBalance = (selectedPlayer.time_balance_minutes || 0) + mins;

      // 1. Update member time balance
      const res = await fetch(`/api/commander/members/${selectedPlayer.id}`, {
        method: 'PUT', headers, body: JSON.stringify({ time_balance_minutes: newBalance })
      });
      const json = await res.json();
      if (!json.success) { setMessage({ type: 'error', text: json.error || 'Failed To Add Time' }); setActionLoading(false); return; }

      // 2. Record cash transaction
      const txRes = await fetch('/api/commander/cashier', {
        method: 'POST', headers,
        body: JSON.stringify({
          venue_id: venueId,
          player_name: selectedPlayer.player_name,
          type: 'buy_in',
          amount: price,
          payment_method: timePayMethod,
          notes: `Time Purchase: ${mins} minutes`,
          pin_verified_by: staff?.id || null
        })
      });
      const txJson = await txRes.json();

      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      const timeLabel = hours > 0 ? `${hours}h ${remainMins > 0 ? remainMins + 'm' : ''}` : `${mins}m`;
      setMessage({ type: 'success', text: `Added ${timeLabel} — $${price} — ${selectedPlayer.player_name}` });
      setSelectedPlayer(prev => ({ ...prev, time_balance_minutes: newBalance }));
      setShowAddTime(false);
      playSuccessSound();
      fetchData();

      // 3. Auto-print receipt
      printTimeReceipt({
        player_name: selectedPlayer.player_name,
        minutes: mins,
        timeLabel,
        amount: price,
        payment_method: timePayMethod,
        new_balance_minutes: newBalance,
        staff_name: staff?.display_name || 'Staff',
        transaction_id: txJson?.data?.id || null,
      });
    } catch { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); }
  };

  // Update Membership
  const doUpdateMembership = async (staff) => {
    if (!selectedTier) { setMessage({ type: 'error', text: 'Select A Membership Tier' }); return; }
    if (!selectedPlayer?.id) { setMessage({ type: 'error', text: 'Select A Player First' }); return; }
    const tierInfo = MEMBERSHIP_TIERS.find(t => t.tier === selectedTier);
    const price = tierInfo?.price || 0;
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': staffSession };
      const expires = new Date();
      expires.setDate(expires.getDate() + (tierInfo?.duration || 1));

      // 1. Update member tier
      const res = await fetch(`/api/commander/members/${selectedPlayer.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ membership_tier: selectedTier, membership_status: 'active', membership_expires: expires.toISOString() })
      });
      const json = await res.json();
      if (!json.success) { setMessage({ type: 'error', text: json.error || 'Failed To Update Membership' }); setActionLoading(false); return; }

      // 2. Record cash transaction
      const txRes = await fetch('/api/commander/cashier', {
        method: 'POST', headers,
        body: JSON.stringify({
          venue_id: venueId,
          player_name: selectedPlayer.player_name,
          type: 'buy_in',
          amount: price,
          payment_method: memberPayMethod,
          notes: `Membership: ${tierInfo?.label} (Expires ${expires.toLocaleDateString()})`,
          pin_verified_by: staff?.id || null
        })
      });
      const txJson = await txRes.json();

      setMessage({ type: 'success', text: `${tierInfo?.label} Membership — $${price} — ${selectedPlayer.player_name}` });
      setSelectedPlayer(prev => ({ ...prev, membership_tier: selectedTier, membership_status: 'active', membership_expires: expires.toISOString() }));
      setShowMembership(false);
      playSuccessSound();
      fetchData();

      // 3. Auto-print receipt
      printMembershipReceipt({
        player_name: selectedPlayer.player_name,
        tier: tierInfo?.label,
        amount: price,
        payment_method: memberPayMethod,
        expires: expires.toLocaleDateString(),
        staff_name: staff?.display_name || 'Staff',
        transaction_id: txJson?.data?.id || null,
      });
    } catch { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); }
  };

  // Void or Refund a transaction
  const voidTransaction = async (txId, type, details) => {
    const txTime = details.created_at ? new Date(details.created_at) : new Date();
    const minutesAgo = (Date.now() - txTime.getTime()) / 60000;
    const isVoid = minutesAgo <= 15;
    const actionLabel = isVoid ? 'Void' : 'Refund';

    // Require PIN for all voids/refunds
    if (!isPinCached()) {
      setPendingAction({ type: 'void', txId, voidType: type, details, actionLabel });
      setPinStep(true);
      setPinDigits('');
      setPinError('');
      return;
    }
    await executeVoid(txId, type, details, actionLabel, verifiedStaff);
  };

  const executeVoid = async (txId, type, details, actionLabel, staff) => {
    if (!confirm(`${actionLabel} this ${type} transaction for $${details.amount}?`)) return;
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': staffSession };
      // Record void/refund transaction
      await fetch('/api/commander/cashier', {
        method: 'POST', headers,
        body: JSON.stringify({
          venue_id: venueId,
          player_name: details.player_name || 'Unknown',
          type: 'cash_out',
          amount: details.amount || 0,
          payment_method: details.payment_method || 'cash',
          notes: `${actionLabel.toUpperCase()} — TX #${txId}: ${details.notes || type} [by ${staff?.display_name || 'Staff'}]`,
        })
      });

      // If time void, subtract the minutes back
      if (type === 'time' && selectedPlayer?.id && details.minutes) {
        const newBal = Math.max(0, (selectedPlayer.time_balance_minutes || 0) - details.minutes);
        await fetch(`/api/commander/members/${selectedPlayer.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ time_balance_minutes: newBal })
        });
        setSelectedPlayer(prev => ({ ...prev, time_balance_minutes: newBal }));
      }

      setMessage({ type: 'success', text: `${actionLabel} Processed — $${details.amount}` });
      playSuccessSound();
      fetchData();
    } catch { setMessage({ type: 'error', text: `${actionLabel} Failed` }); }
    finally { setActionLoading(false); }
  };

  // Confirmation sound
  const playSuccessSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch { /* audio not available */ }
  };

  // Load player transaction history
  const loadPlayerHistory = async () => {
    if (!selectedPlayer?.player_name) return;
    setPlayerHistoryLoading(true);
    setShowPlayerHistory(true);
    try {
      const token = getToken();
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };
      const res = await fetch(`/api/commander/cashier?venue_id=${venueId}&limit=100`, { headers });
      const json = await res.json();
      const allTx = json.data || [];
      const playerTx = allTx.filter(tx => tx.player_name === selectedPlayer.player_name);
      setPlayerHistory(playerTx);
    } catch { setPlayerHistory([]); }
    finally { setPlayerHistoryLoading(false); }
  };

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 5000); return () => clearTimeout(t); }
  }, [message]);

  useEffect(() => () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); }, []);

  const printReceipt = (tx) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    const html = `<!DOCTYPE html><html><head><title>Receipt</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  body { font-family: 'Courier New', monospace; margin: 0; padding: 0; }
  .receipt { width: 72mm; padding: 4mm; margin: 0 auto; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: 24px; }
  .med { font-size: 14px; }
  .sm { font-size: 11px; }
  .divider { border-top: 1px dashed #000; margin: 3mm 0; }
  .row { display: flex; justify-content: space-between; }
</style></head><body>
<div class="receipt">
  <div class="center bold med">SMARTER.POKER</div>
  <div class="center sm">Cash Game Buy-In Receipt</div>
  <div class="divider"></div>
  <div class="center bold med">BUY-IN</div>
  <div class="divider"></div>
  <div class="row sm"><span>Player:</span><span class="bold">${tx.player_name}</span></div>
  ${tx.staff_name ? `<div class="row sm"><span>Processed By:</span><span class="bold">${tx.staff_name}</span></div>` : ''}
  <div class="divider"></div>
  <div class="center bold big">$${parseFloat(tx.amount).toLocaleString()}</div>
  <div class="center sm">${(tx.payment_method || 'Cash').toUpperCase()}</div>
  <div class="divider"></div>
  <div class="sm center" style="opacity:0.6">${new Date(tx.created_at || Date.now()).toLocaleString()}</div>
  <div class="sm center" style="opacity:0.4;margin-top:1mm">Smarter.Poker</div>
</div></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  // Print Time Purchase Receipt
  const printTimeReceipt = (tx) => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    const balH = Math.floor((tx.new_balance_minutes || 0) / 60);
    const balM = (tx.new_balance_minutes || 0) % 60;
    w.document.write(`<!DOCTYPE html><html><head><title>Time Receipt</title>
<style>@page{margin:0;size:80mm auto}body{font-family:'Courier New',monospace;margin:0;padding:0}.r{width:72mm;padding:4mm;margin:0 auto}.c{text-align:center}.b{font-weight:bold}.big{font-size:24px}.med{font-size:14px}.sm{font-size:11px}.d{border-top:1px dashed #000;margin:3mm 0}.row{display:flex;justify-content:space-between}</style></head><body>
<div class="r">
  <div class="c b med">SMARTER.POKER</div>
  <div class="c sm">Time Purchase Receipt</div>
  <div class="d"></div>
  <div class="c b med">TIME ADDED</div>
  <div class="d"></div>
  <div class="row sm"><span>Player:</span><span class="b">${tx.player_name}</span></div>
  <div class="row sm"><span>Time Added:</span><span class="b">${tx.timeLabel}</span></div>
  <div class="row sm"><span>New Balance:</span><span class="b">${balH}h ${balM}m</span></div>
  ${tx.staff_name ? `<div class="row sm"><span>Processed By:</span><span class="b">${tx.staff_name}</span></div>` : ''}
  <div class="d"></div>
  <div class="c b big">$${tx.amount.toLocaleString()}</div>
  <div class="c sm">${(tx.payment_method || 'Cash').toUpperCase()}</div>
  <div class="d"></div>
  <div class="sm c" style="opacity:0.6">${new Date().toLocaleString()}</div>
  <div class="sm c" style="opacity:0.4;margin-top:1mm">Smarter.Poker</div>
</div></body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  // Print Membership Receipt
  const printMembershipReceipt = (tx) => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Membership Receipt</title>
<style>@page{margin:0;size:80mm auto}body{font-family:'Courier New',monospace;margin:0;padding:0}.r{width:72mm;padding:4mm;margin:0 auto}.c{text-align:center}.b{font-weight:bold}.big{font-size:24px}.med{font-size:14px}.sm{font-size:11px}.d{border-top:1px dashed #000;margin:3mm 0}.row{display:flex;justify-content:space-between}</style></head><body>
<div class="r">
  <div class="c b med">SMARTER.POKER</div>
  <div class="c sm">Membership Receipt</div>
  <div class="d"></div>
  <div class="c b med">MEMBERSHIP</div>
  <div class="d"></div>
  <div class="row sm"><span>Player:</span><span class="b">${tx.player_name}</span></div>
  <div class="row sm"><span>Tier:</span><span class="b">${tx.tier}</span></div>
  <div class="row sm"><span>Expires:</span><span class="b">${tx.expires}</span></div>
  ${tx.staff_name ? `<div class="row sm"><span>Processed By:</span><span class="b">${tx.staff_name}</span></div>` : ''}
  <div class="d"></div>
  <div class="c b big">$${tx.amount.toLocaleString()}</div>
  <div class="c sm">${(tx.payment_method || 'Cash').toUpperCase()}</div>
  <div class="d"></div>
  <div class="sm c" style="opacity:0.6">${new Date().toLocaleString()}</div>
  <div class="sm c" style="opacity:0.4;margin-top:1mm">Smarter.Poker</div>
</div></body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  // PIN Keypad Component
  const PinKeypad = () => (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center" onClick={() => setPinStep(false)}>
      <div className="bg-[#242526] w-full max-w-xs rounded-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 justify-center mb-3">
          <Lock className="w-4 h-4 text-[#F59E0B]" />
          <span className="text-sm font-bold text-white">Enter Employee PIN</span>
        </div>
        <div className="flex justify-center gap-3 mb-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 ${i < pinDigits.length ? 'bg-[#1877F2] border-[#1877F2]' : 'border-[#4A4B4C]'}`} />
          ))}
        </div>
        {pinError && <p className="text-xs text-[#EF4444] text-center mb-2">{pinError}</p>}
        {pinVerifying ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
              <button key={d} onClick={() => handlePinDigit(String(d))}
                className="py-3 rounded-xl bg-[#3A3B3C] text-white text-lg font-bold active:bg-[#4A4B4C]">{d}</button>
            ))}
            <button onClick={() => setPinStep(false)}
              className="py-3 rounded-xl bg-[#EF4444]/10 text-[#EF4444] text-xs font-bold">Cancel</button>
            <button onClick={() => handlePinDigit('0')}
              className="py-3 rounded-xl bg-[#3A3B3C] text-white text-lg font-bold active:bg-[#4A4B4C]">0</button>
            <button onClick={() => { setPinDigits(pinDigits.slice(0, -1)); setPinError(''); }}
              className="py-3 rounded-xl bg-[#3A3B3C] text-[#B0B3B8] flex items-center justify-center active:bg-[#4A4B4C]">
              <Delete className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // PIN-gated submit button
  const PinSubmitButton = ({ action, label, color = '#31A24C', disabled = false }) => (
    <>
      {isPinCached() && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-[#31A24C]/10 mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#31A24C]" />
            <span className="text-xs text-[#31A24C] font-medium">Verified As {verifiedStaff?.display_name}</span>
          </div>
          <button onClick={lockPin} className="text-xs text-[#B0B3B8] flex items-center gap-1">
            <Lock className="w-3 h-3" /> Lock
          </button>
        </div>
      )}
      <button onClick={() => requestPinFor(action)} disabled={actionLoading || disabled}
        className="w-full py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2 text-white active:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: color }}>
        {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          !isPinCached() && <Lock className="w-4 h-4 mr-1" />
        )}
        {label}
      </button>
    </>
  );

  return (
    <CommanderLayout title="Cashier" backHref="/commander/dashboard">
      <SEOHead title="Commander — Cashier" description="Club Commander Poker Room Management Tool." noindex={true} />
      <div className="min-h-screen bg-black text-[#E4E6EB] font-['Inter']">

        {/* Message Toast */}
        {message && (
          <div className={`mx-4 mt-3 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium ${message.type === 'success' ? 'bg-[#31A24C]/15 text-[#31A24C]' : 'bg-[#EF4444]/15 text-[#EF4444]'}`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Scanned Player Banner — Enhanced */}
        {selectedPlayer && (
          <div className="mx-4 mt-3 bg-[#1877F2]/10 border border-[#1877F2]/30 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#1877F2]" />
                </div>
                <p className="text-sm font-bold text-white">{selectedPlayer.player_name}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={loadPlayerHistory}
                  className="text-[10px] text-[#1877F2] px-2 py-1 rounded-lg bg-[#1877F2]/15 font-semibold">History</button>
                <button onClick={() => setSelectedPlayer(null)}
                  className="text-[10px] text-[#B0B3B8] px-2 py-1 rounded-lg active:bg-[#3A3B3C]">Clear</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-lg px-3 py-2">
                <p className="text-[10px] text-[#F59E0B] font-semibold uppercase">Time Balance</p>
                <p className="text-lg font-black text-[#F59E0B]">
                  {Math.floor((selectedPlayer.time_balance_minutes || 0) / 60)}h {(selectedPlayer.time_balance_minutes || 0) % 60}m
                </p>
              </div>
              <div className="bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 rounded-lg px-3 py-2">
                <p className="text-[10px] text-[#8B5CF6] font-semibold uppercase">Membership</p>
                <p className="text-sm font-bold text-[#8B5CF6]">
                  {selectedPlayer.membership_tier ? selectedPlayer.membership_tier.charAt(0).toUpperCase() + selectedPlayer.membership_tier.slice(1) : 'None'}
                </p>
                {selectedPlayer.membership_expires && (
                  <p className="text-[9px] text-[#B0B3B8]">
                    Exp: {new Date(selectedPlayer.membership_expires).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="px-2 py-2">

            {/* Camera view — shown above panel when scanning */}
            {scanning && (
              <div className="mx-2 mb-2 rounded-2xl overflow-hidden border-2 border-[#3A3B3C] bg-black relative">
                <video ref={videoRef} className="w-full aspect-[4/3] object-cover" playsInline muted />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-white/30 rounded-2xl" />
                </div>
                <button onClick={stopScan}
                  className="absolute top-3 right-3 bg-[#EF4444] text-white px-4 py-2 rounded-xl text-sm font-bold z-10">
                  Stop Scanning
                </button>
              </div>
            )}

            {/* ═══ PLAYER SEARCH / SCAN MODAL ═══ */}
            {showPlayerSearch && (
              <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => { setShowPlayerSearch(false); setSearchQuery(''); setSearchResults([]); }}>
                <div className="bg-[#242526] w-full h-full overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Find Player</h3>
                    <button onClick={() => { setShowPlayerSearch(false); setSearchQuery(''); setSearchResults([]); }} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
                  </div>

                  {/* Scan Button */}
                  <button
                    onClick={() => { setShowPlayerSearch(false); startScan(); }}
                    className="w-full bg-[#1877F2] text-white py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 mb-4"
                  >
                    <QrCode className="w-5 h-5" /> Scan Player Card (QR Code)
                  </button>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-[#3A3B3C]" />
                    <span className="text-xs text-[#B0B3B8] font-medium">OR SEARCH MANUALLY</span>
                    <div className="flex-1 h-px bg-[#3A3B3C]" />
                  </div>

                  {/* Search Input */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => searchPlayers(e.target.value)}
                      placeholder="Search by Name or Phone..."
                      autoFocus
                      className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl pl-10 pr-4 py-3 text-white text-base font-medium outline-none focus:border-[#1877F2] placeholder:text-[#666]"
                    />
                    {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1877F2] animate-spin" />}
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      {searchResults.map(m => {
                        const name = m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim();
                        return (
                          <button key={m.id} onClick={() => selectMember(m)}
                            className="w-full bg-[#3A3B3C]/50 border border-[#4A4B4C] rounded-xl p-3 flex items-center gap-3 text-left active:bg-[#4A4B4C]">
                            <div className="w-10 h-10 rounded-full bg-[#1877F2]/20 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-[#1877F2]">{(name[0] || '?').toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{name || 'Unknown'}</p>
                              <p className="text-[10px] text-[#B0B3B8]">
                                {m.phone || 'No Phone'}
                                {m.membership_tier && ` • ${m.membership_tier.charAt(0).toUpperCase() + m.membership_tier.slice(1)} Member`}
                              </p>
                            </div>
                            <ChevronDown className="w-4 h-4 text-[#B0B3B8] -rotate-90 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {searchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
                    <div className="text-center py-6">
                      <p className="text-sm text-[#B0B3B8]">No players found for &quot;{searchQuery}&quot;</p>
                    </div>
                  )}

                  {searchQuery.length < 2 && (
                    <div className="text-center py-6">
                      <Users className="w-8 h-8 text-[#3A3B3C] mx-auto mb-2" />
                      <p className="text-sm text-[#B0B3B8]">Type a name or phone number to search</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ METAL PANEL IMAGE WITH CLICKABLE HOTSPOTS ═══ */}
            <div style={{ position: 'relative', width: '100%', margin: '0 auto' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/commander/cashier-panel.jpg"
                alt="Cashier Panel"
                style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
                draggable={false}
              />

              {/* Hotspot 1: Scan Player Card / Search */}
              <button
                onClick={() => {
                  if (scanning) { stopScan(); } else { setShowPlayerSearch(true); }
                }}
                style={{
                  position: 'absolute', top: '12%', left: '8%', width: '84%', height: '12.5%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: 8,
                }}
                aria-label="Scan Player Card"
              />

              {/* Hotspot 2: Add Time To Player's Balance */}
              <button
                onClick={() => {
                  setSelectedTime(null); setCustomMinutes(''); setShowAddTime(true);
                }}
                style={{
                  position: 'absolute', top: '26%', left: '8%', width: '84%', height: '12.5%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: 8,
                }}
                aria-label="Add Time To Player Balance"
              />

              {/* Hotspot 3: Update Membership */}
              <button
                onClick={() => {
                  setSelectedTier(selectedPlayer?.membership_tier || null); setShowMembership(true);
                }}
                style={{
                  position: 'absolute', top: '40%', left: '8%', width: '84%', height: '12.5%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: 8,
                }}
                aria-label="Update Membership"
              />

              {/* Hotspot 4: Tournament Registration */}
              <button
                onClick={() => router.push('/commander/tournament-registration')}
                style={{
                  position: 'absolute', top: '54%', left: '8%', width: '84%', height: '12.5%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: 8,
                }}
                aria-label="Tournament Registration"
              />

              {/* Hotspot 5: Cash Game Buy-In Receipt */}
              <button
                onClick={() => { setBuyInAmount(''); setPayMethod('cash'); setShowBuyIn(true); }}
                style={{
                  position: 'absolute', top: '68%', left: '8%', width: '84%', height: '12.5%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: 8,
                }}
                aria-label="Cash Game Buy-In Receipt"
              />

              {/* Hotspot 6: Transaction Log */}
              <button
                onClick={() => setShowLog(!showLog)}
                style={{
                  position: 'absolute', top: '82%', left: '8%', width: '84%', height: '12%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: 8,
                }}
                aria-label="Transaction Log"
              />
            </div>

            {/* Transaction Log — rendered below metal panel */}
            {showLog && (
              <div className="mx-2 mt-2">
                {transactions.length > 0 && (
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-[#B0B3B8] font-semibold">{transactions.length} Transactions Today</p>
                    <button onClick={() => {
                      if (transactions.length > 0) printReceipt(transactions[0]);
                    }} className="text-[10px] text-[#1877F2] font-semibold px-2 py-1 rounded-lg bg-[#1877F2]/15 flex items-center gap-1">
                      <Receipt className="w-3 h-3" /> Print Last
                    </button>
                  </div>
                )}
                {transactions.length > 0 ? (
                  <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-[#3A3B3C]">
                    {transactions.slice(0, 50).map(tx => {
                      const txTime = new Date(tx.created_at);
                      const minsAgo = (Date.now() - txTime.getTime()) / 60000;
                      const isVoidable = minsAgo <= 15;
                      const isVoidTx = (tx.notes || '').includes('VOID') || (tx.notes || '').includes('REFUND');
                      return (
                        <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isVoidTx ? 'bg-[#EF4444]/15' : 'bg-[#31A24C]/15'}`}>
                              <DollarSign className={`w-3.5 h-3.5 ${isVoidTx ? 'text-[#EF4444]' : 'text-[#31A24C]'}`} />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-white">{tx.player_name}</p>
                              <p className="text-[10px] text-[#B0B3B8]">
                                {tx.notes || 'Buy-In'} • {tx.payment_method || 'Cash'} • {txTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-bold ${isVoidTx ? 'text-[#EF4444]' : 'text-[#31A24C]'}`}>
                              {isVoidTx ? '-' : ''}${parseFloat(tx.amount).toLocaleString()}
                            </span>
                            <button onClick={() => printReceipt(tx)} className="w-7 h-7 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
                              <Receipt className="w-3.5 h-3.5 text-[#B0B3B8]" />
                            </button>
                            {!isVoidTx && (
                              <button onClick={() => voidTransaction(tx.id, tx.notes?.includes('Time') ? 'time' : tx.notes?.includes('Membership') ? 'membership' : 'buyin', {
                                player_name: tx.player_name, amount: parseFloat(tx.amount), payment_method: tx.payment_method,
                                notes: tx.notes, minutes: parseInt((tx.notes || '').match(/(\d+)/)?.[1] || '0'),
                                created_at: tx.created_at
                              })}
                                className={`px-1.5 py-1 rounded-lg text-[9px] font-bold ${isVoidable ? 'bg-[#F02849]/15 text-[#F02849]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}>
                                {isVoidable ? 'VOID' : 'REFUND'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-6 text-center">
                    <p className="text-sm text-[#B0B3B8]">No Transactions Today</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* === BUY-IN RECEIPT MODAL === */}
        {showBuyIn && (
          <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => setShowBuyIn(false)}>
            <div className="bg-[#242526] w-full h-full overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Cash Game Buy-In</h3>
                <button onClick={() => setShowBuyIn(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
              </div>
              <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#B0B3B8]" />
                <span className="text-sm text-white font-medium">{selectedPlayer?.player_name || 'Walk-Up Player'}</span>
                {!selectedPlayer && (
                  <button onClick={() => { setShowBuyIn(false); setShowPlayerSearch(true); }}
                    className="text-xs text-[#1877F2] ml-auto font-semibold">Find Player</button>
                )}
              </div>
              <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Select Amount</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {QUICK_AMOUNTS.map(qa => (
                  <button key={qa} onClick={() => setBuyInAmount(String(qa))}
                    className={`py-3 rounded-xl text-sm font-bold ${buyInAmount === String(qa) ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'}`}>${qa}</button>
                ))}
              </div>
              <div className="relative mb-4">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
                <input type="number" value={buyInAmount} onChange={e => setBuyInAmount(e.target.value)} placeholder="Custom Amount"
                  className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl pl-10 pr-4 py-3 text-white text-lg font-bold outline-none focus:border-[#1877F2]" />
              </div>
              <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Payment Method</p>
              <div className="flex gap-2 mb-4">
                <button onClick={() => setPayMethod('cash')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${payMethod === 'cash' ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                  <Banknote className="w-4 h-4" /> Cash
                </button>
                <button onClick={() => setPayMethod('card')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${payMethod === 'card' ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                  <CreditCard className="w-4 h-4" /> Card
                </button>
              </div>
              <PinSubmitButton action="buyin" label={`Print Buy-In Receipt${buyInAmount ? ` — $${parseFloat(buyInAmount).toLocaleString()}` : ''}`} disabled={!buyInAmount} />
            </div>
          </div>
        )
        }

        {/* === ADD TIME MODAL === */}
        {
          showAddTime && (
            <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => setShowAddTime(false)}>
              <div className="bg-[#242526] w-full h-full overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Add Time</h3>
                  <button onClick={() => setShowAddTime(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
                </div>
                {selectedPlayer ? (
                  <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#B0B3B8]" />
                      <span className="text-sm text-white font-medium">{selectedPlayer.player_name}</span>
                    </div>
                    <span className="text-xs text-[#F59E0B] font-medium">
                      Balance: {Math.floor((selectedPlayer.time_balance_minutes || 0) / 60)}h {(selectedPlayer.time_balance_minutes || 0) % 60}m
                    </span>
                  </div>
                ) : (
                  <div className="mb-4">
                    <p className="text-xs text-[#F59E0B] font-semibold mb-2">Select a player first:</p>
                    <button onClick={() => { setShowAddTime(false); setShowPlayerSearch(true); }}
                      className="w-full bg-[#1877F2]/15 border border-[#1877F2]/30 text-[#1877F2] py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                      <Search className="w-4 h-4" /> Scan or Search for Player
                    </button>
                  </div>
                )}
                <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Select Time Package</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {TIME_OPTIONS.map(opt => (
                    <button key={opt.minutes} onClick={() => { setSelectedTime(opt.minutes); setCustomMinutes(''); }}
                      className={`py-3 px-2 rounded-xl text-left ${selectedTime === opt.minutes ? 'bg-[#F59E0B] text-black' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'}`}>
                      <span className="text-sm font-bold block">{opt.label}</span>
                      <span className={`text-xs font-semibold ${selectedTime === opt.minutes ? 'text-black/70' : 'text-[#31A24C]'}`}>
                        {opt.price > 0 ? `$${opt.price}` : 'Free'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="relative mb-4">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
                  <input type="number" value={customMinutes}
                    onChange={e => { setCustomMinutes(e.target.value); setSelectedTime(null); }}
                    placeholder={`Custom Minutes${timeBillingRate > 0 ? ` ($${(timeBillingRate / 60).toFixed(2)}/min)` : ''}`}
                    className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl pl-10 pr-4 py-3 text-white text-lg font-bold outline-none focus:border-[#F59E0B]" />
                </div>

                {/* Total Due */}
                {(selectedTime || customMinutes) && (
                  <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl p-4 mb-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#F59E0B]">Total Due</span>
                    <span className="text-2xl font-black text-[#F59E0B]">${getTimePrice()}</span>
                  </div>
                )}

                {/* Payment Method */}
                <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Payment Method</p>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setTimePayMethod('cash')}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${timePayMethod === 'cash' ? 'bg-[#F59E0B] text-black' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                    <Banknote className="w-4 h-4" /> Cash
                  </button>
                  <button onClick={() => setTimePayMethod('card')}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${timePayMethod === 'card' ? 'bg-[#F59E0B] text-black' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                    <CreditCard className="w-4 h-4" /> Card
                  </button>
                </div>

                <PinSubmitButton action="addtime" color="#F59E0B"
                  label={`Collect $${getTimePrice()} — ${selectedTime ? TIME_OPTIONS.find(o => o.minutes === selectedTime)?.label : customMinutes ? customMinutes + ' Min' : 'Time'}`}
                  disabled={(!selectedTime && !customMinutes) || !selectedPlayer?.id} />

                {/* Recent Time Transactions */}
                {transactions.filter(tx => tx.notes?.includes('Time Purchase')).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Recent Time Sales (Void If Mistake)</p>
                    <div className="space-y-1">
                      {transactions.filter(tx => tx.notes?.includes('Time Purchase')).slice(0, 5).map(tx => (
                        <div key={tx.id} className="bg-[#18191A] rounded-lg p-2.5 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-white">{tx.player_name}</p>
                            <p className="text-[10px] text-[#B0B3B8]">{tx.notes} • ${parseFloat(tx.amount)} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <button onClick={() => voidTransaction(tx.id, 'time', { player_name: tx.player_name, amount: parseFloat(tx.amount), payment_method: tx.payment_method, notes: tx.notes, minutes: parseInt((tx.notes || '').match(/(\d+)/)?.[1] || '0') })}
                            className="px-2 py-1 rounded-lg bg-[#F02849]/15 text-[#F02849] text-[10px] font-bold">
                            VOID
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* === UPDATE MEMBERSHIP MODAL === */}
        {
          showMembership && (
            <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => setShowMembership(false)}>
              <div className="bg-[#242526] w-full h-full overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Update Membership</h3>
                  <button onClick={() => setShowMembership(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
                </div>
                {selectedPlayer ? (
                  <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#B0B3B8]" />
                      <span className="text-sm text-white font-medium">{selectedPlayer.player_name}</span>
                    </div>
                    <span className="text-xs text-[#B0B3B8]">
                      Current: {selectedPlayer.membership_tier ? selectedPlayer.membership_tier.charAt(0).toUpperCase() + selectedPlayer.membership_tier.slice(1) : 'None'}
                    </span>
                  </div>
                ) : (
                  <div className="mb-4">
                    <p className="text-xs text-[#8B5CF6] font-semibold mb-2">Select a player first:</p>
                    <button onClick={() => { setShowMembership(false); setShowPlayerSearch(true); }}
                      className="w-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#8B5CF6] py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                      <Search className="w-4 h-4" /> Scan or Search for Player
                    </button>
                  </div>
                )}
                <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Select Membership Tier</p>
                <div className="space-y-2 mb-4">
                  {MEMBERSHIP_TIERS.map(t => {
                    const expires = new Date();
                    expires.setDate(expires.getDate() + t.duration);
                    return (
                      <button key={t.tier} onClick={() => setSelectedTier(t.tier)}
                        className={`w-full rounded-xl p-3 flex items-center gap-3 text-left border-2 ${selectedTier === t.tier ? '' : 'border-[#3A3B3C] bg-[#3A3B3C]/30'
                          }`} style={selectedTier === t.tier ? { borderColor: t.color, backgroundColor: `${t.color}15` } : {}}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-white">{t.label}</p>
                            <span className="text-sm font-bold" style={{ color: t.color }}>{t.price > 0 ? `$${t.price}` : 'Free'}</span>
                          </div>
                          <p className="text-[10px] text-[#B0B3B8]">Expires {expires.toLocaleDateString()}</p>
                        </div>
                        {selectedTier === t.tier && <CheckCircle2 className="w-5 h-5" style={{ color: t.color }} />}
                      </button>
                    );
                  })}
                </div>

                {/* Total Due */}
                {selectedTier && (() => {
                  const tierInfo = MEMBERSHIP_TIERS.find(t => t.tier === selectedTier);
                  return tierInfo?.price > 0 ? (
                    <div className="rounded-xl p-4 mb-4 flex items-center justify-between" style={{ background: `${tierInfo.color}15`, border: `1px solid ${tierInfo.color}40` }}>
                      <span className="text-sm font-semibold" style={{ color: tierInfo.color }}>Total Due</span>
                      <span className="text-2xl font-black" style={{ color: tierInfo.color }}>${tierInfo.price}</span>
                    </div>
                  ) : null;
                })()}

                {/* Payment Method */}
                <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Payment Method</p>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setMemberPayMethod('cash')}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${memberPayMethod === 'cash' ? 'bg-[#8B5CF6] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                    <Banknote className="w-4 h-4" /> Cash
                  </button>
                  <button onClick={() => setMemberPayMethod('card')}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${memberPayMethod === 'card' ? 'bg-[#8B5CF6] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                    <CreditCard className="w-4 h-4" /> Card
                  </button>
                </div>

                <PinSubmitButton action="membership" color="#8B5CF6"
                  label={`Collect $${selectedTier ? MEMBERSHIP_TIERS.find(t => t.tier === selectedTier)?.price || 0 : 0} — ${selectedTier ? MEMBERSHIP_TIERS.find(t => t.tier === selectedTier)?.label : '...'}`}
                  disabled={!selectedTier || !selectedPlayer?.id} />

                {/* Recent Membership Transactions */}
                {transactions.filter(tx => tx.notes?.includes('Membership')).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Recent Membership Sales (Void If Mistake)</p>
                    <div className="space-y-1">
                      {transactions.filter(tx => tx.notes?.includes('Membership')).slice(0, 5).map(tx => (
                        <div key={tx.id} className="bg-[#18191A] rounded-lg p-2.5 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-white">{tx.player_name}</p>
                            <p className="text-[10px] text-[#B0B3B8]">{tx.notes} • ${parseFloat(tx.amount)} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <button onClick={() => voidTransaction(tx.id, 'membership', { player_name: tx.player_name, amount: parseFloat(tx.amount), payment_method: tx.payment_method, notes: tx.notes })}
                            className="px-2 py-1 rounded-lg bg-[#F02849]/15 text-[#F02849] text-[10px] font-bold">
                            VOID
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* === PLAYER TRANSACTION HISTORY MODAL === */}
        {showPlayerHistory && (
          <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => setShowPlayerHistory(false)}>
            <div className="bg-[#242526] w-full h-full overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Transaction History</h3>
                <button onClick={() => setShowPlayerHistory(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
              </div>
              <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#1877F2]" />
                <span className="text-sm text-white font-medium">{selectedPlayer?.player_name}</span>
              </div>
              {playerHistoryLoading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" /></div>
              ) : playerHistory.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-[#31A24C]/10 border border-[#31A24C]/20 rounded-lg px-3 py-2 text-center">
                      <p className="text-[10px] text-[#31A24C] font-semibold uppercase">Total Spent</p>
                      <p className="text-lg font-black text-[#31A24C]">
                        ${playerHistory.filter(tx => !(tx.notes || '').includes('VOID') && !(tx.notes || '').includes('REFUND')).reduce((s, tx) => s + parseFloat(tx.amount), 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-[#1877F2]/10 border border-[#1877F2]/20 rounded-lg px-3 py-2 text-center">
                      <p className="text-[10px] text-[#1877F2] font-semibold uppercase">Transactions</p>
                      <p className="text-lg font-black text-[#1877F2]">{playerHistory.length}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {playerHistory.map(tx => {
                      const isVoidTx = (tx.notes || '').includes('VOID') || (tx.notes || '').includes('REFUND');
                      return (
                        <div key={tx.id} className="bg-[#18191A] rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-white">{tx.notes || 'Buy-In'}</p>
                            <p className="text-[10px] text-[#B0B3B8]">
                              {tx.payment_method || 'Cash'} • {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`text-sm font-bold ${isVoidTx ? 'text-[#EF4444]' : 'text-[#31A24C]'}`}>
                            {isVoidTx ? '-' : ''}${parseFloat(tx.amount).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="bg-[#18191A] rounded-xl p-8 text-center">
                  <p className="text-sm text-[#B0B3B8]">No Transactions Found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PIN Keypad Overlay */}
        {pinStep && <PinKeypad />}
      </div >
    </CommanderLayout >
  );
}
