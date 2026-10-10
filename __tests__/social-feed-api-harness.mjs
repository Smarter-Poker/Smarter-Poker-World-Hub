/**
 * social-feed-api-harness.mjs
 * ─────────────────────────────────────────────────────────────────
 * Runs the real pages/api/social/feed.js handler against an in-memory
 * PostgREST. feed.js talks to Supabase through one raw supaFetch over
 * global fetch, so a fake fetch that serves pages of rows by offset (and
 * honours the topics=cs.{facet} filters the handler appends) is enough to
 * exercise the whole scan, the cap, the exclude list, the played-with call
 * and the ranking without a database.
 *
 * The route is compiled to CommonJS with the TypeScript transpiler and its
 * imports are injected, the same way __tests__/cashout-v2-bridge.test.mjs
 * loads its routes. Extensionless ESM imports cannot be loaded by node
 * directly. Nothing here reads a real key: the Supabase env is a fake.
 *
 * Not a test file: it is imported by the social-feed-*.test.mjs files.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export const FEED_ROUTE_URL = new URL('../pages/api/social/feed.js', import.meta.url);
export const FEED_SOURCE = fs.readFileSync(FEED_ROUTE_URL, 'utf8');
export const FAKE_SUPABASE_URL = 'https://feed-harness.test.invalid';
export const YOUTUBE_ID = 'dQw4w9WgXcQ';

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The fake Supabase env is applied only while a route is compiled or a fake
// fetch is installed, and restored afterwards, so other test files that run
// in the same process (the _test-guards-exist bundle) never see it.
const FAKE_ENV = {
    SUPABASE_URL: FAKE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'harness-service-key',
};

export function applyFakeEnv() {
    const previous = {};
    for (const [key, value] of Object.entries(FAKE_ENV)) {
        previous[key] = process.env[key];
        process.env[key] = value;
    }
    return () => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
}

const videoLibraryAvailability = await import('../src/lib/videoLibraryAvailability.js');
const socialTopics = await import('../src/lib/socialTopics.js');
const feedRanking = await import('../src/lib/feedRanking.js');
const socialPostShape = await import('../src/lib/socialPostShape.js');
const homeGamePrivacy = await import('../src/lib/home-games/socialPrivacyServer.mjs');

function compile(source, mocks) {
    const code = ts.transpileModule(source, {
        fileName: 'feed.js',
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
        },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        throw new Error(`Unexpected dependency: ${name}`);
    }, module, module.exports);
    return module.exports;
}

/**
 * Load the feed route with its imports injected. The viewer id comes from
 * the bearer token verbatim (the auth module is a stub), so a request with
 * auth: id(500) is the viewer id(500) and no auth header is anonymous.
 */
export function loadFeedRoute() {
    const restoreEnv = applyFakeEnv();
    try {
        return compileFeedRoute();
    } finally {
        restoreEnv();
    }
}

