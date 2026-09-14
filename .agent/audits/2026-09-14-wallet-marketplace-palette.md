# Wallet palette deployment regression

The transaction labels added by #1754 included six green accents and one purple accent outside the existing marketplace palette. Both production deployments of `8080b2e25df752149855cc40ecbba9fbec557757` failed `diamond-store-phase-9.test.mjs:91` before the Next build. The exact source reproduces that failure locally.

The seven transaction entries now use the existing blue, steel and gold accents of the corresponding reward and credit entries. Transaction kinds, labels, icons, balances, claims and payment behavior are unchanged.

The existing phase 9 suite was reachable through `test:marketplace` during deployment, but required Build Safety Gate CHECK 8 did not import it. The required meta-suite now imports it, catching the regression before merge. No design assertion was removed or relaxed.

Validation: all 354 marketplace tests pass with zero skips. Baseline phase 9 failed before the seven source corrections. Publication and live deployment verification are separate acceptance steps recorded by the operational alert task.
