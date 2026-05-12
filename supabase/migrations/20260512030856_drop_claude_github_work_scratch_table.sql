-- Dan-fix/audit-7 (2026-05-11): _claude_github_work was a working-table
-- scratch space created by an earlier agent for HTTP-from-postgres GitHub PR
-- workflows (PUT contents, branch refs, etc.). It was left in prod with RLS
-- disabled and authenticated read/write access. Contents (path, sha,
-- original_content, modified_content) could include sensitive source-code
-- excerpts mid-edit. Dropping entirely; future MCP work should use temp
-- tables or service_role-only scratch.

DROP TABLE IF EXISTS public._claude_github_work;
