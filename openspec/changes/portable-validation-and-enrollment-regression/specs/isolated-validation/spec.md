# Spec Delta

## Purpose

讓開發者在隔離的本機工作目錄驗證相同版本的 Paperclip，不依賴未宣告的全域工具配置，也不以改寫正式執行行為取得假通過；所有必要條件、測試覆蓋、版本身分與失敗歷史均須能夠核對。

## ADDED Requirements

### Requirement: Self-contained command fixtures

執行外部 CLI 的測試替身 SHALL 在自身隔離目錄內提供所需 runtime 或明確指定既有測試 runtime；SHALL NOT 依賴全域 Node、改寫正式 sandbox PATH 或透過外部 monkeypatch 才能通過。

#### Scenario: Node 只安裝在版本管理器內
- **WHEN** 主機預設 sandbox PATH 不含 Node，測試執行暫存的假 Cursor CLI
- **THEN** 替身仍能執行，原有 CLI 優先順序、明確 command override、提示內容與 PATH 斷言全部成立，且未改動主機預設目錄

#### Scenario: 未登記的指令或暫存程式
- **WHEN** 假 sandbox runner 收到未明確登記的程式／shell 形狀，或不屬於自有根目錄及明確宣告測試 runtime 的程式路徑，即使路徑位於系統暫存目錄
- **THEN** 在任何真實 backend 執行前拒絕；已知安裝器若需測試，只能進入明確登記的無網路模擬，不得落入真實執行的 fallback

#### Scenario: 替身命令真的無法找到
- **WHEN** 測試故意移除必要命令或提供無效 override
- **THEN** 缺失可被偵測，不以下載真實 Cursor CLI 或吞掉錯誤假裝成功

### Requirement: Portable mock resource lifecycle

模擬 HTTP 錯誤的合約測試 SHALL 使用可正確關閉的回應資源，在宣告支援且通過前置檢查的 Python 上保留原有安全與功能斷言；SHALL NOT 為測試修正改寫已發布 Muse assets 或其 byte pins。

#### Scenario: Python 3.9 與較新版本
- **WHEN** Muse 合約測試處理並關閉模擬 HTTP 錯誤
- **THEN** 不發生測試替身的 tempfile 清理錯誤，原有不洩漏 URL／憑證、持久化及資產 hash 斷言仍通過

### Requirement: Read-only prerequisite check

隔離驗證 SHALL 在昂貴測試前提供機器可讀的工具版本及能力檢查；條件不足 SHALL 明確失敗，不自動安裝全域工具、不使用正式資料庫或憑證，亦不把必要案例靜默略過。

#### Scenario: 條件不足
- **WHEN** Node、Git 的必要能力、Python 或已選驗證階段需要的 Rust 等條件缺失
- **THEN** 在長流程前輸出具體缺項與非零退出碼，不變更主機設定

#### Scenario: 使用隔離工具路徑
- **WHEN** 明確指定暫存或既有工具路徑且能力檢查通過
- **THEN** 輸出實際路徑、版本與檢查結果，不要求將工具安裝進主機共用目錄

#### Scenario: 離線暫存專案的套件管理器解析
- **WHEN** 測試在未宣告 packageManager 的自有暫存專案中呼叫 pnpm，且 Corepack 網路已關閉
- **THEN** 事先明確準備的隔離快取／版本配置能使用既有的專案套件管理器，或在長流程前明確失敗；不得偷偷查詢 registry、下載新工具或修改主機全域預設。唯讀檢查本身不得代為啟用或安裝工具。

### Requirement: Secret-free acceptance subprocesses

完整驗證的子行程 SHALL 只接收明確列出的工具與測試設定，以及測試自身產生的假資料；SHALL NOT 繼承主機的 provider/API 金鑰或個人 HOME 設定。此隔離不得變更父 agent 的授權或主機全域設定，亦不得宣稱等同作業系統 sandbox。

#### Scenario: 主機存在額外憑證環境變數
- **WHEN** 父行程有額外的憑證變數，而驗證子行程啟動
- **THEN** 子行程不含這些變數，使用自己的 HOME／Paperclip 設定目錄，仍能取得明確配置的必要工具；驗證只用 sentinel 證明隔離，不讀取或輸出真實秘密

### Requirement: Complete and auditable acceptance coverage

完整驗收 SHALL 綁定不可變程式碼快照並覆蓋官方完整測試選集。官方等價分組／分片可使用，但每個必要組均 SHALL 有退出結果與選集覆蓋證據；任何失敗、中止或未執行項目 SHALL 保留且不得稱為完整通過。

#### Scenario: 官方分組驗證
- **WHEN** 使用官方 chat、general server、native runner、workspaces 與 serialized 組完成完整測試
- **THEN** 選集聯集覆蓋完整入口，必要組無遺漏，每組退出碼為零，執行前後程式碼身分一致，報告可重現命令及既有 skips

#### Scenario: 先前失敗後修正
- **WHEN** 修正測試或環境後重新驗證
- **THEN** 報告同時保留先前失敗、修正原因與新結果，不用舊快照或單次窄範圍重跑冒充完整通過

#### Scenario: 前置回歸仍失敗
- **WHEN** 任一已知 blocker 在正式驗收快照上仍失敗
- **THEN** 不啟動已知會失敗的昂貴完整流程，先診斷修正，PR 保持 draft
