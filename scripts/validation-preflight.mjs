#!/usr/bin/env node
// Read-only prerequisite check for isolated validation. It reports the tools the
// next stage will actually use and exits non-zero before any expensive step when a
// required one is missing. It never installs anything, never connects to a
// database, and prints no credentials. Probes use a private temp directory.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MIN_PYTHON = [3, 9];
// Tools each stage needs. `blockers` is the cheap gate to pass before anything else.
export const STAGES = {
  blockers: ["node", "pnpm", "git", "python"],
  build: ["node", "pnpm", "git", "rust"],
  full: ["node", "pnpm", "git", "python", "rust"],
};
const TOOL_FLAGS = { git: "--git", python: "--python", pnpm: "--pnpm", cargo: "--cargo", rustc: "--rustc" };
const TOOL_COMMANDS = { git: "git", python: "python3", pnpm: "pnpm", cargo: "cargo", rustc: "rustc" };

// Applied to every child process so a probe cannot write to the repository or download a tool:
// a rustup shim must never fetch a toolchain, a Corepack pnpm shim must never fetch a package
// manager, and Git must not refresh the index or take optional locks while reading status.
export const READ_ONLY_PROBE_ENV = Object.freeze({
  RUSTUP_AUTO_INSTALL: "0",
  COREPACK_ENABLE_NETWORK: "0",
  COREPACK_ENABLE_AUTO_PIN: "0",
  GIT_OPTIONAL_LOCKS: "0",
});

const parseVersion = (text) => /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text)?.slice(1).map((part) => Number(part ?? 0)) ?? null;
const atLeast = (version, minimum) => {
  for (let index = 0; index < minimum.length; index++) {
    if ((version?.[index] ?? 0) !== minimum[index]) return (version?.[index] ?? 0) > minimum[index];
  }
  return true;
};

function findOnPath(command, env) {
  for (const directory of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* keep looking */ }
  }
  return null;
}

/** Resolve a tool from an explicit flag, then an environment override, then PATH. */
function locate(tool, options, env) {
  const flag = options.paths?.[tool];
  if (flag) return { path: path.resolve(flag), source: "flag" };
  const override = env[`PAPERCLIP_PREFLIGHT_${tool.toUpperCase()}`];
  if (override) return { path: path.resolve(override), source: "env" };
  const found = findOnPath(TOOL_COMMANDS[tool], env);
  return found ? { path: found, source: "PATH" } : null;
}

function run(file, args, { cwd, env, input } = {}) {
  const result = spawnSync(file, args, { cwd, env, input, encoding: "utf8", timeout: 20_000, shell: false });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}

