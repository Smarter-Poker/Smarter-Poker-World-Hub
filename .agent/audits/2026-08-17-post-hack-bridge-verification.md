# 2026-08-17 Post-Hack Bridge Verification and Repair

Session: Cowork (Claude), overnight 2026-08-17 ~06:00 UTC.
Request: verify and reconnect every bridge/service after the incident.

## Verified WORKING (evidence-based)
- Supabase MCP: full access to kuklfnapbkmacvwxktbh (PokerIQ-Production, ACTIVE_HEALTHY).
- Hetzner engine: alive; hand_history writing ~180 hands/min continuously up to the
  current minute (06:01 UTC). Verified via DB per policy, not the cache-frozen health endpoint.
- Vercel MCP: full access; hub-vanguard latest production deployment READY.
- Production: smarter.poker/api/health -> 200, version f27764f7 == GitHub main == local HEAD.
  DB check ok (120ms). Pipeline GitHub -> Vercel -> prod verified end to end.
- Host git/SSH: authenticates as Smarter-Poker. Push capability intact via
  counselors host_terminal (this is the canonical agent push surface now).

## BROKEN found and FIXED
1. club-arena local clone diverged (ahead 853 / behind 837) against the post-incident
   restored history (origin/main b1a1ba2cf, "restore 7 force-pushed PRs", #87).
   FIX: backed up local history to branch backup/pre-restore-local-20260817, then
   reset main to origin/main. 833/853 local subjects already existed on remote;
   the 20 unique ones are incident-ops commits superseded by #87.
2. Stale .git/index.lock stranded in club-arena by a sandbox-VM git read (the mount
   cannot unlink; known trap). Removed on host.
3. WH working tree carried incident-window debris: an unattributed WorldHub.tsx edit
   (reverts intentional 8b7b5b54ed toke-tracker sizing; mtime Aug 16 11:29) plus five
   test/debug scripts. Edit stashed as stash@{0} for review; scripts moved to
   ~/Documents/_wh_debris_20260817/.

## BROKEN - needs Dan (cannot be fixed by an agent)
1. Cowork GitHub MCP connector is authenticated to the WRONG GitHub account:
   "SmarterPoker" (id 253155403) - an old/second account holding a STALE March 2026
   mirror of Smarter-Poker-World-Hub. It gets 404 on the real private repos under
   "Smarter-Poker" (id 254329056). Reconnect the GitHub connector in Claude settings
   to the Smarter-Poker account. Until then agents push via host git (works today).
2. The fine-grained PAT in WH .env (github_pat_11B..., 93 chars) returns
   "Write access to repository not granted" on both repos - revoked or unscoped.
   Rotate it or grant it repo access if agents should push via HTTPS from sandboxes.
3. Review the SmarterPoker doppelganger account itself: it holds a copy of the
   (private) World Hub repo current to ~2026-03-21. If it is not a deliberate backup
   account, treat as an incident artifact and lock it down / delete the mirror.

## Deploy proof
This commit itself is the end-to-end test: git-safe-push.sh must exit 0 with
DEPLOY_VERIFIED:true and SHA_MATCHED:true for this file to be on main.
