# Supplemental synchronous deadline derivative; original preserved SHA256 a3bfeb9608c4b4a385210a7ee20311d7aa659c6073aa7e783fc7909283bdacc8
#!/usr/bin/env python3
"""FLOP-4 A2 DRIVER v2 + FIX-1 (W/flop4/AUDIT/FIX-1-MACHINERY.md; blocks marked "FIX-1"; the storage rule itself is unchanged): one driver per output
folder (f4_m1 run lock, exit 3 when held); a finished session is recognised only from an output that parses and carries a status (an unparsable one is
moved aside to <id>.json.corrupt and its session re-runs); each output is written atomically (temp file, then os.replace) and records the sha256 of
the job file, this driver, f4_storage.py, f1_readback.py and f4_m1.py under "provenance"; any other exception fails only its session (status failed
with a traceback tail; SystemExit stays fatal). A --spare relaunch re-runs only sessions WITHOUT an output: a failed session keeps its record and
needs a new output name and job file after diagnosis.
FIX-1B (W/flop4/AUDIT/FIX-1B.md): the run lock is an OS lock held for the driver's lifetime (f4_m1, review R1); two sessions in a row that fail
through the catch-all stop the driver with exit 4 so later sessions stay unrun and spare-eligible (review R7). The storage rule is unchanged.
FLOP-4 A2 DRIVER v2 (review corrections 2 and 3, blocks marked "f4 v2": frozen drift ledger after a snapshot taken with drift present; incident
log carries pot, stack, root weights and root ranges; session wash flag and wash_cured records). v1 text follows unchanged.
FLOP-4 A2 DRIVER = FLOP-3 lock driver (W/flop3/B8B9B10/f3_lock_driver.py, sha256 ac4f06c6...) plus the blocks marked "f4 addition": the
strategy-storage rule of W/flop4/A2/STORAGE-RULE.md (f4_storage.py). After a write and one retry, a read-back mismatch above 1e-6 is judged: within the
bound the STORED strategy is adopted (it is what calc_results scores) and logged; an arm write outside the bound fails ONLY that arm (pr['arms_failed']);
a restore mismatch is carried as base drift charged to every later arm, and when the drift is outside the bound the session stops as
status 'partial_storage' with the completed arms kept and the remaining arms listed (pr['arms_not_run']). Option --wash (default off, measurement only).
FLOP-3 B9/B10 LOCK DRIVER = FLOP-2 W10 pilot driver (W/flop2/W10/pilot/f2_m1_driver.py) plus the blocks marked "f3 addition":
(1) lock_node / unlock_node are refused EXCEPT inside a phase's declared "exploit" block (EXPLOIT_ON); force_line stays refused everywhere.
(2) phase key "exploit": after the phase's harvest and arms (which run on the untouched equilibrium), writes the opponent's tendency tables at the declared
    nodes, locks them, records calc_results (the horse's equilibrium strategy against the tendency opponent; the horse's in-tree best-response value MES),
    re-solves in chunks of "go N steps" until the horse's EV moves less than tol_chips or max_chunks is reached, checks every lock still reads back,
    captures the horse's re-solved strategy at the declared capture nodes into the job's captured store (for later phases), and marks the phase tainted.
(3) arm spec types "tendency" (the declared transform of THIS phase's equilibrium strategy at an opponent node) and "blend" (equilibrium mixed with a
    captured strategy, weight lambda); arm key "capture_ranges" (show_range at given nodes while the arm's writes are in place).
(4) phase key "expect_eq_of": the named earlier phase's pre-lock equilibrium values must be reproduced within 2 x accuracy x pot (else the job fails).
FLOP-2 W10 pilot driver = FLOP-1 M1 driver (flop1/f1_m1_driver.py) plus ONE addition: phase key harvest_natural (see the block marked f2 addition).\nFLOP-1 M1 driver (development only; no gateway, DB, M2). One Pio process. A job = ordered phases; a phase = one solve (setup_commands of the pinned
pipeline), optional captures/harvests, then arms. An arm writes strategies at one or more nodes from the UNTOUCHED solution, reads calc_results, restores every
node and verifies restoration. No lock_node, no go after the phase solve. Read-back is compared on hands live for the acting player and ENFORCED (f1_readback).
python -B f1_m1_driver.py --pipeline-root P --inputs I --jobs JOBS.json --out DIR --threads N"""
import argparse, json, subprocess, sys, time
import atexit, hashlib, os, traceback   # FIX-1
from pathlib import Path
MANIFEST_SHA = '3a0ba3efc51735c9a9cc586f3d664fc06d9588005d185cd8f8a5d77fc183bc62'; PIO = r'C:\PioSOLVER\PioSOLVER3-pro.exe'
a = argparse.ArgumentParser()
for k in ('--pipeline-root', '--inputs', '--jobs', '--out'): a.add_argument(k, required=True)
a.add_argument('--threads', type=int, required=True); a.add_argument('--wash', action='store_true')   # f4 addition: --wash
args = a.parse_args()
EXPLOIT_ON = [False]   # f3 addition: lock_node/unlock_node allowed only while an exploit block runs
sys.dont_write_bytecode = True; pipe = Path(args.pipeline_root).resolve(); sys.path.insert(0, str(pipe / 'scripts' / 'horse-solver-v31')); sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract import load_manifest, load_range_vector, sha256_file
from pio_upi import PioProcess, PioSetupSession, PioError, setup_commands, parse_calc_results, parse_strategy, parse_children, parse_calc_ev, parse_vector
import pio_upi as _actual_upi
from native_telemetry import instrument,pinned_upi,capture_failure,aggregate_exit
_UPI_PROVENANCE=pinned_upi(_actual_upi)
PioProcess,NativeCommandTimeout=instrument(PioProcess,PioError)
from f1_readback import enforce_readback
import f4_storage as st4   # f4 addition
class StorageStop(Exception): pass   # f4 addition
from pio_upi import COMBO_CARDS   # f3 addition (rootlive_minus)
m = load_manifest(Path(args.inputs) / 'manifests' / 'public215-r8-cash.json', expected_checksum=MANIFEST_SHA, input_root=args.inputs, pipeline_root=pipe)
assert sha256_file(Path(PIO)) == m.raw['solver_binary_checksum']
_jobs_bytes = Path(args.jobs).read_bytes(); jobs = json.loads(_jobs_bytes); out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
assert hashlib.sha256((Path(__file__).resolve().parent / 'context_deadline.py').read_bytes()).hexdigest() == '6cd7a49c25df3e7a2c99c1334beb18e6acb2d4e15607630967374e2d06bb801b', 'deadline source drift'
from context_deadline import Deadline
BUDGET = Deadline()
import f4_m1   # FIX-1: run lock: one driver per output folder (findings 1, 2)
try: LOCK = f4_m1.acquire(out)
except f4_m1.LockHeld as e_: print('[f4] REFUSED:', e_, flush=True); sys.exit(3)
atexit.register(f4_m1.release, out, LOCK)
_here = Path(__file__).resolve().parent   # FIX-1: provenance recorded in every session output (finding 6)
PROV = {'deadline_sha256': '6cd7a49c25df3e7a2c99c1334beb18e6acb2d4e15607630967374e2d06bb801b', 'driver_sha256': f4_m1.sha256_file(Path(__file__).resolve()), 'jobs_sha256': hashlib.sha256(_jobs_bytes).hexdigest(), 'storage_sha256': f4_m1.sha256_file(_here / 'f4_storage.py'),
        'readback_sha256': f4_m1.sha256_file(_here / 'f1_readback.py'), 'm1helper_sha256': f4_m1.sha256_file(_here / 'f4_m1.py'), 'upi_source_sha256':_UPI_PROVENANCE['sha256'], 'upi_source_path':_UPI_PROVENANCE['path'], 'telemetry_sha256':f4_m1.sha256_file(_here/'native_telemetry.py')}
