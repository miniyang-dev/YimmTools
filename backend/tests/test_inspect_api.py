import asyncio
import socket
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import fetch
from app.main import Settings, create_app
from app.ssrf import UnsafeTarget


def _public(monkeypatch, ip="93.184.216.34"):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port, *a, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))],
    )


async def _canned(url: str) -> dict:
    return {"ok": True, "url": url}


def _nodist() -> Path:
    return Path("does-not-exist")


def client(**overrides) -> TestClient:
    return TestClient(create_app(Settings(inspect=_canned, dist=_nodist(), **overrides)))


def run_app(app, scenario):
    async def go():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            return await scenario(c)

    return asyncio.run(go())


def post(c, url="https://example.com/"):
    return c.post("/api/inspect", json={"url": url})


# ---- fetch_chain: SSRF at every hop --------------------------------------------


async def test_redirect_to_metadata_is_blocked_before_any_request(monkeypatch):
    _public(monkeypatch)
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})

    with pytest.raises(UnsafeTarget) as exc:
        await fetch.fetch_chain("https://example.com/", transport=httpx.MockTransport(handler))
    assert exc.value.code == "private_address"
    assert len(seen) == 1  # the metadata hop was never requested


async def test_redirect_to_rebinding_host_is_blocked(monkeypatch):
    def fake(host, port, *a, **k):
        ip = "93.184.216.34" if host == "example.com" else "10.0.0.7"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake)

    def handler(request):
        return httpx.Response(301, headers={"location": "https://evil.example.org/"})

    with pytest.raises(UnsafeTarget) as exc:
        await fetch.fetch_chain("https://example.com/", transport=httpx.MockTransport(handler))
    assert exc.value.code == "private_address"


async def test_request_is_pinned_to_resolved_ip_with_host_header(monkeypatch):
    _public(monkeypatch)
    captured = {}

    def handler(request: httpx.Request):
        captured["url"] = str(request.url)
        captured["host"] = request.headers["host"]
        return httpx.Response(200, headers={"server": "cloudflare", "set-cookie": "__cf_bm=abc; Path=/"})

    hops, notes = await fetch.fetch_chain("example.com/x", transport=httpx.MockTransport(handler))
    assert captured["url"] == "https://93.184.216.34/x"  # httpx drops the default port
    assert captured["host"] == "example.com"
    assert hops[0]["cookies"] == ["__cf_bm"]
    assert notes == []


async def test_first_hop_reuses_given_ips_without_new_dns(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("DNS must not be asked again for the first hop")

    monkeypatch.setattr(socket, "getaddrinfo", boom)
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200)

    await fetch.fetch_chain(
        "https://example.com/", transport=httpx.MockTransport(handler), first_hop_ips=["93.184.216.34"]
    )
    assert seen == ["https://93.184.216.34/"]


async def test_redirect_limit(monkeypatch):
    _public(monkeypatch)

    def handler(request):
        return httpx.Response(302, headers={"location": "https://example.com/again"})

    hops, notes = await fetch.fetch_chain("https://example.com/", transport=httpx.MockTransport(handler))
    assert "too_many_redirects" in notes
    assert len(hops) == fetch.MAX_HOPS + 1


async def test_timeout_is_reported_not_raised(monkeypatch):
    _public(monkeypatch)

    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    hops, notes = await fetch.fetch_chain("https://example.com/", transport=httpx.MockTransport(handler))
    assert hops == [] and notes == ["timeout"]


# ---- HTTP API ---------------------------------------------------------------------


def test_api_rejects_bad_url_without_network():
    r = post(client(), "http://169.254.169.254/")
    assert r.status_code == 400
    assert r.json()["code"] == "private_address"


def test_api_valid_url_goes_to_inspector():
    r = post(client())
    assert r.status_code == 200 and r.json()["ok"] is True
    assert "cached_age_s" not in r.json()


def test_rejected_urls_do_not_use_up_the_real_budget():
    c = client(inspect_per_minute=3, light_per_minute=50)
    for _ in range(20):
        assert post(c, "http://127.0.0.1/").status_code == 400
    codes = [post(c, f"https://site{i}.example.com/").status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]


def test_rejected_urls_are_still_rate_limited():
    c = client(light_per_minute=5)
    codes = [post(c, "http://127.0.0.1/").status_code for _ in range(7)]
    assert codes.count(429) == 2
    assert post(c, "http://127.0.0.1/").headers.get("retry-after")


