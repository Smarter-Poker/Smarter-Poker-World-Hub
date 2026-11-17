"""Synchronous per-session UPI deadline; no timer, thread, watcher or retry."""
import math
import time

SESSION_SECONDS=600.
RESERVED_JOB_SECONDS=900.
RESERVED_COHORT_SECONDS=600.
class Deadline:
    def __init__(self,clock=time.monotonic):self.clock=clock;self.until=None
    def begin(self):self.until=self.clock()+SESSION_SECONDS
    def end(self):self.until=None
    def timeout(self,requested):
        if not math.isfinite(requested)or requested<=0:raise ValueError('invalid command timeout')
        remaining=30. if self.until is None else self.until-self.clock()
        if remaining<=0:raise TimeoutError('supplemental session UPI deadline exhausted')
        return min(requested,remaining)

def reserve_hours(jobs):return (RESERVED_COHORT_SECONDS+jobs*RESERVED_JOB_SECONDS)/3600.
