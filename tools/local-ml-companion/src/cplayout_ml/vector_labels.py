from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .companion_common import (
    DEFAULT_CREATED_AT,
    closed_ring,
    file_artifact,
    is_geographic_crs_name,
    is_supported_projected_crs,
    load_json,
    normalize_crs_name,
    reject_hidden_keys,
    require_projected_crs,
    safe_id,
    write_json,
)

VECTOR_LABELS_SCHEMA_VERSION = "cplayout-vector-label-validation-v1"


def validate_vector_labels(
    input_path: Path,
    output_dir: Path,
    project_id: str,
    project_crs: str,
    created_at: str = DEFAULT_CREATED_AT,
) -> int:
    require_projected_crs(project_crs, "Vector label project CRS")
    artifact = file_artifact(input_path)
    labels, source = read_vector_labels(input_path, project_crs)
    projected_features = projected_label_features(labels, project_crs)
    projected_geojson = {
        "type": "FeatureCollection",
        "name": "cplayout-vector-labels-projected-xy",
        "coordinateReferenceSystem": "project_crs_xy",
        "projectId": project_id,
        "projectCrs": project_crs,
        "canonicalGeometryMutation": False,
        "features": projected_features,
    }
    payload = {
        "schemaVersion": VECTOR_LABELS_SCHEMA_VERSION,
        "createdAt": created_at,
        "projectId": project_id,
        "projectCrs": project_crs,
        "source": source,
        "artifact": artifact,
        "labels": labels,
        "projectedFeatureCount": len(projected_features),
        "calibrationStatus": "valid_project_crs_xy" if projected_features else "evidence_only",
        "warnings": [warning for label in labels for warning in label.get("warnings", [])],
        "networkRequired": False,
        "keyedService": False,
        "hiddenKeysAllowed": False,
        "canonicalGeometryMutation": False,
    }
    output_path = output_dir / "vector-label-validation.json"
    geojson_path = output_dir / "vector-labels.projected.geojson"
    write_json(output_path, payload)
    write_json(geojson_path, projected_geojson)
    print(json.dumps({
        "validation": str(output_path),
        "projectedGeoJson": str(geojson_path),
        "labelCount": len(labels),
        "projectedFeatureCount": len(projected_features),
        "canonicalGeometryMutation": False,
        "networkRequired": False,
    }, indent=2, sort_keys=True))
    return 0


