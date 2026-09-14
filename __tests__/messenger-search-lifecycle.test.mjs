import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as pause } from 'node:timers/promises';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function fixture() {
 let state, dependencies, cleanup, effect;
 const mockReact = {
  useState: () => [state, value => { state = value; }],
  useEffect: (callback, deps) => {
   if (!dependencies || deps.some((value, i) => !Object.is(value, dependencies[i]))) {
    dependencies = deps; effect = callback;
   }
  },
 };
 const code = ts.transpileModule(fs.readFileSync(new URL('../src/hooks/useMessengerSearch.js', import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 const module = { exports: {} };
 new Function('require', 'module', 'exports', code)(name => { assert.equal(name, 'react'); return mockReact; }, module, module.exports);
 const pending = [];
 const request = (url, options) => new Promise(resolve => pending.push({url, body: JSON.parse(options.body), resolve}));
 const props = {query:'invoice', scope:'account-a:club:conversation-a', url:'/search', payload:{conversationId:'conversation-a'}, request, delay:0};
 return {
  props, pending,
  render(overrides={}) { Object.assign(props, overrides); return module.exports.default(props); },
  commit() { if (effect) { cleanup?.(); cleanup=effect(); effect=null; } },
  unmount() { cleanup?.(); },
 };
}
const response = (results, ok=true) => ({ok, json:async()=>({success:ok, results})});
async function settle() { await pause(5); }

test('changing account or conversation hides prior results before effects and ignores late completion', async () => {
 const f=fixture(); f.render(); f.commit(); await settle();
 f.pending[0].resolve(response([{id:'a',conversation_id:'conversation-a'}])); await settle();
 assert.equal(f.render().results[0].id,'a');
 let result=f.render({scope:'account-b:club:conversation-b',payload:{conversationId:'conversation-b'}});
 assert.deepEqual(result.results,[]); assert.equal(result.loading,true); f.commit(); await settle();
 assert.equal(f.pending[1].body.conversationId,'conversation-b');
 f.pending[1].resolve(response([{id:'b',conversation_id:'conversation-b'}])); await settle();
 assert.equal(f.render().results[0].id,'b'); f.unmount();
});
test('an old query finishing after a new query cannot overwrite the current results', async () => {
 const f=fixture(); f.render({query:'first'}); f.commit(); await settle();
 f.render({query:'second'}); f.commit(); await settle();
 f.pending[1].resolve(response([{id:'new'}])); await settle();
 f.pending[0].resolve(response([{id:'old'}])); await settle();
 assert.equal(f.render().results[0].id,'new'); f.unmount();
});
test('closing search clears results immediately and an in-flight response stays hidden', async () => {
 const f=fixture(); f.render(); f.commit(); await settle();
 assert.deepEqual(f.render({scope:null}),{results:[],loading:false,error:null}); f.commit();
 f.pending[0].resolve(response([{id:'closed'}])); await settle();
 assert.deepEqual(f.render().results,[]); f.unmount();
});
test('server refusal is visibly unavailable instead of a successful empty search', async () => {
 const f=fixture(); f.render(); f.commit(); await settle();
 f.pending[0].resolve(response([],false)); await settle();
 const failed=f.render(); assert.match(failed.error,/Unavailable/); assert.deepEqual(failed.results,[]); assert.equal(failed.loading,false);
 f.render({query:'other'}); f.commit(); await settle(); f.pending[1].resolve(response([])); await settle();
 assert.deepEqual(f.render(),{results:[],loading:false,error:null}); f.unmount();
});
test('malformed server payload is unavailable and short searches make no request', async () => {
 const f=fixture(); assert.equal(f.render({query:'x'}).loading,false); f.commit(); await settle(); assert.equal(f.pending.length,0);
 f.render({query:'valid'}); f.commit(); await settle(); f.pending[0].resolve(response(null)); await settle();
 assert.match(f.render().error,/Unavailable/); f.unmount();
});
