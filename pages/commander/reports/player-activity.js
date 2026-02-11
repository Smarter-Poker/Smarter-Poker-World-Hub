/**
 * Player Activity Report
 * /commander/reports/player-activity
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Users, Clock, TrendingUp, Star, Loader2 } from 'lucide-react';

export default function PlayerActivity() {
  const router = useRouter();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
        const res = await fetch('/api/commander/members?sort=visits&limit=50', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) setPlayers(json.data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchPlayers();
  }, []);

  return (
    <>
      <Head><title>Player Activity | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/commander/reports')}
            className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
            <ArrowLeft className="w-5 h-5 text-[#E4E6EB]" />
          </button>
          <h1 className="text-lg font-bold text-white">Player Activity</h1>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 text-center">
              <p className="text-lg font-bold text-white">{players.length}</p>
              <p className="text-[10px] text-[#B0B3B8] uppercase">Total Members</p>
            </div>
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 text-center">
              <p className="text-lg font-bold text-[#31A24C]">{players.filter(p => p.visit_count > 5).length}</p>
              <p className="text-[10px] text-[#B0B3B8] uppercase">Regulars</p>
            </div>
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 text-center">
              <p className="text-lg font-bold text-[#1877F2]">{players.filter(p => {
                if (!p.last_checkin) return false;
                return (Date.now() - new Date(p.last_checkin).getTime()) < 7 * 86400000;
              }).length}</p>
              <p className="text-[10px] text-[#B0B3B8] uppercase">This Week</p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[#1877F2] animate-spin mx-auto" /></div>
          ) : (
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] overflow-hidden">
              <div className="px-4 py-2 bg-[#3A3B3C]/30 flex text-xs text-[#B0B3B8] uppercase">
                <span className="flex-1">Player</span>
                <span className="w-16 text-center">Visits</span>
                <span className="w-24 text-right">Last Seen</span>
              </div>
              {players.slice(0, 30).map(p => (
                <div key={p.id} className="px-4 py-3 flex items-center border-t border-[#3A3B3C]">
                  <span className="flex-1 text-sm text-[#E4E6EB] truncate">
                    {p.name || `${p.first_name || ''} ${p.last_name || ''}`}
                  </span>
                  <span className="w-16 text-center text-sm font-medium text-white">{p.visit_count || 0}</span>
                  <span className="w-24 text-right text-xs text-[#B0B3B8]">
                    {p.last_checkin ? new Date(p.last_checkin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}
                  </span>
                </div>
              ))}
              {players.length === 0 && (
                <div className="py-8 text-center text-[#B0B3B8] text-sm">No player data yet</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
