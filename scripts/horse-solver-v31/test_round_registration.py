"""Round registration binding (Club Arena migrations 20261110213931 and 20261112185251).

Synthetic contexts only; no gateway, database, solver or label.
"""
import copy
from pathlib import Path
import re
import unittest

from contract import ContractError, _validate_scenario, tree_available_actions
from pio_upi import analyze_node, target_context
from public_hist215 import (build_cell_provenance, canonical_bytes, cell_composition, cell_set_checksum,
                            manifest_range_constructions, verify_round_composition, verify_round_registration)

CHECKSUM = 'e' * 64  # the approved manifest's checksum (betting_tree_checksum in the provenance)


def cell(street, texture, role='barrel', table_size=2):
    return {'street': street, 'game_family': 'cash', 'objective': 'cash_ev', 'utility_context': 'cash_ev',
            'table_size': table_size, 'pot_type': 'srp', 'hero_position': 'SB', 'opponent_position': 'BB',
            'depth_bucket': 80, 'texture_class': texture, 'node_role': role, 'facing_kind': 'none',
            'facing_size_bucket': 'none'}


def cells(flop, turn, river, salt=''):
    return ([cell('flop', f'F{salt}{i}') for i in range(flop)] + [cell('turn', f'T{salt}{i}') for i in range(turn)]
            + [cell('river', f'R{salt}{i}') for i in range(river)])


def provenance(planned, construction='natural'):
    return [{'cell': c, 'range_construction': construction} for c in planned]


def registration(planned, construction='natural'):
    return {'round_key': 'r9', 'dataset_key': 'horse-r9', 'composition': cell_composition(planned),
            'cells': planned, 'cell_set_checksum': cell_set_checksum(planned),
            'cell_provenance': provenance(planned, construction)}


def verify(reg, man):
    return verify_round_composition(reg, man)


def scenario(node='r:0', board='AsKd7c', **extra):
    """One real harvest scenario (the shape test_pipeline.base_scenario uses)."""
    line = analyze_node(node, root_pot_chips=100, effective_stack_chips=1000, preflop_aggressor=None)
    value = {'scenario_id': 'cash.limped.sb.bb.10.' + node.replace(':', '-'), 'game_family': 'cash', 'objective': 'cash_ev',
             'utility_context': 'cash_ev', 'table_size': 6, 'pot_type': 'limped', 'oop_position': 'SB',
             'ip_position': 'BB', 'depth_bucket': 10, 'preflop_aggressor_solver_player': None, 'flop_board': 'AsKd7c',
             'pot_chips': 100, 'effective_stack_chips': 1000, 'chips_per_bb': 100, 'rake': [0, 0], 'icm_model_id': None,
             'oop_range_path': 'ranges/oop.txt', 'oop_range_checksum': 'a' * 64, 'ip_range_path': 'ranges/ip.txt',
             'ip_range_checksum': 'b' * 64, 'tree_lines': [[100, 300, 300, 300, 500, 500]], 'solve_accuracy': 0.005,
             'targets': [{'target_id': 'cash.target', 'machine_id': 'M1', 'node': node, 'board': board,
                          'node_role': line.node_role, 'facing_kind': line.facing_kind,
                          'facing_size_bucket': line.facing_size_bucket, 'expected_children': ['c', 'f']}]}
    value.update(extra)
    return value


FORCED_NODE = 'r:0:b100:b300:c:2d:c:b500'


def forced_scenario(**extra):
    return scenario(FORCED_NODE, 'AsKd7c2d',
                    conditional_history={'model': 'authored_range_preserving_response', 'target_node': FORCED_NODE}, **extra)


def real_manifest(*scenarios):
    cells = [target_context(s, s['targets'][0]) for s in scenarios]
    return {'dataset_key': 'horse-r9', 'scenarios': list(scenarios), 'public215_contexts': [{'context': c} for c in cells]}, cells


def manifest(built):
    return {'dataset_key': 'horse-r9', 'public215_contexts': [{'context': c} for c in built]}


class RoundRegistrationTests(unittest.TestCase):
    def test_checksum_matches_the_database_and_typescript_fixture(self):
        three = [
            {**cell('turn', 'Arpd', 'all_in', 6), 'hero_position': 'BTN', 'facing_kind': 'all_in', 'facing_size_bucket': 'all_in'},
            {**cell('flop', 'Brud', 'cbet')},
            {**cell('river', 'Bruc', 'probe'), 'hero_position': 'BB', 'opponent_position': 'SB'},
        ]
        # Same value as live fn_gto_v31_public215_digest and GtoV31DensityPreflight.test.ts.
        self.assertEqual(cell_set_checksum(three), '70a3e422d2e912ebc5a64d34605dc1048e0b6869b187510507dc81a9987aac78')
        self.assertEqual(cell_set_checksum(list(reversed(three))), cell_set_checksum(three))

    def test_the_registered_cells_pass(self):
        planned = cells(30, 50, 20)
        self.assertIs(verify(registration(planned), manifest(list(reversed(planned)))) is not None, True)

    def test_the_r8_deviation_is_refused_with_both_compositions(self):
        with self.assertRaises(ContractError) as caught:
            verify(registration(cells(70, 23, 7)), manifest(cells(0, 67, 33)))
        message = str(caught.exception)
        self.assertIn('registered 70 flop / 23 turn / 7 river', message)
        self.assertIn('manifest 0 flop / 67 turn / 33 river', message)

    def test_a_substituted_cell_of_the_same_street_is_refused(self):
        planned = cells(30, 50, 20)
        built = planned[:-1] + [cell('river', 'Zswap')]
        with self.assertRaises(ContractError):
            verify(registration(planned), manifest(built))

    def test_a_missing_or_extra_cell_is_refused(self):
        planned = cells(30, 50, 20)
        for built in (planned[:-1], planned + [cell('turn', 'Zextra')]):
            with self.assertRaises(ContractError):
                verify(registration(planned), manifest(built))

    def test_a_tampered_registration_is_refused(self):
        planned = cells(30, 50, 20)
        for mutate in (lambda r: r.__setitem__('composition', {'flop': 31, 'turn': 49, 'river': 20}),
                       lambda r: r.__setitem__('cell_set_checksum', '0' * 64),
                       lambda r: r.__setitem__('dataset_key', 'horse-other'),
                       lambda r: r.pop('cells'),
                       lambda r: r['cells'].append(copy.deepcopy(r['cells'][0]))):
            reg = registration(copy.deepcopy(planned))
            mutate(reg)
            with self.assertRaises(ContractError):
                verify(reg, manifest(planned))


