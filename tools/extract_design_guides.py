#!/usr/bin/env python3
"""Extract local design-guide PDF metadata and text with system tools only."""

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
REPORT_ROOT = ROOT / "reports" / "design-guides"

GUIDES = [
    {
        "guideId": "local-ethernet-daughter-card-0970036",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Design Guides/PDFs/Design Guides/Ethernet Daughter Card Application Guide 0970036_eng.pdf",
    },
    {
        "guideId": "local-gps-guidance-0970012",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Design Guides/PDFs/Design Guides/GPS Guidance Design Guide 0970012_eng.pdf",
    },
    {
        "guideId": "local-precision-corner-0999428",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Design Guides/PDFs/Corner Design Guides/Precision Corner Design Guide 0999428_eng.pdf",
    },
    {
        "guideId": "local-vflex-corner-0998325",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Design Guides/PDFs/Corner Design Guides/VFlex Corner Design Guide pn 0998325_eng.pdf",
    },
    {
        "guideId": "local-pivot-design-0998236",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Design Guides/PDFs/Design Guides/Pivot Design Guide 0998236_eng.pdf",
    },
    {
        "guideId": "local-linear-design-0998240",
        "path": "/mnt/c/Program Files (x86)/v2o/VManuals/Design Guides/PDFs/Design Guides/Valley Linear Design Guide 0998240_eng.pdf",
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
        "guides": [],
    }

    sha_lines: list[str] = []
    for guide in GUIDES:
        guide_id = guide["guideId"]
        pdf_path = Path(guide["path"])
        if not pdf_path.exists():
            raise SystemExit(f"Missing local PDF for {guide_id}: {pdf_path}")
        pdf_sha = sha256(pdf_path)
        info_path = run_dir / f"{guide_id}.pdfinfo.txt"
        qpdf_path = run_dir / f"{guide_id}.qpdf-check.txt"
        text_path = run_dir / f"{guide_id}.text.txt"
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
        manifest["guides"].append({
            "guideId": guide_id,
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
    if tool == "sha256sum":
        command = [tool, "--version"]
    elif tool == "qpdf":
        command = [tool, "--version"]
    else:
        command = [tool, "-v"]
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
