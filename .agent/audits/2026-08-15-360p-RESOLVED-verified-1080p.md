# RESOLVED — 360p ingest fixed, 1080p output verified

Date: 2026-08-15 ~21:45 UTC
Author: Cowork agent (verification) + Antigravity agent (final fix)

**This supersedes the "PAUSED / needs console" status in
`2026-08-15-transcode-worker-capacity-halt.md` and the "NOT YET VERIFIED"
section of `2026-08-15-360p-ingest-root-cause.md`. Both are now closed.**
The handoff `2026-08-15-transcode-worker-capacity-and-hd-verification.md`
is complete — no action needed on it.

## Acceptance test PASSED

ffprobe against freshly transcoded outputs (jobs completed after 21:24 UTC):

| orientation | before | after |
|---|---|---|
| landscape | 640x360 | **1920x1080** |
| portrait / shorts | 202x360 | **608x1080** |

Measured on 11 separate outputs; every one came back at 1080 on the long
edge, 1.2-4.2 Mbps. Roughly 3x linear resolution, ~9x the pixels.
Throughput went from **zero completions** (every job timing out) to about
one job every 30-60 seconds.

Sample verified URLs include jobs for `ePWQ5qy2E5w` and `Wp5G4CDS2Tk` — both
1920x1080.

## The complete root cause (two parts)

It took both findings to explain the behaviour:

1. **Format list restricted to 360p** (found here, fixed in `c9874b92`).
   `player_client=tv,web_safari,mweb,web_embedded;player_skip=webpage,configs`
   made YouTube return itag 18 / 640x360 as the ONLY format, so
   `bv*[height<=1080]+ba` had nothing better to select.

2. **yt-dlp could not execute the JavaScript runtime (Deno)** in the worker
   environment (found by the Antigravity agent). Without a JS runtime it
   cannot solve YouTube's `n-sig` challenge, so downloads were throttled to
   a crawl and HD formats were skipped in favour of the fallback.

Part 2 is what my own diagnosis missed and could not have seen from a
`yt-dlp -F` listing: format *enumeration* succeeded in my test (it listed up
to 3840x2160 under `player_client=default`), while the actual *download* was
throttled. That is exactly the signature of the timeouts — 300s raised to
900s in `b9a6aa7a` and still expiring. Fixing the runtime permission removed
the throttle; the two fixes together give correct format selection AND
usable download speed.

**Lesson worth keeping:** a successful `-F` format listing does NOT prove
downloads will work. n-sig failures surface as slow/failed downloads, not as
a missing format list. Check the JS runtime (`--js-runtimes`, Deno/node
availability and permissions) whenever downloads are inexplicably slow.

## Current state

- `sp-yt-transcode` is running and processing normally.
- A paced re-ingestion of the backlog is in progress, deduplicating against
  jobs already picked up by the `stranded-recovery` sweep.
- The cosmetic ` [parked-20260815-capacity]` markers I left on ~570 jobs
  have been cleared.
- Feed posters: 14,906 of 15,994 video posts (93.2%) already sit on verified
  1280x720 YouTube masters from the earlier backfill, so tiles were already
  fixed independently of this.

## Capacity note (still true, now non-blocking)

`reels-transcode-worker` is a **cpx21 — 3 vCPU / 4 GB**. With downloads no
longer throttled it is keeping up, but concurrency and `-preset slow` remain
worth watching during the bulk re-ingest. If load average climbs back toward
~18 and sshd stops answering, reduce `MAX_CONCURRENT_YT` before anything
else — and note that `systemctl stop` does NOT kill yt-dlp/ffmpeg children,
so `pkill` them explicitly.
