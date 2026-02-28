/**
 * Texas Time Billing
 * /commander/time-billing
 * Session-based time charges for cash games (Texas cardroom model)
 * - Start/stop player sessions with seat assignment
 * - Auto-calculate charges based on game rate and duration
 * - Track payments, comps, adjustments
 * - Session history and reporting
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  Clock, DollarSign, Play, Square, Users, Search,
  Plus, Minus, ChevronDown, Loader2, RefreshCw, CheckCircle2,
  AlertTriangle, X, Timer, Receipt, Settings, Package, Save, Trash2
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

function formatDuration(startTime) {
  if (!startTime) return '0:00';
  const mins = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(n) { return '$' + (n || 0).toFixed(2); }

function calculateCharge(startTime, ratePerHour) {
  if (!startTime || !ratePerHour) return 0;
  const hours = (Date.now() - new Date(startTime).getTime()) / 3600000;
  const halfHours = Math.ceil(hours * 2);
  return (halfHours / 2) * ratePerHour;
}

export default function TimeBilling() {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingDirty, setPricingDirty] = useState(false);
  const [pricing, setPricing] = useState({
    time_billing_rate: 12,
    auto_comp_rate: 1,
    bulk_time_packages: []
  });

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;
  const getVenueId = () => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id || ''; } catch { return ''; }
  };

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const venueId = getVenueId();
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };

      // Fetch tables to know which are active
      const tabRes = await fetch(`/api/commander/tables?venue_id=${venueId}`, { headers });
      const tabJson = await tabRes.json();
      const tablesArr = tabJson.success
        ? (Array.isArray(tabJson.data) ? tabJson.data : tabJson.data?.tables || [])
        : [];
      setTables(tablesArr);

      // Fetch active sessions from ALL tables (unified commander_table_sessions)
      const activeTables = tablesArr.filter(t => t.status === 'in_use');
      const allSessions = [];

      await Promise.all(activeTables.map(async (t) => {
        const tNum = t.table_number || t.number;
        try {
          const sRes = await fetch(`/api/commander/dealer/sessions?table=${tNum}`, { headers });
          const sJson = await sRes.json();
          if (sJson.success && sJson.data) {
            sJson.data.forEach(s => allSessions.push({
              ...s,
              id: s.session_id,
              status: s.is_expired ? 'expired' : 'active',
              started_at: s.started_at,
              rate_per_hour: t.rate_per_hour || 12,
            }));
          }
        } catch { /* non-fatal */ }
      }));

      // Also fetch completed/ended sessions for history view
      if (filter === 'completed') {
        try {
          const histRes = await fetch(`/api/commander/time-billing/sessions?venue_id=${venueId}`, { headers });
          const histJson = await histRes.json();
          if (histJson.success) {
            const completed = (histJson.data || []).filter(s => s.status === 'completed');
            setSessions([...allSessions, ...completed]);
            return;
          }
        } catch { /* fall through */ }
      }

      setSessions(allSessions);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 15000); return () => clearInterval(i); }, [fetchData]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);

  // Load pricing settings
  useEffect(() => {
    const loadPricing = async () => {
      try {
        const token = getToken();
        const staffSession = localStorage.getItem('commander_staff') || '';
        const res = await fetch('/api/commander/settings', {
          headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession }
        });
        const json = await res.json();
        if (json.success && json.data) {
          setPricing(prev => ({
            time_billing_rate: json.data.time_billing_rate ?? prev.time_billing_rate,
            auto_comp_rate: json.data.auto_comp_rate ?? prev.auto_comp_rate,
            bulk_time_packages: json.data.bulk_time_packages ?? prev.bulk_time_packages
          }));
        }
      } catch { /* non-fatal */ }
    };
    loadPricing();
  }, []);

  // Save pricing settings
  const savePricing = async () => {
    setPricingSaving(true);
    try {
      const token = getToken();
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch('/api/commander/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({
          time_billing_rate: pricing.time_billing_rate,
          auto_comp_rate: pricing.auto_comp_rate,
          bulk_time_packages: pricing.bulk_time_packages
        })
      });
      const json = await res.json();
      if (json.success) {
        setPricingDirty(false);
      }
    } catch (err) { console.error(err); }
    finally { setPricingSaving(false); }
  };

  const stopSession = async (sessionId) => {
    setStopping(sessionId);
    try {
      const token = getToken();
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch(`/api/commander/dealer/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession }
      });
      const json = await res.json();
      // Print time billing receipt
      if (json.success && json.data) {
        const session = sessions.find(s => s.id === sessionId || s.session_id === sessionId);
        if (session) printTimeBillingReceipt({
          ...session,
          duration_minutes: json.data.elapsed_minutes,
          total_charge: calculateCharge(session.started_at, session.rate_per_hour || 12),
        });
      }
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setStopping(null); }
  };

  const printTimeBillingReceipt = (session) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    const hours = session.duration_minutes ? (session.duration_minutes / 60).toFixed(1) : '0';
    const charge = parseFloat(session.total_charge || 0);
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
  <div class="center sm">Time Billing Receipt</div>
  <div class="divider"></div>
  <div class="row sm"><span>Player:</span><span class="bold">${session.player_name}</span></div>
  <div class="row sm"><span>Table/Seat:</span><span class="bold">T${session.table_number || '-'} S${session.seat_number || '-'}</span></div>
  <div class="divider"></div>
  <div class="row sm"><span>Duration:</span><span class="bold">${hours} hrs</span></div>
  <div class="row sm"><span>Rate:</span><span>$${parseFloat(session.rate_per_hour || 12).toFixed(2)}/hr</span></div>
  <div class="divider"></div>
  <div class="center bold big">$${charge.toFixed(2)}</div>
  <div class="center sm">AMOUNT DUE</div>
  <div class="divider"></div>
  <div class="sm center" style="opacity:0.6">${new Date().toLocaleString()}</div>
  <div class="sm center" style="opacity:0.4;margin-top:1mm">Smarter.Poker</div>
</div></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const recordPayment = async () => {
    if (!payModal || !payAmount) return;
    try {
      const token = getToken();
      const staffSession = localStorage.getItem('commander_staff') || '';
      await fetch(`/api/commander/time-billing/sessions/${payModal.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ amount: parseFloat(payAmount) })
      });
      setPayModal(null); setPayAmount('');
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const activeSessions = sessions.filter(s => s.status === 'active');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const displaySessions = filter === 'active' ? activeSessions : completedSessions;
  const filtered = displaySessions.filter(s =>
    !search || s.player_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalActive = activeSessions.reduce((sum, s) =>
    sum + calculateCharge(s.started_at, s.rate_per_hour), 0);
  const totalCollected = sessions.reduce((sum, s) => sum + (s.amount_paid || 0), 0);

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  return (
    <CommanderLayout title="Time Billing" backHref="/commander/dashboard">
      <SEOHead
        title="Commander — Time Billing"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Sub-header with stats and actions */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-[#B0B3B8]">{activeSessions.length} active sessions</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* Pricing & Packages */}
        <div className="px-4 py-3 space-y-3">
          {/* Hourly Rate + Auto-Comp */}
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-[#1877F2]" />
              <h3 className="text-sm font-bold text-white">Pricing</h3>
              <div className="flex-1" />
              {pricingDirty && (
                <button onClick={savePricing} disabled={pricingSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1877F2] text-white text-xs font-medium disabled:opacity-50">
                  {pricingSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#B0B3B8] block mb-1">Time Rate ($/hour)</label>
                <input type="number" value={pricing.time_billing_rate} min={1} max={100}
                  onChange={e => { setPricing(p => ({ ...p, time_billing_rate: parseInt(e.target.value) || 1 })); setPricingDirty(true); }}
                  className="w-full px-3 py-2 bg-[#3A3B3C] border border-[#4A4B4C] rounded-lg text-white text-lg font-mono text-center focus:outline-none focus:border-[#1877F2]" />
              </div>
              <div>
                <label className="text-[10px] text-[#B0B3B8] block mb-1">Auto-Comp ($/hour played)</label>
                <input type="number" value={pricing.auto_comp_rate} min={0} max={25}
                  onChange={e => { setPricing(p => ({ ...p, auto_comp_rate: parseFloat(e.target.value) || 0 })); setPricingDirty(true); }}
                  className="w-full px-3 py-2 bg-[#3A3B3C] border border-[#4A4B4C] rounded-lg text-white text-lg font-mono text-center focus:outline-none focus:border-[#1877F2]" />
              </div>
            </div>
          </div>

          {/* Bulk Time Packages */}
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-[#F59E0B]" />
              <h3 className="text-sm font-bold text-white">Bulk Time Packages</h3>
              <p className="text-[10px] text-[#B0B3B8]">(deals for bulk purchases)</p>
              <div className="flex-1" />
              {pricingDirty && (
                <button onClick={savePricing} disabled={pricingSaving}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1877F2] text-white text-xs font-medium disabled:opacity-50 mr-1">
                  {pricingSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
              )}
              <button onClick={() => {
                setPricing(p => ({
                  ...p,
                  bulk_time_packages: [...(p.bulk_time_packages || []), { name: '', hours: 5, price: 50 }]
                }));
                setPricingDirty(true);
              }} className="px-2.5 py-1 rounded-lg bg-[#3A3B3C] text-[#1877F2] text-xs font-medium">
                + Add
              </button>
            </div>

            {(!pricing.bulk_time_packages || pricing.bulk_time_packages.length === 0) ? (
              <p className="text-xs text-[#64748B] text-center py-3">No bulk packages — click + Add to create a deal</p>
            ) : (
              <div className="space-y-3">
                {pricing.bulk_time_packages.map((pkg, idx) => {
                  const perHr = pkg.hours > 0 ? (pkg.price / pkg.hours) : 0;
                  const isDiscount = perHr > 0 && perHr < pricing.time_billing_rate;
                  return (
                    <div key={idx} className="bg-[#18191A] rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <input type="text" value={pkg.name} placeholder={`e.g. ${pkg.hours || 5}-Hour Deal`}
                          onChange={e => {
                            const pkgs = [...pricing.bulk_time_packages];
                            pkgs[idx] = { ...pkgs[idx], name: e.target.value };
                            setPricing(p => ({ ...p, bulk_time_packages: pkgs }));
                            setPricingDirty(true);
                          }}
                          className="flex-1 px-2 py-1.5 bg-[#3A3B3C] border border-[#4A4B4C] rounded text-white text-sm focus:outline-none focus:border-[#1877F2]" />
                        <button onClick={() => {
                          setPricing(p => ({
                            ...p,
                            bulk_time_packages: p.bulk_time_packages.filter((_, i) => i !== idx)
                          }));
                          setPricingDirty(true);
                        }} className="p-1.5 text-[#EF4444] hover:bg-[#EF4444]/10 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] text-[#64748B] block mb-0.5">Hours</label>
                          <input type="number" value={pkg.hours} min={1} max={100}
                            onChange={e => {
                              const pkgs = [...pricing.bulk_time_packages];
                              pkgs[idx] = { ...pkgs[idx], hours: parseInt(e.target.value) || 1 };
                              setPricing(p => ({ ...p, bulk_time_packages: pkgs }));
                              setPricingDirty(true);
                            }}
                            className="w-full px-2 py-1.5 bg-[#3A3B3C] border border-[#4A4B4C] rounded text-white text-sm text-center focus:outline-none focus:border-[#1877F2]" />
                        </div>
                        <div>
                          <label className="text-[9px] text-[#64748B] block mb-0.5">Price ($)</label>
                          <input type="number" value={pkg.price} min={0} step={0.01}
                            onChange={e => {
                              const pkgs = [...pricing.bulk_time_packages];
                              pkgs[idx] = { ...pkgs[idx], price: parseFloat(e.target.value) || 0 };
                              setPricing(p => ({ ...p, bulk_time_packages: pkgs }));
                              setPricingDirty(true);
                            }}
                            className="w-full px-2 py-1.5 bg-[#3A3B3C] border border-[#4A4B4C] rounded text-white text-sm text-center focus:outline-none focus:border-[#1877F2]" />
                        </div>
                        <div>
                          <label className="text-[9px] text-[#64748B] block mb-0.5">Eff. Rate</label>
                          <div className={`px-2 py-1.5 rounded text-sm text-center font-mono ${isDiscount ? 'bg-[#31A24C]/10 text-[#31A24C] font-bold' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                            ${perHr.toFixed(2)}/hr
                          </div>
                        </div>
                      </div>
                      {isDiscount && (
                        <p className="text-[10px] text-[#31A24C] mt-1.5">
                          Save ${((pricing.time_billing_rate - perHr) * pkg.hours).toFixed(2)} vs standard rate
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Search + Filter */}
        <div className="px-4 pb-2 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B3B8]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search Players..." className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[#E4E6EB] placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]" />
          </div>
          <button onClick={() => setFilter(filter === 'active' ? 'completed' : 'active')}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium ${filter === 'active' ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'
              }`}>
            {filter === 'active' ? 'Active' : 'History'}
          </button>
        </div>

        {/* Session List */}
        <div className="px-4 space-y-2 pb-4">
          {filtered.map(session => {
            const charge = session.status === 'active'
              ? calculateCharge(session.started_at, session.rate_per_hour)
              : (session.total_charge || 0);
            const paid = session.amount_paid || 0;
            const balance = charge - paid;

            return (
              <div key={session.id} className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
                <div className="flex items-center gap-3">
                  {session.status === 'active' ? (
                    <div className="w-10 h-10 rounded-full bg-[#31A24C]/20 flex items-center justify-center">
                      <Timer className="w-5 h-5 text-[#31A24C]" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#3A3B3C] flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-[#B0B3B8]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-white truncate">{session.player_name}</p>
                    <p className="text-xs text-[#B0B3B8]">
                      T{session.table_number || '?'}-S{session.seat_number || '?'} —
                      {formatDuration(session.started_at)}
                      {session.time_remaining !== undefined && session.time_remaining !== null && (
                        <> — <span className={`font-mono font-bold ${session.time_remaining <= 0 ? 'text-[#EF4444]' : session.time_remaining <= 300 ? 'text-[#EF4444]' : session.time_remaining <= 900 ? 'text-[#F59E0B]' : 'text-[#31A24C]'}`}>
                          {session.time_remaining <= 0 ? 'EXPIRED' : `${Math.floor(session.time_remaining / 60)}m left`}
                        </span></>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-[#F59E0B]">{formatMoney(charge)}</p>
                    {paid > 0 && <p className="text-xs text-[#31A24C]">Paid {formatMoney(paid)}</p>}
                    {balance > 0.01 && session.status === 'completed' && (
                      <p className="text-xs text-[#EF4444]">Owes {formatMoney(balance)}</p>
                    )}
                  </div>
                </div>

                {session.status === 'active' && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setPayModal(session); setPayAmount(charge.toFixed(2)); }}
                      className="flex-1 py-2.5 rounded-lg bg-[#31A24C]/10 text-[#31A24C] text-sm font-medium flex items-center justify-center gap-1.5 active:bg-[#31A24C]/20">
                      <DollarSign className="w-4 h-4" /> Collect
                    </button>
                    <button onClick={() => stopSession(session.id)}
                      disabled={stopping === session.id}
                      className="flex-1 py-2.5 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-sm font-medium flex items-center justify-center gap-1.5 active:bg-[#EF4444]/20 disabled:opacity-50">
                      {stopping === session.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Square className="w-4 h-4" />
                      }
                      End Session
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Timer className="w-10 h-10 text-[#3A3B3C] mx-auto mb-2" />
              <p className="text-[#B0B3B8]">{filter === 'active' ? 'No active sessions' : 'No session history'}</p>
            </div>
          )}
        </div>


        {/* Payment Modal */}
        {payModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setPayModal(null)}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white">Collect Payment</h3>
              <p className="text-sm text-[#B0B3B8]">{payModal.player_name}</p>
              <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                placeholder="Amount" step="0.01" autoFocus
                className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-2xl font-mono text-center focus:outline-none focus:border-[#1877F2]" />
              <div className="flex gap-3">
                <button onClick={() => setPayModal(null)}
                  className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium">Cancel</button>
                <button onClick={recordPayment} disabled={!payAmount}
                  className="flex-1 py-3 rounded-xl bg-[#31A24C] text-white font-medium disabled:opacity-50">
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
`}</style>
    </CommanderLayout>
  );
}
