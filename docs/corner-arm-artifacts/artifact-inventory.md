# Corner Arm Artifact Inventory

Inventory date: 2026-06-11

Raw artifacts remain ignored local evidence. The committed source of truth is this curated inventory plus the source ledger and known-gap records.

| Artifact ID | Local evidence path | SHA-256 | Size / rows | Role | Status | Production boundary |
| --- | --- | --- | --- | --- | --- | --- |
| `corner-arm-initial-scaffold-zip-20260610` | `tmp/irrigation_corner_arm_initial_scaffold.zip` | `3ff46c9c2ca3a7f7614f11cbb931b648908c2695eb60cdae506925e4417ffa4f` | 155014 bytes uncompressed, 6 files | Scaffold packet with manifest, embedded workbook, normalized CSV/JSON, guide, and research notes. | scaffoldOnly | Not production authority, controller proof, proprietary kinematics proof, or canonical geometry authority. |
| `valley-corner-arm-specs-a-standalone-20260610` | `tmp/Valley Corner Arm Specs_A.xlsx` | `e34103f80182c611d33fd34204a2adbfe3b21cb5f9a31514b1bd5fb494d1b4ef` | XLSX package, 10 internal files | Standalone single-sheet workbook. | scaffoldOnly; lineageUnresolved | Differs from embedded workbook and lacks normalized source/status columns; do not promote as default production catalog. |
| `valley-corner-arm-specs-a-embedded-20260610` | `tmp/irrigation_corner_arm_initial_scaffold.zip!/Valley Corner Arm Specs_A.xlsx` | `1295f6404b5e39dc75c7ca94d759597c352a3665df9535bb66c69b44fa229baf` | Embedded XLSX | Workbook bundled in the scaffold ZIP. | scaffoldOnly; lineageUnresolved | Must be reconciled with standalone workbook and source evidence before stronger use. |
| `valley-corner-arm-specs-normalized-csv-20260610` | `tmp/irrigation_corner_arm_initial_scaffold.zip!/valley_corner_arm_specs_normalized.csv` | contained in scaffold ZIP hash above | 75 data rows | Normalized long-form scaffold records. | scaffoldOnly | Every row is `production_ready=No`; required machine inputs remain unconfirmed. |
| `valley-corner-arm-specs-normalized-json-20260610` | `tmp/irrigation_corner_arm_initial_scaffold.zip!/valley_corner_arm_specs_normalized.json` | contained in scaffold ZIP hash above | JSON equivalent of normalized records | Parser/test scaffold candidate. | scaffoldOnly | Use only with source-status and production-ready flags preserved. |
| `corner-arm-developer-guide-20260610` | `tmp/irrigation_corner_arm_initial_scaffold.zip!/corner_arm_developer_guide.md` | contained in scaffold ZIP hash above | 12308 bytes | Implementation guidance for future kinematic solver work. | scaffoldOnly | Planning guidance only; not CPLayout runtime proof. |
| `corner-arm-kb-research-20260610` | `tmp/irrigation_corner_arm_initial_scaffold.zip!/corner_arm_knowledge_base_research.md` | contained in scaffold ZIP hash above | 8572 bytes | Source notes and assumptions. | scaffoldOnly | Requires source refresh and provenance confirmation before production claims. |