class RangeConstructionTests(unittest.TestCase):
    """How a cell's ranges were produced is declared, and a forced line is never registered."""

    def load(self, value):
        return _validate_scenario(value, 0, Path('.'), {}, {}, False)

    def test_a_conditional_history_scenario_must_declare_forced(self):
        self.assertEqual(self.load(forced_scenario(range_construction='forced'))['range_construction'], 'forced')
        for wrong in ('natural', 'subgame', 'root'):
            with self.subTest(declared=wrong), self.assertRaises(ContractError) as caught:
                self.load(forced_scenario(range_construction=wrong))
            self.assertIn('must declare range_construction forced', str(caught.exception))

    def test_a_manifest_written_before_the_declaration_still_loads(self):
        # R6, R7 and R8 manifests are pinned by checksum and are never rewritten or relabelled. The pinned
        # manifest files are not in this repository (they live with the round artifacts), so this loads
        # scenarios of their exact shape: no range_construction key, forced and unforced.
        self.assertNotIn('range_construction', self.load(forced_scenario()))
        self.assertNotIn('range_construction', self.load(scenario()))

    def test_unknown_missing_type_and_misplaced_forced_are_refused(self):
        for wrong in ('authored', '', None, 1, ['natural']):
            with self.subTest(declared=wrong), self.assertRaises(ContractError):
                self.load(scenario(range_construction=wrong))
        with self.assertRaises(ContractError) as caught:
            self.load(scenario(range_construction='forced'))
        self.assertIn('requires a conditional_history', str(caught.exception))

    def test_root_is_refused_after_a_bet_and_allowed_at_the_first_decision(self):
        self.assertEqual(self.load(scenario(range_construction='root'))['range_construction'], 'root')
        with self.assertRaises(ContractError) as caught:
            self.load(scenario(FORCED_NODE, 'AsKd7c2d', range_construction='root'))
        self.assertIn('cannot be a root-range node', str(caught.exception))

    def test_root_follows_the_database_rule_any_step_with_more_than_one_tree_action(self):
        # OOP checks; the tree offered only the check: one action, root is allowed.
        only_check = scenario('r:0:c', tree_lines=[[0, 0, 0, 0, 0, 0]], range_construction='root')
        self.assertEqual(tree_available_actions(only_check, 'r:0:c'), [1])
        self.assertEqual(self.load(only_check)['range_construction'], 'root')
        # The same check where the tree also offered a bet: a real decision, root is refused (no "b" token needed).
        with_bet = scenario('r:0:c', tree_lines=[[0, 0, 0, 0, 0, 0], [100, 300, 300, 300, 500, 500]], range_construction='root')
        self.assertEqual(tree_available_actions(with_bet, 'r:0:c'), [2])
        with self.assertRaises(ContractError) as caught:
            self.load(with_bet)
        self.assertIn('more than one available action', str(caught.exception))

    def test_available_actions_come_from_the_tree_lines(self):
        # bet (check also offered), raise facing a bet (call and fold too), call facing a raise (fold too),
        # turn check (tree offers nothing else), turn bet (check also offered)
        self.assertEqual(tree_available_actions(scenario(FORCED_NODE, 'AsKd7c2d'), FORCED_NODE), [2, 3, 2, 1, 2])
        with self.assertRaises(ContractError):
            tree_available_actions(scenario(FORCED_NODE, 'AsKd7c2d', tree_lines=[[0, 0, 0, 0, 0, 0]]), FORCED_NODE)

    def test_natural_and_subgame_are_allowed_after_earlier_decisions(self):
        upstream = {'upstream_solve_checksum': '9' * 64, 'upstream_node': 'r:0:b100:c'}
        for construction, extra in (('natural', {}), ('subgame', {'subgame_inputs': upstream})):
            with self.subTest(construction=construction):
                loaded = self.load(scenario(FORCED_NODE, 'AsKd7c2d', range_construction=construction, **extra))
                self.assertEqual(loaded['range_construction'], construction)

    def test_a_subgame_must_name_its_upstream_solve_and_non_root_start(self):
        for inputs in (None, {'upstream_solve_checksum': '9' * 64}, {'upstream_solve_checksum': '0' * 64, 'upstream_node': 'r:0:b100:c'},
                       {'upstream_solve_checksum': '9' * 64, 'upstream_node': 'r:0'}):
            extra = {} if inputs is None else {'subgame_inputs': inputs}
            with self.subTest(inputs=inputs), self.assertRaises(ContractError):
                self.load(scenario(FORCED_NODE, 'AsKd7c2d', range_construction='subgame', **extra))
        with self.assertRaises(ContractError) as caught:
            self.load(scenario(FORCED_NODE, 'AsKd7c2d', range_construction='natural',
                               subgame_inputs={'upstream_solve_checksum': '9' * 64, 'upstream_node': 'r:0:b100:c'}))
        self.assertIn('only a subgame scenario', str(caught.exception))
        man, built = real_manifest(scenario(FORCED_NODE, 'AsKd7c2d', range_construction='subgame',
                                            subgame_inputs={'upstream_solve_checksum': '9' * 64, 'upstream_node': 'r:0:b100:c'}))
        self.assertEqual(build_cell_provenance(man, CHECKSUM)[0]['upstream_solve_checksum'], '9' * 64)

    def test_a_forced_target_cannot_be_prepared_for_registration(self):
        for value in (forced_scenario(range_construction='forced'), forced_scenario()):
            man, _ = real_manifest(value)
            with self.subTest(declared=value.get('range_construction')), self.assertRaises(ContractError) as caught:
                manifest_range_constructions(man)
            self.assertIn('cannot be registered', str(caught.exception))
        # one forced scenario refuses the whole round, whatever the others declare
        man, _ = real_manifest(scenario(range_construction='root'), forced_scenario(range_construction='forced'))
        with self.assertRaises(ContractError):
            manifest_range_constructions(man)

    def test_an_undeclared_scenario_cannot_be_prepared_for_registration(self):
        man, _ = real_manifest(scenario())
        with self.assertRaises(ContractError) as caught:
            manifest_range_constructions(man)
        self.assertIn('does not declare range_construction', str(caught.exception))

    def test_one_cell_under_two_constructions_is_refused(self):
        first = scenario(FORCED_NODE, 'AsKd7c2d', range_construction='natural')
        second = scenario(FORCED_NODE, 'AsKd7c2d', range_construction='subgame', scenario_id='cash.other')
        man, _ = real_manifest(first, second)
        with self.assertRaises(ContractError) as caught:
            manifest_range_constructions(man)
        self.assertIn('two different range constructions', str(caught.exception))

    def test_valid_root_and_natural_cells_pass_against_their_registration(self):
        man, built = real_manifest(scenario(range_construction='root'),
                                   scenario(FORCED_NODE, 'AsKd7c2d', range_construction='natural'))
        reg = registration(built)
        reg['cell_provenance'] = build_cell_provenance(man, CHECKSUM)
        self.assertIs(verify_round_registration(reg, man, manifest_checksum=CHECKSUM), reg)
        self.assertEqual(sorted(manifest_range_constructions(man).values()), ['natural', 'root'])

    def test_the_generated_provenance_is_the_database_shape(self):
        man, built = real_manifest(scenario(FORCED_NODE, 'AsKd7c2d', range_construction='natural'))
        [entry] = build_cell_provenance(man, CHECKSUM)
        self.assertEqual(sorted(entry), ['cell', 'game', 'public_history', 'range_construction', 'runtime_mapping',
                                         'unnarrowed_seats', 'upstream_solve_checksum'])
        self.assertEqual([s['available_actions'] for s in entry['public_history']], [2, 3, 2, 1, 2])
        self.assertEqual([(s['solver_player'], s['position'], s['family'], s['target_chips'], s['street'])
                          for s in entry['public_history']],
                         [(0, 'SB', 'bet', 100, 'flop'), (1, 'BB', 'raise', 300, 'flop'), (0, 'SB', 'call', 300, 'flop'),
                          (0, 'SB', 'check', 0, 'turn'), (1, 'BB', 'bet', 200, 'turn')])
        mapping = entry['runtime_mapping']
        self.assertEqual({k: v for k, v in mapping.items() if k not in ('hero_solver_player', 'solver_positions')},
                         {k: v for k, v in built[0].items() if k != 'texture_class'})
        self.assertEqual(mapping['solver_positions'][mapping['hero_solver_player']], built[0]['hero_position'])
        self.assertEqual(entry['game'], {'variant': 'nlh', 'players_to_flop': 2, 'pot_type': 'limped', 'depth_bucket': 10,
                                         'chips_per_bb': 100, 'effective_stack_chips': 1000, 'root_pot_chips': 100,
                                         'rake': [0, 0], 'betting_tree_checksum': CHECKSUM})

    def test_a_hand_written_or_edited_provenance_is_refused(self):
        with_bet = scenario('r:0:c', tree_lines=[[0, 0, 0, 0, 0, 0], [100, 300, 300, 300, 500, 500]], range_construction='natural')
        man, built = real_manifest(with_bet)
        good = build_cell_provenance(man, CHECKSUM)
        edits = [
            # the review's M2 case: the check had a bet alternative but is declared a one-action step
            lambda p: p[0]['public_history'][0].__setitem__('available_actions', 1),
            lambda p: p[0]['runtime_mapping'].__setitem__('hero_solver_player', 0),
            lambda p: p[0]['game'].__setitem__('betting_tree_checksum', 'd' * 64),
            lambda p: p[0]['game'].__setitem__('rake', [0.05, 100]),
            lambda p: p[0].__setitem__('upstream_solve_checksum', '9' * 64),
            lambda p: p[0].pop('runtime_mapping'),
        ]
        for index, edit in enumerate(edits):
            reg = registration(copy.deepcopy(built))
            reg['cell_provenance'] = copy.deepcopy(good)
            edit(reg['cell_provenance'])
            with self.subTest(edit=index), self.assertRaises(ContractError) as caught:
                verify_round_registration(reg, man, manifest_checksum=CHECKSUM)
            self.assertIn('differs from the provenance generated from the manifest', str(caught.exception))
        reg = registration(copy.deepcopy(built))
        reg['cell_provenance'] = copy.deepcopy(good)
        self.assertIs(verify_round_registration(reg, man, manifest_checksum=CHECKSUM), reg)

    def test_an_unnarrowed_seat_needs_a_real_decision(self):
        pure = {'seat': 'OOP', 'reason': 'pure_prior_action', 'upstream_evidence_checksum': '8' * 64}
        man, built = real_manifest(scenario(FORCED_NODE, 'AsKd7c2d', range_construction='natural'))
        reg = registration(built)
        reg['cell_provenance'] = build_cell_provenance(man, CHECKSUM, unnarrowed_seats={canonical_bytes(built[0]): [pure]})
        self.assertEqual(reg['cell_provenance'][0]['unnarrowed_seats'], [pure])
        self.assertIs(verify_round_registration(reg, man, manifest_checksum=CHECKSUM), reg)
        only_check, checked = real_manifest(scenario('r:0:c', tree_lines=[[0, 0, 0, 0, 0, 0]], range_construction='natural'))
        for seats in ([pure], [{**pure, 'reason': 'assumed'}], [{**pure, 'seat': 'IP'}]):
            with self.subTest(seats=seats), self.assertRaises(ContractError):
                build_cell_provenance(only_check, CHECKSUM, unnarrowed_seats={canonical_bytes(checked[0]): seats})

    def test_missing_mismatched_and_forced_registration_provenance_is_refused(self):
        man, built = real_manifest(scenario(range_construction='root'),
                                   scenario(FORCED_NODE, 'AsKd7c2d', range_construction='natural'))
        good = build_cell_provenance(man, CHECKSUM)
        if canonical_bytes(good[0]['cell']) != canonical_bytes(built[0]):
            good.reverse()
        cases = [
            ('no range provenance', lambda r: r.pop('cell_provenance')),
            ('no range provenance', lambda r: r.__setitem__('cell_provenance', good[:1])),
            ('does not cover exactly the registered cells', lambda r: r.__setitem__('cell_provenance', [good[0], good[0]])),
            ('range construction differs from its registration', lambda r: r.__setitem__(
                'cell_provenance', [good[0], {**good[1], 'range_construction': 'subgame'}])),
            ('never forced', lambda r: r.__setitem__(
                'cell_provenance', [good[0], {'cell': built[1], 'range_construction': 'forced'}])),
            ('never forced', lambda r: r.__setitem__('cell_provenance', [good[0], {'cell': built[1]}])),
        ]
        for index, (message, mutate) in enumerate(cases):
            reg = registration(copy.deepcopy(built))
            reg['cell_provenance'] = copy.deepcopy(good)
            mutate(reg)
            with self.subTest(case=index), self.assertRaises(ContractError) as caught:
                verify_round_registration(reg, man, manifest_checksum=CHECKSUM)
            self.assertIn(message, str(caught.exception))


