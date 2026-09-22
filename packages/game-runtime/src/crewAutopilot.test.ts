import {
  createCleanSpaceshipRun,
  createSpaceshipSimulationConfig
} from "@spaceship-defender/game-core";
import { describe, expect, it } from "vitest";

import { createAutopilotMemory, resolveAutopilotProfile } from "./crewPolicy.mjs";
import { driveCrewSeats } from "./crewAutopilot.ts";
import { createDefaultTuning } from "@spaceship-defender/balance-core";

const config = createSpaceshipSimulationConfig();

function profileFor() {
  const { autopilot } = createDefaultTuning();
  const profile = resolveAutopilotProfile(autopilot, "veteran", config.cannonWeaponKind);
  if (profile === undefined) throw new Error("the default preset carries no veteran profile");
  return profile;
}

describe("driveCrewSeats", () => {
  it("touches nothing when no seat is handed to it", () => {
    const game = createCleanSpaceshipRun(config, 7, 1);

    const next = driveCrewSeats(game, config, {
      seats: [],
      policyTickMs: 50,
      profile: profileFor(),
      memory: createAutopilotMemory(7)
    });

    expect(next).toBe(game);
  });

  /*
   * The seats are the whole contract: the room hands in the ones no human owns
   * and the stand hands in its own list, so a seat that arrives must be driven
   * and one that does not must be left alone for a human to fill.
   */
  it("drives exactly the seats it is given", () => {
    const game = createCleanSpaceshipRun(config, 7, 1);
    const profile = profileFor();

    const pilotOnly = driveCrewSeats(game, config, {
      seats: ["pilot"],
      policyTickMs: 50,
      profile,
      memory: createAutopilotMemory(7)
    });

    expect(pilotOnly.inputs.pilot).not.toBeNull();
    expect(pilotOnly.inputs.gunner).toBeNull();
    expect(pilotOnly.inputs.shield).toBeNull();

    const everySeat = driveCrewSeats(game, config, {
      seats: ["pilot", "gunner", "shield"],
      policyTickMs: 50,
      profile,
      memory: createAutopilotMemory(7)
    });

    expect(everySeat.inputs.pilot).not.toBeNull();
    expect(everySeat.inputs.gunner).not.toBeNull();
    expect(everySeat.inputs.shield).not.toBeNull();
  });
});
