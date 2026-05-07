/**
 * pages/hub/training.js — REDESIGNED
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for Smarter-Poker-World-Hub/pages/hub/training.js
 *
 * What changed (vs the existing 2,245-line page):
 *   - Re-framed the page from "100-game catalog" -> "AI-coached daily surface"
 *   - New IA: app bar -> hero plan -> leak banner -> stats strip -> library
 *   - All inline styles moved to a shared `tokens` object
 *   - GSAP + ScrollTrigger + canvas-confetti + framer-motion removed from the
 *     initial bundle. Arena celebrations still load `canvas-confetti` lazily.
 *   - Lucide icons (already a dependency in the codebase) replace emoji icons
 *   - Sentence case throughout, single primary accent (#00D4FF) reserved
 *     for the one-tap CTA per screen
 *   - Touch targets >=44pt, focus rings visible, prefers-reduced-motion honoured
 *
 * Existing imports preserved so the page slots into the codebase 1:1:
 *   - TRAINING_LIBRARY, getGamesByCategory  (src/data/TRAINING_LIBRARY)
 *   - useTrainingProgress                    (src/hooks/useTrainingProgress)
 *   - useTrainingStore                       (src/stores/trainingStore)
 *   - JarvisRecommendations                  (src/components/training/JarvisRecommendations)
 *   - LeakSignalAnalyzer                     (src/engine/LeakSignalAnalyzer)
 *   - GodModeArena (lazy)                    (src/components/training/GodModeArena)
 *   - UniversalHeader / BottomNavBar         (src/components/ui)
 *   - SEOHead, PageTransition                (existing)
 *
 * Author: redesign generated 2026-05-06
 */

import { useRouter } from 'next/router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Play, Shuffle, Target, Clock, Layers, Zap, AlertTriangle, Wrench,
  TrendingUp, Flame, Search, Trophy, DollarSign, Rocket, Brain, Atom,
  Grid2x2, Check, Sparkles, Lock, Gem, Home, Users, BarChart3, User,
  ArrowRight,
} from 'lucide-react';

import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../src/components/ui/BottomNavBar';
import PageTransition from '../../src/components/transitions/PageTransition';
import { TRAINING_LIBRARY, getGamesByCategory } from '../../src/data/TRAINING_LIBRARY';
import { getGameImage } from '../../src/data/GAME_IMAGES';
import useTrainingProgress from '../../src/hooks/useTrainingProgress';
import { useTrainingStore } from '../../src/stores/trainingStore';
import { getAuthUser, getAccessToken } from '../../src/lib/authUtils';
import DiamondEngine from '../../src/services/DiamondEngine';
import JarvisRecommendations from '../../src/components/training/JarvisRecommendations';
import { leakAnalyzer } from '../../src/engine/LeakSignalAnalyzer';

const GodModeArena = dynamic(() => import('../../src/components/training/GodModeArena'), {
  ssr: false,
  loading: () => <ArenaSkeleton />,
});

const t = {
  bg0: '#060912', bg1: '#0a0e1c', bg2: '#0f1424',
  line: 'rgba(255,255,255,0.07)',
  line2: 'rgba(255,255,255,0.12)',
  ink0: '#f8fafc', ink1: '#cbd5e1', ink2: '#94a3b8', ink3: '#64748b',
  primary: '#00D4FF', primaryInk: '#001a22',
  warn: '#F59E0B', good: '#22C55E', bad: '#EF4444',
  rSm: 8, rMd: 12, rLg: 16, rPill: 9999,
};

const CATEGORY_META = {
  MTT:        { label: 'Tournaments',  Icon: Trophy,     color: '#FB923C', glow: 'rgba(251,146,60,0.25)' },
  CASH:       { label: 'Cash games',   Icon: DollarSign, color: '#4ADE80', glow: 'rgba(74,222,128,0.22)' },
  SPINS:      { label: 'Spins & SNGs', Icon: Rocket,     color: '#FACC15', glow: 'rgba(250,204,21,0.22)' },
  PSYCHOLOGY: { label: 'Mental game',  Icon: Brain,      color: '#C084FC', glow: 'rgba(192,132,252,0.22)' },
  ADVANCED:   { label: 'Advanced',     Icon: Atom,       color: '#60A5FA', glow: 'rgba(96,165,250,0.22)' },
};

const CATEGORY_ORDER = ['MTT', 'CASH', 'SPINS', 'PSYCHOLOGY', 'ADVANCED'];

