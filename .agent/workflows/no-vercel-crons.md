---
description: MANDATORY — NEVER add new crons to vercel.json. Use Open Claw exclusively for all new scheduled jobs.
---

# 🛑 Vercel Crons are STRICTLY FORBIDDEN

> **ZERO EXCEPTIONS — No agent is ever allowed to add a new cron job to `vercel.json`.**

Vercel's native cron job system is **locked out** for this repository. Any and all new cron jobs MUST be executed through **Open Claw** exclusively. Attempting to add a new cron job to `vercel.json` will cause critical deployment failures and violate production architectural standards.

## The Golden Rule for Scheduled Jobs

If you are tasked with creating a new scheduled task, recurring job, or cron:

1. **DO NOT** edit the `"crons"` array in `vercel.json`. The existing crons in `vercel.json` are legacy and are actively being migrated. You may not add any new ones.
2. **DO NOT** suggest or implement Vercel CRON solutions (`/api/cron/...`).
3. **ONLY** use **Open Claw** to register, dispatch, and manage any new scheduled execution.

## Directives for Agents

- **When asked to build a cron job:** Acknowledge this constraint immediately to the USER, confirming that you will use Open Claw.
- **When creating the job logic:** Ensure your endpoints are structured to receive requests from the Open Claw dispatcher, rather than relying on Vercel's internal cron clock. 
- **Monitoring:** Open Claw is integrated into our self-healing infrastructure; ensure all error handling (`try/catch`) is robust so the dispatcher can properly log failures or trigger auto-fixes.

By reading this workflow, you acknowledge that Vercel Crons are dead, and Open Claw is the absolute authority for scheduled routines.
