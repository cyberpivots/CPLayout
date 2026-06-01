import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { readFile } from "node:fs/promises";

const routeScreens = [
  { nav: "workspace-nav-dashboard", screen: "dashboard-workspace" },
  { nav: "workspace-nav-map", screen: "map-view" },
  { nav: "workspace-nav-survey", screen: "survey-view" },
  { nav: "workspace-nav-review", screen: "review-view" },
  { nav: "workspace-nav-files", screen: "files-view" },
  { nav: "workspace-nav-settings", screen: "settings-view" },
] as const;

test.beforeEach(async ({ page }, testInfo) => {
  await captureConsoleFailures(page);
  const strictOffline = testInfo.title.includes("offline");
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (isAllowedNetworkRequest(url, strictOffline)) {
      void route.continue();
      return;
    }
    void route.abort("blockedbyclient");
  });
});

test("launcher and workspace route sweep stay usable without paid APIs or hidden keys", async ({ page }, testInfo) => {
  const networkLog: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(testInfo.project.use.baseURL ?? "")) networkLog.push(url);
  });

  await page.goto("/");
  await expect(page.getByTestId("launcher-screen")).toBeVisible();
  await expect(page.getByText("CPLayout")).toBeVisible();
  await expect(page.getByText("Projected XY canonical")).toBeVisible();
  await saveScreen(page, testInfo, "launcher");

  await page.getByRole("button", { name: "Open Sample" }).click();
  await expect(page.getByTestId("workspace-screen")).toBeVisible();

  for (const routeScreen of routeScreens) {
    await page.getByTestId(routeScreen.nav).click();
    await expect(page.getByTestId(routeScreen.screen)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await saveScreen(page, testInfo, routeScreen.screen);
  }

  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByTestId("browser-map-workbench")).toBeVisible();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByTestId("browser-workflow-design")).toBeVisible();
  await page.getByTestId("browser-tool-boundary").click();
  await page.getByLabel("CPLayout MapLibre imagery workbench").click({ position: { x: 180, y: 180 } });
  await expect(page.getByText(/draw boundary .* 1 draft pts/)).toBeVisible();
  await page.getByTestId("browser-tool-pan").click();
  await expect(page.getByText("pan · 0 draft pts")).toBeVisible();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByTestId("browser-tool-utility").click();
  await expect(page.getByText("measure · 0 draft pts · line needs 2 pts")).toBeVisible();
  await page.getByRole("button", { name: "Pump" }).click();
  await expect(page.getByText("measure · 0 draft pts · point saves on map click")).toBeVisible();
  await page.getByTestId("browser-tool-pan").click();
  await page.getByTestId("browser-workflow-layout").click();
  await expect(page.getByText("Review Layout: map gestures and inspection only. Geometry callbacks are blocked.")).toBeVisible();
  await page.getByLabel("CPLayout MapLibre imagery workbench").click({ position: { x: 120, y: 160 } });
  await expect(page.getByText("Review Layout is read-only; switch to Edit Geometry before changing project geometry.")).toBeVisible();
  await expect(page.getByText("Saved")).toBeVisible();
  await expectNoOverlap(page, "browser-map-status-hud", "browser-map-attribution-hud");

  const disallowed = networkLog.filter((url) => !isAllowedExternalProofRequest(url));
  expect(disallowed).toEqual([]);
});

test("public proof map features can select the side-panel editor without geometry mutation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Real Proof" }).click();
  await expect(page.getByTestId("workspace-screen")).toBeVisible();
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByTestId("browser-map-workbench")).toBeVisible();
  await expect(page.getByText("Saved")).toBeVisible();

  const workbench = page.getByLabel("CPLayout MapLibre imagery workbench");
  const box = await workbench.boundingBox();
  expect(box, "map workbench bounding box").not.toBeNull();
  if (!box) return;
  await workbench.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByText(/Selected map feature/)).toBeVisible();
  await expect(page.getByLabel("Selected map feature name")).toHaveValue("Power feed from 112th Avenue");
  await expect(page.getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "public-proof-feature-selected");
});

test("workspace rail exposes the selected view state", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await expect(page.getByTestId("workspace-nav-dashboard")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByTestId("workspace-nav-dashboard")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("workspace-nav-map")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("workspace-nav-review").click();
  await expect(page.getByTestId("workspace-nav-map")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("workspace-nav-review")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "workspace-rail-selected-state");
});

test("workspace compact rail stays within the viewport while switching routes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  const viewport = page.viewportSize();
  expect(viewport, "viewport").not.toBeNull();
  const railBox = await page.getByTestId("workspace-rail").boundingBox();
  expect(railBox, "workspace rail bounding box").not.toBeNull();
  if (!viewport || !railBox) return;
  expect(railBox.x).toBeGreaterThanOrEqual(0);
  expect(railBox.x + railBox.width).toBeLessThanOrEqual(viewport.width + 2);
  for (const routeScreen of routeScreens) {
    await page.getByTestId(routeScreen.nav).click();
    await expect(page.getByTestId(routeScreen.screen)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "workspace-compact-rail-overflow");
});

