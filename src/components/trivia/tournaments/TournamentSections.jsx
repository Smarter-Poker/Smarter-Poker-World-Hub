import { useMemo, useRef } from 'react';
import TriviaAnswerOption from '../TriviaAnswerOption';
import { TriviaGlassAction } from '../console/TriviaConsole';
import { toTitleCase } from '../../../lib/trivia/titleCase';
import {
    TOURNAMENT_TABS,
    currentPathMatchupIds,
    exactDiamonds,
    formatCountdown,
    participantLabel,
    registrationAction,
    secondsUntil,
    sessionProgress,
    tournamentViewState,
} from './tournamentModel.mjs';

export { exactDiamonds } from './tournamentModel.mjs';

function safeDate(value) {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalTime(value) {
    const date = safeDate(value);
    if (!date) return 'Awaiting Schedule';
    return date.toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
}

function formatOfficialStart(tournament) {
    if (!tournament) return 'Awaiting Schedule';
    const raw = String(tournament.localStartTime || '20:00');
    const [hourText, minuteText] = raw.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText) || 0;
    if (!Number.isFinite(hour)) return `${tournament.localDate || ''} 8:00 PM CT`.trim();
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const clock = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
    return `${tournament.localDate || ''} ${clock} CT`.trim();
}

function stateLabel(state) {
    return ({
        'no-event': 'No Event',
        'not-open': 'Registration Not Open',
        open: 'Registration Open',
        full: 'Human Field Full',
        closed: 'Registration Closed',
        entered: 'Entered',
        countdown: 'Round Countdown',
        play: 'Ready To Play',
        playing: 'Playing',
        waiting: 'Waiting',
        advance: 'Advanced',
        eliminated: 'Eliminated',
        champion: 'Champion',
        cancelled: 'Cancelled',
        refund: 'Refund Pending',
        refunded: 'Refunded',
        settling: 'Settling',
        settled: 'Settled',
        paid: 'Paid',
    })[state] || toTitleCase(String(state || 'Scheduled').replace(/_/g, ' '));
}

function valueInk(state) {
    if (['open', 'entered', 'advance', 'champion', 'paid', 'refunded'].includes(state)) return 'green';
    if (['cancelled', 'refund', 'eliminated'].includes(state)) return 'red';
    if (['countdown', 'settling', 'waiting'].includes(state)) return 'gold';
    return 'blue';
}

export function TournamentRows({ rows, label }) {
    const list = (rows || []).filter(row => row && row.value !== undefined && row.value !== null && row.value !== '');
    if (list.length === 0) return null;
    return (
        <ul className="tc-rows" aria-label={label}>
            {list.map((row, index) => (
                <li key={`${row.label}-${index}`} className={row.wrap ? 'tc-row tt-row--wrap' : 'tc-row'}>
                    <span className="tc-row__label">{row.label}</span>
                    <span
                        className={`tc-row__value${row.ink ? ` tc-ink--${row.ink}` : ''}`}
                        data-preserve-case={row.preserveCase ? 'true' : undefined}
                    >
                        {row.value}
                    </span>
                </li>
            ))}
        </ul>
    );
}

export function TournamentStateBanner({ title, message, tone = 'blue', role = 'status', action }) {
    return (
        <div className="tt-state" role={role}>
            <strong className={`tt-state__title tc-ink--${tone}`}>{title}</strong>
            {message ? <p>{message}</p> : null}
            {action ? <TriviaGlassAction {...action} /> : null}
        </div>
    );
}

