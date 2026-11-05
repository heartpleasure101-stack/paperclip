import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Test-only, provider-neutral guard for fake sandbox runners. It is pure: it never starts a
// process, reads no network and only stats paths. A diagnostic probe once lacked such a guard
// and really downloaded and ran a third-party CLI, so every fake runner must ask this module
// before its backend executes anything.
//
// The guard does not try to secure the shell language. It is a bounded whitelist:
//   - the command is a registered shell name (`sh -c <script>`) or an exact, registered
//     executable path that resolves inside a root the test owns;
//   - a shell script is allowed only if it matches a registered, known-source template, or is a
//     `&&` chain of such templates, each path argument being inside an owned root;
//   - anything else, including a path-shaped command, is refused. No path-shaped token and no
//     system temp directory is trusted automatically.
// The consumer (a Cursor test, say) supplies its own templates, executables and roots.

export type SandboxCall = { command: string; args?: string[]; stdin?: string };

export type GuardVerdict =
  | { allowed: true; call: SandboxCall; simulatedInstall: boolean }
  | { allowed: false; reason: string };

// `string` templates use placeholders, everything else is literal text:
//   @path@   a quoted absolute path inside an owned root ('...' or "...", no expansions)
//   @inner@  like @path@, but strictly below an owned root (used for deletions)
//   @int@    decimal digits
//   @excludes@  zero or more ` --exclude '<safe glob>'` options
// A RegExp template is matched against the whole script. Because a pattern cannot validate
// paths, such a form should supply `verify`, which receives the matched text and a predicate
// for "this absolute path is inside an owned root"; returning false refuses the script.
export type ShellForm = {
  name: string;
  template: string | RegExp;
  acceptsStdin?: boolean;
  verify?: (text: string, owns: (candidate: string) => boolean) => boolean;
};

// A known installer request may be simulated, never run: `request` is the exact script text the
// adapter sends, `script` is the harmless local replacement the consumer wrote.
export type InstallStub = { request: string; script: string };

export type SandboxCallPolicy = {
  /** Per-test roots from mkdtemp. Never `os.tmpdir()` itself and never an ancestor of it. */
  ownedRoots: readonly string[];
  /** Exact absolute paths of fixture binaries that may be the command. */
  executables?: readonly string[];
  shellForms?: readonly ShellForm[];
  /** Bare shell command names accepted for `<shell> -c <script>`. Default `sh`, `bash`. */
  shells?: readonly string[];
  /** Flags accepted before the script. Default `-c`, `-lc`. */
  shellFlags?: readonly string[];
  installStub?: InstallStub;
};

const DEFAULT_SHELLS = ["sh", "bash"] as const;
const DEFAULT_SHELL_FLAGS = ["-c", "-lc"] as const;
const MAX_SCRIPT_LENGTH = 64 * 1024;
const MAX_NESTING = 2;

