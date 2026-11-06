# Phase 10 控制器硬化 R2、工作區依賴與 Hermes 就緒狀態獨立複審報告

**文件路徑：** `doc/plans/2026-11-06-phase10-hardening-r2-independent-review.md`  
**報告日期：** 2026-11-06  
**審查角色：** 獨立維運審查員（Fresh Independent Ops Reviewer, agy Gemini 3.8 Flash High）  
**模式約制：** 原生檔案工具分析與自含負向測試、零 MCP / Hindsight / Pi / Sonnet / 外部代理、不修改既有已追蹤程式碼與控制器、不修改 Manifest / 快取 / tool-bin / 授權檔、不變更任何權限 (chmod/chown/ACL/flags/global hooks)、不重新掛載或規避任何 deny 規則、嚴格禁止觸發真實全量測試或未授權重跑。所有假子行程控制與負向驗證僅在審查員專屬 scratch (`/private/tmp/pv-phase10-hardening-r2-review`) 進行。使用者指示明確：本輪審查為誠實揭露缺口與維運審查之延續，絕非最終驗收棄權（User go-on = continue truthful gap and proper review, no final acceptance waiver）。

---

## 一、 獨立審查總結與門禁判定（Separate GO / NO-GO Decisions）

| 審查維度 | 判定 | 關鍵事實依據 |
| :--- | :---: | :--- |
| **控制器硬化 (Controller Safeguards R2)** | **GO (VERIFIED)** | R1 所揭露之 3 項 CRITICAL 缺陷已全數修復：1) 授權憑證採用原子排他持久化 Claim（`O_CREAT \| O_EXCL`），20 並行競爭實測僅 1 勝出、19 被拒；2) CLI 目標校驗前置，未知 Phase 立即退出非零且 0 消耗 Token；3) 呼叫目標與授權範圍 1:1 嚴格對齊，全量 No-ops 具備非零守護；4) 歷史日誌 `openSync(..., "wx")` 防覆寫且 Phase 10 序號嚴格 `>= 4`。提出 1 項路徑隔離架構建議（SUGGESTION/WARNING）。 |
| **工作區完整性 (Workspace Completion)** | **GO (VERIFIED)** | `packages/plugins/sdk/dist` 已從 `3f1` 快照完成 APFS 複製至 `56d` 工作樹；遞迴全部 97 個檔案（頂層 76 個 entries）位元組 100% 吻合，且與 R2 產出雜湊清冊 97 筆 100% 符合；雙模 ESM/CJS 預檢腳本驗證通過：17 個專案與 11 項關鍵 subpath 全數 PASS（退出碼 0）；Git 追蹤源碼 100% 保持乾淨。 |
| **權限診斷事實糾正 (Permission Diagnosis Clarification)** | **CONFIRMED** | 再次確認 R1 獨立審查員之診斷完全正確：前次硬化工程師指稱之「作業系統檔案系統強制唯讀」確係誤診。真實原因為 macOS Darwin Seatbelt 沙盒策略對 `.vite-temp` 之寫入阻擋（返回 `EPERM`），非 POSIX 唯讀掛載。 |
| **Hermes 套件就緒狀態 (Hermes Readiness)** | **GO (VERIFIED)** | 查驗官方 Hermes 完整套件測試日誌（`hermes-package-run.log`）與包裝器（`run-hermes-package.mjs`）：在合規授權之 `BypassSandbox: true` 及私有 Python 3.15.2 工具鏈乾淨環境下執行，**10 個測試檔案、174 項測試全數通過（0 failures, 0 skips）**，耗時 10.69 秒，退出碼 0；無安全 hook 規避、無 denied touch 繞過、無主機秘密外洩。 |
| **Phase 10 Attempt 4 單次資格 (Qualify Once-Only Phase 10)** | **CONDITIONAL GO** | 具備啟動單次 Phase 10 Attempt 4 執行之客觀技術條件；**但絕非認證 Phase 10 已經完成**。必須在嚴格鎖定 Phase 10 範圍之專屬授權憑證下執行，且 Tasks 2.12 / 2.13 維持未勾選。 |
| **全量 15 組與最終驗收 (Full 15 Phases & Final Acceptance)** | **STRICT NO-GO** | Tasks 2.12、2.13、4.2–5.2 嚴格維持 PENDING 未勾選；Phases 11–15 從未執行；全量 15 組測試未全數通過前，嚴禁移除 draft、嚴禁 push / merge / archive。 |

---

