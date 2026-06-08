# FLT And CornerGPSMap Compatibility Lane

Updated: 2026-06-08

## Scope

This lane adds offline-first, evidence-only compatibility tooling for local CornerGPSMap and Valley FLT artifacts. It supports redacted local inventory, synthetic BPF import/export parity, structural parsing of legacy `.opt`, `.csv`, `.out`, and `.vri` evidence, and advisory corner-arm review inputs.

Canonical CPLayout project geometry remains projected/local `XY`. BPF and KML/KMZ coordinates are WGS84 interchange/display evidence until explicitly projected through the existing import flow.

## Verified Local Install Paths

The current local evidence plan identified these installed sources:

- `/mnt/c/Program Files (x86)/Valmont/Valley FLT 4.4.4`
- `/mnt/c/Valmont/Service Tools Suite/Common Service Tools/GPS Mapping/1.0.0.0`
- `/mnt/c/Valmont/FLT/Data`

Use `tsx tools/cornerGpsFltInventory.ts --dry-run --summary --json` for a no-write summary of root existence, extension counts, warning counts, and boundary flags. Use `tsx tools/cornerGpsFltInventory.ts` only when a local detailed manifest is intentionally needed under `reports/cornergps-flt-inventory/`. Detailed reports hash install executable/config-style artifacts and count supported legacy exchange extensions; data roots are summarized by extension counts only. Reports do not emit raw customer file contents, exact local customer paths, coordinates, cloud endpoints, API keys, credentials, controller files, GGS/VRI compatibility claims, or controller-ready payloads.

## BPF XML Shape

The supported BPF shape is:

```xml
<BorderPoints>
  <BenchMark Latitude="40.0000000" Longitude="-104.0000000" Altitude="1510.000" />
  <CenterPoint Latitude="40.0000000" Longitude="-104.0000000" />
  <BorderPoint Latitude="39.9990000" Longitude="-104.0010000" />
</BorderPoints>
```

Accepted tags are `BorderPoints`, `BenchMark`, `CenterPoint`, and `BorderPoint`.

Import behavior:

- Border points are projected into the project CRS only after operator selection.
- The imported boundary can replace the active field boundary.
- The center point imports as a survey point only and does not move `project.pivotCenter`.
- Unknown BPF tags block import because they may represent unsupported proprietary evidence.

Export behavior:

- `exportCornerGpsMapBpf(project, options)` writes WGS84 decimal-degree XML from current projected project geometry.
- The default boundary source is the active field boundary.
- The default center source is the active pivot center.
- An optional benchmark can come from explicit WGS84 evidence or a survey point.
- Export does not mutate canonical project geometry and does not generate GGS or controller-ready VRI files.

## Config And Model Metadata

`parseCornerGpsMapConfigXml` reads model metadata from local CornerGPSMap config XML. Supported model fields include model ID/name, pivot/linear kind, corner type, corner length, overhang length, connecting length, freestanding length, LRDU boundary distance, min/max corner angles, inward/outward angles, freestanding angle, corner speed, and raw XML attributes.

`cornerGpsMapPresetToAdvisoryCornerArmConfig` converts a preset into CPLayout advisory corner-arm metadata. This is metadata only. Proprietary path generation, SDU/LRDU steering, sprinkler sequencing, GGS export, VRI export, and controller compatibility remain unverified.

## Legacy Evidence Parsers

`parseCornerGpsMapLegacyEvidence(kind, text, options)` supports synthetic or redacted `.opt`, `.csv`, `.out`, and `.vri` evidence. Normalized output includes:

- advisory-only and no-canonical-mutation flags,
- metadata summaries,
- machine dimension summaries,
- path point counts and redacted coordinate-column indicators,
- VRI zone/rate summaries,
- status and violation summaries,
- parser diagnostics and warnings.

The parser intentionally omits raw coordinate rows, raw local paths, customer identifiers, and controller payload contents from UI summaries.

## Advisory Review

`evaluateCornerGpsMapAdvisoryReview` can consume parsed legacy evidence and model preset metadata. It reports:

- LRDU clearance,
- end-gun clearance,
- obstacle clearance,
- imported/manual guidance-path evidence presence,
- model min/max corner-angle metadata,
- legacy status and violation evidence,
- unverified manufacturer/controller compatibility.

The review remains advisory and returns `canonicalGeometryMutation: false`.

## Non-Claims

CPLayout does not currently claim:

- FLT runtime compatibility,
- CornerGPSMap runtime compatibility,
- Google Earth render proof,
- proprietary CornerPath reproduction,
- SDU/LRDU steering behavior,
- sprinkler sequencing,
- certified dual-swing behavior,
- controller-ready GGS output,
- controller-ready VRI output,
- Android/iOS native runtime proof for these workflows.

## Validation

Run after implementation changes:

- `npm run validate`
- `npm run proof:web` for visible Files-panel changes
- `tsx tools/cornerGpsFltInventory.ts --dry-run --summary --json` for inventory-surface checks
- `git diff --check`
- `npm audit`

Run `npm run validate:skills` only when hooks, skills, context maps, or agent-process docs are changed.
