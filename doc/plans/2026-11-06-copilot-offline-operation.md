# Copilot 離線資產準備、Gate 0 靜態驗收與 Phase 12 Attempt 2 通過報告

**文件路徑：** `doc/plans/2026-11-06-copilot-offline-operation.md`  
**報告日期：** 2026-11-06  
**執行角色：** 離線維運執行員（Gemini 3.8 Flash High, Bounded Offline Copilot Asset Operator）  
**操作約束：** 
- 原生環境工具操作，零 MCP / Hindsight / Pi / Sonnet / 外部代理。
- 嚴格不執行真實 Copilot / Cursor 二進位本體（禁止 `--version`、原生 import、動態 materializer）。
- 嚴格不修改正式源碼、pins、verifier、測試檔案、clean-env、控制器或授權檔案。
- 零網路存取、零套件下載、不更動全域設定與憑證。
- 嚴格保留損壞資產證據，不刪除、不直接覆蓋；鏡像報告採 EXACT bytes 保全。
- 嚴格遵守「遇任一失敗立即停機（Fail-Stop），後續組維持 NOT_RUN」規範。

---

## 一、 執行總結與決策門禁矩陣 (Executive Decision Matrix)

| 審核與執行項目 | 判定結果 | 關鍵事實依據與指標 |
| :--- | :---: | :--- |
| **(1) 信任快取資格與來源** | **PASSED & VERIFIED** | 採用 `oldcc56` (`/private/tmp/paperclip-portable-validation`)：231 條目、二進位本體 (`copilot`, 152,595,280 bytes, SHA-256: `a9ff8babb10b7e443182ae96a8bc50a9c826ef1c773e1344c396eb5bf7f512c3`)、Closure Pin (`362f2663e967fb9e34a814bac4619cbf89e6b23069c4051ab1f2f686852d0a32`) 100% 吻合，0 符號連結、0 額外檔案。 |
| **(2) 損壞資產保全 (Bad Assets)** | **PRESERVED & ISOLATED** | 兩處殘留骨架經純靜態盤點（107 個檔案，142 項條目），清冊與 SHA-256 存入 `bad-assets-inventory.json`（135,984 bytes），骨架目錄以 `mv` 隔離移至 `/private/tmp/pv-copilot-offline-operation/evidence/`，無刪除、無覆蓋。 |
| **(3) 離線 APFS 快照部署** | **DEPLOYED (APFS CLONE)** | 透過 `cp -c -R` 將受信任快取完整復原至 `packages/paperclip-runner/provider-assets/copilot/darwin-arm64` 及 `server/provider-assets/copilot/darwin-arm64`。部署後經靜態 Node fs/crypto 審查完全通過，Git status 保持 100% clean。 |
| **(4) Gate 0 前置編譯驗收** | **PASSED (EXIT 0)** | 於 clean-env 下執行 `pnpm --filter @paperclipai/paperclip-runner build:typescript`，腳本進入 `verified-existing` 分支，未調用真實二進位檔、無網路請求。Attempt 2 退出碼 0，日誌 SHA-256: `c58a7cf498cb...`。 |
| **(5) Phase 12 Attempt 2 執行** | **PASSED (EXIT 0)** | 核發全新單次授權 `auth-phase12-serialized-shard0-attempt2-20261106-bound-op-gemini`，由 R3 控制器原子建立 claim。8 個測試套件全數通過（含 17 個維護測試），共計 89 項測試全數通過（89 passed, 0 failed, 0 skipped），耗時 302.0s。 |
| **(6) 後續階段凍結 (Fail-Stop)** | **STRICT NOT_RUN** | Phases 13、14、15 嚴格維持 **NOT_RUN**，0 次執行、0 位元組日誌。 |
| **(7) 任務進度狀態** | **TASK 2.14 COMPLETED** | Task 2.14 滿足完成條件標記 `[x]`；Task 4.2、4.4、5.1、5.2 嚴格維持 `[ ]` 待辦。 |

---

## 二、 關鍵檔案、憑證與日誌雜湊矩陣

