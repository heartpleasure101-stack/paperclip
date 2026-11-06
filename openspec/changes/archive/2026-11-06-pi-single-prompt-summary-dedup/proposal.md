# Proposal

## Why

使用者提供的 GH-5 調查報告指出，後五次叫醒在 completedWork 與 continuationSummary 中重複呈現同一摘要。先以窄範圍修改消除 Pi 單次輸入的相同副本，避免將跨輪歷史、Hindsight 或快取消耗混為同一問題。

## What Changes

- 僅 Pi 啟用同次摘要去重；兩份非空正文嚴格相同且完整呈現時，只送一份。
- 不同內容、空內容、格式未知或無法保證唯一正文完整時，保留原行為。
- 保留來源、截斷資訊、歷史證據信任邊界、新事件及所有原始資料。
- 加入中文驗收案例對應測試與固定輸入的最終 prompt bytes 比較。
- 不處理跨輪省略、session 覆蓋、壓縮、恢復游標、Hindsight、UI 或部署；第二階段另議。

## Capabilities

### New Capabilities

- `pi-summary-rendering`: Pi 單次輸入中工作摘要的安全呈現與完全相同正文去重。

### Modified Capabilities

無。此 repository 尚無既有 OpenSpec specs。

## Impact

- Pi adapter 擁有啟用策略；共用 adapter-utils renderer 僅增加預設關閉的窄能力，非 Pi 消費者保持原行為。
- 無資料庫、API、權限或生產服務變更，無新增專案 runtime dependency。
- 量測最終輸入 bytes，不把報告中的 6,586 body bytes 當作最終差額或 token／帳單節省。
- 只查核目前 master；不沿用舊修改分支或歷史實作結論。
- 使用者已授權按進度 commit、建立 PR 與自主完成第一階段；除規格撰寫外，由 agy 啟動 Pi Claude Sonnet 5.5 執行。
