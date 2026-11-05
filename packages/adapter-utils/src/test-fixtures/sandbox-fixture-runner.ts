import fs from "node:fs";
import path from "node:path";
import { runChildProcess } from "../server-utils.js";
import {
  assertOwnedRoots,
  compilePolicy,
  inspectSandboxCall,
  scanNetwork,
  type SandboxCall,
  type SandboxCallPolicy,
} from "./sandbox-call-guard.js";

// Test-only composition of the pure guard with a local, secret-free backend. Every fake sandbox
// runner is built here, so a call that is not registered by the test is refused before any
// process starts. It does not secure a test run by itself:
// the long runs must also start through scripts/validation-clean-env.mjs, which removes the
// parent's variables before this process exists.

export type SandboxRunnerInput = SandboxCall & {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onSpawn?: (meta: { pid: number; startedAt: string }) => Promise<void>;
};

export type SandboxChildResult = Awaited<ReturnType<typeof runChildProcess>>;
export type SandboxBackend = (input: SandboxRunnerInput, counter: number) => Promise<SandboxChildResult>;

const SECRETLESS_FALLBACK_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const SECRETLESS_ENV_KEYS = ["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR"] as const;
// A PAPERCLIP_* name that looks like a credential is not forwarded unless the test names it.
const CREDENTIAL_LIKE_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|CREDENTIAL|COOKIE|BEARER|PRIVATE)/i;

export type SecretlessEnvOptions = {
  hostEnv?: NodeJS.ProcessEnv;
  /** Extra variable names, copied from the adapter's env only (never from the host). */
  passEnv?: readonly string[];
};

