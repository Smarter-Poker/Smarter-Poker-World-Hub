import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import Link from 'next/link';

export default function MlbBetTracker() {
    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
            <SEOHead title="Bet Tracker | MLB Engine" />
            <UniversalHeader title="Bet Tracker" />
            
            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 20, fontFamily: 'Orbitron, sans-serif' }}>
                    &larr; Back to Slate
                </Link>

                <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 24, margin: '0 0 20px 0' }}>
                    CLV Tracker Ledger
                </h1>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 40, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                    Paper trading ledger evaluating CLV vs raw ROI. Will populate during Phase 11 Lock-in gate.
                </div>
            </main>
            <BottomNavBar />
        </div>
    );
}
