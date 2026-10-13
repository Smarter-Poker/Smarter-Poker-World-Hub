import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
test('channel browser regression is seeded separately and actually invoked before broad checks', () => {
    const workflow = read('.github/workflows/global-footer-e2e.yml');
    assert.match(workflow, /node scripts\/qualification\/videoLibraryChannelsBrowser\.mjs/);
    assert(workflow.indexOf('node scripts/qualification/videoLibraryChannelsBrowser.mjs') < workflow.indexOf('Mobile performance budget'));
    const runner = read('scripts/qualification/videoLibraryChannelsBrowser.mjs');
    assert.match(runner, /022-video-library-channels/); assert.match(runner, /SUPABASE_URL: fixtureUrl/);
    assert.match(runner, /expected !== 9|expected === 9|expected, 9|expected: 9/);
});
test('authenticated live proof is manual-only, exact-revision-bound and uses the existing test identity', () => {
    const workflow = read('.github/workflows/global-footer-e2e.yml');
    assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.video_library_phase5_live/);
    assert.match(workflow, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL \|\| secrets\.TEST_USER_EMAIL \}\}/);
    assert.match(workflow, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
    const proof = read('scripts/qualification/videoLibraryPhase5Live.mjs');
    assert(proof.indexOf('isDedicatedProbeAccount(email)') < proof.indexOf('signInWithPassword'));
    assert.match(proof, /assert\.equal\(health\.commitSha, expected\)/);
    assert.match(proof, /Smarter\.Poker Official/); assert.match(proof, /signOut\(\{ scope: 'local' \}\)/);
    assert.match(proof, /await set\(prior\.following, prior\.notificationsEnabled\)/);
    assert.doesNotMatch(proof, /signOut\(\)|readFile[^\n]*['"]\.env|cron\.schedule|setInterval\(|execFile|console\.log\(session/);
});
