import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Target } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

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
                <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-12 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_30px_rgba(0,0,0,0.5)] group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[60px] opacity-10"></div>
                    
                    <Target className="w-20 h-20 mx-auto text-[#FF00FF] mb-6 drop-shadow-[0_0_15px_rgba(255,0,255,0.5)] animate-pulse" />
                    <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-widest uppercase mb-4 relative z-10 text-center" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                        Player <span className="text-[#FF00FF]">Props</span>
                    </h1>
                    <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#FF00FF] to-transparent mx-auto mb-6 opacity-50"></div>
                    <p className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-10 leading-relaxed max-w-md mx-auto relative z-10 text-center">
                        The neural network is currently ingesting TheOddsAPI data streams to generate real-time player prop projections. <br/><br/>
                        <span className="text-[#FF00FF]">Prop modeling will be available soon.</span>
                    </p>
                    <div className="flex justify-center">
                        <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center justify-center gap-2 bg-[#0d1117] border border-[#3d4f5f] hover:border-[#FF00FF] text-[#FF00FF] px-6 py-3 rounded-lg text-xs font-extrabold tracking-widest uppercase transition-all shadow-[0_4px_10px_rgba(0,0,0,0.5)] hover:shadow-[0_0_15px_rgba(255,0,255,0.3)] relative z-10">
                            <ArrowLeft size={16} /> Return to Dashboard
                        </Link>
                    </div>
                </div>
            </div>
            
            <BottomNavBar />
        </div>
    );
}
