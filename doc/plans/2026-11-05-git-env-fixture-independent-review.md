# Git Environment Fixture Independent Review (Task 2.12)

**Date:** 2026-11-05  
**Reviewer:** agy Gemini 3.8 Flash High (Native Tools Only, Independent Review Session)  
**Target Commit:** `599d7a6cd37f410274fe5ebd7d071e80e7f0f6f1` in `/private/tmp/pv-git-env-fixture-fix`  
**Repair Branch Base:** `fd7de49edd4f83c5a5daa3e931ef58c7807d9131`  
**Original Parent Commit:** `c38597469` in `/Volumes/AI/projects/paprerclip-v2`  
**Target File:** `packages/adapter-utils/src/github-launcher-environment.test.ts`  
**Target File SHA-256:** `d4e275c7357fbf0277281907a85bfbebc6e84a6a4f92a6f5bc4a117b0630550d`  
**Scratch Directory:** `/private/tmp/pv-git-env-fixture-review`  

---

## 1. Executive Summary & Review Scope

This independent review verifies the test-only repair in commit `599d7a6cd` authored to resolve the Phase 10 (`general-workspaces-b`) failure under clean-env validation.

### Key Metrics & Status
- **Exact Diff `fd7de49ed..599d7a6cd`:** Exactly 5 files modified (1 executable test file, 3 normative docs under `openspec/`, and 1 producer verification plan).
- **Executable Change:** Exactly +34 lines in `packages/adapter-utils/src/github-launcher-environment.test.ts` (+1 line scoped precondition `vi.stubEnv("GIT_CONFIG_GLOBAL", undefined)` in existing test, +33 lines for new override test case with spaces).
- **Production Code & Clean-Env Harness:** 100% UNCHANGED (`execution-target.ts`, `github-launcher.ts`, `validation-clean-env.mjs`, runner interfaces have zero diff).
- **Assertion Fidelity:** All original assertions (`undefined`, `store`, token, worktree metadata, isolated mode) remain 100% identical; no assertions weakened or commented out.
- **Test Case Inventory:** 36 cases total (35 passed, 1 skipped). Exactly +1 case added over preexisting 35 total. Preexisting 1 skip (`it.runIf(process.platform === "linux")`) verified legitimate platform guard.
- **Independent Clean-Env Execution:** 3/3 consecutive runs passed exit 0 (14.54s, 14.37s, 14.28s). Scoped typecheck exit 0.
- **Causal / Mutation Check:** Verified in private scratch that removing the stub reproduces the exact Phase 10 line 787 failure, and ignoring the explicit global path fails override preference.

---

## 2. Root Cause Analysis & Old Phase 10 Failure

### 2.1 Old Failure Evidence
- **Log Location:** `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.log`
- **Failure Line:** Lines 787–809:
  ```text
  FAIL @paperclipai/adapter-utils src/github-launcher-environment.test.ts > managed GitHub launcher environment > preserves local host credential helpers and validates worktree metadata
  AssertionError: expected '/var/folders/0w/.../T/paperclip-clean-env-rEvovT/git/config' to be undefined
  - Expected: undefined
  + Received: "/var/folders/0w/.../T/paperclip-clean-env-rEvovT/git/config"
   ❯ src/github-launcher-environment.test.ts:421:35
      419|     const env = await prepareGitHubExecutionEnvironment({ target: null…
      420|     expect(env.GH_TOKEN).toBe("legacy-token");
      421|     expect(env.GIT_CONFIG_GLOBAL).toBeUndefined();
  ```

