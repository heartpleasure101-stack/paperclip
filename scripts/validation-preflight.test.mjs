import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runPreflight } from "./validation-preflight.mjs";

const script = fileURLToPath(new URL("./validation-preflight.mjs", import.meta.url));
const SYSTEM_PATH = "/usr/bin:/bin";

/** Fake executables in a private directory stand in for isolated tool installations. */
function fixture(t, { python = "3.9.6", gitRejectsNot = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "tools");
  fs.mkdirSync(bin);
  const write = (name, body) => { fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return path.join(bin, name); };
  const paths = {
    pnpm: write("pnpm", 'echo "9.15.4"'),
    python: write("python3", `echo "Python ${python}"`),
    git: write("git", `while [ "$1" = "-c" ]; do shift 2; done
case "$1" in
  --version) echo "git version 2.99.0";;
  init) mkdir -p .git;;
  rev-list) ${gitRejectsNot ? 'echo "fatal: options not supported in --stdin mode" >&2; exit 128' : "while read -r _; do :; done"};;
  rev-parse) echo 0123456789abcdef0123456789abcdef01234567;;
esac`),
    rustc: write("rustc", 'echo "rustc 1.97.1 (fake)"'),
    cargo: write("cargo", '[ "$1" = fmt ] && { echo "rustfmt 1.0 (fake)"; exit 0; }; echo "cargo 1.97.1 (fake)"'),
  };
  const flags = Object.entries(paths).flatMap(([tool, file]) => [`--${tool}`, file]);
  return { root, bin, paths, flags };
}

const cli = (args, env = {}) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { PATH: SYSTEM_PATH, ...env } });
  return { ...result, json: result.stdout.trim().startsWith("{") ? JSON.parse(result.stdout) : null };
};

test("passes with explicit isolated tool paths and reports the paths and versions it used", (t) => {
  const f = fixture(t);
  const result = cli(["--stage", "full", "--json", ...f.flags]);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.json.ok, true);
  const byId = Object.fromEntries(result.json.checks.map((check) => [check.id, check]));
  assert.equal(byId.git.path, f.paths.git);
  assert.equal(byId.git.source, "flag");
  assert.match(byId.git.version, /2\.99\.0/);
  assert.match(byId.python.version, /3\.9\.6/);
  assert.equal(byId["git-rev-list-stdin-not"].status, "pass");
  assert.match(byId.rustc.version, /1\.97\.1/);
  assert.match(byId.git.hint, new RegExp(`prepend ${f.bin}`));
  assert.equal(byId.node.path, process.execPath);
});

test("a missing required tool fails with a non-zero exit and names the tool", (t) => {
  const f = fixture(t);
  const flags = f.flags.filter((_, index, all) => all[index - 1] !== "--python" && all[index] !== "--python");
  // /bin has the shell utilities the fake Git needs but no python3.
  const result = cli(["--stage", "blockers", "--json", ...flags], { PATH: "/bin" });
  assert.equal(result.status, 1);
  assert.deepEqual(result.json.failed, ["python"]);
  assert.match(result.json.checks.find((check) => check.id === "python").detail, /python3 not found on PATH/);
});

test("Python older than the supported floor fails; the floor itself passes", (t) => {
  assert.equal(cli(["--json", ...fixture(t, { python: "3.8.18" }).flags]).json.failed.join(), "python");
  assert.equal(cli(["--json", ...fixture(t, { python: "3.9.0" }).flags]).status, 0);
});

test("a Git that rejects --not on stdin fails the capability probe", (t) => {
  const result = cli(["--json", ...fixture(t, { gitRejectsNot: true }).flags]);
  assert.equal(result.status, 1);
  assert.deepEqual(result.json.failed, ["git-rev-list-stdin-not"]);
  assert.match(result.json.checks.find((check) => check.id === "git-rev-list-stdin-not").detail, /options not supported in --stdin mode/);
});

test("Rust is required only by the stages that build or typecheck it", (t) => {
  const f = fixture(t);
  const withoutRust = f.flags.filter((flag, index, all) => !["--cargo", "--rustc"].includes(flag) && !["--cargo", "--rustc"].includes(all[index - 1]));
  const blockers = cli(["--stage", "blockers", "--json", ...withoutRust]);
  assert.equal(blockers.status, 0, blockers.stdout);
  assert.equal(blockers.json.checks.find((check) => check.id === "rustc").status, "skip");
  const full = cli(["--stage", "full", "--json", ...withoutRust]);
  assert.equal(full.status, 1);
  assert.deepEqual(full.json.failed, ["rustc", "cargo"]);
});

test("the Git probe uses a private directory and removes it", (t) => {
  const f = fixture(t);
  const scratchParent = path.join(f.root, "scratch");
  fs.mkdirSync(scratchParent);
  const result = runPreflight({ stage: "blockers", tmpdir: scratchParent, paths: f.paths, env: { PATH: SYSTEM_PATH } });
  assert.equal(result.ok, true);
  assert.deepEqual(fs.readdirSync(scratchParent), []);
});

test("it changes nothing on disk and never prints database credentials", (t) => {
  const f = fixture(t);
  const before = fs.readdirSync(f.root).sort();
  const result = cli(["--json", ...f.flags], { DATABASE_URL: "postgres://prod_user:s3cretPassw0rd@db.prod.example:5432/paperclip?sslmode=require" });
  assert.equal(result.status, 0);
  assert.deepEqual(fs.readdirSync(f.root).sort(), before);
  assert.doesNotMatch(result.stdout, /s3cretPassw0rd|prod_user|sslmode/);
  const warning = result.json.checks.find((check) => check.id === "env-database_url");
  assert.equal(warning.status, "warn");
  assert.match(warning.detail, /db\.prod\.example/);
});

test("the snapshot identity is reported and an unknown stage is a usage error", (t) => {
  const f = fixture(t);
  const ok = cli(["--json", ...f.flags]);
  assert.equal(ok.json.snapshot.available, true);
  assert.match(ok.json.snapshot.head, /^[0-9a-f]{40}$/);
  const bad = cli(["--stage", "everything"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Unknown stage/);
});
