"""Capacity management for the expensive endpoint: a result cache, a bounded waiting room, and a gate.

None of this knows about HTTP or about what an "inspection" is, so each piece can be tested on its own.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Generic, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    """Small LRU cache whose entries expire ``ttl`` seconds after they were stored."""

    def __init__(self, ttl: float, max_entries: int, clock: Callable[[], float] = time.monotonic):
        self.ttl = ttl
        self.max_entries = max_entries
        self._clock = clock
        self._items: OrderedDict[str, tuple[float, T]] = OrderedDict()

    def get(self, key: str) -> tuple[T, float] | None:
        """The cached value and its age in seconds, or None when missing or expired."""
        entry = self._items.get(key)
        if entry is None:
            return None
        stored_at, value = entry
        age = self._clock() - stored_at
        if age >= self.ttl:
            del self._items[key]
            return None
        self._items.move_to_end(key)
        return value, age

    def set(self, key: str, value: T) -> None:
        if self.ttl <= 0 or self.max_entries <= 0:
            return
        self._items[key] = (self._clock(), value)
        self._items.move_to_end(key)
        while len(self._items) > self.max_entries:
            self._items.popitem(last=False)

    def __len__(self) -> int:
        return len(self._items)


class Busy(Exception):
    """No slot became free in time (or the waiting room is full)."""


class Gate:
    """At most ``slots`` jobs run at once. Extra callers wait up to ``max_wait`` seconds in a
    waiting room of ``max_waiting`` places; beyond that they are turned away immediately, so a
    flood can neither pile up unbounded work nor keep every caller waiting for nothing."""

    def __init__(self, slots: int, max_waiting: int, max_wait: float):
        self._sem = asyncio.Semaphore(slots)
        self.slots = slots
        self.max_waiting = max_waiting
        self.max_wait = max_wait
        self.waiting = 0

    @property
    def busy(self) -> bool:
        return self._sem.locked()

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        if self._sem.locked():
            if self.waiting >= self.max_waiting:
                raise Busy
            self.waiting += 1
            try:
                await asyncio.wait_for(self._sem.acquire(), self.max_wait)
            except TimeoutError:
                raise Busy from None
            finally:
                self.waiting -= 1
        else:
            await self._sem.acquire()
        try:
            yield
        finally:
            self._sem.release()
