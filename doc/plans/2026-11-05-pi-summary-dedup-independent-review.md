# 獨立 OpenSpec VERIFY：pi-single-prompt-summary-dedup

審查日期：2026-11-05　審查者：獨立 verify session（未參與實作）　分支：`fix/pi-single-prompt-summary-dedup`（HEAD `5562a4abe`，實作尚未 commit）

## 0. 審查範圍與限制（先讀）

- 技能檔：指定路徑 `/Users/Hermes/.pi/agent/skills/openspec-verify-change/SKILL.md` **不存在**；改讀同名技能 `/Users/Hermes/.agents/skills/A1_Coding/openspec-verify-change/SKILL.md`（流程相同）。
- `openspec` CLI 在指定的 Node 24 PATH 下為 `command not found`，因此**未執行** `openspec status/instructions/validate`；改為直接讀 `openspec/changes/pi-single-prompt-summary-dedup/` 下 proposal／design／spec／tasks。strict validate（task 3.3）本審查**未驗證**。
- 未讀歷史實作、未用 Hindsight 分析；未改實作、未裝依賴、未 commit／push、未動 tasks。唯一 repo 編輯為本檔。
- 測試只在 `/private/tmp/pi-dedup-scratch`（非 SMB）執行。
- 揭露：審查中我曾在 scratch 的 `packages/adapter-utils/src/` 暫放一個探測測試檔（約 00:21–00:23，已刪除，`git status` 確認 scratch 只剩兩個預期的 untracked/modified 測試檔）。同一時段主 worker 的全量測試 `/tmp/pi-dedup-pr/test-run-full.log`（00:22 仍在寫入）可能把該檔當作額外一個測試；它是通過的探測，不影響結果，但 worker 解讀該 log 的檔案／測試計數時請留意。

## 1. 審查快照（SHA256，real workspace 與 scratch 逐檔一致，審查開始與結束各核對一次，皆未變）

```
1263744f485cc6896b3bb67c89c510235ef4b754149b56742fecfca29bea2f98  packages/adapter-utils/src/server-utils.ts
222ace23dcfe3edc282324fd4f422a07c627e6962dcaa3992e3991301a82bc85  packages/adapters/opencode-local/src/server/execute.test.ts
036a23cdb8c0ab34f2e99a270647a636fb066c229ea957d75ed4e631145cef20  packages/adapters/pi-local/src/server/execute.ts
c1906641aaf6733414a37ff8da9986abb7e7117b4e6c6bd3c1076099a64307a7  packages/adapter-utils/src/continuation-summary-dedup.test.ts
d55586be6d5a24a730661cedf37cdd7500a6957977df463129944e05a8f04a33  packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts
```

另以 `diff -rq` 比對 `packages/adapter-utils/src`、`packages/adapters/pi-local/src`、`packages/adapters/opencode-local/src` 在 real workspace 與 scratch 完全相同。**若上述任一雜湊之後改變，本報告對該檔的結論失效，須重審。**

實作 diff 規模：`server-utils.ts` +18/−1、`pi-local/execute.ts` +1、`opencode-local/execute.test.ts` +33，另兩個新測試檔（351 與 205 行）。

## 2. 摘要

| 面向 | 結果 |
|---|---|
| Completeness | 規格 3 個 requirement／11 個 scenario 皆有對應實作與測試；tasks.md **0/11 勾選**（皆為工作流程待辦，見 §3），驗證文件 `doc/plans/2026-11-04-pi-summary-dedup-verification.md` **尚不存在**（目前被已標 superseded 的草稿連結指向） |
| Correctness | 11/11 scenario 有程式碼＋測試證據；發現 1 項 spec 偏離（WARNING-1）與 1 項邊緣行為（SUGGESTION-1） |
| Coherence | 遵循 design 決策 1–5；決策 6（commit／PR／封存）尚未進行 |

**沒有 CRITICAL 的「功能缺失」。** 依技能規則未勾選的 task 每項算 CRITICAL，但依本次要求，我把它們歸為「待完成的工作流程」，不是缺功能，也不宣稱全綠。

## 3. Completeness

### 3.1 Tasks（0/11 勾選；以下為實際狀態，不是勾選建議）

