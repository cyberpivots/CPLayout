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