def write_output(path, text):   # FIX-1: atomic (finding 4): a killed driver never leaves a truncated <id>.json
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'w') as f: f.write(text); f.flush(); os.fsync(f.fileno())
    for k_ in range(20):   # Windows refuses a replace while another process holds the target open (for example a copy in progress): retry
        try: os.replace(tmp, path); return
        except PermissionError:
            if k_ == 19: raise
            time.sleep(1.0)
def finished_ids(out):   # FIX-1 (finding 4): only an output that parses and carries a status counts as done; others are moved aside and re-run
    done = set()
    for p in sorted(out.glob('*.json.tmp')) + sorted(out.glob('*.json')):
        try:
            O = json.loads(p.read_bytes()) if p.suffix == '.json' else None
            if isinstance(O, dict) and O.get('id') == p.stem and 'status' in O: done.add(p.stem); continue
        except ValueError: pass
        k = 0; dst = p.with_name(p.name + '.corrupt')
        while dst.exists(): k += 1; dst = p.with_name('%s.corrupt%d' % (p.name, k))
        os.replace(p, dst); print('[f4] unusable output moved aside, its session re-runs:', dst.name, flush=True)
    return done
def start():
    proc = PioProcess(Path(PIO), expected_solver_version=m.raw['solver_version'], expected_hand_order=m.source_combo_order); sent = []
    def raw(cmd, t=None):
        v = cmd.split(' ', 1)[0]
        if v == 'force_line' or (v in ('lock_node', 'unlock_node') and not EXPLOIT_ON[0]): raise SystemExit('forbidden command ' + v)   # f3 addition: lock only in exploit
        try: timeout = BUDGET.timeout(t if t is not None else (7200.0 if v in ('go', 'wait_for_solver', 'build_tree') else 300.0))
        except TimeoutError as e:
            proc.command_context=dict(command=v,timeout_seconds=0.,error_type='SessionDeadlineExpired',error=str(e))
            raise PioError(str(e)) from e
        sent.append(v); return proc.command(cmd, timeout)
    raw('set_threads %d' % args.threads); return proc, PioSetupSession(raw), sent
proc, pio, sent = start()
def ws_kb():
    try:
        r = subprocess.run(['tasklist', '/FI', 'PID eq %d' % proc._process.pid, '/FO', 'CSV', '/NH'], capture_output=True, text=True, timeout=20).stdout
        return int(r.strip().split('","')[-1].strip('"').replace(' K', '').replace(',', '').replace('.', ''))
    except Exception: return None
