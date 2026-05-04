# Hetzner Inventory Audit — 2026-05-04

## 1. Live inventory (from Hetzner API)

```
125093929  club-arena-engine       cpx11  ash   178.156.160.206  2026-03-27T15:08:22Z  {"project":"smarter-poker","service":"game-engine"}
127861894  openclaw-dispatcher     cx23   nbg1  178.104.160.250  2026-04-23T23:39:20Z  {"managed_by":"openclaw","role":"cron-dispatcher"}
127930016  workers-dispatcher      cx23   fsn1  178.104.180.220  2026-04-24T16:22:22Z  {"managed_by":"phase-2b1","role":"workers"}
128782737  reels-transcode-worker  cpx21  ash   5.161.49.206     2026-05-01T17:52:04Z  {"managed-by":"github-actions","project":"smarter-poker-reels","service":"yt-transcode"}
```

## 2. DNS resolution
```
=== DNS lookups ===
--- smarter.poker ---
216.150.1.65
216.150.16.129
--- engine.smarter.poker ---
178.156.160.206
--- workers.smarter.poker ---
216.150.16.193
216.150.1.1
--- openclaw.smarter.poker ---
216.150.16.129
216.150.1.1
--- reels.smarter.poker ---
216.150.16.1
216.150.1.1
```

## 3. Per-server inspection
### server-125093929-club-arena-engine.txt
```
=== Inspecting club-arena-engine (125093929) - cpx11 in ash at 178.156.160.206 ===
--- engine-safe checks only ---
{"status":"ok","version":"local","running":true,"uptime":268639,"activeTables":36,"activeTournaments":28,"totalHandsDealt":8747,"telemetry":{"avgHandDurationMs":42387,"avgHandsPerHour":90,"tablesWithMetrics":19},"performance":{"avgActionProcessingMs":0,"totalActionsRecorded":0,"processingThresholdViolations":0,"broadcastThresholdViolations":0}}
club-arena-engine
 20:49:06 up 21 days, 0 min,  1 user,  load average: 0.59, 0.52, 0.53
---
club-arena-engine	Up 3 days	0.0.0.0:8080->8080/tcp, [::]:8080->8080/tcp
sp-alertmanager	Up 2 weeks	127.0.0.1:9093->9093/tcp
sp-grafana	Up 2 weeks	127.0.0.1:3001->3000/tcp
sp-prometheus	Up 2 weeks	127.0.0.1:9090->9090/tcp
sp-node-exporter	Up 2 weeks	
---
State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess                                                   
LISTEN 0      4096         0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=557293,fd=3),("systemd",pid=1,fd=132))
LISTEN 0      4096      127.0.0.54:53         0.0.0.0:*    users:(("systemd-resolve",pid=581042,fd=17))             
LISTEN 0      4096       127.0.0.1:35517      0.0.0.0:*    users:(("containerd",pid=774,fd=9))                      
LISTEN 0      4096         0.0.0.0:8080       0.0.0.0:*    users:(("docker-proxy",pid=572300,fd=7))                 
LISTEN 0      4096       127.0.0.1:9090       0.0.0.0:*    users:(("docker-proxy",pid=148902,fd=7))                 
LISTEN 0      4096       127.0.0.1:9093       0.0.0.0:*    users:(("docker-proxy",pid=149212,fd=7))                 
LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*    users:(("systemd-resolve",pid=581042,fd=15))             
LISTEN 0      4096       127.0.0.1:2019       0.0.0.0:*    users:(("caddy",pid=724,fd=7))                           
LISTEN 0      4096            [::]:22            [::]:*    users:(("sshd",pid=557293,fd=4),("systemd",pid=1,fd=137))
LISTEN 0      4096               *:80               *:*    users:(("caddy",pid=724,fd=10))                          
LISTEN 0      4096               *:443              *:*    users:(("caddy",pid=724,fd=9))                           
LISTEN 0      4096            [::]:8080          [::]:*    users:(("docker-proxy",pid=572306,fd=7))                 
LISTEN 0      4096               *:9100             *:*    users:(("node_exporter",pid=146097,fd=3))                
```