// The fixture CLI gets only these variables, so a host secret in the parent's environment (or in
// the adapter's pass-through env) never reaches the child. PAPERCLIP_* values are forwarded when
// they do not look like credentials, which keeps the run identifiers a fixture may print.
export function buildSecretlessEnv(
  inputEnv: Record<string, string> | undefined,
  options: SecretlessEnvOptions = {},
): Record<string, string> {
  const hostEnv = options.hostEnv ?? process.env;
  const result: Record<string, string> = {};
  for (const key of SECRETLESS_ENV_KEYS) {
    const value = inputEnv?.[key] ?? hostEnv[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  for (const [key, value] of Object.entries(inputEnv ?? {})) {
    if (typeof value !== "string") continue;
    if (key.startsWith("PAPERCLIP_") && !CREDENTIAL_LIKE_NAME.test(key)) result[key] = value;
  }
  for (const key of options.passEnv ?? []) {
    const value = inputEnv?.[key];
    if (typeof value === "string") result[key] = value;
  }
  result.PATH ??= SECRETLESS_FALLBACK_PATH;
  return result;
}

export type LocalBackendOptions = {
  label?: string;
  passEnv?: readonly string[];
  /** Shapes the adapter's env before the allowlist is applied (for example a fixture PATH). */
  transformEnv?: (env: Record<string, string> | undefined) => Record<string, string>;
  cwd?: (input: SandboxRunnerInput) => string;
  timeoutSec?: (input: SandboxRunnerInput) => number;
};

export function createSecretlessLocalBackend(options: LocalBackendOptions = {}): SandboxBackend {
  const label = options.label ?? "sandbox-fixture";
  return async (input, counter) => {
    const env = buildSecretlessEnv(options.transformEnv ? options.transformEnv(input.env) : input.env, {
      passEnv: options.passEnv,
    });
    return await runChildProcess(
      `${label}-${counter}`,
      "/usr/bin/env",
      ["-i", ...Object.entries(env).map(([key, value]) => `${key}=${value}`), input.command, ...(input.args ?? [])],
      {
        cwd: options.cwd ? options.cwd(input) : input.cwd ?? process.cwd(),
        env: {},
        stdin: input.stdin,
        timeoutSec: options.timeoutSec
          ? options.timeoutSec(input)
          : Math.max(1, Math.ceil((input.timeoutMs ?? 30_000) / 1000)),
        graceSec: 5,
        onLog: input.onLog ?? (async () => {}),
        onSpawn: input.onSpawn
          ? async (meta) => input.onSpawn?.({ pid: meta.pid, startedAt: meta.startedAt })
          : undefined,
      },
    );
  };
}

// Independent of the policy: even if a registered form were too broad, a call that names a
// download tool, an installer host or a URL scheme never reaches a backend.
function withNetworkTripwire(backend: SandboxBackend): SandboxBackend {
  return async (input, counter) => {
    const hit = scanNetwork("backend call", [input.command, ...(input.args ?? [])].join(" "));
    if (hit) throw new Error(`Sandbox fixture backend tripwire: ${hit}`);
    return await backend(input, counter);
  };
}

export type GuardedRunnerOptions = {
  policy: SandboxCallPolicy;
  backend?: SandboxBackend;
  backendOptions?: LocalBackendOptions;
  /** Prefix of the error thrown for a refused call. */
  refusalMessage?: string;
};

// The guard runs first; the backend is only reached for a registered call. A registered
// installer request is replaced by the policy's local stub and is recorded in `installCommands`.
export function createGuardedSandboxRunner(options: GuardedRunnerOptions) {
  const compiled = compilePolicy(options.policy);
  const backend = withNetworkTripwire(options.backend ?? createSecretlessLocalBackend(options.backendOptions));
  const prefix = options.refusalMessage ?? "Sandbox fixture refused an unregistered call";
  const installCommands: string[] = [];
  const refusals: string[] = [];
  let counter = 0;
  return {
    installCommands,
    refusals,
    execute: async (input: SandboxRunnerInput) => {
      counter += 1;
      const verdict = inspectSandboxCall(input, compiled);
      if (!verdict.allowed) {
        refusals.push(verdict.reason);
        throw new Error(`${prefix} (blocked before execution: ${verdict.reason})`);
      }
      if (verdict.simulatedInstall) installCommands.push(options.policy.installStub!.request);
      return await backend({ ...input, ...verdict.call }, counter);
    },
  };
}

// Calls that the second review found accepted, rebuilt so they stay inert even if a runner
// wrongly let one through: every script the calls could start only writes `sentinelPath` inside
// the test's own root, and the "downloader" is a local `echo` reached through a glob. Nothing
// here names a network tool or address that could be executed. A consumer test sends each call to
// its own runner and asserts a refusal, an untouched sentinel and no spawn.
export function createInertBypassProbes(root: string) {
  const ownedRoot = assertOwnedRoots([root])[0]!;
  const sentinelPath = path.join(ownedRoot, "bypass-sentinel");
  const body = `#!/bin/sh\n: > '${sentinelPath}'\n`;
  for (const name of ["script", "payload", "dl", "unregistered"]) {
    fs.writeFileSync(path.join(ownedRoot, name), body, { mode: 0o755 });
  }
  const sh = (script: string): SandboxRunnerInput => ({ command: "sh", args: ["-c", script], cwd: ownedRoot });
  const calls: Array<{ name: string; call: SandboxRunnerInput }> = [
    { name: "absolute shell running a file in the root", call: sh(`/bin/sh '${ownedRoot}/script'`) },
    { name: "absolute shell after a registered form", call: sh(`mkdir -p '${ownedRoot}/x' && /bin/sh ${ownedRoot}/script`) },
    { name: "payload piped to an absolute shell", call: sh(`cat '${ownedRoot}/payload' | /bin/sh`) },
    { name: "glob-obscured tool piped to a shell (local echo)", call: sh("/usr/bin/e?ho x | /bin/sh") },
    { name: "relative executable in the working directory", call: sh("./dl 192.0.2.1/x") },
    { name: "env running a file", call: sh(`/usr/bin/env '${ownedRoot}/dl'`) },
    { name: "absolute shell as the command", call: { command: "/bin/sh", args: [path.join(ownedRoot, "script")], cwd: ownedRoot } },
    { name: "unregistered executable in the root", call: { command: path.join(ownedRoot, "unregistered"), args: [], cwd: ownedRoot } },
    { name: "relative command", call: { command: "dl", args: ["192.0.2.1/x"], cwd: ownedRoot } },
  ];
  return { calls, sentinelPath };
}
