# Independent Review: Copilot Offline Cache Proposal and Integrity Assessment (Task 2.14)

- **文件路徑：** `/Users/Hermes/.gemini/antigravity-cli/brain/53b8640d-7476-4fb9-9ede-e833941cd24c/scratch/neworiginalcopilot-assets-independent-review.md`
- **審查日期：** 2026-11-06
- **審查角色：** 獨立審核員（Gemini 3.8 Flash High, Fresh Independent Read-Only Reviewer）
- **規範依據：** `rules/acpx-profile-identity.mdc`、`rules/runtime-dependency-boundaries.mdc`、`AGENTS.md`
- **操作約束：** 
  - 原生環境唯讀審查，零 MCP、零 Hindsight、零外部代理。
  - 嚴禁執行真實 Copilot / Cursor 二進位本體（禁止 `--version`、原生 import、動態 materializer、全量 build 或測試執行）。
  - 嚴禁修改正式源碼、pins、verifier、快取、live-manifest、controller 或 auth 授權檔。
  - 嚴禁網路存取、全域設定變更、憑證操作、git commit 或 push。
  - 僅寫入本專屬 review 文件；已將診斷報告以 EXACT bytes 鏡像備份至 scratch。

---

## 一、 審查判定與門禁矩陣 (Executive Decision Matrix)

| 審核項目 | 判定結果 | 關鍵依據與核驗數據 |
| :--- | :---: | :--- |
| **Trusted Cache 資格** | **GO** | `oldcc56` (`/private/tmp/paperclip-portable-validation`) 經全量靜態唯讀解析：231/231 條目、二進位本體 (152,595,280 bytes, SHA-256: `a9ff8babb10b7e443182ae96a8bc50a9c826ef1c773e1344c396eb5bf7f512c3`)、Closure Pin (`362f2663e967fb9e34a814bac4619cbf89e6b23069c4051ab1f2f686852d0a32`) 100% 吻合，零符號連結、零非預期檔案。 |
| **Proposed Offline Materialization** | **GO** | 採本機 APFS 快照複製（`cp -c -R` / `cp -a`），完全離線，不依賴網路或 pnpm store 動態解壓。同時涵蓋 runner 與 server 兩處 provider-assets。 |
| **Read-Only Postchecks** | **GO** | 僅允許純靜態 Node fs/crypto 唯讀校驗腳本，嚴格不啟動任何子行程或執行二進位檔。 |
| **ONE Prebuild Gate** | **GO** | 審核 `install-copilot-assets.mjs` 與 `runtime-build.ts` 源碼確認：在完整資產存在下，編譯前置僅進入 `verified-existing` 唯讀校驗分支，保證不調用真實 Copilot CLI、無網路下載。 |
| **Phase 12 恢復執行** | **CONDITIONAL** | 必須在前置離線準備與 Gate 0 驗收完成後，核發全新 R3 單次授權（attempt 2，`wx` 排他控制鎖），且必須重跑包含 `maintenance-server-routes.test.ts` 在內的全部 8 個 suites，嚴禁跳過任何維護案例；Phases 13–15 嚴格維持 `NOT_RUN`。 |

---

## 二、 前置診斷報告審查與因果修正 (Audit of Prior Diagnostic Report)

對照診斷報告 `/private/tmp/pv-copilot-assets-diagnosis/2026-11-06-copilot-assets-diagnosis.md`（鏡像雜湊 SHA-256: `66402410f6131ffb232eee7f79ef6a80dd509ba75abd957fa098fb702140906a`）與原始 JSON 證據：

1. **同意之因果發現：**
   - Phase 12 attempt 1 失敗確實導因於 `maintenance-server-routes.test.ts` 的 `beforeAll` 觸發 `pnpm --filter @paperclipai/paperclip-runner build:typescript`。
   - `install-copilot-assets.mjs` 存在目錄預先存在的陷阱：當 `destination` 已存在時拋出 `EEXIST`，腳本跳過解壓流程直接執行 `verifyCopilotInstallation()`。
   - `packages/paperclip-runner/src/drivers/acpx/native-distribution-integrity.ts` 在嘗試開啟 `.paperclip-copilot-closure.json` 時遭遇 `ENOENT`，向上拋出 `COPILOT_INSTALLATION_INVALID`。
   - `new56d`、`old3f1`、`oldcc56` 三個快照的追蹤源碼、pins 與 profiles 經比對 100% 一致，Git tree `faa45f1d9342a834539a76c8f9d26015cf263710` 保持 clean。

2. **修正與標註事項 (Critical Correction on Causality)：**
   - 診斷報告第四節斷言「歷史清理（如 `git clean -fdx -e node_modules`）造成殘留骨架」。
   - **獨立審核糾正：** 目錄殘留特徵（僅保留含有 `node_modules` 的 3 個子目錄骨架）是**現象與模式（Pattern），而非歷史指令的確定性證據（Proof of Historical Command）**。
   - 在沒有具體的執行歷史紀錄或 transcript 明確證明該指令曾被調用的情況下，實際造成該目錄殘缺的歷史觸發原因必須標註為 **UNKNOWN（未知）**。禁止假定必然為特定指令所致，且無須對使用者目錄進行非必要的寬泛掃描。