# ---- cache, single flight, queue ----------------------------------------------------


def counting_inspector():
    calls: list[str] = []

    async def inspect(url: str) -> dict:
        calls.append(url)
        return {"ok": True, "n": len(calls)}

    return inspect, calls


def test_repeat_lookups_come_from_the_cache_and_do_not_spend_real_budget():
    inspect, calls = counting_inspector()
    c = TestClient(create_app(Settings(inspect=inspect, inspect_per_minute=1, dist=_nodist())))
    assert post(c).json() == {"ok": True, "n": 1}
    for _ in range(10):  # a different spelling of the same target is the same cache entry
        r = post(c, "EXAMPLE.com")
        assert r.status_code == 200 and r.json()["n"] == 1 and r.json()["cached_age_s"] >= 0
    assert len(calls) == 1


def test_cache_entries_expire():
    inspect, calls = counting_inspector()
    app = create_app(Settings(inspect=inspect, cache_ttl_seconds=60, dist=_nodist()))
    now = [100.0]
    app.state.cache._clock = lambda: now[0]
    c = TestClient(app)
    post(c)
    now[0] += 59
    assert post(c).json()["cached_age_s"] == 59
    now[0] += 2
    assert post(c).json()["n"] == 2
    assert len(calls) == 2


def test_cache_can_be_turned_off():
    inspect, calls = counting_inspector()
    c = TestClient(create_app(Settings(inspect=inspect, cache_ttl_seconds=0, dist=_nodist())))
    for _ in range(3):
        post(c)
    assert len(calls) == 3


def test_failures_are_never_cached():
    state = {"fail": True}

    async def flaky(url: str) -> dict:
        if state["fail"]:
            raise RuntimeError("boom")
        return {"ok": True}

    c = TestClient(create_app(Settings(inspect=flaky, dist=_nodist())))
    assert post(c).status_code == 502
    state["fail"] = False
    assert post(c).status_code == 200


def test_identical_concurrent_lookups_share_one_real_lookup():
    started = asyncio.Event()
    release = asyncio.Event()
    calls = []

    async def slow(url: str) -> dict:
        calls.append(url)
        started.set()
        await release.wait()
        return {"ok": True}

    app = create_app(Settings(inspect=slow, inspect_per_minute=1, dist=_nodist()))

    async def scenario(c):
        first = asyncio.create_task(c.post("/api/inspect", json={"url": "https://example.com/"}))
        await started.wait()
        followers = [
            asyncio.create_task(c.post("/api/inspect", json={"url": "https://example.com/"}))
            for _ in range(5)
        ]
        await asyncio.sleep(0.05)
        release.set()
        return await first, [await f for f in followers]

    first, followers = run_app(app, scenario)
    assert len(calls) == 1
    # only one request spent real budget (inspect_per_minute=1), yet all six were answered
    assert first.status_code == 200 and all(f.status_code == 200 for f in followers)


def test_a_disconnecting_client_does_not_cancel_a_shared_lookup():
    started = asyncio.Event()
    release = asyncio.Event()
    finished = []

    async def slow(url: str) -> dict:
        started.set()
        await release.wait()
        finished.append(url)
        return {"ok": True}

    app = create_app(Settings(inspect=slow, dist=_nodist()))

    async def scenario(c):
        leader = asyncio.create_task(c.post("/api/inspect", json={"url": "https://example.com/"}))
        await started.wait()
        follower = asyncio.create_task(c.post("/api/inspect", json={"url": "https://example.com/"}))
        await asyncio.sleep(0.02)
        leader.cancel()  # the client that started it goes away
        await asyncio.sleep(0.02)
        release.set()
        return await follower

    follower = run_app(app, scenario)
    assert follower.status_code == 200 and len(finished) == 1


def test_extra_lookups_wait_for_a_slot_instead_of_failing():
    release = asyncio.Event()
    started = asyncio.Event()

    async def slow(url: str) -> dict:
        started.set()
        if "first" in url:
            await release.wait()
        return {"ok": True, "url": url}

    app = create_app(Settings(inspect=slow, max_concurrent=1, queue_wait_seconds=2, dist=_nodist()))

    async def scenario(c):
        first = asyncio.create_task(c.post("/api/inspect", json={"url": "https://first.example.com/"}))
        await started.wait()
        second = asyncio.create_task(c.post("/api/inspect", json={"url": "https://second.example.com/"}))
        await asyncio.sleep(0.1)
        assert not second.done()  # waiting, not rejected
        release.set()
        return await first, await second

    first, second = run_app(app, scenario)
    assert first.status_code == 200 and second.status_code == 200


