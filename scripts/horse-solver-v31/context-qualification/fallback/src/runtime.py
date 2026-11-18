"""Dormant numerical batching; no model changes, caches or serving activation."""
import numpy as np
from models import predict

def predict_batches(model, batches):
    """Predict same-model matrices once, preserving order and empty partitions.

    A caller must already have applied the exact context/support admission.
    This numerical helper grants no applicability or qualification authority.
    It owns its output arrays and never retains inputs or models.
    """
    matrices = [np.asarray(x, dtype=float) for x in batches]
    width = model['feature_count']
    for x in matrices:
        if x.ndim != 2 or x.shape[1] != width or not np.isfinite(x).all():
            raise ValueError('public feature contract')
    sizes = [len(x) for x in matrices]
    if not sum(sizes):
        return [np.empty((0, len(model['heads'])), dtype=float) for x in matrices]
    values = predict(model, np.concatenate(matrices, axis=0))
    cuts = np.cumsum(sizes)[:-1]
    return [part.copy() for part in np.split(values, cuts)]
