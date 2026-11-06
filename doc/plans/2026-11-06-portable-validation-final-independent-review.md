# Portable Validation & Pi Summary Dedup 最終獨立審查報告 (Final Independent Review Report)

**報告日期：** 2026-11-06  
**審查員：** 獨立最終驗證員（Fresh Full Independent Final Auditor, agy Gemini 3.8 Flash High）  
**審查約束：** 原生唯讀工具（Native read-only file/git/hash inspection）、無任何 MCP / Hindsight / Pi / Sonnet / 外部子代理；不重跑全量測試、不重新安裝/下載、不執行真實 Cursor/Copilot/Vendor CLI、不修改專案源碼/規範/任務清冊/Manifest/Controller；僅寫入本報告於指定獨立路徑 `/private/tmp/pv-final-independent-review/`。  
**審查基準快照：**
- **主工作區（Original Summary HEAD）：** `/Volumes/AI/projects/paprerclip-v2` (`c21123d46aad10d1c0bb3073a5d05850a79042c0`，工作區乾淨，0 uncommitted entries）
- **凍結驗證快照（Frozen Test Snapshot）：** `/private/tmp/pv-git-env-fixture-fix` (`56d517eeffd24287161329b2f86595dcdef4d165`，Git Tree: `faa45f1d9342a834539a76c8f9d26015cf263710`，0 uncommitted entries）
- **歷史保留工作區：**
  - Cohort 1 (Phases 01–06): `/private/tmp/paperclip-portable-validation` (`cc56bbcd30a7de1a78a92b108dba772d3c02a500`，Tree `37295d5b...`)
  - Cohort 2 (Phases 07–09): `/private/tmp/pv-load-fixture-fix` (`3f1eb1b7b364893141818d25569d60206ea36ccb`，Tree `d5cff774...`)
  - Cohort 3 (Phases 10–15): `/private/tmp/pv-git-env-fixture-fix` (`56d517eeffd24287161329b2f86595dcdef4d165`，Tree `faa45f1d...`)
- **集中執行記錄與 Manifest：** `/private/tmp/pv-full/manifests/phase-manifest.json` 與 `/private/tmp/pv-full/logs/`

---

## 一、 獨立審查總評與最終門禁決策 (Gate Verdicts)

| 審查標的 | 門禁判定 | 核心判定依據 |
| :--- | :---: | :--- |
| **Pi 單一摘要去重 (pi-single-prompt-summary-dedup)** | **GO (ACCEPT)** | 原始 5 個源碼檔案自 `e559...` / `cc56...` 起 100% 保持未動。功能嚴格雙向比對、預設關閉、僅 Pi 顯式啟用（`execute.ts:690`）、無任何其他適配器副作用。單元測試 28/5/14 及 52/67 矩陣案例全數通過；字元位元組 8,506 → 5,455 節省如實界定為合成 UTF-8 數據，未虛報 live token/成本。規格 scenario 100% 滿足。 |
| **可攜式驗證與入職迴歸 (portable-validation-and-enrollment-regression)** | **NO-GO (CRITICAL BLOCK)** | **發現重大缺陷 (CRITICAL)：** Phase 08 (Native Runner) 實跑中，2 個整合測試套件（`diskless` 與 `checkpoint-cost`）共 3 項測試，以及 `recovery` 套件中 6 項測試（合計 9 項測試），因本機測試 fixture 二進位檔 `fake-codex-app-server` **未予編譯**，被 `realProcessIt` 靜默跳過。前次作者將此未編譯之 repo-local fixture 歸類為「合法防護跳過」並宣稱「100% 支援能力無跳過」，嚴重違反驗證規範。在受支援的 macOS 主機上，缺少自帶 mock 二進位檔不得視為合法平台跳過。 |
| **OpenSpec 任務封存授權 (Task 5.1 / 5.2 / 3.3)** | **UNAUTHORIZED (STOP)** | 因可攜式驗證存在 CRITICAL 缺陷，Task 5.1 不得標記通過，Task 5.2、Pi Task 3.3、PR draft 移除、git push 與 OpenSpec archive 嚴格禁止執行。 |

---

## 二、 發現事項分級清單 (Findings: Critical / Warning / Suggestion)

### 1. CRITICAL (必須修正阻擋項)

- **[CRITICAL-1] Phase 08 Native Runner 核心測試套件因缺少未編譯之本機 Fixture 被靜默跳過**
  - **位置：**
    - `server/src/__tests__/helpers/native-restart.ts:25-31`
    - `server/src/services/native-runtime/native-runner-restart-diskless.integration.test.ts` (2 項測試跳過)
    - `server/src/services/native-runtime/native-runner-restart-checkpoint-cost.integration.test.ts` (1 項測試跳過)
    - `server/src/services/native-runtime/native-runner-restart-recovery.integration.test.ts` (6 項 `realProcessIt` 測試跳過)
  - **事實與因果：**
    `native-restart.ts` 第 29–31 行定義：
    ```typescript
    export const fakeCodexAppServer = resolve(
      import.meta.dirname,
      "../../../../packages/paperclip-runner/runner/target/debug/fake-codex-app-server",
    );
    const binariesAvailable =
      existsSync(defaultCapabilityRunnerdBinary()) && existsSync(fakeCodexAppServer);
    export const realProcessIt: typeof it.skip = binariesAvailable ? it : it.skip;
    ```
    離線環境僅以 release 模式編譯了 `paperclip-runnerd`，未編譯自帶之除錯測試目標 `fake-codex-app-server`（源碼位於 `packages/paperclip-runner/runner/crates/runner-core/src/bin/fake-codex-app-server.rs`）。導致 `binariesAvailable` 為 `false`，9 項真實行程測試全部降級為 `it.skip`。
  - **前次作者報告之嚴重謬誤：**
    前次驗證報告（`doc/plans/2026-11-06-final-three-verification.md` §24.7 及 `doc/plans/2026-11-05-portable-validation-verification.md` §24.7）將此漏編譯的測試替身稱為「離線驗證環境僅編譯正式 runner binary，未編譯除錯用 mock 伺服器，故觸發合法的 realProcessIt 防護跳過」，並同時做出「支援能力零跳過保證：...無任何必備能力被跳過或弱化」之結論。
  - **判定：**
    本機自帶測試 fixture 漏編譯**絕對不是合法的平台能力限制**（不同於缺少 Docker/Podman 容器環境）。將未編譯的測試視為合法跳過，且隱瞞 `recovery` 套件中 6 項 `realProcessIt` 同步跳過之事實，違反真實驗證合約。此為明確之 **CRITICAL NO-GO**。
  - **規定處方與下一動（Bounded Prescription）：**
    禁止在此審查中直接修改程式碼或偷跑測試。下一位維運者必須在凍結快照 `56d517eeffd24287161329b2f86595dcdef4d165` 上執行有界操作：
    1. 離線編譯缺失的 mock 目標二進位檔：
       `cargo build --manifest-path packages/paperclip-runner/runner/Cargo.toml --locked -p paperclip-runner-core --bin fake-codex-app-server`
    2. 確認 `target/debug/fake-codex-app-server` 存在且權限可執行。
    3. 在 clean-env 隔離環境下對完整的 9 個 Native Runner 套件（Phase 08）執行乾淨重跑。
    4. 驗證所有 9 項 `realProcessIt` 測試（包含 2 個先前全跳過的套件）全數真實執行並 PASS exit 0。

---

### 2. WARNING (重大記載瑕疵與認知落差)

- **[WARNING-1] Final-Three 驗證報告之階段 07–09 提交雜湊嚴重筆誤**
  - **事實：** 在 `doc/plans/2026-11-06-final-three-verification.md` 第 149–151 行與第 218 行中，作者記載梯次 2（Phases 07–09）的 Commit 為 `3f1917f30018fca20b57faeebefd4ba2f30b910b`。
  - **查核：** Git 庫中完全不存在 `3f1917f...` 這個 commit 物件。實際在 `/private/tmp/pv-load-fixture-fix` 執行並記錄於 Manifest 的真實 Commit 為 `3f1eb1b7b364893141818d25569d60206ea36ccb`。作者手民之誤造成溯源帳本文字失真。
  - **建議：** 日後文檔更新應以機器腳本自動比對填入，嚴禁人工拼寫 commit hash。

- **[WARNING-2] Chat 整合測試檔案名稱記載錯誤**
  - **事實：** `doc/plans/2026-11-06-final-three-verification.md` 第 174 行與第 202 行兩次宣稱 Chat Suite 檔名為 `server/src/__tests__/chat-channel-routes.test.ts`。
  - **查核：** 全庫中根本不存在該檔。真正的超大測試檔為 `server/src/__tests__/chat-channels.integration.test.ts`（70,000+ 行），分 6 個 shard 執行。

- **[WARNING-3] 「24 項指紋全梯次一致」之宣告未嚴格限定於非測試檔範圍**
  - **事實：** 報告宣稱「各梯次間的原始程式碼指紋（Pi 5 檔 + PV 19 檔共 24 檔）在快照中 100% 保持一致」。
  - **查核：** 
    - `server/src/__tests__/file-resources-git-scan-load.test.ts` 在 `cc56`（Blob `e3dec44a...`）與 `3f1`（Blob `32aaaebf...`）之間存在變更（Commit `7e8c2854a`）。
    - `packages/adapter-utils/src/github-launcher-environment.test.ts` 在 `3f1`（Blob `b678e337...`）與 `56d`（Blob `0d88615f...`）之間存在變更（Commit `599d7a6cd`）。
    - 雖然這兩個變更皆為合法的環境/負載測試 fixture 修復，且專案生產程式碼（App Code）100% 一致，但論理上若包含測試 fixture，則不得使用「全量 24 檔跨 3 梯次雜湊完全一致」之無條件修辭，必須明確界定為「產品源碼完全一致，測試 fixture 依已審查之 PR/Commit 梯次演進」。

- **[WARNING-4] Phase 08 跳過測試統計說明不完整**
  - **事實：** 前次報告僅說明了 `diskless`（2 測試）與 `checkpoint-cost`（1 測試）跳過，遺漏了 `native-runner-restart-recovery.integration.test.ts` 內同樣被 `realProcessIt` 跳過的 6 項測試，以及因為缺少容器環境（`!process.env.PAPERCLIP_TEST_RUNNER_CONTAINER`）跳過的 14 項容器專案測試（合計該檔 20 項跳過，全 Phase 08 共 23 項跳過）。報告統計與說明存在脫節。

---

### 3. SUGGESTION (改進建議)

- **[SUGGESTION-1] 顯式區分本機過濾跳過、環境依賴跳過與缺陷跳過**
  - 在日後的驗證報告中，跳過測試應分類為：
    1. **分片過濾（Shard Filter）：** 如 Chat 測試的 9,190 項行過濾（正常）。
    2. **可選平台功能缺失（Optional Platform Dependency）：** 如 Docker 容器測試 14 項（需 `PAPERCLIP_TEST_RUNNER_CONTAINER`，macOS 本機離線驗證正常跳過）。
    3. **建置前置缺陷（Unmet Local Fixture）：** 如未編譯之 `fake-codex-app-server`（應歸類為缺陷阻擋）。
    嚴禁將第 3 類混淆為第 2 類。

---

## 三、 程式碼與架構審查 (Source, Pi Dedup, & Security Audit)

### 1. Pi 單一摘要去重功能審查 (Pi Summary Dedup)
- **實作位址：**
  - `packages/adapter-utils/src/server-utils.ts:2234, 2244, 2283, 3032–3052`
  - `packages/adapters/pi-local/src/server/execute.ts:690`
- **契約與行為驗證：**
  - `dedupeIdenticalContinuationSummary` 參數預設為 `undefined`，共用 renderer 預設維持既有重複輸出行為。
  - 嚴格雙向比對：比對 `rawSummaryBody === completedWork`，無字串 strip、無 trimming、無大小寫轉換、非模糊匹配。
  - 控制字元保護：若 `completedWork` 包含 ASCII 控制字元（`[\u0000-\u0008\u000b-\u001f\u007f]`），因歷史證據編碼器無法原樣還原，故自動放棄去重，保留雙份。
  - 邊界防護：以靜態警語文字取代重複正文，絕不刪除 `continuationSummary` 節點本身，絕不更動其 metadata 與截斷標記，不全域替換其他同名文字。
  - 範圍隔離：全庫僅有 `pi-local/src/server/execute.ts` 一處傳入 `true`。經 OpenCode、Claude、Cursor、Codex 等其他適配器全面比對，無任何副作用。
  - 指標透明：8,506 → 5,455 bytes 為測試 fixture 中合成字元之計算，報告中已更正未宣稱 LLM live token 或金額節省。

### 2. GitHub Enrollment 因果修復與虛擬時鐘邊界
- **實作位址：** `server/src/__tests__/github-connection-enrollment-work.test.ts:104` 與 `server/src/__tests__/helpers/fake-clock-io.ts`
- **審查結論：**
  - 僅調用 `settleDueTimers()` 推進 undici 傳輸層需要的零延遲計時器。
  - `Date.now()` 在測試過程中完全未推進（保持為 `observedAt`），未破壞虛擬時間，未改變 25 分鐘安靜期、簽名、Postgres 連線與身分替換之核心斷言。
  - 生產程式碼 0 修改，缺陷歸屬證明為測試替身之排程協調。

### 3. Cursor Sandbox 防護與歷史安全事件
- **實作位址：** `packages/adapters/cursor-local/src/server/cursor-sandbox-test-policy.ts` 及 5 個 Cursor 測試檔案
- **審查結論：**
  - 每項測試嚴格登記自有 root 與 fixture 執行檔，未知命令一律拒絕（`INSTALL_BLOCKED_MESSAGE`），杜絕真實下載或執行。
  - 歷史 638MB Cursor CLI 下載事件如實記錄，當時繼承之環境變數暴露狀態為 **UNKNOWN**，本報告維持「不予安全全綠背書（No security all-clear）」。
  - 非 OS Sandbox 限制已於開發文檔如實揭露。

### 4. Copilot 離線快取準備與 17 項路由測試
- **審查結論：**
  - 離線快取使用已驗證之固定 pins 與清單（`dd486bd8...`），無動態 CLI 下載或執行。
  - Phase 12 Attempt 2 成功通過 `maintenance-server-routes.test.ts`（17 項測試全數通過）。

### 5. 歷史 115 KB 日誌落差事實揭露
- **審查結論：**
  - 早期 Phase 10 Attempt 2 失敗後擅自重跑導致的 115,142 bytes 原始錯誤日誌覆寫毀損，已列入 Task 2.13 歷史違規事件永久揭露。
  - 依賴備份日誌與 grep 輸出完成了因果定性，本審查確認現有 raw 日誌雜湊完好，歷史落差持續透明揭露。

---

## 四、 官方全量聯集等價盤點與執行數據稽核 (Selection Union & Deduplication)

對照官方 dry-run 完整清冊與 15 個 Phase 實跑 raw 日誌，數據盤點完全一致：

### 1. 分組聯集盤點（無重複、無遺漏）
- **General Server (共 1,434 套件)：**
  - `chat-channels.integration.test.ts`（1 套件，內含 6 個 shard，Phases 01–03）
  - Native Runner Suites（9 套件，Phase 08）
  - Server without Chat or Native Runner（1,424 套件，4 個 shard 每片 356 檔，Phases 04–07）
  - **總計：** 1 + 9 + 1,424 = **1,434 套件**。
- **Workspaces 非 Server 專案 (共 20 專案)：**
  - Workspaces-A (Phase 09): 2 個專案 (`@paperclipai/ui`, `paperclipai`)
  - Workspaces-B (Phase 10): 17 個專案 (所有 adapter、plugin、shared、eval 套件)
  - Workspaces-C (Phase 11): 1 個專案 (`@paperclipai/db`)
  - **總計：** 2 + 17 + 1 = **20 專案**。
- **Serialized 循序測試 (共 166 套件)：**
  - Shard 0 (Phase 12): 8 套件
  - Shard 1 (Phase 13): 42 套件
  - Shard 2 (Phase 14): 58 套件
  - Shard 3 (Phase 15): 58 套件
  - **總計：** 8 + 42 + 58 + 58 = **166 套件**。

### 2. 15 個階段實跑帳本與退出碼核對
- 官方規劃之 15 個階段全部以 **Exit Code 0** 結束。
- **通過檔案總數：** 2,912 個測試檔案通過。
- **通過案例總數：** 52,663 項測試案例通過。
- **跳過案例總數：**
  - Chat 行範圍過濾跳過：9,190 項（正常 sharding 機制）。
  - 各套件環境依賴跳過：Workspaces-B 40 項（含平台非適用項目）、Native Runner 23 項（含 14 項容器與 9 項 `realProcessIt`）。

---

## 五、 OpenSpec 任務狀態與後續指引

### 1. 任務盤點現況
- **portable-validation-and-enrollment-regression (23/25 完成)：**
  - 1.1–1.2, 2.1–2.14, 3.1–3.3, 4.1, 4.2, 4.3, 4.4 已勾選 `[x]`。
  - **5.1 嚴格維持未完成 `[ ]`**（因本審查判定 CRITICAL NO-GO）。
  - **5.2 嚴格維持未完成 `[ ]`**（未通過 5.1 審查不得進行最終提交與標記）。
- **pi-single-prompt-summary-dedup (9/10 完成)：**
  - 1.1–1.3, 2.1–2.4, 3.1, 3.2 已勾選 `[x]`。
  - **3.3 嚴格維持未完成 `[ ]`**（待關聯變更完整驗證後方可封存）。

### 2. 嚴格停機宣告
- 本審查員未修改任何專案檔案、未改動任何 task checkbox、未進行 git commit、未執行 push、未移除 PR draft。
- 交付物僅限於本報告檔案。完整流程在此停機，交由專案負責人依指引處置。
