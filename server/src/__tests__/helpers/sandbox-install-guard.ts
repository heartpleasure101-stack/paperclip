import {
  MANAGED_RUNTIME_SHELL_FORMS,
  type InstallStub,
  type ShellForm,
} from "@paperclipai/adapter-utils/test-fixtures/sandbox-call-guard";
import {
  createGuardedSandboxRunner,
  type LocalBackendOptions,
  type SandboxBackend,
} from "@paperclipai/adapter-utils/test-fixtures/sandbox-fixture-runner";

// Cursor consumer of the provider-neutral sandbox call guard. An earlier diagnostic probe lacked
// a guard and really downloaded and ran the Cursor CLI, so every fake Cursor sandbox runner in
// the server tests is built here. The shapes below are the ones the adapter really sends; each
// test registers its own owned roots and fixture executables, and anything else is refused
// before a backend runs. The threat model is an accidental install, not an adversarial script.

export const INSTALL_BLOCKED_MESSAGE = "Sandbox fixture did not discover its preinstalled Cursor CLI";

const HOME_MARKER = "__PAPERCLIP_CURSOR_HOME__:";
const AGENT_MARKER = "__PAPERCLIP_CURSOR_AGENT__:";
// The adapter writes the printf newline as backslash, backslash, n inside the script text.
const NEWLINE_ESCAPE = "\\\\n";
const DEFAULT_COMMAND_NAMES = ["agent", "cursor-agent"] as const;
const CANDIDATE_RELATIVE_PATHS = [".local/bin/agent", ".cursor/bin/agent", ".local/bin/cursor-agent", ".cursor/bin/cursor-agent"];

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alternation = (values: readonly string[]) => `(?:${values.map(literal).join("|")})`;
// A double-quoted absolute path the adapter embeds with JSON.stringify; ownership is checked by `verify`.
const QUOTED_ABSOLUTE = '"/[^"$\\\\`\\n]+"';
const quotedAbsolutePaths = (text: string) => [...text.matchAll(/"(\/[^"]*)"/g)].map(match => match[1]!);

function discoveryForm(commandNames: readonly string[]): ShellForm {
  const relatives = alternation(CANDIDATE_RELATIVE_PATHS);
  const names = alternation(commandNames);
  const printAgent = (target: string) => `${literal(`printf "${AGENT_MARKER}%s${NEWLINE_ESCAPE}" `)}${target}`;
  const homeBranch = `${literal('[ -x "$HOME/')}${relatives}${literal('" ] && ')}${printAgent(`${literal('"$HOME/')}${relatives}${literal('"')}`)}`;
  const absoluteBranch = `${literal("[ -x ")}${QUOTED_ABSOLUTE}${literal(" ] && ")}${printAgent(QUOTED_ABSOLUTE)}`;
  const pathBranch = `${literal('resolved="$(command -v "')}${names}${literal('" 2>/dev/null)" && [ -n "$resolved" ] && ')}${printAgent(literal('"$resolved"'))}`;
  const branch = `(?:${homeBranch}|${absoluteBranch}|${pathBranch})`;
  const source =
    `${literal(`printf "${HOME_MARKER}%s${NEWLINE_ESCAPE}" `)}(?:${literal('"$HOME"')}|${QUOTED_ABSOLUTE})` +
    `${literal("; if ")}${branch}${literal("; then :")}` +
    `(?:${literal("; elif ")}${branch}${literal("; then :")})*${literal("; fi; :")}`;
  return {
    name: "cursor command discovery",
    template: new RegExp(source),
    verify: (text, owns) => quotedAbsolutePaths(text).every(owns),
  };
}

export function cursorShellForms(commandNames: readonly string[] = DEFAULT_COMMAND_NAMES): ShellForm[] {
  const quiet = " >/dev/null 2>&1";
  const forms: ShellForm[] = [
    ...MANAGED_RUNTIME_SHELL_FORMS,
    { name: "home marker from $HOME", template: `printf "${HOME_MARKER}%s${NEWLINE_ESCAPE}" "$HOME"` },
    { name: "home marker from a known home", template: `printf "${HOME_MARKER}%s${NEWLINE_ESCAPE}" @path@` },
    { name: "command lookup by path", template: "command -v @path@" },
    { name: "command lookup by path, quiet", template: `command -v @path@${quiet}` },
    discoveryForm(commandNames),
  ];
  for (const name of commandNames) {
    forms.push({ name: `command lookup of ${name}`, template: `command -v '${name}'` });
    forms.push({ name: `command lookup of ${name}, quiet`, template: `command -v '${name}'${quiet}` });
  }
  return forms;
}

export type CursorSandboxRunnerOptions = {
  /** Directories created for this test only (mkdtemp). Never os.tmpdir() itself. */
  ownedRoots: readonly string[];
  /** Exact paths of the fixture binaries this test may start. */
  executables: readonly string[];
  commandNames?: readonly string[];
  installStub?: InstallStub;
  backend?: SandboxBackend;
  backendOptions?: LocalBackendOptions;
};

export function createCursorSandboxRunner(options: CursorSandboxRunnerOptions) {
  return createGuardedSandboxRunner({
    policy: {
      ownedRoots: options.ownedRoots,
      executables: options.executables,
      shellForms: cursorShellForms(options.commandNames),
      installStub: options.installStub,
    },
    backend: options.backend,
    backendOptions: { label: "cursor-sandbox-execute", ...options.backendOptions },
    refusalMessage: INSTALL_BLOCKED_MESSAGE,
  });
}
