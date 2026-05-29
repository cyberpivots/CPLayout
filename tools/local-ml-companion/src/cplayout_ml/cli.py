from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

MODEL_NAME = "baseline-local-layout-ranker"
MODEL_VERSION = "0.1.0"
VISION_MODEL_NAME = "design-only-google-earth-vision-review"
VISION_MODEL_VERSION = "0.1.0"
SCHEMA_VERSION = "cplayout-model-recommendations-v1"
VISION_SCHEMA_VERSION = "cplayout-design-vision-review-v1"
DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z"
DEFAULT_VISION_THRESHOLDS = {
    "maxCenterOffsetRatio": 0.05,
    "maxRadiusMismatchRatio": 0.08,
    "minDetectionConfidence": 0.65,
    "minFieldBoundaryConfidence": 0.58,
}
SAM2_CONFIG_ENV = "CPLAYOUT_SAM2_CONFIG"
SAM2_CHECKPOINT_ENV = "CPLAYOUT_SAM2_CHECKPOINT"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cplayout-ml")
    subcommands = parser.add_subparsers(dest="command", required=True)

    subcommands.add_parser("probe-gpu", help="Verify WSL NVIDIA and PyTorch CUDA visibility.")

    boundary_probe = subcommands.add_parser("probe-boundary-detector", help="Report local OpenCV/SAM2 field-boundary detector availability.")
    boundary_probe.add_argument("--sam2-config", type=Path, help=f"SAM2 config path. Defaults to ${SAM2_CONFIG_ENV}.")
    boundary_probe.add_argument("--sam2-checkpoint", type=Path, help=f"SAM2 checkpoint path. Defaults to ${SAM2_CHECKPOINT_ENV}.")

    recommend = subcommands.add_parser("recommend-layout", help="Generate deterministic advisory layout recommendations.")
    recommend.add_argument("--input", required=True, type=Path, help="CPLayout project.json or .center-pivot.zip")
    recommend.add_argument("--output-dir", required=True, type=Path, help="Directory for model-recommendations outputs")
    recommend.add_argument("--max-alternatives", type=int, default=5)
    recommend.add_argument(
      "--created-at",
      default=DEFAULT_CREATED_AT,
      help="ISO timestamp to write into recommendations. Defaults to a stable fixture timestamp for deterministic output.",
    )

    vision = subcommands.add_parser("design-vision-review", help="Create a local design-only CV review from Google Earth proof artifacts.")
    vision.add_argument("--kml", required=True, type=Path, help="CPLayout browser-exported or proof KML opened in Google Earth Pro.")
    vision.add_argument("--kmz", required=True, type=Path, help="CPLayout browser-exported or proof KMZ for inventory/hash linkage.")
    vision.add_argument("--full-window", required=True, type=Path, help="Full Google Earth Pro screenshot with attribution visible.")
    vision.add_argument("--map-canvas", required=True, type=Path, help="Map-canvas crop from the same proof run.")
    vision.add_argument("--manifest", required=True, type=Path, help="Google Earth visual-fidelity manifest from the proof run.")
    vision.add_argument("--output-dir", required=True, type=Path, help="Directory for visual-layout-review outputs.")
    vision.add_argument("--project-id", required=True, help="CPLayout project id for review evidence linkage.")
    vision.add_argument("--project-crs", required=True, help="Projected CPLayout CRS; EPSG:4326 is rejected.")
    vision.add_argument(
      "--project-reference",
      type=Path,
      help="Optional accepted CPLayout project JSON or ZIP used as the projected-XY geometry source for recommendations.",
    )
    vision.add_argument(
      "--infer-field-boundary",
      action="store_true",
      help="Infer an advisory imagery field-boundary polygon from road, fence, tree-line, and field-separation cues.",
    )
    vision.add_argument("--sam2-config", type=Path, help=f"Optional SAM2 config path. Defaults to ${SAM2_CONFIG_ENV}.")
    vision.add_argument("--sam2-checkpoint", type=Path, help=f"Optional SAM2 checkpoint path. Defaults to ${SAM2_CHECKPOINT_ENV}.")
    vision.add_argument(
      "--created-at",
      default=DEFAULT_CREATED_AT,
      help="ISO timestamp to write into review records. Defaults to a stable fixture timestamp for deterministic output.",
    )

    args = parser.parse_args(argv)
    if args.command == "probe-gpu":
        return probe_gpu()
    if args.command == "probe-boundary-detector":
        return probe_boundary_detector(args.sam2_config, args.sam2_checkpoint)
    if args.command == "recommend-layout":
        return recommend_layout(args.input, args.output_dir, args.max_alternatives, args.created_at)
    if args.command == "design-vision-review":
        return design_vision_review(
            args.kml,
            args.kmz,
            args.full_window,
            args.map_canvas,
            args.manifest,
            args.output_dir,
            args.project_id,
            args.project_crs,
            args.project_reference,
            args.infer_field_boundary,
            args.sam2_config,
            args.sam2_checkpoint,
            args.created_at,
        )
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


def probe_boundary_detector(sam2_config_arg: Path | None, sam2_checkpoint_arg: Path | None) -> int:
    opencv = probe_opencv()
    sam2_config = configured_path(sam2_config_arg, SAM2_CONFIG_ENV)
    sam2_checkpoint = configured_path(sam2_checkpoint_arg, SAM2_CHECKPOINT_ENV)
    sam2 = probe_sam2(sam2_config, sam2_checkpoint)
    cuda = probe_cuda()
    payload = {
        "opencv": opencv,
        "sam2": sam2,
        "cuda": cuda,
        "offline": {
            "canRunOpenCvScoring": bool(opencv["available"] and opencv["houghCircles"] and opencv["houghLinesP"]),
            "canRunSam2Proposals": bool(sam2["available"] and sam2["configExists"] and sam2["checkpointExists"]),
            "networkRequired": False,
            "hiddenDownloads": False,
            "canRunOffline": bool(opencv["available"] and opencv["houghCircles"] and opencv["houghLinesP"]),
        },
    }
    print(json.dumps(payload, indent=2))
    return 0 if payload["offline"]["canRunOpenCvScoring"] else 1


def configured_path(value: Path | None, env_name: str) -> Path | None:
    if value is not None:
        return value
    env_value = os.environ.get(env_name)
    return Path(env_value) if env_value else None


def probe_opencv() -> dict[str, Any]:
    try:
        import cv2  # type: ignore
    except Exception as exc:
        return {"available": False, "error": str(exc), "houghCircles": False, "houghLinesP": False}
    return {
        "available": True,
        "version": getattr(cv2, "__version__", None),
        "houghCircles": hasattr(cv2, "HoughCircles"),
        "houghLinesP": hasattr(cv2, "HoughLinesP"),
        "grabCut": hasattr(cv2, "grabCut"),
        "watershed": hasattr(cv2, "watershed"),
    }


