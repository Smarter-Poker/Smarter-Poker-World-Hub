"""Seal the 72 old plus 32 new TRAIN games; never fit held exact games."""
import sys,io,json,datetime
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,config,frozen,read,write,sha,array,domain,probability
from context_scope import stack_only_matrix,game_key,require_bracket
from range_features import features,ACTOR
def ranges_for(job,matrices,c,g):
 source=job['meta'].get('source_train_id',job['id']);result={}
 for actor,p in c['ranges'][source].items():
  text=g.read(p,'TRAIN').decode().strip();raw=np.asarray(json.loads(text) if text.startswith('[') else list(map(float,text.split())),float)
  assert raw.shape==(1326,) and np.isfinite(raw).all() and np.min(raw)>=0
  ci=matrices['F.cbet' if actor=='IP' else 'F.vs_b33']['combo_indices'];v=np.zeros(1326);v[ci]=raw[ci];assert np.all(v[ci]>0);result[actor]=v
 return result
def public_matrices(source,c,g):
 records={r['spot']:r for r in c['public_records'] if r['id']==source};assert set(records)==set(SP)
 return {sp:dict(np.load(io.BytesIO(g.read(r['x_path'],'TRAIN')),allow_pickle=False)) for sp,r in records.items()}
def load_dataset():
 frozen();seal=read('DATA-RELEASE.json');assert seal['dataset_sha256']==sha('DATASET.json')
 d=read('DATASET.json');assert len(d)==416 and len({r['id'] for r in d})==104
 for p,h in seal['files'].items():assert sha(p)==h
 return d
def main():
 frozen();c,g=config();assert not (B/'DATASET.json').exists()
 for tag in c['cohort_order']:
  if c['cohorts'][tag]['stage']=='HARVEST':assert read('evidence/technical-'+tag+'.json')['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL'
 old={(r['id'],r['spot']):r for r in c['fit_old_records']};records=[];files={};source_map={};zero_mu=0
 for jid,j in c['fit_jobs'].items():
  source=j['meta'].get('source_train_id',jid);matrices=public_matrices(source,c,g);base=c['base_jobs'][source]['phases'][0]['scenario'];sc=j['phases'][0]['scenario'];is_new=jid in c['harvest_jobs']
  if is_new:
   for sp in SP:matrices[sp]['X']=stack_only_matrix(matrices[sp]['X'],base,sc)
   tag=next(t for t,v in c['cohorts'].items() if jid in v['ids']);path=B/'m1'/('F5RCTX-'+tag)/(jid+'.json');technical=read('evidence/technical-'+tag+'.json');assert sha(path)==technical['local_files'][jid+'.json'];native=json.loads(path.read_bytes());assert native['id']==jid and native['status']=='ok';harvest=native['phases'][0]['harvest'];source_map[str(path)]=sha(path)
  public_ranges=ranges_for(j,matrices,c,g);semantic=features(matrices,public_ranges)
  for sp in SP:
   ci=matrices[sp]['combo_indices'];own=public_ranges[ACTOR[sp]][ci]
   if is_new:
    h=harvest[sp];actions=sorted(h['actions']);assert set(actions)==set(j['meta']['expected_children'][sp]);frequency=np.column_stack([h['frequencies'][a] for a in actions])[ci]
    assert np.isfinite(frequency).all() and np.min(frequency)>=0 and np.max(np.abs(frequency.sum(1)-1))<.02
    frequency=probability(frequency/frequency.sum(1,keepdims=True));zero_mu+=int((np.asarray(h['matchups'])[ci]<=0).sum())
    p=B/'labels'/(jid+'.'+sp+'.npz');p.parent.mkdir(exist_ok=True);assert not p.exists();np.savez(p,combo_indices=ci,frequency=frequency,root_weight=own);label=str(p);labelsha=sha(p);files[label]=labelsha
   else:
    r=old[jid,sp];lab=np.load(io.BytesIO(g.read(r['label_path'],'TRAIN')),allow_pickle=False);assert np.array_equal(lab['combo_indices'],ci) and np.allclose(lab['root_weight'],own,atol=1e-12,rtol=0);frequency=probability(lab['frequency']);actions=r['actions'];label=r['label_path'];labelsha=r['label_sha256']
   p=B/'features'/(jid+'.'+sp+'.npz');p.parent.mkdir(exist_ok=True);assert not p.exists();np.savez(p,combo_indices=ci,X=matrices[sp]['X'],S=semantic[sp]['X'],public_root_mass=semantic[sp]['public_root_mass']);files[str(p)]=sha(p)
   records.append(dict(id=jid,source_train_id=source,family=j['meta']['family'],position=j['meta']['position'],sig=j['meta']['sig'],spot=sp,actions=actions,rows=len(ci),stack=sc['effective_stack_chips'],game_key=game_key(sc),domain=domain(sc),label_path=label,label_sha256=labelsha,features_path=str(p),features_sha256=sha(p)))
 for j in c['validation_jobs'].values():require_bracket(j['phases'][0]['scenario'],[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()])
 assert len(records)==416 and sum(r['stack']==20000 for r in records)==288 and len({r['game_key'] for r in records})==104
 write('DATASET.json',records);write('DATA-RELEASE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,dataset_sha256=sha('DATASET.json'),freeze_sha256=sha('FREEZE.json'),files=files,native_sources=source_map,fit_games=104,held_exact_games=16,nodes=416,rows=sum(r['rows'] for r in records),new_zero_conditional_mu_rows_retained=zero_mu,held_out_global_ranks=False,live_play=False));print(json.dumps({k:v for k,v in read('DATA-RELEASE.json').items() if k not in ('files','native_sources')}))
if __name__=='__main__':main()
