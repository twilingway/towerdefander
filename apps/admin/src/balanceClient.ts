import {
  balancePresetsFileSchema,
  balanceValidationResponseSchema,
  type BalancePresetsFile,
  type BalanceValidationResponse
} from "@spaceship-defender/protocol";

const BALANCE_ENDPOINT = "/admin/balance";

export class BalanceRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BalanceRequestError";
    this.status = status;
  }
}

/** Basic credentials are held in memory only; the server accepts loopback without them. */
export function authorizationHeader(password: string): Record<string, string> {
  if (password.length === 0) return {};
  const encoded =
    typeof btoa === "function"
      ? btoa(`admin:${password}`)
      : Buffer.from(`admin:${password}`, "utf8").toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

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

export async function fetchBalance(password: string): Promise<BalancePresetsFile> {
  const response = await fetch(BALANCE_ENDPOINT, {
    headers: authorizationHeader(password)
  });
  if (!response.ok) {
    throw new BalanceRequestError(response.status, await describeFailure(response));
  }
  return balancePresetsFileSchema.parse(await response.json());
}

export async function fetchDefaults(password: string): Promise<BalancePresetsFile> {
  const response = await fetch(`${BALANCE_ENDPOINT}/defaults`, {
    headers: authorizationHeader(password)
  });
  if (!response.ok) {
    throw new BalanceRequestError(response.status, await describeFailure(response));
  }
  return balancePresetsFileSchema.parse(await response.json());
}

export async function saveBalance(
  password: string,
  document: BalancePresetsFile
): Promise<BalancePresetsFile> {
  const response = await fetch(BALANCE_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authorizationHeader(password) },
    body: JSON.stringify(document)
  });
  if (!response.ok) {
    throw new BalanceRequestError(response.status, await describeFailure(response));
  }
  return balancePresetsFileSchema.parse(await response.json());
}

export async function validateBalance(
  password: string,
  document: BalancePresetsFile
): Promise<BalanceValidationResponse> {
  const response = await fetch(`${BALANCE_ENDPOINT}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authorizationHeader(password) },
    body: JSON.stringify(document)
  });
  if (!response.ok) {
    throw new BalanceRequestError(response.status, await describeFailure(response));
  }
  return balanceValidationResponseSchema.parse(await response.json());
}
