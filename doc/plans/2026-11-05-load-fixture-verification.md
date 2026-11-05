# Load Fixture Verification Report (Task 2.11)

**Date:** 2026-11-05  
**Author:** agy Gemini 3.8 Flash High (Native Tools Only)  
**Target File:** `server/src/__tests__/file-resources-git-scan-load.test.ts`  
**Repair Branch:** `fix/portable-validation-baseline`  
**Repair Worktree:** `/private/tmp/pv-load-fixture-fix`  
**Evidence Directory:** `/private/tmp/pv-load-fixture-evidence`  

---

## 1. Context & Task Authorization

- **Task 2.10 Outcome:** In Task 2.10, isolated diagnosis of `server/src/__tests__/file-resources-git-scan-load.test.ts` confirmed that running the test alone in serial without any code modifications reproduced failures (`singleFlightJoins` 403, 412, and 399 vs. expected 498). The root cause was identified as macOS kernel `kern.ipc.somaxconn = 128` dropping or resetting client TCP handshakes (`ECONNRESET`) during an unbounded instantaneous 500-request burst from Supertest. Task 2.10 was diagnosis-only and correctly recorded a NO-GO for source-free execution.
- **Task 2.11 Authorization:** Task 2.11 authorizes **ONLY** a test-only TCP admission preparation change in **ONE** file: `server/src/__tests__/file-resources-git-scan-load.test.ts`. No production source, shared helpers, configuration, or official runner files are altered.
- **Explicit Rejections:**
  - **Rejected `maxSockets: 100`:** Placing an `http.Agent({ maxSockets: 100 })` limits concurrent in-flight sockets to 100 while `scanGate` is held, creating a client-side deadlock and preventing 500 simultaneous in-flight requests from reaching the system under test (SUT).
  - **Rejected `somaxconn` Alteration:** No system sysctl, kernel tuning, or global configuration modifications.
  - **Rejected Assertion/Timeout Loosening:** The 15-second admission deadline, 60-second test timeout, 500 requests, 498 joins, 2 underlying scans, and health p99 < 250ms must remain strictly preserved.

---

## 2. Test-Only TCP Startup Design & Invariant Mapping

### 2.1 Architecture of the Fix

In `file-resources-git-scan-load.test.ts`, the test-scoped helper `admitRequestsInBatches` introduces controlled TCP socket establishment:
1. **Bounded Batches:** Dispatches HTTP requests in batches of 25 (well below the kernel `somaxconn = 128` limit).
2. **Server Accept Synchronization:** Monitors real `server.on("connection")` events from the underlying Node.js HTTP/net server. The next batch is not dispatched until the server has accepted all connections from the current batch.
3. **Scan Gate Integrity:** Does **NOT** await HTTP responses or resolve `scanGate` during admission. All 500 requests enter the Express route and call `scheduler.run()`, remaining simultaneously in flight and pending until `releaseScans()` is explicitly invoked.
4. **Strict 15-Second Unified Admission Deadline:**
   - The admission deadline begins **BEFORE** the very first request is dispatched (`admissionStart = performance.now()`).
   - Every batch preparation, socket handshake wait, and event-loop tick is included in this accounting.
   - The remaining time for `vi.waitFor` to observe `singleFlightJoins === 498` is calculated as `Math.max(1, Math.floor(15_000 - elapsedAdmission))`. The deadline is never extended or restarted.
5. **Explicit 500-In-Flight Measurement:** Immediately after admission completes, the test explicitly asserts:
   - `expect(admissionResult.issuedCount).toBe(500)`
   - `expect(admissionResult.getCompletedCount()).toBe(0)`
   - All 500 requests are issued and 0 have completed when measuring single-flight joins and health latency.
6. **Async Admission Error & Leak Cleanup:**
   - Client request promises immediately register a rejection observer to prevent unhandled promise rejections in Node.js while preserving rejection outcomes in `Promise.allSettled`.
   - The `finally` block guarantees `releaseScans()`, `server.closeAllConnections?.()`, `await Promise.allSettled(pendingResponses)`, and `server.close()`, preventing hanging workers or leaked socket handles even if admission fails midway.

### 2.2 Original Invariant Verification Matrix

