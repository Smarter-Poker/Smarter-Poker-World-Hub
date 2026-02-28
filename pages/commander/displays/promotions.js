/**
 * Promotions TV Display
 * /commander/displays/promotions
 * Full-screen display for TV via wireless HDMI transmitter
 * Shows: active promotions, high hand leaderboard, jackpot amounts
 * Auto-rotates between promotions, no interaction needed
 * Auto-refreshes every 10 seconds
 */
import { useState, useEffect, useRef, useCallback } from 'react';

import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync } from '../../../src/lib/commander/useCommanderSync';
import DealerTicker from '../../../src/components/commander/shared/DealerTicker';

export default function PromotionsDisplay() {
  const [promotions, setPromotions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/commander/promotions');
      const json = await res.json();
      if (json.success) {
        const active = (json.data || []).filter(p => p.is_active !== false);
        setPromotions(active);
      }
    } catch (err) { console.error(err); }
    setNow(new Date());
  }, []);

  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 30000); // fallback — real-time sync handles instant updates
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [fetchData]);

  // Extract venueId for cross-device Supabase sync
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });

  // Commander Data Bus — instant sync when settings/promotions change
  useCommanderSync(venueId, fetchData, { entities: ['settings'] });

  // Auto-rotate promotions every 8 seconds
  useEffect(() => {
    if (promotions.length <= 1) return;
    const rotate = setInterval(() => {
      setCurrentIndex(i => (i + 1) % promotions.length);
    }, 8000);
    return () => clearInterval(rotate);
  }, [promotions.length]);

  // Wake lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) { }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const goFullscreen = () => document.documentElement.requestFullscreen?.();
  const current = promotions[currentIndex];

  const promoTypeStyles = {
    high_hand: { bg: 'from-yellow-900/40 to-yellow-700/20', accent: '#F59E0B', label: 'HIGH HAND' },
    bad_beat: { bg: 'from-red-900/40 to-red-700/20', accent: '#EF4444', label: 'BAD BEAT JACKPOT' },
    splash_pot: { bg: 'from-blue-900/40 to-blue-700/20', accent: '#1877F2', label: 'SPLASH POT' },
    bonus: { bg: 'from-green-900/40 to-green-700/20', accent: '#31A24C', label: 'BONUS' },
    freeroll: { bg: 'from-purple-900/40 to-purple-700/20', accent: '#A855F7', label: 'FREEROLL' },
    default: { bg: 'from-blue-900/40 to-blue-700/20', accent: '#1877F2', label: 'PROMOTION' }
  };

  return (
    <CommanderLayout title="Promotions Display" backHref="/commander/dashboard?card=displays">
      <style jsx global>{`
        @keyframes shimmer { 0% { opacity: 0.7; } 50% { opacity: 1; } 100% { opacity: 0.7; } }
        .shimmer { animation: shimmer 3s ease-in-out infinite; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .slide-in { animation: slideIn 0.6s ease-out; }
      `}</style>

      <div onClick={goFullscreen}
        className="min-h-screen bg-black text-white font-['Inter'] select-none overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-[#1877F2] px-8 py-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-wide">PROMOTIONS</h1>
          <div className="text-right">
            <p className="text-4xl font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-sm opacity-80">
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Main Display */}
        <div className="flex-1 flex items-center justify-center p-8">
          {promotions.length === 0 ? (
            <div className="text-center">
              <p className="text-5xl font-bold text-white/20 mb-4">No Active Promotions</p>
              <p className="text-xl text-white/10">Check Back Soon!</p>
            </div>
          ) : current ? (
            <div key={currentIndex} className={`slide-in w-full max-w-4xl bg-gradient-to-br ${(promoTypeStyles[current.type] || promoTypeStyles.default).bg} rounded-3xl p-12 text-center border border-white/10`}>
              {/* Type Badge */}
              <div className="inline-block px-6 py-2 rounded-full mb-6"
                style={{
                  backgroundColor: `${(promoTypeStyles[current.type] || promoTypeStyles.default).accent}30`,
                  border: `2px solid ${(promoTypeStyles[current.type] || promoTypeStyles.default).accent}50`
                }}>
                <p className="text-sm font-bold tracking-[0.3em] uppercase"
                  style={{ color: (promoTypeStyles[current.type] || promoTypeStyles.default).accent }}>
                  {(promoTypeStyles[current.type] || promoTypeStyles.default).label}
                </p>
              </div>

              {/* Promo Name */}
              <h2 className="text-5xl font-bold text-white mb-4">{current.name || current.title}</h2>

              {/* Amount / Jackpot */}
              {(current.prize_amount || current.jackpot_amount) && (
                <p className="text-8xl font-bold shimmer mb-4"
                  style={{ color: (promoTypeStyles[current.type] || promoTypeStyles.default).accent }}>
                  ${(current.prize_amount || current.jackpot_amount || 0).toLocaleString()}
                </p>
              )}

              {/* Description */}
              {current.description && (
                <p className="text-2xl text-white/70 max-w-2xl mx-auto mb-6">{current.description}</p>
              )}

              {/* Schedule */}
              {current.schedule && (
                <p className="text-lg text-white/40">{current.schedule}</p>
              )}

              {/* High Hand Winners */}
              {current.winners && current.winners.length > 0 && (
                <div className="mt-8 space-y-2">
                  <h3 className="text-lg text-white/50 uppercase tracking-wider mb-3">Current Leaders</h3>
                  {current.winners.slice(0, 5).map((w, i) => (
                    <div key={i} className="flex items-center justify-center gap-4 text-xl">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${i === 0 ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white/60'
                        }`}>{i + 1}</span>
                      <span className="text-white font-medium">{w.player_name}</span>
                      <span className="text-white/50">{w.hand || ''}</span>
                      {w.amount && <span className="text-[#31A24C] font-bold">${w.amount}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Pagination dots */}
        {promotions.length > 1 && (
          <div className="flex justify-center gap-2 pb-6">
            {promotions.map((_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full transition-all ${i === currentIndex ? 'bg-[#1877F2] w-8' : 'bg-white/20'
                }`} />
            ))}
          </div>
        )}

        {/* Dealer Push/Break + Promo Ticker */}
        <DealerTicker
          accentColor="#1877F2"
          bgColor="#000"
          fontSize={18}
          borderColor="rgba(255,255,255,0.1)"
          speed={22}
          showBorder={true}
        />

        {/* Branding */}
        <div className="absolute bottom-4 right-6">
          <p className="text-white/15 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
