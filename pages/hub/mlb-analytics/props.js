import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import Link from 'next/link';

export default function MlbPropsSheet() {
    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
            <SEOHead title="Player Props | MLB Engine" />
            <UniversalHeader title="Prop Sheet" />
            
            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 20, fontFamily: 'Orbitron, sans-serif' }}>
                    &larr; Back to Slate
                </Link>

                <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 24, margin: '0 0 20px 0' }}>
                    Player Props Tracker
                </h1>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 40, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                    Player props (Pitcher Ks, Batter Bases, HR, RBI) will populate here sorted by Model Edge vs Consensus lines.
                    <br/><br/>
                    <em>Engine is currently populating the historical database.</em>
                </div>
            </main>
            <BottomNavBar />
        </div>
    );
}
