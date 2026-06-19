import { NextApiRequest, NextApiResponse } from 'next';

// ─────────────────────────────────────────────────────────────────────────────
// /api/mlb/hr-tracker
// Fetches home run data from the public MLB Stats API.
// Computes per-player: HR count, games played, HR rate (games/HR),
// last HR date, games since last HR, and a "due score" for betting.
//
// Due Score = games_since_last_hr / games_per_hr
//   > 1.25 = OVERDUE (strong alert)
//   0.75–1.25 = DUE (approaching)
//   < 0.75 = RECENT (hit recently)
// ─────────────────────────────────────────────────────────────────────────────

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const CURRENT_SEASON = new Date().getFullYear();

interface HRTrackerEntry {
    player_id: number;
    full_name: string;
    team_id: number;
    team_name: string;
    hr: number;
    games_played: number;
    games_per_hr: number;          // e.g. 6.3
    last_hr_date: string | null;   // ISO date string or null
    days_since_hr: number | null;
    games_since_hr: number | null; // estimated: days_since_hr * 0.85 capped at games_played
    due_score: number;             // games_since_hr / games_per_hr
    status: 'OVERDUE' | 'DUE' | 'RECENT' | 'NO_HR';
}

function computeStatus(dueScore: number, hr: number): HRTrackerEntry['status'] {
    if (hr === 0) return 'NO_HR';
    if (dueScore >= 1.25) return 'OVERDUE';
    if (dueScore >= 0.75) return 'DUE';
    return 'RECENT';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sortBy = (req.query.sort as string) || 'due_score';
    const filterStatus = req.query.status as string | undefined;
    const limit = parseInt((req.query.limit as string) || '200', 10);

    try {
        // ── 1. Fetch season HR stats from MLB Stats API ───────────────────
        const statsUrl = `${MLB_API}/stats?stats=season&group=hitting&season=${CURRENT_SEASON}&playerPool=All&limit=500&fields=stats,splits,player,id,fullName,team,id,name,stat,homeRuns,gamesPlayed`;

        const statsRes = await fetch(statsUrl, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'SmarterPoker/1.0' },
            signal: AbortSignal.timeout(10000),
        });

        if (!statsRes.ok) {
            throw new Error(`MLB Stats API error: ${statsRes.status}`);
        }

        const statsJson = await statsRes.json();
        const splits: any[] = statsJson?.stats?.[0]?.splits || [];

        if (splits.length === 0) {
            return res.status(200).json({ players: [], updatedAt: new Date().toISOString() });
        }

        // ── 2. Build player list with HR data ─────────────────────────────
        // Only include players with at least 1 HR and 10+ games
        const eligiblePlayers = splits.filter(
            (s: any) => s.stat?.homeRuns >= 1 && s.stat?.gamesPlayed >= 10
        );

        // ── 3. Fetch last HR dates in parallel (batched) ─────────────────
        // MLB Stats API: /people/{id}/stats?stats=gameLog&group=hitting&season=YYYY
        // We fetch the last 30 game log entries per player and scan for the last HR game.
        // Batch in groups of 30 to avoid hammering the API.
        const BATCH_SIZE = 30;
        const results: HRTrackerEntry[] = [];

        for (let i = 0; i < Math.min(eligiblePlayers.length, limit); i += BATCH_SIZE) {
            const batch = eligiblePlayers.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.allSettled(
                batch.map(async (split: any) => {
                    const playerId: number = split.player?.id;
                    const fullName: string = split.player?.fullName || 'Unknown';
                    const teamId: number = split.team?.id || 0;
                    const teamName: string = split.team?.name || 'Unknown';
                    const hr: number = split.stat?.homeRuns || 0;
                    const gamesPlayed: number = split.stat?.gamesPlayed || 0;

                    const gamesPerHr = hr > 0 ? parseFloat((gamesPlayed / hr).toFixed(1)) : 999;

                    // Fetch game log to find last HR date
                    let lastHrDate: string | null = null;
                    let daysSinceHr: number | null = null;
                    let gamesSinceHr: number | null = null;

                    try {
                        const logUrl = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${CURRENT_SEASON}&fields=stats,splits,date,stat,homeRuns`;
                        const logRes = await fetch(logUrl, {
                            headers: { 'Accept': 'application/json' },
                            signal: AbortSignal.timeout(5000),
                        });

                        if (logRes.ok) {
                            const logJson = await logRes.json();
                            const gameSplits: any[] = logJson?.stats?.[0]?.splits || [];

                            // Find the most recent game with at least 1 HR
                            // Game log is in ascending date order, so reverse to find most recent
                            const sorted = [...gameSplits].reverse();
                            const lastHrGame = sorted.find((g: any) => (g.stat?.homeRuns || 0) >= 1);

                            if (lastHrGame?.date) {
                                lastHrDate = lastHrGame.date;
                                const hrDate = new Date(lastHrDate);
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                daysSinceHr = Math.floor(
                                    (today.getTime() - hrDate.getTime()) / (1000 * 60 * 60 * 24)
                                );
                                // Estimate games since HR: MLB teams play ~162 games / ~180 days
                                // = ~0.9 games/day. Cap at total games played.
                                gamesSinceHr = Math.min(
                                    Math.round(daysSinceHr * 0.9),
                                    gamesPlayed
                                );
                            }
                        }
                    } catch {
                        // Game log fetch failed — compute due score without last HR date
                    }

                    const dueScore = (gamesSinceHr != null && gamesPerHr > 0)
                        ? parseFloat((gamesSinceHr / gamesPerHr).toFixed(2))
                        : 0;

                    return {
                        player_id: playerId,
                        full_name: fullName,
                        team_id: teamId,
                        team_name: teamName,
                        hr,
                        games_played: gamesPlayed,
                        games_per_hr: gamesPerHr,
                        last_hr_date: lastHrDate,
                        days_since_hr: daysSinceHr,
                        games_since_hr: gamesSinceHr,
                        due_score: dueScore,
                        status: computeStatus(dueScore, hr),
                    } as HRTrackerEntry;
                })
            );

            batchResults.forEach(r => {
                if (r.status === 'fulfilled') results.push(r.value);
            });
        }

        // ── 4. Sort ───────────────────────────────────────────────────────
        const sortFns: Record<string, (a: HRTrackerEntry, b: HRTrackerEntry) => number> = {
            due_score: (a, b) => b.due_score - a.due_score,
            hr: (a, b) => b.hr - a.hr,
            games_since_hr: (a, b) => (b.games_since_hr ?? 0) - (a.games_since_hr ?? 0),
            games_per_hr: (a, b) => a.games_per_hr - b.games_per_hr,
        };
        results.sort(sortFns[sortBy] || sortFns.due_score);

        // ── 5. Optionally filter by status ────────────────────────────────
        const filtered = filterStatus
            ? results.filter(p => p.status === filterStatus.toUpperCase())
            : results;

        return res.status(200).json({
            players: filtered,
            total: filtered.length,
            season: CURRENT_SEASON,
            updatedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[hr-tracker] Fatal error:', err);
        return res.status(500).json({
            error: 'Failed to fetch HR tracker data',
            players: [],
        });
    }
}
