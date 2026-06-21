import React from 'react';
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
const ReferenceLine = dynamic(() => import('recharts').then((m) => m.ReferenceLine), { ssr: false });
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
    <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 uppercase">
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
      <div className="text-[10px] text-slate-500 mt-1 font-bold tracking-widest uppercase">
        {isLoading ? '--' : sub}
      </div>
    )}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2
    className="text-lg font-extrabold text-white mb-4 flex items-center gap-2 uppercase tracking-widest relative z-10"
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
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
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
  const { data, error, isLoading, isValidating, mutate } = useSWR('/api/mlb/model-intel', fetcher, {
    refreshInterval: 300000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

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
          name: 'MLB Model Intelligence - Calibration, CLV & ROI by Market',
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
            className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            System Error
          </h2>
          <p className="text-[#FF4444] font-bold uppercase tracking-widest text-[11px] relative z-10 mb-5">
            Failed to load intel data. Please try again.
          </p>
          <button
            onClick={() => mutate()}
            className="relative z-10 inline-flex items-center gap-2 bg-[#00D4FF] text-[#0a0a15] font-extrabold uppercase tracking-widest text-[11px] px-5 py-2.5 rounded-lg transition-all hover:shadow-[0_0_15px_rgba(0,212,255,0.5)]"
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
                className="m-0 text-2xl sm:text-3xl font-extrabold text-white tracking-widest uppercase"
                style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  textShadow: '0 0 15px rgba(255,255,255,0.2)',
                }}
              >
                MODEL{' '}
                <span className="text-[#00D4FF]" style={{ textShadow: '0 0 15px rgba(0,212,255,0.4)' }}>
                  INTEL
                </span>
              </h1>
              <p className="m-0 mt-1 text-[#00D4FF] font-bold uppercase tracking-wider text-[11px]">
                Calibration, edge &amp; backtesting intelligence
              </p>
            </div>
          </div>
          <button
            onClick={() => mutate()}
            disabled={isValidating}
            aria-label="Refresh model intel data"
            className="inline-flex items-center gap-2 bg-[#0d1117] border-[2px] border-[#3d4f5f] text-slate-300 font-bold uppercase tracking-widest text-[10px] px-3 py-2 rounded-lg transition-all hover:border-[#00D4FF] hover:text-[#00D4FF] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
            {isValidating ? 'Syncing' : 'Refresh'}
          </button>
        </div>

        {/* As-of line */}
        <div className="mb-6 text-[11px] text-slate-500 font-bold uppercase tracking-widest relative z-10">
          {isLoading ? (
            'Loading model diagnostics...'
          ) : (
            <>
              Data through{' '}
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
              &middot; Model{' '}
              <span className="text-[#00D4FF]">{intel.model_version || 'n/a'}</span>
            </>
          )}
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 relative z-10">
          <MetricBox
            title="Graded Predictions"
            value={fmtInt(intel.graded_predictions)}
            sub="probabilities scored"
            valueColor="#FFFFFF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Bets Tracked"
            value={fmtInt(intel.total_bets_tracked)}
            sub="value bets placed"
            valueColor="#FFFFFF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Overall ROI"
            value={fmtPct(intel.overall_roi)}
            sub="all-time portfolio"
            valueColor={roiColor(intel.overall_roi)}
            isLoading={isLoading}
          />
          <MetricBox
            title="Recent ROI"
            value={fmtPct(intel.recent_roi)}
            sub="last 14 dates"
            valueColor={roiColor(intel.recent_roi)}
            isLoading={isLoading}
          />
          <MetricBox
            title="Avg Brier"
            value={fmtBrier(intel.avg_brier)}
            sub="lower is better"
            valueColor="#00D4FF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Avg CLV"
            value={fmtClv(intel.avg_clv)}
            sub="closing line value"
            valueColor={roiColor(intel.avg_clv)}
            isLoading={isLoading}
          />
          <MetricBox
            title="Markets"
            value={fmtInt(intel.markets_tracked)}
            sub="tracked"
            valueColor="#FFFFFF"
            isLoading={isLoading}
          />
          <MetricBox
            title="Model Version"
            value={intel.model_version || '--'}
            sub="engine build"
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
              <div className="text-[#00D4FF] font-bold tracking-widest text-sm animate-pulse uppercase">
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
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-bold uppercase tracking-widest text-[11px]">
              <TrendingUp className="w-8 h-8 mb-3 opacity-40" />
              No Historical Data Available
            </div>
          )}
        </div>

        {/* Market breakdown */}
        <SectionTitle>Performance by Market</SectionTitle>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#00D4FF]" />
            </div>
          ) : markets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-[#2a3a4a]">
                    <th className="text-left font-bold px-4 py-3">Market</th>
                    <th className="text-right font-bold px-3 py-3">Graded</th>
                    <th className="text-right font-bold px-3 py-3">Bets</th>
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
            <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-[11px]">
              No Market Data Available
            </div>
          )}
        </div>

        {/* Bet-type trust ledger */}
        <SectionTitle>Bet-Type Trust Ledger</SectionTitle>
        <p className="text-[11px] text-slate-500 mb-4 -mt-2 relative z-10 leading-relaxed">
          The model self-grades every bet type from its realized sample. Suppressed types are
          auto-removed from recommendations; cautioned types are stake-scaled by the trust
          multiplier.
        </p>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#00D4FF]" />
            </div>
          ) : betTypes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-[#2a3a4a]">
                    <th className="text-left font-bold px-4 py-3">Bet Type</th>
                    <th className="text-right font-bold px-3 py-3">Sample</th>
                    <th className="text-right font-bold px-3 py-3">Win%</th>
                    <th className="text-right font-bold px-3 py-3">ROI</th>
                    <th className="text-right font-bold px-3 py-3">CLV</th>
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
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">
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
            <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-[11px]">
              No Reliability Data Available
            </div>
          )}
        </div>

        {/* Methodology glossary */}
        <SectionTitle>How To Read This</SectionTitle>
        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5 mb-4 relative z-10 text-[12px] leading-relaxed text-slate-400 space-y-2">
          <p>
            <span className="text-[#00D4FF] font-bold uppercase tracking-wider">Brier</span> &mdash;
            mean squared error of probability forecasts (0 = perfect, 0.25 = a coin flip). Lower is
            better; n-weighted across every graded prediction.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold uppercase tracking-wider">CLV</span> &mdash;
            closing-line value, how much the model beat the market&apos;s closing price.
            Persistently positive CLV is the strongest signal of a genuine edge.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold uppercase tracking-wider">ROI</span> &mdash;
            true portfolio return (total unit profit divided by bets placed), not a
            prediction-weighted average.
          </p>
          <p>
            <span className="text-[#00D4FF] font-bold uppercase tracking-wider">Trust</span> &mdash;
            self-assessed reliability per bet type from realized results. Allow = full stake,
            Caution = scaled stake, Suppress = removed from recommendations.
          </p>
        </div>
      </div>
    </MlbPremiumGate>
  );
}
