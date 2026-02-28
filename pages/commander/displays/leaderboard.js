/**
 * Leaderboard TV Display
 * /commander/displays/leaderboard
 * 
 * Full-screen TV display showing player leaderboards.
 * Rotates through different leaderboard types:
 * - Points leaders (monthly/annual)
 * - Most visits
 * - Tournament wins
 * - Biggest winners (optional)
 * 
 * Auto-scrolls, wake lock, fullscreen.
 */
import { useState, useEffect, useRef } from 'react';

import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync } from '../../../src/lib/commander/useCommanderSync';
import DealerTicker from '../../../src/components/commander/shared/DealerTicker';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function LeaderboardDisplay() {
  const [leaderboards, setLeaderboards] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef(null);

  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    const rotate = setInterval(() => {
      setActiveIdx(prev => leaderboards.length > 1 ? (prev + 1) % leaderboards.length : 0);
    }, 15000);
    return () => { clearInterval(poll); clearInterval(clock); clearInterval(rotate); };
  }, [leaderboards.length]);

  // Commander Data Bus — instant sync when members change
  useCommanderSync('', fetchData, { entities: ['members'] });

  useEffect(() => {
    const req = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch { } };
    req();
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/commander/leaderboards');
      const json = await res.json();
      if (json.success && json.data?.length > 0) {
        // Fetch entries for each leaderboard
        const withEntries = await Promise.all(
          (json.data || []).slice(0, 5).map(async (lb) => {
            try {
              const entriesRes = await fetch(`/api/commander/leaderboards/${lb.id}/entries`);
              const entriesJson = await entriesRes.json();
              return { ...lb, entries: entriesJson.data || [] };
            } catch { return { ...lb, entries: [] }; }
          })
        );
        setLeaderboards(withEntries.filter(lb => lb.entries.length > 0));
      } else {
        // Demo data if no real leaderboards
        setLeaderboards([
          {
            id: 'demo-points', name: 'Monthly Points Leaders', type: 'points',
            entries: [
              { rank: 1, player_name: 'Loading...', points: 0 },
            ]
          }
        ]);
      }
    } catch (err) { console.error(err); }
  };

  const goFullscreen = () => document.documentElement.requestFullscreen?.();
  const current = leaderboards[activeIdx] || leaderboards[0];

  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <CommanderLayout title="Leaderboard Display" backHref="/commander/dashboard?card=displays">
      <style jsx global>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .lb-row { animation: slideIn 0.3s ease-out forwards; }
      `}</style>

      <div onClick={goFullscreen}
        className="h-screen bg-black text-white font-['Inter'] select-none flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#1877F2] to-[#6366F1] px-8 py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-3xl font-bold">{current?.name || 'Leaderboard'}</h1>
            <p className="text-sm opacity-70">{monthName}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
            {leaderboards.length > 1 && (
              <div className="flex gap-1.5 justify-end mt-1">
                {leaderboards.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full ${i === activeIdx ? 'bg-white' : 'bg-white/30'}`} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard table */}
        <div className="flex-1 overflow-hidden px-8 py-4">
          {!current || current.entries.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-3xl text-white/20">No Leaderboard Data</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header row */}
              <div className="flex items-center px-6 py-2 text-sm text-white/40 uppercase tracking-wider">
                <span className="w-16">Rank</span>
                <span className="flex-1">Player</span>
                <span className="w-32 text-right">{current.type === 'visits' ? 'Visits' : current.type === 'wins' ? 'Wins' : 'Points'}</span>
              </div>

              {/* Entries */}
              {(current.entries || []).slice(0, 15).map((entry, i) => {
                const rank = entry.rank || i + 1;
                const isTop3 = rank <= 3;
                return (
                  <div key={entry.id || i}
                    className="lb-row flex items-center px-6 py-3 rounded-xl"
                    style={{
                      animationDelay: `${i * 50}ms`,
                      backgroundColor: isTop3 ? `${MEDAL_COLORS[rank - 1]}10` : 'rgba(255,255,255,0.02)',
                      borderLeft: isTop3 ? `4px solid ${MEDAL_COLORS[rank - 1]}` : '4px solid transparent'
                    }}>
                    <span className="w-16 text-2xl font-bold" style={{ color: isTop3 ? MEDAL_COLORS[rank - 1] : 'rgba(255,255,255,0.3)' }}>
                      {rank}
                    </span>
                    <span className={`flex-1 font-semibold ${isTop3 ? 'text-xl text-white' : 'text-lg text-white/70'}`}>
                      {entry.player_name || entry.name || 'Player'}
                    </span>
                    <span className={`w-32 text-right font-mono font-bold ${isTop3 ? 'text-2xl' : 'text-lg text-white/50'}`}
                      style={isTop3 ? { color: MEDAL_COLORS[rank - 1] } : {}}>
                      {(entry.points || entry.score || entry.visits || entry.wins || 0).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dealer Push/Break + Promo Ticker */}
        <DealerTicker
          accentColor="#6366F1"
          bgColor="#000"
          fontSize={18}
          borderColor="rgba(255,255,255,0.1)"
          speed={22}
          showBorder={true}
        />

        {/* Footer */}
        <div className="border-t border-white/10 px-8 py-2 flex items-center justify-between flex-shrink-0">
          <p className="text-white/10 text-xs">Updated Every 30 Seconds</p>
          <p className="text-white/10 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
