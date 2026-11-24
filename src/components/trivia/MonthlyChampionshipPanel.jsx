import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '../../lib/authUtils';
import { TriviaGlassAction } from './console/TriviaConsole';
import { exactDiamonds } from './tournaments/tournamentModel.mjs';

const BADGE_INK = Object.freeze({
    monthly_champion: 'tc-ink--gold',
    top_3_finisher: 'tc-ink--green',
    top_20_qualifier: 'tc-ink--blue',
});

export default function MonthlyChampionshipPanel() {
    const [includeHorses, setIncludeHorses] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);

    const loadStandings = useCallback(async (signal) => {
        setLoading(true);
        setError('');
        try {
            const response = await authedFetch(
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
    const eventStatus = data?.eventStatus || null;
    const awards = Array.isArray(data?.awards)
        ? data.awards
        : (Array.isArray(eventStatus?.awards) ? eventStatus.awards : []);
    const qualifierCutoff = Number(eventStatus?.qualifierCutoff ?? eventStatus?.qualifier_cutoff ?? 20);
    const eventDate = eventStatus?.eventLocalDate || eventStatus?.event_local_date || null;
    const eventTimeLabel = eventStatus?.eventLocalTimeLabel || eventStatus?.event_local_time_label || '8:00 PM CT';
    const viewerQualified = eventStatus?.viewerQualified === true || eventStatus?.viewer_qualified === true;
    const viewerRank = eventStatus?.viewerRank ?? eventStatus?.viewer_rank ?? null;
    const viewerBadges = Array.isArray(eventStatus?.viewerBadges)
        ? eventStatus.viewerBadges
        : (Array.isArray(eventStatus?.viewer_badges) ? eventStatus.viewer_badges : []);

    return (
        <section className="tt-section" aria-labelledby="tt-championship-title" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="tt-section-head">
                <h2 id="tt-championship-title" className="tc-label">Monthly Trivia Championship</h2>
                <span className="tc-ink--gold">{data?.month || 'Current Month'} CT</span>
            </div>

            {eventStatus ? (
                <div
                    role="region"
                    aria-label="End-Of-Month Championship Event Status"
                    style={{
                        border: '1px solid #ffd700',
                        background: '#050607',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '6px 12px', alignItems: 'baseline' }}>
                        <span className="tc-label tc-ink--gold">End-Of-Month Championship Event</span>
                        <span className="tc-ink--blue">
                            {eventDate ? `${eventDate} At ${eventTimeLabel}` : eventTimeLabel}
                        </span>
                    </div>
                    <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>
                        Top {qualifierCutoff} Human Finishers Qualify For The Monthly Championship Finale And Permanent Season Badges.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center' }}>
                        <span className={viewerQualified ? 'tc-ink--green' : 'tc-ink--muted'}>
                            {viewerQualified
                                ? `Your Status: Qualified${viewerRank ? ` (#${viewerRank} In Top ${qualifierCutoff})` : ''}`
                                : `Your Status: Play Nightlies To Reach Top ${qualifierCutoff}`}
                        </span>
                        {viewerBadges.length > 0 ? (
                            <span className="tc-ink--gold">
                                Permanent Badges Held: {viewerBadges.map((b) => `${b.titleLabel} (${b.seasonMonth})`).join(', ')}
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : null}

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

            {awards.length > 0 ? (
                <div
                    role="region"
                    aria-label="Permanent Monthly Championship Badges"
                    style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                    <h3 className="tc-label tc-ink--gold" style={{ margin: 0 }}>Permanent Championship Badges Awarded</h3>
                    <ul className="tc-rows" aria-label="Permanent Championship Badge Winners">
                        {awards.map((award) => (
                            <li key={award.id || `${award.userId}-${award.rank}`} className="tc-row">
                                <span className="tc-row__label">
                                    #{award.rank} {award.displayName}
                                </span>
                                <span className={`tc-row__value ${BADGE_INK[award.badgeCode] || 'tc-ink--gold'}`}>
                                    {award.titleLabel} | {exactDiamonds(award.points)} Pts
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>
                    Permanent Season Titles: Rank 1 Monthly Trivia Champion | Ranks 2 To 3 Monthly Podium Finisher | Ranks 4 To 20 Championship Qualifier.
                </p>
            )}

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
                    {items.map((row) => {
                        const isQualified = row.participantKind !== 'horse' && Number(row.rank) <= qualifierCutoff;
                        return (
                            <li key={`${row.participantId}-${row.rank}`} className="tc-row">
                                <span className="tc-row__label">
                                    #{row.rank} {row.displayName}{row.participantKind === 'horse' ? ' (Smarter Horse)' : ''}{isQualified ? ' [Top 20 Qualifier]' : ''}
                                </span>
                                <span className="tc-row__value tc-ink--gold">
                                    {exactDiamonds(row.points)} Pts | {row.wins}W | {row.cashes} Cash | {exactDiamonds(row.totalPayout)} Diamonds
                                </span>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </section>
    );
}
