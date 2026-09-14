# Failed video work must remain failed

The September 13 daily run logged 100 failed metadata lookups yet exited zero. Insert exceptions were logged and omitted from its failed count, and the report callback still targeted the removed World Hub route. Its direct audit summary omitted metadata failures too.

The daily scraper now counts failed inserts and metadata work, retains bounded extractor errors, includes the full run duration and identity, and exits nonzero for unsuccessful work or an unconfirmed report. A duplicate constraint is a no-op only after the exact video is read back. Reports use WORKERS_BASE_URL, the existing WORKERS_CRON_SECRET fallback contract, and DISPATCHER_PRIVATE_IP. A failed run may receive a committed HTTP 503 acknowledgement; that proves delivery, not successful scraping. The workers route sends these failures to the operational inbox. Explicit full/source scope keeps a single-creator probe from freshening the daily job. The old optional Slack sender is removed.

Local evidence is retained before and after report delivery. No old run is replayed as a current success, and no video is deleted or fabricated. Install the matching workers report contract before syncing this script through deploy-openclaw.sh. Existing jobs, schedule, media ingestion rules and unrelated script modes are unchanged.

Validation: 19 Python cases execute the shipped functions, including four real loopback HTTP tests, CLI exit behavior, failed/unknown receipts, metadata process/write errors, partial inserts, exact duplicate handling and no-write dry runs. Database/extractor IO is controlled in these cases. The real upstream metadata cause and next natural daily run remain separate acceptance requirements.
