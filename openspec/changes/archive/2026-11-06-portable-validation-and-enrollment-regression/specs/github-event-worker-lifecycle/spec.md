# Spec Delta

## Purpose

明確記錄既有 GitHub 事件工作者在同一服務實例中承接註冊身分與事件的契約，確保真實持久化、經驗證的事件確認、身分移除與替換均正確，並以可重現的隔離依賴驗證，而非依賴主機時間巧合。

## ADDED Requirements

### Requirement: Enrollment activates the existing worker

已啟動但尚未註冊的工作者 SHALL 能在完成註冊與有效喚醒後處理經驗證的事件，不要求重建工作者。事件 SHALL 在相應公司資料持久化成功後才確認。

#### Scenario: 同一工作者從未註冊狀態啟用
- **WHEN** 同一工作者完成有效註冊，收到簽名與加密驗證通過且屬於其 binding 的事件
- **THEN** 使用目前身分租用事件，持久化 delivery 與預期 grant 狀態後確認事件，既有成功斷言維持

#### Scenario: 驗證或持久化失敗
- **WHEN** 事件驗證不通過或必要持久化未成功
- **THEN** 不以成功事件確認，不越過公司或 binding 邊界；保留既有拒絕／重試行為

### Requirement: Identity replacement and quiet periods

工作者 SHALL 在身分移除後停止使用該身分；重新註冊後使用新身分而非快取舊憑證。無新工作及已知 debt 時 SHALL 維持安靜，不新增固定輪詢以讓測試通過。

#### Scenario: 身分移除及重新註冊
- **WHEN** 原身分移除，之後同一服務完成另一個有效註冊並喚醒
- **THEN** 移除期間不繼續以舊身分租用事件，重新啟用後只以新身分處理與確認後續事件

#### Scenario: 空閒期
- **WHEN** 事件及已知一次性 follow-up 已完成，推進原案例涵蓋的 25 分鐘虛擬時間
- **THEN** 無額外 SQL、HTTP 或活躍工作，未以持續輪詢掩蓋排程或測試問題

### Requirement: Faithful asynchronous lifecycle verification

生命週期驗證 SHALL 保留真實 PostgreSQL 與本機簽名／加密 Cloud 替身，並以有界方式協調非同步 I/O 與測試時間。SHALL NOT 移除確認、身分、安全或安靜期斷言，亦不得只延長等待就宣稱根因已解決。

#### Scenario: 受控延遲或時鐘交錯
- **WHEN** 本機替身的 HTTP／資料庫回應延遲，或虛擬時鐘與真實 I/O 不同時完成
- **THEN** 案例仍能在明確上限內驗證真正的事件生命週期，失敗時暴露排程、處理或傳輸階段的具體證據，清理所有自有資源