### 2.2 Mechanism
- `scripts/validation-clean-env.mjs` sets `GIT_CONFIG_GLOBAL` to an owned synthetic git configuration (`path.join(own("git"), "config")`) to isolate tests from developer host git configs (`validation@paperclip.invalid`, `gpgsign = false`, `defaultBranch = main`).
- In `packages/adapter-utils/src/execution-target.ts`, `prepareGitHubExecutionEnvironment` captures host git configuration variables (`GIT_CONFIG_*`) when `hostCredentials: true` is requested on localhost.
- The unit test `preserves local host credential helpers and validates worktree metadata` simulates a local host environment by creating a temporary directory (`root`), stubbing `HOME = root` and `GH_TOKEN = legacy-token`, and asserting `expect(env.GIT_CONFIG_GLOBAL).toBeUndefined()`.
- The failure was a fixture precondition gap: the test assumed an ambient shell without `GIT_CONFIG_GLOBAL`, failing when invoked under the standard clean-env harness.

---

## 3. Detailed Diff & Invariant Verification

### 3.1 Exact File Changes (`fd7de49ed..599d7a6cd`)
```text
doc/plans/2026-11-05-git-env-fixture-verification.md                                  | 175 +++++++++++++++++++++
openspec/changes/portable-validation-and-enrollment-regression/design.md             |   1 +
openspec/changes/portable-validation-and-enrollment-regression/specs/isolated-validation/spec.md |   4 +
openspec/changes/portable-validation-and-enrollment-regression/tasks.md              |   6 +-
packages/adapter-utils/src/github-launcher-environment.test.ts                       |  34 ++++
5 files changed, 218 insertions(+), 2 deletions(-)
```

### 3.2 Fixture Invariants & Security Boundaries
1. **Precondition Scoping:**
   - In `it("preserves local host credential helpers and validates worktree metadata")`, line 417 adds:
     ```ts
     vi.stubEnv("GIT_CONFIG_GLOBAL", undefined);
     ```
   - Scoped strictly inside the test block; restored automatically in `afterEach` via `vi.unstubAllEnvs()`.
2. **Original Assertion Retention:**
   - `expect(env.GH_TOKEN).toBe("legacy-token")` — PRESERVED
   - `expect(env.GIT_CONFIG_GLOBAL).toBeUndefined()` — PRESERVED
   - `expect(env.PAPERCLIP_GIT_METADATA_ROOTS).toContain("/repo/.git")` — PRESERVED
   - `expect(config.stdout.trim()).toBe("store")` — PRESERVED
   - `isolated.GH_TOKEN`, `isolated.GIT_CONFIG_GLOBAL`, `isolated.PAPERCLIP_RUNNER_NETWORK_ACCESS` — PRESERVED
3. **New Test Case Analysis:**
   - Name: `preserves explicit host GIT_CONFIG_GLOBAL overrides with spaces over HOME gitconfig`
   - Setup: Owned fake `HOME` (`root`) with `helper = home-fixture`.
   - Override: Owned custom global config with spaces in directory and file name (`paperclip custom global config-.../custom gitconfig with spaces`) with `helper = override-fixture`.
   - Behavior:
     - `env.GH_TOKEN === "synthetic-override-token"`
     - `env.GIT_CONFIG_GLOBAL === overrideConfig` (full path with spaces preserved)
     - `git config credential.helper` returns `override-fixture` (not `home-fixture`), proving Git reads and prioritizes the override.
     - Negative control: Deleting `GIT_CONFIG_GLOBAL` falls back to `home-fixture`.
     - Isolated mode (`hostCredentials: false`): Strips `GH_TOKEN` and `GIT_CONFIG_GLOBAL`, disables network, unsets host home.
4. **Security & Sandbox Hygiene:**
   - No actual credential helper binaries are executed (only `git config credential.helper` config resolution).
   - No real user `$HOME`, `.gitconfig`, or Keychain accessed.
   - Clean temporary directories created in `roots` array and recursively removed in `afterEach`.
   - Preexisting 1 skip: Line 243 `it.runIf(process.platform === "linux")("keeps launcher restaging and command scratch inside the runner runtime")` is a Linux-only platform regression test. Properly skipped on macOS Darwin; not missing coverage.

---

## 4. Independent Reproduction & Test Verification

