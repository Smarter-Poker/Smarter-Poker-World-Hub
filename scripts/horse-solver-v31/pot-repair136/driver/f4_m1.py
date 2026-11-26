#!/usr/bin/env python3
"""FLOP-4 M1-side helper (FIX-1, W/flop4/AUDIT/FIX-1-MACHINERY.md; FIX-1B, W/flop4/AUDIT/FIX-1B.md). Copied to the solver PC (C:\\sp-v31\\r10-flop1)
next to f4_lock_driver.py, f4_storage.py and f1_readback.py. Standard library only. It never touches the solver itself; only `run` starts a process.

1. Driver run lock, used by f4_lock_driver.py (FIX-1B, review R1): OUT/f4_driver.lock is opened and an OPERATING-SYSTEM lock is taken on it and HELD
   for the driver's whole lifetime: on Windows msvcrt.locking(fd, LK_NBLCK, 1) on byte 0, elsewhere fcntl.flock(fd, LOCK_EX | LOCK_NB). The OS drops
   the lock when the process ends in any way (exit, crash, kill), so there is no stale lock, no takeover and no pid test; liveness is the lock itself.
   The file is never deleted (deleting it while a second process has it open would let two processes lock two different files); its bytes from
   offset 1 hold the holder's pid and start time for diagnosis only. acquire() retries for about 2 s (a preflight probe holds the lock for a moment),
   then raises LockHeld. lock_state() probes with the same non-blocking lock and releases it at once: 'none' (no file), 'alive' (held), 'free'
   (file present, not held) or 'unknown' (the probe itself failed; callers refuse).
2. CLI for the Mac launcher (A2/f4_launch.py), over ssh. Each command prints ONE line "F4M1 {json}".
     preflight --rw RW --name O --tag first|spare1   sha256 of driver, storage module, read-back module, this helper and jobs-O.json; lock state;
                                                     driver processes on the folder; python processes whose command line cannot be read; existing
                                                     log, exit marker and outputs
     run       --rw RW --name O --tag first|spare1 --pipeline-root P --inputs I --threads N [--wash]
               runs the driver; its output goes to RW/run-O.log (spare: run-O.spare1.log, created exclusively, never truncated); when the driver
               ends, its own exit code is written atomically to RW/exit-O.txt (spare: exit-O.spare1.txt) as "EXIT=<rc>" and appended to the log
     status    --rw RW --name O --tag first|spare1   the exit marker (null while absent; a marker left as .tmp by a failed replace is read and
                                                     labelled m1_marker_tmp), lock state and driver processes
   Exit codes of run: the driver's code; 90 = refused (log or exit marker of this launch already exists, nothing started)."""
import argparse, errno, hashlib, json, ntpath, os, socket, subprocess, sys, time
from pathlib import Path
LOCK_NAME = 'f4_driver.lock'; REFUSED = 90; LOCK_TRIES = 10; LOCK_WAIT_S = 0.2
class LockHeld(Exception): pass
def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()
def _try_lock(fd):
    """Take the OS lock on fd without waiting. True when taken, False when another process holds it; other errors propagate."""
    if os.name == 'nt':
        import msvcrt
        os.lseek(fd, 0, 0)
        try: msvcrt.locking(fd, msvcrt.LK_NBLCK, 1); return True
        except OSError as e:
            if e.errno in (errno.EACCES, errno.EDEADLK, getattr(errno, 'EDEADLOCK', errno.EDEADLK)): return False
            raise
    import fcntl
    try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); return True
    except OSError as e:
        if e.errno in (errno.EWOULDBLOCK, errno.EAGAIN, errno.EACCES): return False
        raise
def _unlock(fd):
    if os.name == 'nt':
        import msvcrt
        os.lseek(fd, 0, 0); msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
    else:
        import fcntl
        fcntl.flock(fd, fcntl.LOCK_UN)