test("survey rtk receiver starts closed without mutating the project", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-survey").click();
  await expect(page.getByTestId("survey-view")).toBeVisible();
  await expect(page.getByTestId("rtk-gate-badge").getByText("Gate closed")).toBeVisible();
  await expect(page.getByTestId("rtk-gate-reasons")).toHaveText(/fix unknown is below required rtk_fixed/);
  await expect(page.getByTestId("rtk-status")).toHaveText(/No receiver connected|Web Serial is unavailable/);
  await expect(page.getByRole("button", { name: "Capture Survey Point" })).toBeDisabled();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "survey-rtk-gate-closed");
});

test("survey rtk closed gate disables geometry capture controls", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-survey").click();
  await expect(page.getByTestId("rtk-gate-badge").getByText("Gate closed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Boundary (0)" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Commit Boundary" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add Obstacle (0)" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Commit Obstacle" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add Feature Vertex (0)" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save Line Feature" })).toBeDisabled();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "survey-rtk-geometry-disabled");
});

test("survey rtk role selection stays local while gate is closed", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-survey").click();
  await page.getByRole("button", { name: "Pivot", exact: true }).click();
  await page.getByRole("button", { name: "Water", exact: true }).click();
  await page.getByRole("button", { name: "Power", exact: true }).click();
  await expect(page.getByTestId("rtk-gate-badge").getByText("Gate closed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture Survey Point" })).toBeDisabled();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toHaveCount(0);
  await saveScreen(page, testInfo, "survey-rtk-role-local");
});

test("survey rtk map feature selection stays local while gate is closed", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-survey").click();
  await page.getByRole("button", { name: "Pump point" }).click();
  await expect(page.getByRole("button", { name: "Save Point Feature" })).toBeDisabled();
  await page.getByRole("button", { name: "Power line" }).click();
  await expect(page.getByRole("button", { name: "Add Feature Vertex (0)" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save Line Feature" })).toBeDisabled();
  await expect(page.getByTestId("rtk-gate-badge").getByText("Gate closed")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toHaveCount(0);
  await saveScreen(page, testInfo, "survey-rtk-feature-local");
});

test("browser boundary commit keeps projected geometry status explicit", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByTestId("browser-map-workbench")).toBeVisible();
  await page.getByTestId("browser-tool-boundary").click();
  const map = page.getByLabel("CPLayout MapLibre imagery workbench");
  await map.click({ position: { x: 160, y: 180 } });
  await map.click({ position: { x: 240, y: 180 } });
  await map.click({ position: { x: 220, y: 250 } });
  await expect(page.getByText(/draw boundary .* 3 draft pts/)).toBeVisible();
  await page.getByTestId("browser-action-commit").click();
  await expect(page.getByText("Committed field boundary with 3 projected XY vertices.")).toBeVisible();
  await expect(page.getByText("draw boundary · 0 draft pts")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toBeVisible();
  await saveScreen(page, testInfo, "boundary-commit-status");
});

test("browser utility line save keeps projected feature status explicit", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByTestId("browser-map-workbench")).toBeVisible();
  await page.getByTestId("browser-tool-utility").click();
  const map = page.getByLabel("CPLayout MapLibre imagery workbench");
  await map.click({ position: { x: 170, y: 210 } });
  await map.click({ position: { x: 250, y: 230 } });
  await expect(page.getByText(/measure .* 2 draft pts .* line needs 2 pts/)).toBeVisible();
  await page.getByTestId("browser-action-save-feature").click();
  await expect(page.getByText("Saved underground pipeline line with 2 projected XY vertices as a map feature.")).toBeVisible();
  await expect(page.getByText("measure · 0 draft pts · line needs 2 pts")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toBeVisible();
  await saveScreen(page, testInfo, "utility-line-save-status");
});

test("browser utility point save keeps projected feature status explicit", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByTestId("browser-map-workbench")).toBeVisible();
  await page.getByTestId("browser-tool-utility").click();
  await page.getByRole("button", { name: "Pump" }).click();
  await expect(page.getByText("measure · 0 draft pts · point saves on map click")).toBeVisible();
  await page.getByLabel("CPLayout MapLibre imagery workbench").click({ position: { x: 190, y: 220 } });
  await expect(page.getByText("Saved pump location point in projected XY as a map feature.")).toBeVisible();
  await expect(page.getByText("measure · 0 draft pts · point saves on map click")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toBeVisible();
  await saveScreen(page, testInfo, "utility-point-save-status");
});

test("offline browser map workbench stays usable with external requests blocked", async ({ page }, testInfo) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(testInfo.project.use.baseURL ?? "") && !url.startsWith("data:") && !url.startsWith("blob:")) {
      externalRequests.push(url);
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await expect(page.getByTestId("workspace-screen")).toBeVisible();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await expect(page.getByText(/project exports keep projected\/local XY geometry/)).toBeVisible();
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByTestId("browser-map-workbench")).toBeVisible();
  await expect(page.getByText("EPSG:32613 canonical geometry · offline overlay")).toBeVisible();
  await expect(page.getByText(/No live imagery source enabled/)).toBeVisible();
  await page.getByTestId("browser-tool-boundary").click();
  await page.getByLabel("CPLayout MapLibre imagery workbench").click({ position: { x: 160, y: 180 } });
  await expect(page.getByText(/draw boundary .* 1 draft pts/)).toBeVisible();
  expect(externalRequests).toEqual([]);
  await saveScreen(page, testInfo, "offline-map-workbench");
});