function compileFeedRoute() {
    return compile(FEED_SOURCE, {
        '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
        '../../../src/lib/videoLibraryAvailability': videoLibraryAvailability,
        '../../../src/lib/socialTopics': socialTopics,
        '../../../src/lib/feedRanking': feedRanking,
        '../../../src/lib/socialPostShape': socialPostShape,
        '../../../src/lib/home-games/socialPrivacyServer.mjs': homeGamePrivacy,
        '../../../src/lib/serverAuth': {
            getServerUserWithFallback: async (req) => {
                const token = String(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '');
                return { user: token ? { id: token } : null };
            },
        },
        '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    });
}

let counter = 0;

/** A public text post. created_at descends with n so arrival order is by n. */
export function textPost(n, { author = id(900), topics = ['unknown'], ...overrides } = {}) {
    counter += 1;
    return {
        id: id(n),
        author_id: author,
        content: `Post ${n}`,
        content_type: 'text',
        media_urls: [],
        thumbnail_url: null,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        view_count: 0,
        visibility: 'public',
        audience_mode: null,
        audience_list: null,
        created_at: new Date(Date.UTC(2026, 8, 30, 12, 0, 0) - n * 60_000).toISOString(),
        link_url: null,
        link_title: null,
        link_description: null,
        link_image: null,
        link_site_name: null,
        metadata: {},
        is_deleted: false,
        origin_type: 'user_upload',
        playback_type: 'external_embed',
        topic: Array.isArray(topics) && topics[0] ? topics[0] : 'unknown',
        topics,
        rights_status: null,
        source_asset_id: null,
        youtube_video_id: null,
        canonical_asset_key: null,
        publication_key: `harness:${counter}`,
        legacy_transition_eligible: null,
        legacy_transition_expires_at: null,
        cover_frames: null,
        cover_frame_index: null,
        transcode_status: null,
        ...overrides,
    };
}

/** A native upload that passes every existing safety check. */
export function nativeVideoPost(n, { author = id(910), transcodeStatus = 'done', ...overrides } = {}) {
    const url = `${FAKE_SUPABASE_URL}/storage/v1/object/public/social-media/videos/${author}/clip-${n}.mp4`;
    return textPost(n, {
        author,
        content_type: 'video',
        media_urls: [url],
        playback_type: 'native',
        rights_status: 'user_authorized',
        canonical_asset_key: `native:${author}:clip-${n}`,
        transcode_status: transcodeStatus,
        topics: ['poker'],
        ...overrides,
    });
}

/** A YouTube embed with fresh positive proof served by the fake library. */
export function youtubeVideoPost(n, { author = id(920), ...overrides } = {}) {
    return textPost(n, {
        author,
        content_type: 'video',
        media_urls: [`https://www.youtube.com/watch?v=${YOUTUBE_ID}`],
        playback_type: 'youtube_embed',
        rights_status: 'embed_only',
        youtube_video_id: YOUTUBE_ID,
        canonical_asset_key: `youtube:${YOUTUBE_ID}`,
        origin_type: 'horse',
        topics: ['poker'],
        ...overrides,
    });
}

function jsonResponse(data, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
        text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
    };
}

/**
 * Install a fake fetch that serves `rows` as social_posts in the given
 * order and answers every other read the handler makes. Returns a log of
 * the requests and a restore() for the previous fetch.
 *
 * options.playedWith: rows the fn_feed_played_with RPC returns
 *   ([{ user_id }]) or the string 'error' to answer HTTP 500, or 'hang' to
 *   never resolve within the handler's timeout window (never used by the
 *   tests that finish quickly).
 */
export function installFakeSupabase(rows, options = {}) {
    const calls = [];
    const previous = globalThis.fetch;
    const restoreEnv = applyFakeEnv();
    const playedWith = options.playedWith ?? [];
    globalThis.fetch = async (input, init = {}) => {
        const url = new URL(String(input));
        calls.push({ url, init, path: url.pathname, method: init.method || 'GET' });
        const path = url.pathname;
        if (path.endsWith('/rest/v1/social_pages') || path.endsWith('/rest/v1/commander_home_groups')) {
            const tableRows = path.endsWith('/rest/v1/social_pages') ? options.pages : options.groups;
            if (tableRows === 'error') return jsonResponse('read unavailable', 500);
            const wanted = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') || '');
            return jsonResponse((tableRows || []).filter(row => !wanted || wanted[1].split(',').includes(row.id)));
        }
        if (path.endsWith('/rest/v1/social_posts')) {
            const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
            const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
            const facets = url.searchParams.getAll('topics').map(value => {
                const match = /^cs\.\{(.+)\}$/.exec(value);
                if (!match) throw new Error(`Unsupported topics filter: ${value}`);
                return match[1];
            });
            const matching = rows.filter(row => facets.every(facet => Array.isArray(row.topics) && row.topics.includes(facet)));
            return jsonResponse(matching.slice(offset, offset + limit));
        }
        if (path.endsWith('/rest/v1/rpc/fn_feed_played_with')) {
            if (playedWith === 'error') return jsonResponse('boom', 500);
            if (playedWith === 'reject') throw new Error('network down');
            return jsonResponse(playedWith);
        }
        if (path.endsWith('/rest/v1/rpc/fn_filter_valid_user_video_storage_urls')) {
            const body = JSON.parse(init.body || '{}');
            return jsonResponse((body.p_candidates || []).map(candidate => ({
                playback_url: candidate.playback_url,
                author_id: candidate.author_id,
            })));
        }
        if (path.endsWith('/rest/v1/video_library_videos')) {
            const wanted = /^in\.\((.*)\)$/.exec(url.searchParams.get('youtube_video_id') || '');
            if (!wanted) return jsonResponse([]);
            return jsonResponse(wanted[1].split(',').filter(Boolean).map((youtubeId, index) => ({
                id: id(8000 + index),
                youtube_video_id: youtubeId,
                type: 'cash',
                availability_status: 'verified',
                embeddable: true,
                availability_checked_at: new Date().toISOString(),
            })));
        }
        if (
            path.endsWith('/rest/v1/youtube_embed_failures')
            || path.endsWith('/rest/v1/profiles')
            || path.endsWith('/rest/v1/social_likes')
            || path.endsWith('/rest/v1/social_interactions')
        ) {
            return jsonResponse([]);
        }
        throw new Error(`Unexpected fetch: ${init.method || 'GET'} ${url}`);
    };
    return {
        calls,
        postQueries: () => calls.filter(call => call.path.endsWith('/rest/v1/social_posts')).map(call => call.url),
        restore: () => { globalThis.fetch = previous; restoreEnv(); },
    };
}

export function request({ query = {}, auth = null } = {}) {
    return {
        method: 'GET',
        query,
        headers: auth ? { authorization: `Bearer ${auth}` } : {},
        socket: { remoteAddress: '127.0.0.1' },
    };
}

export function response() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        setHeader(key, value) { this.headers[key] = value; },
    };
}

/** One request through the real handler against `rows`; restores fetch. */
export async function runFeed(rows, { query = {}, auth = null, playedWith, pages, groups } = {}) {
    const route = loadFeedRoute();
    const fake = installFakeSupabase(rows, { playedWith, pages, groups });
    try {
        const res = response();
        await route.default(request({ query, auth }), res);
        return { res, calls: fake.calls, postQueries: fake.postQueries(), route };
    } finally {
        fake.restore();
    }
}
