"""Round registration binding (Club Arena migration 20261110213931).

Synthetic contexts only; no gateway, database, solver or label.
"""
import copy
import unittest

from contract import ContractError
from public_hist215 import cell_composition, cell_set_checksum, verify_round_registration


def cell(street, texture, role='barrel', table_size=2):
    return {'street': street, 'game_family': 'cash', 'objective': 'cash_ev', 'utility_context': 'cash_ev',
            'table_size': table_size, 'pot_type': 'srp', 'hero_position': 'SB', 'opponent_position': 'BB',
            'depth_bucket': 80, 'texture_class': texture, 'node_role': role, 'facing_kind': 'none',
            'facing_size_bucket': 'none'}


def cells(flop, turn, river, salt=''):
    return ([cell('flop', f'F{salt}{i}') for i in range(flop)] + [cell('turn', f'T{salt}{i}') for i in range(turn)]
            + [cell('river', f'R{salt}{i}') for i in range(river)])


def registration(planned):
    return {'round_key': 'r9', 'dataset_key': 'horse-r9', 'composition': cell_composition(planned),
            'cells': planned, 'cell_set_checksum': cell_set_checksum(planned)}


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
        self.assertIs(verify_round_registration(registration(planned), manifest(list(reversed(planned)))) is not None, True)

    def test_the_r8_deviation_is_refused_with_both_compositions(self):
        with self.assertRaises(ContractError) as caught:
            verify_round_registration(registration(cells(70, 23, 7)), manifest(cells(0, 67, 33)))
        message = str(caught.exception)
        self.assertIn('registered 70 flop / 23 turn / 7 river', message)
        self.assertIn('manifest 0 flop / 67 turn / 33 river', message)

    def test_a_substituted_cell_of_the_same_street_is_refused(self):
        planned = cells(30, 50, 20)
        built = planned[:-1] + [cell('river', 'Zswap')]
        with self.assertRaises(ContractError):
            verify_round_registration(registration(planned), manifest(built))

    def test_a_missing_or_extra_cell_is_refused(self):
        planned = cells(30, 50, 20)
        for built in (planned[:-1], planned + [cell('turn', 'Zextra')]):
            with self.assertRaises(ContractError):
                verify_round_registration(registration(planned), manifest(built))

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
                verify_round_registration(reg, manifest(planned))


if __name__ == '__main__':
    unittest.main()
