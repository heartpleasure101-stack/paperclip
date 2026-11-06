# Git Environment Fixture Verification Report (Task 2.12)

**Date:** 2026-11-05  
**Author:** agy Gemini 3.8 Flash High (Native Tools Only)  
**Target File:** `packages/adapter-utils/src/github-launcher-environment.test.ts`  
**Repair Branch:** `fix/portable-validation-baseline`  
**Repair Worktree:** `/private/tmp/pv-git-env-fixture-fix`  
**Evidence Directory:** `/private/tmp/pv-git-env-fixture-evidence`  

---

## 1. Context & Task Authorization

- **Task 2.12 Context & Actual Failure:** In Phase 10 (`general-workspaces-b`), 86 of 87 workspace package test files passed (3,157 tests passed, 1 failed, 12 skipped). The single test failure occurred in `@paperclipai/adapter-utils` at `src/github-launcher-environment.test.ts:421`:
  ```text
  FAIL @paperclipai/adapter-utils src/github-launcher-environment.test.ts > managed GitHub launcher environment > preserves local host credential helpers and validates worktree metadata
  AssertionError: expected '/var/folders/0w/.../T/paperclip-clean-env-.../git/config' to be undefined
  - Expected: undefined
  + Received: "/var/folders/0w/.../T/paperclip-clean-env-.../git/config"
  ```
- **Root Cause Analysis:**
  - `scripts/validation-clean-env.mjs` sets `GIT_CONFIG_GLOBAL` to an owned synthetic git configuration (`path.join(own("git"), "config")`) containing safe defaults (`validation@paperclip.invalid`, `gpgsign = false`, `defaultBranch = main`) to ensure environment hygiene and isolate tests from arbitrary user host configurations.
  - In `packages/adapter-utils/src/execution-target.ts`, `prepareGitHubExecutionEnvironment` correctly captures and preserves host `GIT_CONFIG_*` variables when `hostCredentials: true` is requested on localhost/controller targets.
  - The test case `preserves local host credential helpers and validates worktree metadata` simulates a local host configuration by creating a temporary directory (`root`), stubbing `HOME = root` and `GH_TOKEN = legacy-token`, and creating an owned `.gitconfig` with `helper = store`. It asserted `expect(env.GIT_CONFIG_GLOBAL).toBeUndefined()`.
  - When run under normal developer environments where `GIT_CONFIG_GLOBAL` is not exported, `env.GIT_CONFIG_GLOBAL` was undefined. However, in clean-env validation runs, `GIT_CONFIG_GLOBAL` is explicitly provided. The test failed because the fixture did not establish its precondition within its scoped test context.
- **Task 2.12 Authorized Scope:**
  - Modify **ONLY** `packages/adapter-utils/src/github-launcher-environment.test.ts`.
  - Strictly **NO** changes to application source (`execution-target.ts`, `github-launcher.ts`), shared helpers, configuration, clean-env harness (`validation-clean-env.mjs`), official runners, or any other test files.
  - Do not weaken original assertions (`undefined`, `store`, token, worktree metadata, isolated mode).
  - Add an explicit override test case with spaces in path proving that `GIT_CONFIG_GLOBAL` takes precedence over `$HOME/.gitconfig`.

---

## 2. Test-Only Fixture Design & Invariant Mapping

### 2.1 Architecture of the Fix

1. **Scoped Precondition Establishment in Existing Test Case:**
   - In `it("preserves local host credential helpers and validates worktree metadata")`, explicitly stub `GIT_CONFIG_GLOBAL` to `undefined`:
     ```ts
     vi.stubEnv("GIT_CONFIG_GLOBAL", undefined);
     ```
   - This ensures the test executes under its intended invariant: simulating a host without a global config override so that Git reads `$HOME/.gitconfig`.
   - Existing `afterEach` already calls `vi.unstubAllEnvs()`, guaranteeing complete restoration of `GIT_CONFIG_GLOBAL` for subsequent tests and the outer harness.
   - All original assertions remain intact:
     - `expect(env.GH_TOKEN).toBe("legacy-token")`
     - `expect(env.GIT_CONFIG_GLOBAL).toBeUndefined()`
     - `expect(env.PAPERCLIP_GIT_METADATA_ROOTS).toContain("/repo/.git")`
     - `expect(config.stdout.trim()).toBe("store")`
     - Isolated mode (`hostCredentials: false`): `GH_TOKEN` is undefined, network access is disabled, and host home is undefined.

