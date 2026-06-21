import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import SectionHeader from '../../../src/components/ui/SectionHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import {
  RefreshCw,
  Activity,
  Database,
  Clock,
  ServerCrash,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Layers,
  Bell,
} from 'lucide-react';
import { logError } from '@/utils/logger';

class StatusErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    seo: React.ReactNode;
    header: React.ReactNode;
    nav: React.ReactNode;
  },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    logError('Status UI Error', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
          {this.props.seo}
          {this.props.header}
          {this.props.nav}
          <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
            <div
              className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF4444]/50 shadow-[0_0_20px_rgba(255,68,68,0.15)] relative overflow-hidden max-w-md w-full"
              role="alert"
            >
              <ServerCrash className="w-12 h-12 text-[#FF4444] mx-auto mb-4 relative z-10" aria-hidden="true" />
              <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10 font-['Rajdhani']">
                Render Error
              </h2>
              <p className="text-slate-400 text-xs relative z-10 mb-6 break-words">
                {this.state.error?.message || 'An unexpected rendering error occurred.'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 hex-button px-4 py-3 rounded text-xs font-bold tracking-widest uppercase touch-manipulation"
              >
                <RefreshCw size={14} />
                Reload
              </button>
            </div>
          </main>
          <BottomNavBar />
        </div>
      );
    }
    return this.props.children;
  }
}

interface MLBStatusPayload {
  ok: boolean;
  error?: string;
  serverNow: string | null;
  today: string | null;
  aggAsOf: string | null;
  isSystemFresh: boolean;
  pipeline: {
    okCount: number;
    errorCount: number;
    total: number;
    hasError: boolean;
  };
  health: {
    minutes_since_refresh?: number | null;
    last_refresh?: string | null;
    is_stale?: boolean;
    slate_as_of?: string | null;
    games_in_run?: number | null;
    games_in_slate?: number | null;
    total_live_recs?: number | null;
    unmodeled_games?: number | null;
    incoherent_runlines_with_bet?: number | null;
  };
  slate: {
    mkt?: number | null;
    props?: number | null;
    best?: number | null;
  };
  accuracy: {
    wtd_avg_brier_ml?: number | null;
    wtd_avg_brier_props?: number | null;
    total_games_evaluated?: number | null;
    daily_samples?: number | null;
  };
  tierDist: Record<string, number>;
  sources: Array<{
    source: string;
    status: string;
    pulled_at?: string | null;
    row_count?: number | null;
  }>;
  alerts: Array<{
    id?: number;
    created_at?: string | null;
    alert_type?: string;
    level?: string;
    message?: string;
    source?: string;
    fired_at?: string | null;
  }>;
  tableCounts: Record<string, number>;
  stages: string[];
  latestRuns: Record<
    string,
    {
      step: string;
      stage: string;
      run_ts: string | null;
      status: string;
      duration_sec: number | null;
      rows_written: number | null;
      notes: string | null;
    }
  >;
}

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    logError('SWR Fetch', err);
    throw err;
  }
};

// Human-readable labels for pipeline source keys (matches engine SOURCE_ROWS constant).
const SOURCE_LABEL_MAP: Record<string, string> = {
  daily_predict: 'Predictions',
  odds_api: 'Sportsbook Odds',
  mlb_api: 'MLB API (Schedule/Lineups)',
  fangraphs: 'FanGraphs',
  fangraphs_splits: 'FanGraphs Splits',
  statcast: 'Statcast',
  injuries: 'Injuries',
  weather: 'Weather',
  umpire_scorecards: 'Umpire Scorecards',
};

// Tier rendering order + accent colors (inline styles so Tailwind JIT keeps them).
const TIER_META: { key: string; color: string }[] = [
  { key: 'ELITE', color: '#FFD24A' },
  { key: 'STRONG', color: '#00D4FF' },
  { key: 'LEAN', color: '#5BE0B0' },
  { key: 'THIN', color: '#94a3b8' },
  { key: 'PASS', color: '#64748b' },
];

