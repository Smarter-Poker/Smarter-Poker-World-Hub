/**
 * TRIVIA GAME PAGE - Individual mode gameplay
 * Route: /hub/trivia/[mode]
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaGame from '../../../src/components/trivia/TriviaGame';
import TriviaResult from '../../../src/components/trivia/TriviaResult';
import LeaderboardDisplay from '../../../src/components/trivia/LeaderboardDisplay';
import { TRIVIA_MODES, calculateDiamonds } from '../../../src/lib/trivia/triviaEngine';

// Phase 1 Enhancement Imports
import PrizeWheel from '../../../src/components/trivia/PrizeWheel';
import StreakBadge from '../../../src/components/trivia/StreakBadge';
import { useCelebrations } from '../../../src/components/trivia/CelebrationEffects';
import { getStreakTier, calculateRewardWithMultiplier } from '../../../src/config/triviaStreakSystem';

// Phase 2 Enhancement Imports
import DoubleOrNothing from '../../../src/components/trivia/DoubleOrNothing';
import { Gem } from 'lucide-react';

/** Shuffle answer options so correct answer isn't always A */
function shuffleOptions(questions) {
    return questions.map(q => {
        const opts = [...q.options];
        const correctText = opts[q.correct_index];
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return { ...q, options: opts, correct_index: opts.indexOf(correctText) };
    });
}

