// ═════════════════════════════════════════════════════════════════════════
// supabase/functions/autofix-write
//
// Narrow write-only proxy for the Sentry + Vercel autofix pollers. Lets
// cron-01 and the GitHub Actions runners mutate `autofix_attempts` without
// carrying the full SUPABASE_SERVICE_ROLE_KEY.
//
// Auth:
//   - Shared secret via `Authorization: Bearer <AUTOFIX_WRITE_TOKEN>`.
//   - Token is provisioned per-caller (poller, runner, verify job) and
//     rotated independently of the service role key.
//
// Accepted actions (POST JSON body):
//   { action: "insert",    row: {...}           }   // full insert
//   { action: "update",    id: <uuid>, patch: {...} }
//   { action: "mark_pr",   id: <uuid>, pr_number, pr_url, branch_name }
//   { action: "mark_merged",   id: <uuid>, merged_at?: iso }
//   { action: "mark_verified", id: <uuid>, deployment_id?, verified_at?: iso }
//   { action: "mark_reverted", id: <uuid>, reason: text, revert_pr_number?: int }
//
// The allowlist of patchable columns is enforced server-side; callers
// cannot touch `claude_tokens_in/out` (cost ledger), `id`, `source`,
// `created_at`, etc.
//
// Deploy:
//   supabase functions deploy autofix-write --project-ref <ref>
//   supabase secrets set AUTOFIX_WRITE_TOKEN=<random-32-byte-hex> \
//                       SUPABASE_SERVICE_ROLE_KEY=<existing> \
//                       --project-ref <ref>
//
// Callers (poll.mjs, run.mjs, phase-b-verify.mjs) switch from
//   sb.from('autofix_attempts').update(...)       // needs service role
// to
//   fetch(`${FUNC_URL}/autofix-write`,
//         { method: 'POST',
//           headers: { Authorization: `Bearer ${AUTOFIX_WRITE_TOKEN}` },
//           body: JSON.stringify({ action: 'update', id, patch }) });
// ═════════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ── Allowlist: fields a caller is allowed to set on update/insert ─────────
// Cost columns (claude_tokens_*) + primary key + created_at are deliberately
// omitted so a compromised poller token can't backfill fake spend or rewrite
// history.
const WRITABLE_COLUMNS = new Set([
  "source",
  "status",
  "deployment_id",
  "commit_sha",
  "repo",
  "strategy",
  "confidence",
  "branch_name",
  "pr_number",
  "pr_url",
  "pr_opened_at",
  "reviewed_at",
  "merged_at",
  "reverted_at",
  "build_verified_at",
  "error_message",
  "metadata",
  // Claude token columns — kept here but only writable via 'insert' action
  "claude_tokens_in",
  "claude_tokens_out",
]);

// Tokens columns are written exactly ONCE at insert time (the runner knows
// the cost at completion). Never allow them in an update patch.
const INSERT_ONLY_COLUMNS = new Set(["claude_tokens_in", "claude_tokens_out"]);

// ── HTTP helpers ──────────────────────────────────────────────────────────
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

function unauthorized(msg = "unauthorized") {
  return json({ error: msg }, 401);
}

function badRequest(msg: string) {
  return json({ error: msg }, 400);
}

// ── Auth ──────────────────────────────────────────────────────────────────
function checkToken(req: Request): boolean {
  const expected = Deno.env.get("AUTOFIX_WRITE_TOKEN");
  if (!expected) return false; // fail-closed when unconfigured
  const header = req.headers.get("authorization") ?? "";
  const got = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (got.length === 0 || got.length !== expected.length) return false;
  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ── Patch filter ──────────────────────────────────────────────────────────
function filterPatch(patch: Record<string, any>, { allowInsertOnly = false } = {}): { ok: true; patch: Record<string, any> } | { ok: false; reason: string } {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!WRITABLE_COLUMNS.has(k)) return { ok: false, reason: `column '${k}' not writable` };
    if (INSERT_ONLY_COLUMNS.has(k) && !allowInsertOnly) {
      return { ok: false, reason: `column '${k}' is insert-only` };
    }
    out[k] = v;
  }
  return { ok: true, patch: out };
}

