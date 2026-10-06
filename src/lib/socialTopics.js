/**
 * socialTopics.js
 * ─────────────────────────────────────────────────────────────────
 * The one topics rule for social_posts, mirrored in JavaScript.
 *
 * social_posts.topic is the single primary domain (CHECK-constrained:
 * unknown | poker | cash | tournament | slots | sports | other) and
 * social_posts.topics is [primary, facets...]: distinct, lower-case, at most
 * MAX_TOPICS elements, element 1 always equal to topic. The database derives
 * the pair with public.fn_social_post_topics inside a BEFORE INSERT OR UPDATE
 * trigger; this module is the pure mirror of that function so a writer in
 * this repository (create-post.js) can send the same answer from the first
 * write and unit tests can pin the rules without a database.
 *
 * Derivation (first match sets the primary, facets accumulate):
 *   1. primary from `topic`; cash and tournament become a facet under poker;
 *      anything outside the CHECK list becomes unknown.
 *   2. if still unknown, from the supplied `topics` (poker, cash or
 *      tournament -> poker; slots -> slots; sports -> sports). Facets a writer
 *      supplied in `topics` are kept when they are real facets.
 *   3. facets from metadata (grounded_type, puzzle, phase7_mode, phase6_mode,
 *      news_box, news_type, source, video_type); if still unknown, the
 *      primary a post declares about itself: shared_reel_topic, then topic,
 *      then clip_type (poker or sports). The horse video publisher and the
 *      player Reel publisher both write metadata.topic, so a Sports video is
 *      Sports by the same rule whoever posted it.
 *   4. facets from content (a card token means the post carries a hand).
 *   5. facets from content_type (tips and articles are strategy).
 *   6. if the primary is still unknown and any poker facet was found -> poker.
 *   7. [primary, facets in FACET_ORDER], never empty, never longer than 4.
 *
 * Horses are players: every post is classified by what it carries, never
 * by who wrote it or how it was produced.
 */

export const PRIMARY_TOPICS = Object.freeze([
    'unknown', 'poker', 'cash', 'tournament', 'slots', 'sports', 'other',
]);

// Fixed facet order: the order of the final array after the primary.
export const TOPIC_FACETS = Object.freeze([
    'cash', 'tournament', 'hand', 'session', 'puzzle', 'story', 'news', 'club', 'local', 'strategy',
]);

// Every value ?topic= may carry on the feed: the primaries a reader can ask
// for plus every facet.
export const FEED_TOPICS = Object.freeze([
    'poker', 'sports', 'slots', 'cash', 'tournament', 'news', 'hand', 'session',
    'puzzle', 'story', 'club', 'local', 'strategy',
]);

export const MAX_TOPICS = 4;

// A Phase 5 card token: [[sp-card:As]]. The same pattern the SQL rule uses.
export const CARD_TOKEN_RE = /\[\[sp-card:[2-9TJQKA][cdhs]\]\]/;

const PRIMARY_SET = new Set(PRIMARY_TOPICS);
const FACET_SET = new Set(TOPIC_FACETS);
const FORMAT_FACETS = new Set(['cash', 'tournament']);
const STRATEGY_CONTENT_TYPES = new Set([
    'article', 'gto_concept', 'poker_math', 'hand_reading', 'quick_tip', 'strategy_tip',
]);

function norm(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
}

function metaText(metadata, key) {
    const value = metadata[key];
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return '';
    return norm(value);
}

function metaPresent(metadata, key) {
    const value = metadata[key];
    return value !== null && value !== undefined;
}

function primaryFrom(value, facets) {
    const candidate = norm(value);
    if (FORMAT_FACETS.has(candidate)) {
        facets.add(candidate);
        return 'poker';
    }
    return PRIMARY_SET.has(candidate) ? candidate : 'unknown';
}

/**
 * Derive { topic, topics } for a social post from what the writer knows.
 * Pure: no I/O, no clock, never throws on odd input, never returns null.
 */
export function deriveSocialPostTopics(input) {
    const {
        topic = null,
        topics = null,
        content = null,
        contentType = null,
        metadata = null,
    } = input && typeof input === 'object' ? input : {};
    const facets = new Set();
    const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    const type = norm(contentType);

    // 1. primary from the supplied topic.
    let primary = primaryFrom(topic, facets);

    // 2. supplied topics: a primary when we have none, facets when they are real.
    const supplied = (Array.isArray(topics) ? topics : []).map(norm).filter(Boolean);
    if (primary === 'unknown') {
        if (supplied.some(value => value === 'poker' || FORMAT_FACETS.has(value))) primary = 'poker';
        else if (supplied.includes('slots')) primary = 'slots';
        else if (supplied.includes('sports')) primary = 'sports';
    }
    for (const value of supplied) {
        if (FACET_SET.has(value)) facets.add(value);
    }

    // 3. facets from metadata.
    const groundedType = metaText(meta, 'grounded_type');
    if (groundedType === 'hand') facets.add('hand');
    if (groundedType === 'session') facets.add('session');
    const phase7Mode = metaText(meta, 'phase7_mode');
    if (Object.hasOwn(meta, 'puzzle') || phase7Mode.startsWith('puzzle_')) {
        facets.add('hand');
        facets.add('puzzle');
    }
    if (phase7Mode.startsWith('story_')) facets.add('story');
    const phase6Mode = metaText(meta, 'phase6_mode');
    if (phase6Mode === 'club_data_digest') facets.add('club');
    if (phase6Mode === 'local_event' || phase6Mode === 'seasonal_local') facets.add('local');
    const newsBox = metaText(meta, 'news_box');
    if (metaPresent(meta, 'news_box') || metaPresent(meta, 'news_type') || type === 'news') {
        facets.add('news');
        if (newsBox === '2' || newsBox === '4') facets.add('tournament');
    }
    if (metaText(meta, 'source') === 'social_page_post') facets.add('club');
    const videoType = metaText(meta, 'video_type');
    if (FORMAT_FACETS.has(videoType)) facets.add(videoType);
    if (primary === 'unknown' && metaPresent(meta, 'shared_reel_topic')) {
        primary = primaryFrom(meta.shared_reel_topic, facets);
    }
    if (primary === 'unknown' && metaPresent(meta, 'topic')) {
        primary = primaryFrom(meta.topic, facets);
    }
    if (primary === 'unknown') {
        const clipType = metaText(meta, 'clip_type');
        if (clipType === 'poker' || clipType === 'sports') primary = clipType;
    }

    // 4. facets from content.
    if (typeof content === 'string' && CARD_TOKEN_RE.test(content)) facets.add('hand');

    // 5. facets from content_type.
    if (type === 'tournament_tip') {
        facets.add('tournament');
        facets.add('strategy');
    } else if (STRATEGY_CONTENT_TYPES.has(type)) {
        facets.add('strategy');
    }

    // 6. every facet producer on this platform is poker-only.
    if (primary === 'unknown' && facets.size > 0) primary = 'poker';

    // 7. [primary, facets in fixed order], at most MAX_TOPICS elements.
    const ordered = TOPIC_FACETS.filter(facet => facets.has(facet) && facet !== primary);
    const result = [primary, ...ordered].slice(0, MAX_TOPICS);
    return { topic: primary, topics: result };
}

export function isFeedTopic(value) {
    return typeof value === 'string' && FEED_TOPICS.includes(value);
}
