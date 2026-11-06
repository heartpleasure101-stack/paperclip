# Phase 10 控制器硬化 R2 修復、假控制驗證與工作區相依補全報告

**文件路徑：** `doc/plans/2026-11-06-phase10-hardening-r2-verification.md`  
**報告日期：** 2026-11-06  
**執行角色：** 有界維運 R2 修復員（Bounded Ops R2 Fixer, agy Gemini 3.8 Flash High）  
**模式約束：** 原生工具唯讀與自含控制修復、零 MCP / Hindsight / Pi / Sonnet / 外部代理；不修改正式 runner / shared clean-env / app / test / config；僅修改 private ops `run-phases.mjs`、專屬 scratch `/private/tmp/pv-phase10-hardening-r2`、專屬驗證報告；依授權物化被忽略的 `sdk/dist` 快取；嚴禁觸發真實 Phase 10 或 11–15 執行；嚴禁 commits / push / archive / deploy / permissions 變更。

---

## 一、 維運驗證總結與門禁判定（Separate GO / NO-GO Decisions）

| 審查維度 | 判定 | 關鍵事實依據 |
| :--- | :---: | :--- |
| **控制器硬化修復 (Controller Safeguards R2)** | **PASSED (FIXED)** | 已實作原子排他持久化 Claim 機制（`O_CREAT \| O_EXCL`）；經 20 個行程並行競爭實測，**嚴格保證僅單一勝出者（1 Winner, 19 Denied）**；CLI 目標 Phase 存在性檢查已移至 Claim 前（未知 Phase 拋錯且不消耗 Token）；CLI no-op 守護已啟動；授權範圍與呼叫目標嚴格對齊；日誌衝突 0 子行程且歷史 bytes 雜湊 100% 不變。 |
| **工作區快取依賴補全 (Workspace Dependency Prep)** | **PASSED (CLEAN)** | 已完成 `3f1` 至 `56d` 之 `packages/plugins/sdk/dist` APFS clone；全部 97 個檔案（76 個目錄頂層 entries）雜湊 100% 吻合；雙模 ESM/CJS 工作區預檢腳本執行結果：**全 17 個專案與 11 項關鍵 subpath 全部驗證通過，退出碼 0**；Git 追蹤源碼 100% 保持乾淨（`git status --porcelain` 為空）。 |
| **R1 審查誤診深度糾正 (Correction of R1 Misdiagnoses)** | **DOCUMENTED** | 1) 糾正 R1 預檢腳本失敗根因：原預檢腳本使用 `createRequire().resolve`，對僅定義 `"import"` 條件之純 ESM 套件（`@paperclipai/plugin-sdk`）本質上必然拋出 `ERR_PACKAGE_PATH_NOT_EXPORTED`，R1 誤診為「純粹因缺 dist」；2) 糾正 Vitest 啟動 `EPERM`：確係 macOS Seatbelt 標準沙盒攔截 `.vite-temp`，非作業系統唯讀掛載，不可透過 TMPDIR 規避 Vite 硬編碼路徑。 |
| **Hermes 套件正式全量驗證 (Hermes Package Run)** | **PASSED (ALL GREEN)** | 在既有 Python 3.15.2 fixture 與乾淨環境下，透過合法授權之 `run_command BypassSandbox:true` 執行 Hermes 全套件測試一次：**10 個測試檔案全數通過，174 項測試全數通過（10/10 files, 174/174 tests, 0 failures, 0 skips）**，耗時 11.1 秒，退出碼 0。 |
| **Phase 10 全量重跑門禁** | **STRICT NO-GO (PENDING)** | Tasks 2.12、2.13、4.2–5.2 嚴格維持 PENDING 未勾選；本報告交付修復成果與相容性 JSON Schema，等待全新獨立審查員審查，禁止自動啟動全量 Phase 10。 |

---

## 二、 檔案雜湊值與不可變基準比對矩陣

### 1. 控制器與 Manifest 比對

