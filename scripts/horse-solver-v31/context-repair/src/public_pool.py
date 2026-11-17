"""Metadata-only admission audit; never invokes a census or opens a private role file."""
import ast,hashlib,importlib.util,json,re,sys
from pathlib import Path
B=Path(__file__).resolve().parents[1];P=B.parent;W=P/'v31-rootcause-01TLQer7';O=P/'hv31-context-repair-01a1e479';R=P/'hv31-flop5-recovery-01a1e479/r9-recovery'
pins={}
def read(p):
 p=Path(p); assert not any(x in str(p).upper() for x in ('FINAL-DO-NOT','FINAL-RESERVED'))
 b=p.read_bytes();pins[str(p)]=hashlib.sha256(b).hexdigest();return json.loads(b)
def source(p):
 p=Path(p);b=p.read_bytes();pins[str(p)]=hashlib.sha256(b).hexdigest();return b.decode()
def main():
 src=W/'flop5/D4/src/d4_census.py';source(src);sys.path.insert(0,str(src.parent));s=importlib.util.spec_from_file_location('public_universe',src);C=importlib.util.module_from_spec(s);s.loader.exec_module(C);U,pilot=C.universe()
 pool=read(W/'flop5/D4/plan/pool-train.json');assert all(r['role']=='TRAIN_CANDIDATE' and 'heldout' not in r['categories'] and not r['solved_g200'] for r in pool)
 old=read(O/'evidence/design.json');oldjobs=read(O/'spec.json');blocked=set(old['excluded_old80'])|{sg for sg,ro in old['global_rank_roles'].items() if ro!='TRAIN'}
 f4=read(W/'flop4/C3/plan/roles.json');blocked|={r['sig'] for r in f4 if r['role']!='TRAIN'}
 cen=read(W/'flop4/C3/plan/census.json');fresh={sg for tc,ss in U.items() for sg,cs in ss.items() if not C.excluded(sg) and sg not in pilot and any(i not in set(cen['used_iso']) for i in cs)}
 blocked|=fresh-{r['sig'] for r in f4}
 w45={C.sig(j['phases'][0]['scenario']['flop_board']) for j in read(W/'flop2/W45/plan/jobs-TRAIN-80.json')}
 b8root=W/'flop3/B8B9B10/b8';b8={C.sig(j['meta']['board']) for fn in ('jobs-TRIAL.json','jobs-TRAIN.json') for j in read(b8root/'plan'/fn)}
 tree=ast.parse(source(b8root/'src/b8_plan.py'));fam=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='FAM' for t in n.targets))
 bd={sg for tcs in fam.values() for tc in tcs for sg in U.get(tc,{})};wd={sg for tc in ('Brud','Bruc','Mrud','Mruc') for sg in U.get(tc,{})}
 blocked|=(bd-w45-b8)|(wd-w45)
 r9=read(R/'research/FT/plan/boards.json');blocked|={C.sig(r['board']) for v in r9.values() for r in v['TEST']}
 eb=re.findall(r'"flop_board"\s*:\s*"((?:[2-9TJQKA][cdhs]){3})"',source(R/'recon/flop/plan-dev-f1/batch-E/assembled/public-target-plan.json'));assert len(eb)==342;blocked|=set(map(C.sig,eb))
 blocked|={C.sig(j['phases'][0]['scenario']['flop_board']) for j in read(W/'flop5/D2/jobs-D2-EXAM.json')}
 oldclass={(j['meta']['family'],j['meta']['sig'],j['meta']['iso']) for j in oldjobs}
 n=read(P/'hv31-next-round-01a1e479/INPUTS.json');d3meta=read(n['spots']['F.cbet']['files']['meta.json']['path']);public_train_ranks={C.sig(r['board']) for r in d3meta if r['split']=='TRAIN'}|{r['sig'] for r in pool}
 candidates=[]
 for tc,ss in U.items():
  for sg,cs in ss.items():
   if sg not in public_train_ranks:continue
   fam='PAIR' if tc[2]=='p' else 'MONO' if tc[1]=='m' else 'UNPR' if tc[1]=='r' else 'UNP2T'
   if len(set(sg[2:]))<3 and tc[2]!='p':continue
   for iso,bs in cs.items():candidates.append(dict(family=fam,sig=sg,iso=iso,texture_class=tc,board=min(bs)))
 allowed=[]
 for r in candidates:
  sg=r['sig'];assert C.sig(r['board'])==sg and C.iso(r['board'])==r['iso']
  if sg in blocked or C.excluded(sg) or sg in pilot or len(set(sg[2:]))<2:continue
  if (r['family'],sg,r['iso']) in oldclass:continue
  allowed.append(r)
 out={'scope':'fresh exact context, historically exposed public TRAIN classes; NOT globally unseen flops','classes':allowed,'excluded_global_rank_signatures':sorted(blocked),'input_pins':pins,'old_TRAIN_rank_signatures':sorted(sg for sg,ro in old['global_rank_roles'].items() if ro=='TRAIN'),'protected_answer_files_opened':False}
 (B/'evidence/D4-public-pool-audit.json').write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
 print(json.dumps({f:{'classes':sum(r['family']==f for r in allowed),'ranks':sorted({r['sig'] for r in allowed if r['family']==f}),'new_ranks':sorted({r['sig'] for r in allowed if r['family']==f}-set(out['old_TRAIN_rank_signatures']))} for f in ('PAIR','MONO','UNP2T','UNPR')},indent=2))
if __name__=='__main__':main()
