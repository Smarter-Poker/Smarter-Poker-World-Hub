"""Public role identities only. Never opens an evaluation answer or private holdout."""
import copy, hashlib, importlib.util, itertools, json, re, sys
from pathlib import Path
B=Path(__file__).resolve().parents[1]
P=B.parent; W=P/'v31-rootcause-01TLQer7'; A=P/'hv31-eval-acquisition-01a1e479'
R=P/'hv31-flop5-recovery-01a1e479/r9-recovery'; N=P/'hv31-next-round-01a1e479'
SEED='HV31-CONTEXT-REPAIR-20261116-v1'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(Path(p).read_bytes())
def write(p,x):
    with Path(p).open('x') as f:json.dump(x,f,indent=2,sort_keys=True);f.write('\n')
def order(s):return hashlib.sha256((SEED+':'+s).encode()).hexdigest()
def main():
    pins={}
    def read(p):pins[str(p)]=sha(p);return load(p)
    n=read(N/'INPUTS.json')
    src=W/'flop5/D4/src/d4_census.py';pins[str(src)]=sha(src)
    assert pins[str(src)]==n['source_refs'][str(src)]
    sys.path.insert(0,str(src.parent));spec=importlib.util.spec_from_file_location('public_universe',src)
    C=importlib.util.module_from_spec(spec);spec.loader.exec_module(C)
    U,pilot=C.universe() # never C.census(), which would open private role files
    old={x['meta']['sig'] for x in read(A/'spec-APPROVED-v3.json')}
    f4={x['sig'] for x in read(W/'flop4/C3/plan/roles.json') if x['role']=='TRAIN'}
    w45={C.sig(j['phases'][0]['scenario']['flop_board']) for j in read(W/'flop2/W45/plan/jobs-TRAIN-80.json')}
    b8={C.sig(j['meta']['board']) for fn in ('jobs-TRIAL.json','jobs-TRAIN.json') for j in read(W/'flop3/B8B9B10/b8/plan'/fn)}
    d3meta=Path(n['spots']['F.cbet']['files']['meta.json']['path'])
    d3={C.sig(j['board']) for j in read(d3meta) if j['split']=='TRAIN'}
    # Public W45 planner CLS is Brbw={Brud,Bruc}, Mrbw={Mrud,Mruc}.
    w45domain={sg for tc in ('Brud','Bruc','Mrud','Mruc') for sg in U.get(tc,{})}
    r9=read(R/'research/FT/plan/boards.json');r9held=set()
    assert set(r9)=={'P1-Btud','P1-Mtud','P2-Btud','P2-Mtud'}
    for roles in r9.values():
        assert set(roles)=={'TRAIN','TEST'}
        for row in roles['TEST']:
            assert row['global_rank_multiset']==C.sig(row['board'])
            r9held.add(C.sig(row['board']))
    ep=R/'recon/flop/plan-dev-f1/batch-E/assembled/public-target-plan.json'
    pins[str(ep)]=sha(ep)
    eb=re.findall(r'"flop_board"\s*:\s*"((?:[2-9TJQKA][cdhs]){3})"',ep.read_text())
    assert len(eb)==342
    r9held.update(map(C.sig,eb))
    exam={C.sig(j['phases'][0]['scenario']['flop_board']) for j in read(W/'flop5/D2/jobs-D2-EXAM.json')}
    eligible=(w45|b8)&f4&d3-old-r9held-exam
    eligible={sg for sg in eligible if not C.excluded(sg) and sg not in pilot and (sg not in w45domain or sg in w45)}
    # One global rank role across all suit families and both ranges.
    role={};alloc={}
    for group,pred in (('paired',lambda sg:len(set(sg[2:]))<3),('unpaired',lambda sg:len(set(sg[2:]))==3)):
        ss=sorted(filter(pred,eligible),key=lambda sg:order('split:'+sg));nt=int(len(ss)*.64);nd=(len(ss)-nt)//2
        assert nt>=6 and nd>=2
        alloc[group]={'TRAIN':nt,'DEV':nd,'NEW_FINAL':len(ss)-nt-nd}
        for k,sg in enumerate(ss):role[sg]='TRAIN' if k<nt else 'DEV' if k<nt+nd else 'NEW_FINAL'
    # Padding is label-free TRAIN geometry only; never DEV/FINAL identities.
    pad={};choices={}
    for tc,ss in U.items():
        for sg,classes in ss.items():
            if sg not in eligible:continue
            if len(set(sg[2:]))<3 and tc[2]!='p':continue # exclude trips from this finite repair
            fam='PAIR' if tc[2]=='p' else 'MONO' if tc[1]=='m' else 'UNPR' if tc[1]=='r' else 'UNP2T'
            for iso,bs in classes.items():
                choices.setdefault((fam,sg),[]).append((tc,iso,min(bs)))
                if role[sg]=='TRAIN':
                    for b in bs:
                        pad.setdefault(tc,set()).update(''.join(b[2*k:2*k+2] for k in perm) for perm in itertools.permutations(range(3)))
    pad={tc:sorted(bs) for tc,bs in pad.items() if len(bs)>=57}
    template=read(W/'flop5/D3/jobs-D3-TRAIN-B2-A.json')[0]
    ranges=Path('/Volumes/SmarterWork/agent-work/shared-capacity/v31-r8-controller-01Gw7a/stage2/plan-r2/input-root')
    manifest=read(ranges.parent/'baseline-manifest.json')
    approved={(s['ip_range_path'],s['ip_range_checksum'],s['oop_range_path'],s['oop_range_checksum']) for s in manifest['scenarios']}
    jobs=[]
    for (fam,sg),opts in sorted(choices.items()):
        opts=[x for x in opts if x[0] in pad]
        if not opts:continue
        tc,iso,board=min(opts,key=lambda x:order('geometry:'+fam+':'+sg+':'+x[1]))
        for pos in ('HJ','UTG'):
            j=copy.deepcopy(template);sid='f5repair.%s.%s.%s.%s'%(role[sg],pos,fam,sg[2:]);j['id']=sid
            j['meta']={'role':role[sg],'position':pos,'family':fam,'sig':sg,'iso':iso,'board':board,'texture_class':tc,'depth_bb':200,'expected_children':template['meta']['expected_children'],'prior_flop_exposure':'historical TRAIN; new exact HJ/UTG 200bb state'}
            ph=j['phases'][0];ph.pop('arms',None);s=ph['scenario'];s.update(scenario_id=sid,flop_board=board,ip_position=pos,depth_bucket=150)
            for side,who in (('ip',pos.lower()),('oop','bb')):
                rel='ranges/r8.cash.6max.srp.80.%s-open.bb-call.%s-%s.txt'%(pos.lower(),side,who)
                s[side+'_range_path']=rel;s[side+'_range_checksum']=sha(ranges/rel);pins[str(ranges/rel)]=sha(ranges/rel)
            assert tuple(s[k] for k in ('ip_range_path','ip_range_checksum','oop_range_path','oop_range_checksum')) in approved
            key={k:v for k,v in s.items() if k not in ('scenario_id','depth_bucket','purpose')}
            j['meta']['game_key_sha256']=hashlib.sha256(json.dumps(key,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            jobs.append(j)
    assert len(jobs)==len({j['meta']['game_key_sha256'] for j in jobs})
    counts={r:{f:sum(j['meta']['role']==r and j['meta']['family']==f for j in jobs) for f in ('PAIR','MONO','UNP2T','UNPR')} for r in ('TRAIN','DEV','NEW_FINAL')}
    assert all(v>=4 for fs in counts.values() for v in fs.values())
    for path in (W/'flop2/W45/src/flop2_plan.py',W/'flop3/B8B9B10/b8/src/b8_plan.py',W/'flop4/C3/src/f4_pool.py',R/'research/FT/src/ft_plan.py') :pins[str(path)]=sha(path)
    write(B/'spec.json',jobs);write(B/'safe-padding-v2.json',pad)
    write(B/'evidence/design.json',dict(seed=SEED,counts=counts,eligible_signatures=sorted(eligible),global_rank_roles=role,allocation=alloc,excluded_old80=sorted(old),r9_public_test_exclusion_count=len(r9held),w45_possible_held_domain='rank signatures in universe Brud/Bruc/Mrud/Mruc unless public W45TRAIN',input_pins=pins,labels_read=False,solver_launchable=False,scope='fresh exact context; prior TRAIN flop exposure; original globally unseen certificate BLOCKED_ZERO'))
    print(json.dumps(dict(counts=counts,ranks=len(eligible),jobs=len(jobs),pad_capacity={tc:len(bs) for tc,bs in pad.items()})))
if __name__=='__main__':main()