// Defense in depth on registered stubs and on fixture-binary arguments. The primary control is
// the whitelist, so these only name an obvious network or installer form precisely.
const NETWORK_PATTERNS: Array<[string, RegExp]> = [
  ["installer host", /\bcursor\.com\b/],
  ["url scheme", /\b[a-z][a-z0-9+.-]*:\/\//],
  ["download tool", /\b(curl|wget|fetch|aria2c|ftp|tftp|sftp|scp|rsync|nc|ncat|netcat|socat|telnet|ssh)\b/],
  ["raw socket", /\/dev\/(tcp|udp)\b/],
];

function realOrNull(candidate: string): string | null {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

function isWithin(candidate: string, root: string, options: { strict: boolean }): boolean {
  if (candidate === root) return !options.strict;
  return candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

// Resolves symlinks of the longest existing prefix so a link cannot lead out of the root, and
// keeps the missing tail lexical (a path that does not exist yet is judged by where it would be).
function resolveFuture(candidate: string): string | null {
  if (!path.isAbsolute(candidate) || candidate.includes("\0")) return null;
  if (candidate.split(path.sep).some(segment => segment === ".." || segment === ".")) return null;
  const normalized = path.normalize(candidate);
  let current = normalized;
  const tail: string[] = [];
  for (;;) {
    const real = realOrNull(current);
    if (real !== null) return path.join(real, ...tail.reverse());
    const parent = path.dirname(current);
    if (parent === current) return null;
    tail.push(path.basename(current));
    current = parent;
  }
}

export function resolveOwnedPath(
  candidate: string,
  ownedRoots: readonly string[],
  options: { strict?: boolean } = {},
): string | null {
  const resolved = resolveFuture(candidate);
  if (resolved === null) return null;
  const strict = options.strict ?? false;
  return ownedRoots.some(root => isWithin(resolved, root, { strict })) ? resolved : null;
}

// Throws for a root that is not exactly a private directory a test created for itself.
export function assertOwnedRoots(roots: readonly string[]): string[] {
  if (roots.length === 0) throw new Error("sandbox guard: at least one owned root is required");
  const tmp = realOrNull(os.tmpdir());
  const normalized: string[] = [];
  for (const root of roots) {
    if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error(`sandbox guard: root is not absolute: ${String(root)}`);
    const real = realOrNull(root);
    if (real === null) throw new Error(`sandbox guard: root does not exist: ${root}`);
    const stat = fs.statSync(real);
    if (!stat.isDirectory()) throw new Error(`sandbox guard: root is not a directory: ${root}`);
    if (real === path.parse(real).root) throw new Error("sandbox guard: the filesystem root is not an owned root");
    if (tmp !== null && (real === tmp || isWithin(tmp, real, { strict: false }))) {
      throw new Error(`sandbox guard: ${root} is the system temp directory or one of its ancestors, not a per-test root`);
    }
    if (tmp !== null && !isWithin(real, tmp, { strict: true })) {
      throw new Error(`sandbox guard: ${root} is not below the system temp directory`);
    }
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
      throw new Error(`sandbox guard: ${root} is not owned by the current user`);
    }
    if ((stat.mode & 0o022) !== 0) throw new Error(`sandbox guard: ${root} is writable by other users`);
    normalized.push(real);
  }
  return normalized;
}

const SINGLE_QUOTED_PATH = `'([^'"\\\\$\`\\n\\0]*)'`;
const DOUBLE_QUOTED_PATH = `"([^'"\\\\$\`\\n\\0]*)"`;
const PATH_SOURCE = `(?:${SINGLE_QUOTED_PATH}|${DOUBLE_QUOTED_PATH})`;
const EXCLUDES_SOURCE = `(?: --exclude '[A-Za-z0-9._*/-]+')*`;

type CompiledForm = { form: ShellForm; regex: RegExp; captures: Array<"path" | "inner"> };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileForm(form: ShellForm): CompiledForm {
  if (form.template instanceof RegExp) {
    const source = form.template.source;
    return { form, regex: new RegExp(`^(?:${source})$`, form.template.flags.replace(/[gy]/g, "")), captures: [] };
  }
  const captures: Array<"path" | "inner"> = [];
  let source = "";
  for (const part of form.template.split(/(@path@|@inner@|@int@|@excludes@)/)) {
    if (part === "@path@" || part === "@inner@") {
      captures.push(part === "@path@" ? "path" : "inner");
      source += PATH_SOURCE;
    } else if (part === "@int@") source += "[0-9]{1,12}";
    else if (part === "@excludes@") source += EXCLUDES_SOURCE;
    else source += escapeRegex(part);
  }
  return { form, regex: new RegExp(`^${source}$`), captures };
}

function matchesForm(compiled: CompiledForm, text: string, ownedRoots: readonly string[]): boolean {
  const match = compiled.regex.exec(text);
  if (!match) return false;
  // Each path placeholder contributes two groups (single- and double-quoted); one is set.
  for (const [index, kind] of compiled.captures.entries()) {
    const value = match[index * 2 + 1] ?? match[index * 2 + 2];
    if (value === undefined || value.length === 0) return false;
    if (resolveOwnedPath(value, ownedRoots, { strict: kind === "inner" }) === null) return false;
  }
  if (compiled.form.verify) {
    return compiled.form.verify(text, candidate => resolveOwnedPath(candidate, ownedRoots) !== null);
  }
  return true;
}

// Splits on ` && ` outside quotes. Returns null for anything the whitelist does not model.
function splitChain(script: string): string[] | null {
  const clauses: string[] = [];
  let quote: "'" | '"' | null = null;
  let start = 0;
  for (let index = 0; index < script.length; index += 1) {
    const char = script[index]!;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "\\") return null;
    else if (script.startsWith(" && ", index)) {
      clauses.push(script.slice(start, index));
      start = index + 4;
      index += 3;
    }
  }
  if (quote) return null;
  clauses.push(script.slice(start));
  return clauses.every(clause => clause.length > 0) ? clauses : null;
}

// `sh -c '<script>'` written with the POSIX `'"'"'` idiom: only quoted segments are accepted.
function unwrapNestedShell(script: string, shells: readonly string[], flags: readonly string[]): string | null {
  for (const shell of shells) {
    for (const flag of flags) {
      const prefix = `${shell} ${flag} `;
      if (!script.startsWith(prefix)) continue;
      const body = script.slice(prefix.length);
      if (!/^(?:'[^']*'|"'")+$/.test(body)) return null;
      return body.replace(/'([^']*)'|"'"/g, (_whole, quoted: string | undefined) => (quoted === undefined ? "'" : quoted));
    }
  }
  return null;
}

function inspectScript(
  script: string,
  hasStdin: boolean,
  forms: CompiledForm[],
  policy: SandboxCallPolicy,
  roots: readonly string[],
  depth: number,
): string | null {
  // Returns a refusal reason, or null when allowed.
  if (script.length === 0 || script.length > MAX_SCRIPT_LENGTH) return "script is empty or too long";
  if (/[\0\n\r]/.test(script)) return "script contains a control character or newline";
  const whole = forms.find(compiled => matchesForm(compiled, script, roots));
  if (whole) return hasStdin && !whole.form.acceptsStdin ? `form "${whole.form.name}" does not take stdin` : null;
  const nested = unwrapNestedShell(script, policy.shells ?? DEFAULT_SHELLS, policy.shellFlags ?? DEFAULT_SHELL_FLAGS);
  if (nested !== null) {
    if (depth >= MAX_NESTING) return "shell nesting is too deep";
    return inspectScript(nested, hasStdin, forms, policy, roots, depth + 1);
  }
  const clauses = splitChain(script);
  if (clauses === null) return "script is not a recognized template (unbalanced quote, escape or empty clause)";
  if (clauses.length === 1) return "script does not match any registered template";
  for (const clause of clauses) {
    const matched = forms.find(compiled => matchesForm(compiled, clause, roots));
    if (!matched) return `command position is not a registered template: ${clause.slice(0, 80)}`;
    if (hasStdin) return "stdin is only accepted for a single registered form that takes it";
  }
  return null;
}

// Names an obvious network or installer form. Used by the guard and by the runner's tripwire.
export function scanNetwork(label: string, text: string): string | null {
  const lowered = text.replace(/['"\\]/g, "").toLowerCase();
  for (const [name, pattern] of NETWORK_PATTERNS) {
    const match = pattern.exec(lowered);
    if (match) return `${label} matches denied pattern: ${name} ("${match[0]}")`;
  }
  return null;
}

// Validates a policy once, at runner creation, so a bad root or stub fails the test setup.
export type CompiledPolicy = {
  policy: SandboxCallPolicy;
  roots: string[];
  forms: CompiledForm[];
};

export function compilePolicy(policy: SandboxCallPolicy): CompiledPolicy {
  const roots = assertOwnedRoots(policy.ownedRoots);
  for (const executable of policy.executables ?? []) {
    if (resolveOwnedPath(executable, roots, { strict: true }) === null) {
      throw new Error(`sandbox guard: registered executable is not below an owned root: ${executable}`);
    }
  }
  if (policy.installStub) {
    const { request, script } = policy.installStub;
    if (request.length === 0 || script.length === 0) throw new Error("sandbox guard: install stub is incomplete");
    const network = scanNetwork("install stub", script);
    if (network) throw new Error(`sandbox guard: ${network}`);
    for (const match of script.matchAll(/"(\/[^"\n]*)"/g)) {
      if (resolveOwnedPath(match[1]!, roots) === null) {
        throw new Error(`sandbox guard: install stub names a path outside the owned roots: ${match[1]}`);
      }
    }
  }
  return { policy, roots, forms: (policy.shellForms ?? []).map(compileForm) };
}

export function inspectSandboxCall(input: SandboxCall, compiled: CompiledPolicy): GuardVerdict {
  const { policy, roots, forms } = compiled;
  const { command, args = [], stdin } = input;
  if (typeof command !== "string" || command.length === 0) return { allowed: false, reason: "command is not a string" };
  if (!Array.isArray(args) || args.some(arg => typeof arg !== "string")) {
    return { allowed: false, reason: "args are not all strings" };
  }
  if (stdin !== undefined && typeof stdin !== "string") return { allowed: false, reason: "stdin is not a string" };
  const hasStdin = typeof stdin === "string" && stdin.length > 0;

  if ((policy.shells ?? DEFAULT_SHELLS).includes(command)) {
    const flags = policy.shellFlags ?? DEFAULT_SHELL_FLAGS;
    if (args.length !== 2 || !flags.includes(args[0]!)) {
      return { allowed: false, reason: `shell invocation is not \`${command} -c <script>\`; stdin or file code is refused` };
    }
    const script = args[1]!;
    if (policy.installStub && script === policy.installStub.request) {
      if (hasStdin) return { allowed: false, reason: "stdin is not accepted for the simulated install" };
      return { allowed: true, simulatedInstall: true, call: { ...input, args: [args[0]!, policy.installStub.script] } };
    }
    const reason = inspectScript(script, hasStdin, forms, policy, roots, 0);
    return reason === null ? { allowed: true, simulatedInstall: false, call: input } : { allowed: false, reason };
  }

  const registered = (policy.executables ?? []).includes(command);
  if (!registered) {
    return { allowed: false, reason: `command ${command.slice(0, 120)} is not a registered shell or fixture executable` };
  }
  const real = resolveOwnedPath(command, roots, { strict: true });
  if (real === null || !fs.existsSync(real)) {
    return { allowed: false, reason: "registered executable does not exist below an owned root" };
  }
  for (const [index, arg] of args.entries()) {
    const network = scanNetwork(`arg ${index}`, arg);
    if (network) return { allowed: false, reason: network };
  }
  // A fixture binary reads stdin as its prompt, so it is data here and never executed.
  return { allowed: true, simulatedInstall: false, call: input };
}

// Forms every runner built on the managed-runtime protocol sends. They are provider neutral:
// each argument is a quoted path the test owns, and none can start a network client.
export const MANAGED_RUNTIME_SHELL_FORMS: readonly ShellForm[] = [
  { name: "mkdir", template: "mkdir -p @path@" },
  { name: "directory probe", template: "[ -d @path@ ]" },
  { name: "remove file", template: "rm -f @inner@" },
  { name: "remove file (--)", template: "rm -f -- @inner@" },
  { name: "remove tree", template: "rm -rf @inner@" },
  { name: "truncate", template: ": > @path@" },
  { name: "append upload chunk", template: "base64 -d >> @path@", acceptsStdin: true },
  { name: "move", template: "mv -f @inner@ @path@" },
  { name: "extract", template: "tar -xf @path@ -C @path@" },
  { name: "clear workspace", template: "find @inner@ -mindepth 1 -maxdepth 1 ! -name '.paperclip-runtime' ! -name '.paperclip-upload-*' -exec rm -rf -- {} +" },
  { name: "copy", template: "cp -a @path@ @path@" },
  { name: "change directory", template: "cd @path@" },
  { name: "list entries", template: "find . -mindepth 1 -maxdepth 1 -print0 > @path@" },
  { name: "archive", template: "tar -cf @path@@excludes@ --null -T @path@" },
  { name: "size", template: "wc -c < @path@" },
  { name: "read chunk", template: "dd if=@path@ bs=@int@ skip=@int@ count=@int@ 2>/dev/null | base64" },
];
