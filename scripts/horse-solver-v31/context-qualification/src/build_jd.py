"""Fixed TRAIN jackpot transfer: infer at supported600pot, copy to newpot."""
import sys,copy,json,datetime
from pathlib import Path
import joblib,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,config,frozen,read,write,sha
from dataset import public_matrices,ranges_for,load_dataset
from range_features import features
from models import predict,table
from context_scope import require_bracket

def main():
 frozen();c,g=config();load_dataset();fit=read('FIT.json');assert len(fit['models'])==8;assert read('CANDIDATE-SEAL.json')['fit_sha256']==sha('FIT.json');jobs={};proof=[]
 for jid,j0 in c['jd_jobs'].items():
  j=copy.deepcopy(j0);source=j['meta']['source_train_id'];base=c['base_jobs'][source]['phases'][0]['scenario'];s=j['phases'][0]['scenario'];assert s['pot_chips']==base['pot_chips']-j['meta']['drop_chips']
  ref=c['jd_reference_jobs'][source];assert ref['phases'][0]['scenario']['pot_chips']==600;arms=[copy.deepcopy(a) for a in ref['phases'][0]['arms'] if a['name'].endswith('|range_root')];assert len(arms)==2
  j['phases'][0]['arms']=arms;jobs[jid]=j;proof.append(dict(id=jid,reference_policy='old_sealed_range_root',prediction_pot=600,scoring_pot=s['pot_chips'],drop=j['meta']['drop_chips'],inference_at_reduced_pot=False))
 files={}
 for tag,co in c['cohorts'].items():
  if co['stage']=='JD':p=B/('jobs-'+tag+'.json');write(p,[jobs[i] for i in co['ids']]);files[str(p)]=sha(p)
 write('JD-JOBS-SEAL.json',dict(files=files,jobs=16,arms=32,writes=64,proof=proof,candidate_sha256=sha('CANDIDATE-SEAL.json'),fit_sha256=sha('FIT.json'),freeze_sha256=sha('FREEZE.json'),qualification_use=False,live_play=False));print(json.dumps(dict(jobs=16,arms=32,writes=64)))
if __name__=='__main__':main()