const TimeAgo = ({
  dateString,
  serverNow,
  fallback = '—',
}: {
  dateString?: string | null;
  serverNow?: string | null;
  fallback?: string;
}) => {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    if (serverNow) {
      const serverClientDiff = new Date(serverNow).getTime() - Date.now();
      setDiff(Number.isNaN(serverClientDiff) ? 0 : serverClientDiff);
    }
  }, [serverNow]);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  
  if (nowMs === null) return <>{fallback}</>;

  if (!dateString) return <>{fallback}</>;
  const isoStr = dateString.trim().replace(' ', 'T');
  const safeDate = isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z';
  const past = new Date(safeDate);
  if (isNaN(past.getTime())) return <>{fallback}</>;
  const effectiveNow = nowMs + diff;
  const diffMs = Math.max(0, effectiveNow - past.getTime());
  const s = Math.round(diffMs / 1000);
  if (s < 45) return <>{'JUST NOW'}</>;
  const m = Math.round(s / 60);
  if (m < 60) return <>{`${m}M AGO`}</>;
  const h = Math.round(m / 60);
  if (h < 24) return <>{`${h}H AGO`}</>;
  const dd = Math.round(h / 24);
  return <>{`${dd}D AGO`}</>;
};



const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  const isoStr = dateString.trim().replace(' ', 'T');
  const safeDate = isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z';
  const d = new Date(safeDate);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const fmt = (n: number | string | null | undefined): string => {
    if (n == null || n === '') return '—';
  const num = Number(n);
    if (isNaN(num) || !isFinite(num)) return '—';
    return num.toLocaleString();
  };

const brierColor = (val: number | string | null | undefined): string => {
  const b = Number(val);
    if (isNaN(b) || val == null || val === '') return 'text-slate-300';
    if (b < 0.2) return 'text-[#00D4FF]';
    if (b <= 0.25) return 'text-[#FFB020]';
    return 'text-[#FF4444]';
  };
const fmtBrier = (val: number | string | null | undefined): string => {
  const b = Number(val);
    return !isNaN(b) && val != null && val !== '' ? b.toFixed(3) : '-';
  };

const alertLevelColor = (level: string | null | undefined): string => {
  const l = String(level || '').toLowerCase();
    if (l === 'critical' || l === 'error') return 'text-[#FF4444] border-[#FF4444]';
    if (l === 'warning' || l === 'warn') return 'text-[#FFB020] border-[#FFB020]';
    return 'text-[#00D4FF] border-[#00D4FF]';
  };

const EMPTY_OBJ: any = {};

const SkeletonDashboard = () => (
  <div className="flex flex-col gap-8 mt-6">
    <div className="px-4 md:px-0">
      <MetalFrame className="px-5 py-4 h-[74px] animate-pulse bg-white/5">
        <div />
      </MetalFrame>
    </div>
    <div className="px-4 md:px-0">
      <div className="h-6 w-48 bg-white/5 rounded animate-pulse mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <MetalFrame key={i} className="p-4 h-[76px] animate-pulse bg-white/5">
            <div />
          </MetalFrame>
        ))}
      </div>
    </div>
    <div className="px-4 md:px-0">
      <div className="h-6 w-48 bg-white/5 rounded animate-pulse mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <MetalFrame key={i} className="p-5 h-[94px] animate-pulse bg-white/5">
            <div />
          </MetalFrame>
        ))}
      </div>
    </div>
  </div>
);

