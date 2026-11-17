"""Read only explicitly admitted TRAIN artifacts; never fit or qualify a model."""
import argparse
import io
import hashlib
import json
import sys
from pathlib import Path
import joblib
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_access import SafeInputs

SPOTS = ('F.cbet', 'F.vs_b33', 'F.vs_b75', 'F.vs_xr')

def combo_cards():
    # Independent inverse of the triangular source index, with explicit anchors.
    deck = [r+s for r in '23456789TJQKA' for s in 'cdhs']
    result = []
    for index in range(1326):
        high = 1
        while (high+1)*high//2 <= index:
            high += 1
        low = index-high*(high-1)//2
        result.append((deck[low], deck[high]))
    assert result[0] == ('2c','2d') and result[-1] == ('Ah','As')
    assert len(set(result)) == 1326
    return result

def probabilities(x):
    x = np.asarray(x, dtype=float)
    if x.ndim != 2 or x.shape[1] < 2 or not np.isfinite(x).all() or np.any(x < 0) or np.any(x > 1) or not np.allclose(x.sum(1),1,rtol=0,atol=1e-7):
        raise ValueError('invalid probability matrix')
    return x

def normalized_prediction(model, x):
    y = np.column_stack([h.predict(x) for h in model['heads']])
    if not np.isfinite(y).all():
        raise ValueError('nonfinite prediction')
    y = np.clip(y,0,1)
    if np.any(y.sum(1) <= 0):
        raise ValueError('zero prediction mass')
    return probabilities(y/y.sum(1,keepdims=True))

def clipped(f):
    f = probabilities(f)
    g = np.where(f < .05,0,f)
    g[g.sum(1) == 0] = f[g.sum(1) == 0]
    return probabilities(g/g.sum(1,keepdims=True))

def serialized(f, places=9):
    f = probabilities(f)
    out=[]
    for row in f.tolist():
        largest = max(range(len(row)),key=row.__getitem__)
        q=[round(v,places) for v in row]
        q[largest]=round(1-sum(v for k,v in enumerate(q) if k != largest),places)
        out.append(q)
    return probabilities(out)

def projected(q, f):
    # Diagnostic reproduction of the rejected recipe, never a new target fit.
    f=probabilities(f);gap=q.max(1,keepdims=True)-q
    bad=(gap*f).sum(1) > .006;mask=gap <= .006
    g=f*mask;mass=g.sum(1,keepdims=True)
    g=np.divide(g,mass,out=mask/mask.sum(1,keepdims=True),where=mass>0)
    out=f.copy();out[bad]=g[bad]
    return probabilities(out)

def metrics(f, teacher, q, weights):
    f=probabilities(f);w=weights/weights.sum()
    return dict(tv=float(w@(.5*np.abs(f-teacher).sum(1))),
                conditional_regret_bb=float(w@np.maximum(0,q.max(1)-(q*f).sum(1))))

def root_frequency_labels(harvest, root_indices, actions):
    """Frequency-only TRAIN labels retain ROOT-live zero-matchup strategies.

    No action EV projection or opponent-matchup filter. This is an alternative
    label constructor for a future frozen experiment, not a qualified fitter.
    """
    if len(set(root_indices))!=len(root_indices) or set(actions)!=set(harvest['actions']):
        raise ValueError('ROOT/action identity mismatch')
    f=np.column_stack([harvest['frequencies'][a] for a in actions])[root_indices]
    if not np.isfinite(f).all() or np.any(f<0) or np.any(f>1) or np.any(abs(f.sum(1)-1)>.02):
        raise ValueError('ROOT teacher strategy unavailable; no invented fallback')
    return probabilities(f/f.sum(1,keepdims=True))

def validate_whole_seat_selection(evidence, expected_groups):
    """TRAIN validation is a prerequisite, never permission for live play."""
    if evidence.get('role') != 'TRAIN_VALIDATION' or evidence.get('raw_teacher_oracle') is not False:
        raise ValueError('TRAIN model-only evidence required')
    if evidence.get('held_out_global_ranks') is not True or evidence.get('technical_pass') is not True:
        raise ValueError('grouped technical validation required')
    rows=evidence.get('rows',[])
    if {r['group'] for r in rows} != set(expected_groups) or len(rows) != len(expected_groups)*2:
        raise ValueError('complete grouped whole-seat coverage required')
    if {(r['group'],r['seat']) for r in rows} != {(g,s) for g in expected_groups for s in ('IP','OOP')}:
        raise ValueError('unique both-seat evidence required')
    if any(not np.isfinite(r['upper_pct']) or r['upper_pct']<0 for r in rows):
        raise ValueError('invalid whole-seat endpoint')
    return max(r['upper_pct'] for r in rows)

