from __future__ import annotations

import html
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from .companion_common import ensure_local_bind, file_artifact, load_json, reject_hidden_keys


STREAMLIT_APP_PATH = Path(__file__).with_name("dashboard_app.py")
COMPANION_ROOT = Path(__file__).resolve().parents[2]
DISALLOWED_EXTERNAL_REPORT_TOKENS = ["cdn.plot.ly", "https://cdn", "http://cdn", 'src="https://', 'src="http://']
LOCAL_PLOTLY_ASSET_NAME = "plotly.min.js"


def review_dashboard_launch_plan(packet_path: Path, host: str, port: int, engine: str = "streamlit") -> dict[str, Any]:
    ensure_local_bind(host)
    if engine not in {"streamlit", "dash"}:
        raise SystemExit("Dashboard engine must be streamlit or dash.")
    packet = load_json(packet_path)
    reject_hidden_keys(packet)
    command = dashboard_command(packet_path, host, port, engine)
    return {
        "service": f"{engine}-review-dashboard",
        "engine": engine,
        "readOnly": True,
        "host": host,
        "port": port,
        "packet": file_artifact(packet_path),
        "cwd": str(COMPANION_ROOT),
        "command": command,
        "dashboardControls": ["calibrationStatusFilter", "geometryGroupFilter", "confidenceScorePlot", "artifactEvidenceTables"],
        "networkRequired": False,
        "keyedService": False,
        "canonicalGeometryMutation": False,
        "writesCplayoutProjectDb": False,
        "appliesProjectedXy": False,
        "staticHtmlUsesLocalPlotlyAsset": True,
        "cloudUrls": [],
    }


def dashboard_command(packet_path: Path, host: str, port: int, engine: str) -> list[str]:
    if engine == "streamlit":
        return [
            sys.executable,
            "-m",
            "streamlit",
            "run",
            str(STREAMLIT_APP_PATH),
            "--server.headless",
            "true",
            "--server.address",
            host,
            "--server.port",
            str(port),
            "--browser.gatherUsageStats",
            "false",
        ]
    return [
        sys.executable,
        "-m",
        "cplayout_ml.cli",
        "serve-review-dashboard",
        "--engine",
        "dash",
        "--packet",
        str(packet_path),
        "--host",
        host,
        "--port",
        str(port),
    ]


def serve_review_dashboard(packet_path: Path, host: str, port: int, dry_run: bool, engine: str = "streamlit", export_html: Path | None = None) -> int:
    plan = review_dashboard_launch_plan(packet_path, host, port, engine)
    if export_html is not None:
        report = write_plotly_comparison_report(packet_path, export_html)
        print(json.dumps({"report": report, "networkRequired": False, "cloudUrls": []}, indent=2, sort_keys=True))
        return 0
    if dry_run:
        print(json.dumps(plan, indent=2, sort_keys=True))
        return 0
    if engine == "dash":
        app = create_dash_app(packet_path)
        app.run(host=host, port=port, debug=False, use_reloader=False)
        return 0
    try:
        import streamlit  # noqa: F401
    except Exception as exc:
        raise SystemExit(f"Streamlit is required for serve-review-dashboard. Install the dashboard extra. {exc}")
    env = os.environ.copy()
    env["CPLAYOUT_REVIEW_PACKET"] = str(packet_path)
    return subprocess.run(plan["command"], env=env, cwd=COMPANION_ROOT, check=False).returncode


def dashboard_model(packet_path: Path) -> dict[str, Any]:
    packet = load_json(packet_path)
    reject_hidden_keys(packet)
    projected_features = load_projected_xy_features(packet_path)
    model = {
        "packetHealth": packet_health(packet, projected_features),
        "crsCalibration": crs_calibration_status(packet),
        "localProvenance": local_provenance(packet),
        "evidenceRows": evidence_rows(packet),
        "recommendationRows": recommendation_rows(packet),
        "artifactRows": artifact_rows(packet),
        "projectedFeatureRows": projected_feature_rows(projected_features),
        "warnings": packet_warnings(packet),
        "rawPacket": packet,
    }
    model["calibrationStatuses"] = sorted({row["calibrationStatus"] for row in model["recommendationRows"]} | {model["crsCalibration"]["calibrationStatus"]})
    model["geometryGroups"] = sorted({row["geometryGroup"] for row in model["recommendationRows"]} or {"metadata_only"})
    return model


