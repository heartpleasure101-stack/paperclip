# Native Runner 覆蓋缺口補足與 Phase 08 Attempt 2 驗證報告 (Native Coverage Operation Report)

**報告日期：** 2026-11-06  
**執行角色：** 有界 Native 覆蓋執行員（Gemini 3.8 Flash High, Bounded Native Coverage Operator）  
**操作約束：** 
- 原生環境工具操作，嚴格零 MCP / Hindsight / Pi / Sonnet / 外部子代理。
- 嚴格不執行真實 Copilot / Cursor 二進位本體或 Vendor CLI、不發送網路請求、不下載套件。
- 嚴格不更動專案生產程式碼、測試檔案、skip 條件、pins、verifier、clean-env、控制器或全域憑證。
- 原生執行經使用者授權 QA 模式（BypassSandbox: true），git hooks 維持開啟。
- 遇任一失敗立即停機（Fail-Stop，no repair / no retry）。
- 嚴格不自行合併、不 push、不部署、不自行封存（no self-acceptance / no PR ready / tasks 5.1 & 5.2 保持待辦）。

---

## 一、 執行總結與決策門禁矩陣 (Executive Summary & Gate Decision)

| 審核與執行項目 | 判定結果 | 關鍵事實依據與指標 |
| :--- | :---: | :--- |
| **(1) 必需 Fixture 離線編譯** | **PASSED (EXIT 0)** | 於不可變快照 `56d517eeffd24287161329b2f86595dcdef4d165` 下，以既有 Rust 1.97 clean-env 離線編譯 `fake-codex-app-server` debug fixture（耗時 56.94s，exit 0）。二進位檔 `runner/target/debug/fake-codex-app-server` 存在且權限為 `-rwxr-xr-x`（2,385,352 bytes，SHA-256 `8f54ab99...`）。 |
| **(2) Runner 與 Fixture 實體核對** | **VERIFIED** | 唯讀核對 `native-restart.ts` 所需之兩項二進位實體：1) 正式 release runner `dist/bin/paperclip-runnerd`（30,640,752 bytes，SHA-256 `e25e98ce...`）；2) debug fixture `fake-codex-app-server` 皆存在，`binariesAvailable` 條件求值為 `true`。Git tracked files 保持 100% clean。 |
| **(3) Phase 08 Attempt 2 執行** | **PASSED (EXIT 0)** | 核發全新單次授權 `auth-phase08-native-runner-attempt2-20261106-bound-op-gemini`，由 R3 控制器原子建立 claim。9 個原生套件全數執行並通過（0 files skipped），共計 186 項測試中 172 項通過、14 項跳過（耗時 262.9s，exit 0）。 |
| **(4) 9 項缺 Fixture 測試真實執行** | **100% COVERED** | 先前漏跑之 9 項 `realProcessIt` 測試全數真實執行並 PASS：`diskless` 2 項全通、`checkpoint-cost` 1 項全通（8/512/8192 chunks 真實 Postgres 寫入驗證）、`recovery` 6 項 `realProcessIt` 測試全通。未編譯 fixture 不得視為合法平台限制之缺陷已徹底修正。 |
| **(5) 14 項保留跳過性質界定** | **LEGITIMATE CONTAINER** | 僅保留 `recovery` 套件內 14 項容器相依測試（需 `PAPERCLIP_TEST_RUNNER_CONTAINER`），此為外部容器環境相依，非本地缺少建置 fixture，屬合法平台跳過。 |
| **(6) 15 階段累計帳本重算** | **ALL 15 PASSED (EXIT 0)** | 累計通過檔案 2,914 檔（+2）、通過測試 52,672 項（+9）、跳過檔案 29 檔（-2）、跳過測試 9,521 項（-9），總耗時 7,839.7s。 |
| **(7) 文檔勘誤與同行審查保全** | **ERRATA RECORDED** | 獨立審查同行報告 `2026-11-06-portable-validation-final-independent-review.md` 逐 byte 鏡像至 `doc/plans/`（SHA-256 `db3dffc3...` 嚴格不變）。作者報告 `2026-11-06-final-three-verification.md` 修正 `3f1` commit/tree 筆誤、Chat 測試檔名、24 檔指紋範疇，並附勘誤說明。 |
| **(8) 任務進度狀態** | **TASK 2.15/4.2/4.4 DONE** | Task 2.15、4.2、4.4 勾選 `[x]`；Task 5.1、5.2 嚴格維持 `[ ]` 待辦，交由全新獨立複審。 |

