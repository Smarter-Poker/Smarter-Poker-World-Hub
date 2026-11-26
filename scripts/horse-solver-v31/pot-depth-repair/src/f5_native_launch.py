# Task-owned namespace derivative, original SHA256 3a961173b13766e2556c708aeec9abd99546c7ec335d3e82cc3bd252fef7d2d2 preserved.
#!/usr/bin/env python3
"""Explicit task-owned native launcher, preserving canonical FLOP-5 guards.

One invocation owns one cohort in C:\\sp-v31\\hv31-follow-20261126-01a1e479,
using the existing FLOP-5 durable budget ledger. Preflight hashes all six native
helpers plus the exact job bytes. The M1 wrapper writes the driver's own exit
code atomically; --read-exit reconciles that original outcome without relaunch.
No pipeline caller uses the historical wait utility to advance gated stages.
The owner must inspect each durable exit/canonical copy/A2 technical receipt
before a separate explicit next-cohort invocation. No washes or spares are
admitted by this frozen successor's ops.py caller. Source-origin guards and
late-exit reconciliation below remain the canonical implementation.
"""
import fcntl, hashlib, json, os, re, shlex, signal, subprocess, sys, time
from pathlib import Path
W = Path('/Volumes/SmarterWork/agent-work/extreme-capacity/v31-rootcause-01TLQer7/flop4'); REAL_LEDGER = W.parent / 'flop5' / 'logs' / 'budget.jsonl'   # FLOP-5 ledger
A2 = Path('/Volumes/SmarterWork/agent-work/extreme-capacity/hv31-followthrough-20261126-01a1e479/driver')   # FLOP-5: the four M1 files are the FLOP-4 in-force files, hashed where they live
FILES = (('driver', 'f4_lock_driver.py'), ('storage', 'f4_storage.py'), ('readback', 'f1_readback.py'), ('m1helper', 'f4_m1.py'), ('deadline', 'context_deadline.py'), ('telemetry', 'native_telemetry.py'))
RW_REAL = r'C:\sp-v31\hv31-follow-20261126-01a1e479'; R8W = r'C:\sp-v31\mac-v31-r8-20261107-01gw7a'; PY_REAL = r'C:\Users\danie\AppData\Local\Programs\Python\Python312\python.exe'
SSH_KEEP = ['-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=20']   # placed before the account options: the first value wins
NAME_OK = re.compile(r'^[A-Za-z0-9._-]+$')
def die(rc, msg): print(msg, file=sys.stderr, flush=True); sys.exit(rc)
def now(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()
def line(d): return json.dumps(d, separators=(',', ':'))
LAUNCH_GATE = W.parent / 'flop5' / 'M' / 'f5_launch_gate.py'; LAUNCH_GATE_SHA = '0bd02ef10d7fc9dc526eeedbde97d6fd446ea55e303b43185e618ed81bdeed7b'   # PIN (FLOP-5)
def launch_gate(jsrc, log, ev):
    """FIX-2-3B (W/flop4/AUDIT/FIX-2-3B.md, REVIEW-FIX-2-3 finding 2), FLOP-5 scope: a job file under flop5/D3 or D4 launches only with --launch-check
    LOG naming a pinned M/f5_launch_check.py GO that started after the last LAUNCH line (one check may serve files launched together) and after the job file's last
    change; a job file under flop4 is refused (rules in M/f5_launch_gate.py, whose sha256 is checked before import). Refusal: exit 3, nothing launched,
    no ledger line."""
    if sha(LAUNCH_GATE) != LAUNCH_GATE_SHA: die(3, 'REFUSED: M/f5_launch_gate.py is not the pinned %s; nothing launched' % LAUNCH_GATE_SHA[:12])
    sys.path.insert(0, str(LAUNCH_GATE.parent)); import f5_launch_gate as G
    try: return G.check(jsrc, log, ev)
    except G.Refused as e: die(3, str(e))
def read_ledger(path):
    ev, bad = [], []
    if Path(path).is_file():
        for ln in Path(path).read_text().splitlines():
            if not ln.strip(): continue
            try:
                d = json.loads(ln)
                (ev if isinstance(d, dict) else bad).append(d if isinstance(d, dict) else ln)
            except ValueError: bad.append(ln)
    return ev, bad
def append(path, d):
    with open(path, 'a') as f:
        fcntl.flock(f, fcntl.LOCK_EX); f.write(line(d) + '\n'); f.flush(); os.fsync(f.fileno()); fcntl.flock(f, fcntl.LOCK_UN)
def pid_alive(pid):
    try: os.kill(int(pid), 0); return True
    except ProcessLookupError: return False
    except (PermissionError, OSError, ValueError, TypeError): return True
class Claim:
    """mkdir LEDGER_DIR/locks/<NAME>: atomic, so two launches of one name cannot pass the guard together. Released after the launch line is written."""
    def __init__(self, ledger, name):
        self.d = Path(ledger).parent / 'locks' / name.upper(); self.d.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(2):
            try: self.d.mkdir(); (self.d / 'pid').write_text(str(os.getpid())); return
            except FileExistsError:
                try: pid = (self.d / 'pid').read_text().strip()
                except FileNotFoundError: pid = ''
                if pid and not pid_alive(pid):
                    try: os.rename(self.d, self.d.with_name('%s.stale.%d' % (self.d.name, int(time.time() * 1000)))); continue
                    except OSError: pass
                die(3, 'REFUSED: another launch of %s is being started right now (claim %s, pid %s)' % (name, self.d, pid or '?'))
        die(3, 'REFUSED: could not claim %s' % self.d)
    def release(self):
        try: (self.d / 'pid').unlink(); self.d.rmdir()
        except OSError: pass
def guard(ev, bad, O, spare, count_dry):
    U = O.upper(); same = [e for e in ev if e.get('event') == 'launch' and str(e.get('out', '')).upper() == U and (count_dry or not e.get('dry'))]
    clash = sorted({e['out'] for e in same if e['out'] != O})
    if clash: return 'REFUSED: %s differs only in letter case from %s in the ledger; the solver PC file system is case-insensitive (same job file, run log and output folder)' % (O, ', '.join(clash))
    for b in bad:
        if re.search(r'"out"\s*:\s*"%s"' % re.escape(O), str(b), re.I): return 'REFUSED: an unparsable ledger line names %s: repair the ledger record first' % O
    if same and not spare: return 'REFUSED: the ledger already holds a launch of %s. Diagnose from the logs first, then relaunch once with --spare DIAGNOSIS-FILE' % O
    if spare and not same: return 'REFUSED: --spare needs an earlier launch of %s in the ledger (a spare is a retry, not a first launch)' % O
    if spare and any('spare_sha256' in e for e in same): return 'REFUSED: %s already used its one spare launch' % O
    return None
def solver_runs(jobs_path):
    try: return sum(1 + (1 if ph.get('exploit') else 0) for j in json.loads(Path(jobs_path).read_bytes()) for ph in j['phases'])
    except Exception: return None
class Remote:
    def __init__(self, test):
        if test:
            self.ssh = [os.environ['F4_SSH'], '-n', *SSH_KEEP, *shlex.split(os.environ.get('F4_SSHO', '')), 'fake-m1']
            self.rw, self.sep, self.py = os.environ['F4_RW'], '/', os.environ.get('F4_PY', sys.executable)
            self.pipe, self.inputs = os.environ['F4_PIPE'], os.environ['F4_INPUTS']
        else:
            self.ssh = ['/Users/smarter.poker/.smarter-poker/ops/solver-host.sh', 'm1']
            self.rw, self.sep, self.py = RW_REAL, '\\', PY_REAL; self.pipe, self.inputs = R8W + '\\pipeline', R8W + '\\inputs'
    def cmd(self, args): return 'set PYTHONDONTWRITEBYTECODE=1&& %s -B %s%sf4_m1.py %s' % (self.py, self.rw, self.sep, args)
    def call(self, args, timeout=180):
        try: p = subprocess.run(self.ssh + [self.cmd(args)], capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired: return None, 'timeout'
        res = [l_[5:] for l_ in p.stdout.splitlines() if l_.startswith('F4M1 ')]
        if p.returncode != 0 or not res: return None, 'ssh rc %d' % p.returncode
        try: return json.loads(res[-1]), None
        except ValueError: return None, 'unparsable answer'
def wait_main(argv):
    dl, poll, outs = 6 * 3600.0, 60.0, []
    i = 0
    while i < len(argv):
        if argv[i] == '--deadline-s': dl = float(argv[i + 1]); i += 2
        elif argv[i] == '--poll-s': poll = float(argv[i + 1]); i += 2
        else: outs.append(argv[i]); i += 1
    if not outs: die(2, 'usage: f4_launch.py wait [--deadline-s S] [--poll-s P] OUT [OUT ...]')
    ledger = Path(os.environ.get('F4_LEDGER') or REAL_LEDGER); t0 = time.time()
    while True:
        ev, _ = read_ledger(ledger); state = {}
        for O in outs:
            idx = [k for k, e in enumerate(ev) if e.get('event') == 'launch' and e.get('out') == O and not e.get('dry')]
            if not idx: state[O] = 'not launched'; continue
            after = [e for e in ev[idx[-1] + 1:] if e.get('out') == O and e.get('event') in ('exit', 'exit_dropped')]
            if not after: state[O] = 'running'
            elif after[-1]['event'] == 'exit_dropped': state[O] = 'exit_dropped'
            else: state[O] = 'rc %s' % after[-1].get('rc')
        if all(v == 'rc 0' for v in state.values()): print('WAIT OK %s %s' % (line(state), now()), flush=True); return 0
        if any(v not in ('rc 0', 'running', 'not launched') for v in state.values()): print('WAIT STOP (a non-zero or dropped exit) %s %s' % (line(state), now()), flush=True); return 6
        if time.time() - t0 >= dl: print('TIMEOUT %s %s' % (line(state), now()), flush=True); return 5
        time.sleep(poll)
def main(argv):
    if argv and argv[0] == 'wait': return wait_main(argv[1:])
    if not argv: die(2, 'REFUSED: OUTNAME must be letters, digits, dot, underscore or hyphen')
    O = argv[0]
    if not NAME_OK.match(O): die(2, 'REFUSED: OUTNAME must be letters, digits, dot, underscore or hyphen')
    wash, spare, jsrc, read_exit, lcheck = False, None, None, False, None; i = 1
    while i < len(argv):
        x = argv[i]
        if x == '': pass
        elif x == '--wash': wash = True
        elif x == '--read-exit': read_exit = True
        elif x in ('--spare', '--jobs-src', '--launch-check'):
            i += 1; v = argv[i] if i < len(argv) else ''
            if x == '--launch-check':   # FIX-2-3B (REVIEW-FIX-2-3 finding 2)
                if not v or not os.path.isfile(v): die(2, 'REFUSED: --launch-check needs the log of a M/f5_launch_check.py run (detach.sh log)')
                lcheck = os.path.realpath(v)
            elif x == '--spare':
                if not v or not os.path.isfile(v) or os.path.getsize(v) == 0: die(2, 'REFUSED: --spare needs an existing, non-empty diagnosis file')
                if any(c in v for c in '"\\\''): die(2, 'REFUSED: the diagnosis file path may not hold quotes or backslashes')
                spare = v
            else:
                if not v or not os.path.isfile(v): die(2, 'REFUSED: --jobs-src needs the Mac job file that was copied to M1 as jobs-%s.json' % O)
                if any(c in v for c in '"\\\''): die(2, 'REFUSED: the job file path may not hold quotes or backslashes')
                jsrc = os.path.realpath(v)
        else: die(2, 'REFUSED: unknown argument (only --wash, --spare FILE, --jobs-src FILE, --launch-check FILE and --read-exit are accepted)')
        i += 1
    DRY = os.environ.get('F4_DRY') == '1'; TEST = os.environ.get('F4_TEST') == '1'; L = os.environ.get('F4_LEDGER', '')
    if L:
        if os.path.realpath(L) in (os.path.realpath(str(REAL_LEDGER)), os.path.realpath(str(W / 'logs' / 'budget.jsonl'))): die(2, 'REFUSED: F4_LEDGER names the real ledger or the closed FLOP-4 ledger; dry and test runs use a separate ledger')
        if not (DRY or TEST): die(2, 'REFUSED: F4_LEDGER is only for dry or test runs')
    if TEST and not (L and os.environ.get('F4_SSH')): die(2, 'REFUSED: F4_TEST needs F4_LEDGER and F4_SSH')
    ledger = Path(L) if L else REAL_LEDGER; readonly = DRY and not L
    if read_exit:
        if wash or spare or jsrc or lcheck or DRY: die(2, 'REFUSED: --read-exit takes no other argument')
        return read_exit_main(O, ledger, TEST)
    if not DRY and not jsrc: die(2, 'REFUSED: --jobs-src MAC-JOB-FILE is required: the launch line must name the job file that was copied to M1')
    claim = None if readonly else Claim(ledger, O)
    try:
        ev, bad = read_ledger(ledger); msg = guard(ev, bad, O, spare, count_dry=DRY)
        if msg: die(3, msg)
        mac = {k: sha(A2 / f) for k, f in FILES}
        EV = {'event': 'launch', 'out': O, 'driver': 'f4_lock_driver.py', 'driver_sha256_mac': mac['driver'], 'flags': '--wash' if wash else ''}
        if spare: EV.update(spare=spare, spare_sha256=sha(spare))
        tag = 'spare1' if spare else 'first'; EV['tag'] = tag
        if jsrc: EV.update(jobs_src=jsrc, jobs_sha256_mac=sha(jsrc), solver_runs_max=solver_runs(jsrc))
        EV.update(launch_gate(jsrc, lcheck, ev))   # FLOP-5: a flop5/D3 or D4 job file needs a fresh launch check GO (recorded in the launch line); a flop4 job file is refused
        if DRY:
            if not readonly: append(ledger, dict(EV, dry=True, at=now()))
            print('DRY: would launch %s flags [%s] spare [%s] (nothing started)' % (O, EV['flags'], spare or '')); return 0
        R = Remote(TEST)
        pre, err = R.call('preflight --rw %s --name %s --tag %s' % (R.rw, O, tag))
        if pre is None: die(4, 'REFUSED: M1 preflight failed (%s); nothing launched, no ledger line' % err)
        diff = ['%s (M1 %s, Mac %s)' % (k, pre['files'].get(k), mac[k]) for k, _ in FILES if pre['files'].get(k) != mac[k]]
        if pre['files'].get('jobs') != EV['jobs_sha256_mac']: diff.append('jobs-%s.json (M1 %s, Mac %s %s)' % (O, pre['files'].get('jobs'), jsrc, EV['jobs_sha256_mac']))
        if diff: die(4, 'REFUSED: files on M1 differ from the Mac files: ' + '; '.join(diff))
        if pre['running'] is None: die(3, 'REFUSED: the driver processes on M1 could not be listed, so a running driver cannot be ruled out')
        if pre.get('unreadable_cmdlines'): die(3, 'REFUSED: M1 lists python processes whose command line cannot be read (pids %s), so a running driver cannot be ruled out' % pre['unreadable_cmdlines'])   # FIX-1B R3
        if pre['lock']['state'] not in ('none', 'free') or pre['running']:   # FIX-1B R1: OS lock; 'free' = lock file present and not held
            die(3, 'REFUSED: a driver may still run on %s on M1 (lock %s, processes %s)' % (O, pre['lock'].get('state'), [r_['pid'] for r_ in pre['running']]))
        if tag == 'first' and (pre['outputs'] or pre['log_exists'] or pre['exit_exists']):
            die(3, 'REFUSED: first launch of %s but M1 already holds %d outputs, run log %s, exit marker %s' % (O, pre['outputs'], pre['log_exists'], pre['exit_exists']))
        if tag == 'spare1' and (pre['log_exists'] or pre['exit_exists']): die(3, 'REFUSED: the spare run log or exit marker of %s already exists on M1' % O)
        EV.update({k + '_sha256_m1': pre['files'][k] for k, _ in FILES}); EV.update(jobs_sha256_m1=pre['files']['jobs'], outputs_before=pre['outputs'], lock_before=pre['lock']['state'], launcher='f5_context_launch.py FLOP-5 bounded-context-repair-v1', at=now())
        append(ledger, EV)
    finally:
        if claim: claim.release()
    done = [False]
    def on_signal(sig, frm):
        if not done[0]: done[0] = True; append(ledger, {'event': 'exit_dropped', 'out': O, 'rc': None, 'reason': 'launcher killed by signal %d' % sig, 'tag': tag, 'at': now()})
        sys.exit(5)
    for s_ in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT): signal.signal(s_, on_signal)
    sshlog = ledger.parent / ('ssh-%s%s.log' % (O, '' if tag == 'first' else '.' + tag))
    with open(sshlog, 'a') as f:
        p = subprocess.Popen(R.ssh + [R.cmd('run --rw %s --name %s --tag %s --pipeline-root %s --inputs %s --threads 8%s' % (R.rw, O, tag, R.pipe, R.inputs, ' --wash' if wash else ''))],
                             stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT)
        ssh_rc = p.wait()
    return record_exit(ledger, O, tag, R, ssh_rc, done)
def record_exit(ledger, O, tag, R, ssh_rc, done, late=False):
    st, err = R.call('status --rw %s --name %s --tag %s' % (R.rw, O, tag))
    if done[0]: return 5
    done[0] = True
    if st is not None and st.get('exit_rc') is not None:
        d = {'event': 'exit', 'out': O, 'rc': st['exit_rc'], 'rc_source': st.get('exit_source') or 'm1_marker', 'ssh_rc': ssh_rc, 'tag': tag, 'at': now()}   # FIX-1B R4
        if late: d['late'] = True
        append(ledger, d); return 0 if st['exit_rc'] == 0 else 6
    if late: print('NO EXIT MARKER YET for %s (%s): nothing written' % (O, err or line(st)), flush=True); return 5
    run = None if st is None or st.get('running') is None else bool(st['running']) or st['lock'].get('state') == 'alive'
    append(ledger, {'event': 'exit_dropped', 'out': O, 'rc': None, 'ssh_rc': ssh_rc, 'marker': 'status unreachable (%s)' % err if st is None else 'absent' if st.get('exit_raw') is None else 'unreadable',
                    'driver_running': run, 'lock': None if st is None else st['lock'].get('state'), 'tag': tag, 'at': now()})
    return 5
def read_exit_main(O, ledger, TEST):
    claim = Claim(ledger, O)
    try:
        ev, _ = read_ledger(ledger); idx = [k for k, e in enumerate(ev) if e.get('event') == 'launch' and e.get('out') == O and not e.get('dry')]
        if not idx: die(3, 'REFUSED: no launch of %s in the ledger' % O)
        last = ev[idx[-1]]; tag = last.get('tag', 'first')
        if last.get('launcher') != 'f5_context_launch.py FLOP-5 bounded-context-repair-v1': die(3, 'REFUSED: the last launch of %s was not made by the FLOP-5 launcher f5_launch.py' % O)
        if any(e.get('out') == O and e.get('event') == 'exit' for e in ev[idx[-1] + 1:]): print('exit of %s already recorded' % O); return 0
        return record_exit(ledger, O, tag, Remote(TEST), None, [False], late=True)
    finally: claim.release()
if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
