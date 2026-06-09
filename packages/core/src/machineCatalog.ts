import type { AdvisorySourceReference, AdvisoryTireOption, MachineCatalogSelection, PivotMachine } from "./types";
import { feetToMeters } from "./units";

export interface MachineCatalogPreset {
  id: string;
  manufacturer: string;
  model: string;
  sourceUrl: string;
  sourceAccessedAt: string;
  sourceNote: string;
  spanLengthOptionsMeters: number[];
  overhangOptionsMeters: number[];
  endGunSupported: boolean;
  boosterPumpSupported: boolean;
  cornerArmCompatible: boolean;
  cornerArmOptions?: Array<{
    label: string;
    lengthMeters: number;
    sourceUrl: string;
    sourceNote: string;
  }>;
}

export const MACHINE_CATALOG_PRESETS: MachineCatalogPreset[] = [
  {
    id: "valley-8000-public-preset",
    manufacturer: "Valley",
    model: "8000 Series",
    sourceUrl: "https://www.valleyirrigation.com/8000",
    sourceAccessedAt: "2026-06-02",
    sourceNote: "Public manufacturer page lists 115 ft to 225 ft spans, 9 ft to 100 ft overhangs, and booster pump options.",
    spanLengthOptionsMeters: feetOptions(115, 135, 155, 175, 195, 225),
    overhangOptionsMeters: feetOptions(9, 25, 50, 75, 100),
    endGunSupported: true,
    boosterPumpSupported: true,
    cornerArmCompatible: true,
    cornerArmOptions: [
      {
        label: "Precision Corner 267 ft",
        lengthMeters: feetToMeters(267),
        sourceUrl: "https://valleyirrigation.com/precision-corner",
        sourceNote: "Valley Precision Corner public page lists 267 ft and 287 ft corner length options.",
      },
      {
        label: "Precision Corner 287 ft",
        lengthMeters: feetToMeters(287),
        sourceUrl: "https://valleyirrigation.com/precision-corner",
        sourceNote: "Valley Precision Corner public page lists 267 ft and 287 ft corner length options.",
      },
    ],
  },
  {
    id: "reinke-e3-public-preset",
    manufacturer: "Reinke",
    model: "Electrogator 3",
    sourceUrl: "https://reinke.com/products/center-pivot/electrogator-r-3",
    sourceAccessedAt: "2026-06-02",
    sourceNote: "Public manufacturer page lists E3 span options from 80 ft through 220 ft and boom lengths from 10 ft to 110 ft.",
    spanLengthOptionsMeters: feetOptions(80, 100, 120, 140, 160, 180, 200, 220),
    overhangOptionsMeters: feetOptions(10, 30, 50, 70, 90, 110),
    endGunSupported: true,
    boosterPumpSupported: true,
    cornerArmCompatible: true,
    cornerArmOptions: [
      {
        label: "ESAC 290 ft",
        lengthMeters: feetToMeters(290),
        sourceUrl: "https://reinke.com/products/center-pivot/swing-arm",
        sourceNote: "Reinke ESAC public swing-arm material lists 290 ft and 330 ft lengths.",
      },
      {
        label: "ESAC 330 ft",
        lengthMeters: feetToMeters(330),
        sourceUrl: "https://reinke.com/products/center-pivot/swing-arm",
        sourceNote: "Reinke ESAC public swing-arm material lists 290 ft and 330 ft lengths.",
      },
    ],
  },
  {
    id: "zimmatic-product-guide-public-preset",
    manufacturer: "Lindsay Zimmatic",
    model: "8500/9500 Product Guide",
    sourceUrl: "https://www.lindsay.com/uploads/files/resources/317-Zimmatic_Product_Guide_US_Web_Final_1123.pdf",
    sourceAccessedAt: "2026-06-02",
    sourceNote: "Public product-guide material lists spans from 113 ft to 201 ft and overhangs from 11 ft to 88 ft.",
    spanLengthOptionsMeters: feetOptions(113, 134, 156, 179, 201),
    overhangOptionsMeters: feetOptions(11, 22, 44, 66, 88),
    endGunSupported: true,
    boosterPumpSupported: true,
    cornerArmCompatible: true,
  },
];

