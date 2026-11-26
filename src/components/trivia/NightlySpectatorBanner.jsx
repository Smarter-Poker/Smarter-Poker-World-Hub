import { TriviaGlassAction } from './console/TriviaConsole';
import {
    exactDiamonds,
    formatCountdown,
    participantLabel,
    secondsUntil,
} from './tournaments/tournamentModel.mjs';
import { toTitleCase } from '../../lib/trivia/titleCase';

export function matchupStageLabel(matchup, totalRounds, semiRound, finalRound) {
    const round = Number(matchup?.roundNumber || 0);
    const rawSlot = matchup?.slot;
    const slot = rawSlot !== null && rawSlot !== undefined && rawSlot !== '' && Number.isFinite(Number(rawSlot))
        ? Number(rawSlot) + 1
        : 1;
    if (totalRounds >= 1 && round === finalRound) return 'Championship Final';
    if (totalRounds >= 2 && round === semiRound) return `Semifinal ${slot}`;
    return `Round ${round || 1} Match ${slot}`;
}

function matchupStatusLabel(status) {
    const normalized = String(status || 'pending').trim().toLowerCase();
    if (normalized === 'resolved') return 'Final';
    if (normalized === 'live' || normalized === 'playing' || normalized === 'ready') return 'Live';
    return toTitleCase(normalized.replace(/_/g, ' '));
}

function matchupStatusInk(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'resolved') return 'green';
    if (normalized === 'live' || normalized === 'playing' || normalized === 'ready') return 'blue';
    return 'muted';
}

function SpectatorSeatRow({ seat, winnerEntrantId, isBye }) {
    if (!seat) {
        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span className="tc-ink--muted">{isBye ? 'Bye Slot' : 'Awaiting Contender'}</span>
                <span className="tc-ink--muted" style={{ fontSize: '12px' }}>Pending</span>
            </div>
        );
    }

    const isWinner = Boolean(winnerEntrantId && winnerEntrantId === seat.entrantId);
    const isHorse = seat.participantKind === 'horse';
    const nameInk = isWinner ? 'green' : isHorse ? 'blue' : 'silver';
    const scoreText = seat.state === 'bye'
        ? 'Bye'
        : seat.correct !== null && seat.correct !== undefined
            ? `${exactDiamonds(seat.correct)} Correct | ${exactDiamonds(seat.answered)} Answered`
            : `${exactDiamonds(seat.answered)} Answered`;

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong className={`tc-ink--${nameInk}`} style={{ fontSize: '14px' }}>
                {participantLabel(seat)}{isWinner ? ' | Winner' : ''}
            </strong>
            <span className={isWinner ? 'tc-ink--green' : 'tc-ink--muted'} style={{ fontSize: '12px', fontWeight: 600 }}>
                {scoreText}
            </span>
        </div>
    );
}

