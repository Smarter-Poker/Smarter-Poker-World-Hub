Club Arena terms acceptance now sends the authenticated user and exact current
terms revision to the service-only database acceptance RPC. The endpoint returns
success only when that RPC acknowledges the same stored revision and a finite
stored acceptance time. It never updates the profile directly or manufactures a
time locally.

Missing or stale revision requests require a refresh. Authentication and profile
failures remain failures; a missing RPC, unavailable schema, unknown response or
legacy success without the revision returns unavailable. Database idempotency
preserves the first same-version acceptance. The former mock-key success and
process-local cache cannot bypass current authentication or revision checks.

The existing Next production-bundler regression now exercises authentication,
legacy and malformed requests, stale server/database revisions, missing profile,
unavailable/no-op acknowledgements, identity binding and replay. It still loads
the actual asynchronous shared-client re-export. The regression fails against
the prior endpoint and passes after the change; external services are explicit
fixtures. The matching Club Arena column and RPC must be installed before this
API is published. No production acceptance was written during qualification.
