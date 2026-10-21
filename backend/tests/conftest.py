"""Tests must never reach the real network.

The outermost clients of this process are the system resolver (used by
``resolve_public``) and the dnspython resolver (``netinfo._make_resolver``).
Both are replaced for every test; individual tests install their own fakes.
"""

import socket

import pytest


def _blocked(*_a, **_k):
    raise RuntimeError("network access is blocked in tests")


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _blocked)
    monkeypatch.setattr("app.netinfo._make_resolver", _blocked)
    from app import netinfo

    netinfo._asn_cache.clear()