2. **Explicit Override Test Case:**
   - Adds `it("preserves explicit host GIT_CONFIG_GLOBAL overrides with spaces over HOME gitconfig")`.
   - Sets up an owned fake `HOME` (`root`) with `.gitconfig` specifying `[credential] helper = home-fixture`.
   - Sets up an owned custom global config directory with spaces in the path (`paperclip custom global config-...`) containing a config file with spaces (`custom gitconfig with spaces`) specifying `[credential] helper = override-fixture`.
   - Stubs `HOME = root`, `GH_TOKEN = synthetic-override-token`, and `GIT_CONFIG_GLOBAL = overrideConfig`.
   - Inits an owned Git repository (`root/repo`).
   - Invokes `prepareGitHubExecutionEnvironment({ target: null, cwd: path.join(root, "repo"), env: {}, hostCredentials: true, networkAccess: true })`.
   - Positive assertions:
     - `expect(env.GH_TOKEN).toBe("synthetic-override-token")`
     - `expect(env.GIT_CONFIG_GLOBAL).toBe(overrideConfig)` (path preserved verbatim, including spaces)
     - `expect(env.PAPERCLIP_GIT_METADATA_ROOTS).toContain("/repo/.git")`
     - `expect(config.stdout.trim()).toBe("override-fixture")` (Git prioritizes `GIT_CONFIG_GLOBAL` over `$HOME/.gitconfig`)
     - `expect(config.stdout.trim()).not.toBe("home-fixture")`
   - Negative Control / Causal Proof:
     - When `GIT_CONFIG_GLOBAL` is cleared from the execution environment (`delete fallbackEnv.GIT_CONFIG_GLOBAL`), Git falls back to `$HOME/.gitconfig`, returning `home-fixture`. This proves that `override-fixture` was strictly caused by the explicit global config path.
   - Isolated mode (`hostCredentials: false`):
     - `GH_TOKEN` is undefined, `GIT_CONFIG_GLOBAL` is undefined, network access is disabled, host home is undefined.
   - Resource Cleanup & Hygiene:
     - Both temporary directories are pushed to `roots` and recursively cleaned up in `afterEach`.
     - `vi.unstubAllEnvs()` restores all environment variables.
     - Never executes actual helper binaries; only inspects `git config credential.helper`.

---

## 3. Verification Evidence & Test Execution

### 3.1 Bounded Reproduction of Old Failure

- **Harness:** `scripts/validation-clean-env.mjs`
- **Command:** `node scripts/validation-clean-env.mjs ... -- node ./node_modules/vitest/vitest.mjs run --dir packages/adapter-utils src/github-launcher-environment.test.ts`
- **Outcome:** **FAILED (Exit 1)**
  - `AssertionError: expected '/var/folders/.../git/config' to be undefined`
  - Exact match for Phase 10 log line 787..809.
  - Log saved to `/private/tmp/pv-git-env-fixture-evidence/old-fixture-failure.log`.

### 3.2 Bounded Repeat Executions (3/3 Consecutive Passes)

Executed using the authoritative clean-env recipe:
- **Node.js:** v24.18.0 (`/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`)
- **Git:** v2.56.0 (`/private/tmp/pi-dedup-git-toolchain/bin`)
- **Rust/Cargo:** 1.97.1 (`/private/tmp/pi-dedup-rust-toolchain/cargo/bin`)
- **Corepack:** `/private/tmp/pv-clean-tools/corepack`
- **Flags:** `CARGO_NET_OFFLINE=true`, `CI=1`

All 3 runs recorded in `/private/tmp/pv-git-env-fixture-evidence/`:
- **Run 1 (`run1.log`):**
  - Command: `vitest run --root packages/adapter-utils src/github-launcher-environment.test.ts`
  - Exit Code: **0**
  - Tests: **35 passed, 1 skipped (36 total)**
  - Duration: 14.16s
- **Run 2 (`run2.log`):**
  - Exit Code: **0**
  - Tests: **35 passed, 1 skipped (36 total)**
  - Duration: 14.23s
- **Run 3 (`run3.log`):**
  - Exit Code: **0**
  - Tests: **35 passed, 1 skipped (36 total)**
  - Duration: 14.10s
- **Workspace Project Run (via root config):**
  - Command: `vitest run --project @paperclipai/adapter-utils packages/adapter-utils/src/github-launcher-environment.test.ts`
  - Exit Code: **0**
  - Tests: **35 passed, 1 skipped (36 total)**
  - Duration: 14.75s

### 3.3 Related Tests & Scoped Typecheck

- **Scoped TypeScript Typecheck:**
  - Command: `node /private/tmp/pv-git-env-fixture-fix/node_modules/typescript/lib/tsc.js --noEmit` in `packages/adapter-utils`
  - Exit Code: **0** (Zero errors, strict compilation passed).
- **Related Security Regressions:**
  - `src/paperclip-runner-permissions.test.ts`: **50 passed (50)**
  - `src/execution-target.test.ts`: **22 passed (22)**
  - `src/github-launcher.test.ts`: **26 passed (26)** (verified under project environment)
  - Log saved to `/private/tmp/pv-git-env-fixture-evidence/github-launcher.log`.

