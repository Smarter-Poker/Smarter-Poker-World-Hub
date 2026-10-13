import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import yaml from 'js-yaml';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('native Reels publishes only the incumbent consumer through its owning manual route',()=>{
 const source=read('.github/workflows/deploy-openclaw.yml'),workflow=yaml.load(source),job=workflow.jobs['native-reels'];
 assert.ok(job);assert.match(job.if,/workflow_dispatch/);assert.match(job.if,/inputs.component == 'native-reels'/);assert.match(workflow.jobs.deploy.if,/inputs.component != 'native-reels'/);
 const steps=job.steps.map(step=>step.run||'').join('\n');
 assert.match(steps,/\/opt\/smarter-poker\/transcode-worker/);assert.match(steps,/test -f \/etc\/sp-transcode.env/);assert.doesNotMatch(steps,/read.*sp-transcode\.env|cat.*sp-transcode\.env|source.*\.env|\/proc\/.*environ/);
 assert.match(steps,/previous_invocation/);assert.match(steps,/trap rollback ERR/);assert.match(steps,/test.*is-enabled/);assert.match(steps,/freshProcessingProven.*false/);
 assert.doesNotMatch(steps,/systemctl (?:restart|enable) (?:openclaw|poker|club)|npm install|useradd|apt-get/);
 const trust=job.steps.find(step=>step.name==='Trust the independently pinned existing host');assert.match(trust.run,/MnBhnIy9\+ocCKI8Dlg74XgqBIdMK\+M7TNFKMC9OeVyM/);assert.match(steps,/StrictHostKeyChecking=yes/);
 assert.ok(job.steps.some(step=>step.with?.['ssh-private-key']==='${{ secrets.OPENCLAW_SSH_PRIVATE_KEY }}'));
 assert.doesNotMatch(source,/schedule:/);
});
test('private fixture qualification uses a dedicated credential and retained exact operation receipts',()=>{
 const workflow=yaml.load(read('.github/workflows/e2e-tests.yml'));
 const setup=workflow.jobs['reels-qa-setup'],proof=workflow.jobs['reels-enhancements-live'];assert.ok(setup&&proof);
 assert.match(setup.if,/refs\/heads\/main/);assert.match(proof.if,/refs\/heads\/main/);
 const created=setup.steps.find(step=>step.run==='node scripts/ci/reels-qa-fixture-setup.mjs');assert.equal(created.env.REELS_QA_PASSWORD,'${{ secrets.REELS_QA_PASSWORD }}');
 const recovery=setup.steps.find(step=>step.uses==='actions/download-artifact@v4');assert.equal(recovery.if,"inputs.reels_qa_setup_run != ''");assert.equal(recovery.with['run-id'],'${{ inputs.reels_qa_setup_run }}');assert.equal(recovery.with.name,'reels-qa-setup-receipt');assert.equal(recovery.with.path,'test-results/reels-qa-prior');assert.equal(setup.permissions.actions,'read');assert.match(created.env.REELS_QA_PRIOR_SETUP_RECEIPT,/test-results\/reels-qa-prior\/setup.json/);
 const api=proof.steps.find(step=>step.run==='node scripts/ci/reels-interaction-live-check.mjs --execute');assert.equal(api.env.TEST_USER_EMAIL,'reels-qa@smarter.poker');assert.equal(api.env.TEST_USER_PASSWORD,'${{ secrets.REELS_QA_PASSWORD }}');
 const browser=proof.steps.find(step=>step.run==='node scripts/ci/reels-enhancements-live-check.mjs');assert.equal(browser.env.REELS_QA_SETUP_RECEIPT,'test-results/reels-qa/setup.json');assert.equal(browser.env.REELS_EXPECTED_SHA,'${{ inputs.expected_sha }}');assert.equal(browser.env.SUPABASE_SERVICE_ROLE_KEY,undefined);
 assert.ok(proof.steps.some(step=>step.if==='always()'&&step.with?.name==='reels-enhancements-live-receipt'));
 const command=read('.github/workflows/build-safety-gate.yml');for(const file of ['reel-comment-attempts','reels-atomic-viewer-interactions','reels-native-captions-postgres','reel-reaction-intent-postgres','reels-measured-delivery-postgres','private-native-reels-story-isolation-postgres','reels-source-post-reward-return-postgres'])assert.ok(command.includes(`__tests__/${file}.test.mjs`),file);
 assert.match(command,/REELS_STORY_ISOLATION_POSTGRES_ROOT: \$\{\{ runner.temp \}\}\/reels-enhancements/);
});
