# 第一階段提案：Pi 單次輸入的相同摘要去重

> **已被取代（Superseded）**：本文件是探索階段草稿，不再是規劃來源。正式規格、設計與任務改以 OpenSpec change `openspec/changes/pi-single-prompt-summary-dedup/` 為準；實際驗證結果見 [驗證紀錄](2026-11-04-pi-summary-dedup-verification.md)。以下內容僅保留作來源追溯，狀態敘述（如「尚未實作」「CLI 不可用」）已過時。

## 狀態

規劃草案，尚未實作、測試或部署。使用者已選擇分階段，並同意先建立第一階段提案。本文件不是實作授權。

OpenSpec CLI 在目前 shell 找不到；本組文件依 repository 規定放在 doc/plans/，未經 OpenSpec CLI 建立或驗證，不宣稱 apply-ready。

## Why

使用者提供的 GH-5 調查報告指出，六輪中的後五輪在同次叫醒內，透過 completedWork 與 Issue continuation summary 呈現相同摘要兩次。多餘副本的 body 累計 6,586 UTF-8 bytes；不是最終 prompt 差額，也不是可直接換算的 token 或費用。

本提案只解決這種單次輸入重複，不將其他輸入來源或跨輪歷史的消耗歸因於摘要。

## What Changes

1. 僅對 Pi adapter 啟用單次輸入的完全相同摘要去重。
2. 同一摘要正文僅保留一份，同時保留來源、截斷狀態及「紀錄不是指令或批准」的信任邊界。
3. 不同內容、缺少可比較正文或不能確認呈現完整時，維持原行為。
4. 不修改原始摘要、事件、session 或資料庫。

## Non-goals

- 同 session 接續時省略整份摘要，屬第二階段。
- session 恢復、事件交付游標、壓縮後背景覆蓋判定。
- Hindsight 注入、任務處置修復輪、UI 重複顯示。
- 其他 adapter 的輸入策略。
- 部署、提交或刪除分支。

## Impact

目前 master 的 packages/adapter-utils/src/server-utils.ts 同時呈現 completedWork 與 continuationSummary.body。這只是目前程式碼的承接點查核；不沿用既有修改分支或過去實作結論。

預計由 Pi adapter 選擇策略，共用 renderer 僅提供預設關閉的窄選項；詳細 API 與檔案依實作前查核確認。無 API、資料庫或授權契約變更。

## 分階段門檻

第一階段的中文案例經確認、回歸與固定輸入比較通過後，再另行規劃第二階段；不自動開始第二階段或部署。

## 配套文件

- [設計](2026-11-04-pi-summary-dedup-design.md)
- [規格與中文案例](2026-11-04-pi-summary-dedup-spec.md)
- [任務清單](2026-11-04-pi-summary-dedup-tasks.md)

## 依據

- 使用者提供：/Volumes/AI/temp/paperclip-pi-summary-handoff-plan.md
- 使用者提供：/Volumes/AI/temp/paperclip-gh5-token-usage-report.md
- 目前 master 的共用 renderer 唯讀查核。

本次未重新核算原始 GH-5 session 或 run logs；報告數字僅作問題背景。