function isUuid(x: unknown): x is string {
  return typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

// ── Supabase client (uses service role, held server-side only) ────────────
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ── Action handlers ───────────────────────────────────────────────────────
async function handleInsert(body: any) {
  if (!body?.row || typeof body.row !== "object") return badRequest("row required");
  const filtered = filterPatch(body.row, { allowInsertOnly: true });
  if (!filtered.ok) return badRequest(filtered.reason);
  const { data, error } = await sb.from("autofix_attempts").insert(filtered.patch).select("id").single();
  if (error) return json({ error: `insert: ${error.message}` }, 500);
  return json({ ok: true, id: data.id });
}

async function handleUpdate(body: any) {
  if (!isUuid(body?.id)) return badRequest("valid id required");
  if (!body?.patch || typeof body.patch !== "object") return badRequest("patch required");
  const filtered = filterPatch(body.patch);
  if (!filtered.ok) return badRequest(filtered.reason);
  const { error } = await sb.from("autofix_attempts").update(filtered.patch).eq("id", body.id);
  if (error) return json({ error: `update: ${error.message}` }, 500);
  return json({ ok: true });
}

async function handleMarkPr(body: any) {
  if (!isUuid(body?.id)) return badRequest("valid id required");
  const patch: Record<string, any> = {
    status: "pr_opened",
    pr_opened_at: new Date().toISOString(),
  };
  if (Number.isInteger(body.pr_number)) patch.pr_number = body.pr_number;
  if (typeof body.pr_url === "string") patch.pr_url = body.pr_url;
  if (typeof body.branch_name === "string") patch.branch_name = body.branch_name;
  const { error } = await sb.from("autofix_attempts").update(patch).eq("id", body.id);
  if (error) return json({ error: `mark_pr: ${error.message}` }, 500);
  return json({ ok: true });
}

async function handleMarkMerged(body: any) {
  if (!isUuid(body?.id)) return badRequest("valid id required");
  const mergedAt = typeof body.merged_at === "string" ? body.merged_at : new Date().toISOString();
  const { error } = await sb
    .from("autofix_attempts")
    .update({ status: "merged", merged_at: mergedAt })
    .eq("id", body.id);
  if (error) return json({ error: `mark_merged: ${error.message}` }, 500);
  return json({ ok: true });
}

async function handleMarkVerified(body: any) {
  if (!isUuid(body?.id)) return badRequest("valid id required");
  const verifiedAt = typeof body.verified_at === "string" ? body.verified_at : new Date().toISOString();
  const patch: Record<string, any> = { build_verified_at: verifiedAt };
  if (typeof body.deployment_id === "string") patch.metadata = { phase_b_verified_deploy: body.deployment_id };
  const { error } = await sb.from("autofix_attempts").update(patch).eq("id", body.id);
  if (error) return json({ error: `mark_verified: ${error.message}` }, 500);
  return json({ ok: true });
}

async function handleMarkReverted(body: any) {
  if (!isUuid(body?.id)) return badRequest("valid id required");
  if (typeof body.reason !== "string" || body.reason.length === 0) {
    return badRequest("reason required");
  }
  const patch: Record<string, any> = {
    reverted_at: new Date().toISOString(),
    error_message: body.reason.slice(0, 500),
  };
  if (Number.isInteger(body.revert_pr_number)) {
    patch.metadata = { phase_b_revert_pr_number: body.revert_pr_number };
  }
  const { error } = await sb.from("autofix_attempts").update(patch).eq("id", body.id);
  if (error) return json({ error: `mark_reverted: ${error.message}` }, 500);
  return json({ ok: true });
}

// ── Request router ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!checkToken(req)) return unauthorized();
  if (!SB_URL || !SB_KEY) return json({ error: "server misconfigured" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  switch (body?.action) {
    case "insert":          return await handleInsert(body);
    case "update":          return await handleUpdate(body);
    case "mark_pr":         return await handleMarkPr(body);
    case "mark_merged":     return await handleMarkMerged(body);
    case "mark_verified":   return await handleMarkVerified(body);
    case "mark_reverted":   return await handleMarkReverted(body);
    default:                return badRequest(`unknown action: ${body?.action}`);
  }
});
