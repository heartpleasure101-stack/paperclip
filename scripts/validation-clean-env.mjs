#!/usr/bin/env node
// Runs one command in a least-privilege environment for isolated validation. The child gets an
// explicit allowlist of variables, an owned temporary HOME / PAPERCLIP_HOME / config, and only the
// tool directories you declare with --bin. It never inherits provider or API keys, personal Git
// or shell configuration, NODE_OPTIONS or other host variables.
//
// This is environment hygiene, not an operating-system sandbox: the child still runs as you, can
// read any file you can read and can use the network. It does not change the parent process, its
// agent credentials or any global setting, and it installs nothing.
//
//   node scripts/validation-clean-env.mjs [--bin DIR]... [--set NAME=VALUE]... [--pass NAME]... \
//     [--describe] -- <command> [args...]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SYSTEM_BIN_DIRS = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
// Names that must never be forwarded, even when asked for by name.
const REFUSED_NAME = /(KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE|SESSION)/i;
const REFUSED_EXACT = new Set(["NODE_OPTIONS", "NODE_PATH", "BASH_ENV", "ENV", "LD_PRELOAD", "DATABASE_URL", "PAPERCLIP_TEST_DATABASE_URL"]);
const SYNTHETIC_GIT_CONFIG = "[user]\n\tname = Paperclip Validation\n\temail = validation@paperclip.invalid\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n";

export class CleanEnvUsageError extends Error {}

function checkName(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new CleanEnvUsageError(`"${name}" is not a valid variable name`);
  if (REFUSED_EXACT.has(name) || /^DYLD_/.test(name) || REFUSED_NAME.test(name)) {
    throw new CleanEnvUsageError(`refusing to forward ${name}: credential-like and injection-capable variables are never passed`);
  }
}

/** Create the owned directories and build the allowlisted environment. Nothing is read from the host except `pass` names. */
export function createCleanEnvironment({ binDirs = [], set = {}, pass = [], hostEnv = process.env, tmpParent = os.tmpdir() } = {}) {
  for (const name of [...Object.keys(set), ...pass]) checkName(name);
  for (const dir of binDirs) {
    if (!path.isAbsolute(dir) || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      throw new CleanEnvUsageError(`--bin ${dir} must be an existing absolute directory`);
    }
  }
  const root = fs.mkdtempSync(path.join(tmpParent, "paperclip-clean-env-"));
  const own = (name) => { const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true }); return dir; };
  const gitConfig = path.join(own("git"), "config");
  fs.writeFileSync(gitConfig, SYNTHETIC_GIT_CONFIG);
  const env = {
    PATH: [...new Set([path.dirname(process.execPath), ...binDirs, ...SYSTEM_BIN_DIRS])].join(path.delimiter),
    HOME: own("home"),
    TMPDIR: own("tmp"),
    PAPERCLIP_HOME: own("paperclip-home"),
    XDG_CONFIG_HOME: own("xdg-config"),
    XDG_CACHE_HOME: own("xdg-cache"),
    XDG_DATA_HOME: own("xdg-data"),
    XDG_STATE_HOME: own("xdg-state"),
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    COREPACK_HOME: own("corepack"),
    COREPACK_ENABLE_NETWORK: "0",
    COREPACK_ENABLE_AUTO_PIN: "0",
    RUSTUP_AUTO_INSTALL: "0",
  };
  for (const name of pass) if (hostEnv[name] !== undefined) env[name] = hostEnv[name];
  Object.assign(env, set);
  return { root, env, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export function parseCleanEnvArgs(argv) {
  const options = { binDirs: [], set: {}, pass: [], describe: false, command: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") { options.command = argv.slice(index + 1); break; }
    const [name, inline] = arg.split(/=(.*)/s);
    const value = () => inline ?? argv[++index];
    if (name === "--describe") options.describe = true;
    else if (name === "--bin") options.binDirs.push(value());
    else if (name === "--pass") options.pass.push(value());
    else if (name === "--set") {
      const [key, ...rest] = String(value()).split("=");
      options.set[key] = rest.join("=");
    } else throw new CleanEnvUsageError(`Unknown option ${arg}`);
  }
  if (!options.describe && options.command.length === 0) throw new CleanEnvUsageError("no command given after --");
  return options;
}

function resolveCommand(command, envPath) {
  if (command.includes("/")) return command;
  for (const dir of envPath.split(path.delimiter)) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* keep looking */ }
  }
  return null;
}

export function runCleanEnv(argv, { hostEnv = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  let options;
  try { options = parseCleanEnvArgs(argv); } catch (error) {
    stderr.write(`${error.message}\nusage: validation-clean-env.mjs [--bin DIR]... [--set NAME=VALUE]... [--pass NAME]... [--describe] -- <command> [args...]\n`);
    return 2;
  }
  let environment;
  try { environment = createCleanEnvironment({ ...options, hostEnv }); } catch (error) {
    stderr.write(`${error.message}\n`);
    return error instanceof CleanEnvUsageError ? 2 : 1;
  }
  try {
    if (options.describe) {
      stdout.write(`${JSON.stringify({ schema: "paperclip.validation-clean-env.v1", root: environment.root, env: environment.env }, null, 2)}\n`);
      return 0;
    }
    const [command, ...args] = options.command;
    const file = resolveCommand(command, environment.env.PATH);
    if (!file) { stderr.write(`${command} is not on the declared PATH (${environment.env.PATH}); declare its directory with --bin\n`); return 127; }
    const result = spawnSync(file, args, { env: environment.env, cwd: process.cwd(), stdio: "inherit", shell: false });
    if (result.error) { stderr.write(`could not start ${file}: ${result.error.message}\n`); return 127; }
    return result.status ?? 1;
  } finally { environment.cleanup(); }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(runCleanEnv(process.argv.slice(2)));
}
