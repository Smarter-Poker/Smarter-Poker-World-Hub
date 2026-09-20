# PokerAtlas's scheduled runtime disappeared

Incident5576 correctly found zero rows in venue_live_tables at18:00UTC on
September13. The local launchd configuration still pointed at
`~/.local/share/smarter-poker-scraper-runtime-20260906`, but that directory
contained only data. Its entire scripts directory was absent. Python exited2
before ingestion began; the legacy launcher's crash notification only appended
to a local log. There were920 logged exit2 attempts from September10 at08:44CDT
through September13 at13:22CDT. The last database cycle started September10 at
13:18UTC and saved388 rows. The initiating deletion actor or command is unknown.

The new standard-library supervisor lives outside the checked release. The
installer accepts a complete40-character commit contained in origin/main and
reads every executable byte from that Git object. It stages an immutable release,
recordsSHA256 hashes, validates Python3.13/browser-package prerequisites and the
two catalog inputs, then atomically switches the current pointer. Existing
sweep checkpoints and logs stay in the existing data directory. It refuses
altered generations, unexpected symlinks, incomplete manifests and missing
inputs. It preserves the venv executable path rather than resolving its symlink
into a base Python that lacks the installed packages. It does not install any
packages or download any data.

Launchd must invoke the copied runner.py with a standard-library Python outside
the scraper venv. The supervisor validates the release before starting one
owned child process group. A lock excludes duplicate daemons. Termination is
forwarded, including during process creation, and an unresponsive owned group
is bounded by a10-second grace period. Neighbor processes are untouched.

Missing-code, modified-code and child-exit failures are fsynced to a private
local outbox. The service-only operational inbox must return a positive integer
receipt before delivery is acknowledged. Events and receipts remain available
for audit, and network/receipt-write failures replay the same event key. No
phone provider is used and process exit is never interpreted as recovery.
Credentials remain in a separate0600 auth.json under a0700 root; the supervisor
only accepts the configured production project. Never commit or print that file.

Fourteen native tests cover real Git objects, interrupted filesystem staging,
changed/missing/symlinked code, unchanged sweep state, repeated installation,
venv path preservation, one-writer locking, real child failure, owned-group
termination with a live neighbor, real loopback HTTP delivery, outage/replay,
invalid responses, corrupt local receipts, and credential permissions/project
validation. Only the installer's external browser-package availability check is
substituted in the disposable installer fixtures; production installation runs
that check against the actual existing venv. The required Build Safety Gate now
runs this suite. No tests access production, start a scraper or send messages.

Publication is followed by installing that merged source, backing up the exact
existing PokerAtlas launchd plist, updating only its runtime entrypoint, and
checking the first natural persisted cycle. A live process alone is not proof
that source parsing or ingestion recovered. PokerAtlas catalog observations
must retain their existing catalog provenance; no invented live table counts.
