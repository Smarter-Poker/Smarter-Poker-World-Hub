"""Exact Pio UPI transport, node-line reconstruction, and V31 harvesting."""

from __future__ import annotations

import math
import queue
import re
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from contract import (
    COMBO_ORDER,
    ApprovedManifest,
    ContractError,
    load_range_vector,
    parse_source_combo_order,
)


CARD = re.compile(r"^[2-9TJQKA][cdhs]$")
BET = re.compile(r"^b([1-9][0-9]*)$")
STREETS = ("flop", "turn", "river")
OPEN_ROLES = {"open", "cbet", "probe", "delayed_cbet", "barrel"}


class PioError(RuntimeError):
    """The solver process or its output violated the certified contract."""


@dataclass(frozen=True)
class NodeLine:
    street: str
    actor: int
    node_role: str
    facing_kind: str
    facing_size_bucket: str
    facing_target_chips: int | None
    facing_actor_total_chips: int | None
    pot_chips: float
    contributions: tuple[int, int]
    total_spent: tuple[int, int]
    current_target: int
    wager_active: bool
    previous_street_aggressor: int | None
    previous_street_checked_through: bool
    older_street_aggressor: int | None


PIO_ACK_COMMANDS = frozenset(
    {
        "add_line",
        "build_tree",
        "clear_lines",
        "go",
        "is_ready",
        "reset_icm_tables",
        "set_accuracy",
        "set_board",
        "set_eff_stack",
        "set_end_string",
        "set_icm",
        "set_icm_point",
        "set_isomorphism",
        "set_pot",
        "set_rake",
        "set_range",
        "wait_for_solver",
    }
)
VECTOR_COMMANDS = frozenset({"show_strategy", "show_range", "calc_ev"})