### 4.1 Bounded Repeat Executions (3/3 Consecutive Clean-Env Passes)
- **Environment:**
  - Node: v24.18.0 (`/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`)
  - Git: v2.56.0 (`/private/tmp/pi-dedup-git-toolchain/bin`)
  - Rust/Cargo: 1.97.1 (`/private/tmp/pi-dedup-rust-toolchain/cargo/bin`)
  - Corepack: `/private/tmp/pv-clean-tools/corepack` (LKG pnpm 9.15.4)
  - Flags: `CARGO_NET_OFFLINE=true`, `CI=1`
- **Command:**
  ```sh
  /Users/Hermes/.nvm/versions/node/v24.18.0/bin/node /private/tmp/pv-git-env-fixture-fix/scripts/validation-clean-env.mjs \
    --bin /private/tmp/pi-dedup-git-toolchain/bin \
    --bin /private/tmp/pi-dedup-rust-toolchain/cargo/bin \
    --bin /usr/bin \
    --bin /opt/homebrew/bin \
    --set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack \
    --set CARGO_HOME=/private/tmp/pi-dedup-rust-toolchain/cargo \
    --set RUSTUP_HOME=/private/tmp/pi-dedup-rust-toolchain/rustup \
    --set CARGO_NET_OFFLINE=true \
    --set CI=1 \
    -- /Users/Hermes/.nvm/versions/node/v24.18.0/bin/node /private/tmp/pv-git-env-fixture-fix/node_modules/vitest/vitest.mjs run --root packages/adapter-utils src/github-launcher-environment.test.ts
  ```
- **Results:**
  - **Run 1:** Exit code 0 | **35 passed, 1 skipped (36 total)** | Duration 14.54s
  - **Run 2:** Exit code 0 | **35 passed, 1 skipped (36 total)** | Duration 14.37s
  - **Run 3:** Exit code 0 | **35 passed, 1 skipped (36 total)** | Duration 14.28s

### 4.2 Related Tests & Scoped Typecheck
- **`src/paperclip-runner-permissions.test.ts`:** Exit code 0 | **50 passed (50)** | Duration 102ms
- **`src/execution-target.test.ts`:** Exit code 0 | **22 passed (22)** | Duration 1.53s
- **TypeScript Compilation Check:**
  - Command: `node /private/tmp/pv-git-env-fixture-fix/node_modules/typescript/lib/tsc.js --noEmit` in `packages/adapter-utils`
  - Exit code: 0 (Zero diagnostic errors).

---

## 5. Private Scratch Causal & Mutation Verification

Executed via `/private/tmp/pv-git-env-fixture-review/causal-mutation-check.mjs` under clean-env without touching repository source:

1. **SUT Loading Proof:** Verified `prepareGitHubExecutionEnvironment` loaded directly from `dist/execution-target.js`.
2. **Scenario 1 (Unmutated Fix):** When `GIT_CONFIG_GLOBAL` is stubbed to `undefined`, assertions pass and `helper = store` is read from `$HOME/.gitconfig`.
3. **Scenario 2 (Causal Mutation 1):** When the stub `GIT_CONFIG_GLOBAL=undefined` is omitted under clean-env:
   ```text
   AssertionError [ERR_ASSERTION]: expected env.GIT_CONFIG_GLOBAL to be undefined
   + actual - expected
   + '/var/folders/.../paperclip-clean-env-synthetic-.../git-config'
   - undefined
   ```
   Reproduces the exact failure from Phase 10 log line 787.
4. **Scenario 3 (Explicit Override with Spaces):** When `GIT_CONFIG_GLOBAL` points to a path with spaces, Git reads and returns `override-fixture`.
5. **Scenario 4 (Causal Mutation 2):** When the explicit global override is omitted, Git returns `home-fixture`, proving that `override-fixture` is strictly caused by the explicit global config path.
6. **Source Immutability:** SHA-256 of `packages/adapter-utils/src/github-launcher-environment.test.ts` verified before and after check:
   `d4e275c7357fbf0277281907a85bfbebc6e84a6a4f92a6f5bc4a117b0630550d` (unchanged).

---

## 6. Source Equivalence & Cohort Reuse Analysis

