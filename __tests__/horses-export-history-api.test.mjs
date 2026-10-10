import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../pages/api/horses/export-artifacts.js';
const actor = '11111111-1111-4111-8111-111111111111';
const job = (i, permission = 'clubs.read') => ({ id: `22222222-2222-4222-8222-${String(i).padStart(12,'0')}`, requester_id: actor, permission, created_at: new Date(1700000000000+i*1000).toISOString(), state: 'ready' });
function fixture(records, query = {}, { permissions = ['console.read','clubs.read'], unknownCount = false } = {}) {
  const calls = [];
  const db = { from(table) {
    assert.equal(table,'ca_operator_export_artifacts'); let selected=records.slice(), bounds=null; const orders=[];
    const chain = {
      select(columns, options) { calls.push(['select',columns,options]); return chain; },
      eq(key,value) { calls.push(['eq',key,value]); selected=selected.filter(r=>r[key]===value); return chain; },
      in(key,values) { calls.push(['in',key,values]); selected=selected.filter(r=>values.includes(r[key])); return chain; },
      order(key,options) { orders.push([key,options]); calls.push(['order',key,options]); return chain; },
      limit(n) { bounds=[0,n-1]; return chain; },
      range(start,end) { bounds=[start,end]; calls.push(['range',start,end]); return chain; },
      then(resolve,reject) {
        selected.sort((a,b)=> { for(const [key,o] of orders) { const cmp=String(a[key]).localeCompare(String(b[key])); if(cmp)return o.ascending?cmp:-cmp; } return 0; });
        return Promise.resolve({ data:bounds?selected.slice(bounds[0],bounds[1]+1):selected, count:unknownCount?null:selected.length, error:null }).then(resolve,reject);
      },
    }; return chain;
  } };
  const context={db,op:{user:{id:actor},permissions},method:'GET',query,body:{},req:{},res:{setHeader(){}},requestId:'history-proof'};
  return { calls, read:()=>handle(context) };
}
test('older accepted jobs remain pageable beyond the original 100-job cap', async()=>{
  const f=fixture(Array.from({length:125},(_,i)=>job(i)),{limit:'25',offset:'100'});
  const result=await f.read();
  assert.equal(result.total,125);assert.equal(result.limit,25);assert.equal(result.offset,100);assert.equal(result.hasMore,false);
  assert.equal(result.jobs.length,25);assert.deepEqual(result.rows,result.jobs);assert.equal(result.jobs[0].id,job(24).id);
  assert.deepEqual(f.calls.filter(c=>c[0]==='order').map(c=>c[1]),['created_at','id']);
});
test('permission narrowing filters before the page so newer forbidden jobs cannot conceal an older accessible report', async()=>{
  const accessible=job(0), records=[accessible,...Array.from({length:100},(_,i)=>job(i+1,'money.read'))];
  records.push({...job(999),requester_id:'another-actor'});
  const f=fixture(records), result=await f.read();
  assert.equal(result.total,1);assert.deepEqual(result.jobs,[accessible]);
  assert.ok(f.calls.find(c=>c[0]==='in'&&c[1]==='permission'));
  assert.ok(f.calls.findIndex(c=>c[0]==='in')<f.calls.findIndex(c=>c[0]==='range'));
});
test('equal creation times have a deterministic identity tie-break',async()=>{
  const rows=[job(1),job(3),job(2)].map(r=>({...r,created_at:job(0).created_at}));
  const result=await fixture(rows,{limit:'1',offset:'1'}).read();
  assert.equal(result.jobs[0].id,job(2).id);assert.equal(result.hasMore,true);
});
test('unreadable exact count is unknown rather than a fabricated complete list',async()=>{
  await assert.rejects(fixture([job(1)],{}, {unknownCount:true}).read(),e=>e.status===503&&e.code==='export_jobs_unavailable');
});
for(const query of [{limit:'0'},{limit:'101'},{offset:'-1'},{offset:'1e3'}])test(`invalid history bounds refuse ${JSON.stringify(query)}`,async()=>{
  const f=fixture([job(1)],query);await assert.rejects(f.read(),e=>e.status===400&&e.code==='export_page_invalid');assert.equal(f.calls.length,0);
});
test('no granted registry permission returns an explicit empty history without a service-role query',async()=>{
 const f=fixture([job(1)],{}, {permissions:[]});assert.deepEqual(await f.read(),{jobs:[],rows:[],total:0,limit:25,offset:0,hasMore:false,truncated:false});assert.equal(f.calls.length,0);
});