### server-127861894-openclaw-dispatcher.txt
```
=== Inspecting openclaw-dispatcher (127861894) - cx23 in nbg1 at 178.104.160.250 ===
=== hostname / uname / uptime ===
openclaw-dispatcher
Linux openclaw-dispatcher 5.15.0-164-generic #174-Ubuntu SMP Fri Nov 14 20:25:16 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
 20:49:10 up 10 days, 21:09,  0 users,  load average: 0.10, 0.04, 0.01

=== /etc/os-release ===
PRETTY_NAME="Ubuntu 22.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.5 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy

=== last 5 logins ===
reboot   system boot  5.15.0-164-gener Thu Apr 23 23:39   still running

wtmp begins Thu Jan  8 10:30:31 2026

=== systemd units running ===
  proc-sys-fs-binfmt_misc.automount loaded active running Arbitrary Executable File Formats File System Automount Point
  init.scope                        loaded active running System and Service Manager
  session-858.scope                 loaded active running Session 858 of User root
  atd.service                       loaded active running Deferred execution scheduler
  cron.service                      loaded active running Regular background program processing daemon
  dbus.service                      loaded active running D-Bus System Message Bus
  getty@tty1.service                loaded active running Getty on tty1
  hc-net-ifup@enp7s0.service        loaded active running Enable Hetzner Cloud private network interfaces enp7s0
  irqbalance.service                loaded active running irqbalance daemon
  multipathd.service                loaded active running Device-Mapper Multipath Device Controller
  networkd-dispatcher.service       loaded active running Dispatcher daemon for systemd-networkd
  openclaw.service                  loaded active running OpenClaw Cron Dispatcher
  packagekit.service                loaded active running PackageKit Daemon
  polkit.service                    loaded active running Authorization Manager
  qemu-guest-agent.service          loaded active running QEMU Guest Agent
  rsyslog.service                   loaded active running System Logging Service
  serial-getty@ttyS0.service        loaded active running Serial Getty on ttyS0
  sp-transcode.service              loaded active running Smarter Poker Video Transcode Worker
  sp-yt-transcode.service           loaded active running Smarter Poker YouTube Transcode Worker
  ssh.service                       loaded active running OpenBSD Secure Shell server
  systemd-journald.service          loaded active running Journal Service
  systemd-logind.service            loaded active running User Login Management
  systemd-networkd.service          loaded active running Network Configuration
  systemd-resolved.service          loaded active running Network Name Resolution
  systemd-timesyncd.service         loaded active running Network Time Synchronization
  systemd-udevd.service             loaded active running Rule-based Manager for Device Events and Files
  unattended-upgrades.service       loaded active running Unattended Upgrades Shutdown
  user@0.service                    loaded active running User Manager for UID 0
  dbus.socket                       loaded active running D-Bus System Message Bus Socket
  multipathd.socket                 loaded active running multipathd control socket
  syslog.socket                     loaded active running Syslog Socket
  systemd-journald-audit.socket     loaded active running Journal Audit Socket
  systemd-journald-dev-log.socket   loaded active running Journal Socket (/dev/log)
  systemd-journald.socket           loaded active running Journal Socket
  systemd-networkd.socket           loaded active running Network Service Netlink Socket
  systemd-udevd-control.socket      loaded active running udev Control Socket
  systemd-udevd-kernel.socket       loaded active running udev Kernel Socket

=== systemd unit files matching app patterns ===
openclaw.service                       enabled         enabled
sp-transcode.service                   enabled         enabled
sp-yt-transcode.service                enabled         enabled

=== docker ps -a ===

=== docker images ===

=== listening TCP ports ===
State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess                                    
LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=104749,fd=3))          
LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*    users:(("systemd-resolve",pid=4445,fd=14))
LISTEN 0      128             [::]:22           [::]:*    users:(("sshd",pid=104749,fd=4))          

=== root crontab ===

=== /etc/cron.d ===
total 16
drwxr-xr-x  2 root root 4096 Sep 11  2024 .
drwxr-xr-x 95 root root 4096 May  3 08:37 ..
-rw-r--r--  1 root root  201 Jan  8  2022 e2scrub_all
-rw-r--r--  1 root root  102 Mar 23  2022 .placeholder
30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all_cron
10 3 * * * root test -e /run/systemd/system || SERVICE_MODE=1 /sbin/e2scrub_all -A -r

=== users with home dirs ===

=== /opt and /srv ===
total 16
drwxr-xr-x  4 root     root     4096 Apr 29 21:24 .
drwxr-xr-x 20 root     root     4096 Apr 23 23:39 ..
drwxr-xr-x  7 openclaw openclaw 4096 May  3 08:36 openclaw
drwxr-xr-x  4 openclaw openclaw 4096 May  3 08:36 smarter-poker

total 8
drwxr-xr-x  2 root root 4096 Sep 11  2024 .
drwxr-xr-x 20 root root 4096 Apr 23 23:39 ..

=== disk usage ===
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           382M  888K  381M   1% /run
/dev/sda1        38G  3.4G   33G  10% /
tmpfs           1.9G     0  1.9G   0% /dev/shm
tmpfs           5.0M     0  5.0M   0% /run/lock
/dev/sda15      253M  142K  252M   1% /boot/efi
tmpfs           382M  4.0K  382M   1% /run/user/0

=== top 5 RAM ===
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
openclaw   90854  0.0  9.8 12092552 385052 ?     Ssl  Apr29   2:10 /usr/bin/node index.js
root        4447  0.0  4.3 244176 168336 ?       S<s  Apr23   4:32 /lib/systemd/systemd-journald
openclaw  135436  0.0  2.2 11792084 86192 ?      Ssl  May03   1:31 /usr/bin/node index.js
openclaw  133013  0.2  1.1 778368 43884 ?        Ssl  May03   4:52 /opt/openclaw/venv/bin/python /opt/openclaw/dispatcher.py
root      152875 17.2  0.8 116184 31264 ?        Sl   20:49   0:00 /usr/bin/python3 /usr/lib/ubuntu-release-upgrader/check-new-release -q

=== top 5 CPU ===
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root      152875 17.2  0.8 116184 31264 ?        Sl   20:49   0:00 /usr/bin/python3 /usr/lib/ubuntu-release-upgrader/check-new-release -q
root      152830  2.2  0.2  17072  9688 ?        Ss   20:49   0:00 /lib/systemd/systemd --user
root      152917  1.6  0.2  17228 11100 ?        Ss   20:49   0:00 sshd: root@notty
root      152924  1.5  0.2  16788 10448 ?        Ss   20:49   0:00 sshd: unknown [priv]
root      152970  1.0  0.2  15440  8900 ?        Ss   20:49   0:00 sshd: [accepted]

=== journalctl tails ===
--- openclaw ---
May 04 20:49:00 openclaw-dispatcher python[133013]: 2026-05-04 20:49:00,004 [INFO] ▶ Firing /api/cron/transcode-videos → vercel
May 04 20:49:00 openclaw-dispatcher python[133013]: 2026-05-04 20:49:00,463 [INFO] ✅ /api/cron/transcode-videos → vercel 200 [0.5s]
May 04 20:49:00 openclaw-dispatcher python[133013]: 2026-05-04 20:49:00,466 [INFO] Job "/api/cron/transcode-videos (trigger: cron[minute='*/1'], next run at: 2026-05-04 20:50:00 UTC)" executed successfully
May 04 20:49:00 openclaw-dispatcher python[133013]: 2026-05-04 20:49:00,496 [INFO] ✅ /api/cron/hard-stop → workers 200 [0.5s]
May 04 20:49:00 openclaw-dispatcher python[133013]: 2026-05-04 20:49:00,497 [INFO] Job "/api/cron/hard-stop (trigger: cron[minute='*/1'], next run at: 2026-05-04 20:50:00 UTC)" executed successfully
--- sp-transcode ---
May 01 06:21:24 openclaw-dispatcher systemd[1]: /etc/systemd/system/sp-transcode.service:20: Unknown key name 'StartLimitIntervalSec' in section 'Service', ignoring.
May 01 06:21:24 openclaw-dispatcher systemd[1]: /etc/systemd/system/sp-transcode.service:20: Unknown key name 'StartLimitIntervalSec' in section 'Service', ignoring.
May 02 06:41:06 openclaw-dispatcher systemd[1]: /etc/systemd/system/sp-transcode.service:20: Unknown key name 'StartLimitIntervalSec' in section 'Service', ignoring.
May 03 08:37:25 openclaw-dispatcher systemd[1]: /etc/systemd/system/sp-transcode.service:20: Unknown key name 'StartLimitIntervalSec' in section 'Service', ignoring.
May 03 08:37:26 openclaw-dispatcher systemd[1]: /etc/systemd/system/sp-transcode.service:20: Unknown key name 'StartLimitIntervalSec' in section 'Service', ignoring.
--- sp-yt-transcode ---
May 04 18:31:32 openclaw-dispatcher sp-yt-transcode[135436]: [yt-worker 2026-05-04T18:31:32.863Z] ✗ Job 006c053c-eec1-4a8c-b96b-782f0e65b9ae failed: yt-dlp_exit_1: from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies. Also see  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies  for tips on effectively exporting YouTube cookies
May 04 20:10:33 openclaw-dispatcher sp-yt-transcode[135436]: [yt-worker 2026-05-04T20:10:33.143Z] Reset 1 stale 'processing' row(s) (periodic_stale_reset)
May 04 20:10:34 openclaw-dispatcher sp-yt-transcode[135436]: [yt-worker 2026-05-04T20:10:34.135Z] ▶ Job d4c4b4bf-8d77-489f-b81c-0d0ece915bb8 — https://www.youtube.com/embed/gkLoIe5J45g
May 04 20:10:34 openclaw-dispatcher sp-yt-transcode[135436]: [yt-worker 2026-05-04T20:10:34.137Z]   No cookies.txt found — downloads may fail on datacenter IPs
May 04 20:10:35 openclaw-dispatcher sp-yt-transcode[135436]: [yt-worker 2026-05-04T20:10:35.654Z] ✗ Job d4c4b4bf-8d77-489f-b81c-0d0ece915bb8 failed: yt-dlp_exit_1: from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies. Also see  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies  for tips on effectively exporting YouTube cookies
--- caddy ---
-- No entries --
--- docker ---
-- No entries --
```

