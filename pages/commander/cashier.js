/**
 * Cashier - Buy-In / Cash-Out Tracking
 * /commander/cashier
 * Process chip purchases and redemptions for active cash game players
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  DollarSign, Plus, Minus, Loader2, RefreshCw, Users,
  CheckCircle2, AlertTriangle, Banknote, CreditCard, ArrowDownToLine,
  ArrowUpFromLine, Coins, Receipt
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const QUICK_AMOUNTS = [100, 200, 300, 500, 1000];
const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'card', label: 'Card', icon: CreditCard },
];

export default function Cashier() {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState(null);
  const [message, setMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Transaction form
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [txType, setTxType] = useState('buy_in');
  const [amount, setAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [showForm, setShowForm] = useState(false);

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

      // Get active sessions
      const sessRes = await fetch(`/api/commander/dealer/sessions?venue_id=${venueId}&status=active`, { headers });
      const sessJson = await sessRes.json();
      const activeSessions = sessJson.success ? (sessJson.data || []) : [];

      // Get today's cash transactions
      const today = new Date().toISOString().split('T')[0];
      const txRes = await fetch(`/api/commander/cashier?venue_id=${venueId}&date=${today}&limit=200`, { headers });
      const txJson = await txRes.json();

      setSessions(activeSessions);
      setTransactions(txJson.data || []);
      setSummary(txJson.summary || null);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openForm = (session, type) => {
    setSelectedPlayer(session);
    setTxType(type);
    setAmount('');
    setPayMethod('cash');
    setShowForm(true);
  };

  const submitTransaction = async () => {
    if (!amount || parseFloat(amount) <= 0) {
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
          session_id: selectedPlayer?.id,
          player_name: selectedPlayer?.player_name || 'Walk-up',
          table_number: selectedPlayer?.table_number,
          seat_number: selectedPlayer?.seat_number,
          type: txType,
          amount: parseFloat(amount),
          payment_method: payMethod
        })
      });
      const json = await res.json();
      if (json.success) {
        const label = txType === 'buy_in' ? 'Buy-in' : txType === 'add_on' ? 'Add-on' : 'Cash-out';
        setMessage({ type: 'success', text: `${label} $${parseFloat(amount).toLocaleString()} — ${selectedPlayer?.player_name || 'Walk-up'}` });
        setShowForm(false);
        // Auto-print receipt
        printReceipt({
          type: txType,
          player_name: selectedPlayer?.player_name || 'Walk-up',
          table_number: selectedPlayer?.table_number,
          seat_number: selectedPlayer?.seat_number,
          amount: parseFloat(amount),
          payment_method: payMethod,
          created_at: new Date().toISOString()
        });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error || 'Transaction failed' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(false); }
  };

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 3000); return () => clearTimeout(t); }
  }, [message]);

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

  // Group sessions by table
  const tables = {};
  sessions.forEach(s => {
    const tn = s.table_number || 0;
    if (!tables[tn]) tables[tn] = [];
    tables[tn].push(s);
  });

  // Get player tx totals from today's transactions
  const playerTotals = {};
  transactions.forEach(t => {
    const key = t.session_id || t.player_name;
    if (!playerTotals[key]) playerTotals[key] = { bought: 0, cashed: 0 };
    if (t.type === 'buy_in' || t.type === 'add_on') playerTotals[key].bought += parseFloat(t.amount);
    if (t.type === 'cash_out') playerTotals[key].cashed += parseFloat(t.amount);
  });

  return (
    <CommanderLayout title="Cashier" backHref="/commander/dashboard">
      <SEOHead
        title="Commander — Cashier Operations"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        {/* Sub-header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-[#B0B3B8]">{sessions.length} active players</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]"><RefreshCw className="w-5 h-5 text-[#B0B3B8]" /></button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-4 mt-3 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium ${message.type === 'success' ? 'bg-[#31A24C]/15 text-[#31A24C]' : 'bg-[#EF4444]/15 text-[#EF4444]'
            }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {/* Today's Summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
                  <ArrowDownToLine className="w-5 h-5 text-[#31A24C] mx-auto mb-1" />
                  <p className="text-lg font-bold text-[#31A24C]">${summary.total_buy_ins.toLocaleString()}</p>
                  <p className="text-[10px] text-[#B0B3B8] uppercase">Buy-ins ({summary.buy_in_count})</p>
                </div>
                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
                  <ArrowUpFromLine className="w-5 h-5 text-[#EF4444] mx-auto mb-1" />
                  <p className="text-lg font-bold text-[#EF4444]">${summary.total_cash_outs.toLocaleString()}</p>
                  <p className="text-[10px] text-[#B0B3B8] uppercase">Cash-outs ({summary.cash_out_count})</p>
                </div>
                <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
                  <Coins className="w-5 h-5 text-[#1877F2] mx-auto mb-1" />
                  <p className={`text-lg font-bold ${summary.net_drop >= 0 ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>
                    ${Math.abs(summary.net_drop).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-[#B0B3B8] uppercase">Net Drop</p>
                </div>
              </div>
            )}

            {/* Walk-up transaction */}
            <button onClick={() => { setSelectedPlayer({ player_name: 'Walk-up', table_number: null, seat_number: null, id: null }); setTxType('buy_in'); setAmount(''); setPayMethod('cash'); setShowForm(true); }}
              className="w-full bg-[#242526] border border-[#3A3B3C] rounded-xl p-4 flex items-center gap-3 active:bg-[#3A3B3C]">
              <div className="w-10 h-10 rounded-full bg-[#1877F2]/15 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-[#1877F2]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">Walk-up Transaction</p>
                <p className="text-xs text-[#B0B3B8]">Buy-In Or Cash-Out Without A Seat</p>
              </div>
            </button>

            {/* Active Tables */}
            {Object.entries(tables).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([tableNum, tableSessions]) => (
              <div key={tableNum} className="bg-[#242526] border border-[#3A3B3C] rounded-2xl overflow-hidden">
                <div className="bg-[#3A3B3C]/30 px-4 py-2.5 border-b border-[#3A3B3C] flex items-center justify-between">
                  <p className="text-sm font-bold text-white">Table {tableNum}</p>
                  <span className="text-xs text-[#B0B3B8]">{tableSessions.length} players</span>
                </div>
                <div className="divide-y divide-[#3A3B3C]">
                  {tableSessions.sort((a, b) => (a.seat_number || 0) - (b.seat_number || 0)).map(session => {
                    const totals = playerTotals[session.id] || { bought: 0, cashed: 0 };
                    return (
                      <>
                        <div key={session.id} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[#3A3B3C] text-xs font-bold text-white flex items-center justify-center">
                                {session.seat_number || '?'}
                              </span>
                              <span className="text-sm font-medium text-white">{session.player_name}</span>
                            </div>
                            {totals.bought > 0 && (
                              <span className="text-xs text-[#B0B3B8]">
                                In: ${totals.bought.toLocaleString()}{totals.cashed > 0 ? ` / Out: $${totals.cashed.toLocaleString()}` : ''}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => openForm(session, 'buy_in')}
                              className="flex-1 py-2 rounded-lg bg-[#31A24C]/10 text-[#31A24C] text-xs font-bold flex items-center justify-center gap-1 active:bg-[#31A24C]/20">
                              <Plus className="w-3 h-3" /> Buy-In
                            </button>
                            <button onClick={() => openForm(session, 'add_on')}
                              className="flex-1 py-2 rounded-lg bg-[#1877F2]/10 text-[#1877F2] text-xs font-bold flex items-center justify-center gap-1 active:bg-[#1877F2]/20">
                              <Plus className="w-3 h-3" /> Add-On
                            </button>
                            <button onClick={() => openForm(session, 'cash_out')}
                              className="flex-1 py-2 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-xs font-bold flex items-center justify-center gap-1 active:bg-[#EF4444]/20">
                              <Minus className="w-3 h-3" /> Cash Out
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })}
                </div>
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-8 text-center">
                <Users className="w-10 h-10 text-[#3A3B3C] mx-auto mb-3" />
                <p className="text-[#B0B3B8] text-sm">No Active Sessions</p>
                <p className="text-[#6A6B6D] text-xs mt-1">Players Need To Be Seated At A Table First</p>
              </div>
            )}

            {/* Recent Transactions */}
            {transactions.length > 0 && (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#3A3B3C] flex items-center justify-between">
                  <p className="text-sm font-bold text-white">Today's Transactions</p>
                  <span className="text-xs text-[#B0B3B8]">{transactions.length} total</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-[#3A3B3C]">
                  {transactions.slice(0, 30).map(tx => (
                    <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tx.type === 'cash_out' ? 'bg-[#EF4444]/15' : 'bg-[#31A24C]/15'
                          }`}>
                          {tx.type === 'cash_out'
                            ? <ArrowUpFromLine className="w-3.5 h-3.5 text-[#EF4444]" />
                            : <ArrowDownToLine className="w-3.5 h-3.5 text-[#31A24C]" />
                          }
                        </div>
                        <div>
                          <p className="text-xs font-medium text-white">{tx.player_name}</p>
                          <p className="text-[10px] text-[#B0B3B8]">
                            {tx.type.replace('_', ' ')} • T{tx.table_number || '-'} S{tx.seat_number || '-'} • {tx.payment_method}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${tx.type === 'cash_out' ? 'text-[#EF4444]' : 'text-[#31A24C]'}`}>
                        {tx.type === 'cash_out' ? '-' : '+'}${parseFloat(tx.amount).toLocaleString()}
                      </span>
                      <button onClick={() => printReceipt(tx)} className="ml-2 w-7 h-7 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]" title="Print Receipt">
                        <Receipt className="w-3.5 h-3.5 text-[#B0B3B8]" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transaction Form Modal */}
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
                    className={`px-4 py-2.5 rounded-lg text-sm font-bold ${amount === String(qa) ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'
                      }`}>
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
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${payMethod === pm.id ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
                        }`}>
                      <pm.icon className="w-4 h-4" /> {pm.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Submit */}
              <button onClick={submitTransaction} disabled={actionLoading || !amount}
                className={`w-full py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2 ${txType === 'cash_out'
                  ? 'bg-[#EF4444] text-white active:bg-[#DC2626]'
                  : 'bg-[#31A24C] text-white active:bg-[#2B8C42]'
                  } disabled:opacity-50`}>
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  txType === 'cash_out' ? <ArrowUpFromLine className="w-5 h-5" /> : <ArrowDownToLine className="w-5 h-5" />
                )}
                {txType === 'cash_out' ? 'Process Cash Out' : txType === 'add_on' ? 'Process Add-On' : 'Process Buy-In'}
                {amount ? ` — $${parseFloat(amount).toLocaleString()}` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
`}</style>
    </CommanderLayout>
  );
}
