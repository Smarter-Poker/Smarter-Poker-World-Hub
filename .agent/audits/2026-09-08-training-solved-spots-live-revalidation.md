# Existing Solved-Spots Live Revalidation

Date: 2026-09-08
Status: Read-only audit complete; worker activation remains blocked

## Decision

Do not request a blanket river re-solve. The existing warehouse really does
contain millions of river solves, and the fixed-cutoff exhaustive audit found
169,401 Training-contract river rows whose board and legacy matrix are usable
for an honestly labelled derived/legacy path. Those rows must be preserved.

They are not yet eligible to be advertised or served as solver-exact. None of
the audited river rows had the current exact 1,326-combo V2 representation and
independently sealed solver provenance. A fresh production sample confirmed the
same boundary rather than assuming that the August evidence was still current.

## Evidence

The exhaustive fixed-cutoff audit covered all 189,679 river rows in the 25
Training family/stack contracts while the warehouse contained 5,668,373 river
rows overall:

- 169,401 rows passed the legacy matrix, board, and scenario checks;
- 20,278 rows require replacement;
- zero rows satisfied the current solver-exact provenance contract;
- `hu_cash|40|river` has 514 usable legacy rows and 10,840 defective rows;
- `postflop_complete|100|river` has 9,438 rows and all 9,438 require replacement;
- four required river cells have no rows at all: `mtt_9max_chipev|100`,
  `spin_3max_chipev|20`, `spin_hu_chipev|10`, and
  `spin_hu_chipev|20`.

The 2026-09-08 production revalidation used read-only transactions, a 45-second
statement timeout, and two independent `TABLESAMPLE SYSTEM (0.05)` samples. In
the dedicated river sample, all 3,053 sampled rows had legacy objects, action
arrays, frequency objects, and `hero_position`; 2,687 had hand-EV objects and
1,986 embedded a board array. None had V2, an exact node, or the current
`position` field. The broader sample also found zero complete provenance rows
on any street.

The machine-readable receipt is
`2026-09-08-training-solved-spots-live-revalidation.json`. It pins SHA-256
digests for the three exhaustive street audits and the exact replacement
manifest, so the conclusion cannot silently drift from its source evidence.

## Safe Course For M1 And M2

1. Preserve and quarantine the 169,401 salvageable river rows; do not overwrite
   them or count them as new solve demand.
2. Review whether their original Pio artifacts can supply the missing exact
   node, combo ordering, and provenance. Promote only rows that can be proven;
   otherwise keep them honestly classified as derived legacy evidence.
3. Generate work only for the 20,278 exact defective hashes and the four empty
   river cells, plus independently audited non-river gaps from the replacement
   manifest.
4. Keep both workers stopped or audit-only until the legacy shared service-role
   credential is rotated, each worker has a distinct scoped identity and
   attestation secret, the canonical manifest and input artifacts are sealed,
   and one supervised canary per host produces a verified catalog admission.

No worker, credential, database row, Supabase service, chip ledger, or wallet
was changed during this revalidation.
