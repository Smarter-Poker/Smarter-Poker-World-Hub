"""Bounded synchronous observation; preserves upstream UPI framing and deadlines."""
import collections,hashlib,inspect,json,subprocess,time
from pathlib import Path
EXPECTED_UPI_SHA='f97d90c2cd075a7f052bbc31ac39d17aa25029b242cda6e9b62a4632d4acc671'
TAIL_LINES=32;LINE_CHARS=256
class TailQueue:
 def __init__(self,queue,tail):self.queue=queue;self.tail=tail
 def get(self,*args,**kwargs):
  value=self.queue.get(*args,**kwargs)
  if isinstance(value,str):self.tail.append(value[:LINE_CHARS])
  return value
 def put(self,*args,**kwargs):return self.queue.put(*args,**kwargs)
 def __getattr__(self,name):return getattr(self.queue,name)
def instrument(base,error_type,clock=time.monotonic):
 class CommandTimeout(error_type):
  def __init__(self,message,context):super().__init__(message);self.context=context
 class Observed(base):
  def __init__(self,*args,**kwargs):
   self.command_context=None;self.progress_tail=collections.deque(maxlen=TAIL_LINES);super().__init__(*args,**kwargs);self._lines=TailQueue(self._lines,self.progress_tail)
  def command(self,command,timeout_seconds=None):
   started=clock();verb=str(command).split(' ',1)[0];self.progress_tail.clear();self.command_context=dict(command=verb,timeout_seconds=timeout_seconds,started_monotonic=started)
   try:return super().command(command,timeout_seconds)
   except error_type as exc:
    self.command_context.update(elapsed_seconds=clock()-started,tail=list(self.progress_tail),error_type=type(exc).__name__,error=str(exc))
    if 'timeout' in str(exc).lower():raise CommandTimeout(str(exc),dict(self.command_context)) from exc
    raise
 return Observed,CommandTimeout

def pinned_upi(module):
 path=Path(inspect.getsourcefile(module)).resolve();actual=hashlib.sha256(path.read_bytes()).hexdigest()
 if actual!=EXPECTED_UPI_SHA:raise ValueError('imported UPI source drift')
 return dict(path=str(path),sha256=actual)
def process_metrics(proc,run=subprocess.run):
 """Capture BEFORE close/restart. No broad process arguments or credentials."""
 pid=int(proc._process.pid);alive=proc._process.poll() is None
 script="$p=Get-Process -Id %d -ErrorAction Stop;@{pid=$p.Id;cpu_seconds=$p.TotalProcessorTime.TotalSeconds;working_set_bytes=$p.WorkingSet64;peak_working_set_bytes=$p.PeakWorkingSet64}|ConvertTo-Json -Compress"%pid
 try:
  r=run(['powershell','-NoProfile','-NonInteractive','-Command',script],capture_output=True,text=True,timeout=5);assert r.returncode==0;v=json.loads(r.stdout);assert v['pid']==pid;v['alive']=alive;return v
 except Exception as e:return dict(pid=pid,alive=alive,metrics_available=False,error=type(e).__name__)
def capture_failure(rec,ph,proc,sent,budget,clock=time.monotonic,metrics=process_metrics):
 context=getattr(proc,'command_context',None)
 rec['failure_diagnostics']=dict(command_context=context,session_remaining_seconds=None if budget.until is None else budget.until-clock(),process_before_close=metrics(proc))
 ph['commands']=list(sent);ph['go_count']=sent.count('go')
def aggregate_exit(jobs,out):
 """Only expected own outputs; completed failed sessions never become success."""
 for j in jobs:
  try:r=json.loads((Path(out)/(j['id']+'.json')).read_bytes())
  except (OSError,ValueError):return 1
  if not isinstance(r,dict):return 1
  summary=r.get('storage_summary')
  if r.get('id')!=j['id'] or r.get('status')!='ok' or not isinstance(summary,dict) or summary.get('complete') is not True:return 1
 return 0
