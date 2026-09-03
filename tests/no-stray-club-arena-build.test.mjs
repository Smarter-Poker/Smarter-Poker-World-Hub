/**
 * A Club Arena build does not live at the World Hub repo root.
 *
 * WHAT HAPPENED
 *
 * On 2026-08-21, commit b11677af ("Deploy Cashier fixes") wrote an entire Vite
 * dist/ into the root of this repository instead of into
 * public/hub/club-arena/. 966 files. 108 MB. One commit.
 *
 * Next.js serves public/, not the repo root, so not one byte of it was ever
 * reachable. Measured against production before removing it:
 *
 *   https://smarter.poker/cards/2color/clubs_10.png                 -> 404
 *   https://smarter.poker/hub/club-arena/cards/2color/clubs_10.png  -> 200
 *
 * WHY THIS IS A TEST AND NOT JUST A DELETION
 *
 * The 108 MB is the smaller half of the problem. 345 of those files were
 * content-hashed chunks from a build that no longer exists — a complete, stale
 * Club Arena bundle sitting in the repo looking like source. A grep for
 * `can_draw_500x` during the 2026-08-22 audit found it twice: once in the live
 * bundle under public/hub/club-arena/, once in the ghost, with nothing on the
 * face of either to say which one production was serving.
 *
 * That is the same failure the .orig/.rej cleanup in Club Arena #267 was
 * written up for, an order of magnitude larger. A stray build is not inert; it
 * is a second answer to every question anyone asks the repo.
 *
 * .gitignore now anchors these paths at the root so an accidental `git add`
 * cannot pick them up. This is the backstop for a deliberate `git add -f` and
 * for anyone who edits .gitignore without knowing why those lines are there.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

/**
 * Top-level names that belong to a Club Arena build and to nothing else here.
 *
 * Every one of these has a legitimate twin the World Hub DOES serve — public/
 * carries assets, images, cards and videos of its own — so the check is
 * anchored at the root and must never look inside public/.
 */
const FORBIDDEN_ROOT_DIRS = [
    'assets',
    'cards',
    'club-logos',
    'game-card-icons',
    'images',
    'videos',
];

const FORBIDDEN_ROOT_FILES = [
    'vite.svg',
    'vip-card.jpg',
    'vip-card.png',
    'vip-card.webp',
    'sw.ts',
    'textarea-calibration-tool.html',
];

/** Tracked paths, or null when git is unavailable. */
function trackedFiles() {
    try {
        return execFileSync('git', ['ls-files', '-z'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
            .toString('utf8')
            .split('\0')
            .filter(Boolean);
    } catch {
        return null;
    }
}

test('no Club Arena build is tracked at the repo root', () => {
    const files = trackedFiles();
    assert.ok(files, 'git ls-files did not run — this guard cannot verify anything');
    assert.ok(files.length > 1000, `only ${files.length} tracked files — the listing looks wrong`);

    const offenders = files.filter((f) => {
        const top = f.split('/')[0];
        if (f.includes('/') && FORBIDDEN_ROOT_DIRS.includes(top)) return true;
        return !f.includes('/') && FORBIDDEN_ROOT_FILES.includes(f);
    });

    assert.deepEqual(
        offenders.slice(0, 20),
        [],
        `A Club Arena build has been committed to the repo root again (${offenders.length} files).\n` +
            `Next.js does not serve the repo root, so none of it is reachable — it belongs in\n` +
            `the Club Arena repo, which publishes it to its own origin (2026-09-03).\n` +
            `First 20:\n  ${offenders.slice(0, 20).join('\n  ')}`
    );
});

test('the World Hub still serves its own public assets', () => {
    // The mirror of the check above: proving the root is clean is worthless if
    // the deletion took public/ with it. These are the directories the site
    // actually serves at /assets, /images, /cards, /videos.
    const files = trackedFiles();
    assert.ok(files);
    // public/hub/club-arena/assets was the third entry here until 2026-09-03.
    // Club Arena publishes to its own origin now and this repo carries one
    // rewrite instead of the bundle, so its absence is the correct state -
    // tests/club-arena-is-a-rewrite.test.mjs asserts it is GONE. The World
    // Hub's own public/ directories are what this check still protects.
    for (const dir of ['public/assets', 'public/images']) {
        assert.ok(
            files.some((f) => f.startsWith(dir + '/')),
            `${dir} has no tracked files — the root cleanup went too far`
        );
    }
});

test('.gitignore anchors the root patterns and does not swallow public/', () => {
    // `git check-ignore` exits 1 when NOTHING matches, which is the passing
    // case here, so the non-zero exit has to be read rather than thrown on.
    let matched = '';
    try {
        matched = execFileSync(
            'git',
            [
                'check-ignore',
                '-v',
                '--no-index',
                'public/assets/x.png',
                'public/images/x.png',
                'public/cards/x.png',
                'public/videos/x.mp4',
                'public/hub/club-arena/assets/x.js',
            ],
            { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }
        )
            .toString('utf8')
            .trim();
    } catch (err) {
        // Exit 1 = no path was ignored. Anything else is a real failure.
        if (err.status !== 1) throw err;
        matched = '';
    }

    assert.equal(
        matched,
        '',
        `.gitignore is hiding files under public/, which IS served:\n${matched}\n` +
            'The root patterns must keep their leading slash.'
    );

    // And the anchored patterns must still do their job at the root.
    let rootIgnored = '';
    try {
        rootIgnored = execFileSync('git', ['check-ignore', '-v', '--no-index', 'assets/x.js', 'cards/x.png'], {
            cwd: REPO,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString('utf8')
            .trim();
    } catch (err) {
        if (err.status !== 1) throw err;
    }
    assert.match(
        rootIgnored,
        /assets\/x\.js/,
        'a stray build at the repo root is no longer ignored - the anchored .gitignore patterns were removed'
    );
});

test('the Club Arena release manifest has an exact defensive no-store policy', () => {
    const config = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
    const blanketHubIndex = config.headers.findIndex(
        (rule) => rule.source === '/hub/((?!.*?/assets/)(?!.*?/images/)(?!.*?/videos/)(?!.*?/cards/)(?!.*?/sounds/)(?!.*?/club-logos/).*)'
    );
    const manifestIndex = config.headers.findIndex(
        (rule) => rule.source === '/hub/club-arena/build-info.json'
    );

    assert.ok(blanketHubIndex >= 0, 'the blanket /hub cache policy is missing');
    assert.ok(manifestIndex > blanketHubIndex, 'the exact manifest policy must override the blanket /hub rule');

    const headers = Object.fromEntries(
        config.headers[manifestIndex].headers.map(({ key, value }) => [key.toLowerCase(), value])
    );

    assert.match(headers['cache-control'], /no-store/);
    assert.match(headers['cache-control'], /max-age=0/);
    assert.equal(headers['cdn-cache-control'], 'no-store');
    assert.equal(headers['vercel-cdn-cache-control'], 'no-store');
    assert.equal(headers.pragma, 'no-cache');
    assert.equal(headers.expires, '0');
});
