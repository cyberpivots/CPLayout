import type { LayoutResult, PivotProject, XY } from "@cplayout/core";

import { endGunRadiusMeters, machineRadiusMeters } from "./geometry";

export interface CenterPivotProofValidationOptions {
  minBoundaryVertices?: number;
  maxBoundaryRadiusSpreadRatio?: number;
  radiusToleranceMeters?: number;
  radialToleranceDegrees?: number;
}

const DEFAULT_OPTIONS: Required<CenterPivotProofValidationOptions> = {
  minBoundaryVertices: 24,
  maxBoundaryRadiusSpreadRatio: 0.18,
  radiusToleranceMeters: 0.75,
  radialToleranceDegrees: 0.1,
};

export function validateCenterPivotProofGeometry(
  project: PivotProject,
  result: LayoutResult,
  options: CenterPivotProofValidationOptions = {},
): string[] {
  const effectiveOptions = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];
  const machineRadius = machineRadiusMeters(project.machine);
  const endGunRadius = endGunRadiusMeters(project.machine);

  if (project.fieldBoundary.length < effectiveOptions.minBoundaryVertices) {
    errors.push(`Field boundary needs at least ${effectiveOptions.minBoundaryVertices} vertices for visual center-pivot proof.`);
  }
  if (!pointInPolygon(project.pivotCenter, project.fieldBoundary)) {
    errors.push("Pivot center must be inside the field boundary.");
  }

  const boundaryDistances = project.fieldBoundary.map((point) => distance(project.pivotCenter, point)).sort((a, b) => a - b);
  const medianBoundaryRadius = median(boundaryDistances);
  const boundaryRadiusSpread = boundaryDistances.length > 0
    ? (boundaryDistances[boundaryDistances.length - 1] - boundaryDistances[0])
    : Number.POSITIVE_INFINITY;
  if (medianBoundaryRadius + effectiveOptions.radiusToleranceMeters < endGunRadius) {
    errors.push("Field boundary must contain the modeled wet radius including end gun throw.");
  }
  if (boundaryRadiusSpread > Math.max(1, machineRadius) * effectiveOptions.maxBoundaryRadiusSpreadRatio) {
    errors.push("Field boundary radius spread is too large for a circular center-pivot proof boundary.");
  }

  if (result.baseCoverage.length === 0) errors.push("Layout result must include base pivot coverage.");
  if (result.allowedCoverage.length === 0) errors.push("Layout result must include allowed irrigated coverage.");
  if (project.machine.endGunThrowMeters > 0 && result.endGunCoverage.length === 0) {
    errors.push("Layout result must include end-gun coverage when end gun throw is configured.");
  }

  if (result.towers.length !== project.machine.spanLengthsMeters.length) {
    errors.push("Tower count must match the machine span count.");
  }
  const towerErrors = towerRadialErrors(project, result, effectiveOptions);
  errors.push(...towerErrors);

  if (project.obstacles.length === 0) {
    errors.push("Proof project needs at least one named obstacle or setback.");
  }
  for (const obstacle of project.obstacles) {
    if (!obstacle.name.trim()) errors.push(`Obstacle ${obstacle.id} must have a visible name.`);
    if (obstacle.polygon.length < 4) errors.push(`Obstacle ${obstacle.name} must be a polygonal area, not a triangle proof marker.`);
  }

  return errors;
}

export function assertCenterPivotProofGeometry(
  project: PivotProject,
  result: LayoutResult,
  options: CenterPivotProofValidationOptions = {},
): void {
  const errors = validateCenterPivotProofGeometry(project, result, options);
  if (errors.length > 0) {
    throw new Error(`Center-pivot proof geometry failed validation: ${errors.join(" ")}`);
  }
}

function towerRadialErrors(
  project: PivotProject,
  result: LayoutResult,
  options: Required<CenterPivotProofValidationOptions>,
): string[] {
  const errors: string[] = [];
  let expectedRadius = 0;
  const angles: number[] = [];
  for (const [index, tower] of result.towers.entries()) {
    expectedRadius += project.machine.spanLengthsMeters[index] ?? 0;
    const actualRadius = distance(project.pivotCenter, tower.point);
    if (Math.abs(actualRadius - expectedRadius) > options.radiusToleranceMeters) {
      errors.push(`Tower ${tower.towerIndex} radius does not match cumulative span length.`);
    }
    angles.push(angleDegrees(project.pivotCenter, tower.point));
  }
  if (angles.length > 1) {
    const first = angles[0];
    const maxDelta = Math.max(...angles.slice(1).map((angle) => Math.abs(shortestAngleDelta(first, angle))));
    if (maxDelta > options.radialToleranceDegrees) {
      errors.push("Tower points must sit on one radial from the pivot center.");
    }
  }
  return errors;
}

function distance(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function angleDegrees(origin: XY, point: XY): number {
  return normalizeDegrees((Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI);
}

function shortestAngleDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function pointInPolygon(point: XY, polygon: XY[]): boolean {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
