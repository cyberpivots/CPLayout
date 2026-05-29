from __future__ import annotations

import argparse
import hashlib
import json
import math
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
}


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
      "--created-at",
      default=DEFAULT_CREATED_AT,
      help="ISO timestamp to write into review records. Defaults to a stable fixture timestamp for deterministic output.",
    )

    args = parser.parse_args(argv)
    if args.command == "probe-gpu":
        return probe_gpu()
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

    cv = import_cv2()
    full_window_image = cv.imread(str(full_window_path))
    map_canvas_image = cv.imread(str(map_canvas_path))
    if full_window_image is None:
        raise SystemExit(f"OpenCV could not read full-window screenshot: {full_window_path}")
    if map_canvas_image is None:
        raise SystemExit(f"OpenCV could not read map-canvas crop: {map_canvas_path}")

    field_circle = detect_field_circle(cv, map_canvas_image)
    overlay_circle = detect_overlay_circle(cv, map_canvas_image, field_circle)
    overlay_visible = overlay_circle is not None or detect_overlay_linework(cv, map_canvas_image)
    attribution = detect_attribution_cue(cv, full_window_image)

    center_offset_ratio = None
    radius_mismatch_ratio = None
    if field_circle is not None and overlay_circle is not None and field_circle["radius"] > 0:
        center_offset_ratio = round(math.hypot(
            overlay_circle["center"]["x"] - field_circle["center"]["x"],
            overlay_circle["center"]["y"] - field_circle["center"]["y"],
        ) / field_circle["radius"], 4)
        radius_mismatch_ratio = round(abs(overlay_circle["radius"] - field_circle["radius"]) / field_circle["radius"], 4)

    detection_confidence = vision_confidence(field_circle, overlay_circle, overlay_visible, attribution["present"])
    assessment = assess_design_vision_review({
        "centerOffsetRatio": center_offset_ratio,
        "radiusMismatchRatio": radius_mismatch_ratio,
        "overlayVisible": overlay_visible,
        "attributionPresent": attribution["present"],
        "detectionConfidence": detection_confidence,
    })

    output_dir.mkdir(parents=True, exist_ok=True)
    annotated_path = output_dir / "visual-layout-review-annotated.png"
    write_annotated_image(cv, map_canvas_image, annotated_path, field_circle, overlay_circle)
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
        "proposedGeometry": {"projectCrs": project_crs},
        "confidence": assessment["confidence"],
        "evidenceIds": [evidence_id],
        "reviewStatus": "unreviewed",
        "score": assessment["score"],
        "warnings": assessment["warnings"] + [
            "Design-only review; acceptance must route through projected-XY import/editor/operator workflows.",
            "Google Earth imagery is local companion evidence only and is not cached, embedded, or used as a substitute dataset.",
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
        "manifestStatus": {
            "status": manifest.get("status"),
            "proofPassed": manifest.get("proofPassed"),
            "overlayVisibleConfirmed": manifest.get("manualReview", {}).get("overlayVisibleConfirmed"),
        },
        "detections": {
            "fieldCircle": field_circle,
            "overlayCircle": overlay_circle,
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
            "Does not infer projected coordinates from Google Earth imagery.",
            "Does not mutate PivotProject geometry, schemas, persistence, or archives.",
            "Does not prove React Native, Android, iOS, MapLibre, SQLite, or mobile runtime behavior.",
        ],
    }

    json_path = output_dir / "visual-layout-review.json"
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schemaVersion": VISION_SCHEMA_VERSION,
        "json": str(json_path),
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


def detect_field_circle(cv: Any, image: Any) -> dict[str, Any] | None:
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


def detect_overlay_circle(cv: Any, image: Any, field_circle: dict[str, Any] | None) -> dict[str, Any] | None:
    mask = overlay_mask(cv, image)
    if field_circle is not None:
        expected_radius = float(field_circle["radius"])
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
            field_x = float(field_circle["center"]["x"])
            field_y = float(field_circle["center"]["y"])
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
        if field_circle is not None:
            field_radius = float(field_circle["radius"])
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


def detect_overlay_linework(cv: Any, image: Any) -> bool:
    mask = overlay_mask(cv, image)
    return int(cv.countNonZero(mask)) > max(120, image.shape[0] * image.shape[1] * 0.00012)


def overlay_mask(cv: Any, image: Any) -> Any:
    hsv = cv.cvtColor(image, cv.COLOR_BGR2HSV)
    red1 = cv.inRange(hsv, (0, 70, 80), (12, 255, 255))
    red2 = cv.inRange(hsv, (168, 70, 80), (180, 255, 255))
    blue = cv.inRange(hsv, (88, 45, 75), (132, 255, 255))
    yellow = cv.inRange(hsv, (18, 55, 90), (42, 255, 255))
    green = cv.inRange(hsv, (45, 45, 75), (85, 255, 255))
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


def vision_confidence(
    field_circle: dict[str, Any] | None,
    overlay_circle: dict[str, Any] | None,
    overlay_visible: bool,
    attribution_present: bool,
) -> float:
    score = 0.15
    if field_circle is not None:
        score += 0.3 * float(field_circle["confidence"])
    if overlay_circle is not None:
        score += 0.3 * float(overlay_circle["confidence"])
    elif overlay_visible:
        score += 0.15
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
        return "Review passed advisory image-space checks for CPLayout overlay visibility and pivot-ring alignment."
    return "Review center/radius/obstacle alignment before accepting this design for any projected-XY workflow."


def write_annotated_image(
    cv: Any,
    image: Any,
    output_path: Path,
    field_circle: dict[str, Any] | None,
    overlay_circle: dict[str, Any] | None,
) -> None:
    annotated = image.copy()
    if field_circle is not None:
        draw_circle(cv, annotated, field_circle, (255, 255, 255), "detected imagery ring")
    if overlay_circle is not None:
        draw_circle(cv, annotated, overlay_circle, (0, 255, 255), "detected CPLayout overlay")
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