# ---------------------------------------------------------------------------
# Cell contract v3 (2026-11-13). The turn/river pilot's tree (W10/pilot,
# tree_lines sha256 7e743571...): BB v BTN single-raised pot, 600-chip root
# pot, 20,000-chip stacks (200 bb), flop bets 0.75 and 1.5 pot, a 3x raise,
# turn and river 0.75 pot, all-ins. Under v2 its turn and river cells collide
# (the 0.75 and 1.5 flop lines share one key); under v3 every decision node is
# its own cell.
PILOT_TREE_LINES = [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 450, 450],
    [0, 0, 0, 0, 0, 450, 20000, 20000],
    [0, 0, 0, 0, 450, 450],
    [0, 0, 0, 0, 450, 20000, 20000],
    [0, 0, 0, 450, 450, 450, 450],
    [0, 0, 0, 450, 450, 450, 1575, 1575],
    [0, 0, 0, 450, 450, 450, 1575, 20000, 20000],
    [0, 0, 0, 450, 450, 1575, 1575],
    [0, 0, 0, 450, 450, 1575, 20000, 20000],
    [0, 0, 0, 450, 20000, 20000],
    [0, 0, 450, 450, 450, 450],
    [0, 0, 450, 450, 450, 1575, 1575],
    [0, 0, 450, 450, 450, 1575, 20000, 20000],
    [0, 0, 450, 450, 1575, 1575],
    [0, 0, 450, 450, 1575, 20000, 20000],
    [0, 0, 450, 20000, 20000],
    [0, 450, 450, 450, 450, 450, 450],
    [0, 450, 450, 450, 450, 450, 1575, 1575],
    [0, 450, 450, 450, 450, 450, 1575, 20000, 20000],
    [0, 450, 450, 450, 450, 1575, 1575],
    [0, 450, 450, 450, 450, 1575, 20000, 20000],
    [0, 450, 450, 450, 1575, 1575, 1575, 1575],
    [0, 450, 450, 450, 1575, 1575, 1575, 4387, 4387],
    [0, 450, 450, 450, 1575, 1575, 1575, 4387, 20000, 20000],
    [0, 450, 450, 450, 1575, 1575, 4387, 4387],
    [0, 450, 450, 450, 1575, 1575, 4387, 20000, 20000],
    [0, 450, 450, 450, 1575, 20000, 20000],
    [0, 450, 450, 1575, 1575, 1575, 1575],
    [0, 450, 450, 1575, 1575, 1575, 4387, 4387],
    [0, 450, 450, 1575, 1575, 1575, 4387, 20000, 20000],
    [0, 450, 450, 1575, 1575, 4387, 4387],
    [0, 450, 450, 1575, 1575, 4387, 20000, 20000],
    [0, 450, 450, 1575, 20000, 20000],
    [0, 450, 1350, 1350, 1350, 1350, 1350, 1350],
    [0, 450, 1350, 1350, 1350, 1350, 1350, 3825, 3825],
    [0, 450, 1350, 1350, 1350, 1350, 1350, 3825, 20000, 20000],
    [0, 450, 1350, 1350, 1350, 1350, 3825, 3825],
    [0, 450, 1350, 1350, 1350, 1350, 3825, 20000, 20000],
    [0, 450, 1350, 1350, 1350, 3825, 3825, 3825, 3825],
    [0, 450, 1350, 1350, 1350, 3825, 3825, 3825, 20000, 20000],
    [0, 450, 1350, 1350, 1350, 3825, 3825, 20000, 20000],
    [0, 450, 1350, 1350, 1350, 3825, 20000, 20000],
    [0, 450, 1350, 1350, 3825, 3825, 3825, 3825],
    [0, 450, 1350, 1350, 3825, 3825, 3825, 20000, 20000],
    [0, 450, 1350, 1350, 3825, 3825, 20000, 20000],
    [0, 450, 1350, 1350, 3825, 20000, 20000],
    [0, 450, 1350, 20000, 20000],
    [0, 900, 900, 900, 900, 900, 900],
    [0, 900, 900, 900, 900, 900, 2700, 2700],
    [0, 900, 900, 900, 900, 900, 2700, 20000, 20000],
    [0, 900, 900, 900, 900, 2700, 2700],
    [0, 900, 900, 900, 900, 2700, 20000, 20000],
    [0, 900, 900, 900, 2700, 2700, 2700, 2700],
    [0, 900, 900, 900, 2700, 2700, 2700, 7200, 7200],
    [0, 900, 900, 900, 2700, 2700, 2700, 7200, 20000, 20000],
    [0, 900, 900, 900, 2700, 2700, 7200, 7200],
    [0, 900, 900, 900, 2700, 2700, 7200, 20000, 20000],
    [0, 900, 900, 900, 2700, 20000, 20000],
    [0, 900, 900, 2700, 2700, 2700, 2700],
    [0, 900, 900, 2700, 2700, 2700, 7200, 7200],
    [0, 900, 900, 2700, 2700, 2700, 7200, 20000, 20000],
    [0, 900, 900, 2700, 2700, 7200, 7200],
    [0, 900, 900, 2700, 2700, 7200, 20000, 20000],
    [0, 900, 900, 2700, 20000, 20000],
]


