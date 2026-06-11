import type { AdvisorySourceReference } from "./types";
import { feetToMeters } from "./units";

export type CornerArmArtifactSourceStatus =
  | "scaffold_only"
  | "operator_confirmed"
  | "manufacturer_verified";

export interface CornerArmArtifactReference extends AdvisorySourceReference {
  artifactSha256: string;
  localEvidencePath: string;
  sourceStatus: CornerArmArtifactSourceStatus;
}

export interface CornerArmLrduSpeedTableRow {
  id: string;
  sourceStatus: CornerArmArtifactSourceStatus;
  tireLabel?: string;
  motorRpm?: number;
  speedMetersPerMinuteAt100Percent?: number;
  notes: string;
}

export interface CornerArmModelCatalogEntry {
  id: string;
  label: string;
  manufacturer: string;
  family: "precision_corner" | "vflex_corner" | "standard_corner" | "unknown";
  sourceStatus: CornerArmArtifactSourceStatus;
  normalizedRecordStatus: "EXTERNAL_OFFICIAL" | "PROJECT_UNCONFIRMED" | "UNCONFIRMED";
  productionReady: false;
  sourceRefs: CornerArmArtifactReference[];
  spanLengthMeters: number;
  overhangLengthMeters: number;
  effectiveLengthMeters?: number;
  minCornerAngleDegrees?: number;
  maxCornerAngleDegrees?: number;
  maxOutwardSteeringAngleDegrees?: number;
  maxInwardSteeringAngleDegrees?: number;
  cornerSpeedRatio?: number;
  lrduMotorRpm?: number;
  sduMotorRpm?: number;
  lrduSpeedTableRows?: CornerArmLrduSpeedTableRow[];
  notes: string[];
}

export const CORNER_ARM_INITIAL_SCAFFOLD_SOURCE: CornerArmArtifactReference = {
  sourceId: "SRC-CORNER-ARM-INITIAL-SCAFFOLD-20260610",
  title: "Irrigation corner-arm initial scaffold ZIP",
  checkedAt: "2026-06-11",
  limit: "Local scaffold/evidence only; not production machine data, controller proof, proprietary kinematics proof, or canonical projected XY authority.",
  artifactSha256: "3ff46c9c2ca3a7f7614f11cbb931b648908c2695eb60cdae506925e4417ffa4f",
  localEvidencePath: "tmp/irrigation_corner_arm_initial_scaffold.zip",
  sourceStatus: "scaffold_only",
};

export const VALLEY_CORNER_ARM_SPECS_A_STANDALONE_SOURCE: CornerArmArtifactReference = {
  sourceId: "SRC-VALLEY-CORNER-ARM-SPECS-A-STANDALONE-20260610",
  title: "Valley Corner Arm Specs_A.xlsx standalone workbook",
  checkedAt: "2026-06-11",
  limit: "Local scaffold/evidence only; workbook rows require manufacturer/dealer/operator confirmation before production use.",
  artifactSha256: "e34103f80182c611d33fd34204a2adbfe3b21cb5f9a31514b1bd5fb494d1b4ef",
  localEvidencePath: "tmp/Valley Corner Arm Specs_A.xlsx",
  sourceStatus: "scaffold_only",
};

export const VALLEY_CORNER_ARM_SPECS_A_EMBEDDED_SOURCE: CornerArmArtifactReference = {
  sourceId: "SRC-VALLEY-CORNER-ARM-SPECS-A-EMBEDDED-20260610",
  title: "Valley Corner Arm Specs_A.xlsx embedded in initial scaffold ZIP",
  checkedAt: "2026-06-11",
  limit: "Embedded workbook hash differs from the standalone workbook; treat both as unconfirmed local scaffold evidence until provenance is resolved.",
  artifactSha256: "1295f6404b5e39dc75c7ca94d759597c352a3665df9535bb66c69b44fa229baf",
  localEvidencePath: "tmp/irrigation_corner_arm_initial_scaffold.zip!/Valley Corner Arm Specs_A.xlsx",
  sourceStatus: "scaffold_only",
};

export const VALLEY_CORNER_ARM_SCAFFOLD_CATALOG: CornerArmModelCatalogEntry[] = [
  normalizedModel({
    id: "valley-precision-corner-185ft-normalized",
    label: "Valley Precision Corner 185 ft scaffold",
    family: "precision_corner",
    spanLengthMeters: feetToMeters(185),
    overhangLengthMeters: feetToMeters(82),
    effectiveLengthMeters: feetToMeters(256),
    lrduMotorRpm: 34,
    sduMotorRpm: 56,
    cornerSpeedRatio: 1.55,
  }),
  normalizedModel({
    id: "valley-precision-corner-205ft-normalized",
    label: "Valley Precision Corner 205 ft scaffold",
    family: "precision_corner",
    spanLengthMeters: feetToMeters(205),
    overhangLengthMeters: feetToMeters(82),
    effectiveLengthMeters: feetToMeters(276),
    lrduMotorRpm: 34,
    sduMotorRpm: 56,
    cornerSpeedRatio: 1.55,
  }),
  normalizedModel({
    id: "valley-vflex-corner-66m-25m-normalized",
    label: "Valley VFlex Corner 66 m / 25 m scaffold",
    family: "vflex_corner",
    spanLengthMeters: 66,
    overhangLengthMeters: 25,
    lrduMotorRpm: 34,
    sduMotorRpm: 56,
  }),
];

export function findCornerArmScaffoldCatalogEntry(id: string): CornerArmModelCatalogEntry | undefined {
  return VALLEY_CORNER_ARM_SCAFFOLD_CATALOG.find((entry) => entry.id === id);
}

function normalizedModel(input: {
  id: string;
  label: string;
  family: CornerArmModelCatalogEntry["family"];
  spanLengthMeters: number;
  overhangLengthMeters: number;
  effectiveLengthMeters?: number;
  cornerSpeedRatio?: number;
  lrduMotorRpm?: number;
  sduMotorRpm?: number;
}): CornerArmModelCatalogEntry {
  return {
    id: input.id,
    label: input.label,
    manufacturer: "Valley",
    family: input.family,
    sourceStatus: "scaffold_only",
    normalizedRecordStatus: "EXTERNAL_OFFICIAL",
    productionReady: false,
    sourceRefs: [CORNER_ARM_INITIAL_SCAFFOLD_SOURCE, VALLEY_CORNER_ARM_SPECS_A_EMBEDDED_SOURCE],
    spanLengthMeters: input.spanLengthMeters,
    overhangLengthMeters: input.overhangLengthMeters,
    ...(input.effectiveLengthMeters === undefined ? {} : { effectiveLengthMeters: input.effectiveLengthMeters }),
    ...(input.cornerSpeedRatio === undefined ? {} : { cornerSpeedRatio: input.cornerSpeedRatio }),
    ...(input.lrduMotorRpm === undefined ? {} : { lrduMotorRpm: input.lrduMotorRpm }),
    ...(input.sduMotorRpm === undefined ? {} : { sduMotorRpm: input.sduMotorRpm }),
    notes: [
      "Values were curated from the normalized scaffold records in the local ZIP packet; every source row is production_ready=No.",
      "The standalone XLSX is tracked as lineage evidence only because it differs from the embedded workbook and lacks the normalized source/status contract.",
      "Confirm actual machine serial/model, LRDU radius, tire/motor/service context, guidance path, orientation, and dealer/operator settings before using this row for design.",
    ],
  };
}
