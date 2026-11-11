#!/bin/bash
# usage: measure.sh <label> <cmd...>   samples total RSS of process tree each 0.5s
label=$1; shift
out=/tmp/claude-0/-home-user/450b2a32-f0b8-541f-a74c-a6be94610024/scratchpad/$label
"$@" > $out.log 2>&1 &
pid=$!
maxt=0; maxm=0
tree() { local p=$1; echo $p; for c in $(cat /proc/$p/task/*/children 2>/dev/null); do tree $c; done; }
while kill -0 $pid 2>/dev/null; do
  t=0; m=0
  for p in $(tree $pid); do r=$(awk '/VmRSS/{print $2}' /proc/$p/status 2>/dev/null); r=${r:-0}; t=$((t+r)); [ $r -gt $m ] && m=$r; done
  [ $t -gt $maxt ] && { maxt=$t; echo "$(date +%T) tree=$((t/1024))MB maxproc=$((m/1024))MB" >> $out.peak; }
  [ $m -gt $maxm ] && maxm=$m
  sleep 0.5
done
wait $pid; ec=$?
echo "EXIT $ec peak_tree=$((maxt/1024))MB peak_single=$((maxm/1024))MB" >> $out.peak