## 二、 檔案雜湊值與不可變基準比對矩陣

### 1. 控制器與 Manifest 比對

| 項目 | 檔案實體路徑 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :--- | :---: |
| **R2 硬化控制器** | `/private/tmp/pv-full/run-phases.mjs` | `5c97e7a901edfb1e79d53541758396561074bf033316f810e341176daf1ada14` | 吻合 |
| **R1 備份控制器** | `/private/tmp/pv-phase10-hardening-r2/run-phases.mjs.pre-r2.bak` | `bec37319ccfdb2e8558c90a54996f37038134981aed41fa5acb57958650025a8` | 吻合 |
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
- **Homebrew Python 3.15.2:** `/opt/homebrew/Cellar/python@3.15/3.15.2/Frameworks/Python.framework/Versions/3.15/bin/python3.15`  
  `d775520d87f89a19cffe0db3fba17f3caf71d91066e23e5efd7b5bd9dbb975e2`

### 3. 源碼指紋比對（5 個 Pi 檔案與 19 個 PV 檔案）

在快照 `/private/tmp/pv-git-env-fixture-fix`（HEAD: `56d517eeffd24287161329b2f86595dcdef4d165`）現場計算，24 個指紋檔案 100% 吻合 `manifest.sourceFingerprints`，完全無漂移。

---

## 三、 控制器 R2 硬化實體驗證與 30 項獨立負向測試

審查員在專屬隔離目錄 `/private/tmp/pv-phase10-hardening-r2-review/` 撰寫並執行權威控制器原生驗證套件 `review-controls.mjs`，直接調用 `/private/tmp/pv-full/run-phases.mjs` 導出函式，共執行 30 項斷言，結果 **30 / 30 PASSED**。

### 1. 原 R1 3 項重大缺陷（CRITICAL DEFECTS）修復驗收

#### 驗收 1：授權憑證並行競爭修復（Atomic Persistent Claim）
- **機制：** 呼叫 `claimAuthorization` 時，透過 `fs.openSync(path.join(claimDir, `.claim-${auth.authorizationId}.json`), "wx")` 進行核心層排他建立。
- **實體負向證明（Suite 1）：** 啟動 20 個平行 Worker 同時競爭同一 Token：
  - **Winners:** 1 行程成功建立 Claim 檔案並退出 0。
  - **Denied:** 19 行程遭遇 `EEXIST` 拋出 `FAIL-CLOSED: Single-use authorization ... has already been claimed` 並退出非零。
  - **結論：** 徹底消除 R1 之 TOCTOU 競爭漏洞。

#### 驗收 2：範圍檢查省略漏洞修復（Scope Enforcement）
- **機制：**
  - 當呼叫者未提供 CLI `targetPhaseId`（要求跑全部）時，控制器檢查 `auth.targetPhaseId` 必須等於 `"all"`，若 Token 限制於特定 Phase 則拋錯拒絕。
  - 當呼叫者指定 `targetPhaseId` 時，`auth.targetPhaseId` 必須相符。
- **實體負向證明（Suite 4）：**
  - 限制於 `phase-10` 之 Token 在省略 CLI 參數時被拒絕（拋出 `Exact approval match required; token cannot implicitly authorize all`）。
  - 限制於 `phase-10` 之 Token 在傳入 `phase-11` 時被拒絕（拋出 `does not match requested`）。

#### 驗收 3：虛構 Phase 燒毀 Token 且 Exit 0 假綠燈修復（Pre-Claim Phase Validation）
- **機制：** 將 Manifest Phase 比對與候選驗證完全移至 `claimAuthorization` 之前。
- **實體負向證明（Suite 2）：**
  - 傳入虛構 Phase ID（`non-existent-bogus-phase`），控制器在 Claim 發生前拋出 `FAIL-CLOSED: Requested target phase ... does not exist in manifest`。
  - 驗證磁碟：**Token 檔案之 `consumed` 維持 `false`，磁碟無任何 Claim 檔案產生**，0 Token 燒毀，退出非零。

### 2. 補充安全機制驗收

