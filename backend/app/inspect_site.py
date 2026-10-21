"""Passive, read-only inspection of a public website.

One GET per redirect hop (body never read), plus DNS / ASN / TLS lookups.
Nothing here probes ports, brute-forces paths, or sends attack payloads.
"""

from __future__ import annotations

import asyncio
import time

import httpx

from . import fingerprint, netinfo
from .fetch import fetch_chain
from .ssrf import UnsafeTarget, parse_target, resolve_public

MAX_REPORTED_IPS = 4
OVERALL_TIMEOUT = 20.0


async def _ip_details(ip: str) -> dict:
    asn, ptr = await asyncio.gather(netinfo.asn_lookup(ip), netinfo.ptr_lookup(ip))
    return {
        "ip": ip,
        "asn": asn["asn"] if asn else None,
        "as_name": asn["as_name"] if asn else "",
        "prefix": asn["prefix"] if asn else "",
        "country": asn["country"] if asn else "",
        "ptr": ptr,
    }


async def _dns_facts(host: str, literal: bool) -> tuple[list[str], list[str]]:
    if literal:
        return [], []
    cnames, ns = await asyncio.gather(netinfo.cname_chain(host), netinfo.ns_records(host))
    return cnames, ns


async def _tls_facts(scheme: str, ip: str, host: str, literal: bool) -> dict | None:
    if scheme != "https" or literal:
        return None
    return await netinfo.tls_info(ip, host)


async def _collect(raw_url: str, target, ips: list[str], transport) -> dict:
    started = time.monotonic()
    (cnames, ns), (hops, notes), tls, ip_infos = await asyncio.gather(
        _dns_facts(target.host, target.literal),
        fetch_chain(raw_url, transport=transport, first_hop_ips=ips),
        _tls_facts(target.scheme, ips[0], target.host, target.literal),
        asyncio.gather(*(_ip_details(ip) for ip in ips[:MAX_REPORTED_IPS])),
    )

    if tls is None and hops and hops[-1]["url"].startswith("https://"):
        # http:// entry point that redirected to https: report the certificate actually served
        tls = await netinfo.tls_info(hops[-1]["ip"], parse_target(hops[-1]["url"]).host)

    merged_headers: dict[str, str] = {}
    cookies: list[str] = []
    for hop in hops:
        merged_headers.update(hop["headers"])
        cookies.extend(hop["cookies"])

    detections = fingerprint.detect(
        merged_headers, cookies, cnames, ns, [i["as_name"] for i in ip_infos if i["as_name"]]
    )
    final = hops[-1] if hops else None
    final_headers = final["headers"] if final else {}
    return {
        "target": {"url": target.url, "host": target.host, "port": target.port},
        "dns": {"addresses": ips, "cname_chain": cnames, "ns": ns},
        "ips": list(ip_infos),
        "http": {
            "hops": [{k: h[k] for k in ("url", "ip", "status", "http_version")} for h in hops],
            "final_status": final["status"] if final else None,
            "headers": final_headers,
            "cookie_names": sorted(set(cookies)),
            "server_software": fingerprint.server_software(merged_headers),
            "security_headers": fingerprint.security_headers(final_headers),
        },
        "tls": tls,
        "detections": [d.as_dict() for d in detections],
        "notes": notes,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }


async def inspect_site(raw_url: str, *, transport: httpx.AsyncBaseTransport | None = None) -> dict:
    target = parse_target(raw_url)
    ips = await resolve_public(target.host, target.port)  # resolved once, reused for hop 1
    try:
        return await asyncio.wait_for(_collect(raw_url, target, ips, transport), timeout=OVERALL_TIMEOUT)
    except TimeoutError:
        raise UnsafeTarget("timeout", "The inspection took too long") from None
