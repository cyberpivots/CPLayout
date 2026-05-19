import assert from "node:assert/strict";

import {
  createDrawingMapState,
  createInitialViewport,
  reduceDrawingMapState,
  screenPointToWorld,
  viewportToSvgViewBox,
  visibleWidthMeters,
} from "./mapInteraction";

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
});
assert.equal(dragged.viewport.center.x, zoomed.viewport.center.x - 100);
assert.equal(dragged.viewport.center.y, zoomed.viewport.center.y - 50);
assert.deepEqual(dragged.draftVertices, withVertex.draftVertices);

const centerWorld = screenPointToWorld(viewport, { xPixels: 500, yPixels: 400 }, { widthPixels: 1000, heightPixels: 800 });
assert.deepEqual(centerWorld, viewport.center);

const topLeftWorld = screenPointToWorld(viewport, { xPixels: 0, yPixels: 0 }, { widthPixels: 1000, heightPixels: 800 });
assert.deepEqual(topLeftWorld, { x: 0, y: 800 });

const editMode = reduceDrawingMapState(dragged, { type: "set_mode", mode: "edit_vertices" });
assert.equal(editMode.mode, "edit_vertices");
assert.equal(editMode.geometryRevision, dragged.geometryRevision);

console.log("map interaction tests passed");
