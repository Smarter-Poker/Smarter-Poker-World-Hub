#!/usr/bin/env python3
"""Label-free exact246 encoder using frozen public TRAIN-only padding.

Real targets use the original public hist215-v2 ROOT-range pipeline. Every pad
comes from safe-padding-v2.json: public TRAIN geometry, the same texture and
context, with all new EVAL ranks and historical protected domains excluded.
Permuting/relabeling an EVAL target is never a padding source. The maintained
class_pads_first parameter must remain True; False refuses before encoding.
Outputs are real target combo_indices/X arrays plus inspectable inventory.
No solver outputs or evaluation answers are read by this module.
"""
import copy, hashlib, itertools, json, os, subprocess, sys, uuid
from pathlib import Path
import numpy as np
S = Path('/Volumes/SmarterWork/agent-work/shared-capacity'); C = S / 'v31-r8-controller-01Gw7a'; R9 = S / 'v31-r9-successor'
FT = R9 / 'research/FT'; HUB = R9 / 'hub-527842f9'; PIPE = HUB / 'scripts/horse-solver-v31'; CA = FT / 'ca-75b60118'
PY314 = '/Volumes/SmarterWork/agent-work/extreme-capacity/hv31-flop5-recovery-01a1e479/venv/bin/python'
sys.dont_write_bytecode = True; sys.path.insert(0, str(PIPE))
import final_public215_training as T
import pio_upi, public_hist215 as codec
SHA = lambda b: hashlib.sha256(b).hexdigest(); need = T.need
need(SHA((PIPE / 'final_public215_training.py').read_bytes()) == '2740d2efc8888d2e22e1088ac21ac0e102d22619cc7b4dde5791c482bccf3a3d', 'trainer bytes')
need(SHA((PIPE / 'pio_upi.py').read_bytes()) == 'f97d90c2cd075a7f052bbc31ac39d17aa25029b242cda6e9b62a4632d4acc671', 'pio_upi bytes')
CONTRACT_SHA = 'bf5c919ac5fbd0a8e94335a615a6f30761f27477a690292ce20da4c6592d95f1'   # FT contract hash carried as plan_sha256 in the inventory, as ft_features.py does
PLAN = C / 'stage2/plan-r2'; W = 246; N = 57
R = '23456789TJQKA'; sig = lambda b: str(len(b) // 2) + ':' + ''.join(sorted(b[::2], key=R.index))
cards = lambda b: [b[i:i + 2] for i in range(0, len(b), 2)]
PERMS = list(itertools.permutations('cdhs'))
def relabel(sn, flop_order, perm):
    mp = {'cdhs'[i]: perm[i] for i in range(4)}; f = lambda c: c[0] + mp[c[1]]
    s = copy.deepcopy(sn); t = s['targets'][0]
    fl = [f(c) for c in cards(s['flop_board'])]; fl = ''.join(fl[i] for i in flop_order)
    node = ':'.join(f(tok) if (len(tok) == 2 and tok[0] in R and tok[1] in 'cdhs') else tok for tok in t['node'].split(':'))
    s['flop_board'] = fl; t['node'] = node; t['board'] = fl + ''.join(f(c) for c in cards(t['board'])[3:])
    return s
def pads_for(chunk, need_n, used, cid, ctx, tag):
    # Pads are exclusively drawn from the frozen TRAIN geometry allowlist.
    # No permutation or relabel of a real EVAL target is admitted as padding.
    out = []
    if need_n:
        x0 = chunk[0]; tc = pio_upi.texture_class(x0['target']['board'][:6])
        for b in _class_supply(tc):
            if len(out) == need_n: break
            if b in used: continue
            s = copy.deepcopy(x0['scenario']); t = s['targets'][0]; s['flop_board'] = b; t['board'] = b + t['board'][6:]
            s['scenario_id'] = 'f3b8pad.%s.%s.%d' % (tag, cid[:12], len(used)); t['target_id'] = s['scenario_id'] + '.target'
            if pio_upi.target_context(s, t) != ctx: continue
            used.add(t['board']); out.append({'scenario': s, 'target': t, 'context': ctx, 'cid': cid, 'pad': True, 'class_pad': True})
    need(len(out) == need_n, 'pad capacity')
    return out
CLASS_FIRST = [False]; _SUPPLY = {}
def _class_supply(tc):
    # Supplemental context transfer: pads are restricted to the same public TRAIN,
    # non-heldout/non-exam allowlist as real targets. No historical role reader.
    p = Path(__file__).resolve().parent / 'safe-padding-v2.json'
    if tc not in _SUPPLY:
        all_safe = json.loads(p.read_bytes())
        need(tc in all_safe and len(all_safe[tc]) >= 57, 'safe pad capacity')
        _SUPPLY[tc] = all_safe[tc]
    return _SUPPLY[tc]
def encode(items, OUT, tag='f2', class_pads_first=True):
    need(class_pads_first is True, 'TRAIN-only padding is mandatory'); CLASS_FIRST[0] = True; OUT = Path(OUT); OUT.mkdir(parents=True, exist_ok=False); (OUT / 'rows').mkdir()
    real = []
    for it in items:
        sn = copy.deepcopy(it['scenario']); t = copy.deepcopy(it['target']); sn['targets'] = [t]
        if t.get('node_role') is None:   # label-free: role/facing come from the public line alone
            ln = pio_upi.analyze_node(t['node'], root_pot_chips=sn['pot_chips'], effective_stack_chips=sn['effective_stack_chips'], preflop_aggressor=sn['preflop_aggressor_solver_player'])
            t.update(node_role=ln.node_role, facing_kind=ln.facing_kind, facing_size_bucket=ln.facing_size_bucket)
        ctx = pio_upi.target_context(sn, t); real.append({'scenario': sn, 'target': t, 'context': ctx, 'cid': codec.digest(ctx)})
    need(len({x['target']['target_id'] for x in real}) == len(real), 'unique target ids')
    groups = {}
    for x in real: groups.setdefault(x['cid'], []).append(x)
    chunks = {cid: [sorted(xs, key=lambda x: x['target']['target_id'])[i:i + N] for i in range(0, len(xs), N)] for cid, xs in sorted(groups.items())}
    rounds = max(len(v) for v in chunks.values()); res = json.load(open(PLAN / 'planning-receipt.json'))
    index = {'targets': {}, 'batches': []}; env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    def write(p, v):
        b = (json.dumps(v, sort_keys=True, separators=(',', ':')) + '\n').encode(); p.write_bytes(b); return SHA(b)
    for rd in range(rounds):
        B = OUT / ('b%02d' % rd); B.mkdir(); ctxs = []
        for cid, ch in sorted(chunks.items()):
            if rd >= len(ch): continue
            sel = list(ch[rd]); used = {x['target']['board'] for x in sel}
            need(len(used) == len(sel), 'distinct real boards per context')
            sel += pads_for(ch[rd], N - len(sel), used, cid, sel[0]['context'], tag)
            ctxs.append({'context_id': cid, 'context': sel[0]['context'], 'cell_key': 'f2|' + tag + '|' + cid[:12],
                         'selected': [{'board': x['target']['board'], 'fold': None, 'global_rank_multiset': sig(x['target']['board']), 'pad': bool(x.get('pad')),
                                       'draft_scenario': x['scenario']} for x in sel]})
        order = [{'target_id': g['selected'][i]['draft_scenario']['targets'][0]['target_id'], 'context_id': g['context_id'],
                  'global_rank_multiset': g['selected'][i]['global_rank_multiset'], 'full_icm_table_identity': None} for i in range(N) for g in ctxs]
        inv_sha = write(B / 'inventory.json', {'contract': 'smarter-poker.r9-ft-pilot-dev-inventory.v57', 'dev_only': True, 'batch': B.name, 'plan_sha256': CONTRACT_SHA,
                                              'planned_targets': N * len(ctxs), 'count_per_context': N, 'contexts': ctxs, 'solver_labels_read': False, 'M2_labels_read': False, 'M2_seed_read': False})
        write(B / 'execution-order.json', order)
        write(B / 'source_partition.json', {'format': 'public_hist215_source_partition_protocol_v1', 'dev_only': True, 'public_seed': json.load(open(PLAN / 'source_partition.json'))['public_seed'],
                                            'training_contexts': [{'context_id': g['context_id'], 'context': g['context'], 'rank_signatures': sorted(r['global_rank_multiset'] for r in g['selected'])} for g in ctxs]})
        write(B / 'planning-receipt.json', {'format': 'r9_ft_pilot_dev_planning_receipt_v1', 'dev_only': True, 'input_root': str(PLAN / 'input-root'),
                                            'reservation': res['reservation'], 'baseline_manifest': {'path': str(PLAN / 'baseline-manifest.json'), 'sha256': '243f207f2e03902afb31f6baa8b7ca51c46130de24c3fa29dc594e04221b5293'},
                                            'range_bundle': {'sha256': 'bb779f5e20cacc70356dfdc4b0d09211e781b3dd977f656fd21b9839c271b080'}})
        subprocess.run([PY314, '-B', str(C / 'src/build_caches.py'), str(B), str(HUB), str(B / 'wtl'), inv_sha], check=True, env=env, stdout=open(B / 'wtl.log', 'w'), stderr=subprocess.STDOUT)
        f = lambda p: {'path': str(p), 'sha256': SHA(Path(p).read_bytes())}
        acfg = {'format': 'public_hist215_feature_request_assembly_v2', 'source_namespace': str(uuid.uuid5(uuid.NAMESPACE_URL, 'flop2-w45-dev:' + str(B))),
                'pins': {'contexts': len(ctxs), 'm1_per_context': N, 'inventory_contract': 'smarter-poker.r9-ft-pilot-dev-inventory.v57', 'scenario_id_prefix': 'r93f', 'feature_contract_version': 'holdem-public-hist215-v2'},
                'inventory': f(B / 'inventory.json'), 'execution_order': f(B / 'execution-order.json'), 'source_partition': f(B / 'source_partition.json'),
                'original_manifest': f(PLAN / 'baseline-manifest.json'), 'input_root': str(PLAN / 'input-root'), 'pipeline_root': str(PIPE),
                'pipeline_source_lock': f(FT / 'locks/producer-source-lock.json'), 'encoder_source_lock': f(FT / 'locks/encoder-source-lock.json'),
                'physics_protocol': f(C / 'stage2/request-r1/physics_protocol.json'), 'cache_schema': f(B / 'wtl/batch-schema.json'),
                'current': f(B / 'wtl/public-current-wtl-features.json'), 'terminal': f(B / 'wtl/public-terminal-wtl-features.json')}
        need(acfg['physics_protocol']['sha256'] == '2be1611960f9cb2abd2adf1d7d9ca5a194626bfbc603cdead24cebb55fd158a0', 'physics')
        (B / 'assembly-config.json').write_text(json.dumps(acfg, indent=1, sort_keys=True) + '\n')
        subprocess.run([PY314, '-B', str(CA / 'server/scripts/prepare-public215-feature-request.py'), '--config', str(B / 'assembly-config.json'),
                        '--config-sha256', SHA((B / 'assembly-config.json').read_bytes()), '--output', str(B / 'assembled')], check=True, env=env, stdout=open(B / 'assemble.log', 'w'), stderr=subprocess.STDOUT)
        req = B / 'assembled/public-feature-request.json'
        subprocess.run(['node', '--import', 'tsx', 'src/scripts/buildPublicHist215Features.ts', '--request', str(req), '--request-sha256', SHA(req.read_bytes()), '--output', str(B / 'matrices')],
                       check=True, cwd=CA / 'server', env=env, stdout=open(B / 'encode.log', 'w'), stderr=subprocess.STDOUT)
        tp = json.load(open(B / 'assembled/public-target-plan.json')); cache_of = {e['target_id']: e['cache_target_id'] for e in tp['entries']}
        byid = {x['target']['target_id']: x for x in real}; idx = json.load(open(B / 'matrices/public-feature-index.json')); nreal = 0
        for g in idx['contexts']:
            M = np.asarray(T.public_matrix({**g, 'feature_count': W}))
            for row in g['rows']:
                tid = cache_of[row['target_id']]
                if tid not in byid: continue
                x = byid[tid]; need(row['board'] == x['target']['board'], 'board map')
                ci = np.asarray(row['combo_indices'], dtype=np.int64); Xr = np.array(M[row['offset']:row['offset'] + len(ci)], dtype=np.float64)
                need(Xr.shape == (len(ci), W) and np.isfinite(Xr).all(), 'row block')
                np.savez(OUT / 'rows' / (tid + '.npz'), combo_indices=ci, X=Xr)
                index['targets'][tid] = {'batch': B.name, 'context_id': g['context_id'], 'context': x['context'], 'board': x['target']['board'], 'node': x['target']['node'], 'rows': int(len(ci))}
                nreal += 1
            del M
        index['batches'].append({'batch': B.name, 'contexts': len(ctxs), 'real': nreal, 'matrix_shas': {g['context_id']: g['matrix_sha256'] for g in idx['contexts']}})
        for p in list((B / 'matrices').glob('*.npy')) + list((B / 'wtl').glob('public-*-wtl-features.json')): p.unlink()
    need(len(index['targets']) == len(real), 'every real target encoded once')
    (OUT / 'index.json').write_text(json.dumps(index, indent=1)); return index
if __name__ == '__main__':
    items = json.loads(Path(sys.argv[1]).read_bytes()); ix = encode(items, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'f2')
    print(json.dumps({'targets': len(ix['targets']), 'batches': ix['batches']}))
