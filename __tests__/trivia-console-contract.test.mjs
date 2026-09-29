/**
 * TRIVIA CONSOLE CONTRACT (2026-09-20)
 *
 * The Trivia pages were rebuilt on the #ClubArenaConsole painted chassis. This
 * file pins the parts of that contract a source read can prove, so the next
 * edit cannot quietly undo them:
 *
 *   - every active Trivia route and component PARSES. On 2026-09-13 an
 *     unfinished edit cut pages/hub/trivia/pvp.js off after its last handler,
 *     with no render tree and no closing brace, and nothing noticed;
 *   - the footer law lives in the primitive: two painted plates only when a
 *     surface has two actions, a lit word on the glass for one, so no surface
 *     can print a lone plate beside an empty one;
 *   - colour is the master's inks and nothing else, on every Trivia surface;
 *   - no hover, no floating Lucide glyphs, no MetalFrame / HexButton chrome;
 *   - the chassis and frame art exist at their native sizes and are all used;
 *   - the thirteen middle cards carry thirteen distinct new artworks, none of
 *     them the retired modes-v2 set;
 *   - the display formatter never overstates and never shows a decimal below 1K;
 *   - no local visual harness is routable and no dev-server type drift ships.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';
import { TRIVIA_MIDDLE_MODES, TRIVIA_MODES } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const exists = rel => existsSync(join(ROOT, rel));

const ROUTES = [
    'pages/hub/trivia/index.js',
    'pages/hub/trivia/[mode].js',
    'pages/hub/trivia/achievements.js',
    'pages/hub/trivia/leaderboard.js',
    'pages/hub/trivia/stats.js',
    'pages/hub/trivia/settings.js',
    'pages/hub/trivia/endless.js',
    'pages/hub/trivia/mixed.js',
    'pages/hub/trivia/survival-game.js',
    'pages/hub/trivia/survival.js',
    'pages/hub/trivia/time-attack.js',
    'pages/hub/trivia/cash.js',
    'pages/hub/trivia/gto.js',
    'pages/hub/trivia/icm.js',
    'pages/hub/trivia/mtt.js',
    'pages/hub/trivia/pvp.js',
    'pages/hub/trivia/tournaments.js',
];

// Every component a Trivia route renders. The console primitives are included.
const COMPONENTS = [
    'src/components/trivia/TriviaLobby.jsx',
    'src/components/trivia/TriviaGame.jsx',
    'src/components/trivia/TriviaAnswerOption.jsx',
    'src/components/trivia/HintButtons.jsx',
    'src/components/trivia/GhostOpponent.jsx',
    'src/components/trivia/TriviaResult.jsx',
    'src/components/trivia/LeaderboardDisplay.jsx',
    'src/components/trivia/PrizeWheel.jsx',
    'src/components/trivia/CelebrationEffects.jsx',
    'src/components/trivia/TriviaErrorBoundary.jsx',
    'src/components/trivia/ReportQuestionButton.jsx',
    'src/components/trivia/TriviaSkeleton.jsx',
    'src/components/trivia/StrategyTrivia.jsx',
    'src/components/trivia/GTOScenarioDisplay.jsx',
    'src/components/trivia/TimeAttackGame.jsx',
    'src/components/gates/GameCostPopup.jsx',
    'src/components/trivia/console/TriviaConsole.jsx',
    'src/components/trivia/console/TriviaConsoleDialog.jsx',
    'src/components/trivia/console/TriviaFrameCard.jsx',
];

// Presentational files a surface agent created for PvP and Tournaments.
const extraDirs = ['src/components/trivia/pvp', 'src/components/trivia/tournaments'];
const EXTRA = extraDirs.flatMap(dir => (exists(dir) ? readdirSync(join(ROOT, dir))
    .filter(name => /\.(jsx?|mjs)$/.test(name))
    .map(name => `${dir}/${name}`) : []));

const SOURCES = [...ROUTES, ...COMPONENTS, ...EXTRA];

function listFiles(dir, pattern) {
    if (!exists(dir)) return [];
    const out = [];
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) out.push(...listFiles(rel, pattern));
        else if (pattern.test(entry.name)) out.push(rel);
    }
    return out;
}

const TRIVIA_CSS = [
    ...listFiles('src/styles/worlds', /^trivia-console.*\.css$/),
    ...listFiles('src/components/trivia', /\.css$/).filter(rel => !/SurvivalModeGame\.css$/.test(rel)),
    'src/components/gates/GameCostPopup.jsx',
].filter(exists);

/** CSS text a surface ships: stylesheets plus any inline <style>{`...`}</style> block in its source. */
function cssOf(rel) {
    const source = read(rel);
    if (rel.endsWith('.css')) return source;
    const blocks = [...source.matchAll(/<style[^>]*>\{`([\s\S]*?)`\}<\/style>/g)].map(m => m[1]);
    return blocks.join('\n');
}

