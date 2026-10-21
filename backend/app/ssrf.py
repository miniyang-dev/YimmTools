"""Target validation for the outbound-fetch tools.

Every URL a visitor submits goes through ``parse_target`` and every hostname
through ``resolve_public`` before any socket is opened. The rule is simple:
only http/https on ports 80/443, only to hosts whose *every* resolved address
is a public one. Redirects are re-validated hop by hop by the caller.
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

ALLOWED_PORTS = {80, 443}
MAX_URL_LENGTH = 2048

_BLOCKED_NETS = [
    ipaddress.ip_network(n)
    for n in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.88.99.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "255.255.255.255/32",
        "::/128",
        "::1/128",
        "::ffff:0:0/96",
        "64:ff9b::/96",
        "64:ff9b:1::/48",
        "100::/64",
        "2001::/32",
        "2001:db8::/32",
        "2002::/16",
        "fc00::/7",
        "fe80::/10",
        "ff00::/8",
    )
]

_BLOCKED_SUFFIXES = (
    ".local",
    ".localhost",
    ".internal",
    ".lan",
    ".home",
    ".intranet",
    ".corp",
    ".private",
    ".test",
    ".invalid",
    ".example",
    ".onion",
    ".arpa",
)

_HOST_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$"
)


class UnsafeTarget(ValueError):
    """The URL or address must not be fetched. ``code`` is a stable machine key."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Target:
    scheme: str
    host: str  # ASCII (IDNA) hostname or IP literal, lower-case, no brackets
    port: int
    path: str  # path + query, always starts with "/"
    literal: bool  # host is an IP literal

    @property
    def host_header(self) -> str:
        default = 443 if self.scheme == "https" else 80
        host = f"[{self.host}]" if ":" in self.host else self.host
        return host if self.port == default else f"{host}:{self.port}"

    @property
    def url(self) -> str:
        return f"{self.scheme}://{self.host_header}{self.path}"


def is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if not ip.is_global:
        return False
    return not any(ip.version == n.version and ip in n for n in _BLOCKED_NETS)


def parse_target(raw: str) -> Target:
    raw = (raw or "").strip()
    if not raw or len(raw) > MAX_URL_LENGTH:
        raise UnsafeTarget("invalid_url", "URL is empty or too long")
    if any(c in raw for c in "\r\n\t\x00 \\"):
        raise UnsafeTarget("invalid_url", "URL contains illegal characters")
    if "://" not in raw:
        raw = "https://" + raw
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        raise UnsafeTarget("invalid_url", "URL could not be parsed") from None

    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        raise UnsafeTarget("bad_scheme", "Only http and https are allowed")
    if "@" in parts.netloc:
        raise UnsafeTarget("credentials", "URLs with credentials are not allowed")
    host = parts.hostname
    if not host:
        raise UnsafeTarget("invalid_url", "URL has no host")

    port = port or (443 if scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise UnsafeTarget("bad_port", "Only ports 80 and 443 are allowed")

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None

    if ip is not None:
        if not is_public_ip(ip):
            raise UnsafeTarget("private_address", "Address is not publicly routable")
        host_ascii, literal = str(ip), True
    else:
        try:
            host_ascii = host.rstrip(".").encode("idna").decode("ascii").lower()
        except UnicodeError:
            raise UnsafeTarget("bad_host", "Hostname is invalid") from None
        if not _HOST_RE.match(host_ascii) or host_ascii.endswith(_BLOCKED_SUFFIXES):
            raise UnsafeTarget("bad_host", "Hostname is not a public domain name")
        literal = False

    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return Target(scheme, host_ascii, port, path, literal)


async def resolve_public(host: str, port: int) -> list[str]:
    """Resolve ``host`` and require every answer to be public (anti DNS-rebinding)."""
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        if not is_public_ip(literal):
            raise UnsafeTarget("private_address", "Address is not publicly routable")
        return [str(literal)]

    loop = asyncio.get_running_loop()
    try:
        infos = await asyncio.wait_for(loop.getaddrinfo(host, port, type=socket.SOCK_STREAM), timeout=5)
    except (TimeoutError, socket.gaierror, OSError):
        raise UnsafeTarget("dns_failed", "Hostname could not be resolved") from None

    addrs: list[str] = []
    for info in infos:
        ip = ipaddress.ip_address(str(info[4][0]).split("%")[0])
        if not is_public_ip(ip):
            raise UnsafeTarget("private_address", "Hostname resolves to a non-public address")
        if str(ip) not in addrs:
            addrs.append(str(ip))
    if not addrs:
        raise UnsafeTarget("dns_failed", "Hostname has no addresses")
    return addrs
