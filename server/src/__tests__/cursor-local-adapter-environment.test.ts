import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { testEnvironment } from "@paperclipai/adapter-cursor-local/server";
import { createInertBypassProbes } from "@paperclipai/adapter-utils/test-fixtures/sandbox-fixture-runner";
import { createCursorSandboxRunner } from "./helpers/sandbox-install-guard.js";

async function writeFakeAgentCommand(binDir: string, argsCapturePath: string): Promise<string> {
  const commandPath = path.join(binDir, "agent");
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const outPath = process.env.PAPERCLIP_TEST_ARGS_PATH;
if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(process.argv.slice(2)), "utf8");
}
console.log(JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "output_text", text: "hello" }] },
}));
console.log(JSON.stringify({
  type: "result",
  subtype: "success",
  result: "hello",
}));
`;
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

async function writeFakeCursorAgentCommand(commandPath: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const outPath = process.env.PAPERCLIP_TEST_ARGS_PATH;
if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify({
    command: process.argv[1],
    argv: process.argv.slice(2),
    path: process.env.PATH || "",
  }), "utf8");
}
console.log(JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "output_text", text: "hello" }] },
}));
console.log(JSON.stringify({
  type: "result",
  subtype: "success",
  result: "hello",
}));
`;
  await fs.mkdir(path.dirname(commandPath), { recursive: true });
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

// The sandbox runner is guarded before any backend runs: the test registers its own root and the
// exact fixture executable, so an unregistered call (including an installer) is refused.
function createLocalSandboxRunner(root: string, executables: string[]) {
  return createCursorSandboxRunner({ ownedRoots: [root], executables });
}

describe("cursor environment diagnostics", () => {
  beforeEach(() => {
    vi.stubEnv("CURSOR_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a missing working directory when cwd is absolute", async () => {
    const cwd = path.join(
      os.tmpdir(),
      `paperclip-cursor-local-cwd-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      "workspace",
    );

    await fs.rm(path.dirname(cwd), { recursive: true, force: true });

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        command: process.execPath,
        cwd,
      },
    });

    expect(result.checks.some((check) => check.code === "cursor_cwd_valid")).toBe(true);
    expect(result.checks.some((check) => check.level === "error")).toBe(false);
    const stats = await fs.stat(cwd);
    expect(stats.isDirectory()).toBe(true);
    await fs.rm(path.dirname(cwd), { recursive: true, force: true });
  });

  it("adds --yolo to hello probe args by default", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-cursor-local-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    const argsCapturePath = path.join(root, "args.json");
    await fs.mkdir(binDir, { recursive: true });
    await writeFakeAgentCommand(binDir, argsCapturePath);

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        command: "agent",
        cwd,
        env: {
          CURSOR_API_KEY: "test-key",
          PAPERCLIP_TEST_ARGS_PATH: argsCapturePath,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    });

    expect(result.status).toBe("pass");
    const args = JSON.parse(await fs.readFile(argsCapturePath, "utf8")) as string[];
    expect(args).toContain("--yolo");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("does not auto-add --yolo when extraArgs already bypass trust", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-cursor-local-probe-extra-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    const argsCapturePath = path.join(root, "args.json");
    await fs.mkdir(binDir, { recursive: true });
    await writeFakeAgentCommand(binDir, argsCapturePath);

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        command: "agent",
        cwd,
        extraArgs: ["--yolo"],
        env: {
          CURSOR_API_KEY: "test-key",
          PAPERCLIP_TEST_ARGS_PATH: argsCapturePath,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    });

    expect(result.status).toBe("pass");
    const args = JSON.parse(await fs.readFile(argsCapturePath, "utf8")) as string[];
    expect(args).toContain("--yolo");
    expect(args).not.toContain("--trust");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("prefers ~/.local/bin/cursor-agent for remote sandbox probes when using the default command", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-cursor-sandbox-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const homeDir = path.join(root, "home");
    const remoteCwd = path.join(root, "workspace");
    const argsCapturePath = path.join(root, "args.json");
    const cursorAgentPath = path.join(homeDir, ".local", "bin", "cursor-agent");
    await fs.mkdir(remoteCwd, { recursive: true });
    await writeFakeCursorAgentCommand(cursorAgentPath);
    // The guarded runner does not inherit the host PATH, and the production sandbox PATH has no
    // Node. The `#!/usr/bin/env node` fixture gets its runtime from its own fake HOME instead.
    await fs.symlink(process.execPath, path.join(path.dirname(cursorAgentPath), "node"));

    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "cursor",
        executionTarget: {
          kind: "remote",
          transport: "sandbox",
          remoteCwd,
          runner: createLocalSandboxRunner(root, [cursorAgentPath]),
          timeoutMs: 30_000,
        },
        config: {
          command: "agent",
          cwd: remoteCwd,
          env: {
            CURSOR_API_KEY: "test-key",
            PAPERCLIP_TEST_ARGS_PATH: argsCapturePath,
          },
        },
      });

      expect(result.status).toBe("pass");
      const capture = JSON.parse(await fs.readFile(argsCapturePath, "utf8")) as {
        command: string;
        argv: string[];
        path: string;
      };
      expect(capture.command).toBe(cursorAgentPath);
      expect(capture.path.split(":")[0]).toBe(path.join(homeDir, ".local", "bin"));
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses sandbox calls its test did not register before any process starts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-sandbox-bypass-"));
    try {
      const { calls, sentinelPath } = createInertBypassProbes(root);
      const runner = createLocalSandboxRunner(root, []);
      const spawned = vi.fn();
      for (const { name, call } of calls) {
        await expect(runner.execute({ ...call, onSpawn: spawned }), name).rejects.toThrow(/blocked before execution/);
      }
      expect(spawned).not.toHaveBeenCalled();
      await expect(fs.stat(sentinelPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("emits cursor_native_auth_present when cli-config.json has authInfo and CURSOR_API_KEY is unset", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-cursor-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const cursorHome = path.join(root, ".cursor");
    const cwd = path.join(root, "workspace");

    try {
      await fs.mkdir(cursorHome, { recursive: true });
      await fs.writeFile(
        path.join(cursorHome, "cli-config.json"),
        JSON.stringify({
          authInfo: {
            email: "test@example.com",
            displayName: "Test User",
            userId: 12345,
          },
        }),
      );

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "cursor",
        config: {
          command: process.execPath,
          cwd,
          env: { CURSOR_HOME: cursorHome },
        },
      });

      expect(result.checks.some((check) => check.code === "cursor_native_auth_present")).toBe(true);
      expect(result.checks.some((check) => check.code === "cursor_api_key_missing")).toBe(false);
      const authCheck = result.checks.find((check) => check.code === "cursor_native_auth_present");
      expect(authCheck?.detail).toContain("test@example.com");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("emits cursor_api_key_missing when neither env var nor native auth exists", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-cursor-noauth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const cursorHome = path.join(root, ".cursor");
    const cwd = path.join(root, "workspace");

    try {
      await fs.mkdir(cursorHome, { recursive: true });
      // No cli-config.json written

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "cursor",
        config: {
          command: process.execPath,
          cwd,
          env: { CURSOR_HOME: cursorHome },
        },
      });

      expect(result.checks.some((check) => check.code === "cursor_api_key_missing")).toBe(true);
      expect(result.checks.some((check) => check.code === "cursor_native_auth_present")).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
