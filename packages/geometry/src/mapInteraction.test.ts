import assert from "node:assert/strict";

import {
  createDrawingMapState,
  createInitialViewport,
  reduceDrawingMapState,
  screenPointToWorld,
  snapPointToGeometry,
  viewportToSvgViewBox,
  visibleWidthMeters,
} from "./mapInteraction";
import { planOnlineImageryTiles } from "./onlineImagery";

const viewport = createInitialViewport({ minX: 0, minY: 0, maxX: 1000, maxY: 800 }, 1);
const state = createDrawingMapState(viewport);

const withVertex = reduceDrawingMapState(state, { type: "add_draft_vertex", vertex: { x: 10, y: 20 } });
assert.equal(withVertex.draftVertices.length, 1);
assert.equal(withVertex.geometryRevision, 1);

const panned = reduceDrawingMapState(withVertex, { type: "pan", delta: { x: 100, y: -50 } });
assert.deepEqual(panned.draftVertices, withVertex.draftVertices);
assert.equal(panned.geometryRevision, withVertex.geometryRevision);
assert.equal(panned.viewport.center.x, withVertex.viewport.center.x + 100);

const zoomed = reduceDrawingMapState(panned, { type: "zoom", factor: 2 });
assert.deepEqual(zoomed.draftVertices, withVertex.draftVertices);
assert.equal(visibleWidthMeters(zoomed.viewport), 500);
assert.match(viewportToSvgViewBox(zoomed.viewport), /^350 -550 500 400$/);

const dragged = reduceDrawingMapState(zoomed, {
  type: "pan_screen",
  dxPixels: 100,
  dyPixels: -50,
  screenWidthPixels: 500,
  screenHeightPixels: 800,
});
assert.equal(dragged.viewport.center.x, zoomed.viewport.center.x - 100);
assert.equal(dragged.viewport.center.y, zoomed.viewport.center.y - 25);
assert.deepEqual(dragged.draftVertices, withVertex.draftVertices);

const centerWorld = screenPointToWorld(viewport, { xPixels: 500, yPixels: 400 }, { widthPixels: 1000, heightPixels: 800 });
assert.deepEqual(centerWorld, viewport.center);

const topLeftWorld = screenPointToWorld(viewport, { xPixels: 0, yPixels: 0 }, { widthPixels: 1000, heightPixels: 800 });
assert.deepEqual(topLeftWorld, { x: 0, y: 800 });

const editMode = reduceDrawingMapState(dragged, { type: "set_mode", mode: "edit_vertices" });
assert.equal(editMode.mode, "edit_vertices");
assert.equal(editMode.geometryRevision, dragged.geometryRevision);

const measureMode = reduceDrawingMapState(dragged, { type: "set_mode", mode: "measure" });
assert.equal(measureMode.mode, "measure");
assert.equal(measureMode.geometryRevision, dragged.geometryRevision);

const imageryPlan = planOnlineImageryTiles({
  viewport,
  projectCrs: "EPSG:32613",
  providerId: "usgs_imagery_only",
  maxTiles: 8,
});
assert.match(imageryPlan.error ?? "", /local reprojection adapter/);
assert.equal(imageryPlan.tiles.length, 0);

const webMercatorImageryPlan = planOnlineImageryTiles({
  viewport,
  projectCrs: "EPSG:3857",
  providerId: "usgs_imagery_only",
  maxTiles: 8,
});
assert.equal(webMercatorImageryPlan.error, null);
assert.ok(webMercatorImageryPlan.tiles.length > 0);
assert.ok(webMercatorImageryPlan.tiles.length <= 8);
assert.match(webMercatorImageryPlan.tiles[0].href, /USGSImageryOnly\/MapServer\/tile\/\d+\/\d+\/\d+/);
assert.ok(Number.isFinite(webMercatorImageryPlan.tiles[0].projectedBounds.minX));
assert.ok(webMercatorImageryPlan.tiles.every((tile) => tile.z <= webMercatorImageryPlan.provider.maxZoom));

const snappedVertex = snapPointToGeometry(
  { x: 10.5, y: 19.8 },
  { vertices: [{ x: 10, y: 20 }], rings: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]] },
  { vertexSnapToleranceMeters: 1, featureSnapToleranceMeters: 3 },
);
assert.equal(snappedVertex?.kind, "vertex");
assert.deepEqual(snappedVertex?.point, { x: 10, y: 20 });

const snappedFeature = snapPointToGeometry(
  { x: 50, y: 2 },
  { rings: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]] },
  { vertexSnapToleranceMeters: 1, featureSnapToleranceMeters: 3 },
);
assert.equal(snappedFeature?.kind, "feature");
assert.deepEqual(snappedFeature?.point, { x: 50, y: 0 });

const unsnapped = snapPointToGeometry(
  { x: 50, y: 10 },
  { rings: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]] },
  { vertexSnapToleranceMeters: 1, featureSnapToleranceMeters: 3 },
);
assert.equal(unsnapped, null);

console.log("map interaction tests passed");
