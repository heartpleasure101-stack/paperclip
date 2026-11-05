# 可攜驗證基線與 GitHub enrollment 回歸：驗證紀錄（tasks 1–3）

狀態：OpenSpec change `portable-validation-and-enrollment-regression` 的 **tasks 1.1–3.3 已完成並附證據**。**tasks 4–5（整合、完整覆蓋驗證、獨立驗證）尚未開始**，本文件不宣稱完整驗收、不可封存。獨立審查（`2026-11-05-portable-validation-independent-review.md`，審查者所有，未修改）的 W1/W2 與新增 tasks 2.5–2.7 的處理見 §10；**§7.4 的事故描述已由 §10.1 更正，請以更正為準**。PR：https://github.com/heartpleasure101-stack/paperclip/pull/2（draft，base=`master`）。

## 1. 環境與快照

| 項目 | 值 |
|---|---|
| base | `master` `a194166017597860a0e53c0c1314e95c597d75cc` |
| 工作樹 / 分支 | `/private/tmp/paperclip-portable-validation`（本機磁碟，非 SMB）/ `fix/portable-validation-baseline` |
| 規格 commit | `6173be542`（與 parent 原稿位元組相同；雜湊清單 `/private/tmp/portable-validation-authoring-hashes.txt`，proposal `0741f9e1…`、design `57559d3c…`、tasks（寫入進度前）`f571d9d2…`） |
| 修復 commits | `0efef4280` cursor、`a4ea1a9ff` muse、`9cd85ddd4` preflight、`ee1c5d0a2` enrollment，其後為本文件與 DEVELOPING 文件 |
| Node / pnpm | v24.18.0 / 9.15.4，每個 shell 都明確 `export PATH=…/v24.18.0/bin:$PATH`；`pnpm install --frozen-lockfile` 在此工作樹 exit 0（18 秒） |
| Git | 預設 Apple Git 2.39.3；隔離 Git 2.56.0（`/private/tmp/pi-dedup-git-toolchain/bin/git`） |
| Python | 系統 `/usr/bin/python3` 3.9.6；Homebrew 3.12.16、3.14.6、3.15.2（預設 `python3` 為 3.15.2） |
| Rust | 隔離 rustc/cargo 1.97.1（`/private/tmp/pi-dedup-rust-toolchain`，需 `CARGO_HOME`/`RUSTUP_HOME`） |
| OpenSpec | 釘選快取 CLI 1.16.0；工作樹內 `validate --strict` 通過、`status`/`instructions apply` 的 `actionContext.allowedEditRoots` 解析為本工作樹 |
| 相依建置 | 為了讓 server 測試能載入入口，執行過 `pnpm --filter @paperclipai/plugin-sdk build`（exit 0；產物在被忽略的 `dist/`）。沒有它時三個測試之一會在收集階段以 `Failed to resolve entry for package "@paperclipai/plugin-sdk"` 失敗，這與本 change 無關 |

## 2. 修復前的原始失敗（task 1.2，保留）

在 `6173be542`（僅加規格、程式碼等同 master）以單檔指令重現；log 在 `/private/tmp/pv-logs/before/`。

| 測試 | 指令 | 結果 |
|---|---|---|
| Cursor | `pnpm exec vitest run src/__tests__/cursor-local-execute.test.ts`（server/） | exit 1；`Tests 2 failed \| 3 passed (5)`；兩個 sandbox 案例皆 `expected 127 to be +0` |
| Muse | `/usr/bin/python3 -I server/src/__tests__/fixtures/muse-client-contract.py server/src/services/scripts/v9/client.py` | Python 3.9.6：`Ran 64 tests … FAILED (errors=1)`，`muse-client-contract.py` 第 559 行 `error.close()` → `tempfile.py` `KeyError: 'file'`。同一指令在 3.12.16、3.14.6、3.15.2 皆 `OK` |
| Enrollment | `pnpm exec vitest run src/__tests__/github-connection-enrollment-work.test.ts` | exit 1；`AssertionError: expected +0 to be 1`，位於測試檔第 138 行（`observe(() => expect(acknowledged).toBe(1))`），約 6.4 秒 |

## 3. GitHub enrollment ack=0 的因果診斷（task 3.1）

方法：在被忽略的暫時副本（`/private/tmp/pv-diag/zz-enroll-diag.test.ts`，已從工作樹移除、未提交）加入有界記錄，不改變斷言與生產碼：包住 `pollOnce`（開始／結果／例外）、`onError`、每個 HTTP 路由到達、delivery receipt 狀態、`pg_stat_activity` 取樣、包住全域 `setTimeout` 記錄每個 fake timer 的呼叫堆疊。Log：`/private/tmp/pv-logs/diag/`。

**基線（`DIAG_MODE=baseline`）時間線（毫秒為真實時間）：**

```
+1712 poll:start/poll:end leased:0                (啟動時尚未註冊，無事可做)
+1736 poll:start {"forDelivery":true}            (註冊並 wake → fake timer 0ms → 本次 poll)
+1747 http:in /v1/connector/events/lease          http:lease {"leases":1}
+1770 fake-setTimeout {"ms":0, "frames":"at scheduleIdleSocketValidation (node:internal/deps/undici/undici:7874) <- resumeH1 …"}
+2143 receipts ["processed"]                      (delivery 已 processed；之後每 400ms 取樣皆同)
+2143…6575 pg:active {"n":0}                      (PostgreSQL 全程無執行中語句)
+4761 observe:FAILED {"requests":3,"leases":1,"acknowledged":0,"errors":0,"httpErrors":0,"nextWake":null,"idleActive":2}
+7756 http:in /v1/connector/events/ack             (測試 finally 還原真實計時器之後才送出)
```

階段判讀：

| 階段 | 證據 | 結論 |
|---|---|---|
| 工作者 poll | `poll:start`/`leased:1` 皆出現；`errors=0`、`httpErrors=0` | 排程與 poll 正常，未丟錯 |
| 簽名／加密 Cloud 替身 | lease 在 +1747 抵達並回應 | 傳輸正確，驗證通過 |
| receipt／DB | `connectionEventDeliveries` 約 400ms 內為 `processed`；PostgreSQL 取樣 n=0 | 持久化完成，DB 不是瓶頸 |
| ack HTTP | 第 4 個請求在 +7756 才到，晚於 observe 的 1 秒上限 | **卡在送出前** |
| 計時器 | ack 之前有一個 `setTimeout(…,0)` 來自 `scheduleIdleSocketValidation`（Node 內建 undici 7.28.0）；`vi.getTimerCount()`=3 | 被測試的假 `setTimeout` 攔住 |

機制（讀自 `process.binding('natives')['internal/deps/undici/undici']`，Node v24.18.0）：undici 在已使用過的 keep-alive socket 上收到新請求時，設 `kIdleSocketValidation=1`，`busy()` 回傳 true，直到 `setTimeout(() => { … client[kResume]() }, 0)` 觸發。測試以 `vi.useFakeTimers({ toFake: ["Date","setTimeout","clearTimeout"] })` 取代全域 `setTimeout`，而 `observe()` 只 `yield` I/O（`setImmediate`）不服務到期計時器，所以 lease 之後的第二個請求（ack）永遠不離開行程。第一個 lease 走新連線，所以能成功。

對照實驗（同一測試，皆在 Node 24.18.0）：

| 實驗 | 結果 |
|---|---|
| `realtimers`（不 fake 計時器、以真實 sleep 取代虛擬推進；真實 5 秒最小間隔過後） | lease 於 +11571，**ack 33ms 後於 +11604 送出**，`poll:end processed:1`。同一契約在真實時鐘下正常 |
| `pump`（`observe` 每輪多做 `advanceTimersByTimeAsync(0)`，不動 `Date`） | 原測試完整通過（exit 0） |
| `connclose`（loopback 伺服器 `connection: close`，避免 socket 重用） | 原測試完整通過（exit 0） |
| `baseline` 重複 4 次 | 每次皆 ack=0，同一時間線 |

