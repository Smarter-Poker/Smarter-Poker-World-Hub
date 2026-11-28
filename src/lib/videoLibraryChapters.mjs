// CREATOR CHAPTERS (2026-11-27). The only chapters the watch page shows are
// the creator's own, read from the YouTube description at ingest by
// scripts/video_source_registry_ingest.py and stored on
// video_enrichment_records.chapters with source 'creator_description'.
// This reader re-checks YouTube's own rules on the way out (first at 0:00, at
// least three, ascending, ten seconds apart, inside the video) so an unmarked
// or malformed value, such as the retired "Video Start" placeholder, can never
// reach a player. Titles are the creator's words and keep their own case.
export const CREATOR_CHAPTER_SOURCE = 'creator_description';
export const CHAPTER_MIN_COUNT = 3;
export const CHAPTER_MIN_SECONDS = 10;
export const CHAPTER_MAX_COUNT = 100;
const TITLE_MAX = 160;

export function creatorChapters(stored, durationSeconds = 0) {
    if (!Array.isArray(stored) || stored.length < CHAPTER_MIN_COUNT || stored.length > CHAPTER_MAX_COUNT) return [];
    const chapters = [];
    for (const entry of stored) {
        if (!entry || typeof entry !== 'object' || entry.source !== CREATOR_CHAPTER_SOURCE) return [];
        const startSeconds = entry.start_seconds;
        const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, TITLE_MAX) : '';
        if (!Number.isInteger(startSeconds) || startSeconds < 0 || !title) return [];
        const previous = chapters[chapters.length - 1];
        if (previous ? startSeconds - previous.startSeconds < CHAPTER_MIN_SECONDS : startSeconds !== 0) return [];
        chapters.push({ startSeconds, title });
    }
    const duration = Number(durationSeconds);
    if (Number.isFinite(duration) && duration > 0 && chapters[chapters.length - 1].startSeconds > duration - CHAPTER_MIN_SECONDS) return [];
    return chapters;
}
