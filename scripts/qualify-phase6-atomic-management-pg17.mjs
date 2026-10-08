import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {buildAtomicReadOnlySql,buildAtomicNegativeSql} from './lib/phase6AtomicManagementSql.mjs';

// Disposable local qualification only. No hosted client or credentials exist.
// Use the same major-version resolver as the maintained Phase 6 verifiers.
export function resolvePostgresBin() {
  const pgConfig=spawnSync('pg_config',['--bindir'],{encoding:'utf8'});
  const candidates=[process.env.PHASE6_POSTGRES_BIN,
    pgConfig.status===0?pgConfig.stdout.trim():null,
    '/opt/homebrew/opt/postgresql@17/bin','/usr/local/opt/postgresql@17/bin',
    '/usr/lib/postgresql/17/bin','/usr/local/pgsql/bin'].filter(Boolean);
  for(const candidate of candidates) {
    if(!['postgres','initdb','pg_ctl','psql','createdb'].every(tool=>fs.existsSync(path.join(candidate,tool))))continue;
    const version=spawnSync(path.join(candidate,'postgres'),['--version'],{encoding:'utf8'});
    if(version.status===0&&/\b17\.\d+\b/.test(version.stdout))return candidate;
  }
  throw new Error('PostgreSQL 17 binaries are required. Set PHASE6_POSTGRES_BIN to the directory containing postgres, initdb, pg_ctl, psql, and createdb.');
}
const bin=resolvePostgresBin();
const base=fs.realpathSync(tmpdir());
if(process.platform==='darwin')assert.ok(base.startsWith('/Volumes/SmarterWork/agent-work/'),'Mac qualification requires short task-owned external SSD TMPDIR');
assert.ok(Buffer.byteLength(path.join(base,'a-XXXXXX/s/.s.PGSQL.55451'))<104,'TMPDIR is too long for the isolated PostgreSQL socket');
const work=fs.mkdtempSync(path.join(base,'a-'));
const socket=path.join(work,'s');fs.mkdirSync(socket);
const user=execFileSync('id',['-un'],{encoding:'utf8'}).trim();
const env={...process.env,PGHOST:socket,PGPORT:'55451',PGUSER:user};
const run=sql=>execFileSync(bin+'/psql',['-X','-At','-v','ON_ERROR_STOP=1','-h',socket,'-p','55451','-U',user,'-d','postgres'],{input:sql,env,encoding:'utf8',stdio:['pipe','pipe','pipe']});
let started=false;
function cleanup() {
  if(started||fs.existsSync(path.join(work,'d/postmaster.pid'))) {
    const stopped=spawnSync(bin+'/pg_ctl',['-D',work+'/d','-m','fast','-w','stop'],{encoding:'utf8'});
    assert.equal(stopped.status,0,`Isolated PostgreSQL did not stop; preserving task fixture ${work}`);
    started=false;
  }
  assert.equal(path.dirname(work),base,'Refusing cleanup outside owned fixture parent');
  assert.ok(path.basename(work).startsWith('a-'),'Refusing cleanup of an unknown fixture');
  fs.rmSync(work,{recursive:true,force:true});
}
const onSignal=()=>{try{cleanup();}finally{process.exit(1);}};
process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
try {
  execFileSync(bin+'/initdb',['-D',work+'/d','-A','trust','-U',user],{stdio:'ignore'});
  execFileSync(bin+'/pg_ctl',['-D',work+'/d','-l',work+'/postgres.log','-o',`-k ${socket} -h '' -p 55451`,'-w','start'],{stdio:'ignore'});
  started=true;
  run(`CREATE TABLE fixture(id integer PRIMARY KEY, value text); INSERT INTO fixture VALUES(1,'original');
CREATE FUNCTION refusal() RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='EXPECTED_REFUSAL'; END $$;`);
  const readonly=run(buildAtomicReadOnlySql([
    {key:'mode',text:"SELECT current_setting('transaction_read_only') AS mode",params:[]},
    {key:'fixture',text:'SELECT * FROM fixture',params:[]},
  ]));
  const row=JSON.parse(readonly.split('\n').find(line=>line.startsWith('{')));
  assert.deepEqual(row.mode,[{mode:'on'}]);assert.deepEqual(row.fixture,[{id:1,value:'original'}]);
  const names=['answeredSlotPromotion','changedAnswerReplay','changedSlotBinding','neverServedSnapshot','nonV4PredecessorId','nullOwnerLegacyEvent'];
  const probes=names.map((name,index)=>({name,
    input:{setup:[{text:'DELETE FROM fixture WHERE id=$1',params:[1],expectedRowCount:1}],
      text:index<3?'SELECT refusal() AS result':"SELECT jsonb_build_object('authorized',false,'code','REFUSED') AS result",params:[]},
    expectation:index<3?{outcome:'error',code:'23514',message:'EXPECTED_REFUSAL'}:{outcome:'result',code:'REFUSED'},
    postCheck:{text:'SELECT * FROM fixture',params:[],expectedRows:[{id:1,value:'original'}]}}));
  const result=run(buildAtomicNegativeSql(probes));
  const receipts=JSON.parse(result.split('\n').find(line=>line.startsWith('{')));
  assert.equal(Object.keys(receipts).length,6);
  for(const receipt of Object.values(receipts)) assert.deepEqual(receipt,{status:'passed',refusalObserved:true,postRollbackVerified:true,subtransactionRolledBack:true});
  assert.equal(run('SELECT value FROM fixture WHERE id=1').trim(),'original');
  const wrong=structuredClone(probes);wrong[0].expectation.message='WRONG';
  assert.throws(()=>run(buildAtomicNegativeSql(wrong)));
  assert.equal(run('SELECT value FROM fixture WHERE id=1').trim(),'original');
  console.log('PHASE6_ATOMIC_PG17_ROLLBACK_OK');
} finally {cleanup();process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);}