| 項目 | 檔案實體路徑 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :--- | :---: |
| **改造前控制器 (R1)** | `/private/tmp/pv-phase10-hardening-r2/run-phases.mjs.pre-r2.bak` | `bec37319ccfdb2e8558c90a54996f37038134981aed41fa5acb57958650025a8` | exclusive `wx` 備份 |
| **全新硬化控制器 (R2)** | `/private/tmp/pv-full/run-phases.mjs` | `5c97e7a901edfb1e79d53541758396561074bf033316f810e341176daf1ada14` | R2 已修復並驗證 |
| **現行 live Manifest** | `/private/tmp/pv-full/manifests/phase-manifest.json` | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` | 保持 2 筆，未改寫 |
| **現行 mirror Manifest**| `/private/tmp/pv-full/phase-manifest.json` | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` | 保持 2 筆，未改寫 |
| **第二輪 Attempt 2 日誌** | `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.attempt2.log` | `362cae7efbc80b222417fa8b744a16888bf6d981dd3375a833fb0aa9e0a8a4c4` | 152,544 bytes 鎖定 |
| **115KB 遺失日誌** | (Attempt 2 Run 1) | `UNKNOWN / IRRECOVERABLE` | 誠實保留歷史斷層 |

### 2. 工具鏈二進位矩陣比對

- **Node.js (v24.18.0):** `/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`  
  `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a`
- **Git (v2.56.0):** `/private/tmp/pi-dedup-git-toolchain/bin/git`  
  `916479af8cb874da55aab980077362ee233407e5112f6df5ee3514d7611ab559`
- **Cargo (v1.97.1):** `/private/tmp/pi-dedup-rust-toolchain/cargo/bin/cargo`  
  `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f`
- **Rustup:** `/private/tmp/pi-dedup-rust-toolchain/cargo/bin/rustup`  
  `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f`
- **Corepack LKG:** `/private/tmp/pv-clean-tools/corepack/lastKnownGood.json`  
  `957e0bb742647e92bbaf8238bce96848e011b452ee7c09f2a876b93a013d0ae8`
- **Python 3.15.2:** `/opt/homebrew/Cellar/python@3.15/3.15.2/Frameworks/Python.framework/Versions/3.15/bin/python3.15`  
  `d775520d87f89a19cffe0db3fba17f3caf71d91066e23e5efd7b5bd9dbb975e2`

---

## 三、 控制器 R1 重大缺陷修復詳情與架構機制

### 1. 缺陷 1 修復：原子排他持久化 Claim 機制（防禦 TOCTOU Race Condition）

- **問題根因：** R1 控制器採用非原子讀寫，平行競爭行程同時讀取 `consumed: false` 導致雙贏。
- **R2 修復機制：**
  - 在驗證所有輸入合格後、子行程啟動前，呼叫 `claimAuthorization`。
  - 計算持久化 Claim 檔案路徑：`.claim-${auth.authorizationId}.json`。
  - 使用核心層級原子旗標 `O_CREAT | O_EXCL` (`wx`)：`claimFd = fs.openSync(claimFile, "wx")`。
  - 作業系統確保在多個行程競奪同一檔案時，有且僅有一個行程能成功建立檔案；其餘 19 個行程必然遭遇 `EEXIST`。
  - 成功建立者將 Claim 資訊（PID、時間、目標 Phase、主機名稱）同步寫入磁碟並呼叫 `fsyncSync`。
  - **持久化防回滾：** Claim 檔案永久保存在磁碟，嚴禁在 cleanup 中刪除。即便有人將授權檔備份還原為 `consumed: false`，後續嘗試仍會命中所存在的 Claim 檔案而立即 Fail-Closed 拒絕重播。

### 2. 缺陷 2 修復：嚴格範圍綁定與全量相符驗證（Scope Match Enforcement）

- **問題根因：** 當呼叫者未指定 CLI 參數時（欲跑全部 Phase），R1 跳過範圍檢查，導致 Phase 10 專用 Token 被盜用於全量執行。
- **R2 修復機制：**
  - 當呼叫者未提供 `targetPhaseId`（要求全量）時，檢查 `auth.targetPhaseId` 必須明確等於 `"all"`，若 Token 限制於特定 Phase 則拋出異常拒絕。
  - 當呼叫者指定 `targetPhaseId` 時，`auth.targetPhaseId` 必須精確相符（或符合 `auth.targetPhaseIds` 清單）。
  - Token 與呼叫者請求目標達成 1:1 嚴格對齊。

