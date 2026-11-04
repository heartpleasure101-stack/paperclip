# Pi 單次摘要去重：驗證紀錄

狀態：第一階段實作與窄範圍驗證完成；**PR-ready 全量檢查未全綠（見 §7）**。task 3.2（獨立核對）與 3.3（strict validate、最終 PR 更新）留給後續 session。規劃來源：`openspec/changes/pi-single-prompt-summary-dedup/`。

## 1. 承接點查核（task 1.1）

在 master `a19416601` 查核（未參考任何歷史實作分支）：

| 項目 | 位置 |
|---|---|
| continuation evidence 序列化 `completedWork`（`encodeData`：JSON、移除 `[\u0000-\u0008\u000b-\u001f\u007f]`、`<>` 轉義） | `packages/adapter-utils/src/server-utils.ts` 「Untrusted continuation evidence」區塊 |
| 後段另呈現 `continuationSummary.body` | 同檔「Issue continuation summary:」區塊 |
| `completedWork` 型別：`string \| null` | `packages/shared/src/types/execution-continuation.ts` |
| normalizer 會對摘要正文 `trim()` | `normalizePaperclipWakeContinuationSummary` |
| 伺服器端摘要正文超過 4,000 字元會截斷並設 `bodyTruncated` | `server/src/services/heartbeat/run-preparation.ts` |
| Pi 唯一 prompt 入口：`runAttempt` 內呼叫 `selectPaperclipPromptSections`（每次 attempt，含 fresh retry） | `packages/adapters/pi-local/src/server/execute.ts` |

已讀 `AGENTS.md`、`rules/module-boundaries.mdc`、`rules/runtime-dependency-boundaries.mdc`、`rules/product-harness-responsibility.mdc`、`rules/pull-request-review.mdc`。無 DB／API／權限變更，故未更新 maps／DESIGN。

## 2. 實作摘要（tasks 2.1–2.3）與設計對照

- 共用 renderer 新增預設關閉的 `dedupeIdenticalContinuationSummary`（`selectPaperclipPromptSections` 與 `renderPaperclipWakePrompt` 皆接受）。
- 僅 `packages/adapters/pi-local/src/server/execute.ts` 傳 `true`。證明：`grep -rln dedupeIdenticalContinuationSummary packages server cli ui`（排除 node_modules／dist）只列出 `server-utils.ts`、`pi-local/execute.ts` 與新測試檔。
- 去重條件（全部成立才去重）：選項 `=== true`；`completedWork` 為非空字串；**原始輸入**的 `continuationSummary.body`（非 normalizer trim 後的副本）為字串且 `===` `completedWork`；該字串不含證據編碼會移除的控制字元（含 `\r`）。成立時摘要區改為一行引用句，保留標題與 `[continuation summary truncated]`；唯一正文留在「Untrusted continuation evidence」警語下。不成立則輸出與修改前逐字相同。
- 獨立核對曾指出的 WARNING-1（比較 trim 後副本）與 SUGGESTION-1（控制字元不能存活於證據區卻宣稱 Same text）已在 commit `a240beb69` 以上述兩個條件處理；**這只是實作端的修正，審查報告 `2026-11-05-pi-summary-dedup-independent-review.md` 未改動，其 findings 是否解決由後續 3.2 審查者判定。**
- 設計對照：決策 1（Pi opt-in）、2（嚴格相等不 trim，現比較原始值）、3（保留證據區、短引用）、4（不改輸入，案例 12）、5（以最終 bytes 量測）皆符合。

## 3. 驗證環境與快照一致性

- SMB（`/Volumes/AI`）上的 `pnpm install` 失敗並被終止，**原樣保留**於 `/tmp/pi-dedup-pr/smb-install-failed.log`：esbuild@0.28.2／0.25.12／0.18.20 與 opencode-ai 的 postinstall 在 SMB 上卡住 >5 分鐘，結尾 `postinstall: Failed`／`ELIFECYCLE`，退出碼未被記錄（wrapper 被終止）。同時 PATH 預設為 Node 22.23.1（repo 要求 >=24.11.0）。判斷為環境問題（SMB 上執行原生二進位），非程式碼錯誤。
- 之後所有測試皆在本機 `/private/tmp` 快照執行：`git archive HEAD` + 工作區的實作檔，`git init` 後 `pnpm install --frozen-lockfile`（exit 0），每個指令明確 `export PATH=/Users/Hermes/.nvm/versions/node/v24.18.0/bin:$PATH`（node v24.18.0、pnpm 9.15.4），並 `unset GIT_EDITOR`（原因見 §7.1）。
- 最終程式碼快照 `/private/tmp/pi-dedup-scratch-final` 與 commit `a240beb69` 的檔案 SHA256 一致：

