# Local Corner Arm Scaffold 2026-06-10

**Artifact ID:** local-corner-arm-scaffold-2026-06-10
**Source IDs:** SRC-CORNER-ARM-SCAFFOLD-PACKET-2026-06-10; SRC-CORNER-ARM-SPECS-WORKBOOK-TMP-2026-06-10
**Status:** scaffold_curated
**SHA-256:** `3ff46c9c2ca3a7f7614f11cbb931b648908c2695eb60cdae506925e4417ffa4f`
**Advisory limit:** advisoryOnly; scaffoldOnly; notProductionAuthority; notEngineeringCertification; notProprietaryKinematicsProof; notControllerCompatibilityProof; canonicalGeometryMutationFalse; appImportableFalse; writesProjectDatabaseFalse; projectArchiveExportFalse; projectSchemaChangeFalse

Local source path: `tmp/irrigation_corner_arm_initial_scaffold.zip`

Raw artifact contents remain ignored local evidence. This record is the durable curated summary.

## Extracted Inventory

| File | Role | Production status |
| --- | --- | --- |
| `project_file_manifest.md` | Read order, source hierarchy, required inputs, and governance notes. | Scaffold only. |
| `Valley Corner Arm Specs_A.xlsx` | Embedded workbook with model specs and input templates. | Scaffold only; embedded hash differs from standalone workbook. |
| `valley_corner_arm_specs_normalized.csv` | Normalized long-form scaffold rows. | Scaffold only; 75 data rows, all `production_ready=No`. |
| `valley_corner_arm_specs_normalized.json` | JSON equivalent of normalized rows. | Scaffold only. |
| `corner_arm_developer_guide.md` | Solver and export guidance. | Scaffold only. |
| `corner_arm_knowledge_base_research.md` | Research notes and unresolved inputs. | Scaffold only. |

## Curated Semantics

- `Length to LRDU` means projected pivot-center-to-LRDU radius for kinematic timing and path calculation. It is not total wetted radius, model label text, overhang length, or end-gun reach.
- `LRDU Speed` means linear ground speed at 100 percent timer. Motor RPM rows are advisory lookup candidates only after tire, service, motor, and field machine context are confirmed.
- `Pivot point location coordinates` are WGS84 input/display metadata until transformed to the project CRS. Canonical CPLayout geometry remains projected/local `XY`.
- Physical swept envelope and wetted/end-gun envelope are separate review outputs.

## Current Gaps

- Standalone and embedded workbook lineage is unresolved.
- Actual machine serial/configuration, pivot-center-to-LRDU radius, LRDU measured speed, selected local projected CRS, field boundary, obstacles/no-go buffers, guidance path, leading/trailing orientation, rotation direction, angle/steering limits, and sampling resolution remain absent.
- The artifact does not prove Valley, VFlex, Precision Corner, DualSpan, CornerGPSMap, FLT, GGS, VRI, SDU/LRDU steering, controller timing, or sprinkler sequencing behavior.

## CPLayout Integration

`packages/core/src/cornerArmCatalog.ts` exposes a small typed scaffold catalog derived from normalized scaffold records with `sourceStatus: "scaffold_only"` and `productionReady: false`. `packages/geometry/src/cornerArmKinematics.ts` blocks kinematic output until required projected-XY, model, speed, boundary, and guidance inputs are supplied.
