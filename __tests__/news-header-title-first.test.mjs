import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner, 2026-11-27: the Poker News header has no round seal; "Poker News" is
// on top in a larger font, and the Live Intelligence Wire line sits under it.
const news = readFileSync(new URL('../pages/hub/news.js', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/components/bankroll/BankrollImageHeader.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/bankroll/BankrollImageHeader.module.css', import.meta.url), 'utf8');

test('the Poker News header opts out of the seal and sets its title first', () => {
    const start = news.indexOf('<BankrollImageHeader');
    const props = news.slice(start, news.indexOf('parent={(', start));
    assert.match(props, /title="Poker News"/);
    assert.match(props, /seal=\{false\}/);
    assert.match(props, /\bparentBelow\b/);
});

test('the shared header keeps the seal and parent-above layout as its default', () => {
    assert.match(header, /seal = true,/);
    assert.match(header, /parentBelow = false,/);
    assert.match(header, /\{parent && !parentBelow && <div className=\{styles\.parent\}>/);
    assert.match(header, /\{parent && parentBelow && <div className=\{styles\.parent\}>/);
    assert.ok(header.indexOf('parent && parentBelow') > header.indexOf('</Heading>'), 'the parent line renders after the title');
});

test('title-first sets a larger title and the no-seal header uses one column', () => {
    assert.match(css, /\.header\.header\.noSeal \{\s*grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(css, /\.header\.titleFirst \.title \{\s*font-size: clamp\(2\.2rem, 5\.4vw, 4rem\);/);
});
