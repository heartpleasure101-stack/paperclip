# Copilot Runtime Assets Causal Diagnosis & Offline Integrity Report (Task 2.14)

- **文件路徑：** `/private/tmp/pv-copilot-assets-diagnosis/2026-11-06-copilot-assets-diagnosis.md`
- **報告日期：** 2026-11-06
- **執行角色：** 唯讀診斷員（agy Gemini 3.8 Flash High, Read-Only Diagnostic Mode）
- **規範依據：** `rules/acpx-profile-identity.mdc`、`rules/runtime-dependency-boundaries.mdc`、`AGENTS.md`
- **操作約束：** 
  - 原生唯讀診斷；零 MCP / Hindsight / Pi / Sonnet / 外部代理。
  - 禁止 materialization、禁止複製至既有 workspace、禁止修改程式碼 / pins / config / verifier / manifests / controller / auth。
  - 嚴禁真實 CLI 調用、全量 build、測試重跑、Phase 12 重試。
  - 嚴禁存取網路、下載、真實 Copilot / Cursor 執行、Keychain / 憑證讀寫、繞過 verification。
  - 僅寫入專屬 scratch 目錄 `/private/tmp/pv-copilot-assets-diagnosis/`。
  - 凍結之 56d、3f1、cc56 原始資料 100% 保持未改。

---

## 一、 核心問題與因果判定摘要 (Executive Causal Delta)

| 診斷維度 | 診斷判定 | 具體數據與依據 |
| :--- | :---: | :--- |
| **失敗階段** | Phase 12 (`phase-12-serialized-shard-0`) attempt 1 | 耗時 25.6s，退出碼 1。7 檔通過 (72 tests passed, 17 skipped)，1 檔失敗 (`maintenance-server-routes.test.ts`)。日誌 SHA-256: `64b25e8f2233797435d1a22036e029032510a599fe9edcf71046865c1fad9220` (6,797 bytes)。 |
| **失敗直接原因** | `COPILOT_INSTALLATION_INVALID` | `maintenance-server-routes.test.ts` 之 `beforeAll` 呼叫 `prepareMaintenanceRuntime()`，觸發 `pnpm --filter @paperclipai/paperclip-runner build:typescript`。編譯後執行 `scripts/install-copilot-assets.mjs`，調用 `verifyCopilotInstallation()` 拋出錯誤。 |
| **因果檢查點 (Failed Check)** | `open(manifestPath)` 拋出 `ENOENT` | `packages/paperclip-runner/src/drivers/acpx/native-distribution-integrity.ts:67` 嘗試開啟 `.paperclip-copilot-closure.json`，檔案不存在。 |
| **根因分支判定** | `install-copilot-assets.mjs` 之 `destEEXIST` 分支陷阱 | `destination` 目錄 (`packages/paperclip-runner/provider-assets/copilot/darwin-arm64`) **已預先存在**，導致 `mkdir(destination)` 拋出 `EEXIST`。腳本誤認該目錄為既有安裝，跳過 materialization 直接呼叫 `verify()`，而該目錄實際為殘缺骨架。 |
| **殘缺目錄成因** | 歷史清理（如 `git clean -fdx -e node_modules`）留下孤立骨架 | `darwin-arm64` 內僅殘留 `distribution/{foundry-local-sdk,pvrecorder,webview}` 且底下僅有巢狀 `node_modules`。`.paperclip-copilot-closure.json`、`copilot` 二進位本體及其他 44 個目錄／根層檔案全數缺失。 |
| **源碼與 Pins 一致性** | **100% IDENTICAL** | `new56d` vs `old3f1` vs `oldcc56` 之 runner source、pins、profiles、manifest 雜湊逐 byte 一致。Git tree `faa45f1d9342a834539a76c8f9d26015cf263710` clean，24fp 100% 吻合。 |
| **信任快取可用性** | **VERIFIED AVAILABLE (OFFLINE)** | 1. `oldcc56` (`/private/tmp/paperclip-portable-validation`) 留有 231 項完整 distribution，驗證 closure pin `362f2663...` 100% 吻合，0 mismatches。<br>2. `new56d` 本機 pnpm store (`@github/copilot-darwin-arm64@1.0.88`) 內二進位 (`a9ff8bab...`) 與 inner tar (`49f5caa0...`) 100% 吻合。無須網路或外部下載。 |
| **門禁判定** | **STRICT NO-GO** | Phase 12 嚴禁直接恢復執行；Phases 13–15 嚴格維持 `NOT_RUN`。必須經獨立審查授權線下 materialization、前置唯讀驗收後，始可建立單次授權執行 Phase 12 全量 8 個 suites。 |

