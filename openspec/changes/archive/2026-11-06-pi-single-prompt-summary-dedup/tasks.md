# Tasks

## 1. 工作分支與可審查規格

- [x] 1.1 查核目前 master 的型別、renderer 與 Pi prompt 入口，以及專案／scoped instructions；於驗證文件記錄承接點與實際驗證指令。
- [x] 1.2 將 doc/plans 下四份本次探索草稿標明被本 OpenSpec change 取代；建立獨立新分支，commit 正式規格及草稿來源說明，確認無無關檔案混入。
- [x] 1.3 推送至 heartpleasure101-stack/paperclip，在該 fork 以 master 為 base 建立 draft PR；依專案 PR template 填寫並記錄 URL，確認非官方上游 PR。

## 2. 單次摘要呈現

- [x] 2.1 在共用 renderer 增加預設關閉的窄 opt-in，完成嚴格相等去重；同時新增相同／不同／單份／空值／空白差異／特殊字元／截斷／metadata／輸入不變的回歸案例，對應 spec scenarios 並執行通過。
- [x] 2.2 保留唯一完整正文與歷史證據信任邊界，不全域替換；以新事件、來源、審批與相同文字獨立留言的案例驗證內容不遺漏，並記錄設計對照。
- [x] 2.3 僅由 Pi 在實際 prompt 建立入口啟用選項，加入新 session／接續／fresh retry 與非 Pi 預設不變的入口測試，執行相關 suites 通過。
- [x] 2.4 將同一 fixture 的策略關閉／開啟最終 prompt bytes、正文份數與必要事件完整性加入可重現測試或量測，於 doc/plans/2026-11-04-pi-summary-dedup-verification.md 附實際指令、輸出與回滾步驟，不宣稱未量測的 token 或費用節省。

## 3. 整合驗收與交付

- [x] 3.1 執行受影響 suites、型別檢查及專案要求的 PR-ready 全量檢查；於驗證文件保留所有失敗及環境限制，只有證據充分時標記完成，不隱藏失敗。
- [x] 3.2 由另一個全新 Pi Claude Sonnet 5.5 session 獨立核對 spec／tasks／實作與回歸證據，記錄 findings；修正問題並重新驗證，確認無未解重大問題。
- [x] 3.3 執行 OpenSpec strict validate 與 apply/status 檢查，確認 tracked tasks 有對應證據；commit 並 push 最終實作與驗證紀錄，更新 PR 的實際結果及限制。

## Workflow follow-up

- 驗證合格且 tracked tasks 全部完成後，依 OpenSpec archive 指令封存並同步 main spec，再 strict validate 封存結果。
- 封存與交付紀錄另行 commit、push，更新同一 PR。僅在驗收完整時移除 draft；否則保留 draft 並回報 blocker。
- 不自動 merge、部署或進入第二階段；不刪其他分支。
