# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json
import typing
from dataclasses import dataclass
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# DeadDrop
#
# A trustless protocol for adjudicating anonymous whistleblower evidence.
#
# A bounty poster escrows funds against a natural-language rubric describing the
# evidence they want. An anonymous source submits a structured evidence package
# (summaries, redacted excerpts, metadata, and a content hash that commits to the
# full documents, never the raw files themselves). GenLayer validators each read
# the rubric and the package, reason about whether the package meets the criteria,
# and reach consensus on a single boolean verdict. If the evidence meets the
# threshold the escrow releases to the source minus a protocol fee; otherwise it
# refunds the poster. Settlement happens only after an appeal window closes.
#
# Lifecycle: open -> submitted -> adjudicated -> settled | expired
# ---------------------------------------------------------------------------

# Error classification prefixes. Deterministic errors must match across
# validators; transient errors may both fail; malformed model output forces a
# leader rotation by making validators disagree.
ERROR_EXPECTED = "[EXPECTED]"    # business logic (deterministic)
ERROR_TRANSIENT = "[TRANSIENT]"  # infrastructure / model unavailable
ERROR_LLM = "[LLM_ERROR]"        # malformed model output

# Lifecycle states.
STATUS_OPEN = "open"
STATUS_SUBMITTED = "submitted"
STATUS_ADJUDICATED = "adjudicated"
STATUS_SETTLED = "settled"
STATUS_EXPIRED = "expired"

# Verdict labels stored on settlement for display.
OUTCOME_PENDING = "pending"
OUTCOME_RELEASED = "released"   # met criteria, paid the source
OUTCOME_REFUNDED = "refunded"   # did not meet criteria, refunded the poster

# Protocol fee cap: 10%.
MAX_FEE_BPS = 1000

ZERO_ADDRESS = Address(bytes(20))


@allow_storage
@dataclass
class Drop:
    poster: Address
    category: str
    rubric: str                 # plain-language evaluation criteria
    escrow_amount: u256         # escrowed funds, in wei
    fee_bps_snapshot: u256      # protocol fee captured at creation
    expiration_ts: u256         # epoch seconds; open drop expires after this
    status: str                 # open | submitted | adjudicated | settled | expired
    source: Address             # ZERO until a source submits
    evidence_package: str       # structured, redacted evidence text
    content_hash: str           # commitment to the full off-chain evidence
    submitted_at: u256          # epoch seconds of submission (0 if none)
    adjudicated_at: u256        # epoch seconds of adjudication (0 if none)
    settle_after_ts: u256       # epoch seconds; settle allowed at/after this
    verdict: bool               # True iff evidence met the criteria
    confidence: u256            # model confidence, 0-100
    reasoning: str              # one-line justification from adjudication
    outcome: str                # pending | released | refunded
    paid_amount: u256           # net wei paid out on settlement (0 until settled)
    created_at: str             # ISO-8601, pinned to tx timestamp (display)


# EOA payouts are expressed through the EVM interface. An empty interface lets us
# emit a native value transfer to any address.
@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


def _now() -> int:
    """Current transaction time in epoch seconds.

    Inside deterministic contract code GenVM pins this to the transaction
    timestamp, so every validator observes the same value.
    """
    return int(datetime.now(timezone.utc).timestamp())


def _coerce_json(raw: typing.Any) -> dict:
    """Return a dict from either a parsed dict or a raw JSON string.

    LLMs sometimes wrap JSON in prose or markdown fences even with
    response_format='json', so parse defensively.
    """
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise gl.vm.UserError(f"{ERROR_LLM} model returned {type(raw).__name__}")
    text = raw.strip()
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last < first:
        raise gl.vm.UserError(f"{ERROR_LLM} no JSON object in model output")
    try:
        return json.loads(text[first : last + 1])
    except (ValueError, TypeError):
        raise gl.vm.UserError(f"{ERROR_LLM} unparseable JSON in model output")


