import { useEffect, useMemo, useState } from 'react';
import { TriviaGlassAction } from './console/TriviaConsole';
import {
    exactDiamonds,
    formatCountdown,
    participantLabel,
    resolveFollowedPlayerStatus,
    secondsUntil,
} from './tournaments/tournamentModel.mjs';
import { toTitleCase } from '../../lib/trivia/titleCase';

const FOLLOW_STORAGE_PREFIX = 'sp:trivia:spectator:follow:';

function followKeyForEntity(entity) {
    if (!entity || typeof entity !== 'object') return '';
    const raw = entity.entrantId ?? entity.userId ?? entity.playerId ?? entity.id ?? entity.displayName ?? '';
    return String(raw).trim();
}

function followedStatusLabel(status) {
    switch (status) {
        case 'live':
            return 'Live';
        case 'advanced':
            return 'Advanced';
        case 'champion':
            return 'Champion';
        case 'eliminated':
            return 'Eliminated';
        default:
            return 'Pending';
    }
}

function followedStatusInk(status) {
    if (status === 'champion' || status === 'advanced') return 'green';
    if (status === 'eliminated') return 'red';
    if (status === 'live') return 'blue';
    return 'silver';
}

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

function FollowPinButton({ playerKey, playerName, isFollowed, onToggle }) {
    if (!playerKey || typeof onToggle !== 'function') return null;
    return (
        <button
            type="button"
            className={`sd-button${isFollowed ? ' sd-primary' : ''}`}
            data-follow-player={playerKey}
            aria-pressed={isFollowed}
            aria-label={isFollowed ? `Unfollow ${playerName}` : `Follow ${playerName}`}
            onClick={() => onToggle(playerKey)}
            style={{
                minHeight: '44px',
                minWidth: '44px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: isFollowed
                    ? '1px solid #86daff'
                    : '1px solid rgba(148, 163, 184, 0.4)',
                background: isFollowed
                    ? 'rgba(12, 85, 192, 0.36)'
                    : 'rgba(15, 23, 42, 0.72)',
                color: isFollowed ? '#86daff' : '#e2e8f0',
                whiteSpace: 'nowrap',
            }}
        >
            {isFollowed ? 'Following' : 'Follow'}
        </button>
    );
}

