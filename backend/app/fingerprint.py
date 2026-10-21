"""Matching logic: which CDN / WAF / cloud / platform does a response point at?

Pure functions over already-collected facts (headers, cookie names, CNAME
chain, NS records, ASN names), checked against the tables in ``signatures.py``.
No network access here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .signatures import (
    ASN_RULES,
    CNAME_SUFFIXES,
    COOKIE_RULES,
    HEADER_RULES,
    NS_SUFFIXES,
    SECURITY_HEADERS,
    SERVER_HEADERS,
)

CONF_ORDER = {"low": 0, "medium": 1, "high": 2}


@dataclass
class Detection:
    name: str
    kind: str  # cdn | waf | cloud | platform | hosting
    confidence: str = "low"  # low | medium | high
    evidence: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "kind": self.kind,
            "confidence": self.confidence,
            "evidence": self.evidence,
        }


def _norm_cookie(name: str) -> str:
    return name.strip().lower()


def detect(
    headers: dict[str, str],
    cookie_names: list[str],
    cnames: list[str],
    ns: list[str],
    as_names: list[str],
) -> list[Detection]:
    """Merge every signal into one confidence-ranked list."""
    found: dict[tuple[str, str], Detection] = {}

    def add(name: str, kind: str, conf: str, why: str) -> None:
        d = found.setdefault((name, kind), Detection(name, kind))
        if why not in d.evidence:
            d.evidence.append(why)
        if CONF_ORDER[conf] > CONF_ORDER[d.confidence]:
            d.confidence = conf

    lower = {k.lower(): v for k, v in headers.items()}

    for name, kind, header, pattern, conf in HEADER_RULES:
        value = lower.get(header)
        if value is None:
            continue
        if pattern is None:
            add(name, kind, conf, f"header {header}")
        elif re.search(pattern, value, re.I):
            add(name, kind, conf, f"header {header}: {value[:80]}")

    for cookie in cookie_names:
        c = _norm_cookie(cookie)
        for name, kind, pattern, conf in COOKIE_RULES:
            if re.search(pattern, c, re.I):
                add(name, kind, conf, f"cookie {cookie}")

    for cname in cnames:
        low = cname.rstrip(".").lower()
        for name, kind, suffix in CNAME_SUFFIXES:
            if low == suffix or low.endswith("." + suffix):
                add(name, kind, "high", f"CNAME {low}")
                break

    for server in ns:
        low = server.rstrip(".").lower()
        for provider, needle in NS_SUFFIXES:
            if needle in low:
                add(provider, "dns", "medium", f"NS {low}")
                break

    for as_name in as_names:
        for provider, kind, pattern in ASN_RULES:
            if re.search(pattern, as_name, re.I):
                add(provider, kind, "medium", f"ASN {as_name}")
                break

    # A WAF-grade CDN sits in front of the origin: a single high CDN hit is
    # also a hint that its bundled WAF may be active, but we do not claim it.
    out = sorted(
        found.values(),
        key=lambda d: (-CONF_ORDER[d.confidence], -len(d.evidence), d.name),
    )
    return out


def server_software(headers: dict[str, str]) -> list[str]:
    lower = {k.lower(): v for k, v in headers.items()}
    return [f"{h}: {lower[h][:100]}" for h in SERVER_HEADERS if h in lower]


def security_headers(headers: dict[str, str]) -> dict[str, bool]:
    lower = {k.lower() for k in headers}
    return {h: h in lower for h in SECURITY_HEADERS}