```
417b4066d33ffe1b77982861fa8621f706acac5efab1c6e0a5a23b5e672a8b9d  packages/adapter-utils/src/server-utils.ts
036a23cdb8c0ab34f2e99a270647a636fb066c229ea957d75ed4e631145cef20  packages/adapters/pi-local/src/server/execute.ts
222ace23dcfe3edc282324fd4f422a07c627e6962dcaa3992e3991301a82bc85  packages/adapters/opencode-local/src/server/execute.test.ts
2a516bbf2461b5f3eeb1cc9b0e7653d8c51c2677c157b32e1ba9b6be4d4101e6  packages/adapter-utils/src/continuation-summary-dedup.test.ts
d55586be6d5a24a730661cedf37cdd7500a6957977df463129944e05a8f04a33  packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts
```

## 4. 測試過程中的初始失敗（保留）

最初快照（修正前程式碼）第一次執行 `vitest run` 新測試：`Tests 3 failed | 30 passed (33)`。三項皆為測試對 prompt 版面的假設錯誤，修正測試後即通過，未改動實作：
1. 兩個案例把 `interactionKind/Status/Id` 放在 wake payload 頂層並期待 `interaction-1` 出現在 prompt；但 prompt 並未依該方式輸出（我未進一步追查渲染條件）。改為以證據區的 `interactionOutcomes` 承載審批結果。
2. fresh retry 案例用 `not.toContain("comment-first")`，但接續 prompt 的其他位置也含該字串；改為檢查 `"id":"comment-first"`。
修正後同一快照 33/33 通過（`targeted-2.log`）。

## 5. 最終程式碼的測試結果（`pi-dedup-scratch-final`）

| 指令 | 結果 |
|---|---|
| `pnpm exec vitest run packages/adapter-utils/src/continuation-summary-dedup.test.ts packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts packages/adapters/opencode-local/src/server/execute.test.ts` | exit 0；`Test Files 3 passed (3)`、`Tests 52 passed (52)`（renderer 33、Pi 入口 5、OpenCode 14） |
| `pnpm exec vitest run --project adapter-utils --project adapter-pi-local --project adapter-opencode-local --project adapter-claude-local --project adapter-codex-local` | exit 0；`Test Files 154 passed \| 1 skipped (155)`、`Tests 3131 passed \| 14 skipped (3145)` |
| `tsc --noEmit -p tsconfig.json`（adapter-utils、pi-local、opencode-local 各自） | 三者 exit 0 |
| 變異檢查：移除 Pi 的 `dedupeIdenticalContinuationSummary: true` 後跑 Pi 入口測試 | `Tests 3 failed \| 2 passed (5)`（證明 Pi 入口測試確實依賴 opt-in） |

修正前快照另做過「還原 renderer 為 master」的變異檢查：11 failed／36 passed（`mutation-renderer-reverted.log`）。

新增案例涵蓋：嚴格相等、不同正文、尾端空白／換行／CRLF／大小寫／行內空白、**原始前後空白不對稱（兩個方向）**、兩份含相同前後空白時以原文相等去重、單份／皆無、空值／null／非字串／陣列／摘要 body 非字串或缺失、中文／引號／JSON escaping／`<>`、**含控制字元（`\u0007`、CRLF、DEL）時不去重且輸出與關閉時逐字相同**、截斷、metadata、新事件／審批／子議題成果、留言中相同文字不被全域替換、輸入物件不變、預設關閉（`undefined`／`{}`／`false`／`"yes"`）、新 session／接續／fresh retry、非 Pi（OpenCode）兩份保留。

## 6. 最終 prompt bytes 量測（task 2.4）

測試 `最終 prompt bytes 量測` 輸出（同一 fixture：40 行中文摘要、1 則新留言、1 筆審批；選項關閉／開啟；`Buffer.byteLength(prompt, "utf8")`）：

```
[pi-summary-dedup-measurement] {"bodyUtf8Bytes":3214,"promptBytesOff":8506,"promptBytesOn":5455,"deltaBytes":3051,"summarySectionBytesOff":3335,"summarySectionBytesOn":284,"bodyCopiesOff":2,"bodyCopiesOn":1}
```

