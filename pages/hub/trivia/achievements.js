/**
 * Trivia - Achievements
 * Fetches user's trivia achievements from Supabase
 * Uses trivia_scores and trivia_streaks to determine unlocks
 * SmarterPoker Dark color schema — no emojis
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import {
    Target, BookOpen, Award, Trophy, Flame, Zap, Crown, CheckCircle, Gem, Star,
    Brain, GraduationCap, Library, BadgeCheck, Crosshair, Eye, Scroll, Scale,
    Wand2, Dumbbell, Shield, Sparkles, Gauge, Wind, Coins, TrendingUp, Waves,
    Moon, Sunrise, RefreshCw, Footprints
} from 'lucide-react';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { busEmit } from '../../../src/engine/EventBus';
import {
    TRIVIA_ACHIEVEMENTS,
    ACHIEVEMENT_CATEGORIES,
    RARITY_CONFIG,
    computeTriviaStats,
    isUnlocked,
    sumAchievementRewards
} from '../../../src/config/triviaAchievements';

// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION LAYER ONLY
// ═══════════════════════════════════════════════════════════════════════════
// The achievement DEFINITIONS live in src/config/triviaAchievements.js and are
// shared with [mode].js's post-game unlock check. This page used to carry its
// own inline 12-achievement list whose ids and thresholds disagreed with that
// config ('first_answer' vs 'first_question', a 5-day streak tier that does not
// exist, no rewards at all), so a player could be told they had unlocked
// something the game never granted — and vice versa. Everything below is
// rendering metadata for the shared list, never a second source of truth.

/** icon name (string, from the config) -> lucide component. */
const ICONS = {
    Target, BookOpen, Brain, Star, GraduationCap, Library,
    BadgeCheck, Crosshair, Eye, Scroll, Scale, Wand2,
    Flame, Dumbbell, Trophy, Shield, Crown, Sparkles,
    Zap, Gauge, Wind,
    Gem, Coins, TrendingUp, Waves,
    Moon, Sunrise, RefreshCw, Footprints,
    Award, CheckCircle
};
const iconFor = (name) => ICONS[name] || Award;

/**
 * Progress bars for the countable achievements: achievement id -> the stats
 * field it counts and the value it needs. Purely cosmetic — a missing entry
 * just means "no progress bar", never a different unlock rule. The unlock
 * itself is always decided by the config's own `requirement`.
 */
const PROGRESS = {
    first_question: ['totalQuestions', 1],
    ten_correct: ['correctAnswers', 10],
    fifty_correct: ['correctAnswers', 50],
    hundred_correct: ['correctAnswers', 100],
    five_hundred_correct: ['correctAnswers', 500],
    thousand_correct: ['correctAnswers', 1000],
    perfect_game: ['perfectGames', 1],
    five_perfects: ['perfectGames', 5],
    ten_perfects: ['perfectGames', 10],
    streak_3: ['bestStreak', 3],
    streak_7: ['bestStreak', 7],
    streak_14: ['bestStreak', 14],
    streak_30: ['bestStreak', 30],
    streak_100: ['bestStreak', 100],
    streak_365: ['bestStreak', 365],
    blitz_master: ['fastGamesWon', 10],
    arcade_debut: ['arcadeGames', 1],
    arcade_veteran: ['arcadeGames', 25],
    arcade_profit: ['arcadeDiamondsEarned', 500],
    arcade_whale: ['arcadeDiamondsEarned', 2000],
    comeback_kid: ['comebackWins', 1],
    marathon: ['maxGamesInDay', 10]
};

/** Mastery achievements count a categoryCorrect bucket rather than a top-level field. */
const CATEGORY_PROGRESS = {
    history_master: ['history', 50],
    rules_master: ['rules', 50],
    pro_master: ['pro', 50]
};

function progressFor(id, stats) {
    const direct = PROGRESS[id];
    if (direct) {
        const [field, target] = direct;
        const current = Number(stats?.[field]);
        if (Number.isFinite(current) && target > 0) return { current: Math.min(current, target), target };
        return { current: 0, target };
    }
    const cat = CATEGORY_PROGRESS[id];
    if (cat) {
        const [bucket, target] = cat;
        const current = Number(stats?.categoryCorrect?.[bucket]) || 0;
        return { current: Math.min(current, target), target };
    }
    return null;
}