### server-127930016-workers-dispatcher.txt
```
=== Inspecting workers-dispatcher (127930016) - cx23 in fsn1 at 178.104.180.220 ===
=== hostname / uname / uptime ===
workers-dispatcher
Linux workers-dispatcher 5.15.0-164-generic #174-Ubuntu SMP Fri Nov 14 20:25:16 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
 20:49:18 up 10 days,  4:26,  0 users,  load average: 0.00, 0.00, 0.00

=== /etc/os-release ===
PRETTY_NAME="Ubuntu 22.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.5 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy

=== last 5 logins ===
reboot   system boot  5.15.0-164-gener Fri Apr 24 16:22   still running

wtmp begins Thu Dec 18 09:27:09 2025

=== systemd units running ===
  proc-sys-fs-binfmt_misc.automount                                             loaded active running Arbitrary Executable File Formats File System Automount Point
  docker-2a88a5fca7e7b005c815fe9f879dbc1bf5bb7d99a96ca876d350e333718601f9.scope loaded active running libcontainer container 2a88a5fca7e7b005c815fe9f879dbc1bf5bb7d99a96ca876d350e333718601f9
  init.scope                                                                    loaded active running System and Service Manager
  session-751.scope                                                             loaded active running Session 751 of User root
  atd.service                                                                   loaded active running Deferred execution scheduler
  containerd.service                                                            loaded active running containerd container runtime
  cron.service                                                                  loaded active running Regular background program processing daemon
  dbus.service                                                                  loaded active running D-Bus System Message Bus
  docker.service                                                                loaded active running Docker Application Container Engine
  getty@tty1.service                                                            loaded active running Getty on tty1
  hc-net-ifup@enp7s0.service                                                    loaded active running Enable Hetzner Cloud private network interfaces enp7s0
  irqbalance.service                                                            loaded active running irqbalance daemon
  multipathd.service                                                            loaded active running Device-Mapper Multipath Device Controller
  networkd-dispatcher.service                                                   loaded active running Dispatcher daemon for systemd-networkd
  packagekit.service                                                            loaded active running PackageKit Daemon
  polkit.service                                                                loaded active running Authorization Manager
  qemu-guest-agent.service                                                      loaded active running QEMU Guest Agent
  rsyslog.service                                                               loaded active running System Logging Service
  serial-getty@ttyS0.service                                                    loaded active running Serial Getty on ttyS0
  ssh.service                                                                   loaded active running OpenBSD Secure Shell server
  systemd-journald.service                                                      loaded active running Journal Service
  systemd-logind.service                                                        loaded active running User Login Management
  systemd-networkd.service                                                      loaded active running Network Configuration
  systemd-resolved.service                                                      loaded active running Network Name Resolution
  systemd-timesyncd.service                                                     loaded active running Network Time Synchronization
  systemd-udevd.service                                                         loaded active running Rule-based Manager for Device Events and Files
  unattended-upgrades.service                                                   loaded active running Unattended Upgrades Shutdown
  user@0.service                                                                loaded active running User Manager for UID 0
  dbus.socket                                                                   loaded active running D-Bus System Message Bus Socket
  docker.socket                                                                 loaded active running Docker Socket for the API
  multipathd.socket                                                             loaded active running multipathd control socket
  syslog.socket                                                                 loaded active running Syslog Socket
  systemd-journald-audit.socket                                                 loaded active running Journal Audit Socket
  systemd-journald-dev-log.socket                                               loaded active running Journal Socket (/dev/log)
  systemd-journald.socket                                                       loaded active running Journal Socket
  systemd-networkd.socket                                                       loaded active running Network Service Netlink Socket
  systemd-udevd-control.socket                                                  loaded active running udev Control Socket
  systemd-udevd-kernel.socket                                                   loaded active running udev Kernel Socket

=== systemd unit files matching app patterns ===

=== docker ps -a ===
smarter-poker-workers	Up 36 hours (healthy)	ghcr.io/smarter-poker/smarter-poker-workers:latest	

=== docker images ===
ghcr.io/smarter-poker/smarter-poker-workers:latest	386MB	37 hours ago

=== listening TCP ports ===
State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess                                    
LISTEN 0      511          0.0.0.0:8081      0.0.0.0:*    users:(("node",pid=658146,fd=18))         
LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=506396,fd=3))          
LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*    users:(("systemd-resolve",pid=4587,fd=14))
LISTEN 0      128             [::]:22           [::]:*    users:(("sshd",pid=506396,fd=4))          

=== root crontab ===

=== /etc/cron.d ===
total 16
drwxr-xr-x  2 root root 4096 Sep 11  2024 .
drwxr-xr-x 91 root root 4096 May  1 06:16 ..
-rw-r--r--  1 root root  201 Jan  8  2022 e2scrub_all
-rw-r--r--  1 root root  102 Mar 23  2022 .placeholder
30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all_cron
10 3 * * * root test -e /run/systemd/system || SERVICE_MODE=1 /sbin/e2scrub_all -A -r

=== users with home dirs ===

=== /opt and /srv ===
total 16
drwxr-xr-x  4 root    root    4096 Apr 24 16:24 .
drwxr-xr-x 20 root    root    4096 Apr 24 16:22 ..
drwx--x--x  4 root    root    4096 Apr 24 16:24 containerd
drwxr-xr-x  3 workers workers 4096 May  3 08:42 workers

total 8
drwxr-xr-x  2 root root 4096 Sep 11  2024 .
drwxr-xr-x 20 root root 4096 Apr 24 16:22 ..

=== disk usage ===
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           382M 1008K  381M   1% /run
/dev/sda1        38G  4.1G   32G  12% /
tmpfs           1.9G     0  1.9G   0% /dev/shm
tmpfs           5.0M     0  5.0M   0% /run/lock
/dev/sda15      253M  142K  252M   1% /boot/efi
overlay          38G  4.1G   32G  12% /var/lib/docker/rootfs/overlayfs/2a88a5fca7e7b005c815fe9f879dbc1bf5bb7d99a96ca876d350e333718601f9
tmpfs           382M  4.0K  382M   1% /run/user/0

=== top 5 RAM ===
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
10001     658146  0.1  3.7 11263428 144984 ?     Ssl  May03   3:28 node dist/index.mjs
root        4589  0.0  2.9 166684 113448 ?       S<s  Apr24   3:06 /lib/systemd/systemd-journald
root       10301  0.0  2.5 2236344 100776 ?      Ssl  Apr24   5:00 /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
root       10147  0.1  1.6 1944816 62532 ?       Ssl  Apr24  18:24 /usr/bin/containerd
root         438  0.0  0.6 289352 27100 ?        SLsl Apr24   1:19 /sbin/multipathd -d -s

=== top 5 CPU ===
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root      757010  1.5  0.2  17096  9396 ?        Ss   20:49   0:00 /lib/systemd/systemd --user
root      757076  0.6  0.2  17224 10908 ?        Ss   20:49   0:00 sshd: root@notty
root       10147  0.1  1.6 1944816 62532 ?       Ssl  Apr24  18:24 /usr/bin/containerd
10001     658146  0.1  3.7 11263428 144984 ?     Ssl  May03   3:28 node dist/index.mjs
root           1  0.0  0.3 167608 13020 ?        Ss   Apr24   0:43 /lib/systemd/systemd --system --deserialize 40

=== journalctl tails ===
--- openclaw ---
-- No entries --
--- sp-transcode ---
-- No entries --
--- sp-yt-transcode ---
-- No entries --
--- caddy ---
-- No entries --
--- docker ---
May 03 08:42:38 workers-dispatcher dockerd[10301]: time="2026-05-03T08:42:38.141548937Z" level=info msg="received task-delete event from containerd" container=5ffa68d39ab452bdadaeb025259b3586047502da8f77667c5baee8a018f3ad39 module=libcontainerd namespace=moby topic=/tasks/delete type="*events.TaskDelete"
May 03 08:42:38 workers-dispatcher dockerd[10301]: time="2026-05-03T08:42:38.319810702Z" level=warning msg="Security options with `:` as a separator are deprecated and will be completely unsupported in 17.04, use `=` instead."
May 03 08:42:38 workers-dispatcher dockerd[10301]: time="2026-05-03T08:42:38.391773698Z" level=warning msg="Security options with `:` as a separator are deprecated and will be completely unsupported in 17.04, use `=` instead."
May 03 08:42:38 workers-dispatcher dockerd[10301]: time="2026-05-03T08:42:38.464608713Z" level=info msg="sbJoin: gwep4 ''->'', gwep6 ''->''" eid=c5063b8a9cc5 ep=smarter-poker-workers net=host nid=d79ee6c060c1 spanID=2d7ba78c84728179 traceID=bdb170ae019ac7b86f2d04833b7b9efd
May 03 21:33:16 workers-dispatcher dockerd[10301]: time="2026-05-03T21:33:16.515064356Z" level=error msg="Error running exec b87d37e4f9c9d9d556e974a751e1d7ac0302fb4bff131e72715074e441acc92e in container: exec attach failed: error attaching stdout stream: write unix /run/docker.sock->@: write: broken pipe"
```

