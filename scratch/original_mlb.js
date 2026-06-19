import { useState } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import Link from 'next/link';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();
        
        // Fetch today's slate from fact_games
        const todayStr = new Date().toISOString().split('T')[0];
        
        // Let's try to get upcoming games (or all games for now if we lack a strict date filter)
        // Note: For now, if fact_games is empty, we handle it gracefully.
        const { data: games, error } = await mlbDb
            .from('fact_games')
            .select('*')
            .order('game_date', { ascending: false })
            .limit(15);
            
        return {
            props: {
                games: games || [],
                error: error ? error.message : null
            }
        };
    } catch (err) {
        return { props: { games: [], error: err.message } };
    }
}

export default function MlbDashboard({ games, error }) {
    const [actionableOnly, setActionableOnly] = useState(false);

    // Mock filtering logic for now
    const displayGames = actionableOnly 
        ? games.filter(g => g.model_edge > 0.02) 
        : games;

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
            <SEOHead title="MLB Analytics Engine | Smarter Poker Hub" />
            <UniversalHeader title="MLB Engine" />
            
            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', paddingTop: 80 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#00d4ff', fontSize: 24, margin: 0 }}>
                        MLB Deterministic Engine
                    </h1>
                    
                    <button 
                        onClick={() => setActionableOnly(!actionableOnly)}
                        style={{
                            background: actionableOnly ? '#1877f2' : 'transparent',
                            border: '1px solid #1877f2',
                            color: '#fff',
                            padding: '8px 16px',
                            borderRadius: 20,
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                        }}
                    >
                        {actionableOnly ? 'Showing Actionable' : 'Show Actionable Only'}
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {/* Navigation Cards */}
                    <Link href="/hub/mlb-analytics/props" style={{ textDecoration: 'none' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>Prop Sheet</h3>
                            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>Explore player props with model edges</p>
                        </div>
                    </Link>
                    
                    <Link href="/hub/mlb-analytics/performance" style={{ textDecoration: 'none' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>Model Performance</h3>
                            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>Calibration, Brier, and CLV tracking</p>
                        </div>
                    </Link>

                    <Link href="/hub/mlb-analytics/tracker" style={{ textDecoration: 'none' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <h3 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontFamily: 'Orbitron, sans-serif' }}>Bet Tracker</h3>
                            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>Log bets and track Closing Line Value</p>
                        </div>
                    </Link>
                </div>

                <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 20, marginTop: 40, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 10 }}>
                    Today's Slate
                </h2>
                
                {error && (
                    <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid red', padding: 15, borderRadius: 8, color: '#ff6b6b', marginBottom: 20 }}>
                        Warning: {error}
                    </div>
                )}

                {displayGames.length === 0 ? (
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: 40, borderRadius: 12, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                        No games found in database. Is the ingestion pipeline running?
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px', marginTop: 20 }}>
                        {displayGames.map((game, idx) => (
                            <Link href={`/hub/mlb-analytics/game/${game.game_pk || game.id}`} key={idx} style={{ textDecoration: 'none' }}>
                                <div style={{ 
                                    background: 'rgba(255,255,255,0.05)', 
                                    borderRadius: 12, 
                                    padding: 20, 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    transition: 'transform 0.2s, background 0.2s',
                                    cursor: 'pointer'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <span style={{ fontWeight: 'bold', color: '#fff' }}>
                                            {game.away_team} @ {game.home_team}
                                        </span>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{game.game_date}</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Game PK: {game.game_pk}</span>
                                        <span style={{ color: game.model_edge > 0.02 ? '#00ff88' : 'rgba(255,255,255,0.5)' }}>
                                            Edge: {game.model_edge ? (game.model_edge * 100).toFixed(1) + '%' : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
            <BottomNavBar />
        </div>
    );
}