- 正文份數 2 → 1；最終 wake prompt 8,506 → 5,455 bytes（−3,051）；新留言、審批結果、證據警語皆保留（測試斷言）。
- 差額 3,051 小於正文 3,214 bytes（摘要區的引用句 284 bytes 與標題仍在），印證不能以 body bytes 代替最終差額。
- 這是**合成 fixture 的 wake prompt 字串長度**，不是完整 Pi 命令列，也**未量測 token、快取或費用**；未取得匿名化 GH-5 輸入，故未做離線重播。

## 7. 全量檢查（task 3.1）：狀態與限制

### 7.1 `sandbox-managed-runtime.test.ts` 1 項失敗（既有、環境導致）
子集合執行出現 `restores a sandbox rebase without merging it with unchanged host history` 失敗（`git rebase --continue`：`There was a problem with the editor 'false'`），原因是本 shell 環境變數 `GIT_EDITOR=false`。**在未修改的 master 快照（`/private/tmp/pi-dedup-master-baseline`）同樣失敗**（`Tests 1 failed | 113 passed (114)`），`unset GIT_EDITOR` 後 master 與實作快照皆 `114 passed`。最終快照的受影響 suites（§5）已在 `unset GIT_EDITOR` 下全過。

### 7.2 全量 typecheck：34 通過、1 失敗（環境）
`pnpm -r typecheck` 與 `--no-bail` 皆在 `packages/paperclip-runner` 失敗：`sh: cargo: command not found`（該 package 的 `typecheck:rust` 需要 Rust toolchain）。`--no-bail` 結果：35 個 workspace 專案中 34 個 `typecheck: Done`，僅此 1 個 Failed。master 快照單獨跑該 package 的 `typecheck:rust` 同樣 `cargo: command not found`。**這是誠實的環境阻礙，不是綠燈；未安裝 Rust（依規定不改全域工具鏈）。** 此全量 typecheck 是對**修正前**快照執行；最終程式碼只做了 §5 的三套件範圍 typecheck。

### 7.3 全量 build：失敗（環境，相依於 cargo）
`pnpm build` 與 `pnpm -r --no-bail build`：`packages/paperclip-runner build: Failed`（`spawn ENOENT`，`build:binary` 需 cargo），依賴它的 `server build` 隨之 Failed。其餘專案（含 adapter-utils、pi-local、ui、cli）`build: Done`。**未在 master 快照重現 build 失敗**（只重現了 typecheck:rust 的 cargo 缺失），因此「master 同樣失敗」對 build 僅為推論，尚未驗證。此為修正前快照結果。

### 7.4 全量 `pnpm test:run`：**未完成**
在修正前快照（`/private/tmp/pi-dedup-scratch`）啟動，截至撰寫本文件時仍在執行（log 持續寫入，無 `exit=` 行）。依指示不等待、也不更動該快照。這次執行測試的是**修正前程式碼**，且審查者曾暫放一個探測測試檔，**不能視為最終程式碼的驗證**。**全量 vitest 對最終程式碼：未執行。**

### 7.5 其他未執行
lint／`pnpm check:token-gates`（未改 UI）、e2e／release-smoke、`openspec validate`（3.3）、server／UI 整合測試對最終程式碼的重跑。

## 8. 已知限制

- 只對 `completedWork` 與摘要兩份文字做去重；跨輪省略、session 覆蓋、Hindsight 等屬第二階段，未處理。
- 含控制字元（含 `\r`）的相同正文不去重（保守回退），實務上 Windows 換行的摘要不受益。
- 前後有空白的相同正文會去重，證據區保有完整原文；摘要區原本顯示的是 trim 後版本，被引用句取代。
- 本 session 移除了 `.git/index.lock`（0 bytes，2026-11-04 23:40 殘留，無 git 寫入程序，僅 `agy` 以唯讀 fd 開啟）才能 commit。

## 9. 回滾

- 停用：刪除 `packages/adapters/pi-local/src/server/execute.ts` 中 `dedupeIdenticalContinuationSummary: true,` 一行（renderer 選項預設關閉，輸出即恢復原樣）。
- 完整回滾：`git revert a240beb69`。
- 不需資料遷移，不刪除 session、摘要或其他紀錄。

## 10. 後續

- 3.2 獨立核對（針對 commit `a240beb69` 之後的快照，含 WARNING-1／SUGGESTION-1 是否解決）與 3.3（`openspec validate --strict`、更新 PR）。
- 在有 Rust toolchain 的環境重跑 `pnpm -r typecheck`、`pnpm build`，並對最終程式碼重跑完整 `pnpm test:run`。
