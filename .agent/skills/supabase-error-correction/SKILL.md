---
description: Investigate and repair assigned Supabase defects with verified source, access and transaction evidence.
---

# Supabase defect correction

Read root AGENTS.md, docs/agent-policy/OPERATING-LAW.md,
docs/agent-policy/HARDENING.md, PUBLISHING.md and the applicable migration safety
procedure. The old four human-approval gates are removed. Complete authorized
investigation, correction and verification directly.

1. Inspect the exact failing request, response, source and database contract.
   Start with read-only evidence. Compare the last successful equivalent and
   distinguish unavailable access from a failing implementation.
2. Check configured provider access and credential metadata early. Follow the
   owner policy for necessary credential repairs. Never print secret values,
   scrape environment files, guess identities or broaden service permissions.
3. Define the smallest source/schema/configuration correction and its invariants.
   Preserve RLS, financial integrity, installed migration history and other tasks.
   Prepare supported recovery from an interrupted operation before mutation.
4. Qualify the change in an isolated environment, including relevant roles,
   atomicity and replay boundaries. Use actual applicable local prechecks before
   submission. Preserve existing hosted tests and protected integration.
5. Deliver through the maintained owning route, apply only uninstalled qualified
   migrations with the required DDL/freeze safeguards, and verify exact history,
   catalog, identity and affected behavior. A source file is not installation.
6. On failure, diagnose the authoritative result before retrying or rolling back.
   Never guess that a timed-out write failed, automatically revert unrelated work,
   change settled records, or add a watcher/repair loop. Honor an explicit STOP.

Use the existing task checkpoint for source, checks, merge, installation,
publication, behavior proof and remaining blockers. Ask only for genuinely
missing information or a tool-mandated handoff, with its exact source and
prepared next action. Continue every independent assigned step while pending;
no extra human approval or confirmation phrase is needed to start or finish.
