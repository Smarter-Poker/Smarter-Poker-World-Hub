# Club Arena Shell Freshness At The Public Edge

The Club Arena origin's header change alone did not reach players. After its
Hetzner Caddy reload on September 8, 2026, the origin returned a 60-second
stale-while-revalidate allowance, but smarter.poker still returned 86400 even
on a cache MISS. Two explicit shell rules here override the origin response.

Set those two rules to the same 60-second healthy stale allowance. Keep the
60-second shared fresh lifetime, zero browser fresh lifetime, and one-day
stale-if-error allowance. Immutable asset rules, the Hetzner rewrite, and
all other applications are unchanged. Club Arena bundles still publish through
its own Hetzner pipeline; this change only governs the World Hub edge response.

The incident was observed while verifying Club Arena PR 3719: a reload loaded
an old bundle and retained Game Full; the current bundle provided Watch and
received live hands. A fresh build-info.json alone cannot prove a browser has
adopted the current shell.

Two Node tests pin the two shell policies and immutable assets. The existing
next.config.js rewrite still targets ca-static.smarter.poker. This configuration change uses the existing World Hub git
integration deployment. Verify the public response after deployment; a merged
PR or the origin response alone is not sufficient proof.