---

## 二、 關鍵檔案、二進位檔與憑證雜湊清冊

| 項目 | 實體路徑 | 位元組大小 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :---: | :--- | :---: |
| **R3 硬化控制器** | `/private/tmp/pv-full/run-phases.mjs` | 26,785 | `9de644399adc7ac8b2468f95155a16400e27269c1353c2888ad031a53a94bfd0` | 唯讀不變 |
| **前置 Live 備份** | `/private/tmp/pv-native-coverage-operation/manifest-pre-phase08-attempt2.bak.json` | 57,077 | `20f201f41b886ff22c829df2c9c77d68af0a2dea8e8e0eeb517c005ad2551766` | `wx` 原子建立 |
| **前置 Mirror 備份** | `/private/tmp/pv-native-coverage-operation/mirror-manifest-pre-phase08-attempt2.bak.json` | 57,077 | `20f201f41b886ff22c829df2c9c77d68af0a2dea8e8e0eeb517c005ad2551766` | `wx` 原子建立 |
| **Phase 08 Attempt 1 備份** | `/private/tmp/pv-native-coverage-operation/phase-08-general-server-native-runner.attempt1.bak.log` | 26,783 | `3a18152be4b7994515c219dffc42dd548881de0e24826b0229eaa31006c6d15d` | 原始記錄保全 |
| **Fixture 建置日誌** | `/private/tmp/pv-native-coverage-operation/cargo-build-fake-codex-app-server.raw.log` | 9,135 | `913654717067fdb54270cfc8fe84457513c169af021778cea5b2f9082c05cbdc` | exit 0 (56.94s) |
| **除錯 Fixture 二進位** | `/private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/runner/target/debug/fake-codex-app-server` | 2,385,352 | `8f54ab996065a8f411a21b0695bf43bde1dd5462c4394feb0b7732eff9c9dd35` | `-rwxr-xr-x` |
| **正式 Runner 二進位** | `/private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/dist/bin/paperclip-runnerd` | 30,640,752 | `e25e98ce3c6e0f02d3e5df7a5815666f7c695f0532bc74c80a7ecc5758c5a2e3` | `-rwxr-xr-x` |
| **Phase 08 Attempt 2 授權檔** | `/private/tmp/pv-native-coverage-operation/run-authorization.phase08.attempt2.json` | 1,005 | `792d1ee77afdd4e610c2352daa40dcac4683dcc66ee93cc5bcadc2b03c127334` | 已消費標記 |
| **Phase 08 Attempt 2 Claim** | `/private/tmp/pv-full/logs/.authorization-claims/auth-phase08-native-runner-attempt2-20261106-bound-op-gemini.claim.json` | 498 | `6d088f510fc1d052ca634a00f4bc09a388838fb36739f719103628cfd33f050d` | `wx` 原子建立 |
| **Phase 08 Attempt 2 日誌** | `/private/tmp/pv-full/logs/phase-08-general-server-native-runner.attempt2.log` | 29,259 | `8d9911220b8eb18bd0ca5237c50335f77a9c8712a27fd1bb135a86563bb872d5` | exit 0 (172P/14S) |
| **更新後 Live Manifest** | `/private/tmp/pv-full/manifests/phase-manifest.json` | 57,816 | `6ca93c9cf731132eb5d2e92ad0d298d648651033677b258500813256f8a471d6` | 完整記錄 Attempt 1+2 |
| **更新後 Mirror Manifest** | `/private/tmp/pv-full/phase-manifest.json` | 57,816 | `6ca93c9cf731132eb5d2e92ad0d298d648651033677b258500813256f8a471d6` | 逐 byte 相同 |
| **鏡像獨立同行審查報告** | `doc/plans/2026-11-06-portable-validation-final-independent-review.md` | 15,280 | `db3dffc3a2a61337ef64b36405d397f3ef7493c017031d72751d5cbc4fabb6c8` | EXACT bytes 鏡像 |

---

## 三、 Fixture 離線編譯與 二進位環境核對詳情

