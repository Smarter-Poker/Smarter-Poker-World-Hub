/**
 * Tournament Clock Display — Full Tournament Director Clone
 * /commander/tournaments/[id]/clock-display
 * 
 * Features matching TheTournamentDirector.net:
 * - LEFT: Round, Entries, Players In, Rebuys, Chip Count, Avg Stack, Total Pot
 * - CENTER: Big countdown timer, game type, blinds, ante, next round preview
 * - RIGHT: Current Time, Elapsed Time, Next Break, Chip denomination colors
 * - BOTTOM: Payout bar
 * - ICM/Chop calculator panel (toggleable)
 * - Multiple cycling screens (Clock → Payouts → Schedule → Seating)
 * - Custom background/logo from preset
 * - Sound alerts on level change, break, final table
 * - Hand timer overlay (put a player on the clock)
 * - Burn-in prevention (subtle pixel shift)
 * - Upcoming blind schedule preview (next 5 levels)
 * 
 * Full-screen for TV/projector via HDMI or browser cast.
 * Auto-refreshes, wake lock, click for fullscreen.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { calculateICM, calculateChipChop, formatPrize } from '../../../../src/lib/commander/icm-utils';

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
  if (!n) return '0';
  return Number(n).toLocaleString();
}

function formatElapsed(startTime) {
  if (!startTime) return '0:00';
  const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}`;
  return `0:${m.toString().padStart(2, '0')}`;
}

// Chip denominations removed — replaced by prize payouts + chip leaders in right panel

const DEFAULT_THEME = {
  background: '#0D192E', text: '#ffffff', accent: '#1877F2',
  blinds: '#ffffff', headerBg: 'rgba(0,0,0,0.3)',
};

// Display screens for cycling
const SCREENS = { CLOCK: 'clock', PAYOUTS: 'payouts', SCHEDULE: 'schedule', ICM: 'icm' };

export default function ClockDisplay() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [seconds, setSeconds] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showControls, setShowControls] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [preset, setPreset] = useState(null);
  const [activeScreen, setActiveScreen] = useState(SCREENS.CLOCK);
  const [handTimerActive, setHandTimerActive] = useState(false);
  const [handTimerSeconds, setHandTimerSeconds] = useState(60);
  const [burnInOffset, setBurnInOffset] = useState({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const handTimerRef = useRef(null);
  const wakeLockRef = useRef(null);
  const isRunningRef = useRef(false);
  const controlsTimeoutRef = useRef(null);
  const cycleRef = useRef(null);
  const prevLevelRef = useRef(null);
  const audioRef = useRef(null);

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

  // Burn-in prevention
  useEffect(() => {
    const displayOpts = preset?.display_options || {};
    if (!displayOpts.burn_in_prevention) return;
    const interval = setInterval(() => {
      setBurnInOffset({ x: Math.random() * 4 - 2, y: Math.random() * 4 - 2 });
    }, 30000);
    return () => clearInterval(interval);
  }, [preset]);

  // Screen cycling
  useEffect(() => {
    if (cycleRef.current) clearInterval(cycleRef.current);
    const displayOpts = preset?.display_options || {};
    if (!displayOpts.screen_cycle_enabled) return;
    const screenList = [SCREENS.CLOCK];
    if (displayOpts.show_payouts) screenList.push(SCREENS.PAYOUTS);
    if (displayOpts.show_schedule_preview) screenList.push(SCREENS.SCHEDULE);
    if (displayOpts.show_icm) screenList.push(SCREENS.ICM);
    if (screenList.length <= 1) return;
    const intervalMs = (displayOpts.screen_cycle_interval || 15) * 1000;
    let idx = 0;
    cycleRef.current = setInterval(() => {
      idx = (idx + 1) % screenList.length;
      setActiveScreen(screenList[idx]);
    }, intervalMs);
    return () => { if (cycleRef.current) clearInterval(cycleRef.current); };
  }, [preset]);

  // Fetch floor-view data
  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const staffSession = localStorage.getItem('commander_staff') || '';
        const res = await fetch(`/api/commander/tournaments/${id}/floor-view`, {
          headers: { 'x-staff-session': staffSession },
        });
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          const cs = json.data.clock?.clock_state;
          if (cs?.remaining_seconds !== undefined && cs.remaining_seconds > 0) {
            setSeconds(cs.remaining_seconds);
          } else if (cs?.remaining_seconds === 0 || cs?.remaining_seconds === undefined) {
            const blindStructure = json.data.tournament?.blind_structure || [];
            const currentLvl = json.data.clock?.current_level || 0;
            const levelData = blindStructure[currentLvl];
            if (levelData?.duration_minutes) {
              setSeconds(levelData.duration_minutes * 60);
            }
          }
          isRunningRef.current = cs?.status === 'running';

          // Sound alerts — detect level change
          const currentLevel = json.data.clock?.current_level;
          const displayOpts = preset?.display_options || {};
          if (prevLevelRef.current !== null && currentLevel !== prevLevelRef.current) {
            if (displayOpts.sound_level_change) playAlert('level');
          }
          if (json.data.alerts?.on_break && displayOpts.sound_break) playAlert('break');
          if (json.data.alerts?.final_table && displayOpts.sound_final_table) playAlert('final');
          prevLevelRef.current = currentLevel;

          // Load preset if tournament has clock_preset_id
          if (!preset && json.data.tournament?.clock_preset_id) {
            fetchPreset(json.data.tournament.clock_preset_id);
          }
        }
      } catch (err) { console.error(err); }
    };
    fetchData();
    const poll = setInterval(fetchData, 3000);
    return () => clearInterval(poll);
  }, [id, preset]);

  // Fetch clock preset
  const fetchPreset = async (presetId) => {
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch('/api/commander/clock-presets', {
        headers: { 'x-staff-session': staffSession },
      });
      const json = await res.json();
      if (json.success) {
        const found = (json.data || []).find(p => p.id === presetId);
        if (found) setPreset(found);
      }
    } catch (err) { console.error(err); }
  };

  // Sound alert playback
  const playAlert = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      if (type === 'break') { osc.frequency.setValueAtTime(660, ctx.currentTime); }
      else if (type === 'final') { osc.frequency.setValueAtTime(880, ctx.currentTime); }
      else { osc.frequency.setValueAtTime(523, ctx.currentTime); }
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } catch { }
  };

  // Countdown tick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const status = data?.clock?.clock_state?.status;
    isRunningRef.current = status === 'running';
    if (status === 'running') {
      timerRef.current = setInterval(() => {
        if (isRunningRef.current) {
          setSeconds(prev => (prev > 0 ? prev - 1 : 0));
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [data?.clock?.clock_state?.status]);

  // Hand timer tick
  useEffect(() => {
    if (handTimerRef.current) clearInterval(handTimerRef.current);
    if (handTimerActive && handTimerSeconds > 0) {
      handTimerRef.current = setInterval(() => {
        setHandTimerSeconds(prev => {
          if (prev <= 1) { setHandTimerActive(false); playAlert('break'); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (handTimerRef.current) clearInterval(handTimerRef.current); };
  }, [handTimerActive, handTimerSeconds]);

  // Clock action handler
  const clockAction = async (action) => {
    if (!id || actionLoading) return;
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch(`/api/commander/tournaments/${id}/clock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
        body: JSON.stringify({ action })
      });
      const json = await res.json();
      if (json.success) {
        const res2 = await fetch(`/api/commander/tournaments/${id}/floor-view`, {
          headers: { 'x-staff-session': staffSession },
        });
        const json2 = await res2.json();
        if (json2.success) {
          setData(json2.data);
          const cs = json2.data.clock?.clock_state;
          if (cs?.remaining_seconds !== undefined) setSeconds(cs.remaining_seconds);
          isRunningRef.current = cs?.status === 'running';
        }
      }
    } catch (err) { console.error('Clock action error:', err); }
    setActionLoading(false);
  };

  const toggleControls = (e) => {
    e.stopPropagation();
    setShowControls(prev => !prev);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 10000);
  };

  const goFullscreen = () => { document.documentElement.requestFullscreen?.(); };

  if (!data) return (
    <div style={S.loading}><p style={{ color: '#fff', fontSize: 24, fontFamily: 'Inter, sans-serif' }}>Loading Tournament Clock...</p></div>
  );

  const { tournament: t = {}, clock = {}, stats = {}, alerts = {} } = data;
  const theme = { ...DEFAULT_THEME, ...(preset?.theme || {}) };
  const displayOpts = preset?.display_options || {
    show_prize_pool: true, show_payouts: true, show_icm: false,
    show_chip_chop: false, show_chip_colors: false, show_next_round: true,
    show_schedule_preview: false, show_seating: false,
  };

  // Chip leaders — top 5 sorted by stack
  const chipLeaders = (stats.player_stacks || [])
    .filter(p => p.chips > 0)
    .sort((a, b) => b.chips - a.chips)
    .slice(0, 5);
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
  const blindStructure = t.blind_structure || [];

  // ICM / Chop calculations
  const playerStacks = stats.player_stacks || [];
  const prizeAmounts = payouts.map(p => p.amount || (prizePool * (p.percentage || 0) / 100));
  const icmResults = playerStacks.length > 1 ? calculateICM(playerStacks.map(p => p.chips), prizeAmounts) : [];
  const chipChopResults = playerStacks.length > 1 ? calculateChipChop(playerStacks.map(p => p.chips), prizePool) : [];

  const bgStyle = displayOpts.background_image_url
    ? { backgroundImage: `url(${displayOpts.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: `linear-gradient(180deg, ${theme.background} 0%, ${adjustColor(theme.background, -20)} 100%)` };

  return (
    <>
      <SEOHead title="Commander — Clock Display" description="Club Commander Poker Room Management Tool." noindex={true} />

      <div style={{
        ...S.container, ...bgStyle,
        transform: `translate(${burnInOffset.x}px, ${burnInOffset.y}px)`,
      }} onClick={goFullscreen}>

        {/* ===== HAND TIMER OVERLAY ===== */}
        {handTimerActive && (
          <div style={S.handTimerOverlay} onClick={(e) => { e.stopPropagation(); setHandTimerActive(false); }}>
            <div style={S.handTimerBox}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, opacity: 0.7, marginBottom: 4 }}>PLAYER ON THE CLOCK</div>
              <div style={{ fontSize: 96, fontWeight: 800, fontFamily: "'Inter', monospace", color: handTimerSeconds <= 10 ? '#EF4444' : '#fff' }}>
                {handTimerSeconds}
              </div>
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>Click to dismiss</div>
            </div>
          </div>
        )}

        {/* ===== MANAGEMENT CONTROLS ===== */}
        {showControls && (
          <div style={S.controlBar} onClick={e => e.stopPropagation()}>
            <button style={{ ...S.controlBtn, background: 'rgba(239,68,68,0.3)', borderColor: '#EF4444' }} onClick={() => clockAction('previous_level')} disabled={actionLoading}>
              ← Prev Level
            </button>
            {data?.tournament?.status === 'running' ? (
              <button style={{ ...S.controlBtn, ...S.controlBtnPrimary, background: 'rgba(245,158,11,0.3)', borderColor: '#F59E0B' }} onClick={() => clockAction('pause')} disabled={actionLoading}>
                ⏸ Pause
              </button>
            ) : (
              <button style={{ ...S.controlBtn, ...S.controlBtnPrimary, background: 'rgba(49,162,76,0.3)', borderColor: '#31A24C' }} onClick={() => clockAction('resume')} disabled={actionLoading}>
                ▶ Resume
              </button>
            )}
            <button style={{ ...S.controlBtn, background: 'rgba(24,119,242,0.3)', borderColor: '#1877F2' }} onClick={() => clockAction('next_level')} disabled={actionLoading}>
              Next Level →
            </button>
            <button style={{ ...S.controlBtn, background: 'rgba(139,92,246,0.3)', borderColor: '#8B5CF6' }} onClick={() => { setHandTimerSeconds(60); setHandTimerActive(true); }}>
              Hand Timer
            </button>
            {/* Screen selector */}
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              {[
                { key: SCREENS.CLOCK, label: 'Clock' },
                { key: SCREENS.PAYOUTS, label: 'Payouts' },
                { key: SCREENS.SCHEDULE, label: 'Schedule' },
                { key: SCREENS.ICM, label: 'ICM' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setActiveScreen(key)} style={{
                  ...S.controlBtn, padding: '8px 14px', fontSize: 13,
                  background: activeScreen === key ? 'rgba(24,119,242,0.4)' : 'rgba(255,255,255,0.1)',
                  borderColor: activeScreen === key ? '#1877F2' : 'rgba(255,255,255,0.2)',
                }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {/* ===== HEADER ===== */}
        <div style={{ ...S.header, background: theme.headerBg, borderBottomColor: theme.accent + '26' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {displayOpts.logo_url && <img src={displayOpts.logo_url} alt="" style={{ height: 32 }} />}
            <div style={S.headerTitle}>{t.name || 'Tournament'}</div>
          </div>
          <div style={S.headerSub}>
            {t.scheduled_start && (
              <span>{new Date(t.scheduled_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} — </span>
            )}
            {formatMoney(t.buyin_amount || 0)} Buy-in
            {t.rebuy_allowed ? `, ${formatMoney(t.rebuy_cost || t.buyin_amount || 0)} to rebuy` : ''}
            , {t.addon_allowed ? 'Add-ons allowed' : 'No add-ons'}
          </div>
        </div>

        {/* ===== MAIN CONTENT — SCREEN SWITCHER ===== */}
        {activeScreen === SCREENS.CLOCK && (
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
              {isH4H && <div style={S.h4hBanner}>HAND FOR HAND</div>}
              {isBreak && !isH4H && <div style={S.breakBanner}>BREAK</div>}

              <div style={{ ...S.timer, color: '#FFFFFF', cursor: 'pointer' }} onClick={toggleControls}>
                {formatClock(displaySeconds)}
              </div>

              {data?.tournament?.status === 'paused' && <div style={S.pausedBanner}>PAUSED</div>}

              <div style={S.blindsBlock}>
                <div style={{ ...S.blindsGame, color: '#FFFFFF' }}>{gameType}</div>
                <div style={{ ...S.blindsLabel, color: '#FFFFFF' }}>Blinds</div>
                <div style={{ ...S.blindsValue, color: '#FFFFFF' }}>
                  {(blinds.small_blind || 0).toLocaleString()} / {(blinds.big_blind || 0).toLocaleString()}
                </div>
                {(blinds.ante || 0) > 0 && <div style={{ ...S.blindsAnte, color: '#FFFFFF' }}>Ante: {(blinds.ante || 0).toLocaleString()}</div>}
              </div>

              {displayOpts.show_next_round && nextBlinds && (nextBlinds.small_blind || nextBlinds.big_blind) && (
                <div style={S.nextRound}>
                  <strong>Next Round:</strong> {gameType}<br />
                  Blinds: {(nextBlinds.small_blind || 0).toLocaleString()} / {(nextBlinds.big_blind || 0).toLocaleString()}
                  {(nextBlinds.ante || 0) > 0 && <><br />Ante: {(nextBlinds.ante || 0).toLocaleString()}</>}
                </div>
              )}
            </div>

            {/* RIGHT — Time + Payouts + Chip Leaders */}
            <div style={S.rightPanel}>
              <StatCell label="Current Time" value={currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })} />
              <StatCell label="Elapsed Time" value={elapsedDisplay} />
              <StatCell label="Next Break" value={nextBreakSec ? formatClock(nextBreakSec) : '--:--'} />

              {/* Prize Payouts — scrollable */}
              {payouts.length > 0 && (
                <div style={S.rightSection}>
                  <div style={S.rightSectionHeader}>Prizes</div>
                  <div style={S.payoutScroll}>
                    {payouts.map((p, i) => {
                      const amount = p.amount || (prizePool * (p.percentage || 0) / 100);
                      const place = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
                      const color = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#E4E6EB';
                      return (
                        <div key={i} style={S.payoutRow}>
                          <span style={{ opacity: 0.6, minWidth: 30, fontSize: 13 }}>{place}</span>
                          <span style={{ color, fontWeight: 700, fontSize: 15 }}>{formatMoney(amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chip Leaders — top 5 */}
              {chipLeaders.length > 0 && (
                <div style={S.rightSection}>
                  <div style={S.rightSectionHeader}>Chip Leaders</div>
                  <div style={S.leadersScroll}>
                    {chipLeaders.map((player, i) => (
                      <div key={i} style={S.leaderRow}>
                        <span style={S.leaderRank}>{i + 1}</span>
                        <span style={S.leaderName}>{player.name || 'Player'}</span>
                        <span style={S.leaderChips}>{formatChipCount(player.chips)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== PAYOUTS SCREEN ===== */}
        {activeScreen === SCREENS.PAYOUTS && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, opacity: 0.5, marginBottom: 16, textTransform: 'uppercase' }}>Prize Pool: {formatMoney(prizePool)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: '8px 24px', fontSize: 24, fontWeight: 700 }}>
              {payouts.slice(0, 10).map((p, i) => {
                const amount = p.amount || (prizePool * (p.percentage || 0) / 100);
                const place = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
                return (
                  <React.Fragment key={i}>
                    <span style={{ opacity: 0.5, textAlign: 'right' }}>{place}</span>
                    <span>—</span>
                    <span style={{ color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#fff' }}>{formatMoney(amount)}</span>
                  </React.Fragment>
                );
              })}
            </div>
            {payouts.length === 0 && <div style={{ opacity: 0.3, fontSize: 20, marginTop: 20 }}>Payouts TBD</div>}
          </div>
        )}

        {/* ===== SCHEDULE SCREEN ===== */}
        {activeScreen === SCREENS.SCHEDULE && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, opacity: 0.5, marginBottom: 16, textTransform: 'uppercase' }}>Blind Schedule</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto auto', gap: '6px 20px', fontSize: 18, fontWeight: 600 }}>
              <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 13 }}>Level</span>
              <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 13 }}>Small</span>
              <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 13 }}>Big</span>
              <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 13 }}>Ante</span>
              <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 13 }}>Time</span>
              {blindStructure.slice(Math.max(0, (clock.current_level || 0) - 1), (clock.current_level || 0) + 6).map((level, i) => {
                const levelNum = Math.max(0, (clock.current_level || 0) - 1) + i + 1;
                const isCurrent = levelNum === currentLevel;
                return (
                  <React.Fragment key={i}>
                    <span style={{ color: isCurrent ? '#1877F2' : '#fff', fontWeight: isCurrent ? 800 : 600 }}>{level.is_break ? 'Break' : levelNum}</span>
                    <span style={{ color: isCurrent ? '#1877F2' : '#fff' }}>{level.is_break ? '-' : (level.small_blind || 0).toLocaleString()}</span>
                    <span style={{ color: isCurrent ? '#1877F2' : '#fff' }}>{level.is_break ? '-' : (level.big_blind || 0).toLocaleString()}</span>
                    <span style={{ color: isCurrent ? '#1877F2' : '#fff' }}>{level.is_break ? '-' : (level.ante || 0).toLocaleString()}</span>
                    <span style={{ color: isCurrent ? '#1877F2' : '#fff' }}>{level.duration_minutes || '-'}m</span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== ICM SCREEN ===== */}
        {activeScreen === SCREENS.ICM && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, opacity: 0.5, marginBottom: 16, textTransform: 'uppercase' }}>
              ICM Chop Values — {playersIn} Players Remaining
            </div>
            {icmResults.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto auto', gap: '6px 20px', fontSize: 16, fontWeight: 600 }}>
                <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 12 }}>Player</span>
                <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 12 }}>Chips</span>
                <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 12 }}>ICM Value</span>
                <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 12 }}>Chip Chop</span>
                <span style={{ fontWeight: 700, opacity: 0.5, fontSize: 12 }}>Equity %</span>
                {playerStacks.map((player, i) => (
                  <React.Fragment key={i}>
                    <span>{player.name || `Player ${i + 1}`}</span>
                    <span>{formatChipCount(player.chips)}</span>
                    <span style={{ color: '#31A24C' }}>{formatMoney(icmResults[i]?.equity || 0)}</span>
                    <span style={{ color: '#1877F2' }}>{formatMoney(chipChopResults[i]?.chop || 0)}</span>
                    <span style={{ opacity: 0.7 }}>{icmResults[i]?.percentage || 0}%</span>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.3, fontSize: 18, marginTop: 20 }}>
                ICM data available when 2+ players remain with chip counts
              </div>
            )}
          </div>
        )}

        {/* Footer removed — payouts now displayed in right panel */}

        {/* Branding */}
        <div style={{ position: 'absolute', bottom: 4, right: 12, opacity: 0.15, fontSize: 10, color: '#fff' }}>
          Powered by Smarter.Poker
        </div>
      </div>
    </>
  );
}