def _as_bool(value: typing.Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1", "meets", "met", "pass")
    return False


def _as_score(value: typing.Any) -> int:
    try:
        n = int(round(float(str(value).strip())))
    except (ValueError, TypeError):
        return 0
    return max(0, min(100, n))


def _hex(addr: typing.Any) -> str:
    """Normalize an address (Address or raw bytes) to a checksum 0x hex string."""
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    return Address(addr).as_hex


def _pick(data: dict, *keys: str) -> typing.Any:
    for k in keys:
        if k in data:
            return data[k]
    return None


def _handle_leader_error(leaders_res: gl.vm.Result, leader_fn) -> bool:
    """Validator-side comparison when the leader returned an error.

    Deterministic (business-logic) errors must match exactly; transient failures
    on both sides agree; anything else disagrees to force a leader rotation.
    """
    leader_msg = getattr(leaders_res, "message", "")
    try:
        leader_fn()
        return False  # leader errored, validator succeeded -> disagree
    except gl.vm.UserError as e:
        validator_msg = getattr(e, "message", None) or str(e)
        if validator_msg.startswith(ERROR_EXPECTED):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(
            ERROR_TRANSIENT
        ):
            return True
        return False
    except Exception:
        return False


class DeadDrop(gl.Contract):
    # --- protocol config ---
    owner: Address
    fee_recipient: Address
    fee_bps: u256               # basis points taken from a successful payout
    appeal_window_secs: u256    # cooldown between adjudication and settlement

    # --- drops ---
    drop_count: u256
    drops: TreeMap[u256, Drop]

    def __init__(self) -> None:
        self.owner = gl.message.sender_address
        self.fee_recipient = gl.message.sender_address
        self.fee_bps = u256(100)            # 1% default
        self.appeal_window_secs = u256(86400)  # 24h default; owner may adjust
        self.drop_count = u256(0)

    # ------------------------------------------------------------------ #
    # Poster: open a drop request and escrow funds
    # ------------------------------------------------------------------ #
    @gl.public.write.payable
    def create_drop_request(
        self, category: str, rubric: str, expiration_secs: u256
    ) -> u256:
        """Escrow the sent value against a rubric. Returns the new drop id.

        `expiration_secs` is how long the drop stays open for submissions.
        """
        escrow = gl.message.value
        if escrow == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} must escrow a non-zero bounty")
        if len(rubric.strip()) < 16:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} rubric must be specific (>= 16 chars)"
            )
        if len(category.strip()) == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} category must not be empty")
        if int(expiration_secs) <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} expiration must be > 0 seconds")

        drop_id = self.drop_count
        now = _now()
        self.drops[drop_id] = Drop(
            poster=gl.message.sender_address,
            category=category,
            rubric=rubric,
            escrow_amount=escrow,
            fee_bps_snapshot=self.fee_bps,
            expiration_ts=u256(now + int(expiration_secs)),
            status=STATUS_OPEN,
            source=ZERO_ADDRESS,
            evidence_package="",
            content_hash="",
            submitted_at=u256(0),
            adjudicated_at=u256(0),
            settle_after_ts=u256(0),
            verdict=False,
            confidence=u256(0),
            reasoning="",
            outcome=OUTCOME_PENDING,
            paid_amount=u256(0),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.drop_count = drop_id + u256(1)
        return drop_id

    # ------------------------------------------------------------------ #
    # Source: submit a structured evidence package
    # ------------------------------------------------------------------ #
    @gl.public.write
    def submit_evidence(
        self, drop_id: u256, evidence_package: str, content_hash: str
    ) -> None:
        """Anonymous source attaches a structured evidence package to an open drop.

        The package is redacted, summarized text. `content_hash` commits to the
        full off-chain evidence, which is handed over out of band after settlement.
        """
        drop = self._require_drop(drop_id)
        if drop.status != STATUS_OPEN:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} drop is not open")
        if _now() >= int(drop.expiration_ts):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} drop has expired")
        if len(evidence_package.strip()) < 32:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} evidence package must be substantive (>= 32 chars)"
            )
        if len(content_hash.strip()) == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} content_hash must not be empty")

        drop.source = gl.message.sender_address
        drop.evidence_package = evidence_package
        drop.content_hash = content_hash
        drop.submitted_at = u256(_now())
        drop.status = STATUS_SUBMITTED

    # ------------------------------------------------------------------ #
    # Adjudication: validators judge the package against the rubric
    # ------------------------------------------------------------------ #
    @gl.public.write
    def adjudicate(self, drop_id: u256) -> str:
        """Run consensus adjudication of a submitted drop.

        Each validator independently evaluates the evidence package against the
        rubric and must agree on the boolean verdict. This does not decide whether
        the evidence is true in the world; it decides whether the package, taken at
        face value, satisfies the criteria the poster defined.
        """
        drop = self._require_drop(drop_id)
        if drop.status != STATUS_SUBMITTED:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} drop has no submission to adjudicate")

        verdict = self._evaluate(drop.rubric, drop.evidence_package)

        drop.verdict = bool(verdict.get("meets_criteria"))
        drop.confidence = u256(_as_score(verdict.get("confidence")))
        drop.reasoning = str(verdict.get("reasoning", ""))[:512]
        drop.adjudicated_at = u256(_now())
        drop.settle_after_ts = u256(_now() + int(self.appeal_window_secs))
        drop.status = STATUS_ADJUDICATED
        return "met" if drop.verdict else "not_met"

    def _evaluate(self, rubric: str, evidence_package: str) -> dict:
        prompt = (
            "You are one of several independent evaluators in a decentralized "
            "adjudication. Decide ONLY whether the submitted evidence package, "
            "taken at face value, satisfies the poster's criteria. You are NOT "
            "verifying whether the claims are true in the real world; you are "
            "judging whether the package meets the stated rubric.\n\n"
            f"RUBRIC (criteria defined by the poster):\n{rubric}\n\n"
            f"EVIDENCE PACKAGE (submitted by an anonymous source):\n{evidence_package}\n\n"
            "Consider: does it address the category sought; is it internally "
            "consistent; does it contain specific, verifiable detail; does it meet "
            "any quantity or quality thresholds in the rubric; are there obvious "
            "signs of fabrication. Be objective and conservative: if a required "
            "element is missing, it does NOT meet the criteria.\n"
            'Respond ONLY as JSON: {"meets_criteria": true|false, '
            '"confidence": <integer 0-100>, "reasoning": "<one sentence>"}'
        )

        def leader_fn() -> dict:
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            data = _coerce_json(raw)
            meets = _pick(data, "meets_criteria", "meets", "compliant", "passed", "verdict")
            conf = _pick(data, "confidence", "score", "certainty")
            reason = _pick(data, "reasoning", "reason", "justification", "analysis")
            return {
                "meets_criteria": _as_bool(meets),
                "confidence": _as_score(conf),
                "reasoning": str(reason if reason is not None else "")[:512],
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            # Boolean equivalence: validators must agree on meets_criteria.
            return bool(mine["meets_criteria"]) == bool(leader["meets_criteria"])

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    # ------------------------------------------------------------------ #
    # Settlement: release to source or refund poster after the appeal window
    # ------------------------------------------------------------------ #
    @gl.public.write
    def settle(self, drop_id: u256) -> str:
        """Settle an adjudicated drop once the appeal window has closed.

        Verdict true: pay the source the escrow minus the protocol fee, and send
        the fee to the fee recipient. Verdict false: refund the poster in full.
        """
        drop = self._require_drop(drop_id)
        if drop.status != STATUS_ADJUDICATED:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} drop is not awaiting settlement")
        if _now() < int(drop.settle_after_ts):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} appeal window is still open")

        escrow = drop.escrow_amount

        if drop.verdict:
            fee = (escrow * drop.fee_bps_snapshot) // u256(10000)
            net = escrow - fee
            drop.paid_amount = net
            drop.outcome = OUTCOME_RELEASED
            drop.status = STATUS_SETTLED
            if net > u256(0):
                _Payee(drop.source).emit_transfer(value=net)
            if fee > u256(0):
                _Payee(self.fee_recipient).emit_transfer(value=fee)
            return OUTCOME_RELEASED

        drop.paid_amount = escrow
        drop.outcome = OUTCOME_REFUNDED
        drop.status = STATUS_SETTLED
        if escrow > u256(0):
            _Payee(drop.poster).emit_transfer(value=escrow)
        return OUTCOME_REFUNDED

    @gl.public.write
    def expire_drop(self, drop_id: u256) -> None:
        """Refund the poster if an open drop received no submission before expiry."""
        drop = self._require_drop(drop_id)
        if drop.status != STATUS_OPEN:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only open drops can expire")
        if _now() < int(drop.expiration_ts):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} drop has not expired yet")

        refund = drop.escrow_amount
        drop.paid_amount = refund
        drop.outcome = OUTCOME_REFUNDED
        drop.status = STATUS_EXPIRED
        if refund > u256(0):
            _Payee(drop.poster).emit_transfer(value=refund)

    # ------------------------------------------------------------------ #
    # Owner: protocol configuration
    # ------------------------------------------------------------------ #
    @gl.public.write
    def set_fee_recipient(self, new_recipient: Address) -> None:
        self._require_owner()
        self.fee_recipient = new_recipient

    @gl.public.write
    def set_fee_bps(self, new_bps: u256) -> None:
        self._require_owner()
        if int(new_bps) > MAX_FEE_BPS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} fee capped at 10%")
        self.fee_bps = new_bps

    @gl.public.write
    def set_appeal_window(self, new_secs: u256) -> None:
        self._require_owner()
        self.appeal_window_secs = new_secs

    # ------------------------------------------------------------------ #
    # Views
    # ------------------------------------------------------------------ #
    @gl.public.view
    def get_protocol_config(self) -> dict:
        return {
            "owner": _hex(self.owner),
            "fee_recipient": _hex(self.fee_recipient),
            "fee_bps": int(self.fee_bps),
            "appeal_window_secs": int(self.appeal_window_secs),
            "drop_count": int(self.drop_count),
            "max_fee_bps": MAX_FEE_BPS,
        }

    @gl.public.view
    def get_drop_count(self) -> int:
        return int(self.drop_count)

    @gl.public.view
    def get_drop(self, drop_id: u256) -> dict:
        drop = self._require_drop(drop_id)
        return self._drop_to_dict(int(drop_id), drop)

    @gl.public.view
    def list_drops(self, offset: u256, limit: u256) -> list:
        """Return a page of drops, newest first."""
        total = int(self.drop_count)
        start = int(offset)
        count = int(limit)
        if count <= 0 or count > 100:
            count = 50
        out: list = []
        # newest first: iterate from (total-1-start) downward
        idx = total - 1 - start
        while idx >= 0 and len(out) < count:
            key = u256(idx)
            if key in self.drops:
                out.append(self._drop_to_dict(idx, self.drops[key]))
            idx -= 1
        return out

    def _drop_to_dict(self, drop_id: int, d: Drop) -> dict:
        return {
            "id": drop_id,
            "poster": _hex(d.poster),
            "category": d.category,
            "rubric": d.rubric,
            "escrow_amount": str(int(d.escrow_amount)),
            "fee_bps": int(d.fee_bps_snapshot),
            "expiration_ts": int(d.expiration_ts),
            "status": d.status,
            "source": _hex(d.source),
            "evidence_package": d.evidence_package,
            "content_hash": d.content_hash,
            "submitted_at": int(d.submitted_at),
            "adjudicated_at": int(d.adjudicated_at),
            "settle_after_ts": int(d.settle_after_ts),
            "verdict": bool(d.verdict),
            "confidence": int(d.confidence),
            "reasoning": d.reasoning,
            "outcome": d.outcome,
            "paid_amount": str(int(d.paid_amount)),
            "created_at": d.created_at,
        }

    # ------------------------------------------------------------------ #
    # Internal guards
    # ------------------------------------------------------------------ #
    def _require_drop(self, drop_id: u256) -> Drop:
        if drop_id not in self.drops:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} drop not found")
        return self.drops[drop_id]

    def _require_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} owner only")
