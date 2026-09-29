/**
 * Trivia Tournaments: presentational sections printed on the black glass of
 * the Trivia console (#ClubArenaConsole). Nothing here paints a frame, card,
 * pill or button face; every control is a lit word (.tc-word / TriviaGlassAction)
 * and every figure is a label/value row separated by an engraved rule.
 *
 * Pure presentation: the page owns every fetch, guard and handler and passes
 * them in. Horses are players; no field here can say otherwise.
 */
import { TriviaGlassAction } from '../console/TriviaConsole';
import { toTitleCase } from '../../../lib/trivia/titleCase';
import { printPlayerName } from '../../../lib/trivia/printPlayerName';
import { formatTriviaDisplayNumber } from '../../../lib/trivia/formatTriviaDisplayNumber';

/** Scene art for the Tournaments mode (no baked text). */
export const TOURNAMENTS_ART = '/images/trivia/modes-console-v1/tournaments.webp';

/**
 * A Diamond amount printed exactly (entry fees, prize pools, prize schedule,
 * balances). Grouped for reading, never rounded or compacted: these are
 * money terms, so the display formatter does not apply.
 */
export function exactAmount(value) {
    const numeric = Math.trunc(Number(value) || 0);
    return numeric.toLocaleString('en-US');
}

/** A server error code or message, made readable and Title Cased. */
export function printableError(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (/^[a-z0-9_]+$/.test(text)) return toTitleCase(text.replace(/_/g, ' '));
    return toTitleCase(text);
}

const NOTIFICATION_INK = Object.freeze({
    round_start: 'green',
    forfeit_warning: 'gold',
    eliminated: 'red',
    winner: 'gold',
});

/** Unread tournament alerts, each with its own Dismiss word. */
export function TournamentAlerts({ notifications, onDismiss }) {
    if (!notifications || notifications.length === 0) return null;
    return (
        <section className="tt-section" aria-labelledby="tt-alerts-title">
            <h2 id="tt-alerts-title" className="tc-label">Tournament Alerts</h2>
            <ul className="tt-list">
                {notifications.map(n => (
                    <li key={n.id} className="tt-alert">
                        <p className={`tt-alert__text tc-ink--${NOTIFICATION_INK[n.notification_type] || 'silver'}`}>
                            {toTitleCase(String(n.message || ''))}
                        </p>
                        <TriviaGlassAction
                            label="Dismiss"
                            ink="muted"
                            aria-label="Dismiss Alert"
                            onClick={() => onDismiss(n.id)}
                        />
                    </li>
                ))}
            </ul>
        </section>
    );
}

const TABS = Object.freeze([
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'active', label: 'Active' },
    { id: 'past', label: 'Past' },
]);

