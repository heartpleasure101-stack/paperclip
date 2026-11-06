# Phase 10 控制器硬化、有界負向驗證與環境防護交付報告

**文件路徑：** `doc/plans/2026-11-05-phase10-hardening-verification.md`  
**建立日期：** 2026-11-05  
**執行角色：** 有界維運硬化工程師（Bounded Ops Hardener, agy Gemini 3.8 Flash High）  
**模式約制：** 原生檔案工具、無 MCP / Hindsight / Pi / Sonnet / 外部子代理、不修改任何已追蹤來源程式碼、不執行全量 Phase / 跨專案重跑、真實失敗探針絕不自動修復重試、遇到權限阻擋（deny）或唯讀限制立即停止絕不規避。  
**父任務：** Task 2.13（隸屬 `openspec/changes/portable-validation-and-enrollment-regression/tasks.md`，目前維持 PENDING）。

---

## 一、 執行摘要與防護成果判定

| 項目 | 狀態 | 核心說明 |
| :--- | :---: | :--- |
| **控制器硬化** | **COMPLETED** | `/private/tmp/pv-full/run-phases.mjs` 完成 5 大防護改造：嚴格遞增序號（考慮磁碟與稽核最低限制）、子行程生成前 `wx` 排他建立日誌、單次授權 Interlock 防重複執行、非零退出立即中止無迴圈重試、別名防覆寫。 |
| **排他備份與雜湊記錄** | **COMPLETED** | 改造前 runner 與 Manifest 於 scratch 專屬目錄以 `wx` 排他備份，雜湊值與 byte 數完整鎖定；既有 live 與 mirror Manifest 保持 2 筆紀錄不重編。 |
| **提案移轉 Manifest** | **COMPLETED** | 獨立產出 `proposed-phase10-manifest-migration.json`，完整登錄 Logical 1 (3f1)、Logical 2 (56d 缺失 115KB 毀損)、Logical 3 (56d Python 3.9)，規定後續序號必 `>= 4`。 |
| **無害假子行程控制組** | **PASSED (19/19)** | 5 組負向控制全數通過：路徑碰撞攔截（0 子行程／位元組不變）、序號回退無效（保證 `>= 4`）、單次授權鎖失效閉合、退出碼 1 阻斷後續組、訊號捕捉（SIGTERM 143）與完整 flush。 |
| **Workspace 依賴預檢** | **DOCUMENTED** | 17 個專案之 `node_modules` 與 Claude-local 關鍵 subpath 均能正確解析至 `pv-git-env-fixture-fix`；報告記錄 `plugins/sdk/dist` 缺項事實，依約「缺依賴回報停止、不自動拷貝」。 |
| **私有 Python 工具鏈** | **COMPLETED** | 於 `/private/tmp/pv-phase10-hardening/python-bin` 建立單一 `python3` 軟連結至既有 Homebrew Python 3.15.2；驗證舊 Python 3.9 必定觸發 `hermes_python_old` 拒絕，新 Python 3.15 通過。 |
| **Hermes 套件實跑探針** | **BLOCKED & STOPPED** | 嘗試單次執行 Hermes 套件測試時，因 `pv-git-env-fixture-fix` 處於嚴格唯讀狀態且命中使用者 deny 規則，觸發 `EPERM` 拒絕。依指示「遇失敗／拒絕立即停止、絕不規避或重新掛載」，保留現場並停止。 |
| **門禁狀態** | **PENDING (NO-GO)** | Tasks 2.12, 2.13, 4.2, 4.3, 4.4, 5.1, 5.2 嚴格維持未勾選；嚴禁進行任何全量 Phase 10 重跑或 11–15 執行，等待獨立複審。 |

---

## 二、 控制器硬化細節與檔案備份清冊

### 1. 原始檔案排他備份（Exclusive-Create in OWN scratch）

所有原始檔案在進行任何修改前，均透過 Node `fs.openSync(..., "wx")` 排他建立備份至 scratch 目錄，杜絕意外截斷：

