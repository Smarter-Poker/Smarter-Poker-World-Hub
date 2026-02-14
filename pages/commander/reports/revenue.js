/**
 * Revenue Report
 * /commander/reports/revenue
 * Breakdown: time billing, tournament fees, comp costs, net revenue
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, DollarSign, TrendingUp, Trophy, Clock, Gift,
  Loader2, RefreshCw
} from 'lucide-react';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 Days' },
  { value: 'month', label: '30 Days' },
  { value: 'quarter', label: '90 Days' },
];

function fmt(n) { return '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function RevenueReport() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month');
  const [venueId, setVenueId] = useState(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('commander_staff') || '{}'); if (s.venue_id) setVenueId(s.venue_id); } catch {}
  }, []);

  const getToken = () => localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/commander/reports/revenue?venue_id=${venueId}&range=${range}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const t = data?.totals || {};
  const tb = data?.time_billing || {};
  const tn = data?.tournaments || {};
  const maxDaily = Math.max(...(data?.daily_chart || []).map(d => d.time_revenue), 1);

  return (
    <>
      <Head><title>Revenue Report | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/commander/reports')} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <img src="/images/btn-back.png" alt="Back" style={{ height: 44, objectFit: 'contain' }} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Revenue Report</h1>
            <p className="text-xs text-[#B0B3B8]">{RANGES.find(r => r.value === range)?.label}</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]"><RefreshCw className="w-5 h-5 text-[#B0B3B8]" /></button>
        </div>

        <div className="px-4 py-3 flex gap-2">
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold ${range === r.value ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'}`}>{r.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="px-4 pb-6 space-y-4">
            {/* Total */}
            <div className="bg-gradient-to-br from-[#1877F2]/20 to-[#31A24C]/10 border border-[#1877F2]/30 rounded-2xl p-5 text-center">
              <p className="text-xs text-[#B0B3B8] uppercase tracking-wider mb-1">Total Revenue</p>
              <p className="text-4xl font-bold text-white">{fmt(t.total_revenue)}</p>
              <p className="text-sm text-[#B0B3B8] mt-1">Net after comps: {fmt(t.net_after_comps)}</p>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Time Billing', value: tb.revenue, sub: `${tb.sessions || 0} sessions`, sub2: `${Math.round((tb.total_minutes || 0) / 60)}h played`, icon: Clock, color: '#31A24C' },
                { label: 'Tournament Fees', value: tn.fees, sub: `${tn.count || 0} tournaments`, sub2: `${tn.entries || 0} entries`, icon: Trophy, color: '#F59E0B' },
                { label: 'Prize Pools', value: tn.prize_pools, sub: 'Buy-ins collected', sub2: null, icon: DollarSign, color: '#A855F7' },
                { label: 'Comps Cost', value: t.comps_redeemed, sub: `${fmt(t.comps_earned)} earned`, sub2: `${fmt(t.comps_redeemed)} redeemed`, icon: Gift, color: '#EF4444', neg: true },
              ].map((c, i) => (
                <div key={i} className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: c.color + '15' }}>
                      <c.icon className="w-4 h-4" style={{ color: c.color }} />
                    </div>
                    <span className="text-xs text-[#B0B3B8]">{c.label}</span>
                  </div>
                  <p className="text-xl font-bold" style={{ color: c.color }}>{c.neg ? '-' : ''}{fmt(c.value)}</p>
                  <p className="text-xs text-[#B0B3B8] mt-1">{c.sub}</p>
                  {c.sub2 && <p className="text-xs text-[#6A6B6D]">{c.sub2}</p>}
                </div>
              ))}
            </div>

            {/* Time billing detail */}
            {tb.sessions > 0 && (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">Time Billing</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-lg font-bold text-white">{tb.sessions}</p><p className="text-xs text-[#B0B3B8]">Sessions</p></div>
                  <div><p className="text-lg font-bold text-white">{Math.round((tb.total_minutes || 0) / 60)}h</p><p className="text-xs text-[#B0B3B8]">Total Hours</p></div>
                  <div><p className="text-lg font-bold text-white">{fmt(tb.avg_per_session)}</p><p className="text-xs text-[#B0B3B8]">Avg/Session</p></div>
                </div>
              </div>
            )}

            {/* Tournaments */}
            {(tn.tournaments || []).length > 0 && (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">Tournaments</h3>
                <div className="space-y-2">
                  {tn.tournaments.map(t => (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-[#3A3B3C]/30 rounded-lg">
                      <div><p className="text-sm font-medium text-white">{t.name}</p><p className="text-xs text-[#B0B3B8]">${t.buyin} + ${t.fee} fee</p></div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${t.status === 'completed' ? 'bg-[#31A24C]/15 text-[#31A24C]' : t.status === 'running' ? 'bg-[#1877F2]/15 text-[#1877F2]' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily bars */}
            {(data?.daily_chart || []).length > 0 && (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">Daily Time Revenue</h3>
                <div className="space-y-1.5">
                  {data.daily_chart.slice(-14).map(d => (
                    <div key={d.date} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#B0B3B8] w-14 shrink-0 font-mono">{d.date.slice(5)}</span>
                      <div className="flex-1 h-5 bg-[#3A3B3C]/30 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#31A24C]" style={{ width: `${(d.time_revenue / maxDaily) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-[#B0B3B8] w-14 text-right font-mono">{fmt(d.time_revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
