"""TRAIN-only loss, coverage and teacher consistency diagnosis. Never fits."""
import sys,json,io,hashlib,datetime,importlib.util
from pathlib import Path
import numpy as np,joblib
sys.path.insert(0,str(Path(__file__).resolve().parent))
from data_access import SafeInputs
B=Path(__file__).resolve().parents[1]
P=B.parent/'hv31-root-replacement-01a1e479'
EXPECTED='4d5ec0746d73675bf1337cea499718b92a201a1f02b9d8a8e5ecec35b9828ea8'
def norm(f):
 f=np.asarray(f,float);assert np.isfinite(f).all() and np.all(f>=0) and np.all(f.sum(1)>0);return f/f.sum(1,keepdims=True)
def predict(m,x):return norm(np.clip(np.column_stack([h.predict(x) for h in m['heads']]),0,1))
def clip5(f):
 q=np.where(f<.05,0,f);bad=q.sum(1)==0;q[bad]=f[bad];return norm(q)
def metrics(f,r):
 w=r['w']/r['w'].sum();mu=r['mu'];active=mu>0;q=r['q'][active];teacher=r['y'];loss=((teacher[active]-f[active])*q).sum(1)
 return dict(root_tv=float(w@(.5*np.abs(f-teacher).sum(1))),active_tv=float((mu[active]/mu[active].sum())@(.5*np.abs(f[active]-teacher[active]).sum(1))) if active.any() else None,
  conditional_loss_bb=float((mu[active]/mu[active].sum())@loss) if active.any() else None,
  positive_conditional_loss_bb=float((mu[active]/mu[active].sum())@np.maximum(loss,0)) if active.any() else None,
  action_mix=dict(zip(r['actions'],map(float,w@f))),teacher_mix=dict(zip(r['actions'],map(float,w@teacher))))
