#!/usr/bin/env python3
"""Measure how much memory a build really takes, the way a container sees it.

Usage: python3 scripts/ci/measure-build-memory.py --label <name> --out <dir> -- <command...>

Why this exists (2026-11-28): Vercel's 4-core / 8 GB Standard Build Machine
SIGKILLed `npm run build:vercel` (exit 137, "Out of Memory event detected")
on every commit from f2412480 onward, while CI's Vercel Build Parity job,
which runs the same command on a 16 GB runner, passed. A pass on a bigger
machine says nothing about the peak. The container kills on the SUM of every
process it holds, so this reports that sum, not just one process.

It runs the command under `/usr/bin/time -v` (whose "Maximum resident set
size" is the largest single descendant), and samples every descendant's RSS
and PSS every half second. The sum of PSS is the closest userspace number to
what the cgroup counts. Each sample is tagged with the build phase (taken
from Next's own log lines), so the report says WHEN the peak happens.

Read-only with respect to the repository: it only runs the command it is
given and writes into --out.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time

PHASES = [
    ('pre-build tests and scripts', None),
    ('compile', re.compile(r'Creating an optimized production build')),
    ('collect page data', re.compile(r'Collecting page data')),
    ('static generation', re.compile(r'Generating static pages')),
    ('finalize and traces', re.compile(r'Finalizing page optimization|Collecting build traces')),
    ('post-build checks', re.compile(r'^\s*Route \(pages\)|^\s*Route \(app\)|First Load JS')),
]


def read_proc_table():
    table = {}
    for name in os.listdir('/proc'):
        if not name.isdigit():
            continue
        pid = int(name)
        try:
            with open(f'/proc/{pid}/stat', 'rb') as fh:
                stat = fh.read().decode('utf-8', 'replace')
            # comm can contain spaces and parens; split after the last ')'
            rest = stat[stat.rfind(')') + 2:].split()
            ppid = int(rest[1])
            with open(f'/proc/{pid}/cmdline', 'rb') as fh:
                cmd = fh.read().replace(b'\0', b' ').decode('utf-8', 'replace').strip()
            table[pid] = (ppid, cmd)
        except (OSError, ValueError, IndexError):
            continue
    return table


def descendants(root, table):
    children = {}
    for pid, (ppid, _cmd) in table.items():
        children.setdefault(ppid, []).append(pid)
    out, stack = [], [root]
    while stack:
        pid = stack.pop()
        out.append(pid)
        stack.extend(children.get(pid, []))
    return out


def mem_of(pid):
    rss = pss = 0
    try:
        with open(f'/proc/{pid}/smaps_rollup') as fh:
            for line in fh:
                if line.startswith('Rss:'):
                    rss = int(line.split()[1])
                elif line.startswith('Pss:'):
                    pss = int(line.split()[1])
    except OSError:
        try:
            with open(f'/proc/{pid}/status') as fh:
                for line in fh:
                    if line.startswith('VmRSS:'):
                        rss = pss = int(line.split()[1])
        except OSError:
            pass
    return rss, pss


def label_for(cmd):
    cmd = re.sub(r'\s+', ' ', cmd)
    for needle, name in (
        ('next build', 'next build (main)'),
        ('next/dist/bin/next', 'next build (main)'),
        ('static-worker', 'next static worker'),
        ('webpack-build', 'next webpack build worker'),
        ('collect-build-traces', 'next build-trace worker'),
        ('jest-worker', 'next jest worker'),
        ('processChild', 'next jest worker'),
        ('node --test', 'node --test'),
    ):
        if needle in cmd:
            return name
    return cmd[:90]


def system_used_kb():
    info = {}
    with open('/proc/meminfo') as fh:
        for line in fh:
            key, value = line.split(':', 1)
            info[key] = int(value.split()[0])
    return info['MemTotal'] - info['MemAvailable']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--label', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--interval', type=float, default=0.5)
    ap.add_argument('cmd', nargs=argparse.REMAINDER)
    args = ap.parse_args()
    cmd = args.cmd[1:] if args.cmd and args.cmd[0] == '--' else args.cmd
    if not cmd:
        ap.error('no command given')
    os.makedirs(args.out, exist_ok=True)
    timev_path = os.path.join(args.out, f'{args.label}.time-v.txt')
    log_path = os.path.join(args.out, f'{args.label}.build.log')

    baseline_used = system_used_kb()
    start = time.time()
    # /usr/bin/time -v reports the largest single descendant's max RSS.
    wrapper = ['/usr/bin/time', '-v', '-o', timev_path] if os.path.exists('/usr/bin/time') else []
    proc = subprocess.Popen(wrapper + cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    state = {'phase': PHASES[0][0], 'done': False}
    samples = []
    per_proc_peak = {}
    phase_start = {PHASES[0][0]: 0.0}

    def sampler():
        while not state['done']:
            table = read_proc_table()
            tree = descendants(proc.pid, table)
            rss_sum = pss_sum = 0
            for pid in tree:
                rss, pss = mem_of(pid)
                rss_sum += rss
                pss_sum += pss
                if pid in table and rss:
                    key = (pid, label_for(table[pid][1]))
                    if rss > per_proc_peak.get(key, 0):
                        per_proc_peak[key] = rss
            samples.append({
                't': round(time.time() - start, 2),
                'phase': state['phase'],
                'procs': len(tree),
                'rss_kb': rss_sum,
                'pss_kb': pss_sum,
                'sys_used_delta_kb': system_used_kb() - baseline_used,
            })
            time.sleep(args.interval)

    thread = threading.Thread(target=sampler, daemon=True)
    thread.start()
    with open(log_path, 'w') as log:
        for raw in proc.stdout:
            line = raw.decode('utf-8', 'replace')
            for name, pattern in PHASES[1:]:
                if pattern is not None and pattern.search(line) and state['phase'] != name:
                    if PHASES.index((name, pattern)) > [p[0] for p in PHASES].index(state['phase']):
                        state['phase'] = name
                        phase_start[name] = round(time.time() - start, 2)
            stamp = f'[{time.time() - start:7.1f}s] '
            log.write(stamp + line)
            sys.stdout.write(stamp + line)
            sys.stdout.flush()
    code = proc.wait()
    state['done'] = True
    thread.join(timeout=5)

    max_rss_single_kb = None
    try:
        with open(timev_path) as fh:
            for line in fh:
                if 'Maximum resident set size' in line:
                    max_rss_single_kb = int(line.rsplit(':', 1)[1])
    except OSError:
        pass

    def peak(key, phase=None):
        pool = [s for s in samples if phase is None or s['phase'] == phase]
        return max(pool, key=lambda s: s[key]) if pool else None

    mb = lambda kb: round(kb / 1024) if kb is not None else None
    by_phase = {}
    for name, _ in PHASES:
        p = peak('pss_kb', name)
        if p:
            by_phase[name] = {
                'starts_at_s': phase_start.get(name),
                'peak_tree_pss_mb': mb(p['pss_kb']),
                'peak_tree_rss_mb': mb(peak('rss_kb', name)['rss_kb']),
                'peak_system_used_delta_mb': mb(peak('sys_used_delta_kb', name)['sys_used_delta_kb']),
                'peak_at_s': p['t'],
            }
    top = sorted(per_proc_peak.items(), key=lambda kv: -kv[1])[:10]
    overall = peak('pss_kb')
    report = {
        'label': args.label,
        'exit_code': code,
        'cpus_on_runner': os.cpu_count(),
        'duration_s': round(time.time() - start, 1),
        'time_v_max_rss_single_process_mb': mb(max_rss_single_kb),
        'peak_tree_pss_mb': mb(overall['pss_kb']) if overall else None,
        'peak_tree_rss_mb': mb(peak('rss_kb')['rss_kb']) if samples else None,
        'peak_system_used_delta_mb': mb(peak('sys_used_delta_kb')['sys_used_delta_kb']) if samples else None,
        'peak_at_s': overall['t'] if overall else None,
        'peak_phase': overall['phase'] if overall else None,
        'by_phase': by_phase,
        'top_processes': [{'pid': k[0], 'what': k[1], 'peak_rss_mb': mb(v)} for k, v in top],
    }
    with open(os.path.join(args.out, f'{args.label}.json'), 'w') as fh:
        json.dump({'report': report, 'samples': samples}, fh)

    lines = [
        f'### Build memory: {args.label}',
        '',
        f'exit {code}, {report["duration_s"]} s, {report["cpus_on_runner"]} cpus on the runner',
        '',
        '| measure | MB |',
        '|---|---|',
        f'| /usr/bin/time -v max RSS (largest single process) | {report["time_v_max_rss_single_process_mb"]} |',
        f'| peak sum of PSS over the process tree | {report["peak_tree_pss_mb"]} (at {report["peak_at_s"]} s, {report["peak_phase"]}) |',
        f'| peak sum of RSS over the process tree | {report["peak_tree_rss_mb"]} |',
        f'| peak system memory in use above baseline | {report["peak_system_used_delta_mb"]} |',
        '',
        '| phase | starts (s) | peak tree PSS | peak tree RSS | peak system delta |',
        '|---|---|---|---|---|',
    ]
    for name, v in by_phase.items():
        lines.append(f'| {name} | {v["starts_at_s"]} | {v["peak_tree_pss_mb"]} | {v["peak_tree_rss_mb"]} | {v["peak_system_used_delta_mb"]} |')
    lines += ['', '| process | peak RSS MB |', '|---|---|']
    for t in report['top_processes']:
        lines.append(f'| {t["what"]} (pid {t["pid"]}) | {t["peak_rss_mb"]} |')
    text = '\n'.join(lines) + '\n'
    print('\n' + text)
    print('BUILD_MEMORY_JSON ' + json.dumps(report))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as fh:
            fh.write(text + '\n')
    return code


if __name__ == '__main__':
    sys.exit(main())
