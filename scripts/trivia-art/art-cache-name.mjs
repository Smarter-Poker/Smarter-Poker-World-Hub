/**
 * THE TRIVIA ART CACHE IS NAMED FOR THE EXACT ART THAT SHIPPED.
 *
 * Trivia pictures are served CacheFirst by the root service worker from their
 * own cache (next.config.js runtimeCaching). CacheFirst never revalidates, so
 * a picture replaced in place, or one Dan rejects in design review, would keep
 * showing on an installed phone for up to 30 days. The cache is therefore
 * named `trivia-art-<first 10 hex of the digest below>`: change any file under
 * public/images/trivia and the name changes, and worker/index.js deletes every
 * other trivia-art-* cache (and any Trivia picture left in 'static-assets') the
 * moment the new worker activates.
 *
 * __tests__/trivia-intro-art.test.mjs fails until both literals (worker and
 * next.config.js) carry the name this prints:
 *
 *     node scripts/trivia-art/art-cache-name.mjs
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const TRIVIA_ART_ROOT = 'public/images/trivia';

function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
    });
}

/** sha256 over every `relative/path\0sha256(bytes)\n`, paths sorted. */
export function triviaArtDigest(root = process.cwd()) {
    const base = join(root, TRIVIA_ART_ROOT);
    const files = walk(base)
        .map((path) => ({ path, rel: relative(base, path).split(sep).join('/') }))
        .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    const outer = createHash('sha256');
    for (const { path, rel } of files) {
        outer.update(`${rel}\0${createHash('sha256').update(readFileSync(path)).digest('hex')}\n`);
    }
    return outer.digest('hex');
}

export function triviaArtCacheName(root = process.cwd()) {
    return `trivia-art-${triviaArtDigest(root).slice(0, 10)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    console.log(triviaArtCacheName());
}
