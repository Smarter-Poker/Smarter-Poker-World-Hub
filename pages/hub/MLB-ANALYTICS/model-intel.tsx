import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';
import MlbPremiumGate from '../../../src/components/mlb/MlbPremiumGate';

const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ReferenceLine = dynamic(() => import('recharts').then((m) => m.ReferenceLine), {
  ssr: false,
});
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), {
  ssr: false,
});

/* ----------------------------- formatting helpers ----------------------------- */

const fmtInt = (v: any): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
};

// Portfolio / ROI percentages (already in percent units).
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

// Map a raw market to its display category (matches filter buttons).
const categoryOf = (market: string) => {
  const m = (market || '').toLowerCase();
  if (m === 'h2h' || m === 'f5_moneyline') return 'Moneyline';
  if (m === 'total' || m === 'team_total') return 'Totals';
  if (m === 'run_line') return 'Run Line';
  return 'Props';
};

/* --------------------------------- sub-views --------------------------------- */

interface MetricBoxProps {
  title: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
  isLoading?: boolean;
}

const MetricBox = ({ title, value, sub, valueColor = '#FFFFFF', isLoading }: MetricBoxProps) => (
  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex flex-col shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_10px_rgba(0,0,0,0.5)] transition-all hover:border-[#00D4FF] hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_15px_rgba(0,212,255,0.2)]">
    <div className="text-[13px] font-bold text-slate-400 tracking-widest mb-2 capitalize">
      {title}
    </div>
    <div
      className="text-[26px] sm:text-[31px] font-extrabold break-words"
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
      <div className="text-[13px] text-slate-500 mt-1 font-bold tracking-widest capitalize">
        {isLoading ? '--' : sub}
      </div>
    )}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2
    className="text-[23px] font-extrabold text-white mb-4 flex items-center gap-2 capitalize tracking-widest relative z-10"
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
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold capitalize tracking-wider whitespace-nowrap"
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

/* ---------------------------------- fetcher ---------------------------------- */

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

/* ----------------------------------- page ----------------------------------- */

