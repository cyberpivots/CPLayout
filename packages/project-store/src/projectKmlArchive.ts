import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const GOOGLE_EARTH_KMZ_DOC_FILENAME = "doc.kml";
export const GOOGLE_EARTH_KMZ_MAX_BYTES = 25 * 1024 * 1024;

export interface PickedGoogleEarthFile {
  filename: string;
  bytes: Uint8Array;
  mimeType?: string;
}

export interface GoogleEarthKmlFile {
  filename: string;
  kmlText: string;
  kind: "kml" | "kmz";
  warnings: string[];
}

export function createGoogleEarthKmz(kmlText: string): Uint8Array {
  return zipSync({ [GOOGLE_EARTH_KMZ_DOC_FILENAME]: strToU8(kmlText) });
}

export function extractKmlFromKmz(data: Uint8Array): string {
  if (data.byteLength > GOOGLE_EARTH_KMZ_MAX_BYTES) {
    throw new Error("KMZ import is larger than the supported 25 MB limit.");
  }
  const unzipped = unzipSync(data);
  const kmlPaths = Object.keys(unzipped).filter((path) => path.toLowerCase().endsWith(".kml"));
  if (kmlPaths.length === 0) throw new Error("KMZ import must contain a KML file.");
  if (kmlPaths.some(isUnsafeZipPath)) throw new Error("KMZ import contains an unsafe KML path.");
  if (kmlPaths.length > 1) throw new Error("KMZ import must contain exactly one KML file for this CPLayout workflow.");
  const kmlPath = kmlPaths[0];
  return strFromU8(unzipped[kmlPath]);
}

export function readGoogleEarthKmlFile(file: PickedGoogleEarthFile): GoogleEarthKmlFile {
  if (file.bytes.byteLength > GOOGLE_EARTH_KMZ_MAX_BYTES) {
    throw new Error("KML/KMZ import is larger than the supported 25 MB limit.");
  }
  const filename = file.filename || "selected-google-earth-file";
  if (isKmzFile(filename, file.mimeType, file.bytes)) {
    const kmlPath = singleKmlPath(file.bytes);
    return {
      filename,
      kmlText: extractKmlFromKmz(file.bytes),
      kind: "kmz",
      warnings: kmlPath === GOOGLE_EARTH_KMZ_DOC_FILENAME ? [] : [`KMZ used ${kmlPath}; exported CPLayout KMZ files use top-level doc.kml for Google Earth compatibility.`],
    };
  }
  return {
    filename,
    kmlText: strFromU8(file.bytes),
    kind: "kml",
    warnings: [],
  };
}

function singleKmlPath(data: Uint8Array): string {
  const unzipped = unzipSync(data);
  return Object.keys(unzipped).filter((path) => path.toLowerCase().endsWith(".kml"))[0] ?? GOOGLE_EARTH_KMZ_DOC_FILENAME;
}

function isKmzFile(filename: string, mimeType: string | undefined, bytes: Uint8Array): boolean {
  const lowerFilename = filename.toLowerCase();
  const lowerMime = (mimeType ?? "").toLowerCase();
  return lowerFilename.endsWith(".kmz")
    || lowerMime.includes("kmz")
    || lowerMime.includes("google-earth.kmz")
    || (bytes[0] === 0x50 && bytes[1] === 0x4b);
}

function isUnsafeZipPath(path: string): boolean {
  return path.startsWith("/")
    || path.startsWith("\\")
    || path.includes("..")
    || /^[a-zA-Z]:/.test(path);
}
