/**
 * Tournament Clock Display — Traditional Layout
 * /commander/tournaments/[id]/clock-display
 * 
 * Matches the industry-standard tournament clock format:
 * - LEFT: Round, Entries, Players In, Rebuys, Chip Count, Avg Stack, Total Pot
 * - CENTER: Big countdown timer, game type, blinds, ante, next round preview
 * - RIGHT: Current Time, Elapsed Time, Next Break, Chip denomination colors
 * - BOTTOM: Payout bar (1st through 5th+)
 * 
 * Full-screen for TV/projector via HDMI or browser cast.
 * Auto-refreshes, wake lock, click for fullscreen.
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';

function formatClock(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMoney(n) {
  if (!n && n !== 0) return '$0.00';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChipCount(n) {
  if (!n) return '$0';
  return '$' + Number(n).toLocaleString();
}

function formatElapsed(startTime) {
  if (!startTime) return '0:00';
  const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}`;
  return `0:${m.toString().padStart(2, '0')}`;
}

const CHIP_DENOMS = [
  { value: 5, bg: '#FFFFFF', border: '#888', textColor: '#000', label: '$5' },
  { value: 10, bg: '#8B0000', border: '#5C0000', textColor: '#fff', label: '$10' },
  { value: 25, bg: '#1a3a8a', border: '#0d2060', textColor: '#fff', label: '$25' },
  { value: 100, bg: '#1A1A1A', border: '#444', textColor: '#fff', label: '$100' },
  { value: 500, bg: '#6B2D8B', border: '#4A1D6B', textColor: '#fff', label: '$500' },
  { value: 1000, bg: '#DAA520', border: '#B8860B', textColor: '#000', label: '$1,000' },
];

// Multi-tournament clock color themes — up to 6 concurrent tournaments
const CLOCK_THEMES = {
  navy: { gradient: 'linear-gradient(180deg, #2C3E6B 0%, #1E2D52 100%)', accent: '#FFFFFF', headerBg: 'rgba(0,0,0,0.3)' },
  red: { gradient: 'linear-gradient(180deg, #6B2C2C 0%, #521E1E 100%)', accent: '#FF6B6B', headerBg: 'rgba(0,0,0,0.3)' },
  green: { gradient: 'linear-gradient(180deg, #2C6B3E 0%, #1E522D 100%)', accent: '#6BFF8B', headerBg: 'rgba(0,0,0,0.3)' },
  purple: { gradient: 'linear-gradient(180deg, #4B2C6B 0%, #351E52 100%)', accent: '#B06BFF', headerBg: 'rgba(0,0,0,0.3)' },
  gold: { gradient: 'linear-gradient(180deg, #6B5C2C 0%, #52451E 100%)', accent: '#FFD76B', headerBg: 'rgba(0,0,0,0.3)' },
  teal: { gradient: 'linear-gradient(180deg, #2C5F6B 0%, #1E4852 100%)', accent: '#6BFFEB', headerBg: 'rgba(0,0,0,0.3)' },
};

export default function ClockDisplay() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [seconds, setSeconds] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const timerRef = useRef(null);
  const wakeLockRef = useRef(null);

  // Wake lock
  useEffect(() => {
    const req = async () => {
      try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (e) { }
    };
    req();
    const h = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', h);
    return () => { wakeLockRef.current?.release(); document.removeEventListener('visibilitychange', h); };
  }, []);

  // Wall clock
  useEffect(() => {
    const i = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Fetch
  useEffect(() => {
    if (!id) return;
    const fetch_ = async () => {
      try {
        const staffSession = localStorage.getItem('commander_staff') || '';
        const res = await fetch(`/api/commander/tournaments/${id}/floor-view`, {
          headers: { 'x-staff-session': staffSession },
        });
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          const cs = json.data.clock?.clock_state;
          if (cs?.remaining_seconds !== undefined) setSeconds(cs.remaining_seconds);
        }
      } catch (err) { console.error(err); }
    };
    fetch_();
    const poll = setInterval(fetch_, 3000);
    return () => clearInterval(poll);
  }, [id]);

  // Countdown tick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (data?.clock?.clock_state?.status === 'running' && seconds > 0) {
      timerRef.current = setInterval(() => setSeconds(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [data?.clock?.clock_state?.status, seconds]);

  const goFullscreen = () => { document.documentElement.requestFullscreen?.(); };

  if (!data) return (
    <div style={S.loading}><p style={{ color: '#fff', fontSize: 24, fontFamily: 'Inter, sans-serif' }}>Loading Tournament Clock...</p></div>
  );

  const { tournament: t = {}, clock = {}, stats = {}, alerts = {} } = data;
  const theme = CLOCK_THEMES[t.clock_color] || CLOCK_THEMES.navy;
  const blinds = clock.current_blinds || {};
  const nextBlinds = clock.next_blinds || {};
  const clockState = clock.clock_state || {};
  const displaySeconds = seconds ?? clockState.remaining_seconds ?? 0;
  const isBreak = alerts.on_break;
  const isH4H = alerts.hand_for_hand;
  const currentLevel = (clock.current_level || 0) + 1;
  const gameType = t.game_type || 'No Limit Texas Hold \'Em';

  const totalEntries = stats.total_entries || 0;
  const playersIn = stats.players_remaining || 0;
  const totalRebuys = stats.total_rebuys || 0;
  const totalChips = stats.total_chips || totalEntries * (t.starting_chips || 1500);
  const avgStack = playersIn > 0 ? Math.round(totalChips / playersIn) : 0;
  const prizePool = stats.prize_pool || 0;
  const payouts = t.payout_structure || t.custom_payouts || stats.payouts || [];

  const nextBreakSec = clockState.next_break_seconds;
  const elapsedDisplay = formatElapsed(t.started_at || clockState.started_at);

  // Pick 4 chip denoms relevant to blind level
  const maxBlind = (blinds.big_blind || 20) * 100;
  let activeChips = CHIP_DENOMS.filter(c => c.value <= Math.max(maxBlind, 500)).slice(0, 4);
  if (activeChips.length < 3) activeChips = CHIP_DENOMS.slice(0, 4);

  return (
    <>
      <SEOHead
        title="Commander — Clock Display"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />

      <div style={{ ...S.container, background: theme.gradient }} onClick={goFullscreen}>

        {/* ===== HEADER ===== */}
        <div style={{ ...S.header, borderBottomColor: theme.accent + '26' }}>
          <div style={S.headerTitle}>{t.name || 'Tournament'}</div>
          <div style={S.headerSub}>
            {formatMoney(t.buyin_amount || 0)} Buy-in
            {t.rebuy_allowed ? `, ${formatMoney(t.rebuy_cost || t.buyin_amount || 0)} to rebuy (Through Round ${t.late_registration_level || 6}, Max ${t.max_rebuys || 1} per player)` : ''}
            , {t.addon_allowed ? 'Add-ons allowed' : 'No add-ons'}
          </div>
        </div>

        {/* ===== MAIN 3-COLUMN ===== */}
        <div style={S.main}>

          {/* LEFT — Stats */}
          <div style={S.leftPanel}>
            <StatCell label="Round" value={isBreak ? 'Break' : currentLevel} />
            <StatCell label="Entries" value={totalEntries} />
            <StatCell label="Players In" value={playersIn} />
            <StatCell label="Rebuys" value={totalRebuys} />
            <StatCell label="Chip Count" value={formatChipCount(totalChips)} />
            <StatCell label="Avg Stack" value={formatChipCount(avgStack)} />
            <StatCell label="Total Pot" value={formatMoney(prizePool)} />
          </div>

          {/* CENTER — Clock + Blinds */}
          <div style={S.centerPanel}>
            {/* Break / H4H banners */}
            {isH4H && <div style={S.h4hBanner}>HAND FOR HAND</div>}
            {isBreak && !isH4H && <div style={S.breakBanner}>BREAK</div>}

            {/* Countdown */}
            <div style={{
              ...S.timer,
              color: isBreak ? '#F59E0B' : displaySeconds <= 60 ? '#EF4444' : theme.accent
            }}>
              {formatClock(displaySeconds)}
            </div>

            {/* Blinds block */}
            <div style={S.blindsBlock}>
              <div style={S.blindsGame}>{gameType}</div>
              <div style={S.blindsLabel}>Blinds</div>
              <div style={S.blindsValue}>
                ${(blinds.small_blind || 0).toLocaleString()} / ${(blinds.big_blind || 0).toLocaleString()}
              </div>
              {(blinds.ante || 0) > 0 && (
                <div style={S.blindsAnte}>Ante: ${(blinds.ante || 0).toLocaleString()}</div>
              )}
            </div>

            {/* Next round */}
            {nextBlinds && (nextBlinds.small_blind || nextBlinds.big_blind) ? (
              <div style={S.nextRound}>
                <strong>Next Round:</strong> {gameType}<br />
                Blinds: ${(nextBlinds.small_blind || 0).toLocaleString()} / ${(nextBlinds.big_blind || 0).toLocaleString()}
                {(nextBlinds.ante || 0) > 0 && <><br />Ante: ${(nextBlinds.ante || 0).toLocaleString()}</>}
              </div>
            ) : <div style={{ flex: 0 }} />}
          </div>

          {/* RIGHT — Time + Chips */}
          <div style={S.rightPanel}>
            <StatCell label="Current Time" value={currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })} />
            <StatCell label="Elapsed Time" value={elapsedDisplay} />
            <StatCell label="Next Break" value={nextBreakSec ? formatClock(nextBreakSec) : '--:--'} />

            {/* Chip colors */}
            <div style={S.chipStack}>
              {activeChips.map(chip => (
                <div key={chip.value} style={S.chipRow}>
                  <div style={{
                    ...S.chipCircle,
                    backgroundColor: chip.bg,
                    borderColor: chip.border,
                  }}>
                    <div style={S.chipInner} />
                  </div>
                  <span style={S.chipLabel}>{chip.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== FOOTER — Payouts ===== */}
        <div style={S.footer}>
          {payouts.length > 0 ? (
            payouts.slice(0, 7).map((p, i) => {
              const amount = p.amount || (prizePool * (p.percentage || 0) / 100);
              const place = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
              return (
                <span key={i} style={S.payoutItem}>
                  <span style={{ opacity: 0.6 }}>{place} Place:</span>{' '}
                  <span style={{ fontWeight: 700 }}>{formatMoney(amount)}</span>
                </span>
              );
            })
          ) : (
            <span style={{ opacity: 0.4 }}>Payouts TBD</span>
          )}
        </div>

        {/* Branding */}
        <div style={{ position: 'absolute', bottom: 4, right: 12, opacity: 0.15, fontSize: 10, color: '#fff' }}>
          Powered by Smarter.Poker
        </div>
      </div>
    </>
  );
}

function StatCell({ label, value }) {
  return (
    <div style={S.statCell}>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
    </div>
  );
}

// Inline styles for zero-dependency TV rendering
const S = {
  loading: { minHeight: '100vh', background: '#2C3E6B', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  container: {
    minHeight: '100vh', background: 'linear-gradient(180deg, #2C3E6B 0%, #1E2D52 100%)',
    fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#fff', display: 'flex',
    flexDirection: 'column', userSelect: 'none', position: 'relative', overflow: 'hidden'
  },
  header: {
    background: 'rgba(0,0,0,0.3)', textAlign: 'center', padding: '10px 16px 8px',
    borderBottom: '2px solid rgba(255,255,255,0.15)', flexShrink: 0
  },
  headerTitle: { fontSize: 28, fontWeight: 700 },
  headerSub: { fontSize: 13, opacity: 0.65, marginTop: 2 },
  main: {
    flex: 1, display: 'grid', gridTemplateColumns: '160px 1fr 200px',
    minHeight: 0
  },
  leftPanel: { display: 'flex', flexDirection: 'column' },
  rightPanel: { display: 'flex', flexDirection: 'column' },
  centerPanel: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', position: 'relative', padding: '8px 0'
  },
  statCell: {
    flex: 1, background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.15)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '4px 8px', textAlign: 'center'
  },
  statLabel: { fontSize: 13, opacity: 0.65, fontWeight: 500, lineHeight: 1.2 },
  statValue: { fontSize: 20, fontWeight: 700, lineHeight: 1.3 },
  timer: {
    fontSize: 'min(15vw, 160px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
    lineHeight: 1, textShadow: '0 4px 20px rgba(0,0,0,0.5)', letterSpacing: -2,
    fontFamily: "'Inter', monospace", padding: '8px 0'
  },
  blindsBlock: {
    background: 'rgba(0,0,0,0.25)', border: '2px solid rgba(255,255,255,0.15)',
    width: '100%', textAlign: 'center', padding: '8px 16px'
  },
  blindsGame: { fontSize: 16, opacity: 0.8, fontWeight: 500 },
  blindsLabel: { fontSize: 28, fontWeight: 600, opacity: 0.5 },
  blindsValue: { fontSize: 48, fontWeight: 800, lineHeight: 1.15 },
  blindsAnte: { fontSize: 34, fontWeight: 700 },
  nextRound: {
    background: 'rgba(0,0,0,0.15)', border: '2px solid rgba(255,255,255,0.12)',
    width: '100%', textAlign: 'center', padding: '8px 16px', fontSize: 15, lineHeight: 1.5
  },
  chipStack: { flex: 3, display: 'flex', flexDirection: 'column', gap: 10, padding: 14, justifyContent: 'center' },
  chipRow: { display: 'flex', alignItems: 'center', gap: 10 },
  chipCircle: {
    width: 44, height: 44, borderRadius: '50%', border: '3px solid',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)',
    position: 'relative', flexShrink: 0
  },
  chipInner: {
    position: 'absolute', inset: 4, borderRadius: '50%',
    border: '2px dashed rgba(255,255,255,0.3)'
  },
  chipLabel: { fontSize: 18, fontWeight: 700 },
  footer: {
    background: 'rgba(0,0,0,0.35)', borderTop: '2px solid rgba(255,255,255,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
    padding: '10px 20px', fontSize: 15, fontWeight: 600, flexShrink: 0, flexWrap: 'wrap'
  },
  payoutItem: { whiteSpace: 'nowrap' },
  breakBanner: {
    position: 'absolute', top: 8, background: 'rgba(245,158,11,0.2)',
    border: '2px solid rgba(245,158,11,0.5)', padding: '8px 32px', borderRadius: 8,
    color: '#F59E0B', fontSize: 28, fontWeight: 800, letterSpacing: 4, zIndex: 10
  },
  h4hBanner: {
    position: 'absolute', top: 8, background: 'rgba(239,68,68,0.2)',
    border: '2px solid rgba(239,68,68,0.5)', padding: '8px 32px', borderRadius: 8,
    color: '#EF4444', fontSize: 28, fontWeight: 800, letterSpacing: 4, zIndex: 10,
    animation: 'pulse 1.5s infinite'
  }
};
