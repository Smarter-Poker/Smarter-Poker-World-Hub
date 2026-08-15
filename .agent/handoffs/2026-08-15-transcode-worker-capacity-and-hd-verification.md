# HANDOFF — reels-transcode-worker: unreachable box, capacity, HD verification

Date: 2026-08-15
From: Cowork agent (session 01WTbki1yMm1DMXiosi7Zij4)
Blocked on: a shell on a box whose sshd will not answer, and one billing decision.

Self-contained. Do not rely on `.memory/` — everything needed is below.

---

## WHY THIS EXISTS

The "all the videos in the feed are grainy" bug is **root-caused and fixed in
code**, but the fix has **never been observed producing a finished HD file**,
because the worker box cannot run the fixed pipeline. The box is now
unreachable over SSH for reasons I could not diagnose remotely.

I need someone with **out-of-band console access** (Hetzner Cloud Console web
VNC, which does not depend on sshd) to complete steps 1-2. Everything after
that is scripted below.

---

## CURRENT STATE (verify before you touch anything)

- **`sp-yt-transcode` is STOPPED and DISABLED** on reels-transcode-worker.
  YouTube video ingest is PAUSED platform-wide. Verified via DB: no write to
  `video_transcode_jobs` since 2026-08-15 20:45 UTC.
- This was deliberate. Before pausing it was failing **100%** of jobs
  (`yt-dlp_timeout_300s`, then `yt-dlp_timeout_900s`) and pinning the CPU so
  hard sshd could not complete a banner exchange.
- **Nothing user-facing is affected.** smarter.poker (Vercel + Supabase) is
  fine. The feed poster improvement (14,906 posts now on 1280x720 posters) is
  independent of this box and is live.
- Hetzner CPU metrics still show **~205-226% of 300%** on that box even with
  the unit disabled. **Something other than sp-yt-transcode is consuming it.
  That is the unknown.**

## ACCESS (all of this is already on Dan's Mac and verified working)

| Thing | Value |
|---|---|
| Host | `reels-transcode-worker`, `5.161.49.206`, Hetzner server id `128782737` |
| Size | **cpx21 — 3 vCPU / 4 GB** (this is the core problem) |
| SSH user | **`root`** — NOT `openclaw` |
| SSH keys | `~/.ssh/hetzner_deploy` or `~/.ssh/id_ed25519` (both authenticate as root) |
| Worker file | `/opt/smarter-poker/yt-transcode-worker/index.js` |
| Unit | `sp-yt-transcode.service` |
| POT provider | `bgutil-pot.service` on `:4416`, yt-dlp plugin `bgutil:http-1.3.1` (was loading fine) |
| Cookies | `/opt/smarter-poker/yt-transcode-worker/cookies.txt` |
| Hetzner API token | `security find-generic-password -a smarter-poker -s hetzner-api -w` |
| Deploy | `REELS_WORKER_IP=5.161.49.206 bash scripts/deploy-workers.sh` |

**Myth correction, please propagate:** "Hetzner SSH is broken since
2026-05-17 / Dan-only" was FALSE. `scripts/deploy-workers.sh` probed the
wrong user (`openclaw`) with a 3-second timeout on a box at load 18. Fixed in
`c9874b92`. SSH works when the box is not pinned.

---

## WHAT I NEED — in order

### STEP 1 (NEEDS YOU — console, not SSH)
Open the **Hetzner Cloud Console** for server `128782737` (web VNC, out of
band). Log in as root and run:

    ps -eo pcpu,pmem,etime,comm --sort=-pcpu | head -15
    systemctl is-active sp-yt-transcode
    systemctl list-units --state=running --no-legend | head -20
    yt-dlp --version

**Report the output.** Prime suspects, in order: orphaned `ffmpeg` / `yt-dlp`
children that survived a `systemctl stop` (this DID happen — the unit does
not kill its children, I had to reboot twice), `bgutil-pot.service`, and
`sp-yt-pot-health.timer`.

Kill any orphans:

    pkill -9 ffmpeg; pkill -9 yt-dlp
    uptime   # load should fall within a minute or two

Once load is down, SSH should work again and the rest can be done normally.

### STEP 2 (NEEDS A DECISION — billing)
**cpx21 (3 vCPU) cannot run this pipeline.** It was running 6 concurrent
1080p downloads + `libx264 -preset slow -crf 18` encodes — roughly 2 heavy
encodes per core. Please choose:

