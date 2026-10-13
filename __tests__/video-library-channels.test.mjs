import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIDEO_LIBRARY_ALLOWED_TYPES, isVideoLibraryVideoAllowed, BLOCKED_VIDEO_LIBRARY_IDS } from '../src/lib/videoLibraryAvailability.js';
import { dedupeVideos, isCuratedFeedVideo } from '../src/lib/videoLibraryCuration.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow } from '../src/lib/videoLibraryWatch.mjs';
import { channelPath, publicVideoChannel, canonicalVideoChannelId, safeChannelExternalUrl } from '../src/lib/videoLibraryChannels.mjs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261013141500_video_library_channel_follows.sql');
const id='11111111-1111-4111-8111-111111111111';
const owner='22222222-2222-4222-8222-222222222222';

test('channel links preserve canonical identity and reject non-provider external links',()=>{
 const channel=publicVideoChannel({id,name:'Hustler Casino Live',handle:'@HustlerCasinoLive',provider_source_id:'UCQe7wB0o_cZgv1miyYB9TMA',attribution_url:'https://www.youtube.com/@HustlerCasinoLive',is_active:true},['HCL'],[{id:'HCL',logo:'/images/video-sources/hcl.webp'}]);
 assert.equal(channel.path,channelPath(id));assert.equal(canonicalVideoChannelId({source:'HCL'},[channel]),id);assert.equal(canonicalVideoChannelId({source:id},[channel]),id);assert.equal(canonicalVideoChannelId({source:'unknown'},[channel]),null);
 assert.deepEqual(channel.sourceKeys,[id,'HCL']);assert.equal(channel.handle,'@HustlerCasinoLive');assert.equal(channel.logo,'/images/video-sources/hcl.webp');
 assert.equal(safeChannelExternalUrl('https://youtube.com.evil.example/'),null);assert.equal(safeChannelExternalUrl('javascript:alert(1)'),null);
});
function handler(path,bindings){const source=read(path).replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replace('export default async function handler','async function handler');return new Function(...Object.keys(bindings),`${source}\nreturn handler;`)(...Object.values(bindings));}
function response(){return{code:200,setHeader(){},status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;}};}
const rate={applyRateLimit:()=>true,LIMITS:{read:{},write:{}}};
function followHandler({user={id:owner},channel={id},rpcData={following:true,notificationsEnabled:true},record={source_id:id,notifications_enabled:true}}={}){
 const calls=[];
 const query={select(){return this;},eq(){return this;},async maybeSingle(){return{data:record};}};
 const fn=handler('pages/api/video-library/channel-follow.js',{...rate,createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:rpcData};},from:()=>query}),getServerUserWithFallback:async()=>({user}),channelServerClient:()=>({}),loadVideoLibraryChannels:async()=>({channel}),process:{env:{NEXT_PUBLIC_SUPABASE_URL:'local-only',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-only'}}});
 return{fn,calls};
}

test('channel follow GET and POST require authenticated current account',async()=>{
 const noAuth=followHandler({user:null});const denied=response();await noAuth.fn({method:'GET',headers:{},query:{channelId:id}},denied);assert.equal(denied.code,401);
 const authed=followHandler();const mismatch=response();await authed.fn({method:'GET',headers:{authorization:'Bearer local-only'},query:{channelId:id,expectedOwnerId:id}},mismatch);assert.equal(mismatch.code,409);assert.equal(authed.calls.length,0);
});
test('follow setter uses verified owner and canonical channel desired state',async()=>{
 const {fn,calls}=followHandler();const res=response();await fn({method:'POST',headers:{authorization:'Bearer local-only'},body:{channelId:'HCL',expectedOwnerId:owner,following:true,notificationsEnabled:true,userId:id}},res);
 assert.equal(res.code,200);assert.equal(res.payload.ownerId,owner);assert.equal(res.payload.channelId,id);assert.deepEqual(calls,[{name:'set_video_library_channel_follow',args:{p_expected_user_id:owner,p_source_id:id,p_following:true,p_notifications_enabled:true}}]);
});
test('follow rejects malformed choices and returns explicit unknown channel',async()=>{
 const {fn,calls}=followHandler();const invalid=response();await fn({method:'POST',headers:{authorization:'Bearer local-only'},body:{channelId:id,following:'true',notificationsEnabled:true}},invalid);assert.equal(invalid.code,400);assert.equal(calls.length,0);
 const absent=followHandler({channel:null});const missing=response();await absent.fn({method:'GET',headers:{authorization:'Bearer local-only'},query:{channelId:'missing'}},missing);assert.equal(missing.code,404);
});
test('channel follow reads actual persisted opt-out and owner identity',async()=>{
 const {fn}=followHandler({record:{source_id:id,notifications_enabled:false}});const res=response();await fn({method:'GET',headers:{authorization:'Bearer local-only'},query:{channelId:id,expectedOwnerId:owner}},res);assert.equal(res.payload.following,true);assert.equal(res.payload.notificationsEnabled,false);assert.equal(res.payload.ownerId,owner);
});
test('public channel API distinguishes missing channel and backend failure',async()=>{
 const missing=handler('pages/api/video-library/channels.js',{...rate,loadVideoLibraryChannels:async()=>({channel:null,channels:[]})});const res=response();await missing({method:'GET',query:{channelId:'missing'}},res);assert.equal(res.code,404);
 const index=response();await missing({method:'GET',query:{}},index);assert.equal(index.code,200);
});
test('notification producer keeps the whole central blocked video list',()=>{for(const id of BLOCKED_VIDEO_LIBRARY_IDS) assert.ok(migration.includes(`'${id}'`),id);});

test('channel migration retains caller/RLS/receipt/eligibility and existing push bridge contracts',()=>{
 assert.match(migration,/auth\.uid\(\)/);assert.match(migration,/u IS DISTINCT FROM p_expected_user_id/);assert.match(migration,/pg_advisory_xact_lock/);assert.match(migration,/PRIMARY KEY\(user_id,youtube_video_id\)/);assert.match(migration,/ON DELETE SET NULL/);
 assert.match(migration,/video_library_public_catalog WHERE youtube_video_id=NEW\.youtube_video_id/);assert.match(migration,/created_at<=COALESCE\(NEW\.published_at,NEW\.scraped_at\)/);assert.match(migration,/FOR SHARE/);assert.match(migration,/ON CONFLICT\(user_id,youtube_video_id\) DO NOTHING/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.set_video_library_channel_follow[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.set_video_library_channel_follow[\s\S]*TO authenticated/);
 assert.doesNotMatch(migration,/INSERT INTO public\.push_outbox/);assert.doesNotMatch(migration,/pg_cron|cron\.schedule|UPDATE public\.video_library_videos/);
 assert.match(migration,/NEW\.source_id::uuid/);assert.match(migration,/The Channel Published A New Verified Video/);
});

test('real server channel loader resolves legacy identity and applies catalog curation',async()=>{
 const source=read('src/lib/server/videoLibraryChannels.js').replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replace(/export /g,'');
 const calls=[];const checked=new Date().toISOString();
 const rows=['Poker Hand','Blackjack Hand','Unavailable Poker'].map((title,index)=>({youtube_video_id:`${index}2345678901`,source_id:'HCL',source_name:'Hustler Casino Live',title,type:'cash',availability_status:index===2?'unknown':'verified',embeddable:true,availability_checked_at:checked}));
 const datasets={content_sources:[{id,name:'Hustler Casino Live',kind:'youtube_channel',handle:'@HustlerCasinoLive',is_active:true,lifecycle_status:'active'}],video_library_channel_aliases:[{source_key:'HCL',source_id:id}],video_library_public_catalog:rows};
 function from(table){const query=new Proxy({}, {get(_t,method){if(method==='then') return (resolve)=>resolve({data:datasets[table],count:rows.length});return (...args)=>{calls.push([table,method,...args]);return query;};}});return query;}
 const bindings={createClient:()=>({from}),VIDEO_LIBRARY_ALLOWED_TYPES,isVideoLibraryVideoAllowed,dedupeVideos,isCuratedFeedVideo,VIDEO_ROW_FIELDS,normaliseVideoRow,VIDEO_LIBRARY_SOURCES:[{id:'HCL',logo:'/hcl.webp'}],CHANNEL_ID_RE:/^[0-9a-f-]{36}$/i,CHANNEL_KEY_RE:/^[A-Za-z0-9_-]{1,80}$/,publicVideoChannel,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'local-only',SUPABASE_SERVICE_ROLE_KEY:'local-only'}}};
 const load=new Function(...Object.keys(bindings),`${source}\nreturn loadVideoLibraryChannels;`)(...Object.values(bindings));
 const payload=await load({channelId:'HCL'});assert.equal(payload.channel.id,id);assert.deepEqual(payload.data.map(video=>video.rawTitle),['Poker Hand']);
 assert.deepEqual(calls.find(call=>call[0]==='video_library_public_catalog'&&call[1]==='in'&&call[2]==='source_id')[3],[id,'HCL']);
 const invalid=await load({channelId:'bad,syntax'});assert.equal(invalid.channel,null);
});

