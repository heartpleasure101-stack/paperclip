import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import { SANDBOX_INSTALL_COMMAND } from "../index.js";
import { execute } from "./execute.js";
import { createInertBypassProbes } from "@paperclipai/adapter-utils/test-fixtures/sandbox-fixture-runner";
import { createCursorSandboxRunner } from "./cursor-sandbox-test-policy.js";
import { createPromptContextFixture } from "@paperclipai/adapter-utils/test-fixtures/prompt-context";

type PrepareCursorSandboxCommandInput = {
  runId: string;
  target: AdapterExecutionTarget | null | undefined;
  command: string;
  cwd: string;
  env: Record<string, string>;
  remoteSystemHomeDirHint?: string | null;
  timeoutSec: number;
  graceSec: number;
};

type PrepareCursorSandboxCommandResult = {
  command: string;
  env: Record<string, string>;
  remoteSystemHomeDir: string | null;
  addedPathEntry: string | null;
  preferredCommandPath: string | null;
};

const {
  setPrepareCursorSandboxCommand,
} = vi.hoisted(() => {
  const setPrepareCursorSandboxCommand = vi.fn<
    (input: PrepareCursorSandboxCommandInput) => Promise<PrepareCursorSandboxCommandResult>
  >();
  return { setPrepareCursorSandboxCommand };
});

vi.mock("@paperclipai/adapter-utils/execution-target", async () => {
  const actual = await vi.importActual<typeof import("@paperclipai/adapter-utils/execution-target")>(
    "@paperclipai/adapter-utils/execution-target",
  );
  return {
    ...actual,
    startAdapterExecutionTargetPaperclipBridge: async () => null,
  };
});

vi.mock("./remote-command.js", async () => {
  const actual = await vi.importActual<typeof import("./remote-command.js")>("./remote-command.js");
  return {
    ...actual,
    prepareCursorSandboxCommand: async (input: Parameters<typeof actual.prepareCursorSandboxCommand>[0]) => {
      return setPrepareCursorSandboxCommand(input);
    },
  };
});

function buildFakeAgentScript(captureDir: string): string {
  return `#!/bin/sh
cat > ${JSON.stringify(path.join(captureDir, "prompt.txt"))}
printf '%s' "$0" > ${JSON.stringify(path.join(captureDir, "command.txt"))}
printf '%s' "$PATH" > ${JSON.stringify(path.join(captureDir, "path.txt"))}
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"cursor-session-fresh-1","model":"auto"}'
printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"output_text","text":"hello"}]}}'
printf '%s\\n' '{"type":"result","subtype":"success","session_id":"cursor-session-fresh-1","result":"ok"}'
`;
}

function buildInstallSimulationCommand(commandPath: string, captureDir: string): string {
  return [
    `mkdir -p ${JSON.stringify(path.dirname(commandPath))}`,
    `mkdir -p ${JSON.stringify(captureDir)}`,
    `cat > ${JSON.stringify(commandPath)} <<'EOF'`,
    buildFakeAgentScript(captureDir),
    "EOF",
    `chmod +x ${JSON.stringify(commandPath)}`,
  ].join("\n");
}

