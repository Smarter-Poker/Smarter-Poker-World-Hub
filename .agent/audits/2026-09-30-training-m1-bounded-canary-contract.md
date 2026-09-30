# Training Phase 6 M1 Bounded-Canary Contract

Date: 2026-09-30

Status: reviewed controller decision for one M1-only bounded canary; not
backlog authority and not Phase 6 completion.

## Purpose

This contract authorizes exactly one held-to-bounded-canary transition for M1
partition `2/0`. It exists only to produce and admit the BTN/IP flop parent and
exact turn child required by the `cash-002` Training continuation cohort. It
does not authorize M2, the remaining backlog, a different stack, a different
scenario/node identity, or a different parent/child pair.

The manifest retains the complete 107-game compatibility ledger, where one
family/stack contract can be referenced by multiple compatible game cards.
That ledger is descriptive serving coverage, not execution authority: this
canary may write only the two UUID/scenario/node identities named below.

## Literal Solver Contract

- Training game: `cash-002`, C-Bet Academy.
- Solver family and stack: `hu_cash`, 100bb.
- Postflop state: 550 solver chips in the pot, 9,750 solver chips effective,
  using 100 solver chips per big blind.
- Players: BB out of position and BTN in position; the Training parent and
  child decisions are BTN/IP.
- Geometry: `srp_parameterized_four_action_v3`.
- Accuracy fraction: `0.005`.
- Streets: flop and exact turn child.
- M1 partition: count `2`, index `0`.
- IP range: `RFI_BTN_100.txt`, SHA-256
  `6255165643c516cc03605773a76bcd43f38ee63d50d4013e296df5e1f6c616cc`.
- OOP range: `BBflat_vs_BTN_100.txt`, SHA-256
  `9dbfd7dff86d7502e20acacc8a89d593342287a771acd00b99eca9e0b513148d`.
- Parent: `2d7b403c-e4d3-4c20-bff8-ed5db7ecb50a`,
  `hu_cash_BTN_100bb_2c4c7c`, flop node `r:0:c`, BTN/IP.
- Child: `21d75135-faa8-4c0d-acbe-91b55c98daf0`,
  `turn_hu_cash_BTN_100bb_2c4c7c2d`, turn node
  `r:0:c:b412:c:2d:c`, BTN/IP.

## Rake Decision

The protected source did not contain a pre-existing Training-serving
`cash-002` rake approval. `0 0` is the locked clean chip-EV baseline, while the
coverage contract requires a rake model for cash families. Pio's documented
syntax defines the first value as the fraction of the final pot and the second
as the cap in solver chips.

For this single normalized Training canary, the controller therefore adopts
`0.05 10`: five percent of the final pot, capped at 10 solver chips. At the
pipeline's 100-chips-per-big-blind scale, the cap is exactly 0.1bb. This is a
new, explicit normalized Training decision. It must not be described as
historical approval, silently generalized to other cash games, or used as a
stake-tier claim.

## Pio And Pipeline Identity

- Pio version: `PioSOLVER-pro 3.8.0 (Sep 22 2025, 11:05:45)`.
- Binary SHA-256:
  `e21ea7ad1dbc2a9d826c25ac264688f632dd461b92de2bc35a53f6b78bcf5ceb`.
- `show_hand_order` SHA-256:
  `7d1e445d2a9fe34d416ea41adf7f2df2c4319c49141b389be5eb3d6cb2d9618a`.
- Protected pipeline commit:
  `1ccf3907cf3298e24609eb6fbd903023d91dbddf`.
- Manifest version: exact integer `5`.
- Pipeline bundle SHA-256:
  `cb319d1fcd6ef2c945c7e0443fc5299d5c0deea8627851e998bd6b529a8bcc82`.

The M1 host evidence proves the legacy `_9m_` range aliases are byte-identical
to the canonical names above. This contract deliberately authorizes only the
canonical filenames and their exact hashes; byte identity does not authorize a
different filename.

## Safety Boundary

The checked-in manifest may open only `bounded_canary_ready`; `solver_ready`
must remain false. The authority migration must fail unless both reserved
warehouse identities are unique and match the exact scenario, street, family,
stack, node, and BTN position. It must fail if another active M1 backlog or
bounded-canary scope exists. The first execution may solve and ingest no more
than the named parent and child. M1 must return to a stopped, canary-closed
state after evidence collection. Phase 7 remains unstarted.