test('every active Trivia route and component parses as a complete module', () => {
    for (const rel of SOURCES) {
        assert.ok(exists(rel), `${rel} is an active Trivia source and must exist`);
        let ast;
        assert.doesNotThrow(() => {
            ast = parse(read(rel), { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
        }, `${rel} must parse`);
        const hasDefault = ast.program.body.some(node => node.type === 'ExportDefaultDeclaration');
        if (ROUTES.includes(rel)) assert.ok(hasDefault, `${rel} must export its page component`);
    }
});

test('no Trivia surface imports generic chrome or floating glyph icons', () => {
    const banned = [/from ['"]lucide-react['"]/, /\/MetalFrame['"]/, /\/HexButton['"]/, /\/VIPGateModal['"]/, /from ['"]react-icons/];
    for (const rel of SOURCES) {
        const source = read(rel);
        for (const pattern of banned) {
            assert.doesNotMatch(source, pattern, `${rel} must not import ${pattern}`);
        }
    }
});

test('every Trivia page renders on the console chassis', () => {
    const consoleUsers = SOURCES.filter(rel => /TriviaConsole(Dialog)?['"]/.test(read(rel)) || /<TriviaConsole\b/.test(read(rel)));
    for (const rel of ROUTES.filter(r => !/\/(cash|gto|icm|mtt)\.js$/.test(r))) {
        const source = read(rel);
        const direct = /console\/TriviaConsole/.test(source);
        const viaComponent = /TriviaLobby|StrategyTrivia|TriviaGame|TimeAttackGame/.test(source);
        assert.ok(direct || viaComponent, `${rel} must render on TriviaConsole (directly or through its surface component)`);
    }
    for (const rel of ['pages/hub/trivia/cash.js', 'pages/hub/trivia/gto.js', 'pages/hub/trivia/icm.js', 'pages/hub/trivia/mtt.js']) {
        assert.match(read(rel), /StrategyTrivia/, `${rel} delegates to StrategyTrivia`);
    }
    assert.ok(consoleUsers.length >= 10, 'the console primitives are actually used');
});

test('the footer law lives in the primitive: two plates or a lit word, never one plate', () => {
    const source = read('src/components/trivia/console/TriviaConsole.jsx');
    assert.match(source, /const hasPlates = Boolean\(primaryAction && secondaryAction\);/);
    assert.match(source, /const soleAction = hasPlates \? null : \(primaryAction \|\| secondaryAction \|\| null\);/);
    assert.match(source, /hasPlates \? styles\.withPlates : ''/);
    assert.match(source, /data-foot=\{hasPlates \? 'plates' : 'foot'\}/);
    assert.match(source, /<TriviaGlassAction \{\.\.\.soleAction\} \/>/);
    assert.doesNotMatch(source, /Boolean\(primaryAction \|\| secondaryAction\)/, 'one action must never select the painted plates');
    const css = read('src/components/trivia/console/TriviaConsole.module.css');
    assert.match(css, /\.withPlates \.foot \{[\s\S]*?aspect-ratio: 1000 \/ 277;[\s\S]*?bottom-plates\.(?:png|webp)/);
    assert.match(css, /\.foot \{[\s\S]*?aspect-ratio: 1000 \/ 72;[\s\S]*?bottom-foot\.(?:png|webp)/);
    assert.match(css, /\.head \{[\s\S]*?aspect-ratio: 1000 \/ 348;/);
    assert.match(css, /\.body \{[\s\S]*?mid\.(?:png|webp)'\) top center \/ 100% auto repeat-y;/, 'the repeating strip paints only the body (skill 7.1)');
    assert.match(css, /--tc-max: 1000px;/);
});

test('dynamic copy is fitted on both axes and the fit is verified, not guessed', () => {
    const fit = read('src/components/trivia/console/useFitText.js');
    assert.match(fit, /availableWidth/);
    assert.match(fit, /availableHeight/);
    assert.match(fit, /for \(let pass = 0; pass < 6; pass \+= 1\)/, 'the hook re-measures after applying a ratio');
    assert.match(fit, /document\.fonts\?\.ready/, 'labels re-fit once the real fonts load');
});

const APPROVED = new Set([
    '#e4e7ec', '#f4f7fb', '#45adff', '#c8ffd2', '#35d95a', '#ff5b6e', '#f02849', '#ffd700', '#9aa5b3',
    '#000', '#000000', '#050607', '#6d747c', '#1877f2',
]);
const APPROVED_RGB = new Set(['228 231 236', '244 247 251', '69 173 255', '200 255 210', '53 217 90', '255 91 110', '240 40 73', '255 215 0', '154 165 179', '0 0 0', '5 6 7', '109 116 124', '24 119 242', '255 255 255']);

function colourViolations(text) {
    const bad = [];
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        const hex = m[0].toLowerCase();
        if (!APPROVED.has(hex)) bad.push(hex);
    }
    for (const m of text.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
        const triple = `${m[1]} ${m[2]} ${m[3]}`;
        if (!APPROVED_RGB.has(triple)) bad.push(`rgb(${triple})`);
    }
    return bad;
}

const stripCssComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('every Trivia stylesheet uses the master inks only and never hover', () => {
    for (const rel of [...TRIVIA_CSS, ...SOURCES.filter(r => r.endsWith('.js') || r.endsWith('.jsx'))]) {
        const css = cssOf(rel);
        if (!css) continue;
        // A comment that says "no :hover" is documentation, not a rule.
        assert.doesNotMatch(stripCssComments(css), /:hover/, `${rel} must not style :hover`);
        assert.deepEqual(colourViolations(stripCssComments(css)), [], `${rel} must use schema colours only`);
    }
    // The legacy world sheet keeps tokens the site chrome reads, but it may
    // not bring hover back to a Trivia surface either.
    assert.doesNotMatch(stripCssComments(read('src/styles/worlds/trivia.css')), /:hover/, 'trivia.css must not style :hover');
});

test('the Trivia canvas is black and keyboard focus is the schema blue ring', () => {
    const base = stripCssComments(read('src/styles/worlds/trivia-console.css'));
    // Below the last console the page shows black, never the site navy.
    assert.match(base, /html:has\(> body\.world-trivia\),\s*html:has\(\[data-master-art="spade-console-v1"\]\)\s*\{\s*background: var\(--tc-black\);/);
    // index.css removes button outlines with !important and premium.css draws a
    // cyan box-shadow ring; on Trivia the ring is the approved blue outline and
    // the site chrome keeps its own.
    assert.match(base, /body\.world-trivia :focus-visible:not\(:is\(header, nav, footer\) \*\) \{\s*outline: 3px solid var\(--tc-ink-blue\) !important;\s*box-shadow: none;/);
    const world = stripCssComments(read('src/styles/worlds/trivia.css'));
    assert.match(world, /:where\(body\.world-trivia, \.trivia-page\) :focus-visible,/, 'the world default ring carries no specificity');
    assert.doesNotMatch(world, /#00D4FF\);\s*outline-offset/i, 'the world ring is not the retired cyan');
});

test('inline styles in Trivia sources use schema colours only', () => {
    for (const rel of SOURCES) {
        const source = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const inline = [...source.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].map(m => m[1]).join('\n');
        assert.deepEqual(colourViolations(inline), [], `${rel} inline styles must use schema colours only`);
        assert.doesNotMatch(source, /onMouseEnter|onMouseOver|whileHover/, `${rel} must not add hover-only behaviour`);
    }
});

function pngSize(rel) {
    const buf = readFileSync(join(ROOT, rel));
    assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${rel} is a PNG`);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colourType: buf[25] };
}

function webpSize(rel) {
    const buf = readFileSync(join(ROOT, rel));
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${rel} is RIFF`);
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP', `${rel} is WebP`);
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), alpha: Boolean(buf[20] & 0x10) };
    }
    if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), alpha: Boolean((bits >> 28) & 1) };
    }
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, alpha: false };
}

function imageSize(rel) {
    return rel.endsWith('.png') ? pngSize(rel) : webpSize(rel);
}

function consoleSlice(name) {
    const css = read('src/components/trivia/console/TriviaConsole.module.css');
    const match = css.match(new RegExp(`/images/trivia/console/spade-console-v1/${name}\\.(png|webp)`));
    assert.ok(match, `the console paints ${name}`);
    return match[0].slice(1).replace(/^/, 'public/');
}

test('the spade master slices exist at their native sizes with real alpha', () => {
    const expected = { top: [1000, 348], mid: [1000, 8], 'bottom-foot': [1000, 72], 'bottom-plates': [1000, 277] };
    for (const [name, [width, height]] of Object.entries(expected)) {
        const rel = consoleSlice(name);
        assert.ok(exists(rel), `${rel} exists`);
        const size = imageSize(rel);
        assert.equal(size.width, width, `${rel} width`);
        assert.equal(size.height, height, `${rel} height`);
        if (rel.endsWith('.png')) assert.equal(size.colourType, 6, `${rel} is RGBA`);
        else assert.ok(size.alpha, `${rel} keeps its alpha`);
    }
});

test('five genuinely different frame families are mapped and every one exists', () => {
    const source = read('src/components/trivia/console/TriviaFrameCard.jsx');
    const assets = [...source.matchAll(/(knowledge|strategy|challenge|competitive|progress): '(\/images\/trivia\/console\/card-frames\/[a-z0-9-]+\.(?:png|webp))'/g)];
    assert.equal(assets.length, 5, 'five families');
    const hashes = new Set();
    for (const [, , url] of assets) {
        const rel = `public${url}`;
        assert.ok(exists(rel), `${rel} exists`);
        const size = imageSize(rel);
        assert.equal(size.width, size.height, `${rel} is square`);
        assert.ok(size.width >= 1024, `${rel} keeps its native resolution`);
        hashes.add(createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex'));
    }
    assert.equal(hashes.size, 5, 'no family is a copy of another');
});

test('the thirteen middle cards carry thirteen distinct new artworks', () => {
    assert.equal(TRIVIA_MIDDLE_MODES.length, 13);
    const retired = new Set(readdirSync(join(ROOT, 'public/images/trivia')).includes('modes-v2')
        ? readdirSync(join(ROOT, 'public/images/trivia/modes-v2')).map(n => createHash('sha256').update(readFileSync(join(ROOT, 'public/images/trivia/modes-v2', n))).digest('hex'))
        : []);
    const seen = new Set();
    for (const mode of TRIVIA_MIDDLE_MODES) {
        assert.match(mode.image, /^\/images\/trivia\/modes-console-v1\/[a-z-]+\.webp$/, `${mode.id} uses the console artwork family`);
        const rel = `public${mode.image}`;
        assert.ok(exists(rel), `${rel} exists`);
        const digest = createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');
        assert.ok(!seen.has(digest), `${mode.id} artwork is not a copy of another card`);
        assert.ok(!retired.has(digest), `${mode.id} artwork is not a retired modes-v2 image`);
        seen.add(digest);
        const size = webpSize(rel);
        assert.ok(size.width >= 960 && size.width <= 1280, `${rel} is sized for the card window`);
    }
});

// The approved Daily and Quick Stakes artwork is pinned by hash in
// trivia-ui-foundation.test.mjs; it is not repeated here.

test('every console artwork file in public/ is actually used by a Trivia surface', () => {
    const art = [
        ...listFiles('public/images/trivia/console', /\.(png|webp)$/),
        ...listFiles('public/images/trivia/modes-console-v1', /\.(png|webp)$/),
    ];
    const corpus = [...SOURCES, ...TRIVIA_CSS, 'src/config/triviaModeRegistry.mjs',
        'src/components/trivia/console/TriviaConsole.module.css',
        'src/components/trivia/console/TriviaFrameCard.module.css',
        ...listFiles('src/components/trivia', /\.module\.css$/)]
        .filter(exists).map(read).join('\n');
    for (const rel of art) {
        const url = `/${relative('public', rel)}`;
        assert.ok(corpus.includes(url), `${url} is referenced by a Trivia surface (no orphaned art ships)`);
    }
});

test('the display formatter floors, strips .0 and never shows a decimal below 1K', async () => {
    const source = read('src/lib/trivia/formatTriviaDisplayNumber.js');
    const mod = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const f = mod.formatTriviaDisplayNumber;
    assert.equal(f(0), '0');
    assert.equal(f(999), '999');
    assert.equal(f(999.9), '999');
    assert.equal(f(1000), '1K');
    assert.equal(f(1099), '1K');
    assert.equal(f(1200), '1.2K');
    assert.equal(f(1299), '1.2K');
    assert.equal(f(9999), '9.9K');
    assert.equal(f(10000), '10K');
    assert.equal(f(1234567), '1.2M');
    assert.equal(f(-1500), '-1.5K');
    assert.equal(f('not a number'), '0');
});

test('no local visual harness is routable and no dev-server type drift ships', () => {
    const pages = listFiles('pages', /\.(js|jsx|ts|tsx)$/);
    assert.deepEqual(pages.filter(rel => /harness/i.test(rel)), [], 'no harness page under pages/');
    const env = read('next-env.d.ts');
    assert.doesNotMatch(env, /\.next\/dev\/types/, 'next-env.d.ts is the production form');
});

test('retired Trivia components stay retired', () => {
    for (const name of ['DoubleOrNothing', 'FriendChallengeModal', 'PvPLobby', 'PvPBattle', 'TournamentLobby', 'StreakBadge', 'SurvivalGame', 'SurvivalModeGame']) {
        assert.ok(!exists(`src/components/trivia/${name}.jsx`), `${name} was unreachable and is removed; do not revive it`);
    }
});

test('PvP and Tournaments stay default-off behind exact server flags', async () => {
    const pvp = await import('../src/lib/trivia/pvpReleaseControl.mjs');
    const tournaments = await import('../src/lib/trivia/tournamentReleaseControl.mjs');
    assert.equal(pvp.isTriviaPvpReleased({}), false);
    assert.equal(pvp.isTriviaPvpReleased({ TRIVIA_PVP_ENABLED: 'TRUE' }), false);
    assert.equal(pvp.isTriviaPvpReleased({ TRIVIA_PVP_ENABLED: 'true' }), true);
    assert.deepEqual(pvp.triviaPvpPageReleaseResult({}).redirect, { destination: '/hub/trivia', permanent: false });
    const tournamentExports = Object.keys(tournaments);
    assert.ok(tournamentExports.length > 0);
    const released = tournaments.areTriviaTournamentsReleased || tournaments.isTriviaTournamentsReleased;
    assert.equal(typeof released, 'function');
    assert.equal(released({}), false);
    assert.equal(released({ TRIVIA_TOURNAMENTS_ENABLED: '1' }), false);
});
