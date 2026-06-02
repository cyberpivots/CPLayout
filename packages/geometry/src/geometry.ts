import * as polygonClipping from "polygon-clipping";

import {
  LayoutMechanicalConflict,
  LayoutResult,
  MultiPolygonXY,
  ObstacleZone,
  PivotMachine,
  PivotProject,
  PivotSweep,
  PolygonXY,
  TowerPoint,
  XY,
} from "@cplayout/core";
import { assertProjectedCrs, squareMetersToAcres } from "@cplayout/core";

type ClipPosition = [number, number];
type ClipPolygon = ClipPosition[][];
type ClipMultiPolygon = ClipPolygon[];

const DEFAULT_SEGMENTS = 288;
const EPSILON_AREA = 0.000001;
export const DEFAULT_BOUNDARY_EPSILON_SQUARE_METERS = 0.01;

export function machineRadiusMeters(machine: PivotMachine): number {
  return machine.spanLengthsMeters.reduce((sum, span) => sum + span, 0) + machine.overhangMeters;
}

export function endGunRadiusMeters(machine: PivotMachine): number {
  return machineRadiusMeters(machine) + Math.max(0, machine.endGunThrowMeters);
}

export function polygonAreaSquareMeters(ring: XY[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function multiPolygonAreaSquareMeters(multiPolygon: MultiPolygonXY): number {
  return multiPolygon.reduce((total, polygon) => {
    const [outer, ...holes] = polygon;
    const outerArea = polygonAreaSquareMeters(outer ?? []);
    const holeArea = holes.reduce((sum, hole) => sum + polygonAreaSquareMeters(hole), 0);
    return total + Math.max(0, outerArea - holeArea);
  }, 0);
}

export function createCirclePolygon(center: XY, radiusMeters: number, segments = DEFAULT_SEGMENTS): XY[] {
  assertPositive(radiusMeters, "radiusMeters");
  return Array.from({ length: segments }, (_, index) => {
    const theta = (index / segments) * Math.PI * 2;
    return {
      x: center.x + radiusMeters * Math.cos(theta),
      y: center.y + radiusMeters * Math.sin(theta),
    };
  });
}

export function createSectorPolygon(center: XY, radiusMeters: number, sweep: PivotSweep, segments = DEFAULT_SEGMENTS): XY[] {
  assertPositive(radiusMeters, "radiusMeters");
  if (sweep.mode === "full_circle") {
    return createCirclePolygon(center, radiusMeters, segments);
  }

  const angles = buildSweepAngles(sweep.startAngleDegrees, sweep.stopAngleDegrees, sweep.direction, segments);
  return [
    center,
    ...angles.map((angleDegrees) => polarOffset(center, radiusMeters, angleDegrees)),
    center,
  ];
}

export function createAnnularSector(center: XY, innerRadius: number, outerRadius: number, sweep: PivotSweep): MultiPolygonXY {
  if (outerRadius <= innerRadius) return [];
  if (innerRadius <= 0) return [[createSectorPolygon(center, outerRadius, sweep)]];
  const outer = toClipMultiPolygon([[createSectorPolygon(center, outerRadius, sweep)]]);
  const inner = toClipMultiPolygon([[createSectorPolygon(center, innerRadius, sweep)]]);
  return fromClipMultiPolygon(polygonClipping.difference(outer, inner) as ClipMultiPolygon);
}

export function calculateTowerPoints(center: XY, machine: PivotMachine, angleDegrees: number): TowerPoint[] {
  let radiusMeters = 0;
  return machine.spanLengthsMeters.map((spanLength, index) => {
    radiusMeters += spanLength;
    return {
      towerIndex: index + 1,
      radiusMeters,
      point: polarOffset(center, radiusMeters, angleDegrees),
    };
  });
}

export function evaluateLayout(project: PivotProject): LayoutResult {
  assertProjectedCrs(project.projectCrs);

  const coverage = calculateWetCoverage(project);
  const field = toClipMultiPolygon([[project.fieldBoundary]]);
  const noSprayObstacles = project.obstacles.filter((obstacle) => obstacle.noSpray);
  const obstaclePolygons = project.obstacles.map((obstacle) => [obstacle.polygon]);
  const noSprayObstaclePolygons = noSprayObstacles.map((obstacle) => [obstacle.polygon]);
  const obstacleMulti = toClipMultiPolygon(obstaclePolygons);
  const noSprayObstacleMulti = toClipMultiPolygon(noSprayObstaclePolygons);
  const insideField = polygonClipping.intersection(coverage.wetRaw, field) as ClipMultiPolygon | null;
  const outsideField = polygonClipping.difference(coverage.wetRaw, field) as ClipMultiPolygon;
  const allowed = insideField
    ? (noSprayObstacles.length > 0
      ? polygonClipping.difference(insideField, noSprayObstacleMulti) as ClipMultiPolygon
      : insideField)
    : [];
  const mechanicalConflicts = evaluateMechanicalConflicts(project);

  const fieldArea = polygonAreaSquareMeters(project.fieldBoundary);
  const allowedArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(allowed));
  const endGunArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(polygonClipping.intersection(coverage.endGunClip, field) as ClipMultiPolygon | null ?? []));
  const outsideArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(outsideField));
  const obstacleConflictCount = project.obstacles.filter((obstacle) => {
    const intersection = polygonClipping.intersection(coverage.wetRaw, toClipMultiPolygon([[obstacle.polygon]])) as ClipMultiPolygon | null;
    return multiPolygonAreaSquareMeters(fromClipMultiPolygon(intersection ?? [])) > EPSILON_AREA;
  }).length;
  const noSprayConflictCount = noSprayObstacles.filter((obstacle) => {
    const intersection = polygonClipping.intersection(coverage.wetRaw, toClipMultiPolygon([[obstacle.polygon]])) as ClipMultiPolygon | null;
    return multiPolygonAreaSquareMeters(fromClipMultiPolygon(intersection ?? [])) > EPSILON_AREA;
  }).length;
  const hardMechanicalConflictCount = uniqueConflictObstacleCount(mechanicalConflicts);
  const towerTrackConflictCount = uniqueConflictObstacleCount(mechanicalConflicts.filter((conflict) => conflict.conflictType === "tower_track"));

  const warnings = buildWarnings(project, outsideArea, obstacleConflictCount, noSprayConflictCount, hardMechanicalConflictCount);
  const towerAngle = project.machine.sweep.mode === "partial_circle"
    ? project.machine.sweep.startAngleDegrees
    : 45;

  return {
    metrics: {
      fieldAcres: squareMetersToAcres(fieldArea),
      irrigatedAcres: squareMetersToAcres(allowedArea),
      nonIrrigatedAcres: squareMetersToAcres(Math.max(0, fieldArea - allowedArea)),
      coveragePercent: fieldArea > 0 ? (allowedArea / fieldArea) * 100 : 0,
      endGunAcres: squareMetersToAcres(endGunArea),
      outsideFieldAcres: squareMetersToAcres(outsideArea),
      obstacleConflictCount,
      noSprayConflictCount,
      hardMechanicalConflictCount,
      towerTrackConflictCount,
    },
    baseCoverage: fromClipMultiPolygon(coverage.base),
    endGunCoverage: coverage.endGun,
    allowedCoverage: fromClipMultiPolygon(allowed),
    outsideFieldCoverage: fromClipMultiPolygon(outsideField),
    obstacles: fromClipMultiPolygon(obstacleMulti),
    mechanicalConflicts,
    towers: calculateTowerPoints(project.pivotCenter, project.machine, towerAngle),
    warnings,
  };
}