**結論（決策 3 的選擇規則）：** 同一契約在真實時鐘下可行；服務完成了 DB 工作、沒有錯誤；停住的是測試的虛擬時鐘與真實傳輸層計時器之間的協調。擁有者是**測試 fixture**，不是 event/enrollment 服務，因此不改生產碼。這證明 Node 24.18.0（undici 7.28.0）上的因果；較舊 Node 的 undici 是否同樣停住，**未驗證**。CI 使用浮動的 `node-version: 24`（`scripts/check-node-version-policy.mjs` 強制），所以其他 24.x 小版本可能行為不同，這是推論。

未採取的方案：延長 `observe` 上限（原因不是等待不夠久，ack 在真實 6 秒後才被放行）；刪除 Date／安靜期／身分斷言；改全域排程器；加輪詢。`connection: close` 可行但改變傳輸行為且只迴避一個症狀，不採用。

## 4. 修復內容（tasks 2.1–2.4、3.2）

變更範圍（`git diff --stat a19416601 HEAD -- . ':!openspec'`）：8 個檔案，+544／−9；**零個生產程式碼檔案**（`packages/`、`server/src/` 非測試、`cli/`、`ui/` 無變更）。`defaultPathForPlatform`、`client.py`、v1–v9 assets 與 byte pins 皆未動（`git diff a19416601 -- server/src/services` 為空）。

1. **Cursor（`0efef4280`）**：`installFixtureNodeRuntime()` 在 fake HOME 的 `.local/bin` 建立指向 `process.execPath` 的 `node` symlink；`fixtureRuntimeEnv()` 讓三個本機案例的 `config.env.PATH` 前置自有 `runtime-bin`。命令、PATH 前綴（`capture.path.split(":")[0]`）、提示斷言原樣保留；新增 symlink 解析到 `process.execPath` 的斷言，以及兩個負向案例（預設命令缺失、無效 override）：兩者都因為 sandbox runner 拒絕 `curl https://cursor.com/install` 而 reject，不下載、不假成功。
2. **Muse（`a4ea1a9ff`）**：`HTTPError` 改用 `io.BytesIO(b'{"error":"synthetic-private-provider-detail"}')` 為 `fp`，`try/finally` 內 `close()`，並新增 `assertTrue(body.closed)`。原本的 `assertEqual(str(raised.exception), …)` 不變。
3. **Preflight（`9cd85ddd4`）**：`scripts/validation-preflight.mjs`＋8 案例 `scripts/validation-preflight.test.mjs`，`package.json` 加兩個 script。階段 `blockers`／`build`／`full`；回報 node、pnpm、git（含 `rev-list --stdin` 含 `--not` 的私有暫存 repo 能力探測，結束後清除）、python（≥3.9）、rust（對照 `rust-toolchain.toml` 通道、`cargo fmt`、`RUSTUP_AUTO_INSTALL=0`）、快照 HEAD/tree/髒檔數、檔案系統型別、`GIT_EDITOR` 與資料庫環境變數（只顯示 host 與路徑，不顯示使用者／密碼／query）。缺項非零退出，不安裝、不連資料庫。
4. **文件（本 commit）**：`doc/DEVELOPING.md`「Isolated validation on a developer machine」。
5. **Enrollment（`ee1c5d0a2`）**：新增 `server/src/__tests__/helpers/fake-clock-io.ts` 的 `settleDueTimers()`（`advanceTimersByTimeAsync(0)`＋I/O yield，若 `Date.now()` 改變即丟錯），`observe()` 以它取代單純 `yieldForIo()`。`Date` 凍結檢查、1 秒真實上限、簽名／加密驗證、PostgreSQL、身分更換、`acknowledged`、`webhookHealth`、25 分鐘 `quiet()` 全部保留（`expect(` 數量 27 → 27）。新增 `fake-clock-io.test.ts` 3 案例：不動 `Date`／後續期限、keep-alive 後續請求可完成、停住時必有排隊計時器。

## 5. 修復後結果

全部在 `/private/tmp/paperclip-portable-validation`、Node 24.18.0；log 在 `/private/tmp/pv-logs/after/` 與 `/private/tmp/pv-logs/docs/`。

| 檢查 | 結果 |
|---|---|
| Cursor，一般 PATH | `Tests 7 passed (7)`（原 5＋2 負向） |
| Cursor，**刻意排除主機 Node 的環境**：`env -i HOME=… PATH=/usr/bin:/bin:/usr/sbin:/sbin <abs node> node_modules/vitest/vitest.mjs run …` | `Tests 7 passed (7)`。同環境下只改 sandbox 案例時曾有 3 個本機案例失敗（見 §7.2），補上 `fixtureRuntimeEnv` 後通過 |
| Muse，直接執行 fixture | Python 3.9.6、3.12.16、3.14.6、3.15.2：皆 `Ran 64 tests … OK` |
| Muse，vitest（`python3`=系統 3.9.6 / Homebrew 3.15.2） | 兩者皆 `Tests 19 passed (19)` |
| Enrollment 原案例，5 次獨立 vitest 行程 | 5/5 `1 passed`，11.0–11.5 秒 |
| Enrollment，6 個自終止的 CPU busy loop 競爭（8 核） | 2/2 `1 passed`，24.7／26.7 秒（受控延遲） |
| 相關回歸（11 檔：enrollment、fake-clock-io、github-connection-events×2、github-connection-work、paperclip-cloud-connector×2、delivery-work-coordinator、deadline-work、work-scheduler、scoped-deadline-work） | `Test Files 11 passed (11)`、`Tests 162 passed (162)` |
| 四個 blocker 檔（cursor、muse、enrollment、fake-clock-io）在隔離 Git＋系統 Python 3.9.6 下再重跑 2 次 | 2/2：`Test Files 4 passed (4)`、`Tests 30 passed (30)` |
| `pnpm typecheck`（`@paperclipai/server`，含 test tree 的 `typecheck:layers`；約 56 秒） | exit 0 |
| Preflight 測試 | `node --test scripts/validation-preflight.test.mjs`：8 pass／0 fail |
| 文件命令，**乾淨暫存 HOME**（`env -i HOME=/private/tmp/pv-cleanhome.sSDGSG`，PATH＝隔離 Git 2.56.0＋Node 24＋系統 Python 3.9.6）：preflight `blockers` → `pnpm run test:validation-preflight` → `pnpm --filter @paperclipai/plugin-sdk build` → 四個 blocker 檔 | 全部 exit 0；preflight `passed`；blockers `Test Files 4 passed (4)`、`Tests 30 passed (30)`。無 monkeypatch、無全域 symlink、`/usr/local/bin/node` 不存在 |
| Preflight 實機（預設 Apple Git，Node 24） | **exit 1**，`git-rev-list-stdin-not` 失敗：`fatal: options not supported in --stdin mode`（預期行為：這正是它要攔的主機缺陷） |
| Preflight `--stage full`，隔離路徑 flags＋`CARGO_HOME`/`RUSTUP_HOME` | exit 0；rustc/cargo 1.97.1、rustfmt 1.9.0 |
| `node scripts/check-node-version-policy.mjs` | 通過 |
| `openspec validate portable-validation-and-enrollment-regression --strict` | 通過 |

## 6. 受控故障（mutation）：真實行為仍被測

每項都在工作樹內暫時修改、跑目標測試、再 `git checkout`／還原；log：`/private/tmp/pv-logs/mutation/`。

| 故障 | 預期 | 實際 |
|---|---|---|
| M1 拿掉 `advanceTimersByTimeAsync(0)` | 回到修復前失敗 | `expected +0 to be 1`（ack=0）失敗 |
| M2 讓 helper 推進 7ms 虛擬時間 | helper 拒絕 | `settleDueTimers must not advance virtual time` 失敗 |
| M3 服務從不送 ack（`if (false && acknowledge.length > 0)`） | 即使有 pump 也失敗 | `expected +0 to be 1` 失敗 |
| M4 服務在身分被移除後仍沿用舊 connector（`if (!config) return configuredConnector?.connector ?? null`） | 身分移除斷言失敗 | `expected 3 to be 2`（`leases === oldLeases`）失敗 |
| Muse：`client.py` 副本讓 HTTP 錯誤訊息洩漏 `error.url` | URL 洩漏斷言失敗 | 恰 1 失敗：`test_http_errors_do_not_echo_url_or_credentials` |
| Preflight：探測永遠通過／Python 下限移除 | 對應測試失敗 | 各自恰 1 個測試失敗，還原後 8/8 |

