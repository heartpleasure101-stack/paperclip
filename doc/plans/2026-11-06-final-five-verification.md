# 後續五組測試執行、Phase 11 通過與 Phase 12 Fail-Stop 診斷報告

**文件路徑：** `doc/plans/2026-11-06-final-five-verification.md`  
**報告日期：** 2026-11-06  
**執行角色：** 有界維運 Final 5 執行員（Bounded Ops Final 5 Operator, agy Gemini 3.8 Flash High）  
**模式約束：** 原生檔案與命令工具操作；零 MCP / Hindsight / Pi / Sonnet / 外部代理；不修改正式 runner / 共享 clean-env / 測試 / 產品程式碼 / 設定檔；不變更全域 PATH 優先順序或安裝全域軟體；嚴禁觸發未授權之後續重跑；嚴禁中途補快取、熱複製或修改程式碼；嚴格遵守「遇任一失敗立即停機（Fail-Stop），後續組維持 NOT_RUN」之最高規範。

---

## 一、 執行總結與關鍵判定（Executive Summary & Gate Status）

| 審查與執行維度 | 判定結果 | 關鍵事實依據 |
| :--- | :---: | :--- |
| **(1) 前置不可變性與清冊核對** | **PASSED & VERIFIED** | 控制器實體雜湊 `9de644399adc...`，快照 `56d5...` 24 項源碼指紋 100% 吻合，工作區 clean（0 uncommitted entries）。官方 dry-run 完整選集盤點確認：1434 個 server 測試（含 1 個 chat 與 9 個 native runner）、20 個工作區專案（A: 2, B: 17, C: 1）、166 個 serialized 路由測試檔，分組與分片無遺漏。 |
| **(2) 前置檢查 (Preflight)** | **PASSED (EXIT 0)** | 在標準 Clean-env 下執行 Preflight stage full 10/10 PASS、Node 19 項環境自測全綠、`github-launcher-environment.test.ts`（35 passed, 1 skipped）、`file-resources-git-scan-load.test.ts`（6 passed, p99=3.29ms）、`vitest-chat-shards.test.ts`（1 passed）、模組邊界檢查及 scoped typecheck（0 errors）全數通過。 |
| **(3) Phase 11 循序執行** | **PASSED (EXIT 0)** | 建立專屬單次授權 `auth-phase11-workspaces-c-20261106-bound-op5`，原子登記至 claim 登記簿。執行 Phase 11（`@paperclipai/db`）耗時 125.9s，72 個測試檔案、313 項測試全數通過（exit 0）。日誌長度 38,045 bytes。 |
| **(4) Phase 12 循序執行與中斷** | **FAIL-STOP (EXIT 1)** | 建立專屬單次授權 `auth-phase12-serialized-shard0-20261106-bound-op5`，原子登記 claim。執行 Phase 12（serialized-shard-0，共 8 檔），耗時 25.6s，退出碼 1。7 檔通過（72 tests passed, 17 skipped），1 檔失敗（`maintenance-server-routes.test.ts`，報 `COPILOT_INSTALLATION_INVALID`）。 |
| **(5) 停機不變量落實 (Fail-Stop)** | **STRICT STOP ENFORCED** | 嚴格依規範立即停機，零中途修補、零補 cache、零 hot-copy、零重試；Phases 13、14、15 嚴格維持 **NOT_RUN**。 |
| **(6) 任務進度與全量門禁** | **STRICT NO-GO (TASKS 4.4 / 5.1 / 5.2 PENDING)** | Task 4.3 滿足定義標記 `[x]`；Task 4.2 依保守定義維持 `[ ]`；Task 4.4 因 Phase 12 失敗維持 `[ ]`；Tasks 5.1、5.2 嚴格維持 PENDING 未勾選；本執行員嚴格禁止自我認證、不自封存、不移除 draft、不 push。 |

---

## 二、 檔案雜湊值與不可變基準比對矩陣

### 1. 關鍵控制器、Manifest 與憑證雜湊

