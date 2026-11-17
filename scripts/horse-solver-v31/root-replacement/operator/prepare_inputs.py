"""Prospective TRAIN-only input preparation; closed after a freeze exists."""
def main():
 from pathlib import Path
 if (Path("/Volumes/SmarterWork/agent-work/extreme-capacity/hv31-root-replacement-01a1e479")/"FREEZE.json").exists():raise PermissionError("frozen experiment; preparation closed")
 import sys,json,hashlib,itertools,copy,shutil
 from pathlib import Path
 B=Path('/Volumes/SmarterWork/agent-work/extreme-capacity/hv31-root-replacement-01a1e479');P=B.parent;D=P/'hv31-pipeline-repair-01a1e479';O=P/'hv31-context-repair-01a1e479';T=P/'hv31-tail-repair-01a1e479';S=Path('/Volumes/SmarterWork/agent-work/shared-capacity');C=S/'v31-r8-controller-01Gw7a';R9=S/'v31-r9-successor';FT=R9/'research/FT';PIPE=R9/'hub-527842f9/scripts/horse-solver-v31'
 sys.path.insert(0,str(B/'src'));from data_access import SafeInputs
 sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();order=lambda s:hashlib.sha256(('HV31-ROOT-REPLACEMENT-20261117-v1:'+s).encode()).hexdigest()
 old=json.loads((D/'TRAIN-AUDIT-INPUTS.json').read_text());gate=SafeInputs(old['inputs']);ids=set(old['job_ids']);inputs={}
 def pin(p,role,h=None):
  p=Path(p).resolve();v=sha(p)
  if h is not None:assert v==h,str(p)
  inputs[str(p)]={'role':role,'sha256':v};return str(p)
 jobs={}
 for path in old['train_jobs']:
  for j in gate.json(path,'TRAIN'):
   assert j['meta']['role']=='TRAIN'
   if j['id'] in ids:assert j['id'] not in jobs;jobs[j['id']]=j
 assert set(jobs)==ids
 for p,v in old['inputs'].items():
  if v['role']=='TRAIN' and ('/features/_encode/' in p or '/m1/' in p or '/ranges/' in p):pin(p,'TRAIN',v['sha256'])
 for p in old['models']['prior_context'].values():pin(p,'MODEL',old['inputs'][p]['sha256'])
 labels=json.loads((D/'evidence/ROOT-frequency-label-preparation.json').read_text());assert labels['jobs']==88 and labels['nodes']==352
 label_map={}
 for r in labels['files']:
  assert r['id'] in ids;pin(r['path'],'TRAIN',r['sha256']);label_map.setdefault(r['id'],{})[r['spot']]=r
 ranks=sorted({j['meta']['sig'] for j in jobs.values()},key=lambda s:order('fold:'+s));folds={s:i%3 for i,s in enumerate(ranks)}
 families=('PAIR','MONO','UNP2T','UNPR');pools={f:sorted({j['meta']['sig'] for j in jobs.values() if j['meta']['family']==f},key=lambda s:order('sample:'+s)) for f in families}
 family_order=sorted(families,key=lambda f:(len(pools[f]),f))
 def choose(k,used,chosen):
  if k==4:return chosen if {folds[s] for ss in chosen.values() for s in ss}=={0,1,2} else None
  f=family_order[k]
  for pair in itertools.combinations(pools[f],2):
   if set(pair)&used:continue
   x=choose(k+1,used|set(pair),{**chosen,f:pair})
   if x:return x
 sample_ranks=choose(0,set(),{});assert sample_ranks,'prospective globally distinct TRAIN capacity'
 selected=[]
 for f in families:
  for sig in sample_ranks[f]:
   for pos in ('HJ','UTG'):
    options=[j for j in jobs.values() if j['meta']['family']==f and j['meta']['sig']==sig and j['meta']['position']==pos];assert options
    selected.append(sorted(options,key=lambda j:order('class:'+j['id']))[0]['id'])
 assert len(selected)==16 and len({jobs[j]['meta']['sig'] for j in selected})==8
 missing=[dict(id=jid,spot=sp) for jid in sorted(ids) for sp in ('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr') if sp not in old['encoder_rows'].get(jid,{})];assert len(missing)==60 and all(x['spot']=='F.vs_xr' for x in missing)
 controls=sorted((dict(id=j,spot='F.vs_xr') for j in ids if 'F.vs_xr' in old['encoder_rows'].get(j,{})),key=lambda x:order('parity:'+x['id']))[:6]
 shutil.copy2(T/'src/context_encode.py',B/'src/context_encode.py');shutil.copy2(T/'safe-padding-v2.json',B/'safe-padding-v2.json');pin(B/'safe-padding-v2.json','TRAIN')
 # Explicit public producer graph. No old FREEZE/census/role/heldout generators.
 for name in ('producer-source-lock.json','encoder-source-lock.json'):
  q=FT/'locks'/name;pin(q,'SOURCE')
  for r in json.loads(q.read_text())['files']:pin(r['path'],'SOURCE',r['sha256'])
 public=[C/'src/build_caches.py',C/'stage2/study-identity.json',C/'stage2/request-r1/physics_protocol.json']
 public += [C/'stage2/plan-r2'/name for name in ('planning-receipt.json','source_partition.json','baseline-manifest.json')]
 R7=S/'v31-r7-training-design-01a17e88';public += [R7/'public-range-57-v1/source-lock.json',R7/'public-range-57-v1/batch57-schema.json']
 lock=json.loads((R7/'public-range-57-v1/source-lock.json').read_text())
 for sub,names in [('public-range-current-wtl-v1',('current_wtl.py','current-wtl-schema.json')),('public-range-terminal-wtl-v1',('terminal_wtl.py','terminal_wtl','terminal_wtl.cpp','terminal-wtl-schema.json','build-receipt.json'))]:
  for name in names:pin(R7/sub/name,'SOURCE',lock['external_dependencies'][str(R7/sub/name)])
 for q in public:pin(q,'SOURCE')
 # Assembly reads only approved public ROOT ranges from this public authority.
 original=json.loads((C/'stage2/plan-r2/baseline-manifest.json').read_text());root=C/'stage2/plan-r2/input-root'
 for s in original['scenarios']:
  for side in ('ip','oop'):pin(root/s[side+'_range_path'],'TRAIN',s[side+'_range_checksum'])
 config=dict(format='HV31_ROOT_TRAIN_REPLACEMENT_V1',inputs=inputs,jobs=jobs,job_ids=sorted(ids),labels=label_map,existing_encoder_rows=old['encoder_rows'],ranges=old['ranges'],baseline_models=old['models']['prior_context'],folds=folds,selected_ids=selected,missing=missing,parity_controls=controls,seed='HV31-ROOT-REPLACEMENT-20261117-v1',sample_global_ranks_distinct=True)
 SafeInputs(inputs)
 with (B/'INPUTS.json').open('x') as f:json.dump(config,f,indent=2,sort_keys=True);f.write('\n')
 print(dict(allowed_files=len(inputs),jobs=len(jobs),ranks=len(ranks),missing=len(missing),controls=len(controls),validation_games=len(selected),folds_sampled=sorted({folds[jobs[j]['meta']['sig']] for j in selected})))

if __name__=="__main__":main()
