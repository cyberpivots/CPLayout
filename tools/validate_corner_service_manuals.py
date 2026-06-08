#!/usr/bin/env python3
"""Validate committed CPLayout corner service-manual metadata docs."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOC_ROOT = ROOT / "docs" / "corner-service-manuals"

EXPECTED_MANUALS = {
    "local-valley-corner-service": "0b3f00b9532dbfafb04289d0ce2f7cf8da2b880b58d286238110a3fc0cde9248",
    "local-vflex-corner-service": "d7f95585d17af6c6ca759baa546cbbda19503c0719ea9201299507b9d57b599c",
    "local-precision-corner-service": "dfc5cba60e235d2be8820b5a6bd16afd7afba09f53eeeafa1bd6ad98006869ea",
    "local-dualspan-corner-service": "72ff4661265a207b5eb4b41aa212b614f5901c6f588e6c709fe59da1c247c4ec",
    "local-corner-service-index": "1f2a697f35a8c6da51edb71aa15c4b7f119fa681a3c758f8f65481388222b633",
}

REQUIRED_DOCS = (
    "README.md",
    "manual-inventory.md",
    "topic-index.md",
)

REQUIRED_LIMITS = (
    "advisoryOnly",
    "notEngineeringCertification",
    "canonicalGeometryMutationFalse",
    "qualifiedReviewRequired",
    "evidenceOnly",
    "notProprietaryKinematicsProof",
    "notControllerCompatibilityProof",
    "noControllerPayloadExport",
    "noVendorBinaryReverseEngineering",
    "appImportableFalse",
    "writesProjectDatabaseFalse",
    "projectArchiveExportFalse",
    "projectSchemaChangeFalse",
)

DENIED_DOC_ARTIFACT_NAMES = {
    "manifest.json",
    "SHA256SUMS.txt",
}

DENIED_DOC_ARTIFACT_SUFFIXES = (
    ".pdf",
    ".text.txt",
    ".pdfinfo.txt",
    ".qpdf-check.txt",
)


def main() -> int:
    errors: list[str] = []
    if not DOC_ROOT.exists():
        return fail(["docs/corner-service-manuals/ is missing"])

    reject_raw_artifacts(errors)

    for rel in REQUIRED_DOCS:
        path = DOC_ROOT / rel
        if not path.exists():
            errors.append(f"Missing {path.relative_to(ROOT)}")

    inventory = read(DOC_ROOT / "manual-inventory.md")
    for manual_id, sha in EXPECTED_MANUALS.items():
        if manual_id not in inventory:
            errors.append(f"manual-inventory.md missing manual id {manual_id}")
        if sha not in inventory:
            errors.append(f"manual-inventory.md missing sha256 for {manual_id}")

    for manual_id, sha in EXPECTED_MANUALS.items():
        manual_path = DOC_ROOT / "manuals" / f"{manual_id}.md"
        if not manual_path.exists():
            errors.append(f"Missing manual summary {manual_path.relative_to(ROOT)}")
            continue
        text = read(manual_path)
        require_field(errors, manual_path, text, "Manual ID", manual_id)
        require_field(errors, manual_path, text, "SHA-256", sha)
        require_field(errors, manual_path, text, "Page count", None)
        require_field(errors, manual_path, text, "Extraction status", "metadata_curated")
        require_field(errors, manual_path, text, "Advisory limit", None)
        for limit in REQUIRED_LIMITS:
            if limit not in text:
                errors.append(f"{manual_path.relative_to(ROOT)} missing limit {limit}")
        require_curated_topics(errors, manual_path, manual_id, sha, text)

    topic_index = read(DOC_ROOT / "topic-index.md")
    for match in re.finditer(r"manualId=([a-z0-9-]+)", topic_index):
        manual_id = match.group(1)
        if manual_id not in EXPECTED_MANUALS:
            errors.append(f"topic-index.md references unknown manualId {manual_id}")

    if errors:
        return fail(errors)
    print("corner service manual docs validation passed")
    return 0


def require_field(errors: list[str], path: Path, text: str, label: str, expected: str | None) -> None:
    value = field_value(text, label)
    if value is None:
        errors.append(f"{path.relative_to(ROOT)} missing field {label}")
    elif expected is not None and value != expected:
        errors.append(f"{path.relative_to(ROOT)} {label} expected {expected!r}, got {value!r}")


def reject_raw_artifacts(errors: list[str]) -> None:
    for path in DOC_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.name in DENIED_DOC_ARTIFACT_NAMES or path.name.endswith(DENIED_DOC_ARTIFACT_SUFFIXES):
            errors.append(f"Raw service-manual artifact must stay out of docs: {path.relative_to(ROOT)}")


def require_curated_topics(errors: list[str], path: Path, manual_id: str, sha: str, text: str) -> None:
    topic_rows = [
        line
        for line in text.splitlines()
        if line.startswith("|") and "topicId=" in line
    ]
    if not topic_rows:
        errors.append(f"{path.relative_to(ROOT)} missing curated topic rows")
        return
    required_patterns = (
        r"topicId=[a-z0-9-]+",
        rf"manualId={re.escape(manual_id)}",
        r"page=\d+",
        r"lineRange=\d+-\d+",
        rf"sourceSha256={re.escape(sha)}",
    )
    for row in topic_rows:
        for pattern in required_patterns:
            if not re.search(pattern, row):
                errors.append(f"{path.relative_to(ROOT)} topic row missing marker {pattern}: {row}")
        for limit in REQUIRED_LIMITS:
            if limit not in row:
                errors.append(f"{path.relative_to(ROOT)} topic row missing limit {limit}: {row}")


def field_value(text: str, label: str) -> str | None:
    match = re.search(rf"^\*\*{re.escape(label)}:\*\*\s*(.+?)\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


def read(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def fail(errors: list[str]) -> int:
    for error in errors:
        print(error, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