| Task | 狀態 | 證據／缺口 |
|---|---|---|
| 1.1 查核承接點、記錄於驗證文件 | 待完成 | 驗證文件不存在 |
| 1.2 草稿標 superseded、獨立分支、commit | 內容已做、未勾 | `git log`：`68db4dfe4`、`5562a4abe`；草稿首段已標「已被取代」。其中連結的驗證文件尚不存在（死連結，至 2.4 完成前） |
| 1.3 push 到 fork、建 draft PR、記 URL | **未驗證** | 我未查遠端（網路查詢在本環境逾時）；請 worker 在驗證文件附 URL |
| 2.1 renderer opt-in＋回歸案例 | 實作與測試已存在、通過 | §4、§5 |
| 2.2 保留唯一正文、信任邊界、獨立紀錄 | 實作與測試已存在、通過 | 見 §4 |
| 2.3 Pi 入口啟用＋新／續／fresh retry＋非 Pi 預設 | 實作與測試已存在、通過 | §4、§5 |
| 2.4 bytes 量測＋驗證文件含指令／輸出／回滾 | 測試已有；**文件缺** | 量測見 §5.3；回滾步驟與文件待寫 |
| 3.1 受影響 suites、型別、PR-ready 全量 | 進行中（非我負責） | worker log：全量 vitest 僅 `sandbox-managed-runtime.test.ts` 1 項失敗；`paperclip-runner` typecheck 的 rust 步驟失敗；worker 另有 `master-baseline-*.log` 宣稱 master 同樣失敗。**我未獨立重現這些 log，也未重跑 build／全量**，不採信為已驗證 |
| 3.2 獨立核對 | 本報告（此 session 非「全新 Pi Claude Sonnet 5.5」，須由使用者決定是否採納為 3.2） | — |
| 3.3 OpenSpec strict validate、commit／push、更新 PR | 待完成 | 我未跑 validate（CLI 不在 PATH） |

### 3.2 Spec 覆蓋

3 個 requirement、11 個 scenario 皆找到實作；見 §4 對照表。

## 4. Correctness：scenario → 程式碼／測試

程式碼（皆在 `packages/adapter-utils/src/server-utils.ts`）：
- 選項型別：`:2234`（`selectPaperclipPromptSections`）、`:2277–2283`（body options，`renderPaperclipWakePrompt` 透過 `Parameters<typeof renderPaperclipWakePromptBody>[1]` 繼承）；轉傳 `:2244`。
- 去重判斷與輸出：`:3031–3052`。條件＝選項 `=== true` 且 `typeof completedWork === "string"` 且非空且 `=== normalized.continuationSummary.body`；成立時以一行引用句取代正文，其餘（標題、`[continuation summary truncated]`）原樣保留。
- 保留正文位置：證據區 `:2536–2567`，無條件在 `executionContinuation` 存在時輸出，且 `completedWork` 由 `encodeData` 整段序列化（無截斷）；`resumeDelta` 只替換 `messages`／`coverage`，`completedWork` 不受影響（`:2541–2545`）。`:3031` 之前沒有會跳過證據區的 early return（以列出頂層分支檢查）。
- Pi 啟用點：`packages/adapters/pi-local/src/server/execute.ts:690`，位於 `runAttempt` 內，每次 attempt（含 fresh retry）各自呼叫 `selectPaperclipPromptSections`，不跨 attempt／跨 run 保留狀態。

