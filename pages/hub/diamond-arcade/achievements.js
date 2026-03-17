/**
 * Diamond Arcade - Achievements
 * Real unlock logic from diamond_arena_events + profile data
 * Lucide icons — no emojis
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { Trophy, ArrowLeft, Target, Zap, Crown, Flame, Gem, Gamepad2, Star, Award, CheckCircle, Swords, Shield } from 'lucide-react';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const ACHIEVEMENTS = [
    { id: 'first_win', name: 'First Blood', description: 'Win Your First Arcade Game', Icon: Target, requirement: (s) => s.wins >= 1 },
    { id: 'ten_wins', name: 'Rising Star', description: 'Win 10 Arcade Games', Icon: Star, requirement: (s) => s.wins >= 10 },
    { id: 'fifty_wins', name: 'Arcade Champion', description: 'Win 50 Arcade Games', Icon: Trophy, requirement: (s) => s.wins >= 50 },
    { id: 'hundred_games', name: 'Grinder', description: 'Play 100 Arcade Games', Icon: Gamepad2, requirement: (s) => s.gamesPlayed >= 100 },
    { id: 'perfect_game', name: 'Flawless', description: 'Get Every Answer Correct In One Game', Icon: CheckCircle, requirement: (s) => s.hasPerfect },
    { id: 'diamond_100', name: 'Diamond Miner', description: 'Earn 100 Diamonds From Arcade', Icon: Gem, requirement: (s) => s.diamondsWon >= 100 },
    { id: 'diamond_1000', name: 'Diamond Baron', description: 'Earn 1,000 Diamonds From Arcade', Icon: Crown, requirement: (s) => s.diamondsWon >= 1000 },
    { id: 'all_games', name: 'Renaissance Player', description: 'Play All 8 Game Types', Icon: Award, requirement: (s) => s.uniqueGames >= 8 },
    { id: 'gauntlet_win', name: 'Gauntlet Survivor', description: 'Win The Gauntlet (10 In A Row)', Icon: Shield, requirement: (s) => s.gauntletWins >= 1 },
    { id: 'double_win', name: 'Double Down', description: 'Win Double Or Nothing 5 Times', Icon: Swords, requirement: (s) => s.doubleWins >= 5 },
    { id: 'speed_demon', name: 'Speed Demon', description: 'Score 15+ In Hand Snap', Icon: Zap, requirement: (s) => s.bestHandSnap >= 15 },
    { id: 'streak_5', name: 'Hot Streak', description: 'Win 5 Games In A Row', Icon: Flame, requirement: (s) => s.maxConsecutiveWins >= 5 },
];

export default function DiamondArcadeAchievements() {
    const bus = useTrainingBus('diamond-arcade-achievements');
    const router = useRouter();
    const [achievements, setAchievements] = useState([]);
    const [unlockedCount, setUnlockedCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadAchievements() {
            setIsLoading(true);
            const user = getAuthUser();

            if (!user) {
                setAchievements(ACHIEVEMENTS.map(a => ({ ...a, unlocked: false })));
                setIsLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('diamond_arena_events')
                    .select('game_type, score, correct_count, total_questions, won, prize_awarded, created_at')
                    .eq('user_id', user.id)
                    .eq('event_type', 'game_complete')
                    .order('created_at', { ascending: true });

                if (error || !data) {
                    setAchievements(ACHIEVEMENTS.map(a => ({ ...a, unlocked: false })));
                    setIsLoading(false);
                    return;
                }

                // Calculate stats for requirements
                const gamesPlayed = data.length;
                const wins = data.filter(e => e.won).length;
                const diamondsWon = data.reduce((s, e) => s + (e.prize_awarded || 0), 0);
                const hasPerfect = data.some(e => e.correct_count === e.total_questions && e.total_questions > 0);
                const uniqueGames = new Set(data.map(e => e.game_type)).size;
                const gauntletWins = data.filter(e => e.game_type === 'the-gauntlet' && e.won).length;
                const doubleWins = data.filter(e => e.game_type === 'double-or-nothing' && e.won).length;
                const bestHandSnap = Math.max(0, ...data.filter(e => e.game_type === 'hand-snap').map(e => e.score || 0));

                // Calculate max consecutive wins
                let maxConsecutiveWins = 0;
                let currentStreak = 0;
                data.forEach(e => {
                    if (e.won) { currentStreak++; maxConsecutiveWins = Math.max(maxConsecutiveWins, currentStreak); }
                    else { currentStreak = 0; }
                });

                const stats = { gamesPlayed, wins, diamondsWon, hasPerfect, uniqueGames, gauntletWins, doubleWins, bestHandSnap, maxConsecutiveWins };

                const processed = ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.requirement(stats) }));
                setAchievements(processed);
                setUnlockedCount(processed.filter(a => a.unlocked).length);
            } catch (err) {
                console.error('Achievements error:', err);
                setAchievements(ACHIEVEMENTS.map(a => ({ ...a, unlocked: false })));
            }
            setIsLoading(false);
        }

        loadAchievements();

        const user = getAuthUser();
        if (!user) return;
        const ch = supabase
            .channel(`arcade-ach:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'diamond_arena_events', filter: `user_id=eq.${user.id}` }, () => { loadAchievements(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    return (
        <>
            <SEOHead
                title="Arcade Achievements — Unlock Rewards | Smarter.Poker"
                description="Track Your Diamond Arcade Achievements And Unlocked Rewards."
                canonical="/hub/diamond-arcade/achievements"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button onClick={() => router.push('/hub/diamond-arcade')} style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', color: '#00D4FF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowLeft size={16} /> Back to Arcade
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#e4e6eb', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Trophy size={28} color="#fbbf24" /> Arcade Achievements
                            </h1>
                            {!isLoading && (
                                <div style={{ background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.3)', padding: '8px 16px', borderRadius: '8px', color: '#00D4FF', fontWeight: 'bold', fontSize: '14px' }}>
                                    {unlockedCount} / {ACHIEVEMENTS.length} Unlocked
                                </div>
                            )}
                        </div>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>Loading achievements...</div>
                        ) : (
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {achievements.map(ach => {
                                    const IconComponent = ach.Icon;
                                    return (
                                        <div
                                            key={ach.id}
                                            style={{
                                                background: ach.unlocked ? 'rgba(0, 212, 255, 0.08)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${ach.unlocked ? 'rgba(0, 212, 255, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                                                borderRadius: '12px',
                                                padding: '18px 20px',
                                                display: 'flex',
                                                gap: '16px',
                                                alignItems: 'center',
                                                opacity: ach.unlocked ? 1 : 0.5,
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            <div style={{
                                                width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: ach.unlocked ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.05)',
                                                borderRadius: '12px', flexShrink: 0,
                                            }}>
                                                <IconComponent size={24} color={ach.unlocked ? '#00D4FF' : '#65676b'} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>{ach.name}</div>
                                                <div style={{ color: '#65676b', fontSize: '13px' }}>{ach.description}</div>
                                            </div>
                                            {ach.unlocked && (
                                                <div style={{ color: '#22c55e', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                                                    <CheckCircle size={18} /> Unlocked
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