### 3.1 核心缺陷成因核對
依據審查報告 `2026-11-06-portable-validation-final-independent-review.md` [CRITICAL-1]，`server/src/__tests__/helpers/native-restart.ts` 定義：
```typescript
export const fakeCodexAppServer = resolve(
  import.meta.dirname,
  "../../../../packages/paperclip-runner/runner/target/debug/fake-codex-app-server",
);
const binariesAvailable =
  existsSync(defaultCapabilityRunnerdBinary()) && existsSync(fakeCodexAppServer);
export const realProcessIt: typeof it.skip = binariesAvailable ? it : it.skip;
```
先前驗證僅以 release 模式編譯了 `paperclip-runnerd`，未編譯 debug fixture `fake-codex-app-server`，導致 `binariesAvailable` 評估為 `false`，9 項關鍵行程測試被靜默跳過。

### 3.2 離線編譯執行
於凍結工作區 `/private/tmp/pv-git-env-fixture-fix`（HEAD: `56d517eeffd24287161329b2f86595dcdef4d165`）以既有 clean-env 執行：
```bash
/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node /private/tmp/pv-git-env-fixture-fix/scripts/validation-clean-env.mjs \
  --bin /private/tmp/pi-dedup-git-toolchain/bin \
  --bin /private/tmp/pi-dedup-rust-toolchain/cargo/bin \
  --bin /usr/bin \
  --bin /opt/homebrew/bin \
  --set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack \
  --set CARGO_HOME=/private/tmp/pi-dedup-rust-toolchain/cargo \
  --set RUSTUP_HOME=/private/tmp/pi-dedup-rust-toolchain/rustup \
  --set CARGO_NET_OFFLINE=true \
  --set CI=1 \
  -- cargo build --manifest-path packages/paperclip-runner/runner/Cargo.toml --locked -p paperclip-runner-core --bin fake-codex-app-server
```
- **編譯結果：** exit code 0，耗時 56.94s。
- **產物路徑：** `packages/paperclip-runner/runner/target/debug/fake-codex-app-server`
- **產物質量：** 2,385,352 bytes，SHA-256 `8f54ab996065a8f411a21b0695bf43bde1dd5462c4394feb0b7732eff9c9dd35`。
- **雙二進位條件求值：**
  - `defaultCapabilityRunnerdBinary()`: `/private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/dist/bin/paperclip-runnerd` (exists: `true`)
  - `fakeCodexAppServer`: `/private/tmp/pv-git-env-fixture-fix/packages/paperclip-runner/runner/target/debug/fake-codex-app-server` (exists: `true`)
  - `binariesAvailable`: `true`。
- **Git 工作區狀態：** `git status --porcelain` 保持為空（0 uncommitted changes）。

---

## 四、 Phase 08 Attempt 2 執行與 9 項測試覆蓋驗收

### 4.1 單次授權與 R3 控制器調用
- **授權 ID：** `auth-phase08-native-runner-attempt2-20261106-bound-op-gemini`
- **宣告目標：** `["phase-08-general-server-native-runner"]`
- **執行指令：**
  ```bash
  env PAPERCLIP_MANIFEST_PATH=/private/tmp/pv-full/manifests/phase-manifest.json \
      PAPERCLIP_MIRROR_MANIFEST_PATH=/private/tmp/pv-full/phase-manifest.json \
      PAPERCLIP_LOGS_DIR=/private/tmp/pv-full/logs \
      PATH="/Users/Hermes/.nvm/versions/node/v24.18.0/bin:/private/tmp/pi-dedup-git-toolchain/bin:/private/tmp/pi-dedup-rust-toolchain/cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" \
      /Users/Hermes/.nvm/versions/node/v24.18.0/bin/node /private/tmp/pv-full/run-phases.mjs phase-08-general-server-native-runner \
      --run-authorization /private/tmp/pv-native-coverage-operation/run-authorization.phase08.attempt2.json
  ```
- **Claim 建立：** 原子建立 `/private/tmp/pv-full/logs/.authorization-claims/auth-phase08-native-runner-attempt2-20261106-bound-op-gemini.claim.json`（pid: 88177）。
- **Attempt 序號：** 單調遞增為 Attempt 2，日誌寫入 `phase-08-general-server-native-runner.attempt2.log`，原有 Attempt 1 日誌完全不可變保留。

### 4.2 測試執行指標
- **耗時：** 262.9 秒。
- **退出碼：** `0` (PASSED)。
- **套件統計：** 9 個測試套件全數通過、0 個失敗、0 個跳過（9 total）。
- **測試案例統計：** 172 項通過、0 項失敗、14 項跳過（186 total）。