def load_projected_xy_features(packet_path: Path) -> list[dict[str, Any]]:
    candidates = [
        packet_path.with_name("companion-evidence-packet-projected-xy.geojson"),
        packet_path.with_suffix(".projected-xy.geojson"),
    ]
    for path in candidates:
        if not path.exists():
            continue
        geojson = load_json(path)
        reject_hidden_keys(geojson)
        features = geojson.get("features")
        return [feature for feature in features if isinstance(feature, dict)] if isinstance(features, list) else []
    return []


def packet_health(packet: dict[str, Any], projected_features: list[dict[str, Any]]) -> dict[str, Any]:
    failures = []
    for key in ["networkRequired", "keyedService", "hiddenKeysAllowed", "canonicalGeometryMutation"]:
        if packet.get(key) is True:
            failures.append(f"{key} must be false for local companion review")
    recommendations = packet.get("modelRecommendations") if isinstance(packet.get("modelRecommendations"), list) else []
    return {
        "projectId": packet.get("projectId"),
        "projectCrs": packet.get("projectCrs"),
        "packetVersion": packet.get("packetVersion"),
        "schemaVersion": packet.get("schemaVersion"),
        "status": "blocked" if failures else "ready_for_read_only_review",
        "failureCount": len(failures),
        "failures": failures,
        "evidenceCount": len(packet.get("evidenceRecords", [])) if isinstance(packet.get("evidenceRecords"), list) else 0,
        "recommendationCount": len(recommendations),
        "projectedFeatureCount": len(projected_features),
        "readOnly": True,
        "canonicalGeometryMutation": False,
    }


def crs_calibration_status(packet: dict[str, Any]) -> dict[str, Any]:
    recommendations = packet.get("modelRecommendations") if isinstance(packet.get("modelRecommendations"), list) else []
    projected_count = sum(1 for recommendation in recommendations if recommendation_geometry_group(recommendation) == "projected_xy")
    metadata_only_count = len(recommendations) - projected_count
    return {
        "projectCrs": packet.get("projectCrs"),
        "calibrationStatus": packet.get("calibrationStatus", "evidence_only"),
        "projectedRecommendationCount": projected_count,
        "metadataOnlyRecommendationCount": metadata_only_count,
        "canonicalGeometrySource": "projected_local_xy",
        "wgs84Policy": "display_or_input_only",
    }


def local_provenance(packet: dict[str, Any]) -> dict[str, Any]:
    provenance = packet.get("localProvenance") if isinstance(packet.get("localProvenance"), dict) else {}
    return {
        "networkRequired": bool(packet.get("networkRequired", provenance.get("networkRequired", False))),
        "keyedService": bool(packet.get("keyedService", provenance.get("keyedService", False))),
        "hiddenKeysAllowed": bool(packet.get("hiddenKeysAllowed", provenance.get("hiddenKeysAllowed", False))),
        "canonicalGeometryMutation": bool(packet.get("canonicalGeometryMutation", provenance.get("canonicalGeometryMutation", False))),
        "writesProjectDatabase": bool(provenance.get("writesProjectDatabase", False)),
        "dashboardReadOnly": True,
        "cloudUrls": [],
    }


def evidence_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    evidence = packet.get("evidenceRecords")
    if not isinstance(evidence, list):
        return []
    rows = []
    for record in evidence:
        if not isinstance(record, dict):
            continue
        metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
        rows.append({
            "id": record.get("id"),
            "sourceKind": record.get("sourceKind"),
            "summary": record.get("summary"),
            "confidence": record.get("confidence"),
            "reviewStatus": record.get("reviewStatus"),
            "calibrationStatus": metrics.get("calibrationStatus", packet.get("calibrationStatus", "evidence_only")),
            "candidateCount": metrics.get("candidateCount"),
            "canonicalGeometryMutation": bool(metrics.get("canonicalGeometryMutation", False)),
        })
    return rows


