# Independent Code Review: Git Scan Load Fixture & Baseline Acceptance (Tasks 2.10 & 2.11)

**Review Date:** 2026-11-05  
**Reviewer:** Independent agy Gemini 3.8 Flash High (Native Tools Only, Independent Session)  
**Target Commit:** `7e8c2854a66bc838e7273e863725263b3714eec8` on `fix/portable-validation-baseline` in `/private/tmp/pv-load-fixture-fix` (base `b57ac3112`)  
**Parent Worktree:** `/Volumes/AI/projects/paprerclip-v2` (HEAD `3c34f94bf`)  
**Frozen Baseline Snapshot:** `cc56bbcd3` at `/private/tmp/paperclip-portable-validation`  
**Review Scratch Directory:** `/private/tmp/pv-load-fixture-review`  

---

## 1. Executive Summary & Verification Scorecard

An independent code review and verification audit was performed on commit `7e8c2854a66bc838e7273e863725263b3714eec8` (`fix/portable-validation-baseline`), evaluating the bounded diagnosis of Task 2.10 and the test-only admission preparation fix of Task 2.11.

### 1.1 Verification Scorecard (Skill: openspec-verify-change)

| Dimension | Status | Summary |
|---|---|---|
| **Completeness** | **PASSED** | 100% of Task 2.10 & 2.11 requirements implemented. 6 test cases executed (4 original + 2 negative controls). Zero incomplete requirements for 2.10/2.11. |
| **Correctness** | **PASSED** | All 500 HTTP requests admitted in 25-socket TCP batches; 500 issued and 0 completed before health measurement; exactly 498 joins across 2 scans; 500 HTTP 200 responses; health p99 < 250ms (measured 3.02ms - 3.45ms); strict 15s deadline preserved from before the first request. Real cleanup verified on early reject and timeout. |
| **Coherence** | **PASSED with Critical Producer Corrections** | Strictly test-only change to `server/src/__tests__/file-resources-git-scan-load.test.ts`. Zero production, shared, runner, or configuration changes. Producer report claims regarding `packages/` diff vs `cc56bbcd3` were caught and corrected (producer omitted the 5 Pi feature files on the target branch). |

---

## 2. Scope & Source-Equivalence Audit

### 2.1 Exact Diff Scope (`b57ac3112..7e8c2854a`)

The commit `7e8c2854a` was verified via `git diff --stat b57ac3112..7e8c2854a`:
- `doc/plans/2026-11-05-load-fixture-verification.md` (+148 lines)
- `openspec/changes/portable-validation-and-enrollment-regression/design.md` (+5 lines)
- `openspec/changes/portable-validation-and-enrollment-regression/specs/isolated-validation/spec.md` (+14, -1 lines)
- `openspec/changes/portable-validation-and-enrollment-regression/tasks.md` (+8, -1 lines)
- `server/src/__tests__/file-resources-git-scan-load.test.ts` (+220, -11 lines)

