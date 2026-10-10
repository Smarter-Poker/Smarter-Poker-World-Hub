import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync,execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { fixtureSql,foundation,migration,player,operator } from './qualification/playerControlFixture.mjs';
import { qualifyPlayerControl } from './qualification/playerControlAssertions.mjs';
process.on('uncaughtException',error=>{console.error('P3 qualification failed:',error.message, error.code || '', 'position', error.position || ''); process.exitCode=1;});
const provisional=process.argv.includes('--pglite');
if(provisional) {
 const modulePath=process.env.PLAYER_CONTROL_PGLITE_MODULE;
 assert.ok(modulePath && path.isAbsolute(modulePath),'Set PLAYER_CONTROL_PGLITE_MODULE to owned external-SSD PGlite module');
 const {PGlite}=await import(modulePath);
 const db=new PGlite();
 try {await db.exec(fixtureSql()); await db.exec(foundation); await db.exec(migration); console.log(JSON.stringify({backend:'PGlite provisional; native concurrent gate remains required',...await qualifyPlayerControl(async sql=>(await db.exec(sql)).at(-1))}));}
 finally {await db.close();}
} else {
 const candidates=[process.env.PLAYER_CONTROL_POSTGRES_BIN,'/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin'].filter(Boolean);
 const bin=candidates.find(x=>fs.existsSync(path.join(x,'initdb')));
 assert.ok(bin,'PostgreSQL17 binaries required');
 assert.match(execFileSync(path.join(bin,'postgres'),['--version'],{encoding:'utf8'}),/\b17\./);
 const base=process.env.TMPDIR;
 assert.ok(base && (process.platform!=='darwin'||base.startsWith('/Volumes/SmarterWork/agent-work/')),'Mac scratch must be external SSD');
 fs.mkdirSync(base,{recursive:true});const work=fs.mkdtempSync(path.join(base,'p3-'));
 const username=execFileSync('id',['-un'],{encoding:'utf8'}).trim();
 const port=55453;let started=false;const clients=[];
 try {
  execFileSync(path.join(bin,'initdb'),['-D',work+'/d','-A','trust','-U',username],{stdio:'pipe'});
  execFileSync(path.join(bin,'pg_ctl'),['-D',work+'/d','-l',work+'/postgres.log','-o',`-h 127.0.0.1 -k '' -p ${port}`,'-w','start'],{stdio:'pipe'});started=true;
  const connect=async()=>{const c=new Client({host:'127.0.0.1',port,user:username,database:'postgres',options:'-c statement_timeout=10000 -c lock_timeout=5000',query_timeout:15000});await c.connect();clients.push(c);return c;};
  const db=await connect();await db.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres SUPERUSER; END IF; END $$`);await db.query('SET ROLE postgres');
  await db.query(fixtureSql());
  const blocker=await connect();
  await assert.rejects(db.query(migration),error=>/requires installed player_control_cold_foundation/.test(error.message));
  await db.query('ROLLBACK');
  // The provider's CREATE POLICY hook cannot wait behind a writer while
  // holding hot targets: cold foundation alone rolls back within 3s.
  await blocker.query('BEGIN');await blocker.query('LOCK TABLE auth.users IN ROW SHARE MODE');
  const coldStarted=Date.now();
  await assert.rejects(db.query(foundation),error=>error.code==='55P03');
  assert.ok(Date.now()-coldStarted>=2800 && Date.now()-coldStarted<5000);
  await db.query('ROLLBACK');
  assert.equal((await db.query("SELECT to_regclass('public.ca_player_session_revocations') AS relation")).rows[0].relation,null);
  await blocker.query('LOCK TABLE public.chip_transactions IN ROW EXCLUSIVE MODE NOWAIT');
  await blocker.query('ROLLBACK');
  await db.query(foundation);
  const foundationRollback=foundation.slice(foundation.indexOf('BEGIN;',foundation.indexOf('EXECUTABLE ROLLBACK TEMPLATE')),foundation.lastIndexOf('COMMIT;')+7);
  await db.query(foundationRollback);
  assert.equal((await db.query("SELECT to_regclass('public.ca_player_session_revocations') AS relation")).rows[0].relation,null);
  await db.query(foundation);
  console.log('PASS executable empty-foundation rollback and forward reinstall');
  assert.equal(Number((await db.query('SELECT count(*) AS count FROM ca_player_control_operations')).rows[0].count),0);
  assert.equal(Number((await db.query('SELECT count(*) AS count FROM ca_player_session_revocations')).rows[0].count),0);
  console.log('PASS provider cold policy contention bounded3s/atomic rollback; foundation committed empty');
  await db.query('BEGIN');await db.query('ALTER TABLE ca_player_control_operations ADD COLUMN drift text');
  await assert.rejects(db.query(migration),error=>/foundation catalog\/permissions drift/.test(error.message));
  await db.query('ROLLBACK');
  await db.query('BEGIN');await db.query(`INSERT INTO ca_player_session_revocations VALUES('${player}',now(),'unexpected-pre-use',now())`);
  await assert.rejects(db.query(migration),error=>/foundation is not unused/.test(error.message));
  await db.query('ROLLBACK');
  for(const [table,privilege] of [['ca_player_control_operations','SELECT'],['ca_player_control_operations','INSERT'],['ca_player_session_revocations','SELECT'],['ca_player_session_revocations','INSERT'],['ca_player_session_revocations','UPDATE']]) {
   await db.query('BEGIN');await db.query(`REVOKE ${privilege} ON ${table} FROM service_role`);
   await assert.rejects(db.query(migration),error=>/foundation catalog\/permissions drift/.test(error.message));
   await db.query('ROLLBACK');
  }
  console.log('PASS every required service privilege independently mandatory');
  console.log('PASS missing/drifted/used foundation refuses main before enforcement');

  await blocker.query('BEGIN');await blocker.query('LOCK TABLE public.tournament_players IN ROW EXCLUSIVE MODE');
  const hotStarted=Date.now();
  await assert.rejects(db.query(migration),error=>error.code==='55P03');
  assert.ok(Date.now()-hotStarted>=2800 && Date.now()-hotStarted<5000,'first admission target waits bounded3s before any other hot lock');
  await db.query('ROLLBACK');
  assert.equal(Number((await db.query('SELECT count(*) AS count FROM ca_player_control_operations')).rows[0].count),0);
  assert.equal((await db.query("SELECT md5(pg_get_functiondef('smarter_private.fn_smarter_data_api_pre_request()'::regprocedure)) AS hash")).rows[0].hash,'6027b488b1c77d03642b3d384f275d6a');
  await blocker.query('LOCK TABLE auth.users IN ROW SHARE MODE NOWAIT');
  await blocker.query('ROLLBACK');
  // Keeping an unrelated auth reader alive during final enforcement proves
  // the committed provider foundation did not retain its incidental auth locks.
  await blocker.query('BEGIN');await blocker.query('LOCK TABLE auth.users IN ROW SHARE MODE');
  await db.query(migration);await blocker.query('ROLLBACK');
  await assert.rejects(db.query(foundationRollback),error=>/foundation rollback refused/.test(error.message));
  await db.query('ROLLBACK');
  console.log('PASS foundation rollback refuses installed enforcement');
  console.log('PASS main bounded admission refusal preserves empty foundation/hook; install with auth reader succeeds');
  console.log(JSON.stringify({backend:'native PostgreSQL17',...await qualifyPlayerControl(async sql=>{const result=await db.query(sql); return Array.isArray(result)?result.at(-1):result;})}));
  // Separate real sessions: an admission must wait for the original restriction decision,
  // then see committed restriction state rather than its stale statement snapshot.
  const maker=await connect(),entrant=await connect();
  await maker.query('BEGIN');
  await maker.query(`SELECT pg_advisory_xact_lock(hashtextextended('${player}',731))`);
  await maker.query(`INSERT INTO ca_player_restrictions(user_id,scope,reason_code,applied_by) VALUES('${player}','cash','other','${operator}')`);
  let settled=false;const admission=entrant.query(`INSERT INTO table_seats(user_id,table_id) VALUES('${player}','22222222-2222-4222-8222-222222222222')`).then(()=>{settled=true;throw new Error('Concurrent admission bypassed restriction');},error=>{settled=true;assert.match(error.message,/PLAYER_RESTRICTED/);});
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false,'admission did not await decision lock');
  await maker.query('COMMIT');await admission;
  console.log('PASS native multi-session restriction commit/admission ordering');
  // Duplicate logout calls from separate sessions must produce one durable action.
  const before=Number((await db.query("SELECT count(*) AS count FROM fixture_audit WHERE action='player.force_logout'")).rows[0].count);
  const logoutSql=`SELECT fn_ca_player_force_logout('${player}','${operator}','concurrent-logout','concurrent proof') AS result`;
  const [first,second]=await Promise.all([maker.query(logoutSql),entrant.query(logoutSql)]);
  assert.equal(first.rows[0].result.opId,second.rows[0].result.opId);
  assert.equal(Number((await db.query("SELECT count(*) AS count FROM fixture_audit WHERE action='player.force_logout'")).rows[0].count),before+1);
  console.log('PASS native duplicate-session logout exactly once');
 } finally {
  for(const client of clients)await client.end();
  if(started){const result=spawnSync(path.join(bin,'pg_ctl'),['-D',work+'/d','-m','fast','-w','stop'],{encoding:'utf8'});assert.equal(result.status,0,'preserving cluster after failed shutdown');}
  if(started || !fs.existsSync(path.join(work,'d/postmaster.pid')))fs.rmSync(work,{recursive:true,force:true});
 }
}
