"""DNS, ASN, reverse-DNS and TLS lookups for public hosts."""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import re
import ssl
import time

import dns.asyncresolver
import dns.exception
import dns.reversename

_ASN_TTL = 3600.0
_asn_cache: dict[str, tuple[float, dict | None]] = {}


def _make_resolver() -> dns.asyncresolver.Resolver:
    resolver = dns.asyncresolver.Resolver()
    resolver.lifetime = 3.0
    resolver.timeout = 2.0
    return resolver


async def _query(rtype: str, name: str):
    try:
        return await _make_resolver().resolve(name, rtype)
    except dns.exception.DNSException:
        return None


async def cname_chain(host: str, limit: int = 8) -> list[str]:
    chain: list[str] = []
    current = host
    for _ in range(limit):
        ans = await _query("CNAME", current)
        if not ans:
            break
        current = str(ans[0].target).rstrip(".").lower()
        if current in chain:
            break
        chain.append(current)
    return chain


async def ns_records(host: str) -> list[str]:
    labels = host.split(".")
    for i in range(max(len(labels) - 1, 1)):
        if i > 3:
            break
        ans = await _query("NS", ".".join(labels[i:]))
        if ans:
            return sorted(str(r.target).rstrip(".").lower() for r in ans)
    return []


def _origin_query(ip: str) -> str:
    addr = ipaddress.ip_address(ip)
    if addr.version == 4:
        return ".".join(reversed(ip.split("."))) + ".origin.asn.cymru.com"
    nibbles = addr.exploded.replace(":", "")
    return ".".join(reversed(nibbles)) + ".origin6.asn.cymru.com"


def _txt(ans) -> list[str]:
    raw = b"".join(ans[0].strings).decode("utf-8", "replace")
    return [p.strip() for p in raw.split("|")]


async def asn_lookup(ip: str) -> dict | None:
    """Origin AS via Team Cymru's DNS interface. Cached for an hour."""
    now = time.monotonic()
    hit = _asn_cache.get(ip)
    if hit and now - hit[0] < _ASN_TTL:
        return hit[1]
    result: dict | None = None
    ans = await _query("TXT", _origin_query(ip))
    if ans:
        parts = _txt(ans)
        if len(parts) >= 3 and parts[0]:
            asn = parts[0].split()[0]
            result = {"asn": int(asn), "prefix": parts[1], "country": parts[2], "as_name": ""}
            name_ans = await _query("TXT", f"AS{asn}.asn.cymru.com")
            if name_ans:
                name_parts = _txt(name_ans)
                name = name_parts[-1] if name_parts else ""
                # Cymru appends ", <CC>"; the country is reported separately
                result["as_name"] = re.sub(r",\s*[A-Z]{2}$", "", name)
    if len(_asn_cache) > 5000:
        _asn_cache.clear()
    _asn_cache[ip] = (now, result)
    return result


async def ptr_lookup(ip: str) -> str | None:
    try:
        name = dns.reversename.from_address(ip)
    except Exception:
        return None
    ans = await _query("PTR", str(name))
    return str(ans[0].target).rstrip(".").lower() if ans else None


async def tls_info(ip: str, host: str, port: int = 443, connect_timeout: float = 5.0) -> dict:
    ctx = ssl.create_default_context()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port, ssl=ctx, server_hostname=host), connect_timeout
        )
    except ssl.SSLCertVerificationError as exc:
        return {"verified": False, "error": exc.verify_message}
    except (TimeoutError, OSError, ssl.SSLError) as exc:
        return {"verified": None, "error": type(exc).__name__}

    try:
        obj = writer.get_extra_info("ssl_object")
        cert = obj.getpeercert() or {}
        subject = dict(x[0] for x in cert.get("subject", ()))
        issuer = dict(x[0] for x in cert.get("issuer", ()))
        not_after = cert.get("notAfter")
        not_before = cert.get("notBefore")
        days_left = None
        if not_after:
            days_left = int((ssl.cert_time_to_seconds(not_after) - time.time()) // 86400)
        cipher = obj.cipher()
        return {
            "verified": True,
            "protocol": obj.version(),
            "cipher": cipher[0] if cipher else None,
            "alpn": obj.selected_alpn_protocol(),
            "subject": subject.get("commonName"),
            "issuer": issuer.get("organizationName") or issuer.get("commonName"),
            "san": [v for k, v in cert.get("subjectAltName", ()) if k == "DNS"][:20],
            "not_before": not_before,
            "not_after": not_after,
            "days_left": days_left,
        }
    finally:
        writer.close()
        with contextlib.suppress(Exception):
            await writer.wait_closed()
