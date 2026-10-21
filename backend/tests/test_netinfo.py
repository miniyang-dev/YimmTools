"""ASN / PTR parsing against a fake DNS resolver (the real one is blocked in tests)."""

import pytest

from app import netinfo


class _Rdata:
    def __init__(self, text: str):
        self.strings = [text.encode()]


class _Target:
    def __init__(self, name: str):
        self.target = name


class FakeResolver:
    def __init__(self, table: dict[tuple[str, str], list]):
        self.table = table
        self.asked: list[tuple[str, str]] = []

    async def resolve(self, name, rtype):
        self.asked.append((rtype, name))
        try:
            return self.table[(rtype, name)]
        except KeyError:
            import dns.resolver

            raise dns.resolver.NXDOMAIN() from None


def install(monkeypatch, table):
    fake = FakeResolver(table)
    monkeypatch.setattr(netinfo, "_make_resolver", lambda: fake)
    return fake


def test_origin_query_names():
    assert netinfo._origin_query("1.2.3.4") == "4.3.2.1.origin.asn.cymru.com"
    q6 = netinfo._origin_query("2001:db8::1")
    assert q6.endswith(".origin6.asn.cymru.com") and q6.startswith("1.0.0.0.")


async def test_asn_lookup_parses_and_strips_country_suffix(monkeypatch):
    fake = install(
        monkeypatch,
        {
            ("TXT", "34.216.184.93.origin.asn.cymru.com"): [
                _Rdata("15133 | 93.184.216.0/24 | US | ripencc | 2008-06-02")
            ],
            ("TXT", "AS15133.asn.cymru.com"): [_Rdata("15133 | US | arin | 2008-06-02 | EDGECAST, US")],
        },
    )
    info = await netinfo.asn_lookup("93.184.216.34")
    assert info == {"asn": 15133, "prefix": "93.184.216.0/24", "country": "US", "as_name": "EDGECAST"}
    await netinfo.asn_lookup("93.184.216.34")  # cached: no second round of queries
    assert len(fake.asked) == 2


async def test_asn_lookup_unknown_ip_returns_none(monkeypatch):
    install(monkeypatch, {})
    assert await netinfo.asn_lookup("93.184.216.35") is None


async def test_ptr_lookup(monkeypatch):
    install(monkeypatch, {("PTR", "34.216.184.93.in-addr.arpa."): [_Target("host.example.com.")]})
    assert await netinfo.ptr_lookup("93.184.216.34") == "host.example.com"
    assert await netinfo.ptr_lookup("not-an-ip") is None


async def test_cname_chain_stops_on_loop(monkeypatch):
    install(
        monkeypatch,
        {
            ("CNAME", "a.example.com"): [_Target("b.example.com.")],
            ("CNAME", "b.example.com"): [_Target("a.example.com.")],
        },
    )
    chain = await netinfo.cname_chain("a.example.com")
    assert chain == ["b.example.com", "a.example.com"]


async def test_ns_records_walks_up_to_the_zone(monkeypatch):
    install(monkeypatch, {("NS", "example.com"): [_Target("NS2.example.net."), _Target("ns1.example.net.")]})
    assert await netinfo.ns_records("www.sub.example.com") == ["ns1.example.net", "ns2.example.net"]


@pytest.mark.parametrize("env,expected", [("2", 2), ("0", 0), ("-3", 0), ("abc", 0)])
def test_proxy_hops_parsing(monkeypatch, env, expected):
    from app.ratelimit import proxy_hops

    monkeypatch.setenv("YIMM_PROXY_HOPS", env)
    assert proxy_hops() == expected
