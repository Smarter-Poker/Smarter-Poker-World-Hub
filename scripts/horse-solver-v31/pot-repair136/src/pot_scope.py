"""Strict pot interpolation with every other public game coordinate unchanged."""
import copy
from context_scope import game_key

def at_pot(source,pot):
 if source['effective_stack_chips']!=20000 or source['chips_per_bb']!=100 or pot not in (540,555,575,585,600):raise ValueError('fixed 200bb pot protocol')
 out=copy.deepcopy(source);out['pot_chips']=pot;return out

def pot_geometry(s):
 out=copy.deepcopy(s);out.pop('pot_chips');return game_key(out)

def require_pot_bracket(target,training,allow_fitted=False):
 if target['effective_stack_chips']!=20000 or target['chips_per_bb']!=100 or target['pot_chips'] not in (540,555,575,585):raise ValueError('unsupported pot target')
 exact=any(game_key(x)==game_key(target) for x in training)
 if allow_fitted:
  if not exact or target['pot_chips'] not in (540,575):raise ValueError('TRAIN regression requires admitted fitted context')
  return dict(target_key=game_key(target),training_exposure=True,qualification_use=False)
 if exact:raise ValueError('evaluation exact game entered TRAIN')
 same=[x for x in training if pot_geometry(x)==pot_geometry(target)]
 lo=[x['pot_chips'] for x in same if x['pot_chips']<target['pot_chips']];hi=[x['pot_chips'] for x in same if x['pot_chips']>target['pot_chips']]
 if not lo or not hi:raise ValueError('both exact-geometry public TRAIN pot neighbors required')
 return dict(target_key=game_key(target),support_pots=[max(lo),min(hi)],prior_flop_exposure=True,universal_historical_freshness=False)