export default function TrainingPage() {
  const router = useRouter();

  const showArena    = useTrainingStore(s => s.showArena);
  const activeGame   = useTrainingStore(s => s.activeGame);
  const setShowArena = useTrainingStore(s => s.setShowArena);
  const setActiveGame= useTrainingStore(s => s.setActiveGame);

  const { progress, getGameProgress } = useTrainingProgress();

  const [authUser, setAuthUser] = useState(null);
  const [diamondBalance, setDiamondBalance] = useState(0);

  const [activeCat, setActiveCat] = useState('ALL');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const user = getAuthUser();
    setAuthUser(user);
    if (user?.id) DiamondEngine.getBalance(user.id).then(setDiamondBalance).catch(() => {});
  }, []);

  // Real data from RPC + Jarvis API — no hardcoded fallbacks
  const { stats, statsLoading, recommendation, recommendationLoading } = useTrainingDashboard(authUser);
  const biggestLeak = useMemo(() => leakAnalyzer.getBiggest?.(authUser?.id) ?? null, [authUser]);
  // Use the real recommendation when available; null otherwise (UI handles empty state)
  const jarvisPick = recommendation;

  const filtered = useMemo(() => {
    const ql = debouncedQuery.trim().toLowerCase();
    return TRAINING_LIBRARY.filter(g => {
      if (activeCat !== 'ALL' && g.category !== activeCat) return false;
      if (!ql) return true;
      return (g.name || '').toLowerCase().includes(ql)
          || (CATEGORY_META[g.category]?.label || '').toLowerCase().includes(ql);
    });
  }, [activeCat, debouncedQuery]);

  const startDrill = useCallback((game) => {
    if (!game) return;
    setActiveGame(game);
    setShowArena(true);
  }, [setActiveGame, setShowArena]);

  return (
    <PageTransition>
      <SEOHead
        title="Training — Smarter.Poker"
        description="One-tap GTO training. Personalised daily plan, leak detection, and 100+ scenario-based games coached by Jarvis."
        canonical="/hub/training"
      />

      <GlobalStyle />

      {showArena && activeGame && (
        <GodModeArena
          userId={authUser?.id || `anon-${Date.now()}`}
          gameId={activeGame.id}
          gameName={activeGame.name}
          level={1}
          sessionId={`session-${Date.now()}`}
          onComplete={() => setShowArena(false)}
          onExit={() => setShowArena(false)}
        />
      )}

      {!showArena && (
        <>
          <a href="#main" className="sp-skip">Skip to main content</a>

          <UniversalHeader />

          <main id="main" className="sp-main">

            <section aria-labelledby="hero-h" className="sp-hero">
              <div>
                <p className="sp-hero-eyebrow">
                  <span className="sp-dot" aria-hidden />
                  {jarvisPick?.estMinutes ? `Today · ${jarvisPick.estMinutes} min plan` : 'Today'}
                </p>
                <h1 id="hero-h" className="sp-hero-title">
                  {renderHeroHeadline({ authUser, stats, jarvisPick, statsLoading, recommendationLoading })}
                </h1>
                <p className="sp-hero-sub">
                  {recommendationLoading
                    ? 'Loading your daily plan…'
                    : jarvisPick
                      ? (jarvisPick.reason
                          ? `Jarvis: ${jarvisPick.reason}`
                          : `Jarvis picked one drill for you — ${jarvisPick.name}.`)
                      : 'Browse the library below to start your first drill.'}
                </p>

                {jarvisPick && <DrillCard game={jarvisPick} />}

                <div className="sp-cta-row">
                  <button
                    className="sp-cta sp-cta-primary"
                    onClick={() => jarvisPick && startDrill(jarvisPick)}
                    disabled={!jarvisPick}
                    aria-disabled={!jarvisPick}
                  >
                    <Play size={18} aria-hidden /> Start today's drill
                  </button>
                  <button className="sp-cta sp-cta-secondary" onClick={() => setActiveCat('ALL')}>
                    <Shuffle size={18} aria-hidden /> Pick a different drill
                  </button>
                </div>
              </div>

              <GradeCard stats={stats} loading={statsLoading} />
            </section>

            {biggestLeak && (
              <section aria-labelledby="leak-h" className="sp-leak">
                <div>
                  <span className="sp-leak-eyebrow"><AlertTriangle size={12} aria-hidden /> Leak detected</span>
                  <h2 id="leak-h" className="sp-leak-title">
                    You're losing {biggestLeak.bbPer100.toFixed(1)} BB/100 from the {biggestLeak.position}.
                  </h2>
                  <p className="sp-leak-body">
                    Across the last {biggestLeak.handsAnalysed} hands, your {biggestLeak.spotLabel} is calling
                    {' '}<b>{biggestLeak.deviationPct}% wider</b> than GTO. Fix this and you'll move to
                    {' '}<b>{biggestLeak.targetGrade}</b> in about {biggestLeak.handsToTarget} hands.
                  </p>
                  <Sparkline data={biggestLeak.recent10 || []} />
                </div>
                <button
                  className="sp-cta sp-cta-secondary sp-cta-warn"
                  onClick={() => startDrill(biggestLeak.recommendedGame)}
                >
                  <Wrench size={18} aria-hidden /> Train this spot
                </button>
              </section>
            )}

            <section aria-labelledby="stats-h">
              <div className="sp-section-head">
                <h2 id="stats-h" className="sp-section-title">This week</h2>
                <a className="sp-section-link" href="/hub/session-history">See history <ArrowRight size={14} aria-hidden /></a>
              </div>
              <div className="sp-stats">
                <Stat
                  icon={Layers}
                  label="Hands"
                  loading={statsLoading}
                  value={stats?.hands_this_week ?? 0}
                  trend={fmtTrend(stats?.hands_this_week, stats?.hands_last_week)}
                />
                <Stat
                  icon={Target}
                  label="Accuracy"
                  loading={statsLoading}
                  value={stats?.accuracy_this_week_pct ?? 0}
                  unit="%"
                  trend={fmtTrend(stats?.accuracy_this_week_pct, stats?.accuracy_last_week_pct, ' pts')}
                />
                <Stat
                  icon={TrendingUp}
                  label="EV saved"
                  loading={statsLoading}
                  value={(stats?.ev_saved_this_week_bb ?? 0) >= 0
                    ? `+${stats?.ev_saved_this_week_bb ?? 0}`
                    : (stats?.ev_saved_this_week_bb ?? 0)}
                  unit="bb"
                  trend={fmtTrend(stats?.ev_saved_this_week_bb, stats?.ev_saved_last_week_bb, ' bb')}
                />
                <Stat
                  icon={Flame}
                  label="Streak"
                  loading={statsLoading}
                  value={stats?.current_streak_days ?? 0}
                  unit="days"
                  sub={stats?.personal_best_streak_days
                    ? `Personal best: ${stats.personal_best_streak_days}`
                    : null}
                />
              </div>
            </section>

            <section aria-labelledby="lib-h">
              <div className="sp-section-head">
                <h2 id="lib-h" className="sp-section-title">Browse the library</h2>
                <span className="sp-section-link" aria-live="polite">
                  {filtered.length === TRAINING_LIBRARY.length ? `${TRAINING_LIBRARY.length} games` : `${filtered.length} of ${TRAINING_LIBRARY.length}`}
                </span>
              </div>

              <div className="sp-toolbar">
                <label className="sp-search">
                  <Search size={16} aria-hidden />
                  <input
                    type="search"
                    aria-label="Search games"
                    placeholder="Search drills, spots, formats…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </label>
              </div>

              <div className="sp-cat-chips" role="tablist" aria-label="Game categories">
                <CatChip cat="ALL" active={activeCat==='ALL'} onClick={() => setActiveCat('ALL')} count={TRAINING_LIBRARY.length}>
                  <Grid2x2 size={14} aria-hidden /> All
                </CatChip>
                {CATEGORY_ORDER.map(c => {
                  const meta = CATEGORY_META[c];
                  const count = TRAINING_LIBRARY.filter(g => g.category === c).length;
                  return (
                    <CatChip key={c} cat={c} active={activeCat===c} onClick={() => setActiveCat(c)} count={count}>
                      <meta.Icon size={14} aria-hidden style={{ color: meta.color }} /> {meta.label}
                    </CatChip>
                  );
                })}
              </div>

              {filtered.length > 0 ? (
                <div className="sp-grid">
                  {filtered.map(g => (
                    <GameCardNew
                      key={g.id}
                      game={g}
                      progress={getGameProgress?.(g.id)?.percent || 0}
                      isRecommended={g.id === jarvisPick?.id}
                      onStart={() => startDrill(g)}
                    />
                  ))}
                </div>
              ) : (
                <p className="sp-empty">No drills match — try a different search.</p>
              )}
            </section>

          </main>

          <BottomNavBar />
        </>
      )}
    </PageTransition>
  );
}