另：第一次嘗試的 M4（只把 `isDeepStrictEqual` 條件拿掉）**沒有**使測試失敗（`exit 0`），因為服務在身分檔消失時本來就會 `configuredConnector = undefined`；該變異不構成缺陷，已改用上表的 M4。

## 7. 過程中的失敗與事件（保留）

1. 第一輪測試用 `timeout` 指令（本機沒有）→ `exit=127`，改以工具逾時；非程式碼問題。
2. 只改 sandbox 案例後，以排除主機 Node 的環境重跑 Cursor：3 個本機案例失敗（`#!/usr/bin/env node` 在繼承的 PATH 找不到 node）。task 2.1 要求「原 5 案例」都在該環境通過，因此補上 `fixtureRuntimeEnv`。
3. Preflight 測試第一次有 1 個失敗：fake Git 在空 `PATH` 下找不到 `mkdir`／`cat`；調整測試的 PATH 與 fake 腳本，與 preflight 邏輯無關。檔案系統偵測原本在 `mount` 缺席時會謊報「本機」，已改為回報 `skip`（無法判斷）。
4. **事件（已揭露；原始紀錄保留作歷史，內容有誤，已被更正）：** 以下引用是 tasks 1–3 提交時的原文，其中「寫入僅在探針自己的暫存 fake HOME」「沒有殘留 cursor 行程」等句**低估了事故**，請讀 §10.1 的更正。

   > 4. **事件（已揭露）：** 為探測「缺失命令」行為，我曾寫一個**未提交、已刪除**的暫時探針，其 runner **沒有**複製正式測試對 `curl https://cursor.com/install` 的防護，因此該探針確實執行了 Cursor 官方安裝腳本。影響範圍：寫入僅在探針自己的暫存 fake HOME（`/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-RE6HFW` 與 `probe-F4lJKQ`）；已確認真實 `~/.local/bin`、`~/.local/share`、`~/.cursor` 沒有任何 Cursor 檔案、沒有殘留 cursor 行程。這兩個暫存目錄因環境規則禁止遞迴刪除而**留待人工清理**。正式測試（及新增負向案例）一律使用會在 curl 前 `throw` 的 runner。

   **更正（見 §10.1）：** 探針確實完整下載並**執行**了 Cursor CLI，並在真實 `$TMPDIR` 寫了 log，下載的 binary 繼承了執行者的完整環境。不得由此推論「沒有影響」。

5. 診斷用暫時測試檔及 mutation 副本只存在 `/private/tmp/pv-diag`、`/private/tmp/pv-mut`，沒有進入 commit。

## 8. 斷言保留對照

- Cursor：既有 `expect(` 全保留，新增 6 個（`25 → 31`）；唯一被修改的既有行是 `env: { HOME: configuredHome }` → `env: { ...runtimeEnv, HOME: configuredHome }`。
- Muse：`self.assert*` 296 → 297；被移除的行僅是同一斷言搬進 `try/finally`。
- Enrollment：僅 `import` 與 `yieldForIo()` → `settleDueTimers()` 兩處變動；`expect(` 27 → 27。
- 沒有變更任何測試選集、skip 或 runner 設定。

## 9. 未完成與限制

1. **tasks 4–5 未做**：未整合進摘要分支、未跑 typecheck/build、未用 `scripts/run-vitest-stable.mjs` 的官方 dry-run／分組跑完整覆蓋、未做獨立驗證。未執行 `pnpm test:run`（依指示）。
2. 預設 Apple Git 2.39.3 仍使 preflight 失敗；整合階段必須將 Git 2.56.0 置於 PATH 前面（`/private/tmp/pi-dedup-git-toolchain/bin`）。
3. 因果結論只在 Node 24.18.0／undici 7.28.0 驗證；其他 Node 版本未驗。
4. 依 design 決策 6 與使用者指示，parent 原稿（原工作區 untracked 的 `openspec/changes/portable-validation-and-enrollment-regression/`）必須在 task 4.1 合併進摘要分支**之前**先備份並比對雜湊，否則合併會因 untracked 檔案衝突或覆蓋。
5. 三個事故路徑（兩個 `probe-*` 與真實 `$TMPDIR` 內的 `cursor-agent-logs-502`）待擁有者處置（見 §10.1；此處原本只列兩個，已更正）。

## 10. 獨立審查 W1/W2 與 tasks 2.5–2.7 的處理

快照：分支 `fix/portable-validation-baseline`，Node v24.18.0、pnpm 9.15.4（隔離快取）、Git 2.56.0（`/private/tmp/pi-dedup-git-toolchain/bin`）、系統 Python 3.9.6；本節所有指令皆**沒有**下載、安裝、執行 Cursor CLI，也沒有接觸真實 provider。log 在 `/private/tmp/pv-logs/w12/`。

### 10.1 W1：事故紀錄更正（task 2.5）

事實來源：獨立審查 §2（磁碟 metadata 重建）與原 worker 的自述。本 session **沒有**開啟、執行、列舉、修改或刪除下列三個路徑，也沒有讀取任何憑證值；以下是對審查所述事實的轉述，不是重新驗證。

**確定發生的事（不得淡化）：**

1. 一個未提交、已刪除的暫時探針，其 runner 沒有複製正式測試的安裝 guard，因此**真的執行了 Cursor 官方安裝流程**。
2. 安裝**完成**：`probe-RE6HFW`（約 638 MB、628 個項目）內有 Cursor agent 版本 `2026.10.22-27dcf5f` 的完整 vendor release（`cursor-agent-sea` 約 153 MB、`cursor-agent-worker-sea` 約 167 MB、含預編譯 `.node` 的 `node_modules`）。release 無法不經網路抵達，所以有對 `cursor.com` 的網路連線。
3. 下載的 CLI **被執行**：版本目錄有 `.running`、fake home 內有 Node compile cache、一份 session log 記錄 `analytics.track {"eventName":"cli.launch"}`（PID 95377，本地時間約 09:07:04）。也就是 adapter 的 `execute()` 啟動了剛下載的 binary。
4. 該 binary **在真實 `$TMPDIR` 寫了 log**：`cursor-agent-logs-502/`（一份 1869 位元組 log 加 `latest.log` 符號連結），因此並非「寫入僅限 fake HOME」。審查者未在該 log 看到像憑證的值。
5. adapter 以 `{ ...process.env, ...env }` 啟動子行程（`packages/adapters/cursor-local/src/server/execute.ts`），所以下載的 vendor binary 繼承了**執行該探針之行程的整個環境**。
6. 原紀錄寫的「沒有殘留 cursor 行程」只是一項觀察，不代表沒有影響。

**無法證明的事（沒有證據，不是「已證明沒有」）：**

- 該環境裡是否有 token / API key：未知，磁碟證據無法判定；這是最大的未界定風險。
- `cli.launch` analytics 事件是否離開本機：未知。
- 安裝腳本本身與其網路流量未保存，無法證明它只使用 `$HOME`。
- 事故前沒有真實 HOME 的基準快照，「沒變」只建立在有限深度的 mtime 視窗上。
- 未檢查 Keychain、launchd 狀態、`defaults` 網域、quarantine 資料庫或其他使用者路徑。
- **因此不能宣稱已排除外洩，也不能宣稱「沒有影響」。**

**另外觀察到（與上面的「無法證明」分開看）：** 審查者的 `ps`/`lsof` 在兩個探針目錄下沒有找到仍在執行的行程（PID 95377 已結束）；真實 HOME 的 `~/.local/share/cursor-agent`、`~/.local/bin/agent`、`~/.local/bin/cursor-agent`、`~/.cursor`、`~/Library/Caches/cursor*`、`~/Library/Application Support/Cursor*` 皆不存在；shell rc 與 LaunchAgents 的 mtime 早於事故視窗；fake home 內沒有 rc 檔編輯。`probe-F4lJKQ` 只是空骨架，**不是**「guard 有效」的證據。`~/.local/bin` 目錄 mtime 為 09:29:46（事故之後），無法歸因，內容沒有 Cursor 檔案。

