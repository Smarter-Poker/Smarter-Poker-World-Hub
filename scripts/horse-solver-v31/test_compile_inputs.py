import json
from pathlib import Path
import tempfile
import unittest

from compile_inputs import (ContractError, RECIPE_CONTRACT, SNAPSHOT_CONTRACT,
                            compile_model, compile_recipe, encoded, exact_icm, sha)
from contract import canonical_hand_order_tokens


class InputCompilerTests(unittest.TestCase):
    def test_exact_icm_matches_independent_three_player_finish_enumeration(self):
        # Player 0 wins first 1/6, second 1/3*(1/4)+1/2*(1/3)=1/4.
        self.assertAlmostEqual(exact_icm([1, 2, 3], [80, 20], 0), 80 / 6 + 20 / 4)
        self.assertEqual(exact_icm([0, 2, 3], [80, 20], 0), 0)
        self.assertEqual(exact_icm([0, 2, 3], [80, 12, 8], 0), 8)
        self.assertAlmostEqual(sum(exact_icm([0, 2, 3], [80, 12, 8], hero) for hero in range(3)), 100)
        self.assertAlmostEqual(sum(exact_icm([1, 2, 3], [80, 20], hero) for hero in range(3)), 100)

    def test_root_pot_added_once_and_reachable_endpoint_evaluated(self):
        snapshot = {"contract": SNAPSHOT_CONTRACT, "utility_unit": "payout",
                    "field_stacks_chips": [2, 3, 4], "payouts": [80, 20],
                    "oop_index": 0, "ip_index": 1, "root_pot_chips": 1}
        model = compile_model("test", snapshot, "sources/test.json", "a" * 64)
        oop = [point for point in model["points"] if point["player"] == "OOP"]
        self.assertEqual([point["stack_chips"] for point in oop], list(range(6)))
        self.assertAlmostEqual(oop[-1]["utility"], exact_icm([5, 1, 4], [80, 20], 0))
        self.assertEqual(oop[0]["utility"], 0)

    def test_invalid_payout_and_field_inputs_refused(self):
        base = {"contract": SNAPSHOT_CONTRACT, "utility_unit": "payout",
                "field_stacks_chips": [2, 3], "payouts": [80, 20],
                "oop_index": 0, "ip_index": 1, "root_pot_chips": 1}
        for change in ({"payouts": [20, 80]}, {"field_stacks_chips": [1] * 11},
                       {"ip_index": 0}, {"root_pot_chips": -1}, {"utility_unit": "bb"}):
            with self.subTest(change=change), self.assertRaises(ContractError):
                compile_model("test", {**base, **change}, "source.json", "a" * 64)

    def test_remapping_hash_preservation_determinism_and_write_once(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            order = list(reversed(canonical_hand_order_tokens()))
            order_bytes = " ".join(order).encode()
            range_bytes = ("1 " + "0 " * 1325).encode()
            (root / "order.txt").write_bytes(order_bytes)
            (root / "range.txt").write_bytes(range_bytes)
            provenance = {"origin": "authored_reviewed", "source_reference": "fixture:explicit-spot",
                          "game_family": "cash", "table_size": 2, "depth_bucket": 10,
                          "pot_type": "srp", "player_position": "SB", "action_line": "SB raise BB call",
                          "reviewed_by": "unit-test"}
            recipe = {"contract": RECIPE_CONTRACT, "ranges": [{"id": "range", "path": "range.txt",
                      "checksum": sha(range_bytes), "order_path": "order.txt", "order_checksum": sha(order_bytes),
                      "provenance": provenance}], "models": []}
            recipe_path = root / "recipe.json"
            recipe_path.write_bytes(encoded(recipe))
            first = compile_recipe(recipe_path, root, root / "one")
            second = compile_recipe(recipe_path, root, root / "two")
            self.assertEqual(first, second)
            weights = (root / "one/ranges/range.txt").read_text().split()
            self.assertEqual(weights[-1], "1")
            self.assertTrue(all(value == "0" for value in weights[:-1]))
            self.assertEqual((root / "one/sources/ranges/range.source").read_bytes(), range_bytes)
            with self.assertRaises(FileExistsError):
                compile_recipe(recipe_path, root, root / "one")
            recipe["ranges"][0]["provenance"]["depth_bucket"] = 100
            recipe_path.write_bytes(encoded(recipe))
            with self.assertRaises(ContractError):
                compile_recipe(recipe_path, root, root / "three")
            self.assertFalse((root / "three").exists())
            recipe["ranges"][0]["provenance"]["depth_bucket"] = 10
            recipe["ranges"][0]["checksum"] = "0" * 64
            recipe_path.write_bytes(encoded(recipe))
            with self.assertRaises(ContractError):
                compile_recipe(recipe_path, root, root / "four")


if __name__ == "__main__":
    unittest.main()
