import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';import vm from'node:vm';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const source=process.env.REELS_PRIVATE_BASELINE==='1'?execFileSync('git',['show','HEAD:src/lib/server/reelsFeed.js'],{encoding:'utf8'}):readFileSync(new URL('../src/lib/server/reelsFeed.js',import.meta.url),'utf8');
function handler(row){
 const start=source.indexOf('async function readDetail('),end=source.indexOf('async function readOwnedCollectionChunk',start);
 const context={REEL_SELECT:'*',UUID_RE:/^[0-9a-f-]{36}$/i,ReelsFeedInputError:Error,eligibleRows:async(_client,rows,_scope,options)=>rows.filter(r=>(r.is_public||(options.allowOwnerPrivate&&r.author_id===options.ownerId))&&r.media_status==='ready'&&!r.is_deleted&&!r.taken_down_at),canonicalWinners:async()=>new Map(),canonicalOwnerWinners:async(_client,rows,actor)=>new Map(rows.filter(r=>r.author_id===actor).map(r=>[r.canonical_asset_key,r])),cursorForRow:()=>({}),isFollowedAuthor:(ids,author)=>ids?.has(author),console};
 vm.runInNewContext(source.slice(start,end)+'\nglobalThis.read=readDetail;',context);
 const client={rpc:async()=>({data:[{canonical_reel_id:id}]}),from:()=>({select(){return this;},or(){return this;},limit:async()=>({data:[row]})})};
 return actor=>context.read(client,id,'all','recent','poker',null,actor);
}
test('actual direct lookup opens only the verified creator private native bookmark',async()=>{
 const row={id,author_id:owner,is_public:false,is_deleted:false,media_status:'ready',playback_type:'native',rights_status:'user_authorized',canonical_asset_key:'native:qa'};
 const read=handler(row);assert.equal((await read(owner)).status,'found');assert.equal((await read(null)).status,'unavailable');assert.equal((await read(id)).status,'unavailable');
 for(const patch of[{is_deleted:true},{taken_down_at:new Date().toISOString()},{media_status:'processing'},{playback_type:'youtube_embed'},{rights_status:'blocked'}])assert.equal((await handler({...row,...patch})(owner)).status,'unavailable');
});
test('the verified creator is used only for pinned detail, never public page scanning',()=>{
 assert.match(source,/readDetail\(client, cursor \? '' : id, scope, sort, category, followedAuthorIds, viewerId\)/);
 const page=source.slice(source.indexOf('async function readPage'),source.indexOf('async function readDetail'));
 assert.doesNotMatch(page,/allowOwnerPrivate|ownerViewerId/);
});
