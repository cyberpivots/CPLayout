import json
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import cv2
import numpy as np

from cplayout_ml.cli import (
    DEFAULT_VISION_THRESHOLDS,
    boundary_improvement_acceptance,
    detect_imagery_field_boundary,
    evaluate_vision_fixtures,
    extract_named_polygon_from_kml,
    field_boundary_from_hough_lines,
    improve_boundary_detector,
    operator_comparison_metrics,
    project_image_boundary_to_xy,
    read_kml_or_kmz_text,
    read_operator_kml_source,
    score_boundary_candidate,
)


def pivot_ring() -> dict:
    return {"center": {"x": 250.0, "y": 250.0}, "radius": 95.0, "confidence": 0.72}


def polygon_kml(name: str, coordinates: str, geometry: str = "Polygon") -> str:
    if geometry == "LineString":
        body = f"<LineString><coordinates>{coordinates}</coordinates></LineString>"
    else:
        body = f"""
        <Polygon><outerBoundaryIs><LinearRing>
          <coordinates>{coordinates}</coordinates>
        </LinearRing></outerBoundaryIs></Polygon>
        """
    return f"""<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>{name}</name>{body}</Placemark>
    </Document></kml>"""


GOOGLE_EARTH_TEMPORARY_PLACES_OPERATOR_KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
<Document>
  <name>KmlFile</name>
  <StyleMap id="m_ylw-pushpin"><Pair><key>normal</key><styleUrl>#s_ylw-pushpin</styleUrl></Pair></StyleMap>
  <Style id="s_ylw-pushpin">
    <IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon></IconStyle>
    <LineStyle><color>ff0000aa</color><width>2</width></LineStyle>
    <PolyStyle><fill>0</fill></PolyStyle>
  </Style>
  <Placemark>
    <name>USER DRAWN FIELD BOUNDARY</name>
    <styleUrl>#m_ylw-pushpin</styleUrl>
    <Polygon>
      <tessellate>1</tessellate>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>
            -104.0748668576167,39.89927718177743,0 -104.0748003065396,39.8991358739091,0 -104.074557674454,39.89916189917877,0 -104.0683361072595,39.89912667267359,0 -104.0682509986798,39.89929867389615,0 -104.0682557581712,39.89943674492907,0 -104.0681205294466,39.89949594403656,0 -104.0677859296929,39.89961546897757,0 -104.067494069811,39.89975702666375,0 -104.0671600654333,39.89993675632151,0 -104.0668098105665,39.90019192015236,0 -104.0665851825506,39.90037554859754,0 -104.0662883345574,39.90018017265919,0 -104.0661526426344,39.90008321388978,0 -104.0660965520057,39.90014630420742,0 -104.0661019491623,39.90066551543062,0 -104.065331187446,39.90176190656482,0 -104.0653673382966,39.90624908884386,0 -104.074689890918,39.90630137543089,0 -104.0748668576167,39.89927718177743,0
          </coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
    <atom:link rel="app" href="https://www.google.com/earth/about/versions/#earth-pro" title="Google Earth Pro 7.3.7.1155"></atom:link>
  </Placemark>
