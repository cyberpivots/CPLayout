from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]
HOOK_PATH = ROOT / ".codex" / "hooks" / "cplayout_prompt_triage.py"

spec = importlib.util.spec_from_file_location("cplayout_prompt_triage", HOOK_PATH)
assert spec is not None and spec.loader is not None
triage = importlib.util.module_from_spec(spec)
sys.modules["cplayout_prompt_triage"] = triage
spec.loader.exec_module(triage)


class PromptTriageTests(unittest.TestCase):
    def route_ids(self, prompt: str) -> list[str]:
        return [match.route.route_id for match in triage.match_routes(prompt)]

    def test_strong_imagery_prompt_selects_imagery_route(self) -> None:
        routes = self.route_ids("Use Google Earth Pro KML imagery to prove visual fidelity.")
        self.assertEqual(routes[0], "cplayout_imagery_mapper")

    def test_sqlite_archive_prompt_selects_database_route(self) -> None:
        routes = self.route_ids("Review Expo SQLite project archive persistence and ZIP schema migration.")
        self.assertEqual(routes[0], "cplayout_database_specialist")

    def test_ui_expo_prompt_selects_interface_route(self) -> None:
        routes = self.route_ids("Improve the Expo React Native UI screen and SVG map component.")
        self.assertEqual(routes[0], "cplayout_interface_developer")

    def test_pivot_corner_arm_prompt_selects_pivot_route(self) -> None:
        routes = self.route_ids("Score a center pivot corner arm irrigation layout around obstacles.")
        self.assertEqual(routes[0], "cplayout_center_pivot_designer")

    def test_broad_terms_do_not_overmatch(self) -> None:
        for prompt in ("agent", "hook", "layout", "web"):
            with self.subTest(prompt=prompt):
                self.assertEqual(self.route_ids(prompt), [])

    def test_mixed_prompt_is_capped_and_deterministic(self) -> None:
        routes = self.route_ids(
            "Use Google Earth imagery and SQLite to improve center pivot UI with an agent hook registry."
        )
        self.assertLessEqual(len(routes), 3)
        self.assertEqual(
            routes,
            [
                "cplayout_imagery_mapper",
                "cplayout_center_pivot_designer",
                "cplayout_database_specialist",
            ],
        )

    def test_negative_keywords_reduce_false_positives(self) -> None:
        routes = self.route_ids("Do database only work on SQLite schema; no imagery and no pivot design.")
        self.assertEqual(routes, ["cplayout_database_specialist"])


if __name__ == "__main__":
    unittest.main()