test("settings custom imagery guidance blocks hidden-key assumptions", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Custom open" }).click();
  await expect(page.getByText(/Custom sources must be open, no-key/)).toBeVisible();
  await expect(page.getByText(/Hidden keys, tokens, paid hosted imagery/)).toBeVisible();
  await expect(page.getByLabel("Tile URL")).toBeVisible();
  await saveScreen(page, testInfo, "settings-custom-imagery-guidance");
});

test("settings custom imagery rejects credentialed tile templates", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/Live imagery disabled/);
  await page.getByRole("button", { name: "Custom open" }).click();
  await page.getByLabel("Source name").fill("Open County Tiles");
  await page.getByLabel("Tile URL").fill("https://example.org/tiles/{z}/{x}/{y}.png?token=secret");
  await page.getByLabel("Coverage").fill("County open imagery coverage");
  await page.getByLabel("Attribution").fill("County GIS imagery");
  await page.getByLabel("License").fill("Open imagery license");
  await expect(page.getByText(/cannot include hidden API keys, tokens, signatures, or subscription credentials/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply custom open imagery source" })).toBeDisabled();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/Live imagery disabled/);
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-custom-imagery-token-rejected");
});

test("settings custom imagery applies no-key local tile templates", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await page.getByRole("button", { name: "Custom open" }).click();
  await page.getByLabel("Source name").fill("Local Open Tiles");
  await page.getByLabel("Tile URL").fill("http://127.0.0.1:8088/tiles/{z}/{x}/{y}.png");
  await page.getByLabel("Coverage").fill("Operator-hosted local tile cache");
  await page.getByLabel("Attribution").fill("Operator open imagery");
  await page.getByLabel("License").fill("Open local imagery license");
  await expect(page.getByText("Custom source ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply custom open imagery source" })).toBeEnabled();
  await page.getByRole("button", { name: "Apply custom open imagery source" }).click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/Operator-hosted local tile cache/);
  await expect(page.getByTestId("settings-imagery-guardrail-summary")).toHaveText(/imagery is reference-only and never canonical geometry/);
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-custom-imagery-local-applied");
});

test("settings offline imagery guardrail exposes local-only export boundary", async ({ page }, testInfo) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(testInfo.project.use.baseURL ?? "") && !url.startsWith("data:") && !url.startsWith("blob:")) {
      externalRequests.push(url);
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/no external tile source is requested/);
  await expect(page.getByTestId("settings-imagery-guardrail-summary")).toHaveText(/project exports keep projected\/local XY geometry/);
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  expect(externalRequests).toEqual([]);
  await saveScreen(page, testInfo, "settings-offline-imagery-guardrail");
});

test("settings tile cap stepper clamps interactive preview budget", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  const tileCap = page.getByTestId("settings-tile-cap-stepper");
  await expect(tileCap.getByTestId("settings-tile-cap-stepper-value")).toHaveText("64");
  await expect(tileCap.getByRole("button", { name: "Decrease Tile cap" })).toBeVisible();
  await expect(tileCap.getByRole("button", { name: "Increase Tile cap" })).toBeVisible();

  for (let index = 0; index < 9; index += 1) {
    await tileCap.getByRole("button", { name: "Increase Tile cap" }).click();
  }
  await expect(tileCap.getByTestId("settings-tile-cap-stepper-value")).toHaveText("128");

  for (let index = 0; index < 16; index += 1) {
    await tileCap.getByRole("button", { name: "Decrease Tile cap" }).click();
  }
  await expect(tileCap.getByTestId("settings-tile-cap-stepper-value")).toHaveText("8");
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-tile-cap-stepper");
});

test("settings offline package guardrail keeps network tiles disabled", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  const packageSummary = page.getByTestId("settings-offline-package-summary");
  await expect(packageSummary).toHaveText(/Network tiles: disabled/);
  await expect(packageSummary).toHaveText(/Attribution: required/);
  await expect(packageSummary).toHaveText(/Local directory: offline-map-packages/);
  await expect(page.getByRole("button", { name: "PMTILES" })).toBeVisible();
  await expect(page.getByRole("button", { name: "MBTILES" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RASTER TILES" })).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-offline-package-guardrail");
});

test("settings offline package type changes keep local-only guardrails", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  const packageSummary = page.getByTestId("settings-offline-package-summary");
  await page.getByRole("button", { name: "MBTILES" }).click();
  await expect(packageSummary).toHaveText(/Network tiles: disabled/);
  await expect(packageSummary).toHaveText(/Attribution: required/);
  await page.getByRole("button", { name: "RASTER TILES" }).click();
  await expect(packageSummary).toHaveText(/Network tiles: disabled/);
  await expect(packageSummary).toHaveText(/Local directory: offline-map-packages/);
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-offline-package-type-change");
});

test("settings map style changes do not enable online imagery", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/Live imagery disabled/);
  await page.getByRole("button", { name: "Imagery", exact: true }).click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/Live imagery disabled/);
  await expect(page.getByTestId("settings-imagery-guardrail-summary")).toHaveText(/project exports keep projected\/local XY geometry/);
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByText("EPSG:32613 canonical geometry · offline overlay")).toBeVisible();
  await expect(page.getByText(/No live imagery source enabled/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-map-style-offline-imagery");
});

