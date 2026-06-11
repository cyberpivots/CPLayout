import { DOMParser } from "@xmldom/xmldom";

import { projectLonLatToXy } from "./coordinates";
import { PivotProjectSchema } from "./projectDocument";
import type { AdvisoryCornerArmConfig, AdvisorySourceReference, LonLat, PivotProject, SurveyPoint, XY } from "./types";
import { feetToMeters } from "./units";

const BPF_ALLOWED_TAGS = new Set(["BorderPoints", "BenchMark", "CenterPoint", "BorderPoint"]);
const EPSILON_DEGREES = 1e-12;

type XmlDocument = ReturnType<InstanceType<typeof DOMParser>["parseFromString"]>;
type XmlElement = NonNullable<XmlDocument["documentElement"]>;

export interface CornerGpsMapSourceRef extends AdvisorySourceReference {
  localPath?: string;
  sha256?: string;
}

export interface CornerGpsMapWgs84Point extends LonLat {
  altitude?: number;
}

export type CornerGpsMapBpfRingOrder = "clockwise" | "counterclockwise" | "unknown";

export interface CornerGpsMapBpfEvidence {
  sourceRef?: CornerGpsMapSourceRef;
  benchmark?: CornerGpsMapWgs84Point;
  centerPoint?: CornerGpsMapWgs84Point;
  borderPoints: CornerGpsMapWgs84Point[];
  normalizedBorderPoints: CornerGpsMapWgs84Point[];
  duplicateClosingPointRemoved: boolean;
  ringOrder: CornerGpsMapBpfRingOrder;
  warnings: string[];
  blockedReasons: string[];
}

export type CornerGpsMapBpfImportClassification = "field_boundary" | "pivot_center";

export interface CornerGpsMapBpfImportItem {
  id: string;
  name: string;
  classification: CornerGpsMapBpfImportClassification;
  geometryType: "Polygon" | "Point";
  selected: boolean;
  warning?: string;
}

export interface CornerGpsMapBpfImportPreview {
  project: PivotProject;
  evidence: CornerGpsMapBpfEvidence;
  items: CornerGpsMapBpfImportItem[];
  warnings: string[];
  canApply: boolean;
  importedBoundary: boolean;
  importedSurveyPointCount: number;
}

export interface CornerGpsMapBpfImportOptions {
  selectedItemIds?: string[];
  observedAt?: string;
  sourceRef?: CornerGpsMapSourceRef;
}

export type CornerGpsMapModelKind = "pivot" | "linear" | "unknown";

export interface CornerGpsMapModelPreset {
  sourceRef?: CornerGpsMapSourceRef;
  modelId: string;
  name: string;
  kind: CornerGpsMapModelKind;
  cornerType?: string;
  cornerLengthMeters?: number;
  overhangLengthMeters?: number;
  connectingLengthMeters?: number;
  freestandingLengthMeters?: number;
  minLrduBoundaryDistanceMeters?: number;
  maxCornerAngleDegrees?: number;
  minCornerAngleDegrees?: number;
  maxOutwardAngleDegrees?: number;
  maxInwardAngleDegrees?: number;
  minFreestandingAngleDegrees?: number;
  cornerSpeedFeetPerMinute?: number;
  rawAttributes: Record<string, string>;
}

export interface CornerGpsMapConfigParseResult {
  presets: CornerGpsMapModelPreset[];
  warnings: string[];
}

export interface CornerGpsMapReviewSettings {
  advisoryOnly: true;
  safetyZoneMeters: number;
  minLrduBoundaryClearanceMeters: number;
  minArcRadiusMeters?: number;
  maxEtRatio?: number;
  endGunReachMeters?: number;
  sourceRefs: CornerGpsMapSourceRef[];
  warnings: string[];
}

export const CORNER_GPS_MAP_DEFAULT_REVIEW_SETTINGS: CornerGpsMapReviewSettings = {
  advisoryOnly: true,
  safetyZoneMeters: feetToMeters(15),
  minLrduBoundaryClearanceMeters: feetToMeters(35),
  minArcRadiusMeters: feetToMeters(450),
  maxEtRatio: 1.5,
  sourceRefs: [{
    sourceId: "SRC-CORNERGPSMAP-LOCAL-HELP",
    title: "Local Corner GPS Mapping help and FLT options evidence",
    checkedAt: "2026-06-07",
    limit: "Local evidence only; does not certify design, proprietary kinematics, controller export, or universal engineering thresholds.",
  }],
  warnings: [
    "CornerGPSMap review settings are advisory and source-labeled; qualified review is required.",
    "BPF WGS84 coordinates are input/display evidence until projected into the project CRS.",
  ],
};