def results(): return parse_calc_results(pio('calc_results'))
def rng_of(player, node): return parse_vector(pio('show_range %s %s' % (player, node)), allow_nan=False, label='range')
def tendency_table(S, children, codes, rg, spec, aev=None):   # f3 addition
    """Opponent tendency at one node: move the aggregate frequency of ONE action (spec action) from its equilibrium value A to the target (spec p, or A +
    spec delta, clipped to [0, 1]); aggregate = sum over the actor's node range (weights rg) of the per-hand frequency. rule proportional: every hand moves
    by the same fraction (more: s + a(1 - s), others scaled by 1 - a; less: s x t/A, the freed mass to the other actions in proportion, or to 'to' if
    none). rule ev_margin: hands are moved in order of the equilibrium action-EV margin (more of the action: hands where it costs least first; less of it:
    hands where the best other action is closest first, freed mass to that best other action). Returns (new strategy, info)."""
    t = spec['tendency']; act = t['action']; k = codes.index(act); cp = children[k]; live = [i for i in range(1326) if rg[i] > 0]; Wt = sum(rg[i] for i in live)
    A = sum(rg[i] * S[cp][i] for i in live) / Wt; tgt = t['p'] if 'p' in t else A + t['delta']; tgt = min(max(tgt, 0.0), 1.0)
    N = {ch: list(S[ch]) for ch in children}; others = [ch for ch in children if ch != cp]
    to = children[codes.index(t['to'])] if t.get('to') in codes else others[0]
    if t.get('rule', 'proportional') == 'proportional':
        for i in live:
            s0 = S[cp][i]
            if tgt >= A:
                a = (tgt - A) / (1 - A) if A < 1 else 0.0; N[cp][i] = s0 + a * (1 - s0)
                for ch in others: N[ch][i] = S[ch][i] * (1 - a)
            else:
                b = tgt / A if A > 0 else 1.0; freed = s0 * (1 - b); N[cp][i] = s0 * b; rest = 1 - s0
                for ch in others: N[ch][i] = S[ch][i] + (freed * S[ch][i] / rest if rest > 1e-12 else (freed if ch == to else 0.0))
    else:
        assert aev is not None, 'ev_margin needs action EVs'
        best = {i: max(others, key=lambda ch: aev[ch][i]) for i in live}; margin = {i: aev[best[i]][i] - aev[cp][i] for i in live}
        need_m = (tgt - A) * Wt
        if need_m >= 0:
            for i in sorted(live, key=lambda i: (margin[i], i)):
                if need_m <= 1e-15: break
                cap = rg[i] * (1 - S[cp][i]);
                if cap <= 0: continue
                f = min(1.0, need_m / cap); need_m -= f * cap; N[cp][i] = S[cp][i] + f * (1 - S[cp][i])
                for ch in others: N[ch][i] = S[ch][i] * (1 - f)
        else:
            need_m = -need_m
            for i in sorted(live, key=lambda i: (-margin[i], i)):
                if need_m <= 1e-15: break
                cap = rg[i] * S[cp][i]
                if cap <= 0: continue
                f = min(1.0, need_m / cap); need_m -= f * cap; moved = S[cp][i] * f; N[cp][i] = S[cp][i] - moved; N[best[i]][i] = S[best[i]][i] + moved
    for i in live:
        z = sum(N[ch][i] for ch in children)
        for ch in children: N[ch][i] = min(max(N[ch][i] / z, 0.0), 1.0)
    got = sum(rg[i] * N[cp][i] for i in live) / Wt
    return N, {'action': act, 'rule': t.get('rule', 'proportional'), 'eq_aggregate': A, 'target': tgt, 'achieved': got,
               'eq_mix': {c.split(':')[-1]: sum(rg[i] * S[c][i] for i in live) / Wt for c in children}, 'new_mix': {c.split(':')[-1]: sum(rg[i] * N[c][i] for i in live) / Wt for c in children}}
def blend_table(S, children, codes, cap, lam):   # f3 addition: (1 - lambda) x equilibrium + lambda x captured, per hand
    assert sorted(cap) == sorted(codes), (sorted(cap), codes)
    return {ch: [(1 - lam) * S[ch][i] + lam * cap[code][i] for i in range(1326)] for ch, code in zip(children, codes)}
