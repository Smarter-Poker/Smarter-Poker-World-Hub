import { TriviaGlassAction } from './console/TriviaConsole';

export default function NightlySpectatorBanner({
    tournament,
    summary,
    myRun,
    realtimeConnected = false,
    onWatchRound,
}) {
    if (!tournament) return null;
    const isLiveWindow = ['held', 'live', 'settling'].includes(tournament.state);
    const isEnteredActive = Boolean(myRun?.entered) && myRun?.entrant?.status !== 'eliminated';
    if (!isLiveWindow || isEnteredActive) return null;

    const totalRounds = Number(summary?.field?.rounds || tournament?.format?.rounds || 0);
    const currentRound = Number(summary?.currentRound || tournament?.currentRound || 1);
    const semiRound = totalRounds >= 2 ? totalRounds - 1 : 1;
    const finalRound = totalRounds >= 1 ? totalRounds : currentRound;

    const stageLabel = totalRounds > 0 && currentRound >= finalRound
        ? 'Championship Final Live'
        : totalRounds > 1 && currentRound === semiRound
            ? 'Semifinals Live'
            : `Round ${currentRound} Live`;

    const reasonText = myRun?.entrant?.status === 'eliminated'
        ? 'Your Run Has Finished. Watch The Remaining Contenders Battle Through Semifinals And Finals.'
        : 'Registration Has Locked For Tonight. Follow The Live Semifinals And Championship Bracket In Real Time.';

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
                gap: '8px',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong className="tc-ink--blue">Live Spectator View | {stageLabel}</strong>
                <span className={realtimeConnected ? 'tc-ink--green' : 'tc-ink--gold'}>
                    {realtimeConnected ? 'Realtime Push Connected' : 'Live Sync Active'}
                </span>
            </div>
            <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>{reasonText}</p>
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
                            ink="gold"
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
