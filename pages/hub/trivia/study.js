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
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

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
    const [items, setItems] = useState([]);
    const [categoryCounts, setCategoryCounts] = useState({});
    const [totalMissed, setTotalMissed] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [masteredIds, setMasteredIds] = useState([]);
    const [hideMastered, setHideMastered] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

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
            setLoadError('');
            setIsLoading(false);
            return () => { stopped = true; };
        }
        setUserId(resolved.id);
        loadDeck(categoryFilter, cancelled);
        return () => { stopped = true; };
    }, [avatarLoading, avatarUser?.id, categoryFilter, loadDeck, reloadKey]);

    const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
    const visibleItems = useMemo(() => {
        if (!hideMastered) return items;
        return items.filter((card) => !masteredSet.has(card.questionId));
    }, [hideMastered, items, masteredSet]);

    const safeIndex = visibleItems.length > 0 ? Math.min(currentIndex, visibleItems.length - 1) : 0;
    const activeCard = visibleItems[safeIndex] || null;
    const activeSpot = activeCard
        ? (activeCard.trainingSpot || getTrainingSpotForCategory(activeCard.category))
        : null;
    const isCardMastered = activeCard ? masteredSet.has(activeCard.questionId) : false;

    const sessionMasteredInDeck = useMemo(
        () => items.filter((card) => masteredSet.has(card.questionId)).length,
        [items, masteredSet],
    );

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

    const handleToggleGotIt = () => {
        if (!activeCard) return;
        const qid = activeCard.questionId;
        setMasteredIds((prev) => (
            prev.includes(qid) ? prev.filter((id) => id !== qid) : [...prev, qid]
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
                                subtitle="Interactive Flashcard Deck"
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
                                ) : (
                                    <div className="study-deck-wrap">
                                        <p className="study-deck-note">
                                            Practice Review Deck. No Diamonds Are Wagered Or Awarded.
                                        </p>

                                        <div className="study-session-bar" role="status" aria-live="polite">
                                            <span className="study-session-bar__count">
                                                Session Mastery: {formatTriviaDisplayNumber(sessionMasteredInDeck)} Of {formatTriviaDisplayNumber(items.length)} Got It
                                            </span>
                                            <label className="study-session-bar__toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={hideMastered}
                                                    onChange={(e) => {
                                                        setHideMastered(e.target.checked);
                                                        setCurrentIndex(0);
                                                        setIsFlipped(false);
                                                    }}
                                                />
                                                <span>Hide Mastered</span>
                                            </label>
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
                                                    Every Card In This Study Session Is Marked Got It.
                                                </p>
                                                <button
                                                    type="button"
                                                    className="tc-word study-inline-btn"
                                                    onClick={() => setHideMastered(false)}
                                                >
                                                    Show All Cards Again
                                                </button>
                                            </section>
                                        ) : activeCard ? (
                                            <article className="study-card" aria-label="Missed Question Flashcard">
                                                <header className="study-card__meta">
                                                    <span className="study-badge study-badge--category">{activeCard.categoryLabel}</span>
                                                    <span className={`study-badge study-badge--${activeCard.difficulty}`}>
                                                        {formatDifficulty(activeCard.difficulty)}
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
                        gap: 8px;
                        font-size: 13px;
                        color: #dbe8fa;
                        cursor: pointer;
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
                    .study-inline-btn {
                        margin-top: 10px;
                    }
                `}</style>
            </>
        </TriviaErrorBoundary>
    );
}
