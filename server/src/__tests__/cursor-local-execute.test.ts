import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "@paperclipai/adapter-cursor-local/server";
import { createInertBypassProbes } from "@paperclipai/adapter-utils/test-fixtures/sandbox-fixture-runner";
import { createCursorSandboxRunner } from "./helpers/sandbox-install-guard.js";

// These fixtures verify command discovery, environment and real CLI execution.
// Callback bridge startup/teardown has its own execution-target coverage; starting
// that server here adds unrelated process and polling work to command assertions.
vi.mock("@paperclipai/adapter-utils/execution-target", async () => {
  const actual = await vi.importActual<typeof import("@paperclipai/adapter-utils/execution-target")>(
    "@paperclipai/adapter-utils/execution-target",
  );
  return {
    ...actual,
    startAdapterExecutionTargetPaperclipBridge: async () => null,
  };
});

async function writeFakeCursorCommand(commandPath: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");

const capturePath = process.env.PAPERCLIP_TEST_CAPTURE_PATH;
const payload = {
  argv: process.argv.slice(2),
  prompt: fs.readFileSync(0, "utf8"),
  paperclipEnvKeys: Object.keys(process.env)
    .filter((key) => key.startsWith("PAPERCLIP_"))
    .sort(),
};
if (capturePath) {
  fs.writeFileSync(capturePath, JSON.stringify(payload), "utf8");
}
console.log(JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "cursor-session-1",
  model: "auto",
}));
console.log(JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "output_text", text: "hello" }] },
}));
console.log(JSON.stringify({
  type: "result",
  subtype: "success",
  session_id: "cursor-session-1",
  result: "ok",
}));
`;
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

async function writeFakeSandboxCursorAgent(commandPath: string, capturePath: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");

const payload = {
  command: process.argv[1],
  argv: process.argv.slice(2),
  prompt: fs.readFileSync(0, "utf8"),
  path: process.env.PATH || "",
};
fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify(payload), "utf8");
console.log(JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "cursor-session-remote-1",
  model: "auto",
}));
console.log(JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "output_text", text: "hello" }] },
}));
console.log(JSON.stringify({
  type: "result",
  subtype: "success",
  session_id: "cursor-session-remote-1",
  result: "ok",
}));
`;
  await fs.mkdir(path.dirname(commandPath), { recursive: true });
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

// The sandbox runner deliberately uses the production default PATH, which does not
// contain version-manager directories. The `#!/usr/bin/env node` fixtures above
// therefore need a runtime inside their own fake HOME instead of a global Node.
// The link targets the Node that runs this test, so paths with spaces stay safe.
async function installFixtureNodeRuntime(binDir: string): Promise<string> {
  await fs.mkdir(binDir, { recursive: true });
  const runtimePath = path.join(binDir, "node");
  await fs.symlink(process.execPath, runtimePath);
  return runtimePath;
}

// Local-command fixtures also resolve `env node` through the child PATH, which
// otherwise comes from whichever shell started the test run.
async function fixtureRuntimeEnv(root: string): Promise<{ PATH: string }> {
  const binDir = path.join(root, "runtime-bin");
  await installFixtureNodeRuntime(binDir);
  return { PATH: [binDir, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter) };
}

// Every sandbox runner is guarded before any backend runs and executes the fixture CLI with
// a secretless environment. Each test registers its own mkdtemp root and the exact fixture
// executables it may start; see helpers/sandbox-install-guard.ts.
function createLocalSandboxRunner(root: string, executables: string[]) {
  return createCursorSandboxRunner({ ownedRoots: [root], executables });
}

type CapturePayload = {
  argv: string[];
  prompt: string;
  paperclipEnvKeys: string[];
};

