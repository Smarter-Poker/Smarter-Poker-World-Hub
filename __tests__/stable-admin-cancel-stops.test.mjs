import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emergencyStopsHandler, stopInput } from '../src/lib/horses/emergencyStops.js';
import { tournamentOperationsHandler, cancellationEligible } from '../src/lib/horses/tournamentOperations.js';
import { requiresApproval, KIND_PERMISSION, isExecutableKind } from '../src/lib/horses/approvals.js';
import { KIND_PERMISSIONS } from '../src/components/horses/approvalModel.js';
const ID='11111111-1111-4111-8111-111111111111', OP='22222222-2222-4222-8222-222222222222';
const permissions=['console.read','clubs.read','clubs.write','money.read','money.write','cashier.write','settings.write'];
const intent={action:'cancel_refund',tournamentId:ID,opId:OP,reason:'Recorded operator review'};
function db(result) {
 const calls=[];
 return {calls,async rpc(name,args){calls.push({name,args});return result;},from(table){calls.push({table});const q=new Proxy({}, {get(_,prop){if(prop==='then')return(resolve)=>resolve(result);return(...args)=>{calls.push({prop,args});return q;};}});return q;}};
}
function ctx(database, extra={}) {return {db:database,op:{user:{id:ID},permissions},body:intent,method:'POST',query:{},requestId:'test-request',...extra};}
test('stop inputs reject generic paths, missing reasons, stale-free version omission and nonboolean switches',()=>{
 const value={path:'cashout',opId:OP,reason:'Recorded emergency reason',expectedVersion:0,stopped:true};
 assert.equal(stopInput(value).expectedVersion,0);
 for(const patch of [{path:'all'},{reason:'bad'},{expectedVersion:undefined},{stopped:'true'},{opId:'bad'}])assert.throws(()=>stopInput({...value,...patch}),e=>e.status===400);
});
test('stop writes recheck the exact source permission before reaching the owner',async()=>{
 const database=db({});await assert.rejects(()=>emergencyStopsHandler(ctx(database,{op:{user:{id:ID},permissions:['console.read','settings.write']},body:{path:'cashout',opId:OP,reason:'Emergency stop review',stopped:true,expectedVersion:0}})),e=>e.status===403);assert.equal(database.calls.length,0);
});
test('stop CAS conflicts are distinct from unknown outcomes and only caller UUID is dispatched',async()=>{
 const body={path:'cashout',opId:OP,reason:'Emergency stop review',stopped:true,expectedVersion:4,actorId:OP};
 const database=db({error:{code:'40001'}});await assert.rejects(()=>emergencyStopsHandler(ctx(database,{body})),e=>e.code==='stop_version_changed');assert.equal(database.calls[0].args.p_actor_id,ID);assert.equal(database.calls[0].args.p_expected_version,4);
 const unknown=db({error:{code:'57014'}});await assert.rejects(()=>emergencyStopsHandler(ctx(unknown,{body})),e=>e.code==='stop_outcome_unknown');
});
test('stop success requires a matching receipt rather than successful dispatch',async()=>{
 const body={path:'cashout',opId:OP,reason:'Emergency stop review',stopped:true,expectedVersion:0};
 await assert.rejects(()=>emergencyStopsHandler(ctx(db({data:{ok:true,op_id:OP,path:'positive_issuance',stopped:true}}),{body})),e=>e.code==='stop_outcome_unknown');
 const r=await emergencyStopsHandler(ctx(db({data:{ok:true,op_id:OP,path:'cashout',stopped:true,version:1}}),{body}));assert.equal(r.operation.version,1);assert.equal(r.actorId,ID);
});
test('missing stop state remains unknown, never an invented open state',async()=>{
 await assert.rejects(()=>emergencyStopsHandler(ctx(db({data:[]}),{method:'GET'})),e=>e.code==='stop_state_unknown');
});
test('cancellation never presents running, terminal or already-started events as eligible',()=>{
 for(const status of ['RUNNING','BREAK','COMPLETED','CANCELLED','late_reg','in_progress'])assert.equal(cancellationEligible({id:ID,status}),false);
 assert.equal(cancellationEligible({id:ID,status:'registering'}),true);assert.equal(cancellationEligible({id:ID,status:'registering',started_at:'2026-10-09'}),false);
});
test('cancel requires both club and money write; permission refusal reaches no refund writer',async()=>{
 const database=db({});await assert.rejects(()=>tournamentOperationsHandler(ctx(database,{op:{user:{id:ID},permissions:['clubs.read','money.read','clubs.write']}})),e=>e.status===403);assert.equal(database.calls.length,0);
});
test('pending approval is 202 and is never presented as cancellation/refund completion',async()=>{
 const res={statusCode:null,status(v){this.statusCode=v;return this;},json(v){this.body=v;return v;}};
 const database=db({data:{ok:true,pending:true,op_id:OP,tournament_id:ID,approval_id:OP,state:'pending'}});
 await tournamentOperationsHandler(ctx(database,{res}));assert.equal(res.statusCode,202);assert.equal(res.body.pending,true);assert.equal(res.body.actorId,ID);assert.equal(database.calls[0].name,'fn_ca_operator_cancel_tournament');assert.equal(database.calls[0].args.p_actor_id,ID);
});
test('cancel requires exact fully settled receipt and preserves unknown acknowledgment',async()=>{
 await assert.rejects(()=>tournamentOperationsHandler(ctx(db({data:{ok:true,op_id:OP,tournament_id:ID,state:'completed',receipt:{fully_settled:false,tournament_id:ID}}}))),e=>e.code==='cancel_outcome_unknown');
 await assert.rejects(()=>tournamentOperationsHandler(ctx(db({error:{code:'57014'}}))),e=>e.code==='cancel_outcome_unknown');
 const receipt={fully_settled:true,tournament_id:ID,total_refunded:'7.00'};
 const r=await tournamentOperationsHandler(ctx(db({data:{ok:true,op_id:OP,tournament_id:ID,state:'completed',receipt}})));assert.equal(r.operation.receipt.total_refunded,'7.00');assert.equal(r.actorId,ID);
});
test('cancel distinguishes authoritative eligibility, changed review and rejected approval',async()=>{
 for(const [code,want]of[['55000','cancel_ineligible'],['40001','cancel_review_changed'],['22023','cancel_operation_conflict']])await assert.rejects(()=>tournamentOperationsHandler(ctx(db({error:{code}}))),e=>e.code===want);
 await assert.rejects(()=>tournamentOperationsHandler(ctx(db({data:{refused:true,reason:'approval_expired'}}))),e=>e.code==='cancel_approval_refused');
});
test('receipt lookup is account-scoped and performs no mutation',async()=>{
 const database=db({data:null});const r=await tournamentOperationsHandler(ctx(database,{method:'GET',query:{opId:OP}}));assert.equal(r.operation,null);assert.equal(r.actorId,ID);assert.ok(database.calls.some(c=>c.prop==='eq'&&c.args[0]==='actor_id'&&c.args[1]===ID));assert.equal(database.calls.some(c=>c.name),false);
});
test('cancellation approvals use the established refund threshold and finance decision permission',()=>{
 assert.equal(requiresApproval({approvalsEnabled:true,cashoutThreshold:100},'tournament_cancel',100).required,true);assert.equal(KIND_PERMISSION.tournament_cancel,'money.write');assert.equal(KIND_PERMISSIONS.tournament_cancel,'money.write');assert.equal(isExecutableKind('tournament_cancel'),false);
});
test('durable intent is saved before dispatch and pending UI directs the operator back after approval',()=>{
 for(const file of ['TournamentCancellationControls.jsx','EmergencyStopControls.jsx']){const s=readFileSync(new URL(`../src/components/horses/${file}`,import.meta.url),'utf8');assert.ok(s.indexOf('localStorage.setItem')<s.indexOf("method: 'POST'"));assert.match(s,/epoch\.current/);assert.match(s,/Read.*Receipt|Read Outcome/);}
 const s=readFileSync(new URL('../src/components/horses/ApprovalsPanel.jsx',import.meta.url),'utf8');assert.match(s,/Return To Tournament Oversight And Retry The Retained Cancellation Operation/);
});