**保留的證據路徑（皆未動；刪除曾被安全 hook 拒絕，沒有改用其他 API 或指令繞過）：**

1. `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-RE6HFW`（約 638 MB）
2. `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-F4lJKQ`（空樹）
3. `/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/cursor-agent-logs-502`（log 與符號連結）

**待擁有者決定（本 session 不做）：** 是否授權清理上述三個路徑；是否需要輪替事故當時可能存在於該行程環境的任何秘密。沒有自動輪替，也沒有進行秘密探勘（沒有列舉環境變數或讀取憑證檔）。

### 10.2 W2：安裝 guard 改為執行前 fail-closed（task 2.5）

`server/src/__tests__/helpers/sandbox-install-guard.ts`（新）；`cursor-local-execute.test.ts` 的 `createLocalSandboxRunner()` 現在只回傳 `createGuardedSandboxRunner()`，所有整合案例（含兩個負向案例）都經過它；原本「複製字面字串」的子字串檢查已被取代。生產碼零變更；`SANDBOX_INSTALL_COMMAND` 本來就由套件根匯出，沒有為測試新增任何生產 export。

| 層 | 行為 |
|---|---|
| 呼叫形式 | 只接受 `sh`/`bash -c <單一腳本>`，或位於暫存根目錄內（`realpath` 解析後仍在其內）的既有 fixture 執行檔；`curl`、`/usr/bin/curl`、`env curl`、`python3`、`sh`/`sh -s`/`bash -`（程式碼來自 stdin）、相對路徑、不存在的路徑、指向暫存目錄外的符號連結一律拒絕 |
| stdin | 對 shell 腳本，stdin 只在腳本恰為 `base64 -d >> <檔案>`（資料落地）時接受；其他帶 stdin 的 shell 一律拒絕。fixture 執行檔的 stdin 是提示詞資料 |
| 詞彙 | 安裝 URL／`cursor.com`、URL scheme、curl/wget/fetch/nc/ssh 等下載工具、套件與工具鏈管理員、`git clone` 類、腳本 runtime、`install*`、eval/source/exec、`/dev/tcp`、管線進直譯器、`base64 -d` 後接管線，在去除引號與反斜線後比對（`cu''rl`、`c\url` 也會命中） |
| 變形 | 反引號、`$(...)`（只放行 `$(command -v …)`）、`${…}`、`$'…'`、未知變數、裸直譯器（無 `-c`）一律拒絕 |
| fail-closed | 去除路徑後，腳本內任何**不在已知詞彙表**的單字即拒絕；adapter 新增腳本形式會響亮失敗，而不是默默放行 |
| 與常數的關係 | 另外正規化後比對匯入的 `SANDBOX_INSTALL_COMMAND`；就算常數改變，其他層仍會攔截（單元測試用改寫過的常數：http、`wget -qO-`、不同旗標、大寫） |

拒絕訊息保留 `Sandbox fixture did not discover its preinstalled Cursor CLI`（原有負向斷言的 regex 不變），並附 `blocked before execution: <原因>`。誠實的限制：這是**防止意外網路安裝**的測試護欄，不是對抗性的 shell 沙箱。

首次整合時 guard 就攔下了一個合法的 adapter 探測腳本（printf 的 `\n` 被正規化成單字 `sn`），adapter 吞掉該拒絕後走到安裝分支，再被 guard 擋下；整個過程沒有任何網路使用。修正詞彙萃取後通過。這也是 fail-closed 行為的實際示範。

**secretless 假 runner 環境：** `runChildProcess` 會把 `process.env` 併入子行程環境，而 adapter 在部分呼叫中把整份主機環境放進 `input.env`（實測：部分 probe 的 `input.env` 有數十個主機變數）。假 runner 的後端改以 `/usr/bin/env -i` 啟動，只傳 `HOME`、`PATH`、`LANG`、`LC_ALL`、`TMPDIR` 與 adapter 提供的 `PAPERCLIP_*`；`PATH` 缺席時用系統路徑，不用主機 PATH。這**沒有**更動 SUT（adapter 仍照舊傳 env），只限制假 CLI 看得到什麼。

**測試與實測：**

| 檢查 | 結果 |
|---|---|
| `sandbox-install-guard.test.ts`（新；純函式＋記錄用 sentinel backend；無任何真實下載器） | 57 個案例：13 個已知形式放行、拒絕案例表、fixture 執行檔／符號連結／URL 參數、組合（拒絕時 backend 從未被呼叫、放行時恰好一次）、secretless env（含 sentinel） |
| `cursor-local-execute.test.ts`（原斷言保留，`expect(` 31 → 31；唯一移除的是被取代的行內 runner 與其 import） | 7/7 |
| guard 變異（只跑上面的**單元檔**，絕不跑 Cursor 整合檔；每次還原後雜湊與 `9b3ad35e…` 相同） | MG1 全放行→39 失敗；MG2 無詞彙表→4；MG3 runner 不呼叫 guard→1；MG4 stdin 不檢查→1；MG5 裸直譯器放行→**首次存活**（56/56），補了「巢狀 `sh <檔案>`」案例後→1 失敗；MG6 不檢查 shell 形式→4；MG7 env 全傳→2；MG8 未知單字放行→1；MG9 不檢查根目錄→3 |
| 反例安全 | 所有反例只是傳給純函式或 sentinel backend 的惰性字串；沒有任何真實 `curl`/`wget`/安裝腳本被執行，包含暫時診斷。探索 adapter 呼叫形式時，用的是仍啟用舊 guard 的記錄包裝，之後還原 |

探索期間有兩次命令被安全 hook 拒絕（一次是強制刪除舊 log，一次是以重導向清空檔案）；兩次都是**整條命令未執行**，我改用新檔名，沒有繞過。

### 10.3 tasks 2.6：preflight 唯讀邊界

`scripts/validation-preflight.mjs`：新增匯出 `READ_ONLY_PROBE_ENV`（`RUSTUP_AUTO_INSTALL=0`、`COREPACK_ENABLE_NETWORK=0`、`COREPACK_ENABLE_AUTO_PIN=0`、`GIT_OPTIONAL_LOCKS=0`），套用到所有探測子行程（含私有暫存 repo 的 Git 探測與 `git status`／`rev-parse`）；暫存目錄建立失敗時，回報 `git-rev-list-stdin-not` 失敗並附原因（`cannot create a private probe directory under …: ENOTDIR`），輸出 JSON 與非零退出，不再丟未捕捉例外。

| 檢查 | 結果 |
|---|---|
| `node --test scripts/validation-preflight.test.mjs` | 12/12（原 8＋4 個 fault test：呼叫者設 `GIT_OPTIONAL_LOCKS=1` 時每個 Git 呼叫仍為 0；呼叫者設 `COREPACK_ENABLE_NETWORK=1` 時 pnpm／cargo 探測仍為 0；`TMPDIR` 指向一般檔案→JSON `ok:false`、exit 1、stderr 為空；API 版本的缺目錄，不留目錄） |
| 變異（還原後雜湊 `cd672c38…`） | MP1 拿掉 optional locks→1 失敗；MP2 拿掉 Corepack→1；MP3 快照讀取不保護→1；MP4 暫存失敗改丟例外→2；MP5 暫存 repo 不保護→1 |
| 倉庫 index 實測 | 先令 index 過期（touch 追蹤檔 mtime），preflight 前後 index 的 `mtime size` 皆為 `1793843421 1658919`；緊接著的普通 `git status` 則刷新為 `1793844072` |
| 真實 pnpm shim | 乾淨環境第一次跑 preflight：nvm 的 `pnpm` 是 Corepack shim，探測正確失敗並顯示 `Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-9.15.4.tgz`，**沒有下載**（§10.4 說明如何提供快取） |
| 全域寫入／安裝 | 無：沒有安裝、沒有全域 symlink、沒有改動 profile；探測目錄用完即清 |

