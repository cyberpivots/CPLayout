# Geospatial Algorithm Spec

## Core Rule

Never calculate acres, machine radius, tower position, buffer distance, or clearance in EPSG:4326 degrees. Transform WGS84 survey coordinates into the project CRS first.

## Field Polygon Processing

1. Import ordered boundary points or GeoJSON polygon.
2. Confirm or assign source CRS.
3. Project to the project CRS.
4. Remove duplicate vertices below tolerance.
5. Close ring.
6. Detect self-intersections and invalid rings.
7. Repair only with logged action and technician review.
8. Store square meters, acres, CRS, and source confidence.

## Pivot Geometry

- `machineRadius = sum(spanLengths) + overhangLength` unless verified manufacturer geometry says otherwise.
- `endGunRadius = machineRadius + endGunThrow`.
- Full circle: approximate projected circle with enough segments for configured acre tolerance.
- Partial circle: create a sector from center plus ordered arc vertices; handle 0/360 wrap explicitly.
- Store wet coverage separately from machine-travel clearance geometry.

## Tower Placement

Tower radius is the cumulative sum of span lengths through each tower. For a selected angle:

```ts
x = center.x + radius * Math.cos(theta)
y = center.y + radius * Math.sin(theta)
```

The app must define the internal angle convention once and convert display conventions at the UI boundary.

## End Gun Modeling

Model the end gun as a separate annular sector from machine radius to end gun radius. Store end-gun acres separately because pressure, wind, nozzle package, and shutoff ranges can change actual coverage.

## Obstacle Exclusion

- Point obstacle: buffer by configured clearance radius.
- Line obstacle: buffer by width plus clearance.
- Polygon obstacle: use polygon plus safety buffer.
- No-spray zones subtract from wet coverage.
- Hard obstacles are checked against physical machine/tower-travel buffers.

## Coverage Scoring

```text
field_usable = field_boundary - nonfarmable_zones
wet_raw = base_sweep union enabled_end_gun_sweep
wet_allowed = wet_raw intersect field_usable - no_spray_zones - wet_exclusions
dry_corners = field_usable - wet_allowed
coverage_percent = wet_allowed.area / field_usable.area * 100
```

Report irrigated acres, non-irrigated acres, dry-corner acres, end-gun acres, hard conflicts, and low-confidence source warnings.

## Best-Fit Placement

MVP should not start with a black-box optimizer. Implement:

1. User-selected center.
2. Deterministic grid of candidate centers inside an allowed zone.
3. Score each candidate with exact geometry.
4. Return top N with score components and rejection reasons.
5. Add advanced optimizer only after deterministic tests pass.
