import { PivotProject } from "./types";
import { defaultProjectSettings } from "./settings";
import { projectLonLatToXy } from "./coordinates";
import type { XY } from "./types";

const observedAt = "2026-05-19T09:00:00-06:00";
const projectOrigin: XY = { x: 501000, y: 4506200 };

function p(x: number, y: number): XY {
  return { x: projectOrigin.x + x, y: projectOrigin.y + y };
}

export const sampleProject: PivotProject = {
  id: "sample-burgundy-quarter-section",
  name: "North Quarter Concept Layout",
  projectCrs: "EPSG:32613",
  unitSystem: "us_survey_feet",
  settings: defaultProjectSettings(),
  fieldBoundary: [
    p(0, 0),
    p(815, -10),
    p(858, 382),
    p(612, 780),
    p(88, 746),
    p(-32, 348),
  ],
  pivotCenter: p(410, 360),
  waterSource: p(382, 314),
  powerSource: p(118, 690),
  machine: {
    id: "machine-a",
    name: "Four-span concept pivot",
    spanLengthsMeters: [47.2, 47.2, 47.2, 47.2],
    overhangMeters: 18.5,
    endGunThrowMeters: 24,
    towerClearanceBufferMeters: 5,
    machineClearanceBufferMeters: 8,
    sweep: { mode: "full_circle" },
  },
  obstacles: [
    {
      id: "road-west",
      name: "West access road buffer",
      kind: "road",
      polygon: [
        p(94, 118),
        p(134, 118),
        p(134, 724),
        p(94, 724),
      ],
      bufferMeters: 10,
      hardConflict: true,
      noSpray: true,
      confidence: "imagery_digitized",
    },
    {
      id: "building-pad",
      name: "Pump shed and service pad",
      kind: "building",
      polygon: [
        p(542, 258),
        p(606, 258),
        p(606, 322),
        p(542, 322),
      ],
      bufferMeters: 12,
      hardConflict: true,
      noSpray: true,
      confidence: "user_estimated",
    },
  ],
  mapPackages: [],
  surveyPoints: [
    {
      id: "pivot-rtk",
      label: "Pivot center repeated shot",
      role: "pivot_center",
      projected: p(410, 360),
      observedAt,
      source: "external_gnss",
      confidence: "rtk_fixed",
      rtk: {
        fixType: "rtk_fixed",
        satellites: 18,
        hdop: 0.6,
        vdop: 0.9,
        pdop: 1.1,
        correctionAgeSeconds: 1.2,
        horizontalAccuracyMeters: 0.018,
        verticalAccuracyMeters: 0.034,
        baseStationId: "BASE-LOCAL",
        roverId: "ROVER-01",
        nmeaQualityCode: 4,
      },
    },
    {
      id: "road-draft",
      label: "Road digitized from imagery",
      role: "obstacle",
      projected: p(114, 420),
      observedAt,
      source: "manual",
      confidence: "imagery_digitized",
      notes: "Planning-grade until field checked.",
    },
  ],
};

interface SampleVariantInput {
  id: string;
  name: string;
  description: string;
  pivotCenter: XY;
  waterSource: XY;
  powerSource: XY;
  machine: PivotProject["machine"];
  mapFeatures?: PivotProject["mapFeatures"];
}

export interface SampleDesignProject {
  id: string;
  label: string;
  description: string;
  reviewStatus: "needs_review" | "curated";
  project: PivotProject;
}

function copyPoint(point: XY): XY {
  return { x: point.x, y: point.y };
}

function cloneSampleSurveyPoints(pivotCenter: XY): PivotProject["surveyPoints"] {
  return sampleProject.surveyPoints.map((point) => ({
    ...point,
    projected: point.role === "pivot_center" ? copyPoint(pivotCenter) : copyPoint(point.projected),
    rtk: point.rtk ? { ...point.rtk } : undefined,
    wgs84: point.wgs84 ? { ...point.wgs84 } : undefined,
  }));
}

