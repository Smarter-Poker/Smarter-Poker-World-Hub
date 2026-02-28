/**
 * Cashier — Simplified Operations
 * /commander/cashier
 * Three primary functions:
 * 1. Scan Player Card (QR code scanner)
 * 2. Add Time (time billing)
 * 3. Update Membership
 * Collapsible transaction log at bottom
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  QrCode, Clock, CreditCard, Loader2, RefreshCw,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Receipt, ArrowDownToLine, ArrowUpFromLine, Lock, Delete,
  DollarSign, Plus, Minus, Banknote, Users, Coins
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const QUICK_AMOUNTS = [100, 200, 300, 500, 1000];
const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'card', label: 'Card', icon: CreditCard },
];

export default function Cashier() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState(null);
  const [message, setMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Scanner
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Transaction form
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [txType, setTxType] = useState('buy_in');
  const [amount, setAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [showForm, setShowForm] = useState(false);

  // PIN verification
  const [pinStep, setPinStep] = useState(false);
  const [pinDigits, setPinDigits] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [verifiedStaff, setVerifiedStaff] = useState(null);
  const [pinCacheExpiry, setPinCacheExpiry] = useState(0);

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
      setSummary(txJson.summary || null);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // QR Scanner
  const startScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      // Use BarcodeDetector if available, otherwise fallback
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
        // Wait for video to be ready
        setTimeout(scanLoop, 500);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setMessage({ type: 'error', text: 'Camera access denied or unavailable' });
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
    setScanResult(qrData);
    // Look up the player by QR code data (user_id or member_id)
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/commander/members?search=${encodeURIComponent(qrData)}&venue_id=${venueId}`, { headers });
      const json = await res.json();
      if (json.success && json.data?.length > 0) {
        const member = json.data[0];
        setMessage({ type: 'success', text: `Found: ${member.display_name || member.name}` });
        setSelectedPlayer({
          player_name: member.display_name || member.name,
          user_id: member.user_id || member.id,
          table_number: null,
          seat_number: null,
          id: null,
          membership: member.membership_tier || member.membership_type,
          membership_expires: member.membership_expires
        });
      } else {
        setMessage({ type: 'error', text: 'Player not found — try manual search' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error looking up player' });
    }
  };

  // Transaction form handlers
  const openForm = (type) => {
    const player = selectedPlayer || { player_name: 'Walk-up', table_number: null, seat_number: null, id: null };
    setSelectedPlayer(player);
    setTxType(type);
    setAmount('');
    setPayMethod('cash');
    setShowForm(true);
  };

  const requestPin = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setMessage({ type: 'error', text: 'Enter A Valid Amount' });
      return;
    }
    if (isPinCached()) {
      verifyPinAndSubmit(null, verifiedStaff);
      return;
    }
    setPinDigits('');
    setPinError('');
    setPinStep(true);
  };

  const verifyPinAndSubmit = async (digits, cachedStaff = null) => {
    let staff = cachedStaff;
    if (!staff) {
      if (!digits || digits.length !== 4) return;
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
        staff = pinJson.data.staff;
      } catch {
        setPinError('Network Error');
        setPinDigits('');
        setPinVerifying(false);
        return;
      }
    }
    setVerifiedStaff(staff);
    setPinCacheExpiry(Date.now() + 5 * 60 * 1000);
    setPinStep(false);

    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch('/api/commander/cashier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': staffSession },
        body: JSON.stringify({
          venue_id: venueId,
          session_id: selectedPlayer?.id,
          player_name: selectedPlayer?.player_name || 'Walk-up',
          table_number: selectedPlayer?.table_number,
          seat_number: selectedPlayer?.seat_number,
          type: txType,
          amount: parseFloat(amount),
          payment_method: payMethod,
          pin_verified_by: staff?.id || null
        })
      });
      const json = await res.json();
      if (json.success) {
        const label = txType === 'buy_in' ? 'Buy-in' : txType === 'add_on' ? 'Add-on' : 'Cash-out';
        setMessage({ type: 'success', text: `${label} $${parseFloat(amount).toLocaleString()} — ${selectedPlayer?.player_name || 'Walk-up'} (${staff?.display_name || 'Staff'})` });
        setShowForm(false);
        printReceipt({
          type: txType,
          player_name: selectedPlayer?.player_name || 'Walk-up',
          table_number: selectedPlayer?.table_number,
          seat_number: selectedPlayer?.seat_number,
          amount: parseFloat(amount),
          payment_method: payMethod,
          created_at: new Date().toISOString(),
          staff_name: staff?.display_name || 'Staff'
        });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error || 'Transaction failed' });
      }
    } catch { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); setPinVerifying(false); }
  };

  const handlePinDigit = (d) => {
    const next = pinDigits + d;
    setPinDigits(next);
    setPinError('');
    if (next.length === 4) verifyPinAndSubmit(next);
  };

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  // Cleanup camera on unmount
  useEffect(() => () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); }, []);

  const printReceipt = (tx) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    const typeLabel = tx.type === 'buy_in' ? 'BUY-IN' : tx.type === 'add_on' ? 'ADD-ON' : 'CASH OUT';
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
  <div class="center sm">Cash Game Receipt</div>
  <div class="divider"></div>
  <div class="center bold med">${typeLabel}</div>
  <div class="divider"></div>
  <div class="row sm"><span>Player:</span><span class="bold">${tx.player_name}</span></div>
  ${tx.table_number ? `<div class="row sm"><span>Table/Seat:</span><span class="bold">T${tx.table_number} S${tx.seat_number || '-'}</span></div>` : ''}
  ${tx.staff_name ? `<div class="row sm"><span>Processed by:</span><span class="bold">${tx.staff_name}</span></div>` : ''}
  <div class="divider"></div>
  <div class="center bold big">$${parseFloat(tx.amount).toLocaleString()}</div>
  <div class="center sm">${(tx.payment_method || 'cash').toUpperCase()}</div>
  <div class="divider"></div>
  <div class="sm center" style="opacity:0.6">${new Date(tx.created_at || Date.now()).toLocaleString()}</div>
  <div class="sm center" style="opacity:0.4;margin-top:1mm">Smarter.Poker</div>
</div></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

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
                {selectedPlayer.membership && (
                  <p className="text-xs text-[#1877F2]">{selectedPlayer.membership} Member</p>
                )}
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

            {/* ========== PRIMARY ACTIONS ========== */}

            {/* 1. Scan Player Card — Primary Button */}
            <button onClick={scanning ? stopScan : startScan}
              className={`w-full rounded-2xl border-2 p-5 flex items-center gap-4 active:scale-[0.99] transition-transform ${scanning
                  ? 'bg-[#EF4444]/10 border-[#EF4444]/40'
                  : 'bg-[#1877F2]/10 border-[#1877F2]/40'
                }`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${scanning ? 'bg-[#EF4444]/20' : 'bg-[#1877F2]/20'
                }`}>
                <QrCode className={`w-7 h-7 ${scanning ? 'text-[#EF4444]' : 'text-[#1877F2]'}`} />
              </div>
              <div className="text-left flex-1">
                <p className="text-lg font-bold text-white">
                  {scanning ? 'Stop Scanning' : 'Scan Player Card'}
                </p>
                <p className="text-sm text-[#B0B3B8]">
                  {scanning ? 'Tap to stop camera' : 'Scan QR code to identify player'}
                </p>
              </div>
              {scanning && <div className="w-3 h-3 rounded-full bg-[#EF4444] animate-pulse" />}
            </button>

            {/* Camera Preview */}
            {scanning && (
              <div className="rounded-2xl overflow-hidden border-2 border-[#3A3B3C] bg-black relative">
                <video ref={videoRef} className="w-full aspect-[4/3] object-cover" playsInline muted />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-white/30 rounded-2xl" />
                </div>
              </div>
            )}

            {/* 2. Add Time */}
            <button onClick={() => router.push('/commander/time-billing')}
              className="w-full bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4 flex items-center gap-4 active:bg-[#3A3B3C]">
              <div className="w-12 h-12 rounded-xl bg-[#31A24C]/15 flex items-center justify-center">
                <Clock className="w-6 h-6 text-[#31A24C]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-base font-bold text-white">Add Time</p>
                <p className="text-xs text-[#B0B3B8]">Process time billing for seated players</p>
              </div>
              <ChevronDown className="w-5 h-5 text-[#B0B3B8] -rotate-90" />
            </button>

            {/* 3. Update Membership */}
            <button onClick={() => router.push('/commander/membership-plans')}
              className="w-full bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4 flex items-center gap-4 active:bg-[#3A3B3C]">
              <div className="w-12 h-12 rounded-xl bg-[#8B5CF6]/15 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-[#8B5CF6]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-base font-bold text-white">Update Membership</p>
                <p className="text-xs text-[#B0B3B8]">Renew or change membership plans</p>
              </div>
              <ChevronDown className="w-5 h-5 text-[#B0B3B8] -rotate-90" />
            </button>

            {/* Quick Cash Transaction (Walk-up) */}
            <div className="pt-1">
              <p className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Quick Transaction</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => openForm('buy_in')}
                  className="bg-[#31A24C]/10 border border-[#31A24C]/20 rounded-xl p-3 text-center active:bg-[#31A24C]/20">
                  <Plus className="w-5 h-5 text-[#31A24C] mx-auto mb-1" />
                  <p className="text-xs font-bold text-[#31A24C]">Buy-In</p>
                </button>
                <button onClick={() => openForm('add_on')}
                  className="bg-[#1877F2]/10 border border-[#1877F2]/20 rounded-xl p-3 text-center active:bg-[#1877F2]/20">
                  <Coins className="w-5 h-5 text-[#1877F2] mx-auto mb-1" />
                  <p className="text-xs font-bold text-[#1877F2]">Add-On</p>
                </button>
                <button onClick={() => openForm('cash_out')}
                  className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl p-3 text-center active:bg-[#EF4444]/20">
                  <Minus className="w-5 h-5 text-[#EF4444] mx-auto mb-1" />
                  <p className="text-xs font-bold text-[#EF4444]">Cash Out</p>
                </button>
              </div>
            </div>

            {/* Today's Summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-2.5 text-center">
                  <p className="text-sm font-bold text-[#31A24C]">${summary.total_buy_ins?.toLocaleString() || '0'}</p>
                  <p className="text-[9px] text-[#B0B3B8] uppercase">Buy-ins</p>
                </div>
                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-2.5 text-center">
                  <p className="text-sm font-bold text-[#EF4444]">${summary.total_cash_outs?.toLocaleString() || '0'}</p>
                  <p className="text-[9px] text-[#B0B3B8] uppercase">Cash-outs</p>
                </div>
                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-2.5 text-center">
                  <p className={`text-sm font-bold ${(summary.net_drop || 0) >= 0 ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>
                    ${Math.abs(summary.net_drop || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-[#B0B3B8] uppercase">Net Drop</p>
                </div>
              </div>
            )}

            {/* ========== TRANSACTION LOG (Collapsible) ========== */}
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
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tx.type === 'cash_out' ? 'bg-[#EF4444]/15' : 'bg-[#31A24C]/15'}`}>
                          {tx.type === 'cash_out'
                            ? <ArrowUpFromLine className="w-3.5 h-3.5 text-[#EF4444]" />
                            : <ArrowDownToLine className="w-3.5 h-3.5 text-[#31A24C]" />
                          }
                        </div>
                        <div>
                          <p className="text-xs font-medium text-white">{tx.player_name}</p>
                          <p className="text-[10px] text-[#B0B3B8]">
                            {tx.type.replace('_', ' ')} • {tx.payment_method} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${tx.type === 'cash_out' ? 'text-[#EF4444]' : 'text-[#31A24C]'}`}>
                          {tx.type === 'cash_out' ? '-' : '+'}${parseFloat(tx.amount).toLocaleString()}
                        </span>
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
                  <p className="text-sm text-[#B0B3B8]">No transactions today</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== TRANSACTION FORM MODAL ========== */}
        {showForm && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowForm(false)}>
            <div className="bg-[#242526] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">
                  {txType === 'buy_in' ? 'Buy-In' : txType === 'add_on' ? 'Add-On' : 'Cash Out'}
                </h3>
                <button onClick={() => setShowForm(false)} className="text-[#B0B3B8] text-2xl leading-none">&times;</button>
              </div>

              {/* Player info */}
              <div className="bg-[#3A3B3C]/30 rounded-xl p-3 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#B0B3B8]" />
                <span className="text-sm text-white font-medium">{selectedPlayer?.player_name}</span>
                {selectedPlayer?.table_number && (
                  <span className="text-xs text-[#B0B3B8]">Table {selectedPlayer.table_number} Seat {selectedPlayer.seat_number}</span>
                )}
              </div>

              {/* Quick amounts */}
              <div className="flex flex-wrap gap-2 mb-4">
                {QUICK_AMOUNTS.map(qa => (
                  <button key={qa} onClick={() => setAmount(String(qa))}
                    className={`px-4 py-2.5 rounded-lg text-sm font-bold ${amount === String(qa) ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'}`}>
                    ${qa}
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div className="relative mb-4">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="Custom Amount"
                  className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl pl-10 pr-4 py-3 text-white text-lg font-bold outline-none focus:border-[#1877F2]" />
              </div>

              {/* Payment method (buy-in only) */}
              {txType !== 'cash_out' && (
                <div className="flex gap-2 mb-4">
                  {PAYMENT_METHODS.map(pm => (
                    <button key={pm.id} onClick={() => setPayMethod(pm.id)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${payMethod === pm.id ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'}`}>
                      <pm.icon className="w-4 h-4" /> {pm.label}
                    </button>
                  ))}
                </div>
              )}

              {/* PIN Entry */}
              {pinStep ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 justify-center mb-2">
                    <Lock className="w-4 h-4 text-[#F59E0B]" />
                    <span className="text-sm font-bold text-white">Enter Employee PIN</span>
                  </div>
                  <div className="flex justify-center gap-3 mb-3">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className={`w-4 h-4 rounded-full border-2 ${i < pinDigits.length ? 'bg-[#1877F2] border-[#1877F2]' : 'border-[#4A4B4C]'}`} />
                    ))}
                  </div>
                  {pinError && <p className="text-xs text-[#EF4444] text-center">{pinError}</p>}
                  {pinVerifying && <div className="flex justify-center"><Loader2 className="w-5 h-5 text-[#1877F2] animate-spin" /></div>}
                  {!pinVerifying && (
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
              ) : (
                <>
                  {isPinCached() && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#31A24C]/10 mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#31A24C]" />
                        <span className="text-xs text-[#31A24C] font-medium">Verified as {verifiedStaff?.display_name}</span>
                      </div>
                      <button onClick={lockPin} className="text-xs text-[#B0B3B8] flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Lock
                      </button>
                    </div>
                  )}
                  <button onClick={requestPin} disabled={actionLoading || !amount}
                    className={`w-full py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2 ${txType === 'cash_out'
                      ? 'bg-[#EF4444] text-white active:bg-[#DC2626]'
                      : 'bg-[#31A24C] text-white active:bg-[#2B8C42]'
                      } disabled:opacity-50`}>
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      isPinCached()
                        ? <>{txType === 'cash_out' ? <ArrowUpFromLine className="w-5 h-5" /> : <ArrowDownToLine className="w-5 h-5" />}</>
                        : <><Lock className="w-4 h-4 mr-1" />
                          {txType === 'cash_out' ? <ArrowUpFromLine className="w-5 h-5" /> : <ArrowDownToLine className="w-5 h-5" />}</>
                    )}
                    {txType === 'cash_out' ? 'Process Cash Out' : txType === 'add_on' ? 'Process Add-On' : 'Process Buy-In'}
                    {amount ? ` — $${parseFloat(amount).toLocaleString()}` : ''}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </CommanderLayout>
  );
}
