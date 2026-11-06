# 2026-11-05 Corepack Offline Independent Review

## 1. 摘要與判定 (Verdict)

- **Task 2.9 (Phase 06 離線 pnpm 解析與控制項):** **GO (通過)**
- **Task 4.2 (整合快照 Preflight 與 Blocker 回歸):** **GO (通過)**
- **Phases 01–05 保留重用 (Reuse Assessment):** **GO (核准重用)**
- **Phases 06–15 恢復執行 (Resume Execution):** **GO (核准恢復)**
- **即時異常警告 (Infrastructure Flag):** `/Volumes/AI` 於 16:21:39 發生 SMB 連線中斷 (`Socket is not connected` / `mkdir /Volumes/AI: permission denied`)，本報告已完整暫存於 Artifact 與本機 Scratch，待原儲存磁區重新掛載後即可寫入原 repo 目標路徑。

---

## 2. 不可變源碼與快照身分驗證

| 項目 | 預期值 | 實際獨立核驗結果 | 狀態 |
|---|---|---|---|
| **Snapshot Repo** | `/private/tmp/paperclip-portable-validation` | `/private/tmp/paperclip-portable-validation` | 一致 |
| **HEAD Commit** | `cc56bbcd30a7de1a78a92b108dba772d3c02a500` | `cc56bbcd30a7de1a78a92b108dba772d3c02a500` | 一致 |
| **Tracked Tree** | `37295d5b275b63408b4c9d57ad9c76382c1f18e7` | `37295d5b275b63408b4c9d57ad9c76382c1f18e7` | 一致 |
| **Git Status** | 乾淨 (0 dirty entries) | `git status --porcelain` 輸出為空 | 乾淨 |
| **測試前後狀態** | 源碼完全零改動 | 執行聚焦測試與 Preflight 後，Tree/HEAD/Status 完全一致 | 零修改 |

---

## 3. Corepack 離線機制與 5 項控制項獨立驗證 (Task 2.9)

### 3.1 原始碼解析 (Corepack v0.35 `getDefaultVersion`)

經核查 Node v24.18.0 內建之 Corepack (`/Users/Hermes/.nvm/versions/node/v24.18.0/lib/node_modules/corepack/dist/lib/corepack.cjs`，第 13712–13735 行)：
1. 若 `package.json` 未宣告 `packageManager`，Corepack 呼叫 `getDefaultVersion(packageManager)`。
2. 該函式首先呼叫 `getLastKnownGood()` 讀取 `COREPACK_HOME/lastKnownGood.json`。
3. 若存在設定，直接返回 `lastKnownGood[packageManager]`，完全不嘗試網路請求。
4. 若無 `lastKnownGood.json` 且未設定 `COREPACK_DEFAULT_TO_LATEST=0`，則呼叫 `fetchLatestStableVersion2` 查詢 npm registry。在 `COREPACK_ENABLE_NETWORK=0` 隔離環境下，該呼叫立即拋出網路禁用錯誤。

### 3.2 自有獨立快取目錄 (`/private/tmp/pv-corepack-review`) 5 項控制項實測

在全新且獨立的 `/private/tmp/pv-corepack-review` 複製快取中，完全透過 `validation-clean-env.mjs`（`COREPACK_ENABLE_NETWORK=0`）執行 5 項對照實驗：

| 編號 | 控制項情境 | 專案配置 / 快取狀態 | 執行指令 | 退出碼 | 輸出關鍵內容 | 判定 |
|---|---|---|---|---|---|---|
| **1** | **已宣告專案離線執行** | `packageManager: "pnpm@9.15.4"`，快取含 `v1/pnpm/9.15.4`，**無** `lastKnownGood.json` | `pnpm --version` | `0` | `9.15.4` | 驗證通過 |
| **2** | **修復前未宣告專案失敗** | `{ private: true }`，無 `packageManager`，**無** `lastKnownGood.json` | `pnpm --version` | `1` | `Network access disabled by the environment; can't reach npm repository https://registry.npmjs.org` | 驗證通過 (精確重現 Phase 06 根因) |
| **3** | **公開 CLI 啟用已快取版本** | 快取含 `v1/pnpm/9.15.4`，**無** `lastKnownGood.json` | `corepack prepare pnpm@9.15.4 --activate` | `0` | `Preparing pnpm@9.15.4 for immediate activation...`；產生 `lastKnownGood.json`（`{"pnpm": "9.15.4"}`） | 驗證通過 |
| **4** | **啟用後未宣告專案離線成功** | `{ private: true }`，無 `packageManager`，**具備** `lastKnownGood.json` | `pnpm --version` | `0` | `9.15.4` | 驗證通過 (離線解析完全解鎖) |
| **5** | **空快取 Canary 負向測試** | `/private/tmp/pv-corepack-review/empty-home` (完全空白快取目錄) | `corepack prepare pnpm@9.15.4 --activate` | `1` | `Usage Error: Network access disabled by the environment; can't reach https://registry.npmjs.org/pnpm/-/pnpm-9.15.4.tgz` | 驗證通過 (無偷渡網路、安全退出) |