| Invariant | Original Specification | Task 2.11 Result | Status |
|---|---|---|---|
| Simultaneous Requests | 500 requests | 500 requests | **PRESERVED** |
| Cross-Actor Diversity | `actor-${index % 73}` (73 unique actors) | `actor-${index % 73}` (73 unique actors) | **PRESERVED** |
| Cross-Issue Distribution | `issue-${index}` (500 distinct issues) | `issue-${index}` (500 distinct issues) | **PRESERVED** |
| Repository Distribution | 2 local repos (`repository-a`, `b`) | 2 local repos (`repository-a`, `b`) | **PRESERVED** |
| Single Flight Joins | Exactly 498 joins | Exactly 498 joins (249 + 249) | **PRESERVED** |
| Underlying Scans | Exactly 2 runner calls (`runnerCalls: 2`) | Exactly 2 runner calls (`runnerCalls: 2`) | **PRESERVED** |
| Concurrency Peak | `peakActive: 2`, `peakQueued: 0`, `inFlight: 2` | `peakActive: 2`, `peakQueued: 0`, `inFlight: 2` | **PRESERVED** |
| HTTP Responses | Exactly 500 HTTP 200 responses | Exactly 500 HTTP 200 responses | **PRESERVED** |
| Health Responsiveness | 25 requests, p99 < 250ms | 25 requests, p99 = 3.06ms - 4.16ms | **PRESERVED** |
| Admission Deadline | Within 15,000ms | 130ms - 160ms (well within 15s) | **PRESERVED** |
| Test Timeout | 60,000ms | Completed in ~3.5s total | **PRESERVED** |
| Original 4 Test Cases | 1 load + 2 retryable (503/504) + 1 disconnect | All 4 original test cases preserved | **PRESERVED** |

---

## 3. Negative Controls & Cleanup Evidence

Two bounded negative control tests were added directly to `server/src/__tests__/file-resources-git-scan-load.test.ts` using inert local test fixtures to prove robust error and resource cleanup:

1. **Negative Deadline Control:**
   - *Test:* `enforces TCP admission deadline and cleans up resources on admission timeout`
   - *Mechanism:* Forces an expired/impossible admission deadline (`admissionDeadlineMs = 0`, `admissionStart = performance.now() - 100`).
   - *Verification:* The admission loop immediately throws `TCP admission deadline exceeded`. The `finally` block successfully releases the gate, closes all server connections, settles pending requests, and closes the server without unhandled rejections or leaked handles.
2. **Negative Early Client Error Control:**
   - *Test:* `immediately observes client rejections during admission and cleans up without unhandled rejections`
   - *Mechanism:* Injects an artificial error on request index 15 during batch preparation (`throw new Error("simulated early client admission error")`).
   - *Verification:* The admission loop immediately detects `firstRejection`, throws the error out of the admission loop, and the `finally` block successfully releases the gate and closes all sockets and the server cleanly.

---

## 4. Authoritative Verification Runs

All runs were executed using the clean-env recipe through `scripts/validation-clean-env.mjs` with:
- **Node.js:** v24.18.0 (`/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`)
- **Git:** v2.56.0 (`/private/tmp/pi-dedup-git-toolchain/bin`)
- **Rust/Cargo:** 1.97.1 (`/private/tmp/pi-dedup-rust-toolchain/cargo/bin`)
- **Corepack / pnpm:** 9.15.4 (`/private/tmp/pv-clean-tools/corepack`)
- **Flags:** `CARGO_NET_OFFLINE=true`, `CI=1`

### 4.1 Bounded Repeat Executions (3/3 Consecutive Passes)

Logs are saved in `/private/tmp/pv-load-fixture-evidence/`:

- **Run 1 (`run1.log`):**
  - Command: `pnpm exec vitest run src/__tests__/file-resources-git-scan-load.test.ts`
  - Exit Code: **0**
  - Tests: **6 passed (6)** (4 original + 2 negative controls)
  - Duration: 3.65s
  - Metrics: 500 requests, 2 repos, 2 underlying scans, peakActive 2, peakQueued 0, outcomes { 200: 500 }, healthP99Ms: 3.42ms, joins: 498.
- **Run 2 (`run2.log`):**
  - Exit Code: **0**
  - Tests: **6 passed (6)**
  - Duration: 3.58s
  - Metrics: 500 requests, 2 repos, 2 underlying scans, peakActive 2, peakQueued 0, outcomes { 200: 500 }, healthP99Ms: 3.18ms, joins: 498.
- **Run 3 (`run3.log`):**
  - Exit Code: **0**
  - Tests: **6 passed (6)**
  - Duration: 3.23s
  - Metrics: 500 requests, 2 repos, 2 underlying scans, peakActive 2, peakQueued 0, outcomes { 200: 500 }, healthP99Ms: 4.16ms, joins: 498.

### 4.2 Scoped TypeScript Typecheck

- Command: `pnpm exec tsc --noEmit` in `server/`
- Exit Code: **0** (Zero errors, strict compilation passed).

---

## 5. Reuse Impact & Source-Equivalence Proof

### 5.1 Codebase & Dependency Equivalence against `cc56bbcd3` and Intended Target