function networkFilesystem(directory) {
  const tool = ["/sbin/mount", "/bin/mount", "/usr/bin/mount"].find((candidate) => fs.existsSync(candidate));
  const mount = tool ? run(tool, []) : null;
  if (!mount || mount.status !== 0) return undefined; // cannot tell
  const real = fs.realpathSync(directory);
  let best = null;
  for (const line of mount.stdout.split("\n")) {
    const match = /^(.*?) on (.*?) (?:\(([^,)\s]+)|type (\S+))/.exec(line);
    if (!match) continue;
    const [, , mountPoint, darwinType, linuxType] = match;
    const type = darwinType ?? linuxType ?? "";
    if ((real === mountPoint || real.startsWith(mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`))
      && (!best || mountPoint.length >= best.mountPoint.length)) best = { mountPoint, type };
  }
  return best && /^(smbfs|cifs|smb3?|nfs\d?|afpfs|webdav|9p|fuse\.sshfs)$/.test(best.type) ? best : null;
}

function describeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.pathname}`; // never the user, password or query
  } catch { return "unparseable URL"; }
}

export function runPreflight(options = {}) {
  const env = options.env ?? process.env;
  const stage = options.stage ?? "blockers";
  const required = new Set(STAGES[stage] ?? []);
  const checks = [];
  const add = (id, status, detail, extra = {}) => checks.push({ id, status, detail, ...extra });
  const need = (group) => required.has(group);
  const report = (id, group, ok, detail, extra) => add(id, ok ? "pass" : (need(group) ? "fail" : "skip"), detail, { required: need(group), ...extra });

  const engines = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).engines?.node ?? ">=24.11.0";
  const minNode = parseVersion(engines);
  report("node", "node", atLeast(parseVersion(process.versions.node), minNode),
    `node ${process.versions.node} (engines.node ${engines})`, { path: process.execPath, version: process.versions.node });

  const located = {};
  const probe = (tool, args, cwd = repoRoot) => {
    const found = locate(tool, options, env);
    if (!found) return { found: null };
    const toolEnv = { ...env, ...READ_ONLY_PROBE_ENV };
    const result = run(found.path, args, { cwd, env: toolEnv });
    located[tool] = found;
    return { found, result, version: result.status === 0 ? parseVersion(result.stdout || result.stderr) : null,
      text: (result.stdout || result.stderr).trim().split("\n")[0] };
  };
  const hint = (found) => found && found.source !== "PATH"
    ? { hint: `tests resolve this tool from PATH; prepend ${path.dirname(found.path)} to PATH` } : {};

  const missing = (id, group, tool) => report(id, group, false, `${TOOL_COMMANDS[tool]} not found on PATH; pass ${TOOL_FLAGS[tool]} <path> or set PAPERCLIP_PREFLIGHT_${tool.toUpperCase()}`);

  const pnpm = probe("pnpm", ["--version"]);
  if (!pnpm.found) missing("pnpm", "pnpm", "pnpm");
  else report("pnpm", "pnpm", (pnpm.version?.[0] ?? 0) >= 9, pnpm.version ? `pnpm ${pnpm.text} (needs 9+)` : `pnpm cannot run: ${pnpm.text || "no output"} (a #!/usr/bin/env node shim needs node on PATH)`, { path: pnpm.found.path, source: pnpm.found.source, version: pnpm.text, ...hint(pnpm.found) });

  const git = probe("git", ["--version"]);
  if (!git.found) missing("git", "git", "git");
  else {
    report("git", "git", git.version !== null, git.text || "git did not report a version", { path: git.found.path, source: git.found.source, version: git.text, ...hint(git.found) });
    if (git.version) {
      // Capability probe in a private repository: stdin revision lists that contain `--not`
      // are rejected by older Git (Apple Git 2.39.3: "options not supported in --stdin mode").
      const scratchParent = options.tmpdir ?? os.tmpdir();
      let scratch = null;
      try { scratch = fs.mkdtempSync(path.join(scratchParent, "paperclip-preflight-git-")); } catch (error) {
        // A read-only or missing TMPDIR is a failed check with a machine-readable reason, not a crash.
        report("git-rev-list-stdin-not", "git", false, `cannot create a private probe directory under ${scratchParent}: ${error.code ?? error.message}; set TMPDIR to a writable directory`, { path: git.found.path });
      }
      if (scratch) try {
        const gitEnv = { PATH: env.PATH ?? "", HOME: scratch, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: "0", ...READ_ONLY_PROBE_ENV };
        const g = (args, input) => run(git.found.path, ["-c", "user.name=preflight", "-c", "user.email=preflight@invalid", "-c", "commit.gpgsign=false", ...args], { cwd: scratch, env: gitEnv, input });
        const ready = g(["init", "-q"]).status === 0 && g(["commit", "-q", "--allow-empty", "-m", "preflight"]).status === 0;
        const listed = ready ? g(["rev-list", "--max-count=1", "--stdin"], "HEAD\n^HEAD\n--not\n--remotes\n") : { status: 1, stderr: "probe repository could not be created" };
        report("git-rev-list-stdin-not", "git", ready && listed.status === 0,
          ready && listed.status === 0 ? "git rev-list --stdin accepts --not" : `git rev-list --stdin rejects --not: ${(listed.stderr ?? "").trim().split("\n")[0] || `exit ${listed.status}`}`,
          { path: git.found.path });
      } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
    }
  }

  const python = probe("python", ["--version"]);
  if (!python.found) missing("python", "python", "python");
  else report("python", "python", atLeast(python.version, MIN_PYTHON),
    `${python.text} (needs ${MIN_PYTHON.join(".")}+)`, { path: python.found.path, source: python.found.source, version: python.text, ...hint(python.found) });

  const runnerDir = path.join(repoRoot, "packages", "paperclip-runner");
  const channel = /channel\s*=\s*"([^"]+)"/.exec(fs.existsSync(path.join(runnerDir, "rust-toolchain.toml")) ? fs.readFileSync(path.join(runnerDir, "rust-toolchain.toml"), "utf8") : "")?.[1];
  const rustc = probe("rustc", ["--version"], runnerDir);
  const cargo = probe("cargo", ["--version"], runnerDir);
  for (const [id, tool, found] of [["rustc", "rustc", rustc], ["cargo", "cargo", cargo]]) {
    if (!found.found) { missing(id, "rust", tool); continue; }
    const matches = !channel || found.text.includes(channel);
    report(id, "rust", found.version !== null && matches, `${found.text}${channel ? ` (rust-toolchain.toml channel ${channel})` : ""}${found.version !== null && matches ? "" : "; an isolated rustup also needs CARGO_HOME and RUSTUP_HOME in the environment"}`,
      { path: found.found.path, source: found.found.source, version: found.text, ...hint(found.found) });
  }
  if (cargo.found && cargo.version) {
    const fmt = run(cargo.found.path, ["fmt", "--version"], { cwd: runnerDir, env: { ...env, ...READ_ONLY_PROBE_ENV } });
    report("rustfmt", "rust", fmt.status === 0, fmt.status === 0 ? fmt.stdout.trim() : "cargo fmt is unavailable (rust-toolchain.toml requires the rustfmt component)", { path: cargo.found.path });
  }

  // Advisory findings: reported, never fatal.
  const nodeOnPath = findOnPath("node", env);
  if (!nodeOnPath) add("node-on-path", "warn", "node is not on PATH; child tools that start with #!/usr/bin/env node cannot run", { required: false });
  else if (fs.realpathSync(nodeOnPath) !== fs.realpathSync(process.execPath)) add("node-on-path", "warn", `PATH resolves node to ${nodeOnPath}, but this check runs on ${process.execPath}`, { required: false });
  if (env.GIT_EDITOR !== undefined) add("env-git-editor", "warn", `GIT_EDITOR is set (${env.GIT_EDITOR === "false" ? "false" : "custom"}); it breaks git rebase fixtures, so unset it`, { required: false });
  for (const name of ["DATABASE_URL", "PAPERCLIP_TEST_DATABASE_URL"]) {
    if (env[name]) add(`env-${name.toLowerCase()}`, "warn", `${name} is set (${describeUrl(env[name])}); tests would use this database. Confirm it is disposable, or unset it for embedded PostgreSQL`, { required: false });
  }
  const network = networkFilesystem(repoRoot);
  if (network === undefined) add("filesystem", "skip", "filesystem type could not be determined (mount unavailable)", { required: false });
  else if (network) add("filesystem", "warn", `repository is on a network filesystem (${network.type} at ${network.mountPoint}); native installs and tests belong on a local disk`, { required: false });
  else add("filesystem", "pass", `repository root ${repoRoot} is on a local filesystem`, { required: false });

  let snapshot = { available: false };
  if (git.found && git.version) {
    const g = (args) => run(git.found.path, args, { cwd: repoRoot, env: { ...env, ...READ_ONLY_PROBE_ENV } });
    const head = g(["rev-parse", "HEAD"]);
    if (head.status === 0) {
      const status = g(["status", "--porcelain"]);
      snapshot = { available: true, head: head.stdout.trim(), tree: g(["rev-parse", "HEAD^{tree}"]).stdout.trim(),
        dirtyEntries: status.stdout.split("\n").filter(Boolean).length };
    }
  }
  add("snapshot", snapshot.available ? "pass" : "skip", snapshot.available
    ? `HEAD ${snapshot.head.slice(0, 12)} tree ${snapshot.tree.slice(0, 12)}, ${snapshot.dirtyEntries} uncommitted entries`
    : "no git snapshot identity available", { required: false });

  const failed = checks.filter((check) => check.status === "fail");
  return { schema: "paperclip.validation-preflight.v1", stage, ok: failed.length === 0, requiredTools: [...required], checks, snapshot,
    failed: failed.map((check) => check.id) };
}

