/**
 * THE WITHHOLDING SPLIT REACHES A HUMAN.
 *
 * A W-2G prints federal withholding and state withholding as two separate
 * boxes, because a tax return asks for them separately. Migration
 * 20260908232953 added federal_withheld and state_withheld to w2g_forms for
 * exactly that reason, and the reader has been filling both in ever since.
 *
 * Nothing on any screen showed either of them. Zero references in any
 * component or page. A player filing a return had the combined figure and no
 * way back to the two the form actually prints, which is the one job the
 * vault exists to do.
 *
 * Captured, stored, and invisible is the same as not captured at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { w2gRowFromReceipt } from '../src/lib/bankroll/receiptInbox.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const PANEL = 'src/components/bankroll/TaxReportPanel.jsx';

test('the reader still writes both figures, and the total still adds up', () => {
    // The write side, unchanged, restated here so the read side below is
    // pinned against something real rather than against itself.
    const row = w2gRowFromReceipt('u1', {
        prefill: { federal_withheld: 535, state_withheld: 89.88, gross_amount: 2140, date: '2026-08-15' },
    }, 'https://example.test/w2g.jpg');
    assert.equal(row.federal_withheld, 535);
    assert.equal(row.state_withheld, 89.88);
    assert.equal(row.withholding_amount, 624.88, 'the combined figure every existing reader uses');
});

test('the vault card shows federal and state, not just the total', () => {
    const panel = code(PANEL);
    assert.match(panel, /form\.federal_withheld/, 'the federal box never reached a screen');
    assert.match(panel, /form\.state_withheld/, 'nor the state box');
    assert.match(panel, /Fed \$\$\{parseFloat\(form\.federal_withheld \|\| 0\)/);
    assert.match(panel, /State \$\$\{parseFloat\(form\.state_withheld \|\| 0\)/);
});

test('both places that list a W-2G show it', () => {
    // The uploaded-forms card and the summary row. Showing it in one place
    // only is how somebody concludes the figure is not recorded.
    const panel = code(PANEL);
    const occurrences = (panel.match(/federal_withheld/g) || []).length;
    assert.ok(occurrences >= 2, `the split appears in ${occurrences} place(s), expected both lists`);
    assert.match(panel, /formWithholdingSplit/);
    assert.match(panel, /w2gWithholdingSplit/);
});

test('a form with neither figure shows nothing rather than two zeroes', () => {
    // Older rows predate the split and have both columns null. Rendering
    // "Fed $0 . State $0" on those would state, wrongly, that nothing was
    // withheld.
    const panel = code(PANEL);
    assert.match(
        panel,
        /form\.federal_withheld !== null && form\.federal_withheld !== undefined\)\s*\|\|\s*\(form\.state_withheld !== null && form\.state_withheld !== undefined\)/,
        'the split must be hidden when neither figure exists',
    );
});

test('the exported report carries the split, because that is what goes to an accountant', () => {
    const route = code('pages/api/bankroll/tax-report.js');
    assert.match(route, /federal_withheld, state_withheld/, 'the columns must be selected');
    assert.match(route, /federalWithheld: f\.federal_withheld/);
    assert.match(route, /stateWithheld: f\.state_withheld/);
    // And the total is still reported, because every existing reader adds it
    // up that way and this must not change what they see.
    assert.match(route, /withheld: f\.withholding_amount/);
});

test('a missing figure is null in the report, never zero', () => {
    // parseFloat(null) is NaN and Number(null) is 0. A zero here reads as
    // "nothing was withheld", which is a claim, not an absence.
    const route = code('pages/api/bankroll/tax-report.js');
    for (const field of ['federal_withheld', 'state_withheld']) {
        const re = new RegExp(`f\\.${field} !== null && f\\.${field} !== undefined \\? parseFloat\\(f\\.${field}\\) : null`);
        assert.match(route, re, `${field} must be null when absent`);
    }
});
