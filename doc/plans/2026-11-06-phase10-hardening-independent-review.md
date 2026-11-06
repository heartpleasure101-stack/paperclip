# Phase 10 控制器硬化、權限唯讀診斷與工作區完整性獨立審查報告

**文件路徑：** `doc/plans/2026-11-06-phase10-hardening-independent-review.md`  
**報告日期：** 2026-11-06  
**審查角色：** 獨立維運審查員暨唯讀權限診斷員（Fresh Independent Ops Reviewer & Read-only Permission Diagnostician, agy Gemini 3.8 Flash High）  
**模式約制：** 原生檔案工具唯讀分析與自含負向測試、零 MCP / Hindsight / Pi / Sonnet / 外部代理、不修改既有已追蹤程式碼與控制器、不修改 Manifest / 快取 / tool-bin / 授權檔、不變更任何權限 (chmod/chown/ACL/flags/global hooks)、不重新掛載或規避任何 deny 規則、嚴格禁止全量測試/構建/重試。所有假子行程控制與負向驗證僅在審查員專屬 scratch (`/private/tmp/pv-phase10-hardening-review`) 進行。

---

## 一、 獨立審查總結與門禁判定（Separate GO / NO-GO Decisions）

| 審查維度 | 判定 | 關鍵事實依據 |
| :--- | :---: | :--- |
| **控制器硬化 (Controller Safeguards)** | **NO-GO (CRITICAL)** | 雖然 `wx` 排他建立日誌、別名防覆寫、序號最低限制 `>= 4`、訊號 flush 與 fail-stop 已實作，但**單次授權 Interlock 存在重大並行競爭漏洞（TOCTOU race condition）**，兩平行競爭者均可同時消耗同一 token 啟動；且缺少 CLI 目標 Phase 存在性檢查與嚴格範圍綁定。 |
| **工作區完整性 (Workspace Completion)** | **NO-GO (CRITICAL)** | `56d` 快照相較於 `3f1` 快照**完全缺少 `packages/plugins/sdk/dist`**。由於該套件之 `package.json` 所有 exports 均導向 `./dist/*`，導致 `@paperclipai/create-paperclip-plugin` 無法解析依賴；預檢腳本退出碼為 `1`。 |
| **權限唯讀診斷 (Permission Diagnosis)** | **CLARIFIED / VERIFIED** | **硬化工程師報告存在重大誤診**：錯誤宣稱工作樹為「作業系統檔案系統強制唯讀（OS-strict-readonly filesystem）」。真相為：1) Vitest 啟動時遭遇之 `EPERM` 係 macOS Seatbelt 沙盒限制（拒絕寫入 `.vite-temp`），非檔案權限 `EACCES` 或唯讀掛載；2) 後續診斷 `touch` 係命中使用者 pre-tool 策略攔截。二者被混淆。 |
| **Hermes 套件就緒狀態 (Hermes Readiness)** | **NO-GO** | 雖然私有 `python-bin` (Python 3.15.2) 正向門禁與負向門禁通過，但 Hermes 完整套件測試在啟動階段即因 `.vite-temp` 之 `EPERM` 中斷，**全量 101+ 個測試從未實際執行**，絕不可視為就緒。 |
| **Phase 10 全量重跑門禁** | **STRICT NO-GO** | 必須待控制器競爭與範圍修復、工作區 `dist` 依賴補全、沙盒暫存目錄授權明確定義，並由獨立審查再次授予 GO 後，方可進入下一階段。 |

---

## 二、 檔案雜湊值與不可變基準比對矩陣

### 1. 控制器與 Manifest 比對

