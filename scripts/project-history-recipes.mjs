// How to reach a fight in a version of this game that is weeks old.
//
// The way in never changed in principle: the shared screen opens a room, a
// controller joins it by `?room=<code>`, and the round starts when the crew is
// ready. What changed is the wording on the buttons, how many people the room
// waits for, and what the world canvas is called - three renames across two
// genre changes. That is all a recipe is: the few strings a capture needs to
// click through the version it is looking at.
//
// A recipe applies from its `since` day until the next one starts.
export const RECIPES = [
  {
    id: "town-defenders",
    title: "Башенная оборона",
    since: "2026-07-27",
    /* Capacity is a select on this screen; two defenders is the least to wait for. */
    crew: { kind: "select", value: "2" },
    controllers: 2,
    world: '[data-testid="battlefield-canvas"]'
  },
  {
    id: "flying-castle",
    title: "Летающий замок",
    since: "2026-08-20",
    /* No choice at all: the castle is flown by exactly three. */
    crew: undefined,
    controllers: 3,
    world: '[data-testid="flying-castle-world"]'
  },
  {
    id: "spaceship",
    title: "Космический бой",
    since: "2026-08-23",
    crew: undefined,
    controllers: 3,
    world: '[data-testid="spaceship-world"]'
  },
  {
    id: "crew-sizes",
    title: "Экипаж на выбор",
    since: "2026-08-27",
    /* One seat is enough from here on: the autopilot holds the rest. */
    crew: { kind: "button", value: "1 игрок" },
    controllers: 1,
    world: '[data-testid="spaceship-world"]'
  },
  {
    id: "mode-grid",
    title: "Два режима",
    since: "2026-09-11",
    /* A front door appears: the campaign is one tile of two, and the setup
       behind it opens on solo, so a phone-seated crew has to be asked for. */
    mode: "Кампания I: Завеса",
    crew: { kind: "button", value: "1 игрок" },
    start: "В бой",
    controllers: 1,
    world: '[data-testid="spaceship-world"]'
  }
];

/** The shared screen shows this the moment the room leaves the lobby, always has. */
export const COMBAT_MARKER = ".phase-badge--active";
/** The room code, on the shared screen, in every version so far. */
export const ROOM_CODE = ".room-code";
/** The balance console only exists from this day on. */
export const ADMIN_SINCE = "2026-08-25";

export function recipeFor(date) {
  let chosen = RECIPES[0];
  for (const recipe of RECIPES) if (recipe.since <= date) chosen = recipe;
  return chosen;
}