test("settings offline imagery off blocks map tile requests after live source is active", async ({ page }, testInfo) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(testInfo.project.use.baseURL ?? "") && !url.startsWith("data:") && !url.startsWith("blob:")) {
      externalRequests.push(url);
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/live preview only/);
  await page.getByRole("button", { name: "Off" }).click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/no external tile source is requested/);
  await page.getByTestId("workspace-nav-map").click();
  await expect(page.getByText(/No live imagery source enabled/)).toBeVisible();
  expect(externalRequests).toEqual([]);
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-offline-map-no-tile-requests");
});

test("settings browser-local imagery settings stay out of project zip", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "MBTILES" }).click();
  await page.getByRole("button", { name: "Custom open" }).click();
  await page.getByLabel("Source name").fill("Local Open Tiles");
  await page.getByLabel("Tile URL").fill("http://127.0.0.1:8088/tiles/{z}/{x}/{y}.png");
  await page.getByLabel("Coverage").fill("Operator-hosted local tile cache");
  await page.getByLabel("Attribution").fill("Operator open imagery");
  await page.getByLabel("License").fill("Open local imagery license");
  await page.getByRole("button", { name: "Apply custom open imagery source" }).click();
  await expect(page.getByTestId("settings-imagery-source-summary")).toHaveText(/Operator-hosted local tile cache/);
  await page.getByTestId("workspace-nav-files").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP" }).click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  expect(archivePath, "download path").not.toBeNull();
  if (!archivePath) return;
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  const projectJsonBytes = archive["project.json"];
  expect(projectJsonBytes, "project.json in archive").toBeDefined();
  if (!projectJsonBytes) return;
  const projectJson = strFromU8(projectJsonBytes);
  expect(projectJson).not.toContain("onlineImagery");
  expect(projectJson).not.toContain("tileUrlTemplate");
  expect(projectJson).not.toContain("Local Open Tiles");
  expect(projectJson).not.toContain("offline-map-packages");
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "settings-local-imagery-excluded-from-zip");
});

test("dashboard next step separates imagery-off from live-source confirmation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await page.getByTestId("workspace-nav-dashboard").click();
  await expect(page.getByTestId("dashboard-workspace")).toBeVisible();
  await expect(page.getByText("Next: keep offline overlay or enable approved no-key imagery in Settings.")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-imagery-off-next-step");
});

test("dashboard offline imagery path advances after imagery walkthrough progress", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await page.getByTestId("workspace-nav-dashboard").click();
  await expect(page.getByText("Next: keep offline overlay or enable approved no-key imagery in Settings.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Complete Setup Imagery walkthrough checkpoint" }).click();
  await expect(page.getByText("Next: trace or review the field boundary in Edit Geometry.")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-offline-imagery-progress");
});

test("dashboard next step advances after imagery walkthrough progress", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await expect(page.getByText("Next: confirm imagery attribution and live-source status.")).toBeVisible();
  await page.getByTestId("walkthrough-module-imagery").click();
  await expect(page.getByText("Next: trace or review the field boundary in Edit Geometry.")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-next-step-after-imagery-progress");
});

test("dashboard export readiness reflects unsaved browser geometry edits", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-map").click();
  await page.getByTestId("browser-tool-boundary").click();
  const map = page.getByLabel("CPLayout MapLibre imagery workbench");
  await map.click({ position: { x: 160, y: 180 } });
  await map.click({ position: { x: 240, y: 180 } });
  await map.click({ position: { x: 220, y: 250 } });
  await page.getByTestId("browser-action-commit").click();
  await page.getByTestId("workspace-nav-dashboard").click();
  const exportCard = page.getByTestId("dashboard-card-export");
  await expect(exportCard.getByText("Save before export")).toBeVisible();
  await expect(exportCard.getByText(/Project ZIP excludes browser-local imagery settings/)).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-export-dirty-state");
});

test("files status keeps the canonical archive message visible", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  const status = page.getByTestId("files-status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status.getByText(/Browser local storage/)).toBeVisible();
  await expect(status.getByText(/Project ZIP is the canonical project package/)).toBeVisible();
  await expect(page.getByText("Project Files")).toBeVisible();
  await expect(page.getByText("Canonical Project Package", { exact: true })).toBeVisible();
  await saveScreen(page, testInfo, "files-status-canonical-package");
});

test("files actions expose accessible browser buttons", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await expect(page.getByRole("button", { name: "Save Local" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export ZIP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import ZIP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import KML/KMZ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export KML" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export KMZ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import GeoJSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import CSV" })).toBeVisible();
  await saveScreen(page, testInfo, "files-action-buttons");
});

test("files export zip downloads the canonical project package", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.center-pivot\.zip$/);
  const status = page.getByTestId("files-status");
  await expect(status.getByText(/Downloaded .*\.center-pivot\.zip/)).toBeVisible();
  await expect(status.getByText(/Project ZIP is the canonical project package/)).toHaveCount(0);
  await saveScreen(page, testInfo, "files-export-zip-download");
});

test("files export kml downloads visual interchange data without runtime claims", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export KML" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.google-earth\.kml$/);
  const status = page.getByTestId("files-status");
  await expect(status.getByText(/Downloaded .*\.google-earth\.kml/)).toBeVisible();
  await expect(status.getByText(/Exported \d+ Google Earth feature/)).toBeVisible();
  await expect(status.getByText(/render proof/i)).toHaveCount(0);
  await saveScreen(page, testInfo, "files-export-kml-download");
});

