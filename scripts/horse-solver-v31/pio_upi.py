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

from contract import COMBO_ORDER, ContractError, load_range_vector


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


class PioProcess:
    """One serialized UPI process with bounded reads to the END terminator."""

    def __init__(self, executable: str | Path):
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
            raise PioError("PioSOLVER did not expose a UPI pipe")
        self._lines: queue.Queue[str | BaseException | None] = queue.Queue()
        self._lock = threading.Lock()
        self._reader = threading.Thread(target=self._read_lines, daemon=True)
        self._reader.start()

    def _read_lines(self) -> None:
        try:
            assert self._process.stdout is not None
            for line in self._process.stdout:
                self._lines.put(line.rstrip("\r\n"))
        except BaseException as error:
            self._lines.put(error)
        finally:
            self._lines.put(None)

    def command(self, command: str, timeout_seconds: float | None = None) -> str:
        text = str(command).strip()
        if not text or "\n" in text or "\r" in text or len(text) > 200_000:
            raise PioError("refusing an invalid UPI command")
        slow = text.split(" ", 1)[0] in {"go", "wait_for_solver", "build_tree"}
        timeout = timeout_seconds if timeout_seconds is not None else (7200.0 if slow else 300.0)
        with self._lock:
            if self._process.poll() is not None:
                raise PioError(f"PioSOLVER exited with code {self._process.returncode}")
            assert self._process.stdin is not None
            self._process.stdin.write(text + "\n")
            self._process.stdin.flush()
            deadline = time.monotonic() + timeout
            output: list[str] = []
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PioError(f"timeout waiting for PioSOLVER END after {text.split()[0]}")
                try:
                    line = self._lines.get(timeout=remaining)
                except queue.Empty as error:
                    raise PioError(f"timeout waiting for PioSOLVER END after {text.split()[0]}") from error
                if isinstance(line, BaseException):
                    raise PioError("PioSOLVER output could not be decoded as UTF-8") from line
                if line is None:
                    raise PioError(f"PioSOLVER exited before END after {text.split()[0]}")
                if line == "END":
                    break
                output.append(line)
            body = "\n".join(output)
            if any(line.lstrip().upper().startswith(("ERROR", "ERR ")) for line in output):
                raise PioError(f"PioSOLVER rejected {text.split()[0]}: {body[:500]}")
            return body

    def close(self) -> None:
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=10)

    def __enter__(self) -> "PioProcess":
        return self

    def __exit__(self, _kind: Any, _value: Any, _traceback: Any) -> None:
        self.close()


def _numeric_vectors(raw: str) -> list[list[float]]:
    vectors: list[list[float]] = []
    for line in raw.splitlines():
        tokens = line.replace(",", " ").split()
        if len(tokens) < 1326:
            continue
        found: list[float] | None = None
        for start in range(len(tokens) - 1326, -1, -1):
            try:
                candidate = [float(value) for value in tokens[start : start + 1326]]
            except ValueError:
                continue
            found = candidate
            break
        if found is not None:
            vectors.append(found)
    return vectors


def parse_vector(raw: str, *, allow_nan: bool, label: str) -> list[float]:
    vectors = _numeric_vectors(raw)
    if not vectors:
        raise PioError(f"{label} did not contain a 1,326-combo vector")
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


def parse_exploitability(raw: str) -> float:
    values: list[float] = []
    for token in raw.replace("%", " ").replace(",", " ").split():
        try:
            value = float(token)
        except ValueError:
            continue
        if math.isfinite(value):
            values.append(value)
    if not values or values[-1] < 0:
        raise PioError("calc_exploitability returned no finite nonnegative value")
    return values[-1]


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
    return str(int(number)) if number.is_integer() else format(number, ".12g")


def setup_commands(
    scenario: dict[str, Any], oop_range: list[float], ip_range: list[float]
) -> list[str]:
    if len(oop_range) != 1326 or len(ip_range) != 1326:
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
    commands.append("set_rake " + " ".join(_format_number(value) for value in scenario["rake"]))
    if scenario["icm_command"] is not None:
        commands.append(scenario["icm_command"])
    commands.extend(("build_tree", f"go {_format_number(scenario['solve_accuracy'])}", "wait_for_solver"))
    if commands.index(next(command for command in commands if command.startswith("set_rake "))) > commands.index("build_tree"):
        raise PioError("set_rake must precede build_tree")
    icm_commands = [command for command in commands if command.startswith(("set_icm ", "set_icm_point "))]
    if len(icm_commands) != (1 if scenario["objective"] == "icm" else 0):
        raise PioError("a scenario must use exactly its declared ICM mode")
    return commands


def solve_scenario(
    pio: Callable[[str], str], scenario: dict[str, Any], input_root: Path
) -> None:
    oop_range = load_range_vector(input_root / scenario["oop_range_path"])
    ip_range = load_range_vector(input_root / scenario["ip_range_path"])
    for command in setup_commands(scenario, oop_range, ip_range):
        pio(command)


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
    matchups = parse_vector(pio(f"show_range {player} {node}"), allow_nan=False, label="show_range")
    policy_ev = parse_vector(pio(f"calc_ev {player} {node}"), allow_nan=True, label="policy EV")
    action_ev = {
        action: parse_vector(
            pio(f"calc_ev {player} {node}:{action}"),
            allow_nan=True,
            label=f"action EV {action}",
        )
        for action in children
    }
    board_cards = {
        target["board"][index : index + 2] for index in range(0, len(target["board"]), 2)
    }
    live: list[bool] = []
    normalized_matchups: list[float] = []
    for index, weight in enumerate(matchups):
        blocked = any(card in board_cards for card in COMBO_CARDS[index])
        if not math.isfinite(weight) or weight < 0 or weight > 1.000000001:
            raise PioError(f"show_range contains an invalid weight at combo {index}")
        if blocked and abs(weight) > 0.0000001:
            raise PioError(f"board-blocked combo {index} has nonzero reach weight")
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
    pio: Callable[[str], str], scenario: dict[str, Any], contract: dict[str, Any]
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
    weights = parse_vector(pio(f"show_range {player} {node}"), allow_nan=False, label="self-test range")
    evs = parse_vector(pio(f"calc_ev {player} {node}"), allow_nan=True, label="self-test EV")
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
    exploitability = parse_exploitability(pio("calc_exploitability"))
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
