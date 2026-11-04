# Pi 摘要按需交接：第二階段（c2.1、c2.6）

## 1. 授權與範圍

使用者授權補齊 c2.1 的變動摘要處理及 c2.6 的 Pi 壓縮後承接。繼續使用隔離 fork、測試、獨立 subagent 審查；不部署、不操作真實任務／憑證。Remote session（Pi 程序與 session 在另一執行環境）不在本階段實作。

## 2. c2.1：不靠摘要文字是否相同判斷

1. 新版 adapter checkpoint 綁定原任務、agent、session、run、實際輸入訊息及最終回覆，新增前版摘要與自身執行結果的版本化雜湊。
2. Server 在每次 wake 根據目前文件 revision、前一 revision、真實 run 與 agent 資料，重新呼叫同一個摘要產生器。
3. 只有精確重建等於目前摘要，且來源為同公司／任務／agent 的成功 run、前版與結果均匹配 checkpoint，才給 adapter 來源驗證結果。
4. 不信任摘要正文內的 run ID 或呼叫者可設定的 changeSummary。
5. 正常完成後任務因留言重開會改變 status；重建可嘗試已知有限的任務 status 值，但目標、title、priority、agent 與真實 run 結果仍需匹配，不能用文字模糊比對。
6. 外部改寫、前版插入、其他 agent、遮罩差異、舊版 checkpoint 或來源不明，不省略唯一內容，走 c2.7。
7. 真實 wake 會將第二處摘要截為 4,000 字；只有帶截斷旗標且精確等於完整正文前綴時，才視為同來源副本。Checkpoint 用已交付的完整 completedWork，不用截斷副本。
8. 不再掃描使用者訊息中的 Markdown fence 作覆蓋證據，避免任務描述偽造 company／issue／completedWork；精確重用也必須匹配 v2 checkpoint。

## 3. c2.6：承接 Pi 原生壓縮，不假稱無損

1. 只檢查有效 parent 分支，驗證 session header、ID 唯一、父鏈無缺漏循環及壓縮保留邊界。
2. 來源仍在原文時直接驗證；來源在被摘要祖先時，確認它由有效的 Pi 原生 compaction 鏈承接。
3. 只信任已知 Pi version 3 的原生摘要格式；空／無效摘要、未知 context_edit、自訂 fromHook 壓縮、斷鏈等回 c2.7。
4. 此證據代表「由 Pi 原生摘要承接」，不代表逐字或語意無損。需要細節時仍由補取入口取原紀錄。
5. 摘要來源覆蓋與事件增量覆蓋分開。壓縮後若不能證明 server delta 的所有早期事件仍在，送完整 messages 快照，但不因此重貼已驗證的工作摘要。
6. Fresh fallback 仍重新組裝完整背景；其他 adapter 不啟用新策略。
7. Adapter 判定後、Pi 模型呼叫前仍會自動壓縮。新增每次 attempt 的暫存本機 extension，在 Pi 的 context hook 才決定是否補資料，封住此時序缺口；結束／重試後清理，不修改全域 Pi 設定。
8. 模型請求前發現新原生壓縮，補完整事件但不重貼已驗證摘要；作用中鏈含自訂壓縮、新 context_edit 或無法驗證的壓縮，連摘要一起補回。
9. 請求級修復不寫入 session 歷史、不累積副本；保留 hook 已有的較新訊息，亦恢復本輪抵達但已被壓縮的人類訊息，不重播 tool calls。
10. 這是信任 Pi 原生壓縮承接的方案；無法證明對話的每個細節永不遺失，亦不涵蓋任意第三方 extension 重新改寫或過濾最終模型請求。

## 4. 測試清單（沿用已確認案例並具體化）

1. 自身前輪新生成摘要、任務 done→in_progress 重開：驗證通過可省略。
2. 人工／agent 偽造 changeSummary、不同 run／agent／公司、前版或回覆雜湊不符：不省略。
3. 當前目標或正文變更、遮罩／截斷差異：不誤刪獨有內容。
4. 原生 compaction 前後、多次壓縮、被摘要的 checkpoint、無關分支壓縮：有效分支判定正確。
5. 非原生、空摘要、無效邊界、斷鏈、重複 ID、context_edit：保守補背景。
6. 壓縮後省略已驗證摘要時，完整 events 仍到達。
7. Adapter/codec round-trip 與 server 來源驗證到實際 prompt 的整合測試。
8. 既有 Pi、共用 renderer 測試不回歸；獨立 reviewer 修正後重跑。

## 5. 交付判準

1. 明確區分已完成、保守退回及未做的線上測試；不以通過測試數冒充全部完成。
2. 記錄實際改檔、測試退出碼、來源驗證假設、原生壓縮信任取捨。
3. 不修改舊報告的歷史測試結果；新增第二階段報告與結果。

## 6. 實作驗證結果

1. 主 agent 與最終獨立 subagent 均執行相關測試：12 檔、234 項通過，exit 0。
2. Pi adapter、adapter-utils、shared 與 server 的直接 TypeScript 檢查均為 exit 0。Server 初次缺少 SDK／runner 型別產物；建置 shared、eval-kernel、SDK、runner 的 TypeScript 產物後重跑已通過，並非以忽略錯誤方式通過。
3. 審查發現的巢狀 fence 偽造、request 前壓縮時序、4k carrier 截斷、多次自訂→原生壓縮承接問題均已修正並補測試。
4. 未啟動真實 Pi／模型請求、未操作線上任務／權限、未部署；extension integration 使用實際產生的 JS 與模擬 context 事件驗證。完整 monorepo release build／全倉測試未執行。
5. 正常 own-run 新摘要與已知原生 compaction 已有實作路徑；未知、外部更新與不支援情境仍按 c2.7 保留背景。Remote session 留待另案。

