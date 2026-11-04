# Pi 單次摘要去重：驗證紀錄

狀態：第一階段實作、窄範圍驗證、獨立審查（3.2）、全 workspace typecheck／build（隔離 Rust，皆 exit 0）已完成；**PR-ready 全量 `pnpm test:run` 未完成，task 3.1／3.3 BLOCKED 待人工決策（見 §7）**。非 archive-ready。PR：https://github.com/heartpleasure101-stack/paperclip/pull/1（draft）。規劃來源：`openspec/changes/pi-single-prompt-summary-dedup/`。

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

## 7. 全量檢查（task 3.1）：**BLOCKED，待人工決策**（2026-11-05 最新狀態）

**結論：task 3.1 與 3.3 保持未勾選；整體驗收未達成，不是綠燈，也不可封存。** 對最終程式碼（`a240beb69`）完整的 `pnpm test:run` 從未跑完或全綠。阻礙來自主機環境與既有 master 基線（非 phase1 變更），但是否接受「外部修正過的測試環境」或改動主機預設 Node 可見性，需要人決定（§7.6）。所有檢查均未被弱化，也沒有以 monkeypatch 結果冒充一般全綠。證據 log 位於 `/private/tmp/pi-dedup-final-audit/`（不在 repo 內）。

### 7.1 已完成且通過（最終程式碼）

| 項目 | 結果 | 證據 |
|---|---|---|
| 最終程式碼身分 | 五個實作／測試檔 SHA256 與 `a240beb69` 一致（見 §3）；全量測試前、後各比對一次，皆 `OK`；`/private/tmp/pi-dedup-scratch-final` 對 HEAD 的整樹差異僅 4 項（兩份當時尚未存在的 `doc/plans` 文件、`tasks.md`、scratch 內一個 `.claude/settings.local.json`，皆非程式碼）。`a240beb69` 之後的 commit 只動 `doc/plans`、`openspec`（`git diff a240beb69 HEAD -- . ':!doc/plans' ':!openspec'` 為空） | `hashes-before-final-full.txt`、`hashes-after-final-full-attempt1.txt`、`tree-diff-vs-head.txt` |
| 相關測試 | 52 個（renderer 33、Pi 入口 5、OpenCode 14）全過；受影響 5 個 adapter 專案 `Tests 3131 passed \| 14 skipped`（見 §5） | §5 |
| 獨立審查（task 3.2） | 另一 session 對最終五檔雜湊完成複審，WARNING-1／SUGGESTION-1 已解決，無未解 CRITICAL／WARNING（`2026-11-05-pi-summary-dedup-independent-review.md`，本任務未改動該檔） | 該報告附錄 A |
| 全 workspace `pnpm -r typecheck` | **exit 0**，35 個專案 `typecheck: Done`、0 Failed（含 `paperclip-runner` 的 `cargo fmt --check` 與 `cargo check --locked`） | `final-typecheck.log` |
| 全 workspace `pnpm build` | **exit 0**，35 個專案 `build: Done`、0 Failed（含 `paperclip-runner` release 編譯與 server build） | `final-build.log` |

隔離 Rust toolchain（無全域變更）：從 `static.rust-lang.org` 下載 `rustup-init`（aarch64-apple-darwin），其 SHA256 `63752a1919a3a4793173ec70f8f212621a7ce38ba6a246095984482f4de20f9f` 與同站發布的 `.sha256` 相符後才執行；以 `CARGO_HOME`／`RUSTUP_HOME` 指向 `/private/tmp/pi-dedup-rust-toolchain`、`--no-modify-path --profile minimal --default-toolchain 1.97.1 -c rustfmt` 安裝（版本取自 `packages/paperclip-runner/rust-toolchain.toml`）。`~/.cargo`、`~/.rustup` 不存在；未動 shell profile、全域工具鏈、`package.json`／lockfile。建置前磁碟剩約 19Gi。

### 7.2 完整 `pnpm test:run` 的每一次嘗試（全部保留，無一完成）