| 檔案 | 備份路徑 | 大小 (Bytes) | SHA-256 雜湊值 |
| :--- | :--- | :---: | :--- |
| **改造前 runner** | `brain/.../scratch/run-phases.mjs.pre-hardening.bak` | 8,629 | `2a12e095f500aa393d5311f1eb5fbba57a871e4ff1b62595d0d4dc6cdb3f04da` |
| **現行 live Manifest** | `brain/.../scratch/phase-manifest.json.pre-hardening.bak` | 45,993 | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` |
| **現行 mirror Manifest** | `brain/.../scratch/manifests-phase-manifest.json.pre-hardening.bak` | 45,993 | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` |

### 2. 硬化後控制器檔案資訊與差異

- **目標檔案：** `/private/tmp/pv-full/run-phases.mjs`
- **檔案大小：** 11,470 bytes
- **SHA-256 雜湊值：** `bec37319ccfdb2e8558c90a54996f37038134981aed41fa5acb57958650025a8`

#### 關鍵修改差異（Ops Diff）：

```diff
--- /Users/Hermes/.gemini/antigravity-cli/brain/.../scratch/run-phases.mjs.pre-hardening.bak
+++ /private/tmp/pv-full/run-phases.mjs
@@ -8,4 +37,4 @@
-const manifestPath = "/private/tmp/pv-full/manifests/phase-manifest.json";
-const mirrorManifestPath = "/private/tmp/pv-full/phase-manifest.json";
-const logsDir = "/private/tmp/pv-full/logs";
+const manifestPath = process.env.PAPERCLIP_MANIFEST_PATH || "/private/tmp/pv-full/manifests/phase-manifest.json";
+const mirrorManifestPath = process.env.PAPERCLIP_MIRROR_MANIFEST_PATH || "/private/tmp/pv-full/phase-manifest.json";
+const logsDir = process.env.PAPERCLIP_LOGS_DIR || "/private/tmp/pv-full/logs";

+// [硬化 1] 嚴格單調遞增 Attempt 計算
+function computeNextAttemptNumber(phase, targetLogsDir) {
+  const manifestAttempts = Array.isArray(phase.attempts) ? phase.attempts.map(a => Number(a.attempt)).filter(n => !isNaN(n)) : [];
+  const diskAttempts = [];
+  if (fs.existsSync(targetLogsDir)) {
+    const prefix = `${phase.id}.attempt`;
+    for (const f of fs.readdirSync(targetLogsDir)) {
+      if (f.startsWith(prefix) && f.endsWith(".log")) {
+        const num = parseInt(f.slice(prefix.length, -4), 10);
+        if (!isNaN(num)) diskAttempts.push(num);
+      }
+    }
+  }
+  const auditLogicalMinimum = (phase.id === "phase-10-general-workspaces-b") ? 4 : 1;
+  const maxExisting = Math.max(0, ...manifestAttempts, ...diskAttempts);
+  return Math.max(maxExisting + 1, auditLogicalMinimum);
+}

+// [硬化 2] 單次執行授權憑證 Interlock（失效閉合）
+function verifyAndConsumeAuthorization(authPath, targetPhaseId) {
+  if (!authPath || !fs.existsSync(authPath)) {
+    throw new Error(`FAIL-CLOSED: Missing required one-use run authorization file at "${authPath}". Execution refused.`);
+  }
+  const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
+  if (auth.consumed) {
+    throw new Error(`FAIL-CLOSED: Run authorization ${auth.authorizationId} already consumed at ${auth.consumedAt}.`);
+  }
+  auth.consumed = true;
+  auth.consumedAt = new Date().toISOString();
+  auth.consumedByPid = process.pid;
+  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2) + "\n");
+  return auth;
+}

+// [硬化 3] 子行程生成前 "wx" 排他建立日誌（防止 TOCTOU）
+  let logFd;
+  try {
+    logFd = fs.openSync(attemptLogPath, "wx");
+  } catch (openErr) {
+    console.error(`FATAL: Cannot exclusively create log file ${attemptLogPath}: ${openErr.message}`);
+    throw openErr; // 同步拋出 EEXIST，0 子行程啟動，既有日誌不被截斷
+  }
+  const logStream = fs.createWriteStream(null, { fd: logFd, autoClose: true });

+// [硬化 4] 安全的 Canonical 別名同步（碰撞時不覆寫既存日誌）
+  if (phase.logPath && path.resolve(phase.logPath) !== path.resolve(attemptLogPath)) {
+    if (fs.existsSync(phase.logPath)) {
+      console.log(`[Phase ${phase.id}] Note: canonical alias ${phase.logPath} exists. Preserving legacy log; pointing phase.logPath to unique raw attempt ${attemptLogPath}`);
+      phase.logPath = attemptLogPath;
+    } else {
+      try {
+        const rawBytes = fs.readFileSync(attemptLogPath);
+        fs.writeFileSync(phase.logPath, rawBytes, { flag: "wx" });
+      } catch (aliasErr) {
+        phase.logPath = attemptLogPath;
+      }
+    }
+  }
```

