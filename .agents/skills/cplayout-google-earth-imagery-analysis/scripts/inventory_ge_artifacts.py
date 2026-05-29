#!/usr/bin/env python3
"""Inventory local Google Earth screenshots, KML, and KMZ artifacts.

This script is intentionally read-only. It does not launch Google Earth,
geocode, call the network, infer geometry, or mutate CPLayout project files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".bmp"}
KML_SUFFIXES = {".kml"}
KMZ_SUFFIXES = {".kmz"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_dimensions(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    try:
        data = path.read_bytes()
    except OSError as error:
        return {"error": str(error)}

    if suffix == ".png" and data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return {"width": width, "height": height, "format": "png"}

    if suffix in {".jpg", ".jpeg"}:
        return jpeg_dimensions(data)

    if suffix == ".gif" and data[:6] in {b"GIF87a", b"GIF89a"} and len(data) >= 10:
        width, height = struct.unpack("<HH", data[6:10])
        return {"width": width, "height": height, "format": "gif"}

    if suffix == ".bmp" and data.startswith(b"BM") and len(data) >= 26:
        width, height = struct.unpack("<ii", data[18:26])
        return {"width": abs(width), "height": abs(height), "format": "bmp"}

    return {"error": "Unsupported or unrecognized image header."}


def jpeg_dimensions(data: bytes) -> dict[str, Any]:
    if not data.startswith(b"\xff\xd8"):
        return {"error": "Unrecognized JPEG header."}

    index = 2
    while index < len(data):
        while index < len(data) and data[index] == 0xFF:
            index += 1
        if index >= len(data):
            break
        marker = data[index]
        index += 1
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(data):
            break
        segment_length = struct.unpack(">H", data[index:index + 2])[0]
        if segment_length < 2 or index + segment_length > len(data):
            break
        if (
            marker in range(0xC0, 0xC4)
            or marker in range(0xC5, 0xC8)
            or marker in range(0xC9, 0xCC)
            or marker in range(0xCD, 0xD0)
        ):
            if segment_length >= 7:
                height, width = struct.unpack(">HH", data[index + 3:index + 7])
                return {"width": width, "height": height, "format": "jpeg"}
        index += segment_length

    return {"error": "JPEG dimensions not found."}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def summarize_kml_bytes(data: bytes) -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(data)
    except ElementTree.ParseError as error:
        return {"parse_error": str(error)}

    counts: dict[str, int] = {
        "placemark_count": 0,
        "style_count": 0,
        "style_map_count": 0,
        "style_url_count": 0,
        "extended_data_count": 0,
        "polygon_count": 0,
        "line_string_count": 0,
        "point_count": 0,
        "look_at_count": 0,
        "coordinates_count": 0,
    }

    for element in root.iter():
        name = local_name(element.tag)
        if name == "Placemark":
            counts["placemark_count"] += 1
        elif name == "Style":
            counts["style_count"] += 1
        elif name == "StyleMap":
            counts["style_map_count"] += 1
        elif name == "styleUrl":
            counts["style_url_count"] += 1
        elif name == "ExtendedData":
            counts["extended_data_count"] += 1
        elif name == "Polygon":
            counts["polygon_count"] += 1
        elif name == "LineString":
            counts["line_string_count"] += 1
        elif name == "Point":
            counts["point_count"] += 1
        elif name == "LookAt":
            counts["look_at_count"] += 1
        elif name == "coordinates":
            text = element.text or ""
            counts["coordinates_count"] += len([item for item in text.split() if item.strip()])

    return counts


def summarize_kml_file(path: Path) -> dict[str, Any]:
    try:
        return summarize_kml_bytes(path.read_bytes())
    except OSError as error:
        return {"error": str(error)}


def summarize_kmz(path: Path) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(path) as archive:
            members = sorted(info.filename for info in archive.infolist())
            kml_members = [member for member in members if member.lower().endswith(".kml")]
            selected_kml = "doc.kml" if "doc.kml" in kml_members else (
                kml_members[0] if len(kml_members) == 1 else None
            )
            summary: dict[str, Any] = {
                "member_count": len(members),
                "members": members,
                "kml_members": kml_members,
                "has_doc_kml": "doc.kml" in members,
                "selected_kml": selected_kml,
            }
            if selected_kml:
                summary["kml_summary"] = summarize_kml_bytes(archive.read(selected_kml))
            return summary
    except (OSError, zipfile.BadZipFile) as error:
        return {"error": str(error)}


def inventory_path(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
    }
    if not path.exists():
        return result
    if not path.is_file():
        result["error"] = "Path is not a file."
        return result

    stat = path.stat()
    suffix = path.suffix.lower()
    result.update({
        "size_bytes": stat.st_size,
        "sha256": sha256_file(path),
        "suffix": suffix,
    })

    if suffix in IMAGE_SUFFIXES:
        result["kind"] = "image"
        result["image"] = image_dimensions(path)
    elif suffix in KML_SUFFIXES:
        result["kind"] = "kml"
        result["kml"] = summarize_kml_file(path)
    elif suffix in KMZ_SUFFIXES:
        result["kind"] = "kmz"
        result["kmz"] = summarize_kmz(path)
    else:
        result["kind"] = "unknown"
    return result


def render_markdown(items: list[dict[str, Any]]) -> str:
    lines = ["# Google Earth Artifact Inventory", ""]
    for item in items:
        lines.append(f"## `{item['path']}`")
        if not item.get("exists"):
            lines.extend(["", "- exists: false", ""])
            continue
        lines.extend([
            "",
            f"- kind: {item.get('kind')}",
            f"- size_bytes: {item.get('size_bytes')}",
            f"- sha256: `{item.get('sha256')}`",
        ])
        if item.get("kind") == "image":
            image = item.get("image", {})
            lines.append(f"- image: {json.dumps(image, sort_keys=True)}")
        elif item.get("kind") == "kml":
            lines.append(f"- kml: {json.dumps(item.get('kml', {}), sort_keys=True)}")
        elif item.get("kind") == "kmz":
            kmz = item.get("kmz", {})
            compact = {key: value for key, value in kmz.items() if key != "members"}
            lines.append(f"- kmz: {json.dumps(compact, sort_keys=True)}")
            lines.append(f"- members: {json.dumps(kmz.get('members', []), sort_keys=True)}")
        if item.get("error"):
            lines.append(f"- error: {item['error']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inventory local Google Earth screenshot, KML, and KMZ artifacts.")
    parser.add_argument("paths", nargs="+", help="Artifact paths to inspect.")
    parser.add_argument(
        "--format",
        choices=["json", "markdown"],
        default="json",
        help="Output format. Defaults to json.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    items = [inventory_path(Path(path)) for path in args.paths]
    if args.format == "markdown":
        sys.stdout.write(render_markdown(items))
    else:
        json.dump({"artifacts": items}, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
