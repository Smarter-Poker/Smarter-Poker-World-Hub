/**
 * Cashier — Texas Club Style
 * /commander/cashier
 * Simple operations with inline action modals:
 * 1. Scan Player Card (QR code)
 * 2. Cash Game Buy-In Receipt
 * 3. Add Time (adds minutes directly to player's time balance)
 * 4. Update Membership (changes tier + expiry on player)
 * Collapsible transaction log at bottom
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  QrCode, Clock, CreditCard, Loader2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Receipt, Lock, Delete, DollarSign, Banknote, Users
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const QUICK_AMOUNTS = [50, 100, 200, 300, 500, 1000];
const TIME_OPTIONS = [
  { label: '1 Hour', minutes: 60 },
  { label: '2 Hours', minutes: 120 },
  { label: '3 Hours', minutes: 180 },
  { label: '4 Hours', minutes: 240 },
  { label: '5 Hr Pack', minutes: 300 },
  { label: '20 Hr Pack', minutes: 1200 },
];
const MEMBERSHIP_TIERS = [
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

  // Modals
  const [showBuyIn, setShowBuyIn] = useState(false);
  const [showAddTime, setShowAddTime] = useState(false);
  const [showMembership, setShowMembership] = useState(false);

  // Buy-In form
  const [buyInAmount, setBuyInAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');

  // Add Time form
  const [selectedTime, setSelectedTime] = useState(null);
  const [customMinutes, setCustomMinutes] = useState('');

  // Membership form
  const [selectedTier, setSelectedTier] = useState(null);

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
        setMessage({ type: 'success', text: `Found: ${member.first_name || ''} ${member.last_name || ''}`.trim() });
        setSelectedPlayer({
          id: member.id,
          player_name: `${member.first_name || ''} ${member.last_name || ''}`.trim(),
          user_id: member.user_id || member.id,
          membership_tier: member.membership_tier,
          membership_status: member.membership_status,
          membership_expires: member.membership_expires,
          time_balance_minutes: member.time_balance_minutes || 0,
          member_number: member.member_number,
        });
      } else {
        setMessage({ type: 'error', text: 'Player Not Found — Try Manual Search' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error Looking Up Player' });
    }
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
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error || 'Transaction Failed' });
      }
    } catch { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); }
  };

  // Add Time to Player
  const doAddTime = async (staff) => {
    const mins = selectedTime || parseInt(customMinutes) || 0;
    if (mins <= 0) { setMessage({ type: 'error', text: 'Select A Time Amount' }); return; }
    if (!selectedPlayer?.id) { setMessage({ type: 'error', text: 'Scan A Player Card First' }); return; }
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const newBalance = (selectedPlayer.time_balance_minutes || 0) + mins;
      const res = await fetch(`/api/commander/members/${selectedPlayer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ time_balance_minutes: newBalance })
      });
      const json = await res.json();
      if (json.success) {
        const hours = Math.floor(mins / 60);
        const remainMins = mins % 60;
        const timeLabel = hours > 0 ? `${hours}h ${remainMins > 0 ? remainMins + 'm' : ''}` : `${mins}m`;
        setMessage({ type: 'success', text: `Added ${timeLabel} — ${selectedPlayer.player_name} (New Balance: ${Math.floor(newBalance / 60)}h ${newBalance % 60}m)` });
        setSelectedPlayer(prev => ({ ...prev, time_balance_minutes: newBalance }));
        setShowAddTime(false);
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed To Add Time' });
      }
    } catch { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); }
  };

  // Update Membership
  const doUpdateMembership = async (staff) => {
    if (!selectedTier) { setMessage({ type: 'error', text: 'Select A Membership Tier' }); return; }
    if (!selectedPlayer?.id) { setMessage({ type: 'error', text: 'Scan A Player Card First' }); return; }
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const tierInfo = MEMBERSHIP_TIERS.find(t => t.tier === selectedTier);
      const expires = new Date();
      expires.setDate(expires.getDate() + (tierInfo?.duration || 1));

      const res = await fetch(`/api/commander/members/${selectedPlayer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': staffSession },
        body: JSON.stringify({
          membership_tier: selectedTier,
          membership_status: 'active',
          membership_expires: expires.toISOString()
        })
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `Membership Updated — ${selectedPlayer.player_name} → ${tierInfo?.label} (Expires ${expires.toLocaleDateString()})` });
        setSelectedPlayer(prev => ({
          ...prev,
          membership_tier: selectedTier,
          membership_status: 'active',
          membership_expires: expires.toISOString()
        }));
        setShowMembership(false);
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed To Update Membership' });
      }
    } catch { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); }
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
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Message Toast */}
        {message && (
          <div className={`mx-4 mt-3 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium ${message.type === 'success' ? 'bg-[#31A24C]/15 text-[#31A24C]' : 'bg-[#EF4444]/15 text-[#EF4444]'}`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Scanned Player Banner */}
        {selectedPlayer && (
          <div className="mx-4 mt-3 bg-[#1877F2]/10 border border-[#1877F2]/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-[#1877F2]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{selectedPlayer.player_name}</p>
                <p className="text-[10px] text-[#B0B3B8]">
                  {selectedPlayer.membership_tier ? `${selectedPlayer.membership_tier.charAt(0).toUpperCase() + selectedPlayer.membership_tier.slice(1)} Member` : 'No Membership'}
                  {selectedPlayer.time_balance_minutes > 0 && ` • ${Math.floor(selectedPlayer.time_balance_minutes / 60)}h ${selectedPlayer.time_balance_minutes % 60}m Balance`}
                </p>
              </div>
            </div>
            <button onClick={() => setSelectedPlayer(null)}
              className="text-xs text-[#B0B3B8] px-2 py-1 rounded-lg active:bg-[#3A3B3C]">Clear</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="px-4 py-4 space-y-3">

            {/* 1. Scan Player Card */}
            <button onClick={scanning ? stopScan : startScan}
              className={`w-full rounded-2xl border-2 p-5 flex items-center gap-4 active:scale-[0.99] transition-transform ${scanning ? 'bg-[#EF4444]/10 border-[#EF4444]/40' : 'bg-[#1877F2]/10 border-[#1877F2]/40'
                }`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${scanning ? 'bg-[#EF4444]/20' : 'bg-[#1877F2]/20'}`}>
                <QrCode className={`w-7 h-7 ${scanning ? 'text-[#EF4444]' : 'text-[#1877F2]'}`} />
              </div>
              <div className="text-left flex-1">
                <p className="text-lg font-bold text-white">{scanning ? 'Stop Scanning' : 'Scan Player Card'}</p>
                <p className="text-sm text-[#B0B3B8]">{scanning ? 'Tap To Stop Camera' : 'Scan QR Code To Identify Player'}</p>
              </div>
              {scanning && <div className="w-3 h-3 rounded-full bg-[#EF4444] animate-pulse" />}
            </button>

            {scanning && (
              <div className="rounded-2xl overflow-hidden border-2 border-[#3A3B3C] bg-black relative">
                <video ref={videoRef} className="w-full aspect-[4/3] object-cover" playsInline muted />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-white/30 rounded-2xl" />
                </div>
              </div>
            )}

            {/* 2. Cash Game Buy-In Receipt */}
            <button onClick={() => { setBuyInAmount(''); setPayMethod('cash'); setShowBuyIn(true); }}
              className="w-full bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4 flex items-center gap-4 active:bg-[#3A3B3C]">
              <div className="w-12 h-12 rounded-xl bg-[#31A24C]/15 flex items-center justify-center">
                <Receipt className="w-6 h-6 text-[#31A24C]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-base font-bold text-white">Cash Game Buy-In Receipt</p>
                <p className="text-xs text-[#B0B3B8]">Issue Receipt For Cash Game Buy-Ins</p>
              </div>
              <ChevronDown className="w-5 h-5 text-[#B0B3B8] -rotate-90" />
            </button>

            {/* 3. Add Time */}
            <button onClick={() => {
              if (!selectedPlayer?.id) { setMessage({ type: 'error', text: 'Scan A Player Card First' }); return; }
              setSelectedTime(null); setCustomMinutes(''); setShowAddTime(true);
            }}
              className="w-full bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4 flex items-center gap-4 active:bg-[#3A3B3C]">
              <div className="w-12 h-12 rounded-xl bg-[#F59E0B]/15 flex items-center justify-center">
                <Clock className="w-6 h-6 text-[#F59E0B]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-base font-bold text-white">Add Time</p>
                <p className="text-xs text-[#B0B3B8]">Add Time To Player's Balance</p>
              </div>
              <ChevronDown className="w-5 h-5 text-[#B0B3B8] -rotate-90" />
            </button>

            {/* 4. Update Membership */}
            <button onClick={() => {
              if (!selectedPlayer?.id) { setMessage({ type: 'error', text: 'Scan A Player Card First' }); return; }
              setSelectedTier(selectedPlayer.membership_tier || null); setShowMembership(true);
            }}
              className="w-full bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4 flex items-center gap-4 active:bg-[#3A3B3C]">
              <div className="w-12 h-12 rounded-xl bg-[#8B5CF6]/15 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-[#8B5CF6]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-base font-bold text-white">Update Membership</p>
                <p className="text-xs text-[#B0B3B8]">Change Or Renew Player Membership</p>
              </div>
              <ChevronDown className="w-5 h-5 text-[#B0B3B8] -rotate-90" />
            </button>

            {/* Transaction Log (Collapsible) */}
            <div className="pt-2">
              <button onClick={() => setShowLog(!showLog)}
                className="w-full bg-[#242526] border border-[#3A3B3C] rounded-xl px-4 py-3 flex items-center justify-between active:bg-[#3A3B3C]">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#B0B3B8]" />
                  <span className="text-sm font-semibold text-white">Transaction Log</span>
                  <span className="text-xs text-[#B0B3B8]">({transactions.length})</span>
                </div>
                {showLog ? <ChevronUp className="w-4 h-4 text-[#B0B3B8]" /> : <ChevronDown className="w-4 h-4 text-[#B0B3B8]" />}
              </button>
              {showLog && transactions.length > 0 && (
                <div className="mt-1 bg-[#242526] border border-[#3A3B3C] rounded-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-[#3A3B3C]">
                  {transactions.slice(0, 50).map(tx => (
                    <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-[#31A24C]/15">
                          <DollarSign className="w-3.5 h-3.5 text-[#31A24C]" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-white">{tx.player_name}</p>
                          <p className="text-[10px] text-[#B0B3B8]">
                            Buy-In • {tx.payment_method || 'Cash'} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#31A24C]">${parseFloat(tx.amount).toLocaleString()}</span>
                        <button onClick={() => printReceipt(tx)} className="w-7 h-7 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
                          <Receipt className="w-3.5 h-3.5 text-[#B0B3B8]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showLog && transactions.length === 0 && (
                <div className="mt-1 bg-[#242526] border border-[#3A3B3C] rounded-xl p-6 text-center">
                  <p className="text-sm text-[#B0B3B8]">No Transactions Today</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === BUY-IN RECEIPT MODAL === */}
        {showBuyIn && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowBuyIn(false)}>
            <div className="bg-[#242526] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Cash Game Buy-In</h3>
                <button onClick={() => setShowBuyIn(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
              </div>
              <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#B0B3B8]" />
                <span className="text-sm text-white font-medium">{selectedPlayer?.player_name || 'Walk-Up Player'}</span>
                {!selectedPlayer && <span className="text-xs text-[#B0B3B8] ml-auto">Scan Card First For Named Receipt</span>}
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
        )}

        {/* === ADD TIME MODAL === */}
        {showAddTime && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowAddTime(false)}>
            <div className="bg-[#242526] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Add Time</h3>
                <button onClick={() => setShowAddTime(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
              </div>
              <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#B0B3B8]" />
                  <span className="text-sm text-white font-medium">{selectedPlayer?.player_name}</span>
                </div>
                <span className="text-xs text-[#F59E0B] font-medium">
                  Current: {Math.floor((selectedPlayer?.time_balance_minutes || 0) / 60)}h {(selectedPlayer?.time_balance_minutes || 0) % 60}m
                </span>
              </div>
              <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Select Time</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {TIME_OPTIONS.map(opt => (
                  <button key={opt.minutes} onClick={() => { setSelectedTime(opt.minutes); setCustomMinutes(''); }}
                    className={`py-3 rounded-xl text-sm font-bold ${selectedTime === opt.minutes ? 'bg-[#F59E0B] text-black' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="relative mb-4">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
                <input type="number" value={customMinutes}
                  onChange={e => { setCustomMinutes(e.target.value); setSelectedTime(null); }}
                  placeholder="Custom Minutes"
                  className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl pl-10 pr-4 py-3 text-white text-lg font-bold outline-none focus:border-[#F59E0B]" />
              </div>
              <PinSubmitButton action="addtime" color="#F59E0B"
                label={`Add ${selectedTime ? TIME_OPTIONS.find(o => o.minutes === selectedTime)?.label : customMinutes ? customMinutes + ' Minutes' : 'Time'}`}
                disabled={!selectedTime && !customMinutes} />
            </div>
          </div>
        )}

        {/* === UPDATE MEMBERSHIP MODAL === */}
        {showMembership && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowMembership(false)}>
            <div className="bg-[#242526] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Update Membership</h3>
                <button onClick={() => setShowMembership(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
              </div>
              <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#B0B3B8]" />
                  <span className="text-sm text-white font-medium">{selectedPlayer?.player_name}</span>
                </div>
                <span className="text-xs text-[#B0B3B8]">
                  Current: {selectedPlayer?.membership_tier ? selectedPlayer.membership_tier.charAt(0).toUpperCase() + selectedPlayer.membership_tier.slice(1) : 'None'}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Select Tier</p>
              <div className="space-y-2 mb-4">
                {MEMBERSHIP_TIERS.map(t => {
                  const expires = new Date();
                  expires.setDate(expires.getDate() + t.duration);
                  return (
                    <button key={t.tier} onClick={() => setSelectedTier(t.tier)}
                      className={`w-full rounded-xl p-3 flex items-center gap-3 text-left border-2 transition-colors ${selectedTier === t.tier ? 'border-current bg-current/10' : 'border-[#3A3B3C] bg-[#3A3B3C]/30'
                        }`} style={selectedTier === t.tier ? { borderColor: t.color, backgroundColor: `${t.color}15` } : {}}>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">{t.label}</p>
                        <p className="text-[10px] text-[#B0B3B8]">Expires {expires.toLocaleDateString()}</p>
                      </div>
                      {selectedTier === t.tier && <CheckCircle2 className="w-5 h-5" style={{ color: t.color }} />}
                    </button>
                  );
                })}
              </div>
              <PinSubmitButton action="membership" color="#8B5CF6"
                label={`Update To ${selectedTier ? MEMBERSHIP_TIERS.find(t => t.tier === selectedTier)?.label : '...'}`}
                disabled={!selectedTier} />
            </div>
          </div>
        )}

        {/* PIN Keypad Overlay */}
        {pinStep && <PinKeypad />}
      </div>
    </CommanderLayout>
  );
}
