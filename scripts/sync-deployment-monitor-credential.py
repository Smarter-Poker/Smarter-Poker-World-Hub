#!/usr/bin/env python3
"""Validate the existing Vercel credential and stage it for the workers' next normal deploy."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import urllib.error
import urllib.request

TEAM_ID = 'team_SVD8r7AOPH065G3usBxVvrBc'
PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx'
WORKERS_HOST = '178.104.180.220'


def validate_token_shape(token):
    if not re.fullmatch(r'[A-Za-z0-9._-]{16,4096}', token):
        raise ValueError('Vercel credential is missing or has invalid characters')


def vercel_json(token, path):
    request = urllib.request.Request('https://api.vercel.com' + path,
                                     headers={'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError('Vercel validation rejected the credential (HTTP %s)' % error.code) from None


def validate_vercel(token, fetch_json=vercel_json):
    validate_token_shape(token)
    project = fetch_json(token, '/v9/projects/' + PROJECT_ID + '?teamId=' + TEAM_ID)
    if (project.get('id') != PROJECT_ID or project.get('accountId') != TEAM_ID
            or project.get('name') != 'hub-vanguard'
            or project.get('link', {}).get('repo') != 'Smarter-Poker-World-Hub'):
        raise RuntimeError('Vercel credential did not prove the canonical project, team and repository')
    deployments = fetch_json(token, '/v6/deployments?projectId=' + PROJECT_ID
                             + '&teamId=' + TEAM_ID + '&limit=1')
    if not isinstance(deployments.get('deployments'), list):
        raise RuntimeError('Vercel deployment read did not return a deployments array')


# Only source code is in the SSH argument. The credential travels over SSH stdin
# and is never returned, placed in a command argument, or uploaded as an artifact.
REMOTE_CODE = r'''
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request


def atomic_write(path, content, original_stat):
    fd, temporary = tempfile.mkstemp(prefix='.deployment-monitor-', dir=str(path.parent))
    try:
        os.fchmod(fd, original_stat.st_mode & 0o777)
        os.fchown(fd, original_stat.st_uid, original_stat.st_gid)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def health():
    with urllib.request.urlopen('http://127.0.0.1:8081/health', timeout=10) as response:
        data = json.load(response)
    container = subprocess.check_output(
        ['docker', 'inspect', '--format', '{{.Id}}', 'smarter-poker-workers'], text=True).strip()
    return {'status': data.get('status'), 'sha': data.get('version'), 'container': container}


def stage_config(path, token, health_reader=health):
    if not re.fullmatch(r'[A-Za-z0-9._-]{16,4096}', token):
        raise ValueError('Invalid credential characters')
    if path.is_symlink():
        raise RuntimeError('Workers configuration must be a regular file')
    original_stat = path.stat()
    if original_stat.st_mode & 0o077:
        raise RuntimeError('Workers configuration has unsafe permissions')
    before = health_reader()
    if before.get('status') != 'ok' or not before.get('sha') or not before.get('container'):
        raise RuntimeError('Workers are not healthy; no configuration changed')
    original = path.read_bytes()
    replacement = ('VERCEL_TOKEN=' + token + '\n').encode()
    lines = original.splitlines(keepends=True)
    found = False
    new_lines = []
    for line in lines:
        if re.match(rb'^\s*(?:export\s+)?VERCEL_TOKEN\s*=', line):
            if not found:
                new_lines.append(replacement)
                found = True
        else:
            new_lines.append(line)
    if not found:
        if new_lines and not new_lines[-1].endswith(b'\n'):
            new_lines[-1] += b'\n'
        new_lines.append(replacement)
    updated = b''.join(new_lines)
    changed = updated != original
    if changed:
        fd, backup = tempfile.mkstemp(prefix='.env.before-deployment-monitor-', dir=str(path.parent))
        os.fchmod(fd, original_stat.st_mode & 0o777)
        os.fchown(fd, original_stat.st_uid, original_stat.st_gid)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(original)
            stream.flush()
            os.fsync(stream.fileno())
        atomic_write(path, updated, original_stat)
    try:
        after = health_reader()
        if after != before:
            raise RuntimeError('Worker runtime changed during configuration staging')
    except Exception:
        if changed and path.read_bytes() == updated:
            atomic_write(path, original, original_stat)
        raise
    return {'configured': True, 'changed': changed, 'running_sha': before['sha'],
            'activation': 'next normal workers deployment', 'runtime_unchanged': True}


def main():
    payload = json.load(sys.stdin)
    path = Path('/opt/workers/.env')
    with open('/opt/workers/.deployment-monitor-config.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        result = stage_config(path, payload['token'])
    print(json.dumps(result))


if __name__ == '__main__':
    main()
'''


def main():
    token = os.environ.get('VERCEL_TOKEN', '').strip()
    validate_vercel(token)
    key_path = os.environ['DEPLOY_MONITOR_SSH_KEY_FILE']
    host_key_path = os.environ['DEPLOY_MONITOR_KNOWN_HOSTS_FILE']
    command = ['ssh', '-i', key_path, '-o', 'UserKnownHostsFile=' + host_key_path,
               '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'StrictHostKeyChecking=yes',
               '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
               'root@' + WORKERS_HOST, 'python3 -c ' + shlex.quote(REMOTE_CODE)]
    response = subprocess.run(command, input=json.dumps({'token': token}), text=True,
                              capture_output=True, timeout=90)
    if response.returncode:
        # Do not print arbitrary subprocess output: it could contain an env value.
        raise RuntimeError('Workers configuration staging failed; previous configuration retained')
    result = json.loads(response.stdout)
    print(json.dumps({'vercel_project': PROJECT_ID, 'vercel_team': TEAM_ID, **result}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
