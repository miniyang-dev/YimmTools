import socket

import pytest

from app.ssrf import UnsafeTarget, parse_target, resolve_public


@pytest.mark.parametrize(
    "url,code",
    [
        ("", "invalid_url"),
        ("http://", "invalid_url"),
        ("file:///etc/passwd", "bad_scheme"),
        ("gopher://example.com/", "bad_scheme"),
        ("ftp://example.com/", "bad_scheme"),
        ("http://user:pw@example.com/", "credentials"),
        ("http://example.com@127.0.0.1/", "credentials"),
        ("http://127.0.0.1/", "private_address"),
        ("http://10.0.0.5/", "private_address"),
        ("http://172.16.4.4/", "private_address"),
        ("http://192.168.1.1/", "private_address"),
        ("http://169.254.169.254/latest/meta-data/", "private_address"),
        ("http://100.64.0.1/", "private_address"),
        ("http://[::1]/", "private_address"),
        ("http://[::ffff:127.0.0.1]/", "private_address"),
        ("http://[fe80::1]/", "private_address"),
        ("http://[fd00::1]/", "private_address"),
        ("http://0.0.0.0/", "private_address"),
        ("http://2130706433/", "bad_host"),
        ("http://0x7f.0.0.1/", "bad_host"),
        ("http://127.1/", "bad_host"),
        ("http://localhost/", "bad_host"),
        ("http://intranet/", "bad_host"),
        ("http://printer.local/", "bad_host"),
        ("http://metadata.google.internal/", "bad_host"),
        ("https://example.com:22/", "bad_port"),
        ("https://example.com:8080/", "bad_port"),
        ("https://exa mple.com/", "invalid_url"),
        ("https://example.com/\r\nX: y", "invalid_url"),
        ("https://example.com\\@evil.com/", "invalid_url"),
    ],
)
def test_rejects_unsafe_urls(url, code):
    with pytest.raises(UnsafeTarget) as exc:
        parse_target(url)
    assert exc.value.code == code


def test_accepts_public_urls():
    t = parse_target("Example.COM/path?q=1")
    assert (t.scheme, t.host, t.port, t.path) == ("https", "example.com", 443, "/path?q=1")
    assert parse_target("http://example.com:80/").port == 80
    assert parse_target("https://8.8.8.8/").literal is True
    assert parse_target("https://münchen.de/").host == "xn--mnchen-3ya.de"


def _fake_getaddrinfo(addresses):
    def fake(host, port, *a, **k):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in addresses]

    return fake


async def test_resolve_public_ok(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(["93.184.216.34"]))
    assert await resolve_public("example.com", 443) == ["93.184.216.34"]


@pytest.mark.parametrize("answers", [["127.0.0.1"], ["10.1.2.3"], ["93.184.216.34", "169.254.169.254"]])
async def test_resolve_rejects_any_private_answer(monkeypatch, answers):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(answers))
    with pytest.raises(UnsafeTarget) as exc:
        await resolve_public("rebind.example.com", 443)
    assert exc.value.code == "private_address"


async def test_resolve_failure_is_reported(monkeypatch):
    def boom(*a, **k):
        raise socket.gaierror("nope")

    monkeypatch.setattr(socket, "getaddrinfo", boom)
    with pytest.raises(UnsafeTarget) as exc:
        await resolve_public("nonexistent.example.com", 443)
    assert exc.value.code == "dns_failed"
