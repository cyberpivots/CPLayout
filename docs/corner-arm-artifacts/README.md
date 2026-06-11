# Corner Arm Artifact Records

This directory contains curated summaries for local corner-arm scaffold artifacts. Raw ZIP, XLSX, CSV, JSON, extracted text, and generated reports remain local evidence under ignored paths unless a future task explicitly promotes a redacted fixture or summary.

## Scope

- Preserve artifact hashes, inventory, source hierarchy, and production limits.
- Keep scaffold rows advisory and source-tagged.
- Keep canonical project geometry in projected/local `XY`.
- Treat WGS84 pivot coordinates as input/display metadata until transformed to the project CRS.

## Limits

- advisoryOnly
- scaffoldOnly
- notProductionAuthority
- notEngineeringCertification
- notProprietaryKinematicsProof
- notControllerCompatibilityProof
- canonicalGeometryMutationFalse
- appImportableFalse
- writesProjectDatabaseFalse
- projectArchiveExportFalse
- projectSchemaChangeFalse

## Validation

Run these after changing this directory or related governance records:

- `npm run validate:skills`
- `git diff --check`
- `npm audit`
- `npm run context-map:build && npm run context-map:check` when prompt registry, route context, source ledger, or known-gap records change.
