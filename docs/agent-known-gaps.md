# CPLayout Agent Known Gaps

This file tracks gaps in the agent/skill process layer. It does not replace product validation checklists.

| Gap | Impact | Current mitigation |
| --- | --- | --- |
| Custom agent runtime spawning was not exercised in this implementation pass. | TOML files are parsed locally, but agent selection/spawn behavior is not proven in a live Codex session after restart. | Keep agents read-only by default and validate config syntax; verify runtime behavior in the next session that uses them. |
| `UserPromptSubmit` hook behavior was tested only by running the hook script directly. | The hook output shape is verified, but active Codex hook injection depends on trusted project config and runtime hook loading. | Treat hook output as advisory context only. |
| Prompt triage is keyword-based. | Broad or unusual prompts may miss a relevant specialist or match extra specialists. | Coordinator still owns final routing and must use `AGENTS.md`, repo evidence, and source-backed judgment. |
| Source ledger is a seed, not a complete research knowledge base. | Center-pivot design, UI, database, and imagery methods still need task-specific source review. | Require source-backed updates for each new claim and keep unknowns explicit. |
| No product runtime code changed. | These changes improve process and guidance only; they do not add ML/CV, database, or UI product features. | Use the specialist skills to plan and validate future implementation work. |
| Google Earth render proof is not established by these changes. | Existing visual-fidelity blockers remain outside this process refactor. | Follow the Google Earth Pro automation checklist and require non-black rendered evidence for visual-fidelity acceptance. |
| Native Android/iOS persistence, ZIP sharing, and native map rendering remain unverified here. | The agent process must not report production-ready native behavior from compile or config checks alone. | Use `docs/android-native-verification.md` and platform-specific checklists before making runtime claims. |
