#!/usr/bin/env python3
"""FLOP-2 W4/W5 feature builder: driver harvest outputs (f1_m1_driver.py format: phases[0].harvest[spot] = {node, actor, actions, matchups,
policy_ev_chips, range, frequencies{code:[1326]}, action_ev_chips{code:[1326]}}) -> FEAT/<spot>/{X,Y,w}.npy + meta.json + summary.json, the FT/feat layout.
Encoder depth_bucket = the runtime snapDepthBucket(stack bb) (80 -> 80, 200 -> 150), NOT the job's depth_bucket label; effective stack stays the solved one.
X: hist215-v2 rows regenerated through the real encoder chain (flop2_encode.encode: label-free, public state + hand; FT regeneration check exact).
Row selection and labels follow pio_upi.harvest_node + final_public215_training.parse_official_node/training_arrays exactly:
  matchups rounded to 1e-8 (positive mass never erased), live = matchup > 0, frequencies = pio_upi._normalized_frequencies, EV = chips / chips_per_bb rounded 1e-6,
  actions = sorted(expected children), Y = [policy, action EV x A, frequency x A], w = raw matchups of the live rows (FT stores raw; normalize at fit time).
Validity (FT contract): acting player's node range mass after board removal >= 1e-3 of its ROOT mass, and >= 1 live row; invalid nodes are counted, not used.
FINAL jobs are refused unless --final is given (and then written under a separate FEAT root you pass); no fitting script may read FINAL.
usage: OMP_NUM_THREADS=1 venv/bin/python -I -B flop2_features.py --jobs J1.json [J2.json ...] --harvest DIR [DIR ...] --out FEAT_ROOT [--final]"""
import argparse, json, sys, hashlib
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent; sys.path.insert(0, str(HERE))
sys.path.append('/Volumes/SmarterWork/agent-work/extreme-capacity/v31-rootcause-01TLQer7/flop4/C3/src')   # D3 Amendment 2 (import path only): flop2_encode._class_supply imports the FLOP-4 C3 census module f4_census, which sat beside this file in FLOP-4 (read only, unchanged)
import context_encode as E
import pio_upi
from contract import load_range_vector
from pio_upi import COMBO_CARDS
need = E.need; SHA = E.SHA
INPUT_ROOT = E.PLAN / 'input-root'
a = argparse.ArgumentParser(); a.add_argument('--jobs', nargs='+', required=True); a.add_argument('--harvest', nargs='+', required=True)
a.add_argument('--out', required=True); a.add_argument('--final', action='store_true'); a.add_argument('--spots', default='F.cbet,F.vs_b33,F.vs_b75,F.vs_xr')
args = a.parse_args(); OUT = Path(args.out); need(not OUT.exists(), 'new FEAT root required'); OUT.mkdir(parents=True)
SPOTS = args.spots.split(',')
jobs = [j for f in args.jobs for j in json.loads(Path(f).read_bytes())]
need(not args.final and all(j.get('meta', {}).get('role') == 'TRAIN' and j['id'].startswith('f5repair.TRAIN.') for j in jobs), 'ONLY new frozen TRAIN jobs admitted')
from prepare import B, sha
frozen = json.loads((B / 'FREEZE.json').read_bytes())
for path, digest in frozen['files'].items(): need(sha(path) == digest, 'frozen input drift')
planned = {j['id']: j for j in json.loads((B / 'spec.json').read_bytes()) if j['meta']['role'] == 'TRAIN'}
need(len(jobs) == len(planned) and len({j['id'] for j in jobs}) == len(jobs) and {j['id'] for j in jobs} == set(planned) and all(j == planned[j['id']] for j in jobs), 'exact unique frozen TRAIN job set')
from score import technical
from common import validate_train_paths
validate_train_paths(args.jobs, args.harvest)
technical('TRAIN') # actual A2/source/job/convergence/memory gate BEFORE harvest use
def find(jid):
    for d in args.harvest:
        p = Path(d) / (jid + '.json')
        if p.exists(): return json.loads(p.read_bytes())
    return None
def snap(stack_bb):   # CA engine GtoPostflop.snapDepthBucket: the runtime context bucket (200 bb -> 150); hist215 col 32 = bucket, col 98 = stack in bb
    return 40 if not stack_bb > 0 else 10 if stack_bb <= 12 else 20 if stack_bb <= 30 else 40 if stack_bb <= 60 else 80 if stack_bb <= 110 else 150
