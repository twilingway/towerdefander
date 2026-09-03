import {
  batchListResponseSchema,
  batchReportSchema,
  batchRunningResponseSchema,
  type BatchListResponse,
  type BatchReport,
  type BatchRequest,
  type BatchRunningResponse
} from "@spaceship-defender/protocol";

import { BalanceRequestError, authorizationHeader } from "./balanceClient.js";

const STATS_ENDPOINT = "/admin/stats/batches";

async function describeFailure(response: Response): Promise<string> {
  if (response.status === 401) return "Неверный пароль либо доступ разрешён только с localhost.";
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body as { error?: unknown };
      if (typeof error === "string" && error.length > 0) return error;
    }
  } catch {
    // Fall through to the generic message below.
  }
  return `Сервер ответил ${String(response.status)}.`;
}

async function request(password: string, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...authorizationHeader(password)
    }
  });
  if (!response.ok) {
    throw new BalanceRequestError(response.status, await describeFailure(response));
  }
  return await response.json();
}

export async function fetchBatches(password: string): Promise<BatchListResponse> {
  return batchListResponseSchema.parse(await request(password, STATS_ENDPOINT));
}

export async function fetchBatch(password: string, batchId: string): Promise<BatchReport> {
  return batchReportSchema.parse(await request(password, `${STATS_ENDPOINT}/${batchId}`));
}

export async function fetchRunning(password: string): Promise<BatchRunningResponse> {
  return batchRunningResponseSchema.parse(await request(password, `${STATS_ENDPOINT}/running`));
}

export async function startBatch(
  password: string,
  batch: BatchRequest
): Promise<BatchRunningResponse> {
  return batchRunningResponseSchema.parse(
    await request(password, STATS_ENDPOINT, { method: "POST", body: JSON.stringify(batch) })
  );
}

export async function stopBatch(password: string): Promise<BatchRunningResponse> {
  return batchRunningResponseSchema.parse(
    await request(password, `${STATS_ENDPOINT}/running`, { method: "DELETE" })
  );
}