def run(config):
    gate=SafeInputs(config['inputs']);jobs={}
    for p in config['train_jobs']:
        for j in gate.json(p,'TRAIN'):
            if j['meta']['role']!='TRAIN':raise ValueError('nonTRAIN job')
            if j['id'] in config['job_ids']:
                if j['id'] in jobs:raise ValueError('duplicate TRAIN job')
                jobs[j['id']]=j
    if set(jobs)!=set(config['job_ids']):raise ValueError('TRAIN identity mismatch')
    combos=combo_cards();models={}
    for name,ps in config['models'].items():
        models[name]={k:joblib.load(io.BytesIO(gate.read(p,'MODEL'))) for k,p in ps.items()}
    harvest={jid:gate.json(p,'TRAIN') for jid,p in config['harvest'].items()}
    rows=[];node_checks=0;largest_identity=0.;range_cache={}
    for sp in SPOTS:
        d=config['features'][sp]
        x,y,w=[np.load(io.BytesIO(gate.read(d[k],'TRAIN')),allow_pickle=False) for k in ('X','Y','w')]
        meta=gate.json(d['meta'],'TRAIN');offset=0
        for m in meta:
            n=m['rows'];ix=slice(offset,offset+n);offset+=n;jid=m['scenario_id']
            if jid not in jobs:continue
            j=jobs[jid];s=j['phases'][0]['scenario'];h=harvest[jid]['phases'][0]['harvest'][sp]
            if m['split']!='TRAIN' or m['node']!=h['node'] or m['actor']!=h['actor']:raise ValueError('node/actor mismatch')
            if s['chips_per_bb']!=100 or s['pot_chips']!=600 or s['effective_stack_chips']!=20000:raise ValueError('physical game changed')
            expected_actor='IP' if sp in ('F.cbet','F.vs_xr') else 'OOP'
            if h['actor']!=expected_actor or sorted(h['actions'])!=m['actions']:raise ValueError('action/seat contract')
            expected_nodes={'F.cbet':'r:0:c','F.vs_b33':'r:0:c:b198','F.vs_b75':'r:0:c:b450','F.vs_xr':'r:0:c:b198:b594'}
            if h['node']!=expected_nodes[sp]:raise ValueError('unexpected public node')
            block={s['flop_board'][k:k+2] for k in range(0,6,2)}
            range_path=config['ranges'][jid][expected_actor]
            if range_path not in range_cache:
                raw=gate.read(range_path,'TRAIN').decode().strip();range_cache[range_path]=np.asarray(json.loads(raw) if raw.startswith('[') else list(map(float,raw.split())))
            rv=range_cache[range_path];root=np.array([i for i,c in enumerate(combos) if rv[i]>0 and not block.intersection(c)])
            positive=np.array(m['positive']);mu=np.asarray(h['matchups']);p=np.array([i for i,c in enumerate(combos) if mu[i]>0 and not block.intersection(c)])
            if not np.array_equal(p,positive) or not set(p)<=set(root):raise ValueError('combo support mismatch')
            enc=np.load(io.BytesIO(gate.read(config['encoder_rows'][jid][sp],'TRAIN')),allow_pickle=False)
            ci=enc['combo_indices'];fullx=enc['X'];positions={int(c):i for i,c in enumerate(ci)}
            if not np.array_equal(ci,root) or not np.array_equal(x[ix],fullx[[positions[int(i)] for i in p]]):raise ValueError('actual encoder/feature alignment')
            if fullx.shape!=(len(root),246) or not np.isfinite(fullx).all():raise ValueError('invalid encoder matrix')
            if not np.all(fullx[:,32]==150) or not np.all(fullx[:,98]==200):raise ValueError('bucket/physical stack features')
            a=len(m['actions']);q=y[ix,1:1+a];teacher=y[ix,1+a:];probabilities(teacher)
            rawf=np.column_stack([h['frequencies'][act] for act in m['actions']])[p];rawf=rawf/rawf.sum(1,keepdims=True)
            if np.max(abs(rawf-teacher))>2e-8:raise ValueError('harvest frequency/action alignment')
            q0=np.column_stack([h['action_ev_chips'][act] for act in m['actions']])[p]/100
            if np.max(abs(q-q0))>5.01e-7:raise ValueError('chip to bb alignment')
            ev=np.asarray(h['policy_ev_chips'])[p]/100
            identity=float(np.max(abs(ev-(q*teacher).sum(1))));largest_identity=max(largest_identity,identity)
            if identity>.020001:raise ValueError('policy EV identity')
            ww=np.asarray(w[ix]);assert np.allclose(ww,mu[p],rtol=0,atol=5.1e-9)
            stages={'teacher':teacher,'projected_teacher':projected(q,teacher)}
            for name,ms in models.items():
                model=ms[j['meta']['position']+'/'+sp+'.joblib']
                if model['actions']!=m['actions']:raise ValueError('model action order')
                raw=normalized_prediction(model,x[ix]);clip=clipped(raw);tab=serialized(clip);wire=np.array([[float('%.8f'%v) for v in row] for row in tab])
                stages.update({name+'_raw':raw,name+'_r05':clip,name+'_table9':tab})
                if np.max(abs(wire-tab))>5.01e-9 or np.max(abs(wire.sum(1)-1))>1.01e-8:raise ValueError('wire precision')
            row=dict(id=jid,spot=sp,family=j['meta']['family'],position=j['meta']['position'],root_hands=len(root),train_hands=n,root_hands_missing=len(root)-n,
                     root_weight_omitted=float(1-rv[p].sum()/rv[root].sum()),
                     zero_teacher_reach_hands=int((np.asarray(h['range'])[root]<=0).sum()),
                     stages={k:metrics(f,teacher,q,ww) for k,f in stages.items()})
            rows.append(row);node_checks+=1
        if offset!=len(x) or len(y)!=len(x) or len(w)!=len(x):raise ValueError('feature offsets')
    coverage=[]
    admitted_nodes={(r['id'],r['spot']) for r in rows}
    for jid,j in jobs.items():
        board=j['phases'][0]['scenario']['flop_board'];block={board[k:k+2] for k in range(0,6,2)}
        for sp in SPOTS:
            h=harvest[jid]['phases'][0]['harvest'][sp];rv=range_cache[config['ranges'][jid][h['actor']]]
            root=np.array([i for i,c in enumerate(combos) if rv[i]>0 and not block.intersection(c)])
            fr=np.column_stack([h['frequencies'][act] for act in sorted(h['actions'])])[root]
            mu=np.asarray(h['matchups'])[root];reach=np.asarray(h['range'])[root]
            if not np.isfinite(fr).all() or np.any(fr < -1e-9):raise ValueError('ROOT teacher frequency invalid')
            coverage.append(dict(id=jid,spot=sp,trained_node=(jid,sp) in admitted_nodes,root_hands=len(root),
                                 zero_matchup_hands=int((mu<=0).sum()),zero_own_reach_hands=int((reach<=0).sum()),
                                 teacher_frequency_missing_hands=int((abs(fr.sum(1)-1)>.02).sum())))
    summary={}
    for sp in SPOTS:
        rs=[r for r in rows if r['spot']==sp]
        summary[sp]=dict(nodes=len(rs),missing_root_hands=sum(r['root_hands_missing'] for r in rs),root_hands=sum(r['root_hands'] for r in rs),
                        max_omitted_root_weight=max(r['root_weight_omitted'] for r in rs),
                        mean_stages={k:{v:float(np.mean([r['stages'][k][v] for r in rs])) for v in ('tv','conditional_regret_bb')} for k in rs[0]['stages']})
    return dict(verdict='PASS_TRAIN_PIPELINE_CHECKS',jobs=len(jobs),nodes=node_checks,max_policy_identity_error_bb=largest_identity,summary=summary,rows=rows,coverage=coverage,
                model_measurement='IN_SAMPLE_TRAIN_DIAGNOSTIC_ONLY',whole_seat_qualification=False,live_play=False)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--config',required=True);ap.add_argument('--config-sha256',required=True);ap.add_argument('--out',required=True);args=ap.parse_args()
    raw=Path(args.config).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=args.config_sha256:raise ValueError('input admission changed')
    config=json.loads(raw);result=run(config)
    with Path(args.out).open('x') as stream:json.dump(result,stream,indent=2);stream.write('\n')
    print(json.dumps({k:v for k,v in result.items() if k!='rows'}))

if __name__=='__main__':main()