def pilot_scenario(cell_contract='v3', depth=200, **extra):
    value = {'scenario_id': 'pilot.v3', 'game_family': 'cash', 'objective': 'cash_ev', 'utility_context': 'cash_ev',
             'table_size': 6, 'pot_type': 'srp', 'oop_position': 'BB', 'ip_position': 'BTN', 'depth_bucket': depth,
             'preflop_aggressor_solver_player': 1, 'flop_board': 'Kh9c9h', 'pot_chips': 600,
             'effective_stack_chips': depth * 100, 'chips_per_bb': 100, 'rake': [0.1, 250], 'icm_model_id': None,
             'oop_range_path': 'ranges/oop.txt', 'oop_range_checksum': 'a' * 64, 'ip_range_path': 'ranges/ip.txt',
             'ip_range_checksum': 'b' * 64, 'tree_lines': PILOT_TREE_LINES, 'solve_accuracy': 0.001,
             'range_construction': 'natural', 'targets': []}
    if cell_contract is not None:
        value['cell_contract'] = cell_contract
    value.update(extra)
    return value


def tree_decision_nodes(lines, cards=('5c', 'Jd'), stack=20000):
    """Every node of the tree at which the actor has two or more actions, as Pio paths (one fixed runout)."""
    options, paths = {}, {}
    for line in lines:
        path, spent, actor, street, wager, checked = ['r', '0'], [0, 0], 0, 0, False, False
        for index, value in enumerate(line):
            prefix = tuple(line[:index])
            options.setdefault(prefix, set()).add(value)
            paths[prefix] = (':'.join(path), wager)
            if value > max(spent):  # bet or raise (Pio tokens are chips since the root)
                path.append(f'b{value}')
                wager, checked, closes = True, False, False
            else:  # check or call
                path.append('c')
                closes, checked = wager or checked, not wager
            spent[actor] = value
            actor = 1 - actor
            if closes:
                wager, checked, actor = False, False, 0
                if street < 2 and min(spent) < stack:
                    path.append(cards[street])
                    street += 1
    # A decision: two or more tree actions, or a wager to answer (call and fold).
    return sorted({paths[prefix][0] for prefix, nexts in options.items() if len(nexts) >= 2 or paths[prefix][1]})


