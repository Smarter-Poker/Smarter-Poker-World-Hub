import numpy as np
PARAMS=dict(max_iter=200,max_leaf_nodes=31,min_samples_leaf=20,l2_regularization=1.,early_stopping=False,random_state=741)
def conditional_targets(f):
 f=np.asarray(f,float)
 if f.ndim!=2 or not np.isfinite(f).all() or np.min(f)<0 or not np.allclose(f.sum(1),1,atol=1e-7,rtol=0):raise ValueError('full conditional ROOT target required')
 return f.copy()
def predict(model,x):
 x=np.asarray(x,float)
 if x.ndim!=2 or x.shape[1]!=model['feature_count'] or not np.isfinite(x).all():raise ValueError('public feature contract')
 f=np.column_stack([h.predict(x) for h in model['heads']])
 if not np.isfinite(f).all():raise ValueError('nonfinite inference')
 f=np.clip(f,0,1);den=f.sum(1,keepdims=True)
 if np.any(den<=0):raise ValueError('zero model mass')
 return f/den
def table(f):
 out=[]
 for row in conditional_targets(f).tolist():
  k=max(range(len(row)),key=row.__getitem__);q=[round(v,9) for v in row];q[k]=round(1-sum(v for i,v in enumerate(q) if i!=k),9);out.append(q)
 return conditional_targets(out).tolist()
