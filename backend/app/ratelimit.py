from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque

from fastapi import Request

log = logging.getLogger("yimmtool")


class RateLimiter:
    """Sliding-window limiter, in memory, per key."""

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, now: float | None = None) -> tuple[bool, int]:
        now = time.monotonic() if now is None else now
        q = self._hits[key]
        while q and now - q[0] >= self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False, max(1, int(self.window - (now - q[0])) + 1)
        q.append(now)
        if len(self._hits) > 10_000:
            for k in [k for k, v in self._hits.items() if not v]:
                del self._hits[k]
        return True, 0

    def reset(self) -> None:
        self._hits.clear()


def proxy_hops() -> int:
    """How many trusted reverse proxies sit in front of us (``YIMM_PROXY_HOPS``)."""
    raw = os.getenv("YIMM_PROXY_HOPS", "0")
    try:
        hops = int(raw)
    except ValueError:
        log.warning("YIMM_PROXY_HOPS=%r is not an integer; ignoring it (0 trusted proxies)", raw)
        return 0
    return max(hops, 0)


def client_ip(request: Request) -> str:
    """Connection IP. Only trust X-Forwarded-For for the configured number of proxy hops."""
    hops = proxy_hops()
    if hops > 0:
        xff = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(xff) >= hops:
            return xff[-hops]
    return request.client.host if request.client else "0.0.0.0"
