#!/usr/bin/env python3
"""Explicit licensed conditional-history acceptance; no gateway or source artifacts."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from contract import parse_source_combo_order
from pio_upi import (COMBO_CARDS, PioError, PioProcess, analyze_node, parse_calc_ev,
                     parse_children, parse_strategy, parse_vector, setup_commands,
                     validate_conditional_support)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pio-exe', type=Path, required=True)
    parser.add_argument('--solver-sha256', required=True)
    parser.add_argument('--solver-version', required=True)
    parser.add_argument('--hand-order', type=Path, required=True)
    parser.add_argument('--hand-order-sha256', required=True)
    parser.add_argument('--source-receipts', type=Path, required=True)
    args = parser.parse_args()
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    if digest(args.pio_exe) != args.solver_sha256 or digest(args.hand_order) != args.hand_order_sha256:
        raise PioError('native preflight solver or hand-order identity mismatch')
    expected_files = {'contract.py', 'pio_upi.py', 'native_conditional_preflight.py'}
    receipts = json.loads(args.source_receipts.read_text(encoding='utf-8'))
    if not isinstance(receipts, dict) or set(receipts) != expected_files:
        raise PioError('native preflight requires exact candidate source receipts')
    for name in sorted(expected_files):
        if digest(Path(__file__).resolve().parent / name) != receipts[name]:
            raise PioError('native preflight candidate source identity mismatch')
    order = parse_source_combo_order(args.hand_order.read_text(encoding='utf-8'))
    node = 'r:0:c:c:9h:c:c:2s:b250:b750'
    target = {'target_id': 'analytic.conditional.response', 'node': node, 'board': 'KsQdJc9h2s',
              'node_role': 'bet_raise', 'facing_kind': 'raise', 'facing_size_bucket': 'small',
              'expected_children': ['c', 'f']}
    scenario = {'scenario_id': 'analytic.conditional', 'game_family': 'cash', 'objective': 'cash_ev',
                'utility_context': 'cash_ev', 'table_size': 6, 'pot_type': 'srp',
                'oop_position': 'SB', 'ip_position': 'BB', 'depth_bucket': 20,
                'preflop_aggressor_solver_player': 0, 'flop_board': 'KsQdJc',
                'pot_chips': 500, 'effective_stack_chips': 2000, 'chips_per_bb': 100,
                'rake': [0, 0], 'icm_model_id': None, 'solve_accuracy': .00001,
                'tree_lines': [[0, 0, 0, 0, 250, 750, 750]], 'targets': [target],
                'conditional_history': {'model': 'authored_range_preserving_response', 'target_node': node}}
    line = analyze_node(node, root_pot_chips=500, effective_stack_chips=2000, preflop_aggressor=0)
    # Derive role from the existing chronology, while independently pinning the response type.
    if line.actor != 0 or line.node_role != 'bet_raise' or line.facing_kind != 'raise':
        raise PioError('native fixture no longer denotes its intended OOP raise response')
    target['facing_size_bucket'] = line.facing_size_bucket
    index = lambda hand: next(i for i, cards in enumerate(COMBO_CARDS) if set(cards) == set(hand))
    nuts, air, opponent = index(('As', 'Ts')), index(('7c', '6d')), index(('Kd', 'Kh'))
    inputs = {'OOP': [0.] * 1326, 'IP': [0.] * 1326}
    inputs['OOP'][nuts] = inputs['OOP'][air] = inputs['IP'][opponent] = 1.
    with PioProcess(args.pio_exe, expected_solver_version=args.solver_version, expected_hand_order=order) as process:
        pio = process.command
        for command in setup_commands(scenario, inputs['OOP'], inputs['IP']):
            pio(command)
        if parse_children(pio('show_children ' + node), node) != ['c', 'f']:
            raise PioError('native conditional target choices changed')
        # Every preceding decision must retain exactly its specified next action.
        prefix = 'r:0'
        for token in node.split(':')[2:]:
            if len(token) == 2 and token[0] in '23456789TJQKA' and token[1] in 'cdhs':
                prefix += ':' + token
                continue
            if parse_children(pio('show_children ' + prefix), prefix) != [token]:
                raise PioError('native force_line did not force the exact historical action')
            prefix += ':' + token
        actual = {side: parse_vector(pio(f'show_range {side} {node}'), allow_nan=False, label='native range')
                  for side in ('OOP', 'IP')}
        _, matchups = parse_calc_ev(pio('calc_ev OOP ' + node), label='native matchup evidence')
        validate_conditional_support(scenario, target, inputs, actual, 'OOP', matchups)
        frequencies = parse_strategy(pio('show_strategy ' + node), ['c', 'f'])
        if frequencies['c'][nuts] < .99 or frequencies['f'][air] < .99:
            raise PioError('native target policy is locked or violates independently known nuts/air responses')
    print(json.dumps({'contract': 'smarter-poker.v31-native-conditional-preflight.v1',
                      'passed': True, 'solver_sha256': args.solver_sha256, 'source_receipts': receipts,
                      'forced_prefix': list(line.cumulative_line), 'target_choices': ['c', 'f'],
                      'both_original_ranges_preserved': True, 'actor_positive_matchup_combos': 2,
                      'nuts_calls_air_folds': True, 'gateway_contacted': False,
                      'source_artifact_written': False}, sort_keys=True))


if __name__ == '__main__':
    main()
