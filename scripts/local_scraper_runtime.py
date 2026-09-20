"""Install and supervise the local PokerAtlas daemon from a verified release.

The launchd entrypoint lives outside the release it checks. A missing script
cannot prevent its supervisor from recording the startup failure. This module
uses only the Python standard library; it never installs dependencies.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid


FILES = (
    'scripts/pokeratlas-live-daemon.py',
    'scripts/scraper_data_truth.py',
    'scripts/browser_heal.py',
)
INPUTS = ('all-venues.json', 'pokeratlas-slug-map.json')
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'


class RuntimeFault(RuntimeError):
    """A fixed, secret-free failure code safe for the operational inbox."""


def atomic_write(path, data, mode=0o600):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            os.fchmod(out.fileno(), mode)
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
        fsync_dir(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def read_json(path, code):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        raise RuntimeFault(code) from None


def credentials(root):
    auth = read_json(root / 'auth.json', 'credentials_unreadable')
    if not isinstance(auth, dict) or auth.get('url') != SUPABASE_URL:
        raise RuntimeFault('credentials_wrong_project')
    if not isinstance(auth.get('key'), str) or len(auth['key']) < 30:
        raise RuntimeFault('credentials_missing')
    if (root / 'auth.json').stat().st_mode & 0o077:
        raise RuntimeFault('credentials_permissions')
    return auth


def inspect_release(root):
    try:
        release = (root / 'current').resolve(strict=True)
    except OSError:
        raise RuntimeFault('release_missing') from None
    if release.parent != (root / 'releases').resolve() or not re.fullmatch('[0-9a-f]{40}', release.name):
        raise RuntimeFault('release_path_invalid')
    manifest = read_json(release / 'manifest.json', 'manifest_unreadable')
    if not isinstance(manifest, dict) or manifest.get('revision') != release.name:
        raise RuntimeFault('manifest_revision_mismatch')
    hashes = manifest.get('files')
    if not isinstance(hashes, dict) or set(hashes) != set(FILES):
        raise RuntimeFault('manifest_file_set_mismatch')
    for name in FILES:
        path = release / name
        if path.is_symlink() or not path.is_file():
            raise RuntimeFault('release_file_missing')
        if hashlib.sha256(path.read_bytes()).hexdigest() != hashes[name]:
            raise RuntimeFault('release_file_changed')
    config = manifest.get('runtime')
    if not isinstance(config, dict) or not all(isinstance(config.get(k), str) for k in ('state_dir', 'python')):
        raise RuntimeFault('configuration_invalid')
    if not Path(config['state_dir']).is_absolute() or not Path(config['python']).is_absolute():
        raise RuntimeFault('configuration_paths_invalid')
    state = Path(config['state_dir']).resolve()
    if not state.is_dir() or (release / 'data').resolve() != state:
        raise RuntimeFault('state_directory_invalid')
    for name in INPUTS:
        value = read_json(state / name, 'catalog_input_unreadable')
        if not isinstance(value, (dict, list)) or not value:
            raise RuntimeFault('catalog_input_empty')
    return release, manifest, config


def queue_fault(root, code, revision='unknown'):
    # The same failed release/startup condition is one incident across retries.
    key = hashlib.sha256((revision + ':' + code).encode()).hexdigest()
    event = {'p_source': 'local.pokeratlas-runtime', 'p_event_key': key,
             'p_alertname': 'LocalScraperRuntimeFailure', 'p_status': 'firing',
             'p_severity': 'critical',
             'p_payload': {'failure_code': code, 'release_revision': revision}}
    path = root / 'outbox' / (key + '.json')
    # A receipt acknowledges delivery, not remediation. Repeated launchd
    # attempts must not create new episodes or erase a pending observation.
    if not path.exists():
        atomic_write(path, json_bytes(event))
    return path


def flush_outbox(root, opener=urllib.request.urlopen):
    auth = credentials(root)
    pending = sorted((root / 'outbox').glob('*.json'))
    for path in pending:
        event = read_json(path, 'outbox_unreadable')
        if not isinstance(event, dict) or not isinstance(event.get('p_event_key'), str):
            raise RuntimeFault('outbox_invalid')
        receipt_file = root / 'receipts' / path.name
        if receipt_file.exists():
            receipt = read_json(receipt_file, 'receipt_unreadable')
            if not isinstance(receipt, dict) or receipt.get('event_key') != event['p_event_key'] or type(receipt.get('id')) is not int or receipt['id'] <= 0:
                raise RuntimeFault('receipt_invalid')
            continue
        request = urllib.request.Request(
            auth['url'] + '/rest/v1/rpc/fn_record_operational_alert',
            data=json_bytes(event), method='POST',
            headers={'apikey': auth['key'], 'Authorization': 'Bearer ' + auth['key'],
                     'Content-Type': 'application/json'})
        try:
            with opener(request, timeout=15) as response:
                receipt = json.load(response)
        except Exception:
            raise RuntimeFault('inbox_delivery_unavailable') from None
        if type(receipt) is not int or receipt <= 0:
            raise RuntimeFault('inbox_receipt_invalid')
        atomic_write(receipt_file, json_bytes({'event_key': event['p_event_key'], 'id': receipt}))
        # Retain the event and receipt as a local durable audit trail.
    return len(pending)


def verify_python(python):
    check = subprocess.run([str(python), '-c',
        'import sys, scrapling, dotenv, playwright, patchright; '
        'assert sys.version_info[:2] == (3, 13)'], capture_output=True, timeout=20)
    if check.returncode:
        raise RuntimeFault('python_runtime_prerequisites')


def install(repository, revision, root, state, inputs, python):
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise RuntimeFault('revision_must_be_full_sha')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repository), *args], stderr=subprocess.DEVNULL)
    try:
        git('merge-base', '--is-ancestor', revision, 'origin/main')
        blobs = {name: git('show', revision + ':' + name) for name in FILES}
        runner = git('show', revision + ':scripts/local_scraper_runtime.py')
    except subprocess.CalledProcessError:
        raise RuntimeFault('release_not_complete_on_protected_main') from None
    for name, blob in blobs.items():
        compile(blob, name, 'exec')
    # Validate all inputs before publishing code or changing a live pointer.
    static = {}
    for name in INPUTS:
        source = state / name if (state / name).exists() else inputs / name
        data = source.read_bytes()
        if not isinstance(json.loads(data), (dict, list)) or not json.loads(data):
            raise RuntimeFault('catalog_input_empty')
        static[name] = data
    verify_python(python)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    credentials(root)
    state.mkdir(parents=True, exist_ok=True)
    for name, blob in static.items():
        if not (state / name).exists():
            atomic_write(state / name, blob)
    releases = root / 'releases'
    releases.mkdir(exist_ok=True)
    final = releases / revision
    if final.is_symlink():
        raise RuntimeFault('existing_release_is_symlink')
    # Preserve the venv entrypoint. Resolving its symlink would launch base
    # Python without the installed scraper packages.
    manifest = {'revision': revision,
                'runtime': {'state_dir': str(state.resolve()), 'python': str(python.absolute())},
                'files': {
        name: hashlib.sha256(blob).hexdigest() for name, blob in blobs.items()}}
    staging = Path(tempfile.mkdtemp(prefix='.stage-', dir=releases))
    try:
        for name, blob in blobs.items():
            atomic_write(staging / name, blob, 0o444)
        os.symlink(str(state.resolve()), staging / 'data')
        atomic_write(staging / 'manifest.json', json_bytes(manifest), 0o444)
        fsync_dir(staging)
        if final.exists():
            # Never repair a changed immutable generation in place. Refuse it
            # and leave the currently running generation and data untouched.
            if any((final / n).is_symlink() or not (final / n).is_file() or
                   (final / n).read_bytes() != b for n, b in blobs.items()):
                raise RuntimeFault('existing_release_changed')
            if read_json(final / 'manifest.json', 'manifest_unreadable') != manifest:
                raise RuntimeFault('existing_manifest_changed')
            if (final / 'data').resolve() != state.resolve():
                raise RuntimeFault('existing_state_link_changed')
        else:
            os.rename(staging, final)
            fsync_dir(releases)
        atomic_write(root / 'runner.py', runner, 0o500)
        pointer = root / ('.current-' + uuid.uuid4().hex)
        os.symlink('releases/' + revision, pointer)
        os.replace(pointer, root / 'current')
        fsync_dir(root)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    inspect_release(root)
    return manifest


def supervise(argv, cwd, env, grace_seconds=10):
    """Own one process group, including a stop arriving during child startup."""
    child = None
    termination = None
    def stop(signum, _frame):
        nonlocal termination
        if termination is None:
            termination = (signum, time.monotonic())
        if child is not None:
            try:
                os.killpg(child.pid, signum)
            except ProcessLookupError:
                pass
    old_term = signal.signal(signal.SIGTERM, stop)
    old_int = signal.signal(signal.SIGINT, stop)
    try:
        child = subprocess.Popen(argv, cwd=cwd, env=env, start_new_session=True)
        if termination is not None:
            stop(termination[0], None)
        while True:
            try:
                return child.wait(timeout=0.2), termination is not None
            except subprocess.TimeoutExpired:
                if termination is not None and time.monotonic() - termination[1] >= grace_seconds:
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
    finally:
        signal.signal(signal.SIGTERM, old_term)
        signal.signal(signal.SIGINT, old_int)


def run(root):
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (root / 'run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        revision = 'unknown'
        try:
            release, manifest, config = inspect_release(root)
            revision = manifest['revision']
            auth = credentials(root)
            env = dict(os.environ)
            env.pop('SUPABASE_KEY', None)
            env.update({'NEXT_PUBLIC_SUPABASE_URL': auth['url'],
                        'SUPABASE_SERVICE_ROLE_KEY': auth['key'], 'PYTHONUNBUFFERED': '1'})
            try:
                flush_outbox(root)
            except RuntimeFault as error:
                print(str(error), file=sys.stderr, flush=True)
            code, terminating = supervise([config['python'], str(release / FILES[0])], release, env)
            if terminating:
                return 0
            raise RuntimeFault('daemon_exited_' + str(code))
        except (OSError, ValueError, TypeError, KeyError):
            code = 'runtime_io_or_configuration_failure'
        except RuntimeFault as error:
            code = str(error)
        queue_fault(root, code, revision)
        try:
            flush_outbox(root)
        except RuntimeFault as error:
            print(str(error), file=sys.stderr, flush=True)
        print(code, file=sys.stderr, flush=True)
        return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'check', 'run', 'flush'])
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--repository', type=Path)
    parser.add_argument('--revision')
    parser.add_argument('--state', type=Path)
    parser.add_argument('--inputs', type=Path)
    parser.add_argument('--python', type=Path)
    args = parser.parse_args()
    try:
        if args.action == 'install':
            if not all([args.repository, args.revision, args.state, args.inputs, args.python]):
                parser.error('install requires repository, revision, state, inputs and python')
            result = install(args.repository, args.revision, args.root.resolve(),
                             args.state.resolve(), args.inputs.resolve(), args.python)
            print(json.dumps({'installed_revision': result['revision'], 'files': len(result['files'])}))
        elif args.action == 'check':
            _, manifest, _ = inspect_release(args.root.resolve())
            credentials(args.root.resolve())
            print(json.dumps({'revision': manifest['revision'], 'files': len(manifest['files']), 'ok': True}))
        elif args.action == 'flush':
            flush_outbox(args.root.resolve())
        else:
            return run(args.root.resolve())
    except (RuntimeFault, OSError, ValueError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, RuntimeFault) else 'runtime_operation_failed', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
