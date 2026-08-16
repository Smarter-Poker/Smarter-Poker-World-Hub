# Engine host cutover to 5.161.252.33 + an attacker SSH key found on the NEW box

Date: 2026-08-16 (UTC)
Scope: P0-1 from `.agent/audits/2026-08-15-table-ux-eight-item-audit.md` — verify
containment of the engine-host root compromise — plus the engine restoration Dan
authorised ("GO FOR IT").

**Headline: production was pointed at a dead engine, and the replacement box has
one of the four documented attacker SSH keys installed on it, with five
successful root logins.** Both are addressed below. One item needs Dan.

---

## 1. Starting state (measured, not assumed)

`engine.smarter.poker` resolved to **178.156.160.206** — the box rooted in the
2026-08-15 incident (Club Arena `0eec5922c`). It answered HTTP 200, which is why
nothing alarmed. Its actual payload:

```
{"liveness":"dead", "activeTables":0, "totalHandsDealt":0,
 "uptime":96, "version":"13a90cf4", "discoveryStaleMs":96862}
```

`"running":true` and HTTP 200 with `liveness: dead` and **zero tables**. Every
health check that only looks at the status code passed. SSH to it is refused, so
it cannot be managed.

Meanwhile **5.161.252.33** was healthy and dealing (hand counts advancing between
samples 20s apart), on latest `main` (`c12a10af`), with a valid Let's Encrypt
cert for `engine.smarter.poker` already issued and Caddy already configured —
and receiving no public traffic at all.

No split-brain: only one box was dealing.

## 2. Corrections to my own earlier readings

Recorded because both nearly caused wrong action:

- **"121 JWT/auth errors"** — false. `grep -iE "401"` matches inside UUIDs
  (`c2ad0c6b-a13a-4012-...`). A word-boundary grep for real auth failures
  (`legacy api keys|invalid api key|invalid jwt|401 unauthorized|permission
  denied|row-level security`) returns **0** over 30 minutes.
- **"`club-arena-supervisor` is inactive, so nothing is running"** — false. It is
  a **oneshot** unit (`static`, `Result=success`, start and exit one second
  apart). `inactive/dead` is its correct resting state. The engine runs as a
  Docker container, not under that unit.

## 3. Supabase keys — verified working, no rotation gap

The legacy HS256 anon/service_role keys were disabled at
`2026-08-16T00:38:16Z`. The container on 5.161.252.33 carries the **new-format**
keys (`SUPABASE_SERVICE_ROLE_KEY=sb_secret_…`,
`SUPABASE_ANON_KEY=sb_publishable_…` — shape read from `docker inspect`, values
never printed). Confirmed end to end from the database side:

```sql
select now(), max(created_at) from hand_history where created_at > now() - interval '1 hour';
-- db_now      2026-08-16 01:33:28.837+00
-- newest_hand 2026-08-16 01:33:28.876+00   (0 seconds ago)
```

Hands are landing in Postgres in real time. Service-role rotation reached the
Hetzner env, not just Vercel.

## 4. DNS cutover — DONE

Vercel DNS (`ns1/ns2.vercel-dns.com`), record TTL 60s.

| Time (UTC) | Action |
|---|---|
| 01:30:47 | Pre-state captured: `engine.smarter.poker` → 178.156.160.206 |
| 01:30:48 | Removed `rec_0c70b92644d98be47096d923` (A → 178.156.160.206) |
| 01:30:50 | Added `rec_82e74eb0973f50e437dfa018` (A → 5.161.252.33) |
| 01:31:58 | Verified authoritative + resolver = 5.161.252.33 |

Order was remove-then-add, ~2s apart, deliberately: running both records
concurrently would have round-robined half of production onto an engine that
returns 200 while dealing nothing. A two-second NXDOMAIN window is strictly
safer than that, and resolvers hold the prior answer for up to 60s regardless.

Verified through the real public path (no `--resolve`):

```
HTTP=200  ip=5.161.252.33  tls_verify=0
liveness ok   tables 222   stalled 0
```

Done with the Vercel CLI against the existing `auth.json` session. Note for
whoever hit this before: a stale **`VERCEL_TOKEN` env var was shadowing that
session** and is why the CLI reported "not a valid token". `env -u VERCEL_TOKEN`
makes it work — no new token needed, nothing to extract.

## 5. Attacker SSH key present on the NEW box — DISABLED, needs Dan's ruling

`/root/.ssh/authorized_keys` on 5.161.252.33 contained:

```
SHA256:hriJ9Xg6ijF5HUYfadqI766DaeFj/m5Wb/oCLhzcJZ0   hetzner-access   (ED25519)
```

`hetzner-access` is verbatim one of the four attacker key comments recorded in
Club Arena `0eec5922c` (`<no comment>`, `ovh-vps`, `aws-1`, `hetzner-access`).
That fingerprint matches **none** of the six keys on Dan's Mac.

It was used. From `/var/log/auth.log*`:

