# Stats Maintenance Reports Partial Failure

Five observed hand-index maintenance attempts on September 13 returned a
database deadlock in their errors array. The route saved a partial heartbeat
but returned HTTP 200. Both Open Claw and withCronHealth classify outcomes by
HTTP status, so the same failed attempt was also reported as successful.

The route now returns HTTP 503 whenever its errors array is nonempty. Each
step remains independently isolated, successful sibling results remain in the
response, and a later successful run returns HTTP 200. Existing alert delivery
continues through the operational inbox.

Five local HTTP cases execute the actual route, authentication helper and
health wrapper with a controlled RPC transport. They verify the deadlock case,
another partial failure, successful recovery, telemetry failure, and rejection
of unauthorized requests without maintenance or health writes. Both existing
runtime-budget checks also pass. The HTTP and budget cases now run in the
required Build Safety Gate.

This corrects outcome reporting. The database deadlock itself remains a
separate root-cause investigation; no retry, index repair, or financial data
rewrite is added here.