function curatedSampleVariant(input: SampleVariantInput): PivotProject {
  return {
    ...sampleProject,
    id: input.id,
    name: input.name,
    settings: defaultProjectSettings(),
    fieldBoundary: sampleProject.fieldBoundary.map(copyPoint),
    pivotCenter: copyPoint(input.pivotCenter),
    waterSource: copyPoint(input.waterSource),
    powerSource: copyPoint(input.powerSource),
    machine: {
      ...input.machine,
      endGunAngleRanges: input.machine.endGunAngleRanges?.map((range) => ({ ...range })),
      spanLengthsMeters: [...input.machine.spanLengthsMeters],
      sweep: { ...input.machine.sweep },
      cornerArm: input.machine.cornerArm
        ? {
          ...input.machine.cornerArm,
          sourceRefs: input.machine.cornerArm.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
        }
        : undefined,
    },
    obstacles: sampleProject.obstacles.map((obstacle) => ({
      ...obstacle,
      polygon: obstacle.polygon.map(copyPoint),
    })),
    surveyPoints: cloneSampleSurveyPoints(input.pivotCenter),
    mapPackages: [],
    mapFeatures: input.mapFeatures?.map((feature) => ({
      ...feature,
      geometry: feature.geometry.type === "Point"
        ? { type: "Point", point: copyPoint(feature.geometry.point) }
        : feature.geometry.type === "Circle"
          ? { type: "Circle", center: copyPoint(feature.geometry.center), radiusMeters: feature.geometry.radiusMeters }
          : feature.geometry.type === "LineString"
            ? { type: "LineString", vertices: feature.geometry.vertices.map(copyPoint) }
            : { type: "Polygon", vertices: feature.geometry.vertices.map(copyPoint) },
      properties: feature.properties ? { ...feature.properties } : undefined,
    })),
  };
}

export const improvedFullCircleSampleProject = curatedSampleVariant({
  id: "sample-improved-full-circle",
  name: "Improved Full-Circle Conflict Clear",
  description: "A shorter full-circle concept shifted away from the access road and service pad to remove modeled hard conflicts.",
  pivotCenter: p(360, 520),
  waterSource: p(324, 484),
  powerSource: p(142, 668),
  machine: {
    ...sampleProject.machine,
    id: "sample-improved-full-circle-machine",
    name: "Conflict-clear four-span concept pivot",
    endGunAngleRanges: [],
    endGunThrowMeters: 0,
    sweep: { mode: "full_circle" },
  },
});

export const partialSweepNearRoadSampleProject = curatedSampleVariant({
  id: "sample-partial-sweep-road-structure",
  name: "Partial Sweep Near Road And Pad",
  description: "A part-circle concept near the road and pump pad that intentionally keeps warning surfaces visible for operator review.",
  pivotCenter: p(545, 320),
  waterSource: p(503, 282),
  powerSource: p(325, 490),
  machine: {
    ...sampleProject.machine,
    id: "sample-partial-sweep-road-machine",
    name: "Road-adjacent partial-sweep pivot",
    endGunAngleRanges: [],
    endGunThrowMeters: 0,
    sweep: {
      mode: "partial_circle",
      startAngleDegrees: 330,
      stopAngleDegrees: 145,
      direction: "counterclockwise",
    },
  },
});

export const endGunShutoffArcSampleProject = curatedSampleVariant({
  id: "sample-end-gun-shutoff-arc",
  name: "End-Gun Shutoff Arc",
  description: "A conflict-clear full-circle concept with a limited end-gun arc for wetting only the reviewed sector.",
  pivotCenter: p(470, 520),
  waterSource: p(428, 482),
  powerSource: p(250, 690),
  machine: {
    ...sampleProject.machine,
    id: "sample-end-gun-shutoff-machine",
    name: "Four-span pivot with end-gun shutoff arc",
    spanLengthsMeters: [45, 45, 45, 45],
    endGunThrowMeters: 26,
    endGunAngleRanges: [
      { startAngleDegrees: 30, stopAngleDegrees: 150, direction: "counterclockwise" },
    ],
    sweep: { mode: "full_circle" },
  },
});

