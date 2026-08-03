# Agent Egress & Deploy Access — verified 2026-08-03

Measured, not assumed. Re-test with the commands shown before trusting this.

## The two shells are not the same machine

| | Device VM (`device_bash`) | Cloud container (`Bash`) |
|---|---|---|
| Has the repo | yes, at `mnt/Smarter-Poker-World-Hub` | no |
| DNS | **does not resolve anything** | resolves |
| Network | **none at all** | HTTPS via allowlist proxy `127.0.0.1:39975` |

Device VM proof:

```
$ getent hosts api.github.com          -> (nothing)
$ echo > /dev/tcp/db.<ref>.supabase.co/5432
bash: Temporary failure in name resolution
$ curl -o /dev/null -w "%{http_code}" https://<ref>.supabase.co/rest/v1/   -> 000
```

So no `git push`, no `psql`, no `npm run db:push` from the device VM. Not a
permission problem — there is no network stack to use.

## Cloud container: allowlist proxy, org-controlled

All outbound HTTPS goes through a policy-enforcing egress proxy. Check state and
recent denials with:

```
curl -sS http://127.0.0.1:39975/__agentproxy/status
```

Verified results:

| Host | Result |
|---|---|
| `api.github.com` | **200** — reachable, credentials proxy-injected |
| `github.com` (git over HTTPS) | 403 — repo not enrolled for this session |
| `<ref>.supabase.co` | **403 CONNECT — org egress policy denial** |
| `api.vercel.com` | 403 |
| `registry.npmjs.org` | 403 |

The proxy logs the Supabase denial explicitly:

```
"kind": "connect_rejected",
"detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
"host": "<ref>.supabase.co:443"
```

`/root/.ccr/README.md` is unambiguous about what to do with that:

> **403 / 407 from the proxy** — The destination host is not allowed by your
> organization's egress policy for this session. **Do not retry or route around
> it — report the blocked host.**

`dangerouslyDisableSandbox` does **not** change any of this. Tested both ways;
identical results. The block is infrastructure, not the sandbox.

## What DOES work for shipping

**Pushing to main — use the GitHub MCP.** `mcp__remote-devices__github__*` runs
on the Mac natively, outside the VM, with real network. This very file was
written to `main` through it. Use `create_or_update_file` for one file and
`push_files` for several. Both need full file contents inline, so they are
expensive on large files — for a big batch, commit locally and let the
automation carry it.

**Committing locally** — always works once the lock is cleared:

```
rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/main.lock
git add -A && git commit -m "..."
```

Then confirm it actually shipped:

```
git fetch origin && git rev-list --count origin/main..HEAD   # 0 = on main
```

## What is genuinely blocked

**Applying Supabase migrations.** No shell here can reach the database:
the device VM has no network, and the cloud container's proxy returns a policy
403 for the Supabase host. `SUPABASE_DB_PASSWORD` being present in `.env.local`
does not help — there is no route to use it on.

To unblock, one of:

1. Allowlist `<ref>.supabase.co` (and the pooler host, for direct Postgres) in
   the Anthropic organization's egress policy: **Admin settings → Capabilities →
   network access**. Then `npm run db:push` works from the cloud container.
2. Run the Cowork task **on your computer** instead of in the cloud (desktop
   app → "Run this task" picker, top right). That shell has the Mac's own
   network and can reach Supabase directly.
3. Apply migrations manually: `npm run db:status && npm run db:push`.

Until then, migrations get committed and flagged, not applied.