**Executable Code Changes:** Exactly **ONE** file was modified (`server/src/__tests__/file-resources-git-scan-load.test.ts`).  
**Production Source Changes:** Exactly **ZERO** changes to `server/src/routes/`, `server/src/services/`, `server/src/middleware/`, `packages/`, `cli/`, or `ui/`.  
**Configuration & Dependencies:** Exactly **ZERO** changes to `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `vitest.config.ts`.

### 2.2 Tool & Artifact Hash Audit

| Component | Path | SHA256 Hash |
|---|---|---|
| Node.js Binary | `/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node` | `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a` |
| Git Binary | `/private/tmp/pi-dedup-git-toolchain/bin/git` | `916479af8cb874da55aab980077362ee233407e5112f6df5ee3514d7611ab559` |
| Corepack Config | `/private/tmp/pv-clean-tools/corepack/lastKnownGood.json` | `957e0bb742647e92bbaf8238bce96848e011b452ee7c09f2a876b93a013d0ae8` |
| Test SUT (Modified) | `/private/tmp/pv-load-fixture-fix/server/src/__tests__/file-resources-git-scan-load.test.ts` | `93234ee1cd3efd738cc11198cc48a3b027c3505f252cbf8fb490317004cab24c` |
| Test SUT (Baseline) | `/private/tmp/paperclip-portable-validation/server/src/__tests__/file-resources-git-scan-load.test.ts` | `7ff4c1552600a8ab9fd039d3525a5b70056e4ea04f979c7ebc9c69d1cbc37159` |
| Test SUT (Original) | `/Volumes/AI/projects/paprerclip-v2/server/src/__tests__/file-resources-git-scan-load.test.ts` | `7ff4c1552600a8ab9fd039d3525a5b70056e4ea04f979c7ebc9c69d1cbc37159` |

Reverse dependency grep confirms **ZERO** files in the repository import or depend on `server/src/__tests__/file-resources-git-scan-load.test.ts`.

---

## 3. Independent Audit of TCP Admission & Invariant Preservation

### 3.1 Controlled TCP Batching without Gate Release

The helper `admitRequestsInBatches` addresses the kernel `somaxconn = 128` SYN-drop barrier:
1. **Batch Pacing:** Dispatches HTTP requests in batches of 25.
2. **Acceptance Synchronization:** Synchronizes solely on `server.on("connection")` from Node's underlying `net.Server`. It does **NOT** await HTTP response headers or response bodies, and does **NOT** resolve `scanGate`.
3. **No Artificial Concurrency Reduction:** Does **NOT** set `http.Agent({ maxSockets: 100 })` or limit client concurrency. All 500 sockets are concurrently established and active.
4. **Verified Simultaneous In-Flight Load:**
   - Immediately after admission: `issuedCount === 500` and `getCompletedCount() === 0`.
   - Scheduler snapshot during admission: `activeCount: 2, queuedCount: 0, inFlightCount: 2`.
   - Single-flight joins observed: `expect(scheduler.snapshot().totals.singleFlightJoins).toBe(498)` (2 runner executions + 498 joins = 500 requests).
   - Health latency: 25 requests to `/api/health`, all HTTP 200, p99 measured between 3.02ms and 3.45ms (limit: < 250ms). `getCompletedCount()` remains strictly 0 throughout health testing.
   - Upon `releaseScans()`: all 500 requests complete with HTTP 200 (`{ 200: 500 }`), `getCompletedCount() === 500`, `runnerCalls === 2`, and `peakActive === 2`.

### 3.2 Unified 15-Second Admission Deadline

- The admission deadline begins **BEFORE** the very first request is dispatched (`admissionStart = performance.now()`).
- All batch preparations, socket establishment waits, and event-loop cycles are charged against the 15,000ms deadline.
- The remaining wait time for `vi.waitFor` is dynamically calculated as `Math.max(1, Math.floor(admissionDeadlineMs - elapsedAdmission))`.
- The deadline cannot reset or extend. Overall test timeout remains 60,000ms.
- Actual measured admission time was ~130ms - 160ms, well within the 15s budget.

### 3.3 Rejection Observation and Waiting Loop Hygiene

- Polling in `admitRequestsInBatches` uses an unblocked 2ms timer (`await new Promise(r => setTimeout(r, 2))`), checking for deadline expiry and early rejections on every tick.
- `reqPromise.catch(() => {})` attaches a catch handler to each promise synchronously upon creation, preventing Node.js `unhandledRejection` warnings/crashes.
- If any request rejects, `firstRejection` is captured and immediately re-thrown in the admission loop (`if (firstRejection) throw firstRejection`), preventing hanging or delayed timeouts.
- All rejection reasons are preserved in `pendingResponses` and verified via `Promise.allSettled`.

---

## 4. Audit of Resource Cleanup & Negative Controls

### 4.1 Production and Helper Cleanup Guarantee

The audit confirmed that resource cleanup in `file-resources-git-scan-load.test.ts` is genuine and comprehensive:
- `releaseScans()` / `releaseGate()` is guaranteed in `finally`, unblocking any runner or express handler awaiting the gate.
- `server.closeAllConnections?.()` terminates active client sockets immediately.
- `await Promise.allSettled(pendingResponses)` drains all pending client promises.
- `server.close()` unbinds the ephemeral listener.
- `server.removeListener("connection", onConnection)` ensures zero listener leaks on the HTTP server.

### 4.2 Negative Controls in Test Suite

1. **Negative Deadline Timeout Test:**
   - Case: `enforces TCP admission deadline and cleans up resources on admission timeout`
   - Setting: `admissionDeadlineMs = 0`, `admissionStart = performance.now() - 100`.
   - Behavior: Bounded batch 0 (5 requests) starts, deadline is immediately exceeded, throws `TCP admission deadline exceeded`. The `finally` block releases the gate, closes all sockets, settles pending requests, and closes the server cleanly.
2. **Negative Early Client Error Test:**
   - Case: `immediately observes client rejections during admission and cleans up without unhandled rejections`
   - Setting: `createRequest` injects an error on index 15.
   - Behavior: Batch 0 (10 requests) succeeds; batch 1 (indices 10-19) dispatches; index 15 rejects. The loop observes `firstRejection` immediately, halts admission, and caller cleans up without unhandled rejection.

### 4.3 Scratch Mutation Proofs (`/private/tmp/pv-load-fixture-review/mutation-admission.mjs`)

Two independent mutation proofs were constructed and executed in the reviewer scratch directory:
1. **Mutation 1 (Synchronous Callback Throw):** Tested synchronous exception thrown by `createRequest(15)`. Confirmed that the synchronous error immediately bubbles out of `admitRequestsInBatches`, removes the `connection` listener in `finally`, and allows caller resource cleanup.
2. **Mutation 2 (Fail-Stop Bounded Dispatch):** Tested early rejection at index 5 of batch 1 during a 500-request run. Confirmed that exactly 25 requests were created and issued; the remaining 475 requests were NEVER created or dispatched, proving prompt fail-stop behavior.

### 4.4 Original Test Cases Verification

Diff inspection of lines 397–465 confirmed that the original 3 test cases:
1. `it.each([[WORKSPACE_GIT_SCAN_ERROR_CODES.saturated, 503], ...])` (saturated -> 503)
2. `it.each([..., [WORKSPACE_GIT_SCAN_ERROR_CODES.timeout, 504]])` (timeout -> 504)
3. `it("cancels the underlying scan and releases its slot when the HTTP client disconnects", ...)`  
are **100% byte-identical** to the baseline and remain completely untouched.

---

## 5. Authoritative Independent Test Executions

Executed under clean-env (`scripts/validation-clean-env.mjs`) with:
- **Node.js:** v24.18.0
- **Git:** v2.56.0 (`/private/tmp/pi-dedup-git-toolchain/bin`)
- **Rust/Cargo:** 1.97.1 (`/private/tmp/pi-dedup-rust-toolchain/cargo/bin`)
- **Corepack / pnpm:** 9.15.4 (`/private/tmp/pv-clean-tools/corepack`)
- **Environment Flags:** `CARGO_NET_OFFLINE=true`, `CI=1`, isolated scratch temporary `HOME`.

### 5.1 Three Consecutive Focused Repeats (3/3 Passed)

All 3 runs passed with exit code 0:
- **Run 1:** 6 passed (6), 3.17s, requests: 500, underlyingScans: 2, peakActive: 2, joins: 498, outcomes: { 200: 500 }, healthP99Ms: 3.09ms.
- **Run 2:** 6 passed (6), 3.19s, requests: 500, underlyingScans: 2, peakActive: 2, joins: 498, outcomes: { 200: 500 }, healthP99Ms: 3.45ms.
- **Run 3:** 6 passed (6), 3.28s, requests: 500, underlyingScans: 2, peakActive: 2, joins: 498, outcomes: { 200: 500 }, healthP99Ms: 3.02ms.

Logs are preserved in `/private/tmp/pv-load-fixture-review/run[1-3].log`.

### 5.2 Scoped TypeScript Typecheck

- Command: `pnpm exec tsc --noEmit` in `server/`
- Exit Code: **0** (Zero errors, strict compilation passed).

---

## 6. Critical Producer Report Audit & Required Corrections

The producer's report (`doc/plans/2026-11-05-load-fixture-verification.md`) was critically audited. Several substantive mistakes and inaccuracies were identified:

### 6.1 Mistake 1: False Claim that `packages/` is Byte-Identical to `cc56bbcd3`
- **Producer Claim:** Section 5.1 states `git diff cc56bbcd3 -- ... packages/ is EMPTY (100% byte-identical)`.
- **Finding:** This claim is **FALSE**. The repair branch `fix/portable-validation-baseline` was branched from `b57ac3112`. It does NOT contain the 5 Pi feature files present in `cc56bbcd3` and `3c34f94bf`:
  1. `packages/adapter-utils/src/continuation-summary-dedup.test.ts`
  2. `packages/adapter-utils/src/server-utils.ts`
  3. `packages/adapters/opencode-local/src/server/execute.test.ts`
  4. `packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts`
  5. `packages/adapters/pi-local/src/server/execute.ts`
- **Correction:** The prospective merge target is ORIGINAL `3c34f94bf` + ONLY the test patch `7e8c2854a`. All 5 Pi feature files must be preserved. Production code in `3c34f94bf` is identical to `cc56bbcd3`.

### 6.2 Mistake 2: Native Runner Group Suite Count
- **Producer Claim:** Section 5.2 lists Phase 08 `general-server-native-runner` as having "13 runner suites".
- **Finding:** Incorrect. Inspection of `scripts/run-vitest-stable.mjs` (`nativeRunnerSuites`) confirms there are exactly **9** test suites in this group.

### 6.3 Mistake 3: Phase 07 Expected Pass Count
- **Producer Claim:** Mentions expected 9945 passed.
- **Finding:** Incorrect. Prior Phase 07 (Attempt 1) had 9943 passed + 1 failed + 49 skipped = 9993 total tests. Fixing the 1 failure and adding 2 new negative controls yields:
  `9943 + 1 + 2 = 9946 passed` (and 49 skipped = 9995 total tests). The expected pass count is **9946**, not 9945.

### 6.4 Mistake 4: Workspaces Project Inventory
- **Producer Claim:** Listed workspaces loosely as "UI + CLI suites" and "17 workspace suites".
- **Finding & Inventory:** The exact inventory in `scripts/run-vitest-stable.mjs` comprises 20 non-server projects:
  - `general-workspaces-a`: **2 projects** (`@paperclipai/ui`, `paperclipai`)
  - `general-workspaces-b`: **17 projects** (all other packages)
  - `general-workspaces-c`: **1 project** (`@paperclipai/db`)
  - Total: 2 + 17 + 1 = **20 projects**.

---

## 7. Conditional Reuse Policy for Phases 01–06

Evidence from Phases 01–06 (executed on commit `cc56bbcd3`) may be conditionally reused **ONLY** under strict source-equivalence rules:
1. **Immutable Commit Recording:** Audit logs and verification documents must record that Phases 01–06 were executed on commit `cc56bbcd3`. They must **NEVER** be relabeled as having run on the new merged commit.
2. **Byte-Level Equivalence Manifest:** Prior to declaring reuse valid, an automated check must verify that all SUT source files, shared libraries, configuration files, lockfiles, toolchain binaries, and the specific test suites for Phases 01–06 are 100% byte-identical between `cc56bbcd3` and the new post-merge snapshot.
3. **Invalidation Rule:** If ANY byte differs in the dependencies or test files of Phases 01–06, or if any reverse dependency scan detects unexpected reads, the affected group must be invalidated and re-run.

---

## 8. Decisions & Next Action GO / NO-GO

| Item | Decision | Rationale |
|---|---|---|
| **Task 2.10 Diagnosis** | **GO** | Correctly identified macOS `somaxconn = 128` dropping TCP handshakes during instantaneous 500-request bursts; confirmed failure on 3 serial runs; properly rejected `maxSockets: 100` and kernel sysctl modifications. |
| **Task 2.11 Fix & Negative Controls** | **GO** | Test-only admission pacing strictly bounds TCP connections in batches of 25 without awaiting responses or early gate release; preserves all 500 simultaneous requests, 498 joins, 2 scans, and p99 < 250ms under 15s deadline; passes 3 consecutive independent clean-env runs; 2 negative controls and mutation proofs confirm robust error cleanup. |
| **Merge to Original (`paprerclip-v2`)** | **GO** | Prospective merge of `7e8c2854a` into `fix/pi-single-prompt-summary-dedup` (`3c34f94bf`) introduces ONLY test and documentation changes. Preserves all 5 Pi feature files in `packages/`. |
| **Conditional Reuse of Phases 01–06** | **CONDITIONAL GO** | Permitted strictly upon post-merge byte-level verification against `cc56bbcd3`. Tested commit `cc56bbcd3` must remain recorded as such. |
| **Re-running Phase 07** | **GO (MANDATORY)** | Phase 07 (shard 3 of `general-server-without-chat-or-native-runner`, all 356 test files) contains the modified test file and **MUST BE RE-RUN IN FULL** on the new merged snapshot. |
| **Running Phases 08–15** | **GO (MANDATORY)** | Phases 08 through 15 were never run due to Phase 07 fail-stop and **MUST BE RUN IN FULL** on the new merged snapshot. |
| **Final Acceptance Certification (5.1 / 5.2)** | **NO-GO (PENDING)** | Full acceptance cannot be certified until Phase 07 and Phases 08–15 are fully executed and pass on the new merged snapshot. |

### Caveats & Residual Security Boundaries
- **Residual Old Security Exposure:** UNKNOWN.
- **Environment Hygiene:** The validation environment provides tool isolation and clean environment variables; it is not an OS-level sandbox or network barrier. Loopback HTTP traffic is explicitly permitted for test execution.