export const advisoryCornerArmSampleProject = curatedSampleVariant({
  id: "sample-advisory-corner-arm-footprint",
  name: "Advisory Corner-Arm Footprint",
  description: "A field-edge concept with an operator/vendor corner-arm footprint recorded as evidence only.",
  pivotCenter: p(430, 570),
  waterSource: p(392, 530),
  powerSource: p(214, 706),
  machine: {
    ...sampleProject.machine,
    id: "sample-corner-arm-machine",
    name: "Corner-arm advisory footprint pivot",
    spanLengthsMeters: [45, 45, 45, 45],
    endGunAngleRanges: [],
    endGunThrowMeters: 0,
    cornerArm: {
      id: "sample-vflex-advisory-corner-arm",
      name: "Sample VFlex advisory corner arm",
      advisoryOnly: true,
      lengthMeters: 91,
      guidanceType: "gps_guidance",
      sequencingType: "electronic",
      orientation: "operator_supplied",
      confidence: "user_estimated",
      operatorConfirmedAt: "2026-06-05T00:00:00.000Z",
      notes: "Sample advisory configuration for UI review only; proprietary kinematics are not modeled.",
      sourceRefs: [
        {
          sourceId: "SRC-VALLEY-VFLEX-CORNER",
          title: "Valley VFlex Corner",
          url: "https://www.valleyirrigation.com/vflex-corner",
          checkedAt: "2026-06-05",
          limit: "Manufacturer public feature/specification reference only; CPLayout does not certify compatibility or kinematics.",
        },
      ],
    },
    sweep: { mode: "full_circle" },
  },
  mapFeatures: [
    {
      id: "sample-corner-arm-footprint",
      name: "Advisory corner-arm footprint",
      kind: "corner_swing_limit",
      geometry: {
        type: "Polygon",
        vertices: [p(612, 598), p(708, 632), p(682, 724), p(596, 706)],
      },
      confidence: "user_estimated",
      notes: "Operator/vendor footprint evidence only; manufacturer kinematics are not modeled.",
      properties: {
        canonicalGeometryMutation: false,
        evidenceOnly: true,
      },
    },
  ],
});

const fullScopeDemoOrigin: XY = { x: 503200, y: 4505200 };

function d(x: number, y: number): XY {
  return { x: fullScopeDemoOrigin.x + x, y: fullScopeDemoOrigin.y + y };
}

