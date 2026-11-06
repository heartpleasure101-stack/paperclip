# Phase 10 控制器硬化 R3、審計修復提案與單次 Phase 10 Attempt 4 執行資格獨立複審報告

**文件路徑：** `doc/plans/2026-11-06-phase10-hardening-r3-independent-review.md`  
**報告日期：** 2026-11-06  
**審查角色：** 獨立維運審查員（Fresh Independent Ops Reviewer, agy Gemini 3.8 Flash High）  
**模式約束：** 原生檔案工具分析與自含負向測試、零 MCP / Hindsight / Pi / Sonnet / 外部代理；不修改既有已追蹤程式碼與控制器；不修改現行 Manifest / 快取 / tool-bin / 授權檔；不變更任何權限 (chmod/chown/ACL/flags/global hooks)；不規避任何 deny 規則；嚴格禁止觸發真實全量測試或未授權重跑。所有假子行程控制與負向驗證僅在審查員專屬 scratch (`/private/tmp/pv-phase10-hardening-r3-review`) 進行。使用者指示明確：本輪審查為誠實揭露缺口與維運審查之延續，絕非最終驗收棄權（User go-on = continue truthful gap and proper review, no final acceptance waiver）。

---

## 一、 獨立審查總結與四項獨立判定（Separate GO / NO-GO Decisions）

依據指示，針對四項核心維度進行獨立裁決，不混合判定：

| 審查維度 | 獨立判定 | 關鍵事實依據 |
| :--- | :---: | :--- |
| **(1) R3 控制器安全防護 (R3 Controller Safeguards)** | **GO (VERIFIED HARDENED)** | 控制器實體雜湊 `9de644399adc...`，31 項自含負向測試全數通過（31/31 GREEN）：1) `authorizationId`、`expectedGitHead`、`expectedGitTree`、`toolMatrixDigest`、`argvDigest`、`targetPhaseIds` 全數改為非空型別強制驗證；2) Claim 登記簿改設於固定目錄 `logs/.authorization-claims/<safeAuthId>.claim.json`，跨目錄同一 Token 與 20 並行競爭實測嚴格僅 1 勝出（1 Winner）；3) Claim 前執行真實 Git HEAD/TREE 物件與乾淨狀態校驗，即使 Manifest 與授權檔串謀偽造 Tree 亦遭 Fail-Closed 攔截（0 Claim）；4) 參數邊界改用規範化 JSON 陣列雜湊；5) 日誌採用 `openSync(..., "wx")` 前置原子建立，既存日誌 0 位元組受損且 0 子行程產生；Phase 10 序號強制 `>= 4`。 |
| **(2) 審計提案套用至 live/mirror (Apply Exact Proposal with wx Backup)** | **GO (RECOMMENDED / QUALIFIED)** | 現行 live/mirror Manifest（SHA `dab8ee3f...`）記錄之 Git Tree 為歷史錯誤字串 `faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5`，若不更正，R3 控制器將依真實 Git 校驗強制拒絕所有執行。審計提案 `phase-manifest.proposal.json`（SHA `6273d9b7...`）：1) 修正 `git.tree` 為真實 `faa45f1d9342a834539a76c8f9d26015cf263710`；2) 附帶 `metadataCorrections` 審計記錄與唯讀查驗命令；3) 完整保留 Attempt 1 與 Attempt 2 歷史，並新增 `auditHistory` 揭露 115,142 bytes 原始毀損事實；4) 僅在 Phase 10 之 `fullArgv` 插入私有 Python 3.15 工具鏈（`--bin /private/tmp/pv-phase10-hardening/python-bin`），1–9 與 11–15 組 `fullArgv` 100% 保持不變；5) 聲明 Phase 10 專屬 `toolMatrix`。父層操作者套用時必須以排他 `wx` 備份現行 live/mirror 檔案。 |
| **(3) 單次 Phase 10 Attempt 4 執行資格 (Single Phase 10 Attempt 4 Execution)** | **CONDITIONAL GO (STRICTLY BOUNDED)** | 在「已套用上述審計提案」、「採用經審查之專屬工具矩陣與參數摘要」、「使用嚴格鎖定 `phase-10-general-workspaces-b` 之單次授權憑證」三項前提滿足下，具備由父層單獨委派一次單獨執行（Single Run）之技術條件。執行過程必須：1) 採用合規授權之 `BypassSandbox: true` 乾淨環境；2) 遇任一失敗立即 STOP，禁止自動重試；3) 嚴格禁止進入 Phases 11–15；4) 執行序號嚴格 `>= 4`。本判定絕非認定 Phase 10 已通過。 |
| **(4) 全量 15 組與最終驗收 (Full 15 Phases & Final Acceptance)** | **STRICT NO-GO** | **最終驗收嚴格維持 NO-GO**：1) Phase 10 Attempt 4 尚未執行；2) Phases 11–15 從未執行（狀態皆為 `NOT_RUN`）；3) OpenSpec Tasks 2.12、2.13、4.2–5.2 嚴格維持 PENDING 未勾選；4) 115,142 bytes 原始毀損日誌永久揭露；5) 嚴禁移除 draft、嚴禁任何未授權合流、推送、歸檔或正式交付。 |

