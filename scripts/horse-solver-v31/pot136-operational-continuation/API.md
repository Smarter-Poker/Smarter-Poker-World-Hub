# Explicit operational continuation API

All commands use the existing pinned Python with -I -B, external owned TMPDIR and BLAS1. The operator is `src/continuation.py`. It normally imports the original SHA-pinned E modules; no module globals or functions are replaced.

Preparation now is source/contracts only. Root and independent reviewer must review the actual original TRAIN result, actual sixteen evaluation jobs/audit and actual original admission refusal before invoking:

```text
python -I -B F/src/continuation.py prepare --refusal E/evidence/operational-admission-refusal.json --refusal-sha256 EXACT_ROOT_VERIFIED_SHA256
```

The refusal receipt must be a regular E/evidence file with exact root-pinned SHA and fields:

```json
{"verdict":"OPERATIONAL_ADMISSION_BLOCKED","freeze_sha256":"58a978c9f577872908f280a3f4cb2bf9970112b8e94aca7e9431a99e8854de06","candidate_sha256":"ACTUAL_ORIGINAL_CANDIDATE_SEAL_SHA","stage":"EVALUATION","native_launched":false,"reason":"phase_reserve_exceeds_original_2h"}
```

Root's receipt must additionally retain the actual refused command, current ledger arithmetic, error/log and original no-launch readback. This operator cannot certify that the human/agent report is truthful; root/independent review must inspect that evidence. A merely predicted future refusal cannot authorize prepare. The prepare command performs no remote I/O and launches nothing; it freezes only the copied operational layout. It refuses if original evaluation consumption/launches exist or original TRAIN is incomplete/failing.

After actual copied layout/source review, explicitly invoke `stage`. It performs A8 and canonical helper/job stage checks, seals NATIVE-RELEASE, and launches nothing. Then each accepted sole owner explicitly invokes `launch E-S00`, waits for the same durable operation, invokes `collect E-S00`, reads its technical receipt, and only then chooses `launch E-S01`. Repeat throughE-S05, respectingE-S04solo beforeE-S05. There is no chain command. Unknown transport outcome belongs to the same native operation; use the original launcher's read-exit reconciliation only after original launcher ownership is resolved, never duplicate launch.

After all16clean receipts and idle ledger, explicitly invoke `score` once. It writes the exclusive global claim in E, then reads the original metrics through A2 and applies original comparison semantics. Original E score and continuation score cannot both claim the same evaluation. A prior claim refuses; never remove it. Technical failure or budget refusal is terminal for this operational plan and cannot authorize another smaller layout on its own.

Synthetic `test_contracts.py` performs no remote I/O, model load, fitting or evaluation read. Root owns authoritative integration, normal required checks/protected publication, actual operation release, final result review and preservation.
