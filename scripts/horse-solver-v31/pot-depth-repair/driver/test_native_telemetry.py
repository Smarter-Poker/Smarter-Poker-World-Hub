import unittest,queue,collections,json,tempfile,ast,sys
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parent))
from native_telemetry import instrument,TailQueue,capture_failure,aggregate_exit
from context_deadline import Deadline
class Failure(Exception):pass
class Tests(unittest.TestCase):
 def test_fake_clock_deadline_never_extends(self):
  t=[0.];d=Deadline(lambda:t[0]);d.begin();self.assertEqual(d.timeout(7200),600);t[0]=590;self.assertEqual(d.timeout(7200),10);t[0]=600
  with self.assertRaises(TimeoutError):d.timeout(7200)
 def test_queue_transparency_preserves_multiline_framing(self):
  q=queue.Queue();tail=collections.deque(maxlen=32);wrapped=TailQueue(q,tail);lines=['SOLVER:','progress','END','wait_for_solver ok!','END']
  for line in lines:wrapped.put(line)
  self.assertEqual([wrapped.get() for _ in lines],lines);self.assertEqual(list(tail),lines)
  with self.assertRaises(queue.Empty):wrapped.get(timeout=.001)
 def test_actual_pinned_upi_reader_ignores_progress_END(self):
  from upi_reader_reference import Reader
  r=Reader();q=queue.Queue();tail=collections.deque(maxlen=32);r._lines=TailQueue(q,tail)
  for line in ['SOLVER:','progress','END','SOLVER: singleline','wait_for_solver ok!','END']:q.put(line)
  self.assertEqual(r._read_until_end(1,'wait_for_solver'),'wait_for_solver ok!');self.assertEqual(len(tail),6)
 def test_typed_timeout_bounded_tail(self):
  class Base:
   def __init__(self):self._lines=queue.Queue()
   def command(self,cmd,timeout):
    for i in range(100):self._lines.put('SOLVER: '+str(i)+'x'*1000);self._lines.get()
    raise Failure('timeout waiting for PioSOLVER END after wait_for_solver')
  t=[0.];Observed,Timeout=instrument(Base,Failure,lambda:t[0]);p=Observed()
  with self.assertRaises(Timeout) as ctx:p.command('wait_for_solver',42)
  self.assertEqual(ctx.exception.context['command'],'wait_for_solver');self.assertEqual(ctx.exception.context['timeout_seconds'],42);self.assertEqual(len(ctx.exception.context['tail']),32);self.assertTrue(all(len(x)<=256 for x in ctx.exception.context['tail']));self.assertIsInstance(ctx.exception.__cause__,Failure)
 def test_success_no_semantic_change(self):
  class Base:
   def __init__(self):self._lines=queue.Queue()
   def command(self,c,t):return 'exact response'
  Observed,_=instrument(Base,Failure);self.assertEqual(Observed().command('is_ready',3),'exact response')
 def test_metrics_before_restart(self):
  calls=[];proc=SimpleNamespace(command_context={'command':'wait_for_solver'});b=SimpleNamespace(until=600);rec={};ph={}
  capture_failure(rec,ph,proc,['go','wait_for_solver'],b,clock=lambda:599,metrics=lambda p:(calls.append(p) or {'pid':123,'working_set_bytes':987}))
  proc=SimpleNamespace(command_context=None);self.assertEqual(calls[0].command_context['command'],'wait_for_solver');self.assertEqual(rec['failure_diagnostics']['process_before_close']['working_set_bytes'],987);self.assertEqual(ph['go_count'],1)
 def test_aggregate_exit_preserves_failed_even_already_finished(self):
  with tempfile.TemporaryDirectory() as td:
   out=Path(td);jobs=[{'id':str(i)} for i in range(6)]
   for j in jobs:(out/(j['id']+'.json')).write_text(json.dumps(dict(id=j['id'],status='ok',storage_summary={'complete':True})))
   self.assertEqual(aggregate_exit(jobs,out),0);(out/'5.json').write_text(json.dumps(dict(id='5',status='failed',storage_summary={'complete':False})));self.assertEqual(aggregate_exit(jobs,out),1);self.assertEqual(aggregate_exit(jobs,out),1)
 def test_wrapper_propagates_actual_native_exit(self):
  p=Path(__file__).parent/'f4_m1.py';tree=ast.parse(p.read_text());fn=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='cmd_run');text=ast.unparse(fn);self.assertIn('rc = p.wait()',text);self.assertIn("tmp.write_text('EXIT=%d\\n' % rc)",text);self.assertIn("return ({'exit_rc': rc}, rc)",text)
 def test_driver_catches_capture_before_close_and_aggregate(self):
  tree=ast.parse((Path(__file__).parent/'f4_lock_driver.py').read_text());handlers=[n for n in ast.walk(tree) if isinstance(n,ast.ExceptHandler) and any(isinstance(x,ast.Expr) and isinstance(x.value,ast.Call) and isinstance(x.value.func,ast.Name) and x.value.func.id=='capture_failure' for x in n.body)];self.assertEqual(len(handlers),3)
  for h in handlers:self.assertLess(next(i for i,n in enumerate(h.body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='capture_failure'),next(i for i,n in enumerate(h.body) if isinstance(n,ast.Try)))
if __name__=='__main__':unittest.main()