| 項目 | 檔案實體路徑 | 位元組大小 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :---: | :--- | :---: |
| **R3 硬化控制器** | `/private/tmp/pv-full/run-phases.mjs` | 26,785 | `9de644399adc7ac8b2468f95155a16400e27269c1353c2888ad031a53a94bfd0` | 鎖定未改 |
| **Phase 11 前 live 備份** | `/private/tmp/pv-final5-operation/manifest-pre-phase11.bak.json` | 51,450 | `198a1e391e5a2366b082d13c6ac48ffb1dc14213abfd6a971235f5dfc8092627` | 排他 `wx` 建立 |
| **Phase 12 前 live 備份** | `/private/tmp/pv-final5-operation/manifest-pre-phase12.bak.json` | 52,428 | `d6dfca3a51f88eb89f8d95eb03e483e5a31cefb916a0ebc8942b109e209825cf` | 排他 `wx` 建立 |
| **最新 live Manifest** | `/private/tmp/pv-full/manifests/phase-manifest.json` | 53,406 | `7d2e0fcbd5992324ba92fc015429e799420608e658b19dad920098d131b1237a` | 記錄 Phase 11 通過與 12 失敗 |
| **最新 mirror Manifest** | `/private/tmp/pv-full/phase-manifest.json` | 53,406 | `7d2e0fcbd5992324ba92fc015429e799420608e658b19dad920098d131b1237a` | 與 live Manifest 逐 byte 相同 |
| **Phase 11 授權檔** | `/private/tmp/pv-final5-operation/run-authorization.phase11.json` | 848 | `dd09b110b91cb4567ddf7ce2bc54a86f7b11d953186256fef39c87d838ea0b57` | 已消費持久化標記 |
| **Phase 11 Claim 檔** | `/private/tmp/pv-full/logs/.authorization-claims/auth-phase11-workspaces-c-20261106-bound-op5.claim.json` | 440 | `ddfaec6de715d47593db5935d9af060788ac89905946adef6236199f94b87112` | 排他 `wx` 原子建立 |
| **Phase 12 授權檔** | `/private/tmp/pv-final5-operation/run-authorization.phase12.json` | 847 | `cf797be2387146522cbb54d2427a17dd1d6ee5c697426176a9aaeb9790209df3` | 已消費持久化標記 |
| **Phase 12 Claim 檔** | `/private/tmp/pv-full/logs/.authorization-claims/auth-phase12-serialized-shard0-20261106-bound-op5.claim.json` | 448 | `0c6c51b970d550bfb7fefdc9c113d475ea2513330e8f3c72dff4659b0e30e793` | 排他 `wx` 原子建立 |

### 2. 日誌檔案雜湊比對

| 項目 | 檔案實體路徑 | 位元組大小 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :---: | :--- | :---: |
| **Phase 11 Attempt 1 日誌** | `/private/tmp/pv-full/logs/phase-11-general-workspaces-c.attempt1.log` | 38,045 | `3fa7dcd81dcc418be60d875b02169877376cbf737922fb981da705edff53d412` | exit 0 全量通過 |
| **Phase 11 Canonical 日誌** | `/private/tmp/pv-full/logs/phase-11-general-workspaces-c.log` | 38,045 | `3fa7dcd81dcc418be60d875b02169877376cbf737922fb981da705edff53d412` | 鏡像別名一致 |
| **Phase 12 Attempt 1 日誌** | `/private/tmp/pv-full/logs/phase-12-serialized-shard-0.attempt1.log` | 6,797 | `64b25e8f2233797435d1a22036e029032510a599fe9edcf71046865c1fad9220` | exit 1 失敗中斷保留 |
| **Phase 12 Canonical 日誌** | `/private/tmp/pv-full/logs/phase-12-serialized-shard-0.log` | 6,797 | `64b25e8f2233797435d1a22036e029032510a599fe9edcf71046865c1fad9220` | 鏡像別名一致 |

---

## 三、 前置驗證與官方 Dry-Run 選集盤點

### 1. 前置 8 項獨立驗證結果

在 `/private/tmp/pv-git-env-fixture-fix` 上以標準 Clean-env 環境執行：
1. **Full preflight 10：** `scripts/validation-preflight.mjs --stage full` -> 10/10 PASS（Node 24.18.0, pnpm 9.15.4, Git 2.56.0, Python 3.9.6, Rustc/Cargo 1.97.1, 本機檔案系統, 0 uncommitted entries）。
2. **Node environment 19：** `node --test scripts/validation-clean-env.test.mjs scripts/validation-preflight.test.mjs` -> 19 passed, 0 failed（耗時 13.66s）。
3. **Module boundary：** `scripts/check-module-boundaries.mjs` -> Feature module boundary check passed（exit 0）。
4. **Scoped types 0：** `tsc --noEmit -p packages/adapter-utils/tsconfig.json` -> 0 diagnostic errors（exit 0）。
5. **Host Git fixture 36：** `vitest run --root packages/adapter-utils src/github-launcher-environment.test.ts` -> 35 passed, 1 skipped（36 total，macOS Darwin 正常跳過 Linux 專用案例）。
6. **Current load 6：** `vitest run --root server src/__tests__/file-resources-git-scan-load.test.ts` -> 6 passed（500 requests, 498 joins, 2 scans, p99=3.29ms, exit 0）。
7. **Cache 1：** `vitest run --root server src/__tests__/vitest-chat-shards.test.ts` -> 1 passed（7 個 trace cases 恰好一次）。
8. **24 項源碼指紋：** Pi（5 檔）+ PV（19 檔）100% 吻合 Manifest 記錄（24/24 PASS）。