// Helper to darken/lighten hex color
function adjustColor(hex, amount) {
  try {
    const h = hex.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(h.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(h.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(h.substring(4, 6), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch { return hex; }
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
  loading: { minHeight: '100vh', background: '#0D192E', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  container: {
    minHeight: '100vh', fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#fff',
    display: 'flex', flexDirection: 'column', userSelect: 'none', position: 'relative', overflow: 'hidden',
    transition: 'transform 0.5s ease',
  },
  header: {
    background: 'rgba(0,0,0,0.3)', textAlign: 'center', padding: '10px 16px 8px',
    borderBottom: '2px solid rgba(255,255,255,0.15)', flexShrink: 0
  },
  headerTitle: { fontSize: 28, fontWeight: 700 },
  headerSub: { fontSize: 13, opacity: 0.65, marginTop: 2 },
  main: { flex: 1, display: 'grid', gridTemplateColumns: '160px 1fr 260px', minHeight: 0 },
  leftPanel: { display: 'flex', flexDirection: 'column' },
  rightPanel: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  centerPanel: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', position: 'relative', padding: '8px 0', flex: 1
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
    fontFamily: "'Inter', monospace", padding: '8px 0', textAlign: 'center', width: '100%'
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
  // Right panel sections — Prizes + Chip Leaders
  rightSection: {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: 'rgba(255,255,255,0.04)',
    border: '2px solid rgba(255,255,255,0.12)',
    overflow: 'hidden', minHeight: 0,
  },
  rightSectionHeader: {
    fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
    textAlign: 'center', padding: '6px 8px', opacity: 0.6,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.2)', flexShrink: 0,
  },
  payoutScroll: {
    flex: 1, overflowY: 'auto', padding: '4px 10px',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  payoutRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  leadersScroll: {
    flex: 1, overflowY: 'auto', padding: '4px 8px',
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  leaderRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  leaderRank: {
    fontSize: 13, fontWeight: 800, opacity: 0.5, minWidth: 18, textAlign: 'center',
  },
  leaderName: {
    flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  leaderChips: {
    fontSize: 13, fontWeight: 700, color: '#31A24C', whiteSpace: 'nowrap',
  },
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
  },
  pausedBanner: {
    background: 'rgba(245,158,11,0.2)', border: '2px solid rgba(245,158,11,0.5)',
    padding: '6px 28px', borderRadius: 8, color: '#F59E0B', fontSize: 24,
    fontWeight: 800, letterSpacing: 4, marginTop: 4
  },
  controlBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    padding: '12px 24px', borderBottom: '2px solid rgba(255,255,255,0.2)',
    flexWrap: 'wrap'
  },
  controlBtn: {
    padding: '8px 18px', borderRadius: 8, border: '2px solid', color: '#fff',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
    transition: 'all 0.2s', opacity: 0.9
  },
  controlBtnPrimary: { padding: '10px 28px', fontSize: 16 },
  handTimerOverlay: {
    position: 'absolute', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  handTimerBox: {
    textAlign: 'center', padding: 40,
    border: '4px solid rgba(239,68,68,0.5)', borderRadius: 24,
    background: 'rgba(239,68,68,0.1)',
  },
};
