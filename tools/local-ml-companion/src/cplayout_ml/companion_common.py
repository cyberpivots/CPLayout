from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path
from typing import Any

PROJECT_REVIEW_DATA_SCHEMA_VERSION = "cplayout-project-review-data-v1"
MODEL_RECOMMENDATIONS_SCHEMA_VERSION = "cplayout-model-recommendations-v1"
COMPANION_PACKET_VERSION = "cplayout-companion-evidence-packet-v1"
DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z"
LOCAL_BIND_HOSTS = {"127.0.0.1", "localhost", "::1"}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_artifact(path: Path, base_dir: Path | None = None) -> dict[str, Any]:
    resolved = path if path.is_absolute() else (base_dir or Path.cwd()) / path
    if not resolved.exists():
        raise SystemExit(f"Companion artifact does not exist: {resolved}")
    return {
        "path": str(path),
        "resolvedPath": str(resolved),
        "sha256": sha256_file(resolved),
        "byteLength": resolved.stat().st_size,
    }


def reject_hidden_keys(value: Any, path: str = "root") -> None:
    if isinstance(value, list):
        for index, item in enumerate(value):
            reject_hidden_keys(item, f"{path}[{index}]")
        return
    if not isinstance(value, dict):
        return
    if value.get("keyedService") is True:
        raise SystemExit(f"{path} declares keyedService: true; companion tooling must stay no-key and local/offline.")
    for key, item in value.items():
        key_lower = str(key).lower()
        if key_lower in {"apikey", "api_key", "accesstoken", "access_token", "secretkey", "secret_key"} and isinstance(item, str) and item:
            raise SystemExit(f"{path}.{key} contains a hidden key or token.")
        reject_hidden_keys(item, f"{path}.{key}")


def normalize_crs_name(crs: str) -> str:
    return crs.strip().upper().replace(" ", "")


def is_geographic_crs_name(crs: str | None) -> bool:
    if not crs:
        return False
    normalized = normalize_crs_name(crs)
    epsg = re.match(r"^EPSG:(\d+)$", normalized)
    epsg_code = int(epsg.group(1)) if epsg else None
    return (
        normalized in {"EPSG:4326", "CRS:84", "OGC:CRS84"}
        or "WGS84" in normalized
        or "+PROJ=LONGLAT" in normalized
        or "LONGITUDE" in normalized
        or "LATITUDE" in normalized
        or "GEOGCS" in normalized
        or "GEOGRAPHIC" in normalized
        or (epsg_code is not None and 4000 <= epsg_code < 5000)
    )


def is_supported_projected_crs(crs: str | None) -> bool:
    if not crs or is_geographic_crs_name(crs):
        return False
    normalized = normalize_crs_name(crs)
    if normalized in {"EPSG:3857", "EPSG:900913", "LOCAL"} or normalized.startswith("LOCAL:"):
        return True
    epsg = re.match(r"^EPSG:(\d+)$", normalized)
    if not epsg:
        return False
    code = int(epsg.group(1))
    utm_zone = code % 100
    return (
        (
            32601 <= code <= 32660
            or 32701 <= code <= 32760
            or 26901 <= code <= 26960
            or 26701 <= code <= 26760
        )
        and 1 <= utm_zone <= 60
    )


def require_projected_crs(project_crs: str, label: str) -> None:
    if not is_supported_projected_crs(project_crs):
        raise SystemExit(f"{label} requires a supported projected/local CRS, not {project_crs}.")


def load_project(input_path: Path) -> dict[str, Any]:
    if input_path.suffix == ".zip" or input_path.name.endswith(".center-pivot.zip"):
        with zipfile.ZipFile(input_path) as archive:
            with archive.open("project.json") as handle:
                data = json.loads(handle.read().decode("utf-8"))
    else:
        data = load_json(input_path)
    project = data.get("project") if isinstance(data, dict) else None
    return project if isinstance(project, dict) else data


def validate_project_reference(project: dict[str, Any], project_id: str | None = None, project_crs: str | None = None) -> None:
    for key in ["id", "projectCrs", "fieldBoundary", "pivotCenter", "machine"]:
        if key not in project:
            raise SystemExit(f"Project reference is missing required field: {key}")
    require_projected_crs(str(project["projectCrs"]), "Project reference")
    if project_id is not None and project["id"] != project_id:
        raise SystemExit(f"Project reference {project['id']} does not match project id {project_id}.")
    if project_crs is not None and project["projectCrs"] != project_crs:
        raise SystemExit(f"Project reference CRS {project['projectCrs']} does not match {project_crs}.")
    if len(project["fieldBoundary"]) < 3:
        raise SystemExit("Project reference fieldBoundary must contain at least three projected XY vertices.")


def safe_id(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.:-]+", "-", value.strip())
    return cleaned.strip("-") or "unnamed"


def closed_ring(points: list[dict[str, float]]) -> list[list[float]]:
    coordinates = [[float(point["x"]), float(point["y"])] for point in points]
    if coordinates and coordinates[0] != coordinates[-1]:
        coordinates.append(coordinates[0])
    return coordinates


def ensure_local_bind(host: str) -> None:
    if host not in LOCAL_BIND_HOSTS:
        raise SystemExit("Companion services may bind only to localhost by default.")


def resolve_workspace_path(
    workspace: Path,
    path_value: str | Path,
    label: str,
    *,
    must_exist: bool = True,
    require_file: bool = False,
) -> Path:
    root = workspace.resolve()
    raw_path = Path(path_value)
    candidate = raw_path if raw_path.is_absolute() else root / raw_path
    resolved = candidate.resolve(strict=False)
    if resolved != root and root not in resolved.parents:
        raise SystemExit(f"{label} path must stay under the configured workspace.")
    if must_exist and not resolved.exists():
        raise SystemExit(f"{label} path does not exist: {resolved}")
    if require_file and resolved.exists() and not resolved.is_file():
        raise SystemExit(f"{label} path must be a file: {resolved}")
    return resolved


def timestamp_id(created_at: str) -> str:
    return re.sub(r"[^0-9]", "", created_at)[:17] or "undated"


def number_or_default(value: Any, default: float) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(0.0, min(1.0, float(value)))
    return default
