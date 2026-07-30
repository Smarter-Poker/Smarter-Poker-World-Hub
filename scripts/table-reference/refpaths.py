"""Shared path resolution for the table-reference measurement scripts.

Every script in this folder compares one template image against one screenshot,
so both live here rather than being hardcoded nine times.

  TEMPLATE  the 873 x 1224 design reference, committed in the repo
  SHOT      the desktop screenshot produced by shot.mjs
  SHOT_MOB  the 390 x 844 mobile screenshot

Override any of them with the matching environment variable when you want to
measure a build that is not the current one.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('REPO_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.environ.get('SHOT_DIR') or os.path.join(HERE, 'shots')

TEMPLATE = os.environ.get(
    'TEMPLATE', os.path.join(ROOT, '.agent/design/training-table-template.png'))
SHOT = os.environ.get('SHOT', os.path.join(OUT, 'ref_full.png'))
SHOT_MOB = os.environ.get('SHOT_MOB', os.path.join(OUT, 'ref_390.png'))
PORTRAITS = os.environ.get('PORTRAITS', os.path.join(HERE, 'portraits3'))


def load_pair():
    """Template and build as RGB, with the build resampled to template size.

    The screenshot is taken at deviceScaleFactor 2, so it comes back at 1746 x
    2448 and has to come down to 873 x 1224 before any pixel can be compared.
    """
    from PIL import Image
    t = Image.open(TEMPLATE).convert('RGB')
    b = Image.open(SHOT).convert('RGB')
    if b.size != t.size:
        b = b.resize(t.size, Image.LANCZOS)
    return t, b
