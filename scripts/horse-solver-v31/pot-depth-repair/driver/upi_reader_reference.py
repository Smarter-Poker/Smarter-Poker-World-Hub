"""Unmodified method extracted from pinned f97d90c2 UPI; testfixture only."""
import math,queue,time
class PioError(Exception):pass
class Reader:
    def _read_until_end(self, timeout_seconds: float, verb: str) -> str:
            if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
                raise PioError("UPI timeout must be a finite positive number")
            deadline = time.monotonic() + timeout_seconds
            output: list[str] = []
            in_solver_update = False
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PioError(f"timeout waiting for PioSOLVER END after {verb}")
                try:
                    line = self._lines.get(timeout=remaining)
                except queue.Empty as error:
                    raise PioError(f"timeout waiting for PioSOLVER END after {verb}") from error
                if isinstance(line, BaseException):
                    raise PioError("PioSOLVER output could not be decoded as UTF-8") from line
                if line is None:
                    raise PioError(f"PioSOLVER exited before END after {verb}")
                # Solver progress is an asynchronous protocol message.  A
                # multiline update owns its own END; consuming that END as this
                # command's terminator desynchronizes every later response.
                if in_solver_update:
                    if line == "END":
                        in_solver_update = False
                    continue
                if line == "SOLVER:":
                    in_solver_update = True
                    continue
                if line.startswith("SOLVER: "):
                    continue
                if line == "END":
                    return "\n".join(output)
                output.append(line)
