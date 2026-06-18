import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Activity, TrendingUp } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

const Sparkline = ({ data }: { data: number[] }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min;
    
    return (
        <div className="flex items-end h-16 w-full gap-1 pt-4">
            {data.map((value, i) => {
                const heightPct = range === 0 ? 50 : ((value - min) / range) * 100;
                return (
                    <div 
                        key={i} 
                        className="flex-1 bg-[#00D4FF] opacity-80 rounded-t-sm"
                        style={{ height: `${Math.max(5, heightPct)}%`, boxShadow: '0 0 8px rgba(0,212,255,0.4)', transition: 'height 0.3s ease' }}
                    />
                );
            })}
        </div>
    );
};

export default function TrackerPage() {
    const [prob, setProb] = useState(55.2);
    const [history, setHistory] = useState<number[]>(Array(20).fill(50));
    
    useEffect(() => {
        const interval = setInterval(() => {
            setProb(prev => {
                const change = (Math.random() - 0.5) * 4;
                const next = Math.max(1, Math.min(99, prev + change));
                setHistory(h => [...h.slice(1), next]);
                return next;
            });
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead 
                title="Live Tracker | MLB Analytics" 
                description="Live Game Tracker and Probability updates." 
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            <div className="p-4 w-full max-w-4xl mx-auto box-border pt-8">
                <div className="flex items-center gap-3 mb-8">
                    <Activity className="w-8 h-8 text-[#FFD700] drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]" />
                    <h1 className="text-2xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                        Live <span className="text-[#FFD700]">Tracker</span>
                    </h1>
                </div>

                <style dangerouslySetInnerHTML={{__html: `
                    .metal-frame {
                        position: relative;
                        background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                        border: 2px solid #3d4f5f;
                        border-radius: 12px;
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5);
                        padding: 24px;
                    }
                    .frame-bolt {
                        position: absolute;
                        width: 12px;
                        height: 12px;
                        background: radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%);
                        border-radius: 50%;
                        border: 1px solid #2a3a4a;
                        box-shadow: inset 0 1px 2px rgba(255,255,255,0.2);
                    }
                    .frame-bolt::after {
                        content: '+';
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        font-size: 8px;
                        color: #1a2a3a;
                    }
                    .neon-strip {
                        position: absolute;
                        width: 4px;
                        top: 20%;
                        bottom: 20%;
                        background: #00D4FF;
                        box-shadow: 0 0 10px #00D4FF, 0 0 20px rgba(0, 212, 255, 0.6);
                        border-radius: 2px;
                    }
                    .neon-strip.left { left: 4px; }
                    .neon-strip.right { right: 4px; }
                `}} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="metal-frame">
                        <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                        <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                        <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                        <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                        <div className="neon-strip left" />
                        
                        <div className="flex justify-between items-center border-b border-[#3d4f5f] pb-4 mb-4">
                            <div className="text-center">
                                <div className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-1">Away</div>
                                <div className="text-3xl font-extrabold text-white" style={{ fontFamily: '"Orbitron", sans-serif' }}>NYY</div>
                                <div className="text-sm text-[#FFD700] font-bold mt-1">4</div>
                            </div>
                            <div className="text-center px-4">
                                <div className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2">Top 7th</div>
                                <div className="flex gap-1 justify-center mb-2">
                                    <div className="w-3 h-3 rounded-full bg-[#FFD700] shadow-[0_0_8px_rgba(255,215,0,0.8)]"></div>
                                    <div className="w-3 h-3 rounded-full border border-[#FFD700]"></div>
                                    <div className="w-3 h-3 rounded-full border border-[#FFD700]"></div>
                                </div>
                                <div className="text-xs text-slate-300 font-mono tracking-widest">2 OUTS</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-1">Home</div>
                                <div className="text-3xl font-extrabold text-white" style={{ fontFamily: '"Orbitron", sans-serif' }}>BOS</div>
                                <div className="text-sm text-slate-300 font-bold mt-1">3</div>
                            </div>
                        </div>

                        <div className="bg-[#0a0a15] rounded-lg p-4 border border-[#1a2332] shadow-inner">
                            <div className="flex justify-between items-end mb-2">
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">NYY Win Probability</div>
                                <div className="text-2xl font-bold text-[#00D4FF] drop-shadow-[0_0_8px_rgba(0,212,255,0.6)]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {prob.toFixed(1)}%
                                </div>
                            </div>
                            <Sparkline data={history} />
                        </div>
                    </div>

                    <div className="flex flex-col gap-6">
                        <div className="metal-frame" style={{ padding: '16px' }}>
                            <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                            <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                            <div className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2">Live Edge Calc</div>
                            <div className="flex items-center justify-between">
                                <span className="text-lg font-bold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>NYY -1.5</span>
                                <div className="flex items-center gap-2 text-[#00FF00] drop-shadow-[0_0_8px_rgba(0,255,0,0.4)]">
                                    <TrendingUp size={20} />
                                    <span className="font-bold text-xl" style={{ fontFamily: '"Orbitron", sans-serif' }}>+4.2% EV</span>
                                </div>
                            </div>
                        </div>

                        <div className="metal-frame" style={{ padding: '16px' }}>
                            <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                            <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                            <div className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2">Pitcher Fatigue</div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-slate-300">G. Cole (NYY)</span>
                                <span className="text-sm font-bold text-[#FF00FF]">94 Pitches</span>
                            </div>
                            <div className="w-full h-2 bg-[#0a0a15] rounded-full overflow-hidden">
                                <div className="h-full bg-[#FF00FF] shadow-[0_0_8px_#FF00FF] w-[85%]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <BottomNavBar />
        </div>
    );
}
