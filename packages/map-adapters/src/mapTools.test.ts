import assert from "node:assert/strict";

import { MAP_TOOL_CATALOG } from "./mapTools";

assert.deepEqual(
  MAP_TOOL_CATALOG.map((tool) => tool.id),
  ["pan", "edit", "point", "line", "polygon", "circle", "machine", "layers", "calculate"],
);
assert.equal(new Set(MAP_TOOL_CATALOG.map((tool) => tool.id)).size, MAP_TOOL_CATALOG.length);
assert.equal(MAP_TOOL_CATALOG.every((tool) => tool.testID.startsWith("map-tool-")), true);
assert.equal(MAP_TOOL_CATALOG.find((tool) => tool.id === "polygon")?.action.type, "open_panel");
assert.equal(MAP_TOOL_CATALOG.find((tool) => tool.id === "line")?.action.type, "open_panel");
assert.equal(MAP_TOOL_CATALOG.find((tool) => tool.id === "circle")?.action.type, "open_panel");
assert.equal(MAP_TOOL_CATALOG.find((tool) => tool.id === "pan")?.action.type, "activate");
assert.equal(MAP_TOOL_CATALOG.find((tool) => tool.id === "calculate")?.action.type, "command");

console.log("map tool catalog tests passed");
