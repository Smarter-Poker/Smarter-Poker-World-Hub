import { useCallback, useEffect, useState } from 'react';
import { TriviaGlassAction } from './console/TriviaConsole';
import { exactDiamonds } from './tournaments/tournamentModel.mjs';

export default function MonthlyChampionshipPanel() {
    const [includeHorses, setIncludeHorses] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);

    const loadStandings = useCallback(async (signal) => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(
                `/api/trivia/championship?includeHorses=${includeHorses ? 'true' : 'false'}&limit=50`,
                { method: 'GET', cache: 'no-store', signal },
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(payload?.error || 'Could Not Load Championship Standings.');
            }
            setData(payload);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            setError('Could Not Load Monthly Championship Standings Right Now.');
        } finally {
            setLoading(false);
        }
    }, [includeHorses]);

    useEffect(() => {
        const controller = new AbortController();
        void loadStandings(controller.signal);
        return () => controller.abort();
    }, [loadStandings]);

    const items = Array.isArray(data?.items) ? data.items : [];

    return (
        <section className="tt-section" aria-labelledby="tt-championship-title" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="tt-section-head">
                <h2 id="tt-championship-title" className="tc-label">Monthly Trivia Championship</h2>
                <span className="tc-ink--gold">{data?.month || 'Current Month'} CT</span>
            </div>

            <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0 }}>
                Points Per Settled Nightly: 1st 100 | 2nd 75 | 3rd To 4th 50 | Top 8 30 | Top 16 15 | Cash 10 | Entry 5.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="tc-ink--silver">
                    Settled Nightlies: {exactDiamonds(data?.settledTournaments || 0)}
                </span>
                <TriviaGlassAction
                    label={includeHorses ? 'Showing Humans And Horses' : 'Humans Only (Default)'}
                    ink={includeHorses ? 'blue' : 'green'}
                    onClick={() => setIncludeHorses((prev) => !prev)}
                />
            </div>

            {loading ? (
                <p className="trivia-console-copy tc-ink--muted">Loading Monthly Championship Standings...</p>
            ) : null}

            {error ? (
                <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p className="trivia-console-copy tc-ink--red" style={{ margin: 0 }}>{error}</p>
                    <TriviaGlassAction label="Retry Standings" ink="red" onClick={() => loadStandings()} />
                </div>
            ) : null}

            {!loading && !error && items.length === 0 ? (
                <p className="trivia-console-copy tc-ink--muted">
                    No Settled Public Nightly Tournaments Recorded For This Month Yet. Enter Tonight At 8 PM CT To Claim The Opening Lead.
                </p>
            ) : null}

            {!loading && !error && items.length > 0 ? (
                <ul className="tc-rows" aria-label="Monthly Championship Leaderboard">
                    {items.map((row) => (
                        <li key={`${row.participantId}-${row.rank}`} className="tc-row">
                            <span className="tc-row__label">
                                #{row.rank} {row.displayName}{row.participantKind === 'horse' ? ' (Smarter Horse)' : ''}
                            </span>
                            <span className="tc-row__value tc-ink--gold">
                                {exactDiamonds(row.points)} Pts | {row.wins}W | {row.cashes} Cash | {exactDiamonds(row.totalPayout)} Diamonds
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
