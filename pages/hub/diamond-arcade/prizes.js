/**
 * Diamond Arcade - Prize Pool
 * Dynamic display from ARCADE_GAMES config + live jackpot
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { Gem, ArrowLeft, Trophy, Zap, Target } from 'lucide-react';
import { ARCADE_GAMES } from '../../../src/lib/arcade/arcadeEngine';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function DiamondArcadePrizes() {
    const bus = useTrainingBus('diamond-arcade-prizes');
    const router = useRouter();
    const [jackpot, setJackpot] = useState(0);
    const [topWinners, setTopWinners] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadPrizeData() {
            setIsLoading(true);
            try {
                // Calculate jackpot: sum of all entry fees ("house rake")
                const { data: feeData } = await supabase
                    .from('diamond_arena_events')
                    .select('entry_fee')
                    .eq('event_type', 'game_start')
                    .not('entry_fee', 'is', null);

                if (feeData) {
                    const total = feeData.reduce((s, e) => s + (e.entry_fee || 0), 0);
                    setJackpot(Math.round(total * 0.10)); // 10% house rake goes to prize pool
                }

                // Today's top winners
                const today = new Date().toISOString().slice(0, 10);
                const { data: winners } = await supabase
                    .from('diamond_arena_events')
                    .select('user_id, prize_awarded, game_type')
                    .eq('event_type', 'game_complete')
                    .eq('won', true)
                    .gte('created_at', today)
                    .order('prize_awarded', { ascending: false })
                    .limit(5);

                if (winners && winners.length > 0) {
                    // Get display names
                    const userIds = [...new Set(winners.map(w => w.user_id))];
                    const { data: profiles } = await supabase.from('profiles').select('id, display_name, username').in('id', userIds);
                    const nameMap = {};
                    (profiles || []).forEach(p => { nameMap[p.id] = p.display_name || p.username || `Player ${p.id?.slice(0, 6)}`; });
                    setTopWinners(winners.map(w => ({ ...w, displayName: nameMap[w.user_id] || `Player ${w.user_id?.slice(0, 6)}` })));
                }
            } catch (err) {
                console.error('Prize data error:', err);
            }
            setIsLoading(false);
        }

        loadPrizeData();

        // Realtime — refresh jackpot and winners when new games complete
        const ch = supabase
            .channel('arcade-prizes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'diamond_arena_events' }, () => { loadPrizeData(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const GAME_NAMES = {
        'hand-snap': 'Hand Snap', 'board-nuts': 'Board Nuts', 'chip-math': 'Chip Math',
        'showdown': 'Showdown', 'ev-or-fold': 'EV or Fold', 'double-or-nothing': 'Double or Nothing',
        'the-gauntlet': 'The Gauntlet', 'mystery-box': 'Mystery Box',
    };

    const games = Object.values(ARCADE_GAMES);

    return (
        <>
            <SEOHead
                title="Arcade Prizes — Rewards & Payouts | Smarter.Poker"
                description="Browse Available Prizes, Payouts, And Max Rewards In The Diamond Arcade."
                canonical="/hub/diamond-arcade/prizes"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button onClick={() => router.push('/hub/diamond-arcade')} style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', color: '#00D4FF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowLeft size={16} /> Back to Arcade
                        </button>

                        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Trophy size={28} color="#fbbf24" /> Prize Pool
                        </h1>

                        {/* Jackpot Banner */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.08))',
                            border: '2px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '16px',
                            padding: '30px',
                            textAlign: 'center',
                            marginBottom: '30px',
                        }}>
                            <div style={{ color: '#9ca3af', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Community Prize Pool</div>
                            <div style={{ color: '#fbbf24', fontSize: '48px', fontWeight: '900', fontFamily: "'Orbitron', monospace", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                <Gem size={36} /> {isLoading ? '...' : jackpot.toLocaleString()}
                            </div>
                            <div style={{ color: '#65676b', fontSize: '13px', marginTop: '8px' }}>Funded by 10% house rake on all entry fees</div>
                        </div>

                        {/* Game Prize Table */}
                        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Target size={20} color="#00D4FF" /> Prize Per Game
                        </h2>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden', marginBottom: '30px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Game</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Entry Fee</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Max Prize</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Category</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {games.map(game => (
                                        <tr key={game.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '14px 16px', color: '#e4e6eb', fontWeight: '600' }}>
                                                <span style={{ marginRight: '8px' }}>{game.icon}</span>
                                                {game.name}
                                            </td>
                                            <td style={{ padding: '14px 16px', color: '#ef4444', textAlign: 'center', fontWeight: '600' }}>{game.entryFee}</td>
                                            <td style={{ padding: '14px 16px', color: '#22c55e', textAlign: 'center', fontWeight: 'bold' }}>{game.maxPrize}</td>
                                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase',
                                                    background: game.category === 'speed' ? 'rgba(59, 130, 246, 0.15)' : game.category === 'skill' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    color: game.category === 'speed' ? '#3b82f6' : game.category === 'skill' ? '#22c55e' : '#ef4444',
                                                }}>{game.category}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Today's Top Winners */}
                        {topWinners.length > 0 && (
                            <>
                                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Zap size={20} color="#fbbf24" /> Today's Top Winners
                                </h2>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {topWinners.map((w, idx) => (
                                        <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ color: '#e4e6eb', fontWeight: '500' }}>{w.displayName}</div>
                                                <div style={{ color: '#65676b', fontSize: '12px' }}>{GAME_NAMES[w.game_type] || w.game_type}</div>
                                            </div>
                                            <div style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '18px' }}>+{(w.prize_awarded || 0).toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