export function parseCornerGpsMapBpf(bpfText: string, sourceRef?: CornerGpsMapSourceRef): CornerGpsMapBpfEvidence {
  const warnings: string[] = [];
  const blockedReasons: string[] = [];
  const document = parseXmlDocument(stripBom(bpfText), "BPF");
  const root = document.documentElement;
  if (!root || tagName(root) !== "BorderPoints") {
    throw new Error("CornerGPSMap BPF import must use a BorderPoints root element.");
  }

  const unknownTags = unknownElementTags(root, BPF_ALLOWED_TAGS);
  if (unknownTags.length > 0) {
    blockedReasons.push(`Unsupported BPF tag(s): ${unknownTags.join(", ")}. Only BorderPoints, BenchMark, CenterPoint, and BorderPoint are accepted as evidence.`);
  }

  const benchmarkElements = childElements(root, "BenchMark");
  const centerElements = childElements(root, "CenterPoint");
  const borderPointElements = childElements(root, "BorderPoint");
  if (benchmarkElements.length === 0) warnings.push("BPF does not include a BenchMark point; import will use boundary and center evidence only.");
  if (benchmarkElements.length > 1) warnings.push("BPF includes multiple BenchMark points; only the first is used.");
  if (centerElements.length === 0) blockedReasons.push("BPF must include a CenterPoint.");
  if (centerElements.length > 1) warnings.push("BPF includes multiple CenterPoint entries; only the first is used.");

  const benchmark = (benchmarkElements[0] ? pointFromElement(benchmarkElements[0], "BenchMark", blockedReasons) : null) ?? undefined;
  const centerPoint = (centerElements[0] ? pointFromElement(centerElements[0], "CenterPoint", blockedReasons) : null) ?? undefined;
  if (centerPoint && nearlyZeroLonLat(centerPoint)) {
    blockedReasons.push("BPF CenterPoint is 0,0 and cannot be used as pivot evidence.");
  }

  const borderPoints = borderPointElements
    .map((element, index) => pointFromElement(element, `BorderPoint ${index + 1}`, blockedReasons))
    .filter((point): point is CornerGpsMapWgs84Point => Boolean(point));
  const { points: normalizedBorderPoints, removedClosingDuplicate } = removeClosingDuplicate(borderPoints);
  if (normalizedBorderPoints.length < 3) {
    blockedReasons.push("BPF must include at least three distinct BorderPoint entries after duplicate closure normalization.");
  }

  const ringOrder = ringOrderFor(normalizedBorderPoints);
  if (ringOrder === "counterclockwise") {
    warnings.push("BPF boundary points appear counterclockwise; CornerGPSMap help describes clockwise collection, so review point order before applying.");
  } else if (ringOrder === "unknown" && normalizedBorderPoints.length >= 3) {
    warnings.push("BPF boundary point order could not be classified; review the preview before applying.");
  }

  return {
    sourceRef,
    benchmark,
    centerPoint,
    borderPoints,
    normalizedBorderPoints,
    duplicateClosingPointRemoved: removedClosingDuplicate,
    ringOrder,
    warnings,
    blockedReasons,
  };
}