// Locally-remembered unlocks, so a NEW unlock can be celebrated the first time
// the player sees it. Server-side persistence (earned_at, diamond rewards,
// profile badges) needs a trivia_achievements table + migration, which is
// outside this page's ownership — see the cross-file note in the report.
const SEEN_UNLOCKS_KEY = 'trivia_achievements_seen';

function readSeenUnlocks(uid) {
    if (typeof window === 'undefined' || !uid) return [];
    try {
        const raw = JSON.parse(localStorage.getItem(SEEN_UNLOCKS_KEY) || '{}') || {};
        return Array.isArray(raw[uid]) ? raw[uid] : [];
    } catch (e) {
        return [];
    }
}

function writeSeenUnlocks(uid, ids) {
    if (typeof window === 'undefined' || !uid) return;
    try {
        const raw = JSON.parse(localStorage.getItem(SEEN_UNLOCKS_KEY) || '{}') || {};
        raw[uid] = ids;
        localStorage.setItem(SEEN_UNLOCKS_KEY, JSON.stringify(raw));
    } catch (e) {
        console.warn('[Achievements] Could not persist seen unlocks:', e);
    }
}

/**
 * Page through the user's full trivia_scores history.
 * A bare .select() is silently capped by PostgREST's server max-rows setting
 * (typically 1000), which understated totals for heavy users and could hide an
 * achievement they had genuinely earned.
 */
async function fetchAllScores(supabase, uid) {
    const PAGE = 1000;
    const MAX_PAGES = 20;
    const all = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE;
        const { data, error } = await supabase
            // BUGFIX (2026-08-12): .from('trivia_scores') was missing entirely,
            // so this called supabase.select(...) on the client itself and threw
            // `TypeError: supabase.select is not a function` on the very first
            // page. The throw escaped to loadAchievements()'s catch, which is why
            // EVERY user saw "We could not load your achievements right now" and
            // a permanent 0/30 — the page has never once rendered an achievement.
            .from('trivia_scores')
            // computeTriviaStats needs time_spent / play_date / created_at too
            // (speed, marathon and the night-owl/early-bird achievements).
            .select('mode, score, correct_count, total_questions, diamonds_earned, time_spent, play_date, created_at')
            .eq('user_id', uid)
            .range(from, from + PAGE - 1);
        if (error) {
            console.warn('[Achievements] Score page fetch failed:', error.message);
            break;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
    }
    return all;
}