EQ_OF = {}   # f3 addition: job-level pre-lock equilibrium results per exploit phase name
restart_required = False
done = finished_ids(out); UNEXP = [0]   # FIX-1B (review R7): consecutive sessions failed through the catch-all
for job in jobs:
    sid = job['id']
    if sid in done: continue
    if restart_required:
        proc, pio, sent = start()
        restart_required = False
    BUDGET.begin()
    rec = {'id': sid, 'phases': [], 'solver_runs': 0, 'storage_rule': 'flop4-A2', 'storage_rule_rev': 2, 'wash': bool(args.wash), 'storage_incidents': [], 'provenance': PROV}; t00 = time.time(); captured = {}; EQ_OF.clear()
    try:
        for ph in job['phases']:
            s = ph['scenario']; t0 = time.time(); sent.clear(); pr = {'name': ph.get('name', ''), 'arms': {}, 'harvest': {}, 'solve_accuracy': s['solve_accuracy'], 'rake': s['rake']}; rec['phases'].append(pr)
            if 'ranges' in ph: oop_r, ip_r = ph['ranges']['oop'], ph['ranges']['ip']
            else: oop_r = load_range_vector(m.input_root / s['oop_range_path']); ip_r = load_range_vector(m.input_root / s['ip_range_path'])
            cmds = setup_commands(s, oop_r, ip_r)
            if any(c.startswith('force_line') for c in cmds): raise SystemExit('force_line in setup')
            rec['solver_runs'] += 1
            for c in cmds: pio(c)
            eq = results(); pr['eq'] = eq; pr['solve_s'] = round(time.time() - t0, 2); pr['ws_kb_after_solve'] = ws_kb()
            if eq['exploitability_chips'] / s['pot_chips'] > s['solve_accuracy'] + 1e-9: raise PioError('stopped above accuracy')
            if ph.get('expect_eq_of'):   # f3 addition: a fresh solve must reproduce the named exploit phase's pre-lock equilibrium (locks did not survive)
                e0 = EQ_OF[ph['expect_eq_of']]; tol = 2 * s['solve_accuracy'] * s['pot_chips']
                pr['eq_vs_' + ph['expect_eq_of']] = {k: eq[k] - e0[k] for k in ('ev_oop_chips', 'ev_ip_chips', 'oop_mes_chips', 'ip_mes_chips')}
                if any(abs(v) > tol for v in pr['eq_vs_' + ph['expect_eq_of']].values()): raise PioError('equilibrium not reproduced after exploit phase')
            p2c = proc._pio_to_canonical; saved = {}; drift = {}; frozen = []; cur = [None, None]   # f4 v2: per-phase restore drift ledger {node: bound_pct}, frozen-ledger nodes, write context
            def node_info(node, actor):
                if node not in saved:
                    ch = parse_children(pio('show_children ' + node), node); saved[node] = (ch, parse_strategy(pio('show_strategy ' + node), ch), rng_of(actor, node), actor)
                    # f4 v2 (review correction 2): a snapshot taken while restore drift is present may hold the drifted strategy (a suit twin shares the
                    # drifted node's storage), so a later 'exact' restore from it can put the drift back. From here on no ledger entry is removed in this phase.
                    if drift: frozen.append(node)
                return saved[node]
            for cap in ph.get('capture', []):
                ch, eqs, rg, _ = node_info(cap['node'], cap['actor']); captured[cap['name']] = {c.split(':')[-1]: list(eqs[c]) for c in ch}
            for hv in ph.get('harvest', []):
                node, actor = hv['node'], hv['actor']; ch, eqs, rg, _ = node_info(node, actor)
                ev, mu = parse_calc_ev(pio('calc_ev %s %s' % (actor, node)), label='policy EV'); H = {'node': node, 'actor': actor, 'actions': [c.split(':')[-1] for c in ch], 'matchups': mu, 'policy_ev_chips': ev, 'range': rg,
                     'frequencies': {c.split(':')[-1]: eqs[c] for c in ch}, 'action_ev_chips': {}}
                for c in ch:
                    code = c.split(':')[-1]; e2, _ = parse_calc_ev(pio('calc_ev %s %s:%s' % (actor, node, code)), label='action EV'); H['action_ev_chips'][code] = e2
                pr['harvest'][hv['name']] = H
            for hv in ph.get('harvest_optional', []):   # strategy and range only (no calc_ev: the node may be unreached)
                ch, eqs, rg, _ = node_info(hv['node'], hv['actor']); pr['harvest'][hv['name']] = {'node': hv['node'], 'actor': hv['actor'], 'actions': [c.split(':')[-1] for c in ch], 'range': rg,
                    'root_range': rng_of(hv['actor'], 'r:0'), 'frequencies': {c.split(':')[-1]: eqs[c] for c in ch}}
            if ph.get('harvest_natural'):   # f2 addition: natural-range harvest of flop/turn/river nodes, both players' node ranges, reach, threshold skip
                rootR = {pl: rng_of(pl, 'r:0') for pl in ('OOP', 'IP')}; pr['root_ranges'] = rootR
            for hv in ph.get('harvest_natural', []):
                node, actor = hv['node'], hv['actor']; other = 'IP' if actor == 'OOP' else 'OOP'
                ch, eqs, rg, _ = node_info(node, actor); ro = rng_of(other, node)
                ra = sum(rg) / sum(rootR[actor]); rb = sum(ro) / sum(rootR[other])
                H = {'node': node, 'actor': actor, 'actions': [c.split(':')[-1] for c in ch], 'reach_actor': ra, 'reach_opp': rb, 'min_reach': hv['min_reach']}
                if ra < hv['min_reach'] or rb <= 0:
                    H['skipped'] = 'reach below threshold'; pr['harvest'][hv['name']] = H; continue
                ev, mu = parse_calc_ev(pio('calc_ev %s %s' % (actor, node)), label='policy EV')
                H.update({'matchups': mu, 'policy_ev_chips': ev, 'range': rg, 'range_opp': ro, 'frequencies': {c.split(':')[-1]: eqs[c] for c in ch}, 'action_ev_chips': {}})
                for c in ch:
                    code = c.split(':')[-1]; e2, _ = parse_calc_ev(pio('calc_ev %s %s:%s' % (actor, node, code)), label='action EV'); H['action_ev_chips'][code] = e2
                pr['harvest'][hv['name']] = H
            if ph.get('list_children'): pr['children'] = {n: parse_children(pio('show_children ' + n), n, minimum_actions=1) for n in ph['list_children']}
            def write(node, S_, children, rg, rootlive=None):
                # rootlive: the actor's ROOT range. Used for whole-seat arms, where hands the solver never brought to this node can arrive after an upstream
                # write. Read-back is ENFORCED on hands live at the node (if any) and, when rootlive is given, ALSO enforced on every root-live hand.
                vals = []
                for ch in children: vals += ['%.8f' % S_[ch][p2c[i]] for i in range(1326)]
                live = rootlive if rootlive is not None else rg
                # f4 addition: write, read back, one retry (two identical attempts as in f3), optional wash; a mismatch is RETURNED, never raised and
                # never dropped: returns (err, n_live, mm, back) with mm None when exact (<= 1e-6) and the mismatch record otherwise. Callers must judge mm.
                attempts = [1, 2] + (['wash'] if args.wash else []); prev = None
                for attempt in attempts:
                    if attempt == 'wash': pio('set_strategy ' + node + ' ' + ' '.join(['%.8f' % (1.0 / len(children))] * (1326 * len(children))))
                    pio('set_strategy ' + node + ' ' + ' '.join(vals)); back = parse_strategy(pio('show_strategy ' + node), children)
                    mm = st4.mismatches(S_, back, live)   # ValueError when no hand is live (unchanged behaviour: the session fails)
                    if not mm['hands']:
                        if attempt == 'wash':   # f4 v2 (review correction 3): a wash that cured the mismatch is recorded (a uniform strategy was written to the tree first)
                            rec.setdefault('wash_cured', []).append({'phase': pr['name'], 'arm': cur[0], 'kind': cur[1], 'node': node, 'uniform_written_first': True, 'readback_after_wash': mm['err'],
                                'hands': [{'hand': h['hand'], 'cards': ''.join(COMBO_CARDS[h['hand']]), 'tv': h['tv'], 'written': {c.split(':')[-1]: x for c, x in h['written'].items()},
                                           'stored_before_wash': {c.split(':')[-1]: x for c, x in h['stored'].items()}} for h in prev['hands'][:25]]})
                            print('[f4-storage]', sid, pr['name'], cur[0], cur[1], node, 'wash_cured', 'hands', len(prev['hands']), flush=True)
                        return mm['err'], mm['n_live'], None, back
                    worst = max(((abs(back[c][i] - S_[c][i]), i, c.split(':')[-1], S_[c][i], back[c][i]) for c in children for i in range(1326) if live[i] > 0), key=lambda x: x[0])
                    rec.setdefault('readback_incidents', []).append({'node': node, 'attempt': attempt, 'worst': worst, 'mismatched_hands': len(mm['hands'])}); prev = mm
                return mm['err'], mm['n_live'], mm, back
            share_cache = {}; LIMIT = st4.limit_pct(s['solve_accuracy'])   # f4 addition (the per-phase restore drift ledger is defined with saved, above)
            def drift_total(): return sum(drift.values())
            def judge(mm, node, actor, kind, arm_name, used):   # f4 addition: bound and classify one mismatch; ALWAYS logged
                if actor not in share_cache:
                    other = 'IP' if actor == 'OOP' else 'OOP'; fb = s['flop_board']
                    ra_ = rng_of(actor, 'r:0'); ro_ = rng_of(other, 'r:0'); bc_ = [fb[k:k + 2] for k in range(0, len(fb), 2)]
                    mass_, z_ = st4.matchup_mass(ra_, ro_, COMBO_CARDS, bc_); share_cache[actor] = (st4.matchup_shares(ra_, ro_, COMBO_CARDS, bc_), ra_, mass_, z_)
                    # f4 v2 (review correction 3): once per phase with an incident, both root ranges and the matchup total, so the bound can be recomputed from this record alone
                    sr_ = pr.setdefault('storage_root', {'flop_board': fb, 'pot_chips': s['pot_chips'], 'effective_stack_chips': s['effective_stack_chips'], 'solve_accuracy': s['solve_accuracy'], 'ranges': {}, 'matchup_total': {}})
                    sr_['ranges'][actor] = ra_; sr_['ranges'][other] = ro_; sr_['matchup_total'][actor] = z_
                sh_, ra_, mass_, z_ = share_cache[actor]
                v = st4.judge(mm, sh_, s['pot_chips'], s['effective_stack_chips'], LIMIT, used)
                for h in v['hands']:
                    h['cards'] = ''.join(COMBO_CARDS[h['hand']]); h['written'] = {c.split(':')[-1]: x for c, x in h['written'].items()}; h['stored'] = {c.split(':')[-1]: x for c, x in h['stored'].items()}
                    h['root_weight'] = ra_[h['hand']]; h['opp_unblocked_weight'] = (mass_[h['hand']] / ra_[h['hand']]) if ra_[h['hand']] > 0 else 0.0   # share = root_weight x opp_unblocked_weight / matchup_total
                inc = dict(v, node=node, actor=actor, kind=kind, arm=arm_name, phase=pr['name'], wash=bool(args.wash), drift_before_pct=drift_total(),
                           pot_chips=s['pot_chips'], effective_stack_chips=s['effective_stack_chips'], matchup_total=z_, flop_board=s['flop_board'],
                           node_after_dealt_card=any(len(t_) == 2 and t_[0] in '23456789TJQKA' and t_[1] in 'cdhs' for t_ in node.split(':')), ledger_frozen=bool(frozen))
                rec['storage_incidents'].append(inc)
                print('[f4-storage]', sid, pr['name'], arm_name, kind, node, v['class'], 'hands', v['n_hands'], 'max_err %.6g' % v['max_err'], 'bound_pct %.6g' % v['bound_pct'], 'used_pct %.6g' % used, 'limit_pct %g' % LIMIT, flush=True)
                return v
            for arm in ph.get('arms', []):
                for wr in arm['writes']:   # f3 fix 2026-11-13: snapshot every node BEFORE any write of this arm. Pio stores suit-isomorphic turn/river nodes once
                    try: node_info(wr['node'], wr['actor'])   # (e.g. 7h/7s on 4cKc5d); a lazy snapshot taken after its twin was written saved the written strategy.
                    except PioError:
                        if not wr.get('optional'): raise
                r = {'writes': []}; touched = []; arm_bound = 0.0; arm_fail = None; drift0 = drift_total()   # f4 addition
                for wr in arm['writes']:
                    node, actor, spec = wr['node'], wr['actor'], wr['spec']
                    if wr.get('optional'):
                        try: node_info(node, actor)
                        except PioError as e: r['writes'].append({'node': node, 'skipped': repr(e)[:160]}); continue
                    children, eqs, rg, _ = node_info(node, actor); codes = [c.split(':')[-1] for c in children]
                    if wr.get('optional') and not wr.get('write_even_if_unreached') and not any(x > 0 for x in rg): r['writes'].append({'node': node, 'skipped': 'no live hand'}); continue   # f3 addition: write_even_if_unreached
                    S = {ch: list(eqs[ch]) for ch in children}
                    if 'pure' in spec:
                        for ch, code in zip(children, codes): S[ch] = [1.0 if code == spec['pure'] else 0.0] * 1326
                    elif 'uniform' in spec:
                        for ch in children: S[ch] = [1.0 / len(children)] * 1326
                    elif 'even' in spec:
                        for ch, code in zip(children, codes): S[ch] = [(1.0 if code == spec['even'][i % 2] else 0.0) for i in range(1326)]
                    elif 'mod3' in spec:
                        assert sorted(spec['mod3']) == sorted(codes), (sorted(spec['mod3']), codes)
                        for ch, code in zip(children, codes): S[ch] = [spec['mod3'][code][i % 3] for i in range(1326)]
                    elif 'tendency' in spec:   # f3 addition
                        aev = None
                        if spec['tendency'].get('rule') == 'ev_margin':
                            aev = {c: parse_calc_ev(pio('calc_ev %s %s:%s' % (actor, node, c.split(':')[-1])), label='action EV')[0] for c in children}
                        S, tinfo = tendency_table(S, children, codes, rg, spec, aev); r.setdefault('tendency', []).append(dict(tinfo, node=node))
                    elif 'blend' in spec:   # f3 addition
                        S = blend_table(S, children, codes, captured[spec['blend']['captured']], spec['blend']['lambda'])
                    elif 'captured' in spec:
                        cp = captured[spec['captured']]; assert sorted(cp) == sorted(codes), (sorted(cp), codes)
                        for ch, code in zip(children, codes): S[ch] = list(cp[code])
                    else:
                        tb = spec['table']; assert sorted(tb['actions']) == sorted(codes), (tb['actions'], codes)
                        for row, i in zip(tb['F'], tb['positive']):
                            for code, v in zip(tb['actions'], row): S[children[codes.index(code)]][i] = float(v)
                    rl_ = rng_of(actor, 'r:0') if wr.get('rootlive') else None
                    if wr.get('rootlive_minus') is not None:   # f3 addition: root range minus hands holding the dealt turn/river cards
                        dead = set(wr['rootlive_minus']); rl_ = [0.0 if dead.intersection(COMBO_CARDS[i]) else x for i, x in enumerate(rng_of(actor, 'r:0'))]
                    cur[:] = [arm['name'], 'arm_write']; err, nlive, mm, back = write(node, S, children, rg, rl_); touched.append((node, rl_))
                    wrec = {'node': node, 'codes': codes, 'readback_live': err, 'live': nlive, 'rootlive': bool(wr.get('rootlive')), 'node_live': sum(1 for x in rg if x > 0)}
                    if mm is not None:   # f4 addition: adopt the STORED strategy within the bound (it is what calc_results scores); else fail THIS arm only
                        v = judge(mm, node, actor, 'arm_write', arm['name'], drift0 + arm_bound); wrec['storage'] = {'class': v['class'], 'bound_pct': v['bound_pct'], 'hands': [h['hand'] for h in v['hands']]}
                        if v['class'] != 'adopt':
                            arm_fail = {'node': node, 'class': v['class'], 'reasons': v['reasons'], 'bound_pct': v['bound_pct']}; r['writes'].append(wrec); break
                        arm_bound += v['bound_pct']
                    r['writes'].append(wrec)
                if arm_fail is None:
                    r['written'] = results()
                    if arm.get('capture_ranges'):   # f3 addition: ranges at given nodes while this arm's writes are in place
                        r['ranges'] = {c['name']: {'node': c['node'], 'oop': rng_of('OOP', c['node']), 'ip': rng_of('IP', c['node'])} for c in arm['capture_ranges']}
                for node, rl_ in touched:   # restore; f4 addition: a restore mismatch becomes base drift on that node (cleared by a later exact restore)
                    children, eqs, rg, actor_ = saved[node]; cur[:] = [arm['name'], 'restore']; err, nlive, mm, back = write(node, eqs, children, rg, rl_)
                    if mm is None:
                        if not frozen: drift.pop(node, None)   # f4 v2: an exact restore clears the node's entry ONLY while the ledger is not frozen
                    else:
                        kept = drift.get(node, 0.0) if frozen else 0.0   # f4 v2: frozen ledger: the earlier entry stays charged and the new bound is added to it
                        if not frozen: drift.pop(node, None)
                        v = judge(mm, node, actor_, 'restore', arm['name'], drift_total())
                        if v['class'] != 'adopt':
                            pr['storage_stop'] = {'after_arm': arm['name'], 'node': node, 'class': v['class'], 'reasons': v['reasons'], 'bound_pct': v['bound_pct']}
                        drift[node] = kept + v['bound_pct']
                r['restored'] = results(); bad = any(abs(r['restored'][k] - eq[k]) > 0.01 for k in ('ev_oop_chips', 'ev_ip_chips', 'oop_mes_chips', 'ip_mes_chips'))
                if bad and not drift: raise PioError('solution not restored after ' + arm['name'])
                if bad and 'storage_stop' not in pr: pr['storage_stop'] = {'after_arm': arm['name'], 'class': 'restored_values_moved', 'reasons': ['root values moved more than 0.01 chips with restore drift present'], 'bound_pct': drift_total()}
                if drift0 or arm_bound or drift: r['storage'] = {'base_drift_pct': drift0, 'arm_bound_pct': arm_bound, 'total_bound_pct': drift0 + arm_bound, 'limit_pct': LIMIT, 'drift_after_pct': drift_total(), 'drift_nodes_after': sorted(drift)}
                if frozen: r['storage']['ledger_frozen'] = True; r['storage']['snapshots_with_drift'] = list(frozen); pr['ledger_frozen_nodes'] = list(frozen)   # f4 v2 (frozen implies drift is not empty)
                if arm_fail is None: pr['arms'][arm['name']] = r
                else: r['failed'] = arm_fail; pr.setdefault('arms_failed', {})[arm['name']] = r
                if 'storage_stop' in pr:   # f4 addition: the base is no longer the solution within the bound: keep completed arms, list the rest, stop the session
                    names = [a_['name'] for a_ in ph.get('arms', [])]; pr['arms_not_run'] = names[names.index(arm['name']) + 1:]; pr['drift'] = dict(drift)
                    raise StorageStop('restore drift outside the storage rule after ' + arm['name'])
            ex = ph.get('exploit')
            if ex:   # f3 addition: node-locked best response. Runs LAST in the phase: the phase's solution is no longer the equilibrium afterwards.
                horse = ex['horse']; hk = 'ev_ip_chips' if horse == 'IP' else 'ev_oop_chips'; X_ = {'eq': eq, 'locks': [], 'base_drift_pct': drift_total()}; EQ_OF[pr['name']] = dict(eq); locked = []
                EXPLOIT_ON[0] = True
                try:
                    for lk in ex['lock']:
                        node, actor = lk['node'], lk['actor']; assert actor != horse, 'only the opponent is locked'
                        children, eqs, rg, _ = node_info(node, actor); codes = [c.split(':')[-1] for c in children]; S = {ch: list(eqs[ch]) for ch in children}
                        if 'table' in lk['spec']:   # f3 addition: a fixed table locked as-is (B9-L: the horse's own flop mix)
                            tb = lk['spec']['table']; assert sorted(tb['actions']) == sorted(codes), (tb['actions'], codes)
                            for row, i in zip(tb['F'], tb['positive']):
                                for code, v in zip(tb['actions'], row): S[children[codes.index(code)]][i] = float(v)
                            tinfo = {'table': True, 'rows': len(tb['positive'])}
                        else:
                            aev = {c: parse_calc_ev(pio('calc_ev %s %s:%s' % (actor, node, c.split(':')[-1])), label='action EV')[0] for c in children} if lk['spec']['tendency'].get('rule') == 'ev_margin' else None
                            S, tinfo = tendency_table(S, children, codes, rg, lk['spec'], aev)
                        rl_ = rng_of(actor, 'r:0') if lk.get('rootlive') else None
                        cur[:] = ['exploit', 'lock_write']; err, nlive, mm, back = write(node, S, children, rg, rl_)   # f4 addition: a lock adopts the stored strategy within the bound, else the session fails
                        if mm is not None:
                            v = judge(mm, node, actor, 'lock_write', 'exploit', drift_total() + sum(l_.get('storage_bound_pct', 0.0) for l_ in X_['locks']))
                            if v['class'] != 'adopt': raise ValueError('lock write outside the storage rule at ' + node + ': ' + '; '.join(v['reasons']))
                            S = st4.stored_strategy(S, back, rl_ if rl_ is not None else rg); tinfo = dict(tinfo, storage_bound_pct=v['bound_pct'])
                        pio('lock_node ' + node)
                        locked.append((node, S, children, rg)); X_['locks'].append(dict(tinfo, node=node, actor=actor))
                    X_['tendency_vs_eq'] = results()   # horse equilibrium strategy vs the tendency opponent (unlocked opponent nodes: equilibrium)
                    traj = []; prev = None
                    for k_ in range(ex.get('max_chunks', 12)):
                        pio('go %d steps' % ex.get('steps', 50)); pio('wait_for_solver'); rr = results(); traj.append(rr)
                        if prev is not None and abs(rr[hk] - prev) <= ex.get('tol_chips', 0.3): break
                        prev = rr[hk]
                    rec['solver_runs'] += 1; X_['trajectory'] = traj; X_['locked'] = traj[-1]; X_['converged'] = len(traj) < ex.get('max_chunks', 12)
                    for node, S, children, rg in locked:   # the locks must still hold after the re-solve
                        back = parse_strategy(pio('show_strategy ' + node), children); enforce_readback(S, back, rg)
                    X_['capture'] = {}
                    for cp_ in ex.get('capture', []):
                        ch = parse_children(pio('show_children ' + cp_['node']), cp_['node']); st = parse_strategy(pio('show_strategy ' + cp_['node']), ch)
                        captured[cp_['name']] = {c.split(':')[-1]: list(st[c]) for c in ch}; hr = rng_of(horse, cp_['node']); wt = sum(hr)
                        X_['capture'][cp_['name']] = {'node': cp_['node'], 'mix': {c.split(':')[-1]: sum(h * v for h, v in zip(hr, st[c])) / wt for c in ch} if wt > 0 else None}
                finally:
                    EXPLOIT_ON[0] = False
                if frozen: X_['ledger_frozen'] = True; pr['ledger_frozen_nodes'] = list(frozen)   # f4 v2
                pr['exploit'] = X_; pr['tainted_after_exploit'] = True
            pr['commands'] = sorted(set(sent)); pr['go_count'] = sent.count('go'); pr['total_s'] = round(time.time() - t0, 2)
        rec['status'] = 'ok'
    except StorageStop as e:   # f4 addition: completed arms are valid and kept; the solver process is restarted (the drifted tree is discarded)
        rec['status'] = 'partial_storage'; rec['error'] = repr(e)[:600]
        capture_failure(rec,pr,proc,sent,BUDGET)
        try: proc.close()
        except Exception: pass
        BUDGET.end()
        restart_required = True
    except (PioError, AssertionError, KeyError, ValueError, OSError) as e:
        rec['status'] = 'failed'; rec['error'] = repr(e)[:600]
        capture_failure(rec,pr,proc,sent,BUDGET)
        try: proc.close()
        except Exception: pass
        BUDGET.end()
        restart_required = True
    except Exception as e:   # FIX-1 (finding 11): any other error fails only this session; SystemExit and KeyboardInterrupt stay fatal
        rec['status'] = 'failed'; rec['error'] = repr(e)[:600]; rec['traceback'] = traceback.format_exc()[-600:]
        capture_failure(rec,pr,proc,sent,BUDGET)
        try: proc.close()
        except Exception: pass
        BUDGET.end()
        restart_required = True
    inc_ = rec['storage_incidents']   # f4 addition: one summary per session
    rec['storage_summary'] = {'incidents': len(inc_), 'adopted': sum(1 for x in inc_ if x['class'] == 'adopt'), 'refused': sum(1 for x in inc_ if x['class'] != 'adopt'),
        'arms_failed': sum(len(p_.get('arms_failed', {})) for p_ in rec['phases']), 'arms_not_run': sum(len(p_.get('arms_not_run', [])) for p_ in rec['phases']),
        'max_total_bound_pct': max([a_['storage']['total_bound_pct'] for p_ in rec['phases'] for a_ in p_['arms'].values() if 'storage' in a_] or [0.0])}
    rec['storage_summary']['wash_cured'] = len(rec.get('wash_cured', [])); rec['storage_summary']['ledger_frozen_phases'] = sum(1 for p_ in rec['phases'] if p_.get('ledger_frozen_nodes'))   # f4 v2
    rec['storage_summary']['complete'] = rec['status'] == 'ok' and not rec['storage_summary']['arms_failed'] and not rec['storage_summary']['arms_not_run']   # f4 v2: status ok alone does not mean every arm completed
    rec['total_s'] = round(time.time() - t00, 2); rec['ws_kb_end'] = ws_kb(); rec['finished_unix'] = time.time()
    write_output(out / (sid + '.json'), json.dumps(rec)); print('[f1]', sid, rec['status'], rec.get('error', ''), rec['solver_runs'], rec['total_s'], 'storage', json.dumps(rec['storage_summary']), flush=True)
    UNEXP[0] = UNEXP[0] + 1 if 'traceback' in rec else 0   # FIX-1B (review R7): a systemic fault must not burn the whole job file into failed records
    if UNEXP[0] >= 2:
        print('[f4] two consecutive unexpected failures: stopping; later sessions stay unrun', flush=True)
        try: proc.close()
        except Exception: pass
        sys.exit(4)
try: proc.close()
except Exception: pass
_aggregate_rc=aggregate_exit(jobs,out); print('[f1] DONE aggregate_exit=%d'%_aggregate_rc,flush=True);sys.exit(_aggregate_rc)
