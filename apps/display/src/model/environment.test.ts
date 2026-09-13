import { describe, expect, it } from "vitest";

import { formatBuildVersion } from "./environment.js";

describe("formatBuildVersion", () => {
  it("cuts a release's commit to git's short form", () => {
    expect(formatBuildVersion("9789ba100c03")).toBe("9789ba1");
    expect(formatBuildVersion("9789ba100c03d03b57da07ef62390352676079e3")).toBe("9789ba1");
  });

  it("leaves any other tag as it came", () => {
    expect(formatBuildVersion("dev")).toBe("dev");
    expect(formatBuildVersion("local")).toBe("local");
  });
});