---

## 二、 失敗因果鏈逐層剖析 (Detailed Causal Chain)

```
[Phase 12 執行: serialized-shard-0]
  │
  ├─ 8 個測試檔案中，7 個通過 (72 tests passed, 17 skipped)
  │
  └─ 失敗檔案: server/src/__tests__/maintenance-server-routes.test.ts
       │
       ├─ beforeAll() -> prepareMaintenanceRuntime()
       │    │
       │    └─ 執行子行程: pnpm --filter @paperclipai/paperclip-runner build:typescript
       │         │
       │         ├─ tsc 編譯通過
       │         │
       │         └─ 執行腳本: node scripts/install-copilot-assets.mjs
       │              │
       │              ├─ 定位 destination: packages/paperclip-runner/provider-assets/copilot/darwin-arm64
       │              │
       │              ├─ 嘗試建立目錄: mkdir(destination, { mode: 0o755 })
       │              │    └─ 拋出錯誤: error.code === "EEXIST" (目錄已存在！)
       │              │
       │              ├─ 進入 catch (error) 之 EEXIST 分支 (line 52-59):
       │              │    ├─ 驗證 directory 屬性（非 symlink、真實路徑一致） -> 通過
       │              │    └─ 執行 verify() -> verifyCopilotInstallation(QUALIFIED_ACPX_PROFILES.copilot)
       │              │
       │              └─ verifyCopilotInstallation (src/drivers/acpx/copilot-installation.ts:25-34):
       │                   │
       │                   ├─ 呼叫 verifyNativeAcpxInstallation()
       │                   │    └─ 傳入 manifestPath: destination/.paperclip-copilot-closure.json
       │                   │
       │                   ├─ readNativeAcpxDistributionEntries (src/drivers/acpx/native-distribution-integrity.ts:67):
       │                   │    └─ open(input.manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW)
       │                   │         └─ 拋出 ENOENT (manifest 檔案不存在！)
       │                   │
       │                   └─ catch 攔截並包裝錯誤 (copilot-installation.ts:33):
       │                        └─ throw Error("Install the verified Copilot runtime beside the admitted sidecar.",
       │                                       { code: "COPILOT_INSTALLATION_INVALID", retryable: false })
```

---

## 三、 三工作區唯讀對照矩陣 (Three-Way Comparative Matrix)

### 1. 源碼與設定檔雜湊對照 (`new56d` vs `old3f1` vs `oldcc56`)

| 檔案相對路徑 | `new56d` SHA-256 | `old3f1` SHA-256 | `oldcc56` SHA-256 | 判定 |
| :--- | :---: | :---: | :---: | :---: |
| `packages/paperclip-runner/scripts/install-copilot-assets.mjs` | `d3bd9514e592...` | `d3bd9514e592...` | `d3bd9514e592...` | **Identical** |
| `packages/paperclip-runner/scripts/materialize-copilot-binary.mjs` | `c0a65e247fc4...` | `c0a65e247fc4...` | `c0a65e247fc4...` | **Identical** |
| `packages/paperclip-runner/scripts/copilot-inner-distribution.mjs` | `9bb08347eed0...` | `9bb08347eed0...` | `9bb08347eed0...` | **Identical** |
| `packages/paperclip-runner/src/drivers/acpx/copilot-installation.ts` | `e0e9d188cc2e...` | `e0e9d188cc2e...` | `e0e9d188cc2e...` | **Identical** |
| `packages/paperclip-runner/src/drivers/acpx/copilot-closure-pins.ts` | `2af586633b69...` | `2af586633b69...` | `2af586633b69...` | **Identical** |
| `packages/paperclip-runner/src/drivers/acpx/copilot-profile.ts` | `f5538b3dbefa...` | `f5538b3dbefa...` | `f5538b3dbefa...` | **Identical** |
| `packages/paperclip-runner/src/drivers/acpx/installation-integrity.ts` | `38ab50e4dcf8...` | `38ab50e4dcf8...` | `38ab50e4dcf8...` | **Identical** |
| `packages/paperclip-runner/src/drivers/acpx/native-distribution-integrity.ts` | `aed327c389e9...` | `aed327c389e9...` | `aed327c389e9...` | **Identical** |
| `packages/paperclip-runner/acpx-profiles.json` | `a0da71ed2d4f...` | `a0da71ed2d4f...` | `a0da71ed2d4f...` | **Identical** |
| `packages/paperclip-runner/package.json` | `972032ae5e02...` | `972032ae5e02...` | `972032ae5e02...` | **Identical** |