export default function NightlySpectatorBanner({
    tournament,
    summary,
    myRun,
    featuredMatchups = [],
    champion = null,
    nowMs = null,
    realtimeConnected = false,
    onWatchRound,
}) {
    if (!tournament) return null;

    const resolvedChampion = champion || summary?.result?.champion || null;
    const safeMatchups = Array.isArray(featuredMatchups) ? featuredMatchups.filter(Boolean) : [];
    const isLiveWindow = ['held', 'live', 'settling'].includes(tournament.state);
    const isSettledView = tournament.state === 'settled' && Boolean(resolvedChampion || safeMatchups.length > 0);
    const isEnteredActive = Boolean(myRun?.entered)
        && myRun?.entrant?.status !== 'eliminated'
        && tournament.state !== 'settled';

    if ((!isLiveWindow && !isSettledView) || isEnteredActive) return null;

    const totalRounds = Number(summary?.field?.rounds || tournament?.format?.rounds || 0);
    const currentRound = Number(summary?.currentRound || tournament?.currentRound || 1);
    const semiRound = totalRounds >= 2 ? totalRounds - 1 : 1;
    const finalRound = totalRounds >= 1 ? totalRounds : currentRound;

    const stageLabel = tournament.state === 'settled'
        ? 'Championship Settled'
        : totalRounds > 0 && currentRound >= finalRound
            ? 'Championship Final Live'
            : totalRounds > 1 && currentRound === semiRound
                ? 'Semifinals Live'
                : `Round ${currentRound} Live`;

    const reasonText = tournament.state === 'settled'
        ? 'Tonight Is Settled. Review The Championship Final Matchup And Official Winner Below.'
        : myRun?.entrant?.status === 'eliminated'
            ? 'Your Run Has Finished. Watch The Remaining Contenders Battle Through Semifinals And Finals.'
            : 'Registration Has Locked For Tonight. Follow The Live Semifinals And Championship Bracket In Real Time.';

    const roundsMeta = Array.isArray(summary?.rounds) ? summary.rounds : [];
    const deadlineByRound = new Map();
    for (const roundRow of roundsMeta) {
        if (roundRow?.roundNumber && roundRow?.deadlineAt) {
            deadlineByRound.set(Number(roundRow.roundNumber), roundRow.deadlineAt);
        }
    }
    const activeDeadlineIso = deadlineByRound.get(currentRound) || null;
    const activeDeadlineSeconds = activeDeadlineIso && Number.isFinite(nowMs)
        ? secondsUntil(activeDeadlineIso, nowMs)
        : null;

    return (
        <section
            aria-label="Live Nightly Spectator Desk"
            style={{
                border: '1px solid #45adff',
                background: '#050607',
                padding: '12px 14px',
                marginBottom: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong className="tc-ink--blue">Live Spectator View | {stageLabel}</strong>
                <span className={realtimeConnected ? 'tc-ink--green' : 'tc-ink--blue'}>
                    {realtimeConnected ? 'Realtime Push Connected' : 'Live Sync Active'}
                </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>{reasonText}</p>
                {isLiveWindow && activeDeadlineSeconds !== null ? (
                    <span className={activeDeadlineSeconds <= 30 ? 'tc-ink--red' : 'tc-ink--blue'} style={{ fontSize: '12px', fontWeight: 700 }}>
                        Round Deadline: {formatCountdown(activeDeadlineSeconds)}
                    </span>
                ) : null}
            </div>

            {tournament.state === 'settled' && resolvedChampion ? (
                <div
                    role="status"
                    aria-label="Tournament Champion Announcement"
                    style={{
                        border: '1px solid rgba(134, 218, 255, 0.55)',
                        background: 'rgba(12, 85, 192, 0.14)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                    }}
                >
                    <strong className="tc-ink--blue" style={{ fontSize: '15px' }}>
                        Champion: {participantLabel(resolvedChampion)}
                    </strong>
                    <span className="tc-ink--green" style={{ fontSize: '13px', fontWeight: 700 }}>
                        {resolvedChampion.score !== undefined && resolvedChampion.score !== null
                            ? `${exactDiamonds(resolvedChampion.score)} Correct | `
                            : ''}
                        {exactDiamonds(resolvedChampion.payout || 0)} Diamonds
                    </span>
                </div>
            ) : null}

            {safeMatchups.length > 0 ? (
                <div
                    aria-label="Featured Spectator Matchups"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '10px',
                    }}
                >
                    {safeMatchups.map((matchup) => {
                        const matchRound = Number(matchup.roundNumber || currentRound);
                        const matchDeadlineIso = deadlineByRound.get(matchRound) || null;
                        const matchDeadlineSec = matchDeadlineIso && Number.isFinite(nowMs) && matchup.status !== 'resolved'
                            ? secondsUntil(matchDeadlineIso, nowMs)
                            : null;
                        const seatA = matchup.seats?.[0] || null;
                        const seatB = matchup.seats?.[1] || null;

                        return (
                            <article
                                key={matchup.matchupId || `${matchRound}-${matchup.slot}`}
                                style={{
                                    border: matchRound === finalRound && totalRounds >= 1
                                        ? '1px solid rgba(134, 218, 255, 0.5)'
                                        : '1px solid rgba(148, 163, 184, 0.28)',
                                    background: 'rgba(10, 18, 32, 0.72)',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span className="tc-ink--blue" style={{ fontSize: '12px', fontWeight: 700 }}>
                                        {matchupStageLabel(matchup, totalRounds, semiRound, finalRound)}
                                    </span>
                                    <span className={`tc-ink--${matchupStatusInk(matchup.status)}`} style={{ fontSize: '12px', fontWeight: 700 }}>
                                        {matchupStatusLabel(matchup.status)}
                                    </span>
                                </div>

                                <SpectatorSeatRow seat={seatA} winnerEntrantId={matchup.winnerEntrantId} isBye={false} />
                                <div className="tc-ink--muted" style={{ fontSize: '12px', fontWeight: 700 }}>
                                    {matchup.isBye ? 'Bye Advance' : 'Vs'}
                                </div>
                                <SpectatorSeatRow seat={seatB} winnerEntrantId={matchup.winnerEntrantId} isBye={Boolean(matchup.isBye)} />

                                {matchDeadlineSec !== null ? (
                                    <div className="tc-ink--blue" style={{ fontSize: '12px', marginTop: '2px' }}>
                                        Deadline: {formatCountdown(matchDeadlineSec)}
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            ) : isLiveWindow ? (
                <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0, fontSize: '13px' }}>
                    Semifinal And Championship Pairings Stream Here Automatically As Contenders Advance.
                </p>
            ) : null}

            {onWatchRound ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <TriviaGlassAction
                        label={`Watch Round ${currentRound}`}
                        ink="blue"
                        onClick={() => onWatchRound(currentRound)}
                    />
                    {totalRounds >= 2 ? (
                        <TriviaGlassAction
                            label="Watch Semifinals"
                            ink="blue"
                            onClick={() => onWatchRound(semiRound)}
                        />
                    ) : null}
                    {totalRounds >= 1 ? (
                        <TriviaGlassAction
                            label="Watch Final"
                            ink="green"
                            onClick={() => onWatchRound(finalRound)}
                        />
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