export function evaluateMechanicalConflicts(project: PivotProject): LayoutMechanicalConflict[] {
  const hardObstacles = project.obstacles.filter((obstacle) => obstacle.hardConflict);
  if (hardObstacles.length === 0) return [];

  const machineRadius = machineRadiusMeters(project.machine);
  const towerBuffer = Math.max(0.5, project.machine.towerClearanceBufferMeters);
  const machineBuffer = Math.max(0.5, project.machine.machineClearanceBufferMeters);
  const machinePath = createBufferedPathClip(project.pivotCenter, machineRadius, machineBuffer, project.machine.sweep);
  const towerTracks = towerTrackClips(project);
  const conflicts: LayoutMechanicalConflict[] = [];

  for (const obstacle of hardObstacles) {
    const machinePathArea = obstacleIntersectionArea(machinePath, obstacle);
    if (machinePathArea > EPSILON_AREA) {
      conflicts.push(mechanicalConflict(obstacle, "machine_path", machinePathArea));
    }

    const towerTrackArea = towerTracks.reduce((area, towerTrack) => area + obstacleIntersectionArea(towerTrack, obstacle), 0);
    if (towerTrackArea > EPSILON_AREA) {
      conflicts.push(mechanicalConflict(obstacle, "tower_track", towerTrackArea));
    }
  }

  return conflicts;
}

export interface BoundaryConstraintResult {
  feasible: boolean;
  outsideFieldAreaSquareMeters: number;
  outsideFieldAcres: number;
  epsilonSquareMeters: number;
  outsideFieldCoverage: MultiPolygonXY;
}

