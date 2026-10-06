import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART } from '../../../src/config/triviaIntroArt.mjs';
import { supabase } from '../../../src/lib/supabase';
import { authedFetch } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import useHasMounted from '../../../src/hooks/useHasMounted';
import useOnlineStatus from '../../../src/hooks/useOnlineStatus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
    TRIVIA_PERIOD_FILTERS,
    TRIVIA_SCORE_MODES,
    filterTriviaScores,
    paginateRankedScores,
    rankComparableTriviaScores,
    triviaPeriodStart,
    triviaModeLabel,
} from '../../../src/lib/trivia/progressAccount.mjs';

const PAGE_SIZE = 20;
const SCORE_PAGE_SIZE = 1000;
const SCORE_PAGE_LIMIT = 20;
const SOLO_BOARD = 'solo';
const TOURNAMENT_BOARD = 'tournament';

function titleName(name) {
    return String(name || '').replace(/(^|[\s_.-])(\p{Ll})/gu, (match, lead, letter) => lead + letter.toUpperCase());
}

function rankLabel(rank) {
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `#${formatTriviaDisplayNumber(rank)}`;
}

function rankTier(rank) {
    if (rank === 1) return 'first';
    if (rank === 2) return 'second';
    if (rank === 3) return 'third';
    return 'ranked';
}

async function fetchComparableScores(mode, period, today) {
    const rows = [];
    let partial = false;
    for (let page = 0; page < SCORE_PAGE_LIMIT; page += 1) {
        const from = page * SCORE_PAGE_SIZE;
        let query = supabase
            .from('trivia_scores')
            .select('id, user_id, username, mode, score, correct_count, total_questions, play_date, server_verified')
            .eq('server_verified', true)
            .eq('mode', mode)
            .order('score', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + SCORE_PAGE_SIZE - 1);
        const periodStart = triviaPeriodStart(period, today);
        if (periodStart) query = query.gte('play_date', periodStart);
        const { data, error } = await query;
        if (error) {
            if (page === 0) throw error;
            partial = true;
            break;
        }
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < SCORE_PAGE_SIZE) break;
        if (page === SCORE_PAGE_LIMIT - 1) partial = true;
    }
    return { rows, partial };
}

async function readJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
        const error = new Error(body?.error || `request_failed_${response.status}`);
        error.status = response.status;
        throw error;
    }
    return body;
}

function latestResultsEvent(instances) {
    const list = Array.isArray(instances) ? instances : [];
    const byNewest = (left, right) => Date.parse(right?.startsAt || 0) - Date.parse(left?.startsAt || 0);
    return [...list].filter((event) => event?.state === 'settled').sort(byNewest)[0]
        || [...list].filter((event) => ['settling', 'live'].includes(event?.state)).sort(byNewest)[0]
        || [...list].sort(byNewest)[0]
        || null;
}

function formatEventDate(event) {
    if (event?.localDate) return event.localDate;
    const date = new Date(event?.startsAt || '');
    if (!Number.isFinite(date.getTime())) return 'Event Date Not Available';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    }).format(date);
}

function tournamentPayoutLabel(entry, settled) {
    if (!settled) return 'Pending Settlement';
    if (entry?.payout === null || entry?.payout === undefined || !Number.isFinite(Number(entry.payout))) {
        return 'Not Available';
    }
    return `${formatTriviaDisplayNumber(Math.max(0, Number(entry.payout)))} Diamonds`;
}

