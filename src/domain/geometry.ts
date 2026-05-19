import * as polygonClipping from "polygon-clipping";

import {
  LayoutResult,
  MultiPolygonXY,
  PivotMachine,
  PivotProject,
  PivotSweep,
  PolygonXY,
  TowerPoint,
  XY,
} from "./types";
import { assertProjectedCrs, squareMetersToAcres } from "./units";

type ClipPosition = [number, number];
type ClipPolygon = ClipPosition[][];
type ClipMultiPolygon = ClipPolygon[];

const DEFAULT_SEGMENTS = 288;
const EPSILON_AREA = 0.000001;

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

  const machineRadius = machineRadiusMeters(project.machine);
  const endGunRadius = endGunRadiusMeters(project.machine);
  const field = toClipMultiPolygon([[project.fieldBoundary]]);
  const base = toClipMultiPolygon([[createSectorPolygon(project.pivotCenter, machineRadius, project.machine.sweep)]]);
  const endGun = createAnnularSector(project.pivotCenter, machineRadius, endGunRadius, project.machine.sweep);
  const endGunClip = toClipMultiPolygon(endGun);
  const wetRaw = endGun.length > 0
    ? polygonClipping.union(base, endGunClip) as ClipMultiPolygon
    : base;

  const obstaclePolygons = project.obstacles.map((obstacle) => [obstacle.polygon]);
  const obstacleMulti = toClipMultiPolygon(obstaclePolygons);
  const insideField = polygonClipping.intersection(wetRaw, field) as ClipMultiPolygon | null;
  const outsideField = polygonClipping.difference(wetRaw, field) as ClipMultiPolygon;
  const allowed = insideField
    ? (project.obstacles.length > 0
      ? polygonClipping.difference(insideField, obstacleMulti) as ClipMultiPolygon
      : insideField)
    : [];

  const fieldArea = polygonAreaSquareMeters(project.fieldBoundary);
  const allowedArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(allowed));
  const endGunArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(polygonClipping.intersection(endGunClip, field) as ClipMultiPolygon | null ?? []));
  const outsideArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(outsideField));
  const obstacleConflictCount = project.obstacles.filter((obstacle) => {
    const intersection = polygonClipping.intersection(wetRaw, toClipMultiPolygon([[obstacle.polygon]])) as ClipMultiPolygon | null;
    return multiPolygonAreaSquareMeters(fromClipMultiPolygon(intersection ?? [])) > EPSILON_AREA;
  }).length;

  const warnings = buildWarnings(project, outsideArea, obstacleConflictCount);
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
    },
    baseCoverage: fromClipMultiPolygon(base),
    endGunCoverage: endGun,
    allowedCoverage: fromClipMultiPolygon(allowed),
    outsideFieldCoverage: fromClipMultiPolygon(outsideField),
    obstacles: fromClipMultiPolygon(obstacleMulti),
    towers: calculateTowerPoints(project.pivotCenter, project.machine, towerAngle),
    warnings,
  };
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

function buildWarnings(project: PivotProject, outsideArea: number, obstacleConflictCount: number): string[] {
  const warnings: string[] = [];
  if (outsideArea > 5) {
    warnings.push("Machine wet radius extends beyond the field boundary. Treat field edge as a hard boundary before construction approval.");
  }
  if (obstacleConflictCount > 0) {
    warnings.push(`${obstacleConflictCount} obstacle or exclusion zone intersects the modeled wet area.`);
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
