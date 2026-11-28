// The Log sheet (LogEntryModal) is an aria-modal dialog, so nothing outside it
// may paint over it. Its overlay sat at z-index 1000, under the fixed global
// header (10050). When the Log Session step grew (the Club Arena sessions
// panel, #3294), the centred sheet reached the top of a 720px-tall desktop
// window and its title and Close went under the header: e2e/029 "Tournament
// entry names its controls" could not click Close (header controls
// intercepted the pointer). It must clear the header and stay under the toast
// layer (100000) so a save error is still seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/bankroll/LogEntryModal.jsx', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/components/ui/UniversalHeader.js', import.meta.url), 'utf8');
const toasts = readFileSync(new URL('../src/components/ui/ToastContainer.js', import.meta.url), 'utf8');

test('every Bankroll modal overlay paints above the global header and below the toasts', () => {
  // The same defect, next to arrive: Bankroll Projection's overlay sat at 100
  // and e2e/029 "A bookmarked projection opens its popup" could not click its
  // Close either. Every component that draws .bankroll-modal-overlay clears it.
  const headerZ = Number(header.match(/\.approved-global-header \{[^}]*z-index: (\d+);/)?.[1]);
  const toastZ = Number(toasts.match(/zIndex: (\d+),/)?.[1]);
  for (const file of ['LogEntryModal.jsx', 'BankrollProjection.jsx', 'StartingBankrollModal.jsx', 'ManageVenuesModal.jsx']) {
    const text = readFileSync(new URL('../src/components/bankroll/' + file, import.meta.url), 'utf8');
    assert.match(text, /className="bankroll-modal-overlay"/, file + ' draws the shared overlay');
    const z = Number(text.match(/overlay: \{[\s\S]{0,900}?zIndex: (\d+),/)?.[1]);
    assert.ok(z > headerZ, `${file} overlay ${z} must beat the ${headerZ} global header`);
    assert.ok(z < toastZ, `${file} overlay ${z} must stay under the ${toastZ} toast layer`);
  }
});

test('the Log sheet overlay paints above the global header and below the toasts', () => {
  const overlay = src.match(/const styles = \{\s*overlay: \{[\s\S]*?zIndex: (\d+),/);
  assert.ok(overlay, 'LogEntryModal declares its overlay zIndex');
  const headerZ = Number(header.match(/\.approved-global-header \{[^}]*z-index: (\d+);/)?.[1]);
  const toastZ = Number(toasts.match(/zIndex: (\d+),/)?.[1]);
  assert.ok(headerZ > 0 && toastZ > 0, 'header and toast layers found');
  assert.ok(Number(overlay[1]) > headerZ, `overlay ${overlay[1]} must beat the ${headerZ} global header`);
  assert.ok(Number(overlay[1]) < toastZ, `overlay ${overlay[1]} must stay under the ${toastZ} toast layer`);
});