/** Scheduled / Active / Past as lit words on the glass, not CSS tabs. */
export function TournamentTabs({ value, onChange }) {
    return (
        <nav className="tt-tabs" aria-label="Tournament Lists">
            {TABS.map(tab => (
                <button
                    key={tab.id}
                    type="button"
                    className="tc-word"
                    aria-pressed={value === tab.id ? 'true' : 'false'}
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
}

/**
 * Label / value rows (tc-rows). rows: [{ label, value, ink?, wrap? }]
 * Values hold on one line (a figure never breaks); `wrap` lets a long
 * printed name value wrap instead.
 */
export function TournamentRows({ rows, label }) {
    const list = (rows || []).filter(Boolean);
    if (list.length === 0) return null;
    return (
        <ul className="tc-rows" aria-label={label}>
            {list.map(row => (
                <li key={row.label} className={row.wrap ? 'tc-row tt-row--wrap' : 'tc-row'}>
                    <span className="tc-row__label">{row.label}</span>
                    <span className={`tc-row__value${row.ink ? ` tc-ink--${row.ink}` : ''}`}>{row.value}</span>
                </li>
            ))}
        </ul>
    );
}

/** The prize schedule, printed exactly as splitPrizePool() pays it. */
export function TournamentPrizeRows({ breakdown }) {
    if (!breakdown || breakdown.length === 0) return null;
    return (
        <section className="tt-section" aria-labelledby="tt-prizes-title">
            <h3 id="tt-prizes-title" className="tc-label">Prize Distribution</h3>
            <ul className="tc-rows">
                {breakdown.map(p => (
                    <li key={p.place} className="tc-row">
                        <span className="tc-row__label">{p.place} <span className="tt-muted">{p.pct}%</span></span>
                        <span className="tc-row__value tc-ink--gold">{exactAmount(p.amount)} Diamonds</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** A bracket seat's printed name. Horses are players: no marker, ever. */
export function bracketName(playerId, userId, names) {
    if (!playerId) return 'Bye';
    if (playerId === userId) return 'You';
    return printPlayerName(names && names[playerId], 'Player');
}

function Seat({ playerId, score, winner, userId, names }) {
    const mine = playerId && playerId === userId;
    const ink = winner ? 'green' : mine ? 'blue' : 'silver';
    return (
        <div className="tt-seat">
            <span className={`tt-seat__name tc-ink--${ink}`}>{bracketName(playerId, userId, names)}</span>
            {score != null ? <span className="tt-seat__score tc-ink--gold">{score}</span> : null}
        </div>
    );
}

/** Every round of the bracket, stacked (vertical: a sideways drag swipes the page). */
export function TournamentBracket({ rounds, userId, names, roundName }) {
    if (!rounds || rounds.length === 0) return null;
    return (
        <section className="tt-section" aria-labelledby="tt-bracket-title">
            <h3 id="tt-bracket-title" className="tc-label">Tournament Bracket</h3>
            {rounds.map(round => (
                <div key={round.id} className="tt-round" data-status={round.status}>
                    <p className="tt-round__name">
                        <span className="tc-ink--silver">{roundName(round.round_number)}</span>
                        {round.status === 'active' ? <span className="tt-round__live tc-ink--green">Live</span> : null}
                    </p>
                    {(round.matchups || []).length === 0 ? (
                        <p className="tt-note tc-ink--muted">Pairings Post When The Round Opens.</p>
                    ) : (
                        <ul className="tt-list">
                            {(round.matchups || []).map((matchup, idx) => (
                                <li
                                    key={idx}
                                    className="tt-matchup"
                                    data-mine={matchup.player1_id === userId || matchup.player2_id === userId ? 'true' : 'false'}
                                >
                                    <Seat
                                        playerId={matchup.player1_id}
                                        score={matchup.player1_score}
                                        winner={Boolean(matchup.winner_id) && matchup.winner_id === matchup.player1_id}
                                        userId={userId}
                                        names={names}
                                    />
                                    <span className="tt-matchup__vs tc-ink--muted" aria-hidden="true">Vs</span>
                                    <Seat
                                        playerId={matchup.player2_id}
                                        score={matchup.player2_score}
                                        winner={Boolean(matchup.winner_id) && matchup.winner_id === matchup.player2_id}
                                        userId={userId}
                                        names={names}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
        </section>
    );
}

/** Everyone in the field, in seeding order. Totals count every player. */
export function TournamentField({ playerIds, userId, names }) {
    if (!playerIds || playerIds.length === 0) return null;
    return (
        <section className="tt-section" aria-labelledby="tt-field-title">
            <h3 id="tt-field-title" className="tc-label">
                Players In The Field <span className="tt-muted">{formatTriviaDisplayNumber(playerIds.length)}</span>
            </h3>
            <ul className="tt-names">
                {playerIds.map(id => (
                    <li key={id} className={id === userId ? 'tc-ink--blue' : 'tc-ink--silver'}>
                        {bracketName(id, userId, names)}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function eventDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Upcoming tournaments, each gated on its OWN entry. */
export function TournamentScheduledList({ tournaments, entriesByTournament, onRegister, countdown }) {
    if (!tournaments || tournaments.length === 0) {
        return (
            <div className="trivia-console-state">
                <p className="tc-ink--silver">No Tournaments Scheduled Yet.</p>
                <p className="tc-ink--muted">Nightly Tournaments Start At 8 PM Central Time!</p>
            </div>
        );
    }
    return (
        <section className="tt-section" aria-labelledby="tt-scheduled-title">
            <h2 id="tt-scheduled-title" className="tc-label">Upcoming Tournaments</h2>
            <ul className="tt-list">
                {tournaments.map(tournament => (
                    <li key={tournament.id} className="tt-event">
                        <h3 className="tt-event__name">{toTitleCase(String(tournament.name || 'Tournament'))}</h3>
                        <p className="tt-event__meta tc-ink--muted">
                            {eventDate(tournament.start_time)} <span aria-hidden="true">/</span> 8:00 PM Central
                        </p>
                        <div className="tt-event__foot">
                            <div className="tt-event__figures">
                                <span className="tt-event__countdown tc-ink--gold">Starts In {countdown(tournament.start_time)}</span>
                                <span className="tt-event__fee tc-ink--silver">{exactAmount(tournament.entry_fee)} Diamonds Entry</span>
                            </div>
                            {entriesByTournament && entriesByTournament[tournament.id] ? (
                                <span className="tt-event__status tc-ink--green">Registered</span>
                            ) : (
                                <TriviaGlassAction label="Register" onClick={() => onRegister(tournament)} />
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

const PLACES = ['1st', '2nd', '3rd'];

/** Completed and cancelled tournaments with their paid places. */
export function TournamentPastList({ tournaments }) {
    if (!tournaments || tournaments.length === 0) {
        return (
            <div className="trivia-console-state">
                <p className="tc-ink--silver">No Past Tournaments Yet.</p>
                <p className="tc-ink--muted">Results Post Here When A Bracket Finishes.</p>
            </div>
        );
    }
    return (
        <section className="tt-section" aria-labelledby="tt-past-title">
            <h2 id="tt-past-title" className="tc-label">Past Tournaments</h2>
            <ul className="tt-list">
                {tournaments.map(tournament => (
                    <li key={tournament.id} className="tt-event">
                        <h3 className="tt-event__name">{toTitleCase(String(tournament.name || 'Tournament'))}</h3>
                        <p className={`tt-event__meta ${tournament.status === 'cancelled' ? 'tc-ink--red' : 'tc-ink--blue'}`}>
                            {tournament.status === 'cancelled'
                                ? 'Cancelled'
                                : `${exactAmount(tournament.prize_pool || 0)} Diamond Pool`}
                        </p>
                        {tournament.winners ? (
                            <ul className="tc-rows">
                                {tournament.winners.slice(0, 3).map((winner, idx) => (
                                    <li key={idx} className="tc-row">
                                        <span className="tc-row__label">
                                            {PLACES[idx]} <span className="tt-winner">{printPlayerName(winner.username, 'Player')}</span>
                                        </span>
                                        <span className="tc-row__value tc-ink--green">+{exactAmount(winner.prize)} Diamonds</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}