| 嘗試 | 快照／環境 | 結果 |
|---|---|---|
| 舊全量（修正前快照 `/private/tmp/pi-dedup-scratch`） | 預設 Apple Git 2.39.3 | 00:13:39 起跑，無 exit 行，約 37.7 分鐘後（00:51）由本驗證者以 SIGTERM 終止（僅限已驗證 cwd 為舊 scratch 的行程鏈）。**狀態＝未完成／被終止，不是通過**。保留的部分結果：6 個 chat 分片通過；有 4 項 worktree-local pnpm provisioning 失敗（`provisions worktree-local pnpm node_modules…` 等），未診斷，且之後對最終快照的 run1／run2 失敗清單未再出現（不確定是否跑到該檔）。此次測的是修正前程式碼，**不是最終程式碼的證據**。log：`prior-full-run-*.log`、`prior-full-run-status-final.txt` |
| run1（最終快照，Apple Git 2.39.3） | 02:26 結束 | wrapper `exit=1`；6 個 chat 分片通過；general-server 階段 `failed (143)`（被 SIGTERM；發訊者未查明，期間觀察到一個非本驗證者啟動的外部 vitest 行程 pid 93984）。已見 18 項失敗：`isolated-repository-rehome.test.ts` 4 項、`nested-clone-migration.test.ts` 14 項。log：`final-full-test-run.log`、`concurrent-process-notes.txt` |
| run2（最終快照，Git 2.56.0） | 02:38:43 起跑，04:35 結束 | wrapper `exit=1`（`failed (143)`）；約 2 小時後由監督者有意以 TERM 停止，為**部分結果**。已見 4 項失敗：`cursor-local-execute.test.ts` 2 項、`github-connection-enrollment-work.test.ts` 1 項、`muse-client-contract.test.ts` 1 項。其後 general-server 其餘檔案與 serialized 階段**未執行**。log：`final-full-test-run-2-newgit.log` |
| run3（分階段，Git 2.56.0＋Python 3.12） | 04:41:33 起跑 | 04:44:50 由監督者有意停止（約 3 分鐘，僅 general-server 階段開頭）；未含 cursor PATH 修正、會重複已知失敗；無 exit 狀態（被終止）。**未通過、未完成**。log：`run3-status.txt`、`run3-precondition-check.md` |

最終快照的 workspaces-a／b／c 與 serialized（166 套件）階段，**從未執行**。

### 7.3 已解決的失敗：18 項 clone 測試（run1）

原因：Apple Git 2.39.3 的 `git rev-list --stdin` 不接受 `--not`（`fatal: options not supported in --stdin mode`，exit 128；`git-stdin-probe.txt`）。同一環境下 master 基線（先需建置 `@paperclipai/plugin-sdk`，否則為 collection 錯誤）兩檔同樣 `18 failed | 31 passed (49)`，失敗測試名稱與最終快照**逐一相同**。
處置（僅環境）：從 kernel.org 取 `git-2.56.0.tar.xz`，SHA256 `26c56c296b38c0695b26fa95f475f1d01704d2d38e73465ca30b0b2f5dc789d3`，與 `mirrors.edge.kernel.org` 與 `www.kernel.org` 兩處 `sha256sums.asc` 內容一致（**未驗 GPG 簽章**，本機無 gpg）；以 `NO_RUST=1`（預設需 cargo）等選項建置並安裝至 `/private/tmp/pi-dedup-git-toolchain`。結果：兩檔在最終快照與 master 基線皆 `Tests 49 passed (49)`。

### 7.4 run2 剩餘四項失敗的分類（最終快照 vs. 未修改 master 基線，同環境）

| 測試 | 最終快照 | master 基線 | 分類 |
|---|---|---|---|
| `cursor-local-execute` ×2（`prefers ~/.local/bin/cursor-agent…`、`keeps explicit command overrides…`） | 3 過 2 敗，`expected 127 to be 0` | 3 過 2 敗，相同 | 主機環境／既有基線。fixture shebang 為 `#!/usr/bin/env node`；sandbox 子行程 PATH 由 `defaultPathForPlatform`（`packages/adapter-utils/src/server-utils.ts`）寫死，不含 nvm，而本機 `node` 只在 nvm 下，故 `env: node: No such file or directory`（exit 127）。測試檔與 `cursor-local/src/server/execute.ts` 在兩棵樹位元組相同。僅在 triage 用、位於快照之外的 `rc-nodepath-fix.setup.cjs` 追加 Node24 bin 到子行程 PATH 後，兩者皆 5/5 通過——**該修正不在任何全量執行內，不能當一般驗收證據**（`remote-cursor-baseline-triage.md`） |
| `github-connection-enrollment-work` ×1（`enrolls without recreation, drains…`） | 敗，`expected +0 to be 1`（等待 `acknowledged`）；單檔重跑（2026-11-05，120 秒上限）同敗 | 敗，相同斷言、約 6.1 秒；單檔重跑同敗 | 既有基線（master 相同）。**根因未查明**，本任務不追查，也不宣稱原因 |
| `muse-client-contract` ×1 | 預設 macOS CLT Python 3.9.6：fixture 第 559 行 `tempfile` 的 `KeyError: 'file'`。僅在 PATH 前置 `/private/tmp/pi-dedup-pybin/python3`→Homebrew Python 3.12.16 後 `19 passed (19)`（單檔重跑再次確認） | 同環境 Python 3.12：`19 passed (19)`；Python 3.9 下基線同敗（`baseline-repro-3files.clean.log`） | 主機環境（Python 3.9 stdlib 行為）。屬環境調整後通過，非預設環境通過 |

