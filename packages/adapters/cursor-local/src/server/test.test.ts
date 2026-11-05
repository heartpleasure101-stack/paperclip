import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SANDBOX_INSTALL_COMMAND } from "../index.js";
import { testEnvironment } from "./test.js";
import { createInertBypassProbes } from "@paperclipai/adapter-utils/test-fixtures/sandbox-fixture-runner";
import { createCursorSandboxRunner } from "./cursor-sandbox-test-policy.js";

function buildFakeAgentScript(): string {
  return `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' 'Cursor Agent 1.2.3'
  exit 0
fi
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"cursor-session-envtest-1","model":"auto"}'
printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"output_text","text":"hello"}]}}'
printf '%s\\n' '{"type":"result","subtype":"success","session_id":"cursor-session-envtest-1","result":"ok"}'
`;
}

function buildInstallSimulationCommand(commandPath: string): string {
  return [
    `mkdir -p ${JSON.stringify(path.dirname(commandPath))}`,
    `cat > ${JSON.stringify(commandPath)} <<'EOF'`,
    buildFakeAgentScript(),
    "EOF",
    `chmod +x ${JSON.stringify(commandPath)}`,
  ].join("\n");
}

function createSandboxRunner(options: { root: string; homeDir: string; installCommandPath: string }) {
  const systemPath = "/usr/bin:/bin";
  // Exactly the registered forms, roots and fixture agent may run; the installer request is only
  // ever replaced by the local stub and never reaches a real backend.
  return createCursorSandboxRunner({
    ownedRoots: [options.root],
    executables: [options.installCommandPath],
    installStub: {
      request: SANDBOX_INSTALL_COMMAND,
      script: buildInstallSimulationCommand(options.installCommandPath),
    },
    backendOptions: {
      label: "cursor-envtest-runner",
      transformEnv: (env) => ({
        ...(env ?? {}),
        HOME: env?.HOME ?? options.homeDir,
        PATH: env?.PATH ?? systemPath,
      }),
    },
  });
}

describe("cursor testEnvironment", () => {
  it("shows the probe failure after an informational retrieval trace notice", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-probe-diagnostic-"));
    const command = path.join(root, "agent");
    await fs.writeFile(command, `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' 'Cursor Agent 1.2.3'
  exit 0
fi
printf '%s\\n' "cursor-retrieval: tracing to '/tmp/fixture.log'" 'Provider connection failed' >&2
exit 7
`, { mode: 0o755 });
    try {
      const result = await testEnvironment({
        companyId: "company-1", adapterType: "cursor",
        config: { command: "agent", cwd: root, env: { PATH: `${root}${path.delimiter}${process.env.PATH ?? ""}`, CURSOR_API_KEY: "fixture-cursor-key" } },
      });
      expect(result.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "cursor_hello_probe_failed", detail: "Provider connection failed" }),
      ]));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses sandbox calls its test did not register before any process starts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-probe-bypass-"));
    try {
      const { calls, sentinelPath } = createInertBypassProbes(root);
      const runner = createSandboxRunner({
        root,
        homeDir: path.join(root, "home"),
        installCommandPath: path.join(root, "home", ".cursor", "bin", "agent"),
      });
      const spawned = vi.fn();
      for (const { name, call } of calls) {
        await expect(runner.execute({ ...call, onSpawn: spawned }), name).rejects.toThrow(/blocked before execution/);
      }
      expect(spawned).not.toHaveBeenCalled();
      await expect(fs.stat(sentinelPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(runner.installCommands).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("re-resolves the installed agent under ~/.cursor/bin and verifies --version before the hello probe", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-envtest-"));
    const homeDir = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    const remoteWorkspace = path.join(root, "remote-workspace");
    const agentPath = path.join(homeDir, ".cursor", "bin", "agent");
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(remoteWorkspace, { recursive: true });

    const runner = createSandboxRunner({
      root,
      homeDir,
      installCommandPath: agentPath,
    });

    try {
      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "cursor",
        config: {
          command: "agent",
          cwd: workspace,
          env: {
            PATH: "/usr/bin:/bin",
          },
        },
        executionTarget: {
          kind: "remote",
          transport: "sandbox",
          shellCommand: "bash",
          remoteCwd: remoteWorkspace,
          runner,
          timeoutMs: 30_000,
        },
      });

      expect(result.status).toBe("pass");
      expect(runner.installCommands).toEqual([SANDBOX_INSTALL_COMMAND]);
      expect(result.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "cursor_command_resolvable",
            level: "info",
            message: `Command is executable: ${agentPath}`,
          }),
          expect.objectContaining({
            code: "cursor_version_probe_passed",
            level: "info",
            detail: "Cursor Agent 1.2.3",
          }),
          expect.objectContaining({
            code: "cursor_hello_probe_passed",
            level: "info",
          }),
        ]),
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
