"""The signature tables are data a person edits: catch typos before they reach production."""

import re

import pytest

from app import signatures as sig

CONFIDENCES = {"low", "medium", "high"}
KINDS = {"cdn", "waf", "cloud", "platform", "hosting", "dns"}


def test_header_rules_are_well_formed():
    seen = set()
    for name, kind, header, pattern, conf in sig.HEADER_RULES:
        assert kind in KINDS and conf in CONFIDENCES, (name, header)
        assert header == header.lower(), f"header names are matched lower-case: {header}"
        if pattern is not None:
            re.compile(pattern)
        row = (name, kind, header, pattern)
        assert row not in seen, f"duplicate rule {row}"
        seen.add(row)


def test_cookie_rules_compile_and_use_lower_case_patterns():
    for name, kind, pattern, conf in sig.COOKIE_RULES:
        assert kind in KINDS and conf in CONFIDENCES, name
        re.compile(pattern, re.I)
        assert not re.search(r"[A-Z]", re.sub(r"\\[A-Za-z]", "", pattern)), (
            f"cookie names are lower-cased: {pattern}"
        )


def test_asn_rules_compile():
    for provider, kind, pattern in sig.ASN_RULES:
        assert kind in KINDS, provider
        re.compile(pattern, re.I)


@pytest.mark.parametrize("table", [sig.CNAME_SUFFIXES])
def test_cname_suffixes_are_bare_domains(table):
    for name, kind, suffix in table:
        assert kind in KINDS, name
        assert suffix == suffix.lower() and not suffix.startswith(".") and "." in suffix, suffix


def test_ns_fragments_are_lower_case():
    for provider, needle in sig.NS_SUFFIXES:
        assert needle == needle.lower(), provider


def test_security_and_server_header_lists_are_lower_case():
    for h in (*sig.SECURITY_HEADERS, *sig.SERVER_HEADERS):
        assert h == h.lower()
