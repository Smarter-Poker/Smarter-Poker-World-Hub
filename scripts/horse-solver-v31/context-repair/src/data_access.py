"""Explicit role-bound byte access, including checksums. No fallback discovery."""
import hashlib
import json
import os
import stat
from pathlib import Path

ROLES = frozenset(('TRAIN', 'MODEL', 'SOURCE'))

class SafeInputs:
    def __init__(self, entries):
        self.entries = {}
        for name, item in entries.items():
            p = Path(name)
            if not p.is_absolute() or '..' in p.parts or item.get('role') not in ROLES:
                raise ValueError('invalid input declaration')
            digest = item.get('sha256', '')
            if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
                raise ValueError('invalid input checksum')
            # A role cannot relabel an obvious excluded payload into TRAIN.
            tokens = str(p).upper().replace('_', '-').replace('.', '-')
            if any(x in tokens for x in ('DO-NOT-RUN', 'HOLDOUT', '/EXAM', '-EXAM', '/FINAL', '-FINAL', '/EVAL', '-EVAL', '/DEV/', '-DEV-')):
                raise ValueError('excluded input declaration')
            self.entries[str(p)] = dict(item)

    def read(self, path, role):
        name = str(Path(path))
        item = self.entries.get(name)
        if item is None or item['role'] != role:
            raise PermissionError('input is not admitted for this role')
        # Walk with directory descriptors so replacing a checked parent cannot
        # redirect the final open into an excluded tree.
        p = Path(name)
        directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
        try:
            for part in p.parts[1:-1]:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                os.close(directory)
                directory = child
            fd = os.open(p.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        finally:
            os.close(directory)
        with os.fdopen(fd, 'rb') as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise PermissionError('regular input required')
            data = stream.read()
            after = os.fstat(stream.fileno())
        if (before.st_ino, before.st_dev, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_dev, after.st_size, after.st_mtime_ns):
            raise ValueError('input changed during read')
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('input checksum changed')
        return data

    def json(self, path, role):
        return json.loads(self.read(path, role))
