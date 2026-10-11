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

const migrationPath=path.resolve(import.meta.dirname,'../supabase/migrations/20261011160000_pnm_player_planning.sql');
const sql=readFileSync(migrationPath,'utf8');
const search={schemaVersion:1,query:'Austin NLH',filters:{state:'TX',game:'NLH',stakes:'',date:'tonight',type:'venues'},location:{city:'Austin',state:'TX'}};
const trip={schemaVersion:1,origin:'Austin, TX',destination:'Dallas, TX',waypoints:[],corridorMi:50,dateRange:{start:'',end:''},venueIds:[1],seriesIds:[101]};
test('PNM player plans qualify actual PG17 ownership, receipts, CAS, concurrency and atomic patches',{timeout:120000},async(t)=>{
  assert.equal(planMigrationTransactions([{name:path.basename(migrationPath),sql}]).useOuterTransaction,true);
  const bin=[process.env.PNM_POSTGRES_BIN,'/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin'].filter(Boolean).find(x=>existsSync(path.join(x,'initdb')));
  assert.ok(bin,'PG17 binaries required, not skipped');
  assert.match(execFileSync(path.join(bin,'postgres'),['--version']).toString(),/PostgreSQL\) 17\./);
  const tmpRoot=process.env.TMPDIR||os.tmpdir();
  if(process.platform==='darwin')assert.ok(tmpRoot.startsWith('/Volumes/SmarterWork/agent-work/'),'owned SSD scratch required');
  const dir=mkdtempSync(path.join(tmpRoot,'pnm-planning-pg17-'));const data=path.join(dir,'data');
  const server=net.createServer();await new Promise((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res);});
  const port=server.address().port;await new Promise(res=>server.close(res));
  const clients=[];let started=false;let db;
  const client=async()=>{const c=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await c.connect();clients.push(c);return c;};
  const actor=randomUUID(),stranger=randomUUID();
  const invoke=async(role,user,name,args,c=db)=>{
    await c.query('BEGIN');try{
      await c.query(`SET LOCAL ROLE "${role}"`);await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||'']);
      const result=(await c.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
      await c.query('COMMIT');return result;
    }catch(e){await c.query('ROLLBACK');throw e;}
  };
  const fail=code=>e=>e.code===code;
  const create=(kind,document,name='Saved Plan',id=randomUUID())=>({id,action:'create',kind,name,document});
  try{
    execFileSync(path.join(bin,'initdb'),['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'],{stdio:'pipe'});
    execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-F -h 127.0.0.1 -k '' -p ${port}`,'-w','start'],{stdio:'pipe'});started=true;
    db=await client();
    await db.query(`CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
      CREATE TABLE profiles(id uuid PRIMARY KEY,poker_near_me_preferences jsonb,updated_at timestamptz);`);
    const predecessor=readFileSync(path.resolve(import.meta.dirname,'../supabase/migrations/20261006014100_trivia_preferences_atomic_cas.sql'),'utf8');
    const generic=predecessor.slice(predecessor.indexOf('CREATE OR REPLACE FUNCTION public.update_page_preferences('),predecessor.indexOf('REVOKE ALL ON FUNCTION public.update_page_preferences(uuid, text, jsonb)'));
    await db.query(generic);
    const before=(await db.query("SELECT pg_get_functiondef('public.update_page_preferences(uuid,text,jsonb)'::regprocedure) AS definition")).rows[0].definition;
    await db.query('INSERT INTO profiles VALUES($1,$3,now()),($2,$3,now())',[actor,stranger,{existing:'preserve',geofenceAlerts:true,locationEnabled:true}]);
    // Reproduces the old read/replace lost update without any mocked database.
    const original=(await db.query('SELECT poker_near_me_preferences AS p FROM profiles WHERE id=$1',[actor])).rows[0].p;
    await db.query('UPDATE profiles SET poker_near_me_preferences=$2 WHERE id=$1',[actor,{...original,locationEnabled:false}]);
    await db.query('UPDATE profiles SET poker_near_me_preferences=$2 WHERE id=$1',[actor,{...original,geofenceAlerts:false}]);
    assert.equal((await db.query('SELECT poker_near_me_preferences AS p FROM profiles WHERE id=$1',[actor])).rows[0].p.locationEnabled,true,'old snapshot replacement loses concurrent location toggle');
    await db.query('BEGIN');try{await db.query(sql);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}
    assert.equal((await db.query("SELECT pg_get_functiondef('public.update_page_preferences(uuid,text,jsonb)'::regprocedure) AS definition")).rows[0].definition,before,'shared Trivia-protecting generic RPC unchanged');
    let saved;
    await t.test('own user RLS and RPC only mutations enforce identity',async()=>{
      await assert.rejects(invoke('anon',null,'pnm_mutate_player_plan',[randomUUID(),create('search',search)]),fail('42501'));
      await assert.rejects(invoke('authenticated',null,'pnm_patch_preferences',[randomUUID(),{locationEnabled:false}]),fail('42501'));
      saved=await invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),create('search',search)]);
      assert.equal(saved.plan.user_id,undefined);assert.equal(saved.plan.revision,1);
      await db.query('BEGIN;SET LOCAL ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[stranger]);
      assert.equal(Number((await db.query('SELECT count(*) FROM pnm_player_plans')).rows[0].count),0);
      await assert.rejects(db.query("DELETE FROM pnm_player_plans"),fail('42501'));await db.query('ROLLBACK');
      await assert.rejects(invoke('authenticated',stranger,'pnm_mutate_player_plan',[randomUUID(),{action:'delete',id:saved.plan.id,expected_revision:1}]),fail('P0002'));
      assert.equal(await invoke('authenticated',stranger,'pnm_player_plan_operation',[saved.operation_id]),null);
    });
    await t.test('same operation survives response loss and concurrent duplicates',async()=>{
      const request=randomUUID(),payload=create('trip',trip);const a=await client(),b=await client();
      const results=await Promise.all([invoke('authenticated',actor,'pnm_mutate_player_plan',[request,payload],a),invoke('authenticated',actor,'pnm_mutate_player_plan',[request,payload],b)]);
      assert.deepEqual(results[0],results[1]);assert.deepEqual(await invoke('authenticated',actor,'pnm_player_plan_operation',[request]),results[0]);
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_player_plan',[request,{...payload,name:'Changed'}]),fail('PT409'));
      assert.equal(Number((await db.query('SELECT count(*) FROM pnm_player_plans WHERE id=$1',[payload.id])).rows[0].count),1);
      await assert.rejects(invoke('authenticated',actor,'pnm_patch_preferences',[request,{locationEnabled:false}]),fail('PT409'));
    });
    await t.test('competing same revision updates allow exactly one and stale delete fails',async()=>{
      const a=await client(),b=await client();const payload={...create('search',search,'Updated',saved.plan.id),action:'update',expected_revision:1};
      const results=await Promise.allSettled([invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),payload],a),invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),{...payload,name:'Other'}],b)]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'PT409');
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),{action:'delete',id:saved.plan.id,expected_revision:1}]),fail('PT409'));
      const id=randomUUID();const result=await invoke('authenticated',actor,'pnm_mutate_player_plan',[id,{action:'delete',id:saved.plan.id,expected_revision:2}]);
      assert.equal(result.id,saved.plan.id);assert.deepEqual(await invoke('authenticated',actor,'pnm_player_plan_operation',[id]),result);
    });
    await t.test('untrusted document fields invalid dates references and toggles rejected atomically',async()=>{
      for(const document of [{...search,invite:'secret'},{...search,query:'hidden\nquery'},{...search,filters:{...search.filters,state:'tx'}},{...search,location:{city:'Austin',state:'tx'}},{...search,filters:{...search.filters,type:'invalid'}},{...trip,origin:'hidden\naddress'},{...trip,waypoints:['hidden\nwaypoint']},{...trip,dateRange:{start:'2026-02-30',end:'2026-03-02'}},{...trip,waypoints:Array(9).fill('Austin')},{...trip,venueIds:[-1]},{...trip,seriesIds:[0]},{...trip,seriesIds:['secret']},{...trip,dateRange:{start:'2026-10-12',end:''}}]){
        await assert.rejects(invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),create(document.origin?'trip':'search',document)]),fail('22023'));
      }
      for(const patch of [{geofenceAlerts:'yes'},{lastLocation:{lat:91,lng:0}},{lastLocationCity:'hidden\ncity'},{locationEnabledAt:'2026-02-30T10:00:00Z'},{locationEnabledAt:'2026-10-11T24:00:00Z'},{unknown:true}])await assert.rejects(invoke('authenticated',actor,'pnm_patch_preferences',[randomUUID(),patch]),fail('22023'));
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),create('trip',trip,'hidden\nname')]),fail('22023'));
    });
    await t.test('concurrent scoped patches preserve both settings and unrelated JSON',async()=>{
      const a=await client(),b=await client();
      await Promise.all([invoke('authenticated',actor,'pnm_patch_preferences',[randomUUID(),{locationEnabled:false}],a),invoke('authenticated',actor,'pnm_patch_preferences',[randomUUID(),{geofenceAlerts:true}],b)]);
      const prefs=(await db.query('SELECT poker_near_me_preferences AS p FROM profiles WHERE id=$1',[actor])).rows[0].p;
      assert.deepEqual(prefs,{existing:'preserve',locationEnabled:false,geofenceAlerts:true});
      const request=randomUUID(),patch={showNewcomerFriendly:false};const first=await invoke('authenticated',actor,'pnm_patch_preferences',[request,patch]);
      await invoke('authenticated',actor,'pnm_patch_preferences',[randomUUID(),{showNewcomerFriendly:true}]);
      assert.deepEqual(await invoke('authenticated',actor,'pnm_patch_preferences',[request,patch]),first,'retry original receipt must not reapply old toggle');
      assert.equal((await db.query('SELECT poker_near_me_preferences AS p FROM profiles WHERE id=$1',[actor])).rows[0].p.showNewcomerFriendly,true);
    });
    await t.test('receipt insert failure rolls back target and preferences',async()=>{
      await db.query("CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected receipt failure';END$$;CREATE TRIGGER reject_receipt BEFORE INSERT ON pnm_player_plan_operations FOR EACH ROW EXECUTE FUNCTION reject_receipt()");
      const payload=create('trip',trip),request=randomUUID();await assert.rejects(invoke('authenticated',actor,'pnm_mutate_player_plan',[request,payload]),/injected receipt failure/);
      assert.equal(Number((await db.query('SELECT count(*) FROM pnm_player_plans WHERE id=$1',[payload.id])).rows[0].count),0);
      await assert.rejects(invoke('authenticated',actor,'pnm_patch_preferences',[request,{locationEnabled:true}]),/injected receipt failure/);
      assert.equal((await db.query('SELECT poker_near_me_preferences AS p FROM profiles WHERE id=$1',[actor])).rows[0].p.locationEnabled,false);
      await db.query('DROP TRIGGER reject_receipt ON pnm_player_plan_operations;DROP FUNCTION reject_receipt()');
    });
    await t.test('account cap and account deletion preserve independent account privacy',async()=>{
      for(let i=0;i<19;i++)await invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),create('trip',trip)]);
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),create('trip',trip)]),fail('22023'));
      for(let i=0;i<50;i++)await invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),create('search',search)]);
      await assert.rejects(invoke('authenticated',actor,'pnm_mutate_player_plan',[randomUUID(),create('search',search)]),fail('22023'));
      await invoke('authenticated',stranger,'pnm_mutate_player_plan',[saved.operation_id,create('trip',trip)]);
      assert.equal((await invoke('authenticated',stranger,'pnm_player_plan_operation',[saved.operation_id])).plan.kind,'trip','same request UUID remains independent per account');
      await db.query('DELETE FROM profiles WHERE id=$1',[actor]);
      assert.equal(Number((await db.query('SELECT count(*) FROM pnm_player_plan_operations WHERE user_id=$1',[actor])).rows[0].count),0);
      assert.equal(Number((await db.query('SELECT count(*) FROM pnm_player_plans')).rows[0].count),1);
    });
  }finally{
    await Promise.all(clients.map(c=>c.end()));
    if(started){const stopped=spawnSync(path.join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8'});assert.equal(stopped.status,0,'retain cluster if shutdown fails');}
    rmSync(dir,{recursive:true});
  }
});
