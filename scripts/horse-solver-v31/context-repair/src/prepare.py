"""New fixed exact-context cohort. Public identities only; historical TRAIN exposure disclosed."""
import copy,hashlib,itertools,json,sys,importlib.util,os
from pathlib import Path
from state_identity import game_key
from data_access import SafeInputs
B=Path(__file__).resolve().parents[1];P=B.parent;W=P/'v31-rootcause-01TLQer7';A=P/'hv31-eval-acquisition-01a1e479';O=P/'hv31-context-repair-01a1e479'
SEED='HV31-TAIL-REPAIR-20261117-v1'
def _input_gate():
 expected=os.environ.get('HV31_INPUT_MANIFEST_SHA256','')
 if len(expected)!=64:raise PermissionError('explicit pinned data-access manifest required; historical research is closed')
 manifest=B/'DATA-ACCESS.json'
 if manifest.is_symlink():raise PermissionError('access manifest symlink refused')
 raw=manifest.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=expected:raise PermissionError('data-access manifest changed')
 return SafeInputs(json.loads(raw)['inputs'])
def _input_bytes(p):
 gate=_input_gate();name=str(Path(p));item=gate.entries.get(name)
 if item is None:raise PermissionError('input is not admitted; no read or hash')
 return gate.read(name,item['role'])
def sha(p):return hashlib.sha256(_input_bytes(p)).hexdigest()
def load(p):return json.loads(_input_bytes(p))
def write(p,x):
 with Path(p).open('x') as f:json.dump(x,f,indent=2,sort_keys=True);f.write('\n')
def order(s):return hashlib.sha256((SEED+':'+s).encode()).hexdigest()
def main():
 audit=load(B/'evidence/D4-public-pool-audit.json');old=load(O/'spec.json');pool=audit['classes'];selected=[]
 # One fresh canonical suit class on four deterministic distinct ranks/family.
 # Prefer never-used-in-old-repair TRAIN ranks; no answers inform this order.
 prior=set(audit['old_TRAIN_rank_signatures'])
 src=W/'flop5/D4/src/d4_census.py';sys.path.insert(0,str(src.parent));sp=importlib.util.spec_from_file_location('public_geometry',src);C=importlib.util.module_from_spec(sp);sp.loader.exec_module(C);U,pilot=C.universe()
 blocked=set(audit['excluded_global_rank_signatures']);geometry_ranks={r['sig'] for r in pool}|{j['meta']['sig'] for j in old if j['meta']['role']=='TRAIN'}
 def padding(reserved):
  pad={}
  for tc,ss in U.items():
   for sg,cs in ss.items():
    if sg not in geometry_ranks or sg in reserved or sg in blocked or C.excluded(sg) or sg in pilot:continue
    for bs in cs.values():
     for b in bs:pad.setdefault(tc,set()).update(''.join(b[k*2:k*2+2] for k in per) for per in itertools.permutations(range(3)))
  return {k:sorted(v) for k,v in pad.items() if len(v)>=57}
 skipped=[]
 for fam in ('PAIR','MONO','UNP2T','UNPR'):
  candidates=sorted((r for r in pool if r['family']==fam),key=lambda r:(r['sig'] in prior,order('eval-rank:'+r['sig']),order('eval-class:'+r['iso'])))
  family_ranks=set()
  for r in candidates:
   if r['sig'] in family_ranks:continue
   prospective=selected+[r];pd=padding({q['sig'] for q in prospective})
   if not all(q['texture_class'] in pd for q in prospective):
    skipped.append(dict(iso=r['iso'],reason='prospective TRAIN-only padding capacity'));continue
   selected.append(r);family_ranks.add(r['sig'])
   if len(family_ranks)==4:break
  assert len(family_ranks)==4,('insufficient geometry-safe family',fam)
 reserved={r['sig'] for r in selected};tr=[j for j in old if j['meta']['role']=='TRAIN' and j['meta']['sig'] not in reserved]
 assert len(tr)>60 and not {j['meta']['sig'] for j in tr}&reserved
 pad=padding(reserved)
 jobs=[]
 for r in selected:
  for pos in ('HJ','UTG'):
   j=copy.deepcopy(next(j for j in old if j['meta']['position']==pos and j['meta']['role']=='TRAIN'));sid='f5tail.EVAL.%s.%s.%s'%(pos,r['family'],r['iso']);j['id']=sid;j['phases'][0].pop('arms',None)
   j['meta'].update(role='EVAL',position=pos,family=r['family'],sig=r['sig'],iso=r['iso'],board=r['board'],texture_class=r['texture_class'],prior_flop_exposure='historical public TRAIN; possibly sibling class/rank labels and public padding; never-solved exact class/context')
   s=j['phases'][0]['scenario'];s.update(scenario_id=sid,flop_board=r['board']);j['meta']['game_key_sha256']=game_key(s);jobs.append(j)
 assert len(jobs)==32 and len({j['meta']['game_key_sha256'] for j in jobs})==32
 pins=dict(audit['input_pins']);pins[str(B/'evidence/D4-public-pool-audit.json')]=sha(B/'evidence/D4-public-pool-audit.json')
 oldproof=load(O/'features/PROVENANCE.json')
 for p,h in {**oldproof['features'],**oldproof['harvest']}.items():assert sha(p)==h;pins[p]=h
 for p in (O/'features/PROVENANCE.json',O/'CANDIDATE.json',O/'models/fit.json',O/'safe-padding-v2.json',O/'FREEZE.json',O/'evidence/TRAIN-result.json') :pins[str(p)]=sha(p)
 for p,h in load(O/'CANDIDATE.json')['files'].items():
  if '/models/' in p:pins[p]=h
 write(B/'spec.json',jobs);write(B/'safe-padding-v2.json',pad);write(B/'TRAIN-INPUTS.json',dict(source_root=str(O),job_ids=[j['id'] for j in tr],excluded_new_eval_ranks=sorted(reserved),provenance_sha256=sha(O/'features/PROVENANCE.json'),input_pins=pins,source_role='TRAIN_ONLY'))
 write(B/'evidence/design.json',dict(seed=SEED,counts={'EVAL':{f:8 for f in ('PAIR','MONO','UNP2T','UNPR')}},train_jobs=len(tr),evaluation_ranks=sorted(reserved),selected=selected,geometry_rejections=skipped,input_pins=pins,public_metadata_only=True,protected_answers_opened=False,scope='finite exact-context qualification; prior public TRAIN exposure disclosed; NOT globally unseen/rank-fresh certificate'))
 print(json.dumps(dict(TRAIN=len(tr),EVAL=32,pad_capacity={k:len(v) for k,v in pad.items()},selected=selected)))
if __name__=='__main__':main()
