# CHECKPOINT: Messenger Bug Report Owner Inbox

Lane: the Report A Bug widget inside the World Hub Messenger. Owner acceptance: incoming reports appear in the widget on the configured owner account, with a live unread badge and report details; read state persists; every other account keeps the normal submission form; server-side access is enforced; no account id in the client.

Branch: `feat/messenger-bug-report-owner-inbox` from `origin/main` 0bbab08.

## Contract this builds on

Club Arena migration `20261109224532_bug_reports_reach_the_owner_messenger_and_phone.sql` (Club Arena PR #10243): `bug_report_routing` (one recipient row), `bug_report_deliveries` (one receipt per report, with the Messenger message id), one `social_messages` row per report in a dedicated conversation. No new database object is needed and none is created here.

## Design

- `pages/api/messenger/bug-reports.js` (POST, bearer token) with logic in `src/lib/bugReportInbox.mjs`. The caller is the verified JWT subject. The recipient is read from `bug_report_routing` with the service identity. A non-recipient gets `{ success: true, owner: false }` and no report, message or read-state table is read for them (403 for a read action); no session gets 401.
- A failed read is never a non-recipient answer. `owner: false` is returned only after the routing row was read and names someone else. A missing table, an unconfigured routing row or any failed read of deliveries, messages or read state is a 503 passed to the repo error reporter. Because a missing table is an error, this change is published only after migration 20261109224532 is installed.
- Read state is per report: a report is unread until `social_message_reads` holds a row for its message and the recipient. `{ action: 'read', reportId }` writes that one row, so opening one report leaves other unopened reports unread; `{ action: 'read_all' }` is the explicit Mark All Read. The rows live in the database, so the state survives a refresh. Reading the report conversation in Messenger writes the same rows through `fn_mark_messages_read_through`.
- `src/components/messenger/BugReportInboxWidget.jsx` replaces the direct `ReportBugWidget` mount in the Messenger left rail. Non-recipients render the unchanged `ReportBugWidget`. The recipient gets the same button with an unread badge, a report list, a detail view, Mark All Read and the submission form in the list footer. New reports arrive over the existing `social_messages` realtime feed; the list also refreshes on focus and on open.
- Once the server confirms an account as the recipient, the widget remembers that on the device, keyed by the signed-in account. If a later request fails, that account sees Bug Inbox Unavailable with a retry instead of the plain form alone; accounts never confirmed keep the normal form.

## Evidence

- First PR head 97993cf: Pre-Deploy Safety Checks failed in the phantom-table step, which compares queried tables with the live schema: `bug_report_routing` and `bug_report_deliveries` did not exist in production because the Club Arena migration was not installed. The check was correct and was not changed; the cause is deploy order.
- Local, final candidate: `node --test __tests__/messenger-bug-report-owner-inbox.test.mjs` 15 of 15, including: opening the newer report leaves the older one unread across a reload; non-recipient and no-session requests; every failed read answers 503, is reported and never carries `owner: false`.

## Delivery (observed, November 10, 2026 UTC)

- PR: Smarter-Poker-World-Hub #2754, branch `feat/messenger-bug-report-owner-inbox`, final head 90bf70d.
- Installed prerequisite: migration 20261109224532 present in `schema_migrations`; one routing row with a conversation (read back after Club Arena #10243 merged).
- Checks: all eight required contexts green on 90bf70d. Pre-Deploy Safety Checks passed on one re-run after the migration was installed; no gate, baseline or allowlist was changed.
- Merged: protected squash cc92609f213b4fcd06cdc13cb00cf0e5eb8cc10a at 00:28:53Z.
- Published: Vercel `hub-vanguard` deployment dpl_BNTR9Ecgvnahg2N5b7CWkh5eJs75, production, READY, Git revision cc92609, aliased to smarter.poker. `https://smarter.poker/api/health` reported that revision and deployment id at 00:33:48Z.
- Verified live, production route `POST /api/messenger/bug-reports`: no session 401 (list and read_all), invalid bearer 401, GET 405.
- Verified live, database boundary (read-only, role `authenticated` with a non-recipient, non-admin subject): zero `bug_report_deliveries` rows visible; `authenticated` and `anon` hold no SELECT on `bug_report_routing`; `anon` holds no SELECT on `bug_report_deliveries`.
- Rendered check, headless Chrome 375 by 667, real component with a stubbed API: list, detail, badge 2 to 1 after opening the newest report with the older one still unread, Bug Inbox Unavailable with retry for a remembered recipient, plain form for an unconfirmed account, no horizontal overflow, no console errors.

## Recipient View, Observed By The Coordinator On Production

Signed-in recipient session on `/hub/messenger`, production revision cc92609, about 00:34 to 00:38Z November 10, 2026:

- Report A Bug opened the Bug Reports dialog, All Caught Up, with the two existing reports listed.
- After two labelled test reports were filed, the rail button went from no badge to two unread without a reload, and both rows showed New.
- Opening the newer report showed its reference, reporter, priority, page, reported time, description and the Open In Messenger, Open Ticket Queue and Open Reporter Profile buttons. The badge became one unread and the older report stayed unread.
- The database agreed: a read row for the opened report and none for the other.
- After a full reload the badge still showed one unread. No Bug Inbox Unavailable notice appeared.
- Each of the four delivered reports had exactly one Messenger message and one push, sent on the first attempt.

## Not Observed Live

- An authenticated non-recipient request to the route on production, and an ordinary account's unchanged form in a browser. No non-recipient session was available to this lane or the coordinator; the handler path and the widget fallback are pinned by the focused test and the rendered check only. The unauthenticated refusals and the database boundary above were observed live.
- The Bug Inbox Unavailable state on production. It was exercised in the rendered check only.

Follow-up record: the delivery section above was merged by #2758 (099963883c2000ca1b71cf6e32ba89f6f91cd641), documentation only.