最終與基線的三檔對照 log：`final-repro-3files.log`、`baseline-repro-3files.log`；本次單檔重跑：`blocker-final-scratch-final-*.log`、`blocker-baseline-*.log`。

### 7.5 其他尚未執行（最終程式碼）

lint、`pnpm check:token-gates`（未改 UI）、e2e／release-smoke、`openspec validate --strict`（task 3.3）、serialized 與 workspaces 階段（見 §7.2）。

### 7.6 需要人工決定的事項（阻礙清單）

1. **cursor sandbox 的 `node` 可見性**（二選一，皆未執行）：
   a. 在主機預設目錄（如 `/usr/local/bin`）讓 `node` 可見——**全域變更**，需明確授權；或
   b. 明確接受「外部 PATH 修正過的測試環境」（setupFiles／monkeypatch）作為驗收證據，並在報告標示「with external PATH correction」，不稱為一般全綠。
2. **環境調整的接受範圍**：目前綠燈的路徑依賴隔離 Git 2.56.0 與 Python 3.12 的 PATH 前置（§7.3、§7.4）；需決定這些是否可接受為驗收環境，或需在主機預設環境達成。
3. **`github-connection-enrollment-work` 在 master 也失敗**且根因未明：需決定視為已知基線，或另行調查／修復（不屬 phase1 範圍）。
4. **完整 `pnpm test:run` 仍未對最終程式碼跑完**（serialized、workspaces 階段從未執行）：在上述決定後需做一次乾淨的完整執行。

這些阻礙不涉及 phase1 變更：兩棵樹的失敗名稱相同，phase1 的 diff（`dedupeIdenticalContinuationSummary` 預設關閉的 opt-in）與 PATH、sandbox、Git、Python 無關；但這是推論加基線對照，不能取代完整執行。

## 7A. 先前（修正前快照）的全量檢查紀錄（原文保留，已被 §7 取代）


### 7A.1 `sandbox-managed-runtime.test.ts` 1 項失敗（既有、環境導致）
子集合執行出現 `restores a sandbox rebase without merging it with unchanged host history` 失敗（`git rebase --continue`：`There was a problem with the editor 'false'`），原因是本 shell 環境變數 `GIT_EDITOR=false`。**在未修改的 master 快照（`/private/tmp/pi-dedup-master-baseline`）同樣失敗**（`Tests 1 failed | 113 passed (114)`），`unset GIT_EDITOR` 後 master 與實作快照皆 `114 passed`。最終快照的受影響 suites（§5）已在 `unset GIT_EDITOR` 下全過。

### 7A.2 全量 typecheck：34 通過、1 失敗（環境）
`pnpm -r typecheck` 與 `--no-bail` 皆在 `packages/paperclip-runner` 失敗：`sh: cargo: command not found`（該 package 的 `typecheck:rust` 需要 Rust toolchain）。`--no-bail` 結果：35 個 workspace 專案中 34 個 `typecheck: Done`，僅此 1 個 Failed。master 快照單獨跑該 package 的 `typecheck:rust` 同樣 `cargo: command not found`。**這是誠實的環境阻礙，不是綠燈；未安裝 Rust（依規定不改全域工具鏈）。** 此全量 typecheck 是對**修正前**快照執行；最終程式碼只做了 §5 的三套件範圍 typecheck。

### 7A.3 全量 build：失敗（環境，相依於 cargo）
`pnpm build` 與 `pnpm -r --no-bail build`：`packages/paperclip-runner build: Failed`（`spawn ENOENT`，`build:binary` 需 cargo），依賴它的 `server build` 隨之 Failed。其餘專案（含 adapter-utils、pi-local、ui、cli）`build: Done`。**未在 master 快照重現 build 失敗**（只重現了 typecheck:rust 的 cargo 缺失），因此「master 同樣失敗」對 build 僅為推論，尚未驗證。此為修正前快照結果。

### 7A.4 全量 `pnpm test:run`：**未完成**
在修正前快照（`/private/tmp/pi-dedup-scratch`）啟動，截至撰寫本文件時仍在執行（log 持續寫入，無 `exit=` 行）。依指示不等待、也不更動該快照。這次執行測試的是**修正前程式碼**，且審查者曾暫放一個探測測試檔，**不能視為最終程式碼的驗證**。**全量 vitest 對最終程式碼：未執行。**

### 7A.5 其他未執行
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

- 等待 §7.6 的人工決定；之後才做一次乾淨的完整 `pnpm test:run`（含 serialized、workspaces），再由後續 session 執行 task 3.3（`openspec validate --strict`、更新 PR）。
- task 3.1、3.3 保持未勾選；不封存、不 merge、不部署、不進入第二階段。PR 維持 draft。
