# Design

## Context

動機見 proposal.md。當前 master 的 adapter-utils renderer 同時序列化 continuation evidence 的 completedWork，並於後段呈現 continuationSummary.body。策略須由 Pi 選擇，但呈現能力屬共用 renderer；不能全域改變所有 adapter。

使用 OpenSpec 1.16.0 的 spec-driven schema。先前 doc/plans 下四份文件是探索草稿；本 change 為此後的規劃來源，交付時將草稿標明已被正式 change 取代，避免雙重真相。

## Goals / Non-Goals

**Goals:** 在每次 prompt 組裝中，以可回滾且預設不影響其他消費者的方式去重，保留唯一完整正文與信任／來源資訊。

**Non-Goals:** 不保存跨輪去重狀態，不推斷 session 已讀過哪些資訊，不修改資料與授權邏輯，也不部署。

## Decisions

1. **Pi opt-in，共用 renderer 提供窄選項。** 預設關閉；Pi 在每次實際 prompt 組裝時啟用。相較全域去重，這能限定第一階段影響面；相較 Pi 自行全域字串替換，能在已知欄位邊界操作。
2. **嚴格相等，保守回退。** 比較兩個候選原文，不 trim 或正規化空白。格式不明、空正文或保留位置不完整時維持原行為；不能只因序列化後碰巧相同便刪除。
3. **優先保留 continuation evidence 中的正文。** 它已有歷史資料的信任提醒。省略另一份正文時保留必要來源、修訂與截斷資訊；必要時以短引用取代重複正文，不留下誤導性空標題。若具體型別不支援安全保留，維持原行為並在驗證報告說明。
4. **不原地改寫輸入。** 只改本次輸出呈現，不移除 completedWork 的結構、原始摘要或事件。
5. **用最終輸入量測。** 相同 fixture 比較策略關閉／開啟的 Buffer.byteLength(prompt, 'utf8')、正文份數與新事件完整性；報告 body bytes 不是最終差額，也不代表 token 或費用。
6. **分階段交付。** 正式規格建立後，先 commit 並在使用者 fork 建立 draft PR，base 為該 fork 的 master，不向官方上游送 PR。Sonnet 子 Pi 實作、測試並依進度 commit，獨立驗證後封存 change 並更新 PR。未達驗收時保持 draft 並明列 blocker；不自動 merge。

## Risks / Trade-offs

- [兩份正文相同但 metadata 不同] → 只刪正文副本，保留 metadata；完整性無法保證便不去重。
- [共用 renderer 影響其他 adapter] → opt-in 預設關閉，加入原行為回歸與 Pi 實際入口測試。
- [特殊字元在編碼後混淆] → 比較原文並沿用既有安全編碼，以特殊字元案例驗證。
- [第一階段節省幅度有限] → 僅回報實測最終 prompt bytes；不宣稱已降低帳單或消除跨輪歷史成本。
- [大型 monorepo 全量驗證成本] → 先跑範圍內測試與型別檢查，再按 repo PR-ready 規定執行全量檢查；環境阻礙和既有失敗保留於報告，不以重試掩蓋。

## Migration Plan

無資料遷移。此輪只交付可審查 PR，不修改執行中服務。回滾可移除 Pi opt-in 或 revert 對應 commit；不刪除 session、摘要或其他原始紀錄。
