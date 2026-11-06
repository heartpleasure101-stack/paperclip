import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPromptContextFixture } from "@paperclipai/adapter-utils/test-fixtures/prompt-context";

const { runChildProcess, ensureCommandResolvable, resolveCommandForLogs } = vi.hoisted(() => ({
  runChildProcess: vi.fn(),
  ensureCommandResolvable: vi.fn(async () => undefined),
  resolveCommandForLogs: vi.fn(async () => "pi"),
}));

vi.mock("@paperclipai/adapter-utils/server-utils", async () => {
  const actual = await vi.importActual<typeof import("@paperclipai/adapter-utils/server-utils")>(
    "@paperclipai/adapter-utils/server-utils",
  );
  return { ...actual, ensureCommandResolvable, resolveCommandForLogs, runChildProcess };
});

vi.mock("./models.js", async () => {
  const actual = await vi.importActual<typeof import("./models.js")>("./models.js");
  return {
    ...actual,
    ensurePiModelConfiguredAndAvailable: vi.fn(async () => [
      { id: "openai/gpt-5.4-mini", label: "openai/gpt-5.4-mini" },
    ]),
  };
});

import { execute } from "./execute.js";

const BODY_MARKER = "完成 Pi 摘要去重的第一階段實作";
const SUMMARY_BODY = `# Continuation Summary\n\n- ${BODY_MARKER}\n- 保留來源與信任邊界`;
const REFERENCE_MARKER = "Same text as completedWork in the untrusted continuation evidence above";

const okResult = () => ({
  exitCode: 0,
  signal: null,
  timedOut: false,
  stdout: JSON.stringify({
    type: "turn_end",
    message: { role: "assistant", content: "done", usage: { input: 10, output: 20, cacheRead: 0, cost: { total: 0.01 } } },
    toolResults: [],
  }),
  stderr: "",
  pid: 123,
  startedAt: new Date().toISOString(),
});

function contextWithDuplicateSummary(overrides: { completedWork?: string | null } = {}) {
  const fixture = createPromptContextFixture();
  const completedWork = "completedWork" in overrides ? overrides.completedWork! : SUMMARY_BODY;
  const executionContinuation = { ...fixture.executionContinuation, completedWork };
  return {
    ...fixture,
    executionContinuation,
    paperclipWake: {
      ...fixture.paperclipWake,
      executionContinuation,
      continuationSummary: {
        key: "continuation-summary",
        title: "Continuation Summary",
        body: SUMMARY_BODY,
        bodyTruncated: false,
        updatedAt: "2026-11-04T00:00:00.000Z",
      },
    },
  };
}

