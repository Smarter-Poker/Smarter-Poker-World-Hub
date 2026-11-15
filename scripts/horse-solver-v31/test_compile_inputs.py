import json
from pathlib import Path
import tempfile
import unittest

from compile_inputs import (ContractError, RECIPE_CONTRACT, SNAPSHOT_CONTRACT,
                            compile_model, compile_recipe, encoded, exact_icm, range_weight_text, sha)
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

    def test_range_weights_are_written_exactly_on_the_public215_grid(self):
        for value, text in [(0.0601, "0.0601"), (0.1227, "0.1227"), (1.0, "1"), (0.0, "0"), (0.5, "0.5"),
                            (0.0057, "0.0057"), (0.123456789012, "0.123456789012")]:
            self.assertEqual(range_weight_text(value), text)
        for bad in (1e-13, 0.1234567890123, 1.5, -0.25):
            with self.assertRaises(ContractError):
                range_weight_text(bad)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            order_bytes = " ".join(canonical_hand_order_tokens()).encode()
            range_bytes = ("0.0601 0.0057 0.1227 " + "0 " * 1323).encode()
            (root / "order.txt").write_bytes(order_bytes)
            (root / "range.txt").write_bytes(range_bytes)
            provenance = {"origin": "authored_reviewed", "source_reference": "fixture:4-decimal-measured-weights",
                          "game_family": "cash", "table_size": 6, "depth_bucket": 80, "pot_type": "srp",
                          "player_position": "BB", "action_line": "BTN raise BB call", "reviewed_by": "unit-test"}
            recipe = {"contract": RECIPE_CONTRACT, "ranges": [{"id": "range", "path": "range.txt",
                      "checksum": sha(range_bytes), "order_path": "order.txt", "order_checksum": sha(order_bytes),
                      "provenance": provenance}], "models": []}
            (root / "recipe.json").write_bytes(encoded(recipe))
            compile_recipe(root / "recipe.json", root, root / "out")
            self.assertEqual((root / "out/ranges/range.txt").read_text().split()[:4], ["0.0601", "0.0057", "0.1227", "0"])


def fixture_recipe(root, depth_bucket):
    """One deterministic range recipe (fixed bytes, so the compiled receipt is a fixed digest)."""
    order = list(reversed(canonical_hand_order_tokens()))
    order_bytes = " ".join(order).encode()
    range_bytes = ("1 " + "0.25 " * 1325).encode()
    (root / "order.txt").write_bytes(order_bytes)
    (root / "range.txt").write_bytes(range_bytes)
    provenance = {"origin": "authored_reviewed", "source_reference": "fixture:contract-v3-depth",
                  "game_family": "cash", "table_size": 6, "depth_bucket": depth_bucket,
                  "pot_type": "srp", "player_position": "BB", "action_line": "BTN raise BB call",
                  "reviewed_by": "unit-test"}
    recipe = {"contract": RECIPE_CONTRACT, "ranges": [{"id": "range", "path": "range.txt",
              "checksum": sha(range_bytes), "order_path": "order.txt", "order_checksum": sha(order_bytes),
              "provenance": provenance}], "models": []}
    (root / "recipe.json").write_bytes(encoded(recipe))
    return root / "recipe.json"


# The v2 compile of fixture_recipe(depth 150), measured on origin/main 3085ffb50e
# before cell contract v3 reached the compiler (receipt bytes, then the file).
V2_RECEIPT_CHECKSUM_ON_MAIN = "eac71c90856f9139e14883fd6ef227e9d3b88e746aacca4b7d7ef164affd554e"


class CellContractV3RangeDepthTests(unittest.TestCase):
    """Cell contract v3 (dormant): 200 bb range provenance only when explicitly requested."""

    def test_default_v2_compile_is_byte_identical_to_main(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            recipe = fixture_recipe(root, 150)
            result = compile_recipe(recipe, root, root / "out")
            receipt = (root / "out/derivation-receipt.json").read_bytes()
            self.assertEqual(sha(receipt), V2_RECEIPT_CHECKSUM_ON_MAIN)
            self.assertEqual(result["receipt_checksum"], V2_RECEIPT_CHECKSUM_ON_MAIN)
            self.assertNotIn("cell_contract", json.loads(receipt))

    def test_depth_200_is_refused_unless_v3_is_requested(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            recipe = fixture_recipe(root, 200)
            with self.assertRaises(ContractError):
                compile_recipe(recipe, root, root / "v2")
            self.assertFalse((root / "v2").exists())
            for depth in (150, 200):  # an unknown request is refused even for a depth v2 admits
                recipe = fixture_recipe(root, depth)
                for bad in ("v2", "v4", "V3", True, ""):
                    with self.subTest(depth=depth, cell_contract=bad), self.assertRaises(ContractError):
                        compile_recipe(recipe, root, root / "bad", cell_contract=bad)
                self.assertFalse((root / "bad").exists())
            compile_recipe(recipe, root, root / "v3", cell_contract="v3")
            receipt = json.loads((root / "v3/derivation-receipt.json").read_bytes())
            self.assertEqual(receipt["cell_contract"], "v3")
            self.assertEqual(receipt["derivations"][0]["provenance"]["depth_bucket"], 200)
            self.assertIs(receipt["approved"], False)

    def test_v3_keeps_every_v2_depth_and_still_refuses_unknown_depths(self):
        from compile_inputs import DEPTH_BUCKETS_V2, DEPTH_BUCKETS_V3
        from pio_upi import V3_DEPTH_BUCKETS
        # the same depth sets the scenario validator and the registration guard use
        self.assertEqual(set(DEPTH_BUCKETS_V3), set(V3_DEPTH_BUCKETS))
        self.assertEqual(set(DEPTH_BUCKETS_V3) - set(DEPTH_BUCKETS_V2), {200})
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for depth in (*DEPTH_BUCKETS_V2, 200):
                compile_recipe(fixture_recipe(root, depth), root, root / f"ok{depth}", cell_contract="v3")
            for depth in (100, 173, 250, 400, 0):
                with self.subTest(depth=depth), self.assertRaises(ContractError):
                    compile_recipe(fixture_recipe(root, depth), root, root / f"no{depth}", cell_contract="v3")


if __name__ == "__main__":
    unittest.main()