### 3. 防護邊界聲明（Protection Limits）

> [!IMPORTANT]
> **非作業系統級別沙盒聲明：**  
> 本次實施之控制器防護（`wx` 排他開啟、單調 Attempt Ordinal、單次使用授權憑證、Fail-Stop 退出）純屬**行程內部控制（Process-Level Controls）**。  
> 其目的在於阻斷 runner 自身的截斷破壞、TOCTOU 覆寫、計數回退重跑與未經授權重試。它**不具備**作業系統層級之 seccomp、chroot、容器隔離或硬體虛擬化防護，子行程仍具備呼叫端之系統權限。

---

## 三、 邏輯三階段提案遷移 JSON（PROPOSAL ONLY）

依稽核結論，既有實體日誌檔案嚴禁重新命名或覆寫。在 scratch 目錄建立提案移轉規格檔：
- **路徑：** `/Users/Hermes/.gemini/antigravity-cli/brain/7307ad6f-9f0a-4309-93d5-f9037b8068bb/scratch/proposed-phase10-manifest-migration.json`
- **SHA-256：** `11f988bf2cb02cbe1b1c948f889d6630c4e0460b56a88da526cadffa0b2f0d3c`

### 3 個邏輯階段記錄摘要：

1. **Logical 1 (Attempt 1):**
   - 提交快照：`3f1eb1b7b364893141818d25569d60206ea36ccb`
   - 時間：`2026-11-05T12:38:23.928Z` – `12:39:53.570Z`（耗時 89.6s）
   - 結果：`exit 1`（Git fixture 衝突，GIT_CONFIG_GLOBAL assert undefined 失敗）
   - 日誌：`phase-10-general-workspaces-b.attempt1.log`（99,074 bytes，SHA-256: `707f0aa8c597937e33144b4bfdc3e71556ee5f9df765758d8db85f5548ab5dc0`）
   - 測試統計：Files 188 passed, 1 failed, 189 total; Tests 3157 passed, 1 failed, 3170 total

2. **Logical 2 (Attempt 2 - Run 1，初次失敗):**
   - 提交快照：`56d517eeffd24287161329b2f86595dcdef4d165`
   - 時間：`2026-11-05T13:52:48Z` – `13:54:22Z`（約 92.4s）
   - 結果：`exit 1`（缺少 37 個 workspace 依賴目錄，Claude-local 等 17 suites 模組找不到）
   - 日誌狀態：**原始日誌 115,142 bytes 永久毀損**（遭後續未授權重跑以 `flags: "w"` 截斷覆寫）
   - 憑證復原：復原自 AGY 外層日誌 `task-300.log`（1,313 bytes，SHA-256: `2ca0f580...`）與前次 session grep 留存輸出 `recovered-first-failure-step331-grep.txt`（12,362 bytes，SHA-256: `6ae5827f...`）
   - 測試統計：詳細欄位為 **UNKNOWN**（原始 child stdout/stderr 遺失，但確認 17 個檔案失敗）