---

## 二、 檔案雜湊值與不可變基準比對矩陣

### 1. 關鍵控制器與 Manifest 雜湊查驗

| 項目 | 檔案實體路徑 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :--- | :---: |
| **R3 硬化控制器** | `/private/tmp/pv-full/run-phases.mjs` | `9de644399adc7ac8b2468f95155a16400e27269c1353c2888ad031a53a94bfd0` | 符合使用者指定，通過 31 項控制驗證 |
| **現行 live Manifest** | `/private/tmp/pv-full/manifests/phase-manifest.json` | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` | 保持 2 筆記錄，完全唯讀未變更 |
| **現行 mirror Manifest** | `/private/tmp/pv-full/phase-manifest.json` | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` | 保持 2 筆記錄，完全唯讀未變更 |
| **審計修復提案 Manifest** | `/private/tmp/pv-phase10-hardening-r3/phase-manifest.proposal.json` | `6273d9b783a904f8cf9bb596baf3c5949408f174fb14fdd966b0107f1e38d679` | 符合使用者指定，含正確 Tree 與審計歷程 |
| **Attempt 2 日誌檔案** | `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.attempt2.log` | `362cae7efbc80b222417fa8b744a16888bf6d981dd3375a833fb0aa9e0a8a4c4` | 152,544 bytes 鎖定，未受污染 |
| **Attempt 1 日誌檔案** | `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.attempt1.log` | `707f0aa8c597937e33144b4bfdc3e71556ee5f9df765758d8db85f5548ab5dc0` | 99,074 bytes 鎖定，未受污染 |
| **Attempt 2 Run 1 毀損日誌** | (原始 child stdout) | `UNKNOWN / IRRECOVERABLE` | 115,142 bytes 原始檔案已毀損，封存外部佐證 |

### 2. Git 實體狀態與物件比對（工作區：`/private/tmp/pv-git-env-fixture-fix`）

- **命令 1：** `git -C /private/tmp/pv-git-env-fixture-fix rev-parse HEAD`  
  輸出：`56d517eeffd24287161329b2f86595dcdef4d165`
- **命令 2：** `git -C /private/tmp/pv-git-env-fixture-fix rev-parse HEAD^{tree}`  
  輸出：`faa45f1d9342a834539a76c8f9d26015cf263710`
- **命令 3：** `git -C /private/tmp/pv-git-env-fixture-fix status --porcelain`  
  輸出：（空字串，Clean）
- **現行 Manifest 記錄比對：**
  - `manifest.git.head`: `56d517eeffd24287161329b2f86595dcdef4d165`（符合）
  - `manifest.git.tree`: `faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5`（**不符合實際 Git Tree**，必須透過提案更正）

### 3. 源碼指紋與二進位相依清冊

- **源碼指紋（24 個檔案）：**
  - Pi 專屬檔案（5 個）：100% 吻合 `manifest.sourceFingerprints.piFiles`
  - PV 專屬檔案（19 個）：100% 吻合 `manifest.sourceFingerprints.pvFiles`
- **外掛 SDK 發行產物（`packages/plugins/sdk/dist`）：**
  - 遞迴檔案數：97 個（頂層 entries 76 個）
  - 與 `3f1` 快照（`/private/tmp/pv-load-fixture-fix/packages/plugins/sdk/dist`）逐檔比對：97 / 97 個檔案 SHA-256 100% 一致。