class PioProcess:
    """One serialized, attested UPI process with canonical combo vectors.

    The licensed executable owns the wire order.  The Phase 4 artifact owns a
    different explicit order.  Startup proves the exact executable-reported
    version and hand order before any range is sent, and every vector crossing
    the boundary is translated rather than assumed.
    """

    def __init__(
        self,
        executable: str | Path,
        *,
        expected_solver_version: str,
        expected_hand_order: tuple[str, ...],
        startup_timeout_seconds: float = 30.0,
    ):
        if not str(expected_solver_version).strip():
            raise PioError("approved PioSOLVER version is empty")
        if len(expected_hand_order) != 1326:
            raise PioError("approved PioSOLVER hand order is incomplete")
        self._expected_solver_version = str(expected_solver_version).strip()
        self._expected_hand_order = tuple(expected_hand_order)
        self._pio_to_canonical: tuple[int, ...] = ()
        self._process = subprocess.Popen(
            [str(executable)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="strict",
            bufsize=1,
        )
        if self._process.stdin is None or self._process.stdout is None:
            self.close()
            raise PioError("PioSOLVER did not expose a UPI pipe")
        self._lines: queue.Queue[str | BaseException | None] = queue.Queue()
        self._lock = threading.Lock()
        self._reader = threading.Thread(target=self._read_lines, daemon=True)
        self._reader.start()
        try:
            self._initialize(startup_timeout_seconds)
        except BaseException:
            self.close()
            raise

    def _read_lines(self) -> None:
        try:
            assert self._process.stdout is not None
            for line in self._process.stdout:
                self._lines.put(line.rstrip("\r\n"))
        except BaseException as error:
            self._lines.put(error)
        finally:
            self._lines.put(None)

    def _write(self, command: str) -> None:
        if self._process.poll() is not None:
            raise PioError(f"PioSOLVER exited with code {self._process.returncode}")
        assert self._process.stdin is not None
        try:
            self._process.stdin.write(command + "\n")
            self._process.stdin.flush()
        except (BrokenPipeError, OSError) as error:
            raise PioError("PioSOLVER stdin transport failed") from error

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

    @staticmethod
    def _clean_response(command: str, response: str, *, require_ack: bool = True) -> str:
        lines = [line.strip() for line in response.splitlines() if line.strip()]
        if any(line.upper().startswith(("ERROR", "ERR ")) for line in lines):
            raise PioError(f"PioSOLVER rejected {command.split()[0]}: {' | '.join(lines)[:500]}")
        verb = command.split()[0]
        if require_ack and verb in PIO_ACK_COMMANDS:
            expected = f"{verb} ok!"
            if len(lines) != 1 or lines[0].lower() != expected.lower():
                raise PioError(f"PioSOLVER returned an invalid acknowledgement for {verb}")
        return "\n".join(lines)

    @staticmethod
    def _hand_order_mapping(response: str) -> tuple[tuple[str, ...], tuple[int, ...]]:
        try:
            tokens = parse_source_combo_order(response)
        except ContractError as error:
            raise PioError(str(error)) from error
        ranks = "23456789TJQKA"
        suits = "cdhs"
        mapping: list[int] = []
        for token in tokens:
            first = ranks.index(token[0]) * 4 + suits.index(token[1])
            second = ranks.index(token[2]) * 4 + suits.index(token[3])
            low, high = sorted((first, second))
            mapping.append(high * (high - 1) // 2 + low)
        return tokens, tuple(mapping)

    def _initialize(self, timeout_seconds: float) -> None:
        # UPI 2+ emits no response terminator until this exact first command.
        self._write("set_end_string END")
        response = self._read_until_end(timeout_seconds, "set_end_string")
        lines = [line.strip() for line in response.splitlines() if line.strip()]
        activation = ["ERROR code 0:", "OK!", "Activation ok!"]
        marker_positions = [index for index, line in enumerate(lines) if line == activation[0]]
        if marker_positions:
            marker = marker_positions[0]
            if len(marker_positions) != 1 or lines[marker : marker + 3] != activation:
                raise PioError("PioSOLVER returned an invalid activation banner")
            del lines[marker : marker + 3]
        self._clean_response(
            "set_end_string END", "\n".join(lines), require_ack=False
        )
        if not lines or lines[-1].lower() != "set_end_string ok!":
            raise PioError("PioSOLVER END framing was not acknowledged")

        self._write("show_version")
        version = self._clean_response(
            "show_version",
            self._read_until_end(timeout_seconds, "show_version"),
            require_ack=False,
        )
        if version != self._expected_solver_version:
            raise PioError("PioSOLVER show_version does not match the approved manifest")

        self._write("show_hand_order")
        hand_order = self._clean_response(
            "show_hand_order",
            self._read_until_end(timeout_seconds, "show_hand_order"),
            require_ack=False,
        )
        tokens, mapping = self._hand_order_mapping(hand_order)
        if tokens != self._expected_hand_order:
            raise PioError("PioSOLVER show_hand_order does not match the approved input file")
        self._pio_to_canonical = mapping

        self._write("is_ready")
        ready = self._read_until_end(timeout_seconds, "is_ready")
        self._clean_response("is_ready", ready)

    def _outbound(self, command: str) -> str:
        if not command.startswith("set_range "):
            return command
        parts = command.split()
        if (
            len(parts) != 1328
            or parts[1] not in ("OOP", "IP")
            or len(self._pio_to_canonical) != 1326
        ):
            raise PioError("set_range must carry one player and 1,326 canonical weights")
        canonical = parts[2:]
        return " ".join(
            parts[:2] + [canonical[index] for index in self._pio_to_canonical]
        )

    def _canonicalize_vectors(self, command: str, response: str) -> str:
        verb = command.split()[0]
        if verb not in VECTOR_COMMANDS:
            return response
        if len(self._pio_to_canonical) != 1326:
            raise PioError("PioSOLVER hand order is not attested")
        output: list[str] = []
        vectors = 0
        for line in response.splitlines():
            parts = line.split()
            if len(parts) >= 1000:
                if len(parts) != 1326:
                    raise PioError(f"{verb} returned a non-1,326 solver vector")
                try:
                    [float(value) for value in parts]
                except ValueError as error:
                    raise PioError(f"{verb} returned a nonnumeric solver vector") from error
                canonical: list[str | None] = [None] * 1326
                for pio_index, canonical_index in enumerate(self._pio_to_canonical):
                    canonical[canonical_index] = parts[pio_index]
                if any(value is None for value in canonical):
                    raise PioError("PioSOLVER hand-order remap is incomplete")
                output.append(" ".join(value for value in canonical if value is not None))
                vectors += 1
            else:
                output.append(line)
        expected = 1 if verb == "show_range" else 2 if verb == "calc_ev" else None
        if vectors == 0 or (expected is not None and vectors != expected):
            raise PioError(f"{verb} returned the wrong number of solver vectors")
        return "\n".join(output)

    def command(self, command: str, timeout_seconds: float | None = None) -> str:
        text = str(command).strip()
        if not text or "\n" in text or "\r" in text or len(text) > 200_000:
            raise PioError("refusing an invalid UPI command")
        verb = text.split(" ", 1)[0]
        slow = verb in {"go", "wait_for_solver", "build_tree"}
        timeout = timeout_seconds if timeout_seconds is not None else (7200.0 if slow else 300.0)
        with self._lock:
            self._write(self._outbound(text))
            response = self._read_until_end(timeout, verb)
            cleaned = self._clean_response(text, response)
            return self._canonicalize_vectors(text, cleaned)

    def close(self) -> None:
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=10)
        if self._process.stdin is not None and not self._process.stdin.closed:
            self._process.stdin.close()
        if self._process.stdout is not None and not self._process.stdout.closed:
            self._process.stdout.close()
        reader = getattr(self, "_reader", None)
        if reader is not None and reader.is_alive():
            reader.join(timeout=1)

    def __enter__(self) -> "PioProcess":
        return self

    def __exit__(self, _kind: Any, _value: Any, _traceback: Any) -> None:
        self.close()


def _numeric_vectors(raw: str) -> list[list[float]]:
    vectors: list[list[float]] = []
    for line in raw.splitlines():
        tokens = line.replace(",", " ").split()
        if len(tokens) < 1000:
            continue
        if len(tokens) != 1326:
            raise PioError("PioSOLVER returned a non-1,326 numeric vector")
        try:
            vectors.append([float(value) for value in tokens])
        except ValueError as error:
            raise PioError("PioSOLVER returned a nonnumeric vector") from error
    return vectors


def parse_vector(raw: str, *, allow_nan: bool, label: str) -> list[float]:
    vectors = _numeric_vectors(raw)
    if len(vectors) != 1:
        raise PioError(f"{label} did not contain exactly one 1,326-combo vector")
    values = vectors[0]
    for value in values:
        if math.isinf(value) or (math.isnan(value) and not allow_nan):
            raise PioError(f"{label} contains a nonfinite value")
    return values


def parse_strategy(raw: str, action_codes: list[str]) -> dict[str, list[float]]:
    vectors = _numeric_vectors(raw)
    if len(vectors) != len(action_codes):
        raise PioError(
            f"show_strategy returned {len(vectors)} vectors for {len(action_codes)} actions"
        )
    if any(any(not math.isfinite(value) for value in vector) for vector in vectors):
        raise PioError("show_strategy contains a nonfinite value")
    return dict(zip(action_codes, vectors))


def parse_calc_ev(raw: str, *, label: str) -> tuple[list[float], list[float]]:
    """Return Pio's exact (per-combo EV, matchup-mass) pair."""

    vectors = _numeric_vectors(raw)
    if len(vectors) != 2:
        raise PioError(f"{label} did not contain exact EV and matchup vectors")
    evs, matchups = vectors
    if any(math.isinf(value) for value in evs):
        raise PioError(f"{label} EV vector contains infinity")
    if any(not math.isfinite(value) or value < 0 for value in matchups):
        raise PioError(f"{label} matchup vector contains an invalid value")
    return evs, matchups


def parse_children(raw: str, parent: str) -> list[str]:
    prefix = parent + ":"
    depth = parent.count(":") + 1
    result: list[str] = []
    for token in raw.replace("\r", " ").replace("\n", " ").split():
        cleaned = token.strip(" ,;[]()\"")
        if cleaned.startswith(prefix) and cleaned.count(":") == depth:
            action = cleaned[len(prefix) :]
            if action in {"c", "f"} or BET.fullmatch(action):
                result.append(action)
    if len(result) < 2 or len(result) != len(set(result)):
        raise PioError("show_children did not return at least two unique direct actions")
    return result


def parse_calc_results(raw: str) -> dict[str, float]:
    """Parse Pio's named root summary without guessing a trailing number."""

    expected = {
        "running time": "running_time_seconds",
        "ev oop": "ev_oop_chips",
        "ev ip": "ev_ip_chips",
        "oop's mes": "oop_mes_chips",
        "ip's mes": "ip_mes_chips",
        "exploitable for": "exploitability_chips",
    }
    parsed: dict[str, float] = {}
    for line in raw.splitlines():
        if not line.strip() or ":" not in line:
            raise PioError("calc_results returned a malformed named field")
        name, value_text = (part.strip() for part in line.split(":", 1))
        output_name = expected.get(name.lower())
        if output_name is None or output_name in parsed or len(value_text.split()) != 1:
            raise PioError("calc_results returned an unknown or duplicate named field")
        try:
            value = float(value_text)
        except ValueError as error:
            raise PioError("calc_results returned a nonnumeric field") from error
        if not math.isfinite(value):
            raise PioError("calc_results returned a nonfinite field")
        parsed[output_name] = value
    if set(parsed) != set(expected.values()):
        raise PioError("calc_results omitted a required named field")
    if parsed["running_time_seconds"] < 0 or parsed["exploitability_chips"] < 0:
        raise PioError("calc_results returned an impossible negative metric")
    return parsed


def _bucket(fraction: float | None, all_in: bool = False) -> str:
    if all_in:
        return "all_in"
    if fraction is None or not math.isfinite(fraction) or fraction <= 0:
        return "none"
    if fraction < 0.6:
        return "small"
    if fraction < 1.1:
        return "mid"
    return "big"


def analyze_node(
    node: str,
    *,
    root_pot_chips: int,
    effective_stack_chips: int,
    preflop_aggressor: int | None,
) -> NodeLine:
    tokens = node.split(":")
    if len(tokens) < 2 or tokens[:2] != ["r", "0"]:
        raise PioError("node must begin at r:0")
    if preflop_aggressor not in (None, 0, 1):
        raise PioError("preflop aggressor must be solver player 0, 1, or null")
    actor = 0
    street_index = 0
    pot = float(root_pot_chips)
    contributions = [0, 0]
    total_spent = [0, 0]
    current_target = 0
    wager = False
    closed = False
    closed_by_checks = False
    current_actions: list[dict[str, Any]] = []
    completed: list[tuple[int | None, bool]] = []
    last_aggressive: dict[str, Any] | None = None

    for token in tokens[2:]:
        if CARD.fullmatch(token):
            if not closed or street_index >= 2:
                raise PioError("node changes street before the prior street closes")
            completed.append(
                (
                    last_aggressive["actor"] if last_aggressive is not None else None,
                    closed_by_checks,
                )
            )
            street_index += 1
            actor = 0
            contributions = [0, 0]
            current_target = 0
            wager = False
            closed = False
            closed_by_checks = False
            current_actions = []
            last_aggressive = None
            continue
        if closed:
            raise PioError("node contains an action after a street closed")
        if token == "f":
            raise PioError("a fold is terminal and cannot be a decision-node ancestor")
        if token == "c":
            if wager:
                delta = current_target - contributions[actor]
                remaining = effective_stack_chips - total_spent[actor]
                if delta < 0 or delta > remaining:
                    raise PioError("node call exceeds the effective stack")
                contributions[actor] += delta
                total_spent[actor] += delta
                pot += delta
                action_kind = "call"
                closed = True
                closed_by_checks = False
                wager = False
            else:
                action_kind = "check"
                closed = bool(current_actions and current_actions[-1]["kind"] == "check")
                closed_by_checks = closed
            current_actions.append({"actor": actor, "kind": action_kind})
            actor = 1 - actor
            continue
        match = BET.fullmatch(token)
        if not match:
            raise PioError(f"node contains an unsupported token: {token}")
        target = int(match.group(1))
        prior_target = current_target
        if target <= contributions[actor] or (wager and target <= current_target):
            raise PioError("node wager target does not advance legal action")
        remaining = effective_stack_chips - total_spent[actor]
        actor_total_target = contributions[actor] + remaining
        if target > actor_total_target:
            raise PioError("node wager exceeds the effective stack")
        kind = "raise" if wager else "bet"
        pot_before = pot
        delta = target - contributions[actor]
        contributions[actor] = target
        total_spent[actor] += delta
        pot += delta
        last_aggressive = {
            "actor": actor,
            "kind": kind,
            "target": target,
            "prior_target": prior_target,
            "actor_total_target": actor_total_target,
            "all_in": target == actor_total_target,
            "pot_before": pot_before,
        }
        current_actions.append(dict(last_aggressive))
        current_target = target
        wager = True
        actor = 1 - actor

    if closed:
        raise PioError("node is terminal until a board card advances the street")
    street = STREETS[street_index]
    previous_aggressor: int | None = None
    previous_checked = False
    older_aggressor: int | None = None

    if wager:
        if last_aggressive is None or last_aggressive["actor"] == actor:
            raise PioError("node has no opponent wager to answer")
        if last_aggressive["all_in"]:
            role = "all_in"
            facing_kind = "all_in"
            facing_bucket = "all_in"
        elif last_aggressive["kind"] == "bet":
            role = "facing_bet"
            facing_kind = "bet"
            denominator = pot - last_aggressive["target"]
            if denominator <= 0:
                raise PioError("facing-bet denominator is not positive")
            facing_bucket = _bucket(last_aggressive["target"] / denominator)
        else:
            prior_hero = [
                (index, action)
                for index, action in enumerate(current_actions[:-1])
                if action["actor"] == actor and action["kind"] in {"bet", "raise"}
            ]
            if not prior_hero:
                raise PioError("raise-facing node has no prior hero aggression")
            hero_index, hero_action = prior_hero[0]
            if hero_action["kind"] == "raise":
                role = "facing_raise"
            elif any(
                action["actor"] != actor and action["kind"] == "check"
                for action in current_actions[:hero_index]
            ):
                role = "check_raise"
            else:
                role = "bet_raise"
            facing_kind = "raise"
            to_call = current_target - contributions[actor]
            denominator = pot + to_call
            fraction = (last_aggressive["target"] - last_aggressive["prior_target"]) / denominator
            facing_bucket = _bucket(fraction)
        facing_target = int(last_aggressive["target"])
        facing_actor_total = int(last_aggressive["actor_total_target"])
    else:
        if any(action["actor"] == actor for action in current_actions):
            raise PioError("actor has already acted at an apparent open node")
        if street_index == 0:
            previous_aggressor = preflop_aggressor
            if previous_aggressor == actor:
                role = "cbet"
            elif previous_aggressor is None:
                role = "open"
            else:
                raise PioError("unsupported donk-lead node was not mislabeled as open")
        else:
            previous_aggressor, previous_checked = completed[street_index - 1]
            older_aggressor = preflop_aggressor if street_index == 1 else completed[0][0]
            if previous_aggressor == actor:
                role = "barrel"
            elif previous_aggressor is not None:
                raise PioError("unsupported donk-lead node was not mislabeled as open")
            elif not previous_checked:
                raise PioError("prior street has no proven check-through")
            elif older_aggressor == actor:
                role = "delayed_cbet"
            elif older_aggressor is not None:
                role = "probe"
            else:
                role = "open"
        facing_kind = "none"
        facing_bucket = "none"
        facing_target = None
        facing_actor_total = None

    return NodeLine(
        street=street,
        actor=actor,
        node_role=role,
        facing_kind=facing_kind,
        facing_size_bucket=facing_bucket,
        facing_target_chips=facing_target,
        facing_actor_total_chips=facing_actor_total,
        pot_chips=pot,
        contributions=(contributions[0], contributions[1]),
        total_spent=(total_spent[0], total_spent[1]),
        current_target=current_target,
        wager_active=wager,
        previous_street_aggressor=previous_aggressor,
        previous_street_checked_through=previous_checked,
        older_street_aggressor=older_aggressor,
    )


def texture_class(board: str) -> str:
    ranks = {rank: index + 2 for index, rank in enumerate("23456789TJQKA")}
    cards = [board[index : index + 2] for index in range(0, len(board), 2)]
    if len(cards) not in (3, 4, 5) or len(set(cards)) != len(cards):
        raise PioError("texture board is invalid")
    values = [ranks.get(card[0], 0) for card in cards]
    suits = [card[1] for card in cards]
    if any(value == 0 or card[1] not in "cdhs" for value, card in zip(values, cards)):
        raise PioError("texture board is invalid")
    high_value = max(values)
    high = "A" if high_value == 14 else "B" if high_value >= 12 else "M" if high_value >= 9 else "L"
    if len(cards) == 3:
        suit_kind = "m" if len(set(suits)) == 1 else "t" if len(set(suits)) == 2 else "r"
        paired = len(set(values)) != 3
        distinct = sorted(set(values))
        connected = len(distinct) >= 2 and distinct[-1] - distinct[0] <= 4
        if not connected and distinct[-1] == 14 and distinct[-2] <= 5:
            connected = True
    else:
        max_suit = max(suits.count(suit) for suit in set(suits))
        suit_kind = "m" if max_suit >= 4 else "t" if max_suit == 3 else "r"
        paired = len(set(values)) != len(values)
        distinct = set(values)
        connected = any(
            sum(1 for rank in distinct if rank <= window and rank > window - 5) >= 3
            for window in range(14, 5, -1)
        )
        if not connected:
            connected = sum(1 for rank in distinct if rank <= 5 or rank == 14) >= 3
    return high + suit_kind + ("p" if paired else "u") + ("c" if connected else "d")


def _format_number(value: int | float) -> str:
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise PioError("UPI numeric argument is invalid")
    return (
        str(int(number))
        if number.is_integer()
        else format(number, ".12f").rstrip("0").rstrip(".")
    )


def _icm_setup_commands(
    scenario: dict[str, Any], icm_model: dict[str, Any] | None
) -> list[str]:
    model_id = scenario.get("icm_model_id")
    if scenario.get("objective") != "icm":
        if model_id is not None or icm_model is not None:
            raise PioError("cash/chip EV may not configure an ICM table")
        return []
    if scenario.get("rake") is not None:
        raise PioError("Pio rake and ICM are mutually exclusive")
    if not isinstance(icm_model, dict) or icm_model.get("model_id") != model_id:
        raise PioError("the scenario's approved ICM model is absent")
    oop_stack = icm_model.get("oop_stack_chips")
    ip_stack = icm_model.get("ip_stack_chips")
    if (
        isinstance(oop_stack, bool)
        or not isinstance(oop_stack, int)
        or oop_stack <= 0
        or isinstance(ip_stack, bool)
        or not isinstance(ip_stack, int)
        or ip_stack <= 0
        or min(oop_stack, ip_stack) != scenario.get("effective_stack_chips")
    ):
        raise PioError("approved ICM stacks do not match the scenario")
    points = icm_model.get("points")
    if not isinstance(points, (tuple, list)) or len(points) < 4:
        raise PioError("approved ICM interpolation points are incomplete")
    commands = ["reset_icm_tables", f"set_icm {oop_stack} {ip_stack}"]
    seen: set[tuple[str, int]] = set()
    for point in points:
        if not isinstance(point, (tuple, list)) or len(point) != 3:
            raise PioError("approved ICM interpolation point is malformed")
        player, stack, utility = point
        if (
            player not in ("OOP", "IP")
            or isinstance(stack, bool)
            or not isinstance(stack, int)
            or stack < 0
            or (player, stack) in seen
        ):
            raise PioError("approved ICM interpolation point is invalid")
        seen.add((player, stack))
        commands.append(
            f"set_icm_point {player} {stack} {_format_number(utility)}"
        )
    if {player for player, _stack in seen} != {"OOP", "IP"}:
        raise PioError("approved ICM interpolation points omit a player")
    return commands


def setup_commands(
    scenario: dict[str, Any],
    oop_range: list[float],
    ip_range: list[float],
    *,
    icm_model: dict[str, Any] | None = None,
) -> list[str]:
    if (
        len(oop_range) != 1326
        or len(ip_range) != 1326
        or any(not math.isfinite(value) or value < 0 or value > 1 for value in oop_range)
        or any(not math.isfinite(value) or value < 0 or value > 1 for value in ip_range)
    ):
        raise PioError("approved Pio ranges must contain exactly 1,326 weights")
    commands = [
        f"set_pot 0 0 {scenario['pot_chips']}",
        f"set_eff_stack {scenario['effective_stack_chips']}",
        f"set_board {scenario['flop_board']}",
        "set_range OOP " + " ".join(_format_number(value) for value in oop_range),
        "set_range IP " + " ".join(_format_number(value) for value in ip_range),
        "set_isomorphism 1 0",
        "clear_lines",
    ]
    commands.extend(
        "add_line " + " ".join(_format_number(value) for value in line)
        for line in scenario["tree_lines"]
    )
    if scenario.get("objective") == "icm":
        commands.extend(_icm_setup_commands(scenario, icm_model))
    else:
        rake = scenario.get("rake")
        if (
            not isinstance(rake, list)
            or len(rake) != 2
            or isinstance(rake[1], bool)
            or not isinstance(rake[1], int)
            or rake[1] < 0
            or not isinstance(rake[0], (int, float))
            or isinstance(rake[0], bool)
            or not math.isfinite(float(rake[0]))
            or not 0 <= float(rake[0]) <= 1
        ):
            raise PioError("rake must be exactly [fraction, integer cap]")
        commands.append(f"set_rake {_format_number(rake[0])} {rake[1]}")
    accuracy = scenario.get("solve_accuracy")
    if (
        isinstance(accuracy, bool)
        or not isinstance(accuracy, (int, float))
        or not math.isfinite(float(accuracy))
        or not 0 < float(accuracy) <= 0.01
    ):
        raise PioError("solve_accuracy must be a fraction in (0, 0.01]")
    commands.extend(
        (
            "build_tree",
            f"set_accuracy {_format_number(accuracy)} fraction",
            "go",
            "wait_for_solver",
        )
    )
    rake_commands = [command for command in commands if command.startswith("set_rake ")]
    icm_commands = [
        command
        for command in commands
        if command == "reset_icm_tables"
        or command.startswith(("set_icm ", "set_icm_point "))
    ]
    if bool(rake_commands) == bool(icm_commands):
        raise PioError("a scenario must use exactly one of rake or ICM")
    if any(commands.index(command) > commands.index("build_tree") for command in rake_commands + icm_commands):
        raise PioError("the EV model must be configured before build_tree")
    return commands


def solve_scenario(
    pio: Callable[[str], str], scenario: dict[str, Any], manifest: ApprovedManifest
) -> dict[str, float]:
    oop_range = load_range_vector(manifest.input_root / scenario["oop_range_path"])
    ip_range = load_range_vector(manifest.input_root / scenario["ip_range_path"])
    model_id = scenario.get("icm_model_id")
    icm_model = manifest.icm_models.get(model_id) if isinstance(model_id, str) else None
    for command in setup_commands(
        scenario, oop_range, ip_range, icm_model=icm_model
    ):
        pio(command)
    summary = parse_calc_results(pio("calc_results"))
    exploitability_fraction = summary["exploitability_chips"] / scenario["pot_chips"]
    # In chip/cash EV the named calc_results unit is chips, so independently
    # prove the accuracy stop.  ICM replaces chip utility; its exact values are
    # still parsed and finite, while set_accuracy/wait_for_solver own the stop.
    if (
        scenario["objective"] != "icm"
        and exploitability_fraction > scenario["solve_accuracy"] + 1e-9
    ):
        raise PioError("PioSOLVER stopped above the approved accuracy fraction")
    return {
        **summary,
        "exploitability_fraction": exploitability_fraction,
        "exploitability_pct": exploitability_fraction * 100,
    }


def _combo_cards() -> list[tuple[str, str]]:
    deck = [rank + suit for rank in "23456789TJQKA" for suit in "cdhs"]
    return [(deck[low], deck[high]) for high in range(1, 52) for low in range(high)]


COMBO_CARDS = _combo_cards()


def _action_spec(code: str, line: NodeLine, effective_stack_chips: int) -> dict[str, Any]:
    if code == "f":
        return {"family": "fold", "size_unit": "none", "size_value": None, "all_in": False}
    if code == "c":
        family = "call" if line.wager_active else "check"
        return {"family": family, "size_unit": "none", "size_value": None, "all_in": False}
    match = BET.fullmatch(code)
    if not match:
        raise PioError(f"unsupported Pio action: {code}")
    target = int(match.group(1))
    actor = line.actor
    actor_total_target = line.contributions[actor] + effective_stack_chips - line.total_spent[actor]
    if target <= line.contributions[actor] or target > actor_total_target:
        raise PioError(f"Pio child {code} is outside the actor's legal stack")
    if target == actor_total_target:
        return {"family": "all_in", "size_unit": "all_in", "size_value": None, "all_in": True}
    if line.wager_active:
        denominator = line.pot_chips + line.current_target - line.contributions[actor]
        fraction = (target - line.current_target) / denominator
        family = "raise"
        unit = "pot_after_call_fraction"
    else:
        denominator = line.pot_chips
        fraction = target / denominator
        family = "bet"
        unit = "pot_fraction"
    if denominator <= 0 or not 0 < fraction <= 20:
        raise PioError(f"Pio child {code} has an invalid sizing denominator")
    return {
        "family": family,
        "size_unit": unit,
        "size_value": round(fraction, 8),
        "all_in": False,
    }


def _normalized_frequencies(
    raw: dict[str, list[float]], live: list[bool]
) -> dict[str, list[float]]:
    actions = list(raw)
    result = {action: [0.0] * 1326 for action in actions}
    for index in range(1326):
        values = [raw[action][index] for action in actions]
        if any(not math.isfinite(value) or value < -1e-9 or value > 1.000000001 for value in values):
            raise PioError(f"strategy contains an invalid frequency at combo {index}")
        total = sum(values)
        if not live[index]:
            if abs(total) > 0.00002:
                raise PioError(f"unreached combo {index} carries strategy")
            continue
        if not 0.98 <= total <= 1.02:
            raise PioError(f"live combo {index} frequencies sum to {total}")
        normalized = [max(0.0, value / total) for value in values]
        largest = max(range(len(actions)), key=lambda position: normalized[position])
        rounded = [round(value, 8) for value in normalized]
        rounded[largest] = round(1.0 - sum(value for pos, value in enumerate(rounded) if pos != largest), 8)
        if any(value < 0 or value > 1 for value in rounded) or abs(sum(rounded) - 1) > 0.0000001:
            raise PioError(f"combo {index} cannot be normalized without distortion")
        for position, action in enumerate(actions):
            result[action][index] = rounded[position]
    return result


def _node_board_matches(target: dict[str, Any], scenario: dict[str, Any]) -> None:
    cards = [token for token in target["node"].split(":") if CARD.fullmatch(token)]
    if target["board"] != scenario["flop_board"] + "".join(cards):
        raise PioError("target board and node path disagree")


def target_context(scenario: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    _node_board_matches(target, scenario)
    line = analyze_node(
        target["node"],
        root_pot_chips=scenario["pot_chips"],
        effective_stack_chips=scenario["effective_stack_chips"],
        preflop_aggressor=scenario["preflop_aggressor_solver_player"],
    )
    expected = (target["node_role"], target["facing_kind"], target["facing_size_bucket"])
    actual = (line.node_role, line.facing_kind, line.facing_size_bucket)
    if actual != expected:
        raise PioError(f"target {target['target_id']} declares {expected} but the line proves {actual}")
    positions = (scenario["oop_position"], scenario["ip_position"])
    return {
        "street": line.street,
        "game_family": scenario["game_family"],
        "objective": scenario["objective"],
        "utility_context": scenario["utility_context"],
        "table_size": scenario["table_size"],
        "pot_type": scenario["pot_type"],
        "hero_position": positions[line.actor],
        "opponent_position": positions[1 - line.actor],
        "depth_bucket": scenario["depth_bucket"],
        "texture_class": texture_class(target["board"]),
        "node_role": line.node_role,
        "facing_kind": line.facing_kind,
        "facing_size_bucket": line.facing_size_bucket,
    }


def harvest_node(
    pio: Callable[[str], str],
    scenario: dict[str, Any],
    target: dict[str, Any],
    *,
    manifest_checksum: str,
    source_combo_order_checksum: str,
    range_bundle_checksum: str,
) -> dict[str, Any]:
    context = target_context(scenario, target)
    line = analyze_node(
        target["node"],
        root_pot_chips=scenario["pot_chips"],
        effective_stack_chips=scenario["effective_stack_chips"],
        preflop_aggressor=scenario["preflop_aggressor_solver_player"],
    )
    node = target["node"]
    children = parse_children(pio(f"show_children {node}"), node)
    if children != target["expected_children"]:
        raise PioError(
            f"{target['target_id']} children changed: expected {target['expected_children']}, got {children}"
        )
    player = "OOP" if line.actor == 0 else "IP"
    raw_frequencies = parse_strategy(pio(f"show_strategy {node}"), children)
    reach = parse_vector(
        pio(f"show_range {player} {node}"), allow_nan=False, label="show_range"
    )
    policy_ev, matchups = parse_calc_ev(
        pio(f"calc_ev {player} {node}"), label="policy EV"
    )
    action_ev: dict[str, list[float]] = {}
    for action in children:
        evs, _action_matchups = parse_calc_ev(
            pio(f"calc_ev {player} {node}:{action}"),
            label=f"action EV {action}",
        )
        action_ev[action] = evs
    board_cards = {
        target["board"][index : index + 2] for index in range(0, len(target["board"]), 2)
    }
    live: list[bool] = []
    normalized_matchups: list[float] = []
    for index, weight in enumerate(matchups):
        blocked = any(card in board_cards for card in COMBO_CARDS[index])
        reach_weight = reach[index]
        if not math.isfinite(reach_weight) or reach_weight < 0 or reach_weight > 1.000000001:
            raise PioError(f"show_range contains an invalid weight at combo {index}")
        if blocked and (abs(weight) > 0.0000001 or abs(reach_weight) > 0.0000001):
            raise PioError(f"board-blocked combo {index} has nonzero solver weight")
        if weight > 0 and reach_weight <= 0:
            raise PioError(f"calc_ev reports matchups for unreachable combo {index}")
        normalized_weight = 0.0 if blocked else round(weight, 8)
        normalized_matchups.append(normalized_weight)
        live.append(normalized_weight > 0)
    frequencies = _normalized_frequencies(raw_frequencies, live)
    policy_evs_bb: list[float | None] = []
    action_evs_bb = {action: [] for action in children}
    chips_per_bb = scenario["chips_per_bb"]
    for index in range(1326):
        if not live[index]:
            policy_evs_bb.append(None)
            for action in children:
                action_evs_bb[action].append(None)
            continue
        values = [action_ev[action][index] for action in children]
        if not math.isfinite(policy_ev[index]) or any(not math.isfinite(value) for value in values):
            raise PioError(f"live combo {index} is missing policy or action EV")
        policy_value = round(policy_ev[index] / chips_per_bb, 6)
        action_values = [round(value / chips_per_bb, 6) for value in values]
        mixed = sum(frequencies[action][index] * action_values[pos] for pos, action in enumerate(children))
        if abs(policy_value - mixed) > 0.02:
            raise PioError(
                f"combo {index} policy EV differs from its action-frequency EV by {abs(policy_value - mixed):.6f} bb"
            )
        policy_evs_bb.append(policy_value)
        for position, action in enumerate(children):
            action_evs_bb[action].append(action_values[position])
    full_context = {
        **context,
        "board": target["board"],
        "facing_target_chips": line.facing_target_chips,
        "facing_actor_total_chips": line.facing_actor_total_chips,
    }
    return {
        "schema": "smarter-poker.pio-policy.v3",
        "node": node,
        "node_context": full_context,
        "line_proof": {
            "schema": "smarter-poker.pio-line-proof.v1",
            "manifest_checksum": manifest_checksum,
            "hero_solver_player": line.actor,
            "preflop_aggressor_solver_player": scenario[
                "preflop_aggressor_solver_player"
            ],
            "root_pot_chips": scenario["pot_chips"],
            "effective_stack_chips": scenario["effective_stack_chips"],
            "chips_per_bb": scenario["chips_per_bb"],
        },
        "action_specs": {
            action: _action_spec(action, line, scenario["effective_stack_chips"])
            for action in children
        },
        "frequencies": frequencies,
        "policy_evs_bb": policy_evs_bb,
        "action_evs_bb": action_evs_bb,
        "matchups": normalized_matchups,
        "source_combo_order_checksum": source_combo_order_checksum,
        "range_bundle_checksum": range_bundle_checksum,
    }


def run_self_test(
    pio: Callable[[str], str],
    scenario: dict[str, Any],
    contract: dict[str, Any],
    convergence: dict[str, float] | None = None,
) -> dict[str, float]:
    node = contract["node"]
    line = analyze_node(
        node,
        root_pot_chips=scenario["pot_chips"],
        effective_stack_chips=scenario["effective_stack_chips"],
        preflop_aggressor=scenario["preflop_aggressor_solver_player"],
    )
    if line.actor != contract["solver_player"]:
        raise PioError("self-test player does not own the approved node")
    children = parse_children(pio(f"show_children {node}"), node)
    if children != contract["expected_children"]:
        raise PioError("self-test action topology changed")
    parse_strategy(pio(f"show_strategy {node}"), children)
    player = "OOP" if line.actor == 0 else "IP"
    evs, weights = parse_calc_ev(
        pio(f"calc_ev {player} {node}"), label="self-test EV"
    )
    numerator = 0.0
    denominator = 0.0
    for weight, ev in zip(weights, evs):
        if weight > 0:
            if not math.isfinite(weight) or not math.isfinite(ev):
                raise PioError("self-test has a nonfinite live EV")
            numerator += weight * ev
            denominator += weight
    if denominator <= 0:
        raise PioError("self-test range has no live combos")
    weighted_ev_bb = numerator / denominator / scenario["chips_per_bb"]
    solve_receipt = convergence or {
        **parse_calc_results(pio("calc_results")),
    }
    exploitability = (
        solve_receipt["exploitability_chips"] / scenario["pot_chips"] * 100
    )
    if not contract["weighted_policy_ev_min_bb"] <= weighted_ev_bb <= contract[
        "weighted_policy_ev_max_bb"
    ]:
        raise PioError(f"self-test EV {weighted_ev_bb:.6f} is outside its approved bounds")
    if exploitability > contract["max_exploitability_pct"]:
        raise PioError(
            f"self-test exploitability {exploitability:.6f} exceeds the approved maximum"
        )
    return {"weighted_policy_ev_bb": weighted_ev_bb, "exploitability_pct": exploitability}


def validate_pipeline_imports() -> None:
    """Cheap local invariants used before launching the licensed solver."""
    if len(COMBO_CARDS) != 1326 or COMBO_ORDER.count("1325") != 1:
        raise ContractError("canonical combo mapping is incomplete")
    if texture_class("AsKd7c") != "Arud" or texture_class("QhJdTh") != "Btuc":
        raise ContractError("Python texture classifier diverged from the V31 contract")