### 3.3 正式快取工具鏈雜湊核驗 (`/private/tmp/pv-clean-tools/corepack`)

核驗正式隔離快取目錄，確認僅新增 `lastKnownGood.json`（`{"pnpm": "9.15.4"}`），受信任之 pnpm 二進位檔案雜湊完全未變動：
- `bin/pnpm.cjs`: `98e6b99a881d64a1cc982c3e60aa260bf02160386b12e74475e06486dc74b090` (比對相符)
- `dist/pnpm.cjs`: `4c319da726786d5535aef95fa78ec5e24f1079382da878a35fa5dd044a7bab96` (比對相符)
- 主機全域 Node/prefix 與 Corepack 全域狀態完全未受改動。

---

## 4. 聚焦測試與 Preflight 獨立執行結果 (Task 4.2)

在不可變快照（HEAD `cc56bbcd30a7`）上，透過乾淨隔離環境配方執行：

### 4.1 聚焦測試：`server/src/__tests__/vitest-chat-shards.test.ts`
- **執行指令：**
  ```sh
  /Users/Hermes/.nvm/versions/node/v24.18.0/bin/node /private/tmp/paperclip-portable-validation/scripts/validation-clean-env.mjs \
    --bin /private/tmp/pi-dedup-git-toolchain/bin \
    --bin /private/tmp/pi-dedup-rust-toolchain/cargo/bin \
    --bin /usr/bin --bin /opt/homebrew/bin \
    --set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack \
    --set CARGO_HOME=/private/tmp/pi-dedup-rust-toolchain/cargo \
    --set RUSTUP_HOME=/private/tmp/pi-dedup-rust-toolchain/rustup \
    --set CARGO_NET_OFFLINE=true --set CI=1 \
    -- /bin/sh -c "cd /private/tmp/paperclip-portable-validation && pnpm --filter @paperclipai/server exec vitest run src/__tests__/vitest-chat-shards.test.ts"
  ```
- **執行結果：** **PASSED (exit 0)**，耗時 6.35s。
- **斷言驗證：**
  - 原 45s (run) / 120s (test) 逾時限制維持不變。
  - 完整執行並驗證 7 個 trace cases 恰好一次：`["a", "b", "c", "d", "nested-first", "nested-second", "top"]`。
  - 故意失敗 fixture 傳遞斷言（`fixture failure`）經二次 spawn 驗證非零退出碼，斷言完整保留。

### 4.2 全量 Preflight：`validation-preflight.mjs --stage full`
- **執行結果：** **PASSED (exit 0)**。
- 10 項前置工具檢查全數通過：
  1. Node: v24.18.0 (>=24.11.0)
  2. pnpm: 9.15.4 (needs 9+)
  3. Git: 2.56.0
  4. Git rev-list: `--stdin` accepts `--not`
  5. Python: 3.9.6 (needs 3.9+)
  6. rustc: 1.97.1
  7. cargo: 1.97.1
  8. rustfmt: 1.9.0-stable
  9. Filesystem: local non-SMB
  10. Snapshot: HEAD `cc56bbcd30a7` tree `37295d5b275b` (0 uncommitted)

### 4.3 隔離環境與 Preflight 單元測試
- **執行指令：** `node --test scripts/validation-clean-env.test.mjs scripts/validation-preflight.test.mjs`
- **執行結果：** **19 passed, 0 failed** (clean-env 7 項、preflight 12 項)。

---

## 5. Phases 01–05 保留重用與跳過案例評估 (Reuse Assessment)

### 5.1 測試選集與依賴性盤點
- **Phase 01–03 (General Chat Shards 0–2):**
  - 選集僅含 `chat-channels.integration.test.ts` 與 `chat-channel-sync.test.ts`。
  - 累計執行測試數：574 + 653 + 611 = 1838 tests。
  - 累計 skipped 測試數：3102 + 3023 + 3065 = 9190 tests。
  - **核驗結論：** 9190 skipped tests 確為 Vitest chat line-filtering 排除之測試（每次執行透過行號過濾 2/6 shards，未選中的其他行號測試被 Vitest 標記為 skipped）。