test('existing safety gate executes isolated exact PostgreSQL 17 channel qualification',()=>{
 const workflow=read('.github/workflows/build-safety-gate.yml');
 const step=workflow.slice(workflow.indexOf('- name: Video Library Channel Follows PostgreSQL 17')).split('\n      - name:')[0];
 assert.ok(workflow.indexOf('Resolve Exact PostgreSQL 17 Training Test Binaries')<workflow.indexOf('- name: Video Library Channel Follows PostgreSQL 17'));
 assert.match(step,/PHASE6_POSTGRES_BIN: \$\{\{ env\.PHASE6_POSTGRES_BIN \}\}/);
 assert.match(step,/VIDEO_CHANNEL_PG_WORK_PARENT: \$\{\{ runner\.temp \}\}\/video-channel-pg/);
 assert.match(step,/VIDEO_CHANNEL_PG_EVIDENCE_DIR: \$\{\{ runner\.temp \}\}\/video-channel-evidence/);
 assert.match(step,/run: node scripts\/qualification\/videoLibraryChannelFollows\.mjs/);
 const qualification=read('scripts/qualification/videoLibraryChannelFollows.mjs');
 assert.match(qualification,/mkdtempSync/);assert.match(qualification,/listen_addresses=''/);assert.match(qualification,/Exact PostgreSQL 17 is required/);assert.match(qualification,/rmSync\(work/);
});
