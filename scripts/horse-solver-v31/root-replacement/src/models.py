"""Frequency and coupled own-realization policies. No EV/teacher at inference."""
import numpy as np
RECIPES=('independent_root','coupled_ip')
PARAMS=dict(max_iter=200,max_leaf_nodes=31,min_samples_leaf=20,l2_regularization=1.,early_stopping=False,random_state=741)
def probability(f):
 f=np.asarray(f,float)
 if f.ndim!=2 or not np.isfinite(f).all() or np.any(f<0) or not np.allclose(f.sum(1),1,atol=1e-7,rtol=0):raise ValueError('invalid frequencies')
 return f
def joint_targets(cbet,xr,cbet_actions,xr_actions):
 cbet=probability(cbet);xr=probability(xr)
 if len(cbet)!=len(xr) or set(cbet_actions)!={'c','b198','b450'} or set(xr_actions)!={'c','f'}:raise ValueError('joint action mapping')
 get=lambda a:cbet[:,cbet_actions.index(a)]
 return probability(np.column_stack([get('c'),get('b450'),get('b198')*xr[:,xr_actions.index('c')],get('b198')*xr[:,xr_actions.index('f')]]))
def decode_joint(f):
 f=probability(f)
 if f.shape[1]!=4:raise ValueError('four realization columns required')
 den=f[:,2:4].sum(1,keepdims=True)
 xr=np.divide(f[:,2:4],den,out=np.full((len(f),2),.5),where=den>0)
 return probability(np.column_stack([den[:,0],f[:,1],f[:,0]])),probability(xr)
def raw(model,x):
 f=np.column_stack([h.predict(x) for h in model['heads']])
 if not np.isfinite(f).all():raise ValueError('nonfinite inference')
 f=np.clip(f,0,1);den=f.sum(1,keepdims=True)
 if np.any(den<=0):raise ValueError('zero model mass')
 return probability(f/den)
def to_table(f):
 f=probability(f);out=[]
 for row in f.tolist():
  k=max(range(len(row)),key=row.__getitem__);q=[round(v,9) for v in row];q[k]=round(1-sum(v for i,v in enumerate(q) if i!=k),9);out.append(q)
 return probability(out).tolist()
