import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assetUrl = new URL("../../public/assets/castle-environment-v1.webp", import.meta.url);

describe("castle environment asset", () => {
  it("matches the Android TV texture budget", () => {
    const bytes = readFileSync(assetUrl);

    expect(statSync(assetUrl).size).toBeLessThanOrEqual(2_500_000);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
    expect(readWebpSize(bytes)).toEqual({ width: 1536, height: 864 });
  });
});

function readWebpSize(bytes: Buffer): { width: number; height: number } {
  let chunkOffset = 12;
  while (chunkOffset + 8 <= bytes.length) {
    const chunkType = bytes.toString("ascii", chunkOffset, chunkOffset + 4);
    const chunkLength = bytes.readUInt32LE(chunkOffset + 4);
    const payloadOffset = chunkOffset + 8;

    if (chunkType === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(payloadOffset + 4, 3),
        height: 1 + bytes.readUIntLE(payloadOffset + 7, 3)
      };
    }
    if (chunkType === "VP8 ") {
      return {
        width: bytes.readUInt16LE(payloadOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(payloadOffset + 8) & 0x3fff
      };
    }

    chunkOffset = payloadOffset + chunkLength + (chunkLength % 2);
  }

  throw new Error("WebP dimensions were not found.");
}
