from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .companion_common import (
    DEFAULT_CREATED_AT,
    file_artifact,
    is_geographic_crs_name,
    is_supported_projected_crs,
    load_json,
    reject_hidden_keys,
    require_projected_crs,
    safe_id,
    write_json,
)

RASTER_FIXTURES_SCHEMA_VERSION = "cplayout-raster-fixtures-v1"


def prepare_raster_fixtures(
    manifest_path: Path,
    output_dir: Path,
    project_id: str | None = None,
    project_crs: str | None = None,
    require_projected_output: bool = False,
    created_at: str = DEFAULT_CREATED_AT,
) -> int:
    manifest = load_json(manifest_path)
    reject_hidden_keys(manifest)
    manifest_dir = manifest_path.parent
    resolved_project_id = project_id or manifest.get("projectId")
    resolved_project_crs = project_crs or manifest.get("projectCrs")
    if resolved_project_crs is not None:
        require_projected_crs(str(resolved_project_crs), "Raster fixture project CRS")
    entries = fixture_entries(manifest)
    records = [raster_fixture_record(manifest_dir, entry, index) for index, entry in enumerate(entries)]
    failures = []
    for record in records:
        metadata = record["rasterMetadata"]
        if require_projected_output and not metadata.get("projectedOutputEligible"):
            failures.append(f"{record['id']}: {metadata.get('projectionWarning') or 'missing projected raster CRS'}")
    if failures:
        raise SystemExit("Projected raster output was requested but fixture CRS validation failed: " + "; ".join(failures))

    payload = {
        "schemaVersion": RASTER_FIXTURES_SCHEMA_VERSION,
        "createdAt": created_at,
        "projectId": resolved_project_id,
        "projectCrs": resolved_project_crs,
        "manifest": file_artifact(manifest_path),
        "fixtureCount": len(records),
        "fixtures": records,
        "projectedOutputRequested": require_projected_output,
        "projectedOutputEligible": bool(records) and all(record["rasterMetadata"].get("projectedOutputEligible") for record in records),
        "localProvenance": {
            "networkRequired": False,
            "keyedService": False,
            "hiddenKeysAllowed": False,
            "canonicalGeometryMutation": False,
        },
        "networkRequired": False,
        "keyedService": False,
        "hiddenKeysAllowed": False,
        "canonicalGeometryMutation": False,
    }
    output_path = output_dir / "raster-fixture-metadata.json"
    write_json(output_path, payload)
    print(json.dumps({
        "metadata": str(output_path),
        "fixtureCount": len(records),
        "projectedOutputEligible": payload["projectedOutputEligible"],
        "networkRequired": False,
        "canonicalGeometryMutation": False,
    }, indent=2, sort_keys=True))
    return 0


def fixture_entries(manifest: dict[str, Any]) -> list[Any]:
    entries = manifest.get("rasters", manifest.get("fixtures", manifest.get("artifacts", [])))
    if not isinstance(entries, list) or not entries:
        raise SystemExit("Raster fixture manifest must contain a non-empty rasters, fixtures, or artifacts array.")
    return entries


def raster_fixture_record(manifest_dir: Path, entry: Any, index: int) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise SystemExit("Each raster fixture entry must be an object.")
    reject_hidden_keys(entry)
    fixture_id = safe_id(str(entry.get("id") or entry.get("name") or f"raster-{index + 1}"))
    path_value = entry.get("path") or entry.get("rasterPath") or entry.get("raster") or entry.get("artifactPath")
    if not isinstance(path_value, str) or not path_value:
        raise SystemExit(f"Raster fixture {fixture_id} must include path, rasterPath, raster, or artifactPath.")
    artifact = file_artifact(Path(path_value), manifest_dir)
    metadata = read_raster_metadata(Path(artifact["resolvedPath"]))
    return {
        "id": fixture_id,
        "artifact": artifact,
        "provenance": entry.get("provenance", {}),
        "calibrationStatus": entry.get("calibrationStatus", "unverified"),
        "rasterMetadata": metadata,
        "networkRequired": False,
        "keyedService": False,
        "canonicalGeometryMutation": False,
    }


def read_raster_metadata(path: Path) -> dict[str, Any]:
    try:
        import rasterio  # type: ignore
    except Exception as exc:
        return {
            "reader": "rasterio",
            "available": False,
            "path": str(path),
            "crs": None,
            "projectedOutputEligible": False,
            "projectionWarning": f"rasterio unavailable: {exc}",
        }
    try:
        with rasterio.open(path) as dataset:
            crs = str(dataset.crs) if dataset.crs else None
            bounds = dataset.bounds
            is_geographic = bool(getattr(dataset.crs, "is_geographic", False)) if dataset.crs else False
            is_projected = bool(getattr(dataset.crs, "is_projected", False)) if dataset.crs else False
            projected = bool(crs and (is_projected or is_supported_projected_crs(crs)) and not is_geographic_crs_name(crs))
            warning = None
            if not crs:
                warning = "raster CRS is missing"
            elif is_geographic or is_geographic_crs_name(crs):
                warning = "raster CRS is geographic; projected XY output requires a projected/local CRS"
            elif not projected:
                warning = "raster CRS is not in the supported projected/local CRS allowlist"
            return {
                "reader": "rasterio",
                "available": True,
                "driver": dataset.driver,
                "width": dataset.width,
                "height": dataset.height,
                "bandCount": dataset.count,
                "dtypes": list(dataset.dtypes),
                "crs": crs,
                "isGeographic": is_geographic,
                "isProjected": is_projected,
                "transform": list(dataset.transform),
                "bounds": {
                    "left": bounds.left,
                    "bottom": bounds.bottom,
                    "right": bounds.right,
                    "top": bounds.top,
                },
                "projectedOutputEligible": projected,
                "projectionWarning": warning,
            }
    except Exception as exc:
        return {
            "reader": "rasterio",
            "available": True,
            "path": str(path),
            "crs": None,
            "projectedOutputEligible": False,
            "projectionWarning": f"raster metadata could not be read: {exc}",
        }