def enc_scenario(s):
    return dict(s, depth_bucket=snap(s['effective_stack_chips'] / s['chips_per_bb']))
root_cache = {}
def root_vec(s, side):
    k = s[side + '_range_checksum']
    if k not in root_cache:
        p = INPUT_ROOT / s[side + '_range_path']; need(SHA(p.read_bytes()) == k, 'ROOT range bytes'); root_cache[k] = load_range_vector(p)
    return root_cache[k]
census = {'jobs': len(jobs), 'missing_output': [], 'failed_output': [], 'invalid_nodes': [], 'nodes': 0}
nodes = []   # (job, spot, scenario, target, harvest)
for j in jobs:
    r = find(j['id'])
    if r is None: census['missing_output'].append(j['id']); continue
    if r.get('status') != 'ok': census['failed_output'].append(j['id']); continue
    ph = j['phases'][0]; s = ph['scenario']; hv = r['phases'][0]['harvest']
    need(r['phases'][0]['rake'] == s['rake'] and r['phases'][0]['solve_accuracy'] == s['solve_accuracy'], 'output matches job scenario')
    exp = (j.get('meta') or {}).get('expected_children', {})
    for spot in SPOTS:
        spec = next((h for h in ph['harvest'] if h['name'] in (spot, spot.replace('F.', ''))), None)
        if spec is None: continue
        h = hv[spec['name']]; need(h['node'] == spec['node'] and h['actor'] == spec['actor'], 'harvest node/actor')
        need('action_ev_chips' in h and 'matchups' in h, 'full harvest (not harvest_optional) at ' + spot)
        kids = pio_upi.analyze_node(h['node'], root_pot_chips=s['pot_chips'], effective_stack_chips=s['effective_stack_chips'], preflop_aggressor=s['preflop_aggressor_solver_player'])
        if spot in exp: need(sorted(exp[spot]) == sorted(h['actions']), 'solver children == planned tree children ' + j['id'] + spot)
        t = {'target_id': j['id'] + '.' + spot + '.0.target', 'machine_id': 'M1', 'node': h['node'], 'board': s['flop_board'], 'node_role': kids.node_role,
             'facing_kind': kids.facing_kind, 'facing_size_bucket': kids.facing_size_bucket, 'expected_children': list(h['actions'])}
        # validity (FT contract)
        actor = 1 if h['actor'] == 'IP' else 0; blocked = set(E.cards(s['flop_board']))
        rv = root_vec(s, 'ip' if actor else 'oop'); live_mask = [not blocked.intersection(COMBO_CARDS[i]) for i in range(1326)]
        root_mass = sum(w for w, m in zip(rv, live_mask) if m); node_mass = sum(w for w, m in zip(h['range'], live_mask) if m)
        if not (root_mass > 0 and node_mass >= 1e-3 * root_mass and any(x > 0 for x in h['matchups'])):
            census['invalid_nodes'].append([j['id'], spot, node_mass / root_mass if root_mass else None]); continue
        nodes.append((j, spot, enc_scenario(s), t, h))
census['nodes'] = len(nodes)
need(nodes, 'no valid nodes')
# label-free encoder rows (one encode call per spot; contexts are split inside by depth / texture subclass)
rows = {}
for spot in SPOTS:
    items = [{'scenario': s, 'target': t} for (j, sp, s, t, h) in nodes if sp == spot]
    if not items: continue
    ix = E.encode(items, OUT / '_encode' / spot, tag=spot)
    for tid in ix['targets']: rows[tid] = OUT / '_encode' / spot / 'rows' / (tid + '.npz')