def main():
 raw=(B/'DIAGNOSTIC-INPUTS-v2.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==EXPECTED;c=json.loads(raw);g=SafeInputs(c['inputs'])
 for p,v in c['inputs'].items():g.read(p,v['role'])
 # Mandatory native loader before using any native records. No strength score
 # is remeasured: the diagnostic uses stored TRAIN screen rows and frequencies.
 spec=importlib.util.spec_from_file_location('native_train_loader',c['native_loader']);loader=importlib.util.module_from_spec(spec);sys.modules[spec.name]=loader;spec.loader.exec_module(loader)
 result=loader.load(c['native_jobs'],c['native_dirs'],expect_driver={'6da40e5fa1e4a90dd6712bf5e0c39b35ac5c15f16506e62b949325ce56d73880'});native_summary=result.summary();assert native_summary['usable_arms']==96 and all(s['state']=='ok_clean' for s in result.sessions.values())
 desc=g.json(c['sources']['GtoPublicHist215FeatureDescriptorV2.json'],'SOURCE');names=desc['feature_order'];assert len(names)==246
 harvest={jid:g.json(p,'TRAIN') for jid,p in c['harvest'].items()};records=[];bykey={}
 for r0 in c['dataset']:
  r=dict(r0);x=np.load(io.BytesIO(g.read(r['x_path'],'TRAIN')),allow_pickle=False);y=np.load(io.BytesIO(g.read(r['label_path'],'TRAIN')),allow_pickle=False)
  assert np.array_equal(x['combo_indices'],y['combo_indices']);ci=x['combo_indices'];h=harvest[r['id']]['phases'][0]['harvest'][r['spot']]
  teacher=norm(np.column_stack([h['frequencies'][a] for a in r['actions']])[ci]);assert np.max(np.abs(teacher-y['frequency']))<1e-7
  q=np.column_stack([h['action_ev_chips'][a] for a in r['actions']])[ci]/100;mu=np.asarray(h['matchups'])[ci];assert np.isfinite(q[mu>0]).all()
  r.update(x=x['X'],ci=ci,y=teacher,w=y['root_weight'],mu=mu,q=q);assert len(ci)==r['rows'] and r['x'].shape==(len(ci),246)
  records.append(r);bykey[r['id'],r['spot']]=r
 print('Loaded352ROOTnodes/121968rows/16nativeTRAINrecords; no fits',flush=True)
 baseline={k:joblib.load(io.BytesIO(g.read(p,'MODEL'))) for k,p in c['baseline_models'].items()};baseline_rows=[]
 for pos in ('HJ','UTG'):
  for sp in ('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr'):
   rs=[r for r in records if r['position']==pos and r['spot']==sp];x=np.concatenate([r['x'] for r in rs]);model=baseline[pos+'/'+sp+'.joblib'];pr=predict(model,x);offset=0
   for r in rs:
    f=pr[offset:offset+r['rows']];offset+=r['rows'];baseline_rows.append(dict(id=r['id'],family=r['family'],position=pos,spot=sp,raw=metrics(f,r),r05=metrics(clip5(f),r)))
 fit_rows=[];gain_reports=[];coverage=[]
 for fold in range(3):
  for family in ('PAIR','MONO','UNP2T','UNPR'):
   allr=sorted({r['sig'] for r in records if r['family']==family});coverage.append(dict(fold=fold,family=family,train_ranks=[s for s in allr if c['folds'][s]!=fold],held_ranks=[s for s in allr if c['folds'][s]==fold]))
  for recipe in ('independent_root','coupled_ip'):
   for pos in ('HJ','UTG'):
    spots=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr') if recipe=='independent_root' else ('IP.joint','F.vs_b33','F.vs_b75')
    for sp in spots:
     key='models/'+recipe+'/fold%d/'%fold+pos+'-'+sp+'.joblib';model=joblib.load(io.BytesIO(g.read(P/key,'MODEL')));meta=c['models'][key]
     rs=[r for r in records if r['position']==pos and r['spot']==('F.cbet' if sp=='IP.joint' else sp)];x=np.concatenate([r['x'] for r in rs]);f=predict(model,x)
     train_x=np.concatenate([r['x'] for r in rs if r['fold']!=fold]);lo=train_x.min(0);hi=train_x.max(0);off=0
     gains=np.zeros(246)
     for head in model['heads']:
      for iteration in head._predictors:
       for tree in iteration:
        nodes=tree.nodes;inside=nodes['is_leaf']==0
        np.add.at(gains,nodes['feature_idx'][inside],np.maximum(nodes['gain'][inside],0))
     inds=np.argsort(-gains)[:20];gain_reports.append(dict(recipe=recipe,fold=fold,position=pos,spot=sp,top=[dict(index=int(i),feature=names[i],gain=float(gains[i])) for i in inds]))
     for r in rs:
      pred=f[off:off+r['rows']];off+=r['rows'];outside=(r['x']<lo-1e-9)|(r['x']>hi+1e-9);w=r['w']/r['w'].sum()
      projections=[(sp,pred)]
      if sp=='IP.joint':
       den=pred[:,2]+pred[:,3];projections=[('F.cbet',np.column_stack([den,pred[:,1],pred[:,0]])),('F.vs_xr',np.divide(pred[:,2:4],den[:,None],out=np.full((len(den),2),.5),where=den[:,None]>0))]
      for real_sp,pred0 in projections:
       rr=bykey[r['id'],real_sp]
       if sp=='IP.joint':
        canon=['b198','b450','c'] if real_sp=='F.cbet' else ['c','f'];pred0=pred0[:,[canon.index(a) for a in rr['actions']]]
       row=dict(id=r['id'],family=r['family'],position=pos,spot=real_sp,recipe=recipe,fold=fold,held_out=r['fold']==fold,
        train_family_rank_count=len({t['sig'] for t in rs if t['family']==r['family'] and t['fold']!=fold}),raw=metrics(pred0,rr),r05_counterfactual=metrics(clip5(pred0),rr),
        outside_training_any_feature_weight=float(w@outside.any(1)),outside_features=[dict(index=int(i),feature=names[i],root_weight=float(w@outside[:,i])) for i in np.flatnonzero(outside.any(0))])
       fit_rows.append(row)
   print('Predicted',recipe,'fold',fold,flush=True)
 consistency=[]
 for jid,p in c['native_harvest'].items():
  new=g.json(p,'TRAIN')['phases'][0]['harvest']
  for sp in ('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr'):
   r=bykey[jid,sp];ci=r['ci'];h=new[sp];f=norm(np.column_stack([h['frequencies'][a] for a in r['actions']])[ci]);w=r['w']/r['w'].sum()
   consistency.append(dict(id=jid,spot=sp,root_tv=float(w@(.5*np.abs(f-r['y']).sum(1))),max_difference=float(np.abs(f-r['y']).max())))
 aggregate={}
 for recipe in ('independent_root','coupled_ip'):
  aggregate[recipe]={}
  for fam in ('PAIR','MONO','UNP2T','UNPR'):
   aggregate[recipe][fam]={}
   for mode in ('held','fit'):
    rr=[r for r in fit_rows if r['recipe']==recipe and r['family']==fam and r['held_out']==(mode=='held')]
    aggregate[recipe][fam][mode]=dict(nodes=len(rr),mean_root_tv=float(np.mean([r['raw']['root_tv'] for r in rr])),mean_positive_conditional_loss_bb=float(np.mean([r['raw']['positive_conditional_loss_bb'] for r in rr if r['raw']['positive_conditional_loss_bb'] is not None])))
 out=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),role='TRAIN_DIAGNOSTIC_ONLY',fits_performed=0,live_play=False,inputs_sha256=EXPECTED,coverage=coverage,aggregate=aggregate,rows=fit_rows,baseline_rows=baseline_rows,split_gain_reports=gain_reports,native_teacher_consistency=consistency,native_technical_summary=native_summary,stored_native_TRAIN_screen=c['previous_TRAIN_screen'])
 with (B/'evidence/DIAGNOSIS.json').open('x') as f:json.dump(out,f,indent=2,sort_keys=True,allow_nan=False);f.write('\n')
 print(json.dumps(dict(aggregate=aggregate,max_original_vs_native_teacher_tv=max(r['root_tv'] for r in consistency),fits_performed=0)))
if __name__=='__main__':main()
