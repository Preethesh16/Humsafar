import unittest

from humsafar.money import split_proportionally, to_paise, to_rupees


class ToPaiseTest(unittest.TestCase):
    def test_converts_common_amounts(self):
        self.assertEqual(to_paise(30000), 3_000_000)
        self.assertEqual(to_paise("199.99"), 19_999)
        self.assertEqual(to_paise(0), 0)

    def test_float_input_does_not_lose_a_paisa(self):
        # The reason this module exists: 199.99 * 100 is 19998.999... in binary
        # floating point, and int() of that is 19998 — a paisa gone.
        self.assertEqual(to_paise(199.99), 19_999)

    def test_rejects_sub_paisa_amounts(self):
        with self.assertRaises(ValueError):
            to_paise("10.001")

    def test_rejects_nonsense(self):
        for bad in ("abc", None, "nan", "inf"):
            with self.assertRaises(ValueError):
                to_paise(bad)


class ToRupeesTest(unittest.TestCase):
    def test_round_trip(self):
        for rupees in ("0.01", "1234.56", "30000.00"):
            self.assertEqual(to_rupees(to_paise(rupees)), float(rupees))

    def test_always_two_decimals_or_fewer(self):
        # scopedCardService rejects an amountCap with more than two decimals.
        for paise in range(0, 5000, 7):
            self.assertEqual(round(to_rupees(paise), 2), to_rupees(paise))

    def test_rejects_non_integer(self):
        with self.assertRaises(TypeError):
            to_rupees(10.5)


class SplitProportionallyTest(unittest.TestCase):
    def test_conserves_every_paisa(self):
        shares = split_proportionally(100, [1, 1, 1])
        self.assertEqual(sum(shares), 100)
        self.assertEqual(sorted(shares), [33, 33, 34])

    def test_never_loses_or_invents_money(self):
        cases = [
            (3_000_000, [11800, 16000, 4200, 3600]),
            (1, [1, 1, 1, 1]),
            (7, [3, 0, 5]),
            (999_999, [1, 2, 3, 4, 5, 6, 7]),
        ]
        for total, weights in cases:
            with self.subTest(total=total, weights=weights):
                shares = split_proportionally(total, weights)
                self.assertEqual(sum(shares), total)
                self.assertTrue(all(s >= 0 for s in shares))
                self.assertEqual(len(shares), len(weights))

    def test_zero_weights_split_evenly_rather_than_crash(self):
        self.assertEqual(sum(split_proportionally(10, [0, 0, 0])), 10)

    def test_is_deterministic(self):
        first = split_proportionally(1_000_001, [7, 7, 7, 5])
        for _ in range(20):
            self.assertEqual(split_proportionally(1_000_001, [7, 7, 7, 5]), first)

    def test_empty(self):
        self.assertEqual(split_proportionally(0, []), [])
        with self.assertRaises(ValueError):
            split_proportionally(5, [])

    def test_rejects_negatives(self):
        with self.assertRaises(ValueError):
            split_proportionally(-1, [1])
        with self.assertRaises(ValueError):
            split_proportionally(10, [1, -1])


if __name__ == "__main__":
    unittest.main()
