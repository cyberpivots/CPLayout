from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .companion_common import (
    COMPANION_PACKET_VERSION,
    DEFAULT_CREATED_AT,
    MODEL_RECOMMENDATIONS_SCHEMA_VERSION,
    PROJECT_REVIEW_DATA_SCHEMA_VERSION,
    closed_ring,
    file_artifact,
    load_json,
    number_or_default,
    reject_hidden_keys,
    require_projected_crs,
    safe_id,
    timestamp_id,
    write_json,
)


def build_evidence_packet(
    project_id: str,
    project_crs: str,
    output_dir: Path,
    raster_fixtures_path: Path | None = None,
    vector_labels_path: Path | None = None,
    cv_candidates_path: Path | None = None,
    score_report_path: Path | None = None,
    source_artifact_paths: list[Path] | None = None,
    created_at: str = DEFAULT_CREATED_AT,
) -> int:
    require_projected_crs(project_crs, "Companion evidence packet project CRS")
    input_payloads = load_input_payloads(
        raster_fixtures_path,
        vector_labels_path,
        cv_candidates_path,
        score_report_path,
        source_artifact_paths or [],
    )
    candidates = candidate_entries(input_payloads.get("cvCandidates", {}))
    evidence_id = f"{project_id}:companion-evidence-packet:{timestamp_id(created_at)}"
    calibration_status = "valid_projected_xy" if any(candidate_has_valid_projected_xy(candidate, project_crs) for candidate in candidates) else "evidence_only"
    evidence_record = {
        "id": evidence_id,
        "projectId": project_id,
        "sourceKind": "model_output",
        "createdAt": created_at,
        "projectCrs": project_crs,
        "summary": "Local/offline companion GIS/CV evidence packet for operator review.",
        "confidence": packet_confidence(candidates),
        "reviewStatus": "unreviewed",
        "notes": "Advisory companion evidence only; no dashboard or API command mutates canonical projected XY geometry.",
        "artifacts": input_payloads["sourceArtifactHashes"],
        "metrics": {
            "packetVersion": COMPANION_PACKET_VERSION,
            "candidateCount": len(candidates),
            "calibrationStatus": calibration_status,
            "networkRequired": False,
            "keyedService": False,
            "canonicalGeometryMutation": False,
        },
    }
    recommendations = [
        candidate_recommendation(project_id, project_crs, evidence_id, candidate, index, created_at)
        for index, candidate in enumerate(candidates)
    ]
    projected_features = [
        *projected_candidate_features(project_id, project_crs, candidates),
        *vector_label_projected_features(input_payloads.get("vectorLabels", {})),
    ]
    packet = {
        "schemaVersion": PROJECT_REVIEW_DATA_SCHEMA_VERSION,
        "packetVersion": COMPANION_PACKET_VERSION,
        "projectId": project_id,
        "projectCrs": project_crs,
        "createdAt": created_at,
        "calibrationStatus": calibration_status,
        "sourceArtifactHashes": input_payloads["sourceArtifactHashes"],
        "localProvenance": {
            "networkRequired": False,
            "keyedService": False,
            "hiddenKeysAllowed": False,
            "canonicalGeometryMutation": False,
            "writesProjectDatabase": False,
        },
        "evidenceRecords": [evidence_record],
        "modelRecommendations": recommendations,
        "layoutDecisions": [],
        "networkRequired": False,
        "keyedService": False,
        "hiddenKeysAllowed": False,
        "canonicalGeometryMutation": False,
        "nonGoals": [
            "No React Native Python/GDAL runtime dependency.",
            "No cloud backend, hidden key, hosted dashboard, or paid imagery service.",
            "No automatic canonical projected XY mutation from CV, raster, vector, dashboard, or API evidence.",
        ],
    }
    review_json_path = output_dir / "companion-evidence-packet.json"
    recommendations_geojson_path = output_dir / "companion-evidence-packet-recommendations.geojson"
    projected_geojson_path = output_dir / "companion-evidence-packet-projected-xy.geojson"
    write_json(review_json_path, packet)
    write_json(recommendations_geojson_path, recommendations_to_geojson(recommendations))
    write_json(projected_geojson_path, projected_xy_geojson(project_id, project_crs, projected_features))
    print(json.dumps({
        "packet": str(review_json_path),
        "recommendationsGeoJson": str(recommendations_geojson_path),
        "projectedXyGeoJson": str(projected_geojson_path),
        "recommendationCount": len(recommendations),
        "projectedFeatureCount": len(projected_features),
        "networkRequired": False,
        "canonicalGeometryMutation": False,
    }, indent=2, sort_keys=True))
    return 0


