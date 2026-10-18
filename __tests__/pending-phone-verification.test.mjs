import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { savePendingPhoneVerification, readPendingPhoneVerification, clearPendingPhoneVerification, PHONE_CODE_WINDOW_MS } from '../src/lib/pendingPhoneVerification.mjs';

test('SMS entry survives remount for ten minutes, is account scoped, and stores no code', () => {
    const entries = new Map();
    const storage = { getItem: k => entries.get(k), setItem: (k,v) => entries.set(k,v), removeItem: k => entries.delete(k) };
    const sent = 1000000;
    savePendingPhoneVerification(storage, 'one', '2025550123', sent);
    assert.deepEqual(readPendingPhoneVerification(storage, 'one', sent + 599999), {phone:'2025550123', sentAt:sent, expiresAt:sent + PHONE_CODE_WINDOW_MS});
    assert.equal(readPendingPhoneVerification(storage, 'two', sent + 1000), null);
    assert.deepEqual(Object.keys(JSON.parse([...entries.values()][0])).sort(), ['expiresAt','phone','sentAt']);
    assert.equal(readPendingPhoneVerification(storage, 'one', sent + 600000), null);
    assert.equal(entries.size, 0);
    savePendingPhoneVerification(storage, 'one', '2025550123', sent);
    clearPendingPhoneVerification(storage, 'one');
    assert.equal(readPendingPhoneVerification(storage, 'one', sent + 1000), null);
});

test('malformed, future and extended challenge records cannot restore entry', () => {
    for (const pending of ['not-json', JSON.stringify({phone:'short',sentAt:100,expiresAt:600100}), JSON.stringify({phone:'2025550123',sentAt:200,expiresAt:600200}), JSON.stringify({phone:'2025550123',sentAt:100,expiresAt:999999})]) {
        const storage = {getItem:()=>pending,removeItem:()=>{}};
        assert.equal(readPendingPhoneVerification(storage, 'one', 150), null);
    }
});

test('mounted verification page restores the code field after reload without sending another SMS', async () => {
    const require = createRequire(import.meta.url);
    const React = require('react'), ts = require('typescript');
    const { create, act } = require('react-test-renderer');
    const entries = new Map(), sends = [];
    const storage = { getItem:k=>entries.get(k), setItem:(k,v)=>entries.set(k,v), removeItem:k=>entries.delete(k) };
    let now = Date.now();
    const mod = {exports:{}};
    const compiled = ts.transpileModule(readFileSync(new URL('../pages/hub/verify-phone.js', import.meta.url),'utf8'), {
        compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS},
    }).outputText;
    vm.runInNewContext(compiled, {
        exports:mod.exports,module:mod,console,sessionStorage:storage,
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
        setTimeout:()=>1,clearTimeout:()=>{},window:{location:{replace:()=>{}}},
        require:name=>{
            if(name==='react'||name==='react/jsx-runtime')return require(name);
            if(name==='next/router')return {useRouter:()=>({query:{},replace:()=>{}})};
            if(name.endsWith('/VerificationConsole'))return {default:props=>React.createElement('div',{id:'console',...props})};
            if(name.endsWith('/SEOHead'))return {default:()=>null};
            if(name.endsWith('/authUtils'))return {useRequireAuth:()=>({user:{id:'test-player'},checking:false}),getAccessToken:()=>'',authedFetch:async(...args)=>{sends.push(args);return {ok:true,json:async()=>({success:true})};}};
            if(name.endsWith('/supabase'))return {supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{phone_verified:false}})})})}),auth:{updateUser:async()=>({})}}};
            if(name.endsWith('/clubInvite'))return {safeClubArenaPath:()=>null,fetchPendingJoinPath:async()=>null};
            if(name.endsWith('/phoneWelcome'))return {shouldOfferPhoneWelcome:()=>true};
            if(name.endsWith('/pendingPhoneVerification.mjs'))return {
                savePendingPhoneVerification:(s,u,p)=>savePendingPhoneVerification(s,u,p,now),
                readPendingPhoneVerification:(s,u)=>readPendingPhoneVerification(s,u,now),clearPendingPhoneVerification,
            };
            return {};
        },
    });
    let tree;
    const mount=async()=>{await act(async()=>{tree=create(React.createElement(mod.exports.default));});};
    const props=()=>tree.root.findByProps({id:'console'}).props;
    await mount();
    await act(async()=>props().onPhoneChange({target:{value:'2025550123'}}));
    await act(async()=>props().sendCode());
    assert.equal(props().stage,'code');
    assert.equal(sends.length,1);
    await act(async()=>tree.unmount());
    now+=599999;
    await mount();
    assert.equal(props().stage,'code');
    assert.equal(props().phone,'2025550123');
    assert.equal(props().cooldown,0);
    assert.equal(sends.length,1,'restoration must not send or invalidate a code');
    await act(async()=>props().skip());
    await act(async()=>tree.unmount());
    await mount();
    assert.equal(props().stage,'phone','explicit Skip clears pending verification');
    await act(async()=>tree.unmount());
});