function userPromptOf(callIndex: number): string {
  const call = runChildProcess.mock.calls.at(callIndex) as unknown as [string, string, string[]] | undefined;
  return String(call?.[2].at(-1) ?? "");
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("pi_local 單次輸入的相同摘要去重（實際 prompt 建立入口）", () => {
  const cleanupDirs: string[] = [];

  beforeEach(() => {
    runChildProcess.mockReset();
    runChildProcess.mockImplementation(async () => okResult());
  });

  afterEach(async () => {
    while (cleanupDirs.length > 0) {
      await rm(cleanupDirs.pop()!, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  async function setup(prefix: string) {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
    cleanupDirs.push(rootDir);
    await mkdir(rootDir, { recursive: true });
    return rootDir;
  }

  const baseArgs = (rootDir: string, runtime: Record<string, unknown>, context: Record<string, unknown>) =>
    ({
      runId: "run-summary-dedup",
      agent: { id: "agent-1", companyId: "company-1", name: "Pi Builder", adapterType: "pi_local", adapterConfig: {} },
      runtime,
      config: { command: "pi", model: "openai/gpt-5.4-mini", cwd: rootDir },
      context,
      onLog: async () => {},
    }) as never;

  it("新 session：最終送給 Pi 的 prompt 只含一份相同摘要正文，並保留新事件", async () => {
    const rootDir = await setup("paperclip-pi-dedup-new-");
    await execute(
      baseArgs(
        rootDir,
        { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
        { ...contextWithDuplicateSummary(), paperclipWorkspace: { cwd: rootDir, source: "project_primary" } },
      ),
    );
    const prompt = userPromptOf(-1);
    expect(count(prompt, BODY_MARKER)).toBe(1);
    expect(prompt).toContain(REFERENCE_MARKER);
    expect(prompt).toContain("Issue continuation summary:");
    expect(prompt).toContain("Untrusted continuation evidence");
    expect(prompt).toContain("Change the final scope to the launch checklist.");
  });

  it("接續 session：同樣只去除本次相同副本，唯一摘要仍在", async () => {
    const rootDir = await setup("paperclip-pi-dedup-resume-");
    const sessionPath = path.join(rootDir, "session.jsonl");
    await writeFile(sessionPath, `${JSON.stringify({ type: "session", cwd: rootDir })}\n`, "utf8");
    await execute(
      baseArgs(
        rootDir,
        { sessionId: sessionPath, sessionParams: { sessionId: sessionPath, cwd: rootDir }, sessionDisplayId: "s", taskKey: null },
        contextWithDuplicateSummary(),
      ),
    );
    const call = runChildProcess.mock.calls.at(-1) as unknown as [string, string, string[]];
    expect(call[2]).toContain(sessionPath);
    const prompt = userPromptOf(-1);
    expect(prompt).toContain("Paperclip Resume Delta");
    expect(count(prompt, BODY_MARKER)).toBe(1);
    expect(prompt).toContain(REFERENCE_MARKER);
  });

  it("接續 session 但兩份正文不同：維持兩份，不因接續而省略", async () => {
    const rootDir = await setup("paperclip-pi-dedup-resume-diff-");
    const sessionPath = path.join(rootDir, "session.jsonl");
    await writeFile(sessionPath, `${JSON.stringify({ type: "session", cwd: rootDir })}\n`, "utf8");
    await execute(
      baseArgs(
        rootDir,
        { sessionId: sessionPath, sessionParams: { sessionId: sessionPath, cwd: rootDir }, sessionDisplayId: "s", taskKey: null },
        contextWithDuplicateSummary({ completedWork: `${SUMMARY_BODY}\n- 另一行` }),
      ),
    );
    const prompt = userPromptOf(-1);
    expect(count(prompt, BODY_MARKER)).toBe(2);
    expect(prompt).not.toContain(REFERENCE_MARKER);
  });

  it("接續失敗後的 fresh retry：兩次嘗試各自只去除本次副本，且 fresh 嘗試保留完整歷史", async () => {
    const rootDir = await setup("paperclip-pi-dedup-retry-");
    const sessionPath = path.join(rootDir, "session.jsonl");
    await writeFile(sessionPath, `${JSON.stringify({ type: "session", cwd: rootDir })}\n`, "utf8");
    runChildProcess.mockReset();
    runChildProcess
      .mockImplementationOnce(async () => ({ ...okResult(), exitCode: 1, stdout: "", stderr: "error: unknown session\n" }))
      .mockImplementation(async () => okResult());
    await execute(
      baseArgs(
        rootDir,
        { sessionId: sessionPath, sessionParams: { sessionId: sessionPath, cwd: rootDir }, sessionDisplayId: "s", taskKey: null },
        contextWithDuplicateSummary(),
      ),
    );
    expect(runChildProcess).toHaveBeenCalledTimes(2);
    const resumedPrompt = userPromptOf(0);
    const freshPrompt = userPromptOf(1);
    expect(resumedPrompt).toContain("Paperclip Resume Delta");
    expect(freshPrompt).toContain("Paperclip Wake Payload");
    for (const prompt of [resumedPrompt, freshPrompt]) {
      expect(count(prompt, BODY_MARKER)).toBe(1);
      expect(prompt).toContain(REFERENCE_MARKER);
    }
    // fresh 嘗試重新選擇完整歷史：先前被 resume delta 省略的第一則留言回來
    expect(freshPrompt).toContain('"id":"comment-first"');
    expect(resumedPrompt).not.toContain('"id":"comment-first"');
  });

  it("只有一份摘要時，Pi 入口不省略唯一摘要", async () => {
    const rootDir = await setup("paperclip-pi-dedup-single-");
    const context = contextWithDuplicateSummary({ completedWork: null });
    await execute(
      baseArgs(
        rootDir,
        { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
        { ...context, paperclipWorkspace: { cwd: rootDir, source: "project_primary" } },
      ),
    );
    const prompt = userPromptOf(-1);
    expect(count(prompt, BODY_MARKER)).toBe(1);
    expect(prompt).not.toContain(REFERENCE_MARKER);
    expect(prompt).toContain("Issue continuation summary:\n# Continuation Summary");
  });
});
