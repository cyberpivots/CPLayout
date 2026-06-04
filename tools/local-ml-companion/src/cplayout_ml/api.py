from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .companion_common import ensure_local_bind, file_artifact, load_json, reject_hidden_keys, resolve_workspace_path
from .evidence_packet import build_evidence_packet

RESERVED_PROJECT_DB_NAMES = {"project.sqlite", "projects.sqlite", "cplayout.sqlite", "cplayout-project.sqlite", "expo-project.sqlite"}


def companion_api_launch_plan(workspace: Path, host: str, port: int, experiment_db: Path | None = None) -> dict[str, Any]:
    ensure_local_bind(host)
    resolved_workspace = workspace.resolve()
    resolved_experiment_db = validate_experiment_db(resolved_workspace, experiment_db) if experiment_db is not None else None
    return {
        "service": "fastapi-companion-sidecar",
        "enabledByDefault": False,
        "readOnlyProjectBridge": True,
        "host": host,
        "port": port,
        "workspace": str(resolved_workspace),
        "experimentDb": str(resolved_experiment_db) if resolved_experiment_db else None,
        "endpoints": ["GET /health", "GET /report-packet", "POST /packets/build", "GET /artifacts/hash"],
        "networkRequired": False,
        "keyedService": False,
        "canonicalGeometryMutation": False,
        "writesCplayoutProjectDb": False,
        "arbitraryCommandExecution": False,
        "cloudUrls": [],
    }


def validate_experiment_db(workspace: Path, experiment_db: Path | None) -> Path | None:
    if experiment_db is None:
        return None
    if experiment_db.suffix != ".sqlite":
        raise SystemExit("Companion experiment DB must be a companion-owned .sqlite file when enabled.")
    if experiment_db.name.lower() in RESERVED_PROJECT_DB_NAMES:
        raise SystemExit("Companion experiment DB name is reserved for CPLayout project storage.")
    return resolve_workspace_path(workspace, experiment_db, "Companion experiment DB", must_exist=False)


