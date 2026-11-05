import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./validation-clean-env.mjs", import.meta.url));
const ALLOWED_NAMES = new Set([
  "PATH", "HOME", "TMPDIR", "PAPERCLIP_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
  "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT", "GIT_OPTIONAL_LOCKS",
  "COREPACK_HOME", "COREPACK_ENABLE_NETWORK", "COREPACK_ENABLE_AUTO_PIN", "RUSTUP_AUTO_INSTALL",
]);
// macOS adds this to every process it starts; the helper's own plan (see --describe) never contains it.
const OS_INJECTED_NAMES = new Set(["__CF_USER_TEXT_ENCODING"]);
// Fake values only: none of these is a real credential, and no real secret is read anywhere.
const FAKE_HOST_ENV = {
  PV_FAKE_PROVIDER_API_KEY: "sentinel-provider-key-not-real",
  OPENAI_API_KEY: "sentinel-openai-not-real",
  ANTHROPIC_API_KEY: "sentinel-anthropic-not-real",
  DATABASE_URL: "postgres://sentinel-user:sentinel-pass@db.invalid/x",
  GIT_AUTHOR_EMAIL: "host-person@example.invalid",
};

function hostFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-env-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "personal-home");
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, ".gitconfig"), "[user]\n\tname = Host Person\n\temail = host-person@example.invalid\n");
  const bin = path.join(root, "declared-bin");
  fs.mkdirSync(bin);
  // A host-level monkeypatch: every Node started with this NODE_OPTIONS sets a marker variable.
  const preload = path.join(root, "pv-host-monkeypatch.cjs");
  fs.writeFileSync(preload, 'process.env.PV_PRELOAD_MARKER = "preload-ran";\n');
  const env = { ...FAKE_HOST_ENV, NODE_OPTIONS: `--require=${preload}`, PATH: "/usr/bin:/bin", HOME: home, TMPDIR: os.tmpdir() };
  return { root, home, bin, env };
}

const run = (host, args, extraEnv = {}) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...host.env, ...extraEnv } });

const PRINT_ENV = ["-e", "const fs = require('fs'), path = require('path'); process.stdout.write(JSON.stringify({ env: process.env, git: fs.readFileSync(process.env.GIT_CONFIG_GLOBAL, 'utf8'), rootReal: fs.realpathSync(path.dirname(process.env.HOME)) }))"];

test("the child sees only allowlisted variables and none of the sentinel secrets", (t) => {
  const host = hostFixture(t);
  const result = run(host, ["--bin", host.bin, "--", process.execPath, ...PRINT_ENV]);
  assert.equal(result.status, 0, result.stderr);
  const { env, git } = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(env).filter((name) => !ALLOWED_NAMES.has(name) && !OS_INJECTED_NAMES.has(name)), []);
  for (const name of [...Object.keys(FAKE_HOST_ENV), "NODE_OPTIONS", "PV_PRELOAD_MARKER"]) assert.equal(env[name], undefined, name);
  assert.doesNotMatch(JSON.stringify(env), /sentinel|host-person|monkeypatch/);
  assert.match(git, /validation@paperclip\.invalid/);
  assert.doesNotMatch(git, /Host Person/);
});

test("HOME, PAPERCLIP_HOME and config are owned temporary directories, removed afterwards", (t) => {
  const host = hostFixture(t);
  const result = run(host, ["--", process.execPath, ...PRINT_ENV]);
  const { env, rootReal } = JSON.parse(result.stdout);
  const root = path.dirname(env.HOME);
  assert.notEqual(env.HOME, host.home);
  assert.equal(path.dirname(rootReal), fs.realpathSync(os.tmpdir()));
  for (const name of ["PAPERCLIP_HOME", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "COREPACK_HOME"]) {
    assert.equal(path.dirname(env[name]), root, name);
  }
  assert.equal(env.GIT_CONFIG_GLOBAL, path.join(root, "git", "config"));
  assert.equal(fs.existsSync(root), false, "the owned directory is cleaned up");
  assert.equal(fs.readFileSync(path.join(host.home, ".gitconfig"), "utf8").includes("Host Person"), true);
});

test("PATH is the running Node, the declared directories and system directories only", (t) => {
  const host = hostFixture(t);
  const { env } = JSON.parse(run(host, ["--bin", host.bin, "--", process.execPath, ...PRINT_ENV]).stdout);
  assert.deepEqual(env.PATH.split(path.delimiter), [path.dirname(process.execPath), host.bin, "/usr/bin", "/bin", "/usr/sbin", "/sbin"]);
  assert.equal(env.COREPACK_ENABLE_NETWORK, "0");
  assert.equal(env.COREPACK_ENABLE_AUTO_PIN, "0");
  assert.equal(env.RUSTUP_AUTO_INSTALL, "0");
});

test("Git inside the clean environment uses the synthetic identity, not the personal one", (t) => {
  const host = hostFixture(t);
  const git = ["/usr/bin/git", "/bin/git"].find((candidate) => fs.existsSync(candidate));
  if (!git) return t.skip("no system git at a fixed path");
  const result = run(host, ["--", git, "config", "--global", "--get", "user.email"]);
  assert.equal(result.stdout.trim(), "validation@paperclip.invalid");
});

test("explicit --set and --pass are forwarded, but credential-like and injection names are refused", (t) => {
  const host = hostFixture(t);
  const ok = run(host, ["--set", "npm_config_store_dir=/declared/store", "--pass", "PV_BENIGN", "--", process.execPath, ...PRINT_ENV], { PV_BENIGN: "visible" });
  const { env } = JSON.parse(ok.stdout);
  assert.equal(env.npm_config_store_dir, "/declared/store");
  assert.equal(env.PV_BENIGN, "visible");
  for (const refused of [["--pass", "OPENAI_API_KEY"], ["--pass", "PV_FAKE_PROVIDER_API_KEY"], ["--pass", "NODE_OPTIONS"], ["--set", "GITHUB_TOKEN=x"], ["--set", "DATABASE_URL=postgres://x"], ["--pass", "DYLD_INSERT_LIBRARIES"]]) {
    const result = run(host, [...refused, "--", process.execPath, "-e", "0"]);
    assert.equal(result.status, 2, refused.join(" "));
    assert.match(result.stderr, /refusing to forward/);
    assert.doesNotMatch(result.stderr + result.stdout, /sentinel/);
  }
});

test("an undeclared tool is not found, and the child exit status is propagated", (t) => {
  const host = hostFixture(t);
  const missing = run(host, ["--", "pv-tool-that-is-not-declared"]);
  assert.equal(missing.status, 127);
  assert.match(missing.stderr, /declare its directory with --bin/);
  assert.equal(run(host, ["--", process.execPath, "-e", "process.exit(7)"]).status, 7);
  assert.equal(run(host, ["--bin", "relative/dir", "--", process.execPath, "-e", "0"]).status, 2);
  assert.equal(run(host, ["--"]).status, 2);
});

test("--describe prints the plan without running anything and without secret names", (t) => {
  const host = hostFixture(t);
  const result = run(host, ["--describe", "--bin", host.bin]);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.schema, "paperclip.validation-clean-env.v1");
  assert.deepEqual(Object.keys(plan.env).filter((name) => !ALLOWED_NAMES.has(name)), []);
  assert.doesNotMatch(result.stdout, /sentinel|API_KEY|NODE_OPTIONS/);
});
