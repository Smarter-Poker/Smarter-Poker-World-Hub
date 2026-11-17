"""One explicit native cohort, durable native outcome and canonical copy gate."""
import base64,datetime,hashlib,json,math,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,P,config,frozen,read,write,sha
W=P/'v31-rootcause-01TLQer7';LEDGER=W/'flop5/logs/budget.jsonl';HELPER='/Users/smarter.poker/.smarter-poker/ops/solver-host.sh';REMOTE=r'C:\sp-v31\hv31-root-01a1e479'
sys.path.insert(0,str(W/'flop4/A2'));import f4_results
def budget(events):
 opened={};runs=0;seconds=0.;phase_runs=0;phase_seconds=0.;combined=0.
 for e in events:
  if e.get('dry'):continue
  key=(e.get('out'),e.get('tag','first'))
  if e.get('event')=='launch':
   assert key not in opened;opened[key]=e;runs+=e['solver_runs_max']
   if e['out'].upper().startswith('F5ROOT-'):phase_runs+=e['solver_runs_max']
  elif e.get('event')=='exit':
   assert key in opened and e['rc']==0,'unresolved/failed native operation';l=opened.pop(key)
   s=(datetime.datetime.fromisoformat(e['at'].replace('Z','+00:00'))-datetime.datetime.fromisoformat(l['at'].replace('Z','+00:00'))).total_seconds();assert s>=0;seconds+=s
   if e['out'].upper().startswith('F5ROOT-'):phase_seconds+=s
   if e['out'].upper().startswith(('F5D3-','F5CTX-','F5REPAIR-','F5TAIL-','F5ROOT-')):combined+=s
 return dict(runs=runs,hours=seconds/3600,phase_runs=phase_runs,phase_hours=phase_seconds/3600,combined_hours=combined/3600,open_operations=list(opened))
def events():return [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]
def remote_ps(script,timeout=60):
 encoded=base64.b64encode(script.encode('utf-16le')).decode();r=subprocess.run([HELPER,'m1','powershell -NoProfile -EncodedCommand '+encoded],capture_output=True,text=True,timeout=timeout)
 assert r.returncode==0,r.stderr;return json.loads(r.stdout)
def idle():
 r=remote_ps('@{pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count} | ConvertTo-Json -Compress');assert r['pio_count']==0,'M1 not idle';return r
def technical(jobs,dirs):
 r=f4_results.load(jobs,dirs,expect_driver={sha('driver/f4_lock_driver.py')});s=r.summary()
 expected=[j for p in jobs for j in json.loads(Path(p).read_bytes())]
 assert len(r.sessions)==len(expected) and all(v['state']=='ok_clean' for v in r.sessions.values())
 assert s['usable_arms']==6*len(expected)
 for key in ('flagged_arms','failed_arms','not_run_arms','refused_arms','storage_incidents','spares_used','unconverged_exploit_records'):assert s[key]==0,key
 assert not s['stray_files'] and not s['outputs_without_provenance']
 for p,d in zip(jobs,dirs):
  for j in json.loads(Path(p).read_bytes()):
   o=json.loads((Path(d)/(j['id']+'.json')).read_bytes());ph=o['phases'][0];sc=j['phases'][0]['scenario'];a=ph['eq']['exploitability_chips']/sc['pot_chips'];assert math.isfinite(a) and 0<=a<=.001+1e-9
   assert o['solver_runs']==1 and ph['solve_accuracy']==.001 and ph['rake']==[.1,250]
   for name,key in (('f4_storage.py','storage_sha256'),('f1_readback.py','readback_sha256'),('f4_m1.py','m1helper_sha256'),('context_deadline.py','deadline_sha256')):assert o['provenance'][key]==sha('driver/'+name)
   cap=1.6e9 if j['meta']['family']=='UNPR' else 1.25e9
   for k in (ph['ws_kb_after_solve'],o['ws_kb_end']):assert type(k) in (int,float) and math.isfinite(k) and 0<k*1024<cap
 return r,s
def release():
 frozen();r=read('NATIVE-RELEASE.json')
 assert r['accepted'] is True and r['freeze_sha256']==sha('FREEZE.json') and r['jobs_seal_sha256']==sha('TRAIN-JOBS-SEAL.json')
 for p,h in r['files'].items():assert sha(p)==h,'native release drift'
 assert read('evidence/preflight-all.json')['verdict']=='GO';return r