| 項目 | 實體路徑 | 位元組大小 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :---: | :--- | :---: |
| **R3 硬化控制器** | `/private/tmp/pv-full/run-phases.mjs` | 26,785 | `9de644399adc7ac8b2468f95155a16400e27269c1353c2888ad031a53a94bfd0` | 唯讀不變 |
| **前置 Live 備份** | `/private/tmp/pv-copilot-offline-operation/manifest-pre-phase12-attempt2.bak.json` | 53,406 | `7d2e0fcbd5992324ba92fc015429e799420608e658b19dad920098d131b1237a` | `wx` 排他建立 |
| **最新 Live Manifest** | `/private/tmp/pv-full/manifests/phase-manifest.json` | 54,126 | `982f2642c9d5fac0be2f158c1f530a1bdbb5c81641e86fb7bab0713d9fa7c7df` | 記錄 Phase 12 通過 |
| **最新 Mirror Manifest** | `/private/tmp/pv-full/phase-manifest.json` | 54,126 | `982f2642c9d5fac0be2f158c1f530a1bdbb5c81641e86fb7bab0713d9fa7c7df` | 逐 byte 相同 |
| **Phase 12 Attempt 2 授權檔** | `/private/tmp/pv-copilot-offline-operation/run-authorization.phase12.attempt2.json` | 990 | `731bd8141341ecd7ccd206b5ebc5d7e557a1070ce9518305c0e7b836bac46d69` | 已消費標記 |
| **Phase 12 Attempt 2 Claim** | `/private/tmp/pv-full/logs/.authorization-claims/auth-phase12-serialized-shard0-attempt2-20261106-bound-op-gemini.claim.json` | 496 | `b91caedc8a23afed90da685a857e7bfbdd406a22c17b73d93d956bc7b14dd032` | `wx` 原子建立 |
| **Gate 0 Attempt 2 日誌** | `/private/tmp/pv-copilot-offline-operation/gate0-build-typescript.attempt2.raw.log` | 1,668 | `c58a7cf498cb56e27a398a79bde3e1f0fa42d7245ea8ca0e2a76128039d98e69` | exit 0 `verified-existing` |
| **Phase 12 Attempt 1 日誌 (保全)** | `/private/tmp/pv-full/logs/phase-12-serialized-shard-0.attempt1.log` | 6,797 | `64b25e8f2233797435d1a22036e029032510a599fe9edcf71046865c1fad9220` | exit 1 失敗原貌留存 |
| **Phase 12 Attempt 2 日誌 (通過)** | `/private/tmp/pv-full/logs/phase-12-serialized-shard-0.attempt2.log` | 5,113 | `a4b7a5977c05cfb15bd66af6aa40f9cedd747f2b7bf025eb51629e41538d3101` | exit 0 全量通過 |
| **損壞骨架完整清冊** | `/private/tmp/pv-copilot-offline-operation/evidence/bad-assets-inventory.json` | 135,984 | `2ecf5acc20adfd85586c8070f20315b1f14795027352dc83480707b7fd0601f3` | 107 檔案雜湊記錄 |
| **前置診斷鏡像報告** | `doc/plans/2026-11-06-copilot-assets-diagnosis.md` | 14,553 | `66402410f6131ffb232eee7f79ef6a80dd509ba75abd957fa098fb702140906a` | EXACT bytes 鏡像 |
| **獨立審查鏡像報告** | `doc/plans/2026-11-06-copilot-assets-independent-review.md` | 12,738 | `a5769079f3b695ca5e7474d27b958dd300f1c89883ea83dec8915077e6fab4da` | EXACT bytes 鏡像 |

---

## 三、 因果修正與報告鏡像說明 (Causal Correction on Peer Diagnosis)

1. **同儕報告保全與鏡像：**
   - 診斷報告 `/private/tmp/pv-copilot-assets-diagnosis/2026-11-06-copilot-assets-diagnosis.md`（SHA-256: `66402410f6131ffb232eee7f79ef6a80dd509ba75abd957fa098fb702140906a`）已以 EXACT bytes 鏡像備份至 `doc/plans/2026-11-06-copilot-assets-diagnosis.md`。
   - 審查報告（SHA-256: `a5769079f3b695ca5e7474d27b958dd300f1c89883ea83dec8915077e6fab4da`）亦以 EXACT bytes 鏡像備份至 `doc/plans/2026-11-06-copilot-assets-independent-review.md`。
   - 依規範嚴禁直接竄改同儕既有文件之內容，所有修正於本報告獨立載明。

2. **因果歷史修正 (Correction: CAUSE UNKNOWN)：**
   - 診斷報告原推測「歷史清理（如 `git clean -fdx -e node_modules`）造成骨架殘留」。
   - **本執行員查核判定：** 殘存目錄中僅留存包含 `node_modules` 的 3 個子目錄骨架屬於**現象與檔案模式（Pattern）**，並非執行過特定 shell 指令的決定性歷史證據。在缺乏明確終端紀錄的情形下，歷史成因必須嚴格認定為 **UNKNOWN（未知）**。

---

## 四、 離線資產準備與 Gate 0 驗收過程

1. **證據隔離保全：**
   - 盤點 runner 與 server 兩處損壞目錄：各含 107 個檔案、142 個檔案系統項目。
   - 產出 `bad-assets-inventory.json`，詳細記載所有檔案之路徑、大小、權限與 SHA-256。
   - 執行原子目錄重命名，將殘留目錄移入 `/private/tmp/pv-copilot-offline-operation/evidence/` 保存，絕無執行 `rm`、`rmdir` 或覆寫操作。

2. **APFS 離線複製與靜態審核：**
   - 透過 `cp -c -R` 從受信任快取複製至 runner 與 server 兩處目錄。
   - 執行獨立唯讀 Node fs/crypto 審查腳本驗算：
     - 二進位檔 `copilot`：152,595,280 bytes，SHA-256 `a9ff8babb10b7e443182ae96a8bc50a9c826ef1c773e1344c396eb5bf7f512c3`。
     - 清單檔 `.paperclip-copilot-closure.json`：42,095 bytes，SHA-256 `dd486bd8babde5433d40fec7167e9d69e39d4fd5e0113111b375068d3b724602`。
     - 封閉清單 231 條目逐檔驗證 100% 吻合，Closure Hash 為 `362f2663e967fb9e34a814bac4619cbf89e6b23069c4051ab1f2f686852d0a32`。
     - 磁碟檔案數 232（231 資產 + 1 清單），0 符號連結、0 額外檔案。
     - 目錄受 `.gitignore` 排除，Git 工作區 100% clean。