function createFreshLeaseSandboxRunner(options: {
  root: string;
  homeDir: string;
  installCommandPath: string;
  captureDir: string;
}) {
  const fixtureBin = path.join(options.homeDir, "fixture-system-bin");
  const fixtureReady = (async () => {
    await fs.mkdir(fixtureBin, { recursive: true });
    await fs.symlink(process.execPath, path.join(fixtureBin, "node"));
    await fs.writeFile(path.join(fixtureBin, "curl"), "#!/bin/sh\nexit 97\n", { mode: 0o755 });
  })();
  const systemPath = [
    fixtureBin,
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(path.delimiter);

  // The runner refuses anything this test did not register, and the known installer request is
  // only ever replaced by the local stub below; it never reaches a real backend.
  const guarded = createCursorSandboxRunner({
    ownedRoots: [options.root],
    executables: [options.installCommandPath],
    installStub: {
      request: SANDBOX_INSTALL_COMMAND,
      script: buildInstallSimulationCommand(options.installCommandPath, options.captureDir),
    },
    backendOptions: {
      label: "cursor-fresh-lease",
      // A fresh remote lease has its own PATH, independent of installed host agents.
      transformEnv: (env) => ({
        ...(env ?? {}),
        HOME: env?.HOME ?? options.homeDir,
        PATH: `${path.join(options.homeDir, ".local", "bin")}${path.delimiter}${systemPath}`,
      }),
    },
  });

  return {
    installCommands: guarded.installCommands,
    refusals: guarded.refusals,
    execute: async (input: Parameters<typeof guarded.execute>[0]) => {
      await fixtureReady;
      if (["agent", "cursor-agent"].includes(path.basename(input.command)) && input.command !== options.installCommandPath) {
        throw new Error("Fresh sandbox fixture refused an agent outside its installation path");
      }
      return await guarded.execute(input);
    },
  };
}

describe("cursor execute", () => {
  it.each([0, 7])("settles legacy step usage only after a clean process exit (%s)", async (exitCode) => {
    setPrepareCursorSandboxCommand.mockReset();
    setPrepareCursorSandboxCommand.mockImplementation(async (input) => ({
      command: input.command, env: input.env, remoteSystemHomeDir: null,
      addedPathEntry: null, preferredCommandPath: null,
    }));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-legacy-"));
    const command = path.join(root, "agent.sh");
    await fs.writeFile(command, `#!/bin/sh
cat >/dev/null
printf '%s\\n' '{"type":"step_finish","part":{"tokens":{"input":20,"output":5},"cost":0.01}}'
exit ${exitCode}
`, { mode: 0o755 });
    const onUsage = vi.fn();
    try {
      const result = await execute({
        runId: "run-legacy", agent: { id: "agent-1", companyId: "company-1", name: "Cursor", adapterType: "cursor", adapterConfig: {} },
        runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
        config: { command, cwd: root }, context: createPromptContextFixture(),
        authToken: "fixture-run-token", onLog: async () => {}, onUsage,
      });
      expect(result.usage).toMatchObject({ inputTokens: 20, outputTokens: 5 });
      expect(result.costUsd).toBe(0.01);
      expect(result.usageComplete).toBe(exitCode === 0);
      expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ complete: false, costUsd: 0.01 }));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    { detail: "Authentication failed", structured: "", expected: "Authentication failed" },
    { detail: "", structured: "", expected: "Cursor exited with code 7" },
    { detail: "stderr fallback", structured: '{"type":"error","message":"Structured failure"}', expected: "Structured failure" },
  ])("keeps the actual failure after a retrieval trace announcement: $expected", async ({ detail, structured, expected }) => {
    setPrepareCursorSandboxCommand.mockReset();
    setPrepareCursorSandboxCommand.mockImplementation(async (input) => ({
      command: input.command, env: input.env, remoteSystemHomeDir: null,
      addedPathEntry: null, preferredCommandPath: null,
    }));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-diagnostic-"));
    const command = path.join(root, "agent.sh");
    const trace = "cursor-retrieval: tracing to '/tmp/fixture-cursor-retrieval.log'";
    // Values are fixed test fixtures, passed through env rather than shell code.
    await fs.writeFile(command, `#!/bin/sh
cat >/dev/null
printf '%s\\n' "$FIXTURE_TRACE" "$FIXTURE_DETAIL" >&2
printf '%s\\n' "$FIXTURE_STRUCTURED"
exit 7
`, { mode: 0o755 });
    try {
      const result = await execute({
        runId: "run-diagnostic-1",
        agent: { id: "agent-1", companyId: "company-1", name: "Cursor", adapterType: "cursor", adapterConfig: {} },
        runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
        config: { command, cwd: root, env: { FIXTURE_TRACE: trace, FIXTURE_DETAIL: detail, FIXTURE_STRUCTURED: structured } },
        context: createPromptContextFixture(), authToken: "fixture-run-token", onLog: async () => {},
      });
      expect(result.exitCode).toBe(7);
      expect(result.errorMessage).toBe(expected);
      expect(result.resultJson?.stderr).toContain(trace);
      expect(result.resultJson?.stderr).toContain(detail);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("installs the default agent command on a fresh sandbox lease before execution", async () => {
    setPrepareCursorSandboxCommand.mockReset();
    setPrepareCursorSandboxCommand.mockImplementation(async (input) => {
      const actual = await vi.importActual<typeof import("./remote-command.js")>("./remote-command.js");
      return actual.prepareCursorSandboxCommand(input);
    });

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-fresh-lease-"));
    const homeDir = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    const remoteWorkspace = path.join(root, "remote-workspace");
    const captureDir = path.join(root, "capture");
    const agentPath = path.join(homeDir, ".local", "bin", "agent");
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(remoteWorkspace, { recursive: true });

    const runner = createFreshLeaseSandboxRunner({
      root,
      homeDir,
      installCommandPath: agentPath,
      captureDir,
    });

    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      const result = await execute({
        runId: "run-fresh-lease-1",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "Cursor Coder",
          adapterType: "cursor",
          adapterConfig: {},
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        executionTarget: {
          kind: "remote",
          transport: "sandbox",
          remoteCwd: remoteWorkspace,
          runner,
          timeoutMs: 30_000,
        },
        config: {
          command: "agent",
          cwd: workspace,
          promptTemplate: "Follow the paperclip heartbeat.",
        },
        context: createPromptContextFixture(),
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.errorMessage).toBeNull();
      expect(runner.installCommands).toEqual([SANDBOX_INSTALL_COMMAND]);

      const command = await fs.readFile(path.join(captureDir, "command.txt"), "utf8");
      const runtimePath = await fs.readFile(path.join(captureDir, "path.txt"), "utf8");
      const prompt = await fs.readFile(path.join(captureDir, "prompt.txt"), "utf8");
      expect(command).toBe(agentPath);
      expect(runtimePath.split(path.delimiter)).toContain(path.join(homeDir, ".local", "bin"));
      expect(prompt).toContain("Follow the paperclip heartbeat.");
      expect(prompt).toContain("## Owned assignment");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses fresh-lease runner calls its test did not register before any process starts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-fresh-lease-bypass-"));
    try {
      const { calls, sentinelPath } = createInertBypassProbes(root);
      const runner = createFreshLeaseSandboxRunner({
        root,
        homeDir: path.join(root, "home"),
        installCommandPath: path.join(root, "home", ".local", "bin", "agent"),
        captureDir: path.join(root, "capture"),
      });
      const spawned = vi.fn();
      for (const { name, call } of calls) {
        await expect(runner.execute({ ...call, onSpawn: spawned }), name).rejects.toThrow(/refused|blocked before execution/);
      }
      expect(spawned).not.toHaveBeenCalled();
      await expect(fs.stat(sentinelPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(runner.installCommands).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("reruns sandbox command resolution after managed runtime setup and keeps the original sandbox home", async () => {
    setPrepareCursorSandboxCommand.mockReset();
    const prepareInputs: PrepareCursorSandboxCommandInput[] = [];
    let finalPreparedCommand: string | null = null;

    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-fresh-lease-managed-"));
    const workspaceDir = path.join(rootDir, "workspace");
    const remoteWorkspace = path.join(rootDir, "remote-workspace");
    const systemHomeDir = path.join(rootDir, "system-home");
    const managedCaptureDir = path.join(rootDir, "managed-capture");
    const fixtureBinDir = path.join(rootDir, "fixture-bin");
    const networkAttemptPath = path.join(rootDir, "network-attempted");
    await fs.mkdir(fixtureBinDir, { recursive: true });
    // A regression in installer interception must fail locally, not download
    // and execute the real CLI or depend on an external server's latency.
    await fs.writeFile(path.join(fixtureBinDir, "curl"), `#!/bin/sh
: > "$FIXTURE_CURL_ATTEMPT_PATH"
exit 97
`, { mode: 0o755 });
    await fs.mkdir(managedCaptureDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(remoteWorkspace, { recursive: true });
    const preferredAgentScript = `#!/bin/sh
cat >/dev/null
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"cursor-session-fresh-1","model":"auto"}'
printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"output_text","text":"hello"}]}}'
printf '%s\\n' '{"type":"result","subtype":"success","session_id":"cursor-session-fresh-1","result":"ok"}'
`;

    setPrepareCursorSandboxCommand.mockImplementation(async (input) => {
      const call = prepareInputs.length;
      prepareInputs.push(input);
      if (call === 0) {
        return {
          command: input.command,
          env: input.env,
          remoteSystemHomeDir: systemHomeDir,
          addedPathEntry: null,
          preferredCommandPath: null,
        };
      }

      expect(input.remoteSystemHomeDirHint).toBe(systemHomeDir);
      const preferredCommandPath = path.join(systemHomeDir, ".local", "bin", input.command);
      finalPreparedCommand = preferredCommandPath;
      const runtimeEnv = {
        ...input.env,
        PATH: `${path.join(systemHomeDir, ".local", "bin")}${path.delimiter}${input.env.PATH ?? process.env.PATH ?? "/usr/bin:/bin"}`,
      };
      await fs.mkdir(path.dirname(preferredCommandPath), { recursive: true });
      await fs.writeFile(preferredCommandPath, preferredAgentScript);
      await fs.chmod(preferredCommandPath, 0o755);
      await fs.writeFile(path.join(managedCaptureDir, "agent-output.log"), preferredCommandPath);

      return {
        command: preferredCommandPath,
        env: runtimeEnv,
        remoteSystemHomeDir: systemHomeDir,
        addedPathEntry: path.join(systemHomeDir, ".local", "bin"),
        preferredCommandPath,
      };
    });

    const runnerState = {
      commands: [] as string[],
      installCommands: [] as string[],
    };
    // The managed-runtime restore path probes the generated archive with
    // `wc -c` before reading bounded `dd | base64` chunks. Keep this fixture's
    // shell seam faithful to that protocol instead of returning empty stdout
    // for every shell command. Exactly the registered forms, roots and fixture agent may run,
    // and the installer request is only ever replaced by the local stub, never run.
    const guarded = createCursorSandboxRunner({
      ownedRoots: [rootDir],
      executables: [path.join(systemHomeDir, ".local", "bin", "agent")],
      installStub: {
        request: SANDBOX_INSTALL_COMMAND,
        script: buildInstallSimulationCommand(path.join(systemHomeDir, ".local", "bin", "agent"), managedCaptureDir),
      },
      backendOptions: {
        label: "cursor-fresh-lease",
        passEnv: ["FIXTURE_CURL_ATTEMPT_PATH"],
        cwd: () => remoteWorkspace,
        timeoutSec: () => 30,
        transformEnv: (env) => ({
          ...(env ?? {}),
          PATH: `${fixtureBinDir}:${env?.PATH ?? ""}:/usr/bin:/bin`,
          FIXTURE_CURL_ATTEMPT_PATH: networkAttemptPath,
        }),
      },
    });
    // Exercise actual bounded file reads during managed-home restoration;
    // reporting empty success for every shell command hides missing bytes.
    const runner = {
      execute: async (input: Parameters<typeof guarded.execute>[0]) => {
        runnerState.commands.push(input.command);
        try {
          return await guarded.execute(input);
        } finally {
          runnerState.installCommands = [...guarded.installCommands];
        }
      },
    };

    const runMeta: Array<{ command?: string; [key: string]: unknown }> = [];
    const previousHome = process.env.HOME;
    process.env.HOME = systemHomeDir;

    try {
      const command = "agent";
      const result = await execute({
        runId: "run-fresh-lease-managed",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "Cursor Coder",
          adapterType: "cursor",
          adapterConfig: {},
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        executionTarget: {
          kind: "remote",
          transport: "sandbox",
          remoteCwd: remoteWorkspace,
          providerKey: "fixture",
          runner: runner,
          timeoutMs: 30_000,
        },
        config: {
          command,
          cwd: workspaceDir,
          promptTemplate: "Run against runtime-managed command.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
        onMeta: async (meta) => {
          runMeta.push(meta as unknown as { command?: string; [key: string]: unknown });
        },
      });

      expect(result.exitCode).toBe(0);
      await expect(fs.stat(networkAttemptPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(runnerState.installCommands).toEqual([SANDBOX_INSTALL_COMMAND]);
      expect(prepareInputs).toHaveLength(2);
      expect(prepareInputs[1].env.HOME).toBeTruthy();
      expect(prepareInputs[1].env.HOME).not.toBe(systemHomeDir);
      expect(finalPreparedCommand).not.toBeNull();
      expect(finalPreparedCommand).toMatch(/\.local\/(bin|sbin)\/agent$/);
      const resolvedCommand = runMeta.find(Boolean)?.command as string | undefined;
      expect(resolvedCommand).toMatch(/\.local\/bin\/agent$/);
      expect(resolvedCommand).toContain(path.join(systemHomeDir, ".local", "bin", command));

      // The same runner refuses anything this test did not register, before a process starts.
      const { calls, sentinelPath } = createInertBypassProbes(rootDir);
      const spawned = vi.fn();
      for (const { name, call } of calls) {
        await expect(runner.execute({ ...call, onSpawn: spawned }), name).rejects.toThrow(/blocked before execution/);
      }
      expect(spawned).not.toHaveBeenCalled();
      await expect(fs.stat(sentinelPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  it("rebuilds the full assignment after an unknown-session resume", async () => {
    setPrepareCursorSandboxCommand.mockReset();
    setPrepareCursorSandboxCommand.mockImplementation(async (input) => ({
      command: input.command,
      env: input.env,
      remoteSystemHomeDir: null,
      addedPathEntry: null,
      preferredCommandPath: null,
    }));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-resume-"));
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "agent.sh");
    const capturePath = path.join(root, "prompts.txt");
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(commandPath, `#!/bin/sh
count_file=${JSON.stringify(path.join(root, "count"))}
count=$(cat "$count_file" 2>/dev/null || printf '0')
count=$((count + 1))
printf '%s' "$count" > "$count_file"
printf '\\n--- prompt %s ---\\n' "$count" >> ${JSON.stringify(capturePath)}
cat >> ${JSON.stringify(capturePath)}
if [ "$count" -eq 1 ]; then
  printf '%s\\n' '{"type":"error","message":"Unknown session"}'
  exit 1
fi
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"cursor-session-fresh-2","model":"auto"}'
printf '%s\\n' '{"type":"result","subtype":"success","session_id":"cursor-session-fresh-2","result":"ok"}'
`);
    await fs.chmod(commandPath, 0o755);

    try {
      const result = await execute({
        runId: "run-cursor-resume-fallback",
        agent: { id: "agent-1", companyId: "company-1", name: "Cursor Coder", adapterType: "cursor", adapterConfig: {} },
        runtime: { sessionId: "cursor-session-old", sessionParams: null, sessionDisplayId: null, taskKey: null },
        config: { command: commandPath, cwd: workspace, promptTemplate: "Follow the paperclip heartbeat." },
        context: createPromptContextFixture(),
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(0);
      const prompts = await fs.readFile(capturePath, "utf8");
      expect(prompts).toContain("## Compact assignment");
      expect(prompts).toContain("## Owned assignment");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
