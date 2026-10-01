"""Design-only arithmetic checks; this is not the market simulator.

Run: python tools/design-checks/check_model_arithmetic.py
Checks uniform auction examples and breakpoint search against exhaustive ticks.
"""

from collections import defaultdict
from fractions import Fraction
from random import Random


def quantities(orders, price):
    demand = sum(q for _, side, limit, q in orders if side == "buy" and limit >= price)
    supply = sum(q for _, side, limit, q in orders if side == "sell" and limit <= price)
    return demand, supply


def clearing(orders, reference, low, high, exhaustive=False):
    if exhaustive:
        candidates = range(low, high + 1)
    else:
        candidates = {low, high, min(high, max(low, reference))}
        for _, _, limit, _ in orders:
            candidates.update((limit - 1, limit, limit + 1))
        candidates = {p for p in candidates if low <= p <= high}
    def priority(price):
        demand, supply = quantities(orders, price)
        return (-min(demand, supply), abs(demand - supply), abs(price - reference), price)
    price = min(candidates, key=priority)
    volume = min(quantities(orders, price))
    return (price, volume) if volume else (None, 0)


def allocate(orders, side, price, volume):
    levels = defaultdict(lambda: defaultdict(int))
    for account, direction, limit, quantity in orders:
        eligible = limit >= price if side == "buy" else limit <= price
        if direction == side and eligible:
            levels[limit][account] += quantity
    result = defaultdict(int)
    for limit in sorted(levels, reverse=side == "buy"):
        accounts = levels[limit]
        total = sum(accounts.values())
        taking = min(total, volume)
        exact = {a: Fraction(taking * q, total) for a, q in accounts.items()}
        rounded = {a: x.numerator // x.denominator for a, x in exact.items()}
        remainder = taking - sum(rounded.values())
        # Account-name order is the fixed tie ordering for these fixtures only.
        ranking = sorted(accounts, key=lambda a: (-(exact[a] - rounded[a]), a))
        for account in ranking[:remainder]:
            rounded[account] += 1
        for account, q in rounded.items():
            result[account] += q
        volume -= taking
        if not volume:
            break
    return dict(result)


def check():
    supply = [("s1", "sell", 1000, 100), ("s2", "sell", 1010, 100),
              ("s3", "sell", 1040, 100)]
    assert clearing(supply + [("p", "buy", 1050, 350)], 1000, 900, 1100) == (1040, 300)
    assert clearing(supply + [("p", "buy", 1050, 50)], 1000, 900, 1100) == (1000, 50)
    assert clearing([("b", "buy", 990, 50), ("s", "sell", 1000, 50)],
                    995, 900, 1100) == (None, 0)
    interval = [("b1", "buy", 1000, 100), ("b2", "buy", 1200, 100),
                ("s1", "sell", 900, 100), ("s2", "sell", 1100, 100)]
    assert clearing(interval, 1050, 800, 1300) == (1050, 100)
    tied = [("p", "buy", 1000, 60), ("n", "buy", 1000, 120),
            ("s", "sell", 1000, 90)]
    split = [("p", "buy", 1000, 10)] * 6 + tied[1:]
    assert clearing(tied, 1000, 900, 1100) == clearing(split, 1000, 900, 1100)
    assert allocate(tied, "buy", 1000, 90) == {"p": 30, "n": 60}
    assert allocate(split, "buy", 1000, 90) == {"p": 30, "n": 60}
    rng = Random(20261001)
    for _ in range(2000):
        orders = [(f"a{i}", rng.choice(("buy", "sell")), rng.randint(1, 80),
                   rng.randint(1, 100)) for i in range(rng.randint(2, 30))]
        low, high = rng.randint(1, 20), rng.randint(40, 80)
        reference = rng.randint(1, 80)
        reduced = clearing(orders, reference, low, high)
        assert reduced == clearing(orders, reference, low, high, exhaustive=True)
        rng.shuffle(orders)
        assert clearing(orders, reference, low, high) == reduced
        price, volume = reduced
        if volume:
            for side in ("buy", "sell"):
                allocations = allocate(orders, side, price, volume)
                assert sum(allocations.values()) == volume
    assert sum([24, 20, 18, 16, 12, 10]) == 100
    assert sum([10, 16, 12, 18, 20, 24]) == 100
    assert sum([26, 26, 25, 25, 24, 24, 20, 20]) == 2 * (55 + 2 * 20) == 190
    assert 2 * (3 + 2 + 2 + 4 + 1) + 2 == 26
    fee = lambda amount_cents: (amount_cents + 1999) // 2000
    assert 16 * fee(1000) == 16
    assert fee(16000) == 8
    assert fee(16000) + 16 - 1 >= 16 * fee(1000)
    for _ in range(2000):
        amounts = [rng.randint(1, 100000) for _ in range(rng.randint(1, 16))]
        assert fee(sum(amounts)) + len(amounts) - 1 >= sum(map(fee, amounts))
    # The scaling counterexample must remain documented: the naive result is unsafe.
    cash = 2001
    original = [2, 2]
    original_cost = sum(q * 1000 + fee(q * 1000) for q in original)
    scaled = [q * cash // original_cost for q in original]
    cost = lambda qs: sum(q * 1000 + fee(q * 1000) for q in qs if q)
    assert scaled == [1, 1] and cost(scaled) == 2002
    while cost(scaled) > cash:
        next_index = next(i for i, q in enumerate(scaled) if q)
        scaled[next_index] -= 1
    assert scaled == [0, 1] and cost(scaled) <= cash
    print("PASS: 5 auction/allocation fixtures; 2000 breakpoint vs exhaustive checks;")
    print("      allocation sums, input order invariance, and world quota arithmetic.")
    print("PASS: 2000 fee-reserve bounds and the cross-stock rounding counterexample.")
    print("Not tested: full ledgers, T+1, NPC behaviour, events, balance, or performance.")


if __name__ == "__main__":
    check()