3. **Gate 0 前置編譯執行：**
   - 在 clean-env 下執行 `pnpm --filter @paperclipai/paperclip-runner build:typescript`。
   - 首次嘗試（Attempt 1）因沙盒寫入權限限制中斷，日誌保留於 `gate0-build-typescript.raw.log`。
   - 在獲授權之原生執行模式下執行 Attempt 2：
     - `check:acpx-profiles` 通過。
     - `ensure:eval-build-deps` 通過。
     - `check:protocol-types` 通過。
     - `tsc` 編譯通過。
     - `install-copilot-assets.mjs` 偵測目標目錄已存在（`EEXIST` 分支），執行靜態 `verifyCopilotInstallation()` 輸出：
       `Copilot runtime assets: verified-existing (darwin-arm64)`。
     - 退出碼 0，無真實 Copilot 行程啟動，無網路請求。

---

## 五、 Phase 12 Attempt 2 執行詳情與測試指標

1. **執行設定：**
   - **單次授權 ID：** `auth-phase12-serialized-shard0-attempt2-20261106-bound-op-gemini`
   - **R3 控制器：** `/private/tmp/pv-full/run-phases.mjs`
   - **環境變數：** Node 24 (`v24.18.0`)、Python 3.9、Git 2.56、Rust 1.97、Corepack LKG 9.15.4、`CARGO_NET_OFFLINE=true`、`CI=1`。
   - **指令：**
     ```bash
     env PAPERCLIP_MANIFEST_PATH=/private/tmp/pv-full/manifests/phase-manifest.json \
         PAPERCLIP_MIRROR_MANIFEST_PATH=/private/tmp/pv-full/phase-manifest.json \
         PAPERCLIP_LOGS_DIR=/private/tmp/pv-full/logs \
         PATH="/Users/Hermes/.nvm/versions/node/v24.18.0/bin:/private/tmp/pi-dedup-git-toolchain/bin:/private/tmp/pi-dedup-rust-toolchain/cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" \
         /Users/Hermes/.nvm/versions/node/v24.18.0/bin/node /private/tmp/pv-full/run-phases.mjs phase-12-serialized-shard-0 \
         --run-authorization /private/tmp/pv-copilot-offline-operation/run-authorization.phase12.attempt2.json
     ```

2. **執行指標與結果：**
   - **執行耗時：** 302.0 秒（5 分 2 秒）。
   - **退出碼：** `0` (PASSED)。
   - **測試檔案覆蓋：** 8 passed, 0 failed, 0 skipped（8 total）。
   - **測試案例覆蓋：** 89 passed, 0 failed, 0 skipped（89 total）。
   - **關鍵維護測試驗證：**
     `server/src/__tests__/maintenance-server-routes.test.ts` 全部 17 個案例全數順利執行並通過（耗時 280.2 秒），包含 90 秒真實靜止等待與兩小時視窗驗證；先前 Attempt 1 之 `COPILOT_INSTALLATION_INVALID` 錯誤完全排除。
   - **日誌檔案保存：**
     - Legacy Attempt 1 日誌（6,797 bytes，SHA-256: `64b25e8f...`）原貌保留。
     - Attempt 2 日誌（5,113 bytes，SHA-256: `a4b7a597...`）以 `wx` 原子寫入。
     - 控制器偵測別名日誌已存在，安全保留 legacy 別名，指向 Attempt 2 獨立日誌。

---

## 六、 歷史 115 KB 落差揭露 (Prior 115 KB Historical Gap)

在 Phase 10 調試過程中，曾產生約 115 KB 之日誌與快取調整落差（已登錄於 Task 2.13 稽核）。本報告持續揭露該項歷史落差，所有舊有 raw 日誌雜湊維持不變，未進行任何靜默覆寫或假造。

---

## 七、 任務進度與門禁判定 (Tasks Accounting & Gate Decision)

1. **OpenSpec 25 項任務狀態：**
   - **已完成 (21 項)：** 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, **2.14**, 3.1, 3.2, 3.3, 4.1, 4.3。
   - **未完成／待辦 (4 項)：**
     - **4.2**：不可變整合快照之 preflight、blockers 及 typecheck/build closure（因全庫 build 閉包尚未在全量測試前執行，依嚴格保守定義維持 `[ ]`）。
     - **4.4**：全官方等價測試組執行（Phases 13–15 尚未執行，維持 `[ ]`）。
     - **5.1**：獨立驗證與審查交付（維持 `[ ]`）。
     - **5.2**：完整證據與回滾指示提交（維持 `[ ]`）。

2. **停機與邊界聲明：**
   - 本操作員僅執行 Phase 12 Attempt 2，嚴格不啟動 Phases 13–15。
   - 嚴格禁止推動 PR、不部署、不自封存。全流程完工停機。