export const fullScopeMultiPivotCostDemoProject: PivotProject = {
  id: "sample-full-scope-multi-pivot-cost-demo",
  name: "Full-Scope Multi-Pivot Cost Demo",
  projectCrs: "EPSG:32613",
  unitSystem: "us_survey_feet",
  settings: defaultProjectSettings(),
  fieldBoundary: [
    d(0, 60),
    d(1260, 0),
    d(1380, 390),
    d(1160, 850),
    d(540, 940),
    d(-70, 760),
  ],
  pivotCenter: d(430, 440),
  waterSource: d(180, 398),
  powerSource: d(118, 770),
  machine: {
    id: "sample-full-scope-machine-template",
    name: "Cost comparison full-scope template",
    spanLengthsMeters: [54, 54, 54],
    overhangMeters: 10,
    endGunThrowMeters: 18,
    towerClearanceBufferMeters: 5,
    machineClearanceBufferMeters: 9,
    sweep: { mode: "full_circle" },
  },
  obstacles: [
    {
      id: "sample-demo-equipment-yard",
      name: "Equipment yard hard-blocking review",
      kind: "building",
      polygon: [d(610, 360), d(690, 360), d(700, 438), d(604, 448)],
      bufferMeters: 14,
      hardConflict: true,
      noSpray: true,
      confidence: "user_estimated",
    },
    {
      id: "sample-demo-canal-buffer",
      name: "Canal no-spray crossing review",
      kind: "canal",
      polygon: [d(960, 110), d(1012, 112), d(964, 790), d(918, 784)],
      bufferMeters: 8,
      hardConflict: false,
      noSpray: true,
      confidence: "imagery_digitized",
    },
  ],
  surveyPoints: [
    {
      id: "sample-demo-existing-pivot-evidence",
      label: "Existing pivot evidence",
      role: "pivot_center",
      projected: d(430, 440),
      observedAt,
      source: "manual",
      confidence: "user_estimated",
      notes: "Synthetic demo pivot evidence for advisory comparison only.",
    },
    {
      id: "sample-demo-second-pivot-evidence",
      label: "Bender second pivot evidence at drive tower",
      role: "pivot_center",
      projected: d(500, 430),
      observedAt,
      source: "manual",
      confidence: "user_estimated",
      notes: "Synthetic projected-XY second-pivot evidence for opportunity-envelope demo only.",
    },
  ],
  mapPackages: [],
  mapFeatures: [
    {
      id: "sample-demo-west-planning-boundary",
      name: "West planning boundary",
      kind: "planning_boundary",
      geometry: { type: "Polygon", vertices: [d(10, 80), d(625, 40), d(596, 870), d(-50, 720)] },
      confidence: "user_estimated",
      notes: "Synthetic full-scope planning boundary; advisory review only.",
      properties: { canonicalGeometryMutation: false, evidenceOnly: true },
    },
    {
      id: "sample-demo-east-planning-boundary",
      name: "East planning boundary",
      kind: "planning_boundary",
      geometry: { type: "Polygon", vertices: [d(640, 40), d(1270, 26), d(1320, 430), d(1110, 820), d(610, 876)] },
      confidence: "user_estimated",
      notes: "Synthetic second planning boundary for compiled full-scope review.",
      properties: { canonicalGeometryMutation: false, evidenceOnly: true },
    },
    {
      id: "sample-demo-west-machine-zone",
      name: "West machine zone",
      kind: "machine_zone",
      geometry: { type: "Circle", center: d(290, 390), radiusMeters: 214 },
      confidence: "user_estimated",
      notes: "Synthetic advisory machine-zone review feature.",
      properties: { canonicalGeometryMutation: false, evidenceOnly: true },
    },
    {
      id: "sample-demo-center-machine-zone",
      name: "Center machine zone",
      kind: "machine_zone",
      geometry: { type: "Circle", center: d(720, 720), radiusMeters: 204 },
      confidence: "user_estimated",
      notes: "Synthetic advisory machine-zone review feature.",
      properties: { canonicalGeometryMutation: false, evidenceOnly: true },
    },
    {
      id: "sample-demo-east-machine-zone",
      name: "East machine zone",
      kind: "machine_zone",
      geometry: { type: "Circle", center: d(1220, 540), radiusMeters: 206 },
      confidence: "user_estimated",
      notes: "Synthetic advisory machine-zone review feature.",
      properties: { canonicalGeometryMutation: false, evidenceOnly: true },
    },
    {
      id: "sample-demo-linear-path",
      name: "North lateral path comparison",
      kind: "linear_move_path",
      geometry: { type: "LineString", vertices: [d(170, 735), d(1090, 706)] },
      confidence: "user_estimated",
      notes: "Synthetic projected-XY path for advisory linear/lateral strategy scoring only.",
      properties: { canonicalGeometryMutation: false, evidenceOnly: true },
    },
    {
      id: "sample-demo-measurement-line",
      name: "Existing wheel track measure",
      kind: "measurement_line",
      geometry: { type: "LineString", vertices: [d(430, 440), d(598, 440)] },
      confidence: "user_estimated",
      notes: "Synthetic machine-length evidence line; not a certified survey.",
      properties: { derivedLengthMeters: 168, canonicalGeometryMutation: false, evidenceOnly: true },
    },
    {
      id: "sample-demo-pump",
      name: "Pump station",
      kind: "pump_location",
      geometry: { type: "Point", point: d(180, 398) },
      confidence: "user_estimated",
      notes: "Synthetic utility evidence.",
    },
    {
      id: "sample-demo-well",
      name: "Well source",
      kind: "well_location",
      geometry: { type: "Point", point: d(146, 384) },
      confidence: "user_estimated",
      notes: "Synthetic well evidence for obstacle/utility review.",
    },
    {
      id: "sample-demo-pipeline",
      name: "Underground pipeline",
      kind: "underground_pipeline",
      geometry: { type: "LineString", vertices: [d(146, 384), d(430, 440), d(676, 472), d(1044, 490)] },
      confidence: "user_estimated",
      notes: "Synthetic pipe route evidence; advisory only.",
    },
    {
      id: "sample-demo-wire",
      name: "Underground control wire",
      kind: "underground_wire",
      geometry: { type: "LineString", vertices: [d(118, 770), d(430, 440), d(676, 472)] },
      confidence: "user_estimated",
      notes: "Synthetic wire route evidence; advisory only.",
    },
    {
      id: "sample-demo-power-line",
      name: "Power line",
      kind: "power_line",
      geometry: { type: "LineString", vertices: [d(118, 770), d(1110, 820)] },
      confidence: "user_estimated",
      notes: "Synthetic overhead power evidence; advisory only.",
    },
    {
      id: "sample-demo-power-pole",
      name: "Power pole",
      kind: "power_pole",
      geometry: { type: "Point", point: d(500, 440) },
      confidence: "user_estimated",
      notes: "Synthetic pole evidence.",
    },
  ],
};

