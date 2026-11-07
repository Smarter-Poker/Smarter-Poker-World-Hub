// A Messenger route that refuses every method but POST answers 405 to a GET,
// and a caller that reads `resp.ok` false as "no data" renders an empty list
// with no error. That is how the live viewer list's Recent Chats stayed empty
// (2026-11-07). Every in-repo caller of a POST-only Messenger route must POST.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const routes = readdirSync(join(root, 'pages/api/messenger'))
    .filter(name => name.endsWith('.js'))
    .filter(name => /req\.method !== 'POST'/.test(readFileSync(join(root, 'pages/api/messenger', name), 'utf8')))
    .map(name => name.replace(/\.js$/, ''));

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (/\.(m?js|jsx|ts|tsx)$/.test(name)) out.push(path);
    }
    return out;
}

test('POST-only Messenger routes exist to check', () => {
    assert.ok(routes.includes('get-conversations'));
});

test('no caller sends another method to a POST-only Messenger route', () => {
    const offenders = [];
    for (const file of [...walk(join(root, 'pages')), ...walk(join(root, 'src'))]) {
        if (file.includes('/pages/api/')) continue;
        const source = readFileSync(file, 'utf8');
        for (const route of routes) {
            const call = new RegExp(`['\`]/api/messenger/${route}['\`]\\s*,\\s*\\{([\\s\\S]{0,240}?)\\}`, 'g');
            for (const match of source.matchAll(call)) {
                const method = match[1].match(/method:\s*['"](\w+)['"]/);
                if (method && method[1].toUpperCase() !== 'POST') offenders.push(`${file.slice(root.length)} -> ${route} (${method[1]})`);
            }
        }
    }
    assert.deepEqual(offenders, []);
});

test('the live viewer list asks for recent chats with POST', () => {
    const source = readFileSync(join(root, 'src/components/social/LiveViewerList.jsx'), 'utf8');
    assert.match(source, /'\/api\/messenger\/get-conversations', \{\s*\/\/[^\n]*\n[^\n]*\n\s*method: 'POST'|'\/api\/messenger\/get-conversations', \{\s*method: 'POST'/);
});
