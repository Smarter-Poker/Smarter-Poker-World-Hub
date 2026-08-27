import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/memory-games.js');
const CSS = read('src/styles/worlds/memory-games.css');
const DIAMOND_ENGINE = read('src/services/DiamondEngine.js');

test('the page relies on shared service clients and follows authenticated user changes', () => {
    assert.doesNotMatch(PAGE, /from '@supabase\/supabase-js'/);
    assert.doesNotMatch(PAGE, /\bcreateClient\(/);
    assert.doesNotMatch(PAGE, /supabase\.current/);
    assert.doesNotMatch(DIAMOND_ENGINE, /import \{ createClient \} from '@supabase\/supabase-js'/);
    assert.match(PAGE, /await DiamondEngine\.init\(userId \|\| null\)/);
    assert.match(PAGE, /\}, \[userId\]\);/);
});

test('leak analysis and keyboard wiring clean up and avoid native-control double submits', () => {
    assert.match(PAGE, /leakAnalyzer\.setUserId\(userId \|\| null\)/);
    assert.match(PAGE, /leakAnalyzer\.stop\(\)/);
    assert.match(PAGE, /closest\('button, a, input, select, textarea, \[contenteditable="true"\]'\)/);
    assert.match(PAGE, /\(e\.metaKey \|\| e\.ctrlKey\).*e\.key\.toLowerCase\(\) === 'z'/s);
});

test('mobile Range Lab has a sticky editing command strip with recoverable clear', () => {
    assert.match(PAGE, /className="preflop-lab-command-strip"/);
    assert.match(PAGE, /onClick=\{handleUndo\}/);
    assert.match(PAGE, /onClick=\{handleRedo\}/);
    assert.match(PAGE, /onClick=\{handleClearRange\}/);
    assert.match(PAGE, /className="preflop-lab-command-actions"/);
    assert.match(PAGE, /className="preflop-lab-live" aria-live="polite"/);
    assert.match(CSS, /\.preflop-lab-command-strip\s*\{[\s\S]*position:\s*sticky;[\s\S]*env\(safe-area-inset-top/);
    assert.match(CSS, /@media \(min-width: 768px\)[\s\S]*\.preflop-lab-command-strip\s*\{[\s\S]*position:\s*relative/);
});

test('matrix focus keeps undo, redo, and action-number shortcuts wired', () => {
  assert.match(PAGE, /const isTextEntry = target\?\.closest/);
  assert.match(PAGE, /if \(isTextEntry\) return;[\s\S]*handleRedo\(\);[\s\S]*handleUndo\(\);/);
  assert.match(PAGE, /const found = actions\.find[\s\S]*if \(isTextEntry\) return;[\s\S]*handleActionSelect/);
  assert.match(PAGE, /if \(isInteractiveTarget\) return;[\s\S]*if \(key === 'Enter' \|\| key === ' '\)/);
});

test('empty filter results use branded status and never charge or block with an alert', () => {
    assert.match(PAGE, /setGameNotice\(\{[\s\S]*No scenarios match this level/);
    assert.doesNotMatch(PAGE, /alert\('No scenarios available/);
    assert.match(PAGE, /if \(!scenario\) \{[\s\S]*setGameNotice[\s\S]*return;[\s\S]*DiamondEngine\.getBalance\(\)/);
});

test('VIP checkout sends the server-owned plan key and is idempotent', () => {
    assert.match(PAGE, /'X-Checkout-Request-ID': `preflop-vip-\$\{crypto\.randomUUID\(\)\}`/);
    assert.match(PAGE, /items: \[\{ plan: 'monthly' \}\]/);
    assert.doesNotMatch(PAGE, /NEXT_PUBLIC_STRIPE_VIP_PRICE_ID|price_vip_monthly/);
    assert.match(PAGE, /if \(vipCheckoutRef\.current\) return;[\s\S]*vipCheckoutRef\.current = true/);
    assert.match(PAGE, /disabled=\{vipCheckoutPending\}/);
    assert.match(PAGE, /className="preflop-vip-notice" role="status"/);
});
