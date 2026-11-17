"""Explicit role-bound byte access, including checksums. No fallback discovery."""
import hashlib
import json
import os
import stat
from pathlib import Path

ROLES = frozenset(('TRAIN', 'MODEL', 'SOURCE'))

class SafeInputs:
    def __init__(self, entries, anchors=()):
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
            public_producer = item['role']=='SOURCE' and p.name=='final_public215_training.py' and digest=='2740d2efc8888d2e22e1088ac21ac0e102d22619cc7b4dde5791c482bccf3a3d'
            if any(x in tokens for x in ('DO-NOT-RUN', 'HOLDOUT', '/EXAM', '-EXAM', '/FINAL', '-FINAL', '/EVAL', '-EVAL', '/DEV/', '-DEV-') if not (public_producer and x in ('/FINAL','-FINAL'))):
                raise ValueError('excluded input declaration')
            self.entries[str(p)] = dict(item)
        # A UUID-verified mounted child can be readable while an ancestor
        # scaffold cannot be opened for reading. Bind its directory identity,
        # then retain O_NOFOLLOW for every input component below that anchor.
        self.anchors = []
        for anchor in anchors:
            root = Path(anchor['root'])
            if not root.is_absolute() or '..' in root.parts or root == Path('/'):
                raise ValueError('invalid verified volume anchor')
            if not all(type(anchor[k]) is int for k in ('device','inode')):
                raise ValueError('directory identity required')
            self.anchors.append(dict(anchor,root=str(root)))

    def read(self, path, role):
        name = str(Path(path))
        item = self.entries.get(name)
        if item is None or item['role'] != role:
            raise PermissionError('input is not admitted for this role')
        # Walk with directory descriptors so replacing a checked parent cannot
        # redirect the final open into an excluded tree.
        p = Path(name)
        anchor = next((a for a in sorted(self.anchors,key=lambda a:len(Path(a['root']).parts),reverse=True) if p.is_relative_to(a['root'])),None)
        start = Path(anchor['root']) if anchor else Path('/')
        directory = os.open(str(start), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        if anchor:
            st = os.fstat(directory)
            if (st.st_dev,st.st_ino)!=(anchor['device'],anchor['inode']):
                os.close(directory)
                raise PermissionError('verified volume anchor identity changed')
        try:
            for part in p.relative_to(start).parts[:-1]:
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
