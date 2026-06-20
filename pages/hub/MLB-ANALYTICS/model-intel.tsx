import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { ArrowLeft, BrainCircuit, Activity, Shield, Loader2, Database, Network } from 'lucide-react';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });

const formatCurrency = (val: number, showSign = false) => {
    if (val === undefined || val === null) return '$0.00';
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (showSign) {
        return val > 0 ? `+$${formatted}` : val < 0 ? `-$${formatted}` : `$${formatted}`;
    }
    return `$${formatted}`;
};

interface MetricBoxProps {
    title: string;
    value: string | number;
    sub?: string;
    valueColor?: string;
    isLoading?: boolean;
}

const MetricBox = ({ title, value, sub, valueColor = '#FFFFFF', isLoading }: MetricBoxProps) => (
    <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex flex-col shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_10px_rgba(0,0,0,0.5)] transition-all hover:border-[#00D4FF] hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_15px_rgba(0,212,255,0.2)]">
        <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 uppercase">{title}</div>
        <div className="text-2xl font-extrabold" style={{ color: isLoading ? '#00D4FF' : valueColor, textShadow: isLoading || valueColor !== '#FFFFFF' ? `0 0 10px ${isLoading ? '#00D4FF' : valueColor}80` : 'none', fontFamily: '"Rajdhani", sans-serif' }}>
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#00D4FF]" /> : value}
        </div>
        {sub && <div className="text-[11px] text-slate-500 mt-1 font-bold tracking-widest uppercase">{isLoading ? '--' : sub}</div>}
    </div>
);

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

export default function ModelIntelPage() {
    const router = useRouter();
    const { data, error, isLoading, mutate } = useSWR('/api/mlb/model-intel', fetcher, {
        refreshInterval: 60000,
        revalidateOnFocus: false,
    });

    if (error || data?.error) {
        logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Predictive Model Intelligence — Neural Network Analytics | Smarter.Poker" description="Behind-the-scenes look at the Smarter.Poker MLB prediction engine." noindex={true} />
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#00D4FF]/50 shadow-[0_0_20px_rgba(0,212,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Activity className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF4444] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load intel data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    const intel = data?.intel || {};
    const history = data?.history || [];

    // Format chart data (reverse to show chronological if it came in descending)
    const chartData = [...history].reverse().map((day: any) => ({
        date: day.official_date,
        pnl: day.daily_pnl || 0,
        bets: (day.bets_won || 0) + (day.bets_lost || 0),
        roi: day.roi || 0
    }));

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead 
                title="MLB Predictive Model Intelligence — Neural Network Analytics | Smarter.Poker" 
                description="Behind-the-scenes look at the Smarter.Poker MLB prediction engine. Explore model version, total bets tracked, recent ROI, training history, and daily P&L performance matrix for the 2025 MLB season."
                canonical="/hub/MLB-ANALYTICS/model-intel" 
            />

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            <div className="edge-to-edge-container max-w-[1000px] mx-auto px-4 py-6 relative">
                {/* Background Glows */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.03] pointer-events-none"></div>
                <div className="absolute bottom-40 left-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.02] pointer-events-none"></div>

                <div className="flex flex-wrap gap-4 justify-between items-start mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#0d1117] border-[2px] border-[#00D4FF]/30 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(0,212,255,0.2)]">
                            <BrainCircuit className="text-[#00D4FF] animate-pulse" size={24} />
                        </div>
                        <div>
                            <h1 className="m-0 text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 15px rgba(255,255,255,0.2)' }}>
                                MODEL <span className="text-[#00D4FF]" style={{ textShadow: '0 0 15px rgba(0,212,255,0.4)' }}>INTEL</span>
                            </h1>
                            <p className="m-0 mt-1 text-[#00D4FF] font-bold uppercase tracking-wider text-[11px]">
                                Neural network intelligence layer & backtesting matrices
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 relative z-10">
                    <MetricBox 
                        title="MODEL VERSION" 
                        value={intel.model_version || 'v4.2.1-Edge'} 
                        valueColor="#00D4FF" 
                        isLoading={isLoading} 
                    />
                    <MetricBox 
                        title="TOTAL BETS TRACKED" 
                        value={intel.total_bets_tracked ? intel.total_bets_tracked.toLocaleString() : '0'} 
                        valueColor="#FFFFFF" 
                        isLoading={isLoading} 
                    />
                    <MetricBox 
                        title="RECENT ROI" 
                        value={`${Number(intel.recent_roi || 0) > 0 ? '+' : ''}${Number(intel.recent_roi || 0).toFixed(2)}%`} 
                        valueColor={Number(intel.recent_roi || 0) > 0 ? '#00D4FF' : Number(intel.recent_roi || 0) < 0 ? '#FF0055' : '#FFFFFF'} 
                        isLoading={isLoading} 
                    />
                    <MetricBox 
                        title="LAST TRAINING" 
                        value={intel.last_training_date ? new Date(intel.last_training_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '--'} 
                        valueColor="#FFFFFF" 
                        isLoading={isLoading} 
                    />
                </div>

                <h2 className="text-lg font-extrabold text-white mb-4 flex items-center gap-2 uppercase tracking-widest relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                    <div className="w-1 h-[18px] bg-[#00D4FF] rounded-sm shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
                    Daily Performance Matrix
                </h2>
                <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 mb-8 h-[350px] shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden z-10">
                    {isLoading ? (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
                            <div className="text-[#00D4FF] font-bold tracking-widest text-sm animate-pulse uppercase">Compiling Matrices...</div>
                        </div>
                    ) : chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#00D4FF" stopOpacity={0.0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" vertical={false} />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#64748B" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false}
                                    tickFormatter={(val) => {
                                        if (!val) return '';
                                        const d = new Date(val);
                                        if (isNaN(d.getTime())) return '';
                                        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                                    }}
                                />
                                <YAxis 
                                    stroke="#64748B" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <Tooltip 
                                    contentStyle={{ background: '#0a0a15', border: '1px solid #00D4FF', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)' }}
                                    itemStyle={{ color: '#00D4FF', fontWeight: 700 }}
                                    labelStyle={{ color: '#F8FAFC', marginBottom: '4px' }}
                                    formatter={(value: number) => [formatCurrency(value), 'Daily P&L']}
                                    labelFormatter={(label) => `Date: ${label}`}
                                />
                                <Area type="monotone" dataKey="pnl" stroke="#00D4FF" strokeWidth={3} fillOpacity={1} fill="url(#colorPnl)" activeDot={{ r: 6, fill: '#00D4FF', stroke: '#0a0a15', strokeWidth: 2 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-bold uppercase tracking-widest text-[11px]">
                            No Historical Data Available
                        </div>
                    )}
                </div>
            </div>
            <BottomNavBar />
        </div>
    );
}
