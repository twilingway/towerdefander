import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RoomDayPeak, RoomRecord, RoomRecordsView, RoomStatsMetadata } from "./types.js";

/** The records file's format; a document of another version is set aside, not coerced. */
export const ROOM_RECORDS_FILE_VERSION = 1;
/** How many of the latest days the page is sent. The file keeps every day. */
export const ROOM_RECORDS_PAGE_DAYS = 30;

export interface RoomRecordsDocument {
  version: typeof ROOM_RECORDS_FILE_VERSION;
  allTime: { people: RoomRecord; rooms: RoomRecord };
  /** Oldest first, one row for every UTC day that had a room open. */
  days: RoomDayPeak[];
}

export interface ServerRecordsOptions {
  readonly filePath: string;
  readonly logger?: Pick<Console, "warn">;
  /**
   * The zone whose calendar days the peaks are kept by. The process's own `TZ`
   * when not given, which production sets to Moscow.
   */
  readonly timeZone?: string;
}

function emptyDocument(): RoomRecordsDocument {
  return {
    version: ROOM_RECORDS_FILE_VERSION,
    allTime: { people: { value: 0, atMs: 0 }, rooms: { value: 0, atMs: 0 } },
    days: []
  };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isMoment(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseRecord(value: unknown): RoomRecord | undefined {
  const record = asObject(value);
  if (record === undefined || !isCount(record.value) || !isMoment(record.atMs)) return undefined;
  return { value: record.value, atMs: record.atMs };
}

const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The records file, checked by hand the way room metadata is: the server has no
 * schema library of its own, and a document with anything wrong in it is
 * rejected whole rather than half-trusted.
 */
export function parseRoomRecordsDocument(value: unknown): RoomRecordsDocument | undefined {
  const document = asObject(value);
  if (document?.version !== ROOM_RECORDS_FILE_VERSION || !Array.isArray(document.days)) {
    return undefined;
  }
  const allTime = asObject(document.allTime);
  const people = parseRecord(allTime?.people);
  const rooms = parseRecord(allTime?.rooms);
  if (people === undefined || rooms === undefined) return undefined;
  const days: RoomDayPeak[] = [];
  for (const entry of document.days as unknown[]) {
    const day = asObject(entry);
    if (
      day === undefined ||
      typeof day.date !== "string" ||
      !UTC_DATE.test(day.date) ||
      !isCount(day.people) ||
      !isCount(day.rooms)
    ) {
      return undefined;
    }
    days.push({ date: day.date, people: day.people, rooms: day.rooms });
  }
  return { version: ROOM_RECORDS_FILE_VERSION, allTime: { people, rooms }, days };
}

/** Written beside the target and renamed over it, so an interrupted write leaves the old file. */
async function writeRecordsFile(filePath: string, document: RoomRecordsDocument): Promise<void> {
  const text = `${JSON.stringify(document, null, 2)}\n`;
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = join(
    dirname(filePath),
    `.${String(process.pid)}-${String(Date.now())}.records.tmp`
  );
  await writeFile(temporaryPath, text, "utf8");
  await rename(temporaryPath, filePath);
}

/**
 * The server's all-time and daily highs of people and rooms at once.
 *
 * Rooms hand over the same metadata they publish to the matchmaker, so the
 * count is compared at the moment it changes rather than whenever somebody
 * opens the page: a peak nobody was watching is still a peak. People are the
 * rooms' connections, which a bot or an autopilot never holds.
 *
 * The file is written only when a record or the day's peak rises, one write at
 * a time, with whatever rose meanwhile folded into the next one.
 */
export class ServerRecords {
  /** Connections of every open room, by its anonymous stats id. */
  private readonly rooms = new Map<string, number>();
  private document = emptyDocument();
  /**
   * Nothing is written before the file has been read: a room test that never
   * loads, or a file that could not be read, must not be overwritten.
   */
  private loaded = false;
  private dirty = false;
  private writing: Promise<void> | undefined;
  private readonly logger: Pick<Console, "warn">;
  private readonly calendar: Intl.DateTimeFormat;

  constructor(private readonly options: ServerRecordsOptions) {
    this.logger = options.logger ?? console;
    this.calendar = new Intl.DateTimeFormat("en-US", {
      ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  }

  /** `YYYY-MM-DD` of a moment, in the records' zone. */
  private dayOf(nowMs: number): string {
    const parts = this.calendar.formatToParts(nowMs);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((candidate) => candidate.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.options.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.loaded = true;
        return;
      }
      // A file that is there but cannot be read may still be a good one, so this
      // process keeps its records in memory rather than write over it.
      this.logger.warn(
        `Server records ${this.options.filePath} could not be read; keeping them in memory only.`
      );
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = undefined;
    }
    const parsed = parseRoomRecordsDocument(json);
    if (parsed === undefined) {
      this.logger.warn(`Server records ${this.options.filePath} are unusable; starting them over.`);
      await this.preserveUnusableFile(raw);
    } else {
      this.document = parsed;
    }
    this.loaded = true;
  }

  /** One room's current connections, compared with the records at this moment. */
  observe(room: Pick<RoomStatsMetadata, "statsId" | "connections">, nowMs = Date.now()): void {
    this.rooms.set(room.statsId, room.connections);
    this.compare(nowMs);
  }

  /** A closed room leaves the count. A count that only falls raises nothing, so nothing is compared. */
  forget(statsId: string): void {
    this.rooms.delete(statsId);
  }

  /** What the page is sent: the records and the latest days, newest first. */
  view(): RoomRecordsView {
    const { people, rooms } = this.document.allTime;
    return {
      allTime: { people: { ...people }, rooms: { ...rooms } },
      days: this.document.days
        .slice(-ROOM_RECORDS_PAGE_DAYS)
        .reverse()
        .map((day) => ({ ...day })),
      timeZone: this.calendar.resolvedOptions().timeZone
    };
  }

  /** Settles when the write in flight, and any folded into it, has finished. */
  whenWritten(): Promise<void> {
    return this.writing ?? Promise.resolve();
  }

  private compare(nowMs: number): void {
    let people = 0;
    for (const connections of this.rooms.values()) people += connections;
    const rooms = this.rooms.size;
    const { allTime, days } = this.document;
    let raised = false;
    if (people > allTime.people.value) {
      allTime.people = { value: people, atMs: nowMs };
      raised = true;
    }
    if (rooms > allTime.rooms.value) {
      allTime.rooms = { value: rooms, atMs: nowMs };
      raised = true;
    }
    const date = this.dayOf(nowMs);
    const today = days.at(-1);
    if (today?.date === date) {
      if (people > today.people || rooms > today.rooms) {
        today.people = Math.max(today.people, people);
        today.rooms = Math.max(today.rooms, rooms);
        raised = true;
      }
    } else {
      days.push({ date, people, rooms });
      raised = true;
    }
    if (raised) this.persist();
  }

  private persist(): void {
    if (!this.loaded) return;
    this.dirty = true;
    if (this.writing !== undefined) return;
    this.writing = this.flush().finally(() => {
      this.writing = undefined;
      // A rise that arrived after the last loop check but before this callback.
      if (this.dirty) this.persist();
    });
  }

  private async flush(): Promise<void> {
    while (this.dirty) {
      this.dirty = false;
      try {
        await writeRecordsFile(this.options.filePath, this.document);
      } catch {
        // The records stay in memory, and the next rise tries the disk again.
        this.logger.warn(`Server records could not be written to ${this.options.filePath}.`);
        return;
      }
    }
  }

  private async preserveUnusableFile(raw: string): Promise<void> {
    const rescued = `${this.options.filePath}.unusable`;
    try {
      await writeFile(rescued, raw, "utf8");
    } catch {
      this.logger.warn(`Could not keep a copy of the unusable server records at ${rescued}.`);
    }
  }
}
