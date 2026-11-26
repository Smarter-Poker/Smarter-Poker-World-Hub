"""136 distinct TRAIN games; conditional ROOT labels retain zero local reach."""
import sys,io,json,datetime
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,config,frozen,read,write,sha,array,domain,probability
from context_scope import stack_only_matrix,game_key
from pot_scope import require_pot_bracket
from range_features import features,ACTOR

# Exact canonical COMBO_CARDS ordering from pinned pio_upi.py f97d90c2... .
_DECK=[rank+suit for rank in '23456789TJQKA' for suit in 'cdhs']
COMBO_CARDS=[(_DECK[low],_DECK[high]) for high in range(1,52) for low in range(high)]
def expected_root_indices(raw,board):
 cards={board[i:i+2] for i in range(0,len(board),2)}
 return np.array([i for i,pair in enumerate(COMBO_CARDS) if raw[i]>0 and not cards.intersection(pair)],dtype=np.int64)

def ranges_for(job,matrices,c,g):
 source=job['meta'].get('source_train_id',job['id']);result={}
 for actor,p in c['ranges'][source].items():
  text=g.read(p,'TRAIN').decode().strip();raw=np.asarray(json.loads(text) if text.startswith('[') else list(map(float,text.split())),float)
  assert raw.shape==(1326,) and np.isfinite(raw).all() and np.min(raw)>=0
  ci=expected_root_indices(raw,job['phases'][0]['scenario']['flop_board']);assert np.array_equal(matrices['F.cbet' if actor=='IP' else 'F.vs_b33']['combo_indices'],ci),'incomplete canonical ROOT mask';v=np.zeros(1326);v[ci]=raw[ci];assert np.all(v[ci]>0);result[actor]=v
 return result

def public_matrices(job,c,g):
 source=job['meta'].get('source_train_id',job['id']);sc=job['phases'][0]['scenario'];key=game_key(sc)
 if sc['pot_chips']!=600:
  records={r['spot']:r for r in c['context_public_records'][key]};role='SOURCE'
 else:
  records={r['spot']:r for r in c['public_records'] if r['id']==source};role='TRAIN'
 assert set(records)==set(SP)
 result={sp:dict(np.load(io.BytesIO(g.read(r['x_path'],role)),allow_pickle=False)) for sp,r in records.items()}
 if sc['pot_chips']==600 and sc['effective_stack_chips']!=20000:
  for sp in SP:result[sp]['X']=stack_only_matrix(result[sp]['X'],c['base_jobs'][source]['phases'][0]['scenario'],sc)
 for sp,m in result.items():
  assert m['X'].shape==(len(m['combo_indices']),246) and np.isfinite(m['X']).all()
  assert np.allclose(m['X'][:,94],sc['pot_chips']/100,atol=1e-12,rtol=0) and np.all(m['X'][:,98]==sc['effective_stack_chips']/100)
 return result

def load_dataset():
 frozen();seal=read('DATA-RELEASE.json');assert seal['dataset_sha256']==sha('DATASET.json')
 d=read('DATASET.json');assert len(d)==544 and len({r['id'] for r in d})==136
 for p,h in seal['files'].items():assert sha(p)==h
 return d

def main():
 frozen();c,g=config();assert not (B/'DATASET.json').exists()
 for tag,co in c['cohorts'].items():
  if co['stage']=='HARVEST':assert read('evidence/technical-'+tag+'.json')['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL'
 # Mandatory A2 classifies all old admitted TRAIN outputs again before any labels enter this new dataset.
 from ops import technical_reused
 technical_reused(c,g)
 old={(r['id'],r['spot']):r for r in c['fit_old_records']};records=[];files={};sources={};zero_mu=0
 for jid,j in c['fit_jobs'].items():
  matrices=public_matrices(j,c,g);sc=j['phases'][0]['scenario'];public_ranges=ranges_for(j,matrices,c,g);semantic=features(matrices,public_ranges);harvest=None
  if jid in c['reused_native']:
   nr=c['reused_native'][jid];native=json.loads(g.read(nr['path'],'TRAIN'));sources[nr['path']]=nr['sha256'];harvest=native['phases'][0]['harvest']
  elif jid in c['harvest_jobs']:
   tag=next(t for t,v in c['cohorts'].items() if jid in v['ids']);path=B/'m1'/('F5P136-'+tag)/(jid+'.json');assert sha(path)==read('evidence/technical-'+tag+'.json')['local_files'][jid+'.json'];native=read(path);sources[str(path)]=sha(path);harvest=native['phases'][0]['harvest']
  if harvest is not None:assert native['status']=='ok' and native['id']==jid
  for sp in SP:
   ci=matrices[sp]['combo_indices'];own=public_ranges[ACTOR[sp]][ci]
   if harvest is not None:
    h=harvest[sp];actions=sorted(h['actions']);assert set(actions)==set(j['meta']['expected_children'][sp]);freq=np.column_stack([h['frequencies'][a] for a in actions])[ci];assert np.isfinite(freq).all() and np.min(freq)>=0 and np.max(np.abs(freq.sum(1)-1))<.02
    freq=probability(freq/freq.sum(1,keepdims=True));zero_mu+=int((np.asarray(h['matchups'])[ci]<=0).sum());label=B/'labels'/(jid+'.'+sp+'.npz');label.parent.mkdir(exist_ok=True);assert not label.exists();np.savez(label,combo_indices=ci,frequency=freq,root_weight=own);labelsha=sha(label);files[str(label)]=labelsha
   else:
    r=old[jid,sp];lab=np.load(io.BytesIO(g.read(r['label_path'],'TRAIN')),allow_pickle=False);assert np.array_equal(lab['combo_indices'],ci) and np.allclose(lab['root_weight'],own,atol=1e-12,rtol=0);probability(lab['frequency']);actions=r['actions'];label=r['label_path'];labelsha=r['label_sha256']
   p=B/'features'/(jid+'.'+sp+'.npz');p.parent.mkdir(exist_ok=True);assert not p.exists();np.savez(p,combo_indices=ci,X=matrices[sp]['X'],S=semantic[sp]['X'],public_root_mass=semantic[sp]['public_root_mass']);files[str(p)]=sha(p)
   records.append(dict(id=jid,source_train_id=j['meta'].get('source_train_id',jid),family=j['meta']['family'],position=j['meta']['position'],sig=j['meta']['sig'],spot=sp,actions=actions,rows=len(ci),stack=sc['effective_stack_chips'],pot=sc['pot_chips'],game_key=game_key(sc),domain=domain(sc),label_path=str(label),label_sha256=labelsha,features_path=str(p),features_sha256=sha(p)))
 assert len(records)==544 and len({r['game_key'] for r in records})==136 and len(sources)==32
 for j in c['evaluation_jobs'].values():require_pot_bracket(j['phases'][0]['scenario'],[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()])
 write('DATASET.json',records);write('DATA-RELEASE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,dataset_sha256=sha('DATASET.json'),freeze_sha256=sha('FREEZE.json'),files=files,native_sources=sources,fit_games=136,nodes=544,held_exact_games=16,rows=sum(r['rows'] for r in records),new_zero_conditional_mu_rows_retained=zero_mu,held_out_global_ranks=False,live_play=False));print('136 TRAIN /544nodes sealed; one fixed fit remains unqualified')
if __name__=='__main__':main()