function SoloRankDock({ currentUserId, ranked, partial, onSignIn }) {
    if (!currentUserId) {
        return (
            <aside className="trivia-progress-rank-dock" aria-labelledby="trivia-your-rank">
                <h2 id="trivia-your-rank" className="trivia-progress-heading">Your Rank</h2>
                <p>Sign In To Pin Your Verified Rank.</p>
                <button type="button" className="tc-word" onClick={onSignIn}>Sign In</button>
            </aside>
        );
    }
    const player = ranked.find((entry) => entry.user_id === currentUserId);
    return (
        <aside className="trivia-progress-rank-dock" aria-labelledby="trivia-your-rank">
            <h2 id="trivia-your-rank" className="trivia-progress-heading">Your Rank</h2>
            {player ? (
                <ul className="tc-rows" aria-label="Your Comparable Rank">
                    <li className="tc-row"><span className="tc-row__label">Rank</span><span className="tc-row__value tc-ink--blue">{rankLabel(player.rank)}</span></li>
                    <li className="tc-row"><span className="tc-row__label">Score</span><span className="tc-row__value">{formatTriviaDisplayNumber(player.score)}</span></li>
                    <li className="tc-row"><span className="tc-row__label">Accuracy</span><span className="tc-row__value">{player.accuracy === null ? 'Not Available' : `${player.accuracy}%`}</span></li>
                </ul>
            ) : (
                <p>{partial ? 'Your Rank Is Outside The Current Verified Read Window.' : 'No Verified Score In This Board Yet.'}</p>
            )}
        </aside>
    );
}

function Pager({ page, pageCount, total, label, onPage }) {
    return (
        <nav className="trivia-progress-pager" aria-label={label}>
            <button type="button" className="tc-word" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
            <span>Page {formatTriviaDisplayNumber(page)} Of {formatTriviaDisplayNumber(pageCount)} · {formatTriviaDisplayNumber(total)} Entrants</span>
            <button type="button" className="tc-word" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</button>
        </nav>
    );
}

