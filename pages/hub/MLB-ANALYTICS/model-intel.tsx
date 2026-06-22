import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import {
  BrainCircuit,
  Activity,
  Loader2,
  RefreshCw,
  TrendingUp,
  Target,
  ShieldCheck,
  AlertTriangle,
  Ban,
  Download,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';
import MlbPremiumGate from '../../../src/components/mlb/MlbPremiumGate';
import useVIP from '../../../src/hooks/useVIP';

// ── Single dynamic chunk for all of recharts ──────────────────────────────────
const PnLChart = dynamic(() => import('../../../src/components/mlb/PnLChart'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
      <div className="text-[#00D4FF] font-bold tracking-widest text-[11px] animate-pulse capitalize">
        Compiling Matrices...
      </div>
    </div>
  ),
});

const ClvTrendChart = dynamic(() => import('../../../src/components/mlb/ClvTrendChart'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-[#00D4FF]" />
    </div>
  ),
});

const CalibrationChart = dynamic(() => import('../../../src/components/mlb/CalibrationChart'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-[#00D4FF]" />
    </div>
  ),
});


/* ─── formatting helpers ────────────────────────────────────────────────────── */

const fmtInt = (v: any): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
};

const fmtPct = (v: any, withSign = true): string => {
  if (v === undefined || v === null || !Number.isFinite(Number(v))) return '--';
  const n = Number(v);
  return `${withSign && n > 0 ? '+' : ''}${n.toFixed(2)}%`;
};

// Bet-type reliability ROI is stored as a fraction (0.208 => 20.8%).
const fmtFracPct = (v: any): string => {
  if (v === undefined || v === null || !Number.isFinite(Number(v))) return '--';
  const n = Number(v) * 100;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};

const fmtBrier = (v: any): string => {
  if (v === undefined || v === null || !Number.isFinite(Number(v))) return '--';
  return Number(v).toFixed(3);
};

const fmtClv = (v: any): string => {
  if (v === undefined || v === null || !Number.isFinite(Number(v))) return '--';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
};

const fmtDate = (v: any): string => {
  if (!v) return '--';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const roiColor = (v: any): string => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '#FFFFFF';
  return n > 0 ? '#00D4FF' : '#FF0055';
};

/* ─── market helpers ────────────────────────────────────────────────────────── */

const MARKET_LABELS: Record<string, string> = {
  h2h: 'Moneyline',
  total: 'Totals',
  run_line: 'Run Line',
  f5_moneyline: 'F5 Moneyline',
  home_run: 'Home Run',
  total_bases: 'Total Bases',
  pitcher_strikeouts: 'Pitcher Ks',
  pitcher_walks: 'Pitcher Walks',
  earned_runs: 'Earned Runs',
  stolen_bases: 'Stolen Bases',
};

const marketLabel = (m: string): string => {
  if (!m) return 'Unknown';
  if (MARKET_LABELS[m]) return MARKET_LABELS[m];
  return m
    .replace(/^prop:/, '')
    .replace(/^market:/, '')
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
};

// Maps each raw market to the filter category it belongs to.
const CATEGORY_MAP: Record<string, string> = {
  h2h: 'Moneyline',
  f5_moneyline: 'Moneyline',
  total: 'Totals',
  team_total: 'Totals',
  run_line: 'Run Line',
  home_run: 'Props',
  total_bases: 'Props',
  pitcher_strikeouts: 'Props',
  pitcher_walks: 'Props',
  earned_runs: 'Props',
  stolen_bases: 'Props',
};

const categoryOf = (market: string): string => {
  const m = (market || '').toLowerCase();
  return CATEGORY_MAP[m] || 'Props';
};

/* ─── sub-components ────────────────────────────────────────────────────────── */

interface MetricBoxProps {
  title: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
  isLoading?: boolean;
  tooltip?: string;
}