def load_input_payloads(
    raster_fixtures_path: Path | None,
    vector_labels_path: Path | None,
    cv_candidates_path: Path | None,
    score_report_path: Path | None,
    source_artifact_paths: list[Path],
) -> dict[str, Any]:
    payloads: dict[str, Any] = {"sourceArtifactHashes": {}}
    for key, path in [
        ("rasterFixtures", raster_fixtures_path),
        ("vectorLabels", vector_labels_path),
        ("cvCandidates", cv_candidates_path),
        ("scoreReport", score_report_path),
    ]:
        if path is None:
            continue
        payload = load_json(path)
        reject_hidden_keys(payload)
        payloads[key] = payload
        payloads["sourceArtifactHashes"][key] = file_artifact(path)
    for index, path in enumerate(source_artifact_paths):
        payloads["sourceArtifactHashes"][f"sourceArtifact{index + 1}"] = file_artifact(path)
    if len(payloads["sourceArtifactHashes"]) == 0:
        raise SystemExit("build-evidence-packet requires at least one input payload or source artifact.")
    return payloads


def candidate_entries(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    candidates = payload.get("candidates") or payload.get("detections") or payload.get("modelCandidates") or []
    if not isinstance(candidates, list):
        raise SystemExit("CV candidate payload must contain a candidates, detections, or modelCandidates array.")
    for candidate in candidates:
        reject_hidden_keys(candidate)
    return [candidate for candidate in candidates if isinstance(candidate, dict)]


def candidate_has_valid_projected_xy(candidate: dict[str, Any], project_crs: str) -> bool:
    if str(candidate.get("projectCrs", project_crs)) != project_crs:
        return False
    calibration = str(candidate.get("calibrationStatus", "")).lower()
    if calibration not in {"valid", "valid_projected_xy", "project_crs_xy", "calibrated"}:
        return False
    return candidate_projected_point(candidate) is not None or candidate_projected_polygon(candidate) is not None


def candidate_recommendation(
    project_id: str,
    project_crs: str,
    evidence_id: str,
    candidate: dict[str, Any],
    index: int,
    created_at: str,
) -> dict[str, Any]:
    candidate_id = safe_id(str(candidate.get("id") or candidate.get("name") or f"candidate-{index + 1}"))
    kind = str(candidate.get("kind") or candidate.get("geometryRole") or candidate.get("type") or "metadata_only")
    valid_projected = candidate_has_valid_projected_xy(candidate, project_crs)
    proposed_geometry: dict[str, Any] = {"projectCrs": project_crs}
    if valid_projected and kind in {"pivot_center", "pivot", "center"}:
        proposed_geometry["pivotCenter"] = candidate_projected_point(candidate)
    elif valid_projected and kind in {"field_boundary", "boundary", "polygon"}:
        polygon = candidate_projected_polygon(candidate)
        if polygon is not None:
            proposed_geometry["fieldBoundary"] = polygon
    elif valid_projected and kind in {"obstacle_polygon", "obstacle"}:
        polygon = candidate_projected_polygon(candidate)
        if polygon is not None:
            proposed_geometry["obstaclePolygons"] = [polygon]
    hard_failures = []
    if len(proposed_geometry) == 1:
        hard_failures.append("projected XY calibration absent")
    if str(candidate.get("projectCrs", project_crs)) != project_crs:
        hard_failures.append(f"candidate project CRS does not match {project_crs}")
    confidence = number_or_default(candidate.get("confidence"), 0.35)
    return {
        "id": f"{project_id}:companion:{candidate_id}",
        "projectId": project_id,
        "modelName": str(candidate.get("modelName") or "local-companion-gis-cv-packet"),
        "modelVersion": str(candidate.get("modelVersion") or "0.1.0"),
        "createdAt": created_at,
        "projectCrs": project_crs,
        "summary": str(candidate.get("summary") or f"Review local companion candidate {candidate_id}."),
        "proposedGeometry": proposed_geometry,
        "confidence": confidence,
        "evidenceIds": [evidence_id],
        "reviewStatus": "unreviewed",
        "score": candidate.get("score") if isinstance(candidate.get("score"), (int, float)) else confidence,
        "scoreBreakdown": candidate.get("scoreBreakdown") if isinstance(candidate.get("scoreBreakdown"), dict) else None,
        "metadata": {
            "packetVersion": COMPANION_PACKET_VERSION,
            "sourceCandidateId": candidate_id,
            "candidateKind": kind,
            "calibrationStatus": candidate.get("calibrationStatus", "evidence_only"),
            "imageSpaceOnly": len(hard_failures) > 0,
            "feasible": len(hard_failures) == 0,
            "hardFailures": hard_failures,
            "networkRequired": False,
            "keyedService": False,
            "canonicalGeometryMutation": False,
        },
        "warnings": [
            *candidate_warnings(candidate),
            *hard_failures,
            "Operator review and projected-XY apply confirmation are required before geometry changes.",
        ],
    }


def packet_confidence(candidates: list[dict[str, Any]]) -> float:
    if not candidates:
        return 0.35
    return max(number_or_default(candidate.get("confidence"), 0.35) for candidate in candidates)


def candidate_warnings(candidate: dict[str, Any]) -> list[str]:
    warnings = candidate.get("warnings")
    if isinstance(warnings, list):
        return [str(warning) for warning in warnings]
    return []


def candidate_projected_point(candidate: dict[str, Any]) -> dict[str, float] | None:
    point = candidate.get("projectedPoint") or candidate.get("projectedPivotCenter") or candidate.get("projectedXY")
    if isinstance(point, dict) and isinstance(point.get("x"), (int, float)) and isinstance(point.get("y"), (int, float)):
        return {"x": float(point["x"]), "y": float(point["y"])}
    return None


def candidate_projected_polygon(candidate: dict[str, Any]) -> list[dict[str, float]] | None:
    polygon = candidate.get("projectedPolygon") or candidate.get("projectedFieldBoundary")
    projected_geometry = candidate.get("projectedGeometry")
    if polygon is None and isinstance(projected_geometry, dict):
        polygon = projected_geometry.get("polygon")
    if not isinstance(polygon, list):
        return None
    points = [
        {"x": float(point["x"]), "y": float(point["y"])}
        for point in polygon
        if isinstance(point, dict) and isinstance(point.get("x"), (int, float)) and isinstance(point.get("y"), (int, float))
    ]
    return points if len(points) >= 3 else None


def projected_candidate_features(project_id: str, project_crs: str, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    features = []
    for index, candidate in enumerate(candidates):
        if not candidate_has_valid_projected_xy(candidate, project_crs):
            continue
        candidate_id = safe_id(str(candidate.get("id") or candidate.get("name") or f"candidate-{index + 1}"))
        properties = {
            "id": candidate_id,
            "projectId": project_id,
            "projectCrs": project_crs,
            "coordinateReferenceSystem": "project_crs_xy",
            "source": "local_companion_cv_candidate",
            "canonicalGeometryMutation": False,
        }
        point = candidate_projected_point(candidate)
        polygon = candidate_projected_polygon(candidate)
        if point is not None:
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [point["x"], point["y"]]}, "properties": properties | {"geometryRole": "candidate_point"}})
        if polygon is not None:
            features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [closed_ring(polygon)]}, "properties": properties | {"geometryRole": "candidate_polygon"}})
    return features