### server-128782737-reels-transcode-worker.txt
```
=== Inspecting reels-transcode-worker (128782737) - cpx21 in ash at 5.161.49.206 ===
=== hostname / uname / uptime ===
reels-transcode-worker
Linux reels-transcode-worker 6.8.0-90-generic #91-Ubuntu SMP PREEMPT_DYNAMIC Tue Nov 18 14:14:30 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
 20:49:24 up 3 days,  2:57,  1 user,  load average: 0.00, 0.00, 0.00

=== /etc/os-release ===
PRETTY_NAME="Ubuntu 24.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.3 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=noble
LOGO=ubuntu-logo

=== last 5 logins ===
reboot   system boot  6.8.0-90-generic Fri May  1 17:52   still running

wtmp begins Thu Jan  8 10:27:31 2026

=== systemd units running ===
  proc-sys-fs-binfmt_misc.automount loaded active running Arbitrary Executable File Formats File System Automount Point
  init.scope                        loaded active running System and Service Manager
  session-793.scope                 loaded active running Session 793 of User root
  atd.service                       loaded active running Deferred execution scheduler
  cron.service                      loaded active running Regular background program processing daemon
  dbus.service                      loaded active running D-Bus System Message Bus
  getty@tty1.service                loaded active running Getty on tty1
  multipathd.service                loaded active running Device-Mapper Multipath Device Controller
  polkit.service                    loaded active running Authorization Manager
  qemu-guest-agent.service          loaded active running QEMU Guest Agent
  rsyslog.service                   loaded active running System Logging Service
  serial-getty@ttyS0.service        loaded active running Serial Getty on ttyS0
  sp-yt-transcode.service           loaded active running Smarter Poker YouTube Transcode Worker
  ssh.service                       loaded active running OpenBSD Secure Shell server
  systemd-journald.service          loaded active running Journal Service
  systemd-logind.service            loaded active running User Login Management
  systemd-networkd.service          loaded active running Network Configuration
  systemd-resolved.service          loaded active running Network Name Resolution
  systemd-timesyncd.service         loaded active running Network Time Synchronization
  systemd-udevd.service             loaded active running Rule-based Manager for Device Events and Files
  unattended-upgrades.service       loaded active running Unattended Upgrades Shutdown
  user@0.service                    loaded active running User Manager for UID 0
  dbus.socket                       loaded active running D-Bus System Message Bus Socket
  multipathd.socket                 loaded active running multipathd control socket
  ssh.socket                        loaded active running OpenBSD Secure Shell server socket
  syslog.socket                     loaded active running Syslog Socket
  systemd-journald-dev-log.socket   loaded active running Journal Socket (/dev/log)
  systemd-journald.socket           loaded active running Journal Socket
  systemd-networkd.socket           loaded active running Network Service Netlink Socket
  systemd-udevd-control.socket      loaded active running udev Control Socket
  systemd-udevd-kernel.socket       loaded active running udev Kernel Socket

=== systemd unit files matching app patterns ===
sp-yt-cookie-refresh.service                 static          -
sp-yt-transcode.service                      enabled         enabled
sp-yt-cookie-refresh.timer                   disabled        enabled

=== docker ps -a ===

=== docker images ===

=== listening TCP ports ===
State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess                                                  
LISTEN 0      4096      127.0.0.54:53        0.0.0.0:*    users:(("systemd-resolve",pid=33225,fd=17))             
LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*    users:(("systemd-resolve",pid=33225,fd=15))             
LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=39346,fd=3),("systemd",pid=1,fd=130))
LISTEN 0      4096            [::]:22           [::]:*    users:(("sshd",pid=39346,fd=4),("systemd",pid=1,fd=131))

=== root crontab ===

=== /etc/cron.d ===
total 20
drwxr-xr-x   2 root root 4096 Aug  5  2025 .
drwxr-xr-x 110 root root 4096 May  2 06:57 ..
-rw-r--r--   1 root root  201 Apr  8  2024 e2scrub_all
-rw-r--r--   1 root root  102 Aug  5  2025 .placeholder
-rw-r--r--   1 root root  396 Aug  5  2025 sysstat
30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all_cron
10 3 * * * root test -e /run/systemd/system || SERVICE_MODE=1 /sbin/e2scrub_all -A -r
# The first element of the path is a directory where the debian-sa1
# script is located
PATH=/usr/lib/sysstat:/usr/sbin:/usr/sbin:/usr/bin:/sbin:/bin

# Activity reports every 10 minutes everyday
5-55/10 * * * * root command -v debian-sa1 > /dev/null && debian-sa1 1 1

# Additional run at 23:59 to rotate the statistics file
59 23 * * * root command -v debian-sa1 > /dev/null && debian-sa1 60 2

=== users with home dirs ===
openclaw	/home/openclaw

=== /opt and /srv ===
total 12
drwxr-xr-x  3 root root 4096 May  1 17:54 .
drwxr-xr-x 23 root root 4096 May  1 17:52 ..
drwxr-xr-x  3 root root 4096 May  1 17:54 smarter-poker

total 8
drwxr-xr-x  2 root root 4096 Aug  5  2025 .
drwxr-xr-x 23 root root 4096 May  1 17:52 ..

=== disk usage ===
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           382M  860K  382M   1% /run
/dev/sda1        75G  5.6G   67G   8% /
tmpfs           1.9G     0  1.9G   0% /dev/shm
tmpfs           5.0M     0  5.0M   0% /run/lock
/dev/sda15      253M  146K  252M   1% /boot/efi
tmpfs           382M   16K  382M   1% /run/user/0

=== top 5 RAM ===
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
openclaw  101229  0.0  2.6 11811016 104552 ?     Ssl  May03   0:24 /usr/bin/node index.js
root       33207  0.0  1.2  91764 48880 ?        S<s  May02   0:18 /usr/lib/systemd/systemd-journald
root       33211  0.0  0.6 289120 27008 ?        SLsl May02   0:22 /sbin/multipathd -d -s
root         934  0.0  0.5 109656 23040 ?        Ssl  May01   0:00 /usr/bin/python3 /usr/share/unattended-upgrades/unattended-upgrade-shutdown --wait-for-signal
root           1  0.0  0.3  22812 13824 ?        Ss   May01   0:31 /usr/lib/systemd/systemd --system --deserialize=91

=== top 5 CPU ===
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root      112779  4.9  0.2  20256 11392 ?        Ss   20:49   0:00 /usr/lib/systemd/systemd --user
root      112846  0.9  0.2  15008 10624 ?        Ss   20:49   0:00 sshd: root@notty
root       33245  0.0  0.1  80712  4096 ?        Ssl  May02   2:45 /usr/sbin/qemu-ga
root      112403  0.0  0.0      0     0 ?        I    20:44   0:00 [kworker/2:2-events]
root      111011  0.0  0.0      0     0 ?        I    17:30   0:03 [kworker/2:1-cgroup_destroy]

=== journalctl tails ===
--- openclaw ---
-- No entries --
--- sp-transcode ---
-- No entries --
--- sp-yt-transcode ---
May 04 20:00:38 reels-transcode-worker sp-yt-transcode[101229]: [yt-worker 2026-05-04T20:00:38.496Z]   Thumbnail → https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/reels/thumbs/1c0dee1e-8ab9-4d42-897e-e1dd6da9f4be/1777924838148_a2ac975d-f71f-4dfe-a684-f5ac1e98df52.jpg
May 04 20:00:40 reels-transcode-worker sp-yt-transcode[101229]: [yt-worker 2026-05-04T20:00:40.082Z]   ↳ synced social_posts.media_urls[0] for post 3490aedd-930b-47ed-b57b-44d7c8e509f8
May 04 20:00:40 reels-transcode-worker sp-yt-transcode[101229]: [yt-worker 2026-05-04T20:00:40.336Z]   ↳ broadcast native URL to 1 sibling reel(s)
May 04 20:00:40 reels-transcode-worker sp-yt-transcode[101229]: [yt-worker 2026-05-04T20:00:40.567Z]   ↳ broadcast native URL to 1 sibling post(s)
May 04 20:00:40 reels-transcode-worker sp-yt-transcode[101229]: [yt-worker 2026-05-04T20:00:40.710Z] ✓ Job a2ac975d-f71f-4dfe-a684-f5ac1e98df52 → https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/reels/1c0dee1e-8ab9-4d42-897e-e1dd6da9f4be/1777924838496_a2ac975d-f71f-4dfe-a684-f5ac1e98df52.mp4
--- caddy ---
-- No entries --
--- docker ---
-- No entries --
```

