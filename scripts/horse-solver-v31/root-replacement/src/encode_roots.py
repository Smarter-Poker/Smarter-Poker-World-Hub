"""Complete only frozen missing TRAIN targets, with six exact parity controls."""
import copy,json,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,config,frozen,read,write,sha,array,domain
def main():
 frozen();c,g=config();assert not (B/'DATASET.json').exists()
 import context_encode as E
 targets=c['missing']+c['parity_controls'];assert len(targets)==66
 items=[]
 for r in targets:
  j=c['jobs'][r['id']];assert j['meta']['role']=='TRAIN';s=copy.deepcopy(j['phases'][0]['scenario']);h=next(h for h in j['phases'][0]['harvest'] if h['name']==r['spot'])
  items.append(dict(scenario=s,target=dict(target_id=r['id']+'.'+r['spot']+'.0.target',machine_id='M1',node=h['node'],board=s['flop_board'],node_role=None,facing_kind=None,facing_size_bucket=None,expected_children=j['meta']['expected_children'][r['spot']])))
 E.encode(items,B/'encoded-ROOT',tag='root-replacement-TRAIN-v1')
 for r in c['parity_controls']:
  p=c['existing_encoder_rows'][r['id']][r['spot']];old=np.load(__import__('io').BytesIO(g.read(p,'TRAIN')),allow_pickle=False);new=np.load(B/'encoded-ROOT/rows'/(r['id']+'.'+r['spot']+'.0.target.npz'),allow_pickle=False)
  for k in ('combo_indices','X'):assert old[k].dtype==new[k].dtype and old[k].shape==new[k].shape and old[k].tobytes()==new[k].tobytes(),'parity failure'
 rows=[]
 for jid in c['job_ids']:
  j=c['jobs'][jid]
  for sp in SP:
   label=c['labels'][jid][sp];p=c['existing_encoder_rows'].get(jid,{}).get(sp);digest=c['inputs'][p]['sha256'] if p else None
   if p is None:p=str(B/'encoded-ROOT/rows'/(jid+'.'+sp+'.0.target.npz'));digest=sha(p)
   x=array(p,digest);y=array(label['path'],label['sha256']);assert np.array_equal(x['combo_indices'],y['combo_indices']);assert x['X'].shape==(label['root_rows'],246) and np.isfinite(x['X']).all()
   assert np.all(x['X'][:,32]==150) and np.all(x['X'][:,98]==200)
   rows.append(dict(id=jid,spot=sp,position=j['meta']['position'],family=j['meta']['family'],sig=j['meta']['sig'],domain=domain(j['phases'][0]['scenario']),fold=c['folds'][j['meta']['sig']],actions=label['actions'],x_path=p,x_sha256=digest,label_path=label['path'],label_sha256=label['sha256'],rows=label['root_rows']))
 frozen();write('DATASET.json',rows);write('DATASET-SEAL.json',dict(dataset_sha256=sha('DATASET.json'),freeze_sha256=sha('FREEZE.json'),nodes=len(rows),rows=sum(r['rows'] for r in rows),completed_missing=60,parity_controls=6,parity='EXACT',live_play=False));print(json.dumps(read('DATASET-SEAL.json')))
if __name__=='__main__':main()
