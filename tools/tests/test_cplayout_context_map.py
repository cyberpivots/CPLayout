from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]
CONTEXT_MAP_PATH = ROOT / ".codex" / "hooks" / "cplayout_context_map.json"
TRIAGE_PATH = ROOT / ".codex" / "hooks" / "cplayout_prompt_triage.py"
SUBAGENT_START_PATH = ROOT / ".codex" / "hooks" / "cplayout_subagent_start.py"

spec = importlib.util.spec_from_file_location("cplayout_prompt_triage_context_tests", TRIAGE_PATH)
assert spec is not None and spec.loader is not None
triage = importlib.util.module_from_spec(spec)
sys.modules["cplayout_prompt_triage_context_tests"] = triage
spec.loader.exec_module(triage)


class ContextMapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.context_map = json.loads(CONTEXT_MAP_PATH.read_text(encoding="utf-8"))

    def pack_ids_for_prompt(self, prompt: str) -> list[str]:
        matches = triage.match_routes(prompt)
        return [
            pack["id"]
            for pack in triage.context_packs_for_matches(prompt, matches, self.context_map)
            if isinstance(pack.get("id"), str)
        ]

    def hook_context(self, prompt: str, context_map: dict[str, object] | None = None) -> str:
        return triage._context(prompt, triage.match_routes(prompt), False, context_map)  # noqa: SLF001

    def test_context_map_check_command_passes(self) -> None:
        result = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "build_cplayout_context_map.py"), "--check"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("up to date", result.stdout)

    def test_required_schema_and_packs_exist(self) -> None:
        self.assertEqual(self.context_map["schemaVersion"], 1)
        pack_ids = {pack["id"] for pack in self.context_map["contextPacks"]}
        self.assertTrue(
            {
                "workspace_preflight",
                "governance_hooks_skills",
                "interface_ui",
                "geometry_design",
                "core_project_geometry",
                "storage_archive_native",
                "imagery_kml_evidence",
                "cornergpsmap_bpf",
            }.issubset(pack_ids)
        )
        self.assertIn("cplayout_kb_curator", self.context_map["routeContext"])
        self.assertIn("cplayout_kb_curator", self.context_map["agentContext"])

    def test_context_pack_paths_exist_and_avoid_raw_artifacts(self) -> None:
        for pack in self.context_map["contextPacks"]:
            for field in ("readFirstPaths", "secondaryPaths"):
                for relpath in pack[field]:
                    with self.subTest(pack=pack["id"], field=field, relpath=relpath):
                        self.assertFalse(relpath.startswith(("/", "~", "reports/", "tmp/")))
                        self.assertNotIn("\\", relpath)
                        self.assertTrue((ROOT / relpath).exists(), relpath)

    def test_context_pack_selection_is_capped_and_starts_with_preflight(self) -> None:
        prompt = "Use Google Earth imagery, Expo SQLite, center pivot UI, and managed hook registry."
        pack_ids = self.pack_ids_for_prompt(prompt)
        self.assertLessEqual(len(pack_ids), self.context_map["limits"]["maxContextPacksPerHook"])
        self.assertEqual(pack_ids[0], "workspace_preflight")

    def test_governance_prompt_selects_governance_pack(self) -> None:
        context = self.hook_context("Improve token efficient subagent reasoning, prompt triage, and context map hooks.")
        self.assertIn("Context packs", context)
        self.assertIn("governance_hooks_skills", context)
        self.assertIn(".codex/hooks/cplayout_prompt_triage.py", context)
        self.assertNotIn("cornergpsmap_bpf", context)

    def test_bpf_prompt_selects_cornergpsmap_pack(self) -> None:
        context = self.hook_context("Analyze CornerGPSMap BPF GGS VRI corner arm map ingestion.")
        self.assertIn("cornergpsmap_bpf", context)
        self.assertIn("packages/core/src/cornerGpsMapImport.ts", context)

    def test_ui_and_database_prompts_select_focused_packs(self) -> None:
        ui_context = self.hook_context("Improve the Expo React Native HUD map workspace screen.")
        self.assertIn("interface_ui", ui_context)
        self.assertNotIn("storage_archive_native", ui_context)

        right_sidebar_context = self.hook_context("Refactor right-drawer toolbar UI-proof controls.")
        self.assertIn("interface_ui", right_sidebar_context)
        self.assertIn("right drawer/sidebar", right_sidebar_context)

        db_context = self.hook_context("Review SQLite project archive ZIP schema migration.")
        self.assertIn("storage_archive_native", db_context)
        self.assertNotIn("interface_ui", db_context)

    def test_map_visual_elements_prompt_selects_interface_and_geometry_packs(self) -> None:
        pack_ids = self.pack_ids_for_prompt("Improve map visual elements for wheel tracks and end-of-machine indicators.")
        self.assertIn("interface_ui", pack_ids)
        self.assertIn("geometry_design", pack_ids)

    def test_invalid_context_map_degrades_gracefully(self) -> None:
        context = self.hook_context(
            "Improve token efficient subagent reasoning and prompt triage.",
            {"schemaVersion": 1},
        )
        self.assertIn("CPLayout coordinator contract:", context)
        self.assertNotIn("Context packs", context)

    def test_subagent_start_includes_agent_context_packs(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SUBAGENT_START_PATH)],
            cwd=ROOT,
            input=json.dumps({"hook_event_name": "SubagentStart", "agent_type": "cplayout_kb_curator"}),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=True,
        )
        context = json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]
        self.assertIn("Context packs:", context)
        self.assertIn("governance_hooks_skills", context)
        self.assertIn("No-overlap boundary: stay read-only", context)


if __name__ == "__main__":
    unittest.main()
