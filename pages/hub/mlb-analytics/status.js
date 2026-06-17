import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import Link from 'next/link';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();

        // Check snapshot health
        const { data: snaps, error: snapsErr } = await mlbDb
            .from('pipeline_snapshots')
            .select('status, created_at, task_name')
            .order('created_at', { ascending: false })
            .limit(10);

        if (snapsErr) throw snapsErr;

        // Extract latest info
        const latestIngest = (snaps || []).find(s => s.task_name === 'daily_ingest');
        const latestEnrich = (snaps || []).find(s => s.task_name === 'daily_enrich');
        const latestPredict = (snaps || []).find(s => s.task_name === 'daily_predict');

        return {
            props: {
                health: {
                    ingest: latestIngest || null,
                    enrich: latestEnrich || null,
                    predict: latestPredict || null,
                },
                error: null
            }
        };
    } catch (err) {
        return { props: { health: null, error: err.message } };
    }
}

function StatusCard({ title, snapshot, subtitle }) {
    const isOnline = snapshot && snapshot.status === 'ok';
    const isPartial = snapshot && snapshot.status === 'partial';
    
    let color = '#ff4444';
    let text = 'OFFLINE';
    if (isOnline) { color = '#00ff88'; text = 'ONLINE'; }
    else if (isPartial) { color = '#fbbf24'; text = 'PARTIAL'; }

    const timeAgo = snapshot ? new Date(snapshot.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : 'Never';

    return (
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>{title}</h3>
            <p style={{ color, margin: 0, fontWeight: 'bold' }}>{text}</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '5px 0 0 0' }}>
                {subtitle}<br/>
                Last run: {timeAgo}
            </p>
        </div>
    );
}

export default function MlbStatus({ health, error }) {
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

                {error && (
                    <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid red', padding: 15, borderRadius: 8, color: '#ff6b6b', marginBottom: 20 }}>
                        Database Connection Error: {error} (Check if Supabase instance is paused)
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    <StatusCard 
                        title="MLB + Odds Ingest" 
                        snapshot={health?.ingest} 
                        subtitle="Syncing Stats API & TheOddsAPI..." 
                    />
                    <StatusCard 
                        title="Feature Enrichment" 
                        snapshot={health?.enrich} 
                        subtitle="Building splits and streaks..." 
                    />
                    <StatusCard 
                        title="Market Predictor" 
                        snapshot={health?.predict} 
                        subtitle="Simulating slate..." 
                    />
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 40, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.4)', marginTop: 20 }}>
                    Feature drift monitoring and automated leak detection checks will be surfaced here.
                </div>
            </main>
            <BottomNavBar />
        </div>
    );
}