export default function StatusPage() {
  const router = useRouter();
  const { data, error, mutate, isValidating } = useSWR<MLBStatusPayload>(
    '/api/mlb/status',
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      onError: (err) => logError('SWR MLB Status', err),
    }
  );

  const [manualRefreshing, setManualRefreshing] = useState(false);

  const handleRefresh = async () => {
    setManualRefreshing(true);
    await mutate();
    setManualRefreshing(false);
  };

  const isLoading = !data && !error;
  const apiError: string | null = error
    ? 'Failed to reach the status service.'
    : data && data.ok !== true
      ? data.error || 'Failed to load status data.'
      : null;


  const seo = (
    <SEOHead
      title="MLB Analytics Data Status — Pipeline Freshness & System Health | Smarter.Poker"
      description="Real-time status dashboard for the Smarter.Poker MLB Analytics pipeline."
      canonical="/hub/MLB-ANALYTICS/status"
      ogImage="/images/mlb/og.png"
    />
  );

  if (apiError) {
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
        {seo}
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
        <MlbSubNav />
        <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
          <div
            className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF4444]/50 shadow-[0_0_20px_rgba(255,68,68,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden max-w-md w-full"
            role="alert"
          >
            <ServerCrash
              aria-hidden="true"
              className="w-12 h-12 text-[#FF4444] mx-auto mb-4 relative z-10"
            />
            <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10 font-['Rajdhani']">
              System Error
            </h2>
            <p className="text-slate-300 text-xs relative z-10 mb-6 break-words">{apiError}</p>
            <button
              onClick={handleRefresh}
              disabled={manualRefreshing && isValidating}
              className="inline-flex items-center gap-2 hex-button px-4 py-3 rounded text-xs font-bold tracking-widest uppercase touch-manipulation relative z-10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                aria-hidden="true"
                size={14}
                className={isValidating ? 'animate-spin neon-animated drop-shadow-[0_0_8px_#00D4FF]' : ''}
              />
              Retry
            </button>
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  const isSystemFresh = !!data?.isSystemFresh;
  const health = data?.health || EMPTY_OBJ;
  const slate = data?.slate || EMPTY_OBJ;
  const accuracy = data?.accuracy || EMPTY_OBJ;
  const tierDist = data?.tierDist || EMPTY_OBJ;

  const sources = useMemo(
    () => (Array.isArray(data?.sources) ? data.sources : []),
    [data?.sources]
  );
  const alerts = useMemo(() => (Array.isArray(data?.alerts) ? data.alerts : []), [data?.alerts]);
  const tableCounts = typeof data?.tableCounts === 'object' && data.tableCounts !== null ? data.tableCounts : EMPTY_OBJ;
  const stages = useMemo(() => (Array.isArray(data?.stages) ? data.stages : []), [data?.stages]);
  const latestRuns = typeof data?.latestRuns === 'object' && data.latestRuns !== null ? data.latestRuns : EMPTY_OBJ;
  const pipeline = data?.pipeline || { hasError: false, okCount: 0, errorCount: 0, total: 0 };

  const wrappedContent = (
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
      {seo}

      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
      <MlbSubNav />

      <div className="bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[2px] border-[#3d4f5f] p-4 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-extrabold font-['Rajdhani'] uppercase tracking-widest">
            Data <span className="text-[#00D4FF]">Status</span>
          </h1>
          {data?.health?.last_refresh && (
            <div className="text-xs text-slate-400 tracking-widest uppercase mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                Data refreshed{' '}
                <TimeAgo dateString={data.health.last_refresh} serverNow={data?.serverNow} />
              </span>
              {isValidating && !isLoading && (
                <span className="text-[#00D4FF] animate-pulse">&middot; updating&hellip;</span>
              )}
            </div>
          )}
        </div>
        <div className="text-right flex flex-col items-end shrink-0">
          <div className="text-[#00D4FF] text-xs font-bold tracking-widest uppercase">
            SYSTEM
          </div>
          <div
            className="inline-flex items-center gap-1.5 mt-1"
            role="status" aria-live="polite"
            aria-label={`System status: ${isLoading ? 'loading' : isSystemFresh ? 'fresh' : 'stale'}`}
          >
            <div
              className={`w-2 h-2 rounded-full ${isLoading ? 'bg-slate-400' : isSystemFresh ? 'bg-[#00D4FF]' : 'bg-[#FF4444]'}`}
            ></div>
            <div
              className={`text-xs font-bold tracking-widest ${isLoading ? 'text-slate-400' : isSystemFresh ? 'text-[#00D4FF]' : 'text-[#FF4444]'}`}
            >
              {isLoading ? 'LOADING' : isSystemFresh ? 'FRESH' : 'STALE'}
            </div>
          </div>
        </div>
      </div>

      <main className="page-container transition-opacity duration-300">
        <div className="feed-layout">
          <div className="feed-column py-6 md:py-12">
            <div className="flex justify-end mb-4 px-4 md:px-0">
              <button
                onClick={handleRefresh}
                disabled={manualRefreshing && isValidating}
                className="hex-button px-4 py-3 rounded flex items-center gap-2 cursor-pointer text-xs font-extrabold tracking-widest uppercase touch-manipulation disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden="true"
                  size={14}
                  className={isValidating ? 'animate-spin neon-animated drop-shadow-[0_0_8px_#00D4FF]' : ''}
                />
                Refresh
              </button>
            </div>

            {isLoading ? (
              <SkeletonDashboard />
            ) : (
              <>
                <div className="mb-8">
              <MetalFrame className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {pipeline.hasError ? (
                    <AlertTriangle
                      size={22}
                      className="text-[#FF4444] shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2
                      size={22}
                      className="text-[#00D4FF] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <div
                      className={`text-[15px] font-extrabold uppercase tracking-wider font-['Rajdhani'] ${pipeline.hasError ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`}
                    >
                      {pipeline.hasError ? 'Pipeline Errors Detected' : 'All Pipeline Stages OK'}
                    </div>
                    <div className="text-xs text-slate-300 tracking-wider mt-0.5">
                      {fmt(pipeline.okCount)} OK &bull; {fmt(pipeline.total)} STAGES
                    </div>
                  </div>
                </div>
              </MetalFrame>
            </div>

            <div className="mb-8">
              <SectionHeader icon={Clock} label="SYSTEM HEALTH" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
                {[
                  {
                    label: 'LAST REFRESH',
                    val: (
                      <TimeAgo
                        dateString={health.last_refresh}
                        serverNow={data?.serverNow}
                        fallback="-"
                      />
                    ),
                    warn: !!health.is_stale,
                  },
                  { label: 'SLATE AS OF', val: formatDate(health.slate_as_of) || '-', warn: false },
                  {
                    label: 'AGG MARKET',
                    val: (
                      <TimeAgo
                        dateString={data?.aggAsOf}
                        serverNow={data?.serverNow}
                        fallback="-"
                      />
                    ),
                    warn: false,
                  },
                  { label: 'GAMES IN RUN', val: fmt(health.games_in_run), warn: false },
                  { label: 'GAMES IN SLATE', val: fmt(health.games_in_slate), warn: false },
                  { label: 'LIVE RECS', val: fmt(health.total_live_recs), warn: false },
                  {
                    label: 'UNMODELED GAMES',
                    val: fmt(health.unmodeled_games),
                    warn: Number(health.unmodeled_games) > 0,
                  },
                  {
                    label: 'RUNLINE CONFLICTS',
                    val: fmt(health.incoherent_runlines_with_bet),
                    warn: Number(health.incoherent_runlines_with_bet) > 0,
                  },
                ].map((item) => (
                  <MetalFrame key={item.label} className="p-4">
                    <div className="text-xs font-bold text-slate-400 tracking-[0.15em] mb-2">
                      {item.label}
                    </div>
                    <div
                      className={`text-xl font-extrabold font-['Rajdhani'] tabular-nums break-words ${item.warn ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`}
                    >
                      {item.val}
                    </div>
                  </MetalFrame>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <SectionHeader icon={Activity} label="TODAY'S SLATE" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 md:px-0">
                {[
                  { label: 'MARKET BETS', val: slate.mkt },
                  { label: 'PROPS', val: slate.props },
                  { label: 'BEST BETS', val: slate.best },
                ].map((item) => (
                  <MetalFrame key={item.label} className="p-5 text-center">
                    <div className="text-xs font-bold text-slate-400 tracking-[0.15em] mb-2">
                      {item.label}
                    </div>
                    <div className="text-3xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">
                      {fmt(item.val)}
                    </div>
                  </MetalFrame>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <SectionHeader icon={Gauge} label="MODEL ACCURACY" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
                <MetalFrame className="p-4 text-center">
                  <div className="text-xs font-bold text-slate-400 tracking-[0.12em] mb-2">
                    BRIER (ML)
                  </div>
                  <div
                    className={`text-2xl font-extrabold font-['Rajdhani'] tabular-nums ${brierColor(accuracy.wtd_avg_brier_ml)}`}
                  >
                    {fmtBrier(accuracy.wtd_avg_brier_ml)}
                  </div>
                </MetalFrame>
                <MetalFrame className="p-4 text-center">
                  <div className="text-xs font-bold text-slate-400 tracking-[0.12em] mb-2">
                    BRIER (PROPS)
                  </div>
                  <div
                    className={`text-2xl font-extrabold font-['Rajdhani'] tabular-nums ${brierColor(accuracy.wtd_avg_brier_props)}`}
                  >
                    {fmtBrier(accuracy.wtd_avg_brier_props)}
                  </div>
                </MetalFrame>
                <MetalFrame className="p-4 text-center">
                  <div className="text-xs font-bold text-slate-400 tracking-[0.12em] mb-2">
                    GAMES EVAL
                  </div>
                  <div className="text-2xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">
                    {fmt(accuracy.total_games_evaluated)}
                  </div>
                </MetalFrame>
                <MetalFrame className="p-4 text-center">
                  <div className="text-xs font-bold text-slate-400 tracking-[0.12em] mb-2">
                    DAILY SAMPLES
                  </div>
                  <div className="text-2xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">
                    {fmt(accuracy.daily_samples)}
                  </div>
                </MetalFrame>
              </div>
              <div className="text-xs text-slate-400 tracking-wider mt-2 px-4 md:px-0">
                Brier score: lower is better (0.25 = coin flip). Weighted average over recent graded
                slates.
              </div>
            </div>

            {Object.keys(tierDist).length > 0 && (
              <div className="mb-8">
                <SectionHeader icon={Layers} label="BET TIER DISTRIBUTION" />
                <MetalFrame className="p-4 mx-4 md:mx-0">
                  <div className="flex flex-wrap gap-3">
                    {TIER_META.filter((t) => t.key in tierDist).map((t) => (
                      <div
                        key={t.key}
                        className="flex-1 min-w-[80px] text-center rounded-lg border bg-black/30 py-3 px-2"
                        style={{ borderColor: t.color }}
                      >
                        <div
                          className="text-xs font-bold tracking-[0.12em] mb-1"
                          style={{ color: t.color }}
                        >
                          {t.key}
                        </div>
                        <div
                          className="text-xl font-extrabold font-['Rajdhani'] tabular-nums"
                          style={{ color: t.color }}
                        >
                          {fmt(tierDist[t.key])}
                        </div>
                      </div>
                    ))}
                    {Number(tierDist.UNSCORED) > 0 && (
                      <div className="flex-1 min-w-[80px] text-center rounded-lg border border-[#475569] bg-black/30 py-3 px-2">
                        <div className="text-xs font-bold tracking-[0.12em] mb-1 text-slate-400">
                          UNSCORED
                        </div>
                        <div className="text-xl font-extrabold font-['Rajdhani'] tabular-nums text-slate-400">
                          {fmt(tierDist.UNSCORED)}
                        </div>
                      </div>
                    )}
                  </div>
                </MetalFrame>
              </div>
            )}

            <div className="mb-8">
              <SectionHeader icon={Database} label="DATA SOURCE FRESHNESS" />
              <MetalFrame className="p-0">
                {sources.length > 0 ? (
                  <ul className="flex flex-col m-0 p-0 list-none">
                    {sources.map((src, idx) => {
                      const ok = ['ok', 'success', 'done', 'partial'].includes(
                        String(src?.status || '').toLowerCase()
                      );
                      return (
                        <li
                          key={src?.source || idx}
                          className={`flex justify-between items-center px-5 py-3 bg-black/20 gap-3 ${idx !== sources.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-slate-200 tracking-wider truncate">
                              {SOURCE_LABEL_MAP[src?.source] || src?.source || '-'}
                            </div>
                            <div className="text-xs text-slate-400 tracking-wider mt-0.5">
                              <TimeAgo
                                dateString={src?.pulled_at}
                                serverNow={data?.serverNow}
                                fallback="NO PULL DATA"
                              />
                            </div>
                          </div>
                          <div
                            className={`bg-black/50 border px-2.5 py-1 rounded text-xs font-bold tracking-[0.15em] ${ok ? 'text-[#00D4FF] border-[#00D4FF]' : 'text-[#FF4444] border-[#FF4444]'}`}
                          >
                            {String(src?.status || 'UNKNOWN').toUpperCase()}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-xs uppercase">
                    No Data Available
                  </div>
                )}
              </MetalFrame>
            </div>

            <div className="mb-8">
              <SectionHeader icon={Bell} label="RECENT ALERTS" />
              <MetalFrame className="p-0">
                {alerts.length > 0 ? (
                  <ul className="flex flex-col m-0 p-0 list-none">
                    {alerts.map((al, idx) => (
                      <li
                        key={`${al?.id}-${idx}`}
                        className={`flex justify-between items-start px-5 py-3 bg-black/20 gap-3 ${idx !== alerts.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-slate-200 break-words">
                            {al?.message || '-'}
                          </div>
                          <div className="text-xs text-slate-400 tracking-wider mt-0.5 uppercase">
                            {al?.source || 'SYSTEM'}
                          </div>
                        </div>
                        <div
                          className={`bg-black/50 border px-2 py-0.5 rounded text-xs font-bold tracking-[0.15em] ${alertLevelColor(al?.level)}`}
                        >
                          {String(al?.level || 'INFO').toUpperCase()}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-xs uppercase">
                    No Alerts Found
                  </div>
                )}
              </MetalFrame>
            </div>

            <div className="mb-8">
              <SectionHeader icon={CheckCircle2} label="RECENT PIPELINE RUNS" />
              <MetalFrame className="p-0">
                {stages.length > 0 ? (
                  <ul className="flex flex-col m-0 p-0 list-none">
                    {stages.map((stage, idx) => {
                      const run = latestRuns?.[stage];
                      const status = String(run?.status || 'PENDING').toUpperCase();
                      const statusColor = ['ERROR', 'FAILED', 'TIMEOUT', 'CRITICAL'].includes(status)
                        ? 'text-[#FF4444] border-[#FF4444]'
                        : ['OK', 'SUCCESS', 'DONE'].includes(status)
                          ? 'text-[#00D4FF] border-[#00D4FF]'
                          : 'text-[#94a3b8] border-[#475569]';
                      return (
                        <li
                          key={stage}
                          className={`px-5 py-4 flex justify-between items-center gap-3 bg-black/20 ${idx !== stages.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}
                        >
                          <div className="min-w-0">
                            <div className="text-[15px] font-bold text-white uppercase tracking-wider">
                              {stage}
                            </div>
                            <div className="text-xs text-slate-400 mt-1 tracking-wider">
                              {run?.run_ts ? formatDate(run.run_ts) : '—'}
                            </div>
                          </div>
                          <div
                            className={`bg-black/50 border px-2.5 py-1 rounded text-xs font-bold tracking-[0.2em] ${statusColor}`}
                          >
                            {status}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-xs uppercase">
                    No Stages Found
                  </div>
                )}
              </MetalFrame>
            </div>

            <div className="mb-8">
              <SectionHeader icon={Database} label="DB TABLE COUNTS" />
              <MetalFrame className="p-0">
                {Object.keys(tableCounts).length > 0 ? (
                  <ul className="flex flex-col m-0 p-0 list-none">
                    {Object.entries(tableCounts).map(([table, count], idx, arr) => (
                      <li
                        key={table}
                        className={`flex justify-between px-6 py-4 bg-black/20 gap-3 ${idx !== arr.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}
                      >
                        <span className="text-[13px] font-semibold text-slate-400 tracking-wider truncate">
                          {table}
                        </span>
                        <span className="text-[14px] font-bold text-[#00D4FF] tabular-nums shrink-0">
                          {fmt(count as number)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-xs uppercase">
                    No Table Data Available
                  </div>
                )}
              </MetalFrame>
            </div>
          </>
        )}
          </div>
        </div>
      </main>
      <BottomNavBar />
    </div>
  );

  return (
    <StatusErrorBoundary
      seo={seo}
      header={
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
      }
      nav={<MlbSubNav />}
    >
      {wrappedContent}
    </StatusErrorBoundary>
  );
}