export function validateWetCoverageWithinField(
  project: PivotProject,
  epsilonSquareMeters = DEFAULT_BOUNDARY_EPSILON_SQUARE_METERS,
): BoundaryConstraintResult {
  assertProjectedCrs(project.projectCrs);

  const coverage = calculateWetCoverage(project);
  const field = toClipMultiPolygon([[project.fieldBoundary]]);
  const outsideField = polygonClipping.difference(coverage.wetRaw, field) as ClipMultiPolygon;
  const outsideFieldCoverage = fromClipMultiPolygon(outsideField);
  const outsideFieldAreaSquareMeters = multiPolygonAreaSquareMeters(outsideFieldCoverage);

  return {
    feasible: outsideFieldAreaSquareMeters <= epsilonSquareMeters,
    outsideFieldAreaSquareMeters,
    outsideFieldAcres: squareMetersToAcres(outsideFieldAreaSquareMeters),
    epsilonSquareMeters,
    outsideFieldCoverage,
  };
}

function calculateWetCoverage(project: PivotProject): {
  base: ClipMultiPolygon;
  endGun: MultiPolygonXY;
  endGunClip: ClipMultiPolygon;
  wetRaw: ClipMultiPolygon;
} {
  const machineRadius = machineRadiusMeters(project.machine);
  const endGunRadius = endGunRadiusMeters(project.machine);
  const base = toClipMultiPolygon([[createSectorPolygon(project.pivotCenter, machineRadius, project.machine.sweep)]]);
  const endGunClip = createEndGunCoverageClip(project, machineRadius, endGunRadius);
  const endGun = fromClipMultiPolygon(endGunClip);
  const wetRaw = endGunClip.length > 0
    ? polygonClipping.union(base, endGunClip) as ClipMultiPolygon
    : base;

  return { base, endGun, endGunClip, wetRaw };
}

function createEndGunCoverageClip(project: PivotProject, machineRadius: number, endGunRadius: number): ClipMultiPolygon {
  if (endGunRadius <= machineRadius) return [];

  const sweepAnnulus = toClipMultiPolygon(createAnnularSector(project.pivotCenter, machineRadius, endGunRadius, project.machine.sweep));
  const ranges = (project.machine.endGunAngleRanges ?? []).filter((range) => (
    Number.isFinite(range.startAngleDegrees)
    && Number.isFinite(range.stopAngleDegrees)
  ));
  if (ranges.length === 0) return sweepAnnulus;

  const rangeAnnulus = toClipMultiPolygon(ranges.flatMap((range) => createAnnularSector(
    project.pivotCenter,
    machineRadius,
    endGunRadius,
    {
      mode: "partial_circle",
      startAngleDegrees: range.startAngleDegrees,
      stopAngleDegrees: range.stopAngleDegrees,
      direction: range.direction,
    },
  )));
  return polygonClipping.intersection(sweepAnnulus, rangeAnnulus) as ClipMultiPolygon | null ?? [];
}

export function exportScenarioGeoJson(project: PivotProject, result: LayoutResult): object {
  return {
    type: "FeatureCollection",
    properties: {
      projectId: project.id,
      projectName: project.name,
      projectCrs: project.projectCrs,
      unitSystem: project.unitSystem,
      settings: project.settings,
      mapPackages: project.mapPackages ?? [],
      generatedBy: "center-pivot-layout-rn",
    },
    features: [
      feature("field_boundary", [[project.fieldBoundary]], { sourceConfidence: "manual" }),
      feature("allowed_coverage", result.allowedCoverage, result.metrics),
      feature("outside_field_coverage", result.outsideFieldCoverage, { acres: result.metrics.outsideFieldAcres }),
      feature("obstacles", result.obstacles, { count: project.obstacles.length }),
      ...result.towers.map((tower) => ({
        type: "Feature",
        properties: {
          layerType: "tower_location",
          towerIndex: tower.towerIndex,
          radiusMeters: tower.radiusMeters,
        },
        geometry: {
          type: "Point",
          coordinates: [tower.point.x, tower.point.y],
        },
      })),
    ],
  };
}

