import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { authedFetch, getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART } from '../../../src/config/triviaIntroArt.mjs';
import {
    getTrainingSpotForCategory,
    TRAINING_SPOT_MAP,
} from '../../../src/lib/trivia/trainingSpotMap.mjs';
import {
    buildMissDrillQuestions,
    getLeitnerBoxLabel,
    isItemMastered,
    loadStudySrsState,
    partitionStudyDeck,
    recordStudyReview,
    saveStudySrsState,
} from '../../../src/lib/trivia/studySpacedRepetition.mjs';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const DRILL_QUESTION_LIMIT = 10;

const STUDY_MODE_TABS = [
    { id: 'due_today', label: 'Due Today' },
    { id: 'weakest_category', label: 'Weakest Category' },
    { id: 'all', label: 'All Misses' },
    { id: 'mastered', label: 'Mastered' },
];

function formatDifficulty(value) {
    if (value === 'easy') return 'Easy';
    if (value === 'hard') return 'Hard';
    return 'Medium';
}

function formatDate(iso) {
    if (!iso) return 'Recently';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TriviaStudyDeck() {
    useTrainingBus('trivia-study');
    const router = useRouter();
    const { user: avatarUser, loading: avatarLoading } = useAvatar();

    const [userId, setUserId] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [studyMode, setStudyMode] = useState('due_today');
    const [items, setItems] = useState([]);
    const [categoryCounts, setCategoryCounts] = useState({});
    const [totalMissed, setTotalMissed] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [masteredIds, setMasteredIds] = useState([]);
    const [srsState, setSrsState] = useState({});
    const [hideMastered, setHideMastered] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    // Zero-reward local practice drill state (never calls session-start or session-submit)
    const [drillActive, setDrillActive] = useState(false);
    const [drillQuestions, setDrillQuestions] = useState([]);
    const [drillIndex, setDrillIndex] = useState(0);
    const [drillSelectedOption, setDrillSelectedOption] = useState(null);
    const [drillResults, setDrillResults] = useState([]);
    const [drillCompleted, setDrillCompleted] = useState(false);

    const loadDeck = useCallback(async (category, cancelled) => {
        setLoadError('');
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (category && category !== 'all') params.set('category', category);
            const resp = await authedFetch(`/api/trivia/study-misses?${params.toString()}`);
            if (cancelled()) return;
            if (resp.status === 401) {
                setUserId(null);
                setItems([]);
                setCategoryCounts({});
                setTotalMissed(0);
                setIsLoading(false);
                return;
            }
            const payload = await resp.json();
            if (cancelled()) return;
            if (!resp.ok || !payload?.success) {
                setLoadError('We Could Not Load Your Missed Questions Deck Right Now. Please Try Again.');
                setIsLoading(false);
                return;
            }
            setItems(Array.isArray(payload.items) ? payload.items : []);
            setCategoryCounts(payload.categories && typeof payload.categories === 'object' ? payload.categories : {});
            setTotalMissed(Number(payload.totalMissed) || 0);
            setCurrentIndex(0);
            setIsFlipped(false);
        } catch (_err) {
            if (!cancelled()) {
                setLoadError('We Could Not Load Your Missed Questions Deck Right Now. Please Try Again.');
            }
        } finally {
            if (!cancelled()) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (avatarLoading) return undefined;
        let stopped = false;
        const cancelled = () => stopped;
        const resolved = avatarUser || getAuthUser();
        if (!resolved?.id) {
            setUserId(null);
            setItems([]);
            setCategoryCounts({});
            setTotalMissed(0);
            setSrsState({});
            setLoadError('');
            setIsLoading(false);
            return () => { stopped = true; };
        }
        setUserId(resolved.id);
        setSrsState(loadStudySrsState(resolved.id));
        loadDeck(categoryFilter, cancelled);
        return () => { stopped = true; };
    }, [avatarLoading, avatarUser?.id, categoryFilter, loadDeck, reloadKey]);

    const applySrsReview = useCallback((questionId, gotIt) => {
        setSrsState((prev) => {
            const next = recordStudyReview(prev, questionId, gotIt, Date.now());
            if (userId) {
                saveStudySrsState(userId, next);
            }
            return next;
        });
    }, [userId]);

    const deckPartition = useMemo(
        () => partitionStudyDeck(items, srsState),
        [items, srsState],
    );

    const modeItems = useMemo(() => {
        if (studyMode === 'due_today') return deckPartition.dueToday;
        if (studyMode === 'weakest_category') return deckPartition.weakestCategoryItems;
        if (studyMode === 'mastered') return deckPartition.mastered;
        return items;
    }, [deckPartition, items, studyMode]);

    const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
    const visibleItems = useMemo(() => {
        if (!hideMastered || studyMode === 'mastered') return modeItems;
        return modeItems.filter((card) => !masteredSet.has(card.questionId) && !isItemMastered(card, srsState));
    }, [hideMastered, masteredSet, modeItems, srsState, studyMode]);

    const safeIndex = visibleItems.length > 0 ? Math.min(currentIndex, visibleItems.length - 1) : 0;
    const activeCard = visibleItems[safeIndex] || null;
    const activeSpot = activeCard
        ? (activeCard.trainingSpot || getTrainingSpotForCategory(activeCard.category))
        : null;
    const isCardMastered = activeCard
        ? (masteredSet.has(activeCard.questionId) || isItemMastered(activeCard, srsState))
        : false;
    const activeBoxLabel = activeCard
        ? getLeitnerBoxLabel(srsState[activeCard.questionId])
        : 'Box 1 (Due Now)';

    const sessionMasteredInDeck = useMemo(
        () => items.filter((card) => masteredSet.has(card.questionId) || isItemMastered(card, srsState)).length,
        [items, masteredSet, srsState],
    );

    const drillCandidates = useMemo(
        () => buildMissDrillQuestions(items, srsState, DRILL_QUESTION_LIMIT),
        [items, srsState],
    );

    const weakestCategoryLabel = deckPartition.weakestCategory
        ? (TRAINING_SPOT_MAP[deckPartition.weakestCategory]?.categoryLabel || deckPartition.weakestCategory)
        : null;

    const categoryPills = useMemo(() => {
        const available = Object.entries(categoryCounts)
            .filter(([, count]) => Number(count) > 0)
            .sort((a, b) => Number(b[1]) - Number(a[1]));
        return [
            { id: 'all', label: 'All Misses', count: totalMissed },
            ...available.map(([catId, count]) => ({
                id: catId,
                label: TRAINING_SPOT_MAP[catId]?.categoryLabel || catId,
                count: Number(count) || 0,
            })),
        ];
    }, [categoryCounts, totalMissed]);

    const handleSelectCategory = (catId) => {
        if (catId === categoryFilter) return;
        setCategoryFilter(catId);
        setCurrentIndex(0);
        setIsFlipped(false);
    };

    const handleSelectStudyMode = (modeId) => {
        setStudyMode(modeId);
        setCurrentIndex(0);
        setIsFlipped(false);
    };

    const handleToggleGotIt = () => {
        if (!activeCard) return;
        const qid = activeCard.questionId;
        const nextGotIt = !isCardMastered;
        applySrsReview(qid, nextGotIt);
        setMasteredIds((prev) => (
            nextGotIt
                ? (prev.includes(qid) ? prev : [...prev, qid])
                : prev.filter((id) => id !== qid)
        ));
    };

    const handlePrev = () => {
        if (visibleItems.length === 0) return;
        setCurrentIndex((prev) => (prev <= 0 ? visibleItems.length - 1 : prev - 1));
        setIsFlipped(false);
    };

    const handleNext = () => {
        if (visibleItems.length === 0) return;
        setCurrentIndex((prev) => (prev >= visibleItems.length - 1 ? 0 : prev + 1));
        setIsFlipped(false);
    };

    const handleStartMissDrill = () => {
        const selected = buildMissDrillQuestions(items, srsState, DRILL_QUESTION_LIMIT, Date.now());
        if (selected.length === 0) return;
        setDrillQuestions(selected);
        setDrillIndex(0);
        setDrillSelectedOption(null);
        setDrillResults([]);
        setDrillCompleted(false);
        setDrillActive(true);
    };

    const handleDrillAnswer = (optionIdx) => {
        if (drillSelectedOption !== null || drillCompleted) return;
        const question = drillQuestions[drillIndex];
        if (!question) return;
        const isCorrect = optionIdx === question.correctIndex;
        setDrillSelectedOption(optionIdx);
        applySrsReview(question.questionId, isCorrect);
        if (isCorrect) {
            setMasteredIds((prev) => (prev.includes(question.questionId) ? prev : [...prev, question.questionId]));
        } else {
            setMasteredIds((prev) => prev.filter((id) => id !== question.questionId));
        }
        setDrillResults((prev) => [
            ...prev,
            {
                questionId: question.questionId,
                category: question.category,
                correct: isCorrect,
            },
        ]);
    };

    const handleDrillNext = () => {
        if (drillIndex + 1 >= drillQuestions.length) {
            setDrillCompleted(true);
            return;
        }
        setDrillIndex((prev) => prev + 1);
        setDrillSelectedOption(null);
    };

    const handleExitDrill = () => {
        setDrillActive(false);
        setDrillCompleted(false);
        setDrillSelectedOption(null);
        setCurrentIndex(0);
        setIsFlipped(false);
    };

    const currentDrillCard = drillActive && !drillCompleted ? (drillQuestions[drillIndex] || null) : null;
    const drillCorrectCount = useMemo(
        () => drillResults.filter((r) => r.correct).length,
        [drillResults],
    );
    const drillWeakestSpot = useMemo(() => {
        const missesByCategory = new Map();
        for (const r of drillResults) {
            if (!r.correct && r.category) {
                missesByCategory.set(r.category, (missesByCategory.get(r.category) || 0) + 1);
            }
        }
        let targetCat = null;
        let maxCount = 0;
        for (const [cat, count] of missesByCategory.entries()) {
            if (count > maxCount || (count === maxCount && targetCat && cat.localeCompare(targetCat) < 0)) {
                targetCat = cat;
                maxCount = count;
            }
        }
        const resolvedCat = targetCat || deckPartition.weakestCategory || drillQuestions[0]?.category || null;
        return resolvedCat ? getTrainingSpotForCategory(resolvedCat) : null;
    }, [deckPartition.weakestCategory, drillQuestions, drillResults]);

    const tabCountFor = (tabId) => {
        if (tabId === 'due_today') return deckPartition.counts.dueToday;
        if (tabId === 'weakest_category') return deckPartition.counts.weakestCategory;
        if (tabId === 'mastered') return deckPartition.counts.mastered;
        return deckPartition.counts.all;
    };

    const signedOut = !isLoading && !userId;
    const isEmptyDeck = !isLoading && !loadError && Boolean(userId) && items.length === 0;
    const allFilteredMastered = !isLoading && !loadError && Boolean(userId) && items.length > 0 && visibleItems.length === 0;

    return (
        <TriviaErrorBoundary pageName="Study Deck">
            <>
                <SEOHead
                    title="Study Your Misses - Personal Trivia Review Deck"
                    description="Review Your Missed Poker Trivia Questions With Explanations And Direct World Hub Training Links."
                    canonical="/hub/trivia/study"
                    noindex
                />
                <PageTransition>
                    <div className="smarterdesign trivia-progress-page trivia-progress-page--study" data-trivia-family="progress" data-trivia-surface="study">
                        <UniversalHeader pageDepth={2} />
                        <main className="trivia-progress-shell" aria-labelledby="trivia-study-title">
                            <TriviaConsole
                                className="trivia-progress-console"
                                eyebrow="Personal Review Desk"
                                title="Study Your Misses"
                                titleAs="h1"
                                titleId="trivia-study-title"
                                subtitle="Spaced-Repetition Deck And Practice Drill"
                                pill={isLoading
                                    ? 'Loading'
                                    : loadError
                                        ? 'Error'
                                        : signedOut
                                            ? 'Guest'
                                            : `${formatTriviaDisplayNumber(totalMissed)} ${totalMissed === 1 ? 'Miss' : 'Misses'}`}
                                pillInk={loadError ? 'red' : 'blue'}
                                secondaryAction={{ label: 'Back To Stats', onClick: () => router.push('/hub/trivia/stats') }}
                                primaryAction={!isLoading && loadError
                                    ? { label: 'Retry', onClick: () => setReloadKey((k) => k + 1) }
                                    : signedOut
                                        ? { label: 'Sign In', onClick: () => router.push('/auth/login?redirect=/hub/trivia/study') }
                                        : { label: 'Play Trivia', onClick: () => router.push('/hub/trivia') }}
                            >
                                <ResponsiveModeArt art={TRIVIA_INTRO_ART.stats} priority />

                                <div className="study-stage-container" style={{ minHeight: '460px' }}>
                                {isLoading ? (
                                    <div className="trivia-progress-state trivia-progress-state--loading" role="status" style={{ minHeight: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <p>Loading Missed Questions</p>
                                    </div>
                                ) : loadError ? (
                                    <section className="trivia-progress-state trivia-progress-state--error" role="alert">
                                        <p>{loadError}</p>
                                    </section>
                                ) : signedOut ? (
                                    <section className="trivia-progress-empty">
                                        <p className="trivia-progress-empty-copy">Sign In To Study Your Personal Missed Questions Deck.</p>
                                    </section>
                                ) : isEmptyDeck ? (
                                    <section className="trivia-progress-empty">
                                        <p className="trivia-progress-empty-copy">
                                            {categoryFilter === 'all'
                                                ? 'No Missed Questions Recorded Yet. Play Any Trivia Mode To Build Your Personal Study Deck.'
                                                : 'No Missed Questions Found In This Category.'}
                                        </p>
                                        {categoryFilter !== 'all' ? (
                                            <button
                                                type="button"
                                                className="tc-word study-inline-btn"
                                                onClick={() => handleSelectCategory('all')}
                                            >
                                                Show All Categories
                                            </button>
                                        ) : null}
                                    </section>
                                ) : drillActive ? (
                                    <section className="study-drill" aria-label="Zero-Reward Practice Drill" data-miss-drill-active="true">
                                        <div className="study-drill__banner" role="status">
                                            <span className="study-badge study-badge--zero-reward">
                                                Practice Drill - Zero Cost, Zero Rewards
                                            </span>
                                            <span className="study-drill__progress">
                                                {drillCompleted
                                                    ? `Completed ${drillQuestions.length} ${drillQuestions.length === 1 ? 'Question' : 'Questions'}`
                                                    : `Question ${drillIndex + 1} Of ${drillQuestions.length}`}
                                            </span>
                                        </div>

                                        {drillCompleted ? (
                                            <article className="study-card study-drill__summary" aria-label="Practice Drill Summary">
                                                <h2 className="study-card__question">
                                                    Drill Complete: {formatTriviaDisplayNumber(drillCorrectCount)} / {formatTriviaDisplayNumber(drillQuestions.length)} Correct
                                                </h2>
                                                <p className="study-drill__subcopy">
                                                    Your Spaced-Repetition Leitner Boxes Have Been Updated Automatically. Zero Diamonds Were Wagered Or Awarded.
                                                </p>

                                                <div className="study-card__actions">
                                                    {drillWeakestSpot ? (
                                                        <Link href={drillWeakestSpot.href} className="study-btn study-btn--train">
                                                            Train This Spot: {drillWeakestSpot.label}
                                                        </Link>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        className="study-btn study-btn--flip"
                                                        onClick={handleStartMissDrill}
                                                    >
                                                        Drill Again
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="study-btn"
                                                        onClick={handleExitDrill}
                                                    >
                                                        Back To Study Deck
                                                    </button>
                                                </div>
                                            </article>
                                        ) : currentDrillCard ? (
                                            <article className="study-card" aria-label="Active Practice Drill Question">
                                                <header className="study-card__meta">
                                                    <span className="study-badge study-badge--category">{currentDrillCard.categoryLabel}</span>
                                                    <span className={`study-badge study-badge--${currentDrillCard.difficulty}`}>
                                                        {formatDifficulty(currentDrillCard.difficulty)}
                                                    </span>
                                                    <span className="study-badge study-badge--srs">
                                                        {getLeitnerBoxLabel(srsState[currentDrillCard.questionId])}
                                                    </span>
                                                </header>

                                                <h2 className="study-card__question">{currentDrillCard.question}</h2>

                                                <div className="study-drill__options" role="group" aria-label="Practice Drill Answer Choices">
                                                    {currentDrillCard.options.map((optText, idx) => {
                                                        const isAnswered = drillSelectedOption !== null;
                                                        const isChosen = drillSelectedOption === idx;
                                                        const isCorrect = idx === currentDrillCard.correctIndex;
                                                        let stateClass = '';
                                                        if (isAnswered && isCorrect) stateClass = ' study-drill__option--correct';
                                                        else if (isAnswered && isChosen && !isCorrect) stateClass = ' study-drill__option--wrong';
                                                        return (
                                                            <button
                                                                key={`${currentDrillCard.questionId}-drill-${idx}`}
                                                                type="button"
                                                                disabled={isAnswered}
                                                                data-drill-option={idx}
                                                                className={`study-drill__option${stateClass}`}
                                                                onClick={() => handleDrillAnswer(idx)}
                                                            >
                                                                <span className="study-option__letter">{OPTION_LETTERS[idx] || String(idx + 1)}</span>
                                                                <span className="study-option__text">{optText}</span>
                                                                {isAnswered && isCorrect ? (
                                                                    <span className="study-option__tag">Correct</span>
                                                                ) : isAnswered && isChosen && !isCorrect ? (
                                                                    <span className="study-option__tag study-option__tag--wrong">Review Again</span>
                                                                ) : null}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {drillSelectedOption !== null ? (
                                                    <section className="study-explanation" aria-label="Drill Answer Explanation">
                                                        <h3 className="study-explanation__heading">
                                                            {drillSelectedOption === currentDrillCard.correctIndex
                                                                ? 'Got It - Leitner Box Advanced'
                                                                : 'Review Again - Reset To Box 1'}
                                                        </h3>
                                                        <p className="study-explanation__body">
                                                            {currentDrillCard.explanation || 'Review The Correct Option Above And Drill Similar Spots In Training.'}
                                                        </p>
                                                    </section>
                                                ) : null}

                                                <div className="study-card__actions">
                                                    {drillSelectedOption !== null ? (
                                                        <button
                                                            type="button"
                                                            className="study-btn study-btn--flip"
                                                            onClick={handleDrillNext}
                                                        >
                                                            {drillIndex + 1 >= drillQuestions.length ? 'View Drill Summary' : 'Next Question'}
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        className="study-btn"
                                                        onClick={handleExitDrill}
                                                    >
                                                        Back To Study Deck
                                                    </button>
                                                </div>
                                            </article>
                                        ) : null}
                                    </section>
                                ) : (
                                    <div className="study-deck-wrap">
                                        <p className="study-deck-note">
                                            Practice Review Deck. Practice Drill - Zero Cost, Zero Rewards. No Diamonds Are Wagered Or Awarded.
                                        </p>

                                        <div className="study-drill-launch-bar">
                                            <div className="study-drill-launch-bar__info">
                                                <span className="study-drill-launch-bar__title">
                                                    Active Spaced-Repetition Drill
                                                </span>
                                                <span className="study-drill-launch-bar__meta">
                                                    Due Today: {formatTriviaDisplayNumber(deckPartition.counts.dueToday)}
                                                    {weakestCategoryLabel ? ` · Weakest: ${weakestCategoryLabel}` : ''}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                data-start-miss-drill="true"
                                                disabled={drillCandidates.length === 0}
                                                className="study-btn study-btn--drill-cta"
                                                onClick={handleStartMissDrill}
                                            >
                                                Quiz My Misses ({drillCandidates.length >= DRILL_QUESTION_LIMIT ? '10 Questions' : `${drillCandidates.length} ${drillCandidates.length === 1 ? 'Question' : 'Questions'}`})
                                            </button>
                                        </div>

                                        <div className="study-mode-tabs" role="tablist" aria-label="Spaced Repetition Study Modes">
                                            {STUDY_MODE_TABS.map((tab) => {
                                                const isActive = studyMode === tab.id;
                                                return (
                                                    <button
                                                        key={tab.id}
                                                        type="button"
                                                        role="tab"
                                                        aria-selected={isActive}
                                                        data-study-mode-tab={tab.id}
                                                        className={`study-mode-tab${isActive ? ' study-mode-tab--active' : ''}`}
                                                        onClick={() => handleSelectStudyMode(tab.id)}
                                                    >
                                                        <span>{tab.label}</span>
                                                        {' '}
                                                        <span className="study-mode-tab__count">
                                                            {formatTriviaDisplayNumber(tabCountFor(tab.id))}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="study-session-bar" role="status" aria-live="polite">
                                            <span className="study-session-bar__count">
                                                Session Mastery: {formatTriviaDisplayNumber(sessionMasteredInDeck)} Of {formatTriviaDisplayNumber(items.length)} Got It
                                            </span>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={hideMastered}
                                                className={`sd-button${hideMastered ? ' sd-primary' : ''} study-session-bar__toggle`}
                                                onClick={() => {
                                                    setHideMastered((prev) => !prev);
                                                    setCurrentIndex(0);
                                                    setIsFlipped(false);
                                                }}
                                            >
                                                <span>Hide Mastered: {hideMastered ? 'On' : 'Off'}</span>
                                            </button>
                                        </div>

                                        <fieldset className="trivia-progress-filter study-filter-group">
                                            <legend className="tc-label">Filter By Category</legend>
                                            <div className="trivia-progress-filter__options">
                                                {categoryPills.map((pill) => (
                                                    <button
                                                        key={pill.id}
                                                        type="button"
                                                        className="tc-word trivia-progress-filter__option"
                                                        aria-pressed={categoryFilter === pill.id}
                                                        onClick={() => handleSelectCategory(pill.id)}
                                                    >
                                                        {pill.label} ({formatTriviaDisplayNumber(pill.count)})
                                                    </button>
                                                ))}
                                            </div>
                                        </fieldset>

                                        {allFilteredMastered ? (
                                            <section className="trivia-progress-empty">
                                                <p className="trivia-progress-empty-copy">
                                                    {studyMode === 'due_today'
                                                        ? 'All Due Cards Are Caught Up For Today. Switch To All Misses Or Mastered To Review More.'
                                                        : studyMode === 'mastered'
                                                            ? 'No Cards Have Reached Leitner Box 4 Mastered Yet.'
                                                            : 'Every Card In This Study Session Is Marked Got It.'}
                                                </p>
                                                <div className="study-empty-actions">
                                                    {hideMastered ? (
                                                        <button
                                                            type="button"
                                                            className="tc-word study-inline-btn"
                                                            onClick={() => setHideMastered(false)}
                                                        >
                                                            Show All Cards Again
                                                        </button>
                                                    ) : null}
                                                    {studyMode !== 'all' ? (
                                                        <button
                                                            type="button"
                                                            className="tc-word study-inline-btn"
                                                            onClick={() => handleSelectStudyMode('all')}
                                                        >
                                                            View All Misses
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </section>
                                        ) : activeCard ? (
                                            <article className="study-card" aria-label="Missed Question Flashcard">
                                                <header className="study-card__meta">
                                                    <span className="study-badge study-badge--category">{activeCard.categoryLabel}</span>
                                                    <span className={`study-badge study-badge--${activeCard.difficulty}`}>
                                                        {formatDifficulty(activeCard.difficulty)}
                                                    </span>
                                                    <span className="study-badge study-badge--srs">
                                                        {activeBoxLabel}
                                                    </span>
                                                    <span className="study-card__counter">
                                                        Card {safeIndex + 1} Of {visibleItems.length}
                                                    </span>
                                                </header>

                                                <div className="study-card__submeta">
                                                    <span>Missed {formatTriviaDisplayNumber(activeCard.missCount)} {activeCard.missCount === 1 ? 'Time' : 'Times'}</span>
                                                    <span>Last Missed {formatDate(activeCard.lastMissedAt)}</span>
                                                </div>

                                                <h2 className="study-card__question">{activeCard.question}</h2>

                                                <ol className="study-options">
                                                    {activeCard.options.map((optText, idx) => {
                                                        const isCorrect = idx === activeCard.correctIndex;
                                                        const stateClass = isFlipped && isCorrect ? ' study-option--correct' : '';
                                                        return (
                                                            <li key={`${activeCard.questionId}-${idx}`} className={`study-option${stateClass}`}>
                                                                <span className="study-option__letter">{OPTION_LETTERS[idx] || String(idx + 1)}</span>
                                                                <span className="study-option__text">{optText}</span>
                                                                {isFlipped && isCorrect ? (
                                                                    <span className="study-option__tag">Correct Answer</span>
                                                                ) : null}
                                                            </li>
                                                        );
                                                    })}
                                                </ol>

                                                {isFlipped ? (
                                                    <section className="study-explanation" aria-label="Answer Explanation">
                                                        <h3 className="study-explanation__heading">Explanation</h3>
                                                        <p className="study-explanation__body">
                                                            {activeCard.explanation || 'Review The Correct Option Above And Drill Similar Spots In Training.'}
                                                        </p>
                                                    </section>
                                                ) : null}

                                                <div className="study-card__actions">
                                                    <button
                                                        type="button"
                                                        className="study-btn study-btn--flip"
                                                        onClick={() => setIsFlipped((prev) => !prev)}
                                                    >
                                                        {isFlipped ? 'Hide Answer' : 'Show Answer And Explanation'}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className={`study-btn ${isCardMastered ? 'study-btn--mastered' : 'study-btn--gotit'}`}
                                                        aria-pressed={isCardMastered}
                                                        onClick={handleToggleGotIt}
                                                    >
                                                        {isCardMastered ? 'Got It Recorded' : 'Mark Got It'}
                                                    </button>

                                                    {activeSpot ? (
                                                        <Link href={activeSpot.href} className="study-btn study-btn--train">
                                                            Train This Spot: {activeSpot.label}
                                                        </Link>
                                                    ) : null}
                                                </div>

                                                {activeSpot ? (
                                                    <p className="study-card__specialty">
                                                        Training Focus: {activeSpot.specialty}
                                                    </p>
                                                ) : null}

                                                <nav className="study-nav" aria-label="Flashcard Navigation">
                                                    <button type="button" className="study-nav__btn" onClick={handlePrev}>
                                                        Previous Card
                                                    </button>
                                                    <button type="button" className="study-nav__btn" onClick={handleNext}>
                                                        Next Card
                                                    </button>
                                                </nav>
                                            </article>
                                        ) : null}
                                    </div>
                                )}
                                </div>
                            </TriviaConsole>
                        </main>
                    </div>
                </PageTransition>

                <style jsx>{`
                    .study-deck-wrap {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }
                    .study-deck-note {
                        margin: 0;
                        font-size: 13px;
                        color: rgba(214, 228, 248, 0.78);
                        text-align: center;
                    }
                    .study-drill-launch-bar {
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        padding: 14px 16px;
                        border-radius: 12px;
                        background: linear-gradient(180deg, rgba(16, 36, 68, 0.94), rgba(9, 18, 34, 0.96));
                        border: 1px solid rgba(134, 218, 255, 0.42);
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    }
                    .study-drill-launch-bar__info {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .study-drill-launch-bar__title {
                        font-size: 14px;
                        font-weight: 700;
                        color: #f2f7ff;
                    }
                    .study-drill-launch-bar__meta {
                        font-size: 12px;
                        color: #bdd0e2;
                    }
                    .study-mode-tabs {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                        grid-auto-rows: 1fr;
                        align-items: stretch;
                        gap: 8px;
                    }
                    .study-mode-tab {
                        min-height: 44px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 8px;
                        width: 100%;
                        height: 100%;
                        padding: 10px 12px;
                        border-radius: 10px;
                        border: 1px solid rgba(154, 194, 242, 0.28);
                        background: rgba(12, 22, 38, 0.88);
                        color: #bdd0e2;
                        font-size: 13px;
                        font-weight: 700;
                        text-align: left;
                        cursor: pointer;
                        touch-action: manipulation;
                        transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease;
                    }
                    .study-mode-tab:active {
                        transform: scale(0.985);
                    }
                    .study-mode-tab--active {
                        background: linear-gradient(180deg, rgba(25, 129, 236, 0.34), rgba(12, 85, 192, 0.44));
                        border-color: #86daff;
                        color: #f2f7ff;
                    }
                    .study-mode-tab__count {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        min-width: 24px;
                        padding: 2px 7px;
                        border-radius: 999px;
                        background: rgba(255, 255, 255, 0.1);
                        font-size: 12px;
                        color: #e4eefc;
                    }
                    .study-session-bar {
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        padding: 12px 14px;
                        border-radius: 10px;
                        background: linear-gradient(180deg, rgba(16, 26, 44, 0.92), rgba(8, 13, 24, 0.94));
                        border: 1px solid rgba(120, 166, 224, 0.28);
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
                    }
                    .study-session-bar__count {
                        font-size: 13px;
                        font-weight: 700;
                        color: #86daff;
                    }
                    .study-session-bar__toggle {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        min-height: 44px;
                        min-width: 44px;
                        padding: 8px 14px;
                        font-size: 13px;
                        font-weight: 700;
                        color: #f2f7ff;
                        cursor: pointer;
                        touch-action: manipulation;
                    }
                    .study-drill {
                        display: flex;
                        flex-direction: column;
                        gap: 14px;
                    }
                    .study-drill__banner {
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        justify-content: space-between;
                        gap: 10px;
                        padding: 12px 14px;
                        border-radius: 10px;
                        background: rgba(12, 26, 46, 0.94);
                        border: 1px solid rgba(134, 218, 255, 0.42);
                    }
                    .study-drill__progress {
                        font-size: 13px;
                        font-weight: 700;
                        color: #f2f7ff;
                    }
                    .study-drill__options {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    .study-drill__option {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        width: 100%;
                        min-height: 44px;
                        padding: 11px 14px;
                        border-radius: 8px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(164, 196, 236, 0.28);
                        color: #f2f7ff;
                        font-size: 14px;
                        text-align: left;
                        cursor: pointer;
                        touch-action: manipulation;
                    }
                    .study-drill__option:disabled {
                        cursor: default;
                    }
                    .study-drill__option--correct {
                        background: rgba(34, 197, 94, 0.2);
                        border-color: rgba(74, 222, 128, 0.72);
                        color: #ecfdf5;
                    }
                    .study-drill__option--wrong {
                        background: rgba(239, 68, 68, 0.2);
                        border-color: rgba(248, 113, 113, 0.72);
                        color: #fef2f2;
                    }
                    .study-drill__subcopy {
                        margin: 0;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #bdd0e2;
                    }
                    .study-card {
                        display: flex;
                        flex-direction: column;
                        gap: 14px;
                        padding: 18px;
                        border-radius: 12px;
                        background: linear-gradient(180deg, rgba(13, 21, 36, 0.96), rgba(7, 11, 20, 0.98));
                        border: 1px solid rgba(130, 174, 232, 0.32);
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 8px 24px rgba(0, 0, 0, 0.45);
                    }
                    .study-card__meta {
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        gap: 8px;
                    }
                    .study-badge {
                        display: inline-flex;
                        align-items: center;
                        padding: 4px 10px;
                        border-radius: 999px;
                        font-size: 12px;
                        font-weight: 700;
                        letter-spacing: 0.03em;
                    }
                    .study-badge--category {
                        background: rgba(56, 152, 255, 0.18);
                        border: 1px solid rgba(90, 176, 255, 0.42);
                        color: #9ad2ff;
                    }
                    .study-badge--srs {
                        background: rgba(134, 218, 255, 0.14);
                        border: 1px solid rgba(134, 218, 255, 0.38);
                        color: #cfefff;
                    }
                    .study-badge--zero-reward {
                        background: rgba(12, 85, 192, 0.32);
                        border: 1px solid rgba(134, 218, 255, 0.58);
                        color: #f2f7ff;
                    }
                    .study-badge--easy {
                        background: rgba(46, 204, 113, 0.16);
                        border: 1px solid rgba(46, 204, 113, 0.4);
                        color: #82f0ae;
                    }
                    .study-badge--medium {
                        background: rgba(134, 218, 255, 0.16);
                        border: 1px solid rgba(134, 218, 255, 0.42);
                        color: #86daff;
                    }
                    .study-badge--hard {
                        background: rgba(239, 98, 98, 0.18);
                        border: 1px solid rgba(239, 98, 98, 0.42);
                        color: #ff9c9c;
                    }
                    .study-card__counter {
                        margin-left: auto;
                        font-size: 12px;
                        font-weight: 600;
                        color: rgba(214, 228, 248, 0.8);
                    }
                    .study-card__submeta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 14px;
                        font-size: 12px;
                        color: rgba(192, 210, 236, 0.72);
                    }
                    .study-card__question {
                        margin: 0;
                        font-size: 18px;
                        line-height: 1.45;
                        color: #f4f8ff;
                    }
                    .study-options {
                        list-style: none;
                        margin: 0;
                        padding: 0;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .study-option {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 11px 12px;
                        border-radius: 8px;
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(164, 196, 236, 0.18);
                        color: #e6effc;
                        font-size: 14px;
                    }
                    .study-option--correct {
                        background: rgba(34, 197, 94, 0.18);
                        border-color: rgba(74, 222, 128, 0.65);
                        color: #ecfdf5;
                    }
                    .study-option__letter {
                        width: 24px;
                        height: 24px;
                        flex-shrink: 0;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        background: rgba(255, 255, 255, 0.09);
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .study-option__text {
                        flex: 1;
                        line-height: 1.4;
                    }
                    .study-option__tag {
                        font-size: 12px;
                        font-weight: 700;
                        color: #86efac;
                    }
                    .study-option__tag--wrong {
                        color: #fecaca;
                    }
                    .study-explanation {
                        padding: 12px 14px;
                        border-radius: 8px;
                        background: rgba(22, 101, 52, 0.22);
                        border: 1px solid rgba(74, 222, 128, 0.36);
                    }
                    .study-explanation__heading {
                        margin: 0 0 6px 0;
                        font-size: 13px;
                        font-weight: 700;
                        color: #86efac;
                        letter-spacing: 0.04em;
                    }
                    .study-explanation__body {
                        margin: 0;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #eaf5ee;
                    }
                    .study-card__actions {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                    .study-btn {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 44px;
                        padding: 10px 14px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 700;
                        text-decoration: none;
                        cursor: pointer;
                        border: 1px solid rgba(154, 194, 242, 0.36);
                        background: rgba(30, 48, 78, 0.88);
                        color: #f3f8ff;
                        touch-action: manipulation;
                    }
                    .study-btn--drill-cta {
                        background: linear-gradient(180deg, #1981ec, #0c55c0);
                        border-color: #86daff;
                        color: #f2f7ff;
                    }
                    .study-btn--drill-cta:disabled {
                        opacity: 0.55;
                        cursor: not-allowed;
                    }
                    .study-btn--flip {
                        background: linear-gradient(180deg, #2563eb, #1d4ed8);
                        border-color: rgba(147, 197, 253, 0.55);
                    }
                    .study-btn--gotit {
                        background: rgba(20, 42, 34, 0.9);
                        border-color: rgba(74, 222, 128, 0.45);
                        color: #b7f7cd;
                    }
                    .study-btn--mastered {
                        background: rgba(22, 163, 74, 0.28);
                        border-color: rgba(134, 239, 172, 0.72);
                        color: #dcfce7;
                    }
                    .study-btn--train {
                        background: linear-gradient(180deg, #1981ec, #0c55c0);
                        border-color: rgba(134, 218, 255, 0.58);
                        color: #f2f7ff;
                    }
                    .study-card__specialty {
                        margin: 0;
                        font-size: 12px;
                        color: #86daff;
                    }
                    .study-nav {
                        display: flex;
                        justify-content: space-between;
                        gap: 12px;
                        padding-top: 8px;
                        border-top: 1px solid rgba(148, 184, 230, 0.18);
                    }
                    .study-nav__btn {
                        flex: 1;
                        min-height: 44px;
                        padding: 10px 12px;
                        border-radius: 8px;
                        background: rgba(255, 255, 255, 0.06);
                        border: 1px solid rgba(148, 184, 230, 0.26);
                        color: #e4eefc;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    .study-empty-actions {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: center;
                        gap: 10px;
                    }
                    .study-inline-btn {
                        margin-top: 10px;
                        min-height: 44px;
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .study-mode-tab {
                            transition: none;
                        }
                        .study-mode-tab:active {
                            transform: none;
                        }
                    }
                `}</style>
            </>
        </TriviaErrorBoundary>
    );
}