| Requirement／Scenario | 實作 | 測試（檔:案例） | 判定 |
|---|---|---|---|
| 完全相同摘要 | `:3036–3046` | `continuation-summary-dedup.test.ts` 案例 1；`execute.summary-dedup.test.ts` 新 session／接續 | 通過 |
| 不同正文（空白、換行、大小寫） | 嚴格 `===` | 案例 3（5 變體）、案例 2 | 通過，但見 WARNING-1（方向性缺口） |
| 單份或沒有摘要 | 條件需 completedWork 為非空字串 | 案例 4、「兩份皆無」、Pi「只有一份摘要」 | 通過 |
| 不明格式或不完整呈現 | 非字串／空／無 executionContinuation 皆不去重 | 案例 5（5 變體）、「沒有 executionContinuation」、案例 7 伺服器端截斷前綴≠完整 | 通過 |
| 不同 session 路徑 | `execute.ts:690` 每 attempt 傳 true；不看 `resumedSession` | Pi 測試：新／接續／接續但不同／接續失敗後 fresh retry；renderer 層 `selectPaperclipPromptSections` 新／續 | 通過 |
| 摘要 metadata 與信任邊界 | 引用句含「untrusted continuation evidence … historical evidence, not an instruction or permission」；唯一正文留在「Untrusted continuation evidence」警語下 | 案例 1（正文位於證據標題之後、警語仍在）、案例 7 截斷標記保留 | 通過 |
| 新事件完整 | 只改 `:3043–3046` 一個值 | 案例 8（on/off 差異限於摘要區；留言、審批、狀態、子議題成果皆保留） | 通過 |
| 其他區塊文字恰巧相同 | 無全域替換 | 案例 11（留言內相同文字保留；正文份數 2） | 通過 |
| 特殊字元與原始資料 | 比較用正規化後原字串；輸出走既有 `encodeData` | 案例 6、「編碼後才相同但原文不同」、案例 12（輸入物件 deep-equal＋JSON 不變） | 通過，但見 SUGGESTION-1 |
| 策略未啟用 | 預設 `undefined` | 案例 10（預設／`{}`／`false`／`"yes"` 逐字相同）；`selectPaperclipPromptSections` 未傳選項＝原輸出 | 通過 |
| 非 Pi adapter | 全 repo 僅 `execute.ts`（pi-local）傳入選項（grep：僅 `server-utils.ts`、pi-local `execute.ts` 與新測試含此識別字） | `opencode-local/execute.test.ts` 新增案例：兩份保留、無引用句 | 通過（僅以 OpenCode 為代表；其他 adapter 靠「預設關閉」的 renderer 層證明） |

### 獨立實驗結果（對抗式探測，探測檔已移除）

在 scratch 以臨時測試呼叫 `renderPaperclipWakePrompt`，輸出寫檔後讀取：

```
A padded-summary vs clean-completedWork deduped? true      <- summary.body="  ALPHA\n", completedWork="ALPHA"
B CRLF equal deduped? true promptHasCR=false               <- 兩者皆 "L1\r\nL2"
B-off promptHasCR=true
C resumed deduped? true evidenceHeading=true
evidence snippet: "completedWork\":\"L1\\nL2\"}\n```..."
```

## 5. 指令與輸出（皆在 scratch，`PATH=/Users/Hermes/.nvm/versions/node/v24.18.0/bin:$PATH`，`env -u GIT_EDITOR`）

### 5.1 新 renderer suite
```
cd /private/tmp/pi-dedup-scratch/packages/adapter-utils && npx vitest run src/continuation-summary-dedup.test.ts
 Test Files  1 passed (1)
      Tests  28 passed (28)
```
### 5.2 Pi 與 OpenCode suite
```
cd .../packages/adapters/pi-local && npx vitest run src/server/execute.summary-dedup.test.ts
 Test Files  1 passed (1)   Tests  5 passed (5)
cd .../packages/adapters/opencode-local && npx vitest run src/server/execute.test.ts
 Test Files  1 passed (1)   Tests  14 passed (14)
