import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {dispatcherWorkflowContract,shouldPublishDispatcher} from '../scripts/ci/openclaw-component-diff.mjs';
const after=readFileSync(new URL('../.github/workflows/deploy-openclaw.yml',import.meta.url),'utf8');const before=after.split('\n  native-reels:\n')[0]
 .replace(/  select-component:\n[\s\S]*?(?=  deploy:\n)/,'')
 .replace(/      component:\n[\s\S]*?(?=      source_registry_max_sources:)/,'')
 .replace(/      - 'scripts\/ci\/openclaw-component-diff\.mjs'\n/g,'')
 .replace(/    needs: select-component\n/,'')
 .replace(/^    if: github.ref == 'refs\/heads\/main' &&[^\n]+$/m,"    if: github.ref == 'refs/heads/main'");
test('adding the native-only component cannot restart an unchanged dispatcher',()=>{assert.equal(dispatcherWorkflowContract(before),dispatcherWorkflowContract(after));assert.equal(shouldPublishDispatcher({event:'push',paths:['scripts/transcode-worker/index.js','.github/workflows/deploy-openclaw.yml'],before,after}),false);assert.equal(shouldPublishDispatcher({event:'workflow_dispatch',component:'native-reels'}),false);assert.equal(shouldPublishDispatcher({event:'workflow_dispatch',component:'dispatcher'}),true);});
test('actual dispatcher runtime, environment or global contract changes retain publication',()=>{assert.equal(shouldPublishDispatcher({event:'push',paths:['scripts/openclaw.service']}),true);assert.equal(shouldPublishDispatcher({event:'push',paths:['.github/workflows/deploy-openclaw.yml'],before:after,after:after.replace('timeout-minutes: 120','timeout-minutes: 121')}),true);assert.equal(shouldPublishDispatcher({event:'push',paths:['.github/workflows/deploy-openclaw.yml'],before:after,after:after.replace('group: deploy-openclaw','group: changed-owning-concurrency')}),true);assert.equal(shouldPublishDispatcher({event:'push',paths:['.github/workflows/deploy-openclaw.yml'],before:'',after}),true);});
