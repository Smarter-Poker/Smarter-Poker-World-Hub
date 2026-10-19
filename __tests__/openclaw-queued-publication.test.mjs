import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const workflow=readFileSync(new URL('../.github/workflows/deploy-openclaw.yml',import.meta.url),'utf8');
const deploy=workflow.slice(workflow.indexOf('\n  deploy:\n')).split('\n  native-reels:\n')[0];
const checkout=deploy.slice(deploy.indexOf('- name: Checkout'),deploy.indexOf('- name: Require the exact merged main revision'));
const guard=deploy.match(/- name: Require the exact merged main revision\n        run: \|\n([\s\S]*?)(?=\n      - name:)/)?.[1].replace(/^          /gm,'');
test('the required safety check executes the queued-publication regression',()=>{
 const safety=readFileSync(new URL('../.github/workflows/build-safety-gate.yml',import.meta.url),'utf8');
 assert.match(safety,/run: node --test __tests__\/openclaw\*\.test\.mjs/);
});
function fixture(run){
 const root=mkdtempSync(join(tmpdir(),'openclaw-queued-publication-'));
 const repository=join(root,'source'),remote=join(root,'remote.git'),worker=join(root,'worker'),receipt=join(root,'receipt');
 const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  execFileSync('git',['init','--bare','--initial-branch=main',remote],{stdio:'pipe'});
  execFileSync('git',['init','--initial-branch=main',repository],{stdio:'pipe'});
  git(repository,'config','user.name','Publication Fixture');git(repository,'config','user.email','fixture@example.invalid');
  writeFileSync(join(repository,'runtime'),'first');git(repository,'add','runtime');git(repository,'-c','commit.gpgsign=false','commit','-m','First protected source');const trigger=git(repository,'rev-parse','HEAD');
  git(repository,'remote','add','origin',remote);git(repository,'push','origin','main');
  writeFileSync(join(repository,'runtime'),'current');git(repository,'add','runtime');git(repository,'-c','commit.gpgsign=false','commit','-m','Later protected source');const current=git(repository,'rev-parse','HEAD');git(repository,'push','origin','main');
  execFileSync('git',['clone','--branch','main',remote,worker],{stdio:'pipe'});
  const execute=(ref='refs/heads/main')=>spawnSync('bash',['-c',guard],{cwd:worker,encoding:'utf8',env:{...process.env,GITHUB_REF:ref,GITHUB_SHA:trigger,GITHUB_ENV:receipt}});
  run({git,worker,trigger,current,receipt,execute});
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('a queued dispatcher publishes protected main at worker admission, not its old event SHA',()=>fixture(({git,worker,trigger,current,receipt,execute})=>{
 // GitHub's default checkout takes the event SHA. The maintained literal ref
 // must select main only after this deployment job receives its runner.
 if(!/\n          ref: main\n/.test(checkout))git(worker,'checkout',trigger);
 const result=execute();assert.equal(result.status,0,result.stderr);
 assert.equal(git(worker,'rev-parse','HEAD'),current);
 assert.match(readFileSync(receipt,'utf8'),new RegExp(`^OPENCLAW_RELEASE_SHA=${current}$`,'m'));
 assert.doesNotMatch(deploy,/\bGITHUB_SHA\b/,'Every dispatcher archive, promotion and follow-up must use the admitted source');
 assert.match(deploy,/archive="\$RUNNER_TEMP\/openclaw-\$\{OPENCLAW_RELEASE_SHA\}/);
}));
test('an actual main advance after checkout still refuses before a release identity exists',()=>fixture(({git,worker,trigger,receipt,execute})=>{
 git(worker,'checkout',trigger);assert.notEqual(execute().status,0);assert.equal(existsSync(receipt),false);
}));
test('a non-main workflow ref cannot admit production source',()=>fixture(({receipt,execute})=>{
 assert.notEqual(execute('refs/heads/untrusted').status,0);assert.equal(existsSync(receipt),false);
}));