### 4.3 先前跳過之 9 項測試真實執行明細
1. **`native-runner-restart-checkpoint-cost.integration.test.ts` (1 項)：**
   - 測試：`keeps checkpoint SQL independent of streamed output volume with a real Postgres writer`
   - 實跑指標：真實啟動 Postgres 寫入器，完成 8 chunks、512 chunks 及 8,192 chunks 採樣基準（8,192 chunks 耗時 177.7s，walBytes 8,628,040，checkpointWrites 7），驗收 PASSED（單套件總計 194.4s）。
2. **`native-runner-restart-diskless.integration.test.ts` (2 項)：**
   - 測試 1：`adopts the same runner from Postgres after losing the controller filesystem (prepared task: false)`（71.6s，PASSED）。
   - 測試 2：`adopts the same runner from Postgres after losing the controller filesystem (prepared task: true)`（75.9s，PASSED）。
3. **`native-runner-restart-recovery.integration.test.ts` (6 項 `realProcessIt`)：**
   - 6 項行程級別熱/冷重啟與接管測試全數執行並 PASSED：
     - `restores encrypted controller authority from Postgres and fences a stale writer` (346ms)
     - `adopts one active runner across hot and hard controller restarts without duplicating steering` (2518ms)
     - `hard-restarts a dead runner with a current prompt on the same run and provider session` (2481ms)
     - `hot-restarts a dead runner with a historical prompt on the same run and provider session` (2364ms)
     - `hot-restarts a dead runner with a unregistered prompt on the same run and provider session` (2313ms)
     - `recovers a valid runner beyond a full batch of persistently blocked expired owners` (7260ms)
4. **剩餘 14 項跳過：**
   - 全部集中於 `native-runner-restart-recovery.integration.test.ts`，由 `if (!process.env.PAPERCLIP_TEST_RUNNER_CONTAINER) it.skip(...)` 保護，為合法之容器環境相依，無其他 fixture 遺漏。

---

## 五、 全量 15 個階段更新後帳本與彙總數據 (Updated 15 Phases Ledger)

對照官方 dry-run 清冊與 Manifest 最新資料，更新 Phase 08 Attempt 2 後的累計帳本：

| Phase ID | 分組名稱 | Shard | 狀態 | Exit | 耗時 | Files (P/F/S/T) | Tests (P/F/S/T) | 真正測試 Commit |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `phase-01-general-chat-shard-0` | general-chat (shards 0-1) | 0 | **PASSED** | 0 | 273.3s | 2/0/0/2 | 574/0/3102/3676 | `cc56bbcd30a7...` |
| `phase-02-general-chat-shard-1` | general-chat (shards 2-3) | 1 | **PASSED** | 0 | 275.7s | 2/0/0/2 | 653/0/3023/3676 | `cc56bbcd30a7...` |
| `phase-03-general-chat-shard-2` | general-chat (shards 4-5) | 2 | **PASSED** | 0 | 232.8s | 2/0/0/2 | 611/0/3065/3676 | `cc56bbcd30a7...` |
| `phase-04-general-server-shard-0` | general-server (shard 0) | 0 | **PASSED** | 0 | 1242.1s | 351/0/5/356 | 7256/0/15/7271 | `cc56bbcd30a7...` |
| `phase-05-general-server-shard-1` | general-server (shard 1) | 1 | **PASSED** | 0 | 1378.0s | 348/0/8/356 | 6440/0/78/6518 | `cc56bbcd30a7...` |
| `phase-06-general-server-shard-2` | general-server (shard 2) | 2 | **PASSED** | 0 | 837.9s | 350/0/6/356 | 6288/0/135/6423 | `cc56bbcd30a7...` |
| `phase-07-general-server-shard-3` | general-server (shard 3) | 3 | **PASSED** | 0 | 929.7s | 350/0/6/356 | 9946/0/49/9995 | `3f1eb1b7b364...` |
| `phase-08-general-server-native-runner` | general-server-native-runner | - | **PASSED** | 0 | 262.9s (att2) | 9/0/0/9 (att2) | 172/0/14/186 (att2) | `56d517eeffd2...` (att2) |
| `phase-09-general-workspaces-a` | general-workspaces-a (UI, CLI) | - | **PASSED** | 0 | 283.1s | 929/0/0/929 | 11113/0/0/11113 | `3f1eb1b7b364...` |
| `phase-10-general-workspaces-b` | general-workspaces-b (17 pkgs) | - | **PASSED** | 0 | 212.4s | 333/0/4/337 | 5523/0/40/5563 | `56d517eeffd2...` |
| `phase-11-general-workspaces-c` | general-workspaces-c (db) | - | **PASSED** | 0 | 125.9s | 72/0/0/72 | 313/0/0/313 | `56d517eeffd2...` |
| `phase-12-serialized-shard-0` | serialized routes (shard 0) | 0 | **PASSED** | 0 | 302.0s | 8/0/0/8 | 89/0/0/89 | `56d517eeffd2...` |
| `phase-13-serialized-shard-1` | serialized routes (shard 1) | 1 | **PASSED** | 0 | 374.9s | 42/0/0/42 | 964/0/0/964 | `56d517eeffd2...` |
| `phase-14-serialized-shard-2` | serialized routes (shard 2) | 2 | **PASSED** | 0 | 490.0s | 58/0/0/58 | 1208/0/0/1208 | `56d517eeffd2...` |
| `phase-15-serialized-shard-3` | serialized routes (shard 3) | 3 | **PASSED** | 0 | 618.9s | 58/0/0/58 | 1522/0/0/1522 | `56d517eeffd2...` |
| **全量總計 (TOTAL)** | **15 階段全量** | - | **ALL PASSED** | **0** | **7839.7s** | **2914/0/29/2943** | **52672/0/9521/62193** | - |

