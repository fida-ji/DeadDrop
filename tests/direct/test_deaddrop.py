"""Direct-mode tests for the DeadDrop intelligent contract.

Run: pytest tests/direct/ -v

These run in-memory (no server). The adjudication model is mocked, so they
exercise business logic, the drop lifecycle, escrow settlement, and access
control. Validator consensus is exercised separately in integration tests.
"""
from conftest import (
    CONTRACT,
    ONE_GEN,
    SAMPLE_PACKAGE,
    SAMPLE_RUBRIC,
    addr_hex,
    mock_verdict,
)


def _open_drop(direct_vm, direct_deploy, poster, escrow=ONE_GEN, expiration=3600):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = poster
    direct_vm.deal(poster, escrow * 4)
    direct_vm.value = escrow
    drop_id = contract.create_drop_request("corporate-misconduct", SAMPLE_RUBRIC, expiration)
    direct_vm.value = 0
    return contract, drop_id


# --------------------------------------------------------------------------- #
# create_drop_request
# --------------------------------------------------------------------------- #
def test_create_drop_stores_state(direct_vm, direct_deploy, direct_alice):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice, 2 * ONE_GEN)
    assert int(drop_id) == 0
    d = contract.get_drop(drop_id)
    assert d["poster"].lower() == addr_hex(direct_alice)
    assert d["status"] == "open"
    assert d["escrow_amount"] == str(2 * ONE_GEN)
    assert d["category"] == "corporate-misconduct"
    assert d["outcome"] == "pending"
    assert d["fee_bps"] == 100
    assert contract.get_drop_count() == 1


