from __future__ import annotations

import argparse
import json
import math
import sys
import zipfile
from pathlib import Path
from typing import Any

MODEL_NAME = "baseline-local-layout-ranker"
MODEL_VERSION = "0.1.0"
SCHEMA_VERSION = "cplayout-model-recommendations-v1"
DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cplayout-ml")
    subcommands = parser.add_subparsers(dest="command", required=True)

    subcommands.add_parser("probe-gpu", help="Verify WSL NVIDIA and PyTorch CUDA visibility.")

    recommend = subcommands.add_parser("recommend-layout", help="Generate deterministic advisory layout recommendations.")
    recommend.add_argument("--input", required=True, type=Path, help="CPLayout project.json or .center-pivot.zip")
    recommend.add_argument("--output-dir", required=True, type=Path, help="Directory for model-recommendations outputs")
    recommend.add_argument("--max-alternatives", type=int, default=5)
    recommend.add_argument(
      "--created-at",
      default=DEFAULT_CREATED_AT,
      help="ISO timestamp to write into recommendations. Defaults to a stable fixture timestamp for deterministic output.",
    )

    args = parser.parse_args(argv)
    if args.command == "probe-gpu":
        return probe_gpu()
    if args.command == "recommend-layout":
        return recommend_layout(args.input, args.output_dir, args.max_alternatives, args.created_at)
    parser.error("Unsupported command.")
    return 2


def probe_gpu() -> int:
    try:
        import torch  # type: ignore
    except Exception as exc:
        print(f"PyTorch import failed: {exc}", file=sys.stderr)
        return 1

    available = bool(torch.cuda.is_available())
    device_count = int(torch.cuda.device_count()) if available else 0
    devices = [torch.cuda.get_device_name(index) for index in range(device_count)]
    payload = {
      "torchVersion": torch.__version__,
      "cudaAvailable": available,
      "cudaRuntime": torch.version.cuda,
      "deviceCount": device_count,
      "devices": devices,
    }
    print(json.dumps(payload, indent=2))
    if not available or not any("RTX" in name.upper() for name in devices):
        print("CUDA probe failed: expected an RTX-class NVIDIA GPU visible to PyTorch.", file=sys.stderr)
        return 1
    return 0


def recommend_layout(input_path: Path, output_dir: Path, max_alternatives: int, created_at: str) -> int:
    project = load_project(input_path)
    validate_project(project)
    recommendations = build_recommendations(project, max(1, min(max_alternatives, 12)), created_at)
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "model-recommendations.json"
    geojson_path = output_dir / "model-recommendations.geojson"
    json_path.write_text(json.dumps(recommendations, indent=2) + "\n", encoding="utf-8")
    geojson_path.write_text(json.dumps(recommendations_to_geojson(recommendations), indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
      "projectId": project["id"],
      "projectCrs": project["projectCrs"],
      "recommendationCount": len(recommendations),
      "json": str(json_path),
      "geojson": str(geojson_path),
      "gpuBacked": False,
      "note": "Deterministic advisory baseline; run probe-gpu separately before treating outputs as GPU-backed.",
    }, indent=2))
    return 0


def load_project(input_path: Path) -> dict[str, Any]:
    if input_path.suffix == ".zip" or input_path.name.endswith(".center-pivot.zip"):
        with zipfile.ZipFile(input_path) as archive:
            with archive.open("project.json") as handle:
                return unwrap_project_document(json.loads(handle.read().decode("utf-8")))
    return unwrap_project_document(json.loads(input_path.read_text(encoding="utf-8")))


def unwrap_project_document(input_data: dict[str, Any]) -> dict[str, Any]:
    project = input_data.get("project")
    if isinstance(project, dict):
        return project
    return input_data


def validate_project(project: dict[str, Any]) -> None:
    for key in ["id", "projectCrs", "fieldBoundary", "pivotCenter", "machine"]:
        if key not in project:
            raise SystemExit(f"Project is missing required field: {key}")
    if project["projectCrs"] == "EPSG:4326":
        raise SystemExit("CPLayout canonical project geometry must use a projected/local CRS, not EPSG:4326.")
    if len(project["fieldBoundary"]) < 3:
        raise SystemExit("Project fieldBoundary must contain at least three projected XY vertices.")