- **Anti-No-Op Guard（Suite 3）：** 當請求之 Phase 狀態已全數為 `PASSED` 時，控制器於 Claim 前拋出 `FAIL-CLOSED: Guard: All requested phase(s) are already PASSED. CLI no-ops cannot exit 0 success`，禁止假成功退出。
- **防回滾持久化（Suite 5）：** 模擬將 `auth.json` 還原為未消耗狀態，後續呼叫直接命中所留存之 `.claim-${id}.json` 檔案而拒絕重播。
- **日誌排他建立與別名不覆寫（Suite 7）：** `fs.openSync(..., "wx")` 確保若日誌已存在立即拋出 `EEXIST`，0 位元組歷史日誌受損。
- **Phase 10 序號下限（Suite 8）：** 空 attempts 下計算 Phase 10 之 Next Attempt 序號強制 `>= 4`（實測為 5，符合預期）。
- **訊號處理與串流刷新（Suite 9）：** 遭遇 SIGTERM 時退出碼正確對齊為 `143`，子行程標準輸出在退出前完整 flush 至磁碟日誌。

### 3. 審查員發現之重要架構觀察與警示（WARNING / SUGGESTION）

#### 觀察 A（WARNING）：授權檢查中可選欄位之跳過機制與實際 Manifest 欄位綁定
- **分析：** 在 `validateAuthorizationAndScope` 中：
  ```javascript
  if (auth.expectedGitHead && auth.expectedGitHead !== manifest.git.head) { ... }
  if (auth.expectedGitTree && auth.expectedGitTree !== manifest.git.tree) { ... }
  if (auth.toolMatrixDigest) { ... }
  if (auth.argvDigest) { ... }
  ```
  控制器使用 `if (auth.field && ...)` 避免了 `undefined == undefined` 的誤判；**但若授權 JSON 漏填這些欄位，該項防禦將被靜默跳過**。
- **衝擊與緩解：** 為防止後續整合者製造無約束的空白授權檔，本報告第七節提供嚴格型別定義與必填宣告，後續生成授權檔時必須填滿所有摘要欄位。

#### 觀察 B（SUGGESTION）：Claim 檔案目錄與授權檔路徑相依性
- **分析：** 控制器中 `const claimDir = path.dirname(authPath)`。若攻擊者或維運者將同一 Token 拷貝至不同目錄（如 `/tmp/dir1/auth.json` 與 `/tmp/dir2/auth.json`）並發起呼叫，Claim 檔案將分別寫入各目錄，彼此無法互鎖。
- **改善建議：** 後續演進可將 `claimDir` 固定綁定於集中目錄（如 `/private/tmp/pv-full`），或強制 `--run-authorization` 必須位於宣告之安全路徑下。目前維運規範明訂：所有授權檔統一置於 `/private/tmp/pv-full/.run-authorization.json`。

#### 觀察 C（CRITICAL COMPATIBILITY NOTE）：Git Tree 物件與 Manifest 字串之差異
- **分析：**
  - Commit `56d517eeffd2` 之實際 Git Tree 物件雜湊為：`faa45f1d9342a834539a76c8f9d26015cf263710`。
  - 但現行 Manifest（`dab8ee3f`）內記錄之 `manifest.git.tree` 字串為：`faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5`。
  - 控制器比對係使用 `auth.expectedGitTree !== manifest.git.tree`。
- **結論：** 授權檔必須提供與 Manifest 記錄完全一致的字串 `"faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5"`，否則將觸發 Fail-Closed。

---

## 四、 工作區相依快取補全與 R1 誤診確認

### 1. `packages/plugins/sdk/dist` APFS 複製驗證

- **檔案數量：** 遞迴檔案數共 97 個；頂層 entries（含 hidden）共 76 個。
- **位元組一致性：** 與 `3f1` 快照（`/private/tmp/pv-load-fixture-fix/packages/plugins/sdk/dist`）逐檔比對，97 個檔案位元組 100% 相同。
- **產出雜湊比對：** 與 `/private/tmp/pv-phase10-hardening-r2/sdk-dist-hash-manifest.json` 所記錄之 97 筆 SHA-256 逐一比對，**97 / 97 MATCH（0 mismatches）**。
- **Git 狀態：** `git -C /private/tmp/pv-git-env-fixture-fix status --porcelain` 輸出為空；該目錄確實受 `.gitignore` 忽略，無追蹤程式碼受污染。

### 2. 雙模 ESM/CJS 工作區預檢腳本執行成果

執行 `/private/tmp/pv-phase10-hardening-r2/workspace-precheck.mjs`：
- **結果：** 17 個專案模組相依全數 PASS，0 errors。
- **子路徑回歸：** 包含 `@paperclipai/adapter-utils/execution-target`、`local-process-sandbox`、`openrouter-attribution` 等 11 項關鍵 subpath 全數正確解析。
- **退出碼：** `0`。

