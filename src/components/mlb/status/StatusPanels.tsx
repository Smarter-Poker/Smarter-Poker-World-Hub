import React, { useState } from 'react';
import MetalFrame from '../../ui/MetalFrame';
import SectionHeader from '../../ui/SectionHeader';
import { TimeAgo } from './TimeAgo';
import useSWR from 'swr';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  Gauge,
  Layers,
  Database,
  Bell,
  RefreshCw,
} from 'lucide-react';
import { MLBStatusPayload } from '../../../../pages/hub/MLB-ANALYTICS/status';

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('API Error');
  return res.json();
});

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

const TIER_META = [
  { key: 'ELITE', color: '#FFD24A' },
  { key: 'STRONG', color: '#00D4FF' },
  { key: 'LEAN', color: '#5BE0B0' },
  { key: 'THIN', color: '#94a3b8' },
  { key: 'PASS', color: '#64748b' },
];

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  const isoStr = dateString.trim().replace(/ /g, 'T');
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

export const PipelineStatusPanel = React.memo(({ pipeline }: { pipeline: MLBStatusPayload['pipeline'] }) => (
  <div className="mb-8">
    <MetalFrame className="px-5 py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {pipeline.hasError ? (
          <AlertTriangle size={22} className="text-[#FF4444] shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 size={22} className="text-[#00D4FF] shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <div
            className={`text-[20px] font-extrabold capitalize tracking-wider font-['Rajdhani'] ${pipeline.hasError ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`}
          >
            {pipeline.hasError ? 'Pipeline Errors Detected' : 'All Pipeline Stages OK'}
          </div>
          <div className="text-[16px] text-slate-300 tracking-wider mt-0.5">
            {fmt(pipeline.okCount)} OK
            {pipeline.pendingCount ? ` \u2022 ${pipeline.pendingCount} PENDING` : ''}
            {' \u2022 '}
            {fmt(pipeline.total)} STAGES
          </div>
        </div>
      </div>
    </MetalFrame>
  </div>
));

export const HealthPanel = React.memo(({ health, data, serverNow }: { health: MLBStatusPayload['health']; data: any; serverNow: any }) => (
  <div className="mb-8">
    <SectionHeader icon={Clock} label="System Health" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
      {[
        {
          label: 'LAST REFRESH',
          val: <TimeAgo dateString={health.last_refresh} serverNow={serverNow} fallback="-" />,
          warn: !!health.is_stale,
        },
        {
          label: 'SLATE AS OF',
          val: formatDate(health.slate_as_of) || '-',
          warn: false,
        },
        {
          label: 'AGG MARKET',
          val: <TimeAgo dateString={data?.aggAsOf} serverNow={serverNow} fallback="-" />,
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
          <div className="text-[16px] font-bold text-slate-400 tracking-[0.15em] mb-2">
            {item.label}
          </div>
          <div
            className={`text-[26px] font-extrabold font-['Rajdhani'] tabular-nums break-words ${item.warn ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`}
          >
            {item.val}
          </div>
        </MetalFrame>
      ))}
    </div>
  </div>
));

export const TodaySlatePanel = React.memo(({ slate }: { slate: MLBStatusPayload['slate'] }) => (
  <div className="mb-8">
    <SectionHeader icon={Activity} label="Today's Slate" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 md:px-0">
      {[
        { label: 'MARKET BETS', val: slate.mkt },
        { label: 'PROPS', val: slate.props },
        { label: 'BEST BETS', val: slate.best },
      ].map((item) => (
        <MetalFrame key={item.label} className="p-5 text-center">
          <div className="text-[16px] font-bold text-slate-400 tracking-[0.15em] mb-2">
            {item.label}
          </div>
          <div className="text-[39px] font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">
            {fmt(item.val)}
          </div>
        </MetalFrame>
      ))}
    </div>
  </div>
));

export const ModelAccuracyPanel = React.memo(({ accuracy }: { accuracy: MLBStatusPayload['accuracy'] }) => {
  const { data, error } = useSWR('/api/mlb/accuracy', fetcher, { refreshInterval: 60000 });

  const brierTrend = React.useMemo(() => {
    if (!data?.tableData) return [];

    const byDate: Record<string, { totalBrier: number; totalWeight: number }> = {};
    for (const row of data.tableData) {
      if (row.brier != null && row.n > 0) {
        if (!byDate[row.date]) byDate[row.date] = { totalBrier: 0, totalWeight: 0 };
        byDate[row.date].totalBrier += row.brier * row.n;
        byDate[row.date].totalWeight += row.n;
      }
    }
    const dates = Object.keys(byDate).sort(); // ascending
    const recent = dates.slice(-7);
    return recent.map((date) => ({
      name: date,
      brier: Number((byDate[date].totalBrier / byDate[date].totalWeight).toFixed(3)),
    }));
  }, [data]);

  return (
    <div className="mb-8">
      <SectionHeader icon={Gauge} label="Model Accuracy" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
        <MetalFrame className="p-4 text-center">
          <div className="text-[16px] font-bold text-slate-400 tracking-[0.12em] mb-2">
            BRIER (ML)
          </div>
          <div
            className={`text-[31px] font-extrabold font-['Rajdhani'] tabular-nums ${brierColor(accuracy.wtd_avg_brier_ml)}`}
          >
            {fmtBrier(accuracy.wtd_avg_brier_ml)}
          </div>
        </MetalFrame>
        <MetalFrame className="p-4 text-center">
          <div className="text-[16px] font-bold text-slate-400 tracking-[0.12em] mb-2">
            BRIER (PROPS)
          </div>
          <div
            className={`text-[31px] font-extrabold font-['Rajdhani'] tabular-nums ${brierColor(accuracy.wtd_avg_brier_props)}`}
          >
            {fmtBrier(accuracy.wtd_avg_brier_props)}
          </div>
        </MetalFrame>
        <MetalFrame className="p-4 text-center">
          <div className="text-[16px] font-bold text-slate-400 tracking-[0.12em] mb-2">
            Games Eval
          </div>
          <div className="text-[31px] font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">
            {fmt(accuracy.total_games_evaluated)}
          </div>
        </MetalFrame>
        <MetalFrame className="p-4 text-center">
          <div className="text-[16px] font-bold text-slate-400 tracking-[0.12em] mb-2">
            Daily Samples
          </div>
          <div className="text-[31px] font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">
            {fmt(accuracy.daily_samples)}
          </div>
        </MetalFrame>
      </div>
      
      <div className="mt-4 px-4 md:px-0">
        <MetalFrame className="p-4 h-[140px] flex flex-col">
          <div className="text-[14px] font-bold text-slate-400 tracking-[0.12em] mb-3">
            7-DAY WTD BRIER TREND
          </div>
          <div className="flex-1 min-h-0">
            {brierTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={brierTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <YAxis domain={['dataMin - 0.005', 'dataMax + 0.005']} hide />
                  <Line 
                    type="monotone" 
                    dataKey="brier" 
                    stroke="#00D4FF" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#0a0a15', stroke: '#00D4FF', strokeWidth: 2 }} 
                    activeDot={{ r: 6, fill: '#00D4FF', stroke: '#fff' }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center text-[#FF4444] font-bold tracking-wider text-[14px]">
                <AlertTriangle size={16} className="mb-2" />
                Error loading trend
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold tracking-wider text-[14px]">
                Loading trend...
              </div>
            )}
          </div>
        </MetalFrame>
      </div>
      <div className="text-[14px] text-slate-400 tracking-wider mt-3 px-4 md:px-0 text-center">
        Brier Score: Lower Is Better (0.25 = Coin Flip). Weighted Average Over Recent Graded Slates.
      </div>
    </div>
  );
});

export const BetTierDistPanel = React.memo(({ tierDist }: { tierDist: MLBStatusPayload['tierDist'] }) => {
  if (Object.keys(tierDist).length === 0) return null;
  return (
    <div className="mb-8">
      <SectionHeader icon={Layers} label="Bet Tier Distribution" />
      <MetalFrame className="p-4 mx-4 md:mx-0">
        <div className="flex flex-wrap gap-3">
          {TIER_META.filter((t) => t.key in tierDist).map((t) => (
            <div
              key={t.key}
              className="flex-1 min-w-[80px] text-center rounded-lg border bg-black/30 py-3 px-2"
              style={{ borderColor: t.color }}
            >
              <div
                className="text-[16px] font-bold tracking-[0.12em] mb-1"
                style={{ color: t.color }}
              >
                {t.key}
              </div>
              <div
                className="text-[26px] font-extrabold font-['Rajdhani'] tabular-nums"
                style={{ color: t.color }}
              >
                {fmt(tierDist[t.key])}
              </div>
            </div>
          ))}
          {Number(tierDist.UNSCORED) > 0 && (
            <div className="flex-1 min-w-[80px] text-center rounded-lg border border-[#475569] bg-black/30 py-3 px-2">
              <div className="text-[16px] font-bold tracking-[0.12em] mb-1 text-slate-400">
                Unscored
              </div>
              <div className="text-[26px] font-extrabold font-['Rajdhani'] tabular-nums text-slate-400">
                {fmt(tierDist.UNSCORED)}
              </div>
            </div>
          )}
        </div>
      </MetalFrame>
    </div>
  );
});

export const DataSourcePanel = React.memo(({ sources, serverNow }: { sources: MLBStatusPayload['sources']; serverNow: any }) => (
  <div className="mb-8">
    <SectionHeader icon={Database} label="Data Source Freshness" />
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
                  <div className="text-[17px] font-semibold text-slate-200 tracking-wider truncate">
                    {SOURCE_LABEL_MAP[src?.source] || src?.source || '-'}
                  </div>
                  <div className="text-[16px] text-slate-400 tracking-wider mt-0.5">
                    <TimeAgo dateString={src?.pulled_at} serverNow={serverNow} fallback="NO PULL DATA" />
                  </div>
                </div>
                <div
                  className={`bg-black/50 border px-2.5 py-1 rounded text-[16px] font-bold tracking-[0.15em] ${ok ? 'text-[#00D4FF] border-[#00D4FF]' : 'text-[#FF4444] border-[#FF4444]'}`}
                >
                  {String(src?.status || 'UNKNOWN').toUpperCase()}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-[16px] capitalize">
          No Data Available
        </div>
      )}
    </MetalFrame>
  </div>
));

export const AlertsPanel = React.memo(({ alerts }: { alerts: MLBStatusPayload['alerts'] }) => {
  const [filter, setFilter] = useState<'ALL' | 'ERRORS' | 'WARNINGS'>('ALL');

  const filteredAlerts = alerts.filter((al) => {
    const lvl = String(al?.level || '').toLowerCase();
    if (filter === 'ERRORS') return lvl === 'critical' || lvl === 'error';
    if (filter === 'WARNINGS') return lvl === 'warning' || lvl === 'warn';
    return true;
  });

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <SectionHeader icon={Bell} label="Recent Alerts" />
        {alerts.length > 0 && (
          <div className="flex gap-2 px-4 md:px-0 mb-4 md:mb-0">
            {['ALL', 'ERRORS', 'WARNINGS'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                aria-pressed={filter === f}
                className={`px-3 py-1 text-[13px] font-bold tracking-wider rounded border ${filter === f ? 'bg-[#00D4FF]/20 border-[#00D4FF] text-[#00D4FF]' : 'bg-transparent border-[#475569] text-slate-400 hover:border-[#00D4FF] hover:text-white'} transition-colors`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
      <MetalFrame className="p-0">
        {filteredAlerts.length > 0 ? (
          <ul className="flex flex-col m-0 p-0 list-none max-h-[400px] overflow-y-auto custom-scrollbar">
            {filteredAlerts.map((al, idx) => (
              <li
                key={`${al?.id}-${idx}`}
                className={`flex justify-between items-start px-5 py-3 bg-black/20 gap-3 ${idx !== filteredAlerts.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}
              >
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold text-slate-200 break-words">
                    {al?.message || '-'}
                  </div>
                  <div className="text-[16px] text-slate-400 tracking-wider mt-0.5 capitalize">
                    {al?.source || 'SYSTEM'}
                  </div>
                </div>
                <div
                  className={`bg-black/50 border px-2 py-0.5 rounded text-[16px] font-bold tracking-[0.15em] shrink-0 ${alertLevelColor(al?.level)}`}
                >
                  {String(al?.level || 'INFO').toUpperCase()}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-[16px] capitalize">
            {alerts.length > 0 ? 'No alerts match filter' : 'No Alerts Found'}
          </div>
        )}
      </MetalFrame>
    </div>
  );
});

export const PipelineRunsPanel = React.memo(({ stages, latestRuns, onMutate }: { stages: string[]; latestRuns: MLBStatusPayload['latestRuns']; onMutate?: () => void }) => {
  const [triggering, setTriggering] = useState<Record<string, boolean>>({});

  const handleTrigger = async (stage: string) => {
    setTriggering((prev) => ({ ...prev, [stage]: true }));
    try {
      const res = await fetch('/api/mlb/trigger-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        throw new Error(`Trigger failed: ${res.status}`);
      }
      if (onMutate) {
        onMutate();
      }
    } catch (e) {
      console.error(e);
      alert(`Failed to rerun stage: ${stage}. Please check logs.`);
    } finally {
      setTriggering((prev) => ({ ...prev, [stage]: false }));
    }
  };

  return (
    <div className="mb-8">
      <SectionHeader icon={CheckCircle2} label="Recent Pipeline Runs" />
      <MetalFrame className="p-6">
        {stages.length > 0 ? (
          <div className="relative border-l border-[#3d4f5f] ml-3 pl-6 space-y-6">
            {stages.map((stage, idx) => {
              const run = latestRuns?.[stage];
              const status = String(run?.status || 'PENDING').toUpperCase();
              
              const isError = ['ERROR', 'FAILED', 'TIMEOUT', 'CRITICAL'].includes(status);
              const isOk = ['OK', 'SUCCESS', 'DONE'].includes(status);
              
              const dotColor = isError ? 'bg-[#FF4444] shadow-[0_0_8px_rgba(255,68,68,0.8)]' : isOk ? 'bg-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.8)]' : 'bg-slate-500';
              const statusColor = isError ? 'text-[#FF4444] border-[#FF4444]' : isOk ? 'text-[#00D4FF] border-[#00D4FF]' : 'text-[#94a3b8] border-[#475569]';

              return (
                <div key={stage} className="relative flex justify-between items-center gap-4">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[30px] w-3 h-3 rounded-full border-2 border-[#0a0a15] ${dotColor}`} />
                  
                  <div className="min-w-0">
                    <div className="text-[18px] font-bold text-white capitalize tracking-wider font-['Rajdhani']">
                      {stage}
                    </div>
                    <div className="text-[14px] text-slate-400 mt-1 tracking-wider">
                      {run?.run_ts ? formatDate(run.run_ts) : 'Waiting to run...'}
                      {run?.duration_sec ? ` \u2022 ${run.duration_sec}s` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`bg-black/50 border px-2.5 py-1 rounded text-[14px] font-bold tracking-[0.2em] shrink-0 ${statusColor}`}
                    >
                      {status}
                    </div>
                    {isError && (
                      <button
                        onClick={() => handleTrigger(stage)}
                        disabled={triggering[stage]}
                        aria-label={`Rerun ${stage}`}
                        className="hex-button px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer text-[13px] font-bold tracking-wider capitalize disabled:opacity-50"
                      >
                        <RefreshCw
                          size={14}
                          className={triggering[stage] ? 'animate-spin text-[#00D4FF]' : 'text-[#00D4FF]'}
                        />
                        <span className="hidden sm:inline">Rerun</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-[16px] capitalize">
            No Stages Found
          </div>
        )}
      </MetalFrame>
    </div>
  );
});

export const DBTableCountsPanel = React.memo(({ tableCounts }: { tableCounts: MLBStatusPayload['tableCounts'] }) => {
  const maxCount = Math.max(0, ...Object.values(tableCounts).map(Number));

  return (
    <div className="mb-8">
      <SectionHeader icon={Database} label="DB Table Counts" />
      <MetalFrame className="p-0 overflow-hidden">
        {Object.keys(tableCounts).length > 0 ? (
          <ul className="flex flex-col m-0 p-0 list-none">
            {Object.entries(tableCounts).map(([table, count], idx, arr) => {
              const c = Number(count);
              const pct = maxCount > 0 ? (c / maxCount) * 100 : 0;
              return (
                <li
                  key={table}
                  className={`relative flex justify-between px-6 py-4 bg-black/20 gap-3 ${idx !== arr.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}
                >
                  {/* Progress Bar Background */}
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-[#00D4FF]/10 z-0 transition-all duration-1000 ease-in-out" 
                    style={{ width: `${pct}%` }} 
                  />
                  
                  <span className="text-[17px] font-semibold text-slate-200 tracking-wider truncate z-10">
                    {table}
                  </span>
                  <span className="text-[18px] font-bold text-[#00D4FF] tabular-nums shrink-0 z-10">
                    {fmt(c)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6 text-center text-slate-400 font-bold tracking-wider text-[16px] capitalize">
            No Table Data Available
          </div>
        )}
      </MetalFrame>
    </div>
  );
});