async function createSkillDir(root: string, name: string) {
  const skillDir = path.join(root, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf8");
  return skillDir;
}

describe("cursor execute", () => {
  it("injects paperclip env vars and prompt note by default", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-execute-"));
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "agent");
    const capturePath = path.join(root, "capture.json");
    await fs.mkdir(workspace, { recursive: true });
    await writeFakeCursorCommand(commandPath);
    const runtimeEnv = await fixtureRuntimeEnv(root);

    const previousHome = process.env.HOME;
    process.env.HOME = root;

    let invocationPrompt = "";
    try {
      const result = await execute({
        runId: "run-1",
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
        config: {
          command: commandPath,
          cwd: workspace,
          model: "auto",
          env: {
            ...runtimeEnv,
            PAPERCLIP_TEST_CAPTURE_PATH: capturePath,
          },
          promptTemplate: "Follow the paperclip heartbeat.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
        onMeta: async (meta) => {
          invocationPrompt = meta.prompt ?? "";
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.errorMessage).toBeNull();

      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as CapturePayload;
      expect(capture.argv).not.toContain("Follow the paperclip heartbeat.");
      expect(capture.argv).not.toContain("--mode");
      expect(capture.argv).not.toContain("ask");
      expect(capture.paperclipEnvKeys).toEqual(
        expect.arrayContaining([
          "PAPERCLIP_AGENT_ID",
          "PAPERCLIP_API_KEY",
          "PAPERCLIP_API_URL",
          "PAPERCLIP_COMPANY_ID",
          "PAPERCLIP_RUN_ID",
        ]),
      );
      expect(capture.prompt).toContain("Paperclip runtime note:");
      expect(capture.prompt).toContain("PAPERCLIP_API_KEY");
      expect(invocationPrompt).toContain("Paperclip runtime note:");
      expect(invocationPrompt).toContain("PAPERCLIP_API_URL");
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes --mode when explicitly configured", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-execute-mode-"));
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "agent");
    const capturePath = path.join(root, "capture.json");
    await fs.mkdir(workspace, { recursive: true });
    await writeFakeCursorCommand(commandPath);
    const runtimeEnv = await fixtureRuntimeEnv(root);

    const previousHome = process.env.HOME;
    process.env.HOME = root;

    try {
      const result = await execute({
        runId: "run-2",
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
        config: {
          command: commandPath,
          cwd: workspace,
          model: "auto",
          mode: "ask",
          env: {
            ...runtimeEnv,
            PAPERCLIP_TEST_CAPTURE_PATH: capturePath,
          },
          promptTemplate: "Follow the paperclip heartbeat.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.errorMessage).toBeNull();

      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as CapturePayload;
      expect(capture.argv).toContain("--mode");
      expect(capture.argv).toContain("ask");
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("injects company-library runtime skills into the Cursor skills home before execution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-execute-runtime-skill-"));
    const processHome = path.join(root, "process-home");
    const configuredHome = path.join(root, "configured-home");
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "agent");
    const runtimeSkillsRoot = path.join(root, "runtime-skills");
    await fs.mkdir(workspace, { recursive: true });
    await writeFakeCursorCommand(commandPath);
    const runtimeEnv = await fixtureRuntimeEnv(root);

    const paperclipDir = await createSkillDir(runtimeSkillsRoot, "paperclip");
    const asciiHeartDir = await createSkillDir(runtimeSkillsRoot, "ascii-heart");

    const previousHome = process.env.HOME;
    process.env.HOME = processHome;

    try {
      const result = await execute({
        runId: "run-3",
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
        config: {
          command: commandPath,
          cwd: workspace,
          model: "auto",
          env: { ...runtimeEnv, HOME: configuredHome },
          paperclipRuntimeSkills: [
            {
              name: "paperclip",
              source: paperclipDir,
            },
            {
              name: "ascii-heart",
              source: asciiHeartDir,
            },
          ],
          paperclipSkillSync: {
            desiredSkills: ["ascii-heart"],
          },
          promptTemplate: "Follow the paperclip heartbeat.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
        onMeta: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.errorMessage).toBeNull();
      const installedSkill = path.join(configuredHome, ".cursor", "skills", "ascii-heart");
      expect((await fs.lstat(installedSkill)).isSymbolicLink()).toBe(true);
      expect(await fs.realpath(installedSkill)).toBe(
        await fs.realpath(asciiHeartDir),
      );
      await expect(fs.lstat(path.join(processHome, ".cursor", "skills", "ascii-heart"))).rejects.toThrow();
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("prefers ~/.local/bin/cursor-agent for remote sandbox execution when using the default command", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-sandbox-execute-"));
    const homeDir = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    const remoteWorkspace = path.join(root, "remote-workspace");
    const capturePath = path.join(root, "capture.json");
    const cursorAgentPath = path.join(homeDir, ".local", "bin", "cursor-agent");
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(remoteWorkspace, { recursive: true });
    await writeFakeSandboxCursorAgent(cursorAgentPath, capturePath);
    await installFixtureNodeRuntime(path.dirname(cursorAgentPath));

    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      const result = await execute({
        runId: "run-sandbox-1",
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
          runner: createLocalSandboxRunner(root, [cursorAgentPath]),
          timeoutMs: 30_000,
        },
        config: {
          command: "agent",
          cwd: workspace,
          promptTemplate: "Follow the paperclip heartbeat.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(0);
      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as {
        command: string;
        argv: string[];
        prompt: string;
        path: string;
      };
      expect(capture.command).toBe(cursorAgentPath);
      expect(capture.path.split(":")[0]).toBe(path.join(homeDir, ".local", "bin"));
      expect(capture.prompt).toContain("Follow the paperclip heartbeat.");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps explicit command overrides for remote sandbox execution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-sandbox-explicit-"));
    const homeDir = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    const remoteWorkspace = path.join(root, "remote-workspace");
    const capturePath = path.join(root, "capture.json");
    const cursorAgentPath = path.join(homeDir, ".local", "bin", "cursor-agent");
    const customCommandPath = path.join(root, "bin", "custom-cursor");
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(remoteWorkspace, { recursive: true });
    await writeFakeSandboxCursorAgent(cursorAgentPath, path.join(root, "unused.json"));
    await writeFakeSandboxCursorAgent(customCommandPath, capturePath);
    await installFixtureNodeRuntime(path.dirname(cursorAgentPath));

    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      const result = await execute({
        runId: "run-sandbox-2",
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
          runner: createLocalSandboxRunner(root, [customCommandPath]),
          timeoutMs: 30_000,
        },
        config: {
          command: customCommandPath,
          cwd: workspace,
          promptTemplate: "Follow the paperclip heartbeat.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(0);
      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as { command: string };
      expect(capture.command).toBe(customCommandPath);
      expect((await fs.lstat(path.join(homeDir, ".local", "bin", "node"))).isSymbolicLink()).toBe(true);
      expect(await fs.realpath(path.join(homeDir, ".local", "bin", "node"))).toBe(await fs.realpath(process.execPath));
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses calls its test did not register before any process starts", async () => {
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
      expect(runner.refusals).toHaveLength(calls.length);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  // Negative controls: a fixture that is not installed must stay visible. The sandbox
  // runner above throws before it would ever run the network installer.
  describe.each([
    { name: "a missing default Cursor CLI", command: "agent" },
    { name: "an invalid explicit override", command: "__OVERRIDE__" },
  ])("sandbox fixture with $name", ({ command }) => {
    it("does not report success or download a real CLI", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-sandbox-missing-"));
      const homeDir = path.join(root, "home");
      const workspace = path.join(root, "workspace");
      const remoteWorkspace = path.join(root, "remote-workspace");
      await fs.mkdir(homeDir, { recursive: true });
      await fs.mkdir(workspace, { recursive: true });
      await fs.mkdir(remoteWorkspace, { recursive: true });
      // The fake HOME owns a runtime but no Cursor CLI, so only the CLI is missing.
      await installFixtureNodeRuntime(path.join(homeDir, ".local", "bin"));
      const calls: string[] = [];
      const runner = createLocalSandboxRunner(root, []);
      const previousHome = process.env.HOME;
      process.env.HOME = homeDir;
      try {
        const outcome = await execute({
          runId: "run-sandbox-missing",
          agent: { id: "agent-1", companyId: "company-1", name: "Cursor Coder", adapterType: "cursor", adapterConfig: {} },
          runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
          executionTarget: {
            kind: "remote",
            transport: "sandbox",
            remoteCwd: remoteWorkspace,
            runner: {
              execute: async input => {
                calls.push([input.command, ...(input.args ?? [])].join(" "));
                return await runner.execute(input);
              },
            },
            timeoutMs: 30_000,
          },
          config: {
            command: command === "__OVERRIDE__" ? path.join(root, "bin", "does-not-exist") : command,
            cwd: workspace,
            promptTemplate: "Follow the paperclip heartbeat.",
          },
          context: {},
          authToken: "run-jwt-token",
          onLog: async () => {},
        }).then(result => ({ result, error: null as unknown }), error => ({ result: null, error }));
        // The adapter asks to install the missing CLI; the fixture runner refuses, so the
        // failure surfaces as a rejection instead of a successful or downloaded run.
        expect(outcome.result, JSON.stringify(outcome.result)).toBeNull();
        expect(String(outcome.error)).toMatch(/did not discover its preinstalled Cursor CLI/);
        expect(calls.some(call => call.includes("curl https://cursor.com/install"))).toBe(true);
        expect(calls.some(call => call.includes("cursor-agent") && !call.includes("command -v") && !call.includes("-x "))).toBe(false);
      } finally {
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  });
});