def build_recommendations(project: dict[str, Any], max_alternatives: int, created_at: str) -> list[dict[str, Any]]:
    pivot = project["pivotCenter"]
    boundary = project["fieldBoundary"]
    centroid = polygon_centroid(boundary)
    offsets = [
      (0.0, 0.0, "current pivot center baseline"),
      ((centroid["x"] - pivot["x"]) * 0.25, (centroid["y"] - pivot["y"]) * 0.25, "quarter step toward field centroid"),
      ((centroid["x"] - pivot["x"]) * 0.5, (centroid["y"] - pivot["y"]) * 0.5, "half step toward field centroid"),
      (12.0, 0.0, "east sensitivity check"),
      (-12.0, 0.0, "west sensitivity check"),
      (0.0, 12.0, "north sensitivity check"),
      (0.0, -12.0, "south sensitivity check"),
    ][:max_alternatives]
    scored = []
    for index, (dx, dy, label) in enumerate(offsets):
        candidate = {"x": round(float(pivot["x"]) + dx, 3), "y": round(float(pivot["y"]) + dy, 3)}
        distance_to_centroid = math.hypot(candidate["x"] - centroid["x"], candidate["y"] - centroid["y"])
        radius = machine_radius(project["machine"])
        boundary_radius = average_radius(boundary, centroid)
        fit_penalty = abs(radius - boundary_radius) / max(boundary_radius, 1.0)
        score = max(0.0, min(100.0, 100.0 - distance_to_centroid / 12.0 - fit_penalty * 20.0))
        confidence = max(0.35, min(0.78, 0.72 - index * 0.04))
        scored.append({
          "id": f"{project['id']}:baseline-rec-{index + 1}",
          "projectId": project["id"],
          "modelName": MODEL_NAME,
          "modelVersion": MODEL_VERSION,
          "createdAt": created_at,
          "projectCrs": project["projectCrs"],
          "summary": f"Review {label}.",
          "proposedGeometry": {
            "projectCrs": project["projectCrs"],
            "pivotCenter": candidate,
          },
          "confidence": round(confidence, 3),
          "evidenceIds": [],
          "reviewStatus": "unreviewed",
          "score": round(score, 3),
          "warnings": [
            "Advisory deterministic baseline; not a production-trained agronomy model.",
            "Acceptance records a review decision only and must not mutate canonical geometry in this milestone.",
          ],
        })
    return sorted(scored, key=lambda item: item["score"], reverse=True)


def recommendations_to_geojson(recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    features = []
    for recommendation in recommendations:
        pivot = recommendation["proposedGeometry"].get("pivotCenter")
        properties = {
          "id": recommendation["id"],
          "projectId": recommendation["projectId"],
          "projectCrs": recommendation["projectCrs"],
          "coordinateReferenceSystem": "project_crs_xy",
          "createdAt": recommendation["createdAt"],
          "modelName": recommendation["modelName"],
          "modelVersion": recommendation["modelVersion"],
          "confidence": recommendation["confidence"],
          "reviewStatus": recommendation["reviewStatus"],
          "score": recommendation["score"],
          "summary": recommendation["summary"],
          "warnings": recommendation["warnings"],
          "evidenceIds": recommendation["evidenceIds"],
          "geometryRole": "pivot_center",
        }
        features.append({
          "type": "Feature",
          "geometry": {"type": "Point", "coordinates": [pivot["x"], pivot["y"]]},
          "properties": properties,
        })
    return {
      "type": "FeatureCollection",
      "schemaVersion": SCHEMA_VERSION,
      "name": "cplayout-model-recommendations",
      "coordinateReferenceSystem": "project_crs_xy",
      "canonicalGeometryMutation": False,
      "features": features,
    }


def polygon_centroid(points: list[dict[str, Any]]) -> dict[str, float]:
    return {
      "x": sum(float(point["x"]) for point in points) / len(points),
      "y": sum(float(point["y"]) for point in points) / len(points),
    }


def average_radius(points: list[dict[str, Any]], center: dict[str, float]) -> float:
    return sum(math.hypot(float(point["x"]) - center["x"], float(point["y"]) - center["y"]) for point in points) / len(points)


def machine_radius(machine: dict[str, Any]) -> float:
    return sum(float(span) for span in machine["spanLengthsMeters"]) + float(machine.get("overhangMeters", 0))


if __name__ == "__main__":
    raise SystemExit(main())