export default function ModelIntelPage() {
  const router = useRouter();

  // Model intel data
  const { data, error, isLoading, isValidating, mutate } = useSWR('/api/mlb/model-intel', fetcher, {
    refreshInterval: 300000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // Accuracy / daily performance data (merged from Accuracy page)
  const { data: accData, isLoading: accLoading } = useSWR('/api/mlb/accuracy', fetcher, {
    refreshInterval: 300000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // Filter state for the daily performance table
  const [accFilter, setAccFilter] = useState('All');

  const accTableData = accData?.tableData || [];
  const accKpi = accData?.kpi || { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' };
  const isGatePassed =
    accKpi.n >= 300 && Number(accKpi.roi) > -3.0 && Number(accKpi.brier) < 0.23;

  // Aggregate daily performance table (n-weighted Brier/CLV, true ROI per date)
  const filteredTable = useMemo(() => {
    const rows = (accTableData as any[]).filter(
      (r) => accFilter === 'All' || categoryOf(r.market) === accFilter
    );
    const byDate: Record<string, any> = {};
    for (const r of rows) {
      const n = Number(r.n) || 0;
      if (n <= 0) continue;
      const d = r.date;
      if (!byDate[d]) {
        byDate[d] = { date: d, n: 0, brierNum: 0, brierW: 0, clvNum: 0, clvW: 0, profit: 0, bets: 0 };
      }
      const g = byDate[d];
      g.n += n;
      g.profit += Number(r.sum_unit_profit) || 0;
      g.bets += Number(r.bet_count) || 0;
      if (r.brier != null) { g.brierNum += Number(r.brier) * n; g.brierW += n; }
      if (r.avg_clv != null) { g.clvNum += Number(r.avg_clv) * n; g.clvW += n; }
    }
    const label = accFilter === 'All' ? 'All' : accFilter;
    return Object.values(byDate)
      .map((g: any) => ({
        date: g.date,
        market: label,
        n: g.n,
        brier: g.brierW > 0 ? g.brierNum / g.brierW : null,
        avg_clv: g.clvW > 0 ? g.clvNum / g.clvW : null,
        roi: g.bets > 0 ? (g.profit / g.bets) * 100 : null,
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [accTableData, accFilter]);

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
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
          <Activity
            className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10"
            style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }}
          />
          <h2
            className="text-[31px] font-extrabold text-white capitalize tracking-wider mb-2 relative z-10"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            System Error
          </h2>
          <p className="text-[#FF4444] font-bold capitalize tracking-widest text-[14px] relative z-10 mb-5">
            Failed To Load Intel Data. Please Try Again.
          </p>
          <button
            onClick={() => mutate()}
            className="relative z-10 inline-flex items-center gap-2 bg-[#00D4FF] text-[#0a0a15] font-extrabold capitalize tracking-widest text-[14px] px-5 py-2.5 rounded-lg transition-all hover:shadow-[0_0_15px_rgba(0,212,255,0.5)]"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </main>
    );
  }

  const intel = data?.intel || {};
  const history = Array.isArray(data?.history) ? data.history : [];
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const betTypes = Array.isArray(data?.betTypes) ? data.betTypes : [];

  // History arrives per-date ascending with a cumulative P&L (equity) curve already computed.
  const chartData = history.map((day: any) => ({
    date: day.date,
    pnl: day.pnl || 0,
    cum_pnl: day.cum_pnl || 0,
    bets: day.bets || 0,
    roi: day.roi || 0,
  }));

  return pageShell(
    <MlbPremiumGate featureName="Model Intelligence">
      <div className="edge-to-edge-container max-w-[1000px] mx-auto px-4 py-6 relative">
        {/* Background Glows */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.03] pointer-events-none"></div>
        <div className="absolute bottom-40 left-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.02] pointer-events-none"></div>

        {/* Header */}
        <div className="flex flex-wrap gap-4 justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#0d1117] border-[2px] border-[#00D4FF]/30 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(0,212,255,0.2)]">
              <BrainCircuit className="text-[#00D4FF] animate-pulse" size={24} />
            </div>
            <div>
              <h1
                className="m-0 text-[31px] sm:text-[39px] font-extrabold text-white tracking-widest capitalize"
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
                  Intel
                </span>
              </h1>
              <p className="m-0 mt-1 text-[#00D4FF] font-bold capitalize tracking-wider text-[14px]">
                Calibration, Edge &amp; Backtesting Intelligence
              </p>
            </div>
          </div>
          <button
            onClick={() => mutate()}
            disabled={isValidating}
            aria-label="Refresh model intel data"
            className="inline-flex items-center gap-2 bg-[#0d1117] border-[2px] border-[#3d4f5f] text-slate-300 font-bold capitalize tracking-widest text-[13px] px-3 py-2 rounded-lg transition-all hover:border-[#00D4FF] hover:text-[#00D4FF] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
            {isValidating ? 'Syncing' : 'Refresh'}
          </button>
        </div>

        {/* As-of line */}
        <div className="mb-6 text-[14px] text-slate-500 font-bold capitalize tracking-widest relative z-10">
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

        {/* KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 relative z-10 px-4 md:px-0">
          <MetricBox
            title="Graded Predictions"
            value={fmtInt(intel.graded_predictions)}
            sub="Probabilities Scored"
            valueColor="#FFFFFF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Bets Tracked"
            value={fmtInt(intel.total_bets_tracked)}
            sub="Value Bets Placed"
            valueColor="#FFFFFF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Overall ROI"
            value={fmtPct(intel.overall_roi)}
            sub="All-Time Portfolio"
            valueColor={roiColor(intel.overall_roi)}
            isLoading={isLoading}
          />
          <MetricBox
            title="Recent ROI"
            value={fmtPct(intel.recent_roi)}
            sub="Last 14 Dates"
            valueColor={roiColor(intel.recent_roi)}
            isLoading={isLoading}
          />
          <MetricBox
            title="Avg Brier"
            value={fmtBrier(intel.avg_brier)}
            sub="Lower Is Better"
            valueColor="#00D4FF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Avg CLV"
            value={fmtClv(intel.avg_clv)}
            sub="Closing Line Value"
            valueColor={roiColor(intel.avg_clv)}
            isLoading={isLoading}
          />
          <MetricBox
            title="Markets"
            value={fmtInt(intel.markets_tracked)}
            sub="Tracked"
            valueColor="#FFFFFF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Model Version"
            value={intel.model_version || '--'}
            sub="Engine Build"
            valueColor="#00D4FF"
            isLoading={isLoading}
          />
        </div>

        {/* P&L curve */}
        <SectionTitle>Cumulative P&amp;L Curve (Units)</SectionTitle>
        <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 sm:p-6 mb-8 h-[300px] sm:h-[350px] shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden z-10">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
              <div className="text-[#00D4FF] font-bold tracking-widest text-[18px] animate-pulse capitalize">
                Compiling Matrices...
              </div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00D4FF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#64748B"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(val) => fmtDate(val)}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(val) => `${val}u`}
                />
                <ReferenceLine y={0} stroke="#3d4f5f" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{
                    background: '#0a0a15',
                    border: '1px solid #00D4FF',
                    borderRadius: '8px',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)',
                  }}
                  itemStyle={{ color: '#00D4FF', fontWeight: 700 }}
                  labelStyle={{ color: '#F8FAFC', marginBottom: '4px' }}
                  formatter={(value: number, _name: string, props: any) => {
                    const p = props?.payload || {};
                    return [
                      `${Number(value).toFixed(2)}u  (day ${p.pnl >= 0 ? '+' : ''}${Number(p.pnl).toFixed(2)}u, ${fmtInt(p.bets)} bets)`,
                      'Cumulative P&L',
                    ];
                  }}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="cum_pnl"
                  stroke="#00D4FF"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorPnl)"
                  activeDot={{ r: 6, fill: '#00D4FF', stroke: '#0a0a15', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-bold capitalize tracking-widest text-[14px]">
              <TrendingUp className="w-8 h-8 mb-3 opacity-40" />
              No Historical Data Available
            </div>
          )}
        </div>

        {/* ─── LOCK-IN GATE (merged from Accuracy page) ─── */}
        <SectionTitle>Lock-In Gate</SectionTitle>
        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 md:p-5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden z-10">
          {/* Metal Frame Details */}
          <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center">
            <span className="text-[8px] text-[#1a2a3a]">+</span>
          </div>
          <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center">
            <span className="text-[8px] text-[#1a2a3a]">+</span>
          </div>
          <div className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center">
            <span className="text-[8px] text-[#1a2a3a]">+</span>
          </div>
          <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center">
            <span className="text-[8px] text-[#1a2a3a]">+</span>
          </div>

          <div className="relative z-10">
            <div className="flex justify-between items-center mb-5 border-b border-[#3d4f5f] pb-3">
              <div className="flex items-center gap-3">
                <h3
                  className="m-0 text-[21px] font-extrabold capitalize text-white tracking-wider"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  Lock-In Gate
                </h3>
                {accLoading && !accData ? (
                  <span className="px-2 py-0.5 rounded text-[13px] font-extrabold tracking-wider bg-[#1a2332] text-slate-400 border border-[#3d4f5f] flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Loading
                  </span>
                ) : (
                  <span
                    className={`px-2 py-0.5 rounded text-[13px] font-extrabold tracking-wider border ${
                      isGatePassed
                        ? 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                        : 'bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]'
                    }`}
                  >
                    {isGatePassed ? 'Passed' : 'Evaluating'}
                  </span>
                )}
              </div>
              <div className="text-[13px] font-bold text-[#00D4FF] tracking-widest hidden sm:block">
                Required For Real-Money Play
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-0">
              {/* Sample Size */}
              <div
                className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${accKpi.n >= 300 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}
              >
                <div className="text-[13px] text-slate-400 mb-2 font-bold capitalize tracking-wider">
                  Sample Size (N≥300)
                </div>
                <div
                  className={`text-[31px] font-extrabold ${accKpi.n >= 300 ? 'text-[#00D4FF]' : 'text-white'}`}
                  style={{ textShadow: accKpi.n >= 300 ? '0 0 10px rgba(0,212,255,0.5)' : 'none' }}
                >
                  {accLoading && !accData ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" />
                  ) : (
                    accKpi.n
                  )}
                </div>
              </div>
              {/* Avg CLV */}
              <div
                className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${Number(accKpi.clv) > 0 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}
              >
                <div className="text-[13px] text-slate-400 mb-2 font-bold capitalize tracking-wider">
                  Avg CLV ({'>'}0 Pts)
                </div>
                <div
                  className={`text-[31px] font-extrabold ${Number(accKpi.clv) > 0 ? 'text-[#00D4FF]' : 'text-white'}`}
                  style={{
                    textShadow: Number(accKpi.clv) > 0 ? '0 0 10px rgba(0,212,255,0.5)' : 'none',
                  }}
                >
                  {accLoading && !accData ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" />
                  ) : (
                    accKpi.clv
                  )}
                </div>
              </div>
              {/* Expected ROI */}
              <div
                className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${Number(accKpi.roi) > -3 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}
              >
                <div className="text-[13px] text-slate-400 mb-2 font-bold capitalize tracking-wider">
                  Expected ROI ({'>'}&#x2011;3%)
                </div>
                <div
                  className={`text-[31px] font-extrabold ${Number(accKpi.roi) > -3 ? 'text-[#00D4FF]' : 'text-[#FF4444]'}`}
                  style={{
                    textShadow:
                      Number(accKpi.roi) > -3
                        ? '0 0 10px rgba(0,212,255,0.5)'
                        : '0 0 10px rgba(255,68,68,0.5)',
                  }}
                >
                  {accLoading && !accData ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" />
                  ) : (
                    `${Number(accKpi.roi) > 0 ? '+' : ''}${accKpi.roi}%`
                  )}
                </div>
              </div>
              {/* Brier Score */}
              <div
                className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${Number(accKpi.brier) < 0.23 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}
              >
                <div className="text-[13px] text-slate-400 mb-2 font-bold capitalize tracking-wider">
                  Brier Score ({'<'}0.23)
                </div>
                <div
                  className={`text-[31px] font-extrabold ${Number(accKpi.brier) < 0.23 ? 'text-[#00D4FF]' : 'text-[#FF4444]'}`}
                  style={{
                    textShadow:
                      Number(accKpi.brier) < 0.23
                        ? '0 0 10px rgba(0,212,255,0.5)'
                        : '0 0 10px rgba(255,68,68,0.5)',
                  }}
                >
                  {accLoading && !accData ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" />
                  ) : (
                    accKpi.brier
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── DAILY PERFORMANCE TABLE (merged from Accuracy page) ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 relative z-10">
          <SectionTitle>Daily Performance Log</SectionTitle>
          <div className="flex flex-wrap gap-1 bg-[#0d1117] p-1 rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] mb-4">
            {['All', 'Moneyline', 'Totals', 'Run Line', 'Props'].map((f) => (
              <button
                key={f}
                onClick={() => setAccFilter(f)}
                aria-label={`Filter By ${f}`}
                className={`px-3 py-1.5 rounded-md text-[17px] font-bold transition-all capitalize tracking-wider ${
                  accFilter === f
                    ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                    : 'bg-transparent text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[17px] whitespace-nowrap">
              <thead>
                <tr className="bg-[#1a2332] border-b-2 border-[#3d4f5f] text-slate-400 font-bold capitalize tracking-wider text-[14px]">
                  <th className="px-4 py-4">Date</th>
                  <th className="px-4 py-4">Market</th>
                  <th className="px-4 py-4 text-right">N</th>
                  <th className="px-4 py-4 text-right">Brier</th>
                  <th className="px-4 py-4 text-right">Avg CLV</th>
                  <th className="px-4 py-4 text-right">Roi</th>
                </tr>
              </thead>
              <tbody className="bg-[#0a0a15]">
                {accLoading && !accData ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mx-auto mb-2" />
                        <span className="text-[17px] font-extrabold text-[#00D4FF] tracking-widest capitalize animate-pulse">
                          Scanning Database...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredTable.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
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
                    return (
                      <tr
                        key={`${row.date}-${row.market}-${i}`}
                        className="border-b border-[#1a2332] last:border-b-0 hover:bg-[#1a2332] transition-colors"
                      >
                        <td className="px-4 py-3.5 font-bold text-slate-300">{row.date}</td>
                        <td className="px-4 py-3.5">
                          <span className="bg-[#0d1117] border border-[#3d4f5f] px-2 py-1 rounded-sm text-[13px] text-slate-300 font-bold capitalize tracking-widest shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                            {row.market}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 text-right font-medium">
                          {row.n}
                        </td>
                        <td className="px-4 py-3.5 text-slate-300 text-right font-bold">
                          {row.brier !== null ? Number(row.brier).toFixed(3) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-slate-300 text-right font-bold">
                          {row.avg_clv !== null ? Number(row.avg_clv).toFixed(2) : '—'}
                        </td>
                        <td
                          className={`px-4 py-3.5 text-right font-extrabold ${roiCls}`}
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

        {/* Market breakdown */}
        <SectionTitle>Performance By Market</SectionTitle>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#00D4FF]" />
            </div>
          ) : markets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[18px] min-w-[560px]">
                <thead>
                  <tr className="text-[13px] capitalize tracking-widest text-slate-400 border-b border-[#2a3a4a]">
                    <th className="text-left font-bold px-4 py-3">Market</th>
                    <th className="text-right font-bold px-3 py-3">Graded</th>
                    <th className="text-right font-bold px-3 py-3">Bets</th>
                    <th className="text-right font-bold px-3 py-3">Brier</th>
                    <th className="text-right font-bold px-3 py-3">Clv</th>
                    <th className="text-right font-bold px-3 py-3">Roi</th>
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
            <div className="p-8 text-center text-slate-500 font-bold capitalize tracking-widest text-[14px]">
              No Market Data Available
            </div>
          )}
        </div>

        {/* Bet-type trust ledger */}
        <SectionTitle>Bet-Type Trust Ledger</SectionTitle>
        <p className="text-[14px] text-slate-500 mb-4 -mt-2 relative z-10 leading-relaxed">
          The Model Self-Grades Every Bet Type From Its Realized Sample. Suppressed Types Are
          Auto-Removed From Recommendations; Cautioned Types Are Stake-Scaled By The Trust
          Multiplier.
        </p>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#00D4FF]" />
            </div>
          ) : betTypes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[18px] min-w-[620px]">
                <thead>
                  <tr className="text-[13px] capitalize tracking-widest text-slate-400 border-b border-[#2a3a4a]">
                    <th className="text-left font-bold px-4 py-3">Bet Type</th>
                    <th className="text-right font-bold px-3 py-3">Sample</th>
                    <th className="text-right font-bold px-3 py-3">Win%</th>
                    <th className="text-right font-bold px-3 py-3">Roi</th>
                    <th className="text-right font-bold px-3 py-3">Clv</th>
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
                          <span className="ml-2 text-[13px] capitalize tracking-wider text-slate-500">
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
                      <td className="text-right px-4 py-3">
                        <TrustBadge status={b.status} scoreMult={b.score_mult} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 font-bold capitalize tracking-widest text-[14px]">
              No Reliability Data Available
            </div>
          )}
        </div>

        {/* Methodology glossary */}
        <SectionTitle>How To Read This</SectionTitle>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5 mb-4 relative z-10 text-[16px] leading-relaxed text-slate-400 space-y-2">
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Brier</span> &mdash;
            Mean Squared Error Of Probability Forecasts (0 = Perfect, 0.25 = A Coin Flip). Lower Is
            Better; N-Weighted Across Every Graded Prediction.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Clv</span> &mdash;
            Closing-Line Value, How Much The Model Beat The Market&apos;s Closing Price.
            Persistently Positive CLV Is The Strongest Signal Of A Genuine Edge.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Roi</span> &mdash;
            True Portfolio Return (Total Unit Profit Divided By Bets Placed), Not A
            Prediction-Weighted Average.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Trust</span> &mdash;
            Self-Assessed Reliability Per Bet Type From Realized Results. Allow = Full Stake,
            Caution = Scaled Stake, Suppress = Removed From Recommendations.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold capitalize tracking-wider">Lock-In Gate</span>{' '}
            &mdash; The Model Must Pass All Four Thresholds (N≥300, CLV{'>'} 0, ROI{'>'}&#x2011;3%,
            Brier{'<'}0.23) Before Value Bets Are Surfaced For Real-Money Play.
          </p>
        </div>
      </div>
    </MlbPremiumGate>
  );
}