def targets_for(scenario_value, nodes):
    from pio_upi import scenario_cell_contract
    out = []
    for index, node in enumerate(nodes):
        line = analyze_node(node, root_pot_chips=scenario_value['pot_chips'],
                            effective_stack_chips=scenario_value['effective_stack_chips'],
                            preflop_aggressor=1, cell_contract=scenario_cell_contract(scenario_value))
        cards = [t for t in node.split(':') if len(t) == 2 and t[1] in 'cdhs']
        out.append({'target_id': f'pilot.{index}', 'machine_id': 'M1', 'node': node,
                    'board': scenario_value['flop_board'] + ''.join(cards), 'node_role': line.node_role,
                    'facing_kind': line.facing_kind, 'facing_size_bucket': line.facing_size_bucket,
                    'expected_children': ['c', 'f'] if line.wager_active else ['b1', 'c']})
    return out


def multi_manifest(value):
    built = [target_context(value, target) for target in value['targets']]
    return {'dataset_key': 'horse-r9', 'scenarios': [value], 'public215_contexts': [{'context': c} for c in built]}, built


REGISTRATION_KEYS_V2 = ('street', 'game_family', 'objective', 'utility_context', 'table_size', 'pot_type',
                        'hero_position', 'opponent_position', 'depth_bucket', 'texture_class', 'node_role',
                        'facing_kind', 'facing_size_bucket')