def vector_label_projected_features(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    labels = payload.get("labels")
    if not isinstance(labels, list):
        return []
    features = []
    for label in labels:
        if not isinstance(label, dict):
            continue
        projected = label.get("projectedGeometry")
        if not isinstance(projected, dict):
            continue
        properties = {
            "id": str(label.get("id") or label.get("name") or "label"),
            "name": str(label.get("name") or label.get("id") or "label"),
            "projectCrs": payload.get("projectCrs"),
            "coordinateReferenceSystem": "project_crs_xy",
            "source": "operator_vector_label",
            "canonicalGeometryMutation": False,
        }
        point = projected.get("point")
        polygon = projected.get("polygon")
        if isinstance(point, dict):
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [point["x"], point["y"]]}, "properties": properties | {"geometryRole": "label_point"}})
        elif isinstance(polygon, list):
            features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [closed_ring(polygon)]}, "properties": properties | {"geometryRole": "label_polygon"}})
    return features


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
            "score": recommendation.get("score"),
            "summary": recommendation["summary"],
            "warnings": recommendation["warnings"],
            "evidenceIds": recommendation["evidenceIds"],
            "metadata": recommendation.get("metadata"),
            "scoreBreakdown": recommendation.get("scoreBreakdown"),
            "displayWgs84": recommendation["proposedGeometry"].get("displayWgs84"),
        }
        geometry = recommendation["proposedGeometry"]
        pivot = geometry.get("pivotCenter")
        boundary = geometry.get("fieldBoundary")
        obstacles = geometry.get("obstaclePolygons") or []
        if isinstance(pivot, dict):
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [pivot["x"], pivot["y"]]}, "properties": properties | {"geometryRole": "pivot_center"}})
        if isinstance(boundary, list):
            features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [closed_ring(boundary)]}, "properties": properties | {"geometryRole": "field_boundary"}})
        for obstacle_index, polygon in enumerate(obstacles):
            features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [closed_ring(polygon)]}, "properties": properties | {"geometryRole": "obstacle_polygon", "obstacleIndex": obstacle_index}})
        if pivot is None and boundary is None and not obstacles:
            features.append({"type": "Feature", "geometry": None, "properties": properties | {"geometryRole": "metadata_only"}})
    return {
        "type": "FeatureCollection",
        "schemaVersion": MODEL_RECOMMENDATIONS_SCHEMA_VERSION,
        "name": "cplayout-model-recommendations",
        "coordinateReferenceSystem": "project_crs_xy",
        "canonicalGeometryMutation": False,
        "features": features,
    }


def projected_xy_geojson(project_id: str, project_crs: str, features: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "name": "cplayout-companion-projected-xy-evidence",
        "coordinateReferenceSystem": "project_crs_xy",
        "projectId": project_id,
        "projectCrs": project_crs,
        "canonicalGeometryMutation": False,
        "features": features,
    }
