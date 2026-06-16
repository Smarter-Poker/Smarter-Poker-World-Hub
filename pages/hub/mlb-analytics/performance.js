import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import Link from 'next/link';

export default function MlbPerformance() {
    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
            <SEOHead title="Model Performance | MLB Engine" />
            <UniversalHeader title="Performance" />
            
            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 20, fontFamily: 'Orbitron, sans-serif' }}>
                    &larr; Back to Slate
                </Link>

                <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 24, margin: '0 0 20px 0' }}>
                    Calibration & Validation
                </h1>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: 20 }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>Brier Score</h3>
                        <div style={{ fontSize: 32, fontWeight: 'bold' }}>--</div>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '5px 0 0 0' }}>vs Market Baseline: --</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>Avg CLV (Closing Line Value)</h3>
                        <div style={{ fontSize: 32, fontWeight: 'bold' }}>--</div>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '5px 0 0 0' }}>Over last 300 paper bets</p>
                    </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 40, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                    Calibration reliability curves and walk-forward time-series CV metrics will map here once multi-season training completes.
                </div>
            </main>
            <BottomNavBar />
        </div>
    );
}