test("files export kmz downloads a doc-kml archive without runtime claims", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export KMZ" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.google-earth\.kmz$/);
  const status = page.getByTestId("files-status");
  await expect(status.getByText(/Downloaded .*\.google-earth\.kmz/)).toBeVisible();
  await expect(status.getByText(/KMZ contains doc\.kml with \d+ feature/)).toBeVisible();
  await expect(status.getByText(/render proof/i)).toHaveCount(0);
  await saveScreen(page, testInfo, "files-export-kmz-download");
});

test("files projected geojson import dirties the project with projected xy status", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-geojson-import-input").fill(JSON.stringify({
    type: "FeatureCollection",
    properties: { projectCrs: "EPSG:32613" },
    features: [{
      type: "Feature",
      properties: { layerType: "field_boundary" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [501000, 4506000],
          [501300, 4506000],
          [501300, 4506300],
          [501000, 4506300],
          [501000, 4506000],
        ]],
      },
    }],
  }));
  await page.getByRole("button", { name: "Import GeoJSON" }).click();
  await expect(page.getByTestId("files-status").getByText(/Imported projected GeoJSON boundary/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await saveScreen(page, testInfo, "files-geojson-import-projected-boundary");
});

test("files projected geojson import can be saved locally", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-geojson-import-input").fill(JSON.stringify({
    type: "FeatureCollection",
    properties: { projectCrs: "EPSG:32613" },
    features: [{
      type: "Feature",
      properties: { layerType: "field_boundary" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [501000, 4506000],
          [501300, 4506000],
          [501300, 4506300],
          [501000, 4506300],
          [501000, 4506000],
        ]],
      },
    }],
  }));
  await page.getByRole("button", { name: "Import GeoJSON" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await page.getByRole("button", { name: "Save Local *" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByTestId("files-status").getByText(/Browser local storage/)).toBeVisible();
  await saveScreen(page, testInfo, "files-geojson-import-save-local");
});

test("files projected geojson import clears the paste field after success", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  const input = page.getByTestId("files-geojson-import-input");
  await input.fill(JSON.stringify({
    type: "FeatureCollection",
    properties: { projectCrs: "EPSG:32613" },
    features: [{
      type: "Feature",
      properties: { layerType: "field_boundary" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [501000, 4506000],
          [501300, 4506000],
          [501300, 4506300],
          [501000, 4506300],
          [501000, 4506000],
        ]],
      },
    }],
  }));
  await page.getByRole("button", { name: "Import GeoJSON" }).click();
  await expect(page.getByTestId("files-status").getByText(/Imported projected GeoJSON boundary/)).toBeVisible();
  await expect(input).toHaveValue("");
  await saveScreen(page, testInfo, "files-geojson-import-clears-input");
});

test("files geojson import rejects wgs84 as canonical geometry", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-geojson-import-input").fill(JSON.stringify({
    type: "FeatureCollection",
    properties: { projectCrs: "EPSG:4326" },
    features: [{
      type: "Feature",
      properties: { layerType: "field_boundary" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-104.1, 40.1],
          [-104.0, 40.1],
          [-104.0, 40.2],
          [-104.1, 40.2],
          [-104.1, 40.1],
        ]],
      },
    }],
  }));
  await page.getByRole("button", { name: "Import GeoJSON" }).click();
  await expect(page.getByTestId("files-status").getByText(/WGS84 is an input\/display layer only/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "files-geojson-wgs84-rejected");
});

test("files rejected geojson import preserves the paste field for correction", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  const input = page.getByTestId("files-geojson-import-input");
  const rejectedGeoJson = JSON.stringify({
    type: "FeatureCollection",
    properties: { projectCrs: "EPSG:4326" },
    features: [{
      type: "Feature",
      properties: { layerType: "field_boundary" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-104.1, 40.1],
          [-104.0, 40.1],
          [-104.0, 40.2],
          [-104.1, 40.2],
          [-104.1, 40.1],
        ]],
      },
    }],
  });
  await input.fill(rejectedGeoJson);
  await page.getByRole("button", { name: "Import GeoJSON" }).click();
  await expect(page.getByTestId("files-status").getByText(/WGS84 is an input\/display layer only/)).toBeVisible();
  await expect(input).toHaveValue(rejectedGeoJson);
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "files-geojson-rejected-preserves-input");
});

test("files survey csv import dirties the project with projected point status", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-survey-csv-import-input").fill("id,label,role,x,y,source,confidence\np1,Point 1,control,501010,4506010,imported,rtk_fixed\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByTestId("files-status").getByText(/Imported 1 survey point/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await saveScreen(page, testInfo, "files-survey-csv-import-point");
});

test("files survey csv import can be saved locally", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-survey-csv-import-input").fill("id,label,role,x,y,source,confidence\np1,Point 1,control,501010,4506010,imported,rtk_fixed\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await page.getByRole("button", { name: "Save Local *" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByTestId("files-status").getByText(/Browser local storage/)).toBeVisible();
  await saveScreen(page, testInfo, "files-survey-csv-import-save-local");
});

test("files survey csv import clears the paste field after success", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  const input = page.getByTestId("files-survey-csv-import-input");
  await input.fill("id,label,role,x,y,source,confidence\np1,Point 1,control,501010,4506010,imported,rtk_fixed\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByTestId("files-status").getByText(/Imported 1 survey point/)).toBeVisible();
  await expect(input).toHaveValue("");
  await saveScreen(page, testInfo, "files-survey-csv-import-clears-input");
});

