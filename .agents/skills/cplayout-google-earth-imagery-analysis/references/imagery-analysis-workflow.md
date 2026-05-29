# Imagery Analysis Workflow

Use this workflow for Google Earth Pro screenshot, KML/KMZ, OCR, or CV review in CPLayout.

## Intake

- Record the user request, coordinate input, project CRS, and whether the task is planning-only or implementation.
- Verify the worktree with `git status --short` before touching repo files.
- Collect local evidence paths: screenshots, KML, KMZ, manifests, browser captures, and any operator notes.
- Run `scripts/inventory_ge_artifacts.py` on artifact paths before analysis when counts or hashes matter.

## Evidence Review

- Check screenshots for visible attribution, capture scope, non-black/non-uniform map content, and whether CPLayout overlays are visible.
- Check KML/KMZ for expected `Placemark`, `Style`, `styleUrl`, and `ExtendedData` counts, plus `doc.kml` for KMZ.
- Separate what is visible in imagery from what is inferred. Label inferred findings with confidence and reason.
- Treat old or blurry imagery, cloud cover, poor resolution, and seasonal crop-state mismatch as confidence reducers.

## Feature Review

- Field boundary: look for fencelines, property separations, crop edge, roads, ditches, canals, tree lines, and non-irrigated obstructions.
- Pivot machine: look for pivot center, tower/radial line, wheel tracks, service road, water source, power source, and circle radius.
- Watered area: look for crop-ring contrast, end-gun arcs, partial-circle stops, dry wedges, and corner-arm lobes.
- Layout risk: note obstacles, access restrictions, clearance buffers, road crossings, utility conflicts, and uncertain edges.

## Advisory Output

Use four buckets:

- `verified_local_fact`: repo facts, artifact hashes, image dimensions, KML/KMZ counts, and command results.
- `source_backed_fact`: primary-source facts with URL and date checked.
- `inference`: visible-feature interpretation with confidence and uncertainty.
- `recommendation`: CPLayout design suggestion that remains advisory until user accepted.

## Stop Rules

- Stop before claiming Google Earth imagery rights, commercial permission, survey-grade accuracy, Android/iOS proof, native MapLibre proof, or cached/offline Google imagery support.
- Stop before canonical geometry mutation unless a separate implementation explicitly routes accepted geometry through CPLayout project validation.
- Stop when attribution is missing, capture is black/unreadable, source terms are unclear, or project CRS cannot be verified.
