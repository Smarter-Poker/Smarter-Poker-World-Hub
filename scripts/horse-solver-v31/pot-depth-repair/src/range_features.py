"""Public ROOT-range physics, never conditional reach, labels or solver EVs."""
import numpy as np
SP=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr')
ACTOR={'F.cbet':'IP','F.vs_xr':'IP','F.vs_b33':'OOP','F.vs_b75':'OOP'}
SEMANTIC_COLUMNS=tuple(range(113,187))
QUANTILES=(.1,.25,.5,.75,.9)
_CARDS=np.array([(lo,hi) for hi in range(1,52) for lo in range(hi)],dtype=int)
def root_mass(indices,own,opponent):
 own=np.asarray(own,float);opponent=np.asarray(opponent,float);indices=np.asarray(indices,int)
 assert own.shape==opponent.shape==(1326,) and np.isfinite(own).all() and np.isfinite(opponent).all() and np.min(own)>=0 and np.min(opponent)>=0
 marg=np.zeros(52);np.add.at(marg,_CARDS[:,0],opponent);np.add.at(marg,_CARDS[:,1],opponent)
 unblocked=opponent.sum()-marg[_CARDS[indices,0]]-marg[_CARDS[indices,1]]+opponent[indices]
 mass=own[indices]*np.maximum(0,unblocked);assert mass.sum()>0
 return mass
def distribution(values,mass):
 values=np.asarray(values,float);mass=np.asarray(mass,float);order=np.argsort(values,kind='stable');v=values[order];w=mass[order]/mass.sum();cdf=np.cumsum(w);cdf[-1]=1.
 quantiles=[v[min(np.searchsorted(cdf,q,side='left'),len(v)-1)] for q in QUANTILES]
 mean=float(w@v);std=float(np.sqrt(w@((v-mean)**2)))
 return np.array([mean,std,*quantiles,float(w@(v>=.75)),float(w@(v>=.9))]),(v,cdf)
def percentile(values,dist):
 v,cdf=dist;ix=np.searchsorted(v,values,side='right')-1
 return np.where(ix>=0,cdf[np.maximum(ix,0)],0.)
def features(matrices,ranges):
 """Both actors' approved public ROOT matrices and authored ranges required.

 The caller supplies board-filtered ROOT range vectors. Each actor's vector
 must match its canonical combo-index mask. No range at a reached node enters.
 """
 assert set(matrices)==set(SP) and set(ranges)=={'IP','OOP'}
 base={'IP':matrices['F.cbet'],'OOP':matrices['F.vs_b33']};mass={};summary={};dists={}
 for actor in ('IP','OOP'):
  ci=np.asarray(base[actor]['combo_indices'],int);x=np.asarray(base[actor]['X'],float);assert x.shape==(len(ci),246) and np.isfinite(x).all()
  assert np.array_equal(np.flatnonzero(np.asarray(ranges[actor])>0),ci)
  mass[actor]=root_mass(ci,ranges[actor],ranges['OOP' if actor=='IP' else 'IP'])
  parts=[];dists[actor]={}
  for name,ix in (('current',181),('terminal',184)):
   eq=x[:,ix]+.5*x[:,ix+1];s,d=distribution(eq,mass[actor]);parts.extend(s);dists[actor][name]=d
  summary[actor]=np.array(parts)
 out={}
 for spot in SP:
  actor=ACTOR[spot];peer='OOP' if actor=='IP' else 'IP';x=np.asarray(matrices[spot]['X'],float);ci=np.asarray(matrices[spot]['combo_indices'],int)
  assert np.array_equal(ci,base[actor]['combo_indices']);assert np.allclose(x[:,113:187],base[actor]['X'][:,113:187],rtol=0,atol=1e-12)
  relative=[]
  for name,ix in (('current',181),('terminal',184)):
   eq=x[:,ix]+.5*x[:,ix+1];relative.extend([percentile(eq,dists[actor][name]),percentile(eq,dists[peer][name])])
  macro=np.r_[summary[actor],summary[peer],summary[actor]-summary[peer]]
  z=np.column_stack([x[:,SEMANTIC_COLUMNS],*relative,np.tile(macro,(len(ci),1)),x[:,[94,95,96,98]]]);assert z.shape==(len(ci),136) and np.isfinite(z).all()
  out[spot]=dict(X=z,combo_indices=ci,public_root_mass=mass[actor])
 return out