def _open(p, create):
    return os.open(str(p), os.O_RDWR | (os.O_CREAT if create else 0) | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOINHERIT', 0), 0o644)
def read_lock(out):
    """The diagnosis record (pid, start time) from offset 1 of the lock file; byte 0 is the locked byte (Windows refuses reads of it while held)."""
    p = Path(out) / LOCK_NAME
    try:
        with open(p, 'rb') as f: f.seek(1); raw = f.read(4096).decode('utf-8', 'replace')
    except FileNotFoundError: return None
    except OSError as e: return {'pid': None, 'unreadable': repr(e)[:200]}
    try: d = json.loads(raw); assert isinstance(d, dict) and 'pid' in d; return d
    except Exception: return {'pid': None, 'unreadable': raw[:200]}
def lock_state(out):
    p = Path(out) / LOCK_NAME
    try: fd = _open(p, False)
    except FileNotFoundError: return {'state': 'none'}
    except OSError as e: return {'state': 'unknown', 'error': repr(e)[:200]}
    try:
        got = _try_lock(fd)
        if got: _unlock(fd)
        state = 'free' if got else 'alive'
    except Exception as e: state = 'unknown'; err = repr(e)[:200]
    finally: os.close(fd)
    d = read_lock(out) or {}
    d = dict(d, state=state)
    if state == 'unknown': d['error'] = err
    return d
def acquire(out, argv=None):
    """Take and HOLD the OS lock on OUT/f4_driver.lock for this process's lifetime, or raise LockHeld. Returns the info record (with the open fd)."""
    out = Path(out); out.mkdir(parents=True, exist_ok=True); lock = out / LOCK_NAME
    fd = _open(lock, True)
    try:
        for k in range(LOCK_TRIES):
            if _try_lock(fd): break
            if k == LOCK_TRIES - 1:
                d = read_lock(out) or {}
                raise LockHeld('output folder %s is locked by another process (pid %s, OS lock held): another driver is running on it' % (out, d.get('pid')))
            time.sleep(LOCK_WAIT_S)
    except BaseException:
        os.close(fd); raise
    info = {'pid': os.getpid(), 'host': socket.gethostname(), 'started_unix': time.time(), 'out': str(out), 'argv': list(argv or sys.argv), 'lock': 'os'}
    os.lseek(fd, 1, 0); b = json.dumps(info).encode() + b'\n'; os.write(fd, b); os.ftruncate(fd, 1 + len(b))
    print('[f4_m1] lock acquired %s pid %d' % (lock, os.getpid()), flush=True)
    return dict(info, fd=fd)
def release(out, info):
    """Drop the OS lock and close the file (the OS does the same if the process dies first). The file stays."""
    fd = info.get('fd') if isinstance(info, dict) else None
    if fd is None: return
    try: _unlock(fd)
    except OSError: pass
    try: os.close(fd)
    except OSError: pass
    info['fd'] = None
    print('[f4_m1] lock released %s pid %d' % (Path(out) / LOCK_NAME, os.getpid()), flush=True)
def _norm(p): return os.path.normcase(os.path.normpath(str(p).strip('"')))
def _base(p): return ntpath.basename(str(p).strip('"').rstrip('\\/')).replace('/', '\\').split('\\')[-1]
def running_drivers(out, name=None, stats=None):
    """Processes running f4_lock_driver.py with --out OUT (full path, or the folder name alone, case-insensitive), or f4_m1.py run for NAME.
    None when they cannot be listed. stats (a dict), when given, gets 'unreadable': pids of python processes whose command line is empty or unreadable."""
    procs = []
    try:
        if os.name == 'nt':
            ps = "Get-CimInstance Win32_Process -Filter \"Name like 'python%'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
            r = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', ps], capture_output=True, text=True, timeout=60)
            if r.returncode != 0: return None
            d = json.loads(r.stdout) if r.stdout.strip() else []
            for x in ([d] if isinstance(d, dict) else d): procs.append((int(x['ProcessId']), x.get('CommandLine') or ''))
        else:
            r = subprocess.run(['ps', '-axww', '-o', 'pid=', '-o', 'command='], capture_output=True, text=True, timeout=60)
            if r.returncode != 0: return None
            for line in r.stdout.splitlines():
                a = line.strip().split(None, 1)
                if len(a) == 2 and a[0].isdigit(): procs.append((int(a[0]), a[1]))
    except Exception: return None
    me = {os.getpid(), os.getppid()}; hit = []; unread = []; o = _norm(out); ob = _base(out).upper(); nt = os.name == 'nt'
    for pid, cmd in procs:
        if pid in me: continue
        if not cmd.strip(): unread.append(pid); continue
        t = [x.strip('"') for x in cmd.split()]; tl = [x.lower() for x in t] if nt else t
        def outs_match(i): return _norm(t[i + 1]) == o or _base(t[i + 1]).upper() == ob
        if any(x.endswith('f4_lock_driver.py') for x in tl) and any(tl[i] == '--out' and outs_match(i) for i in range(len(t) - 1)): hit.append({'pid': pid, 'cmd': cmd[:300]})
        elif name and any(x.endswith('f4_m1.py') for x in tl) and 'run' in tl and any(tl[i] == '--name' and t[i + 1].upper() == name.upper() for i in range(len(t) - 1)): hit.append({'pid': pid, 'cmd': cmd[:300]})
    if stats is not None: stats['unreadable'] = unread
    return hit
def paths(rw, name, tag):
    rw = Path(rw); sfx = '' if tag == 'first' else '.' + tag
    return {'rw': rw, 'out': rw / name, 'jobs': rw / ('jobs-%s.json' % name), 'log': rw / ('run-%s%s.log' % (name, sfx)), 'exit': rw / ('exit-%s%s.txt' % (name, sfx))}
def replace_retry(src, dst, tries=20, wait=1.0):   # Windows refuses a replace while another process (antivirus, a copy) holds the target open
    for k in range(tries):
        try: os.replace(src, dst); return
        except PermissionError:
            if k == tries - 1: raise
            time.sleep(wait)
def _parse_exit(raw):
    if raw.startswith('EXIT='):
        try: return int(raw[5:].split()[0])
        except ValueError: pass
    return None
def read_exit(p):
    """(rc, raw, source): the marker, or its .tmp when a replace failed (source m1_marker_tmp); (None, None, None) when neither exists."""
    for q, src in ((Path(p), 'm1_marker'), (Path(str(p) + '.tmp'), 'm1_marker_tmp')):
        try: raw = q.read_text().strip()
        except FileNotFoundError: continue
        rc = _parse_exit(raw)
        return (rc, raw, src) if rc is not None else (None, raw[:200], src)
    return None, None, None
def cmd_preflight(a):
    P = paths(a.rw, a.name, a.tag); here = Path(__file__).resolve().parent; files = {}
    for k, f in (('driver', here / 'f4_lock_driver.py'), ('storage', here / 'f4_storage.py'), ('readback', here / 'f1_readback.py'), ('m1helper', here / 'f4_m1.py'), ('deadline', here / 'context_deadline.py'), ('telemetry', here / 'native_telemetry.py'), ('jobs', P['jobs'])):
        files[k] = sha256_file(f) if f.is_file() else None
    out = P['out']; stats = {}; run_ = running_drivers(out, a.name, stats)
    return {'files': files, 'lock': lock_state(out) if out.is_dir() else {'state': 'none'}, 'running': run_, 'unreadable_cmdlines': stats.get('unreadable'), 'out_exists': out.is_dir(),
            'outputs': len(list(out.glob('*.json'))) if out.is_dir() else 0, 'log_exists': P['log'].exists(), 'exit_exists': P['exit'].exists() or Path(str(P['exit']) + '.tmp').exists()}
def cmd_status(a):
    P = paths(a.rw, a.name, a.tag); rc, raw, src = read_exit(P['exit'])
    return {'exit_rc': rc, 'exit_raw': raw, 'exit_source': src, 'lock': lock_state(P['out']) if P['out'].is_dir() else {'state': 'none'}, 'running': running_drivers(P['out'], a.name), 'log_exists': P['log'].exists()}
def cmd_run(a):
    P = paths(a.rw, a.name, a.tag)
    if P['exit'].exists() or Path(str(P['exit']) + '.tmp').exists(): return {'refused': 'exit marker %s already exists' % P['exit']}, REFUSED
    try: logf = open(P['log'], 'x')
    except FileExistsError: return {'refused': 'run log %s already exists (never truncated)' % P['log']}, REFUSED
    with logf:
        cmd = [sys.executable, '-B', str(Path(__file__).resolve().parent / 'f4_lock_driver.py'), '--pipeline-root', a.pipeline_root, '--inputs', a.inputs, '--jobs', str(P['jobs']),
               '--out', str(P['out']), '--threads', str(a.threads)] + (['--wash'] if a.wash else [])
        logf.write('[f4_m1] start %s name %s tag %s pid %d\n' % (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), a.name, a.tag, os.getpid())); logf.flush()
        p = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=logf, stderr=subprocess.STDOUT, cwd=str(P['rw']), env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
        rc = p.wait()
        if rc < 0: rc = 128 - rc   # POSIX signal death: 128 + signal, never 0
        tmp = P['exit'].with_name(P['exit'].name + '.tmp'); tmp.write_text('EXIT=%d\n' % rc)
        try: replace_retry(tmp, P['exit'])
        except OSError as e: logf.write('[f4_m1] exit marker left as %s (%r)\n' % (tmp.name, e))
        logf.write('[f4_m1] EXIT=%d %s\n' % (rc, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))
    return {'exit_rc': rc}, rc
def main(argv=None):
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest='cmd', required=True)
    for c in ('preflight', 'run', 'status'):
        q = sp.add_parser(c); q.add_argument('--rw', required=True); q.add_argument('--name', required=True); q.add_argument('--tag', required=True, choices=('first', 'spare1'))
        if c == 'run':
            q.add_argument('--pipeline-root', required=True); q.add_argument('--inputs', required=True); q.add_argument('--threads', type=int, required=True); q.add_argument('--wash', action='store_true')
    a = ap.parse_args(argv)
    if c_bad(a.name): print('F4M1 ' + json.dumps({'refused': 'bad name'})); return 2
    if a.cmd == 'run': res, rc = cmd_run(a)
    else: res, rc = (cmd_preflight(a) if a.cmd == 'preflight' else cmd_status(a)), 0
    print('F4M1 ' + json.dumps(res), flush=True); return rc
def c_bad(name): return not name or any(not (ch.isalnum() or ch in '._-') for ch in name) or not name.isascii()
if __name__ == '__main__': sys.exit(main())
