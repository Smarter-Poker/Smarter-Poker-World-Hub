# Tournament Reminder Delivery

This is the World Hub sender portion of the Club Arena built-in reminder repair.
The existing dispatcher now sends tournament reminders through a shared function
that revalidates cancellation, rescheduling, registration, seating and expiry before
the provider call. Different tournament deadlines are never folded into a digest.
Failed preference/subscription reads are retried with the same outbox identity.
Acknowledgment writes are fenced to the original claim. Provider acceptance followed
by an uncertain acknowledgment remains explicitly uncertain, not successful.

The authenticated internal tournament-reminders endpoint is the continuous workers
service caller. GET is read-only protocol readiness; POST claims only reminder rows.
It uses the existing CRON_SECRET and provider transports without a new schedule or credential.
The old cron uses the same sender as a compatibility backstop.

Requires Club Arena migration 20260909195446. Publication remains gated on normal CI
and actual serving revision. Twenty-two actual-module reminder tests pass; fifteen
existing transport and push regressions also pass. No live device message was sent
as a probe. Physical delivery acceptance remains unverified.