3. **Logical 3 (Attempt 2 - Run 2，違規重用 Attempt 2 計數):**
   - 提交快照：`56d517eeffd24287161329b2f86595dcdef4d165`（注入 37 個外來目錄後）
   - 時間：`2026-11-05T13:57:19.783Z` – `14:00:15.613Z`（耗時 175.8s）
   - 結果：`exit 1`（PATH 優先使用系統 Python 3.9.6，Hermes 要求 `>= 3.10` 失敗）
   - 日誌：`phase-10-general-workspaces-b.attempt2.log`（152,544 bytes，SHA-256: `362cae7efbc80b222417fa8b744a16888bf6d981dd3375a833fb0aa9e0a8a4c4`）
   - 測試統計：Files 279 passed, 2 failed, 1 skipped, 282 total; Tests 4548 passed, 3 failed, 14 skipped, 4565 total
   - 物理備份：已封存至 `/private/tmp/pv-phase10-attempt-audit/phase-10-general-workspaces-b.attempt2.overwritten-raw.log`

> [!NOTE]
> **未來序號規則：** 即使現行 `phase-manifest.json` 物理上僅保留 Attempt 1 與 Attempt 2 兩筆紀錄，新控制器已鎖定 `auditLogicalMinimum = 4`，未來任何 Phase 10 之執行序號**嚴格保證 `>= 4`**。

---

## 四、 無害假子行程負向控制驗證成果（19/19 PASSED）

執行腳本：`/private/tmp/pv-phase10-hardening/sandbox-controls/run-controls.mjs`  
執行命令：`node /private/tmp/pv-phase10-hardening/sandbox-controls/run-controls.mjs`

```text
================================================================================
RUNNING BOUNDED HARMLESS FAKE-CHILD OPS CONTROLS
Controls Root: /private/tmp/pv-phase10-hardening/sandbox-controls
================================================================================

--- Control 1: Existing Path Collision & Exclusive-Create (wx) ---
[PASS] openSync with 'wx' throws EEXIST on collision
[PASS] Zero child process spawned on path collision
[PASS] Existing log content 100% byte-for-byte identical
[PASS] Existing log hash matches (5f3470070f5e85ce73aa0fdf7519421201037454006d036fbcc121ba4c6545e2)

--- Control 2: Monotonic Ordinal & Manifest Rollback Protection ---
[PASS] Next attempt for phase 10 is strictly 4 (actual: 4), cannot reuse attempt 2 or 3
[PASS] Next attempt increments to 5 once 4 is recorded (actual: 5)

--- Control 3: Single-Use Authorization Interlock (Fail-Closed) ---
[Authorization] Successfully validated and consumed single-use token: auth-control-test-uuid-001 (authorizedBy: operator-independent-review)
[PASS] First invocation successfully consumed token
[PASS] Authorization record persisted as consumed: true
[PASS] Recorded consumedAt timestamp
[PASS] Repeated invocation rejected: authorization cannot be reused
[PASS] Missing authorization file rejected fail-closed

--- Control 4: End-to-End Fake Child: Exit 1 Stops Later Phases ---
[PASS] Runner exited with code 1 upon child failure (actual: 1)
[PASS] Phase 1 status recorded as FAILED in manifest
[PASS] Phase 2 status remains PENDING in manifest
[PASS] Phase 2 log was NEVER created; later phase never ran

--- Control 5: End-to-End Fake Child: Signal Termination & Stream Flush ---
[PASS] Runner caught SIGTERM and resolved code 143 (actual: 143)
[PASS] Signal phase recorded as FAILED
[PASS] Signal phase recorded signal: SIGTERM
[PASS] Log stream was completely flushed to disk prior to runner exit

================================================================================
ALL CONTROLS PASSED: 19 passed, 0 failed
================================================================================
```

---

## 五、 Workspace 唯讀相依預檢（17 Projects B）

執行腳本：`/private/tmp/pv-phase10-hardening/workspace-precheck.mjs`

### 1. 17 個專案之 `node_modules` 與內部相依解析表

