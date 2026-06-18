import React from 'react';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { RefreshCw, Activity, Database, Clock, ServerCrash, CheckCircle2 } from 'lucide-react';
import { logError } from '@/utils/logger';

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

export default function StatusPage() {
    const { data, error, mutate, isValidating } = useSWR('/api/mlb/status', fetcher, {
        refreshInterval: 60000,
        revalidateOnFocus: true,
    });

    const isLoading = !data && !error;

    const timeAgo = (dateString: string) => {
        if (!dateString) return '';
        const now = new Date();
        const past = new Date(dateString);
        if (isNaN(past.getTime())) return '';
        const diffMs = now.getTime() - past.getTime();
        const diffMins = Math.max(0, Math.round(diffMs / 60000));
        if (diffMins < 60) return `${diffMins}M AGO`;
        const diffHrs = Math.round(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}H AGO`;
        const diffDays = Math.round(diffHrs / 24);
        return `${diffDays}D AGO`;
    };

    const formatDate = (dateString: string) => {
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

    const isSystemFresh = data && !data.error ? !!data.isSystemFresh : false;

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a15', color: '#e2e8f0', paddingBottom: 70, fontFamily: "var(--font-orbitron), 'Orbitron', 'Rajdhani', sans-serif", width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
            <SEOHead 
                title="Data Status | MLB Analytics" 
                description="Check the current status and freshness of the MLB Analytics system."
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            {/* Sub-header for Data Status Page */}
            <div style={{ 
                background: 'linear-gradient(180deg, #1a2332 0%, #0d1117 100%)', 
                borderBottom: '2px solid #3d4f5f', 
                padding: '16px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Data <span style={{ color: '#00D4FF', textShadow: '0 0 10px rgba(0, 212, 255, 0.6)' }}>Status</span>
                    </h1>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ color: '#00D4FF', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>SYSTEM</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <div style={{ 
                            width: 8, height: 8, borderRadius: '50%', 
                            background: isSystemFresh ? '#00D4FF' : '#FF00FF',
                            boxShadow: isSystemFresh ? '0 0 10px #00D4FF' : '0 0 10px #FF00FF'
                        }}></div>
                        <div style={{ 
                            fontSize: 12, fontWeight: 700, letterSpacing: 1,
                            color: isSystemFresh ? '#00D4FF' : '#FF00FF',
                            textShadow: isSystemFresh ? '0 0 5px rgba(0,212,255,0.5)' : '0 0 5px rgba(255,0,255,0.5)'
                        }}>
                            {isSystemFresh ? 'FRESH' : 'STALE'}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <button 
                        onClick={() => mutate()}
                        disabled={isValidating}
                        style={{
                            background: 'transparent',
                            border: '1px solid #3d4f5f',
                            color: '#00D4FF',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            fontFamily: 'inherit',
                            opacity: isValidating ? 0.5 : 1
                        }}
                    >
                        <RefreshCw size={14} className={isValidating ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#00D4FF' }}>
                        <Loader2 size={32} className="animate-spin mx-auto mb-4" />
                        <div style={{ fontWeight: 700, letterSpacing: '0.1em' }} className="animate-pulse">SCANNING DATABASE...</div>
                    </div>
                ) : (
                    <>
                        <style dangerouslySetInnerHTML={{__html: `
                            .metal-frame {
                                position: relative;
                                background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                                border: 2px solid #3d4f5f;
                                border-radius: 12px;
                                box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5);
                            }
                            .frame-bolt {
                                position: absolute;
                                width: 10px;
                                height: 10px;
                                background: radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%);
                                border-radius: 50%;
                                border: 1px solid #2a3a4a;
                                box-shadow: inset 0 1px 2px rgba(255,255,255,0.2);
                            }
                            .neon-strip {
                                position: absolute;
                                width: 2px;
                                top: 20%;
                                bottom: 20%;
                                background: #00D4FF;
                                box-shadow: 0 0 5px #00D4FF, 0 0 10px rgba(0,212,255,0.6);
                                border-radius: 2px;
                            }
                            .neon-strip.left { left: 4px; }
                            .neon-strip.right { right: 4px; }
                        `}} />

                        {/* DATA FRESHNESS */}
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <Clock size={16} color="#00D4FF" />
                                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#00D4FF', letterSpacing: 2, margin: 0, textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>DATA FRESHNESS</h2>
                            </div>
                            <div className="metal-frame" style={{ overflow: 'hidden' }}>
                                <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                                <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                                <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                                <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                                <div className="neon-strip left" />
                                <div className="neon-strip right" />
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #2a3a4a', background: 'rgba(0,0,0,0.2)' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', letterSpacing: 1 }}>AGG MARKET AS_OF</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: isSystemFresh ? '#00D4FF' : '#FF00FF', textShadow: isSystemFresh ? '0 0 8px rgba(0,212,255,0.5)' : '0 0 8px rgba(255,0,255,0.5)' }}>{data?.aggMarketAsOf || '-'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', background: 'rgba(0,0,0,0.2)' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', letterSpacing: 1 }}>TODAY</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#00D4FF', textShadow: '0 0 8px rgba(0,212,255,0.5)' }}>{data?.todayStr || '-'}</span>
                                </div>
                            </div>
                        </div>

                        {/* TODAY'S PREDICTIONS */}
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <Activity size={16} color="#00D4FF" />
                                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#00D4FF', letterSpacing: 2, margin: 0, textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>TODAY'S PREDICTIONS (LAST 24H)</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { label: 'MARKET BETS', val: data?.marketBetsCount },
                                    { label: 'PROPS', val: data?.propsCount },
                                    { label: 'BEST BETS', val: data?.bestBetsCount }
                                ].map((item, idx) => (
                                    <div key={idx} className="metal-frame" style={{ padding: '20px', textAlign: 'center' }}>
                                        <div className="frame-bolt" style={{ top: '6px', left: '6px', width: 6, height: 6 }} />
                                        <div className="frame-bolt" style={{ top: '6px', right: '6px', width: 6, height: 6 }} />
                                        <div className="frame-bolt" style={{ bottom: '6px', left: '6px', width: 6, height: 6 }} />
                                        <div className="frame-bolt" style={{ bottom: '6px', right: '6px', width: 6, height: 6 }} />
                                        
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: 1.5, marginBottom: 8 }}>{item.label}</div>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: '#00D4FF', textShadow: '0 0 15px rgba(0,212,255,0.6)' }}>
                                            {item.val?.toLocaleString() || 0}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RECENT PIPELINE RUNS */}
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <CheckCircle2 size={16} color="#00D4FF" />
                                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#00D4FF', letterSpacing: 2, margin: 0, textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>RECENT PIPELINE RUNS</h2>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {stages.map((stage) => {
                                    const run = data?.latestRuns?.[stage];
                                    const isError = run?.status === 'error';
                                    const glowColor = isError ? '#FF00FF' : '#00D4FF';
                                    
                                    return (
                                        <div key={stage} className="metal-frame" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
                                            <div className="neon-strip left" style={{ background: glowColor, boxShadow: `0 0 5px ${glowColor}` }} />
                                            <div>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>{stage}</div>
                                                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, letterSpacing: 0.5, fontFamily: 'monospace' }}>{run ? formatDate(run.run_at) : 'NO DATA FOUND'}</div>
                                            </div>
                                            {run && (
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <div style={{ 
                                                        color: '#94A3B8', fontSize: 11, fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' 
                                                    }}>
                                                        {timeAgo(run.run_at)}
                                                    </div>
                                                    <div style={{ 
                                                        background: 'rgba(0,0,0,0.5)', 
                                                        color: glowColor, 
                                                        border: `1px solid ${glowColor}`,
                                                        padding: '4px 10px', 
                                                        borderRadius: 4, 
                                                        fontSize: 10, 
                                                        fontWeight: 700, 
                                                        letterSpacing: 2,
                                                        boxShadow: `0 0 10px rgba(${isError ? '255,0,255' : '0,212,255'},0.3)`
                                                    }}>
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
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <Database size={16} color="#00D4FF" />
                                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#00D4FF', letterSpacing: 2, margin: 0, textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>DB TABLE SIZES</h2>
                            </div>
                            <div className="metal-frame" style={{ overflow: 'hidden' }}>
                                <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                                <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                                <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                                <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                                <div className="neon-strip left" />
                                <div className="neon-strip right" />

                                {[
                                    { label: 'MARKET OUTPUT', val: data?.sizes?.market },
                                    { label: 'PROPS OUTPUT', val: data?.sizes?.props },
                                    { label: 'FACT GAMES', val: data?.sizes?.games },
                                    { label: 'RAW ODDS', val: data?.sizes?.odds }
                                ].map((item, idx, arr) => (
                                    <div key={idx} style={{ 
                                        display: 'flex', justifyContent: 'space-between', padding: '16px 24px', 
                                        borderBottom: idx < arr.length - 1 ? '1px solid #2a3a4a' : 'none',
                                        background: 'rgba(0,0,0,0.2)' 
                                    }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', letterSpacing: 1.5 }}>{item.label}</span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{item.val?.toLocaleString() || '-'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </>
                )}
            </div>
            <BottomNavBar />
        </div>
    );
}