test("files survey csv import rejects missing projected xy columns", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-survey-csv-import-input").fill("id,label,longitude,latitude\np1,No XY,-104,40\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByTestId("files-status").getByText(/projected x and y columns/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "files-survey-csv-missing-xy-rejected");
});

test("survey view reflects imported projected survey csv evidence", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-survey-csv-import-input").fill("id,label,role,x,y,source,confidence\nsurvey-import-rtk-float,Imported Float,water_source,501030,4506030,imported,rtk_float\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByTestId("files-status").getByText(/Imported 1 survey point/)).toBeVisible();
  await page.getByTestId("workspace-nav-survey").click();
  await expect(page.getByTestId("survey-metric-points")).toContainText("3");
  await expect(page.getByTestId("survey-metric-rtk-fixed")).toContainText("1");
  await expect(page.getByTestId("survey-metric-draft-inputs")).toContainText("2");
  await expect(page.getByTestId("survey-point-survey-import-rtk-float").getByText("Imported Float")).toBeVisible();
  await expect(page.getByTestId("survey-point-survey-import-rtk-float").getByText(/water_source .* imported .* rtk_float/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await saveScreen(page, testInfo, "survey-imported-csv-evidence");
});

test("survey point promotion writes projected water source after explicit action", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-survey-csv-import-input").fill("id,label,role,x,y,source,confidence\nsurvey-water-promote,Imported Water,water_source,501030,4506030,imported,rtk_fixed\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByRole("button", { name: "Save Local *" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await page.getByTestId("workspace-nav-survey").click();
  const importedPoint = page.getByTestId("survey-point-survey-water-promote");
  await expect(importedPoint.getByText("Imported Water")).toBeVisible();
  await importedPoint.getByRole("button", { name: "Set Water from Imported Water" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await page.getByTestId("workspace-nav-files").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP" }).click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  expect(archivePath, "download path").not.toBeNull();
  if (!archivePath) return;
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  const projectJsonBytes = archive["project.json"];
  expect(projectJsonBytes, "project.json in archive").toBeDefined();
  if (!projectJsonBytes) return;
  const projectDocument = JSON.parse(strFromU8(projectJsonBytes)) as { project?: { waterSource?: { x?: number; y?: number } } };
  expect(projectDocument.project?.waterSource).toEqual({ x: 501030, y: 4506030 });
  await saveScreen(page, testInfo, "survey-water-promotion-export");
});

test("survey point delete removes imported evidence from canonical export", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-survey-csv-import-input").fill("id,label,role,x,y,source,confidence\nsurvey-delete-me,Delete Me,note,501050,4506050,imported,rtk_float\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByRole("button", { name: "Save Local *" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await page.getByTestId("workspace-nav-survey").click();
  const importedPoint = page.getByTestId("survey-point-survey-delete-me");
  await expect(importedPoint.getByText("Delete Me")).toBeVisible();
  await importedPoint.getByRole("button", { name: "Delete survey point Delete Me" }).click();
  await expect(importedPoint).toHaveCount(0);
  await expect(page.getByTestId("survey-metric-points")).toContainText("2");
  await expect(page.getByTestId("survey-metric-draft-inputs")).toContainText("1");
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await page.getByTestId("workspace-nav-files").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP" }).click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  expect(archivePath, "download path").not.toBeNull();
  if (!archivePath) return;
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  const projectJsonBytes = archive["project.json"];
  expect(projectJsonBytes, "project.json in archive").toBeDefined();
  if (!projectJsonBytes) return;
  const projectDocument = JSON.parse(strFromU8(projectJsonBytes)) as { project?: { surveyPoints?: { id?: string }[] } };
  expect(projectDocument.project?.surveyPoints?.some((point) => point.id === "survey-delete-me")).toBe(false);
  await saveScreen(page, testInfo, "survey-delete-export");
});

test("survey rtk float import counts as draft input", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New" }).click();
  await page.getByTestId("workspace-nav-files").click();
  await page.getByTestId("files-survey-csv-import-input").fill("id,label,role,x,y,source,confidence\nfloat-only,Float Only,control,501010,4506010,imported,rtk_float\n");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByTestId("workspace-nav-survey").click();
  await expect(page.getByTestId("survey-metric-points")).toContainText("3");
  await expect(page.getByTestId("survey-metric-rtk-fixed")).toContainText("1");
  await expect(page.getByTestId("survey-metric-draft-inputs")).toContainText("2");
  await expect(page.getByTestId("survey-point-float-only").getByText(/control .* imported .* rtk_float/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await saveScreen(page, testInfo, "survey-rtk-float-planning-grade");
});

test("survey point row actions expose point-specific accessible names", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-survey").click();
  await expect(page.getByRole("button", { name: "Set Pivot from Pivot center repeated shot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete survey point Pivot center repeated shot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete survey point Road digitized from imagery" })).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "survey-point-accessible-actions");
});

test("dashboard dirty geometry priority outranks imagery-off guidance", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-settings").click();
  await page.getByRole("button", { name: "Off" }).click();
  await page.getByTestId("workspace-nav-map").click();
  await page.getByTestId("browser-tool-boundary").click();
  const map = page.getByLabel("CPLayout MapLibre imagery workbench");
  await map.click({ position: { x: 160, y: 180 } });
  await map.click({ position: { x: 240, y: 180 } });
  await map.click({ position: { x: 220, y: 250 } });
  await page.getByTestId("browser-action-commit").click();
  await page.getByTestId("workspace-nav-dashboard").click();
  await expect(page.getByText("Next: save local edits and export a project package.")).toBeVisible();
  await expect(page.getByTestId("dashboard-card-imagery").getByText("Live imagery disabled")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-dirty-over-imagery-off");
});

test("dashboard walkthrough progress stays local and export-ready", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("0/7 modules")).toBeVisible();
  await page.getByTestId("walkthrough-module-imagery").click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("1/7 modules")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByTestId("dashboard-card-export").getByText("Ready to package")).toBeVisible();
  await expect(page.getByText("Progress is local-only and is never written into PivotProject or project archives.")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-walkthrough-local-progress");
});

test("dashboard walkthrough modules expose checkbox state and keyboard activation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  const imagery = page.getByRole("checkbox", { name: "Complete Setup Imagery walkthrough checkpoint" });
  await expect(imagery).toBeVisible();
  await expect(imagery).not.toBeChecked();
  await imagery.focus();
  await page.keyboard.press("Space");
  const completedImagery = page.getByRole("checkbox", { name: "Clear Setup Imagery walkthrough checkpoint" });
  await expect(completedImagery).toBeChecked();
  const boundary = page.getByRole("checkbox", { name: "Complete Trace Boundary walkthrough checkpoint" });
  await boundary.click();
  await expect(page.getByRole("checkbox", { name: "Clear Trace Boundary walkthrough checkpoint" })).toBeChecked();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("2/7 modules")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-walkthrough-accessible-controls");
});

