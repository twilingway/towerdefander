import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ROOM_RECORDS_PAGE_DAYS, ServerRecords } from "./records.js";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Noon UTC on 13 September 2026. */
const NOON = Date.UTC(2026, 8, 13, 12);

function quiet(): Pick<Console, "warn"> {
  return { warn: vi.fn() };
}

function inMemory(): ServerRecords {
  // Never loaded, so it never touches this path.
  return new ServerRecords({
    filePath: join(tmpdir(), "never-written.json"),
    logger: quiet(),
    timeZone: "UTC"
  });
}

describe("server records", () => {
  it("raises a record when more people are on at once than ever before", () => {
    const records = inMemory();
    records.observe({ statsId: "a", connections: 3 }, NOON);
    records.observe({ statsId: "b", connections: 3 }, NOON + 1_000);

    expect(records.view().allTime).toEqual({
      people: { value: 6, atMs: NOON + 1_000 },
      rooms: { value: 2, atMs: NOON + 1_000 }
    });
  });

  it("keeps a record and its moment when the count falls", () => {
    const records = inMemory();
    records.observe({ statsId: "a", connections: 6 }, NOON);
    records.observe({ statsId: "a", connections: 2 }, NOON + 1_000);
    records.forget("a");

    expect(records.view().allTime.people).toEqual({ value: 6, atMs: NOON });
  });

  it("counts a room once however often it reports, so a reconnect does not double anyone", () => {
    const records = inMemory();
    records.observe({ statsId: "a", connections: 4 }, NOON);
    records.observe({ statsId: "a", connections: 3 }, NOON + 1_000);
    records.observe({ statsId: "a", connections: 4 }, NOON + 2_000);

    expect(records.view().allTime).toEqual({
      people: { value: 4, atMs: NOON },
      rooms: { value: 1, atMs: NOON }
    });
  });

  it("forgets a closed room, and forgetting it twice changes nothing", () => {
    const records = inMemory();
    records.observe({ statsId: "a", connections: 2 }, NOON);
    records.observe({ statsId: "b", connections: 3 }, NOON);
    records.forget("a");
    records.forget("a");
    records.observe({ statsId: "c", connections: 1 }, NOON + 1_000);

    // Two rooms and four people now, against records of two and five.
    expect(records.view().allTime).toEqual({
      people: { value: 5, atMs: NOON },
      rooms: { value: 2, atMs: NOON }
    });
  });

  it("keeps each UTC day's peak", () => {
    const records = inMemory();
    for (const [offset, connections] of [
      [0, 3],
      [1_000, 7],
      [2_000, 4]
    ] as const) {
      records.observe({ statsId: "a", connections }, NOON + offset);
    }

    expect(records.view().days).toEqual([{ date: "2026-09-13", people: 7, rooms: 1 }]);
  });

  it("starts a new day after midnight UTC and leaves the old one as it was", () => {
    const records = inMemory();
    records.observe({ statsId: "a", connections: 5 }, NOON + 11 * HOUR_MS);
    records.observe({ statsId: "a", connections: 2 }, NOON + 12 * HOUR_MS + 60_000);

    expect(records.view().days).toEqual([
      { date: "2026-09-14", people: 2, rooms: 1 },
      { date: "2026-09-13", people: 5, rooms: 1 }
    ]);
  });

  it("counts the days in the zone it is given", () => {
    const records = new ServerRecords({
      filePath: join(tmpdir(), "never-written.json"),
      logger: quiet(),
      timeZone: "Europe/Moscow"
    });
    // 22:30 UTC on 13 September is already half past one on the 14th in Moscow.
    records.observe({ statsId: "a", connections: 1 }, Date.UTC(2026, 8, 13, 22, 30));

    expect(records.view().days).toEqual([{ date: "2026-09-14", people: 1, rooms: 1 }]);
    expect(records.view().timeZone).toBe("Europe/Moscow");
  });

  it("sends the page only the latest days, newest first", () => {
    const records = inMemory();
    for (let day = 0; day < ROOM_RECORDS_PAGE_DAYS + 5; day += 1) {
      records.observe({ statsId: "a", connections: 1 }, NOON + day * DAY_MS);
    }

    const days = records.view().days;
    expect(days).toHaveLength(ROOM_RECORDS_PAGE_DAYS);
    expect(days[0]?.date).toBe("2026-10-17");
  });
});

describe("the server records file", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  async function scratch(): Promise<string> {
    directory = await mkdtemp(join(tmpdir(), "server-records-"));
    return directory;
  }

  it("reads back what it wrote, as a restarted server would", async () => {
    const filePath = join(await scratch(), "records.json");
    const records = new ServerRecords({ filePath, logger: quiet() });
    await records.load();
    records.observe({ statsId: "a", connections: 6 }, NOON);
    records.observe({ statsId: "b", connections: 1 }, NOON + 1_000);
    await records.whenWritten();

    const restarted = new ServerRecords({ filePath, logger: quiet() });
    await restarted.load();
    expect(restarted.view()).toEqual(records.view());
    expect(restarted.view().allTime.people).toEqual({ value: 7, atMs: NOON + 1_000 });
  });

  it("writes nothing before it has read the file", async () => {
    const filePath = join(await scratch(), "records.json");
    const records = new ServerRecords({ filePath, logger: quiet() });
    records.observe({ statsId: "a", connections: 3 }, NOON);
    await records.whenWritten();

    await expect(readFile(filePath, "utf8")).rejects.toThrow();
  });

  it.each([
    ["text that is not JSON", "not json"],
    ["a document of another version", JSON.stringify({ version: 2, allTime: {}, days: [] })]
  ])("keeps %s aside and starts the records over", async (_label, content) => {
    const filePath = join(await scratch(), "records.json");
    await writeFile(filePath, content, "utf8");
    const logger = quiet();
    const records = new ServerRecords({ filePath, logger });
    await records.load();

    expect(records.view().allTime.people).toEqual({ value: 0, atMs: 0 });
    expect(await readFile(`${filePath}.unusable`, "utf8")).toBe(content);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("survives a failed write and tries the disk again on the next rise", async () => {
    const root = await scratch();
    // A file where the records' directory should be makes every write fail.
    const blocker = join(root, "blocked");
    await writeFile(blocker, "", "utf8");
    const filePath = join(blocker, "records.json");
    const logger = quiet();
    const records = new ServerRecords({ filePath, logger });
    await records.load();

    records.observe({ statsId: "a", connections: 2 }, NOON);
    await records.whenWritten();
    expect(logger.warn).toHaveBeenCalled();
    expect(records.view().allTime.people.value).toBe(2);

    await rm(blocker);
    records.observe({ statsId: "a", connections: 3 }, NOON + 1_000);
    await records.whenWritten();
    const written = JSON.parse(await readFile(filePath, "utf8")) as {
      allTime: { people: { value: number } };
    };
    expect(written.allTime.people.value).toBe(3);
  });
});
