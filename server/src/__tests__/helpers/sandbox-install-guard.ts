import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { SANDBOX_INSTALL_COMMAND } from "@paperclipai/adapter-cursor-local";

// Fixture-only guard for the fake sandbox runner. An earlier diagnostic probe lacked this
// guard and really downloaded and ran the Cursor CLI, so the runner must refuse before any
// backend executes. The threat model is an accidental network install from a test or
// diagnostic, not an adversarial script. The guard is fail-closed: a call is allowed only
// if it matches a recognized shape, so a changed or unknown install form is refused too.

export const INSTALL_BLOCKED_MESSAGE = "Sandbox fixture did not discover its preinstalled Cursor CLI";

export type SandboxRunnerInput = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
  onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onSpawn?: (meta: { pid: number; startedAt: string }) => Promise<void>;
};

export type GuardVerdict = { allowed: true } | { allowed: false; reason: string };

const DENIED_PATTERNS: Array<[string, RegExp]> = [
  ["installer host", /\bcursor\.com\b/],
  ["url scheme", /\b[a-z][a-z0-9+.-]*:\/\//],
  ["download tool", /\b(curl|wget|fetch|aria2c|ftp|tftp|sftp|scp|rsync|nc|ncat|netcat|socat|telnet|ssh)\b/],
  ["package or toolchain manager", /\b(npm|npx|pnpm|yarn|corepack|pip3?|brew|apt|apt-get|yum|dnf|apk|gem|cargo|rustup)\b/],
  ["git network operation", /\bgit\s+(clone|fetch|pull|ls-remote|submodule)\b/],
  ["scripting runtime", /\b(python[0-9.]*|node|perl|ruby|php|osascript|pwsh)\b/],
  ["install intent", /\binstall(er|ation)?\b/],
  ["dynamic evaluation", /\b(eval|source|exec)\b(?!\s+rm\b)/],
  ["raw socket", /\/dev\/(tcp|udp)\b/],
  ["pipe into interpreter", /\|\s*(sh|bash|zsh|dash|ksh|env|xargs)\b/],
  ["decoded payload piped onward", /base64\s+-d[^|;&]*\|/],
];

// Words that legitimately appear in the adapter's local file, probe and archive scripts
// once paths are removed. Anything else is an unrecognized form and is refused.
const KNOWN_WORDS = new Set([
  "HOME", "PATH", "__PAPERCLIP_CURSOR_AGENT__", "__PAPERCLIP_CURSOR_HOME__", "agent", "base64", "bs", "build",
  "cache", "cd", "command", "count", "coverage", "cp", "cursor", "dd", "dist", "elif", "else", "exclude", "exec",
  "fi", "find", "git", "if", "maxdepth", "mindepth", "mkdir", "mv", "name", "next", "node_modules", "null", "out",
  "paperclip", "print0", "printf", "resolved", "rm", "rf", "runtime", "sh", "skip", "tar", "then", "turbo", "upload",
  "vendor", "wc", "xf", "cf", "true", "false", "echo", "cat", "ls", "pwd",
]);

const INTERPRETER_BASENAMES = new Set([
  "sh", "bash", "zsh", "dash", "ksh", "csh", "tcsh", "fish", "env", "xargs", "node", "python", "python3", "perl",
  "ruby", "php", "curl", "wget", "nc", "ssh", "git", "npm", "npx", "pnpm", "corepack", "brew", "eval", "osascript",
]);

const SAFE_VARIABLES = new Set(["HOME", "PATH", "PWD", "TMPDIR", "resolved"]);
const SAFE_COMMAND_SUBSTITUTION = /\$\(command -v [^()$`]*\)/g;
const SAFE_STDIN_SINK = /^base64 -d >> P$/;

function normalizeLoose(value: string): string {
  return value.replace(/[\s'"\\`]+/g, "").toLowerCase();
}