> **結論：** 三個工作區的程式碼、ACPX 規則與 Attestation Pins 100% 一致。本次失敗**完全源自檔案系統狀態差異（Runtime Asset Cache State）**，而非程式碼或 Pin 變更。

---

### 2. Provider Assets 目錄實體狀態對照 (`darwin-arm64`)

| 檢查項目 | `oldcc56` (Portable Validation) | `old3f1` (Load Fixture Fix) | `new56d` (Git Env Fixture Fix) |
| :--- | :--- | :--- | :--- |
| **目錄實體** | 存在 (`drwxr-xr-x`, 160 bytes) | 存在 (`drwxr-xr-x`, 96 bytes) | 存在 (`drwxr-xr-x`, 96 bytes) |
| **`.paperclip-copilot-closure.json`** | **存在** (42,095 bytes, `dd486bd8...`) | **缺失 (ENOENT)** | **缺失 (ENOENT)** |
| **`copilot` 二進位** | **存在** (152,595,280 bytes, mode 0755, `a9ff8bab...`) | **缺失 (ENOENT)** | **缺失 (ENOENT)** |
| **`distribution/` 內容** | **完整 47 項** (230 實體檔案，含 `app.js`, `index.js`, wasm 等) | **殘留 3 項** (`foundry-local-sdk`, `pvrecorder`, `webview`) | **殘留 3 項** (`foundry-local-sdk`, `pvrecorder`, `webview`) |
| **殘留目錄細部** | 完整包含 JS, JSON, WASM, `.node` | 僅包含深層 `node_modules` 結構 | 僅包含深層 `node_modules` 結構 |
| **驗證結果** | 231 項全部吻合 Closure Pin `362f2663...` (0 錯誤) | 無法驗證 (`ENOENT`) | 無法驗證 (`ENOENT`) |

---

### 3. 本機 pnpm Store 原始套件狀態 (`new56d`)

- **套件路徑：** `/private/tmp/pv-git-env-fixture-fix/node_modules/.pnpm/@github+copilot-darwin-arm64@1.0.88/node_modules/@github/copilot-darwin-arm64`
- **`package.json`：** 存在，name `@github/copilot-darwin-arm64`，version `1.0.88`。
- **`copilot` 執行檔雜湊：** `a9ff8babb10b7e443182ae96a8bc50a9c826ef1c773e1344c396eb5bf7f512c3` (152,595,280 bytes)。
  - 與 `materialize-copilot-binary.mjs:11` 宣告之 `executableDigest` 100% 吻合。
- **嵌入式 Inner Tar 雜湊：**
  - Offset: `92954063`，Size: `55323492`。
  - SHA-256: `49f5caa0582945a04c5619f8ea81680b1c8c2765888290cf8acf903e2985315b`。
  - 與 `copilot-inner-distribution.mjs:6` 宣告之 `sha256` 100% 吻合。
  - 解壓縮後 tar 大小為 143,343,616 bytes，包含恰好 230 個 regular file entries。

---

## 四、 殘留目錄成因分析與 EEXIST 分支缺陷 (Forensic Analysis)

1. **為什麼 `distribution` 只留下 3 個目錄？**
   在 `oldcc56` 的完整分發中，`distribution/` 下共有 47 個條目。其中，只有以下 3 個目錄內部包含 `node_modules` 子目錄：
   - `distribution/foundry-local-sdk/node_modules/...`
   - `distribution/pvrecorder/node_modules/...`
   - `distribution/webview/node_modules/...`
   當先前工作環境執行帶有排除規則的清理指令（例如 `git clean -fdx -e node_modules` 或針對 `node_modules` 保持的 rsync 規則）時，所有非 `node_modules` 路徑（包含根層的 `copilot`、`.paperclip-copilot-closure.json`、`app.js`、`index.js` 等 228 個檔案）全數被刪除，唯獨保留了帶有 `node_modules` 的這 3 個子目錄骨架。

