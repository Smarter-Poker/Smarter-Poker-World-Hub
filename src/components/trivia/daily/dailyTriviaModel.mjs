const CHICAGO = 'America/Chicago';
const chicagoDate = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function getChicagoDateParts(date) {
    const parts = chicagoDate.formatToParts(date);
    const pick = type => parts.find(part => part.type === type)?.value || '';
    return { year: pick('year'), month: pick('month'), day: pick('day') };
}

function getChicagoMidnightOffset(date) {
    const probe = new Date(`${date}T06:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CHICAGO,
        timeZoneName: 'short',
    }).formatToParts(probe);
    return parts.find(part => part.type === 'timeZoneName')?.value === 'CDT' ? '-05:00' : '-06:00';
}

function pad(value) {
    return String(value).padStart(2, '0');
}

/** Return the next America/Chicago midnight without parsing a locale string. */
export function getNextDailyReset(now = new Date()) {
    const instant = now instanceof Date ? now : new Date(now);
    const { year, month, day } = getChicagoDateParts(instant);
    const nextCalendarDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
    const date = `${nextCalendarDay.getUTCFullYear()}-${pad(nextCalendarDay.getUTCMonth() + 1)}-${pad(nextCalendarDay.getUTCDate())}`;
    const iso = `${date}T00:00:00${getChicagoMidnightOffset(date)}`;
    return { date, iso, timestamp: new Date(iso).getTime() };
}

export function formatDailyResetCountdown(now = new Date()) {
    const instant = now instanceof Date ? now : new Date(now);
    const remainingMs = Math.max(0, getNextDailyReset(instant).timestamp - instant.getTime());
    const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function projectDailyAttempt({ signedIn, online = true, status = 'loading', completed = false, recoverable = false } = {}) {
    if (!online) {
        return {
            key: 'offline',
            label: 'Connection Offline',
            detail: 'Reconnect before starting or resuming a server-verified run.',
            ink: 'red',
        };
    }
    if (!signedIn) {
        return {
            key: 'signed-out',
            label: 'Sign In Required',
            detail: 'Daily results, rewards and streaks are tied to your account.',
            ink: 'blue',
        };
    }
    if (status === 'error') {
        return {
            key: 'error',
            label: 'Status Unavailable',
            detail: 'Your attempt status could not be verified. Retry before starting.',
            ink: 'red',
        };
    }
    if (status !== 'ready') {
        return {
            key: 'loading',
            label: 'Checking Today’s Attempt',
            detail: 'Verifying your streak and completion record.',
            ink: 'blue',
        };
    }
    if (recoverable) {
        return {
            key: 'recoverable',
            label: 'Run Ready To Resume',
            detail: 'Continue the server-verified run already attached to your account.',
            ink: 'gold',
        };
    }
    if (completed) {
        return {
            key: 'completed',
            label: 'Completed Today',
            detail: 'Today’s completion bonus is settled. Practice runs remain available.',
            ink: 'green',
        };
    }
    return {
        key: 'available',
        label: 'Attempt Available',
        detail: 'Complete all ten server-graded questions to settle today’s bonus.',
        ink: 'green',
    };
}

export function normalizeDailyLeaderboard(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
        .filter(row => row && typeof row.userId === 'string')
        .slice(0, 10)
        .map(row => ({
            userId: row.userId,
            username: typeof row.username === 'string' && row.username.trim() ? row.username.trim() : 'Player',
            streak: Math.max(0, Math.floor(Number(row.streak) || 0)),
            bestStreak: Math.max(0, Math.floor(Number(row.bestStreak) || 0)),
            accuracy: Math.min(100, Math.max(0, Math.round(Number(row.accuracy) || 0))),
            gamesPlayed: Math.max(0, Math.floor(Number(row.gamesPlayed) || 0)),
        }));
}

export function projectDailyResume(questions) {
    const roster = Array.isArray(questions) ? questions : [];
    const firstOutstanding = roster.findIndex(question => !['answered', 'timeout'].includes(question?.state));
    const questionIndex = firstOutstanding < 0 ? roster.length : firstOutstanding;
    const answers = Array(questionIndex);
    const verdicts = {};
    let correctCount = 0;
    let streak = 0;

    for (let index = 0; index < questionIndex; index += 1) {
        const answerState = roster[index]?.answerState;
        if (answerState && Number.isInteger(answerState.storedDisplayIndex)) {
            answers[index] = answerState.storedDisplayIndex;
            verdicts[index] = answerState;
            if (answerState.wasCorrect === true) {
                correctCount += 1;
                streak += 1;
            } else if (!['skip', 'voided'].includes(answerState.outcome)) {
                streak = 0;
            }
        } else {
            // Timeout/legacy projections may only expose terminal state. Leave
            // the answer absent; settlement reads the durable server sequence.
            streak = 0;
        }
    }

    return {
        complete: roster.length > 0 && firstOutstanding < 0,
        questionIndex,
        answers,
        verdicts,
        correctCount,
        streak,
    };
}