function stripQuotes(value: string): string {
  return value.replace(/['"\\]/g, "");
}

function replacePaths(value: string): string {
  return value.replace(/[^\s;&|<>()=]*\/[^\s;&|<>()]*/g, "P");
}

function deniedByPatterns(label: string, text: string): GuardVerdict | null {
  const lowered = stripQuotes(text).toLowerCase();
  for (const [name, pattern] of DENIED_PATTERNS) {
    const match = pattern.exec(lowered);
    if (match) return { allowed: false, reason: `${label} matches denied pattern: ${name} ("${match[0]}")` };
  }
  return null;
}

function inspectShellScript(script: string, hasStdin: boolean): GuardVerdict {
  const withoutOwnSubstitutions = script.replace(SAFE_COMMAND_SUBSTITUTION, "");
  if (withoutOwnSubstitutions.includes("`")) return { allowed: false, reason: "script uses backtick substitution" };
  if (/\$\(|\$\{|\$['"]/.test(withoutOwnSubstitutions)) {
    return { allowed: false, reason: "script uses unrecognized substitution or indirection" };
  }
  for (const match of withoutOwnSubstitutions.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (!SAFE_VARIABLES.has(match[1]!)) return { allowed: false, reason: `script reads unrecognized variable $${match[1]}` };
  }
  const denied = deniedByPatterns("script", script);
  if (denied) return denied;
  if (normalizeLoose(script).includes(normalizeLoose(SANDBOX_INSTALL_COMMAND))) {
    return { allowed: false, reason: "script contains the adapter install command" };
  }
  // printf escapes and format specifiers (`\\n`, `%s`) are data, not command words.
  const normalized = replacePaths(stripQuotes(script.replace(/\\+[nrt]/g, " ").replace(/%[a-zA-Z]/g, " ")));
  // A bare interpreter (no -c) would read its program from stdin or a file.
  if (/\b(sh|bash|zsh|dash|ksh)\b(?!\s+-c\b)/.test(normalized)) {
    return { allowed: false, reason: "script starts an interpreter that is not `-c`" };
  }
  if (hasStdin && !SAFE_STDIN_SINK.test(normalized.trim())) {
    return { allowed: false, reason: "stdin is only accepted as data for `base64 -d >> <file>`" };
  }
  for (const match of normalized.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const word = match[0];
    if (word.length === 1 || KNOWN_WORDS.has(word)) continue;
    return { allowed: false, reason: `script contains unrecognized word "${word}"` };
  }
  return { allowed: true };
}

function resolveInside(candidate: string, roots: string[]): string | null {
  if (!path.isAbsolute(candidate)) return null;
  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    return null;
  }
  return roots.some(root => real === root || real.startsWith(`${root}${path.sep}`)) ? real : null;
}

export function inspectSandboxCall(
  input: Pick<SandboxRunnerInput, "command" | "args" | "stdin">,
  options: { allowedExecutableRoots?: string[] } = {},
): GuardVerdict {
  const { command, args = [], stdin } = input;
  if (typeof command !== "string" || command.length === 0) return { allowed: false, reason: "command is not a string" };
  if (!Array.isArray(args) || args.some(arg => typeof arg !== "string")) {
    return { allowed: false, reason: "args are not all strings" };
  }
  if (stdin !== undefined && typeof stdin !== "string") return { allowed: false, reason: "stdin is not a string" };

  // Cheap whole-call scan so an installer in any slot is named precisely.
  const commandDenied = deniedByPatterns("command", command);
  if (commandDenied) return commandDenied;
  const argvDenied = args.map((arg, index) => deniedByPatterns(`arg ${index}`, arg)).find(Boolean);
  if (path.basename(command) === "sh" || path.basename(command) === "bash") {
    // Only `sh -c <script>` is a recognized shell form; `sh`, `sh -s` or `sh -` read stdin as code.
    if (args.length !== 2 || args[0] !== "-c") {
      return { allowed: false, reason: "shell invocation is not `sh -c <script>`; stdin or file code is refused" };
    }
    return inspectShellScript(args[1]!, typeof stdin === "string" && stdin.length > 0);
  }
  if (argvDenied) return argvDenied;

  const roots = options.allowedExecutableRoots ?? [fs.realpathSync(os.tmpdir())];
  const base = path.basename(command);
  if (INTERPRETER_BASENAMES.has(base)) {
    return { allowed: false, reason: `command ${base} is an interpreter or network tool, not a fixture binary` };
  }
  if (!resolveInside(command, roots)) {
    return { allowed: false, reason: "command is not an existing fixture binary under the allowed temp root" };
  }
  // Fixture binaries read stdin as a prompt, so it is data here and not executed.
  return { allowed: true };
}

const SECRETLESS_FALLBACK_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const SECRETLESS_ENV_KEYS = ["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR"] as const;

// The fake runner executes the fixture CLI with only these variables, so a host secret in the
// parent's environment (or in the adapter's pass-through env) never reaches the child.
export function buildSecretlessEnv(
  inputEnv: Record<string, string> | undefined,
  hostEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of SECRETLESS_ENV_KEYS) {
    const value = inputEnv?.[key] ?? hostEnv[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  for (const [key, value] of Object.entries(inputEnv ?? {})) {
    if (key.startsWith("PAPERCLIP_") && typeof value === "string") result[key] = value;
  }
  result.PATH ??= SECRETLESS_FALLBACK_PATH;
  return result;
}

export type SandboxChildResult = Awaited<ReturnType<typeof runChildProcess>>;
export type SandboxBackend = (input: SandboxRunnerInput, counter: number) => Promise<SandboxChildResult>;

export function createSecretlessLocalBackend(): SandboxBackend {
  return async (input, counter) => {
    const env = buildSecretlessEnv(input.env);
    return await runChildProcess(
      `cursor-sandbox-execute-${counter}`,
      "/usr/bin/env",
      ["-i", ...Object.entries(env).map(([key, value]) => `${key}=${value}`), input.command, ...(input.args ?? [])],
      {
        cwd: input.cwd ?? process.cwd(),
        env: {},
        stdin: input.stdin,
        timeoutSec: Math.max(1, Math.ceil((input.timeoutMs ?? 30_000) / 1000)),
        graceSec: 5,
        onLog: input.onLog ?? (async () => {}),
        onSpawn: input.onSpawn
          ? async (meta) => input.onSpawn?.({ pid: meta.pid, startedAt: meta.startedAt })
          : undefined,
      },
    );
  };
}

// Every sandbox fixture runner is built here: the guard runs first and the backend is only
// reached for a recognized, non-network call.
export function createGuardedSandboxRunner(
  backend: SandboxBackend = createSecretlessLocalBackend(),
  options: { allowedExecutableRoots?: string[] } = {},
) {
  let counter = 0;
  return {
    execute: async (input: SandboxRunnerInput) => {
      counter += 1;
      const verdict = inspectSandboxCall(input, options);
      if (!verdict.allowed) throw new Error(`${INSTALL_BLOCKED_MESSAGE} (blocked before execution: ${verdict.reason})`);
      return await backend(input, counter);
    },
  };
}
