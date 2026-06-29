import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { logError } from '@/utils/logger';

// Extracted Components
import { StatusErrorBoundary } from '../../../src/components/mlb/status/StatusErrorBoundary';
import { SkeletonDashboard } from '../../../src/components/mlb/status/SkeletonDashboard';
import { TimeAgo } from '../../../src/components/mlb/status/TimeAgo';
import {
  PipelineStatusPanel,
  HealthPanel,
  TodaySlatePanel,
  ModelAccuracyPanel,
  BetTierDistPanel,
  DataSourcePanel,
  AlertsPanel,
  PipelineRunsPanel,
  DBTableCountsPanel,
} from '../../../src/components/mlb/status/StatusPanels';

export interface MLBStatusPayload {
  ok: boolean;
  error?: string;
  serverNow: string | null;
  today: string | null;
  aggAsOf: string | null;
  isSystemFresh: boolean;
  pipeline: {
    okCount: number;
    errorCount: number;
    pendingCount?: number;
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
    if (res.status === 403) {
      // Admin-only endpoint: return a clean error object instead of throwing
      return { ok: false, error: 'Access denied. This page requires admin privileges.' };
    }
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    logError('SWR Fetch', err);
    throw err;
  }
};

const EMPTY_HEALTH: Partial<MLBStatusPayload['health']> = {};
const EMPTY_SLATE: Partial<MLBStatusPayload['slate']> = {};
const EMPTY_ACCURACY: Partial<MLBStatusPayload['accuracy']> = {};
const EMPTY_TIER_DIST: Record<string, number> = {};
const EMPTY_TABLE_COUNTS: Record<string, number> = {};
const EMPTY_LATEST_RUNS: Record<string, any> = {};
const EMPTY_PIPELINE = { hasError: false, okCount: 0, errorCount: 0, total: 0 };

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
            <h2 className="text-[31px] font-extrabold text-white capitalize tracking-wider mb-2 relative z-10 font-['Rajdhani']">
              System Error
            </h2>
            <p className="text-slate-300 text-[16px] relative z-10 mb-6 break-words">{apiError}</p>
            <button
              onClick={handleRefresh}
              disabled={manualRefreshing && isValidating}
              className="inline-flex items-center gap-2 hex-button px-4 py-3 rounded text-[16px] font-bold tracking-widest capitalize touch-manipulation relative z-10 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              <RefreshCw
                aria-hidden="true"
                size={14}
                className={
                  isValidating ? 'animate-spin neon-animated drop-shadow-[0_0_8px_#00D4FF]' : ''
                }
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
  const health = data?.health || EMPTY_HEALTH;
  const slate = data?.slate || EMPTY_SLATE;
  const accuracy = data?.accuracy || EMPTY_ACCURACY;
  const tierDist = data?.tierDist || EMPTY_TIER_DIST;

  const sources = useMemo(() => (Array.isArray(data?.sources) ? data.sources : []), [data?.sources]);
  const alerts = useMemo(() => (Array.isArray(data?.alerts) ? data.alerts : []), [data?.alerts]);
  const tableCounts = typeof data?.tableCounts === 'object' && data.tableCounts !== null ? data.tableCounts : EMPTY_TABLE_COUNTS;
  const stages = useMemo(() => (Array.isArray(data?.stages) ? data.stages : []), [data?.stages]);
  const latestRuns = typeof data?.latestRuns === 'object' && data.latestRuns !== null ? data.latestRuns : EMPTY_LATEST_RUNS;
  const pipeline = data?.pipeline || EMPTY_PIPELINE;

  const wrappedContent = (
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
      {seo}

      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
      <MlbSubNav />

      <div className="bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[2px] border-[#3d4f5f] p-4 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[31px] font-extrabold font-['Rajdhani'] capitalize tracking-widest">
            Data <span className="text-[#00D4FF]">Status</span>
          </h1>
          {health?.last_refresh && (
            <div className="text-[16px] text-slate-400 tracking-widest capitalize mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                Data refreshed{' '}
                <TimeAgo dateString={health.last_refresh} serverNow={data?.serverNow} />
              </span>
              {isValidating && !isLoading && (
                <span className="text-[#00D4FF] animate-pulse">&middot; updating&hellip;</span>
              )}
            </div>
          )}
        </div>
        <div className="text-right flex flex-col items-end shrink-0">
          <div className="text-[#00D4FF] text-[16px] font-bold tracking-widest capitalize">System</div>
          <div
            className="inline-flex items-center gap-1.5 mt-1"
            role="status"
            aria-live="polite"
            aria-label={`System status: ${isLoading ? 'loading' : isSystemFresh ? 'fresh' : 'stale'}`}
          >
            <div
              className={`w-2 h-2 rounded-full ${isLoading ? 'bg-slate-400' : isSystemFresh ? 'bg-[#00D4FF]' : 'bg-[#FF4444]'}`}
            ></div>
            <div
              className={`text-[16px] font-bold tracking-widest ${isLoading ? 'text-slate-400' : isSystemFresh ? 'text-[#00D4FF]' : 'text-[#FF4444]'}`}
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
                className="hex-button px-4 py-3 rounded flex items-center gap-2 cursor-pointer text-[16px] font-extrabold tracking-widest capitalize touch-manipulation disabled:opacity-50 min-h-[44px]"
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
                <PipelineStatusPanel pipeline={pipeline} />
                <HealthPanel health={health} data={data} serverNow={data?.serverNow} />
                <TodaySlatePanel slate={slate} />
                <ModelAccuracyPanel accuracy={accuracy} />
                <BetTierDistPanel tierDist={tierDist} />
                <DataSourcePanel sources={sources} serverNow={data?.serverNow} />
                <AlertsPanel alerts={alerts} />
                <PipelineRunsPanel stages={stages} latestRuns={latestRuns} onMutate={mutate} />
                <DBTableCountsPanel tableCounts={tableCounts} />
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
      header={<UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />}
      nav={<MlbSubNav />}
    >
      {wrappedContent}
    </StatusErrorBoundary>
  );
}