### 3. 缺陷 3 修復：CLI 輸入驗證前置與 Guard No-Ops（Pre-Claim Validation & Anti-No-Op Guard）

- **問題根因：** R1 先消耗 Token，才遍歷 Manifest；遇虛構 Phase 或已通過 Phase 時，Token 被白白燒毀，甚至 Exit 0 偽稱成功。
- **R2 修復機制：**
  - **前置校驗：** 在呼叫 `claimAuthorization` 前，先比對 `manifest.phases`。若 CLI 傳入之 `targetPhaseId` 不存在於 Manifest 中，立即拋錯退出，0 Token 消耗，0 子行程啟動，0 Artifact 產生。
  - **Guard No-Ops：** 計算候選 Phase 中狀態非 `PASSED` 者。若候選名單已全數為 `PASSED`（無任何 Runnable Phase），控制器拋出 `FAIL-CLOSED: Guard: All requested phase(s) are already PASSED. CLI no-ops cannot exit 0 success.`，以非零碼退出且不消耗 Token。

---

## 四、 控制器沙盒控制驗證（11 項完整套件實測）

測試腳本位置：`/private/tmp/pv-phase10-hardening-r2/sandbox-controls/run-controls.mjs`。  
測試方式：直接調用權威控制器 `/private/tmp/pv-full/run-phases.mjs` 導出函式與 CLI 行程，僅使用假子行程，零正式源碼更動。

```text
================================================================================
R2 HARDENED CONTROLLER SANDBOX CONTROLS: 11 COMPREHENSIVE SUITES
Controller: /private/tmp/pv-full/run-phases.mjs
Scratch:    /private/tmp/pv-phase10-hardening-r2/sandbox-controls
================================================================================

--- Suite 1: Parallel 20 Contenders Authorization Race ---
  Workers launched: 20
  Winners:          1
  Denied:           19
  [PASS] Suite 1: Exactly 1 winner across 20 parallel contenders

--- Suite 2: Existing Log Collision Protection ---
FATAL: Cannot exclusively create log file .../phase-coll.attempt4.log: EEXIST: file already exists
  [PASS] Suite 2: EEXIST thrown, 0 child spawned, historical bytes preserved

--- Suite 3: Unknown / Bogus Phase via CLI ---
  Exit code for unknown phase: 1
  [PASS] Suite 3: Unknown phase rejected non-zero, 0 token burned

--- Suite 4: Scoped Token Cannot Run All (Null Target Phase) ---
  Exit code for omitted phase ID: 1
  [PASS] Suite 4: Implicit all-phases request rejected, token preserved

--- Suite 5: Wrong Target Phase Mismatch ---
  Exit code for mismatched target: 1
  [PASS] Suite 5: Mismatched target phase rejected, token preserved

--- Suite 6: Persistent Claim Blocks Replay Even On Rollback ---
  [PASS] Suite 6: Persistent claim successfully blocked replay after rollback

--- Suite 7: Guard CLI No-Ops (All Requested Already PASSED) ---
  Exit code for no-op execution: 1
  [PASS] Suite 7: No-op request rejected non-zero, 0 token burned

--- Suite 8: Fail-Stop Safeguard (Halts on First Failure) ---
  Exit code after phase 1 failure: 42
  [PASS] Suite 8: Fail-stop verified, phase 2 not run

--- Suite 9: Child Signal Handling & Stream Flush ---
  Resolved code for SIGTERM: 143
  [PASS] Suite 9: Signal resolved to 143, log stream flushed

--- Suite 10: Phase 10 Monotonic Attempt >= 4 ---
  Phase 10 initial next attempt: 4
  Phase 1 initial next attempt:  1
  [PASS] Suite 10: Phase 10 ordinal strictly enforced >= 4

--- Suite 11: Canonical Log Alias Never Overwrites Legacy ---
  [PASS] Suite 11: Legacy canonical log preserved, alias directed to unique raw log

================================================================================
ALL CONTROLS PASSED: 11 / 11 SUITES VALIDATED CLEAN
================================================================================
```

---

## 五、 工作區相依快取補全與 R1 誤診深度糾正

### 1. `packages/plugins/sdk/dist` APFS 補全與 76 產出雜湊比對