- **工具鏈二進位矩陣（Phase 10）：**
  - Python 3.15.2：`/opt/homebrew/Cellar/python@3.15/3.15.2/Frameworks/Python.framework/Versions/3.15/bin/python3.15`（SHA: `d775520d87f89a19cffe0db3fba17f3caf71d91066e23e5efd7b5bd9dbb975e2`）
  - Node.js (v24.18.0)：`/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`（SHA: `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a`）
  - Git (v2.56.0)：`/private/tmp/pi-dedup-git-toolchain/bin/git`（SHA: `916479af8cb874da55aab980077362ee233407e5112f6df5ee3514d7611ab559`）
  - Cargo (v1.97.1)：`/private/tmp/pi-dedup-rust-toolchain/cargo/bin/cargo`（SHA: `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f`）
  - Rustc (v1.97.1)：`/private/tmp/pi-dedup-rust-toolchain/cargo/bin/rustup`（SHA: `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f`）
  - Corepack LKG：`/private/tmp/pv-clean-tools/corepack/lastKnownGood.json`（SHA: `957e0bb742647e92bbaf8238bce96848e011b452ee7c09f2a876b93a013d0ae8`）

---

## 三、 控制器 R3 硬化審查與獨立自含負向測試（31 項控制驗證成果）

審查員於專屬隔離目錄 `/private/tmp/pv-phase10-hardening-r3-review/` 執行自含測試套件，直接調用 `/private/tmp/pv-full/run-phases.mjs` 導出函式，共執行 31 項控制斷言，結果 **31 / 31 PASSED (100% GREEN)**。

### 1. 必要欄位強型別驗證（消除 `if (field)` 繞過，Suite 1，9 項斷言）

在 R2 控制器中，部分驗證使用了 `if (auth.field)`，導致授權檔若刻意省略該欄位，檢查將被靜默跳過。R3 控制器全面強化為必填型別檢查：
- 缺漏 `authorizationId`：拋出 `FAIL-CLOSED: Run authorization missing required "authorizationId"`，0 Claim 產生。
- 缺漏 `expectedGitHead`：拋出 `FAIL-CLOSED: Authorization expectedGitHead is mandatory and must be a 40-character hex string`，0 Claim 產生。
- 錯誤長度或非十六進位 `expectedGitHead`：拋出錯誤拒絕，0 Claim 產生。
- 缺漏 `expectedGitTree` 或非 40 碼十六進位：拋出錯誤拒絕，0 Claim 產生。
- 缺漏 `toolMatrixDigest` 或非 64 碼十六進位：拋出錯誤拒絕，0 Claim 產生。
- 缺漏 `argvDigest` 或非 64 碼十六進位：拋出錯誤拒絕，0 Claim 產生。
- 缺漏 `targetPhaseIds`：拋出錯誤拒絕，0 Claim 產生。
- `targetPhaseIds` 包含通配符 `"all"`：拋出 `FAIL-CLOSED: Wildcard targetPhaseId "all" is rejected; exact ordered phase binding required`，0 Claim 產生。
- CLI 省略或傳入空目標 Phase ID：拋出 `FAIL-CLOSED: Explicit target phase ID is mandatory; implicit all is rejected`，0 Claim 產生。

### 2. Git HEAD / Tree 與工作區乾淨狀態真實校驗（拒絕偽造，Suite 2，1 項斷言）

- **實測場景：** 模擬授權檔與 Manifest 串謀填寫舊錯誤 Tree 字串 `faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5`。
- **驗證成果：** 控制器於 Claim 前以 `git rev-parse HEAD^{tree}` 比對真實物件，立即拋出：
  `FAIL-CLOSED: Manifest git tree (faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5) does not match actual git tree (faa45f1d9342a834539a76c8f9d26015cf263710). Metadata repair required.`
- **結果：** 0 Claim 檔案建立，0 Token 消耗，0 子行程啟動。徹底粉碎偽造 Tree 繞過之可能。

### 3. 規範化參數邊界 JSON 陣列雜湊（Suite 3，1 項斷言）

- **機制：** 捨棄空白字元拼接 `join(" ")`，改採 `crypto.createHash("sha256").update(JSON.stringify(requestedPhases.map(p => p.fullArgv))).digest("hex")`。
- **負向測試：** 改變參數陣列元素邊界（使 `join(" ")` 結果相同但陣列結構不同），控制器比對 `argvDigest` 失敗並立即拋錯拒絕，杜絕命令混淆與注入漏洞。

### 4. 作用域工具矩陣綁定（Suite 4，2 項斷言）

- **機制：** 雜湊涵蓋公共工具與 Phase 專屬之 `toolMatrix`（Python 3.15.2）：
  `{ common: manifest.tools, phases: [{ id: "phase-10-general-workspaces-b", tools: p.toolMatrix }] }`。
