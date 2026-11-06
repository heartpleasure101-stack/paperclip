# Portable Validation & Pi Summary Dedup 最終獨立複審報告 (Final Independent Re-Review Report)

**報告日期：** 2026-11-06  
**審查員：** 獨立最終複審員（Fresh Full Independent Final Re-Auditor, agy Gemini 3.8 Flash High）  
**審查約束：** 原生唯讀工具（Native read-only inspection）、嚴格零 MCP / Hindsight / Pi / Sonnet / 外部子代理；不重跑昂貴全量測試、不重新安裝/下載套件、不執行真實 Cursor/Copilot/Vendor CLI、不修改專案生產程式碼/規範/任務清冊/Manifest/Controller；僅寫入本報告於指定獨立路徑 `/private/tmp/pv-final-independent-rereview/2026-11-06-portable-validation-final-independent-rereview.md`。  
**審查基準快照：**
- **主工作區（Original Summary HEAD）：** `/Volumes/AI/projects/paprerclip-v2` (`ae8a8db3960ffbb6feaa60377946d1f53109ba72`，工作區乾淨，0 uncommitted entries）
- **凍結驗證快照（Frozen Test Snapshot）：** `/private/tmp/pv-git-env-fixture-fix` (`56d517eeffd24287161329b2f86595dcdef4d165`，Git Tree: `faa45f1d9342a834539a76c8f9d26015cf263710`，0 uncommitted entries）
- **歷史保留工作區與梯次真實提交：**
  - Cohort 1 (Phases 01–06): `/private/tmp/paperclip-portable-validation` (`cc56bbcd30a7de1a78a92b108dba772d3c02a500`，Tree `37295d5b275b63408b4c9d57ad9c76382c1f18e7`)
  - Cohort 2 (Phases 07–09): `/private/tmp/pv-load-fixture-fix` (`3f1eb1b7b364893141818d25569d60206ea36ccb`，Tree `4cf612e25dfcaca94cbfd7539922b9fe4a77cd1f`；已自 Git 實體驗證，非筆誤之 `3f1917...` 或幽靈 tree `d5cff774...`)
  - Cohort 3 (Phases 10–15): `/private/tmp/pv-git-env-fixture-fix` (`56d517eeffd24287161329b2f86595dcdef4d165`，Tree `faa45f1d9342a834539a76c8f9d26015cf263710`)
- **集中執行記錄與 Manifest：** `/private/tmp/pv-full/manifests/phase-manifest.json` 與 `/private/tmp/pv-full/phase-manifest.json`（SHA-256: `6ca93c9cf731132eb5d2e92ad0d298d648651033677b258500813256f8a471d6`）
- **同行審查報告保全：** `doc/plans/2026-11-06-portable-validation-final-independent-review.md`（SHA-256: `db3dffc3a2a61337ef64b36405d397f3ef7493c017031d72751d5cbc4fabb6c8`，逐 byte 相同鏡像）

---

## 一、 獨立審查總評與最終門禁決策 (Gate Verdicts)

| 審查標的 | 門禁判定 | 核心判定依據 |
| :--- | :---: | :--- |
| **Pi 單一摘要去重 (pi-single-prompt-summary-dedup)** | **GO (ACCEPT)** | 原始 5 個源碼檔案自 `a240beb69` 起至 `HEAD`（`ae8a8db39`）100% 保持未動（0 diff）。功能嚴格雙向精確比對、預設關閉、僅 Pi 顯式啟用（`execute.ts:690`）、無任何其他適配器副作用。控制字元保護完整，字元位元組 8,506 → 5,455 節省如實界定為合成 UTF-8 數據，未虛報 live token/成本。規格 scenario 100% 滿足。 |
| **可攜式驗證與入職迴歸 (portable-validation-and-enrollment-regression)** | **GO (ACCEPT)** | **前次重大缺陷 [CRITICAL-1] 徹底解決：** 於凍結快照 `56d517...` 下，維運者以 clean-env 離線編譯 `fake-codex-app-server` debug fixture（2,385,352 bytes，SHA-256 `8f54ab99...`），與正式 runner `paperclip-runnerd` 雙實體皆備。Phase 08 Attempt 2 完整重跑 9 個 Native 套件，0 套件跳過，172 項測試全通、14 項容器相依合法跳過。先前缺 fixture 跳過之 9 項測試（`diskless` 2 項、`checkpoint-cost` 1 項實體 Postgres 寫入、`recovery` 6 項行程級別測試）**全數真實執行並 PASS exit 0**。全庫 15 個階段全數 PASSED exit 0，Gate 4.2 建置/型別檢查 35 專案全數 exit 0。 |
| **OpenSpec 任務封存與交付授權 (Task 5.1 / 5.2 / 3.3)** | **QUALIFIED READY** | **Task 5.1 獨立審查判定通過**。依據審查合約，審查員不擅自修改任何專案檔案或勾選 checkbox。Task 5.2、Pi Task 3.3、PR draft 移除、git push 與 OpenSpec archive 嚴格**尚未完成**，本報告授權專案主控者在完成 Task 5.2 交付步驟並核對源碼指紋後，正式進行交付與封存。 |

---

## 二、 前次 CRITICAL 缺陷修復驗收明細 (Prior Critical Resolution)

### 1. [CRITICAL-1] 解決判定：PASSED (100% COVERED)
- **問題回顧：** 前次審查發現 `native-restart.ts:25-31` 因缺少未編譯之 `fake-codex-app-server` fixture 二進位檔，導致 `binariesAvailable` 為 `false`，使 `diskless`（2 測試）、`checkpoint-cost`（1 測試）及 `recovery`（6 測試）共 9 項行程測試被靜默跳過。
- **修復驗證事實：**
  1. **離線編譯溯源：** 維運者於不可變快照 `56d517eeffd24287161329b2f86595dcdef4d165` 下，以 Rust 1.97 clean-env 執行 `cargo build --manifest-path packages/paperclip-runner/runner/Cargo.toml --locked -p paperclip-runner-core --bin fake-codex-app-server`。
     - 建置日誌：`/private/tmp/pv-native-coverage-operation/cargo-build-fake-codex-app-server.raw.log`（9,135 bytes，SHA-256 `91365471...`，耗時 56.94s，exit 0）。
     - 二進位產物：`runner/target/debug/fake-codex-app-server`（2,385,352 bytes，`-rwxr-xr-x`，SHA-256 `8f54ab996065a8f411a21b0695bf43bde1dd5462c4394feb0b7732eff9c9dd35`）。
     - 正式 Runner 二進位：`dist/bin/paperclip-runnerd`（30,640,752 bytes，`-rwxr-xr-x`，SHA-256 `e25e98ce3c6e0f02d3e5df7a5815666f7c695f0532bc74c80a7ecc5758c5a2e3`）。
  2. **單次授權與原子 Claim：**
     - 授權檔：`/private/tmp/pv-native-coverage-operation/run-authorization.phase08.attempt2.json`（ID: `auth-phase08-native-runner-attempt2-20261106-bound-op-gemini`）。
     - 原子 Claim：`/private/tmp/pv-full/logs/.authorization-claims/auth-phase08-native-runner-attempt2-20261106-bound-op-gemini.claim.json`（pid: 88177，`O_CREAT | O_EXCL` 建立）。
  3. **Phase 08 Attempt 2 實跑日誌與退出碼：**
     - 日誌路徑：`/private/tmp/pv-full/logs/phase-08-general-server-native-runner.attempt2.log`（29,259 bytes，SHA-256 `8d9911220b8eb18bd0ca5237c50335f77a9c8712a27fd1bb135a86563bb872d5`）。
     - 耗時：262.9s，**Exit Code: 0**。
     - 套件統計：9 passed, 0 skipped, 0 failed（9 total，先前跳過之 2 個套件全數進入執行並通過）。
     - 測試統計：172 passed, 14 skipped, 0 failed（186 total）。

### 2. 先前漏跑之 9 項測試名稱逐一核對 (Raw Exact Test Names Verification)
經逐行核對 raw 日誌，先前被 `realProcessIt` 跳過的 9 項測試全部真實執行且 PASS：
1. **`native-runner-restart-checkpoint-cost.integration.test.ts` (1 項，耗時 194.4s)：**
   - `✓ keeps checkpoint SQL independent of streamed output volume with a real Postgres writer`
   - *真實指標：* 啟動實體 Postgres 寫入器，完成 8 chunks、512 chunks 及 8,192 chunks 採樣基準（8,192 chunks 產出 walBytes: 8,628,040，checkpointWrites: 7），SQL checkpoint 行為完全不受串流輸出量膨脹影響。
2. **`native-runner-restart-diskless.integration.test.ts` (2 項，耗時 152.8s)：**
   - `✓ adopts the same runner from Postgres after losing the controller filesystem (prepared task: false)` (71.6s)
   - `✓ adopts the same runner from Postgres after losing the controller filesystem (prepared task: true)` (75.9s)
3. **`native-runner-restart-recovery.integration.test.ts` (6 項 `realProcessIt`)：**
   - `✓ durably retires an accepted warm Runner while its same-controller successor prepares` (1441ms)
   - `✓ adopts one active runner across hot and hard controller restarts without duplicating steering` (2518ms)
   - `✓ hard-restarts a dead runner with a current prompt on the same run and provider session` (2481ms)
   - `✓ hot-restarts a dead runner with a historical prompt on the same run and provider session` (2364ms)
   - `✓ hot-restarts a dead runner with a unregistered prompt on the same run and provider session` (2313ms)
   - `✓ quarantines a pre-auth runner root and bootstraps the same run` (1246ms)

### 3. 保留 14 項跳過之正當性審查 (Legitimate Container Skips)
- `native-runner-restart-recovery.integration.test.ts` 第 155 行：
  `it.skipIf(!process.env.PAPERCLIP_TEST_RUNNER_CONTAINER).each([...14 scenarios...])("preserves remote warm continuity across completed turns: %s", ...)`
- 包含 14 個情境：`warm`, `hard`, `finalizer-wait`, `warm-suspended`, `stale-projection`, `legacy`, `changed`, `same-server`, `diskless`, `diskless-per-turn`, `diskless-per-turn-read-retry`, `diskless-warm-suspended`, `diskless-warm-suspended-read-retry`, `diskless-live-inspection`。
- 查核結論：該 14 項測試明確由外部容器環境變數守護，為合理的可選外部環境相依（Docker/Podman），絕非假造的 CI skip flag，在離線 macOS 本機上跳過具備完整合約正當性。

---

## 三、 發現事項評級清單 (Findings: Critical / Warning / Suggestion)

### 1. CRITICAL (重大阻擋事項)
- **無 (NONE)**。先前唯一之 [CRITICAL-1] 已具備完整可重現之離線建置與實跑 exit 0 證據，予以結案。

### 2. WARNING (警示性事項與歷史偏差揭露)
- **[WARNING-1] 作者報告文字勘誤已正式記錄，同行審查報告保持逐 byte 不變**
  - 作者報告 `2026-11-06-final-three-verification.md` §八 正式登錄勘誤：
    1. 梯次 2 Commit 雜湊筆誤更正為 `3f1eb1b7b364893141818d25569d60206ea36ccb`，Git Tree 更正為 `4cf612e25dfcaca94cbfd7539922b9fe4a77cd1f`。
    2. Chat 測試檔名更正為 `server/src/__tests__/chat-channels.integration.test.ts`。
    3. 「24 項指紋全梯次一致」精確界定為「全庫生產與共用程式碼 100% byte-identical，2 項測試 fixture 依已審查之 PR 合法演進」。
  - 同行報告 `2026-11-06-portable-validation-final-independent-review.md` 逐 byte 鏡像至 `doc/plans/`（SHA-256 `db3dffc3...` 嚴格未動）。
- **[WARNING-2] 早期 Phase 10 覆寫之 115 KB 日誌永久不可復原**
  - 歷史 Phase 10 Attempt 2 失敗後未經保護之重跑導致 115,142 bytes 原始錯誤日誌覆寫毀損。使用者先前在對話中提示之 "go on" 為流程繼續指令，**絕不代表原始證據已復原或安全免責（Not evidence recovery / not security waiver）**。本審查維持此項歷史缺陷之永久揭露，現存 partial task log (300 行) 與 grep 輸出 (331 行) 為其獨立存證。
- **[WARNING-3] 歷史真實 Cursor 下載與非 OS Sandbox 環境邊界**
  - 歷史 638MB Cursor CLI 下載與執行事件中，當時繼承之環境變數暴露狀態為 **UNKNOWN**，**不給予安全全綠背書（No security all-clear）**。
  - 現行防護確認：5 個 fake runner 註冊完備、未知命令拒絕執行（`INSTALL_BLOCKED_MESSAGE`）、stdin 阻絕、clean-env 清除主機密鑰。但必須明確聲明：此機制依賴行程環境過濾，**並非作業系統核心級別之 OS Sandbox，亦不提供 SSH Agent 或 macOS Keychain 隔離**。
- **[WARNING-4] Copilot 離線資產依賴固定快取**
  - Copilot runtime 資產由已驗證之固定快取 pins（SHA-256 `dd486bd8...`）離線準備，Gate 0 成功進入 `verified-existing` 分支，Phase 12 17 項路由測試全數通過，無即時網路請求或真實二進位執行。
- **[WARNING-5] 文件與路徑規範之飾性項目 (Cosmetic Allowances)**
  - 任何關於 Scalar README 或文檔檔名之警示均屬非功能性之裝飾性項目，不構成破壞性變更，允許合格通過。

### 3. SUGGESTION (流程改進建議)
- **[SUGGESTION-1] 強化自動化雜湊校驗以杜絕人工抄寫誤差**
  - 後續驗證報告中所有 commit、tree 及日誌雜湊建議全面改以驗證腳本自動抽取並渲染 markdown 表格，避免人工填寫產生筆誤。

---

## 四、 官方全量聯集等價盤點與執行數據稽核 (Selection Union & Deduplication)

對照官方 dry-run 完整清冊與 15 個 Phase 實跑最新 manifest 與 raw 日誌，數據重算盤點完全精確吻合：

### 1. 分組聯集盤點（無重複、無遺漏，合計 1,620 測試目標）
- **Serialized 循序測試 (共 166 套件)：**
  - Shard 0 (Phase 12): 8 套件
  - Shard 1 (Phase 13): 42 套件
  - Shard 2 (Phase 14): 58 套件
  - Shard 3 (Phase 15): 58 套件
  - **小計：** 8 + 42 + 58 + 58 = **166 套件**。
- **General Server (共 1,434 套件)：**
  - `chat-channels.integration.test.ts`（1 套件，內含 6 個 shard，Phases 01–03）
  - Native Runner Suites（9 套件，Phase 08 Attempt 2）
  - Server without Chat or Native Runner（1,424 套件，4 個 shard 每片 356 檔，Phases 04–07）
  - **小計：** 1 + 9 + 1,424 = **1,434 套件**。
- **Workspaces 非 Server 專案 (共 20 專案)：**
  - Workspaces-A (Phase 09): 2 個專案 (`@paperclipai/ui`, `paperclipai`)
  - Workspaces-B (Phase 10): 17 個專案 (所有 adapter、plugin、shared、eval 套件)
  - Workspaces-C (Phase 11): 1 個專案 (`@paperclipai/db`)
  - **小計：** 2 + 17 + 1 = **20 專案**。
- **總計：** 166 + 1,434 + 20 = **1,620 執行目標**。

### 2. 15 個階段最新實跑帳本與退出碼核對
Manifest 與 Raw 日誌實體重算總計如下：

| Phase ID | 分組名稱 | Shard | 狀態 | Exit | 耗時 | Files (P/F/S/T) | Tests (P/F/S/T) | 真正測試 Commit |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `phase-01-general-chat-shard-0` | general-chat (shards 0-1) | 0 | **PASSED** | 0 | 273.3s | 2/0/0/2 | 574/0/3102/3676 | `cc56bbcd30a7...` |
| `phase-02-general-chat-shard-1` | general-chat (shards 2-3) | 1 | **PASSED** | 0 | 275.7s | 2/0/0/2 | 653/0/3023/3676 | `cc56bbcd30a7...` |
| `phase-03-general-chat-shard-2` | general-chat (shards 4-5) | 2 | **PASSED** | 0 | 232.8s | 2/0/0/2 | 611/0/3065/3676 | `cc56bbcd30a7...` |
| `phase-04-general-server-shard-0` | general-server (shard 0) | 0 | **PASSED** | 0 | 1242.1s | 351/0/5/356 | 7256/0/15/7271 | `cc56bbcd30a7...` |
| `phase-05-general-server-shard-1` | general-server (shard 1) | 1 | **PASSED** | 0 | 1378.0s | 348/0/8/356 | 6440/0/78/6518 | `cc56bbcd30a7...` |
| `phase-06-general-server-shard-2` | general-server (shard 2) | 2 | **PASSED** | 0 | 837.9s | 350/0/6/356 | 6288/0/135/6423 | `cc56bbcd30a7...` |
| `phase-07-general-server-shard-3` | general-server (shard 3) | 3 | **PASSED** | 0 | 929.7s | 350/0/6/356 | 9946/0/49/9995 | `3f1eb1b7b364...` |
| `phase-08-general-server-native-runner` | general-server-native-runner | - | **PASSED** | 0 | 262.9s | 9/0/0/9 | 172/0/14/186 | `56d517eeffd2...` |
| `phase-09-general-workspaces-a` | general-workspaces-a (UI, CLI) | - | **PASSED** | 0 | 283.1s | 929/0/0/929 | 11113/0/0/11113 | `3f1eb1b7b364...` |
| `phase-10-general-workspaces-b` | general-workspaces-b (17 pkgs) | - | **PASSED** | 0 | 212.4s | 333/0/4/337 | 5523/0/40/5563 | `56d517eeffd2...` |
| `phase-11-general-workspaces-c` | general-workspaces-c (db) | - | **PASSED** | 0 | 125.9s | 72/0/0/72 | 313/0/0/313 | `56d517eeffd2...` |
| `phase-12-serialized-shard-0` | serialized routes (shard 0) | 0 | **PASSED** | 0 | 302.0s | 8/0/0/8 | 89/0/0/89 | `56d517eeffd2...` |
| `phase-13-serialized-shard-1` | serialized routes (shard 1) | 1 | **PASSED** | 0 | 374.9s | 42/0/0/42 | 964/0/0/964 | `56d517eeffd2...` |
| `phase-14-serialized-shard-2` | serialized routes (shard 2) | 2 | **PASSED** | 0 | 490.0s | 58/0/0/58 | 1208/0/0/1208 | `56d517eeffd2...` |
| `phase-15-serialized-shard-3` | serialized routes (shard 3) | 3 | **PASSED** | 0 | 618.9s | 58/0/0/58 | 1522/0/0/1522 | `56d517eeffd2...` |
| **全量總計 (TOTAL)** | **15 階段全量** | - | **ALL PASSED** | **0** | **7839.7s** | **2914/0/29/2943** | **52672/0/9521/62193** | - |

- **跳過案例真實性質剖析：**
  - **Chat 分片行過濾跳過：** 9,190 項（Phase 01: 3,102; Phase 02: 3,023; Phase 03: 3,065），為 Vitest `--shard-count=6` 針對超大單檔（70,000+ 行）之分片過濾，全檔 1,838 項測試已 100% 執行通過，非功能跳過。
  - **外部平台/環境依賴跳過：** 331 項（包含 Phase 08 容器專屬測試 14 項，Phase 10 平台專屬測試 40 項，以及 Server 各分片環境跳過）。
  - **漏編譯/缺陷跳過：** **0 項**。

### 3. Gate 4.2 全量建置與型別檢查驗收
- **建置 (Build)：** 35 個 workspace 專案循序建置全通，Exit Code: 0，日誌 SHA-256 `ba76eecfecd581bbba21b68c18a058a41b1b3a92c1ea6454eb9a73b52d7d8bac`。
- **型別檢查 (Typecheck)：** 35 個 workspace 專案循序檢查全通，Exit Code: 0，日誌 SHA-256 `daa6e988d17ec6480a05e5366605377616d23d1b8f784c8358b8f4e00a1aa4b1`。
- **工具鏈版本矩陣：**
  - Native Runner Suite: 系統內建 Python 3.9.6 (`/usr/bin`)，Rust 1.97.1，Node v24.18.0。
  - Phase 10 (Workspaces-B): 獨立綁定 Python 3.15（符合 Hermes 及其套件 `>= 3.10` 之需求）。

---

## 五、 OpenSpec 任務狀態盤點與後續處置指引

### 1. 任務現況盤點
- **portable-validation-and-enrollment-regression (共 25 項)：**
  - 已完成 (23 項)：1.1–1.2, 2.1–2.15, 3.1–3.3, 4.1–4.4。
  - **待辦 (2 項)：**
    - **5.1 獨立審查：** 本複審判定 **GO**，但本審查員嚴格不擅自修改檔案勾選。
    - **5.2 交付與提交：** 待專案主控者提交與更新 PR 描述。
- **pi-single-prompt-summary-dedup (共 10 項)：**
  - 已完成 (9 項)：1.1–1.3, 2.1–2.4, 3.1, 3.2。
  - **待辦 (1 項)：**
    - **3.3 最終交付與封存：** 待關聯驗證完成後統一交付。

### 2. 嚴格唯讀停機聲明
- 本審查員為全新獨立角色，未動用任何 MCP、記憶體、外部子代理。
- 專案程式碼、測試檔案、Manifest、日誌、task 清冊 100% 保持唯讀未動。
- 嚴格未執行 git commit、git push、PR draft 變更或 OpenSpec archive。
- 交付物僅限於本報告檔案 `/private/tmp/pv-final-independent-rereview/2026-11-06-portable-validation-final-independent-rereview.md`。

---

## 六、 結論與下一階段授權指引 (Final Authorization Guidance)

1. **Portable Validation (Task 5.1):** **GO (ACCEPT)**
2. **Pi Summary Dedup (Task 3.2 / 全特性):** **GO (ACCEPT)**
3. **後續交付步驟授權：**
   專案主控者在接獲本報告後，可授權執行以下最終有界交付程序：
   - 標記 Task 5.1 為 `[x]`。
   - 執行 Task 5.2：依規格將驗證證據、文檔與回滾指引正式 commit 並 push 至使用者 PR 分支，更新 PR 描述。
   - 標記 Task 3.3 為 `[x]`，執行 OpenSpec 規格同步與封存程序。
   - 移除 PR draft 標記。
   *(注意：上述步驟嚴格禁止在此審查階段提前宣稱完成)*。
