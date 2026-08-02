import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Starts an agent run from the browser.
 *
 * Until now a run could only be launched from the CLI, which meant no amount of
 * frontend work could make the product dynamic — the intake page had nothing to
 * call. This spawns the existing Python entry point and returns immediately.
 *
 * Deliberately fire-and-forget: a run waits for human approval and a human
 * choice, so it can last minutes. Holding the HTTP response open would time out
 * and tell the user nothing. Events already stream to the SSE hub, so progress
 * is reported over the channel the dashboard is already reading.
 */
export class RunService {
  constructor({ cwd = "agents", python = "python3", spawnImpl = spawn, logger = console } = {}) {
    this.cwd = cwd;
    this.python = python;
    this.spawnImpl = spawnImpl;
    this.logger = logger;
    this.active = new Map();
  }

  start({ goal, budget, days, awaitApproval = true, awaitChoice = true } = {}) {
    if (typeof goal !== "string" || goal.trim() === "") {
      throw new RunError("goal must be a non-empty string", "INVALID_GOAL");
    }
    const amount = Number(budget);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RunError("budget must be a positive number", "INVALID_BUDGET");
    }

    const runId = `run-${randomUUID().slice(0, 12)}`;
    const args = [
      "-m", "humsafar",
      "--goal", goal.trim(),
      "--budget", String(amount),
      "--run-id", runId,
    ];
    // Discovery goes through this backend, so a configured DUFFEL_ACCESS_TOKEN
    // is actually used rather than sitting idle behind an opt-in flag.
    if (awaitApproval) args.push("--await-approval");
    if (awaitChoice) args.push("--await-choice");

    const child = this.spawnImpl(this.python, args, {
      cwd: this.cwd,
      env: process.env,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Only exit status is recorded. Agent stdout can carry option details and
    // must not be echoed into server logs wholesale.
    child.on("exit", (code) => {
      this.active.delete(runId);
      this.logger.info?.({ service: "run", runId, exit: code });
    });
    child.on("error", (error) => {
      this.active.delete(runId);
      this.logger.error?.({ service: "run", runId, code: error?.code ?? "SPAWN_FAILED" });
    });

    this.active.set(runId, child);
    return { runId, days: Number(days) || null };
  }
}

export class RunError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RunError";
    this.code = code ?? "INVALID_RUN";
    this.status = 400;
  }
}
