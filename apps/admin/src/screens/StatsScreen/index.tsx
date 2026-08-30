import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BalancePresetsFile,
  BatchHeader,
  BatchProgress,
  BatchReport,
  BatchRequest
} from "@spaceship-defender/protocol";

import {
  fetchBatch,
  fetchBatches,
  fetchRunning,
  startBatch,
  stopBatch
} from "../../statsClient.js";
import { cellId, cellLabel } from "./aggregate.js";
import { BatchLauncher } from "./BatchLauncher.js";
import { BatchPicker } from "./BatchPicker.js";
import { CombatSection } from "./CombatSection.js";
import { EconomySection } from "./EconomySection.js";
import { OverviewSection } from "./OverviewSection.js";
import { RunLog } from "./RunLog.js";

const POLL_MS = 1000;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка.";
}

function defaultRequest(document: BalancePresetsFile): BatchRequest {
  return {
    levels: ["rookie", "veteran", "ace"],
    enemyOffsets: [0],
    crewSizes: [3],
    presetIds: [document.activePresetId],
    runsPerCell: 10,
    firstSeed: 1,
    maxWaves: 40,
    startWave: 1,
    intermissionSeconds: null
  };
}

/**
 * Composition only: the sections below take plain data, and every number they
 * draw is computed in `aggregate.ts`, which is the part covered by tests.
 */
export function StatsScreen({
  document,
  password
}: {
  readonly document: BalancePresetsFile;
  readonly password: string;
}) {
  const [batches, setBatches] = useState<readonly BatchHeader[]>([]);
  const [dropped, setDropped] = useState(0);
  const [selectedBatchId, setSelectedBatchId] = useState<string>();
  const [report, setReport] = useState<BatchReport>();
  const [selectedCellId, setSelectedCellId] = useState<string>();
  const [running, setRunning] = useState<BatchProgress | null>(null);
  const [request, setRequest] = useState<BatchRequest>(() => defaultRequest(document));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef<string | undefined>(undefined);
  selectedRef.current = selectedBatchId;
  const runningRef = useRef(false);

  const refreshList = useCallback(async () => {
    const listing = await fetchBatches(password);
    setBatches(listing.batches);
    setDropped(listing.droppedForVersion);
    const first = listing.batches[0];
    if (selectedRef.current === undefined && first !== undefined) {
      setSelectedBatchId(first.batchId);
    }
  }, [password]);

  useEffect(() => {
    refreshList().catch((cause: unknown) => {
      setError(describe(cause));
    });
  }, [refreshList]);

  useEffect(() => {
    if (selectedBatchId === undefined) return;
    let cancelled = false;
    fetchBatch(password, selectedBatchId)
      .then((loaded) => {
        if (cancelled) return;
        setReport(loaded);
        setSelectedCellId(loaded.cells[0] === undefined ? undefined : cellId(loaded.cells[0].key));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describe(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [password, selectedBatchId]);

  // A batch is a child process the server watches; the durable record is its
  // file, so polling a tiny JSON survives a reload and needs no socket. The
  // ref holds the previous answer so the falling edge — a batch that has just
  // finished — refreshes the list without making the poll depend on its own
  // state and restart every second.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const answer = await fetchRunning(password);
        if (cancelled) return;
        setRunning(answer.running);
        const wasRunning = runningRef.current;
        runningRef.current = answer.running !== null;
        if (wasRunning && answer.running === null) await refreshList();
      } catch (cause: unknown) {
        if (!cancelled) setError(describe(cause));
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [password, refreshList]);

  const cell = report?.cells.find((candidate) => cellId(candidate.key) === selectedCellId);

  return (
    <div className="screen">
      {error !== undefined && <p className="error">{error}</p>}

      <BatchLauncher
        request={request}
        presetIds={document.presets.map(({ id }) => id)}
        running={running}
        busy={busy}
        onChange={setRequest}
        onStart={() => {
          setBusy(true);
          setError(undefined);
          startBatch(password, request)
            .then((answer) => {
              setRunning(answer.running);
            })
            .catch((cause: unknown) => {
              setError(describe(cause));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
        onStop={() => {
          setBusy(true);
          stopBatch(password)
            .then((answer) => {
              setRunning(answer.running);
            })
            .catch((cause: unknown) => {
              setError(describe(cause));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      />

      <section className="card">
        <h2>Батчи</h2>
        <BatchPicker
          batches={batches}
          droppedForVersion={dropped}
          selectedId={selectedBatchId}
          onSelect={setSelectedBatchId}
        />
      </section>

      {report !== undefined && report.cells.length > 0 && (
        <>
          <section className="card">
            <h2>Ячейка</h2>
            <div className="axis-row">
              {report.cells.map((candidate) => {
                const id = cellId(candidate.key);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`chip ${id === selectedCellId ? "chip--active" : ""}`}
                    aria-pressed={id === selectedCellId}
                    onClick={() => {
                      setSelectedCellId(id);
                    }}
                  >
                    {cellLabel(candidate.key)}
                  </button>
                );
              })}
            </div>
          </section>

          <OverviewSection report={report} cell={cell} />
          <CombatSection report={report} cell={cell} />
          {cell !== undefined && <EconomySection cell={cell} />}
          {cell !== undefined && <RunLog cell={cell} />}
        </>
      )}
    </div>
  );
}