- **(a) Resize the VM** to cpx41 (8 vCPU) or cpx51 (16 vCPU). One command,
  requires a power-off, changes the bill:

      # via API, server must be off
      curl -X POST -H "Authorization: Bearer $TOK" \
        -d '{"server_type":"cpx41","upgrade_disk":false}' \
        https://api.hetzner.cloud/v1/servers/128782737/actions/change_type

  (`upgrade_disk:false` keeps it reversible.)

- **(b) Stay on cpx21** and accept low throughput — then `MAX_CONCURRENT_YT=1`
  and `-preset fast` are mandatory, and reprocessing ~508 videos will take
  many hours.

I did not do this myself because it is a spend decision.

### STEP 3 (scripted — anyone can run once the box is reachable)

    # concurrency must match cores. Prod had 6 on a 3-core box.
    mkdir -p /etc/systemd/system/sp-yt-transcode.service.d
    cat > /etc/systemd/system/sp-yt-transcode.service.d/override.conf <<'EOF'
    [Service]
    Environment=MAX_CONCURRENT_YT=1
    EOF
    systemctl daemon-reload

    # yt-dlp is pinned at 2026.5.3 (3 months stale) — this is very likely why
    # downloads were slow enough to blow a 900s budget (YouTube throttling).
    # I attempted this upgrade and could NOT confirm it completed.
    pip install --upgrade --break-system-packages yt-dlp
    yt-dlp --version

### STEP 4 — prove the fix works before anything else

    systemctl enable --now sp-yt-transcode
    journalctl -u sp-yt-transcode -f     # watch ONE job through

Then measure the output — this is the acceptance test:

    ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
      -of csv=s=x:p=0 "<output_url from a newly completed job>"

**>= 1280 wide means the ingest fix is confirmed end to end.** Until this
passes, nobody should report the video quality as fixed. I did not get to
run it.

### STEP 5 — only after step 4 passes
Re-ingest the existing 360p corpus in **paced batches, by DISTINCT source
video, worst resolution first**. 508 distinct YouTube ids back 6,513 posts,
and a handful of sources back 100+ posts each, so the first batches carry
most of the visible benefit. Do not bulk re-queue all of it at once.

---

## WHAT IS ALREADY PROVEN (do not re-litigate)

**Root cause of the 360p videos.** The worker passed
`player_client=tv,web_safari,mweb,web_embedded;player_skip=webpage,configs`.
Tested on the box, same video, same cookies:

| extractor-args | formats offered |
|---|---|
| `tv,web_safari,mweb,web_embedded` | **itag 18, 640x360 — the ONLY one** |
| `default` | up to **3840x2160** |

It was not preferring 360p; 360p was the entire list, so `bv*[height<=1080]+ba`
had nothing better to pick. Fixed to `player_client=default` in `c9874b92`.
Follow-up `b9a6aa7a` raised the download budget 300s -> 900s and added 720p
rungs to the format chain.

The restricted clients existed to dodge bot detection; that job is now done
by the cookie jar + PO-token provider, which was verified healthy.

## TRAPS — I hit these, you don't have to

1. **You cannot drain the job queue from the database.** The worker's
   `stranded-recovery` / `failed-fallback` / `transient-retry` loops refill
   it. I parked 572 jobs; 472 were back within the hour. Stop the SERVICE,
   not the queue.
2. **`systemctl stop` does not kill the yt-dlp/ffmpeg children.** They
   orphan and keep the CPU pinned. `pkill` them explicitly.
3. **"Connection timed out during banner exchange" does not mean the host is
   down.** It means sshd is starved. Retry with `ConnectTimeout=25+`, or
   reduce load first.
4. ~570 jobs carry a ` [parked-20260815-capacity]` marker in
   `error_message` from trap 1. Harmless, cosmetic.
5. 6 rows wedged in `processing` were reset to `queued` by hand — the same
   thing `resetStaleProcessing` does on a healthy start.

## REFERENCE

- `.agent/audits/2026-08-15-360p-ingest-root-cause.md` — full root-cause writeup
- `.agent/audits/2026-08-15-transcode-worker-capacity-halt.md` — the halt + state
- Commits: `c9874b92` (root cause + deploy script), `b9a6aa7a` (timeout +
  format chain), `bb6b5767` (poster backfill mirror)