export function TournamentTabs({ value, onChange, disabled = [] }) {
    return (
        <nav className="tt-tabs" aria-label="Nightly Tournament Views">
            {TOURNAMENT_TABS.map(tab => (
                <button
                    key={tab.id}
                    type="button"
                    className="tc-word"
                    aria-pressed={value === tab.id}
                    disabled={disabled.includes(tab.id)}
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
}

export function TournamentEventLedger({ tournament, summary, nowMs, onReminder }) {
    if (!tournament) {
        return (
            <section className="tt-ledger tt-section" aria-labelledby="tt-ledger-title">
                <h2 id="tt-ledger-title" className="tc-label">Event Ledger</h2>
                <TournamentStateBanner title="No Nightly Event" message="The Server Has Not Published A Nightly Tournament In This Schedule Window." tone="muted" />
            </section>
        );
    }
    const format = tournament.format || {};
    const startsIn = secondsUntil(tournament.startsAt, nowMs);
    const closesIn = secondsUntil(tournament.registrationClosesAt, nowMs);
    const transition = Array.isArray(format.transitionSeconds) ? format.transitionSeconds.filter(Number.isFinite) : [];
    const rulesState = tournamentViewState({ tournament, nowMs });
    return (
        <section className="tt-ledger tt-section" aria-labelledby="tt-ledger-title">
            <h2 id="tt-ledger-title" className="tc-label">Event Ledger</h2>
            <p className={`tt-ledger__state tc-ink--${valueInk(rulesState)}`}>{stateLabel(rulesState)}</p>
            <TournamentRows
                label="Nightly Tournament Terms"
                rows={[
                    { label: 'Official Start', value: formatOfficialStart(tournament), wrap: true },
                    { label: 'Your Local Time', value: formatLocalTime(tournament.startsAt), wrap: true },
                    closesIn !== null && rulesState === 'open' ? { label: 'Registration Closes In', value: formatCountdown(closesIn), ink: 'gold' } : null,
                    startsIn !== null && startsIn > 0 ? { label: 'Starts In', value: formatCountdown(startsIn), ink: 'gold' } : null,
                    { label: 'Entry', value: `${exactDiamonds(tournament.entryFee)} Diamonds` },
                    { label: 'Rake', value: `${exactDiamonds(tournament.rakePerEntry)} Diamond${Number(tournament.rakePerEntry) === 1 ? '' : 's'}` },
                    { label: 'Estimated Prize Pool', value: `${exactDiamonds(tournament.estimatedPrizePool)} Diamonds`, ink: 'gold' },
                    { label: 'Human Field', value: exactDiamonds(tournament.humansEntered) },
                    { label: 'Smarter Horses', value: `${exactDiamonds(tournament.horsesEntered)} / ${exactDiamonds(tournament.horseTarget)}`, ink: 'blue' },
                    { label: 'Capacity', value: exactDiamonds(tournament.bracketCapacity) },
                    { label: 'Rules', value: tournament.rulesVersionId, wrap: true, preserveCase: true },
                    { label: 'Questions Per Round', value: exactDiamonds(format.questionsPerRound) },
                    { label: 'Server Shot Clock', value: Number.isFinite(format.shotClockSeconds) ? `${format.shotClockSeconds} Seconds` : null },
                    { label: 'Server Round Window', value: Number.isFinite(format.roundWindowSeconds) ? `${Math.trunc(format.roundWindowSeconds / 60)} Minutes` : null },
                    { label: 'Round Transition', value: transition.length > 1 ? `${transition[0]} To ${transition[transition.length - 1]} Seconds` : transition.length ? `${transition[0]} Seconds` : null },
                    summary?.field ? { label: 'Byes', value: exactDiamonds(summary.field.byes) } : null,
                ]}
            />
            {onReminder ? (
                <div className="tt-actions">
                    <TriviaGlassAction label="Add Calendar Reminder" onClick={onReminder} />
                </div>
            ) : null}
            <details className="tt-rules">
                <summary>How The Bracket Decides</summary>
                <p>More Correct Answers, Then Lower Total Answer Time, Then Earlier Completion, Then Better Seed.</p>
                <p>No-Shows Score Zero With Maximum Time. A Double No-Show Advances The Better Seed.</p>
                <p>Byes Go To The Top Seeds. Every Smarter Horse Is Labeled.</p>
            </details>
        </section>
    );
}

function RunHistory({ history }) {
    if (!Array.isArray(history) || history.length === 0) return null;
    return (
        <ol className="tt-run-history" aria-label="Your Completed Tournament Rounds">
            {history.map(item => (
                <li key={item.matchupId || item.roundNumber}>
                    <span>Round {item.roundNumber}</span>
                    <strong className={item.result === 'lost' ? 'tc-ink--red' : 'tc-ink--green'}>{toTitleCase(item.result)}</strong>
                    <span>{participantLabel(item.opponent, item.result === 'bye' ? 'Bye' : 'Opponent')}</span>
                </li>
            ))}
        </ol>
    );
}

export function TournamentMyRun({ tournament, myRun, receipt, currentMatch, nowMs, signedIn, pending, onEnter, onSignIn, onPlay, onResume }) {
    const viewState = tournamentViewState({ tournament, myRun, receipt, nowMs });
    const action = registrationAction(tournament, myRun, nowMs);
    const entered = Boolean(myRun?.entered || tournament?.viewer?.entered);
    const current = myRun?.current;
    const deadline = current?.deadlineAt ? secondsUntil(current.deadlineAt, nowMs) : null;
    const opens = current?.opensAt ? secondsUntil(current.opensAt, nowMs) : null;
    const opponent = current?.opponent;
    const canPlay = current?.phase === 'playing';
    const currentMatchup = currentMatch?.matchup;
    return (
        <section className="tt-run tt-section" aria-labelledby="tt-run-title" data-view-state={viewState}>
            <h2 id="tt-run-title" className="tc-label">My Run</h2>
            {!signedIn ? (
                <TournamentStateBanner title="Sign In To Enter" message="Your Entry, Run, Settlement, And Receipt Stay Bound To Your Account." action={{ label: 'Sign In', onClick: onSignIn }} />
            ) : !entered ? (
                <>
                    <TournamentStateBanner
                        title={stateLabel(viewState)}
                        message={viewState === 'open' ? 'One Server Entry Hold Covers This Event. Repeating The Same Entry Request Never Charges Again.' : 'Your Account Has No Entry In This Event.'}
                        tone={valueInk(viewState)}
                    />
                    {action?.kind === 'enter' ? <TriviaGlassAction label={pending === 'enter' ? 'Entering' : action.label} disabled={Boolean(pending)} onClick={onEnter} /> : action ? <p className="tt-run__action-state tc-ink--muted">{action.label}</p> : null}
                </>
            ) : !myRun?.entered ? (
                <TournamentStateBanner
                    title="Run Refresh Delayed"
                    message="Your Entry Is Confirmed. The Tournament Desk Is Reconnecting To Your Server-Owned Run; No New Entry Can Be Created From This State."
                    tone="gold"
                />
            ) : (
                <>
                    <p className={`tt-run__state tc-ink--${valueInk(viewState)}`}>{stateLabel(viewState)}</p>
                    <TournamentRows
                        label="Your Tournament Run"
                        rows={[
                            { label: 'Player', value: participantLabel(myRun.entrant, 'You'), wrap: true },
                            myRun.entrant?.seed ? { label: 'Seed', value: exactDiamonds(myRun.entrant.seed) } : null,
                            myRun.entrant?.rank ? { label: 'Rank', value: exactDiamonds(myRun.entrant.rank), ink: 'gold' } : null,
                            current?.roundNumber ? { label: 'Round', value: exactDiamonds(current.roundNumber) } : null,
                            opponent ? { label: 'Opponent', value: participantLabel(opponent), wrap: true, ink: opponent.participantKind === 'horse' ? 'blue' : undefined } : null,
                            current?.seat ? { label: 'Answered', value: exactDiamonds(current.seat.answered) } : null,
                            opens !== null && opens > 0 ? { label: 'Round Opens In', value: formatCountdown(opens), ink: 'gold' } : null,
                            deadline !== null ? { label: 'Server Deadline', value: formatCountdown(deadline), ink: deadline <= 30 ? 'red' : 'gold' } : null,
                            currentMatchup?.decidedReason ? { label: 'Decision', value: toTitleCase(currentMatchup.decidedReason.replace(/_/g, ' ')), wrap: true } : null,
                            receipt?.payout ? { label: 'Payout', value: `${exactDiamonds(receipt.payout.amount)} Diamonds`, ink: 'green' } : null,
                            receipt?.refund ? { label: 'Refund', value: `${exactDiamonds(receipt.refund.amount)} Diamonds`, ink: 'green' } : null,
                        ]}
                    />
                    {canPlay ? (
                        <div className="tt-actions">
                            <TriviaGlassAction label={pending === 'resume' ? 'Resuming' : 'Resume Open Round'} disabled={Boolean(pending)} onClick={onResume} />
                            <TriviaGlassAction label={pending === 'play' ? 'Opening' : 'Open Round'} disabled={Boolean(pending)} onClick={onPlay} />
                        </div>
                    ) : null}
                    {viewState === 'advance' ? <p className="tt-run__notice tc-ink--green">Your Next Round Will Open From The Server Schedule.</p> : null}
                    {viewState === 'waiting' ? <p className="tt-run__notice tc-ink--gold">Your Seat Is Recorded. The Server Is Waiting For The Opponent Or Round Decision.</p> : null}
                    {viewState === 'settling' ? <p className="tt-run__notice tc-ink--gold">The Result Is Locked While The Settlement Receipt Is Prepared.</p> : null}
                    {viewState === 'refund' ? <p className="tt-run__notice tc-ink--red">This Event Was Cancelled. Every Stored Entry Is Refunded Through The Original Tournament Ledger.</p> : null}
                    <RunHistory history={myRun.history} />
                </>
            )}
        </section>
    );
}

function Seat({ seat, winnerEntrantId }) {
    if (!seat) return <span className="tt-bracket-seat tc-ink--muted">Open Seat</span>;
    const winner = winnerEntrantId && winnerEntrantId === seat.entrantId;
    return (
        <span className={`tt-bracket-seat ${winner ? 'tc-ink--green' : seat.participantKind === 'horse' ? 'tc-ink--blue' : 'tc-ink--silver'}`}>
            <strong>{participantLabel(seat)}</strong>
            <small>{seat.state === 'bye' ? 'Bye' : `${exactDiamonds(seat.answered)} Answered`}</small>
            {seat.correct !== null && seat.correct !== undefined ? <small>{exactDiamonds(seat.correct)} Correct</small> : null}
        </span>
    );
}

export function TournamentBracketViewport({ bracket, summary, myRun, loading, error, round, query, onQuery, onRound, onPage, onRetry }) {
    const scrollerRef = useRef(null);
    const pathIds = useMemo(() => currentPathMatchupIds(myRun), [myRun]);
    const rounds = Number(bracket?.roundCount || summary?.field?.rounds || 0);
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const items = (bracket?.items || []).filter(matchup => !normalizedQuery || (matchup.seats || []).some(seat => participantLabel(seat).toLowerCase().includes(normalizedQuery)));
    const offset = Number(bracket?.offset || 0);
    const limit = Number(bracket?.limit || 64);
    const total = Number(bracket?.total || 0);
    function pan(event) {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const amount = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -240 : 240;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') scrollerRef.current?.scrollBy({ left: amount, behavior: 'auto' });
        else scrollerRef.current?.scrollBy({ top: amount, behavior: 'auto' });
        event.preventDefault();
        event.stopPropagation();
    }
    return (
        <section className="tt-bracket tt-section" aria-labelledby="tt-bracket-title">
            <div className="tt-section-head"><h2 id="tt-bracket-title" className="tc-label">Tournament Bracket</h2><span className="tc-ink--muted">Round {round || 1}</span></div>
            {rounds > 0 ? (
                <nav className="tt-minimap" aria-label="Tournament Bracket Minimap">
                    {Array.from({ length: rounds }, (_, index) => index + 1).map(number => (
                        <button type="button" className="tc-word" key={number} aria-current={number === round ? 'true' : undefined} onClick={() => onRound(number)}>R{number}</button>
                    ))}
                </nav>
            ) : null}
            <label className="tt-search"><span>Search Loaded Round</span><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Player Name" /></label>
            {loading ? <TournamentStateBanner title="Loading Bracket" message="Reading The Server Pairings." tone="muted" /> : null}
            {error ? <TournamentStateBanner title="Bracket Unavailable" message={error} tone="red" role="alert" action={{ label: 'Retry Bracket', onClick: onRetry }} /> : null}
            {!loading && !error && items.length === 0 ? <TournamentStateBanner title={normalizedQuery ? 'No Loaded Matchup Found' : 'Pairings Not Posted'} message={normalizedQuery ? 'Search The Field For The Full Server Roster, Or Load Another Bracket Page.' : 'This Round Will Appear After The Server Creates Its Pairings.'} tone="muted" /> : null}
            {!loading && !error && items.length > 0 ? (
                <div ref={scrollerRef} className="tt-bracket-scroll" tabIndex={0} role="region" aria-label={`Round ${round || 1} Matchups. Use Arrow Keys To Pan.`} onKeyDown={pan}>
                    <ol className="tt-bracket-list">
                        {items.map(matchup => (
                            <li key={matchup.matchupId} className="tt-matchup" data-current-path={pathIds.has(matchup.matchupId) ? 'true' : 'false'}>
                                <span className="tt-matchup__slot">Match {exactDiamonds(matchup.slot)}</span>
                                <Seat seat={matchup.seats?.[0]} winnerEntrantId={matchup.winnerEntrantId} />
                                <span className="tt-matchup__versus">{matchup.isBye ? 'Bye' : 'Vs'}</span>
                                <Seat seat={matchup.seats?.[1]} winnerEntrantId={matchup.winnerEntrantId} />
                                <span className={`tt-matchup__status tc-ink--${matchup.status === 'resolved' ? 'green' : matchup.status === 'ready' ? 'gold' : 'muted'}`}>{pathIds.has(matchup.matchupId) ? 'Your Path: ' : ''}{toTitleCase(matchup.status)}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : null}
            {total > limit ? (
                <div className="tt-pager" aria-label="Bracket Pages">
                    <TriviaGlassAction label="Previous Matchups" disabled={offset <= 0 || loading} onClick={() => onPage(Math.max(0, offset - limit))} />
                    <span>{exactDiamonds(offset + 1)} To {exactDiamonds(Math.min(total, offset + limit))} Of {exactDiamonds(total)}</span>
                    <TriviaGlassAction label="Next Matchups" disabled={offset + limit >= total || loading} onClick={() => onPage(offset + limit)} />
                </div>
            ) : null}
        </section>
    );
}

export function TournamentFieldList({ field, loading, error, query, kind, onQuery, onKind, onSearch, onPage, onRetry }) {
    const offset = Number(field?.offset || 0);
    const limit = Number(field?.limit || 50);
    const total = Number(field?.total || 0);
    return (
        <section className="tt-field tt-section" aria-labelledby="tt-field-title">
            <div className="tt-section-head"><h2 id="tt-field-title" className="tc-label">Searchable Field</h2><span className="tc-ink--muted">{exactDiamonds(total)} Players</span></div>
            <form className="tt-field-search" onSubmit={event => { event.preventDefault(); onSearch(); }}>
                <label className="tt-search"><span>Player Name</span><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search The Field" /></label>
                <label className="tt-search"><span>Player Type</span><select value={kind} onChange={event => onKind(event.target.value)}><option value="">Everyone</option><option value="human">Humans</option><option value="horse">Smarter Horses</option></select></label>
                <TriviaGlassAction label="Search Field" disabled={loading} onClick={onSearch} />
            </form>
            {loading ? <TournamentStateBanner title="Loading Field" message="Reading The Server Roster." tone="muted" /> : null}
            {error ? <TournamentStateBanner title="Field Unavailable" message={error} tone="red" role="alert" action={{ label: 'Retry Field', onClick: onRetry }} /> : null}
            {!loading && !error && (field?.items || []).length === 0 ? <TournamentStateBanner title="No Players Found" message="Try A Different Name Or Player Type." tone="muted" /> : null}
            {!loading && !error && (field?.items || []).length > 0 ? (
                <div className="tt-field-scroll" tabIndex={0} role="region" aria-label="Paged Tournament Field">
                    <ol className="tt-field-list" start={offset + 1}>
                        {field.items.map(item => (
                            <li key={item.entrantId}>
                                <span className={item.participantKind === 'horse' ? 'tc-ink--blue' : 'tc-ink--silver'}>{participantLabel(item)}</span>
                                <span>{item.seed ? `Seed ${exactDiamonds(item.seed)}` : 'Awaiting Seed'}</span>
                                <strong className={item.status === 'eliminated' ? 'tc-ink--red' : item.status === 'champion' ? 'tc-ink--gold' : 'tc-ink--green'}>{toTitleCase(item.status)}</strong>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : null}
            {total > limit ? (
                <div className="tt-pager" aria-label="Field Pages"><TriviaGlassAction label="Previous Players" disabled={offset <= 0 || loading} onClick={() => onPage(Math.max(0, offset - limit))} /><span>{exactDiamonds(offset + 1)} To {exactDiamonds(Math.min(total, offset + limit))} Of {exactDiamonds(total)}</span><TriviaGlassAction label="Next Players" disabled={offset + limit >= total || loading} onClick={() => onPage(offset + limit)} /></div>
            ) : null}
        </section>
    );
}

export function TournamentResults({ results, summary, loading, error, onPage, onRetry }) {
    const offset = Number(results?.offset || 0);
    const limit = Number(results?.limit || 50);
    const total = Number(results?.total || 0);
    return (
        <section className="tt-results tt-section" aria-labelledby="tt-results-title">
            <h2 id="tt-results-title" className="tc-label">Official Results</h2>
            {summary?.result?.champion ? <p className="tt-champion tc-ink--gold">Champion: {participantLabel(summary.result.champion)}</p> : null}
            {loading ? <TournamentStateBanner title="Loading Results" tone="muted" /> : null}
            {error ? <TournamentStateBanner title="Results Unavailable" message={error} tone="red" role="alert" action={{ label: 'Retry Results', onClick: onRetry }} /> : null}
            {!loading && !error && (results?.items || []).length === 0 ? <TournamentStateBanner title="Results Not Final" message="Official Standings Post From The Settlement Engine." tone="muted" /> : null}
            {!loading && !error && (results?.items || []).length > 0 ? (
                <ol className="tt-results-list" start={offset + 1}>
                    {results.items.map(item => <li key={`${item.rank}-${item.displayName}`}><strong>#{exactDiamonds(item.rank)}</strong><span className={item.participantKind === 'horse' ? 'tc-ink--blue' : 'tc-ink--silver'}>{participantLabel(item)}</span><span>{exactDiamonds(item.score)} Correct</span><span className="tc-ink--green">{exactDiamonds(item.payout)} Diamonds</span></li>)}
                </ol>
            ) : null}
            {total > limit ? <div className="tt-pager" aria-label="Result Pages"><TriviaGlassAction label="Previous Results" disabled={offset <= 0 || loading} onClick={() => onPage(Math.max(0, offset - limit))} /><span>{exactDiamonds(offset + 1)} To {exactDiamonds(Math.min(total, offset + limit))} Of {exactDiamonds(total)}</span><TriviaGlassAction label="Next Results" disabled={offset + limit >= total || loading} onClick={() => onPage(offset + limit)} /></div> : null}
        </section>
    );
}

export function TournamentReceipt({ receipt, loading, error, signedIn, onSignIn, onRetry }) {
    return (
        <section className="tt-receipt tt-section" aria-labelledby="tt-receipt-title">
            <h2 id="tt-receipt-title" className="tc-label">Transaction Receipt</h2>
            {!signedIn ? <TournamentStateBanner title="Sign In For Your Receipt" action={{ label: 'Sign In', onClick: onSignIn }} /> : null}
            {signedIn && loading ? <TournamentStateBanner title="Loading Receipt" tone="muted" /> : null}
            {signedIn && error ? <TournamentStateBanner title="Receipt Unavailable" message={error} tone="red" role="alert" action={{ label: 'Retry Receipt', onClick: onRetry }} /> : null}
            {signedIn && !loading && !error && !receipt ? <TournamentStateBanner title="No Entry Receipt" message="No Entry Was Recorded For This Account In This Event." tone="muted" /> : null}
            {signedIn && receipt ? (
                <TournamentRows label="Tournament Transaction References" rows={[
                    { label: 'Entry', value: `${exactDiamonds(receipt.entry?.amount)} Diamonds`, ink: 'gold' },
                    { label: 'Entry Reference', value: receipt.entry?.reference, wrap: true, preserveCase: true },
                    { label: 'Funding Source', value: toTitleCase(String(receipt.entry?.fundingSource || '').replace(/_/g, ' ')), wrap: true },
                    { label: 'Journal', value: receipt.entry?.journalId, wrap: true, preserveCase: true },
                    receipt.refund ? { label: 'Refund', value: `${exactDiamonds(receipt.refund.amount)} Diamonds`, ink: 'green' } : null,
                    receipt.refund ? { label: 'Refund Reference', value: receipt.refund.reference, wrap: true, preserveCase: true } : null,
                    receipt.payout ? { label: 'Payout', value: `${exactDiamonds(receipt.payout.amount)} Diamonds`, ink: 'green' } : null,
                    receipt.payout ? { label: 'Payout Reference', value: receipt.payout.reference, wrap: true, preserveCase: true } : null,
                    { label: 'Settlement', value: toTitleCase(String(receipt.settlement?.state || 'Pending')), wrap: true },
                    { label: 'Settlement ID', value: receipt.settlement?.settlementId, wrap: true, preserveCase: true },
                    { label: 'Idempotency Key', value: receipt.settlement?.idempotencyKey, wrap: true, preserveCase: true },
                ]} />
            ) : null}
        </section>
    );
}

export function TournamentHistory({ history, loading, error, signedIn, pending, onSignIn, onOpenReceipt, onPage, onRetry }) {
    const total = Number(history?.total || 0);
    const offset = Number(history?.offset || 0);
    const limit = Number(history?.limit || 20);
    return (
        <section className="tt-history tt-section" aria-labelledby="tt-history-title">
            <h2 id="tt-history-title" className="tc-label">Nightly History</h2>
            {!signedIn ? <TournamentStateBanner title="Sign In For Your History" action={{ label: 'Sign In', onClick: onSignIn }} /> : null}
            {signedIn && loading ? <TournamentStateBanner title="Loading History" tone="muted" /> : null}
            {signedIn && error ? <TournamentStateBanner title="History Unavailable" message={error} tone="red" role="alert" action={{ label: 'Retry History', onClick: onRetry }} /> : null}
            {signedIn && !loading && !error && (history?.items || []).length === 0 ? <TournamentStateBanner title="No Nightly History Yet" tone="muted" /> : null}
            {signedIn && !loading && !error && (history?.items || []).length > 0 ? (
                <ol className="tt-history-list" start={offset + 1}>{history.items.map(item => (
                    <li key={item.tournamentId}>
                        <strong>{item.name || 'Nightly Trivia Tournament'}</strong>
                        <span>{item.localDate}</span>
                        <span>{item.rank ? `Rank ${exactDiamonds(item.rank)}` : toTitleCase(item.state)}</span>
                        <span className="tt-actions">
                            <span className={Number(item.payout) > 0 ? 'tc-ink--green' : 'tc-ink--muted'}>{exactDiamonds(item.payout)} Diamonds</span>
                            <TriviaGlassAction label={pending ? 'Opening Receipt' : 'Open Receipt'} disabled={pending} onClick={() => onOpenReceipt(item.tournamentId)} />
                        </span>
                    </li>
                ))}</ol>
            ) : null}
            {total > limit ? <div className="tt-pager" aria-label="History Pages"><TriviaGlassAction label="Previous Events" disabled={offset <= 0 || loading} onClick={() => onPage(Math.max(0, offset - limit))} /><span>{exactDiamonds(offset + 1)} To {exactDiamonds(Math.min(total, offset + limit))} Of {exactDiamonds(total)}</span><TriviaGlassAction label="Next Events" disabled={offset + limit >= total || loading} onClick={() => onPage(offset + limit)} /></div> : null}
        </section>
    );
}

export function TournamentQuestionStage({ session, question, secondsLeft, selected, pending, error, onAnswer, onSkip, onFinish, onRetry }) {
    const progress = sessionProgress(session);
    return (
        <section className="tt-play" aria-labelledby="tt-question-title">
            <TournamentRows label="Round Progress" rows={[
                { label: 'Question', value: `${exactDiamonds(question?.position)} / ${exactDiamonds(progress.total)}` },
                { label: 'Recorded', value: `${exactDiamonds(progress.complete)} / ${exactDiamonds(progress.total)}` },
                { label: 'Server Shot Clock', value: Number.isFinite(secondsLeft) ? `${secondsLeft} Seconds` : 'Awaiting Server', ink: secondsLeft <= 5 ? 'red' : 'gold' },
            ]} />
            {error ? <TournamentStateBanner title="Answer Not Recorded" message={error} tone="red" role="alert" action={{ label: 'Retry From Server', onClick: onRetry }} /> : null}
            <h2 id="tt-question-title" className="tt-question">{toTitleCase(question?.question || 'Opening Question')}</h2>
            <div className="tt-options">
                {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-3: shared accessible option primitive, driven only by the authoritative tournament answer state. */}
                {(question?.options || []).map((option, index) => <TriviaAnswerOption key={`${question.id}-${index}`} index={index} option={toTitleCase(String(option))} selectedAnswer={selected} showResult={false} disabled={pending || selected !== null} onSelect={onAnswer} />)}
            </div>
            <p className="tt-play__privacy tc-ink--muted">The Server Records The First Answer. Verdicts Stay Hidden Until The Round Closes.</p>
            <div className="tt-actions"><TriviaGlassAction label={pending ? 'Recording' : 'Skip Question'} disabled={pending || selected !== null} onClick={onSkip} /><TriviaGlassAction label="Finish Round" disabled={pending} onClick={onFinish} /></div>
        </section>
    );
}
