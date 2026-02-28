/**
 * Promotions TV Display — Player-Facing
 * /commander/displays/promotions
 * Full-screen display for TV via wireless HDMI transmitter
 * Shows: active promotions with prize values, countdown timers, highhand leaders
 * Auto-rotates between promotions every 8 seconds
 * Real-time sync via Supabase + Commander Data Bus
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync } from '../../../src/lib/commander/useCommanderSync';
import DealerTicker from '../../../src/components/commander/shared/DealerTicker';

const PROMO_TYPE_STYLES = {
  high_hand: { bg: 'from-yellow-900/40 to-yellow-700/20', accent: '#F59E0B', label: 'HIGH HAND' },
  bad_beat: { bg: 'from-red-900/40 to-red-700/20', accent: '#EF4444', label: 'BAD BEAT JACKPOT' },
  splash_pot: { bg: 'from-blue-900/40 to-blue-700/20', accent: '#1877F2', label: 'SPLASH POT' },
  happy_hour: { bg: 'from-amber-900/40 to-amber-700/20', accent: '#F59E0B', label: 'HAPPY HOUR' },
  new_player: { bg: 'from-purple-900/40 to-purple-700/20', accent: '#8B5CF6', label: 'NEW PLAYER BONUS' },
  referral: { bg: 'from-pink-900/40 to-pink-700/20', accent: '#EC4899', label: 'REFERRAL BONUS' },
  loyalty: { bg: 'from-cyan-900/40 to-cyan-700/20', accent: '#22D3EE', label: 'LOYALTY REWARD' },
  drawing: { bg: 'from-orange-900/40 to-orange-700/20', accent: '#F97316', label: 'DRAWING' },
  tournament_bonus: { bg: 'from-green-900/40 to-green-700/20', accent: '#10B981', label: 'TOURNAMENT BONUS' },
  cash_back: { bg: 'from-indigo-900/40 to-indigo-700/20', accent: '#6366F1', label: 'CASH BACK' },
  custom: { bg: 'from-gray-900/40 to-gray-700/20', accent: '#9CA3AF', label: 'PROMOTION' },
  default: { bg: 'from-blue-900/40 to-blue-700/20', accent: '#1877F2', label: 'PROMOTION' }
};

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
        // API returns { data: { promotions: [...] } }
        const promos = json.data?.promotions || json.data || [];
        const arr = Array.isArray(promos) ? promos : [];
        const active = arr.filter(p => p.status === 'active' || p.is_active);
        setPromotions(active);
      }
    } catch (err) { console.error(err); }
    setNow(new Date());
  }, []);

  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [fetchData]);

  // Extract venueId for cross-device sync
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });

  // Commander Data Bus
  useCommanderSync(venueId, fetchData, { entities: ['settings'] });

  // Supabase realtime — instant push notification when promos change
  useEffect(() => {
    if (!venueId) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;
    const sb = createClient(supabaseUrl, supabaseKey);
    const channel = sb.channel('display-promotions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_promotions', filter: `venue_id=eq.${venueId}` },
        () => { fetchData(); }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [venueId, fetchData]);

  // Auto-rotate every 8 seconds
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

  // Format prize value
  const formatPrize = (promo) => {
    if (!promo) return '';
    if (promo.prize_value) {
      if (promo.prize_type === 'cash' || promo.prize_type === 'chips') {
        return `$${Number(promo.prize_value).toLocaleString()}`;
      }
      return promo.prize_description || `${promo.prize_value}`;
    }
    return promo.prize_description || '';
  };

  // Countdown remaining
  const getDaysRemaining = (promo) => {
    if (!promo?.end_date) return null;
    const end = new Date(promo.end_date);
    end.setHours(23, 59, 59, 999);
    const diff = end - now;
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `${days} day${days !== 1 ? 's' : ''} remaining`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return `${hours} hour${hours !== 1 ? 's' : ''} remaining`;
  };

  return (
    <CommanderLayout title="Promotions Display" backHref="/commander/dashboard?card=displays">
      <style jsx global>{`
        @keyframes shimmer { 0% { opacity: 0.7; } 50% { opacity: 1; } 100% { opacity: 0.7; } }
        .shimmer { animation: shimmer 3s ease-in-out infinite; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .slide-in { animation: slideIn 0.6s ease-out; }
        @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(24,119,242,0.3); } 50% { box-shadow: 0 0 40px rgba(24,119,242,0.5); } }
        .pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }
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
            <div key={currentIndex} className={`slide-in w-full max-w-4xl bg-gradient-to-br ${(PROMO_TYPE_STYLES[current.promotion_type] || PROMO_TYPE_STYLES.default).bg} rounded-3xl p-12 text-center border border-white/10 pulse-glow`}>

              {/* Image Banner */}
              {current.image_url && (
                <div className="mb-6 rounded-2xl overflow-hidden" style={{ maxHeight: 200 }}>
                  <img src={current.image_url} alt={current.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                </div>
              )}

              {/* Type Badge */}
              <div className="inline-block px-6 py-2 rounded-full mb-6"
                style={{
                  backgroundColor: `${(PROMO_TYPE_STYLES[current.promotion_type] || PROMO_TYPE_STYLES.default).accent}30`,
                  border: `2px solid ${(PROMO_TYPE_STYLES[current.promotion_type] || PROMO_TYPE_STYLES.default).accent}50`
                }}>
                <p className="text-sm font-bold tracking-[0.3em] uppercase"
                  style={{ color: (PROMO_TYPE_STYLES[current.promotion_type] || PROMO_TYPE_STYLES.default).accent }}>
                  {(PROMO_TYPE_STYLES[current.promotion_type] || PROMO_TYPE_STYLES.default).label}
                </p>
              </div>

              {/* Promo Name */}
              <h2 className="text-5xl font-bold text-white mb-4">{current.name}</h2>

              {/* Prize Amount */}
              {current.prize_value && (
                <p className="text-8xl font-bold shimmer mb-4"
                  style={{ color: (PROMO_TYPE_STYLES[current.promotion_type] || PROMO_TYPE_STYLES.default).accent }}>
                  {formatPrize(current)}
                </p>
              )}

              {/* Description */}
              {current.description && (
                <p className="text-2xl text-white/70 max-w-2xl mx-auto mb-6">{current.description}</p>
              )}

              {/* Countdown Timer */}
              {getDaysRemaining(current) && (
                <div className="inline-block px-6 py-3 rounded-full bg-white/5 border border-white/10">
                  <p className="text-lg text-white/60 font-medium">{getDaysRemaining(current)}</p>
                </div>
              )}

              {/* Qualifying Hands */}
              {current.qualifying_hands && (
                <p className="text-lg text-white/40 mt-4">Qualifying: {current.qualifying_hands}</p>
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

        {/* Dealer Ticker */}
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