| 專案名稱 | 套件相對目錄 | `node_modules` 狀態 | 工作區相依解析結果 |
| :--- | :--- | :---: | :--- |
| `@paperclipai/shared` | `packages/shared` | 存在 (目錄) | 基礎套件，無 workspace 相依 |
| `@paperclipai/skills-catalog` | `packages/skills-catalog` | 存在 (目錄) | 1 個依賴（shared）解析成功 |
| `@paperclipai/adapter-utils` | `packages/adapter-utils` | 存在 (目錄) | 1 個依賴（shared）解析成功 |
| `@paperclipai/adapter-claude-local` | `packages/adapters/claude-local` | 存在 (目錄) | 2 個依賴（shared, adapter-utils）解析成功 |
| `@paperclipai/adapter-codex-local` | `packages/adapters/codex-local` | 存在 (目錄) | 2 個依賴（shared, adapter-utils）解析成功 |
| `@paperclipai/adapter-cursor-cloud` | `packages/adapters/cursor-cloud` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/adapter-cursor-local` | `packages/adapters/cursor-local` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/adapter-gemini-local` | `packages/adapters/gemini-local` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/adapter-grok-local` | `packages/adapters/grok-local` | 存在 (目錄) | 2 個依賴（shared, adapter-utils）解析成功 |
| `@paperclipai/hermes-paperclip-adapter` | `packages/adapters/hermes` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/adapter-kimi-local` | `packages/adapters/kimi-local` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/adapter-openclaw-gateway` | `packages/adapters/openclaw-gateway` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/adapter-opencode-local` | `packages/adapters/opencode-local` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/adapter-pi-local` | `packages/adapters/pi-local` | 存在 (目錄) | 1 個依賴（adapter-utils）解析成功 |
| `@paperclipai/plugin-daytona` | `packages/plugins/sandbox-providers/daytona` | 存在 (目錄) | 獨立套件 |
| `@paperclipai/plugin-sdk` | `packages/plugins/sdk` | 存在 (目錄) | 1 個依賴（shared）解析成功 |
| `@paperclipai/create-paperclip-plugin` | `packages/plugins/create-paperclip-plugin` | 存在 (目錄) | 依賴 `@paperclipai/plugin-sdk`（見下文缺項分析） |

### 2. Logical 2 關鍵崩潰路徑回歸檢驗

針對第一次 Attempt 2 失敗之 5 個核心 Subpath 進行逐項 ESM / realpath 解析：
- `packages/adapters/claude-local` -> `@paperclipai/adapter-utils/execution-target`:
  `resolved: .../packages/adapter-utils/src/execution-target.ts`（inRepo: true, Readable: true）
- `packages/adapters/claude-local` -> `@paperclipai/adapter-utils/local-process-sandbox`:
  `resolved: .../packages/adapter-utils/src/local-process-sandbox.ts`（inRepo: true, Readable: true）
- `packages/adapters/claude-local` -> `@paperclipai/adapter-utils/test-fixtures/prompt-context`:
  `resolved: .../packages/adapter-utils/src/test-fixtures/prompt-context.ts`（inRepo: true, Readable: true）
- `packages/adapters/claude-local` -> `@paperclipai/shared/openrouter-attribution`:
  `resolved: .../packages/shared/src/openrouter-attribution.ts`（inRepo: true, Readable: true）
- `packages/adapters/claude-local` -> `@paperclipai/adapter-utils`:
  `resolved: .../packages/adapter-utils/src/index.ts`（inRepo: true, Readable: true）

### 3. 預檢缺項回報（依約「回報停止、不自動拷貝」）

預檢發現：前次 agent 僅複製了各套件之 `node_modules` 目錄，但未複製已被 `.gitignore` 排除之產出目錄 `dist`：
- `packages/plugins/sdk` 在來源 `3f1` 快照中擁有編譯產出 `dist/`，但在新快照 `pv-git-env-fixture-fix` 中**缺少 `dist/`**。
- 由於 `packages/plugins/sdk/package.json` 之 `exports` 僅宣告 `"./dist/index.js"`，使得任何透過 Node 模組解析 `@paperclipai/plugin-sdk` 之 CommonJS / 外部呼叫會找不到 entrypoint。
- **維運處置：** 嚴格遵守「若缺少依賴則回報停止、執行期間禁止自動拷貝」之不可變規則，客觀記錄此缺項，不私自自 `3f1` 複製 `dist` 目錄。

---

## 六、 私有 Python 工具鏈配置與版本矩陣

### 1. 私有 Tool-Bin 配置

- **路徑：** `/private/tmp/pv-phase10-hardening/python-bin`
- **內容：** 僅包含單一軟連結 `python3`：
  ```bash
  python3 -> /opt/homebrew/Cellar/python@3.15/3.15.2/Frameworks/Python.framework/Versions/3.15/bin/python3.15
  ```
- **配置原則：**
  - 未執行任何套件安裝指令（零 `brew install` / 零 `pip install`）。
  - 未更動主機全域 PATH 順序。
  - 僅供 Phase 10 之 Clean-env 参数插入於 `/usr/bin` 之前：
    `--bin /private/tmp/pv-phase10-hardening/python-bin --bin /usr/bin --bin /opt/homebrew/bin`
  - 其他舊 Phase（Phase 01–09）執行配方完全保持原樣（使用 Python 3.9）。

### 2. 工具鏈二進位檔案雜湊比對矩陣（Before vs After）

所有工具鏈均已逐一驗證雜湊值，證實未受任何污染或更動：

| 工具 | 實體路徑 | SHA-256 雜湊值 | 狀態 |
| :--- | :--- | :--- | :---: |
| **Node.js** | `/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node` | `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a` | 相同 |
| **Git** | `/private/tmp/pi-dedup-git-toolchain/bin/git` | `916479af8cb874da55aab980077362ee233407e5112f6df5ee3514d7611ab559` | 相同 |
| **Cargo** | `/private/tmp/pi-dedup-rust-toolchain/cargo/bin/cargo` | `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f` | 相同 |
| **Rustup** | `/private/tmp/pi-dedup-rust-toolchain/cargo/bin/rustup` | `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f` | 相同 |
| **Corepack LKG** | `/private/tmp/pv-clean-tools/corepack/lastKnownGood.json` | `957e0bb742647e92bbaf8238bce96848e011b452ee7c09f2a876b93a013d0ae8` | 相同 |
| **Homebrew Python** | `/opt/homebrew/Cellar/python@3.15/.../python3.15` | `d775520d87f89a19cffe0db3fba17f3caf71d91066e23e5efd7b5bd9dbb975e2` | 相同 |

### 3. 有界 Python 版本門禁負向與正向測試成果

執行腳本：`/private/tmp/pv-phase10-hardening/python-version-gate.mjs`

- **負向控制（舊 Python 3.9.6）：**
  - 探針輸出：`Python 3.9.6`
  - 判定結果：`checkPython()` 返回 `{ level: "error", code: "hermes_python_old", message: "Python Python 3.9.6 found — Hermes requires Python 3.10+" }`
  - 驗收：**PASS**（正確拒絕舊版 Python）
- **正向控制（新 Python 3.15.2）：**
  - 探針輸出：`Python 3.15.2`
  - 判定結果：`checkPython()` 返回 `null`（合格）
  - 驗收：**PASS**（正確接受合格 Python）

---

## 七、 Hermes 套件單次實跑探針與唯讀沙盒阻擋紀錄

### 1. 執行依據與指令

依指示：「ScopedHermes fullPACKAGE allowedONCE withnewruntime; actualfailedprobe neverretryautofix. Ifnewpackagefail STOPnofurtherfix/retry. Ifdeny/mountloss/unexpectedstateSTOPneverevade/recreatevolume.」  
配置腳本 `/private/tmp/pv-phase10-hardening/run-hermes-package-once.mjs`，以包含私有 python-bin 的 Clean-env PATH 執行單一專案：
```bash
/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node \
  /private/tmp/pv-git-env-fixture-fix/node_modules/vitest/vitest.mjs \
  run --project @paperclipai/hermes-paperclip-adapter
