import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";

import {
  createGoogleEarthKmz,
  extractKmlFromKmz,
  GOOGLE_EARTH_KMZ_DOC_FILENAME,
  readGoogleEarthKmlFile,
} from "./projectKmlArchive";

const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>-104,40,0</coordinates></Point></Placemark></Document></kml>`;
const kmz = createGoogleEarthKmz(kml);

assert.ok(kmz.byteLength > kml.length / 2);
assert.equal(extractKmlFromKmz(kmz), kml);

const readKmz = readGoogleEarthKmlFile({ filename: "field.kmz", bytes: kmz, mimeType: "application/vnd.google-earth.kmz" });
assert.equal(readKmz.kind, "kmz");
assert.equal(readKmz.kmlText, kml);
assert.equal(readKmz.warnings.length, 0);

const readKml = readGoogleEarthKmlFile({ filename: "field.kml", bytes: strToU8(kml), mimeType: "application/vnd.google-earth.kml+xml" });
assert.equal(readKml.kind, "kml");
assert.equal(readKml.kmlText, kml);

const nestedKmz = zipSync({ "folder/field.kml": strToU8(kml) });
const readNested = readGoogleEarthKmlFile({ filename: "nested.kmz", bytes: nestedKmz });
assert.equal(readNested.kind, "kmz");
assert.match(readNested.warnings.join("\n"), /doc\.kml/);

assert.throws(
  () => extractKmlFromKmz(zipSync({ "a.kml": strToU8(kml), "b.kml": strToU8(kml) })),
  /exactly one KML/,
);
assert.throws(
  () => extractKmlFromKmz(zipSync({ "notes.txt": strToU8("not kml") })),
  /must contain a KML/,
);
assert.throws(
  () => extractKmlFromKmz(zipSync({ "../doc.kml": strToU8(kml) })),
  /unsafe KML path/,
);

assert.equal(GOOGLE_EARTH_KMZ_DOC_FILENAME, "doc.kml");

console.log("project KML archive tests passed");
