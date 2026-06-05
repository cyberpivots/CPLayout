# CPLayout Design Guide Corpus

This directory records source metadata for local irrigation design-guide PDFs used by advisory CPLayout placement work. Raw PDFs and full extracted text are not committed.

## Scope

- Six pinned local PDFs are listed in `pdf-inventory.md`.
- Raw extraction belongs under ignored `reports/design-guides/<run-id>/`.
- Extraction completed on this host with run id `20260605T-design-guides` after installing `poppler-utils` and `qpdf`.
- Local PDFs and manufacturer pages inform advisory software behavior only. They do not certify a design, prove proprietary corner-arm kinematics, authorize automatic projected-XY mutation, prove Google Earth rendering, authorize paid/keyed/cloud imagery, or create app import, project schema, native SQLite, web storage, ZIP archive, KML, or KMZ export authority.
- Raw PDFs, extracted text, manifests, source paths, and tool reports are repository research evidence only. Only curated summaries with source hashes plus page and line references belong under `docs/design-guides/`.

## Regeneration

Check tools:

```sh
command -v pdfinfo pdftotext qpdf sha256sum
```

Run extraction after tools are present:

```sh
python3 tools/extract_design_guides.py --run-id 20260605T-design-guides
```

Validate committed docs:

```sh
npm run validate:design-guides
```

## Required Limits

- advisoryOnly
- notEngineeringCertification
- canonicalGeometryMutationFalse
- qualifiedReviewRequired
- evidenceOnly
- noGoogleEarthRenderProof
- noPaidKeyedCloudImagery
- appImportableFalse
- writesProjectDatabaseFalse
- projectArchiveExportFalse
- projectSchemaChangeFalse
