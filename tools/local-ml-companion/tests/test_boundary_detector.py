import unittest

import cv2
import numpy as np

from cplayout_ml.cli import (
    DEFAULT_VISION_THRESHOLDS,
    detect_imagery_field_boundary,
    field_boundary_from_hough_lines,
    project_image_boundary_to_xy,
    score_boundary_candidate,
)


def pivot_ring() -> dict:
    return {"center": {"x": 250.0, "y": 250.0}, "radius": 95.0, "confidence": 0.72}


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


if __name__ == "__main__":
    unittest.main()