- **負向測試：** 僅傳入公共工具矩陣雜湊（忽略 Phase 10 之 Python 3.15）遭立即拒絕；傳入正確作用域雜湊順利通過驗證。

### 5. 持久化 Claim 登記簿與目錄解耦（Suite 5 & 6，3 項斷言）

- **集中登記簿：** Claim 檔案強制收斂於固定日誌目錄 `logs/.authorization-claims/<safeAuthId>.claim.json`，不再依賴 `path.dirname(authPath)`。
- **跨目錄同 Token ID 測試（Suite 5）：** 在 `dirA` 與 `dirB` 放置相同 `authorizationId` 之授權檔，`dirA` Claim 成功後，`dirB` 發起呼叫立即命中同一目標檔案遭拒（Strictly 1 Winner）。
- **20 行程平行競爭原子性（Suite 6）：** 啟動 20 個平行 Worker 同時 Claim 同一 Token，底層以 `openSync(..., "wx")` 原子排他建立：
  - **Winners:** 精確 1 個行程退出 0。
  - **Losers:** 精確 19 個行程遭遇 `EEXIST` 退出 1。

### 6. 路徑穿越攻擊與格式拒絕（Suite 7，7 項斷言）

- 對 `validateAuthorizationId` 進行邊界測試：`../../etc/passwd`、`../secret`、`foo/bar`、`foo\bar`、`.hidden`、`trailing.`、`invalid char@!` 等非法格式全數遭 `FAIL-CLOSED` 攔截。

### 7. 日誌排他建立與 Phase 10 序號下限（Suite 8，2 項斷言）

- **序號下限：** 即使 Manifest 與磁碟上嘗試記錄全空，Phase 10 之 Next Attempt 序號強制 `>= 4`（實測為 4）。
- **防覆寫證明：** 目標日誌預先存在時，控制器在子行程啟動前以 `openSync(attemptLogPath, "wx")` 攔截，拋出 `EEXIST`，0 位元組歷史日誌受損，0 子行程啟動。

### 8. 未知 Phase、No-op 守護與源碼指紋（Suite 9 & 10，3 項斷言）

- 未知 Phase ID 在 Claim 前退出非零（0 Claim 產生）。
- 全部已 `PASSED` 之 Phase 請求在 Claim 前遭 Anti-No-Op Guard 攔截拒絕（0 Claim 產生）。
- 源碼指紋缺漏或雜湊不符在 Claim 前拋錯拒絕（0 Claim 產生）。

### 9. 訊號處理與串流刷新（Suite 11，3 項斷言）

- SIGTERM 終止正確對齊為退出碼 `143`，訊號值記錄為 `"SIGTERM"`。
- 日誌串流在 `runPhase` 返回前透過 `logStream.end(res)` 完整 flush 至磁碟。
- Vitest 計數解析精準保留。

---

## 四、 審計提案 `phase-manifest.proposal.json` 深度審查

審查員對比現行 live Manifest（`dab8ee3f...`）與專屬提案檔案（`6273d9b7...`）：

### 1. Git Tree 修正與 `metadataCorrections` 審計記錄

- **修正內容：** `git.tree` 由舊錯誤字串 `faa45f1d93427bebc2fbe4f603c4f74d9cf2efb5` 更正為真實 Git 物件雜湊 `faa45f1d9342a834539a76c8f9d26015cf263710`。
- **審計詮釋資料：** 包含 `originalManifestHash: "dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701"`，記錄修正原因及唯讀取證命令：
  `git -C /private/tmp/pv-git-env-fixture-fix rev-parse HEAD^{tree}`。

### 2. 歷史資料保留與 115KB 原始日誌毀損揭露

- **既有 Attempts 保留：** 提案中 `phase-10-general-workspaces-b.attempts` 陣列完整保留 Attempt 1（`3f1` 快照，99,074 bytes）與 Attempt 2（`56d` 快照，152,544 bytes）原始物件結構。
- **三階段邏輯歷程 (`auditHistory`)：**
  - Logical 1: Attempt 1（`3f1` 快照，synthetic GIT_CONFIG_GLOBAL 斷言衝突，99,074 bytes，SHA: `707f0aa8...`）。
  - Logical 2: Attempt 2 Run 1（`56d` 快照，缺少 37 個 `node_modules`，115,142 bytes 原始毀損，明確標註 `UNKNOWN / IRRECOVERABLE`，外部還原佐證封存於 `/private/tmp/pv-phase10-attempt-audit/`）。
  - Logical 3: Attempt 2 Run 2（`56d` 快照，違規重跑，PATH prioritized `/usr/bin` 載入 Python 3.9.6 < 3.10 失敗，152,544 bytes，SHA: `362cae7e...`）。
