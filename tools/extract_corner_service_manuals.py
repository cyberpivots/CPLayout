#!/usr/bin/env python3
"""Extract local corner service-manual PDF metadata and text into ignored reports."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT_ROOT = ROOT / "reports" / "corner-service-manuals"

MANUALS = [
    {
        "manualId": "local-valley-corner-service",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Service and Assembly Manuals/Service Manuals/Corner SM/Valley Corner.pdf",
    },
    {
        "manualId": "local-vflex-corner-service",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Service and Assembly Manuals/Service Manuals/Corner SM/VFlex Corner.pdf",
    },
    {
        "manualId": "local-precision-corner-service",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Service and Assembly Manuals/Service Manuals/Corner SM/Precision Corner.pdf",
    },
    {
        "manualId": "local-dualspan-corner-service",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Service and Assembly Manuals/Service Manuals/Corner SM/DualSpan Corner.pdf",
    },
    {
        "manualId": "local-corner-service-index",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Service and Assembly Manuals/Service Manuals/Corner SM/Corner Service Manuals Index.pdf",
    },
]

REQUIRED_TOOLS = ("pdfinfo", "pdftotext", "qpdf", "sha256sum")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = parser.parse_args()

    missing = [tool for tool in REQUIRED_TOOLS if shutil.which(tool) is None]
    if missing:
        print(f"Missing required tools: {', '.join(missing)}", file=sys.stderr)
        print("Install poppler-utils and qpdf, then rerun. Extraction is blocked by design.", file=sys.stderr)
        return 2

    run_dir = REPORT_ROOT / args.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "runId": args.run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "toolVersions": {tool: tool_version(tool) for tool in REQUIRED_TOOLS},
        "manuals": [],
    }

    sha_lines: list[str] = []
    for manual in MANUALS:
        manual_id = manual["manualId"]
        pdf_path = Path(manual["path"])
        if not pdf_path.exists():
            raise SystemExit(f"Missing local PDF for {manual_id}: {pdf_path}")
        pdf_sha = sha256(pdf_path)
        info_path = run_dir / f"{manual_id}.pdfinfo.txt"
        qpdf_path = run_dir / f"{manual_id}.qpdf-check.txt"
        text_path = run_dir / f"{manual_id}.text.txt"
        run_captured(["pdfinfo", str(pdf_path)], info_path)
        run_captured(["qpdf", "--check", str(pdf_path)], qpdf_path, allowed_returncodes={0, 3})
        run_generated(["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), str(text_path)], text_path)
        text_sha = sha256(text_path)
        info_sha = sha256(info_path)
        qpdf_sha = sha256(qpdf_path)
        sha_lines.extend([
            f"{pdf_sha}  {pdf_path}",
            f"{info_sha}  {info_path.name}",
            f"{qpdf_sha}  {qpdf_path.name}",
            f"{text_sha}  {text_path.name}",
        ])
        manifest["manuals"].append({
            "manualId": manual_id,
            "localSourcePath": str(pdf_path),
            "sourceSha256": pdf_sha,
            "pdfInfoArtifact": info_path.name,
            "pdfInfoSha256": info_sha,
            "qpdfCheckArtifact": qpdf_path.name,
            "qpdfCheckSha256": qpdf_sha,
            "rawTextArtifact": text_path.name,
            "rawTextSha256": text_sha,
        })

    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (run_dir / "SHA256SUMS.txt").write_text("\n".join(sha_lines) + "\n", encoding="utf-8")
    print(run_dir)
    return 0


def run_captured(command: list[str], output_path: Path, allowed_returncodes: set[int] | None = None) -> None:
    ok_returncodes = allowed_returncodes if allowed_returncodes is not None else {0}
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    output_path.write_text(result.stdout, encoding="utf-8")
    if result.returncode not in ok_returncodes:
        raise SystemExit(f"{command[0]} failed for {output_path.name}; see {output_path}")


def run_generated(command: list[str], output_path: Path, allowed_returncodes: set[int] | None = None) -> None:
    ok_returncodes = allowed_returncodes if allowed_returncodes is not None else {0}
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    if result.returncode not in ok_returncodes:
        if result.stdout:
            print(result.stdout, file=sys.stderr)
        raise SystemExit(f"{command[0]} failed for {output_path.name}")
    if not output_path.exists():
        raise SystemExit(f"{command[0]} did not create {output_path.name}")


def tool_version(tool: str) -> str:
    command = [tool, "--version"] if tool in {"qpdf", "sha256sum"} else [tool, "-v"]
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return result.stdout.splitlines()[0] if result.stdout else f"{tool} returncode {result.returncode}"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


if __name__ == "__main__":
    raise SystemExit(main())
