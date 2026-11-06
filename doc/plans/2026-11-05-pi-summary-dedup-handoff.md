# Pi 單次摘要去重：第一階段交接

日期：2026-11-05　分支：`fix/pi-single-prompt-summary-dedup`　OpenSpec change：`openspec/changes/pi-single-prompt-summary-dedup/`

本文件只做交接彙整，不取代下列兩份紀錄，也不修改它們：

- 驗證紀錄（由驗證 session 持有，可能仍在更新）：`doc/plans/2026-11-04-pi-summary-dedup-verification.md`
- 獨立審查報告（首輪原文＋附錄 A 複審，歷史 findings 全部保留）：`doc/plans/2026-11-05-pi-summary-dedup-independent-review.md`

## 1. 交付位置

| 項目 | 值 |
|---|---|
| Fork draft PR（非官方上游） | https://github.com/heartpleasure101-stack/paperclip/pull/1 （base `master`、head `fix/pi-single-prompt-summary-dedup`、`isDraft: true`、`OPEN`） |
| 實作 commit | `a240beb69`（fix(pi): dedupe identical continuation summary body within one prompt） |
| 規格 commit | `5562a4abe`；草稿標示取代：`68db4dfe4` |
| 驗證紀錄 commit | `fd5f69382`（標記 tasks 1.1–2.4） |
| 本交接的文件 commit | 見 `git log -1 -- doc/plans/2026-11-05-pi-summary-dedup-handoff.md` |

注意：驗證紀錄本身**沒有**寫入 PR URL，URL 以本文件為準。

## 2. 五個最終審查檔雜湊 = 目前 HEAD（獨立核對）

在 real workspace 對每個檔案同時計算工作樹檔案與 `git show HEAD:<path>` 的 SHA256，五組皆相同；`git status --short packages` 無輸出（無未提交的 source／test 變更）。同時等於審查附錄 A.1 與驗證紀錄 §3 所列值。

```
417b4066d33ffe1b77982861fa8621f706acac5efab1c6e0a5a23b5e672a8b9d  packages/adapter-utils/src/server-utils.ts
222ace23dcfe3edc282324fd4f422a07c627e6962dcaa3992e3991301a82bc85  packages/adapters/opencode-local/src/server/execute.test.ts
036a23cdb8c0ab34f2e99a270647a636fb066c229ea957d75ed4e631145cef20  packages/adapters/pi-local/src/server/execute.ts
2a516bbf2461b5f3eeb1cc9b0e7653d8c51c2677c157b32e1ba9b6be4d4101e6  packages/adapter-utils/src/continuation-summary-dedup.test.ts
d55586be6d5a24a730661cedf37cdd7500a6957977df463129944e05a8f04a33  packages/adapters/pi-local/src/server/execute.summary-dedup.test.ts
```

任何一個雜湊之後改變，審查附錄 A 與下列測試結果即失效，須重審。

## 3. 只有 Pi opt-in 的 grep 證據（本次重跑）

```
$ grep -rln dedupeIdenticalContinuationSummary packages server cli ui --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=dist
packages/adapter-utils/src/server-utils.ts
packages/adapter-utils/src/continuation-summary-dedup.test.ts
packages/adapters/pi-local/src/server/execute.ts

$ grep -n dedupeIdenticalContinuationSummary packages/adapters/pi-local/src/server/execute.ts
690:        dedupeIdenticalContinuationSummary: true,
```

正式程式碼只有 renderer（預設關閉）與 Pi 一處傳入；其他 adapter 與 server／cli／ui 無引用。另有 `opencode-local/execute.test.ts` 的預設輸出回歸案例（該檔未含此識別字，因它驗證的是「未傳入」）。

## 4. 回滾（驗證紀錄 §9 已有，摘要）

- 停用：刪除 `packages/adapters/pi-local/src/server/execute.ts` 中 `dedupeIdenticalContinuationSummary: true,` 一行，輸出即恢復原樣。
- 完整回滾：`git revert a240beb69`。
- 無資料遷移、不刪除任何 session 或摘要。

## 5. OpenSpec 檢查（pinned CLI，本次實跑）

指令前綴：`OPENSPEC_TELEMETRY=0 npm exec --yes --package=@fission-ai/openspec@1.16.0 -- openspec`

```
status --change pi-single-prompt-summary-dedup
  Progress: 4/4 artifacts complete   [x] proposal [x] specs [x] design [x] tasks
  All planning artifacts complete!

instructions apply --change pi-single-prompt-summary-dedup
  Progress: 7/10 complete（執行當下；本文件 commit 勾選 3.2 後為 8/10）
  未完成：3.1、3.2（當時）、3.3

validate pi-single-prompt-summary-dedup --strict
  Change 'pi-single-prompt-summary-dedup' is valid
```

