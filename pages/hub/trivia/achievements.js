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
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
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

/**
 * Title Case for strings that reach the screen from data (the copy gates only
 * read literals). Raises the first letter of every word and never lowers the
 * rest, so acronyms and names survive ('8 PM', 'MTT', '1v1', 'GTO'), and
 * writes clock times as '2 AM'. The shared toTitleCase lowers everything
 * after the first letter ('PM' -> 'Pm', '2am' -> '2Am'), so it is not used
 * for these strings.
 */
function printTitle(text) {
    return String(text ?? '')
      .replace(/(\d)\s?(am|pm)\b/gi, (match, digit, meridiem) => `${digit} ${meridiem.toUpperCase()}`)
      .replace(/(^|[\s_\-/(])(\p{Ll})/gu, (match, lead, letter) => lead + letter.toUpperCase());
}

/** Rarity is printed in a schema ink, never the config's own off-schema colour. */
const RARITY_INK = {
    common: 'tc-ink--muted',
    rare: 'tc-ink--blue',
    epic: 'tc-ink--white',
    legendary: 'tc-ink--gold'
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
    if (typeof window === 'undefined' || !uid) return false;
    try {
        const raw = JSON.parse(localStorage.getItem(SEEN_UNLOCKS_KEY) || '{}') || {};
        raw[uid] = ids;
        localStorage.setItem(SEEN_UNLOCKS_KEY, JSON.stringify(raw));
        return true;
    } catch (e) {
        console.warn('[Achievements] Could not persist seen unlocks:', e);
        return false;
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
            // No history at all is an error the player must see, not an
            // empty record; a later page failing keeps what was read.
            if (page === 0) throw error;
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
    // Bumped by Retry so a failed load can be run again in place.
    const [reloadKey, setReloadKey] = useState(0);
    const retryLoad = () => {
        setLoadError(null);
        setIsLoading(true);
        setReloadKey(key => key + 1);
    };
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
                const { data: streakData, error: streakError } = await supabase
                    .from('trivia_streaks')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();
                // A failed streak read leaves the streak achievements locked
                // rather than failing the page; the score history still counts.
                if (streakError) console.warn('[Achievements] Streak read failed:', streakError.message);

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
                setLoadError('We Could Not Load Your Achievements Right Now. Please Try Again.');
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
    }, [avatarUser?.id, avatarLoading, reloadKey]);

    const overallProgress = TRIVIA_ACHIEVEMENTS.length > 0
        ? Math.round((unlockedCount / TRIVIA_ACHIEVEMENTS.length) * 100)
        : 0;
    const signedOut = !isLoading && !userId;

    return (
        <TriviaErrorBoundary pageName="Achievements">
        <>
            <SEOHead
                title="Trivia Achievements - Unlock Rewards"
                description="Track Your Poker Trivia Achievements. Unlock Badges, Rewards, And Bragging Rights."
                canonical="/hub/trivia/achievements"
            />

            <PageTransition>
                <div
                    className="trivia-progress-page trivia-progress-page--achievements"
                    data-trivia-family="progress"
                    data-trivia-surface="achievements"
                >
                    <UniversalHeader pageDepth={2} />

                    <main className="trivia-progress-shell" aria-labelledby="trivia-achievements-title">
                        <TriviaConsole
                            as="section"
                            eyebrow="Player Progress"
                            title="Achievements"
                            titleAs="h1"
                            titleId="trivia-achievements-title"
                            pill={isLoading
                                ? 'Loading'
                                : loadError
                                    ? 'Error'
                                    : `${formatTriviaDisplayNumber(unlockedCount)} Of ${formatTriviaDisplayNumber(TRIVIA_ACHIEVEMENTS.length)}`}
                            pillInk={loadError ? 'red' : !isLoading && unlockedCount > 0 ? 'green' : 'blue'}
                            className="trivia-progress-console"
                            aria-labelledby="trivia-achievements-title"
                            secondaryAction={{
                                label: 'Back To Trivia',
                                onClick: () => router.push('/hub/trivia'),
                            }}
                            // A failed load has two real actions, so both print
                            // on the painted plates (footer law).
                            primaryAction={!isLoading && loadError ? {
                                label: 'Retry',
                                onClick: retryLoad,
                            } : undefined}
                        >
                        {/* Newly-unlocked notice */}
                        {newlyUnlocked.length > 0 && (
                            <section className="trivia-progress-notice" role="status">
                                <p className="tc-ink--green">
                                    {formatTriviaDisplayNumber(newlyUnlocked.length)} New {newlyUnlocked.length === 1 ? 'Achievement' : 'Achievements'} Unlocked
                                </p>
                                <button
                                    type="button"
                                    className="tc-word"
                                    onClick={() => setNewlyUnlocked([])}
                                >
                                    Dismiss
                                </button>
                            </section>
                        )}

                        {isLoading ? (
                            <p className="trivia-progress-state trivia-progress-state--loading" role="status">
                                Loading Achievements
                            </p>
                        ) : loadError ? (
                            <section className="trivia-progress-state trivia-progress-state--error" role="alert">
                                <p>{loadError}</p>
                            </section>
                        ) : (
                            <div className="trivia-progress-content">
                                {signedOut && (
                                    <p className="trivia-progress-intro">
                                        Sign In To Track Your Achievements. Every Achievement Is Shown Locked Until Then.
                                    </p>
                                )}

                                {/* Overall progress and the diamonds attached to what
                                    the player has unlocked, printed as rows. */}
                                <ul className="tc-rows trivia-progress-rows" aria-label="Achievement Summary">
                                    <li className="tc-row">
                                        <span className="tc-row__label">Unlocked</span>
                                        <span className="tc-row__value">
                                            {formatTriviaDisplayNumber(unlockedCount)} Of {formatTriviaDisplayNumber(TRIVIA_ACHIEVEMENTS.length)}
                                        </span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label">Completion</span>
                                        <span className="tc-row__value tc-ink--blue">{overallProgress}%</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label">Diamonds Earned</span>
                                        <span className="tc-row__value tc-ink--gold">{formatTriviaDisplayNumber(rewardTotal)}</span>
                                    </li>
                                </ul>

                                {/* Per-category progress: 30 achievements is a long
                                    flat list without it. */}
                                <section className="trivia-progress-section" aria-labelledby="trivia-achievements-categories">
                                    <h2 id="trivia-achievements-categories" className="trivia-progress-heading">By Category</h2>
                                    <ul className="tc-rows trivia-progress-rows trivia-progress-rows--split">
                                        {ACHIEVEMENT_CATEGORIES.map(cat => {
                                            const inCat = achievements.filter(a => a.category === cat.id);
                                            if (inCat.length === 0) return null;
                                            const done = inCat.filter(a => a.unlocked).length;
                                            return (
                                                <li
                                                    key={`cat-${cat.id}`}
                                                    className="tc-row"
                                                    data-category={cat.id}
                                                >
                                                    <span className="tc-row__label">{printTitle(cat.name)}</span>
                                                    <span className={`tc-row__value${done === inCat.length ? ' tc-ink--green' : ''}`}>
                                                        {formatTriviaDisplayNumber(done)} / {formatTriviaDisplayNumber(inCat.length)}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>

                                <section className="trivia-progress-section" aria-labelledby="trivia-achievements-list">
                                    <h2 id="trivia-achievements-list" className="trivia-progress-heading">All Achievements</h2>
                                    <ul className="trivia-progress-list">
                                        {achievements.map(achievement => {
                                            const rarity = RARITY_CONFIG[achievement.rarity] || null;
                                            const rarityInk = RARITY_INK[achievement.rarity] || 'tc-ink--muted';
                                            const showProgress = !achievement.unlocked && achievement.prog && achievement.prog.target > 1;
                                            return (
                                                <li
                                                    key={achievement.id}
                                                    className="trivia-progress-item"
                                                    data-achievement-id={achievement.id}
                                                    data-category={achievement.category}
                                                    data-rarity={achievement.rarity}
                                                    data-state={achievement.unlocked ? 'unlocked' : 'locked'}
                                                >
                                                    <h3 className="trivia-progress-item__title">
                                                        <span>{printTitle(achievement.name)}</span>
                                                        {newlyUnlocked.includes(achievement.id) && (
                                                            <span className="trivia-progress-item__new tc-ink--green">New</span>
                                                        )}
                                                    </h3>
                                                    <p className="trivia-progress-item__description">
                                                        {printTitle(achievement.description)}
                                                    </p>
                                                    <p className="trivia-progress-item__meta">
                                                        {rarity && (
                                                            <span className={rarityInk}>{printTitle(rarity.label)}</span>
                                                        )}
                                                        {achievement.reward?.diamonds > 0 && (
                                                            <span className="tc-ink--gold">
                                                                {formatTriviaDisplayNumber(achievement.reward.diamonds)} Diamonds
                                                            </span>
                                                        )}
                                                        {achievement.unlocked ? (
                                                            <span className="tc-ink--green">Unlocked</span>
                                                        ) : showProgress ? (
                                                            <span
                                                                className="tc-ink--blue"
                                                                aria-label={`${printTitle(achievement.name)} Progress ${achievement.prog.current} Of ${achievement.prog.target}`}
                                                            >
                                                                {formatTriviaDisplayNumber(achievement.prog.current)} / {formatTriviaDisplayNumber(achievement.prog.target)}
                                                            </span>
                                                        ) : (
                                                            <span className="tc-ink--muted">Locked</span>
                                                        )}
                                                    </p>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            </div>
                        )}
                        </TriviaConsole>
                    </main>
                </div>
    </PageTransition>
        </>
        </TriviaErrorBoundary>
    );
}
