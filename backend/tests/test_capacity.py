import asyncio

import pytest

from app.capacity import Busy, Gate, TTLCache


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_cache_returns_value_and_age_then_expires():
    clock = FakeClock()
    cache = TTLCache[str](ttl=60, max_entries=10, clock=clock)
    assert cache.get("a") is None
    cache.set("a", "x")
    clock.now += 12
    assert cache.get("a") == ("x", 12)
    clock.now += 48  # exactly the ttl: expired
    assert cache.get("a") is None
    assert len(cache) == 0


def test_cache_evicts_least_recently_used():
    cache = TTLCache[int](ttl=60, max_entries=2, clock=FakeClock())
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # "a" is now the most recently used
    cache.set("c", 3)
    assert cache.get("b") is None
    assert cache.get("a") is not None and cache.get("c") is not None


@pytest.mark.parametrize("ttl,size", [(0, 10), (60, 0)])
def test_cache_can_be_disabled(ttl, size):
    cache = TTLCache[int](ttl=ttl, max_entries=size)
    cache.set("a", 1)
    assert cache.get("a") is None


async def test_gate_runs_up_to_its_slots_in_parallel():
    gate = Gate(slots=3, max_waiting=10, max_wait=1)
    running = 0
    peak = 0

    async def job():
        nonlocal running, peak
        async with gate.slot():
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.02)
            running -= 1

    await asyncio.gather(*(job() for _ in range(9)))
    assert peak == 3 and not gate.busy and gate.waiting == 0


async def test_gate_lets_a_waiter_in_when_a_slot_frees_up():
    gate = Gate(slots=1, max_waiting=5, max_wait=1)
    release = asyncio.Event()
    order = []

    async def holder():
        async with gate.slot():
            order.append("holder in")
            await release.wait()
        order.append("holder out")

    async def waiter():
        async with gate.slot():
            order.append("waiter in")

    h = asyncio.create_task(holder())
    await asyncio.sleep(0.01)
    w = asyncio.create_task(waiter())
    await asyncio.sleep(0.05)
    assert gate.waiting == 1 and order == ["holder in"]
    release.set()
    await asyncio.gather(h, w)
    assert order == ["holder in", "holder out", "waiter in"]


async def test_gate_turns_waiters_away_after_max_wait():
    gate = Gate(slots=1, max_waiting=5, max_wait=0.05)
    release = asyncio.Event()

    async def holder():
        async with gate.slot():
            await release.wait()

    h = asyncio.create_task(holder())
    await asyncio.sleep(0.01)
    with pytest.raises(Busy):
        async with gate.slot():
            pass
    assert gate.waiting == 0  # the failed waiter left the room
    release.set()
    await h
    async with gate.slot():  # and the gate still works afterwards
        pass


async def test_gate_waiting_room_is_bounded():
    gate = Gate(slots=1, max_waiting=1, max_wait=5)
    release = asyncio.Event()

    async def holder():
        async with gate.slot():
            await release.wait()

    async def waiter():
        async with gate.slot():
            pass

    h = asyncio.create_task(holder())
    await asyncio.sleep(0.01)
    w = asyncio.create_task(waiter())  # takes the only waiting place
    await asyncio.sleep(0.01)
    with pytest.raises(Busy):  # the next one is turned away at once, without waiting
        async with gate.slot():
            pass
    release.set()
    await asyncio.gather(h, w)


async def test_gate_releases_the_slot_when_the_job_fails():
    gate = Gate(slots=1, max_waiting=1, max_wait=1)
    with pytest.raises(RuntimeError):
        async with gate.slot():
            raise RuntimeError("boom")
    assert not gate.busy