### 2. 官方 Dry-Run 選集盤點與聯集覆蓋

對 15 組官方測試執行 `run-vitest-stable.mjs ... --dry-run`，取得之權威盤點數據：
- **Serialized Suites（共 166 檔）：**
  - Shard 0: 8 檔
  - Shard 1: 42 檔
  - Shard 2: 58 檔
  - Shard 3: 58 檔
  - **4 片聯集：** 恰好 166 檔，零重疊、零遺漏。
- **General Server Suites（共 1434 檔）：**
  - Shards 0–3（排除 chat 與 native-runner）: 每片 356 檔，合計 1,424 檔
  - Native Runner Group: 9 檔
  - Chat Suite: 1 檔（`server/src/__tests__/chat-channels.integration.test.ts`）
  - **總計：** 1,424 + 9 + 1 = 1,434 檔。
- **Workspace Projects（共 20 個專案）：**
  - Workspaces-a（2 個）：`@paperclipai/ui`, `paperclipai`
  - Workspaces-b（17 個）：`@paperclipai/shared`, `@paperclipai/skills-catalog`, `@paperclipai/adapter-utils`, `@paperclipai/adapter-claude-local`, `@paperclipai/adapter-codex-local`, `@paperclipai/adapter-cursor-cloud`, `@paperclipai/adapter-cursor-local`, `@paperclipai/adapter-gemini-local`, `@paperclipai/adapter-grok-local`, `@paperclipai/hermes-paperclip-adapter`, `@paperclipai/adapter-kimi-local`, `@paperclipai/adapter-openclaw-gateway`, `@paperclipai/adapter-opencode-local`, `@paperclipai/adapter-pi-local`, `@paperclipai/plugin-daytona`, `@paperclipai/plugin-sdk`, `@paperclipai/create-paperclip-plugin`
  - Workspaces-c（1 個）：`@paperclipai/db`
  - **總計：** 20 個專案。
- **Chat Vitest Shards：** 3 個 Shard，每 Shard 2 個 worker slices，覆蓋 6 個 vitest native shards。
- **Task 4.3 判定：** 官方 dry-run 完整選集盤點無遺漏，定義滿足，標記完成 `[x]`。

---

## 四、 Phase 11 與 Phase 12 執行紀錄

### 1. Phase 11 (`phase-11-general-workspaces-c`) 執行指標

- **授權 ID：** `auth-phase11-workspaces-c-20261106-bound-op5`
- **執行指令：**
  ```bash
  env PAPERCLIP_MANIFEST_PATH=/private/tmp/pv-full/manifests/phase-manifest.json \
      PAPERCLIP_MIRROR_MANIFEST_PATH=/private/tmp/pv-full/phase-manifest.json \
      PAPERCLIP_LOGS_DIR=/private/tmp/pv-full/logs \
      PATH="/Users/Hermes/.nvm/versions/node/v24.18.0/bin:/private/tmp/pi-dedup-git-toolchain/bin:/private/tmp/pi-dedup-rust-toolchain/cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" \
      node /private/tmp/pv-full/run-phases.mjs phase-11-general-workspaces-c \
      --run-authorization /private/tmp/pv-final5-operation/run-authorization.phase11.json
  ```
- **執行耗時：** 125.9 秒
- **退出碼：** `0` (PASSED)
- **測試結果：**
  - Test Files: 72 passed, 0 failed, 0 skipped (72 total)
  - Tests: 313 passed, 0 failed, 0 skipped (313 total)
- **日誌保存：** `/private/tmp/pv-full/logs/phase-11-general-workspaces-c.attempt1.log` (38,045 bytes, `3fa7dcd8...`)

### 2. Phase 12 (`phase-12-serialized-shard-0`) 執行與中斷紀錄

