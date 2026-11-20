/**
 * LAW: TEXT TYPED INTO MESSENGER IS WHITE ON THE DARK THEME.
 *
 * Dan, 2026-11-20, with a screenshot of black letters in the dark compose box:
 * "WHY ARE THE LETTERS BLACK WHEN IM TYPING INSIDE THE MESSENGER? THEY SHOULD
 * BE WHITE". Root cause: MessageInput and SearchBar hardcoded color '#050505'
 * while their field background followed the theme. Every Messenger field now
 * takes its typed-text colour from the theme token `inputText`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTheme } from '../src/components/messenger/MessengerTheme.js';

test('dark theme typed text is pure white, light theme stays dark', () => {
    assert.equal(getTheme(true).inputText, '#FFFFFF');
    assert.equal(getTheme(false).inputText, '#050505');
});

for (const file of ['src/components/messenger/MessageInput.js', 'src/components/messenger/SearchBar.js']) {
    test(`${file} never hardcodes a typed-text colour`, () => {
        const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.ok(!/color:\s*'#050505'/.test(src), 'hardcoded #050505 text colour is back');
        assert.ok(/color:\s*C\.inputText/.test(src), 'field must use the theme inputText token');
    });
}

test('the edit-message field follows the theme on a dark background', () => {
    const src = readFileSync(new URL('../pages/hub/messenger.js', import.meta.url), 'utf8');
    assert.ok(src.includes("color: C.inputText, caretColor: C.inputText"));
    assert.ok(!/padding: '8px 16px', background: '#E7F3FF',/.test(src), 'edit bar must not force a light background in dark mode');
});