function parseArgs(argv) {
  const options = { stage: "blockers", json: false, paths: {} };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const [name, inline] = arg.split(/=(.*)/s);
    const value = () => inline ?? argv[++index];
    if (name === "--json") options.json = true;
    else if (name === "--stage") options.stage = value();
    else if (Object.values(TOOL_FLAGS).includes(name)) {
      const tool = Object.keys(TOOL_FLAGS).find((key) => TOOL_FLAGS[key] === name);
      options.paths[tool] = value();
    } else throw new Error(`Unknown option ${arg}`);
  }
  if (!STAGES[options.stage]) throw new Error(`Unknown stage "${options.stage}"; use ${Object.keys(STAGES).join(", ")}`);
  return options;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${error.message}\nusage: validation-preflight.mjs [--stage blockers|build|full] [--json] [--git P] [--python P] [--pnpm P] [--cargo P] [--rustc P]\n`);
    process.exit(2);
  }
  const result = runPreflight(options);
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`validation preflight (stage ${result.stage}; requires ${result.requiredTools.join(", ")})\n`);
    for (const check of result.checks) {
      process.stdout.write(`  ${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.detail}${check.path ? ` [${check.path}]` : ""}${check.hint ? `\n       ${check.hint}` : ""}\n`);
    }
    process.stdout.write(result.ok ? "preflight passed\n" : `preflight FAILED: ${result.failed.join(", ")}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}
