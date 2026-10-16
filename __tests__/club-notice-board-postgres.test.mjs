import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { validateNoticeRequest } from '../src/lib/clubNoticeBoard.mjs';
const {Client}=createRequire(import.meta.url)('pg');

test('native board authorization, cursors, duplicate writes, CAS, audit and realtime contract', {timeout:60000}, async () => {
 const bin=[process.env.PHASE6_POSTGRES_BIN,'/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin'].filter(Boolean).find(path=>existsSync(join(path,'initdb')));
 assert.ok(bin,'PostgreSQL 17 required; no skipped qualification');
 const root=join(process.cwd(),'work');mkdirSync(root,{recursive:true});
 const directory=mkdtempSync(join(root,'notice-board-postgresql-long-checkout-fixture-'));
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
 const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const run=(cmd,args)=>execFileSync(join(bin,cmd),args,{stdio:'pipe',env:{...process.env,TMPDIR:directory}});
 let started=false;let db;
 try {
  run('initdb',['-D',join(directory,'data'),'-A','trust','-U','postgres','--no-locale','--encoding=UTF8']);
  // Only loopback TCP is used. Unix sockets exceed the platform path limit
  // in long GitHub checkout paths, even though the data directory is valid.
  run('pg_ctl',['-D',join(directory,'data'),'-l',join(directory,'server.log'),'-o',`-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c wal_level=logical`,'start']);started=true;
  db=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await db.connect();
  await db.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
   CREATE SCHEMA extensions; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE public.clubs(id uuid PRIMARY KEY);
   CREATE TABLE public.club_members(club_id uuid,user_id uuid,role text,is_active boolean,status text,membership_lifecycle_status text,PRIMARY KEY(club_id,user_id));
   CREATE PUBLICATION supabase_realtime;`);
  const migration=readFileSync('supabase/migrations/20261015223026_club_messenger_notice_board.sql','utf8');
  await db.query(migration);
  await assert.rejects(()=>db.query(migration),/already exists/);await db.query('ROLLBACK');
  const club=randomUUID(),otherClub=randomUUID(),admin=randomUUID(),owner=randomUUID(),player=randomUUID(),guest=randomUUID(),coOwner=randomUUID();
  await db.query('INSERT INTO clubs VALUES($1),($2)',[club,otherClub]);
  for(const [user,role] of [[admin,'admin'],[owner,'owner'],[player,'player'],[guest,'guest'],[coOwner,'co_owner']]) {
   await db.query("INSERT INTO club_members VALUES($1,$2,$3,true,'active','active')",[club,user,role]);
  }
  const rpc=async(actor,scope,action,payload={})=>(await db.query('SELECT fn_club_notice_board($1,$2,$3,$4) AS result',[actor,scope,action,payload])).rows[0].result;
  for(const user of [player,guest,coOwner]) await assert.rejects(()=>rpc(user,club,'create',{id:randomUUID(),content:'Forbidden',status:'notice'}),{code:'42501'});
  await assert.rejects(()=>rpc(admin,otherClub,'read'),{code:'42501'});
  const entry={id:randomUUID(),content:'Payout Request',status:'pending_payout',is_pinned:true};
  const created=await rpc(admin,club,'create',entry);
  assert.equal(created.version,1);assert.deepEqual(await rpc(admin,club,'create',entry),created);
  assert.equal((await db.query('SELECT count(*)::int n FROM club_notice_board_audit')).rows[0].n,1);
  await assert.rejects(()=>rpc(player,club,'update',{id:entry.id,version:1,status:'paid'}),{code:'42501'});
  await assert.rejects(()=>rpc(player,club,'delete',{id:entry.id,version:1}),{code:'42501'});
  const paid=await rpc(owner,club,'update',{id:entry.id,version:1,status:'paid'});
  assert.equal(paid.is_pinned,false);assert.deepEqual((await rpc(player,club,'read')).pinned,[]);
  await assert.rejects(()=>rpc(admin,club,'update',{id:entry.id,version:1,content:'Overwrite'}),{code:'40001'});
  const deleted=await rpc(admin,club,'delete',{id:entry.id,version:2});assert.equal(deleted.is_deleted,true);
  assert.equal((await rpc(player,club,'read')).rows.length,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM club_notice_board_audit')).rows[0].n,3);
  await db.query('BEGIN');
  try {
   for (const status of ['notice','pending_payout','paid']) {
    const input={id:randomUUID(),content:'  Canonical Notice  ',status,is_pinned:true};
    const payload=validateNoticeRequest('PUT',{clubId:club,payload:input}).payload;
    const first=await rpc(admin,club,'create',payload);
    assert.equal(first.content,'Canonical Notice');
    assert.equal(first.is_pinned,status==='pending_payout');
    assert.deepEqual(await rpc(admin,club,'create',validateNoticeRequest('PUT',{clubId:club,payload:input}).payload),first);
    if(status==='paid') {
     const reopened=await rpc(admin,club,'update',{id:input.id,version:1,status:'pending_payout',is_pinned:true});
     assert.equal(reopened.status,'pending_payout');assert.equal(reopened.is_pinned,true);
    }
   }
  } finally { await db.query('ROLLBACK'); }
  // Same timestamp across a page boundary must neither duplicate nor skip IDs.
  for(let n=0;n<110;n++) await rpc(admin,club,'create',{id:randomUUID(),content:`Entry ${n}`,status:'notice'});
  await db.query("UPDATE club_notice_board SET created_at='2026-10-15T12:00:00.123456Z' WHERE NOT is_deleted");
  let payload={},seen=new Set();
  for(;;){
   const raw=await rpc(player,club,'read',payload);const rows=raw.rows.length===51?raw.rows.slice(1):raw.rows;
   for(const row of rows){assert.ok(!seen.has(row.id));seen.add(row.id);}
   if(raw.rows.length<51) break;
   payload={before:rows[0].created_at,beforeId:rows[0].id};
  }
  assert.equal(seen.size,110);
  for(let n=0;n<20;n++)await rpc(admin,club,'create',{id:randomUUID(),content:'Pinned',status:'pending_payout',is_pinned:true});
  await assert.rejects(()=>rpc(admin,club,'create',{id:randomUUID(),content:'Overflow',status:'pending_payout',is_pinned:true}),/Maximum 20/);
  assert.equal((await rpc(player,club,'read')).pinned.length,20);
  // RLS and RPC ACL: authenticated can read own club, cannot forge service actor.
  await db.query('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[player]);
  assert.equal((await db.query('SELECT count(*)::int n FROM club_notice_board')).rows[0].n,131);
  await assert.rejects(()=>db.query("UPDATE club_notice_board SET content='Spoof'"),{code:'42501'});
  await assert.rejects(()=>rpc(admin,club,'read'),{code:'42501'});
  await db.query('RESET ROLE');
  await db.query("UPDATE club_members SET is_active=false WHERE user_id=$1",[player]);
  await db.query('SET ROLE authenticated');
  assert.equal((await db.query('SELECT count(*)::int n FROM club_notice_board')).rows[0].n,0);await db.query('RESET ROLE');
  await assert.rejects(()=>rpc(player,club,'read'),{code:'42501'});
  const publication=await db.query("SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='club_notice_board'");assert.equal(publication.rowCount,1);
 } finally {
  if(db)await db.end();if(started)run('pg_ctl',['-D',join(directory,'data'),'-m','immediate','stop']);rmSync(directory,{recursive:true,force:true});
 }
});