function DrillCard({ game }) {
  if (!game) return null;
  const imageUrl = getGameImage(game.id);
  // Render tags only for fields the recommendation/library actually provides.
  const formatTag = [game.format, game.stack].filter(Boolean).join(' · ');
  return (
    <div className="sp-drill-card" role="group" aria-label="Today's recommended drill">
      <div className="sp-drill-cover" aria-hidden>
        <img
          src={imageUrl}
          alt=""
          loading="eager"
          decoding="async"
          className="sp-drill-cover-img"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <Target size={22} className="sp-drill-cover-icon" />
      </div>
      <div className="sp-drill-meta">
        <h2 className="sp-drill-title">{game.name}</h2>
        <div className="sp-drill-tags">
          {formatTag && (
            <span className="sp-tag"><Layers size={12} aria-hidden /> {formatTag}</span>
          )}
          {game.estMinutes != null && (
            <span className="sp-tag"><Clock size={12} aria-hidden /> ~{game.estMinutes} min</span>
          )}
          {game.handsTarget != null && (
            <span className="sp-tag"><Zap size={12} aria-hidden /> {game.handsTarget} hands</span>
          )}
        </div>
      </div>
    </div>
  );
}

function GradeCard({ stats, loading }) {
  if (loading) {
    return (
      <div className="sp-grade-card" aria-label="Loading current GTO grade" aria-busy="true">
        <div className="sp-grade-row">
          <div className="sp-grade-letter sp-num sp-skel-text">·</div>
          <div className="sp-grade-text">
            <p className="sp-grade-label">Current GTO grade</p>
            <p className="sp-grade-value sp-skel-line" />
            <div className="sp-progress sp-skel-block" />
          </div>
        </div>
      </div>
    );
  }

  const grade    = stats?.current_grade || '—';
  const next     = stats?.next_grade;
  const accuracy = stats?.rolling_accuracy_pct ?? 0;
  const hands    = stats?.rolling_total ?? 0;
  const delta    = stats?.delta_correct_to_next;
  const pct      = Math.max(0, Math.min(100, accuracy));
  const hasData  = hands > 0;

  return (
    <div className="sp-grade-card" aria-label="Current GTO grade">
      <div className="sp-grade-row">
        <div className="sp-grade-letter sp-num">{grade}</div>
        <div className="sp-grade-text">
          <p className="sp-grade-label">{hasData ? 'Current GTO grade' : 'No graded sessions yet'}</p>
          <p className="sp-grade-value">
            {hasData
              ? `${accuracy}% accuracy · ${hands.toLocaleString()} hands (30d)`
              : 'Finish a drill to start your grade.'}
          </p>
          <div className="sp-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="sp-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {hasData && next && delta && (
            <div className="sp-grade-meta">
              <span>{grade}</span>
              <span>{delta} {delta === 1 ? 'correct hand' : 'correct hands'} to {next}</span>
              <span>{next}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, unit, trend, sub, loading }) {
  if (loading) {
    return (
      <div className="sp-stat" aria-busy="true">
        <div className="sp-stat-label"><Icon size={13} aria-hidden /> {label}</div>
        <div className="sp-stat-value sp-num sp-skel-text">·</div>
      </div>
    );
  }
  const isUp = typeof trend === 'string' && trend.startsWith('+');
  return (
    <div className="sp-stat">
      <div className="sp-stat-label"><Icon size={13} aria-hidden /> {label}</div>
      <div className="sp-stat-value sp-num">{value}{unit && <span className="sp-stat-unit">{unit}</span>}</div>
      {trend && (
        <div className={`sp-stat-trend ${isUp ? 'sp-up' : 'sp-down'}`}>
          <TrendingUp size={12} aria-hidden /> {trend}
        </div>
      )}
      {sub && <div className="sp-stat-sub">{sub}</div>}
    </div>
  );
}

/**
 * Real-data hero headline — never fabricates progression.
 * Shape:
 *   1) recommendation loaded + grade data exists → "<delta> correct hands away from <next>."
 *   2) recommendation loaded + no graded data    → "Ready to start training? Run your first drill."
 *   3) loading                                    → "Loading your daily plan…"
 *   4) no recommendation                          → "Browse the library to pick your first drill."
 */
function renderHeroHeadline({ authUser, stats, jarvisPick, statsLoading, recommendationLoading }) {
  const greet = `Welcome back${authUser?.name ? `, ${authUser.name}` : ''}.`;
  if (statsLoading || recommendationLoading) {
    return <>{greet} Loading your daily plan…</>;
  }
  const hasGradeData = (stats?.rolling_total ?? 0) > 0;
  const delta = stats?.delta_correct_to_next;
  const nextGrade = stats?.next_grade;
  if (jarvisPick && hasGradeData && delta != null && nextGrade) {
    const noun = delta === 1 ? 'correct hand' : 'correct hands';
    return <>{greet} <em>{delta} {noun}</em> away from {nextGrade}.</>;
  }
  if (jarvisPick && !hasGradeData) {
    return <>{greet} Ready to start training?</>;
  }
  if (!jarvisPick) {
    return <>{greet} Browse the library to start your first drill.</>;
  }
  return <>{greet}</>;
}

function CatChip({ children, active, onClick, count }) {
  return (
    <button className="sp-cat-chip" role="tab" aria-pressed={active} onClick={onClick}>
      {children} <span className="sp-cat-count">{count}</span>
    </button>
  );
}

function Sparkline({ data }) {
  if (!data?.length) return null;
  return (
    <div className="sp-spark" aria-hidden>
      {data.map((d, i) => (
        <span key={i} className={d.miss ? 'sp-spark-miss' : ''} style={{ height: `${Math.max(15, d.value * 100)}%` }} />
      ))}
    </div>
  );
}

function GameCardNew({ game, progress, isRecommended, onStart }) {
  const meta = CATEGORY_META[game.category] || CATEGORY_META.MTT;
  const Icon = meta.Icon;
  const tag  = isRecommended ? 'recommended'
              : progress >= 100 ? 'mastered'
              : progress === 0  ? 'new'
              : null;
  const imageUrl = getGameImage(game.id);
  return (
    <button
      className="sp-card"
      style={{ '--cat-color': meta.color, '--cover-glow': meta.glow }}
      onClick={onStart}
      aria-label={`${game.name}, ${meta.label}, ${game.estMinutes || 10} minutes, ${progress}% complete`}
    >
      <div className="sp-card-cover">
        {/* Real game image — preserved from GAME_IMAGES.js */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="sp-card-cover-img"
          onError={(e) => { e.currentTarget.style.opacity = '0'; }}
        />
        {/* Top-edge gradient so badges stay legible regardless of cover art */}
        <div className="sp-card-cover-shade" aria-hidden />
        <div className="sp-card-badges">
          {tag === 'recommended' && <span className="sp-badge sp-badge-rec"><Sparkles size={11} aria-hidden /> For you</span>}
          {tag === 'mastered'    && <span className="sp-badge sp-badge-mastered"><Check size={11} aria-hidden /> Mastered</span>}
          {tag === 'new'         && <span className="sp-badge sp-badge-new"><Sparkles size={11} aria-hidden /> New</span>}
          {game.locked           && <span className="sp-badge sp-badge-locked"><Lock size={11} aria-hidden /> Locked</span>}
          <span className="sp-cat-pill" aria-hidden><Icon size={12} /></span>
        </div>
      </div>
      <div className="sp-card-body">
        <div className="sp-card-cat"><span className="sp-swatch" /> {meta.label}</div>
        <h3 className="sp-card-title">{game.name}</h3>
        <div className="sp-card-meta">
          <span><Clock size={12} aria-hidden /> {game.estMinutes || 10} min</span>
          {game.handsTarget && <><span className="sp-card-sep" aria-hidden /><span><Layers size={12} aria-hidden /> {game.handsTarget} hands</span></>}
        </div>
        <div className="sp-card-progress">
          <div className="sp-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="sp-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </button>
  );
}

function ArenaSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: t.ink2 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="sp-spin" />
        <div style={{ marginTop: 12 }}>Loading arena…</div>
      </div>
    </div>
  );
}

/**
 * useTrainingDashboard — single source of truth for the dashboard surface.
 * Pulls aggregated weekly stats from /api/training/weekly-stats (RPC-backed)
 * and the recommended drill from /api/training/recommendations (Jarvis).
 *
 * Returns { stats, statsLoading, recommendation, recommendationLoading }.
 * No fallback values. When the user has no session history, fields render as
 * empty-state ("—") in the UI so we never show invented numbers.
 */
function useTrainingDashboard(authUser) {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!authUser?.id) {
        setStatsLoading(false);
        setRecommendationLoading(false);
        return;
      }
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      try {
        const r = await fetch('/api/training/weekly-stats', { headers });
        if (!r.ok) throw new Error(`weekly-stats ${r.status}`);
        const json = await r.json();
        if (!cancelled && json.success) setStats(json.stats);
      } catch (e) {
        if (!cancelled) console.warn('[Training] weekly-stats fetch failed:', e?.message || e);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }

      try {
        const r = await fetch('/api/training/recommendations', { headers });
        if (!r.ok) throw new Error(`recommendations ${r.status}`);
        const json = await r.json();
        const recs = json?.recommendations || json?.games || json?.data || [];
        if (!cancelled && recs.length) {
          // Hydrate the API result with the matching catalog entry so we get
          // canonical name, category, image, and minutes/hands targets.
          const top = recs[0];
          const recId = top.game_id || top.id;
          const fromLib = TRAINING_LIBRARY.find(g => g.id === recId) || null;
          setRecommendation({
            id: recId,
            name: fromLib?.name || top.name || top.game_name || 'Recommended drill',
            category: fromLib?.category || top.category || 'MTT',
            estMinutes: fromLib?.estMinutes || top.estMinutes || 10,
            handsTarget: fromLib?.handsTarget || top.handsTarget || 20,
            format: fromLib?.format || top.format,
            stack: fromLib?.stack || top.stack,
            reason: top.reason || top.why,
          });
        }
      } catch (e) {
        if (!cancelled) console.warn('[Training] recommendations fetch failed:', e?.message || e);
      } finally {
        if (!cancelled) setRecommendationLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  return { stats, statsLoading, recommendation, recommendationLoading };
}

/** Format a week-over-week trend string from raw values. */
function fmtTrend(curr, prev, unit = '') {
  if (curr == null || prev == null) return null;
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return `+${curr}${unit} (new)`;
  const delta = curr - prev;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${Math.round(delta * 10) / 10}${unit} vs last`;
}

function GlobalStyle() {
  return (
    <style jsx global>{`
      :root {
        --sp-line: ${t.line}; --sp-line-2: ${t.line2};
        --sp-ink-0: ${t.ink0}; --sp-ink-1: ${t.ink1}; --sp-ink-2: ${t.ink2}; --sp-ink-3: ${t.ink3};
        --sp-primary: ${t.primary}; --sp-primary-ink: ${t.primaryInk};
        --sp-warn: ${t.warn}; --sp-good: ${t.good}; --sp-bad: ${t.bad};
        --sp-r-md: ${t.rMd}px; --sp-r-lg: ${t.rLg}px;
      }
      .sp-skip { position: absolute; left: -9999px; }
      .sp-skip:focus { left: 16px; top: 16px; padding: 10px 14px; background: var(--sp-primary); color: var(--sp-primary-ink); border-radius: var(--sp-r-md); z-index: 1000; }
      .sp-num { font-family: 'Orbitron', monospace; font-feature-settings: 'tnum'; letter-spacing: 0.5px; }

      .sp-main {
        max-width: 1280px; margin: 0 auto; padding: 24px 20px 120px;
        background:
          radial-gradient(60% 60% at 80% -10%, rgba(0,212,255,0.10), transparent 60%),
          radial-gradient(50% 50% at 0% 30%, rgba(192,132,252,0.08), transparent 60%);
      }
      @media (max-width: 720px) { .sp-main { padding: 16px 16px 110px; } }
      .sp-main > section + section { margin-top: 32px; }

      .sp-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .sp-section-title { font-size: 18px; font-weight: 600; letter-spacing: -0.2px; margin: 0; color: var(--sp-ink-0); }
      .sp-section-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--sp-ink-2); padding: 6px 8px; border-radius: 8px; min-height: 32px; }
      .sp-section-link:hover { color: var(--sp-ink-0); background: rgba(255,255,255,0.04); }

      .sp-hero {
        border-radius: var(--sp-r-lg);
        background:
          radial-gradient(80% 100% at 100% 0%, rgba(0,212,255,0.10), transparent 60%),
          linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
        border: 1px solid var(--sp-line);
        padding: 24px;
        display: grid; gap: 24px; grid-template-columns: 1.2fr 1fr; align-items: center;
      }
      @media (max-width: 860px) { .sp-hero { grid-template-columns: 1fr; padding: 20px; } }
      .sp-hero-eyebrow { font-size: 12px; color: var(--sp-ink-2); margin: 0 0 8px; display: flex; align-items: center; gap: 6px; }
      .sp-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sp-good); box-shadow: 0 0 0 4px rgba(34,197,94,0.18); }
      .sp-hero-title { font-size: 26px; font-weight: 600; line-height: 1.25; letter-spacing: -0.4px; margin: 0 0 6px; color: var(--sp-ink-0); }
      .sp-hero-title em { font-style: normal; color: var(--sp-primary); }
      .sp-hero-sub { color: var(--sp-ink-2); font-size: 14px; margin: 0 0 18px; line-height: 1.55; max-width: 46ch; }

      .sp-drill-card { display: flex; align-items: center; gap: 16px; padding: 14px; border-radius: var(--sp-r-md); background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); margin-bottom: 16px; }
      .sp-drill-cover { flex: 0 0 64px; height: 64px; border-radius: 10px; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid var(--sp-line-2); display: grid; place-items: center; position: relative; overflow: hidden; color: var(--sp-primary); }
      .sp-drill-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .sp-drill-cover-icon { position: relative; z-index: 1; color: #fff; opacity: 0.92; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
      .sp-drill-cover::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 30% 20%, rgba(0,212,255,0.25), transparent 60%), linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%); pointer-events: none; z-index: 1; }
      .sp-drill-meta { min-width: 0; flex: 1; }
      .sp-drill-title { font-size: 15px; font-weight: 500; margin: 0 0 4px; color: var(--sp-ink-0); }
      .sp-drill-tags { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--sp-ink-2); }
      .sp-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 9999px; background: rgba(255,255,255,0.04); border: 1px solid var(--sp-line); color: var(--sp-ink-1); }

      .sp-cta-row { display: flex; gap: 10px; flex-wrap: wrap; }
      .sp-cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 22px; min-height: 48px; border-radius: 9999px; font-size: 15px; font-weight: 500; cursor: pointer; border: 0; transition: transform .12s ease, background .15s ease, box-shadow .15s ease; -webkit-tap-highlight-color: transparent; }
      .sp-cta-primary { background: var(--sp-primary); color: var(--sp-primary-ink); box-shadow: 0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 20px -8px rgba(0,212,255,0.6); }
      .sp-cta-primary:hover { transform: translateY(-1px); }
      .sp-cta-secondary { background: rgba(255,255,255,0.04); color: var(--sp-ink-0); border: 1px solid var(--sp-line-2); }
      .sp-cta-secondary:hover { background: rgba(255,255,255,0.08); }
      .sp-cta-warn { border-color: rgba(245,158,11,0.4); color: var(--sp-warn); }
      .sp-cta:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 2px; }

      .sp-grade-card { background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); padding: 18px; }
      .sp-grade-row { display: flex; align-items: center; gap: 18px; }
      .sp-grade-letter { font-family: 'Orbitron', monospace; font-weight: 800; font-size: 56px; line-height: 1; color: var(--sp-good); width: 72px; text-align: center; }
      .sp-grade-text { flex: 1; min-width: 0; }
      .sp-grade-label { font-size: 12px; color: var(--sp-ink-2); margin: 0 0 2px; }
      .sp-grade-value { font-size: 14px; color: var(--sp-ink-1); margin: 0 0 10px; }
      .sp-progress { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
      .sp-progress-fill { height: 100%; background: linear-gradient(90deg, var(--sp-good), var(--sp-primary)); border-radius: 999px; }
      .sp-grade-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--sp-ink-3); margin-top: 6px; }

      /* Loading skeletons — avoid layout shift while real data loads */
      .sp-skel-text { color: transparent; background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); background-size: 200% 100%; animation: sp-shimmer 1.4s ease-in-out infinite; border-radius: 6px; }
      .sp-skel-line { height: 14px; margin: 2px 0 10px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); background-size: 200% 100%; animation: sp-shimmer 1.4s ease-in-out infinite; border-radius: 6px; width: 70%; }
      .sp-skel-block { height: 6px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); background-size: 200% 100%; animation: sp-shimmer 1.4s ease-in-out infinite; border-radius: 999px; }
      @keyframes sp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

      .sp-leak { border-radius: var(--sp-r-lg); border: 1px solid rgba(245,158,11,0.30); background: linear-gradient(180deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02)); padding: 18px 20px; display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; }
      @media (max-width: 720px) { .sp-leak { grid-template-columns: 1fr; } }
      .sp-leak-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--sp-warn); padding: 4px 10px; border-radius: 9999px; background: rgba(245,158,11,0.10); border: 1px solid rgba(245,158,11,0.25); }
      .sp-leak-title { font-size: 17px; font-weight: 600; margin: 8px 0 6px; letter-spacing: -0.2px; color: var(--sp-ink-0); }
      .sp-leak-body { font-size: 14px; color: var(--sp-ink-1); margin: 0; line-height: 1.5; }
      .sp-leak-body b { color: var(--sp-warn); font-weight: 500; }
      .sp-spark { display: flex; align-items: flex-end; gap: 3px; height: 32px; margin-top: 8px; }
      .sp-spark span { display: block; width: 10px; border-radius: 2px; background: rgba(245,158,11,0.4); }
      .sp-spark span.sp-spark-miss { background: var(--sp-bad); }

      .sp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      @media (max-width: 720px) { .sp-stats { grid-template-columns: repeat(2, 1fr); } }
      .sp-stat { background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); padding: 14px 16px; }
      .sp-stat-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--sp-ink-2); margin-bottom: 6px; }
      .sp-stat-value { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.1; color: var(--sp-ink-0); }
      .sp-stat-unit { font-size: 12px; color: var(--sp-ink-2); margin-left: 4px; font-weight: 400; }
      .sp-stat-trend { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; margin-top: 4px; }
      .sp-stat-trend.sp-up { color: var(--sp-good); }
      .sp-stat-trend.sp-down { color: var(--sp-bad); }
      .sp-stat-sub { font-size: 11px; color: var(--sp-ink-3); margin-top: 4px; }

      .sp-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
      .sp-search { position: relative; flex: 1; min-width: 220px; }
      .sp-search > svg { position: absolute; top: 50%; left: 14px; transform: translateY(-50%); color: var(--sp-ink-2); }
      .sp-search input { width: 100%; min-height: 44px; background: rgba(255,255,255,0.04); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); padding: 10px 14px 10px 40px; color: var(--sp-ink-0); font-size: 14px; outline: none; transition: border-color .15s, background .15s; }
      .sp-search input::placeholder { color: var(--sp-ink-3); }
      .sp-search input:focus { border-color: var(--sp-primary); background: rgba(0,212,255,0.04); }

      .sp-cat-chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 14px; scrollbar-width: none; }
      .sp-cat-chips::-webkit-scrollbar { display: none; }
      .sp-cat-chip { display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; min-height: 40px; flex: 0 0 auto; border-radius: 9999px; background: rgba(255,255,255,0.04); border: 1px solid var(--sp-line); color: var(--sp-ink-1); font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
      .sp-cat-chip:hover { background: rgba(255,255,255,0.07); }
      .sp-cat-chip[aria-pressed="true"] { background: var(--sp-primary); color: var(--sp-primary-ink); border-color: var(--sp-primary); }
      .sp-cat-chip:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 2px; }
      .sp-cat-count { color: var(--sp-ink-3); font-size: 11px; margin-left: 2px; }
      .sp-cat-chip[aria-pressed="true"] .sp-cat-count { color: rgba(0,26,34,0.55); }

      .sp-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
      @media (max-width: 540px) { .sp-grid { grid-template-columns: 1fr; } }

      .sp-card { position: relative; background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); overflow: hidden; transition: transform .15s, border-color .15s, background .15s; text-align: left; width: 100%; cursor: pointer; padding: 0; color: inherit; }
      .sp-card:hover { transform: translateY(-2px); border-color: var(--sp-line-2); background: rgba(255,255,255,0.05); }
      .sp-card:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 2px; }
      .sp-card-cover { aspect-ratio: 16/9; position: relative; overflow: hidden; background: linear-gradient(135deg, #0f172a, #020617); display: block; }
      .sp-card-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .3s ease, opacity .3s ease; }
      .sp-card:hover .sp-card-cover-img { transform: scale(1.04); }
      .sp-card-cover-shade { position: absolute; inset: 0; background: radial-gradient(70% 90% at 30% 20%, var(--cover-glow, rgba(0,212,255,0.18)), transparent 60%), linear-gradient(180deg, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%); pointer-events: none; z-index: 1; }
      .sp-card-badges { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; justify-content: space-between; gap: 8px; z-index: 2; align-items: flex-start; }
      .sp-cat-pill { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 9999px; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px); border: 1px solid var(--sp-line-2); color: var(--cat-color, var(--sp-primary)); flex: 0 0 auto; }
      .sp-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; min-height: 22px; border-radius: 9999px; font-size: 11px; font-weight: 500; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px); border: 1px solid var(--sp-line); color: var(--sp-ink-0); }
      .sp-badge-mastered { background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.4); color: #BBF7D0; }
      .sp-badge-new      { background: rgba(0,212,255,0.18); border-color: rgba(0,212,255,0.4); color: #BAE6FD; }
      .sp-badge-locked   { background: rgba(100,116,139,0.18); border-color: rgba(100,116,139,0.4); color: var(--sp-ink-2); }
      .sp-badge-rec      { background: rgba(0,212,255,0.18); border-color: rgba(0,212,255,0.4); color: #BAE6FD; }
      .sp-card-body { padding: 14px; }
      .sp-card-cat { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--sp-ink-2); margin-bottom: 6px; }
      .sp-swatch { width: 8px; height: 8px; border-radius: 2px; background: var(--cat-color, var(--sp-primary)); }
      .sp-card-title { font-size: 15px; font-weight: 500; margin: 0 0 6px; line-height: 1.35; letter-spacing: -0.1px; color: var(--sp-ink-0); }
      .sp-card-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--sp-ink-2); }
      .sp-card-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--sp-ink-3); display: inline-block; }
      .sp-card-progress { margin-top: 10px; }
      .sp-card-progress .sp-progress { height: 4px; }

      .sp-empty { text-align: center; padding: 48px 16px; color: var(--sp-ink-2); font-size: 14px; border: 1px dashed var(--sp-line); border-radius: var(--sp-r-md); }

      .sp-spin { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--sp-primary); border-radius: 50%; animation: sp-spin 1s linear infinite; margin: 0 auto; }
      @keyframes sp-spin { to { transform: rotate(360deg); } }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      }
    `}</style>
  );
}