| 項目 | 檔案實體路徑 | SHA-256 雜湊值 | 狀態評定 |
| :--- | :--- | :--- | :---: |
| **現行硬化控制器** | `/private/tmp/pv-full/run-phases.mjs` | `bec37319ccfdb2e8558c90a54996f37038134981aed41fa5acb57958650025a8` | 符合預期 |
| **改造前備份控制器** | `brain/.../scratch/run-phases.mjs.pre-hardening.bak` | `2a12e095f500aa393d5311f1eb5fbba57a871e4ff1b62595d0d4dc6cdb3f04da` | 符合預期 |
| **現行 live Manifest** | `/private/tmp/pv-full/manifests/phase-manifest.json` | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` | 保持 2 筆，未改寫 |
| **現行 mirror Manifest**| `/private/tmp/pv-full/phase-manifest.json` | `dab8ee3f6fe2091526d78fb4869c2fd537e67b55a395f404f077f8a8ad376701` | 保持 2 筆，未改寫 |
| **提案遷移 Manifest** | `brain/.../scratch/proposed-phase10-manifest-migration.json` | `11f988bf2cb02cbe1b1c948f889d6630c4e0460b56a88da526cadffa0b2f0d3c` | 獨立封存，未套用 |
| **第二輪 Attempt 2 日誌** | `/private/tmp/pv-full/logs/phase-10-general-workspaces-b.attempt2.log` | `362cae7efbc80b222417fa8b744a16888bf6d981dd3375a833fb0aa9e0a8a4c4` | 152,544 bytes 鎖定 |

### 2. 工具鏈二進位矩陣比對（維持不變）

所有工具鏈雜湊值均經現場重新計算驗證，100% 吻合：
- **Node.js (v24.18.0):** `/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`  
  `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a`
- **Git (v2.56):** `/private/tmp/pi-dedup-git-toolchain/bin/git`  
  `916479af8cb874da55aab980077362ee233407e5112f6df5ee3514d7611ab559`
- **Cargo (v1.97):** `/private/tmp/pi-dedup-rust-toolchain/cargo/bin/cargo`  
  `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f`
- **Rustup:** `/private/tmp/pi-dedup-rust-toolchain/cargo/bin/rustup`  
  `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f`
- **Corepack LKG:** `/private/tmp/pv-clean-tools/corepack/lastKnownGood.json`  
  `957e0bb742647e92bbaf8238bce96848e011b452ee7c09f2a876b93a013d0ae8`
- **Homebrew Python 3.15.2:** `/opt/homebrew/Cellar/python@3.15/3.15.2/Frameworks/Python.framework/Versions/3.15/bin/python3.15`  
  `d775520d87f89a19cffe0db3fba17f3caf71d91066e23e5efd7b5bd9dbb975e2`

---

## 三、 控制器維運邏輯嚴格審查與重大缺陷（CRITICAL DEFECTS）

審查員在專屬隔離目錄 `/private/tmp/pv-phase10-hardening-review/` 針對 `/private/tmp/pv-full/run-phases.mjs` 進行了實際 ops 負向控制測試，發現以下重大安全性缺陷：

### 1. 重大缺陷 1（CRITICAL）：授權憑證消耗非原子操作，平行競爭雙贏（TOCTOU Race Condition）

- **程式碼位置：** `/private/tmp/pv-full/run-phases.mjs` 第 134–161 行 (`verifyAndConsumeAuthorization`)
- **機制剖析：**
  ```javascript
  auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
  if (auth.consumed) { throw new Error(...); }
  // ...
  auth.consumed = true;
  auth.consumedAt = new Date().toISOString();
  auth.consumedByPid = process.pid;
  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2) + "\n");
  ```
  該實作採用標準的「先讀取、再判斷、後寫入」非原子模式。若兩個 runner 行程同時啟動並傳入同一授權檔，兩個行程同時完成 `readFileSync`，皆判定 `auth.consumed === false`，隨後各自寫入，**兩個平行競爭行程均判定成功**！
- **實體負向證明（Empirical Evidence in Review Scratch）：**
  審查員執行 `concurrency-test.mjs` 同時啟動兩個行程競爭消耗同一授權：
  ```text
  Worker 1 output: [Authorization] Successfully validated and consumed single-use token: auth-race-contender
  SUCCESS:48008
  Worker 2 output: [Authorization] Successfully validated and consumed single-use token: auth-race-contender
  SUCCESS:48009
  Success count: 2
  CRITICAL RACE CONDITION: Both parallel contenders consumed the single-use token!
  ```
- **衝擊：** 宣稱的「單次使用互鎖」無法防禦並行重跑，破壞控制面防線。必須改用檔案系統原子排他建立（例如 `fs.openSync(lockPath, "wx")`）或 `fs.renameSync`。

### 2. 重大缺陷 2（CRITICAL）：範圍檢查漏洞（Scope Check Bypass on Omission）

- **程式碼位置：** `/private/tmp/pv-full/run-phases.mjs` 第 150 行
  ```javascript
  if (auth.targetPhaseId && targetPhaseId && auth.targetPhaseId !== "all" && auth.targetPhaseId !== targetPhaseId) {
    throw new Error(`FAIL-CLOSED: Run authorization is scoped to ${auth.targetPhaseId}...`);
  }
  ```
- **機制剖析：**
  當呼叫者未在 CLI 指定 `targetPhaseId`（即欲執行全部 phase，`targetPhaseId === null`）時，由於 `targetPhaseId` 為 falsy，整個條件式直接跳過！
- **實體負向證明：**
  審查員以限制於 `phase-10-general-workspaces-b` 的 token，在未指定 CLI 參數時呼叫：
  ```text
  [Authorization] Successfully validated and consumed single-use token: auth-phase10-only
  CRITICAL SCOPE DEFECT: Token scoped to phase-10 was successfully consumed for global/all-phases run!
  ```
- **衝擊：** 專門授權給單一 Phase 的憑證，可被直接用於觸發全量全 Phase 執行。

### 3. 重大缺陷 3（CRITICAL）：虛構 Phase ID 燒毀 Token 且退出碼為 0 偽稱成功

- **程式碼位置：** `/private/tmp/pv-full/run-phases.mjs` 第 331–350 行
  ```javascript
  verifyAndConsumeAuthorization(authPath, targetPhaseId); // 立即消耗
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const phase of manifest.phases) {
    if (targetPhaseId && phase.id !== targetPhaseId) continue;
    // ...
  }
  console.log("\nAll requested phases finished successfully!"); // 退出碼 0
  ```
- **機制剖析：**
  若使用者或生產者傳入拼字錯誤或虛構的 Phase ID（例如 `producer-invented-phase-id`），控制器**先消耗授權 token**，接著在 Manifest 遍歷時完全找不到該 Phase，最後印出「All requested phases finished successfully!」並以 `exit 0` 結束！
- **實體負向證明（`test-bogus-phase.mjs`）：**
  ```text
  Exit code: 0
  Stdout:
   [Authorization] Successfully validated and consumed single-use token: auth-bogus-test
  All requested phases finished successfully!
  Auth consumed status: true
  CRITICAL BOGUS PHASE DEFECT: Non-existent phase burned authorization and exited 0 claiming all phases finished!
  ```
- **衝擊：** 假綠燈（False Pass）且無端燒毀授權憑證。控制器在消耗授權前，必須驗證 `targetPhaseId` 確實存在於 Manifest 中。

### 4. 輔助警告（WARNING）：前次報告中 Control 1 為自證性假測試

- **程式碼位置：** `/private/tmp/pv-phase10-hardening/sandbox-controls/run-controls.mjs` 第 49 行
- **事實揭露：** 硬化報告聲稱 19 項斷言全數通過，但檢視其原始碼：
  Control 1 僅在測試腳本內部直接呼叫 Node 原生 `fs.openSync(testLog, "wx")`，**完全沒有呼叫 `run-phases.mjs` 或 `runPhase()`**。這屬於自我證明的重複程式碼，而非對權威控制器邏輯的真實測試。

---

## 四、 Hermes `EPERM` 唯讀權限深度診斷

硬化報告第七節宣稱：工作樹處於「使用者自訂強制唯讀保護狀態（User-Configured Deny Rule）」，導致檔案系統唯讀。**此診斷在技術上是不正確的**。

### 1. 檔案系統與元數據事實（Safe Read-Only Evidence）

透過 `stat` 與 `ls -ldO` 檢查 `/private/tmp/pv-git-env-fixture-fix` 及其子目錄：
```text
mode=drwxr-xr-x uid=502(Hermes) gid=0(wheel) flags=0 path=/private/tmp/pv-git-env-fixture-fix
mode=drwxr-xr-x uid=502(Hermes) gid=0(wheel) flags=0 path=/private/tmp/pv-git-env-fixture-fix/node_modules
mode=drwxr-xr-x uid=502(Hermes) gid=0(wheel) flags=0 path=/private/tmp/pv-git-env-fixture-fix/node_modules/.vite-temp
```
- **掛載屬性：** 位於 `/dev/disk3s5` (`/System/Volumes/Data`)，為可讀寫 APFS 分割區。
- **BSD 旗標：** `flags=0`，無 `uchg`（使用者不可變）或 `schg`（系統不可變）旗標。
- **POSIX 權限：** `0755`，由目前執行使用者 `Hermes` 擁有。

### 2. 兩類拒絕事件的嚴格區分（Distinguishing Vite EPERM from Hook Denial）

經查閱 AGY 7307 完整對話記錄（`transcript.jsonl`），前次硬化工程師混淆了兩個發生於不同層級的事件：

1. **事件 A：Vitest 子行程內的 `EPERM`（發生於 step_index 231）**
   - 執行命令：`node /private/tmp/pv-phase10-hardening/run-hermes-package-once.mjs`（`BypassSandbox: false`）
   - 錯誤訊息：
     ```text
     Error: EPERM: operation not permitted, open '/private/tmp/pv-git-env-fixture-fix/node_modules/.vite-temp/vitest.config.ts.timestamp-...mjs'
     ```
   - **根本原因：** 在 macOS Darwin 上，當標準權限符合（`0755`、使用者相符）但開啟檔案被作業系統擋下時，若非旗標鎖定，即為 **macOS Seatbelt 沙盒策略（Seatbelt sandbox-exec profile）** 拒絕寫入！由於執行於 Standard Sandbox Mode，沙盒僅對白名單工作區與 `/tmp` 提供寫入權，而 `/private/tmp/pv-git-env-fixture-fix/node_modules/.vite-temp` 未被沙盒設定納入可寫暫存目錄。在 Darwin 上，沙盒策略違規返回之 errno 即為 `EPERM`，而非標準 Unix 權限不足的 `EACCES`。
2. **事件 B：外層 Tool 命令被 Pre-Tool Hook 攔截（發生於 step_index 241）**
   - 執行命令：
     ```bash
     ls -ldO /private/tmp/pv-git-env-fixture-fix/node_modules/.vite-temp; touch /private/tmp/pv-git-env-fixture-fix/node_modules/.vite-temp/test.txt ...
     ```
   - 錯誤訊息：
     ```text
     Permission denied for command(...). Matches user-configured deny rule.
     ```
   - **根本原因：** 這是 Antigravity 代理人外層框架的安全前置檢查，命令字串因包含 `touch` 工作區路徑，直接命中了使用者預先配置的命令阻擋黑名單，在子行程被 OS 啟動**前**就被攔截。

### 3. 診斷結論與最小必要路徑需求

- **誤診糾正：** 工作樹檔案系統本身並非 OS 唯讀掛載；程式碼「不可變（immutable）」意指 Git 追蹤之原始程式碼不可更動，不代表忽略清單中之暫存快取（`.vite-temp`）必須在 OS 層強制唯讀。
- **最小權限需求：** Vite 需要暫存打包位置。解決方案絕非停用全域安全性 hooks，而是：
  - 透過環境變數或 Vite/Vitest 設定，將 Vite 暫存目錄重導向至已獲完全讀寫授權的私有暫存路徑（例如透過 `TMPDIR`），或
  - 確保執行測試時，測試框架之暫存快取目錄具備明確之沙盒寫入權限，與被保護的 Git 追蹤原始碼嚴格隔離。

---

## 五、 工作區相依解析與 `packages/plugins/sdk/dist` 缺失驗證

### 1. 缺失事實比對

- **新快照 `56d` (`pv-git-env-fixture-fix`):**
  `packages/plugins/sdk/dist` **完全不存在**（`No such file or directory`）。
- **舊快照 `3f1` (`pv-load-fixture-fix`):**
  `packages/plugins/sdk/dist` 存在且包含 76 個編譯後產出檔案（含 `index.js`, `protocol.js`, `types.js` 等）。

### 2. 衝擊分析與靜態解析失敗

- `packages/plugins/sdk/package.json` 之 `exports` 欄位明確定義：
  ```json
  {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./protocol": { "types": "./dist/protocol.d.ts", "import": "./dist/protocol.js" }
  }
  ```
- `packages/plugins/create-paperclip-plugin` 依賴 `@paperclipai/plugin-sdk: "workspace:*"`。
- 執行靜態解析驗證：
  ```text
  Cannot resolve dependency @paperclipai/plugin-sdk: No "exports" main defined in .../@paperclipai/plugin-sdk/package.json
  ```
- 執行 `/private/tmp/pv-phase10-hardening/workspace-precheck.mjs` 實測：**退出碼 1**。
- **結論：** 若在此狀態下執行 Phase 10 之 17 個專案測試，`@paperclipai/create-paperclip-plugin` 勢必再度遭遇 `ERR_MODULE_NOT_FOUND`。硬化工程師依約未私自拷貝是正確的，但此缺項使工作區完整性目前處於 **NO-GO**。

---

## 六、 提案移轉 Manifest 評估（PROPOSAL ONLY）

檢視 `/Users/Hermes/.gemini/antigravity-cli/brain/7307ad6f-9f0a-4309-93d5-f9037b8068bb/scratch/proposed-phase10-manifest-migration.json`：
1. **真實來源（Provenance）：**
   - 記錄 Logical 1 (Attempt 1, 3f1): 退出碼 1，完整日誌 99,074 bytes，雜湊 `707f0aa8...`。
   - 記錄 Logical 2 (Attempt 2 Run 1, 56d): 缺失 37 個模組，原始日誌 115,142 bytes 已遭毀損，誠實標記為 `UNKNOWN / IRRECOVERABLE`，來源標註為 `task-300.log` 與 `step-331-grep`。
   - 記錄 Logical 3 (Attempt 2 Run 2, 56d): Python 3.9 失敗，日誌 152,544 bytes，雜湊 `362cae7e...`。
2. **誠實性判定：**
   該提案未偽造遺失的 115KB 日誌數據，正確將未測得之測試計數標註為 `UNKNOWN`。
3. **現行狀態：**
   現行 live Manifest `/private/tmp/pv-full/manifests/phase-manifest.json` 與 mirror 均維持原樣（2 筆紀錄），未擅自套用。此提案應維持提案性質，不可在未獲授權前直接置換 live 檔案。

---

## 七、 建議之有界改善步驟（Bounded Next Steps）

本審查員嚴格遵守「唯讀診斷、不自行修改實體原始碼」原則，僅描述明確的改善規格，待後續專屬治理步驟實施：

1. **修正控制器授權原子性與範圍校驗：**
   - 改以原子排他檔案（如 `fs.openSync(authPath + ".lock", "wx")`）或 `renameSync` 確保平行啟動時僅單一行程能成功消費。
   - 當 `auth.targetPhaseId !== "all"` 時，若 CLI 未傳入 `targetPhaseId`，必須嚴格 Fail-Closed。
   - 在消費授權前，比對 CLI 傳入之 `targetPhaseId` 確實存在於 `manifest.phases` 中，否則拋出異常，嚴禁退出 0。
2. **補齊工作區產出快取：**
   - 在專屬授權之維運步驟下，自 `3f1` 快照拷貝合法編譯產出 `packages/plugins/sdk/dist` 至 `56d` 工作樹，並重跑 `workspace-precheck.mjs` 直至全數 PASS。
3. **隔離 Vite 快取目錄：**
   - 於執行配方中明確配置環境變數（如指定 Vite 快取路徑至具備寫入權限的專屬臨時目錄），避開 Seatbelt 沙盒在 `.vite-temp` 上的 `EPERM` 攔截。
4. **維持門禁封鎖：**
   - 嚴格維持 Tasks 2.12、2.13、4.2–5.2 為 PENDING / NO-GO，等待上述項目完成並再次複審。
