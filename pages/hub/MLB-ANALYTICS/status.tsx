import React from 'react';
import Head from 'next/head';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();
        
        // Compute 'today' in America/Chicago
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());
        
        // 24 hours ago
        const yesterdayDate = new Date();
        yesterdayDate.setHours(yesterdayDate.getHours() - 24);
        const last24hIso = yesterdayDate.toISOString();
        
        // 1. Pipeline Runs
        const { data: pipelineData } = await mlbDb.from('pipeline_runs')
            .select('*')
            .order('run_at', { ascending: false })
            .limit(100);
            
        const latestRuns: any = {};
        const stages = ['ingest', 'heal', 'evaluate', 'export', 'alert', 'track', 'grade_props', 'grade', 'push', 'predict'];
        let hasError = false;

        if (pipelineData) {
            pipelineData.forEach(run => {
                if (!latestRuns[run.stage] && stages.includes(run.stage)) {
                    latestRuns[run.stage] = run;
                    if (run.status === 'error') {
                        hasError = true;
                    }
                }
            });
        }
        
        // 2. Freshness
        const { data: latestPred } = await mlbDb.from('pred_market_output')
            .select('as_of_ts')
            .order('as_of_ts', { ascending: false })
            .limit(1);
        let aggMarketAsOf = latestPred?.[0]?.as_of_ts || null;
        let marketDateStr: string | null = null;
        if (aggMarketAsOf && aggMarketAsOf.includes('T')) {
            marketDateStr = aggMarketAsOf.split('T')[0]; // Simplify to YYYY-MM-DD
        }

        // Determine System Freshness
        // System is STALE if market data is older than today or yesterday, OR if there's a recent pipeline error.
        const yesterdayStr = formatter.format(yesterdayDate);
        const isDateStale = marketDateStr && marketDateStr < yesterdayStr;
        const isSystemFresh = !hasError && !isDateStale;
        
        // 3. Predictions
        const { count: marketBetsCount } = await mlbDb.from('pred_market_output').select('*', { count: 'exact', head: true }).gte('as_of_ts', last24hIso);
        const { count: propsCount } = await mlbDb.from('pred_props').select('*', { count: 'exact', head: true }).gte('as_of_ts', last24hIso);
        const { count: bestBetsCount } = await mlbDb.from('pred_best_bets').select('*', { count: 'exact', head: true }).eq('official_date', todayStr);
        
        // 4. Table Sizes - Use ESTIMATED to prevent SSR timeout on large tables
        const { count: sizeMarket } = await mlbDb.from('pred_market_output').select('*', { count: 'exact', head: true });
        const { count: sizeProps } = await mlbDb.from('pred_props').select('*', { count: 'estimated', head: true });
        const { count: sizeFactGames } = await mlbDb.from('fact_games').select('*', { count: 'estimated', head: true });
        const { count: sizeOdds } = await mlbDb.from('raw_odds').select('*', { count: 'estimated', head: true });
        
        return {
            props: {
                todayStr,
                aggMarketAsOf: marketDateStr,
                isSystemFresh,
                marketBetsCount: marketBetsCount || 0,
                propsCount: propsCount || 0,
                bestBetsCount: bestBetsCount || 0,
                latestRuns,
                sizes: {
                    market: sizeMarket || 0,
                    props: sizeProps || 0,
                    games: sizeFactGames || 0,
                    odds: sizeOdds || 0
                }
            }
        };
    } catch (err) {
        console.error('Error fetching status data:', err);
        return { props: { error: true } };
    }
}

export default function StatusPage({ 
    todayStr, 
    aggMarketAsOf, 
    isSystemFresh = true,
    marketBetsCount, 
    propsCount, 
    bestBetsCount, 
    latestRuns, 
    sizes 
}: StatusPageProps) {
    const [refreshing, setRefreshing] = useState(false);

    const timeAgo = (dateString: string) => {
        if (!dateString) return '';
        const now = new Date();
        const past = new Date(dateString);
        const diffMs = now.getTime() - past.getTime();
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins < 60) return `${diffMins}M AGO`;
        const diffHrs = Math.round(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}H AGO`;
        const diffDays = Math.round(diffHrs / 24);
        return `${diffDays}D AGO`;
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    };

    const stages = ['ingest', 'heal', 'evaluate', 'export', 'alert', 'track', 'grade_props', 'grade', 'push', 'predict'];

    return (
        <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', paddingBottom: 70, fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif", width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
            <SEOHead 
                title="Data Status | MLB Analytics" 
                description="Check the current status and freshness of the MLB Analytics system."
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            {/* Sub-header for Data Status Page */}
            <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Data <span style={{ color: '#2563EB' }}>Status</span></h1>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#2563EB', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>SYSTEM</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: isSystemFresh ? '#10B981' : '#F59E0B' }}></div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: isSystemFresh ? '#10B981' : '#F59E0B', letterSpacing: 1 }}>
                            {isSystemFresh ? 'FRESH' : 'STALE'}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
                
                {/* DATA FRESHNESS */}
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 12 }}>DATA FRESHNESS</h2>
                    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>AGG Market as_of</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: isSystemFresh ? '#10B981' : '#F59E0B' }}>{aggMarketAsOf || '-'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Today</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#10B981' }}>{todayStr || '-'}</span>
                        </div>
                    </div>
                </div>

                {/* TODAY'S PREDICTIONS */}
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 12 }}>TODAY'S PREDICTIONS (LAST 24H)</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: 1 }}>MARKET BETS</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{marketBetsCount?.toLocaleString() || 0}</div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: 1 }}>PROPS</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{propsCount?.toLocaleString() || 0}</div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: 1 }}>BEST BETS</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{bestBetsCount?.toLocaleString() || 0}</div>
                        </div>
                    </div>
                </div>

                {/* RECENT PIPELINE RUNS */}
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 12 }}>RECENT PIPELINE RUNS</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {stages.map((stage) => {
                            const run = latestRuns?.[stage];
                            const isError = run?.status === 'error';
                            const badgeBg = isError ? '#FEE2E2' : '#D1FAE5';
                            const badgeColor = isError ? '#EF4444' : '#10B981';
                            
                            return (
                                <div key={stage} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', textTransform: 'capitalize' }}>{stage}</div>
                                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{run ? formatDate(run.run_at) : 'No data'}</div>
                                    </div>
                                    {run && (
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <div style={{ background: '#D1FAE5', color: '#10B981', padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
                                                {timeAgo(run.run_at)}
                                            </div>
                                            <div style={{ background: badgeBg, color: badgeColor, padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
                                                {run.status.toUpperCase()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* DB TABLE SIZES */}
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 12 }}>DB TABLE SIZES</h2>
                    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Market Output</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>{sizes?.market?.toLocaleString() || '-'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Props Output</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>{sizes?.props?.toLocaleString() || '-'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Fact Games</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>{sizes?.games?.toLocaleString() || '-'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Raw Odds</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>{sizes?.odds?.toLocaleString() || '-'}</span>
                        </div>
                    </div>
                </div>

            </div>
            <BottomNavBar />
        </div>
    );
}
