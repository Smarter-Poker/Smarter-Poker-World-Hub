import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit, Cpu, Database, Network } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

export default function ModelIntelPage() {
    const [cycle, setCycle] = useState(0);
    
    useEffect(() => {
        const interval = setInterval(() => {
            setCycle(prev => (prev + 1) % 100);
        }, 100);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead 
                title="Model Intel | MLB Analytics" 
                description="Behind the scenes look into the MLB predictive model's logic." 
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            <div className="p-4 w-full max-w-5xl mx-auto box-border pt-8">
                <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-12 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_30px_rgba(0,0,0,0.5)] group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[60px] opacity-10"></div>
                    
                    <BrainCircuit className="w-20 h-20 mx-auto text-[#00D4FF] mb-6 drop-shadow-[0_0_15px_rgba(0,212,255,0.5)] animate-pulse" />
                    <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-widest uppercase mb-4 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                        Model <span className="text-[#00D4FF]">Intel</span>
                    </h1>
                    <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#00D4FF] to-transparent mx-auto mb-6 opacity-50"></div>
                    <p className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-10 leading-relaxed max-w-md mx-auto relative z-10">
                        The neural network intelligence layer is currently compiling and backtesting advanced datasets. <br/><br/>
                        <span className="text-[#00D4FF]">Deep insights will be available soon.</span>
                    </p>
                    <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-2 bg-[#0d1117] border border-[#3d4f5f] hover:border-[#00D4FF] text-[#00D4FF] px-6 py-3 rounded-lg text-xs font-extrabold tracking-widest uppercase transition-all shadow-[0_4px_10px_rgba(0,0,0,0.5)] hover:shadow-[0_0_15px_rgba(0,212,255,0.3)] relative z-10">
                        <ArrowLeft size={16} /> Return to Dashboard
                    </Link>
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
                    
                    .grid-overlay {
                        background-size: 20px 20px;
                        background-image: linear-gradient(to right, rgba(0, 212, 255, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 212, 255, 0.05) 1px, transparent 1px);
                    }
                `}} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Status Console */}
                    <div className="metal-frame col-span-1 lg:col-span-3 flex justify-between items-center bg-[#0d1117] border-[#00D4FF] shadow-[0_0_15px_rgba(0,212,255,0.2)]">
                        <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                        <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                        <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                        <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                        
                        <div className="flex items-center gap-4">
                            <Cpu className="text-[#FF00FF] w-6 h-6 animate-pulse" />
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Engine Core</div>
                                <div className="text-xl text-white font-extrabold tracking-widest" style={{ fontFamily: '"Orbitron", sans-serif' }}>V4.2.0-STABLE</div>
                            </div>
                        </div>
                        
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Global Confidence</div>
                            <div className="text-2xl text-[#00D4FF] font-bold drop-shadow-[0_0_8px_rgba(0,212,255,0.6)]">
                                92.{cycle.toString().padStart(2, '0')}%
                            </div>
                        </div>
                    </div>

                    {/* Features Matrix */}
                    <div className="metal-frame col-span-1 lg:col-span-2">
                        <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                        <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                        <div className="neon-strip left" />
                        
                        <div className="flex items-center gap-2 mb-6">
                            <Network className="text-[#FFD700] w-5 h-5" />
                            <h2 className="text-sm text-white font-bold uppercase tracking-widest">Feature Weights matrix</h2>
                        </div>
                        
                        <div className="bg-[#0a0a15] rounded-lg border border-[#1a2332] p-4 grid-overlay relative overflow-hidden">
                            <div className="space-y-4 relative z-10">
                                {[
                                    { name: "Pitcher xFIP (L30)", weight: 0.84, color: "#00D4FF" },
                                    { name: "Park Factor Adjs", weight: 0.62, color: "#FF00FF" },
                                    { name: "Bullpen Fatigue Index", weight: 0.76, color: "#FFD700" },
                                    { name: "Umpire Strike Zone Bias", weight: 0.41, color: "#00D4FF" },
                                    { name: "Weather (Wind/Temp)", weight: 0.58, color: "#FF00FF" }
                                ].map((feature, i) => (
                                    <div key={i}>
                                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-1">
                                            <span className="text-slate-300">{feature.name}</span>
                                            <span style={{ color: feature.color }}>{feature.weight.toFixed(2)} W</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
                                            <div 
                                                className="h-full" 
                                                style={{ 
                                                    width: `${feature.weight * 100}%`, 
                                                    backgroundColor: feature.color,
                                                    boxShadow: `0 0 8px ${feature.color}`
                                                }} 
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Data Sources */}
                    <div className="metal-frame col-span-1">
                        <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                        <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                        <div className="neon-strip right" />
                        
                        <div className="flex items-center gap-2 mb-6">
                            <Database className="text-[#00FF00] w-5 h-5" />
                            <h2 className="text-sm text-white font-bold uppercase tracking-widest">Data Streams</h2>
                        </div>
                        
                        <div className="space-y-4">
                            {[
                                { src: "Statcast Live", status: "SYNCED", ping: "12ms" },
                                { src: "Odds API", status: "SYNCED", ping: "45ms" },
                                { src: "Weather", status: "SYNCED", ping: "89ms" },
                                { src: "Umpire Data", status: "CACHED", ping: "N/A" }
                            ].map((stream, i) => (
                                <div key={i} className="flex justify-between items-center border-b border-[#1a2332] pb-2 last:border-0">
                                    <div className="text-xs text-slate-300 font-bold uppercase tracking-widest">{stream.src}</div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-[#00FF00] font-bold drop-shadow-[0_0_5px_rgba(0,255,0,0.5)]">{stream.status}</div>
                                        <div className="text-[10px] text-slate-500 font-mono">{stream.ping}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
            
            <BottomNavBar />
        </div>
    );
}