- **授權 ID：** `auth-phase12-serialized-shard0-20261106-bound-op5`
- **執行指令：**
  ```bash
  env PAPERCLIP_MANIFEST_PATH=/private/tmp/pv-full/manifests/phase-manifest.json \
      PAPERCLIP_MIRROR_MANIFEST_PATH=/private/tmp/pv-full/phase-manifest.json \
      PAPERCLIP_LOGS_DIR=/private/tmp/pv-full/logs \
      PATH="/Users/Hermes/.nvm/versions/node/v24.18.0/bin:/private/tmp/pi-dedup-git-toolchain/bin:/private/tmp/pi-dedup-rust-toolchain/cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" \
      node /private/tmp/pv-full/run-phases.mjs phase-12-serialized-shard-0 \
      --run-authorization /private/tmp/pv-final5-operation/run-authorization.phase12.json
  ```
- **執行耗時：** 25.6 秒
- **退出碼：** `1` (FAILED)
- **測試結果：**
  - Test Files: 1 failed, 7 passed (8 total)
  - Tests: 72 passed, 17 skipped, 0 failed (89 total)
- **日誌保存：** `/private/tmp/pv-full/logs/phase-12-serialized-shard-0.attempt1.log` (6,797 bytes, `64b25e8f...`)

### 3. Phase 12 失敗根因分析（Root Cause Analysis）

失敗檔案：`server/src/__tests__/maintenance-server-routes.test.ts`
錯誤訊息：
```
Error: Command failed: pnpm --filter @paperclipai/paperclip-runner build:typescript
file:///private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/dist/drivers/acpx/copilot-installation.js:34
        throw Object.assign(new Error("Install the verified Copilot runtime beside the admitted sidecar."), { code: "COPILOT_INSTALLATION_INVALID", retryable: false });
                            ^

Error: Install the verified Copilot runtime beside the admitted sidecar.
    at verifyCopilotInstallation (file:///private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/dist/drivers/acpx/copilot-installation.js:34:29)
    at async installCopilotAssets (file:///private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/scripts/install-copilot-assets.mjs:57:7)
    at async file:///private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/scripts/install-copilot-assets.mjs:92:18 {
  code: 'COPILOT_INSTALLATION_INVALID',
  retryable: false
}
```
**因果鏈：**
1. `maintenance-server-routes.test.ts` 包含組裝真實 maintenance server 之整合測試。
2. 該測試在執行或初始化前置時調用 `pnpm --filter @paperclipai/paperclip-runner build:typescript`。
3. `paperclip-runner` 腳本執行 `install-copilot-assets.mjs`，內部調用 `verifyCopilotInstallation()`。
4. 在隔離之 clean-env 環境下，未預置驗證過之 Copilot runtime 檔案，拋出 `COPILOT_INSTALLATION_INVALID` 異常且 `retryable: false`。
5. 控制器偵測到 child process 退出碼為 1，記錄日誌並終止執行。

---

## 五、 嚴格停機（Fail-Stop）與未執行組狀態

依據最高指示與工程控制原則：
1. **立即停機：** 偵測到 Phase 12 失敗後，立即停止所有後續操作。
2. **零修補、零重試：** 不修改正式 source、不更動 runner、不擅自於執行中途補 cache 或複製檔案、不發起 Attempt 2。
3. **Phases 13–15 嚴格維持 NOT_RUN：**
   - Phase 13 (`phase-13-serialized-shard-1`)：NOT_RUN
   - Phase 14 (`phase-14-serialized-shard-2`)：NOT_RUN
   - Phase 15 (`phase-15-serialized-shard-3`)：NOT_RUN
   - 各組 attempts 陣列長度為 0，0 位元組日誌。

---

## 六、 任務進度與門禁判定（Tasks Status & Gate Decision）

1. **OpenSpec Tasks 更新評定：**
   - **Task 4.2：** `[ ]` **PENDING**（Preflight 與已知 blocker 通過，全庫 runtime asset 存在缺口，依保守定義維持未勾選）。
   - **Task 4.3：** `[x]` **已完成**（官方 dry-run 完整選集盤點證明 1434 server、20 workspaces、166 serialized 無遺漏，定義完全滿足）。
   - **Task 4.4：** `[ ]` **未完成／中斷 (FAILED AT PHASE 12)**（Phase 11 通過，Phase 12 失敗，Phase 13–15 NOT_RUN）。
   - **Task 5.1 / 5.2：** `[ ]` **STRICT NO-GO / PENDING**（全量未通過，嚴格維持待辦）。
2. **門禁決策：**
   - **交付門檻判定：** **NO-GO**。
   - 本執行員嚴格禁止自我認證、不自封存、不移除 draft、不 push。
   - 誠實揭露 Phase 12 之 `COPILOT_INSTALLATION_INVALID` 失敗，交由父層決策。