def read_vector_labels(input_path: Path, project_crs: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    geopandas_result = read_with_geopandas(input_path, project_crs)
    if geopandas_result is not None and any(label.get("projectedGeometry") for label in geopandas_result[0]):
        return geopandas_result
    manual_result = read_geojson_labels(input_path, project_crs)
    if geopandas_result is not None:
        labels, source = manual_result
        source["geopandasAttempted"] = True
        source["geopandasWarnings"] = geopandas_result[1].get("warnings", [])
        return labels, source
    return manual_result


def read_with_geopandas(input_path: Path, project_crs: str) -> tuple[list[dict[str, Any]], dict[str, Any]] | None:
    try:
        import geopandas as gpd  # type: ignore
    except Exception:
        return None
    try:
        gdf = gpd.read_file(input_path)
    except Exception as exc:
        return [], {"reader": "geopandas", "available": True, "warnings": [f"geopandas could not read labels: {exc}"]}
    source_crs = str(gdf.crs) if gdf.crs else None
    warnings: list[str] = []
    projected_gdf = None
    if source_crs:
        try:
            projected_gdf = gdf if normalize_crs_name(source_crs) == normalize_crs_name(project_crs) else gdf.to_crs(project_crs)
        except Exception as exc:
            warnings.append(f"geopandas could not transform {source_crs} to {project_crs}: {exc}")
    else:
        warnings.append("geopandas found no CRS on the vector label source.")
    labels = []
    for index, (_, row) in enumerate(gdf.iterrows()):
        label_name = str(row.get("name") or row.get("label") or row.get("id") or f"label-{index + 1}")
        projected_geometry = None
        if projected_gdf is not None:
            projected_geometry = geometry_to_projected_payload(projected_gdf.geometry.iloc[index], project_crs)
        label_warnings = list(warnings)
        if projected_geometry is None:
            label_warnings.append("label remains evidence-only because projected XY geometry is unavailable")
        labels.append({
            "id": safe_id(label_name),
            "name": label_name,
            "sourceCrs": source_crs,
            "projectedGeometry": projected_geometry,
            "warnings": label_warnings,
        })
    return labels, {"reader": "geopandas", "available": True, "sourceCrs": source_crs, "warnings": warnings}


def read_geojson_labels(input_path: Path, project_crs: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    data = load_json(input_path)
    reject_hidden_keys(data)
    if data.get("type") != "FeatureCollection":
        raise SystemExit("Vector label input must be a GeoJSON FeatureCollection when GeoPandas is unavailable.")
    source_crs = geojson_source_crs(data)
    features = data.get("features")
    if not isinstance(features, list):
        raise SystemExit("Vector label GeoJSON must contain a features array.")
    labels = []
    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            raise SystemExit("Vector label GeoJSON features must be objects.")
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        name = str(properties.get("name") or properties.get("label") or properties.get("id") or feature.get("id") or f"label-{index + 1}")
        geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else None
        label_crs = str(properties.get("projectCrs") or source_crs or "")
        projected_geometry = manual_projected_geometry(geometry, label_crs, project_crs)
        warnings = []
        if projected_geometry is None:
            if is_geographic_crs_name(label_crs):
                warnings.append("geographic vector label remains evidence-only until a valid project-CRS transform or calibration is supplied")
            elif not label_crs:
                warnings.append("vector label has no CRS and remains evidence-only")
            else:
                warnings.append(f"vector label CRS {label_crs} does not match project CRS {project_crs}; projected XY output omitted")
        labels.append({
            "id": safe_id(str(properties.get("id") or name)),
            "name": name,
            "sourceCrs": label_crs or None,
            "properties": properties,
            "projectedGeometry": projected_geometry,
            "warnings": warnings,
        })
    return labels, {"reader": "geojson", "available": True, "sourceCrs": source_crs}


def geojson_source_crs(data: dict[str, Any]) -> str | None:
    if isinstance(data.get("coordinateReferenceSystem"), str):
        return str(data["coordinateReferenceSystem"])
    crs = data.get("crs")
    if isinstance(crs, dict):
        properties = crs.get("properties")
        if isinstance(properties, dict) and isinstance(properties.get("name"), str):
            return properties["name"]
    if isinstance(data.get("projectCrs"), str):
        return str(data["projectCrs"])
    return None


def manual_projected_geometry(geometry: dict[str, Any] | None, label_crs: str, project_crs: str) -> dict[str, Any] | None:
    if geometry is None:
        return None
    normalized = normalize_crs_name(label_crs)
    if normalized not in {"PROJECT_CRS_XY", normalize_crs_name(project_crs)} and not (normalized.startswith("LOCAL:") and normalize_crs_name(project_crs).startswith("LOCAL:")):
        return None
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Point" and isinstance(coordinates, list) and len(coordinates) >= 2:
        return {"projectCrs": project_crs, "point": {"x": float(coordinates[0]), "y": float(coordinates[1])}}
    if geometry_type == "Polygon" and isinstance(coordinates, list) and coordinates:
        ring = coordinates[0]
        if isinstance(ring, list) and len(ring) >= 4:
            points = [{"x": float(point[0]), "y": float(point[1])} for point in ring[:-1] if isinstance(point, list) and len(point) >= 2]
            if len(points) >= 3:
                return {"projectCrs": project_crs, "polygon": points}
    return None


def geometry_to_projected_payload(geometry: Any, project_crs: str) -> dict[str, Any] | None:
    if geometry is None or getattr(geometry, "is_empty", False):
        return None
    geom_type = getattr(geometry, "geom_type", "")
    if geom_type == "Point":
        return {"projectCrs": project_crs, "point": {"x": float(geometry.x), "y": float(geometry.y)}}
    if geom_type == "Polygon":
        points = [{"x": float(x), "y": float(y)} for x, y, *_ in list(geometry.exterior.coords)[:-1]]
        return {"projectCrs": project_crs, "polygon": points} if len(points) >= 3 else None
    return None


def projected_label_features(labels: list[dict[str, Any]], project_crs: str) -> list[dict[str, Any]]:
    features = []
    for label in labels:
        projected = label.get("projectedGeometry")
        if not isinstance(projected, dict):
            continue
        properties = {
            "id": label["id"],
            "name": label["name"],
            "projectCrs": project_crs,
            "coordinateReferenceSystem": "project_crs_xy",
            "source": "operator_vector_label",
        }
        point = projected.get("point")
        polygon = projected.get("polygon")
        if isinstance(point, dict):
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [point["x"], point["y"]]},
                "properties": properties | {"geometryRole": "label_point"},
            })
        elif isinstance(polygon, list):
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [closed_ring(polygon)]},
                "properties": properties | {"geometryRole": "label_polygon"},
            })
    return features