def probe_sam2(config_path: Path | None, checkpoint_path: Path | None) -> dict[str, Any]:
    import_status = sam2_import_status()
    return {
        "available": import_status["available"],
        "importError": import_status.get("error"),
        "configPath": str(config_path) if config_path is not None else None,
        "configExists": bool(config_path is not None and config_path.exists()),
        "checkpointPath": str(checkpoint_path) if checkpoint_path is not None else None,
        "checkpointExists": bool(checkpoint_path is not None and checkpoint_path.exists()),
        "configuredBy": {
            "configEnv": SAM2_CONFIG_ENV if os.environ.get(SAM2_CONFIG_ENV) else None,
            "checkpointEnv": SAM2_CHECKPOINT_ENV if os.environ.get(SAM2_CHECKPOINT_ENV) else None,
        },
        "note": "SAM2 is optional and must be installed/configured locally; this companion never downloads checkpoints.",
    }


def sam2_import_status() -> dict[str, Any]:
    try:
        import sam2  # type: ignore  # noqa: F401
    except Exception as exc:
        return {"available": False, "error": str(exc)}
    return {"available": True}


def probe_cuda() -> dict[str, Any]:
    try:
        import torch  # type: ignore
    except Exception as exc:
        return {"torchAvailable": False, "cudaAvailable": False, "error": str(exc)}
    cuda_available = bool(torch.cuda.is_available())
    return {
        "torchAvailable": True,
        "torchVersion": torch.__version__,
        "cudaAvailable": cuda_available,
        "cudaRuntime": torch.version.cuda,
        "deviceCount": int(torch.cuda.device_count()) if cuda_available else 0,
        "devices": [torch.cuda.get_device_name(index) for index in range(torch.cuda.device_count())] if cuda_available else [],
    }


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


