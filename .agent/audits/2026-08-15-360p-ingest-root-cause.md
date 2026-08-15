# The 360p ingest bug — root cause, and the "SSH is broken" myth

Date: 2026-08-15
Author: Cowork agent
Trigger: Dan, after an earlier capture-side fix — "NOTHING CHANGED, ITS ALL
STILL THE SAME." He was right.

Commits: `c9874b92` (root cause + deploy script), `b9a6aa7a` (timeout +
format chain), `bb6b5767` (poster backfill mirror).

## 1. "Hetzner SSH is broken, Dan-only" was false

That assumption has been in the repo since 2026-05-17 and is the reason this
bug survived. `scripts/deploy-workers.sh` had two defects, both here:

1. Its auto-probe tried user **`openclaw`**. The authorised user is
   **`root`** — `~/.ssh/hetzner_deploy` and `~/.ssh/id_ed25519` both
   authenticate as root; every key is refused as openclaw.
2. **`ConnectTimeout=3`**. The box runs ffmpeg at `preset=slow`,
   concurrency 3-6, and sits at load ~18, so sshd routinely needs longer
   than 3s just to emit its banner. The probe timed out against a host that
   was up and healthy. (The same symptom — "Connection timed out during
   banner exchange" — recurs from any client under load; retry, don't
   conclude the host is down.)

Both fixed: try root first, 20-25s timeouts, and the detected user threaded
through `ssh_cmd`/`scp` instead of a hardcoded `openclaw@`. Deploys work.

## 2. Root cause of the grain: ONE format on offer

`scripts/yt-transcode-worker/index.js` passed:

    player_client=tv,web_safari,mweb,web_embedded;player_skip=webpage,configs

Tested on the worker box, same video, same production cookie jar:

| extractor-args | formats offered |
|---|---|
| `tv,web_safari,mweb,web_embedded` | **itag 18, 640x360 — the only one** |
| `default` | up to **3840x2160** |

It was not *preferring* 360p. 360p was the entire format list, so the
`bv*[height<=1080]+ba` selector had nothing better to choose and EVERY
ingest landed at 640x360 (202x360 for shorts).

That closes the whole chain: the stored MP4s really are 360p (ffprobe
confirmed), and the posters — which the worker extracts at the source's
native resolution — inherited it, while YouTube held 1280x720+ masters for
the same videos all along.

The restricted clients existed to dodge bot detection. That job is now done
by the cookie jar plus the PO-token provider, verified healthy:
`bgutil-pot.service` active on :4416, plugin `bgutil:http-1.3.1` confirmed
loaded by yt-dlp's own `-v` plugin discovery. The pin was buying nothing but
a 360p ceiling.

## 3. The fix surfaced a second problem — caught by watching, not assuming

Within an hour of the first deploy, **19 jobs failed `yt-dlp_timeout_300s`**.
`YT_DOWNLOAD_TIMEOUT` was 300s, sized for the ~14 MB 360p muxed file that
used to be the only option. A 1080p video+audio pair on a loaded box does
not fit in 5 minutes. Raised to 900s (still bounded by
`--max-filesize 400m` and `--match-filter duration < 600`).

Also hardened the format chain — a few videos expose no `<=1080` video+audio
PAIR and the old chain fell through to `b` or errored "Requested format is
not available" (seen once, `5K4eBrasHTM`). Now steps
1080 -> 720 -> any-muxed.

## 4. Poster backfill (shipped, independently visible)

Separate from the ingest fix and not dependent on it: 14,906 of 15,994 video
posts (93.2%) were repointed to YouTube's own 1280x720 master. Every one of
794 distinct video ids was individually fetched and its JPEG SOF header
parsed — 652 confirmed 1280x720, 142 excluded and left untouched. Prior
values are in `social_posts_thumbnail_backup_20260815` with a one-statement
rollback. Zero posts remain on a low-res ingested poster.

## 5. STATUS — what is and is not verified

VERIFIED:
- Root cause, by direct format-list comparison on the box.
- SSH/deploy path works; both deploys transferred and restarted
  `sp-yt-transcode` (reported `active`).
- The 900s build is live: jobs claimed at 19:11 were still running at 19:31
  (20 min). Under the old 300s budget they would have been killed at 19:16.
- Poster backfill, measured in the DB and by re-fetching stored URLs.

NOT YET VERIFIED:
- **No post-fix encode has completed, so no output file has been measured.**
  Do not claim the video quality is fixed until one is. Check with:

      ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
        -of csv=s=x:p=0 "<output_url of a job completed after 19:12 UTC>"

  >=1280 wide means it is working.

## 6. OPEN — capacity, and it now matters more

The box sits at load ~18 with 6 concurrent jobs. Post-fix each job is
roughly 15 min download + up to 10 min encode, versus ~1 min before. At
that rate the ~508 distinct videos would take on the order of 35 hours to
re-ingest at current concurrency, and SSH becomes intermittently
unreachable under the load.

Recommended before any bulk re-ingest:
- Lower `MAX_CONCURRENT_YT` (3-6 concurrent 1080p encodes is thrashing a box
  that cannot even answer sshd), and/or size up the VM.
- Upgrade yt-dlp — pinned at 2026.5.3, over three months old, which is why
  bot detection bites. Upgrading is the standard remedy.
- Re-ingest in paced batches by DISTINCT source video, worst resolution
  first. A handful of sources back 100+ posts each, so the first batches
  carry disproportionate value.

Do NOT bulk re-queue until a single job is confirmed producing >=720p
output and the concurrency question is settled.