**實際驗證的 Node 版本限制（W3，已知限制）：** enrollment ack=0 的因果診斷（undici 的零延遲 `setTimeout` 被假計時器攔住）只在 **Node v24.18.0 / undici 7.28.0** 驗證。CI 使用浮動 `node-version: 24`，其他 24.x 小版本與較舊 Node 未驗證；`settleDueTimers()` 修法不依賴特定 undici 版本，但這**不是**未來 24.x 全矩陣的證明。已寫入 `doc/DEVELOPING.md`。

### 10.4 tasks 2.7：secret-free 驗證子行程環境

`scripts/validation-clean-env.mjs`（新，約 130 行、無新套件）＋ `scripts/validation-clean-env.test.mjs`（7 案例）＋ package.json 兩個 script（`validation:clean-env`、`test:validation-clean-env`）＋ `doc/DEVELOPING.md`〈Secret-free validation subprocess〉。

- **allowlist：** `PATH`（執行中的 Node、每個 `--bin` 宣告目錄、系統目錄）、擁有的暫存 `HOME`／`TMPDIR`／`PAPERCLIP_HOME`／`XDG_*`、`GIT_CONFIG_GLOBAL`（含**合成**測試身分 `Paperclip Validation <validation@paperclip.invalid>`）、`GIT_CONFIG_NOSYSTEM=1`、`GIT_TERMINAL_PROMPT=0`、`GIT_OPTIONAL_LOCKS=0`、`COREPACK_HOME`（擁有的空目錄，可用 `--set` 指向隔離快取）、`COREPACK_ENABLE_NETWORK=0`、`COREPACK_ENABLE_AUTO_PIN=0`、`RUSTUP_AUTO_INSTALL=0`。其他一律不傳。
- `--set`／`--pass` 可明確加入額外變數，但拒絕名稱含 `KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE|SESSION`、`NODE_OPTIONS`、`NODE_PATH`、`BASH_ENV`、`ENV`、`LD_PRELOAD`、`DYLD_*`、`DATABASE_URL`、`PAPERCLIP_TEST_DATABASE_URL`；結束時移除擁有的目錄。
- **不是 OS sandbox**：仍以你的使用者身分執行，可讀你能讀的檔、可連網；不更動父行程、父 agent 的模型認證或任何全域設定。（`__CF_USER_TEXT_ENCODING` 是 macOS 在啟動程序時自行加入的，helper 的計畫輸出不含它。）
- **快取 pnpm：** nvm 的 pnpm 是 Corepack shim。把已存在的主機 Corepack 快取中的 `pnpm/9.15.4`（唯讀複製，19 MB）放到隔離目錄 `/private/tmp/pv-clean-tools/corepack`，以 `--set COREPACK_HOME=…` 提供；沒有任何下載，也沒有寫入主機快取。

**證明（假 sentinel，不讀任何真實秘密）：**

| 檢查 | 結果 |
|---|---|
| 父 shell 設 `PV_FAKE_PROVIDER_API_KEY`、`OPENAI_API_KEY`（皆為假字串）後，在乾淨環境印出 | 兩者皆 `null`；變數名單恰為 allowlist＋`__CF_USER_TEXT_ENCODING`；`HOME`／`PAPERCLIP_HOME` 在擁有的暫存根（`clean/sentinel.json`） |
| 單元測試的主機環境有 sentinel 金鑰、`DATABASE_URL`、`GIT_AUTHOR_EMAIL`、**有效的** `NODE_OPTIONS=--require=<預載檔>`（會設定 `PV_PRELOAD_MARKER`）、個人 HOME 的 `.gitconfig` | 子行程沒有任何這些，也沒有 `PV_PRELOAD_MARKER`；Git 讀到的是合成身分（`git config --global --get user.email`） |
| `node --test scripts/validation-clean-env.test.mjs` | 7/7 |
| 變異（還原後雜湊 `233d12ab…`） | MC1 繼承全部→2 失敗；MC2 用主機 HOME→1；MC3 不拒絕憑證名→1；MC4 洩漏 NODE_OPTIONS→2；MC5 不設 Git config→5；MC6 不清理→1；MC7 Corepack 網路不關→1 |

**乾淨環境下的 preflight 與 blocker suites**（`CLEAN="node scripts/validation-clean-env.mjs --bin /private/tmp/pi-dedup-git-toolchain/bin --set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack"`；父 shell 持有上述假 sentinel；log 在 `/private/tmp/pv-logs/w12/clean/`；文件與 package.json 修改後在最終樹上重跑）：

| # | 指令（皆 `$CLEAN -- …`） | exit | 結果 |
|---|---|---|---|
| A | `pnpm run test:validation-preflight` | 0 | 12 pass / 0 fail |
| B | `pnpm run test:validation-clean-env` | 0 | 7 pass / 0 fail |
| C | `node scripts/validation-preflight.mjs --stage blockers` | 0 | `preflight passed`（node 24.18.0、pnpm 9.15.4、git 2.56.0＋`--not` 探測通過、python 3.9.6；rust SKIP，此階段不需要） |
| D | `/usr/bin/python3 -I server/src/__tests__/fixtures/muse-client-contract.py …/v9/client.py` | 0 | `Ran 64 tests … OK`（Homebrew `/opt/homebrew/bin/python3` 3.15.2 亦 `OK`，exit 0） |
| E | `cd server && pnpm exec vitest run cursor-local-execute sandbox-install-guard muse-client-contract fake-clock-io github-connection-enrollment-work` | 0 | `Test Files 5 passed (5)`、`Tests 87 passed (87)`（57＋19＋1＋7＋3；沒有 skip，enrollment 案例確實執行，不是 `describe.skip`） |

沒有執行 typecheck、build、整合或全量測試（依指示）。

### 10.5 對照審查建議

| 審查項目 | 處理 |
|---|---|
| W1 | §10.1：更正、保留原文為歷史；不宣稱無影響 |
| W2 | §10.2：fail-closed guard＋純單元／sentinel 測試＋9 個變異＋secretless runner |
| W3 | §10.3：寫成已知的已測版本限制（Node 24.18.0），不宣稱未來 24.x 矩陣 |
| 建議 1（Git optional locks） | 已做；index 實測（§10.3） |
| 建議 2（Corepack 網路） | 已做；真實 shim 實測被正確攔下 |
| 建議 3（Cursor 本機案例 PATH 仍附加主機 PATH） | **未改**（保持原斷言與 fixture 行為）。獨立性改由 §10.4 的乾淨環境（PATH 只含宣告目錄）與先前的 `env -i` 執行佐證 |
| 建議 4（暫存失敗） | 已做；fault test（§10.3） |

### 10.6 規格同步與雜湊

parent 修訂的 `design.md`、`tasks.md`、`specs/isolated-validation/spec.md` 已從原工作區逐字同步（`proposal.md`、`github-event-worker-lifecycle/spec.md`、`.openspec.yaml` 與原稿位元組相同）。作者雜湊（原工作區，清單 `/private/tmp/portable-validation-authoring-hashes-amend1.txt`）：

```
design.md                                    69547cab64c8bcfbc2b5b106103b0c725355dafc59353d4e231535bf290d1033
tasks.md  （作者版：全未勾選）                e3e125165a9321876d23f1c6f66eeb1051620ed3a517e4d654a2de47d68478fe
specs/isolated-validation/spec.md            a0689405bd10e7c2ae6593d035dd8baf161f04c8ba513edc00b08d9ea7db2058
proposal.md                                  0741f9e16590cc9a619f85243edc126eafcb38f695932da919aba6bed1a8329d
specs/github-event-worker-lifecycle/spec.md  e0028b8db1f216b6c7864dcec96d8c0586e45207cc4b01f9d85068643868bc7a
```

