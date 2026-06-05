#!/usr/bin/env python3
"""Validate committed CPLayout design-guide metadata docs."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOC_ROOT = ROOT / "docs" / "design-guides"

EXPECTED_GUIDES = {
    "local-ethernet-daughter-card-0970036": "f4fbb039f12ffa84f1b33535f47724e853e5bea613bab78ecf4cfd035b5368e3",
    "local-gps-guidance-0970012": "885ea94bffd9b31a50e359b0369a711c190935bb55f88cfda67a2f8fe668c967",
    "local-precision-corner-0999428": "6507f2555207141309adcb89c3669c4bc40129987a41c10abbad0130696de2d0",
    "local-vflex-corner-0998325": "ecd9ec9b4e81a9725471faee88e70d4ebfba5fce644e9f6b350df0be9a8fb95c",
    "local-pivot-design-0998236": "9e19c886b86ef353ad8f3b050cb8be0ba010720c1159f21f8d2574e53365677e",
    "local-linear-design-0998240": "27f40421dc469600830a6382db4a60a9b41d258cdc8d6766d48b1000043fdf33",
}

REQUIRED_DOCS = (
    "README.md",
    "pdf-inventory.md",
    "topic-index.md",
)

REQUIRED_LIMITS = (
    "advisoryOnly",
    "notEngineeringCertification",
    "canonicalGeometryMutationFalse",
    "qualifiedReviewRequired",
    "evidenceOnly",
    "noGoogleEarthRenderProof",
    "noPaidKeyedCloudImagery",
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
        return fail(["docs/design-guides/ is missing"])

    reject_raw_artifacts(errors)

    for rel in REQUIRED_DOCS:
        path = DOC_ROOT / rel
        if not path.exists():
            errors.append(f"Missing {path.relative_to(ROOT)}")

    inventory = read(DOC_ROOT / "pdf-inventory.md")
    for guide_id, sha in EXPECTED_GUIDES.items():
        if guide_id not in inventory:
            errors.append(f"pdf-inventory.md missing guide id {guide_id}")
        if sha not in inventory:
            errors.append(f"pdf-inventory.md missing sha256 for {guide_id}")

    guide_statuses: list[str | None] = []
    for guide_id, sha in EXPECTED_GUIDES.items():
        guide_path = DOC_ROOT / "guides" / f"{guide_id}.md"
        if not guide_path.exists():
            errors.append(f"Missing guide summary {guide_path.relative_to(ROOT)}")
            continue
        text = read(guide_path)
        require_field(errors, guide_path, text, "Guide ID", guide_id)
        require_field(errors, guide_path, text, "SHA-256", sha)
        require_field(errors, guide_path, text, "Extraction status", None)
        require_field(errors, guide_path, text, "Advisory limit", None)
        for limit in REQUIRED_LIMITS:
            if limit not in text:
                errors.append(f"{guide_path.relative_to(ROOT)} missing limit {limit}")
        status = field_value(text, "Extraction status")
        guide_statuses.append(status)
        if status == "complete":
            require_complete_topics(errors, guide_path, guide_id, sha, text)
        elif status != "blocked_missing_pdf_tools":
            errors.append(f"{guide_path.relative_to(ROOT)} has unsupported extraction status {status!r}")

    topic_index = read(DOC_ROOT / "topic-index.md")
    for match in re.finditer(r"guideId=([a-z0-9-]+)", topic_index):
        guide_id = match.group(1)
        if guide_id not in EXPECTED_GUIDES:
            errors.append(f"topic-index.md references unknown guideId {guide_id}")
    blocked_phrase = "No local PDF topics are source-quoted until extraction completes"
    has_blocked_guides = any(status == "blocked_missing_pdf_tools" for status in guide_statuses)
    if has_blocked_guides and blocked_phrase not in topic_index:
        errors.append("topic-index.md must record the blocked local-PDF topic boundary")
    if not has_blocked_guides and blocked_phrase in topic_index:
        errors.append("topic-index.md still records blocked local-PDF topic boundary after complete extraction")

    if errors:
        return fail(errors)
    print("design guide docs validation passed")
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
            errors.append(f"Raw extraction artifact must stay out of docs: {path.relative_to(ROOT)}")


def require_complete_topics(errors: list[str], path: Path, guide_id: str, sha: str, text: str) -> None:
    topic_rows = [
        line
        for line in text.splitlines()
        if line.startswith("|") and "topicId=" in line
    ]
    if not topic_rows:
        errors.append(f"{path.relative_to(ROOT)} complete extraction missing topic rows")
        return
    required_patterns = (
        r"topicId=[a-z0-9-]+",
        rf"guideId={re.escape(guide_id)}",
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