def design_vision_review(
    kml_path: Path,
    kmz_path: Path,
    full_window_path: Path,
    map_canvas_path: Path,
    manifest_path: Path,
    output_dir: Path,
    project_id: str,
    project_crs: str,
    project_reference_path: Path | None,
    infer_field_boundary: bool,
    sam2_config_arg: Path | None,
    sam2_checkpoint_arg: Path | None,
    created_at: str,
) -> int:
    if project_crs == "EPSG:4326":
        raise SystemExit("Design vision review requires CPLayout projected/local XY CRS, not EPSG:4326.")
    paths = {
        "kml": kml_path,
        "kmz": kmz_path,
        "fullWindowScreenshot": full_window_path,
        "mapCanvasCrop": map_canvas_path,
        "visualFidelityManifest": manifest_path,
    }
    artifacts = {name: artifact_inventory(path) for name, path in paths.items()}
    manifest = load_json_with_bom(manifest_path)
    verify_manifest_linkage(manifest, artifacts)
    kml_text = kml_path.read_text(encoding="utf-8")
    look_at = extract_look_at_coordinate(kml_text)
    project_reference = load_project(project_reference_path) if project_reference_path else None
    if project_reference is not None:
        validate_project(project_reference)
        if project_reference["id"] != project_id:
            raise SystemExit(f"Project reference {project_reference['id']} does not match --project-id {project_id}.")
        if project_reference["projectCrs"] != project_crs:
            raise SystemExit(f"Project reference CRS {project_reference['projectCrs']} does not match --project-crs {project_crs}.")

    cv = import_cv2()
    full_window_image = cv.imread(str(full_window_path))
    map_canvas_image = cv.imread(str(map_canvas_path))
    if full_window_image is None:
        raise SystemExit(f"OpenCV could not read full-window screenshot: {full_window_path}")
    if map_canvas_image is None:
        raise SystemExit(f"OpenCV could not read map-canvas crop: {map_canvas_path}")

    pivot_crop_ring = detect_pivot_crop_ring(cv, map_canvas_image)
    overlay_circle = detect_overlay_circle(cv, map_canvas_image, pivot_crop_ring)
    overlay_visible = overlay_circle is not None or detect_overlay_linework(cv, map_canvas_image)
    attribution = detect_attribution_cue(cv, full_window_image)
    boundary_detector_status = boundary_detector_runtime_status(sam2_config_arg, sam2_checkpoint_arg) if infer_field_boundary else None
    sam2_adapter = load_sam2_adapter(boundary_detector_status) if infer_field_boundary else None
    imagery_field_boundary = detect_imagery_field_boundary(cv, map_canvas_image, pivot_crop_ring, sam2_adapter) if infer_field_boundary else None
    projected_field_boundary = project_image_boundary_to_xy(imagery_field_boundary, overlay_circle, project_reference) if infer_field_boundary else None
    if imagery_field_boundary is not None and projected_field_boundary is not None:
        imagery_field_boundary["projectedPolygon"] = projected_field_boundary

    center_offset_ratio = None
    radius_mismatch_ratio = None
    if pivot_crop_ring is not None and overlay_circle is not None and pivot_crop_ring["radius"] > 0:
        center_offset_ratio = round(math.hypot(
            overlay_circle["center"]["x"] - pivot_crop_ring["center"]["x"],
            overlay_circle["center"]["y"] - pivot_crop_ring["center"]["y"],
        ) / pivot_crop_ring["radius"], 4)
        radius_mismatch_ratio = round(abs(overlay_circle["radius"] - pivot_crop_ring["radius"]) / pivot_crop_ring["radius"], 4)

    detection_confidence = vision_confidence(pivot_crop_ring, overlay_circle, overlay_visible, attribution["present"], imagery_field_boundary)
    assessment = assess_design_vision_review({
        "centerOffsetRatio": center_offset_ratio,
        "radiusMismatchRatio": radius_mismatch_ratio,
        "overlayVisible": overlay_visible,
        "attributionPresent": attribution["present"],
        "detectionConfidence": detection_confidence,
        "inferFieldBoundary": infer_field_boundary,
        "fieldBoundaryConfidence": imagery_field_boundary["confidence"] if imagery_field_boundary else None,
        "fieldBoundaryProjected": projected_field_boundary is not None,
    })

    output_dir.mkdir(parents=True, exist_ok=True)
    annotated_path = output_dir / "visual-layout-review-annotated.png"
    write_annotated_image(cv, map_canvas_image, annotated_path, pivot_crop_ring, overlay_circle, imagery_field_boundary)
    annotated_artifact = artifact_inventory(annotated_path)

    evidence_id = f"{project_id}:design-vision-review-evidence"
    recommendation_id = f"{project_id}:design-vision-review"
    evidence_record = {
        "id": evidence_id,
        "projectId": project_id,
        "sourceKind": "layout_score",
        "createdAt": created_at,
        "collectedAt": manifest.get("generatedAt"),
        "projectCrs": project_crs,
        "summary": "Design-only local CV review of CPLayout overlay alignment against Google Earth Pro proof screenshots.",
        "confidence": assessment["confidence"],
        "reviewStatus": "unreviewed",
        "notes": "Advisory image-space evidence only; does not create survey data or mutate canonical projected XY geometry.",
    }
    recommendation = {
        "id": recommendation_id,
        "projectId": project_id,
        "modelName": VISION_MODEL_NAME,
        "modelVersion": VISION_MODEL_VERSION,
        "createdAt": created_at,
        "projectCrs": project_crs,
        "summary": recommendation_summary(assessment["warnings"]),
        "proposedGeometry": vision_recommendation_geometry(project_crs, project_reference, look_at, projected_field_boundary),
        "confidence": assessment["confidence"],
        "evidenceIds": [evidence_id],
        "reviewStatus": "unreviewed",
        "score": assessment["score"],
        "warnings": assessment["warnings"] + [
            "Design-only review; acceptance must route through projected-XY import/editor/operator workflows.",
            "Google Earth imagery is local companion evidence only and is not cached, embedded, or used as a substitute dataset.",
            *([] if projected_field_boundary is not None else ["No calibrated imagery field-boundary polygon was exported; recommendation remains metadata/display-only for boundary geometry."]),
        ],
    }
    decision_record = {
        "id": f"{project_id}:design-vision-review-decision-placeholder",
        "projectId": project_id,
        "createdAt": created_at,
        "decidedBy": "test_fixture",
        "decision": "deferred",
        "recommendationId": recommendation_id,
        "evidenceIds": [evidence_id],
        "reason": "Default generated placeholder: operator review is required before any geometry workflow action.",
    }

    report = {
        "schemaVersion": VISION_SCHEMA_VERSION,
        "createdAt": created_at,
        "projectId": project_id,
        "projectCrs": project_crs,
        "designOnly": True,
        "surveyGrade": False,
        "canonicalGeometryMutation": False,
        "reviewStatus": "unreviewed",
        "thresholds": DEFAULT_VISION_THRESHOLDS,
        "artifacts": artifacts | {"annotatedReview": annotated_artifact},
        "boundaryDetector": boundary_detector_status,
        "manifestStatus": {
            "status": manifest.get("status"),
            "proofPassed": manifest.get("proofPassed"),
            "overlayVisibleConfirmed": manifest.get("manualReview", {}).get("overlayVisibleConfirmed"),
        },
        "detections": {
            "pivotCropRing": pivot_crop_ring,
            "overlayCircle": overlay_circle,
            "imageryFieldBoundary": imagery_field_boundary,
            "overlayVisible": overlay_visible,
            "attribution": attribution,
        },
        "metrics": {
            "centerOffsetRatio": center_offset_ratio,
            "radiusMismatchRatio": radius_mismatch_ratio,
            "detectionConfidence": assessment["confidence"],
        },
        "assessment": assessment,
        "layoutEvidenceRecords": [evidence_record],
        "modelRecommendations": [recommendation],
        "layoutDecisionRecords": [decision_record],
        "nonGoals": [
            "Does not mutate PivotProject geometry, schemas, persistence, or archives.",
            "Does not treat screenshot-derived field-boundary geometry as survey-grade evidence.",
            "Does not prove React Native, Android, iOS, MapLibre, SQLite, or mobile runtime behavior.",
        ],
    }

    json_path = output_dir / "visual-layout-review.json"
    geojson_path = output_dir / "visual-layout-review-recommendations.geojson"
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    geojson_path.write_text(json.dumps(recommendations_to_geojson([recommendation]), indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schemaVersion": VISION_SCHEMA_VERSION,
        "json": str(json_path),
        "geojson": str(geojson_path),
        "annotatedPng": str(annotated_path),
        "score": assessment["score"],
        "confidence": assessment["confidence"],
        "warnings": assessment["warnings"],
        "canonicalGeometryMutation": False,
        "designOnly": True,
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
          "displayWgs84": recommendation["proposedGeometry"].get("displayWgs84"),
        }
        pivot = recommendation["proposedGeometry"].get("pivotCenter")
        if pivot is not None:
            features.append({
              "type": "Feature",
              "geometry": {"type": "Point", "coordinates": [pivot["x"], pivot["y"]]},
              "properties": properties | {"geometryRole": "pivot_center"},
            })
        field_boundary = recommendation["proposedGeometry"].get("fieldBoundary")
        if field_boundary is not None:
            features.append({
              "type": "Feature",
              "geometry": {"type": "Polygon", "coordinates": [closed_ring_coordinates(field_boundary)]},
              "properties": properties | {"geometryRole": "field_boundary"},
            })
        for index, polygon in enumerate(recommendation["proposedGeometry"].get("obstaclePolygons") or []):
            features.append({
              "type": "Feature",
              "geometry": {"type": "Polygon", "coordinates": [closed_ring_coordinates(polygon)]},
              "properties": properties | {"geometryRole": "obstacle_polygon", "obstacleIndex": index},
            })
        if pivot is None and field_boundary is None and not recommendation["proposedGeometry"].get("obstaclePolygons"):
            features.append({
              "type": "Feature",
              "geometry": None,
              "properties": properties | {"geometryRole": "metadata_only"},
            })
    return {
      "type": "FeatureCollection",
      "schemaVersion": SCHEMA_VERSION,
      "name": "cplayout-model-recommendations",
      "coordinateReferenceSystem": "project_crs_xy",
      "canonicalGeometryMutation": False,
      "features": features,
    }


def vision_recommendation_geometry(
    project_crs: str,
    project_reference: dict[str, Any] | None,
    look_at: dict[str, float] | None,
    detected_field_boundary: list[dict[str, float]] | None,
) -> dict[str, Any]:
    geometry: dict[str, Any] = {"projectCrs": project_crs}
    if project_reference is not None:
        geometry["pivotCenter"] = project_reference["pivotCenter"]
        if detected_field_boundary is not None:
            geometry["fieldBoundary"] = detected_field_boundary
        obstacles = [obstacle["polygon"] for obstacle in project_reference.get("obstacles", []) if isinstance(obstacle.get("polygon"), list)]
        if obstacles:
            geometry["obstaclePolygons"] = obstacles
    elif look_at is not None:
        geometry["displayWgs84"] = [{"longitude": look_at["longitude"], "latitude": look_at["latitude"]}]
    return geometry


def extract_look_at_coordinate(kml_text: str) -> dict[str, float] | None:
    match = re.search(
        r"<LookAt\b[^>]*>.*?<longitude>\s*([-0-9.]+)\s*</longitude>.*?<latitude>\s*([-0-9.]+)\s*</latitude>.*?</LookAt>",
        kml_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    return {"longitude": float(match.group(1)), "latitude": float(match.group(2))}


def closed_ring_coordinates(points: list[dict[str, Any]]) -> list[list[float]]:
    coordinates = [[float(point["x"]), float(point["y"])] for point in points]
    if coordinates and coordinates[0] != coordinates[-1]:
        coordinates.append([coordinates[0][0], coordinates[0][1]])
    return coordinates


def import_cv2() -> Any:
    try:
        import cv2  # type: ignore
    except Exception as exc:
        raise SystemExit(
            "OpenCV is required for design-vision-review. Install opencv-python-headless in the local companion environment."
        ) from exc
    if not hasattr(cv2, "HoughCircles"):
        raise SystemExit("Installed OpenCV build does not expose HoughCircles; cannot run design-vision-review.")
    return cv2


def artifact_inventory(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Required artifact does not exist: {path}")
    payload: dict[str, Any] = {
        "path": str(path),
        "sha256": sha256_file(path),
        "byteLength": path.stat().st_size,
    }
    if path.suffix.lower() == ".kml":
        text = path.read_text(encoding="utf-8")
        payload["kml"] = {
            "lookAtCount": text.count("<LookAt"),
            "styleCount": text.count("<Style"),
            "styleUrlCount": text.count("<styleUrl>"),
            "extendedDataCount": text.count("<ExtendedData"),
            "placemarkCount": text.count("<Placemark"),
            "hasRemoteIconHref": has_remote_icon_href(text),
        }
    if path.suffix.lower() == ".kmz":
        with zipfile.ZipFile(path) as archive:
            entries = archive.namelist()
            if "doc.kml" not in entries:
                raise SystemExit(f"KMZ artifact must contain doc.kml: {path}")
            text = archive.read("doc.kml").decode("utf-8")
        payload["kmz"] = {
            "entries": entries,
            "primaryKmlEntry": "doc.kml",
            "lookAtCount": text.count("<LookAt"),
            "styleCount": text.count("<Style"),
            "styleUrlCount": text.count("<styleUrl>"),
            "extendedDataCount": text.count("<ExtendedData"),
            "placemarkCount": text.count("<Placemark"),
            "hasRemoteIconHref": has_remote_icon_href(text),
        }
    return payload


def has_remote_icon_href(kml_text: str) -> bool:
    return re.search(r"<href>\s*https?://", kml_text, flags=re.IGNORECASE) is not None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json_with_bom(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def verify_manifest_linkage(manifest: dict[str, Any], artifacts: dict[str, dict[str, Any]]) -> None:
    captures = {
        capture.get("filename"): capture
        for capture in manifest.get("captures", [])
        if isinstance(capture, dict)
    }
    for artifact_name in ["fullWindowScreenshot", "mapCanvasCrop"]:
        filename = Path(artifacts[artifact_name]["path"]).name
        capture = captures.get(filename)
        if capture is None:
            raise SystemExit(f"Manifest does not reference required screenshot: {filename}")
        if capture.get("sha256") and capture.get("sha256") != artifacts[artifact_name]["sha256"]:
            raise SystemExit(f"Manifest SHA-256 mismatch for screenshot: {filename}")

    opened_sha = manifest.get("artifacts", {}).get("sha256", {}).get("openedArtifact")
    if opened_sha and opened_sha != artifacts["kml"]["sha256"] and opened_sha != artifacts["kmz"]["sha256"]:
        raise SystemExit("Manifest openedArtifact SHA-256 does not match the supplied KML or KMZ.")


def detect_pivot_crop_ring(cv: Any, image: Any) -> dict[str, Any] | None:
    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
    blurred = cv.medianBlur(gray, 7)
    height, width = gray.shape[:2]
    min_dimension = min(width, height)
    circles = cv.HoughCircles(
        blurred,
        cv.HOUGH_GRADIENT,
        dp=1.3,
        minDist=max(80, min(width, height) // 4),
        param1=80,
        param2=28,
        minRadius=max(30, min(width, height) // 12),
        maxRadius=max(60, int(min_dimension * 0.68)),
    )
    if circles is None:
        return None
    candidates = []
    for raw_circle in circles[0, :12]:
        x, y, radius = [float(value) for value in raw_circle]
        if radius <= 0:
            continue
        centeredness = 1 - min(1, math.hypot(x - width / 2, y - height / 2) / max(width, height))
        size_score = min(1, radius / max(1, min_dimension * 0.55))
        candidates.append((centeredness * 1.2 + size_score * 0.8, x, y, radius))
    if not candidates:
        return None
    _, x, y, radius = sorted(candidates, reverse=True)[0]
    return circle_payload(x, y, radius, 0.72)


def detect_overlay_circle(cv: Any, image: Any, pivot_crop_ring: dict[str, Any] | None) -> dict[str, Any] | None:
    mask = overlay_mask(cv, image)
    if pivot_crop_ring is not None:
        expected_radius = float(pivot_crop_ring["radius"])
        circles = cv.HoughCircles(
            cv.medianBlur(mask, 5),
            cv.HOUGH_GRADIENT,
            dp=1.2,
            minDist=max(80, int(expected_radius * 0.6)),
            param1=60,
            param2=12,
            minRadius=max(15, int(expected_radius * 0.55)),
            maxRadius=max(20, int(expected_radius * 1.25)),
        )
        if circles is not None:
            field_x = float(pivot_crop_ring["center"]["x"])
            field_y = float(pivot_crop_ring["center"]["y"])
            candidates = []
            for raw_circle in circles[0, :10]:
                x, y, radius = [float(value) for value in raw_circle]
                center_score = 1 - min(1, math.hypot(x - field_x, y - field_y) / max(expected_radius, 1))
                radius_score = 1 - min(1, abs(radius - expected_radius) / max(expected_radius, 1))
                candidates.append((center_score + radius_score, x, y, radius))
            if candidates:
                _, x, y, radius = sorted(candidates, reverse=True)[0]
                return circle_payload(x, y, radius, 0.68)

    contours, _ = cv.findContours(mask, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    best = None
    for contour in contours:
        area = float(cv.contourArea(contour))
        if area < 80:
            continue
        (x, y), radius = cv.minEnclosingCircle(contour)
        if radius <= 15:
            continue
        if pivot_crop_ring is not None:
            field_radius = float(pivot_crop_ring["radius"])
            if radius < field_radius * 0.4 or radius > field_radius * 1.35:
                continue
        perimeter = float(cv.arcLength(contour, True))
        circularity = 0 if perimeter <= 0 else min(1, 4 * math.pi * area / (perimeter * perimeter))
        score = radius * 0.01 + circularity
        if best is None or score > best[0]:
            best = (score, float(x), float(y), float(radius), circularity)
    if best is None:
        return None
    _, x, y, radius, circularity = best
    return circle_payload(x, y, radius, max(0.35, min(0.9, circularity)))


def boundary_detector_runtime_status(sam2_config_arg: Path | None, sam2_checkpoint_arg: Path | None) -> dict[str, Any]:
    sam2_config = configured_path(sam2_config_arg, SAM2_CONFIG_ENV)
    sam2_checkpoint = configured_path(sam2_checkpoint_arg, SAM2_CHECKPOINT_ENV)
    status = {
        "opencv": probe_opencv(),
        "sam2": probe_sam2(sam2_config, sam2_checkpoint),
        "networkRequired": False,
        "hiddenDownloads": False,
        "offlineOnly": True,
    }
    status["canRunOffline"] = bool(status["opencv"]["available"] and status["opencv"]["houghCircles"] and status["opencv"]["houghLinesP"])
    return status


def load_sam2_adapter(boundary_detector_status: dict[str, Any] | None) -> Any | None:
    if boundary_detector_status is None:
        return None
    sam2 = boundary_detector_status.get("sam2", {})
    if not (sam2.get("available") and sam2.get("configExists") and sam2.get("checkpointExists")):
        return None
    # SAM2 integration is intentionally isolated to the Python companion. A future
    # adapter can build predictors here from explicit local paths only.
    return None


def detect_imagery_field_boundary(
    cv: Any,
    image: Any,
    pivot_crop_ring: dict[str, Any] | None,
    sam2_adapter: Any | None = None,
) -> dict[str, Any] | None:
    height, width = image.shape[:2]
    overlay = overlay_mask(cv, image)
    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
    gray = cv.inpaint(gray, cv.dilate(overlay, None, iterations=2), 3, cv.INPAINT_TELEA)
    blurred = cv.GaussianBlur(gray, (5, 5), 0)
    edges = cv.Canny(blurred, 55, 145)

    candidates: list[dict[str, Any]] = []
    candidates.extend(sam2_boundary_candidates(cv, sam2_adapter, image, overlay, width, height))
    lines = cv.HoughLinesP(
        edges,
        1,
        math.pi / 180,
        threshold=max(70, min(width, height) // 4),
        minLineLength=max(90, min(width, height) // 6),
        maxLineGap=24,
    )
    hough_candidate = field_boundary_from_hough_lines(lines, width, height, pivot_crop_ring)
    if hough_candidate is not None:
        candidates.append({
            "source": "opencv",
            "method": "hough_road_fenceline_field_separation_edges",
            "polygon": hough_candidate,
        })
    contour_candidate = field_boundary_from_contours(cv, edges, width, height, pivot_crop_ring)
    if contour_candidate is not None:
        candidates.append({
            "source": "opencv",
            "method": "contour_field_separation_edges",
            "polygon": contour_candidate,
        })
    if not candidates:
        return None

    scored = [
        score_boundary_candidate(cv, edges, candidate, width, height, pivot_crop_ring)
        for candidate in candidates
    ]
    scored = sorted(scored, key=lambda item: item["confidence"], reverse=True)
    accepted = next((candidate for candidate in scored if not candidate["rejected"] and candidate["confidence"] >= DEFAULT_VISION_THRESHOLDS["minFieldBoundaryConfidence"]), None)
    if accepted is None:
        rejected = scored[0]
        rejected["rejected"] = True
        if not rejected["rejectionReasons"]:
            rejected["rejectionReasons"] = ["candidate confidence is below accepted imagery-derived boundary threshold"]
        rejected["candidateMasks"] = [candidate_audit_summary(candidate) for candidate in scored]
        return rejected
    accepted["candidateMasks"] = [candidate_audit_summary(candidate) for candidate in scored]
    return accepted


def sam2_boundary_candidates(cv: Any, sam2_adapter: Any | None, image: Any, overlay: Any, width: int, height: int) -> list[dict[str, Any]]:
    if sam2_adapter is None or not hasattr(sam2_adapter, "propose_masks"):
        return []
    candidates = []
    for index, mask in enumerate(sam2_adapter.propose_masks(image)):
        clean_mask = cv.bitwise_and(mask, cv.bitwise_not(overlay))
        contours, _ = cv.findContours(clean_mask, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
        for contour in contours[:12]:
            area = float(cv.contourArea(contour))
            if area / max(1, width * height) < 0.03:
                continue
            perimeter = float(cv.arcLength(contour, True))
            if perimeter <= 0:
                continue
            approx = cv.approxPolyDP(contour, 0.025 * perimeter, True)
            if len(approx) < 4:
                continue
            candidates.append({
                "source": "sam2",
                "method": f"sam2_mask_{index}",
                "polygon": clamp_image_polygon([{"x": float(point[0][0]), "y": float(point[0][1])} for point in approx], width, height),
            })
    return candidates


def score_boundary_candidate(
    cv: Any,
    edges: Any,
    candidate: dict[str, Any],
    width: int,
    height: int,
    pivot_crop_ring: dict[str, Any] | None,
) -> dict[str, Any]:
    polygon = candidate["polygon"]
    circularity = image_polygon_circularity(polygon)
    rectilinearity = polygon_rectilinearity(polygon)
    area_ratio = abs(image_polygon_area(polygon)) / max(1, width * height)
    edge_alignment = polygon_edge_alignment(cv, edges, polygon)
    containment = pivot_containment_score(polygon, pivot_crop_ring)
    rejection_reasons = []
    if len(polygon) < 4:
        rejection_reasons.append("candidate has fewer than four polygon vertices")
    if area_ratio < 0.04:
        rejection_reasons.append("candidate covers too little of the proof image")
    if circularity > 0.86:
        rejection_reasons.append("candidate resembles a circular crop or pivot coverage ring")
    if containment <= 0:
        rejection_reasons.append("candidate does not contain the visible pivot center")
    if looks_like_extent_box(polygon, width, height, pivot_crop_ring):
        rejection_reasons.append("candidate resembles an extent box around the pivot ring rather than imagery edges")
    confidence = (
        0.1
        + edge_alignment * 0.28
        + rectilinearity * 0.22
        + (1 - min(1.0, circularity)) * 0.18
        + min(0.18, area_ratio)
        + containment * 0.14
    )
    if candidate["source"] == "sam2":
        confidence += 0.06
    if rejection_reasons:
        confidence = min(confidence, 0.3)
    return {
        "source": candidate["source"],
        "imagePolygon": image_polygon_payload(polygon),
        "confidence": round(max(0.0, min(0.92, confidence)), 3),
        "cues": [candidate["method"]],
        "edgeAlignment": round(edge_alignment, 4),
        "rectilinearity": round(rectilinearity, 4),
        "circularity": round(circularity, 4),
        "containment": round(containment, 4),
        "areaRatio": round(area_ratio, 4),
        "rejected": bool(rejection_reasons),
        "rejectionReasons": rejection_reasons,
    }


def candidate_audit_summary(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": candidate["source"],
        "cues": candidate["cues"],
        "confidence": candidate["confidence"],
        "rejected": candidate["rejected"],
        "rejectionReasons": candidate["rejectionReasons"],
        "edgeAlignment": candidate["edgeAlignment"],
        "rectilinearity": candidate["rectilinearity"],
        "circularity": candidate["circularity"],
        "containment": candidate["containment"],
        "areaRatio": candidate["areaRatio"],
        "vertexCount": len(candidate["imagePolygon"]),
        "imagePolygon": candidate["imagePolygon"],
    }


def field_boundary_from_hough_lines(lines: Any, width: int, height: int, pivot_crop_ring: dict[str, Any] | None) -> list[dict[str, float]] | None:
    if lines is None:
        return None
    center_x = width / 2
    center_y = height / 2
    minimum_half_width = width * 0.18
    minimum_half_height = height * 0.18
    if pivot_crop_ring is not None:
        center_x = float(pivot_crop_ring["center"]["x"])
        center_y = float(pivot_crop_ring["center"]["y"])
        minimum_half_width = max(minimum_half_width, float(pivot_crop_ring["radius"]) * 0.72)
        minimum_half_height = max(minimum_half_height, float(pivot_crop_ring["radius"]) * 0.72)

    verticals: list[tuple[float, float]] = []
    horizontals: list[tuple[float, float]] = []
    for raw in lines[:, 0, :]:
        x1, y1, x2, y2 = [float(value) for value in raw]
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy)
        if length < max(width, height) * 0.08:
            continue
        if abs(dx) <= abs(dy) * 0.35:
            verticals.append(((x1 + x2) / 2, length))
        elif abs(dy) <= abs(dx) * 0.35:
            horizontals.append(((y1 + y2) / 2, length))

    left = weighted_line_position([line for line in verticals if line[0] < center_x - minimum_half_width])
    right = weighted_line_position([line for line in verticals if line[0] > center_x + minimum_half_width])
    top = weighted_line_position([line for line in horizontals if line[0] < center_y - minimum_half_height])
    bottom = weighted_line_position([line for line in horizontals if line[0] > center_y + minimum_half_height])
    if left is None or right is None or top is None or bottom is None:
        return None
    if right - left < width * 0.25 or bottom - top < height * 0.25:
        return None
    return clamp_image_polygon([
        {"x": left, "y": top},
        {"x": right, "y": top},
        {"x": right, "y": bottom},
        {"x": left, "y": bottom},
    ], width, height)


def weighted_line_position(candidates: list[tuple[float, float]]) -> float | None:
    if not candidates:
        return None
    candidates = sorted(candidates, key=lambda item: item[1], reverse=True)[:8]
    total_weight = sum(weight for _, weight in candidates)
    if total_weight <= 0:
        return None
    return sum(position * weight for position, weight in candidates) / total_weight


def field_boundary_from_contours(cv: Any, edges: Any, width: int, height: int, pivot_crop_ring: dict[str, Any] | None) -> list[dict[str, float]] | None:
    closed = cv.morphologyEx(edges, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_RECT, (11, 11)), iterations=1)
    contours, _ = cv.findContours(closed, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    best = None
    center = None
    if pivot_crop_ring is not None:
        center = (float(pivot_crop_ring["center"]["x"]), float(pivot_crop_ring["center"]["y"]))
    for contour in contours:
        area = float(cv.contourArea(contour))
        area_ratio = area / max(1, width * height)
        if area_ratio < 0.04:
            continue
        perimeter = float(cv.arcLength(contour, True))
        if perimeter <= 0:
            continue
        epsilon = 0.035 * perimeter
        approx = cv.approxPolyDP(contour, epsilon, True)
        if len(approx) < 4 or len(approx) > 10:
            continue
        polygon = [{"x": float(point[0][0]), "y": float(point[0][1])} for point in approx]
        if center is not None and not image_point_in_polygon({"x": center[0], "y": center[1]}, polygon):
            continue
        circularity = image_polygon_circularity(polygon)
        rectilinearity = polygon_rectilinearity(polygon)
        if circularity > 0.9:
            continue
        score = area_ratio + rectilinearity * 0.5
        if best is None or score > best[0]:
            best = (score, polygon)
    return None if best is None else clamp_image_polygon(best[1], width, height)


def polygon_edge_alignment(cv: Any, edges: Any, polygon: list[dict[str, float]]) -> float:
    import numpy as np  # type: ignore

    samples = []
    for index, current in enumerate(polygon):
        next_point = polygon[(index + 1) % len(polygon)]
        x1 = float(current["x"])
        y1 = float(current["y"])
        x2 = float(next_point["x"])
        y2 = float(next_point["y"])
        steps = max(2, int(math.hypot(x2 - x1, y2 - y1) / 8))
        for step in range(steps + 1):
            ratio = step / steps
            samples.append((round(x1 + (x2 - x1) * ratio), round(y1 + (y2 - y1) * ratio)))
    if not samples:
        return 0.0
    height, width = edges.shape[:2]
    dilated = cv.dilate(edges, np.ones((5, 5), dtype=np.uint8), iterations=1)
    hits = 0
    for x, y in samples:
        if 0 <= x < width and 0 <= y < height and int(dilated[int(y), int(x)]) > 0:
            hits += 1
    return hits / len(samples)


def pivot_containment_score(polygon: list[dict[str, float]], pivot_crop_ring: dict[str, Any] | None) -> float:
    if pivot_crop_ring is None:
        return 0.5
    center = {"x": float(pivot_crop_ring["center"]["x"]), "y": float(pivot_crop_ring["center"]["y"])}
    return 1.0 if image_point_in_polygon(center, polygon) else 0.0


def looks_like_extent_box(polygon: list[dict[str, float]], width: int, height: int, pivot_crop_ring: dict[str, Any] | None) -> bool:
    if pivot_crop_ring is None or len(polygon) != 4:
        return False
    xs = [float(point["x"]) for point in polygon]
    ys = [float(point["y"]) for point in polygon]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    if left <= 1 or top <= 1 or right >= width - 2 or bottom >= height - 2:
        return False
    center = pivot_crop_ring["center"]
    radius = float(pivot_crop_ring["radius"])
    expected_left = float(center["x"]) - radius
    expected_right = float(center["x"]) + radius
    expected_top = float(center["y"]) - radius
    expected_bottom = float(center["y"]) + radius
    tolerance = max(8.0, radius * 0.12)
    return (
        abs(left - expected_left) <= tolerance
        and abs(right - expected_right) <= tolerance
        and abs(top - expected_top) <= tolerance
        and abs(bottom - expected_bottom) <= tolerance
    )


def detect_overlay_linework(cv: Any, image: Any) -> bool:
    mask = overlay_mask(cv, image)
    return int(cv.countNonZero(mask)) > max(120, image.shape[0] * image.shape[1] * 0.00012)


def overlay_mask(cv: Any, image: Any) -> Any:
    hsv = cv.cvtColor(image, cv.COLOR_BGR2HSV)
    red1 = cv.inRange(hsv, (0, 70, 80), (12, 255, 255))
    red2 = cv.inRange(hsv, (168, 70, 80), (180, 255, 255))
    blue = cv.inRange(hsv, (88, 45, 75), (132, 255, 255))
    yellow = cv.inRange(hsv, (18, 55, 90), (42, 255, 255))
    green = cv.inRange(hsv, (45, 90, 170), (85, 255, 255))
    return cv.bitwise_or(cv.bitwise_or(red1, red2), cv.bitwise_or(cv.bitwise_or(blue, yellow), green))


def detect_attribution_cue(cv: Any, image: Any) -> dict[str, Any]:
    height, width = image.shape[:2]
    crop = image[int(height * 0.82):height, int(width * 0.45):width]
    gray = cv.cvtColor(crop, cv.COLOR_BGR2GRAY)
    edges = cv.Canny(gray, 80, 160)
    edge_ratio = int(cv.countNonZero(edges)) / max(1, edges.shape[0] * edges.shape[1])
    bright_ratio = int(cv.countNonZero(cv.inRange(gray, 185, 255))) / max(1, gray.shape[0] * gray.shape[1])
    present = edge_ratio > 0.008 and bright_ratio > 0.015
    return {
        "present": present,
        "method": "bottom-right full-window text/edge cue; manual visual confirmation remains required",
        "edgeRatio": round(edge_ratio, 5),
        "brightRatio": round(bright_ratio, 5),
    }


def circle_payload(x: float, y: float, radius: float, confidence: float) -> dict[str, Any]:
    return {
        "center": {"x": round(x, 2), "y": round(y, 2)},
        "radius": round(radius, 2),
        "confidence": round(confidence, 3),
    }


def project_image_boundary_to_xy(
    imagery_field_boundary: dict[str, Any] | None,
    overlay_circle: dict[str, Any] | None,
    project_reference: dict[str, Any] | None,
) -> list[dict[str, float]] | None:
    if imagery_field_boundary is None or imagery_field_boundary.get("rejected"):
        return None
    if float(imagery_field_boundary.get("confidence", 0)) < DEFAULT_VISION_THRESHOLDS["minFieldBoundaryConfidence"]:
        return None
    if overlay_circle is None or project_reference is None:
        return None
    radius_pixels = float(overlay_circle["radius"])
    if radius_pixels <= 0:
        return None
    wet_radius = machine_wet_radius(project_reference["machine"])
    scale = wet_radius / radius_pixels
    origin = project_reference["pivotCenter"]
    overlay_center = overlay_circle["center"]
    projected = []
    for point in imagery_field_boundary["imagePolygon"]:
        projected.append({
            "x": round(float(origin["x"]) + (float(point["x"]) - float(overlay_center["x"])) * scale, 3),
            "y": round(float(origin["y"]) - (float(point["y"]) - float(overlay_center["y"])) * scale, 3),
        })
    return projected


def machine_wet_radius(machine: dict[str, Any]) -> float:
    return machine_radius(machine) + float(machine.get("endGunThrowMeters", 0))


def vision_confidence(
    pivot_crop_ring: dict[str, Any] | None,
    overlay_circle: dict[str, Any] | None,
    overlay_visible: bool,
    attribution_present: bool,
    imagery_field_boundary: dict[str, Any] | None,
) -> float:
    score = 0.15
    if pivot_crop_ring is not None:
        score += 0.22 * float(pivot_crop_ring["confidence"])
    if overlay_circle is not None:
        score += 0.24 * float(overlay_circle["confidence"])
    elif overlay_visible:
        score += 0.15
    if imagery_field_boundary is not None and not imagery_field_boundary.get("rejected"):
        score += 0.24 * float(imagery_field_boundary["confidence"])
    if attribution_present:
        score += 0.15
    return round(max(0.0, min(1.0, score)), 3)


def assess_design_vision_review(metrics: dict[str, Any]) -> dict[str, Any]:
    warnings = []
    score = 100.0
    if not metrics["overlayVisible"]:
        warnings.append("CPLayout overlay was not detected in the map-canvas screenshot.")
        score -= 30
    if not metrics["attributionPresent"]:
        warnings.append("Full-window Google Earth attribution evidence is missing or unclear.")
        score -= 20
    if metrics["detectionConfidence"] < DEFAULT_VISION_THRESHOLDS["minDetectionConfidence"]:
        warnings.append(f"Visual detection confidence is below {DEFAULT_VISION_THRESHOLDS['minDetectionConfidence']}.")
        score -= 20
    if metrics["inferFieldBoundary"]:
        if metrics["fieldBoundaryConfidence"] is None:
            warnings.append("Imagery field-boundary detector did not find a road/fenceline/treeline/field-separation polygon.")
            score -= 25
        elif metrics["fieldBoundaryConfidence"] < DEFAULT_VISION_THRESHOLDS["minFieldBoundaryConfidence"]:
            warnings.append(f"Imagery field-boundary detector confidence is below {DEFAULT_VISION_THRESHOLDS['minFieldBoundaryConfidence']}.")
            score -= 20
        if not metrics["fieldBoundaryProjected"]:
            warnings.append("Imagery field-boundary polygon was not exported as projected XY because calibration evidence was incomplete.")
            score -= 10
    if metrics["centerOffsetRatio"] is not None and metrics["centerOffsetRatio"] > DEFAULT_VISION_THRESHOLDS["maxCenterOffsetRatio"]:
        warnings.append("Detected CPLayout center offset exceeds 5.0% of pivot radius.")
        score -= min(25, (metrics["centerOffsetRatio"] - DEFAULT_VISION_THRESHOLDS["maxCenterOffsetRatio"]) * 250)
    if metrics["radiusMismatchRatio"] is not None and metrics["radiusMismatchRatio"] > DEFAULT_VISION_THRESHOLDS["maxRadiusMismatchRatio"]:
        warnings.append("Detected CPLayout radius mismatch exceeds 8.0%.")
        score -= min(25, (metrics["radiusMismatchRatio"] - DEFAULT_VISION_THRESHOLDS["maxRadiusMismatchRatio"]) * 220)
    return {
        "score": round(max(0.0, min(100.0, score)), 3),
        "confidence": round(max(0.0, min(1.0, metrics["detectionConfidence"])), 3),
        "warnings": warnings,
        "canonicalGeometryMutation": False,
        "reviewStatus": "unreviewed",
        "designOnly": True,
    }


def recommendation_summary(warnings: list[str]) -> str:
    if not warnings:
        return "Review passed advisory image-space checks for CPLayout overlay visibility, pivot-ring alignment, and field-boundary outline."
    return "Review field-boundary, center/radius, and obstacle alignment before accepting this design for any projected-XY workflow."


def write_annotated_image(
    cv: Any,
    image: Any,
    output_path: Path,
    pivot_crop_ring: dict[str, Any] | None,
    overlay_circle: dict[str, Any] | None,
    imagery_field_boundary: dict[str, Any] | None,
) -> None:
    annotated = image.copy()
    if pivot_crop_ring is not None:
        draw_circle(cv, annotated, pivot_crop_ring, (255, 255, 255), "detected pivot crop ring")
    if overlay_circle is not None:
        draw_circle(cv, annotated, overlay_circle, (0, 255, 255), "detected CPLayout overlay")
    if imagery_field_boundary is not None:
        for candidate in imagery_field_boundary.get("candidateMasks", []):
            if candidate.get("rejected") and candidate.get("imagePolygon"):
                draw_polygon(cv, annotated, candidate["imagePolygon"], (150, 150, 150), "rejected boundary candidate")
    if imagery_field_boundary is not None and not imagery_field_boundary.get("rejected"):
        draw_polygon(cv, annotated, imagery_field_boundary["imagePolygon"], (0, 0, 0), "detected field boundary")
        draw_evidence_cue_labels(cv, annotated, imagery_field_boundary)
    cv.putText(
        annotated,
        "DESIGN-ONLY ADVISORY - no projected XY mutation",
        (24, 42),
        cv.FONT_HERSHEY_SIMPLEX,
        1.0,
        (0, 0, 0),
        5,
        cv.LINE_AA,
    )
    cv.putText(
        annotated,
        "DESIGN-ONLY ADVISORY - no projected XY mutation",
        (24, 42),
        cv.FONT_HERSHEY_SIMPLEX,
        1.0,
        (255, 255, 255),
        2,
        cv.LINE_AA,
    )
    if not cv.imwrite(str(output_path), annotated):
        raise SystemExit(f"OpenCV could not write annotated review image: {output_path}")


def draw_circle(cv: Any, image: Any, circle: dict[str, Any], color: tuple[int, int, int], label: str) -> None:
    center = (int(circle["center"]["x"]), int(circle["center"]["y"]))
    radius = int(circle["radius"])
    cv.circle(image, center, radius, color, 3, cv.LINE_AA)
    cv.circle(image, center, 5, color, -1, cv.LINE_AA)
    cv.putText(image, label, (center[0] + 12, center[1] - 12), cv.FONT_HERSHEY_SIMPLEX, 0.7, color, 2, cv.LINE_AA)


def draw_polygon(cv: Any, image: Any, polygon: list[dict[str, Any]], color: tuple[int, int, int], label: str) -> None:
    import numpy as np  # type: ignore

    points = np.array([[int(point["x"]), int(point["y"])] for point in polygon], dtype=np.int32).reshape((-1, 1, 2))
    cv.polylines(image, [points], True, color, 4, cv.LINE_AA)
    first = polygon[0]
    cv.putText(image, label, (int(first["x"]) + 12, int(first["y"]) + 24), cv.FONT_HERSHEY_SIMPLEX, 0.7, color, 2, cv.LINE_AA)


def draw_evidence_cue_labels(cv: Any, image: Any, imagery_field_boundary: dict[str, Any]) -> None:
    cues = ", ".join(imagery_field_boundary.get("cues", []))
    labels = [
        f"boundary cues: {cues}",
        f"edge {imagery_field_boundary.get('edgeAlignment')} rect {imagery_field_boundary.get('rectilinearity')}",
    ]
    height, _width = image.shape[:2]
    for index, label in enumerate(labels):
        y = max(70, height - 58 + index * 24)
        cv.putText(image, label, (24, y), cv.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 4, cv.LINE_AA)
        cv.putText(image, label, (24, y), cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv.LINE_AA)


def image_polygon_payload(points: list[dict[str, float]]) -> list[dict[str, float]]:
    return [{"x": round(float(point["x"]), 2), "y": round(float(point["y"]), 2)} for point in points]


def clamp_image_polygon(points: list[dict[str, float]], width: int, height: int) -> list[dict[str, float]]:
    return [
        {
            "x": max(0.0, min(float(width - 1), float(point["x"]))),
            "y": max(0.0, min(float(height - 1), float(point["y"]))),
        }
        for point in points
    ]


def image_polygon_area(points: list[dict[str, float]]) -> float:
    area = 0.0
    for index, current in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        area += float(current["x"]) * float(next_point["y"]) - float(next_point["x"]) * float(current["y"])
    return area / 2.0


def image_polygon_perimeter(points: list[dict[str, float]]) -> float:
    perimeter = 0.0
    for index, current in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        perimeter += math.hypot(float(next_point["x"]) - float(current["x"]), float(next_point["y"]) - float(current["y"]))
    return perimeter


def image_polygon_circularity(points: list[dict[str, float]]) -> float:
    area = abs(image_polygon_area(points))
    perimeter = image_polygon_perimeter(points)
    if area <= 0 or perimeter <= 0:
        return 1.0
    return (4 * math.pi * area) / (perimeter * perimeter)


def polygon_rectilinearity(points: list[dict[str, float]]) -> float:
    if len(points) < 4:
        return 0.0
    scores = []
    for index, point in enumerate(points):
        previous_point = points[index - 1]
        next_point = points[(index + 1) % len(points)]
        vector_a = (float(previous_point["x"]) - float(point["x"]), float(previous_point["y"]) - float(point["y"]))
        vector_b = (float(next_point["x"]) - float(point["x"]), float(next_point["y"]) - float(point["y"]))
        length_a = math.hypot(*vector_a)
        length_b = math.hypot(*vector_b)
        if length_a <= 0 or length_b <= 0:
            continue
        cosine = abs((vector_a[0] * vector_b[0] + vector_a[1] * vector_b[1]) / (length_a * length_b))
        scores.append(1 - min(1.0, cosine))
    return sum(scores) / len(scores) if scores else 0.0


def image_point_in_polygon(point: dict[str, float], polygon: list[dict[str, float]]) -> bool:
    inside = False
    x = float(point["x"])
    y = float(point["y"])
    previous_index = len(polygon) - 1
    for index, current in enumerate(polygon):
        previous = polygon[previous_index]
        current_y = float(current["y"])
        previous_y = float(previous["y"])
        if (current_y > y) != (previous_y > y):
            x_intersection = (float(previous["x"]) - float(current["x"])) * (y - current_y) / (previous_y - current_y) + float(current["x"])
            if x < x_intersection:
                inside = not inside
        previous_index = index
    return inside


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
