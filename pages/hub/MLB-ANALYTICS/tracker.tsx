import Link from 'next/link';
import { ArrowLeft, Activity } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

export default function TrackerPage() {
    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead 
                title="Live Tracker | MLB Analytics" 
                description="Live Game Tracker and Probability updates." 
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            <div className="p-4 w-full max-w-2xl mx-auto box-border text-center pt-20">
                <Activity className="w-16 h-16 mx-auto text-[#FFD700] mb-6 drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]" />
                <h1 className="text-3xl font-extrabold text-white tracking-widest uppercase mb-4" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                    Live <span className="text-[#FFD700]">Tracker</span>
                </h1>
                <p className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-8 leading-relaxed">
                    Live game tracking and in-play probability updates are initializing.<br/>
                    Please check back once the data stream connects.
                </p>
                <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-2 bg-[#0d1117] border border-[#3d4f5f] hover:border-[#FFD700] text-[#FFD700] px-6 py-3 rounded-lg text-xs font-extrabold tracking-widest uppercase transition-all shadow-[0_4px_10px_rgba(0,0,0,0.5)] hover:shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                    <ArrowLeft size={16} /> Return to Dashboard
                </Link>
            </div>
            
            <BottomNavBar />
        </div>
    );
}