本分支的 `tasks.md` 與作者版僅差 checkbox（以任務編號保留既有進度 1.1–3.3；去除勾選後逐行比對相同）。同步前與同步後 `openspec validate … --strict` 皆通過（CLI 1.16.0、Node 24、`OPENSPEC_TELEMETRY=0`）。同步前本地 tasks 雜湊 `4cf5833b…`，同步（2.5–2.7 未勾選）後 `e3b005d7…`。本次證據提交中，2.6 與 2.7 已勾選（證據見 §10.3、§10.4）；**2.5 保持未勾選**，因為它要求「經獨立複審確認」，那是新的獨立 session 的工作，不是本 session 能自行宣告的。

### 10.7 修改後的檔案雜湊（SHA-256）

```
cd672c38c19cc62863ff0187ba07de94002317681bf42fe19a76feb934f61dac  scripts/validation-preflight.mjs
cdb268394f4fd8b5ee257b47508c658b09db9f2c61213f9a369a294fc32780b8  scripts/validation-preflight.test.mjs
233d12abe0afae127475e00816b694388552c985b4821fc41fdf808bddc4a465  scripts/validation-clean-env.mjs
dc813d2459091e413bcbac6292b7bee53cb82ec8edc391691a76bf1ea6b2612b  scripts/validation-clean-env.test.mjs
9b3ad35e85ff167c23ef3d4543406aadcb189c14877e76c0fc859f084051d425  server/src/__tests__/helpers/sandbox-install-guard.ts
c309cb0ae18d385314492aba4d486117660d7d45abb0c3a7f590de22f4377b68  server/src/__tests__/sandbox-install-guard.test.ts
c7f8bd3f706801c4e8e7f122a06d9eb89feb97af770643852565ba7524cb0c20  server/src/__tests__/cursor-local-execute.test.ts
a761315dc996ae8c333e62ce9947d300ea8f287754251bec2308192597172f44  doc/DEVELOPING.md
a0d5a5d50d52eaff9abcb0e347983cc090e00014d69e306feebce86947dd584c  package.json
```

### 10.8 殘留與限制

1. mutation MC6（刻意讓 helper 不清理）在 `$TMPDIR` 留下 8 個我自己建立的空骨架目錄 `paperclip-clean-env-*`（`0A9bKn`、`90ONAU`、`MWdUBJ`、`QFWPjY`、`U8Fs8R`、`kQvXLq`、`tHFExA`、`ylfgFd`，皆含 `git/config` 與空目錄）。安全 hook 禁止遞迴／強制刪除，我沒有繞過；請一併處置。正常（未變異）執行不留殘留。
2. 另有隔離工具目錄 `/private/tmp/pv-clean-tools`（19 MB 的 pnpm 9.15.4 快取複本，我建立）。
3. 審查報告 §8 的提醒（原工作區 untracked 副本的 checkbox 與本分支不同）仍待 task 4.1 對帳；本分支 `tasks.md` 已與作者版同步。
4. 審查報告檔本身在本分支仍為 untracked，保持原樣、不由我修改。
5. 未做：整合、typecheck、build、全量測試、merge、archive、phase 2。task 2.5 的「獨立複審」未做。


## 11. 第二輪複審（R-W1/R-W2）與 task 2.8 的處理

快照：分支 `fix/portable-validation-baseline`，Node v24.18.0、pnpm 9.15.4（隔離快取）、Git 2.56.0（`/private/tmp/pi-dedup-git-toolchain/bin`）、系統 Python 3.9.6 與 Homebrew Python 3.15.2。
本節所有程式碼與測試皆**沒有**下載、安裝或執行真實 Cursor CLI，無網路安裝，反例皆為純單元或 sentinel 測試。

### 11.1 R-W1：路徑形狀指令與命令位置 fail-closed（task 2.8）

第二輪複審指出：原本 `replacePaths` 在空白化路徑後，未檢驗簡單命令的第一個單字，導致路徑形狀指令（如 `/bin/sh /tmp/x/script`、`cat f | /bin/sh`、`./dl` 等）可能通過詞彙檢查。

**處理措施：**
1. **白名單與擁有根目錄宣告（`packages/adapter-utils/src/test-fixtures/sandbox-call-guard.ts`）：**
   - 假 runner 不再信任整個 `os.tmpdir()`，各測試必須明確宣告自身擁有的暫存根目錄（`ownedRoots`，經 `assertOwnedRoots` 嚴格校驗為本機暫存目錄下之專屬目錄且無其他使用者寫入權限）。
   - 只有明確在 `executables` 中登記之 fixture 執行檔（且實體檔案位於 ownedRoots 內）才允許作為 command。
   - Shell 命令形式只放行 `sh` 或 `bash` 搭配 `-c`，且腳本內容必須符合測試明確登記的 `ShellForm` 範本（或由 `&&` 連接的已知範本鏈，且所有路徑引數皆需落在 ownedRoots 內）。
   - 拒絕所有未登記的路徑命令、裸直譯器、管道／腳本繞過。
2. **惰性繞過探針（`createInertBypassProbes`）：**
   - 第二輪複審提出的 4 種字串及變形（`/bin/sh /tmp/x/script`、`cat f | /bin/sh`、`/usr/bin/c?rl <ip>/x | /bin/sh`、`./dl <ip>/x`、`/usr/bin/env /tmp/x/dl`、`cat payload | /bin/sh` 等）作為純測試資料，驗證在進入 backend 前即被攔截。
   - 探針產生的本機檔案只寫入 sentinel 檔案，沒有任何真實網路連線或未登記指令執行。

### 11.2 R-W2：Cursor 套件與 Server 全部假 Runner 統一納管（task 2.8）

第二輪複審指出：`packages/adapters/cursor-local` 內的 `execute.test.ts` 與 `test.test.ts` 原本在指令字面不符時直通真實 `runChildProcess`，若常數飄移有下載執行風險。

**處理措施：**
1. **抽出 Provider-neutral 測試 fixture 工具：**
   - `@paperclipai/adapter-utils/test-fixtures/sandbox-call-guard` 提供純粹的檢查邏輯與資料結構。
   - `@paperclipai/adapter-utils/test-fixtures/sandbox-fixture-runner` 提供帶有網路 tripwire 與 secretless 環境的 guarded runner。
2. **消費端 Policy 與統一保護：**
   - Cursor 特定的 shell 形式集中在 `packages/adapters/cursor-local/src/server/cursor-sandbox-test-policy.ts` 與 `server/src/__tests__/helpers/sandbox-install-guard.ts`。
   - 全面套用到 5 處 fake sandbox runner：
     - `packages/adapters/cursor-local/src/server/execute.test.ts`
     - `packages/adapters/cursor-local/src/server/test.test.ts`
     - `packages/adapters/cursor-local/src/server/remote-command.test.ts`
     - `server/src/__tests__/cursor-local-execute.test.ts`
     - `server/src/__tests__/cursor-local-adapter-environment.test.ts`
   - 已知安裝請求（`SANDBOX_INSTALL_COMMAND`）只由測試明確配置的 `installStub` 在記憶體中替換為無害的本機模擬腳本，永遠不 fallback 到未保護的後端。
   - 保留所有原始 real command discovery、PATH、custom-command、auth 及提示詞斷言。

### 11.3 乾淨環境測試結果

在 `scripts/validation-clean-env.mjs`（`--bin /private/tmp/pi-dedup-git-toolchain/bin --set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack`）下執行：

| 測試組 | 命令 | 結果 |
|---|---|---|
| preflight 單元測試 | `pnpm run test:validation-preflight` | 12 pass / 0 fail (exit 0) |
| clean-env 單元測試 | `pnpm run test:validation-clean-env` | 7 pass / 0 fail (exit 0) |
| preflight blockers 檢查 | `node scripts/validation-preflight.mjs --stage blockers` | PASS (exit 0) |
| Muse Python 合約測試 | `/usr/bin/python3 -I .../muse-client-contract.py` (系統 3.9.6) | 64 pass (exit 0) |
| Muse Python (Homebrew) | `/opt/homebrew/bin/python3 -I ...` (3.15.2) | 64 pass (exit 0) |
| Server 目標測試組 (6 檔) | `cd server && vitest run cursor-local-execute sandbox-install-guard muse-client-contract fake-clock-io github-connection-enrollment-work cursor-local-adapter-environment` | Test Files 6 passed (6), Tests 66 passed (66) (exit 0) |
| Cursor-local 套件測試組 (3 檔) | `cd packages/adapters/cursor-local && vitest run execute.test.ts test.test.ts remote-command.test.ts` | Test Files 3 passed (3), Tests 15 passed (15) (exit 0) |
| Adapter-utils Guard 單元測試 | `cd packages/adapter-utils && vitest run sandbox-call-guard.test.ts` | Test Files 1 passed (1), Tests 67 passed (67) (exit 0) |

