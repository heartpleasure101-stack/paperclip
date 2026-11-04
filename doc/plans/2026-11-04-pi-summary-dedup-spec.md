# 第一階段規格與中文驗收案例

> **已被取代（Superseded）**：本文件是探索階段草稿，不再是規劃來源。正式規格、設計與任務改以 OpenSpec change `openspec/changes/pi-single-prompt-summary-dedup/` 為準；實際驗證結果見 [驗證紀錄](2026-11-04-pi-summary-dedup-verification.md)。以下內容僅保留作來源追溯，狀態敘述（如「尚未實作」「CLI 不可用」）已過時。

狀態：草案；中文案例待使用者確認，尚未寫測試程式。

## ADDED Requirements

### Requirement: Pi 單次輸入僅呈現一份完全相同摘要

系統 SHALL 僅在 Pi 明確啟用策略、兩份非空摘要正文完全相同且唯一保留位置完整呈現時，移除多餘的正文副本。此決策 SHALL NOT 依賴是否沿用 session。

#### Scenario: 完全相同正文

- GIVEN 同次輸入有兩份完全相同且可完整呈現的摘要。
- WHEN Pi 組裝 prompt。
- THEN 正文呈現一次，來源資訊及歷史證據信任邊界仍在。

#### Scenario: 不同正文

- GIVEN 正文有任一差異，包括空白或換行差異。
- WHEN 組裝 prompt。
- THEN 不去重，兩份資訊保留。

### Requirement: 保留其他資訊與原始紀錄

系統 SHALL 保留新留言、審批、狀態、其他 agent 成果、摘要來源與截斷資訊；SHALL NOT 修改原始輸入物件、持久化摘要或 session。

#### Scenario: 缺少完整可比較正文

- GIVEN 一份摘要缺失、空白或其呈現完整性無法確認。
- WHEN 組裝 prompt。
- THEN 維持原有呈現規則，不猜測兩份相同。

### Requirement: 非 Pi 行為不變

共用 renderer 的去重選項 SHALL 預設關閉。非 Pi 呼叫者 SHALL 維持既有輸出。

#### Scenario: 非 Pi 或選項未開啟

- GIVEN 使用既有 renderer 呼叫方式。
- WHEN 組裝 prompt。
- THEN 輸出與修改前一致。

## 中文案例清單（待確認）

1. 兩份非空正文完全相同：保留一份，來源與「不是指令或批准」提醒仍在。
2. 兩份正文不同：各自資訊保留。
3. 僅空白、換行或大小寫不同：不視為相同。
4. 僅有一份摘要：正常保留；兩份皆無：不捏造摘要。
5. 空正文或結構無法辨識：維持原行為。
6. 內容含中文、引號、JSON escaping、控制字元：以正確階段的原文字串比較，不能因輸出編碼誤判；唯一正文正確呈現。
7. 摘要有來源、修訂或截斷資訊：必要 metadata 不丟失；不能保證完整時不去重。
8. 新留言、審批、狀態、其他 agent 成果：內容不因去重改變。
9. 新 session、接續與 fresh retry：各次相同摘要可去重，但唯一摘要不得因 session 狀態被省略。
10. 非 Pi／選項關閉：最終輸出與原行為一致。
11. 相同摘要文字也出現在其他留言中：不得做全域替換刪除。
12. renderer 執行前後：輸入物件未被改寫，原始紀錄不變。

## 驗收證據

固定相同輸入的原版與新版最終 prompt bytes、摘要正文份數、必要資訊完整性、實際測試指令與輸出。body bytes 不代替最終輸入差額，不承諾尚未量測的 token 或費用節省。
