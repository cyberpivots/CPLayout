# Source Ledger Template

Use this compact format when adding CPLayout Google Earth imagery or KML/KMZ evidence to docs, task logs, or handoffs.

## Local Facts

| ID | Source path or command | Date checked | Verified fact | Limit |
| --- | --- | --- | --- | --- |
| LOCAL-001 | `git status --short` | YYYY-MM-DD | Worktree state before edits. | Does not prove runtime behavior. |
| LOCAL-002 | `path/to/artifact.kml` | YYYY-MM-DD | SHA-256, feature counts, and KML parse result. | Does not prove Google Earth visual rendering. |

## Primary Sources

| ID | URL | Date checked | Verified fact | Limit |
| --- | --- | --- | --- | --- |
| SRC-001 | `https://developers.google.com/kml/documentation/kmlreference` | YYYY-MM-DD | KML element or coordinate semantics used. | Does not prove CPLayout runtime behavior. |
| SRC-002 | `https://about.google/brand-resource-center/products-and-services/geo-guidelines/` | YYYY-MM-DD | Attribution or usage boundary. | Legal/commercial applicability may still need review. |

## Findings

| Finding | Evidence IDs | Confidence | Status |
| --- | --- | ---: | --- |
| Example boundary follows visible crop edge except south road setback. | LOCAL-002, SRC-001 | 0.70 | Advisory only |

## Required Caveats

- State that Google Earth Pro evidence is desktop companion evidence only.
- State that imagery-derived observations are not survey-grade.
- State that canonical CPLayout geometry remains projected/local `XY`.
- State any native, mobile, permission, attribution, or legal/commercial claims that remain unverified.
