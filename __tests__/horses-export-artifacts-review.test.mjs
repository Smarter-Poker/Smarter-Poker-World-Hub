import assert from 'node:assert/strict';
import test from 'node:test';
import { captureExportSource } from '../src/lib/horses/exportArtifactSource.js';
const capture=read=>captureExportSource({db:{},op:{},job:{surface:'mint-register',filters:{}},readOwners:{mint:read}});
test('an earlier partial page cannot become a complete export on a healthy last page',async()=>{
 const report=await capture(async({query})=>({state:query.offset?'ready':'partial',rows:[{id:query.offset?'b':'a'}],total:2}));
 assert.equal(report.complete,false,'any partial page must remain disclosed in the persisted capture');
});
test('source rows exceeding its stated total cannot claim complete',async()=>{
 let report;
 try {report=await capture(async()=>({rows:[{id:'a'},{id:'b'}],total:1}));}
 catch(error){assert.match(error.message,/source_changed|source_invalid/);return;}
 assert.equal(report.complete,false,'count mismatch must refuse or explicitly mark the export incomplete');
});

import { requestExportArtifact, downloadExportArtifact } from '../src/components/horses/exportArtifactClient.js';
import { exportDescriptor } from '../src/lib/horses/exportArtifactRegistry.js';
test('pending export operation identity belongs to the original account',async()=>{
 const ids=[];
 const authFetch=async(_url,options)=>{ids.push(JSON.parse(options.body).opId);throw new Error('unknown');};
 const a={operatorId:'account-a',isCurrent:()=>true}, b={operatorId:'account-b',isCurrent:()=>true};
 await assert.rejects(requestExportArtifact(authFetch,'mint-register',{asset:'chips'},{scope:a}));
 await assert.rejects(requestExportArtifact(authFetch,'mint-register',{asset:'chips'},{scope:b}));
 await assert.rejects(requestExportArtifact(authFetch,'mint-register',{asset:'chips'},{scope:a}));
 assert.notEqual(ids[0],ids[1]);assert.equal(ids[0],ids[2]);
});
test('an export without confirmed account scope refuses before request',async()=>{
 let called=false;
 await assert.rejects(requestExportArtifact(async()=>{called=true;},'mint-register'),/Account Could Not Be Confirmed/);
 assert.equal(called,false);
});
test('a late original-account download cannot reach the browser after account switch',async()=>{
 let current=true, resolve;
 const scope={operatorId:'account-a',isCurrent:()=>current};
 const pending=downloadExportArtifact(async(_url,options)=>{
  assert.equal(options.expectedOperatorId,'account-a');assert.equal(options.responseType,'blob');
  return new Promise(done=>{resolve=done;});
 },{id:'job-a',content_sha256:'unused'},false,{scope});
 current=false;resolve({blob:new Blob(['private bytes']),contentSha256:'unused'});
 await assert.rejects(pending,/Account Or View Changed/);
});
test('date filters cannot label an economy report whose owner ignores them',()=>{
 for(const surface of ['economy-invoices','economy-manifests','economy-digest-evidence','economy-job-evidence']) {
  assert.throws(()=>exportDescriptor(surface,{fromDay:'2026-01-01'}),/filter_invalid/);
 }
});

