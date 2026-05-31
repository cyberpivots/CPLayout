# CPLayout Agent Source Ledger

This ledger records sources used to define the agent, hook, and skill surfaces. Use primary or official sources for claims that affect architecture, platform behavior, database behavior, Google Earth/KML evidence, or real-world irrigation design.

| Source | Verified use | Boundary |
| --- | --- | --- |
| OpenAI Codex subagents docs: `https://developers.openai.com/codex/subagents` | Project-scoped custom agents live under `.codex/agents/`; standalone custom agents require `name`, `description`, and `developer_instructions`; `sandbox_mode` and `model_reasoning_effort` are supported config keys. | Custom agent format may evolve; parse locally and keep agents narrow. |
| OpenAI Codex hooks docs: `https://developers.openai.com/codex/hooks#userpromptsubmit` | `UserPromptSubmit` hooks receive a prompt and can add `hookSpecificOutput.additionalContext`. | The CPLayout hook is advisory and non-blocking. |
| OpenAI Codex config reference: `https://developers.openai.com/codex/config-reference#configtoml` | Project `.codex/config.toml` can define `[features].hooks`, `[agents]`, and `agents.<name>.config_file`; project config loads only for trusted projects. | User-level provider/auth/telemetry keys belong outside project config. |
| Skill creator validator: `/home/cyber/.codex/skills/.system/skill-creator/scripts/quick_validate.py` | Validates `SKILL.md` frontmatter names, descriptions, and allowed fields. | Local tool availability is machine-specific. |
| Google KML Reference: `https://developers.google.com/kml/documentation/kmlreference` | KML is a geographic display format with shared styles; style metadata is presentation evidence for CPLayout, not canonical projected `XY` geometry. | Google Earth rendering still requires visual proof. |
| Expo SQLite docs: `https://docs.expo.dev/versions/latest/sdk/sqlite/` | Expo SQLite provides SQLite access across supported platforms; web setup requires WASM support and COOP/COEP headers, and web support is alpha. | CPLayout web SQLite remains research-gated until deployment headers and browser behavior are verified. |
| SQLite about/docs: `https://www.sqlite.org/about.html` and `https://www.sqlite.org/docs.html` | SQLite is embedded, serverless, public domain, transactional, and single-file oriented, aligning with offline-first local project storage. | Runtime behavior must still be validated on target platforms. |
| USDA NRCS NEH Part 623 Chapter 11 Sprinkler Irrigation: `https://www.wcc.nrcs.usda.gov/ftpref/wntsc/waterMgt/irrigation/NEH15/ch11.pdf` | Seed primary engineering reference for center-pivot design research and terminology. | Do not treat this ledger as engineering certification or complete design coverage. |

## Update Rules

- Add sources when a specialist makes a package, platform, database, imagery, or engineering claim.
- Record the claim, source URL or local path, date checked, and what remains unverified.
- Keep real-world design assumptions separate from confirmed project facts.
- Do not use operator labels, imagery evidence, or KML/KMZ styling as automatic geometry mutation authority.
