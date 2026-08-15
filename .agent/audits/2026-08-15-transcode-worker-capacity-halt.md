# Transcode worker PAUSED — the box cannot run the HD pipeline

Date: 2026-08-15 ~21:05 UTC
Author: Cowork agent
Reads with: `2026-08-15-360p-ingest-root-cause.md`

## CURRENT STATE — read this first

**`sp-yt-transcode` on reels-transcode-worker (5.161.49.206) is STOPPED and
DISABLED.** Confirmed from the database: no worker write to
`video_transcode_jobs` since 20:45 UTC. YouTube video ingest is PAUSED. It
will not resume on reboot until someone runs:

    systemctl enable --now sp-yt-transcode

This was deliberate. Before the pause the service was failing **100%** of
jobs (`yt-dlp_timeout_300s`, then `yt-dlp_timeout_900s`) while pinning the
box so hard that sshd could not complete a banner exchange. Paused is
strictly better than thrashing: nothing was being produced either way, and
paused leaves the box administrable.

Nothing user-facing depends on this. smarter.poker (Vercel + Supabase) is
unaffected. The 1280x720 poster backfill is independent and still live —
that is the visible feed improvement and it does not need this worker.

## Why it is paused

`reels-transcode-worker` is a **cpx21: 3 vCPU, 4 GB**. It was running
**6 concurrent** jobs, each doing a 1080p download plus an
`libx264 -preset slow -crf 18` encode. That is roughly 2 heavy encodes per
core. Observed load average: **~18**.

Before the ingest fix this was survivable only because every download was
the 360p muxed file (~14 MB) — small and quick. Fixing the format selector
(c9874b92) made the pipeline do what it should always have done, and the
box's real capacity became the binding constraint immediately:

- 300s download budget -> 19 timeouts. Raised to 900s (b9a6aa7a).
- 900s budget -> still timing out. Downloads were not merely large, they
  were slow, consistent with YouTube throttling against a yt-dlp pinned at
  2026.5.3 (three months stale).
- sshd stopped answering entirely, so the box could not be reconfigured.

## What was tried

1. Parked all 572 queued jobs in the DB to starve the worker. Did not hold —
   the worker's own `stranded-recovery` / `failed-fallback` /
   `transient-retry` loops re-queued them within minutes (472 back within
   the hour). **Note for future agents: you cannot drain this queue from the
   database. The worker refills it.**
2. Rebooted via the Hetzner API to catch a low-load boot window. Worked —
   got in and ran `systemctl stop` + `disable`.
3. `systemctl stop` did NOT kill the child yt-dlp/ffmpeg processes; they
   orphaned and kept the CPU pinned. A second reboot (with the unit now
   disabled) was needed.
4. Attempted `pip install --upgrade yt-dlp` — did not confirm completion,
   SSH dropped mid-run. **yt-dlp version is UNKNOWN right now; verify before
   trusting it.**

## Still unreachable, and unexplained

After the second reboot with the unit disabled, Hetzner CPU metrics still
report **~205-226% of 300%** and sshd still times out during banner
exchange. Something other than `sp-yt-transcode` is consuming that box. It
was not identifiable without a shell.

Next person should use the **Hetzner Cloud Console** (web VNC, out-of-band —
does not need sshd) to get a shell and run `ps -eo pcpu,comm --sort=-pcpu`.
Candidates worth checking first: `bgutil-pot.service`, the
`sp-yt-pot-health.timer`, and any orphaned ffmpeg from before the reboots.

## Recommended sequence when picking this up

1. Console in, identify and stop the runaway CPU consumer.
2. **Resize the VM.** cpx21 (3 vCPU) cannot run this pipeline. Either size up
   (cpx41/cpx51) or accept much lower throughput.
3. Set concurrency to match cores — `MAX_CONCURRENT_YT=1` on a 3-core box
   for `preset=slow`. The code default is 3; production had it at 6.
4. Consider `-preset fast` instead of `slow` at crf 18. Visually very close,
   several times quicker, and there are ~508 distinct source videos to
   reprocess.
5. Confirm `yt-dlp --version` is current; upgrade if not. This is the likely
   throttling fix.
6. Re-enable, let ONE job run, and measure before doing anything else:

       ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
         -of csv=s=x:p=0 "<output_url>"

   >=1280 wide = the ingest fix is confirmed working end to end.
7. Only then re-ingest in paced batches, by DISTINCT source video, worst
   resolution first. A handful of sources back 100+ posts each.

## Housekeeping done

- 6 rows wedged in `processing` (orphaned by the stop) were reset to
  `queued` — the same thing `resetStaleProcessing` does on a healthy start.
- 572 jobs carry a ` [parked-20260815-capacity]` marker in `error_message`
  from step 1 above. Harmless; the worker re-queued them anyway.

## Honest status of the 360p fix

The root cause is **proven** (format-list comparison on the box) and the fix
is **committed and deployed to the worker file**. It has **never been
observed producing a finished HD file**, because no job has completed since
the fix landed. Do not report the video quality as fixed until step 6 above
passes.
