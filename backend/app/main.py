from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .capacity import Busy, Gate, TTLCache
from .inspect_site import inspect_site
from .ratelimit import RateLimiter, client_ip
from .ssrf import UnsafeTarget, parse_target

DEFAULT_DIST = Path(os.getenv("YIMM_DIST") or Path(__file__).resolve().parents[2] / "frontend" / "dist")

# Cloudflare Web Analytics (injected by Cloudflare at the edge) is the only third party allowed:
# its beacon script, and the endpoint it reports page views to. Nothing a visitor types is sent.
CLOUDFLARE_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com"
CLOUDFLARE_ANALYTICS_REPORT = "https://cloudflareinsights.com"

CSP = (
    f"default-src 'self'; script-src 'self' {CLOUDFLARE_ANALYTICS_SCRIPT}; style-src 'self' 'unsafe-inline'; "
    f"img-src 'self' data: blob:; font-src 'self'; connect-src 'self' {CLOUDFLARE_ANALYTICS_REPORT}; "
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)
PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
BUSY_RETRY_SECONDS = 5


def _env_number(name: str, default: float, cast: type = float) -> float:
    try:
        return cast(os.environ[name])
    except (KeyError, ValueError):
        return default


@dataclass
class Settings:
    """Capacity knobs for ``/api/inspect``. Every field can be set with a ``YIMM_*`` variable (see README)."""

    #: lookups that really go out to the internet, per client IP per minute
    inspect_per_minute: int = 12
    #: cheap requests per client IP per minute: rejected URLs, cache hits, joins of an in-flight lookup
    light_per_minute: int = 120
    #: lookups running at the same time across all clients
    max_concurrent: int = 100
    #: how long an extra lookup may wait for a free slot before the client is told to retry
    queue_wait_seconds: float = 4.0
    #: how many lookups may wait at once; beyond that clients are turned away immediately
    max_waiting: int = 200
    #: identical lookups are answered from memory for this long (0 disables the cache)
    cache_ttl_seconds: float = 60.0
    cache_max_entries: int = 2000
    dist: Path = DEFAULT_DIST
    inspect: Callable[[str], Awaitable[dict]] = field(default=inspect_site)

    @classmethod
    def from_env(cls) -> Settings:
        d = cls()
        return cls(
            inspect_per_minute=int(_env_number("YIMM_INSPECT_PER_MINUTE", d.inspect_per_minute, int)),
            light_per_minute=int(_env_number("YIMM_LIGHT_PER_MINUTE", d.light_per_minute, int)),
            max_concurrent=int(_env_number("YIMM_MAX_CONCURRENT", d.max_concurrent, int)),
            queue_wait_seconds=_env_number("YIMM_QUEUE_WAIT", d.queue_wait_seconds),
            max_waiting=int(_env_number("YIMM_MAX_WAITING", d.max_waiting, int)),
            cache_ttl_seconds=_env_number("YIMM_CACHE_TTL", d.cache_ttl_seconds),
            cache_max_entries=int(_env_number("YIMM_CACHE_MAX", d.cache_max_entries, int)),
        )


class InspectBody(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


def _enforce(limiter: RateLimiter, request: Request) -> None:
    ok, retry = limiter.check(client_ip(request))
    if not ok:
        raise HTTPException(
            429, detail={"code": "rate_limited", "retry_after": retry}, headers={"Retry-After": str(retry)}
        )


def _busy() -> JSONResponse:
    return JSONResponse(
        {"code": "busy", "retry_after": BUSY_RETRY_SECONDS},
        status_code=503,
        headers={"Retry-After": str(BUSY_RETRY_SECONDS)},
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings()
    app = FastAPI(title="YimmTool", docs_url=None, redoc_url=None, openapi_url=None)

    real = RateLimiter(cfg.inspect_per_minute, 60)
    light = RateLimiter(cfg.light_per_minute, 60)
    gate = Gate(cfg.max_concurrent, cfg.max_waiting, cfg.queue_wait_seconds)
    cache: TTLCache[dict] = TTLCache(cfg.cache_ttl_seconds, cfg.cache_max_entries)
    in_flight: dict[str, asyncio.Task[dict]] = {}
    # exposed so tests can reset or inspect them
    app.state.limiters = {"real": real, "light": light}
    app.state.gate = gate
    app.state.cache = cache

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("Content-Security-Policy", CSP)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
        path = request.url.path
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif path.startswith("/assets/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    async def lookup(key: str, url: str) -> dict:
        """One real lookup: wait for a slot, run it, remember the result."""
        async with gate.slot():
            result = await cfg.inspect(url)
        cache.set(key, result)
        return result

    @app.post("/api/inspect")
    async def api_inspect(body: InspectBody, request: Request):
        try:
            key = parse_target(body.url).url
        except UnsafeTarget as exc:
            _enforce(light, request)
            return JSONResponse({"code": exc.code, "message": exc.message}, status_code=400)

        hit = cache.get(key)
        if hit is not None:
            _enforce(light, request)
            value, age = hit
            return {**value, "cached_age_s": int(age)}

        task = in_flight.get(key)
        if task is None:
            _enforce(real, request)  # only the request that starts a lookup spends real budget
            task = asyncio.create_task(lookup(key, body.url))
            in_flight[key] = task
            # drop the entry when done; also mark the outcome as retrieved so an abandoned task never warns
            task.add_done_callback(lambda t: (in_flight.pop(key, None), t.cancelled() or t.exception()))
        else:
            _enforce(light, request)  # joining someone else's lookup is nearly free

        try:
            # shield: a client that disconnects must not cancel the lookup other clients are waiting on
            return await asyncio.shield(task)
        except Busy:
            return _busy()
        except UnsafeTarget as exc:
            return JSONResponse({"code": exc.code, "message": exc.message}, status_code=400)
        except Exception:  # never leak internals
            return JSONResponse({"code": "inspect_failed"}, status_code=502)

    @app.exception_handler(HTTPException)
    async def http_exc(_: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
        return JSONResponse(detail, status_code=exc.status_code, headers=exc.headers)

    if cfg.dist.is_dir():
        dist = cfg.dist.resolve()
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404, detail={"code": "not_found"})
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and dist in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})

    return app


app = create_app(Settings.from_env())
