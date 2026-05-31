import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
