import assert from 'node:assert/strict';
import test from 'node:test';
import { handle } from '../pages/api/horses/export-artifacts.js';
import { artifactHash } from '../src/lib/horses/exportArtifactWorker.js';

const requester='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const operation='44444444-4444-4444-8444-444444444444';
const lease='55555555-5555-4555-8555-555555555555';
function fixture({owner=requester,state='ready',expired=false,mismatch=false,cancelOnRead=false,permissions=['console.read','money.read'],unknownAuthority=false}={}) {
 const bytes=Buffer.from('Private report\n');
 const job={id,op_id:operation,requester_id:owner,surface:'mint-register',filters:{},permission:'money.read',state,
  snapshot:{rows:[{private:'capture'}]},object_path:`${owner}/${operation}.csv`,lease_id:lease,payload_sha256:'a'.repeat(64),
  content_sha256:artifactHash(bytes),byte_size:bytes.length,expires_at:new Date(Date.now()+(expired?-60000:60000)).toISOString()};
 const calls={reads:[],storage:[],rpc:[],workers:[],deferred:[]};
 const response={headers:{},statusCode:null,jsonBody:null,ended:null,setHeader(key,value){this.headers[key]=value;},status(value){this.statusCode=value;return this;},json(value){this.jsonBody=value;return this;},end(value){this.ended=value;return this;}};
 const db={
  from(table){
   const filters={};
   const chain={select(){return chain;},eq(key,value){filters[key]=value;return chain;},async maybeSingle(){
    calls.reads.push({table,filters:{...filters}});
    if(unknownAuthority && table==='ca_operator_policy')return {data:null,error:{message:'outage'}};
    if(table==='profiles')return {data:{id:requester,role:'member'},error:null};
    if(table==='ca_operator_policy')return {data:{enforce_named_roles:true},error:null};
    if(table==='ca_operator_export_artifacts')return {data:filters.id===job.id && filters.requester_id===job.requester_id?{...job}:null,error:null};
    throw new Error(`unexpected table ${table}`);
   }};return chain;
  },
  async rpc(name,args){
   calls.rpc.push({name,args});
   if(name==='fn_ca_operator_permissions')return {data:{permissions},error:null};
   if(name==='fn_ca_operator_export_request')return {data:{...job,state:'queued'},error:null};
   if(name==='fn_ca_operator_export_transition') {
    if(args.p_action==='served' && job.state==='cancelled')return {data:null,error:{message:'export_not_downloadable'}};
    return {data:{owned:true},error:null};
   }
   throw new Error(`unexpected rpc ${name}`);
  },
  storage:{from(bucket){return {async download(path){
   calls.storage.push({bucket,path});
   if(cancelOnRead)job.state='cancelled';
   return {data:new Blob([mismatch?Buffer.from('wrong report'):bytes]),error:null};
  }};}},
 };
 const context={db,op:{user:{id:requester},permissions:['console.read','money.read']},method:'GET',query:{id,download:'1'},body:{},req:{headers:{}},res:response,requestId:'request-proof'};
 const dependencies={defer(promise){calls.deferred.push(promise);},worker(...args){calls.workers.push(args);return Promise.resolve({claimed:true});}};
 return {job,calls,response,context,dependencies};
}
const rejects=async(f,status,code)=>{
 await assert.rejects(()=>handle(f.context,f.dependencies),error=>error.status===status && error.code===code);
 assert.equal(f.response.ended,null,'a refused handler must not serve private bytes');
};

test('requester-scoped status rejects IDOR before any private object read',async()=>{
 const f=fixture({owner:other});
 await rejects(f,404,'export_job_not_found');
 assert.equal(f.calls.storage.length,0);
 assert.deepEqual(f.calls.reads[0].filters,{id,requester_id:requester});
});
test('an expired ready job refuses before storage access',async()=>{
 const f=fixture({expired:true});await rejects(f,409,'export_not_downloadable');assert.equal(f.calls.storage.length,0);
});
test('truncated reports require acknowledgement before private retrieval',async()=>{
 const f=fixture({state:'truncated'});await rejects(f,409,'export_truncation_ack_required');assert.equal(f.calls.storage.length,0);
});
test('private bytes must match the recorded size and digest',async()=>{
 const f=fixture({mismatch:true});await rejects(f,503,'export_hash_mismatch');
 assert.equal(f.calls.rpc.some(call=>call.args?.p_action==='served'),false);
});
test('cancellation after object read fences serving and emits no bytes',async()=>{
 const f=fixture({cancelOnRead:true});await rejects(f,409,'export_not_downloadable');
 assert.equal(f.calls.storage.length,1);
 assert.equal(f.calls.rpc.filter(call=>call.args?.p_action==='served').length,1);
});
test('fresh authority cannot be bypassed by cached request permissions',async()=>{
 const f=fixture({permissions:['console.read']});await rejects(f,403,'export_permission_revoked');assert.equal(f.calls.storage.length,0);
 const unknown=fixture({unknownAuthority:true});await rejects(unknown,503,'export_authority_unknown');assert.equal(unknown.calls.storage.length,0);
});
test('request returns 202 sanitized receipt and defers only the original job identity',async()=>{
 const f=fixture();f.context.method='POST';f.context.query={};f.context.body={action:'request',surface:'mint-register',filters:{},opId:operation};
 await handle(f.context,f.dependencies);
 assert.equal(f.response.statusCode,202);assert.equal(f.response.jsonBody.accepted,true);
 assert.equal(f.response.jsonBody.job.id,id);assert.equal(f.response.jsonBody.job.op_id,operation);
 for(const field of ['snapshot','object_path','lease_id','payload_sha256'])assert.equal(Object.hasOwn(f.response.jsonBody.job,field),false,field);
 assert.equal(f.calls.deferred.length,1);assert.equal(f.calls.workers.length,1);
 assert.equal(f.calls.workers[0][0],f.context.db);assert.deepEqual(f.calls.workers[0].slice(1),[id,requester]);
 const request=f.calls.rpc.find(call=>call.name==='fn_ca_operator_export_request');
 assert.equal(request.args.p_op_id,operation);assert.equal(request.args.p_actor,requester);
 assert.match(request.args.p_payload_sha256,/^[0-9a-f]{64}$/);
 await f.calls.deferred[0];
});
test('a confirmed complete download serves only its verified original object',async()=>{
 const f=fixture();await handle(f.context,f.dependencies);
 assert.equal(f.response.statusCode,200);assert.equal(artifactHash(f.response.ended),f.job.content_sha256);
 assert.equal(f.response.headers['Cache-Control'],'private, no-store');
 assert.equal(f.response.headers['X-Content-SHA256'],f.job.content_sha256);
 assert.deepEqual(f.calls.storage,[{bucket:'operator-export-artifacts',path:f.job.object_path}]);
});