### 6.1 Target Equivalence Conditions
- **Repair Branch Baseline (`fix/portable-validation-baseline`):** Commit `fd7de49ed` / `599d7a6cd` lacks the 5 Pi summary dedup files present in Original `c38597469`:
  1. `packages/adapter-utils/src/continuation-summary-dedup.test.ts` (SHA256: `2a516bbf2461b5f3...`)
  2. `packages/adapter-utils/src/server-utils.ts` (SHA256: `417b4066d33ffe1b...`)
  3. `packages/adapters/opencode-local/src/server/execute.test.ts` (SHA256: `222ace23dcfe3edc...`)
  4. `packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts` (SHA256: `d55586be6d5a24a7...`)
  5. `packages/adapters/pi-local/src/server/execute.ts` (SHA256: `036a23cdb8c0ab34...`)
- **Load Test Source Immobility:** `server/src/__tests__/file-resources-git-scan-load.test.ts` retains identical SHA-256 `93234ee1cd3efd738cc11198cc48a3b027c3505f252cbf8fb490317004cab24c` across both `c38597469` and `599d7a6cd`.
- **Prospective Combined Merge:** Merging `599d7a6cd` into `c38597469` is a clean three-way merge with common ancestor `fd7de49edd4f83c5a5daa3e931ef58c7807d9131`. The test file `github-launcher-environment.test.ts` was untouched between `fd7de49ed` and `c38597469`, ensuring a clean patch application.
- **Reverse Dependency Proof:** `git grep` confirmed zero incoming dependencies across `server/`, `packages/`, `ui/`, and `cli/`. Modifying `github-launcher-environment.test.ts` cannot invalidate any prior test cohort.

### 6.2 Cohort-by-Cohort Reuse Impact Matrix

| Phase | Cohort Name | Executed Commit | Exit Code | Tests Passed / Skipped / Failed | Reuse Status & Justification |
|---|---|---|---|---|---|
| **Phase 01** | `general-chat-shard-0` | `cc56bbcd3` | 0 | 574 passed, 3102 skipped | **CONDITIONAL REUSE VALID** (Isolated chat shard; zero dependency on adapter-utils) |
| **Phase 02** | `general-chat-shard-1` | `cc56bbcd3` | 0 | 653 passed, 3023 skipped | **CONDITIONAL REUSE VALID** (Isolated chat shard; zero dependency on adapter-utils) |
| **Phase 03** | `general-chat-shard-2` | `cc56bbcd3` | 0 | 611 passed, 3065 skipped | **CONDITIONAL REUSE VALID** (Isolated chat shard; zero dependency on adapter-utils) |
| **Phase 04** | `general-server-shard-0` | `cc56bbcd3` | 0 | 7256 passed, 15 skipped | **CONDITIONAL REUSE VALID** (Server suites; zero dependency on adapter-utils test) |
| **Phase 05** | `general-server-shard-1` | `cc56bbcd3` | 0 | 6440 passed, 78 skipped | **CONDITIONAL REUSE VALID** (Server suites; zero dependency on adapter-utils test) |
| **Phase 06** | `general-server-shard-2` | `cc56bbcd3` | 0 | 6288 passed, 135 skipped | **CONDITIONAL REUSE VALID** (Server suites; zero dependency on adapter-utils test) |
| **Phase 07** | `general-server-shard-3` | `3f1eb1b7b` | 0 | 9946 passed, 49 skipped | **CONDITIONAL REUSE VALID** (Server suites containing load test `93234...`; identical source) |
| **Phase 08** | `general-server-native-runner`| `3f1eb1b7b` | 0 | 163 passed, 23 skipped | **CONDITIONAL REUSE VALID** (Native runner suites; zero dependency on adapter-utils test) |
| **Phase 09** | `general-workspaces-a` | `3f1eb1b7b` | 0 | 11113 passed, 0 skipped | **CONDITIONAL REUSE VALID** (UI & CLI packages; zero dependency on adapter-utils test) |
| **Phase 10** | `general-workspaces-b` | `3f1eb1b7b` | 1 | 3157 passed, 12 skipped, 1 failed | **MUST RE-RUN IN FULL ACROSS ALL 17 WORKSPACE PACKAGES** on the combined merge snapshot. Prior Attempt 1 failure log retained immutable. |
| **Phase 11** | `general-workspaces-c` | - | - | Not run | **NOT_RUN** |
| **Phase 12** | `serialized-shard-0` | - | - | Not run | **NOT_RUN** |
| **Phase 13** | `serialized-shard-1` | - | - | Not run | **NOT_RUN** |
| **Phase 14** | `serialized-shard-2` | - | - | Not run | **NOT_RUN** |
| **Phase 15** | `serialized-shard-3` | - | - | Not run | **NOT_RUN** |

