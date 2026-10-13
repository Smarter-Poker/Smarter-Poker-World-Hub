// Read-only presentation of actual video-watch rewards, using the reward day.
export const STUDY_TIME_ZONE = 'America/Chicago';
export function studyDay(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: STUDY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function summarizeVideoStudy(rows, now = new Date()) {
    const today = studyDay(now);
    if (!today) throw new Error('Invalid study clock');
    const days = new Set();
    let diamondsToday = 0;
    let rewardedVideosToday = 0;
    for (const row of rows || []) {
        const amount = Number(row.amount);
        const timestamp = Date.parse(row.created_at);
        if (!(amount > 0) || !Number.isFinite(amount) || !Number.isFinite(timestamp) || timestamp > Number(now)) continue;
        const day = studyDay(timestamp);
        days.add(day);
        if (day === today) { diamondsToday += amount; rewardedVideosToday += 1; }
    }
    const cursor = new Date(`${today}T12:00:00Z`);
    const studiedToday = days.has(today);
    if (!studiedToday) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let currentStreak = 0;
    while (currentStreak < 366 && days.has(cursor.toISOString().slice(0, 10))) {
        currentStreak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return { currentStreak, streakAtLeast: currentStreak === 366, studiedToday, diamondsToday, rewardedVideosToday, timeZone: STUDY_TIME_ZONE, basis: 'rewarded_video_watch_days', asOf: new Date(now).toISOString() };
}