- **快照指紋未重新標記：** Phases 1–6 保持實際 `cc56bbcd...`，Phases 7–9 及 11–15 保持實際 `3f1eb1b7...`，完全無造假重新貼標（No relabeling）。

### 3. fullArgv 修改之唯一性與範圍鎖定

- 逐一比對全量 15 組 Phase 之 `fullArgv`：
  - **Phases 1–9：** `fullArgv` 100% 保持未變。
  - **Phase 10：** 唯一修改為在 `"--bin", "/usr/bin"` 之前插入 `"--bin", "/private/tmp/pv-phase10-hardening/python-bin"`。其餘所有參數、clean-env 選項、Vitest 引數完全未動。
  - **Phases 11–15：** `fullArgv` 100% 保持未變。
- **Phase 10 專屬 `toolMatrix`：** 正確綁定 Python 3.15.2（雜湊 `d775520d...`）及相關工具二進位。

---

## 五、 工作區相依性、Hermes 就緒與歷史毀損揭露確認

### 1. `packages/plugins/sdk/dist` 97 產出確認

- 工作區實體路徑：`/private/tmp/pv-git-env-fixture-fix/packages/plugins/sdk/dist`
- 遞迴檔案數：97 個（頂層 76 entries），與 `3f1` 快照及清冊 100% 吻合。
- 17 個專案模組與 11 項關鍵 subpath 預檢（`workspace-precheck.mjs`）保持 PASS（退出碼 0）。

### 2. Hermes 全量套件 174 測試通過證據

- 審查員核驗原始日誌 `/private/tmp/pv-phase10-hardening-r2/hermes-package-run.log`：
  - 10 個測試檔案、174 項測試全數通過（0 failures, 0 skips），耗時 10.69 秒，退出碼 0。
  - 運行於合規授權之 `BypassSandbox: true` 乾淨環境，載入私有 Python 3.15.2 工具鏈。
  - 依循有界維運原則，零重複執行真實測試，保護快照與環境純潔性。

### 3. 115KB 原始日誌毀損事实鎖定

- 2026-11-05 21:54 因前次違規重跑被覆寫之 115,142 bytes 原始 child stdout 檔案永久無法直接復原。
- 提案已誠實將其標註為 `UNKNOWN / IRRECOVERABLE`，外部還原證據（`task-300.log` 1,313 bytes、`step-331-output.txt` 12,362 bytes）已於審計歷程中指引。

---

## 六、 審查員發現之 CRITICAL / WARNING / SUGGESTION 評級矩陣

### 1. CRITICAL（嚴重性事項：已妥善解決）

- **C-1（Git Tree 偽造拒絕）：** 現行 live Manifest 之錯誤 Tree 字串與實際 Git Tree 不符。R3 控制器強制在 Claim 前校驗實際 Git 物件，若不套用審計提案修正 Manifest，任何執行均無法啟動。本報告裁決：**必須套用審計提案，嚴禁製造偽造授權**。

### 2. WARNING（警示性事項）

- **W-1（Phase 10 fullArgv 依賴私有 Python 路徑）：** 提案 Phase 10 之 `fullArgv` 寫入靜態路徑 `/private/tmp/pv-phase10-hardening/python-bin`。此路徑為本機私有 ops 環境，非標準系統路徑；在單次 Attempt 4 執行時，該目錄必須存在且包含指向 Python 3.15.2 之符號連結。
- **W-2（非作業系統級沙盒邊界）：** 控制器之防護為行程層級與輸入校驗守護，非 OS 核心級 Darwin Seatbelt 沙盒；合規 `BypassSandbox: true` 執行時，其安全性仰賴宣告之乾淨環境變數與無秘密保證。

### 3. SUGGESTION（優化建議）

- **S-1（套用提案之原子性備份）：** 父層操作者套用 `phase-manifest.proposal.json` 覆寫 live/mirror Manifest 時，必須先使用 `cp -n` 或 `fs.writeFileSync(..., { flag: "wx" })` 將現行 `dab8ee3f...` 備份至 `phase-manifest.dab8.bak`，保留不可逆回退基準。