- **全量聯集證明：** 166 serialized suites + 1,434 general server suites（含 1 chat 6 inner shards、9 native runner、1,424 other）+ 20 workspaces projects 100% 覆蓋，無重複、無遺漏。

---

## 六、 文檔勘誤與歷史 115 KB 落差透明揭露

1. **梯次 2 提交雜湊筆誤更正：**  
   原作者報告記載之 `3f1917f30018fca20b57faeebefd4ba2f30b910b` 為手民誤植，Git 真實提交雜湊為 `3f1eb1b7b364893141818d25569d60206ea36ccb`，Git Tree 為 `4cf612e25dfcaca94cbfd7539922b9fe4a77cd1f`（非幽靈 tree `d5cff774...`）。已於 `doc/plans/2026-11-06-final-three-verification.md` 附上正式勘誤。
2. **Chat 測試檔名更正：**  
   原作者報告誤記為 `server/src/__tests__/chat-channel-routes.test.ts`，實際執行檔為 `server/src/__tests__/chat-channels.integration.test.ts`（70,000+ 行，6 個 shard），已同步更正。
3. **源碼指紋範圍精準界定：**  
   生產與共用程式碼（App Code）在 3 個梯次間 100% byte-identical。24 個指紋檔案中之 2 個測試 fixture 依審查之 PR 梯次演進（`file-resources-git-scan-load.test.ts` 於梯次 2 修復負載、`github-launcher-environment.test.ts` 於梯次 3 修復路徑），精確界定為「生產程式碼完全一致，測試 fixture 依提交梯次演進」。
4. **歷史 115 KB 日誌落差永久揭露：**  
   早期 Phase 10 調試過程中產生之 115,142 bytes 原始 task log / 快取落差（已登錄於 Task 2.13 稽核）。該項歷史落差不可復原，本報告持續誠實揭露，所有既有 raw 日誌雜湊與 claim 記錄保持完整不變。

---

## 七、 OpenSpec 任務狀態與後續獨立審查邊界

1. **OpenSpec 任務狀態：**
   - **portable-validation-and-enrollment-regression (共 25 項)：**
     - 已完成 (24 項)：1.1–1.2, 2.1–2.15, 3.1–3.3, 4.1, **4.2**, 4.3, **4.4**。
     - 待辦 (2 項)：**5.1**（全新獨立審查 session）、**5.2**（審查通過後之提交與 PR 描述更新）。
   - **pi-single-prompt-summary-dedup (共 10 項)：**
     - 已完成 (9 項)：1.1–1.3, 2.1–2.4, 3.1, 3.2。
     - 待辦 (1 項)：**3.3**（待最終交付）。

2. **嚴格停機邊界：**
   - 本執行員嚴格不進行自我最終審查（Task 5.1/5.2 保持 `[ ]`）。
   - 嚴格不 push、不 merge PR、不刪除 PR draft、不封存 OpenSpec specs。
   - 所有產物與證據已完整保全，流程在此安全停機，交由專案負責人發起全新獨立複審。