export function previewCornerGpsMapBpfImport(
  project: PivotProject,
  bpfText: string,
  options: CornerGpsMapBpfImportOptions = {},
): CornerGpsMapBpfImportPreview {
  const evidence = parseCornerGpsMapBpf(bpfText, options.sourceRef);
  const warnings = [...evidence.warnings, ...evidence.blockedReasons];
  const selected = options.selectedItemIds
    ? new Set(options.selectedItemIds)
    : new Set(["field-boundary", "pivot-center"]);
  const items: CornerGpsMapBpfImportItem[] = [];

  if (evidence.normalizedBorderPoints.length >= 3) {
    items.push({
      id: "field-boundary",
      name: "BPF field boundary",
      classification: "field_boundary",
      geometryType: "Polygon",
      selected: selected.has("field-boundary") && evidence.blockedReasons.length === 0,
      warning: evidence.duplicateClosingPointRemoved ? "Duplicate closing point removed before projection." : undefined,
    });
  }
  if (evidence.centerPoint) {
    items.push({
      id: "pivot-center",
      name: "BPF center point evidence",
      classification: "pivot_center",
      geometryType: "Point",
      selected: selected.has("pivot-center") && evidence.blockedReasons.length === 0,
      warning: "Imported as a pivot-center survey point; it does not move the active pivot center.",
    });
  }

  if (evidence.blockedReasons.length > 0) {
    return {
      project,
      evidence,
      items,
      warnings,
      canApply: false,
      importedBoundary: false,
      importedSurveyPointCount: 0,
    };
  }

  let projectedBoundary: XY[] | null = null;
  let projectedCenter: XY | null = null;
  try {
    projectedBoundary = evidence.normalizedBorderPoints.map((point) => projectLonLatToXy(point, project.projectCrs));
    if (evidence.centerPoint) projectedCenter = projectLonLatToXy(evidence.centerPoint, project.projectCrs);
  } catch (error) {
    return {
      project,
      evidence,
      items: items.map((item) => ({ ...item, selected: false })),
      warnings: [...warnings, error instanceof Error ? error.message : "Could not project BPF WGS84 evidence into the project CRS."],
      canApply: false,
      importedBoundary: false,
      importedSurveyPointCount: 0,
    };
  }

  const importBoundary = selected.has("field-boundary") && projectedBoundary.length >= 3;
  const importCenterSurveyPoint = selected.has("pivot-center") && Boolean(projectedCenter && evidence.centerPoint);
  const surveyPoint = importCenterSurveyPoint && projectedCenter && evidence.centerPoint
    ? bpfCenterSurveyPoint(project, projectedCenter, evidence.centerPoint, options.observedAt)
    : null;
  const nextProject = PivotProjectSchema.parse({
    ...project,
    fieldBoundary: importBoundary ? projectedBoundary : project.fieldBoundary,
    surveyPoints: surveyPoint ? [...project.surveyPoints, surveyPoint] : project.surveyPoints,
  });

  return {
    project: nextProject,
    evidence,
    items,
    warnings,
    canApply: importBoundary || Boolean(surveyPoint),
    importedBoundary: importBoundary,
    importedSurveyPointCount: surveyPoint ? 1 : 0,
  };
}

export function parseCornerGpsMapConfigXml(xmlText: string, sourceRef?: CornerGpsMapSourceRef): CornerGpsMapConfigParseResult {
  const document = parseXmlDocument(stripBom(xmlText), "CornerGPSMap config");
  const warnings: string[] = [];
  const root = document.documentElement;
  if (!root) throw new Error("CornerGPSMap config XML is missing a document element.");
  const modelElements = allElements(root).filter((element) => tagName(element) === "Model");
  const presets = modelElements.map((element): CornerGpsMapModelPreset | null => {
    const rawAttributes = attributesOf(element);
    const modelId = rawAttributes.ModelID ?? rawAttributes.modelId ?? rawAttributes.id;
    const name = rawAttributes.Name ?? rawAttributes.name;
    if (!modelId || !name) {
      warnings.push("Skipped config model without ModelID and Name attributes.");
      return null;
    }
    return {
      sourceRef,
      modelId,
      name,
      kind: modelKindFor(element),
      cornerType: rawAttributes.CornerType,
      cornerLengthMeters: optionalFeet(rawAttributes.CornerLength),
      overhangLengthMeters: optionalFeet(rawAttributes.OverhangLength),
      connectingLengthMeters: optionalFeet(rawAttributes.ConnectingLength),
      freestandingLengthMeters: optionalFeet(rawAttributes.FreestandingLength),
      minLrduBoundaryDistanceMeters: optionalFeet(rawAttributes.MinLRDUBoundaryDist),
      maxCornerAngleDegrees: optionalNumber(rawAttributes.MaxCornerAngle),
      minCornerAngleDegrees: optionalNumber(rawAttributes.MinCornerAngle),
      maxOutwardAngleDegrees: optionalNumber(rawAttributes.MaxOutwardAngle),
      maxInwardAngleDegrees: optionalNumber(rawAttributes.MaxInwardAngle),
      minFreestandingAngleDegrees: optionalNumber(rawAttributes.MinFreestandingAngle),
      cornerSpeedFeetPerMinute: optionalNumber(rawAttributes.CornerSpeed),
      rawAttributes,
    };
  }).filter((preset): preset is CornerGpsMapModelPreset => Boolean(preset));
  if (presets.length === 0) warnings.push("CornerGPSMap config did not contain any usable Model entries.");
  return { presets, warnings };
}

export function decodeCornerGpsMapFltConfig(encodedText: string): string {
  const normalized = encodedText.replace(/\s+/g, "");
  if (!normalized) throw new Error("CornerGPSMap FLT config is empty.");
  if (typeof Buffer !== "undefined") return stripBom(Buffer.from(normalized, "base64").toString("utf8"));
  if (typeof globalThis.atob === "function") return stripBom(globalThis.atob(normalized));
  throw new Error("No base64 decoder is available in this runtime.");
}

