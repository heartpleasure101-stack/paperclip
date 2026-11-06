# Proposal

## Why

摘要去重的驗收被測試替身依賴全域 Node、Python 3.9 的模擬回應清理錯誤，以及原版也會失敗的 GitHub 註冊事件案例阻擋。先修正這些可重現的基線問題與隔離驗證方法，避免以修改全域工具、跳過斷言或重跑已知失敗的大型流程來取得假綠燈。

## What Changes

- 讓 Cursor 測試替身在自身暫存 HOME 內取得必要 runtime，不改正式 sandbox PATH 或全域 Node。
- 修正 Muse 合約測試的模擬 HTTP 回應資源管理，使現有支援的 Python 可執行；保留已發布 Muse 資產與雜湊。
- 對 GitHub enrollment 案例先做有界因果診斷，再於正確擁有者修復；維持簽名驗證、真實 PostgreSQL、完成後才確認事件、移除及更換身分與安靜期等斷言。
- 增加輕量、唯讀的驗證前置檢查與操作說明：工具能力、隔離路徑、快照身分與已知失敗皆先確認；缺少條件時明確失敗，不自動全域安裝。
- 使用既有官方分組／分片執行完整測試，包含 native-runner 專用組；先證明所有已知阻礙通過，再進昂貴整合驗證。完整覆蓋、每組退出碼與失敗歷史皆可核對。

## Capabilities

### New Capabilities

- `isolated-validation`: 不依賴全域配置的測試替身、前置檢查與可稽核的完整隔離驗證。
- `github-event-worker-lifecycle`: 既有 GitHub 事件工作者在註冊、處理、移除身分與重新註冊間的正確承接及確認行為。

### Modified Capabilities

無。`openspec list --specs` 目前沒有正式 specs；既有 `pi-single-prompt-summary-dedup` 為另一個進行中的 change，其去重規格不變。

## Impact

- 預期主要修改 Cursor/Muse/GitHub 測試與 fixtures、輕量 preflight 腳本及開發文件；只有在真實依賴的因果證據證明服務違約時，才修改 GitHub enrollment/event-work 的最小擁有者範圍。
- 不改其他 adapter 的正式 PATH、不加依賴套件、不改已發布 Muse assets、DB schema、權限或正式服務設定。
- 新建獨立修復分支與 fork PR，base 為 master；修復分支可用一般 merge commit 整合進原摘要分支以驗證兩個 change，禁止 force-push、GitHub PR 自動 merge 或部署。
- 使用者已授權：本 agent 研究並撰寫規格；其餘自主 commit／push／開 PR、實作、驗證、通過後封存。2026-11-05 因 Sonnet 配額用盡，使用者改指定 agy Gemini 3.8 Flash High（`gemini-3.8-flash-high`）直接接手執行與獨立審查；既有 Sonnet 產出及未提交修補保留來源記錄，不從零重做，也不再呼叫 Sonnet。全域工具及現有服務不變。
- 交付目標是解除原 change 的驗收阻礙，不包含摘要第二階段或其他產品重構。