const VALLEY_STANDARD_DRIVE_UNIT_SOURCE: AdvisorySourceReference = {
  sourceId: "SRC-VALLEY-STANDARD-DRIVE-UNIT-PUBLIC",
  title: "Valley Standard Drive Unit",
  url: "https://valleyirrigation.com/standard-drive-unit",
  checkedAt: "2026-06-09",
  limit: "Public tire option labels only; not a field-specific tire recommendation, RPM preset, soil compaction certification, or LRDU/SDU compatibility proof.",
};

const VALLEY_8000_SERIES_SOURCE: AdvisorySourceReference = {
  sourceId: "SRC-VALLEY-8000-PUBLIC",
  title: "Valley 8000 Series Center Pivot",
  url: "https://www.valleyirrigation.com/8000",
  checkedAt: "2026-06-09",
  limit: "Public tire option labels only; not a field-specific tire recommendation, RPM preset, or compatibility proof.",
};

export const ADVISORY_DRIVE_UNIT_TIRE_OPTIONS: AdvisoryTireOption[] = [
  tireOption("valley-standard-11-2-24", "11.2-24", VALLEY_STANDARD_DRIVE_UNIT_SOURCE),
  tireOption("valley-standard-16-9-24", "16.9-24", VALLEY_STANDARD_DRIVE_UNIT_SOURCE),
  tireOption("valley-standard-11-2-38", "11.2-38", VALLEY_STANDARD_DRIVE_UNIT_SOURCE),
  tireOption("valley-standard-18-4-26", "18.4-26", VALLEY_STANDARD_DRIVE_UNIT_SOURCE),
  tireOption("valley-standard-14-9-24", "14.9-24", VALLEY_STANDARD_DRIVE_UNIT_SOURCE),
  tireOption("valley-8000-12-4r38", "12.4R38", VALLEY_8000_SERIES_SOURCE),
  tireOption("valley-public-custom-required", "Custom / source required", VALLEY_STANDARD_DRIVE_UNIT_SOURCE, true),
];

export function applyMachineCatalogPreset(machine: PivotMachine, presetId: string): PivotMachine {
  const preset = MACHINE_CATALOG_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error(`Machine catalog preset ${presetId} was not found.`);
  const selectedSpan = preset.spanLengthOptionsMeters[Math.min(2, preset.spanLengthOptionsMeters.length - 1)];
  const selectedOverhang = preset.overhangOptionsMeters[Math.min(1, preset.overhangOptionsMeters.length - 1)];
  const catalogSelection: MachineCatalogSelection = {
    catalogId: preset.id,
    manufacturer: preset.manufacturer,
    model: preset.model,
    sourceUrl: preset.sourceUrl,
    sourceAccessedAt: preset.sourceAccessedAt,
    advisoryOnly: true,
  };
  return {
    ...machine,
    name: `${preset.manufacturer} ${preset.model} advisory build`,
    spanLengthsMeters: [selectedSpan, selectedSpan, selectedSpan],
    overhangMeters: selectedOverhang,
    catalogSelection,
  };
}

function tireOption(id: string, label: string, sourceRef: AdvisorySourceReference, customValueFallback = false): AdvisoryTireOption {
  return {
    id,
    label,
    advisoryOnly: true,
    roleCompatibility: ["lrdu", "sdu"],
    sourceRefs: [sourceRef],
    caveats: [
      "Tire label is source-backed public equipment context only.",
      "Operator/vendor review is required before using the tire choice for clearance, traction, speed, or rutting decisions.",
    ],
    customValueFallback,
  };
}

function feetOptions(...feet: number[]): number[] {
  return feet.map(feetToMeters);
}
