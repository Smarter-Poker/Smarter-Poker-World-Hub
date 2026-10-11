import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { planMigrationTransactions } from '../scripts/lib/sql-transaction-control.js';

const root = path.resolve(import.meta.dirname, '..');
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/pnm-contributions-installed-schema.json'),'utf8'));
const migrationPath = path.join(root,'supabase/migrations/20261011060000_pnm_venue_contributions.sql');
const migration = readFileSync(migrationPath,'utf8');
const conflictMigrationPath = path.join(root,'supabase/migrations/20261011063000_pnm_contribution_conflict_codes.sql');
const conflictMigration = readFileSync(conflictMigrationPath,'utf8');
const q = (x) => '"'+x.replaceAll('"','""')+'"';

// Real PG17, real roles/RLS, installed predecessor definitions and preserved
// ownership trigger. No mocked RPCs and no production data/credentials.
test('PNM contribution transaction, role, replay, CAS and ownership regression', { timeout:120000 }, async (t) => {
  assert.equal(planMigrationTransactions([{ name:path.basename(migrationPath),sql:migration }]).useOuterTransaction,true,
    'maintained installer must atomically commit migration SQL and its ledger receipt');
  const bin = [process.env.PNM_POSTGRES_BIN,'/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin']
    .filter(Boolean).find((x)=>existsSync(path.join(x,'initdb')));
  assert.ok(bin,'PostgreSQL 17 binaries are mandatory; no skipped qualification');
  assert.match(execFileSync(path.join(bin,'postgres'),['--version']).toString(),/PostgreSQL\) 17\./);
  const tmpRoot=process.env.TMPDIR||os.tmpdir();
  if(process.platform==='darwin') assert.ok(tmpRoot.startsWith('/Volumes/SmarterWork/agent-work/'),'Mac test scratch must be on owned SSD');
  const dir=mkdtempSync(path.join(tmpRoot,'pnm-contributions-pg17-'));
  const data=path.join(dir,'data');
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port; await new Promise((resolve)=>server.close(resolve));
  const conn={host:'127.0.0.1',port,user:'postgres',database:'postgres'};
  let started=false; const clients=[];
  const client=async()=>{const c=new pg.Client(conn);await c.connect();clients.push(c);return c;};
  let db;
  const actor=randomUUID(), staff=randomUUID(), stranger=randomUUID(), limited=randomUUID();
  const invoke=async(role,user,name,args,c=db)=>{
    await c.query('BEGIN');
    try {
      await c.query(`SET LOCAL ROLE ${q(role)}`);
      await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||'']);
      const result=(await c.query(`SELECT public.${q(name)}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
      await c.query('COMMIT'); return result;
    } catch(e) {await c.query('ROLLBACK');throw e;}
  };
  const denied=(code)=>e=>e.code===code;
  try {
    execFileSync(path.join(bin,'initdb'),['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'],{stdio:'pipe'});
    execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-F -h 127.0.0.1 -k '' -p ${port}`,'-w','start'],{stdio:'pipe'}); started=true;
    db=await client();
    await db.query(`CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text);
      CREATE TABLE public.commander_venue_photos(venue_id integer,url text,is_cover_photo boolean);
      CREATE TABLE public.venue_location_integrity_log(venue_id integer,actor_id uuid,reason text,integrity_status text,integrity_reason text,before_record jsonb,after_record jsonb);`);
    const names=[...new Set(fixture.columns.map(x=>x.table_name))];
    for(const seq of new Set(fixture.columns.map(x=>x.column_default?.match(/nextval\('([^']+)'::regclass\)/)?.[1]).filter(Boolean)))
      await db.query(`CREATE SEQUENCE public.${q(seq)}`);
    for(const name of names) {
      const columns=fixture.columns.filter(x=>x.table_name===name).map(x=>
        `${q(x.column_name)} ${x.data_type==='ARRAY'?'text[]':x.data_type}${x.column_default?' DEFAULT '+x.column_default:''}${x.is_nullable==='NO'?' NOT NULL':''}`);
      await db.query(`CREATE TABLE public.${q(name)}(${columns.join(',')});ALTER TABLE public.${q(name)} ENABLE ROW LEVEL SECURITY`);
    }
    for(const constraint of [...fixture.constraints].sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')))) {
      // Unrelated cross-product FKs are outside this finite fixture. Actual
      // directly relevant profile/table FKs, checks and PKs are preserved.
      if(constraint.definition.startsWith('FOREIGN KEY')&&!names.some(x=>constraint.definition.includes(`REFERENCES ${x}(`))&&!constraint.definition.includes('REFERENCES profiles('))continue;
      await db.query(`ALTER TABLE public.${q(constraint.relname)} ADD CONSTRAINT ${q(constraint.conname)} ${constraint.definition}`);
    }
    for(const p of fixture.policies) {
      const roles=p.roles.replace(/[{}]/g,'').split(',').map(q).join(',');
      await db.query(`CREATE POLICY ${q(p.policyname)} ON public.${q(p.tablename)} FOR ${p.cmd} TO ${roles}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''}`);
    }
    for(const g of fixture.grants)await db.query(`GRANT ${g.privilege_type} ON public.${q(g.table_name)} TO ${q(g.grantee)}`);
    await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role,authenticated');
    for(const f of fixture.functions)await db.query(f.definition);
    for(const trigger of fixture.triggers)await db.query(trigger.function_definition+';'+trigger.definition);
    await db.query('GRANT EXECUTE ON FUNCTION public.approve_venue_claim(uuid,uuid,text) TO authenticated,service_role');
    await db.query('INSERT INTO public.profiles(id,role) VALUES($1,\'user\'),($2,\'admin\'),($3,\'user\'),($4,\'user\')',[actor,staff,stranger,limited]);
    await db.query("INSERT INTO public.poker_venues(id,name,city,state) VALUES(1,'Qualification Venue','Austin','TX'),(2,'Other Venue','Austin','TX')");
    await db.query("INSERT INTO venue_managers(venue_id,user_id,role,is_active) VALUES(2,$1,'staff',true)",[limited]);
    await db.query('BEGIN;SET LOCAL ROLE anon');
    assert.equal(Number((await db.query('SELECT count(*) FROM venue_managers')).rows[0].count),1,'original installed unrestricted policy reproduces manager identity disclosure');
    await db.query('ROLLBACK');
    await db.query('BEGIN');
    try {
      await db.query(migration);
      await db.query('COMMIT');
    } catch(error) {
      await db.query('ROLLBACK');
      throw error;
    }
    const definitionsSql = "SELECT proname,pg_get_functiondef(oid) AS definition,proacl::text AS acl,proowner,proconfig,prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'pnm_%' ORDER BY proname";
    const beforeFunctions=(await db.query(definitionsSql)).rows;
    assert.equal(planMigrationTransactions([{name:path.basename(conflictMigrationPath),sql:conflictMigration}]).useOuterTransaction,true);
    await db.query('BEGIN');
    try {await db.query(conflictMigration);await db.query('COMMIT');}
    catch(error) {await db.query('ROLLBACK');throw error;}
    const afterFunctions=(await db.query(definitionsSql)).rows;
    assert.deepEqual(afterFunctions,beforeFunctions.map(f=>({...f,definition:f.definition.replaceAll("ERRCODE='40001'","ERRCODE='PT409'")})),
      'full installed definitions, signatures, ACLs, owners and security modes differ only in eight business error codes');
    assert.equal((beforeFunctions.map(f=>f.definition).join('').match(/ERRCODE='40001'/g)||[]).length,8);
    assert.ok(afterFunctions.every(f=>!f.definition.includes("ERRCODE='40001'")),'no explicit business serialization retry traps remain');
    const source='https://venue.example.invalid/poker';
    const claimPayload={role:'owner',contact_name:'Owned Fixture',contact_email:'fixture@example.invalid',source_url:source,notes:'Evidence supplied by the venue.'};
    let claim,approved,schedule;
    await t.test('anonymous/staff RPC/helper boundaries and no private cross-user read',async()=>{
      await assert.rejects(invoke('anon',null,'pnm_submit_venue_claim',[randomUUID(),1,claimPayload]),denied('42501'));
      await assert.rejects(invoke('authenticated',actor,'pnm_review_venue_claim',[randomUUID(),staff,randomUUID(),{}]),denied('42501'));
      await assert.rejects(invoke('authenticated',actor,'pnm_contribution_permissions',[stranger,1]),denied('42501'));
      await assert.rejects(invoke('authenticated',staff,'approve_venue_claim',[randomUUID(),staff,'reason']),denied('42501'));
      assert.equal((await invoke('authenticated',actor,'pnm_venue_contribution_access',[1])).permissions.can_edit_games,false);
      await db.query('BEGIN;SET LOCAL ROLE anon');
      assert.equal(Number((await db.query('SELECT count(*) FROM venue_managers')).rows[0].count),0,'new policy withholds manager rows from strangers');
      await db.query('ROLLBACK');
    });
    await t.test('claim stores pending truth; identical/concurrent requests reuse durable result',async()=>{
      const id=randomUUID(); claim=await invoke('authenticated',actor,'pnm_submit_venue_claim',[id,1,claimPayload]);
      assert.equal(claim.status,'under_review');assert.equal(claim.claim.verification_code,undefined);
      assert.equal((await invoke('authenticated',actor,'pnm_venue_contribution_access',[1])).permissions.can_edit_games,false);
      assert.deepEqual(await invoke('authenticated',actor,'pnm_submit_venue_claim',[id,1,claimPayload]),claim);
      await assert.rejects(invoke('authenticated',actor,'pnm_submit_venue_claim',[id,1,{...claimPayload,notes:'changed'}]),denied('PT409'));
      const a=await client(),b=await client();const concurrent=randomUUID();
      const results=await Promise.all([invoke('authenticated',actor,'pnm_submit_venue_claim',[concurrent,1,claimPayload],a),invoke('authenticated',actor,'pnm_submit_venue_claim',[concurrent,1,claimPayload],b)]);
      assert.deepEqual(results[0],results[1]);assert.equal(results[0].claim.id,claim.claim.id);
      assert.equal(Number((await db.query('SELECT count(*) FROM venue_claims')).rows[0].count),1);
      assert.equal((await invoke('authenticated',stranger,'pnm_venue_contribution_access',[1])).claim,null);
      assert.equal(await invoke('authenticated',stranger,'pnm_contribution_operation',[id]),null);
      assert.deepEqual(await invoke('authenticated',actor,'pnm_contribution_operation',[id]),claim);
      await db.query('BEGIN;SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[stranger]);
      assert.equal(Number((await db.query('SELECT count(*) FROM venue_claims')).rows[0].count),0);
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);
      assert.equal(Number((await db.query('SELECT count(*) FROM venue_claims')).rows[0].count),1);
      await db.query('ROLLBACK');
    });
    await t.test('independent service review atomically provisions actual social/Commander owner',async()=>{
      const payload={action:'approve',expected_updated_at:claim.claim.updated_at,source_url:source,reason:'Independent venue authority verified.'};
      await assert.rejects(invoke('service_role',staff,'pnm_review_venue_claim',[randomUUID(),actor,claim.claim.id,payload]),denied('42501'));
      approved=await invoke('service_role',null,'pnm_review_venue_claim',[randomUUID(),staff,claim.claim.id,payload]);
      assert.equal(approved.status,'approved');
      const v=(await db.query('SELECT is_claimed,claimed_by,commander_enabled FROM poker_venues WHERE id=1')).rows[0];
      assert.deepEqual(v,{is_claimed:true,claimed_by:actor,commander_enabled:true});
      assert.equal((await db.query("SELECT owner_id FROM social_pages WHERE linked_entity_type='venue' AND linked_entity_id='1'")).rows[0].owner_id,actor);
      assert.equal((await invoke('authenticated',actor,'pnm_venue_contribution_access',[1])).permissions.can_edit_games,true);
    });
    await t.test('schedule validation, missing target, direct-write denial and overnight data',async()=>{
      await assert.rejects(invoke('authenticated',stranger,'pnm_mutate_venue_schedule',[randomUUID(),1,{action:'create',day_of_week:'monday',game_name:'NLH',source_url:source}]),denied('42501'));
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_venue_schedule',[randomUUID(),1,{action:'create',day_of_week:'monday',game_name:'NLH',start_time:'24:99',source_url:source}]),denied('22023'));
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_venue_schedule',[randomUUID(),1,{action:'delete',id:999,expected_updated_at:new Date().toISOString(),source_url:source}]),denied('P0002'));
      await db.query('BEGIN;SET LOCAL ROLE authenticated');
      await assert.rejects(db.query("UPDATE venue_game_schedules SET game_name='tampered'"),denied('42501'));await db.query('ROLLBACK');
      schedule=(await invoke('authenticated',actor,'pnm_mutate_venue_schedule',[randomUUID(),1,{action:'create',day_of_week:'monday',game_name:'NLH',start_time:'23:30',end_time:'02:00',source_url:source}])).schedule;
      assert.equal(schedule.start_time,'23:30');assert.equal(schedule.end_time,'02:00');
      const a=await client(),b=await client();const payload={action:'update',id:schedule.id,expected_updated_at:schedule.updated_at,day_of_week:'tuesday',game_name:'PLO',source_url:source};
      const results=await Promise.allSettled([invoke('authenticated',actor,'pnm_mutate_venue_schedule',[randomUUID(),1,payload],a),invoke('authenticated',actor,'pnm_mutate_venue_schedule',[randomUUID(),1,payload],b)]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(results.find(x=>x.status==='rejected').reason.code,'PT409');
      const current=(await db.query('SELECT to_jsonb(s) AS row FROM venue_game_schedules s WHERE id=$1',[schedule.id])).rows[0].row;
      await invoke('authenticated',actor,'pnm_mutate_venue_schedule',[randomUUID(),1,{action:'delete',id:current.id,expected_updated_at:current.updated_at,source_url:source}]);
      await db.query('BEGIN;SET LOCAL ROLE anon');
      assert.equal(Number((await db.query('SELECT count(*) FROM venue_game_schedules WHERE id=$1',[schedule.id])).rows[0].count),0,'soft-deleted schedule must be withheld through direct public RLS too');await db.query('ROLLBACK');
    });
    await t.test('invalid details/source and all-or-nothing info patch cannot bypass API validation',async()=>{
      await assert.rejects(invoke('authenticated',stranger,'pnm_submit_venue_claim',[randomUUID(),2,{...claimPayload,role:'Owner'}]),denied('22023'));
      await assert.rejects(invoke('authenticated',stranger,'pnm_submit_venue_claim',[randomUUID(),2,{...claimPayload,source_url:'https://user:password@example.invalid/'}]),denied('22023'));
      const revision=(await db.query('SELECT location_integrity_revision::text FROM poker_venues WHERE id=1')).rows[0].location_integrity_revision;
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_venue_info',[randomUUID(),1,{changes:{phone:'not saved',zip_code:'unsupported'},expected_revision:revision,source_url:source}]),denied('22023'));
      assert.equal((await db.query('SELECT phone FROM poker_venues WHERE id=1')).rows[0].phone,null);
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_venue_info',[randomUUID(),1,{changes:{website:'javascript:alert(1)'},expected_revision:revision,source_url:source}]),denied('22023'));
    });
    await t.test('correction is pending until real atomic details/location/closure/schedule application',async()=>{
      const create=async(category,proposal)=>{
        const revision=(await db.query('SELECT location_integrity_revision::text FROM poker_venues WHERE id=1')).rows[0].location_integrity_revision;
        return (await invoke('authenticated',stranger,'pnm_submit_venue_correction',[randomUUID(),1,{category,proposal,source_url:source,notes:'Player supplied an evidence link.',expected_revision:revision}])).correction;
      };
      const apply=async(correction,extra={})=>invoke('service_role',null,'pnm_review_venue_correction',[randomUUID(),staff,correction.id,{action:'apply',expected_updated_at:correction.updated_at,source_url:source,reason:'Source independently checked and verified.',...extra}]);
      const details=await create('details',{phone:'512-555-0100',about:'Confirmed venue information.'});
      assert.equal((await db.query('SELECT phone FROM poker_venues WHERE id=1')).rows[0].phone,null);
      assert.equal((await apply(details)).status,'applied');
      assert.equal((await db.query('SELECT phone FROM poker_venues WHERE id=1')).rows[0].phone,'512-555-0100');
      const location=await create('location',{address:'Source address',city:'Austin',state:'TX',latitude:30.2,longitude:-97.7});
      await assert.rejects(apply(location),denied('22023'));
      await apply(location,{resolved_location:{...location.proposal,integrity_status:'verified',integrity_reason:'state_polygon_verified'}});
      assert.equal(Number((await db.query('SELECT latitude FROM poker_venues WHERE id=1')).rows[0].latitude),30.2);
      assert.equal(Number((await db.query('SELECT count(*) FROM venue_location_integrity_log')).rows[0].count),1);
      await apply(await create('closure',{is_active:false}));assert.equal((await db.query('SELECT is_active FROM poker_venues WHERE id=1')).rows[0].is_active,false);
      await apply(await create('schedule',{action:'create',day_of_week:'friday',game_name:'Mixed',start_time:'18:00'}));
      assert.equal(Number((await db.query("SELECT count(*) FROM venue_game_schedules WHERE game_name='Mixed'")).rows[0].count),1);
      const stale=await create('details',{phone:'stale'});
      await db.query('UPDATE poker_venues SET location_integrity_revision=clock_timestamp() WHERE id=1');
      await assert.rejects(apply(stale),denied('PT409'));
      const rejected=await invoke('service_role',null,'pnm_review_venue_correction',[randomUUID(),staff,stale.id,{action:'reject',expected_updated_at:stale.updated_at,source_url:source,reason:'Source information no longer matches current venue.'}]);
      assert.equal(rejected.status,'rejected');
    });
    await t.test('permission denial wins over historical claims; role review cannot steal owner',async()=>{
      await db.query("INSERT INTO venue_managers(venue_id,user_id,role,can_edit_games,is_active) VALUES(1,$1,'staff',false,true)",[limited]);
      await db.query("INSERT INTO page_claims(page_type,page_id,user_id,role,contact_name,contact_email,status) VALUES('venue','1',$1,'staff','Limited','limited@example.invalid','approved')",[limited]);
      assert.equal((await invoke('authenticated',limited,'pnm_venue_contribution_access',[1])).permissions.can_edit_games,false);
      const c=(await invoke('authenticated',limited,'pnm_submit_venue_claim',[randomUUID(),1,{...claimPayload,role:'staff'}])).claim;
      await invoke('service_role',null,'pnm_review_venue_claim',[randomUUID(),staff,c.id,{action:'approve',expected_updated_at:c.updated_at,source_url:source,reason:'Verified delegated floor staff permission.'}]);
      assert.equal((await db.query('SELECT claimed_by FROM poker_venues WHERE id=1')).rows[0].claimed_by,actor);
      assert.equal((await invoke('authenticated',limited,'pnm_venue_contribution_access',[1])).permissions.can_edit_games,true);
    });
    await t.test('immutable audit failure rolls target/receipt back; successful receipt survives lost acknowledgment',async()=>{
      const revision=(await db.query('SELECT location_integrity_revision::text FROM poker_venues WHERE id=1')).rows[0].location_integrity_revision;
      const payload={changes:{phone:'512-555-0199'},expected_revision:revision,source_url:source,notes:'Confirmed contact change.'};const id=randomUUID();
      await db.query("CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;CREATE TRIGGER reject_test_audit BEFORE INSERT ON pnm_contribution_audit FOR EACH ROW EXECUTE FUNCTION reject_test_audit()");
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_venue_info',[id,1,payload]),/injected audit failure/);
      assert.equal((await db.query('SELECT phone FROM poker_venues WHERE id=1')).rows[0].phone,'512-555-0100');
      assert.equal(await invoke('authenticated',actor,'pnm_contribution_operation',[id]),null);
      await db.query('DROP TRIGGER reject_test_audit ON pnm_contribution_audit;DROP FUNCTION reject_test_audit()');
      await invoke('authenticated',actor,'pnm_mutate_venue_info',[id,1,payload]); // discard original acknowledgment intentionally
      const recovered=await invoke('authenticated',actor,'pnm_contribution_operation',[id]);
      assert.equal(recovered.venue.phone,'512-555-0199');
      assert.deepEqual(await invoke('authenticated',actor,'pnm_mutate_venue_info',[id,1,payload]),recovered);
      await db.query('BEGIN;SET LOCAL ROLE service_role');
      await assert.rejects(db.query('TRUNCATE pnm_contribution_audit'),denied('42501'));await db.query('ROLLBACK');
      await db.query('BEGIN;SET LOCAL ROLE service_role');
      await assert.rejects(db.query('DELETE FROM pnm_contribution_operations'),denied('42501'));await db.query('ROLLBACK');
    });
    await t.test('preserved trigger consumer failure never falsely approves an owner',async()=>{
      const c=(await invoke('authenticated',stranger,'pnm_submit_venue_claim',[randomUUID(),2,claimPayload])).claim;
      const id=randomUUID();
      await db.query('ALTER TABLE commander_venue_photos RENAME TO fixture_unavailable_photos');
      try {
        await assert.rejects(invoke('service_role',null,'pnm_review_venue_claim',[id,staff,c.id,{action:'approve',expected_updated_at:c.updated_at,source_url:source,reason:'Independently verified owner before wiring failure.'}]),/ownership consumers were not provisioned/);
      } finally {await db.query('ALTER TABLE fixture_unavailable_photos RENAME TO commander_venue_photos');}
      assert.equal((await db.query('SELECT status FROM venue_claims WHERE id=$1',[c.id])).rows[0].status,'under_review');
      assert.equal((await db.query('SELECT is_claimed FROM poker_venues WHERE id=2')).rows[0].is_claimed,false);
      assert.equal(Number((await db.query('SELECT count(*) FROM pnm_contribution_operations WHERE request_id=$1',[id])).rows[0].count),0);
    });
    await t.test('revoke removes only claim-derived grant; independent permission and evidence remain',async()=>{
      await db.query("INSERT INTO venue_managers(venue_id,user_id,role,can_edit_games,can_edit_info,is_active) VALUES(1,$1,'staff',false,true,true)",[actor]);
      const current=(await db.query('SELECT updated_at::text FROM venue_claims WHERE id=$1',[claim.claim.id])).rows[0].updated_at;
      await invoke('service_role',null,'pnm_review_venue_claim',[randomUUID(),staff,claim.claim.id,{action:'revoke',expected_updated_at:current,source_url:source,reason:'Independent evidence no longer verifies authority.'}]);
      const access=await invoke('authenticated',actor,'pnm_venue_contribution_access',[1]);assert.equal(access.permissions.can_edit_games,false);assert.equal(access.permissions.can_edit_info,true);
      assert.equal((await db.query('SELECT is_claimed FROM poker_venues WHERE id=1')).rows[0].is_claimed,false);
      assert.equal((await db.query("SELECT owner_id FROM social_pages WHERE linked_entity_id='1'")).rows[0].owner_id,null);
      assert.equal(Number((await db.query('SELECT count(*) FROM pnm_contribution_operations')).rows[0].count),Number((await db.query('SELECT count(*) FROM pnm_contribution_audit')).rows[0].count));
      await db.query('DELETE FROM venue_managers;DELETE FROM venue_verification_log;DELETE FROM venue_claims;DELETE FROM page_claims;DELETE FROM venue_game_schedules;DELETE FROM pnm_venue_corrections;DELETE FROM social_pages;DELETE FROM poker_venues;DELETE FROM profiles');
      assert.ok(Number((await db.query('SELECT count(*) FROM pnm_contribution_audit')).rows[0].count)>0,'immutable evidence survives fixture identity cleanup');
    });
  } finally {
    await Promise.all(clients.map(c=>c.end()));
    if(started){const result=spawnSync(path.join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8'});assert.equal(result.status,0,'retain cluster if safe shutdown fails');}
    rmSync(dir,{recursive:true});
  }
});
