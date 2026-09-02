import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;

/** The combat fixture holds the shield raised, and raised is the state that glows. */
const previewUrl = `${displayUrl}/?preview=1`;

/**
 * The raised shield is the only thing on this display drawn through a filter,
 * and Phaser composites a filtered object with a camera of its own. That camera
 * is handed the main camera's size, scroll and zoom - but not where the
 * letterboxed frame sits in the glass, so the glow was drawn from the canvas
 * corner while the hull was drawn from the frame's. The bars are zero only at
 * 16:9, which is why the shield sat on the hull on one monitor and adrift on
 * the next. The two shapes below have bars on the axis 16:9 has none.
 */
const devices = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "ipad-mini-4x3", width: 1024, height: 768 },
  { name: "1720x720-ultrawide", width: 1720, height: 720 }
] as const;

/** A shield a tenth of the frame out of place is already wrong; the bug moves it by a sixth. */
const PLACEMENT_TOLERANCE = 0.01;

interface ShieldMeasurement {
  /** Centroid of the shield's own blue, as a fraction of the frame. */
  readonly x: number;
  readonly y: number;
  readonly pixels: number;
}

/**
 * The HUD is DOM drawn over the canvas, and a screenshot of an element carries
 * whatever covers it. Hidden rather than removed, so the layout the canvas was
 * sized against stays exactly as it was.
 */
const HIDE_HUD_CSS = `
  body * { visibility: hidden; }
  [data-testid="spaceship-world"], [data-testid="spaceship-world"] * { visibility: visible; }
`;

/**
 * These run inside the page. The e2e project compiles against Node types, and
 * one measurement is no reason to pull the whole DOM library into specs that
 * have no other use for it.
 */
interface PixelSurface {
  getContext(contextId: "2d"): {
    drawImage(image: unknown, x: number, y: number): void;
    getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  } | null;
}
declare function createImageBitmap(
  source: unknown
): Promise<{ readonly width: number; readonly height: number }>;
declare const OffscreenCanvas: new (width: number, height: number) => PixelSurface;

test("the raised shield is drawn on the hull on every aspect ratio", async ({ browser }) => {
  test.setTimeout(60_000);
  const contexts: BrowserContext[] = [];
  const seen: { readonly name: string; readonly measured: ShieldMeasurement }[] = [];
  try {
    for (const device of devices) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height }
      });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(previewUrl);
      await expect(page.getByTestId("spaceship-world")).toBeVisible();
      // Let the scene settle on this viewport before it is measured.
      await page.waitForTimeout(500);
      const measured = await measureShield(page);
      expect(measured, `${device.name} showed no shield`).not.toBeNull();
      if (measured === null) continue;
      expect(measured.pixels, `${device.name} matched too little to be the shield`).toBeGreaterThan(
        100
      );
      seen.push({ name: device.name, measured });
    }

    const first = seen[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    for (const device of seen) {
      // Every device is shown the same slice of the world with the ship at its
      // centre, so the shield sits at the same fraction of the frame on all of
      // them. Composited from the canvas corner instead, it moves by the whole
      // bar: a sixth of the frame on a 4:3 tablet, an eighth on an ultrawide.
      expect(
        Math.abs(device.measured.x - first.measured.x),
        `${device.name} draws the shield off to the side`
      ).toBeLessThan(PLACEMENT_TOLERANCE);
      expect(
        Math.abs(device.measured.y - first.measured.y),
        `${device.name} draws the shield off vertically`
      ).toBeLessThan(PLACEMENT_TOLERANCE);
    }
  } finally {
    for (const context of contexts) await context.close();
  }
});

/**
 * Reads the canvas back and finds the shield by its own colour: a blue nothing
 * else in the scene wears, and distinct from the cyan of beams and aim cones,
 * which are far closer to their green than to their blue.
 */
async function measureShield(page: Page): Promise<ShieldMeasurement | null> {
  await page.addStyleTag({ content: HIDE_HUD_CSS });
  const canvas = page.locator('[data-testid="spaceship-world"] canvas');
  await expect(canvas).toBeVisible();
  const shot = (await canvas.screenshot({ animations: "disabled" })).toString("base64");
  const camera = await page.evaluate(
    () =>
      (
        globalThis as {
          __spaceshipDisplayCamera?: { width: number; height: number; zoom: number };
        }
      ).__spaceshipDisplayCamera
  );
  expect(camera, "the display published no camera").toBeDefined();
  if (camera === undefined) return null;

  return page.evaluate(
    async ([encoded, frameWidth, frameHeight]: [string, number, number]) => {
      const response = await fetch(`data:image/png;base64,${encoded}`);
      const bitmap = await createImageBitmap(await response.blob());
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = surface.getContext("2d");
      if (context === null) return null;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let sumX = 0;
      let sumY = 0;
      let pixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 0;
        const green = data[index + 1] ?? 0;
        const blue = data[index + 2] ?? 0;
        // 0x65baff over a near-black arena, bloom included.
        if (blue < 170 || blue - green < 40 || green - red < 50) continue;
        const pixel = index / 4;
        sumX += pixel % bitmap.width;
        sumY += Math.floor(pixel / bitmap.width);
        pixels++;
      }
      if (pixels === 0) return null;
      // Relative to the frame, not to the glass: the bars are not part of the view.
      const originX = (bitmap.width - frameWidth) / 2;
      const originY = (bitmap.height - frameHeight) / 2;
      return {
        x: (sumX / pixels - originX) / frameWidth,
        y: (sumY / pixels - originY) / frameHeight,
        pixels
      };
    },
    [shot, camera.width, camera.height] as [string, number, number]
  );
}