test("dashboard walkthrough progress is scoped to the active project", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("walkthrough-module-imagery").click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("1/7 modules")).toBeVisible();
  await page.getByTestId("dashboard-recent-projects").getByRole("button", { name: "Real Proof" }).click();
  await expect(page.getByText("Public Adams County Center Pivot Proof", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("0/7 modules")).toBeVisible();
  await page.getByTestId("dashboard-recent-projects").getByRole("button", { name: "Open Sample" }).click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("1/7 modules")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-walkthrough-project-scope");
});

test("dashboard walkthrough reset only clears the active project", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("walkthrough-module-imagery").click();
  await page.getByTestId("walkthrough-module-boundary").click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("2/7 modules")).toBeVisible();
  await page.getByTestId("dashboard-recent-projects").getByRole("button", { name: "Real Proof" }).click();
  await page.getByTestId("walkthrough-module-survey").click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("1/7 modules")).toBeVisible();
  await page.getByRole("button", { name: "Reset walkthrough progress for active project" }).click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("0/7 modules")).toBeVisible();
  await page.getByTestId("dashboard-recent-projects").getByRole("button", { name: "Open Sample" }).click();
  await expect(page.getByTestId("dashboard-card-walkthrough").getByText("2/7 modules")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-walkthrough-reset-project-scope");
});

test("dashboard review warnings expose actionable layout guidance", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  const warnings = page.getByTestId("dashboard-review-warnings");
  await expect(warnings.getByText("Review Warnings")).toBeVisible();
  await expect(warnings.getByText("1 obstacle or exclusion zone intersects the modeled wet area.")).toBeVisible();
  await expect(warnings.getByText("1 obstacle conflict detected.")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-review-warning-guidance");
});

test("dashboard review warnings can open review without geometry mutation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("dashboard-review-warnings").getByRole("button", { name: "Open Review" }).click();
  await expect(page.getByTestId("review-view")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText(/Saved online imagery in project: no/)).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-review-warning-open-review");
});

test("expert review findings label evidence gates and actions", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-review").click();
  await expect(page.getByTestId("review-view")).toBeVisible();
  await expect(page.getByText("Evidence").first()).toBeVisible();
  await expect(page.getByText("Acceptance Gate").first()).toBeVisible();
  await expect(page.getByText("Actions").first()).toBeVisible();
  await expect(page.getByText(/Saved online imagery in project: no/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "expert-review-evidence-labels");
});

test("expert review recommendation preview does not dirty or apply geometry", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-review").click();
  await page.getByRole("button", { name: "Generate Pivot Candidates" }).click();
  await expect(page.getByText(/Generated .* pivot candidate.* No geometry was applied./)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByRole("button", { name: /Preview recommendation/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Accept recommendation/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply projected XY geometry from recommendation/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Reject recommendation/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Defer recommendation/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Preview recommendation/ }).first().click();
  await expect(page.getByRole("button", { name: /Stop previewing recommendation/ })).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toHaveCount(0);
  await saveScreen(page, testInfo, "expert-review-preview-no-mutation");
});

test("expert review accept records a decision without geometry mutation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-review").click();
  await page.getByRole("button", { name: "Generate Pivot Candidates" }).click();
  await page.getByRole("button", { name: /Accept recommendation/ }).first().click();
  await expect(page.getByText(/Accept recorded .* projected XY geometry was not changed/)).toBeVisible();
  await expect(page.getByText(/accepted/i).first()).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toHaveCount(0);
  await saveScreen(page, testInfo, "expert-review-accept-no-mutation");
});