---

## 三、 信任候選資產獨立靜態驗算 (Static Verification of Candidate cc56)

審核員在唯讀模式下，使用純 Node.js `fs` 與 `crypto` 模組對 `oldcc56` 進行逐項靜態審查，完全避免載入原生模組或執行任何二進位本體：

- **受測目錄：** `/private/tmp/paperclip-portable-validation/packages/paperclip-runner/provider-assets/copilot/darwin-arm64`
- **二進位本體 (`copilot`)：**
  - 檔案大小：`152,595,280` bytes
  - 檔案權限：`0755` (`-rwxr-xr-x`)
  - 檔案類型：正規檔案（Regular File，非 symlink）
  - SHA-256：`a9ff8babb10b7e443182ae96a8bc50a9c826ef1c773e1344c396eb5bf7f512c3`
- **封閉清單檔案 (`.paperclip-copilot-closure.json`)：**
  - 檔案大小：`42,095` bytes
  - SHA-256：`dd486bd8babde5433d40fec7167e9d69e39d4fd5e0113111b375068d3b724602`
  - 條目數量：`231` 項正規路徑
- **全量條目逐檔驗算結果：**
  - 磁碟非 manifest 檔案總數：恰好 231 個（與清單一一對應）。
  - 非預期多餘檔案數：`0`。
  - 符號連結數：`0`。
  - 內容雜湊不符數：`0`。
  - 檔案大小不符數：`0`。
  - 執行權限標記不符數：`0`。
  - 依清單標準化序列計算之 Closure SHA-256：`362f2663e967fb9e34a814bac4619cbf89e6b23069c4051ab1f2f686852d0a32`。
  - 與 `COPILOT_CLOSURE_SHA256["darwin-arm64"]` pin 比對：**100% PERFECT MATCH**。

---

## 四、 Server 端依賴審核與雙目錄架構 (Server Assets Architecture)

審核員進一步檢查 `server/` 端對於 Copilot provider-assets 的依賴機制：

1. **目錄定位依據：**
   `packages/paperclip-runner/src/drivers/acpx/provider-assets-root.ts` 內 `resolveRunnerProviderAssetsRoot()` 實作明定：
   ```typescript
   if (value?.name === "@paperclipai/server") {
     assertServerVendorLayout(packageRoot);
     packageRoot = provider === "copilot" ? dirname(canonicalManifest) : join(dirname(canonicalManifest), "dist/vendor/paperclip-runner");
   }
   ```
   當 package root 為 `@paperclipai/server` 且 provider 為 `"copilot"` 時，資源目錄直接指向 `server/provider-assets/copilot/darwin-arm64`。

2. **現狀比對：**
   - 在 `oldcc56` 中，`server/provider-assets/copilot/darwin-arm64` 與 `packages/paperclip-runner/provider-assets/copilot/darwin-arm64` 存在且**逐 byte 完全一致**（231 條目、相同二進位與 closure manifest）。
   - 在 `new56d` 中，兩處均留有相同的殘留骨架（僅殘存 3 個含 `node_modules` 的子目錄）。
   - 結論：**不得盲目只修復 runner 而忽略 server**，離線復原計劃必須同步將合法資產部署至 runner 與 server 兩處目錄。兩者皆列於 `.gitignore`（第 94、95 行），確保不會產生任何 git tracked 變更。

---

## 五、 建置流程安全審核與零二進位調用保證 (Build Safety Verification)

審查 `packages/paperclip-runner/scripts/install-copilot-assets.mjs` 與 `packages/paperclip-runner/src/drivers/acpx/native-distribution-integrity.ts`：

1. **建置管線行為：**
   - `build:typescript` 執行 `node scripts/install-copilot-assets.mjs`。
   - 偵測到目標目錄已存在時，進入 `catch (error) /* EEXIST */` 分支。
   - 呼叫 `verifyCopilotInstallation()` -> `verifyNativeAcpxInstallation()` -> `readNativeAcpxDistributionEntries()`。
   - 該校驗函式僅透過 `node:fs` 唯讀開啟 `.paperclip-copilot-closure.json`，計算雜湊並檢查檔案條目。
2. **安全保證：**
   - 整個建置與驗證過程**嚴格不調用 `copilot` 二進位本體**（不執行 `copilot --version` 或任何子行程）。
   - **嚴格不產生任何網路請求**，不觸發任何套件下載。
   - 當磁碟目錄已具有完整的 231 個檔案與 manifest 時，安裝腳本輸出 `verified-existing` 並正常結束（退出碼 0）。

---

## 六、 精確零程式碼變更之離線修復計畫 (Exact 0-Source-Change Offline Prep Plan)

> [!IMPORTANT]
> **本計畫為純離線、零正式源碼修改、保留證據之具體操作方案，本 turn 嚴格不執行，待授權後交付執行。**