def recommendation_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    recommendations = packet.get("modelRecommendations")
    if not isinstance(recommendations, list):
        return []
    rows = []
    for recommendation in recommendations:
        if not isinstance(recommendation, dict):
            continue
        metadata = recommendation.get("metadata") if isinstance(recommendation.get("metadata"), dict) else {}
        hard_failures = [str(item) for item in metadata.get("hardFailures", [])] if isinstance(metadata.get("hardFailures"), list) else []
        warnings = [str(item) for item in recommendation.get("warnings", [])] if isinstance(recommendation.get("warnings"), list) else []
        confidence = numeric_or_none(recommendation.get("confidence"))
        score = numeric_or_none(recommendation.get("score"))
        rows.append({
            "id": recommendation.get("id"),
            "summary": recommendation.get("summary"),
            "modelName": recommendation.get("modelName"),
            "modelVersion": recommendation.get("modelVersion"),
            "confidence": confidence,
            "score": score if score is not None else confidence,
            "reviewStatus": recommendation.get("reviewStatus"),
            "calibrationStatus": metadata.get("calibrationStatus", packet.get("calibrationStatus", "evidence_only")),
            "geometryGroup": recommendation_geometry_group(recommendation),
            "feasible": bool(metadata.get("feasible", len(hard_failures) == 0)),
            "hardFailures": "; ".join(hard_failures),
            "warningCount": len(warnings),
            "warnings": "; ".join(warnings),
        })
    return rows


def artifact_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    rows.extend(artifact_mapping_rows(packet.get("sourceArtifactHashes"), "packet"))
    evidence = packet.get("evidenceRecords")
    if isinstance(evidence, list):
        for record in evidence:
            if isinstance(record, dict):
                rows.extend(artifact_mapping_rows(record.get("artifacts"), str(record.get("id") or "evidence")))
    return rows


def artifact_mapping_rows(value: Any, owner: str) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        return []
    rows = []
    for name, artifact in value.items():
        if isinstance(artifact, dict):
            rows.append({
                "owner": owner,
                "name": name,
                "path": artifact.get("path"),
                "sha256": artifact.get("sha256"),
                "byteLength": artifact.get("byteLength"),
            })
    return rows


