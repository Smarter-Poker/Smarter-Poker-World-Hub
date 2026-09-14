# Date enrichment updates its existing series with source evidence

Production alert 38629, workflow 34833374303/job 103941607940, failed on
September 14 at 13:01 UTC: thirteen series dates were parsed and zero rows were
written. The partial POST upsert reached the BEFORE INSERT provenance trigger
before conflict resolution and omitted the required page hash and timestamp.

The date pass now selects the stored integer ID and PATCHes only that exact ID
and UID while its start date is still absent. It records SHA256 of the fetched
response bytes, a UTC scrape timestamp and `scraped_inferred` confidence. It
requires exactly one matching returned identity for each confirmed write.
Deleted, renamed or concurrently enriched rows are not recreated or overwritten;
unconfirmed writes still fail the run. Parent names, curation and other fields
are preserved. The database provenance guard remains unchanged.

Validation: 10 entry-point contract tests (including the thirteen-row failure,
twenty-row flush, wrong/empty/malformed acknowledgements and HTTP failure),
6 startup tests, 5 discovery handoff tests and 48 existing scraper tests pass.
Required CI and the production workflow startup gate run the new tests.
An additional isolated PostgreSQL 17 probe executes the actual emitted Python
payload against the live provenance trigger body
`f09ca40711b2b311eb0be08d7c66d873`: all 10 checks pass, including reproduction of
the old trigger failure, unchanged foreign rows, preserved parent fields and
no overwrite of a concurrent date fill. The probe uses a minimal schema, not
the complete production schema. Browser extraction and a complete subsequent
production workflow remain separate acceptance requirements.