### 3. R1 獨立審查員之權限診斷再次確認

R1 獨立審查員明確指出：
1. 工作樹檔案系統掛載為 APFS 可讀寫分割區，POSIX 為 `0755`，無 BSD 不可變旗標。
2. Vitest 執行時之 `EPERM` 係 macOS Darwin Seatbelt 沙盒阻擋寫入 `.vite-temp`。
3. 外層 `touch` 拒絕係代理人 pre-tool hook 攔截。
R1 審查員之上述診斷完全正確，前次硬化工程師宣稱之「OS-strict-readonly」確屬誤診。

---

## 五、 Hermes 全量套件測試執行成果查驗

審查員依照「不無謂重跑全量 Hermes 測試，僅審閱日誌與包裝腳本」之指示，深入查驗 `/private/tmp/pv-phase10-hardening-r2/hermes-package-run.log`：

- **測試執行命令：** `node run-hermes-package.mjs`（`BypassSandbox: true`，使用者合法授權）
- **執行耗時：** 10.69 秒
- **退出碼：** `0`
- **測試統計：**
  - **Test Files:** 10 passed (10 total)
  - **Tests:** 174 passed (174 total)
  - **Failures:** 0
  - **Skips:** 0
- **乾淨環境驗證：**
  - 專屬乾淨目錄 `HOME=/private/tmp/pv-phase10-hardening-r2/cleanhome`。
  - PATH 首位納入私有 Python 3.15.2 工具鏈（`/private/tmp/pv-phase10-hardening/python-bin`），確保解析之 `python3` 版本 `>= 3.10`。
  - 顯式清除 `NODE_OPTIONS`、`GITHUB_ACTIONS` 等宿主環境變數。
  - 零主機金鑰或秘密外洩。
- **結論：** Hermes 套件在 Python 3.15.2 下已具備完整通過之實體證據。

---

## 六、 歷史斷層揭露與邏輯歷程遷移提案

### 1. 歷史事實誠實鎖定

- **115KB 原始日誌毀損：** 2026-11-05 21:54 因前次違規重跑被 `fs.createWriteStream(..., { flags: "w" })` 覆寫，原始 child stdout 實體檔案已永久毀損。
- **復原證據：** 外層 `task-300.log`（1,313 bytes，SHA256: `2ca0f580...`）與前次 session grep 紀錄 `step-331-output.txt`（12,362 bytes，SHA256: `6ae5827f...`）已永久封存。
- **現行 Manifest：** `/private/tmp/pv-full/manifests/phase-manifest.json` 與 mirror 保持 2 筆紀錄（SHA: `dab8ee3f...`），未擅自改寫。
- **Attempt 2 日誌：** `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.attempt2.log`（152,544 bytes，SHA: `362cae7e...`）保持鎖定。

### 2. 四階段邏輯歷程定義

| 邏輯階段 | 對應嘗試 | 測試快照 | 退出狀態 | 關鍵失敗特徵 | 日誌證據狀態 |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Logical 1** | Attempt 1 | `3f1eb1b7b` | exit 1 | `github-launcher-environment.test.ts` 與 Clean-env 合成 GIT_CONFIG_GLOBAL 斷言衝突 | 99,074 bytes，SHA: `707f0aa8...` |
| **Logical 2** | Attempt 2 (Run 1) | `56d517eeffd` | exit 1 | 新快照缺少 ignored `node_modules`，跨專案相依解析中斷（17 suites failed） | 原始 115,142 bytes 毀損，由 `task-300` 與 `step-331` 證據佐證 |
| **Logical 3** | Attempt 2 (Run 2) | `56d517eeffd` | exit 1 | 違規重跑；Hermes 因 PATH 先載入 `/usr/bin/python3` (3.9.6 < 3.10) 失敗 | 152,544 bytes，SHA: `362cae7e...` |
| **Logical 4** | **Attempt 4 (未來)** | `56d517eeffd` | *待執行* | 補全 `sdk/dist`、配置 Python 3.15.2、單次授權互鎖 | *尚未執行，序號 `>= 4`* |

---

## 七、 相容性授權檔規格與單次 Phase 10 執行指引

為防止後續整合者製造無約束或欄位發明的授權檔，本審查員依據控制器原始碼與 Manifest 提供嚴格相容之規格與具體內容。

### 1. 相容性授權檔 JSON 具體範本 (`run-authorization.json`)

