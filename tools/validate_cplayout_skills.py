#!/usr/bin/env python3
"""Validate CPLayout repo-local skill and agent process surfaces."""

from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUICK_VALIDATE = (
    Path.home()
    / ".codex"
    / "skills"
    / ".system"
    / "skill-creator"
    / "scripts"
    / "quick_validate.py"
)

REQUIRED_AGENT_FILES = (
    ".codex/agents/cplayout_imagery_mapper.toml",
    ".codex/agents/cplayout_interface_developer.toml",
    ".codex/agents/cplayout_center_pivot_designer.toml",
    ".codex/agents/cplayout_database_specialist.toml",
    ".codex/agents/cplayout_kb_curator.toml",
)

REQUIRED_DOCS = (
    "docs/agent-prompt-registry.md",
    "docs/agent-source-ledger.md",
    "docs/agent-known-gaps.md",
    ".agents/skills/cplayout-expert-agent-panels/references/prompt-triage.md",
)


def run(command: list[str], *, cwd: Path = ROOT) -> tuple[bool, str]:
    result = subprocess.run(
        command,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return result.returncode == 0, result.stdout.strip()


def validate_skills() -> list[str]:
    errors: list[str] = []
    if not QUICK_VALIDATE.exists():
        return [f"Missing skill validator: {QUICK_VALIDATE}"]

    skill_root = ROOT / ".agents" / "skills"
    for skill_md in sorted(skill_root.glob("*/SKILL.md")):
        ok, output = run([sys.executable, str(QUICK_VALIDATE), str(skill_md.parent)])
        label = skill_md.parent.relative_to(ROOT)
        print(f"[skill] {label}: {output}")
        if not ok:
            errors.append(f"{label}: {output}")
    return errors


def validate_toml() -> list[str]:
    errors: list[str] = []
    toml_paths = [ROOT / ".codex" / "config.toml"]
    toml_paths.extend(ROOT.glob(".codex/agents/*.toml"))
    for path in sorted(toml_paths):
        try:
            tomllib.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - report parser detail.
            errors.append(f"{path.relative_to(ROOT)}: {exc}")
        else:
            print(f"[toml] {path.relative_to(ROOT)}: ok")
    return errors


def validate_hooks() -> list[str]:
    errors: list[str] = []
    hooks_path = ROOT / ".codex" / "hooks.json"
    try:
        hooks = json.loads(hooks_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - report parser detail.
        return [f".codex/hooks.json: {exc}"]

    command = (
        hooks.get("hooks", {})
        .get("UserPromptSubmit", [{}])[0]
        .get("hooks", [{}])[0]
        .get("command", "")
    )
    if "cplayout_prompt_triage.py" not in command:
        errors.append(".codex/hooks.json: UserPromptSubmit command does not reference cplayout_prompt_triage.py")

    ok, output = run([sys.executable, str(ROOT / ".codex" / "hooks" / "cplayout_prompt_triage.py")])
    if not ok:
        errors.append(f"prompt triage empty-input run failed: {output}")

    sample = {
        "hook_event_name": "UserPromptSubmit",
        "prompt": "Use Google Earth KML imagery and SQLite to plan a center pivot UI change.",
    }
    proc = subprocess.run(
        [sys.executable, str(ROOT / ".codex" / "hooks" / "cplayout_prompt_triage.py")],
        cwd=ROOT,
        input=json.dumps(sample),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    if proc.returncode != 0:
        errors.append(f"prompt triage sample failed: {proc.stdout.strip()}")
    else:
        try:
            parsed = json.loads(proc.stdout)
            context = parsed["hookSpecificOutput"]["additionalContext"]
        except Exception as exc:  # noqa: BLE001 - report parser detail.
            errors.append(f"prompt triage sample output invalid: {exc}")
        else:
            for expected in (
                "cplayout_imagery_mapper",
                "cplayout_interface_developer",
                "cplayout_center_pivot_designer",
                "cplayout_database_specialist",
            ):
                if expected not in context:
                    errors.append(f"prompt triage sample missing {expected}")
            print("[hook] UserPromptSubmit sample: ok")
    return errors


def validate_required_files() -> list[str]:
    errors: list[str] = []
    for relpath in REQUIRED_AGENT_FILES + REQUIRED_DOCS:
        if not (ROOT / relpath).exists():
            errors.append(f"Missing required file: {relpath}")
        else:
            print(f"[file] {relpath}: ok")
    return errors


def validate_ge_inventory_help() -> list[str]:
    script = (
        ROOT
        / ".agents"
        / "skills"
        / "cplayout-google-earth-imagery-analysis"
        / "scripts"
        / "inventory_ge_artifacts.py"
    )
    if not script.exists():
        return [f"Missing Google Earth inventory helper: {script.relative_to(ROOT)}"]
    ok, output = run([sys.executable, str(script), "--help"])
    print("[helper] inventory_ge_artifacts.py --help: " + ("ok" if ok else output))
    return [] if ok else [f"inventory_ge_artifacts.py --help failed: {output}"]


def main() -> int:
    errors: list[str] = []
    errors.extend(validate_required_files())
    errors.extend(validate_skills())
    errors.extend(validate_toml())
    errors.extend(validate_hooks())
    errors.extend(validate_ge_inventory_help())

    if errors:
        print("\nValidation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("\nCPLayout skill and agent validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
