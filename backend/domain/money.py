"""Largest-remainder allocation — the ONE rounding rule. Spec §5.1."""


def allocate(T: int, weights: dict[int, int]) -> dict[int, int]:
    """Distribute total ``T`` across users by integer ``weights`` so the result
    sums EXACTLY to ``T`` (Invariant I5). Leftover paise go one-each to the
    largest fractional remainders; tie-break is (frac DESC, user_id ASC) for
    determinism. No floating point: floor via integer division, remainder via
    modulo.
    """
    if not isinstance(T, int):
        raise ValueError("allocate: T must be integer paise")

    W = sum(weights.values())
    if W <= 0:
        raise ValueError("allocate: total weight must be > 0")

    base: dict[int, int] = {}
    frac: dict[int, int] = {}
    allocated = 0
    for u, w in weights.items():
        b = (T * w) // W
        base[u] = b
        frac[u] = (T * w) % W
        allocated += b

    leftover = T - allocated  # 0 <= leftover < len(weights)
    order = sorted(weights.keys(), key=lambda u: (-frac[u], u))
    for k in range(leftover):
        u = order[k]
        base[u] += 1
    return base