test('actual fleet shape completes 450 rows despite each page reporting truncated',async()=>{
 const items=Array.from({length:450},(_,id)=>({horse_id:String(id)}));
 const report=await captureExportSource({db:{},op:{},job:{surface:'fleet-roster',filters:{lane:'A'}},readOwners:{fleet:async({query})=>{
  assert.equal(query.lane,'A');
  const rows=items.slice(query.offset,query.offset+query.limit);
  return {rows,total:items.length,limit:query.limit,offset:query.offset,
   hasMore:query.offset+rows.length<items.length,truncated:items.length>rows.length,labelsComplete:true,failedSources:[]};
 }}});
 assert.equal(report.complete,true);assert.equal(report.rows.length,450);assert.equal(report.total,450);
});
test('actual rake paged shape distinguishes page remainder from bounded source',async()=>{
 const items=Array.from({length:201},(_,id)=>({id,rake_amount:'1.00'}));
 let reads=0;
 const read=bounded=>async({query})=>{const rows=items.slice(query.offset,query.offset+query.limit).map(row=>({...row,as_of:String(++reads),window_start:'start',window_end:String(reads)}));
  const hasMore=query.offset+rows.length<items.length;
  return {state:'rake.ready',rake:{rows,total:201,limit:query.limit,offset:query.offset,hasMore,truncated:hasMore,complete:!hasMore,aggregateWindowComplete:!bounded}};
 };
 const input={db:{},op:{},job:{surface:'stable-rake',filters:{days:7,dimension:'club'}}};
 const full=await captureExportSource({...input,readOwners:{floor:read(false)}});
 assert.equal(full.complete,true);assert.equal(full.rows.length,201);
 const bounded=await captureExportSource({...input,readOwners:{floor:read(true)}});
 assert.equal(bounded.complete,false);assert.equal(bounded.rows.length,201);
});
test('rake-law descriptor consumes the actual nested findings result',async()=>{
 const report=await captureExportSource({db:{},op:{},job:{surface:'rake-law-findings',filters:{}},readOwners:{economy:async()=>({state:'rakelaw.ready',law:{},findings:{rows:[{id:'finding'}],total:1,limit:200,offset:0,hasMore:false}})}});
 assert.deepEqual(report.rows,[{id:'finding'}]);assert.equal(report.complete,true);
});
test('bounded aggregates and partial scheduler evidence cannot become full reports',async()=>{
 for(const [surface,answer] of [
  ['economy-supply',{state:'supply.ready',snapshot:{total:'10',stores:{felt:'10'}}}],
  ['economy-chip-composition',{state:'drift.ready',reconciliation:[{id:'bounded'}]}],
  ['economy-job-evidence',{state:'jobs.partial',rows:[{jobName:'job',evidence:null}]}],
 ]) {
  const report=await captureExportSource({db:{},op:{},job:{surface,filters:{}},readOwners:{economy:async()=>answer}});
  assert.equal(report.complete,false,surface);
 }
});

test('offset source movement cannot silently duplicate an authoritative row identity',async()=>{
 await assert.rejects(capture(async()=>({rows:[{id:'same-row'}],total:2,hasMore:true})),/source_changed/);
});
test('rake comparison still refuses changed financial facts despite changing read annotations',async()=>{
 let reads=0;
 await assert.rejects(captureExportSource({db:{},op:{},job:{surface:'stable-rake',filters:{}},readOwners:{floor:async({query})=>({state:'rake.ready',rake:{rows:[{id:query.offset?'b':'a',rake_amount:String(++reads),as_of:String(reads)}],total:2,offset:query.offset,hasMore:query.offset===0,aggregateWindowComplete:true}})}}),/source_changed/);
});

