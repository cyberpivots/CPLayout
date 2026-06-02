import contextlib
import importlib.util
import io
import json
import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from cplayout_ml.api import companion_api_launch_plan, create_app
from cplayout_ml.cli import main
from cplayout_ml.dashboard import dashboard_model, review_dashboard_launch_plan, write_plotly_comparison_report
from cplayout_ml.evidence_packet import build_evidence_packet
from cplayout_ml.optional_imports import EXTRA_GROUP_IMPORTS, import_smoke_results
from cplayout_ml.raster_fixtures import prepare_raster_fixtures
from cplayout_ml.vector_labels import validate_vector_labels


class CompanionToolingTests(unittest.TestCase):
    def test_prepare_raster_fixtures_hashes_artifacts_and_records_offline_metadata(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            raster = root / "fixture.bin"
            raster.write_bytes(b"local raster bytes")
            manifest = root / "rasters.json"
            manifest.write_text(json.dumps({
                "projectId": "project-a",
                "projectCrs": "EPSG:32613",
                "rasters": [{
                    "id": "fixture-a",
                    "path": "fixture.bin",
                    "provenance": {"source": "operator_owned_local_copy", "keyedService": False},
                }],
            }), encoding="utf-8")

            self.assertEqual(prepare_raster_fixtures(manifest, root / "out", created_at="2026-06-02T00:00:00.000Z"), 0)

            metadata = json.loads((root / "out" / "raster-fixture-metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["schemaVersion"], "cplayout-raster-fixtures-v1")
            self.assertEqual(metadata["projectCrs"], "EPSG:32613")
            self.assertEqual(metadata["fixtures"][0]["artifact"]["byteLength"], len(b"local raster bytes"))
            self.assertFalse(metadata["networkRequired"])
            self.assertFalse(metadata["keyedService"])
            self.assertFalse(metadata["canonicalGeometryMutation"])

    def test_prepare_raster_fixtures_rejects_projected_output_without_crs(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            raster = root / "not-a-geotiff.bin"
            raster.write_bytes(b"not a georeferenced raster")
            manifest = root / "rasters.json"
            manifest.write_text(json.dumps({
                "projectId": "project-a",
                "projectCrs": "EPSG:32613",
                "rasters": [{"id": "missing-crs", "path": "not-a-geotiff.bin"}],
            }), encoding="utf-8")

            with self.assertRaises(SystemExit):
                prepare_raster_fixtures(manifest, root / "out", require_projected_output=True)

    def test_validate_vector_labels_project_crs_geojson_outputs_xy(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            labels = root / "labels.geojson"
            labels.write_text(json.dumps({
                "type": "FeatureCollection",
                "coordinateReferenceSystem": "project_crs_xy",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"id": "pivot-label", "name": "TRUE_PIVOT_CENTER"},
                        "geometry": {"type": "Point", "coordinates": [100.0, 200.0]},
                    },
                    {
                        "type": "Feature",
                        "properties": {"id": "boundary-label", "name": "TARGET_FIELD_BOUNDARY"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 0.0]]],
                        },
                    },
                ],
            }), encoding="utf-8")

            with patch("cplayout_ml.vector_labels.read_with_geopandas", return_value=None):
                self.assertEqual(validate_vector_labels(labels, root / "out", "project-a", "EPSG:32613", "2026-06-02T00:00:00.000Z"), 0)

            validation = json.loads((root / "out" / "vector-label-validation.json").read_text(encoding="utf-8"))
            projected = json.loads((root / "out" / "vector-labels.projected.geojson").read_text(encoding="utf-8"))
            self.assertEqual(validation["schemaVersion"], "cplayout-vector-label-validation-v1")
            self.assertEqual(validation["projectedFeatureCount"], 2)
            self.assertEqual(projected["coordinateReferenceSystem"], "project_crs_xy")
            self.assertEqual(projected["features"][0]["geometry"]["coordinates"], [100.0, 200.0])
            self.assertFalse(validation["canonicalGeometryMutation"])

    def test_validate_vector_labels_wgs84_stays_evidence_only_without_transform(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            labels = root / "labels.geojson"
            labels.write_text(json.dumps({
                "type": "FeatureCollection",
                "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
                "features": [{
                    "type": "Feature",
                    "properties": {"id": "wgs84-label", "name": "DISPLAY_ONLY"},
                    "geometry": {"type": "Point", "coordinates": [-104.0, 40.0]},
                }],
            }), encoding="utf-8")

            with patch("cplayout_ml.vector_labels.read_with_geopandas", return_value=None):
                self.assertEqual(validate_vector_labels(labels, root / "out", "project-a", "EPSG:32613"), 0)

            validation = json.loads((root / "out" / "vector-label-validation.json").read_text(encoding="utf-8"))
            projected = json.loads((root / "out" / "vector-labels.projected.geojson").read_text(encoding="utf-8"))
            self.assertEqual(validation["projectedFeatureCount"], 0)
            self.assertEqual(validation["calibrationStatus"], "evidence_only")
            self.assertIn("geographic vector label remains evidence-only", validation["warnings"][0])
            self.assertEqual(projected["features"], [])

    def test_build_evidence_packet_splits_image_space_from_calibrated_candidates(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.png"
            source.write_bytes(b"image")
            candidates = root / "cv-candidates.json"
            candidates.write_text(json.dumps({
                "candidates": [
                    {
                        "id": "image-space-center",
                        "kind": "pivot_center",
                        "confidence": 0.7,
                        "imagePoint": {"x": 120.0, "y": 140.0},
                        "calibrationStatus": "image_space_only",
                    },
                    {
                        "id": "calibrated-center",
                        "kind": "pivot_center",
                        "confidence": 0.82,
                        "projectCrs": "EPSG:32613",
                        "projectedPoint": {"x": 500000.0, "y": 4410000.0},
                        "calibrationStatus": "valid",
                    },
                ],
            }), encoding="utf-8")

            self.assertEqual(
                build_evidence_packet(
                    "project-a",
                    "EPSG:32613",
                    root / "packet",
                    cv_candidates_path=candidates,
                    source_artifact_paths=[source],
                    created_at="2026-06-02T00:00:00.000Z",
                ),
                0,
            )

            packet = json.loads((root / "packet" / "companion-evidence-packet.json").read_text(encoding="utf-8"))
            recommendations = packet["modelRecommendations"]
            projected = json.loads((root / "packet" / "companion-evidence-packet-projected-xy.geojson").read_text(encoding="utf-8"))
            recommendation_geojson = json.loads((root / "packet" / "companion-evidence-packet-recommendations.geojson").read_text(encoding="utf-8"))

            self.assertEqual(packet["schemaVersion"], "cplayout-project-review-data-v1")
            self.assertEqual(packet["packetVersion"], "cplayout-companion-evidence-packet-v1")
            self.assertFalse(packet["networkRequired"])
            self.assertFalse(packet["keyedService"])
            self.assertFalse(packet["canonicalGeometryMutation"])
            self.assertIn("sourceArtifact1", packet["sourceArtifactHashes"])
            self.assertNotIn("pivotCenter", recommendations[0]["proposedGeometry"])
            self.assertIn("projected XY calibration absent", recommendations[0]["metadata"]["hardFailures"])
            self.assertEqual(recommendations[1]["proposedGeometry"]["pivotCenter"], {"x": 500000.0, "y": 4410000.0})
            self.assertEqual(projected["features"][0]["geometry"]["type"], "Point")
            self.assertEqual(recommendation_geojson["features"][0]["properties"]["geometryRole"], "metadata_only")

    def test_local_service_launch_plans_reject_non_local_binds(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            packet = root / "packet.json"
            packet.write_text(json.dumps({
                "projectId": "project-a",
                "projectCrs": "EPSG:32613",
                "networkRequired": False,
                "keyedService": False,
                "canonicalGeometryMutation": False,
            }), encoding="utf-8")

            dashboard = review_dashboard_launch_plan(packet, "127.0.0.1", 8501)
            api = companion_api_launch_plan(root, "localhost", 8765)

            self.assertTrue(dashboard["readOnly"])
            self.assertEqual(dashboard["cloudUrls"], [])
            self.assertFalse(dashboard["networkRequired"])
            self.assertFalse(api["writesCplayoutProjectDb"])
            self.assertEqual(api["cloudUrls"], [])
            with self.assertRaises(SystemExit):
                review_dashboard_launch_plan(packet, "0.0.0.0", 8501)
            with self.assertRaises(SystemExit):
                companion_api_launch_plan(root, "0.0.0.0", 8765)
            with self.assertRaises(SystemExit):
                companion_api_launch_plan(root, "localhost", 8765, root / "project.sqlite")

    def test_optional_extra_import_smoke_reports_all_groups(self) -> None:
        results = import_smoke_results()

        self.assertEqual(set(results), set(EXTRA_GROUP_IMPORTS))
        for group, result in results.items():
            self.assertIn("available", result)
            self.assertEqual(len(result["modules"]), len(EXTRA_GROUP_IMPORTS[group]))

    def test_probe_companion_deps_cli_reports_missing_required_group(self) -> None:
        fake_probe = {
            "schemaVersion": "cplayout-companion-dependency-probe-v1",
            "groups": ["dashboard"],
            "required": True,
            "available": False,
            "missing": ["dashboard:streamlit"],
            "results": {},
        }
        with patch("cplayout_ml.cli.companion_dependency_probe", return_value=fake_probe):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                exit_code = main(["probe-companion-deps", "--groups", "dashboard", "--require-installed"])
        self.assertEqual(exit_code, 1)
        self.assertIn("dashboard:streamlit", output.getvalue())

    def test_dashboard_helpers_group_projected_xy_and_metadata_only_candidates(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            packet = write_companion_packet_fixture(root)
            projected = root / "companion-evidence-packet-projected-xy.geojson"
            projected.write_text(json.dumps({
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [500000, 4410000]},
                    "properties": {"id": "calibrated-center", "geometryRole": "candidate_point", "source": "local_companion_cv_candidate", "projectCrs": "EPSG:32613"},
                }],
            }), encoding="utf-8")

            model = dashboard_model(packet)
            groups = {row["id"]: row["geometryGroup"] for row in model["recommendationRows"]}

            self.assertEqual(model["packetHealth"]["status"], "ready_for_read_only_review")
            self.assertEqual(model["packetHealth"]["projectedFeatureCount"], 1)
            self.assertEqual(groups["sample-project:companion:image-space-center"], "metadata_only")
            self.assertEqual(groups["sample-project:companion:calibrated-center"], "projected_xy")
            self.assertIn("projected XY calibration absent", model["recommendationRows"][0]["hardFailures"])
            self.assertFalse(model["localProvenance"]["writesProjectDatabase"])

    def test_cli_dry_runs_cover_streamlit_dash_and_fastapi(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            packet = write_companion_packet_fixture(root)

            for args in [
                ["serve-review-dashboard", "--packet", str(packet), "--engine", "streamlit", "--dry-run"],
                ["serve-review-dashboard", "--packet", str(packet), "--engine", "dash", "--port", "8502", "--dry-run"],
                ["serve-companion-api", "--workspace", str(root), "--dry-run"],
            ]:
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    self.assertEqual(main(args), 0)
                payload = json.loads(output.getvalue())
                self.assertEqual(payload["cloudUrls"], [])
                self.assertFalse(payload["networkRequired"])

    @unittest.skipUnless(importlib.util.find_spec("plotly") is not None, "plotly extra is not installed in this Python environment")
    def test_plotly_report_is_self_contained_and_local(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            packet = write_companion_packet_fixture(root)
            report = write_plotly_comparison_report(packet, root / "report.html")
            html = (root / "report.html").read_text(encoding="utf-8").lower()

            self.assertTrue(report["readOnly"])
            self.assertFalse(report["networkRequired"])
            self.assertEqual(report["cloudUrls"], [])
            self.assertTrue((root / "plotly.min.js").exists())
            self.assertIn('<script src="./plotly.min.js"></script>', html)
            self.assertNotIn("cdn.plot.ly", html)
            self.assertIn("metadata_only", html)

    @unittest.skipUnless(
        importlib.util.find_spec("fastapi") is not None
        and importlib.util.find_spec("sqlalchemy") is not None
        and importlib.util.find_spec("httpx") is not None,
        "fastapi/sqlalchemy/httpx extras are not installed in this Python environment",
    )
    def test_fastapi_sidecar_reads_builds_hashes_and_indexes_only_companion_sqlite(self) -> None:
        from fastapi.testclient import TestClient  # type: ignore

        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.png"
            source.write_bytes(b"source image")
            candidates = root / "cv-candidates.json"
            candidates.write_text(json.dumps({
                "candidates": [{
                    "id": "image-space-center",
                    "kind": "pivot_center",
                    "confidence": 0.7,
                    "imagePoint": {"x": 100, "y": 100},
                    "calibrationStatus": "image_space_only",
                }],
            }), encoding="utf-8")
            db_path = root / "companion-experiment.sqlite"
            client = TestClient(create_app(root, db_path))

            health = client.get("/health")
            self.assertEqual(health.status_code, 200)
            self.assertFalse(health.json()["writesCplayoutProjectDb"])

            hashed = client.get("/artifacts/hash", params={"path": "source.png"})
            self.assertEqual(hashed.status_code, 200)
            self.assertEqual(hashed.json()["byteLength"], len(b"source image"))

            built = client.post("/packets/build", json={
                "projectId": "sample-project",
                "projectCrs": "EPSG:32613",
                "outputDir": "packet",
                "cvCandidates": "cv-candidates.json",
                "sourceArtifacts": ["source.png"],
                "createdAt": "2026-06-02T00:00:00.000Z",
            })
            self.assertEqual(built.status_code, 200)
            self.assertFalse(built.json()["writesCplayoutProjectDb"])

            packet = client.get("/review-packet", params={"path": "packet/companion-evidence-packet.json"})
            self.assertEqual(packet.status_code, 200)
            self.assertEqual(packet.json()["projectId"], "sample-project")

            traversal = client.get("/artifacts/hash", params={"path": "../outside.txt"})
            self.assertEqual(traversal.status_code, 400)

            keyed = root / "keyed-packet.json"
            keyed.write_text(json.dumps({"projectId": "sample-project", "keyedService": True}), encoding="utf-8")
            hidden = client.get("/review-packet", params={"path": "keyed-packet.json"})
            self.assertEqual(hidden.status_code, 400)

            hidden_build = client.post("/packets/build", json={
                "projectId": "sample-project",
                "projectCrs": "EPSG:32613",
                "outputDir": "bad",
                "api_key": "secret",
                "sourceArtifacts": ["source.png"],
            })
            self.assertEqual(hidden_build.status_code, 400)

            self.assertTrue(db_path.exists())
            with sqlite3.connect(db_path) as connection:
                rows = connection.execute("SELECT event_kind FROM companion_experiment_index ORDER BY id").fetchall()
            self.assertIn(("packet_build",), rows)
            self.assertFalse((root / "project.sqlite").exists())


def write_companion_packet_fixture(root: Path) -> Path:
    source = root / "source.png"
    source.write_bytes(b"image")
    candidates = root / "cv-candidates.json"
    candidates.write_text(json.dumps({
        "candidates": [
            {
                "id": "image-space-center",
                "kind": "pivot_center",
                "confidence": 0.7,
                "imagePoint": {"x": 120.0, "y": 140.0},
                "calibrationStatus": "image_space_only",
            },
            {
                "id": "calibrated-center",
                "kind": "pivot_center",
                "confidence": 0.82,
                "score": 0.88,
                "projectCrs": "EPSG:32613",
                "projectedPoint": {"x": 500000.0, "y": 4410000.0},
                "calibrationStatus": "valid",
            },
        ],
    }), encoding="utf-8")
    build_evidence_packet(
        "sample-project",
        "EPSG:32613",
        root,
        cv_candidates_path=candidates,
        source_artifact_paths=[source],
        created_at="2026-06-02T00:00:00.000Z",
    )
    return root / "companion-evidence-packet.json"


if __name__ == "__main__":
    unittest.main()
