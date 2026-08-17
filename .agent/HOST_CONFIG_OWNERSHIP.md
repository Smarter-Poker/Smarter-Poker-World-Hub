# Host config ownership — who may change what on the Hetzner boxes

Status: active rule. Written 2026-08-16 after two agents overwrote each other's
work on the same host inside one afternoon, costing a production reboot.

## What happened, precisely

Two incidents, same root cause, four hours apart.

**1. `authorized_keys` replaced instead of appended.** An agent doing the host
SSH-key rotation SSHed in from Dan's Mac using the old key, wrote a fresh
`/root/.ssh/authorized_keys` containing *only* its newly generated key, and
carried on. Evidence: file mtime `16:23:29Z`, a login at that exact second from
`24.15.206.254` on the old key `fK6di6…`, then every subsequent login on the new
key `lDmUhrgFLAaF…`. The new key's comment was `smarter.poker hetzner rotation
2026-08-16`.

That single write locked out both the other operator's key *and* the GitHub
Actions deploy key. GitHub Actions had SSHed in successfully at `16:19:23Z` and
was failing by `16:29`. The engine never noticed — HTTP 200, 61 tables, 0
stalled, container healthy throughout. It was an access outage, not a service
outage, but recovery required Hetzner rescue mode and a reboot of a box serving
live poker.

**2. The fail2ban allowlist reverted.** The operator IPs added to
`/etc/fail2ban/jail.d/00-allowlist.local` were gone within the hour, the file
back to its original byte count with the explanatory comment stripped. Same
shape: a whole-file write where a merge was needed.

Neither was malicious. Both were an agent assuming it was the only writer.

## The rule

**Any file on a Hetzner host that more than one operator can write is
append-or-merge only. Never whole-file replace.**

That applies in particular to:

| File | Correct operation |
|---|---|
| `/root/.ssh/authorized_keys` | append the new key, remove specific old ones by fingerprint |
| `/etc/fail2ban/jail.d/*.local` | read `ignoreip`, add missing entries, write back |
| `/etc/ssh/sshd_config.d/*.conf` | own a uniquely named drop-in; never edit another's |
| `/opt/club-arena/.git/config` | change only the key you came to change |

### Rotating an SSH key

Never in one write. Three steps, verified between each:

1. **Append** the new public key. Confirm the new key authenticates *in a second
   session* while the first stays open.
2. Update every consumer — `secrets.HETZNER_SSH_KEY`, the other operator's
   machine, any deploy key — and confirm each one works.
3. **Only then** remove the old key, by fingerprint, leaving everything else.

Step 1 keeping a session open is what turns a lockout into an inconvenience.

### Before writing any shared host file

- Read it first. If it contains entries you did not add, you are not the only
  writer — merge, do not replace.
- Back it up alongside (`cp -a f f.bak-$(date +%Y%m%dT%H%M%S)`).
- Verify *after* reloading, not after writing. A config on disk that the daemon
  has not reloaded is not in effect: `fail2ban-client get sshd ignoreip` reported
  the operator IPs absent for several minutes while the file on disk contained
  them, because the daemon had been started by `apt` before the file landed.

### Ordering gotcha, learned the hard way

`fail2ban` reads `jail.d/*.local` alphabetically and the **last** file wins.
A drop-in named `00-admin-ignoreip.local` was silently overridden by the
existing `00-allowlist.local`. Merge into the file that already owns the setting
rather than adding a competing one, or verify the effective value afterwards —
never assume the file you wrote is the file in force.

## Recovery, if access is lost anyway

In order of increasing disruption:

1. `.github/workflows/restore-admin-ssh-key.yml` (Club Arena) — break-glass.
   Fires on a change to `.ops/restore-admin-key.pub`, appends that key if
   absent. Uses the Actions deploy key, so it only helps if *that* key survives.
2. Hetzner **rescue mode** via the API — non-destructive, disk intact. Snapshot
   first, then capture `authorized_keys` mtime and `/var/log/auth.log` *before*
   repairing: that evidence is what distinguishes a colliding agent from an
   intruder, and it is destroyed by a naive fix.
3. Rebuild. Last resort; loses the box.

## Coordination

Before infrastructure work on a shared host, say so in the channel the other
operators read, and say when you are done. The cost of announcing is seconds.
The cost of not announcing, measured today, was a rescue-mode boot of the
production poker engine.