- **Baseline Discrepancy Clarification:** Baseline commit `7e8c2854a` was branched from `b57ac3112` and itself does **NOT** contain the 5 Pi feature files present in `cc56bbcd3` and `3c34f94bf`:
  1. `packages/adapter-utils/src/continuation-summary-dedup.test.ts`
  2. `packages/adapter-utils/src/server-utils.ts`
  3. `packages/adapters/opencode-local/src/server/execute.test.ts`
  4. `packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts`
  5. `packages/adapters/pi-local/src/server/execute.ts`
- **Intended Combined Target & Conditions:** The intended combined target is ORIGINAL `3c34f94bf` (which preserves all 5 Pi feature files identical to `cc56bbcd3`) merged with the test-only patch from `7e8c2854a`.
- **Target Equivalence Conditions:**
  - Upon merging into `3c34f94bf`, production code in `server/src/routes/`, `server/src/services/`, `server/src/middleware/`, `packages/`, `cli/`, and `ui/` must remain 100% byte-identical to `cc56bbcd3`.
  - All 5 Pi feature files must match their SHA256 hashes in `cc56bbcd3`.
  - Configuration & Dependencies (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `vitest.config.ts`) remain 100% byte-identical to `cc56bbcd3`.
  - The ONLY executable test file with modifications is `server/src/__tests__/file-resources-git-scan-load.test.ts` (SHA256: `93234ee1cd3efd738cc11198cc48a3b027c3505f252cbf8fb490317004cab24c`).
  - Reverse dependency scan confirms **ZERO** files in the repository import or read `file-resources-git-scan-load.test.ts`.

### 5.2 Cohort-by-Cohort Reuse Impact Matrix

| Phase | Group Name | Selected Suites | Tested Commit | Byte-Identical to Target? | Status & Reuse Justification |
|---|---|---|---|---|---|
| Phase 01 | `general-chat-shard-0` | Chat shard 0, 1 | `cc56bbcd3` | Yes | Independent chat group; zero dependency on server file resources. |
| Phase 02 | `general-chat-shard-1` | Chat shard 2, 3 | `cc56bbcd3` | Yes | Independent chat group; zero dependency on server file resources. |
| Phase 03 | `general-chat-shard-2` | Chat shard 4, 5 | `cc56bbcd3` | Yes | Independent chat group; zero dependency on server file resources. |
| Phase 04 | `general-server-shard-0` | 356 server test suites | `cc56bbcd3` | Yes | Does not contain `file-resources-git-scan-load.test.ts`; SUT and helpers unchanged. |
| Phase 05 | `general-server-shard-1` | 356 server test suites | `cc56bbcd3` | Yes | Does not contain `file-resources-git-scan-load.test.ts`; SUT and helpers unchanged. |
| Phase 06 | `general-server-shard-2` | 356 server test suites | `cc56bbcd3` | Yes | Does not contain `file-resources-git-scan-load.test.ts`; SUT and helpers unchanged. |
| Phase 07 | `general-server-shard-3` | 356 server test suites | `cc56bbcd3` | **NO (Contains Target)** | **MUST BE RE-RUN IN FULL** on new snapshot after independent review. Expected if stable: 9,946 passed + 49 skipped = 9,995 total tests (prior attempt 1 had 9,943 pass, 1 fail, 49 skip; fix + 2 negative controls = 9,946). |
| Phase 08 | `general-server-native-runner` | 9 native runner suites | Unrun | N/A | Still unrun. Exactly 9 test files in native runner group. |
| Phase 09 | `general-workspaces-a` | 2 projects (`@paperclipai/ui`, `paperclipai`) | Unrun | N/A | Still unrun. Part of 20 non-server project inventory. |
| Phase 10 | `general-workspaces-b` | 17 workspace packages | Unrun | N/A | Still unrun. Part of 20 non-server project inventory. |
| Phase 11 | `general-workspaces-c` | 1 project (`@paperclipai/db`) | Unrun | N/A | Still unrun. Part of 20 non-server project inventory (2 + 17 + 1 = 20 total). |
| Phase 12-15 | `serialized` shards 0-3 | Serialized suites | Unrun | N/A | Still unrun. |

---

## 6. Pending Review & Next Actions

- **Task Status:**
  - Tasks 2.10 and 2.11 remain pending independent review (`[ ]`).
  - Tasks 4.2, 4.3, 4.4, 5.1, and 5.2 remain pending review (`[ ]`).
- **No Premature Integration:** The implementer has not executed Phase 07-15 or merged back to the summary branch.
- **Commit:** Changes committed normally on `fix/portable-validation-baseline` in the `/private/tmp/pv-load-fixture-fix` worktree, with no push.
