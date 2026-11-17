import sys,json,datetime,subprocess,hashlib
from pathlib import Path
B=Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'src'))
from common import read,write,sha,config
from ops import idle,budget,events,remote_ps,REMOTE,HELPER,W
c,g=config();assert not (B/'FREEZE.json').exists()
for p,v in c['inputs'].items():g.read(p,v['role'])
b=budget(events());assert not b['open_operations'] and b['phase_runs']==0 and b['runs']==689
assert b['combined_hours']+5<=18 and b['hours']+5<=40
# Reserve proof is per cohort, not a simultaneous worst-case claim for all jobs.
assert read('evidence/stack-feature-proof.json')['verdict']=='EXACT_ACTUAL_PUBLIC_PRODUCER_PARITY'
write('evidence/prefreeze-native-idle.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),budget=b,**idle()))
for tag,co in c['cohorts'].items():
 if co['stage']!='HARVEST':continue
 jp=B/('jobs-TRAIN-'+tag+'.json');receipt=B/('evidence/freeze-preflight-'+tag+'.json')
 cmd=[sys.executable,'-I','-B',str(W/'flop4/A8/preflight.py'),'--jobs',str(jp),'--driver',str(B/'driver/f4_lock_driver.py'),'--expect-driver-sha',sha('driver/f4_lock_driver.py'),'--expect-accuracy','.001','--cap','58','--used','0','--reserved','16','--require-stack-binds','--expect-stack-chips',str(co['stack']),'--chips-per-bb','100','--json',str(receipt)]
 with (B/('evidence/freeze-preflight-'+tag+'.log')).open('x') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode==0 and read(receipt)['verdict']=='GO',tag
files=[*B.joinpath('src').glob('*.py'),*B.joinpath('driver').glob('*.py'),B/'test_source_contract.py',B/'PLAN.md',B/'DIAGNOSIS.md',B/'safe-padding-v2.json',B/'evidence/stack-feature-proof.json']
files+=[B/('jobs-TRAIN-'+tag+'.json') for tag,co in c['cohorts'].items() if co['stage']=='HARVEST']
write('FREEZE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),plan='TRAIN_CONTEXT_REPAIR_V1',inputs_sha256=sha('INPUTS.json'),source_files={str(p.relative_to(B)):sha(p) for p in files},live_play=False,consumed_evaluations_used=False,protected_holdouts_accessed=False,final_qualification=False))
# Fresh namespace only, never overwrite another run.
r=remote_ps("$ErrorActionPreference='Stop';$p='"+REMOTE+"'; if(Test-Path -LiteralPath $p){throw 'namespace already exists'};New-Item -ItemType Directory -Path $p | Out-Null;@{created=$true;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Compress");assert r['created'] and r['pio_count']==0
staged={}
for p in B.joinpath('driver').glob('*.py'):
 target=p.name;r=subprocess.run([HELPER,'scp',str(p),'danie@192.168.0.51:C:/sp-v31/hv31-rctx-01a1e479/'+target],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr;staged[target]=sha(p)
for tag,co in c['cohorts'].items():
 if co['stage']!='HARVEST':continue
 p=B/('jobs-TRAIN-'+tag+'.json');target='jobs-F5RCTX-'+tag+'.json';r=subprocess.run([HELPER,'scp',str(p),'danie@192.168.0.51:C:/sp-v31/hv31-rctx-01a1e479/'+target],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr;staged[target]=sha(p)
script="$ErrorActionPreference='Stop';$p='"+REMOTE+"';$h=@{};@("+','.join("'"+n+"'" for n in staged)+") | ForEach-Object {$h[$_]=(Get-FileHash -Algorithm SHA256 -LiteralPath ($p+'\\'+$_)).Hash.ToLower()};@{files=$h;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 4 -Compress"
proof=remote_ps(script);assert proof['files']==staged and proof['pio_count']==0;write('evidence/stage-HARVEST.json',proof)
releasefiles=files+[B/('evidence/freeze-preflight-'+tag+'.json') for tag,co in c['cohorts'].items() if co['stage']=='HARVEST']+[B/'evidence/stage-HARVEST.json',B/'INPUTS.json',B/'evidence/prefreeze-native-idle.json']
write('HARVEST-RELEASE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,review='root owner actual source/input/producer/budget/A8/native hashes; no independent-agent review claimed',freeze_sha256=sha('FREEZE.json'),files={str(p.relative_to(B)):sha(p) for p in releasefiles},live_play=False))
print(json.dumps(dict(freeze_sha256=sha('FREEZE.json'),release_sha256=sha('HARVEST-RELEASE.json'),inputs=len(c['inputs']),files=len(files),staged=len(staged))))
