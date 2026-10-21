"""Redirect-following, IP-pinned header fetch (body is never read)."""

from __future__ import annotations

from urllib.parse import urljoin

import httpx

from .ssrf import Target, parse_target, resolve_public

USER_AGENT = "Mozilla/5.0 (compatible; YimmToolInspector/1.0; passive header check)"
MAX_HOPS = 4
MAX_HEADERS = 60
MAX_VALUE = 300
REQUEST_TIMEOUT = 5.0
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


def _fmt_ip(ip: str) -> str:
    return f"[{ip}]" if ":" in ip else ip


def _cookie_name(set_cookie: str) -> str:
    return set_cookie.split("=", 1)[0].strip()


def _hop_request(target: Target, ip: str) -> tuple[str, dict[str, str], dict[str, str]]:
    """URL aimed at the pinned IP, the headers that keep the original host, and TLS extensions."""
    url = f"{target.scheme}://{_fmt_ip(ip)}:{target.port}{target.path}"
    headers = {
        "Host": target.host_header,
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    }
    extensions = {"sni_hostname": target.host} if target.scheme == "https" and not target.literal else {}
    return url, headers, extensions


async def _fetch_hop(client: httpx.AsyncClient, target: Target, ip: str) -> tuple[dict, str | None]:
    url, headers, extensions = _hop_request(target, ip)
    async with client.stream("GET", url, headers=headers, extensions=extensions) as resp:
        response_headers: dict[str, str] = {}
        for key in resp.headers:
            if key.lower() == "set-cookie" or len(response_headers) >= MAX_HEADERS:
                continue
            response_headers[key.lower()] = ", ".join(resp.headers.get_list(key))[:MAX_VALUE]
        hop = {
            "url": target.url,
            "ip": ip,
            "status": resp.status_code,
            "http_version": resp.http_version,
            "headers": response_headers,
            "cookies": [_cookie_name(c) for c in resp.headers.get_list("set-cookie")][:20],
        }
        return hop, resp.headers.get("location")


async def fetch_chain(
    raw_url: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    first_hop_ips: list[str] | None = None,
) -> tuple[list[dict], list[str]]:
    """Follow redirects manually so every hop is re-validated and IP-pinned.

    ``first_hop_ips`` lets the caller reuse an already-validated resolution for the
    first hop instead of asking DNS again.
    """
    hops: list[dict] = []
    notes: list[str] = []
    url = raw_url
    pinned = first_hop_ips

    for _ in range(MAX_HOPS + 1):
        target = parse_target(url)  # raises UnsafeTarget on any bad hop
        ips = pinned or await resolve_public(target.host, target.port)
        pinned = None
        client = httpx.AsyncClient(
            transport=transport or httpx.AsyncHTTPTransport(retries=0),
            timeout=httpx.Timeout(REQUEST_TIMEOUT),
            follow_redirects=False,
            trust_env=False,
        )
        try:
            hop, location = await _fetch_hop(client, target, ips[0])
        except httpx.TimeoutException:
            notes.append("timeout")
            return hops, notes
        except httpx.HTTPError as exc:
            notes.append(f"connection_error:{type(exc).__name__}")
            return hops, notes
        finally:
            await client.aclose()

        hops.append(hop)
        if hop["status"] in REDIRECT_STATUSES and location:
            url = urljoin(target.url, location)
            continue
        return hops, notes

    notes.append("too_many_redirects")
    return hops, notes
