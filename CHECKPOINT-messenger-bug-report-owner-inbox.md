# CHECKPOINT: Messenger Bug Report Owner Inbox

Lane: the Report A Bug widget inside the World Hub Messenger. Owner acceptance: incoming reports appear in the widget on the configured owner account, with a live unread badge and report details; read state persists; every other account keeps the normal submission form; server-side access is enforced; no account id in the client.

Branch: `feat/messenger-bug-report-owner-inbox` from `origin/main` 0bbab08.

## Contract this builds on

Club Arena migration `20261109224532_bug_reports_reach_the_owner_messenger_and_phone.sql` (Club Arena PR #10243): `bug_report_routing` (one recipient row), `bug_report_deliveries` (one receipt per report, with the Messenger message id), one `social_messages` row per report in a dedicated conversation. No new database object is needed and none is created here.

## Design

- `pages/api/messenger/bug-reports.js` (POST, bearer token) with logic in `src/lib/bugReportInbox.mjs`. The caller is the verified JWT subject. The recipient is read from `bug_report_routing` with the service identity. A non-recipient gets `{ success: true, owner: false }` and no report, message or read-state table is read for them; no session gets 401; an unreadable inbox gets 503, never an empty list. Before the routing table exists every account is a non-recipient.
- Read state is the existing conversation read marker (`social_conversation_participants.last_read_at`), written by the existing `/api/messenger/mark-read` route (`fn_mark_messages_read_through`). The widget badge and the Messenger conversation list therefore count from the same marker. Opening a report marks the conversation read through that report, which also covers older reports.
- `src/components/messenger/BugReportInboxWidget.jsx` replaces the direct `ReportBugWidget` mount in the Messenger left rail. Non-recipients render the unchanged `ReportBugWidget`. The recipient gets the same button with an unread badge, a report list, a detail view and the submission form in the list footer. New reports arrive over the existing `social_messages` realtime feed; the list also refreshes on focus and on open.

## Evidence

- Local, exact candidate: `node --test __tests__/messenger-bug-report-owner-inbox.test.mjs` 10 of 10; the gate step "Messenger Club And Invoice Separation" (now including this test) 418 of 418; `check-ui-text` and `check-title-case` OK.
- Production readback before submission (read-only): migration version 20261109224532 not yet in `schema_migrations`; `bug_report_routing` absent. Live owner-view verification therefore follows its installation.

Merge, deployment and live verification are recorded in the delivery section once observed.
