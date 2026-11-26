"""One sealed candidate and immutable old fullpot policy controls; no old-model extrapolation."""
import sys,copy,io,json
from pathlib import Path
import numpy as np,joblib
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,config,frozen,read,write,sha
from dataset import public_matrices,ranges_for,load_dataset
from range_features import features
from models import table
from runtime import predict_batches
from pot_scope import require_pot_bracket
from context_scope import game_key
from candidate_chain import candidate_chain

def baseline_writes(c,source,seat):
 old=c['reference_jobs'][source];arm=next(a for a in old['phases'][0]['arms'] if a['name']==seat+'_all|range_root');return copy.deepcopy(arm['writes'])
def main(stage):
 assert stage in ('TRAIN','EVALUATION');frozen();c,g=config();load_dataset();candidate_chain();fit=read('FIT.json');cs=read('CANDIDATE-SEAL.json');assert cs['fit_sha256']==sha('FIT.json') and len(fit['models'])==8 and fit['fit_games']==136
 if stage=='EVALUATION':
  result=read('TRAIN-RESULT.json');assert result['stats']['eligible'] is True and result['candidate_sha256']==sha('CANDIDATE-SEAL.json'),'TRAIN gate failed; EVAL not admitted'
 templates=c['training_jobs' if stage=='TRAIN' else 'evaluation_jobs'];contexts={};models={};pred={};proof=[]
 for jid,j in templates.items():
  mat=public_matrices(j,c,g);contexts[jid]=(mat,features(mat,ranges_for(j,mat,c,g)))
  proof.append(dict(id=jid,game_key=game_key(j['phases'][0]['scenario']),support=require_pot_bracket(j['phases'][0]['scenario'],[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()],allow_fitted=stage=='TRAIN')))
 for path,meta in fit['models'].items():
  assert sha(path)==meta['sha256'];m=joblib.load(B/path);models[path]=m;ids=[i for i,j in templates.items() if j['meta']['position']==meta['position']];sp=meta['spot'];assert m['feature_count']==136
  for jid,values in zip(ids,predict_batches(m,[contexts[i][1][sp]['X'] for i in ids])):pred[jid,sp]=values
 jobs={}
 for jid,j0 in templates.items():
  j=copy.deepcopy(j0);pos=j['meta']['position'];source=j['meta']['source_train_id'];mat,sem=contexts[jid];nodes={h['name']:h['node'] for h in j['phases'][0]['harvest']};arms=[]
  for seat,spots in [('ip',('F.cbet','F.vs_xr')),('oop',('F.vs_b33','F.vs_b75'))]:
   old=baseline_writes(c,source,seat)
   for w,sp in zip(old,spots):assert w['node']==nodes[sp] and w['spec']['table']['positive']==list(map(int,mat[sp]['combo_indices']))
   arms.append(dict(name=seat+'_all|baseline',writes=old));writes=[]
   for sp in spots:
    model=models['models/range_root/'+pos+'-'+sp+'.joblib'];assert set(model['actions'])==set(j['meta']['expected_children'][sp]);w=dict(node=nodes[sp],actor=seat.upper(),spec={'table':dict(positive=list(map(int,mat[sp]['combo_indices'])),actions=model['actions'],F=table(pred[jid,sp]))})
    if sp=='F.vs_xr':w['rootlive']=True
    writes.append(w)
   arms.append(dict(name=seat+'_all|range_root',writes=writes))
  j['phases'][0]['arms']=arms;jobs[jid]=j
 files={}
 for tag,co in c['cohorts'].items():
  if co['stage']==stage:write('jobs-'+tag+'.json',[jobs[i] for i in co['ids']]);files['jobs-'+tag+'.json']=sha('jobs-'+tag+'.json')
 write(stage+'-JOBS-SEAL.json',dict(stage=stage,files=files,jobs=16,arms=64,writes=128,proof=proof,candidate_sha256=sha('CANDIDATE-SEAL.json'),fit_sha256=sha('FIT.json'),freeze_sha256=sha('FREEZE.json'),baseline='unchanged prior104fit policy fullpot600 TRAIN-reference tables transferred to reduced pot; unqualified offpot control',training_exposure=stage=='TRAIN',held_out_exact_game_keys=stage=='EVALUATION',live_play=False));print(stage+'16games/64arms/128writes sealed')
if __name__=='__main__':main(sys.argv[1])
