"""Seal exact held-out-fold whole-seat TRAIN tables before native validation."""
import copy,io,json,sys
from pathlib import Path
import joblib,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,config,dataset,frozen,read,write,sha,array,bytes_for,domain
from models import RECIPES,raw,decode_joint,to_table
def baseline_predict(model,x):
 f=raw(model,x);g=np.where(f<.05,0,f);bad=g.sum(1)<=0;g[bad]=f[bad];return g/g.sum(1,keepdims=True)
def load_fold(report,recipe,fold,pos,sp,sig):
 name='models/'+recipe+'/fold%d/'%fold+pos+'-'+sp+'.joblib';meta=report['models'][name]
 assert meta['held_out_fold']==fold and sig not in meta['train_ranks'];assert sha(name)==meta['sha256']
 return joblib.load(io.BytesIO((B/name).read_bytes()))
def main():
 frozen();c,g=config();seal=read('FOLD-MODELS-SEAL.json');assert sha('FOLD-MODELS.json')==seal['sha256'];report=read('FOLD-MODELS.json');assert report['dataset_sha256']==sha('DATASET.json')
 records={(r['id'],r['spot']):r for r in dataset()};jobs=[];proof=[]
 base={k:joblib.load(io.BytesIO(g.read(p,'MODEL'))) for k,p in c['baseline_models'].items()}
 for jid in c['selected_ids']:
  old=c['jobs'][jid];j=copy.deepcopy(old);ph=j['phases'][0];s=ph['scenario'];pos=j['meta']['position'];sig=j['meta']['sig'];fold=c['folds'][sig];newid='f5root.TRAIN.'+jid.split('.TRAIN.',1)[1];j['id']=newid;s['scenario_id']=newid;j['meta'].update(source_train_id=jid,held_out_fold=fold,role='TRAIN',screen_only=True)
  z={sp:array(records[jid,sp]['x_path'],records[jid,sp]['x_sha256']) for sp in SP}
  assert np.array_equal(z['F.cbet']['combo_indices'],z['F.vs_xr']['combo_indices']) and np.array_equal(z['F.vs_b33']['combo_indices'],z['F.vs_b75']['combo_indices'])
  predictions={name:{} for name in ('baseline',*RECIPES)};acts={}
  joint=load_fold(report,'coupled_ip',fold,pos,'IP.joint',sig);assert joint['domain_sha256']==domain(s);jc,jx=decode_joint(raw(joint,z['F.cbet']['X']))
  for sp in SP:
   r=records[jid,sp];acts[sp]=r['actions'];bm=base[pos+'/'+sp+'.joblib'];assert bm['domain_sha256']==domain(s) and bm['actions']==r['actions']
   predictions['baseline'][sp]=baseline_predict(bm,z[sp]['X'])
   im=load_fold(report,'independent_root',fold,pos,sp,sig);assert im['actions']==r['actions'] and im['domain_sha256']==domain(s);predictions['independent_root'][sp]=raw(im,z[sp]['X'])
   if sp in ('F.cbet','F.vs_xr'):
    canonical=['b198','b450','c'] if sp=='F.cbet' else ['c','f'];f=jc if sp=='F.cbet' else jx;predictions['coupled_ip'][sp]=f[:,[canonical.index(a) for a in r['actions']]]
   else:
    om=load_fold(report,'coupled_ip',fold,pos,sp,sig);assert om['actions']==r['actions'] and om['domain_sha256']==domain(s);predictions['coupled_ip'][sp]=raw(om,z[sp]['X'])
  nodes={h['name']:h for h in ph['harvest']};arms=[]
  for seat,spots in (('ip',('F.cbet','F.vs_xr')),('oop',('F.vs_b33','F.vs_b75'))):
   for name in ('baseline',*RECIPES):
    writes=[]
    for sp in spots:
     ci=list(map(int,z[sp]['combo_indices']));table=to_table(predictions[name][sp]);assert len(table)==len(ci) and set(acts[sp])==set(j['meta']['expected_children'][sp])
     wr=dict(node=nodes[sp]['node'],actor=seat.upper(),spec={'table':dict(positive=ci,actions=acts[sp],F=table)})
     if sp=='F.vs_xr':wr['rootlive']=True
     writes.append(wr)
    arms.append(dict(name=seat+'_all|'+name,writes=writes))
  ph['arms']=arms;jobs.append(j);proof.append(dict(id=newid,source_train_id=jid,sig=sig,fold=fold,domain=domain(s),rows={sp:len(z[sp]['X']) for sp in SP}))
 normal=[j for j in jobs if j['meta']['family']!='UNPR'];rainbow=[j for j in jobs if j['meta']['family']=='UNPR'];assert len(normal)==12 and len(rainbow)==4
 groups={'N00':normal[:6],'N01':normal[6:],'R00':rainbow[:1],'R01':rainbow[1:]};files={}
 for suffix,js in groups.items():p=B/('jobs-TRAIN-'+suffix+'.json');write(p,js);files[str(p)]=sha(p)
 write('TRAIN-JOBS-SEAL.json',dict(files=files,jobs=16,arms=96,writes=192,proof=proof,fold_models_sha256=sha('FOLD-MODELS.json'),dataset_sha256=sha('DATASET.json'),freeze_sha256=sha('FREEZE.json'),role='TRAIN_SCREEN_ONLY',live_play=False));print(json.dumps({'jobs':16,'arms':96,'files':files}))
if __name__=='__main__':main()