export const sampleDesignProjects: SampleDesignProject[] = [
  {
    id: "sample-baseline-needs-review",
    label: "Needs Review Baseline",
    description: "Existing sample with road and service-pad warnings preserved for comparison.",
    reviewStatus: "needs_review",
    project: sampleProject,
  },
  {
    id: "sample-improved-full-circle",
    label: "Improved Full-Circle",
    description: improvedFullCircleSampleProject.name,
    reviewStatus: "curated",
    project: improvedFullCircleSampleProject,
  },
  {
    id: "sample-partial-sweep-road-structure",
    label: "Partial Sweep Near Road",
    description: partialSweepNearRoadSampleProject.name,
    reviewStatus: "curated",
    project: partialSweepNearRoadSampleProject,
  },
  {
    id: "sample-end-gun-shutoff-arc",
    label: "End-Gun Shutoff Arc",
    description: endGunShutoffArcSampleProject.name,
    reviewStatus: "curated",
    project: endGunShutoffArcSampleProject,
  },
  {
    id: "sample-advisory-corner-arm-footprint",
    label: "Corner-Arm Footprint",
    description: advisoryCornerArmSampleProject.name,
    reviewStatus: "curated",
    project: advisoryCornerArmSampleProject,
  },
  {
    id: "sample-full-scope-multi-pivot-cost-demo",
    label: "Full-Scope Cost Demo",
    description: fullScopeMultiPivotCostDemoProject.name,
    reviewStatus: "curated",
    project: fullScopeMultiPivotCostDemoProject,
  },
];

const publicProofObservedAt = "2026-05-29T00:00:00-06:00";
const publicProofCrs = "EPSG:32613";
const publicProofReference = {
  latitude: 39.899125,
  longitude: -104.070061,
};
const publicProofPivotCenter = {
  latitude: 39.902125,
  longitude: -104.070061,
};
const publicProofCenter = projectLonLatToXy(publicProofPivotCenter, publicProofCrs);
const improvedPublicProofCenter: XY = {
  x: 579493.1558109762,
  y: 4417310.984825163,
};

function offset(center: XY, x: number, y: number): XY {
  return { x: center.x + x, y: center.y + y };
}

function circlePolygon(center: XY, radiusMeters: number, segments = 144): XY[] {
  return Array.from({ length: segments }, (_, index) => {
    const theta = (index / segments) * Math.PI * 2;
    return {
      x: center.x + radiusMeters * Math.cos(theta),
      y: center.y + radiusMeters * Math.sin(theta),
    };
  });
}

function bufferedLinePolygon(start: XY, end: XY, halfWidthMeters: number): XY[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [start, end, end, start];
  const nx = (-dy / length) * halfWidthMeters;
  const ny = (dx / length) * halfWidthMeters;
  return [
    { x: start.x + nx, y: start.y + ny },
    { x: end.x + nx, y: end.y + ny },
    { x: end.x - nx, y: end.y - ny },
    { x: start.x - nx, y: start.y - ny },
  ];
}

export const publicCenterPivotProofSource = {
  name: "Wikimedia Commons center pivot irrigation in Adams County, Colorado",
  url: "https://commons.wikimedia.org/wiki/File:Center_pivot_irrigation_in_Colorado.JPG",
  author: "Jeffrey Beall",
  license: "CC BY 4.0",
  referenceCoordinate: publicProofReference,
  proofPivotCenter: publicProofPivotCenter,
} as const;

