"""Read only admitted public TRAIN features and authored ranges; no fitting."""
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
