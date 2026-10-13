/** Browsing matches only explicit published titles and tags, never enrichment guesses. */
const definitions = {
    game: {
        holdem: { label: "Hold'em", terms: ['hold.?em', 'nlh', 'nlhe', 'no[ -]?limit[ -]?hold.?em'], tags: ["hold'em", 'holdem', 'hold em', 'nlh', 'nlhe', 'no limit holdem'] },
        omaha: { label: 'Omaha', terms: ['omaha', 'plo[458]?', 'pot[ -]?limit[ -]?omaha'], tags: ['omaha', 'plo', 'plo4', 'plo5', 'plo8', 'pot limit omaha'] },
    },
    stakes: {
        low: { label: 'Low Stakes', terms: ['low[ -]?stakes', 'micro[ -]?stakes'], tags: ['low stakes', 'low-stakes', 'microstakes', 'micro stakes'] },
        mid: { label: 'Mid Stakes', terms: ['(mid|medium|middle)[ -]?stakes'], tags: ['mid stakes', 'mid-stakes', 'medium stakes', 'middle stakes'] },
        high: { label: 'High Stakes', terms: ['high[ -]?stakes'], tags: ['high stakes', 'high-stakes'] },
    },
    skill: {
        beginner: { label: 'Beginner', terms: ['beginner(s)?'], tags: ['beginner', 'beginners'] },
        intermediate: { label: 'Intermediate', terms: ['intermediate'], tags: ['intermediate'] },
        advanced: { label: 'Advanced', terms: ['advanced'], tags: ['advanced'] },
    },
};

export const BROWSE_FILTER_OPTIONS = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([key, values]) => [key,
    Object.freeze([{ id: 'ALL', label: 'All' }, ...Object.entries(values).map(([id, item]) => ({ id, label: item.label }))]),
])));

export function normalizeBrowseFilter(value, key) {
    const first = Array.isArray(value) ? value[0] : value;
    const id = String(first || '').trim().toLowerCase();
    return Object.hasOwn(definitions[key] || {}, id) ? id : 'ALL';
}

export function normalizeBrowseFilters(query = {}) {
    return Object.fromEntries(Object.keys(definitions).map(key => [key, normalizeBrowseFilter(query[key], key)]));
}

function pattern(item, boundary) {
    return `(^|[^${boundary}])(${item.terms.join('|')})($|[^${boundary}])`;
}

export function matchesBrowseFilters(video, filters = {}) {
    const normalized = normalizeBrowseFilters(filters);
    const title = String(video?.rawTitle || video?.title || '');
    const tags = new Set((Array.isArray(video?.tags) ? video.tags : []).filter(tag => typeof tag === 'string').map(tag => tag.trim().toLowerCase()));
    return Object.entries(normalized).every(([key, id]) => {
        if (id === 'ALL') return true;
        const item = definitions[key][id];
        return new RegExp(pattern(item, 'a-z0-9'), 'i').test(title) || item.tags.some(tag => tags.has(tag));
    });
}

/** Fixed constants only: no user text is interpolated into PostgREST syntax. */
export function applyBrowseQueryFilters(query, filters = {}) {
    for (const [key, id] of Object.entries(normalizeBrowseFilters(filters))) {
        if (id === 'ALL') continue;
        const item = definitions[key][id];
        const tagVariants = [...new Set(item.tags.flatMap(tag => [tag, tag.toUpperCase(), tag.replace(/\b[a-z]/g, char => char.toUpperCase())]))];
        const clauses = [`title.imatch."${pattern(item, '[:alnum:]')}"`,
            ...tagVariants.map(tag => `tags.cs.{"${tag}"}`)];
        query = query.or(clauses.join(','));
    }
    return query;
}