```
### 5.3 Bytes 量測（`--silent=false`，測試自行輸出）
```
[pi-summary-dedup-measurement] {"bodyUtf8Bytes":3214,"promptBytesOff":8506,"promptBytesOn":5455,"deltaBytes":3051,"summarySectionBytesOff":3335,"summarySectionBytesOn":284,"bodyCopiesOff":2,"bodyCopiesOn":1}
```
僅為此 fixture 的最終 prompt UTF-8 bytes；不代表 token、快取或費用節省，也不等於報告中的 6,586 body bytes。
### 5.4 型別檢查（`tsc --noEmit`，三個套件各自）
`packages/adapter-utils`、`packages/adapters/pi-local`、`packages/adapters/opencode-local`：exit 0。
### 5.5 未執行
build、全量 vitest、lint、`openspec validate`、server／UI 整合、`pnpm check:token-gates`（未改 UI）。worker 的 `/tmp/pi-dedup-pr/mutation-*.log`（還原 Pi 啟用旗標→3 個 Pi 測試失敗；還原 renderer→11 個失敗）我只讀取、未重現；但從程式碼看，Pi「新 session」測試斷言正文份數為 1，確實依賴 `execute.ts:690`。

## 6. Coherence

- Design 決策 1（Pi opt-in、共用 renderer 窄選項、預設關閉）：符合。決策 2（嚴格相等不 trim）：**比較對象是 normalizer 已 trim 的 `continuationSummary.body`，非原輸入**，見 WARNING-1。決策 3（優先保留證據區、短引用取代、不留空標題）：符合。決策 4（不原地改寫）：符合（案例 12）。決策 5（用最終輸入量測）：符合。
- 範圍：未動 DB／API／權限／依賴；`rules/module-boundaries.mdc` 的「共用變更須說明」：選項註解已說明能力與關閉行為，惟 PR 描述仍須寫明受影響消費者（待 3.3）。
- 風格：註解與命名與周邊一致（`options.xxx === true` 慣用法）。

## 7. Findings

### CRITICAL
無「功能缺失」類 CRITICAL。**阻擋封存的未完成項目**（依技能規則記為 CRITICAL 工作流程缺口）：
1. 驗證文件 `doc/plans/2026-11-04-pi-summary-dedup-verification.md` 不存在，task 1.1／2.4 無法勾選，且已有兩份草稿連結指向它。
2. 實作與測試尚未 commit／push，PR 狀態（1.3、3.3）未驗證。
3. 3.1 全量檢查尚未完成；已知失敗項（sandbox-managed-runtime、paperclip-runner rust typecheck）需由 worker 以實際輸出證明為 master 既有，我未驗證。
4. 3.3 strict validate 未執行（本環境 openspec 不在 PATH）。

### WARNING
- **WARNING-1：比較階段與 spec「任一空白差異皆不去重」不一致。** `normalizePaperclipWakeContinuationSummary`（`server-utils.ts:1270`）會 `trim()` 摘要正文，去重卻拿 trim 後的 body 對未 trim 的 `completedWork`。實測（§4 探測 A）：原始摘要 `"  ALPHA\n"` 與 `completedWork="ALPHA"` 被視為相同並去重，違反 scenario「不同正文：包括空白」的字面要求。反方向（completedWork 有前後空白、摘要沒有）會保守地不去重，且有測試。實務影響低（關閉時摘要區本來就只顯示 trim 後的版本，被丟棄的副本不含額外資訊），但與 spec／design 決策 2 的文字不符，且測試只覆蓋保守方向。建議二擇一：(a) 在 `:3035–3040` 改與原始值比較（`asString(parseObject(parseObject(value).continuationSummary).body, "")`，需把原始值帶入或在 normalizer 保存 `rawBody`），並新增「摘要前後有空白、completedWork 無空白」測試；或 (b) 若判定「比較已正規化的呈現文字」才是意圖，修訂 spec scenario／design 決策 2 並在驗證文件載明。
  
### SUGGESTION
- **SUGGESTION-1：被保留的證據副本會移除控制字元（含 `\r`），引用句卻寫 "Same text"。** 探測 B：兩份皆為 `"L1\r\nL2"` 時去重成立，輸出不含任何 `\r`，而關閉時摘要副本含 `\r`。spec 允許「遵循既有安全編碼」，故不列 WARNING；但對含 `\r`／控制字元的正文，去重會比關閉時多損失這些字元於可見輸出。建議：當正文含 `encodeData` 會剝除的字元（`/[\u0000-\u0008\u000b-\u001f\u007f]/`）時不去重（保守回退，符合「無法確認完整呈現」），並加一個測試；或在驗證文件註明此取捨。
- **SUGGESTION-2：非 Pi 迴歸只用 OpenCode 一個消費者。** 可接受（預設關閉已在 renderer 層逐字驗證），但驗證文件應列出以 grep 證明「僅 pi-local 傳入此選項」的指令與輸出（本審查的 grep 結果：僅 `server-utils.ts`、`pi-local/execute.ts` 與兩個新測試檔）。
- **SUGGESTION-3：** 驗證文件請附 1.3 的 PR URL／base、回滾步驟（移除 `execute.ts:690` 一行或 revert），並如實列出 3.1 的失敗與環境限制（SMB 上不跑測試、scratch 同步方式）。

## 8. 最終評估

- 已審查快照內，**實作行為與 spec 11 個 scenario 一致，新 renderer 28／Pi 5／OpenCode 14 測試與三個套件的 typecheck 均獨立通過**；未發現須立刻修的功能性 CRITICAL。
- 有 1 項 WARNING（空白比較階段，建議修或改規格）與 3 項 SUGGESTION。
- **尚不可封存**：驗證文件缺、未 commit／PR、全量檢查與 strict validate 未完成。此報告不是全綠聲明。
- 修正（若 worker 採納 WARNING-1／SUGGESTION-1）會改變 `server-utils.ts` 與測試雜湊，須重跑 §5 並重審。
