import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  batchReportSchema,
  type BatchHeader,
  type BatchReport
} from "@spaceship-defender/protocol";

export interface BatchStoreOptions {
  directory: string;
  keep: number;
}

export interface BatchListing {
  batches: BatchHeader[];
  droppedForVersion: number;
}

const AGGREGATE_SUFFIX = ".json";
const DETAIL_MARKER = ".runs.";

function isAggregateFile(name: string): boolean {
  return (
    name.startsWith("batch-") && name.endsWith(AGGREGATE_SUFFIX) && !name.includes(DETAIL_MARKER)
  );
}

function headerOf(report: BatchReport): BatchHeader {
  return {
    batchId: report.batchId,
    status: report.status,
    startedAtMs: report.startedAtMs,
    finishedAtMs: report.finishedAtMs,
    totalCells: report.totalCells,
    completedCells: report.cells.length,
    request: report.request
  };
}

/**
 * Reports on disk, newest first.
 *
 * A report is a measurement, so there is no migration: one written by another
 * version of the format is dropped and counted rather than coerced into a shape
 * whose numbers may no longer mean the same thing.
 *
 * A document still marked `running` when it is read is the wreck of a batch the
 * process did not outlive — the child dies with its parent — so it is reported
 * as `stopped` with whatever cells it managed to finish.
 */
export class BatchStore {
  constructor(private readonly options: BatchStoreOptions) {}

  aggregatePath(batchId: string): string {
    return join(this.options.directory, `batch-${batchId}.json`);
  }

  detailPath(batchId: string): string {
    return join(this.options.directory, `batch-${batchId}.runs.json`);
  }

  get directory(): string {
    return this.options.directory;
  }

  async list(): Promise<BatchListing> {
    const names = await this.aggregateNames();
    const batches: BatchHeader[] = [];
    let droppedForVersion = 0;
    for (const name of names) {
      const report = await this.readFileAsReport(join(this.options.directory, name));
      if (report === undefined) {
        droppedForVersion += 1;
        continue;
      }
      batches.push(headerOf(report));
    }
    batches.sort((left, right) => right.startedAtMs - left.startedAtMs);
    return { batches, droppedForVersion };
  }

  async read(batchId: string): Promise<BatchReport | undefined> {
    return await this.readFileAsReport(this.aggregatePath(batchId));
  }

  /** The detail document is opaque here: only the console reads its cells. */
  async readDetail(batchId: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.detailPath(batchId), "utf8"));
    } catch {
      return undefined;
    }
  }

  async write(report: BatchReport): Promise<void> {
    const parsed = batchReportSchema.parse(report);
    await mkdir(this.options.directory, { recursive: true });
    const target = this.aggregatePath(parsed.batchId);
    const temporary = `${target}.${String(process.pid)}-${String(Date.now())}.tmp`;
    await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  /** Keeps the newest reports and deletes the rest, detail documents included. */
  async rotate(): Promise<number> {
    const { batches } = await this.list();
    const doomed = batches.slice(this.options.keep);
    for (const batch of doomed) {
      await rm(this.aggregatePath(batch.batchId), { force: true });
      await rm(this.detailPath(batch.batchId), { force: true });
    }
    return doomed.length;
  }

  private async aggregateNames(): Promise<string[]> {
    try {
      return (await readdir(this.options.directory)).filter(isAggregateFile);
    } catch {
      return [];
    }
  }

  private async readFileAsReport(path: string): Promise<BatchReport | undefined> {
    let document: unknown;
    try {
      document = JSON.parse(await readFile(path, "utf8"));
    } catch {
      // Unreadable or half-written: counted with the foreign versions rather
      // than thrown, so one bad file cannot take the whole listing down.
      return undefined;
    }
    const parsed = batchReportSchema.safeParse(document);
    if (!parsed.success) return undefined;
    if (parsed.data.status !== "running") return parsed.data;
    return { ...parsed.data, status: "stopped" };
  }
}
