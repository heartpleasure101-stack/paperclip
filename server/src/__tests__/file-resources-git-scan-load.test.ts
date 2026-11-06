import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { errorHandler } from "../middleware/index.js";
import {
  createFileResourceListLimiter,
  fileResourceRoutes,
  type WorkspaceFileResourceService,
} from "../routes/file-resources.js";
import {
  createWorkspaceGitOperationScheduler,
  WORKSPACE_GIT_SCAN_ERROR_CODES,
  WorkspaceGitScanError,
  type WorkspaceGitRunner,
} from "../services/workspace-git-operation-scheduler.js";
vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(async () => undefined),
}));

function unavailableMethods(): Pick<WorkspaceFileResourceService, "availability" | "resolve" | "readContent" | "prepareDownload"> {
  return {
    availability: vi.fn(async () => { throw new Error("not used"); }),
    resolve: vi.fn(async () => { throw new Error("not used"); }),
    readContent: vi.fn(async () => { throw new Error("not used"); }),
    prepareDownload: vi.fn(async () => { throw new Error("not used"); }),
  };
}

function availableList(input: { mode?: "all" | "recent" | "changed" | null } = {}) {
  return {
    kind: "workspace_file_list" as const,
    state: "available" as const,
    workspace: {
      provider: "local_fs" as const,
      workspaceLabel: "Workspace",
      workspaceKind: "project_workspace" as const,
      workspaceId: "11111111-1111-4111-8111-111111111111",
    },
    query: {
      workspace: "auto" as const,
      mode: input.mode ?? "changed",
      q: null,
      limit: 25,
      offset: 0,
    },
    items: [],
    scannedCount: 0,
    truncated: false,
  };
}

function createLoadApp(db: Db, companyId: string, service: WorkspaceFileResourceService) {
  const app = express();
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use((req, _res, next) => {
    req.actor = {
      type: "board",
      userId: String(req.headers["x-test-actor"] ?? "board-user"),
      companyIds: [companyId],
      source: "session",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", fileResourceRoutes(db, {
    service,
    listLimiter: createFileResourceListLimiter({
      maxConcurrent: 2,
      maxRequests: 10,
      windowMs: 60_000,
    }),
  }));
  app.use(errorHandler);
  return app;
}

interface BatchedAdmissionOptions<T> {
  server: ReturnType<express.Express["listen"]>;
  totalRequests: number;
  batchSize: number;
  admissionDeadlineMs: number;
  admissionStart?: number;
  createRequest: (index: number) => Promise<T>;
  pendingCollector?: Promise<T>[];
}

interface BatchedAdmissionResult<T> {
  pendingResponses: Promise<T>[];
  remainingAdmissionMs: number;
  issuedCount: number;
  getCompletedCount: () => number;
}

