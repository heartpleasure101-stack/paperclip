# 第一階段設計：Pi 單次摘要去重

> **已被取代（Superseded）**：本文件是探索階段草稿，不再是規劃來源。正式規格、設計與任務改以 OpenSpec change `openspec/changes/pi-single-prompt-summary-dedup/` 為準；實際驗證結果見 [驗證紀錄](2026-11-04-pi-summary-dedup-verification.md)。以下內容僅保留作來源追溯，狀態敘述（如「尚未實作」「CLI 不可用」）已過時。

## 狀態與範圍

設計草案，尚未實作。只針對同次 prompt 內的相同摘要，不涉及跨輪背景覆蓋。見 [提案](2026-11-04-pi-summary-dedup-proposal.md)。

## 現有承接點

目前 master 的 packages/adapter-utils/src/server-utils.ts：

1. continuation evidence 區塊序列化 completedWork。
2. 後續另以 Issue continuation summary 區塊呈現 continuationSummary.body。

實作前須確認 completedWork 的實際型別、正規化與截斷行為，以及 Pi 的所有 prompt 建立入口。不可假設 completedWork 一定是純文字。

## 所有權與策略

- Pi adapter 擁有是否啟用這項策略的決定。
- 共用 renderer 可接受預設關閉的窄選項；不自行判斷 provider，也不改其他呼叫者預設輸出。
- 不用全域字串替換，不刪除留言、工具結果或其他區塊中恰巧相同的文字。
- 在每次實際建立 prompt 時執行；不保存跨輪去重狀態。

## 比較與呈現

1. 取得兩個候選摘要的正文，先確認兩者確實會出現在本次輸出。
2. 以原文字串嚴格相等比較，不 trim、不統一換行、不做大小寫或語意比對。
3. 只在兩份非空正文完全相同，且保留位置可完整呈現該正文時，省略另一個正文副本。
4. 優先保留 continuation evidence 的 completedWork；若其格式或截斷無法保證完整，不去重。
5. 原本另一位置所需的來源、修訂、截斷標記仍保留或以簡短引用指向唯一正文；不得留下暗示另有正文的空標題。
6. 唯一正文仍被標記為不可信的歷史證據，不是新指令、批准或目標變更。
7. 僅建立輸出副本，不原地改寫輸入物件或持久化資料。

## 失敗與回滾

無法取得可比較正文、只有一份正文、內容不同或格式不明時，維持原輸出。回滾停用 Pi 的選項即可；不需資料遷移或刪除 session。

## 驗證與量測

- 固定同一輸入，分別以選項關閉／開啟產生最終 prompt。
- 檢查摘要正文副本數、保留來源與信任標記、新事件內容及輸入物件未被修改。
- 量測 Buffer.byteLength(finalPrompt, 'utf8') 的差額，不以摘要 body bytes 代替。
- 非 Pi 呼叫者維持相同輸出；Pi 新 session、接續與 fresh retry 均只套用同次去重，不省略唯一摘要。
- 離線結果不宣稱 token 或帳單節省；未取得實際模型 usage 時明確標示未量測。

## 實作前待查核

1. completedWork 的型別與所有可呈現格式。
2. 兩份摘要的截斷、序列化及來源資訊是否會影響可安全移除的位置。
3. Pi renderer 呼叫入口與現有測試 runner 的精確指令。

上述為程式碼查核工作，不要求使用者認證基礎設施事實。