function SpectatorSeatRow({ seat, winnerEntrantId, isBye, followedKey, onToggleFollow }) {
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
    const playerKey = followKeyForEntity(seat);
    const playerName = participantLabel(seat);
    const isFollowed = Boolean(followedKey && playerKey && followedKey === playerKey);

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: '1 1 130px' }}>
                <strong className={`tc-ink--${nameInk}`} style={{ fontSize: '14px' }}>
                    {playerName}{isWinner ? ' | Winner' : ''}
                </strong>
                <span className={isWinner ? 'tc-ink--green' : 'tc-ink--muted'} style={{ fontSize: '12px', fontWeight: 600 }}>
                    {scoreText}
                </span>
            </div>
            <FollowPinButton
                playerKey={playerKey}
                playerName={playerName}
                isFollowed={isFollowed}
                onToggle={onToggleFollow}
            />
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
    const tournamentKey = String(tournament?.tournamentId || tournament?.id || '').trim();
    const storageKey = tournamentKey ? `${FOLLOW_STORAGE_PREFIX}${tournamentKey}` : '';
    const [followedKey, setFollowedKey] = useState('');

    useEffect(() => {
        if (!storageKey || typeof window === 'undefined') {
            setFollowedKey('');
            return;
        }
        try {
            const saved = window.sessionStorage.getItem(storageKey);
            setFollowedKey(saved ? String(saved).trim() : '');
        } catch {
            setFollowedKey('');
        }
    }, [storageKey]);

    const handleToggleFollow = (key) => {
        const clean = String(key || '').trim();
        const next = clean && clean === followedKey ? '' : clean;
        setFollowedKey(next);
        if (!storageKey || typeof window === 'undefined') return;
        try {
            if (next) {
                window.sessionStorage.setItem(storageKey, next);
            } else {
                window.sessionStorage.removeItem(storageKey);
            }
        } catch {
            // sessionStorage unavailable
        }
    };

    const resolvedChampion = champion || summary?.result?.champion || null;
    const safeMatchups = useMemo(
        () => (Array.isArray(featuredMatchups) ? featuredMatchups.filter(Boolean) : []),
        [featuredMatchups],
    );

    const totalRounds = Number(summary?.field?.rounds || tournament?.format?.rounds || 0);
    const currentRound = Number(summary?.currentRound || tournament?.currentRound || 1);
    const semiRound = totalRounds >= 2 ? totalRounds - 1 : 1;
    const finalRound = totalRounds >= 1 ? totalRounds : currentRound;

    const followedStatus = useMemo(() => {
        if (!followedKey || !tournament) return null;
        return resolveFollowedPlayerStatus(
            {
                tournament,
                summary,
                featuredMatchups: safeMatchups,
                champion: resolvedChampion,
                totalRounds,
                currentRound,
                semiRound,
                finalRound,
            },
            followedKey,
        );
    }, [followedKey, tournament, summary, safeMatchups, resolvedChampion, totalRounds, currentRound, semiRound, finalRound]);

    const followedRoundNumber = useMemo(() => {
        if (!followedKey) return currentRound;
        let matchedRound = null;
        for (const matchup of safeMatchups) {
            const seats = Array.isArray(matchup.seats) ? matchup.seats : [];
            if (seats.some((seat) => seat && followKeyForEntity(seat) === followedKey)) {
                const r = Number(matchup.roundNumber || currentRound);
                if (matchedRound === null || r > matchedRound) matchedRound = r;
            }
        }
        if (matchedRound !== null) return matchedRound;
        if (resolvedChampion && followKeyForEntity(resolvedChampion) === followedKey) {
            return finalRound;
        }
        return currentRound;
    }, [followedKey, safeMatchups, resolvedChampion, finalRound, currentRound]);

    if (!tournament) return null;

    const isLiveWindow = ['held', 'live', 'settling'].includes(tournament.state);
    const isSettledView = tournament.state === 'settled' && Boolean(resolvedChampion || safeMatchups.length > 0);
    const isEnteredActive = Boolean(myRun?.entered)
        && myRun?.entrant?.status !== 'eliminated'
        && tournament.state !== 'settled';

    if ((!isLiveWindow && !isSettledView) || isEnteredActive) return null;

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

    const championKey = followKeyForEntity(resolvedChampion);
    const championName = resolvedChampion ? participantLabel(resolvedChampion) : '';

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

            {followedStatus ? (
                <div
                    role="status"
                    aria-label="Followed Player Status"
                    data-followed-player-tracker="true"
                    style={{
                        border: '1px solid rgba(134, 218, 255, 0.65)',
                        background: 'rgba(12, 85, 192, 0.2)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: '1 1 180px' }}>
                        <strong className={`tc-ink--${followedStatusInk(followedStatus.status)}`} style={{ fontSize: '14px' }}>
                            Following: {followedStatus.name} · {followedStatus.roundLabel} · {followedStatusLabel(followedStatus.status)}
                        </strong>
                        <span className="tc-ink--silver" style={{ fontSize: '12px' }}>
                            {followedStatus.scoreLabel}
                            {followedStatus.opponentName ? ` | Vs ${followedStatus.opponentName}` : ''}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {onWatchRound ? (
                            <TriviaGlassAction
                                label="Jump To Bracket"
                                ink="blue"
                                onClick={() => onWatchRound(followedRoundNumber)}
                            />
                        ) : null}
                        <TriviaGlassAction
                            label="Unpin"
                            ink="red"
                            onClick={() => handleToggleFollow('')}
                        />
                    </div>
                </div>
            ) : null}

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: '1 1 160px' }}>
                        <strong className="tc-ink--blue" style={{ fontSize: '15px' }}>
                            Champion: {championName}
                        </strong>
                        <span className="tc-ink--green" style={{ fontSize: '13px', fontWeight: 700 }}>
                            {resolvedChampion.score !== undefined && resolvedChampion.score !== null
                                ? `${exactDiamonds(resolvedChampion.score)} Correct | `
                                : ''}
                            {exactDiamonds(resolvedChampion.payout || 0)} Diamonds
                        </span>
                    </div>
                    <FollowPinButton
                        playerKey={championKey}
                        playerName={championName}
                        isFollowed={Boolean(followedKey && championKey && followedKey === championKey)}
                        onToggle={handleToggleFollow}
                    />
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

                                <SpectatorSeatRow
                                    seat={seatA}
                                    winnerEntrantId={matchup.winnerEntrantId}
                                    isBye={false}
                                    followedKey={followedKey}
                                    onToggleFollow={handleToggleFollow}
                                />
                                <div className="tc-ink--muted" style={{ fontSize: '12px', fontWeight: 700 }}>
                                    {matchup.isBye ? 'Bye Advance' : 'Vs'}
                                </div>
                                <SpectatorSeatRow
                                    seat={seatB}
                                    winnerEntrantId={matchup.winnerEntrantId}
                                    isBye={Boolean(matchup.isBye)}
                                    followedKey={followedKey}
                                    onToggleFollow={handleToggleFollow}
                                />

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
