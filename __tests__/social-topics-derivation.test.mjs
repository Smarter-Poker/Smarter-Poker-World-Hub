/**
 * Phase 8: social post topics are derived by one rule, mirrored in
 * src/lib/socialTopics.js. These pin the JavaScript mirror of
 * public.fn_social_post_topics step by step, and prove create-post.js writes
 * the derived pair on both of its paths, so a human card post is
 * { poker, [poker, hand] } from its first write and the Hands tab sees it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
    CARD_TOKEN_RE,
    FEED_TOPICS,
    MAX_TOPICS,
    PRIMARY_TOPICS,
    TOPIC_FACETS,
    deriveSocialPostTopics,
    isFeedTopic,
} from '../src/lib/socialTopics.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const TOPICS_SOURCE = read('../src/lib/socialTopics.js');
const RANKING_SOURCE = read('../src/lib/feedRanking.js');
const CREATE_POST_SOURCE = read('../pages/api/social/create-post.js');

const derive = input => deriveSocialPostTopics(input).topics;
// U+2013 and U+2014, built from code points so this file carries neither.
const DASH_RE = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

test('the taxonomy is the contract: seven primaries, ten facets, thirteen feed topics', () => {
    assert.deepEqual([...PRIMARY_TOPICS], ['unknown', 'poker', 'cash', 'tournament', 'slots', 'sports', 'other']);
    assert.deepEqual([...TOPIC_FACETS], ['cash', 'tournament', 'hand', 'session', 'puzzle', 'story', 'news', 'club', 'local', 'strategy']);
    assert.deepEqual([...FEED_TOPICS], [
        'poker', 'sports', 'slots', 'cash', 'tournament', 'news', 'hand', 'session',
        'puzzle', 'story', 'club', 'local', 'strategy',
    ]);
    assert.equal(MAX_TOPICS, 4);
    assert.equal(isFeedTopic('hand'), true);
    assert.equal(isFeedTopic('video'), false, 'video is content_type, never a facet');
    assert.equal(isFeedTopic('unknown'), false);
});

test('step 1: the primary comes from topic; cash and tournament become facets under poker', () => {
    assert.deepEqual(deriveSocialPostTopics({ topic: 'poker' }), { topic: 'poker', topics: ['poker'] });
    assert.deepEqual(derive({ topic: 'cash' }), ['poker', 'cash']);
    assert.deepEqual(derive({ topic: ' TOURNAMENT ' }), ['poker', 'tournament'], 'trimmed and lower-cased');
    assert.deepEqual(derive({ topic: 'slots' }), ['slots']);
    assert.deepEqual(derive({ topic: 'sports' }), ['sports']);
    assert.deepEqual(derive({ topic: 'other' }), ['other']);
    assert.deepEqual(derive({ topic: 'video' }), ['unknown'], 'outside the CHECK list becomes unknown');
    assert.deepEqual(derive({ topic: null }), ['unknown']);
    assert.deepEqual(derive({}), ['unknown']);
    assert.deepEqual(derive(), ['unknown']);
});

test('step 2: supplied topics name the primary only when it is unknown, and real facets are kept', () => {
    assert.deepEqual(derive({ topics: ['cash'] }), ['poker', 'cash']);
    assert.deepEqual(derive({ topics: ['tournament'] }), ['poker', 'tournament']);
    assert.deepEqual(derive({ topics: ['slots'] }), ['slots']);
    assert.deepEqual(derive({ topics: ['sports'] }), ['sports']);
    assert.deepEqual(derive({ topics: ['sports', 'slots', 'poker'] }), ['poker'], 'poker outranks slots outranks sports');
    assert.deepEqual(derive({ topics: ['sports', 'slots'] }), ['slots']);
    assert.deepEqual(derive({ topic: 'sports', topics: ['poker'] }), ['sports'], 'a known primary wins over the supplied list');
    assert.deepEqual(derive({ topics: ['poker', 'hand'] }), ['poker', 'hand'], 'the workers helper output round-trips');
    assert.deepEqual(derive({ topic: 'poker', topics: ['poker', 'tournament', 'story'] }), ['poker', 'tournament', 'story']);
    assert.deepEqual(derive({ topics: ['poker', 'video', 'Reel'] }), ['poker'], 'non-facets in the list are dropped');
    assert.deepEqual(derive({ topic: 'poker', topics: 'hand' }), ['poker'], 'a non-array list is ignored');
});

test('step 3: facets from metadata', () => {
    assert.deepEqual(derive({ metadata: { grounded_type: 'hand' } }), ['poker', 'hand']);
    assert.deepEqual(derive({ metadata: { grounded_type: 'session' } }), ['poker', 'session']);
    assert.deepEqual(derive({ metadata: { puzzle: { kind: 'nuts' } } }), ['poker', 'hand', 'puzzle']);
    assert.deepEqual(derive({ metadata: { puzzle: null } }), ['poker', 'hand', 'puzzle'], 'the key alone marks a puzzle');
    assert.deepEqual(derive({ metadata: { phase7_mode: 'puzzle_nuts' } }), ['poker', 'hand', 'puzzle']);
    assert.deepEqual(derive({ metadata: { phase7_mode: 'story_tournament' } }), ['poker', 'story']);
    assert.deepEqual(derive({ metadata: { phase6_mode: 'club_data_digest' } }), ['poker', 'club']);
    assert.deepEqual(derive({ metadata: { phase6_mode: 'local_event' } }), ['poker', 'local']);
    assert.deepEqual(derive({ metadata: { phase6_mode: 'seasonal_local' } }), ['poker', 'local']);
    assert.deepEqual(derive({ metadata: { news_box: 1 } }), ['poker', 'news']);
    assert.deepEqual(derive({ metadata: { news_box: '2' } }), ['poker', 'tournament', 'news']);
    assert.deepEqual(derive({ metadata: { news_box: 4 } }), ['poker', 'tournament', 'news'], 'a numeric box is read as text');
    assert.deepEqual(derive({ metadata: { news_type: 'poker' } }), ['poker', 'news']);
    assert.deepEqual(derive({ metadata: { news_box: null } }), ['unknown'], 'a null box is not present');
    assert.deepEqual(derive({ contentType: 'news' }), ['poker', 'news']);
    assert.deepEqual(derive({ metadata: { source: 'social_page_post' } }), ['poker', 'club']);
    assert.deepEqual(derive({ topic: 'poker', metadata: { video_type: 'cash' } }), ['poker', 'cash'], 'a library video round-trips');
    assert.deepEqual(derive({ topic: 'poker', metadata: { video_type: 'tournament' } }), ['poker', 'tournament']);
    assert.deepEqual(derive({ topic: 'slots', metadata: { video_type: 'slots' } }), ['slots']);
    assert.deepEqual(derive({ metadata: { shared_reel_topic: 'sports' } }), ['sports'], 'a shared reel names the primary when unknown');
    assert.deepEqual(derive({ metadata: { shared_reel_topic: 'cash' } }), ['poker', 'cash']);
    assert.deepEqual(derive({ topic: 'slots', metadata: { shared_reel_topic: 'sports' } }), ['slots'], 'never overrides a known primary');
    assert.deepEqual(derive({ metadata: { shared_reel_topic: 'video' } }), ['unknown']);
    // The declared topic the horse video publisher and the player Reel
    // publisher both write: the same Sports post is Sports for either author.
    assert.deepEqual(derive({ metadata: { topic: 'sports' } }), ['sports'], 'a declared topic names the primary when unknown');
    assert.deepEqual(derive({ metadata: { topic: 'Sports ' } }), ['sports']);
    assert.deepEqual(derive({ metadata: { topic: 'tournament' } }), ['poker', 'tournament']);
    assert.deepEqual(derive({ metadata: { topic: 'video' } }), ['unknown']);
    assert.deepEqual(derive({ metadata: { topic: { a: 1 } } }), ['unknown']);
    assert.deepEqual(derive({ topic: 'poker', metadata: { topic: 'sports' } }), ['poker'], 'never overrides a known primary');
    assert.deepEqual(derive({ metadata: { shared_reel_topic: 'slots', topic: 'sports' } }), ['slots'], 'shared_reel_topic is read first');
    assert.deepEqual(derive({ metadata: { clip_type: 'sports' } }), ['sports'], 'a collector clip type names the primary when unknown');
    assert.deepEqual(derive({ metadata: { clip_type: 'poker' } }), ['poker']);
    assert.deepEqual(derive({ metadata: { clip_type: 'slots' } }), ['unknown'], 'clip_type knows poker and sports only');
    assert.deepEqual(derive({ metadata: { topic: 'unknown', clip_type: 'sports' } }), ['sports']);
    assert.deepEqual(
        derive({ topic: 'sports', topics: ['sports'], contentType: 'video', content: 'What a dunk', metadata: { topic: 'sports', clip_type: 'sports' } }),
        derive({ topic: 'sports', topics: ['sports'], contentType: 'video', content: 'What a dunk', metadata: { topic: 'sports', topic_attested: true } }),
        'a horse Sports video and a player Sports Reel derive the same topics',
    );
});

test('step 4 and 5: a card token means a hand, tips and articles mean strategy', () => {
    assert.equal(CARD_TOKEN_RE.test('Flopped [[sp-card:Ac]] on the button'), true);
    assert.equal(CARD_TOKEN_RE.test('[[sp-card:1c]]'), false);
    assert.equal(CARD_TOKEN_RE.test('sp-card:Ac'), false);
    assert.deepEqual(deriveSocialPostTopics({ content: 'Board [[sp-card:Ac]]' }), { topic: 'poker', topics: ['poker', 'hand'] });
    assert.deepEqual(derive({ content: 'Board [[sp-card:Ac]] [[sp-card:Kd]] [[sp-card:Ts]]' }), ['poker', 'hand'], 'distinct');
    assert.deepEqual(derive({ content: 'no cards here' }), ['unknown']);
    assert.deepEqual(derive({ content: 42 }), ['unknown'], 'non-string content is ignored');
    assert.deepEqual(derive({ contentType: 'tournament_tip' }), ['poker', 'tournament', 'strategy']);
    for (const type of ['article', 'gto_concept', 'poker_math', 'hand_reading', 'quick_tip', 'strategy_tip']) {
        assert.deepEqual(derive({ contentType: type }), ['poker', 'strategy'], type);
    }
    assert.deepEqual(derive({ contentType: 'text' }), ['unknown']);
    assert.deepEqual(derive({ contentType: 'video' }), ['unknown'], 'video is not a facet');
});

test('step 6 and 7: a facet implies poker only when the primary is unknown; the array is ordered, distinct and short', () => {
    assert.deepEqual(derive({ topic: 'sports', metadata: { news_box: 3 } }), ['sports', 'news']);
    assert.deepEqual(derive({ topic: 'other', content: '[[sp-card:2h]]' }), ['other', 'hand']);
    const crowded = derive({
        metadata: { puzzle: {}, phase7_mode: 'story_hand', news_box: '2', video_type: 'cash' },
        contentType: 'tournament_tip',
    });
    assert.equal(crowded.length, MAX_TOPICS);
    assert.deepEqual(crowded, ['poker', 'cash', 'tournament', 'hand'], 'fixed facet order, truncated to four');
    assert.deepEqual(derive({ topic: 'cash', topics: ['cash', 'CASH'], metadata: { video_type: 'cash' } }), ['poker', 'cash']);
});

test('the result is never null, element 1 always equals topic, and garbage never throws', () => {
    const inputs = [
        undefined, null, {}, { topic: 7 }, { topics: 'poker' }, { topics: [null, 3, {}] },
        { metadata: 'nope' }, { metadata: [] }, { metadata: { news_box: {} } }, { content: {} },
        { contentType: ['news'] }, { topic: 'CASH', topics: ['hand'], metadata: { grounded_type: 'hand' }, content: '[[sp-card:Ac]]' },
    ];
    for (const input of inputs) {
        const result = deriveSocialPostTopics(input);
        assert.ok(Array.isArray(result.topics) && result.topics.length >= 1, JSON.stringify(input));
        assert.equal(result.topics[0], result.topic, JSON.stringify(input));
        assert.ok(PRIMARY_TOPICS.includes(result.topic), JSON.stringify(input));
        assert.equal(new Set(result.topics).size, result.topics.length, 'distinct');
        assert.ok(result.topics.length <= MAX_TOPICS);
        for (const value of result.topics.slice(1)) assert.ok(TOPIC_FACETS.includes(value), value);
        for (const value of result.topics) assert.equal(value, value.toLowerCase());
    }
});

test('horses are players: the topics rule and the ranking read no is_horse, origin_type or scheduler flag', () => {
    for (const [label, source] of [['socialTopics', TOPICS_SOURCE], ['feedRanking', RANKING_SOURCE]]) {
        assert.doesNotMatch(source, /is_horse|origin_type|scheduler/, label);
        assert.doesNotMatch(source, DASH_RE, `${label} must not use an en dash or em dash`);
    }
});

function compileCreatePost(mocks) {
    const code = ts.transpileModule(CREATE_POST_SOURCE, {
        fileName: 'create-post.js',
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        throw new Error(`Unexpected dependency: ${name}`);
    }, module, module.exports);
    return module.exports.default;
}

function fakeSupabase({ rpcResult = null, rpcError = null } = {}) {
    const log = { rpc: [], inserts: [], updates: [] };
    const client = {
        rpc: async (name, args) => { log.rpc.push({ name, args }); return { data: rpcResult, error: rpcError }; },
        from: table => ({
            insert: payload => {
                log.inserts.push({ table, payload });
                return { select: () => ({ maybeSingle: async () => ({ data: { id: id(2) }, error: null }) }) };
            },
            update: payload => ({
                eq: async (column, value) => { log.updates.push({ table, payload, column, value }); return { error: null }; },
            }),
        }),
    };
    return { log, client };
}

async function createPost(body, fake) {
    const handler = compileCreatePost({
        '../../../src/lib/supabaseServerClient': { createClient: () => fake.client },
        '../../../src/lib/auth-middleware': { requireAuth: async () => ({ id: id(700) }) },
        '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
        '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
        '../../../src/lib/socialTopics': { deriveSocialPostTopics },
    });
    const res = {
        statusCode: null, body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    await handler({ method: 'POST', body, headers: {} }, res);
    return res;
}

test('create-post writes the derived pair through the post-RPC UPDATE: a card token is { poker, [poker, hand] }', async () => {
    const fake = fakeSupabase({ rpcResult: { success: true, id: id(1) } });
    const res = await createPost({ content: 'Flopped [[sp-card:Ac]] [[sp-card:Kd]] and got there' }, fake);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: { post_id: id(1) } });
    assert.equal(fake.log.inserts.length, 0, 'the RPC succeeded, so no direct insert');
    assert.equal(fake.log.updates.length, 1);
    const [update] = fake.log.updates;
    assert.equal(update.table, 'social_posts');
    assert.equal(update.column, 'id');
    assert.equal(update.value, id(1));
    assert.deepEqual(update.payload, { topic: 'poker', topics: ['poker', 'hand'] });
});

test('create-post keeps metadata on the UPDATE and accepts optional topic and topics from the body', async () => {
    const fake = fakeSupabase({ rpcResult: { success: true, id: id(3) } });
    const metadata = { page_name: 'The Club' };
    const res = await createPost({ content: 'Tonight at the club', metadata, topic: 'cash', topics: ['cash', 'video'] }, fake);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(fake.log.updates[0].payload, { topic: 'poker', topics: ['poker', 'cash'], metadata });
});

test('create-post writes topic and topics on the fallback insert when the RPC fails', async () => {
    const fake = fakeSupabase({ rpcResult: { success: false, error: 'nope' } });
    const res = await createPost({ content: 'Plain words, no cards', content_type: 'text' }, fake);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: { post_id: id(2) } });
    assert.equal(fake.log.updates.length, 0);
    assert.equal(fake.log.inserts.length, 1);
    const { payload } = fake.log.inserts[0];
    assert.equal(payload.author_id, id(700));
    assert.equal(payload.topic, 'unknown');
    assert.deepEqual(payload.topics, ['unknown']);
    assert.equal(payload.thumbnail_url, null, 'the existing column list stays in sync');
    const card = fakeSupabase({ rpcError: { message: 'rpc missing' } });
    await createPost({ content: 'Rivered [[sp-card:9s]]' }, card);
    assert.deepEqual(card.log.inserts[0].payload.topics, ['poker', 'hand']);
});

test('create-post derives through the shared module and touches no horse marker', () => {
    assert.match(CREATE_POST_SOURCE, /import \{ deriveSocialPostTopics \} from '\.\.\/\.\.\/\.\.\/src\/lib\/socialTopics';/);
    assert.match(CREATE_POST_SOURCE, /topic: derivedTopics\.topic,\s*topics: derivedTopics\.topics,/);
    assert.doesNotMatch(CREATE_POST_SOURCE, /is_horse|scheduler/);
});