```

### 2. 阻擋現象與根因分析

- **執行結果：** 啟動 0.2 秒後中斷，退出碼 `exit 1`。
- **日誌憑證：** `/private/tmp/pv-phase10-hardening/hermes-single-package-run.log`
- **錯誤內容：**
  ```text
  failed to load config from /private/tmp/pv-git-env-fixture-fix/vitest.config.ts
  Error: EPERM: operation not permitted, open '/private/tmp/pv-git-env-fixture-fix/node_modules/.vite-temp/vitest.config.ts.timestamp-...mjs'
      at async open (node:internal/fs/promises:640:25)
      at async Object.writeFile (node:internal/fs/promises:1260:14)
  ```
- **權限阻擋根因：**
  - 工作樹 `/private/tmp/pv-git-env-fixture-fix` 目前處於**使用者自訂之強制唯讀保護狀態（User-Configured Deny Rule）**。
  - 當 Vite 嘗試在 `node_modules/.vite-temp` 寫入暫存打包檔案時，作業系統與使用者安全規則立即觸發 `EPERM` / `Permission denied` 攔截。
  - 指令中任何 touch 或寫入嘗試均直接命中使用者 deny 規則。

### 3. 維運決策與處置

依使用者最高指令：
1. **「If deny/mountloss/unexpectedstate STOP never evade/recreate volume」**：嚴禁繞過權限檢查、嚴禁修改權限或重建磁碟區，立即停止！
2. **「actual failed probe never retry autofix」**：實體探針失敗絕不自動嘗試其他修補。
3. **「If new package fail STOP no further fix/retry」**：停止任何進一步重跑。

---

## 八、 未來 Attempt 4 一次性安全重跑配方（待獨立複審 GO）

當使用者完成獨立複審並授予正式 GO 後，可透過以下單次受控配方安全重啟 Phase 10：

### 1. 單次使用授權憑證生成規格

建立單次授權檔案 `/private/tmp/pv-full/.run-authorization.json`：
```json
{
  "authorizationId": "auth-phase10-attempt4-once-only",
  "targetPhaseId": "phase-10-general-workspaces-b",
  "issuedAt": "2026-11-06T00:00:00.000Z",
  "approvedBy": "operator-independent-review",
  "consumed": false
}
```

### 2. 控制器單次執行命令

```bash
/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node /private/tmp/pv-full/run-phases.mjs \
  --run-authorization /private/tmp/pv-full/.run-authorization.json \
  phase-10-general-workspaces-b
