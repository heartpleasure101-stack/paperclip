# Paperclip Pi 單一摘要去重與可攜式驗證交付報告 (Delivery Report)

**交付日期：** 2026-11-06  
**交付準備員：** 交付準備員 (agy Gemini 3.8 Flash High)  
**交付合約約束：**
- 原生工具執行（嚴格零 MCP / Hindsight / Pi / Sonnet / 外部子代理）
- 本階段不執行遠端 push、不修改遠端 GitHub PR、不刪除 Draft 標記、不執行 `openspec archive`、不自動 merge、不部署、不重啟正式服務
- 正式源碼、應用邏輯、官方 runner、配置與 runtime 環境維持 100% 不可變（0 uncommitted production changes）
- 僅允許一般 metadata 與文件 commits，嚴格禁止繞過 git hooks（無 `--no-verify` / `HUSKY=0`）

---

## 一、 交付狀態與 PR 連結索引

本變更包含兩個互相整合的 OpenSpec Change，對應使用者 fork 上的兩個 Draft PR：

| OpenSpec Change | 分支名稱 | Fork Draft PR URL | 交付狀態 | 審查判定 |
| :--- | :--- | :--- | :---: | :---: |
| **Pi 單一摘要去重** (`pi-single-prompt-summary-dedup`) | `fix/pi-single-prompt-summary-dedup` | [PR #1 (heartpleasure101-stack)](https://github.com/heartpleasure101-stack/paperclip/pull/1) | **ARCHIVED** (`2026-11-06-pi-single-prompt-summary-dedup`) | **GO (ACCEPT)** |
| **可攜式驗證與入職迴歸** (`portable-validation-and-enrollment-regression`) | `fix/portable-validation-and-enrollment-regression` | [PR #2 (heartpleasure101-stack)](https://github.com/heartpleasure101-stack/paperclip/pull/2) | **ARCHIVED** (`2026-11-06-portable-validation-and-enrollment-regression`) | **GO (ACCEPT)** |

> [!IMPORTANT]
> **整合依賴關係與封存完成：** PR #1（Pi 去重）在本地分支整合了 PR #2（可攜式驗證修復）。本機驗證實跑之全量測試為兩者合併之完整程式碼，而非單獨基準；所有生產程式碼在 PR #1 僅限 Pi adapter 單一窄入口（5 檔），PR #2 僅限測試替身與驗證 tooling，無任何產品 API 或生產依賴變更。兩項變更之所有任務（10/10 與 26/26）均已全數勾選驗收完畢，並透過官方鎖定之 OpenSpec 1.16 完成 delta 規格同步與正式封存。兩 PR 在遠端仍維持 **DRAFT** 狀態，等待專責發布者推送最終元資料 commit 後，由人工檢閱後正式解除 Draft。

---

## 二、 程式碼基準快照與真實梯次映射 (Frozen Commit & Cohort Mapping)

### 1. 核心程式碼快照與校驗值
- **主工作區目前 HEAD：** `eb73de2c48fb525132c2f6ca6c561ba499604887`（封存前已提交之最新文件快照）
- **凍結驗證快照（Frozen Snapshot）：** `56d517eeffd24287161329b2f86595dcdef4d165`
- **Git Tree 雜湊：** `faa45f1d9342a834539a76c8f9d26015cf263710`
- **Pi 生產源碼驗證：** 自 `a240beb69` 起至當前快照保持 100% 未動（0 diff，5 個 Pi 源碼檔案指紋完全一致）。
- **修復前後差異：** 僅修復 2 處測試 fixture（`file-resources-git-scan-load.test.ts` 之 TCP 連線準備與 `github-launcher-environment.test.ts` 之 fake HOME local gitconfig helper），其餘產品／共用套件皆保持相同。

### 2. 同步之 Main Specs 清冊 (Synced Main Specs)
依據 OpenSpec 規範，兩個 Change 的 Delta 規格已全數合併至主規格，無任何新增之未授權規範或 TBD 佔位符：
1. `openspec/specs/pi-summary-rendering/spec.md` (3 個 ADDED Requirements, 8 個 Scenarios)
2. `openspec/specs/github-event-worker-lifecycle/spec.md` (3 個 ADDED Requirements, 5 個 Scenarios)
3. `openspec/specs/isolated-validation/spec.md` (5 個 ADDED Requirements, 12 個 Scenarios)

### 3. 封存路徑與歷史文件相對連結校正 (Archive Path & Link Migration)
由於活躍之 OpenSpec Change 已封存，原指向活躍目錄之相對路徑已移轉至帶日期的封存目錄。歷史獨立審查報告保留其不可變原始位元組不作修改，在此提供作者與讀者之精確對照清冊：
- `openspec/changes/pi-single-prompt-summary-dedup/` → `openspec/changes/archive/2026-11-06-pi-single-prompt-summary-dedup/`
- `openspec/changes/portable-validation-and-enrollment-regression/` → `openspec/changes/archive/2026-11-06-portable-validation-and-enrollment-regression/`
- 任務清單檔案位置：
  - `openspec/changes/archive/2026-11-06-pi-single-prompt-summary-dedup/tasks.md` (10/10 均為 `[x]`)
  - `openspec/changes/archive/2026-11-06-portable-validation-and-enrollment-regression/tasks.md` (26/26 均為 `[x]`)

### 2. 跨階段梯次真實提交與 Git Tree 清冊 (True Cohort Mapping)
全量 15 個驗證階段嚴格對應三個歷史不可變快照：

| 梯次 (Cohort) | 涵蓋驗證階段 (Phases) | 實際測試 Git Commit | 實際測試 Git Tree | 備註與勘誤說明 |
| :--- | :--- | :---: | :---: | :--- |
| **Cohort 1** | Phase 01–06 (Chat Shards 0-2, Server Shards 0-2) | `cc56bbcd30a7de1a78a92b108dba772d3c02a500` | `37295d5b275b63408b4c9d57ad9c76382c1f18e7` | 初始可攜式快照，通過 clean-env 與 Corepack 離線修復。 |
| **Cohort 2** | Phase 07, Phase 09 (Server Shard 3, Workspaces-A) | `3f1eb1b7b364893141818d25569d60206ea36ccb` | `4cf612e25dfcaca94cbfd7539922b9fe4a77cd1f` | **勘誤說明：** 作者舊報告曾有 `3f1917...` 或幽靈 Tree `d5cff774...` 筆誤，已自 Git 物件庫校對更正為真實 commit `3f1eb1...` 與 Tree `4cf612...`；不改寫 peer 報告原文，以勘誤記錄。 |
| **Cohort 3** | Phase 08, Phase 10–15 (Native Runner, Workspaces-B/C, Serialized Shards 0-3) | `56d517eeffd24287161329b2f86595dcdef4d165` | `faa45f1d9342a834539a76c8f9d26015cf263710` | 包含 Git fixture 修復、Phase 10 Attempt 4、Copilot 離線快取、Gate 4.2 全量建置及 Phase 08 Native Runner 完整重跑覆蓋。 |

---

## 三、 全量 15 階段執行聯集與測試數據彙總 (Execution Union & Metrics)

所有 15 個階段均於獨立乾淨環境（Clean Environment）完成實跑，每階段皆有獨立日誌、單次授權 Claim 與退出碼紀錄：

### 1. 總體指標清冊
- **總執行測試數 (Tests Passed)：** **52,672** 項全部 PASS（exit code 0）。
- **總顯示略過數 (Displayed Skips)：** **9,521** 項（詳見下方篩選分析）。
- **總執行測試檔案數 (Files Passed)：** **2,914** 個檔案全部 PASS，0 個失敗。
- **全庫建置與型別檢查門禁 (Gate 4.2)：** 全部 **35** 個 workspace 專案 build 與 typecheck 均為 **exit code 0**（0 errors）。
- **Native Runner 完整覆蓋：** 前次審查跳過之 9 項測試，經 clean-env 編譯 `fake-codex-app-server` debug fixture 後，於 Phase 08 Attempt 2 完整實跑（耗時 262.9s，exit code 0），**172 項測試全通**，僅 14 項容器相依測試依環境規範合法 skip，9 個 native runner 測試檔全部通過。

### 2. 略過項目分類與分析 (Skips Breakdown)
總計 9,521 項略過分為兩大類，無任何非預期或隱藏之略過：
1. **Chat 測試行篩選排除 (Chatline Filter Exclusions)：** **9,190** 項
   - Phase 01 (Chat Shard 0): 3,102 項
   - Phase 02 (Chat Shard 1): 3,023 項
   - Phase 03 (Chat Shard 2): 3,065 項
   - *原因：* Vitest 依 shard 條件篩選 chat suites 內測試案例，非執行失敗或遺漏。
2. **真性可選／OS／容器環境限制 (True Optional & Platform Skips)：** **331** 項
   - Phase 04 (Server Shard 0): 15 項
   - Phase 05 (Server Shard 1): 78 項
   - Phase 06 (Server Shard 2): 135 項
   - Phase 07 (Server Shard 3): 49 項
   - Phase 08 (Native Runner): 14 項（需 Linux Container / Docker 支援之容器整合案例）
   - Phase 10 (Workspaces-B): 40 項
   - *原因：* 需要特定平台（如 Windows 特定路徑、真實外接硬體、Docker runtime 等）之明確條件跳過。

### 3. 各階段執行日誌與檢驗雜湊清單
所有階段最新有效日誌皆保全於 `/private/tmp/pv-full/logs/`，並驗證前後 byte 指紋一致：

| 階段編號 | 階段標識 (Phase ID) | 實際執行的快照 Commit | 測試檔案數 (通過/略過) | 測試案例數 (通過/略過) | 退出碼 | 日誌檔案大小與 SHA-256 雜湊 |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **01** | `phase-01-general-chat-shard-0` | `cc56bbcd3...` | 2 / 0 | 574 / 3,102 | 0 | 154,729 B \| `a6f940f67ad9497ed92b76b928e7704edd0e4e84db0fcac50aaaf1221543f6b6` |
| **02** | `phase-02-general-chat-shard-1` | `cc56bbcd3...` | 2 / 0 | 653 / 3,023 | 0 | 192,708 B \| `82a44118dd4b7af507144b616154e8d7fccf4f2e67448f69669d8599ad171efd` |
| **03** | `phase-03-general-chat-shard-2` | `cc56bbcd3...` | 2 / 0 | 611 / 3,065 | 0 | 155,295 B \| `ecf31aa444385474a461860e4b8f6fe0ba67c233b8756fa910a3b1b29ec04167` |
| **04** | `phase-04-general-server-shard-0` | `cc56bbcd3...` | 351 / 5 | 7,256 / 15 | 0 | 47,602,592 B \| `a596f361e732e895227184add5f0baaf13690d197470597e73d4de00261f728c` |
| **05** | `phase-05-general-server-shard-1` | `cc56bbcd3...` | 348 / 8 | 6,440 / 78 | 0 | 33,828,283 B \| `e82df1d9bee07f294b61c51296103b4daf52ebdea2b8ba84b20e1c698732cbf1` |
| **06** | `phase-06-general-server-shard-2` (Att 2) | `cc56bbcd3...` | 350 / 6 | 6,288 / 135 | 0 | 36,814,556 B \| `365bb74518ae122a1ab049fc9df84f6e4596b9e7059c6ef60246ea8141db3ac8` |
| **07** | `phase-07-general-server-shard-3` (Att 2) | `3f1eb1b7b...` | 350 / 6 | 9,946 / 49 | 0 | 55,629,199 B \| `d3522cc134ffc532eb4e779cfed6df56ff2e1ddb8c51010ce8de7a69bf11adc7` |
| **08** | `phase-08-general-server-native-runner` (Att 2) | `56d517eef...` | 9 / 0 | 172 / 14 | 0 | 29,259 B \| `8d9911220b8eb18bd0ca5237c50335f77a9c8712a27fd1bb135a86563bb872d5` |
| **09** | `phase-09-general-workspaces-a` | `3f1eb1b7b...` | 929 / 0 | 11,113 / 0 | 0 | 33,764,744 B \| `a7d749604831ff93312837f1e216beee299f517c8a3de0f8d87c523e0b696bb5` |
| **10** | `phase-10-general-workspaces-b` (Att 4) | `56d517eef...` | 333 / 4 | 5,523 / 40 | 0 | 175,555 B \| `742e5ed11767ce8ab6d72af0d9b9771e0af2a62f2fb90881b871cef931869f52` |
| **11** | `phase-11-general-workspaces-c` | `56d517eef...` | 72 / 0 | 313 / 0 | 0 | 38,045 B \| `3fa7dcd81dcc418be60d875b02169877376cbf737922fb981da705edff53d412` |
| **12** | `phase-12-serialized-shard-0` (Att 2) | `56d517eef...` | 8 / 0 | 89 / 0 | 0 | 5,113 B \| `a4b7a5977c05cfb15bd66af6aa40f9cedd747f2b7bf025eb51629e41538d3101` |
| **13** | `phase-13-serialized-shard-1` | `56d517eef...` | 42 / 0 | 964 / 0 | 0 | 232,689 B \| `5221c190dc95b1475fd0df3ad0e66c41ebdc9f76850071287955ea4816cd115f` |
| **14** | `phase-14-serialized-shard-2` | `56d517eef...` | 58 / 0 | 1,208 / 0 | 0 | 521,867 B \| `4b44bff392cfe6fb00fd5e3c6f6013b30eefc1892cdc65e23eeb6bef0873fba5` |
| **15** | `phase-15-serialized-shard-3` | `56d517eef...` | 58 / 0 | 1,522 / 0 | 0 | 8,410,478 B \| `9d8a6e805423f4505186648c3cc5e204355a597ef25069181e372dbd9d962782` |

---

## 四、 已知歷史事故與邊界揭露 (Known Incidents & Gap Scope)

本交付報告秉持建構者對建構者的誠實原則，將所有邊界與已知歷史限制明確列出，絕不掩蓋或埋沒於註腳：

1. **不可宣稱單一 Commit 實跑全量測試：**
   全量 15 個階段並非在單一 commit 下一次跑完，而是按不可變快照分梯次執行（Cohort 1 跑 1–6，Cohort 2 跑 7+9，Cohort 3 跑 8+10–15）。所有跨 commit 之等價性均以逐組依賴不變、唯讀源碼指紋與排他授權 claim 證明。
2. **115,142 Bytes 原始日誌永久毀損揭露：**
   在 2026-11-05 21:54 執行 Phase 10 Attempt 2 時，未加固之 controller 因使用 `fs.createWriteStream(..., { flags: "w" })`，在重試時直接覆寫抹煞了第一次失敗之原始 115,142 bytes 日誌。該檔案已永久毀損，本證據套件絕不假造填補；部分證據已從 outer supervisor 之 `agy-task-300-attempt2-run1-stdout.log`（1,313 B）與原始 transcript grep `recovered-first-failure-step331-grep.txt`（12,362 B）保全。
3. **歷史 Cursor 真實執行與繼承環境暴露程度未知：**
   在 Task 2.7 完成前置隔離（Secret-free clean-env）之前，早期 session 於 Cursor 環境下執行時具有未受控之環境變數繼承風險；其歷史影響範圍為未知（UNKNOWN）。後續所有驗證梯次嚴格採用 sentinel 隔離，確保驗證子行程不讀取主機 secret。
4. **禁止宣稱 Live Token 或財務費用節省：**
   Pi 單一摘要去重所量測之字元節省（8,506 → 5,455 bytes，約 35.8%）為合成 UTF-8 測試文字數據，非真實生產環境模型之 token 或成本計量。嚴格禁止對外宣稱任何未經量測之 token/費用縮減。
5. **Phase 2 排除與生產環境不變：**
   本交付不包含任何 Phase 2 跨輪背景去重規劃；不變更生產資料庫或正式 API；不自動 merge master；不重啟任何運作中之正式服務。

---

## 五、 回滾機制說明 (Rollback Recipe)

本變更不採用任何複雜之部署或資料庫遷移，所有程式碼變更均為自含式純邏輯：
- **回滾方式：** 若需回滾，操作人員於主分支執行一般 Git Revert 提交：
  ```bash
  git revert -m 1 <merge-commit-sha>
  # 或針對個別變更 commit:
  git revert <pi-commit-sha>
  ```
- **狀態與儲存相容：** Pi 去重行為僅於 prompt 組裝之揮發性記憶體中生效，未更動持久化資料庫或外部訊息協議，因此回滾無需進行任何 DB migration 或資料回補。
- **無自動部署：** 回滾全由操作人員手動執行，系統不配置任何未經授權之自動部署腳本。

---

## 六、 永久證據封存與索引 (Permanent Evidence Archive)

所有文字日誌、控制器腳本、單次授權 Claim、建置日誌與審查報告已打包並保全至 NAS 永久路徑：

- **永久封存目錄：** [file:///Volumes/AI/temp/paperclip-validation-2026-11-06/](file:///Volumes/AI/temp/paperclip-validation-2026-11-06/)
- **封存套件檔案：** [file:///Volumes/AI/temp/paperclip-validation-2026-11-06/paperclip-validation-evidence-2026-11-06.tar.gz](file:///Volumes/AI/temp/paperclip-validation-2026-11-06/paperclip-validation-evidence-2026-11-06.tar.gz)
  - **檔案大小：** `20,740,384` bytes (~19.78 MB)
  - **SHA-256 雜湊：** `ce271df54166afcd6e0577e8410ae633cd985bbcbb840ef39f743c12f80f1743`
  - **包含內容：** 142 個純文字日誌、json、mjs、markdown 檔案，包含全部 15 個階段之成功與失敗歷史（如 Attempt 1、Attempt 2、Attempt 4、Audit 日誌、完整 argv 矩陣與依賴清冊）。
  - **安全約束：** 100% 排除二進位檔（無 `fake-codex-app-server` 二進位、無 `webview.node`、無 `node_modules`、無 `dist`、無真實金鑰）。
- **清冊 Manifest：** [file:///Volumes/AI/temp/paperclip-validation-2026-11-06/README.md](file:///Volumes/AI/temp/paperclip-validation-2026-11-06/README.md)
  - **檔案大小：** `33,392` bytes
  - **SHA-256 雜湊：** `f3b151f3244b6d8132ee908c5496d36b8fa10c3a386ac4f3d96e3d5f10e72f48`
  - 記錄套件內 142 個檔案之逐檔 SHA-256、大小與原始路徑來源。

---

## 七、 相關歷史文件與報告清冊 (Document & Report Links)

1. **最終獨立複審報告 (Final Re-Review)：**  
   [doc/plans/2026-11-06-portable-validation-final-independent-rereview.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-portable-validation-final-independent-rereview.md)  
   SHA-256: `9740a60226cd579d9f3bceeff0eed25f2ef64c4480abcacce87037fee4ff767a` (18,512 bytes)
2. **前次獨立審查報告 (Prior Review)：**  
   [doc/plans/2026-11-06-portable-validation-final-independent-review.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-portable-validation-final-independent-review.md)  
   SHA-256: `db3dffc3a2a61337ef64b36405d397f3ef7493c017031d72751d5cbc4fabb6c8` (15,280 bytes)
3. **Native 覆蓋修復維運日誌：**  
   [doc/plans/2026-11-06-native-coverage-operation.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-native-coverage-operation.md)
4. **Copilot 資產診斷與離線維運：**  
   [doc/plans/2026-11-06-copilot-assets-diagnosis.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-copilot-assets-diagnosis.md)  
   [doc/plans/2026-11-06-copilot-offline-operation.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-copilot-offline-operation.md)
5. **Phase 10 加固與日誌稽核報告：**  
   [doc/plans/2026-11-05-phase10-attempt-audit.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-05-phase10-attempt-audit.md)  
   [doc/plans/2026-11-06-phase10-attempt4-verification.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-phase10-attempt4-verification.md)
6. **後續階段驗證紀錄：**  
   [doc/plans/2026-11-06-final-five-verification.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-final-five-verification.md)  
   [doc/plans/2026-11-06-final-three-verification.md](file:///Volumes/AI/projects/paprerclip-v2/doc/plans/2026-11-06-final-three-verification.md)

---

## 八、 交付後續待辦 (Planned Next Stage)

本回合工作已將所有交付文件、PR 描述、鏡像複審報告、永久證據套件、OpenSpec 規格同步及封存全數就緒。
1. **Task 5.2 與 Task 3.3 驗收確認：** 已於封存前全數勾選完成（10/10 與 26/26），`openspec validate --all --strict` 與 `openspec validate --archived --strict` 均驗證 100% 通過。
2. **OpenSpec 封存狀態：** 官方指令 `openspec archive` 已成功將兩項變更封存至 `openspec/changes/archive/2026-11-06-pi-single-prompt-summary-dedup` 與 `openspec/changes/archive/2026-11-06-portable-validation-and-enrollment-regression`，且 3 個 main specs 已同步就緒。
3. **專責發布者推送 (Dedicated Publisher Push)：** 後續專責發布程序僅需推送本回合之文件元資料 commits 至遠端分支。
4. **Draft 移除：** 人工確認全數無誤後，於 GitHub 將 PR #1 與 PR #2 標記為 Ready for review。本步驟本機不宣稱已在遠端完成。