const MetricBox = ({
  title,
  value,
  sub,
  valueColor = '#FFFFFF',
  isLoading,
  tooltip,
}: MetricBoxProps) => (
  <div
    className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex flex-col shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_10px_rgba(0,0,0,0.5)] transition-all hover:border-[#00D4FF] hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_15px_rgba(0,212,255,0.2)] cursor-default"
    title={tooltip}
  >
    <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 capitalize">
      {title}
    </div>
    <div
      className="text-xl sm:text-2xl font-extrabold break-words"
      style={{
        color: isLoading ? '#00D4FF' : valueColor,
        textShadow:
          isLoading || valueColor !== '#FFFFFF'
            ? `0 0 10px ${isLoading ? '#00D4FF' : valueColor}80`
            : 'none',
        fontFamily: '"Rajdhani", sans-serif',
      }}
    >
      {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-[#00D4FF]" /> : value}
    </div>
    {sub && (
      <div className="text-[10px] text-slate-500 mt-1 font-bold tracking-widest capitalize">
        {isLoading ? '--' : sub}
      </div>
    )}
  </div>
);

// Skeleton placeholder that matches MetricBox dimensions
const MetricSkeleton = () => (
  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex flex-col animate-pulse">
    <div className="h-2.5 bg-[#1a2332] rounded w-2/3 mb-3" />
    <div className="h-7 bg-[#1a2332] rounded w-3/4 mb-2" />
    <div className="h-2 bg-[#1a2332] rounded w-1/2" />
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2
    className="text-lg font-extrabold text-white mb-4 flex items-center gap-2 capitalize tracking-widest relative z-10"
    style={{ fontFamily: '"Rajdhani", sans-serif' }}
  >
    <div className="w-1 h-[18px] bg-[#00D4FF] rounded-sm shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
    {children}
  </h2>
);

const TrustBadge = ({ status, scoreMult }: { status: string | null; scoreMult: number | null }) => {
  const s = (status || '').toLowerCase();
  let color = '#94A3B8';
  let bg = 'rgba(148,163,184,0.12)';
  let Icon = Target;
  let label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  if (s === 'allow') {
    color = '#00D4FF';
    bg = 'rgba(0,212,255,0.12)';
    Icon = ShieldCheck;
    label = 'Allow';
  } else if (s === 'caution') {
    color = '#FFB020';
    bg = 'rgba(255,176,32,0.12)';
    Icon = AlertTriangle;
    label = 'Caution';
  } else if (s === 'suppress') {
    color = '#FF4444';
    bg = 'rgba(255,68,68,0.12)';
    Icon = Ban;
    label = 'Suppress';
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize tracking-wider whitespace-nowrap"
      style={{ color, background: bg, border: `1px solid ${color}40` }}
    >
      <Icon className="w-3 h-3" />
      {label}
      {scoreMult !== null && scoreMult !== undefined && (
        <span className="opacity-70">x{Number(scoreMult).toFixed(2)}</span>
      )}
    </span>
  );
};

// Gate threshold row with pass/fail indicator
const GateRow = ({
  label,
  value,
  passed,
  loading,
}: {
  label: string;
  value: string;
  passed: boolean;
  loading: boolean;
}) => (
  <div
    className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] transition-all ${
      passed ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'
    }`}
  >
    <div className="text-[10px] text-slate-400 mb-2 font-bold capitalize tracking-wider flex items-center gap-1.5">
      {passed ? (
        <CheckCircle2 className="w-3 h-3 text-[#00D4FF]" />
      ) : (
        <XCircle className="w-3 h-3 text-slate-500" />
      )}
      {label}
    </div>
    <div
      className={`text-2xl font-extrabold ${passed ? 'text-[#00D4FF]' : 'text-white'}`}
      style={{ textShadow: passed ? '0 0 10px rgba(0,212,255,0.5)' : 'none' }}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" /> : value}
    </div>
  </div>
);

/* ─── fetcher ────────────────────────────────────────────────────────────────── */

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    logError('SWR Fetch', err);
    throw err;
  }
};

// CSV export helper
function downloadCsv(rows: any[], filter: string) {
  const header = 'Date,Market,N,Brier,Avg CLV,ROI %\n';
  const body = rows
    .map((r) =>
      [
        r.date,
        `"${r.market}"`,
        r.n,
        r.brier !== null ? Number(r.brier).toFixed(3) : '',
        r.avg_clv !== null ? Number(r.avg_clv).toFixed(2) : '',
        r.roi !== null ? Number(r.roi).toFixed(1) : '',
      ].join(',')
    )
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smarter-poker-mlb-daily-${filter.toLowerCase().replace(/\s/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── page ───────────────────────────────────────────────────────────────────── */

const CHART_RANGES = ['7D', '30D', 'All'] as const;
type ChartRange = (typeof CHART_RANGES)[number];

const ACC_FILTERS = ['All', 'Moneyline', 'Totals', 'Run Line', 'Props'] as const;
type AccFilter = (typeof ACC_FILTERS)[number];

export default function ModelIntelPage() {
  const router = useRouter();
  const { isVip } = useVIP();

  // ── Single SWR fetch — includes gate + tableData + history + markets + betTypes
  const { data, error, isLoading, isValidating, mutate } = useSWR(isVip ? '/api/mlb/model-intel' : null, fetcher, {
    refreshInterval: 1_800_000, // 30 min — data changes at most once per day
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // ── "Last refreshed X min ago" tracker
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [, forceRender] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isValidating && data) {
      setLastRefreshed(new Date());
    }
  }, [isValidating, data]);

  useEffect(() => {
    timerRef.current = setInterval(() => forceRender((n) => n + 1), 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const relativeTime = useMemo(() => {
    if (!lastRefreshed) return null;
    const mins = Math.floor((Date.now() - lastRefreshed.getTime()) / 60_000);
    if (mins < 1) return 'Just Now';
    if (mins === 1) return '1 Min Ago';
    return `${mins} Mins Ago`;
  }, [lastRefreshed, /* eslint-disable-next-line react-hooks/exhaustive-deps */ Date.now()]);

  // ── Filter state
  const [chartRange, setChartRange] = useState<ChartRange>('All');
  const [accFilter, setAccFilter] = useState<AccFilter>('All');

  // ── Derived data
  const intel = data?.intel || {};
  const gateKpi = data?.gate || { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' };
  const rawHistory = Array.isArray(data?.history) ? data.history : [];
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const betTypes = Array.isArray(data?.betTypes) ? data.betTypes : [];
  const tableData: any[] = data?.tableData || [];
  const clvTrend: any[] = data?.clvTrend || [];
  const calibration: any[] = data?.calibration || [];

  // ── Gate pass logic — all 4 thresholds required
  const isGatePassed =
    gateKpi.n >= 500 &&
    Number(gateKpi.clv) > 0 &&
    Number(gateKpi.roi) > -3.0 &&
    Number(gateKpi.brier) < 0.23;

  // ── Chart data sliced by range
  const chartData = useMemo(() => {
    if (chartRange === 'All') return rawHistory;
    const days = chartRange === '7D' ? 7 : 30;
    const sliced = rawHistory.slice(-days);
    if (sliced.length === 0) return rawHistory;
    // Rebase cum_pnl to start from 0 for the selected window
    let rebased = 0;
    const startCum = sliced[0].cum_pnl - sliced[0].pnl;
    return sliced.map((d: any) => ({ ...d, cum_pnl: Number((d.cum_pnl - startCum).toFixed(2)) }));
  }, [rawHistory, chartRange]);

  // ── Daily performance table aggregation (n-weighted Brier/CLV, true ROI per date)
  const filteredTable = useMemo(() => {
    const rows = tableData.filter((r) => accFilter === 'All' || categoryOf(r.market) === accFilter);
    const byDate: Record<string, any> = {};
    for (const r of rows) {
      const n = Number(r.n) || 0;
      if (n <= 0) continue;
      const d = r.date;
      if (!byDate[d]) {
        byDate[d] = {
          date: d,
          n: 0,
          brierNum: 0,
          brierW: 0,
          clvNum: 0,
          clvW: 0,
          profit: 0,
          bets: 0,
        };
      }
      const g = byDate[d];
      g.n += n;
      g.profit += Number(r.sum_unit_profit) || 0;
      g.bets += Number(r.bet_count) || 0;
      if (r.brier != null) {
        g.brierNum += Number(r.brier) * n;
        g.brierW += n;
      }
      if (r.avg_clv != null) {
        g.clvNum += Number(r.avg_clv) * n;
        g.clvW += n;
      }
    }
    return Object.values(byDate)
      .map((g: any) => ({
        date: g.date,
        market: accFilter === 'All' ? 'All' : accFilter,
        n: g.n,
        brier: g.brierW > 0 ? g.brierNum / g.brierW : null,
        avg_clv: g.clvW > 0 ? g.clvNum / g.clvW : null,
        roi: g.bets > 0 ? (g.profit / g.bets) * 100 : null,
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [tableData, accFilter]);

  const handleExportCsv = useCallback(() => {
    downloadCsv(filteredTable, accFilter);
  }, [filteredTable, accFilter]);

  const pageShell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
      <SEOHead
        title="MLB Predictive Model Intelligence - Calibration & Edge Analytics | Smarter.Poker"
        description="Behind-the-scenes look at the Smarter.Poker MLB prediction engine: Brier calibration, closing-line value, ROI by market, the bet-type trust ledger, and the cumulative P&L curve for the 2026 MLB season."
        canonical="/hub/MLB-ANALYTICS/model-intel"
        ogImage="/images/mlb/og.png"
        noindex={true}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: 'MLB Model Intelligence - Calibration, CLV & ROI By Market',
          description:
            'Diagnostics for the Smarter.Poker MLB model: n-weighted Brier calibration, closing-line value (CLV), portfolio ROI by market, per-bet-type reliability gating, and cumulative unit P&L.',
          url: 'https://smarter.poker/hub/MLB-ANALYTICS/model-intel',
          provider: {
            '@type': 'Organization',
            name: 'Smarter.Poker',
            url: 'https://smarter.poker',
          },
        }}
      />
      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
      <MlbSubNav />
      {children}
      <BottomNavBar />
    </div>
  );

  if (error || data?.error) {
    logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
    return pageShell(
      <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
        <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#00D4FF]/50 shadow-[0_0_20px_rgba(0,212,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20" />
          <Activity
            className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10"
            style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }}
          />
          <h2
            className="text-2xl font-extrabold text-white capitalize tracking-wider mb-2 relative z-10"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            System Error
          </h2>
          <p className="text-[#FF4444] font-bold capitalize tracking-widest text-[11px] relative z-10 mb-5">
            Failed To Load Intel Data. Please Try Again.
          </p>
          <button
            onClick={() => mutate()}
            className="relative z-10 inline-flex items-center gap-2 bg-[#00D4FF] text-[#0a0a15] font-extrabold capitalize tracking-widest text-[11px] px-5 py-2.5 rounded-lg transition-all hover:shadow-[0_0_15px_rgba(0,212,255,0.5)]"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </main>
    );
  }

  return pageShell(
    <MlbPremiumGate featureName="Model Intelligence">
      <div className="edge-to-edge-container max-w-[1000px] mx-auto px-4 py-6 relative">
        {/* Background Glows */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.03] pointer-events-none" />
        <div className="absolute bottom-40 left-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.02] pointer-events-none" />

        {/* ── Header ── */}
        <div className="flex flex-wrap gap-4 justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#0d1117] border-[2px] border-[#00D4FF]/30 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(0,212,255,0.2)]">
              <BrainCircuit className="text-[#00D4FF] animate-pulse" size={24} />
            </div>
            <div>
              <h1
                className="m-0 text-2xl sm:text-3xl font-extrabold text-white tracking-widest capitalize"
                style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  textShadow: '0 0 15px rgba(255,255,255,0.2)',
                }}
              >
                MODEL{' '}
                <span
                  className="text-[#00D4FF]"
                  style={{ textShadow: '0 0 15px rgba(0,212,255,0.4)' }}
                >
                  INTEL
                </span>
              </h1>
              <p className="m-0 mt-1 text-[#00D4FF] font-bold capitalize tracking-wider text-[11px]">
                Calibration, Edge &amp; Backtesting Intelligence
              </p>
            </div>
          </div>
          {/* Refresh + last-updated */}
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => mutate()}
              disabled={isValidating}
              aria-label="Refresh model intel data"
              className="inline-flex items-center gap-2 bg-[#0d1117] border-[2px] border-[#3d4f5f] text-slate-300 font-bold capitalize tracking-widest text-[10px] px-3 py-2 rounded-lg transition-all hover:border-[#00D4FF] hover:text-[#00D4FF] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
              {isValidating ? 'Syncing' : 'Refresh'}
            </button>
            {relativeTime && (
              <span className="text-[9px] font-bold text-slate-600 capitalize tracking-widest">
                Updated {relativeTime}
              </span>
            )}
          </div>
        </div>

        {/* ── As-of line ── */}
        <div className="mb-6 text-[11px] text-slate-500 font-bold capitalize tracking-widest relative z-10">
          {isLoading ? (
            'Loading Model Diagnostics...'
          ) : (
            <>
              Data Through{' '}
              <span className="text-slate-300">
                {intel.data_through
                  ? new Date(intel.data_through).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })
                  : '--'}
              </span>{' '}
              &middot; Model <span className="text-[#00D4FF]">{intel.model_version || 'n/a'}</span>
            </>
          )}
        </div>

        {/* ── KPI grid — 6 meaningful cards, 2-col mobile / 3-col sm / 6-col lg ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8 relative z-10 px-4 md:px-0">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <MetricSkeleton key={i} />)
          ) : (
            <>
              <MetricBox
                title="Graded Predictions"
                value={fmtInt(intel.graded_predictions)}
                sub="Probabilities Scored"
                valueColor="#FFFFFF"
                tooltip="Total predictions that have been graded against real outcomes"
              />
              <MetricBox
                title="Bets Tracked"
                value={fmtInt(intel.total_bets_tracked)}
                sub="Value Bets Placed"
                valueColor="#FFFFFF"
                tooltip="Total value bets surfaced by the model and tracked for performance"
              />
              <MetricBox
                title="Win Rate"
                value={intel.win_pct != null ? `${Number(intel.win_pct).toFixed(1)}%` : '--'}
                sub="All-Time Graded Bets"
                valueColor={
                  intel.win_pct != null && Number(intel.win_pct) >= 52 ? '#00D4FF' : '#FFFFFF'
                }
                tooltip="Percentage of graded bets that resulted in a win"
              />
              <MetricBox
                title="Overall ROI"
                value={fmtPct(intel.overall_roi)}
                sub="All-Time Portfolio"
                valueColor={roiColor(intel.overall_roi)}
                tooltip="True portfolio return: total unit profit divided by total bets placed"
              />
              <MetricBox
                title="Recent ROI"
                value={fmtPct(intel.recent_roi)}
                sub="Last 14 Dates"
                valueColor={roiColor(intel.recent_roi)}
                tooltip="Bets-weighted portfolio ROI over the most recent 14 active grading dates"
              />
              <MetricBox
                title="Avg Brier"
                value={fmtBrier(intel.avg_brier)}
                sub="Lower Is Better"
                valueColor="#00D4FF"
                tooltip="N-weighted mean squared error of probability forecasts. 0=perfect, 0.25=coin flip"
              />
            </>
          )}
        </div>

        {/* ── P&L Curve ── */}
        <div className="flex items-center justify-between mb-3 relative z-10">
          <SectionTitle>Cumulative P&amp;L Curve (Units)</SectionTitle>
          {/* Date Range Selector */}
          <div className="flex gap-1 bg-[#0d1117] p-1 rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] mb-4">
            {CHART_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                aria-label={`Show ${r} P&L chart`}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all capitalize tracking-wider ${
                  chartRange === r
                    ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.3)]'
                    : 'bg-transparent text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 sm:p-6 mb-8 h-[280px] sm:h-[320px] shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden z-10">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
              <div className="text-[#00D4FF] font-bold tracking-widest text-[11px] animate-pulse capitalize">
                Compiling Matrices...
              </div>
            </div>
          ) : chartData.length > 0 ? (
            <PnLChart data={chartData} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-bold capitalize tracking-widest text-[11px]">
              <TrendingUp className="w-8 h-8 mb-3 opacity-40" />
              No Historical Data Available
            </div>
          )}
        </div>

        {/* ── Lock-In Gate ── */}
        <SectionTitle>Lock-In Gate</SectionTitle>
        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 md:p-5 mb-3 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden z-10">
          {/* Metal Corner Screws */}
          {[['top-2 left-2'], ['top-2 right-2'], ['bottom-2 left-2'], ['bottom-2 right-2']].map(
            ([pos], i) => (
              <div
                key={i}
                className={`absolute ${pos} w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center`}
              >
                <span className="text-[6px] text-[#1a2a3a]">+</span>
              </div>
            )
          )}

          <div className="relative z-10">
            <div className="flex justify-between items-center mb-5 border-b border-[#3d4f5f] pb-3">
              <div className="flex items-center gap-3">
                <h3
                  className="m-0 text-base font-extrabold capitalize text-white tracking-wider"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  Lock-In Gate
                </h3>
                {isLoading && !data ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider bg-[#1a2332] text-slate-400 border border-[#3d4f5f] flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Loading
                  </span>
                ) : (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider border ${
                      isGatePassed
                        ? 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                        : 'bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]'
                    }`}
                  >
                    {isGatePassed ? '✓ Passed' : '⏳ Evaluating'}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-bold text-[#00D4FF] tracking-widest hidden sm:block">
                Required For Real-Money Play
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-0">
              <GateRow
                label="Sample Size (N≥500)"
                value={String(gateKpi.n)}
                passed={gateKpi.n >= 500}
                loading={isLoading && !data}
              />
              <GateRow
                label="AVG CLV (>0 Pts)"
                value={gateKpi.clv}
                passed={Number(gateKpi.clv) > 0}
                loading={isLoading && !data}
              />
              <GateRow
                label="Expected ROI (>−3%)"
                value={`${Number(gateKpi.roi) > 0 ? '+' : ''}${gateKpi.roi}%`}
                passed={Number(gateKpi.roi) > -3}
                loading={isLoading && !data}
              />
              <GateRow
                label="Brier Score (<0.23)"
                value={gateKpi.brier}
                passed={Number(gateKpi.brier) < 0.23}
                loading={isLoading && !data}
              />
            </div>
          </div>
        </div>
        {/* Gate status explanation */}
        <p className="text-[11px] text-slate-500 mb-8 relative z-10 leading-relaxed px-1">
          {isGatePassed
            ? '✅ All Four Thresholds Passed — Value Bets Are Cleared For Real-Money Play.'
            : '⏳ Evaluating — When Any Threshold Is Unmet, Value Bets Are Research-Grade Only And Not Recommended For Real-Money Play.'}
        </p>

        {/* ── Daily Performance Log ── */}
        <div className="relative z-10 mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-0">
            <SectionTitle>Daily Performance Log</SectionTitle>
            {/* Filter pills + CSV export — right-aligned, inline with section title */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex flex-wrap gap-1 bg-[#0d1117] p-1 rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                {ACC_FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setAccFilter(f)}
                    aria-label={`Filter By ${f}`}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all capitalize tracking-wider ${
                      accFilter === f
                        ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.25)]'
                        : 'bg-transparent text-slate-400 hover:text-white border border-transparent'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {/* CSV Export */}
              {filteredTable.length > 0 && (
                <button
                  onClick={handleExportCsv}
                  aria-label="Export daily performance log as CSV"
                  title="Export As CSV"
                  className="p-2 bg-[#0d1117] border border-[#3d4f5f] rounded-lg text-slate-400 hover:text-[#00D4FF] hover:border-[#00D4FF] transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] whitespace-nowrap">
              <thead>
                <tr className="bg-[#1a2332] border-b-2 border-[#3d4f5f] text-slate-400 font-bold capitalize tracking-wider text-[10px]">
                  <th className="px-4 py-3.5">Date</th>
                  {accFilter === 'All' && <th className="px-4 py-3.5">Market</th>}
                  <th className="px-4 py-3.5 text-right">N</th>
                  <th className="px-4 py-3.5 text-right">Brier</th>
                  <th className="px-4 py-3.5 text-right">Avg CLV</th>
                  <th className="px-4 py-3.5 text-right">ROI</th>
                </tr>
              </thead>
              <tbody className="bg-[#0a0a15]">
                {isLoading && !data ? (
                  // Skeleton rows
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#1a2332] animate-pulse">
                      <td className="px-4 py-3.5">
                        <div className="h-3 bg-[#1a2332] rounded w-16" />
                      </td>
                      {accFilter === 'All' && (
                        <td className="px-4 py-3.5">
                          <div className="h-3 bg-[#1a2332] rounded w-20" />
                        </td>
                      )}
                      <td className="px-4 py-3.5 text-right">
                        <div className="h-3 bg-[#1a2332] rounded w-8 ml-auto" />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="h-3 bg-[#1a2332] rounded w-12 ml-auto" />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="h-3 bg-[#1a2332] rounded w-10 ml-auto" />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="h-3 bg-[#1a2332] rounded w-14 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredTable.length === 0 ? (
                  <tr>
                    <td
                      colSpan={accFilter === 'All' ? 6 : 5}
                      className="px-4 py-12 text-center text-slate-500 font-medium border-t border-[#1a2332]"
                    >
                      No Data Available For The Selected Filter.
                    </td>
                  </tr>
                ) : (
                  filteredTable.map((row: any, i: number) => {
                    const roiNum = row.roi != null ? Number(row.roi) : null;
                    const roiCls =
                      roiNum == null
                        ? 'text-white'
                        : roiNum > 0
                          ? 'text-[#00D4FF]'
                          : roiNum < 0
                            ? 'text-[#FF4444]'
                            : 'text-white';
                    const roiShadow =
                      roiNum == null
                        ? 'none'
                        : roiNum > 0
                          ? '0 0 5px rgba(0,212,255,0.5)'
                          : roiNum < 0
                            ? '0 0 5px rgba(255,68,68,0.5)'
                            : 'none';
                    const clvNum = row.avg_clv != null ? Number(row.avg_clv) : null;
                    const clvCls =
                      clvNum == null
                        ? 'text-slate-300'
                        : clvNum > 0
                          ? 'text-[#00D4FF]'
                          : 'text-[#FF4444]';
                    return (
                      <tr
                        key={`${row.date}-${row.market}-${i}`}
                        className="border-b border-[#1a2332] last:border-b-0 hover:bg-[#1a2332] transition-colors"
                      >
                        <td className="px-4 py-3 font-bold text-slate-300">{fmtDate(row.date)}</td>
                        {accFilter === 'All' && (
                          <td className="px-4 py-3">
                            <span className="bg-[#0d1117] border border-[#3d4f5f] px-2 py-0.5 rounded-sm text-[10px] text-slate-300 font-bold capitalize tracking-widest shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                              {row.market}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-400 text-right font-medium tabular-nums">
                          {row.n}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-right font-bold tabular-nums">
                          {row.brier !== null ? Number(row.brier).toFixed(3) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${clvCls}`}>
                          {clvNum !== null ? `${clvNum > 0 ? '+' : ''}${clvNum.toFixed(2)}` : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-extrabold tabular-nums ${roiCls}`}
                          style={{ textShadow: roiShadow }}
                        >
                          {roiNum != null ? `${roiNum > 0 ? '+' : ''}${roiNum.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Performance By Market ── */}
        <SectionTitle>Performance By Market</SectionTitle>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 bg-[#1a2332] rounded flex-1" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                </div>
              ))}
            </div>
          ) : markets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="text-[10px] tracking-widest text-slate-400 border-b border-[#2a3a4a]">
                    <th className="text-left font-bold px-4 py-3">Market</th>
                    <th className="text-right font-bold px-3 py-3">Graded</th>
                    <th className="text-right font-bold px-3 py-3">Bets</th>
                    <th className="text-right font-bold px-3 py-3">Win%</th>
                    <th className="text-right font-bold px-3 py-3">Brier</th>
                    <th className="text-right font-bold px-3 py-3">CLV</th>
                    <th className="text-right font-bold px-3 py-3">ROI</th>
                    <th className="text-right font-bold px-4 py-3">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m: any, i: number) => (
                    <tr
                      key={m.market || i}
                      className="border-b border-[#1a2530] last:border-0 hover:bg-[#00D4FF]/[0.03] transition-colors"
                    >
                      <td className="text-left px-4 py-3 font-bold text-white whitespace-nowrap">
                        {marketLabel(m.market)}
                      </td>
                      <td className="text-right px-3 py-3 text-slate-300 tabular-nums">
                        {fmtInt(m.n)}
                      </td>
                      <td className="text-right px-3 py-3 text-slate-300 tabular-nums">
                        {fmtInt(m.bets)}
                      </td>
                      <td className="text-right px-3 py-3 text-slate-300 tabular-nums">
                        {m.win_pct != null ? `${Number(m.win_pct).toFixed(1)}%` : '--'}
                      </td>
                      <td className="text-right px-3 py-3 text-[#00D4FF] font-bold tabular-nums">
                        {fmtBrier(m.brier)}
                      </td>
                      <td
                        className="text-right px-3 py-3 font-bold tabular-nums"
                        style={{ color: roiColor(m.avg_clv) }}
                      >
                        {fmtClv(m.avg_clv)}
                      </td>
                      <td
                        className="text-right px-3 py-3 font-bold tabular-nums"
                        style={{ color: roiColor(m.roi) }}
                      >
                        {fmtPct(m.roi)}
                      </td>
                      <td
                        className="text-right px-4 py-3 font-bold tabular-nums"
                        style={{ color: roiColor(m.units) }}
                      >
                        {m.units > 0 ? '+' : ''}
                        {Number(m.units || 0).toFixed(2)}u
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 font-bold capitalize tracking-widest text-[11px]">
              No Market Data Available
            </div>
          )}
        </div>

        {/* ── Bet-Type Trust Ledger ── */}
        <SectionTitle>Bet-Type Trust Ledger</SectionTitle>
        <p className="text-[11px] text-slate-500 mb-4 -mt-2 relative z-10 leading-relaxed">
          The Model Self-Grades Every Bet Type From Its Realized Sample. Suppressed Types Are
          Auto-Removed From Recommendations; Cautioned Types Are Stake-Scaled By The Trust
          Multiplier.
        </p>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 bg-[#1a2332] rounded flex-1" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                  <div className="h-4 bg-[#1a2332] rounded w-12" />
                  <div className="h-4 bg-[#1a2332] rounded w-20" />
                </div>
              ))}
            </div>
          ) : betTypes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-[10px] tracking-widest text-slate-400 border-b border-[#2a3a4a]">
                    <th className="text-left font-bold px-4 py-3">Bet Type</th>
                    <th className="text-right font-bold px-3 py-3">Sample</th>
                    <th className="text-right font-bold px-3 py-3">Win%</th>
                    <th className="text-right font-bold px-3 py-3">ROI</th>
                    <th className="text-right font-bold px-3 py-3">CLV</th>
                    <th className="text-right font-bold px-3 py-3">Trend</th>
                    <th className="text-right font-bold px-4 py-3">Trust</th>
                  </tr>
                </thead>
                <tbody>
                  {betTypes.map((b: any, i: number) => (
                    <tr
                      key={b.bet_type || i}
                      className="border-b border-[#1a2530] last:border-0 hover:bg-[#00D4FF]/[0.03] transition-colors"
                    >
                      <td className="text-left px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-white">{marketLabel(b.bet_type)}</span>
                        {b.category && (
                          <span className="ml-2 text-[10px] capitalize tracking-wider text-slate-500">
                            {b.category}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-3 text-slate-300 tabular-nums">
                        {fmtInt(b.sample_n)}
                      </td>
                      <td className="text-right px-3 py-3 text-slate-300 tabular-nums">
                        {b.win_pct !== null && b.win_pct !== undefined
                          ? `${Number(b.win_pct).toFixed(1)}%`
                          : '--'}
                      </td>
                      <td
                        className="text-right px-3 py-3 font-bold tabular-nums"
                        style={{ color: roiColor(b.roi) }}
                      >
                        {fmtFracPct(b.roi)}
                      </td>
                      <td
                        className="text-right px-3 py-3 font-bold tabular-nums"
                        style={{ color: roiColor(b.avg_clv) }}
                      >
                        {fmtClv(b.avg_clv)}
                      </td>
                      {/* Trend sparkline */}
                      <td className="text-right px-3 py-3">
                        {Array.isArray(b.sparkline) && b.sparkline.length > 1 ? (
                          <div style={{ width: 56, height: 24, display: 'inline-block' }}>
                            <svg viewBox={`0 0 56 24`} width={56} height={24} style={{ overflow: 'visible' }} aria-hidden="true">
                              {(() => {
                                const pts = b.sparkline;
                                const vals = pts.map((p: any) => p.clv);
                                const minV = Math.min(...vals);
                                const maxV = Math.max(...vals);
                                const range = maxV - minV || 1;
                                const last = vals[vals.length - 1];
                                const color = last >= 0 ? '#00D4FF' : '#FF4444';
                                const coords = pts.map((p: any, idx: number) => {
                                  const x = (idx / (pts.length - 1)) * 54 + 1;
                                  const y = 23 - ((p.clv - minV) / range) * 20;
                                  return `${x},${y}`;
                                });
                                return (
                                  <polyline
                                    points={coords.join(' ')}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="1.8"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                  />
                                );
                              })()}
                            </svg>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="text-right px-4 py-3">
                        <TrustBadge status={b.status} scoreMult={b.score_mult} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 font-bold capitalize tracking-widest text-[11px]">
              No Reliability Data Available
            </div>
          )}
        </div>

        {/* ── CLV Trend ── */}
        <SectionTitle>14-Day Rolling CLV Trend</SectionTitle>
        <p className="text-[11px] text-slate-500 mb-4 -mt-2 relative z-10 leading-relaxed">
          Rolling 14-Day Average Closing-Line Value. Sustained Positive Values Confirm Persistent
          Edge; A Downtrend Is An Early Warning Signal Before ROI Catches Up.
        </p>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 h-[240px] shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 p-4"
          role="img" aria-label="Rolling 14-day average closing-line value trend">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF]" />
            </div>
          ) : clvTrend.length > 0 ? (
            <ClvTrendChart data={clvTrend} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-bold capitalize tracking-widest text-[11px]">
              <TrendingUp className="w-8 h-8 mb-3 opacity-40" />
              No Trend Data Available
            </div>
          )}
        </div>

        {/* ── Calibration Curve ── */}
        <SectionTitle>Calibration Curve</SectionTitle>
        <p className="text-[11px] text-slate-500 mb-4 -mt-2 relative z-10 leading-relaxed">
          Predicted Win Probability Vs. Actual Win Rate By Bucket. Dots On The Dashed Diagonal =
          Perfect Calibration. Dot Size = Sample Volume. Cyan = Within 4%, Green =
          Overperforming, Red = Underperforming.
        </p>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 h-[300px] shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 p-4"
          role="img" aria-label="Model calibration curve: predicted probability vs actual win rate">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF]" />
            </div>
          ) : calibration.length > 2 ? (
            <CalibrationChart data={calibration} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-bold capitalize tracking-widest text-[11px]">
              <Target className="w-8 h-8 mb-3 opacity-40" />
              Insufficient Calibration Data
            </div>
          )}
        </div>

        {/* ── Methodology Glossary ── */}
        <SectionTitle>How To Read This</SectionTitle>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5 mb-4 relative z-10 text-[12px] leading-relaxed text-slate-400 space-y-2.5">
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Brier</span> &mdash;
            Mean Squared Error Of Probability Forecasts (0 = Perfect, 0.25 = A Coin Flip). Lower Is
            Better; N-Weighted Across Every Graded Prediction.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">CLV</span> &mdash;
            Closing-Line Value — How Much The Model Beat The Market&apos;s Closing Price.
            Persistently Positive CLV Is The Strongest Signal Of A Genuine Edge.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">ROI</span> &mdash;
            True Portfolio Return (Total Unit Profit Divided By Bets Placed), Not A
            Prediction-Weighted Average.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Win Rate</span>{' '}
            &mdash; Percentage Of Graded Bets That Resulted In A Win. A Positive-EV Model Can Have A
            Win Rate Below 50% If Average Odds Are Long Enough.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Trend Sparkline</span>{' '}
            &mdash; Mini Chart Showing The Last 8 Rolling-CLV Data Points For Each Bet Type.
            Cyan = Trending Positive, Red = Trending Negative.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Calibration Curve</span>{' '}
            &mdash; Gold-Standard Model Evaluation. If The Model Is Well-Calibrated, A Bet Predicted
            At 60% Wins Roughly 60% Of The Time. Systematic Deviation Reveals Overconfidence Or
            Underconfidence In A Probability Range.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Trust</span> &mdash;
            Self-Assessed Reliability Per Bet Type From Realized Results. Allow = Full Stake,
            Caution = Scaled Stake, Suppress = Removed From Recommendations.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Lock-In Gate</span>{' '}
            &mdash; The Model Must Pass All Four Thresholds (N≥500, CLV{'>'}&thinsp;0, ROI{'>'}
            &thinsp;&minus;3%, Brier{'<'}0.23) Before Value Bets Are Surfaced For Real-Money Play.
          </p>
        </div>
      </div>
    </MlbPremiumGate>
  );
}
