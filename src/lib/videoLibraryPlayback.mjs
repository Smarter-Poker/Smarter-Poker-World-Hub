export const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';
export const PLAYER_ORIGINS = new Set([PLAYER_ORIGIN, 'https://www.youtube.com']);

export function playbackMessage(event, playerWindow) {
    if (!playerWindow || event.source !== playerWindow || !PLAYER_ORIGINS.has(event.origin)) return null;
    try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        return data && typeof data === 'object' ? data : null;
    } catch { return null; }
}

export function boundedPosition(position, duration) {
    const value = Number(position);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.min(value, Math.max(0, Number(duration) || 0));
}

export function timestamp(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    return `${hours ? `${hours}:` : ''}${hours ? String(Math.floor(value / 60) % 60).padStart(2, '0') : Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function addHandMarker(markers, position, duration) {
    const value = boundedPosition(position, duration);
    if (value === null || !(duration > 0) || markers.length >= 50) return markers;
    const second = Math.floor(value);
    if (markers.includes(second)) return markers;
    return [...markers, second].sort((a, b) => a - b);
}