- **Phase 04–05 (General Server Shards 0–1):**
  - 分別執行 356 個測試套件檔。
  - 全數測試均在根專案運行，根專案 `package.json` 已明確宣告 `"packageManager": "pnpm@9.15.4"`。
  - 全量搜尋 Phase 04 與 05 選中之 712 個測試檔案，僅 3 個檔案出現 pnpm/corepack 字樣：
    1. `server/src/__tests__/local-service-supervisor.test.ts`: 純字串匹配斷言，未呼叫二進位檔。
    2. `server/src/services/native-runtime/native-session-executor.test.ts`: lockfile 與路徑結構驗證，未呼叫二進位檔。
    3. `server/scripts/typecheck-layers.test.mjs`: 使用 stub mock 函式，未呼叫二進位檔。
  - 真正建立未宣告微型專案並呼叫 pnpm 的唯一測試檔 `vitest-chat-shards.test.ts` 位於 **Phase 06**（Shard 2），完全未進入 Phase 01–05。
  - **真實 Skip 案例：** Phase 04 (15 skips) 與 Phase 05 (78 skips，如 `run-failure-sentry-real-sdk.test.ts` 因 `@sentry/node` 非必要依賴而 skip) 均為既有平台或選配 SDK 標記，完全與 Corepack 無涉。
- **重用判定：** **GO (核准保留)**。先前通過之正向、負向與 skip 行為在新增 `lastKnownGood.json` 後不可能發生任何改變。

---

## 6. 運維執行器審查 (`/private/tmp/pv-full/run-phases.mjs`)

### 6.1 審查比對 (v.s. `run-phases.mjs.orig`)
- **參數與環境：** 完全保留 `phase.fullArgv`，無任何改動或過濾。
- **日誌串流與終端機保護：** 移除終端機巨量 raw log echo，改以 30 秒心跳進度回報；完整寫入所有 raw bytes 至按次編號日誌檔。
- **串流同步：** close 事件後明確等待 `logStream.end(res)` finish，杜絕讀寫 race condition。
- **退出碼與信號：** 支援 `resolvedCode = signal ? 128 + ... : exitCode`，無任何假通過路徑。
- **不可變防護：** 執行前後呼叫 `checkFrozenCode` 嚴格核對 `git rev-parse HEAD` 與 `git status --porcelain`。
- **中斷機制：** 非零退出碼立即 `process.exit(code)` 中止管線。

### 6.2 發現與建議事項 (Findings & Suggestions)

> [!WARNING] **Warning 1: Attempt 1 日誌覆蓋風險 (Log Mirroring Nuance)**
> 在 `run-phases.mjs` 第 160 行，執行完成後會執行 `fs.copyFileSync(attemptLogPath, phase.logPath)`。這會將最新的 attempt2 log 覆蓋至 `phase-06-general-server-shard-2.log`。雖然 Attempt 1 日誌已備份於 `/private/tmp/pv-full/attempt1/logs/`，但 `phase.attempts[0].logPath` 若指向 `phase.logPath`，在 attempt 2 結束後該檔案內容將變為 attempt 2。
> **建議：** 在執行 Phase 06 Attempt 2 前，先將原 `phase-06-general-server-shard-2.log` 複製為 `phase-06-general-server-shard-2.attempt1.log`，並使 `phase.attempts[0].logPath` 指向該獨立檔案。

> [!TIP] **Suggestion 1: Vitest 輸出解析之 ANSI 處理防護 (ANSI Stripping)**
> 目前 `parseVitestOutput` 直接以正則表達式比對 `(\d+)\s+passed`。在標準 Vitest chalk 輸出下可正常運作，但在某些特殊終端字元配置下，建議先經由 `stripAnsi` 去除 ANSI 控制碼再行比對，以確保 100% 穩健。

---

## 7. 最終審查結論與後續執行建議

1. **Task 2.9 與 Task 4.2 正式判定：GO (合格)**。
2. **Phase 01–05 保留與 Phase 06–15 恢復判定：GO (合格)**。
3. **後續執行步驟：**
   - 採納 Warning 1 之建議，備份 Phase 06 Attempt 1 專用日誌檔名。
   - 透過 `/private/tmp/pv-full/run-phases.mjs` 由 Phase 06 恢復執行後續驗證流程。
   - 待全部階段完成且 exit 0 後，始得進入 Task 5.1/5.2 封存驗收。
