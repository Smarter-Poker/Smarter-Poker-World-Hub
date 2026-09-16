#!/usr/bin/env python3
"""Run only the owner-notification SQL slice with a separately sealed provider.

Provider installation/admission belongs to the runner owner. No default provider,
dependency installation, financial fixture copying into Git, resume, or retry.
The adjacent wrapper tests run first in the same required workflow step.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import signal
import stat
import subprocess
import sys
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
BASE = Path('/srv/ci-validation')
PG = '/usr/lib/postgresql/17/bin'
REPLACEMENTS = {
    'inputs/candidate.sql': 'supabase/components/owner-operational-notification-destination.sql',
    'inputs/qualification.sql': 'scripts/qualification/owner-operational-notification-destination.sql',
}
REQUIRED = set(REPLACEMENTS) | {
    'run.py', 'inputs/schema.sql', 'inputs/access.sql', 'inputs/policies.sql',
    'inputs/catalog-sequence-exact.json', 'origins.json', 'principals.sql',
    'provider-supplement.sql', 'provider-roles.sql', 'provider-roles-check.sql',
    'provider-check.sql', 'empty-provider-check.sql', 'readback.sql',
    'inputs/linked-invoice-positive.sql', 'inputs/captured-financial-store-policy.sql',
}
RESOURCES = {'cpu': 1, 'memory_bytes': 2147483648, 'swap_bytes': 0,
             'tasks': 128, 'work_seconds': 240, 'cleanup_seconds': 30,
             'unit_runtime_seconds': 270, 'scratch_bytes': 2147483648}
CLEAN_ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
# A fixed, source-specific environment boundary; no caller command is accepted.
# Retain systemd's actual invocation identity, not any CI or production secrets.
WORKER_ENTRY = (
    'import os,sys; '
    'os.execve("/usr/bin/python3", ["/usr/bin/python3", "-I"] + sys.argv[1:], '
    '{"PATH":"/usr/bin:/bin", "LANG":"C.UTF-8", "LC_ALL":"C.UTF-8", '
    '"INVOCATION_ID":os.environ.get("INVOCATION_ID", "")})'
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pin(data):
    return {'sha256': digest(data), 'bytes': len(data)}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'duplicate JSON member: ' + key)
        result[key] = value
    return result


def decode(data):
    return json.loads(data, object_pairs_hook=unique_object)


def safe_name(name):
    require(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', name)
            and all(part not in ('.', '..') for part in PurePosixPath(name).parts)
            and name != 'manifest.json', 'unsafe provider leaf')
    return name


def root_custody(path):
    """Reject writable/symlink ancestors as well as a mutable leaf."""
    require(path.is_absolute(), 'absolute provider path required')
    for item in (path, *path.parents):
        info = item.lstat()
        require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0
                and not info.st_mode & 0o022, 'provider must be root-owned and non-writable: ' + str(item))


def read_regular(path, limit):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= limit,
            'non-regular, linked or oversized source: ' + str(path))
    def identity(value):
        # Reading may legitimately update atime; mutation-relevant fields may not change.
        return (value.st_dev, value.st_ino, value.st_mode, value.st_uid, value.st_gid,
                value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
    with path.open('rb') as handle:
        require(identity(os.fstat(handle.fileno())) == identity(info), 'source changed before read')
        data = handle.read(limit + 1)
    require(len(data) == info.st_size and identity(path.lstat()) == identity(info), 'source changed during read')
    return data


def load_provider(directory, expected_sha):
    require(re.fullmatch(r'[0-9a-f]{64}', expected_sha or ''), 'configured provider manifest SHA256 required')
    path = Path(directory)
    require(directory and path.is_absolute() and path == path.resolve()
            and ROOT not in path.parents and path != ROOT, 'explicit external canonical provider directory required')
    root_custody(path)
    manifest_path = path / 'manifest.json'
    root_custody(manifest_path)
    raw = read_regular(manifest_path, 262144)
    require(digest(raw) == expected_sha, 'provider manifest digest mismatch')
    manifest = decode(raw)
    require(manifest.get('resources') == RESOURCES, 'provider resource contract drift')
    entries = manifest.get('files')
    require(isinstance(entries, dict) and REQUIRED <= entries.keys() and len(entries) <= 64,
            'provider inventory incomplete or oversized')
    files, total = {}, 0
    for name, expected in entries.items():
        safe_name(name)
        require(isinstance(expected, dict) and set(expected) == {'sha256', 'bytes'}
                and type(expected['bytes']) is int and 0 <= expected['bytes'] <= 16777216
                and isinstance(expected['sha256'], str) and re.fullmatch(r'[0-9a-f]{64}', expected['sha256']),
                'malformed provider pin')
        leaf = path / name
        root_custody(leaf)
        data = read_regular(leaf, 16777216)
        require(pin(data) == expected, 'provider leaf mismatch: ' + name)
        total += len(data)
        require(total <= 16777216, 'provider source budget exceeded')
        files[name] = data
    actual, objects = set(), 0
    for current, dirs, leaves in os.walk(path, followlinks=False):
        for name in dirs + leaves:
            objects += 1
            require(objects <= 128, 'provider directory inventory exceeded bound')
            item = Path(current) / name
            root_custody(item)
            require(item.is_dir() or item.is_file(), 'special provider object')
        actual.update((Path(current) / name).relative_to(path).as_posix() for name in leaves)
    require(actual == set(entries) | {'manifest.json'}, 'unpinned provider leaves')
    return raw, manifest, files


def attempt_source(manifest, files, replacements, provenance):
    require(set(replacements) == set(REPLACEMENTS), 'only the two reviewed checkout inputs may replace provider leaves')
    result, copied = copy.deepcopy(manifest), dict(files)
    for name, data in replacements.items():
        require(isinstance(data, bytes) and 0 < len(data) <= 1048576, 'invalid checkout SQL input')
        copied[name] = data
        result['files'][name] = pin(data)
    # Existing source_owner_commit describes the sealed provider's origin. Do
    # not rewrite that history; ci_provenance.attempt_source_commit names the
    # current checkout whose two SQL blobs this attempt actually exercises.
    result['ci_provenance'] = provenance
    require(all(result['files'][name] == manifest['files'][name]
                for name in files if name not in REPLACEMENTS), 'fixed provider authority changed')
    return result, copied


def namespace(value):
    require(isinstance(value, str) and re.fullmatch(r'net:\[[1-9][0-9]*\]', value), 'invalid observed host network namespace')
    return value


def launch_command(unit, source, execution, ordinary, host_ns):
    return ['sudo', '-n', '/usr/bin/systemd-run', '--unit=' + unit, '--wait', '--pipe',
            '-p', 'User=lima', '-p', 'Group=lima', '-p', 'CPUQuota=100%',
            '-p', 'MemoryMax=2G', '-p', 'MemorySwapMax=0', '-p', 'TasksMax=128',
            '-p', 'RuntimeMaxSec=270', '-p', 'TimeoutStopSec=25',
            '-p', 'KillMode=control-group', '-p', 'PrivateNetwork=yes', '-p', 'UMask=0077',
            '/usr/bin/python3', '-I', '-c', WORKER_ENTRY, str(source / 'run.py'),
            '--execution', execution, '--ordinary-user', ordinary, '--host-netns', namespace(host_ns)]


def parse_unit(output):
    values = {}
    for line in output.splitlines():
        key, separator, value = line.partition('=')
        require(separator and key not in values, 'malformed unit readback')
        values[key] = value
    return values


def terminal_unit(values, expected_cgroup):
    require(values.get('LoadState') in ('loaded', 'not-found'), 'unknown unit identity')
    require(values.get('ActiveState') in ('inactive', 'failed') and values.get('MainPID') == '0',
            'owned unit remains live or unknown')
    require(values.get('ControlGroup') in ('', expected_cgroup), 'wrong owned control group')


def validate_receipt(receipt, execution, ordinary, manifest_sha, host_ns, expected_cgroup, terminal):
    require(receipt.get('execution') == execution and receipt.get('source_manifest_sha256') == manifest_sha,
            'wrong/stale qualification receipt')
    require(receipt.get('native_status') == 'sql_slice_passed_cleanup_observed'
            and receipt.get('sql_slice_passed') is True and receipt.get('cleanup_verified') is True
            and receipt.get('cleanup_errors') == [] and receipt.get('source_stable') is True,
            'SQL or cleanup did not qualify')
    require(receipt.get('full_qualification') is False and receipt.get('connected_services_qualified') is False,
            'unexpected claim beyond SQL slice')
    invocation = receipt.get('systemd_invocation')
    require(isinstance(invocation, str) and re.fullmatch(r'[0-9a-f]{32}', invocation), 'missing actual systemd invocation')
    if terminal.get('LoadState') == 'loaded':
        require(terminal.get('InvocationID') == invocation and terminal.get('ExecMainStatus') == '0'
                and terminal.get('Result') == 'success', 'unit/receipt invocation or outcome mismatch')
    else:
        require(terminal.get('LoadState') == 'not-found' and terminal.get('InvocationID') in ('', invocation),
                'missing independent terminal unit readback')
    require(receipt.get('cgroup') == expected_cgroup and receipt.get('host_netns') == host_ns
            and namespace(receipt.get('worker_netns')) != host_ns, 'isolation identity mismatch')
    controls = receipt.get('resource_controls', {})
    quota = controls.get('cpu.max', '').split()
    require(len(quota) == 2 and all(re.fullmatch(r'[0-9]+', part) for part in quota)
            and 0 < int(quota[0]) <= int(quota[1]) and controls.get('memory.max') == '2147483648'
            and controls.get('memory.swap.max') == '0' and controls.get('pids.max') == '128', 'receipt resource drift')
    stages = receipt.get('stages')
    require(isinstance(stages, list) and 0 < len(stages) <= 64, 'missing bounded original stage evidence')
    names = [stage.get('stage') for stage in stages]
    expected = ['prepare', 'committed_prepare_observer', 'candidate', 'verify',
                'committed_verify_observer', 'linked_invoice_positive']
    require(all(names.count(name) == 1 for name in expected)
            and [names.index(name) for name in expected] == sorted(names.index(name) for name in expected),
            'original phase sequence absent or repeated')
    for name in expected:
        stage = stages[names.index(name)]
        require(stage.get('returncode') == 0 and isinstance(stage.get('argv'), list)
                and stage['argv'][0] == PG + '/psql'
                and 'execution_uuid=' + execution in stage['argv']
                and 'ordinary_user_uuid=' + ordinary in stage['argv'], 'stage identity or outcome mismatch')


class AttemptCancelled(Exception):
    pass


class Attempt:
    def __init__(self):
        self.execution, self.ordinary = str(uuid.uuid4()), str(uuid.uuid4())
        self.unit = 'wh-notify-' + self.execution + '.service'
        self.allocation = BASE / ('wh-notify-' + self.execution)
        self.cgroup = '/system.slice/' + self.unit
        self.out = ROOT / 'artifacts' / 'owner-notification-pg17' / self.execution
        self.out.mkdir(parents=True, mode=0o700, exist_ok=False)
        self.result = {'execution': self.execution, 'ordinary_user': self.ordinary,
                       'allocation': str(self.allocation), 'unit': self.unit, 'commands': [],
                       'passed': False, 'full_qualification': False, 'cleanup_verified': False,
                       'failures': [], 'source_wrapper_sha256': digest(Path(__file__).read_bytes())}
        self.launched = False
        self.stop_requested = False
        self.clients = []
        self.persist()

    def persist(self):
        temp = self.out / 'RESULT.tmp'
        with temp.open('w') as handle:
            json.dump(self.result, handle, indent=2); handle.write('\n'); handle.flush(); os.fsync(handle.fileno())
        os.replace(temp, self.out / 'RESULT.json')

    def command(self, name, argv, timeout, allow=(0,)):
        entry = {'name': name, 'argv': argv, 'timeout': timeout}
        self.result['commands'].append(entry); self.persist()
        output, error = self.out / (name + '.stdout'), self.out / (name + '.stderr')
        with output.open('xb') as out, error.open('xb') as err:
            child = subprocess.Popen(argv, stdout=out, stderr=err, env=CLEAN_ENV, start_new_session=True)
            entry['client_pid'] = child.pid
            self.clients.append((child, entry))
            try:
                child.wait(timeout=timeout)
            except BaseException:
                # This kills only the command client, never certifies its service.
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except OSError as error:
                    # sudo's client may no longer be signalable by lima. Keep
                    # its original handle for observation after own-unit stop.
                    entry['client_signal_error'] = str(error)
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    entry['client_exit_unobserved'] = True
                entry['interrupted'] = True
                raise
            finally:
                entry['returncode'] = child.returncode
                self.persist()
        require(child.returncode in allow, name + ': command failed; inspect retained original log')
        return output.read_bytes()

    def observe_clients(self, deadline):
        for child, entry in self.clients:
            if child.poll() is None:
                remaining = deadline - time.monotonic()
                require(remaining > 0, 'original client cleanup deadline exhausted')
                child.wait(timeout=min(2, remaining))
            entry['terminal_returncode'] = child.returncode
            require(child.returncode is not None, 'original command client exit unobserved')
        self.result['original_clients_terminal'] = True

    def checkout(self):
        head = self.command('checkout_head', ['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], 5).decode().strip()
        tree = self.command('checkout_tree', ['git', '-C', str(ROOT), 'rev-parse', 'HEAD^{tree}'], 5).decode().strip()
        require(re.fullmatch(r'[0-9a-f]{40}', head) and re.fullmatch(r'[0-9a-f]{40}', tree), 'invalid checkout identity')
        replacements = {}
        for i, (name, source) in enumerate(REPLACEMENTS.items()):
            actual = read_regular(ROOT / source, 1048576)
            committed = self.command('checkout_sql_' + str(i), ['git', '-C', str(ROOT), 'show', head + ':' + source], 5)
            require(actual == committed, 'checkout SQL differs from actual committed revision')
            replacements[name] = actual
        return {'head': head, 'tree': tree, 'checkout': str(ROOT),
                'inputs': {REPLACEMENTS[name]: pin(data) for name, data in replacements.items()}}, replacements

    def prepare(self):
        require(sys.platform == 'linux' and os.geteuid() == pwd.getpwnam('lima').pw_uid,
                'existing Linux lima CI runner required; no root SQL')
        require(os.environ.get('PG_BIN') == PG, 'resolver must select the reviewed Linux PG17 path')
        root_custody(BASE)
        directory = os.environ.get('OWNER_NOTIFICATION_PG17_PROVIDER_DIR', '')
        expected = os.environ.get('OWNER_NOTIFICATION_PG17_PROVIDER_SHA256', '')
        raw, provider, files = load_provider(directory, expected)
        checkout, replacements = self.checkout()
        provenance = {'provider_directory': directory, 'provider_manifest_sha256': expected,
                      'provider_declared_source_owner_commit': provider.get('source_owner_commit'),
                      'attempt_source_commit': checkout['head'], 'checkout': checkout,
                      'execution': self.execution, 'ordinary_user': self.ordinary}
        self.result['provenance'] = provenance
        (self.out / 'provider-manifest.json').write_bytes(raw)
        manifest, copied = attempt_source(provider, files, replacements, provenance)
        raw_attempt = (json.dumps(manifest, indent=2) + '\n').encode()
        self.result['source_manifest_sha256'] = digest(raw_attempt)
        self.persist()
        # mkdir, not install -d: an existing attempt must never be overwritten.
        self.command('allocate', ['sudo', '-n', '/usr/bin/mkdir', '-m', '1770', str(self.allocation)], 5)
        self.command('allocation_group', ['sudo', '-n', '/usr/bin/chgrp', 'lima', str(self.allocation)], 5)
        source = self.allocation / 'source'
        source.mkdir(mode=0o700)
        for name, data in copied.items():
            leaf = source / name
            leaf.parent.mkdir(parents=True, exist_ok=True)
            with leaf.open('xb') as handle:
                handle.write(data); handle.flush(); os.fsync(handle.fileno())
            leaf.chmod(0o444)
        (source / 'manifest.json').write_bytes(raw_attempt)
        (source / 'manifest.json').chmod(0o444)
        for current, dirs, _ in os.walk(source, topdown=False):
            Path(current).chmod(0o555)
        self.command('seal_source_owner', ['sudo', '-n', '/usr/bin/chown', '-R', 'root:root', str(source)], 5)
        for leaf in [source, *(source / name for name in copied), source / 'manifest.json']:
            info = leaf.lstat()
            require(info.st_uid == 0 and not info.st_mode & 0o022 and not stat.S_ISLNK(info.st_mode),
                    'staged source seal not observed')
        require((source / 'manifest.json').read_bytes() == raw_attempt
                and all(pin(read_regular(source / name, 16777216)) == manifest['files'][name] for name in copied),
                'staged source readback mismatch')
        # Fresh root observation, never reading /proc/1 from the nonroot worker.
        host_ns = namespace(self.command('host_netns', ['sudo', '-n', '/usr/bin/readlink', '/proc/1/ns/net'], 5).decode().strip())
        self.result['host_netns'] = host_ns; self.persist()
        return source, host_ns

    def terminal(self, deadline):
        def budget():
            remaining = deadline - time.monotonic() - 2
            require(remaining > 0, 'original outer cleanup deadline exhausted')
            return min(5, remaining)
        properties = 'LoadState,ActiveState,SubState,Result,ExecMainStatus,MainPID,ControlGroup,InvocationID'
        # Each observation is bounded; this is own-unit stop completion, no retry.
        i = 0
        while True:
            raw = self.command('terminal_unit_' + str(i), ['sudo', '-n', '/usr/bin/systemctl', 'show', self.unit,
                               '--property=' + properties], budget(), allow=(0, 1, 4))
            values = parse_unit(raw.decode())
            self.result['terminal_unit'] = values
            if values.get('ActiveState') in ('inactive', 'failed') and values.get('MainPID') == '0':
                terminal_unit(values, self.cgroup)
                path = Path('/sys/fs/cgroup') / self.cgroup.lstrip('/')
                try:
                    path.lstat()
                except FileNotFoundError:
                    self.result['terminal_cgroup'] = {'path': self.cgroup, 'absent': True}
                    return values
                events = dict(line.split() for line in (path / 'cgroup.events').read_text().splitlines())
                procs = (path / 'cgroup.procs').read_text().split()
                self.result['terminal_cgroup'] = {'path': self.cgroup, 'absent': False, 'events': events, 'procs': procs}
                if events.get('populated') == '0' and not procs:
                    return values
            require(values.get('ControlGroup') in ('', self.cgroup), 'foreign unit group observed')
            if not self.stop_requested:
                self.result['failures'].append({'stage': 'terminal', 'message': 'launch client ended before owned unit/group stopped'})
                self.stop_requested = True
                self.command('stop_after_live_readback', ['sudo', '-n', '/usr/bin/systemctl', 'stop', '--no-block', self.unit], budget())
            time.sleep(min(0.2, max(0, deadline - time.monotonic() - 2)))
            i += 1

    def run(self):
        terminal = None
        try:
            source, host_ns = self.prepare()
            self.launched = True  # A failed client can still have started its unit.
            # Transport envelope only: original unit270 + systemd stop25 +3s.
            # The sealed runner retains its original SQL240 + cleanup30 clocks.
            self.command('systemd_qualifier', launch_command(self.unit, source, self.execution, self.ordinary, host_ns), 298)
        except BaseException as error:
            self.result['failures'].append({'type': type(error).__name__, 'message': str(error)})
        finally:
            for sig in (signal.SIGINT, signal.SIGTERM):
                signal.signal(sig, signal.SIG_IGN)
            deadline = time.monotonic() + 30
            if self.launched:
                if self.result['failures']:
                    try:
                        self.stop_requested = True
                        self.command('stop_owned_unit', ['sudo', '-n', '/usr/bin/systemctl', 'stop', '--no-block', self.unit], 5)
                    except BaseException as error:
                        self.result['failures'].append({'stage': 'owned_stop', 'message': str(error)})
                try:
                    terminal = self.terminal(deadline)
                    self.result['cleanup_verified'] = True
                except BaseException as error:
                    self.result['failures'].append({'stage': 'terminal', 'message': str(error)})
                try:
                    raw = read_regular(self.allocation / 'work/receipt.json', 1048576)
                    (self.out / 'qualification-receipt.json').write_bytes(raw)
                    receipt = decode(raw)
                    validate_receipt(receipt, self.execution, self.ordinary, self.result['source_manifest_sha256'],
                                     self.result['host_netns'], self.cgroup, terminal or {})
                    self.result['qualification_receipt_sha256'] = digest(raw)
                except BaseException as error:
                    self.result['failures'].append({'stage': 'qualification_receipt', 'message': str(error)})
            try:
                self.observe_clients(deadline)
            except BaseException as error:
                self.result['failures'].append({'stage': 'original_clients', 'message': str(error)})
            self.result['passed'] = (self.launched and self.result['cleanup_verified']
                                     and self.result.get('original_clients_terminal') is True and not self.result['failures'])
            self.persist()
        print(json.dumps({'passed': self.result['passed'], 'execution': self.execution,
                          'evidence': str(self.out), 'retained_allocation': str(self.allocation), 'full_qualification': False}))
        return 0 if self.result['passed'] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true', help='only bounded wrapper regressions, no SQL/systemd')
    args = parser.parse_args()
    if args.self_test:
        path = Path(__file__).with_name('test_owner_operational_notification_wrapper.py')
        spec = importlib.util.spec_from_file_location('owner_notification_wrapper_tests', path)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return 0 if unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(module)).wasSuccessful() else 1
    attempt = Attempt()
    def interrupted(signum, _frame):
        raise AttemptCancelled('original CI command cancelled by signal ' + str(signum))
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    return attempt.run()


if __name__ == '__main__':
    raise SystemExit(main())
