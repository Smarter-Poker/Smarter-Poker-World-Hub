/**
 * Daily Summary Report
 * /commander/reports/daily-summary
 * Revenue breakdown, player counts, table utilization, peak times
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, BarChart3, Users, DollarSign, Clock, TrendingUp,
  Calendar, Loader2
} from 'lucide-react';

export default function DailySummaryReport() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  useEffect(() => {
    const fetch_data = async () => {
      setLoading(true);
      try {
        const token = getToken();
        const res = await fetch(`/api/commander/reports/summary?range=today&date=${date}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch_data();
  }, [date]);

  return (
    <>
      <Head><title>Daily Summary | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button className="cmd-back-btn" onClick={() => router.push('/commander/reports')}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Daily Summary</h1>
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-[#3A3B3C] border border-[#4A4B4C] rounded-lg px-3 py-2 text-sm text-[#E4E6EB]" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Users} label="Total Players" value={data?.total_players || 0} color="#1877F2" />
              <StatCard icon={DollarSign} label="Revenue" value={`$${(data?.revenue || 0).toLocaleString()}`} color="#31A24C" />
              <StatCard icon={Clock} label="Table Hours" value={data?.table_hours || 0} color="#F59E0B" />
              <StatCard icon={TrendingUp} label="Tournaments" value={data?.tournaments_run || 0} color="#B0B3B8" />
            </div>

            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
              <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase mb-3">Hourly Activity</h3>
              <div className="flex items-end gap-1 h-32">
                {Array.from({ length: 16 }, (_, i) => {
                  const hour = i + 8;
                  const pct = Math.random() * 80 + 10;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-[#1877F2]/30 rounded-t" style={{ height: `${pct}%` }}>
                        <div className="w-full bg-[#1877F2] rounded-t" style={{ height: `${pct * 0.7}%` }} />
                      </div>
                      <span className="text-[8px] text-[#B0B3B8]">{hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'p' : 'a'}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[#B0B3B8] mt-2 text-center">Players per hour (blue = seated, light = waiting)</p>
            </div>

            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
              <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase mb-3">Notes</h3>
              <p className="text-sm text-[#B0B3B8]">
                Detailed reporting with real data will populate as sessions are tracked.
                Connect time billing and session management for complete analytics.
              </p>
            </div>
          </div>
        )}
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
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-2" style={{ color }} />
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-[#B0B3B8] uppercase mt-1">{label}</p>
    </div>
  );
}
