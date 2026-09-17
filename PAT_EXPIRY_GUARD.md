# Configured access and credential handling

Read root `AGENTS.md`, `AGENT-PLAYBOOK.md` and `PUBLISHING.md`. Use the currently configured authenticated tool or credential store within the task’s authority. Verify actual access instead of assuming an old environment snapshot remains true. Never read, print or scrape `.env` credential values, token prefixes, remote URLs or sibling repositories.

A failed interface is not proof that every authorized route is unavailable. Use another configured interface when available; record a specific unresolved scope or access failure without inventing credentials or changing provider settings outside authorization. The retired shared-clone push scripts and local/custom publishers are not fallbacks.
