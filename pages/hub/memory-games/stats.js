import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, Crosshair, Gauge, Gem, Layers3, RefreshCw, ShieldCheck, Sigma, Target, TrendingUp } from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import PreflopSubpageShell from '../../../src/components/memory-games/PreflopSubpageShell';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { accuracyToPercent, normalizeMemoryDashboard } from '../../../src/lib/preflopRangeLab';
import { supabase } from '../../../src/lib/supabase';

const MODE_LABELS = { range: 'Range Lab', speed_drill: 'Speed Drill', pressure_cooker: 'Pressure', pattern_recognition: 'Patterns', mixed_strategy: 'Mixed Strategy', spot_trainer: 'Spot Trainer', tournament: 'Tournament' };

export default function MemoryGamesStats() {
  useTrainingBus('preflop-charts-stats');
  const { user } = useAvatar();
  const [sessions, setSessions] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [sessionsResult, dashboardResponse] = await Promise.all([
        supabase.from('memory_game_sessions').select('id,game_mode,level,score,accuracy,time_taken,diamonds_earned,created_at,completed').eq('user_id', user.id).eq('completed', true).order('created_at', { ascending: false }).limit(100),
        authedFetch(`/api/memory/dashboard?refresh=${Date.now()}`, { cache: 'no-store' }),
      ]);
      if (sessionsResult.error) throw sessionsResult.error;
      setSessions((sessionsResult.data || []).map((session) => ({ ...session, accuracyPercent: accuracyToPercent(session.accuracy, session.score) })));
      if (dashboardResponse.ok) {
        const payload = await dashboardResponse.json();
        if (payload?.success) setDashboard(normalizeMemoryDashboard(payload.stats));
      }
    } catch (fetchError) {
      console.warn('[PreflopStats] Fetch failed:', fetchError?.message || fetchError);
      setError('Your training telemetry could not be synchronized. No placeholder data has been substituted.');
    } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase.channel(`preflop-stats:${user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memory_game_sessions', filter: `user_id=eq.${user.id}` }, fetchStats).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStats, user?.id]);

  const metrics = useMemo(() => {
    const count = sessions.length;
    const average = count ? sessions.reduce((sum, item) => sum + item.accuracyPercent, 0) / count : 0;
    const best = count ? Math.max(...sessions.map((item) => Number(item.score) || 0)) : 0;
    const averageTime = count ? sessions.reduce((sum, item) => sum + (Number(item.time_taken) || 0), 0) / count : 0;
    return {
      count,
      average,
      best,
      averageTime,
      perfect: sessions.filter((item) => item.accuracyPercent >= 99.5).length,
      totalScore: sessions.reduce((sum, item) => sum + (Number(item.score) || 0), 0),
      diamonds: sessions.reduce((sum, item) => sum + (Number(item.diamonds_earned) || 0), 0),
      highestLevel: count ? Math.max(...sessions.map((item) => Number(item.level) || 1)) : 0,
    };
  }, [sessions]);

  const levels = useMemo(() => Array.from({ length: 10 }, (_, index) => {
    const level = index + 1;
    const matches = sessions.filter((session) => Number(session.level) === level);
    return { level, attempts: matches.length, accuracy: matches.length ? matches.reduce((sum, item) => sum + item.accuracyPercent, 0) / matches.length : 0, best: matches.length ? Math.max(...matches.map((item) => Number(item.score) || 0)) : 0 };
  }), [sessions]);

  const modes = useMemo(() => Object.entries(sessions.reduce((acc, session) => {
    const key = session.game_mode || 'range';
    if (!acc[key]) acc[key] = { attempts: 0, total: 0, best: 0 };
    acc[key].attempts += 1; acc[key].total += session.accuracyPercent; acc[key].best = Math.max(acc[key].best, Number(session.score) || 0);
    return acc;
  }, {})).map(([key, value]) => ({ key, ...value, average: value.total / value.attempts })), [sessions]);

  const performance = useMemo(() => {
    const chronological = [...sessions].slice(0, 12).reverse();
    const denominator = Math.max(1, chronological.length - 1);
    const points = chronological.map((session, index) => `${(index / denominator) * 100},${100 - session.accuracyPercent}`).join(' ');
    const split = Math.max(1, Math.floor(chronological.length / 2));
    const older = chronological.slice(0, split);
    const recent = chronological.slice(split);
    const average = (items) => items.length ? items.reduce((sum, item) => sum + item.accuracyPercent, 0) / items.length : 0;
    const delta = recent.length ? average(recent) - average(older) : 0;
    return { chronological, points, delta };
  }, [sessions]);

  const weakSpots = useMemo(() => levels.filter((level) => level.attempts > 0).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3), [levels]);

  return (
    <>
      <SEOHead title="Preflop Charts Stats" description="Your verified Preflop Charts accuracy, mastery, and training history." canonical="/hub/preflop-charts/stats" />
      <PreflopSubpageShell eyebrow="PERSONAL TELEMETRY // VERIFIED SESSIONS" title="Range performance" description="Track accuracy, speed, and mastery using completed Preflop Charts sessions only." metric={dashboard?.current_grade || (metrics.count ? `${metrics.average.toFixed(0)}%` : '—')}>
        {!user?.id ? <div className="preflop-subpage-empty preflop-auth-gate"><Target size={30} aria-hidden /><h2>Sign in to track progression</h2><p>Authenticated sessions sync your mastery, personal bests, and training history across devices.</p><Link href="/login?redirect=/hub/preflop-charts/stats">Sign in <ArrowRight size={16} aria-hidden /></Link></div> : <>
          {error && <div className="preflop-subpage-error" role="alert"><span>{error}</span><button type="button" onClick={fetchStats}><RefreshCw size={15} aria-hidden /> Retry</button></div>}
          <section className="preflop-stat-grid" aria-label="Training summary">
            <Stat icon={Crosshair} label="Completed" value={metrics.count} detail="verified sessions" />
            <Stat icon={Gauge} label="Average" value={`${metrics.average.toFixed(1)}%`} detail="all recorded modes" />
            <Stat icon={ShieldCheck} label="Personal best" value={metrics.best.toLocaleString()} detail={`${metrics.perfect} perfect`} />
            <Stat icon={Clock3} label="Average time" value={`${Math.round(metrics.averageTime)}s`} detail="per completed drill" />
            <Stat icon={Sigma} label="Total score" value={metrics.totalScore.toLocaleString()} detail="all completed sessions" />
            <Stat icon={Gem} label="Diamonds earned" value={metrics.diamonds.toLocaleString()} detail="recorded training rewards" />
            <Stat icon={Layers3} label="Highest level" value={metrics.highestLevel ? `L${metrics.highestLevel}` : '-'} detail="furthest recorded station" />
            <Stat icon={TrendingUp} label="Recent trend" value={`${performance.delta >= 0 ? '+' : ''}${performance.delta.toFixed(1)}%`} detail="recent half vs prior half" />
          </section>

          {dashboard?.daily_challenge && <section className="preflop-daily-signal"><CalendarDays size={22} aria-hidden /><div><small>TODAY'S ASSIGNMENT</small><strong>Level {dashboard.daily_challenge.level} · {dashboard.daily_challenge.game_mode || 'Range Lab'}</strong><span>{dashboard.daily_challenge_completed ? 'Completed' : `${accuracyToPercent(dashboard.daily_challenge.target_accuracy)}% target accuracy${dashboard.daily_challenge.diamond_reward ? ` · +${dashboard.daily_challenge.diamond_reward} diamonds` : ''}`}</span></div>{!dashboard.daily_challenge_completed && <Link href="/hub/preflop-charts">Train now <ArrowRight size={14} aria-hidden /></Link>}</section>}

          <div className="preflop-analytics-layout">
            <section className="preflop-subpage-panel preflop-performance-signal" aria-labelledby="performance-signal-title">
              <div className="preflop-panel-heading"><div><span>LAST 12 VERIFIED SESSIONS</span><h2 id="performance-signal-title">Accuracy signal</h2></div><strong data-positive={performance.delta >= 0}>{performance.delta >= 0 ? '+' : ''}{performance.delta.toFixed(1)}%</strong></div>
              {performance.chronological.length > 1 ? <div className="preflop-signal-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Accuracy trend across recent completed sessions"><defs><linearGradient id="preflopSignalArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#37d6ff" stopOpacity="0.35"/><stop offset="1" stopColor="#37d6ff" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${performance.points} 100,100`} fill="url(#preflopSignalArea)"/><polyline points={performance.points} fill="none" stroke="#62ddff" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><div><span>OLDER</span><span>RECENT</span></div></div> : <EmptyInline />}
            </section>
            <section className="preflop-subpage-panel preflop-weak-signal" aria-labelledby="weak-signal-title">
              <div className="preflop-panel-heading"><div><span>LOWEST RECORDED ACCURACY</span><h2 id="weak-signal-title">Focus stations</h2></div></div>
              {weakSpots.length ? <div>{weakSpots.map((spot) => <article key={spot.level}><span>L{spot.level}</span><div><strong>{spot.accuracy.toFixed(1)}%</strong><small>{spot.attempts} verified run{spot.attempts === 1 ? '' : 's'}</small></div><i style={{ '--weak-accuracy': `${spot.accuracy}%` }} /></article>)}</div> : <EmptyInline />}
            </section>
          </div>

          <div className="preflop-analytics-layout">
            <section className="preflop-subpage-panel" aria-labelledby="level-accuracy-title"><div className="preflop-panel-heading"><div><span>LEVEL ARRAY // 01–10</span><h2 id="level-accuracy-title">Accuracy by level</h2></div></div><div className="preflop-level-telemetry">{levels.map((level) => <div key={level.level} data-empty={level.attempts === 0 || undefined}><span>L{level.level}</span><div><i style={{ '--level-accuracy': `${level.accuracy}%` }} /></div><strong>{level.attempts ? `${level.accuracy.toFixed(1)}%` : '—'}</strong><small>{level.attempts} run{level.attempts === 1 ? '' : 's'}</small></div>)}</div></section>
            <section className="preflop-subpage-panel" aria-labelledby="mode-title"><div className="preflop-panel-heading"><div><span>MODE DISTRIBUTION</span><h2 id="mode-title">Training mix</h2></div></div>{modes.length ? <div className="preflop-mode-metrics">{modes.map((mode) => <div key={mode.key}><span>{MODE_LABELS[mode.key] || mode.key.replaceAll('_', ' ')}</span><strong>{mode.average.toFixed(1)}%</strong><small>{mode.attempts} sessions · best {mode.best}%</small></div>)}</div> : <EmptyInline />}</section>
          </div>

          <section className="preflop-subpage-panel" aria-labelledby="recent-title"><div className="preflop-panel-heading"><div><span>RECENT SIGNALS</span><h2 id="recent-title">Last 10 completed sessions</h2></div>{loading && <span>Syncing…</span>}</div>{sessions.length ? <div className="preflop-session-list">{sessions.slice(0, 10).map((session) => <article key={session.id}><div><span>{MODE_LABELS[session.game_mode] || session.game_mode || 'Range Lab'}</span><small>{new Date(session.created_at).toLocaleDateString()} · Level {session.level || 1}</small></div><strong data-pass={session.accuracyPercent >= 85}>{session.accuracyPercent.toFixed(1)}%</strong><span>{session.time_taken || 0}s</span></article>)}</div> : !loading && <EmptyInline />}</section>
        </>}
      </PreflopSubpageShell>
    </>
  );
}

function Stat({ icon: Icon, label, value, detail }) { return <article><Icon size={19} aria-hidden /><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function EmptyInline() { return <div className="preflop-inline-empty">Complete a drill to establish this signal.</div>; }
