"""Shared fixtures and mock helpers for DeadDrop direct-mode tests."""
import json
from pathlib import Path

# repo root = tests/direct/conftest.py -> parents[2]
CONTRACT = str(Path(__file__).resolve().parents[2] / "contracts" / "deaddrop.py")

ONE_GEN = 10**18


def mock_verdict(direct_vm, meets: bool, confidence: int = 90, reasoning: str = "ok"):
    """Mock the adjudication model verdict for the evaluation prompt."""
    direct_vm.mock_llm(
        r".*independent evaluators.*",
        json.dumps(
            {"meets_criteria": meets, "confidence": confidence, "reasoning": reasoning}
        ),
    )


def addr_hex(a) -> str:
    """Normalize a test-fixture address (Address or bytes) to lowercase 0x hex."""
    if hasattr(a, "as_hex"):
        return a.as_hex.lower()
    return ("0x" + bytes(a).hex()).lower()


SAMPLE_RUBRIC = (
    "Evidence must include at least two internal communications showing awareness "
    "of the safety defect before the recall date, with consistent dates and named "
    "roles."
)

SAMPLE_PACKAGE = (
    "Two internal emails (redacted) dated 2023-01-14 and 2023-02-02 between the QA "
    "lead and the VP of Engineering discussing the brake sensor failure rate of 3.2 "
    "percent, four months before the public recall. Metadata markers and message "
    "IDs preserved. Full thread committed via content hash."
)