class CellContractV3Tests(unittest.TestCase):
    """v3 is dormant: only a scenario that declares cell_contract v3 uses it; every v2 answer is unchanged."""

    def load(self, value):
        return _validate_scenario(value, 0, Path('.'), {}, {}, False)

    def test_v2_is_unchanged_without_the_declaration(self):
        from pio_upi import PioError
        with self.assertRaises(PioError):
            analyze_node('r:0', root_pot_chips=600, effective_stack_chips=20000, preflop_aggressor=1)
        with self.assertRaises(PioError):
            analyze_node('r:0:c:b450:c:5c', root_pot_chips=600, effective_stack_chips=20000, preflop_aggressor=1)
        self.assertEqual(analyze_node('r:0', root_pot_chips=100, effective_stack_chips=1000, preflop_aggressor=None).node_role, 'open')
        self.assertEqual(sorted(target_context(scenario(), scenario()['targets'][0])), sorted(REGISTRATION_KEYS_V2))
        # a v2 scenario still refuses 200 bb; an unknown contract is refused
        v2 = pilot_scenario(cell_contract=None)
        v2['targets'] = targets_for(v2, ['r:0:c'])
        with self.assertRaises(ContractError):
            self.load(v2)
        with self.assertRaises(ContractError):
            self.load({**v2, 'cell_contract': 'v4'})

    def test_the_flop_root_lead_is_a_donk_root_node_with_empty_history(self):
        from pio_upi import PioError
        line = analyze_node('r:0', root_pot_chips=600, effective_stack_chips=20000, preflop_aggressor=1, cell_contract='v3')
        self.assertEqual((line.node_role, line.actor, line.facing_kind, line.facing_size_bucket), ('donk', 0, 'none', 'none'))
        turn_lead = analyze_node('r:0:c:b450:c:5c', root_pot_chips=600, effective_stack_chips=20000, preflop_aggressor=1, cell_contract='v3')
        self.assertEqual(turn_lead.node_role, 'donk')
        with self.assertRaises(PioError):
            analyze_node('r:0', root_pot_chips=600, effective_stack_chips=20000, preflop_aggressor=1, cell_contract='v2')
        # a root target in a tree where the OOP player may lead: root construction, empty public history
        lead_tree = [[0, 0, 0, 0, 0, 0], [450, 450, 450, 450, 450, 450], *PILOT_TREE_LINES[1:]]
        value = pilot_scenario(range_construction='root', tree_lines=lead_tree)
        value['targets'] = targets_for(value, ['r:0'])
        self.load(value)
        man, built = multi_manifest(value)
        [entry] = build_cell_provenance(man, CHECKSUM)
        self.assertEqual(entry['public_history'], [])
        self.assertEqual(entry['range_construction'], 'root')
        self.assertEqual((entry['cell']['node_role'], entry['cell']['line_class'], entry['cell']['cell_contract']), ('donk', '', 'v3'))
        self.assertEqual((entry['game']['depth_bucket'], entry['game']['effective_stack_chips']), (200, 20000))
        reg = registration(built)
        reg['cell_provenance'] = build_cell_provenance(man, CHECKSUM)
        self.assertIs(verify_round_registration(reg, man, manifest_checksum=CHECKSUM), reg)

    def test_line_class_names_every_action_by_size_bucket(self):
        from pio_upi import PioError, line_class_v3
        cls = lambda node: line_class_v3(node, root_pot_chips=600, effective_stack_chips=20000)
        self.assertEqual(cls('r:0'), '')
        self.assertEqual(cls('r:0:c'), 'x')
        self.assertEqual(cls('r:0:c:b450'), 'x.b-mid')
        self.assertEqual(cls('r:0:c:b900'), 'x.b-big')
        self.assertEqual(cls('r:0:c:b200'), 'x.b-small')
        self.assertEqual(cls('r:0:c:b450:b1350'), 'x.b-mid.r-mid')
        self.assertEqual(cls('r:0:c:b450:b20000'), 'x.b-mid.a')
        self.assertEqual(cls('r:0:c:b450:c:5c:c'), 'x.b-mid.c/x')
        self.assertEqual(cls('r:0:c:b900:c:5c:c:b2700:c:Jd:c'), 'x.b-big.c/x.b-mid.c/x')
        self.assertEqual(cls('r:0:c:b450:c:5c:c:b1575:c:Jd:c:b4387'), 'x.b-mid.c/x.b-mid.c/x.b-mid')
        for bad in ('r:1', 'r:0:f', 'r:0:q', 'r:0:b20001'):
            with self.subTest(node=bad), self.assertRaises(PioError):
                cls(bad)

    def test_line_class_names_the_public_history_the_database_checks(self):
        # Club Arena fn_gto_v31_cell_provenance_error compares line_class, sizes removed, with the families of
        # public_history (x check, c call, b bet, r raise, a all_in), street by street.
        from contract import scenario_public_history
        families = {'check': 'x', 'call': 'c', 'bet': 'b', 'raise': 'r', 'all_in': 'a'}
        value = pilot_scenario()
        value['targets'] = targets_for(value, tree_decision_nodes(PILOT_TREE_LINES))
        for target in value['targets']:
            cell = target_context(value, target)
            history = scenario_public_history(value, target)
            streets = ('flop', 'turn', 'river')[:('flop', 'turn', 'river').index(cell['street']) + 1]
            named = '/'.join('.'.join(families[s['family']] for s in history if s['street'] == street) for street in streets)
            self.assertEqual(named, re.sub(r'-(small|mid|big)', '', cell['line_class']), target['node'])

    def test_the_pilot_tree_has_no_key_collision_under_v3_and_collides_under_v2(self):
        from pio_upi import PioError
        nodes = tree_decision_nodes(PILOT_TREE_LINES)
        self.assertNotIn('r:0', nodes)  # OOP only checks at the root of this tree
        self.assertEqual(len(nodes), 97)
        v3 = pilot_scenario()
        v3['targets'] = targets_for(v3, nodes)
        self.load(v3)  # 200 bb, every decision node, the 65-line tree: a valid v3 scenario
        man, built = multi_manifest(v3)
        self.assertEqual(len({canonical_bytes(c) for c in built}), len(nodes))
        provenance = build_cell_provenance(man, CHECKSUM)  # refuses any cell with two public histories
        self.assertEqual(len(provenance), len(nodes))
        self.assertTrue(all(e['cell']['cell_contract'] == 'v3' and e['game']['depth_bucket'] == 200 for e in provenance))
        self.assertEqual(sum(cell_composition(built).values()), len(nodes))
        # v2 cannot key a lead into the previous street's aggressor at all (the tree's OOP turn and river leads).
        keyable = []
        for node in nodes:
            try:
                analyze_node(node, root_pot_chips=600, effective_stack_chips=20000, preflop_aggressor=1)
                keyable.append(node)
            except PioError:
                pass
        donks = [t for t in v3['targets'] if t['node_role'] == 'donk']
        self.assertEqual((len(keyable), len(donks)), (86, 11))
        # The same nodes keyed by v2 collide: more than one line behind one key. (The pilot solved 200 bb
        # and the v2 engine serves it as bucket 150; target_context does not check the stack.)
        v2 = pilot_scenario(cell_contract=None, depth=150, effective_stack_chips=20000)
        v2['targets'] = targets_for(v2, keyable)
        lines = {}
        for target in v2['targets']:
            actions = tuple(t for t in target['node'].split(':')[2:] if not (len(t) == 2 and t[1] in 'cdhs'))
            lines.setdefault(canonical_bytes(target_context(v2, target)), set()).add(actions)
        colliding = [v for v in lines.values() if len(v) > 1]
        self.assertEqual((len(lines), len(colliding), sum(len(v) for v in colliding)), (25, 13, 74))
        with self.assertRaises(ContractError) as caught:
            build_cell_provenance(multi_manifest(v2)[0], CHECKSUM)
        self.assertIn('two different provenances', str(caught.exception))

    def test_two_sizes_in_one_bucket_on_one_line_are_refused_not_merged(self):
        # 0.75 and 0.9 pot flop bets are both "mid": v3 keeps them in one cell, so the generator refuses the tree.
        tree = [[0, 450, 450, 450, 450, 450, 450], [0, 540, 540, 540, 540, 540, 540], [0, 0, 0, 0, 0, 0]]
        value = pilot_scenario(tree_lines=tree)
        value['targets'] = targets_for(value, ['r:0:c:b450:c:5c:c', 'r:0:c:b540:c:5c:c'])
        with self.assertRaises(ContractError) as caught:
            build_cell_provenance(multi_manifest(value)[0], CHECKSUM)
        self.assertIn('two different provenances', str(caught.exception))

    def test_registration_cells_are_all_v2_or_all_v3(self):
        v3 = pilot_scenario()
        v3['targets'] = targets_for(v3, ['r:0:c', 'r:0:c:b900'])
        _, built = multi_manifest(v3)
        self.assertEqual(cell_composition(built), {'flop': 2, 'turn': 0, 'river': 0})
        cell_set_checksum(built)
        bad = [
            [built[0], cell('flop', 'Brpd')],                                  # mixed contracts
            [{**built[0], 'cell_contract': 'v4'}],                             # unknown contract
            [{**built[0], 'line_class': 'x.b-huge'}],                          # malformed line
            [{**built[0], 'line_class': 'x/'}],                                # line street disagrees
            [{**built[0], 'depth_bucket': 300}],                               # unknown depth
            [{k: v for k, v in built[0].items() if k != 'line_class'}],        # missing key
        ]
        for index, cells_value in enumerate(bad):
            with self.subTest(case=index), self.assertRaises(ContractError):
                cell_composition(cells_value)
        self.assertEqual(cell_composition([cell('flop', 'Brpd')]), {'flop': 1, 'turn': 0, 'river': 0})

    def test_overbet_facing_cell_is_keyed_big(self):
        v3 = pilot_scenario()
        [target] = targets_for(v3, ['r:0:c:b900'])
        context = target_context(v3, target)
        self.assertEqual((context['node_role'], context['facing_kind'], context['facing_size_bucket'], context['line_class']),
                         ('facing_bet', 'bet', 'big', 'x.b-big'))