const CATEGORY_MAP = {
    daily: null,
    history: ['poker_history', 'famous_hands', 'player_profiles'],
    rules: ['rule_knowledge'],
    pro: ['gto_theory', 'tournament_facts'],
    arcade: null,
    mtt: ['mtt_situations'],
    cash: ['cash_game_situations'],
    icm: ['icm_chip_ev'],
    gto: ['gto_theory', 'gto_scenarios', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev']
    // survival mode has separate page
};

// Lobby image mapping — modes with full-bleed lobby images
const LOBBY_IMAGES = {
    history: '/images/trivia/lobby-history.jpg',
    rules: '/images/trivia/lobby-rules.jpg',
    pro: '/images/trivia/lobby-pro.jpg',
    daily: '/images/trivia/lobby-daily.jpg',
    arcade: '/images/trivia/lobby-arcade.jpg',
    mtt: '/images/trivia/lobby-mtt.jpg',
    cash: '/images/trivia/lobby-cash.jpg',
    icm: '/images/trivia/lobby-icm.jpg',
    gto: '/images/trivia/lobby-gto.jpg',
};

export default function TriviaModePage() {
    const router = useRouter();
    if (!router.isReady) return null;
    const { mode } = router.query;
    const { user: avatarUser } = useAvatar();

    const [gameState, setGameState] = useState('loading'); // loading, ready, playing, results
    const [questions, setQuestions] = useState([]);
    const [result, setResult] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [userStreak, setUserStreak] = useState(0);
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [error, setError] = useState(null);
    const [isVIP, setIsVIP] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    // Daily trivia enhancements
    const [dailyDiamondsClaimed, setDailyDiamondsClaimed] = useState(false);
    const [dailyLeaderboard, setDailyLeaderboard] = useState([]);

    // Phase 1: Prize wheel and celebration states
    const [showPrizeWheel, setShowPrizeWheel] = useState(false);
    const [isPerfectScore, setIsPerfectScore] = useState(false);
    const celebrations = useCelebrations();

    // Phase 2: Double or Nothing state
    const [showDoubleOrNothing, setShowDoubleOrNothing] = useState(false);
    const [doubleQuestion, setDoubleQuestion] = useState(null);

    // Using existing supabase instance from lib
    const modeConfig = mode ? TRIVIA_MODES[mode] : null;

    // Load questions and user data
    useEffect(() => {
        if (!mode || !modeConfig) return;

        async function initialize() {
            setGameState('loading');
            setError(null);

            try {
                // Wait for reactive auth 
                if (!avatarUser?.id) return;

                const currentUserId = avatarUser.id;
                setUserId(currentUserId);

                // Check VIP status
                await DiamondEngine.init(currentUserId);
                const vipStatus = await DiamondEngine.isVIP();
                setIsVIP(vipStatus);

                // Get diamonds
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', currentUserId)
                    .single();

                if (profile) {
                    setUserDiamonds(profile.diamonds || 0);
                }

                // Get streak
                const { data: streakData } = await supabase
                    .from('trivia_streaks')
                    .select('current_streak')
                    .eq('user_id', currentUserId)
                    .single();

                if (streakData) {
                    setUserStreak(streakData.current_streak || 0);
                }

                // Check arcade diamonds
                if (mode === 'arcade') {
                    const diamonds = userDiamonds || (await getUserDiamonds(user?.id));
                    if (diamonds < 10) {
                        setError('Not enough diamonds. You need 10 diamonds to play Diamond Arcade.');
                        setGameState('error');
                        return;
                    }
                }

                // Check if daily diamonds already claimed today
                if (mode === 'daily' && user) {
                    const today = getTodayCST();
                    const { data: existingPlay } = await supabase
                        .from('daily_trivia_plays')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('played_date', today)
                        .limit(1);
                    if (existingPlay && existingPlay.length > 0) {
                        setDailyDiamondsClaimed(true);
                    }
                    // Load daily leaderboard
                    await loadDailyLeaderboard();
                }

                // Load questions
                const loadedQuestions = await loadQuestions(mode, modeConfig.questionsCount);
                if (loadedQuestions.length === 0) {
                    setError('No questions available. Please try again later.');
                    setGameState('error');
                    return;
                }

                setQuestions(shuffleOptions(loadedQuestions));

                // Load leaderboard for arcade
                if (mode === 'arcade') {
                    await loadLeaderboard();
                }

                setGameState('ready');
            } catch (err) {
                console.error('Error initializing trivia:', err);
                setError('Failed to load trivia. Please try again.');
                setGameState('error');
            }
        }

        initialize();
    }, [mode, modeConfig, avatarUser?.id]);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-mode:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_trivia_plays', filter: `user_id=eq.${userId}` }, () => { })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    async function getUserDiamonds(userId) {
        if (!userId) return 0;
        const { data } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .single();
        return data?.diamonds || 0;
    }

    async function loadQuestions(mode, count) {
        const today = getTodayCST();

        // Determine which categories this mode uses
        const categories = CATEGORY_MAP[mode];

        // ═══════════════════════════════════════════════════════════════
        // STEP 0: Fetch user's 60-day question history to prevent repeats
        // ═══════════════════════════════════════════════════════════════
        let excludedSet = new Set();
        if (userId) {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const { data: history } = await supabase
                .from('trivia_user_question_history')
                .select('question_id')
                .eq('user_id', userId)
                .gte('created_at', sixtyDaysAgo.toISOString());

            if (history) {
                history.forEach(h => excludedSet.add(h.question_id));
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Try to load today's daily-tagged questions
        // All users get the same 20 questions per category per day
        // ═══════════════════════════════════════════════════════════════
        let dailyQuery = supabase
            .from('trivia_questions')
            .select('*')
            .eq('daily_date', today);

        // Filter by categories if mode is category-specific
        if (categories && categories.length > 0) {
            dailyQuery = dailyQuery.in('category', categories);
        }

        const { data: dailyQuestions } = await dailyQuery;

        if (dailyQuestions) {
            // Filter out questions the user has seen in the last 60 days
            const filteredDaily = dailyQuestions.filter(q => !excludedSet.has(q.id));
            if (filteredDaily.length >= count) {
                // Shuffle daily questions so order isn't predictable by category
                return shuffleArray(filteredDaily).slice(0, count);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Fallback — seeded shuffle from full pool
        // Used when daily questions haven't been rotated yet
        // ═══════════════════════════════════════════════════════════════

        let poolQuery = supabase.from('trivia_questions').select('*').limit(1500); // larger pool to allow filtering
        if (categories && categories.length > 0) {
            poolQuery = poolQuery.in('category', categories);
        }

        const { data: poolQuestions } = await poolQuery;

        if (!poolQuestions || poolQuestions.length === 0) {
            return getFallbackQuestions(count);
        }

        // Filter out questions seen in the last 60 days
        let filteredPool = poolQuestions.filter(q => !excludedSet.has(q.id));

        // If they have played so much they exhausted the pool, fallback to including seen questions
        if (filteredPool.length < count && poolQuestions.length >= count) {
            filteredPool = poolQuestions;
        }

        // Use date-seeded shuffle for daily-consistent question selection
        return seededShuffle(filteredPool, today).slice(0, count);
    }

    // Simple Fisher-Yates shuffle
    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Date-seeded shuffle for consistent daily questions
    function seededShuffle(array, dateString) {
        const arr = [...array];
        // Create a simple hash from the date string
        let seed = 0;
        for (let i = 0; i < dateString.length; i++) {
            seed = ((seed << 5) - seed) + dateString.charCodeAt(i);
            seed = seed & seed; // Convert to 32-bit integer
        }

        // Seeded random function
        const seededRandom = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };

        // Fisher-Yates shuffle with seeded random
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    async function loadLeaderboard() {
        const today = getTodayCST();
        const { data } = await supabase
            .from('trivia_scores')
            .select('*')
            .eq('play_date', today)
            .eq('mode', 'arcade')
            .order('score', { ascending: false })
            .limit(10);

        setLeaderboard(data || []);
    }

    async function loadDailyLeaderboard() {
        try {
            // Get top streakers (users with best daily trivia streaks)
            const { data: streakData } = await supabase
                .from('trivia_streaks')
                .select('user_id, current_streak, best_streak, profiles(username)')
                .order('current_streak', { ascending: false })
                .limit(10);

            if (streakData && streakData.length > 0) {
                // Also get accuracy stats from daily trivia scores
                const userIds = streakData.map(s => s.user_id);
                const { data: scoreData } = await supabase
                    .from('trivia_scores')
                    .select('user_id, correct_count, total_questions')
                    .eq('mode', 'daily')
                    .in('user_id', userIds);

                // Aggregate accuracy per user
                const accuracyMap = {};
                const gamesMap = {};
                (scoreData || []).forEach(s => {
                    if (!accuracyMap[s.user_id]) {
                        accuracyMap[s.user_id] = { correct: 0, total: 0 };
                        gamesMap[s.user_id] = 0;
                    }
                    accuracyMap[s.user_id].correct += s.correct_count || 0;
                    accuracyMap[s.user_id].total += s.total_questions || 0;
                    gamesMap[s.user_id]++;
                });

                const lb = streakData.map(s => ({
                    userId: s.user_id,
                    username: s.profiles?.username || 'Player',
                    streak: s.current_streak || 0,
                    bestStreak: s.best_streak || 0,
                    accuracy: accuracyMap[s.user_id]
                        ? Math.round((accuracyMap[s.user_id].correct / accuracyMap[s.user_id].total) * 100)
                        : 0,
                    gamesPlayed: gamesMap[s.user_id] || 0
                }));

                setDailyLeaderboard(lb);
            }
        } catch (err) {
            console.error('[Daily Trivia] Error loading leaderboard:', err);
        }
    }

    function getFallbackQuestions(count) {
        const fallbacks = [
            {
                id: 'fb1',
                category: 'poker_history',
                difficulty: 'medium',
                question: 'In what year was the first World Series of Poker Main Event held?',
                options: ['1968', '1970', '1972', '1975'],
                correct_index: 1,
                explanation: 'The first WSOP was held in 1970 at Binion\'s Horseshoe Casino in Las Vegas.'
            },
            {
                id: 'fb2',
                category: 'player_profiles',
                difficulty: 'easy',
                question: 'Which player holds the record for most WSOP bracelets?',
                options: ['Phil Ivey', 'Doyle Brunson', 'Phil Hellmuth', 'Johnny Chan'],
                correct_index: 2,
                explanation: 'Phil Hellmuth holds the record with 17 WSOP bracelets.'
            },
            {
                id: 'fb3',
                category: 'rule_knowledge',
                difficulty: 'easy',
                question: 'In Texas Hold\'em, how many community cards are dealt in total?',
                options: ['3', '4', '5', '7'],
                correct_index: 2,
                explanation: 'Five community cards are dealt: 3 on the flop, 1 on the turn, and 1 on the river.'
            },
            {
                id: 'fb4',
                category: 'gto_theory',
                difficulty: 'hard',
                question: 'What does MDF stand for in GTO poker strategy?',
                options: ['Maximum Defense Frequency', 'Minimum Defense Frequency', 'Mean Defensive Fold', 'Marginal Defense Factor'],
                correct_index: 1,
                explanation: 'MDF (Minimum Defense Frequency) tells you how often to call to prevent opponent from profitably bluffing.'
            },
            {
                id: 'fb5',
                category: 'famous_hands',
                difficulty: 'medium',
                question: 'What is the "Dead Man\'s Hand" in poker?',
                options: ['Pocket Kings', 'Aces and Eights (black)', 'Queen-Seven offsuit', 'Two-Seven offsuit'],
                correct_index: 1,
                explanation: 'The Dead Man\'s Hand is two pair of black aces and black eights.'
            }
        ];

        return shuffleArray(fallbacks).slice(0, count);
    }

    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getTodayCST() {
        const now = new Date();
        const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        return `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;
    }

    const startGame = async () => {
        // Check mode config for diamond cost — only modes with diamondCost > 0 charge
        const modeConfig = TRIVIA_MODES[mode];
        const modeCost = modeConfig?.diamondCost || 0;
        const isFreeMode = modeCost === 0;

        // Per-game diamond deduction for paid modes (e.g., arcade=10💎)
        if (!isFreeMode && userId && !isVIP) {
            const de = new DiamondEngine(supabase, userId);
            const result = await de.deduct(modeCost, `trivia_${mode}`);
            if (!result.success) {
                setShowOutOfDiamonds(true);
                return;
            }
            setUserDiamonds(prev => prev - modeCost);
        }

        setGameState('playing');
    };

    const handleComplete = async (gameResult) => {
        const {
            correctCount, totalQuestions, timeSpent, timeRemaining, answers,
            stakePot = 0, cashedOut = false,
            opponentScore = null, opponentName = null,
            streak: gameStreak = 0,
        } = gameResult;

        // Calculate rewards with streak multiplier
        // In stakes mode (arcade), the stakePot IS the reward — don't double-count
        const isStakesMode = mode === 'arcade' && stakePot > 0;
        const baseDiamonds = isStakesMode ? 0 : calculateDiamonds(mode, correctCount, totalQuestions, timeRemaining);
        const streakTier = getStreakTier(userStreak);
        const diamondsEarned = isStakesMode ? stakePot : calculateRewardWithMultiplier(baseDiamonds, userStreak);

        // Check for perfect score (100% correct)
        const isPerfect = correctCount === totalQuestions && totalQuestions > 0;
        setIsPerfectScore(isPerfect);

        // Trigger celebration effects
        if (isPerfect) {
            celebrations.triggerPerfect();
        } else if (correctCount > 0) {
            celebrations.triggerConfetti();
        }

        // Update streak for daily mode
        let newStreak = userStreak;
        if (mode === 'daily' && correctCount > 0) {
            newStreak = userStreak + 1;
        } else if (mode === 'daily' && correctCount === 0) {
            newStreak = 0;
        }

        // Daily trivia: award 10 diamonds for finishing all 20 questions (once per day)
        let dailyBonusDiamonds = 0;
        if (mode === 'daily' && !dailyDiamondsClaimed && totalQuestions >= 20) {
            dailyBonusDiamonds = 10;
            setDailyDiamondsClaimed(true);
        }

        // Save results to database
        if (userId) {
            try {
                const today = getTodayCST();

                // Save score
                await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    mode,
                    score: correctCount * 100 + (timeRemaining || 0) * 2,
                    correct_count: correctCount,
                    total_questions: totalQuestions,
                    time_spent: timeSpent,
                    diamonds_earned: diamondsEarned,
                    play_date: today
                });

                // Update profile with diamonds (base + daily bonus)
                const totalDiamondsToAward = diamondsEarned + dailyBonusDiamonds;
                if (totalDiamondsToAward > 0) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', userId)
                        .single();

                    if (profile) {
                        await supabase
                            .from('profiles')
                            .update({
                                diamonds: (profile.diamonds || 0) + totalDiamondsToAward
                            })
                            .eq('id', userId);
                    }
                }

                // Record question history (60-day non-repeat tracking)
                if (questions && questions.length > 0) {
                    const historyRecords = questions.map((q, idx) => ({
                        user_id: userId,
                        question_id: q.id,
                        was_correct: answers ? answers[idx] === q.correct_index : null,
                        mode
                    }));

                    // Use upsert to handle potential duplicates
                    await supabase.from('trivia_user_question_history')
                        .upsert(historyRecords, {
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: false
                        });
                }

                // Update category mastery
                const categoryStats = {};
                questions.forEach((q, idx) => {
                    const cat = q.category || 'general';
                    if (!categoryStats[cat]) {
                        categoryStats[cat] = { answered: 0, correct: 0 };
                    }
                    categoryStats[cat].answered++;
                    if (answers && answers[idx] === q.correct_index) {
                        categoryStats[cat].correct++;
                    }
                });

                for (const [category, stats] of Object.entries(categoryStats)) {
                    // Get current mastery or create new
                    const { data: existing } = await supabase
                        .from('trivia_category_mastery')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('category', category)
                        .single();

                    if (existing) {
                        const newTotal = existing.total_answered + stats.answered;
                        const newCorrect = existing.correct_count + stats.correct;
                        const accuracy = newTotal > 0 ? newCorrect / newTotal : 0;
                        // Level up every 20% accuracy milestone (20=L2, 40=L3, etc.)
                        const newLevel = Math.min(10, Math.max(1, Math.floor(accuracy * 10) + 1));

                        await supabase.from('trivia_category_mastery')
                            .update({
                                total_answered: newTotal,
                                correct_count: newCorrect,
                                mastery_level: newLevel,
                                updated_at: new Date().toISOString()
                            })
                            .eq('user_id', userId)
                            .eq('category', category);
                    } else {
                        await supabase.from('trivia_category_mastery').insert({
                            user_id: userId,
                            category,
                            total_answered: stats.answered,
                            correct_count: stats.correct,
                            mastery_level: 1
                        });
                    }
                }

                // Record daily play
                if (mode === 'daily') {
                    await supabase.from('daily_trivia_plays').insert({
                        user_id: userId,
                        played_date: today,
                        was_correct: correctCount > 0,
                        streak_at_time: newStreak
                    });

                    // Update streak
                    await supabase.from('trivia_streaks').upsert({
                        user_id: userId,
                        current_streak: newStreak,
                        best_streak: Math.max(newStreak, userStreak),
                        last_play_date: today
                    });
                }
            } catch (err) {
                console.error('Error saving results:', err);
            }
        }

        setResult({
            mode,
            correctCount,
            isPerfect,
            streakMultiplier: streakTier.multiplier,
            totalQuestions,
            timeSpent,
            timeRemaining: timeRemaining || 0,
            diamondsEarned,
            dailyBonusDiamonds,
            streak: newStreak,
            // New addictive game mechanics data
            stakePot: isStakesMode ? stakePot : 0,
            cashedOut,
            opponentScore,
            opponentName,
        });

        setGameState('results');

        // Reload daily leaderboard after completion
        if (mode === 'daily') {
            await loadDailyLeaderboard();
        }

        // Reload leaderboard for arcade
        if (mode === 'arcade') {
            await loadLeaderboard();
        }
    };

    const handlePlayAgain = () => {
        if (mode === 'arcade' && userDiamonds < 10) {
            router.push('/hub/trivia');
            return;
        }
        setResult(null);
        setGameState('ready');
    };

    if (!mode || !modeConfig) {
        return null;
    }

    return (
        <PageTransition>
            <SEOHead
                title="Poker Trivia Game"
                description="Play Poker Trivia On Smarter.Poker. Test Your Knowledge Across Multiple Game Modes."
                canonical="/hub/trivia"
                noindex={true}
            />

            <div className="trivia-mode-page">
                <div className="bg-overlay" />

                <UniversalHeader pageDepth={2} />
                {modeConfig && modeConfig.diamondCost > 0 && (
                    <GameCostPopup userId={userId} featureKey={`trivia_${mode}`} isVip={isVIP} cost={modeConfig.diamondCost} />
                )}

                {/* Out of Diamonds Modal */}
                {showOutOfDiamonds && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#1a1a2e', borderRadius: 16, padding: 32, maxWidth: 340, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>💎</div>
                            <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Out Of Diamonds</h3>
                            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px', fontSize: 14 }}>You Need 10💎 To Play This Mode. Visit The Diamond Store To Get More!</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Close</button>
                                <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #7B2FFF)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Get Diamonds</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="content" style={{ padding: '80px 0 40px' }}>
                    {gameState === 'loading' && (
                        <div className="loading">
                            <div className="spinner" />
                            <p>Loading Trivia...</p>
                        </div>
                    )}

                    {gameState === 'error' && (
                        <div className="error-state">
                            <p>{error}</p>
                            <button onClick={() => router.push('/hub/trivia')}>
                                Back to Trivia
                            </button>
                        </div>
                    )}

                    {gameState === 'ready' && (
                        LOBBY_IMAGES[mode] ? (
                            /* Full-bleed image lobby */
                            <div className="lobby-image-wrapper" onClick={startGame} style={{ borderRadius: 0 }}>
                                <img
                                    src={LOBBY_IMAGES[mode]}
                                    alt={`${modeConfig.name} - Start Challenge`}
                                    className="lobby-image"
                                    style={{ borderRadius: 0, width: '100%' }}
                                    loading="lazy" />
                            </div>
                        ) : (
                            /* Fallback text lobby */
                            <div className="ready-screen">
                                <div className="mode-info">
                                    <h1>{modeConfig.name}</h1>
                                    <p>{modeConfig.description}</p>

                                    <div className="mode-details">
                                        <div className="detail">
                                            <span className="label">Questions</span>
                                            <span className="value">{modeConfig.questionsCount}</span>
                                        </div>
                                        {modeConfig.timeLimit && (
                                            <div className="detail">
                                                <span className="label">Time Limit</span>
                                                <span className="value">{modeConfig.timeLimit}s</span>
                                            </div>
                                        )}
                                        {modeConfig.diamondCost > 0 && (
                                            <div className="detail">
                                                <span className="label">Entry Cost</span>
                                                <span className="value">{modeConfig.diamondCost} Diamonds</span>
                                            </div>
                                        )}
                                    </div>

                                    <button className="start-btn" onClick={startGame}>
                                        {mode === 'arcade' ? `Play (${modeConfig.diamondCost} Diamonds)` : 'Start Quiz'}
                                    </button>
                                </div>

                                {mode === 'arcade' && leaderboard.length > 0 && (
                                    <div className="leaderboard-section">
                                        <LeaderboardDisplay entries={leaderboard} currentUserId={userId} />
                                    </div>
                                )}
                            </div>
                        )
                    )}

                    {gameState === 'playing' && mode !== 'survival' && (
                        <TriviaGame
                            questions={questions}
                            mode={mode}
                            timeLimit={modeConfig.timeLimit}
                            onComplete={handleComplete}
                            userDiamonds={userDiamonds}
                            enableHints={mode !== 'arcade'}
                            enableStakes={mode === 'arcade'}
                            enableGhostOpponent={true}
                            onDiamondsChange={async (delta) => {
                                if (!userId) return;
                                const { data: profile } = await supabase
                                    .from('profiles')
                                    .select('diamonds')
                                    .eq('id', userId)
                                    .single();
                                if (profile) {
                                    await supabase
                                        .from('profiles')
                                        .update({ diamonds: Math.max(0, (profile.diamonds || 0) + delta) })
                                        .eq('id', userId);
                                    setUserDiamonds(Math.max(0, (profile.diamonds || 0) + delta));
                                }
                            }}
                        />
                    )}

                    {/* TODO: Survival mode moved to separate page at /hub/trivia/survival-game */}

                    {gameState === 'results' && result && (
                        <div className="results-section">
                            <TriviaResult
                                {...result}
                                onPlayAgain={handlePlayAgain}
                                onSpinWheel={() => setShowPrizeWheel(true)}
                                showSpinButton={isPerfectScore && !showPrizeWheel}
                                onDoubleOrNothing={result.diamondsEarned > 0 ? () => {
                                    // Prepare a random question for Double or Nothing
                                    const randomQ = questions[Math.floor(Math.random() * questions.length)];
                                    setDoubleQuestion(randomQ);
                                    setShowDoubleOrNothing(true);
                                } : null}
                                showDoubleButton={result.diamondsEarned > 0 && !showDoubleOrNothing}
                            />

                            {mode === 'arcade' && leaderboard.length > 0 && (
                                <div className="leaderboard-section">
                                    <LeaderboardDisplay entries={leaderboard} currentUserId={userId} />
                                </div>
                            )}

                            {/* Daily Trivia Bonus + Leaderboard */}
                            {mode === 'daily' && (
                                <div className="daily-results-section">
                                    {result.dailyBonusDiamonds > 0 && (
                                        <div className="daily-bonus-callout">
                                            <Gem size={20} />
                                            <span>+{result.dailyBonusDiamonds} Daily Completion Bonus!</span>
                                        </div>
                                    )}

                                    {dailyLeaderboard.length > 0 && (
                                        <div className="daily-leaderboard">
                                            <h3>Daily Trivia Leaderboard</h3>
                                            <div className="daily-lb-header">
                                                <span className="lb-col rank">#</span>
                                                <span className="lb-col name">Player</span>
                                                <span className="lb-col streak">Streak</span>
                                                <span className="lb-col accuracy">Acc%</span>
                                                <span className="lb-col games">Games</span>
                                            </div>
                                            {dailyLeaderboard.map((entry, idx) => (
                                                <div
                                                    key={entry.userId}
                                                    className={`daily-lb-row ${entry.userId === userId ? 'you' : ''}`}
                                                >
                                                    <span className="lb-col rank">{idx + 1}</span>
                                                    <span className="lb-col name">{entry.username}</span>
                                                    <span className="lb-col streak">{entry.streak}d</span>
                                                    <span className="lb-col accuracy">{entry.accuracy}%</span>
                                                    <span className="lb-col games">{entry.gamesPlayed}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Double or Nothing Modal */}
                    {showDoubleOrNothing && doubleQuestion && (
                        <DoubleOrNothing
                            question={doubleQuestion}
                            currentWinnings={result?.diamondsEarned || 0}
                            onComplete={async (won, finalAmount) => {
                                if (userId && won) {
                                    // Award the extra diamonds
                                    const bonus = finalAmount - (result?.diamondsEarned || 0);
                                    if (bonus > 0) {
                                        const { data: profile } = await supabase
                                            .from('profiles')
                                            .select('diamonds')
                                            .eq('id', userId)
                                            .single();
                                        if (profile) {
                                            await supabase
                                                .from('profiles')
                                                .update({ diamonds: (profile.diamonds || 0) + bonus })
                                                .eq('id', userId);
                                            setUserDiamonds(prev => prev + bonus);
                                        }
                                    }
                                } else if (userId && !won) {
                                    // Deduct the original winnings (they lost)
                                    const loss = result?.diamondsEarned || 0;
                                    if (loss > 0) {
                                        const { data: profile } = await supabase
                                            .from('profiles')
                                            .select('diamonds')
                                            .eq('id', userId)
                                            .single();
                                        if (profile) {
                                            await supabase
                                                .from('profiles')
                                                .update({ diamonds: Math.max(0, (profile.diamonds || 0) - loss) })
                                                .eq('id', userId);
                                            setUserDiamonds(prev => Math.max(0, prev - loss));
                                        }
                                    }
                                }
                                setShowDoubleOrNothing(false);
                            }}
                            onDecline={() => setShowDoubleOrNothing(false)}
                        />
                    )}

                    {/* Prize Wheel - only shows on 100% perfect score */}
                    {showPrizeWheel && (
                        <PrizeWheel
                            streakMultiplier={getStreakTier(userStreak).multiplier}
                            onComplete={async (reward) => {
                                // Award the prize
                                if (reward.type === 'diamonds' && userId) {
                                    await supabase
                                        .from('profiles')
                                        .update({ diamonds: userDiamonds + reward.amount })
                                        .eq('id', userId);
                                    setUserDiamonds(prev => prev + reward.amount);
                                }
                                setShowPrizeWheel(false);
                            }}
                            onClose={() => setShowPrizeWheel(false)}
                        />
                    )}

                    {/* Celebration Effects */}
                    <celebrations.CelebrationComponents />
                </div>
            </div>

            <style jsx>{`
                .trivia-mode-page {
                    min-height: 100vh;
                    background: #0a0e1a;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    width: 100%;
                    max-width: 100%;
                    margin: 0 auto;
                }

                
                
                
                
                

                .bg-overlay {
                    display: none;
                }

                .content {
                    position: relative;
                    padding: 80px 0 40px;
                }

                .loading,
                .error-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.6);
                    text-align: center;
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #0ea5e9;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .error-state button {
                    margin-top: 20px;
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #ffffff;
                    cursor: pointer;
                }

                .ready-screen {
                    max-width: 100%;
                    margin: 0 auto;
                }

                .lobby-image-wrapper {
                    position: relative;
                    cursor: pointer;
                    overflow: hidden;
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    max-width: 100%;
                    margin: 0 auto;
                }

                .lobby-image-wrapper:hover {
                    transform: scale(1.02);
                    box-shadow: 0 0 40px rgba(14, 165, 233, 0.3);
                }

                .lobby-image-wrapper:active {
                    transform: scale(0.98);
                }

                .lobby-image {
                    width: 100%;
                    height: auto;
                    display: block;
                }

                .mode-info {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 40px;
                    text-align: center;
                    margin-bottom: 24px;
                }

                .mode-info h1 {
                    font-size: 32px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 12px 0;
                }

                .mode-info p {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0 0 32px 0;
                }

                .mode-details {
                    display: flex;
                    justify-content: center;
                    gap: 32px;
                    margin-bottom: 32px;
                }

                .detail {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .detail .label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 4px;
                }

                .detail .value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                }

                .start-btn {
                    padding: 16px 48px;
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    border: none;
                    border-radius: 10px;
                    color: #ffffff;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .start-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(14, 165, 233, 0.4);
                }

                .leaderboard-section {
                    margin-top: 24px;
                }

                .results-section {
                    max-width: 600px;
                    margin: 0 auto;
                }

                /* Daily Trivia Leaderboard */
                .daily-results-section {
                    margin-top: 24px;
                }

                .daily-bonus-callout {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 14px 20px;
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.15));
                    border: 1px solid rgba(34, 197, 94, 0.4);
                    border-radius: 12px;
                    color: #22c55e;
                    font-size: 16px;
                    font-weight: 700;
                    margin-bottom: 20px;
                    animation: bonusPulse 2s ease-in-out;
                }

                .bonus-icon {
                    font-size: 24px;
                }

                @keyframes bonusPulse {
                    0% { transform: scale(0.95); opacity: 0; }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); opacity: 1; }
                }

                .daily-leaderboard {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 20px;
                }

                .daily-leaderboard h3 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin: 0 0 16px;
                }

                .daily-lb-header,
                .daily-lb-row {
                    display: flex;
                    align-items: center;
                    padding: 8px 0;
                }

                .daily-lb-header {
                    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.4);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .daily-lb-row {
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .daily-lb-row.you {
                    background: rgba(0, 212, 255, 0.1);
                    margin: 0 -12px;
                    padding: 8px 12px;
                    border-radius: 6px;
                    color: #00D4FF;
                    font-weight: 600;
                }

                .lb-col.rank { width: 30px; font-weight: 700; color: #FFD700; }
                .lb-col.name { flex: 1; }
                .lb-col.streak { width: 55px; text-align: center; color: #f97316; }
                .lb-col.accuracy { width: 50px; text-align: center; color: #22c55e; }
                .lb-col.games { width: 50px; text-align: center; color: rgba(255,255,255,0.5); }
            `}</style>
        </PageTransition>
    );
}
/* Cache bust: lobby-images-fullscreen-v2 */
