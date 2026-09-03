import type { Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { maintenanceStateSchema } from "@spaceship-defender/protocol";

import { createMaintenanceCommandHandler, createMaintenanceStateHandler } from "./routes.js";
import { MaintenanceWindow } from "./window.js";

const TOKEN = "deploy-token";

function request(remoteAddress: string, body?: unknown, authorization?: string): Request {
  return {
    headers: { authorization },
    socket: { remoteAddress },
    body
  } as unknown as Request;
}

function basic(secret: string): string {
  return `Basic ${Buffer.from(`admin:${secret}`, "utf8").toString("base64")}`;
}

interface ResponseState {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function response(): { response: Response; state: ResponseState } {
  const state: ResponseState = { status: 200, headers: {}, body: undefined };
  const fake = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return this;
    },
    status(status: number) {
      state.status = status;
      return this;
    },
    type() {
      return this;
    },
    send(body: unknown) {
      state.body = body;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    }
  } as unknown as Response;
  return { response: fake, state };
}

async function invoke(handler: RequestHandler, input: Request, output: Response): Promise<void> {
  await handler(input, output, vi.fn());
}

describe("maintenance window", () => {
  it("counts down to the announced moment and stays announced past it", () => {
    const window = new MaintenanceWindow();
    expect(window.isActive()).toBe(false);
    expect(window.snapshot(1_000)).toEqual({ active: false, secondsRemaining: 0 });

    window.announce(600, 1_000);
    expect(window.isActive()).toBe(true);
    expect(window.snapshot(1_000).secondsRemaining).toBe(600);
    expect(window.snapshot(1_000 + 599_000).secondsRemaining).toBe(1);
    // The window does not stop being announced when its clock runs out; a run
    // in progress is still allowed to finish, and new ones still refused.
    const expired = window.snapshot(1_000 + 900_000);
    expect(expired).toEqual({ active: true, secondsRemaining: 0 });
  });

  it("forgets the window when it is cancelled", () => {
    const window = new MaintenanceWindow();
    window.announce(600, 0);
    window.cancel();
    expect(window.isActive()).toBe(false);
    expect(window.snapshot(0).active).toBe(false);
  });

  it("refuses an unauthorized command and leaves the window alone", async () => {
    const window = new MaintenanceWindow();
    const output = response();
    await invoke(
      createMaintenanceCommandHandler({ token: TOKEN, window }),
      // A stranger's address and the wrong secret: the balance password must not
      // open this route either.
      request("203.0.113.7", { active: true, windowSeconds: 600 }, basic("balance-password")),
      output.response
    );
    expect(output.state.status).toBe(401);
    expect(window.isActive()).toBe(false);
  });

  it("accepts a command carrying the token", async () => {
    const window = new MaintenanceWindow();
    const output = response();
    await invoke(
      createMaintenanceCommandHandler({ token: TOKEN, window }),
      request("203.0.113.7", { active: true, windowSeconds: 600 }, basic(TOKEN)),
      output.response
    );
    expect(output.state.status).toBe(200);
    expect(window.isActive()).toBe(true);
    const parsed = maintenanceStateSchema.safeParse(output.state.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.secondsRemaining).toBeGreaterThan(0);
  });

  it("answers a loopback caller when no token is configured", async () => {
    const window = new MaintenanceWindow();
    const output = response();
    await invoke(
      createMaintenanceStateHandler({ token: undefined, window }),
      request("127.0.0.1"),
      output.response
    );
    expect(output.state.status).toBe(200);
    expect(output.state.headers["cache-control"]).toBe("no-store");
  });

  it("refuses a stranger when no token is configured", async () => {
    const window = new MaintenanceWindow();
    const output = response();
    await invoke(
      createMaintenanceStateHandler({ token: undefined, window }),
      request("203.0.113.7"),
      output.response
    );
    expect(output.state.status).toBe(401);
  });

  it("rejects a malformed command", async () => {
    const window = new MaintenanceWindow();
    const output = response();
    await invoke(
      createMaintenanceCommandHandler({ token: TOKEN, window }),
      request("127.0.0.1", { active: "yes" }, basic(TOKEN)),
      output.response
    );
    expect(output.state.status).toBe(400);
    expect(window.isActive()).toBe(false);
  });
});
