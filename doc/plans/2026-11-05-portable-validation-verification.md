# 可攜驗證基線與 GitHub enrollment 回歸：驗證紀錄（tasks 1–3）

狀態：OpenSpec change `portable-validation-and-enrollment-regression` 的 **tasks 1.1–3.3 已完成並附證據**。**tasks 4–5（整合、完整覆蓋驗證、獨立驗證）尚未開始**，本文件不宣稱完整驗收、不可封存。PR：https://github.com/heartpleasure101-stack/paperclip/pull/2（draft，base=`master`）。

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
4. **事件（已揭露）：** 為探測「缺失命令」行為，我曾寫一個**未提交、已刪除**的暫時探針，其 runner **沒有**複製正式測試對 `curl https://cursor.com/install` 的防護，因此該探針確實執行了 Cursor 官方安裝腳本。影響範圍：寫入僅在探針自己的暫存 fake HOME（`/var/folders/0w/j69x0g910m182rtbp39_14dm0000gp/T/probe-RE6HFW` 與 `probe-F4lJKQ`）；已確認真實 `~/.local/bin`、`~/.local/share`、`~/.cursor` 沒有任何 Cursor 檔案、沒有殘留 cursor 行程。這兩個暫存目錄因環境規則禁止遞迴刪除而**留待人工清理**。正式測試（及新增負向案例）一律使用會在 curl 前 `throw` 的 runner。
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
5. 兩個 `probe-*` 暫存目錄待人工清理（見 §7.4）。