---

## 7. Findings & Recommendations

### 7.1 CRITICAL Findings
- None. The fix is strictly test-scoped, preserves all invariants, retains all security controls, and introduces zero regressions.

### 7.2 WARNING Findings
1. **[WARNING-1] Baseline Divergence Requires Combined Post-Merge Verification:**  
   Repair branch `fix/portable-validation-baseline` does not contain the 5 Pi dedup feature files present on `fix/pi-single-prompt-summary-dedup`. A single-file or single-project pass on `pv-git-env-fixture-fix` cannot certify Phase 10 completion. Phase 10 must be executed in full across all 17 packages on the merged snapshot.
2. **[WARNING-2] Task 2.12 Completion Gate:**  
   In `openspec/changes/portable-validation-and-enrollment-regression/tasks.md`, task 2.12 must remain unchecked (`[ ]`) until the prospective merge commit is created and Phase 10 achieves exit code 0 across all 17 packages. Marking task 2.12 `[x]` prematurely would violate the parent verification contract.
3. **[WARNING-3] Immutability of Failed Phase 10 Evidence:**  
   The historical failure log `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.attempt1.log` and the corresponding failure record in `phase-manifest.json` must remain immutable as audit evidence. Re-running Phase 10 must append Attempt 2 without overwriting Attempt 1.

### 7.3 SUGGESTIONS
1. **[SUGGESTION-1] Merge Order & Commit Hygiene:**  
   Execute the merge using standard Git merge (`git merge 599d7a6cd`) into `fix/pi-single-prompt-summary-dedup` without squash or rebase, preserving the independent commit history and author attribution.
2. **[SUGGESTION-2] Phase 10 Full Suite Execution:**  
   Execute Phase 10 using `run-phases.mjs` (or `scripts/run-vitest-stable.mjs --mode general --group general-workspaces-b`) under clean-env, verifying that all 189 test files (including 87 packages-b files) complete with exit code 0 before initiating Phase 11.

---

## 8. Final Verdicts & Next Steps

| Decision Item | Verdict | Rationale & Conditions |
|---|---|---|
| **Task 2.12 Code Fix** | **GO** | Clean, bounded, test-only fix; perfectly isolates test precondition; all assertions and security boundaries preserved; verified 3/3 clean-env runs. |
| **Normal Merge (599 into c385)** | **GO** | Clean three-way merge on common base `fd7de49ed`; zero conflicts; zero changes to shared/product code. |
| **Conditional Reuse (Phases 01–09)** | **GO** | Reusable subject to post-merge hash proof; zero reverse dependencies; prior execution commits (`cc56` and `3f1eb1b7b`) accurately recorded. |
| **Resume Whole Phase 10 then 11–15** | **GO** | Mandatory to re-run full Phase 10 across all 17 projects on merged HEAD; proceed to 11–15 upon Phase 10 exit 0. |
| **Task 2.12 Complete Mark (`[x]`)** | **NO-GO / PENDING** | Pending full Phase 10 pass per parent task specification. |
| **Task 5.1 / 5.2 Final Acceptance** | **NO-GO / PENDING** | Blocked pending complete execution and passing exit codes for Phases 10–15. |