```

### 3. 控制器受控引數與防護預期
- **新 Attempt 序號：** 嚴格鎖定為 `Attempt 4`。
- **目標日誌路徑：** `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.attempt4.log`（以 `wx` 排他建立，絕不覆寫 attempt1 或 attempt2）。
- **授權消耗：** 啟動瞬間即將 `consumed` 置為 `true`，防止任何後續重複重試。
- **Fail-Stop：** 遇任何非零退出立即中止，後續 Phase 11–15 絕不執行。

---

## 九、 結論與工作移交清單

1. **工作成果：**
   - 本次維運硬化已完全達成所有安全防護需求，控制器具備排他建立防截斷、單調序號防回退、單次授權防重試能力。
   - 所有原始日誌與 Manifest 雜湊值 100% 完整保留。
   - 誠實記錄 Logical 2 原始 115KB 遺失真相與 `plugins/sdk/dist` 缺項。
   - 面對唯讀磁區 `EPERM` 拒絕，嚴格遵行 Stop 規範，絕無繞過或破壞。
2. **門禁維持：**
   - Task 2.12：PENDING
   - Task 2.13：PENDING
   - Task 4.2 / 4.3 / 4.4 / 5.1 / 5.2：PENDING (NO-GO)
   - 保持 live repo 原始碼零變更、零 commit、零 push。
   - 停止所有執行，靜候獨立第三方審查。