（輸出為節錄；CLI 另有一行無關的 npm warn：`Unknown project config "auto-install-peers"`。）

## 6. 獨立審查結論與 task 3.2 依據

- 首輪 WARNING-1（比較 trim 後副本）與 SUGGESTION-1（控制字元／`\r` 被證據區剝除）→ 實作 `a240beb69` 修正 → 附錄 A 複審在新快照以探測 A–G、J 與測試逐項判定「已解決」。首輪原文與歷史 findings 未改。
- 附錄 A.7：無未解的 CRITICAL 或 WARNING 功能問題；剩餘為文件／流程項。
- 附錄 A 在快照上獨立執行：renderer 33、Pi 入口 5、OpenCode 14 測試通過（共 52），三套件 `tsc --noEmit` exit 0。
- 審查者身分：`~/.pi/agent/sessions` 中存在獨立 session `pi-summary-dedup-independent-review`（provider `claude-bridge`、model `claude-sonnet-5-5`，與實作 worker session `pi-summary-dedup-phase1-worker` 分離，開始於 worker 之後）；首輪與附錄 A 皆在此 session 內寫成。首輪報告 §3.1 自述「此 session 非『全新 Pi Claude Sonnet 5.5』，須由使用者決定是否採納」——該句**原文保留**。本次依上述 session 紀錄與審查證據，判定 task 3.2 的實質條件（另一個 Pi Sonnet 5.5 session、非實作者、findings 已記錄、修正後重驗、無未解重大問題）成立，因此只勾 3.2。若使用者認為「全新」必須指第二輪複審也要換 session，3.2 應退回未勾。
- 此報告未驗證 strict validate、遠端 PR、驗證文件內容（附錄 A.3 SUGGESTION-3）；其中 strict validate 與 PR 現況由本文件 §1、§5 補上，驗證文件內容由 §7 列出缺口。

## 7. 驗證文件待驗證 session 補入的缺口（本人不改該檔）

1. §7.2／§7.3 仍寫 typecheck、build 於**修正前**快照失敗（`cargo` 缺席）。最新**最終快照**（`/private/tmp/pi-dedup-scratch-final`，五檔雜湊同 §2）以隔離臨時 Rust toolchain（`/private/tmp/pi-dedup-rust-toolchain`，`CARGO_HOME`／`RUSTUP_HOME` 皆在其下，未改全域）重跑：
   - `pnpm -r typecheck`：`/private/tmp/pi-dedup-final-audit/final-typecheck.log`，`Scope: 35 of 36 workspace projects`，無 `Failed`，結尾 `exit=0`。
   - `pnpm build`：`/private/tmp/pi-dedup-final-audit/final-build.log`，無 `Failed`，結尾 `exit=0`。
   本交接只引用這些 log 的內容（我檢視了開頭與結尾與 `Failed` 計數），未重跑。
2. §7.4 全量 `pnpm test:run`：最終快照的執行仍在進行（`/private/tmp/pi-dedup-final-audit/final-full-test-run.log`，撰寫時無 `exit=` 行、檔案持續增長）。未綠。
3. 驗證文件未記 PR URL（見 §1）。

## 8. Tasks 狀態

| Task | 狀態 | 備註 |
|---|---|---|
| 1.1–1.3、2.1–2.4 | 已勾 | 先前 commit `fd5f69382` |
| 3.1 | **未勾** | 全量 `pnpm test:run` 對最終程式碼尚未綠 |
| 3.2 | **本 commit 勾選** | 依 §6 |
| 3.3 | **未勾** | strict validate 與 apply／status 已過（§5），但需 3.1 完成並保留所有失敗後，才 commit／push 最終驗證紀錄並更新 PR 結果 |

## 9. 剩餘的唯一關卡（archive 之前）

**最終快照的全量 `pnpm test:run` 必須以 exit 0 結束**，結果（含任何失敗與環境限制，例如 `GIT_EDITOR=false` 已知問題的處理）由驗證 session 寫入驗證紀錄 §7.4，之後：

1. 勾 3.1。
2. 勾 3.3（驗證紀錄 commit／push、PR 描述改為最終結果）。
3. 依 tasks.md「Workflow follow-up」封存（`openspec archive`）、strict validate 封存結果、另行 commit／push。
4. 僅在驗收完整時才移除 PR draft；否則保留 draft。

不自動 merge、部署或進入第二階段；不刪除其他分支。
