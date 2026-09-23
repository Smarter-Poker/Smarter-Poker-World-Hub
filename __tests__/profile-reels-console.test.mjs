import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const MODAL = read('../src/components/profile-edit/ReelsGalleryModal.js');
const STYLES = read('../src/components/profile-edit/ReelsGalleryModal.module.css');
const SOURCE = `${MODAL}\n${STYLES}`;

test('profile Reel archive uses one painted console and only real media', () => {
    assert.match(MODAL, /import VideoLibraryConsole/);
    assert.equal((MODAL.match(/<VideoLibraryConsole\b/g) || []).length, 1);
    assert.match(MODAL, /titleAs="h2"/);
    assert.match(MODAL, /src=\{reel\.media_url\}/);
    assert.match(MODAL, /poster=\{reel\.thumbnail_url \|\| undefined\}/);
    assert.match(MODAL, /Reel Media Is Unavailable/);
    assert.doesNotMatch(SOURCE, /<svg\b|lucide-react|default[-_](?:avatar|thumb|thumbnail)|placeholder\.(?:png|jpg|svg)/i);
    assert.doesNotMatch(SOURCE, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    assert.doesNotMatch(SOURCE, /(?:linear|radial|conic)-gradient|border-radius|:hover\b|box-shadow/i);
    assert.doesNotMatch(MODAL, /style=\{\{/);
});

test('profile Reel archive is a mobile-first accessible dialog', () => {
    assert.match(MODAL, /role="dialog"/);
    assert.match(MODAL, /aria-modal="true"/);
    assert.match(MODAL, /event\.key === 'Escape'/);
    assert.match(MODAL, /event\.key !== 'Tab'/);
    assert.match(MODAL, /returnFocus\?\.isConnected/);
    assert.match(STYLES, /env\(safe-area-inset-top\)/);
    assert.match(STYLES, /min-height:\s*44px/);
    assert.match(STYLES, /@media \(min-width: 760px\)/);
    assert.match(STYLES, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
