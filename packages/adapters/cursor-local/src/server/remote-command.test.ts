import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { prepareCursorSandboxCommand } from "./remote-command.js";
import { createInertBypassProbes } from "@paperclipai/adapter-utils/test-fixtures/sandbox-fixture-runner";
import { createCursorSandboxRunner } from "./cursor-sandbox-test-policy.js";

// These cases only probe for the agent; no executable is registered, so nothing but the
// registered discovery shell forms can run, and only inside this test's own root.
function createLocalSandboxRunner(root: string) {
  return createCursorSandboxRunner({
    ownedRoots: [root],
    executables: [],
    backendOptions: { label: "cursor-remote-command" },
  });
}

async function writeFakeAgent(commandPath: string): Promise<void> {
  const script = `#!/bin/sh
printf '%s\\n' ok
`;
  await fs.mkdir(path.dirname(commandPath), { recursive: true });
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

describe("prepareCursorSandboxCommand", () => {
  it("refuses sandbox calls its test did not register before any process starts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-remote-command-bypass-"));
    try {
      const { calls, sentinelPath } = createInertBypassProbes(root);
      const runner = createLocalSandboxRunner(root);
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

  it("prefers the Cursor installer bin directory when the default agent entrypoint is installed there", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-remote-command-cursor-bin-"));
    const systemHomeDir = path.join(root, "system-home");
    const managedHomeDir = path.join(root, "managed-home");
    const remoteWorkspace = path.join(root, "workspace");
    const cursorAgentPath = path.join(systemHomeDir, ".cursor", "bin", "agent");
    await fs.mkdir(remoteWorkspace, { recursive: true });
    await writeFakeAgent(cursorAgentPath);

    try {
      const result = await prepareCursorSandboxCommand({
        runId: "run-remote-command-cursor-bin",
        target: {
          kind: "remote",
          transport: "sandbox",
          shellCommand: "bash",
          remoteCwd: remoteWorkspace,
          runner: createLocalSandboxRunner(root),
          timeoutMs: 30_000,
        },
        command: "agent",
        cwd: remoteWorkspace,
        env: {
          HOME: managedHomeDir,
          PATH: "/usr/bin:/bin",
        },
        remoteSystemHomeDirHint: systemHomeDir,
        timeoutSec: 30,
        graceSec: 5,
      });

      expect(result.command).toBe(cursorAgentPath);
      expect(result.preferredCommandPath).toBe(cursorAgentPath);
      expect(result.remoteSystemHomeDir).toBe(systemHomeDir);
      expect(result.addedPathEntry).toBe(path.join(systemHomeDir, ".local", "bin"));
      expect(result.env.PATH?.split(":").slice(0, 2)).toEqual([
        path.join(systemHomeDir, ".local", "bin"),
        path.join(systemHomeDir, ".cursor", "bin"),
      ]);
      expect(result.env.PATH).not.toContain(path.join(managedHomeDir, ".cursor", "bin"));
      expect(result.env.PATH).not.toContain(path.join(managedHomeDir, ".local", "bin"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps probing the original sandbox home after managed HOME overrides", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-remote-command-"));
    const systemHomeDir = path.join(root, "system-home");
    const managedHomeDir = path.join(root, "managed-home");
    const remoteWorkspace = path.join(root, "workspace");
    const systemAgentPath = path.join(systemHomeDir, ".local", "bin", "agent");
    await fs.mkdir(remoteWorkspace, { recursive: true });
    await writeFakeAgent(systemAgentPath);

    try {
      const result = await prepareCursorSandboxCommand({
        runId: "run-remote-command-1",
        target: {
          kind: "remote",
          transport: "sandbox",
          shellCommand: "bash",
          remoteCwd: remoteWorkspace,
          runner: createLocalSandboxRunner(root),
          timeoutMs: 30_000,
        },
        command: "agent",
        cwd: remoteWorkspace,
        env: {
          HOME: managedHomeDir,
          PATH: "/usr/bin:/bin",
        },
        remoteSystemHomeDirHint: systemHomeDir,
        timeoutSec: 30,
        graceSec: 5,
      });

      expect(result.command).toBe(systemAgentPath);
      expect(result.preferredCommandPath).toBe(systemAgentPath);
      expect(result.remoteSystemHomeDir).toBe(systemHomeDir);
      expect(result.addedPathEntry).toBe(path.join(systemHomeDir, ".local", "bin"));
      expect(result.env.PATH?.split(":").slice(0, 2)).toEqual([
        path.join(systemHomeDir, ".local", "bin"),
        path.join(systemHomeDir, ".cursor", "bin"),
      ]);
      expect(result.env.PATH).not.toContain(path.join(managedHomeDir, ".local", "bin"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