def _bucket_name(fraction):
    return 'small' if fraction < 0.6 else 'mid' if fraction < 1.1 else 'big'


def generated_tree(root_pot, stack, bets, raises):
    """Every line of a two-player tree (cumulative chips per action, the tree_lines format) and the bucketed
    public line each decision node must carry, written down independently while the tree is generated.

    Bets are fractions of the pot, raises fractions of the pot after the raiser calls; one raise per street;
    an all-in bet or raise is always offered; sizes reaching the stack are dropped (the all-in covers them)."""
    lines, expected = [], {}

    def walk(seq, path, street, actor, spent, start, target, wager, raised, checked, pot, names):
        expected[':'.join(path)] = '/'.join('.'.join(n) for n in names)
        moved = False

        def go(value, token, name, close, *state):
            nonlocal moved
            moved = True
            new_names = [list(n) for n in names]
            new_names[-1].append(name)
            if close:
                if street == 2 or min(state[0]) >= stack:
                    lines.append([*seq, value])
                    return
                new_names.append([])
                walk([*seq, value], [*path, token, ('5c', 'Jd')[street]], street + 1, 0, state[0], list(state[0]), 0,
                     False, False, False, state[1], new_names)
            else:
                walk([*seq, value], [*path, token], street, 1 - actor, *state, new_names)

        street_spent = spent[actor] - start[actor]
        if not wager:
            go(spent[actor], 'c', 'x', checked, *((spent, pot) if checked else (spent, start, 0, False, False, True, pot)))
            for amount, name in [*((round(f * pot), 'b-' + _bucket_name(f)) for f in bets), (stack - start[actor], 'a')]:
                cum = start[actor] + amount
                if cum > stack or (name != 'a' and cum >= stack):
                    continue
                s2 = list(spent)
                s2[actor] = cum
                go(cum, f'b{cum}', name, False, s2, start, amount, True, False, False, pot + amount)
            return
        to_call = target - street_spent
        s2 = list(spent)
        s2[actor] = start[actor] + target
        go(s2[actor], 'c', 'c', True, s2, pot + to_call)
        if raised or s2[actor] >= stack:
            return
        for to, name in [*((target + round(f * (pot + to_call)), 'r-' + _bucket_name(f)) for f in raises), (stack - start[actor], 'a')]:
            cum = start[actor] + to
            if cum > stack or (name != 'a' and cum >= stack):
                continue
            s3 = list(spent)
            s3[actor] = cum
            go(cum, f'b{cum}', name, False, s3, start, to, True, True, False, pot + (to - street_spent))

    walk([], ['r', '0'], 0, 0, [0, 0], [0, 0], 0, False, False, False, root_pot, [[]])
    return lines, expected


# The engine test (Club Arena GtoV31CellContractV3.test.ts) generates the same four trees.
GENERATED_TREES = (
    # root pot, stack (= depth x 100), preflop aggressor, bet fractions, raise fractions
    (600, 20000, 1, (0.33, 0.75, 1.5), (0.4,)),
    (1700, 15000, 0, (0.5, 1.0), (1.5,)),
    (600, 4000, 1, (0.25, 2.0), (0.8,)),
    (1000, 20000, 1, (0.33, 0.5), (0.75,)),  # 0.33 and 0.5 are both small: one cell, two histories
)


class GeneratedTreeCollisionTests(unittest.TestCase):
    """Review B5 m4: the v3 key is collision-free beyond the one pilot tree."""

    def test_generated_trees_key_every_decision_node_by_exactly_its_bucketed_line(self):
        from pio_upi import PioError, scenario_cell_contract
        counts = []
        for index, (pot, stack, aggressor, bets, raises) in enumerate(GENERATED_TREES):
            lines, expected = generated_tree(pot, stack, bets, raises)
            nodes = tree_decision_nodes(lines, stack=stack)
            self.assertEqual(set(nodes), set(expected), index)  # every generated node is a decision node
            value = pilot_scenario(depth=stack // 100, pot_chips=pot, effective_stack_chips=stack,
                                   preflop_aggressor_solver_player=aggressor, tree_lines=lines)
            key_to_line, line_to_key, v2 = {}, {}, {}
            targets = []
            for i, node in enumerate(nodes):
                line = analyze_node(node, root_pot_chips=pot, effective_stack_chips=stack, preflop_aggressor=aggressor,
                                    cell_contract=scenario_cell_contract(value))
                cards = [t for t in node.split(':') if len(t) == 2 and t[1] in 'cdhs']
                target = {'target_id': f'gen{index}.{i}', 'machine_id': 'M1', 'node': node,
                          'board': value['flop_board'] + ''.join(cards), 'node_role': line.node_role,
                          'facing_kind': line.facing_kind, 'facing_size_bucket': line.facing_size_bucket,
                          'expected_children': ['c', 'f'] if line.wager_active else ['b1', 'c']}
                targets.append(target)
                context = target_context(value, target)
                self.assertEqual(context['line_class'], expected[node], (index, node))
                key = canonical_bytes(context)
                street_line = (context['street'], expected[node])
                self.assertEqual(key_to_line.setdefault(key, street_line), street_line, (index, node))
                self.assertEqual(line_to_key.setdefault(street_line, key), key, (index, node))
                try:  # the same node under v2: no line in the key
                    old = analyze_node(node, root_pot_chips=pot, effective_stack_chips=stack, preflop_aggressor=aggressor)
                    v2.setdefault((context['street'], context['hero_position'], old.node_role, old.facing_kind,
                                   old.facing_size_bucket), set()).add(expected[node])
                except PioError:
                    pass
            self.assertTrue(any(len(v) > 1 for v in v2.values()), index)
            counts.append((len(nodes), len(key_to_line), len(v2)))
            if index < 3:
                self.assertEqual(len(key_to_line), len(nodes), index)
            else:
                self.assertLess(len(key_to_line), len(nodes))
            if index in (1, 2, 3):  # build_cell_provenance re-derives every history from the tree (slow on tree 0)
                value['targets'] = targets
                man = multi_manifest(value)[0]
                if index < 3:
                    self.assertEqual(len(build_cell_provenance(man, CHECKSUM)), len(nodes))
                else:
                    with self.assertRaises(ContractError) as caught:
                        build_cell_provenance(man, CHECKSUM)
                    self.assertIn('two different provenances', str(caught.exception))
        # the same node, key and v2-key counts as the engine test on these trees
        self.assertEqual(counts, [(3410, 3410, 43), (484, 484, 37), (436, 436, 37), (1264, 302, 31)])


