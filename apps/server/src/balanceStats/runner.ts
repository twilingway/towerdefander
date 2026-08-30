import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";

import {
  countBatchCells,
  countBatchRuns,
  type BatchProgress,
  type BatchRequest,
  type CellKey
} from "@spaceship-defender/protocol";

import type { BatchStore } from "./store.js";

export interface BatchRunnerOptions {
  store: BatchStore;
  presetPath: string;
  timeoutSeconds: number;
  /** Both resolved in `config.ts`, which is the only depth-stable anchor. */
  harnessPath: string;
  guardUrl: string;
}

export class BatchHarnessMissingError extends Error {}
export class BatchAlreadyRunningError extends Error {
  constructor(readonly batchId: string) {
    super(`Batch ${batchId} is already running.`);
  }
}

const MAX_LOG_LINES = 50;

/**
 * Runs one balance batch as a child process.
 *
 * One at a time per server process: a batch is CPU-bound and shares the machine
 * with live rooms. The child carries the owned-process guard, which exits on
 * `disconnect`, so a server restart kills the measurement instead of orphaning
 * it — and the report file the child rewrites per cell is what survives.
 */
export class BatchRunner {
  private child: ChildProcess | undefined;
  private progress: BatchProgress | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: BatchRunnerOptions) {}

  running(): BatchProgress | undefined {
    return this.progress;
  }

  async start(batchId: string, request: BatchRequest): Promise<BatchProgress> {
    if (this.progress !== undefined) throw new BatchAlreadyRunningError(this.progress.batchId);
    try {
      await access(this.options.harnessPath);
    } catch {
      throw new BatchHarnessMissingError(
        "The balance harness is not deployed beside this server, so a batch cannot be started."
      );
    }

    const args = [
      "--import",
      this.options.guardUrl,
      this.options.harnessPath,
      "--out",
      this.options.store.directory,
      "--batch-id",
      batchId,
      "--preset",
      this.options.presetPath,
      "--levels",
      request.levels.join(","),
      "--offsets",
      request.enemyOffsets.join(","),
      "--crews",
      request.crewSizes.join(","),
      "--presets",
      request.presetIds.join(","),
      "--runs",
      String(request.runsPerCell),
      "--seed",
      String(request.firstSeed),
      "--max-waves",
      String(request.maxWaves),
      "--start-wave",
      String(request.startWave)
    ];
    if (request.intermissionSeconds !== null) {
      args.push("--intermission", String(request.intermissionSeconds));
    }

    this.progress = {
      batchId,
      completedCells: 0,
      totalCells: countBatchCells(request),
      completedRuns: 0,
      totalRuns: countBatchRuns(request),
      currentCell: null,
      log: []
    };
    this.child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true
    });
    this.attach(this.child);
    this.timer = setTimeout(() => {
      this.note("Batch exceeded its time limit and was stopped.");
      this.stop();
    }, this.options.timeoutSeconds * 1000);
    return this.progress;
  }

  stop(): void {
    this.child?.kill();
  }

  private attach(child: ChildProcess): void {
    let pending = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) this.consume(line.trim());
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      this.note(chunk.trim().slice(0, 400));
    });
    child.on("error", (error: Error) => {
      this.note(error.message);
    });
    child.on("exit", () => {
      if (this.timer !== undefined) clearTimeout(this.timer);
      this.timer = undefined;
      this.child = undefined;
      this.progress = undefined;
      void this.options.store.rotate();
    });
  }

  private consume(line: string): void {
    if (line.length === 0 || this.progress === undefined) return;
    let event: { event?: string; key?: CellKey; completedCells?: number; completedRuns?: number };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      this.note(line.slice(0, 400));
      return;
    }
    if (event.event !== "cell") return;
    this.progress = {
      ...this.progress,
      completedCells: event.completedCells ?? this.progress.completedCells,
      completedRuns: event.completedRuns ?? this.progress.completedRuns,
      currentCell: event.key ?? null,
      log: [...this.progress.log, describeCell(event.key)].slice(-MAX_LOG_LINES)
    };
  }

  private note(message: string): void {
    if (this.progress === undefined || message.length === 0) return;
    this.progress = {
      ...this.progress,
      log: [...this.progress.log, message].slice(-MAX_LOG_LINES)
    };
  }
}

function describeCell(key: CellKey | undefined): string {
  if (key === undefined) return "cell finished";
  return `${key.presetId} · ${key.level} · offset ${String(key.enemyOffset)} · crew ${String(key.crewSize)}`;
}
