import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('the non-owner incident proof is manual-only and uses the existing CI test identity', () => {
    const workflow = read('.github/workflows/global-footer-e2e.yml');
    assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.reliability_incident_non_owner_live/);
    assert.match(workflow, /!inputs\.reliability_incident_non_owner_live \}\}/, 'the footer contract must not also run on this dispatch');
    assert.match(workflow, /run: node scripts\/qualification\/reliabilityIncidentNonOwnerLive\.mjs/);
    const job = workflow.slice(workflow.indexOf('reliability-incident-non-owner-live:'));
    assert.match(job, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL \|\| secrets\.TEST_USER_EMAIL \}\}/);
    assert.match(job, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
    assert.doesNotMatch(job, /SUPABASE_SERVICE_ROLE_KEY/, 'the proof must use only the publishable key the app ships');
});

test('the proof refuses at the RPC and on the page, and never leaks or signs out globally', () => {
    const proof = read('scripts/qualification/reliabilityIncidentNonOwnerLive.mjs');
    const view = read('src/components/reliability/ReliabilityIncidentView.jsx');
    assert(proof.indexOf('isDedicatedProbeAccount(email)') < proof.indexOf('signInWithPassword'));
    assert.match(proof, /\/rest\/v1\/rpc\/fn_reliability_incident_for_owner/);
    assert.match(proof, /apikey: anonKey, Authorization: `Bearer \$\{session\.access_token\}`/);
    assert.match(proof, /17b7b46a-9a6f-424e-b0fa-6f99533e711c/);
    assert.match(proof, /assert\.equal\(payload\.code, '42501'\)/);
    assert.match(proof, /'HorseFleetCollapsed'/);
    assert.match(proof, /width: 375, height: 812/);
    assert.match(proof, /data-state="not_authorized"/);
    assert.match(proof, /scrollWidth, geometry\.clientWidth/);
    for (const copy of [...proof.matchAll(/NOT_AUTHORIZED_(?:TITLE|DETAIL) = '([^']+)'/g)].map((m) => m[1])) {
        assert(view.includes(`'${copy}'`), `the proof must assert the view's own copy: ${copy}`);
    }
    assert.match(proof, /signOut\(\{ scope: 'local' \}\)/);
    assert.doesNotMatch(proof, /signOut\(\)|readFile[^\n]*['"]\.env|cron\.schedule|setInterval\(|execFile|console\.log\([^\n]*(session|password|access_token)/i);
});