所有既有原斷言完整保留。

### 11.4 邊界與限制聲明

1. **已測版本限定：** 僅在 Node v24.18.0 / undici 7.28.0 下驗證。CI 浮動的 `node-version: 24` 其餘小版本未納入保證。
2. **環境隔離非 OS 沙箱：** `scripts/validation-clean-env.mjs` 僅為子程序環境變數衛生管理，不是作業系統沙箱。
3. **SSH 與 Keychain 超出隔離範圍：** 直接向系統使用者資料庫或 macOS Keychain 查詢金鑰的工具（如 `ssh` 或 Keychain 整合的 credential helper）不因 `HOME` 重新導向而受限。
4. **變數名稱過濾限制：** 僅依環境變數名稱（Key）進行 allowlist 與敏感詞（KEY/TOKEN/SECRET 等）過濾，不針對變數內容值（Value，如內含密碼之 URL）進行深層掃描。
5. **信號中斷清理限制：** 清理邏輯位於 `spawnSync` 之 `finally` 區塊；若測試執行程序遭不可捕捉信號（如 `SIGKILL`）終止，無法自動刪除暫存目錄，需手動清理。
6. **Fake Runner 必備條件：** 執行 fake sandbox runner 必須搭配 clean-env，以確保子程序不繼承父程序之敏感環境變數。
7. **歷史與事故記錄：** 保留歷史事故路徑與過去之 hook 拒絕記錄，不進行未授權之刪除或憑證值探測。
8. **任務狀態：** tasks 2.5 與 2.8 均保持未勾選（`[ ]`），待獨立 Flash 審查 session 確認後方可勾選。

### 11.5 修改檔案雜湊（SHA-256）

```
8e614f20b0b031af10303fd824e5286251f6ef42acc0f3621d39025973d02c93  packages/adapter-utils/src/test-fixtures/sandbox-call-guard.ts
3b4a63fc7079e81be7975b3fa383d1c7d1ef3487ed94ad1a619f7febe1de973a  packages/adapter-utils/src/test-fixtures/sandbox-call-guard.test.ts
f04056669a573f25dea3d2abd1a71adf014c1d03f4c615ae3f54cb5ae6e88f97  packages/adapter-utils/src/test-fixtures/sandbox-fixture-runner.ts
e3c84e7cc88c647958ece5d5a14301dcc983fce37200059b60368c317425807f  packages/adapters/cursor-local/src/server/cursor-sandbox-test-policy.ts
b5eb0b479ac2200f3722c755c66374c60958a446f74858875af1e62963d7c24d  packages/adapters/cursor-local/src/server/execute.test.ts
42a1d4f32df84db0d81a8403f9645a13ba3991cde60806699d965fb6b0a49d7a  packages/adapters/cursor-local/src/server/test.test.ts
2f02ed0785a1185e952feee86c77ff9019e263db83d41d3ffec845fdf97d86fc  packages/adapters/cursor-local/src/server/remote-command.test.ts
51df6f263e29413b6ab4a1551844d5b1ad15eefac1ff4a8265d284090e7d6864  server/src/__tests__/helpers/sandbox-install-guard.ts
46d8667702404c0bf8b7505dc65998212956e744557d6f669a8bb009781ed1ca  server/src/__tests__/sandbox-install-guard.test.ts
2d34f41b84fb4342eb60c67262985c70a4828436ef53b63007209e0fb2ae9f57  server/src/__tests__/cursor-local-execute.test.ts
28bc317c015f63b42904e28fb91ce38be06fb8e08e807f80664755d552aeef26  server/src/__tests__/cursor-local-adapter-environment.test.ts
9b7f046089c7b8e659e3a6564b3452e498b5f6d11c88a786706b51211ab662d5  doc/DEVELOPING.md
```

## 12. 獨立審查複審結果（HEAD fc3fd4ee6）與防護閉合記錄

獨立 Flash 審查 session 已完成對 HEAD `fc3fd4ee6`（樹 `55f3e64728e2b8910dceaac2d130e5881f17741b`）之第二輪複審（見 `doc/plans/2026-11-05-portable-validation-independent-review.md` 第二次補篇，雜湊 `fc60fe854c2fba00673eaff6c23e73450b4aba2e09b81d3b309a59e7d1b3f557`）：

1. **審查結論：** CRITICAL 0、WARNING 0，R-W1 與 R-W2 全數解除，判定 **GO FOR INTEGRATION**。據此將本 change 之 tasks 2.5 與 2.8 標記完成（累計 13/19 已完成）。
2. **精確測試數據：**
   - Vitest 測試總計 **148 passed**（server 66 + cursor-local 15 + adapter-utils 67；0 failed / 0 skipped）。
   - Preflight 單元測試 12 passed、clean-env 單元測試 7 passed、Preflight blocker 7 項檢查通過。
   - Muse Python 合約測試：系統 Python 3.9.6 與 Homebrew 3.15.2 各 64 passed。
3. **「無網路存取」文意澄清：** 審查報告中所述「無網路存取」（without network access）意指**沒有執行任何真實網路下載或安裝程式**（所有安裝請求均由 guard 在記憶體中攔截或 stub 化），**並非指作業系統級的網路完全隔離**。例如 GitHub enrollment 測試仍使用真實本機 loopback HTTP 通訊；本驗證未執行作業系統級的網路封包擷取，亦未宣稱或認證過去事故從無網路暴露。
4. **邊界與限制保留：** 因果診斷依舊限定於 Node v24.18.0 / undici 7.28.0；歷史事故之三個殘留目錄（兩個 `probe-*` 與 `cursor-agent-logs-502`）依舊保留待擁有者處置；`clean-env` 是環境變數清理而非 OS 沙箱。
5. **後續整合關卡（Next Integration Gates）：** tasks 4 與 5（包含跨分支 merge、官方 dry-run 完整選集與各分組驗收、正式 PR 更新與驗收交付）仍保持未開始（pending），待下一階段整合流程進行。

## 13. 本機整合與前置／Typecheck／Build 驗收紀錄（2026-11-05，整合驗證 session）

依據任務指示，整合驗證 session 已完成修復分支本機 merge、工作樹不可變切換、乾淨環境（`scripts/validation-clean-env.mjs`）前置檢查、守護與回歸選集、以及全 workspace 之 build 與 typecheck。

### 13.1 本機 Merge 與來源身分指紋

1. **Merge 提交紀錄：**
   - 原摘要 branch：`fix/pi-single-prompt-summary-dedup`
   - Merge commit SHA：`cc56bbcd30a7de1a78a92b108dba772d3c02a500`
   - 父提交 1（Parent 1，摘要分支）：`e5eee012e94f5fd04c29e12235afcf59fdf7aa82`
   - 父提交 2（Parent 2，修復分支）：`b57ac3112696296078d9f4872da827d44d33d926`
   - 方式：`git merge --no-ff --no-edit fix/portable-validation-baseline`（一般 merge commit，無 skip／無 no-verify，正常 hooks）。
   - 未執行 remote push，不 merge GitHub PR，不 force-push。

2. **工作樹狀態與不可變快照：**
   - 驗證工作樹目錄：`/private/tmp/paperclip-portable-validation`
   - 工作樹 checkout 狀態：`git switch --detach cc56bbcd30a7de1a78a92b108dba772d3c02a500`（detached HEAD）
   - 修復分支 ref `refs/heads/fix/portable-validation-baseline` 仍停留在 `b57ac3112696296078d9f4872da827d44d33d926`，PR #2 維持獨立。
   - 工作樹 HEAD：`cc56bbcd30a7de1a78a92b108dba772d3c02a500`
   - 工作樹 Tree SHA：`37295d5b275b63408b4c9d57ad9c76382c1f18e7`
   - 驗證期間與驗證結束後，本機工作樹追蹤檔案完全不可變，無任何 source 變動或 uncommitted entries。