2. **為什麼 `install-copilot-assets.mjs` 沒有自動重新解壓？**
   `install-copilot-assets.mjs` 的控制邏輯假設：
   - 若 `destination` 不存在 -> `mkdir()` 成功 -> 從本機套件執行 `materializePinnedCopilotBinary()`。
   - 若 `destination` 存在 -> 捕捉 `EEXIST` -> 假定已完整安裝，直接執行 `verify()`。
   由於檔案系統留下了殘缺的 `darwin-arm64` 目錄，`mkdir` 觸發了 `EEXIST`，使腳本誤跳過 materialization 流程，直接進入 verification，導致讀取缺失的 manifest 而引發 `COPILOT_INSTALLATION_INVALID`。

---

## 五、 未來線下修補建議方案（Proposal ONLY for Future Offline Materialization）

> [!IMPORTANT]
> **本節僅為提案分析，嚴格不在此 turn 實作、不修改任何源碼、不重跑測試、不變更任何現有資產。**

### 1. 證據保全前置（Preserve Bad Existing Assets）
在進行任何操作前，將現存之殘缺目錄完整備份至獨立的隔離目錄，保留檔案屬性與 timestamp 作為事故鑑定證據：
```bash
# 僅為未來操作指引，禁止在此 turn 執行
mkdir -p /private/tmp/pv-copilot-assets-diagnosis/evidence-backup
cp -a /private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/provider-assets/copilot/darwin-arm64 \
      /private/tmp/pv-copilot-assets-diagnosis/evidence-backup/darwin-arm64-bad-skeleton
```

### 2. 線下 Materialization 之兩種可用合法途徑（均無需網路／下載）

#### 途徑 A：從既有信任快取復原（Preferred Trust Cache Restore）
- **來源：** `/private/tmp/paperclip-portable-validation/packages/paperclip-runner/provider-assets/copilot/darwin-arm64`
- **依據：** 該目錄已通過 231/231 逐檔驗證，Closure SHA-256 為 `362f2663e967fb9e34a814bac4619cbf89e6b23069c4051ab1f2f686852d0a32`，與 repo pin 完全一致。
- **目標位置：**
  - `/private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/provider-assets/copilot/darwin-arm64`
  - `/private/tmp/pv-git-env-fixture-fix/server/provider-assets/copilot/darwin-arm64`
- **特性：** 檔案完全由 `.gitignore` 忽略，無任何 git tracked 變更。

#### 途徑 B：從本機 pnpm Store 二進位純線下解壓（Deterministic Offline Materialize）
- **來源：** `/private/tmp/pv-git-env-fixture-fix/node_modules/.pnpm/@github+copilot-darwin-arm64@1.0.88/node_modules/@github/copilot-darwin-arm64`
- **依據：** 本機套件雜湊完全符合官方 Pin，呼叫現有的 `materializePinnedCopilotBinary` 純函式即可在離線狀態下生成 100% 相同的 closure。

### 3. 線下修復實施的必要前置門禁 (Pre-Conditions for Next Turn)
1. 必須取得使用者的獨立授權 (Independent Human GO)。
2. 嚴禁更動源碼 `install-copilot-assets.mjs` 或放寬 `installation-integrity.ts` 的校驗標準。
3. 嚴禁使用 symlink 技巧或偽造 closure hash。
4. 在執行任何 build 或重跑 Phase 12 之前，必須先以純唯讀 Node 腳本驗收目標目錄的 231 個條目與 closure pin 100% 吻合。

---

## 六、 門禁判定與下一步界定 (Gate Decision & Bounded Next Step)

1. **Phase 12 恢復執行判定：** **STRICT NO-GO**
   - 在線下資產修復並通過唯讀 closure 驗證前，不得恢復 Phase 12。
   - Phases 13、14、15 嚴格維持 **NOT_RUN**。
2. **Tasks 進度維護：**
   - Task 2.14 唯讀診斷完成，產出本報告與 scratch 雜湊檔。
   - Task 4.4 維持未完成（Phase 12 中斷）。
   - Tasks 5.1 / 5.2 嚴格維持待辦。
   - 零程式碼變更、零 commit、零 push。
3. **下一步有界步驟 (Exact Next Bounded Step)：**
   - 靜候使用者對「是否核准線下保全殘缺資產並從 `oldcc56` 復原完整 copilot provider assets」做出明確決策。
