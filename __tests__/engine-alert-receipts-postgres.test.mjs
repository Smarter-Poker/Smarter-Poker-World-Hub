import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
const { Client }=createRequire(import.meta.url)('pg');
const migration=readFileSync(new URL('../supabase/migrations/20260913170312_engine_alert_delivery_receipts.sql',import.meta.url),'utf8');
const pgBin=[process.env.PHASE6_POSTGRES_BIN,process.env.PG17_BINDIR,'/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin'].filter(Boolean).find(p=>existsSync(join(p,'postgres')));
const event=(id=randomUUID())=>({status:'firing',fingerprint:'Fault:table',labels:{alertname:'Fault',severity:'critical',component:'table',engine_alert_event_id:id},annotations:{summary:'failed'},startsAt:'2026-09-13T00:00:00Z'});
test('PostgreSQL17 receipts enforce replay, collision, rollback, concurrency and service-only authority',async()=>{
 assert.ok(pgBin,'PostgreSQL17 is required; receipt invariants must not silently skip');
 assert.match(execFileSync(join(pgBin,'postgres'),['--version'],{encoding:'utf8'}),/\b17\./);
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const {port}=server.address();await new Promise(r=>server.close(r));
 const root=mkdtempSync(join(tmpdir(),'engine-receipts-pg17-'));const data=join(root,'data');const socket=join(root,'socket');mkdirSync(socket);
 const clients=[];let started=false;
 try{
  execFileSync(join(pgBin,'initdb'),['-D',data,'-U','postgres','--locale=en_US.UTF-8','--encoding=UTF8'],{stdio:'ignore'});
  execFileSync(join(pgBin,'pg_ctl'),['-D',data,'-o',`-F -p ${port} -k ${socket} -c listen_addresses=''`,'-w','start'],{stdio:'ignore'});started=true;
  const connect=async()=>{const c=new Client({host:socket,port,user:'postgres',database:'postgres'});await c.connect();clients.push(c);return c;};const db=await connect();
  await db.query(`create role anon;create role authenticated;create role service_role bypassrls;
   create table public.engine_alerts(id bigserial primary key,fingerprint text not null,alertname text not null,severity text not null default 'unknown',component text,status text not null default 'firing',summary text,description text,labels jsonb not null default '{}',starts_at timestamptz,ends_at timestamptz,received_at timestamptz not null default now(),notified_via text[] not null default '{}');
   alter table public.engine_alerts enable row level security;grant usage on schema public to service_role;`);
  await db.query(migration);
  const rpc=async(c,alerts)=>(await c.query('select public.fn_record_engine_alerts($1::jsonb) as receipts',[JSON.stringify(alerts)])).rows[0].receipts;
  const count=async()=>(await db.query('select count(*)::int as n from public.engine_alerts')).rows[0].n;
  const a=event();const original=await rpc(db,[a]);assert.equal(original[0].event_id,a.labels.engine_alert_event_id);assert.ok(original[0].id>0);
  assert.deepEqual(await rpc(db,[{...a,labels:Object.fromEntries(Object.entries(a.labels).reverse())}]),original);assert.equal(await count(),1);
  await assert.rejects(rpc(db,[{...a,annotations:{summary:'changed'}}]),e=>e.code==='23505');assert.equal(await count(),1);
  await assert.rejects(rpc(db,[event(),{...a,annotations:{summary:'changed'}}]),e=>e.code==='23505');assert.equal(await count(),1,'collision rolls back earlier new member');
  await assert.rejects(rpc(db,[event(),{...event(),startsAt:'not-a-time'}]),e=>e.code==='22007');assert.equal(await count(),1,'late cast failure rolls back both tables');
  for(const malformed of [null,{},[null],[{status:'firing',labels:{}}],[{...event(),labels:{alertname:'Fault',engine_alert_event_id:null}}]])await assert.rejects(rpc(db,malformed),e=>e.code==='22023');
  assert.equal(await count(),1);
  const rollback=event();await db.query('begin');await rpc(db,[rollback]);await db.query('rollback');assert.equal(await count(),1);
  assert.equal((await db.query('select count(*)::int as n from public.engine_alert_delivery_receipts')).rows[0].n,1);
  const concurrent=event();const peers=await Promise.all(Array.from({length:8},connect));const deliveries=await Promise.all(peers.map(c=>rpc(c,[concurrent])));
  assert.ok(deliveries.every(r=>r[0].id===deliveries[0][0].id));assert.equal(await count(),2,'concurrent retry inserts one engine row');
  const b=event(),c=event();await Promise.all([rpc(peers[0],[b,c]),rpc(peers[1],[c,b])]);assert.equal(await count(),4,'reversed batches cannot deadlock or duplicate');
  const legacy=event();delete legacy.labels.engine_alert_event_id;const l1=await rpc(db,[legacy]),l2=await rpc(db,[legacy]);assert.equal(l1[0].event_id,null);assert.notEqual(l1[0].id,l2[0].id);assert.equal(await count(),6);
  const racing=event();const conflicting=await Promise.allSettled([rpc(peers[0],[racing]),rpc(peers[1],[{...racing,annotations:{summary:'different payload'}}])]);
  assert.equal(conflicting.filter(r=>r.status==='fulfilled').length,1);assert.equal(conflicting.filter(r=>r.status==='rejected'&&r.reason.code==='23505').length,1);assert.equal(await count(),7,'simultaneous conflicting payloads acknowledge exactly one winner');
  for(const role of ['anon','authenticated']){
   await db.query(`set role ${role}`);await assert.rejects(rpc(db,[event()]),e=>e.code==='42501');await assert.rejects(db.query('select * from public.engine_alert_delivery_receipts'),e=>e.code==='42501');await db.query('reset role');
  }
  await db.query('set role service_role');assert.deepEqual(await rpc(db,[a]),original);
  await assert.rejects(db.query('delete from public.engine_alert_delivery_receipts'),e=>e.code==='42501');await assert.rejects(db.query("update public.engine_alert_delivery_receipts set payload='{}'"),e=>e.code==='42501');await db.query('reset role');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.engine_alert_delivery_receipts'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await db.query('select count(*)::int as n from public.engine_alert_delivery_receipts')).rows[0].n,5);
 }finally{
  await Promise.allSettled(clients.map(c=>c.end()));if(started)execFileSync(join(pgBin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{stdio:'ignore'});rmSync(root,{recursive:true,force:true});
 }
});
