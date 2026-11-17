"""TRAIN-only conditional policy improvement; no labels are used at inference."""
import numpy as np
ROOT_SOLVE_TOLERANCE_BB=.001*600/100

def project_teacher(q,f,tolerance=ROOT_SOLVE_TOLERANCE_BB):
 q=np.asarray(q,dtype=float);f=np.asarray(f,dtype=float)
 if q.ndim!=2 or q.shape!=f.shape or q.shape[1]<2 or not np.isfinite(q).all() or not np.isfinite(f).all() or np.any(f<0) or not np.isfinite(tolerance) or tolerance<0:raise ValueError('invalid teacher target')
 if not np.allclose(f.sum(axis=1),1,rtol=0,atol=1e-7):raise ValueError('teacher frequencies not normalized')
 gap=q.max(axis=1,keepdims=True)-q;bad=(gap*f).sum(axis=1)>tolerance
 support=gap<=tolerance;out=f.copy();kept=f*support;mass=kept.sum(axis=1,keepdims=True)
 fallback=support/support.sum(axis=1,keepdims=True)
 corrected=np.divide(kept,mass,out=fallback.copy(),where=mass>0)
 out[bad]=corrected[bad]
 assert np.isfinite(out).all() and np.allclose(out.sum(axis=1),1,rtol=0,atol=1e-7)
 assert np.all((gap*out).sum(axis=1)<=tolerance+1e-7)
 return out
