import sys,json,datetime,subprocess,io
from pathlib import Path
import numpy as np,joblib
B=Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'src'))
from common import config,frozen,read,write,sha,domain,SP,RECIPES
from dataset import load_dataset,public_matrices,ranges_for
from range_features import features
from models import predict,table
from build_screen import legacy_predict
from context_scope import game_key,require_bracket
from ops import budget,events,idle,remote_ps,REMOTE,HELPER,W
frozen();c,g=config();load_dataset();fit=read('FIT.json');seal=read('SCREEN-JOBS-SEAL.json');assert seal['candidate_sha256']==sha('CANDIDATE-SEAL.json') and seal['fit_sha256']==sha('FIT.json') and seal['freeze_sha256']==sha('FREEZE.json')
models={}
for p,v in fit['models'].items():assert sha(p)==v['sha256'];models[p]=joblib.load(B/p)
legacy={k:joblib.load(io.BytesIO(g.read(p,'MODEL'))) for k,p in c['baseline_models'].items()};total_rows=0;total_writes=0;seen=set()
for tag,co in c['cohorts'].items():
 if co['stage']!='SCREEN':continue
 p=B/('jobs-TRAIN-'+tag+'.json');assert sha(p)==seal['files'][str(p)];jobs=read(p);assert [j['id'] for j in jobs]==co['ids']
 for j in jobs:
  assert j['id'] not in seen;seen.add(j['id']);source=j['meta']['source_train_id'];pos=j['meta']['position'];s=j['phases'][0]['scenario'];assert game_key(s)==game_key(c['validation_jobs'][j['id']]['phases'][0]['scenario']);require_bracket(s,[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()])
  mats=public_matrices(source,c,g);sem=features(mats,ranges_for(j,mats,c,g));expected={};actions={};nodes={v['name']:v['node'] for v in j['phases'][0]['harvest']}
  for sp in SP:
   lm=legacy[pos+'/'+sp+'.joblib'];actions[sp]=lm['actions'];assert lm['domain_sha256']==domain(s);expected['baseline',sp]=table(legacy_predict(lm,mats[sp]['X']))
   for recipe in RECIPES:
    p='models/'+recipe+'/'+pos+'-'+sp+'.joblib';m=models[p];v=fit['models'][p];require_bracket(s,[c['fit_jobs'][i]['phases'][0]['scenario'] for i in v['train_ids']]);assert game_key(s) not in v['train_game_keys'] and m['actions']==actions[sp] and domain(s) in m['domain_sha256s'];expected[recipe,sp]=table(predict(m,mats[sp]['X'] if recipe=='context_root' else sem[sp]['X']))
  arms=j['phases'][0]['arms'];assert len(arms)==6 and len({a['name'] for a in arms})==6
  for a in arms:
   seat,recipe=a['name'].split('_all|');spots=('F.cbet','F.vs_xr') if seat=='ip' else ('F.vs_b33','F.vs_b75');assert len(a['writes'])==2
   for w,sp in zip(a['writes'],spots):
    t=w['spec']['table'];assert w['node']==nodes[sp] and w['actor']==seat.upper() and t['actions']==actions[sp] and t['positive']==list(map(int,mats[sp]['combo_indices'])) and t['F']==expected[recipe,sp]
    assert bool(w.get('rootlive'))==(sp=='F.vs_xr');assert np.max(np.abs(np.round(np.array(t['F']),8)-t['F']))<=5.000001e-9;total_rows+=len(t['F']);total_writes+=1
assert len(seen)==16 and total_writes==192
b=budget(events());assert not b['open_operations'] and b['phase_runs']==32;idle();files={}
for tag,co in c['cohorts'].items():
 if co['stage']!='SCREEN':continue
 jp=B/('jobs-TRAIN-'+tag+'.json');receipt=B/('evidence/screen-preflight-'+tag+'.json');cmd=[sys.executable,'-I','-B',str(W/'flop4/A8/preflight.py'),'--jobs',str(jp),'--driver',str(B/'driver/f4_lock_driver.py'),'--expect-driver-sha',sha('driver/f4_lock_driver.py'),'--expect-accuracy','.001','--cap','58','--used','32','--reserved','0','--require-stack-binds','--expect-stack-chips','20000','--chips-per-bb','100','--json',str(receipt)]
 with (B/('evidence/screen-preflight-'+tag+'.log')).open('x') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode==0 and read(receipt)['verdict']=='GO';files[str(receipt.relative_to(B))]=sha(receipt);files[str(jp.relative_to(B))]=sha(jp)
 target='jobs-F5RCTX-'+tag+'.json';remote_ps("$p='"+REMOTE+'\\'+target+"';if(Test-Path -LiteralPath $p){throw 'already staged'};@{absent=$true}|ConvertTo-Json -Compress")
 r=subprocess.run([HELPER,'scp',str(jp),'danie@192.168.0.51:C:/sp-v31/hv31-rctx-01a1e479/'+target],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr
names={p.name:sha(p) for p in (B/'driver').glob('*.py')};names.update({'jobs-F5RCTX-'+tag+'.json':sha('jobs-TRAIN-'+tag+'.json') for tag,co in c['cohorts'].items() if co['stage']=='SCREEN'})
script="$ErrorActionPreference='Stop';$p='"+REMOTE+"';$h=@{};@("+','.join("'"+n+"'" for n in names)+")|ForEach-Object{$h[$_]=(Get-FileHash -Algorithm SHA256 -LiteralPath ($p+'\\'+$_)).Hash.ToLower()};@{files=$h;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 4 -Compress"
proof=remote_ps(script);assert proof['files']==names and proof['pio_count']==0;write('evidence/stage-SCREEN.json',proof)
write('evidence/actual-table-audit.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,jobs=16,arms=96,writes=192,rows=total_rows,model_table_root_mask_action_support_wire_equality='PASS',independent_agent_review=False,live_play=False))
for name in ('INPUTS.json','DATASET.json','DATA-RELEASE.json','FIT-ADMISSION.json','FIT.json','CANDIDATE-SEAL.json','SCREEN-JOBS-SEAL.json','evidence/stage-SCREEN.json','evidence/actual-table-audit.json'):files[name]=sha(name)
for p,h in read('DATA-RELEASE.json')['files'].items():files[str(Path(p).relative_to(B))]=h
for p,h in read('DATA-RELEASE.json')['native_sources'].items():files[str(Path(p).relative_to(B))]=h
for p,v in fit['models'].items():files[p]=v['sha256']
for tag,co in c['cohorts'].items():
 if co['stage']=='HARVEST':p='evidence/technical-'+tag+'.json';files[p]=sha(p)
write('SCREEN-RELEASE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,review='root owner actual native/data/models/tables/provenance/A8/remote hashes; no independent-agent review claimed',freeze_sha256=sha('FREEZE.json'),candidate_sha256=sha('CANDIDATE-SEAL.json'),jobs_seal_sha256=sha('SCREEN-JOBS-SEAL.json'),files=files,live_play=False))
print(json.dumps(dict(accepted=True,release_sha256=sha('SCREEN-RELEASE.json'),files=len(files),staged=len(names),rows=total_rows)))