def launch(suffix):
 release();assert suffix in ('N00','N01','R00','R01');out='F5ROOT-TRAIN-'+suffix;jp=B/('jobs-TRAIN-'+suffix+'.json');js=json.loads(jp.read_bytes());ev=events();b=budget(ev);assert not b['open_operations']
 assert not any(e.get('out','').upper()==out.upper() and e.get('event')=='launch' for e in ev),'already admitted'
 n=len(js);reserve=(900*n+600)/3600;assert b['runs']+n<=2000 and b['hours']+reserve<=40 and b['combined_hours']+reserve<=18
 assert b['phase_runs']+n<=16 and b['phase_hours']+reserve<=5
 predecessors={'N00':None,'N01':'N00','R00':'N01','R01':'R00'};pred=predecessors[suffix]
 if pred:assert read('evidence/technical-'+pred+'.json')['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL'
 idle()
 names=('f4_lock_driver.py','f4_storage.py','f1_readback.py','f4_m1.py','context_deadline.py')
 script="$ErrorActionPreference='Stop';$p='"+REMOTE+"';$h=@{};@("+','.join("'"+n+"'" for n in names)+") | ForEach-Object {$h[$_]=(Get-FileHash -Algorithm SHA256 -LiteralPath ($p+'\\'+$_)).Hash.ToLower()};$h | ConvertTo-Json -Compress"
 remote_hashes=remote_ps(script);assert remote_hashes=={n:sha('driver/'+n) for n in names},'M1 helper drift'
 if suffix=='R01':assert read('evidence/technical-R00.json')['rainbow_solo_pass'] is True
 log=B/('evidence/preflight-'+suffix+'.log');receipt=B/('evidence/preflight-'+suffix+'.json')
 cmd=[sys.executable,'-I','-B',str(W/'flop4/A8/preflight.py'),'--jobs',str(jp),'--driver',str(B/'driver/f4_lock_driver.py'),'--expect-driver-sha',sha('driver/f4_lock_driver.py'),'--expect-accuracy','.001','--cap','20','--used',str(b['phase_runs']),'--reserved','0','--require-stack-binds','--expect-stack-chips','20000','--chips-per-bb','100','--ledger',str(LEDGER),'--programme','F5ROOT-','--json',str(receipt)]
 with log.open('x') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode==0 and read(receipt)['verdict']=='GO'
 write('evidence/admission-'+suffix+'.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),out=out,budget_before=b,reserved_hours=reserve,release_sha256=sha('NATIVE-RELEASE.json'),job_sha256=sha(jp),pio_count_before=0))
 rc=subprocess.run([sys.executable,'-I','-B',str(B/'src/f5_native_launch.py'),out,'--jobs-src',str(jp)]).returncode
 if rc==0:write('evidence/idle-after-'+suffix+'.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),**idle()))
 return rc
def collect(suffix):
 release();out='F5ROOT-TRAIN-'+suffix;ev=[e for e in events() if e.get('out')==out and not e.get('dry')];assert len([e for e in ev if e['event']=='launch'])==1 and ev[-1]['event']=='exit' and ev[-1]['rc']==0 and ev[-1]['rc_source'] in ('m1_marker','m1_marker_tmp')
 dest=B/'m1'/out;dest.parent.mkdir(exist_ok=True);assert not dest.exists(),'reconcile existing copy'
 remote=REMOTE+'\\'+out;script="$ErrorActionPreference='Stop'; $p='"+remote+"'; $h=@{}; Get-ChildItem -LiteralPath $p -File -Recurse | ForEach-Object {$k=$_.FullName.Substring($p.Length+1).Replace('\\','/');$h[$k]=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLower()}; @{files=$h;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count} | ConvertTo-Json -Depth 4 -Compress"
 proof=remote_ps(script);assert proof['files'] and proof['pio_count']==0
 r=subprocess.run([HELPER,'scp','-r','danie@192.168.0.51:C:/sp-v31/hv31-root-01a1e479/'+out,str(dest.parent)+'/'],capture_output=True,text=True,timeout=180);assert r.returncode==0,r.stderr
 subprocess.run(['sudo','-n','chown','-R','smarter.poker:staff',str(dest)],check=True)
 local={str(p.relative_to(dest)):sha(p) for p in dest.rglob('*') if p.is_file()};assert local==proof['files']
 _,summary=technical([B/('jobs-TRAIN-'+suffix+'.json')],[dest]);write('evidence/technical-'+suffix+'.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),verdict='PASS_NATIVE_COPY_A2_TECHNICAL',jobs=len(json.loads((B/('jobs-TRAIN-'+suffix+'.json')).read_bytes())),local_files=local,remote_files=proof['files'],summary=summary,pio_count_after=0,rainbow_solo_pass=suffix=='R00',strength_metrics_read=False));print(json.dumps(dict(cohort=suffix,verdict='PASS_NATIVE_COPY_A2_TECHNICAL')))
if __name__=='__main__':
 assert len(sys.argv)==3 and sys.argv[1] in ('launch','collect')
 if sys.argv[1]=='launch':raise SystemExit(launch(sys.argv[2]))
 collect(sys.argv[2])
