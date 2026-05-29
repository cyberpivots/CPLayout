import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { exportProjectGoogleEarthKml, sampleProject } from "@cplayout/core";

import {
  createGoogleEarthKmz,
  extractKmlFromKmz,
  GOOGLE_EARTH_KMZ_DOC_FILENAME,
  readGoogleEarthKmlFile,
} from "./projectKmlArchive";

const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>-104,40,0</coordinates></Point></Placemark></Document></kml>`;
const kmz = createGoogleEarthKmz(kml);
const mapFeatureKml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Pipeline A</name><ExtendedData><Data name="cplayoutFeatureType"><value>map_feature</value></Data></ExtendedData><LineString><coordinates>-104,40,0 -104.1,40.1,0</coordinates></LineString></Placemark></Document></kml>`;
const mapFeatureKmz = createGoogleEarthKmz(mapFeatureKml);
const styledKml = exportProjectGoogleEarthKml({
  ...sampleProject,
  mapFeatures: [{
    id: "pipeline-a",
    name: "Pipeline A",
    kind: "underground_pipeline",
    geometry: { type: "LineString", vertices: [sampleProject.waterSource, sampleProject.pivotCenter] },
    confidence: "imagery_digitized",
  }],
}).kml;
const styledKmz = createGoogleEarthKmz(styledKml);

assert.ok(kmz.byteLength > kml.length / 2);
assert.equal(extractKmlFromKmz(kmz), kml);
assert.match(extractKmlFromKmz(mapFeatureKmz), /Pipeline A/);
assert.match(extractKmlFromKmz(mapFeatureKmz), /map_feature/);
assert.match(extractKmlFromKmz(styledKmz), /<Style id="cplayout-field-boundary">/);
assert.match(extractKmlFromKmz(styledKmz), /<styleUrl>#cplayout-map-line-water<\/styleUrl>/);
assert.match(extractKmlFromKmz(styledKmz), /Pipeline A/);
assert.match(extractKmlFromKmz(styledKmz), /<Data name="cplayoutFeatureType"><value>map_feature<\/value><\/Data>/);
assert.doesNotMatch(extractKmlFromKmz(styledKmz), /<href>https?:\/\//);

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