class FeatureAndCellContractCouplingTests(unittest.TestCase):
    """Review B5 M1: feature contract holdem-public-hist215-v3 iff cell contract v3, on the pipeline side."""

    def test_the_rule_both_ways(self):
        from contract import require_feature_and_cell_contracts_agree as agree
        agree('holdem-public-hist215-v3', ['v3', 'v3'])
        agree('holdem-public-hist215-v2', [None, None])
        agree('holdem-public-hist215-v1', [None])
        agree('rank-suit-count-v1', ['v3'])  # matrix contracts carry no public215 encoder
        agree(None, [None, 'v3'])
        for feature, cells in (('holdem-public-hist215-v3', [None]), ('holdem-public-hist215-v3', ['v3', None]),
                               ('holdem-public-hist215-v3', []), ('holdem-public-hist215-v3', ['v4']),
                               ('holdem-public-hist215-v2', ['v3']), ('holdem-public-hist215-v1', [None, 'v3'])):
            with self.subTest(feature=feature, cells=cells), self.assertRaises(ContractError):
                agree(feature, cells)

    def v3_manifest(self, feature=None):
        value = pilot_scenario()
        value['targets'] = targets_for(value, ['r:0:c', 'r:0:c:b900'])
        man, built = multi_manifest(value)
        if feature:
            man['feature_contract_version'] = feature
        return man, built

    def v2_manifest(self, feature=None):
        value = pilot_scenario(cell_contract=None, depth=150, effective_stack_chips=15000)
        value['targets'] = targets_for(value, ['r:0:c', 'r:0:c:b450'])
        man, built = multi_manifest(value)
        if feature:
            man['feature_contract_version'] = feature
        return man, built

    def test_provenance_and_registration_refuse_both_mismatch_directions(self):
        # matched pairs pass
        for man, built in (self.v3_manifest('holdem-public-hist215-v3'), self.v2_manifest('holdem-public-hist215-v2'),
                           self.v2_manifest('holdem-public-hist215-v1'), self.v3_manifest(), self.v2_manifest()):
            reg = registration(built)
            reg['cell_provenance'] = build_cell_provenance(man, CHECKSUM)
            self.assertIs(verify_round_registration(reg, man, manifest_checksum=CHECKSUM), reg)
        good_v3, built_v3 = self.v3_manifest('holdem-public-hist215-v3')
        reg_v3 = registration(built_v3)
        reg_v3['cell_provenance'] = build_cell_provenance(good_v3, CHECKSUM)
        # direction 1: old cell keys claim the v3 feature format
        bad, _ = self.v2_manifest('holdem-public-hist215-v3')
        with self.assertRaises(ContractError) as caught:
            build_cell_provenance(bad, CHECKSUM)
        self.assertIn('requires cell contract v3', str(caught.exception))
        # direction 2: v3 cells claim an older public215 feature format
        for feature in ('holdem-public-hist215-v1', 'holdem-public-hist215-v2'):
            bad, _ = self.v3_manifest(feature)
            with self.subTest(feature=feature):
                with self.assertRaises(ContractError) as caught:
                    build_cell_provenance(bad, CHECKSUM)
                self.assertIn('requires feature contract holdem-public-hist215-v3', str(caught.exception))
                with self.assertRaises(ContractError) as caught:
                    verify_round_registration(reg_v3, {**good_v3, 'feature_contract_version': feature}, manifest_checksum=CHECKSUM)
                self.assertIn('requires feature contract holdem-public-hist215-v3', str(caught.exception))

    def test_load_manifest_refuses_both_mismatch_directions_first(self):
        import hashlib, json, tempfile
        from contract import ROOT_KEYS, load_manifest
        v3 = pilot_scenario()
        v2 = pilot_scenario(cell_contract=None, depth=150, effective_stack_chips=15000)

        def load(feature, scenarios):
            value = {**{k: None for k in ROOT_KEYS}, 'feature_contract_version': feature, 'scenarios': scenarios}
            with tempfile.TemporaryDirectory() as root:
                path = Path(root) / 'manifest.json'
                path.write_bytes(json.dumps(value).encode())
                load_manifest(path, expected_checksum=hashlib.sha256(path.read_bytes()).hexdigest(), input_root=root,
                              pipeline_root=root, require_enabled=False, verify_inputs=False, verify_pipeline=False)

        for feature, scenarios, refused in (('holdem-public-hist215-v3', [v2], 'requires cell contract v3'),
                                            ('holdem-public-hist215-v3', [v3, v2], 'requires cell contract v3'),
                                            ('holdem-public-hist215-v2', [v3], 'requires feature contract holdem-public-hist215-v3'),
                                            ('holdem-public-hist215-v1', [v2, v3], 'requires feature contract holdem-public-hist215-v3'),
                                            ('holdem-public-hist215-v3', [v3], None), ('holdem-public-hist215-v2', [v2], None)):
            with self.subTest(feature=feature, n=len(scenarios)), self.assertRaises(ContractError) as caught:
                load(feature, scenarios)
            # the matched pairs pass the coupling and fail later on this skeleton manifest, for another reason
            self.assertEqual(refused is not None and refused in str(caught.exception), refused is not None, str(caught.exception))


if __name__ == '__main__':
    unittest.main()
