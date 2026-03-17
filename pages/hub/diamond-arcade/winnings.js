/**
 * Diamond Arcade - My Winnings
 * Real transaction history from diamond_arena_events
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { Gem, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function DiamondArcadeWinnings() {
    const bus = useTrainingBus('diamond-arcade-winnings');
    const router = useRouter();
    const [history, setHistory] = useState([]);
    const [summary, setSummary] = useState({ totalWon: 0, totalSpent: 0, netProfit: 0 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadWinnings() {
            setIsLoading(true);
            const user = getAuthUser();
            if (!user) { setIsLoading(false); return; }

            try {
                // History list (last 50 for display)
                const { data, error } = await supabase
                    .from('diamond_arena_events')
                    .select('game_type, score, correct_count, total_questions, won, prize_awarded, created_at')
                    .eq('user_id', user.id)
                    .eq('event_type', 'game_complete')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error || !data) { setIsLoading(false); return; }
                setHistory(data);

                // Lifetime totals — all winnings (no limit)
                const { data: allWins } = await supabase
                    .from('diamond_arena_events')
                    .select('prize_awarded')
                    .eq('user_id', user.id)
                    .eq('event_type', 'game_complete');

                // Entry fees are only on game_start events
                const { data: startData } = await supabase
                    .from('diamond_arena_events')
                    .select('entry_fee')
                    .eq('user_id', user.id)
                    .eq('event_type', 'game_start');

                const totalWon = (allWins || []).reduce((s, e) => s + (e.prize_awarded || 0), 0);
                const totalSpent = (startData || []).reduce((s, e) => s + (e.entry_fee || 0), 0);
                setSummary({ totalWon, totalSpent, netProfit: totalWon - totalSpent });
            } catch (err) {
                console.error('Winnings error:', err);
            }
            setIsLoading(false);
        }

        loadWinnings();

        const user = getAuthUser();
        if (!user) return;
        const ch = supabase
            .channel(`arcade-winnings:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'diamond_arena_events', filter: `user_id=eq.${user.id}` }, () => { loadWinnings(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const GAME_NAMES = {
        'hand-snap': 'Hand Snap', 'board-nuts': 'Board Nuts', 'chip-math': 'Chip Math',
        'showdown': 'Showdown', 'ev-or-fold': 'EV or Fold', 'double-or-nothing': 'Double or Nothing',
        'the-gauntlet': 'The Gauntlet', 'mystery-box': 'Mystery Box',
    };

    return (
        <>
            <SEOHead
                title="Arcade Winnings — Your Earnings | Smarter.Poker"
                description="Track Your Diamond Arcade Winnings And Prize History."
                canonical="/hub/diamond-arcade/winnings"
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button onClick={() => router.push('/hub/diamond-arcade')} style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', color: '#00D4FF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowLeft size={16} /> Back to Arcade
                        </button>

                        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Gem size={28} color="#fbbf24" /> My Winnings
                        </h1>

                        {/* Summary Cards */}
                        {!isLoading && summary.totalWon + summary.totalSpent > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '30px' }}>
                                <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', marginBottom: '6px' }}>Total Won</div>
                                    <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <TrendingUp size={20} /> +{summary.totalWon.toLocaleString()}
                                    </div>
                                </div>
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', marginBottom: '6px' }}>Total Spent</div>
                                    <div style={{ color: '#ef4444', fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <TrendingDown size={20} /> -{summary.totalSpent.toLocaleString()}
                                    </div>
                                </div>
                                <div style={{ background: summary.netProfit >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${summary.netProfit >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', marginBottom: '6px' }}>Net P/L</div>
                                    <div style={{ color: summary.netProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: '24px', fontWeight: 'bold' }}>
                                        {summary.netProfit >= 0 ? '+' : ''}{summary.netProfit.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        )}

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>Loading history...</div>
                        ) : history.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <p style={{ color: '#65676b', fontSize: '18px' }}>No game history yet. Play some arcade games!</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {history.map((entry, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${entry.won ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                            borderRadius: '12px',
                                            padding: '16px 20px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <div>
                                            <div style={{ color: '#e4e6eb', fontWeight: '600', marginBottom: '4px' }}>
                                                {GAME_NAMES[entry.game_type] || entry.game_type}
                                            </div>
                                            <div style={{ color: '#65676b', fontSize: '13px' }}>
                                                {entry.correct_count}/{entry.total_questions} correct — {new Date(entry.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style={{
                                            color: entry.won ? '#22c55e' : '#ef4444',
                                            fontSize: '20px',
                                            fontWeight: 'bold',
                                        }}>
                                            {entry.won ? `+${(entry.prize_awarded || 0).toLocaleString()}` : `${entry.won === false ? 'Loss' : '0'}`}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
