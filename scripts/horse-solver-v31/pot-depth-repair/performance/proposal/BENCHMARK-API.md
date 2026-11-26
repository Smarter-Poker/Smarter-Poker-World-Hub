# New168 sealed-fit benchmark operator

Prepared only. Do not execute until root supplies exact FIT/freeze/eight-model identities and an immutable admission digest. No fitting, label/native/evaluation read or full246 physics rebuild is performed.

Command, with the pinned numerical Python, nice15, SSD2 TMPDIR, OMP_NUM_THREADS=1 and OPENBLAS_NUM_THREADS=1:

```text
python -I -B performance/proposal/benchmark_sealed_fit.py --admission /absolute/D/performance/evidence/new168-runtime-admission.json --admission-sha256 ROOT_SUPPLIED_SHA256 --output /absolute/D/performance/evidence/new168-runtime-benchmark.json
```

The operator remains under `D/performance/proposal/`; it derives `D/performance` from its location and refuses outputs elsewhere. Admission/source/model paths must stay under D; the same two public TRAIN feature/range cases are the only external data closure. No glob or fallback discovery exists.

Admission schema:

```json
{
  "format": "HV31_SEALED_FIT_RUNTIME_BENCHMARK_V1",
  "live_play": false,
  "public_inputs_sha256": "eb2c37d173f901e8f38fb874e156f08dc1ff18113b490dca1bb991296473a9a4",
  "expected_fit_games": 168,
  "fit": {"path": "/absolute/D/FIT.json", "sha256": "ROOT_SUPPLIED_SHA256"},
  "freeze": {"path": "/absolute/D/FREEZE.json", "sha256": "ROOT_SUPPLIED_SHA256"},
  "sources": {
    "models": {"path": "/absolute/D/src/models.py", "sha256": "ROOT_SUPPLIED_SHA256"},
    "range_features": {"path": "/absolute/D/src/range_features.py", "sha256": "ROOT_SUPPLIED_SHA256"}
  },
  "models": [
    {"path": "/absolute/D/models/range_root/HJ-F.cbet.joblib", "sha256": "ROOT_SUPPLIED_SHA256", "position": "HJ", "spot": "F.cbet", "actions": ["ACTUAL_FROZEN_ACTIONS"]}
  ]
}
```

`models` must contain exactly8 entries: HJ/UTG crossed with F.cbet,F.vs_b33,F.vs_b75,F.vs_xr. Each exact model path/SHA/position/spot/action list must agree with the actual trusted FIT.models map, using model paths relative to the FIT directory. FIT.fit_games must be168, FIT.models must contain8 artifacts, and FIT.freeze_sha256 must match the supplied frozen identity. Both numerical source digests must be frozen and unchanged from the original public-feature/parity evidence; otherwise this operator refuses rather than silently measuring a different feature contract.

The fixed public input manifest is `performance/evidence/public-runtime-inputs.json`, SHA256 eb2c37d173f901e8f38fb874e156f08dc1ff18113b490dca1bb991296473a9a4. Its cases are HJPAIR338 and UTGUNP2T247, each with4 explicit TRAIN feature matrices and authored ROOT vectors. These were admitted in the original performance proof. The unchanged full246 profile SHA256 is7f50da3f0314944ba4c4e1d6aa1dfcaf585e09f4107f615b14a18a3dc774f833 and is reused, not repeated.

Output records cold verified-byte load per model, public136 preparation, finite normalized actual predictions, exact serial/batch and full-matrix partition parity, seven batch samples and three groups of16 serial requests per head, whole-process RSS, model sizes, environment and exact identities. First deserialization includes lazy sklearn imports; disk I/O/hash time is excluded. This is local in-process runtime evidence, not production latency, model strength, qualification or activation.