- **來源與目標一致性證明：**
  - Git Blob 驗證：`git rev-parse HEAD:packages/plugins/sdk` 在 `3f1` 與 `56d` 皆為 `86cd5fdf2fb1e6a131898ed66167f03a9c98094f`，原始碼 100% 同步。
  - 拷貝方式：使用 macOS APFS CoW 複製：`cp -cR /private/tmp/pv-load-fixture-fix/packages/plugins/sdk/dist /private/tmp/pv-git-env-fixture-fix/packages/plugins/sdk/dist`。
  - 雜湊清冊：共 97 個檔案（`ls -a` 包含 `.`、`..`、`.paperclip-build-complete` 共 76 個頂層 entries），全部雜湊 100% 吻合，已保存於 `/private/tmp/pv-phase10-hardening-r2/sdk-dist-hash-manifest.json`。
  - Git 狀態：`packages/plugins/sdk/dist` 確實受 `.gitignore` 忽略，`git status --porcelain` 保持為空，無任何追蹤程式碼受污染。

### 2. R1 獨立審查報告兩大誤診糾正（Correction of R1 Misdiagnoses）

#### 誤診 A：`workspace-precheck.mjs` 失敗根因誤診
- **R1 說法：** 宣稱因為缺少 `packages/plugins/sdk/dist`，導致 `@paperclipai/create-paperclip-plugin` 解析依賴失敗（退出碼 1）。
- **真相揭露：**
  - 在完成 `sdk/dist` 補全後，若直接以 Node CJS `createRequire().resolve` 執行原預檢腳本，**依然會報錯退出碼 1**：`ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined in .../@paperclipai/plugin-sdk/package.json`。
  - 根本原因在於 `@paperclipai/plugin-sdk` 是純 ESM 套件（`"type": "module"`），其 `package.json` 之 `exports` 僅定義了 `"types"` 與 `"import"`，**完全沒有定義 `"require"` 或 `"default"` 條件**。
  - Node.js 在處理 CJS `require.resolve()` 時，僅查詢 `["node", "require"]` 條件，因此任何 CJS require 都必定拋出 `ERR_PACKAGE_PATH_NOT_EXPORTED`。
  - 但在真實環境中，`create-paperclip-plugin` 是以 ESM `import` 運行（或經 Vite/Vitest 模組解析），查詢 `["node", "import"]` 條件，能直接且精確地解析到 `dist/index.js`。
  - **結論：** 原預檢腳本使用 CJS 檢查純 ESM exports 屬於測試工具自身的設計瑕疵，R1 誤診為工作樹結構損壞。在加入雙模 ESM/CJS 解析邏輯後，17 個專案全數 PASS（退出碼 0）。

#### 誤診 B：工作樹檔案系統「OS-strict-readonly」誤診
- **R1 說法：** 前次硬化報告宣稱工作樹為「作業系統強制唯讀檔案系統」。
- **真相揭露：**
  - 磁碟掛載為 APFS 可讀寫分割區，POSIX 權限為 `0755`，無 BSD 旗標。
  - Vitest 啟動時發生的 `EPERM`，係 macOS Darwin Seatbelt 標準沙盒策略拒絕寫入 `.vite-temp` 所致（沙盒違規在 Darwin 上返回 `EPERM` 而非 `EACCES`）。
  - 後續的 `touch` 拒絕則是代理人框架 pre-tool hook 攔截，二者分屬不同層級。
  - 解決方法是透過正式受支援之使用者授權工具通道（`BypassSandbox: true`），而非偽稱 TMPDIR 即可繞過 Vite 硬編碼路徑，更不可改動系統安全權限。

---

## 六、 Hermes 全量套件測試執行成果

在完成工作區依賴補全並獲得使用者授權後，使用私有 Python 3.15.2 工具鏈及乾淨環境，執行 Hermes 全套件測試一次：

- **命令：** `node /private/tmp/pv-phase10-hardening-r2/run-hermes-package.mjs`（`BypassSandbox: true`）
- **日誌保存：** `/private/tmp/pv-phase10-hardening-r2/hermes-package-run.log`
- **執行耗時：** 11.1 秒
- **退出碼：** `0`
- **測試統計：**
  - **Test Files:** 10 passed (10 total)
  - **Tests:** 174 passed (174 total)
  - **Failures:** 0
  - **Skips:** 0
