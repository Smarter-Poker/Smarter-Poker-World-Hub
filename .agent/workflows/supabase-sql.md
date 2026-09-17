---
description: Use the maintained database installation and readback procedure
---

# Authorized database changes

Read root `AGENTS.md`, `PUBLISHING.md`, `CLAUDE.md` database maintenance rules, and `.agent/workflows/migration-safety.md`. Use the configured authorized database interface for the assigned environment. Never read passwords from `.env` or concatenate them into shell commands. Keep source migrations, required qualification, exact installation history and readback separate. Inspect installed state before applying; do not replay a migration. Preserve transaction, financial and maintenance boundaries. Report the exact missing access if no configured interface can perform the required operation.
