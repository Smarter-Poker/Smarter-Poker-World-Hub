import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import Link from 'next/link';

export default function MlbStatus() {
    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
            <SEOHead title="System Status | MLB Engine" />
            <UniversalHeader title="Engine Status" />
            
            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 20, fontFamily: 'Orbitron, sans-serif' }}>
                    &larr; Back to Slate
                </Link>

                <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 24, margin: '0 0 20px 0' }}>
                    Pipeline Health & Freshness
                </h1>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>Statcast (Savant)</h3>
                        <p style={{ color: '#00ff88', margin: 0, fontWeight: 'bold' }}>ONLINE</p>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '5px 0 0 0' }}>Syncing historical chunks...</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>MLB Stats API</h3>
                        <p style={{ color: '#00ff88', margin: 0, fontWeight: 'bold' }}>ONLINE</p>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '5px 0 0 0' }}>Syncing historical chunks...</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>The Odds API</h3>
                        <p style={{ color: '#00ff88', margin: 0, fontWeight: 'bold' }}>ONLINE</p>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '5px 0 0 0' }}>Connected to API</p>
                    </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 40, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.4)', marginTop: 20 }}>
                    Feature drift monitoring and automated leak detection checks will be surfaced here.
                </div>
            </main>
            <BottomNavBar />
        </div>
    );
}
