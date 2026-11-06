# Spec Delta

## Purpose

確保 Paperclip 交付給 Pi 的單次任務輸入不重複呈現完全相同的工作摘要，同時保留來源與信任邊界，避免將減少重複文字誤當成刪除工作紀錄或跨輪背景，並維持其他 adapter 的既有行為。

## ADDED Requirements

### Requirement: Exact duplicate summary rendering

Pi 輸入組裝 SHALL 在同次輸入的兩份非空摘要正文嚴格相等、且唯一保留位置可完整呈現正文時，只呈現一份正文。此行為 SHALL NOT 取決於是否沿用 session。

#### Scenario: 完全相同摘要
- **WHEN** 同次 Pi 輸入的兩份非空摘要正文完全相同且可完整呈現
- **THEN** 最終輸入只含一份摘要正文，並保留必要的來源與信任資訊

#### Scenario: 不同正文
- **WHEN** 兩份摘要正文有任一差異，包括空白、換行或大小寫
- **THEN** 系統保留兩份，不作模糊或語意去重

#### Scenario: 單份或沒有摘要
- **WHEN** 輸入只有一份摘要或沒有摘要
- **THEN** 既有呈現行為不變，不移除唯一摘要或捏造摘要

#### Scenario: 不明格式或不完整呈現
- **WHEN** 正文為空、格式未知或無法確認保留位置會完整呈現正文
- **THEN** 系統不嘗試去重，維持既有輸出

#### Scenario: 不同 session 路徑
- **WHEN** 新 session、正常接續或接續失敗後的 fresh attempt 組裝輸入
- **THEN** 各次僅去除本次的完全相同副本，不因 session 狀態省略唯一摘要

### Requirement: Preserve evidence and unrelated content

去重 SHALL 保留摘要來源、修訂、截斷資訊與歷史證據不等於指令或批准的信任邊界。系統 SHALL NOT 改寫輸入物件、持久化紀錄或同次其他資訊。

#### Scenario: 摘要 metadata 與信任邊界
- **WHEN** 完全相同的摘要帶有來源或截斷資訊
- **THEN** 唯一正文及必要 metadata 保留，且仍被標記為不可信歷史證據，不能覆蓋人類決策或批准界線

#### Scenario: 新事件完整
- **WHEN** 輸入同時包含新留言、審批、狀態與其他 agent 成果
- **THEN** 這些資訊不因摘要去重被刪除或改寫

#### Scenario: 其他區塊文字恰巧相同
- **WHEN** 相同摘要文字也出現在留言或工具紀錄中
- **THEN** 系統不以全域字串替換刪除這些獨立紀錄

#### Scenario: 特殊字元與原始資料
- **WHEN** 摘要包含中文、引號、編碼或控制字元，並經輸入組裝處理
- **THEN** 比較使用正確階段的原文字串，輸出遵循既有安全編碼，原始輸入物件及紀錄未被改寫

### Requirement: Non-Pi compatibility

去重策略 SHALL 僅由 Pi 啟用；未啟用策略的共用輸入組裝及其他 adapter SHALL 保持既有輸出。

#### Scenario: 策略未啟用
- **WHEN** 既有消費者未明確啟用去重策略
- **THEN** 輸出與原行為一致，包括原本的摘要呈現

#### Scenario: 非 Pi adapter
- **WHEN** 非 Pi adapter 使用共用輸入組裝
- **THEN** 不啟用此策略，既有行為不變