def labels(s, t, h):
    acts_pio = list(h['actions']); board = set(E.cards(t['board'])); cpb = s['chips_per_bb']
    mu = []
    for i, w in enumerate(h['matchups']):
        bl = bool(board.intersection(COMBO_CARDS[i]))
        need(not (bl and abs(w) > 1e-7), 'blocked combo with matchups')
        nw = 0.0 if bl else round(w, 8)
        if not bl and w > 0 and nw == 0: nw = w
        mu.append(nw)
    live = [x > 0 for x in mu]
    fr = pio_upi._normalized_frequencies({a_: h['frequencies'][a_] for a_ in acts_pio}, live)
    acts = sorted(acts_pio); positive = [i for i in range(1326) if live[i]]
    pol, aev, frq = [], [], []
    for i in positive:
        av = [round(h['action_ev_chips'][a_][i] / cpb, 6) for a_ in acts]; pv = round(h['policy_ev_chips'][i] / cpb, 6)
        need(np.isfinite(pv) and all(np.isfinite(av)), 'finite EV'); mixed = sum(fr[a_][i] * av[k] for k, a_ in enumerate(acts))
        need(abs(pv - mixed) <= 0.02, 'policy EV vs action-frequency EV')
        pol.append(pv); aev.append(av); frq.append([fr[a_][i] for a_ in acts])
    line = pio_upi.analyze_node(t['node'], root_pot_chips=s['pot_chips'], effective_stack_chips=s['effective_stack_chips'], preflop_aggressor=s['preflop_aggressor_solver_player'])
    specs = [pio_upi._action_spec(a_, line, s['effective_stack_chips']) for a_ in acts]
    sizes = [sp['size_value'] if sp['family'] in ('bet', 'raise') else None for sp in specs]
    return positive, acts, sizes, np.asarray([mu[i] for i in positive]), np.column_stack((np.asarray(pol), np.asarray(aev), np.asarray(frq)))
summary = {'census': census, 'spots': {}}
for spot in SPOTS:
    Xs, Ys, ws, meta = [], [], [], []
    for (j, sp, s, t, h) in nodes:
        if sp != spot: continue
        z = np.load(rows[t['target_id']]); ci = z['combo_indices']; pos_of = {int(c): k for k, c in enumerate(ci)}
        positive, acts, sizes, w, Y = labels(s, t, h)
        need(all(i in pos_of for i in positive), 'source support outside public ROOT mask')
        X = np.ascontiguousarray(z['X'][[pos_of[i] for i in positive]], dtype=np.float64)
        need(X.shape == (len(positive), E.W) and Y.shape == (len(positive), 1 + 2 * len(acts)) and np.isfinite(X).all() and np.isfinite(Y).all(), 'arrays')
        m = j.get('meta') or {}
        meta.append({'scenario_id': j['id'], 'config': 'P%d-%s-%d' % (s['table_size'] == 6 and 2 or 1, m.get('class', '?'), s['effective_stack_chips'] // s['chips_per_bb']), 'class': m.get('class'),
                     'texture_class': pio_upi.texture_class(t['board']), 'depth_bb': s['effective_stack_chips'] // s['chips_per_bb'], 'encoder_depth_bucket': s['depth_bucket'], 'split': m.get('role'), 'index': m.get('index'), 'spot': spot, 'j': 0,
                     'board': t['board'], 'street': 'flop', 'actor': h['actor'], 'node': t['node'], 'context_id': E.codec.digest(pio_upi.target_context(dict(s, targets=[t]), t)),
                     'rows': int(X.shape[0]), 'actions': acts, 'sizes': sizes, 'positive': positive, 'rake': s['rake']})
        Xs.append(X); Ys.append(Y); ws.append(w)
    if not meta: continue
    D = OUT / spot; D.mkdir()
    X = np.concatenate(Xs); Y = np.concatenate(Ys); w = np.concatenate(ws)
    np.save(D / 'X.npy', X); np.save(D / 'Y.npy', Y); np.save(D / 'w.npy', w); (D / 'meta.json').write_text(json.dumps(meta))
    summary['spots'][spot] = {'nodes': len(meta), 'rows': int(X.shape[0]), 'X_sha256': SHA((D / 'X.npy').read_bytes()), 'Y_sha256': SHA((D / 'Y.npy').read_bytes())}
    (D / 'summary.json').write_text(json.dumps(summary['spots'][spot], indent=1))
(OUT / 'summary.json').write_text(json.dumps(summary, indent=1)); print(json.dumps({k: v for k, v in summary['spots'].items()}), json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in census.items()}))
proof = {'freeze_sha256': sha(B / 'FREEZE.json'), 'source_sha256': sha(__file__), 'role': 'TRAIN', 'job_ids': sorted(planned), 'features': {}, 'harvest': {}}
for sp in summary['spots']:
    for fn in ('X.npy', 'Y.npy', 'w.npy', 'meta.json'):
        path = OUT / sp / fn; proof['features'][str(path)] = sha(path)
for directory in args.harvest:
    for jid in planned:
        path = Path(directory) / (jid + '.json')
        if path.exists(): proof['harvest'][str(path)] = sha(path)
need(len(proof['harvest']) == len(planned), 'exact TRAIN output source set')
with (OUT / 'PROVENANCE.json').open('x') as f: json.dump(proof, f, indent=2, sort_keys=True)