export default function TriviaAchievements() {
    useTrainingBus('trivia-achievements');
    const router = useRouter();
    // Reactive user from AvatarContext — required so the realtime channel
    // effect re-runs once auth resolves. Previously the empty-deps useEffect
    // captured a getAuthUser() return value at mount time; if auth wasn't
    // hydrated yet, the channel never registered.
    const { user: avatarUser, loading: avatarLoading } = useAvatar();
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [achievements, setAchievements] = useState([]);
    const [unlockedCount, setUnlockedCount] = useState(0);
    const [newlyUnlocked, setNewlyUnlocked] = useState([]);
    const [loadError, setLoadError] = useState(null);
    // Diamonds attached to the achievements the player has unlocked. The
    // rewards exist in the shared config but were invisible here.
    const [rewardTotal, setRewardTotal] = useState(0);

    useEffect(() => {
        if (avatarLoading) return;
        async function loadAchievements() {
            try {
                const user = avatarUser || getAuthUser();

                if (!user) {
                    // Show all achievements as locked for guests
                    setAchievements(TRIVIA_ACHIEVEMENTS.map(a => ({ ...a, unlocked: false, prog: null })));
                    setIsLoading(false);
                    return;
                }
                setUserId(user.id);

                // Get user's trivia stats
                const { data: streakData } = await supabase
                    .from('trivia_streaks')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();

                const scores = await fetchAllScores(supabase, user.id);

                // ONE aggregator for the whole app. The page used to hand-roll a
                // 7-field stats object that omitted perfectGames, categoryCorrect,
                // the speed fields and maxGamesInDay entirely, so ~half the real
                // achievement list could never evaluate true here.
                const stats = computeTriviaStats(scores, streakData);

                // isUnlocked() evaluates each predicate defensively — one bad
                // requirement must not take down the whole page.
                const processedAchievements = TRIVIA_ACHIEVEMENTS.map(achievement => ({
                    ...achievement,
                    unlocked: isUnlocked(achievement, stats),
                    prog: progressFor(achievement.id, stats)
                }));

                setAchievements(processedAchievements);
                setUnlockedCount(processedAchievements.filter(a => a.unlocked).length);
                setRewardTotal(sumAchievementRewards(processedAchievements.filter(a => a.unlocked)));

                // Celebrate anything unlocked since the player last looked.
                const unlockedIds = processedAchievements.filter(a => a.unlocked).map(a => a.id);
                const alreadySeen = readSeenUnlocks(user.id);
                const fresh = unlockedIds.filter(id => !alreadySeen.includes(id));
                if (fresh.length > 0) {
                    // Don't fire on a first-ever visit by a player who already
                    // qualifies for a pile of achievements — only celebrate when
                    // we have a prior baseline to compare against.
                    if (alreadySeen.length > 0) {
                        setNewlyUnlocked(fresh);
                        try { busEmit.celebration('confetti'); } catch (e) { /* non-critical */ }
                    }
                    writeSeenUnlocks(user.id, unlockedIds);
                }
            } catch (error) {
                console.warn('Error loading achievements:', error);
                setAchievements(TRIVIA_ACHIEVEMENTS.map(a => ({ ...a, unlocked: false, prog: null })));
                setLoadError('We could not load your achievements right now. Please try again.');
            }
            setIsLoading(false);
        }

        loadAchievements();

        // Realtime subscription — live updates (same scope as loadAchievements)
        const user = avatarUser || getAuthUser();
        if (!user) return;
        const _ch = supabase
            .channel(`trivia-ach:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${user.id}` }, () => { loadAchievements(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [avatarUser?.id, avatarLoading]);

    return (
        <TriviaErrorBoundary pageName="Achievements">
        <>
            <SEOHead
                title="Trivia Achievements — Unlock Rewards"
                description="Track Your Poker Trivia Achievements. Unlock Badges, Rewards, And Bragging Rights."
                canonical="/hub/trivia/achievements"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#18191a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(35, 116, 225, 0.1)',
                                border: '1px solid rgba(35, 116, 225, 0.3)',
                                color: '#2374e1',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            Back to Trivia
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#e4e6eb', margin: 0 }}>
                                Achievements
                            </h1>
                            {!isLoading && (
                                <div style={{
                                    background: 'rgba(35, 116, 225, 0.2)',
                                    border: '1px solid rgba(35, 116, 225, 0.4)',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    color: '#2374e1',
                                    fontWeight: 'bold'
                                }}>
                                    {unlockedCount} / {TRIVIA_ACHIEVEMENTS.length} Unlocked
                                </div>
                            )}
                        </div>

                        {/* Reward total — the shared config attaches diamonds to
                            every achievement; the page never showed them. */}
                        {!isLoading && rewardTotal > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00d4ff', marginBottom: '18px', fontWeight: 'bold' }}>
                                <Gem size={18} />
                                <span>{rewardTotal.toLocaleString()} Diamonds Earned From Achievements</span>
                            </div>
                        )}

                        {/* Overall progress */}
                        {!isLoading && (
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ height: '8px', background: '#3a3b3c', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${TRIVIA_ACHIEVEMENTS.length > 0 ? Math.round((unlockedCount / TRIVIA_ACHIEVEMENTS.length) * 100) : 0}%`,
                                        background: 'linear-gradient(90deg, #2374e1, #00d4ff)',
                                        borderRadius: '4px',
                                        transition: 'width 0.8s ease-out'
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Newly-unlocked banner */}
                        {newlyUnlocked.length > 0 && (
                            <div role="status" style={{
                                marginBottom: '24px',
                                padding: '16px 20px',
                                background: 'rgba(49, 162, 76, 0.12)',
                                border: '1px solid rgba(49, 162, 76, 0.4)',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#31a24c', fontWeight: 'bold' }}>
                                    <Trophy size={20} />
                                    <span>
                                        {newlyUnlocked.length} New {newlyUnlocked.length === 1 ? 'Achievement' : 'Achievements'} Unlocked!
                                    </span>
                                </div>
                                <button
                                    onClick={() => setNewlyUnlocked([])}
                                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e4e6eb', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>
                                Loading achievements...
                            </div>
                        ) : loadError ? (
                            <div role="alert" style={{
                                padding: '40px',
                                textAlign: 'center',
                                background: 'rgba(240, 40, 73, 0.1)',
                                border: '1px solid rgba(240, 40, 73, 0.35)',
                                borderRadius: '12px',
                                color: '#f02849'
                            }}>
                                {loadError}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '16px' }}>
                                {/* Per-category progress strip — 30 achievements
                                    is a long flat list without it. */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                                    {ACHIEVEMENT_CATEGORIES.map(cat => {
                                        const inCat = achievements.filter(a => a.category === cat.id);
                                        if (inCat.length === 0) return null;
                                        const done = inCat.filter(a => a.unlocked).length;
                                        return (
                                            <div key={`cat-${cat.id}`} style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '10px', padding: '10px 12px' }}>
                                                <div style={{ color: cat.color, fontWeight: 'bold', fontSize: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                                    {cat.name}
                                                </div>
                                                <div style={{ color: '#65676b', fontSize: '12px', marginTop: '2px' }}>{done} / {inCat.length}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {achievements.map(achievement => {
                                    const IconComponent = iconFor(achievement.icon);
                                    const rarity = RARITY_CONFIG[achievement.rarity] || null;
                                    return (
                                        <div
                                            key={achievement.id}
                                            style={{
                                                background: achievement.unlocked ? 'rgba(35, 116, 225, 0.1)' : '#242526',
                                                border: `1px solid ${achievement.unlocked ? 'rgba(35, 116, 225, 0.3)' : '#4e4f50'}`,
                                                borderRadius: '12px',
                                                padding: '20px',
                                                display: 'flex',
                                                gap: '16px',
                                                alignItems: 'center',
                                                opacity: achievement.unlocked ? 1 : 0.5,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{
                                                width: '48px',
                                                height: '48px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: achievement.unlocked ? 'rgba(35, 116, 225, 0.15)' : '#3a3b3c',
                                                borderRadius: '12px'
                                            }}>
                                                <IconComponent
                                                    size={24}
                                                    color={achievement.unlocked ? '#2374e1' : '#65676b'}
                                                />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>
                                                    {achievement.name}
                                                    {newlyUnlocked.includes(achievement.id) && (
                                                        <span style={{ marginLeft: '8px', color: '#31a24c', fontSize: '12px' }}>NEW</span>
                                                    )}
                                                </div>
                                                <div style={{ color: '#65676b', fontSize: '14px' }}>
                                                    {achievement.description}
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
                                                    {rarity && (
                                                        <span style={{ color: rarity.color, fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                                            {rarity.label}
                                                        </span>
                                                    )}
                                                    {achievement.reward?.diamonds > 0 && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#00d4ff', fontSize: '11px' }}>
                                                            <Gem size={12} />{achievement.reward.diamonds}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Progress toward a locked achievement — the page
                                                    was previously a flat locked/unlocked checklist
                                                    with no sense of how close anything was. */}
                                                {!achievement.unlocked && achievement.prog && achievement.prog.target > 1 && (
                                                    <div style={{ marginTop: '10px' }}>
                                                        <div style={{ height: '5px', background: '#3a3b3c', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div style={{
                                                                height: '100%',
                                                                width: `${Math.min(100, Math.round((achievement.prog.current / achievement.prog.target) * 100))}%`,
                                                                background: '#2374e1',
                                                                borderRadius: '3px',
                                                                transition: 'width 0.6s ease-out'
                                                            }} />
                                                        </div>
                                                        <div style={{ color: '#65676b', fontSize: '11px', marginTop: '4px' }}>
                                                            {achievement.prog.current.toLocaleString()} / {achievement.prog.target.toLocaleString()}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {achievement.unlocked && (
                                                <div style={{
                                                    color: '#31a24c',
                                                    fontWeight: 'bold',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <CheckCircle size={20} />
                                                    Unlocked
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                  <BottomNavBar />
    </PageTransition>
        </>
        </TriviaErrorBoundary>
    );
}
