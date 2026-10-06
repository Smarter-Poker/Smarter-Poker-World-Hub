# V31 Commissioning Source Repairs

The licensed solver commissioning path now compiles supplied, checksum-bound
ranges and frozen payout snapshots into immutable input files. Range provenance
and ordering remain explicit; compilation does not approve inputs or turn
authored ranges into solver-derived ranges.

ICM model v2 binds the original payout snapshot, player stacks and root pot.
The worker converts payout utilities to chip-equivalent units before Pio's EV
export is divided by chips per big blind. ICM output therefore represents
BB-equivalent payout equity, not chip EV. Unversioned models fail closed.
The compiler conserves the root pot once and retains funded terminal payouts.

A manual protected-main Actions operation provisions separate M1, M2 and
compactor gateway keys. It binds the exact dispatch revision before checkout,
uses the existing production secret store and retains only RSA-OAEP-SHA256
ciphertext and non-secret receipts. Unknown mutation outcomes are retained;
workflow reruns and blind replay are refused.

Focused pipeline tests cover source hashes, range remapping, payout enumeration,
terminal payouts, invalid models and provisioning boundaries. These source
repairs alone do not certify host connectivity, approved production inputs,
successful solves, stored exports, dataset promotion or live Horse Brain use.