```
authorized_keys mtime          2026-07-18 11:00:45 -0500
Accepted publickey root from 169.150.201.23   2026-07-18 11:01:46
Accepted publickey root from 169.150.201.23   2026-07-18 11:08:39
Accepted publickey root from 169.150.201.23   2026-07-18 11:08:41
Accepted publickey root from 169.150.201.23   2026-07-18 11:09:47
Accepted publickey root from 169.150.201.23   2026-07-18 11:09:49
```

Five root logins from a single non-Hetzner IP, each a ~1-second session, starting
61 seconds after the key was installed, then never again. Every other successful
login on this host in 90 days is `SHA256:fK6di6…` (Dan's `smarter.poker@deploy`)
from Dan's ISP or Azure/GitHub-Actions ranges.

**Honest read: this is ambiguous and I have not resolved it.** The signature fits
an attacker, and the comment match is damning. But it *also* fits a Hetzner
console provisioning key — Hetzner injects account keys at build time, "hetzner-
access" is exactly what such a key would be named, and the timing (key written,
used immediately for short setup sessions, never touched again) is what
provisioning looks like. If that is what it is, then `0eec5922c` misclassified a
legitimate key as hostile, which is worth knowing on its own.

Deciding needs the Hetzner account's SSH key list, which needs the API token. I
did not read it.

**Action taken — reversible on purpose:** the key is **commented out**, not
deleted, with the reasoning inline, and the original file backed up to
`/root/.ssh/authorized_keys.bak.20260816T013730Z`. Re-auth verified afterwards
with both `hetzner_deploy` and `id_ed25519`; engine unaffected (222 tables, 0
stalled). If it turns out legitimate, uncomment or re-add from the Hetzner
console — nothing runtime depends on it, and it has not logged in since July.

### → Dan: check your Hetzner console SSH keys for `SHA256:hriJ9Xg6ijF5HUYfadqI766DaeFj/m5Wb/oCLhzcJZ0`. Present = provisioning key, harmless. Absent = confirmed backdoor, and the compromise reached a second box.

## 6. Persistence hunt on 5.161.252.33 — clean

| Check | Result |
|---|---|
| XMRig artefacts (`/etc/xmrig*`, `/opt/xmrig*`, `which xmrig`) | none |
| root crontab | 3 PepNationRX billing jobs, all legitimate |
| other users' crontabs | none (root only) |
| `/etc/cron.d`, `.daily`, `.hourly` | `e2scrub_all`, `sysstat` only |
| systemd `ExecStart=` under `/tmp`, `/var/tmp`, `/dev/shm`, `/root` | none |
| non-loopback listeners | 22, 80, 443, 8080, 4000 — all accounted for |
| high-CPU processes | engine, MLB pipeline, dockerd — no miner |
| `sshd -T` | `passwordauthentication no`, `permitrootlogin without-password` |

## 7. Worth knowing: this box is not a fresh rebuild

It was reported as "Hetzner rebuilt at 5.161.252.33". It is not a clean machine:

- hostname **`pepnationrx`**; `/etc/machine-id` dated **2026-05-22**
- also runs the PepNationRX pharmacy app (billing sweeps, payout runs on root
  cron, a node process on :4000) and the MLB analytics engine
- 107 enabled unit files, Docker, Caddy, Grafana, Prometheus

So the poker engine now shares a host with a payments-processing app and an
analytics stack. That is a blast-radius decision, not a bug — but it should be a
decision someone made on purpose, and the "rebuilt clean box" framing suggests
nobody did.

## 8. Deploy pipeline — verified working post-rotation

`auto-deploy-hetzner.yml` (`secrets.HETZNER_HOST`, `secrets.HETZNER_SSH_KEY`)
succeeded twice at `2026-08-16T00:56:26Z` and `00:57:01Z`, and the resulting
image on 5.161.252.33 is 32 minutes old at time of check. The secret already
points at the new host and the deploy token survived the purge. No test push was
forced: the workflow restarts the container, which voids in-flight hands, and two
green runs against this exact host is the evidence a third would produce.

## 9. Code fix shipped alongside

`scripts/restart-hetzner.sh` had `HETZNER_IP="178.156.160.206"` hardcoded. After
the cutover it would have restarted the decommissioned box — and then **reported
success**, because its health check read `https://engine.smarter.poker/health`,
i.e. whatever DNS now serves, not the box it restarted. Silent wrong-target with
a green tick.

Now resolves the host from `engine.smarter.poker` at runtime (`HETZNER_IP=` still
overrides), and pins the verification with `curl --resolve` so it checks the box
it actually touched.

---

## Open, needs Dan

1. **Confirm or refute `hriJ9Xg6…`** against the Hetzner console SSH keys (§5).
2. **Destroy 178.156.160.206** — the rooted box. It is out of DNS and dealing
   nothing, but it is still powered on and unreachable by SSH, so only the
   Hetzner console/API can kill it. Snapshot first if the incident write-up
   still wants forensics; entry vector in `0eec5922c` is asserted, not proven.
3. **Still unrotated** from the incident: Supabase Postgres superuser password,
   PokerAtlas, Bravo admin + API token, `CRON_SECRET`, and the Hetzner API token
   itself.