def test_busy_is_returned_only_after_the_wait_runs_out():
    release = asyncio.Event()
    started = asyncio.Event()

    async def slow(url: str) -> dict:
        started.set()
        await release.wait()
        return {"ok": True}

    app = create_app(Settings(inspect=slow, max_concurrent=1, queue_wait_seconds=0.1, dist=_nodist()))

    async def scenario(c):
        first = asyncio.create_task(c.post("/api/inspect", json={"url": "https://first.example.com/"}))
        await started.wait()
        second = await c.post("/api/inspect", json={"url": "https://second.example.com/"})
        release.set()
        return second, await first

    second, first = run_app(app, scenario)
    assert second.status_code == 503 and second.json() == {"code": "busy", "retry_after": 5}
    assert second.headers["retry-after"] == "5"
    assert first.status_code == 200


def test_full_waiting_room_turns_clients_away_immediately():
    release = asyncio.Event()
    started = asyncio.Event()

    async def slow(url: str) -> dict:
        started.set()
        await release.wait()
        return {"ok": True}

    app = create_app(
        Settings(inspect=slow, max_concurrent=1, max_waiting=1, queue_wait_seconds=30, dist=_nodist())
    )

    async def scenario(c):
        def send(n):
            return c.post("/api/inspect", json={"url": f"https://s{n}.example.com/"})

        running = asyncio.create_task(send(0))
        await started.wait()
        waiting = asyncio.create_task(send(1))
        await asyncio.sleep(0.05)
        turned_away = await asyncio.wait_for(send(2), timeout=1)  # must not wait 30 s
        release.set()
        return turned_away, await running, await waiting

    turned_away, running, waiting = run_app(app, scenario)
    assert turned_away.status_code == 503
    assert running.status_code == 200 and waiting.status_code == 200


def test_settings_can_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("YIMM_MAX_CONCURRENT", "250")
    monkeypatch.setenv("YIMM_QUEUE_WAIT", "2.5")
    monkeypatch.setenv("YIMM_CACHE_TTL", "oops")  # invalid values fall back to the default
    s = Settings.from_env()
    assert s.max_concurrent == 250 and s.queue_wait_seconds == 2.5 and s.cache_ttl_seconds == 60.0


def test_inspector_failure_is_masked():
    async def broken(url: str) -> dict:
        raise RuntimeError("secret internals")

    c = TestClient(create_app(Settings(inspect=broken, dist=_nodist())))
    r = post(c)
    assert r.status_code == 502 and r.json() == {"code": "inspect_failed"}
    assert "secret" not in r.text


def test_unsafe_target_found_during_the_lookup_is_a_400():
    async def rebinding(url: str) -> dict:
        raise UnsafeTarget("private_address", "Hostname resolves to a non-public address")

    c = TestClient(create_app(Settings(inspect=rebinding, dist=_nodist())))
    r = post(c, "https://rebind.example.com/")
    assert r.status_code == 400 and r.json()["code"] == "private_address"


def test_security_headers_and_no_docs():
    r = client().get("/api/health")
    assert r.headers["content-security-policy"].startswith("default-src 'self'")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "camera=()" in r.headers["permissions-policy"]
    assert client().get("/docs").status_code == 404
    assert client().get("/api/myip").status_code == 404


def test_spa_fallback_and_path_traversal(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html>index")
    (tmp_path / "assets" / "a.js").write_text("1")
    (tmp_path.parent / "secret.txt").write_text("TOP SECRET")
    c = TestClient(create_app(Settings(inspect=_canned, dist=tmp_path)))
    assert "index" in c.get("/zh-TW/totp").text
    assert c.get("/assets/a.js").headers["cache-control"].startswith("public, max-age=31536000")
    assert c.get("/assets/nope.js").status_code == 404
    assert "TOP SECRET" not in c.get("/..%2fsecret.txt").text
    assert "TOP SECRET" not in c.get("/%2e%2e/secret.txt").text
    assert c.get("/api/nope").status_code == 404