import { EXPORT_ARTIFACT_REGISTRY } from '../src/lib/horses/exportArtifactRegistry.js';
import { FLEET_STATES } from '../pages/api/horses/fleet-admin.js';
import { APPROVAL_STATUSES } from '../pages/api/horses/operator-admin.js';
import { MINT_REGISTER_FILTER_VALUES } from '../pages/api/horses/mint.js';
import { RAKE_REPORT_DIMENSIONS, QUEUE_AGES } from '../pages/api/horses/floor-admin.js';
import { APPROVAL_KINDS } from '../src/lib/horses/approvals.js';
test('canonical enums preserve every supported read-owner filter value',()=>{
 for(const [surface,key,values] of [
  ['fleet-roster','state',FLEET_STATES],['operator-approvals','status',APPROVAL_STATUSES],
  ['operator-approvals','kind',APPROVAL_KINDS],['stable-rake','dimension',RAKE_REPORT_DIMENSIONS],
  ['stable-cashouts','age',QUEUE_AGES],...Object.entries(MINT_REGISTER_FILTER_VALUES).map(([key,values])=>['mint-register',key,values]),
 ]) {
  for(const value of values)assert.equal(exportDescriptor(surface,{[key]:value}).filters[key],value);
  assert.throws(()=>exportDescriptor(surface,{[key]:'not-a-canonical-value'}),/filter_invalid/);
 }
});
test('UUID, strict calendar and bounded numeric filters cannot silently disappear or clamp',()=>{
 for(const [surface,key] of [['fleet-roster','clubId'],['mint-register','holderId'],['admin-audit-log','adminId']]) {
  assert.throws(()=>exportDescriptor(surface,{[key]:'not-an-id'}),/filter_invalid/);
  assert.equal(exportDescriptor(surface,{[key]:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}).filters[key],'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 }
 for(const bad of ['tomorrow','2026-02-30','2025-02-29'])assert.throws(()=>exportDescriptor('operator-approvals',{to:bad}),/filter_invalid/);
 assert.equal(exportDescriptor('operator-approvals',{to:'2024-02-29'}).filters.to,'2024-02-29','date-only upper-bound remains end-of-day in original owner');
 assert.equal(exportDescriptor('admin-audit-log',{from:'2026-10-09T12:00:00Z',days:30}).filters.days,'30');
 for(const value of ['2x',0,91])assert.throws(()=>exportDescriptor('stable-rake',{days:value}),/filter_invalid/);
 assert.throws(()=>exportDescriptor('admin-audit-log',{days:366}),/filter_invalid/);
 assert.throws(()=>exportDescriptor('fleet-roster',{band:'x'.repeat(61)}),/filter_invalid/);
 assert.throws(()=>exportDescriptor('fleet-roster',{lane:['A','B']}),/filter_invalid/);
 assert.throws(()=>exportDescriptor('stable-cashouts',{status:'x'.repeat(41)}),/filter_invalid/);
});
test('audit prefix labels exactly match canonical sanitized filters without silent cap loss',()=>{
 assert.deepEqual(exportDescriptor('admin-audit-log',{actionPrefixes:['horse.*',' settings. '],actionPrefix:'horse.'}).filters,{actionPrefixes:['horse.','settings.'],actionPrefix:'horse.'});
 assert.throws(()=>exportDescriptor('admin-audit-log',{actionPrefixes:Array.from({length:13},(_,i)=>`prefix${i}.`)}),/filter_invalid/);
 assert.throws(()=>exportDescriptor('admin-audit-log',{actionPrefixes:['%%%']}),/filter_invalid/);
 assert.throws(()=>exportDescriptor('admin-audit-log',{actionPrefix:'a'.repeat(61)}),/filter_invalid/);
});
test('all 26 descriptors match independently inventoried owner response contracts',async()=>{
 const expected={
  'stable-live-floor':['floor','floor','tables'], 'stable-tournaments':['floor','tournaments','tournaments'],
  'stable-cashouts':['floor','cashouts','queue'], 'stable-chip_requests':['floor','chip_requests','queue'],
  'stable-rake':['floor','rake','rake'], 'fleet-roster':['fleet','roster','rows'],
  'operator-approvals':['operator','approvals','approvals'], 'admin-audit-log':['audit','audit_log','rows'],
  'mint-register':['mint','ledger','rows'], 'economy-supply':['economy','supply','snapshot'],
  'economy-drift-incidents':['economy','drift','incidents'], 'economy-chip-composition':['economy','drift','reconciliation'],
  'economy-rakeback-periods':['economy','rakeback','periods'], 'rakeback-periods':['economy','rakeback','periods'],
  'economy-leaderboard-payouts':['economy','leaderboard','payouts'], 'leaderboard-payouts':['economy','leaderboard','payouts'],
  'economy-bbj-payouts':['economy','bbj','payouts'], 'bbj-payouts':['economy','bbj','payouts'],
  'economy-promotion-awards':['economy','promotions','rows'], 'promotion-awards':['economy','promotions','rows'],
  'rake-law-findings':['economy','rakelaw','findings'], 'economy-manifests':['economy','close','manifests'],
  'economy-manifest-restatements':['economy','close','restatements'], 'economy-digest-evidence':['economy','digest','rows'],
  'economy-invoices':['economy','invoices','rows'], 'economy-job-evidence':['economy','jobs','rows'],
 };
 assert.deepEqual(Object.keys(EXPORT_ARTIFACT_REGISTRY).sort(),Object.keys(expected).sort());
 for(const [surface,[owner,section,key]] of Object.entries(expected)) {
  const d=exportDescriptor(surface,{});
  assert.deepEqual([d.owner,d.section,d.key],[owner,section,key],surface);
  const row={id:`${surface}-row`};
  const result=key==='snapshot'?{state:'ready',snapshot:row}:{state:'ready',[key]:{rows:[row],total:1,offset:0,limit:200,hasMore:false}};
  const report=await captureExportSource({db:{},op:{},job:{surface,filters:{}},readOwners:{[owner]:async({query})=>{assert.equal(query.section,section);return result;}}});
  assert.deepEqual(report.rows,[row],surface);
 }
});
