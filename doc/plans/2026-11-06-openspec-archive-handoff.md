# OpenSpec 規格封存與交付交接手冊 (Archive Handoff Document)

**日期：** 2026-11-06  
**執行角色：** 規格封存與交接員 (DirectGemini3.8FlashHigh FINALDOC/ARCHIVER)  
**交接對象：** 專責發布者 (Dedicated Publisher) 與人類審查者 (Human Reviewer)  

---

## 一、 封存成果與核心指標摘要

本變更之兩項 OpenSpec Change 已於 2026-11-06 正式完成 100% 驗收，並透過官方鎖定之 OpenSpec 1.16 完成 Delta 規格向 Main Spec 之智慧同步與歸檔移轉。

### 1. 核心程式碼與快照雜湊
- **主工作區 HEAD：** `eb73de2c48fb525132c2f6ca6c561ba499604887`（`fix/pi-single-prompt-summary-dedup`）
- **修復分支基準 HEAD：** `599d7a6cd37f410274fe5ebd7d071e80e7f0f6f1`（`fix/portable-validation-baseline`）
- **不可變凍結測試快照 (Frozen Snapshot Commit)：** `56d517eeffd24287161329b2f86595dcdef4d165`
- **不可變凍結 Git Tree 雜湊：** `faa45f1d9342a834539a76c8f9d26015cf263710`
- **Pi 5 檔源碼指紋：** 自 `a240beb69` 起至當前快照 100% 零修改（0 diff，24 個測試案例全部通過）。

### 2. 梯次快照清冊 (Cohort Mapping)
- **Cohort 1 (Phase 01–06):** Commit `cc56bbcd30a7de1a78a92b108dba772d3c02a500` | Git Tree `37295d5b275b63408b4c9d57ad9c76382c1f18e7`
- **Cohort 2 (Phase 07, 09):** Commit `3f1eb1b7b364893141818d25569d60206ea36ccb` | Git Tree `4cf612e25dfcaca94cbfd7539922b9fe4a77cd1f`
- **Cohort 3 (Phase 08, 10–15):** Commit `56d517eeffd24287161329b2f86595dcdef4d165` | Git Tree `faa45f1d9342a834539a76c8f9d26015cf263710`

### 3. 全量測試數據與門禁清冊
- **總執行測試數 (Tests Passed)：** **52,672** 項全數 PASS（exit code 0）。
- **略過項目明細 (Skips Breakdown)：**
  - **9,190** 項：Chatline Shard 篩選排除（Phase 01–03 依照 shard 參數劃分，非失敗）。
  - **331** 項：真性可選／OS／容器環境限制（依規格合法 skip）。
- **全庫建置與型別檢查 (Gate 4.2)：** 全部 **35** 個 workspace 專案 build 與 typecheck 均為 exit code 0（0 errors）。
- **Native Runner 完整覆蓋：** 9 個 native runner 測試檔全數通過，172 項測試 PASS，無任何未授權跳過或部分略過（14 項容器相依測試依法規 skip）。

---

## 二、 規格封存與主規格清冊 (Archived Changes & Synced Main Specs)

### 1. 封存目錄位置
- `openspec/changes/archive/2026-11-06-pi-single-prompt-summary-dedup/`
  - `tasks.md`：10/10 項任務全部標記為 `[x]`，狀態 `all_done`。
  - 保留完整 `.openspec.yaml`、`proposal.md`、`design.md`、`specs/`。
- `openspec/changes/archive/2026-11-06-portable-validation-and-enrollment-regression/`
  - `tasks.md`：26/26 項任務全部標記為 `[x]`，狀態 `all_done`。
  - 保留完整 `.openspec.yaml`、`proposal.md`、`design.md`、`specs/`。

### 2. 同步之主規格 (Main Specs)
1. [openspec/specs/pi-summary-rendering/spec.md](file:///Volumes/AI/projects/paprerclip-v2/openspec/specs/pi-summary-rendering/spec.md)
   - 包含 3 個權威 SHALL 需求，8 個完整 Scenarios，無 TBD 佔位。
2. [openspec/specs/github-event-worker-lifecycle/spec.md](file:///Volumes/AI/projects/paprerclip-v2/openspec/specs/github-event-worker-lifecycle/spec.md)
   - 包含 3 個權威 SHALL 需求，5 個完整 Scenarios，無 TBD 佔位。
3. [openspec/specs/isolated-validation/spec.md](file:///Volumes/AI/projects/paprerclip-v2/openspec/specs/isolated-validation/spec.md)
   - 包含 5 個權威 SHALL 需求，12 個完整 Scenarios，無 TBD 佔位。

### 3. OpenSpec 嚴格驗證結果 (Strict Validation)
```text
✓ spec/github-event-worker-lifecycle
✓ spec/isolated-validation
✓ spec/pi-summary-rendering
Totals: 3 passed, 0 failed (3 items)

✓ change/2026-11-06-pi-single-prompt-summary-dedup
✓ change/2026-11-06-portable-validation-and-enrollment-regression
Totals: 2 passed, 0 failed (2 items)
```

---

## 三、 已知歷史邊界與誠實揭露清單

1. **115,142 Bytes 原始日誌毀損：**  
   歷史 Phase 10 Attempt 2 失敗日誌因重試覆寫毀損，已從 supervisor stdout（1,313 B）與 transcript grep（12,362 B）保全部分事實，不假造補齊。
2. **歷史 Cursor 安全暴露範圍：**  
   Task 2.7 前早期 session 於 Cursor 執行時繼承主機變數之風險評定為 UNKNOWN；後續梯次全數以 sentinel 證明完全隔離。
3. **隔離邊界定義：**  
   Clean-env 為行程層級環境過濾與 HOME 重新導向，明確不宣稱等同作業系統容器（OS sandbox）。
4. **Token 與財務節省規範：**  
   測試之字元縮減（約 35.8%）為 UTF-8 合成測試字元，禁止對外宣稱真實模型 Token 或成本費用縮減。
5. **Phase 2 排除：**  
   嚴格不包含任何跨輪背景去重邏輯，生產環境 API 與資料庫未發生任何變更。

---

## 四、 永久證據封存與交接給發布者事項

- **NAS 封存檔案：** `/Volumes/AI/temp/paperclip-validation-2026-11-06/paperclip-validation-evidence-2026-11-06.tar.gz`
  - 大小：`20,740,384` bytes
  - SHA-256：`ce271df54166afcd6e0577e8410ae633cd985bbcbb840ef39f743c12f80f1743`
  - 檔案數：142 個純文字檔案
- **NAS Manifest：** `/Volumes/AI/temp/paperclip-validation-2026-11-06/README.md`
  - SHA-256：`f3b151f3244b6d8132ee908c5496d36b8fa10c3a386ac4f3d96e3d5f10e72f48`
- **發布者待辦（非本機代理權限）：**
  - 本手冊與交付報告明確**不宣稱**遠端已上傳最終 commit 或解除 PR Draft。
  - 專責發布者接手後，負責推送主分支與修復分支之最終元資料 commits，並在人工檢驗無誤後於 GitHub PR 頁面移除 Draft。