async function admitRequestsInBatches<T>(
  options: BatchedAdmissionOptions<T>,
): Promise<BatchedAdmissionResult<T>> {
  const {
    server,
    totalRequests,
    batchSize,
    admissionDeadlineMs,
    admissionStart = performance.now(),
    createRequest,
    pendingCollector,
  } = options;

  let serverConnections = 0;
  const onConnection = () => {
    serverConnections += 1;
  };
  server.on("connection", onConnection);

  const pendingResponses: Promise<T>[] = pendingCollector ?? [];
  let issuedCount = 0;
  let completedCount = 0;
  let firstRejection: unknown = null;

  try {
    for (let batchStart = 0; batchStart < totalRequests; batchStart += batchSize) {
      const batchTarget = Math.min(batchStart + batchSize, totalRequests);
      for (let index = batchStart; index < batchTarget; index += 1) {
        issuedCount += 1;
        const reqPromise = createRequest(index).then(
          (res) => {
            completedCount += 1;
            return res;
          },
          (err) => {
            completedCount += 1;
            if (!firstRejection) firstRejection = err;
            throw err;
          },
        );
        // Immediately observe rejection to prevent Node unhandled rejection,
        // without swallowing eventual failure when awaited/settled.
        reqPromise.catch(() => {});
        pendingResponses.push(reqPromise);
      }

      while (serverConnections < batchTarget) {
        if (firstRejection) {
          throw firstRejection;
        }
        const elapsed = performance.now() - admissionStart;
        if (elapsed > admissionDeadlineMs) {
          throw new Error(
            `TCP admission deadline exceeded (${elapsed.toFixed(1)}ms > ${admissionDeadlineMs}ms) waiting for connections ${serverConnections}/${batchTarget}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
  } finally {
    server.removeListener("connection", onConnection);
  }

  const elapsedAdmission = performance.now() - admissionStart;
  const remainingAdmissionMs = Math.max(1, Math.floor(admissionDeadlineMs - elapsedAdmission));

  return {
    pendingResponses,
    remainingAdmissionMs,
    issuedCount,
    getCompletedCount: () => completedCount,
  };
}

describe("workspace Git scan route load regression", () => {
  const db = {} as Db;
  const companyId = "11111111-1111-4111-8111-111111111111";
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-file-scan-load-"));
    await Promise.all([
      fs.mkdir(path.join(tempRoot, "repository-a")),
      fs.mkdir(path.join(tempRoot, "repository-b")),
    ]);
  }, 60_000);

  afterAll(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("keeps 500 cross-actor/cross-issue requests globally bounded while health stays responsive", async () => {
    let releaseScans!: () => void;
    const scanGate = new Promise<void>((resolve) => {
      releaseScans = resolve;
    });
    let active = 0;
    let peakActive = 0;
    let runnerCalls = 0;
    const runner: WorkspaceGitRunner = async () => {
      runnerCalls += 1;
      active += 1;
      peakActive = Math.max(peakActive, active);
      await scanGate;
      active -= 1;
      return { stdout: "", stderr: "" };
    };
    const scheduler = createWorkspaceGitOperationScheduler({
      concurrency: 2,
      queueCapacity: 4,
      runner,
      defaultCacheTtlMs: 0,
    });
    const roots = [path.join(tempRoot, "repository-a"), path.join(tempRoot, "repository-b")];
    const service: WorkspaceFileResourceService = {
      getIssue: vi.fn(async () => ({ companyId })),
      list: vi.fn(async (issueId, input, opts) => {
        const numericId = Number(issueId.slice("issue-".length));
        await scheduler.run({
          workspacePath: roots[numericId % roots.length]!,
          args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
          operation: "route_load.changed_files",
          fairnessKeys: opts?.scanContext?.fairnessKeys,
          signal: opts?.scanContext?.signal,
          cacheTtlMs: 0,
        });
        return availableList(input);
      }),
      ...unavailableMethods(),
    };
    const app = createLoadApp(db, companyId, service);
    // Model one busy API server, not 500 independent ephemeral listeners whose
    // accept/close races can reset clients before they reach the scheduler.
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));

    const pendingResponses: Promise<any>[] = [];
    try {
      const admissionDeadlineMs = 15_000;
      const admissionStart = performance.now();
      const admissionResult = await admitRequestsInBatches({
        server,
        totalRequests: 500,
        batchSize: 25,
        admissionDeadlineMs,
        admissionStart,
        pendingCollector: pendingResponses,
        createRequest: (index) =>
          request(server)
            .get(`/api/issues/issue-${index}/file-resources/list`)
            .set("x-test-actor", `actor-${index % 73}`)
            .query({ mode: "changed" })
            .then((response) => response),
      });

      // Explicitly prove 500 issued, 0 completed when measuring
      expect(admissionResult.issuedCount).toBe(500);
      expect(admissionResult.getCompletedCount()).toBe(0);

      await vi.waitFor(
        () => expect(scheduler.snapshot().totals.singleFlightJoins).toBe(498),
        { timeout: admissionResult.remainingAdmissionMs, interval: 20 },
      );
      const loadedSnapshot = scheduler.snapshot();
      expect(loadedSnapshot).toMatchObject({ activeCount: 2, queuedCount: 0, inFlightCount: 2 });
      expect(admissionResult.getCompletedCount()).toBe(0);

      const healthLatencies: number[] = [];
      for (let index = 0; index < 25; index += 1) {
        const startedAt = performance.now();
        const response = await request(server).get("/api/health");
        healthLatencies.push(performance.now() - startedAt);
        expect(response.status).toBe(200);
      }
      expect(admissionResult.getCompletedCount()).toBe(0);
      healthLatencies.sort((left, right) => left - right);
      const healthP99Ms = healthLatencies[Math.ceil(healthLatencies.length * 0.99) - 1]!;
      expect(healthP99Ms).toBeLessThan(250);

      releaseScans();
      const settledResponses = await Promise.allSettled(pendingResponses);
      const responses = settledResponses.map(result => {
        if (result.status === "rejected") throw result.reason;
        return result.value;
      });
      const outcomeCounts = responses.reduce<Record<number, number>>((counts, response) => {
        counts[response.status] = (counts[response.status] ?? 0) + 1;
        return counts;
      }, {});
      expect(outcomeCounts).toEqual({ 200: 500 });
      expect(admissionResult.getCompletedCount()).toBe(500);
      expect({ runnerCalls, peakActive }).toEqual({ runnerCalls: 2, peakActive: 2 });
      expect(scheduler.snapshot()).toMatchObject({ activeCount: 0, queuedCount: 0, inFlightCount: 0 });

      console.info("workspace Git scan regression metrics", {
        requests: responses.length,
        repositories: roots.length,
        underlyingScans: runnerCalls,
        peakActive,
        peakQueued: loadedSnapshot.queuedCount,
        outcomes: outcomeCounts,
        healthP99Ms: Math.round(healthP99Ms * 100) / 100,
        unreapedChildCount: 0,
      });
    } finally {
      releaseScans();
      server.closeAllConnections?.();
      await Promise.allSettled(pendingResponses);
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 60_000);

  it("enforces TCP admission deadline and cleans up resources on admission timeout", async () => {
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const app = express();
    app.get("/test", async (_req, res) => {
      await gate;
      res.json({ ok: true });
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const pending: Promise<any>[] = [];
    let timedOut = false;
    try {
      await admitRequestsInBatches({
        server,
        totalRequests: 20,
        batchSize: 5,
        admissionDeadlineMs: 0,
        admissionStart: performance.now() - 100,
        pendingCollector: pending,
        createRequest: (index) =>
          request(server)
            .get("/test")
            .query({ i: index })
            .then((res) => res),
      });
    } catch (error) {
      timedOut = (error as Error).message.includes("TCP admission deadline exceeded");
    } finally {
      releaseGate();
      server.closeAllConnections?.();
      await Promise.allSettled(pending);
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect(timedOut).toBe(true);
  });

  it("immediately observes client rejections during admission and cleans up without unhandled rejections", async () => {
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const app = express();
    app.get("/test", async (_req, res) => {
      await gate;
      res.json({ ok: true });
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const pending: Promise<any>[] = [];
    let rejected = false;
    try {
      await admitRequestsInBatches({
        server,
        totalRequests: 30,
        batchSize: 10,
        admissionDeadlineMs: 5_000,
        pendingCollector: pending,
        createRequest: async (index) => {
          if (index === 15) {
            throw new Error("simulated early client admission error");
          }
          return request(server)
            .get("/test")
            .query({ i: index })
            .then((res) => res);
        },
      });
    } catch (error) {
      rejected = (error as Error).message.includes("simulated early client admission error");
    } finally {
      releaseGate();
      server.closeAllConnections?.();
      await Promise.allSettled(pending);
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect(rejected).toBe(true);
  });

  it.each([
    [WORKSPACE_GIT_SCAN_ERROR_CODES.saturated, 503],
    [WORKSPACE_GIT_SCAN_ERROR_CODES.timeout, 504],
  ] as const)("returns stable retryable %s responses", async (code, status) => {
    const service: WorkspaceFileResourceService = {
      getIssue: vi.fn(async () => ({ companyId })),
      list: vi.fn(async () => {
        throw new WorkspaceGitScanError(code, "Changed files temporarily unavailable");
      }),
      ...unavailableMethods(),
    };
    const app = createLoadApp(db, companyId, service);

    const response = await request(app)
      .get(`/api/issues/${code}/file-resources/list`)
      .query({ mode: "changed" });

    expect(response.status).toBe(status);
    expect(response.headers["retry-after"]).toBe("1");
    expect(response.body).toMatchObject({
      code,
      details: { code, retryable: true },
    });
  });

  it("cancels the underlying scan and releases its slot when the HTTP client disconnects", async () => {
    let runnerAborted = false;
    const scheduler = createWorkspaceGitOperationScheduler({
      concurrency: 1,
      runner: ({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          runnerAborted = true;
          reject(new WorkspaceGitScanError(
            WORKSPACE_GIT_SCAN_ERROR_CODES.cancelled,
            "cancelled",
          ));
        }, { once: true });
      }),
    });
    const service: WorkspaceFileResourceService = {
      getIssue: vi.fn(async () => ({ companyId })),
      list: vi.fn(async (_issueId, input, opts) => {
        await scheduler.run({
          workspacePath: path.join(tempRoot, "repository-a"),
          args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
          operation: "route_disconnect.changed_files",
          signal: opts?.scanContext?.signal,
          cacheTtlMs: 0,
        });
        return availableList(input);
      }),
      ...unavailableMethods(),
    };
    const app = createLoadApp(db, companyId, service);
    const pending = request(app)
      .get("/api/issues/disconnected/file-resources/list")
      .query({ mode: "changed" });
    const outcome = pending.then(
      (response) => response,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(scheduler.snapshot().activeCount).toBe(1));

    pending.abort();
    await outcome;

    await vi.waitFor(() => expect(scheduler.snapshot()).toMatchObject({ activeCount: 0, inFlightCount: 0 }));
    expect(runnerAborted).toBe(true);
  });
});