export function cornerGpsMapPresetToAdvisoryCornerArmConfig(
  preset: CornerGpsMapModelPreset,
  options: { id?: string; operatorConfirmedAt?: string; sourceRefs?: CornerGpsMapSourceRef[] } = {},
): AdvisoryCornerArmConfig {
  if (!preset.cornerLengthMeters || preset.cornerLengthMeters <= 0) {
    throw new Error(`CornerGPSMap model ${preset.name} does not include a positive CornerLength.`);
  }
  const sourceRefs = options.sourceRefs ?? (preset.sourceRef ? [preset.sourceRef] : [{
    sourceId: `SRC-CORNERGPSMAP-MODEL-${preset.modelId}`,
    title: `CornerGPSMap model ${preset.name}`,
    checkedAt: "2026-06-07",
    limit: "Local config-derived advisory metadata only; does not prove proprietary kinematics or controller compatibility.",
  }]);
  return {
    id: options.id ?? `corner-gps-map-${slug(preset.modelId)}-${slug(preset.name)}`,
    name: preset.name,
    advisoryOnly: true,
    lengthMeters: preset.cornerLengthMeters,
    ...(preset.overhangLengthMeters !== undefined ? { overhangLengthMeters: preset.overhangLengthMeters } : {}),
    ...(preset.overhangLengthMeters !== undefined && preset.cornerLengthMeters > preset.overhangLengthMeters
      ? { wheelTrackLengthMeters: preset.cornerLengthMeters - preset.overhangLengthMeters }
      : {}),
    ...(preset.maxOutwardAngleDegrees !== undefined ? { maxSteerAngleDegrees: preset.maxOutwardAngleDegrees } : {}),
    ...(preset.maxInwardAngleDegrees !== undefined ? { minSteerAngleDegrees: -Math.abs(preset.maxInwardAngleDegrees) } : {}),
    metadataSource: "cornergpsmap_config",
    modelFamily: cornerArmModelFamilyForPreset(preset),
    guidanceType: "gps_guidance",
    sequencingType: "unknown",
    orientation: "operator_supplied",
    confidence: "imported_cad",
    sourceRefs,
    operatorConfirmedAt: options.operatorConfirmedAt,
    notes: advisoryNotesForPreset(preset),
  };
}

function cornerArmModelFamilyForPreset(preset: CornerGpsMapModelPreset): NonNullable<AdvisoryCornerArmConfig["modelFamily"]> {
  if (/\bdual\b/i.test(preset.cornerType ?? "") || /\bdual\s*span\b/i.test(preset.name)) return "dualspan";
  if (preset.cornerLengthMeters && preset.cornerLengthMeters > 0) return "single_span_lrdu_sdu";
  return "unknown";
}

function bpfCenterSurveyPoint(project: PivotProject, projected: XY, wgs84: LonLat, observedAt = new Date(0).toISOString()): SurveyPoint {
  const existingIds = new Set(project.surveyPoints.map((point) => point.id));
  return {
    id: uniqueId(existingIds, "cornergpsmap-bpf-pivot-center"),
    label: "CornerGPSMap BPF center point",
    role: "pivot_center",
    projected,
    wgs84,
    observedAt,
    source: "imported",
    confidence: "autonomous_gps",
    notes: "Imported BPF center point evidence; does not move the active pivot center.",
  };
}

function parseXmlDocument(xmlText: string, label: string): XmlDocument {
  if (!xmlText.trim()) throw new Error(`${label} file is empty.`);
  const document = new DOMParser().parseFromString(xmlText, "text/xml");
  if (document.getElementsByTagName("parsererror").length > 0) throw new Error(`${label} XML could not be parsed: invalid XML`);
  return document;
}

function pointFromElement(element: XmlElement, label: string, blockedReasons: string[]): CornerGpsMapWgs84Point | null {
  const latitude = requiredCoordinateAttribute(element, "Latitude", label, blockedReasons);
  const longitude = requiredCoordinateAttribute(element, "Longitude", label, blockedReasons);
  if (latitude === null || longitude === null) return null;
  const altitude = optionalNumber(element.getAttribute("Altitude") ?? undefined);
  return altitude === undefined ? { latitude, longitude } : { latitude, longitude, altitude };
}

function requiredCoordinateAttribute(element: XmlElement, name: "Latitude" | "Longitude", label: string, blockedReasons: string[]): number | null {
  const raw = element.getAttribute(name);
  const value = optionalNumber(raw ?? undefined);
  if (value === undefined) {
    blockedReasons.push(`${label} must include a finite ${name} attribute.`);
    return null;
  }
  if (name === "Latitude" && (value < -90 || value > 90)) {
    blockedReasons.push(`${label} Latitude must be between -90 and 90 degrees.`);
    return null;
  }
  if (name === "Longitude" && (value < -180 || value > 180)) {
    blockedReasons.push(`${label} Longitude must be between -180 and 180 degrees.`);
    return null;
  }
  return value;
}

