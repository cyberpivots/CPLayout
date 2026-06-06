import type { PivotProject, XY } from "@cplayout/core";

export type SelectedProjectVertex =
  | { layer: "field_boundary"; vertexIndex: number }
  | { layer: "obstacle"; obstacleId: string; vertexIndex: number };

export function firstBoundaryVertexSelection(project: PivotProject): SelectedProjectVertex | null {
  if (project.fieldBoundary.length === 0) return null;
  return { layer: "field_boundary", vertexIndex: 0 };
}

export function firstObstacleVertexSelection(project: PivotProject): SelectedProjectVertex | null {
  const obstacle = project.obstacles.find((candidate) => candidate.polygon.length > 0);
  if (!obstacle) return null;
  return { layer: "obstacle", obstacleId: obstacle.id, vertexIndex: 0 };
}

export function hasObstacleVertexSelection(project: PivotProject): boolean {
  return project.obstacles.some((obstacle) => obstacle.polygon.length > 0);
}

export function adjacentProjectVertexSelection(
  project: PivotProject,
  selected: SelectedProjectVertex | null,
  direction: -1 | 1,
): SelectedProjectVertex | null {
  if (!selected) return firstBoundaryVertexSelection(project) ?? firstObstacleVertexSelection(project);
  const count = selectedProjectVertexCount(project, selected);
  if (count <= 0) return firstBoundaryVertexSelection(project) ?? firstObstacleVertexSelection(project);
  const vertexIndex = (selected.vertexIndex + direction + count) % count;
  return { ...selected, vertexIndex };
}

export function selectedProjectVertexPoint(project: PivotProject, selected: SelectedProjectVertex): XY | null {
  if (selected.layer === "field_boundary") return project.fieldBoundary[selected.vertexIndex] ?? null;
  return project.obstacles.find((obstacle) => obstacle.id === selected.obstacleId)?.polygon[selected.vertexIndex] ?? null;
}

export function selectedProjectVertexCount(project: PivotProject, selected: SelectedProjectVertex): number {
  if (selected.layer === "field_boundary") return project.fieldBoundary.length;
  return project.obstacles.find((obstacle) => obstacle.id === selected.obstacleId)?.polygon.length ?? 0;
}

export function selectedProjectVertexText(project: PivotProject, selected: SelectedProjectVertex): string {
  const count = selectedProjectVertexCount(project, selected);
  const ordinal = selected.vertexIndex + 1;
  if (selected.layer === "field_boundary") return `boundary vertex ${ordinal} of ${Math.max(count, ordinal)}`;
  const obstacle = project.obstacles.find((candidate) => candidate.id === selected.obstacleId);
  const name = obstacle?.name?.trim() ? obstacle.name.trim() : "obstacle";
  return `${name} vertex ${ordinal} of ${Math.max(count, ordinal)}`;
}