- **涵蓋核心測試檔：**
  1. `paperclip-task-bridge.test.ts` (3 tests)
  2. `prompt-rendering.test.ts` (13 tests)
  3. `execute.onspawn.test.ts` (10 tests)
  4. `index.test.ts` (7 tests)
  5. `gateway/ui/parse-stdout.test.ts` (8 tests)
  6. `detect-model.test.ts` (7 tests)
  7. `ui/parse-stdout.test.ts` (9 tests)
  8. `command-resolution.test.ts` (5 tests)
  9. `execute.instructions.test.ts` (11 tests)
  10. `gateway/server/execute.test.ts` (101 tests)
- **結論：** 徹底解除了前次 Attempt 2 遭遇之 `python 3.9 < 3.10` 失敗，Hermes 套件在 Python 3.15.2 下全量通過。

---

## 七、 交付下一輪獨立審查之規格與清冊（Fresh Review Artifacts）

### 1. 相容性授權檔 JSON Schema (`run-authorization.schema.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PaperclipRunAuthorization",
  "type": "object",
  "required": ["authorizationId"],
  "properties": {
    "authorizationId": {
      "type": "string",
      "description": "Unique single-use token identifier"
    },
    "targetPhaseId": {
      "type": ["string", "null"],
      "description": "Explicit target phase ID (e.g. 'phase-10-general-workspaces-b') or 'all'"
    },
    "targetPhaseIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional list of authorized phase IDs"
    },
    "expectedGitHead": {
      "type": "string",
      "description": "Bound commit hash (56d517eeffd24287161329b2f86595dcdef4d165)"
    },
    "expectedGitTree": {
      "type": "string",
      "description": "Bound git tree hash (faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5)"
    },
    "toolMatrixDigest": {
      "type": "string",
      "description": "SHA-256 digest of manifest.tools JSON object"
    },
    "argvDigest": {
      "type": "string",
      "description": "SHA-256 digest of target phase fullArgv"
    },
    "approvedBy": {
      "type": "string",
      "description": "Approving operator or independent review session ID"
    },
    "approvedAt": {
      "type": "string",
      "description": "ISO timestamp of approval"
    },
    "consumed": {
      "type": "boolean",
      "description": "Marked true upon successful atomic claim"
    },
    "consumedAt": {
      "type": "string",
      "description": "ISO timestamp of claim"
    },
    "consumedByPid": {
      "type": "number",
      "description": "Process ID that claimed the token"
    },
    "claimFile": {
      "type": "string",
      "description": "Path to persistent claim record on disk"
    }
  }
}
```

### 2. 實際 Manifest Lexical Phase IDs 清冊（全 15 組）

```text
1.  phase-01-general-chat-shard-0
2.  phase-02-general-chat-shard-1
3.  phase-03-general-chat-shard-2
4.  phase-04-general-server-without-chat-or-native-runner-shard-0
5.  phase-05-general-server-without-chat-or-native-runner-shard-1
6.  phase-06-general-server-without-chat-or-native-runner-shard-2
7.  phase-07-general-server-without-chat-or-native-runner-shard-3
8.  phase-08-general-server-native-runner
9.  phase-09-general-workspaces-a
10. phase-10-general-workspaces-b
11. phase-11-general-workspaces-c
12. phase-12-serialized-shard-0
13. phase-13-serialized-shard-1
14. phase-14-serialized-shard-2
15. phase-15-serialized-shard-3
```

---

## 八、 結論與門禁交接

1. **R2 硬化修復 100% 就緒：** 控制器競態與範圍漏洞已修補，11 項假控制負向測試全數通過。
2. **工作區依賴完整度 100% 就緒：** `sdk/dist` 76 產出已補全，雙模預檢全 17 專案 PASS。
3. **Hermes 套件 100% 通過：** 10/10 檔案、174/174 案例全綠。
4. **全量 Phase 10 重跑維持 STRICT NO-GO：** Tasks 2.12、2.13、4.2–5.2 嚴格保持未勾選，等待下一輪全新獨立審查完成驗收。