3. **五項 Pi 摘要去重相關檔案雜湊（SHA-256）：**
   與 `e5eee012e` 逐位元完全一致：
   - `2a516bbf2461b5f3eeb1cc9b0e7653d8c51c2677c157b32e1ba9b6be4d4101e6`  `packages/adapter-utils/src/continuation-summary-dedup.test.ts`
   - `417b4066d33ffe1b77982861fa8621f706acac5efab1c6e0a5a23b5e672a8b9d`  `packages/adapter-utils/src/server-utils.ts`
   - `222ace23dcfe3edc282324fd4f422a07c627e6962dcaa3992e3991301a82bc85`  `packages/adapters/opencode-local/src/server/execute.test.ts`
   - `d55586be6d5a24a730661cedf37cdd7500a6957977df463129944e05a8f04a33`  `packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts`
   - `036a23cdb8c0ab34f2e99a270647a636fb066c229ea957d75ed4e631145cef20`  `packages/adapters/pi-local/src/server/execute.ts`

### 13.2 驗證環境與執行工具鏈

全部子程序皆透過 `scripts/validation-clean-env.mjs` 執行：
- 執行器 Node：`/Users/Hermes/.nvm/versions/node/v24.18.0/bin/node`（Node 24.18.0）
- 宣告工具目錄：`--bin /private/tmp/pi-dedup-git-toolchain/bin --bin /private/tmp/pi-dedup-rust-toolchain/cargo/bin --bin /usr/bin --bin /opt/homebrew/bin`
  - Git：`git version 2.56.0`（來自 `/private/tmp/pi-dedup-git-toolchain/bin`）
  - Python：系統預設 `/usr/bin/python3`（Python 3.9.6）位於 Homebrew 之前
  - Rustc / Cargo：`1.97.1`（來自 `/private/tmp/pi-dedup-rust-toolchain/cargo/bin`）
- 環境變數：`--set COREPACK_HOME=/private/tmp/pv-clean-tools/corepack --set CARGO_HOME=/private/tmp/pi-dedup-rust-toolchain/cargo --set RUSTUP_HOME=/private/tmp/pi-dedup-rust-toolchain/rustup --set CARGO_NET_OFFLINE=true --set CI=1`
- 不繼承主機敏感憑證、無個人 Git/Shell 設定、不讀取真實秘密。

### 13.3 執行命令、退出碼與測試數據對照表

所有 log 與 manifest 均保存於 `/private/tmp/pv-integration/`：

| 階段 / 測試組 | 執行命令 | 結果 / 退出碼 | 數據摘要 |
|---|---|---|---|
| Preflight stage full | `node scripts/validation-preflight.mjs --stage full` | exit 0 | 全部工具及快照檢查 PASS（Node, pnpm, git, git-rev-list, python, rustc, cargo, rustfmt, fs, snapshot） |
| Workspace links | `pnpm run preflight:workspace-links` | exit 0 | 修正 example 符號連結，全 workspace 套件連結就緒 |
| Adapter-utils build | `pnpm --filter @paperclipai/adapter-utils build` | exit 0 | 產生最新型別宣告，供後續測試引用 |
| Preflight 單元測試 | `pnpm run test:validation-preflight` | exit 0 | 12 tests passed (0 fail) |
| Clean-env 單元測試 | `pnpm run test:validation-clean-env` | exit 0 | 7 tests passed (0 fail) |
| Preflight blockers | `node scripts/validation-preflight.mjs --stage blockers` | exit 0 | PASS |
| Pure Guard: adapter-utils | `cd packages/adapter-utils && pnpm exec vitest run src/test-fixtures/sandbox-call-guard.test.ts` | exit 0 | 67 tests passed (0 fail) |
| Pure Guard: server | `cd server && pnpm exec vitest run src/__tests__/sandbox-install-guard.test.ts` | exit 0 | 28 tests passed (0 fail) |
| Muse Python 合約 (系統 3.9.6) | `/usr/bin/python3 -I server/src/__tests__/fixtures/muse-client-contract.py server/src/services/scripts/v9/client.py` | exit 0 | 64 tests passed (0 fail) |
| Muse Python 合約 (Homebrew) | `/opt/homebrew/bin/python3 -I server/src/__tests__/fixtures/muse-client-contract.py server/src/services/scripts/v9/client.py` | exit 0 | 64 tests passed (0 fail) |
| Cursor-local 套件測試 (3 檔) | `cd packages/adapters/cursor-local && pnpm exec vitest run src/server/execute.test.ts src/server/test.test.ts src/server/remote-command.test.ts` | exit 0 | 3 files, 15 tests passed (0 fail) |
| Server 目標測試組 (6 檔，148 組件) | `cd server && pnpm exec vitest run src/__tests__/cursor-local-execute.test.ts src/__tests__/sandbox-install-guard.test.ts src/__tests__/muse-client-contract.test.ts src/__tests__/fake-clock-io.test.ts src/__tests__/github-connection-enrollment-work.test.ts src/__tests__/cursor-local-adapter-environment.test.ts` | exit 0 | 6 files, 66 tests passed (0 fail) |
| Clone 回歸測試組 (2 檔) | `cd server && pnpm exec vitest run src/__tests__/isolated-repository-rehome.test.ts src/__tests__/nested-clone-migration.test.ts` | exit 0 | 2 files, 49 tests passed (0 fail) |
| Pi / OpenCode 摘要去重 (3 檔) | `pnpm exec vitest run packages/adapter-utils/src/continuation-summary-dedup.test.ts packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts packages/adapters/opencode-local/src/server/execute.test.ts` | exit 0 | 3 files, 52 tests passed (0 fail) |
| 全 Workspace Build | `pnpm -r --workspace-concurrency=1 build` | exit 0 | 35 of 35 projects built successfully (含 runner release binary 編譯) |
| 全 Workspace Typecheck | `pnpm -r --workspace-concurrency=1 typecheck` | exit 0 | 35 of 35 projects typechecked successfully (0 errors) |

### 13.4 聚焦測試加總驗收

- 原始已修復 148 聚焦測試：66 (server) + 15 (cursor-local) + 67 (adapter-utils) = **148 tests passed**（0 failed / 0 skipped）。
- Clone 回歸測試：**49 tests passed**。
- Phase 1 Pi / OpenCode 摘要去重測試：**52 tests passed**。
- Preflight / Clean-env 單元測試：12 + 7 = **19 tests passed**。
- Muse Python 合約測試：雙 Python 版本各 64 tests passed。
- 所有原斷言與原測試結構完全保留，未對正式原始碼或測試案例做弱化修改。

### 13.5 任務狀態更新

- **task 4.1：保持未勾選（`[ ]`）**，等待協調者／coordinator 處置與上傳 summary merge（本 session 遵循 push deny 指令，不在本機執行 push）。
- **task 4.2：標記完成（`- [x]`）**，前置條件、已知 blocker、相關回歸、全 workspace build 與 typecheck 均已全數通過（exit 0）。
- **tasks 4.3、4.4、5.1、5.2：保持未勾選（`[ ]`）**，待後續官方 dry-run 分組及全量套件執行。
- 累計任務進度：**14/19** 已完成。

### 13.6 官方分組全量測試判定（Go / No-Go）

**判定：GO FOR OFFICIAL FULL GROUPED TEST RUN (task 4.3 / 4.4)**。
理由：整合候選快照之所有前置檢查、建置、型別檢查及全部已知風險測試（含 148 修復測試、49 clone 回歸、52 摘要去重測試）皆在乾淨受控環境下取得真實 exit 0，且工作樹來源指紋完全凍結，具備進入分組全量選集測試之條件。本 session 依指示不自行啟動全量測試。