**建議存放路徑：** `/private/tmp/pv-full/.run-authorization.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "authorizationId": "auth-phase10-attempt4-20261106-bound",
  "targetPhaseId": "phase-10-general-workspaces-b",
  "expectedGitHead": "56d517eeffd24287161329b2f86595dcdef4d165",
  "expectedGitTree": "faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5",
  "toolMatrixDigest": "68c215e913cd3152d1525bbc1cbba45c0bd6f6a35f3da5511c4a9322f3ad5fcc",
  "argvDigest": "b69705f8acc21efa6917a82280712408f435982e2bf2341545ab40d8ee255745",
  "approvedBy": "independent-ops-review-session-f2d5acef",
  "approvedAt": "2026-11-06T08:50:00.000Z",
  "notes": "Strictly scoped one-use run authorization for Phase 10 Attempt 4"
}
```

### 2. 欄位型別與摘要演算法定義

| 欄位名稱 | 型別 | 產生方式與驗證規則 |
| :--- | :--- | :--- |
| `authorizationId` | string (必填) | 唯一識別字串。控制器以 `wx` 建立 `.claim-${authorizationId}.json`，保證單次使用。 |
| `targetPhaseId` | string (必填) | 必須固定為 `"phase-10-general-workspaces-b"`。嚴禁為 `"all"` 或省略。 |
| `expectedGitHead` | string (必填) | 必須為 `"56d517eeffd24287161329b2f86595dcdef4d165"`（吻合 `manifest.git.head`）。 |
| `expectedGitTree` | string (必填) | 必須為 `"faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5"`（吻合 `manifest.git.tree`）。 |
| `toolMatrixDigest` | string (必填) | `crypto.createHash("sha256").update(JSON.stringify(manifest.tools)).digest("hex")`。現行 Manifest 計算值為 `68c215e913cd3152d1525bbc1cbba45c0bd6f6a35f3da5511c4a9322f3ad5fcc`。 |
| `argvDigest` | string (必填) | `crypto.createHash("sha256").update(phase10.fullArgv.join(" ")).digest("hex")`。現行 Manifest 計算值為 `b69705f8acc21efa6917a82280712408f435982e2bf2341545ab40d8ee255745`。 |
| `approvedBy` | string (審計) | 審查員或操作者識別字串。 |
| `approvedAt` | string (審計) | ISO-8601 時間戳記。 |

### 3. 未來單次 Phase 10 執行之精確 CLI 命令

當使用者決定授予執行權限時，必須於合法授權之 `BypassSandbox: true` 模式下執行以下命令：

```bash
env \
  PAPERCLIP_MANIFEST_PATH=/private/tmp/pv-full/manifests/phase-manifest.json \
  PAPERCLIP_MIRROR_MANIFEST_PATH=/private/tmp/pv-full/phase-manifest.json \
  PAPERCLIP_LOGS_DIR=/private/tmp/pv-full/logs \
  PATH="/Users/Hermes/.nvm/versions/node/v24.18.0/bin:/private/tmp/pv-phase10-hardening/python-bin:/private/tmp/pi-dedup-git-toolchain/bin:/private/tmp/pi-dedup-rust-toolchain/cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" \
  node /private/tmp/pv-full/run-phases.mjs phase-10-general-workspaces-b \
  --run-authorization /private/tmp/pv-full/.run-authorization.json
```

---

## 八、 門禁狀態與交接結論

1. **控制器 R2 硬化判定：GO**。3 大重大缺陷修復完畢，並行競爭由原子持久化 Claim 鎖定，負向控制 30/30 通過。
2. **工作區相依性判定：GO**。`sdk/dist` 97 產出補齊且雜湊 100% 吻合，17 專案預檢退出 0。
3. **Hermes 就緒狀態判定：GO**。官方全套件 10 files、174 tests 通過，日誌已存檔。
4. **Phase 10 Attempt 4 資格判定：CONDITIONAL GO**。在宣告之專屬授權憑證與 Python 3.15 工具鏈下，具備單次重跑之資格；**但絕不能視為已完成**。
5. **Phase 10 全量完成與後續階段判定：STRICT NO-GO**：
   - OpenSpec Task 2.12：**PENDING**（未勾選）。
   - OpenSpec Task 2.13：**PENDING**（未勾選，直到 Phase 10 全 17 專案 exit 0）。
   - OpenSpec Tasks 4.2–5.2：**PENDING / STRICT NO-GO**。
   - Phases 11–15：**NOT_RUN**。
   - 嚴禁移除 draft、嚴禁自動合流或歸檔。