def projected_feature_rows(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for index, feature in enumerate(features):
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else None
        rows.append({
            "index": index,
            "id": properties.get("id"),
            "geometryRole": properties.get("geometryRole"),
            "source": properties.get("source"),
            "projectCrs": properties.get("projectCrs"),
            "geometryType": geometry.get("type") if geometry else None,
            "canonicalGeometryMutation": bool(properties.get("canonicalGeometryMutation", False)),
        })
    return rows


def packet_warnings(packet: dict[str, Any]) -> list[str]:
    warnings = []
    health = packet_health(packet, [])
    warnings.extend(health["failures"])
    for row in recommendation_rows(packet):
        if row["hardFailures"]:
            warnings.append(f"{row['id']}: {row['hardFailures']}")
        if row["warnings"]:
            warnings.append(f"{row['id']}: {row['warnings']}")
    non_goals = packet.get("nonGoals")
    if isinstance(non_goals, list):
        warnings.extend(str(item) for item in non_goals)
    return warnings


def recommendation_geometry_group(recommendation: dict[str, Any]) -> str:
    geometry = recommendation.get("proposedGeometry")
    if not isinstance(geometry, dict):
        return "metadata_only"
    if isinstance(geometry.get("pivotCenter"), dict):
        return "projected_xy"
    if isinstance(geometry.get("fieldBoundary"), list) and geometry["fieldBoundary"]:
        return "projected_xy"
    if isinstance(geometry.get("obstaclePolygons"), list) and geometry["obstaclePolygons"]:
        return "projected_xy"
    return "metadata_only"


def numeric_or_none(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def create_candidate_comparison_figure(
    model: dict[str, Any],
    calibration_statuses: list[str] | None = None,
    geometry_groups: list[str] | None = None,
) -> Any:
    import plotly.graph_objects as go  # type: ignore

    rows = filter_recommendation_rows(model["recommendationRows"], calibration_statuses, geometry_groups)
    x = [str(row["id"]) for row in rows]
    score = [row["score"] if row["score"] is not None else 0 for row in rows]
    confidence = [row["confidence"] if row["confidence"] is not None else 0 for row in rows]
    colors = ["#2f7d57" if row["geometryGroup"] == "projected_xy" else "#8a5a12" for row in rows]
    figure = go.Figure()
    figure.add_trace(go.Bar(name="Score", x=x, y=score, marker_color=colors, hovertext=[row["hardFailures"] or row["summary"] for row in rows]))
    figure.add_trace(go.Scatter(name="Confidence", x=x, y=confidence, mode="markers+lines", marker={"color": "#155e75", "size": 10}))
    figure.update_layout(
        title="Candidate comparison",
        xaxis_title="Candidate",
        yaxis_title="Score / confidence",
        yaxis_range=[0, 1],
        template="plotly_white",
        margin={"l": 48, "r": 24, "t": 64, "b": 96},
    )
    return figure


def filter_recommendation_rows(rows: list[dict[str, Any]], calibration_statuses: list[str] | None, geometry_groups: list[str] | None) -> list[dict[str, Any]]:
    calibration_filter = set(calibration_statuses or [])
    geometry_filter = set(geometry_groups or [])
    return [
        row
        for row in rows
        if (not calibration_filter or row["calibrationStatus"] in calibration_filter)
        and (not geometry_filter or row["geometryGroup"] in geometry_filter)
    ]


def create_dash_app(packet_path: Path) -> Any:
    try:
        from dash import Dash, Input, Output, dash_table, dcc, html as dash_html  # type: ignore
    except Exception as exc:
        raise SystemExit(f"Dash is required for --engine dash. Install the dashboard extra. {exc}")

    model = dashboard_model(packet_path)
    app = Dash(__name__)
    app.title = "CPLayout Companion Comparison"
    app.layout = dash_html.Div(
        [
            dash_html.H1("CPLayout Companion Comparison"),
            dash_html.Div(f"Project {model['packetHealth'].get('projectId')} | CRS {model['packetHealth'].get('projectCrs')}"),
            dash_html.Div(
                [
                    dcc.Dropdown(
                        id="calibration-filter",
                        options=[{"label": value, "value": value} for value in model["calibrationStatuses"]],
                        value=model["calibrationStatuses"],
                        multi=True,
                        clearable=True,
                    ),
                    dcc.Dropdown(
                        id="geometry-filter",
                        options=[{"label": value, "value": value} for value in model["geometryGroups"]],
                        value=model["geometryGroups"],
                        multi=True,
                        clearable=True,
                    ),
                ],
                style={"display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "12px", "maxWidth": "920px"},
            ),
            dcc.Graph(id="candidate-comparison"),
            dash_table.DataTable(id="recommendation-table", columns=table_columns(model["recommendationRows"]), data=model["recommendationRows"], page_size=10),
            dash_html.H2("Evidence"),
            dash_table.DataTable(columns=table_columns(model["evidenceRows"]), data=model["evidenceRows"], page_size=8),
            dash_html.H2("Artifacts"),
            dash_table.DataTable(columns=table_columns(model["artifactRows"]), data=model["artifactRows"], page_size=8),
            dash_html.H2("Projected XY Features"),
            dash_table.DataTable(columns=table_columns(model["projectedFeatureRows"]), data=model["projectedFeatureRows"], page_size=8),
        ],
        style={"fontFamily": "Inter, system-ui, sans-serif", "padding": "24px", "color": "#1f2933"},
    )

    @app.callback(
        Output("candidate-comparison", "figure"),
        Output("recommendation-table", "data"),
        Input("calibration-filter", "value"),
        Input("geometry-filter", "value"),
    )
    def update_candidate_view(calibration_statuses: list[str] | None, geometry_groups: list[str] | None) -> tuple[Any, list[dict[str, Any]]]:
        rows = filter_recommendation_rows(model["recommendationRows"], calibration_statuses, geometry_groups)
        return create_candidate_comparison_figure(model, calibration_statuses, geometry_groups), rows

    return app


def table_columns(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    keys = sorted({key for row in rows for key in row})
    return [{"name": key, "id": key} for key in keys]


def write_plotly_comparison_report(packet_path: Path, output_path: Path) -> dict[str, Any]:
    model = dashboard_model(packet_path)
    figure = create_candidate_comparison_figure(model)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    local_plotly_asset = copy_local_plotly_asset(output_path.parent)
    figure_html = figure.to_html(include_plotlyjs=False, full_html=False, config={"responsive": True}, default_height="70vh")
    body = "\n".join([
        "<!doctype html>",
        "<html>",
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="cplayout-cloud-urls" content="none">',
        "<title>CPLayout Companion Comparison</title>",
        "<style>body{font-family:Arial,sans-serif;margin:24px;color:#1f2933}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #ccd3da;padding:6px 8px;text-align:left;vertical-align:top}th{background:#edf2f7}.muted{color:#52616b}</style>",
        f'<script src="./{LOCAL_PLOTLY_ASSET_NAME}"></script>',
        "</head>",
        "<body>",
        "<h1>CPLayout Companion Comparison</h1>",
        f"<p class=\"muted\">Project {escape(model['packetHealth'].get('projectId'))}; CRS {escape(model['packetHealth'].get('projectCrs'))}; read-only local report.</p>",
        figure_html,
        "<h2>Packet Health</h2>",
        html_table([model["packetHealth"]]),
        "<h2>Recommendations</h2>",
        html_table(model["recommendationRows"]),
        "<h2>Artifacts</h2>",
        html_table(model["artifactRows"]),
        "<h2>Projected XY Features</h2>",
        html_table(model["projectedFeatureRows"]),
        "</body>",
        "</html>",
    ])
    lower = body.lower()
    for token in DISALLOWED_EXTERNAL_REPORT_TOKENS:
        if token in lower:
            raise SystemExit(f"Static Plotly report contains disallowed external reference: {token}")
    write_text(output_path, body)
    artifact = file_artifact(output_path)
    return artifact | {
        "readOnly": True,
        "networkRequired": False,
        "cloudUrls": [],
        "localPlotlyAsset": file_artifact(local_plotly_asset),
        "canonicalGeometryMutation": False,
    }


def html_table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "<p class=\"muted\">No rows.</p>"
    keys = sorted({key for row in rows for key in row})
    header = "".join(f"<th>{escape(key)}</th>" for key in keys)
    body = "".join(
        "<tr>" + "".join(f"<td>{escape(row.get(key))}</td>" for key in keys) + "</tr>"
        for row in rows
    )
    return f"<table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table>"


def escape(value: Any) -> str:
    if isinstance(value, (dict, list)):
        value = json.dumps(value, sort_keys=True)
    return html.escape("" if value is None else str(value))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def copy_local_plotly_asset(output_dir: Path) -> Path:
    try:
        import plotly  # type: ignore
    except Exception as exc:
        raise SystemExit(f"Plotly is required for --export-html. Install the dashboard extra. {exc}")
    source = Path(plotly.__file__).resolve().parent / "package_data" / LOCAL_PLOTLY_ASSET_NAME
    if not source.exists():
        raise SystemExit(f"Plotly local JavaScript asset was not found: {source}")
    target = output_dir / LOCAL_PLOTLY_ASSET_NAME
    if source.resolve() != target.resolve():
        shutil.copyfile(source, target)
    return target