test("expert review reject records a decision without geometry mutation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-review").click();
  await page.getByRole("button", { name: "Generate Pivot Candidates" }).click();
  await page.getByRole("button", { name: /Reject recommendation/ }).first().click();
  await expect(page.getByText(/Reject recorded .* projected XY geometry was not changed/)).toBeVisible();
  await expect(page.getByText(/rejected/i).first()).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toHaveCount(0);
  await saveScreen(page, testInfo, "expert-review-reject-no-mutation");
});

test("expert review defer records a decision without geometry mutation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-review").click();
  await page.getByRole("button", { name: "Generate Pivot Candidates" }).click();
  await page.getByRole("button", { name: /Defer recommendation/ }).first().click();
  await expect(page.getByText(/Defer recorded .* projected XY geometry was not changed/)).toBeVisible();
  await expect(page.getByText(/deferred/i).first()).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toHaveCount(0);
  await saveScreen(page, testInfo, "expert-review-defer-no-mutation");
});

test("expert review apply confirmation does not dirty before confirm", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-review").click();
  await page.getByRole("button", { name: "Generate Pivot Candidates" }).click();
  await page.getByRole("button", { name: /Apply projected XY geometry from recommendation/ }).first().click();
  const confirm = page.getByTestId("review-apply-confirmation");
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAttribute("role", "alert");
  await expect(confirm).toHaveAttribute("aria-label", "Confirm projected XY apply");
  await expect(confirm.getByText("Confirm Apply")).toBeVisible();
  await expect(page.getByText(/Projected XY/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply XY" })).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Unsaved edits")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText(/Apply canceled .* projected XY geometry was not changed/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "expert-review-apply-confirm-no-mutation");
});

test("expert review apply xy marks the project dirty only after confirmation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("workspace-nav-review").click();
  await page.getByRole("button", { name: "Generate Pivot Candidates" }).click();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: /Apply projected XY geometry from recommendation/ }).first().click();
  await expect(page.getByTestId("review-apply-confirmation")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Apply XY" }).click();
  await expect(page.getByText(/Applied projected XY geometry .* Save Local persists the edited project/)).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Unsaved edits")).toBeVisible();
  await expect(page.getByTestId("review-apply-confirmation")).toHaveCount(0);
  await saveScreen(page, testInfo, "expert-review-apply-xy-dirty");
});

test("dashboard review warnings can inspect the map without geometry mutation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByTestId("dashboard-review-warnings").getByRole("button", { name: "Inspect Map" }).click();
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByTestId("browser-map-workbench")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await expect(page.getByText("Review Layout: map gestures and inspection only. Geometry callbacks are blocked.")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-review-warning-inspect-map");
});

test("dashboard recent-project empty state keeps start actions visible", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  const recentProjects = page.getByTestId("dashboard-recent-projects");
  await expect(recentProjects.getByText("Recent Projects")).toBeVisible();
  await expect(recentProjects.getByText("No saved browser projects yet.")).toBeVisible();
  await expect(recentProjects.getByRole("button", { name: "Create New" })).toBeVisible();
  await expect(recentProjects.getByRole("button", { name: "Open Sample" })).toBeVisible();
  await expect(recentProjects.getByRole("button", { name: "Real Proof" })).toBeVisible();
  await expect(recentProjects.getByRole("button", { name: "Improved Review" })).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-recent-project-empty-state");
});

test("dashboard recent-project row can reopen a saved browser project", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Sample" }).click();
  await page.getByRole("button", { name: /^Save$/ }).click();
  const recentProjects = page.getByTestId("dashboard-recent-projects");
  const sampleRow = recentProjects.getByRole("button", { name: "Open recent project North Quarter Concept Layout" });
  await expect(sampleRow).toBeVisible();
  await page.getByRole("button", { name: "Create New" }).click();
  await expect(page.getByText("Untitled Field Layout", { exact: true }).first()).toBeVisible();
  await sampleRow.click();
  await expect(page.getByText("North Quarter Concept Layout", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Opened North Quarter Concept Layout.")).toBeVisible();
  await expect(page.getByTestId("project-save-state").getByText("Saved")).toBeVisible();
  await saveScreen(page, testInfo, "dashboard-recent-project-reopen");
});

async function captureConsoleFailures(page: Page): Promise<void> {
  page.on("console", (message) => {
    if (message.type() === "error") {
      throw new Error(`Browser console error: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    throw error;
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
}

async function saveScreen(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`${label}.png`),
  });
}

async function expectNoOverlap(page: Page, firstTestId: string, secondTestId: string): Promise<void> {
  const first = await page.getByTestId(firstTestId).boundingBox();
  const second = await page.getByTestId(secondTestId).boundingBox();
  expect(first, `${firstTestId} bounding box`).not.toBeNull();
  expect(second, `${secondTestId} bounding box`).not.toBeNull();
  const overlaps = Boolean(first && second
    && first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y);
  expect(overlaps, `${firstTestId} should not overlap ${secondTestId}`).toBe(false);
}

function isAllowedNetworkRequest(url: string, strictOffline = false): boolean {
  if (url.startsWith("http://127.0.0.1:")) return true;
  if (strictOffline) return url.startsWith("data:") || url.startsWith("blob:");
  if (url.startsWith("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/")) return true;
  return url.startsWith("data:") || url.startsWith("blob:");
}

function isAllowedExternalProofRequest(url: string): boolean {
  if (url.startsWith("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/")) return true;
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  return false;
}