def create_app(workspace: Path, experiment_db: Path | None = None) -> Any:
    try:
        from fastapi import FastAPI, HTTPException, Query  # type: ignore
    except Exception as exc:
        raise SystemExit(f"FastAPI is required for serve-companion-api. Install the api extra. {exc}")
    root = workspace.resolve()
    db_path = validate_experiment_db(root, experiment_db)
    if db_path is not None:
        initialize_experiment_index(db_path)
    app = FastAPI(title="CPLayout Local Companion API", version="0.1.0")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return companion_api_launch_plan(root, "127.0.0.1", 0, db_path)

    @app.get("/report-packet")
    def report_packet(path: str = Query(..., description="Path under the configured workspace")) -> dict[str, Any]:
        try:
            packet_path = resolve_workspace_path(root, path, "Packet", require_file=True)
            packet = load_json(packet_path)
            reject_hidden_keys(packet)
            record_experiment_event(db_path, "report_packet_read", {"path": str(packet_path), "projectId": packet.get("projectId")})
            return packet
        except SystemExit as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/artifacts/hash")
    def artifact_hash(path: str = Query(..., description="Artifact path under the configured workspace")) -> dict[str, Any]:
        try:
            artifact_path = resolve_workspace_path(root, path, "Artifact", require_file=True)
            artifact = file_artifact(artifact_path)
            record_experiment_event(db_path, "artifact_hash", {"path": str(artifact_path), "sha256": artifact["sha256"]})
            return artifact | {"networkRequired": False, "keyedService": False}
        except SystemExit as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/packets/build")
    def build_packet(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            reject_hidden_keys(payload)
            project_id = required_string(payload, "projectId")
            project_crs = required_string(payload, "projectCrs")
            output_dir = resolve_workspace_path(root, required_string(payload, "outputDir"), "Packet output directory", must_exist=False)
            raster_fixtures = optional_workspace_file(root, payload.get("rasterFixtures"), "Raster fixtures")
            vector_labels = optional_workspace_file(root, payload.get("vectorLabels"), "Vector labels")
            cv_candidates = optional_workspace_file(root, payload.get("cvCandidates"), "CV candidates")
            score_report = optional_workspace_file(root, payload.get("scoreReport"), "Score report")
            real_pivot_fixtures = optional_workspace_file(root, payload.get("realPivotFixtures"), "Real pivot fixtures")
            source_artifact_values = payload.get("sourceArtifacts", [])
            if not isinstance(source_artifact_values, list):
                raise SystemExit("sourceArtifacts must be an array of workspace-bounded paths.")
            source_artifacts = [
                resolve_workspace_path(root, value, "Source artifact", require_file=True)
                for value in source_artifact_values
            ]
            build_evidence_packet(
                project_id,
                project_crs,
                output_dir,
                raster_fixtures,
                vector_labels,
                cv_candidates,
                score_report,
                source_artifacts,
                str(payload.get("createdAt") or "1970-01-01T00:00:00.000Z"),
                real_pivot_fixtures,
            )
            packet_path = output_dir / "companion-evidence-packet.json"
            result = {
                "packet": file_artifact(packet_path),
                "candidateReportsGeoJson": file_artifact(output_dir / "companion-evidence-packet-candidates.geojson"),
                "projectedXyGeoJson": file_artifact(output_dir / "companion-evidence-packet-projected-xy.geojson"),
                "networkRequired": False,
                "keyedService": False,
                "canonicalGeometryMutation": False,
                "writesCplayoutProjectDb": False,
            }
            record_experiment_event(db_path, "packet_build", {"projectId": project_id, "packet": str(packet_path)})
            return result
        except SystemExit as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return app


def required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise SystemExit(f"POST /packets/build requires {key}.")
    return value


def optional_workspace_file(root: Path, value: Any, label: str) -> Path | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise SystemExit(f"{label} must be a non-empty path string.")
    return resolve_workspace_path(root, value, label, require_file=True)


def initialize_experiment_index(db_path: Path) -> None:
    try:
        from sqlalchemy import create_engine, text  # type: ignore
    except Exception as exc:
        raise SystemExit(f"SQLAlchemy is required for companion experiment indexing. Install the api extra. {exc}")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE IF NOT EXISTS companion_experiment_index (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              event_kind TEXT NOT NULL,
              project_id TEXT,
              artifact_path TEXT,
              payload_json TEXT NOT NULL
            )
            """
        ))


def record_experiment_event(db_path: Path | None, event_kind: str, payload: dict[str, Any]) -> None:
    if db_path is None:
        return
    try:
        from sqlalchemy import create_engine, text  # type: ignore
    except Exception as exc:
        raise SystemExit(f"SQLAlchemy is required for companion experiment indexing. Install the api extra. {exc}")
    engine = create_engine(f"sqlite:///{db_path}")
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO companion_experiment_index (created_at, event_kind, project_id, artifact_path, payload_json)
                VALUES (:created_at, :event_kind, :project_id, :artifact_path, :payload_json)
                """
            ),
            {
                "created_at": created_at,
                "event_kind": event_kind,
                "project_id": payload.get("projectId"),
                "artifact_path": payload.get("path") or payload.get("packet"),
                "payload_json": json.dumps(payload, sort_keys=True),
            },
        )


def serve_companion_api(workspace: Path, host: str, port: int, experiment_db: Path | None, dry_run: bool) -> int:
    plan = companion_api_launch_plan(workspace, host, port, experiment_db)
    if dry_run:
        print(json.dumps(plan, indent=2, sort_keys=True))
        return 0
    try:
        import uvicorn  # type: ignore
    except Exception as exc:
        raise SystemExit(f"Uvicorn is required for serve-companion-api. Install the api extra. {exc}")
    app = create_app(workspace, experiment_db)
    uvicorn.run(app, host=host, port=port)
    return 0