### 步驟 1：證據保全（Preserve Bad Roots）
絕不刪除或直接覆蓋現有殘留目錄，將損壞的骨架移至專屬隔離目錄保存：
```bash
# 建立證據隔離目錄
mkdir -p /private/tmp/pv-copilot-assets-diagnosis/evidence-backup

# 保全 runner 端殘留骨架
mv /private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/provider-assets/copilot/darwin-arm64 \
   /private/tmp/pv-copilot-assets-diagnosis/evidence-backup/runner-darwin-arm64-bad-skeleton

# 保全 server 端殘留骨架
mv /private/tmp/pv-git-env-fixture-fix/server/provider-assets/copilot/darwin-arm64 \
   /private/tmp/pv-copilot-assets-diagnosis/evidence-backup/server-darwin-arm64-bad-skeleton
```

### 步驟 2：離線 APFS 快照複製（APFS Clone from oldcc56）
利用 macOS APFS 的 Copy-on-Write 特性，完整複製已受信任的 `oldcc56` 資產：
```bash
# 復原至 runner 目錄
cp -c -R /private/tmp/paperclip-portable-validation/packages/paperclip-runner/provider-assets/copilot/darwin-arm64 \
         /private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/provider-assets/copilot/darwin-arm64

# 復原至 server 目錄
cp -c -R /private/tmp/paperclip-portable-validation/server/provider-assets/copilot/darwin-arm64 \
         /private/tmp/pv-git-env-fixture-fix/server/provider-assets/copilot/darwin-arm64
```

### 步驟 3：部署後純唯讀靜態校驗（Post-Copy Static Read-Only Audit）
執行獨立唯讀 Node 腳本，核對兩處目標目錄：
- 檢查檔案數量為 231 個 regular files 加 1 個 manifest。
- 檢查 `copilot` 大小為 152,595,280 bytes，SHA-256 為 `a9ff8bab...`。
- 檢查 Closure Pin 為 `362f2663...`。
- 檢查無符號連結、無額外檔案。
- 確認 git status 保持 100% clean（受 `.gitignore` 保護）。

### 步驟 4：Gate 0 單次前置編譯驗收（ONE Prebuild Gate）
在不啟動測試的情況下，單獨驗收建置流程：
```bash
pnpm --filter @paperclipai/paperclip-runner build:typescript
```
預期輸出：
`Copilot runtime assets: verified-existing (darwin-arm64)`，退出碼 0。

---

## 七、 Phase 12 條件式重試規範 (Conditional Phase 12 Re-run Criteria)

1. **授權門禁控制：**
   - 必須核發全新的單次執行授權檔 `run-authorization.phase12.attempt2.json`。
   - 使用原子排他鎖（`wx` 標誌寫入 claim），綁定特定 HEAD `56d517ee...` 與 Tree `faa45f1d...`。
2. **完整測試範圍要求：**
   - 必須完整重跑 Phase 12 的全量 8 個測試 suites。
   - 嚴禁透過任何參數排除或跳過 `maintenance-server-routes.test.ts`。
   - 維持原有的 17 個跳過案例（環境條件跳過），預期 8/8 suites 通過。
3. **後續階段凍結：**
   - Phases 13、14、15 嚴格維持 **NOT_RUN** 狀態。

---

## 八、 全局 25 項任務進度與 115 KB 歷史落差揭露 (Task Accounting & Prior Gap)

### 1. 25 Tasks 當前進度狀態
依據 `portable-validation-and-enrollment-regression/tasks.md` 盤點，共計 25 項任務：
- **已完成 (20 項)：** 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 3.1, 3.2, 3.3, 4.1, 4.3。
- **未完成／進行中 (5 項，嚴格維持未核准完成狀態)：**
  - **2.14**：本項有界唯讀診斷與獨立審核（本報告完成後，待線下準備實施與 Gate 0 驗收）。
  - **4.2**：不可變整合快照之 preflight、blockers 及 typecheck/build。
  - **4.4**：全官方等價測試組執行（Phase 12 中斷中，13–15 未執行）。
  - **5.1**：獨立驗證與審查交付。
  - **5.2**：完整證據與回滾指示提交。

### 2. 115 KB 歷史落差持續揭露
在先前的 Phase 10 調試過程中，曾產生約 115 KB 的歷史日誌與快取調整落差（已於 Task 2.13 稽核中完整登錄）。此項落差持續於所有後續報告中完整揭露，未有任何隱匿或靜默覆寫。

---

## 九、 結論與獨立審查簽署 (Sign-off)

- **審查結論：** **GO FOR OFFLINE PREP**（核准執行第 6 節之離線資產復原與 Gate 0 靜態驗收）。
- **源碼狀態：** 0 行正式程式碼變更，0 個 pins 修改，Git tree 完全保持原始指紋。
- **後續委託：** 本 session 維持唯讀邊界，實際複製與前置編譯由父層分派執行。
