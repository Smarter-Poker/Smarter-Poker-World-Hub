# R7 M2 selected-target context import

The M2 worker reached its selected-target filter after model-freeze admission and solver self-test, then failed because `target_context` was not imported. Import the existing context function from `pio_upi`; selection, model provenance, seeds, scientific parameters and qualification gates are unchanged.

The regression executes the actual selection branch extracted from `worker.run` with real context derivation and valid selected/unselected targets. It requires no Gateway, solver process, seed or checkpoint. The exact pre-fix worker fails with `NameError`; the corrected worker passes. This source change alone does not authorize mutating an approved producer or restarting a capture.