export default function TriviaLeaderboard() {
    useTrainingBus('trivia-leaderboard');
    const router = useRouter();
    const hasMounted = useHasMounted();
    const online = useOnlineStatus();
    const { user, loading: authLoading } = useAvatar();
    const [board, setBoard] = usePersistedState('sp-filters-trivia-leaderboard-board', SOLO_BOARD);
    const [period, setPeriod] = usePersistedState('sp-filters-trivia-leaderboard-period', 'all');
    const [mode, setMode] = usePersistedState('sp-filters-trivia-leaderboard-mode-v2', 'daily');
    const [entrantScope, setEntrantScope] = usePersistedState('sp-filters-trivia-leaderboard-entrants', 'human');
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [tournament, setTournament] = useState(null);
    const [tournamentSettled, setTournamentSettled] = useState(false);
    const [tournamentTotal, setTournamentTotal] = useState(0);
    const [partial, setPartial] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [loadedAt, setLoadedAt] = useState(null);
    const [connectionState, setConnectionState] = useState('connecting');
    const [reloadKey, setReloadKey] = useState(0);
    const lastTournamentQuery = useRef('');

    const validBoard = board === TOURNAMENT_BOARD ? TOURNAMENT_BOARD : SOLO_BOARD;
    const validMode = TRIVIA_SCORE_MODES.some((option) => option.id === mode) ? mode : 'daily';
    const validPeriod = TRIVIA_PERIOD_FILTERS.some((option) => option.id === period) ? period : 'all';
    const validScope = entrantScope === 'all' ? 'all' : 'human';
    const currentUserId = user?.id || null;
    const requestPage = validBoard === TOURNAMENT_BOARD ? page : 1;

    useEffect(() => { setPage(1); }, [validBoard, validMode, validPeriod, validScope]);

    useEffect(() => {
        let cancelled = false;
        let channel = null;
        const tournamentQuery = `${validScope}:${requestPage}`;

        if (validBoard === TOURNAMENT_BOARD && !online) {
            setIsLoading(false);
            if (lastTournamentQuery.current === tournamentQuery) setLoadError('');
            else setLoadError('You Are Offline. Official Results Need A Live Server Read.');
            return () => { cancelled = true; };
        }

        async function loadSolo() {
            const today = getTodayCST();
            const result = await fetchComparableScores(validMode, validPeriod, today);
            if (cancelled) return;
            const filtered = filterTriviaScores(result.rows, {
                mode: validMode,
                period: validPeriod,
                today,
            });
            setRows(rankComparableTriviaScores(filtered));
            setPartial(result.partial);
            setTournament(null);
            setTournamentSettled(false);
            setTournamentTotal(0);
            setLoadedAt(new Date());
        }

        async function loadTournament() {
            if (!online) throw new Error('offline');
            const schedule = await readJson(await authedFetch('/api/trivia/nightly/schedule?days=14'));
            const event = latestResultsEvent(schedule.instances);
            if (!event?.tournamentId) {
                if (!cancelled) {
                    setRows([]);
                    setTournament(null);
                    setTournamentSettled(false);
                    setTournamentTotal(0);
                    setLoadedAt(new Date());
                }
                return;
            }
            const offset = (requestPage - 1) * PAGE_SIZE;
            const kind = validScope === 'human' ? '&kind=human' : '';
            const url = `/api/trivia/nightly/results?tournamentId=${encodeURIComponent(event.tournamentId)}&offset=${offset}&limit=${PAGE_SIZE}${kind}`;
            const results = await readJson(await authedFetch(url));
            if (cancelled) return;
            setRows(Array.isArray(results.items) ? results.items : []);
            setTournament(event);
            setTournamentSettled(results.settled === true);
            setTournamentTotal(Math.max(0, Number(results.total) || 0));
            setPartial(false);
            setLoadedAt(new Date());
            lastTournamentQuery.current = tournamentQuery;
        }

        async function load() {
            setIsLoading(true);
            setLoadError('');
            try {
                if (validBoard === SOLO_BOARD) await loadSolo();
                else await loadTournament();
            } catch (error) {
                console.warn('[TriviaLeaderboard] Load failed:', error?.message || error);
                if (!cancelled) {
                    if (error?.message === 'offline') setLoadError('You Are Offline. Official Results Need A Live Server Read.');
                    else if (error?.status === 503) setLoadError('Official Nightly Results Are Not Available Right Now.');
                    else setLoadError('We Could Not Load This Leaderboard Right Now. Please Try Again.');
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        load();
        if (validBoard === SOLO_BOARD) {
            channel = supabase
                .channel(`trivia-leaderboard:${validMode}:${validPeriod}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores' }, load)
                .subscribe((status) => {
                    if (cancelled) return;
                    if (status === 'SUBSCRIBED') setConnectionState('live');
                    else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setConnectionState('stale');
                    else setConnectionState('connecting');
                });
        }
        return () => {
            cancelled = true;
            if (channel) supabase.removeChannel(channel);
        };
    }, [online, reloadKey, requestPage, validBoard, validMode, validPeriod, validScope]);

    const soloPage = useMemo(
        () => paginateRankedScores(validBoard === SOLO_BOARD ? rows : [], page, PAGE_SIZE),
        [page, rows, validBoard],
    );
    const tournamentPageCount = Math.max(1, Math.ceil(tournamentTotal / PAGE_SIZE));
    const pageRows = validBoard === SOLO_BOARD ? soloPage.items : rows;
    const pageCount = validBoard === SOLO_BOARD ? soloPage.pageCount : tournamentPageCount;
    const total = validBoard === SOLO_BOARD ? soloPage.total : tournamentTotal;
    const stale = !loadError && (!online || (validBoard === SOLO_BOARD && connectionState === 'stale'));
    const periodLabel = TRIVIA_PERIOD_FILTERS.find((option) => option.id === validPeriod)?.label || 'All Time';

    const retry = () => {
        setIsLoading(true);
        setReloadKey((key) => key + 1);
    };

    return (
        <TriviaErrorBoundary pageName="Leaderboard">
            <>
                <SEOHead
                    title="Trivia Leaderboard - Comparable Rankings"
                    description="Compare Verified Poker Trivia Scores By Mode, Follow Your Rank, Or Review Official Nightly Tournament Results Across Comparable Boards."
                    canonical="/hub/trivia/leaderboard"
                />
                <PageTransition>
                    <div className="trivia-progress-page trivia-progress-page--leaderboard" data-trivia-family="progress" data-trivia-surface="leaderboard">
                        <UniversalHeader pageDepth={2} />
                        <main className="trivia-progress-shell" aria-labelledby="trivia-leaderboard-title">
                            <TriviaConsole
                                as="section"
                                eyebrow="Player Progress"
                                title="Trivia Leaderboard"
                                titleAs="h1"
                                titleId="trivia-leaderboard-title"
                                subtitle={validBoard === SOLO_BOARD ? `${triviaModeLabel(validMode)} · ${periodLabel}` : 'Official Nightly Results'}
                                pill={isLoading ? 'Loading' : loadError ? 'Error' : `${formatTriviaDisplayNumber(total)} Entrants`}
                                pillInk={loadError ? 'red' : total > 0 ? 'green' : 'blue'}
                                className="trivia-progress-console"
                                secondaryAction={{ label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }}
                                primaryAction={!isLoading && loadError ? { label: 'Retry', onClick: retry } : undefined}
                            >
                                <ResponsiveModeArt art={TRIVIA_INTRO_ART.leaderboard} priority />
                                <div className="trivia-progress-content trivia-progress-content--leaderboard">
                                    <fieldset className="trivia-progress-filter trivia-progress-filter--board">
                                        <legend className="tc-label">Leaderboard</legend>
                                        <div className="trivia-progress-filter__options">
                                            <button type="button" className="tc-word trivia-progress-filter__option" aria-pressed={validBoard === SOLO_BOARD} onClick={() => setBoard(SOLO_BOARD)}>Solo Scores</button>
                                            <button type="button" className="tc-word trivia-progress-filter__option" aria-pressed={validBoard === TOURNAMENT_BOARD} onClick={() => setBoard(TOURNAMENT_BOARD)}>Nightly Results</button>
                                        </div>
                                    </fieldset>

                                    {validBoard === SOLO_BOARD ? (
                                        <div className="trivia-progress-filter-bank">
                                            <fieldset className="trivia-progress-filter trivia-progress-filter--period">
                                                <legend className="tc-label">Ranking Period</legend>
                                                <div className="trivia-progress-filter__options">
                                                    {TRIVIA_PERIOD_FILTERS.map((option) => <button type="button" className="tc-word trivia-progress-filter__option" key={option.id} aria-pressed={validPeriod === option.id} onClick={() => setPeriod(option.id)}>{option.label}</button>)}
                                                </div>
                                            </fieldset>
                                            <fieldset className="trivia-progress-filter trivia-progress-filter--mode">
                                                <legend className="tc-label">Comparable Game Mode</legend>
                                                <div className="trivia-progress-filter__options">
                                                    {TRIVIA_SCORE_MODES.map((option) => <button type="button" className="tc-word trivia-progress-filter__option" key={option.id} aria-pressed={validMode === option.id} onClick={() => setMode(option.id)}>{option.label}</button>)}
                                                </div>
                                            </fieldset>
                                        </div>
                                    ) : (
                                        <fieldset className="trivia-progress-filter trivia-progress-filter--entrants">
                                            <legend className="tc-label">Entrants</legend>
                                            <div className="trivia-progress-filter__options">
                                                <button type="button" className="tc-word trivia-progress-filter__option" aria-pressed={validScope === 'human'} onClick={() => setEntrantScope('human')}>Humans</button>
                                                <button type="button" className="tc-word trivia-progress-filter__option" aria-pressed={validScope === 'all'} onClick={() => setEntrantScope('all')}>All Entrants</button>
                                            </div>
                                        </fieldset>
                                    )}

                                    {stale ? <section className="trivia-progress-notice trivia-progress-notice--warning" role="status"><p>{online ? 'Live Updates Paused. The Last Verified Board Remains Visible.' : 'Offline. The Last Verified Board Remains Visible.'}</p></section> : null}
                                    {partial ? <section className="trivia-progress-notice trivia-progress-notice--warning" role="status"><p>Partial Board: Some Verified Runs Are Outside The Current Read Window.</p></section> : null}
                                    {validBoard === SOLO_BOARD ? <p className="trivia-progress-intro">One Best Verified {triviaModeLabel(validMode)} Run Per Entrant. Equal Scores Share A Rank, And The Next Rank Skips.</p> : null}
                                    {validBoard === TOURNAMENT_BOARD && tournament ? <p className="trivia-progress-intro">{tournament.name || 'Nightly Trivia Tournament'} · {formatEventDate(tournament)} · {validScope === 'human' ? 'Humans Only' : 'Humans And Smarter Horses'}</p> : null}

                                    <div className="trivia-progress-leaderboard-grid">
                                        {validBoard === SOLO_BOARD ? <SoloRankDock currentUserId={currentUserId} ranked={rows} partial={partial} onSignIn={() => router.push('/auth/login?redirect=/hub/trivia/leaderboard')} /> : null}
                                        <section className="trivia-progress-board" aria-labelledby="trivia-board-heading">
                                            <h2 id="trivia-board-heading" className="trivia-progress-heading">{validBoard === SOLO_BOARD ? 'Verified Rankings' : 'Official Results'}</h2>
                                            {!hasMounted || authLoading || isLoading ? (
                                                <p className="trivia-progress-state trivia-progress-state--loading" role="status">Loading Leaderboard</p>
                                            ) : loadError ? (
                                                <section className="trivia-progress-state trivia-progress-state--error" role="alert"><p>{loadError}</p></section>
                                            ) : pageRows.length === 0 ? (
                                                <section className="trivia-progress-state trivia-progress-state--empty"><p>{validBoard === SOLO_BOARD ? `No Verified ${triviaModeLabel(validMode)} Scores Match This Period Yet.` : tournament ? 'Official Results Have Not Posted For This Event Yet.' : 'No Nightly Event Is Available In The Official Schedule Window.'}</p></section>
                                            ) : (
                                                <>
                                                    <div className="trivia-progress-table-wrap" tabIndex="0" role="region" aria-label="Paged Trivia Leaderboard">
                                                        <table className="trivia-progress-table trivia-progress-table--board">
                                                            <caption>{validBoard === SOLO_BOARD ? `${triviaModeLabel(validMode)} Verified Rankings` : 'Official Nightly Tournament Results'}</caption>
                                                            <thead><tr><th scope="col">Rank</th><th scope="col">Player</th>{validBoard === TOURNAMENT_BOARD ? <th scope="col">Entrant</th> : null}<th scope="col" className="trivia-progress-table__num">Score</th><th scope="col" className="trivia-progress-table__num">{validBoard === SOLO_BOARD ? 'Accuracy' : 'Payout'}</th></tr></thead>
                                                            <tbody>
                                                                {pageRows.map((entry, index) => {
                                                                    const isCurrent = validBoard === SOLO_BOARD && entry.user_id === currentUserId;
                                                                    return (
                                                                        <tr key={`${entry.identity || entry.displayName}-${entry.rank}-${index}`} data-rank-tier={rankTier(entry.rank)} data-current-player={isCurrent ? 'true' : 'false'}>
                                                                            <td className="trivia-progress-table__rank" data-label="Rank">{rankLabel(entry.rank)}</td>
                                                                            <th className="trivia-progress-table__player" scope="row" data-label="Player"><span>{titleName(entry.displayName)}{isCurrent ? <span className="trivia-progress-table__you">You</span> : null}</span></th>
                                                                            {validBoard === TOURNAMENT_BOARD ? <td className="trivia-progress-table__entrant" data-label="Entrant">{entry.participantKind === 'horse' ? 'Smarter Horse' : 'Human'}</td> : null}
                                                                            <td className="trivia-progress-table__score trivia-progress-table__num" data-label="Score">{formatTriviaDisplayNumber(entry.score)}</td>
                                                                            <td className="trivia-progress-table__accuracy trivia-progress-table__num" data-label={validBoard === SOLO_BOARD ? 'Accuracy' : 'Payout'}>{validBoard === SOLO_BOARD ? (entry.accuracy === null ? 'Not Available' : `${entry.accuracy}%`) : tournamentPayoutLabel(entry, tournamentSettled)}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <Pager page={validBoard === SOLO_BOARD ? soloPage.page : page} pageCount={pageCount} total={total} label={validBoard === SOLO_BOARD ? 'Verified Ranking Pages' : 'Official Result Pages'} onPage={setPage} />
                                                </>
                                            )}
                                        </section>
                                    </div>
                                    {loadedAt ? <p className="trivia-progress-read-time">Last Server Read {loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p> : null}
                                </div>
                            </TriviaConsole>
                        </main>
                    </div>
                </PageTransition>
                <HubPageSummary page="trivia-leaderboard" />
            </>
        </TriviaErrorBoundary>
    );
}
