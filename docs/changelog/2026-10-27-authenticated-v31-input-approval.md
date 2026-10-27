# Approve Prepared V31 Inputs Through The Authenticated Operator

The existing V31 input-approval function requires an authenticated horse
administrator. The solver hosts and compactor intentionally cannot approve
their own inputs, and the SQL console does not carry the browser caller's
database authentication context.

The V31 Inputs tab in the existing Horses console now reviews the prepared
approval payload and its manifest checksum, then calls the original RPC using
the configured browser Supabase client. It verifies that the current user still
matches the operator displayed by the console. The database retains its own
administrator, immutable identity and receipt validation. No permission,
database function or solver quality gate changes.

The panel serializes submissions, preserves the reviewed payload after errors,
and reports success only after the RPC returns an input-bundle UUID. An unread
or malformed result remains unconfirmed. Input approval does not certify,
promote or load a corpus. Stored checksums, independent exports, evaluations,
promotion and live Horse loading remain separate proof obligations.
