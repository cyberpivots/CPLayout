import { PivotProject } from "./types";
import { defaultProjectSettings } from "./settings";
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
