"""Finite, supported stack interpolation; never silent board extrapolation."""
import copy,hashlib,json
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def game_key(s):return digest({k:v for k,v in s.items() if k not in ('scenario_id','purpose')})
def at_depth(s,stack):
 if s['effective_stack_chips']!=20000 or stack not in (18000,22000) or s['chips_per_bb']!=100:raise ValueError('fixed public TRAIN depth protocol required')
 if max(n for line in s['tree_lines'] for n in line)!=20000:raise ValueError('source tree does not bind 200bb')
 out=copy.deepcopy(s);out['effective_stack_chips']=stack
 out['tree_lines']=[[stack if n==20000 else n for n in line] for line in s['tree_lines']]
 if max(n for line in out['tree_lines'] for n in line)!=stack:raise ValueError('training tree exceeds or fails to bind its stack')
 return out
def geometry_key(s):
 t=copy.deepcopy(s);stack=t.pop('effective_stack_chips');t['tree_lines']=[['ALL_IN' if n==stack else n for n in line] for line in t['tree_lines']]
 return game_key(t)
def require_bracket(target,training):
 if target['effective_stack_chips']!=20000 or target['chips_per_bb']!=100:raise ValueError('unqualified interpolation target')
 key=game_key(target)
 if any(game_key(s)==key for s in training):raise ValueError('validation exact game entered fitting')
 same=[s for s in training if geometry_key(s)==geometry_key(target)]
 depths={s['effective_stack_chips'] for s in same}
 if not {18000,22000}<=depths:raise ValueError('both public TRAIN stack neighbors required; extrapolation refused')
 return dict(target_key=key,support_depths=[18000,22000],scope='held_exact_game_with_prior_flop_exposure',held_out_global_rank=False)
def stack_only_matrix(x,source,target):
 import numpy as np
 expected=at_depth(source,target['effective_stack_chips'])
 if game_key(expected)!=game_key(target):raise ValueError('only the declared all-in stack transformation is supported')
 x=np.asarray(x,float)
 if x.ndim!=2 or x.shape[1]!=246 or not np.isfinite(x).all() or not np.all(x[:,98]==200) or not np.all(x[:,32]==150):raise ValueError('source public feature contract')
 z=x.copy();z[:,98]=target['effective_stack_chips']/target['chips_per_bb']
 return z
