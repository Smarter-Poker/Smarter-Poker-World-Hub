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

Merge, deployment and live verification are recorded in the delivery section once observed.
