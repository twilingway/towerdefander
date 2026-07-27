import { signalCommandSchema } from "@town-defenders/protocol";
import { describe, expect, it } from "vitest";

import { createActionId, type RandomSource } from "./actionId.js";

describe("createActionId", () => {
  it("creates a protocol-valid UUID without randomUUID()", () => {
    const randomSource: RandomSource = {
      fill(array) {
        array.set([
          0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
          0xff
        ]);
      }
    };

    const actionId = createActionId(randomSource);

    expect(actionId).toBe("00112233-4455-4677-8899-aabbccddeeff");
    expect(
      signalCommandSchema.safeParse({
        protocolVersion: 1,
        actionId
      }).success
    ).toBe(true);
  });
});