## 4. Aux resources
### ssh_keys
```json
[
  {
    "id": 109835740,
    "name": "deploy-key",
    "public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICbfpGx8YV1Al3VIAY8uIr7aIDX2kfG3R587U9UVip/s smarter.poker@deploy",
    "fingerprint": "7a:30:46:ad:4e:fd:94:06:3f:9f:51:94:ed:3a:b8:e1",
    "labels": {},
    "created": "2026-03-27T15:07:25Z"
  },
  {
    "id": 111265593,
    "name": "openclaw-deploy-key",
    "public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOlgbxQ9o5gRyIK0QHcmv5UlKUK+h5Au64OYEP49YExI openclaw-dispatcher@smarter.poker",
    "fingerprint": "39:a4:23:7a:6b:9b:57:b7:e4:0f:4d:97:b8:6f:90:a9",
    "labels": {},
    "created": "2026-04-23T23:35:35Z"
  },
  {
    "id": 111299606,
    "name": "workers-deploy-key",
    "public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHNALy1KTT9mzVkZl2om/cIECi0ljVb4feNOGuvZty4A workers-deploy@smarter.poker",
    "fingerprint": "21:40:30:5d:10:2d:65:9e:3a:60:c1:68:95:22:85:57",
    "labels": {},
    "created": "2026-04-24T15:26:51Z"
  }
]
{
  "pagination": {
    "last_page": 1,
    "next_page": null,
    "page": 1,
    "per_page": 25,
    "previous_page": null,
    "total_entries": 3
  }
}
```
### networks
```json
{
  "pagination": {
    "last_page": 1,
    "next_page": null,
    "page": 1,
    "per_page": 25,
    "previous_page": null,
    "total_entries": 1
  }
}
[
  {
    "name": "smarter-poker-internal",
    "created": "2026-04-24T16:50:49Z",
    "id": 12159885,
    "ip_range": "10.0.0.0/16",
    "labels": {},
    "load_balancers": [],
    "servers": [
      127861894,
      127930016
    ],
    "protection": {
      "delete": false
    },
    "routes": [],
    "subnets": [
      {
        "gateway": "10.0.0.1",
        "ip_range": "10.0.0.0/24",
        "network_zone": "eu-central",
        "type": "cloud",
        "vswitch_id": null
      }
    ],
    "expose_routes_to_vswitch": false
  }
]
```
### volumes
```json
[]
{
  "pagination": {
    "last_page": 1,
    "next_page": null,
    "page": 1,
    "per_page": 25,
    "previous_page": null,
    "total_entries": 0
  }
}
```
### snapshots
```json
{
  "message": "api route not found",
  "code": "not_found",
  "details": null
}
```
### firewalls
```json
[]
{
  "pagination": {
    "last_page": 1,
    "next_page": null,
    "page": 1,
    "per_page": 25,
    "previous_page": null,
    "total_entries": 0
  }
}
```
### primary_ips
```json
{
  "pagination": {
    "last_page": 1,
    "next_page": null,
    "page": 1,
    "per_page": 25,
    "previous_page": null,
    "total_entries": 8
  }
}
[
  {
    "assignee_id": 125093929,
    "assignee_type": "server",
    "auto_delete": true,
    "blocked": false,
    "created": "2026-03-27T15:08:22Z",
    "datacenter": {
      "description": "Ashburn virtual DC 1",
      "id": 5,
      "location": {
        "city": "Ashburn, VA",
        "country": "US",
        "description": "Ashburn, VA",
        "id": 4,
        "latitude": 39.045821,
        "longitude": -77.487073,
        "name": "ash",
        "network_zone": "us-east"
      },
      "name": "ash-dc1",
      "server_types": {
        "available": [
          25,
          96,
          22,
          23,
          24
        ],
        "available_for_migration": [
          25,
          96,
          22,
          23,
          24
        ],
        "supported": [
          25,
          96,
          98,
```
### load_balancers
```json
[]
{
  "pagination": {
    "page": 1,
    "per_page": 25,
    "previous_page": null,
    "next_page": null,
    "last_page": 1,
    "total_entries": 0
  }
}
```
