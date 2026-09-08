import {
  ROOM_REFUSED_AT_CAPACITY,
  ROOM_REFUSED_FOR_MAINTENANCE
} from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { createFailureMessage } from "./roomFailure.js";

describe("createFailureMessage", () => {
  it("names maintenance and a full server apart", () => {
    expect(createFailureMessage(new Error(ROOM_REFUSED_FOR_MAINTENANCE))).toContain(
      "технические работы"
    );
    expect(createFailureMessage(new Error(ROOM_REFUSED_AT_CAPACITY))).toContain("Сервер занят");
  });

  it("asks for a reload when the protocol no longer matches", () => {
    expect(createFailureMessage(new Error("protocol_mismatch"))).toContain("Обновите страницу");
  });

  it("passes an unknown error through, and answers a non-error at all", () => {
    expect(createFailureMessage(new Error("сокет закрыт"))).toBe("сокет закрыт");
    expect(createFailureMessage("строка")).toBe("Не удалось создать комнату.");
  });
});
