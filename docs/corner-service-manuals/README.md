# CPLayout Corner Service Manual Corpus

This directory records curated metadata for local corner service-manual PDFs used by advisory CPLayout corner-arm review work. Raw PDFs and extracted text are not committed.

## Scope

- Five pinned local PDFs are listed in `manual-inventory.md`.
- Raw extraction belongs under ignored `reports/corner-service-manuals/<run-id>/`.
- Extraction completed on this host with run id `20260608T-corner-service-manuals` using `pdfinfo`, `pdftotext`, `qpdf`, and `sha256sum`.
- Service manuals inform advisory software behavior only. They do not certify a design, prove proprietary corner-arm kinematics, prove controller compatibility, authorize controller payload export, authorize vendor binary reverse engineering, or create app import, project schema, native SQLite, web storage, ZIP archive, KML, or KMZ export authority.
- Raw PDFs, extracted text, manifests, source paths, and tool reports are repository research evidence only. Only curated summaries with source hashes plus page and line references belong under `docs/corner-service-manuals/`.

## Regeneration

Check tools:

```sh
command -v pdfinfo pdftotext qpdf sha256sum
```

Run extraction after tools are present:

```sh
python3 tools/extract_corner_service_manuals.py --run-id 20260608T-corner-service-manuals
```

Validate committed docs:

```sh
npm run validate:corner-service-manuals
```

## Required Limits

- advisoryOnly
- notEngineeringCertification
- canonicalGeometryMutationFalse
- qualifiedReviewRequired
- evidenceOnly
- notProprietaryKinematicsProof
- notControllerCompatibilityProof
- noControllerPayloadExport
- noVendorBinaryReverseEngineering
- appImportableFalse
- writesProjectDatabaseFalse
- projectArchiveExportFalse
- projectSchemaChangeFalse
