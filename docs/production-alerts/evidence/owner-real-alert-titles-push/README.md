# Owner real-alert titles reached the owner's phone

Found by the Production Alerts PRIMARY lane, 2026-11-17 17:50Z.

## Rows read (PokerIQ-Production)

- Club Arena's `public.fn_ca_a_real_alert_reaches_the_owner()` (trigger
  `zz_a_real_alert_reaches_the_owner` on `operational_alert_events`) raises a
  `system` notification with one of six titles: Tables Have Stopped Dealing,
  Engine Restart Storm, Engine Update Missed At 4 AM, 3 AM Lobby Close Keeps
  Failing, Merged Migration Not Installed, Money Check Failed.
- `public.fn_platform_push_recipient_guard()` skips a push only when
  `fn_is_platform_operational_alert(event, title, '{}')` is true. The live title
  list carried three of the six.
- In the owner's `push_outbox` between 2026-11-09 05:25Z and 2026-11-17 10:30Z there are
  19 rows with status `sent`: 8 "Engine Update Missed At 4 AM" and 11 "Merged Migration Not
  Installed". Over the same period, "Money Check Failed" and "Tables Have Stopped
  Dealing" read `skipped / routed_to_production_alerts`.
- In 24 hours: 3 sent pushes (2 Merged Migration Not Installed, 1 Engine
  Update Missed At 4 AM).

## Probe (self-aborting, nothing committed)

A single DO block compiled the amended definition as `pg_temp.probe_op` and
raised:

```
PROBE anchors=1 Engine Update Missed At 4 AM=true; Merged Migration Not Installed=true;
3 AM Lobby Close Keeps Failing=true; Money Check Failed=true; Push Health Alert=true;
Daily Digest: x=false; Weekly Rakeback: Statements Sent (4 Of 4 Clubs)=false;
new_message/Merged=false
```

`pg_depend` shows no object that depends on the function.

## Local test runs

- `__tests__/owner-real-alert-titles-are-operational.test.mjs`: 3/3 passed,
  run as an unprivileged user against PostgreSQL 16. CI runs it on PostgreSQL 17.
- The JavaScript-mirror test fails against the pre-fix `deliveryPolicy.mjs`
  (`error: 'Engine Update Missed At 4 AM'`) and passes after the fix.
- The native test proves the pre-fix guard leaves the three titles `pending`.
  After the migration they read `skipped:routed_to_production_alerts`, and the
  replay produces an identical definition md5.
