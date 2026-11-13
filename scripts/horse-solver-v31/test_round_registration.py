"""Round registration binding (Club Arena migrations 20261110213931 and 20261112185251).

Synthetic contexts only; no gateway, database, solver or label.
"""
import copy
from pathlib import Path
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


if __name__ == '__main__':
    unittest.main()