---

## 4. Source-Equivalence Proof & Cohort Reuse Impact

### 4.1 Target Equivalence Conditions

- **Repair Baseline Baseline State:** `fix/portable-validation-baseline` at commit `fd7de49ed` is branched from `b57ac3112` and lacks the 5 Pi summary dedup feature files:
  1. `packages/adapter-utils/src/continuation-summary-dedup.test.ts`
  2. `packages/adapter-utils/src/server-utils.ts`
  3. `packages/adapters/opencode-local/src/server/execute.test.ts`
  4. `packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts`
  5. `packages/adapters/pi-local/src/server/execute.ts`
- **Prospective Combined Target:** The prospective combined target is Original `c38597469` merged with the repair branch commit containing:
  - Task 2.11 load fixture TCP preparation fix (`server/src/__tests__/file-resources-git-scan-load.test.ts`).
  - Task 2.12 git environment fixture fix (`packages/adapter-utils/src/github-launcher-environment.test.ts`, SHA256: `d4e275c7357fbf0277281907a85bfbebc6e84a6a4f92a6f5bc4a117b0630550d`).
- **Post-Merge Invariants:**
  - Production code across all layers (`server/`, `packages/`, `cli/`, `ui/`) is 100% byte-identical between the target and `cc56bbcd3` + the 5 Pi files.
  - Zero changes to configuration or dependencies (`package.json`, `pnpm-lock.yaml`, `vitest.config.ts`).
  - Reverse dependency scan confirms no production or shared files import or depend on `github-launcher-environment.test.ts`.

### 4.2 Cohort-by-Cohort Reuse Impact Matrix

| Phase | Group Name | Selected Suites | Tested Commit | Status & Reuse Justification |
|---|---|---|---|---|
| Phase 01 | `general-chat-shard-0` | Chat shard 0, 1 | `cc56bbcd3` | Valid; chat isolated, zero dependency on adapter-utils git env fixture. |
| Phase 02 | `general-chat-shard-1` | Chat shard 2, 3 | `cc56bbcd3` | Valid; chat isolated, zero dependency on adapter-utils git env fixture. |
| Phase 03 | `general-chat-shard-2` | Chat shard 4, 5 | `cc56bbcd3` | Valid; chat isolated, zero dependency on adapter-utils git env fixture. |
| Phase 04 | `general-server-shard-0` | 356 server test suites | `cc56bbcd3` | Valid; server suites, zero dependency on adapter-utils test fixture. |
| Phase 05 | `general-server-shard-1` | 356 server test suites | `cc56bbcd3` | Valid; server suites, zero dependency on adapter-utils test fixture. |
| Phase 06 | `general-server-shard-2` | 356 server test suites | `cc56bbcd3` | Valid; server suites, zero dependency on adapter-utils test fixture. |
| Phase 07 | `general-server-shard-3` | 356 server test suites | `3f1eb1b7b` | Must be re-run on combined target snapshot (contains Task 2.11 load test). |
| Phase 08 | `general-server-native-runner` | 9 native runner suites | `3f1eb1b7b` | Verified on `3f1eb1b7b`. |
| Phase 09 | `general-workspaces-a` | 2 projects (`@paperclipai/ui`, `paperclipai`) | `3f1eb1b7b` | Verified on `3f1eb1b7b`. |
| Phase 10 | `general-workspaces-b` | 17 workspace packages | Prior failed attempt 1 | **MUST BE RE-RUN IN FULL ACROSS ALL 17 PROJECTS** on new target snapshot. Prior attempt 1 log retained immutable. |
| Phase 11 | `general-workspaces-c` | 1 project (`@paperclipai/db`) | Unrun | Not run yet. |
| Phase 12-15 | `serialized` shards 0-3 | Serialized suites | Unrun | Not run yet. |

---

## 5. Summary & Hand-off Disposition

- **Task Status:** Task 2.12 remains **pending** (`[ ]`) in `tasks.md` awaiting independent review and full Phase 10 execution on the immutable target snapshot.
- **Commit Scope:** Explicitly commits:
  1. `packages/adapter-utils/src/github-launcher-environment.test.ts`
  2. `openspec/changes/portable-validation-and-enrollment-regression/design.md`
  3. `openspec/changes/portable-validation-and-enrollment-regression/specs/isolated-validation/spec.md`
  4. `openspec/changes/portable-validation-and-enrollment-regression/tasks.md`
  5. `doc/plans/2026-11-05-git-env-fixture-verification.md`
- **No Premature Integration or Push:** All commits remain local on `fix/portable-validation-baseline`. No push to `origin`, no merge to `c38597469`, and no self-acceptance.