---

## 七、 相容性授權憑證規格、精確計算雜湊值與單次 Phase 10 執行 CLI

當父層決定套用提案並發起單次 Phase 10 Attempt 4 執行時，必須使用符合以下規格之授權檔。

### 1. 相容授權檔具體內容範本 (`/private/tmp/pv-full/.run-authorization.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "authorizationId": "auth-phase10-attempt4-20261106-bound-r3",
  "targetPhaseIds": [
    "phase-10-general-workspaces-b"
  ],
  "expectedGitHead": "56d517eeffd24287161329b2f86595dcdef4d165",
  "expectedGitTree": "faa45f1d9342a834539a76c8f9d26015cf263710",
  "toolMatrixDigest": "953b2787d6aa4e4b38d1ef7b3d063bafd20e50f27a8bff4007ec0c64c81506b7",
  "argvDigest": "3d00eadc828c0bd3fa72d997c93a21272214e0ec4f63f925953488a705b57fe9",
  "approvedBy": "independent-ops-review-session-4ae92d1a",
  "approvedAt": "2026-11-06T09:18:00.000Z",
  "notes": "Strictly scoped one-use run authorization for Phase 10 Attempt 4 under R3 Proposal"
}
```

### 2. 密碼學摘要精確計算數據與演算法

- **`expectedGitHead`：** `"56d517eeffd24287161329b2f86595dcdef4d165"`（吻合真實 `git rev-parse HEAD`）
- **`expectedGitTree`：** `"faa45f1d9342a834539a76c8f9d26015cf263710"`（吻合真實 `git rev-parse HEAD^{tree}`）
- **`argvDigest`（規範化參數邊界 JSON 陣列）：**
  ```javascript
  const canonicalArgvArray = [proposalPhase10.fullArgv];
  const argvDigest = crypto.createHash("sha256").update(JSON.stringify(canonicalArgvArray)).digest("hex");
  ```
  **精確計算值：** `3d00eadc828c0bd3fa72d997c93a21272214e0ec4f63f925953488a705b57fe9`
- **`toolMatrixDigest`（作用域工具矩陣）：**
  ```javascript
  const scopedToolMatrix = {
    common: proposalManifest.tools,
    phases: [{
      id: "phase-10-general-workspaces-b",
      tools: proposalPhase10.toolMatrix
    }]
  };
  const toolMatrixDigest = crypto.createHash("sha256").update(JSON.stringify(scopedToolMatrix)).digest("hex");
  ```
  **精確計算值：** `953b2787d6aa4e4b38d1ef7b3d063bafd20e50f27a8bff4007ec0c64c81506b7`

### 3. 未來單次 Phase 10 執行之精確安全 CLI 命令

當父層操作者於合法授權之 `BypassSandbox: true` 模式下啟動時，必須執行以下精確命令：

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

## 八、 門禁狀態與分工交接結論

1. **(1) R3 控制器安全防護判定：GO (VERIFIED HARDENED)**。31 項獨立負向控制測試全數通過，強型別非空驗證、真實 Git 雙向校驗、固定登記簿單一勝出者保證完備。
2. **(2) 審計提案套用判定：GO (RECOMMENDED / QUALIFIED)**。提案修正 Git Tree 缺陷、保留原始 DAB8 與 Attempt 1/2 記錄、揭露 115KB 斷層、唯一微調 Phase 10 fullArgv。父層套用時應備份原檔。
3. **(3) Phase 10 Attempt 4 單次執行資格判定：CONDITIONAL GO (STRICTLY BOUNDED)**。具備在上述憑證與工具鏈下由父層單獨委派一次單獨執行之技術條件；若失敗立即停機。
4. **(4) 全量 15 組與最終驗收判定：STRICT NO-GO**：
   - OpenSpec Task 2.12：**PENDING**（未勾選）。
   - OpenSpec Task 2.13：**PENDING**（未勾選，本 slice 絕對不得標記為 DONE）。
   - OpenSpec Tasks 4.2–5.2：**PENDING / STRICT NO-GO**。
   - Phases 11–15：**NOT_RUN**（未獲授權執行）。
   - 115,142 bytes 原始毀損日誌永久揭露。
   - 嚴禁移除 draft、嚴禁自動合流或歸檔。
5. **即刻停機（STOP）：** 本審查員不執行任何 live job、不發起真實測試、不更動 live 檔案，交付本報告與審查證據後立即停機。