export function ringsToSvgPath(multiPolygon: MultiPolygonXY): string {
  return multiPolygon
    .map((polygon) => polygon
      .map((ring) => ring.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${(-point.y).toFixed(2)}`).join(" ") + " Z")
      .join(" "))
    .join(" ");
}

export function boundsForGeometry(rings: XY[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  const points = rings.flat();
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );
}

export function polarOffset(center: XY, radiusMeters: number, angleDegrees: number): XY {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: center.x + radiusMeters * Math.cos(radians),
    y: center.y + radiusMeters * Math.sin(radians),
  };
}

function buildSweepAngles(startAngle: number, stopAngle: number, direction: "clockwise" | "counterclockwise", maxSegments: number): number[] {
  const start = normalizeDegrees(startAngle);
  const stop = normalizeDegrees(stopAngle);
  const delta = direction === "counterclockwise"
    ? normalizeDegrees(stop - start)
    : -normalizeDegrees(start - stop);
  const segmentCount = Math.max(8, Math.ceil((Math.abs(delta) / 360) * maxSegments));
  return Array.from({ length: segmentCount + 1 }, (_, index) => start + (delta * index) / segmentCount);
}

function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function toClipMultiPolygon(multiPolygon: MultiPolygonXY): ClipMultiPolygon {
  return multiPolygon.map((polygon) => polygon.map((ring) => closeRing(ring).map((point) => [point.x, point.y] as ClipPosition)));
}

function fromClipMultiPolygon(multiPolygon: ClipMultiPolygon | null): MultiPolygonXY {
  if (!multiPolygon) return [];
  return multiPolygon.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => ({ x, y }))));
}

function closeRing(ring: XY[]): XY[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.x === last.x && first.y === last.y) return ring;
  return [...ring, first];
}

function feature(layerType: string, geometry: MultiPolygonXY, properties: object): object {
  return {
    type: "Feature",
    properties: { layerType, ...properties },
    geometry: {
      type: "MultiPolygon",
      coordinates: toClipMultiPolygon(geometry),
    },
  };
}

function buildWarnings(
  project: PivotProject,
  outsideArea: number,
  obstacleConflictCount: number,
  noSprayConflictCount: number,
  hardMechanicalConflictCount: number,
): string[] {
  const warnings: string[] = [];
  if (outsideArea > 5) {
    warnings.push("Machine wet radius extends beyond the field boundary. Treat field edge as a hard boundary before construction approval.");
  }
  if (noSprayConflictCount > 0) {
    warnings.push(`${noSprayConflictCount} no-spray obstacle or exclusion zone removes modeled wet coverage.`);
  } else if (obstacleConflictCount > 0) {
    warnings.push(`${obstacleConflictCount} obstacle or exclusion zone intersects the modeled wet area.`);
  }
  if (hardMechanicalConflictCount > 0) {
    warnings.push(`${hardMechanicalConflictCount} hard obstacle intersects a modeled tower track or machine path.`);
  }
  if (project.surveyPoints.some((point) => point.confidence !== "rtk_fixed")) {
    warnings.push("Some project inputs are not RTK-fixed. Keep the layout planning-grade until critical points are surveyed.");
  }
  return warnings;
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
}

function towerTrackClips(project: PivotProject): ClipMultiPolygon[] {
  const towerBuffer = Math.max(0.5, project.machine.towerClearanceBufferMeters);
  let towerRadius = 0;
  return project.machine.spanLengthsMeters.map((spanLength) => {
    towerRadius += spanLength;
    return createBufferedPathClip(project.pivotCenter, towerRadius, towerBuffer, project.machine.sweep);
  });
}

function createBufferedPathClip(center: XY, radiusMeters: number, bufferMeters: number, sweep: PivotSweep): ClipMultiPolygon {
  return toClipMultiPolygon(createAnnularSector(
    center,
    Math.max(0, radiusMeters - bufferMeters),
    radiusMeters + bufferMeters,
    sweep,
  ));
}

function obstacleIntersectionArea(clip: ClipMultiPolygon, obstacle: ObstacleZone): number {
  const intersection = polygonClipping.intersection(clip, toClipMultiPolygon([[obstacle.polygon]])) as ClipMultiPolygon | null;
  return multiPolygonAreaSquareMeters(fromClipMultiPolygon(intersection ?? []));
}

function mechanicalConflict(
  obstacle: ObstacleZone,
  conflictType: LayoutMechanicalConflict["conflictType"],
  areaSquareMeters: number,
): LayoutMechanicalConflict {
  return {
    obstacleId: obstacle.id,
    obstacleKind: obstacle.kind,
    obstacleName: obstacle.name,
    conflictType,
    areaSquareMeters: Number(areaSquareMeters.toFixed(6)),
  };
}

function uniqueConflictObstacleCount(conflicts: LayoutMechanicalConflict[]): number {
  return new Set(conflicts.map((conflict) => conflict.obstacleId)).size;
}