</Document>
</kml>"""


class BoundaryDetectorTests(unittest.TestCase):
    def test_rectangle_field_with_crop_circle_selects_rectangle(self) -> None:
        image = np.full((500, 500, 3), (80, 122, 74), dtype=np.uint8)
        cv2.rectangle(image, (80, 95), (420, 405), (35, 35, 35), 5)
        cv2.circle(image, (250, 250), 95, (105, 150, 100), 3)

        result = detect_imagery_field_boundary(cv2, image, pivot_ring())

        self.assertIsNotNone(result)
        assert result is not None
        self.assertFalse(result["rejected"])
        self.assertEqual(result["source"], "opencv")
        self.assertGreaterEqual(result["confidence"], DEFAULT_VISION_THRESHOLDS["minFieldBoundaryConfidence"])
        self.assertLess(result["circularity"], 0.86)
        self.assertGreaterEqual(len(result["imagePolygon"]), 4)

    def test_crop_circle_only_does_not_accept_boundary(self) -> None:
        image = np.full((500, 500, 3), (80, 122, 74), dtype=np.uint8)
        cv2.circle(image, (250, 250), 95, (35, 35, 35), 4)

        result = detect_imagery_field_boundary(cv2, image, pivot_ring())

        self.assertTrue(result is None or result["rejected"])

    def test_partial_hough_extent_is_rejected_when_boundary_is_clipped_by_screenshot(self) -> None:
        image = np.full((500, 500, 3), (80, 122, 74), dtype=np.uint8)
        cv2.line(image, (70, 0), (70, 440), (35, 35, 35), 4)
        cv2.line(image, (430, 0), (430, 440), (35, 35, 35), 4)
        cv2.line(image, (70, 440), (430, 440), (35, 35, 35), 4)

        result = detect_imagery_field_boundary(cv2, image, pivot_ring(), None)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertTrue(result["rejected"])
        self.assertIn(
            "candidate is clipped by the screenshot edge and cannot be accepted as a complete imagery field boundary",
            result["rejectionReasons"],
        )
        self.assertNotIn("projectedPolygon", result)

    def test_box_around_circle_candidate_is_rejected(self) -> None:
        edges = np.zeros((500, 500), dtype=np.uint8)
        candidate = {
            "source": "opencv",
            "method": "unit_test_extent_box",
            "polygon": [
                {"x": 155.0, "y": 155.0},
                {"x": 345.0, "y": 155.0},
                {"x": 345.0, "y": 345.0},
                {"x": 155.0, "y": 345.0},
            ],
        }

        scored = score_boundary_candidate(cv2, edges, candidate, 500, 500, pivot_ring())

        self.assertTrue(scored["rejected"])
        self.assertIn("candidate resembles an extent box around the pivot ring rather than imagery edges", scored["rejectionReasons"])

    def test_road_fenceline_edges_score_rectangular_field(self) -> None:
        edges = np.zeros((500, 500), dtype=np.uint8)
        cv2.rectangle(edges, (70, 80), (430, 420), 255, 3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=80, maxLineGap=12)

        polygon = field_boundary_from_hough_lines(lines, 500, 500, pivot_ring())

        self.assertIsNotNone(polygon)
        assert polygon is not None
        scored = score_boundary_candidate(
            cv2,
            edges,
            {"source": "opencv", "method": "unit_test_edges", "polygon": polygon},
            500,
            500,
            pivot_ring(),
        )
        self.assertFalse(scored["rejected"])
        self.assertGreaterEqual(scored["confidence"], DEFAULT_VISION_THRESHOLDS["minFieldBoundaryConfidence"])

    def test_mocked_sam2_mask_can_export_projected_boundary(self) -> None:
        class FakeSam2Adapter:
            def propose_masks(self, _image):
                mask = np.zeros((500, 500), dtype=np.uint8)
                cv2.rectangle(mask, (75, 85), (425, 415), 255, -1)
                return [mask]

        image = np.full((500, 500, 3), (90, 110, 92), dtype=np.uint8)
        cv2.rectangle(image, (75, 85), (425, 415), (35, 35, 35), 4)
        result = detect_imagery_field_boundary(cv2, image, pivot_ring(), FakeSam2Adapter())

        self.assertIsNotNone(result)
        assert result is not None
        self.assertFalse(result["rejected"])
        self.assertEqual(result["source"], "sam2")
        projected = project_image_boundary_to_xy(
            result,
            {"center": {"x": 250.0, "y": 250.0}, "radius": 100.0, "confidence": 0.8},
            {
                "machine": {"spanLengthsMeters": [100.0], "overhangMeters": 0.0, "endGunThrowMeters": 0.0},
                "pivotCenter": {"x": 1000.0, "y": 2000.0},
            },
        )
        self.assertIsNotNone(projected)
        assert projected is not None
        self.assertEqual(len(projected), len(result["imagePolygon"]))

    def test_operator_kml_exact_named_polygon_is_extracted(self) -> None:
        parsed = extract_named_polygon_from_kml(
            polygon_kml("USER DRAWN FIELD BOUNDARY", "-104,40,0 -103,40,0 -103,41,0 -104,40,0"),
            "USER DRAWN FIELD BOUNDARY",
        )

        self.assertEqual(parsed["warnings"], [])
        self.assertIsNotNone(parsed["polygon"])
        assert parsed["polygon"] is not None
        self.assertEqual(len(parsed["polygon"]), 3)
        self.assertEqual(parsed["polygon"][0], {"longitude": -104.0, "latitude": 40.0})

    def test_google_earth_temporary_places_operator_polygon_is_extracted(self) -> None:
        parsed = extract_named_polygon_from_kml(
            GOOGLE_EARTH_TEMPORARY_PLACES_OPERATOR_KML,
            "USER DRAWN FIELD BOUNDARY",
        )

        self.assertEqual(parsed["warnings"], [])
        self.assertIsNotNone(parsed["polygon"])
        assert parsed["polygon"] is not None
        self.assertEqual(len(parsed["polygon"]), 19)
        self.assertEqual(parsed["polygon"][0], {"longitude": -104.0748668576167, "latitude": 39.89927718177743})
        self.assertEqual(parsed["polygon"][-1], {"longitude": -104.074689890918, "latitude": 39.90630137543089})

    def test_raw_operator_kml_text_source_records_hash_and_remote_icon(self) -> None:
        text, artifact = read_operator_kml_source(None, GOOGLE_EARTH_TEMPORARY_PLACES_OPERATOR_KML)

        self.assertEqual(text, GOOGLE_EARTH_TEMPORARY_PLACES_OPERATOR_KML)
        self.assertEqual(artifact["source"], "operatorBoundaryKmlText")
        self.assertEqual(artifact["kml"]["placemarkCount"], 1)
        self.assertTrue(artifact["kml"]["hasRemoteIconHref"])

    def test_operator_kml_missing_name_fails_softly(self) -> None:
        parsed = extract_named_polygon_from_kml(
            polygon_kml("Other boundary", "-104,40,0 -103,40,0 -103,41,0 -104,40,0"),
            "USER DRAWN FIELD BOUNDARY",
        )

        self.assertIsNone(parsed["polygon"])
        self.assertIn('No valid Polygon Placemark named "USER DRAWN FIELD BOUNDARY" was found.', parsed["warnings"])

    def test_operator_kml_line_only_fails_softly(self) -> None:
        parsed = extract_named_polygon_from_kml(
            polygon_kml("USER DRAWN FIELD BOUNDARY", "-104,40,0 -103,40,0", "LineString"),
            "USER DRAWN FIELD BOUNDARY",
        )

        self.assertIsNone(parsed["polygon"])
        self.assertIn('Placemark "USER DRAWN FIELD BOUNDARY" must contain exactly one Polygon; found 0.', parsed["warnings"])

    def test_operator_kml_unclosed_ring_fails_softly(self) -> None:
        parsed = extract_named_polygon_from_kml(
            polygon_kml("USER DRAWN FIELD BOUNDARY", "-104,40,0 -103,40,0 -103,41,0"),
            "USER DRAWN FIELD BOUNDARY",
        )

        self.assertIsNone(parsed["polygon"])
        self.assertIn('Placemark "USER DRAWN FIELD BOUNDARY" polygon outer ring is not closed.', parsed["warnings"])

    def test_operator_kml_multiple_matching_polygons_fail_softly(self) -> None:
        kml = """<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
          <Placemark><name>USER DRAWN FIELD BOUNDARY</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-104,40,0 -103,40,0 -103,41,0 -104,40,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
          <Placemark><name>USER DRAWN FIELD BOUNDARY</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-105,40,0 -104,40,0 -104,41,0 -105,40,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
        </Document></kml>"""

        parsed = extract_named_polygon_from_kml(kml, "USER DRAWN FIELD BOUNDARY")

        self.assertIsNone(parsed["polygon"])
        self.assertIn('Expected one Placemark named "USER DRAWN FIELD BOUNDARY" but found 2 valid matching Polygons.', parsed["warnings"])

    def test_operator_kmz_doc_kml_is_read(self) -> None:
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "operator.kmz"
            kml = polygon_kml("USER DRAWN FIELD BOUNDARY", "-104,40,0 -103,40,0 -103,41,0 -104,40,0")
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("doc.kml", kml)

            self.assertEqual(read_kml_or_kmz_text(path), kml)

    def test_operator_comparison_metrics_distinguish_boundary_from_crop_ring(self) -> None:
        image = np.zeros((500, 500, 3), dtype=np.uint8)
        operator = [
            {"x": 80.0, "y": 90.0},
            {"x": 420.0, "y": 90.0},
            {"x": 420.0, "y": 410.0},
            {"x": 80.0, "y": 410.0},
        ]
        good = [
            {"x": 84.0, "y": 94.0},
            {"x": 416.0, "y": 94.0},
            {"x": 416.0, "y": 406.0},
            {"x": 84.0, "y": 406.0},
        ]
        crop_ring_box = [
            {"x": 155.0, "y": 155.0},
            {"x": 345.0, "y": 155.0},
            {"x": 345.0, "y": 345.0},
            {"x": 155.0, "y": 345.0},
        ]

        good_metrics = operator_comparison_metrics(cv2, image, operator, good)
        crop_metrics = operator_comparison_metrics(cv2, image, operator, crop_ring_box)

        self.assertGreater(good_metrics["iou"], crop_metrics["iou"])
        self.assertLess(good_metrics["boundaryMeanDistancePixels"], crop_metrics["boundaryMeanDistancePixels"])

    def test_evaluate_vision_fixtures_writes_deterministic_metrics(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image = np.full((500, 500, 3), (80, 122, 74), dtype=np.uint8)
            cv2.rectangle(image, (80, 95), (420, 405), (35, 35, 35), 5)
            cv2.circle(image, (250, 250), 95, (105, 150, 100), 3)
            map_canvas = root / "map.png"
            full_window = root / "full.png"
            cv2.imwrite(str(map_canvas), image)
            cv2.imwrite(str(full_window), image)
            manifest = root / "fixtures.json"
            manifest.write_text(
                """{
                  "schemaVersion": "cplayout-vision-fixtures-v1",
                  "fixtures": [{
                    "id": "rectangular-field",
                    "fullWindowScreenshot": "full.png",
                    "mapCanvasCrop": "map.png",
                    "expected": {
                      "boundaryPresent": true,
                      "overlayPresent": false,
                      "blackCanvas": false
                    }
                  }]
                }""",
                encoding="utf-8",
            )
            output_dir = root / "out"

            self.assertEqual(evaluate_vision_fixtures(manifest, output_dir), 0)

            summary = (output_dir / "vision-evaluation-summary.json").read_text(encoding="utf-8")
            cases = (output_dir / "vision-evaluation-cases.jsonl").read_text(encoding="utf-8")
            self.assertIn('"caseCount": 1', summary)
            self.assertIn('"canonicalGeometryMutation": false', summary)
            self.assertIn('"rectangular-field"', cases)

    def test_improvement_loop_runs_minimum_five_iterations_and_rejects_weakless_than_label_gate(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image = np.full((500, 500, 3), (82, 120, 74), dtype=np.uint8)
            cv2.rectangle(image, (72, 84), (428, 416), (35, 35, 35), 4)
            cv2.line(image, (80, 84), (420, 416), (70, 70, 70), 2)
            cv2.circle(image, (250, 250), 95, (105, 150, 100), 3)
            map_canvas = root / "map.png"
            full_window = root / "full.png"
            cv2.imwrite(str(map_canvas), image)
            cv2.imwrite(str(full_window), image)
            output_dir = root / "loop"

            self.assertEqual(
                improve_boundary_detector(
                    map_canvas,
                    full_window,
                    None,
                    None,
                    None,
                    None,
                    "USER DRAWN FIELD BOUNDARY",
                    output_dir,
                    2,
                    "2026-05-30T00:00:00.000Z",
                ),
                0,
            )

            report = json.loads((output_dir / "boundary-improvement-loop.json").read_text(encoding="utf-8"))
            self.assertEqual(report["iterationCount"], 5)
            self.assertFalse(report["canonicalGeometryMutation"])
            self.assertIn("surface_color_variation", [iteration["config"]["name"] for iteration in report["iterations"]])
            self.assertTrue((output_dir / "boundary-improvement-annotated.png").exists())

    def test_boundary_acceptance_requires_gpu_and_projected_boundary(self) -> None:
        candidate = {
            "rejected": False,
            "confidence": DEFAULT_VISION_THRESHOLDS["minFieldBoundaryConfidence"] + 0.05,
        }
        accepted = boundary_improvement_acceptance(
            candidate,
            {"bestOperatorIoU": None},
            None,
            {"cudaAvailable": True},
            [{"x": 1.0, "y": 1.0}, {"x": 2.0, "y": 1.0}, {"x": 2.0, "y": 2.0}],
        )
        self.assertTrue(accepted["accepted"])
        self.assertEqual(accepted["status"], "accepted")
        self.assertTrue(accepted["gpuBacked"])

        no_gpu = boundary_improvement_acceptance(
            candidate,
            {"bestOperatorIoU": None},
            None,
            {"cudaAvailable": False},
            [{"x": 1.0, "y": 1.0}, {"x": 2.0, "y": 1.0}, {"x": 2.0, "y": 2.0}],
        )
        self.assertFalse(no_gpu["accepted"])
        self.assertIn("PyTorch CUDA was not available; report is not GPU-backed", no_gpu["reasons"])

    def test_improvement_loop_records_mocked_gpu_preflight_metadata(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image = np.full((500, 500, 3), (82, 120, 74), dtype=np.uint8)
            cv2.rectangle(image, (72, 84), (428, 416), (35, 35, 35), 4)
            cv2.circle(image, (250, 250), 95, (105, 150, 100), 3)
            map_canvas = root / "map.png"
            cv2.imwrite(str(map_canvas), image)
            output_dir = root / "loop"

            with patch("cplayout_ml.cli.probe_cuda", return_value={
                "torchAvailable": True,
                "cudaAvailable": True,
                "deviceCount": 1,
                "devices": ["NVIDIA GeForce RTX 4070 Laptop GPU"],
            }), patch("cplayout_ml.cli.torch_gpu_image_preflight", return_value={
                "device": "NVIDIA GeForce RTX 4070 Laptop GPU",
                "shape": [500, 500, 3],
                "meanAbsGradient": 0.1,
            }):
                self.assertEqual(
                    improve_boundary_detector(
                        map_canvas,
                        None,
                        None,
                        None,
                        None,
                        None,
                        "USER DRAWN FIELD BOUNDARY",
                        output_dir,
                        5,
                        "2026-05-30T00:00:00.000Z",
                    ),
                    0,
                )

            report = json.loads((output_dir / "boundary-improvement-loop.json").read_text(encoding="utf-8"))
            self.assertEqual(report["schemaVersion"], "cplayout-boundary-improvement-loop-v1")
            self.assertTrue(report["gpu"]["cudaAvailable"])
            self.assertTrue(report["gpu"]["usedForTorchTensorPreflight"])
            self.assertEqual(report["gpu"]["tensorPreflight"]["device"], "NVIDIA GeForce RTX 4070 Laptop GPU")
            self.assertEqual(report["acceptance"]["gpuBacked"], True)


if __name__ == "__main__":
    unittest.main()