def test_create_rejects_zero_escrow(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with direct_vm.expect_revert("must escrow a non-zero bounty"):
        contract.create_drop_request("cat", SAMPLE_RUBRIC, 3600)


def test_create_rejects_thin_rubric(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.deal(direct_alice, 2 * ONE_GEN)
    direct_vm.value = ONE_GEN
    with direct_vm.expect_revert("rubric must be specific"):
        contract.create_drop_request("cat", "too short", 3600)
    direct_vm.value = 0


# --------------------------------------------------------------------------- #
# submit_evidence
# --------------------------------------------------------------------------- #
def test_submit_evidence_sets_source_and_status(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xabc123")
    d = contract.get_drop(drop_id)
    assert d["status"] == "submitted"
    assert d["source"].lower() == addr_hex(direct_bob)
    assert d["content_hash"] == "0xabc123"
    assert d["evidence_package"] == SAMPLE_PACKAGE
    assert d["submitted_at"] > 0


def test_submit_rejects_thin_package(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("evidence package must be substantive"):
        contract.submit_evidence(drop_id, "too short", "0xabc")


def test_submit_rejects_second_submission(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("drop is not open"):
        contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash2")


# --------------------------------------------------------------------------- #
# adjudicate
# --------------------------------------------------------------------------- #
def test_adjudicate_meets_criteria(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash")

    mock_verdict(direct_vm, meets=True, confidence=88, reasoning="Two consistent emails predate recall.")
    direct_vm.sender = direct_bob
    result = contract.adjudicate(drop_id)
    assert result == "met"
    d = contract.get_drop(drop_id)
    assert d["status"] == "adjudicated"
    assert d["verdict"] is True
    assert d["confidence"] == 88
    assert d["adjudicated_at"] > 0
    assert d["settle_after_ts"] > d["adjudicated_at"]


def test_adjudicate_does_not_meet(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash")

    mock_verdict(direct_vm, meets=False, confidence=20, reasoning="Only one email, no dates.")
    result = contract.adjudicate(drop_id)
    assert result == "not_met"
    d = contract.get_drop(drop_id)
    assert d["verdict"] is False
    assert d["status"] == "adjudicated"


def test_adjudicate_requires_submission(direct_vm, direct_deploy, direct_alice):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    with direct_vm.expect_revert("no submission to adjudicate"):
        contract.adjudicate(drop_id)


# --------------------------------------------------------------------------- #
# settle
# --------------------------------------------------------------------------- #
def test_settle_released_pays_source(direct_vm, direct_deploy, direct_owner, direct_bob):
    # owner deploys so we can shrink the appeal window
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_owner
    contract.set_appeal_window(10)

    direct_vm.deal(direct_owner, 4 * ONE_GEN)
    direct_vm.value = ONE_GEN
    drop_id = contract.create_drop_request("corporate-misconduct", SAMPLE_RUBRIC, 3600)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash")
    mock_verdict(direct_vm, meets=True)
    contract.adjudicate(drop_id)

    # move past the appeal window
    direct_vm.warp("2035-01-01T00:00:00Z")
    result = contract.settle(drop_id)
    assert result == "released"
    d = contract.get_drop(drop_id)
    assert d["status"] == "settled"
    assert d["outcome"] == "released"
    # 1% fee: source receives 0.99 GEN
    net = ONE_GEN - (ONE_GEN * 100) // 10000
    assert d["paid_amount"] == str(net)


def test_settle_refunded_returns_poster(direct_vm, direct_deploy, direct_owner, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_owner
    contract.set_appeal_window(10)
    direct_vm.deal(direct_owner, 4 * ONE_GEN)
    direct_vm.value = ONE_GEN
    drop_id = contract.create_drop_request("corporate-misconduct", SAMPLE_RUBRIC, 3600)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash")
    mock_verdict(direct_vm, meets=False)
    contract.adjudicate(drop_id)

    direct_vm.warp("2035-01-01T00:00:00Z")
    result = contract.settle(drop_id)
    assert result == "refunded"
    d = contract.get_drop(drop_id)
    assert d["status"] == "settled"
    assert d["outcome"] == "refunded"
    assert d["paid_amount"] == str(ONE_GEN)  # full refund, no fee


def test_settle_blocked_during_appeal_window(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash")
    mock_verdict(direct_vm, meets=True)
    contract.adjudicate(drop_id)  # default 24h window
    with direct_vm.expect_revert("appeal window is still open"):
        contract.settle(drop_id)


def test_settle_requires_adjudication(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    contract.submit_evidence(drop_id, SAMPLE_PACKAGE, "0xhash")
    with direct_vm.expect_revert("not awaiting settlement"):
        contract.settle(drop_id)


# --------------------------------------------------------------------------- #
# expire_drop
# --------------------------------------------------------------------------- #
def test_expire_refunds_poster_after_expiry(direct_vm, direct_deploy, direct_alice):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice, ONE_GEN, expiration=3600)
    direct_vm.warp("2035-01-01T00:00:00Z")
    contract.expire_drop(drop_id)
    d = contract.get_drop(drop_id)
    assert d["status"] == "expired"
    assert d["outcome"] == "refunded"
    assert d["paid_amount"] == str(ONE_GEN)


def test_expire_blocked_before_expiry(direct_vm, direct_deploy, direct_alice):
    contract, drop_id = _open_drop(direct_vm, direct_deploy, direct_alice, ONE_GEN, expiration=3600)
    with direct_vm.expect_revert("has not expired yet"):
        contract.expire_drop(drop_id)


# --------------------------------------------------------------------------- #
# owner config + views
# --------------------------------------------------------------------------- #
def test_fee_config_owner_only(direct_vm, direct_deploy, direct_owner, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("owner only"):
        contract.set_fee_bps(250)
    direct_vm.sender = direct_owner
    contract.set_fee_bps(250)
    assert contract.get_protocol_config()["fee_bps"] == 250


def test_fee_cap_enforced(direct_vm, direct_deploy, direct_owner):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("fee capped at 10%"):
        contract.set_fee_bps(2000)


def test_list_drops_newest_first(direct_vm, direct_deploy, direct_alice):
    contract, _ = _open_drop(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    contract.create_drop_request("environmental", SAMPLE_RUBRIC, 3600)
    direct_vm.value = 0
    page = contract.list_drops(0, 10)
    assert len(page) == 2
    assert page[0]["id"] == 1
    assert page[1]["id"] == 0