function removeClosingDuplicate(points: CornerGpsMapWgs84Point[]): { points: CornerGpsMapWgs84Point[]; removedClosingDuplicate: boolean } {
  if (points.length < 2) return { points, removedClosingDuplicate: false };
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.latitude - last.latitude) <= EPSILON_DEGREES && Math.abs(first.longitude - last.longitude) <= EPSILON_DEGREES) {
    return { points: points.slice(0, -1), removedClosingDuplicate: true };
  }
  return { points, removedClosingDuplicate: false };
}

function ringOrderFor(points: CornerGpsMapWgs84Point[]): CornerGpsMapBpfRingOrder {
  if (points.length < 3) return "unknown";
  let signedArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    signedArea += current.longitude * next.latitude - next.longitude * current.latitude;
  }
  if (Math.abs(signedArea) <= EPSILON_DEGREES) return "unknown";
  return signedArea < 0 ? "clockwise" : "counterclockwise";
}

function unknownElementTags(root: XmlElement, allowed: Set<string>): string[] {
  const unknown = new Set<string>();
  for (const element of allElements(root)) {
    const name = tagName(element);
    if (!allowed.has(name)) unknown.add(name);
  }
  return [...unknown].sort();
}

function allElements(root: XmlElement): XmlElement[] {
  const result: XmlElement[] = [root];
  const children = root.childNodes;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.nodeType === 1) result.push(...allElements(child as XmlElement));
  }
  return result;
}

function childElements(parent: XmlElement, name: string): XmlElement[] {
  const result: XmlElement[] = [];
  const children = parent.childNodes;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.nodeType === 1 && tagName(child as XmlElement) === name) result.push(child as XmlElement);
  }
  return result;
}

function tagName(element: XmlElement): string {
  return element.localName || element.tagName.replace(/^.*:/, "");
}

function attributesOf(element: XmlElement): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes[index];
    result[attribute.name] = attribute.value;
  }
  return result;
}

function modelKindFor(element: XmlElement): CornerGpsMapModelKind {
  let parent = element.parentNode;
  while (parent && parent.nodeType === 1) {
    const name = tagName(parent as XmlElement);
    if (name === "Pivot") return "pivot";
    if (name === "Linear") return "linear";
    parent = parent.parentNode;
  }
  return "unknown";
}

function optionalFeet(value: string | undefined): number | undefined {
  const number = optionalNumber(value);
  return number === undefined ? undefined : feetToMeters(number);
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nearlyZeroLonLat(point: LonLat): boolean {
  return Math.abs(point.latitude) <= EPSILON_DEGREES && Math.abs(point.longitude) <= EPSILON_DEGREES;
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function advisoryNotesForPreset(preset: CornerGpsMapModelPreset): string {
  const parts = [
    `CornerGPSMap modelId=${preset.modelId}`,
    preset.cornerType ? `cornerType=${preset.cornerType}` : null,
    preset.overhangLengthMeters ? `overhangMeters=${round(preset.overhangLengthMeters)}` : null,
    preset.connectingLengthMeters ? `connectingMeters=${round(preset.connectingLengthMeters)}` : null,
    preset.freestandingLengthMeters ? `freestandingMeters=${round(preset.freestandingLengthMeters)}` : null,
    preset.minLrduBoundaryDistanceMeters ? `minLrduBoundaryMeters=${round(preset.minLrduBoundaryDistanceMeters)}` : null,
    preset.minCornerAngleDegrees !== undefined ? `minCornerAngle=${preset.minCornerAngleDegrees}` : null,
    preset.maxCornerAngleDegrees !== undefined ? `maxCornerAngle=${preset.maxCornerAngleDegrees}` : null,
    preset.maxInwardAngleDegrees !== undefined ? `maxInwardAngle=${preset.maxInwardAngleDegrees}` : null,
    preset.maxOutwardAngleDegrees !== undefined ? `maxOutwardAngle=${preset.maxOutwardAngleDegrees}` : null,
    preset.cornerSpeedFeetPerMinute !== undefined ? `cornerSpeedFpm=${preset.cornerSpeedFeetPerMinute}` : null,
    "Advisory config only; proprietary kinematics and controller compatibility remain unverified.",
  ].filter((part): part is string => Boolean(part));
  return parts.join("; ");
}

function uniqueId(existingIds: Set<string>, base: string): string {
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "model";
}

function round(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}
