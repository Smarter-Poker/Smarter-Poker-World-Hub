export const RECENT_SEARCH_KEY = 'video-library-recent-searches-v1';
export const RECENT_SEARCH_LIMIT = 8;

export function cleanRecentSearch(value) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : '';
}

export function normalizeRecentSearches(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    return values.reduce((result, value) => {
        const text = cleanRecentSearch(value);
        const key = text.toLocaleLowerCase();
        if (text && !seen.has(key) && result.length < RECENT_SEARCH_LIMIT) {
            result.push(text);
            seen.add(key);
        }
        return result;
    }, []);
}

export function rememberSearch(values, text) {
    return normalizeRecentSearches([text, ...normalizeRecentSearches(values)]);
}

export function readRecentSearches(storage) {
    try { return normalizeRecentSearches(JSON.parse(storage.getItem(RECENT_SEARCH_KEY) || '[]')); }
    catch { return []; }
}

export function writeRecentSearches(storage, values) {
    try {
        const clean = normalizeRecentSearches(values);
        if (clean.length) storage.setItem(RECENT_SEARCH_KEY, JSON.stringify(clean));
        else storage.removeItem(RECENT_SEARCH_KEY);
        return true;
    } catch { return false; }
}
