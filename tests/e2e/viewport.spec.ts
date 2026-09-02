import { expect, test, type BrowserContext } from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;

/**
 * The preview draws a fixture with no server behind it, so the same frame comes
 * out every run - which is what makes a screenshot worth comparing at all.
 */
const previewUrl = `${displayUrl}/?preview=1`;

const devices = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "3840x2160", width: 3840, height: 2160 },
  { name: "3440x1440-ultrawide", width: 3440, height: 1440 },
  { name: "iphone-14-landscape", width: 844, height: 390 },
  { name: "iphone-se-landscape", width: 667, height: 375 },
  { name: "ipad", width: 1180, height: 820 },
  { name: "ipad-mini-4x3", width: 1024, height: 768 }
] as const;

/**
 * What a crew can see must not depend on the shape of their glass. The camera
 * reports the slice it is showing, in world units; every device has to report
 * the same one, whatever the bars around it look like.
 */
test("every device is shown the same slice of the world", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  const seen: { name: string; width: number; height: number }[] = [];
  try {
    for (const device of devices) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height }
      });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(previewUrl);
      const world = page.getByTestId("spaceship-world");
      await expect(world).toBeVisible();
      // Let the scene settle on this viewport before it is measured or shot.
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `test-results/viewport/${device.name}.png`,
        animations: "disabled"
      });

      const camera = await page.evaluate(
        () =>
          (
            globalThis as {
              __spaceshipDisplayCamera?: { width: number; height: number; zoom: number };
            }
          ).__spaceshipDisplayCamera
      );
      expect(camera, `${device.name} published no camera`).toBeDefined();
      if (camera === undefined) continue;
      seen.push({
        name: device.name,
        width: camera.width / camera.zoom,
        height: camera.height / camera.zoom
      });
    }

    const first = seen[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    for (const device of seen) {
      expect(device.width, `${device.name} sees a different width`).toBeCloseTo(first.width, 0);
      expect(device.height, `${device.name} sees a different height`).toBeCloseTo(first.height, 0);
    }
  } finally {
    for (const context of contexts) await context.close();
  }
});

/**
 * The module tree is the largest thing the HUD ever puts on screen, and it is
 * capped by a share of the viewport height. A cap alone only decides where the
 * window ends: the cards inside it went on past that edge and off the glass, so
 * on a phone held sideways the last tiers could not be read and could not be
 * reached. They have to stay inside the window, and the window inside the glass.
 */
test("the module tree keeps its cards inside its window on a short screen", async ({ browser }) => {
  const short = { width: 844, height: 390 };
  const context = await browser.newContext({ viewport: short });
  try {
    const page = await context.newPage();
    await page.goto(previewUrl);
    const tree = page.getByLabel("Дерево модулей корабля");
    await expect(tree).toBeVisible();
    // Let the layout settle before it is measured.
    await page.waitForTimeout(500);

    const windowBox = await tree.boundingBox();
    const cardsBox = await page.locator(".module-tree__grid").boundingBox();
    expect(windowBox, "the tree window has no box").not.toBeNull();
    expect(cardsBox, "the tree has no cards").not.toBeNull();
    if (windowBox === null || cardsBox === null) return;

    const windowBottom = windowBox.y + windowBox.height;
    expect(windowBottom, "the window itself runs off the screen").toBeLessThanOrEqual(short.height);
    expect(cardsBox.y + cardsBox.height, "the cards run out past the window").toBeLessThanOrEqual(
      windowBottom + 1
    );
  } finally {
    await context.close();
  }
});
