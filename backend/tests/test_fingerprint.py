from app import fingerprint


def names(dets):
    return {(d.name, d.kind) for d in dets}


def test_cloudflare_from_headers_and_cookie():
    dets = fingerprint.detect(
        {"server": "cloudflare", "cf-ray": "8a1b2c-TPE", "cf-cache-status": "HIT"},
        ["__cf_bm"],
        [],
        ["bob.ns.cloudflare.com"],
        ["CLOUDFLARENET, US"],
    )
    cf = [d for d in dets if d.name == "Cloudflare" and d.kind == "cdn"][0]
    assert cf.confidence == "high"
    assert ("Cloudflare", "waf") in names(dets)
    assert ("Cloudflare DNS", "dns") in names(dets)


def test_cloudfront_by_cname_only():
    dets = fingerprint.detect({}, [], ["d111111abcdef8.cloudfront.net"], [], [])
    assert ("Amazon CloudFront", "cdn") in names(dets)


def test_akamai_bot_manager_cookie():
    dets = fingerprint.detect({}, ["_abck", "ak_bmsc"], [], [], [])
    assert ("Akamai Bot Manager", "waf") in names(dets)


def test_no_signals_gives_empty():
    assert fingerprint.detect({"server": "nginx"}, [], [], [], []) == []


def test_evidence_does_not_duplicate_and_orders_by_confidence():
    dets = fingerprint.detect({"x-amz-request-id": "1", "x-amz-cf-id": "2"}, [], [], [], [])
    assert dets[0].confidence == "high"
    assert len(dets[0].evidence) == len(set(dets[0].evidence))


def test_security_header_report():
    report = fingerprint.security_headers({"Strict-Transport-Security": "max-age=1"})
    assert report["strict-transport-security"] is True
    assert report["content-security-policy"] is False


def test_github_header_is_platform_not_pages():
    dets = fingerprint.detect({"x-github-request-id": "ABC"}, [], [], [], [])
    assert ("GitHub", "platform") in names(dets)
    assert not any(d.name == "GitHub Pages" for d in dets)
