import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Target } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

const mockProps = [
    { id: 1, player: "A. Judge", team: "NYY", prop: "Total Bases", line: "1.5", odds: "+140", ev: "+8.5%", type: "Over", color: "#FF00FF" },
    { id: 2, player: "G. Cole", team: "NYY", prop: "Strikeouts", line: "7.5", odds: "-110", ev: "+5.2%", type: "Over", color: "#00D4FF" },
    { id: 3, player: "R. Devers", team: "BOS", prop: "Hits", line: "1.5", odds: "+165", ev: "+12.1%", type: "Over", color: "#FF00FF" },
    { id: 4, player: "S. Ohtani", team: "LAD", prop: "Home Runs", line: "0.5", odds: "+220", ev: "+15.4%", type: "Over", color: "#FFD700" },
    { id: 5, player: "Z. Wheeler", team: "PHI", prop: "Earned Runs", line: "2.5", odds: "-130", ev: "+4.1%", type: "Under", color: "#00D4FF" },
    { id: 6, player: "M. Betts", team: "LAD", prop: "Stolen Bases", line: "0.5", odds: "+350", ev: "+10.2%", type: "Over", color: "#FFD700" },
];

export default function PropsPage() {
    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead 
                title="Player Props | MLB Analytics" 
                description="MLB Player Prop projections and value bets." 
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            <div className="p-4 w-full max-w-5xl mx-auto box-border pt-8">
                <div className="flex items-center gap-3 mb-8">
                    <Target className="w-8 h-8 text-[#FF00FF] drop-shadow-[0_0_10px_rgba(255,0,255,0.5)]" />
                    <h1 className="text-2xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                        Player <span className="text-[#FF00FF]">Props</span>
                    </h1>
                </div>

                <style dangerouslySetInnerHTML={{__html: `
                    .metal-frame {
                        position: relative;
                        background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                        border: 2px solid #3d4f5f;
                        border-radius: 12px;
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5);
                        padding: 16px;
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
                    .frame-bolt::after {
                        content: '+';
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        font-size: 6px;
                        color: #1a2a3a;
                    }
                    .neon-strip {
                        position: absolute;
                        width: 4px;
                        top: 20%;
                        bottom: 20%;
                        border-radius: 2px;
                    }
                    .neon-strip.left { left: 4px; }
                `}} />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {mockProps.map(prop => (
                        <div key={prop.id} className="metal-frame transition-transform hover:scale-[1.02] cursor-pointer">
                            <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                            <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                            <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                            <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                            
                            <div className="neon-strip left" style={{ background: prop.color, boxShadow: `0 0 10px ${prop.color}, 0 0 20px ${prop.color}80` }} />
                            
                            <div className="pl-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">{prop.team}</div>
                                        <div className="text-xl font-extrabold text-white">{prop.player}</div>
                                    </div>
                                    <div className="bg-[#0a0a15] border border-[#3d4f5f] px-2 py-1 rounded text-sm font-bold text-[#00FF00]">
                                        {prop.ev}
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-end mt-4">
                                    <div>
                                        <div className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-1">{prop.prop}</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-2xl font-bold" style={{ color: prop.color }}>{prop.type} {prop.line}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-slate-500 font-bold tracking-widest uppercase mb-1">Odds</div>
                                        <div className="text-lg font-bold text-white">{prop.odds}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
            
            <BottomNavBar />
        </div>
    );
}