export const realCenterPivotProofProject: PivotProject = {
  id: "public-adams-county-center-pivot-proof",
  name: "Public Adams County Center Pivot Proof",
  projectCrs: publicProofCrs,
  unitSystem: "us_survey_feet",
  settings: defaultProjectSettings(),
  fieldBoundary: [
    offset(publicProofCenter, -430, -414),
    offset(publicProofCenter, 430, -414),
    offset(publicProofCenter, 430, 420),
    offset(publicProofCenter, -430, 420),
  ],
  pivotCenter: publicProofCenter,
  waterSource: offset(publicProofCenter, 58, -330),
  powerSource: offset(publicProofCenter, 238, -324),
  machine: {
    id: "public-proof-seven-tower",
    name: "Seven-tower public proof pivot",
    spanLengthsMeters: [54, 54, 54, 54, 54, 54, 54],
    overhangMeters: 18,
    endGunThrowMeters: 12,
    towerClearanceBufferMeters: 5,
    machineClearanceBufferMeters: 8,
    sweep: { mode: "full_circle" },
  },
  obstacles: [
    {
      id: "diagonal-service-track-no-spray",
      name: "Diagonal service track no-spray",
      kind: "road",
      polygon: bufferedLinePolygon(offset(publicProofCenter, -280, -250), offset(publicProofCenter, 246, 234), 9),
      bufferMeters: 9,
      hardConflict: true,
      noSpray: true,
      confidence: "imagery_digitized",
    },
    {
      id: "south-county-road-setback",
      name: "South county road setback",
      kind: "road",
      polygon: [
        offset(publicProofCenter, -334, -414),
        offset(publicProofCenter, 334, -414),
        offset(publicProofCenter, 334, -368),
        offset(publicProofCenter, -334, -368),
      ],
      bufferMeters: 12,
      hardConflict: true,
      noSpray: true,
      confidence: "imagery_digitized",
    },
  ],
  mapPackages: [],
  mapFeatures: [
    {
      id: "visible-access-lane",
      name: "Visible access lane to pivot",
      kind: "access_lane",
      geometry: {
        type: "LineString",
        vertices: [offset(publicProofCenter, -285, -255), offset(publicProofCenter, 248, 236)],
      },
      confidence: "imagery_digitized",
      notes: "Aligned to the visible diagonal service track in the public proof imagery.",
    },
    {
      id: "power-feed-from-112th",
      name: "Power feed from 112th Avenue",
      kind: "power_line",
      geometry: {
        type: "LineString",
        vertices: [offset(publicProofCenter, 238, -324), offset(publicProofCenter, 0, 0)],
      },
      confidence: "user_estimated",
      notes: "Planning-grade utility route for export proof only.",
    },
  ],
  surveyPoints: [
    {
      id: "public-proof-pivot-center",
      label: "Public proof pivot center",
      role: "pivot_center",
      projected: publicProofCenter,
      wgs84: publicProofPivotCenter,
      observedAt: publicProofObservedAt,
      source: "manual",
      confidence: "imagery_digitized",
      notes: "Calibrated from Google Earth visual proof near the Wikimedia public reference coordinate.",
    },
    {
      id: "wikimedia-reference-coordinate",
      label: "Wikimedia public reference coordinate",
      role: "control",
      projected: projectLonLatToXy(publicProofReference, publicProofCrs),
      wgs84: publicProofReference,
      observedAt: publicProofObservedAt,
      source: "imported",
      confidence: "imagery_digitized",
      notes: "Camera/location coordinate from the public Wikimedia Commons source page; used as a reproducible reference, not as the pivot center.",
    },
  ],
};

export const improvedCenterPivotProofProject: PivotProject = {
  ...realCenterPivotProofProject,
  id: "public-adams-county-center-pivot-improved-proof",
  name: "Public Adams County Improved Pivot Proof",
  pivotCenter: improvedPublicProofCenter,
  obstacles: realCenterPivotProofProject.obstacles.filter((obstacle) => obstacle.id === "south-county-road-setback"),
  mapFeatures: (realCenterPivotProofProject.mapFeatures ?? []).map((feature) => {
    if (feature.id === "power-feed-from-112th" && feature.geometry.type === "LineString") {
      return {
        ...feature,
        geometry: {
          type: "LineString",
          vertices: [realCenterPivotProofProject.powerSource, improvedPublicProofCenter],
        },
      };
    }
    return feature;
  }),
  surveyPoints: realCenterPivotProofProject.surveyPoints.map((point) => {
    if (point.role !== "pivot_center") return point;
    return {
      ...point,
      projected: improvedPublicProofCenter,
      notes: "Improved visual-inspection pivot center for Google Earth companion proof; projected XY remains canonical.",
    };
  }),
};
